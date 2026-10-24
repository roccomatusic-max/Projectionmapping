"""Mini PCs: finding the server, and a computer's player and camera pairing as one."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

import asyncio
import json
import socket

import pytest

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


# -- controls on the Players page ------------------------------------------------------


@pytest.fixture(autouse=True)
def _forget_commands():
    import app.api.routes.mapping_players as players
    players._queued.clear()
    players._app_seen.clear()
    yield
    players._queued.clear()
    players._app_seen.clear()


async def paired(api, headers) -> tuple[int, dict]:
    """A paired mini PC that has sent one heartbeat; its id and token headers."""
    player = await hello(api, PLAYER)
    await api.patch(f"/api/mapping/players/{player['player_id']}", headers=headers,
                    json={"approved": True})
    token = {"Authorization": f"Bearer {(await hello(api, PLAYER))['access_token']}"}
    beat = await api.post("/api/mapping/players/me", headers=token, json={"fps": 60})
    assert beat.status_code == 200, beat.text
    return player["player_id"], token


async def command(api, headers, player_id: int, action: str):
    return await api.post(f"/api/mapping/players/{player_id}/command", headers=headers,
                          json={"action": action})


async def app_checkin(api, **extra) -> dict:
    response = await api.post("/api/mapping/players/app", json={
        "device_id": PLAYER["device_id"], "secret": SECRET, "power": True,
        "computer": "MINIPC-LEFT", "mac": "aa:bb:cc:dd:ee:01", **extra})
    assert response.status_code == 200, response.text
    return response.json()


async def test_the_player_page_picks_up_its_commands_once(api):
    headers = await login(api)
    player_id, token = await paired(api, headers)

    sent = await command(api, headers, player_id, "overlay_on")
    assert sent.status_code == 200, sent.text
    assert sent.json()["via"] == "page"
    # Without the Mini PC app, restarting the output reloads the page.
    assert (await command(api, headers, player_id, "restart_output")).json()["via"] == "page"

    beat = (await api.post("/api/mapping/players/me", headers=token, json={})).json()
    assert beat["commands"] == ["overlay_on", "reload"]
    again = (await api.post("/api/mapping/players/me", headers=token, json={})).json()
    assert again["commands"] == []


async def test_power_needs_the_new_mini_pc_app(api):
    headers = await login(api)
    player_id, _ = await paired(api, headers)

    refused = await command(api, headers, player_id, "reboot")
    assert refused.status_code == 409
    assert "install line" in refused.json()["detail"]

    first = await app_checkin(api)
    assert first["commands"] == []
    listed = (await api.get("/api/mapping/players", headers=headers)).json()[0]
    assert listed["app"] == {"connected": True, "power": True, "computer": "MINIPC-LEFT",
                             "mac": "aa:bb:cc:dd:ee:01"}

    restart = await command(api, headers, player_id, "restart_output")
    assert restart.json()["via"] == "app"
    reboot = await command(api, headers, player_id, "reboot")
    assert reboot.status_code == 200, reboot.text
    assert (await app_checkin(api))["commands"] == ["restart_output", "reboot"]
    assert (await app_checkin(api))["commands"] == []

    events = (await api.get("/api/events", headers=headers)).json()
    assert any("restart" in e["message"] and e["kind"] == "player_power" for e in events)


async def test_a_mac_or_linux_app_cannot_power_off(api):
    headers = await login(api)
    player_id, _ = await paired(api, headers)
    await app_checkin(api, power=False, mac=None)
    refused = await command(api, headers, player_id, "shutdown")
    assert refused.status_code == 409
    assert "Windows" in refused.json()["detail"]


async def test_the_app_needs_the_computers_secret(api):
    headers = await login(api)
    await paired(api, headers)
    wrong = await api.post("/api/mapping/players/app", json={
        "device_id": PLAYER["device_id"], "secret": "z" * 64})
    assert wrong.status_code == 403
    unknown = await api.post("/api/mapping/players/app", json={
        "device_id": "mpc-nobody-0000000000000000", "secret": SECRET})
    assert unknown.status_code == 404


async def test_an_unapproved_mini_pc_gets_no_commands(api):
    await hello(api, PLAYER)
    assert (await app_checkin(api))["commands"] == []


async def test_old_commands_are_dropped(api, monkeypatch):
    import app.api.routes.mapping_players as players
    headers = await login(api)
    player_id, token = await paired(api, headers)
    await command(api, headers, player_id, "overlay_on")
    later = players._now() + players.COMMAND_SECONDS + 1
    monkeypatch.setattr(players, "_now", lambda: later)
    assert (await api.post("/api/mapping/players/me", headers=token, json={})).json()["commands"] == []


async def test_turn_on_sends_wake_on_lan_once_it_is_off(api, monkeypatch):
    import app.api.routes.mapping_players as players
    headers = await login(api)
    player_id, _ = await paired(api, headers)

    assert (await command(api, headers, player_id, "wake")).status_code == 409  # still on
    await app_checkin(api)
    # Off: not heard from by the page or the app for a while.
    later = players._now() + 60
    monkeypatch.setattr(players, "_now", lambda: later)
    monkeypatch.setattr(players, "is_online", lambda _p: False)
    sent: list[tuple[str, str | None]] = []
    monkeypatch.setattr(players, "wake_on_lan", lambda mac, near=None: sent.append((mac, near)))

    woken = await command(api, headers, player_id, "wake")
    assert woken.status_code == 200, woken.text
    assert woken.json()["via"] == "network"
    assert sent and sent[0][0] == "aa:bb:cc:dd:ee:01"
    # The network card survives the heartbeats in between.
    assert (await api.get("/api/mapping/players", headers=headers)).json()[0]["app"]["mac"]
    # Offline, the rest is refused plainly.
    offline = await command(api, headers, player_id, "overlay_on")
    assert offline.status_code == 409 and "offline" in offline.json()["detail"]


def test_the_wake_packet_is_the_standard_one(monkeypatch):
    import app.api.routes.mapping_players as players
    packets = []

    class Fake:
        def __init__(self, *_a): pass
        def __enter__(self): return self
        def __exit__(self, *_a): return False
        def setsockopt(self, *_a): pass
        def sendto(self, data, target): packets.append((data, target))

    monkeypatch.setattr(players.socket, "socket", Fake)
    players.wake_on_lan("aa:bb:cc:dd:ee:01", "192.168.1.23")
    data = packets[0][0]
    assert data[:6] == b"\xff" * 6 and data[6:] == bytes.fromhex("aabbccddee01") * 16
    assert {t for _, t in packets} >= {("255.255.255.255", 9), ("192.168.1.255", 9)}


async def test_the_screen_control_sets_its_outputs_test_picture(api):
    headers = await login(api)
    player_id, _ = await paired(api, headers)
    refused = await api.post(f"/api/mapping/players/{player_id}/screen", headers=headers,
                             json={"pattern": "white"})
    assert refused.status_code == 400

    show = (await api.post("/api/mapping/shows", headers=headers, json={"name": "House"})).json()
    output_id = show["outputs"][0]["id"] if show.get("outputs") else (await api.post(
        f"/api/mapping/shows/{show['id']}/outputs", headers=headers, json={"name": "Left"})).json()["id"]
    await api.patch(f"/api/mapping/players/{player_id}", headers=headers, json={"output_id": output_id})

    white = await api.post(f"/api/mapping/players/{player_id}/screen", headers=headers,
                           json={"pattern": "white"})
    assert white.status_code == 200, white.text
    assert white.json()["screen"] == "white"
    full = (await api.get(f"/api/mapping/shows/{show['id']}", headers=headers)).json()
    assert next(o for o in full["outputs"] if o["id"] == output_id)["test_pattern"] == "white"

    back = await api.post(f"/api/mapping/players/{player_id}/screen", headers=headers,
                          json={"pattern": "none"})
    assert back.json()["screen"] == "none"


async def test_only_admins_use_the_controls(api):
    headers = await login(api)
    player_id, token = await paired(api, headers)
    # A player's own token is a viewer: it cannot drive other mini PCs.
    assert (await command(api, token, player_id, "reboot")).status_code == 403
