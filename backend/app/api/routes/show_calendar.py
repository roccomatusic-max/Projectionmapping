"""The show calendar: shows planned ahead, night by night.

Entries are one date, a run of dates, or repeating weekdays, each with a
scene group and a start and end time, or a "no show" entry. The scheduler
in services/tonight.py plays them; services/show_calendar.py decides which
show times each night has.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import RequireOperator, RequireViewer, SessionDep, write_rate_limit
from app.api.routes.mapping import _load_show
from app.config import settings
from app.core.events import bus
from app.db.models import (
    Event,
    MappingPlaylist,
    MappingSceneGroup,
    Severity,
    ShowCalendarEntry,
)
from app.schemas.show_calendar import (
    CalendarDay,
    CalendarOut,
    CalendarSlot,
    EntryIn,
    EntryOut,
    Skipped,
)
from app.services import tonight as service
from app.services.show_calendar import Planner, entry_title

router = APIRouter(tags=["calendar"])

#: The most days one calendar read covers (six weeks of a month view, and then some).
MAX_DAYS = 124


def _changed() -> None:
    bus.publish("calendar", {})
    service.changed()


def _bad(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


async def _load_entry(session, entry_id: int) -> ShowCalendarEntry:
    entry = await session.get(ShowCalendarEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Calendar entry {entry_id} not found")
    return entry


async def _checked(session, payload: EntryIn) -> dict:
    """The entry's fields, once they make sense together."""
    if payload.end_date is not None and payload.end_date < payload.start_date:
        raise _bad("The last night has to be on or after the first night")
    if not payload.days:
        raise _bad("Pick at least one night of the week")
    fields = payload.model_dump()
    fields["start_date"] = payload.start_date.isoformat()
    fields["end_date"] = payload.end_date.isoformat() if payload.end_date else None
    if payload.kind == "off":
        fields.update(show_id=None, group_id=None, playlist_id=None, start_at=None, end_at=None)
        return fields
    if not (payload.start_at and payload.end_at):
        raise _bad("Set both a start time and an end time")
    if payload.start_at == payload.end_at:
        raise _bad("The end time has to be different from the start time")
    show_id = payload.show_id
    if payload.playlist_id is not None:
        playlist = await session.get(MappingPlaylist, payload.playlist_id)
        if playlist is None:
            raise _bad(f"Unknown playlist {payload.playlist_id}")
        if show_id is not None and playlist.show_id != show_id:
            raise _bad("That playlist belongs to another show")
        show_id = playlist.show_id
        fields["group_id"] = None
    elif payload.group_id is not None:
        group = await session.get(MappingSceneGroup, payload.group_id)
        if group is None:
            raise _bad(f"Unknown scene group {payload.group_id}")
        if show_id is not None and group.show_id != show_id:
            raise _bad("That scene group belongs to another show")
        show_id = group.show_id
    if show_id is None:
        show_id = (await service.load_plan(session)).show_id
    if show_id is None:
        raise _bad("Pick a scene group, or a show")
    await _load_show(session, show_id)
    fields["show_id"] = show_id
    return fields


async def _title(session, entry: ShowCalendarEntry) -> str:
    planner = await Planner.load(session, await service.load_plan(session))
    return entry_title(entry, planner.group_names, planner.playlist_names)


def _when(entry: ShowCalendarEntry) -> str:
    if entry.end_date == entry.start_date:
        return entry.start_date
    return f"{entry.start_date} to {entry.end_date or 'no end'}"


@router.get("/calendar", response_model=CalendarOut)
async def get_calendar(session: SessionDep, _: RequireViewer,
                       start: date | None = Query(default=None),
                       days: int = Query(default=42, ge=1, le=MAX_DAYS)) -> CalendarOut:
    """Every night from ``start`` for ``days`` nights: its show times, and what is left out."""
    now = datetime.now(settings.tz)
    plan = await service.load_plan(session)
    planner = await Planner.load(session, plan)
    first = start or now.date()
    out: list[CalendarDay] = []
    for offset in range(days):
        night = planner.night(first + timedelta(days=offset), now.tzinfo)
        slots = []
        for slot in night.slots:
            if slot.source == "weekly" and night.night < now.date():
                continue  # the weekly time today stands for the future, not past nights
            state = "done" if slot.end <= now else "running" if slot.start <= now else "later"
            slots.append(CalendarSlot(state=state, **service._slot_out(
                slot, planner.group_names, planner.playlist_names)))
        cancelled = night.cancelled_by
        out.append(CalendarDay(
            date=night.night,
            slots=slots,
            cancelled_by=Skipped(entry_id=cancelled.id,
                                 title=entry_title(cancelled, planner.group_names),
                                 reason="no show") if cancelled else None,
            skipped=[Skipped(entry_id=i, title=t, reason=r) for i, t, r in night.skipped],
        ))
    await session.commit()  # the plan row is made on first read
    return CalendarOut(timezone=service.tz_name(), today=now.date(), days=out,
                       entries=[EntryOut.model_validate(e) for e in planner.entries])


@router.get("/calendar/entries", response_model=list[EntryOut])
async def list_entries(session: SessionDep, _: RequireViewer) -> list[ShowCalendarEntry]:
    plan = await service.load_plan(session)
    return (await Planner.load(session, plan)).entries


@router.post("/calendar/entries", response_model=EntryOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(write_rate_limit)])
async def create_entry(payload: EntryIn, session: SessionDep,
                       user: RequireOperator) -> ShowCalendarEntry:
    entry = ShowCalendarEntry(**await _checked(session, payload))
    session.add(entry)
    await session.flush()
    title = await _title(session, entry)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="calendar_added",
                      message=f"{user.username} put {title} on the "
                              f"calendar ({_when(entry)})"))
    await session.commit()
    await session.refresh(entry)
    _changed()
    return entry


@router.put("/calendar/entries/{entry_id}", response_model=EntryOut,
            dependencies=[Depends(write_rate_limit)])
async def update_entry(entry_id: int, payload: EntryIn, session: SessionDep,
                       user: RequireOperator) -> ShowCalendarEntry:
    entry = await _load_entry(session, entry_id)
    for field, value in (await _checked(session, payload)).items():
        setattr(entry, field, value)
    title = await _title(session, entry)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="calendar_changed",
                      message=f"{user.username} changed {title} on the "
                              f"calendar ({_when(entry)})"))
    await session.commit()
    await session.refresh(entry)
    _changed()
    return entry


@router.delete("/calendar/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT,
               response_model=None, dependencies=[Depends(write_rate_limit)])
async def delete_entry(entry_id: int, session: SessionDep, user: RequireOperator) -> None:
    entry = await _load_entry(session, entry_id)
    title = await _title(session, entry)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="calendar_removed",
                      message=f"{user.username} took {title} off the "
                              f"calendar ({_when(entry)})"))
    await session.delete(entry)
    await session.commit()
    _changed()
