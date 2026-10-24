"""Tonight's show: scene groups, and starting and stopping the show on time.

A scene group is a named choice of scene for every projector in a show.
Using one writes it into every cue of the show (the cue's scene and its
"Scenes on each projector" choices), so the projectors follow it at once,
mid-cue included, through the same path the Scenes page uses.

The show plan says which show and group play tonight and from when to
when. The scheduler here checks it every 20 seconds:

* At the start time it uses the group, presses GO on the first cue and,
  when asked to, turns the show's projectors on. A start time that has
  already passed while the show time is still on (the plan was just set,
  or the server restarted mid-show) starts the show straight away, so a
  power cut during the evening does not leave the building dark.
* At the end time it stops the show and, when asked to, turns the
  projectors off. It only ends a night it started.

The emergency stop wins: while it is on, a start is skipped (and not tried
again that night) and nothing is turned on.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy import select

from app.config import settings
from app.core.events import bus
from app.core.lifecycle import stop_task, wait_or_stop
from app.db.models import (
    Event,
    MappingCue,
    MappingOutput,
    MappingSceneGroup,
    MappingShow,
    Projector,
    Severity,
    ShowPlan,
)
from app.db.session import session_scope
from app.drivers import CommandOutcome
from app.services.mapping import TransportError, transport

log = logging.getLogger(__name__)

TICK_SECONDS = 20
#: How long after the end time a night is still ended (the server was down
#: at the end time). Later than this, nothing is switched off by surprise.
END_GRACE = timedelta(hours=6)

_TOOK_IT = {CommandOutcome.CONFIRMED.value, CommandOutcome.ACCEPTED.value,
            CommandOutcome.OK.value, CommandOutcome.QUEUED.value}


@dataclass(frozen=True)
class Window:
    night: date
    start: datetime
    end: datetime


def _parse(value: str | None) -> time | None:
    if not value:
        return None
    hours, minutes = value.split(":")
    return time(int(hours), int(minutes))


def window_for(plan: ShowPlan, night: date, tz) -> Window | None:
    """The show time that starts on ``night``, if the plan runs that night."""
    start_t, end_t = _parse(plan.start_at), _parse(plan.end_at)
    if start_t is None or end_t is None or night.weekday() not in (plan.days or []):
        return None
    start = datetime.combine(night, start_t, tzinfo=tz)
    end = datetime.combine(night, end_t, tzinfo=tz)
    if end <= start:
        end += timedelta(days=1)  # ends after midnight
    return Window(night, start, end)


def current_window(plan: ShowPlan, now: datetime) -> Window | None:
    for night in (now.date() - timedelta(days=1), now.date()):
        win = window_for(plan, night, now.tzinfo)
        if win and win.start <= now < win.end:
            return win
    return None


def next_start(plan: ShowPlan, now: datetime) -> datetime | None:
    for offset in range(8):
        win = window_for(plan, now.date() + timedelta(days=offset), now.tzinfo)
        if win and win.start > now:
            return win.start
    return None


def tz_name() -> str:
    zone = settings.tz
    return getattr(zone, "key", None) or str(zone)


def clock(value: datetime) -> str:
    """6:00 PM, as people say it."""
    return value.strftime("%I:%M %p").lstrip("0")


async def load_plan(session) -> ShowPlan:
    """The one plan row, made on first use."""
    plan = (await session.execute(select(ShowPlan).order_by(ShowPlan.id))).scalars().first()
    if plan is None:
        plan = ShowPlan(enabled=False, days=list(range(7)), power=True, last_message="")
        session.add(plan)
    if plan.show_id is None:
        # A server with exactly one show plans that one without asking.
        shows = (await session.execute(select(MappingShow.id).limit(2))).scalars().all()
        if len(shows) == 1:
            plan.show_id = shows[0]
    await session.flush()
    return plan


async def describe(session, now: datetime | None = None) -> dict[str, Any]:
    """Tonight's plan and where in it we are, for the home page."""
    plan = await load_plan(session)
    now = now or datetime.now(settings.tz)
    show = await session.get(MappingShow, plan.show_id) if plan.show_id else None
    group = await session.get(MappingSceneGroup, plan.group_id) if plan.group_id else None
    timed = bool(plan.enabled and plan.start_at and plan.end_at)
    win = current_window(plan, now) if timed else None
    today = window_for(plan, now.date(), now.tzinfo) if timed else None
    if not timed:
        state = "off"
    elif win:
        state = "running"
    elif today and now < today.start:
        state = "later"
    elif today:
        state = "done"
    else:
        state = "not_tonight"
    shown = win or today
    return {
        "show_id": show.id if show else None,
        "show_name": show.name if show else None,
        "group_id": group.id if group else None,
        "group_name": group.name if group else None,
        "enabled": plan.enabled,
        "start_at": plan.start_at,
        "end_at": plan.end_at,
        "days": list(plan.days or []),
        "power": plan.power,
        "state": state,
        "starts_at": shown.start if shown else None,
        "ends_at": shown.end if shown else None,
        "next_starts_at": next_start(plan, now) if timed else None,
        "last_message": plan.last_message or "",
        "timezone": tz_name(),
    }


