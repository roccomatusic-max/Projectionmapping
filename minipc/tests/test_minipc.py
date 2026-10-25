"""The Mini PC program, without a server, a camera or a display."""

from __future__ import annotations

import builtins
import errno
import io
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
from types import SimpleNamespace
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
    path.write_text("[]")
    assert minipc.Config(path)["device_id"].startswith("mpc-")


def torn_writes(monkeypatch) -> None:
    """From now on, the power goes off half way through writing any file."""
    real_open = io.open

    class Torn:
        def __init__(self, file) -> None:
            self.file = file

        def __enter__(self):
            return self

        def __exit__(self, *_exc) -> None:
            self.file.close()

        def write(self, text):
            self.file.write(text[: len(text) // 2])
            self.file.flush()
            raise OSError("the power went off")

        def __getattr__(self, name):
            return getattr(self.file, name)

    def open_torn(file, mode="r", *args, **kwargs):
        opened = real_open(file, mode, *args, **kwargs)
        return Torn(opened) if "w" in mode else opened

    monkeypatch.setattr(io, "open", open_torn)
    monkeypatch.setattr(builtins, "open", open_torn)


def test_config_is_not_rewritten_at_every_start(tmp_path, monkeypatch):
    path = tmp_path / "config.json"
    first = minipc.Config(path)
    monkeypatch.setattr(minipc.Config, "save", lambda _self: pytest.fail("rewrote an unchanged config.json"))
    assert minipc.Config(path)["secret"] == first["secret"]


def test_a_power_cut_while_saving_keeps_the_identity(tmp_path, monkeypatch):
    path = tmp_path / "config.json"
    config = minipc.Config(path)
    torn_writes(monkeypatch)
    with pytest.raises(OSError):
        config["last_server"] = "http://10.0.0.5:8765"
    monkeypatch.undo()
    again = minipc.Config(path)
    assert (again["device_id"], again["secret"]) == (config["device_id"], config["secret"])


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


def test_the_page_port_is_not_shared_on_windows(tmp_path, monkeypatch):
    # Windows lets a socket with SO_REUSEADDR bind a port another socket is
    # listening on: the second copy would not find the page taken.
    app = minipc.MiniPC(minipc.Config(tmp_path / "config.json"), tmp_path)
    monkeypatch.setattr(minipc.sys, "platform", "win32")
    status = minipc.StatusPage(app, free_port())
    monkeypatch.undo()
    try:
        assert status.server.socket.getsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR) == 0
    finally:
        status.server.server_close()


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


def test_find_server_keeps_listening_after_windows_receive_errors(monkeypatch):
    # Windows hands an earlier datagram's ICMP error, or an oversized
    # datagram, to the next receive; the server's answer can still follow.
    answer = json.dumps({"service": "projectionmapping", "port": 9001}).encode()
    arrivals = [ConnectionResetError(10054, "reset by peer"), OSError(errno.EMSGSIZE, "too big"),
                (answer, ("10.0.0.7", 8765))]

    class Socket:
        def __init__(self, *_args) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_exc) -> None:
            pass

        def setsockopt(self, *_args) -> None:
            pass

        def sendto(self, *_args) -> None:
            pass

        def settimeout(self, _seconds) -> None:
            pass

        def recvfrom(self, _size):
            arrival = arrivals.pop(0)
            if isinstance(arrival, Exception):
                raise arrival
            return arrival

    monkeypatch.setattr(discovery.socket, "socket", Socket)
    assert discovery.find_server(targets=[("10.0.0.255", 8765)], timeout=1) == "http://10.0.0.7:9001"


def test_broadcast_targets_include_the_limited_broadcast():
    assert ("255.255.255.255", 8765) in discovery.broadcast_targets(8765)


def serve_health(body: bytes) -> ThreadingHTTPServer:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            found = self.path == "/api/health"
            self.send_response(200 if found else 404)
            self.end_headers()
            self.wfile.write(body if found else b"")

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


@pytest.fixture
def health_server():
    server = serve_health(b'{"status": "degraded"}')
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


def test_answers(health_server):
    assert discovery.answers(health_server)
    assert not discovery.answers(f"http://127.0.0.1:{free_port()}", timeout=0.5)


def test_answers_is_no_for_something_else_answering_with_odd_json():
    for body in (b"5", b"null", b'["status"]', b'"status"'):
        server = serve_health(body)
        try:
            assert not discovery.answers(f"http://127.0.0.1:{server.server_address[1]}"), body
        finally:
            server.shutdown()


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


def test_kiosk_command_keeps_the_browsers_own_prompts_off_the_output(tmp_path):
    command = kiosk.kiosk_command("/usr/bin/chromium", "http://127.0.0.1:1/", tmp_path / "profile")
    assert "--disable-search-engine-choice-screen" in command
    assert "--hide-crash-restore-bubble" in command


