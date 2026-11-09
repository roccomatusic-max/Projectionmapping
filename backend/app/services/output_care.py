"""Keeping a picture on every projector (Mapping → Players → Keep the picture on).

Two things, both done by closing and reopening the output on a mini PC
(the same as its Restart output button), never by restarting the computer:

* **The daily restart.** At a set time every day (7:00 in the morning to
  begin with, the server's own clock), every mini PC's output is restarted,
  so a browser that has been open for days starts fresh. While a show is
  on, about to start, or an automation runs, it waits and does it as soon
  as that is over. A server that was off at that time does it when it comes
  back, up to six hours late; later than that, it waits for the next day.

* **The picture watchdog.** While a show should be on (one is playing or
  paused, or it is show time on the Calendar; not during a blackout or the
  emergency stop) every ten seconds it asks each mini PC with an output:
  is its output page answering, is it drawing frames, is it showing the
  output rather than "Waiting for an output"? A mini PC that fails for
  half a minute has its output restarted. It is then left alone for two
  minutes to come back. After three restarts in an hour that did not help,
  it stops trying for the rest of that hour and raises an alert instead,
  because something else is wrong (the graphics card, the cable).

A mini PC that is off or off the network has nothing to restart: the
"stopped reporting" alert (services/alerts.py) covers it. A mini PC
installing an update of its app is left alone.

What the watchdog cannot see: a picture that is there but wrong (dark on
purpose, a scene with nothing in it yet). It looks at whether the output
is alive and drawing, not at what it draws.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.config import settings
from app.core.events import bus
from app.core.lifecycle import stop_task, wait_or_stop
from app.db.models import Event, MappingPlayer, OutputCare, Severity
from app.db.session import session_scope

log = logging.getLogger(__name__)

DEFAULT_TIME = "07:00"
TICK_SECONDS = 10.0
#: After the server starts, mini PCs need a moment to find it again.
START_GRACE = 120.0
#: No picture for this long, then the output is restarted.
BAD_SECONDS = 30.0
#: After a restart, the output has this long to come back before it is judged again.
COMEBACK_SECONDS = 120.0
#: At most this many watchdog restarts of one mini PC in an hour.
MAX_PER_HOUR = 3
#: The output page's last frame older than this: it has stopped drawing.
FRAME_STALE_MS = 15000.0
#: A server that was off at the daily time still does it this much later.
CATCH_UP = timedelta(hours=6)
#: Kept in memory for the Players page.
HISTORY = 10


def parse_time(value: str) -> tuple[int, int]:
    """ "07:00" → (7, 0); raises ValueError for anything else."""
    hours, _, minutes = value.partition(":")
    h, m = int(hours), int(minutes)
    if not (len(hours) == 2 and len(minutes) == 2 and 0 <= h <= 23 and 0 <= m <= 59):
        raise ValueError(value)
    return h, m


def clock(value: datetime) -> str:
    """7:05 AM, in the server's own time."""
    return value.astimezone(settings.tz).strftime("%I:%M %p").lstrip("0")


async def load_settings(session) -> OutputCare:
    row = (await session.execute(select(OutputCare).order_by(OutputCare.id))).scalars().first()
    if row is None:
        row = OutputCare(daily_enabled=True, daily_time=DEFAULT_TIME, watchdog_enabled=True)
        start_from_now(row)
        session.add(row)
        await session.flush()
    return row


def start_from_now(saved: OutputCare, now: datetime | None = None) -> None:
    """The daily restart was just turned on or moved: it next runs at that
    time today if that is still to come, otherwise tomorrow. Never at once
    for a time already gone by today."""
    local = (now or datetime.now(UTC)).astimezone(settings.tz)
    try:
        h, m = parse_time(saved.daily_time)
    except ValueError:
        h, m = parse_time(DEFAULT_TIME)
    gone = local >= local.replace(hour=h, minute=m, second=0, microsecond=0)
    saved.last_daily_on = local.date().isoformat() if gone else None


def next_daily(saved: OutputCare, now: datetime) -> datetime | None:
    """When the daily restart runs next (aware, local), or None when it is off."""
    if not saved.daily_enabled:
        return None
    try:
        h, m = parse_time(saved.daily_time)
    except ValueError:
        h, m = parse_time(DEFAULT_TIME)
    local = now.astimezone(settings.tz)
    due = local.replace(hour=h, minute=m, second=0, microsecond=0)
    if saved.last_daily_on == local.date().isoformat() or local - due > CATCH_UP:
        due = (due + timedelta(days=1)).replace(hour=h, minute=m)
    return due


