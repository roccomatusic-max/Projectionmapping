"""Pre-flight validation for automations.

The builder calls this before saving and shows the result inline, so an
automation that references a capability the targeted projector lacks, a
gated command that has not been opted into, or a schedule that can never
fire is caught at design time rather than at 20:29 on show night.

Problems carry a severity: ``error`` blocks the run from succeeding,
``warning`` is advice (a targeted projector is offline right now, say).
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select

from app.config import settings
from app.db.models import Enclosure, Projector, Scene
from app.drivers import Provenance
from app.drivers.registry import capability_manifest
from app.services import cron
from app.services.automation import resolve_target
from app.services.device_manager import manager

STEP_TYPES = ("command", "wait_state", "delay", "check_online", "check_faults",
              "check_enclosure", "scene", "notify")

#: Which key in ``params`` carries a capability's enumerated value.
PARAM_KEY: dict[str, str] = {
    "power.set": "state", "shutter.set": "state", "input.set": "input",
    "image.freeze": "state", "osd.set": "state",
    "lamp.select": "mode", "lamp.power": "mode",
}

#: Query capabilities a wait_state step may poll, and the values it may expect.
WAIT_QUERIES: dict[str, tuple[str, ...]] = {
    "power.get": ("on", "off", "warming", "cooling"),
    "shutter.get": ("open", "closed"),
    "input.get": (),  # any input code
}


def problem(step: int | None, message: str, severity: str = "error") -> dict[str, Any]:
    return {"step": step, "severity": severity, "message": message}


# ---------------------------------------------------------------------------
# Schedules
# ---------------------------------------------------------------------------


def schedule_matches(trigger_type: str, schedule: dict[str, Any], when: datetime) -> bool:
    """Pure check of a recurring schedule against one minute."""
    if trigger_type == "cron":
        expression = str(schedule.get("cron", "")).strip()
        return bool(expression) and cron.matches(expression, when)
    at = schedule.get("at")
    if not at:
        return False
    try:
        hour, minute = (int(part) for part in str(at).split(":")[:2])
    except (ValueError, TypeError):
        return False
    if (when.hour, when.minute) != (hour, minute):
        return False
    if trigger_type == "daily":
        return True
    if trigger_type == "weekly":
        return when.weekday() in (schedule.get("days") or [])
    return False


def next_runs(trigger_type: str, schedule: dict[str, Any], *, now: datetime | None = None,
              count: int = 5, horizon_days: int = 400) -> list[datetime]:
    """The next ``count`` times this schedule fires, in the schedule zone."""
    now = now or datetime.now(settings.tz)
    if trigger_type == "manual":
        return []
    if trigger_type == "once":
        run_at = schedule.get("run_at")
        if not run_at:
            return []
        try:
            target = datetime.fromisoformat(str(run_at))
        except ValueError:
            return []
        if target.tzinfo is None:
            target = target.replace(tzinfo=now.tzinfo)
        return [target] if target >= now - timedelta(minutes=settings.once_grace_minutes) else []
    try:
        if trigger_type == "cron":
            cron.validate(str(schedule.get("cron", "")))
    except cron.CronError:
        return []
    cursor = now.replace(second=0, microsecond=0) + timedelta(minutes=1)
    end = cursor + timedelta(days=horizon_days)
    found: list[datetime] = []
    # Minute-stepping is fine here: 400 days is ~576k iterations worst case,
    # but any real schedule matches long before that and we stop at `count`.
    while cursor < end and len(found) < count:
        if schedule_matches(trigger_type, schedule, cursor):
            found.append(cursor)
            # Jump to the next minute boundary that could possibly match.
            cursor += timedelta(minutes=1)
            continue
        if trigger_type in ("daily", "weekly"):
            # Only one minute per day can match; skip straight to it.
            at = str(schedule.get("at", "0:0")).split(":")
            try:
                hour, minute = int(at[0]), int(at[1])
            except (ValueError, IndexError):
                return found
            candidate = cursor.replace(hour=hour, minute=minute)
            cursor = candidate if candidate > cursor else candidate + timedelta(days=1)
        else:
            cursor += timedelta(minutes=1)
    return found


def validate_schedule(trigger_type: str, schedule: dict[str, Any]) -> list[dict[str, Any]]:
    problems: list[dict[str, Any]] = []
    if trigger_type in ("daily", "weekly"):
        at = schedule.get("at")
        try:
            hour, minute = (int(part) for part in str(at).split(":")[:2])
            if not (0 <= hour <= 23 and 0 <= minute <= 59):
                raise ValueError
        except (ValueError, TypeError):
            problems.append(problem(None, f"Schedule needs a time of day as HH:MM (got {at!r})."))
        if trigger_type == "weekly":
            days = schedule.get("days") or []
            if not days or not all(isinstance(d, int) and 0 <= d <= 6 for d in days):
                problems.append(problem(None, "A weekly schedule needs at least one weekday."))
    elif trigger_type == "once":
        run_at = schedule.get("run_at")
        try:
            target = datetime.fromisoformat(str(run_at))
        except (ValueError, TypeError):
            problems.append(problem(None, f"One-shot schedule needs a date and time (got {run_at!r})."))
        else:
            now = datetime.now(settings.tz)
            if target.tzinfo is None:
                target = target.replace(tzinfo=now.tzinfo)
            if target < now:
                problems.append(problem(None, "The one-shot time is in the past; it would be marked missed."))
    elif trigger_type == "cron":
        try:
            cron.validate(str(schedule.get("cron", "")))
        except cron.CronError as exc:
            problems.append(problem(None, f"Invalid cron expression: {exc}"))
    return problems


# ---------------------------------------------------------------------------
# Steps
# ---------------------------------------------------------------------------


def _manifest_for(record: Projector) -> dict[str, Any]:
    worker = manager.get(record.id)
    if worker is not None:
        return worker.driver.capabilities.as_dict()
    try:
        return capability_manifest(record.driver)
    except KeyError:
        return {"capabilities": [], "retracted": {}, "retracted_params": {}}


async def validate_steps(session, steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    problems: list[dict[str, Any]] = []
    projectors = {
        p.id: p for p in (await session.execute(select(Projector))).scalars().all()
    }
    manifests: dict[int, dict[str, Any]] = {}

    def manifest(pid: int) -> dict[str, Any]:
        if pid not in manifests:
            manifests[pid] = _manifest_for(projectors[pid])
        return manifests[pid]

    for index, step in enumerate(steps):
        kind = step.get("type", "command")
        if kind not in STEP_TYPES:
            problems.append(problem(index, f"Unknown step type {kind!r}."))
            continue

        if kind in ("command", "wait_state", "check_online", "check_faults"):
            ids = await resolve_target(session, step.get("target"))
            ids = [pid for pid in ids if pid in projectors]
            if not ids:
                problems.append(problem(index, "The target resolves to no projectors."))
                continue
            disabled = [projectors[pid].name for pid in ids if not projectors[pid].enabled]
            if disabled:
                problems.append(problem(
                    index, f"Disabled, will fail: {', '.join(disabled)}.", "warning"))
            for pid in ids:
                worker = manager.get(pid)
                if worker is not None and not worker.status.online:
                    problems.append(problem(
                        index, f"{projectors[pid].name} is not responding right now.", "warning"))

        if kind == "command":
            capability = step.get("capability")
            if not capability:
                problems.append(problem(index, "Choose a function for this step."))
                continue
            params = step.get("params") or {}
            for pid in ids:
                record = projectors[pid]
                caps = {c["name"]: c for c in manifest(pid)["capabilities"]}
                cap = caps.get(capability)
                if cap is None:
                    problems.append(problem(
                        index, f"{record.name} ({record.driver}) has no function {capability!r}."))
                    continue
                if cap["requires_opt_in"] and not record.allow_unverified_commands:
                    problems.append(problem(
                        index,
                        f"{capability!r} is gated on {record.name}: its provenance is "
                        f"{cap['provenance']}. Enable 'allow unverified commands' on that "
                        f"projector, or remove the step.",
                    ))
                if capability in manifest(pid)["retracted"]:
                    problems.append(problem(
                        index, f"{record.name} refused {capability!r} earlier: "
                               f"{manifest(pid)['retracted'][capability]}", "warning"))
                key = PARAM_KEY.get(capability)
                if cap["params"]:
                    value = params.get(key or "value")
                    if value is None:
                        problems.append(problem(
                            index, f"{capability!r} needs a value for '{key}' "
                                   f"(one of {', '.join(cap['params'])})."))
                    elif str(value).upper() not in {p.upper() for p in cap["params"]}:
                        problems.append(problem(
                            index, f"{value!r} is not valid for {capability!r} on {record.name} "
                                   f"(expected one of {', '.join(cap['params'])})."))
                    elif f"{capability}:{str(value).upper()}" in manifest(pid)["retracted_params"]:
                        problems.append(problem(
                            index, f"{record.name}: {manifest(pid)['retracted_params'][f'{capability}:{str(value).upper()}']}",
                            "warning"))
                if cap["value_range"]:
                    low, high = cap["value_range"]
                    try:
                        value = int(params.get("value"))
                    except (TypeError, ValueError):
                        problems.append(problem(
                            index, f"{capability!r} needs a numeric 'value' between {low} and {high}."))
                    else:
                        if not low <= value <= high:
                            problems.append(problem(
                                index, f"{value} is outside {low}-{high} for {capability!r}."))
                is_jog = capability.startswith("lens.") and capability not in (
                    "lens.home", "lens.calibrate", "lens.memory")
                try:
                    direction = int(params.get("direction", 0) or 0)
                except (TypeError, ValueError):
                    direction = 0
                if is_jog and direction not in (-1, 1):
                    problems.append(problem(index, "Lens jog needs a direction of +1 or -1."))
                if cap["provenance"] == Provenance.INFERRED_FAMILY.value and record.allow_unverified_commands:
                    problems.append(problem(
                        index, f"{capability!r} on {record.name} is unverified for this model; "
                               f"it runs because the projector has opted in.", "warning"))

        elif kind == "wait_state":
            capability = step.get("capability", "power.get")
            if capability not in WAIT_QUERIES:
                problems.append(problem(
                    index, f"Wait can poll {', '.join(WAIT_QUERIES)} — not {capability!r}."))
            expect = str(step.get("expect", "")).strip()
            allowed = WAIT_QUERIES.get(capability, ())
            if not expect:
                problems.append(problem(index, "Wait needs an expected state."))
            elif allowed and expect.lower() not in allowed:
                problems.append(problem(
                    index, f"{expect!r} is not a state {capability} reports "
                           f"(one of {', '.join(allowed)})."))
            timeout = step.get("timeout", 180)
            if not isinstance(timeout, int | float) or not 1 <= timeout <= 3600:
                problems.append(problem(index, "Wait timeout must be 1–3600 seconds."))

        elif kind == "delay":
            seconds = step.get("seconds", 1)
            if not isinstance(seconds, int | float) or not 0 <= seconds <= 1800:
                problems.append(problem(index, "Delay must be 0–1800 seconds."))

        elif kind == "check_enclosure":
            enclosure_id = step.get("enclosure_id")
            if enclosure_id is None or await session.get(Enclosure, int(enclosure_id)) is None:
                problems.append(problem(index, "Choose an enclosure that exists."))

        elif kind == "scene":
            scene_id = step.get("scene_id")
            if scene_id is None or await session.get(Scene, int(scene_id)) is None:
                problems.append(problem(index, "Choose a scene that exists."))

        elif kind == "notify":
            if not str(step.get("message", "")).strip():
                problems.append(problem(index, "Notification needs a message."))

    if not steps:
        problems.append(problem(None, "Add at least one step.", "warning"))
    return problems


async def validate_automation(session, *, trigger_type: str, schedule: dict[str, Any],
                              steps: list[dict[str, Any]]) -> dict[str, Any]:
    problems = validate_schedule(trigger_type, schedule) + await validate_steps(session, steps)
    runs = next_runs(trigger_type, schedule) if not any(
        p["severity"] == "error" and p["step"] is None for p in problems
    ) else []
    seen: set[tuple] = set()
    unique: list[dict] = []
    for p in problems:
        key = (p["step"], p["severity"], p["message"])
        if key not in seen:
            seen.add(key)
            unique.append(p)
    problems = unique
    return {
        "ok": not any(p["severity"] == "error" for p in problems),
        "problems": problems,
        "next_runs": [r.isoformat() for r in runs],
        "timezone": str(settings.tz),
    }
