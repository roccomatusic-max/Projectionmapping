"""Updates for the Mac app, from the project's GitHub release.

Every merge to the default branch publishes a new build to the ``mac-latest``
release (``.github/workflows/mac.yml``). The installed Mac service checks it
when an administrator opens Settings, and installs it on request:

1. download the zip for this Mac's chip and unpack it beside the data folder,
2. check the new copy runs (``--version``),
3. swap it in for the installed bundle, keeping the old one beside it,
4. hand over to a small detached watcher and stop; launchd starts the new
   version. If it has not answered with its new version number within two
   minutes, the watcher puts the old copy back and restarts that.

The repository is private, so reading its releases needs a GitHub access key
with read-only access to its contents. It is kept in the data folder, readable
only by this account.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import platform
import re
import shutil
import signal
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx

from app import macservice
from app.paths import app_version

log = logging.getLogger(__name__)

REPOSITORY = os.environ.get("UPDATE_REPOSITORY", "roccomatusic-max/Projectionmapping")
RELEASE_TAG = "mac-latest"
ASSETS = {
    "arm64": "ProjectorControl-Mac-AppleSilicon.zip",
    "x86_64": "ProjectorControl-Mac-Intel.zip",
}
CHECK_EVERY = timedelta(minutes=15)
VERSION_RE = re.compile(r"\b(\d+\.\d+\.\d+)\b")

WATCH_SCRIPT = r"""#!/bin/bash
# Detached from the server it replaced: confirm the new version came up,
# otherwise put the previous copy back and let launchd start that instead.
BUNDLE=$1 PREVIOUS=$2 VERSION=$3 PORT=$4 PIDFILE=$5 RESULT=$6
for i in $(seq 1 120); do
  sleep 1
  if curl -sf --max-time 2 "http://127.0.0.1:$PORT/api/health" | grep -q "\"version\":\"$VERSION\""; then
    rm -rf "$PREVIOUS"
    echo "installed $VERSION" > "$RESULT"
    exit 0
  fi
done
FAILED="${BUNDLE%.app}.failed.app"
rm -rf "$FAILED"
mv "$BUNDLE" "$FAILED" && mv "$PREVIOUS" "$BUNDLE"
PID=$(cat "$PIDFILE" 2>/dev/null)
if [ -n "$PID" ] && ps -p "$PID" -o comm= | grep -q ProjectorControl; then
  kill "$PID"
