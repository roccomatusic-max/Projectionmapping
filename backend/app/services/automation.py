"""Automation engine and scheduler.

An automation is an ordered list of steps. Each step is a dict:

    {"type": "command",      "target": {...}, "capability": "power.set",
                             "params": {"state": "on"}}
    {"type": "wait_state",   "target": {...}, "capability": "power.get",
                             "expect": "on", "timeout": 180}
    {"type": "delay",        "seconds": 10}
    {"type": "check_online", "target": {...}}
    {"type": "check_faults", "target": {...}, "block_on": ["error"]}
    {"type": "check_enclosure", "enclosure_id": 1}
    {"type": "scene",        "scene_id": 3}
    {"type": "notify",       "message": "...", "severity": "info"}

``target`` is ``{"type": "all" | "group" | "projector", "id": n}``.

Every step records its own per-projector outcome, so a run that partly fails
tells the operator exactly which projector failed at which step.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from datetime import time as dtime
from typing import Any

from sqlalchemy import select

from app.core.events import bus
from app.db.models import (
    Automation,
    AutomationRun,
    Enclosure,
    EnclosureReading,
    Event,
    Group,
    GroupMember,
    Projector,
    RunStatus,
    Scene,
    Severity,
    as_utc,
)
from app.db.session import session_scope
from app.drivers import CommandOutcome, PowerState, ShutterState
from app.services.device_manager import Priority, manager

log = logging.getLogger(__name__)


class StepError(Exception):
    """A step failed in a way that should abort the run."""


async def resolve_target(session, target: dict[str, Any] | None) -> list[int]:
    """Turn a target spec into a list of projector ids."""
    target = target or {"type": "all"}
    kind = target.get("type", "all")
    if kind == "projector":
        pid = target.get("id")
        return [int(pid)] if pid is not None else []
    if kind == "group":
        rows = (await session.execute(
            select(GroupMember.projector_id)
            .where(GroupMember.group_id == int(target.get("id", 0)))
            .order_by(GroupMember.position)
        )).scalars().all()
        return list(rows)
    rows = (await session.execute(
        select(Projector.id).where(Projector.enabled.is_(True)).order_by(Projector.name)
    )).scalars().all()
    return list(rows)


class AutomationEngine:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._running = False
        #: Guards against a long run overlapping its own next schedule.
        self._in_flight: set[int] = set()

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._scheduler_loop(), name="automation-scheduler")
        log.info("automation scheduler started")

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
        self._task = None

    # -- scheduling --------------------------------------------------------

    async def _scheduler_loop(self) -> None:
        """Check every 30s for automations due to fire.

        Resolution is one minute; a schedule is considered due when the
        current minute matches and the automation has not already run inside
        this minute.
        """
        while self._running:
            try:
                await self._tick()
            except asyncio.CancelledError:
                return
            except Exception:  # noqa: BLE001
                log.exception("automation scheduler tick failed")
            await asyncio.sleep(30)

    async def _tick(self) -> None:
        now = datetime.now().astimezone()
        async with session_scope() as session:
            automations = (await session.execute(
                select(Automation).where(
                    Automation.enabled.is_(True),
                    Automation.trigger_type != "manual",
                )
            )).scalars().all()
            due = [a for a in automations if self._is_due(a, now)]

        for automation in due:
            if automation.id in self._in_flight:
                log.warning("skipping %s: previous run still in flight", automation.name)
                continue
            asyncio.create_task(
                self.run(automation.id, trigger="schedule"),
                name=f"automation-{automation.id}",
            )

    @staticmethod
    def _is_due(automation: Automation, now: datetime) -> bool:
        schedule = automation.schedule or {}
        last = automation.last_run_at

        def already_ran_this_minute() -> bool:
            if last is None:
                return False
            last_local = as_utc(last).astimezone()
            return last_local.strftime("%Y-%m-%d %H:%M") == now.strftime("%Y-%m-%d %H:%M")

        if already_ran_this_minute():
            return False

        if automation.trigger_type == "once":
            run_at = schedule.get("run_at")
            if not run_at:
                return False
            try:
                target = datetime.fromisoformat(run_at)
            except ValueError:
                return False
            if target.tzinfo is None:
                target = target.astimezone()
            # Fire once the moment passes, and only if we never ran it.
            return last is None and now >= target

        at = schedule.get("at")
        if not at:
            return False
        try:
            hour, minute = (int(part) for part in str(at).split(":")[:2])
            scheduled = dtime(hour=hour, minute=minute)
        except (ValueError, TypeError):
            log.warning("automation %s has an invalid time %r", automation.name, at)
            return False
        if (now.hour, now.minute) != (scheduled.hour, scheduled.minute):
            return False
        if automation.trigger_type == "daily":
            return True
        if automation.trigger_type == "weekly":
            days = schedule.get("days") or []
            return now.weekday() in days
        return False

    # -- execution ---------------------------------------------------------

    async def run(self, automation_id: int, *, trigger: str = "manual",
                  user: str | None = None) -> dict[str, Any]:
        """Execute an automation, recording a run with per-step results."""
        if automation_id in self._in_flight:
            return {"status": RunStatus.ABORTED.value,
                    "error": "this automation is already running"}
        self._in_flight.add(automation_id)
        started = datetime.now(UTC)
        run_id: int | None = None
        try:
            async with session_scope() as session:
                automation = await session.get(Automation, automation_id)
                if automation is None:
                    return {"status": RunStatus.FAILED.value, "error": "automation not found"}
                name = automation.name
                steps = list(automation.steps or [])
                abort_on_failure = automation.abort_on_failure
                run = AutomationRun(
                    automation_id=automation_id, trigger=trigger,
                    status=RunStatus.RUNNING.value, started_at=started,
                )
                session.add(run)
                await session.flush()
                run_id = run.id
                automation.last_run_at = started

            bus.publish("automation_started", {
                "automation_id": automation_id, "run_id": run_id,
                "name": name, "trigger": trigger, "steps": len(steps),
            })

            step_results: list[dict[str, Any]] = []
            status = RunStatus.SUCCESS
            error: str | None = None

            for index, step in enumerate(steps):
                result = await self._run_step(index, step, user=user)
                step_results.append(result)
                bus.publish("automation_step", {
                    "automation_id": automation_id, "run_id": run_id,
                    "name": name, "step": index, **result,
                })
                if not result["ok"]:
                    status = RunStatus.FAILED if abort_on_failure else RunStatus.PARTIAL
                    error = result.get("error")
                    if abort_on_failure:
                        break
            if status is RunStatus.PARTIAL and all(r["ok"] for r in step_results):
                status = RunStatus.SUCCESS

            finished = datetime.now(UTC)
            async with session_scope() as session:
                run = await session.get(AutomationRun, run_id)
                if run:
                    run.status = status.value
                    run.finished_at = finished
                    run.step_results = step_results
                    run.error = error
                automation = await session.get(Automation, automation_id)
                if automation:
                    automation.last_status = status.value
                session.add(Event(
                    projector_id=None,
                    severity=(Severity.INFO.value if status is RunStatus.SUCCESS
                              else Severity.CRITICAL.value),
                    kind=f"automation_{status.value}",
                    message=f"Automation '{name}' finished: {status.value}",
                    details={"run_id": run_id, "steps": len(step_results)},
                ))

            payload = {
                "automation_id": automation_id, "run_id": run_id, "name": name,
                "status": status.value, "steps": step_results,
                "duration_s": round((finished - started).total_seconds(), 1),
            }
            bus.publish("automation_finished", payload)
            if status is not RunStatus.SUCCESS:
                bus.publish("automation_failed", {
                    **payload,
                    "message": f"Automation '{name}' finished with status {status.value}"
                               + (f": {error}" if error else ""),
                })
            return payload
        finally:
            self._in_flight.discard(automation_id)

    async def _run_step(self, index: int, step: dict[str, Any],
                        user: str | None = None) -> dict[str, Any]:
        kind = step.get("type", "command")
        label = step.get("label") or kind
        try:
            match kind:
                case "command":
                    return await self._step_command(index, step, label, user)
                case "wait_state":
                    return await self._step_wait_state(index, step, label)
                case "delay":
                    seconds = float(step.get("seconds", 1))
                    await asyncio.sleep(max(0.0, min(seconds, 1800.0)))
                    return self._ok(index, label, f"waited {seconds}s")
                case "check_online":
                    return await self._step_check_online(index, step, label)
                case "check_faults":
                    return await self._step_check_faults(index, step, label)
                case "check_enclosure":
                    return await self._step_check_enclosure(index, step, label)
                case "scene":
                    return await self._step_scene(index, step, label, user)
                case "notify":
                    bus.publish("automation_notify", {
                        "message": step.get("message", ""),
                        "severity": step.get("severity", "info"),
                    })
                    return self._ok(index, label, step.get("message", ""))
            return self._fail(index, label, f"unknown step type {kind!r}")
        except Exception as exc:  # noqa: BLE001 - a bad step fails its run, not the engine
            log.exception("automation step %d (%s) raised", index, kind)
            return self._fail(index, label, f"{type(exc).__name__}: {exc}")

    @staticmethod
    def _ok(index: int, label: str, detail: str = "",
            results: list | None = None) -> dict[str, Any]:
        return {"step": index, "label": label, "ok": True,
                "detail": detail, "results": results or []}

    @staticmethod
    def _fail(index: int, label: str, error: str,
              results: list | None = None) -> dict[str, Any]:
        return {"step": index, "label": label, "ok": False,
                "error": error, "results": results or []}

    async def _step_command(self, index: int, step: dict[str, Any], label: str,
                            user: str | None) -> dict[str, Any]:
        async with session_scope() as session:
            ids = await resolve_target(session, step.get("target"))
        if not ids:
            return self._fail(index, label, "target resolved to no projectors")
        results = await manager.dispatch_many(
            ids, step["capability"], step.get("params") or {},
            priority=Priority.AUTOMATION,
        )
        from app.services.audit import log_command_results
        await log_command_results(results, step["capability"], step.get("params") or {},
                                  source="automation", username=user)
        failed = [r for r in results if not _outcome_ok(r.get("outcome"))]
        if failed:
            names = ", ".join(f"{r.get('name') or r['projector_id']} ({r.get('outcome')})"
                              for r in failed)
            return self._fail(index, label, f"failed on {len(failed)}/{len(results)}: {names}",
                              results)
        return self._ok(index, label, f"{len(results)} projector(s) accepted the command",
                        results)

    async def _step_wait_state(self, index: int, step: dict[str, Any],
                               label: str) -> dict[str, Any]:
        """Poll until every targeted projector reports the expected state.

        This is the step that makes 'wait until each projector reports an
        operational state' real rather than a fixed sleep.
        """
        async with session_scope() as session:
            ids = await resolve_target(session, step.get("target"))
        if not ids:
            return self._fail(index, label, "target resolved to no projectors")

        capability = step.get("capability", "power.get")
        expect = str(step.get("expect", "on")).lower()
        timeout = float(step.get("timeout", 180))
        interval = float(step.get("interval", 5))
        deadline = asyncio.get_running_loop().time() + timeout
        pending = set(ids)
        last: list[dict[str, Any]] = []

        while pending and asyncio.get_running_loop().time() < deadline:
            results = await manager.dispatch_many(
                list(pending), capability, priority=Priority.AUTOMATION
            )
            last = results
            for result in results:
                if _state_matches(result.get("value"), expect):
                    pending.discard(result["projector_id"])
            if pending:
                await asyncio.sleep(interval)

        if pending:
            names = ", ".join(str(pid) for pid in sorted(pending))
            return self._fail(
                index, label,
                f"{len(pending)} projector(s) did not reach '{expect}' within {timeout}s "
                f"(ids: {names})",
                last,
            )
        return self._ok(index, label, f"all {len(ids)} projector(s) reached '{expect}'", last)

    async def _step_check_online(self, index: int, step: dict[str, Any],
                                 label: str) -> dict[str, Any]:
        async with session_scope() as session:
            ids = await resolve_target(session, step.get("target"))
        offline = []
        for pid in ids:
            worker = manager.get(pid)
            if worker is None or not worker.status.online:
                offline.append(worker.name if worker else str(pid))
        if offline:
            return self._fail(index, label, f"not responding: {', '.join(offline)}")
        return self._ok(index, label, f"{len(ids)} projector(s) responding")

    async def _step_check_faults(self, index: int, step: dict[str, Any],
                                 label: str) -> dict[str, Any]:
        block_on = set(step.get("block_on") or ["error"])
        async with session_scope() as session:
            ids = await resolve_target(session, step.get("target"))
        faulted = []
        for pid in ids:
            worker = manager.get(pid)
            if worker is None:
                continue
            if worker.status.health.value in block_on:
                faulted.append(f"{worker.name} ({worker.status.health.value})")
        if faulted:
            return self._fail(index, label, f"critical faults active: {', '.join(faulted)}")
        return self._ok(index, label, "no blocking faults")

    async def _step_check_enclosure(self, index: int, step: dict[str, Any],
                                    label: str) -> dict[str, Any]:
        """Block startup on a verified critical environmental condition.

        'Verified' matters: a sensor that has not reported recently is not
        evidence that conditions are safe, and it is not evidence that they
        are unsafe either. The step says which, and the operator decides via
        ``require_fresh``.
        """
        enclosure_id = step.get("enclosure_id")
        max_age = float(step.get("max_age_seconds", 600))
        require_fresh = bool(step.get("require_fresh", True))
        if enclosure_id is None:
            return self._ok(index, label, "no enclosure configured; skipped")

        cutoff = datetime.now(UTC) - timedelta(seconds=max_age)
        async with session_scope() as session:
            enclosure = await session.get(Enclosure, int(enclosure_id))
            if enclosure is None:
                return self._fail(index, label, f"enclosure {enclosure_id} not found")
            readings = (await session.execute(
                select(EnclosureReading)
                .where(EnclosureReading.enclosure_id == enclosure.id)
                .order_by(EnclosureReading.recorded_at.desc())
                .limit(40)
            )).scalars().all()
            temp_crit = enclosure.temp_critical_c
            blocks = enclosure.block_startup_on_fault
            name = enclosure.name

        latest: dict[str, EnclosureReading] = {}
        for reading in readings:
            latest.setdefault(reading.metric, reading)

        if not latest:
            message = f"{name}: no sensor readings have ever been received"
            return self._fail(index, label, message) if require_fresh else \
                self._ok(index, label, message + " (not blocking)")

        stale = [m for m, r in latest.items() if as_utc(r.recorded_at) < cutoff]
        if stale and require_fresh:
            return self._fail(
                index, label,
                f"{name}: sensor data is stale ({', '.join(sorted(stale))} older than "
                f"{int(max_age)}s). Not treating unknown conditions as safe.",
            )

        problems = []
        temp = latest.get("internal_temp_c")
        if temp and temp.value_num is not None and temp.value_num >= temp_crit:
            problems.append(f"internal temperature {temp.value_num}°C ≥ {temp_crit}°C")
        leak = latest.get("leak")
        if leak and (leak.value_num or 0) > 0:
            problems.append("water leak detected")
        fan = latest.get("fan_ok")
        if fan and fan.value_num is not None and fan.value_num < 1:
            problems.append("ventilation fan failure reported")

        if problems and blocks:
            return self._fail(index, label,
                              f"{name}: startup blocked — {'; '.join(problems)}")
        if problems:
            return self._ok(index, label,
                            f"{name}: conditions flagged but blocking is disabled — "
                            f"{'; '.join(problems)}")
        return self._ok(index, label, f"{name}: environmental conditions within limits")

    async def _step_scene(self, index: int, step: dict[str, Any], label: str,
                          user: str | None) -> dict[str, Any]:
        scene_id = step.get("scene_id")
        if scene_id is None:
            return self._fail(index, label, "no scene_id given")
        outcome = await activate_scene(int(scene_id), user=user)
        if outcome.get("failed"):
            return self._fail(index, label,
                              f"scene '{outcome.get('name')}' had "
                              f"{outcome['failed']} failure(s)", outcome.get("results"))
        return self._ok(index, label, f"scene '{outcome.get('name')}' activated",
                        outcome.get("results"))


def _outcome_ok(outcome: str | None) -> bool:
    return outcome in (CommandOutcome.CONFIRMED.value, CommandOutcome.ACCEPTED.value,
                       CommandOutcome.OK.value)


def _state_matches(value: Any, expect: str) -> bool:
    if value is None:
        return False
    if isinstance(value, PowerState):
        return value.value == expect
    if isinstance(value, ShutterState):
        return value.value == expect
    if isinstance(value, dict):
        return str(value.get("code", value.get("state", ""))).lower() == expect
    return str(value).lower() == expect


async def activate_scene(scene_id: int, *, user: str | None = None) -> dict[str, Any]:
    """Run every action in a scene, reporting per-projector results."""
    async with session_scope() as session:
        scene = await session.get(Scene, scene_id)
        if scene is None:
            return {"error": "scene not found", "failed": 1, "results": []}
        name = scene.name
        actions = list(scene.actions or [])
        resolved: list[tuple[list[int], str, dict]] = []
        for action in actions:
            ids = await resolve_target(session, action.get("target"))
            resolved.append((ids, action.get("capability", ""), action.get("params") or {}))

    all_results: list[dict[str, Any]] = []
    for ids, capability, params in resolved:
        if not ids or not capability:
            continue
        results = await manager.dispatch_many(
            ids, capability, params, priority=Priority.AUTOMATION
        )
        from app.services.audit import log_command_results
        await log_command_results(results, capability, params,
                                  source="scene", username=user)
        all_results.extend(results)

    failed = sum(1 for r in all_results if not _outcome_ok(r.get("outcome")))
    bus.publish("scene_activated", {
        "scene_id": scene_id, "name": name,
        "total": len(all_results), "failed": failed,
    })
    return {"scene_id": scene_id, "name": name, "results": all_results,
            "total": len(all_results), "failed": failed}


async def ensure_group_exists(session, name: str) -> Group | None:
    return (await session.execute(select(Group).where(Group.name == name))).scalars().first()


engine = AutomationEngine()
