"""Settings → Backup: one-click backups, the nightly one, and restoring.

The files and the restore itself are in :mod:`app.backups`; this module
knows the running server: where its data folder is, whether a show is on,
how to restart it, and when the nightly backup is due.

Restoring restarts the server. The Mac app (launchd's KeepAlive) and the
Windows server (the service's recovery settings) start it again by
themselves; a copy started by hand has to be started again by whoever
started it, and the page says so.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy.engine import make_url

from app import backups
from app.config import settings
from app.macservice import SERVICE_ENV
from app.paths import alembic_dir, app_version

log = logging.getLogger(__name__)

#: The nightly backup is made between these local hours, long after the show.
NIGHT_HOURS = (3, 6)
#: How often the nightly loop looks.
TICK_SECONDS = 30 * 60
#: A nightly backup newer than this counts as tonight's (the window is shorter).
NIGHTLY_EVERY = timedelta(hours=4)

_lock = asyncio.Lock()


def place() -> backups.Place | None:
    """Where this server's data is, or None when backups cannot work here."""
    if not settings.is_sqlite or settings.is_memory_sqlite:
        return None
    database = make_url(settings.database_url).database
    if not database:
        return None
    media = Path(settings.media_dir).expanduser().resolve()
    return backups.Place(folder=media.parent, database=Path(database).expanduser().resolve(),
                         media=media)


def unsupported_reason() -> str | None:
    if place() is None:
        return ("Backups here need the built-in database (the Mac app and the Windows "
                "server have it). This server uses PostgreSQL: back it up with pg_dump.")
    return None


def can_restart() -> bool:
    """The server runs as the Mac or Windows service, which starts it again."""
    return os.environ.get(SERVICE_ENV) == "1"


def known_schema(revision: str | None) -> bool:
    """This server's migrations know the database schema ``revision``."""
    if revision is None:
        return True  # made before migrations: stamped and upgraded on start
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    config = Config()
    config.set_main_option("script_location", str(alembic_dir()))
    try:
        return ScriptDirectory.from_config(config).get_revision(revision) is not None
    except Exception:  # noqa: BLE001 - alembic.util.CommandError: unknown revision
        return False


def busy_reason() -> str | None:
    """Why a restore must wait, in words; None when it can go ahead."""
    from app.services.mapping import transport
    from app.services.updates import get_updater

    status = transport.snapshot().status
    if status != "stopped":
        return f"The show is {status}. Stop it on Run the show first, then restore."
    if get_updater().installing:
        return "An app update is being installed. Try again in a few minutes."
    return None


async def _guide_text() -> str | None:
    from app.db.session import session_scope
    from app.services import setup_guide

    try:
        async with session_scope() as session:
            return setup_guide.as_text(await setup_guide.collect(session))
    except Exception:  # noqa: BLE001 - a backup without the guide beats no backup
        log.exception("backup: the setup guide could not be written into it")
        return None


async def make(kind: str, *, include_media: bool, now: datetime | None = None) -> dict:
    where = place()
    if where is None:
        raise backups.BackupError(unsupported_reason() or "Backups are not available here.")
    guide = await _guide_text()
    async with _lock:
        return await asyncio.to_thread(
            backups.create, where, kind=kind, include_media=include_media,
            secret_key=settings.secret_key, app_version=app_version(), guide_text=guide,
            now=now)


async def restore(name: str) -> dict:
    """Stage the backup ``name`` and restart; returns what the page shows."""
    where = place()
    if where is None:
        raise backups.BackupError(unsupported_reason() or "Backups are not available here.")
    reason = busy_reason()
    if reason:
        raise backups.BackupError(reason)
    path = backups.backup_path(where, name)
    await asyncio.to_thread(backups.check, path, known_schema)
    # How things are now, in case this was the wrong backup.
    await make("before-restore", include_media=False)
    async with _lock:
        manifest = await asyncio.to_thread(backups.stage_restore, where, path, known_schema)
    restarting = can_restart()
    if restarting:
        from app import desktop

        log.warning("backup: restarting to restore %s", name)
        # Answer the request first.
        asyncio.get_running_loop().call_later(1.5, desktop.request_restart)
    return {
        "restarting": restarting,
        "name": name,
        "created_at": manifest.get("created_at"),
        "message": ("Restoring. The server restarts and this page comes back by itself in "
                    "about a minute." if restarting else
                    "Ready to restore. Close Projector Control and open it again to finish."),
    }


def apply_at_start() -> dict | None:
    """For servers the desktop launcher did not start: apply a staged restore."""
    where = place()
    if where is None or not backups.has_pending(where):
        return None
    return backups.apply_pending(where, current_secret=settings.secret_key)


def latest_nightly(where: backups.Place) -> datetime | None:
    for entry in backups.list_backups(where):
        if entry["kind"] == "nightly" and not entry["problem"]:
            with contextlib.suppress(ValueError):
                return datetime.fromisoformat(entry["created_at"])
    return None


async def nightly_tick(now: datetime | None = None) -> dict | None:
    """Make the nightly backup when one is due and nothing is playing."""
    from app.services.mapping import transport

    where = place()
    if where is None:
        return None
    now = now or datetime.now(UTC)
    last = await asyncio.to_thread(latest_nightly, where)
    if last is not None:
        local = now.astimezone(settings.tz)
        if now - last < NIGHTLY_EVERY or not NIGHT_HOURS[0] <= local.hour < NIGHT_HOURS[1]:
            return None
    # (The very first one is made as soon as the server is quiet.)
    if transport.snapshot().status != "stopped" or backups.has_pending(where):
        return None
    return await make("nightly", include_media=False, now=now)


async def _loop() -> None:
    await asyncio.sleep(300)  # let a fresh start settle
    while True:
        try:
            await nightly_tick()
        except Exception:  # noqa: BLE001 - try again next round
            log.exception("backup: the nightly backup failed")
        await asyncio.sleep(TICK_SECONDS)


def start() -> asyncio.Task | None:
    if place() is None:
        return None
    return asyncio.create_task(_loop(), name="nightly-backup")
