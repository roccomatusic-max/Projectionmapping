"""Updating the Mac app from GitHub. Administrators only."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import RequireAdmin, require_confirmation
from app.services.updates import UpdateError, get_updater

router = APIRouter(prefix="/system/updates", tags=["system"])


class KeyIn(BaseModel):
    #: Empty removes the stored key.
    key: str = Field(default="", max_length=400)


class InstallIn(BaseModel):
    confirm: bool = False


@router.get("")
async def update_status(_: RequireAdmin, check: bool = False) -> dict:
    """Current and latest version. Checks GitHub at most every 15 minutes unless ``check``."""
    return await get_updater().check(force=check)


@router.put("/key")
async def set_key(body: KeyIn, _: RequireAdmin) -> dict:
    updater = get_updater()
    updater.save_key(body.key)
    return await updater.check(force=True)


@router.post("/install")
async def install(body: InstallIn, _: RequireAdmin) -> dict:
    require_confirmation(body.confirm, "restarts Projector Control to install the update")
    try:
        return await get_updater().install()
    except UpdateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from None
