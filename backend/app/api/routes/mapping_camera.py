"""Cameras: calibration from projected patterns, and people tracking.

A camera is a small program (``camera-agent/``) on a computer with a camera
pointed at the building. It pairs exactly like a player, through
``/mapping/players/hello`` with ``kind: camera``, and gets a viewer account.
Everything a camera may do is gated on that account belonging to an
approved camera, not on its role.

Calibration of one output:

1. An administrator asks for it (``POST /outputs/{id}/calibrate``); the
   request reaches the camera over the WebSocket feed.
2. The camera steps through black, white and Gray-code stripes
   (``POST /calibration/step``). Each step is relayed to every output window
   of that show: the output being calibrated draws the pattern in its own
   pixels, the others go black so their light does not confuse the camera.
3. The camera uploads what it decoded (``PUT /outputs/{id}/calibration``).
4. ``POST /shows/{id}/fit-canvas`` places the canvas on the camera's photo
   inside the projectors' light (and, optionally, gives each output the
   slice of the canvas its light covers). The operator can then refine
   that by hand: drag the corners, or a grid of points, onto the building
   (the show's ``camera_view``).
5. ``POST /shows/{id}/apply-calibration`` turns the decoded maps and the
   canvas placement into corner pins and mesh warps.

Undoing it: when the camera first uploads a result for an output, the
output's slice and warp as they were (and the show's camera placement)
are kept with the calibration under ``before``.
``POST /shows/{id}/remove-calibration`` puts every calibrated output of the
show back to that, clears the calibration and the placement, and stops a
calibration still running: its next step or upload is refused, which ends
it on the camera, and the output windows go back to the show.
``DELETE /outputs/{id}/calibration`` does the same for one output.

People tracking: the camera posts the people it sees, in camera-image
fractions, several times a second (``POST /cameras/me/people``). The server
maps them onto the live show's canvas through the same ``camera_view`` and
relays them to the output windows, which use them in cues with an
interaction effect. Nothing of this is stored.
"""

from __future__ import annotations

import contextlib
import os
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.api.deps import CurrentUser, RequireAdmin, RequireViewer, SessionDep, write_rate_limit
from app.api.routes.mapping import _load_show, _media_user, _output_out, _touch, media_root
from app.api.routes.mapping_players import is_online
from app.core.events import bus
from app.db.models import Event, MappingOutput, MappingPlayer, MappingShow, Severity, User, utcnow
from app.db.session import SessionLocal
from app.schemas.mapping import (
    ApplyCalibration,
    ApplyResult,
    CalibrateRequest,
    CalibrationResult,
    CalibrationStep,
    CameraCommand,
    CameraView,
    FitCanvas,
    FitResult,
    OutputOut,
    PeopleReport,
    RemoveResult,
    Warp,
)
from app.services import canvas_layout
from app.services.calibration import (
    CalibrationError,
    apply,
    camera_to_canvas,
    fit_canvas,
    light_on_canvas,
    solve_warp,
)
from app.services.mapping import now_ms, transport

router = APIRouter(prefix="/mapping", tags=["mapping"])

SNAPSHOT_MAX = 16 * 1024 * 1024
SNAPSHOT_TYPES = {"image/jpeg": ".jpg", "image/png": ".png"}


async def _this_camera(session, user: User) -> MappingPlayer:
    camera = (await session.execute(
        select(MappingPlayer).where(MappingPlayer.user_id == user.id,
                                    MappingPlayer.kind == "camera",
                                    MappingPlayer.approved.is_(True))
    )).scalars().first()
    if camera is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Only a paired camera may do this")
    return camera


async def _load_camera(session, camera_id: int) -> MappingPlayer:
    camera = await session.get(MappingPlayer, camera_id)
    if camera is None or camera.kind != "camera":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Camera {camera_id} not found")
    return camera


async def _load_output(session, output_id: int) -> MappingOutput:
    output = await session.get(MappingOutput, output_id)
    if output is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Output {output_id} not found")
    return output


def _output_changed(output: MappingOutput) -> OutputOut:
    out = _output_out(output)
    bus.publish("mapping_output", {"show_id": output.show_id, "output": out.model_dump(mode="json")})
    return out


# -- calibration -----------------------------------------------------------------

#: Outputs whose calibration was removed while the camera may still be
#: running it. Their steps and results are refused until they are asked to
#: calibrate again. In memory: after a restart there is no run to stop.
_stopped: set[int] = set()


