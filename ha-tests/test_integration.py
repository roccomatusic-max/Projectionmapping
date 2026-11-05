"""The integration inside Home Assistant, driving a real server and simulated projectors."""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest
from homeassistant.config_entries import SOURCE_USER, ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.exceptions import HomeAssistantError
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.projector_control.const import DOMAIN
from custom_components.projector_control.update import replace_integration

INTEGRATION = Path(__file__).resolve().parent.parent / "custom_components" / DOMAIN


async def call(hass: HomeAssistant, server, *args, **kwargs):
    """The server's admin API, off the event loop (Home Assistant forbids blocking I/O)."""
    return await hass.async_add_executor_job(lambda: server.call(*args, **kwargs))


async def eventually(hass: HomeAssistant, entry, check, what: str, timeout: float = 30.0):
    """Refresh until ``check()`` is truthy: the projectors take real (simulated) time."""
    coordinator = entry.runtime_data
    deadline = asyncio.get_running_loop().time() + timeout
    while True:
        await coordinator.async_refresh()
        await hass.async_block_till_done()
        value = check()
        if value:
            return value
        if asyncio.get_running_loop().time() > deadline:
            raise AssertionError(f"timed out waiting for {what}")
        await asyncio.sleep(0.5)


def state(hass: HomeAssistant, entity_id: str) -> str | None:
    found = hass.states.get(entity_id)
    return found.state if found else None


@pytest.fixture
async def entry(hass: HomeAssistant, server):
    key = (await call(hass, server, "POST", "/api/integration/homeassistant/key"))["key"]
    config_entry = MockConfigEntry(domain=DOMAIN, unique_id=server.url,
                                   data={"url": server.url, "key": key})
    config_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(config_entry.entry_id)
    await hass.async_block_till_done()
    yield config_entry
    await hass.config_entries.async_unload(config_entry.entry_id)
    await hass.async_block_till_done()
    # Leave the projectors off and the show stopped for the next test.
    await call(hass, server, "POST", "/api/emergency/clear")
    await call(hass, server, "POST", "/api/mapping/transport", {"action": "stop"})


# -- installing and adding -------------------------------------------------------


def _run_installer(server, folder: Path, code: str) -> subprocess.CompletedProcess:
    script = server.call("GET", f"/api/integration/homeassistant/install/{code}", raw=True)
    (folder / "install.sh").write_bytes(script)
    path = ":".join(p for p in os.environ["PATH"].split(":")
                    if not (Path(p) / "ha").exists())  # no Supervisor here: no restart
    return subprocess.run(["sh", str(folder / "install.sh")], cwd=folder, text=True,
                          capture_output=True, env={**os.environ, "PATH": path}, timeout=60)


async def test_the_install_line_puts_the_integration_in_custom_components(
        hass: HomeAssistant, server, tmp_path):
    line = await call(hass, server, "POST", "/api/integration/homeassistant/install-line")
    assert line["line"].startswith("curl -fsSL http://")
    assert line["line"].endswith(f"/install/{line['code']} | sh")

    outside = await hass.async_add_executor_job(_run_installer, server, tmp_path, line["code"])
    assert outside.returncode == 1
    assert "this is not Home Assistant's Terminal" in outside.stdout

    (tmp_path / "configuration.yaml").write_text("default_config:\n")
    (tmp_path / "custom_components" / DOMAIN).mkdir(parents=True)
    (tmp_path / "custom_components" / DOMAIN / "old.py").write_text("# an older copy\n")
    result = await hass.async_add_executor_job(_run_installer, server, tmp_path, line["code"])
    assert result.returncode == 0, result.stdout + result.stderr
    installed = tmp_path / "custom_components" / DOMAIN
    assert (installed / "manifest.json").is_file()
    assert (installed / "config_flow.py").is_file()
    assert not (installed / "old.py").exists()
    assert json.loads((installed / "pairing.json").read_text()) == {
        "url": server.url, "code": line["code"]}
    assert "Now restart Home Assistant" in result.stdout
    assert "Add integration" in result.stdout


