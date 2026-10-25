"""Updates for the Mini PC app, handed out by this server over the local network.

Every merge that changes the Mini PC app publishes a new installer to the
``minipc-latest`` release (``.github/workflows/minipc.yml``), next to
``minipc-version.json``: its version, size and SHA-256. This server fetches
that file every 15 minutes while mini PCs check in, downloads a newer
installer once, checks it against the SHA-256 and keeps it in its data
folder. Mini PCs only ever talk to this server, so they need no internet.

A mini PC is offered the update when it checks in (``POST
/api/mapping/players/app``) with an older version, and only while nothing is
on: no show playing, paused or blacked out, no emergency stop, no automation
running, no test picture on its projector, and not during Tonight's show time
or the 30 minutes before it. One mini PC updates at a time; the next waits until it is back
with the new version, so a broken build stops at the first one. A version
that failed on any mini PC is not offered by itself again: Update now on the
Players page tries it once more.

On the mini PC, the app downloads the installer from this server, checks it,
and hands over to a small script that runs it silently and starts the app
again (minipc/selfupdate.py). The output window stays open meanwhile.

Mini PC apps from before this (they send no version) cannot update
themselves: the install line has to be pasted on them once.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import json
import logging
import os
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

from app.config import settings
from app.macservice import version_key

log = logging.getLogger(__name__)

REPOSITORY = os.environ.get("UPDATE_REPOSITORY", "roccomatusic-max/Projectionmapping")
INSTALLER = "MiniPC-Setup.exe"
VERSION_FILE = "minipc-version.json"
CHECK_SECONDS = 15 * 60
#: Back on the new version within this, or the update counts as failed.
UPDATE_SECONDS = 6 * 60
#: No update this close to a planned show time.
SHOW_MARGIN = timedelta(minutes=30)
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
MAX_INSTALLER_BYTES = 1 << 30


def release_base() -> str:
    """Where the newest installer is published; a local folder for the build check."""
    return (os.environ.get("MINIPC_RELEASE_BASE")
            or f"https://github.com/{REPOSITORY}/releases/download/minipc-latest").rstrip("/")


@dataclass
class Release:
    version: str
    sha256: str
    size: int
    path: Path

    def offer(self) -> dict[str, Any]:
        return {"version": self.version, "sha256": self.sha256, "size": self.size,
                "url": "/api/mapping/players/app/installer"}


@dataclass
class Job:
    version: str
    started: float
    forced: bool
    name: str
    #: When it was told to install (it had the download); 0 before.
    handed_over: float = 0.0


@dataclass
class MiniPCUpdates:
    folder: Path
    latest: Release | None = None
    checked_at: float | None = None
    error: str | None = None
    #: Mini PC apps have checked in, so the release is worth fetching.
    wanted: bool = False
    jobs: dict[int, Job] = field(default_factory=dict)
    #: Player id: (version, what went wrong).
    failed: dict[int, tuple[str, str]] = field(default_factory=dict)
    #: Update now was pressed; offered at the next check-in.
    forced: set[int] = field(default_factory=set)
    #: Player id: why its update is waiting, from its last check-in.
    waiting: dict[int, str] = field(default_factory=dict)
    #: Player id: what its app said it is doing (downloading, installing).
    progress: dict[int, str] = field(default_factory=dict)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def __post_init__(self) -> None:
        self.latest = self._load_cached()

    # -- the installer kept on this server -----------------------------------

    @property
    def note_path(self) -> Path:
        return self.folder / "latest.json"

    def _load_cached(self) -> Release | None:
        try:
            note = json.loads(self.note_path.read_text(encoding="utf-8"))
            release = Release(note["version"], note["sha256"], int(note["size"]),
                              self.folder / note["file"])
        except (OSError, ValueError, KeyError, TypeError):
            return None
        if not release.path.is_file() or release.path.stat().st_size != release.size:
            return None
        return release

    async def refresh(self, *, force: bool = False) -> None:
        """Fetch the newest version's details, and its installer when it is new."""
        async with self._lock:
            now = time.monotonic()
            if not force and self.checked_at is not None and now - self.checked_at < CHECK_SECONDS:
                return
            self.checked_at = now
            try:
                note = await self._fetch_note()
                if self.latest is None or version_key(note["version"]) > version_key(self.latest.version):
                    self.latest = await self._download(note)
                    log.info("mini PC app %s downloaded; mini PCs install it when no show is on",
                             self.latest.version)
                self.error = None
            except (httpx.HTTPError, OSError, ValueError) as exc:
                self.error = f"Could not get the newest Mini PC app: {str(exc) or type(exc).__name__}"
                log.info("%s", self.error)

    async def _fetch_note(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            response = await client.get(f"{release_base()}/{VERSION_FILE}",
                                        headers={"User-Agent": "ProjectorControl-minipc-updates"})
        if response.status_code != 200:
            # Each merge deletes and republishes the release: briefly 404.
            raise ValueError(f"GitHub answered {response.status_code}")
        note = response.json()
        if not (isinstance(note, dict) and VERSION_RE.match(str(note.get("version")))
                and SHA_RE.match(str(note.get("sha256")))
                and isinstance(note.get("size"), int) and 0 < note["size"] <= MAX_INSTALLER_BYTES):
            raise ValueError("the release's version file is not as expected")
        return note

    async def _download(self, note: dict[str, Any]) -> Release:
        self.folder.mkdir(parents=True, exist_ok=True)
        name = f"MiniPC-Setup-{note['version']}.exe"
        partial = self.folder / f".{name}.part"
        digest = hashlib.sha256()
        size = 0
        timeout = httpx.Timeout(30, read=120)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client, \
                client.stream("GET", f"{release_base()}/{INSTALLER}",
                              headers={"User-Agent": "ProjectorControl-minipc-updates"}) as r:
            if r.status_code != 200:
                raise ValueError(f"the download answered {r.status_code}")
            with partial.open("wb") as handle:
                async for chunk in r.aiter_bytes(1 << 20):
                    size += len(chunk)
                    if size > note["size"]:
                        break
                    digest.update(chunk)
                    handle.write(chunk)
        if size != note["size"] or digest.hexdigest() != note["sha256"]:
            partial.unlink(missing_ok=True)
            raise ValueError("the downloaded installer did not match its checksum")
        path = self.folder / name
        os.replace(partial, path)
        note_text = json.dumps({"version": note["version"], "sha256": note["sha256"],
                                "size": note["size"], "file": name})
        (self.folder / ".latest.json.part").write_text(note_text, encoding="utf-8")
        os.replace(self.folder / ".latest.json.part", self.note_path)
        for old in self.folder.glob("MiniPC-Setup-*.exe"):
            if old != path:
                with contextlib.suppress(OSError):
                    old.unlink()
        return Release(note["version"], note["sha256"], note["size"], path)

    # -- deciding, at each check-in -----------------------------------------

    def needs(self, version: str | None) -> bool:
        """An app that updates itself, on a version older than the newest."""
        return bool(version and version != "dev" and self.latest is not None
                    and version_key(version) < version_key(self.latest.version))

    def check_in(self, player_id: int, name: str, version: str | None,
                 report: dict[str, Any] | None, busy: str | None) -> tuple[dict | None, str | None]:
        """What to tell a mini PC's app that just checked in.

        Returns the update it may go ahead with right now (or None) and, when
        an update ended, a sentence for the log. The app downloads the
        installer when first offered it, and installs only on an offer that
        comes while it holds the download ("ready"): the offer is the
        server's word that nothing is on at this moment.
        """
        self.wanted = True
        if not version:
            return None, None  # an older app: it does not know how
        report = report or {}
        state = report.get("state")
        if state in ("downloading", "ready"):
            self.progress[player_id] = state
        else:
            self.progress.pop(player_id, None)
        job = self.jobs.get(player_id)
        if job is not None:
            if version == job.version:
                del self.jobs[player_id]
                self.failed.pop(player_id, None)
                self.waiting.pop(player_id, None)
                return None, f"Mini PC {name} updated its app to version {version}"
            if state == "failed" and report.get("version") == job.version:
                return None, self._fail(player_id, job, str(report.get("error") or "")[:300])
            if job.handed_over and time.monotonic() - job.handed_over > UPDATE_SECONDS:
                return None, self._fail(player_id, job, "it did not come back with the new version")
            if self.latest is None or self.latest.version != job.version:
                del self.jobs[player_id]  # a newer one came out meanwhile
                job = None
        if not self.needs(version):
            self.waiting.pop(player_id, None)
            self.forced.discard(player_id)
            return None, None
        assert self.latest is not None
        forced = player_id in self.forced or (job is not None and job.forced)
        reason = self._why_wait(player_id, busy, forced)
        if reason:
            self.waiting[player_id] = reason
            return None, None
        self.waiting.pop(player_id, None)
        self.forced.discard(player_id)
        if job is None:
            job = self.jobs[player_id] = Job(self.latest.version, time.monotonic(), forced, name)
            log.warning("mini PC %s: updating its app from %s to %s%s", name, version,
                        self.latest.version, " (Update now)" if forced else "")
        if state == "ready" and report.get("version") == job.version and not job.handed_over:
            job.handed_over = time.monotonic()
        return self.latest.offer(), None

    def _why_wait(self, player_id: int, busy: str | None, forced: bool) -> str | None:
        assert self.latest is not None
        version = self.latest.version
        if forced:
            # Update now: only a show on screen or the emergency stop holds it.
            return busy if busy and busy.startswith(("the emergency stop", "a show is")) else None
        if player_id in self.jobs:
            return busy
        if self.failed.get(player_id, ("",))[0] == version:
            return "it did not install last time; press Update now to try again"
        others = [j for pid, j in self.jobs.items() if pid != player_id]
        if others:
            return f"{others[0].name} is updating first"
        if any(v == version for pid, (v, _) in self.failed.items() if pid != player_id):
            return "it did not install on another mini PC; press Update now to try it here"
        return busy

    def _fail(self, player_id: int, job: Job, why: str) -> str:
        del self.jobs[player_id]
        self.failed[player_id] = (job.version, why or "the installer did not finish")
        return f"Mini PC {job.name} could not update its app to {job.version}: {self.failed[player_id][1]}"

    def press_update(self, player_id: int) -> None:
        self.forced.add(player_id)
        self.failed.pop(player_id, None)

    def forget(self, player_id: int) -> None:
        for table in (self.jobs, self.failed, self.waiting, self.progress):
            table.pop(player_id, None)
        self.forced.discard(player_id)

    # -- for the Players page ------------------------------------------------

    def describe(self, player_id: int, version: str | None) -> dict[str, Any]:
        latest = self.latest.version if self.latest else None
        if not version:
            return {"update": "old_app", "latest": latest,
                    "update_message": "This mini PC has an older app that cannot update itself. "
                                      "Paste the install line on it once; after that it updates "
                                      "by itself."}
        if version == "dev":
            return {"update": "up_to_date", "latest": latest, "update_message": "A test build."}
        job = self.jobs.get(player_id)
        if job is not None:
            step = "installing it" if job.handed_over else {
                "downloading": "downloading it", "ready": "downloaded, waiting for a quiet moment",
            }.get(self.progress.get(player_id, ""), "starting")
            return {"update": "updating", "latest": job.version,
                    "update_message": f"Updating to {job.version}: {step}. The projector stays on "
                                      "the output; the app restarts in about a minute."}
        if player_id in self.failed and self.failed[player_id][0] == latest:
            return {"update": "failed", "latest": latest,
                    "update_message": f"Could not update to {latest}: {self.failed[player_id][1]}. "
                                      "It keeps running its current version."}
        if self.needs(version):
            if player_id in self.forced:
                why = self.waiting.get(player_id)
                return {"update": "waiting", "latest": latest,
                        "update_message": f"Update asked for; waiting because {why}." if why
                        else "Update asked for; it starts within a few seconds."}
            why = self.waiting.get(player_id)
            return {"update": "waiting", "latest": latest,
                    "update_message": f"Version {latest} is ready. It installs by itself"
                                      + (f" when it can: {why}." if why else " in a moment.")}
        if latest is None:
            return {"update": "up_to_date", "latest": None,
                    "update_message": self.error or "Checking for a newer version."}
        return {"update": "up_to_date", "latest": latest, "update_message": "Up to date."}


async def busy_reason() -> str | None:
    """Why a mini PC should not restart its app now, or None when it may."""
    from sqlalchemy import func, select

    from app.db.models import AutomationRun
    from app.db.session import session_scope
    from app.services.mapping import transport
    from app.services.tonight import current_window, load_plan, next_start

    state = transport.snapshot()
    if state.emergency is not None:
        return "the emergency stop is on"
    if state.status != "stopped":
        return f"a show is {state.status}"
    async with session_scope() as session:
        running = await session.scalar(
            select(func.count()).select_from(AutomationRun).where(AutomationRun.status == "running"))
        plan = await load_plan(session)
        if plan.enabled and plan.show_id is not None:
            now = datetime.now(settings.tz)
            if current_window(plan, now):
                return "it is show time"
            start = next_start(plan, now)
            if start is not None and start - now < SHOW_MARGIN:
                return "the show starts soon"
    if running:
        return "an automation is running"
    return None


async def _loop(updates: MiniPCUpdates) -> None:
    await asyncio.sleep(20)
    while True:
        if updates.wanted:
            try:
                await updates.refresh()
            except Exception:  # noqa: BLE001 - try again next round
                log.exception("mini PC updates: checking failed")
        await asyncio.sleep(60)


def start() -> asyncio.Task | None:
    if not settings.minipc_updates:
        return None
    return asyncio.create_task(_loop(get()), name="minipc-updates")


_updates: MiniPCUpdates | None = None


def get() -> MiniPCUpdates:
    global _updates
    if _updates is None:
        _updates = MiniPCUpdates(Path(settings.media_dir).expanduser().resolve().parent / "minipc-app")
    return _updates
