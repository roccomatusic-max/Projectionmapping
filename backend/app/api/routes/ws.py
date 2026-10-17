"""WebSocket live-update channel.

Pushes projector state, command results and alerts to connected browsers.
Authentication is by the same JWT the REST API uses, passed as a query
parameter because browsers cannot set headers on a WebSocket handshake.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select

from app.core.events import bus
from app.core.security import decode_access_token
from app.db.models import Role, User
from app.db.session import SessionLocal

log = logging.getLogger(__name__)
router = APIRouter()

#: Heartbeat interval. Keeps intermediaries from idling the socket out and
#: lets the client notice a dead link quickly during a show.
PING_SECONDS = 25.0


async def _authenticate(token: str | None) -> User | None:
    if not token:
        return None
    payload = decode_access_token(token)
    if payload is None or not payload.get("sub"):
        return None
    async with SessionLocal() as session:
        user = (await session.execute(
            select(User).where(User.username == payload["sub"])
        )).scalars().first()
    if user is None or not user.is_active:
        return None
    # The live feed is read access to the whole fleet. An ingest-only
    # account (a sensor's token) may post readings and nothing else.
    try:
        if not Role(user.role).at_least(Role.VIEWER):
            return None
    except ValueError:
        return None
    return user


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket,
                             token: str | None = Query(default=None)) -> None:
    user = await _authenticate(token)
    if user is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION,
                              reason="Invalid or missing token")
        return

    await websocket.accept()
    queue = await bus.subscribe()
    log.info("websocket connected: %s", user.username)

    async def pump() -> None:
        """Forward bus messages to the client."""
        while True:
            message = await queue.get()
            await websocket.send_text(json.dumps(message.as_dict(), default=str))

    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(PING_SECONDS)
            await websocket.send_text(json.dumps({
                "type": "ping",
                "at": datetime.now(UTC).isoformat(),
            }))

    async def receive() -> None:
        """Drain client frames.

        The client sends only keepalives and subscription hints today, but
        reading is required: an unread receive buffer eventually stalls the
        connection.
        """
        while True:
            await websocket.receive_text()

    await websocket.send_text(json.dumps({
        "type": "connected",
        "payload": {"username": user.username, "role": user.role},
        "at": datetime.now(UTC).isoformat(),
    }))

    tasks = [asyncio.create_task(coro()) for coro in (pump, heartbeat, receive)]
    try:
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
        for task in pending:
            task.cancel()
        for task in done:
            exc = task.exception()
            if exc and not isinstance(exc, WebSocketDisconnect):
                log.debug("websocket task ended: %s", exc)
    except WebSocketDisconnect:
        pass
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await bus.unsubscribe(queue)
        log.info("websocket disconnected: %s", user.username)
