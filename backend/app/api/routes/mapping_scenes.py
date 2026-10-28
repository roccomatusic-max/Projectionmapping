"""Scenes: generated, people-reactive designs that cues play.

A scene is a list of layers (see ``SceneLayer``); the output windows draw
it. This module stores scenes, lets the scene builder send made-up people
to the projectors, turns a sentence into a scene when an Anthropic key is
set (services/scene_ai.py), traces the house's parts on a photo with the
same key (services/house_photo.py), and repaints a picture of the building when an
OpenAI key is set (services/house_paint.py, Beta).
"""

from __future__ import annotations

import base64
import binascii
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import RequireAdmin, RequireViewer, SessionDep, write_rate_limit
from app.api.routes.mapping import _load_show, media_root
from app.core.events import bus
from app.db.models import (
    Event,
    MappingCue,
    MappingScene,
    MappingSceneGroup,
    MediaAsset,
    Severity,
)
from app.schemas.mapping import (
    MAX_LAYERS,
    AiKey,
    AiStatus,
    CountdownColors,
    DescribeScene,
    HousePhoto,
    MediaOut,
    ObjectPin,
    PaintHouse,
    SceneCreate,
    SceneOut,
    SceneUpdate,
    SimulatedPeople,
    TracedHouse,
    TraceHousePhoto,
    WeatherNow,
)
from app.services import house_paint, house_photo, scene_ai, weather_board
from app.services.mapping import now_ms

router = APIRouter(prefix="/mapping", tags=["mapping"])


def _changed(scene_id: int, *, deleted: bool = False) -> None:
    bus.publish("mapping_scene", {"scene_id": scene_id, "deleted": deleted})


async def _load_scene(session, scene_id: int) -> MappingScene:
    scene = await session.get(MappingScene, scene_id)
    if scene is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Scene {scene_id} not found")
    return scene


async def _name_free(session, name: str, scene_id: int | None = None) -> None:
    query = select(MappingScene.id).where(MappingScene.name == name)
    if scene_id is not None:
        query = query.where(MappingScene.id != scene_id)
    if (await session.execute(query)).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"A scene named {name!r} already exists")


async def _unique_name(session, name: str) -> str:
    taken = set((await session.execute(select(MappingScene.name))).scalars().all())
    candidate, n = name, 2
    while candidate in taken:
        candidate = f"{name} {n}"
        n += 1
    return candidate


@router.get("/scenes", response_model=list[SceneOut])
async def list_scenes(session: SessionDep, _: RequireViewer) -> list[MappingScene]:
    return list((await session.execute(
        select(MappingScene).order_by(MappingScene.name)
    )).scalars().all())


@router.post("/scenes", response_model=SceneOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(write_rate_limit)])
async def create_scene(payload: SceneCreate, session: SessionDep,
                       admin: RequireAdmin) -> MappingScene:
    await _name_free(session, payload.name)
    scene = MappingScene(**payload.model_dump(mode="json"))
    session.add(scene)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="scene_created",
                      message=f"{admin.username} created scene {payload.name}"))
    await session.commit()
    await session.refresh(scene)
    _changed(scene.id)
    return scene


@router.get("/scenes/{scene_id}", response_model=SceneOut)
async def get_scene(scene_id: int, session: SessionDep, _: RequireViewer) -> MappingScene:
    return await _load_scene(session, scene_id)


# Dragging a dial saves continuously, like dragging a corner, so this is not
# on the general write limit.
@router.patch("/scenes/{scene_id}", response_model=SceneOut)
async def update_scene(scene_id: int, payload: SceneUpdate, session: SessionDep,
                       _: RequireAdmin) -> MappingScene:
    scene = await _load_scene(session, scene_id)
    changes = payload.model_dump(mode="json", exclude_unset=True)
    if changes.get("name") is not None:
        await _name_free(session, changes["name"], scene_id)
    for field, value in changes.items():
        if value is not None:
            setattr(scene, field, value)
    await session.commit()
    await session.refresh(scene)
    _changed(scene.id)
    return scene


@router.delete("/scenes/{scene_id}", status_code=status.HTTP_204_NO_CONTENT,
               response_model=None, dependencies=[Depends(write_rate_limit)])
async def delete_scene(scene_id: int, session: SessionDep, admin: RequireAdmin) -> None:
    scene = await _load_scene(session, scene_id)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="scene_deleted",
                      message=f"{admin.username} deleted scene {scene.name}"))
    # Projectors that played it play no scene, as cues that used it do.
    cues = (await session.execute(select(MappingCue))).scalars().all()
    groups = (await session.execute(select(MappingSceneGroup))).scalars().all()
    for item in [*cues, *groups]:
        if scene_id in (item.output_scenes or {}).values():
            item.output_scenes = {output: (None if used == scene_id else used)
                                  for output, used in item.output_scenes.items()}
    await session.delete(scene)
    await session.commit()
    _changed(scene_id, deleted=True)