def _refuse_if_stopped(output: MappingOutput) -> None:
    if output.id in _stopped:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"The calibration of {output.name} was removed")


@router.post("/outputs/{output_id}/calibrate", status_code=status.HTTP_202_ACCEPTED,
             dependencies=[Depends(write_rate_limit)])
async def request_calibration(output_id: int, payload: CalibrateRequest, session: SessionDep,
                              admin: RequireAdmin) -> dict:
    if transport.snapshot().emergency is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="The emergency stop is on, so every output is black. "
                                   "Clear it first, then calibrate.")
    output = await _load_output(session, output_id)
    camera = await _load_camera(session, payload.camera_id)
    if not camera.approved:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"Approve camera {camera.name} first")
    if not is_online(camera):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"Camera {camera.name} is offline")
    _stopped.discard(output.id)
    bus.publish("mapping_calibrate", {
        "camera_id": camera.id, "output_id": output.id, "show_id": output.show_id,
        "name": output.name, "width": output.width, "height": output.height,
    })
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="calibration_requested",
                      message=f"{admin.username} asked camera {camera.name} to calibrate "
                              f"output {output.name}"))
    await session.commit()
    return {"status": "requested"}


@router.post("/calibration/step", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def calibration_step(payload: CalibrationStep, session: SessionDep,
                           user: CurrentUser) -> None:
    """Relay one pattern (or the end of the sequence) to the output windows."""
    camera = await _this_camera(session, user)
    output = await _load_output(session, payload.output_id)
    _refuse_if_stopped(output)
    bus.publish("mapping_calib_pattern", {
        "camera_id": camera.id, "show_id": output.show_id, "output_id": output.id,
        "pattern": payload.pattern.model_dump() if payload.pattern else None,
        "step": payload.step, "steps": payload.steps,
        "status": payload.status, "message": payload.message,
    })


@router.put("/outputs/{output_id}/calibration", response_model=OutputOut)
async def store_calibration(output_id: int, payload: CalibrationResult, session: SessionDep,
                            user: CurrentUser) -> OutputOut:
    camera = await _this_camera(session, user)
    output = await _load_output(session, output_id)
    _refuse_if_stopped(output)
    seen = sum(point is not None for point in payload.points)
    coverage = round(seen / len(payload.points), 4)
    before = (output.calibration or {}).get("before")
    if before is None:
        before = await _before_calibration(session, output)
    output.calibration = {
        "camera_id": camera.id, "captured_at": utcnow().isoformat(), "coverage": coverage,
        **payload.model_dump(mode="json"), "before": before,
    }
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="output_calibrated",
                      message=f"Camera {camera.name} calibrated output {output.name} "
                              f"({coverage:.0%} of its picture)"))
    await session.commit()
    await session.refresh(output)
    return _output_changed(output)


@router.get("/outputs/{output_id}/calibration")
async def get_calibration(output_id: int, session: SessionDep, _: RequireViewer) -> dict:
    output = await _load_output(session, output_id)
    if not output.calibration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Output {output.name} has not been calibrated")
    return {k: v for k, v in output.calibration.items() if k != "before"}


async def _before_calibration(session, output: MappingOutput) -> dict:
    """What calibration may change on this output, as it is now.

    The show's camera placement is taken from another output of the show
    that was calibrated first, if any: by now the placement may already be
    the calibration's own.
    """
    show = await _load_show(session, output.show_id)
    camera_view = show.camera_view or {}
    for other in show.outputs:
        earlier = (other.calibration or {}).get("before")
        if other.id != output.id and earlier is not None:
            camera_view = earlier.get("camera_view") or {}
            break
    return {"source": output.source or {}, "warp": output.warp or {},
            "camera_view": camera_view}


def _restore(output: MappingOutput, index: int, count: int) -> None:
    """Put an output back as it was before its first calibration and forget it.

    Calibrations made before this was kept have nothing to go back to: the
    output gets a flat corner pin and its place in a side-by-side layout,
    as a new show lays them out.
    """
    before = (output.calibration or {}).get("before")
    if before is not None:
        output.source = before.get("source") or {}
        output.warp = before.get("warp") or {}
    else:
        output.source = canvas_layout.even_split(count)[index]
        output.warp = Warp().model_dump(mode="json")
    output.calibration = {}


