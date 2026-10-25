"""The show calendar: shows planned ahead, and the scheduler playing them."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta

from tests.test_api import add_projector, api, login  # noqa: F401 - fixture
from tests.test_tonight import _cues, _setup


async def _groups(api, headers, show_id, scenes):
    made = {}
    for name, scene in (("Halloween", "Ghosts"), ("Harvest", "Pumpkins"), ("Winter", "Trees")):
        reply = await api.post("/api/mapping/scene-groups", headers=headers, json={
            "show_id": show_id, "name": name, "scene_id": scenes[scene]})
        assert reply.status_code == 201, reply.text
        made[name] = reply.json()["id"]
    return made


async def test_calendar_entries_are_checked(api):
    headers = await login(api)
    show, _, scenes, _ = await _setup(api, headers)
    groups = await _groups(api, headers, show["id"], scenes)
    other = (await api.post("/api/mapping/shows", headers=headers,
                            json={"name": "Other"})).json()

    base = {"start_date": "2026-10-31", "end_date": "2026-10-31",
            "start_at": "18:00", "end_at": "22:00", "group_id": groups["Halloween"]}
    for bad in ({**base, "end_date": "2026-10-30"},
                {**base, "start_at": None},
                {**base, "end_at": "18:00"},
                {**base, "days": []},
                {**base, "days": [7]},
                {**base, "start_at": "7pm"},
                {**base, "group_id": 999},
                {**base, "show_id": other["id"]}):
        refused = await api.post("/api/calendar/entries", headers=headers, json=bad)
        assert refused.status_code in (400, 422), (bad, refused.text)

    made = await api.post("/api/calendar/entries", headers=headers, json=base)
    assert made.status_code == 201, made.text
    entry = made.json()
    # The show comes from the scene group.
    assert entry["show_id"] == show["id"]
    assert entry["days"] == [0, 1, 2, 3, 4, 5, 6]

    # "No show" keeps no show, group or times.
    off = await api.post("/api/calendar/entries", headers=headers, json={
        **base, "kind": "off", "title": " Thanksgiving "})
    assert off.status_code == 201, off.text
    assert off.json()["title"] == "Thanksgiving"
    assert off.json()["group_id"] is None and off.json()["start_at"] is None

    changed = await api.put(f"/api/calendar/entries/{entry['id']}", headers=headers,
                            json={**base, "end_at": "23:30", "power": False})
    assert changed.status_code == 200, changed.text
    assert changed.json()["end_at"] == "23:30"
    assert changed.json()["power"] is False

    listed = (await api.get("/api/calendar/entries", headers=headers)).json()
    assert [e["id"] for e in listed] == [entry["id"], off.json()["id"]]
    gone = await api.delete(f"/api/calendar/entries/{entry['id']}", headers=headers)
    assert gone.status_code == 204
    assert (await api.delete(f"/api/calendar/entries/{entry['id']}",
                             headers=headers)).status_code == 404

    logs = (await api.get("/api/events?limit=20", headers=headers)).json()
    messages = " ".join(e["message"] for e in (logs.get("items", logs) if isinstance(logs, dict) else logs))
    assert "Halloween on the calendar" in messages


async def test_the_calendar_decides_each_night(api):
    headers = await login(api)
    show, _, scenes, _ = await _setup(api, headers)
    groups = await _groups(api, headers, show["id"], scenes)
    await api.post(f"/api/mapping/scene-groups/{groups['Harvest']}/use", headers=headers)
    # The weekly show time: 6 to 11 PM every night, with Harvest.
    await api.put("/api/tonight", headers=headers, json={
        "enabled": True, "start_at": "18:00", "end_at": "23:00"})

    async def add(**body):
        reply = await api.post("/api/calendar/entries", headers=headers, json=body)
        assert reply.status_code == 201, reply.text
        return reply.json()["id"]

    # Halloween night itself, earlier and longer.
    halloween = await add(start_date="2026-10-31", end_date="2026-10-31",
                          start_at="17:00", end_at="23:30", group_id=groups["Halloween"])
    # No shows Nov 2 to 8 ...but a party on Nov 5.
    await add(kind="off", title="Away", start_date="2026-11-02", end_date="2026-11-08")
    party = await add(title="Party", start_date="2026-11-05", end_date="2026-11-05",
                      start_at="20:00", end_at="01:00", group_id=groups["Halloween"])
    # Fridays from Nov 1 with no end, and then Winter on Fridays and
    # Saturdays from Nov 20 with no end: the newer one wins where they overlap.
    await add(title="Clash", start_date="2026-11-01", days=[4], start_at="21:00",
              end_at="23:00", group_id=groups["Harvest"])
    winter = await add(start_date="2026-11-20", days=[4, 5], start_at="17:30",
                       end_at="22:00", group_id=groups["Winter"])

    reply = await api.get("/api/calendar?start=2026-10-30&days=30", headers=headers)
    assert reply.status_code == 200, reply.text
    days = {d["date"]: d for d in reply.json()["days"]}
    assert len(days) == 30

    def only(day):
        slots = days[day]["slots"]
        assert len(slots) == 1, (day, slots)
        return slots[0]

    # An ordinary night: the weekly show time.
    assert only("2026-10-30")["source"] == "weekly"
    assert only("2026-10-30")["group_name"] == "Harvest"
    # Halloween: the calendar replaces the weekly time.
    oct31 = only("2026-10-31")
    assert (oct31["source"], oct31["entry_id"], oct31["title"]) == ("calendar", halloween, "Halloween")
    assert oct31["starts_at"].startswith("2026-10-31T17:00")
    assert days["2026-10-31"]["skipped"] == [
        {"entry_id": None, "title": "Weekly show time", "reason": "the calendar has this night"}]
    # Away: dark, except the party, which runs past midnight.
    assert days["2026-11-03"]["slots"] == []
    assert days["2026-11-03"]["cancelled_by"]["title"] == "Away"
    nov5 = only("2026-11-05")
    assert nov5["entry_id"] == party
    assert nov5["ends_at"].startswith("2026-11-06T01:00")
    # The weekly time is back after the trip.
    assert only("2026-11-09")["source"] == "weekly"
    # Fridays from Nov 20: Winter, and the clash is left out.
    nov20 = days["2026-11-20"]
    assert [s["entry_id"] for s in nov20["slots"]] == [winter]
    assert nov20["skipped"][0]["title"] == "Clash"
    assert "overlaps Winter" in nov20["skipped"][0]["reason"]
    # Before Nov 20 the clash plays alone on Fridays.
    assert only("2026-11-13")["title"] == "Clash"
    assert reply.json()["entries"][0]["id"] == halloween
    assert only("2026-11-21")["entry_id"] == winter

    # The home page follows the calendar.
    from app.db.session import session_scope
    from app.services import tonight as service

    zone = datetime.now().astimezone().tzinfo
    async with session_scope() as session:
        later = await service.describe(session, datetime(2026, 10, 31, 12, tzinfo=zone))
        assert later["state"] == "later"
        assert later["source"] == "calendar"
        assert later["group_name"] == "Halloween"
        assert later["starts_at"] == datetime(2026, 10, 31, 17, tzinfo=zone)
        assert [s["title"] for s in later["tonight_slots"]] == ["Halloween"]
        dark = await service.describe(session, datetime(2026, 11, 3, 12, tzinfo=zone))
        assert dark["state"] == "not_tonight"
        assert dark["cancelled_by"] == "Away"
        assert dark["next_starts_at"] == datetime(2026, 11, 5, 20, tzinfo=zone)
        assert dark["next_title"] == "Party"
        weekly = await service.describe(session, datetime(2026, 10, 30, 19, tzinfo=zone))
        assert weekly["state"] == "running"
        assert weekly["source"] == "weekly"
        assert weekly["group_name"] == "Harvest"

    # With the weekly time off, the calendar still plans shows.
    await api.put("/api/tonight", headers=headers, json={"enabled": False})
    async with session_scope() as session:
        quiet = await service.describe(session, datetime(2026, 10, 30, 12, tzinfo=zone))
        assert quiet["state"] == "not_tonight"
        assert quiet["next_starts_at"] == datetime(2026, 10, 31, 17, tzinfo=zone)


async def test_the_schedule_plays_calendar_shows(api):
    headers = await login(api)
    show, (_, house), scenes, _ = await _setup(api, headers)
    groups = await _groups(api, headers, show["id"], scenes)
    projector = await add_projector(api, headers)
    await api.patch(f"/api/mapping/outputs/{house}", headers=headers,
                    json={"projector_id": projector})

    from app.config import settings
    from app.services import tonight as service

    service.scheduler.mark_started(None)
    now = datetime.now(settings.tz).replace(second=0, microsecond=0)
    hhmm = lambda value: value.strftime("%H:%M")  # noqa: E731
    today = now.date().isoformat()
    # Two shows back to back tonight; the first started two minutes ago.
    first = (await api.post("/api/calendar/entries", headers=headers, json={
        "start_date": today, "end_date": today, "start_at": hhmm(now - timedelta(minutes=2)),
        "end_at": hhmm(now + timedelta(minutes=30)), "group_id": groups["Halloween"],
        "power": True})).json()
    await api.post("/api/calendar/entries", headers=headers, json={
        "start_date": today, "end_date": today, "start_at": hhmm(now + timedelta(minutes=30)),
        "end_at": hhmm(now + timedelta(minutes=60)), "group_id": groups["Winter"],
        "power": True})
    tonight = (await api.get("/api/tonight", headers=headers)).json()
    assert tonight["state"] == "running"
    assert tonight["entry_id"] == first["id"]
    assert len(tonight["tonight_slots"]) == 2

    await service.scheduler.tick(now)
    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["status"] == "playing"
    assert all(c["scene_id"] == scenes["Ghosts"] for c in await _cues(api, headers, show["id"]))

    # The second takes over without stopping or switching anything off.
    await asyncio.sleep(0.5)
    await service.scheduler.tick(now + timedelta(minutes=31))
    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["status"] == "playing"
    assert all(c["scene_id"] == scenes["Trees"] for c in await _cues(api, headers, show["id"]))
    message = (await api.get("/api/tonight", headers=headers)).json()["last_message"]
    assert "already playing" in message
    assert "turning off" not in message

    # Changing the group on tonight's calendar show changes the projectors.
    changed = await api.patch(f"/api/mapping/scene-groups/{groups['Winter']}", headers=headers,
                              json={"scene_id": scenes["Pumpkins"]})
    assert changed.status_code == 200
    assert all(c["scene_id"] == scenes["Pumpkins"] for c in await _cues(api, headers, show["id"]))

    # The end of the last one stops the show and turns the projectors off.
    await service.scheduler.tick(now + timedelta(minutes=61))
    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["status"] == "stopped"
    message = (await api.get("/api/tonight", headers=headers)).json()["last_message"]
    assert "turning off" in message


def test_a_night_is_decided_without_a_database():
    from app.db.models import ShowCalendarEntry, ShowPlan
    from app.services.show_calendar import resolve_night

    zone = datetime.now().astimezone().tzinfo
    plan = ShowPlan(enabled=True, start_at="18:00", end_at="23:00", days=list(range(7)),
                    show_id=1, group_id=None, power=True)
    week = ShowCalendarEntry(id=1, kind="off", title="Week off", start_date="2026-12-21",
                             end_date="2026-12-27", days=list(range(7)))
    eve = ShowCalendarEntry(id=2, kind="show", title="Christmas Eve", show_id=1,
                            start_date="2026-12-24", end_date="2026-12-24",
                            days=list(range(7)), start_at="16:00", end_at="23:59", power=True)
    night = resolve_night(plan, [week, eve], date(2026, 12, 24), zone, {})
    assert [s.title for s in night.slots] == ["Christmas Eve"]
    night = resolve_night(plan, [week, eve], date(2026, 12, 23), zone, {})
    assert night.slots == [] and night.cancelled_by is week
    night = resolve_night(plan, [week, eve], date(2026, 12, 28), zone, {})
    assert [s.source for s in night.slots] == ["weekly"]
