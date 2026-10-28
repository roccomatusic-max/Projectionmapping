"""The emergency stop: show black, automations held, every projector off."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

import asyncio

import pytest

from app.services.device_manager import manager
from tests.test_api import add_projector, api, login  # noqa: F401 - fixture


async def _power_on(client, headers, pid) -> None:
    worker = manager.get(pid)
    worker.driver.WARMUP_SECONDS = 0.0
    response = await client.post(f"/api/projectors/{pid}/power", headers=headers,
                                 json={"state": "on", "confirm": True})
    assert response.status_code == 200, response.text
    for _ in range(40):
        if client.sim.state.is_on:
            break
        await asyncio.sleep(0.05)
    assert client.sim.state.is_on
    status = await client.get(f"/api/projectors/{pid}/status?refresh=true", headers=headers)
    assert status.json()["power"] == "on"


async def _show_with_a_cue(client, headers) -> int:
    show = await client.post("/api/mapping/shows", headers=headers, json={"name": "House"})
    assert show.status_code == 201, show.text
    show_id = show.json()["id"]
    cue = await client.post(f"/api/mapping/shows/{show_id}/cues", headers=headers,
                            json={"name": "Snow"})
    assert cue.status_code == 201, cue.text
    return show_id


async def test_one_press_blacks_out_the_show_and_turns_every_projector_off(api):
    headers = await login(api)
    good = await add_projector(api, headers, name="House Left")
    dead = await add_projector(api, headers, name="Garage", port=1, command_timeout=1.0)
    await _power_on(api, headers, good)
    show_id = await _show_with_a_cue(api, headers)
    go = await api.post("/api/mapping/transport", headers=headers,
                        json={"action": "go", "show_id": show_id})
    assert go.json()["status"] == "playing"

    response = await api.post("/api/emergency/stop", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["transport"]["status"] == "blackout"
    assert body["transport"]["emergency"]["by"] == "admin"
    # Every projector answers for itself; never one verdict for all.
    by_name = {p["name"]: p for p in body["projectors"]}
    assert by_name["House Left"]["result"] == "off"
    assert by_name["House Left"]["shutter"] in ("accepted", "confirmed")
    assert by_name["House Left"]["detail"].startswith("Shutter closed")
    assert by_name["Garage"]["result"] == "failed"
    assert "may still be on" in by_name["Garage"]["detail"]
    assert dead in {p["projector_id"] for p in body["projectors"]}
    assert not api.sim.state.is_on
    assert api.sim.state.shutter_closed

    # Everyone sees the hold, the phone remote included.
    state = (await api.get("/api/emergency", headers=headers)).json()
    assert state["emergency"] is not None

    # GO waits until someone clears it, and says how.
    refused = await api.post("/api/mapping/transport", headers=headers,
                             json={"action": "go", "show_id": show_id})
    assert refused.status_code == 409
    assert "emergency stop is on" in refused.json()["detail"]

    events = (await api.get("/api/events?limit=20", headers=headers)).json()
    assert any(e["kind"] == "emergency_stop" for e in events)

    cleared = await api.post("/api/emergency/clear", headers=headers)
    assert cleared.status_code == 200
    assert cleared.json()["transport"]["emergency"] is None
    # Clearing does not start anything: still black until GO.
    assert cleared.json()["transport"]["status"] == "blackout"
    assert not api.sim.state.is_on
    go = await api.post("/api/mapping/transport", headers=headers,
                        json={"action": "go", "show_id": show_id})
    assert go.status_code == 200
    assert go.json()["status"] == "playing"


async def test_a_projector_already_off_is_left_alone(api):
    headers = await login(api)
    pid = await add_projector(api, headers)
    status = await api.get(f"/api/projectors/{pid}/status?refresh=true", headers=headers)
    assert status.json()["power"] == "off"
    before = api.sim.state.command_count

    body = (await api.post("/api/emergency/stop", headers=headers)).json()
    [result] = body["projectors"]
    assert result["result"] == "already_off"
    assert result["power"] is None
    assert api.sim.state.command_count == before


async def test_a_projector_warming_up_is_turned_off_as_soon_as_it_accepts(api, monkeypatch):
    from app.services import device_manager

    monkeypatch.setattr(device_manager.settings, "power_queue_interval", 0.1)
    headers = await login(api)
    pid = await add_projector(api, headers)
    api.sim.state.warmup_seconds = 2.5
    worker = manager.get(pid)
    worker.driver.WARMUP_SECONDS = 2.5
    on = await api.post(f"/api/projectors/{pid}/power", headers=headers,
                        json={"state": "on", "confirm": True})
    assert on.status_code == 200

    body = (await api.post("/api/emergency/stop", headers=headers)).json()
    [result] = body["projectors"]
    assert result["result"] == "waiting", result
    assert "by itself" in result["detail"]

    for _ in range(80):
        api.sim.state.tick()
        if api.sim.state.power.value in ("cooling", "standby"):
            break
        await asyncio.sleep(0.1)
    assert api.sim.state.power.value in ("cooling", "standby")


async def test_running_automations_stop_and_scheduled_ones_wait(api):
    import app.services.automation as automation_module

    headers = await login(api)
    pid = await add_projector(api, headers)
    created = await api.post("/api/automations", headers=headers, json={
        "name": "Slow start", "trigger_type": "manual", "abort_on_failure": True,
        "steps": [
            {"type": "delay", "seconds": 30},
            {"type": "command", "target": {"type": "projector", "id": pid},
             "capability": "power.set", "params": {"state": "on"}},
        ],
    })
    assert created.status_code == 201, created.text
    automation_id = created.json()["id"]

    run = asyncio.create_task(api.post(f"/api/automations/{automation_id}/execute",
                                       headers=headers,
                                       json={"capability": "run", "confirm": True}))
    for _ in range(50):
        if automation_id in automation_module.engine._halts:
            break
        await asyncio.sleep(0.05)

    body = (await api.post("/api/emergency/stop", headers=headers)).json()
    assert body["automations_stopped"] == ["Slow start"]
    finished = (await asyncio.wait_for(run, 5)).json()
    assert finished["status"] == "aborted"
    assert "emergency stop" in finished["error"]
    assert not api.sim.state.is_on

    # By hand: refused while the stop is on.
    again = await api.post(f"/api/automations/{automation_id}/execute", headers=headers,
                           json={"capability": "run", "confirm": True})
    assert again.json()["status"] == "aborted"
    assert "emergency stop is on" in again.json()["error"]

    # On a schedule: marked as having had its turn, not run, not run late.
    scheduled = await api.post("/api/automations", headers=headers, json={
        "name": "Every minute", "trigger_type": "cron",
        "schedule": {"cron": "* * * * *"}, "enabled": True,
        "steps": [{"type": "command", "target": {"type": "projector", "id": pid},
                   "capability": "power.set", "params": {"state": "on"}}],
    })
    assert scheduled.status_code == 201, scheduled.text
    await automation_module.engine._tick()
    await asyncio.sleep(0.2)
    listed = {a["name"]: a for a in (await api.get("/api/automations", headers=headers)).json()}
    assert listed["Every minute"]["last_status"] == "held"
    assert not api.sim.state.is_on


async def test_the_stop_stays_on_after_a_restart(api):
    import app.services.emergency as emergency_module
    import app.services.mapping as mapping_module
    from app.schemas.mapping import TransportState

    headers = await login(api)
    await api.post("/api/emergency/stop", headers=headers)

    # A restart starts the transport from nothing; the record brings it back.
    mapping_module.transport._state = TransportState()
    await emergency_module.emergency.restore()
    state = mapping_module.transport.snapshot()
    assert state.emergency is not None
    assert state.emergency.by == "admin"
    assert state.status == "blackout"

    await api.post("/api/emergency/clear", headers=headers)
    mapping_module.transport._state = TransportState()
    await emergency_module.emergency.restore()
    assert mapping_module.transport.snapshot().emergency is None


async def test_calibration_waits_for_the_stop_to_be_cleared(api):
    headers = await login(api)
    await api.post("/api/emergency/stop", headers=headers)
    response = await api.post("/api/mapping/outputs/1/calibrate", headers=headers,
                              json={"camera_id": 1})
    assert response.status_code == 409
    assert "emergency stop is on" in response.json()["detail"]


@pytest.mark.parametrize("role", ["viewer"])
async def test_a_viewer_cannot_press_it(api, role):
    headers = await login(api)
    created = await api.post("/api/auth/users", headers=headers, json={
        "username": "watcher", "password": "watcher-password-123", "role": role})
    assert created.status_code == 201, created.text
    viewer = await login(api, "watcher", "watcher-password-123")
    assert (await api.post("/api/emergency/stop", headers=viewer)).status_code == 403
