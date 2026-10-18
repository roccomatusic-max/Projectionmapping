"""Saved maps: keep a show's mapping by name and start other shows from it.

Lining a show up with a building (each projector's slice, corner pin,
mesh, masks, blends, the camera calibration and the traced house parts) is
the slow part. Saving it as a map and applying the map to a new show copies
all of that across in one step, so the new show only needs its cues.

A map can also be downloaded as a file and loaded on another computer.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.deps import RequireAdmin, RequireViewer, SessionDep, write_rate_limit
from app.api.routes.mapping import _load_show, _show_out, _touch
from app.core.events import bus
from app.db.models import (
    Event,
    MappingMap,
    MappingOutput,
    MappingPlayer,
    MappingShow,
    Projector,
    Severity,
)
from app.schemas.mapping import OutputBase
from app.schemas.mapping_maps import (
    ApplyMap,
    MapApplied,
    MapFile,
    MapOutput,
    MapSummary,
    MapUpdate,
    SaveMap,
)

router = APIRouter(prefix="/mapping", tags=["mapping"])

#: Output fields a map carries, besides calibration and players.
_GEOMETRY = ("name", "projector_id", "width", "height", "source", "warp", "masks",
             "blend", "color", "enabled")


def _summary(saved: MappingMap) -> MapSummary:
    outputs = saved.outputs or []
    return MapSummary(
        id=saved.id, name=saved.name, description=saved.description,
        canvas_width=saved.canvas_width, canvas_height=saved.canvas_height,
        output_count=len(outputs), surface_count=len(saved.surfaces or []),
        calibrated_count=sum(1 for o in outputs if o.get("calibration")),
        player_count=sum(len(o.get("player_ids") or []) for o in outputs),
        output_names=[o.get("name", "") for o in outputs],
        updated_at=saved.updated_at,
    )


async def _load_map(session, map_id: int) -> MappingMap:
    saved = await session.get(MappingMap, map_id)
    if saved is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Map {map_id} not found")
    return saved


async def _by_name(session, name: str) -> MappingMap | None:
    return (await session.execute(
        select(MappingMap).where(MappingMap.name == name)
    )).scalars().first()


async def _free_name(session, name: str) -> str:
    """``name``, or ``name (2)``, ``name (3)``… whichever is not taken yet."""
    candidate, n = name, 1
    while await _by_name(session, candidate) is not None:
        n += 1
        suffix = f" ({n})"
        candidate = name[:128 - len(suffix)] + suffix
    return candidate


async def _snapshot(session, show: MappingShow) -> dict:
    """The show's mapping, in the shape a map stores it."""
    players = (await session.execute(
        select(MappingPlayer.id, MappingPlayer.output_id).where(
            MappingPlayer.output_id.in_([o.id for o in show.outputs]),
            MappingPlayer.kind == "player",
        )
    )).all()
    outputs = []
    for output in show.outputs:
        # Through the output schema, so geometry saved before a default was
        # added still comes out complete.
        data = {field: getattr(output, field) for field in _GEOMETRY}
        data = {k: v for k, v in data.items() if v is not None and v != {}}
        geometry = OutputBase.model_validate(data).model_dump(mode="json",
                                                              exclude={"test_pattern"})
        outputs.append(geometry | {
            "calibration": output.calibration if (output.calibration or {}).get("camera_id")
            is not None else None,
            "player_ids": [pid for pid, oid in players if oid == output.id],
        })
    return {
        "canvas_width": show.canvas_width, "canvas_height": show.canvas_height,
        "camera_view": show.camera_view or {}, "surfaces": list(show.surfaces or []),
        "outputs": outputs,
    }


@router.get("/maps", response_model=list[MapSummary])
async def list_maps(session: SessionDep, _: RequireViewer) -> list[MapSummary]:
    saved = (await session.execute(select(MappingMap).order_by(MappingMap.name))).scalars()
    return [_summary(m) for m in saved]


@router.post("/shows/{show_id}/save-map", response_model=MapSummary,
             status_code=status.HTTP_201_CREATED, dependencies=[Depends(write_rate_limit)])
async def save_map(show_id: int, payload: SaveMap, session: SessionDep,
                   admin: RequireAdmin) -> MapSummary:
    show = await _load_show(session, show_id)
    if not show.outputs and not show.surfaces:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"{show.name} has no outputs or traced house parts to save yet")
    saved = await _by_name(session, payload.name)
    if saved is not None and not payload.replace:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"A map named {payload.name!r} already exists")
    snapshot = await _snapshot(session, show)
    if saved is None:
        saved = MappingMap(name=payload.name)
        session.add(saved)
    saved.description = payload.description
    for field, value in snapshot.items():
        setattr(saved, field, value)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="map_saved",
                      message=f"{admin.username} saved the map of {show.name} as {payload.name}"))
    await session.commit()
    await session.refresh(saved)
    bus.publish("mapping_map", {"map_id": saved.id})
    return _summary(saved)


