"""The Mini PC program, without a server, a camera or a display."""

from __future__ import annotations

import json
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import discovery  # noqa: E402
import kiosk  # noqa: E402
import minipc  # noqa: E402

# -- settings ----------------------------------------------------------------------------


def test_config_makes_one_identity_and_keeps_it(tmp_path):
    first = minipc.Config(tmp_path / "config.json")
    again = minipc.Config(tmp_path / "config.json")
    assert again["device_id"] == first["device_id"].strip() and again["secret"] == first["secret"]
    assert len(first["secret"]) == 64
    assert first["camera"] == "auto" and first["server"] == ""

    camera = first.identity("camera")
    assert camera["secret"] == first["secret"]
    assert camera["device_id"] == f"{first['device_id']}-camera"
    assert camera["name"].endswith(" camera")


def test_config_survives_a_damaged_file(tmp_path):
    path = tmp_path / "config.json"
    path.write_text("{not json")
    assert minipc.Config(path)["device_id"].startswith("mpc-")


def test_the_player_address_carries_the_identity_in_the_fragment(tmp_path):
    app = minipc.MiniPC(minipc.Config(tmp_path / "config.json"), tmp_path)
    assert app.player_url() is None
    app.server = "http://192.168.1.10:8765"
    url = urlsplit(app.player_url())
    assert (url.scheme, url.netloc, url.path, url.query) == ("http", "192.168.1.10:8765", "/player", "")
    fragment = {k: v[0] for k, v in parse_qs(url.fragment).items()}
    assert fragment == app.config.identity()


# -- the local page -------------------------------------------------------------------------


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


@pytest.fixture
def page(tmp_path):
    app = minipc.MiniPC(minipc.Config(tmp_path / "config.json"), tmp_path)
    status = minipc.StatusPage(app, free_port())
    status.start()
    yield status
    status.close()


def get(url: str, host: str | None = None) -> tuple[int, bytes]:
    request = urllib.request.Request(url, headers={"Host": host} if host else {})
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, b""


def test_the_page_waits_then_sends_the_window_to_the_player(page):
    status, body = get(page.url)
    assert status == 200 and b"location.replace" in body
    state = json.loads(get(f"{page.url}status")[1])
    assert state["player"] is None and state["message"]

    page.app.server = "http://10.0.0.5:8765"
    state = json.loads(get(f"{page.url}status")[1])
    assert state["player"].startswith("http://10.0.0.5:8765/player#device_id=")


def test_the_page_answers_only_this_computers_window(page):
    assert get(f"{page.url}status", host="evil.example")[0] == 403


def test_a_second_copy_finds_the_page_taken(page):
    with pytest.raises(OSError):
        minipc.StatusPage(page.app, page.port)


# -- finding the server ---------------------------------------------------------------------


class FakeServer:
    """Answers discovery like the main server, from 127.0.0.1."""

    def __init__(self, reply: bytes) -> None:
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.bind(("127.0.0.1", 0))
        self.sock.settimeout(0.2)
        self.port = self.sock.getsockname()[1]
        self.reply = reply
        self.stopping = threading.Event()
        threading.Thread(target=self.serve, daemon=True).start()

    def serve(self) -> None:
        while not self.stopping.is_set():
            try:
                data, addr = self.sock.recvfrom(2048)
            except OSError:
                continue
            if data == discovery.REQUEST:
                self.sock.sendto(self.reply, addr)

    def close(self) -> None:
        self.stopping.set()
        self.sock.close()


def test_find_server_uses_the_address_the_answer_came_from():
    fake = FakeServer(json.dumps({"service": "projectionmapping", "port": 9001}).encode())
    try:
        found = discovery.find_server(targets=[("127.0.0.1", fake.port)], timeout=1)
    finally:
        fake.close()
    assert found == "http://127.0.0.1:9001"


def test_find_server_ignores_other_answers():
    fake = FakeServer(b'{"service": "something-else", "port": 80}')
    try:
        assert discovery.find_server(targets=[("127.0.0.1", fake.port)], timeout=0.5) is None
    finally:
        fake.close()


def test_broadcast_targets_include_the_limited_broadcast():
    assert ("255.255.255.255", 8765) in discovery.broadcast_targets(8765)


@pytest.fixture
def health_server():
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            body = b'{"status": "degraded"}' if self.path == "/api/health" else b""
            self.send_response(200 if body else 404)
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


def test_answers(health_server):
    assert discovery.answers(health_server)
    assert not discovery.answers(f"http://127.0.0.1:{free_port()}", timeout=0.5)


