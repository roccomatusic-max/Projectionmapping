"""Device manager: queue serialization, retry policy, verification, groups."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from app.drivers import CommandOutcome, PowerState, ShutterState
from app.services.device_manager import DeviceManager, DeviceWorker, Priority


def make_record(projector_id: int, port: int, name: str = "Test PJ",
                driver: str = "panasonic_pt_dz13k", **overrides):
    """A plain stand-in for an ORM Projector row."""
    data = dict(
        id=projector_id, name=name, driver=driver, host="127.0.0.1", port=port,
        username="admin1", password_enc=None, command_timeout=3.0, command_gap=0.0,
        allow_unverified_commands=False, poll_overrides={},
        lamp_warn_hours=2000, lamp_critical_hours=2500,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


@pytest.fixture
async def worker(panasonic_sim):
    w = DeviceWorker(make_record(1, panasonic_sim.actual_port))
    await w.start()
    try:
        yield w
    finally:
        await w.stop()


async def test_command_executes_through_the_queue(worker):
    result = await worker.execute("power.get")
    assert result.outcome is CommandOutcome.OK
    assert result.value is PowerState.OFF


async def test_commands_are_serialized_per_device(worker, panasonic_sim):
    """Concurrent submissions must not interleave on one socket.

    If framing interleaved, replies would be matched to the wrong requests
    and the shutter query would come back with a power value.
    """
    results = await asyncio.gather(*[
        worker.execute("power.get") for _ in range(12)
    ] + [
        worker.execute("shutter.get") for _ in range(12)
    ])
    powers = [r for r in results if r.capability == "power.get"]
    shutters = [r for r in results if r.capability == "shutter.get"]
    assert all(isinstance(r.value, PowerState) for r in powers)
    assert all(isinstance(r.value, ShutterState) for r in shutters)


async def test_user_commands_outrank_monitor_polls(panasonic_sim):
    """Priority ordering: an operator action must not queue behind polls."""
    w = DeviceWorker(make_record(2, panasonic_sim.actual_port))
    order: list[str] = []

    for _ in range(5):
        future = w.submit("power.get", priority=Priority.MONITOR)
        future.add_done_callback(lambda _f: order.append("monitor"))
    user_future = w.submit("power.get", priority=Priority.USER)
    user_future.add_done_callback(lambda _f: order.append("user"))

    await w.start()
    try:
        await asyncio.wait_for(user_future, timeout=10)
        await asyncio.sleep(0.2)
    finally:
        await w.stop()
    assert order[0] == "user", f"user command did not run first: {order}"


async def test_unsupported_capability_never_opens_a_socket(worker):
    result = await worker.execute("does.not.exist")
    assert result.outcome is CommandOutcome.UNSUPPORTED
    assert result.raw_response is None


async def test_gated_capability_explains_how_to_enable(worker):
    result = await worker.execute("lens.shift_h", {"direction": 1})
    assert result.outcome is CommandOutcome.UNSUPPORTED
    assert "allow unverified commands" in (result.error or "").lower()


async def test_power_command_is_not_retried_when_state_is_uncertain(
    panasonic_sim, sim_state
):
    """The core safety rule: never repeat a disruptive command blindly.

    Command 1 is the worker's QPW probe (answered); command 2 is PON, whose
    reply is withheld. The projector DID act; the controller cannot know.
    """
    sim_state.drop_reply_indices = {2}
    w = DeviceWorker(make_record(3, panasonic_sim.actual_port, command_timeout=0.4))
    await w.start()
    try:
        result = await w.execute("power.set", {"state": "on"}, timeout=20)
        assert result.outcome is CommandOutcome.TIMEOUT
        assert result.attempts == 1, "a power command must never be auto-retried"
        assert "not safe to repeat" in (result.error or "")
        assert sim_state.power.value in ("warming", "on"), "the projector did act"
    finally:
        await w.stop()


async def test_idempotent_query_is_retried(panasonic_sim, sim_state):
    """Sequence: probe(1) ok, QPW(2) lost, reconnect probe(3) ok, QPW(4) lost,
    reconnect probe(5) ok, QPW(6) ok — a read-only query keeps trying."""
    sim_state.drop_reply_indices = {2, 4}
    w = DeviceWorker(make_record(4, panasonic_sim.actual_port, command_timeout=0.3))
    await w.start()
    try:
        result = await w.execute("power.get", timeout=20)
        assert result.outcome is CommandOutcome.OK
        assert result.attempts == 3, "a read-only query should be retried"
    finally:
        await w.stop()


async def test_silent_device_is_a_clear_connection_failure(panasonic_sim, sim_state):
    """Accepts TCP, never answers: the operator gets the reason, not a dead socket."""
    sim_state.silent = True
    w = DeviceWorker(make_record(7, panasonic_sim.actual_port, command_timeout=0.3))
    await w.start()
    try:
        result = await w.execute("power.get", timeout=20)
        assert result.outcome is CommandOutcome.CONNECTION_ERROR
        assert "did not answer" in (result.error or "")
    finally:
        await w.stop()


async def test_power_change_is_verified_by_polling(panasonic_sim, sim_state):
    """An ack is not a confirmation; the worker reads the state back."""
    sim_state.warmup_seconds = 0.2
    w = DeviceWorker(make_record(5, panasonic_sim.actual_port))
    await w.start()
    try:
        result = await w.execute("power.set", {"state": "on"})
        assert result.outcome is CommandOutcome.ACCEPTED
        # Verification runs in the background; give it time to confirm.
        for _ in range(40):
            await asyncio.sleep(0.1)
            check = await w.execute("power.get")
            if check.value is PowerState.ON:
                break
        assert check.value is PowerState.ON
    finally:
        await w.stop()


async def test_unreachable_device_reports_connection_error():
    w = DeviceWorker(make_record(6, 1, name="Nowhere"))
    w.config.connect_timeout = 0.3
    await w.start()
    try:
        result = await w.execute("power.get", timeout=15)
        assert result.outcome is CommandOutcome.CONNECTION_ERROR
    finally:
        await w.stop()


async def test_input_board_rejection_retracts_only_that_input(worker, sim_state):
    """ER401 on SDI is durable knowledge about this unit.

    It must retract the *input*, not the whole input-selection capability —
    otherwise one unfitted board disables switching to every other source.
    """
    assert "SD1" not in sim_state.fitted_inputs
    result = await worker.execute("input.set", {"input": "SD1"})
    assert result.outcome is CommandOutcome.UNSUPPORTED
    caps = worker.driver.capabilities
    assert not caps.param_available("input.set", "SD1")
    assert "input.set" not in caps.retracted, "input selection must still work"

    # A fitted input still switches normally.
    assert (await worker.execute("input.set", {"input": "HD1"})).ok

    # And the known-absent input is now refused without touching the wire.
    again = await worker.execute("input.set", {"input": "SD1"})
    assert again.outcome is CommandOutcome.UNSUPPORTED
    assert again.raw_response is None


# -- group dispatch ---------------------------------------------------------


async def test_group_dispatch_reports_each_device_separately(panasonic_sim):
    """Three projectors, one unreachable: two successes and one named failure."""
    manager = DeviceManager()
    await manager.add(make_record(10, panasonic_sim.actual_port, name="House Left"))
    await manager.add(make_record(11, panasonic_sim.actual_port, name="House Centre"))
    broken = make_record(12, 1, name="House Right")
    await manager.add(broken)
    manager.get(12).config.connect_timeout = 0.3

    try:
        results = await manager.dispatch_many([10, 11, 12], "power.get", timeout=20)
        by_id = {r["projector_id"]: r for r in results}
        assert by_id[10]["outcome"] == CommandOutcome.OK.value
        assert by_id[11]["outcome"] == CommandOutcome.OK.value
        assert by_id[12]["outcome"] == CommandOutcome.CONNECTION_ERROR.value
        assert by_id[12]["name"] == "House Right"
        # A failure on one device must not invalidate the others.
        assert sum(1 for r in results if r["outcome"] == CommandOutcome.OK.value) == 2
    finally:
        await manager.shutdown()


async def test_group_dispatch_handles_unregistered_ids(panasonic_sim):
    manager = DeviceManager()
    await manager.add(make_record(20, panasonic_sim.actual_port))
    try:
        results = await manager.dispatch_many([20, 999], "power.get", timeout=20)
        by_id = {r["projector_id"]: r for r in results}
        assert by_id[20]["outcome"] == CommandOutcome.OK.value
        assert by_id[999]["outcome"] == CommandOutcome.CONNECTION_ERROR.value
        assert "not registered" in by_id[999]["error"]
    finally:
        await manager.shutdown()


async def test_group_dispatch_is_concurrent_not_sequential(panasonic_sim):
    """Six devices must dispatch in parallel, not one after another."""
    manager = DeviceManager()
    for pid in range(30, 36):
        await manager.add(make_record(pid, panasonic_sim.actual_port, name=f"PJ{pid}"))
    try:
        loop = asyncio.get_running_loop()
        started = loop.time()
        results = await manager.dispatch_many(list(range(30, 36)), "power.get", timeout=20)
        elapsed = loop.time() - started
        assert all(r["outcome"] == CommandOutcome.OK.value for r in results)
        assert elapsed < 3.0, f"dispatch took {elapsed:.2f}s; looks sequential"
    finally:
        await manager.shutdown()


async def test_re_adding_a_device_replaces_the_worker(panasonic_sim):
    manager = DeviceManager()
    first = await manager.add(make_record(40, panasonic_sim.actual_port, name="A"))
    second = await manager.add(make_record(40, panasonic_sim.actual_port, name="B"))
    try:
        assert first is not second
        assert manager.get(40).name == "B"
        assert len(manager.workers) == 1
    finally:
        await manager.shutdown()


async def test_worker_recovers_after_a_timeout(panasonic_sim, sim_state):
    """A timed-out query reconnects on retry and the next command succeeds."""
    sim_state.drop_reply_indices = {2}  # probe(1) ok, first QPW(2) lost
    w = DeviceWorker(make_record(50, panasonic_sim.actual_port, command_timeout=0.4))
    await w.start()
    try:
        first = await w.execute("power.get", timeout=20)
        # Idempotent query: retried on a fresh socket, so it ends up OK.
        assert first.outcome is CommandOutcome.OK
        assert first.attempts == 2
        second = await w.execute("shutter.get", timeout=20)
        assert second.ok
    finally:
        await w.stop()


async def test_idle_session_is_reconnected_before_a_command(pjlink_sim):
    """PJLink projectors drop idle sessions; the worker reconnects first."""
    w = DeviceWorker(make_record(51, pjlink_sim.actual_port, driver="pjlink"))
    await w.start()
    try:
        assert (await w.execute("power.get")).ok
        w.driver.config.idle_reconnect = 0.2
        await asyncio.sleep(0.4)
        before = w.driver._transport
        assert (await w.execute("power.get")).ok
        # Same transport object, but it was closed and reopened in between.
        assert w.driver._transport is before
        assert w.driver.connected
    finally:
        await w.stop()
