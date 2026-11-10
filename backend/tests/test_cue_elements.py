"""Elements on one cue only, or on every cue of a show."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

from tests.test_api import api, login  # noqa: F401 - fixture
from tests.test_mapping import make_cue, make_show

GHOSTS = {"id": "ghosts1", "type": "shapes", "style": "ghosts",
          "pins": [{"x": 0.3, "y": 0.4, "size": 1.2}]}
SLEIGH = {"id": "sleigh1", "type": "movers", "style": "sleigh", "pins": []}


async def _show(api, headers, show_id):
    return (await api.get(f"/api/mapping/shows/{show_id}", headers=headers)).json()


async def test_a_cue_keeps_elements_of_its_own(api):
    headers = await login(api)
    show = await make_show(api, headers)
    first = await make_cue(api, headers, show["id"], name="One")
    second = await make_cue(api, headers, show["id"], name="Two", elements=[GHOSTS])
    assert first["elements"] == []
    assert second["elements"][0]["style"] == "ghosts"
    assert second["elements"][0]["pins"][0]["x"] == 0.3

    changed = await api.patch(f"/api/mapping/cues/{first['id']}", headers=headers,
                              json={"elements": [SLEIGH]})
    assert changed.status_code == 200, changed.text
    assert [e["id"] for e in changed.json()["elements"]] == ["sleigh1"]
    # Changing something else leaves them be; null clears them.
    renamed = await api.patch(f"/api/mapping/cues/{first['id']}", headers=headers, json={"name": "Uno"})
    assert [e["id"] for e in renamed.json()["elements"]] == ["sleigh1"]
    cleared = await api.patch(f"/api/mapping/cues/{first['id']}", headers=headers, json={"elements": None})
    assert cleared.json()["elements"] == []

    too_many = [{**GHOSTS, "id": f"g{n}"} for n in range(13)]
    refused = await api.patch(f"/api/mapping/cues/{first['id']}", headers=headers,
                              json={"elements": too_many})
    assert refused.status_code == 422
    bad = await api.patch(f"/api/mapping/cues/{first['id']}", headers=headers,
                          json={"elements": [{**GHOSTS, "pins": [{"x": 2, "y": 0}]}]})
    assert bad.status_code == 422


async def test_a_show_puts_elements_on_every_cue(api):
    headers = await login(api)
    show = await make_show(api, headers)
    assert show["every_cue_elements"] == []
    await make_cue(api, headers, show["id"], name="One")

    saved = await api.patch(f"/api/mapping/shows/{show['id']}", headers=headers,
                            json={"every_cue_elements": [GHOSTS, SLEIGH]})
    assert saved.status_code == 200, saved.text
    assert [e["id"] for e in saved.json()["every_cue_elements"]] == ["ghosts1", "sleigh1"]
    # A cue added later has them too: they belong to the show, not to each cue.
    later = await make_cue(api, headers, show["id"], name="Two")
    assert later["elements"] == []
    again = await _show(api, headers, show["id"])
    assert [e["id"] for e in again["every_cue_elements"]] == ["ghosts1", "sleigh1"]

    renamed = await api.patch(f"/api/mapping/shows/{show['id']}", headers=headers, json={"name": "Renamed"})
    assert len(renamed.json()["every_cue_elements"]) == 2
    cleared = await api.patch(f"/api/mapping/shows/{show['id']}", headers=headers,
                              json={"every_cue_elements": None})
    assert cleared.json()["every_cue_elements"] == []


async def test_a_scene_group_leaves_cue_elements_in_place(api):
    headers = await login(api)
    show = await make_show(api, headers)
    scene = (await api.post("/api/mapping/scenes", headers=headers,
                            json={"name": "Trees", "layers": []})).json()
    cue = await make_cue(api, headers, show["id"], elements=[GHOSTS])
    await api.patch(f"/api/mapping/shows/{show['id']}", headers=headers,
                    json={"every_cue_elements": [SLEIGH]})
    group = (await api.post("/api/mapping/scene-groups", headers=headers, json={
        "show_id": show["id"], "name": "Night", "scene_id": scene["id"]})).json()
    used = await api.post(f"/api/mapping/scene-groups/{group['id']}/use", headers=headers)
    assert used.status_code == 200, used.text

    after = await _show(api, headers, show["id"])
    assert after["cues"][0]["id"] == cue["id"]
    assert after["cues"][0]["scene_id"] == scene["id"]
    assert [e["id"] for e in after["cues"][0]["elements"]] == ["ghosts1"]
    assert [e["id"] for e in after["every_cue_elements"]] == ["sleigh1"]


async def test_every_cue_elements_keep_one_clock_through_the_cues(api):
    headers = await login(api)
    show = await make_show(api, headers)
    for name in ("One", "Two"):
        await make_cue(api, headers, show["id"], name=name)

    async def transport(action):
        response = await api.post("/api/mapping/transport", headers=headers,
                                  json={"action": action, "show_id": show["id"]})
        assert response.status_code == 200, response.text
        return response.json()

    first = await transport("go")
    began = first["run_started_at_ms"]
    assert began == first["current"]["started_at_ms"]
    second = await transport("go")
    assert second["current"]["position"] == 1
    assert second["run_started_at_ms"] == began
    assert (await transport("pause"))["run_started_at_ms"] == began
    assert (await transport("resume"))["run_started_at_ms"] == began
    assert (await transport("stop"))["run_started_at_ms"] is None
    again = await transport("go")
    assert again["run_started_at_ms"] == again["current"]["started_at_ms"]
    await transport("stop")
