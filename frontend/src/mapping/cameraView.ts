/**
 * Where the show's canvas sits on a camera's photo (``show.camera_view``):
 * four corners, optionally refined by a hand-placed grid of points.
 */

import { applyHomography, squareToQuad } from './geometry'
import type { CameraView, Point } from './types'

const DEFAULT_CORNERS: Point[] = [
  [0.15, 0.15],
  [0.85, 0.15],
  [0.85, 0.85],
  [0.15, 0.85],
]

export interface Grid {
  cols: number
  rows: number
  points: Point[]
}

export function gridFromView(view: CameraView | null | undefined): Grid {
  if (view?.mesh) return { cols: view.mesh.cols, rows: view.mesh.rows, points: view.mesh.points }
  const [tl, tr, br, bl] = view?.corners ?? DEFAULT_CORNERS
  return { cols: 2, rows: 2, points: [tl, tr, bl, br] }
}

export function gridCorners(grid: Grid): Point[] {
  const { cols, rows, points } = grid
  return [points[0], points[cols - 1], points[cols * rows - 1], points[cols * (rows - 1)]]
}

/** Where canvas point (u, v) is on the photo: the corners' homography plus the hand offsets. */
export function gridPoint(grid: Grid, u: number, v: number): Point {
  return gridMapper(grid)(u, v)
}

/** gridPoint for many points of one grid, with the homography worked out once. */
export function gridMapper(grid: Grid): (u: number, v: number) => Point {
  const flat = squareToQuad(gridCorners(grid))
  if (grid.cols === 2 && grid.rows === 2) return (u, v) => applyHomography(flat, u, v)
  // The hand offsets at each grid point, from where the corners alone put it.
  const offsets = grid.points.map(([px, py], index) => {
    const [fx, fy] = applyHomography(flat, (index % grid.cols) / (grid.cols - 1),
      Math.floor(index / grid.cols) / (grid.rows - 1))
    return [px - fx, py - fy] as Point
  })
  return (u, v) => {
    const [x, y] = applyHomography(flat, u, v)
    const gx = Math.min(Math.max(u, 0), 1) * (grid.cols - 1)
    const gy = Math.min(Math.max(v, 0), 1) * (grid.rows - 1)
    const c = Math.min(Math.floor(gx), grid.cols - 2)
    const r = Math.min(Math.floor(gy), grid.rows - 2)
    const tx = gx - c
    const ty = gy - r
    const at = (dc: number, dr: number) => offsets[(r + dr) * grid.cols + c + dc]
    const [a, b, d, e] = [at(0, 0), at(1, 0), at(0, 1), at(1, 1)]
    const w00 = (1 - tx) * (1 - ty)
    const w10 = tx * (1 - ty)
    const w01 = (1 - tx) * ty
    const w11 = tx * ty
    return [x + w00 * a[0] + w10 * b[0] + w01 * d[0] + w11 * e[0],
      y + w00 * a[1] + w10 * b[1] + w01 * d[1] + w11 * e[1]]
  }
}
