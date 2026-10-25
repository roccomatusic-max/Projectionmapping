"""Monitoring: steady health between poll tiers, poll economy, telemetry volume."""

from __future__ import annotations

import asyncio
import time
from types import SimpleNamespace

import pytest

from app.drivers import Availability, CommandOutcome, HealthSeverity, PowerState
from app.services.device_manager import DeviceWorker, Priority
from app.services.monitor import MonitoringService, Tier
from tests.test_api import add_projector, api, login  # noqa: F401 - fixture
from tests.test_device_manager import make_record


async def _poll(worker: DeviceWorker, *, deep: bool):
    future = worker.submit("status", {"deep": deep}, priority=Priority.MONITOR, job="status")
    result = await asyncio.wait_for(future, timeout=10)
    assert result.outcome is CommandOutcome.OK
    return result.value


@pytest.fixture
async def pjlink_worker(pjlink_sim):
    w = DeviceWorker(make_record(7, pjlink_sim.actual_port, driver="pjlink"))
    await w.start()
    try:
        yield w
    finally:
        await w.stop()


# -- health does not flicker between tiers ----------------------------------


async def test_shallow_poll_keeps_the_fault_the_deep_poll_found(pjlink_worker, sim_state):
    """%1ERST is only read by the deep tiers. The operational poll a few
    seconds later must not reset a fan fault to 'unknown' until the next
    diagnostics poll rediscovers it."""
    sim_state.erst = [2, 0, 0, 0, 0, 0]

    deep = await _poll(pjlink_worker, deep=True)
    assert deep.health is HealthSeverity.ERROR
    assert "fan: error" in deep.errors

    shallow = await _poll(pjlink_worker, deep=False)
    assert shallow.health is HealthSeverity.ERROR
    assert shallow.errors == ["fan: error"]
    assert shallow.error_status.availability is Availability.AVAILABLE
    assert shallow.error_status.value["fan"] == "error"
    assert shallow.lamp_hours.availability is Availability.AVAILABLE
    # What the shallow poll did read is its own, not a copy.
    assert shallow.power is PowerState.OFF
    assert pjlink_worker.snapshot().status.health is HealthSeverity.ERROR


async def test_next_deep_poll_clears_a_fault_that_went_away(pjlink_worker, sim_state):
    sim_state.erst = [2, 0, 0, 0, 0, 0]
    await _poll(pjlink_worker, deep=True)
    sim_state.erst = [0, 0, 0, 0, 0, 0]
    await _poll(pjlink_worker, deep=False)
    assert pjlink_worker.status.health is HealthSeverity.ERROR, "still the last known state"
    cleared = await _poll(pjlink_worker, deep=True)
    assert cleared.health is HealthSeverity.OK
    assert cleared.errors == []
    assert (await _poll(pjlink_worker, deep=False)).health is HealthSeverity.OK


async def test_shallow_poll_before_any_deep_poll_claims_nothing(pjlink_worker, sim_state):
    sim_state.erst = [2, 0, 0, 0, 0, 0]
    shallow = await _poll(pjlink_worker, deep=False)
    assert shallow.health is HealthSeverity.UNKNOWN
    assert shallow.error_status.availability is not Availability.AVAILABLE


async def test_going_offline_forgets_the_deep_findings(pjlink_worker, sim_state, monkeypatch):
    sim_state.erst = [2, 0, 0, 0, 0, 0]
    await _poll(pjlink_worker, deep=True)

    async def dead(*, deep=False):
        raise OSError("connection reset by peer")

    monkeypatch.setattr(pjlink_worker.driver, "get_status", dead)
    offline = await _poll(pjlink_worker, deep=False)
    assert offline.online is False
    assert offline.health is HealthSeverity.UNKNOWN
    assert offline.error_status.availability is not Availability.AVAILABLE
    monkeypatch.undo()
    # Back online: nothing is claimed until a deep poll reads it again.
    assert (await _poll(pjlink_worker, deep=False)).health is HealthSeverity.UNKNOWN
    assert (await _poll(pjlink_worker, deep=True)).health is HealthSeverity.ERROR


