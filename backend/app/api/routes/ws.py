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

from app.api.routes.mapping_camera import PeopleFeed
from app.core.events import bus
from app.core.security import decode_access_token, token_predates
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
    if user is None or not user.is_active or token_predates(payload, user.created_at):
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

    people = PeopleFeed(user.id)

    async def receive() -> None:
        """Read client frames.

        Browsers send only keepalives and subscription hints. A camera
        sends who it sees, many times a second (``mapping_people_report``):
        over this open socket instead of a request each, which is quicker.
        Reading is required anyway: an unread receive buffer eventually
        stalls the connection.
        """
        while True:
            text = await websocket.receive_text()
            try:
                message = json.loads(text)
            except ValueError:
                continue
            if isinstance(message, dict) and message.get("type") == "mapping_people_report":
                try:
                    await people.report(message.get("payload"))
                except Exception:  # noqa: BLE001 - a bad report must not drop the feed
                    log.debug("people report failed", exc_info=True)

    # Subscribed inside the try: a client that drops before the greeting
    # is sent would otherwise leave its queue on the bus for good, filling
    # with every message published from then on.
    queue: asyncio.Queue | None = None
    tasks: list[asyncio.Task] = []
    try:
        queue = await bus.subscribe()
        await websocket.send_text(json.dumps({
            "type": "connected",
            "payload": {"username": user.username, "role": user.role,
                        # What this server accepts on the socket, for cameras.
                        "accepts": ["mapping_people_report"]},
            "at": datetime.now(UTC).isoformat(),
        }))

        tasks = [asyncio.create_task(coro()) for coro in (pump, heartbeat, receive)]
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
        if queue is not None:
            await bus.unsubscribe(queue)
        log.info("websocket disconnected: %s", user.username)
