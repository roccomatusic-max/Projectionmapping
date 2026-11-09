"""Keeping a picture on every projector: the daily output restart and the
picture watchdog (Mapping → Players). See services/output_care.py."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import RequireAdmin, RequireViewer, SessionDep, write_rate_limit
from app.core.events import bus
from app.db.models import Event, MappingPlayer, Severity
from app.services import output_care as service

router = APIRouter(prefix="/mapping/output-care", tags=["mapping"])


class OutputCarePlayer(BaseModel):
    player_id: int
    #: Why it has no picture right now, in words, while a show should be on.
    problem: str | None = None
    #: Restarting did not help; an alert is open.
    gave_up: bool = False
    restarts_last_hour: int = 0
    last_restart_at: datetime | None = None
    #: "daily restart", or what was wrong.
    last_restart_reason: str | None = None


class OutputCareOut(BaseModel):
    daily_enabled: bool
    daily_time: str
    watchdog_enabled: bool
    next_daily_at: datetime | None = None
    #: Why the daily restart is waiting right now ("a show is playing").
    daily_waiting: str | None = None
    last_daily_at: datetime | None = None
    last_daily_note: str | None = None
    #: Why the watchdog is checking right now ("a show is playing"), or None.
    watching: str | None = None
    timezone: str
    players: list[OutputCarePlayer]


class OutputCareIn(BaseModel):
    daily_enabled: bool
    daily_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    watchdog_enabled: bool


async def _out(session) -> OutputCareOut:
    saved = await service.load_settings(session)
    players = (await session.execute(
        select(MappingPlayer).where(MappingPlayer.approved.is_(True),
                                    MappingPlayer.kind == "player").order_by(MappingPlayer.id)
    )).scalars().all()
    return OutputCareOut(**service.output_care.status(saved, players))


@router.get("", response_model=OutputCareOut)
async def get_output_care(session: SessionDep, _: RequireViewer) -> OutputCareOut:
    out = await _out(session)
    await session.commit()
    return out


@router.put("", response_model=OutputCareOut, dependencies=[Depends(write_rate_limit)])
async def save_output_care(payload: OutputCareIn, session: SessionDep,
                           admin: RequireAdmin) -> OutputCareOut:
    try:
        service.parse_time(payload.daily_time)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Pick a time of day, like 07:00") from None
    saved = await service.load_settings(session)
    before = (saved.daily_enabled, saved.daily_time, saved.watchdog_enabled)
    saved.daily_enabled = payload.daily_enabled
    saved.daily_time = payload.daily_time
    saved.watchdog_enabled = payload.watchdog_enabled
    if saved.daily_enabled and (not before[0] or before[1] != saved.daily_time):
        service.start_from_now(saved)
    if before != (saved.daily_enabled, saved.daily_time, saved.watchdog_enabled):
        h, m = service.parse_time(saved.daily_time)
        at = datetime(2000, 1, 1, h, m).strftime("%I:%M %p").lstrip("0")
        daily = f"every day at {at}" if saved.daily_enabled else "never"
        watchdog = "on" if saved.watchdog_enabled else "off"
        session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="output_care",
                          message=f"{admin.username} set the outputs to restart {daily}, "
                                  f"and the picture watchdog {watchdog}"))
    await session.flush()
    out = await _out(session)
    await session.commit()
    bus.publish("output_care", {})
    return out
