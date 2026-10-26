"""Walk the yard: check every projector in turn, from the phone.

Someone walks around the house with the phone remote. Each mini PC's
projector in turn shows its ID test picture (its name, a crosshair, corners
and focus marks over the canvas grid) while every other projector in the
walk is black, so there is no doubt which one is lit. On the phone they
tap Looks good, or Something's wrong and what (blurry, off target, too
dark, the wrong projector lit up, nothing showing), then the next one
lights up. At the end every projector goes back to what it showed before,
and the walk is saved as an event: Tonight's show says when the projectors
were last checked and how they looked.

A walk never gets in the way of a show. Starting one while a show plays is
refused unless the phone asked to stop the show first; the show starting
(by hand, from the calendar or an automation) or the emergency stop ends
the walk where it is, and so does nobody tapping for a while. The test
pictures it set are put back even when the server restarts mid-walk: the
outputs' earlier pictures are saved with the walk's start.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import secrets
import time

from sqlalchemy import select

from app.core.events import bus
from app.db.models import Event, MappingOutput, MappingPlayer, Projector, Severity, utcnow
from app.db.session import session_scope
from app.schemas.walkthrough import WalkPicture, WalkState, WalkStop

log = logging.getLogger(__name__)

#: Ends a walk nobody has tapped on for this long, so a forgotten one never
#: leaves the house showing grids at show time.
IDLE_SECONDS = 20 * 60

STARTED = "walkthrough_started"
FINISHED = "walkthrough"

PROBLEM_LABEL = {
    "blurry": "blurry",
    "off_target": "off target",
    "dark": "too dark",
    "wrong_projector": "wrong projector lit up",
    "nothing": "nothing showing",
    "other": "something else",
}


class WalkError(Exception):
    """A walk request that cannot be done; the message is for the phone."""

    def __init__(self, message: str, *, status: int = 409) -> None:
        super().__init__(message)
        self.status = status


def summary(state: WalkState) -> str:
    """One line for the logs and Tonight's show."""
    checked = [s for s in state.stops if s.result]
    wrong = [s for s in checked if s.result == "wrong"]
    total = len(state.stops)
    if wrong:
        parts = []
        for stop in wrong:
            what = ", ".join(PROBLEM_LABEL[p] for p in stop.problems) or stop.note or "something's wrong"
            parts.append(f"{label(stop)} ({what})")
        found = f"{len(wrong)} of {total} need a look: " + "; ".join(parts)
    elif checked and len(checked) == total:
        found = "all good" if total == 1 else f"all {total} looked good"
    elif checked:
        found = f"{len(checked)} of {total} looked good"
    else:
        found = "nothing checked"
    if state.status == "stopped" and len(checked) < total:
        return f"Walk the yard stopped early ({state.reason or 'stopped'}): {found}"
    return f"Walk the yard: {found}"


def label(stop: WalkStop) -> str:
    return stop.projector_name or stop.output_name or stop.name


