"""PT-DZ770 driver: a second Panasonic model built on the shared base."""

from __future__ import annotations

import asyncio

import pytest
import pytest_asyncio

from app.drivers import CommandOutcome, Provenance, available
from app.drivers.panasonic_ptdz770 import PanasonicPTDZ770Driver
from app.drivers.registry import capability_manifest
from app.drivers.transport import AuthenticationError
from simulator import PanasonicSimulator, SimulatedProjector
from tests.conftest import panasonic_config


@pytest.fixture
def dz770_state() -> SimulatedProjector:
    return SimulatedProjector.dz770(warmup_seconds=0.3, cooldown_seconds=0.3)


@pytest_asyncio.fixture
async def dz770_sim(dz770_state):
    simulator = PanasonicSimulator(dz770_state, host="127.0.0.1", port=0)
    await simulator.start()
    try:
        yield simulator
    finally:
        await simulator.stop()


@pytest_asyncio.fixture
async def dz770(dz770_sim):
    driver = PanasonicPTDZ770Driver(panasonic_config(dz770_sim))
    await driver.connect()
    await driver.authenticate()
    try:
        yield driver
    finally:
        await driver.disconnect()


def test_registered_with_its_models():
    ids = {d.driver_id: d for d in available()}
    assert "panasonic_pt_dz770" in ids
    assert set(ids["panasonic_pt_dz770"].models) == {
        "PT-DZ770", "PT-DW740", "PT-DX810", "PT-DX810ULK",
    }
    # The name in the Add projector driver list says which models it covers.
    assert "DX810" in ids["panasonic_pt_dz770"].display_name


def test_manifest_reflects_the_model_not_the_base():
    caps = {c["name"]: c for c in capability_manifest("panasonic_pt_dz770")["capabilities"]}
    assert caps["input.set"]["params"] == ["RG1", "RG2", "DVI", "HD1", "VID", "SVD"]
    assert caps["input.set"]["param_labels"]["SVD"] == "S-VIDEO"
    assert "SD1" not in caps["input.set"]["params"]
    assert "Q$L:1..2" in caps["lamp.hours"]["description"]
    # Dual-lamp commands: values are in the PT-DX810 command list, so confirmed.
    assert caps["lamp.select"]["requires_opt_in"] is False
    assert caps["lamp.select"]["provenance"] == Provenance.VERIFIED_DOC.value
    assert caps["lamp.power"]["requires_opt_in"] is False
    # No lens memory on this family, and the UI is told so plainly.
    assert caps["lens.memory"]["caveat"] == "This projector has no lens memory."
    assert "PT-DX810ULK" in caps["lens.shift_h"]["caveat"]
    # The common, verified set is still there.
    assert caps["power.set"]["provenance"] == Provenance.VERIFIED_DOC.value
    assert caps["shutter.set"]["provenance"] == Provenance.VERIFIED_DOC.value


def test_dz13k_manifest_is_unchanged_by_the_refactor():
    caps = {c["name"]: c for c in capability_manifest("panasonic_pt_dz13k")["capabilities"]}
    assert caps["input.set"]["params"] == ["RG1", "RG2", "VID", "DVI", "HD1", "SD1", "SD2"]
    assert "Q$L:1..4" in caps["lamp.hours"]["description"]
    assert "lamp.select" not in caps


async def test_reads_two_lamps(dz770, dz770_state):
    result = await dz770.get_lamp_hours()
    assert result.ok
    assert [lamp["hours"] for lamp in result.value] == dz770_state.lamp_hours == [812, 790]


async def test_svideo_switches_and_sdi_is_refused_before_the_wire(dz770, dz770_state):
    assert (await dz770.set_input("SVD")).ok
    assert dz770_state.active_input == "SVD"
    refused = await dz770.set_input("SD1")
    assert refused.outcome is CommandOutcome.UNSUPPORTED
    assert refused.raw_response is None
    assert "DZ770" in (refused.error or "")


async def test_power_and_shutter_shared_path(dz770, dz770_state):
    assert (await dz770.set_power_state(True)).outcome is CommandOutcome.ACCEPTED
    assert (await dz770.set_shutter(closed=True)).outcome is CommandOutcome.ACCEPTED
    assert dz770_state.shutter_closed is True


