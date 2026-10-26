"""Settings → Phone alerts: where alerts go when the app is closed."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import RequireAdmin
from app.services.phone_alerts import TOPICS, new_channel, phone

router = APIRouter(prefix="/phone-alerts", tags=["alerts"])


class PhoneAlertsIn(BaseModel):
    service: Literal["off", "ntfy", "pushover"] | None = None
    #: Pushover keys: left out or empty keeps the saved one.
    pushover_user: str | None = Field(default=None, max_length=64)
    pushover_token: str | None = Field(default=None, max_length=64)
    topics: dict[str, bool] | None = None
    all_clear: bool | None = None


class TestResult(BaseModel):
    ok: bool
    message: str


@router.get("")
async def read(_: RequireAdmin) -> dict:
    return phone.describe()


@router.put("")
async def update(payload: PhoneAlertsIn, _: RequireAdmin) -> dict:
    values = phone.load()
    if payload.service is not None:
        values["service"] = payload.service
        if payload.service == "ntfy" and not values["ntfy_topic"]:
            values["ntfy_topic"] = new_channel()
    for field in ("pushover_user", "pushover_token"):
        given = (getattr(payload, field) or "").strip()
        if given:
            if not given.isalnum() or len(given) < 20:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="That does not look like a Pushover key: they are 30 letters and "
                           "numbers. Copy it again from pushover.net.")
            values[field] = given
    if payload.topics is not None:
        values["topics"].update({t: bool(v) for t, v in payload.topics.items() if t in TOPICS})
    if payload.all_clear is not None:
        values["all_clear"] = payload.all_clear
    phone.save(values)
    return phone.describe()


@router.post("/new-channel")
async def renew(_: RequireAdmin) -> dict:
    """A new ntfy channel name: the old one stops getting alerts."""
    values = phone.load()
    values["ntfy_topic"] = new_channel()
    phone.save(values)
    return phone.describe()


@router.post("/test", response_model=TestResult)
async def test(_: RequireAdmin) -> TestResult:
    values = phone.load()
    if not phone.ready(values):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Pick ntfy or Pushover and finish its steps first.")
    ok, message = await phone.send(
        values, title="Test from Projector Control",
        message="Phone alerts work. You will get one like this when a projector runs hot, "
                "a mini PC goes offline or the show does not start.",
        level="warning", tag="tada")
    return TestResult(ok=ok, message="Sent. It should be on your phone in a few seconds."
                      if ok else message)
