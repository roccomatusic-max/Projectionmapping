"""Authentication and user administration."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, RequireAdmin, SessionDep, write_rate_limit
from app.config import settings
from app.core.security import create_access_token, hash_password, needs_rehash, verify_password
from app.db.models import Event, Role, Severity, User
from app.schemas import (
    LoginRequest,
    PasswordChange,
    ServiceTokenRequest,
    ServiceTokenResponse,
    TokenResponse,
    UserCreate,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, session: SessionDep) -> TokenResponse:
    user = (await session.execute(
        select(User).where(User.username == payload.username)
    )).scalars().first()

    # Same failure for unknown user and wrong password, and the hash is
    # verified either way so timing does not reveal which it was.
    valid = bool(user) and verify_password(payload.password, user.password_hash)
    if not valid or user is None or not user.is_active:
        if user is None:
            hash_password(payload.password)  # equalise work
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid username or password")

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(payload.password)
    user.last_login_at = datetime.now(UTC)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="login",
                      message=f"{user.username} signed in"))
    await session.commit()

    token = create_access_token(user.username, user.role)
    return TokenResponse(
        access_token=token, role=user.role, username=user.username,
        expires_in=settings.access_token_minutes * 60,
    )


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> User:
    return user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def change_password(payload: PasswordChange, user: CurrentUser,
                          session: SessionDep) -> None:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    session.add(Event(projector_id=None, severity=Severity.INFO.value,
                      kind="password_changed",
                      message=f"{user.username} changed their password"))
    await session.commit()


@router.post("/tokens", response_model=ServiceTokenResponse,
             dependencies=[Depends(write_rate_limit)])
async def create_service_token(payload: ServiceTokenRequest, session: SessionDep,
                               admin: RequireAdmin) -> ServiceTokenResponse:
    """Issue a long-lived token for an integration.

    Interactive sign-ins expire in hours; a sensor in an enclosure or a Home
    Assistant automation needs something that outlives that. The token is
    bound to a user, so revocation is "deactivate that user".
    """
    user = (await session.execute(
        select(User).where(User.username == payload.username)
    )).scalars().first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"No active user named {payload.username!r}")
    minutes = payload.days * 24 * 60
    token = create_access_token(user.username, user.role, expires_minutes=minutes)
    session.add(Event(projector_id=None, severity=Severity.WARNING.value,
                      kind="service_token_issued",
                      message=f"{admin.username} issued a {payload.days}-day token "
                              f"for {user.username} ({user.role})"))
    await session.commit()
    return ServiceTokenResponse(
        access_token=token, username=user.username, role=user.role,
        expires_at=datetime.now(UTC) + timedelta(minutes=minutes),
    )


@router.get("/users", response_model=list[UserOut])
async def list_users(session: SessionDep, _: RequireAdmin) -> list[User]:
    return list((await session.execute(select(User).order_by(User.username))).scalars().all())


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(write_rate_limit)])
async def create_user(payload: UserCreate, session: SessionDep,
                      admin: RequireAdmin) -> User:
    existing = (await session.execute(
        select(User).where(User.username == payload.username)
    )).scalars().first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"User {payload.username!r} already exists")
    user = User(username=payload.username, password_hash=hash_password(payload.password),
                role=payload.role)
    session.add(user)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="user_created",
                      message=f"{admin.username} created user {payload.username} "
                              f"with role {payload.role}"))
    await session.commit()
    await session.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_user(user_id: int, session: SessionDep, admin: RequireAdmin) -> None:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="You cannot delete your own account")
    remaining_admins = (await session.execute(
        select(User).where(User.role == Role.ADMIN.value, User.is_active.is_(True))
    )).scalars().all()
    if user.role == Role.ADMIN.value and len(remaining_admins) <= 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Cannot delete the last administrator")
    session.add(Event(projector_id=None, severity=Severity.WARNING.value, kind="user_deleted",
                      message=f"{admin.username} deleted user {user.username}"))
    await session.delete(user)
    await session.commit()
