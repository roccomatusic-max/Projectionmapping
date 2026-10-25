"""The Mini PC app updating itself, from the main server, without restarting Windows.

The app sends its version when it checks in. When the server has a newer
one and nothing is on (no show, no emergency stop, not near show time; see
backend/app/services/minipc_updates.py), its answer carries the update:

1. The first such answer starts the download of the installer from the
   server (not the internet), in the background. It is checked against the
   size and SHA-256 the server sent.
2. The next answer that still carries the update, with the download done,
   means "now". The app hands over to a small PowerShell script, leaves the
   output window open and quits. The projector keeps showing the player
   page, which talks to the server by itself, throughout.
3. The script runs the installer silently (/VERYSILENT /NORESTART, so
   never a Windows restart). The installer starts the new app, which takes
   over the open window instead of reopening it. Should the install fail,
   the script starts the installed app again, and that app tells the server
   what went wrong.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import logging
import subprocess
import sys
import threading
from pathlib import Path

import requests

log = logging.getLogger("minipc.update")

try:
    from _version import VERSION  # written by build.ps1
except ImportError:  # running from a checkout
    VERSION = "dev"

#: Smart App Control blocks unsigned installers before any of them runs.
APP_CONTROL_KEY = r"SYSTEM\CurrentControlSet\Control\CI\Policy"

RUNNER = r"""# Written by the Mini PC app (selfupdate.py) to install its own update.
param($Setup, $AppPid, $App, $Result, $Version)
$ErrorActionPreference = 'Continue'
# The app quits as soon as this has started; the output window stays open.
for ($i = 0; $i -lt 30; $i++) {
  if (-not (Get-Process -Id $AppPid -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Seconds 1
}
Stop-Process -Id $AppPid -Force -ErrorAction SilentlyContinue
$code = -1
$err = $null
try {
  # /NORESTART: the installer never restarts Windows.
  $run = Start-Process -FilePath $Setup -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/NOCANCEL') -PassThru
  $null = $run.Handle
  $run.WaitForExit()
  $code = $run.ExitCode
} catch {
  $err = $_.Exception.Message
}
Set-Content -LiteralPath $Result -Value (ConvertTo-Json @{ version = $Version; code = $code; error = $err }) -Encoding UTF8
Remove-Item -LiteralPath $Setup -Force -ErrorAction SilentlyContinue
# The installer starts the new app. If it did not (it failed, or Windows
# blocked it), start the copy that is installed, old or new.
for ($i = 0; $i -lt 30; $i++) {
  if (Get-Process -Name MiniPC -ErrorAction SilentlyContinue) { exit 0 }
  Start-Sleep -Seconds 1
}
Start-Process -FilePath $App
"""


def app_control_on() -> bool:
    """Smart App Control is on (Windows 11): an unsigned installer cannot run."""
    if sys.platform != "win32":
        return False
    import winreg

    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, APP_CONTROL_KEY) as key:
            return winreg.QueryValueEx(key, "VerifiedAndReputablePolicyState")[0] == 1
    except OSError:
        return False


def windows_reason(code: object, error: object) -> str:
    if error:
        text = str(error)
        if "Application Control" in text or "policy has blocked" in text:
            return ("Windows' Smart App Control blocked the installer; turn it off on this mini PC "
                    "(Windows Security > App & browser control > Smart App Control settings > Off)")
        return f"the installer could not start: {text[:200]}"
    return f"the installer stopped with code {code}"


class SelfUpdate:
    def __init__(self, folder: Path, version: str = VERSION) -> None:
        self.folder = folder / "updates"
        self.version = version
        #: What to tell the server: {"state": ..., "version": ..., "error": ...}.
        self.state: dict | None = None
        #: The checked installer, once downloaded.
        self.ready: tuple[str, Path] | None = None
        self._thread: threading.Thread | None = None
        self._read_result()

    # -- after an update ----------------------------------------------------

    @property
    def result_path(self) -> Path:
        return self.folder / "result.json"

    @property
    def window_path(self) -> Path:
        """Left by the app that handed over: the output window to keep."""
        return self.folder / "keep-window.json"

    def _read_result(self) -> None:
        try:
            result = json.loads(self.result_path.read_text(encoding="utf-8-sig"))
        except (OSError, ValueError):
            return
        with contextlib.suppress(OSError):
            self.result_path.unlink()
        if not isinstance(result, dict):
            return
        wanted = str(result.get("version") or "")
        if wanted == self.version:
            log.info("updated to %s", self.version)
            return
        why = (windows_reason(result.get("code"), result.get("error"))
               if result.get("code") != 0 or result.get("error")
               else f"the installer finished, but this is still version {self.version}")
        log.error("the update to %s did not install: %s", wanted, why)
        self.state = {"state": "failed", "version": wanted, "error": why}

    def take_window(self) -> str | None:
        """The server address the open output window was started for, once."""
        try:
            origin = json.loads(self.window_path.read_text(encoding="utf-8")).get("origin")
        except (OSError, ValueError, AttributeError):
            return None
        with contextlib.suppress(OSError):
            self.window_path.unlink()
        return origin if isinstance(origin, str) else None

    # -- an update offered --------------------------------------------------

    def report(self) -> dict | None:
        return dict(self.state) if self.state else None

    def offered(self, offer: dict, server: str) -> bool:
        """Act on the server's answer. True when it is time to hand over."""
        try:
            version, sha256, size = str(offer["version"]), str(offer["sha256"]), int(offer["size"])
            url = str(offer["url"])
        except (KeyError, TypeError, ValueError):
            return False
        if version == self.version:
            return False
        if self.ready and self.ready[0] == version:
            return True
        if self._thread is not None and self._thread.is_alive():
            return False
        self.state = {"state": "downloading", "version": version}
        self._thread = threading.Thread(target=self._download, name="update-download", daemon=True,
                                        args=(f"{server}{url}", version, sha256, size))
        self._thread.start()
        return False

    def _download(self, url: str, version: str, sha256: str, size: int) -> None:
        self.folder.mkdir(parents=True, exist_ok=True)
        target = self.folder / f"MiniPC-Setup-{version}.exe"
        partial = target.with_name(target.name + ".part")
        digest = hashlib.sha256()
        got = 0
        try:
            with requests.get(url, stream=True, timeout=30) as response:
                response.raise_for_status()
                with partial.open("wb") as handle:
                    for chunk in response.iter_content(1 << 20):
                        got += len(chunk)
                        if got > size:
                            break
                        digest.update(chunk)
                        handle.write(chunk)
            if got != size or digest.hexdigest() != sha256:
                raise ValueError("the download did not match its checksum")
            partial.replace(target)
        except (requests.RequestException, OSError, ValueError) as exc:
            with contextlib.suppress(OSError):
                partial.unlink()
            log.warning("downloading the update to %s failed: %s", version, exc)
            self.state = {"state": "failed", "version": version,
                          "error": f"the download from the main server failed: {exc}"[:300]}
            return
        for old in self.folder.glob("MiniPC-Setup-*.exe"):
            if old != target:
                with contextlib.suppress(OSError):
                    old.unlink()
        log.info("downloaded the update to %s", version)
        self.ready = (version, target)
        self.state = {"state": "ready", "version": version}

    def hand_over(self, window_origin: str | None) -> bool:
        """Start the script that installs the update. True when the app should quit now."""
        if self.ready is None:
            return False
        version, setup = self.ready
        if sys.platform != "win32":
            log.warning("update %s downloaded; only the Windows app installs itself", version)
            return False
        if app_control_on():
            self.ready = None
            self.state = {"state": "failed", "version": version,
                          "error": windows_reason(None, "Application Control")}
            log.error("Smart App Control is on: the update cannot be installed")
            return False
        script = self.folder / "install-update.ps1"
        script.write_text(RUNNER, encoding="utf-8")
        with contextlib.suppress(OSError):
            self.result_path.unlink()
        self.window_path.write_text(json.dumps({"origin": window_origin}), encoding="utf-8")
        import os

        command = ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
                   "-File", str(script), "-Setup", str(setup), "-AppPid", str(os.getpid()),
                   "-App", sys.executable, "-Result", str(self.result_path), "-Version", version]
        # A hidden console of its own and its own process group, so it
        # outlives this app, which it is about to replace.
        detached = 0x08000000 | 0x00000200  # CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
        breakaway = 0x01000000  # CREATE_BREAKAWAY_FROM_JOB
        options = {"stdin": subprocess.DEVNULL, "stdout": subprocess.DEVNULL,
                   "stderr": subprocess.DEVNULL, "close_fds": True}
        try:
            try:
                subprocess.Popen(command, creationflags=detached | breakaway, **options)  # noqa: S603
            except OSError:
                subprocess.Popen(command, creationflags=detached, **options)  # noqa: S603
        except OSError as exc:
            with contextlib.suppress(OSError):
                self.window_path.unlink()
            self.ready = None
            self.state = {"state": "failed", "version": version,
                          "error": f"could not start the installer: {exc}"[:300]}
            log.error("could not start the update: %s", exc)
            return False
        log.warning("installing the update to %s; the app restarts in a moment, "
                    "the output window stays open", version)
        return True
