"""Mini PCs: finding the server, and a computer's player and camera pairing as one."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

import asyncio
import base64
import json
import socket
from types import SimpleNamespace

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
    players._pictures.clear()
    players._watched_until = 0.0
    players._watched_close.clear()
    yield
    players._queued.clear()
    players._app_seen.clear()
    players._pictures.clear()
    players._watched_until = 0.0
    players._watched_close.clear()


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
    assert {k: listed["app"][k] for k in ("connected", "power", "computer", "mac", "version", "update")} == {
        "connected": True, "power": True, "computer": "MINIPC-LEFT", "mac": "aa:bb:cc:dd:ee:01",
        "version": None, "update": "old_app"}

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


#: A tiny JPEG (the start and end markers are all the server checks).
JPEG = base64.b64encode(b"\xff\xd8\xff\xe0" + b"0" * 40 + b"\xff\xd9").decode()


async def test_the_live_view_shows_what_each_mini_pc_puts_out(api):
    headers = await login(api)
    player_id, token = await paired(api, headers)

    # Nobody is looking: nothing is asked for.
    assert (await api.post("/api/mapping/players/me", headers=token, json={})).json()["picture"] is False

    # The Dashboard looks: nothing yet, and now the player is asked for pictures.
    empty = await api.get(f"/api/mapping/players/{player_id}/picture", headers=headers)
    assert empty.status_code == 204
    assert (await api.post("/api/mapping/players/me", headers=token, json={})).json()["picture"] is True

    # The player page sends a copy of the frame it draws.
    sent = await api.post("/api/mapping/players/me/picture", headers=token, json={"image": JPEG})
    assert sent.status_code == 204, sent.text
    shown = await api.get(f"/api/mapping/players/{player_id}/picture", headers=headers)
    assert shown.status_code == 200
    assert shown.headers["content-type"] == "image/jpeg"
    assert float(shown.headers["x-picture-age"]) < 5
    assert shown.content == base64.b64decode(JPEG)

    # Only JPEGs, only from a player.
    png = base64.b64encode(b"\x89PNG" + b"0" * 40).decode()
    assert (await api.post("/api/mapping/players/me/picture", headers=token,
                           json={"image": png})).status_code == 400
    assert (await api.post("/api/mapping/players/me/picture", headers=token,
                           json={"image": "not base64 at all!!"})).status_code in (400, 422)
    assert (await api.post("/api/mapping/players/me/picture", headers=headers,
                           json={"image": JPEG})).status_code == 404
    # Viewing needs a sign-in.
    assert (await api.get(f"/api/mapping/players/{player_id}/picture")).status_code == 401

    # A removed mini PC's picture goes with it.
    await api.delete(f"/api/mapping/players/{player_id}", headers=headers)
    assert (await api.get(f"/api/mapping/players/{player_id}/picture",
                          headers=headers)).status_code == 404


async def test_the_status_screen_beside_the_projector_gets_its_own_pictures_faster(api):
    """The second monitor on a mini PC shows its own output, every second."""
    headers = await login(api)
    player_id, token = await paired(api, headers)

    # The status screen signs in as its own mini PC and asks for its picture.
    asked = await api.get(f"/api/mapping/players/{player_id}/picture", headers=token)
    assert asked.status_code == 204
    beat = (await api.post("/api/mapping/players/me", headers=token, json={})).json()
    assert beat["picture"] is True
    assert (beat["picture_ms"], beat["picture_width"]) == (1000, 960)

    # It does not make every other mini PC send pictures day and night.
    import app.api.routes.mapping_players as players
    assert not players._watching()

    # The Dashboard looking keeps the usual pace for the others.
    players._watched_close.clear()
    await api.get(f"/api/mapping/players/{player_id}/picture", headers=headers)
    beat = (await api.post("/api/mapping/players/me", headers=token, json={})).json()
    assert (beat["picture"], beat["picture_ms"], beat["picture_width"]) == (True, 3000, 480)


SCREENS = {"state": "on", "count": 2, "projector": "1920 × 1200, on the left",
           "second": "1920 × 1080, on the right"}


async def test_the_players_page_shows_the_second_screen_and_swaps_it(api):
    headers = await login(api)
    player_id, _token = await paired(api, headers)

    await app_checkin(api, version="1.0.76", awake=[])  # before the status screen
    listed = (await api.get("/api/mapping/players", headers=headers)).json()[0]
    assert listed["app"]["screens"] is None
    refused = await command(api, headers, player_id, "swap_screens")
    assert refused.status_code == 409 and "next update" in refused.json()["detail"]

    await app_checkin(api, version="1.0.80", awake=[], screens={**SCREENS, "state": "one", "count": 1,
                                                                "second": None})
    refused = await command(api, headers, player_id, "swap_screens")
    assert refused.status_code == 409 and "only one screen" in refused.json()["detail"]
    refused = await command(api, headers, player_id, "extend_screens")
    assert refused.status_code == 409

    await app_checkin(api, version="1.0.80", awake=[], screens=SCREENS)
    listed = (await api.get("/api/mapping/players", headers=headers)).json()[0]
    assert listed["app"]["screens"] == SCREENS
    swapped = await command(api, headers, player_id, "swap_screens")
    assert swapped.status_code == 200, swapped.text
    assert swapped.json()["via"] == "app"
    assert (await app_checkin(api, version="1.0.80", screens=SCREENS))["commands"] == ["swap_screens"]

    # Windows showing the same picture on both: one button makes it a second screen.
    mirrored = {"state": "duplicate", "count": 1, "projector": "1920 × 1200", "second": None}
    await app_checkin(api, version="1.0.80", screens=mirrored)
    extended = await command(api, headers, player_id, "extend_screens")
    assert extended.status_code == 200, extended.text
    assert (await app_checkin(api, version="1.0.80", screens=mirrored))["commands"] == ["extend_screens"]

    # Nonsense from an app is refused, not stored.
    bad = await api.post("/api/mapping/players/app", json={
        "device_id": PLAYER["device_id"], "secret": SECRET, "screens": {"state": "sideways"}})
    assert bad.status_code == 422


# -- the Mini PC app updating itself ------------------------------------------------


def fake_release(tmp_path, version="1.0.60", body=b"new installer " * 1000):
    """A minipc-latest release in a folder, as the server would download it."""
    import hashlib

    folder = tmp_path / "release"
    folder.mkdir(exist_ok=True)
    (folder / "MiniPC-Setup.exe").write_bytes(body)
    (folder / "minipc-version.json").write_text(json.dumps({
        "version": version, "sha256": hashlib.sha256(body).hexdigest(), "size": len(body)}))
    return folder, body


@pytest.fixture
def release(tmp_path, monkeypatch):
    """The server's mini PC updates, reading the release from local files."""
    import httpx

    import app.services.minipc_updates as updates

    folder, body = fake_release(tmp_path)

    def handler(request: httpx.Request) -> httpx.Response:
        path = folder / request.url.path.rsplit("/", 1)[-1]
        return httpx.Response(200, content=path.read_bytes()) if path.is_file() else httpx.Response(404)

    real = httpx.AsyncClient
    monkeypatch.setattr(updates.httpx, "AsyncClient",
                        lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    service = updates.MiniPCUpdates(tmp_path / "minipc-app")
    monkeypatch.setattr(updates, "_updates", service)
    return SimpleNamespace(service=service, folder=folder, body=body, module=updates)


async def test_the_server_keeps_the_newest_installer_and_checks_it(api, release):
    await release.service.refresh(force=True)
    assert release.service.error is None
    assert release.service.latest.version == "1.0.60"
    assert release.service.latest.path.read_bytes() == release.body
    # Kept across a restart of the server, without the internet.
    again = release.module.MiniPCUpdates(release.service.folder)
    assert again.latest.version == "1.0.60"

    response = await api.get("/api/mapping/players/app/installer")
    assert response.status_code == 200
    assert response.content == release.body


async def test_a_damaged_download_is_not_handed_out(api, release):
    note = json.loads((release.folder / "minipc-version.json").read_text())
    note["sha256"] = "0" * 64
    (release.folder / "minipc-version.json").write_text(json.dumps(note))
    await release.service.refresh(force=True)
    assert release.service.latest is None
    assert "checksum" in release.service.error
    assert (await api.get("/api/mapping/players/app/installer")).status_code == 404


async def test_a_mini_pc_updates_itself_only_when_nothing_is_on(api, release, monkeypatch):
    headers = await login(api)
    player_id, _ = await paired(api, headers)
    await release.service.refresh(force=True)

    # A show on: it waits, and says why.
    busy = "a show is playing"
    monkeypatch.setattr(release.module, "busy_reason", lambda: _async(busy))
    reply = await app_checkin(api, version="1.0.50")
    assert reply["update"] is None
    app = (await api.get("/api/mapping/players", headers=headers)).json()[0]["app"]
    assert app["update"] == "waiting" and "a show is playing" in app["update_message"]
    refused = await command(api, headers, player_id, "update")
    assert refused.status_code == 409 and "show" in refused.json()["detail"]

    # Nothing on: offered; the app downloads it, then is told again to install it.
    busy = None
    reply = await app_checkin(api, version="1.0.50")
    assert reply["update"]["version"] == "1.0.60"
    assert reply["update"]["sha256"] == release.service.latest.sha256
    got = await api.get(reply["update"]["url"])
    assert got.content == release.body
    reply = await app_checkin(api, version="1.0.50", update={"state": "ready", "version": "1.0.60"})
    assert reply["update"]["version"] == "1.0.60"
    app = (await api.get("/api/mapping/players", headers=headers)).json()[0]["app"]
    assert app["update"] == "updating"

    # Back with the new version.
    reply = await app_checkin(api, version="1.0.60")
    assert reply["update"] is None
    app = (await api.get("/api/mapping/players", headers=headers)).json()[0]["app"]
    assert app["update"] == "up_to_date" and app["version"] == "1.0.60"
    events = (await api.get("/api/events", headers=headers)).json()
    assert any(e["kind"] == "player_update" and "1.0.60" in e["message"] for e in events)


async def test_a_show_starting_holds_an_update_under_way(api, release, monkeypatch):
    headers = await login(api)
    await paired(api, headers)
    await release.service.refresh(force=True)
    busy = None
    monkeypatch.setattr(release.module, "busy_reason", lambda: _async(busy))
    assert (await app_checkin(api, version="1.0.50"))["update"] is not None
    # Downloaded, but a show started meanwhile: not now.
    busy = "the show starts soon"
    reply = await app_checkin(api, version="1.0.50", update={"state": "ready", "version": "1.0.60"})
    assert reply["update"] is None


async def test_a_failed_update_is_not_retried_by_itself(api, release, monkeypatch):
    headers = await login(api)
    player_id, _ = await paired(api, headers)
    await release.service.refresh(force=True)
    monkeypatch.setattr(release.module, "busy_reason", lambda: _async(None))
    assert (await app_checkin(api, version="1.0.50"))["update"] is not None
    reply = await app_checkin(api, version="1.0.50", update={
        "state": "failed", "version": "1.0.60", "error": "the installer stopped with code 5"})
    assert reply["update"] is None
    assert (await app_checkin(api, version="1.0.50"))["update"] is None
    app = (await api.get("/api/mapping/players", headers=headers)).json()[0]["app"]
    assert app["update"] == "failed" and "code 5" in app["update_message"]

    # Update now tries again.
    pressed = await command(api, headers, player_id, "update")
    assert pressed.status_code == 200, pressed.text
    assert "does not restart" in pressed.json()["message"]
    assert (await app_checkin(api, version="1.0.50"))["update"]["version"] == "1.0.60"


async def test_an_old_app_is_told_to_paste_the_line_once(api, release):
    headers = await login(api)
    player_id, _ = await paired(api, headers)
    await release.service.refresh(force=True)
    reply = await app_checkin(api)
    assert reply.get("update") is None
    refused = await command(api, headers, player_id, "update")
    assert refused.status_code == 409 and "install line" in refused.json()["detail"]


def test_one_mini_pc_at_a_time(tmp_path):
    from app.services.minipc_updates import MiniPCUpdates, Release

    service = MiniPCUpdates(tmp_path)
    service.latest = Release("1.0.60", "a" * 64, 10, tmp_path / "x.exe")
    assert service.check_in(1, "Left", "1.0.50", None, None)[0] is not None
    offer, _ = service.check_in(2, "Right", "1.0.50", None, None)
    assert offer is None and "Left is updating first" in service.waiting[2]
    service.check_in(1, "Left", "1.0.60", None, None)
    assert service.check_in(2, "Right", "1.0.50", None, None)[0] is not None


def test_an_update_that_never_comes_back_counts_as_failed(tmp_path, monkeypatch):
    import app.services.minipc_updates as updates

    service = updates.MiniPCUpdates(tmp_path)
    service.latest = updates.Release("1.0.60", "a" * 64, 10, tmp_path / "x.exe")
    service.check_in(1, "Left", "1.0.50", None, None)
    service.check_in(1, "Left", "1.0.50", {"state": "ready", "version": "1.0.60"}, None)
    later = updates.time.monotonic() + updates.UPDATE_SECONDS + 1
    monkeypatch.setattr(updates.time, "monotonic", lambda: later)
    _, note = service.check_in(1, "Left", "1.0.50", None, None)
    assert "did not come back" in note
    # And the others do not try it by themselves.
    assert service.check_in(2, "Right", "1.0.50", None, None)[0] is None


async def _async(value):
    return value


async def test_the_players_page_says_whether_a_mini_pc_stays_on(api):
    headers = await login(api)
    await paired(api, headers)

    await app_checkin(api, version="1.0.70")  # before this app kept Windows awake
    assert (await api.get("/api/mapping/players", headers=headers)).json()[0]["app"]["awake"] is None
    await app_checkin(api, version="1.0.80", awake=[])
    assert (await api.get("/api/mapping/players", headers=headers)).json()[0]["app"]["awake"] == []
    warning = "Windows Update may restart this computer between 5 PM and 8 AM to finish an update."
    await app_checkin(api, version="1.0.80", awake=[warning])
    assert (await api.get("/api/mapping/players", headers=headers)).json()[0]["app"]["awake"] == [warning]


async def test_a_show_ending_never_turns_a_mini_pc_off(api):
    """Only the Shut down and Restart buttons do: the end of a show blanks the output."""
    from app.services import tonight
    from tests.test_mapping import make_show

    headers = await login(api)
    player_id, _ = await paired(api, headers)
    await app_checkin(api, version="1.0.80", awake=[])
    show = await make_show(api, headers)
    saved = await api.put("/api/tonight", headers=headers, json={
        "show_id": show["id"], "enabled": True, "start_at": "18:00", "end_at": "23:00",
        "power": True})
    assert saved.status_code == 200, saved.text

    await tonight.start_show(by="test")
    # The end of the night, with "turn the projectors off" ticked.
    await tonight.stop_show(by="test", power_off=True)
    pressed = await api.post("/api/emergency/stop", headers=headers)
    assert pressed.status_code == 200, pressed.text
    await api.post("/api/emergency/clear", headers=headers)

    assert (await app_checkin(api, version="1.0.80", awake=[]))["commands"] == []
    events = (await api.get("/api/events", headers=headers)).json()
    assert not [e for e in events if e["kind"] == "player_power"]
    listed = (await api.get("/api/mapping/players", headers=headers)).json()[0]
    assert listed["id"] == player_id and listed["app"]["connected"]
