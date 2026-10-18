"""Saved maps: save a show's mapping, apply it to another show, move it as a file."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

from tests.test_api import add_projector, api, login  # noqa: F401 - fixture
from tests.test_mapping import make_cue, make_show
from tests.test_mapping_camera import CAMERA, PLAYER, VIEW, pair

WARP = {"corners": [[0.02, 0.01], [0.97, 0.03], [0.99, 0.98], [0.01, 0.96]],
        "mesh": {"cols": 2, "rows": 2, "points": [[0.0, 0.0], [0.01, 0.0], [0.0, 0.02], [0.0, 0.0]]}}
HOUSE = [{"id": "wall-1", "name": "Front wall", "kind": "wall",
          "points": [[0.1, 0.4], [0.9, 0.4], [0.9, 1.0], [0.1, 1.0]]},
         {"id": "roof-1", "name": "Roof", "kind": "roof",
          "points": [[0.1, 0.4], [0.5, 0.05], [0.9, 0.4]]}]


async def mapped_show(client, headers, name="Christmas") -> dict:
    """A show lined up with a house: two outputs, a warp, a mask, a calibration."""
    show = await make_show(client, headers, name)
    projector = await add_projector(client, headers)
    left = (await client.post(f"/api/mapping/shows/{show['id']}/outputs", headers=headers, json={
        "name": "Left", "projector_id": projector,
        "source": {"x": 0.0, "y": 0.0, "w": 0.55, "h": 1.0}, "warp": WARP,
        "masks": [{"name": "tree", "points": [[0.1, 0.1], [0.3, 0.1], [0.2, 0.4]]}],
        "blend": {"right": {"width": 0.1}},
    })).json()
    await client.post(f"/api/mapping/shows/{show['id']}/outputs", headers=headers, json={
        "name": "Right", "source": {"x": 0.45, "y": 0.0, "w": 0.55, "h": 1.0},
        "blend": {"left": {"width": 0.1}}, "color": {"brightness": 0.9},
    })
    _, camera = await pair(client, headers, CAMERA)
    grid = {"camera_width": 640, "camera_height": 480, "cols": 2, "rows": 2,
            "points": [[0.1, 0.1], [0.9, 0.1], None, [0.9, 0.9]]}
    stored = await client.put(f"/api/mapping/outputs/{left['id']}/calibration",
                              headers=camera, json=grid)
    assert stored.status_code == 200, stored.text
    patched = await client.patch(f"/api/mapping/shows/{show['id']}", headers=headers, json={
        "surfaces": HOUSE, "camera_view": {"camera_id": 1, "corners": VIEW},
    })
    assert patched.status_code == 200, patched.text
    return patched.json()


async def save(client, headers, show_id, name="Our house", **extra):
    return await client.post(f"/api/mapping/shows/{show_id}/save-map", headers=headers,
                             json={"name": name, **extra})


def geometry(output: dict) -> dict:
    keep = ("name", "projector_id", "width", "height", "source", "warp", "masks", "blend",
            "color", "enabled")
    return {k: output[k] for k in keep}


async def test_save_and_apply_to_a_new_show(api):
    headers = await login(api)
    original = await mapped_show(api, headers)
    response = await save(api, headers, original["id"])
    assert response.status_code == 201, response.text
    summary = response.json()
    assert summary["output_count"] == 2
    assert summary["surface_count"] == 2
    assert summary["calibrated_count"] == 1
    assert summary["output_names"] == ["Left", "Right"]
    assert summary["canvas_width"] == 7680

    listing = (await api.get("/api/mapping/maps", headers=headers)).json()
    assert [m["name"] for m in listing] == ["Our house"]

    fresh = (await api.post("/api/mapping/shows", headers=headers,
                            json={"name": "Halloween"})).json()
    applied = await api.post(f"/api/mapping/shows/{fresh['id']}/apply-map", headers=headers,
                             json={"map_id": summary["id"]})
    assert applied.status_code == 200, applied.text
    show = applied.json()["show"]
    assert (show["canvas_width"], show["canvas_height"]) == (7680, 2160)
    assert show["surfaces"] == original["surfaces"]
    assert show["camera_view"] == original["camera_view"]
    assert [geometry(o) for o in show["outputs"]] == [geometry(o) for o in original["outputs"]]
    assert show["outputs"][0]["calibration"]["coverage"] == 0.75
    assert show["outputs"][1]["calibration"] is None
    assert [o["position"] for o in show["outputs"]] == [0, 1]

    # The copy is independent: editing the new show leaves the original alone.
    await api.patch(f"/api/mapping/outputs/{show['outputs'][0]['id']}", headers=headers,
                    json={"source": {"x": 0.2, "y": 0.0, "w": 0.3, "h": 1.0}})
    again = (await api.get(f"/api/mapping/shows/{original['id']}", headers=headers)).json()
    assert again["outputs"][0]["source"] == original["outputs"][0]["source"]


async def test_apply_updates_existing_outputs_in_place_and_keeps_cues(api):
    headers = await login(api)
    original = await mapped_show(api, headers)
    map_id = (await save(api, headers, original["id"])).json()["id"]

    target = await make_show(api, headers, "Party")
    kept = (await api.post(f"/api/mapping/shows/{target['id']}/outputs", headers=headers,
                           json={"name": "Old one", "test_pattern": "grid"})).json()
    for name in ("Old two", "Old three"):
        await api.post(f"/api/mapping/shows/{target['id']}/outputs", headers=headers,
                       json={"name": name})
    await make_cue(api, headers, target["id"], name="Opening")

    show = (await api.post(f"/api/mapping/shows/{target['id']}/apply-map", headers=headers,
                           json={"map_id": map_id})).json()["show"]
    assert [o["name"] for o in show["outputs"]] == ["Left", "Right"]
    assert show["outputs"][0]["id"] == kept["id"]
    assert show["outputs"][0]["test_pattern"] == "none"
    assert [c["name"] for c in show["cues"]] == ["Opening"]


async def test_apply_only_the_house_parts(api):
    headers = await login(api)
    original = await mapped_show(api, headers)
    map_id = (await save(api, headers, original["id"])).json()["id"]
    target = await make_show(api, headers, "Party")
    own = (await api.post(f"/api/mapping/shows/{target['id']}/outputs", headers=headers,
                          json={"name": "Mine"})).json()
    show = (await api.post(f"/api/mapping/shows/{target['id']}/apply-map", headers=headers,
                           json={"map_id": map_id, "outputs": False})).json()["show"]
    assert show["surfaces"] == original["surfaces"]
    assert [o["id"] for o in show["outputs"]] == [own["id"]]
    assert show["outputs"][0]["name"] == "Mine"

    nothing = await api.post(f"/api/mapping/shows/{target['id']}/apply-map", headers=headers,
                             json={"map_id": map_id, "outputs": False, "surfaces": False})
    assert nothing.status_code == 400


async def test_mini_pcs_move_only_when_asked(api):
    headers = await login(api)
    original = await mapped_show(api, headers)
    player_id, _ = await pair(api, headers, PLAYER)
    right = original["outputs"][1]
    await api.patch(f"/api/mapping/players/{player_id}", headers=headers,
                    json={"output_id": right["id"]})
    map_id = (await save(api, headers, original["id"])).json()["id"]

    target = await make_show(api, headers, "Halloween")
    stay = (await api.post(f"/api/mapping/shows/{target['id']}/apply-map", headers=headers,
                           json={"map_id": map_id, "players": False})).json()
    assert stay["players_moved"] == 0
    players = (await api.get("/api/mapping/players", headers=headers)).json()
    assert next(p for p in players if p["id"] == player_id)["output_id"] == right["id"]

    moved = (await api.post(f"/api/mapping/shows/{target['id']}/apply-map", headers=headers,
                            json={"map_id": map_id, "players": True})).json()
    assert moved["players_moved"] == 1
    players = (await api.get("/api/mapping/players", headers=headers)).json()
    player = next(p for p in players if p["id"] == player_id)
    assert player["output_id"] == moved["show"]["outputs"][1]["id"]
    assert player["show_id"] == target["id"]


async def test_names_are_unique_unless_replacing(api):
    headers = await login(api)
    original = await mapped_show(api, headers)
    first = (await save(api, headers, original["id"])).json()
    clash = await save(api, headers, original["id"])
    assert clash.status_code == 409
    await api.post(f"/api/mapping/shows/{original['id']}/outputs", headers=headers,
                   json={"name": "Garage"})
    replaced = await save(api, headers, original["id"], replace=True)
    assert replaced.status_code == 201
    assert replaced.json()["id"] == first["id"]
    assert replaced.json()["output_count"] == 3

    empty = await make_show(api, headers, "Blank")
    nothing = await save(api, headers, empty["id"], name="Blank map")
    assert nothing.status_code == 400


async def test_download_and_load_a_map_file(api):
    headers = await login(api)
    original = await mapped_show(api, headers)
    map_id = (await save(api, headers, original["id"])).json()["id"]
    file = (await api.get(f"/api/mapping/maps/{map_id}", headers=headers)).json()
    assert file["format"] == "projector-control-map"
    assert file["version"] == 1
    assert len(file["outputs"]) == 2
    assert file["outputs"][0]["calibration"]["points"][2] is None

    loaded = await api.post("/api/mapping/maps", headers=headers, json=file)
    assert loaded.status_code == 201, loaded.text
    assert loaded.json()["name"] == "Our house (2)"
    assert loaded.json()["calibrated_count"] == 1

    # From another computer: its projector ids mean nothing here.
    foreign = {**file, "name": "Elsewhere",
               "outputs": [{**file["outputs"][0], "projector_id": 4242, "player_ids": [77]}]}
    elsewhere = (await api.post("/api/mapping/maps", headers=headers, json=foreign)).json()
    target = await make_show(api, headers, "Abroad")
    result = (await api.post(f"/api/mapping/shows/{target['id']}/apply-map", headers=headers,
                             json={"map_id": elsewhere["id"], "players": True})).json()
    assert result["show"]["outputs"][0]["projector_id"] is None
    assert result["players_moved"] == 0

    bad = await api.post("/api/mapping/maps", headers=headers,
                         json={"format": "something-else", "name": "x"})
    assert bad.status_code == 422
    broken = await api.post("/api/mapping/maps", headers=headers,
                            json={**file, "outputs": [{**file["outputs"][0],
                                                       "warp": {"corners": [[0, 0]]}}]})
    assert broken.status_code == 422


async def test_rename_delete_and_permissions(api):
    headers = await login(api)
    original = await mapped_show(api, headers)
    map_id = (await save(api, headers, original["id"])).json()["id"]
    renamed = await api.patch(f"/api/mapping/maps/{map_id}", headers=headers,
                              json={"name": "Front of the house"})
    assert renamed.json()["name"] == "Front of the house"

    await api.post("/api/auth/users", headers=headers,
                   json={"username": "watcher", "password": "watcher-password", "role": "viewer"})
    viewer = await login(api, "watcher", "watcher-password")
    assert (await api.get("/api/mapping/maps", headers=viewer)).status_code == 200
    assert (await save(api, viewer, original["id"], name="Nope")).status_code == 403
    assert (await api.delete(f"/api/mapping/maps/{map_id}", headers=viewer)).status_code == 403

    assert (await api.delete(f"/api/mapping/maps/{map_id}", headers=headers)).status_code == 204
    assert (await api.get(f"/api/mapping/maps/{map_id}", headers=headers)).status_code == 404
    # Deleting a map leaves the show it came from alone.
    show = (await api.get(f"/api/mapping/shows/{original['id']}", headers=headers)).json()
    assert len(show["outputs"]) == 2


async def test_a_saved_map_always_downloads_and_applies(api):
    """Regression: a show with more outputs, or more mini PCs on one output, than a
    map file holds saved fine, then its download and apply failed with a 500."""
    from app.schemas.mapping_maps import MAX_MAP_OUTPUTS

    headers = await login(api)
    show = await make_show(api, headers, "Stadium")
    url = f"/api/mapping/shows/{show['id']}/outputs"
    for n in range(MAX_MAP_OUTPUTS + 1):
        await api.post(url, headers=headers, json={"name": f"P{n}"})
    too_many = await save(api, headers, show["id"], name="Stadium")
    assert too_many.status_code == 400, too_many.text
    assert str(MAX_MAP_OUTPUTS) in too_many.json()["detail"]
    assert (await api.get("/api/mapping/maps", headers=headers)).json() == []

    small = await make_show(api, headers, "Shed")
    output = (await api.post(f"/api/mapping/shows/{small['id']}/outputs", headers=headers,
                             json={"name": "Only"})).json()
    for n in range(18):
        hello = (await api.post("/api/mapping/players/hello", json={
            "device_id": f"mini-pc-many-{n:04d}", "secret": "m" * 48, "name": f"PC {n}"})).json()
        await api.patch(f"/api/mapping/players/{hello['player_id']}", headers=headers,
                        json={"approved": True, "output_id": output["id"]})
    saved = await save(api, headers, small["id"], name="Shed")
    assert saved.status_code == 201, saved.text
    assert (await api.get(f"/api/mapping/maps/{saved.json()['id']}", headers=headers)).status_code == 200
    applied = await api.post(f"/api/mapping/shows/{small['id']}/apply-map", headers=headers,
                             json={"map_id": saved.json()["id"], "players": True})
    assert applied.status_code == 200, applied.text
