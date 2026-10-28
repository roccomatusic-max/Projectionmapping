"""Settings → Backup, and the printable setup guide. Administrators only."""

from __future__ import annotations

import asyncio
import contextlib
import os
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app import backups
from app.api.deps import RequireAdmin, SessionDep, require_confirmation
from app.config import settings
from app.core.security import ALGORITHM
from app.services import backups as backup_service
from app.services import setup_guide

router = APIRouter(tags=["system"])

#: A download link works for this long. A browser cannot send the sign-in
#: header on a plain link, and a backup with its videos is too big to pass
#: through the page's memory.
LINK_SECONDS = 120
UPLOAD_BATCH = 1024 * 1024


class MakeIn(BaseModel):
    include_media: bool = False


class RestoreIn(BaseModel):
    confirm: bool = False


def _place() -> backups.Place:
    where = backup_service.place()
    if where is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=backup_service.unsupported_reason())
    return where


def _refuse(exc: backups.BackupError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


def _link_key() -> str:
    # Not the sign-in key: a link must never work as a sign-in.
    return settings.secret_key + ":backup-download"


@router.get("/backups")
async def list_backups(_: RequireAdmin) -> dict:
    where = backup_service.place()
    if where is None:
        return {"supported": False, "reason": backup_service.unsupported_reason(),
                "backups": [], "media_files": 0, "media_bytes": 0, "last_restore": None,
                "can_restart": False, "keep": backups.KEEP}
    entries = await asyncio.to_thread(backups.list_backups, where)
    files, size = await asyncio.to_thread(backups.media_size, where)
    return {
        "supported": True,
        "reason": None,
        "folder": str(where.backups),
        "backups": entries,
        "media_files": files,
        "media_bytes": size,
        "last_restore": backups.last_restore(where),
        "can_restart": backup_service.can_restart(),
        "keep": backups.KEEP,
        "night_hours": list(backup_service.NIGHT_HOURS),
    }


@router.post("/backups", status_code=status.HTTP_201_CREATED)
async def make_backup(body: MakeIn, _: RequireAdmin) -> dict:
    _place()
    try:
        return await backup_service.make("manual", include_media=body.include_media)
    except backups.BackupError as exc:
        raise _refuse(exc) from exc
    except OSError as exc:
        raise HTTPException(status_code=status.HTTP_507_INSUFFICIENT_STORAGE,
                            detail=f"The backup could not be written: {exc}") from exc


@router.post("/backups/upload", status_code=status.HTTP_201_CREATED)
async def upload_backup(request: Request, _: RequireAdmin) -> dict:
    """A backup file from this computer, as the raw request body; it is checked
    and then listed like the others, ready to restore."""
    where = _place()
    limit = settings.media_max_upload_mb * 1024 * 1024
    target = backups.uploaded_name(where)
    partial = target.with_name(f".{target.name}.part")
    written = 0
    try:
        with partial.open("wb") as handle:
            pending = bytearray()
            async for chunk in request.stream():
                written += len(chunk)
                if written > limit:
                    raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                                        detail=f"Upload exceeds {settings.media_max_upload_mb} MB")
                pending.extend(chunk)
                if len(pending) >= UPLOAD_BATCH:
                    await asyncio.to_thread(handle.write, bytes(pending))
                    pending.clear()
            if pending:
                await asyncio.to_thread(handle.write, bytes(pending))
        if written == 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="The file was empty.")
        try:
            await asyncio.to_thread(backups.check, partial, backup_service.known_schema)
        except backups.BackupError as exc:
            raise _refuse(exc) from exc
        os.replace(partial, target)
    finally:
        with contextlib.suppress(FileNotFoundError):
            partial.unlink()
    await asyncio.to_thread(backups.prune, where, "uploaded")
    return backups.describe(target)


@router.post("/backups/{name}/link")
async def download_link(name: str, _: RequireAdmin) -> dict:
    where = _place()
    try:
        backups.backup_path(where, name)
    except backups.BackupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    key = jwt.encode({"name": name, "exp": datetime.now(UTC) + timedelta(seconds=LINK_SECONDS)},
                     _link_key(), algorithm=ALGORITHM)
    return {"url": f"/api/backups/{name}/file?key={key}", "expires_in": LINK_SECONDS}


@router.get("/backups/{name}/file")
async def download(name: str, key: Annotated[str, Query(max_length=1000)]) -> FileResponse:
    """The backup file, for a link made by ``download_link`` a moment ago."""
    try:
        claims = jwt.decode(key, _link_key(), algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="This download link has expired. Press Download again.") from exc
    if claims.get("name") != name:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Wrong download link.")
    try:
        path = backups.backup_path(_place(), name)
    except backups.BackupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return FileResponse(path, media_type="application/zip", filename=name)


@router.post("/backups/{name}/restore")
async def restore(name: str, body: RestoreIn, _: RequireAdmin) -> dict:
    require_confirmation(body.confirm, "replaces everything on this server with the backup")
    _place()
    try:
        return await backup_service.restore(name)
    except backups.BackupError as exc:
        raise _refuse(exc) from exc


@router.delete("/backups/{name}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_backup(name: str, _: RequireAdmin) -> None:
    try:
        path = backups.backup_path(_place(), name)
    except backups.BackupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    path.unlink()


@router.get("/setup-guide")
async def get_setup_guide(session: SessionDep, _: RequireAdmin) -> dict:
    where = backup_service.place()
    entries = await asyncio.to_thread(backups.list_backups, where) if where else []
    last = next((e for e in entries if not e["problem"]), None)
    return await setup_guide.collect(session, last_backup=last and {
        "name": last["name"], "created_at": last["created_at"], "kind": last["kind"],
        "folder": str(where.backups) if where else None,
    })