async def test_a_status_read_that_raises_still_reports_the_outage(pjlink_worker, monkeypatch):
    """Every way of going offline publishes projector_offline; the alerting
    service opens the offline alert from that event and nothing else."""
    from app.core.events import bus

    assert (await _poll(pjlink_worker, deep=False)).online
    queue = await bus.subscribe()

    async def dead(*, deep=False):
        raise OSError("connection reset by peer")

    monkeypatch.setattr(pjlink_worker.driver, "get_status", dead)
    try:
        assert (await _poll(pjlink_worker, deep=False)).online is False
        published = [queue.get_nowait() for _ in range(queue.qsize())]
        offline = [m for m in published if m.type == "projector_offline"]
        assert offline and offline[0].payload["projector_id"] == pjlink_worker.projector_id
    finally:
        await bus.unsubscribe(queue)


# -- a poll in progress steps aside for an operator command -----------------


@pytest.fixture
async def slow_worker(panasonic_sim):
    """Real-world Panasonic pacing: 0.6 s between frames, so a deep poll
    (six queries) holds the socket for about three seconds."""
    w = DeviceWorker(make_record(9, panasonic_sim.actual_port, command_gap=0.6))
    await w.start()
    try:
        yield w
    finally:
        await w.stop()


async def test_operator_command_does_not_wait_for_a_poll_to_finish(slow_worker):
    poll = slow_worker.submit("status", {"deep": True}, priority=Priority.MONITOR, job="status")
    await asyncio.sleep(0.9)  # the poll is one or two queries in
    started = time.monotonic()
    result = await slow_worker.execute("power.get", timeout=10)
    waited = time.monotonic() - started
    assert result.outcome is CommandOutcome.OK
    # Bound: the query in flight, one 50 ms slice, then its own 0.6 s gap.
    assert waited < 0.9, f"operator command waited {waited:.2f}s behind the poll"
    # The poll was not lost: it completes after the command, in full.
    status = (await asyncio.wait_for(poll, timeout=15)).value
    assert status.online
    assert status.lamp_hours.availability is Availability.AVAILABLE


async def test_poll_is_not_starved_by_a_stream_of_commands(slow_worker):
    poll = slow_worker.submit("status", {"deep": False}, priority=Priority.MONITOR, job="status")
    for _ in range(6):
        await asyncio.sleep(0.3)
        await slow_worker.execute("power.get", timeout=10)
    status = (await asyncio.wait_for(poll, timeout=15)).value
    assert status.online


async def test_monitor_polls_are_not_preempted_by_each_other(slow_worker):
    first = slow_worker.submit("status", {"deep": False}, priority=Priority.MONITOR, job="status")
    await asyncio.sleep(0.3)
    second = slow_worker.submit("status", {"deep": False}, priority=Priority.MONITOR, job="status")
    results = await asyncio.wait_for(asyncio.gather(first, second), timeout=15)
    assert all(r.outcome is CommandOutcome.OK and r.value.online for r in results)


# -- the connectivity tier does not re-ask what was just answered -----------


def _fake_worker(projector_id: int, last_success_at: float | None):
    return SimpleNamespace(projector_id=projector_id, name=f"pj{projector_id}",
                           poll_overrides={}, consecutive_failures=0, queue_depth=0,
                           last_success_at=last_success_at)


@pytest.fixture
def tier_runner(monkeypatch):
    """A MonitoringService whose polls are recorded instead of sent."""
    service = MonitoringService()
    polled: list[tuple[int, str]] = []

    async def record(worker, tier, delay=0.0):
        polled.append((worker.projector_id, tier))

    monkeypatch.setattr(service, "_poll_device", record)

    def workers(*ws):
        import app.services.monitor as monitor_module
        monkeypatch.setattr(monitor_module.manager.__class__, "workers",
                            property(lambda self: list(ws)))

    return service, polled, workers


