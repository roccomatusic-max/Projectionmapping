"""Mapping media: library, shows, outputs, cues and the show transport."""

from __future__ import annotations

import contextlib
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import (
    RequireAdmin,
    RequireOperator,
    RequireViewer,
    SessionDep,
    command_rate_limit,
    write_rate_limit,
)
from app.config import settings
from app.core.events import bus
from app.core.security import decode_access_token, token_predates
from app.db.models import (
    Event,
    MappingCue,
    MappingOutput,
    MappingScene,
    MappingShow,
    MediaAsset,
    Projector,
    Role,
    Severity,
    User,
)
from app.schemas.mapping import (
    CueCreate,
    CueOrder,
    CueOut,
    CueUpdate,
    MediaOut,
    MediaUpdate,
    OutputCreate,
    OutputOut,
    OutputUpdate,
    ShowCreate,
    ShowOut,
    ShowSummary,
    ShowUpdate,
    TransportCommand,
    TransportState,
)
from app.services import canvas_layout
from app.services.calibration import calibration_summary
from app.services.mapping import TransportError, now_ms, transport

log = logging.getLogger(__name__)
router = APIRouter(prefix="/mapping", tags=["mapping"])

#: Extensions the output renderer can play, with the type served for each.
#: ProRes and HAP are absent on purpose: browsers do not decode them, and
#: accepting a file that will render black is worse than refusing it.
MEDIA_TYPES: dict[str, tuple[str, str]] = {
    ".mp4": ("video", "video/mp4"),
    ".m4v": ("video", "video/mp4"),
    ".mov": ("video", "video/quicktime"),
    ".webm": ("video", "video/webm"),
    ".png": ("image", "image/png"),
    ".jpg": ("image", "image/jpeg"),
    ".jpeg": ("image", "image/jpeg"),
    ".webp": ("image", "image/webp"),
}

CHUNK = 1024 * 1024


def media_root() -> Path:
    root = Path(settings.media_dir).expanduser()
    root.mkdir(parents=True, exist_ok=True)
    return root


# -- media library ---------------------------------------------------------------


@router.get("/media", response_model=list[MediaOut])
async def list_media(session: SessionDep, _: RequireViewer) -> list[MediaAsset]:
    return list((await session.execute(
        select(MediaAsset).order_by(MediaAsset.created_at.desc())
    )).scalars().all())


@router.post("/media", response_model=MediaOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(write_rate_limit)])
async def upload_media(
    request: Request,
    session: SessionDep,
    admin: RequireAdmin,
    name: Annotated[str, Query(min_length=1, max_length=255)],
    width: Annotated[int | None, Query(ge=1, le=32768)] = None,
    height: Annotated[int | None, Query(ge=1, le=32768)] = None,
    duration: Annotated[float | None, Query(ge=0)] = None,
) -> MediaAsset:
    """Upload one file as the raw request body.

    Raw rather than multipart so a multi-gigabyte show file streams straight
    into the media folder instead of being spooled to a temporary file and
    copied. ``name`` is the original file name; its extension decides the
    type. The browser probes dimensions and duration before uploading.
    """
    extension = Path(name).suffix.lower()
    if extension not in MEDIA_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(f"{extension or 'no extension'} is not a playable format; use "
                    f"{', '.join(sorted(MEDIA_TYPES))}. Transcode ProRes or HAP to "
                    f"H.264 or HEVC first."),
        )
    limit = settings.media_max_upload_mb * 1024 * 1024
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail=f"Upload exceeds {settings.media_max_upload_mb} MB")

    kind, content_type = MEDIA_TYPES[extension]
    stored_name = f"{uuid.uuid4().hex}{extension}"
    root = media_root()
    partial = root / f".{stored_name}.part"
    written = 0
    try:
        with partial.open("wb") as handle:
            async for chunk in request.stream():
                written += len(chunk)
                if written > limit:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"Upload exceeds {settings.media_max_upload_mb} MB",
                    )
                handle.write(chunk)
        if written == 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="The upload was empty")
        os.replace(partial, root / stored_name)
    finally:
        with contextlib.suppress(FileNotFoundError):
            partial.unlink()

    asset = MediaAsset(
        name=Path(name).name, stored_name=stored_name, kind=kind,
        content_type=content_type, size_bytes=written,
        width=width, height=height, duration=duration if kind == "video" else None,
    )
    session.add(asset)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="media_uploaded",
                      message=f"{admin.username} uploaded {asset.name}"))
    await session.commit()
    await session.refresh(asset)
    return asset


