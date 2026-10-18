"""PJLink driver: standard protocol, class probing, error mapping."""

from __future__ import annotations

import hashlib

import pytest

from app.drivers import Availability, CommandOutcome, ConnectionConfig, PowerState, ShutterState
from app.drivers.pjlink import PJLinkDriver, pjlink_digest
from simulator import PJLinkSimulator


def test_pjlink_digest_is_seed_then_password():
    assert pjlink_digest("12345678", "secret") == \
        hashlib.md5(b"12345678secret").hexdigest()


def test_parse_erst_maps_six_subsystems():
    assert PJLinkDriver.parse_erst("012000") == {
        "fan": "ok", "lamp": "warning", "temperature": "error",
        "cover": "ok", "filter": "ok", "other": "ok",
    }


def test_parse_erst_rejects_short_payload():
    """A truncated reply must yield nothing, not a partial clean bill."""
    assert PJLinkDriver.parse_erst("01") == {}


def test_parse_lamp_pairs():
    assert PJLinkDriver.parse_lamp("1240 1 1238 0") == [
        {"index": 1, "hours": 1240, "on": True},
        {"index": 2, "hours": 1238, "on": False},
    ]


def test_parse_lamp_ignores_malformed_tokens():
    assert PJLinkDriver.parse_lamp("abc 1") == []


async def test_power_query_maps_all_four_states(pjlink_driver, sim_state):
    assert (await pjlink_driver.get_power_state()).value is PowerState.OFF

    sim_state.warmup_seconds = 5.0
    await pjlink_driver.set_power_state(True)
    assert (await pjlink_driver.get_power_state()).value is PowerState.WARMING

    # Expire the in-flight transition rather than shortening warmup_seconds:
    # the deadline is fixed when the transition starts, as on real hardware.
    sim_state._transition_ends = 0.0
    assert (await pjlink_driver.get_power_state()).value is PowerState.ON

    sim_state.cooldown_seconds = 5.0
    await pjlink_driver.set_power_state(False)
    assert (await pjlink_driver.get_power_state()).value is PowerState.COOLING


async def test_avmt_maps_to_shutter(pjlink_driver, sim_state):
    await pjlink_driver.set_shutter(closed=True)
    assert sim_state.shutter_closed is True
    assert (await pjlink_driver.get_shutter_state()).value is ShutterState.CLOSED

    await pjlink_driver.set_shutter(closed=False)
    assert (await pjlink_driver.get_shutter_state()).value is ShutterState.OPEN


@pytest.mark.parametrize(("capability", "params"), [
    ("power.set", {}),
    ("power.set", {"state": 1}),
    ("shutter.set", {"state": "close"}),
])
async def test_missing_or_misspelled_state_is_refused_not_guessed(
    pjlink_driver, sim_state, capability, params
):
    sim_state.shutter_closed = True
    result = await pjlink_driver.execute_supported_command(capability, params)
    assert result.outcome is CommandOutcome.REJECTED
    assert result.raw_response is None
    assert sim_state.shutter_closed is True


async def test_input_code_validated_before_dispatch(pjlink_driver):
    result = await pjlink_driver.set_input("HDMI1")
    assert result.outcome is CommandOutcome.REJECTED
    assert result.raw_response is None  # never sent
    assert "family digit" in (result.error or "")


async def test_erst_drives_health_and_warnings(pjlink_driver, sim_state):
    sim_state.erst = [0, 1, 2, 0, 0, 0]
    status = await pjlink_driver.get_status(deep=True)
    assert status.health.value == "error"
    assert "temperature: error" in status.errors
    assert "lamp: warning" in status.warnings


async def test_class2_probed_and_enabled(pjlink_driver):
    assert pjlink_driver.supports("info.serial")
    result = await pjlink_driver.execute_supported_command("info.serial")
    assert result.ok


