"""Scene groups and tonight's show, for the home page.

A scene group picks a scene for every projector of a show under one name
("Halloween night"); using it makes every projector follow it. Tonight's
show is which group plays and when the show starts and stops by itself.
A playlist is groups taking turns through the night at set times.
See services/tonight.py and services/playlists.py.
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
from app.db.models import Event, MappingPlaylist, MappingSceneGroup, Severity
from app.schemas.tonight import (
    PlanUpdate,
    PlaylistIn,
    PlaylistOut,
    SceneGroupCreate,
    SceneGroupOut,
    SceneGroupUpdate,
    TonightAction,
    TonightOut,
)
from app.services import tonight as service
from app.services.playlists import clean_steps

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
    # Playlists lose the group's steps; one left with none is deleted too.
    playlists = (await session.execute(
        select(MappingPlaylist).where(MappingPlaylist.show_id == show_id))).scalars().all()
    for playlist in playlists:
        steps = [s for s in playlist.steps or [] if s.get("group_id") != group.id]
        if len(steps) != len(playlist.steps or []):
            if steps:
                playlist.steps = steps
            else:
                await session.delete(playlist)
    await session.delete(group)
    await session.commit()
    _groups_changed(show_id)
    _playlists_changed(show_id)
    service.changed()


@router.post("/mapping/scene-groups/{group_id}/use", response_model=TonightOut,
             dependencies=[Depends(command_rate_limit)])
async def use_group(group_id: int, session: SessionDep, user: RequireOperator) -> TonightOut:
    """Play this group tonight, and on every projector now."""
    group = await _load_group(session, group_id)
    plan = await service.load_plan(session)
    plan.show_id = group.show_id
    plan.group_id = group.id
    plan.playlist_id = None
    cues = await service.apply_group(session, group)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="scene_group_used",
                      message=f"{user.username} picked {group.name} for tonight "
                              f"({cues} cue{'s' if cues != 1 else ''} changed)"))
    await session.commit()
    bus.publish("mapping_show", {"show_id": group.show_id})
    service.changed()
    return await _tonight(session)


# -- playlists ---------------------------------------------------------------------


def _playlists_changed(show_id: int) -> None:
    bus.publish("playlists", {"show_id": show_id})


async def _load_playlist(session, playlist_id: int) -> MappingPlaylist:
    playlist = await session.get(MappingPlaylist, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Playlist {playlist_id} not found")
    return playlist


async def _checked_playlist(session, payload: PlaylistIn, show_id: int | None,
                            besides: int | None = None) -> dict:
    """The playlist's fields, once its groups and times make sense."""
    groups = {g.id: g for g in (await session.execute(
        select(MappingSceneGroup).where(
            MappingSceneGroup.id.in_([s.group_id for s in payload.steps])))).scalars()}
    for step in payload.steps:
        group = groups.get(step.group_id)
        if group is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Unknown scene group {step.group_id}")
        if show_id is None:
            show_id = group.show_id
        if group.show_id != show_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"{group.name} belongs to another show")
    times = [s.at for s in payload.steps]
    if len(set(times)) != len(times):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Two steps start at the same time. Give each its own time.")
    await _load_show(session, show_id)
    query = select(MappingPlaylist.id).where(MappingPlaylist.show_id == show_id,
                                             MappingPlaylist.name == payload.name)
    if besides is not None:
        query = query.where(MappingPlaylist.id != besides)
    if (await session.execute(query)).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"There is already a playlist called {payload.name!r}")
    return {"show_id": show_id, "name": payload.name,
            "steps": clean_steps([s.model_dump() for s in payload.steps])}


@router.get("/mapping/playlists", response_model=list[PlaylistOut])
async def list_playlists(session: SessionDep, _: RequireViewer,
                         show_id: int | None = Query(default=None)) -> list[MappingPlaylist]:
    query = select(MappingPlaylist).order_by(MappingPlaylist.show_id,
                                             MappingPlaylist.position, MappingPlaylist.id)
    if show_id is not None:
        query = query.where(MappingPlaylist.show_id == show_id)
    return list((await session.execute(query)).scalars().all())


@router.post("/mapping/playlists", response_model=PlaylistOut,
             status_code=status.HTTP_201_CREATED, dependencies=[Depends(write_rate_limit)])
async def create_playlist(payload: PlaylistIn, session: SessionDep,
                          admin: RequireAdmin) -> MappingPlaylist:
    fields = await _checked_playlist(session, payload, payload.show_id)
    count = (await session.execute(
        select(func.count()).where(MappingPlaylist.show_id == fields["show_id"])
    )).scalar() or 0
    playlist = MappingPlaylist(position=count, **fields)
    session.add(playlist)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="playlist_created",
                      message=f"{admin.username} made the playlist {playlist.name}"))
    await session.commit()
    await session.refresh(playlist)
    _playlists_changed(playlist.show_id)
    service.changed()
    return playlist


@router.put("/mapping/playlists/{playlist_id}", response_model=PlaylistOut,
            dependencies=[Depends(write_rate_limit)])
async def update_playlist(playlist_id: int, payload: PlaylistIn, session: SessionDep,
                          _: RequireAdmin) -> MappingPlaylist:
    playlist = await _load_playlist(session, playlist_id)
    fields = await _checked_playlist(session, payload, playlist.show_id, besides=playlist.id)
    playlist.name = fields["name"]
    playlist.steps = fields["steps"]
    await session.commit()
    await session.refresh(playlist)
    _playlists_changed(playlist.show_id)
    # A playlist playing now moves to its new step within a scheduler tick.
    service.changed()
    return playlist


@router.delete("/mapping/playlists/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT,
               response_model=None, dependencies=[Depends(write_rate_limit)])
async def delete_playlist(playlist_id: int, session: SessionDep, admin: RequireAdmin) -> None:
    playlist = await _load_playlist(session, playlist_id)
    show_id = playlist.show_id
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="playlist_deleted",
                      message=f"{admin.username} deleted the playlist {playlist.name}"))
    await session.delete(playlist)
    await session.commit()
    _playlists_changed(show_id)
    service.changed()


@router.post("/mapping/playlists/{playlist_id}/use", response_model=TonightOut,
             dependencies=[Depends(command_rate_limit)])
async def use_playlist(playlist_id: int, session: SessionDep,
                       user: RequireOperator) -> TonightOut:
    """Play this playlist at the weekly show time, starting with the step due now."""
    playlist = await _load_playlist(session, playlist_id)
    plan = await service.load_plan(session)
    plan.show_id = playlist.show_id
    plan.playlist_id = playlist.id
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="playlist_used",
                      message=f"{user.username} picked the playlist {playlist.name} for tonight"))
    await session.commit()
    await service.use_playlist_now(playlist.id)
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
            plan.playlist_id = None
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