async def _media_user(session, token: str | None, request: Request) -> User:
    """Authenticate the media file request.

    A ``<video>`` element cannot send an Authorization header, so the token
    may also arrive as a query parameter, as it does for the WebSocket.
    """
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        token = header[7:]
    payload = decode_access_token(token) if token else None
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Not authenticated")
    user = (await session.execute(
        select(User).where(User.username == payload["sub"])
    )).scalars().first()
    try:
        allowed = (user is not None and user.is_active
                   and not token_predates(payload, user.created_at)
                   and Role(user.role).at_least(Role.VIEWER))
    except ValueError:
        allowed = False
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Not allowed to read media")
    return user


@router.get("/media/{media_id}/file", include_in_schema=True)
async def media_file(media_id: int, request: Request, session: SessionDep,
                     token: str | None = Query(default=None)) -> FileResponse:
    """Serve the file with byte-range support, which video seeking needs."""
    await _media_user(session, token, request)
    asset = await session.get(MediaAsset, media_id)
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    path = media_root() / asset.stored_name
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_410_GONE,
                            detail=f"The file for {asset.name!r} is missing from the media folder")
    return FileResponse(path, media_type=asset.content_type,
                        headers={"Cache-Control": "private, max-age=86400"})


@router.patch("/media/{media_id}", response_model=MediaOut,
              dependencies=[Depends(write_rate_limit)])
async def update_media(media_id: int, payload: MediaUpdate, session: SessionDep,
                       _: RequireAdmin) -> MediaAsset:
    asset = await session.get(MediaAsset, media_id)
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(asset, field, value)
    await session.commit()
    await session.refresh(asset)
    return asset


@router.delete("/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT,
               response_model=None, dependencies=[Depends(write_rate_limit)])
async def delete_media(media_id: int, session: SessionDep, admin: RequireAdmin) -> None:
    asset = await session.get(MediaAsset, media_id)
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    live = transport.snapshot()
    if live.status in ("playing", "paused") and any(
        cue is not None and cue.media_id == media_id for cue in (live.current, live.previous)
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"{asset.name!r} is on air; stop the show first")
    stored = asset.stored_name
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="media_deleted",
                      message=f"{admin.username} deleted {asset.name}"))
    await session.delete(asset)
    await session.commit()
    with contextlib.suppress(FileNotFoundError):
        (media_root() / stored).unlink()


# -- shows ---------------------------------------------------------------------


async def _load_show(session, show_id: int) -> MappingShow:
    show = (await session.execute(
        select(MappingShow).where(MappingShow.id == show_id)
        .options(selectinload(MappingShow.outputs), selectinload(MappingShow.cues))
        .execution_options(populate_existing=True)
    )).scalars().first()
    if show is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Show {show_id} not found")
    return show


def _output_out(output: MappingOutput) -> OutputOut:
    return OutputOut(
        id=output.id, show_id=output.show_id, position=output.position, name=output.name,
        projector_id=output.projector_id, width=output.width, height=output.height,
        source=output.source or {}, warp=output.warp or {}, masks=output.masks or [],
        blend=output.blend or {}, color=output.color or {},
        test_pattern=output.test_pattern, enabled=output.enabled,
        calibration=calibration_summary(output.calibration),
    )


def _show_out(show: MappingShow) -> ShowOut:
    return ShowOut(
        id=show.id, name=show.name, description=show.description,
        canvas_width=show.canvas_width, canvas_height=show.canvas_height,
        output_count=len(show.outputs), cue_count=len(show.cues), updated_at=show.updated_at,
        camera_view=show.camera_view or None,
        surfaces=show.surfaces or [],
        outputs=[_output_out(o) for o in show.outputs],
        cues=[CueOut.model_validate(c) for c in show.cues],
    )


