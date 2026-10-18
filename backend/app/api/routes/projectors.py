"""Projector registration, status and control."""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select

from app.api.deps import (
    RequireAdmin,
    RequireOperator,
    RequireViewer,
    SessionDep,
    command_rate_limit,
    require_confirmation,
    write_rate_limit,
)
from app.config import settings
from app.core.security import encrypt_secret
from app.db.models import (
    CommandLog,
    Event,
    Projector,
    ProjectorState,
    Severity,
    Telemetry,
    as_utc,
)
from app.drivers import CommandOutcome, capability_manifest
from app.drivers import available as available_drivers
from app.drivers.registry import get as get_driver_info
from app.schemas import (
    CommandResultOut,
    GenericCommand,
    InputRequest,
    PowerRequest,
    ProjectorCreate,
    ProjectorOut,
    ProjectorStateOut,
    ProjectorUpdate,
    ShutterRequest,
)
from app.services.audit import close_command_log, open_command_log
from app.services.device_manager import Priority, manager

router = APIRouter(prefix="/projectors", tags=["projectors"])


# -- serialization ----------------------------------------------------------


def _state_out(record: Projector, state: ProjectorState | None) -> ProjectorStateOut:
    """Build the live-state view.

    Online is computed from ``last_seen_at``, so a projector whose polls have
    stopped shows as stale rather than inheriting its last good reading.
    """
    worker = manager.get(record.id)
    if state is None:
        return ProjectorStateOut(queue_depth=worker.queue_depth if worker else 0)

    stale_after = state.stale_after or int(
        settings.poll_operational * settings.staleness_multiplier
    )
    stale = True
    if state.last_seen_at is not None:
        age = datetime.now(UTC) - as_utc(state.last_seen_at)
        stale = age > timedelta(seconds=stale_after)

    return ProjectorStateOut(
        online=bool(state.online and not stale),
        stale=stale,
        power=state.power if not stale else "unknown",
        shutter=state.shutter if not stale else "unknown",
        health=state.health if not stale else "unknown",
        active_input=state.active_input or {},
        lamp_hours=state.lamp_hours or {},
        lamp_status=state.lamp_status or {},
        error_status=state.error_status or {},
        errors=state.errors or [],
        warnings=state.warnings or [],
        last_seen_at=state.last_seen_at,
        last_error=state.last_error,
        consecutive_failures=state.consecutive_failures,
        queue_depth=worker.queue_depth if worker else 0,
        equipment=(state.extra or {}).get("equipment", {}),
    )


def _projector_out(record: Projector, state: ProjectorState | None) -> ProjectorOut:
    return ProjectorOut(
        id=record.id, name=record.name, manufacturer=record.manufacturer,
        model=record.model, location=record.location, notes=record.notes,
        host=record.host, port=record.port, driver=record.driver,
        username=record.username, enabled=record.enabled,
        allow_unverified_commands=record.allow_unverified_commands,
        command_timeout=record.command_timeout, command_gap=record.command_gap,
        poll_overrides=record.poll_overrides or {},
        lamp_warn_hours=record.lamp_warn_hours,
        lamp_critical_hours=record.lamp_critical_hours,
        pjlink_port=record.pjlink_port,
        has_password=bool(record.password_enc),
        created_at=record.created_at,
        state=_state_out(record, state),
    )


