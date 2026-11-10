"""Show history, the energy report and season wrap-ups (Health → Show history).

See services/show_history.py for how shows are recorded.
"""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.deps import RequireOperator, RequireViewer, SessionDep, write_rate_limit
from app.core.events import bus
from app.db.models import Event, Projector, Severity
from app.services import show_history as service

router = APIRouter(prefix="/history", tags=["history"])


@router.get("/nights")
async def list_nights(session: SessionDep, _: RequireViewer,
                      days: int = Query(60, ge=1, le=800)) -> dict:
    """Every show time in the last ``days`` nights, newest first."""
    today = service.night_of(service.utcnow())
    rows = await service.nights(session, since=today - timedelta(days=days - 1))
    saved = await service.load_settings(session)
    await session.commit()
    return {"nights": rows, "currency": saved.currency, "price_per_kwh": saved.price_per_kwh,
            "history_since": service.as_utc(saved.started_at), "days": days}


@router.get("/energy")
async def energy_report(session: SessionDep, _: RequireViewer,
                        weeks: int = Query(8, ge=1, le=53)) -> dict:
    report = await service.energy(session, weeks=weeks)
    await session.commit()
    return report


class EnergySettingsIn(BaseModel):
    price_per_kwh: float = Field(ge=0, le=10)
    currency: str = Field(default="$", min_length=1, max_length=8)
    #: {projector id: watts}; a projector left out (or 0) uses its model's figure.
    watts: dict[str, int] = Field(default_factory=dict)


@router.put("/energy/settings", dependencies=[Depends(write_rate_limit)])
async def save_energy_settings(payload: EnergySettingsIn, session: SessionDep,
                               user: RequireOperator) -> dict:
    saved = await service.load_settings(session)
    watts = {}
    for key, value in payload.watts.items():
        if not key.isdigit() or await session.get(Projector, int(key)) is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Projector {key} not found")
        if not 0 <= value <= 20000:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="Watts must be between 0 and 20,000")
        if value > 0:
            watts[key] = value
    saved.price_per_kwh = round(payload.price_per_kwh, 4)
    saved.currency = payload.currency.strip() or "$"
    saved.watts = watts
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="energy_settings",
                      message=f"{user.username} set the electricity price to "
                              f"{saved.currency}{saved.price_per_kwh:g} per kWh"))
    await session.commit()
    bus.publish("show_history", {})
    return await service.energy(session, weeks=8)


@router.get("/seasons")
async def list_seasons(session: SessionDep, _: RequireViewer) -> dict:
    found = await service.seasons(session)
    await session.commit()
    return {"seasons": found,
            "just_finished": next((s for s in found if s["just_finished"]), None)}


@router.get("/wrapup")
async def season_wrapup(session: SessionDep, _: RequireViewer,
                        start: date = Query(...), end: date = Query(...),
                        name: str = Query("", max_length=128)) -> dict:
    if end < start:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="The last night is before the first")
    if (end - start).days > 400:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Pick at most 400 nights")
    report = await service.wrapup(session, start=start, end=end,
                                  name=name.strip() or f"{start:%b %-d} to {end:%b %-d, %Y}")
    await session.commit()
    return report
