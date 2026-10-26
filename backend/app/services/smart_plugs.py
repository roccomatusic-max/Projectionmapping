"""Smart plugs on the home network: read and switch one, without any cloud.

Three kinds, each over its own local HTTP API:

* **Shelly** (Plug US, Plus Plug, Gen3 and the older Gen1 plugs). Asked
  ``/shelly`` first to tell the generations apart: Gen2 and later answer
  RPC calls (``/rpc/Switch.Set``), Gen1 the ``/relay/0`` page. A password
  set in the Shelly app is sent as the ``admin`` user.
* **Tasmota** (plugs flashed with Tasmota): ``/cm?cmnd=Power``.
* **Home Assistant**: any switch it knows (``switch.``, ``light.``,
  ``input_boolean.``), through its REST API with a long-lived access token.

Every call answers True (on) or False (off), or raises :class:`PlugError`
with words the person can act on.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from urllib.parse import urlsplit

import httpx

# httpx logs every request at INFO; a plug read every minute would fill the log.
logging.getLogger("httpx").setLevel(logging.WARNING)

KINDS = ("shelly", "tasmota", "home_assistant")
TIMEOUT = httpx.Timeout(5.0)
#: Tests swap in an httpx.MockTransport.
transport: httpx.AsyncBaseTransport | None = None


class PlugError(Exception):
    """The plug could not be read or switched, in plain words."""


@dataclass
class Plug:
    kind: str
    address: str
    entity: str | None = None
    secret: str | None = None

    @property
    def base(self) -> str:
        address = self.address.strip().rstrip("/")
        if "://" not in address:
            address = f"http://{address}"
        if self.kind == "home_assistant" and urlsplit(address).port is None \
                and urlsplit(address).scheme == "http":
            address = f"{address}:8123"
        return address


def _client(auth: httpx.Auth | None = None, headers: dict | None = None) -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=TIMEOUT, auth=auth, headers=headers, transport=transport)


async def _get(client: httpx.AsyncClient, url: str, what: str) -> httpx.Response:
    try:
        reply = await client.get(url)
    except httpx.TimeoutException as exc:
        raise PlugError(f"{what} did not answer within 5 seconds. Check it is plugged in "
                        "and on the home network, and that the address is right.") from exc
    except httpx.HTTPError as exc:
        raise PlugError(f"Could not reach {what}: {exc.__class__.__name__}. "
                        "Check the address.") from exc
    if reply.status_code == 401:
        raise PlugError(f"{what} asked for a password. Type the plug's password "
                        "(set in the Shelly app), or turn its password off.")
    if reply.status_code >= 400:
        raise PlugError(f"{what} answered with an error ({reply.status_code}).")
    return reply


def _json(reply: httpx.Response, what: str) -> dict:
    try:
        data = reply.json()
    except ValueError as exc:
        raise PlugError(f"{what} answered, but not like a smart plug does. "
                        "Check the address and the kind of plug.") from exc
    if not isinstance(data, dict):
        raise PlugError(f"{what} gave an answer this app does not understand.")
    return data


# -- Shelly ---------------------------------------------------------------------------


async def _shelly_generation(client: httpx.AsyncClient, plug: Plug) -> tuple[int, str]:
    info = _json(await _get(client, f"{plug.base}/shelly", "The Shelly plug"), "The Shelly plug")
    generation = int(info.get("gen") or 1)
    model = str(info.get("name") or info.get("model") or info.get("type") or "Shelly")
    return generation, model


def _shelly_auth(plug: Plug, generation: int) -> httpx.Auth | None:
    if not plug.secret:
        return None
    if generation >= 2:
        return httpx.DigestAuth("admin", plug.secret)
    return httpx.BasicAuth("admin", plug.secret)


async def _shelly(plug: Plug, turn: bool | None) -> tuple[bool, str]:
    async with _client() as probe:
        generation, model = await _shelly_generation(probe, plug)
    what = "The Shelly plug"
    async with _client(_shelly_auth(plug, generation)) as client:
        if generation >= 2:
            if turn is not None:
                await _get(client, f"{plug.base}/rpc/Switch.Set?id=0&on={'true' if turn else 'false'}",
                           what)
            status = _json(await _get(client, f"{plug.base}/rpc/Switch.GetStatus?id=0", what), what)
            if "output" not in status:
                raise PlugError(f"{what} has no switch. Is it a plug?")
            return bool(status["output"]), f"{model} (Gen {generation})"
        page = f"{plug.base}/relay/0" + ("" if turn is None else f"?turn={'on' if turn else 'off'}")
        status = _json(await _get(client, page, what), what)
        if "ison" not in status:
            raise PlugError(f"{what} has no switch. Is it a plug?")
        return bool(status["ison"]), f"{model} (Gen 1)"


# -- Tasmota --------------------------------------------------------------------------


async def _tasmota(plug: Plug, turn: bool | None) -> tuple[bool, str]:
    what = "The Tasmota plug"
    command = "Power" if turn is None else f"Power%20{'On' if turn else 'Off'}"
    login = f"&user=admin&password={plug.secret}" if plug.secret else ""
    async with _client() as client:
        status = _json(await _get(client, f"{plug.base}/cm?cmnd={command}{login}", what), what)
    value = status.get("POWER", status.get("POWER1"))
    if value not in ("ON", "OFF"):
        raise PlugError(f"{what} did not say whether it is on.")
    return value == "ON", "Tasmota plug"


# -- Home Assistant -------------------------------------------------------------------


async def _home_assistant(plug: Plug, turn: bool | None) -> tuple[bool, str]:
    what = "Home Assistant"
    entity = (plug.entity or "").strip()
    domain, dot, _ = entity.partition(".")
    if not dot or domain not in ("switch", "light", "input_boolean", "fan"):
        raise PlugError("Type the plug's entity from Home Assistant, like switch.box_heater.")
    if not plug.secret:
        raise PlugError("Home Assistant needs an access token: in Home Assistant open your "
                        "profile, Security, and make a long-lived access token.")
    async with _client(headers={"Authorization": f"Bearer {plug.secret}"}) as client:
        if turn is not None:
            try:
                reply = await client.post(
                    f"{plug.base}/api/services/{domain}/turn_{'on' if turn else 'off'}",
                    json={"entity_id": entity})
            except httpx.HTTPError as exc:
                raise PlugError(f"Could not reach Home Assistant at {plug.base}.") from exc
            if reply.status_code == 401:
                raise PlugError("Home Assistant refused the access token. Make a new one.")
            if reply.status_code >= 400:
                raise PlugError(f"Home Assistant could not switch {entity} ({reply.status_code}).")
        try:
            reply = await client.get(f"{plug.base}/api/states/{entity}")
        except httpx.HTTPError as exc:
            raise PlugError(f"Could not reach Home Assistant at {plug.base}. Check the address."
                            ) from exc
    if reply.status_code == 401:
        raise PlugError("Home Assistant refused the access token. Make a new one.")
    if reply.status_code == 404:
        raise PlugError(f"Home Assistant has no {entity}. Check the entity's name.")
    if reply.status_code >= 400:
        raise PlugError(f"{what} answered with an error ({reply.status_code}).")
    state = _json(reply, what).get("state")
    if state not in ("on", "off"):
        raise PlugError(f"Home Assistant says {entity} is {state!r}; it may be unplugged.")
    return state == "on", f"Home Assistant {entity}"


_KIND = {"shelly": _shelly, "tasmota": _tasmota, "home_assistant": _home_assistant}


async def read(plug: Plug) -> tuple[bool, str]:
    """Whether the plug is on, and what it is ("Shelly Plug US (Gen 3)")."""
    return await _KIND[plug.kind](plug, None)


async def switch(plug: Plug, on: bool) -> bool:
    """Switch the plug; answers what it says afterwards."""
    state, _ = await _KIND[plug.kind](plug, on)
    return state
