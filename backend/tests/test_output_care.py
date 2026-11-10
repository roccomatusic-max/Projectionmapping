"""Keeping a picture on every projector: the daily output restart and the
picture watchdog (services/output_care.py)."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy import select, update

from tests.test_api import api, login  # noqa: F401 - fixture
from tests.test_minipc import _forget_commands, app_checkin, paired  # noqa: F401 - fixture

DAY = (2030, 1, 15)


def local(hour: int, minute: int = 0) -> datetime:
    from app.config import settings
    return datetime(*DAY, hour, minute, tzinfo=settings.tz)


async def events(kind: str) -> list[str]:
    from app.db.models import Event
    from app.db.session import session_scope
    async with session_scope() as session:
        return list((await session.execute(
            select(Event.message).where(Event.kind == kind).order_by(Event.id))).scalars())


async def page_went_quiet(player_id: int) -> None:
    from app.db.models import MappingPlayer, utcnow
    from app.db.session import session_scope
    async with session_scope() as session:
        await session.execute(update(MappingPlayer).where(MappingPlayer.id == player_id)
                              .values(last_seen_at=utcnow() - timedelta(minutes=5)))
        await session.commit()


async def assigned(api, headers) -> tuple[int, dict]:
    """A paired mini PC with an output, its Mini PC app checking in."""
    player_id, token = await paired(api, headers)
    show = (await api.post("/api/mapping/shows", headers=headers, json={"name": "Show"})).json()
    output = show["outputs"][0]["id"] if show.get("outputs") else (await api.post(
        f"/api/mapping/shows/{show['id']}/outputs", headers=headers,
        json={"name": "Left"})).json()["id"]
    response = await api.patch(f"/api/mapping/players/{player_id}", headers=headers,
                               json={"output_id": output})
    assert response.status_code == 200, response.text
    await app_checkin(api)
    return player_id, token


@pytest.fixture
def service(monkeypatch):
    from app.services import output_care
    fresh = output_care.OutputCareService()
    fresh._started = -1e9  # long past the start-up grace
    # The Players page reads this one's notes.
    monkeypatch.setattr(output_care, "output_care", fresh)
    return fresh


def show_on(monkeypatch, why: str | None = "a show is playing") -> None:
    from app.services import output_care

    async def should_be_on(_session, _now):
        return why
    monkeypatch.setattr(output_care, "show_should_be_on", should_be_on)


async def test_it_starts_on_at_seven_and_checks_the_time(api):
    headers = await login(api)
    got = (await api.get("/api/mapping/output-care", headers=headers)).json()
    assert (got["daily_enabled"], got["daily_time"], got["watchdog_enabled"]) == (True, "07:00", True)
    assert got["next_daily_at"] is not None

    saved = await api.put("/api/mapping/output-care", headers=headers, json={
        "daily_enabled": True, "daily_time": "05:30", "watchdog_enabled": False})
    assert saved.status_code == 200, saved.text
    assert (saved.json()["daily_time"], saved.json()["watchdog_enabled"]) == ("05:30", False)
    assert "5:30 AM" in (await events("output_care"))[-1]

    bad = await api.put("/api/mapping/output-care", headers=headers, json={
        "daily_enabled": True, "daily_time": "25:00", "watchdog_enabled": True})
    assert bad.status_code == 400
    off = await api.put("/api/mapping/output-care", headers=headers, json={
        "daily_enabled": False, "daily_time": "07:00", "watchdog_enabled": True})
    assert off.json()["next_daily_at"] is None


async def test_the_daily_restart_runs_once_at_its_time(api, service):
    headers = await login(api)
    await assigned(api, headers)

    await service.tick(now=local(6, 59), mono=0)
    assert (await app_checkin(api))["commands"] == []

    await service.tick(now=local(7, 0), mono=10)
    assert (await app_checkin(api))["commands"] == ["restart_output"]
    assert "Left mini PC" in (await events("output_restart"))[-1]

    # Once a day.
    await service.tick(now=local(7, 5), mono=20)
    await service.tick(now=local(23, 0), mono=30)
    assert (await app_checkin(api))["commands"] == []

    got = (await api.get("/api/mapping/output-care", headers=headers)).json()
    assert got["players"][0]["last_restart_reason"] == "daily restart"
    assert "Left mini PC" in got["last_daily_note"]


async def test_the_daily_restart_waits_for_the_show_to_end(api, service):
    from app.services.mapping import transport

    headers = await login(api)
    await assigned(api, headers)
    transport._state.status = "playing"
    try:
        await service.tick(now=local(7, 0), mono=0)
        assert service.daily_waiting == "a show is playing"
        assert (await app_checkin(api))["commands"] == []
    finally:
        transport._state.status = "stopped"
    await service.tick(now=local(7, 40), mono=10)
    assert service.daily_waiting is None
    assert (await app_checkin(api))["commands"] == ["restart_output"]


async def test_a_blackout_left_on_does_not_hold_the_daily_restart(api, service):
    from app.services.mapping import transport

    headers = await login(api)
    await assigned(api, headers)
    transport._state.status = "blackout"
    try:
        await service.tick(now=local(7, 0), mono=0)
    finally:
        transport._state.status = "stopped"
    assert (await app_checkin(api))["commands"] == ["restart_output"]


async def test_a_server_off_all_morning_waits_for_the_next_day(api, service):
    headers = await login(api)
    await assigned(api, headers)
    await service.tick(now=local(14, 0), mono=0)
    assert (await app_checkin(api))["commands"] == []


async def test_the_watchdog_restarts_an_output_that_stopped_answering(api, service, monkeypatch):
    headers = await login(api)
    player_id, _ = await assigned(api, headers)
    show_on(monkeypatch)
    await page_went_quiet(player_id)
    await app_checkin(api)

    await service.tick(now=local(19, 0), mono=1000)
    assert (await app_checkin(api))["commands"] == []  # give it half a minute
    await service.tick(now=local(19, 0), mono=1035)
    assert (await app_checkin(api))["commands"] == ["restart_output"]
    assert "not answering" in (await events("output_restart"))[-1]

    # Then it has two minutes to come back.
    await service.tick(now=local(19, 1), mono=1100)
    await service.tick(now=local(19, 2), mono=1140)
    assert (await app_checkin(api))["commands"] == []


async def test_the_watchdog_restarts_an_output_that_stopped_drawing(api, service, monkeypatch):
    headers = await login(api)
    _, token = await assigned(api, headers)
    show_on(monkeypatch)
    beat = await api.post("/api/mapping/players/me", headers=token,
                          json={"fps": 60, "showing": "output", "frame_age_ms": 40000})
    assert beat.status_code == 200, beat.text
    await service.tick(now=local(19, 0), mono=1000)
    await service.tick(now=local(19, 0), mono=1035)
    assert (await app_checkin(api))["commands"] == ["restart_output"]
    assert "not drawing" in (await events("output_restart"))[-1]


async def test_a_healthy_output_and_quiet_times_are_left_alone(api, service, monkeypatch):
    headers = await login(api)
    player_id, token = await assigned(api, headers)
    show_on(monkeypatch)
    await api.post("/api/mapping/players/me", headers=token,
                   json={"fps": 60, "showing": "output", "frame_age_ms": 16})
    for mono in (1000, 1040, 1080):
        await service.tick(now=local(19, 0), mono=mono)
    assert (await app_checkin(api))["commands"] == []

    # No show on: a quiet page is not the watchdog's business.
    show_on(monkeypatch, None)
    await page_went_quiet(player_id)
    for mono in (2000, 2040, 2080):
        await service.tick(now=local(19, 0), mono=mono)
    assert (await app_checkin(api))["commands"] == []

    # Nor when it is switched off.
    show_on(monkeypatch)
    await api.put("/api/mapping/output-care", headers=headers, json={
        "daily_enabled": True, "daily_time": "07:00", "watchdog_enabled": False})
    for mono in (3000, 3040, 3080):
        await service.tick(now=local(19, 0), mono=mono)
    assert (await app_checkin(api))["commands"] == []


async def test_the_watchdog_gives_up_after_three_tries_and_raises_an_alert(api, service, monkeypatch):
    headers = await login(api)
    player_id, _ = await assigned(api, headers)
    show_on(monkeypatch)
    await page_went_quiet(player_id)
    mono = 1000.0
    restarts = 0
    for _ in range(6):
        await app_checkin(api)
        await service.tick(now=local(19, 0), mono=mono)
        await service.tick(now=local(19, 0), mono=mono + 31)
        restarts += (await app_checkin(api))["commands"].count("restart_output")
        mono += 31 + 121
    assert restarts == 3
    alerts = (await api.get("/api/alerts", headers=headers)).json()
    assert any(a["kind"] == "minipc_no_picture" for a in alerts)
    got = (await api.get("/api/mapping/output-care", headers=headers)).json()
    assert got["players"][0]["gave_up"] is True


async def test_what_counts_as_a_show_being_on(api):
    from app.db.session import session_scope
    from app.services import output_care
    from app.services.mapping import transport

    async with session_scope() as session:
        assert await output_care.show_should_be_on(session, local(19)) is None
        transport._state.status = "playing"
        try:
            assert await output_care.show_should_be_on(session, local(19)) == "a show is playing"
            transport._state.status = "blackout"
            assert await output_care.show_should_be_on(session, local(19)) is None
        finally:
            transport._state.status = "stopped"


async def test_moving_the_time_later_today_runs_it_today_and_earlier_waits(api):
    from app.config import settings
    from app.db.models import OutputCare
    from app.services import output_care

    now = datetime(*DAY, 18, 0, tzinfo=settings.tz)
    later, earlier = OutputCare(daily_time="23:00"), OutputCare(daily_time="17:00")
    output_care.start_from_now(later, now)
    output_care.start_from_now(earlier, now)
    later.daily_enabled = earlier.daily_enabled = True
    assert output_care.next_daily(later, now) == datetime(*DAY, 23, 0, tzinfo=settings.tz)
    assert output_care.next_daily(earlier, now).day == DAY[2] + 1
