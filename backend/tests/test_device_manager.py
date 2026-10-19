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


async def test_projector_that_disconnects_after_every_reply_is_controllable(
    panasonic_sim, sim_state
):
    """Firmware that ends the session after each reply: the worker's auth
    probe uses up the first session, so the operator's command needs a new
    one. It used to go into the dead socket, every time."""
    sim_state.close_after_reply = True
    w = DeviceWorker(make_record(72, panasonic_sim.actual_port))
    await w.start()
    try:
        result = await w.execute("power.set", {"state": "on"}, timeout=20)
        assert result.outcome is CommandOutcome.ACCEPTED, result.error
        assert sim_state.power.value in ("warming", "on")
        poll = w.submit("status", {"deep": False}, priority=Priority.MONITOR, job="status")
        status = (await asyncio.wait_for(poll, timeout=20)).value
        assert status.online and status.shutter is ShutterState.OPEN
    finally:
        await w.stop()


async def test_a_command_whose_caller_gave_up_is_never_sent(panasonic_sim, sim_state):
    """A caller whose wait timed out was told the command did not reach the
    device. It must then never be sent: a shutter closing minutes after the
    operator was told it had not is worse than the timeout itself."""
    sim_state.drop_reply_indices = {2}  # probe(1) ok, PON(2) unanswered for 2 s
    w = DeviceWorker(make_record(70, panasonic_sim.actual_port, command_timeout=2.0))
    await w.start()
    try:
        busy = w.submit("power.set", {"state": "on"})
        await asyncio.sleep(0.1)
        late = await w.execute("shutter.set", {"state": "closed"}, timeout=0.5)
        assert late.outcome is CommandOutcome.TIMEOUT
        assert (await asyncio.wait_for(busy, timeout=10)).outcome is CommandOutcome.TIMEOUT
        # Queued behind the abandoned shutter command, so it runs after it.
        assert (await w.execute("shutter.get", timeout=10)).value is ShutterState.OPEN
        assert sim_state.shutter_closed is False
    finally:
        await w.stop()


async def test_stopping_a_worker_answers_every_caller(panasonic_sim, sim_state):
    """Editing or removing a projector stops its worker. The command in
    flight, one still queued and one submitted just after each get a result:
    not a cancelled future (CancelledError inside an HTTP handler) and not a
    wait for the whole timeout."""
    sim_state.drop_reply_indices = {2}  # PON's reply never comes
    w = DeviceWorker(make_record(71, panasonic_sim.actual_port, command_timeout=5.0))
    await w.start()
    in_flight = w.submit("power.set", {"state": "on"})
    await asyncio.sleep(1.0)  # connected, PON sent, waiting on its reply
    queued = w.submit("shutter.get")
    await w.stop()
    for future in (in_flight, queued, w.submit("power.get")):
        result = await asyncio.wait_for(future, timeout=1)
        assert result.outcome is CommandOutcome.CONNECTION_ERROR
        assert "removed or reconfigured" in (result.error or "")


async def test_unreachable_device_reports_connection_error():
    w = DeviceWorker(make_record(6, 1, name="Nowhere"))
    w.config.connect_timeout = 0.3
    await w.start()
    try:
        result = await w.execute("power.get", timeout=15)
        assert result.outcome is CommandOutcome.CONNECTION_ERROR
    finally:
        await w.stop()


@pytest.mark.parametrize("host", ["a" * 64 + ".example", "pj\x00one"])
async def test_a_host_name_the_resolver_cannot_encode_is_unreachable(host):
    """The schema only bounds the length. "Test connection" used to answer
    a 63+ character label, or a NUL, with a 500."""
    assert await DeviceManager().probe(host, 1024) is False
    w = DeviceWorker(make_record(73, 1024, host=host))
    await w.start()
    try:
        result = await w.execute("power.get", timeout=10)
        assert result.outcome is CommandOutcome.CONNECTION_ERROR
        assert f"connect to {host}" in (result.error or "")
    finally:
        await w.stop()


async def test_input_board_rejection_retracts_only_that_input(worker, sim_state):
    """ER401 on SDI is durable knowledge about this unit.

    It must retract the *input*, not the whole input-selection capability —
    otherwise one unfitted board disables switching to every other source.
    """
    assert "SD1" not in sim_state.fitted_inputs
    worker.driver.WARMUP_SECONDS = 0.0
    assert (await worker.execute("power.set", {"state": "on"})).ok
    await asyncio.sleep(0.5)  # simulated warm-up is 0.3 s
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


async def test_power_loss_via_cooling_is_reported(panasonic_sim):
    """PJLink reports on -> cooling -> off; the event must fire on the first step."""
    from app.core.events import bus
    from app.drivers import PowerState, ProjectorStatus

    w = DeviceWorker(make_record(60, panasonic_sim.actual_port))
    queue = await bus.subscribe()
    try:
        w._detect_transitions(ProjectorStatus(online=True, power=PowerState.ON),
                              ProjectorStatus(online=True, power=PowerState.COOLING))
        kinds = []
        while not queue.empty():
            kinds.append(queue.get_nowait())
        changed = [m for m in kinds if m.type == "power_changed"]
        assert changed and changed[0].payload["to"] == "off"
        assert changed[0].payload["observed"] == "cooling"
        # cooling -> off is the tail of the same event, not a second one.
        w._detect_transitions(ProjectorStatus(online=True, power=PowerState.COOLING),
                              ProjectorStatus(online=True, power=PowerState.OFF))
        again = [queue.get_nowait() for _ in range(queue.qsize())]
        assert not any(m.type == "power_changed" for m in again)
    finally:
        await bus.unsubscribe(queue)


