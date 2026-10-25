"""Scene groups and tonight's show, for the home page.

A scene group picks a scene for every projector of a show under one name
("Halloween night"); using it makes every projector follow it. Tonight's
show is which group plays and when the show starts and stops by itself.
See services/tonight.py.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.deps import (
    RequireAdmin,
    RequireOperator,
    RequireViewer,
    SessionDep,
    command_rate_limit,
    write_rate_limit,
)
from app.api.routes.mapping import _check_output_scenes, _check_scene, _load_show
from app.config import settings
from app.core.events import bus
from app.db.models import Event, MappingSceneGroup, Severity
from app.schemas.tonight import (
    PlanUpdate,
    SceneGroupCreate,
    SceneGroupOut,
    SceneGroupUpdate,
    TonightAction,
    TonightOut,
)
from app.services import tonight as service

router = APIRouter(tags=["tonight"])


def _groups_changed(show_id: int) -> None:
    bus.publish("scene_groups", {"show_id": show_id})


async def _load_group(session, group_id: int) -> MappingSceneGroup:
    group = await session.get(MappingSceneGroup, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Scene group {group_id} not found")
    return group


async def _name_taken(session, show_id: int, name: str, *, besides: int | None = None) -> bool:
    query = select(MappingSceneGroup.id).where(MappingSceneGroup.show_id == show_id,
                                               MappingSceneGroup.name == name)
    if besides is not None:
        query = query.where(MappingSceneGroup.id != besides)
    return (await session.execute(query)).first() is not None


async def _tonight(session) -> TonightOut:
    return TonightOut(**await service.describe(session))


# -- scene groups ------------------------------------------------------------------


@router.get("/mapping/scene-groups", response_model=list[SceneGroupOut])
async def list_groups(session: SessionDep, _: RequireViewer,
                      show_id: int | None = Query(default=None)) -> list[MappingSceneGroup]:
    query = select(MappingSceneGroup).order_by(MappingSceneGroup.show_id,
                                               MappingSceneGroup.position,
                                               MappingSceneGroup.id)
    if show_id is not None:
        query = query.where(MappingSceneGroup.show_id == show_id)
    return list((await session.execute(query)).scalars().all())


@router.post("/mapping/scene-groups", response_model=SceneGroupOut,
             status_code=status.HTTP_201_CREATED, dependencies=[Depends(write_rate_limit)])
async def create_group(payload: SceneGroupCreate, session: SessionDep,
                       admin: RequireAdmin) -> MappingSceneGroup:
    show = await _load_show(session, payload.show_id)
    if await _name_taken(session, show.id, payload.name):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"There is already a group called {payload.name!r}")
    await _check_scene(session, payload.scene_id)
    count = (await session.execute(
        select(func.count()).where(MappingSceneGroup.show_id == show.id)
    )).scalar() or 0
    group = MappingSceneGroup(
        show_id=show.id, name=payload.name, position=count, scene_id=payload.scene_id,
        output_scenes=await _check_output_scenes(session, show.id, payload.output_scenes),
    )
    session.add(group)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="scene_group_created",
                      message=f"{admin.username} made the scene group {payload.name}"))
    await session.commit()
    await session.refresh(group)
    _groups_changed(show.id)
    return group


@router.patch("/mapping/scene-groups/{group_id}", response_model=SceneGroupOut,
              dependencies=[Depends(write_rate_limit)])
async def update_group(group_id: int, payload: SceneGroupUpdate, session: SessionDep,
                       _: RequireAdmin) -> MappingSceneGroup:
    group = await _load_group(session, group_id)
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        if changes["name"] is None:
            changes.pop("name")
        elif await _name_taken(session, group.show_id, changes["name"], besides=group.id):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                detail=f"There is already a group called {changes['name']!r}")
    if "scene_id" in changes:
        await _check_scene(session, changes["scene_id"])
    if "output_scenes" in changes:
        changes["output_scenes"] = await _check_output_scenes(
            session, group.show_id, changes["output_scenes"] or {})
    for field, value in changes.items():
        setattr(group, field, value)
    # The group playing tonight changes on the projectors too.
    live = (("scene_id" in changes or "output_scenes" in changes)
            and group.id in await service.tonights_group_ids(session))
    if live:
        await service.apply_group(session, group)
    await session.commit()
    await session.refresh(group)
    _groups_changed(group.show_id)
    if live:
        bus.publish("mapping_show", {"show_id": group.show_id})
        service.changed()
    return group


@router.delete("/mapping/scene-groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT,
               response_model=None, dependencies=[Depends(write_rate_limit)])
async def delete_group(group_id: int, session: SessionDep, admin: RequireAdmin) -> None:
    group = await _load_group(session, group_id)
    show_id = group.show_id
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="scene_group_deleted",
                      message=f"{admin.username} deleted the scene group {group.name}"))
    await session.delete(group)
    await session.commit()
    _groups_changed(show_id)
    service.changed()


@router.post("/mapping/scene-groups/{group_id}/use", response_model=TonightOut,
             dependencies=[Depends(command_rate_limit)])
async def use_group(group_id: int, session: SessionDep, user: RequireOperator) -> TonightOut:
    """Play this group tonight, and on every projector now."""
    group = await _load_group(session, group_id)
    plan = await service.load_plan(session)
    plan.show_id = group.show_id
    plan.group_id = group.id
    cues = await service.apply_group(session, group)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="scene_group_used",
                      message=f"{user.username} picked {group.name} for tonight "
                              f"({cues} cue{'s' if cues != 1 else ''} changed)"))
    await session.commit()
    bus.publish("mapping_show", {"show_id": group.show_id})
    service.changed()
    return await _tonight(session)


# -- tonight's show ----------------------------------------------------------------


@router.get("/tonight", response_model=TonightOut)
async def get_tonight(session: SessionDep, _: RequireViewer) -> TonightOut:
    out = await _tonight(session)
    await session.commit()  # the plan row is made on first read
    return out


@router.put("/tonight", response_model=TonightOut, dependencies=[Depends(write_rate_limit)])
async def update_tonight(payload: PlanUpdate, session: SessionDep,
                         user: RequireOperator) -> TonightOut:
    plan = await service.load_plan(session)
    changes = payload.model_dump(exclude_unset=True)
    if "show_id" in changes and changes["show_id"] is not None:
        await _load_show(session, changes["show_id"])
        if changes["show_id"] != plan.show_id:
            plan.group_id = None
    for field, value in changes.items():
        setattr(plan, field, value)
    if plan.enabled and not (plan.start_at and plan.end_at):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Set both a start time and an end time")
    if plan.enabled and plan.start_at == plan.end_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="The end time has to be different from the start time")
    if plan.enabled and not plan.days:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Pick at least one night of the week")
    if {"start_at", "end_at", "days", "enabled"} & changes.keys():
        times = f"{plan.start_at} to {plan.end_at}" if plan.enabled else "off"
        session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="tonight_changed",
                          message=f"{user.username} set tonight's show time: {times}"))
    await session.commit()
    service.changed()
    return await _tonight(session)


@router.post("/tonight/start", response_model=TonightAction,
             dependencies=[Depends(command_rate_limit)])
async def start_tonight(session: SessionDep, user: RequireOperator) -> TonightAction:
    ok, message = await service.start_show(by=user.username)
    if ok:
        current, _ = await service.show_time(session, datetime.now(settings.tz))
        if current is not None:
            plan = await service.load_plan(session)
            plan.last_start_key = current.key
            plan.last_start_date = current.night.isoformat()
            plan.last_end_key = None
            plan.last_end_date = None
            service.scheduler.mark_started(current.key)
        await session.commit()
    return TonightAction(ok=ok, message=message, tonight=await _tonight(session))


@router.post("/tonight/stop", response_model=TonightAction,
             dependencies=[Depends(command_rate_limit)])
async def stop_tonight(session: SessionDep, user: RequireOperator) -> TonightAction:
    ok, message = await service.stop_show(by=user.username, power_off=False)
    return TonightAction(ok=ok, message=message, tonight=await _tonight(session))
