"""Outdoor enclosure monitoring.

This platform records enclosure telemetry and raises alerts on it. It is
explicitly **not** the thermal safety device: hardware thermostats, thermal
cut-outs and interlocks must remain independent of this software. See
docs/SAFETY.md.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import RequireAdmin, RequireIngest, RequireViewer, SessionDep
from app.core.events import bus
from app.db.models import Enclosure, EnclosureReading, as_utc
from app.schemas import EnclosureIn, EnclosureOut, EnclosureReadingIn

router = APIRouter(prefix="/enclosures", tags=["enclosure"])


async def _latest_readings(session, enclosure_id: int,
                           max_age_seconds: int = 3600) -> dict:
    """Most recent value per metric, each tagged with its own freshness.

    A stale reading is returned with ``stale: true`` rather than omitted:
    "the sensor last said 22°C, 40 minutes ago" is useful, and materially
    different from "the sensor says 22°C".
    """
    rows = (await session.execute(
        select(EnclosureReading)
        .where(EnclosureReading.enclosure_id == enclosure_id)
        .order_by(EnclosureReading.recorded_at.desc())
        .limit(200)
    )).scalars().all()
    now = datetime.now(UTC)
    latest: dict[str, dict] = {}
    for row in rows:
        if row.metric in latest:
            continue
        recorded = as_utc(row.recorded_at)
        age = (now - recorded).total_seconds()
        latest[row.metric] = {
            "value": row.value_num if row.value_num is not None else row.value_text,
            "recorded_at": recorded,
            "age_seconds": round(age),
            "stale": age > max_age_seconds,
        }
    return latest


@router.get("", response_model=list[EnclosureOut])
async def list_enclosures(session: SessionDep, _: RequireViewer) -> list[EnclosureOut]:
    enclosures = (await session.execute(
        select(Enclosure).order_by(Enclosure.name)
    )).scalars().all()
    return [
        EnclosureOut(
            id=e.id, name=e.name, projector_id=e.projector_id, location=e.location,
            mqtt_prefix=e.mqtt_prefix, temp_warn_c=e.temp_warn_c,
            temp_critical_c=e.temp_critical_c, humidity_warn_pct=e.humidity_warn_pct,
            block_startup_on_fault=e.block_startup_on_fault, config=e.config or {},
            latest=await _latest_readings(session, e.id),
        )
        for e in enclosures
    ]


@router.post("", response_model=EnclosureOut, status_code=status.HTTP_201_CREATED)
async def create_enclosure(payload: EnclosureIn, session: SessionDep,
                           _: RequireAdmin) -> EnclosureOut:
    enclosure = Enclosure(**payload.model_dump())
    session.add(enclosure)
    await session.commit()
    await session.refresh(enclosure)
    return EnclosureOut(**payload.model_dump(), id=enclosure.id, latest={})


@router.patch("/{enclosure_id}", response_model=EnclosureOut)
async def update_enclosure(enclosure_id: int, payload: EnclosureIn,
                           session: SessionDep, _: RequireAdmin) -> EnclosureOut:
    enclosure = await session.get(Enclosure, enclosure_id)
    if enclosure is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Enclosure not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(enclosure, key, value)
    await session.commit()
    await session.refresh(enclosure)
    return EnclosureOut(
        id=enclosure.id, name=enclosure.name, projector_id=enclosure.projector_id,
        location=enclosure.location, mqtt_prefix=enclosure.mqtt_prefix,
        temp_warn_c=enclosure.temp_warn_c, temp_critical_c=enclosure.temp_critical_c,
        humidity_warn_pct=enclosure.humidity_warn_pct,
        block_startup_on_fault=enclosure.block_startup_on_fault,
        config=enclosure.config or {},
        latest=await _latest_readings(session, enclosure.id),
    )


@router.delete("/{enclosure_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_enclosure(enclosure_id: int, session: SessionDep,
                           _: RequireAdmin) -> None:
    enclosure = await session.get(Enclosure, enclosure_id)
    if enclosure is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Enclosure not found")
    await session.delete(enclosure)
    await session.commit()


@router.post("/{enclosure_id}/readings", status_code=status.HTTP_202_ACCEPTED)
async def ingest_reading(enclosure_id: int, payload: EnclosureReadingIn,
                         session: SessionDep, _: RequireIngest) -> dict:
    """Ingest one sensor reading.

    Sensors can also publish over MQTT; this endpoint exists so a controller
    with nothing but an HTTP client (an ESP32, a shell script, a Home
    Assistant automation) can report without a broker.
    """
    enclosure = await session.get(Enclosure, enclosure_id)
    if enclosure is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Enclosure not found")

    value_num: float | None = None
    value_text: str | None = None
    if isinstance(payload.value, bool):
        value_num = 1.0 if payload.value else 0.0
    elif isinstance(payload.value, int | float):
        value_num = float(payload.value)
    else:
        value_text = str(payload.value)[:255]

    reading = EnclosureReading(
        enclosure_id=enclosure_id, metric=payload.metric,
        value_num=value_num, value_text=value_text,
        recorded_at=payload.recorded_at or datetime.now(UTC),
    )
    session.add(reading)
    await session.commit()

    bus.publish("enclosure_reading", {
        "enclosure_id": enclosure_id, "name": enclosure.name,
        "metric": payload.metric,
        "value": value_num if value_num is not None else value_text,
    })
    return {"accepted": True, "metric": payload.metric}


@router.get("/{enclosure_id}/readings")
async def list_readings(enclosure_id: int, session: SessionDep, _: RequireViewer,
                        metric: str | None = Query(None),
                        hours: int = Query(24, ge=1, le=24 * 365),
                        limit: int = Query(2000, ge=1, le=20000)) -> dict:
    since = datetime.now(UTC) - timedelta(hours=hours)
    query = (select(EnclosureReading)
             .where(EnclosureReading.enclosure_id == enclosure_id,
                    EnclosureReading.recorded_at >= since))
    if metric:
        query = query.where(EnclosureReading.metric == metric)
    rows = (await session.execute(
        query.order_by(EnclosureReading.recorded_at.desc()).limit(limit)
    )).scalars().all()
    return {
        "enclosure_id": enclosure_id,
        "readings": [
            {"metric": r.metric,
             "value": r.value_num if r.value_num is not None else r.value_text,
             "recorded_at": r.recorded_at}
            for r in reversed(rows)
        ],
    }