def _stop(output: MappingOutput, camera_id: int | None) -> None:
    """Stop a run of this output still going on the camera, and tell the windows."""
    _stopped.add(output.id)
    bus.publish("mapping_calib_pattern", {
        "camera_id": camera_id, "show_id": output.show_id, "output_id": output.id,
        "pattern": None, "step": 0, "steps": 0,
        "status": "failed", "message": "Calibration removed", "removed": True,
    })


async def _remove(session, show: MappingShow, outputs: list[MappingOutput],
                  admin: User) -> list[MappingOutput]:
    """Undo the calibration of ``outputs`` (all of ``show``'s, or one)."""
    ordered = list(show.outputs)
    restored = []
    view_before = None
    for output in outputs:
        calibration = output.calibration or {}
        _stop(output, calibration.get("camera_id"))
        if not calibration:
            continue
        before = calibration.get("before")
        if before is not None and view_before is None:
            view_before = before.get("camera_view") or {}
        _restore(output, ordered.index(output), len(ordered))
        restored.append(output)
    # The camera placement goes back once no output of the show is calibrated.
    if restored and not any(o.calibration for o in ordered):
        show.camera_view = view_before or {}
    if restored:
        session.add(Event(projector_id=None, severity=Severity.INFO.value,
                          kind="calibration_removed",
                          message=f"{admin.username} removed the camera calibration of "
                                  f"{', '.join(o.name for o in restored)} in {show.name}"))
    await session.commit()
    for output in ordered:
        await session.refresh(output)
        _output_changed(output)
    _touch(show.id)
    return restored


@router.delete("/outputs/{output_id}/calibration", status_code=status.HTTP_204_NO_CONTENT,
               response_model=None, dependencies=[Depends(write_rate_limit)])
async def clear_calibration(output_id: int, session: SessionDep, admin: RequireAdmin) -> None:
    """Undo one output's calibration: back to its slice and warp from before."""
    output = await _load_output(session, output_id)
    show = await _load_show(session, output.show_id)
    await _remove(session, show, [output], admin)


@router.post("/shows/{show_id}/remove-calibration", response_model=RemoveResult,
             dependencies=[Depends(write_rate_limit)])
async def remove_calibration(show_id: int, session: SessionDep,
                             admin: RequireAdmin) -> RemoveResult:
    """Undo the camera calibration of a whole show and stop one still running.

    Every calibrated output goes back to the slice and warp it had before
    it was first calibrated (hand changes made since are dropped with it);
    the show's camera placement goes back too. Outputs never calibrated are
    not touched.
    """
    show = await _load_show(session, show_id)
    restored = await _remove(session, show, list(show.outputs), admin)
    return RemoveResult(restored=[o.id for o in restored])


def _apart(output: MappingOutput) -> bool:
    """Set to show a picture apart from the others, so not part of the shared one."""
    return (output.blend or {}).get("auto") is False


@router.post("/shows/{show_id}/fit-canvas", response_model=FitResult,
             dependencies=[Depends(write_rate_limit)])
async def fit_canvas_to_light(show_id: int, payload: FitCanvas, session: SessionDep,
                              admin: RequireAdmin) -> FitResult:
    """Place the canvas on the camera's photo inside the projectors' light.

    The largest rectangle of the canvas's shape that the calibrated
    projectors light, so nothing of the picture falls off the building.
    Replaces any corners or grid placed by hand. Outputs set to show a
    picture apart from the others (blend ``auto`` False) are left out.
    """
    show = await _load_show(session, show_id)
    calibrated = [o for o in show.outputs
                  if (o.calibration or {}).get("camera_id") == payload.camera_id
                  and not _apart(o)]
    try:
        corners = fit_canvas([o.calibration for o in calibrated],
                             show.canvas_width / show.canvas_height)
    except CalibrationError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    view = CameraView(camera_id=payload.camera_id, corners=corners)
    show.camera_view = view.model_dump(mode="json")
    sliced: list[MappingOutput] = []
    if payload.slices:
        for output in calibrated:
            source = light_on_canvas(output.calibration, corners)
            if source is not None:
                output.source = source
                sliced.append(output)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="canvas_fitted",
                      message=f"{admin.username} fitted the canvas of {show.name} to the "
                              "projectors' light"))
    await session.commit()
    for output in sliced:
        await session.refresh(output)
        _output_changed(output)
    _touch(show_id)
    return FitResult(camera_view=view, sliced=[o.id for o in sliced])


