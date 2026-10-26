"""Tonight's show: scene groups, and starting and stopping the show on time.

A scene group is a named choice of scene for every projector in a show.
Using one writes it into every cue of the show (the cue's scene and its
"Scenes on each projector" choices), so the projectors follow it at once,
mid-cue included, through the same path the Scenes page uses.

The show plan says which show and group play and from when to when, every
week; the show calendar (services/show_calendar.py) plans single nights,
runs of nights and repeats ahead, and wins on the nights it has something
for. The scheduler here checks both every 20 seconds:

* At the start time it uses the group, presses GO on the first cue and,
  when asked to, turns the show's projectors on. A start time that has
  already passed while the show time is still on (the plan was just set,
  or the server restarted mid-show) starts the show straight away, so a
  power cut during the evening does not leave the building dark.
* At the end time it stops the show and, when asked to, turns the
  projectors off. It only ends a show time it started.
* A night can have more than one show time from the calendar. When one
  ends exactly as the next starts, the show keeps playing with the next
  one's scene group and the projectors stay on.

A show time can play a playlist instead of one group (services/playlists.py):
"Spooky from 6:45, Pumpkins from 8:00, Quiet from 9:30". The scheduler moves
the projectors on to each step as its time comes, crossfading the scenes.

The emergency stop wins: while it is on, a start is skipped (and not tried
again that night) and nothing is turned on.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
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
from app.services.playlists import TimedStep, active, timeline
from app.services.show_calendar import Planner, Slot

log = logging.getLogger(__name__)

TICK_SECONDS = 20
#: How long after the end time a night is still ended (the server was down
#: at the end time). Later than this, nothing is switched off by surprise.
END_GRACE = timedelta(hours=6)

_TOOK_IT = {CommandOutcome.CONFIRMED.value, CommandOutcome.ACCEPTED.value,
            CommandOutcome.OK.value, CommandOutcome.QUEUED.value}


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


def _slot_out(slot: Slot, group_names: dict[int, str],
              playlist_names: dict[int, str] | None = None) -> dict[str, Any]:
    return {
        "key": slot.key,
        "source": slot.source,
        "entry_id": slot.entry_id,
        "title": slot.title,
        "show_id": slot.show_id,
        "group_id": slot.group_id,
        "group_name": group_names.get(slot.group_id or 0),
        "starts_at": slot.start,
        "ends_at": slot.end,
        "power": slot.power,
        "playlist_id": slot.playlist_id,
        "playlist_name": (playlist_names or {}).get(slot.playlist_id or 0),
    }


def _steps_out(planner: Planner, slot: Slot, now: datetime) -> list[dict[str, Any]]:
    """A show time's playlist steps, with which one plays now."""
    steps = planner.steps(slot)
    playing = active(steps, now) if slot.start <= now < slot.end else None
    out = []
    for place_in_list, step in enumerate(steps):
        if step.at >= slot.end:
            state = "never"  # after the show time ends
        elif now >= slot.end or (playing is not None and place_in_list < playing):
            state = "done"
        elif place_in_list == playing:
            state = "now"
        else:
            state = "later"
        out.append({
            "group_id": step.group_id,
            "group_name": planner.group_names.get(step.group_id or 0),
            "starts_at": max(step.at, slot.start),
            "fade_seconds": step.fade_seconds,
            "state": state,
        })
    return out


async def describe(session, now: datetime | None = None) -> dict[str, Any]:
    """Tonight's plan and where in it we are, for the home page."""
    plan = await load_plan(session)
    planner = await Planner.load(session, plan)
    now = now or datetime.now(settings.tz)
    tonight = planner.night(now.date(), now.tzinfo)
    current = planner.current(now)
    upcoming = next((s for s in tonight.slots if s.start > now), None)
    if not planner.anything_planned(now.date()):
        state, shown = "off", None
    elif current:
        state, shown = "running", current
    elif upcoming:
        state, shown = "later", upcoming
    elif tonight.slots:
        state, shown = "done", tonight.slots[-1]
    else:
        state, shown = "not_tonight", None
    show_id = shown.show_id if shown and shown.show_id else plan.show_id
    group_id = planner.group_at(shown, now)[0] if shown else plan.group_id
    playlist_id = shown.playlist_id if shown else (
        plan.playlist_id if plan.playlist_id in planner.playlists else None)
    show = await session.get(MappingShow, show_id) if show_id else None
    group = await session.get(MappingSceneGroup, group_id) if group_id else None
    following = planner.next_start(now) if state != "off" else None
    names = planner.group_names
    playlist_names = planner.playlist_names
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
        "next_starts_at": following.start if following else None,
        "source": shown.source if shown else None,
        "title": shown.title if shown else None,
        "entry_id": shown.entry_id if shown else None,
        "tonight_slots": [_slot_out(slot, names, playlist_names) for slot in tonight.slots],
        "playlist_id": playlist_id,
        "playlist_name": playlist_names.get(playlist_id or 0),
        "playlist_steps": _steps_out(planner, shown, now) if shown else [],
        "plan_group_id": plan.group_id,
        "plan_playlist_id": plan.playlist_id if plan.playlist_id in planner.playlists else None,
        "cancelled_by": (tonight.cancelled_by.title or "No show") if tonight.cancelled_by else None,
        "next_title": following.title if following else None,
        "last_message": plan.last_message or "",
        "timezone": tz_name(),
    }


