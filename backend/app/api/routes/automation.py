"""Automations, scenes and maintenance records."""

from __future__ import annotations

import csv
import io
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.api.deps import (
    RequireAdmin,
    RequireOperator,
    RequireViewer,
    SessionDep,
    command_rate_limit,
    require_confirmation,
)
from app.db.models import (
    Automation,
    AutomationRun,
    Event,
    MaintenanceRecord,
    Projector,
    Scene,
    Severity,
)
from app.schemas import (
    AutomationIn,
    AutomationOut,
    AutomationRunOut,
    ConfirmableCommand,
    MaintenanceIn,
    MaintenanceOut,
    SceneIn,
    SceneOut,
)
from app.services.automation import activate_scene, engine
from app.services.automation_validation import validate_automation

router = APIRouter(tags=["automation"])


# -- automations ------------------------------------------------------------


@router.get("/automations", response_model=list[AutomationOut])
async def list_automations(session: SessionDep, _: RequireViewer) -> list[Automation]:
    return list((await session.execute(
        select(Automation).order_by(Automation.name)
    )).scalars().all())


@router.post("/automations", response_model=AutomationOut,
             status_code=status.HTTP_201_CREATED)
async def create_automation(payload: AutomationIn, session: SessionDep,
                            admin: RequireAdmin) -> Automation:
    existing = (await session.execute(
        select(Automation).where(Automation.name == payload.name)
    )).scalars().first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"An automation named {payload.name!r} already exists")
    automation = Automation(**payload.model_dump())
    session.add(automation)
    session.add(Event(projector_id=None, severity=Severity.INFO.value,
                      kind="automation_created",
                      message=f"{admin.username} created automation {payload.name}"))
    await session.commit()
    await session.refresh(automation)
    return automation


@router.post("/automations/validate")
async def validate_automation_draft(payload: AutomationIn, session: SessionDep,
                                    _: RequireOperator) -> dict:
    """Pre-flight a draft without saving it.

    Checks the schedule, resolves every target, confirms each function exists
    on each targeted projector's driver and is not gated there, checks the
    parameters against the manifest, and previews the next run times.
    """
    return await validate_automation(
        session, trigger_type=payload.trigger_type, schedule=payload.schedule,
        steps=payload.steps,
    )


@router.get("/automations/{automation_id}", response_model=AutomationOut)
async def get_automation(automation_id: int, session: SessionDep,
                         _: RequireViewer) -> Automation:
    automation = await session.get(Automation, automation_id)
    if automation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Automation not found")
    return automation


@router.patch("/automations/{automation_id}", response_model=AutomationOut)
async def update_automation(automation_id: int, payload: AutomationIn,
                            session: SessionDep, admin: RequireAdmin) -> Automation:
    automation = await session.get(Automation, automation_id)
    if automation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Automation not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(automation, key, value)
    await session.commit()
    await session.refresh(automation)
    return automation


@router.delete("/automations/{automation_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_automation(automation_id: int, session: SessionDep,
                            _: RequireAdmin) -> None:
    automation = await session.get(Automation, automation_id)
    if automation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Automation not found")
    await session.delete(automation)
    await session.commit()


@router.post("/automations/{automation_id}/execute",
             dependencies=[Depends(command_rate_limit)])
async def execute_automation(automation_id: int, payload: ConfirmableCommand | None = None,
                             *, session: SessionDep, user: RequireOperator) -> dict:
    """Run an automation now.

    Automations drive real hardware, so this requires explicit confirmation
    exactly like a direct power command does. The body is ``{"confirm":
    true}``; a ``capability`` alongside it, as older clients send, is ignored.
    """
    automation = await session.get(Automation, automation_id)
    if automation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Automation not found")
    require_confirmation(bool(payload and payload.confirm),
                         f"run automation {automation.name!r}")
    return await engine.run(automation_id, trigger="manual", user=user.username)


@router.get("/automations/{automation_id}/runs", response_model=list[AutomationRunOut])
async def list_runs(automation_id: int, session: SessionDep, _: RequireViewer,
                    limit: int = Query(50, ge=1, le=500)) -> list[AutomationRun]:
    return list((await session.execute(
        select(AutomationRun).where(AutomationRun.automation_id == automation_id)
        .order_by(AutomationRun.started_at.desc()).limit(limit)
    )).scalars().all())


# -- scenes -----------------------------------------------------------------


@router.get("/scenes", response_model=list[SceneOut])
async def list_scenes(session: SessionDep, _: RequireViewer) -> list[Scene]:
    return list((await session.execute(select(Scene).order_by(Scene.name))).scalars().all())