# -- made-up people ----------------------------------------------------------------


@router.post("/simulated-people", status_code=status.HTTP_204_NO_CONTENT,
             response_model=None)
async def simulated_people(payload: SimulatedPeople, _: RequireAdmin) -> None:
    """Relay the scene builder's made-up people as if a camera saw them.

    Camera id 0 marks them as simulated; positions are already canvas
    fractions. Nothing is stored.
    """
    people = [{"id": p.id, "cx": p.x, "cy": p.y, "x": p.x, "y": p.y, "z": p.z, "size": p.size}
              for p in payload.people]
    bus.publish("mapping_people", {"camera_id": 0, "show_id": payload.show_id,
                                   "people": people, "at": now_ms(), "simulated": True})


# -- describing a scene in words ----------------------------------------------------------


@router.get("/ai", response_model=AiStatus)
async def ai_status(_: RequireViewer) -> AiStatus:
    key, source = scene_ai.stored_key()
    return AiStatus(available=key is not None, key_hint=key[-4:] if key else None,
                    source=source)


@router.put("/ai/key", response_model=AiStatus, dependencies=[Depends(write_rate_limit)])
async def set_ai_key(payload: AiKey, admin: RequireAdmin, session: SessionDep) -> AiStatus:
    key = payload.key.strip()
    try:
        await scene_ai.check_key(key)
    except scene_ai.SceneAiError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None
    scene_ai.save_key(key)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="ai_key_set",
                      message=f"{admin.username} set the Anthropic API key"))
    await session.commit()
    return await ai_status(admin)


@router.delete("/ai/key", response_model=AiStatus, dependencies=[Depends(write_rate_limit)])
async def delete_ai_key(admin: RequireAdmin, session: SessionDep) -> AiStatus:
    scene_ai.forget_key()
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="ai_key_removed",
                      message=f"{admin.username} removed the Anthropic API key"))
    await session.commit()
    return await ai_status(admin)


def _keep_placed(layers: list, placed: list[tuple[str, str, list | None, dict | None]]) -> None:
    """Give things placed by hand, and a countdown's own part colours, back
    to the changed scene: first to a layer of the same type and style, then
    to the remaining layers of that type in order (objects to objects, a
    countdown to a countdown)."""
    taken: set[int] = set()
    for match_style in (True, False):
        for item in list(placed):
            kind, style, pins, colors = item
            target = next((layer for layer in layers if layer.type == kind and id(layer) not in taken
                           and (layer.style == style or not match_style)), None)
            if target is not None:
                taken.add(id(target))
                if pins is not None:
                    target.pins = [ObjectPin.model_validate(pin) for pin in pins]
                if colors:
                    target.colors = CountdownColors.model_validate(colors)
                placed.remove(item)


@router.post("/scenes/describe", response_model=SceneOut,
             dependencies=[Depends(write_rate_limit)])
async def describe_scene(payload: DescribeScene, session: SessionDep,
                         admin: RequireAdmin) -> MappingScene:
    """Make a scene from a sentence, or change ``scene_id`` as described."""
    surfaces = []
    if payload.show_id is not None:
        surfaces = (await _load_show(session, payload.show_id)).surfaces or []
    current = None
    scene = None
    pictures: list[dict] = []
    placed: list[tuple[str, str, list | None, dict | None]] = []
    if payload.scene_id is not None:
        scene = await _load_scene(session, payload.scene_id)
        current = SceneOut.model_validate(scene).model_dump(
            mode="json", include={"name", "description", "layers"})
        # Claude cannot make pictures; they stay at the bottom, untouched.
        pictures = [layer for layer in current["layers"] if layer["type"] == "picture"]
        current["layers"] = [layer for layer in current["layers"] if layer["type"] != "picture"]
        # Claude does not see where objects were placed by hand, nor a
        # countdown's own part colours; they are put back on the new layers
        # afterwards.
        for layer in current["layers"]:
            pins = layer.pop("pins", None)
            colors = layer.pop("colors", None)
            if pins is not None or colors:
                placed.append((layer["type"], layer["style"], pins, colors))
    try:
        result = await scene_ai.describe(payload.prompt, surfaces=surfaces, current=current)
    except scene_ai.SceneAiError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from None
    _keep_placed(result["layers"], placed)
    layers = pictures + [layer.model_dump(mode="json") for layer in result["layers"]]
    layers = layers[:MAX_LAYERS]
    if scene is not None:
        scene.layers = layers
        scene.description = result["description"] or scene.description
    else:
        scene = MappingScene(name=await _unique_name(session, result["name"]),
                             description=result["description"], layers=layers)
        session.add(scene)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="scene_described",
                      message=f"{admin.username} described a scene: {payload.prompt[:200]}"))
    await session.commit()
    await session.refresh(scene)
    _changed(scene.id)
    return scene


# -- live info boards ------------------------------------------------------------------


