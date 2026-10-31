"""Heaters in projector boxes: on when the box gets cold, never for too long.

Every minute, for each heater:

1. Read the temperature inside the box: the USB sensor on the mini PC
   beside it (an Adafruit SHT41 Trinkey, sent in by the Mini PC app), else
   the projector's own intake-air reading. Only fresh readings count.
2. Read the temperature outside (services/weather.py), used only when
   there is no inside reading.
3. Decide (:func:`decide`), switch the plug if it is not already where it
   should be, and write a line of history.

The rules, in the order they win:

* Kept off by hand: off.
* Its projector is on, warming up or cooling down (the interlock): off,
  even when on by hand. A projector being switched on is noticed within a
  second or two, not at the next minute.
* Inside the box at or above the safety ceiling: off, even when on by hand.
* On by hand: on, until the hour is up (then back to automatic).
* Warming up for tonight's show: in the ``warmup_minutes`` before the show
  starts, on while the box is below ``off_above_c``, so it is warm when
  the projector starts. The long-run limit does not cut a warm-up short;
  the ceiling and the interlock still do (the show switching the projector
  on ends it).
* Resting after a long run: off until the rest is over.
* Ran for the longest run allowed: off, and rest for the rest of the hour,
  so the box never bakes even if the sensor is wrong.
* Inside reading: on below ``on_below_c``, and once on, stays on until
  ``off_above_c`` (the gap keeps it from clicking on and off).
* No inside reading, outside reading: the same with the outside numbers.
* Nothing to go by: off. A heater left running blind is the worse risk.

The heater's own thermostat knob and its tip-over and overheat cut-outs
stay the real safety devices; this only decides when it gets power.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select

from app.core.events import bus
from app.core.lifecycle import stop_task, wait_or_stop
from app.core.security import decrypt_secret
from app.db.models import (
    Event,
    Heater,
    HeaterReading,
    MappingOutput,
    MappingPlayer,
    ProjectorState,
    Severity,
    Telemetry,
    WeatherPlace,
    as_utc,
)
from app.db.session import session_scope
from app.services import smart_plugs, weather

log = logging.getLogger(__name__)

TICK_SECONDS = 60
#: A USB sensor reading older than this is not used.
SENSOR_FRESH = timedelta(minutes=3)
#: The projector's intake reading is taken every minute or so while it answers.
PROJECTOR_FRESH = timedelta(minutes=5)
#: How long "On" by hand lasts before going back to automatic.
HOLD = timedelta(hours=1)
#: Shortest rest after a long run, and shortest gap before switching on again.
MIN_REST = timedelta(minutes=5)
MIN_OFF = timedelta(minutes=2)
HISTORY_DAYS = 30


def fahrenheit(celsius: float) -> str:
    return f"{round(celsius * 9 / 5 + 32)} °F"


def clock(value: datetime) -> str:
    from app.config import settings

    return value.astimezone(settings.tz).strftime("%I:%M %p").lstrip("0")


# -- readings ---------------------------------------------------------------------------


@dataclass
class SensorReading:
    """The newest reading from a USB sensor on a mini PC."""

    celsius: float
    humidity: float | None
    name: str
    at: datetime


#: Mini PC (player) id: its USB sensor's newest reading.
usb_sensors: dict[int, SensorReading] = {}


def record_sensor(player_id: int, celsius: float, humidity: float | None, name: str) -> None:
    usb_sensors[player_id] = SensorReading(celsius, humidity, name, datetime.now(UTC))


@dataclass
class Inside:
    celsius: float
    source: str  # "sensor" or "projector"
    at: datetime


async def sensor_for(session, heater: Heater, now: datetime) -> SensorReading | None:
    """The fresh USB sensor reading this heater goes by, or None.

    The sensor chosen in its settings; with none chosen (it was added before
    the sensor was plugged in, say), the sensor on the mini PC that plays its
    projector, or else the only sensor there is.
    """
    fresh = {pid: r for pid, r in usb_sensors.items() if now - r.at <= SENSOR_FRESH}
    if heater.sensor_player_id is not None:
        return fresh.get(heater.sensor_player_id)
    if heater.projector_id is not None and fresh:
        players = (await session.execute(
            select(MappingPlayer.id)
            .join(MappingOutput, MappingOutput.id == MappingPlayer.output_id)
            .where(MappingOutput.projector_id == heater.projector_id)
        )).scalars().all()
        for player_id in players:
            if player_id in fresh:
                return fresh[player_id]
    if len(usb_sensors) == 1 and fresh:
        return next(iter(fresh.values()))
    return None


async def inside_reading(session, heater: Heater, now: datetime) -> Inside | None:
    reading = await sensor_for(session, heater, now)
    if reading is not None:
        return Inside(reading.celsius, "sensor", reading.at)
    if heater.projector_id is not None:
        row = (await session.execute(
            select(Telemetry)
            .where(Telemetry.projector_id == heater.projector_id,
                   Telemetry.metric == "temp_intake")
            .order_by(Telemetry.recorded_at.desc()).limit(1)
        )).scalars().first()
        if row is not None and row.value_num is not None \
                and now - as_utc(row.recorded_at) <= PROJECTOR_FRESH:
            return Inside(row.value_num, "projector", as_utc(row.recorded_at))
    return None


#: Power states in which the projector makes its own heat and runs its fans.
POWERED = ("on", "warming", "cooling")


async def projector_powered(session, heater: Heater) -> bool | None:
    """Whether the heater's projector is on; None when it is not known."""
    if heater.projector_id is None:
        return None
    state = await session.get(ProjectorState, heater.projector_id)
    if state is None or state.power in (None, "unknown"):
        return None
    return state.power in POWERED


