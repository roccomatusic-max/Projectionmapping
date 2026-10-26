"""API: authentication, RBAC, confirmation gating, group dispatch, scheduling."""

from __future__ import annotations

import contextlib
import os
import shutil
import tempfile
from datetime import UTC

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.drivers import CommandOutcome


@pytest_asyncio.fixture
async def api(panasonic_sim, monkeypatch):
    """A fresh app instance backed by a throwaway SQLite file."""
    handle, path = tempfile.mkstemp(suffix=".db")
    os.close(handle)
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{path}")
    # The media folder's parent is the data folder (key files, backups).
    data = tempfile.mkdtemp(prefix="data-")
    media = os.path.join(data, "media")
    os.mkdir(media)
    monkeypatch.setenv("MEDIA_DIR", media)

    # Rebuild the settings-dependent modules against this database.
    import importlib

    from app import config as config_module

    config_module.get_settings.cache_clear()
    config_module.settings = config_module.get_settings()

    from app.db import session as session_module
    importlib.reload(session_module)
    import app.services.alerts as alerts_module
    import app.services.audit as audit_module
    import app.services.automation as automation_module
    import app.services.backups as backups_module
    import app.services.emergency as emergency_module
    import app.services.heater as heater_module
    import app.services.mapping as mapping_module
    import app.services.minipc_updates as minipc_updates_module
    import app.services.monitor as monitor_module
    import app.services.setup_guide as setup_guide_module
    import app.services.tonight as tonight_module
    import app.services.walkthrough as walkthrough_module
    for module in (audit_module, monitor_module, alerts_module, automation_module,
                   mapping_module, emergency_module, tonight_module, minipc_updates_module,
                   heater_module, setup_guide_module, backups_module, walkthrough_module):
        importlib.reload(module)
    import app.api.deps as deps_module
    import app.api.routes.auth as auth_routes
    import app.api.routes.automation as automation_routes
    import app.api.routes.backups as backup_routes
    import app.api.routes.emergency as emergency_routes
    import app.api.routes.enclosure as enclosure_routes
    import app.api.routes.groups as group_routes
    import app.api.routes.heaters as heater_routes
    import app.api.routes.integration as integration_routes
    import app.api.routes.mapping as mapping_routes
    import app.api.routes.mapping_camera as camera_routes
    import app.api.routes.mapping_players as player_routes
    import app.api.routes.mapping_scenes as scene_routes
    import app.api.routes.monitoring as monitoring_routes
    import app.api.routes.phone_alerts as phone_alert_routes
    import app.api.routes.projectors as projector_routes
    import app.api.routes.system as system_routes
    import app.api.routes.tonight as tonight_routes
    import app.api.routes.updates as update_routes
    import app.api.routes.walkthrough as walkthrough_routes
    import app.api.routes.ws as ws_routes
    importlib.reload(deps_module)
    for module in (auth_routes, projector_routes, group_routes, monitoring_routes,
                   automation_routes, enclosure_routes, integration_routes,
                   mapping_routes, player_routes, camera_routes, scene_routes, ws_routes, system_routes,
                   update_routes, emergency_routes, tonight_routes, phone_alert_routes,
                   heater_routes, backup_routes, walkthrough_routes):
        importlib.reload(module)
    import app.main as main_module
    importlib.reload(main_module)

    async with main_module.app.router.lifespan_context(main_module.app):
        transport = ASGITransport(app=main_module.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            client.sim = panasonic_sim
            yield client
    for suffix in ("", "-wal", "-shm"):
        with contextlib.suppress(FileNotFoundError):
            os.unlink(path + suffix)
    shutil.rmtree(data, ignore_errors=True)


async def login(client, username="admin", password="test-admin-password") -> dict:
    response = await client.post("/api/auth/login",
                                 json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def add_projector(client, headers, name="House Left", **overrides) -> int:
    body = {"name": name, "host": "127.0.0.1", "port": client.sim.actual_port,
            "driver": "panasonic_pt_dz13k", "command_gap": 0.0, "command_timeout": 3.0}
    body.update(overrides)
    response = await client.post("/api/projectors", headers=headers, json=body)
    assert response.status_code == 201, response.text
    return response.json()["id"]


# -- authentication ---------------------------------------------------------


async def test_unauthenticated_requests_are_rejected(api):
    for method, path in [("get", "/api/projectors"), ("get", "/api/overview"),
                         ("get", "/api/events"), ("get", "/api/alerts")]:
        response = await getattr(api, method)(path)
        assert response.status_code == 401, f"{path} allowed anonymous access"


async def test_bad_token_is_rejected(api):
    response = await api.get("/api/projectors",
                             headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 401


async def test_wrong_password_rejected(api):
    response = await api.post("/api/auth/login",
                              json={"username": "admin", "password": "wrong"})
    assert response.status_code == 401
    assert "Invalid username or password" in response.text


async def test_login_does_not_reveal_whether_a_user_exists(api):
    unknown = await api.post("/api/auth/login",
                             json={"username": "nobody", "password": "x" * 12})
    wrong = await api.post("/api/auth/login",
                           json={"username": "admin", "password": "x" * 12})
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json()["detail"] == wrong.json()["detail"]


async def test_device_password_is_never_returned(api):
    headers = await login(api)
    secret = "s3cret-device-password"
    pid = await add_projector(api, headers, name="Secret", password=secret)
    body = (await api.get(f"/api/projectors/{pid}", headers=headers)).json()
    assert body["has_password"] is True
    assert secret not in str(body)
    assert "password" not in body
    # Nor in the list view.
    listing = (await api.get("/api/projectors", headers=headers)).json()
    assert secret not in str(listing)


# -- RBAC -------------------------------------------------------------------


@pytest.fixture
async def roles(api):
    admin = await login(api)
    for name, role in (("operator1", "operator"), ("viewer1", "viewer")):
        response = await api.post("/api/auth/users", headers=admin, json={
            "username": name, "password": "a-long-test-password", "role": role,
        })
        assert response.status_code == 201, response.text
    return {
        "admin": admin,
        "operator": await login(api, "operator1", "a-long-test-password"),
        "viewer": await login(api, "viewer1", "a-long-test-password"),
    }


async def test_viewer_cannot_send_commands(api, roles):
    pid = await add_projector(api, roles["admin"])
    response = await api.post(f"/api/projectors/{pid}/power", headers=roles["viewer"],
                              json={"state": "on", "confirm": True})
    assert response.status_code == 403
    assert "operator" in response.json()["detail"]


async def test_viewer_cannot_create_projectors(api, roles):
    response = await api.post("/api/projectors", headers=roles["viewer"], json={
        "name": "Sneaky", "host": "127.0.0.1", "port": 1024,
    })
    assert response.status_code == 403


async def test_operator_cannot_change_configuration(api, roles):
    pid = await add_projector(api, roles["admin"])
    response = await api.patch(f"/api/projectors/{pid}", headers=roles["operator"],
                               json={"host": "10.0.0.9"})
    assert response.status_code == 403


async def test_operator_can_send_commands(api, roles):
    pid = await add_projector(api, roles["admin"])
    response = await api.post(f"/api/projectors/{pid}/power", headers=roles["operator"],
                              json={"state": "on", "confirm": True})
    assert response.status_code == 200
    assert response.json()["outcome"] == CommandOutcome.ACCEPTED.value


async def test_viewer_can_read(api, roles):
    await add_projector(api, roles["admin"])
    assert (await api.get("/api/projectors", headers=roles["viewer"])).status_code == 200
    assert (await api.get("/api/overview", headers=roles["viewer"])).status_code == 200


async def test_last_admin_cannot_be_deleted(api, roles):
    users = (await api.get("/api/auth/users", headers=roles["admin"])).json()
    admin_id = next(u["id"] for u in users if u["username"] == "admin")
    response = await api.delete(f"/api/auth/users/{admin_id}", headers=roles["admin"])
    assert response.status_code == 400


# -- confirmation gating ----------------------------------------------------


async def test_power_requires_confirmation(api):
    headers = await login(api)
    pid = await add_projector(api, headers)
    response = await api.post(f"/api/projectors/{pid}/power", headers=headers,
                              json={"state": "on"})
    assert response.status_code == 428
    assert "power on" in response.json()["detail"]


async def test_shutter_requires_confirmation(api):
    headers = await login(api)
    pid = await add_projector(api, headers)
    response = await api.post(f"/api/projectors/{pid}/shutter", headers=headers,
                              json={"state": "closed"})
    assert response.status_code == 428


async def test_confirmed_command_runs(api):
    headers = await login(api)
    pid = await add_projector(api, headers)
    response = await api.post(f"/api/projectors/{pid}/shutter", headers=headers,
                              json={"state": "closed", "confirm": True})
    assert response.status_code == 200
    assert response.json()["outcome"] == CommandOutcome.ACCEPTED.value
    assert api.sim.state.shutter_closed is True


# -- capability gating through the API --------------------------------------


async def test_gated_lens_command_refused_via_api(api):
    headers = await login(api)
    pid = await add_projector(api, headers)
    response = await api.post(f"/api/projectors/{pid}/command", headers=headers, json={
        "capability": "lens.shift_h", "params": {"direction": 1}, "confirm": True,
    })
    assert response.status_code == 200
    body = response.json()
    assert body["outcome"] == CommandOutcome.UNSUPPORTED.value
    assert body["raw_response"] is None


async def test_opting_in_enables_the_gated_command(api):
    headers = await login(api)
    pid = await add_projector(api, headers)
    assert (await api.patch(f"/api/projectors/{pid}", headers=headers,
                            json={"allow_unverified_commands": True})).status_code == 200
    response = await api.post(f"/api/projectors/{pid}/command", headers=headers, json={
        "capability": "lens.shift_h", "params": {"direction": 1}, "confirm": True,
    })
    assert response.json()["outcome"] == CommandOutcome.ACCEPTED.value


async def test_capabilities_endpoint_flags_gated_commands(api):
    headers = await login(api)
    pid = await add_projector(api, headers)
    body = (await api.get(f"/api/projectors/{pid}/capabilities",
                          headers=headers)).json()
    by_name = {c["name"]: c for c in body["capabilities"]}
    assert by_name["power.set"]["requires_opt_in"] is False
    assert by_name["lens.shift_h"]["requires_opt_in"] is True
    assert by_name["lens.shift_h"]["caveat"]


# -- group dispatch ---------------------------------------------------------


async def test_group_command_reports_per_device_results(api):
    headers = await login(api)
    good1 = await add_projector(api, headers, name="House Left")
    good2 = await add_projector(api, headers, name="House Centre")
    bad = await add_projector(api, headers, name="House Right", port=1,
                              command_timeout=1.0)

    group = await api.post("/api/groups", headers=headers, json={
        "name": "House Projection Mapping",
        "projector_ids": [good1, good2, bad],
    })
    assert group.status_code == 201, group.text
    group_id = group.json()["id"]

    response = await api.post(f"/api/groups/{group_id}/commands", headers=headers,
                              json={"capability": "power.get", "confirm": True})
    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == {"total": 3, "succeeded": 2, "failed": 1}
    by_name = {r["name"]: r for r in body["results"]}
    assert by_name["House Left"]["outcome"] == CommandOutcome.OK.value
    assert by_name["House Right"]["outcome"] == CommandOutcome.CONNECTION_ERROR.value
    # The field is 'dispatched_at', not 'executed_at': concurrent dispatch is
    # not frame-accurate synchronisation.
    assert "dispatched_at" in body


async def test_group_power_requires_confirmation(api):
    headers = await login(api)
    pid = await add_projector(api, headers)
    group_id = (await api.post("/api/groups", headers=headers, json={
        "name": "Front of House", "projector_ids": [pid],
    })).json()["id"]
    response = await api.post(f"/api/groups/{group_id}/commands", headers=headers,
                              json={"capability": "power.set", "params": {"state": "on"}})
    assert response.status_code == 428


async def test_selection_dispatch_reaches_each_projector(api):
    """The Control Center's ad-hoc selection path.

    Regression: the static /selection/ path was declared after /{group_id},
    so FastAPI parsed "selection" as a group id and answered 422.
    """
    headers = await login(api)
    good = await add_projector(api, headers, name="Sel A")
    bad = await add_projector(api, headers, name="Sel B", port=1, command_timeout=1.0)
    response = await api.post(
        f"/api/groups/selection/commands?projector_ids={good}&projector_ids={bad}",
        headers=headers, json={"capability": "power.get", "confirm": True},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["summary"] == {"total": 2, "succeeded": 1, "failed": 1}
    assert {r["name"] for r in body["results"]} == {"Sel A", "Sel B"}


async def test_selection_dispatch_requires_at_least_one_id(api):
    headers = await login(api)
    response = await api.post("/api/groups/selection/commands", headers=headers,
                              json={"capability": "power.get", "confirm": True})
    assert response.status_code == 422


async def test_all_dispatch_hits_every_enabled_projector(api):
    headers = await login(api)
    await add_projector(api, headers, name="All A")
    await add_projector(api, headers, name="All B")
    response = await api.post("/api/groups/all/commands", headers=headers,
                              json={"capability": "shutter.get", "confirm": True})
    assert response.status_code == 200, response.text
    assert response.json()["summary"]["total"] == 2


async def test_empty_group_is_rejected(api):
    headers = await login(api)
    group_id = (await api.post("/api/groups", headers=headers,
                               json={"name": "Empty"})).json()["id"]
    response = await api.post(f"/api/groups/{group_id}/commands", headers=headers,
                              json={"capability": "power.get", "confirm": True})
    assert response.status_code == 400


async def test_group_rejects_unknown_projector_ids(api):
    headers = await login(api)
    response = await api.post("/api/groups", headers=headers, json={
        "name": "Bad members", "projector_ids": [998, 999],
    })
    assert response.status_code == 400
    assert "998" in response.json()["detail"]


# -- status, liveness, telemetry --------------------------------------------


async def test_status_refresh_polls_the_device(api):
    headers = await login(api)
    pid = await add_projector(api, headers)
    response = await api.get(f"/api/projectors/{pid}/status?refresh=true",
                             headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["online"] is True
    assert body["power"] == "off"
    assert body["stale"] is False


async def test_equipment_readings_are_served_after_a_deep_poll(api):
    """Serial, firmware, temperature and fan reach the UI with their
    availability, so "not supported by this protocol" is not shown as a gap."""
    headers = await login(api)
    pid = await add_projector(api, headers)
    before = (await api.get(f"/api/projectors/{pid}", headers=headers)).json()
    assert before["state"]["equipment"] == {}

    await api.get(f"/api/projectors/{pid}/status?refresh=true", headers=headers)
    equipment = (await api.get(f"/api/projectors/{pid}", headers=headers)).json()["state"]["equipment"]
    for field in ("serial_number", "firmware", "temperature", "fan", "model"):
        assert field in equipment
    # The PT-DZ13K LAN protocol has no confirmed serial query: say so, never invent one.
    assert equipment["serial_number"]["availability"] == "unsupported"
    assert equipment["serial_number"]["value"] is None
    assert equipment["serial_number"]["note"]


async def test_never_reported_device_is_offline_not_online(api):
    """A projector that has never answered must not show as online."""
    headers = await login(api)
    pid = await add_projector(api, headers, name="Unpolled", port=1)
    body = (await api.get(f"/api/projectors/{pid}/status", headers=headers)).json()
    assert body["online"] is False
    assert body["stale"] is True
    assert body["power"] == "unknown"


async def test_connectivity_test_endpoint(api):
    headers = await login(api)
    pid = await add_projector(api, headers)
    body = (await api.post(f"/api/projectors/{pid}/test", headers=headers)).json()
    assert body["reachable"] is True
    assert body["authenticated"] is True
    assert "authenticated" in body["detail"]


async def test_connectivity_test_in_protect_mode_without_password_fails(api):
    """A projector asking for a password must not pass the test without one,
    and saving the password must make it pass straight away."""
    api.sim.state.password = "panasonic"
    headers = await login(api)
    pid = await add_projector(api, headers)
    body = (await api.post(f"/api/projectors/{pid}/test", headers=headers)).json()
    assert body["reachable"] is True
    assert body["authenticated"] is False
    assert body["outcome"] == "auth_failed"
    assert "Control password" in body["detail"]

    response = await api.patch(f"/api/projectors/{pid}", headers=headers,
                               json={"password": "panasonic"})
    assert response.status_code == 200, response.text
    body = (await api.post(f"/api/projectors/{pid}/test", headers=headers)).json()
    assert body["authenticated"] is True, body


async def test_connectivity_test_on_dead_host_explains_itself(api):
    headers = await login(api)
    pid = await add_projector(api, headers, name="Dead", port=1)
    body = (await api.post(f"/api/projectors/{pid}/test", headers=headers)).json()
    assert body["reachable"] is False
    assert "No TCP connection" in body["detail"]


async def test_command_history_records_the_wire_frame(api):
    headers = await login(api)
    pid = await add_projector(api, headers)
    await api.post(f"/api/projectors/{pid}/shutter", headers=headers,
                   json={"state": "closed", "confirm": True})
    body = (await api.get(f"/api/projectors/{pid}/commands", headers=headers)).json()
    assert body["commands"]
    entry = body["commands"][0]
    assert entry["capability"] == "shutter.set"
    assert entry["raw_request"] == "00OSH:1"
    assert entry["username"] == "admin"


# -- automation -------------------------------------------------------------


async def test_automation_runs_steps_and_reports_failures(api):
    headers = await login(api)
    good = await add_projector(api, headers, name="Good")
    bad = await add_projector(api, headers, name="Bad", port=1, command_timeout=1.0)

    response = await api.post("/api/automations", headers=headers, json={
        "name": "Startup", "trigger_type": "manual", "abort_on_failure": False,
        "steps": [
            {"type": "command", "label": "Shutters closed",
             "target": {"type": "projector", "id": good},
             "capability": "shutter.set", "params": {"state": "closed"}},
            {"type": "command", "label": "Touch the dead one",
             "target": {"type": "projector", "id": bad},
             "capability": "power.get"},
        ],
    })
    assert response.status_code == 201, response.text
    automation_id = response.json()["id"]

    run = await api.post(f"/api/automations/{automation_id}/execute", headers=headers,
                         json={"capability": "run", "confirm": True})
    assert run.status_code == 200, run.text
    body = run.json()
    assert body["status"] == "partial"
    assert body["steps"][0]["ok"] is True
    assert body["steps"][1]["ok"] is False
    assert "Bad" in body["steps"][1]["error"]


async def test_automation_requires_confirmation(api):
    headers = await login(api)
    automation_id = (await api.post("/api/automations", headers=headers, json={
        "name": "Needs confirm", "steps": [],
    })).json()["id"]
    response = await api.post(f"/api/automations/{automation_id}/execute",
                              headers=headers, json={"capability": "run"})
    assert response.status_code == 428


async def test_automation_rejects_unknown_step_type(api):
    headers = await login(api)
    response = await api.post("/api/automations", headers=headers, json={
        "name": "Broken", "steps": [{"type": "launch_missiles"}],
    })
    assert response.status_code == 422
    assert "unknown type" in response.text


async def test_wait_state_step_waits_for_the_real_state(api):
    headers = await login(api)
    api.sim.state.warmup_seconds = 0.5
    pid = await add_projector(api, headers, name="Waiter")
    automation_id = (await api.post("/api/automations", headers=headers, json={
        "name": "Power up and wait", "abort_on_failure": True,
        "steps": [
            {"type": "command", "target": {"type": "projector", "id": pid},
             "capability": "power.set", "params": {"state": "on"}},
            {"type": "wait_state", "target": {"type": "projector", "id": pid},
             "capability": "power.get", "expect": "on",
             "timeout": 15, "interval": 0.3},
        ],
    })).json()["id"]

    body = (await api.post(f"/api/automations/{automation_id}/execute", headers=headers,
                           json={"capability": "run", "confirm": True})).json()
    assert body["status"] == "success", body
    assert "reached 'on'" in body["steps"][1]["detail"]


async def test_scene_activation_reports_results(api):
    headers = await login(api)
    pid = await add_projector(api, headers, name="Scene PJ")
    scene_id = (await api.post("/api/scenes", headers=headers, json={
        "name": "Emergency Blackout",
        "actions": [{"target": {"type": "projector", "id": pid},
                     "capability": "shutter.set", "params": {"state": "closed"}}],
    })).json()["id"]
    body = (await api.post(f"/api/scenes/{scene_id}/activate", headers=headers,
                           json={"capability": "activate", "confirm": True})).json()
    assert body["failed"] == 0
    assert body["total"] == 1
    assert api.sim.state.shutter_closed is True


# -- enclosure --------------------------------------------------------------


async def test_enclosure_reading_ingest_and_staleness(api):
    headers = await login(api)
    enclosure_id = (await api.post("/api/enclosures", headers=headers, json={
        "name": "House Enclosure", "temp_critical_c": 50.0,
    })).json()["id"]

    response = await api.post(f"/api/enclosures/{enclosure_id}/readings",
                              headers=headers,
                              json={"metric": "internal_temp_c", "value": 31.5})
    assert response.status_code == 202

    body = (await api.get("/api/enclosures", headers=headers)).json()[0]
    assert body["latest"]["internal_temp_c"]["value"] == 31.5
    assert body["latest"]["internal_temp_c"]["stale"] is False


async def test_enclosure_check_blocks_startup_when_no_data(api):
    """Unknown conditions are not treated as safe."""
    headers = await login(api)
    enclosure_id = (await api.post("/api/enclosures", headers=headers, json={
        "name": "Silent Enclosure",
    })).json()["id"]
    automation_id = (await api.post("/api/automations", headers=headers, json={
        "name": "Guarded startup", "abort_on_failure": True,
        "steps": [{"type": "check_enclosure", "enclosure_id": enclosure_id,
                   "require_fresh": True}],
    })).json()["id"]

    body = (await api.post(f"/api/automations/{automation_id}/execute", headers=headers,
                           json={"capability": "run", "confirm": True})).json()
    assert body["status"] == "failed"
    assert "no sensor readings" in body["steps"][0]["error"]


async def test_enclosure_check_blocks_on_critical_temperature(api):
    headers = await login(api)
    enclosure_id = (await api.post("/api/enclosures", headers=headers, json={
        "name": "Hot Enclosure", "temp_critical_c": 50.0,
        "block_startup_on_fault": True,
    })).json()["id"]
    await api.post(f"/api/enclosures/{enclosure_id}/readings", headers=headers,
                   json={"metric": "internal_temp_c", "value": 61.0})

    automation_id = (await api.post("/api/automations", headers=headers, json={
        "name": "Hot startup", "abort_on_failure": True,
        "steps": [{"type": "check_enclosure", "enclosure_id": enclosure_id}],
    })).json()["id"]
    body = (await api.post(f"/api/automations/{automation_id}/execute", headers=headers,
                           json={"capability": "run", "confirm": True})).json()
    assert body["status"] == "failed"
    assert "61.0" in body["steps"][0]["error"]


# -- integration + misc -----------------------------------------------------


async def test_homeassistant_discovery_lists_real_attributes_only(api):
    headers = await login(api)
    pid = await add_projector(api, headers, name="HA PJ")
    await api.get(f"/api/projectors/{pid}/status?refresh=true", headers=headers)
    body = (await api.get("/api/integration/homeassistant/discovery",
                          headers=headers)).json()
    entity = body["projectors"][0]
    assert entity["name"] == "HA PJ"
    assert entity["available"] is True
    # No temperature attribute: the model exposes no numeric temperature.
    assert "temperature" not in entity["attributes"]
    assert entity["commands"]["power_on"]["body"]["confirm"] is True


async def test_maintenance_csv_export(api):
    headers = await login(api)
    pid = await add_projector(api, headers)
    await api.post("/api/maintenance", headers=headers, json={
        "projector_id": pid, "kind": "lamp_replacement",
        "lamp_index": 2, "hours_at_service": 2100, "notes": "Lamp 2 swapped",
    })
    response = await api.get("/api/maintenance/export.csv", headers=headers)
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "lamp_replacement" in response.text
    assert "Lamp 2 swapped" in response.text


async def test_health_endpoint_is_public(api):
    response = await api.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_overview_counts_live_devices(api):
    headers = await login(api)
    pid = await add_projector(api, headers)
    await api.get(f"/api/projectors/{pid}/status?refresh=true", headers=headers)
    body = (await api.get("/api/overview", headers=headers)).json()
    assert body["total"] == 1
    assert body["online"] == 1
    assert body["standby"] == 1


# -- service tokens and the ingest role ---------------------------------------


async def test_ingest_role_can_post_readings_and_nothing_else(api, roles):
    admin = roles["admin"]
    assert (await api.post("/api/auth/users", headers=admin, json={
        "username": "enclosure-esp32", "password": "a-long-sensor-password", "role": "ingest",
    })).status_code == 201
    sensor = await login(api, "enclosure-esp32", "a-long-sensor-password")
    enclosure_id = (await api.post("/api/enclosures", headers=admin,
                                   json={"name": "Ingest Box"})).json()["id"]

    posted = await api.post(f"/api/enclosures/{enclosure_id}/readings", headers=sensor,
                            json={"metric": "internal_temp_c", "value": 28.5})
    assert posted.status_code == 202

    # Read access and control are both refused for an ingest-only account.
    assert (await api.get("/api/projectors", headers=sensor)).status_code == 403
    assert (await api.get("/api/enclosures", headers=sensor)).status_code == 403
    pid = await add_projector(api, admin, name="Not for sensors")
    assert (await api.post(f"/api/projectors/{pid}/power", headers=sensor,
                           json={"state": "on", "confirm": True})).status_code == 403


async def test_service_token_outlives_a_session_and_carries_the_role(api, roles):
    admin = roles["admin"]
    response = await api.post("/api/auth/tokens", headers=admin,
                              json={"username": "operator1", "days": 30})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["role"] == "operator"
    from app.core.security import decode_access_token
    claims = decode_access_token(body["access_token"])
    assert claims["sub"] == "operator1"
    # Expiry is roughly 30 days out, not the 12-hour interactive default.
    from datetime import datetime
    assert claims["exp"] - datetime.now(UTC).timestamp() > 29 * 24 * 3600

    headers = {"Authorization": f"Bearer {body['access_token']}"}
    assert (await api.get("/api/projectors", headers=headers)).status_code == 200


async def test_service_tokens_are_admin_only(api, roles):
    response = await api.post("/api/auth/tokens", headers=roles["operator"],
                              json={"username": "operator1"})
    assert response.status_code == 403


async def test_deactivated_user_revokes_its_tokens(api, roles):
    admin = roles["admin"]
    token = (await api.post("/api/auth/tokens", headers=admin,
                            json={"username": "viewer1"})).json()["access_token"]
    users = (await api.get("/api/auth/users", headers=admin)).json()
    viewer_id = next(u["id"] for u in users if u["username"] == "viewer1")
    assert (await api.delete(f"/api/auth/users/{viewer_id}", headers=admin)).status_code == 204
    response = await api.get("/api/projectors", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


async def test_command_source_is_recorded_from_the_client_header(api):
    headers = await login(api)
    pid = await add_projector(api, headers)
    await api.post(f"/api/projectors/{pid}/shutter", headers={**headers, "X-Client": "ui"},
                   json={"state": "closed", "confirm": True})
    await api.post(f"/api/projectors/{pid}/shutter", headers=headers,
                   json={"state": "open", "confirm": True})
    rows = (await api.get(f"/api/projectors/{pid}/commands", headers=headers)).json()["commands"]
    assert [r["source"] for r in rows[:2]] == ["api", "ui"]


async def test_usage_analytics_endpoint(api):
    headers = await login(api)
    pid = await add_projector(api, headers)
    await api.get(f"/api/projectors/{pid}/status?refresh=true", headers=headers)
    response = await api.get("/api/analytics/usage?days=7", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert "estimate" in body["note"]
    assert isinstance(body["usage"], list)


async def test_temperatures_are_recorded_and_charted(api):
    """A deep poll stores one sample per sensor; the chart endpoint serves them."""
    headers = await login(api)
    pid = await add_projector(api, headers)
    await api.get(f"/api/projectors/{pid}/status?refresh=true", headers=headers)

    rows = (await api.get(f"/api/projectors/{pid}/telemetry?prefix=temp_",
                          headers=headers)).json()["points"]
    assert sorted(r["metric"] for r in rows) == ["temp_exhaust", "temp_intake", "temp_optics"]

    response = await api.get(f"/api/analytics/temperatures?projector_id={pid}&hours=1",
                             headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert [s["key"] for s in body["sensors"]] == ["intake", "exhaust", "optics"]
    intake = body["sensors"][0]
    assert intake["label"] == "Intake air"
    assert intake["latest"]["celsius"] == 24.0 and intake["latest"]["fahrenheit"] == 75.2
    assert intake["state"] == "ok" and intake["limit_celsius"] == 45.0
    assert body["sensors"][1]["limit_celsius"] is None  # no published exhaust limit
    assert body["hottest"]["key"] == "exhaust"
    assert body["warnings"] == []
    assert len(body["points"]) == 240
    assert sum(1 for p in body["points"] if p["intake"] is not None) == 1


async def test_temperature_warning_near_the_limit(api):
    from datetime import datetime, timedelta

    from app.db.models import Telemetry
    from app.db.session import session_scope

    headers = await login(api)
    pid = await add_projector(api, headers)
    now = datetime.now(UTC)
    async with session_scope() as session:
        session.add_all([
            # Hot an hour ago, normal now: the warning says it was, not is.
            Telemetry(projector_id=pid, metric="temp_intake", value_num=42.0,
                      recorded_at=now - timedelta(hours=2)),
            Telemetry(projector_id=pid, metric="temp_intake", value_num=30.0,
                      recorded_at=now - timedelta(seconds=30)),
        ])
    body = (await api.get(f"/api/analytics/temperatures?projector_id={pid}&hours=12",
                          headers=headers)).json()
    intake = body["sensors"][0]
    assert intake["state"] == "ok" and intake["hottest_state"] == "near"
    assert intake["hottest"]["celsius"] == 42.0
    assert len(body["warnings"]) == 1 and "reached 108 °F (42 °C)" in body["warnings"][0]

    async with session_scope() as session:
        session.add(Telemetry(projector_id=pid, metric="temp_intake", value_num=46.0,
                              recorded_at=now))
    body = (await api.get(f"/api/analytics/temperatures?projector_id={pid}&hours=1",
                          headers=headers)).json()
    assert body["sensors"][0]["state"] == "over"
    assert "at or above" in body["warnings"][0]

    missing = await api.get("/api/analytics/temperatures?projector_id=9999", headers=headers)
    assert missing.status_code == 404


async def test_old_temperature_samples_are_pruned_sooner(api):
    from datetime import datetime, timedelta

    from sqlalchemy import select

    from app.db.models import Telemetry
    from app.db.session import session_scope
    from app.services.monitor import monitor

    headers = await login(api)
    pid = await add_projector(api, headers)
    old = datetime.now(UTC) - timedelta(days=45)
    async with session_scope() as session:
        session.add_all([
            Telemetry(projector_id=pid, metric="temp_intake", value_num=25.0, recorded_at=old),
            Telemetry(projector_id=pid, metric="power", value_num=1.0, recorded_at=old),
        ])
    await monitor._prune()
    async with session_scope() as session:
        metrics = (await session.execute(
            select(Telemetry.metric).where(Telemetry.recorded_at <= old + timedelta(minutes=1))
        )).scalars().all()
    assert metrics == ["power"]


async def test_unexpected_shutdown_alert_only_when_nobody_asked(api):
    """Observed on→off with no power-off in the log is an alert; a commanded
    power-off is not."""
    from app.services.alerts import alerting

    headers = await login(api)
    pid = await add_projector(api, headers, name="Tripped")

    await alerting._handle("power_changed", {"projector_id": pid, "name": "Tripped",
                                             "from": "on", "to": "off"})
    alerts = (await api.get("/api/alerts", headers=headers)).json()
    assert any(a["kind"] == "unexpected_shutdown" for a in alerts)

    # Power coming back resolves it.
    await alerting._handle("projector_state", {"projector_id": pid, "name": "Tripped",
                                               "power": "on"})
    alerts = (await api.get("/api/alerts", headers=headers)).json()
    assert not any(a["kind"] == "unexpected_shutdown" for a in alerts)

    # A commanded power-off inside the window raises nothing.
    await api.post(f"/api/projectors/{pid}/power", headers=headers,
                   json={"state": "off", "confirm": True})
    await alerting._handle("power_changed", {"projector_id": pid, "name": "Tripped",
                                             "from": "on", "to": "off"})
    alerts = (await api.get("/api/alerts", headers=headers)).json()
    assert not any(a["kind"] == "unexpected_shutdown" for a in alerts)


async def test_unverified_alert_resolves_on_verification(api):
    from app.services.alerts import alerting

    headers = await login(api)
    pid = await add_projector(api, headers, name="Verify me")
    await alerting._handle("command_unverified", {
        "projector_id": pid, "name": "Verify me", "capability": "shutter.set",
        "message": "not confirmed",
    })
    assert any(a["kind"] == "command_unverified"
               for a in (await api.get("/api/alerts", headers=headers)).json())
    await alerting._handle("command_verified", {
        "projector_id": pid, "name": "Verify me", "capability": "shutter.set",
    })
    assert not any(a["kind"] == "command_unverified"
                   for a in (await api.get("/api/alerts", headers=headers)).json())


async def test_invalid_cron_is_rejected_at_the_api(api):
    headers = await login(api)
    response = await api.post("/api/automations", headers=headers, json={
        "name": "Bad cron", "trigger_type": "cron", "schedule": {"cron": "61 * * * *"},
    })
    assert response.status_code == 422
    assert "cron" in response.text
    ok = await api.post("/api/automations", headers=headers, json={
        "name": "Good cron", "trigger_type": "cron", "schedule": {"cron": "30 20 * * fri,sat"},
    })
    assert ok.status_code == 201, ok.text


async def test_ingest_role_cannot_open_the_live_feed(api, roles):
    from app.api.routes import ws as ws_module

    admin = roles["admin"]
    await api.post("/api/auth/users", headers=admin, json={
        "username": "sensor2", "password": "a-long-sensor-password", "role": "ingest",
    })
    token = (await api.post("/api/auth/login", json={
        "username": "sensor2", "password": "a-long-sensor-password",
    })).json()["access_token"]
    assert await ws_module._authenticate(token) is None
    viewer_token = (await api.post("/api/auth/login", json={
        "username": "viewer1", "password": "a-long-test-password",
    })).json()["access_token"]
    assert (await ws_module._authenticate(viewer_token)) is not None


async def test_timed_out_power_off_is_still_a_commanded_shutdown(api):
    """Reply lost on a deliberate power-off must not page the operator."""
    from app.services.alerts import alerting
    from app.services.audit import log_command_results

    headers = await login(api)
    pid = await add_projector(api, headers, name="Lost reply")
    await log_command_results(
        [{"projector_id": pid, "name": "Lost reply", "outcome": "timeout"}],
        "power.set", {"state": "off"}, source="ui", username="admin",
    )
    await alerting._handle("power_changed", {"projector_id": pid, "name": "Lost reply",
                                             "from": "on", "to": "off"})
    alerts = (await api.get("/api/alerts", headers=headers)).json()
    assert not any(a["kind"] == "unexpected_shutdown" for a in alerts)


async def test_alert_recurrence_on_sqlite_updates_instead_of_raising(api):
    """The second occurrence of an open condition compares timestamps that
    SQLite hands back naive; it must update the alert, not throw."""
    from app.services.alerts import alerting

    headers = await login(api)
    pid = await add_projector(api, headers, name="Flapper")
    payload = {"projector_id": pid, "name": "Flapper", "was_powered": "on"}
    await alerting._handle("projector_offline", payload)
    await alerting._handle("projector_offline", {**payload, "error": "second time"})
    alerts = [a for a in (await api.get("/api/alerts", headers=headers)).json()
              if a["kind"] == "offline"]
    assert len(alerts) == 1
    assert alerts[0]["details"].get("error") == "second time"


async def test_validate_flags_gated_and_unknown_steps(api):
    headers = await login(api)
    projector_id = await add_projector(api, headers)
    body = {
        "name": "draft", "trigger_type": "daily", "schedule": {"at": "20:30"},
        "steps": [
            {"type": "command", "target": {"type": "projector", "id": projector_id},
             "capability": "power.set", "params": {"state": "on"}},
            {"type": "command", "target": {"type": "projector", "id": projector_id},
             "capability": "lens.zoom", "params": {"direction": 1}},
            {"type": "command", "target": {"type": "projector", "id": 999},
             "capability": "power.set", "params": {"state": "on"}},
            {"type": "command", "target": {"type": "all"},
             "capability": "input.set", "params": {"input": "NOPE"}},
        ],
    }
    response = await api.post("/api/automations/validate", headers=headers, json=body)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["ok"] is False
    errors = {p["step"] for p in result["problems"] if p["severity"] == "error"}
    assert errors == {1, 2, 3}
    assert len(result["next_runs"]) == 5
    assert result["timezone"]


async def test_validate_passes_a_sound_draft(api):
    headers = await login(api)
    await add_projector(api, headers)
    body = {
        "name": "draft", "trigger_type": "weekly", "schedule": {"at": "09:00", "days": [0, 2]},
        "steps": [
            {"type": "check_online", "target": {"type": "all"}},
            {"type": "command", "target": {"type": "all"},
             "capability": "power.set", "params": {"state": "on"}},
            {"type": "wait_state", "target": {"type": "all"}, "capability": "power.get",
             "expect": "on", "timeout": 180, "interval": 5},
            {"type": "delay", "seconds": 2},
            {"type": "notify", "message": "done"},
        ],
    }
    response = await api.post("/api/automations/validate", headers=headers, json=body)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["ok"] is True, result["problems"]
    assert all(p["severity"] == "warning" for p in result["problems"])
    assert len(result["next_runs"]) == 5


async def test_validate_rejects_schedule_that_never_fires(api):
    headers = await login(api)
    response = await api.post("/api/automations/validate", headers=headers, json={
        "name": "draft", "trigger_type": "weekly", "schedule": {"at": "09:00", "days": []},
        "steps": [{"type": "delay", "seconds": 1}],
    })
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["ok"] is False
    assert result["next_runs"] == []


async def test_update_routes_are_admin_only_and_report_unsupported(api):
    assert (await api.get("/api/system/updates")).status_code == 401
    admin = await login(api)
    response = await api.get("/api/system/updates", headers=admin)
    assert response.status_code == 200
    assert response.json()["supported"] is False
    response = await api.post("/api/system/updates/install", json={}, headers=admin)
    assert response.status_code == 428
    response = await api.put("/api/system/updates/auto", json={"enabled": False}, headers=admin)
    assert response.status_code == 409


async def test_nothing_running_counts_as_quiet(api):
    from app.services.updates import busy_reason

    assert await busy_reason() is None


async def test_health_reports_the_version(api):
    response = await api.get("/api/health")
    assert response.json()["version"] == "dev"


# -- review regressions -------------------------------------------------------


def test_list_settings_take_blank_and_comma_separated_values(monkeypatch):
    """docker-compose passes ALERT_EMAIL_TO="" when unset; .env.example writes
    CORS_ORIGINS as a plain URL. Neither may stop the server from starting."""
    from app.config import Settings

    monkeypatch.setenv("ALERT_EMAIL_TO", "")
    monkeypatch.setenv("CORS_ORIGINS", "http://a.local:5173, http://b.local")
    settings = Settings(_env_file=None)
    assert settings.alert_email_to == []
    assert settings.cors_origins == ["http://a.local:5173", "http://b.local"]
    monkeypatch.setenv("ALERT_EMAIL_TO", '["ops@example.com"]')
    assert Settings(_env_file=None).alert_email_to == ["ops@example.com"]


async def test_bootstrap_says_a_blank_password_was_generated(api, monkeypatch, caplog):
    import logging

    from sqlalchemy import delete

    import app.main as main_module
    from app.db.models import User
    from app.db.session import session_scope

    async with session_scope() as session:
        await session.execute(delete(User))
    monkeypatch.setattr(main_module.settings, "bootstrap_admin_password", "")
    with caplog.at_level(logging.WARNING):
        await main_module.bootstrap_admin()
    assert "generated randomly" in caplog.text
    assert "Set from BOOTSTRAP_ADMIN_PASSWORD" not in caplog.text


async def test_reevaluating_an_open_alert_announces_it_once(api):
    """Every poll re-evaluates open conditions; only a change is published."""
    from app.core.events import bus
    from app.db.models import Severity
    from app.services.alerts import alerting

    queue = await bus.subscribe()
    try:
        for _ in range(3):
            await alerting.raise_alert(
                dedupe_key="lamp_hours:1:1", projector_id=None, kind="lamp_hours_warning",
                severity=Severity.WARNING, message="lamp 1 at 2100h", details={})
        announced = []
        while not queue.empty():
            message = queue.get_nowait()
            if message.type == "alert":
                announced.append(message.payload)
        assert len(announced) == 1
    finally:
        await bus.unsubscribe(queue)


async def test_an_escalating_alert_takes_the_new_severity_and_notifies(api, monkeypatch):
    from app.db.models import Severity
    from app.services.alerts import alerting

    headers = await login(api)
    sent = []

    async def notify(channels, webhook, severity, message, details):
        sent.append(severity)

    monkeypatch.setattr(alerting, "_notify", notify)
    common = {"dedupe_key": "enclosure:1:internal_temp_c", "projector_id": None}
    await alerting.raise_alert(**common, kind="enclosure_temperature_warning",
                               severity=Severity.WARNING, message="42°C")
    await alerting.raise_alert(**common, kind="enclosure_overtemperature",
                               severity=Severity.CRITICAL, message="55°C")
    alerts = [a for a in (await api.get("/api/alerts", headers=headers)).json()
              if a["message"] == "55°C"]
    assert len(alerts) == 1
    assert alerts[0]["severity"] == "critical"
    assert alerts[0]["kind"] == "enclosure_overtemperature"
    assert sent == [Severity.WARNING, Severity.CRITICAL]
    overview = (await api.get("/api/overview", headers=headers)).json()
    assert overview["critical_alerts"] == 1


async def test_fan_and_leak_alerts_follow_the_sensor(api):
    """Booleans are stored as 1.0/0.0: a fan reporting false must alert, and
    a dry leak sensor or a running fan must close the alert again."""
    from app.services.alerts import alerting

    headers = await login(api)
    enclosure_id = (await api.post("/api/enclosures", headers=headers,
                                   json={"name": "Wet Box"})).json()["id"]

    async def post(metric, value):
        response = await api.post(f"/api/enclosures/{enclosure_id}/readings", headers=headers,
                                  json={"metric": metric, "value": value})
        assert response.status_code == 202
        await alerting._handle("enclosure_reading", {
            "enclosure_id": enclosure_id, "metric": metric, "value": 1.0 if value else 0.0})

    async def kinds():
        return {a["kind"] for a in (await api.get("/api/alerts", headers=headers)).json()}

    await post("fan_ok", False)
    await post("leak", True)
    assert {"enclosure_fan_failure", "enclosure_leak"} <= await kinds()
    await post("fan_ok", True)
    await post("leak", False)
    assert not {"enclosure_fan_failure", "enclosure_leak"} & await kinds()


async def test_camera_reports_cannot_crowd_an_alert_out_of_the_queue(monkeypatch):
    """While alerting is busy (a slow webhook), a burst of camera reports must
    not push a projector going offline out of its queue."""
    import asyncio

    import app.services.alerts as alerts_module
    from app.core.events import EventBus

    bus = EventBus()
    monkeypatch.setattr(alerts_module, "bus", bus)
    service = alerts_module.AlertingService()
    seen: list[tuple] = []
    gate = asyncio.Event()

    async def no_keys():
        return None

    async def slow_handle(kind, payload):
        seen.append((kind, payload.get("projector_id")))
        await gate.wait()

    monkeypatch.setattr(service, "_load_open_keys", no_keys)
    monkeypatch.setattr(service, "_handle", slow_handle)
    await service.start()
    try:
        bus.publish("projector_offline", {"projector_id": 1})
        await asyncio.sleep(0.05)  # taken, and now stuck on the webhook
        bus.publish("projector_offline", {"projector_id": 2})
        for _ in range(600):
            bus.publish("mapping_people", {"people": []})
        gate.set()
        await asyncio.sleep(0.2)
    finally:
        await service.stop()
    assert ("projector_offline", 2) in seen


async def _insert_readings(enclosure_id, rows):
    from datetime import datetime, timedelta

    from app.db.models import EnclosureReading
    from app.db.session import session_scope

    now = datetime.now(UTC)
    async with session_scope() as session:
        session.add_all([
            EnclosureReading(enclosure_id=enclosure_id, metric=metric, value_num=value,
                             recorded_at=now - timedelta(seconds=age))
            for metric, value, age in rows
        ])


async def test_enclosure_check_sees_a_leak_reported_before_many_other_readings(api):
    """A leak switch reports on change; the thermometer every 30 s. The leak
    must still block startup once 40 temperature readings have come in."""
    headers = await login(api)
    enclosure_id = (await api.post("/api/enclosures", headers=headers, json={
        "name": "Leaky", "block_startup_on_fault": True})).json()["id"]
    await _insert_readings(enclosure_id, [("leak", 1.0, 400)]
                           + [("internal_temp_c", 25.0, i) for i in range(45)])
    automation_id = (await api.post("/api/automations", headers=headers, json={
        "name": "Guarded", "steps": [{"type": "check_enclosure",
                                      "enclosure_id": enclosure_id}],
    })).json()["id"]
    body = (await api.post(f"/api/automations/{automation_id}/execute", headers=headers,
                           json={"confirm": True})).json()
    assert body["status"] == "failed", body
    assert "leak" in body["steps"][0]["error"]


async def test_enclosure_latest_lists_every_metric(api):
    headers = await login(api)
    enclosure_id = (await api.post("/api/enclosures", headers=headers,
                                   json={"name": "Busy"})).json()["id"]
    await _insert_readings(enclosure_id, [("leak", 0.0, 900)]
                           + [("internal_temp_c", 25.0, i) for i in range(210)])
    latest = (await api.get("/api/enclosures", headers=headers)).json()[0]["latest"]
    assert latest["leak"]["value"] == 0.0
    assert latest["internal_temp_c"]["age_seconds"] == 0


async def test_stopping_the_engine_aborts_a_scheduled_run_and_records_it(api):
    import asyncio

    from app.services.automation import engine

    headers = await login(api)
    automation_id = (await api.post("/api/automations", headers=headers, json={
        "name": "Long", "steps": [{"type": "delay", "seconds": 60}],
    })).json()["id"]
    task = engine._spawn_run(automation_id, trigger="schedule")
    for _ in range(100):
        if (await api.get(f"/api/automations/{automation_id}/runs", headers=headers)).json():
            break
        await asyncio.sleep(0.02)
    await engine.stop()
    assert task.done()
    runs = (await api.get(f"/api/automations/{automation_id}/runs", headers=headers)).json()
    assert runs[0]["status"] == "aborted"
    assert runs[0]["finished_at"] is not None


async def test_a_run_cut_off_by_a_crash_is_closed_at_start(api):
    from app.db.models import AutomationRun
    from app.db.session import session_scope
    from app.services.automation import engine

    headers = await login(api)
    automation_id = (await api.post("/api/automations", headers=headers, json={
        "name": "Crashed", "steps": []})).json()["id"]
    async with session_scope() as session:
        session.add(AutomationRun(automation_id=automation_id, status="running"))
    await engine.stop()
    await engine.start()
    runs = (await api.get(f"/api/automations/{automation_id}/runs", headers=headers)).json()
    assert runs[0]["status"] == "aborted"


async def test_wait_state_with_a_cleared_interval_does_not_spin(api, monkeypatch):
    import app.services.automation as automation_module

    calls = 0
    real = automation_module.manager.dispatch_many

    async def counting(*args, **kwargs):
        nonlocal calls
        calls += 1
        return await real(*args, **kwargs)

    monkeypatch.setattr(automation_module.manager, "dispatch_many", counting)
    result = await automation_module.engine._run_step(0, {
        "type": "wait_state", "target": {"type": "projector", "id": 999},
        "capability": "power.get", "expect": "on", "timeout": 1, "interval": 0,
    })
    assert result["ok"] is False
    assert calls <= 4, calls


async def test_sign_in_pauses_after_repeated_wrong_passwords(api):
    for _ in range(10):
        response = await api.post("/api/auth/login",
                                  json={"username": "admin", "password": "guess-guess"})
        assert response.status_code == 401
    blocked = await api.post("/api/auth/login",
                             json={"username": "admin", "password": "test-admin-password"})
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0
    # Another account from the same address is not affected.
    other = await api.post("/api/auth/login",
                           json={"username": "someone", "password": "guess-guess"})
    assert other.status_code == 401


async def test_a_token_from_a_deleted_account_does_not_open_its_namesake(api, roles):
    """Deleting a user revokes its tokens; recreating the name must not revive them."""
    from datetime import datetime, timedelta

    import jwt

    from app.config import settings

    admin = roles["admin"]
    assert (await api.post("/api/auth/users", headers=admin, json={
        "username": "reused", "password": "a-long-test-password", "role": "admin",
    })).status_code == 201
    issued = datetime.now(UTC) - timedelta(hours=1)  # by the account deleted since
    old = jwt.encode({"sub": "reused", "role": "viewer", "iat": issued,
                      "exp": issued + timedelta(days=365)}, settings.secret_key,
                     algorithm="HS256")
    response = await api.get("/api/auth/users", headers={"Authorization": f"Bearer {old}"})
    assert response.status_code == 401
    from app.api.routes import ws as ws_module
    assert await ws_module._authenticate(old) is None
    # Media files take the token in the query string; same rule there.
    media = await api.get("/api/mapping/media/999/file", params={"token": old})
    assert media.status_code == 403
    fresh = await login(api, "reused", "a-long-test-password")
    assert (await api.get("/api/auth/users", headers=fresh)).status_code == 200
    fresh_token = fresh["Authorization"].removeprefix("Bearer ")
    media = await api.get("/api/mapping/media/999/file", params={"token": fresh_token})
    assert media.status_code == 404


async def test_a_duplicate_name_is_a_conflict_not_a_server_error(api):
    headers = await login(api)
    await api.post("/api/groups", headers=headers, json={"name": "Front"})
    second = (await api.post("/api/groups", headers=headers, json={"name": "Back"})).json()
    response = await api.patch(f"/api/groups/{second['id']}", headers=headers,
                               json={"name": "Front"})
    assert response.status_code == 409
    assert "already be in use" in response.json()["detail"]


async def test_scenes_and_automations_accept_the_body_discovery_advertises(api):
    """Discovery tells integrations to send {"confirm": true}; that must work."""
    headers = await login(api)
    scene_id = (await api.post("/api/scenes", headers=headers,
                               json={"name": "Nothing", "actions": []})).json()["id"]
    discovery = (await api.get("/api/integration/homeassistant/discovery",
                               headers=headers)).json()
    body = next(s for s in discovery["scenes"] if s["id"] == scene_id)["activate"]["body"]
    assert (await api.post(f"/api/scenes/{scene_id}/activate", headers=headers,
                           json=body)).status_code == 200
    automation_id = (await api.post("/api/automations", headers=headers,
                                    json={"name": "Empty", "steps": []})).json()["id"]
    assert (await api.post(f"/api/automations/{automation_id}/execute", headers=headers,
                           json={"confirm": True})).status_code == 200


async def test_activating_a_scene_by_name_is_rate_limited(api, monkeypatch):
    import app.api.deps as deps

    headers = await login(api)
    await api.post("/api/scenes", headers=headers, json={"name": "Pre-Show", "actions": []})
    monkeypatch.setattr(deps.command_rate_limit.counter, "limit", 1)
    first = await api.post("/api/integration/scenes/Pre-Show/activate", headers=headers)
    second = await api.post("/api/integration/scenes/Pre-Show/activate", headers=headers)
    assert first.status_code == 200
    assert second.status_code == 429


async def test_live_feed_leaves_no_queue_when_the_client_drops_at_once(api):
    from fastapi import WebSocketDisconnect

    from app.api.routes import ws as ws_module
    from app.core.events import bus

    token = (await api.post("/api/auth/login", json={
        "username": "admin", "password": "test-admin-password"})).json()["access_token"]

    class GoneAtOnce:
        async def accept(self):
            return None

        async def send_text(self, _text):
            raise WebSocketDisconnect(code=1006)

    before = bus.subscriber_count
    with contextlib.suppress(WebSocketDisconnect):
        await ws_module.websocket_endpoint(GoneAtOnce(), token=token)
    assert bus.subscriber_count == before


async def test_changing_the_admin_password_removes_the_first_run_note(api, roles, tmp_path,
                                                                      monkeypatch):
    """Opening the desktop app shows the note's password; after a change it would be wrong."""
    monkeypatch.setenv("DESKTOP_DATA_DIR", str(tmp_path))
    note = tmp_path / "FIRST-RUN-PASSWORD.txt"
    note.write_text("password: test-admin-password\n")
    other = roles["operator"]
    assert (await api.post("/api/auth/change-password", headers=other, json={
        "current_password": "a-long-test-password", "new_password": "another-long-password",
    })).status_code == 204
    assert note.exists()  # someone else's password says nothing about admin's
    headers = await login(api)
    response = await api.post("/api/auth/change-password", headers=headers, json={
        "current_password": "test-admin-password", "new_password": "a-new-admin-password",
    })
    assert response.status_code == 204
    assert not note.exists()


def test_websocket_log_lines_hide_the_token():
    import logging

    from app.core.security import HideTokens

    record = logging.LogRecord("uvicorn.error", logging.INFO, __file__, 1,
                               '%s - "WebSocket %s" [accepted]',
                               (("127.0.0.1", 5000), "/api/ws?token=eyJabc.def.ghi&x=1"), None)
    assert HideTokens().filter(record)
    message = record.getMessage()
    assert "eyJabc" not in message
    assert "/api/ws?token=hidden&x=1" in message
