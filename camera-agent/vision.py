"""What the camera agent sees: structured-light decoding and people tracking.

No network and no camera here, only arrays in and answers out, so both
halves can be tested with synthetic pictures.

Structured light
    The projector being calibrated shows black, white, then each bit of the
    Gray code of its pixel columns and rows, each followed by its inverse.
    Comparing a picture with its inverse tells, per camera pixel, whether
    that bit was lit, independent of how bright or dark that bit of wall
    is. Stacking the bits gives the projector column and row that lit each
    camera pixel. The finest bits are skipped (stripes a few projector
    pixels wide blur together in a camera across a car park); the grid
    median that follows recovers sub-stripe precision anyway.

People
    A depth camera's picture of the empty scene is learned once. Anything
    clearly nearer than that background is a person (or a dog, or a
    bicycle). Blobs are labelled, filtered by size, and given stable ids by
    matching each to the nearest one in the previous frame.
"""

from __future__ import annotations

import math
import warnings
from dataclasses import dataclass, field

import cv2
import numpy as np

# -- structured light ------------------------------------------------------------


def lowest_bit(min_stripe: int) -> int:
    """Lowest Gray-code bit whose stripes are at least ``min_stripe`` pixels.

    Bit b of a Gray code changes every 2^(b+1) pixels.
    """
    return max(0, math.ceil(math.log2(max(1, min_stripe))) - 1)


def bit_count(size: int) -> int:
    return max(1, math.ceil(math.log2(max(2, size))))


def pattern_sequence(width: int, height: int, min_stripe: int = 4) -> list[dict]:
    """Every frame to project, in order, as the server's PatternSpec."""
    sequence = [{"kind": "black", "axis": "x", "bit": 0, "inverse": False},
                {"kind": "white", "axis": "x", "bit": 0, "inverse": False}]
    low = lowest_bit(min_stripe)
    for axis, size in (("x", width), ("y", height)):
        for bit in range(bit_count(size) - 1, low - 1, -1):
            for inverse in (False, True):
                sequence.append({"kind": "gray", "axis": axis, "bit": bit, "inverse": inverse})
    return sequence


def gray_stripe(pattern: dict, width: int, height: int) -> np.ndarray:
    """The projector image of one pattern, 0/1 float32, for tests and previews.

    Same rule as the output window's shader (renderer.ts).
    """
    if pattern["kind"] == "black":
        return np.zeros((height, width), np.float32)
    if pattern["kind"] == "white":
        return np.ones((height, width), np.float32)
    coords = np.arange(width if pattern["axis"] == "x" else height, dtype=np.uint32)
    gray = coords ^ (coords >> 1)
    line = ((gray >> pattern["bit"]) & 1).astype(np.float32)
    if pattern["inverse"]:
        line = 1 - line
    return np.tile(line, (height, 1)) if pattern["axis"] == "x" else np.tile(line[:, None], (1, width))