def changed() -> None:
    bus.publish("tonight", {})


async def apply_group(session, group: MappingSceneGroup) -> int:
    """Set the group's scenes on every cue of its show. Returns the cue count."""
    cues = (await session.execute(
        select(MappingCue).where(MappingCue.show_id == group.show_id)
    )).scalars().all()
    for cue in cues:
        cue.scene_id = group.scene_id
        cue.output_scenes = {str(k): v for k, v in (group.output_scenes or {}).items()}
    return len(cues)


async def _projector_ids(session, show_id: int) -> list[int]:
    """The projectors the show's outputs drive; every projector if none are linked."""
    linked = (await session.execute(
        select(Projector.id).join(MappingOutput, MappingOutput.projector_id == Projector.id)
        .where(MappingOutput.show_id == show_id, Projector.enabled.is_(True))
        .distinct()
    )).scalars().all()
    if linked:
        return list(linked)
    return list((await session.execute(
        select(Projector.id).where(Projector.enabled.is_(True))
    )).scalars().all())


async def _power(ids: list[int], state: str) -> str:
    from app.services.audit import log_command_results
    from app.services.device_manager import Priority, manager

    if not ids:
        return ""
    results = await manager.dispatch_many(ids, "power.set", {"state": state},
                                          priority=Priority.AUTOMATION)
    await log_command_results(results, "power.set", {"state": state},
                              source="tonight", username="Tonight's show")
    failed = [r.get("name") or f"projector {r['projector_id']}"
              for r in results if r.get("outcome") not in _TOOK_IT]
    verb = "on" if state == "on" else "off"
    if not failed:
        return f"{len(results)} projector{'s' if len(results) != 1 else ''} turning {verb}."
    return (f"{len(results) - len(failed)} of {len(results)} projectors turning {verb}; "
            f"{', '.join(failed)} did not answer.")


async def start_show(*, by: str) -> tuple[bool, str]:
    """Use tonight's group, GO on the first cue, turn the projectors on."""
    if transport.snapshot().emergency is not None:
        return False, "The emergency stop is on, so the show was not started. Clear it first."
    async with session_scope() as session:
        plan = await load_plan(session)
        if plan.show_id is None:
            return False, "Pick tonight's scenes first."
        show_id, power = plan.show_id, plan.power
        group = await session.get(MappingSceneGroup, plan.group_id) if plan.group_id else None
        if group is not None and group.show_id == show_id:
            await apply_group(session, group)
        ids = await _projector_ids(session, show_id) if power else []
    bus.publish("mapping_show", {"show_id": show_id})

    parts: list[str] = []
    ok = True
    state = transport.snapshot()
    if state.show_id == show_id and state.status in ("playing", "paused"):
        if state.status == "paused":
            await transport.command("resume")
        parts.append("The show was already playing.")
    else:
        try:
            await transport.command("goto", show_id=show_id, cue=0)
            parts.append("The show is playing.")
        except TransportError as exc:
            ok = False
            parts.append(f"The show did not start: {exc}.")
    if power:
        parts.append(await _power(ids, "on"))
    message = " ".join(p for p in parts if p)
    await _record(f"Started by {by} at {clock(datetime.now(settings.tz))}. {message}",
                  severity=Severity.INFO if ok else Severity.WARNING, kind="tonight_started")
    return ok, message


