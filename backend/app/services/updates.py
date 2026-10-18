"""Updates for the Mac app, from the project's GitHub release.

Every merge to the default branch publishes a new build to the ``mac-latest``
release (``.github/workflows/mac.yml``). The installed Mac service checks it
when an administrator opens Settings, and installs it on request or by itself
(below):

1. download the zip for this Mac's chip and unpack it beside the data folder,
2. check the new copy runs (``--version``),
3. swap it in for the installed bundle, keeping the old one beside it,
4. hand over to a small detached watcher and stop; launchd starts the new
   version. If it has not answered with its new version number within two
   minutes, the watcher puts the old copy back and restarts that.

The repository is public, so no GitHub key is needed. Should it ever be made
private, the panel asks for a read-only access key, kept in the data folder
and readable only by this account.

Automatic updates (on unless switched off in Settings) check every 15 minutes
and install only while the system is quiet: no mapping show playing, paused
or blacked out, no automation running, and no projector command sent in the
last 10 minutes. A version that was rolled back is never retried automatically.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
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
AUTO_EVERY = 15 * 60
#: How long since the last projector command before the system counts as quiet.
QUIET_FOR = timedelta(minutes=10)
VERSION_RE = re.compile(r"\b(\d+\.\d+\.\d+)\b")

WATCH_SCRIPT = r"""#!/bin/bash
# Detached from the server it replaced: confirm the new version came up,
# otherwise put the previous copy back and let launchd start that instead.
BUNDLE=$1 PREVIOUS=$2 VERSION=$3 PORT=$4 PIDFILE=$5 RESULT=$6 FAILED=$7
for i in $(seq 1 120); do
  sleep 1
  if curl -sf --max-time 2 "http://127.0.0.1:$PORT/api/health" | grep -q "\"version\":\"$VERSION\""; then
    rm -rf "$PREVIOUS"
    echo "installed $VERSION" > "$RESULT"
    exit 0
  fi
