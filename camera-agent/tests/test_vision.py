"""Structured light and people tracking against synthetic pictures."""

from __future__ import annotations

import math
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from vision import Decoder, PeopleTracker, gray_stripe, lowest_bit, pattern_sequence  # noqa: E402

PROJECTOR = (640, 400)
CAMERA = (480, 320)
#: Where the projector's corners land in the camera picture.
QUAD = np.float32([[60, 40], [430, 70], [410, 290], [80, 270]])


def photograph(pattern: dict, rng: np.random.Generator) -> np.ndarray:
    """What the camera sees: the pattern, in perspective, on an uneven wall."""
    pw, ph = PROJECTOR
    light = gray_stripe(pattern, pw, ph)
    to_camera = cv2.getPerspectiveTransform(np.float32([[0, 0], [pw, 0], [pw, ph], [0, ph]]), QUAD)
    seen = cv2.warpPerspective(light, to_camera, CAMERA, flags=cv2.INTER_AREA)
    cw, ch = CAMERA
    yy, xx = np.mgrid[0:ch, 0:cw]
    albedo = 0.55 + 0.35 * np.sin(xx / 37.0) * np.cos(yy / 23.0)  # brick, render, glass
    ambient = 25 + 10 * (yy / ch)
    picture = ambient + 180 * albedo * seen + rng.normal(0, 3, seen.shape)
    return np.clip(picture, 0, 255).astype(np.uint8)


def test_sequence_skips_the_finest_stripes():
    sequence = pattern_sequence(1920, 1200, min_stripe=4)
    assert sequence[0]["kind"] == "black" and sequence[1]["kind"] == "white"
    gray = [p for p in sequence if p["kind"] == "gray"]
    assert lowest_bit(4) == 1
    assert {p["bit"] for p in gray if p["axis"] == "x"} == set(range(1, 11))
    assert len(gray) == 2 * (10 + 10)


def test_gray_stripe_matches_the_shader_rule():
    stripe = gray_stripe({"kind": "gray", "axis": "x", "bit": 2, "inverse": False}, 16, 1)[0]
    gray = [(x ^ (x >> 1)) >> 2 & 1 for x in range(16)]
    assert stripe.tolist() == gray


def test_decode_recovers_projector_pixels():
    rng = np.random.default_rng(1)
    pw, ph = PROJECTOR
    decoder = Decoder(pw, ph, min_stripe=4)
    for pattern in pattern_sequence(pw, ph, min_stripe=4):
        decoder.add(pattern, photograph(pattern, rng))
    cols, rows = 48, 32
    points = decoder.grid(cols, rows)

    to_projector = cv2.getPerspectiveTransform(QUAD, np.float32([[0, 0], [pw, 0], [pw, ph], [0, ph]]))
    cw, ch = CAMERA
    errors = []
    for index, point in enumerate(points):
        if point is None:
            continue
        c, r = index % cols, index // cols
        centre = np.float32([[[(c + 0.5) * cw / cols, (r + 0.5) * ch / rows]]])
        tx, ty = cv2.perspectiveTransform(centre, to_projector)[0, 0]
        errors.append(math.hypot(point[0] * pw - tx, point[1] * ph - ty))
    # Most of the projected quad is found, off-quad cells are not.
    assert len(errors) > 0.4 * cols * rows
    # About 1.3 projector pixels per camera pixel here.
    assert np.median(errors) < 1.5
    assert max(errors) < 4.0


def test_unlit_cells_are_left_out():
    rng = np.random.default_rng(2)
    pw, ph = PROJECTOR
    decoder = Decoder(pw, ph)
    for pattern in pattern_sequence(pw, ph):
        decoder.add(pattern, photograph(pattern, rng))
    points = decoder.grid(48, 32)
    assert points[0] is None  # top-left corner of the picture: outside the throw


def scene(people: list[tuple[int, int, int, int, float]]) -> np.ndarray:
    """A wall at 6 m with a floor gradient, and boxes for people."""
    depth = np.full((480, 640), 6.0, np.float32)
    depth[300:] = np.linspace(6.0, 2.5, 180)[:, None]
    for x, y, w, h, z in people:
        depth[y:y + h, x:x + w] = z
    depth[::7, ::11] = 0  # missing readings, as real sensors have
    return depth


def test_tracker_finds_people_and_keeps_their_ids():
    tracker = PeopleTracker()
    with pytest.raises(RuntimeError):
        tracker.update(scene([]))
    tracker.learn([scene([]) for _ in range(5)])
    assert tracker.update(scene([])) == []

    first = tracker.update(scene([(100, 150, 60, 200, 3.0)]))
    assert len(first) == 1
    person = first[0]
    assert abs(person.x - 130 / 640) < 0.02 and abs(person.z - 3.0) < 0.05

    moved = tracker.update(scene([(120, 150, 60, 200, 3.0), (450, 120, 50, 220, 4.0)]))
    assert len(moved) == 2
    ids = {round(p.x, 1): p.id for p in moved}
    assert person.id in ids.values()
    assert len(set(ids.values())) == 2


def test_tiny_blobs_are_ignored():
    tracker = PeopleTracker()
    tracker.learn([scene([])])
    assert tracker.update(scene([(300, 200, 4, 4, 2.0)])) == []