async def stop_show(*, by: str, power_off: bool) -> tuple[bool, str]:
    """Stop the show; turn its projectors off when asked."""
    async with session_scope() as session:
        plan = await load_plan(session)
        show_id = plan.show_id
        ids = await _projector_ids(session, show_id) if power_off and show_id else []
    parts: list[str] = []
    if transport.snapshot().status in ("playing", "paused"):
        await transport.command("stop")
        parts.append("The show is stopped.")
    else:
        parts.append("The show was already stopped.")
    if power_off:
        parts.append(await _power(ids, "off"))
    message = " ".join(p for p in parts if p)
    await _record(f"Stopped by {by} at {clock(datetime.now(settings.tz))}. {message}",
                  severity=Severity.INFO, kind="tonight_stopped")
    return True, message


async def _record(message: str, *, severity: Severity, kind: str) -> None:
    async with session_scope() as session:
        plan = await load_plan(session)
        plan.last_message = message
        session.add(Event(projector_id=None, severity=severity.value, kind=kind,
                          message=f"Tonight's show: {message}"))
    changed()


class TonightScheduler:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        #: The night this server process started (or found playing); a
        #: restart forgets it, which is what lets a show resume after one.
        self._started_night: date | None = None

    async def start(self) -> None:
        if self._task is not None:
            return
        self._stop = asyncio.Event()
        self._task = asyncio.create_task(self._loop(), name="tonight-scheduler")

    async def stop(self) -> None:
        self._stop.set()
        await stop_task(self._task, name="tonight scheduler")
        self._task = None

    def mark_started(self, night: date | None) -> None:
        """A start by hand during tonight's show time counts as tonight's start."""
        self._started_night = night

    async def _loop(self) -> None:
        while True:
            try:
                await self.tick()
            except asyncio.CancelledError:
                return
            except Exception:  # noqa: BLE001
                log.exception("tonight's show check failed")
            if await wait_or_stop(self._stop, TICK_SECONDS):
                return

    async def tick(self, now: datetime | None = None) -> None:
        now = now or datetime.now(settings.tz)
        async with session_scope() as session:
            plan = await load_plan(session)
            if not (plan.enabled and plan.show_id and plan.start_at and plan.end_at):
                return
            win = current_window(plan, now)
            ending = self._due_end(plan, now)
            last_start = plan.last_start_date
            show_id, power = plan.show_id, plan.power

        if win is not None and self._started_night != win.night:
            night = win.night.isoformat()
            state = transport.snapshot()
            self._started_night = win.night
            if last_start == night and state.show_id == show_id and state.status == "playing":
                return  # already going (started by hand, or before a page reload)
            await self._mark(start=night)
            if state.emergency is not None:
                await _record(
                    f"Not started at {clock(win.start)} because the emergency stop is on.",
                    severity=Severity.WARNING, kind="tonight_held")
                return
            await start_show(by="the schedule")
        elif ending is not None:
            await self._mark(end=ending.night.isoformat())
            await stop_show(by="the schedule", power_off=power)

    @staticmethod
    def _due_end(plan: ShowPlan, now: datetime) -> Window | None:
        for night in (now.date() - timedelta(days=1), now.date()):
            win = window_for(plan, night, now.tzinfo)
            if (win and win.end <= now < win.end + END_GRACE
                    and plan.last_start_date == night.isoformat()
                    and plan.last_end_date != night.isoformat()):
                return win
        return None

    @staticmethod
    async def _mark(*, start: str | None = None, end: str | None = None) -> None:
        async with session_scope() as session:
            plan = await load_plan(session)
            if start is not None:
                plan.last_start_date = start
                plan.last_end_date = None
            if end is not None:
                plan.last_end_date = end
            plan.updated_at = datetime.now(UTC)


scheduler = TonightScheduler()