async def test_adding_it_after_the_install_line_is_one_press(hass: HomeAssistant, server):
    line = await call(hass, server, "POST", "/api/integration/homeassistant/install-line")
    pairing = INTEGRATION / "pairing.json"
    pairing.write_text(json.dumps({"url": server.url, "code": line["code"]}))
    try:
        result = await hass.config_entries.flow.async_init(DOMAIN,
                                                           context={"source": SOURCE_USER})
        assert result["type"] is FlowResultType.FORM
        assert result["step_id"] == "pair"
        assert result["description_placeholders"] == {"url": server.url}

        result = await hass.config_entries.flow.async_configure(
            result["flow_id"], {"url": server.url})
        assert result["type"] is FlowResultType.CREATE_ENTRY, result
        assert result["title"] == "Projector Control"
        assert result["data"]["url"] == server.url
        assert not pairing.exists()
        await hass.async_block_till_done()
        assert state(hass, "switch.house_left_power") in ("on", "off")
        assert state(hass, "button.projector_control_emergency_stop") is not None
    finally:
        pairing.unlink(missing_ok=True)
        for config_entry in hass.config_entries.async_entries(DOMAIN):
            await hass.config_entries.async_remove(config_entry.entry_id)


async def test_a_used_code_falls_back_to_asking_for_a_key(hass: HomeAssistant, server):
    pairing = INTEGRATION / "pairing.json"
    pairing.write_text(json.dumps({"url": server.url, "code": "USEDUP2345"}))
    try:
        result = await hass.config_entries.flow.async_init(DOMAIN,
                                                           context={"source": SOURCE_USER})
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"], {"url": server.url})
        assert result["step_id"] == "key"
        assert result["errors"] == {"base": "pairing_used"}

        result = await hass.config_entries.flow.async_configure(
            result["flow_id"], {"url": server.url, "key": "not-a-key"})
        assert result["errors"] == {"base": "invalid_auth"}

        key = (await call(hass, server, "POST", "/api/integration/homeassistant/key"))["key"]
        # The address can be typed without http:// or a port.
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"], {"url": server.url.removeprefix("http://"), "key": key})
        assert result["type"] is FlowResultType.CREATE_ENTRY, result
        assert result["data"]["url"] == server.url
    finally:
        pairing.unlink(missing_ok=True)
        for config_entry in hass.config_entries.async_entries(DOMAIN):
            await hass.config_entries.async_remove(config_entry.entry_id)


async def test_a_wrong_address_says_it_could_not_connect(hass: HomeAssistant, server):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    assert result["step_id"] == "key"
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"url": "127.0.0.1:9", "key": "anything"})
    assert result["errors"] == {"base": "cannot_connect"}


# -- projectors --------------------------------------------------------------------


async def test_projector_power_input_shutter_and_temperatures(hass: HomeAssistant, entry):
    await eventually(hass, entry, lambda: state(hass, "switch.house_left_power") == "off",
                     "House Left to answer, off")
    assert state(hass, "binary_sensor.house_left_connected") == "on"

    await hass.services.async_call("switch", "turn_on",
                                   {"entity_id": "switch.house_left_power"}, blocking=True)
    await eventually(hass, entry,
                     lambda: state(hass, "sensor.house_left_power_state") == "on",
                     "House Left to finish warming up")
    assert state(hass, "switch.house_left_power") == "on"

    select = hass.states.get("select.house_left_input")
    assert "HDMI" in select.attributes["options"]
    await hass.services.async_call("select", "select_option",
                                   {"entity_id": "select.house_left_input", "option": "HDMI"},
                                   blocking=True)
    await eventually(hass, entry, lambda: state(hass, "select.house_left_input") == "HDMI",
                     "the input to read back as HDMI")

    await hass.services.async_call("switch", "turn_off",
                                   {"entity_id": "switch.house_left_shutter_open"},
                                   blocking=True)
    await eventually(hass, entry,
                     lambda: state(hass, "switch.house_left_shutter_open") == "off",
                     "the shutter to read back as closed")

    # Temperatures arrive with the deep poll, as new sensors.
    temperature = await eventually(
        hass, entry, lambda: hass.states.get("sensor.house_left_intake_air_temperature"),
        "the intake temperature sensor")
    assert float(temperature.state) > 0
    assert temperature.attributes["unit_of_measurement"] == "°C"

    await hass.services.async_call("switch", "turn_off",
                                   {"entity_id": "switch.house_left_power"}, blocking=True)
    await eventually(hass, entry,
                     lambda: state(hass, "sensor.house_left_power_state") == "off",
                     "House Left to cool down")


