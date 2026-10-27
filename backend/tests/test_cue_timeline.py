"""A cue's timeline from the show designer, and the media it plays."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

import asyncio

from tests.test_api import api, login  # noqa: F401 - fixture
from tests.test_mapping import PNG, make_cue, make_show, upload

GHOSTS = {"id": "ghosts1", "type": "shapes", "style": "ghosts",
          "pins": [{"x": 0.3, "y": 0.4, "size": 1.2}]}


async def _media(api, headers, name, **params):
    response = await upload(api, headers, name=name, body=PNG, **params)
    assert response.status_code == 201, response.text
    return response.json()


async def test_every_common_kind_of_file_uploads(api):
    headers = await login(api)
    for name, kind in [("spooky.gif", "image"), ("moon.avif", "image"), ("old.bmp", "image"),
                       ("clip.ogv", "video"), ("howl.mp3", "audio"), ("thunder.wav", "audio"),
                       ("song.m4a", "audio"), ("bells.ogg", "audio"), ("organ.flac", "audio")]:
        asset = await _media(api, headers, name, width=640, height=480, duration=12.5)
        assert asset["kind"] == kind, name
        if kind == "audio":
            # A sound has a length but no picture size.
            assert asset["width"] is None and asset["duration"] == 12.5
        if kind == "image":
            assert asset["duration"] is None
    refused = await upload(api, headers, name="show.prores")
    assert refused.status_code == 415


async def test_a_cue_keeps_a_timeline(api):
    headers = await login(api)
    show = await make_show(api, headers)
    picture = await _media(api, headers, "bats.gif", width=400, height=300)
    sound = await _media(api, headers, "howl.mp3", duration=4)
    cue = await make_cue(api, headers, show["id"], name="Story")
    assert cue["timeline"] is None

    timeline = {
        "length": 20, "end": "next",
        "clips": [
            {"id": "bats", "kind": "media", "media_id": picture["id"], "track": 1, "start": 2,
             "length": 6, "enter": "left", "enter_seconds": 1.5,
             "pin": {"x": 0.5, "y": 0.4, "size": 0.3},
             "keys": [{"t": 4, "pins": [{"x": 0.8, "y": 0.2, "size": 0.2}]},
                      {"t": 0, "pins": [{"x": 0.2, "y": 0.5, "size": 0.3}]}]},
            {"id": "ghost", "kind": "element", "layer": GHOSTS, "start": 5, "length": 10, "exit": "grow"},
            {"id": "howl", "kind": "sound", "media_id": sound["id"], "start": 0, "length": 4, "volume": 0.6},
        ],
    }
    saved = await api.patch(f"/api/mapping/cues/{cue['id']}", headers=headers, json={"timeline": timeline})
    assert saved.status_code == 200, saved.text
    body = saved.json()["timeline"]
    assert [c["id"] for c in body["clips"]] == ["bats", "ghost", "howl"]
    # Moves are kept in order of time.
    assert [k["t"] for k in body["clips"][0]["keys"]] == [0, 4]
    assert body["clips"][1]["layer"]["style"] == "ghosts"

    # Changing something else leaves it be; null takes it off.
    renamed = await api.patch(f"/api/mapping/cues/{cue['id']}", headers=headers, json={"name": "Tale"})
    assert len(renamed.json()["timeline"]["clips"]) == 3
    shown = (await api.get(f"/api/mapping/shows/{show['id']}", headers=headers)).json()
    assert shown["cues"][0]["timeline"]["end"] == "next"

    # A sound is not a picture, and a picture is not a sound.
    wrong = {**timeline, "clips": [{"id": "x", "kind": "sound", "media_id": picture["id"]}]}
    refused = await api.patch(f"/api/mapping/cues/{cue['id']}", headers=headers, json={"timeline": wrong})
    assert refused.status_code == 400
    missing = {**timeline, "clips": [{"id": "x", "kind": "media", "media_id": 9999}]}
    refused = await api.patch(f"/api/mapping/cues/{cue['id']}", headers=headers, json={"timeline": missing})
    assert refused.status_code == 400
    empty = {**timeline, "clips": [{"id": "x", "kind": "element"}]}
    refused = await api.patch(f"/api/mapping/cues/{cue['id']}", headers=headers, json={"timeline": empty})
    assert refused.status_code == 422
    # A sound cannot be a cue's picture.
    refused = await api.patch(f"/api/mapping/cues/{cue['id']}", headers=headers, json={"media_id": sound["id"]})
    assert refused.status_code == 400

    # Deleting a file takes its clips off the timeline.
    deleted = await api.delete(f"/api/mapping/media/{sound['id']}", headers=headers)
    assert deleted.status_code == 204
    shown = (await api.get(f"/api/mapping/shows/{show['id']}", headers=headers)).json()
    assert [c["id"] for c in shown["cues"][0]["timeline"]["clips"]] == ["bats", "ghost"]

    cleared = await api.patch(f"/api/mapping/cues/{cue['id']}", headers=headers, json={"timeline": None})
    assert cleared.json()["timeline"] is None


async def test_a_timeline_set_to_go_on_moves_to_the_next_cue(api):
    headers = await login(api)
    show = await make_show(api, headers)
    await make_cue(api, headers, show["id"], name="Story",
                   timeline={"length": 1, "end": "next", "clips": []})
    await make_cue(api, headers, show["id"], name="Next")
    await api.post("/api/mapping/transport", headers=headers, json={"action": "go", "show_id": show["id"]})
    await asyncio.sleep(1.3)
    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["current"]["name"] == "Next"


async def test_a_looping_timeline_stays(api):
    headers = await login(api)
    show = await make_show(api, headers)
    await make_cue(api, headers, show["id"], name="Story",
                   timeline={"length": 1, "end": "loop", "clips": []})
    await make_cue(api, headers, show["id"], name="Next")
    await api.post("/api/mapping/transport", headers=headers, json={"action": "go", "show_id": show["id"]})
    await asyncio.sleep(1.3)
    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["current"]["name"] == "Story"
