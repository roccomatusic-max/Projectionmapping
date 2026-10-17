"""Background monitoring service.

Four polling tiers run independently so a slow diagnostic read never delays
the cheap connectivity probe. Every poll is submitted to the owning device
worker at MONITOR priority, so operator commands always jump ahead of it.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select

from app.config import settings
from app.core.events import bus
from app.core.lifecycle import stop_task, wait_or_stop
from app.db.models import Event, Projector, ProjectorState, Severity, Telemetry
from app.db.session import session_scope
from app.drivers import Availability, CommandOutcome, HealthSeverity, PowerState
from app.services.device_manager import Priority, manager

log = logging.getLogger(__name__)


#: Do not enqueue another poll when this many items are already waiting.
MAX_QUEUED_POLLS = 3


class Tier:
    CONNECTIVITY = "connectivity"
    OPERATIONAL = "operational"
    DIAGNOSTICS = "diagnostics"
    MAINTENANCE = "maintenance"


class MonitoringService:
    def __init__(self) -> None:
        self._tasks: list[asyncio.Task] = []
        self._running = False
        self._stop = asyncio.Event()
        self._last_poll: dict[tuple[int, str], float] = {}

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._stop = asyncio.Event()
        self._tasks = [
            asyncio.create_task(self._tier_loop(Tier.CONNECTIVITY, settings.poll_connectivity),
                                name="monitor-connectivity"),
            asyncio.create_task(self._tier_loop(Tier.OPERATIONAL, settings.poll_operational),
                                name="monitor-operational"),
            asyncio.create_task(self._tier_loop(Tier.DIAGNOSTICS, settings.poll_diagnostics),
                                name="monitor-diagnostics"),
            asyncio.create_task(self._tier_loop(Tier.MAINTENANCE, settings.poll_maintenance),
                                name="monitor-maintenance"),
            asyncio.create_task(self._retention_loop(), name="monitor-retention"),
        ]
        log.info("monitoring service started")

    async def stop(self) -> None:
        self._running = False
        self._stop.set()
        # Let each tier finish the poll it is persisting before cancelling.
        await asyncio.gather(
            *(stop_task(task, name=task.get_name()) for task in self._tasks),
            return_exceptions=True,
        )
        self._tasks.clear()

    # -- tier loops --------------------------------------------------------

    async def _tier_loop(self, tier: str, default_interval: int) -> None:
        # Stagger tiers so they do not all fire on the same second at boot.
        if await wait_or_stop(self._stop, {"connectivity": 1, "operational": 3,
                                           "diagnostics": 7, "maintenance": 11}.get(tier, 1)):
            return
        while self._running:
            started = time.monotonic()
            try:
                await self._run_tier(tier, default_interval)
            except asyncio.CancelledError:
                return
            except Exception:  # noqa: BLE001 - a bad cycle must not stop monitoring
                log.exception("monitor tier %s failed", tier)
            elapsed = time.monotonic() - started
            if await wait_or_stop(self._stop, max(1.0, default_interval - elapsed)):
                return

    async def _run_tier(self, tier: str, default_interval: int) -> None:
        workers = manager.workers
        if not workers:
            return
        # Spread devices across the interval so 25 projectors are not all
        # polled in the same 50ms.
        spacing = min(0.4, max(0.0, (default_interval * 0.5) / max(len(workers), 1)))
        tasks = []
        for index, worker in enumerate(workers):
            interval = self._interval_for(worker, tier, default_interval)
            interval = self._backoff(worker, interval)
            key = (worker.projector_id, tier)
            last = self._last_poll.get(key, 0.0)
            if time.monotonic() - last < interval:
                continue
            # The connectivity tier exists to notice a device going quiet.
            # One that answered an operational poll or an operator command
            # inside this interval has already proved it is there, and a
            # second round of the same queries would only sit in front of
            # the next GO. Liveness stays observed: this never extends the
            # staleness window, it only skips a question already answered.
            if tier == Tier.CONNECTIVITY and self._recently_answered(worker, interval):
                continue
            # An unreachable projector burns a full connect timeout per poll.
            # If its queue is already backed up, adding another poll only
            # delays the operator's next command behind it.
            if worker.queue_depth >= MAX_QUEUED_POLLS:
                log.debug("skipping %s poll for %s: queue depth %d",
                          tier, worker.name, worker.queue_depth)
                continue
            self._last_poll[key] = time.monotonic()
            tasks.append(self._poll_device(worker, tier, delay=index * spacing))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    @staticmethod
    def _interval_for(worker: Any, tier: str, default_interval: int) -> float:
        """Per-device override, clamped to a sane floor.

        A projector with a slow or rate-limited control interface can be
        polled less often without changing the global tier schedule. The
        floor stops a typo from turning a tier into a busy loop.
        """
        override = (worker.poll_overrides or {}).get(tier)
        if override is None:
            return float(default_interval)
        try:
            return max(5.0, float(override))
        except (TypeError, ValueError):
            log.warning("ignoring invalid poll override %r for %s/%s",
                        override, worker.name, tier)
            return float(default_interval)

    @staticmethod
    def _recently_answered(worker: Any, interval: float) -> bool:
        last = getattr(worker, "last_success_at", None)
        return last is not None and (time.time() - last) < interval

    @staticmethod
    def _backoff(worker: Any, interval: float) -> float:
        """Poll a failing device less often, up to a 60 s cap.

        Recovery is still noticed within a minute, but a projector that is
        powered down for the winter no longer costs a connect timeout every
        ten seconds.
        """
        failures = int(getattr(worker, "consecutive_failures", 0) or 0)
        if failures < settings.offline_threshold:
            return interval
        factor = 2 ** min(failures - settings.offline_threshold + 1, 3)
        return min(interval * factor, max(interval, 60.0))

    async def _poll_device(self, worker: Any, tier: str, delay: float = 0.0) -> None:
        if delay:
            await asyncio.sleep(delay)
        deep = tier in (Tier.DIAGNOSTICS, Tier.MAINTENANCE)
        future = worker.submit("status", {"deep": deep}, priority=Priority.MONITOR, job="status")
        try:
            result = await asyncio.wait_for(future, timeout=45.0)
        except TimeoutError:
            log.warning("poll of %s (%s) did not complete in 45s", worker.name, tier)
            return
        if result.outcome is not CommandOutcome.OK:
            return
        status = result.value
        await self.persist_status(worker, status, tier)

    # -- persistence -------------------------------------------------------

    async def persist_status(self, worker: Any, status: Any,
                             tier: str = Tier.OPERATIONAL) -> None:
        """Write a status snapshot to the database and publish it.

        Public because an on-demand refresh from the API takes the same path:
        a poll the operator triggered must update the stored state exactly as
        a scheduled one does, or the dashboard keeps showing stale data right
        after the operator asked for fresh data.
        """
        now = datetime.now(UTC)
        async with session_scope() as session:
            state = await session.get(ProjectorState, worker.projector_id)
            if state is None:
                state = ProjectorState(projector_id=worker.projector_id)
                session.add(state)

            previously_online = state.online
            previous_power = state.power

            state.online = status.online
            state.power = status.power.value
            state.shutter = status.shutter.value
            state.health = status.health.value
            state.active_input = status.active_input.as_dict()
            state.errors = list(status.errors)
            state.warnings = list(status.warnings)
            state.consecutive_failures = worker.consecutive_failures
            state.last_error = worker.last_error
            # The staleness window follows the interval this device is
            # actually polled at, so a deliberately slow-polled projector is
            # not flagged stale between its own polls.
            effective = self._interval_for(worker, Tier.OPERATIONAL, settings.poll_operational)
            state.stale_after = int(effective * settings.staleness_multiplier)
            if status.online:
                state.last_seen_at = now
            if tier in (Tier.DIAGNOSTICS, Tier.MAINTENANCE):
                state.lamp_hours = status.lamp_hours.as_dict()
                state.lamp_status = status.lamp_status.as_dict()
                state.error_status = status.error_status.as_dict()

            await self._write_telemetry(session, worker.projector_id, status, tier, now)
            await self._write_transitions(
                session, worker, status, previously_online, previous_power, now
            )

        bus.publish("projector_state", {
            "projector_id": worker.projector_id,
            "name": worker.name,
            "tier": tier,
            **status.as_dict(),
        })

    async def _write_telemetry(
        self, session, projector_id: int, status: Any, tier: str, now: datetime
    ) -> None:
        """Record numeric history. Only values the device actually gave us.

        Each metric is sampled by exactly one tier. The usage report turns
        power samples into hours by multiplying their count by the
        operational interval, so a power row from any other tier inflates
        the estimate (the connectivity tier alone would make it 2.5x). It
        also keeps the history table to a few thousand rows a day per
        projector instead of tens of thousands.
        """
        rows: list[Telemetry] = []
        if tier == Tier.OPERATIONAL:
            rows.append(Telemetry(projector_id=projector_id, metric="online",
                                  value_num=1.0 if status.online else 0.0, recorded_at=now))
            if status.power is not PowerState.UNKNOWN:
                rows.append(Telemetry(projector_id=projector_id, metric="power",
                                      value_num=1.0 if status.power is PowerState.ON else 0.0,
                                      value_text=status.power.value, recorded_at=now))
        if tier == Tier.MAINTENANCE and status.lamp_hours.availability is Availability.AVAILABLE:
            for lamp in status.lamp_hours.value or []:
                hours = lamp.get("hours")
                if hours is None:
                    continue
                rows.append(Telemetry(
                    projector_id=projector_id, metric=f"lamp{lamp.get('index', 1)}_hours",
                    value_num=float(hours), recorded_at=now,
                ))
        if tier == Tier.DIAGNOSTICS and status.health is not HealthSeverity.UNKNOWN:
            rows.append(Telemetry(projector_id=projector_id, metric="health",
                                  value_text=status.health.value, recorded_at=now))
        if rows:
            session.add_all(rows)

    async def _write_transitions(
        self, session, worker: Any, status: Any,
        previously_online: bool, previous_power: str, now: datetime,
    ) -> None:
        if previously_online and not status.online:
            session.add(Event(
                projector_id=worker.projector_id, severity=Severity.CRITICAL.value,
                kind="projector_offline",
                message=f"{worker.name} stopped responding",
                details={"last_error": worker.last_error,
                         "power_before": previous_power},
                created_at=now,
            ))
        elif not previously_online and status.online:
            session.add(Event(
                projector_id=worker.projector_id, severity=Severity.INFO.value,
                kind="projector_online",
                message=f"{worker.name} is responding again",
                created_at=now,
            ))
        if previous_power == PowerState.ON.value and status.power is PowerState.OFF:
            session.add(Event(
                projector_id=worker.projector_id, severity=Severity.WARNING.value,
                kind="power_off_observed",
                message=f"{worker.name} is now in standby",
                details={"note": "Observed by polling. If no operator or automation "
                                 "issued a power-off, treat this as an unexpected shutdown."},
                created_at=now,
            ))

    # -- retention ---------------------------------------------------------

    async def _retention_loop(self) -> None:
        """Prune history daily so the database does not grow without bound."""
        while self._running:
            if await wait_or_stop(self._stop, 3600 * 6):
                return
            try:
                await self._prune()
            except asyncio.CancelledError:
                return
            except Exception:  # noqa: BLE001
                log.exception("retention pruning failed")

    async def _prune(self) -> None:
        from app.db.models import CommandLog

        now = datetime.now(UTC)
        async with session_scope() as session:
            await session.execute(delete(Telemetry).where(
                Telemetry.recorded_at < now - timedelta(days=settings.telemetry_retention_days)
            ))
            await session.execute(delete(CommandLog).where(
                CommandLog.created_at < now - timedelta(days=settings.command_log_retention_days)
            ))
            await session.execute(delete(Event).where(
                Event.created_at < now - timedelta(days=settings.event_retention_days)
            ))


async def load_projectors() -> int:
    """Register every enabled projector with the device manager."""
    async with session_scope() as session:
        rows = (await session.execute(
            select(Projector).where(Projector.enabled.is_(True))
        )).scalars().all()
        registered = 0
        for record in rows:
            try:
                await manager.add(record)
                registered += 1
            except KeyError as exc:
                # A driver id that no longer exists (renamed, or hand-edited in
                # the database) must not take the whole service down with it.
                log.error("skipping projector %r: %s", record.name, exc)
    log.info("registered %d projector(s)", registered)
    return registered


monitor = MonitoringService()
