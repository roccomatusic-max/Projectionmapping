/**
 * Projectors of different resolutions on one house picture.
 *
 * The show is made on one picture of the whole house (the canvas). Each
 * projector shows its own box of it at its own resolution, so a box must
 * have the projector's shape: a 16:10 projector showing a 16:9 box (or half
 * the picture, as the first side-by-side layout gave) stretches everything
 * it shows. These work out boxes of the right shape, say how far off one
 * is, and lay several out side by side, overlapping or apart.
 */

import type { Output, SourceRect } from './types'
import type { RectHandle } from './geometry'

/** A box's width over its height, in canvas fractions, for the projector's shape. */
export function shapeRatio(output: Pick<Output, 'width' | 'height'>, canvasWidth: number, canvasHeight: number): number {
  const projector = output.width / Math.max(1, output.height)
  const canvas = canvasWidth / Math.max(1, canvasHeight)
  return projector / canvas
}

/** How much wider than it should be the box shows things: 1 is right, 1.2 is 20% too wide. */
export function stretchOf(output: Output, canvasWidth: number, canvasHeight: number): number {
  const s = output.source
  return s.w / Math.max(1e-6, s.h) / shapeRatio(output, canvasWidth, canvasHeight)
}

/** Corners where they started and no mesh moved: nobody has lined it up by hand. */
export function warpUntouched(output: Output): boolean {
  const unit = [[0, 0], [1, 0], [1, 1], [0, 1]]
  const corners = output.warp?.corners ?? unit
  if (corners.some(([x, y], i) => Math.abs(x - unit[i][0]) > 1e-3 || Math.abs(y - unit[i][1]) > 1e-3)) return false
  const mesh = output.warp?.mesh
  return !mesh || mesh.points.every(([dx, dy]) => Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3)
}

/** Off by more than this is worth saying (a few percent is not seen on a house). */
const OFF = 0.03

/**
 * The box is the wrong shape for its projector, so what it shows is
 * stretched. A projector lined up by hand or by the camera is left out:
 * its corners were set to make the picture fit the house, shape and all.
 */
export function shapeIsOff(output: Output, canvasWidth: number, canvasHeight: number): boolean {
  if (!warpUntouched(output) || output.calibration) return false
  return Math.abs(stretchOf(output, canvasWidth, canvasHeight) - 1) > OFF
}

/** "40% too wide" or "25% too tall". */
export function stretchWords(stretch: number): string {
  return stretch >= 1
    ? `${Math.round((stretch - 1) * 100)}% too wide`
    : `${Math.round((1 / stretch - 1) * 100)}% too tall`
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** ``source`` given its projector's shape: same middle and width (or as wide as fits). */
export function fitShape(source: SourceRect, ratio: number): SourceRect {
  let w = source.w
  let h = w / ratio
  if (h > 1) {
    h = 1
    w = Math.min(1, ratio)
  }
  if (w > 1) {
    w = 1
    h = 1 / ratio
  }
  const cx = source.x + source.w / 2
  const cy = source.y + source.h / 2
  return {
    x: clamp01(Math.min(1 - w, Math.max(0, cx - w / 2))),
    y: clamp01(Math.min(1 - h, Math.max(0, cy - h / 2))),
    w,
    h,
  }
}

export type Arrangement = 'side' | 'overlap' | 'apart'

export const ARRANGEMENTS: Array<{ id: Arrangement; label: string; hint: string }> = [
  { id: 'side', label: 'Side by side', hint: 'Left to right, edges touching: one picture across the house' },
  { id: 'overlap', label: 'Overlapping', hint: 'Left to right, each overlapping the next a little, with the seam blended' },
  { id: 'apart', label: 'Apart', hint: 'Left to right with a gap between: each lights its own part of the house' },
]

/** How much of the narrower of two neighbours they share, overlapping. */
export const OVERLAP = 0.15
/** The gap between projectors set apart, in widths of the picture. */
export const GAP = 0.04

/**
 * Boxes for ``outputs`` (in their order) laid out left to right, each in
 * its projector's shape, all the same height, filling the picture's width
 * (or its height, for tall projectors), centred.
 */
export function arrange(outputs: Output[], canvasWidth: number, canvasHeight: number, how: Arrangement): SourceRect[] {
  const n = outputs.length
  if (n === 0) return []
  const ratios = outputs.map((o) => shapeRatio(o, canvasWidth, canvasHeight))
  // Each neighbour pair shares this much, in units of the common height.
  const shared = ratios.slice(1).map((r, i) => (how === 'overlap' ? OVERLAP * Math.min(r, ratios[i]) : 0))
  const gap = how === 'apart' ? GAP : 0
  const span = ratios.reduce((a, b) => a + b, 0) - shared.reduce((a, b) => a + b, 0)
  // As tall as lets the row fill the width, but never taller than the picture.
  const h = Math.min(1, (1 - gap * (n - 1)) / span)
  let x = (1 - (h * span + gap * (n - 1))) / 2
  const y = (1 - h) / 2
  return ratios.map((r, i) => {
    const w = h * r
    const rect = { x, y, w, h }
    x += w + gap - (i < n - 1 ? h * shared[i] : 0)
    return rect
  })
}

/**
 * ``next``, from dragging ``handle`` of a box that started as ``start``,
 * kept in the projector's shape: a side pulls the other way too (about the
 * middle), a corner keeps the opposite corner where it was.
 */
export function keepShape(next: SourceRect, start: SourceRect, handle: RectHandle, ratio: number): SourceRect {
  if (handle === 'move') return next
  let { x, y, w, h } = next
  if (handle === 'e' || handle === 'w') {
    h = w / ratio
    y = start.y + start.h / 2 - h / 2
  } else if (handle === 'n' || handle === 's') {
    w = h * ratio
    x = start.x + start.w / 2 - w / 2
  } else {
    // Whichever the pointer moved more decides the size.
    if (w / ratio >= h) h = w / ratio
    else w = h * ratio
    if (handle.includes('w')) x = start.x + start.w - w
    else x = start.x
    if (handle.includes('n')) y = start.y + start.h - h
    else y = start.y
  }
  return { x, y, w, h }
}
