"""The emergency stop: stop the show, black every output, every projector off."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.api.deps import RequireOperator, RequireViewer, write_rate_limit
from app.api.routes.projectors import _source
from app.schemas.mapping import EmergencyResult, TransportState
from app.services.emergency import emergency
from app.services.mapping import transport

router = APIRouter(prefix="/emergency", tags=["emergency"])


@router.get("", response_model=TransportState)
async def emergency_state(_: RequireViewer) -> TransportState:
    """The transport, whose ``emergency`` field says whether the stop is on."""
    return transport.snapshot()


# No rate limit on purpose: the press that matters may be the third in a row.
@router.post("/stop", response_model=EmergencyResult)
async def press_emergency_stop(user: RequireOperator, request: Request) -> EmergencyResult:
    """Stop everything. Every projector's answer comes back on its own line."""
    result = await emergency.press(username=user.username, user_id=user.id,
                                   source=_source(request))
    return EmergencyResult(**result)


@router.post("/clear", response_model=EmergencyResult,
             dependencies=[Depends(write_rate_limit)])
async def clear_emergency_stop(user: RequireOperator) -> EmergencyResult:
    """Lift the hold. Nothing is switched back on by this."""
    return EmergencyResult(**await emergency.clear(username=user.username))