@router.get("/weather", response_model=WeatherNow)
async def weather(_: RequireViewer, place: str = Query("", max_length=80)) -> dict:
    """The weather right now for a scene's "Weather" board; the outputs ask
    the server so only it needs the internet."""
    try:
        return await weather_board.weather_now(place)
    except weather_board.WeatherError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from None


# -- painting the house (Beta) -------------------------------------------------------


@router.get("/paint", response_model=AiStatus)
async def paint_status(_: RequireViewer) -> AiStatus:
    key, source = house_paint.KEYS.stored()
    return AiStatus(available=key is not None, key_hint=key[-4:] if key else None,
                    source=source)


@router.put("/paint/key", response_model=AiStatus, dependencies=[Depends(write_rate_limit)])
async def set_paint_key(payload: AiKey, admin: RequireAdmin, session: SessionDep) -> AiStatus:
    key = payload.key.strip()
    try:
        await house_paint.check_key(key)
    except house_paint.PaintError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None
    house_paint.KEYS.save(key)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="ai_key_set",
                      message=f"{admin.username} set the OpenAI API key"))
    await session.commit()
    return await paint_status(admin)


@router.delete("/paint/key", response_model=AiStatus, dependencies=[Depends(write_rate_limit)])
async def delete_paint_key(admin: RequireAdmin, session: SessionDep) -> AiStatus:
    house_paint.KEYS.forget()
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="ai_key_removed",
                      message=f"{admin.username} removed the OpenAI API key"))
    await session.commit()
    return await paint_status(admin)


@router.post("/paint", response_model=MediaOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(write_rate_limit)])
async def paint_house(payload: PaintHouse, session: SessionDep, admin: RequireAdmin) -> MediaAsset:
    """Repaint the picture as described and add the result to the media library."""
    show = await _load_show(session, payload.show_id)
    data = payload.image.split(",", 1)[1] if payload.image.startswith("data:") else payload.image
    try:
        image = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="The picture could not be read") from None
    size = house_paint.size_for(show.canvas_width, show.canvas_height)
    try:
        painted = await house_paint.paint(image, payload.prompt, size)
    except house_paint.PaintError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from None
    stored_name = f"{uuid.uuid4().hex}.png"
    (media_root() / stored_name).write_bytes(painted)
    title = " ".join(payload.prompt.split())[:80]
    asset = MediaAsset(
        name=f"Painted: {title}.png", stored_name=stored_name, kind="image",
        content_type="image/png", size_bytes=len(painted), width=size[0], height=size[1],
    )
    session.add(asset)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="house_painted",
                      message=f"{admin.username} painted the house: {payload.prompt[:200]}"))
    await session.commit()
    await session.refresh(asset)
    return asset


# -- the house's parts from a photo ---------------------------------------------------


@router.post("/house-photo/trace", response_model=TracedHouse,
             dependencies=[Depends(write_rate_limit)])
async def trace_house_photo(payload: TraceHousePhoto, admin: RequireAdmin,
                            session: SessionDep) -> dict:
    """Claude's outline of each wall, roof, window and door on the photo, in
    fractions of the photo. Nothing is saved: the browser lines the photo up
    with the canvas and saves the parts as the show's house parts."""
    data = payload.image.split(",", 1)[1] if payload.image.startswith("data:") else payload.image
    try:
        image = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="The photo could not be read") from None
    try:
        result = await house_photo.trace(image, payload.width, payload.height)
    except scene_ai.SceneAiError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from None
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="house_traced",
                      message=f"{admin.username} had Claude trace {len(result['parts'])} "
                              "house parts on a photo"))
    await session.commit()
    return result


@router.get("/shows/{show_id}/house-photo", response_model=HousePhoto | None)
async def get_house_photo(show_id: int, session: SessionDep, _: RequireViewer) -> dict | None:
    await _load_show(session, show_id)
    saved = house_photo.load(show_id)
    if not saved:
        return None
    try:
        photo = HousePhoto.model_validate(saved)
    except ValueError:
        return None
    # The photo was deleted from the media library: start again.
    if await session.get(MediaAsset, photo.media_id) is None:
        return None
    return photo.model_dump()


# Dragging a corner saves continuously, like dragging a corner pin.
@router.put("/shows/{show_id}/house-photo", response_model=HousePhoto)
async def set_house_photo(show_id: int, payload: HousePhoto, session: SessionDep,
                          _: RequireAdmin) -> dict:
    await _load_show(session, show_id)
    asset = await session.get(MediaAsset, payload.media_id)
    if asset is None or asset.kind != "image":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="The photo is not a picture in the media library")
    house_photo.save(show_id, payload.model_dump())
    return payload.model_dump()


@router.delete("/shows/{show_id}/house-photo", status_code=status.HTTP_204_NO_CONTENT,
               response_model=None)
async def delete_house_photo(show_id: int, session: SessionDep, _: RequireAdmin) -> None:
    await _load_show(session, show_id)
    house_photo.forget(show_id)
