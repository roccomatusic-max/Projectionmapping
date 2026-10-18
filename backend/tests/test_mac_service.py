"""The Mac app's service definition and its GitHub updater."""

from __future__ import annotations

from pathlib import Path

import pytest

from app import macservice
from app.services.updates import ASSETS, UpdateError, Updater

BUNDLE = Path("/Applications/Projector Control.app")


def test_running_bundle_is_found_from_the_executable():
    exe = "/Applications/Projector Control.app/Contents/MacOS/ProjectorControl"
    assert macservice.running_bundle(exe) == BUNDLE
    assert macservice.running_bundle("/home/x/dist/ProjectorControl/ProjectorControl") is None


def test_service_starts_at_boot_restarts_and_serves_the_network(tmp_path):
    job = macservice.service_definition(BUNDLE, tmp_path, "rocco", "/Users/rocco")
    args = job["ProgramArguments"]
    assert args[0] == str(BUNDLE / "Contents/MacOS/ProjectorControl")
    assert "--serve" in args and "--lan" in args and "--no-browser" in args
    assert args[args.index("--port") + 1] == "8765"
    assert args[args.index("--data-dir") + 1] == str(tmp_path)
    assert job["RunAtLoad"] is True and job["KeepAlive"] is True
    assert job["UserName"] == "rocco"
    assert job["EnvironmentVariables"][macservice.SERVICE_ENV] == "1"


def test_version_ordering():
    key = macservice.version_key
    assert key("1.0.10") > key("1.0.9")
    assert key("dev") < key("1.0.1")


def make_updater(tmp_path, current="1.0.5", machine="arm64"):
    return Updater(tmp_path, BUNDLE, current=current, machine=machine, managed=True)


def release(version="1.0.7"):
    return {
        "name": f"Projector Control for Mac {version}",
        "assets": [
            {"name": name, "url": f"https://api.github.com/assets/{arch}"}
            for arch, name in ASSETS.items()
        ],
    }


def test_newer_release_is_offered_for_this_chip(tmp_path):
    updater = make_updater(tmp_path, machine="x86_64")
    updater.apply_release(200, release("1.0.7"))
    assert updater.latest == "1.0.7"
    assert updater.asset_url.endswith("/x86_64")
    assert updater.available and updater.error is None


def test_same_version_is_not_offered(tmp_path):
    updater = make_updater(tmp_path, current="1.0.7")
    updater.apply_release(200, release("1.0.7"))
    assert not updater.available


def test_private_repository_without_a_key_asks_for_one(tmp_path):
    updater = make_updater(tmp_path)
    updater.apply_release(404, {})
    assert updater.needs_key and not updater.available


def test_rejected_key_asks_for_a_new_one(tmp_path):
    updater = make_updater(tmp_path)
    updater.save_key("github_pat_x")
    updater.apply_release(401, {})
    assert updater.needs_key and "access key" in updater.error


def test_key_is_kept_private_and_can_be_removed(tmp_path):
    updater = make_updater(tmp_path)
    updater.save_key("  github_pat_x \n")
    assert updater.key() == "github_pat_x"
    assert (updater.key_path.stat().st_mode & 0o777) == 0o600
    assert updater._headers()["Authorization"] == "Bearer github_pat_x"
    updater.save_key("")
    assert updater.key() is None and updater.status()["has_key"] is False


async def test_outside_the_mac_app_nothing_is_checked_or_installed(tmp_path):
    updater = Updater(tmp_path, None, current="dev", managed=False)
    status = await updater.check(force=True)
    assert status["supported"] is False and status["latest"] is None
    with pytest.raises(UpdateError):
        await updater.install()


async def test_automatic_update_installs_only_when_quiet(tmp_path, monkeypatch):
    monkeypatch.setattr(Updater, "supported", property(lambda self: True))  # tests run on Linux
    updater = make_updater(tmp_path)
    assert updater.auto is True  # on unless switched off
    installs = []

    async def fake_check(*, force=False):
        updater.apply_release(200, release("1.0.7"))
        return updater.status()

    async def fake_install():
        installs.append(updater.latest)

    monkeypatch.setattr(updater, "check", fake_check)
    monkeypatch.setattr(updater, "install", fake_install)

    async def busy():
        return "a mapping show is playing"

    async def quiet():
        return None

    await updater.auto_tick(busy)
    assert installs == [] and updater.status()["waiting"] == "a mapping show is playing"
    await updater.auto_tick(quiet)
    assert installs == ["1.0.7"] and updater.waiting is None

    # A version that failed and was rolled back is not retried by itself.
    updater.work_dir.mkdir(parents=True, exist_ok=True)
    updater.result_path.write_text("rolled-back 1.0.7")
    await updater.auto_tick(quiet)
    assert installs == ["1.0.7"]

    updater.set_auto(False)
    updater.result_path.unlink()
    await updater.auto_tick(quiet)
    assert installs == ["1.0.7"] and updater.status()["auto"] is False


