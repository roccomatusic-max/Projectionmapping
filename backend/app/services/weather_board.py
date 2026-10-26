"""The weather right now, for the "Weather" info board in scenes.

(services/weather.py is the heater's outside temperature; this one is the
fuller reading a board shows, for any town.)

Uses Open-Meteo (free, no key): the town or ZIP code is looked up once,
then the current weather is fetched at most every 10 minutes for each
place, so however many projectors show the board the server asks once. An
empty place uses roughly where the server is, from its internet address.
Nothing here is needed for a show: when the internet is down the board
shows the last reading, or says it cannot reach the weather.
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass

import httpx

log = logging.getLogger(__name__)

GEOCODE = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST = "https://api.open-meteo.com/v1/forecast"
WHERE_AM_I = "https://ipwho.is/"

#: How long a reading is kept, and how long to wait after a failure.
FRESH_SECONDS = 600
RETRY_SECONDS = 120

_STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois",
    "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana",
    "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan",
    "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana",
    "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey",
    "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota",
    "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania",
    "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee",
    "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}


class WeatherError(Exception):
    """The weather could not be fetched; the message is for people."""


@dataclass
class Spot:
    name: str
    latitude: float
    longitude: float


@dataclass
class _Cached:
    at: float
    reading: dict | None
    error: str | None = None


_places: dict[str, Spot] = {}
_readings: dict[str, _Cached] = {}


def _clean(place: str) -> str:
    return " ".join(place.split())[:80]


async def _find(client: httpx.AsyncClient, place: str) -> Spot:
    """Where ``place`` is: a US ZIP code, "Town, ST", "Town, Country" or a town."""
    if not place:
        response = await client.get(WHERE_AM_I)
        response.raise_for_status()
        data = response.json()
        if not data.get("success", True) or data.get("latitude") is None:
            raise WeatherError("Could not tell where the server is. Type your town or ZIP code.")
        name = ", ".join(p for p in (data.get("city"), data.get("region_code") or data.get("region")) if p)
        return Spot(name or "Here", float(data["latitude"]), float(data["longitude"]))
    zip_code = re.fullmatch(r"(\d{5})(?:-\d{4})?", place)
    town, _, rest = place.partition(",")
    rest = rest.strip()
    params = {"name": zip_code.group(1) if zip_code else town.strip(), "count": 10,
              "language": "en", "format": "json"}
    if zip_code:
        params["countryCode"] = "US"
    response = await client.get(GEOCODE, params=params)
    response.raise_for_status()
    found = response.json().get("results") or []
    if not found:
        raise WeatherError(f"Could not find “{place}”. Try a town and state, or a ZIP code.")
    if rest and not zip_code:
        wanted = _STATES.get(rest.upper(), rest).lower()

        def score(r: dict) -> int:
            fields = [str(r.get(k) or "").lower() for k in ("admin1", "country", "country_code")]
            return 0 if wanted in fields else 1
        found.sort(key=score)
    best = found[0]
    state = best.get("admin1") or best.get("country") or ""
    short = next((k for k, v in _STATES.items() if v == state), state)
    name = f"{best.get('name', town)}, {short}" if short else str(best.get("name", town))
    return Spot(name, float(best["latitude"]), float(best["longitude"]))


async def _fetch(client: httpx.AsyncClient, spot: Spot) -> dict:
    response = await client.get(FORECAST, params={
        "latitude": spot.latitude,
        "longitude": spot.longitude,
        "current": "temperature_2m,apparent_temperature,weather_code,is_day,"
                   "wind_speed_10m,relative_humidity_2m",
        "daily": "temperature_2m_max,temperature_2m_min",
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "timezone": "auto",
        "forecast_days": 1,
    })
    response.raise_for_status()
    data = response.json()
    now = data.get("current") or {}
    daily = data.get("daily") or {}

    def first(key: str):
        values = daily.get(key) or []
        return values[0] if values else None

    if now.get("temperature_2m") is None:
        raise WeatherError("The weather service sent nothing back.")
    return {
        "place": spot.name,
        "temperature_f": now["temperature_2m"],
        "feels_like_f": now.get("apparent_temperature"),
        "high_f": first("temperature_2m_max"),
        "low_f": first("temperature_2m_min"),
        "code": int(now.get("weather_code") or 0),
        "is_day": bool(now.get("is_day", 1)),
        "wind_mph": now.get("wind_speed_10m"),
        "humidity": now.get("relative_humidity_2m"),
        "updated_at": time.time(),
    }


async def weather_now(place: str) -> dict:
    """The weather at ``place`` (empty for where the server is), at most 10 minutes old."""
    key = _clean(place).lower()
    cached = _readings.get(key)
    now = time.monotonic()
    if cached:
        wait = FRESH_SECONDS if cached.error is None else RETRY_SECONDS
        if now - cached.at < wait:
            if cached.reading is not None:
                return cached.reading
            raise WeatherError(cached.error or "No weather yet.")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            spot = _places.get(key)
            if spot is None:
                spot = await _find(client, _clean(place))
                _places[key] = spot
            reading = await _fetch(client, spot)
    except (httpx.HTTPError, ValueError, KeyError, WeatherError) as exc:
        message = str(exc) if isinstance(exc, WeatherError) else \
            "Could not reach the weather service. Is the server on the internet?"
        log.info("Weather for %r failed: %s", place, exc)
        # Keep showing the last reading for a while rather than nothing.
        last = cached.reading if cached else None
        _readings[key] = _Cached(now, last, message)
        if last is not None:
            return last
        raise WeatherError(message) from None
    _readings[key] = _Cached(now, reading)
    return reading


def forget() -> None:
    """Drop everything cached (for tests)."""
    _places.clear()
    _readings.clear()
