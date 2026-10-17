"""Device manager: one owner, one connection, one queue per projector.

This is the only module that talks to drivers. Everything else — API routes,
the monitor, automations — submits work here and gets a
:class:`~app.drivers.base.CommandResult` back.

The invariant that makes the platform safe is that **exactly one worker task
owns each projector**. Commands and polls for a device all pass through that
worker's queue, so two commands can never interleave on one socket, and a poll
can never land in the middle of a power sequence.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Any

from app.config import settings
from app.core.events import bus
from app.drivers import (
    CommandOutcome,
    CommandResult,
    ConnectionConfig,
    HealthSeverity,
    PollPreempted,
    PowerState,
    ProjectorDriver,
    ProjectorStatus,
    ShutterState,
)
from app.drivers import (
    build as build_driver,
)
from app.drivers.transport import TransportError, probe_tcp

log = logging.getLogger(__name__)


class Priority(IntEnum):
    """Lower sorts first. Operator intent always outranks housekeeping."""

    USER = 0
    AUTOMATION = 1
    VERIFY = 2
    MONITOR = 3


@dataclass(order=True)
class _QueueItem:
    priority: int
    sequence: int
    capability: str = field(compare=False)
    params: dict = field(compare=False, default_factory=dict)
    future: asyncio.Future = field(compare=False, default=None)  # type: ignore[assignment]
    #: Set for internal work (status polls) that is not a capability call.
    job: str | None = field(compare=False, default=None)
    #: How many times this poll has stepped aside for an operator command.
    preempted: int = field(compare=False, default=0)


@dataclass(slots=True)
class DeviceSnapshot:
    """What the manager knows about a device right now."""

    projector_id: int
    name: str
    status: ProjectorStatus
    connected: bool
    last_success_at: float | None
    consecutive_failures: int
    last_error: str | None

    def is_live(self, stale_after: float) -> bool:
        """Liveness is observed, not remembered.

        A snapshot older than the staleness window is not "online" however
        good the last poll was.
        """
        if self.last_success_at is None:
            return False
        return (time.time() - self.last_success_at) <= stale_after


class DeviceWorker:
    """Owns one projector: its driver, its socket and its command queue."""

    def __init__(self, record: Any) -> None:
        # ``record`` is an app.db.models.Projector, copied into plain fields so
        # the worker never touches a detached ORM object from another session.
        self.projector_id: int = record.id
        self.name: str = record.name
        self.driver_id: str = record.driver
        #: Per-device polling interval overrides, keyed by tier name.
        self.poll_overrides: dict[str, float] = dict(record.poll_overrides or {})
        self.lamp_warn_hours: int = record.lamp_warn_hours
        self.lamp_critical_hours: int = record.lamp_critical_hours
        self.config = self._config_from(record)
        self.driver: ProjectorDriver = build_driver(self.driver_id, self.config)

        self._queue: asyncio.PriorityQueue[_QueueItem] = asyncio.PriorityQueue()
        self._sequence = 0
        #: Operator and automation items waiting in the queue. A status poll
        #: in progress checks this between its queries and steps aside.
        self._urgent_waiting = 0
        self._task: asyncio.Task | None = None
        self._running = False
        #: Background state-verification tasks, cancelled on stop so a worker
        #: teardown never leaves a poll running against a closed transport.
        self._verifications: set[asyncio.Task] = set()

        self.status = ProjectorStatus()
        #: The last deep read while the device has stayed online. Shallow
        #: polls do not ask for lamp hours or %1ERST, so without this a
        #: fan fault reported by the diagnostics poll would vanish from the
        #: status fifteen seconds later and reappear a minute after that.
        self._deep_status: ProjectorStatus | None = None
        self.last_success_at: float | None = None
        self.consecutive_failures = 0
        self.last_error: str | None = None
        #: Exponential backoff so an unreachable projector is not hammered.
        self._reconnect_delay = 1.0
        self._max_reconnect_delay = 60.0

    @staticmethod
    def _config_from(record: Any) -> ConnectionConfig:
        from app.core.security import decrypt_secret

        gap = record.command_gap
        if gap is None:
            gap = (settings.pjlink_command_gap if record.driver == "pjlink"
                   else settings.panasonic_command_gap)
        return ConnectionConfig(
            host=record.host,
            port=record.port,
            username=record.username,
            password=decrypt_secret(record.password_enc),
            timeout=record.command_timeout or settings.command_timeout,
            connect_timeout=settings.connect_timeout,
            command_gap=gap,
            allow_unverified_commands=record.allow_unverified_commands,
            label=record.name,
        )

    # -- lifecycle ---------------------------------------------------------

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run(), name=f"device-{self.projector_id}")

    async def stop(self) -> None:
        self._running = False
        for task in list(self._verifications):
            task.cancel()
        if self._verifications:
            await asyncio.gather(*self._verifications, return_exceptions=True)
            self._verifications.clear()
        if self._task:
            self._task.cancel()
            # Shutdown path: whatever the worker was doing, it is going away.
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._task
            self._task = None
        await self._safe_disconnect()

    async def _safe_disconnect(self) -> None:
        try:
            await self.driver.disconnect()
        except Exception:  # noqa: BLE001 - never let teardown raise
            log.debug("disconnect failed for %s", self.name, exc_info=True)

    # -- submission --------------------------------------------------------

    def submit(
        self,
        capability: str,
        params: Mapping[str, Any] | None = None,
        *,
        priority: Priority = Priority.USER,
        job: str | None = None,
    ) -> asyncio.Future:
        """Enqueue work. Returns a future resolving to a CommandResult."""
        loop = asyncio.get_running_loop()
        future: asyncio.Future = loop.create_future()
        self._enqueue(_QueueItem(
            priority=int(priority), sequence=0,
            capability=capability, params=dict(params or {}),
            future=future, job=job,
        ))
        return future

    def _enqueue(self, item: _QueueItem) -> None:
        self._sequence += 1
        item.sequence = self._sequence
        if item.priority <= Priority.AUTOMATION:
            self._urgent_waiting += 1
        self._queue.put_nowait(item)

    def _urgent_is_waiting(self) -> bool:
        return self._urgent_waiting > 0

    async def execute(
        self,
        capability: str,
        params: Mapping[str, Any] | None = None,
        *,
        priority: Priority = Priority.USER,
        timeout: float = 120.0,
    ) -> CommandResult:
        future = self.submit(capability, params, priority=priority)
        try:
            return await asyncio.wait_for(future, timeout=timeout)
        except TimeoutError:
            return CommandResult(
                capability=capability, outcome=CommandOutcome.TIMEOUT,
                error=f"command did not reach the device within {timeout}s "
                      f"(queue depth {self._queue.qsize()})",
            )

    @property
    def queue_depth(self) -> int:
        return self._queue.qsize()

    # -- worker loop -------------------------------------------------------

    async def _run(self) -> None:
        while self._running:
            try:
                item = await self._queue.get()
            except asyncio.CancelledError:
                return
            if item.priority <= Priority.AUTOMATION:
                self._urgent_waiting -= 1
            try:
                result = await self._handle(item)
            except asyncio.CancelledError:
                if item.future and not item.future.done():
                    item.future.cancel()
                raise
            except Exception as exc:  # noqa: BLE001 - a bad command must not kill the worker
                log.exception("worker error on %s", self.name)
                result = CommandResult(
                    capability=item.capability,
                    outcome=CommandOutcome.CONNECTION_ERROR,
                    error=f"internal driver error: {exc}",
                )
            finally:
                self._queue.task_done()
            if result is None:
                continue  # the poll stepped aside and is back in the queue
            if item.future and not item.future.done():
                item.future.set_result(result)

    #: A poll steps aside this many times at most, so a stream of operator
    #: commands cannot starve monitoring indefinitely.
    MAX_PREEMPTIONS = 3

    async def _handle(self, item: _QueueItem) -> CommandResult | None:
        if item.job == "status":
            deep = bool(item.params.get("deep"))
            # Let the poll step aside for an operator command at any of its
            # command boundaries. A GO must not wait for the rest of a
            # lamp-hours read; the poll runs again once the command is out.
            try:
                status = await self._poll(
                    deep=deep, preemptible=item.preempted < self.MAX_PREEMPTIONS
                )
            except PollPreempted:
                item.preempted += 1
                self._enqueue(item)
                return None
            return CommandResult(
                capability="status", outcome=CommandOutcome.OK, value=status
            )

        # Gate before connecting: an unsupported command must not even open a
        # socket, and must be distinguishable from a device-side refusal.
        if not self.driver.supports(item.capability):
            cap = self.driver.capabilities.get(item.capability)
            if cap is None:
                reason = self.driver.capabilities.retracted.get(
                    item.capability,
                    f"{item.capability!r} is not supported by {self.driver.display_name}",
                )
            else:
                reason = (
                    f"{item.capability!r} is gated as {cap.provenance.value}. "
                    f"{cap.caveat or ''} Enable 'allow unverified commands' on this "
                    f"device to send it."
                ).strip()
            return CommandResult(
                capability=item.capability, outcome=CommandOutcome.UNSUPPORTED, error=reason
            )

        connected = await self._ensure_connection()
        if not connected:
            return CommandResult(
                capability=item.capability, outcome=CommandOutcome.CONNECTION_ERROR,
                error=self.last_error or "could not connect to the projector",
            )

        result = await self.driver.execute_supported_command(item.capability, item.params)
        result = await self._retry_if_appropriate(item, result)
        self._record_outcome(result)

        if result.outcome is CommandOutcome.CONNECTION_ERROR:
            await self._safe_disconnect()

        # Capability discovery: a device-side "unsupported" is durable
        # knowledge about this unit, so stop offering the control.
        #
        # Only for capabilities that take no parameter. When a parameterised
        # command is refused the refusal is about *that parameter* — an SDI
        # input with no board fitted answers ER401 — and retracting the whole
        # capability would disable input switching entirely. Drivers handle
        # per-parameter retraction themselves (see PanasonicPTDZ13KDriver.
        # set_input), because only they know the parameter vocabulary.
        if result.outcome is CommandOutcome.UNSUPPORTED and result.raw_response:
            cap = self.driver.capabilities.get(item.capability)
            parameterised = bool(cap and (cap.params or cap.value_range))
            if not parameterised:
                self.driver.capabilities.retract(
                    item.capability,
                    f"projector rejected this command as unsupported "
                    f"({result.raw_response})",
                )

        if result.ok:
            await self._verify_state_change(item, result)

        bus.publish("command_result", {
            "projector_id": self.projector_id,
            "name": self.name,
            **result.as_dict(),
        })
        return result

    async def _retry_if_appropriate(
        self, item: _QueueItem, result: CommandResult
    ) -> CommandResult:
        """Retry policy.

        Queries retry on a timeout. Disruptive commands never do: when the
        device's final state is uncertain the correct response is to *ask*,
        not to send the command again and risk doing it twice.
        """
        if not result.outcome.state_is_uncertain:
            return result
        cap = self.driver.capabilities.get(item.capability)
        if cap is None or not cap.idempotent or cap.disruptive:
            if cap and (cap.disruptive or not cap.idempotent):
                result.error = (
                    f"{result.error or result.outcome.value}. Not retried automatically: "
                    f"this command is not safe to repeat when the device state is unknown. "
                    f"The next status poll will resolve the actual state."
                )
            return result

        for attempt in (2, 3):
            if not await self._ensure_connection():
                break
            retry = await self.driver.execute_supported_command(item.capability, item.params)
            retry.attempts = attempt
            if not retry.outcome.state_is_uncertain:
                return retry
            result = retry
        return result

    async def _verify_state_change(self, item: _QueueItem, result: CommandResult) -> None:
        """Confirm a state change by reading it back.

        Panasonic's own documentation says to confirm PON/POF with QPW rather
        than trusting the acknowledgement, and the same discipline applies to
        shutter and input. Verification runs as a background task so the
        caller is not blocked for the length of a lamp warm-up.
        """
        cap = self.driver.capabilities.get(item.capability)
        if cap is None or not cap.verify_with:
            return
        task = asyncio.create_task(
            self._run_verification(item.capability, item.params, cap.verify_with),
            name=f"verify-{self.projector_id}-{item.capability}",
        )
        self._verifications.add(task)
        task.add_done_callback(self._verifications.discard)

    async def _run_verification(
        self, capability: str, params: Mapping[str, Any], verify_with: str
    ) -> None:
        if not self._running:
            return
        expected = self._expected_state(capability, params)
        attempts = settings.power_verify_attempts if capability == "power.set" else 5
        delay = settings.power_verify_delay

        for attempt in range(attempts):
            await asyncio.sleep(delay)
            if not self._running:
                return  # worker shutting down; silence is not a failed verify
            check = await self.execute(verify_with, priority=Priority.VERIFY, timeout=30.0)
            if not check.ok:
                continue
            actual = check.value
            if expected is None:
                break
            if self._matches(actual, expected):
                bus.publish("command_verified", {
                    "projector_id": self.projector_id, "name": self.name,
                    "capability": capability, "outcome": CommandOutcome.CONFIRMED.value,
                    "state": str(expected), "after_seconds": round((attempt + 1) * delay, 1),
                })
                return
            # A projector in warm-up or cooling has not failed; keep waiting.
            if isinstance(actual, PowerState) and actual.is_transitional:
                continue

        bus.publish("command_unverified", {
            "projector_id": self.projector_id, "name": self.name,
            "capability": capability,
            "message": (
                f"Command was acknowledged but {verify_with} did not report "
                f"{expected} within {round(attempts * delay)}s. The projector may still "
                f"be transitioning, or the command may not have taken effect."
            ),
        })

    @staticmethod
    def _expected_state(capability: str, params: Mapping[str, Any]) -> Any:
        match capability:
            case "power.set":
                return PowerState.ON if str(params.get("state")).lower() == "on" else PowerState.OFF
            case "shutter.set":
                return (ShutterState.CLOSED if str(params.get("state")).lower() == "closed"
                        else ShutterState.OPEN)
            case "input.set":
                return str(params.get("input", "")).upper()
        return None

    @staticmethod
    def _matches(actual: Any, expected: Any) -> bool:
        if isinstance(expected, PowerState | ShutterState):
            return actual == expected
        if isinstance(actual, dict):
            return str(actual.get("code", "")).upper() == str(expected).upper()
        return str(actual).upper() == str(expected).upper()

    # -- connection --------------------------------------------------------

    async def _ensure_connection(self) -> bool:
        if self.driver.connected:
            threshold = self.driver.idle_reconnect_after
            if threshold and self.driver.idle_seconds > threshold:
                # The far end has probably dropped a session this quiet.
                # Reconnect now rather than letting an operator command find
                # the dead socket.
                await self._safe_disconnect()
            else:
                return True
        try:
            await self.driver.connect()
            await self.driver.authenticate()
        except TransportError as exc:
            self.last_error = str(exc)
            await self._safe_disconnect()
            return False
        except Exception as exc:  # noqa: BLE001
            self.last_error = f"{type(exc).__name__}: {exc}"
            await self._safe_disconnect()
            return False
        self._reconnect_delay = 1.0
        return True

    def _record_outcome(self, result: CommandResult) -> None:
        if result.outcome in (CommandOutcome.CONNECTION_ERROR, CommandOutcome.TIMEOUT):
            self.consecutive_failures += 1
            self.last_error = result.error
        elif result.ok:
            self.consecutive_failures = 0
            self.last_success_at = time.time()
            self.last_error = None

    # -- polling -----------------------------------------------------------

    async def _poll(self, *, deep: bool = False,
                    preemptible: bool = False) -> ProjectorStatus:
        if not await self._ensure_connection():
            self.consecutive_failures += 1
            self._deep_status = None
            previous = self.status
            self.status = ProjectorStatus(online=False)
            self.status.errors = [self.last_error or "unreachable"]
            if previous.online:
                bus.publish("projector_offline", {
                    "projector_id": self.projector_id, "name": self.name,
                    "error": self.last_error,
                    "was_powered": previous.power.value,
                })
            return self.status

        # Only the status read itself may step aside. Connecting and
        # authenticating never do, so a half-opened session is never left
        # behind for the operator command to find.
        self.driver.yield_to = self._urgent_is_waiting if preemptible else None
        try:
            status = await self.driver.get_status(deep=deep)
        except PollPreempted:
            raise
        except Exception as exc:  # noqa: BLE001
            self.consecutive_failures += 1
            self.last_error = f"status read failed: {exc}"
            await self._safe_disconnect()
            self._deep_status = None
            self.status = ProjectorStatus(online=False, errors=[self.last_error])
            return self.status
        finally:
            self.driver.yield_to = None

        previous = self.status
        if status.online:
            self.consecutive_failures = 0
            self.last_success_at = time.time()
            self.last_error = None
            if deep:
                self._deep_status = status
            else:
                self._carry_deep_fields(status)
        else:
            self.consecutive_failures += 1
            # A device that dropped off may come back in another state; the
            # next deep poll re-reads it rather than trusting old findings.
            self._deep_status = None
        self.status = status

        self._detect_transitions(previous, status)
        return status

    #: Read only by deep polls, so a shallow poll keeps the last deep value.
    _DEEP_FIELDS = (
        "lamp_hours", "lamp_status", "error_status", "filter_usage",
        "manufacturer", "model", "serial_number", "firmware",
        "temperature", "fan", "input_signal", "resolution",
    )

    def _carry_deep_fields(self, status: ProjectorStatus) -> None:
        """Fill a shallow status with what the last deep poll found.

        Health, errors and warnings come along only when the shallow read
        has nothing of its own to say (health UNKNOWN): a driver that
        derives health from every poll keeps its own verdict.
        """
        deep = self._deep_status
        if deep is None:
            return
        for name in self._DEEP_FIELDS:
            setattr(status, name, getattr(deep, name))
        if status.health is HealthSeverity.UNKNOWN and deep.health is not HealthSeverity.UNKNOWN:
            status.health = deep.health
            status.errors = list(deep.errors)
            status.warnings = list(deep.warnings)

    def _detect_transitions(self, before: ProjectorStatus, after: ProjectorStatus) -> None:
        if before.online and not after.online:
            bus.publish("projector_offline", {
                "projector_id": self.projector_id, "name": self.name,
                "was_powered": before.power.value,
            })
        elif not before.online and after.online:
            bus.publish("projector_online", {
                "projector_id": self.projector_id, "name": self.name,
            })
        powered = (PowerState.ON, PowerState.WARMING)
        unpowered = (PowerState.OFF, PowerState.COOLING)
        if before.power in powered and after.power in unpowered:
            # Left the powered state between two polls. PJLink reports a
            # cooling step on the way down and Panasonic does not; both are
            # the same event to the operator, so both are reported as "off".
            bus.publish("power_changed", {
                "projector_id": self.projector_id, "name": self.name,
                "from": before.power.value, "to": "off",
                "observed": after.power.value,
            })

    def snapshot(self) -> DeviceSnapshot:
        return DeviceSnapshot(
            projector_id=self.projector_id, name=self.name, status=self.status,
            connected=self.driver.connected, last_success_at=self.last_success_at,
            consecutive_failures=self.consecutive_failures, last_error=self.last_error,
        )


class DeviceManager:
    """Registry of device workers. The process's single point of hardware access."""

    def __init__(self) -> None:
        self._workers: dict[int, DeviceWorker] = {}
        self._lock = asyncio.Lock()

    def __contains__(self, projector_id: object) -> bool:
        return projector_id in self._workers

    def get(self, projector_id: int) -> DeviceWorker | None:
        return self._workers.get(projector_id)

    @property
    def workers(self) -> list[DeviceWorker]:
        return list(self._workers.values())

    async def add(self, record: Any) -> DeviceWorker:
        """Register (or re-register) a projector.

        Re-registration replaces the worker wholesale so a changed IP or
        password cannot leave a stale socket behind.
        """
        async with self._lock:
            existing = self._workers.pop(record.id, None)
            if existing:
                await existing.stop()
            worker = DeviceWorker(record)
            self._workers[record.id] = worker
            await worker.start()
            return worker

    async def remove(self, projector_id: int) -> None:
        async with self._lock:
            worker = self._workers.pop(projector_id, None)
        if worker:
            await worker.stop()

    async def shutdown(self) -> None:
        async with self._lock:
            workers = list(self._workers.values())
            self._workers.clear()
        await asyncio.gather(*(w.stop() for w in workers), return_exceptions=True)

    # -- group dispatch ----------------------------------------------------

    async def dispatch_many(
        self,
        projector_ids: list[int],
        capability: str,
        params: Mapping[str, Any] | None = None,
        *,
        priority: Priority = Priority.USER,
        timeout: float = 60.0,
    ) -> list[dict[str, Any]]:
        """Dispatch one capability to many projectors concurrently.

        This is **concurrent dispatch, not synchronised playback**: commands
        leave within a few milliseconds of each other, but when each projector
        acts on it depends on that unit. Frame-accurate synchronisation is a
        property of the media server, not of this control path.

        Returns one result per projector. A failure on one device never
        prevents or invalidates the others.
        """
        async def one(pid: int) -> dict[str, Any]:
            worker = self._workers.get(pid)
            if worker is None:
                return {
                    "projector_id": pid, "name": None,
                    "outcome": CommandOutcome.CONNECTION_ERROR.value,
                    "error": "projector is not registered or is disabled",
                }
            result = await worker.execute(
                capability, params, priority=priority, timeout=timeout
            )
            return {"projector_id": pid, "name": worker.name, **result.as_dict()}

        results = await asyncio.gather(
            *(one(pid) for pid in projector_ids), return_exceptions=True
        )
        normalised: list[dict[str, Any]] = []
        for pid, result in zip(projector_ids, results, strict=False):
            if isinstance(result, BaseException):
                normalised.append({
                    "projector_id": pid,
                    "outcome": CommandOutcome.CONNECTION_ERROR.value,
                    "error": f"dispatch raised: {result}",
                })
            else:
                normalised.append(result)
        return normalised

    async def probe(self, host: str, port: int) -> bool:
        return await probe_tcp(host, port, timeout=settings.connect_timeout)


manager = DeviceManager()