async def test_a_pjlink_projector_without_an_input_list_gets_no_input_selector(
        hass: HomeAssistant, entry):
    # Polled every 2 s here, a busy moment can briefly read as not answering.
    await eventually(hass, entry, lambda: state(hass, "switch.garage_power") in ("on", "off"),
                     "Garage to answer")
    assert hass.states.get("select.garage_input") is None


# -- the show ---------------------------------------------------------------------


async def test_pick_a_show_go_jump_pause_and_stop(hass: HomeAssistant, entry):
    assert state(hass, "sensor.projector_control_show_status") == "stopped"
    options = hass.states.get("select.projector_control_show").attributes["options"]
    assert options == ["Christmas", "Halloween"]

    await hass.services.async_call("select", "select_option",
                                   {"entity_id": "select.projector_control_show",
                                    "option": "Halloween"}, blocking=True)
    assert state(hass, "select.projector_control_show") == "Halloween"
    assert hass.states.get("select.projector_control_jump_to_cue").attributes["options"] == [
        "1. Intro", "2. Ghosts", "3. Finale"]

    await hass.services.async_call("button", "press",
                                   {"entity_id": "button.projector_control_go"}, blocking=True)
    await hass.async_block_till_done()
    assert state(hass, "sensor.projector_control_show_status") == "playing"
    assert state(hass, "sensor.projector_control_show_playing") == "Halloween"
    assert state(hass, "sensor.projector_control_cue") == "1. Intro"

    await hass.services.async_call("button", "press",
                                   {"entity_id": "button.projector_control_go"}, blocking=True)
    await hass.async_block_till_done()
    assert state(hass, "sensor.projector_control_cue") == "2. Ghosts"

    await hass.services.async_call("select", "select_option",
                                   {"entity_id": "select.projector_control_jump_to_cue",
                                    "option": "3. Finale"}, blocking=True)
    await hass.async_block_till_done()
    assert state(hass, "select.projector_control_jump_to_cue") == "3. Finale"

    # GO on the last cue: the server's own words come back.
    with pytest.raises(HomeAssistantError, match="already on the last cue"):
        await hass.services.async_call("button", "press",
                                       {"entity_id": "button.projector_control_go"},
                                       blocking=True)

    await hass.services.async_call("button", "press",
                                   {"entity_id": "button.projector_control_pause"},
                                   blocking=True)
    await hass.async_block_till_done()
    assert state(hass, "sensor.projector_control_show_status") == "paused"
    await hass.services.async_call("button", "press",
                                   {"entity_id": "button.projector_control_resume"},
                                   blocking=True)
    await hass.async_block_till_done()
    assert state(hass, "sensor.projector_control_show_status") == "playing"
    await hass.services.async_call("button", "press",
                                   {"entity_id": "button.projector_control_stop"},
                                   blocking=True)
    await hass.async_block_till_done()
    assert state(hass, "sensor.projector_control_show_status") == "stopped"


