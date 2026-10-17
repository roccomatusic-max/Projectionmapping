"""Camera calibration: from decoded structured light to a corner pin and mesh.

The camera agent projects Gray-code stripes from one output at a time and
decodes, for a grid of cells over its picture, which projector pixel lit
that cell. That is a map *camera → projector*. The operator marks where the
show canvas sits in the same picture (four corners), which is a homography
*canvas → camera*. Chained, they say where each canvas point must land in
each projector's image, which is exactly what the output's warp encodes.

Spaces, all in fractions:
  canvas    (0,0) top-left of the show canvas, (1,1) bottom-right
  camera    the camera picture
  output    the projector's image (what corners and masks use)
  unit      an output's slice of the canvas, before warping

The renderer computes ``output = H_corners(unit + mesh_offset(unit))``, with
the mesh interpolated through its control points (Catmull-Rom, see
frontend/src/mapping/geometry.ts). So for each control point the solver
finds the target output position ``p`` and sets the offset to
``H_corners⁻¹(p) − unit``; the corners are the targets of the unit corners,
which makes the corner offsets zero.

Where the camera did not see a projector's light (outside its throw, or
blocked), positions come from one homography fitted to every decoded cell
instead: a flat-wall estimate that still extrapolates sensibly.

Pure Python on purpose: grids are a few thousand points, and the server
does not need numpy for this.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from datetime import datetime

Point = tuple[float, float]
Homography = list[float]  # row-major 3×3, h[8] == 1

UNIT_CORNERS: list[Point] = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]


class CalibrationError(Exception):
    """The calibration cannot produce a usable warp for this output."""


# -- homographies --------------------------------------------------------------


def square_to_quad(corners: Sequence[Point]) -> Homography:
    """Unit square → quad (TL, TR, BR, BL). Same as the frontend's squareToQuad."""
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = corners
    dx1, dx2, dx3 = x1 - x2, x3 - x2, x0 - x1 + x2 - x3
    dy1, dy2, dy3 = y1 - y2, y3 - y2, y0 - y1 + y2 - y3
    g = h = 0.0
    den = dx1 * dy2 - dx2 * dy1
    if (abs(dx3) > 1e-12 or abs(dy3) > 1e-12) and abs(den) > 1e-12:
        g = (dx3 * dy2 - dx2 * dy3) / den
        h = (dx1 * dy3 - dx3 * dy1) / den
    return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0,
            y1 - y0 + g * y1, y3 - y0 + h * y3, y0,
            g, h, 1.0]


def apply(m: Homography, x: float, y: float) -> Point:
    w = m[6] * x + m[7] * y + m[8]
    if abs(w) < 1e-12:
        w = 1e-12
    return ((m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w)


def invert(m: Homography) -> Homography:
    a, b, c, d, e, f, g, h, i = m
    A, B, C = e * i - f * h, -(d * i - f * g), d * h - e * g
    det = a * A + b * B + c * C
    if abs(det) < 1e-15:
        raise CalibrationError("degenerate homography")
    k = 1.0 / det
    return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k,
            B * k, (a * i - c * g) * k, -(a * f - c * d) * k,
            C * k, -(a * h - b * g) * k, (a * e - b * d) * k]


def _solve(a: list[list[float]], b: list[float]) -> list[float]:
    """Gaussian elimination with partial pivoting; small dense systems only."""
    n = len(b)
    rows = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(rows[r][col]))
        if abs(rows[pivot][col]) < 1e-12:
            raise CalibrationError("not enough spread in the decoded points to fit a plane")
        rows[col], rows[pivot] = rows[pivot], rows[col]
        for r in range(col + 1, n):
            factor = rows[r][col] / rows[col][col]
            if factor:
                for k in range(col, n + 1):
                    rows[r][k] -= factor * rows[col][k]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        x[r] = (rows[r][n] - sum(rows[r][k] * x[k] for k in range(r + 1, n))) / rows[r][r]
    return x


