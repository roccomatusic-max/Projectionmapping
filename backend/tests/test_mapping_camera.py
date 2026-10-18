"""Cameras: pairing, calibration from decoded patterns, people tracking."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

import asyncio
import math

import pytest

from app.core.events import bus
from app.services.calibration import (
    CalibrationError,
    CanvasOnCamera,
    apply,
    fit_canvas,
    fit_homography,
    invert,
    light_on_canvas,
    solve_warp,
    square_to_quad,
)
from app.services.mapping import now_ms
from tests.test_api import api, login  # noqa: F401 - fixture
from tests.test_mapping import PNG, make_cue, make_show, transport, upload

CAMERA = {"device_id": "camera-front-0001", "secret": "c" * 48, "name": "Front camera",
          "kind": "camera"}
PLAYER = {"device_id": "mini-pc-left-0001", "secret": "s" * 48, "name": "Left mini PC"}

#: Where the canvas sits in the camera picture in these tests.
VIEW = [(0.12, 0.2), (0.9, 0.16), (0.86, 0.82), (0.1, 0.78)]


async def pair(client, headers, device) -> tuple[int, dict]:
    hello = (await client.post("/api/mapping/players/hello", json=device)).json()
    response = await client.patch(f"/api/mapping/players/{hello['player_id']}",
                                  headers=headers, json={"approved": True})
    assert response.status_code == 200, response.text
    claimed = (await client.post("/api/mapping/players/hello", json=device)).json()
    token = {"Authorization": f"Bearer {claimed['access_token']}"}
    # A heartbeat makes it online.
    beat = await client.post("/api/mapping/players/me", headers=token,
                             json={"camera": "test", "depth": True})
    assert beat.status_code == 200, beat.text
    return hello["player_id"], token


async def next_message(queue, kind: str) -> dict:
    while True:
        message = await asyncio.wait_for(queue.get(), timeout=2)
        if message.type == kind:
            return message.payload


def decoded_grid(source: dict, target: list[tuple[float, float]], *, cols=64, rows=48,
                 bulge: float = 0.0) -> dict:
    """What a camera would decode: camera cell → projector position.

    The projector shows the output's slice of the canvas through ``target``
    (a corner pin), plus an optional bulge, as a curved wall would add.
    """
    to_canvas = invert(square_to_quad(VIEW))
    pin = square_to_quad(target)
    points = []
    for index in range(cols * rows):
        q = ((index % cols + 0.5) / cols, (index // cols + 0.5) / rows)
        cx, cy = apply(to_canvas, *q)
        u = (cx - source["x"]) / source["w"]
        v = (cy - source["y"]) / source["h"]
        p = apply(pin, u + bulge * math.sin(math.pi * v), v)
        points.append(list(p) if 0 <= p[0] <= 1 and 0 <= p[1] <= 1 else None)
    return {"camera_width": 1280, "camera_height": 720, "cols": cols, "rows": rows,
            "points": points}


# -- the maths -------------------------------------------------------------------


def test_fit_homography_recovers_a_known_one():
    truth = square_to_quad([(0.1, 0.05), (0.95, 0.12), (0.9, 0.97), (0.02, 0.88)])
    src = [(x / 7, y / 5) for x in range(8) for y in range(6)]
    fitted = fit_homography(src, [apply(truth, *p) for p in src])
    for p in [(0.3, 0.4), (1.2, -0.1), (0.5, 0.5)]:
        a, b = apply(fitted, *p), apply(truth, *p)
        assert math.dist(a, b) < 1e-9


def test_fit_homography_needs_spread():
    with pytest.raises(CalibrationError):
        fit_homography([(0.5, 0.5)] * 6, [(0.2, 0.2)] * 6)


def test_flat_wall_gives_the_corner_pin_and_no_mesh():
    source = {"x": 0.0, "y": 0.0, "w": 0.55, "h": 1.0}
    target = [(0.06, 0.04), (0.96, 0.1), (0.92, 0.95), (0.03, 0.9)]
    warp, stats = solve_warp(source, VIEW, decoded_grid(source, target), mesh=9)
    for got, want in zip(warp["corners"], target, strict=True):
        assert math.dist(got, want) < 2e-3
    assert warp["mesh"] is None or max(
        abs(v) for point in warp["mesh"]["points"] for v in point) < 2e-3
    assert stats["measured"] > 0.8
    assert stats["residual_px"] < 1


def test_curved_wall_gets_a_mesh_that_hits_the_light():
    source = {"x": 0.45, "y": 0.0, "w": 0.55, "h": 1.0}
    target = [(0.05, 0.05), (0.95, 0.05), (0.95, 0.95), (0.05, 0.95)]
    bulge = 0.04
    warp, _ = solve_warp(source, VIEW, decoded_grid(source, target, bulge=bulge), mesh=9)
    assert warp["mesh"] is not None
    pin = square_to_quad(warp["corners"])
    truth = square_to_quad(target)
    worst = 0.0
    for index, (dx, dy) in enumerate(warp["mesh"]["points"]):
        u, v = (index % 9) / 8, (index // 9) / 8
        got = apply(pin, u + dx, v + dy)
        want = apply(truth, u + bulge * math.sin(math.pi * v), v)
        worst = max(worst, math.dist(got, want))
    # Bilinear lookup between 64×48 camera cells: well under a pixel at 1920.
    assert worst < 5e-4


def test_too_little_light_is_an_error():
    grid = {"cols": 8, "rows": 8, "points": [None] * 60 + [[0.5, 0.5]] * 4}
    with pytest.raises(CalibrationError):
        solve_warp({"x": 0, "y": 0, "w": 1, "h": 1}, VIEW, grid)


def even_grid(corners, cols: int, rows: int) -> list[list[float]]:
    """A hand grid exactly where the corners alone put it."""
    flat = square_to_quad(corners)
    return [list(apply(flat, c / (cols - 1), r / (rows - 1))) for r in range(rows) for c in range(cols)]


def test_hand_grid_where_the_corners_put_it_changes_nothing():
    mesh = {"cols": 3, "rows": 3, "points": even_grid(VIEW, 3, 3)}
    placed = CanvasOnCamera(VIEW, mesh)
    flat = CanvasOnCamera(VIEW)
    for u, v in [(0, 0), (0.3, 0.7), (0.5, 0.5), (1, 1), (0.9, 0.2)]:
        assert math.dist(placed(u, v), flat(u, v)) < 1e-12


def test_a_point_dragged_by_hand_is_where_that_canvas_point_lands():
    points = even_grid(VIEW, 3, 3)
    points[4] = [points[4][0] + 0.03, points[4][1] - 0.02]  # the middle, nudged
    placed = CanvasOnCamera(VIEW, {"cols": 3, "rows": 3, "points": points})
    assert math.dist(placed(0.5, 0.5), points[4]) < 1e-12
    # Corners stay put, and the nudge fades towards them.
    assert math.dist(placed(0, 0), VIEW[0]) < 1e-12
    halfway = math.dist(placed(0.25, 0.25), CanvasOnCamera(VIEW)(0.25, 0.25))
    assert 0 < halfway < math.dist(points[4], CanvasOnCamera(VIEW)(0.5, 0.5))


def test_the_hand_grid_moves_the_picture_on_the_projector():
    source = {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}
    target = [(0.06, 0.04), (0.96, 0.1), (0.92, 0.95), (0.03, 0.9)]
    grid = decoded_grid(source, target)
    points = even_grid(VIEW, 3, 3)
    plain, _ = solve_warp(source, VIEW, grid, mesh=9,
                          camera_mesh={"cols": 3, "rows": 3, "points": points})
    assert plain["mesh"] is None or max(abs(v) for p in plain["mesh"]["points"] for v in p) < 2e-3
    points[4] = [points[4][0] + 0.02, points[4][1]]
    moved, _ = solve_warp(source, VIEW, grid, mesh=9,
                          camera_mesh={"cols": 3, "rows": 3, "points": points})
    assert moved["mesh"] is not None
    middle = moved["mesh"]["points"][4 * 9 + 4]
    # Moved right on the photo, so right on the projector too.
    assert middle[0] > 0.01


def test_fit_canvas_sits_inside_the_light_and_keeps_the_canvas_shape():
    sources = [{"x": 0.0, "y": 0.0, "w": 0.55, "h": 1.0}, {"x": 0.45, "y": 0.0, "w": 0.55, "h": 1.0}]
    target = [(0.06, 0.04), (0.96, 0.1), (0.92, 0.95), (0.03, 0.9)]
    grids = [decoded_grid(s, target) for s in sources]
    corners = fit_canvas(grids, 16 / 9)
    (x0, y0), (x1, _), (_, y1), _ = corners
    # 16:9 as the camera sees it (1280 × 720 photo).
    assert abs((x1 - x0) * 1280 / ((y1 - y0) * 720) - 16 / 9) < 0.12
    # Every corner is lit by one projector or the other.
    for x, y in corners:
        inside = [(x + dx, y + dy) for dx in (0.01, -0.01) for dy in (0.01, -0.01)]
        assert any(
            any(g["points"][min(int(py * 48), 47) * 64 + min(int(px * 64), 63)] is not None for g in grids)
            for px, py in inside
        )
    # And it is a good share of the lit area, not a postage stamp.
    lit = sum(any(g["points"][i] is not None for g in grids) for i in range(64 * 48))
    assert (x1 - x0) * (y1 - y0) * 64 * 48 > 0.5 * lit


def test_fit_canvas_needs_light():
    with pytest.raises(CalibrationError):
        fit_canvas([], 16 / 9)
    with pytest.raises(CalibrationError):
        fit_canvas([{"cols": 4, "rows": 4, "camera_width": 640, "camera_height": 480,
                     "points": [None] * 16}], 16 / 9)


def test_light_on_canvas_is_the_slice_the_projector_covers():
    source = {"x": 0.45, "y": 0.0, "w": 0.55, "h": 1.0}
    grid = decoded_grid(source, [(0, 0), (1, 0), (1, 1), (0, 1)])
    slice_ = light_on_canvas(grid, VIEW)
    assert abs(slice_["x"] - 0.45) < 0.03
    assert abs(slice_["x"] + slice_["w"] - 1.0) < 0.03
    assert slice_["y"] < 0.03 and slice_["h"] > 0.95


# -- pairing ---------------------------------------------------------------------


async def test_camera_pairs_like_a_player(api):
    headers = await login(api)
    camera_id, _ = await pair(api, headers, CAMERA)
    listed = {p["id"]: p for p in (await api.get("/api/mapping/players", headers=headers)).json()}
    assert listed[camera_id]["kind"] == "camera"
    assert listed[camera_id]["online"] is True
    assert listed[camera_id]["report"]["depth"] is True

    show = await make_show(api, headers)
    output = (await api.post(f"/api/mapping/shows/{show['id']}/outputs", headers=headers,
                             json={"name": "Left"})).json()
    refused = await api.patch(f"/api/mapping/players/{camera_id}", headers=headers,
                              json={"output_id": output["id"]})
    assert refused.status_code == 400


# -- calibration -----------------------------------------------------------------


async def test_calibration_round_trip(api):
    headers = await login(api)
    camera_id, camera = await pair(api, headers, CAMERA)
    _, player = await pair(api, headers, PLAYER)
    show = await make_show(api, headers)
    sources = [{"x": 0.0, "y": 0.0, "w": 0.55, "h": 1.0}, {"x": 0.45, "y": 0.0, "w": 0.55, "h": 1.0}]
    outputs = []
    for name, source in zip(("Left", "Right"), sources, strict=True):
        outputs.append((await api.post(f"/api/mapping/shows/{show['id']}/outputs",
                                       headers=headers,
                                       json={"name": name, "source": source})).json())
    left = outputs[0]

    queue = await bus.subscribe()
    try:
        asked = await api.post(f"/api/mapping/outputs/{left['id']}/calibrate", headers=headers,
                               json={"camera_id": camera_id})
        assert asked.status_code == 202, asked.text
        request = await next_message(queue, "mapping_calibrate")
        assert request == {"camera_id": camera_id, "output_id": left["id"],
                           "show_id": show["id"], "name": "Left",
                           "width": 1920, "height": 1200}

        step = {"output_id": left["id"], "step": 3, "steps": 40,
                "pattern": {"kind": "gray", "axis": "y", "bit": 7, "inverse": True}}
        relayed = await api.post("/api/mapping/calibration/step", headers=camera, json=step)
        assert relayed.status_code == 204, relayed.text
        pattern = await next_message(queue, "mapping_calib_pattern")
        assert pattern["show_id"] == show["id"]
        assert pattern["pattern"] == step["pattern"]
        assert pattern["status"] == "running"
    finally:
        await bus.unsubscribe(queue)

    # Only the camera itself drives patterns and uploads results.
    for who in (headers, player):
        assert (await api.post("/api/mapping/calibration/step", headers=who,
                               json=step)).status_code == 403

    target = [(0.06, 0.04), (0.96, 0.1), (0.92, 0.95), (0.03, 0.9)]
    stored = await api.put(f"/api/mapping/outputs/{left['id']}/calibration", headers=camera,
                           json=decoded_grid(sources[0], target))
    assert stored.status_code == 200, stored.text
    summary = stored.json()["calibration"]
    assert summary["camera_id"] == camera_id
    assert 0.2 < summary["coverage"] < 0.8
    full = (await api.get(f"/api/mapping/outputs/{left['id']}/calibration",
                          headers=headers)).json()
    assert len(full["points"]) == 64 * 48

    # Applying needs the canvas marked on the camera picture.
    blocked = await api.post(f"/api/mapping/shows/{show['id']}/apply-calibration",
                             headers=headers, json={})
    assert blocked.status_code == 409
    marked = await api.patch(f"/api/mapping/shows/{show['id']}", headers=headers,
                             json={"camera_view": {"camera_id": camera_id, "corners": VIEW}})
    assert marked.status_code == 200, marked.text
    assert marked.json()["camera_view"]["camera_id"] == camera_id

    applied = await api.post(f"/api/mapping/shows/{show['id']}/apply-calibration",
                             headers=headers, json={"mesh": 9})
    assert applied.status_code == 200, applied.text
    results = {r["name"]: r for r in applied.json()}
    assert results["Left"]["applied"] is True
    assert results["Right"]["applied"] is False
    assert "Not calibrated" in results["Right"]["reason"]

    again = (await api.get(f"/api/mapping/shows/{show['id']}", headers=headers)).json()
    warp = next(o for o in again["outputs"] if o["id"] == left["id"])["warp"]
    for got, want in zip(warp["corners"], target, strict=True):
        assert math.dist(got, want) < 2e-3

    cleared = await api.delete(f"/api/mapping/outputs/{left['id']}/calibration", headers=headers)
    assert cleared.status_code == 204
    gone = await api.get(f"/api/mapping/outputs/{left['id']}/calibration", headers=headers)
    assert gone.status_code == 404


async def test_calibrate_refuses_an_offline_or_unknown_camera(api):
    headers = await login(api)
    show = await make_show(api, headers)
    output = (await api.post(f"/api/mapping/shows/{show['id']}/outputs", headers=headers,
                             json={"name": "Left"})).json()
    hello = (await api.post("/api/mapping/players/hello", json=CAMERA)).json()
    pending = await api.post(f"/api/mapping/outputs/{output['id']}/calibrate", headers=headers,
                             json={"camera_id": hello["player_id"]})
    assert pending.status_code == 409
    unknown = await api.post(f"/api/mapping/outputs/{output['id']}/calibrate", headers=headers,
                             json={"camera_id": 999})
    assert unknown.status_code == 404


async def test_bad_calibration_grids_are_rejected(api):
    headers = await login(api)
    _, camera = await pair(api, headers, CAMERA)
    show = await make_show(api, headers)
    output = (await api.post(f"/api/mapping/shows/{show['id']}/outputs", headers=headers,
                             json={"name": "Left"})).json()
    url = f"/api/mapping/outputs/{output['id']}/calibration"
    base = {"camera_width": 640, "camera_height": 480, "cols": 4, "rows": 4}
    short = await api.put(url, headers=camera, json={**base, "points": [[0.5, 0.5]] * 15})
    assert short.status_code == 422
    wild = await api.put(url, headers=camera, json={**base, "points": [[9, 9]] * 16})
    assert wild.status_code == 422


# -- photos and commands ---------------------------------------------------------


async def test_snapshot_upload_and_fetch(api):
    headers = await login(api)
    camera_id, camera = await pair(api, headers, CAMERA)
    missing = await api.get(f"/api/mapping/cameras/{camera_id}/snapshot", headers=headers)
    assert missing.status_code == 404
    jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 128
    sent = await api.put("/api/mapping/cameras/me/snapshot", content=jpeg,
                         headers={**camera, "Content-Type": "image/jpeg"})
    assert sent.status_code == 204, sent.text
    token = headers["Authorization"][7:]
    fetched = await api.get(f"/api/mapping/cameras/{camera_id}/snapshot",
                            params={"token": token})
    assert fetched.status_code == 200
    assert fetched.content == jpeg
    wrong = await api.put("/api/mapping/cameras/me/snapshot", content=b"GIF89a",
                          headers={**camera, "Content-Type": "image/gif"})
    assert wrong.status_code == 415
    not_a_camera = await api.put("/api/mapping/cameras/me/snapshot", content=jpeg,
                                 headers={**headers, "Content-Type": "image/jpeg"})
    assert not_a_camera.status_code == 403


async def test_camera_command_reaches_the_camera(api):
    headers = await login(api)
    camera_id, _ = await pair(api, headers, CAMERA)
    queue = await bus.subscribe()
    try:
        sent = await api.post(f"/api/mapping/cameras/{camera_id}/command", headers=headers,
                              json={"command": "background"})
        assert sent.status_code == 204, sent.text
        assert await next_message(queue, "mapping_camera_command") == {
            "camera_id": camera_id, "command": "background"}
    finally:
        await bus.unsubscribe(queue)


# -- people ----------------------------------------------------------------------


async def test_people_are_mapped_onto_the_live_canvas(api):
    headers = await login(api)
    camera_id, camera = await pair(api, headers, CAMERA)
    show = await make_show(api, headers)
    media = (await upload(api, headers, body=PNG)).json()
    await make_cue(api, headers, show["id"], media_id=media["id"], interaction="spotlight")
    person = {"id": 4, "x": 0.5, "y": 0.5, "z": 3.2, "size": 0.1}

    queue = await bus.subscribe()
    try:
        # Nothing live: camera positions only.
        await api.post("/api/mapping/cameras/me/people", headers=camera,
                       json={"people": [person]})
        idle = await next_message(queue, "mapping_people")
        assert idle["show_id"] is None
        assert idle["people"][0]["x"] is None and idle["people"][0]["cx"] == 0.5

        await api.patch(f"/api/mapping/shows/{show['id']}", headers=headers,
                        json={"camera_view": {"camera_id": camera_id, "corners": VIEW}})
        started = await transport(api, headers, action="go", show_id=show["id"])
        assert started.json()["current"]["interaction"] == "spotlight"
        await api.post("/api/mapping/cameras/me/people", headers=camera,
                       json={"people": [person]})
        live = await next_message(queue, "mapping_people")
        assert live["show_id"] == show["id"]
        want = apply(invert(square_to_quad(VIEW)), 0.5, 0.5)
        got = (live["people"][0]["x"], live["people"][0]["y"])
        assert math.dist(got, want) < 1e-4
        assert live["people"][0]["z"] == 3.2
    finally:
        await bus.unsubscribe(queue)

    too_many = await api.post("/api/mapping/cameras/me/people", headers=camera,
                              json={"people": [person] * 17})
    assert too_many.status_code == 422
    not_a_camera = await api.post("/api/mapping/cameras/me/people", headers=headers,
                                  json={"people": []})
    assert not_a_camera.status_code == 403


async def test_fit_canvas_places_the_canvas_and_slices_the_outputs(api):
    headers = await login(api)
    camera_id, camera = await pair(api, headers, CAMERA)
    show = await make_show(api, headers)
    refused = await api.post(f"/api/mapping/shows/{show['id']}/fit-canvas", headers=headers,
                             json={"camera_id": camera_id})
    assert refused.status_code == 409

    sources = [{"x": 0.0, "y": 0.0, "w": 0.55, "h": 1.0}, {"x": 0.45, "y": 0.0, "w": 0.55, "h": 1.0}]
    target = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    outputs = []
    for name, source in zip(("Left", "Right"), sources, strict=True):
        output = (await api.post(f"/api/mapping/shows/{show['id']}/outputs", headers=headers,
                                 json={"name": name})).json()  # default slice: the whole canvas
        stored = await api.put(f"/api/mapping/outputs/{output['id']}/calibration", headers=camera,
                               json=decoded_grid(source, target))
        assert stored.status_code == 200, stored.text
        outputs.append(output)

    fitted = await api.post(f"/api/mapping/shows/{show['id']}/fit-canvas", headers=headers,
                            json={"camera_id": camera_id})
    assert fitted.status_code == 200, fitted.text
    body = fitted.json()
    assert body["camera_view"]["camera_id"] == camera_id
    assert sorted(body["sliced"]) == sorted(o["id"] for o in outputs)
    again = (await api.get(f"/api/mapping/shows/{show['id']}", headers=headers)).json()
    assert again["camera_view"]["corners"] == body["camera_view"]["corners"]
    left, right = (next(o for o in again["outputs"] if o["id"] == out["id"]) for out in outputs)
    # Each output now shows the part of the canvas its light covers; they overlap.
    assert left["source"]["x"] < 0.05 and right["source"]["x"] + right["source"]["w"] > 0.95
    assert left["source"]["x"] + left["source"]["w"] > right["source"]["x"]

    applied = await api.post(f"/api/mapping/shows/{show['id']}/apply-calibration",
                             headers=headers, json={})
    assert all(r["applied"] for r in applied.json()), applied.text


async def test_a_hand_grid_is_kept_with_the_show(api):
    headers = await login(api)
    camera_id, _ = await pair(api, headers, CAMERA)
    show = await make_show(api, headers)
    points = even_grid(VIEW, 3, 3)
    points[4] = [0.52, 0.47]
    saved = await api.patch(f"/api/mapping/shows/{show['id']}", headers=headers, json={
        "camera_view": {"camera_id": camera_id, "corners": [[0, 0]] * 4,
                        "mesh": {"cols": 3, "rows": 3, "points": points}}})
    assert saved.status_code == 200, saved.text
    view = saved.json()["camera_view"]
    assert view["mesh"]["points"][4] == [0.52, 0.47]
    # The corners follow the grid's corners, whatever was sent.
    assert view["corners"] == [points[0], points[2], points[8], points[6]]
    wrong = await api.patch(f"/api/mapping/shows/{show['id']}", headers=headers, json={
        "camera_view": {"camera_id": camera_id, "corners": VIEW,
                        "mesh": {"cols": 3, "rows": 3, "points": points[:8]}}})
    assert wrong.status_code == 422


async def test_live_view_asks_the_camera_for_photos(api):
    headers = await login(api)
    camera_id, _ = await pair(api, headers, CAMERA)
    queue = await bus.subscribe()
    try:
        sent = await api.post(f"/api/mapping/cameras/{camera_id}/command", headers=headers,
                              json={"command": "live", "seconds": 120})
        assert sent.status_code == 204, sent.text
        message = await next_message(queue, "mapping_camera_command")
        assert message == {"camera_id": camera_id, "command": "live", "seconds": 120}
    finally:
        await bus.unsubscribe(queue)


async def test_people_say_when_their_picture_was_taken(api):
    headers = await login(api)
    _, camera = await pair(api, headers, CAMERA)
    person = {"id": 1, "x": 0.5, "y": 0.5, "z": 3.0, "size": 0.1}
    queue = await bus.subscribe()
    try:
        await api.post("/api/mapping/cameras/me/people", headers=camera,
                       json={"people": [person], "age_ms": 40})
        message = await next_message(queue, "mapping_people")
        assert 30 < message["at"] - message["captured_at"] < 1000

        # A camera whose clock is in step says it in server time.
        taken = now_ms() - 25
        await api.post("/api/mapping/cameras/me/people", headers=camera,
                       json={"people": [person], "age_ms": 10, "captured_at": taken})
        assert (await next_message(queue, "mapping_people"))["captured_at"] == taken

        # One whose clock is far off falls back to its own age; none at all says nothing.
        await api.post("/api/mapping/cameras/me/people", headers=camera,
                       json={"people": [person], "age_ms": 10, "captured_at": taken + 60_000})
        message = await next_message(queue, "mapping_people")
        assert message["at"] - message["captured_at"] < 1000
        await api.post("/api/mapping/cameras/me/people", headers=camera, json={"people": [person]})
        assert (await next_message(queue, "mapping_people"))["captured_at"] is None
    finally:
        await bus.unsubscribe(queue)


async def test_people_over_the_live_feed_socket(api):
    """A camera sends who it sees on its open WebSocket: no request per report."""
    import app.api.routes.mapping_camera as camera_routes
    from app.db.models import MappingPlayer

    headers = await login(api)
    camera_id, _ = await pair(api, headers, CAMERA)
    show = await make_show(api, headers)
    media = (await upload(api, headers, body=PNG)).json()
    await make_cue(api, headers, show["id"], media_id=media["id"], interaction="spotlight")
    await api.patch(f"/api/mapping/shows/{show['id']}", headers=headers,
                    json={"camera_view": {"camera_id": camera_id, "corners": VIEW}})
    await transport(api, headers, action="go", show_id=show["id"])
    async with camera_routes.SessionLocal() as session:
        user_id = (await session.get(MappingPlayer, camera_id)).user_id

    feed = camera_routes.PeopleFeed(user_id)
    queue = await bus.subscribe()
    try:
        await feed.report({"people": [{"id": 2, "x": 0.5, "y": 0.5, "z": 2.0, "size": 0.1}], "age_ms": 12})
        live = await next_message(queue, "mapping_people")
        assert live["camera_id"] == camera_id and live["show_id"] == show["id"]
        want = apply(invert(square_to_quad(VIEW)), 0.5, 0.5)
        assert math.dist((live["people"][0]["x"], live["people"][0]["y"]), want) < 1e-4
        assert live["captured_at"] is not None

        # Rubbish is ignored, and an account that is not a camera relays nothing.
        await feed.report({"people": "nobody"})
        await camera_routes.PeopleFeed(user_id + 1000).report({"people": []})
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(next_message(queue, "mapping_people"), timeout=0.3)
    finally:
        await bus.unsubscribe(queue)
