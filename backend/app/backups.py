"""Backups of everything this server is set up with, and putting one back.

A backup is one zip file:

- ``backup.json``: what it is, when and where it was made, which version and
  database schema made it, and what is in it (3 projectors, 2 shows, …);
- ``projector-control.db``: a consistent copy of the database, taken with
  SQLite's own backup while the server runs, without the reading history
  (``HISTORY_TABLES``) that makes up most of its size;
- ``keys/``: the optional AI and GitHub keys and the phone alert settings
  (with their Pushover keys) from Settings;
- ``media/``: the pictures and videos, when asked for;
- ``READ-ME.txt`` and ``SETUP-GUIDE.txt``: how to put it back, and the
  printable setup guide as text, for when the server itself is gone.

``backup.json`` also holds the server's secret key. Projector passwords are
kept encrypted with it, and sign-ins (the phone remote's, the mini PCs',
Home Assistant's) are signed with it, so a server restored from a backup
keeps all of them working. That makes a backup as private as the data folder:
the Settings page says so.

Putting one back happens in two steps, because the database cannot be swapped
under a running server:

1. ``stage_restore`` checks the backup and unpacks it into
   ``restore-pending/`` in the data folder; the server then restarts.
2. ``apply_pending`` runs at the next start, before anything opens the
   database (``app.desktop`` for the Mac and Windows apps, the app's
   start-up for every other install): it swaps the database in, puts the
   key files and media back and records the result for the Settings page.

Nothing here reads ``app.config``: the desktop launcher calls
``apply_pending`` before the server's settings exist.
"""

from __future__ import annotations

import base64
import contextlib
import hashlib
import json
import logging
import os
import re
import shutil
import socket
import sqlite3
import sys
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

log = logging.getLogger(__name__)

FORMAT = "projector-control-backup"
FORMAT_VERSION = 1
MANIFEST = "backup.json"
DATABASE = "projector-control.db"
README = "READ-ME.txt"
GUIDE = "SETUP-GUIDE.txt"
#: Readings and logs rather than settings, and most of the database's size.
HISTORY_TABLES = ("telemetry", "command_log", "enclosure_readings")
#: Key files kept beside the media folder (services/api_keys.py, services/updates.py).
KEY_FILES = ("anthropic-api-key", "openai-api-key", "github-token", "phone-alerts.json")
#: How many of each kind are kept; the oldest go first.
KEEP = {"nightly": 14, "manual": 10, "before-restore": 5, "uploaded": 5}
KINDS = tuple(KEEP)
NAME_RE = re.compile(
    r"^ProjectorControl-backup-\d{4}-\d{2}-\d{2}-\d{4}(?:-\d+)?-(" + "|".join(KINDS) + r")\.zip$"
)
PENDING = "restore-pending"
RESULT = "last-restore.json"
#: What a backup is said to hold, by table.
COUNTED = {
    "projectors": "projectors",
    "shows": "mapping_shows",
    "cues": "mapping_cues",
    "scenes": "mapping_scenes",
    "scene_groups": "mapping_scene_groups",
    "saved_maps": "mapping_maps",
    "calendar": "show_calendar",
    "players": "mapping_players",
    "automations": "automations",
    "media": "media_assets",
}
#: Columns holding projector passwords encrypted with the secret key.
ENCRYPTED = (("projectors", "password_enc"), ("projectors", "pjlink_password_enc"))

README_TEXT = """\
Projector Control backup
========================

This file holds everything the server was set up with: projectors, shows,
cues, scenes, scene groups, saved maps, the calendar, mini PCs, automations,
users and settings{media}.

KEEP IT PRIVATE. It also holds the projector passwords, the AI and phone
alert keys and the server's secret key. Keep it on a USB stick or in your own cloud storage; do not post
it or send it to anyone.

To put it back, on the same server or a new one:
  1. Install Projector Control (Mac app or Windows server) if it is not there.
  2. Open the dashboard, sign in, and go to Settings -> Backup.
  3. Under "Restore from a file" pick this zip, check what it holds, and
     press Restore. The server restarts and comes back in about a minute,
     with the sign-in and passwords from the backup.

SETUP-GUIDE.txt beside this file lists every projector, mini PC and address
as they were when the backup was made.
"""


