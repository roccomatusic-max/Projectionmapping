"""Graceful stop for background loops.

Cancelling a task in the middle of a SQLite write leaves the driver's worker
thread to report back to an event loop that has since closed. Every
background service therefore polls a stop event between items and is given a
short grace period to finish the item it is on before being cancelled.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging

log = logging.getLogger(__name__)

GRACE_SECONDS = 5.0


async def stop_task(task: asyncio.Task | None, *, name: str,
                    grace: float = GRACE_SECONDS) -> None:
    """Wait up to ``grace`` for ``task`` to exit on its own, then cancel it."""
    if task is None or task.done():
        return
    try:
        await asyncio.wait_for(asyncio.shield(task), timeout=grace)
        return
    except TimeoutError:
        log.warning("%s did not stop within %.0fs; cancelling", name, grace)
    except Exception:  # noqa: BLE001 - the task's own error, already logged there
        return
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError, Exception):  # shutdown path
        await task


async def wait_or_stop(stop: asyncio.Event, seconds: float) -> bool:
    """Sleep for ``seconds`` unless ``stop`` is set first. True if stopping."""
    try:
        await asyncio.wait_for(stop.wait(), timeout=max(0.0, seconds))
        return True
    except TimeoutError:
        return False
