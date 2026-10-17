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
    apply,
    fit_homography,
    invert,
    solve_warp,
    square_to_quad,
)
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
