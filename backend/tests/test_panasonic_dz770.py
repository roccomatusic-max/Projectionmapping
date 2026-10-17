"""PT-DZ770 driver: a second Panasonic model built on the shared base."""

from __future__ import annotations

import pytest
import pytest_asyncio

from app.drivers import CommandOutcome, Provenance, available
from app.drivers.panasonic_ptdz770 import PanasonicPTDZ770Driver
from app.drivers.registry import capability_manifest
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
    assert set(ids["panasonic_pt_dz770"].models) == {"PT-DZ770", "PT-DW740", "PT-DX810"}


def test_manifest_reflects_the_model_not_the_base():
    caps = {c["name"]: c for c in capability_manifest("panasonic_pt_dz770")["capabilities"]}
    assert caps["input.set"]["params"] == ["RG1", "RG2", "DVI", "HD1", "VID", "SVD"]
    assert caps["input.set"]["param_labels"]["SVD"] == "S-VIDEO"
    assert "SD1" not in caps["input.set"]["params"]
    assert "Q$L:1..2" in caps["lamp.hours"]["description"]
    # Dual-lamp commands exist, and are gated until their encoding is checked.
    assert caps["lamp.select"]["requires_opt_in"] is True
    assert caps["lamp.power"]["requires_opt_in"] is True
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
    assert "PT-DZ770" in (refused.error or "")


async def test_power_and_shutter_shared_path(dz770, dz770_state):
    assert (await dz770.set_power_state(True)).outcome is CommandOutcome.ACCEPTED
    assert (await dz770.set_shutter(closed=True)).outcome is CommandOutcome.ACCEPTED
    assert dz770_state.shutter_closed is True


async def test_lamp_select_is_gated_until_opted_in(dz770, dz770_sim, dz770_state):
    gated = await dz770.execute_supported_command("lamp.select", {"mode": "single"})
    assert gated.outcome is CommandOutcome.UNSUPPORTED
    assert gated.raw_response is None

    opted = PanasonicPTDZ770Driver(panasonic_config(dz770_sim, allow_unverified_commands=True))
    await opted.connect()
    try:
        sent = await opted.execute_supported_command("lamp.select", {"mode": "single"})
        assert sent.outcome is CommandOutcome.ACCEPTED
        assert sent.raw_request == "00LPM:1"
        assert dz770_state.lamp_select == "1"
        bad = await opted.execute_supported_command("lamp.select", {"mode": "triple"})
        assert bad.outcome is CommandOutcome.REJECTED
        eco = await opted.execute_supported_command("lamp.power", {"mode": "eco"})
        assert eco.raw_request == "00OLP:1"
    finally:
        await opted.disconnect()


async def test_lamp_select_refused_by_a_single_lamp_unit(panasonic_sim):
    """Pointing the DZ770 driver at a unit without LPM gets a clean ER401."""
    driver = PanasonicPTDZ770Driver(panasonic_config(panasonic_sim, allow_unverified_commands=True))
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