async def test_class1_projector_retracts_class2_capabilities(sim_state):
    """A class 1 projector must not be offered class 2 queries."""
    simulator = PJLinkSimulator(sim_state, host="127.0.0.1", port=0, pjlink_class=1)
    await simulator.start()
    driver = PJLinkDriver(ConnectionConfig(
        host="127.0.0.1", port=simulator.actual_port, command_gap=0.0, timeout=3.0
    ))
    try:
        await driver.connect()
        assert driver._pjlink_class == 1
        assert not driver.supports("info.serial")
        status = await driver.get_status(deep=True)
        assert status.serial_number.availability is Availability.UNSUPPORTED
        assert "class 2" in (status.serial_number.note or "")
    finally:
        await driver.disconnect()
        await simulator.stop()


async def test_temperature_is_unsupported_not_invented(pjlink_driver):
    """PJLink gives severity, not degrees. The driver must not invent a number."""
    status = await pjlink_driver.get_status(deep=True)
    assert status.temperature.availability is Availability.UNSUPPORTED
    assert status.temperature.value is None
    assert status.fan.availability is Availability.UNSUPPORTED


async def test_authentication_round_trip(sim_state):
    sim_state.password = "pjlink-secret"
    simulator = PJLinkSimulator(sim_state, host="127.0.0.1", port=0)
    await simulator.start()
    driver = PJLinkDriver(ConnectionConfig(
        host="127.0.0.1", port=simulator.actual_port,
        password="pjlink-secret", command_gap=0.0, timeout=3.0,
    ))
    try:
        await driver.connect()
        assert (await driver.get_power_state()).ok
    finally:
        await driver.disconnect()
        await simulator.stop()


async def test_bad_password_raises_on_connect(sim_state):
    from app.drivers.transport import TransportError

    sim_state.password = "right"
    simulator = PJLinkSimulator(sim_state, host="127.0.0.1", port=0)
    await simulator.start()
    driver = PJLinkDriver(ConnectionConfig(
        host="127.0.0.1", port=simulator.actual_port,
        password="wrong", command_gap=0.0, timeout=3.0,
    ))
    try:
        with pytest.raises(TransportError):
            await driver.connect()
    finally:
        await driver.disconnect()
        await simulator.stop()


async def test_session_closed_after_every_reply_is_reopened(sim_state):
    """A projector that ends the session after each reply (or on its idle
    timeout) gets a fresh session, greeting and digest for the next command
    instead of having it written into a dead socket."""
    sim_state.password = "pjlink-secret"
    sim_state.close_after_reply = True
    sim_state.erst = [0, 1, 0, 0, 0, 0]
    simulator = PJLinkSimulator(sim_state, host="127.0.0.1", port=0)
    await simulator.start()
    driver = PJLinkDriver(ConnectionConfig(
        host="127.0.0.1", port=simulator.actual_port,
        password="pjlink-secret", command_gap=0.0, timeout=3.0,
    ))
    try:
        await driver.connect()
        assert driver.supports("info.serial"), "class 2 was probed on the first session"
        status = await driver.get_status(deep=True)
        assert status.online and status.power is PowerState.OFF
        assert status.shutter is ShutterState.OPEN
        assert status.active_input.value == "31"
        assert status.warnings == ["lamp: warning"]
        assert status.serial_number.value == sim_state.serial
    finally:
        await driver.disconnect()
        await simulator.stop()


async def test_connect_and_authenticate_send_one_class_probe(sim_state):
    """The probe during connect() is the authentication; do not repeat it."""
    sim_state.password = "pjlink-secret"
    simulator = PJLinkSimulator(sim_state, host="127.0.0.1", port=0)
    await simulator.start()
    driver = PJLinkDriver(ConnectionConfig(
        host="127.0.0.1", port=simulator.actual_port,
        password="pjlink-secret", command_gap=0.0, timeout=3.0,
    ))
    try:
        await driver.connect()
        await driver.authenticate()
        assert sim_state.command_count == 1
    finally:
        await driver.disconnect()
        await simulator.stop()