class Walkthrough:
    def __init__(self) -> None:
        self.active: WalkState | None = None
        #: Each output's test picture before the walk, to put back afterwards.
        self.previous: dict[int, str] = {}
        self._touched = 0.0
        self._lock = asyncio.Lock()
        self._task: asyncio.Task | None = None

    # -- reading -----------------------------------------------------------

    async def last(self) -> WalkState | None:
        async with session_scope() as session:
            event = (await session.execute(
                select(Event).where(Event.kind == FINISHED).order_by(Event.id.desc()).limit(1)
            )).scalars().first()
        if event is None:
            return None
        try:
            return WalkState.model_validate(event.details or {})
        except ValueError:
            return None

    # -- the walk ------------------------------------------------------------

    async def start(self, *, by: str, stop_show: bool) -> WalkState:
        from app.services.mapping import transport

        async with self._lock:
            if self.active is not None:
                self._touched = time.monotonic()
                return self.active
            state = transport.snapshot()
            if state.emergency is not None:
                raise WalkError("The emergency stop is on. Clear it first, then walk the yard.")
            if state.status in ("playing", "paused"):
                if not stop_show:
                    raise WalkError("The show is playing. Stop it to walk the yard.")
                await transport.command("stop")

            async with session_scope() as session:
                rows = (await session.execute(
                    select(MappingPlayer, MappingOutput)
                    .join(MappingOutput, MappingOutput.id == MappingPlayer.output_id)
                    .where(MappingPlayer.approved.is_(True), MappingPlayer.kind == "player")
                    .order_by(MappingOutput.show_id, MappingOutput.position, MappingPlayer.name)
                )).all()
                if not rows:
                    raise WalkError("No mini PC has a projector to show yet. "
                                    "Pair one on Mapping → Players first.", status=400)
                projector_ids = {o.projector_id for _, o in rows if o.projector_id is not None}
                names = dict((await session.execute(
                    select(Projector.id, Projector.name).where(Projector.id.in_(projector_ids))
                )).all()) if projector_ids else {}
                stops = [WalkStop(player_id=p.id, name=p.name, output_id=o.id, output_name=o.name,
                                  projector_id=o.projector_id, projector_name=names.get(o.projector_id))
                         for p, o in rows]
                previous = {o.id: (o.test_pattern or "none") for _, o in rows}
                walk = WalkState(id=secrets.token_hex(6), started_at=utcnow(), started_by=by,
                                 stops=stops)
                session.add(Event(projector_id=None, kind=STARTED,
                                  message=f"Walk the yard started by {by}: {len(stops)} "
                                          f"projector{'' if len(stops) == 1 else 's'} to check",
                                  details={"walk": walk.model_dump(mode="json"),
                                           "previous": {str(k): v for k, v in previous.items()}}))
                await session.commit()
            self.active, self.previous = walk, previous
            self._touched = time.monotonic()
            await self._light()
            return walk

    async def answer(self, index: int, result: str, problems: list[str], note: str) -> WalkState:
        async with self._lock:
            walk = self._walking(index)
            stop = walk.stops[index]
            stop.result = result  # type: ignore[assignment]
            stop.problems = list(dict.fromkeys(problems)) if result == "wrong" else []  # type: ignore[assignment]
            stop.note = note.strip() if result == "wrong" else ""
            stop.checked_at = utcnow()
            following = next((i for i in range(index + 1, len(walk.stops))
                              if walk.stops[i].result is None), None)
            if following is None:
                following = next((i for i, s in enumerate(walk.stops) if s.result is None), None)
            if following is None:
                return await self._finish("done", None)
            walk.index, walk.picture = following, "id"
            await self._light()
            return walk

    async def go_to(self, index: int) -> WalkState:
        async with self._lock:
            walk = self._walking(index)
            walk.index, walk.picture = index, "id"
            await self._light()
            return walk

    async def show_picture(self, picture: WalkPicture) -> WalkState:
        async with self._lock:
            walk = self._walking(None)
            walk.picture = picture
            await self._light()
            return walk

    async def stop(self, reason: str) -> WalkState | None:
        async with self._lock:
            if self.active is None:
                return None
            return await self._finish("stopped", reason)

    def _walking(self, index: int | None) -> WalkState:
        if self.active is None:
            raise WalkError("No walk is going on. Start one from the phone.")
        if index is not None and index >= len(self.active.stops):
            raise WalkError("That projector is not on this walk.", status=400)
        self._touched = time.monotonic()
        return self.active

    async def _finish(self, status: str, reason: str | None) -> WalkState:
        walk = self.active
        assert walk is not None
        walk.status = status  # type: ignore[assignment]
        walk.reason = reason
        walk.finished_at = utcnow()
        await self._set(dict(self.previous))
        self.active, self.previous = None, {}
        wrong = any(s.result == "wrong" for s in walk.stops)
        async with session_scope() as session:
            session.add(Event(projector_id=None, kind=FINISHED, message=summary(walk),
                              severity=(Severity.WARNING if wrong else Severity.INFO).value,
                              details=walk.model_dump(mode="json")))
            await session.commit()
        bus.publish("walkthrough", {"active": False})
        return walk

    async def _light(self) -> None:
        """The stop being checked shows its test picture; every other one is black."""
        walk = self.active
        assert walk is not None
        current = walk.stops[walk.index].output_id
        patterns = {s.output_id: "black" for s in walk.stops}
        patterns[current] = walk.picture
        await self._set(patterns)
        bus.publish("walkthrough", {"active": True, "index": walk.index})

    async def _set(self, patterns: dict[int, str]) -> None:
        """Give outputs these test pictures, and tell their windows and mini PCs."""
        from app.api.routes.mapping import _output_out

        async with session_scope() as session:
            outputs = (await session.execute(
                select(MappingOutput).where(MappingOutput.id.in_(patterns)))).scalars().all()
            changed = [o for o in outputs if o.test_pattern != patterns[o.id]]
            for output in changed:
                output.test_pattern = patterns[output.id]
            if not changed:
                return
            await session.commit()
            ids = [o.id for o in changed]
            players = (await session.execute(
                select(MappingPlayer.id).where(MappingPlayer.output_id.in_(ids)))).scalars().all()
            for output in changed:
                await session.refresh(output)
                bus.publish("mapping_output", {"show_id": output.show_id,
                                               "output": _output_out(output).model_dump(mode="json")})
        for player_id in players:
            bus.publish("mapping_player", {"player_id": player_id})

    # -- keeping it out of the show's way -------------------------------------

    async def restore(self) -> None:
        """At start-up: put back the test pictures of a walk the server stopped during."""
        async with session_scope() as session:
            started = (await session.execute(
                select(Event).where(Event.kind == STARTED).order_by(Event.id.desc()).limit(1)
            )).scalars().first()
            if started is None:
                return
            finished = (await session.execute(
                select(Event).where(Event.kind == FINISHED, Event.id > started.id).limit(1)
            )).scalars().first()
        if finished is not None:
            return
        details = started.details or {}
        try:
            walk = WalkState.model_validate(details.get("walk") or {})
            previous = {int(k): str(v) for k, v in (details.get("previous") or {}).items()}
        except (TypeError, ValueError):
            log.warning("could not read the unfinished walk to put its test pictures back")
            return
        async with self._lock:
            self.active, self.previous = walk, previous
            await self._finish("stopped", "the server restarted")

    async def start_service(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._watch(), name="walkthrough")

    async def stop_service(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    async def _watch(self) -> None:
        queue = await bus.subscribe(["mapping_transport"])
        try:
            while True:
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=30)
                except TimeoutError:
                    message = None
                if self.active is None:
                    continue
                try:
                    await self._check(message.payload if message else None)
                except Exception:  # never let one bad check end the watch
                    log.exception("walk the yard: could not check the show")
        finally:
            await bus.unsubscribe(queue)

    async def _check(self, transport: dict | None) -> None:
        if transport is not None:
            if transport.get("emergency"):
                await self.stop("the emergency stop was pressed")
            elif transport.get("status") == "playing":
                await self.stop("the show started")
        elif time.monotonic() - self._touched > IDLE_SECONDS:
            await self.stop(f"nobody tapped for {IDLE_SECONDS // 60} minutes")


walkthrough = Walkthrough()