def test_mark_clean_exit(tmp_path):
    preferences = tmp_path / "Default" / "Preferences"
    preferences.parent.mkdir()
    preferences.write_text(json.dumps({"profile": {"exit_type": "Crashed"}}))
    kiosk.mark_clean_exit(tmp_path)
    assert json.loads(preferences.read_text())["profile"]["exit_type"] == "Normal"


def test_mark_clean_exit_never_leaves_half_a_settings_file(tmp_path, monkeypatch):
    preferences = tmp_path / "Default" / "Preferences"
    preferences.parent.mkdir()
    preferences.write_text(json.dumps({"profile": {"exit_type": "Crashed"}, "media": "x" * 1000}))
    torn_writes(monkeypatch)
    kiosk.mark_clean_exit(tmp_path)
    monkeypatch.undo()
    assert json.loads(preferences.read_text())["profile"]["exit_type"] == "Crashed"
    # Settings it does not understand are left alone.
    preferences.write_text(json.dumps({"profile": "?"}))
    kiosk.mark_clean_exit(tmp_path)
    assert json.loads(preferences.read_text()) == {"profile": "?"}


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


def test_the_main_loop_carries_on_after_an_unexpected_error(tmp_path, monkeypatch):
    monkeypatch.setattr(minipc, "TICK_SECONDS", 0.01)
    monkeypatch.setattr(minipc, "find_browser", lambda: None)
    app = minipc.MiniPC(minipc.Config(tmp_path / "config.json"), tmp_path, camera=False)
    ticks = []

    def follow_server() -> bool:
        ticks.append(time.monotonic())
        if len(ticks) == 1:
            raise PermissionError(13, "config.json is open in another program")
        app.stopping.set()
        return False

    app.follow_server = follow_server
    app.run(SimpleNamespace(url="http://127.0.0.1:1/"))
    assert len(ticks) == 2


def test_a_failed_self_check_is_logged_and_fails(tmp_path, monkeypatch, caplog):
    import sources

    def broken() -> dict:
        raise RuntimeError("the depth camera SDK did not load")

    monkeypatch.setattr(minipc, "configure_logging", lambda *_args: None)
    monkeypatch.setattr(sources, "sdk_status", broken)
    assert minipc.main(["--check", "--data-dir", str(tmp_path)]) == 1
    assert "self-check failed" in caplog.text and "SDK did not load" in caplog.text


def test_a_short_blip_leaves_the_window_alone(tmp_path, monkeypatch, clock):
    app = minipc.MiniPC(minipc.Config(tmp_path / "config.json"), tmp_path)
    app.server = "http://10.0.0.5:8765"
    up = [False]
    monkeypatch.setattr(discovery, "answers", lambda base, **_: up[0])
    assert app.follow_server() is False
    clock[0] += 3
    up[0] = True
    assert app.follow_server() is False


def test_a_briefly_locked_file_is_still_replaced(tmp_path, monkeypatch):
    """Windows refuses the replace while an antivirus scan has the file open."""
    target = tmp_path / "config.json"
    target.write_text("old")
    real_replace = kiosk.os.replace
    refusals = iter([PermissionError("in use"), PermissionError("in use")])

    def replace(src, dst):
        error = next(refusals, None)
        if error:
            raise error
        real_replace(src, dst)

    monkeypatch.setattr(kiosk.os, "replace", replace)
    monkeypatch.setattr(kiosk.time, "sleep", lambda _s: None)
    kiosk.write_atomically(target, "new")
    assert target.read_text() == "new"


# -- install line ------------------------------------------------------------------------


def test_install_line_is_the_same_everywhere_and_is_published():
    root = Path(__file__).resolve().parents[2]
    script = (root / "minipc" / "install-minipc.ps1").read_text(encoding="utf-8")
    url = "https://github.com/roccomatusic-max/Projectionmapping/releases/download/minipc-latest/install-minipc.ps1"
    line = f"[Net.ServicePointManager]::SecurityProtocol='Tls12'; irm {url} | iex"
    assert f"#   {line}" in script
    assert line in (root / "minipc" / "README.md").read_text(encoding="utf-8")
    assert line in (root / "frontend" / "src" / "mapping" / "editor" / "PlayersPanel.tsx").read_text(encoding="utf-8")
    workflow = (root / ".github" / "workflows" / "minipc.yml").read_text(encoding="utf-8")
    assert "gh release create minipc-latest MiniPC-Setup.exe minipc/install-minipc.ps1" in workflow
    # The Smart App Control check runs before anything is downloaded or started.
    assert script.index("VerifiedAndReputablePolicyState") < script.index("Invoke-WebRequest")
    assert script.index("Show-AppControlBlock\n    $global:LASTEXITCODE = 1") < script.index("Start-Process")


