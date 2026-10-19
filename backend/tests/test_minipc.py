"""Mini PCs: finding the server, and a computer's player and camera pairing as one."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

import asyncio
import json
import socket

from app.services.discovery import REQUEST, Discovery
from tests.test_api import api, login  # noqa: F401 - fixture

#: What the Mini PC app sends: one secret for the computer, used by both.
SECRET = "m" * 64
PLAYER = {"device_id": "mpc-0123456789abcdef01234567", "secret": SECRET, "name": "Left mini PC"}
CAMERA = {"device_id": "mpc-0123456789abcdef01234567-camera", "secret": SECRET,
          "name": "Left mini PC camera", "kind": "camera"}


async def ask(port: int, message: bytes) -> bytes | None:
    def exchange() -> bytes | None:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.settimeout(0.5)
            sock.sendto(message, ("127.0.0.1", port))
            try:
                return sock.recvfrom(2048)[0]
            except TimeoutError:
                return None
    return await asyncio.to_thread(exchange)


async def test_discovery_answers_mini_pcs_with_the_http_port():
    discovery = Discovery()
    await discovery.start(port=0, http_port=8765, host="127.0.0.1")
    try:
        reply = json.loads(await ask(discovery.port, REQUEST))
        assert reply["service"] == "projectionmapping"
        assert reply["port"] == 8765
        assert reply["name"]
        # Anything else on the port is ignored.
        assert await ask(discovery.port, b"hello") is None
    finally:
        await discovery.stop()


async def test_discovery_survives_a_port_in_use():
    first, second = Discovery(), Discovery()
    await first.start(port=0, http_port=8765, host="127.0.0.1")
    try:
        await second.start(port=first.port, http_port=8765, host="127.0.0.1")
        assert second.port is None
    finally:
        await first.stop()
        await second.stop()


async def hello(client, device) -> dict:
    response = await client.post("/api/mapping/players/hello", json=device)
    assert response.status_code == 200, response.text
    return response.json()


async def test_a_mini_pc_camera_is_approved_with_its_player(api):
    headers = await login(api)
    player = await hello(api, PLAYER)
    camera = await hello(api, CAMERA)
    assert camera["status"] == "pending"

    listed = {p["id"]: p for p in (await api.get("/api/mapping/players", headers=headers)).json()}
    assert listed[player["player_id"]]["companion_id"] == camera["player_id"]
    assert listed[camera["player_id"]]["companion_id"] == player["player_id"]

    response = await api.patch(f"/api/mapping/players/{player['player_id']}", headers=headers,
                               json={"approved": True})
    assert response.status_code == 200, response.text
    claimed = await hello(api, CAMERA)
    assert claimed["status"] == "approved" and claimed["access_token"]
    # It is a camera in its own right: its heartbeat and camera calls work.
    token = {"Authorization": f"Bearer {claimed['access_token']}"}
    beat = await api.post("/api/mapping/players/me", headers=token, json={"camera": "test"})
    assert beat.status_code == 200, beat.text


async def test_a_camera_plugged_in_later_pairs_by_itself(api):
    headers = await login(api)
    player = await hello(api, PLAYER)
    await api.patch(f"/api/mapping/players/{player['player_id']}", headers=headers,
                    json={"approved": True})
    camera = await hello(api, CAMERA)
    assert camera["status"] == "approved" and camera["access_token"]


async def test_a_camera_with_another_secret_still_needs_approval(api):
    headers = await login(api)
    player = await hello(api, PLAYER)
    await api.patch(f"/api/mapping/players/{player['player_id']}", headers=headers,
                    json={"approved": True})
    stranger = await hello(api, {**CAMERA, "device_id": "cam-somewhere-else-0001",
                                 "secret": "x" * 64})
    assert stranger["status"] == "pending"
    listed = {p["id"]: p for p in (await api.get("/api/mapping/players", headers=headers)).json()}
    assert listed[stranger["player_id"]]["companion_id"] is None


async def test_removing_the_mini_pc_removes_its_camera(api):
    headers = await login(api)
    player = await hello(api, PLAYER)
    await api.patch(f"/api/mapping/players/{player['player_id']}", headers=headers,
                    json={"approved": True})
    camera = await hello(api, CAMERA)

    refused = await api.delete(f"/api/mapping/players/{camera['player_id']}", headers=headers)
    assert refused.status_code == 400
    assert "Left mini PC" in refused.json()["detail"]

    removed = await api.delete(f"/api/mapping/players/{player['player_id']}", headers=headers)
    assert removed.status_code == 204
    assert (await api.get("/api/mapping/players", headers=headers)).json() == []
    token = {"Authorization": f"Bearer {camera['access_token']}"}
    assert (await api.post("/api/mapping/players/me", headers=token, json={})).status_code == 401


async def test_network_says_whether_mini_pcs_can_reach_the_server(api, monkeypatch):
    import app.api.routes.mapping_players as players

    headers = await login(api)
    monkeypatch.setattr(players.settings, "local_only", True)
    monkeypatch.setattr(players.settings, "advertise_port", None)
    local = (await api.get("/api/mapping/players/network", headers=headers)).json()
    assert local == {"local_only": True, "discoverable": False, "address": None,
                     "tailscale_address": None, "server_os": "linux"}

    monkeypatch.setattr(players.settings, "local_only", False)
    monkeypatch.setattr(players.settings, "advertise_port", 8765)
    monkeypatch.setattr(players, "lan_address", lambda: "192.168.1.10")
    monkeypatch.setattr(players, "tailscale_address", lambda: None)
    lan = (await api.get("/api/mapping/players/network", headers=headers)).json()
    assert lan == {"local_only": False, "discoverable": True,
                   "address": "http://192.168.1.10:8765", "tailscale_address": None,
                   "server_os": "linux"}