def problem_of(player: MappingPlayer, *, app: bool, online: bool) -> str | None:
    """What is wrong with this mini PC's output ("not answering"), or None
    when it is fine, or when restarting its output could not help (it is off).
    Read as "its output is …"."""
    if not online:
        return "not answering" if app else None
    report = player.report or {}
    if report.get("showing") == "waiting":
        return "stuck on “Waiting for an output”"
    age = report.get("frame_age_ms")
    if isinstance(age, int | float) and age > FRAME_STALE_MS:
        return "not drawing"
    return None


@dataclass
class Watch:
    """The watchdog's notes on one mini PC."""

    problem: str | None = None
    bad_since: float | None = None
    restarted: float | None = None
    restarts: deque = field(default_factory=lambda: deque(maxlen=MAX_PER_HOUR + 1))
    gave_up: bool = False
    #: (when, why) of its latest restarts, newest last, for the Players page.
    history: deque = field(default_factory=lambda: deque(maxlen=HISTORY))


class OutputCareService:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        self._started = time.monotonic()
        self._lock = asyncio.Lock()
        self.watches: dict[int, Watch] = {}
        #: Why the daily restart is waiting ("a show is playing"), or None.
        self.daily_waiting: str | None = None
        #: Why the watchdog is watching now ("a show is playing"), or None.
        self.watching: str | None = None

    async def start(self) -> None:
        if self._task is not None:
            return
        self._stop = asyncio.Event()
        self._started = time.monotonic()
        self._task = asyncio.create_task(self._loop(), name="output-care")

    async def stop(self) -> None:
        self._stop.set()
        await stop_task(self._task, name="output care")
        self._task = None

    async def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                await self.tick()
            except asyncio.CancelledError:
                return
            except Exception:  # noqa: BLE001 - never let one bad check end the loop
                log.exception("output care check failed")
            if await wait_or_stop(self._stop, TICK_SECONDS):
                return

    # -- one look ------------------------------------------------------------------

    async def tick(self, now: datetime | None = None, mono: float | None = None) -> None:
        from app.api.routes import mapping_players as players_api
        from app.services import minipc_updates

        async with self._lock:
            now = now or datetime.now(UTC)
            mono = time.monotonic() if mono is None else mono
            async with session_scope() as session:
                saved = await load_settings(session)
                players = (await session.execute(
                    select(MappingPlayer).where(MappingPlayer.approved.is_(True),
                                                MappingPlayer.output_id.is_not(None),
                                                MappingPlayer.kind == "player")
                    .order_by(MappingPlayer.id)
                )).scalars().all()
                for gone in set(self.watches) - {p.id for p in players}:
                    del self.watches[gone]
                changed = await self._daily(session, saved, players, now, mono, players_api)
                if saved.watchdog_enabled and mono - self._started >= START_GRACE:
                    self.watching = await show_should_be_on(session, now)
                else:
                    self.watching = None
                if self.watching:
                    updating = set(minipc_updates.get().jobs)
                    for player in players:
                        changed |= await self._watch(session, player, mono, now,
                                                     player.id in updating, players_api)
                else:
                    for watch in self.watches.values():
                        watch.bad_since = None
                        watch.problem = None
                await session.commit()
        if changed:
            bus.publish("output_care", {})

    async def _daily(self, session, saved: OutputCare, players, now: datetime, mono: float,
                     players_api) -> bool:
        due = next_daily(saved, now)
        if due is None or now < due:
            self.daily_waiting = None
            return False
        busy = await busy_reason(session, now)
        if busy:
            if busy != self.daily_waiting:
                log.info("daily output restart waits: %s", busy)
            self.daily_waiting = busy
            return False
        self.daily_waiting = None
        done, skipped = [], []
        for player in players:
            if not (players_api.is_online(player) or players_api.app_connected(player)):
                skipped.append(player.name)
                continue
            players_api.restart_output(player)
            watch = self.watches.setdefault(player.id, Watch())
            watch.restarted, watch.bad_since = mono, None
            watch.history.append((now, "daily restart"))
            done.append(player.name)
        note = (f"Restarted the output on {_names(done)}" if done else "No mini PC was on") + (
            f"; {_names(skipped)} {'was' if len(skipped) == 1 else 'were'} off" if skipped else "")
        saved.last_daily_on = now.astimezone(settings.tz).date().isoformat()
        saved.last_daily_at = now
        saved.last_daily_note = note
        session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="output_restart",
                          message=f"Daily restart: {note[0].lower()}{note[1:]}."))
        log.info("daily output restart: %s", note)
        return True

    async def _watch(self, session, player: MappingPlayer, mono: float, now: datetime,
                     updating: bool, players_api) -> bool:
        from app.services.alerts import alerting

        watch = self.watches.setdefault(player.id, Watch())
        if updating or (watch.restarted is not None and mono - watch.restarted < COMEBACK_SECONDS):
            watch.bad_since = None
            return False
        problem = problem_of(player, app=players_api.app_connected(player),
                             online=players_api.is_online(player))
        before = watch.problem
        watch.problem = problem
        if problem is None:
            watch.bad_since = None
            if watch.gave_up:
                watch.gave_up = False
                await alerting.resolve_alert(f"minipc_picture:{player.id}",
                                             f"Mini PC {player.name} is showing a picture again")
            return before is not None
        if watch.bad_since is None:
            watch.bad_since = mono
            return True
        if mono - watch.bad_since < BAD_SECONDS:
            return before != problem
        recent = [t for t in watch.restarts if mono - t < 3600]
        if len(recent) >= MAX_PER_HOUR:
            if not watch.gave_up:
                watch.gave_up = True
                await alerting.raise_alert(
                    dedupe_key=f"minipc_picture:{player.id}", projector_id=None,
                    kind="minipc_no_picture", severity=Severity.CRITICAL,
                    message=(f"Mini PC {player.name} has no picture during the show: its "
                             f"output is {problem}. "
                             f"Restarting its output {MAX_PER_HOUR} times did not help. Try "
                             "Restart computer on Mapping → Players, or check its cable."),
                    details={"player_id": player.id, "problem": problem})
                return True
            return False
        via = players_api.restart_output(player)
        watch.restarts.append(mono)
        watch.restarted, watch.bad_since, watch.problem = mono, None, None
        watch.history.append((now, problem))
        session.add(Event(projector_id=None, severity=Severity.WARNING.value, kind="output_restart",
                          message=f"No picture from mini PC {player.name} during the show "
                                  f"(its output was {problem}): restarted its output"
                                  + ("" if via == "app" else " by reloading the page") + "."))
        log.warning("restarted the output on %s: %s", player.name, problem)
        return True

    # -- for the Players page --------------------------------------------------------

    def status(self, saved: OutputCare, players, now: datetime | None = None) -> dict:
        now = now or datetime.now(UTC)
        mono = time.monotonic()
        due = next_daily(saved, now)
        rows = []
        for player in players:
            watch = self.watches.get(player.id) or Watch()
            last = watch.history[-1] if watch.history else None
            rows.append({
                "player_id": player.id,
                "problem": watch.problem,
                "gave_up": watch.gave_up,
                "restarts_last_hour": sum(1 for t in watch.restarts if mono - t < 3600),
                "last_restart_at": last[0] if last else None,
                "last_restart_reason": last[1] if last else None,
            })
        return {
            "daily_enabled": saved.daily_enabled,
            "daily_time": saved.daily_time,
            "watchdog_enabled": saved.watchdog_enabled,
            "next_daily_at": due,
            "daily_waiting": self.daily_waiting if due is not None and now >= due else None,
            "last_daily_at": saved.last_daily_at,
            "last_daily_note": saved.last_daily_note,
            "watching": self.watching,
            "timezone": str(settings.tz),
            "players": rows,
        }