async def test_connectivity_poll_is_skipped_for_a_device_that_just_answered(tier_runner):
    service, polled, workers = tier_runner
    fresh = _fake_worker(1, time.time() - 2)
    quiet = _fake_worker(2, time.time() - 30)
    never = _fake_worker(3, None)
    workers(fresh, quiet, never)

    await service._run_tier(Tier.CONNECTIVITY, 10)
    assert sorted(polled) == [(2, Tier.CONNECTIVITY), (3, Tier.CONNECTIVITY)]


async def test_operational_poll_still_runs_for_a_device_that_just_answered(tier_runner):
    """Only connectivity is a repeat question; the other tiers read more."""
    service, polled, workers = tier_runner
    workers(_fake_worker(1, time.time() - 2))
    await service._run_tier(Tier.OPERATIONAL, 15)
    await service._run_tier(Tier.DIAGNOSTICS, 60)
    assert polled == [(1, Tier.OPERATIONAL), (1, Tier.DIAGNOSTICS)]


async def test_a_skipped_connectivity_poll_is_not_remembered_as_done(tier_runner):
    """Once the device falls quiet, the very next cycle must poll it, not
    wait out an interval that was never actually spent polling."""
    service, polled, workers = tier_runner
    worker = _fake_worker(1, time.time())
    workers(worker)
    await service._run_tier(Tier.CONNECTIVITY, 10)
    assert polled == []
    worker.last_success_at = time.time() - 60
    await service._run_tier(Tier.CONNECTIVITY, 10)
    assert polled == [(1, Tier.CONNECTIVITY)]


# -- telemetry is sampled by one tier each ----------------------------------


async def test_only_the_operational_tier_writes_power_history(api):  # noqa: F811
    """The usage report assumes one power sample per operational interval.
    A sample from every tier would count each minute two and a half times."""
    import app.services.monitor as monitor_module
    from app.services.device_manager import manager

    headers = await login(api)
    pid = await add_projector(api, headers)
    worker = manager.get(pid)
    assert worker is not None
    status = await _poll(worker, deep=True)
    assert status.online

    async def rows():
        response = await api.get(f"/api/projectors/{pid}/telemetry", headers=headers)
        assert response.status_code == 200, response.text
        return sorted(p["metric"] for p in response.json()["points"])

    await monitor_module.monitor.persist_status(worker, status, Tier.CONNECTIVITY)
    assert await rows() == []

    await monitor_module.monitor.persist_status(worker, status, Tier.OPERATIONAL)
    assert await rows() == ["online", "power"]

    # The deep poll also records one temperature sample per sensor.
    temperatures = ["temp_exhaust", "temp_intake", "temp_optics"]
    await monitor_module.monitor.persist_status(worker, status, Tier.DIAGNOSTICS)
    assert await rows() == ["health", "online", "power", *temperatures]

    # The maintenance tier adds lamp hours only, not a second temperature set.
    await monitor_module.monitor.persist_status(worker, status, Tier.MAINTENANCE)
    lamps = [m for m in await rows() if m.startswith("lamp")]
    assert lamps
    assert sorted(set(await rows()) - set(lamps)) == ["health", "online", "power", *temperatures]
    assert len([m for m in await rows() if m.startswith("temp_")]) == 3

    # Every tier still updates the live state the dashboard reads.
    shown = (await api.get(f"/api/projectors/{pid}", headers=headers)).json()
    assert shown["state"]["online"] is True


async def test_standby_is_logged_once_after_a_cooling_step(api):  # noqa: F811
    """PJLink goes on -> cooling -> standby. The "now in standby" event used
    to need on -> standby in one step, so it never appeared for PJLink."""
    import app.services.monitor as monitor_module
    from app.drivers import ProjectorStatus
    from app.services.device_manager import manager

    await monitor_module.monitor.stop()  # no scheduled poll in between
    headers = await login(api)
    pid = await add_projector(api, headers)
    worker = manager.get(pid)
    for power in (PowerState.ON, PowerState.COOLING, PowerState.OFF, PowerState.OFF):
        await monitor_module.monitor.persist_status(
            worker, ProjectorStatus(online=True, power=power), Tier.OPERATIONAL)
    events = (await api.get(f"/api/events?projector_id={pid}&kind=power_off_observed",
                            headers=headers)).json()
    assert len(events) == 1
