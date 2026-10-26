"""Show history: every show time recorded, the energy report and season wrap-ups."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from tests.test_api import add_projector, api, login  # noqa: F401 - fixture
from tests.test_tonight import _setup


async def _link(api, headers, output_id, projector_id):
    linked = await api.patch(f"/api/mapping/outputs/{output_id}", headers=headers,
                             json={"projector_id": projector_id})
    assert linked.status_code == 200, linked.text


async def _nights(api, headers):
    from app.services.show_history import recorder

    await recorder.settle()
    response = await api.get("/api/history/nights", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["nights"]


async def _power_samples(projector_id, start, minutes, *, on=True, every=15):
    """Power samples as the operational poll writes them."""
    from app.db.models import Telemetry
    from app.db.session import session_scope

    async with session_scope() as session:
        for i in range(minutes * 60 // every):
            session.add(Telemetry(projector_id=projector_id, metric="power",
                                  value_num=1.0 if on else 0.0,
                                  recorded_at=start + timedelta(seconds=i * every)))


async def test_tonights_show_is_recorded_from_start_to_end(api):
    headers = await login(api)
    show, (_, house), scenes, _ = await _setup(api, headers)
    projector = await add_projector(api, headers)
    await _link(api, headers, house, projector)
    group = (await api.post("/api/mapping/scene-groups", headers=headers, json={
        "show_id": show["id"], "name": "Spooky", "scene_id": scenes["Ghosts"]})).json()
    await api.post(f"/api/mapping/scene-groups/{group['id']}/use", headers=headers)

    from app.config import settings
    from app.services import tonight

    now = datetime.now(settings.tz).replace(second=0, microsecond=0)
    await api.put("/api/tonight", headers=headers, json={
        "enabled": True, "start_at": (now - timedelta(minutes=2)).strftime("%H:%M"),
        "end_at": (now + timedelta(hours=1)).strftime("%H:%M"), "power": False})
    await tonight.scheduler.tick(now)

    [night] = await _nights(api, headers)
    assert night["outcome"] == "running"
    assert night["source"] == "weekly"
    assert night["group_name"] == "Spooky"
    assert night["started_by"] == "the schedule"
    assert night["key"].endswith(":weekly")
    assert night["timeline"][0]["kind"] == "cue"
    assert [p["name"] for p in night["projectors"]] == ["House Left"]

    # A cue later, then stopped by hand: one record, played, with its cues.
    went = await api.post("/api/mapping/transport", headers=headers, json={"action": "go"})
    assert went.status_code == 200, went.text
    await api.post("/api/tonight/stop", headers=headers)
    [night] = await _nights(api, headers)
    assert night["outcome"] == "played"
    assert night["ended_by"] == "admin"
    assert [e["kind"] for e in night["timeline"]] == ["cue", "cue", "stop"]
    assert night["minutes"] is not None

    # Started again a moment later: the same night carries on.
    await api.post("/api/tonight/start", headers=headers)
    nights = await _nights(api, headers)
    assert len(nights) == 1
    assert nights[0]["outcome"] == "running"
    assert any(e["label"].startswith("Playing again") for e in nights[0]["timeline"])


async def test_an_emergency_stop_ends_the_record_and_is_listed(api):
    headers = await login(api)
    show, *_ = await _setup(api, headers)
    started = await api.post("/api/mapping/transport", headers=headers,
                             json={"action": "go", "show_id": show["id"]})
    assert started.status_code == 200, started.text
    [night] = await _nights(api, headers)
    assert night["source"] == "hand"
    assert night["outcome"] == "running"

    await api.post("/api/emergency/stop", headers=headers)
    [night] = await _nights(api, headers)
    assert night["outcome"] == "played"
    assert night["ended_by"] == "the emergency stop"
    assert night["timeline"][-1]["label"] == "Emergency stop"
    assert [p["kind"] for p in night["problems"]] == ["emergency_stop"]


async def test_a_show_that_could_not_start_and_a_missed_one(api):
    headers = await login(api)
    await _setup(api, headers)
    await api.post("/api/emergency/stop", headers=headers)

    from app.config import settings
    from app.services import tonight
    from app.services.show_history import recorder

    now = datetime.now(settings.tz).replace(second=0, microsecond=0)
    await api.put("/api/tonight", headers=headers, json={
        "enabled": True, "start_at": now.strftime("%H:%M"),
        "end_at": (now + timedelta(hours=1)).strftime("%H:%M"), "power": False})
    await tonight.scheduler.tick(now)
    [held] = await _nights(api, headers)
    assert held["outcome"] == "missed"
    assert "emergency stop" in held["message"]

    # A show time that passed with nothing playing (the server was off) is missed.
    from sqlalchemy import delete, select

    from app.db.models import HistorySettings, ShowNight
    from app.db.session import session_scope

    async with session_scope() as session:
        await session.execute(delete(ShowNight))
        saved = (await session.execute(select(HistorySettings))).scalars().one()
        # History began just before tonight's show time, so yesterday's is not counted.
        saved.started_at = datetime.now(UTC) - timedelta(minutes=5)
    await recorder.tick(datetime.now(UTC) + timedelta(hours=1, minutes=15))
    [missed] = await _nights(api, headers)
    assert missed["outcome"] == "missed"
    assert missed["planned_start"] is not None
    # ...once.
    await recorder.tick(datetime.now(UTC) + timedelta(hours=1, minutes=16))
    assert len(await _nights(api, headers)) == 1


async def test_hours_on_and_the_energy_report(api):
    headers = await login(api)
    house = await add_projector(api, headers)
    garage = await add_projector(api, headers, name="Garage", driver="pjlink", port=4352)

    from app.config import settings
    from app.services.show_history import night_of

    # Last night 7 to 10 PM: three hours each; the garage off for the last one.
    today = night_of(datetime.now(UTC))
    start = datetime.combine(today - timedelta(days=1), datetime.min.time().replace(hour=19),
                             settings.tz).astimezone(UTC)
    await _power_samples(house, start, 180)
    await _power_samples(garage, start, 120)
    await _power_samples(garage, start + timedelta(hours=2), 60, on=False)

    report = (await api.get("/api/history/energy?weeks=2", headers=headers)).json()
    hours = {p["name"]: p for p in report["projectors"]}
    assert abs(hours["House Left"]["hours"] - 3) < 0.05
    assert abs(hours["Garage"]["hours"] - 2) < 0.05
    # The DZ13K's spec sheet figure; another make uses a rough 500 W.
    assert hours["House Left"]["watts"] == 1000
    assert hours["Garage"]["watts"] == 500
    assert abs(report["total_kwh"] - 4.0) < 0.1
    assert abs(report["total_cost"] - 4.0 * 0.17) < 0.02
    assert report["nights"][-1]["night"] == (today - timedelta(days=1)).isoformat()
    assert sum(w["hours"] for w in report["weeks"]) > 4.9

    # His own price and watts.
    saved = await api.put("/api/history/energy/settings", headers=headers, json={
        "price_per_kwh": 0.25, "currency": "$", "watts": {str(garage): 300}})
    assert saved.status_code == 200, saved.text
    hours = {p["name"]: p for p in saved.json()["projectors"]}
    assert hours["Garage"]["watts"] == 300 and not hours["Garage"]["watts_is_default"]
    assert abs(saved.json()["total_cost"] - (3 + 0.6) * 0.25) < 0.02
    bad = await api.put("/api/history/energy/settings", headers=headers, json={
        "price_per_kwh": 0.25, "watts": {"999": 300}})
    assert bad.status_code == 400


async def test_hours_on_cover_gaps_and_late_polls(api, monkeypatch):
    headers = await login(api)
    projector = await add_projector(api, headers)

    from app.config import settings
    from app.db.session import session_scope

    monkeypatch.setattr(settings, "poll_operational", 15)
    from app.services.show_history import hours_on

    hour = datetime(2026, 10, 20, 23, 0, tzinfo=UTC)
    # The server was off for the first half hour; polls ran late (every 25 s).
    await _power_samples(projector, hour + timedelta(minutes=30), 30, every=25)
    async with session_scope() as session:
        found = await hours_on(session, hour, hour + timedelta(hours=1))
    assert abs(found[projector][hour] - 0.5) < 0.02


async def test_season_wrapup(api):
    headers = await login(api)
    projector = await add_projector(api, headers)

    from app.db.models import ShowNight
    from app.db.session import session_scope

    base = datetime(2026, 10, 1, 22, 45, tzinfo=UTC)
    async with session_scope() as session:
        for day in range(5):
            start = base + timedelta(days=day)
            hot = 30.0 + day
            problems = ([{"at": start.isoformat(), "kind": "minipc_offline",
                          "label": "Mini PC lost its connection", "message": "x",
                          "severity": "warning", "projector": None}] if day == 2 else [])
            session.add(ShowNight(
                night=f"2026-10-0{day + 1}", key=f"2026-10-0{day + 1}:weekly", source="weekly",
                title="", group_name="Spooky" if day < 3 else "Pumpkins",
                started_at=start, ended_at=start + timedelta(hours=3), outcome="played",
                timeline=[], problems=problems,
                stats={"computed_at": "x", "problems": [], "projectors": [{
                    "id": projector, "name": "House Left", "on_hours": 3.0,
                    "temps": {"intake": hot}, "hottest": {"key": "intake", "celsius": hot}}]}))
        session.add(ShowNight(night="2026-10-06", key="2026-10-06:weekly", source="weekly",
                              outcome="missed", message="The show did not start.",
                              timeline=[], problems=[], stats={}))
        # A two-minute test from Run the show is listed but not a night played.
        session.add(ShowNight(night="2026-10-07", source="hand", outcome="played",
                              started_at=base + timedelta(days=6),
                              ended_at=base + timedelta(days=6, minutes=2),
                              timeline=[], problems=[], stats={"computed_at": "x"}))

    wrap = (await api.get("/api/history/wrapup?start=2026-09-01&end=2026-10-31&name=Halloween 2026",
                          headers=headers)).json()
    assert wrap["name"] == "Halloween 2026"
    assert wrap["nights_played"] == 5
    assert wrap["nights_missed"] == 1
    assert wrap["show_hours"] == 15.0
    assert wrap["first_night"] == "2026-10-01" and wrap["last_night"] == "2026-10-05"
    assert wrap["hottest"]["night"] == "2026-10-05"
    assert wrap["hottest"]["celsius"] == 34.0
    assert wrap["problems_total"] == 1 and wrap["clean_nights"] == 4
    assert wrap["groups"][0] == {"name": "Spooky", "shows": 3}
    assert wrap["kwh"] == 15.0
    assert [p["hours"] for p in wrap["projectors"]] == [15.0]

    from app.services import show_history

    async with session_scope() as session:
        found = await show_history.seasons(session, today=date(2026, 11, 3))
    halloween = next(s for s in found if s["key"] == "halloween-2026")
    assert halloween["just_finished"] and halloween["nights_played"] == 5
    async with session_scope() as session:
        later = await show_history.seasons(session, today=date(2026, 12, 1))
    assert not next(s for s in later if s["key"] == "halloween-2026")["just_finished"]


async def test_last_months_shows_are_rebuilt_from_the_log(api):
    headers = await login(api)

    from sqlalchemy import delete

    from app.db.models import Event, HistorySettings, ShowNight
    from app.db.session import session_scope
    from app.services.show_history import recorder

    start = datetime.now(UTC) - timedelta(days=2)
    async with session_scope() as session:
        await session.execute(delete(ShowNight))
        await session.execute(delete(HistorySettings))
        session.add(Event(kind="tonight_started", severity="info", created_at=start,
                          message="Tonight's show: Started by the schedule at 6:45 PM. "
                                  "The show is playing."))
        session.add(Event(kind="tonight_stopped", severity="info",
                          created_at=start + timedelta(hours=3),
                          message="Tonight's show: Stopped by the schedule at 9:45 PM. "
                                  "The show is stopped."))
    await recorder._recover()
    [night] = await _nights(api, headers)
    assert night["source"] == "earlier"
    assert night["outcome"] == "played"
    assert night["started_by"] == "the schedule"
    assert night["ended_by"] == "the schedule"
    assert night["minutes"] == 180