def fit_homography(src: Sequence[Point], dst: Sequence[Point]) -> Homography:
    """Least-squares homography src → dst (DLT with h33 = 1, normalised)."""
    if len(src) < 4:
        raise CalibrationError("fewer than four decoded points")

    def normaliser(points: Sequence[Point]) -> tuple[float, float, float]:
        cx = sum(p[0] for p in points) / len(points)
        cy = sum(p[1] for p in points) / len(points)
        spread = sum(math.hypot(p[0] - cx, p[1] - cy) for p in points) / len(points)
        return cx, cy, (math.sqrt(2) / spread) if spread > 1e-12 else 1.0

    scx, scy, ss = normaliser(src)
    dcx, dcy, ds = normaliser(dst)
    ata = [[0.0] * 8 for _ in range(8)]
    atb = [0.0] * 8
    for (x, y), (u, v) in zip(src, dst, strict=True):
        x, y = (x - scx) * ss, (y - scy) * ss
        u, v = (u - dcx) * ds, (v - dcy) * ds
        for row, rhs in (([x, y, 1, 0, 0, 0, -x * u, -y * u], u),
                         ([0, 0, 0, x, y, 1, -x * v, -y * v], v)):
            for i in range(8):
                if row[i]:
                    atb[i] += row[i] * rhs
                    for j in range(8):
                        ata[i][j] += row[i] * row[j]
    h = _solve(ata, atb) + [1.0]
    # Undo the normalisation: H = Td⁻¹ · Hn · Ts
    ts = [ss, 0, -ss * scx, 0, ss, -ss * scy, 0, 0, 1]
    td_inv = [1 / ds, 0, dcx, 0, 1 / ds, dcy, 0, 0, 1]
    out = _mul(td_inv, _mul(h, ts))
    return [v / out[8] for v in out]


def _mul(a: Sequence[float], b: Sequence[float]) -> list[float]:
    return [sum(a[r * 3 + k] * b[k * 3 + c] for k in range(3)) for r in range(3) for c in range(3)]


def is_convex(corners: Sequence[Point]) -> bool:
    sign = 0.0
    for i in range(4):
        ax, ay = corners[i]
        bx, by = corners[(i + 1) % 4]
        cx, cy = corners[(i + 2) % 4]
        cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx)
        if abs(cross) < 1e-12:
            return False
        if sign == 0:
            sign = math.copysign(1, cross)
        elif math.copysign(1, cross) != sign:
            return False
    return True


# -- the decoded grid ------------------------------------------------------------


