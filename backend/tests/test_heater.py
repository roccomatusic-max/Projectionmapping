"""Heaters in projector boxes: the rules, the plugs, the weather and the pages."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from app.db.models import Heater
from app.services import heater as heaters
from app.services import smart_plugs, weather
from tests.test_api import add_projector, api, login  # noqa: F401 - fixture
from tests.test_minipc import app_checkin, paired

NOW = datetime(2026, 12, 1, 7, 0, tzinfo=UTC)


def f_to_c(value: float) -> float:
    return (value - 32) * 5 / 9


def make(**overrides) -> Heater:
    values = dict(name="Box", plug_kind="shelly", plug_address="10.0.0.9", mode="auto",
                  on_below_c=f_to_c(40), off_above_c=f_to_c(50), max_inside_c=f_to_c(80),
                  outside_on_below_c=f_to_c(32), outside_off_above_c=f_to_c(35),
                  max_minutes_per_hour=30, is_on=False, interlock=True, warmup_minutes=30)
    values.update(overrides)
    return Heater(**values)


def inside(fahrenheit: float, source: str = "sensor") -> heaters.Inside:
    return heaters.Inside(f_to_c(fahrenheit), source, NOW)


# -- the rules --------------------------------------------------------------------------


def test_inside_temperature_switches_with_a_gap():
    off = make()
    assert heaters.decide(off, inside(39), None, NOW).on
    assert not heaters.decide(off, inside(45), None, NOW).on
    on = make(is_on=True, on_since=NOW - timedelta(minutes=5))
    # Once on it stays on until 50 °F, so it does not click on and off.
    assert heaters.decide(on, inside(45), None, NOW).on
    stop = heaters.decide(on, inside(51), None, NOW)
    assert not stop.on and "51 °F" in stop.reason


def test_inside_wins_over_the_weather():
    # Freezing outside, but the box is warm enough: stays off.
    assert not heaters.decide(make(), inside(48), f_to_c(10), NOW).on
    # No inside reading: the weather decides.
    cold = heaters.decide(make(), None, f_to_c(28), NOW)
    assert cold.on and "outside" in cold.reason
    assert not heaters.decide(make(), None, f_to_c(40), NOW).on
    nothing = heaters.decide(make(), None, None, NOW)
    assert not nothing.on and "no inside or outside" in nothing.reason


def test_too_warm_inside_is_off_even_when_on_by_hand():
    held = make(mode="on", hold_until=NOW + timedelta(minutes=30), is_on=True)
    assert heaters.decide(held, inside(60), None, NOW).on
    safety = heaters.decide(held, inside(85), None, NOW)
    assert not safety.on and safety.safety and "80 °F" in safety.reason


def test_a_long_run_rests_for_the_rest_of_the_hour():
    on = make(is_on=True, on_since=NOW - timedelta(minutes=30))
    decision = heaters.decide(on, inside(35), None, NOW)
    assert not decision.on
    assert decision.rest_until == NOW + timedelta(minutes=30)
    resting = make(is_on=False, rest_until=NOW + timedelta(minutes=10))
    assert not heaters.decide(resting, inside(30), None, NOW).on
    # Rest over: on again.
    assert heaters.decide(make(rest_until=NOW - timedelta(seconds=1)), inside(30), None, NOW).on
    # 60 minutes means no limit.
    always = make(is_on=True, on_since=NOW - timedelta(hours=3), max_minutes_per_hour=60)
    assert heaters.decide(always, inside(35), None, NOW).on


def test_by_hand():
    assert not heaters.decide(make(mode="off"), inside(10), None, NOW).on
    expired = heaters.decide(make(mode="on", hold_until=NOW - timedelta(minutes=1)),
                             inside(45), None, NOW)
    assert expired.back_to_auto and not expired.on


def test_never_on_with_the_projector_on():
    held = make(mode="on", hold_until=NOW + timedelta(minutes=30), is_on=True)
    blocked = heaters.decide(held, inside(30), None, NOW, projector_on=True)
    assert not blocked.on and "interlock" in blocked.reason
    assert heaters.decide(make(), inside(30), None, NOW, projector_on=False).on
    # Not known (the projector is not answering): the temperature decides.
    assert heaters.decide(make(), inside(30), None, NOW, projector_on=None).on
    assert heaters.decide(make(interlock=False), inside(30), None, NOW, projector_on=True).on


def test_warms_up_before_the_show():
    show = NOW + timedelta(minutes=20)
    # 45 °F would not switch it on, but the show starts in 20 minutes.
    warm = heaters.decide(make(), inside(45), None, NOW, show_at=show)
    assert warm.on and "Warming the box for the show" in warm.reason
    # Warm enough already, or too early, or warm-up turned off: the usual rules.
    assert not heaters.decide(make(), inside(52), None, NOW, show_at=show).on
    assert not heaters.decide(make(), inside(45), None, NOW, show_at=NOW + timedelta(minutes=45)).on
    assert not heaters.decide(make(warmup_minutes=0), inside(45), None, NOW, show_at=show).on
    # A long run does not cut a warm-up short; the projector coming on does.
    long_run = make(is_on=True, on_since=NOW - timedelta(minutes=40))
    assert heaters.decide(long_run, inside(45), None, NOW, show_at=show).on
    assert not heaters.decide(long_run, inside(45), None, NOW, show_at=show, projector_on=True).on
    # No inside reading: the outside temperature.
    assert heaters.decide(make(), None, f_to_c(33), NOW, show_at=show).on


def test_just_switched_off_waits_a_moment():
    just = make(last_switched_at=NOW - timedelta(seconds=30))
    assert not heaters.decide(just, inside(30), None, NOW).on
    assert heaters.decide(make(last_switched_at=NOW - timedelta(minutes=3)),
                          inside(30), None, NOW).on


# -- a pretend Shelly plug and weather service -------------------------------------------


class FakeShelly:
    def __init__(self, generation: int = 2, password: str | None = None) -> None:
        self.on = False
        self.generation = generation
        self.password = password
        self.switched: list[bool] = []
        self.answering = True

    def handler(self, request: httpx.Request) -> httpx.Response:
        if not self.answering:
            raise httpx.ConnectTimeout("no answer", request=request)
        url = urlsplit(str(request.url))
        query = {k: v[0] for k, v in parse_qs(url.query).items()}
        if url.path == "/shelly":
            return httpx.Response(200, json={"gen": self.generation, "name": "Shelly Plug US"}
                                  if self.generation > 1 else {"type": "SHPLG-U1"})
        if self.password and "authorization" not in request.headers:
            return httpx.Response(401, headers={"WWW-Authenticate": "Basic realm=shelly"})
        if url.path == "/rpc/Switch.Set":
            self.on = query["on"] == "true"
            self.switched.append(self.on)
            return httpx.Response(200, json={"was_on": not self.on})
        if url.path == "/rpc/Switch.GetStatus":
            return httpx.Response(200, json={"id": 0, "output": self.on})
        if url.path == "/relay/0":
            if "turn" in query:
                self.on = query["turn"] == "on"
                self.switched.append(self.on)
            return httpx.Response(200, json={"ison": self.on})
        return httpx.Response(404)


@pytest.fixture
def shelly(monkeypatch):
    plug = FakeShelly()
    monkeypatch.setattr(smart_plugs, "transport", httpx.MockTransport(plug.handler))
    return plug


@pytest.fixture
def outside_temp(monkeypatch):
    state = {"celsius": f_to_c(25)}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host.startswith("geocoding"):
            return httpx.Response(200, json={"results": [
                {"name": "Springfield", "admin1": "New Jersey", "country_code": "US",
                 "latitude": 40.7, "longitude": -74.3}]})
        return httpx.Response(200, json={"current": {"temperature_2m": state["celsius"]}})

    monkeypatch.setattr(weather, "transport", httpx.MockTransport(handler))
    weather.forget()
    yield state
    weather.forget()


async def test_shelly_generations_and_password(monkeypatch):
    for generation in (1, 2):
        plug = FakeShelly(generation=generation, password="pw")
        monkeypatch.setattr(smart_plugs, "transport", httpx.MockTransport(plug.handler))
        with pytest.raises(smart_plugs.PlugError, match="password"):
            await smart_plugs.read(smart_plugs.Plug("shelly", "10.0.0.9"))
        target = smart_plugs.Plug("shelly", "10.0.0.9", secret="pw")
        if generation == 1:
            # Basic for Gen 1; Gen 2 uses digest, which the fake does not check.
            assert await smart_plugs.switch(target, True) is True
            state, model = await smart_plugs.read(target)
            assert state and "Gen 1" in model
    plug = FakeShelly()
    monkeypatch.setattr(smart_plugs, "transport", httpx.MockTransport(plug.handler))
    assert await smart_plugs.switch(smart_plugs.Plug("shelly", "http://10.0.0.9/"), True)
    assert plug.switched == [True]


async def test_tasmota_and_home_assistant(monkeypatch):
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(f"{request.method} {request.url}")
        if request.url.path == "/cm":
            return httpx.Response(200, json={"POWER": "ON"})
        if request.headers.get("authorization") != "Bearer token":
            return httpx.Response(401)
        if request.url.path.startswith("/api/services/switch/turn_on"):
            return httpx.Response(200, json=[])
        if request.url.path == "/api/states/switch.box_heater":
            return httpx.Response(200, json={"state": "on"})
        return httpx.Response(404)

    monkeypatch.setattr(smart_plugs, "transport", httpx.MockTransport(handler))
    assert (await smart_plugs.read(smart_plugs.Plug("tasmota", "10.0.0.7")))[0] is True
    ha = smart_plugs.Plug("home_assistant", "homeassistant.local", "switch.box_heater", "token")
    assert await smart_plugs.switch(ha, True) is True
    assert "POST http://homeassistant.local:8123/api/services/switch/turn_on" in seen
    with pytest.raises(smart_plugs.PlugError, match="refused"):
        await smart_plugs.read(smart_plugs.Plug("home_assistant", "ha.local", "switch.x", "bad"))
    with pytest.raises(smart_plugs.PlugError, match="entity"):
        await smart_plugs.read(smart_plugs.Plug("home_assistant", "ha.local", "heater", "token"))


# -- the pages and the service ------------------------------------------------------------

BODY = {"name": "Driveway box", "plug_kind": "shelly", "plug_address": "10.0.0.9",
        "on_below_c": f_to_c(40), "off_above_c": f_to_c(50), "max_inside_c": f_to_c(80),
        "outside_on_below_c": f_to_c(32), "outside_off_above_c": f_to_c(35),
        "max_minutes_per_hour": 30, "interlock": False}


async def test_heater_follows_the_usb_sensor_on_the_mini_pc(api, shelly, outside_temp):
    headers = await login(api)
    player_id, _ = await paired(api, headers)

    for bad in ({**BODY, "off_above_c": BODY["on_below_c"]},
                {**BODY, "max_inside_c": BODY["off_above_c"]},
                {**BODY, "plug_kind": "home_assistant"},
                {**BODY, "plug_address": "10.0.0.9 x"},
                {**BODY, "max_minutes_per_hour": 2},
                {**BODY, "sensor_player_id": 999},
                {**BODY, "interlock": True}):
        refused = await api.post("/api/heaters", headers=headers, json=bad)
        assert refused.status_code in (400, 422), (bad, refused.text)

    tested = (await api.post("/api/heaters/test-plug", headers=headers, json=BODY)).json()
    assert tested["ok"] and tested["on"] is False and "Shelly Plug US" in tested["message"]

    made = await api.post("/api/heaters", headers=headers,
                          json={**BODY, "sensor_player_id": player_id, "plug_secret": ""})
    assert made.status_code == 201, made.text
    heater_id = made.json()["id"]

    # Where the house is, for the weather.
    places = (await api.get("/api/heaters/weather/search?q=07081", headers=headers)).json()
    assert places[0]["name"] == "Springfield, New Jersey, US"
    place = await api.put("/api/heaters/weather/place", headers=headers, json=places[0])
    assert place.status_code == 200, place.text
    assert round(place.json()["celsius"], 1) == round(f_to_c(25), 1)

    # The mini PC sends its USB sensor's reading: 35 °F inside the box.
    await app_checkin(api, sensor={"name": "SHT41 Trinkey", "celsius": f_to_c(35),
                                   "humidity": 60.5})
    await heaters.service.tick()
    overview = (await api.get("/api/heaters", headers=headers)).json()
    box = overview["heaters"][0]
    assert box["is_on"] is True and shelly.on
    assert box["inside"]["source"] == "sensor"
    assert "below 40 °F" in box["reason"]
    assert overview["sensors"][0]["name"] == "SHT41 Trinkey"
    assert overview["outside"]["place"]["name"].startswith("Springfield")

    # Warm inside: off.
    await app_checkin(api, sensor={"name": "SHT41 Trinkey", "celsius": f_to_c(52)})
    await heaters.service.tick()
    assert shelly.switched == [True, False]

    # Kept off by hand; then on by hand for an hour.
    kept = await api.post(f"/api/heaters/{heater_id}/mode", headers=headers, json={"mode": "off"})
    assert kept.json()["mode"] == "off"
    held = (await api.post(f"/api/heaters/{heater_id}/mode", headers=headers,
                           json={"mode": "on"})).json()
    assert held["is_on"] is True and held["hold_until"]
    assert shelly.on

    history = (await api.get(f"/api/heaters/{heater_id}/history?hours=1", headers=headers)).json()
    assert history["points"] and history["minutes_on"] >= 1

    logs = (await api.get("/api/events?limit=50", headers=headers)).json()
    messages = " ".join(e["message"] for e in (logs["items"] if isinstance(logs, dict) else logs))
    assert "Driveway box turned on" in messages


async def test_projector_intake_and_a_plug_that_stops_answering(api, shelly, outside_temp):
    from app.db import session as session_module
    from app.db.models import Telemetry

    headers = await login(api)
    projector_id = await add_projector(api, headers)
    made = await api.post("/api/heaters", headers=headers,
                          json={**BODY, "projector_id": projector_id, "interlock": True})
    heater_id = made.json()["id"]
    async with session_module.session_scope() as session:
        session.add(Telemetry(projector_id=projector_id, metric="temp_intake",
                              value_num=f_to_c(36), recorded_at=datetime.now(UTC)))
    await heaters.service.tick()
    box = (await api.get("/api/heaters", headers=headers)).json()["heaters"][0]
    assert box["is_on"] and box["inside"]["source"] == "projector"
    assert "intake air" in box["reason"]

    shelly.answering = False
    await heaters.service.tick()
    box = (await api.get("/api/heaters", headers=headers)).json()["heaters"][0]
    assert box["is_on"] is None and "did not answer" in box["plug_error"]
    shelly.answering = True
    await heaters.service.tick()
    box = (await api.get("/api/heaters", headers=headers)).json()["heaters"][0]
    assert box["plug_error"] is None and box["is_on"]

    # The projector comes on: the heater goes off.
    from app.db.models import ProjectorState
    async with session_module.session_scope() as session:
        state = await session.get(ProjectorState, projector_id)
        if state is None:
            session.add(ProjectorState(projector_id=projector_id, power="on"))
        else:
            state.power = "on"
    await heaters.service.tick()
    box = (await api.get("/api/heaters", headers=headers)).json()["heaters"][0]
    assert box["is_on"] is False and box["projector_on"] is True
    assert "interlock" in box["reason"] and not shelly.on

    assert (await api.delete(f"/api/heaters/{heater_id}", headers=headers)).status_code == 204
    assert (await api.get("/api/heaters", headers=headers)).json()["heaters"] == []
