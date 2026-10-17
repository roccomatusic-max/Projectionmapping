"""Groups and multi-projector control."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import (
    RequireAdmin,
    RequireOperator,
    RequireViewer,
    SessionDep,
    command_rate_limit,
    require_confirmation,
    write_rate_limit,
)
from app.api.routes.projectors import _source
from app.db.models import Event, Group, GroupMember, Projector, Severity
from app.drivers import CommandOutcome
from app.schemas import (
    CommandResultOut,
    GroupCommand,
    GroupCommandResult,
    GroupCreate,
    GroupOut,
    GroupUpdate,
)
from app.services.audit import log_command_results
from app.services.device_manager import Priority, manager

router = APIRouter(prefix="/groups", tags=["groups"])

SUCCESS_OUTCOMES = {CommandOutcome.CONFIRMED.value, CommandOutcome.ACCEPTED.value,
                    CommandOutcome.OK.value}


def _group_out(group: Group) -> GroupOut:
    return GroupOut(
        id=group.id, name=group.name, description=group.description, color=group.color,
        projector_ids=[m.projector_id for m in sorted(group.members, key=lambda m: m.position)],
    )


async def _load(session, group_id: int) -> Group:
    group = (await session.execute(
        select(Group).where(Group.id == group_id).options(selectinload(Group.members))
    )).scalars().first()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Group {group_id} not found")
    return group


async def _validate_members(session, projector_ids: list[int]) -> None:
    if not projector_ids:
        return
    found = set((await session.execute(
        select(Projector.id).where(Projector.id.in_(projector_ids))
    )).scalars().all())
    missing = sorted(set(projector_ids) - found)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown projector id(s): {', '.join(map(str, missing))}",
        )


@router.get("", response_model=list[GroupOut])
async def list_groups(session: SessionDep, _: RequireViewer) -> list[GroupOut]:
    groups = (await session.execute(
        select(Group).options(selectinload(Group.members)).order_by(Group.name)
    )).scalars().all()
    return [_group_out(g) for g in groups]


@router.post("", response_model=GroupOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(write_rate_limit)])
async def create_group(payload: GroupCreate, session: SessionDep,
                       admin: RequireAdmin) -> GroupOut:
    existing = (await session.execute(
        select(Group).where(Group.name == payload.name)
    )).scalars().first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"A group named {payload.name!r} already exists")
    await _validate_members(session, payload.projector_ids)
    group = Group(name=payload.name, description=payload.description, color=payload.color)
    session.add(group)
    await session.flush()
    for position, pid in enumerate(payload.projector_ids):
        session.add(GroupMember(group_id=group.id, projector_id=pid, position=position))
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="group_created",
                      message=f"{admin.username} created group {group.name}"))
    await session.commit()
    return _group_out(await _load(session, group.id))


# Static paths are declared before the /{group_id} routes on purpose: FastAPI
# matches routes in declaration order, and "all" or "selection" would
# otherwise be parsed as a group id and rejected with a 422.

@router.post("/all/commands", response_model=GroupCommandResult,
             dependencies=[Depends(command_rate_limit)])
async def all_command(payload: GroupCommand, session: SessionDep,
                      user: RequireOperator, request: Request) -> GroupCommandResult:
    """Dispatch to every enabled projector."""
    projector_ids = list((await session.execute(
        select(Projector.id).where(Projector.enabled.is_(True)).order_by(Projector.name)
    )).scalars().all())
    if not projector_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="No enabled projectors are registered")
    if _is_disruptive(projector_ids, payload.capability):
        require_confirmation(payload.confirm,
                             f"{payload.capability} on ALL {len(projector_ids)} projectors")

    dispatched_at = datetime.now(UTC)
    results = await manager.dispatch_many(
        projector_ids, payload.capability, payload.params, priority=Priority.USER
    )
    await log_command_results(results, payload.capability, payload.params,
                              source=_source(request), username=user.username, user_id=user.id)
    return _summarise(dispatched_at, payload.capability, results)


@router.post("/selection/commands", response_model=GroupCommandResult,
             dependencies=[Depends(command_rate_limit)])
async def selection_command(
    payload: GroupCommand,
    session: SessionDep,
    user: RequireOperator,
    request: Request,
    projector_ids: Annotated[list[int], Query(min_length=1)],
) -> GroupCommandResult:
    """Dispatch to an ad-hoc selection, for the Control Center."""
    if not projector_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="No projectors selected")
    await _validate_members(session, projector_ids)
    if _is_disruptive(projector_ids, payload.capability):
        require_confirmation(
            payload.confirm,
            f"{payload.capability} on {len(projector_ids)} selected projector(s)",
        )
    dispatched_at = datetime.now(UTC)
    results = await manager.dispatch_many(
        projector_ids, payload.capability, payload.params, priority=Priority.USER
    )
    await log_command_results(results, payload.capability, payload.params,
                              source=_source(request), username=user.username, user_id=user.id)
    return _summarise(dispatched_at, payload.capability, results)


@router.get("/{group_id}", response_model=GroupOut)
async def get_group(group_id: int, session: SessionDep, _: RequireViewer) -> GroupOut:
    return _group_out(await _load(session, group_id))


@router.patch("/{group_id}", response_model=GroupOut,
              dependencies=[Depends(write_rate_limit)])
async def update_group(group_id: int, payload: GroupUpdate, session: SessionDep,
                       admin: RequireAdmin) -> GroupOut:
    group = await _load(session, group_id)
    if payload.name is not None:
        group.name = payload.name
    if payload.description is not None:
        group.description = payload.description
    if payload.color is not None:
        group.color = payload.color
    if payload.projector_ids is not None:
        await _validate_members(session, payload.projector_ids)
        for member in list(group.members):
            await session.delete(member)
        await session.flush()
        for position, pid in enumerate(payload.projector_ids):
            session.add(GroupMember(group_id=group.id, projector_id=pid, position=position))
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="group_updated",
                      message=f"{admin.username} updated group {group.name}"))
    await session.commit()
    return _group_out(await _load(session, group_id))


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_group(group_id: int, session: SessionDep, admin: RequireAdmin) -> None:
    group = await _load(session, group_id)
    name = group.name
    await session.delete(group)
    session.add(Event(projector_id=None, severity=Severity.WARNING.value,
                      kind="group_deleted",
                      message=f"{admin.username} deleted group {name}"))
    await session.commit()


@router.post("/{group_id}/commands", response_model=GroupCommandResult,
             dependencies=[Depends(command_rate_limit)])
async def group_command(group_id: int, payload: GroupCommand, session: SessionDep,
                        user: RequireOperator, request: Request) -> GroupCommandResult:
    """Dispatch one capability to every projector in a group, concurrently.

    Commands are issued in parallel and each projector's result is reported
    separately: three projectors and one failure produces two successes and
    one named failure, never a single aggregate verdict.

    This is concurrent dispatch, not frame-accurate synchronisation — see
    docs/ARCHITECTURE.md §5.
    """
    group = await _load(session, group_id)
    projector_ids = [m.projector_id for m in sorted(group.members, key=lambda m: m.position)]
    if not projector_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Group {group.name!r} has no projectors")

    if _is_disruptive(projector_ids, payload.capability):
        require_confirmation(
            payload.confirm,
            f"{payload.capability} on {len(projector_ids)} projector(s) in {group.name!r}",
        )

    dispatched_at = datetime.now(UTC)
    results = await manager.dispatch_many(
        projector_ids, payload.capability, payload.params, priority=Priority.USER
    )
    await log_command_results(results, payload.capability, payload.params,
                              source=_source(request), username=user.username, user_id=user.id)
    return _summarise(dispatched_at, payload.capability, results)


def _is_disruptive(projector_ids: list[int], capability: str) -> bool:
    """A capability is disruptive if any targeted driver says so."""
    for pid in projector_ids:
        worker = manager.get(pid)
        if worker is None:
            continue
        cap = worker.driver.capabilities.get(capability)
        if cap is not None and cap.disruptive:
            return True
    return False


def _summarise(dispatched_at: datetime, capability: str,
               results: list[dict]) -> GroupCommandResult:
    succeeded = sum(1 for r in results if r.get("outcome") in SUCCESS_OUTCOMES)
    return GroupCommandResult(
        dispatched_at=dispatched_at,
        capability=capability,
        results=[CommandResultOut(**r) for r in results],
        summary={
            "total": len(results),
            "succeeded": succeeded,
            "failed": len(results) - succeeded,
        },
    )
