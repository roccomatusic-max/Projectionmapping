"""Talks to the Projector Control server over its local web API."""

from __future__ import annotations

from typing import Any

import aiohttp

from .const import API_VERSION

#: Outcomes that mean the projector took the command, or will by itself
#: (``queued``: refused while it cools down, sent as soon as it can be).
SUCCESS = {"confirmed", "accepted", "ok", "queued"}

#: Long enough for a projector command, which waits for the projector.
COMMAND_TIMEOUT = aiohttp.ClientTimeout(total=40)
#: The state is read from the server's own memory and database.
STATE_TIMEOUT = aiohttp.ClientTimeout(total=15)


class ProjectorControlError(Exception):
    """Something went wrong; the message is meant for a person."""


class CannotConnect(ProjectorControlError):
    """The server did not answer."""


class InvalidAuth(ProjectorControlError):
    """The key (or pairing code) was refused."""


class CommandFailed(ProjectorControlError):
    """The server answered and said no."""


def normalise_url(url: str) -> str:
    """``192.168.1.50:8765`` or ``http://192.168.1.50:8765/`` → ``http://192.168.1.50:8765``."""
    url = url.strip().rstrip("/")
    if "://" not in url:
        url = f"http://{url}"
    if url.count(":") == 1:  # no port given: the server apps use 8765
        url = f"{url}:8765"
    return url


class ProjectorControlApi:
    def __init__(self, session: aiohttp.ClientSession, url: str, key: str | None = None,
                 version: str | None = None) -> None:
        self._session = session
        self.url = normalise_url(url)
        self._key = key
        self._version = version

    def _headers(self) -> dict[str, str]:
        headers = {"X-Client": "homeassistant"}
        if self._version:
            headers["X-Integration-Version"] = self._version
        if self._key:
            headers["Authorization"] = f"Bearer {self._key}"
        return headers

    async def _request(self, method: str, path: str, *, json: Any = None,
                       timeout: aiohttp.ClientTimeout = COMMAND_TIMEOUT,
                       raw: bool = False) -> Any:
        try:
            async with self._session.request(
                method, f"{self.url}{path}", json=json, headers=self._headers(),
                timeout=timeout,
            ) as response:
                if response.status == 401:
                    raise InvalidAuth(await _detail(response, "The key was not accepted."))
                if response.status == 403:
                    raise InvalidAuth(await _detail(
                        response, "This key is not allowed to do that."))
                if response.status >= 400:
                    raise CommandFailed(await _detail(
                        response, f"The server answered with error {response.status}."))
                if raw:
                    return await response.read()
                return await response.json(content_type=None)
        except (TimeoutError, aiohttp.ClientError, ValueError) as err:
            raise CannotConnect(
                f"Could not reach Projector Control at {self.url} ({err or type(err).__name__})."
            ) from err

    # -- reading ------------------------------------------------------------

    async def state(self) -> dict[str, Any]:
        data = await self._request("GET", "/api/integration/homeassistant/state",
                                   timeout=STATE_TIMEOUT)
        if not isinstance(data, dict) or "projectors" not in data:
            raise CannotConnect(f"{self.url} answered, but it is not Projector Control.")
        if int(data.get("api", 0)) > API_VERSION:
            # Newer server: still readable, the update entity offers the
            # matching integration.
            data.setdefault("_newer_api", True)
        return data

    async def pair(self, code: str) -> str:
        data = await self._request("POST", "/api/integration/homeassistant/pair",
                                   json={"code": code}, timeout=STATE_TIMEOUT)
        return str(data["key"])

    async def package(self) -> bytes:
        return await self._request("GET", "/api/integration/homeassistant/package.tar.gz",
                                   raw=True)

    # -- commands -------------------------------------------------------------

    async def _projector(self, projector_id: int, what: str, body: dict[str, Any]) -> None:
        result = await self._request("POST", f"/api/projectors/{projector_id}/{what}",
                                     json={**body, "confirm": True})
        outcome = str(result.get("outcome", ""))
        if outcome not in SUCCESS:
            name = result.get("name") or f"Projector {projector_id}"
            raise CommandFailed(f"{name}: {result.get('error') or outcome}")

    async def power(self, projector_id: int, on: bool) -> None:
        await self._projector(projector_id, "power", {"state": "on" if on else "off"})

    async def shutter(self, projector_id: int, open_: bool) -> None:
        await self._projector(projector_id, "shutter",
                              {"state": "open" if open_ else "closed"})

    async def input(self, projector_id: int, code: str) -> None:
        await self._projector(projector_id, "input", {"input": code})

    async def transport(self, action: str, *, show_id: int | None = None,
                        cue: int | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {"action": action}
        if show_id is not None:
            body["show_id"] = show_id
        if cue is not None:
            body["cue"] = cue
        return await self._request("POST", "/api/mapping/transport", json=body)

    async def emergency_stop(self) -> dict[str, Any]:
        return await self._request("POST", "/api/emergency/stop")

    async def emergency_clear(self) -> dict[str, Any]:
        return await self._request("POST", "/api/emergency/clear")

    async def scene(self, scene_id: int) -> None:
        result = await self._request("POST", f"/api/scenes/{scene_id}/activate",
                                     json={"confirm": True})
        if not isinstance(result, dict):
            return
        if result.get("error"):
            raise CommandFailed(str(result["error"]))
        failed = [r for r in result.get("results") or []
                  if str(r.get("outcome", "")) not in SUCCESS]
        if failed:
            names = ", ".join(str(r.get("name") or r.get("projector_id")) for r in failed)
            raise CommandFailed(f"{result.get('name', 'Scene')}: not taken by {names}.")


async def _detail(response: aiohttp.ClientResponse, fallback: str) -> str:
    try:
        body = await response.json(content_type=None)
    except (aiohttp.ClientError, ValueError):
        return fallback
    detail = body.get("detail") if isinstance(body, dict) else None
    if isinstance(detail, str) and detail:
        return detail
    return fallback