async def test_lamp_select_and_power_need_no_opt_in(dz770, dz770_state):
    sent = await dz770.execute_supported_command("lamp.select", {"mode": "single"})
    assert sent.outcome is CommandOutcome.ACCEPTED
    assert sent.raw_request == "00LPM:1"
    assert dz770_state.lamp_select == "1"
    bad = await dz770.execute_supported_command("lamp.select", {"mode": "triple"})
    assert bad.outcome is CommandOutcome.REJECTED
    assert bad.raw_request is None
    eco = await dz770.execute_supported_command("lamp.power", {"mode": "eco"})
    assert eco.outcome is CommandOutcome.ACCEPTED
    assert eco.raw_request == "00OLP:1"
    assert dz770_state.lamp_power == "1"


async def test_lamp_select_while_switching_is_not_right_now(dz770, dz770_state):
    """ER401 straight after a lamp select means "still switching", not "no LPM"."""
    assert (await dz770.set_power_state(True)).ok
    await asyncio.sleep(0.4)
    assert (await dz770.get_power_state()).ok
    dz770_state.lamp_switch_seconds = 30.0
    assert (await dz770.execute_supported_command("lamp.select", {"mode": "lamp1"})).ok
    again = await dz770.execute_supported_command("lamp.select", {"mode": "dual"})
    assert again.outcome is CommandOutcome.BUSY
    assert "switching lamps" in (again.error or "")
    assert again.raw_response == "00ER401"
    assert dz770_state.lamp_select == "2"
    # The capability stays offered: a refusal for now never hides the control.
    assert dz770.capabilities.get("lamp.select") is not None


async def test_lens_memory_says_the_model_has_none(dz770):
    result = await dz770.execute_supported_command("lens.memory", {})
    assert result.outcome is CommandOutcome.UNSUPPORTED
    assert result.raw_request is None
    assert "This projector has no lens memory." in (result.error or "")


async def test_lamp_select_refused_by_a_single_lamp_unit(panasonic_sim):
    """Pointing the DZ770 driver at a unit without LPM gets a clean ER401."""
    driver = PanasonicPTDZ770Driver(panasonic_config(panasonic_sim))
    await driver.connect()
    try:
        # The DZ13K simulator has four lamps, so LPM is accepted there; force
        # the single-lamp branch by trimming the simulated lamp list.
        panasonic_sim.state.lamp_hours = panasonic_sim.state.lamp_hours[:1]
        panasonic_sim.state.lamp_on = panasonic_sim.state.lamp_on[:1]
        result = await driver.execute_supported_command("lamp.select", {"mode": "dual"})
        assert result.outcome is CommandOutcome.UNSUPPORTED
        assert result.raw_response == "00ER401"
    finally:
        await driver.disconnect()


# -- PT-DX810ULK ------------------------------------------------------------


@pytest_asyncio.fixture
async def dx810_sim():
    """A PT-DX810ULK in protect mode with the admin1 web login, like Rocco's units."""
    state = SimulatedProjector.dx810(
        warmup_seconds=0.3, cooldown_seconds=0.3, password="projector-web-login",
    )
    simulator = PanasonicSimulator(state, host="127.0.0.1", port=0)
    await simulator.start()
    try:
        yield simulator
    finally:
        await simulator.stop()


async def test_dx810ulk_end_to_end(dx810_sim):
    state = dx810_sim.state
    driver = PanasonicPTDZ770Driver(
        panasonic_config(dx810_sim, password="projector-web-login")
    )
    await driver.connect()
    await driver.authenticate()
    try:
        assert (await driver.set_power_state(True)).outcome is CommandOutcome.ACCEPTED
        await asyncio.sleep(0.4)
        assert state.is_on

        assert (await driver.set_input("HD1")).ok
        assert state.active_input == "HD1"
        assert (await driver.get_active_input()).value["code"] == "HD1"

        assert (await driver.set_shutter(closed=True)).ok
        assert state.shutter_closed is True
        assert (await driver.set_shutter(closed=False)).ok

        hours = await driver.get_lamp_hours()
        assert [lamp["hours"] for lamp in hours.value] == [1460, 1433]

        temps = await driver.execute_supported_command("temperature.get")
        assert temps.ok

        eco = await driver.execute_supported_command("lamp.power", {"mode": "eco"})
        assert eco.outcome is CommandOutcome.ACCEPTED
        assert state.lamp_power == "1"

        sdi = await driver.set_input("SD1")
        assert sdi.outcome is CommandOutcome.UNSUPPORTED
        assert sdi.raw_response is None
    finally:
        await driver.disconnect()


async def test_dx810ulk_wrong_password_is_an_auth_failure(dx810_sim):
    driver = PanasonicPTDZ770Driver(panasonic_config(dx810_sim, password="wrong"))
    await driver.connect()
    try:
        with pytest.raises(AuthenticationError, match="ERRA"):
            await driver.authenticate()
    finally:
        await driver.disconnect()
