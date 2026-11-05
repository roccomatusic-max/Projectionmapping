"""Panasonic condition readings: QTM temperatures and PJLink fan condition."""

from __future__ import annotations

import asyncio
import socket

import pytest

from app.drivers import Availability, CommandOutcome, HealthSeverity, PowerState
from app.drivers.panasonic_ptdz13k import PanasonicPTDZ13KDriver, parse_temperature
from app.services.device_manager import DeviceWorker, Priority
from simulator import PanasonicSimulator, PJLinkSimulator
from tests.conftest import panasonic_config
from tests.test_device_manager import make_record

# -- reply parsing -----------------------------------------------------------


@pytest.mark.parametrize(("raw", "expected"), [
    ("0025/0077", (25.0, 77.0)),
    ("+025/+077", (25.0, 77.0)),
    ("-005/0023", (-5.0, 23.0)),
    ("25.5/77.9", (25.5, 77.9)),
    ("025C/077F", (25.0, 77.0)),
    (" 0041 / 0106 ", (41.0, 106.0)),
])
def test_temperature_replies_are_read_as_celsius_then_fahrenheit(raw, expected):
    assert parse_temperature(raw) == expected


@pytest.mark.parametrize("raw", [
    "0077/0025",   # the wrong way round: the halves do not agree
    "25",          # one number: Celsius or Fahrenheit is anyone's guess
    "0999/1830",   # no projector sensor reads that
    "ER401",
    "",
])
def test_temperature_replies_that_do_not_add_up_are_not_numbers(raw):
    assert parse_temperature(raw) is None


# -- against the simulator -----------------------------------------------------


async def _power_on(driver, sim_state):
    await driver.set_power_state(True)
    await asyncio.sleep(sim_state.warmup_seconds + 0.2)
    assert (await driver.get_power_state()).value is PowerState.ON


def _closed_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


async def test_reads_each_sensor_in_celsius_and_fahrenheit(panasonic_driver, sim_state):
    await _power_on(panasonic_driver, sim_state)
    result = await panasonic_driver.get_temperatures(PowerState.ON)
    assert result.outcome is CommandOutcome.OK
    assert [(s["label"], s["celsius"], s["fahrenheit"]) for s in result.value] == [
        ("Intake air", 27, 81), ("Exhaust air", 41, 106), ("Optics module", 36, 97),
    ]
    assert not any(s["unparsed"] for s in result.value)


async def test_a_sensor_the_model_lacks_is_dropped_only_while_on(panasonic_driver, sim_state):
    del sim_state.temperature_profile["2"]
    # In standby an ER401 may just mean "not now": keep asking.
    await panasonic_driver.get_temperatures(PowerState.OFF)
    assert panasonic_driver._absent_sensors == set()

    await _power_on(panasonic_driver, sim_state)
    # Just after power-on a refusal may still be the start-up; this unit
    # is past it.
    panasonic_driver.WARMUP_SECONDS = 0.0
    result = await panasonic_driver.get_temperatures(PowerState.ON)
    assert [s["key"] for s in result.value] == ["intake", "exhaust"]
    assert panasonic_driver._absent_sensors == {"optics"}

    sent: list[str] = []
    original = panasonic_driver.raw_command

    async def spy(capability, body, **kwargs):
        sent.append(body)
        return await original(capability, body, **kwargs)

    panasonic_driver.raw_command = spy
    await panasonic_driver.get_temperatures(PowerState.ON)
    assert sent == ["QTM:0", "QTM:1"]


async def test_standby_refusal_is_not_shown_as_not_supported(panasonic_sim, sim_state):
    sim_state.temperatures_in_standby = False
    driver = PanasonicPTDZ13KDriver(panasonic_config(panasonic_sim, pjlink_port=_closed_port()))
    await driver.connect()
    try:
        status = await driver.get_status(deep=True)
    finally:
        await driver.disconnect()
    assert status.power is PowerState.OFF
    assert status.temperature.availability is Availability.UNAVAILABLE
    assert "standby" in status.temperature.note
    assert driver._absent_sensors == set()


async def test_fan_condition_comes_from_pjlink_on_the_same_unit(panasonic_sim, pjlink_sim, sim_state):
    sim_state.erst = [1, 0, 0, 0, 0, 0]  # fan warning
    driver = PanasonicPTDZ13KDriver(
        panasonic_config(panasonic_sim, pjlink_port=pjlink_sim.actual_port)
    )
    await driver.connect()
    try:
        await _power_on(driver, sim_state)
        deep = await driver.get_status(deep=True)
        shallow = await driver.get_status()
    finally:
        await driver.disconnect()

    assert deep.fan.availability is Availability.AVAILABLE
    assert deep.fan.value == {"condition": "warning"}
    assert "fan speed" in deep.fan.note
    assert deep.error_status.value["fan"] == "warning"
    assert deep.temperature.value["condition"] == "ok"
    assert [s["celsius"] for s in deep.temperature.value["sensors"]] == [27, 41, 36]
    assert deep.health is HealthSeverity.WARNING
    assert "fan: warning" in deep.warnings
    # The fast polls do not open PJLink, but keep its verdict.
    assert shallow.health is HealthSeverity.WARNING


async def test_pjlink_uses_the_control_password_by_default(sim_state):
    sim_state.password = "panasonic"
    async with PanasonicSimulator(sim_state, port=0) as nt, \
            PJLinkSimulator(sim_state, port=0) as pj:
        driver = PanasonicPTDZ13KDriver(panasonic_config(
            nt, password="panasonic", pjlink_port=pj.actual_port,
        ))
        await driver.connect()
        await driver.authenticate()
        try:
            assert (await driver.get_errors()).ok

            driver.config.pjlink_password = "wrong"
            refused = await driver.get_errors()
        finally:
            await driver.disconnect()
    assert refused.outcome is CommandOutcome.AUTH_FAILED
    assert "PJLink password" in refused.error


async def test_no_pjlink_says_how_to_get_fan_condition(panasonic_sim, sim_state):
    port = _closed_port()
    driver = PanasonicPTDZ13KDriver(panasonic_config(panasonic_sim, pjlink_port=port))
    await driver.connect()
    try:
        status = await driver.get_status(deep=True)
        # Not knocked on again every minute.
        again = await driver.get_errors()
    finally:
        await driver.disconnect()
    assert status.online
    assert status.fan.availability is Availability.UNAVAILABLE
    assert "Turn PJLink on" in status.fan.note
    assert status.error_status.availability is Availability.UNAVAILABLE
    assert status.temperature.availability is Availability.AVAILABLE
    assert status.health is HealthSeverity.OK
    assert again.error == status.fan.note


async def test_worker_hands_the_pjlink_settings_to_the_driver(panasonic_sim, pjlink_sim, sim_state):
    sim_state.erst = [0, 0, 2, 0, 0, 0]  # temperature error
    worker = DeviceWorker(make_record(
        3, panasonic_sim.actual_port, pjlink_port=pjlink_sim.actual_port,
        pjlink_password_enc=None,
    ))
    await worker.start()
    try:
        future = worker.submit("status", {"deep": True}, priority=Priority.MONITOR, job="status")
        result = await asyncio.wait_for(future, timeout=10)
    finally:
        await worker.stop()
    status = result.value
    assert status.error_status.value["temperature"] == "error"
    assert status.health is HealthSeverity.ERROR
    assert "temperature: error" in status.errors
