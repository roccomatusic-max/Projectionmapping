"""The emergency stop: one press, everything dark.

Pressing it, in this order:

1. The show stops and every mini PC output goes black at once (the
   transport carries the hold, so a mini PC that is offline now goes black
   the moment it reconnects). While the hold is on, outputs draw nothing at
   all: no test pattern, no calibration frame, no identify overlay.
2. Automations that are running are stopped where they are, and scheduled
   ones do not start, so nothing switches the projectors back on behind
   the operator's back.
3. Every enabled projector is sent shutter close (when it is on and has a
   shutter) and then power off, all at the same time, ahead of anything
   else in its queue. A projector that is busy warming up is held and
   turned off by itself as soon as it accepts (the same hold power commands
   get during cool-down); one already off or cooling is left alone, and any
   power on waiting for it is cancelled.

Each projector's answer is reported on its own. The emergency stop is never
reported as one success.

The hold lasts until someone clears it, a restart of the server included:
it is recorded as an event and read back at start-up. Clearing it does not
turn anything back on; the operator does that with the usual buttons.

This is a software stop over the network. It is not a safety-rated
emergency stop and does not replace the projectors' own power switches.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select

from app.config import settings
from app.db.models import Event, MappingPlayer, Projector, Severity, as_utc
from app.db.session import session_scope
from app.drivers import CommandOutcome, PowerState
from app.services.audit import log_command_results
from app.services.device_manager import DeviceWorker, Priority, manager
from app.services.mapping import transport

log = logging.getLogger(__name__)

STOP_KIND = "emergency_stop"
CLEAR_KIND = "emergency_cleared"

#: How long the press waits for the projectors' answers before reporting.
#: A command still queued after this is sent anyway (see DeviceWorker._run).
ANSWER_SECONDS = 45.0

_TOOK_IT = {CommandOutcome.CONFIRMED, CommandOutcome.ACCEPTED, CommandOutcome.OK}


def _stale_after() -> float:
    return settings.poll_operational * settings.staleness_multiplier


async def _stop_projector(worker: DeviceWorker) -> dict[str, Any]:
    """Shutter closed, then power off, for one projector; one plain result."""
    snapshot = worker.snapshot()
    live = snapshot.is_live(_stale_after())
    power = snapshot.status.power if live else PowerState.UNKNOWN
    base: dict[str, Any] = {"projector_id": worker.projector_id, "name": worker.name,
                            "shutter": None, "power": None}

    if power in (PowerState.OFF, PowerState.COOLING):
        held = worker.cancel_held_power()
        detail = "Already off." if power is PowerState.OFF else "Already cooling down."
        if held:
            detail += " A power on that was waiting for it was cancelled."
        return {**base, "result": "already_off", "detail": detail}

    shutter = None
    if power is PowerState.ON and worker.driver.supports("shutter.set"):
        shutter = await worker.execute("shutter.set", {"state": "closed"},
                                       priority=Priority.EMERGENCY, timeout=ANSWER_SECONDS)
        base["shutter"] = shutter.outcome.value
    off = await worker.execute("power.set", {"state": "off"},
                               priority=Priority.EMERGENCY, timeout=ANSWER_SECONDS)
    base["power"] = off.outcome.value
    base["error"] = off.error
    dark = shutter is not None and shutter.outcome in _TOOK_IT

    if off.outcome in _TOOK_IT:
        detail = "Shutter closed and turning off." if dark else "Turning off."
        return {**base, "result": "off", "detail": detail}
    if off.outcome is CommandOutcome.QUEUED:
        detail = ("Busy right now, so it will be turned off by itself as soon as it "
                  "accepts (usually within a minute or two).")
        if dark:
            detail = "Shutter closed. " + detail
        return {**base, "result": "waiting", "detail": detail}
    if off.outcome is CommandOutcome.TIMEOUT:
        reason = "It did not answer, so it may still be on."
    elif off.outcome in (CommandOutcome.CONNECTION_ERROR,):
        reason = "It could not be reached, so it may still be on."
    elif off.outcome is CommandOutcome.AUTH_FAILED:
        reason = "It refused the control password, so it may still be on."
    else:
        reason = f"It refused to turn off ({off.error or off.outcome.value})."
    if dark:
        reason = "The shutter closed, so the picture is dark, but it did not turn off. " + reason
    return {**base, "result": "failed",
            "detail": reason + " Turn it off at the projector if you need to."}


async def _players() -> list[dict[str, Any]]:
    from app.api.routes.mapping_players import is_online

    async with session_scope() as session:
        players = (await session.execute(
            select(MappingPlayer).where(MappingPlayer.approved.is_(True),
                                        MappingPlayer.kind == "player")
            .order_by(MappingPlayer.name)
        )).scalars().all()
        return [{"id": p.id, "name": p.name, "online": is_online(p)} for p in players]


class EmergencyStop:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()

    @property
    def active(self) -> bool:
        return transport.snapshot().emergency is not None

    async def restore(self) -> None:
        """Put the hold back after a restart if it was on when the server stopped."""
        async with session_scope() as session:
            last = (await session.execute(
                select(Event).where(Event.kind.in_((STOP_KIND, CLEAR_KIND)))
                .order_by(Event.id.desc()).limit(1)
            )).scalars().first()
        if last is None or last.kind != STOP_KIND:
            return
        at = as_utc(last.created_at) or datetime.now(UTC)
        by = (last.details or {}).get("by")
        await transport.emergency_stop(by=by, at_ms=at.timestamp() * 1000.0)
        log.warning("the emergency stop pressed at %s is still on; every output stays black "
                    "and automations are held until someone clears it", at.isoformat())

    async def press(self, *, username: str, user_id: int | None, source: str) -> dict[str, Any]:
        # Black first: nothing below may delay it.
        state = await transport.emergency_stop(by=username)

        from app.services.automation import engine as automation_engine

        stopped_runs = await automation_engine.halt()

        async with self._lock:
            async with session_scope() as session:
                ids = list((await session.execute(
                    select(Projector.id).where(Projector.enabled.is_(True))
                    .order_by(Projector.name)
                )).scalars().all())
            workers = [w for w in (manager.get(pid) for pid in ids) if w is not None]
            missing = [pid for pid in ids if manager.get(pid) is None]
            answers = await asyncio.gather(*(_stop_projector(w) for w in workers),
                                           return_exceptions=True)

        projectors: list[dict[str, Any]] = []
        for worker, answer in zip(workers, answers, strict=True):
            if isinstance(answer, BaseException):
                log.error("emergency stop failed for %s", worker.name, exc_info=answer)
                answer = {"projector_id": worker.projector_id, "name": worker.name,
                          "shutter": None, "power": None, "result": "failed",
                          "detail": f"Something went wrong sending the command ({answer}). "
                                    f"Turn it off at the projector if you need to."}
            projectors.append(answer)
        for pid in missing:
            projectors.append({"projector_id": pid, "name": None, "shutter": None,
                               "power": None, "result": "failed",
                               "detail": "Not being controlled right now (still starting up). "
                                         "Turn it off at the projector if you need to."})

        players = await _players()
        counts = {key: sum(1 for p in projectors if p["result"] == key)
                  for key in ("off", "waiting", "already_off", "failed")}
        await log_command_results(
            [{"projector_id": p["projector_id"], "outcome": p["power"] or "skipped",
              "error": None if p["result"] != "failed" else p["detail"]} for p in projectors],
            "power.set", {"state": "off", "emergency": True},
            source=source, username=username, user_id=user_id,
        )
        async with session_scope() as session:
            session.add(Event(
                projector_id=None, severity=Severity.CRITICAL.value, kind=STOP_KIND,
                message=(f"{username} pressed the emergency stop: show stopped, outputs black, "
                         f"{counts['off'] + counts['already_off']} of {len(projectors)} "
                         f"projector(s) off, {counts['waiting']} turning off when ready, "
                         f"{counts['failed']} did not answer"),
                details={"by": username, "projectors": projectors,
                         "automation_runs_stopped": stopped_runs},
            ))
        return {
            "transport": state,
            "projectors": projectors,
            "players": players,
            "automations_stopped": stopped_runs,
        }

    async def clear(self, *, username: str) -> dict[str, Any]:
        state = await transport.clear_emergency()
        async with session_scope() as session:
            session.add(Event(
                projector_id=None, severity=Severity.WARNING.value, kind=CLEAR_KIND,
                message=f"{username} cleared the emergency stop",
                details={"by": username},
            ))
        return {"transport": state}


emergency = EmergencyStop()
