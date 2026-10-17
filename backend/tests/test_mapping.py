"""Mapping media: library, show editing, geometry validation, transport."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

import asyncio

import pytest

from tests.test_api import add_projector, api, login  # noqa: F401 - fixture

PNG = (b"\x89PNG\r\n\x1a\n" + b"\x00" * 64)


async def upload(client, headers, name="facade.png", body=PNG, **params):
    response = await client.post("/api/mapping/media", headers=headers,
                                 params={"name": name, **params}, content=body)
    return response


async def make_show(client, headers, name="Town Hall") -> dict:
    response = await client.post("/api/mapping/shows", headers=headers,
                                 json={"name": name, "canvas_width": 7680,
                                       "canvas_height": 2160})
    assert response.status_code == 201, response.text
    return response.json()


async def make_cue(client, headers, show_id, **body) -> dict:
    response = await client.post(f"/api/mapping/shows/{show_id}/cues",
                                 headers=headers, json=body)
    assert response.status_code == 201, response.text
    return response.json()


# -- media library -------------------------------------------------------------


async def test_upload_list_serve_and_delete(api):
    headers = await login(api)
    response = await upload(api, headers, width=7680, height=2160)
    assert response.status_code == 201, response.text
    asset = response.json()
    assert asset["kind"] == "image"
    assert asset["size_bytes"] == len(PNG)
    assert asset["width"] == 7680

    listing = (await api.get("/api/mapping/media", headers=headers)).json()
    assert [a["id"] for a in listing] == [asset["id"]]

    token = headers["Authorization"].split()[1]
    served = await api.get(f"/api/mapping/media/{asset['id']}/file", params={"token": token})
    assert served.status_code == 200
    assert served.content == PNG
    assert served.headers["content-type"] == "image/png"

    ranged = await api.get(f"/api/mapping/media/{asset['id']}/file",
                           params={"token": token}, headers={"Range": "bytes=0-7"})
    assert ranged.status_code == 206
    assert ranged.content == PNG[:8]

    deleted = await api.delete(f"/api/mapping/media/{asset['id']}", headers=headers)
    assert deleted.status_code == 204
    gone = await api.get(f"/api/mapping/media/{asset['id']}/file", params={"token": token})
    assert gone.status_code == 404


async def test_media_file_requires_a_token(api):
    headers = await login(api)
    asset = (await upload(api, headers)).json()
    response = await api.get(f"/api/mapping/media/{asset['id']}/file")
    assert response.status_code == 401
    response = await api.get(f"/api/mapping/media/{asset['id']}/file",
                             params={"token": "not-a-token"})
    assert response.status_code == 401


async def test_unplayable_formats_are_refused(api):
    headers = await login(api)
    response = await upload(api, headers, name="master.prores")
    assert response.status_code == 415
    assert "H.264" in response.json()["detail"]


async def test_empty_upload_is_refused(api):
    headers = await login(api)
    response = await upload(api, headers, body=b"")
    assert response.status_code == 400


async def test_viewer_cannot_upload(api):
    headers = await login(api)
    created = await api.post("/api/auth/users", headers=headers,
                             json={"username": "watcher", "password": "watcher-password",
                                   "role": "viewer"})
    assert created.status_code == 201, created.text
    viewer = await login(api, "watcher", "watcher-password")
    assert (await upload(api, viewer)).status_code == 403


# -- shows and outputs -----------------------------------------------------------


async def test_show_with_outputs_and_geometry(api):
    headers = await login(api)
    show = await make_show(api, headers)
    projector_id = await add_projector(api, headers)

    left = await api.post(f"/api/mapping/shows/{show['id']}/outputs", headers=headers, json={
        "name": "Left", "projector_id": projector_id,
        "source": {"x": 0, "y": 0, "w": 0.55, "h": 1},
        "blend": {"right": {"width": 0.18}},
    })
    assert left.status_code == 201, left.text
    left = left.json()
    assert left["warp"]["corners"] == [[0, 0], [1, 0], [1, 1], [0, 1]]
    assert left["blend"]["right"]["width"] == 0.18
    assert left["blend"]["right"]["gamma"] == 2.2

    patched = await api.patch(f"/api/mapping/outputs/{left['id']}", headers=headers, json={
        "warp": {"corners": [[0.02, 0.01], [0.98, 0.0], [1.0, 1.0], [0.0, 0.97]],
                 "mesh": {"cols": 3, "rows": 3, "points": [[0, 0]] * 9}},
        "masks": [{"points": [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6]], "feather": 8}],
        "test_pattern": "grid",
    })
    assert patched.status_code == 200, patched.text
    assert patched.json()["warp"]["mesh"]["cols"] == 3
    assert patched.json()["masks"][0]["feather"] == 8

    await api.post(f"/api/mapping/shows/{show['id']}/outputs", headers=headers,
                   json={"name": "Right", "source": {"x": 0.45, "w": 0.55}})
    full = (await api.get(f"/api/mapping/shows/{show['id']}", headers=headers)).json()
    assert [o["name"] for o in full["outputs"]] == ["Left", "Right"]
    assert [o["position"] for o in full["outputs"]] == [0, 1]

    summary = (await api.get("/api/mapping/shows", headers=headers)).json()
    assert summary[0]["output_count"] == 2

    await api.delete(f"/api/mapping/outputs/{left['id']}", headers=headers)
    full = (await api.get(f"/api/mapping/shows/{show['id']}", headers=headers)).json()
    assert [(o["name"], o["position"]) for o in full["outputs"]] == [("Right", 0)]


@pytest.mark.parametrize("body", [
    {"warp": {"corners": [[0, 0], [1, 0], [1, 1]]}},
    {"warp": {"mesh": {"cols": 3, "rows": 3, "points": [[0, 0]] * 4}}},
    {"masks": [{"points": [[0, 0], [1, 1]]}]},
    {"blend": {"left": {"width": 0.9}}},
    {"test_pattern": "rainbow"},
    {"warp": {"corners": [[0, 0], [1, 0], [1, 1], [0, 99]]}},
])
async def test_bad_geometry_is_rejected(api, body):
    headers = await login(api)
    show = await make_show(api, headers)
    output = (await api.post(f"/api/mapping/shows/{show['id']}/outputs", headers=headers,
                             json={"name": "Only"})).json()
    response = await api.patch(f"/api/mapping/outputs/{output['id']}", headers=headers,
                               json=body)
    assert response.status_code == 422, response.text


async def test_output_rejects_unknown_projector(api):
    headers = await login(api)
    show = await make_show(api, headers)
    response = await api.post(f"/api/mapping/shows/{show['id']}/outputs", headers=headers,
                              json={"name": "Ghost", "projector_id": 999})
    assert response.status_code == 400


async def test_duplicate_show_name_conflicts(api):
    headers = await login(api)
    await make_show(api, headers)
    response = await api.post("/api/mapping/shows", headers=headers, json={"name": "Town Hall"})
    assert response.status_code == 409


async def test_cue_reorder_and_renumber(api):
    headers = await login(api)
    show = await make_show(api, headers)
    a = await make_cue(api, headers, show["id"], name="A")
    b = await make_cue(api, headers, show["id"], name="B")
    c = await make_cue(api, headers, show["id"], name="C")
    response = await api.put(f"/api/mapping/shows/{show['id']}/cue-order", headers=headers,
                             json={"cue_ids": [c["id"], a["id"], b["id"]]})
    assert response.status_code == 200, response.text
    assert [cue["name"] for cue in response.json()] == ["C", "A", "B"]

    bad = await api.put(f"/api/mapping/shows/{show['id']}/cue-order", headers=headers,
                        json={"cue_ids": [c["id"], a["id"]]})
    assert bad.status_code == 400

    await api.delete(f"/api/mapping/cues/{a['id']}", headers=headers)
    full = (await api.get(f"/api/mapping/shows/{show['id']}", headers=headers)).json()
    assert [(cue["name"], cue["position"]) for cue in full["cues"]] == [("C", 0), ("B", 1)]


# -- transport -----------------------------------------------------------------


async def transport(client, headers, **body):
    return await client.post("/api/mapping/transport", headers=headers, json=body)


async def test_go_steps_through_cues_with_crossfade(api):
    headers = await login(api)
    show = await make_show(api, headers)
    asset = (await upload(api, headers)).json()
    await make_cue(api, headers, show["id"], name="Intro", media_id=asset["id"])
    await make_cue(api, headers, show["id"], name="Main", fade_seconds=2)

    nothing = await transport(api, headers, action="go")
    assert nothing.status_code == 409  # no show loaded

    first = (await transport(api, headers, action="go", show_id=show["id"])).json()
    assert first["status"] == "playing"
    assert first["current"]["name"] == "Intro"
    assert first["current"]["media_id"] == asset["id"]
    assert first["previous"] is None

    second = (await transport(api, headers, action="go")).json()
    assert second["current"]["name"] == "Main"
    assert second["previous"]["name"] == "Intro"
    assert second["fade_started_at_ms"] is not None
    assert second["revision"] > first["revision"]

    end = await transport(api, headers, action="go")
    assert end.status_code == 409
    assert "last cue" in end.json()["detail"]

    back = (await transport(api, headers, action="goto", cue=0)).json()
    assert back["current"]["name"] == "Intro"

    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["current"]["name"] == "Intro"


async def test_pause_resume_keeps_position(api):
    headers = await login(api)
    show = await make_show(api, headers)
    await make_cue(api, headers, show["id"], name="Loop")
    playing = (await transport(api, headers, action="go", show_id=show["id"])).json()
    await asyncio.sleep(0.2)
    paused = (await transport(api, headers, action="pause")).json()
    assert paused["status"] == "paused"
    assert paused["paused_position"] >= 0.15
    await asyncio.sleep(0.2)
    resumed = (await transport(api, headers, action="resume")).json()
    assert resumed["status"] == "playing"
    # The clock restarted from the frozen position, not from wall time.
    shift = resumed["current"]["started_at_ms"] - playing["current"]["started_at_ms"]
    assert shift >= 150

    assert (await transport(api, headers, action="resume")).status_code == 409
    stopped = (await transport(api, headers, action="stop")).json()
    assert stopped["status"] == "stopped" and stopped["current"] is None
    assert stopped["show_id"] == show["id"]


async def test_follow_advances_by_itself(api):
    headers = await login(api)
    show = await make_show(api, headers)
    await make_cue(api, headers, show["id"], name="Short", follow_seconds=0.2)
    await make_cue(api, headers, show["id"], name="Next")
    await transport(api, headers, action="go", show_id=show["id"])
    await asyncio.sleep(0.5)
    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["current"]["name"] == "Next"


async def test_stop_cancels_follow(api):
    headers = await login(api)
    show = await make_show(api, headers)
    await make_cue(api, headers, show["id"], name="Short", follow_seconds=0.2)
    await make_cue(api, headers, show["id"], name="Next")
    await transport(api, headers, action="go", show_id=show["id"])
    await transport(api, headers, action="blackout")
    await asyncio.sleep(0.4)
    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["status"] == "blackout"
    assert state["current"] is None


async def test_media_on_air_cannot_be_deleted(api):
    headers = await login(api)
    show = await make_show(api, headers)
    asset = (await upload(api, headers)).json()
    await make_cue(api, headers, show["id"], media_id=asset["id"])
    await transport(api, headers, action="go", show_id=show["id"])
    response = await api.delete(f"/api/mapping/media/{asset['id']}", headers=headers)
    assert response.status_code == 409


async def test_deleting_the_live_show_stops_it(api):
    headers = await login(api)
    show = await make_show(api, headers)
    await make_cue(api, headers, show["id"])
    await transport(api, headers, action="go", show_id=show["id"])
    await api.delete(f"/api/mapping/shows/{show['id']}", headers=headers)
    state = (await api.get("/api/mapping/transport", headers=headers)).json()
    assert state["status"] == "stopped"


async def test_viewer_cannot_run_the_show(api):
    headers = await login(api)
    show = await make_show(api, headers)
    await make_cue(api, headers, show["id"])
    await api.post("/api/auth/users", headers=headers,
                   json={"username": "watcher", "password": "watcher-password",
                         "role": "viewer"})
    viewer = await login(api, "watcher", "watcher-password")
    response = await transport(api, viewer, action="go", show_id=show["id"])
    assert response.status_code == 403
    clock = await api.get("/api/mapping/clock", headers=viewer)
    assert clock.status_code == 200 and clock.json()["now_ms"] > 0


# -- players -------------------------------------------------------------------

DEVICE = {"device_id": "mini-pc-left-0001", "secret": "s" * 48, "name": "Left mini PC"}


async def test_player_pairing_flow(api):
    headers = await login(api)
    first = await api.post("/api/mapping/players/hello", json=DEVICE)
    assert first.status_code == 200, first.text
    first = first.json()
    assert first["status"] == "pending"
    assert first["access_token"] is None
    assert len(first["code"]) == 6

    # Polling again returns the same code; no second player is made.
    again = (await api.post("/api/mapping/players/hello", json=DEVICE)).json()
    assert again["code"] == first["code"]
    players = (await api.get("/api/mapping/players", headers=headers)).json()
    assert len(players) == 1 and players[0]["approved"] is False

    show = await make_show(api, headers)
    output = (await api.post(f"/api/mapping/shows/{show['id']}/outputs", headers=headers,
                             json={"name": "Left"})).json()
    approved = await api.patch(f"/api/mapping/players/{first['player_id']}", headers=headers,
                               json={"approved": True, "output_id": output["id"]})
    assert approved.status_code == 200, approved.text
    assert approved.json()["show_id"] == show["id"]

    claimed = (await api.post("/api/mapping/players/hello", json=DEVICE)).json()
    assert claimed["status"] == "approved"
    player_headers = {"Authorization": f"Bearer {claimed['access_token']}"}

    assignment = await api.post("/api/mapping/players/me", headers=player_headers,
                                json={"fps": 60, "drift_ms": 4, "cache": "on"})
    assert assignment.status_code == 200, assignment.text
    assert assignment.json() == {"player_id": first["player_id"], "name": "Left mini PC",
                                 "output_id": output["id"], "show_id": show["id"]}
    listed = (await api.get("/api/mapping/players", headers=headers)).json()[0]
    assert listed["online"] is True
    assert listed["report"]["fps"] == 60

    # A player can watch the show but not run it or change it.
    assert (await api.get(f"/api/mapping/shows/{show['id']}",
                          headers=player_headers)).status_code == 200
    assert (await transport(api, player_headers, action="go",
                            show_id=show["id"])).status_code == 403

    # Removing it revokes the token.
    await api.delete(f"/api/mapping/players/{first['player_id']}", headers=headers)
    revoked = await api.post("/api/mapping/players/me", headers=player_headers, json={})
    assert revoked.status_code == 401


async def test_player_secret_must_match(api):
    await api.post("/api/mapping/players/hello", json=DEVICE)
    impostor = await api.post("/api/mapping/players/hello",
                              json={**DEVICE, "secret": "x" * 48})
    assert impostor.status_code == 403


async def test_pending_player_gets_no_token(api):
    response = (await api.post("/api/mapping/players/hello", json=DEVICE)).json()
    assert response["access_token"] is None


async def test_only_admins_approve_players(api):
    headers = await login(api)
    player = (await api.post("/api/mapping/players/hello", json=DEVICE)).json()
    await api.post("/api/auth/users", headers=headers,
                   json={"username": "runner", "password": "runner-password",
                         "role": "operator"})
    operator = await login(api, "runner", "runner-password")
    response = await api.patch(f"/api/mapping/players/{player['player_id']}",
                               headers=operator, json={"approved": True})
    assert response.status_code == 403