def test_reset_admin_password_without_a_database(tmp_path, capsys):
    from app.desktop import reset_admin_password

    assert reset_admin_password(tmp_path / "missing") == 1
    assert "No Projector Control database" in capsys.readouterr().out
    assert not (tmp_path / "missing").exists()


# -- talking to GitHub ---------------------------------------------------------

API = "https://api.github.com/repos/"


def github(monkeypatch, handler):
    """Route the updater's HTTP calls to ``handler`` instead of GitHub."""
    import httpx

    from app.services import updates

    real = httpx.AsyncClient
    monkeypatch.setattr(updates.httpx, "AsyncClient",
                        lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setattr(Updater, "supported", property(lambda self: True))  # tests run on Linux


async def test_rate_limit_is_not_reported_as_a_key_problem(tmp_path, monkeypatch):
    import httpx

    github(monkeypatch, lambda request: httpx.Response(
        403, json={"message": "API rate limit exceeded"},
        headers={"x-ratelimit-remaining": "0"}))
    status = await make_updater(tmp_path).check(force=True)
    assert status["needs_key"] is False
    assert "limiting" in status["error"]


async def test_public_repository_between_releases_needs_no_key(tmp_path, monkeypatch):
    import httpx

    def handler(request):
        if request.url.path.endswith("/releases/tags/mac-latest"):
            return httpx.Response(404, json={"message": "Not Found"})
        return httpx.Response(200, json={"private": False})  # the repository itself

    github(monkeypatch, handler)
    status = await make_updater(tmp_path).check(force=True)
    assert status["needs_key"] is False and "No Mac release" in status["error"]


async def test_private_repository_still_asks_for_a_key(tmp_path, monkeypatch):
    import httpx

    github(monkeypatch, lambda request: httpx.Response(404, json={"message": "Not Found"}))
    status = await make_updater(tmp_path).check(force=True)
    assert status["needs_key"] is True


async def test_an_error_page_instead_of_json_is_reported_not_raised(tmp_path, monkeypatch):
    import httpx

    github(monkeypatch, lambda request: httpx.Response(502, text="<html>Bad gateway</html>"))
    status = await make_updater(tmp_path).check(force=True)
    assert status["error"] == "GitHub answered 502." and status["available"] is False


async def test_nothing_is_installed_from_an_earlier_answer(tmp_path, monkeypatch):
    import httpx

    downloads = []

    def handler(request):
        if "/assets/" in request.url.path:
            downloads.append(request.url)
        raise httpx.ConnectError("offline")

    github(monkeypatch, handler)
    updater = make_updater(tmp_path)
    updater.apply_release(200, release("1.0.7"))
    assert updater.available
    with pytest.raises(UpdateError, match="Could not reach GitHub"):
        await updater.install()
    assert downloads == [] and updater.installing is False


async def test_a_second_install_is_refused_while_one_is_under_way(tmp_path, monkeypatch):
    github(monkeypatch, lambda request: None)
    updater = make_updater(tmp_path)
    updater.installing = True
    with pytest.raises(UpdateError, match="already"):
        await updater.install()


async def test_a_failed_download_is_reported_and_can_be_retried(tmp_path, monkeypatch):
    import httpx

    def handler(request):
        if request.url.path.endswith("/releases/tags/mac-latest"):
            return httpx.Response(200, json=release("1.0.7"))
        raise httpx.ReadError("connection reset")  # the download drops

    github(monkeypatch, handler)
    updater = make_updater(tmp_path)
    with pytest.raises(UpdateError, match="could not be installed: connection reset"):
        await updater.install()
    assert updater.installing is False


# -- the watcher that confirms or rolls back an update ------------------------

def run_watcher(tmp_path, port, *, attempts=2):
    import subprocess

    from app.services.updates import WATCH_SCRIPT

    apps = tmp_path / "Applications"
    bundle, previous, failed = (apps / "Projector Control.app",
                                apps / ".Projector Control.previous.app",
                                apps / ".Projector Control.failed.app")
    (bundle / "new").mkdir(parents=True)
    (previous / "old").mkdir(parents=True)
    script = tmp_path / "watch.sh"
    script.write_text(WATCH_SCRIPT.replace("seq 1 120", f"seq 1 {attempts}"))
    result = tmp_path / "result.txt"
    subprocess.run(["/bin/bash", str(script), str(bundle), str(previous), "1.0.7", str(port),
                    str(tmp_path / "server.pid"), str(result), str(failed)],
                   check=True, timeout=60)
    return apps, result.read_text().strip()


def test_watcher_rolls_back_into_a_hidden_folder(tmp_path):
    import socket

    with socket.socket() as unused:  # nothing listens here
        unused.bind(("127.0.0.1", 0))
        port = unused.getsockname()[1]
    apps, result = run_watcher(tmp_path, port)
    assert result == "rolled-back 1.0.7"
    assert (apps / "Projector Control.app" / "old").is_dir()
    # Never a visible, openable "Projector Control.failed" app in Applications.
    assert sorted(p.name for p in apps.iterdir()) == [".Projector Control.failed.app",
                                                     "Projector Control.app"]


def test_watcher_keeps_the_new_version_once_it_answers(tmp_path):
    import json
    import threading
    from http.server import BaseHTTPRequestHandler, HTTPServer

    class Health(BaseHTTPRequestHandler):
        def do_GET(self):
            body = json.dumps({"status": "ok", "version": "1.0.7"}, separators=(",", ":"))
            self.send_response(200)
            self.end_headers()
            self.wfile.write(body.encode())

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Health)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        apps, result = run_watcher(tmp_path, server.server_address[1])
    finally:
        server.shutdown()
    assert result == "installed 1.0.7"
    assert sorted(p.name for p in apps.iterdir()) == ["Projector Control.app"]
    assert (apps / "Projector Control.app" / "new").is_dir()