async def _load(session, projector_id: int) -> tuple[Projector, ProjectorState | None]:
    record = await session.get(Projector, projector_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Projector {projector_id} not found")
    state = await session.get(ProjectorState, projector_id)
    return record, state


# -- drivers ---------------------------------------------------------------


@router.get("/drivers", tags=["drivers"])
async def list_drivers(_: RequireViewer) -> dict:
    """Available drivers and their capability manifests.

    The UI uses this to decide which controls exist at all, before any device
    has been polled.
    """
    return {
        "drivers": [
            {**info.as_dict(), **capability_manifest(info.driver_id)}
            for info in available_drivers()
        ]
    }


# -- CRUD ------------------------------------------------------------------


@router.get("", response_model=list[ProjectorOut])
async def list_projectors(session: SessionDep, _: RequireViewer) -> list[ProjectorOut]:
    records = (await session.execute(
        select(Projector).order_by(Projector.name)
    )).scalars().all()
    states = {
        s.projector_id: s for s in
        (await session.execute(select(ProjectorState))).scalars().all()
    }
    return [_projector_out(r, states.get(r.id)) for r in records]


@router.post("", response_model=ProjectorOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(write_rate_limit)])
async def create_projector(payload: ProjectorCreate, session: SessionDep,
                           admin: RequireAdmin) -> ProjectorOut:
    try:
        get_driver_info(payload.driver)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None

    existing = (await session.execute(
        select(Projector).where(Projector.name == payload.name)
    )).scalars().first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"A projector named {payload.name!r} already exists")

    data = payload.model_dump(exclude={"password", "pjlink_password"})
    record = Projector(
        **data,
        password_enc=encrypt_secret(payload.password),
        pjlink_password_enc=encrypt_secret(payload.pjlink_password),
    )
    session.add(record)
    await session.flush()
    session.add(ProjectorState(projector_id=record.id))
    session.add(Event(projector_id=record.id, severity=Severity.INFO.value,
                      kind="projector_added",
                      message=f"{admin.username} registered {record.name} "
                              f"({record.host}:{record.port})"))
    await session.commit()
    await session.refresh(record)

    if record.enabled:
        await manager.add(record)
    return _projector_out(record, await session.get(ProjectorState, record.id))


@router.get("/{projector_id}", response_model=ProjectorOut)
async def get_projector(projector_id: int, session: SessionDep,
                        _: RequireViewer) -> ProjectorOut:
    record, state = await _load(session, projector_id)
    return _projector_out(record, state)


@router.patch("/{projector_id}", response_model=ProjectorOut,
              dependencies=[Depends(write_rate_limit)])
async def update_projector(projector_id: int, payload: ProjectorUpdate,
                           session: SessionDep, admin: RequireAdmin) -> ProjectorOut:
    record, _state = await _load(session, projector_id)
    data = payload.model_dump(exclude_unset=True, exclude={"password", "pjlink_password"})
    if "driver" in data:
        try:
            get_driver_info(data["driver"])
        except KeyError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail=str(exc)) from None
    for key, value in data.items():
        setattr(record, key, value)
    if payload.password is not None:
        # An empty string clears the stored credential.
        record.password_enc = encrypt_secret(payload.password) if payload.password else None
    if payload.pjlink_password is not None:
        record.pjlink_password_enc = (
            encrypt_secret(payload.pjlink_password) if payload.pjlink_password else None
        )
    session.add(Event(projector_id=record.id, severity=Severity.INFO.value,
                      kind="projector_updated",
                      message=f"{admin.username} updated {record.name}",
                      details={"fields": sorted(data)}))
    await session.commit()
    await session.refresh(record)

    # Re-register so a changed address, credential or gating takes effect now
    # rather than at the next restart.
    await manager.remove(record.id)
    if record.enabled:
        await manager.add(record)
    return _projector_out(record, await session.get(ProjectorState, record.id))


@router.delete("/{projector_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_projector(projector_id: int, session: SessionDep,
                           admin: RequireAdmin) -> None:
    record, _state = await _load(session, projector_id)
    name = record.name
    await manager.remove(projector_id)
    await session.delete(record)
    session.add(Event(projector_id=None, severity=Severity.WARNING.value,
                      kind="projector_removed",
                      message=f"{admin.username} removed projector {name}"))
    await session.commit()


# -- status and capabilities ------------------------------------------------


@router.get("/{projector_id}/status", response_model=ProjectorStateOut)
async def get_status(projector_id: int, session: SessionDep, _: RequireViewer,
                     refresh: bool = Query(False, description="Poll the device now")
                     ) -> ProjectorStateOut:
    record, state = await _load(session, projector_id)
    if refresh:
        worker = manager.get(projector_id)
        if worker is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Projector is disabled or not registered with the device manager",
            )
        import asyncio

        from app.services.monitor import Tier, monitor

        future = worker.submit("status", {"deep": True}, priority=Priority.USER,
                               job="status")
        try:
            result = await asyncio.wait_for(future, timeout=30.0)
        except TimeoutError:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="The projector did not respond within 30s",
            ) from None
        # Persist on the same path a scheduled poll takes, so an operator who
        # asks for fresh data does not then read a stale row back.
        if result.value is not None:
            await monitor.persist_status(worker, result.value, Tier.DIAGNOSTICS)
        state = await session.get(ProjectorState, projector_id)
        if state is not None:
            await session.refresh(state)
    return _state_out(record, state)


