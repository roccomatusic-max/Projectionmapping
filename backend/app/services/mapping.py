"""Mapping transport: which cue is live, and since when.

The server owns the show clock. Output windows never decide on their own
what to play; they receive this state over the WebSocket feed, estimate
their offset to the server clock, and compute their media position from
``started_at_ms``. That is what keeps several windows on one cue together.

State is deliberately in memory. After a restart the show is stopped; a
show resuming by itself mid-cue after a crash is a worse surprise than a
dark building with an operator pressing GO.
"""

from __future__ import annotations

import asyncio
import logging
import time

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.events import bus
from app.db.models import MappingCue, MappingShow, MediaAsset
from app.db.session import session_scope
from app.schemas.mapping import TransportCue, TransportState

log = logging.getLogger(__name__)


class TransportError(Exception):
    """A transport request that cannot be carried out as asked."""


def now_ms() -> float:
    return time.time() * 1000.0


class MappingTransport:
    def __init__(self) -> None:
        self._state = TransportState()
        self._lock = asyncio.Lock()
        self._follow_task: asyncio.Task | None = None

    # -- reading -----------------------------------------------------------

    def snapshot(self) -> TransportState:
        state = self._state.model_copy(deep=True)
        state.server_time_ms = now_ms()
        return state

    # -- commands ----------------------------------------------------------

    async def command(self, action: str, *, show_id: int | None = None,
                      cue: int | None = None) -> TransportState:
        async with self._lock:
            match action:
                case "go":
                    await self._go(show_id, None)
                case "goto":
                    if cue is None:
                        raise TransportError("goto needs a cue position")
                    await self._go(show_id, cue)
                case "pause":
                    self._pause()
                case "resume":
                    self._resume()
                case "stop":
                    self._reset(status="stopped")
                case "blackout":
                    self._reset(status="blackout")
                case _:
                    raise TransportError(f"unknown transport action {action!r}")
            return self._publish()

    async def show_deleted(self, show_id: int) -> None:
        async with self._lock:
            if self._state.show_id == show_id:
                self._reset(status="stopped")
                self._publish()

    async def stop_service(self) -> None:
        self._cancel_follow()

    # -- internals ---------------------------------------------------------

    async def _go(self, show_id: int | None, position: int | None) -> None:
        target_show = show_id if show_id is not None else self._state.show_id
        if target_show is None:
            raise TransportError("no show is loaded; pass show_id")
        async with session_scope() as session:
            show = (await session.execute(
                select(MappingShow).where(MappingShow.id == target_show)
                .options(selectinload(MappingShow.cues))
            )).scalars().first()
            if show is None:
                raise TransportError(f"show {target_show} not found")
            cues = list(show.cues)
            if not cues:
                raise TransportError(f"show {show.name!r} has no cues")
            if position is None:
                same_show = self._state.show_id == show.id and self._state.current
                position = (self._state.current.position + 1) if same_show else 0
                if position >= len(cues):
                    raise TransportError("already on the last cue")
            if position >= len(cues):
                raise TransportError(
                    f"cue {position} does not exist; {show.name!r} has {len(cues)}"
                )
            cue = cues[position]
            duration = None
            if cue.media_id is not None:
                asset = await session.get(MediaAsset, cue.media_id)
                duration = asset.duration if asset and asset.kind == "video" else None

        start = now_ms()
        crossfade = (
            self._state.show_id == show.id
            and self._state.status == "playing"
            and self._state.current is not None
            and cue.fade_seconds > 0
        )
        self._state.previous = self._state.current if crossfade else None
        self._state.fade_started_at_ms = start if crossfade else None
        self._state.current = _cue_out(cue, position, start)
        self._state.show_id = show.id
        self._state.status = "playing"
        self._state.paused_position = None
        self._schedule_follow(cue, position, duration, len(cues))

    def _pause(self) -> None:
        if self._state.status != "playing" or self._state.current is None:
            raise TransportError("nothing is playing")
        self._cancel_follow()
        self._state.paused_position = (now_ms() - self._state.current.started_at_ms) / 1000.0
        self._state.previous = None
        self._state.fade_started_at_ms = None
        self._state.status = "paused"

    def _resume(self) -> None:
        if self._state.status != "paused" or self._state.current is None:
            raise TransportError("the show is not paused")
        position = self._state.paused_position or 0.0
        self._state.current.started_at_ms = now_ms() - position * 1000.0
        self._state.paused_position = None
        self._state.status = "playing"

    def _reset(self, *, status: str) -> None:
        self._cancel_follow()
        show_id = self._state.show_id
        revision = self._state.revision
        self._state = TransportState(show_id=show_id, status=status, revision=revision)

    def _publish(self) -> TransportState:
        self._state.revision += 1
        snapshot = self.snapshot()
        bus.publish("mapping_transport", snapshot.model_dump())
        return snapshot

    # -- auto-follow -------------------------------------------------------

    def _schedule_follow(self, cue: MappingCue, position: int,
                         duration: float | None, cue_count: int) -> None:
        """Advance on our own when the cue says how long it lasts."""
        self._cancel_follow()
        hold = cue.follow_seconds
        if hold is None and not cue.loop and duration:
            hold = duration
        if hold is None or position + 1 >= cue_count:
            return
        revision = self._state.revision + 1  # the revision _publish is about to set

        async def follow() -> None:
            await asyncio.sleep(hold)
            if self._state.revision != revision or self._state.status != "playing":
                return
            try:
                await self.command("go")
            except TransportError as exc:
                log.info("auto-follow stopped: %s", exc)

        self._follow_task = asyncio.create_task(follow())

    def _cancel_follow(self) -> None:
        task, self._follow_task = self._follow_task, None
        if task and not task.done() and task is not asyncio.current_task():
            task.cancel()


def _cue_out(cue: MappingCue, position: int, started_at_ms: float) -> TransportCue:
    return TransportCue(
        id=cue.id, position=position, name=cue.name, media_id=cue.media_id,
        fit=cue.fit, loop=cue.loop, fade_seconds=cue.fade_seconds,
        interaction=cue.interaction or "none", started_at_ms=started_at_ms,
    )


transport = MappingTransport()