async def test_mqtt_command_routes_through_the_device_manager(panasonic_sim, sim_state):
    from app.services.device_manager import manager
    from app.services.integration import mqtt_publisher

    record = make_record(61, panasonic_sim.actual_port, name="House Left")
    await manager.add(record)
    mqtt_publisher._slugs["house_left"] = 61
    try:
        result = await mqtt_publisher.handle_command("projector/house_left/shutter/set", "closed")
        assert result is not None and result["outcome"] == "accepted"
        assert sim_state.shutter_closed is True
        assert await mqtt_publisher.handle_command("projector/nobody/power/set", "on") is None
        assert await mqtt_publisher.handle_command("projector/house_left/power/set", "maybe") is None
    finally:
        await manager.remove(61)
        mqtt_publisher._slugs.pop("house_left", None)


# -- power held during cool-down ----------------------------------------------


@pytest.fixture
def fast_power_queue(monkeypatch):
    # The settings object the worker reads: other suites reload app.config.
    from app.services import device_manager

    settings = device_manager.settings
    monkeypatch.setattr(settings, "power_queue_interval", 0.1)
    monkeypatch.setattr(settings, "power_queue_seconds", 10.0)


async def _power_on_and_wait(worker, sim_state) -> None:
    worker.driver.WARMUP_SECONDS = 0.0
    assert (await worker.execute("power.set", {"state": "on"})).ok
    for _ in range(40):
        if sim_state.is_on:
            return
        await asyncio.sleep(0.05)
    raise AssertionError("simulated projector never came on")


async def test_power_on_during_cool_down_is_sent_by_itself(
    worker, sim_state, fast_power_queue
):
    """Rocco's case: power off, then power on straight away."""
    from app.core.events import bus

    sim_state.cooldown_seconds = 1.0
    await _power_on_and_wait(worker, sim_state)
    assert (await worker.execute("power.set", {"state": "off"})).ok

    queue = await bus.subscribe()
    try:
        held = await worker.execute("power.set", {"state": "on"})
        assert held.outcome is CommandOutcome.QUEUED
        assert "cooling down" in (held.error or "")
        assert "by itself" in (held.error or "")
        # Power commands are never retracted by a cool-down refusal.
        assert worker.driver.supports("power.set")

        for _ in range(60):
            if sim_state.is_on:
                break
            await asyncio.sleep(0.1)
        assert sim_state.is_on, "the held power-on was never sent"

        verified = []
        for _ in range(40):
            while not queue.empty():
                message = queue.get_nowait()
                if message.type == "command_verified" and message.payload["capability"] == "power.set":
                    verified.append(message)
            if verified:
                break
            await asyncio.sleep(0.1)
        assert verified, "the operator was never told the power-on happened"
    finally:
        await bus.unsubscribe(queue)


async def test_a_newer_power_command_replaces_the_held_one(
    worker, sim_state, fast_power_queue
):
    sim_state.cooldown_seconds = 2.0
    await _power_on_and_wait(worker, sim_state)
    assert (await worker.execute("power.set", {"state": "off"})).ok
    assert (await worker.execute("power.set", {"state": "on"})).outcome is CommandOutcome.QUEUED

    # Changed their mind: off again. The held power-on must not fire later.
    await worker.execute("power.set", {"state": "off"})
    await asyncio.sleep(2.5)
    assert not sim_state.is_on
    assert worker._power_queue is None


async def test_standby_refusals_leave_every_control_in_place(worker, sim_state):
    sim_state.standby_refuses_controls = True
    for code in ("HD1", "DVI", "SD1"):
        result = await worker.execute("input.set", {"input": code})
        assert result.outcome is CommandOutcome.BUSY
        assert "standby" in (result.error or "")
    shutter = await worker.execute("shutter.set", {"state": "closed"})
    assert shutter.outcome is CommandOutcome.BUSY
    caps = worker.driver.capabilities
    assert not caps.retracted and not caps.retracted_params


async def test_pjlink_power_on_during_cool_down_is_held_too(pjlink_sim, sim_state, fast_power_queue):
    """PJLink answers ERR3 while cooling; the same hold applies."""
    sim_state.cooldown_seconds = 1.0
    w = DeviceWorker(make_record(52, pjlink_sim.actual_port, driver="pjlink"))
    await w.start()
    try:
        sim_state.power_on()
        await asyncio.sleep(0.4)
        sim_state.power_off()
        held = await w.execute("power.set", {"state": "on"})
        assert held.outcome is CommandOutcome.QUEUED
        for _ in range(40):
            if sim_state.is_on:
                break
            await asyncio.sleep(0.1)
        assert sim_state.is_on
    finally:
        await w.stop()