def test_locate_prefers_a_pinned_server_then_the_last_one(tmp_path, health_server, monkeypatch):
    config = minipc.Config(tmp_path / "config.json")
    app = minipc.MiniPC(config, tmp_path)
    monkeypatch.setattr(discovery, "find_server", lambda *_a, **_k: None)
    assert app.locate() is None

    config["last_server"] = health_server
    assert app.locate() == health_server

    config["server"] = f"http://127.0.0.1:{free_port()}"
    assert app.locate() is None
    assert "Cannot reach" in app.message


# -- the window -------------------------------------------------------------------------------


def test_kiosk_command_is_full_screen_with_one_page_pixel_per_projector_pixel(tmp_path):
    command = kiosk.kiosk_command("/usr/bin/chromium", "http://127.0.0.1:1/", tmp_path / "profile")
    assert command[0] == "/usr/bin/chromium" and command[-1] == "http://127.0.0.1:1/"
    assert "--kiosk" in command and "--force-device-scale-factor=1" in command
    assert f"--user-data-dir={tmp_path / 'profile'}" in command
    assert "--edge-kiosk-type=fullscreen" not in command
    edge = kiosk.kiosk_command(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                               "http://x/", tmp_path)
    assert "--edge-kiosk-type=fullscreen" in edge
    cached = kiosk.kiosk_command("chrome", "http://x/", tmp_path, secure_origin="http://10.0.0.5:8765")
    assert "--unsafely-treat-insecure-origin-as-secure=http://10.0.0.5:8765" in cached


def test_mark_clean_exit(tmp_path):
    preferences = tmp_path / "Default" / "Preferences"
    preferences.parent.mkdir()
    preferences.write_text(json.dumps({"profile": {"exit_type": "Crashed"}}))
    kiosk.mark_clean_exit(tmp_path)
    assert json.loads(preferences.read_text())["profile"]["exit_type"] == "Normal"


def test_the_window_is_reopened_and_backs_off_when_it_keeps_closing(tmp_path, monkeypatch):
    # A "browser" that closes at once, as one handing its window elsewhere does.
    script = tmp_path / "browser.py"
    script.write_text("import sys\n")
    window = kiosk.Kiosk(sys.executable, "http://x/", tmp_path / "profile")
    monkeypatch.setattr(kiosk, "kiosk_command", lambda b, u, p, e, o: [b, str(script)])
    window.ensure()
    first = window.process
    first.wait(timeout=10)
    window.ensure()  # noticed it closed: waits before reopening
    assert window.process is None and window._backoff == 4.0
    window._next_start = time.monotonic()
    window.ensure()
    assert window.process is not None and window.process.pid != first.pid
    window.stop()


def test_a_window_handed_to_another_process_is_followed_not_reopened(tmp_path):
    profile = tmp_path / "profile"
    other = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)",
                              f"--user-data-dir={profile}"])
    try:
        window = kiosk.Kiosk(sys.executable, "http://x/", profile)
        window._started_at = time.monotonic()  # it started one, which handed over
        assert window.running and window.process.pid == other.pid
        window.stop()
        assert other.wait(timeout=10) is not None
    finally:
        other.kill()


@pytest.fixture
def clock(monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(minipc.time, "monotonic", lambda: now[0])
    return now


def test_a_server_that_moved_is_found_again(tmp_path, monkeypatch, clock):
    app = minipc.MiniPC(minipc.Config(tmp_path / "config.json"), tmp_path)
    app.server = "http://10.0.0.5:8765"
    monkeypatch.setattr(discovery, "answers", lambda base, **_: base == "http://10.0.0.9:8765")
    monkeypatch.setattr(discovery, "find_server", lambda *_a, **_k: "http://10.0.0.9:8765")
    assert app.follow_server() is False  # only just went quiet
    clock[0] += minipc.LOST_SECONDS + 1
    assert app.follow_server() is True
    assert app.server == "http://10.0.0.9:8765" == app.config["last_server"]


def test_the_window_reopens_when_the_server_comes_back(tmp_path, monkeypatch, clock):
    app = minipc.MiniPC(minipc.Config(tmp_path / "config.json"), tmp_path)
    app.server = "http://10.0.0.5:8765"
    up = [False]
    monkeypatch.setattr(discovery, "answers", lambda base, **_: up[0])
    monkeypatch.setattr(discovery, "find_server", lambda *_a, **_k: None)
    assert app.follow_server() is False
    clock[0] += minipc.LOST_SECONDS + 1
    assert app.follow_server() is False
    up[0] = True
    assert app.follow_server() is True
    assert app.follow_server() is False


def test_a_short_blip_leaves_the_window_alone(tmp_path, monkeypatch, clock):
    app = minipc.MiniPC(minipc.Config(tmp_path / "config.json"), tmp_path)
    app.server = "http://10.0.0.5:8765"
    up = [False]
    monkeypatch.setattr(discovery, "answers", lambda base, **_: up[0])
    assert app.follow_server() is False
    clock[0] += 3
    up[0] = True
    assert app.follow_server() is False
