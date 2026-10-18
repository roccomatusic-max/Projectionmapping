"""Projector Control as an always-on service on a Mac.

Opening ``Projector Control.app`` is the whole install. The first time, it

1. copies itself into /Applications (or ~/Applications without admin rights),
2. asks for the Mac's password once and registers a launchd service that
   starts the server when the Mac boots, before anyone logs in, restarts it
   if it ever stops, and runs it with ``--lan`` so mini PCs and the phone
   remote can reach it,
3. waits for the server and opens the dashboard, showing the first-run
   administrator password if there is one.

Opening it again just opens the dashboard. Opening a newer download installs
that version over the old one. Updates from GitHub replace the bundle in
place and restart the service; see :mod:`app.services.updates`.
"""

from __future__ import annotations

import contextlib
import getpass
import os
import plistlib
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from app.paths import FIRST_RUN_PASSWORD

LABEL = "com.projectorcontrol.server"
APP_NAME = "Projector Control.app"
EXECUTABLE = "ProjectorControl"
SERVICE_PLIST = Path("/Library/LaunchDaemons") / f"{LABEL}.plist"
PORT = 8765
#: Set in the service definition; tells the server it is the managed copy.
SERVICE_ENV = "PROJECTOR_CONTROL_SERVICE"


# -- where things are -------------------------------------------------------

def running_bundle(executable: str | None = None) -> Path | None:
    """The ``.app`` this process runs from, or None outside an app bundle."""
    exe = Path(executable or sys.executable).resolve()
    parents = exe.parents
    if len(parents) > 2 and parents[0].name == "MacOS" and parents[1].name == "Contents" \
            and parents[2].suffix == ".app":
        return parents[2]
    return None


def install_target() -> Path:
    """/Applications when this account may write there, else ~/Applications."""
    system = Path("/Applications")
    if os.access(system, os.W_OK):
        return system / APP_NAME
    personal = Path.home() / "Applications"
    personal.mkdir(exist_ok=True)
    return personal / APP_NAME


def bundle_executable(bundle: Path) -> Path:
    return bundle / "Contents" / "MacOS" / EXECUTABLE


def bundle_version(bundle: Path) -> str:
    try:
        with (bundle / "Contents" / "Info.plist").open("rb") as handle:
            return str(plistlib.load(handle).get("CFBundleShortVersionString") or "dev")
    except (OSError, plistlib.InvalidFileException):
        return "dev"


def version_key(version: str) -> tuple[int, ...]:
    """``1.0.42`` -> (1, 0, 42); anything unparseable sorts as oldest."""
    try:
        return tuple(int(part) for part in version.strip().lstrip("v").split("."))
    except ValueError:
        return (0,)


def pid_file(folder: Path) -> Path:
    return folder / "server.pid"


# -- the launchd service ----------------------------------------------------

def service_definition(bundle: Path, folder: Path, user: str, home: str) -> dict:
    """The launchd job: a system daemon that runs as this user.

    A daemon (not a login item) so it starts at boot with nobody logged in.
    ``UserName`` keeps it in this account's data folder and files. KeepAlive
    restarts it whatever the reason it stopped; ThrottleInterval keeps a
    crash loop from spinning.
    """
    log = str(folder / "logs" / "service.log")
    return {
        "Label": LABEL,
        "ProgramArguments": [
            str(bundle_executable(bundle)), "--serve", "--lan", "--no-browser",
            "--port", str(PORT), "--data-dir", str(folder),
        ],
        "UserName": user,
        "EnvironmentVariables": {"HOME": home, SERVICE_ENV: "1"},
        "WorkingDirectory": str(folder),
        "RunAtLoad": True,
        "KeepAlive": True,
        "ThrottleInterval": 10,
        # The update watcher outlives the server it replaces.
        "AbandonProcessGroup": True,
        "ProcessType": "Interactive",
        "StandardOutPath": log,
        "StandardErrorPath": log,
    }


def installed_definition() -> dict | None:
    try:
        with SERVICE_PLIST.open("rb") as handle:
            return plistlib.load(handle)
    except (OSError, plistlib.InvalidFileException):
        return None