# -- the Players page's controls ------------------------------------------------------------


class Reply:
    def __init__(self, status: int, body: dict | None = None) -> None:
        self.status_code = status
        self.body = body or {}

    def json(self) -> dict:
        return self.body


def test_check_in_sends_the_identity_and_returns_the_commands(tmp_path, monkeypatch):
    app = minipc.MiniPC(minipc.Config(tmp_path / "config.json"), tmp_path)
    assert app.check_in() == []  # no server yet: nothing sent
    app.server = "http://10.0.0.5:8765"
    sent = []

    def post(url, json, timeout):
        sent.append((url, json))
        return Reply(200, {"commands": ["restart_output", "reboot"]})

    monkeypatch.setattr(minipc.requests, "post", post)
    monkeypatch.setattr(minipc, "network_card", lambda _address: "aa:bb:cc:dd:ee:01")
    assert app.check_in() == ["restart_output", "reboot"]
    url, body = sent[0]
    assert url == "http://10.0.0.5:8765/api/mapping/players/app"
    assert body["device_id"] == app.config["device_id"] and body["secret"] == app.config["secret"]
    assert body["mac"] == "aa:bb:cc:dd:ee:01"
    assert body["screens"] is None  # no status screen here (not Windows)

    app.second = SimpleNamespace(report=lambda: {"state": "on", "count": 2, "projector": "1920 × 1200",
                                                 "second": "1920 × 1080"})
    app.check_in()
    assert sent[-1][1]["screens"]["state"] == "on"


def test_the_players_page_can_swap_the_screens(tmp_path):
    app = minipc.MiniPC(minipc.Config(tmp_path / "config.json"), tmp_path)
    app.obey(["swap_screens", "extend_screens"])  # nothing to swap: ignored
    asked = []
    app.second = SimpleNamespace(swap=lambda: asked.append("swap"), extend=lambda: asked.append("extend"))
    app.obey(["swap_screens", "extend_screens"])
    assert asked == ["swap", "extend"]


def test_check_in_quietly_asks_nothing_of_an_older_or_missing_server(tmp_path, monkeypatch):
    app = minipc.MiniPC(minipc.Config(tmp_path / "config.json"), tmp_path)
    app.server = "http://10.0.0.5:8765"
    monkeypatch.setattr(minipc.requests, "post", lambda *_a, **_k: Reply(404))
    assert app.check_in() == []

    def down(*_a, **_k):
        raise minipc.requests.ConnectionError("gone")

    monkeypatch.setattr(minipc.requests, "post", down)
    assert app.check_in() == []
    app._lost_since = 1.0  # known to be away: not even tried
    monkeypatch.setattr(minipc.requests, "post", lambda *_a, **_k: pytest.fail("asked a lost server"))
    assert app.check_in() == []


def test_obey_restarts_the_window_and_the_computer(tmp_path, monkeypatch):
    app = minipc.MiniPC(minipc.Config(tmp_path / "config.json"), tmp_path)
    ran = []
    monkeypatch.setattr(minipc.sys, "platform", "win32")
    monkeypatch.setattr(minipc.subprocess, "run", lambda command, **_k: ran.append(command))

    app.obey(["restart_output", "something-new"])
    assert app.restart_requested.is_set() and ran == []
    app.obey(["reboot"])
    app.obey(["shutdown"])
    assert ran == [["shutdown", "/r", "/t", "0", "/f"], ["shutdown", "/s", "/t", "0", "/f"]]


def test_power_does_nothing_off_windows(monkeypatch):
    monkeypatch.setattr(minipc.sys, "platform", "linux")
    monkeypatch.setattr(minipc.subprocess, "run", lambda *_a, **_k: pytest.fail("powered off"))
    minipc.power("reboot")


def test_network_card_is_the_one_holding_the_address(monkeypatch):
    nic = SimpleNamespace
    monkeypatch.setattr(minipc.psutil, "net_if_addrs", lambda: {
        "Wi-Fi": [nic(family=socket.AF_INET, address="10.1.1.2"),
                  nic(family=minipc.psutil.AF_LINK, address="11-11-11-11-11-11")],
        "Ethernet": [nic(family=socket.AF_INET, address="192.168.1.23"),
                     nic(family=minipc.psutil.AF_LINK, address="AA-BB-CC-DD-EE-01")],
    })
    assert minipc.network_card("192.168.1.23") == "aa:bb:cc:dd:ee:01"
    assert minipc.network_card("172.16.0.1") is None
    assert minipc.network_card(None) is None