def test_restart_never_signals_a_process_that_reused_a_stale_pid(tmp_path):
    import shutil
    import subprocess

    stranger = subprocess.Popen(["sleep", "30"])
    ours_exe = tmp_path / "Projector Control.app" / "Contents" / "MacOS" / "ProjectorControl"
    ours_exe.parent.mkdir(parents=True)
    shutil.copy(shutil.which("sleep"), ours_exe)
    ours = subprocess.Popen([str(ours_exe), "30"])
    try:
        macservice.pid_file(tmp_path).write_text(str(stranger.pid))
        macservice.restart_server(tmp_path)
        with pytest.raises(subprocess.TimeoutExpired):  # left alone
            stranger.wait(timeout=1)

        macservice.pid_file(tmp_path).write_text(str(ours.pid))
        macservice.restart_server(tmp_path)
        assert ours.wait(timeout=10) == -15  # SIGTERM
    finally:
        for process in (stranger, ours):
            process.kill()
            process.wait()


# -- the desktop launcher's port --------------------------------------------------

def test_a_port_left_in_time_wait_by_the_last_run_is_kept(tmp_path):
    import socket

    from app.desktop import pick_port

    # The server end closes first, as when a server stops while a browser is
    # connected: that connection lingers in TIME_WAIT on the server's port.
    listener = socket.socket()
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", 0))
    listener.listen()
    port = listener.getsockname()[1]
    client = socket.create_connection(("127.0.0.1", port))
    served, _ = listener.accept()
    served.close()
    listener.close()
    try:
        assert pick_port("127.0.0.1", port) == port
    finally:
        client.close()


def test_a_port_in_real_use_is_not_taken(tmp_path):
    import socket

    from app.desktop import pick_port

    with socket.socket() as busy:
        busy.bind(("127.0.0.1", 0))
        busy.listen()
        port = busy.getsockname()[1]
        assert pick_port("127.0.0.1", port) != port


def test_the_service_exits_before_starting_when_its_port_is_taken(tmp_path, monkeypatch):
    import socket

    from app import desktop

    for name in ("DESKTOP_DATA_DIR", "DESKTOP_PORT", "MEDIA_DIR", "ENVIRONMENT", "LOCAL_ONLY"):
        monkeypatch.setenv(name, "x")
        monkeypatch.delenv(name)
    monkeypatch.setenv(macservice.SERVICE_ENV, "1")
    monkeypatch.setattr(desktop, "configure_logging", lambda folder, verbose: None)
    with socket.socket() as busy:
        busy.bind(("127.0.0.1", 0))
        busy.listen()
        port = busy.getsockname()[1]
        assert desktop.main(["--serve", "--no-browser", "--port", str(port),
                             "--data-dir", str(tmp_path)]) == 1
    assert not (tmp_path / "FIRST-RUN-PASSWORD.txt").exists()
    assert not (tmp_path / "projector-control.db").exists()
