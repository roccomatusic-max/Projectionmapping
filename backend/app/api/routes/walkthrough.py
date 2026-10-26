"""Walk the yard: check each projector in turn from the phone (services/walkthrough.py)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import RequireOperator, RequireViewer, SessionDep, write_rate_limit
from app.api.routes.mapping_players import is_online
from app.db.models import MappingPlayer
from app.schemas.walkthrough import (
    WalkAnswer,
    WalkGoTo,
    WalkOut,
    WalkPictureSet,
    WalkStart,
    WalkState,
)
from app.services.walkthrough import WalkError, walkthrough

router = APIRouter(prefix="/walkthrough", tags=["walkthrough"])


async def _live(session, walk: WalkState | None) -> WalkState | None:
    """The walk with each mini PC's answering now, read fresh."""
    if walk is None or walk.status != "walking":
        return walk
    walk = walk.model_copy(deep=True)
    for stop in walk.stops:
        player = await session.get(MappingPlayer, stop.player_id)
        stop.online = player is not None and is_online(player)
    return walk


async def _do(session, work) -> WalkState:
    try:
        walk = await work
    except WalkError as err:
        raise HTTPException(status_code=err.status, detail=str(err)) from err
    return await _live(session, walk)


@router.get("", response_model=WalkOut)
async def walk_state(session: SessionDep, _: RequireViewer) -> WalkOut:
    return WalkOut(active=await _live(session, walkthrough.active), last=await walkthrough.last())


@router.post("/start", response_model=WalkState, dependencies=[Depends(write_rate_limit)])
async def start_walk(payload: WalkStart, session: SessionDep, user: RequireOperator) -> WalkState:
    """Light the first projector; black the rest. A walk going on is picked up again."""
    return await _do(session, walkthrough.start(by=user.username, stop_show=payload.stop_show))


@router.post("/answer", response_model=WalkState)
async def answer(payload: WalkAnswer, session: SessionDep, _: RequireOperator) -> WalkState:
    """Looks good or something's wrong; the next projector lights up, or the walk ends."""
    return await _do(session, walkthrough.answer(payload.index, payload.result,
                                                 list(payload.problems), payload.note))


@router.post("/go", response_model=WalkState)
async def go_to(payload: WalkGoTo, session: SessionDep, _: RequireOperator) -> WalkState:
    """Light another projector on the walk: back one, or skip ahead."""
    return await _do(session, walkthrough.go_to(payload.index))


@router.post("/picture", response_model=WalkState)
async def picture(payload: WalkPictureSet, session: SessionDep, _: RequireOperator) -> WalkState:
    """The ID grid or full white on the projector being checked."""
    return await _do(session, walkthrough.show_picture(payload.picture))


@router.post("/stop", response_model=WalkOut)
async def stop_walk(session: SessionDep, user: RequireOperator) -> WalkOut:
    """End the walk now; every projector goes back to what it showed before."""
    await walkthrough.stop(f"stopped by {user.username}")
    return WalkOut(active=None, last=await walkthrough.last())