class BackupError(Exception):
    """Something a person can act on, in plain words."""


@dataclass(frozen=True)
class Place:
    """Where one server keeps what a backup covers."""

    #: The data folder: the database, the secret key, the key files.
    folder: Path
    database: Path
    media: Path

    @property
    def backups(self) -> Path:
        return self.folder / "backups"


def fernet_key(secret_key: str) -> bytes:
    """The projector-password key derived from a server's secret key.

    The same derivation as ``app.core.security._fernet`` (a test keeps the
    two equal), repeated because that module needs the server's settings.
    """
    return base64.urlsafe_b64encode(hashlib.sha256(secret_key.encode()).digest())


# -- making one ---------------------------------------------------------------------

def _new_name(place: Place, kind: str, now: datetime) -> Path:
    stem = f"ProjectorControl-backup-{now.astimezone():%Y-%m-%d-%H%M}"
    candidate = place.backups / f"{stem}-{kind}.zip"
    count = 2
    while candidate.exists():
        candidate = place.backups / f"{stem}-{count}-{kind}.zip"
        count += 1
    return candidate


def _tables(conn: sqlite3.Connection) -> set[str]:
    return {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}


def _counts(conn: sqlite3.Connection) -> dict[str, int]:
    tables = _tables(conn)
    counts = {key: conn.execute(f'SELECT count(*) FROM "{table}"').fetchone()[0]  # noqa: S608
              for key, table in COUNTED.items() if table in tables}
    if "users" in tables:
        # Mini PCs sign in with accounts of their own; count people.
        counts["users"] = conn.execute(
            "SELECT count(*) FROM users WHERE username NOT LIKE 'player-%'").fetchone()[0]
    return counts


def revision(conn: sqlite3.Connection) -> str | None:
    """The Alembic revision the database is at."""
    if "alembic_version" not in _tables(conn):
        return None
    row = conn.execute("SELECT version_num FROM alembic_version").fetchone()
    return row[0] if row else None


def media_files(place: Place) -> list[Path]:
    """The library's files: no half-finished uploads, no hidden files."""
    if not place.media.is_dir():
        return []
    return sorted(p for p in place.media.iterdir() if p.is_file() and not p.name.startswith("."))


def media_size(place: Place) -> tuple[int, int]:
    files = media_files(place)
    return len(files), sum(p.stat().st_size for p in files)


def snapshot(database: Path, target: Path) -> dict:
    """Copy the live database to ``target`` without its reading history.

    SQLite's backup API copies a consistent picture while the server goes on
    writing. The copy is turned into a single file (no write-ahead log) and
    compacted. Returns its schema revision and what it holds.
    """
    if not database.is_file():
        raise BackupError("This server has no database yet.")
    source = sqlite3.connect(database, timeout=30)
    copy = sqlite3.connect(target)
    try:
        source.backup(copy)
    finally:
        source.close()
    try:
        copy.execute("PRAGMA journal_mode=DELETE")
        tables = _tables(copy)
        for table in HISTORY_TABLES:
            if table in tables:
                copy.execute(f'DELETE FROM "{table}"')  # noqa: S608
        copy.commit()
        copy.execute("VACUUM")
        return {"schema": revision(copy), "contents": _counts(copy)}
    finally:
        copy.close()


