"""In-process publish/subscribe bus.

Carries live state and command results from the background services to the
WebSocket handlers and the alerting service. Deliberately in-process: there
is exactly one API process per deployment, and introducing a broker here
would add an operational dependency for no benefit. The interface is narrow
enough that swapping in Redis pub/sub later touches only this file.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any

log = logging.getLogger(__name__)

#: A slow or wedged subscriber must never stall a poll loop. Once a
#: subscriber's queue is full its oldest messages are dropped.
QUEUE_MAXSIZE = 256


@dataclass(slots=True)
class BusMessage:
    type: str
    payload: dict[str, Any] = field(default_factory=dict)
    at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


class EventBus:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[BusMessage]] = set()
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue[BusMessage]:
        queue: asyncio.Queue[BusMessage] = asyncio.Queue(maxsize=QUEUE_MAXSIZE)
        async with self._lock:
            self._subscribers.add(queue)
        return queue

    async def unsubscribe(self, queue: asyncio.Queue[BusMessage]) -> None:
        async with self._lock:
            self._subscribers.discard(queue)

    def publish(self, type_: str, payload: dict[str, Any] | None = None) -> None:
        """Fan out without awaiting. Safe to call from any task."""
        message = BusMessage(type=type_, payload=payload or {})
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                # Drop the oldest rather than the newest: a disconnected
                # browser should not cost us the latest device state.
                try:
                    queue.get_nowait()
                    queue.put_nowait(message)
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    log.debug("dropping bus message for a saturated subscriber")

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)


bus = EventBus()