async def next_show(session) -> datetime | None:
    """When tonight's (or the next) show starts, from the show plan and calendar."""
    from app.services import tonight

    try:
        _, upcoming = await tonight.show_time(session)
    except Exception:  # noqa: BLE001 - a broken plan must not stop the heaters
        log.exception("could not read the show times")
        return None
    return upcoming.start.astimezone(UTC) if upcoming else None


async def outside_reading(session) -> float | None:
    place = (await session.execute(select(WeatherPlace).limit(1))).scalars().first()
    if place is None:
        return None
    found = await weather.outside(place.latitude, place.longitude)
    if found is None or found.age > weather.STALE_SECONDS:
        return None
    return found.celsius


# -- the decision -----------------------------------------------------------------------


@dataclass
class Decision:
    on: bool
    reason: str
    #: Set when a long run ends: rest until then.
    rest_until: datetime | None = None
    #: The hold by hand ran out: back to automatic.
    back_to_auto: bool = False
    #: The safety ceiling made it.
    safety: bool = False


def warmup_from(heater: Heater, show_at: datetime | None) -> datetime | None:
    if show_at is None or heater.warmup_minutes <= 0:
        return None
    return show_at - timedelta(minutes=heater.warmup_minutes)


def decide(heater: Heater, inside: Inside | None, outside: float | None,
           now: datetime, *, projector_on: bool | None = None,
           show_at: datetime | None = None) -> Decision:
    """On or off right now, and why, in words. No side effects."""
    if heater.mode == "off":
        return Decision(False, "Kept off by hand.")
    if heater.interlock and projector_on:
        return Decision(False, "Off while the projector is on (safety interlock).")
    if inside is not None and inside.celsius >= heater.max_inside_c:
        return Decision(False, f"Off for safety: inside the box is {fahrenheit(inside.celsius)}, "
                               f"at or above the {fahrenheit(heater.max_inside_c)} limit.",
                        safety=True)
    back_to_auto = False
    if heater.mode == "on":
        hold = as_utc(heater.hold_until)
        if hold is not None and now < hold:
            return Decision(True, f"On by hand until {clock(hold)}.")
        back_to_auto = True

    was_on = bool(heater.is_on)
    start = warmup_from(heater, show_at)
    if start is not None and start <= now < show_at:
        if inside is not None:
            cold, value = inside.celsius < heater.off_above_c, inside.celsius
        elif outside is not None:
            cold, value = outside < heater.outside_off_above_c, outside
        else:
            cold, value = False, None
        if cold:
            where = "inside" if inside is not None else "outside"
            return Decision(True, f"Warming the box for the show at {clock(show_at)}; "
                                  f"{where} is {fahrenheit(value)}.", back_to_auto=back_to_auto)
    rest = as_utc(heater.rest_until)
    if rest is not None and now < rest:
        return Decision(False, f"Resting until {clock(rest)} after running "
                               f"{heater.max_minutes_per_hour} minutes.",
                        back_to_auto=back_to_auto)
    since = as_utc(heater.on_since)
    limit = heater.max_minutes_per_hour
    if was_on and since is not None and limit < 60 \
            and now - since >= timedelta(minutes=limit):
        until = now + max(MIN_REST, timedelta(minutes=60 - limit))
        return Decision(False, f"Ran {limit} minutes; resting until {clock(until)}.",
                        rest_until=until, back_to_auto=back_to_auto)

    if inside is not None:
        where = "Inside the box" if inside.source == "sensor" else "The projector's intake air"
        low, high, value = heater.on_below_c, heater.off_above_c, inside.celsius
    elif outside is not None:
        where = "No inside reading; outside"
        low, high, value = heater.outside_on_below_c, heater.outside_off_above_c, outside
    else:
        return Decision(False, "Off: no inside or outside temperature to go by.",
                        back_to_auto=back_to_auto)
    if was_on and value < high:
        return Decision(True, f"{where} is {fahrenheit(value)}; on until it reaches "
                              f"{fahrenheit(high)}.", back_to_auto=back_to_auto)
    if value < low:
        last = as_utc(heater.last_switched_at)
        if not was_on and last is not None and now - last < MIN_OFF:
            # Just switched off: give the plug's relay a moment.
            return Decision(False, f"{where} is {fahrenheit(value)}; turning on in a moment.",
                            back_to_auto=back_to_auto)
        return Decision(True, f"{where} is {fahrenheit(value)}, below {fahrenheit(low)}.",
                        back_to_auto=back_to_auto)
    return Decision(False, f"{where} is {fahrenheit(value)}; turns on below {fahrenheit(low)}.",
                    back_to_auto=back_to_auto)