@router.post("/scenes", response_model=SceneOut, status_code=status.HTTP_201_CREATED)
async def create_scene(payload: SceneIn, session: SessionDep, _: RequireAdmin) -> Scene:
    existing = (await session.execute(
        select(Scene).where(Scene.name == payload.name)
    )).scalars().first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"A scene named {payload.name!r} already exists")
    scene = Scene(**payload.model_dump())
    session.add(scene)
    await session.commit()
    await session.refresh(scene)
    return scene


@router.patch("/scenes/{scene_id}", response_model=SceneOut)
async def update_scene(scene_id: int, payload: SceneIn, session: SessionDep,
                       _: RequireAdmin) -> Scene:
    scene = await session.get(Scene, scene_id)
    if scene is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scene not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(scene, key, value)
    await session.commit()
    await session.refresh(scene)
    return scene


@router.delete("/scenes/{scene_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_scene(scene_id: int, session: SessionDep, _: RequireAdmin) -> None:
    scene = await session.get(Scene, scene_id)
    if scene is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scene not found")
    await session.delete(scene)
    await session.commit()


@router.post("/scenes/{scene_id}/activate", dependencies=[Depends(command_rate_limit)])
async def activate(scene_id: int, payload: ConfirmableCommand | None = None, *,
                   session: SessionDep, user: RequireOperator) -> dict:
    """Activate a scene.

    'Emergency Blackout' is a scene that closes shutters or blanks compatible
    external systems. It is an operational convenience, **not a certified
    emergency safety mechanism** — see docs/SAFETY.md.
    """
    scene = await session.get(Scene, scene_id)
    if scene is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scene not found")
    require_confirmation(bool(payload and payload.confirm),
                         f"activate scene {scene.name!r}")
    return await activate_scene(scene_id, user=user.username)


# -- maintenance -------------------------------------------------------------


@router.get("/maintenance", response_model=list[MaintenanceOut])
async def list_maintenance(session: SessionDep, _: RequireViewer,
                           projector_id: int | None = Query(None),
                           limit: int = Query(200, ge=1, le=2000)
                           ) -> list[MaintenanceRecord]:
    query = select(MaintenanceRecord)
    if projector_id is not None:
        query = query.where(MaintenanceRecord.projector_id == projector_id)
    query = query.order_by(MaintenanceRecord.performed_at.desc()).limit(limit)
    return list((await session.execute(query)).scalars().all())


@router.post("/maintenance", response_model=MaintenanceOut,
             status_code=status.HTTP_201_CREATED)
async def create_maintenance(payload: MaintenanceIn, session: SessionDep,
                             user: RequireOperator) -> MaintenanceRecord:
    projector = await session.get(Projector, payload.projector_id)
    if projector is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Projector {payload.projector_id} not found")
    record = MaintenanceRecord(
        **payload.model_dump(exclude={"performed_at"}),
        performed_at=payload.performed_at or datetime.now(UTC),
        performed_by=user.username,
    )
    session.add(record)
    session.add(Event(projector_id=payload.projector_id, severity=Severity.INFO.value,
                      kind=f"maintenance_{payload.kind}",
                      message=f"{user.username} recorded {payload.kind} on {projector.name}",
                      details={"notes": payload.notes}))
    await session.commit()
    await session.refresh(record)
    return record


@router.delete("/maintenance/{record_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_maintenance(record_id: int, session: SessionDep, _: RequireAdmin) -> None:
    record = await session.get(MaintenanceRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    await session.delete(record)
    await session.commit()


@router.get("/maintenance/export.csv")
async def export_maintenance(session: SessionDep, _: RequireViewer,
                             projector_id: int | None = Query(None)) -> StreamingResponse:
    query = select(MaintenanceRecord, Projector.name).join(
        Projector, Projector.id == MaintenanceRecord.projector_id, isouter=True
    )
    if projector_id is not None:
        query = query.where(MaintenanceRecord.projector_id == projector_id)
    rows = (await session.execute(query.order_by(
        MaintenanceRecord.performed_at.desc()
    ))).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "projector_id", "projector", "kind", "performed_at",
                     "lamp_index", "hours_at_service", "performed_by",
                     "next_due_hours", "next_due_at", "notes"])
    for record, projector_name in rows:
        writer.writerow([
            record.id, record.projector_id, projector_name or "", record.kind,
            record.performed_at.isoformat() if record.performed_at else "",
            record.lamp_index if record.lamp_index is not None else "",
            record.hours_at_service if record.hours_at_service is not None else "",
            record.performed_by or "",
            record.next_due_hours if record.next_due_hours is not None else "",
            record.next_due_at.isoformat() if record.next_due_at else "",
            record.notes or "",
        ])
    buffer.seek(0)
    stamp = datetime.now(UTC).strftime("%Y%m%d")
    return StreamingResponse(
        iter([buffer.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition":
                 f'attachment; filename="maintenance-{stamp}.csv"'},
    )
