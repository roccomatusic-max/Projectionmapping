/**
 * Warp geometry shared by the renderer and the editor.
 *
 * Spaces:
 *  - unit:   (u, v) in [0,1]², the output's slice of the canvas, undistorted.
 *  - output: (x, y) in output fractions, (0,0) top-left of the projector image.
 *
 * The corner pin is a homography unit → output. The mesh warp adds offsets
 * in unit space before the homography, so moving a corner carries the mesh
 * along with it instead of tearing it.
 */

import type { Blend, ColorAdjust, Mesh, Point, SourceRect, Warp } from './types'

export type Homography = [number, number, number, number, number, number, number, number, number]

export const UNIT_CORNERS: Point[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]

export function defaultWarp(): Warp {
  return { corners: UNIT_CORNERS.map((p) => [...p] as Point), mesh: null }
}

export function defaultBlend(): Blend {
  const edge = () => ({ width: 0, gamma: 2.2, curve: 0.5 })
  return { left: edge(), right: edge(), top: edge(), bottom: edge() }
}

export function defaultColor(): ColorAdjust {
  return { brightness: 1, gamma: 1, red: 1, green: 1, blue: 1 }
}

/** Square-to-quad homography (Heckbert). Corners are TL, TR, BR, BL. */
export function squareToQuad(corners: Point[]): Homography {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = corners
  const dx1 = x1 - x2
  const dx2 = x3 - x2
  const dx3 = x0 - x1 + x2 - x3
  const dy1 = y1 - y2
  const dy2 = y3 - y2
  const dy3 = y0 - y1 + y2 - y3
  let g = 0
  let h = 0
  const den = dx1 * dy2 - dx2 * dy1
  if ((Math.abs(dx3) > 1e-12 || Math.abs(dy3) > 1e-12) && Math.abs(den) > 1e-12) {
    g = (dx3 * dy2 - dx2 * dy3) / den
    h = (dx1 * dy3 - dx3 * dy1) / den
  }
  const a = x1 - x0 + g * x1
  const b = x3 - x0 + h * x3
  const d = y1 - y0 + g * y1
  const e = y3 - y0 + h * y3
  return [a, b, x0, d, e, y0, g, h, 1]
}

export function applyHomography(m: Homography, u: number, v: number): Point {
  const w = m[6] * u + m[7] * v + m[8]
  return [(m[0] * u + m[1] * v + m[2]) / w, (m[3] * u + m[4] * v + m[5]) / w]
}

export function invertHomography(m: Homography): Homography {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  const k = Math.abs(det) < 1e-15 ? 0 : 1 / det
  return [
    A * k,
    -(b * i - c * h) * k,
    (b * f - c * e) * k,
    B * k,
    (a * i - c * g) * k,
    -(a * f - c * d) * k,
    C * k,
    -(a * h - b * g) * k,
    (a * e - b * d) * k,
  ]
}

/** A quad is usable when it is convex and not folded over itself. */
export function isConvex(corners: Point[]): boolean {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i]
    const [bx, by] = corners[(i + 1) % 4]
    const [cx, cy] = corners[(i + 2) % 4]
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx)
    if (Math.abs(cross) < 1e-12) return false
    const s = Math.sign(cross)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}

/** Mesh offset at (u, v): bicubic Catmull-Rom through the control points. */
export function sampleMesh(mesh: Mesh, u: number, v: number): Point {
  const { cols, rows, points } = mesh
  const gx = Math.min(Math.max(u, 0), 1) * (cols - 1)
  const gy = Math.min(Math.max(v, 0), 1) * (rows - 1)
  const ix = Math.min(Math.floor(gx), cols - 2)
  const iy = Math.min(Math.floor(gy), rows - 2)
  const tx = gx - ix
  const ty = gy - iy
  const at = (c: number, r: number) =>
    points[Math.min(Math.max(r, 0), rows - 1) * cols + Math.min(Math.max(c, 0), cols - 1)]
  const out: Point = [0, 0]
  for (let k = 0; k < 2; k++) {
    const column: number[] = []
    for (let r = iy - 1; r <= iy + 2; r++) {
      column.push(catmullRom(at(ix - 1, r)[k], at(ix, r)[k], at(ix + 1, r)[k], at(ix + 2, r)[k], tx))
    }
    out[k] = catmullRom(column[0], column[1], column[2], column[3], ty)
  }
  return out
}

export function emptyMesh(cols: number, rows: number): Mesh {
  return { cols, rows, points: Array.from({ length: cols * rows }, () => [0, 0] as Point) }
}

/** Change the control grid's density, keeping the current shape. */
export function resampleMesh(mesh: Mesh | null, cols: number, rows: number): Mesh {
  if (!mesh) return emptyMesh(cols, rows)
  const points: Point[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      points.push(sampleMesh(mesh, c / (cols - 1), r / (rows - 1)))
    }
  }
  return { cols, rows, points }
}

export function meshBase(mesh: Mesh, index: number): Point {
  const c = index % mesh.cols
  const r = Math.floor(index / mesh.cols)
  return [c / (mesh.cols - 1), r / (mesh.rows - 1)]
}

/** Unit-space point → output-space point through mesh and corner pin. */
export function warpPoint(warp: Warp, u: number, v: number, H = squareToQuad(warp.corners)): Point {
  let wu = u
  let wv = v
  if (warp.mesh) {
    const [dx, dy] = sampleMesh(warp.mesh, u, v)
    wu += dx
    wv += dy
  }
  return applyHomography(H, wu, wv)
}