def plug_of(heater: Heater) -> smart_plugs.Plug:
    return smart_plugs.Plug(kind=heater.plug_kind, address=heater.plug_address,
                            entity=heater.plug_entity,
                            secret=decrypt_secret(heater.plug_secret_enc))


# -- the service ------------------------------------------------------------------------


class HeaterService:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        self._poke = asyncio.Event()
        self._lock = asyncio.Lock()
        self._last_cleanup: datetime | None = None
        self._watch_task: asyncio.Task | None = None
        #: Projectors whose heater is on right now: the interlock watches them.
        self._watched: set[int] = set()

    async def start(self) -> None:
        if self._task is not None:
            return
        self._stop = asyncio.Event()
        self._poke = asyncio.Event()
        self._task = asyncio.create_task(self._loop(), name="heaters")
        self._watch_task = asyncio.create_task(self._watch(), name="heaters-interlock")

    async def stop(self) -> None:
        self._stop.set()
        self._poke.set()
        await stop_task(self._task, name="heaters")
        self._task = None
        if self._watch_task is not None:
            self._watch_task.cancel()
            await asyncio.gather(self._watch_task, return_exceptions=True)
            self._watch_task = None

    def poke(self) -> None:
        """Look again now (a heater was changed or switched by hand)."""
        self._poke.set()

    async def _watch(self) -> None:
        """The interlock: a heated box's projector powering on is acted on at once."""
        queue = await bus.subscribe(["command_result", "projector_state"])
        try:
            while True:
                message = await queue.get()
                payload = message.payload
                if payload.get("projector_id") not in self._watched:
                    continue
                powering = (message.type == "command_result"
                            and str(payload.get("capability", "")).startswith("power")) \
                    or payload.get("power") in POWERED
                if powering:
                    self.poke()
        finally:
            await bus.unsubscribe(queue)

    async def _loop(self) -> None:
        if await wait_or_stop(self._stop, 5):
            return
        while not self._stop.is_set():
            try:
                await self.tick()
            except Exception:  # noqa: BLE001 - never let one bad minute end the loop
                log.exception("heater check failed")
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._poke.wait(), timeout=TICK_SECONDS)
            self._poke.clear()

    async def tick(self, now: datetime | None = None) -> None:
        async with self._lock:
            now = now or datetime.now(UTC)
            async with session_scope() as session:
                heaters = (await session.execute(select(Heater).order_by(Heater.id))).scalars().all()
                if not heaters:
                    return
                outside = await outside_reading(session)
                show_at = await next_show(session)
                for heater in heaters:
                    await self._one(session, heater, outside, show_at, now)
                if self._last_cleanup is None or now - self._last_cleanup > timedelta(hours=1):
                    self._last_cleanup = now
                    await session.execute(delete(HeaterReading).where(
                        HeaterReading.recorded_at < now - timedelta(days=HISTORY_DAYS)))

    async def _one(self, session, heater: Heater, outside: float | None,
                   show_at: datetime | None, now: datetime) -> None:
        inside = await inside_reading(session, heater, now)
        projector_on = await projector_powered(session, heater)
        plug = plug_of(heater)
        # What the plug says now: someone may have pressed its button.
        try:
            actual, _ = await smart_plugs.read(plug)
            plug_error = None
        except smart_plugs.PlugError as exc:
            actual, plug_error = None, str(exc)
        if actual is not None and heater.is_on is not None and actual != heater.is_on:
            heater.on_since = now if actual else None
        if actual is not None:
            heater.is_on = actual
        if actual and heater.on_since is None:
            heater.on_since = now

        decision = decide(heater, inside, outside, now, projector_on=projector_on,
                          show_at=show_at)
        if decision.back_to_auto:
            heater.mode = "auto"
            heater.hold_until = None
        if decision.rest_until is not None:
            heater.rest_until = decision.rest_until

        if actual is not None and actual != decision.on:
            try:
                actual = await smart_plugs.switch(plug, decision.on)
                plug_error = None
            except smart_plugs.PlugError as exc:
                plug_error = str(exc)
            if plug_error is None:
                heater.is_on = actual
                heater.on_since = now if actual else None
                heater.last_switched_at = now
                session.add(Event(
                    projector_id=None,
                    severity=(Severity.WARNING if decision.safety else Severity.INFO).value,
                    kind="heater_on" if actual else "heater_off",
                    message=f"{heater.name} turned {'on' if actual else 'off'}. {decision.reason}",
                    details={"heater_id": heater.id,
                             "inside_c": inside.celsius if inside else None,
                             "inside_source": inside.source if inside else None,
                             "outside_c": outside},
                ))
                log.info("%s turned %s: %s", heater.name, "on" if actual else "off",
                         decision.reason)

        if plug_error != heater.plug_error:
            if plug_error:
                session.add(Event(projector_id=None, severity=Severity.WARNING.value,
                                  kind="heater_plug", details={"heater_id": heater.id},
                                  message=f"{heater.name}'s plug is not answering. {plug_error}"))
                log.warning("%s: %s", heater.name, plug_error)
            elif heater.plug_error:
                session.add(Event(projector_id=None, severity=Severity.INFO.value,
                                  kind="heater_plug", details={"heater_id": heater.id},
                                  message=f"{heater.name}'s plug is answering again."))
            heater.plug_error = plug_error
        if plug_error and actual is None:
            heater.is_on = None
        heater.reason = decision.reason
        if heater.projector_id is not None:
            if heater.is_on and heater.interlock:
                self._watched.add(heater.projector_id)
            else:
                self._watched.discard(heater.projector_id)
        session.add(HeaterReading(heater_id=heater.id,
                                  inside_c=inside.celsius if inside else None,
                                  inside_source=inside.source if inside else None,
                                  outside_c=outside, is_on=heater.is_on, recorded_at=now))
        bus.publish("heater", {"heater_id": heater.id, "is_on": heater.is_on,
                               "reason": heater.reason})


service = HeaterService()
