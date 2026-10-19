"""Panasonic PT-DZ13K driver: protocol parsing, auth, gating, capabilities."""

from __future__ import annotations

import asyncio
import hashlib

import pytest

from app.drivers import CommandOutcome, ConnectionConfig, PowerState, Provenance, ShutterState
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
    ("00X", CommandOutcome.ACCEPTED),
    ("00X:001", CommandOutcome.OK),
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


async def power_on_and_settle(driver) -> None:
    """Power on and wait out start-up, so an ER401 means "not on this unit"."""
    driver.WARMUP_SECONDS = 0.0
    await driver.set_power_state(True)
    for _ in range(40):
        if (await driver.get_power_state()).value is PowerState.ON:
            return
        await asyncio.sleep(0.05)
    raise AssertionError("simulated projector never came on")


async def test_unfitted_input_board_reports_unsupported(panasonic_driver, sim_state):
    """SD1 with no board fitted answers ER401 and must not look like success."""
    assert "SD1" not in sim_state.fitted_inputs
    await power_on_and_settle(panasonic_driver)
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


@pytest.mark.parametrize(("capability", "params"), [
    ("power.set", {}),
    ("power.set", {"state": "1"}),
    ("power.set", {"power": "on"}),
    ("shutter.set", {"state": "close"}),
    ("shutter.set", {"state": True}),
])
async def test_missing_or_misspelled_state_is_refused_not_guessed(
    panasonic_driver, sim_state, capability, params
):
    """``{}`` used to send POF and ``"close"`` used to send OSH:0 (open):
    anything that was not exactly "on" / "closed" meant the other choice."""
    sim_state.shutter_closed = True
    result = await panasonic_driver.execute_supported_command(capability, params)
    assert result.outcome is CommandOutcome.REJECTED
    assert result.raw_response is None  # never sent
    assert sim_state.shutter_closed is True


@pytest.mark.parametrize(("capability", "params"), [
    ("image.brightness", {}),  # used to send OBR:000, the darkest setting
    ("image.brightness", {"value": "bright"}),  # used to raise out of the driver
    ("lens.shift_h", {"direction": "left"}),
])
async def test_missing_or_non_numeric_value_is_refused(panasonic_sim, capability, params):
    driver = PanasonicPTDZ13KDriver(
        panasonic_config(panasonic_sim, allow_unverified_commands=True)
    )
    await driver.connect()
    try:
        result = await driver.execute_supported_command(capability, params)
        assert result.outcome is CommandOutcome.REJECTED
        assert result.raw_request is None  # never sent
    finally:
        await driver.disconnect()


async def test_state_parameter_is_read_case_and_space_insensitively(panasonic_driver, sim_state):
    result = await panasonic_driver.execute_supported_command("power.set", {"state": " ON "})
    assert result.outcome is CommandOutcome.ACCEPTED
    assert result.raw_request == "00PON"


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


async def test_missing_password_in_protect_mode_is_explained(panasonic_sim, sim_state):
    from app.drivers.transport import AuthenticationError

    sim_state.password = "panasonic"
    driver = PanasonicPTDZ13KDriver(panasonic_config(panasonic_sim, password=None))
    with pytest.raises(AuthenticationError, match="protect mode.*Control password"):
        await driver.connect()


async def test_wrong_password_is_an_authentication_error(panasonic_sim, sim_state):
    from app.drivers.transport import AuthenticationError

    sim_state.password = "panasonic"
    driver = PanasonicPTDZ13KDriver(panasonic_config(panasonic_sim, password="wrong"))
    await driver.connect()
    try:
        with pytest.raises(AuthenticationError, match="ERRA"):
            await driver.authenticate()
    finally:
        await driver.disconnect()


def test_digest_matches_panasonic_reference_example():
    """Panasonic's manual: md5("admin1:panasonic:<random>"), lowercase hex."""
    expected = hashlib.md5(b"admin1:panasonic:a1b2c3d4").hexdigest()
    assert panasonic_digest("admin1", "panasonic", "a1b2c3d4") == expected
    assert len(expected) == 32 and expected == expected.lower()