done
rm -rf "$FAILED"
mv "$BUNDLE" "$FAILED" && mv "$PREVIOUS" "$BUNDLE"
PID=$(cat "$PIDFILE" 2>/dev/null)
if [ -n "$PID" ] && ps -p "$PID" -o comm= | grep -q ProjectorControl; then
  kill "$PID"
  # launchd starts the old copy only once this one has exited; one stuck in
  # start-up may never stop on a polite request.
  for i in $(seq 1 30); do kill -0 "$PID" 2>/dev/null || break; sleep 1; done
  kill -0 "$PID" 2>/dev/null && kill -9 "$PID"
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
        #: Why an automatic install is waiting, for the Settings panel.
        self.waiting: str | None = None
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

    @property
    def auto_path(self) -> Path:
        return self.work_dir / "auto.json"

    @property
    def auto(self) -> bool:
        try:
            return bool(json.loads(self.auto_path.read_text(encoding="utf-8"))["enabled"])
        except (OSError, ValueError, KeyError, TypeError):
            return True

    def set_auto(self, enabled: bool) -> None:
        self.work_dir.mkdir(parents=True, exist_ok=True)
        self.auto_path.write_text(json.dumps({"enabled": enabled}), encoding="utf-8")
        if not enabled:
            self.waiting = None

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

    def last_result(self) -> str | None:
        with contextlib.suppress(OSError):
            return self.result_path.read_text(encoding="utf-8").strip() or None
        return None

    def status(self) -> dict:
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
            "last_result": self.last_result(),
            "auto": self.auto,
            "waiting": self.waiting if self.auto and self.available else None,
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
        public = False
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.get(url, headers=self._headers())
                if response.status_code == 404 and self.key() is None:
                    # A public repository between releases (each merge deletes and
                    # republishes mac-latest) also answers 404; it needs no key.
                    probe = await client.get(f"https://api.github.com/repos/{REPOSITORY}",
                                             headers=self._headers())
                    public = probe.status_code == 200
        except httpx.HTTPError as exc:
            self.error = f"Could not reach GitHub: {exc}"
            self.latest = self.asset_url = None
            return self.status()
        self.checked_at = datetime.now(UTC)
        try:
            release = response.json() if response.content else {}
        except ValueError:  # an error page from GitHub or a proxy, not JSON
            release = {}
        # Unauthenticated checks are limited to 60 an hour per network address.
        rate_limited = response.status_code == 429 or (
            response.status_code == 403
            and (response.headers.get("x-ratelimit-remaining") == "0"
                 or "retry-after" in response.headers)
        )
        self.apply_release(response.status_code, release if isinstance(release, dict) else {},
                           rate_limited=rate_limited, public=public)
        return self.status()

    def apply_release(self, status_code: int, release: dict, *, rate_limited: bool = False,
                      public: bool = False) -> None:
        """Read a GitHub release response into this updater's state."""
        self.error = None
        self.needs_key = False
        if status_code != 200:
            # Nothing may be installed from an earlier answer: its download may be gone.
            self.latest = self.asset_url = None
        if rate_limited:
            self.error = ("GitHub is limiting update checks from this network for now. "
                          "It checks again by itself later.")
            return
        if status_code in (401, 403):
            self.needs_key = True
            self.error = "GitHub did not accept the access key. Make a new one and paste it here."
            return
        if status_code == 404:
            # A private repository answers 404, not 403, without a key.
            if public:
                self.error = ("No Mac release is published right now; a new one may be "
                              "uploading. It checks again by itself.")
            elif self.key() is None:
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
            # Stays set until the restart: a second install would delete the
            # copy the watcher needs to roll back to.
            if self.installing:
                raise UpdateError("An update is already being installed.")
            await self.check(force=True)
            if not self.available:
                raise UpdateError(self.error or "Already up to date.")
            self.installing = True
            try:
                new_bundle = await self._download()
                await asyncio.to_thread(self._swap_in, new_bundle)
            except UpdateError:
                self.installing = False
                raise
            except (httpx.HTTPError, OSError, subprocess.SubprocessError) as exc:
                # A dropped download, a full disk, a refused move in /Applications.
                self.installing = False
                log.exception("update: installing %s failed", self.latest)
                raise UpdateError(
                    f"The update could not be installed: {str(exc) or type(exc).__name__}"
                ) from exc
            except Exception:
                self.installing = False
                raise
        log.warning("update: installed %s over %s; restarting", self.latest, self.current)
        # Answer the request first, then stop gracefully; launchd starts the new copy.
        asyncio.get_running_loop().call_later(1.5, os.kill, os.getpid(), signal.SIGTERM)
        return self.status()

    async def auto_tick(self, quiet_check) -> None:
        """One automatic round: install the latest version if the system is quiet."""
        if not (self.supported and self.auto) or self.installing:
            return
        await self.check(force=True)
        if not self.available:
            self.waiting = None
            return
        if self.last_result() == f"rolled-back {self.latest}":
            self.waiting = f"{self.latest} did not start last time; press Install to retry it"
            return
        reason = await quiet_check()
        if reason:
            if reason != self.waiting:
                log.info("update: %s is ready; waiting because %s", self.latest, reason)
            self.waiting = reason
            return
        self.waiting = None
        log.warning("update: installing %s automatically", self.latest)
        await self.install()

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
        # Hidden, so a broken version that was rolled back is never opened by mistake.
        failed = self.bundle.with_name(".Projector Control.failed.app")
        # (Earlier versions left it visible, as "Projector Control.failed.app".)
        for leftover in (staging, previous, failed, self.bundle.with_name("Projector Control.failed.app")):
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
             str(macservice.pid_file(self.folder)), str(self.result_path), str(failed)],
            start_new_session=True, stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )


async def busy_reason() -> str | None:
    """Why now is not a good moment to restart, or None when it is."""
    from sqlalchemy import func, select

    from app.db.models import AutomationRun, CommandLog
    from app.db.session import session_scope
    from app.services.mapping import transport

    status = transport.snapshot().status
    if status != "stopped":
        return f"a mapping show is {status}"
    now = datetime.now(UTC)
    async with session_scope() as session:
        recent = await session.scalar(
            select(func.count()).select_from(CommandLog).where(
                CommandLog.source != "monitor", CommandLog.created_at > now - QUIET_FOR,
            )
        )
        running = await session.scalar(
            select(func.count()).select_from(AutomationRun).where(
                AutomationRun.status == "running",
                AutomationRun.started_at > now - timedelta(hours=6),
            )
        )
    if recent:
        return "projectors were controlled in the last 10 minutes"
    if running:
        return "an automation is running"
    return None


async def _auto_loop(updater: Updater) -> None:
    await asyncio.sleep(120)  # let a fresh start settle (and a just-updated one prove itself)
    while True:
        try:
            await updater.auto_tick(busy_reason)
        except Exception:  # noqa: BLE001 - try again next round
            log.exception("update: automatic update failed")
            updater.installing = False
        await asyncio.sleep(AUTO_EVERY)


def start_auto_updates() -> asyncio.Task | None:
    """Run automatic updates in the background, only in the installed Mac app."""
    updater = get_updater()
    if not updater.supported:
        return None
    return asyncio.create_task(_auto_loop(updater), name="auto-update")


_updater: Updater | None = None


def get_updater() -> Updater:
    global _updater
    if _updater is None:
        folder = Path(os.environ.get("DESKTOP_DATA_DIR") or ".").expanduser()
        _updater = Updater(folder, macservice.running_bundle())
    return _updater