fi
echo "rolled-back $VERSION" > "$RESULT"
"""


class UpdateError(Exception):
    pass


class Updater:
    def __init__(self, folder: Path, bundle: Path | None, *, current: str | None = None,
                 machine: str | None = None, managed: bool | None = None) -> None:
        self.folder = folder
        self.bundle = bundle
        self.current = current or app_version()
        self.machine = machine or platform.machine()
        self.managed = (os.environ.get(macservice.SERVICE_ENV) == "1"
                        if managed is None else managed)
        self.latest: str | None = None
        self.asset_url: str | None = None
        self.checked_at: datetime | None = None
        self.error: str | None = None
        self.needs_key = False
        self.installing = False
        self._lock = asyncio.Lock()

    # -- files in the data folder -----------------------------------------

    @property
    def key_path(self) -> Path:
        return self.folder / "github-token"

    @property
    def work_dir(self) -> Path:
        return self.folder / "updates"

    @property
    def result_path(self) -> Path:
        return self.work_dir / "last-result.txt"

    def key(self) -> str | None:
        with contextlib.suppress(OSError):
            return self.key_path.read_text(encoding="utf-8").strip() or None
        return None

    def save_key(self, value: str) -> None:
        value = value.strip()
        if not value:
            with contextlib.suppress(FileNotFoundError):
                self.key_path.unlink()
        else:
            self.key_path.write_text(value, encoding="utf-8")
            with contextlib.suppress(OSError):
                self.key_path.chmod(0o600)
        self.checked_at = None

    # -- status ---------------------------------------------------------------

    @property
    def supported(self) -> bool:
        return sys.platform == "darwin" and self.bundle is not None and self.managed

    @property
    def available(self) -> bool:
        return bool(
            self.latest and self.asset_url
            and macservice.version_key(self.latest) > macservice.version_key(self.current)
        )

    def status(self) -> dict:
        last = None
        with contextlib.suppress(OSError):
            last = self.result_path.read_text(encoding="utf-8").strip() or None
        return {
            "supported": self.supported,
            "current": self.current,
            "latest": self.latest,
            "available": self.available,
            "needs_key": self.needs_key,
            "has_key": self.key() is not None,
            "checked_at": self.checked_at,
            "error": self.error,
            "installing": self.installing,
            "last_result": last,
            "repository": REPOSITORY,
        }

    def _headers(self, accept: str = "application/vnd.github+json") -> dict:
        headers = {"Accept": accept, "X-GitHub-Api-Version": "2022-11-28",
                   "User-Agent": "ProjectorControl-updater"}
        if key := self.key():
            headers["Authorization"] = f"Bearer {key}"
        return headers

    async def check(self, *, force: bool = False) -> dict:
        if not self.supported:
            return self.status()
        if not force and self.checked_at and datetime.now(UTC) - self.checked_at < CHECK_EVERY:
            return self.status()
        url = f"https://api.github.com/repos/{REPOSITORY}/releases/tags/{RELEASE_TAG}"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.get(url, headers=self._headers())
        except httpx.HTTPError as exc:
            self.error = f"Could not reach GitHub: {exc}"
            return self.status()
        self.checked_at = datetime.now(UTC)
        self.apply_release(response.status_code, response.json() if response.content else {})
        return self.status()

    def apply_release(self, status_code: int, release: dict) -> None:
        """Read a GitHub release response into this updater's state."""
        self.error = None
        self.needs_key = False
        if status_code in (401, 403):
            self.needs_key = True
            self.error = "GitHub did not accept the access key. Make a new one and paste it here."
            return
        if status_code == 404:
            # A private repository answers 404, not 403, without a key.
            if self.key() is None:
                self.needs_key = True
            else:
                self.error = ("No Mac release is published yet, or the access key cannot "
                              "see this repository.")
            return
        if status_code != 200:
            self.error = f"GitHub answered {status_code}."
            return
        match = VERSION_RE.search(release.get("name") or "")
        self.latest = match.group(1) if match else None
        wanted = ASSETS.get(self.machine)
        self.asset_url = next(
            (a.get("url") for a in release.get("assets", []) if a.get("name") == wanted), None
        )
        if self.latest is None or self.asset_url is None:
            self.error = "The latest release has no download for this Mac."

    # -- installing -----------------------------------------------------------

    async def install(self) -> dict:
        if not self.supported:
            raise UpdateError("Updates are only installed by the Mac app.")
        async with self._lock:
            await self.check(force=True)
            if not self.available:
                raise UpdateError(self.error or "Already up to date.")
            self.installing = True
            try:
                new_bundle = await self._download()
                await asyncio.to_thread(self._swap_in, new_bundle)
            except Exception:
                self.installing = False
                raise
        log.warning("update: installed %s over %s; restarting", self.latest, self.current)
        # Answer the request first, then stop gracefully; launchd starts the new copy.
        asyncio.get_running_loop().call_later(1.5, os.kill, os.getpid(), signal.SIGTERM)
        return self.status()

    async def _download(self) -> Path:
        shutil.rmtree(self.work_dir / "new", ignore_errors=True)
        self.work_dir.mkdir(parents=True, exist_ok=True)
        archive = self.work_dir / "download.zip"
        # httpx drops the Authorization header on the redirect to GitHub's file host.
        client = httpx.AsyncClient(timeout=httpx.Timeout(30, read=120), follow_redirects=True)
        headers = self._headers("application/octet-stream")
        async with client, client.stream("GET", self.asset_url, headers=headers) as r:
            if r.status_code != 200:
                raise UpdateError(f"Download failed: GitHub answered {r.status_code}.")
            with archive.open("wb") as handle:
                async for chunk in r.aiter_bytes(1 << 20):
                    handle.write(chunk)
        return await asyncio.to_thread(self._unpack, archive)

    def _unpack(self, archive: Path) -> Path:
        destination = self.work_dir / "new"
        subprocess.run(["ditto", "-x", "-k", str(archive), str(destination)], check=True)
        archive.unlink(missing_ok=True)
        bundle = destination / macservice.APP_NAME
        found = macservice.bundle_version(bundle)
        if found != self.latest:
            raise UpdateError(f"The download is version {found}, expected {self.latest}.")
        probe = subprocess.run([str(macservice.bundle_executable(bundle)), "--version"],
                               capture_output=True, text=True, timeout=60, check=False)
        if probe.returncode != 0:
            raise UpdateError("The new version did not start: " + (probe.stderr or "")[-300:])
        return bundle

    def _swap_in(self, new_bundle: Path) -> None:
        assert self.bundle is not None
        staging = self.bundle.with_name(".Projector Control.installing.app")
        previous = self.bundle.with_name(".Projector Control.previous.app")
        for leftover in (staging, previous, self.bundle.with_name(".Projector Control.failed.app")):
            shutil.rmtree(leftover, ignore_errors=True)
        shutil.move(str(new_bundle), str(staging))
        self.bundle.rename(previous)
        try:
            staging.rename(self.bundle)
        except OSError:
            previous.rename(self.bundle)
            raise
        script = self.work_dir / "watch-update.sh"
        script.write_text(WATCH_SCRIPT, encoding="utf-8")
        with contextlib.suppress(FileNotFoundError):
            self.result_path.unlink()
        subprocess.Popen(  # noqa: S603
            ["/bin/bash", str(script), str(self.bundle), str(previous), str(self.latest),
             os.environ.get("DESKTOP_PORT", str(macservice.PORT)),
             str(macservice.pid_file(self.folder)), str(self.result_path)],
            start_new_session=True, stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )


_updater: Updater | None = None


def get_updater() -> Updater:
    global _updater
    if _updater is None:
        folder = Path(os.environ.get("DESKTOP_DATA_DIR") or ".").expanduser()
        _updater = Updater(folder, macservice.running_bundle())
    return _updater