class CameraMap:
    """Camera → projector, from one output's decoded grid.

    A flat-wall homography fitted to every decoded cell, plus each cell's
    residual from it: the part a flat wall cannot explain (a curved or
    stepped façade, lens distortion). Lookups add the interpolated residual
    to the flat estimate, so the shape the camera measured carries right up
    to the edge of the light, and a little past it.
    """

    #: How many cells past the decoded area a residual is carried.
    REACH = 3

    def __init__(self, calibration: dict) -> None:
        self.cols = int(calibration["cols"])
        self.rows = int(calibration["rows"])
        points = calibration["points"]
        src, dst = [], []
        for index, point in enumerate(points):
            if point is not None:
                src.append(self._centre(index))
                dst.append((float(point[0]), float(point[1])))
        if len(src) < 12:
            raise CalibrationError("the camera saw too little of this projector's light")
        self.flat = fit_homography(src, dst)
        self.residuals: list[Point | None] = [None] * (self.cols * self.rows)
        total = 0.0
        for index, point in enumerate(points):
            if point is None:
                continue
            fx, fy = apply(self.flat, *self._centre(index))
            r = (float(point[0]) - fx, float(point[1]) - fy)
            self.residuals[index] = r
            total += r[0] ** 2 + r[1] ** 2
        #: RMS distance of the decoded points from the flat-wall fit.
        self.residual = math.sqrt(total / len(src))

    def _centre(self, index: int) -> Point:
        return ((index % self.cols + 0.5) / self.cols, (index // self.cols + 0.5) / self.rows)

    def _residual(self, c: int, r: int) -> Point | None:
        if 0 <= c < self.cols and 0 <= r < self.rows:
            return self.residuals[r * self.cols + c]
        return None

    def lookup(self, x: float, y: float) -> tuple[Point, bool]:
        """Projector position seen at camera point (x, y); True when measured."""
        fx, fy = apply(self.flat, x, y)
        gx = x * self.cols - 0.5
        gy = y * self.rows - 0.5
        ix, iy = math.floor(gx), math.floor(gy)
        tx, ty = gx - ix, gy - iy
        weight = rx = ry = 0.0
        for dy in (0, 1):
            for dx in (0, 1):
                residual = self._residual(ix + dx, iy + dy)
                w = (tx if dx else 1 - tx) * (ty if dy else 1 - ty)
                if residual is not None and w > 0:
                    weight += w
                    rx += w * residual[0]
                    ry += w * residual[1]
        if weight > 1e-6:
            return (fx + rx / weight, fy + ry / weight), True
        # Just outside the light: carry the nearest measured shape outward.
        cx, cy = round(gx), round(gy)
        best: tuple[float, Point] | None = None
        for r in range(cy - self.REACH, cy + self.REACH + 1):
            for c in range(cx - self.REACH, cx + self.REACH + 1):
                residual = self._residual(c, r)
                if residual is not None:
                    d = (c - gx) ** 2 + (r - gy) ** 2
                    if best is None or d < best[0]:
                        best = (d, residual)
        if best is not None:
            return (fx + best[1][0], fy + best[1][1]), False
        return (fx, fy), False


class CanvasOnCamera:
    """Canvas → camera: the four corners, refined by points placed by hand.

    The corners give one homography (a flat wall seen in perspective). A
    hand-placed grid adds, at each of its points, how far the person moved
    it from where that homography put it; in between, those offsets are
    blended bilinearly. Without a grid this is exactly the homography.
    """

    def __init__(self, corners: Sequence[Point], mesh: dict | None = None) -> None:
        self.flat = square_to_quad(corners)
        self.cols = self.rows = 0
        self.offsets: list[Point] = []
        if mesh and mesh.get("points"):
            self.cols, self.rows = int(mesh["cols"]), int(mesh["rows"])
            for index, (x, y) in enumerate(mesh["points"]):
                u = (index % self.cols) / (self.cols - 1)
                v = (index // self.cols) / (self.rows - 1)
                fx, fy = apply(self.flat, u, v)
                self.offsets.append((float(x) - fx, float(y) - fy))

    def __call__(self, u: float, v: float) -> Point:
        x, y = apply(self.flat, u, v)
        if not self.offsets:
            return x, y
        gx = min(max(u, 0.0), 1.0) * (self.cols - 1)
        gy = min(max(v, 0.0), 1.0) * (self.rows - 1)
        c, r = min(int(gx), self.cols - 2), min(int(gy), self.rows - 2)
        tx, ty = gx - c, gy - r
        ox = oy = 0.0
        for dc, dr, w in ((0, 0, (1 - tx) * (1 - ty)), (1, 0, tx * (1 - ty)),
                          (0, 1, (1 - tx) * ty), (1, 1, tx * ty)):
            dx, dy = self.offsets[(r + dr) * self.cols + c + dc]
            ox += w * dx
            oy += w * dy
        return x + ox, y + oy


def solve_warp(source: dict, camera_corners: Sequence[Point], calibration: dict, *,
               mesh: int = 9, output_width: int = 1920,
               camera_mesh: dict | None = None) -> tuple[dict, dict]:
    """The warp that puts this output's slice of the canvas where it belongs.

    Returns (warp, stats). ``warp`` validates as ``schemas.mapping.Warp``.
    """
    to_camera = CanvasOnCamera(camera_corners, camera_mesh)
    camera = CameraMap(calibration)
    sx, sy = float(source.get("x", 0)), float(source.get("y", 0))
    sw, sh = float(source.get("w", 1)), float(source.get("h", 1))

    targets: list[Point] = []
    measured = 0
    for r in range(mesh):
        for c in range(mesh):
            u, v = c / (mesh - 1), r / (mesh - 1)
            q = to_camera(sx + u * sw, sy + v * sh)
            p, seen = camera.lookup(*q)
            targets.append(p)
            measured += seen

    last = mesh - 1
    corners = [targets[0], targets[last], targets[mesh * mesh - 1], targets[last * mesh]]
    if not is_convex(corners):
        raise CalibrationError("the result folds over itself; check the canvas corners on the photo")
    for x, y in corners:
        if not (-4 <= x <= 5 and -4 <= y <= 5):
            raise CalibrationError("this output's slice of the canvas is far outside its projector")
    back = invert(square_to_quad(corners))

    offsets: list[Point] = []
    largest = 0.0
    for index, p in enumerate(targets):
        u, v = (index % mesh) / last, (index // mesh) / last
        wu, wv = apply(back, *p)
        dx = max(-2.0, min(2.0, wu - u))
        dy = max(-2.0, min(2.0, wv - v))
        offsets.append((round(dx, 6), round(dy, 6)))
        largest = max(largest, abs(dx), abs(dy))

    warp = {
        "corners": [[round(x, 6), round(y, 6)] for x, y in corners],
        # Below a twentieth of a pixel the mesh is noise: keep the plain pin.
        "mesh": ({"cols": mesh, "rows": mesh, "points": [list(o) for o in offsets]}
                 if largest * output_width > 0.05 else None),
    }
    stats = {"measured": measured / (mesh * mesh), "residual_px": camera.residual * output_width}
    return warp, stats


# -- fitting the canvas to the light --------------------------------------------


def _lit_cells(calibration: dict, cols: int, rows: int) -> list[bool]:
    """Which cells of a cols × rows grid over the photo this projector lit."""
    lit = [False] * (cols * rows)
    own_cols, own_rows = int(calibration["cols"]), int(calibration["rows"])
    for index, point in enumerate(calibration["points"]):
        if point is None:
            continue
        x = (index % own_cols + 0.5) / own_cols
        y = (index // own_cols + 0.5) / own_rows
        lit[min(int(y * rows), rows - 1) * cols + min(int(x * cols), cols - 1)] = True
    return lit


def _fill_holes(lit: list[bool], cols: int, rows: int) -> list[bool]:
    """Unlit cells the light surrounds (dark glass, a failed cell) count as lit."""
    outside = [False] * len(lit)
    stack = [i for i in range(len(lit))
             if not lit[i] and (i % cols in (0, cols - 1) or i // cols in (0, rows - 1))]
    for i in stack:
        outside[i] = True
    while stack:
        i = stack.pop()
        c, r = i % cols, i // cols
        for nc, nr in ((c - 1, r), (c + 1, r), (c, r - 1), (c, r + 1)):
            if 0 <= nc < cols and 0 <= nr < rows:
                j = nr * cols + nc
                if not lit[j] and not outside[j]:
                    outside[j] = True
                    stack.append(j)
    return [not o for o in outside]


def _grow(lit: list[bool], cols: int, rows: int, reach: int, grow: bool) -> list[bool]:
    """Dilate (grow) or erode a cell mask by ``reach`` cells; outside counts as unlit."""
    out = [False] * len(lit)
    for r in range(rows):
        for c in range(cols):
            near = [lit[nr * cols + nc] if 0 <= nr < rows and 0 <= nc < cols else False
                    for nr in range(r - reach, r + reach + 1)
                    for nc in range(c - reach, c + reach + 1)]
            out[r * cols + c] = any(near) if grow else all(near)
    return out


def light_mask(calibrations: Sequence[dict], cols: int, rows: int) -> list[bool]:
    """Every cell some projector lights, with small gaps closed.

    Somebody walking past, dark glass or a failed cell leaves a gap in the
    decoded light; closing (grow, fill the holes, shrink back) bridges gaps
    up to a few cells wide without growing the outline.
    """
    lit = [False] * (cols * rows)
    for calibration in calibrations:
        lit = [a or b for a, b in zip(lit, _lit_cells(calibration, cols, rows), strict=True)]
    reach = 2
    closed = _grow(_fill_holes(_grow(lit, cols, rows, reach, True), cols, rows), cols, rows, reach, False)
    return [a or b for a, b in zip(lit, closed, strict=True)]


def fit_canvas(calibrations: Sequence[dict], canvas_aspect: float) -> list[Point]:
    """The largest canvas-shaped rectangle on the photo that the projectors light.

    Like a projector's own auto keystone, but across every projector the
    camera calibrated: the canvas keeps its proportions (as the camera sees
    them) and sits wholly inside the light, so nothing of it is cut off.
    Returns corners TL, TR, BR, BL in camera fractions.
    """
    usable = [c for c in calibrations if c and c.get("points")]
    if not usable:
        raise CalibrationError("calibrate at least one projector with this camera first")
    cols, rows = int(usable[0]["cols"]), int(usable[0]["rows"])
    lit = light_mask(usable, cols, rows)

    # Summed-area table: the lit count of any rectangle in four lookups.
    table = [[0] * (cols + 1) for _ in range(rows + 1)]
    for r in range(rows):
        running = 0
        for c in range(cols):
            running += lit[r * cols + c]
            table[r + 1][c + 1] = table[r][c + 1] + running

    def full(c0: int, r0: int, w: int, h: int) -> bool:
        total = table[r0 + h][c0 + w] - table[r0][c0 + w] - table[r0 + h][c0] + table[r0][c0]
        return total == w * h

    camera_aspect = float(usable[0]["camera_width"]) / float(usable[0]["camera_height"])
    # Cells are camera_aspect·rows/cols times wider than tall, in pixels.
    cell_aspect = camera_aspect * rows / cols
    # Of the largest, the one most central to the light.
    lit_cells = [i for i, on in enumerate(lit) if on]
    mid_c = sum(i % cols for i in lit_cells) / max(1, len(lit_cells)) + 0.5
    mid_r = sum(i // cols for i in lit_cells) / max(1, len(lit_cells)) + 0.5
    best: tuple[float, float, int, int, int, int] | None = None
    for r0 in range(rows):
        for c0 in range(cols):
            if not lit[r0 * cols + c0]:
                continue
            for w in range(1, cols - c0 + 1):
                h = round(w * cell_aspect / canvas_aspect)
                if h < 1:
                    continue
                if r0 + h > rows or not full(c0, r0, w, h):
                    break
                off = (c0 + w / 2 - mid_c) ** 2 + (r0 + h / 2 - mid_r) ** 2
                if best is None or (w * h, -off) > (best[0], best[1]):
                    best = (w * h, -off, c0, r0, w, h)
    if best is None:
        raise CalibrationError("the projectors light too little of the photo to fit the canvas in")
    _, _, c0, r0, w, h = best
    x0, x1 = c0 / cols, (c0 + w) / cols
    y0, y1 = r0 / rows, (r0 + h) / rows
    return [(round(x0, 5), round(y0, 5)), (round(x1, 5), round(y0, 5)),
            (round(x1, 5), round(y1, 5)), (round(x0, 5), round(y1, 5))]


def light_on_canvas(calibration: dict, camera_corners: Sequence[Point]) -> dict | None:
    """The part of the canvas this projector's light covers, as a source slice.

    The bounding box, in canvas fractions, of every cell where the camera
    saw this projector's light; None when none of it falls on the canvas.
    """
    to_canvas = camera_to_canvas(camera_corners)
    cols, rows = int(calibration["cols"]), int(calibration["rows"])
    xs: list[float] = []
    ys: list[float] = []
    for index, point in enumerate(calibration["points"]):
        if point is None:
            continue
        c, r = index % cols, index // cols
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            u, v = apply(to_canvas, (c + dx) / cols, (r + dy) / rows)
            xs.append(u)
            ys.append(v)
    if not xs:
        return None
    x0, x1 = max(0.0, min(xs)), min(1.0, max(xs))
    y0, y1 = max(0.0, min(ys)), min(1.0, max(ys))
    if x1 - x0 < 0.01 or y1 - y0 < 0.01:
        return None
    return {"x": round(x0, 5), "y": round(y0, 5), "w": round(x1 - x0, 5), "h": round(y1 - y0, 5)}


def camera_to_canvas(camera_corners: Sequence[Point]) -> Homography:
    return invert(square_to_quad(camera_corners))


def calibration_summary(calibration: dict | None) -> dict | None:
    if not calibration or "camera_id" not in calibration:
        return None
    captured = calibration.get("captured_at")
    return {
        "camera_id": calibration["camera_id"],
        "captured_at": datetime.fromisoformat(captured) if isinstance(captured, str) else captured,
        "coverage": calibration.get("coverage", 0.0),
    }