export interface DenseMesh {
  /** Clip-space x, y per vertex. */
  positions: Float32Array
  /** Unit-space u, v per vertex. */
  uvs: Float32Array
  indices: Uint16Array
}

/**
 * Tessellate the warp densely.
 *
 * Interpolating texture coordinates linearly across a few large triangles
 * of a homography bends straight lines at the diagonals; at this density
 * the error is far below a pixel.
 */
export function buildDenseMesh(warp: Warp): DenseMesh {
  const meshCols = warp.mesh ? warp.mesh.cols : 2
  const meshRows = warp.mesh ? warp.mesh.rows : 2
  const sx = Math.min(192, Math.max(48, (meshCols - 1) * 12))
  const sy = Math.min(192, Math.max(48, (meshRows - 1) * 12))
  const H = squareToQuad(warp.corners)
  const count = (sx + 1) * (sy + 1)
  const positions = new Float32Array(count * 2)
  const uvs = new Float32Array(count * 2)
  let k = 0
  for (let j = 0; j <= sy; j++) {
    for (let i = 0; i <= sx; i++) {
      const u = i / sx
      const v = j / sy
      const [x, y] = warpPoint(warp, u, v, H)
      positions[k] = x * 2 - 1
      positions[k + 1] = 1 - y * 2
      uvs[k] = u
      uvs[k + 1] = v
      k += 2
    }
  }
  const indices = new Uint16Array(sx * sy * 6)
  let n = 0
  for (let j = 0; j < sy; j++) {
    for (let i = 0; i < sx; i++) {
      const a = j * (sx + 1) + i
      const b = a + 1
      const c = a + sx + 1
      const d = c + 1
      indices.set([a, c, b, b, c, d], n)
      n += 6
    }
  }
  return { positions, uvs, indices }
}

/**
 * Lay N outputs side by side across the canvas with a shared overlap.
 * ``overlap`` is the fraction of each output's width shared with its
 * neighbour; the matching blend ramps are returned with the rects.
 */
export function sideBySide(count: number, overlap: number) {
  const w = 1 / (count - (count - 1) * overlap)
  return Array.from({ length: count }, (_, i) => ({
    source: { x: i * w * (1 - overlap), y: 0, w, h: 1 },
    blendLeft: i > 0 ? overlap : 0,
    blendRight: i < count - 1 ? overlap : 0,
  }))
}

/** Normalise geometry coming from the server, which may predate a field. */
export function withDefaults<T extends { warp?: Partial<Warp>; blend?: Partial<Blend>; color?: Partial<ColorAdjust> }>(
  output: T,
): T & { warp: Warp; blend: Blend; color: ColorAdjust } {
  const blend = defaultBlend()
  for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
    blend[edge] = { ...blend[edge], ...(output.blend?.[edge] ?? {}) }
  }
  return {
    ...output,
    warp: {
      corners: output.warp?.corners?.length === 4 ? output.warp.corners : defaultWarp().corners,
      mesh: output.warp?.mesh ?? null,
    },
    blend,
    color: { ...defaultColor(), ...(output.color ?? {}) },
  }
}

/** Which part of a canvas slice is being dragged: the body, an edge or a corner. */
export type RectHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const MIN_SLICE = 0.02

/** The edge in ``targets`` nearest to any of ``edges``, as a shift, if within ``within``. */
function snapShift(edges: number[], targets: number[], within: number): number {
  let best = 0
  let bestDistance = within
  for (const e of edges) {
    for (const t of targets) {
      const d = Math.abs(t - e)
      if (d < bestDistance) {
        bestDistance = d
        best = t - e
      }
    }
  }
  return best
}

/**
 * A canvas slice after dragging ``handle`` by ``dx``/``dy`` (canvas fractions).
 *
 * Edges snap to the canvas border and to the edges of ``others`` when they
 * come within ``snapX``/``snapY``, so outputs butt up against each other
 * without a gap or a sliver of overlap. The slice stays on the canvas.
 */
export function dragRect(
  start: SourceRect,
  handle: RectHandle,
  dx: number,
  dy: number,
  others: SourceRect[],
  snapX: number,
  snapY: number,
): SourceRect {
  const xs = [0, 1, ...others.flatMap((o) => [o.x, o.x + o.w])]
  const ys = [0, 1, ...others.flatMap((o) => [o.y, o.y + o.h])]
  if (handle === 'move') {
    let x = start.x + dx
    let y = start.y + dy
    x += snapShift([x, x + start.w], xs, snapX)
    y += snapShift([y, y + start.h], ys, snapY)
    if (start.w <= 1) x = Math.min(Math.max(x, 0), 1 - start.w)
    if (start.h <= 1) y = Math.min(Math.max(y, 0), 1 - start.h)
    return { ...start, x, y }
  }
  let left = start.x
  let right = start.x + start.w
  let top = start.y
  let bottom = start.y + start.h
  if (handle.includes('w')) {
    left = start.x + dx
    left = Math.min(Math.max(left + snapShift([left], xs, snapX), 0), right - MIN_SLICE)
  }
  if (handle.includes('e')) {
    right = start.x + start.w + dx
    right = Math.max(Math.min(right + snapShift([right], xs, snapX), 1), left + MIN_SLICE)
  }
  if (handle.includes('n')) {
    top = start.y + dy
    top = Math.min(Math.max(top + snapShift([top], ys, snapY), 0), bottom - MIN_SLICE)
  }
  if (handle.includes('s')) {
    bottom = start.y + start.h + dy
    bottom = Math.max(Math.min(bottom + snapShift([bottom], ys, snapY), 1), top + MIN_SLICE)
  }
  return { x: left, y: top, w: right - left, h: bottom - top }
}