def create(place: Place, *, kind: str, include_media: bool, secret_key: str | None,
           app_version: str, guide_text: str | None = None,
           now: datetime | None = None) -> dict:
    """Make one backup in ``place.backups``; returns how it is listed."""
    if kind not in KINDS:
        raise ValueError(kind)
    now = now or datetime.now(UTC)
    place.backups.mkdir(parents=True, exist_ok=True)
    target = _new_name(place, kind, now)
    work = place.backups / f".work-{os.getpid()}-{now.timestamp():.0f}"
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir()
    partial = target.with_name(f".{target.name}.part")
    try:
        database = work / DATABASE
        found = snapshot(place.database, database)
        media = media_files(place) if include_media else []
        manifest = {
            "format": FORMAT,
            "format_version": FORMAT_VERSION,
            "kind": kind,
            "created_at": now.isoformat(),
            "app_version": app_version,
            "schema": found["schema"],
            "computer": socket.gethostname(),
            "system": {"darwin": "mac", "win32": "windows"}.get(sys.platform, "linux"),
            "contents": found["contents"],
            "media": {"included": include_media, "files": len(media),
                      "bytes": sum(p.stat().st_size for p in media)},
            "history_left_out": list(HISTORY_TABLES),
            "secret_key": secret_key,
        }
        with zipfile.ZipFile(partial, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(MANIFEST, json.dumps(manifest, indent=2))
            archive.writestr(README, README_TEXT.format(
                media=", and the pictures and videos" if include_media else
                " (not the pictures and videos: copy those separately or make a backup "
                "with them)"))
            if guide_text:
                archive.writestr(GUIDE, guide_text)
            archive.write(database, DATABASE)
            for name in KEY_FILES:
                key = place.folder / name
                if key.is_file():
                    archive.write(key, f"keys/{name}")
            for file in media:
                # Videos and pictures are compressed already.
                archive.write(file, f"media/{file.name}", compress_type=zipfile.ZIP_STORED)
        os.replace(partial, target)
    finally:
        shutil.rmtree(work, ignore_errors=True)
        with contextlib.suppress(FileNotFoundError):
            partial.unlink()
    with contextlib.suppress(OSError):
        target.chmod(0o600)
    prune(place, kind)
    log.info("backup: made %s (%s)", target.name, kind)
    return describe(target)


def prune(place: Place, kind: str) -> None:
    kept = [entry for entry in list_backups(place) if entry["kind"] == kind]
    for entry in kept[KEEP[kind]:]:
        with contextlib.suppress(OSError):
            (place.backups / entry["name"]).unlink()


# -- reading them -------------------------------------------------------------------

def read_manifest(path: Path) -> dict:
    """The backup's description, or a BackupError saying why it is not one."""
    try:
        with zipfile.ZipFile(path) as archive:
            names = set(archive.namelist())
            if MANIFEST not in names or DATABASE not in names:
                raise BackupError("This zip is not a Projector Control backup.")
            manifest = json.loads(archive.read(MANIFEST))
    except (zipfile.BadZipFile, OSError) as exc:
        raise BackupError("This file is not a backup, or it was cut short while "
                          "being copied.") from exc
    except ValueError as exc:
        raise BackupError("This backup's description is damaged.") from exc
    if not isinstance(manifest, dict) or manifest.get("format") != FORMAT:
        raise BackupError("This zip is not a Projector Control backup.")
    if int(manifest.get("format_version") or 0) > FORMAT_VERSION:
        raise BackupError("This backup was made by a newer version. Update this server "
                          "first: Settings → Updates and password → Check now.")
    return manifest


_described: dict[str, tuple[float, int, dict]] = {}


def describe(path: Path) -> dict:
    """How a backup is listed. Never includes the secret key."""
    stat = path.stat()
    cached = _described.get(str(path))
    if cached and cached[0] == stat.st_mtime and cached[1] == stat.st_size:
        return cached[2]
    match = NAME_RE.match(path.name)
    try:
        manifest = read_manifest(path)
        problem = None
    except BackupError as exc:
        manifest, problem = {}, str(exc)
    media = manifest.get("media") or {}
    entry = {
        "name": path.name,
        "kind": match.group(1) if match else "uploaded",
        "made_as": manifest.get("kind"),
        "created_at": manifest.get("created_at")
        or datetime.fromtimestamp(stat.st_mtime, UTC).isoformat(),
        "size_bytes": stat.st_size,
        "app_version": manifest.get("app_version"),
        "computer": manifest.get("computer"),
        "system": manifest.get("system"),
        "contents": manifest.get("contents") or {},
        "media_included": bool(media.get("included")),
        "media_files": int(media.get("files") or 0),
        "media_bytes": int(media.get("bytes") or 0),
        "has_passwords": bool(manifest.get("secret_key")),
        "problem": problem,
    }
    _described[str(path)] = (stat.st_mtime, stat.st_size, entry)
    return entry


def list_backups(place: Place) -> list[dict]:
    """Every backup in the folder, newest first."""
    if not place.backups.is_dir():
        return []
    entries = [describe(p) for p in place.backups.iterdir()
               if p.is_file() and NAME_RE.match(p.name)]
    return sorted(entries, key=lambda e: e["created_at"], reverse=True)


def backup_path(place: Place, name: str) -> Path:
    """The backup called ``name``, refusing anything but a backup's own name."""
    if not NAME_RE.match(name):
        raise BackupError("There is no backup with that name.")
    path = place.backups / name
    if not path.is_file():
        raise BackupError("That backup is no longer on this server.")
    return path


def uploaded_name(place: Place, now: datetime | None = None) -> Path:
    place.backups.mkdir(parents=True, exist_ok=True)
    return _new_name(place, "uploaded", now or datetime.now(UTC))


def last_restore(place: Place) -> dict | None:
    with contextlib.suppress(OSError, ValueError):
        return json.loads((place.folder / RESULT).read_text(encoding="utf-8"))
    return None


# -- putting one back ---------------------------------------------------------------

def _safe(name: str) -> bool:
    return bool(name) and "/" not in name and "\\" not in name and not name.startswith(".") \
        and name not in ("..",) and ":" not in name


def check(path: Path, known_schema: Callable[[str | None], bool]) -> dict:
    """The manifest, once the backup is known to be one this server can use."""
    manifest = read_manifest(path)
    if not known_schema(manifest.get("schema")):
        made_by = manifest.get("app_version") or "a newer version"
        raise BackupError(f"This backup was made by {made_by}, which is newer than this "
                          "server. Update this server first (Settings → Updates and "
                          "password → Check now), then restore it.")
    return manifest


def stage_restore(place: Place, path: Path, known_schema: Callable[[str | None], bool]) -> dict:
    """Unpack the backup into ``restore-pending``, ready for the next start."""
    manifest = check(path, known_schema)
    pending = place.folder / PENDING
    unpacking = place.folder / f"{PENDING}.unpacking"
    for leftover in (pending, unpacking):
        shutil.rmtree(leftover, ignore_errors=True)
    (unpacking / "keys").mkdir(parents=True)
    (unpacking / "media").mkdir()
    try:
        with zipfile.ZipFile(path) as archive:
            for info in archive.infolist():
                if info.is_dir():
                    continue
                folder, _, name = info.filename.rpartition("/")
                if info.filename == DATABASE:
                    target = unpacking / DATABASE
                elif folder == "keys" and name in KEY_FILES:
                    target = unpacking / "keys" / name
                elif folder == "media" and _safe(name):
                    target = unpacking / "media" / name
                else:
                    continue  # the read-me, the guide, the manifest (written below)
                with archive.open(info) as source, target.open("wb") as handle:
                    shutil.copyfileobj(source, handle, 1 << 20)
        conn = sqlite3.connect(unpacking / DATABASE)
        try:
            healthy = conn.execute("PRAGMA quick_check").fetchone()[0] == "ok"
        finally:
            conn.close()
        if not healthy:
            raise BackupError("The database inside this backup is damaged.")
        manifest = {**manifest, "restored_from": path.name}
        (unpacking / MANIFEST).write_text(json.dumps(manifest), encoding="utf-8")
        with contextlib.suppress(OSError):
            (unpacking / MANIFEST).chmod(0o600)
        unpacking.rename(pending)
        # Last: a restore cut short while unpacking is never applied.
        (pending / "ready").write_text(path.name, encoding="utf-8")
    except (OSError, zipfile.BadZipFile, sqlite3.DatabaseError) as exc:
        shutil.rmtree(unpacking, ignore_errors=True)
        shutil.rmtree(pending, ignore_errors=True)
        raise BackupError(f"The backup could not be unpacked: {exc}") from exc
    except BaseException:
        shutil.rmtree(unpacking, ignore_errors=True)
        shutil.rmtree(pending, ignore_errors=True)
        raise
    log.warning("backup: %s is ready to restore at the next start", path.name)
    return manifest


def _put(source: Path, target: Path) -> None:
    """Move ``source`` over ``target`` in one step (``os.replace`` overwrites on
    Windows too, where a plain rename refuses), copying across drives."""
    try:
        os.replace(source, target)
    except OSError:
        shutil.copy2(source, target)
        source.unlink()


def has_pending(place: Place) -> bool:
    return (place.folder / PENDING / "ready").is_file()


def reencrypt(database: Path, old_secret: str, new_secret: str) -> int:
    """Encrypt the projector passwords in ``database`` with another server's key."""
    from cryptography.fernet import Fernet, InvalidToken

    old, new = Fernet(fernet_key(old_secret)), Fernet(fernet_key(new_secret))
    changed = 0
    conn = sqlite3.connect(database)
    try:
        tables = _tables(conn)
        for table, column in ENCRYPTED:
            if table not in tables:
                continue
            rows = conn.execute(
                f'SELECT id, "{column}" FROM "{table}" WHERE "{column}" IS NOT NULL').fetchall()  # noqa: S608
            for row_id, value in rows:
                try:
                    plain = old.decrypt(value.encode())
                except (InvalidToken, ValueError):
                    continue  # unreadable on the old server too
                conn.execute(f'UPDATE "{table}" SET "{column}" = ? WHERE id = ?',  # noqa: S608
                             (new.encrypt(plain).decode(), row_id))
                changed += 1
        conn.commit()
    finally:
        conn.close()
    return changed


def apply_pending(place: Place, *, secret_file: Path | None = None,
                  current_secret: str | None = None) -> dict | None:
    """Put a staged backup in place. Call before anything opens the database.

    ``secret_file``: the server keeps its secret key in this file (the Mac
    and Windows apps), so the backup's key is written there and everything
    signed or encrypted with it keeps working. Otherwise the key comes from
    the environment and stays; the projector passwords are encrypted again
    with ``current_secret`` instead.
    """
    pending = place.folder / PENDING
    shutil.rmtree(place.folder / f"{PENDING}.unpacking", ignore_errors=True)
    if not (pending / "ready").is_file():
        shutil.rmtree(pending, ignore_errors=True)
        return None
    manifest: dict = {}
    swapped = False
    try:
        manifest = json.loads((pending / MANIFEST).read_text(encoding="utf-8"))
        backup_secret = manifest.get("secret_key")
        database = pending / DATABASE
        if not database.is_file():
            raise BackupError("the unpacked database is missing")
        keep_key = backup_secret and secret_file is not None
        if backup_secret and not keep_key and current_secret and backup_secret != current_secret:
            reencrypt(database, backup_secret, current_secret)
        place.database.parent.mkdir(parents=True, exist_ok=True)
        for suffix in ("-wal", "-shm", "-journal"):
            with contextlib.suppress(FileNotFoundError):
                Path(f"{place.database}{suffix}").unlink()
        _put(database, place.database)
        swapped = True
        if keep_key:
            partial = secret_file.with_name(secret_file.name + ".part")
            partial.write_text(backup_secret, encoding="utf-8")
            with contextlib.suppress(OSError):
                partial.chmod(0o600)
            os.replace(partial, secret_file)
        for key in (pending / "keys").iterdir():
            _put(key, place.folder / key.name)
            with contextlib.suppress(OSError):
                (place.folder / key.name).chmod(0o600)
        place.media.mkdir(parents=True, exist_ok=True)
        added = 0
        for file in (pending / "media").iterdir():
            # Same name, same file: the library names each upload uniquely.
            if not (place.media / file.name).exists():
                _put(file, place.media / file.name)
                added += 1
        result = {"ok": True, "message": "Restored."}
        log.warning("backup: restored %s (made %s by %s)", manifest.get("restored_from"),
                    manifest.get("created_at"), manifest.get("app_version"))
    except (OSError, ValueError, BackupError, sqlite3.DatabaseError) as exc:
        added = 0
        result = {"ok": False, "message": (
            f"The restore did not finish ({exc}). " + (
                "The backup's database is in place, but restore it once more to bring "
                "back everything else." if swapped
                else "Nothing was changed; the server kept what it had."))}
        log.exception("backup: the restore failed")
    result.update({
        "name": manifest.get("restored_from"),
        "at": datetime.now(UTC).isoformat(),
        "created_at": manifest.get("created_at"),
        "app_version": manifest.get("app_version"),
        "computer": manifest.get("computer"),
        "contents": manifest.get("contents") or {},
        "media_added": added,
    })
    with contextlib.suppress(OSError):
        (place.folder / RESULT).write_text(json.dumps(result), encoding="utf-8")
    shutil.rmtree(pending, ignore_errors=True)
    return result
