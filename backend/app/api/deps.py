"""Shared API dependencies: authentication, RBAC, and rate limiting."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token, token_predates
from app.db.models import Role, User
from app.db.session import get_session

bearer = HTTPBearer(auto_error=False)

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def current_user(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)] = None,
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(credentials.credentials)
    if payload is None or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = (await session.execute(
        select(User).where(User.username == payload["sub"])
    )).scalars().first()
    if user is None or not user.is_active or token_predates(payload, user.created_at):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="User no longer active")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def require_role(minimum: Role, *, extra_roles: tuple[Role, ...] = ()):
    """Dependency factory enforcing a minimum role.

    ``extra_roles`` admits roles that sit outside the viewer/operator/admin
    ladder for this one endpoint — the ingest role on the sensor endpoint.

    Authorization lives here, not in the UI. Hiding a button is a usability
    choice; this is the control.
    """

    async def _check(user: CurrentUser) -> User:
        try:
            role = Role(user.role)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Unrecognised role") from None
        if role in extra_roles:
            return user
        if not role.at_least(minimum):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires the '{minimum.value}' role or higher; "
                       f"you have '{role.value}'",
            )
        return user

    return _check


RequireViewer = Annotated[User, Depends(require_role(Role.VIEWER))]
RequireOperator = Annotated[User, Depends(require_role(Role.OPERATOR))]
RequireAdmin = Annotated[User, Depends(require_role(Role.ADMIN))]
#: Sensor uploads: operators and above, plus ingest-only accounts.
RequireIngest = Annotated[
    User, Depends(require_role(Role.OPERATOR, extra_roles=(Role.INGEST,)))
]


class _FixedWindow:
    """Fixed-window counter, per principal.

    In-process and therefore per-worker. That is sufficient here: this
    platform runs as a single API process on a private network, and the
    limiter exists to stop a runaway script from flooding a projector, not
    to defend an internet-facing edge.
    """

    __slots__ = ("limit", "window", "scope", "_hits")

    def __init__(self, limit: int, window: float, scope: str) -> None:
        self.limit = limit
        self.window = window
        self.scope = scope
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, principal: str) -> None:
        now = time.monotonic()
        hits = self._hits[principal]
        while hits and hits[0] < now - self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            retry_after = max(1, int(self.window - (now - hits[0])))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded: {self.limit} requests per "
                       f"{int(self.window)}s for {self.scope}",
                headers={"Retry-After": str(retry_after)},
            )
        hits.append(now)

    # Peek-and-record use, for counting failures (wrong passwords) rather
    # than requests: ``retry_after`` before the attempt, ``record`` after a
    # failed one.

    def retry_after(self, principal: str) -> int:
        """Seconds until ``principal`` is under the limit again; 0 if it is now."""
        hits = self._hits.get(principal)
        if not hits:
            return 0
        now = time.monotonic()
        while hits and hits[0] < now - self.window:
            hits.popleft()
        if len(hits) < self.limit:
            return 0
        return max(1, int(self.window - (now - hits[0])))

    def record(self, principal: str) -> None:
        if len(self._hits) > 10_000:
            # Principals here can be chosen by the caller (any sign-in name):
            # forget the idle ones so the table cannot grow without bound.
            cutoff = time.monotonic() - self.window
            for key in [k for k, v in self._hits.items() if not v or v[-1] < cutoff]:
                del self._hits[key]
        self._hits[principal].append(time.monotonic())

    def forget(self, principal: str) -> None:
        self._hits.pop(principal, None)


def rate_limiter(limit: int, window: float, scope: str):
    """Build a FastAPI dependency enforcing a per-user rate limit.

    Returns a plain function rather than a callable object: FastAPI resolves
    a dependency's string annotations through ``__globals__``, which an
    instance does not have, so a callable class would have its parameters
    misread as query parameters.
    """
    counter = _FixedWindow(limit, window, scope)

    async def dependency(user: CurrentUser) -> None:
        counter.check(f"{scope}:{user.username}")

    dependency.counter = counter  # type: ignore[attr-defined]
    return dependency


#: Commands are the expensive, hardware-touching path.
command_rate_limit = rate_limiter(limit=60, window=60.0, scope="command")
#: Writes to configuration are rarer and cheaper.
write_rate_limit = rate_limiter(limit=120, window=60.0, scope="write")


def require_confirmation(confirm: bool, action: str) -> None:
    """Reject a disruptive command that was not explicitly confirmed."""
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_428_PRECONDITION_REQUIRED,
            detail=(
                f"This command is disruptive ({action}). Re-send with "
                f'"confirm": true to acknowledge.'
            ),
        )