async def test_emergency_stop_from_home_assistant(hass: HomeAssistant, entry):
    await hass.services.async_call("switch", "turn_on",
                                   {"entity_id": "switch.house_left_power"}, blocking=True)
    await eventually(hass, entry,
                     lambda: state(hass, "sensor.house_left_power_state") == "on",
                     "House Left to warm up")
    await hass.services.async_call("select", "select_option",
                                   {"entity_id": "select.projector_control_show",
                                    "option": "Halloween"}, blocking=True)
    await hass.services.async_call("button", "press",
                                   {"entity_id": "button.projector_control_go"}, blocking=True)

    await hass.services.async_call("button", "press",
                                   {"entity_id": "button.projector_control_emergency_stop"},
                                   blocking=True)
    await hass.async_block_till_done()
    assert state(hass, "binary_sensor.projector_control_emergency_stop_on") == "on"
    assert state(hass, "sensor.projector_control_show_status") == "emergency_stop"
    await eventually(hass, entry,
                     lambda: state(hass, "sensor.house_left_power_state") in ("cooling", "off"),
                     "House Left to be turned off")

    with pytest.raises(HomeAssistantError, match="emergency stop is on"):
        await hass.services.async_call("button", "press",
                                       {"entity_id": "button.projector_control_go"},
                                       blocking=True)

    await hass.services.async_call("button", "press",
                                   {"entity_id": "button.projector_control_clear_emergency_stop"},
                                   blocking=True)
    await hass.async_block_till_done()
    assert state(hass, "binary_sensor.projector_control_emergency_stop_on") == "off"
    # Clearing turns nothing back on.
    assert state(hass, "sensor.projector_control_show_status") == "blackout"
    await eventually(hass, entry,
                     lambda: state(hass, "sensor.house_left_power_state") == "off",
                     "House Left to finish cooling down")


async def test_projector_scenes_become_home_assistant_scenes(hass: HomeAssistant, entry):
    assert hass.states.get("scene.projector_control_everything_off") is not None
    await hass.services.async_call("scene", "turn_on",
                                   {"entity_id": "scene.projector_control_everything_off"},
                                   blocking=True)


# -- keeping it working ------------------------------------------------------------------


async def test_disconnecting_in_projector_control_asks_for_a_new_key(
        hass: HomeAssistant, server, entry):
    await call(hass, server, "DELETE", "/api/integration/homeassistant/key")
    await entry.runtime_data.async_refresh()
    await hass.async_block_till_done()
    flows = hass.config_entries.flow.async_progress()
    assert [f["context"]["source"] for f in flows] == ["reauth"]

    await asyncio.sleep(1.1)
    key = (await call(hass, server, "POST", "/api/integration/homeassistant/key"))["key"]
    result = await hass.config_entries.flow.async_configure(flows[0]["flow_id"], {"key": key})
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "reauth_successful"
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED
    assert entry.data["key"] == key


async def test_projectors_added_later_appear_by_themselves(hass: HomeAssistant, server, entry):
    garage = next(p for p in await call(hass, server, "GET", "/api/projectors")
                  if p["name"] == "Garage")
    added = await call(hass, server, "POST", "/api/projectors", {
        "name": "Porch", "host": "127.0.0.1", "port": garage["port"], "driver": "pjlink"})
    try:
        await eventually(hass, entry, lambda: hass.states.get("switch.porch_power"),
                         "the new projector's power switch")
    finally:
        await call(hass, server, "DELETE", f"/api/projectors/{added['id']}")


async def test_the_update_entity_matches_the_server_copy(hass: HomeAssistant, server, entry,
                                                          tmp_path):
    update = hass.states.get("update.projector_control_integration")
    assert update.state == "off"
    manifest = json.loads((INTEGRATION / "manifest.json").read_text())
    assert update.attributes["installed_version"] == manifest["version"]
    assert update.attributes["latest_version"] == manifest["version"]

    # What "Install" does, on a copy.
    copy = tmp_path / "custom_components" / DOMAIN
    copy.mkdir(parents=True)
    (copy / "stale.py").write_text("")
    package = await call(hass, server, "GET",
                         "/api/integration/homeassistant/package.tar.gz", raw=True)
    await hass.async_add_executor_job(replace_integration, package, copy)
    assert (copy / "manifest.json").is_file()
    assert not (copy / "stale.py").exists()
    assert sorted(p.name for p in copy.parent.iterdir()) == [DOMAIN]
    shutil.rmtree(tmp_path / "custom_components")
