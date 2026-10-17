"""A simulated depth camera looking at a made-up building lit by two projectors.

For trying calibration, hand mapping and people effects without hardware:
``python agent.py --server … --camera sim``. The projectors are keystoned,
overlap in the middle, and the right one lands on a gently curved wall, so
both the corner pin and the mesh have something to correct. The first two
outputs that calibrate are given the two projectors, in that order.

People walk across in front of the building after the first ten seconds
(the agent learns the empty scene first).
"""

from __future__ import annotations

import math
import threading
import time

import cv2
import numpy as np

from sources import Frame, Source
from vision import gray_stripe

WIDTH, HEIGHT = 1280, 720

#: Where each projector's image corners land in the camera picture (pixels).
PROJECTORS = [
    np.float32([[150, 150], [700, 175], [690, 560], [165, 600]]),
    np.float32([[600, 165], [1140, 135], [1150, 605], [590, 570]]),
]
#: Height of the bulge (projector fractions) each projector lands on.
BULGE = [0.0, 0.035]


def facade(rng: np.random.Generator) -> np.ndarray:
    """Reflectance of the scene, 0..1, BGR: sky, a rendered wall, windows, a door."""
    yy, xx = np.mgrid[0:HEIGHT, 0:WIDTH].astype(np.float32)
    scene = np.empty((HEIGHT, WIDTH, 3), np.float32)
    # Night sky, dim.
    scene[:] = (0.10, 0.07, 0.06)
    top, bottom, left, right = 110, 650, 120, 1180
    wall = (yy >= top) & (yy < bottom) & (xx >= left) & (xx < right)
    render = 0.72 + 0.03 * np.sin(xx / 9.0) * np.cos(yy / 7.0) + rng.normal(0, 0.02, (HEIGHT, WIDTH))
    for c, tint in enumerate((0.92, 0.96, 1.0)):
        scene[..., c] = np.where(wall, render * tint, scene[..., c])
    # Cornice and plinth.
    for y0, y1 in ((top, top + 18), (bottom - 26, bottom)):
        band = (yy >= y0) & (yy < y1) & (xx >= left - 10) & (xx < right + 10)
        scene[band] = (0.82, 0.84, 0.86)
    # Three floors of windows: darker glass in light frames.
    for row in range(3):
        for col in range(8):
            x0 = left + 50 + col * 130
            y0 = top + 50 + row * 150
            if row == 2 and col in (3, 4):
                continue
            scene[y0 - 6:y0 + 96, x0 - 6:x0 + 66] = (0.86, 0.86, 0.86)
            scene[y0:y0 + 90, x0:x0 + 60] = (0.30, 0.28, 0.26)
            scene[y0 + 43:y0 + 47, x0:x0 + 60] = (0.8, 0.8, 0.8)
    # The door.
    scene[top + 360:bottom - 26, left + 425:left + 635] = (0.25, 0.20, 0.17)
    return scene


class SimProjector:
    """Camera pixel → projector fraction, for one projector."""

    def __init__(self, quad: np.ndarray, bulge: float) -> None:
        unit = np.float32([[0, 0], [1, 0], [1, 1], [0, 1]])
        to_unit = cv2.getPerspectiveTransform(quad, unit)
        yy, xx = np.mgrid[0:HEIGHT, 0:WIDTH].astype(np.float32)
        points = np.stack([xx, yy], axis=-1).reshape(-1, 1, 2)
        u = cv2.perspectiveTransform(points, to_unit).reshape(HEIGHT, WIDTH, 2)
        # A curved wall: the picture bends down in the middle.
        u[..., 1] -= bulge * np.sin(np.pi * np.clip(u[..., 0], 0, 1))
        self.u = u
        self.inside = (u[..., 0] >= 0) & (u[..., 0] < 1) & (u[..., 1] >= 0) & (u[..., 1] < 1)

    def light(self, image: np.ndarray) -> np.ndarray:
        """The projector's image (0..1, h × w) as it falls in the camera picture."""
        h, w = image.shape[:2]
        mx = (self.u[..., 0] * w).astype(np.float32)
        my = (self.u[..., 1] * h).astype(np.float32)
        seen = cv2.remap(image, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        return np.where(self.inside, seen, 0).astype(np.float32)


class SimSource(Source):
    name = "Simulated depth camera"
    has_depth = True

    def __init__(self, seed: int = 7) -> None:
        self.rng = np.random.default_rng(seed)
        self.scene = facade(self.rng)
        self.projectors = [SimProjector(q, b) for q, b in zip(PROJECTORS, BULGE, strict=True)]
        self.assigned: dict[int, int] = {}
        self.pattern: tuple[int, dict, int, int] | None = None
        self.started = time.monotonic()
        self.lock = threading.Lock()
        yy, _ = np.mgrid[0:HEIGHT, 0:WIDTH].astype(np.float32)
        self.wall_depth = (9.0 - 0.6 * (yy / HEIGHT)).astype(np.float32)

    def show_pattern(self, output_id: int | None, pattern: dict | None, width: int = 0,
                     height: int = 0) -> None:
        with self.lock:
            if output_id is None or pattern is None:
                self.pattern = None
                return
            if output_id not in self.assigned and len(self.assigned) < len(self.projectors):
                self.assigned[output_id] = len(self.assigned)
            self.pattern = (output_id, pattern, width, height)

    def _light(self) -> np.ndarray:
        light = np.zeros((HEIGHT, WIDTH), np.float32)
        with self.lock:
            pattern = self.pattern
        if pattern is None:
            # Between calibrations the projectors play the show: a soft glow.
            for projector in self.projectors:
                light += 0.35 * projector.inside
            return light
        output_id, spec, w, h = pattern
        index = self.assigned.get(output_id)
        if index is None:
            return light
        image = gray_stripe(spec, w, h)
        return self.projectors[index].light(image)

    def _people(self, t: float) -> list[tuple[float, float, float]]:
        """(x, y, metres) of the people in view, after the first ten seconds."""
        if t < 10:
            return []
        people = []
        for i, (speed, phase) in enumerate(((0.05, 0.0), (0.035, 0.45))):
            x = 0.12 + 0.76 * (0.5 + 0.5 * math.sin((t - 10) * speed * 2 * math.pi + phase * 2 * math.pi))
            people.append((x, 0.78 - 0.04 * i, 3.5 + i))
        return people

    def read(self) -> Frame:
        t = time.monotonic() - self.started
        light = self._light()
        exposure = 0.26 + 0.74 * light  # ambient street light plus projectors
        color = self.scene * exposure[..., None] * 255.0
        depth = self.wall_depth.copy()
        for x, y, metres in self._people(t):
            cx, cy = int(x * WIDTH), int(y * HEIGHT)
            cv2.ellipse(depth, (cx, cy), (28, 85), 0, 0, 360, metres, -1)
            cv2.ellipse(color, (cx, cy), (28, 85), 0, 0, 360, (40, 45, 60), -1)
        color += self.rng.normal(0, 2.5, color.shape)
        time.sleep(1 / 30)
        return Frame(color=np.clip(color, 0, 255).astype(np.uint8), depth=depth)
