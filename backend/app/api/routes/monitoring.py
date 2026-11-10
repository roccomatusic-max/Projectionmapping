"""Events, alerts and fleet overview."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.deps import RequireAdmin, RequireOperator, RequireViewer, SessionDep
from app.config import settings
from app.db.models import (
    Alert,
    AlertRule,
    AlertState,
    Event,
    Projector,
    ProjectorState,
    Severity,
    as_utc,
)
from app.schemas import AlertOut, AlertRuleIn, AlertRuleOut, EventOut
from app.services.device_manager import manager

router = APIRouter(tags=["monitoring"])


@router.get("/overview")
async def fleet_overview(session: SessionDep, _: RequireViewer) -> dict:
    """Fleet counters for the dashboard header.

    'Online' is computed from the staleness window, not from the stored
    boolean, so a projector whose polls have stopped is counted as offline
    even though its last reading said otherwise.
    """
    projectors = (await session.execute(select(Projector))).scalars().all()
    states = {
        s.projector_id: s
        for s in (await session.execute(select(ProjectorState))).scalars().all()
    }
    now = datetime.now(UTC)
    counters = {"total": len(projectors), "enabled": 0, "online": 0, "offline": 0,
                "powered_on": 0, "standby": 0, "warming": 0, "cooling": 0,
                "warnings": 0, "faults": 0, "stale": 0, "unknown": 0}

    for projector in projectors:
        if projector.enabled:
            counters["enabled"] += 1
        state = states.get(projector.id)
        if state is None or state.last_seen_at is None:
            counters["offline"] += 1
            counters["unknown"] += 1
            continue
        stale_after = state.stale_after or int(
            settings.poll_operational * settings.staleness_multiplier
        )
        last_seen = as_utc(state.last_seen_at)
        if (now - last_seen) > timedelta(seconds=stale_after):
            counters["offline"] += 1
            counters["stale"] += 1
            continue
        if not state.online:
            counters["offline"] += 1
            continue
        counters["online"] += 1
        match state.power:
            case "on":
                counters["powered_on"] += 1
            case "off":
                counters["standby"] += 1
            case "warming":
                counters["warming"] += 1
            case "cooling":
                counters["cooling"] += 1
            case _:
                counters["unknown"] += 1
        if state.health == "warning":
            counters["warnings"] += 1
        elif state.health == "error":
            counters["faults"] += 1

    open_alerts = (await session.execute(
        select(func.count()).select_from(Alert)
        .where(Alert.state != AlertState.RESOLVED.value)
    )).scalar_one()
    critical_alerts = (await session.execute(
        select(func.count()).select_from(Alert).where(
            Alert.state != AlertState.RESOLVED.value,
            Alert.severity == Severity.CRITICAL.value,
        )
    )).scalar_one()

    return {
        **counters,
        "open_alerts": open_alerts,
        "critical_alerts": critical_alerts,
        "queue_depth": sum(w.queue_depth for w in manager.workers),
        "generated_at": now,
    }


@router.get("/events", response_model=list[EventOut])
async def list_events(
    session: SessionDep, _: RequireViewer,
    projector_id: int | None = Query(None),
    severity: str | None = Query(None),
    kind: str | None = Query(None),
    hours: int = Query(168, ge=1, le=24 * 365),
    limit: int = Query(200, ge=1, le=2000),
) -> list[Event]:
    since = datetime.now(UTC) - timedelta(hours=hours)
    query = select(Event).where(Event.created_at >= since)
    if projector_id is not None:
        query = query.where(Event.projector_id == projector_id)
    if severity:
        query = query.where(Event.severity == severity)
    if kind:
        query = query.where(Event.kind.like(f"%{kind}%"))
    query = query.order_by(Event.created_at.desc()).limit(limit)
    return list((await session.execute(query)).scalars().all())


@router.get("/alerts", response_model=list[AlertOut])
async def list_alerts(
    session: SessionDep, _: RequireViewer,
    state: str | None = Query(None, description="open | acknowledged | resolved"),
    limit: int = Query(200, ge=1, le=2000),
) -> list[Alert]:
    query = select(Alert)
    if state:
        query = query.where(Alert.state == state)
    else:
        query = query.where(Alert.state != AlertState.RESOLVED.value)
    query = query.order_by(Alert.opened_at.desc()).limit(limit)
    return list((await session.execute(query)).scalars().all())


@router.post("/alerts/{alert_id}/acknowledge", response_model=AlertOut)
async def acknowledge_alert(alert_id: int, session: SessionDep,
                            user: RequireOperator) -> Alert:
    """Acknowledge an alert.

    Acknowledging silences re-notification but does not resolve the alert:
    the condition is still live until the monitor observes it clear.
    """
    alert = await session.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    if alert.state == AlertState.RESOLVED.value:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="This alert has already resolved")
    alert.state = AlertState.ACKNOWLEDGED.value
    alert.acknowledged_at = datetime.now(UTC)
    alert.acknowledged_by = user.username
    session.add(Event(projector_id=alert.projector_id, severity=Severity.INFO.value,
                      kind="alert_acknowledged",
                      message=f"{user.username} acknowledged: {alert.message}"))
    await session.commit()
    await session.refresh(alert)
    return alert


@router.get("/alert-rules", response_model=list[AlertRuleOut])
async def list_alert_rules(session: SessionDep, _: RequireViewer) -> list[AlertRule]:
    return list((await session.execute(
        select(AlertRule).order_by(AlertRule.name)
    )).scalars().all())


@router.post("/alert-rules", response_model=AlertRuleOut,
             status_code=status.HTTP_201_CREATED)
async def create_alert_rule(payload: AlertRuleIn, session: SessionDep,
                            _: RequireAdmin) -> AlertRule:
    rule = AlertRule(**payload.model_dump())
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return rule


@router.patch("/alert-rules/{rule_id}", response_model=AlertRuleOut)
async def update_alert_rule(rule_id: int, payload: AlertRuleIn, session: SessionDep,
                            _: RequireAdmin) -> AlertRule:
    rule = await session.get(AlertRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)
    await session.commit()
    await session.refresh(rule)
    return rule


@router.delete("/alert-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_alert_rule(rule_id: int, session: SessionDep, _: RequireAdmin) -> None:
    rule = await session.get(AlertRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    await session.delete(rule)
    await session.commit()


@router.get("/analytics/usage")
async def usage_analytics(
    session: SessionDep, _: RequireViewer,
    days: int = Query(30, ge=1, le=365),
    projector_id: int | None = Query(None),
) -> dict:
    """Daily operating hours and fault counts, per projector.

    Operating hours are estimated by counting telemetry samples where power
    was on and multiplying by the operational poll interval. That is an
    estimate, and the response says so — the projector's own lamp-hour
    counter is the authoritative figure and is reported separately.
    """
    from app.db.models import Telemetry

    since = datetime.now(UTC) - timedelta(days=days)
    query = (select(Telemetry.projector_id,
                    func.date(Telemetry.recorded_at).label("day"),
                    func.count().label("samples"),
                    func.sum(Telemetry.value_num).label("on_samples"))
             .where(Telemetry.metric == "power", Telemetry.recorded_at >= since)
             .group_by(Telemetry.projector_id, "day"))
    if projector_id is not None:
        query = query.where(Telemetry.projector_id == projector_id)
    rows = (await session.execute(query)).all()

    interval_hours = settings.poll_operational / 3600.0
    series = [
        {
            "projector_id": row.projector_id,
            "day": str(row.day),
            "samples": row.samples,
            "estimated_on_hours": round((row.on_samples or 0) * interval_hours, 2),
        }
        for row in rows
    ]

    fault_rows = (await session.execute(
        select(Event.projector_id, func.count().label("count"))
        .where(Event.created_at >= since,
               Event.severity.in_([Severity.WARNING.value, Severity.CRITICAL.value]))
        .group_by(Event.projector_id)
    )).all()

    return {
        "days": days,
        "note": (
            "estimated_on_hours is derived from polling samples and is an estimate. "
            "Use each projector's own lamp runtime counter for authoritative hours."
        ),
        "sample_interval_seconds": settings.poll_operational,
        "usage": sorted(series, key=lambda r: (r["projector_id"], r["day"])),
        "faults": [{"projector_id": r.projector_id, "count": r.count} for r in fault_rows],
    }


#: Points per sensor on the temperature chart, whatever the range.
TEMPERATURE_CHART_POINTS = 240


def _fahrenheit(celsius: float) -> float:
    return round(celsius * 9 / 5 + 32, 1)


def _reading(celsius: float, at: datetime) -> dict:
    return {"celsius": round(celsius, 1), "fahrenheit": _fahrenheit(celsius),
            "recorded_at": as_utc(at)}


def _temperature_state(celsius: float | None, limit: float | None) -> str:
    if celsius is None:
        return "unknown"
    if limit is None:
        return "ok"
    if celsius >= limit:
        return "over"
    if celsius >= limit - settings.temperature_warn_margin_c:
        return "near"
    return "ok"


@router.get("/analytics/temperatures")
async def temperature_history(
    session: SessionDep, _: RequireViewer,
    projector_id: int = Query(...),
    hours: int = Query(12, ge=1, le=24 * 7),
) -> dict:
    """One projector's sensor temperatures over the last ``hours``.

    The chart gets at most :data:`TEMPERATURE_CHART_POINTS` points per
    sensor. Each point is the hottest sample in its slice of time, so a
    short spike is never averaged away. Slices with no sample (projector
    unplugged, or not answering) are null, so the line shows the gap.
    """
    from app.db.models import Telemetry
    from app.drivers.panasonic_ptdz13k import TEMPERATURE_SENSORS
    from app.services.monitor import TEMPERATURE_METRIC_PREFIX

    projector = await session.get(Projector, projector_id)
    if projector is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projector not found")
    state = await session.get(ProjectorState, projector_id)
    now = datetime.now(UTC)
    since = now - timedelta(hours=hours)

    rows = (await session.execute(
        select(Telemetry.metric, Telemetry.value_num, Telemetry.recorded_at)
        .where(Telemetry.projector_id == projector_id,
               Telemetry.metric.startswith(TEMPERATURE_METRIC_PREFIX, autoescape=True),
               Telemetry.recorded_at >= since)
        .order_by(Telemetry.recorded_at)
    )).all()

    labels = {key: label for _, key, label in TEMPERATURE_SENSORS}
    limits = {"intake": settings.temperature_intake_limit_c}
    bucket_seconds = hours * 3600 / TEMPERATURE_CHART_POINTS
    buckets: list[dict[str, float | None]] = [{} for _ in range(TEMPERATURE_CHART_POINTS)]
    hottest: dict[str, tuple[float, datetime]] = {}
    seen: list[str] = []
    for metric, value, at in rows:
        if value is None:
            continue
        key = metric[len(TEMPERATURE_METRIC_PREFIX):]
        if key not in seen:
            seen.append(key)
        at = as_utc(at)
        index = min(int((at - since).total_seconds() // bucket_seconds),
                    TEMPERATURE_CHART_POINTS - 1)
        bucket = buckets[max(index, 0)]
        if bucket.get(key) is None or value > bucket[key]:
            bucket[key] = value
        if key not in hottest or value > hottest[key][0]:
            hottest[key] = (value, at)

    # The newest reading of each sensor, even when it is older than the range.
    order = [key for _, key, _ in TEMPERATURE_SENSORS]
    latest_rows = {}
    for key in order + [k for k in seen if k not in order]:
        row = (await session.execute(
            select(Telemetry.value_num, Telemetry.recorded_at)
            .where(Telemetry.projector_id == projector_id,
                   Telemetry.metric == f"{TEMPERATURE_METRIC_PREFIX}{key}")
            .order_by(Telemetry.recorded_at.desc()).limit(1)
        )).first()
        if row is not None and row.value_num is not None:
            latest_rows[key] = row
    keys = list(latest_rows)

    fresh_within = timedelta(seconds=max(settings.poll_diagnostics * 3, 180))
    sensors = []
    for key in keys:
        limit = limits.get(key)
        latest = latest_rows.get(key)
        peak = hottest.get(key)
        latest_at = as_utc(latest.recorded_at) if latest else None
        sensors.append({
            "key": key,
            "label": labels.get(key, key.replace("_", " ").capitalize()),
            "limit_celsius": limit,
            "limit_fahrenheit": _fahrenheit(limit) if limit is not None else None,
            "warn_celsius": (limit - settings.temperature_warn_margin_c
                             if limit is not None else None),
            "latest": _reading(latest.value_num, latest.recorded_at) if latest else None,
            "latest_is_current": bool(latest_at and now - latest_at <= fresh_within),
            "state": (_temperature_state(latest.value_num, limit)
                      if latest and now - latest_at <= fresh_within else "unknown"),
            "hottest": _reading(*peak) if peak else None,
            "hottest_state": _temperature_state(peak[0] if peak else None, limit),
        })

    overall = None
    for sensor in sensors:
        peak = sensor["hottest"]
        if peak and (overall is None or peak["celsius"] > overall["celsius"]):
            overall = {**peak, "key": sensor["key"], "label": sensor["label"]}

    # What the projector itself says about its temperature (PJLink ERST),
    # and why there may be no numbers at all.
    equipment = ((state.extra or {}).get("equipment") or {}) if state else {}
    reported = equipment.get("temperature") or {}
    value = reported.get("value") if isinstance(reported.get("value"), dict) else {}
    condition = value.get("condition")
    if condition is None and state and isinstance(state.error_status, dict):
        erst = state.error_status.get("value")
        if isinstance(erst, dict):
            condition = erst.get("temperature")

    def both(celsius: float) -> str:
        return f"{_fahrenheit(celsius):.0f} °F ({celsius:g} °C)"

    warnings = []
    for sensor in sensors:
        limit = sensor["limit_celsius"]
        if sensor["state"] in ("near", "over") and sensor["latest"]:
            word = "at or above" if sensor["state"] == "over" else "close to"
            warnings.append(
                f"{sensor['label']} is {both(sensor['latest']['celsius'])}, {word} the "
                f"projector's limit of {both(limit)}."
            )
        elif sensor["hottest_state"] in ("near", "over") and sensor["hottest"]:
            warnings.append(
                f"{sensor['label']} reached {both(sensor['hottest']['celsius'])} in this "
                f"time, close to the projector's limit of {both(limit)}. It is cooler now."
            )
    if condition in ("warning", "error"):
        warnings.insert(0, "The projector itself reports a temperature "
                           f"{'fault' if condition == 'error' else 'warning'}.")

    return {
        "projector_id": projector_id,
        "hours": hours,
        "since": since,
        "until": now,
        "bucket_seconds": round(bucket_seconds),
        "sample_interval_seconds": settings.poll_diagnostics,
        "retention_days": settings.temperature_retention_days,
        "sensors": sensors,
        "hottest": overall,
        "condition": condition,
        "note": reported.get("note") if not sensors else None,
        "warnings": warnings,
        "points": [
            {"t": int((since + timedelta(seconds=bucket_seconds * (i + 0.5))).timestamp() * 1000),
             **{key: (round(b[key], 1) if b.get(key) is not None else None) for key in keys}}
            for i, b in enumerate(buckets)
        ],
    }