async def show_time(session, now: datetime | None = None) -> tuple[Slot | None, Slot | None]:
    """The show time on now, if any, and the next one to start."""
    plan = await load_plan(session)
    planner = await Planner.load(session, plan)
    now = now or datetime.now(settings.tz)
    return planner.current(now), planner.next_start(now)


async def tonights_group_ids(session) -> set[int]:
    """The scene groups the plan plays now or later today.

    Of a playlist, only the step playing now counts: changing a group that
    plays later in the night waits for its turn.
    """
    plan = await load_plan(session)
    planner = await Planner.load(session, plan)
    now = datetime.now(settings.tz)
    current = planner.current(now)
    ids = {s.group_id for s in planner.recent(now)
           if s.end > now and s.group_id and s.playlist_id is None}
    if current is not None and current.playlist_id is not None:
        live = planner.group_at(current, now)[0]
        if live:
            ids.add(live)
    if (plan.group_id and plan.playlist_id is None
            and (current is None or current.source == "weekly")):
        ids.add(plan.group_id)
    return ids


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


async def start_show(*, by: str, slot: Slot | None = None,
                     now: datetime | None = None) -> tuple[bool, str]:
    """Use tonight's group, GO on the first cue, turn the projectors on.

    Without a show time given, it plays the one on now, else the next one
    later today, else the weekly plan's show and group. A playlist starts
    on the step its time says, or its first step before then.
    """
    if transport.snapshot().emergency is not None:
        return False, "The emergency stop is on, so the show was not started. Clear it first."
    now = now or datetime.now(settings.tz)
    async with session_scope() as session:
        plan = await load_plan(session)
        planner = await Planner.load(session, plan)
        if slot is None:
            slot = planner.current(now) or next(
                (s for s in planner.slots(now.date(), now.tzinfo) if s.start > now), None)
        step: TimedStep | None = None
        if slot is not None and slot.show_id is not None:
            show_id, power = slot.show_id, slot.power
            group_id, step = planner.group_at(slot, now)
        else:
            show_id, group_id, power = plan.show_id, plan.group_id, plan.power
            if plan.playlist_id in planner.playlists:
                steps = timeline(planner.playlists[plan.playlist_id][1], now)
                group_id = steps[0].group_id if steps else group_id
        if show_id is None:
            return False, "Pick tonight's scenes first."
        group = await session.get(MappingSceneGroup, group_id) if group_id else None
        if group is not None and group.show_id == show_id:
            await apply_group(session, group)
        if step is not None and slot is not None and slot.start <= now < slot.end:
            scheduler.note_step(slot.key, step.index, group_id)
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


async def stop_show(*, by: str, power_off: bool, show_id: int | None = None) -> tuple[bool, str]:
    """Stop the show; turn its projectors off when asked."""
    async with session_scope() as session:
        plan = await load_plan(session)
        show_id = show_id or transport.snapshot().show_id or plan.show_id
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


async def switch_group(show_id: int, group_id: int | None, fade_seconds: float) -> str | None:
    """Put a group on the show's cues, crossfading the scenes when it plays.

    Returns the group's name, or None when it is not one of the show's.
    """
    state = transport.snapshot()
    async with session_scope() as session:
        group = await session.get(MappingSceneGroup, group_id) if group_id else None
        if group is None or group.show_id != show_id:
            return None
        live = state.current if state.show_id == show_id else None
        cue = (await session.get(MappingCue, live.id)
               if live is not None and live.id > 0 else None)
        before = (cue.scene_id, dict(cue.output_scenes or {})) if cue else None
        await apply_group(session, group)
        after = (group.scene_id, {str(k): v for k, v in (group.output_scenes or {}).items()})
        name = group.name
    # The outputs hear of the fade first, then of the new scenes, so they
    # never cut straight to the new ones.
    if before is not None and before != after:
        await transport.fade_scenes(show_id=show_id, scene_id=before[0],
                                    output_scenes=before[1], fade_seconds=fade_seconds)
    bus.publish("mapping_show", {"show_id": show_id})
    return name