@router.post("/shows/{show_id}/apply-calibration", response_model=list[ApplyResult],
             dependencies=[Depends(write_rate_limit)])
async def apply_calibration(show_id: int, payload: ApplyCalibration, session: SessionDep,
                            admin: RequireAdmin) -> list[ApplyResult]:
    """Set each calibrated output's corner pin and mesh from the camera.

    Replaces the outputs' current warp; masks, blend and colour are kept.
    Outputs showing a picture apart from the others, and ones whose light
    misses the shared picture altogether, keep the warp they have.
    """
    show = await _load_show(session, show_id)
    view = show.camera_view or {}
    if not view.get("corners"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Mark where the canvas sits on the camera photo first")
    results: list[ApplyResult] = []
    changed: list[MappingOutput] = []
    for output in show.outputs:
        if payload.output_ids is not None and output.id not in payload.output_ids:
            continue
        calibration = output.calibration or {}
        if calibration.get("camera_id") != view.get("camera_id"):
            results.append(ApplyResult(output_id=output.id, name=output.name, applied=False,
                                       reason="Not calibrated with this show's camera"))
            continue
        if _apart(output):
            results.append(ApplyResult(output_id=output.id, name=output.name, applied=False,
                                       reason="Shows a picture apart from the others; line it up by hand"))
            continue
        if light_on_canvas(calibration, view["corners"]) is None:
            results.append(ApplyResult(output_id=output.id, name=output.name, applied=False,
                                       reason="Its light misses the picture; line it up by hand"))
            continue
        try:
            warp, stats = solve_warp(output.source or {}, view["corners"], calibration,
                                     mesh=payload.mesh, output_width=output.width,
                                     camera_mesh=view.get("mesh"))
            output.warp = Warp.model_validate(warp).model_dump(mode="json")
        except (CalibrationError, ValueError) as exc:
            results.append(ApplyResult(output_id=output.id, name=output.name, applied=False,
                                       reason=str(exc)))
            continue
        changed.append(output)
        results.append(ApplyResult(output_id=output.id, name=output.name, applied=True,
                                   measured=round(stats["measured"], 3),
                                   residual_px=round(stats["residual_px"], 2)))
    if changed:
        session.add(Event(projector_id=None, severity=Severity.INFO.value,
                          kind="calibration_applied",
                          message=f"{admin.username} applied camera calibration to "
                                  f"{', '.join(o.name for o in changed)} in {show.name}"))
    await session.commit()
    for output in changed:
        await session.refresh(output)
        _output_changed(output)
    return results


# -- the camera's own picture and commands ---------------------------------------


def _snapshot_dir():
    folder = media_root() / "cameras"
    folder.mkdir(exist_ok=True)
    return folder


def _snapshot_path(camera_id: int):
    for extension in SNAPSHOT_TYPES.values():
        path = _snapshot_dir() / f"{camera_id}{extension}"
        if path.is_file():
            return path
    return None


@router.put("/cameras/me/snapshot", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def upload_snapshot(request: Request, session: SessionDep, user: CurrentUser) -> None:
    """The camera's current picture, so the canvas corners can be marked on it."""
    camera = await _this_camera(session, user)
    content_type = request.headers.get("content-type", "").split(";")[0].strip()
    if content_type not in SNAPSHOT_TYPES:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                            detail="Send the photo as image/jpeg or image/png")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > SNAPSHOT_MAX:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                                detail="Photo is too large")
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The photo was empty")
    folder = _snapshot_dir()
    partial = folder / f".{uuid.uuid4().hex}.part"
    target = folder / f"{camera.id}{SNAPSHOT_TYPES[content_type]}"
    try:
        partial.write_bytes(body)
        # Replace first, so a viewer never finds no photo at all mid-update.
        os.replace(partial, target)
    finally:
        with contextlib.suppress(FileNotFoundError):
            partial.unlink()
    for extension in SNAPSHOT_TYPES.values():
        if extension != target.suffix:
            with contextlib.suppress(FileNotFoundError):
                (folder / f"{camera.id}{extension}").unlink()
    bus.publish("mapping_camera", {"camera_id": camera.id, "snapshot_at": now_ms()})


@router.get("/cameras/{camera_id}/snapshot")
async def get_snapshot(camera_id: int, request: Request, session: SessionDep,
                       token: str | None = Query(default=None)) -> FileResponse:
    await _media_user(session, token, request)
    await _load_camera(session, camera_id)
    path = _snapshot_path(camera_id)
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="This camera has not sent a photo yet")
    return FileResponse(path, headers={"Cache-Control": "no-store"})


