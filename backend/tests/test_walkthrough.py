"""Walk the yard: each projector in turn from the phone, then everything put back."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

import asyncio

from tests.test_api import add_projector, api, login  # noqa: F401 - fixture
from tests.test_minipc import hello

SECRET = "w" * 64


async def mini_pcs(api, headers, names=("Left", "Right")) -> tuple[dict, list[int], list[int]]:
    """A show with one output per name, each played by its own paired mini PC."""
    show = (await api.post("/api/mapping/shows", headers=headers, json={"name": "House"})).json()
    outputs = [o["id"] for o in show.get("outputs", [])]
    while len(outputs) < len(names):
        made = await api.post(f"/api/mapping/shows/{show['id']}/outputs", headers=headers,
                              json={"name": f"Output {len(outputs) + 1}"})
        assert made.status_code in (200, 201), made.text
        outputs.append(made.json()["id"])
    players = []
    for i, name in enumerate(names):
        device = {"device_id": f"mpc-walk-{i:02d}-0123456789abcdef", "secret": SECRET[:-2] + f"{i:02d}",
                  "name": f"{name} mini PC"}
        player = await hello(api, device)
        await api.patch(f"/api/mapping/players/{player['player_id']}", headers=headers,
                        json={"approved": True, "output_id": outputs[i]})
        players.append(player["player_id"])
    return show, outputs[:len(names)], players


async def patterns(api, headers, show_id: int) -> dict[int, str]:
    full = (await api.get(f"/api/mapping/shows/{show_id}", headers=headers)).json()
    return {o["id"]: o["test_pattern"] for o in full["outputs"]}


async def test_nothing_to_walk_without_a_mini_pc(api):
    headers = await login(api)
    refused = await api.post("/api/walkthrough/start", headers=headers, json={})
    assert refused.status_code == 400
    assert "Players" in refused.json()["detail"]


async def test_one_projector_at_a_time_then_everything_back(api):
    headers = await login(api)
    pid = await add_projector(api, headers, name="Garage")
    show, (left, right), _ = await mini_pcs(api, headers)
    await api.patch(f"/api/mapping/outputs/{right}", headers=headers, json={"projector_id": pid})
    # One was already on a test picture: it gets it back afterwards.
    await api.patch(f"/api/mapping/outputs/{right}", headers=headers, json={"test_pattern": "white"})

    started = await api.post("/api/walkthrough/start", headers=headers, json={})
    assert started.status_code == 200, started.text
    walk = started.json()
    assert walk["status"] == "walking" and walk["index"] == 0
    assert [s["output_id"] for s in walk["stops"]] == [left, right]
    assert walk["stops"][1]["projector_name"] == "Garage"
    assert await patterns(api, headers, show["id"]) == {left: "id", right: "black"}
    # Starting again picks the same walk up.
    assert (await api.post("/api/walkthrough/start", headers=headers, json={})).json()["id"] == walk["id"]

    white = (await api.post("/api/walkthrough/picture", headers=headers, json={"picture": "white"})).json()
    assert white["picture"] == "white"
    assert (await patterns(api, headers, show["id"]))[left] == "white"

    good = (await api.post("/api/walkthrough/answer", headers=headers,
                           json={"index": 0, "result": "good"})).json()
    assert good["index"] == 1 and good["picture"] == "id"
    assert await patterns(api, headers, show["id"]) == {left: "black", right: "id"}

    back = (await api.post("/api/walkthrough/go", headers=headers, json={"index": 0})).json()
    assert back["index"] == 0
    assert await patterns(api, headers, show["id"]) == {left: "id", right: "black"}
    # Answered already: the walk goes on to the one not checked yet.
    again = (await api.post("/api/walkthrough/answer", headers=headers,
                            json={"index": 0, "result": "good"})).json()
    assert again["index"] == 1

    done = (await api.post("/api/walkthrough/answer", headers=headers, json={
        "index": 1, "result": "wrong", "problems": ["blurry", "off_target"], "note": "left edge on the gutter"})).json()
    assert done["status"] == "done"
    assert done["stops"][1]["problems"] == ["blurry", "off_target"]
    assert await patterns(api, headers, show["id"]) == {left: "none", right: "white"}

    state = (await api.get("/api/walkthrough", headers=headers)).json()
    assert state["active"] is None
    assert state["last"]["id"] == walk["id"] and state["last"]["status"] == "done"

    events = (await api.get("/api/events", headers=headers)).json()
    messages = [e["message"] for e in (events["items"] if isinstance(events, dict) else events)]
    assert any("1 of 2 need a look: Garage (blurry, off target)" in m for m in messages), messages


async def test_a_playing_show_is_stopped_only_when_asked(api):
    headers = await login(api)
    show, (left, right), _ = await mini_pcs(api, headers)
    cue = await api.post(f"/api/mapping/shows/{show['id']}/cues", headers=headers, json={"name": "Opening"})
    assert cue.status_code in (200, 201), cue.text
    go = await api.post("/api/mapping/transport", headers=headers, json={"action": "goto", "show_id": show["id"], "cue": 0})
    assert go.status_code == 200, go.text

    refused = await api.post("/api/walkthrough/start", headers=headers, json={})
    assert refused.status_code == 409 and "show is playing" in refused.json()["detail"]
    started = await api.post("/api/walkthrough/start", headers=headers, json={"stop_show": True})
    assert started.status_code == 200, started.text
    transport = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert transport["status"] == "stopped"

    # The show starting again ends the walk and gives the house back.
    await api.post("/api/mapping/transport", headers=headers, json={"action": "goto", "show_id": show["id"], "cue": 0})
    for _ in range(50):
        if (await api.get("/api/walkthrough", headers=headers)).json()["active"] is None:
            break
        await asyncio.sleep(0.05)
    last = (await api.get("/api/walkthrough", headers=headers)).json()["last"]
    assert last["status"] == "stopped" and last["reason"] == "the show started"
    assert await patterns(api, headers, show["id"]) == {left: "none", right: "none"}


async def test_stopping_and_a_restart_put_the_pictures_back(api):
    import app.services.walkthrough as walk_module

    headers = await login(api)
    show, (left, right), _ = await mini_pcs(api, headers)

    await api.post("/api/walkthrough/start", headers=headers, json={})
    stopped = (await api.post("/api/walkthrough/stop", headers=headers)).json()
    assert stopped["active"] is None and stopped["last"]["reason"] == "stopped by admin"
    assert await patterns(api, headers, show["id"]) == {left: "none", right: "none"}

    # The server goes away mid-walk: the next start-up puts the pictures back.
    await api.post("/api/walkthrough/start", headers=headers, json={})
    walk_module.walkthrough.active = None
    await walk_module.walkthrough.restore()
    assert await patterns(api, headers, show["id"]) == {left: "none", right: "none"}
    last = (await api.get("/api/walkthrough", headers=headers)).json()["last"]
    assert last["reason"] == "the server restarted"
    # And only once.
    await walk_module.walkthrough.restore()
    assert (await api.get("/api/walkthrough", headers=headers)).json()["last"]["id"] == last["id"]


async def test_a_forgotten_walk_ends_by_itself(api):
    import app.services.walkthrough as walk_module

    headers = await login(api)
    show, (left, right), _ = await mini_pcs(api, headers)
    await api.post("/api/walkthrough/start", headers=headers, json={})
    walk_module.walkthrough._touched -= walk_module.IDLE_SECONDS + 1
    await walk_module.walkthrough._check(None)
    last = (await api.get("/api/walkthrough", headers=headers)).json()["last"]
    assert last["status"] == "stopped" and "nobody tapped" in last["reason"]
    assert await patterns(api, headers, show["id"]) == {left: "none", right: "none"}


async def test_a_viewer_can_look_but_not_walk(api):
    admin = await login(api)
    await api.post("/api/auth/users", headers=admin, json={
        "username": "viewer1", "password": "a-long-test-password", "role": "viewer"})
    viewer = await login(api, "viewer1", "a-long-test-password")
    await mini_pcs(api, admin)
    assert (await api.get("/api/walkthrough", headers=viewer)).status_code == 200
    assert (await api.post("/api/walkthrough/start", headers=viewer, json={})).status_code == 403
