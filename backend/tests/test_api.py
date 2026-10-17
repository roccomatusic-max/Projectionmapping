"""API: authentication, RBAC, confirmation gating, group dispatch, scheduling."""

from __future__ import annotations

import os
import tempfile

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
    import app.services.monitor as monitor_module
    for module in (audit_module, monitor_module, alerts_module, automation_module):
        importlib.reload(module)
    import app.api.deps as deps_module
    import app.api.routes.auth as auth_routes
    import app.api.routes.automation as automation_routes
    import app.api.routes.enclosure as enclosure_routes
    import app.api.routes.groups as group_routes
    import app.api.routes.integration as integration_routes
    import app.api.routes.monitoring as monitoring_routes
    import app.api.routes.projectors as projector_routes
    import app.api.routes.system as system_routes
    import app.api.routes.ws as ws_routes
    importlib.reload(deps_module)
    for module in (auth_routes, projector_routes, group_routes, monitoring_routes,
                   automation_routes, enclosure_routes, integration_routes,
                   ws_routes, system_routes):
        importlib.reload(module)
    import app.main as main_module
    importlib.reload(main_module)

    async with main_module.app.router.lifespan_context(main_module.app):
        transport = ASGITransport(app=main_module.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            client.sim = panasonic_sim
            yield client
    os.unlink(path)


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