@router.get("/{projector_id}/capabilities")
async def get_capabilities(projector_id: int, session: SessionDep, _: RequireViewer) -> dict:
    """Live capability manifest for this unit.

    Includes runtime retractions — an input board the projector reported as
    absent is listed under ``retracted`` with the reason, so the UI can say
    why a control is missing instead of silently omitting it.
    """
    record, _state = await _load(session, projector_id)
    worker = manager.get(projector_id)
    if worker is not None:
        manifest = worker.driver.capabilities.as_dict()
    else:
        manifest = capability_manifest(record.driver)
    return {
        "projector_id": projector_id,
        "driver": record.driver,
        "allow_unverified_commands": record.allow_unverified_commands,
        **manifest,
    }


@router.post("/{projector_id}/test")
async def test_connection(projector_id: int, session: SessionDep,
                          _: RequireOperator) -> dict:
    """Connectivity probe: TCP reachability plus a harmless status query."""
    record, _state = await _load(session, projector_id)
    started = time.monotonic()
    reachable = await manager.probe(record.host, record.port)
    tcp_ms = int((time.monotonic() - started) * 1000)
    if not reachable:
        return {
            "reachable": False, "tcp_latency_ms": tcp_ms, "authenticated": False,
            "detail": (
                f"No TCP connection to {record.host}:{record.port}. Check the IP address, "
                f"that the projector's network control is enabled, and that this server "
                f"can route to the projector VLAN."
            ),
        }
    worker = manager.get(projector_id)
    if worker is None:
        return {"reachable": True, "tcp_latency_ms": tcp_ms, "authenticated": False,
                "detail": "Port is open, but the projector is disabled in this platform."}

    result = await worker.execute("power.get", priority=Priority.USER, timeout=30.0)
    return {
        "reachable": True,
        "tcp_latency_ms": tcp_ms,
        # Only a projector that answered has shown our credentials are good;
        # a refused connection or a missing password is not a pass.
        "authenticated": result.outcome not in (
            CommandOutcome.AUTH_FAILED, CommandOutcome.CONNECTION_ERROR,
            CommandOutcome.TIMEOUT),
        "outcome": result.outcome.value,
        "value": str(result.value) if result.value is not None else None,
        "raw_response": result.raw_response,
        "error": result.error,
        "detail": _probe_detail(result),
    }


def _probe_detail(result) -> str:
    match result.outcome:
        case CommandOutcome.OK | CommandOutcome.ACCEPTED | CommandOutcome.CONFIRMED:
            return "Connected, authenticated and the projector answered a status query."
        case CommandOutcome.AUTH_FAILED:
            return result.error or ("The projector rejected the credentials. Check the "
                                    "web-control administrator username and password.")
        case CommandOutcome.TIMEOUT:
            return ("The port is open but the projector did not answer. Another "
                    "controller may be holding the control session.")
        case CommandOutcome.UNSUPPORTED:
            return "The projector refused the query as unsupported — check the driver choice."
    return result.error or "The projector did not answer successfully."


# -- control ----------------------------------------------------------------


def _source(request: Request) -> str:
    """Who sent this: the web UI tags itself; anything else is "api"."""
    client = request.headers.get("x-client", "").strip().lower()
    return client if client in ("ui", "homeassistant", "mqtt") else "api"


async def _dispatch(projector_id: int, capability: str, params: dict, user,
                    source: str = "api") -> CommandResultOut:
    worker = manager.get(projector_id)
    if worker is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Projector is disabled or not registered with the device manager",
        )
    entry_id = await open_command_log(projector_id, capability, params,
                                      source=source, username=user.username, user_id=user.id)
    result = await worker.execute(capability, params, priority=Priority.USER)
    await close_command_log(entry_id, result.as_dict())
    return CommandResultOut(projector_id=projector_id, name=worker.name, **result.as_dict())