@router.get("/maps/{map_id}", response_model=MapFile)
async def export_map(map_id: int, session: SessionDep, _: RequireViewer) -> MapFile:
    """The map as a file, to download and load on another computer."""
    saved = await _load_map(session, map_id)
    return MapFile(
        name=saved.name, description=saved.description,
        canvas_width=saved.canvas_width, canvas_height=saved.canvas_height,
        camera_view=saved.camera_view or None, surfaces=saved.surfaces or [],
        outputs=saved.outputs or [],
    )


@router.post("/maps", response_model=MapSummary, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(write_rate_limit)])
async def import_map(payload: MapFile, session: SessionDep, admin: RequireAdmin) -> MapSummary:
    """Load a downloaded map file. A clashing name gets a number added."""
    name = await _free_name(session, payload.name)
    data = payload.model_dump(mode="json", exclude={"format", "version", "name"})
    data["camera_view"] = data["camera_view"] or {}
    saved = MappingMap(name=name, **data)
    session.add(saved)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="map_saved",
                      message=f"{admin.username} loaded the map {name} from a file"))
    await session.commit()
    await session.refresh(saved)
    bus.publish("mapping_map", {"map_id": saved.id})
    return _summary(saved)


@router.patch("/maps/{map_id}", response_model=MapSummary,
              dependencies=[Depends(write_rate_limit)])
async def update_map(map_id: int, payload: MapUpdate, session: SessionDep,
                     _: RequireAdmin) -> MapSummary:
    saved = await _load_map(session, map_id)
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    if "name" in changes and changes["name"] != saved.name and \
            await _by_name(session, changes["name"]) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"A map named {changes['name']!r} already exists")
    for field, value in changes.items():
        setattr(saved, field, value)
    await session.commit()
    await session.refresh(saved)
    bus.publish("mapping_map", {"map_id": saved.id})
    return _summary(saved)


@router.delete("/maps/{map_id}", status_code=status.HTTP_204_NO_CONTENT,
               response_model=None, dependencies=[Depends(write_rate_limit)])
async def delete_map(map_id: int, session: SessionDep, admin: RequireAdmin) -> None:
    saved = await _load_map(session, map_id)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="map_deleted",
                      message=f"{admin.username} deleted the map {saved.name}"))
    await session.delete(saved)
    await session.commit()
    bus.publish("mapping_map", {"map_id": map_id, "deleted": True})


@router.post("/shows/{show_id}/apply-map", response_model=MapApplied,
             dependencies=[Depends(write_rate_limit)])
async def apply_map(show_id: int, payload: ApplyMap, session: SessionDep,
                    admin: RequireAdmin) -> MapApplied:
    """Copy a saved map into a show.

    The show takes the map's canvas size, since the outputs' slices and the
    traced parts are fractions of it. With ``outputs``, the show's outputs
    become the map's, in order: existing ones are updated in place (so
    their mini PCs stay with them), missing ones are added and extra ones
    removed. Cues and media are not touched.
    """
    show = await _load_show(session, show_id)
    saved = await _load_map(session, payload.map_id)
    if not payload.outputs and not payload.surfaces:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Choose the outputs, the traced house parts, or both")
    show.canvas_width, show.canvas_height = saved.canvas_width, saved.canvas_height
    if payload.surfaces:
        show.surfaces = list(saved.surfaces or [])

    targets: list[tuple[MappingOutput, MapOutput]] = []
    if payload.outputs:
        known = set((await session.execute(select(Projector.id))).scalars())
        existing = list(show.outputs)
        for index, raw in enumerate(saved.outputs or []):
            entry = MapOutput.model_validate(raw)
            fields = entry.model_dump(mode="json", include=set(_GEOMETRY))
            if fields["projector_id"] not in known:
                fields["projector_id"] = None
            fields["calibration"] = (entry.calibration.model_dump(mode="json")
                                     if entry.calibration else {})
            if index < len(existing):
                output = existing[index]
                for field, value in fields.items():
                    setattr(output, field, value)
                output.test_pattern = "none"
            else:
                output = MappingOutput(show_id=show.id, position=index, **fields)
                session.add(output)
            targets.append((output, entry))
        for extra in existing[len(targets):]:
            await session.delete(extra)
        show.camera_view = saved.camera_view or {}
        await session.flush()

    moved: list[int] = []
    if payload.outputs and payload.players:
        for output, entry in targets:
            for player_id in entry.player_ids:
                player = await session.get(MappingPlayer, player_id)
                if player is not None and player.kind == "player" and player.approved:
                    player.output_id = output.id
                    moved.append(player.id)

    parts = [label for label, wanted in (("outputs", payload.outputs),
                                         ("traced house parts", payload.surfaces)) if wanted]
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="map_applied",
                      message=f"{admin.username} applied the map {saved.name} to {show.name} "
                              f"({' and '.join(parts)})"))
    await session.commit()
    _touch(show_id)
    for player_id in moved:
        bus.publish("mapping_player", {"player_id": player_id})
    return MapApplied(show=_show_out(await _load_show(session, show_id)),
                       players_moved=len(moved))
