"""The Mini PC app updating itself from the main server."""

from __future__ import annotations

import hashlib
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import minipc  # noqa: E402
import selfupdate  # noqa: E402

BODY = b"new installer " * 5000


class Reply:
    def __init__(self, status: int, body: dict | None = None) -> None:
        self.status_code = status
        self.body = body or {}

    def json(self) -> dict:
        return self.body


@pytest.fixture
def server():
    """The main server's installer download."""
    hits = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            hits.append(self.path)
            self.send_response(200)
            self.send_header("Content-Length", str(len(BODY)))
            self.end_headers()
            self.wfile.write(BODY)

        def log_message(self, *_args) -> None:
            pass

    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}", hits
    httpd.shutdown()
    httpd.server_close()


def offer(version="1.0.60", sha256=None):
    return {"version": version, "sha256": sha256 or hashlib.sha256(BODY).hexdigest(),
            "size": len(BODY), "url": "/api/mapping/players/app/installer"}


def wait_downloaded(update: selfupdate.SelfUpdate) -> None:
    update._thread.join(timeout=10)


def test_the_runner_never_restarts_windows():
    script = selfupdate.RUNNER
    assert "/NORESTART" in script and "/VERYSILENT" in script
    assert "Restart-Computer" not in script and "shutdown" not in script.lower()


def test_download_is_checked_then_ready(tmp_path, server):
    base, hits = server
    update = selfupdate.SelfUpdate(tmp_path, version="1.0.50")
    assert update.offered(offer(), base) is False  # first: download
    assert update.report() == {"state": "downloading", "version": "1.0.60"}
    wait_downloaded(update)
    assert update.report() == {"state": "ready", "version": "1.0.60"}
    assert update.ready[1].read_bytes() == BODY
    assert hits == ["/api/mapping/players/app/installer"]
    assert update.offered(offer(), base) is True  # offered again: install now


def test_a_download_that_does_not_match_is_thrown_away(tmp_path, server):
    base, _ = server
    update = selfupdate.SelfUpdate(tmp_path, version="1.0.50")
    update.offered(offer(sha256="0" * 64), base)
    wait_downloaded(update)
    assert update.ready is None
    assert update.report()["state"] == "failed" and "checksum" in update.report()["error"]
    assert not list((tmp_path / "updates").glob("*.exe*"))


def test_the_same_version_is_never_installed_again(tmp_path, server):
    base, hits = server
    update = selfupdate.SelfUpdate(tmp_path, version="1.0.60")
    assert update.offered(offer(), base) is False
    assert hits == [] and update.report() is None


def test_after_an_update_the_outcome_is_told_once(tmp_path):
    folder = tmp_path / "updates"
    folder.mkdir()
    (folder / "result.json").write_text(json.dumps({"version": "1.0.60", "code": 0, "error": None}),
                                        encoding="utf-8-sig")
    assert selfupdate.SelfUpdate(tmp_path, version="1.0.60").report() is None
    assert not (folder / "result.json").exists()

    (folder / "result.json").write_text(json.dumps(
        {"version": "1.0.60", "code": -1, "error": "An Application Control policy has blocked this file"}))
    failed = selfupdate.SelfUpdate(tmp_path, version="1.0.50").report()
    assert failed["state"] == "failed" and "Smart App Control" in failed["error"]


def test_the_whole_handover_keeps_the_window_and_the_computer_on(tmp_path, server, monkeypatch):
    base, _ = server
    app = minipc.MiniPC(minipc.Config(tmp_path / "config.json"), tmp_path)
    app.updater.version = "1.0.50"
    app.server = base
    quit_ = []
    app.on_quit = lambda: quit_.append(True)
    answers = [Reply(200, {"commands": [], "update": offer()})] * 2
    sent = []

    def post(url, json, timeout):
        sent.append(json)
        return answers.pop(0)

    monkeypatch.setattr(minipc.requests, "post", post)
    monkeypatch.setattr(minipc, "network_card", lambda _address: None)
    assert app.check_in() == []
    assert sent[0]["version"] == "1.0.50" and sent[0]["update"] is None
    wait_downloaded(app.updater)

    started = []
    monkeypatch.setattr(selfupdate.sys, "platform", "win32")
    monkeypatch.setattr(selfupdate, "app_control_on", lambda: False)
    monkeypatch.setattr(selfupdate.subprocess, "Popen", lambda command, **_k: started.append(command))
    ran = []
    monkeypatch.setattr(minipc.subprocess, "run", lambda command, **_k: ran.append(command))

    commands = app.check_in()
    assert sent[1]["update"] == {"state": "ready", "version": "1.0.60"}
    assert commands == ["install_update"]
    app.obey(commands)
    assert app.handing_over and app.stopping.is_set() and quit_ == [True]
    assert ran == []  # no shutdown /r
    command = started[0]
    assert command[0] == "powershell.exe"
    assert command[command.index("-Setup") + 1].endswith("MiniPC-Setup-1.0.60.exe")
    assert command[command.index("-Version") + 1] == "1.0.60"
    # The next app keeps the open output window.
    assert selfupdate.SelfUpdate(tmp_path).take_window() == base


def test_smart_app_control_stops_the_update_before_it_starts(tmp_path, server, monkeypatch):
    base, _ = server
    update = selfupdate.SelfUpdate(tmp_path, version="1.0.50")
    update.offered(offer(), base)
    wait_downloaded(update)
    monkeypatch.setattr(selfupdate.sys, "platform", "win32")
    monkeypatch.setattr(selfupdate, "app_control_on", lambda: True)
    monkeypatch.setattr(selfupdate.subprocess, "Popen", lambda *_a, **_k: pytest.fail("ran it"))
    assert update.hand_over(base) is False
    assert "Smart App Control" in update.report()["error"]


def test_the_new_app_takes_over_the_open_window(tmp_path):
    import subprocess

    import kiosk

    profile = tmp_path / "profile"
    other = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)",
                              f"--user-data-dir={profile}"])
    try:
        window = kiosk.Kiosk(sys.executable, "http://x/", profile)
        assert window.adopt("http://10.0.0.5:8765")
        assert window.process.pid == other.pid and window.secure_origin == "http://10.0.0.5:8765"
        window.ensure()  # left alone, not reopened
        assert other.poll() is None
    finally:
        other.kill()