@router.post("/cameras/{camera_id}/command", status_code=status.HTTP_204_NO_CONTENT,
             response_model=None, dependencies=[Depends(write_rate_limit)])
async def camera_command(camera_id: int, payload: CameraCommand, session: SessionDep,
                         _: RequireAdmin) -> None:
    camera = await _load_camera(session, camera_id)
    if not is_online(camera):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"Camera {camera.name} is offline")
    message = {"camera_id": camera.id, "command": payload.command}
    if payload.command == "live":
        message["seconds"] = payload.seconds
    bus.publish("mapping_camera_command", message)


# -- people tracking --------------------------------------------------------------


@router.post("/cameras/me/people", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def report_people(payload: PeopleReport, session: SessionDep, user: CurrentUser) -> None:
    """Who the camera sees right now; relayed live, never stored.

    Cameras that can send their reports over the live feed WebSocket do
    (see ``ws.py``): no request per report, so less delay. This route
    stays for older cameras.
    """
    camera = await _this_camera(session, user)
    await relay_people(session, camera.id, payload)


#: Camera-to-canvas homography by the corners it was solved from: the same
#: corners give the same matrix, so it is solved once, not on every report.
_to_canvas: dict[tuple, object] = {}


def _canvas_transform(corners: list) -> object | None:
    key = tuple(tuple(c) for c in corners)
    if key not in _to_canvas:
        if len(_to_canvas) > 32:
            _to_canvas.clear()
        try:
            _to_canvas[key] = camera_to_canvas(corners)
        except CalibrationError:
            _to_canvas[key] = None
    return _to_canvas[key]


async def relay_people(session, camera_id: int, payload: PeopleReport) -> None:
    """Map a camera's people onto the live canvas and send them to the output windows.

    Positions go out in camera fractions (``cx``, ``cy``) for the editor's
    view of the photo, and in canvas fractions (``x``, ``y``) when the live
    show has marked its canvas on this camera's picture. ``captured_at`` is
    when the camera took the picture, in server time, so output windows can
    tell how old each report is and draw people where they are by now.
    """
    now = now_ms()
    show_id = transport.snapshot().show_id
    to_canvas = None
    if show_id is not None:
        view = (await session.execute(
            select(MappingShow.camera_view).where(MappingShow.id == show_id)
        )).scalar_one_or_none() or {}
        if view.get("camera_id") == camera_id and view.get("corners"):
            to_canvas = _canvas_transform(view["corners"])
    people = []
    for person in payload.people:
        x = y = None
        if to_canvas is not None:
            x, y = (round(v, 5) for v in apply(to_canvas, person.x, person.y))
        people.append({"id": person.id, "cx": person.x, "cy": person.y, "x": x, "y": y,
                       "z": person.z, "size": person.size})
    captured_at = None
    if payload.captured_at is not None and now - 2000 < payload.captured_at <= now + 50:
        captured_at = min(now, payload.captured_at)
    elif payload.age_ms is not None and 0 <= payload.age_ms < 2000:
        captured_at = now - payload.age_ms
    bus.publish("mapping_people", {"camera_id": camera_id, "show_id": show_id,
                                   "people": people, "at": now, "captured_at": captured_at})


class PeopleFeed:
    """People reports arriving on one camera's live feed WebSocket.

    The socket already proved who it is, so a report costs no login and no
    request; which camera that account is gets looked up once and then
    re-checked every few seconds, so a removed camera stops counting.
    """

    RECHECK_SECONDS = 5.0

    def __init__(self, user_id: int) -> None:
        self.user_id = user_id
        self.camera_id: int | None = None
        self.checked = -1e9

    async def report(self, raw: object) -> None:
        try:
            payload = PeopleReport.model_validate(raw)
        except ValueError:
            return
        async with SessionLocal() as session:
            clock = time.monotonic()
            if clock - self.checked > self.RECHECK_SECONDS:
                self.checked = clock
                self.camera_id = (await session.execute(
                    select(MappingPlayer.id).where(MappingPlayer.user_id == self.user_id,
                                                   MappingPlayer.kind == "camera",
                                                   MappingPlayer.approved.is_(True))
                )).scalars().first()
            if self.camera_id is not None:
                await relay_people(session, self.camera_id, payload)
