"""Automations that play a scene from Mapping → Scenes, or start and stop a show."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

from tests.test_api import api, login  # noqa: F401 - fixture
from tests.test_mapping import make_cue, make_show

HAUNTED = {"name": "Haunted house", "description": "Halloween",
           "layers": [{"type": "shapes", "style": "ghosts"}]}


async def run(api, headers, steps: list[dict]) -> dict:
    created = await api.post("/api/automations", headers=headers, json={
        "name": f"Steps {len(steps)} {id(steps)}", "abort_on_failure": True, "steps": steps,
    })
    assert created.status_code == 201, created.text
    ran = await api.post(f"/api/automations/{created.json()['id']}/execute", headers=headers,
                         json={"capability": "run", "confirm": True})
    assert ran.status_code == 200, ran.text
    return ran.json()


async def test_play_a_scene_on_every_projector(api):
    headers = await login(api)
    scene = (await api.post("/api/mapping/scenes", headers=headers, json=HAUNTED)).json()
    show = await make_show(api, headers)
    await make_cue(api, headers, show["id"], name="Opening")

    checked = await api.post("/api/automations/validate", headers=headers, json={
        "name": "draft", "steps": [{"type": "play_scene", "mapping_scene_id": scene["id"]}],
    })
    assert checked.json()["ok"] is True, checked.json()["problems"]

    body = await run(api, headers, [{"type": "play_scene", "mapping_scene_id": scene["id"],
                                     "fade_seconds": 2}])
    assert body["status"] == "success", body
    assert "Haunted house" in body["steps"][0]["detail"]

    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["status"] == "playing"
    assert state["current"]["scene_id"] == scene["id"]
    assert state["current"]["position"] == -1
    assert state["current"]["name"] == "Haunted house"

    # GO afterwards starts the show from its first cue.
    went = await api.post("/api/mapping/transport", headers=headers,
                          json={"action": "go", "show_id": show["id"]})
    assert went.status_code == 200, went.text
    assert went.json()["current"]["position"] == 0
    await api.post("/api/mapping/transport", headers=headers, json={"action": "stop"})


async def test_play_scene_needs_a_scene_that_exists(api):
    headers = await login(api)
    checked = await api.post("/api/automations/validate", headers=headers, json={
        "name": "draft", "steps": [{"type": "play_scene"},
                                   {"type": "play_scene", "mapping_scene_id": 999}],
    })
    errors = {p["step"] for p in checked.json()["problems"] if p["severity"] == "error"}
    assert errors == {0, 1}


async def test_play_scene_is_held_by_the_emergency_stop(api):
    headers = await login(api)
    scene = (await api.post("/api/mapping/scenes", headers=headers, json=HAUNTED)).json()
    from app.services.mapping import TransportError, transport

    await transport.emergency_stop(by="test")
    try:
        try:
            await transport.command("scene", scene_id=scene["id"])
        except TransportError:
            pass
        else:
            raise AssertionError("a scene played during the emergency stop")
    finally:
        await transport.clear_emergency()


async def test_start_and_stop_a_show_at_a_cue(api):
    headers = await login(api)
    show = await make_show(api, headers)
    await make_cue(api, headers, show["id"], name="Opening")
    second = await make_cue(api, headers, show["id"], name="Ghosts")

    body = await run(api, headers, [
        {"type": "show", "action": "start", "show_id": show["id"], "cue_id": second["id"]},
    ])
    assert body["status"] == "success", body
    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["show_id"] == show["id"]
    assert state["current"]["position"] == 1

    body = await run(api, headers, [{"type": "show", "action": "stop"}])
    assert body["status"] == "success", body
    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["status"] == "stopped"


async def test_show_step_checks_the_show_and_cue(api):
    headers = await login(api)
    empty = await make_show(api, headers, name="Empty")
    other = await make_show(api, headers, name="Other")
    elsewhere = await make_cue(api, headers, other["id"], name="Elsewhere")
    checked = await api.post("/api/automations/validate", headers=headers, json={
        "name": "draft", "steps": [
            {"type": "show", "action": "start"},
            {"type": "show", "action": "start", "show_id": empty["id"]},
            {"type": "show", "action": "start", "show_id": empty["id"], "cue_id": elsewhere["id"]},
            {"type": "show", "action": "start", "show_id": other["id"], "cue_id": elsewhere["id"]},
            {"type": "show", "action": "stop"},
        ],
    })
    errors = {p["step"] for p in checked.json()["problems"] if p["severity"] == "error"}
    assert errors == {0, 1, 2}
