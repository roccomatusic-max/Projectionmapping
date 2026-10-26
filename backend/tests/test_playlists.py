"""Scene playlists: scene groups taking turns through the night, with fades."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

from tests.test_api import api, login  # noqa: F401 - fixture
from tests.test_mapping import make_cue, make_show
from tests.test_show_calendar import _groups
from tests.test_tonight import _cues, _setup


def hhmm(value: datetime) -> str:
    return value.strftime("%H:%M")


def test_step_times_are_placed_on_the_night():
    from app.services.playlists import active, clean_steps, place, timeline

    zone = datetime.now().astimezone().tzinfo
    start = datetime(2026, 10, 31, 18, 45, tzinfo=zone)
    # Later that evening; a little before the start counts as the start;
    # earlier than that is after midnight.
    assert place("20:00", start) == start.replace(hour=20, minute=0)
    assert place("18:30", start) == start
    assert place("00:30", start) == datetime(2026, 11, 1, 0, 30, tzinfo=zone)

    steps = clean_steps([{"at": "00:30", "group_id": 3, "fade_seconds": 99},
                         {"at": "18:45", "group_id": 1},
                         {"at": "21:30", "group_id": 2, "fade_seconds": 5}])
    assert [s["at"] for s in steps] == ["18:45", "21:30", "00:30"]
    assert steps[0]["fade_seconds"] == 0 and steps[2]["fade_seconds"] == 30

    placed = timeline(steps, start)
    assert [s.group_id for s in placed] == [1, 2, 3]
    # Before the first step's time the first step plays.
    assert active(placed, start - timedelta(hours=1)) == 0
    assert active(placed, start.replace(hour=22)) == 1
    assert active(placed, datetime(2026, 11, 1, 0, 45, tzinfo=zone)) == 2
    assert active([], start) is None


async def test_playlists_are_checked(api):
    headers = await login(api)
    show, _, scenes, _ = await _setup(api, headers)
    groups = await _groups(api, headers, show["id"], scenes)
    other = await make_show(api, headers, name="Other")
    stray = (await api.post("/api/mapping/scene-groups", headers=headers, json={
        "show_id": other["id"], "name": "Elsewhere"})).json()

    steps = [{"at": "21:30", "group_id": groups["Winter"], "fade_seconds": 10},
             {"at": "18:45", "group_id": groups["Halloween"]},
             {"at": "20:00", "group_id": groups["Harvest"], "fade_seconds": 0}]
    for bad in ({"name": "x", "steps": []},
                {"name": " ", "steps": steps},
                {"name": "x", "steps": [{**steps[0], "at": "9pm"}]},
                {"name": "x", "steps": [{**steps[0], "fade_seconds": 31}]},
                {"name": "x", "steps": [{**steps[0], "group_id": 999}]},
                {"name": "x", "steps": [*steps, {"at": "23:00", "group_id": stray["id"]}]},
                {"name": "x", "steps": [*steps, {**steps[1], "group_id": groups["Winter"]}]}):
        refused = await api.post("/api/mapping/playlists", headers=headers, json=bad)
        assert refused.status_code in (400, 422), (bad, refused.text)

    made = await api.post("/api/mapping/playlists", headers=headers,
                          json={"name": " Halloween night ", "steps": steps})
    assert made.status_code == 201, made.text
    playlist = made.json()
    assert playlist["name"] == "Halloween night"
    assert playlist["show_id"] == show["id"]
    # Kept in the night's order.
    assert [s["at"] for s in playlist["steps"]] == ["18:45", "20:00", "21:30"]
    assert playlist["steps"][0]["fade_seconds"] == 5  # the default fade

    duplicate = await api.post("/api/mapping/playlists", headers=headers,
                               json={"name": "Halloween night", "steps": steps})
    assert duplicate.status_code == 409

    changed = await api.put(f"/api/mapping/playlists/{playlist['id']}", headers=headers,
                            json={"name": "Spooky night", "steps": steps[:2]})
    assert changed.status_code == 200, changed.text
    assert changed.json()["name"] == "Spooky night"
    assert len(changed.json()["steps"]) == 2

    # A deleted group leaves its playlists; a playlist with no steps left goes.
    alone = (await api.post("/api/mapping/playlists", headers=headers, json={
        "name": "Only harvest", "steps": [steps[2]]})).json()
    await api.delete(f"/api/mapping/scene-groups/{groups['Harvest']}", headers=headers)
    listed = (await api.get(f"/api/mapping/playlists?show_id={show['id']}",
                            headers=headers)).json()
    assert [p["id"] for p in listed] == [playlist["id"]]
    assert [s["group_id"] for s in listed[0]["steps"]] == [groups["Halloween"], groups["Winter"]]
    assert alone["id"] not in [p["id"] for p in listed]

    gone = await api.delete(f"/api/mapping/playlists/{playlist['id']}", headers=headers)
    assert gone.status_code == 204
    assert (await api.delete(f"/api/mapping/playlists/{playlist['id']}",
                             headers=headers)).status_code == 404


async def test_a_playlist_plays_through_the_night(api):
    headers = await login(api)
    show, (_, house), scenes, _ = await _setup(api, headers)
    groups = await _groups(api, headers, show["id"], scenes)

    from app.config import settings
    from app.services import tonight as service
    from app.services.mapping import FADING_ID

    service.scheduler.mark_started(None)
    now = datetime.now(settings.tz).replace(second=0, microsecond=0)
    # The show time began half an hour ago; the second step is due now.
    began = now - timedelta(minutes=30)
    playlist = (await api.post("/api/mapping/playlists", headers=headers, json={
        "name": "Halloween night", "steps": [
            {"at": hhmm(began), "group_id": groups["Halloween"]},
            {"at": hhmm(now), "group_id": groups["Harvest"], "fade_seconds": 8},
            {"at": hhmm(now + timedelta(minutes=60)), "group_id": groups["Winter"]},
        ]})).json()
    used = await api.post(f"/api/mapping/playlists/{playlist['id']}/use", headers=headers)
    assert used.status_code == 200, used.text
    assert used.json()["plan_playlist_id"] == playlist["id"]
    assert used.json()["plan_group_id"] is None
    await api.put("/api/tonight", headers=headers, json={
        "enabled": True, "start_at": hhmm(began),
        "end_at": hhmm(now + timedelta(minutes=50)), "power": False})

    from app.db.session import session_scope

    async with session_scope() as session:
        first = await service.describe(session, began + timedelta(minutes=1))
    assert first["state"] == "running"
    assert first["title"] == "Halloween night"
    assert first["playlist_name"] == "Halloween night"
    assert first["group_name"] == "Halloween"
    assert [s["state"] for s in first["playlist_steps"]] == ["now", "later", "never"]
    assert first["tonight_slots"][0]["playlist_id"] == playlist["id"]

    # The show starts on the step due then.
    await service.scheduler.tick(began + timedelta(minutes=1))
    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["status"] == "playing"
    assert all(c["scene_id"] == scenes["Ghosts"] for c in await _cues(api, headers, show["id"]))
    revision = state["revision"]
    await service.scheduler.tick(began + timedelta(minutes=2))
    assert (await api.get("/api/mapping/transport", headers=headers)).json()["revision"] == revision

    # At the next step's time the scenes crossfade, and the cue keeps playing.
    await service.scheduler.tick(now)
    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["status"] == "playing"
    assert state["current"]["position"] == 0
    assert state["current"]["fade_seconds"] == 8
    assert state["previous"]["id"] <= FADING_ID
    assert state["previous"]["scene_id"] == scenes["Ghosts"]
    assert state["previous"]["media_id"] is None
    assert state["fade_started_at_ms"] is not None
    assert all(c["scene_id"] == scenes["Pumpkins"] for c in await _cues(api, headers, show["id"]))
    tonight = (await api.get("/api/tonight", headers=headers)).json()
    assert tonight["group_name"] == "Harvest"
    assert [s["state"] for s in tonight["playlist_steps"]] == ["done", "now", "never"]
    assert "Harvest from" in tonight["last_message"]
    assert "fading over 8 seconds" in tonight["last_message"]

    # A group playing later is changed without touching the projectors now...
    await api.patch(f"/api/mapping/scene-groups/{groups['Winter']}", headers=headers,
                    json={"scene_id": scenes["Ghosts"]})
    assert all(c["scene_id"] == scenes["Pumpkins"] for c in await _cues(api, headers, show["id"]))
    # ...and the step playing now changes them at once.
    await api.patch(f"/api/mapping/scene-groups/{groups['Harvest']}", headers=headers,
                    json={"scene_id": scenes["Trees"]})
    assert all(c["scene_id"] == scenes["Trees"] for c in await _cues(api, headers, show["id"]))

    # A show stopped by hand is not moved on (nor started again).
    await api.post("/api/tonight/stop", headers=headers)
    steps = [{**s} for s in playlist["steps"]]
    steps[2]["at"] = hhmm(now + timedelta(minutes=10))
    await api.put(f"/api/mapping/playlists/{playlist['id']}", headers=headers,
                  json={"name": playlist["name"], "steps": steps})
    await service.scheduler.tick(now + timedelta(minutes=15))
    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["status"] == "stopped"
    assert all(c["scene_id"] == scenes["Trees"] for c in await _cues(api, headers, show["id"]))

    # Picking a single group again takes the playlist off the weekly show time.
    picked = await api.post(f"/api/mapping/scene-groups/{groups['Winter']}/use", headers=headers)
    assert picked.json()["plan_playlist_id"] is None
    assert picked.json()["playlist_name"] is None
    assert picked.json()["group_name"] == "Winter"


async def test_a_calendar_show_can_play_a_playlist(api):
    headers = await login(api)
    show, _, scenes, _ = await _setup(api, headers)
    groups = await _groups(api, headers, show["id"], scenes)
    playlist = (await api.post("/api/mapping/playlists", headers=headers, json={
        "name": "Christmas Eve", "steps": [
            {"at": "17:00", "group_id": groups["Winter"]},
            {"at": "21:00", "group_id": groups["Harvest"]}]})).json()
    other = await make_show(api, headers, name="Other")

    base = {"start_date": "2026-12-24", "end_date": "2026-12-24", "start_at": "17:00",
            "end_at": "23:00", "playlist_id": playlist["id"]}
    for bad in ({**base, "playlist_id": 999}, {**base, "show_id": other["id"]}):
        refused = await api.post("/api/calendar/entries", headers=headers, json=bad)
        assert refused.status_code == 400, refused.text
    made = await api.post("/api/calendar/entries", headers=headers,
                          json={**base, "group_id": groups["Halloween"]})
    assert made.status_code == 201, made.text
    entry = made.json()
    assert entry["show_id"] == show["id"]
    assert entry["playlist_id"] == playlist["id"]
    assert entry["group_id"] is None  # the playlist decides

    calendar = (await api.get("/api/calendar?start=2026-12-24&days=1", headers=headers)).json()
    slot = calendar["days"][0]["slots"][0]
    assert slot["title"] == "Christmas Eve"
    assert slot["playlist_name"] == "Christmas Eve"

    from app.config import settings
    from app.db.session import session_scope
    from app.services import tonight as service

    async with session_scope() as session:
        eve = datetime(2026, 12, 24, 21, 30, tzinfo=settings.tz)
        described = await service.describe(session, eve)
    assert described["state"] == "running"
    assert described["group_name"] == "Harvest"
    assert [s["state"] for s in described["playlist_steps"]] == ["done", "now"]


async def test_a_fade_leaves_the_cue_moving_on_by_itself(api):
    headers = await login(api)
    show = await make_show(api, headers)
    scenes = []
    for name in ("One", "Two"):
        scenes.append((await api.post("/api/mapping/scenes", headers=headers, json={
            "name": name, "layers": [{"type": "shapes", "style": "ghosts"}]})).json()["id"])
    await make_cue(api, headers, show["id"], scene_id=scenes[0], follow_seconds=0.6)
    await make_cue(api, headers, show["id"], scene_id=scenes[0])

    from app.services.mapping import transport

    await transport.command("goto", show_id=show["id"], cue=0)
    assert await transport.fade_scenes(show_id=show["id"], scene_id=scenes[1],
                                       output_scenes={}, fade_seconds=3)
    # Not for another show, and not with no fade.
    assert not await transport.fade_scenes(show_id=show["id"] + 1, scene_id=None,
                                           output_scenes={}, fade_seconds=3)
    assert not await transport.fade_scenes(show_id=show["id"], scene_id=None,
                                           output_scenes={}, fade_seconds=0)
    await asyncio.sleep(1.0)
    assert transport.snapshot().current.position == 1
    await transport.command("stop")
