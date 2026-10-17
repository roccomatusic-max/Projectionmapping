"""The phone remote: staying signed in, and being reachable from anywhere."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

import socket
from datetime import UTC, datetime

import jwt

from app.services import discovery
from tests.test_api import api, login  # noqa: F401 - fixture


async def test_the_phone_stays_signed_in(api):
    phone = await api.post("/api/auth/login", json={
        "username": "admin", "password": "test-admin-password", "remember": True})
    desk = await api.post("/api/auth/login", json={
        "username": "admin", "password": "test-admin-password"})
    assert phone.status_code == desk.status_code == 200
    assert phone.json()["expires_in"] == 90 * 24 * 3600
    assert desk.json()["expires_in"] == 12 * 3600

    claims = jwt.decode(phone.json()["access_token"], options={"verify_signature": False})
    days = (datetime.fromtimestamp(claims["exp"], UTC) - datetime.now(UTC)).days
    assert 89 <= days <= 90
    me = await api.get("/api/auth/me", headers={"Authorization": f"Bearer {phone.json()['access_token']}"})
    assert me.status_code == 200


class Probe:
    """A socket that reports the address the system would send from."""

    def __init__(self, address: str | None) -> None:
        self.address = address

    def __call__(self, *_args):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False

    def connect(self, target):
        if self.address is None:
            raise OSError("network is unreachable")
        self.target = target

    def getsockname(self):
        return (self.address, 50000)


def test_tailscale_is_found_by_the_address_it_routes_through(monkeypatch):
    monkeypatch.setattr(socket, "socket", Probe("100.101.102.103"))
    assert discovery.tailscale_address() == "100.101.102.103"
    # Without Tailscale the route is the ordinary network, which is not it.
    monkeypatch.setattr(socket, "socket", Probe("192.168.1.10"))
    assert discovery.tailscale_address() is None
    monkeypatch.setattr(socket, "socket", Probe(None))
    assert discovery.tailscale_address() is None


async def test_the_phone_page_gets_the_address_that_works_anywhere(api, monkeypatch):
    import app.api.routes.mapping_players as players

    headers = await login(api)
    monkeypatch.setattr(players.settings, "local_only", False)
    monkeypatch.setattr(players.settings, "advertise_port", 8765)
    monkeypatch.setattr(players, "lan_address", lambda: "192.168.1.10")
    monkeypatch.setattr(players, "tailscale_address", lambda: "100.101.102.103")
    info = (await api.get("/api/mapping/players/network", headers=headers)).json()
    assert info["address"] == "http://192.168.1.10:8765"
    assert info["tailscale_address"] == "http://100.101.102.103:8765"