INSTALL_SCRIPT = f"""#!/bin/bash
set -e
install -m 644 -o root -g wheel "$1" "{SERVICE_PLIST}"
launchctl bootout system/{LABEL} 2>/dev/null || true
# Before bootstrap: launchd refuses to load a job that was disabled.
launchctl enable system/{LABEL}
# bootout returns before the old job is fully gone; retry briefly.
for i in 1 2 3 4 5 6 7 8 9 10; do
  launchctl bootstrap system "{SERVICE_PLIST}" && break
  sleep 1
done
launchctl kickstart system/{LABEL} || true
"""

UNINSTALL_SCRIPT = f"""#!/bin/bash
launchctl bootout system/{LABEL} 2>/dev/null || true
rm -f "{SERVICE_PLIST}"
"""


def run_as_admin(script: str, prompt: str, *args: str) -> bool:
    """Run a shell script as root behind the standard macOS password dialog."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "step.sh"
        path.write_text(script, encoding="utf-8")
        command = "/bin/bash " + " ".join(f"'{a}'" for a in (str(path), *args))
        result = subprocess.run(
            ["osascript",
             "-e", "on run argv",
             "-e", "do shell script (item 1 of argv) with prompt (item 2 of argv) "
                   "with administrator privileges",
             "-e", "end run",
             command, prompt],
            capture_output=True, text=True, check=False,
        )
    return result.returncode == 0


def register_service(definition: dict) -> bool:
    with tempfile.TemporaryDirectory() as tmp:
        staged = Path(tmp) / f"{LABEL}.plist"
        with staged.open("wb") as handle:
            plistlib.dump(definition, handle)
        staged.chmod(0o644)
        return run_as_admin(
            INSTALL_SCRIPT,
            "Projector Control needs your password once so it can start by "
            "itself whenever this Mac turns on.",
            str(staged),
        )


def is_server(pid: int) -> bool:
    """Whether ``pid`` is Projector Control, not another program that reused the number.

    The pid file outlives the server: after a reboot without it, the number
    can belong to anything.
    """
    probe = subprocess.run(["ps", "-p", str(pid), "-o", "command="],
                           capture_output=True, text=True, check=False)
    return EXECUTABLE in probe.stdout


def restart_server(folder: Path) -> None:
    """Stop the running server; launchd starts it again from the bundle on disk."""
    with contextlib.suppress(OSError, ValueError):
        pid = int(pid_file(folder).read_text().strip())
        if is_server(pid):
            os.kill(pid, signal.SIGTERM)


# -- copying the app into place ---------------------------------------------

def replace_bundle(source: Path, target: Path) -> None:
    """Put a copy of ``source`` at ``target``, swapping out any older copy.

    ``ditto --noextattr --noqtn`` drops the download quarantine, so the
    installed copy never needs another Gatekeeper approval, and so the
    service can start it at boot.
    """
    staging = target.with_name(".Projector Control.installing.app")
    previous = target.with_name(".Projector Control.previous.app")
    for leftover in (staging, previous):
        shutil.rmtree(leftover, ignore_errors=True)
    subprocess.run(["ditto", "--noextattr", "--noqtn", str(source), str(staging)], check=True)
    if target.exists():
        target.rename(previous)
    staging.rename(target)
    shutil.rmtree(previous, ignore_errors=True)


# -- talking to the person ---------------------------------------------------

def dialog(message: str, *, error: bool = False) -> None:
    icon = "stop" if error else "note"
    subprocess.run(
        ["osascript",
         "-e", "on run argv",
         "-e", "activate",
         "-e", f'display dialog (item 1 of argv) with title "Projector Control" '
               f'buttons {{"OK"}} default button 1 with icon {icon}',
         "-e", "end run",
         message],
        capture_output=True, check=False,
    )


def notify(message: str) -> None:
    subprocess.run(
        ["osascript", "-e", "on run argv",
         "-e", 'display notification (item 1 of argv) with title "Projector Control"',
         "-e", "end run", message],
        capture_output=True, check=False,
    )


def server_version(expected: str, port: int = PORT, timeout: float = 90.0) -> str | None:
    """Wait for the server to answer with ``expected``; return the version it last gave.

    A different answer for the whole wait means some other copy holds the
    port, most often one started by hand from Terminal.
    """
    import json

    answered = None
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=2) as r:  # noqa: S310
                answered = str(json.load(r).get("version") or "dev")
                if answered == expected:
                    return answered
        except Exception:  # noqa: BLE001 - not up yet
            pass
        time.sleep(1)
    return answered


def first_run_credentials(folder: Path) -> str | None:
    marker = folder / FIRST_RUN_PASSWORD
    with contextlib.suppress(OSError):
        for line in marker.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("password:"):
                return line.split(":", 1)[1].strip()
    return None


# -- entry points -------------------------------------------------------------

def launch(folder: Path) -> int:
    """What happens when someone double-clicks the app."""
    bundle = running_bundle()
    if bundle is None:
        return 1
    target = install_target()
    logs = folder / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    # Created here so the file belongs to this account, not to launchd.
    (logs / "service.log").touch()

    copied = False
    if bundle.resolve() != target.resolve():
        installed = bundle_version(target) if target.exists() else None
        if installed is None or version_key(bundle_version(bundle)) >= version_key(installed):
            try:
                replace_bundle(bundle, target)
            except (OSError, subprocess.CalledProcessError) as exc:
                dialog(
                    f"Projector Control could not copy itself into {target.parent}.\n\n{exc}\n\n"
                    "If macOS asked about App Management, allow it in System Settings → "
                    "Privacy & Security → App Management, then open the app again.",
                    error=True,
                )
                return 1
            copied = True

    wanted = service_definition(target, folder, getpass.getuser(), str(Path.home()))
    current = installed_definition()
    first_install = current is None
    if current != wanted:
        if not register_service(wanted):
            dialog(
                "Projector Control was not set up to start by itself, because the "
                "password step was cancelled. Open the app again to retry.",
                error=True,
            )
            return 1
    elif copied:
        restart_server(folder)
        time.sleep(2)

    notify("Starting Projector Control…")
    expected = bundle_version(target)
    answered = server_version(expected)
    if answered is None:
        dialog(
            "Projector Control is installed but the server has not answered yet.\n\n"
            f"Its log is in {logs}. Open the app again in a minute to retry. If it "
            "still does not answer, check that ProjectorControl is switched on in "
            "System Settings → General → Login Items, under Allow in the Background.",
            error=True,
        )
        return 1
    if answered != expected:
        dialog(
            f"Another copy of Projector Control (version {answered}) is using port {PORT}, "
            "so the installed one cannot start. It is usually one started from Terminal: "
            "find that Terminal window, press Control-C and close it. The installed copy "
            "then starts by itself within a few seconds.",
            error=True,
        )
        subprocess.run(["open", f"http://127.0.0.1:{PORT}/"], check=False)
        return 1

    password = first_run_credentials(folder)
    if first_install or copied or password:
        lines = [
            "Projector Control is running on this Mac.",
            "It starts by itself whenever the Mac turns on and restarts itself if it "
            "ever stops. You can close this; open the app any time to get to the dashboard.",
        ]
        if password:
            lines += ["", "First sign-in:", "    username: admin", f"    password: {password}",
                      "", "Change the password under Settings after you sign in."]
        dialog("\n".join(lines))
    subprocess.run(["open", f"http://127.0.0.1:{PORT}/"], check=False)
    return 0


def uninstall() -> int:
    """Stop the service and remove it. Leaves the app and all data in place."""
    ok = run_as_admin(UNINSTALL_SCRIPT, "Projector Control needs your password to stop "
                                        "starting by itself.")
    print("Projector Control no longer starts by itself." if ok else "Cancelled.")
    return 0 if ok else 1


def keep_awake() -> None:
    """Stop the Mac from sleeping while the server runs (the display still may)."""
    with contextlib.suppress(OSError):
        subprocess.Popen(["caffeinate", "-i", "-s", "-w", str(os.getpid())])  # noqa: S603, S607
