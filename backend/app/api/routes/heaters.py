"""Heaters in projector boxes, their smart plugs, and the weather outside.

The rules that switch them are in services/heater.py.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import (
    RequireAdmin,
    RequireOperator,
    RequireViewer,
    SessionDep,
    write_rate_limit,
)
from app.core.security import encrypt_secret
from app.db.models import (
    Event,
    Heater,
    HeaterReading,
    MappingPlayer,
    Projector,
    Severity,
    WeatherPlace,
    as_utc,
)
from app.schemas.heater import (
    HeaterHistory,
    HeaterIn,
    HeaterMode,
    HeaterOut,
    HeaterPoint,
    HeatersOverview,
    InsideOut,
    OutsideOut,
    PlugTestIn,
    PlugTestOut,
    UsbSensorOut,
    WeatherPlaceIn,
)
from app.services import heater as heaters
from app.services import smart_plugs, weather

router = APIRouter(prefix="/heaters", tags=["heaters"])

#: Points on the chart, whatever the range.
MAX_POINTS = 300


async def _out(session, heater: Heater, now: datetime,
               show_at: datetime | None = None) -> HeaterOut:
    inside = await heaters.inside_reading(session, heater, now)
    warmup_at = heaters.warmup_from(heater, show_at)
    return HeaterOut(
        id=heater.id, name=heater.name, plug_kind=heater.plug_kind,
        plug_address=heater.plug_address, plug_entity=heater.plug_entity,
        has_secret=bool(heater.plug_secret_enc),
        sensor_player_id=heater.sensor_player_id, projector_id=heater.projector_id,
        on_below_c=heater.on_below_c, off_above_c=heater.off_above_c,
        max_inside_c=heater.max_inside_c, outside_on_below_c=heater.outside_on_below_c,
        outside_off_above_c=heater.outside_off_above_c,
        max_minutes_per_hour=heater.max_minutes_per_hour,
        interlock=heater.interlock, warmup_minutes=heater.warmup_minutes,
        projector_on=await heaters.projector_powered(session, heater),
        warmup_at=warmup_at, show_at=show_at if warmup_at else None,
        mode=heater.mode, hold_until=as_utc(heater.hold_until),
        rest_until=as_utc(heater.rest_until), is_on=heater.is_on,
        on_since=as_utc(heater.on_since), reason=heater.reason or "",
        plug_error=heater.plug_error,
        inside=InsideOut(celsius=inside.celsius, source=inside.source, at=inside.at)
        if inside else None,
    )


async def _load(session, heater_id: int) -> Heater:
    heater = await session.get(Heater, heater_id)
    if heater is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such heater")
    return heater


async def _check_links(session, payload: HeaterIn) -> None:
    if payload.sensor_player_id is not None \
            and await session.get(MappingPlayer, payload.sensor_player_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="That mini PC no longer exists.")
    if payload.projector_id is not None \
            and await session.get(Projector, payload.projector_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="That projector no longer exists.")


def _apply(heater: Heater, payload: HeaterIn) -> None:
    data = payload.model_dump(exclude={"plug_secret"})
    data["plug_entity"] = (data.get("plug_entity") or "").strip() or None
    for key, value in data.items():
        setattr(heater, key, value)
    if payload.plug_secret is not None:
        heater.plug_secret_enc = encrypt_secret(payload.plug_secret) if payload.plug_secret else None


@router.get("", response_model=HeatersOverview)
async def overview(session: SessionDep, _: RequireViewer) -> HeatersOverview:
    """Every heater with what it is doing, the weather, and the USB sensors seen."""
    now = datetime.now(UTC)
    rows = (await session.execute(select(Heater).order_by(Heater.name))).scalars().all()
    show_at = await heaters.next_show(session) if rows else None
    place = (await session.execute(select(WeatherPlace).limit(1))).scalars().first()
    found = await weather.outside(place.latitude, place.longitude) if place else None
    players = {p.id: p.name for p in (await session.execute(select(MappingPlayer))).scalars()}
    sensors = [
        UsbSensorOut(player_id=player_id, player_name=players[player_id], name=reading.name,
                     celsius=reading.celsius, humidity=reading.humidity, at=reading.at)
        for player_id, reading in sorted(heaters.usb_sensors.items())
        if player_id in players and now - reading.at <= heaters.SENSOR_FRESH
    ]
    return HeatersOverview(
        heaters=[await _out(session, h, now, show_at) for h in rows],
        outside=OutsideOut(
            place=WeatherPlaceIn(name=place.name, latitude=place.latitude,
                                 longitude=place.longitude) if place else None,
            celsius=found.celsius if found else None,
            fetched_at=datetime.fromtimestamp(found.fetched, UTC) if found else None,
            error=weather.last_error() if place else None),
        sensors=sensors,
    )


@router.post("", response_model=HeaterOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(write_rate_limit)])
async def create_heater(payload: HeaterIn, session: SessionDep, _: RequireAdmin) -> HeaterOut:
    await _check_links(session, payload)
    heater = Heater(mode="auto", reason="Just added; checking in a moment.")
    _apply(heater, payload)
    session.add(heater)
    await session.commit()
    await session.refresh(heater)
    heaters.service.poke()
    return await _out(session, heater, datetime.now(UTC))


@router.put("/{heater_id}", response_model=HeaterOut, dependencies=[Depends(write_rate_limit)])
async def update_heater(heater_id: int, payload: HeaterIn, session: SessionDep,
                        _: RequireAdmin) -> HeaterOut:
    heater = await _load(session, heater_id)
    await _check_links(session, payload)
    _apply(heater, payload)
    await session.commit()
    await session.refresh(heater)
    heaters.service.poke()
    return await _out(session, heater, datetime.now(UTC))


@router.delete("/{heater_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_heater(heater_id: int, session: SessionDep, _: RequireAdmin) -> None:
    heater = await _load(session, heater_id)
    await session.delete(heater)
    await session.commit()


@router.post("/{heater_id}/mode", response_model=HeaterOut,
             dependencies=[Depends(write_rate_limit)])
async def set_mode(heater_id: int, payload: HeaterMode, session: SessionDep,
                   user: RequireOperator) -> HeaterOut:
    """Automatic, on by hand for an hour, or kept off."""
    heater = await _load(session, heater_id)
    now = datetime.now(UTC)
    heater.mode = payload.mode
    heater.hold_until = now + heaters.HOLD if payload.mode == "on" else None
    if payload.mode != "auto":
        heater.rest_until = None
    words = {"auto": "set back to automatic", "on": "turned on by hand for an hour",
             "off": "kept off by hand"}[payload.mode]
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="heater_mode",
                      details={"heater_id": heater.id, "by": user.username},
                      message=f"{heater.name} {words} by {user.username}."))
    await session.commit()
    await heaters.service.tick()
    await session.refresh(heater)
    return await _out(session, heater, datetime.now(UTC))


@router.post("/test-plug", response_model=PlugTestOut, dependencies=[Depends(write_rate_limit)])
async def test_plug(payload: PlugTestIn, session: SessionDep, _: RequireAdmin) -> PlugTestOut:
    """Ask the plug whether it is on, without switching it."""
    secret = payload.plug_secret
    if secret is None and payload.heater_id is not None:
        saved = await session.get(Heater, payload.heater_id)
        secret = heaters.plug_of(saved).secret if saved else None
    plug = smart_plugs.Plug(kind=payload.plug_kind, address=payload.plug_address,
                            entity=payload.plug_entity, secret=secret or None)
    try:
        on, model = await smart_plugs.read(plug)
    except smart_plugs.PlugError as exc:
        return PlugTestOut(ok=False, message=str(exc))
    return PlugTestOut(ok=True, on=on, model=model,
                       message=f"Found it: {model}, switched {'on' if on else 'off'} right now.")


@router.get("/{heater_id}/history", response_model=HeaterHistory)
async def history(heater_id: int, session: SessionDep, _: RequireViewer,
                  hours: int = Query(12, ge=1, le=24 * 30)) -> HeaterHistory:
    """Inside, outside and on or off over the last ``hours``, averaged into slices."""
    await _load(session, heater_id)
    until = datetime.now(UTC)
    since = until - timedelta(hours=hours)
    rows = (await session.execute(
        select(HeaterReading)
        .where(HeaterReading.heater_id == heater_id, HeaterReading.recorded_at >= since)
        .order_by(HeaterReading.recorded_at)
    )).scalars().all()
    slice_ms = max(60_000, hours * 3600_000 // MAX_POINTS)
    buckets: dict[int, list[HeaterReading]] = {}
    for row in rows:
        ms = int(as_utc(row.recorded_at).timestamp() * 1000)
        buckets.setdefault(ms - ms % slice_ms, []).append(row)

    def mean(values: list[float | None]) -> float | None:
        known = [v for v in values if v is not None]
        return round(sum(known) / len(known), 2) if known else None

    points = []
    for start, group in sorted(buckets.items()):
        states = [r.is_on for r in group if r.is_on is not None]
        points.append(HeaterPoint(
            t=start, inside=mean([r.inside_c for r in group]),
            outside=mean([r.outside_c for r in group]),
            on=round(sum(states) / len(states), 2) if states else None))
    return HeaterHistory(heater_id=heater_id, since=since, until=until, points=points,
                         minutes_on=sum(1 for r in rows if r.is_on))


@router.get("/weather/search")
async def search_places(_: RequireAdmin, q: str = Query(min_length=2, max_length=100)) -> list[dict]:
    """Places for a town name or ZIP code, to pick where the house is."""
    try:
        return await weather.search(q)
    except weather.WeatherError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.put("/weather/place", response_model=OutsideOut, dependencies=[Depends(write_rate_limit)])
async def set_place(payload: WeatherPlaceIn, session: SessionDep, _: RequireAdmin) -> OutsideOut:
    place = (await session.execute(select(WeatherPlace).limit(1))).scalars().first()
    if place is None:
        place = WeatherPlace(**payload.model_dump())
        session.add(place)
    else:
        for key, value in payload.model_dump().items():
            setattr(place, key, value)
    await session.commit()
    weather.forget()
    found = await weather.outside(payload.latitude, payload.longitude)
    heaters.service.poke()
    return OutsideOut(place=payload, celsius=found.celsius if found else None,
                      fetched_at=datetime.fromtimestamp(found.fetched, UTC) if found else None,
                      error=weather.last_error())
