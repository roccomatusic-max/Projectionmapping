"""The temperature outside, from Open-Meteo (free, no account or key).

The house's place is looked up once by town or ZIP code and kept in
``WeatherPlace``; the temperature there is asked for at most every ten
minutes. Open-Meteo updates its "current" values every 15 minutes, so
asking more often would only repeat the same number.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import httpx

log = logging.getLogger(__name__)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
REFRESH_SECONDS = 600
#: An outside reading older than this is not used to switch the heater.
STALE_SECONDS = 3 * 3600
#: Tests swap in an httpx.MockTransport.
transport: httpx.AsyncBaseTransport | None = None


class WeatherError(Exception):
    """In words the person can act on."""


@dataclass
class Outside:
    celsius: float
    #: time.time() when it was fetched.
    fetched: float
    place: tuple[float, float]

    @property
    def age(self) -> float:
        return time.time() - self.fetched


_latest: Outside | None = None
_last_try: float = 0.0
_last_error: str | None = None


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=httpx.Timeout(10.0), transport=transport)


async def search(query: str) -> list[dict]:
    """Places matching a town name or ZIP code, best first."""
    query = query.strip()
    if len(query) < 2:
        return []
    try:
        async with _client() as client:
            reply = await client.get(GEOCODE_URL, params={
                "name": query, "count": 6, "language": "en", "format": "json"})
            reply.raise_for_status()
            results = reply.json().get("results") or []
    except (httpx.HTTPError, ValueError) as exc:
        raise WeatherError("Could not reach the weather service to look the place up. "
                           "Check the server's internet connection.") from exc
    places = []
    for item in results:
        try:
            latitude, longitude = float(item["latitude"]), float(item["longitude"])
        except (KeyError, TypeError, ValueError):
            continue
        parts = [item.get("name"), item.get("admin1"), item.get("country_code")]
        places.append({"name": ", ".join(str(p) for p in parts if p),
                       "latitude": latitude, "longitude": longitude})
    return places


async def fetch(latitude: float, longitude: float) -> float:
    """The temperature now at a place, in °C."""
    try:
        async with _client() as client:
            reply = await client.get(FORECAST_URL, params={
                "latitude": f"{latitude:.4f}", "longitude": f"{longitude:.4f}",
                "current": "temperature_2m", "temperature_unit": "celsius"})
            reply.raise_for_status()
            value = reply.json()["current"]["temperature_2m"]
            return float(value)
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        raise WeatherError("Could not get the outside temperature from the weather service. "
                           "Check the server's internet connection.") from exc


async def outside(latitude: float | None, longitude: float | None) -> Outside | None:
    """The outside temperature, fetched again when it is ten minutes old.

    Keeps the last good reading through a short internet outage; it is
    for the caller to judge whether it is still fresh enough.
    """
    global _latest, _last_try, _last_error
    if latitude is None or longitude is None:
        return None
    place = (round(latitude, 4), round(longitude, 4))
    if _latest is not None and _latest.place != place:
        _latest = None
    now = time.time()
    due = _latest is None or _latest.age >= REFRESH_SECONDS
    # After a failure, wait a minute before asking again.
    if due and now - _last_try >= 60:
        _last_try = now
        try:
            _latest = Outside(await fetch(*place), now, place)
            _last_error = None
        except WeatherError as exc:
            if _last_error != str(exc):
                log.warning("%s", exc)
            _last_error = str(exc)
    return _latest


def last_error() -> str | None:
    return _last_error


def forget() -> None:
    """Drop the cached reading (the place changed, or tests)."""
    global _latest, _last_try, _last_error
    _latest = None
    _last_try = 0.0
    _last_error = None
