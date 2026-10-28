/**
 * Straightened house parts: drawing on a sloped roof without stretching.
 *
 * A projector and the people watching stand in different places, so a
 * picture that looks right on the walls comes out slanted and stretched on
 * a roof that slopes away at an angle. Each house part can carry a "flat
 * view" (``surface.flat.corners``): where a true square has to be drawn on
 * the canvas so it looks square on that part from the street. Its
 * homography maps the part's own flat space onto the canvas.
 *
 * Spaces: canvas fractions (x, y in 0..1); "H units", canvas fractions with
 * x times the canvas aspect so both axes are in canvas heights (how objects
 * are sized); and the part's flat space, in H units too: the square is
 * ``side`` by ``side`` with ``side`` the square root of its area on the
 * canvas, so objects keep about the size they had.
 *
 * Objects on a straightened part stay where they were put: only their
 * shape, size and motion are worked out in flat space and then drawn
 * through the homography (the objects and countdown shaders).
 */

import { applyHomography, invertHomography, isConvex, squareToQuad, type Homography } from '../geometry'
import type { Point, Surface, SurfaceFlat } from '../types'

/** Most straightened parts the shaders take at once. */
export const MAX_FLAT = 8

export interface FlatPart {
  surface: Surface
  /** Flat space → canvas, H units. */
  toCanvas: Homography
  /** Canvas → flat space, H units. */
  toFlat: Homography
  /** Side of the square in flat space (H units). */
  side: number
}

function area(corners: Point[]): number {
  let sum = 0
  for (let i = 0; i < corners.length; i++) {
    const [ax, ay] = corners[i]
    const [bx, by] = corners[(i + 1) % corners.length]
    sum += ax * by - bx * ay
  }
  return Math.abs(sum) / 2
}

/** A usable flat view: four corners, not folded over and not squashed flat. */
export function flatUsable(flat: SurfaceFlat | null | undefined): flat is SurfaceFlat {
  return !!flat && flat.corners.length === 4 && isConvex(flat.corners) && area(flat.corners) > 1e-6
}

/** The homographies of one flat view; null when its corners are unusable. */
export function flatHomography(flat: SurfaceFlat | null | undefined, aspect: number): Omit<FlatPart, 'surface'> | null {
  if (!flatUsable(flat)) return null
  const corners = flat.corners.map(([x, y]) => [x * aspect, y] as Point)
  const side = Math.sqrt(area(corners))
  const q = squareToQuad(corners)
  // Flat (0..side)² → unit square → the quad.
  const k = 1 / side
  const toCanvas: Homography = [q[0] * k, q[1] * k, q[2], q[3] * k, q[4] * k, q[5], q[6] * k, q[7] * k, q[8]]
  return { toCanvas, toFlat: invertHomography(toCanvas), side }
}

/** The straightened parts of a show, at most MAX_FLAT, in drawing order. */
export function flatParts(surfaces: Surface[], aspect: number): FlatPart[] {
  const parts: FlatPart[] = []
  for (const surface of surfaces) {
    const h = surface.flat ? flatHomography(surface.flat, aspect) : null
    if (h) parts.push({ surface, ...h })
    if (parts.length >= MAX_FLAT) break
  }
  return parts
}

function inside(points: Point[], x: number, y: number): boolean {
  let hit = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/** The straightened part a canvas point (fractions) is on, the last one traced winning; null if none. */
export function flatAt(surfaces: Surface[], x: number, y: number, aspect: number): FlatPart | null {
  const parts = flatParts(surfaces, aspect)
  for (let i = parts.length - 1; i >= 0; i--) {
    if (inside(parts[i].surface.points, x, y)) return parts[i]
  }
  return null
}

/** Whether a part's checkerboard square should be on the projectors now (server clock, ms). */
export function flatTesting(surface: Surface, now: number): boolean {
  return flatUsable(surface.flat) && surface.flat.test_until != null && surface.flat.test_until > now
}

/** A starting square for a part: centred on it, upright, about half its size. */
export function startingSquare(surface: Surface, aspect: number): Point[] {
  const xs = surface.points.map((p) => p[0])
  const ys = surface.points.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const side = 0.6 * Math.min((x1 - x0) * aspect, y1 - y0)
  const hx = side / 2 / aspect
  const hy = side / 2
  return [[cx - hx, cy - hy], [cx + hx, cy - hy], [cx + hx, cy + hy], [cx - hx, cy + hy]]
}

/** A homography as a GLSL mat3 (column major). */
export function glMat3(m: Homography): number[] {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]
}