async def busy_reason(session, now: datetime) -> str | None:
    """Why the daily restart should wait, or None.

    A blackout, a pause or the emergency stop do not count: the projectors
    show black or a still picture then, and both come back the same after a
    restart. Left on by mistake, they would hold the restart off for good.
    """
    from sqlalchemy import func

    from app.db.models import AutomationRun
    from app.services.mapping import transport
    from app.services.minipc_updates import SHOW_MARGIN
    from app.services.tonight import show_time

    if transport.snapshot().status == "playing":
        return "a show is playing"
    current, following = await show_time(session, now.astimezone(settings.tz))
    if current is not None and current.show_id is not None:
        return "it is show time"
    if following is not None and following.start - now < SHOW_MARGIN:
        return "the show starts soon"
    running = await session.scalar(
        select(func.count()).select_from(AutomationRun).where(AutomationRun.status == "running"))
    if running:
        return "an automation is running"
    return None


async def show_should_be_on(session, now: datetime) -> str | None:
    """Why a picture is expected on the projectors now, or None."""
    from app.services.mapping import transport
    from app.services.tonight import show_time

    state = transport.snapshot()
    if state.emergency is not None or state.status == "blackout":
        return None
    if state.status in ("playing", "paused"):
        return f"a show is {state.status}"
    current, _ = await show_time(session, now.astimezone(settings.tz))
    if current is not None and current.show_id is not None:
        return "it is show time"
    return None


def _names(names: list[str]) -> str:
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


output_care = OutputCareService()
