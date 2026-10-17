"""Panasonic PT-DZ13K driver: protocol parsing, auth, gating, capabilities."""

from __future__ import annotations

import asyncio
import hashlib

import pytest

from app.drivers import CommandOutcome, PowerState, Provenance, ShutterState
from app.drivers.panasonic_ntcontrol import classify_response, panasonic_digest
from app.drivers.panasonic_ptdz13k import PanasonicPTDZ13KDriver
from tests.conftest import panasonic_config

# -- pure parsing ----------------------------------------------------------


def test_digest_matches_documented_format():
    """md5("user:password:random"), per the Panasonic LAN protocol doc."""
    expected = hashlib.md5(b"admin1:panasonic:12345678").hexdigest()
    assert panasonic_digest("admin1", "panasonic", "12345678") == expected


def test_digest_differs_from_pjlink_scheme():
    """A frequent integration bug: the two schemes are not interchangeable."""
    from app.drivers.pjlink import pjlink_digest

    assert panasonic_digest("admin1", "panasonic", "abcd1234") != \
        pjlink_digest("abcd1234", "panasonic")


@pytest.mark.parametrize(("reply", "outcome"), [
    ("00PON", CommandOutcome.ACCEPTED),
    ("00QPW:001", CommandOutcome.OK),
    ("ERR1", CommandOutcome.UNSUPPORTED),
    ("ERR2", CommandOutcome.REJECTED),
    ("ERR3", CommandOutcome.BUSY),
    ("ERR4", CommandOutcome.BUSY),
    ("ERR5", CommandOutcome.REJECTED),
    ("ERRA", CommandOutcome.AUTH_FAILED),
    ("00ER401", CommandOutcome.UNSUPPORTED),
    ("00ER402", CommandOutcome.REJECTED),
    ("00ER403", CommandOutcome.BUSY),
    ("", CommandOutcome.PARSE_ERROR),
])
def test_response_classification(reply, outcome):
    assert classify_response("x", "00X", reply, 1).outcome is outcome


def test_unknown_error_code_is_rejected_not_accepted():
    """An ER4xx we have never seen must not be read as a success."""
    result = classify_response("x", "00X", "00ER499", 1)
    assert result.outcome is CommandOutcome.REJECTED


# -- live protocol against the simulator ------------------------------------


async def test_power_cycle_reports_each_state(panasonic_driver, sim_state):
    assert (await panasonic_driver.get_power_state()).value is PowerState.OFF

    result = await panasonic_driver.set_power_state(True)
    # An ack is ACCEPTED, never CONFIRMED: the driver does not promote an
    # acknowledgement into a verified state change.
    assert result.outcome is CommandOutcome.ACCEPTED

    await asyncio.sleep(0.5)
    assert (await panasonic_driver.get_power_state()).value is PowerState.ON


async def test_power_off_refused_during_warmup(panasonic_driver, sim_state):
    sim_state.warmup_seconds = 5.0
    await panasonic_driver.set_power_state(True)
    result = await panasonic_driver.set_power_state(False)
    assert result.outcome is CommandOutcome.BUSY


async def test_shutter_polarity_is_not_inverted(panasonic_driver, sim_state):
    """OSH:1 closes the shutter. Guards the one place that mapping lives."""
    await panasonic_driver.set_shutter(closed=True)
    assert sim_state.shutter_closed is True
    assert (await panasonic_driver.get_shutter_state()).value is ShutterState.CLOSED

    await panasonic_driver.set_shutter(closed=False)
    assert sim_state.shutter_closed is False
    assert (await panasonic_driver.get_shutter_state()).value is ShutterState.OPEN


async def test_valid_input_selection(panasonic_driver, sim_state):
    result = await panasonic_driver.set_input("HD1")
    assert result.ok
    assert sim_state.active_input == "HD1"
    active = await panasonic_driver.get_active_input()
    assert active.value == {"code": "HD1", "label": "HDMI"}


async def test_unfitted_input_board_reports_unsupported(panasonic_driver, sim_state):
    """SD1 with no board fitted answers ER401 and must not look like success."""
    assert "SD1" not in sim_state.fitted_inputs
    result = await panasonic_driver.set_input("SD1")
    assert result.outcome is CommandOutcome.UNSUPPORTED
    assert "input board" in (result.error or "")


async def test_unknown_input_rejected_without_network_io(panasonic_driver):
    result = await panasonic_driver.set_input("ZZZ")
    assert result.outcome is CommandOutcome.UNSUPPORTED
    assert result.raw_response is None  # never reached the projector


async def test_lamp_hours_reads_all_four_lamps(panasonic_driver, sim_state):
    result = await panasonic_driver.get_lamp_hours()
    assert result.ok
    assert len(result.value) == 4
    assert [lamp["hours"] for lamp in result.value] == sim_state.lamp_hours


async def test_lamp_status_marks_unrecognised_values(panasonic_driver):
    result = await panasonic_driver.get_lamp_status()
    assert result.ok
    assert result.value["state"] == "standby"
    assert result.value["unparsed"] is False