def test_greeting_seed_is_hashed_as_received_even_if_not_hex():
    from app.drivers.panasonic_ntcontrol import NTControlTransport

    nt = NTControlTransport(ConnectionConfig(host="127.0.0.1", port=1024,
                                             username="admin1", password="panasonic"))
    nt._parse_greeting("NTCONTROL 1 zZ9yX8wV\r")
    assert nt.protected is True
    assert nt._digest == panasonic_digest("admin1", "panasonic", "zZ9yX8wV")


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


# -- reply shapes -----------------------------------------------------------


@pytest.mark.parametrize(("request_", "reply", "outcome", "value"), [
    # Control command acknowledged by echoing the mnemonic.
    ("00PON", "00PON", CommandOutcome.ACCEPTED, "PON"),
    ("00OSH:1", "00OSH", CommandOutcome.ACCEPTED, "OSH"),
    ("00OSH:1", "00OSH:1", CommandOutcome.ACCEPTED, "OSH:1"),
    # Query answered with the value alone after the ID — Panasonic's form.
    ("00QPW", "00001", CommandOutcome.OK, "001"),
    ("00QSH", "000", CommandOutcome.OK, "0"),
    ("00QIN", "00DVI", CommandOutcome.OK, "DVI"),
    ("00Q$L:1", "0000001240", CommandOutcome.OK, "00001240"),
    # Query answered as MNEMONIC:value — seen on some firmware.
    ("00QPW", "00QPW:001", CommandOutcome.OK, "001"),
    ("00QIN", "00QIN:HD1", CommandOutcome.OK, "HD1"),
])
def test_reply_shapes(request_, reply, outcome, value):
    result = classify_response("x", request_, reply, 1)
    assert result.outcome is outcome
    assert result.value == value


async def test_lost_auth_probe_reply_is_a_connection_failure(panasonic_sim, sim_state):
    """A projector that accepts TCP but never answers must not look connected.

    The simulator processes the first command (consuming the digest) but
    withholds its reply. authenticate() has to raise so the worker reports a
    clear connection failure instead of handing out a dead socket.
    """
    from app.drivers.transport import TransportError

    sim_state.password = "panasonic"
    sim_state.drop_reply_indices = {1}
    driver = PanasonicPTDZ13KDriver(
        panasonic_config(panasonic_sim, password="panasonic", timeout=0.4)
    )
    await driver.connect()
    try:
        with pytest.raises(TransportError, match="did not answer"):
            await driver.authenticate()
        assert not driver.connected
        # A fresh session gets a fresh seed and works.
        await driver.connect()
        await driver.authenticate()
        assert (await driver.get_power_state()).value is PowerState.OFF
    finally:
        await driver.disconnect()


async def test_firmware_that_disconnects_after_every_reply(panasonic_sim, sim_state):
    """Some Panasonic firmware ends the session right after each reply.

    Every query in a status read, and every control command, then needs its
    own connection, greeting and (in protect mode) digest. Without that, all
    but the first command of a session go into a dead socket.
    """
    sim_state.password = "panasonic"
    sim_state.close_after_reply = True
    driver = PanasonicPTDZ13KDriver(panasonic_config(panasonic_sim, password="panasonic"))
    await driver.connect()
    try:
        await driver.authenticate()
        status = await driver.get_status(deep=True)
        assert status.online and status.power is PowerState.OFF
        assert status.shutter is ShutterState.OPEN
        assert status.active_input.value == {"code": "DVI", "label": "DVI-D"}
        assert [lamp["hours"] for lamp in status.lamp_hours.value] == sim_state.lamp_hours
        assert status.lamp_status.value["state"] == "standby"

        assert (await driver.set_power_state(True)).outcome is CommandOutcome.ACCEPTED
        assert sim_state.power.value in ("warming", "on")
    finally:
        await driver.disconnect()


