"""Things that fly or walk, live info boards (Santa tracker, weather, days
until, message board) and snow on the ledges, as scene layers."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

import httpx
import pytest

from app.services import scene_ai
from app.services import weather_board as weather_service
from tests.test_api import api, login  # noqa: F401 - fixture

CHRISTMAS_NIGHT = {
    "name": "Christmas night",
    "layers": [
        {"type": "snowcap", "style": "soft", "target": "windows", "near": "hide"},
        {"type": "movers", "style": "sleigh", "pins": [
            {"x": 0.05, "y": 0.3}, {"x": 0.5, "y": 0.1, "size": 1.4}, {"x": 0.95, "y": 0.3}]},
        {"type": "movers", "style": "elves", "pins": []},
        {"type": "info", "style": "santa", "pins": [{"x": 0.5, "y": 0.5}]},
        {"type": "info", "style": "message", "text": "Merry Christmas from our house!"},
        {"type": "info", "style": "days", "text": "Grandma's visit", "date": "2026-12-20"},
        {"type": "info", "style": "weather", "text": "07450"},
    ],
}


@pytest.fixture(autouse=True)
def _fresh_weather():
    weather_service.forget()
    yield
    weather_service.forget()


async def test_new_elements_are_scene_layers(api):
    headers = await login(api)
    created = await api.post("/api/mapping/scenes", headers=headers, json=CHRISTMAS_NIGHT)
    assert created.status_code == 201, created.text
    layers = created.json()["layers"]
    assert [layer["type"] for layer in layers] == [
        "snowcap", "movers", "movers", "info", "info", "info", "info"]
    # A drawn path keeps its points in order, with the size at each.
    assert [(p["x"], p["size"]) for p in layers[1]["pins"]] == [(0.05, 1), (0.5, 1.4), (0.95, 1)]
    assert layers[2]["pins"] == []
    assert layers[4]["text"] == "Merry Christmas from our house!"
    assert layers[5]["date"] == "2026-12-20"
    # The message can be changed later, as the phone remote does.
    layers[4]["text"] = "Happy New Year!"
    changed = await api.patch(f"/api/mapping/scenes/{created.json()['id']}", headers=headers,
                              json={"layers": layers})
    assert changed.status_code == 200, changed.text
    assert changed.json()["layers"][4]["text"] == "Happy New Year!"

    # Too long a message and a date that is not a date are refused.
    for bad in ({"type": "info", "style": "message", "text": "x" * 201},
                {"type": "info", "style": "days", "date": "Christmas"}):
        refused = await api.post("/api/mapping/scenes", headers=headers,
                                 json={"name": "Bad", "layers": [bad]})
        assert refused.status_code == 422, bad


def test_scene_ai_knows_the_new_elements():
    text = scene_ai._catalog_text()
    for word in ("movers", "sleigh", "snowcap", "santa", "message", "reindeer", "stockings"):
        assert word in text
    layers = scene_ai.to_layers([
        {"type": "movers", "style": "sleigh", "near": "jump"},
        {"type": "movers", "style": "dragons"},
        {"type": "info", "style": "message", "text": "  Merry\nChristmas  ", "date": "soon"},
        {"type": "info", "style": "days", "text": "New Year", "date": "2027-01-01"},
        {"type": "shapes", "style": "gingerbread", "text": "ignored"},
    ])
    assert [(layer.type, layer.style) for layer in layers] == [
        ("movers", "sleigh"), ("movers", "sleigh"), ("info", "message"), ("info", "days"),
        ("shapes", "gingerbread")]
    assert layers[0].near == "jump"
    assert layers[2].text == "Merry Christmas" and layers[2].date is None
    assert layers[3].date == "2027-01-01"
    assert layers[4].text is None


_REAL_CLIENT = httpx.AsyncClient


def _mock_weather(monkeypatch, handler):
    real = _REAL_CLIENT
    calls: list[str] = []

    def answer(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return handler(request)

    monkeypatch.setattr(weather_service.httpx, "AsyncClient",
                        lambda **kw: real(transport=httpx.MockTransport(answer), **kw))
    return calls


def _open_meteo(request: httpx.Request) -> httpx.Response:
    if request.url.host == "geocoding-api.open-meteo.com":
        name = request.url.params["name"]
        if name == "07450":
            assert request.url.params["countryCode"] == "US"
            return httpx.Response(200, json={"results": [
                {"name": "Ridgewood", "admin1": "New Jersey", "country": "United States",
                 "latitude": 40.98, "longitude": -74.12}]})
        if name == "Springfield":
            return httpx.Response(200, json={"results": [
                {"name": "Springfield", "admin1": "Missouri", "latitude": 37.2, "longitude": -93.3},
                {"name": "Springfield", "admin1": "Illinois", "latitude": 39.8, "longitude": -89.6}]})
        return httpx.Response(200, json={})
    assert request.url.params["temperature_unit"] == "fahrenheit"
    return httpx.Response(200, json={
        "current": {"temperature_2m": 28.4, "apparent_temperature": 21.0, "weather_code": 73,
                    "is_day": 0, "wind_speed_10m": 9.5, "relative_humidity_2m": 80},
        "daily": {"temperature_2m_max": [33.1], "temperature_2m_min": [24.9]},
    })


async def test_weather_for_a_zip_code_and_a_town(api, monkeypatch):
    calls = _mock_weather(monkeypatch, _open_meteo)
    headers = await login(api)
    reply = await api.get("/api/mapping/weather", headers=headers, params={"place": "07450"})
    assert reply.status_code == 200, reply.text
    now = reply.json()
    assert now["place"] == "Ridgewood, NJ"
    assert now["temperature_f"] == 28.4 and now["high_f"] == 33.1 and now["low_f"] == 24.9
    assert now["code"] == 73 and now["is_day"] is False

    # Asked again within 10 minutes, the server does not go out again.
    count = len(calls)
    again = await api.get("/api/mapping/weather", headers=headers, params={"place": "07450"})
    assert again.json() == now and len(calls) == count

    # "Town, ST" picks the town in that state.
    springfield = await api.get("/api/mapping/weather", headers=headers,
                                params={"place": "Springfield, IL"})
    assert springfield.json()["place"] == "Springfield, IL"

    unknown = await api.get("/api/mapping/weather", headers=headers, params={"place": "Nowhereville"})
    assert unknown.status_code == 502
    assert "Could not find" in unknown.json()["detail"]

    # Signed out, nothing.
    assert (await api.get("/api/mapping/weather", params={"place": "07450"})).status_code == 401


async def test_weather_without_the_internet_keeps_the_last_reading(api, monkeypatch):
    headers = await login(api)
    _mock_weather(monkeypatch, lambda request: httpx.Response(503))
    down = await api.get("/api/mapping/weather", headers=headers, params={"place": "07450"})
    assert down.status_code == 502
    assert "internet" in down.json()["detail"]

    weather_service.forget()
    _mock_weather(monkeypatch, _open_meteo)
    first = (await api.get("/api/mapping/weather", headers=headers, params={"place": "07450"})).json()
    # The reading has gone stale and the internet drops: the last one stays.
    for cached in weather_service._readings.values():
        cached.at -= weather_service.FRESH_SECONDS + 1
    _mock_weather(monkeypatch, lambda request: httpx.Response(503))
    stale = await api.get("/api/mapping/weather", headers=headers, params={"place": "07450"})
    assert stale.status_code == 200 and stale.json() == first


async def test_weather_where_the_server_is(api, monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "ipwho.is":
            return httpx.Response(200, json={"success": True, "city": "Ridgewood",
                                             "region_code": "NJ", "latitude": 40.98,
                                             "longitude": -74.12})
        return _open_meteo(request)

    _mock_weather(monkeypatch, handler)
    headers = await login(api)
    reply = await api.get("/api/mapping/weather", headers=headers)
    assert reply.status_code == 200, reply.text
    assert reply.json()["place"] == "Ridgewood, NJ"