/**
 * Which straightened part each spot of the canvas is on, for the objects
 * shader: red is the part's number plus one (0 for none), over the whole
 * canvas, top row first.
 */
export function rasteriseFlatIndex(
  parts: FlatPart[],
  width: number,
  height: number,
  canvas: HTMLCanvasElement = document.createElement('canvas'),
): HTMLCanvasElement {
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  parts.forEach((part, i) => {
    ctx.beginPath()
    part.surface.points.forEach(([x, y], k) => (k === 0 ? ctx.moveTo(x * width, y * height) : ctx.lineTo(x * width, y * height)))
    ctx.closePath()
    // Exact levels the shader reads back as whole numbers.
    ctx.fillStyle = `rgb(${(i + 1) * 16}, 0, 0)`
    ctx.fill()
  })
  return canvas
}

/** A canvas point (fractions) moved by ``d`` (H units) in a part's flat space, back in fractions. */
export function flatOffset(part: FlatPart, x: number, y: number, d: Point, aspect: number): Point {
  const [fx, fy] = applyHomography(part.toFlat, x * aspect, y)
  const [cx, cy] = applyHomography(part.toCanvas, fx + d[0], fy + d[1])
  return [cx / aspect, cy]
}

/**
 * The checkerboard square shown on the projectors while the corners are
 * set: 8 by 8 squares, a circle that should look round, and a dot in the
 * top-left corner. From the street it looks square when the corners are right.
 */
export const CHECKER_VERTEX = `#version 300 es
precision highp float;
uniform mat3 uTo;
uniform float uSide;
uniform vec4 uRect;
uniform float uAspect;
out vec2 vQ;
void main() {
  int v = gl_VertexID;
  vec2 q = v == 0 ? vec2(0.0, 0.0) : (v == 1 || v == 4) ? vec2(1.0, 0.0) : (v == 2 || v == 3) ? vec2(0.0, 1.0) : vec2(1.0, 1.0);
  vec3 hc = uTo * vec3(q * uSide, 1.0);
  vec2 uv = (vec2(hc.x / hc.z / uAspect, hc.y / hc.z) - uRect.xy) / uRect.zw;
  gl_Position = vec4((uv.x * 2.0 - 1.0) * hc.z, (1.0 - uv.y * 2.0) * hc.z, 0.0, hc.z);
  vQ = q;
}`

export const CHECKER_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vQ;
out vec4 outColor;
void main() {
  vec2 q = vQ;
  vec2 cell = floor(q * 8.0);
  float light = mod(cell.x + cell.y, 2.0);
  vec3 c = mix(vec3(0.05, 0.15, 0.45), vec3(1.0), light);
  float a = mix(0.55, 0.9, light);
  // Edges and the round circle in yellow, thick enough to see from the street.
  vec2 w = fwidth(q) * 2.5;
  float edge = 1.0 - min(smoothstep(0.0, w.x, min(q.x, 1.0 - q.x)), smoothstep(0.0, w.y, min(q.y, 1.0 - q.y)));
  float r = length(q - 0.5);
  float ring = 1.0 - smoothstep(0.0, max(w.x, w.y), abs(r - 0.38));
  float dot0 = 1.0 - smoothstep(0.06, 0.06 + w.x, length(q - vec2(0.09)));
  float line = max(max(edge, ring), dot0);
  c = mix(c, vec3(1.0, 0.85, 0.1), line);
  a = max(a, line);
  outColor = vec4(c * a, a);
}`
