"""The Home Assistant side of the server: the state feed, pairing and the download.

The integration itself is tested against a running server in ha-tests/.
"""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

import io
import json
import tarfile

from app.services import homeassistant as ha
from tests.test_api import add_projector, api, login  # noqa: F401 - fixture


def _bearer(key: str) -> dict:
    return {"Authorization": f"Bearer {key}"}


async def test_the_install_line_pairs_once_and_gives_an_operator_key(api):
    headers = await login(api)
    line = await api.post("/api/integration/homeassistant/install-line", headers=headers)
    assert line.status_code == 200, line.text
    body = line.json()
    code = body["code"]
    assert body["line"] == (
        f"curl -fsSL http://test/api/integration/homeassistant/install/{code} | sh")

    script = await api.get(f"/api/integration/homeassistant/install/{code}")
    assert script.status_code == 200
    assert "SERVER='http://test'" in script.text
    assert json.dumps({"url": "http://test", "code": code}) in script.text

    paired = await api.post("/api/integration/homeassistant/pair", json={"code": code})
    assert paired.status_code == 200, paired.text
    key = paired.json()["key"]
    me = await api.get("/api/auth/me", headers=_bearer(key))
    assert me.json()["username"] == ha.HA_USERNAME
    assert me.json()["role"] == "operator"

    # The code works once.
    again = await api.post("/api/integration/homeassistant/pair", json={"code": code})
    assert again.status_code == 401
    assert "used up or out of date" in again.json()["detail"]


async def test_a_wrong_code_is_refused_and_guessing_is_slowed(api):
    for _ in range(10):
        response = await api.post("/api/integration/homeassistant/pair",
                                  json={"code": "WRONGCODE1"})
        assert response.status_code == 401
    response = await api.post("/api/integration/homeassistant/pair", json={"code": "WRONGCODE1"})
    assert response.status_code == 429
    from app.api.routes.integration import pairing_failures
    pairing_failures._hits.clear()


async def test_a_new_key_retires_the_old_one_and_disconnect_retires_both(api):
    headers = await login(api)
    first = (await api.post("/api/integration/homeassistant/key", headers=headers)).json()["key"]
    state = await api.get("/api/integration/homeassistant/state", headers=_bearer(first))
    assert state.status_code == 200

    import asyncio
    await asyncio.sleep(2.1)  # token "issued at" is whole seconds
    second = (await api.post("/api/integration/homeassistant/key", headers=headers)).json()["key"]
    assert (await api.get("/api/integration/homeassistant/state",
                          headers=_bearer(first))).status_code == 401
    assert (await api.get("/api/integration/homeassistant/state",
                          headers=_bearer(second))).status_code == 200

    setup = (await api.get("/api/integration/homeassistant/setup", headers=headers)).json()
    assert setup["connected"] is True
    assert setup["last_seen"] is not None

    assert (await api.delete("/api/integration/homeassistant/key",
                             headers=headers)).status_code == 204
    assert (await api.get("/api/integration/homeassistant/state",
                          headers=_bearer(second))).status_code == 401
    setup = (await api.get("/api/integration/homeassistant/setup", headers=headers)).json()
    assert setup["connected"] is False


async def test_setup_and_keys_are_for_admins_only(api):
    headers = await login(api)
    key = (await api.post("/api/integration/homeassistant/key", headers=headers)).json()["key"]
    for method, path in [("get", "/api/integration/homeassistant/setup"),
                         ("post", "/api/integration/homeassistant/install-line"),
                         ("post", "/api/integration/homeassistant/key"),
                         ("delete", "/api/integration/homeassistant/key")]:
        response = await getattr(api, method)(path, headers=_bearer(key))
        assert response.status_code == 403, path


async def test_the_package_is_the_integration_and_nothing_else(api):
    response = await api.get("/api/integration/homeassistant/package.tar.gz")
    assert response.status_code == 200
    with tarfile.open(fileobj=io.BytesIO(response.content), mode="r:gz") as archive:
        names = archive.getnames()
        manifest = json.load(archive.extractfile("projector_control/manifest.json"))
    assert all(name.startswith("projector_control/") for name in names)
    assert "projector_control/__init__.py" in names
    assert not any("__pycache__" in name or name.endswith("pairing.json") for name in names)
    assert manifest["domain"] == "projector_control"
    assert manifest["version"] == ha.integration_version()


async def test_the_state_has_projectors_the_show_and_the_emergency_stop(api):
    headers = await login(api)
    pid = await add_projector(api, headers)
    show = (await api.post("/api/mapping/shows", headers=headers, json={"name": "House"})).json()
    for name in ("Snow", "Stars"):
        await api.post(f"/api/mapping/shows/{show['id']}/cues", headers=headers,
                       json={"name": name})
    await api.post("/api/mapping/transport", headers=headers,
                   json={"action": "goto", "show_id": show["id"], "cue": 1})

    state = (await api.get("/api/integration/homeassistant/state", headers=headers)).json()
    assert state["api"] == 1
    projector = next(p for p in state["projectors"] if p["id"] == pid)
    assert projector["name"] == "House Left"
    assert projector["can"]["power"] is True
    # The input list is the model's, with the projector's own labels.
    assert {"code": "HD1", "label": "HDMI"} in projector["inputs"]
    assert state["show"] == {
        "status": "playing", "show_id": show["id"], "show_name": "House",
        "cue_position": 1, "cue_name": "Stars",
        "emergency": False, "emergency_by": None, "emergency_at": None,
    }
    assert state["shows"][0]["cues"] == [{"position": 0, "name": "Snow"},
                                         {"position": 1, "name": "Stars"}]

    await api.post("/api/emergency/stop", headers=headers)
    state = (await api.get("/api/integration/homeassistant/state", headers=headers)).json()
    assert state["show"]["emergency"] is True
    assert state["show"]["emergency_by"] == "admin"
    await api.post("/api/emergency/clear", headers=headers)


async def test_no_install_line_when_home_assistant_cannot_reach_the_server(api, monkeypatch):
    from app import config
    monkeypatch.setattr(config.settings, "advertise_port", None)
    headers = await login(api)
    headers["Host"] = "localhost:8765"
    response = await api.post("/api/integration/homeassistant/install-line", headers=headers)
    assert response.status_code == 409
    assert "--lan" in response.json()["detail"]
