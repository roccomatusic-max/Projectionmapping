/**
 * Automatic edge blending where projectors overlap.
 *
 * Every output that takes part shares each point of the canvas it shows
 * with the other outputs showing that point, in proportion to how far the
 * point is from the edge of each one's picture (squared, so each share
 * fades out smoothly rather than stopping at a corner). The shares add up
 * to one everywhere, whatever the shape of the overlap: slanted by
 * keystone, bent by a curved wall, or three projectors deep.
 *
 * Distances are measured on the canvas, in canvas pixels, to the nearer of
 * the output's slice edge and the edge of its projector's image (the warp
 * maps the canvas onto the projector; the distance to the image edge is its
 * output-pixel distance over the warp's local scale).
 *
 * Which outputs take part (``blendsByItself``): the operator's choice in
 * the Blend tab, otherwise every output calibrated with a camera, whose
 * warp is known to put each canvas point on the same spot of the building
 * as every other calibrated output's. Overlapping slices on hand-placed
 * projectors may mean the same picture on two different walls, so those
 * only blend when asked.
 */

import { squareToQuad, warpPoint, type Homography } from './geometry'
import type { Mask, Output, Point } from './types'

/** Weight samples across the output's slice, each way, at texel centres. */
export const BLEND_MAP_SIZE = 128

export function blendsByItself(output: Output): boolean {
  if (!output.enabled) return false
  const auto = output.blend.auto
  return auto == null ? output.calibration != null : auto
}

interface Part {
  id: number
  x: number
  y: number
  w: number
  h: number
  /** Output pixels. */
  ow: number
  oh: number
  output: Output
  H: Homography
  masks: Mask[]
}

function insidePolygon(points: Point[], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function maskedOut(masks: Mask[], x: number, y: number): boolean {
  for (const mask of masks) {
    if (insidePolygon(mask.points, x, y) !== mask.invert) return true
  }
  return false
}

/** How far canvas point (cx, cy) is inside one output's picture, canvas pixels; 0 outside. */
function depth(part: Part, cx: number, cy: number, cw: number, ch: number): number {
  const u = (cx - part.x) / part.w
  const v = (cy - part.y) / part.h
  if (u < 0 || u > 1 || v < 0 || v > 1) return 0
  const slice = Math.min(Math.min(u, 1 - u) * part.w * cw, Math.min(v, 1 - v) * part.h * ch)
  if (slice <= 0) return 0
  const [qx, qy] = warpPoint(part.output.warp, u, v, part.H)
  if (qx < 0 || qx > 1 || qy < 0 || qy > 1) return 0
  if (part.masks.length && maskedOut(part.masks, qx, qy)) return 0
  // The warp's local scale: output pixels per canvas pixel, along each output axis.
  const e = 1e-3
  const [ax, ay] = warpPoint(part.output.warp, Math.min(1, u + e), v, part.H)
  const [bx, by] = warpPoint(part.output.warp, u, Math.min(1, v + e), part.H)
  const du = (Math.min(1, u + e) - u) * part.w * cw || 1
  const dv = (Math.min(1, v + e) - v) * part.h * ch || 1
  const gx = Math.hypot(((ax - qx) * part.ow) / du, ((bx - qx) * part.ow) / dv)
  const gy = Math.hypot(((ay - qy) * part.oh) / du, ((by - qy) * part.oh) / dv)
  const fx = (Math.min(qx, 1 - qx) * part.ow) / Math.max(gx, 1e-6)
  const fy = (Math.min(qy, 1 - qy) * part.oh) / Math.max(gy, 1e-6)
  return Math.min(slice, fx, fy)
}

/** A stable key for what the weights depend on, so they are rebuilt only when it changes. */
export function blendKey(target: Output, outputs: Output[], cw: number, ch: number, separate: number[]): string {
  if (!blendsByItself(target) || separate.includes(target.id)) return ''
  const parts = outputs
    .filter((o) => o.id !== target.id && blendsByItself(o) && !separate.includes(o.id))
    .map((o) => [o.id, o.source, o.warp, o.width, o.height, o.masks.filter((m) => m.enabled)])
  if (!parts.length) return ''
  return JSON.stringify([target.id, target.source, target.warp, target.width, target.height,
    target.masks.filter((m) => m.enabled), parts, cw, ch])
}

/**
 * The share of the light ``target`` gives each point of its slice, as a
 * BLEND_MAP_SIZE² grid of texel centres over the slice (row-major, top row first), or null
 * when it shares no point with another output (nothing to blend).
 */
export function computeBlendMap(
  target: Output,
  outputs: Output[],
  canvasWidth: number,
  canvasHeight: number,
  separate: number[] = [],
): Float32Array | null {
  if (!blendsByItself(target) || separate.includes(target.id)) return null
  const toPart = (o: Output): Part => ({
    id: o.id,
    ...o.source,
    ow: o.width,
    oh: o.height,
    output: o,
    H: squareToQuad(o.warp.corners),
    masks: o.masks.filter((m) => m.enabled && m.points.length >= 3),
  })
  const me = toPart(target)
  const others = outputs
    .filter((o) => o.id !== target.id && blendsByItself(o) && !separate.includes(o.id))
    .filter((o) => o.source.x < me.x + me.w && o.source.x + o.source.w > me.x
      && o.source.y < me.y + me.h && o.source.y + o.source.h > me.y)
    .map(toPart)
  if (!others.length) return null
  const n = BLEND_MAP_SIZE
  const map = new Float32Array(n * n)
  let shared = false
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      // Texel centres: never exactly on a slice edge, where every share is 0.
      const cx = me.x + ((i + 0.5) / n) * me.w
      const cy = me.y + ((j + 0.5) / n) * me.h
      const mine = depth(me, cx, cy, canvasWidth, canvasHeight)
      let total = mine * mine
      for (const other of others) {
        const d = depth(other, cx, cy, canvasWidth, canvasHeight)
        if (d > 0) shared = true
        total += d * d
      }
      // Outside every picture (all distances 0) nothing is lit anyway.
      map[j * n + i] = total > 0 ? (mine * mine) / total : 1
    }
  }
  return shared ? map : null
}