def _touch(show_id: int, *, kind: str = "mapping_show", payload: dict | None = None) -> None:
    bus.publish(kind, {"show_id": show_id, **(payload or {})})


@router.get("/shows", response_model=list[ShowSummary])
async def list_shows(session: SessionDep, _: RequireViewer) -> list[ShowSummary]:
    outputs = (select(MappingOutput.show_id, func.count().label("n"))
               .group_by(MappingOutput.show_id).subquery())
    cues = (select(MappingCue.show_id, func.count().label("n"))
            .group_by(MappingCue.show_id).subquery())
    rows = (await session.execute(
        select(MappingShow, outputs.c.n, cues.c.n)
        .outerjoin(outputs, outputs.c.show_id == MappingShow.id)
        .outerjoin(cues, cues.c.show_id == MappingShow.id)
        .order_by(MappingShow.name)
    )).all()
    return [
        ShowSummary(id=show.id, name=show.name, description=show.description,
                    canvas_width=show.canvas_width, canvas_height=show.canvas_height,
                    output_count=n_out or 0, cue_count=n_cue or 0, updated_at=show.updated_at)
        for show, n_out, n_cue in rows
    ]


@router.post("/shows", response_model=ShowOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(write_rate_limit)])
async def create_show(payload: ShowCreate, session: SessionDep, admin: RequireAdmin) -> ShowOut:
    if (await session.execute(
        select(MappingShow.id).where(MappingShow.name == payload.name)
    )).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"A show named {payload.name!r} already exists")
    show = MappingShow(**payload.model_dump())
    session.add(show)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="show_created",
                      message=f"{admin.username} created show {payload.name}"))
    await session.commit()
    return _show_out(await _load_show(session, show.id))


@router.get("/shows/{show_id}", response_model=ShowOut)
async def get_show(show_id: int, session: SessionDep, _: RequireViewer) -> ShowOut:
    return _show_out(await _load_show(session, show_id))


@router.patch("/shows/{show_id}", response_model=ShowOut,
              dependencies=[Depends(write_rate_limit)])
async def update_show(show_id: int, payload: ShowUpdate, session: SessionDep,
                      _: RequireAdmin) -> ShowOut:
    show = await _load_show(session, show_id)
    changes = payload.model_dump(mode="json", exclude_unset=True)
    if "camera_view" in changes:
        changes["camera_view"] = changes["camera_view"] or {}
    if "surfaces" in changes:
        changes["surfaces"] = changes["surfaces"] or []
    if "name" in changes and changes["name"] != show.name and (await session.execute(
        select(MappingShow.id).where(MappingShow.name == changes["name"])
    )).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"A show named {changes['name']!r} already exists")
    for field, value in changes.items():
        setattr(show, field, value)
    await session.commit()
    _touch(show_id)
    return _show_out(await _load_show(session, show_id))


@router.delete("/shows/{show_id}", status_code=status.HTTP_204_NO_CONTENT,
               response_model=None, dependencies=[Depends(write_rate_limit)])
async def delete_show(show_id: int, session: SessionDep, admin: RequireAdmin) -> None:
    show = await _load_show(session, show_id)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="show_deleted",
                      message=f"{admin.username} deleted show {show.name}"))
    await session.delete(show)
    await session.commit()
    await transport.show_deleted(show_id)
    _touch(show_id, payload={"deleted": True})


# -- outputs -------------------------------------------------------------------


