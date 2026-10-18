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
from collections.abc import Iterable
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
        #: Each subscriber's queue, and the message types it takes (None: all).
        self._subscribers: dict[asyncio.Queue[BusMessage], frozenset[str] | None] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, types: Iterable[str] | None = None) -> asyncio.Queue[BusMessage]:
        """A queue of every message, or of only those of ``types``.

        A service that acts on a few types should name them. The bus also
        carries camera reports up to 60 times a second; queued for a service
        that is busy (a slow webhook, a locked database) they would push the
        messages it does act on, a projector going offline, out of its queue.
        """
        queue: asyncio.Queue[BusMessage] = asyncio.Queue(maxsize=QUEUE_MAXSIZE)
        async with self._lock:
            self._subscribers[queue] = frozenset(types) if types is not None else None
        return queue

    async def unsubscribe(self, queue: asyncio.Queue[BusMessage]) -> None:
        async with self._lock:
            self._subscribers.pop(queue, None)

    def publish(self, type_: str, payload: dict[str, Any] | None = None) -> None:
        """Fan out without awaiting. Safe to call from any task."""
        message = BusMessage(type=type_, payload=payload or {})
        for queue, types in list(self._subscribers.items()):
            if types is not None and type_ not in types:
                continue
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
