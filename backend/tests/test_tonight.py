"""Scene groups and tonight's show: one click for every projector, on time."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

from tests.test_api import add_projector, api, login  # noqa: F401 - fixture
from tests.test_mapping import make_cue, make_show


async def _setup(api, headers):
    """A show with a garage and a house projector, two cues and three scenes."""
    show = await make_show(api, headers)
    outputs = []
    for name in ("Garage", "House"):
        made = await api.post(f"/api/mapping/shows/{show['id']}/outputs", headers=headers,
                              json={"name": name})
        assert made.status_code == 201, made.text
        outputs.append(made.json()["id"])
    scenes = {}
    for name, style in (("Ghosts", "ghosts"), ("Pumpkins", "pumpkins"), ("Trees", "trees")):
        made = await api.post("/api/mapping/scenes", headers=headers, json={
            "name": name, "layers": [{"type": "shapes", "style": style}]})
        assert made.status_code == 201, made.text
        scenes[name] = made.json()["id"]
    cues = [await make_cue(api, headers, show["id"], scene_id=scenes["Trees"]) for _ in range(2)]
    return show, outputs, scenes, cues


async def _cues(api, headers, show_id):
    return (await api.get(f"/api/mapping/shows/{show_id}", headers=headers)).json()["cues"]


async def test_a_scene_group_sets_every_projector_in_one_click(api):
    headers = await login(api)
    show, (garage, house), scenes, _ = await _setup(api, headers)

    made = await api.post("/api/mapping/scene-groups", headers=headers, json={
        "show_id": show["id"], "name": " Halloween night ", "scene_id": scenes["Ghosts"],
        "output_scenes": {str(house): scenes["Pumpkins"]}})
    assert made.status_code == 201, made.text
    halloween = made.json()
    assert halloween["name"] == "Halloween night"
    assert halloween["output_scenes"] == {str(house): scenes["Pumpkins"]}

    # Names are unique within a show; projectors must be the show's own.
    duplicate = await api.post("/api/mapping/scene-groups", headers=headers, json={
        "show_id": show["id"], "name": "Halloween night"})
    assert duplicate.status_code == 409
    other = await make_show(api, headers, name="Other")
    stray = await api.post("/api/mapping/scene-groups", headers=headers, json={
        "show_id": other["id"], "name": "Wrong", "output_scenes": {str(house): None}})
    assert stray.status_code == 400
    unknown = await api.post("/api/mapping/scene-groups", headers=headers, json={
        "show_id": show["id"], "name": "Nope", "scene_id": 999})
    assert unknown.status_code == 400

    # Using it sets every cue, and makes it tonight's group.
    used = await api.post(f"/api/mapping/scene-groups/{halloween['id']}/use", headers=headers)
    assert used.status_code == 200, used.text
    assert used.json()["group_name"] == "Halloween night"
    assert used.json()["show_name"] == show["name"]
    for cue in await _cues(api, headers, show["id"]):
        assert cue["scene_id"] == scenes["Ghosts"]
        assert cue["output_scenes"] == {str(house): scenes["Pumpkins"]}

    # Changing tonight's group changes the projectors too.
    changed = await api.patch(f"/api/mapping/scene-groups/{halloween['id']}", headers=headers,
                              json={"output_scenes": {str(garage): None,
                                                      str(house): scenes["Pumpkins"]}})
    assert changed.status_code == 200, changed.text
    for cue in await _cues(api, headers, show["id"]):
        assert cue["output_scenes"] == {str(garage): None, str(house): scenes["Pumpkins"]}

    # A deleted scene leaves "no scene"; a deleted projector leaves the group.
    deleted = await api.delete(f"/api/mapping/scenes/{scenes['Pumpkins']}", headers=headers)
    assert deleted.status_code == 204
    gone = await api.delete(f"/api/mapping/outputs/{garage}", headers=headers)
    assert gone.status_code == 204
    listed = (await api.get(f"/api/mapping/scene-groups?show_id={show['id']}",
                            headers=headers)).json()
    assert listed[0]["output_scenes"] == {str(house): None}

    removed = await api.delete(f"/api/mapping/scene-groups/{halloween['id']}", headers=headers)
    assert removed.status_code == 204
    tonight = (await api.get("/api/tonight", headers=headers)).json()
    assert tonight["group_id"] is None
    assert tonight["show_id"] == show["id"]


async def test_tonight_show_time_is_kept_and_checked(api):
    headers = await login(api)
    show, *_ = await _setup(api, headers)

    tonight = (await api.get("/api/tonight", headers=headers)).json()
    # The only show is picked by itself; no time yet.
    assert tonight["show_id"] == show["id"]
    assert tonight["state"] == "off"
    assert tonight["days"] == [0, 1, 2, 3, 4, 5, 6]

    for bad in ({"start_at": "25:00"}, {"days": [7]},
                {"enabled": True, "start_at": "18:00"},
                {"enabled": True, "start_at": "18:00", "end_at": "18:00"},
                {"enabled": True, "start_at": "18:00", "end_at": "23:00", "days": []}):
        refused = await api.put("/api/tonight", headers=headers, json=bad)
        assert refused.status_code in (400, 422), bad

    saved = await api.put("/api/tonight", headers=headers, json={
        "enabled": True, "start_at": "18:00", "end_at": "01:00", "power": False})
    assert saved.status_code == 200, saved.text
    assert saved.json()["start_at"] == "18:00"
    assert saved.json()["power"] is False

    from app.db.session import session_scope
    from app.services import tonight as service

    zone = datetime.now().astimezone().tzinfo
    async with session_scope() as session:
        def at(hour, minute=0, day=0):
            base = datetime(2026, 10, 24, tzinfo=zone) + timedelta(days=day)
            return base.replace(hour=hour, minute=minute)

        later = await service.describe(session, at(12))
        assert later["state"] == "later"
        assert later["starts_at"] == at(18)
        assert later["ends_at"] == at(1, day=1)
        running = await service.describe(session, at(23, 30))
        assert running["state"] == "running"
        # After midnight it is still the night that started yesterday.
        after_midnight = await service.describe(session, at(0, 30, day=1))
        assert after_midnight["state"] == "running"
        assert after_midnight["starts_at"] == at(18)
        done = await service.describe(session, at(2, day=1))
        assert done["state"] == "later"  # tonight's show is yet to come
        # Not on Saturdays (2026-10-24 is a Saturday).
        plan = await service.load_plan(session)
        plan.days = [0, 1, 2, 3, 4, 6]
        assert (await service.describe(session, at(12)))["state"] == "not_tonight"
        assert (await service.describe(session, at(12)))["next_starts_at"] == at(18, day=1)
        plan.days = list(range(7))
        plan.end_at = "23:00"
        assert (await service.describe(session, at(23, 30)))["state"] == "done"
        await session.rollback()


async def test_the_show_starts_and_stops_on_time(api):
    headers = await login(api)
    show, (_, house), scenes, _ = await _setup(api, headers)
    projector = await add_projector(api, headers)
    linked = await api.patch(f"/api/mapping/outputs/{house}", headers=headers,
                             json={"projector_id": projector})
    assert linked.status_code == 200, linked.text
    group = (await api.post("/api/mapping/scene-groups", headers=headers, json={
        "show_id": show["id"], "name": "Ghosts everywhere",
        "scene_id": scenes["Ghosts"]})).json()
    # Picked for tonight, then the cues changed by hand afterwards.
    await api.post(f"/api/mapping/scene-groups/{group['id']}/use", headers=headers)
    cue = (await _cues(api, headers, show["id"]))[0]
    await api.patch(f"/api/mapping/cues/{cue['id']}", headers=headers,
                    json={"scene_id": scenes["Trees"]})

    from app.config import settings
    from app.services import tonight as service

    now = datetime.now(settings.tz).replace(second=0, microsecond=0)
    saved = await api.put("/api/tonight", headers=headers, json={
        "enabled": True, "start_at": (now - timedelta(minutes=2)).strftime("%H:%M"),
        "end_at": (now + timedelta(hours=1)).strftime("%H:%M"), "power": True})
    assert saved.json()["state"] == "running"

    # A start time just passed: the show starts now, with tonight's group.
    await service.scheduler.tick(now)
    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["status"] == "playing"
    assert state["show_id"] == show["id"]
    assert state["current"]["position"] == 0
    assert all(c["scene_id"] == scenes["Ghosts"] for c in await _cues(api, headers, show["id"]))
    tonight = (await api.get("/api/tonight", headers=headers)).json()
    assert "The show is playing." in tonight["last_message"]
    assert "1 projector turning on." in tonight["last_message"]

    # Once a night: stopping it by hand does not make it start again.
    stopped = await api.post("/api/tonight/stop", headers=headers)
    assert stopped.status_code == 200, stopped.text
    assert stopped.json()["message"] == "The show is stopped."
    await service.scheduler.tick(now + timedelta(minutes=5))
    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["status"] == "stopped"

    # ...but a server restart during the show time does (a power cut).
    service.scheduler.mark_started(None)
    await service.scheduler.tick(now + timedelta(minutes=6))
    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["status"] == "playing"
    revision = state["revision"]
    await service.scheduler.tick(now + timedelta(minutes=7))
    assert (await api.get("/api/mapping/transport", headers=headers)).json()["revision"] == revision

    # At the end time it stops and the projectors are turned off, once.
    await asyncio.sleep(0.5)  # let the simulator finish warming up
    await service.scheduler.tick(now + timedelta(hours=1, minutes=1))
    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["status"] == "stopped"
    tonight = (await api.get("/api/tonight", headers=headers)).json()
    assert "turning off" in tonight["last_message"], tonight["last_message"]
    message = tonight["last_message"]
    await service.scheduler.tick(now + timedelta(hours=1, minutes=2))
    assert (await api.get("/api/tonight", headers=headers)).json()["last_message"] == message


async def test_the_emergency_stop_holds_tonights_show(api):
    headers = await login(api)
    show, *_ = await _setup(api, headers)
    pressed = await api.post("/api/emergency/stop", headers=headers)
    assert pressed.status_code == 200, pressed.text

    refused = await api.post("/api/tonight/start", headers=headers)
    assert refused.json()["ok"] is False
    assert "emergency stop" in refused.json()["message"]

    from app.config import settings
    from app.services import tonight as service

    now = datetime.now(settings.tz).replace(second=0, microsecond=0)
    await api.put("/api/tonight", headers=headers, json={
        "enabled": True, "start_at": now.strftime("%H:%M"),
        "end_at": (now + timedelta(hours=2)).strftime("%H:%M"), "power": False})
    await service.scheduler.tick(now)
    tonight = (await api.get("/api/tonight", headers=headers)).json()
    assert "emergency stop is on" in tonight["last_message"]
    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["status"] != "playing"

    # Cleared, the show can be started by hand.
    await api.post("/api/emergency/clear", headers=headers)
    started = await api.post("/api/tonight/start", headers=headers)
    assert started.json()["ok"] is True, started.json()
    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["status"] == "playing"
    assert state["show_id"] == show["id"]