async def use_playlist_now(playlist_id: int) -> None:
    """A playlist just picked for the weekly show time: put its step on now.

    During the show time that is the step due now, faded in; otherwise its
    first step, so the projectors are ready when the show starts. A show
    time from the calendar playing now keeps going.
    """
    now = datetime.now(settings.tz)
    async with session_scope() as session:
        plan = await load_plan(session)
        planner = await Planner.load(session, plan)
        current = planner.current(now)
        if current is not None and current.playlist_id != playlist_id:
            return
        if current is not None:
            group_id, step = planner.group_at(current, now)
        else:
            steps = timeline(planner.playlists.get(playlist_id, ("", []))[1], now)
            step = steps[0] if steps else None
            group_id = step.group_id if step else None
        show_id = plan.show_id
    if step is None or show_id is None:
        return
    if current is not None:
        scheduler.note_step(current.key, step.index, group_id)
    await switch_group(show_id, group_id, step.fade_seconds)


class TonightScheduler:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        #: The show time this server process started (or found playing); a
        #: restart forgets it, which is what lets a show resume after one.
        self._started_key: str | None = None
        #: The playlist step on the projectors: (show time key, step, group).
        self._step: tuple[str, int, int | None] | None = None

    async def start(self) -> None:
        if self._task is not None:
            return
        self._stop = asyncio.Event()
        self._task = asyncio.create_task(self._loop(), name="tonight-scheduler")

    async def stop(self) -> None:
        self._stop.set()
        await stop_task(self._task, name="tonight scheduler")
        self._task = None

    def mark_started(self, key: str | None) -> None:
        """A start by hand during a show time counts as that show time's start."""
        self._started_key = key

    def note_step(self, key: str, index: int, group_id: int | None) -> None:
        """This playlist step is what the projectors play now."""
        self._step = (key, index, group_id)

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
            planner = await Planner.load(session, plan)
            current = planner.current(now)
            if current is not None and current.show_id is None:
                current = None
            ending = self._due_end(planner, plan, now)
            last_start = plan.last_start_key
            group_id, step = planner.group_at(current, now) if current else (None, None)

        if current is not None and self._started_key != current.key:
            state = transport.snapshot()
            self._started_key = current.key
            if (last_start == current.key and state.show_id == current.show_id
                    and state.status == "playing"):
                return  # already going (started by hand, or before a page reload)
            await self._mark(start=current)
            if state.emergency is not None:
                await _record(
                    f"Not started at {clock(current.start)} because the emergency stop is on.",
                    severity=Severity.WARNING, kind="tonight_held")
                return
            await start_show(by="the schedule", slot=current, now=now)
        elif ending is not None:
            await self._mark(end=ending)
            await stop_show(by="the schedule", power_off=ending.power, show_id=ending.show_id)
        elif (current is not None and step is not None
              and self._step != (current.key, step.index, group_id)):
            await self._next_step(current, step, group_id)

    async def _next_step(self, slot: Slot, step: TimedStep, group_id: int | None) -> None:
        """Move a playing show on to the playlist step whose time has come.

        Only while the show plays (or is paused): a show stopped by hand
        stays stopped, and Start now picks the right step anyway.
        """
        state = transport.snapshot()
        if (state.emergency is not None or state.show_id != slot.show_id
                or state.status not in ("playing", "paused")):
            return
        self._step = (slot.key, step.index, group_id)
        name = await switch_group(slot.show_id, group_id, step.fade_seconds)
        if name is None:
            return
        fade = (f", fading over {step.fade_seconds:g} seconds" if step.fade_seconds > 0
                else "")
        await _record(f"{slot.title}: {name} from {clock(max(step.at, slot.start))}{fade}.",
                      severity=Severity.INFO, kind="tonight_playlist")

    @staticmethod
    def _due_end(planner: Planner, plan: ShowPlan, now: datetime) -> Slot | None:
        for slot in planner.recent(now):
            if (slot.end <= now < slot.end + END_GRACE
                    and plan.last_start_key == slot.key
                    and plan.last_end_key != slot.key):
                return slot
        return None

    @staticmethod
    async def _mark(*, start: Slot | None = None, end: Slot | None = None) -> None:
        async with session_scope() as session:
            plan = await load_plan(session)
            if start is not None:
                plan.last_start_key = start.key
                plan.last_start_date = start.night.isoformat()
                plan.last_end_key = None
                plan.last_end_date = None
            if end is not None:
                plan.last_end_key = end.key
                plan.last_end_date = end.night.isoformat()
            plan.updated_at = datetime.now(UTC)


scheduler = TonightScheduler()