async def test_errors_query_is_honestly_unsupported(panasonic_driver):
    """There is no confirmed per-subsystem error query for this model.

    The driver must say so rather than returning a fabricated clean status.
    """
    result = await panasonic_driver.get_errors()
    assert result.outcome is CommandOutcome.UNSUPPORTED
    assert "PJLink" in (result.error or "")


# -- capability gating ------------------------------------------------------


async def test_unverified_lens_command_is_gated_by_default(panasonic_driver):
    result = await panasonic_driver.lens_action("lens.shift_h", direction=1)
    assert result.outcome is CommandOutcome.UNSUPPORTED
    assert "inferred_family" in (result.error or "")
    assert result.raw_response is None  # no socket I/O


async def test_unverified_lens_command_runs_after_opt_in(panasonic_sim):
    driver = PanasonicPTDZ13KDriver(
        panasonic_config(panasonic_sim, allow_unverified_commands=True)
    )
    await driver.connect()
    try:
        result = await driver.lens_action("lens.shift_h", direction=1, step=2)
        assert result.outcome is CommandOutcome.ACCEPTED
        assert result.raw_request == "00VXX:LNSI2+0002"  # wire frame, prefix included
    finally:
        await driver.disconnect()


async def test_verified_lens_home_is_not_gated(panasonic_driver):
    """Calibration and home are documented for this series, so they run."""
    result = await panasonic_driver.lens_action("lens.home")
    assert result.outcome is CommandOutcome.ACCEPTED


async def test_lens_memory_is_declared_unsupported(panasonic_driver):
    """No lens-memory command was confirmed, so it must not be offered."""
    result = await panasonic_driver.execute_supported_command("lens.memory")
    assert result.outcome is CommandOutcome.UNSUPPORTED


def test_capability_provenance_is_recorded():
    driver = PanasonicPTDZ13KDriver.__new__(PanasonicPTDZ13KDriver)
    caps = {c.name: c for c in PanasonicPTDZ13KDriver._build_capabilities()}
    assert caps["power.set"].provenance is Provenance.VERIFIED_DOC
    assert caps["power.set"].disruptive is True
    assert caps["power.set"].idempotent is False
    assert caps["power.set"].verify_with == "power.get"
    assert caps["lens.shift_h"].provenance is Provenance.INFERRED_FAMILY
    assert caps["lens.shift_h"].requires_opt_in is True
    del driver


# -- authentication ---------------------------------------------------------


async def test_protect_mode_authenticates(panasonic_sim, sim_state):
    sim_state.password = "panasonic"
    driver = PanasonicPTDZ13KDriver(
        panasonic_config(panasonic_sim, password="panasonic")
    )
    await driver.connect()
    try:
        await driver.authenticate()
        assert (await driver.get_power_state()).ok
    finally:
        await driver.disconnect()


async def test_wrong_password_reports_auth_failure(panasonic_sim, sim_state):
    from app.drivers.transport import TransportError

    sim_state.password = "panasonic"
    driver = PanasonicPTDZ13KDriver(panasonic_config(panasonic_sim, password="wrong"))
    await driver.connect()
    try:
        with pytest.raises(TransportError, match="authentication rejected"):
            await driver.authenticate()
    finally:
        await driver.disconnect()


async def test_missing_password_in_protect_mode_is_explained(panasonic_sim, sim_state):
    from app.drivers.transport import TransportError

    sim_state.password = "panasonic"
    driver = PanasonicPTDZ13KDriver(panasonic_config(panasonic_sim, password=None))
    with pytest.raises(TransportError, match="protect mode but no password"):
        await driver.connect()


# -- failure modes ----------------------------------------------------------


async def test_silent_projector_times_out_without_hanging(panasonic_sim, sim_state):
    sim_state.silent = True
    driver = PanasonicPTDZ13KDriver(panasonic_config(panasonic_sim, timeout=0.5))
    await driver.connect()
    try:
        result = await driver.get_power_state()
        assert result.outcome is CommandOutcome.TIMEOUT
        assert result.outcome.state_is_uncertain
    finally:
        await driver.disconnect()


async def test_busy_projector_is_retryable_not_fatal(panasonic_sim, sim_state):
    sim_state.busy = True
    driver = PanasonicPTDZ13KDriver(panasonic_config(panasonic_sim))
    await driver.connect()
    try:
        result = await driver.get_power_state()
        assert result.outcome is CommandOutcome.BUSY
        assert not result.outcome.state_is_uncertain
    finally:
        await driver.disconnect()


async def test_dropped_connection_is_reported(panasonic_sim, sim_state):
    sim_state.drop_after = 1
    driver = PanasonicPTDZ13KDriver(panasonic_config(panasonic_sim))
    await driver.connect()
    try:
        await driver.get_power_state()
        second = await driver.get_power_state()
        assert second.outcome in (CommandOutcome.CONNECTION_ERROR, CommandOutcome.TIMEOUT)
    finally:
        await driver.disconnect()
