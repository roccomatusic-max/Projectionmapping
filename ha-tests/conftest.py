"""Tests for the Home Assistant integration, against a real Projector Control server.

Starts the server (from ../backend, with its own Python: BACKEND_PYTHON,
default ../backend/.venv/bin/python) and two projector simulators, then runs
Home Assistant's own test harness with the integration from
../custom_components. Everything the projectors report is simulated.
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import pytest
import pytest_socket

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(ROOT))  # custom_components.projector_control

ADMIN_PASSWORD = "ha-tests-admin-password"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    yield


@pytest.fixture(autouse=True)
def local_network(socket_enabled):
    """Home Assistant's harness blocks the network; the server is on 127.0.0.1."""
    yield


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Server:
    """The running server, plus a tiny admin client for setting things up."""

    def __init__(self, url: str) -> None:
        self.url = url
        self.token = ""

    def call(self, method: str, path: str, body: object | None = None,
             token: str | None = None, raw: bool = False):
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(f"{self.url}{path}", data=data, method=method)
        request.add_header("Content-Type", "application/json")
        if token or self.token:
            request.add_header("Authorization", f"Bearer {token or self.token}")
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = response.read()
        if raw:
            return payload
        return json.loads(payload) if payload else None

    def wait_for(self, check, timeout: float = 30.0, what: str = "condition"):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            value = check()
            if value:
                return value
            time.sleep(0.25)
        raise AssertionError(f"timed out waiting for {what}")


@pytest.fixture(scope="session")
def server():
    pytest_socket.enable_socket()
    python = os.environ.get("BACKEND_PYTHON", str(BACKEND / ".venv" / "bin" / "python"))
    work = Path(tempfile.mkdtemp(prefix="ha-tests-"))
    port, panasonic, panasonic_pjlink, pjlink = (_free_port() for _ in range(4))
    logs = [open(work / name, "w")  # noqa: SIM115 - closed in the finally below
            for name in ("panasonic.log", "pjlink.log", "server.log")]
    env = {
        **os.environ,
        "DATABASE_URL": f"sqlite+aiosqlite:///{work}/server.db",
        "MEDIA_DIR": str(work / "media"),
        "SECRET_KEY": "ha-tests-secret-key-at-least-32-characters",
        "BOOTSTRAP_ADMIN_PASSWORD": ADMIN_PASSWORD,
        "ADVERTISE_PORT": str(port),
        "POLL_CONNECTIVITY": "2",
        "POLL_OPERATIONAL": "2",
        "POLL_DIAGNOSTICS": "3",
        "PYTHONPATH": str(BACKEND),
    }
    processes = [
        subprocess.Popen([python, "-m", "simulator.panasonic_sim", "--host", "127.0.0.1",
                          "--port", str(panasonic), "--pjlink-port", str(panasonic_pjlink),
                          "--warmup", "2", "--cooldown", "2"],
                         cwd=BACKEND, env=env, stdout=logs[0], stderr=subprocess.STDOUT),
        subprocess.Popen([python, "-m", "simulator.pjlink_sim", "--host", "127.0.0.1",
                          "--port", str(pjlink), "--warmup", "2", "--cooldown", "2"],
                         cwd=BACKEND, env=env, stdout=logs[1], stderr=subprocess.STDOUT),
        subprocess.Popen([python, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
                          "--port", str(port)],
                         cwd=BACKEND, env=env, stdout=logs[2], stderr=subprocess.STDOUT),
    ]
    srv = Server(f"http://127.0.0.1:{port}")
    try:
        def up():
            try:
                return srv.call("GET", "/api/health")["status"] == "ok"
            except OSError:
                return False
        srv.wait_for(up, 60, "the server to start")
        srv.token = srv.call("POST", "/api/auth/login",
                             {"username": "admin", "password": ADMIN_PASSWORD})["access_token"]
        srv.call("POST", "/api/projectors", {
            "name": "House Left", "host": "127.0.0.1", "port": panasonic,
            "driver": "panasonic_pt_dz13k", "pjlink_port": panasonic_pjlink,
        })
        srv.call("POST", "/api/projectors", {
            "name": "Garage", "host": "127.0.0.1", "port": pjlink, "driver": "pjlink",
            "manufacturer": "Generic", "model": "PJLink",
        })
        show = srv.call("POST", "/api/mapping/shows", {"name": "Halloween"})
        for name in ("Intro", "Ghosts", "Finale"):
            srv.call("POST", f"/api/mapping/shows/{show['id']}/cues", {"name": name})
        srv.call("POST", "/api/mapping/shows", {"name": "Christmas"})
        srv.call("POST", "/api/scenes", {"name": "Everything off", "actions": [
            {"target": {"type": "all"}, "capability": "power.set",
             "params": {"state": "off"}}]})

        def online():
            projectors = srv.call("GET", "/api/projectors")
            return all(p["state"]["online"] for p in projectors) and projectors
        srv.wait_for(online, 60, "the simulated projectors to answer")
        yield srv
    finally:
        for process in processes:
            process.terminate()
        for process in processes:
            try:
                process.wait(10)
            except subprocess.TimeoutExpired:
                process.kill()
        for log in logs:
            log.close()
        if os.environ.get("HA_TESTS_SHOW_LOGS"):
            print((work / "server.log").read_text())