@dataclass
class Decoder:
    """Collects the pictures of one sequence and decodes them."""

    width: int
    height: int
    min_stripe: int = 4
    #: White minus black, in grey levels, below which a pixel is not lit by
    #: this projector (another projector's spill, sky, a shadow).
    contrast: float = 18.0
    frames: dict[tuple, np.ndarray] = field(default_factory=dict)

    def add(self, pattern: dict, picture: np.ndarray) -> None:
        if picture.ndim == 3:
            picture = cv2.cvtColor(picture, cv2.COLOR_BGR2GRAY)
        key = (pattern["kind"], pattern["axis"], pattern["bit"], pattern["inverse"])
        self.frames[key] = picture.astype(np.float32)

    def _axis(self, axis: str, size: int, lit: np.ndarray) -> np.ndarray:
        low = lowest_bit(self.min_stripe)
        binary = np.zeros(lit.shape, np.uint32)
        previous = np.zeros(lit.shape, np.uint32)
        for bit in range(bit_count(size) - 1, low - 1, -1):
            on = self.frames[("gray", axis, bit, False)] > self.frames[("gray", axis, bit, True)]
            # Gray to binary, most significant bit first: b_i = b_{i+1} xor g_i.
            current = previous ^ on.astype(np.uint32)
            binary |= current << bit
            previous = current
        # The skipped low bits are unknown: take the middle of that span.
        centre = (1 << low) / 2.0 if low else 0.5
        return binary.astype(np.float32) + centre

    def decode(self) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Projector pixel x, y per camera pixel, and where they are valid."""
        black = self.frames[("black", "x", 0, False)]
        white = self.frames[("white", "x", 0, False)]
        lit = (white - black) > self.contrast
        x = self._axis("x", self.width, lit)
        y = self._axis("y", self.height, lit)
        valid = lit & (x < self.width) & (y < self.height)
        return x, y, valid

    def grid(self, cols: int, rows: int) -> list[list[float] | None]:
        """Median projector position (output fractions) per camera cell."""
        x, y, valid = self.decode()
        return cell_medians(x / self.width, y / self.height, valid, cols, rows)


def cell_medians(fx: np.ndarray, fy: np.ndarray, valid: np.ndarray, cols: int, rows: int,
                 *, min_share: float = 0.85, max_spread: float = 0.03) -> list[list[float] | None]:
    """Reduce per-pixel decodes to a grid, dropping thin or noisy cells.

    A cell needs ``min_share`` of its pixels decoded: a cell only partly lit
    has its median pulled toward the lit part, away from its centre, so the
    edge of the light is left to the server's fit instead. And the decoded
    positions must agree (median absolute deviation under ``max_spread`` of
    the output), which rejects cells straddling the edge of the light or a
    depth step where the wall's two levels map to different projector spots.
    """
    h, w = valid.shape
    ch, cw = h // rows, w // cols
    if ch < 1 or cw < 1:
        raise ValueError("grid is finer than the camera picture")

    def blocks(a: np.ndarray) -> np.ndarray:
        a = a[: rows * ch, : cols * cw]
        return a.reshape(rows, ch, cols, cw).transpose(0, 2, 1, 3).reshape(rows, cols, ch * cw)

    v = blocks(valid)
    bx = np.where(v, blocks(fx), np.nan)
    by = np.where(v, blocks(fy), np.nan)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        mx = np.nanmedian(bx, axis=2)
        my = np.nanmedian(by, axis=2)
        sx = np.nanmedian(np.abs(bx - mx[..., None]), axis=2)
        sy = np.nanmedian(np.abs(by - my[..., None]), axis=2)
    share = v.mean(axis=2)
    keep = (share >= min_share) & (sx <= max_spread) & (sy <= max_spread)
    points: list[list[float] | None] = []
    for r in range(rows):
        for c in range(cols):
            points.append([round(float(mx[r, c]), 5), round(float(my[r, c]), 5)]
                          if keep[r, c] else None)
    return points


# -- people ----------------------------------------------------------------------


@dataclass
class Person:
    id: int
    #: Centre in the camera picture, fractions.
    x: float
    y: float
    #: Median distance, metres.
    z: float
    #: Width, fraction of the picture.
    size: float


class PeopleTracker:
    """Foreground blobs against a learned empty-scene depth map."""

    def __init__(self, *, near: float = 0.4, far: float = 9.0, margin: float = 0.3,
                 min_area: float = 0.002, match: float = 0.12, scale: int = 4) -> None:
        self.near = near
        self.far = far
        #: How much nearer than the background counts as someone there, metres.
        self.margin = margin
        #: Smallest blob, as a share of the picture.
        self.min_area = min_area
        #: Furthest a person moves between frames and keeps their id.
        self.match = match
        self.scale = scale
        self.background: np.ndarray | None = None
        self._tracks: list[Person] = []
        self._next_id = 1

    def _shrink(self, depth: np.ndarray) -> np.ndarray:
        h, w = depth.shape
        return cv2.resize(depth, (w // self.scale, h // self.scale), interpolation=cv2.INTER_NEAREST)

    def learn(self, frames: list[np.ndarray]) -> None:
        """The empty scene: per-pixel median depth, zeros (no reading) ignored."""
        stack = np.stack([self._shrink(f) for f in frames]).astype(np.float32)
        stack[stack <= 0] = np.nan
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            background = np.nanmedian(stack, axis=0)
        self.background = np.nan_to_num(background, nan=0.0)
        self._tracks = []

    def update(self, depth: np.ndarray) -> list[Person]:
        if self.background is None:
            raise RuntimeError("learn the empty scene first")
        d = self._shrink(depth).astype(np.float32)
        h, w = d.shape
        background = np.where(self.background > 0, self.background, self.far + self.margin)
        mask = (d > self.near) & (d < self.far) & (d < background - self.margin)
        mask = mask.astype(np.uint8)
        kernel = np.ones((3, 3), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        count, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
        found: list[Person] = []
        for label in range(1, count):
            area = stats[label, cv2.CC_STAT_AREA]
            if area < self.min_area * h * w:
                continue
            cx, cy = centroids[label]
            z = float(np.median(d[labels == label]))
            found.append(Person(id=0, x=float(cx) / w, y=float(cy) / h, z=round(z, 2),
                                size=float(stats[label, cv2.CC_STAT_WIDTH]) / w))
        self._tracks = self._associate(found)
        return list(self._tracks)

    def _associate(self, found: list[Person]) -> list[Person]:
        """Keep ids stable: greedy nearest match to last frame's people."""
        pairs = sorted(
            ((math.hypot(p.x - t.x, p.y - t.y), i, j)
             for i, p in enumerate(found) for j, t in enumerate(self._tracks)),
        )
        taken_found: set[int] = set()
        taken_track: set[int] = set()
        for distance, i, j in pairs:
            if distance > self.match:
                break
            if i in taken_found or j in taken_track:
                continue
            found[i].id = self._tracks[j].id
            taken_found.add(i)
            taken_track.add(j)
        for person in found:
            if person.id == 0:
                person.id = self._next_id
                self._next_id += 1
        return found