async def test_garbage_with_no_terminator_drops_the_socket(sim_state):
    """Kilobytes without a CR (wrong port, serial gateway at the wrong baud
    rate) must end as a connection error with the socket closed, not as an
    exception that leaves the junk in the buffer for every later command."""
    async def junk(reader, writer):
        writer.write(b"NTCONTROL 0\r")
        await writer.drain()
        try:
            await reader.readuntil(b"\r")
            writer.write(b"\x00" * 70_000)
            await writer.drain()
            await reader.read()
        except (asyncio.IncompleteReadError, ConnectionError):
            pass
        finally:
            writer.close()

    server = await asyncio.start_server(junk, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    driver = PanasonicPTDZ13KDriver(ConnectionConfig(host="127.0.0.1", port=port, timeout=2.0))
    try:
        await driver.connect()
        result = await driver.get_power_state()
        assert result.outcome is CommandOutcome.CONNECTION_ERROR
        assert "terminator" in (result.error or "")
        assert not driver.connected
    finally:
        await driver.disconnect()
        server.close()
        await server.wait_closed()


async def test_timeout_drops_the_socket_so_a_late_reply_cannot_mislead(
    panasonic_sim, sim_state
):
    sim_state.drop_reply_indices = {1}
    driver = PanasonicPTDZ13KDriver(panasonic_config(panasonic_sim, timeout=0.4))
    await driver.connect()
    try:
        result = await driver.get_power_state()
        assert result.outcome is CommandOutcome.TIMEOUT
        assert result.outcome.state_is_uncertain
        assert not driver.connected
    finally:
        await driver.disconnect()


# -- refusals caused by the power state, not the model ----------------------
#
# A real unit answers ER401 both for a command the model lacks and for one it
# will not take right now. Read as "unsupported", the second kind told the
# operator a working projector could not do things, and retracted inputs.


async def test_power_on_while_cooling_is_busy_and_explained(panasonic_driver, sim_state):
    # The driver spaces Panasonic commands 0.6 s apart, so leave room.
    sim_state.cooldown_seconds = 2.5
    await power_on_and_settle(panasonic_driver)
    assert (await panasonic_driver.set_power_state(False)).outcome is CommandOutcome.ACCEPTED

    refused = await panasonic_driver.set_power_state(True)
    assert refused.raw_response == "00ER401"
    assert refused.outcome is CommandOutcome.BUSY
    assert "cooling down" in (refused.error or "")
    # QPW reads standby while cooling; Q$S says it is still cooling.
    assert (await panasonic_driver.get_power_state()).value is PowerState.COOLING

    await asyncio.sleep(1.0)
    assert (await panasonic_driver.get_power_state()).value is PowerState.OFF
    assert (await panasonic_driver.set_power_state(True)).outcome is CommandOutcome.ACCEPTED


async def test_power_on_refused_after_a_panel_power_off_is_explained(panasonic_driver, sim_state):
    """Turned off at the projector: no POF of ours, still a cool-down."""
    sim_state.cooldown_seconds = 1.0
    sim_state.power_on()
    await asyncio.sleep(0.4)
    sim_state.power_off()
    refused = await panasonic_driver.set_power_state(True)
    assert refused.outcome is CommandOutcome.BUSY
    assert "cooling down" in (refused.error or "")


async def test_standby_refusals_are_explained_and_retract_nothing(panasonic_driver, sim_state):
    sim_state.standby_refuses_controls = True
    assert (await panasonic_driver.get_power_state()).value is PowerState.OFF

    shutter = await panasonic_driver.set_shutter(closed=True)
    assert shutter.outcome is CommandOutcome.BUSY
    assert "standby" in (shutter.error or "")

    for code in ("HD1", "SD1"):
        result = await panasonic_driver.set_input(code)
        assert result.outcome is CommandOutcome.BUSY
        assert "standby" in (result.error or "")
        assert panasonic_driver.capabilities.param_available("input.set", code)

    # Once on, the same inputs behave as the unit really is.
    await power_on_and_settle(panasonic_driver)
    assert (await panasonic_driver.set_input("HD1")).ok
    assert (await panasonic_driver.set_input("SD1")).outcome is CommandOutcome.UNSUPPORTED


async def test_commands_during_start_up_are_not_retracted(panasonic_driver, sim_state):
    sim_state.standby_refuses_controls = True
    sim_state.warmup_seconds = 2.0
    await panasonic_driver.set_power_state(True)
    result = await panasonic_driver.set_input("HD1")
    assert result.outcome is CommandOutcome.BUSY
    assert "starting up" in (result.error or "")
    assert panasonic_driver.capabilities.param_available("input.set", "HD1")
