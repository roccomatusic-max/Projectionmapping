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