async def _check_projector(session, projector_id: int | None) -> None:
    if projector_id is not None and await session.get(Projector, projector_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Unknown projector id {projector_id}")


@router.post("/shows/{show_id}/outputs", response_model=OutputOut,
             status_code=status.HTTP_201_CREATED, dependencies=[Depends(write_rate_limit)])
async def create_output(show_id: int, payload: OutputCreate, session: SessionDep,
                        _: RequireAdmin) -> OutputOut:
    show = await _load_show(session, show_id)
    await _check_projector(session, payload.projector_id)
    fields = payload.model_dump(mode="json")
    if "source" not in payload.model_fields_set:
        existing = list(show.outputs)
        if canvas_layout.is_automatic([o.source or {} for o in existing]):
            # Keep every output in its own slice: re-split the canvas.
            layout = canvas_layout.even_split(len(existing) + 1)
            for item, rect in zip(existing, layout, strict=False):
                item.source = rect
            fields["source"] = layout[-1]
    output = MappingOutput(show_id=show.id, position=len(show.outputs), **fields)
    session.add(output)
    await session.commit()
    await session.refresh(output)
    _touch(show_id)
    return _output_out(output)


async def _load_output(session, output_id: int) -> MappingOutput:
    output = await session.get(MappingOutput, output_id)
    if output is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Output {output_id} not found")
    return output


# Alignment drags save continuously, so this one is not on the general
# write limit: 120 a minute would throttle an operator nudging a corner.
@router.patch("/outputs/{output_id}", response_model=OutputOut)
async def update_output(output_id: int, payload: OutputUpdate, session: SessionDep,
                        _: RequireAdmin) -> OutputOut:
    output = await _load_output(session, output_id)
    changes = payload.model_dump(mode="json", exclude_unset=True)
    if "projector_id" in changes:
        await _check_projector(session, changes["projector_id"])
    for field, value in changes.items():
        setattr(output, field, value)
    await session.commit()
    await session.refresh(output)
    out = _output_out(output)
    _touch(output.show_id, kind="mapping_output", payload={"output": out.model_dump(mode="json")})
    return out


@router.delete("/outputs/{output_id}", status_code=status.HTTP_204_NO_CONTENT,
               response_model=None, dependencies=[Depends(write_rate_limit)])
async def delete_output(output_id: int, session: SessionDep, _: RequireAdmin) -> None:
    output = await _load_output(session, output_id)
    show_id = output.show_id
    await session.delete(output)
    await session.flush()
    remaining = (await session.execute(
        select(MappingOutput).where(MappingOutput.show_id == show_id)
        .order_by(MappingOutput.position)
    )).scalars().all()
    for index, item in enumerate(remaining):
        item.position = index
    await session.commit()
    _touch(show_id)


@router.post("/outputs/{output_id}/identify", status_code=status.HTTP_204_NO_CONTENT,
             response_model=None)
async def identify_output(output_id: int, session: SessionDep, _: RequireAdmin) -> None:
    """Flash the output's name on every window and player showing it."""
    await _load_output(session, output_id)
    bus.publish("mapping_identify", {"output_id": output_id})


# -- cues ----------------------------------------------------------------------


async def _check_media(session, media_id: int | None) -> None:
    if media_id is not None and await session.get(MediaAsset, media_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Unknown media id {media_id}")


async def _check_scene(session, scene_id: int | None) -> None:
    if scene_id is not None and await session.get(MappingScene, scene_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Unknown scene id {scene_id}")


async def _check_output_scenes(session, show_id: int, output_scenes: dict | None) -> dict:
    """Per-projector scenes, keyed by this show's outputs and naming real scenes."""
    if not output_scenes:
        return {}
    outputs = set((await session.execute(
        select(MappingOutput.id).where(MappingOutput.show_id == show_id)
    )).scalars().all())
    for output_id, scene_id in output_scenes.items():
        if output_id not in outputs:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Output {output_id} is not part of this show")
        await _check_scene(session, scene_id)
    # JSON object keys are strings; keep them that way so reads match writes.
    return {str(output_id): scene_id for output_id, scene_id in output_scenes.items()}


async def _renumber_cues(session, show_id: int, order: list[int] | None = None) -> None:
    cues = (await session.execute(
        select(MappingCue).where(MappingCue.show_id == show_id).order_by(MappingCue.position)
    )).scalars().all()
    if order is not None:
        by_id = {cue.id: cue for cue in cues}
        cues = [by_id[cue_id] for cue_id in order]
    for index, cue in enumerate(cues):
        cue.position = index


@router.post("/shows/{show_id}/cues", response_model=CueOut,
             status_code=status.HTTP_201_CREATED, dependencies=[Depends(write_rate_limit)])
async def create_cue(show_id: int, payload: CueCreate, session: SessionDep,
                     _: RequireAdmin) -> MappingCue:
    show = await _load_show(session, show_id)
    await _check_media(session, payload.media_id)
    await _check_scene(session, payload.scene_id)
    fields = payload.model_dump()
    fields["output_scenes"] = await _check_output_scenes(session, show.id, payload.output_scenes)
    cue = MappingCue(show_id=show.id, position=len(show.cues), **fields)
    session.add(cue)
    await session.commit()
    await session.refresh(cue)
    _touch(show_id)
    return cue


@router.patch("/cues/{cue_id}", response_model=CueOut,
              dependencies=[Depends(write_rate_limit)])
async def update_cue(cue_id: int, payload: CueUpdate, session: SessionDep,
                     _: RequireAdmin) -> MappingCue:
    cue = await session.get(MappingCue, cue_id)
    if cue is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Cue {cue_id} not found")
    changes = payload.model_dump(exclude_unset=True)
    if "media_id" in changes:
        await _check_media(session, changes["media_id"])
    if "scene_id" in changes:
        await _check_scene(session, changes["scene_id"])
    if "output_scenes" in changes:
        changes["output_scenes"] = await _check_output_scenes(
            session, cue.show_id, changes["output_scenes"])
    for field, value in changes.items():
        setattr(cue, field, value)
    await session.commit()
    await session.refresh(cue)
    _touch(cue.show_id)
    return cue


@router.delete("/cues/{cue_id}", status_code=status.HTTP_204_NO_CONTENT,
               response_model=None, dependencies=[Depends(write_rate_limit)])
async def delete_cue(cue_id: int, session: SessionDep, _: RequireAdmin) -> None:
    cue = await session.get(MappingCue, cue_id)
    if cue is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Cue {cue_id} not found")
    show_id = cue.show_id
    await session.delete(cue)
    await session.flush()
    await _renumber_cues(session, show_id)
    await session.commit()
    _touch(show_id)


@router.put("/shows/{show_id}/cue-order", response_model=list[CueOut],
            dependencies=[Depends(write_rate_limit)])
async def reorder_cues(show_id: int, payload: CueOrder, session: SessionDep,
                       _: RequireAdmin) -> list[MappingCue]:
    show = await _load_show(session, show_id)
    existing = {cue.id for cue in show.cues}
    if sorted(payload.cue_ids) != sorted(existing) or len(set(payload.cue_ids)) != len(existing):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="cue_ids must list every cue of the show exactly once")
    await _renumber_cues(session, show_id, payload.cue_ids)
    await session.commit()
    _touch(show_id)
    return list((await _load_show(session, show_id)).cues)


# -- transport -------------------------------------------------------------------


@router.get("/transport", response_model=TransportState)
async def get_transport(_: RequireViewer) -> TransportState:
    return transport.snapshot()


@router.post("/transport", response_model=TransportState,
             dependencies=[Depends(command_rate_limit)])
async def command_transport(payload: TransportCommand, session: SessionDep,
                            user: RequireOperator) -> TransportState:
    try:
        state = await transport.command(payload.action, show_id=payload.show_id,
                                        cue=payload.cue)
    except TransportError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from None
    cue = f" cue {state.current.position + 1}" if state.current else ""
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="show_transport",
                      message=f"{user.username}: {payload.action}{cue}"))
    await session.commit()
    return state


@router.get("/clock")
async def clock(_: RequireViewer) -> dict:
    """Server time for the output windows' clock-offset estimate.

    ``monotonic`` lets a client discard a sample taken across a server
    clock step; ``now_ms`` is what transport timestamps are expressed in.
    """
    return {"now_ms": now_ms(), "monotonic": time.monotonic()}