@router.post("/{projector_id}/power", response_model=CommandResultOut,
             dependencies=[Depends(command_rate_limit)])
async def set_power(projector_id: int, payload: PowerRequest, session: SessionDep,
                    user: RequireOperator, request: Request) -> CommandResultOut:
    record, _state = await _load(session, projector_id)
    require_confirmation(payload.confirm, f"power {payload.state} {record.name}")
    return await _dispatch(projector_id, "power.set", {"state": payload.state}, user,
                           source=_source(request))


@router.post("/{projector_id}/shutter", response_model=CommandResultOut,
             dependencies=[Depends(command_rate_limit)])
async def set_shutter(projector_id: int, payload: ShutterRequest, session: SessionDep,
                      user: RequireOperator, request: Request) -> CommandResultOut:
    record, _state = await _load(session, projector_id)
    require_confirmation(payload.confirm, f"{payload.state} the shutter on {record.name}")
    return await _dispatch(projector_id, "shutter.set", {"state": payload.state}, user,
                           source=_source(request))


@router.post("/{projector_id}/input", response_model=CommandResultOut,
             dependencies=[Depends(command_rate_limit)])
async def set_input(projector_id: int, payload: InputRequest, session: SessionDep,
                    user: RequireOperator, request: Request) -> CommandResultOut:
    record, _state = await _load(session, projector_id)
    require_confirmation(payload.confirm, f"switch {record.name} to input {payload.input}")
    return await _dispatch(projector_id, "input.set", {"input": payload.input}, user,
                           source=_source(request))


@router.post("/{projector_id}/command", response_model=CommandResultOut,
             dependencies=[Depends(command_rate_limit)])
async def generic_command(projector_id: int, payload: GenericCommand, session: SessionDep,
                          user: RequireOperator, request: Request) -> CommandResultOut:
    """Dispatch any capability the driver exposes.

    The capability gate still applies: a command the driver does not support,
    or one gated as unverified on a device that has not opted in, is refused
    here without reaching the projector.
    """
    record, _state = await _load(session, projector_id)
    worker = manager.get(projector_id)
    if worker is not None:
        cap = worker.driver.capabilities.get(payload.capability)
        if cap is not None and cap.disruptive:
            require_confirmation(payload.confirm,
                                 f"{payload.capability} on {record.name}")
    return await _dispatch(projector_id, payload.capability, payload.params, user,
                           source=_source(request))


# -- history ----------------------------------------------------------------


@router.get("/{projector_id}/telemetry")
async def get_telemetry(
    projector_id: int, session: SessionDep, _: RequireViewer,
    metric: str | None = Query(None), days: int = Query(7, ge=1, le=365),
    limit: int = Query(2000, ge=1, le=20000),
) -> dict:
    since = datetime.now(UTC) - timedelta(days=days)
    query = (select(Telemetry)
             .where(Telemetry.projector_id == projector_id, Telemetry.recorded_at >= since)
             .order_by(Telemetry.recorded_at.desc()).limit(limit))
    if metric:
        query = query.where(Telemetry.metric == metric)
    rows = (await session.execute(query)).scalars().all()
    return {
        "projector_id": projector_id, "metric": metric, "days": days,
        "points": [
            {"metric": r.metric, "value_num": r.value_num,
             "value_text": r.value_text, "recorded_at": r.recorded_at}
            for r in reversed(rows)
        ],
    }


@router.get("/{projector_id}/commands")
async def get_command_history(
    projector_id: int, session: SessionDep, _: RequireViewer,
    limit: int = Query(100, ge=1, le=1000),
) -> dict:
    rows = (await session.execute(
        select(CommandLog).where(CommandLog.projector_id == projector_id)
        .order_by(CommandLog.created_at.desc()).limit(limit)
    )).scalars().all()
    return {
        "projector_id": projector_id,
        "commands": [
            {
                "id": r.id, "capability": r.capability, "params": r.params,
                "outcome": r.outcome, "source": r.source, "username": r.username,
                "raw_request": r.raw_request, "raw_response": r.raw_response,
                "error": r.error, "latency_ms": r.latency_ms,
                "created_at": r.created_at, "completed_at": r.completed_at,
            }
            for r in rows
        ],
    }
