/**
 * The canvas map: the camera's photo of the building, straightened into the
 * show's canvas, with each calibrated projector's light tinted on it.
 *
 * After the Camera tab's Correct step each output's box on the canvas is
 * the part of the picture its light covers; laid over this map the boxes
 * sit on the real building, where the camera saw them land.
 */

import { useEffect, useState } from 'react'
import { mappingApi, snapshotUrl } from '../api'
import { gridFromView, gridMapper } from '../cameraView'
import type { CalibrationGrid, Output, Show } from '../types'
import { outputColor } from './panels'

/** Width of the map image, pixels; the height follows the canvas's shape. */
const MAP_WIDTH = 1280

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Cells within ``reach`` of a set cell (grow) or of an unset one (shrink). */
function morph(cells: Uint8Array, cols: number, rows: number, reach: number, grow: boolean): Uint8Array {
  const out = new Uint8Array(cells.length)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let hit = !grow
      for (let dr = -reach; dr <= reach && hit !== grow; dr++) {
        for (let dc = -reach; dc <= reach; dc++) {
          const rr = r + dr
          const cc = c + dc
          const on = rr >= 0 && cc >= 0 && rr < rows && cc < cols && cells[rr * cols + cc] === 1
          if (on === grow) {
            hit = grow
            break
          }
        }
      }
      out[r * cols + c] = hit ? 1 : 0
    }
  }
  return out
}

/**
 * Lit cells of a calibration, with the gaps closed: dark glass or someone
 * walking past leaves unlit cells inside the light, which the projector
 * still covers. Notches a few cells wide are closed first; then a cell
 * counts as lit unless unlit cells connect it to the edge of the photo.
 */
function lightShape(grid: CalibrationGrid): Uint8Array {
  const { cols, rows } = grid
  const seen = Uint8Array.from(grid.points, (p) => (p === null ? 0 : 1))
  const closed = morph(morph(seen, cols, rows, 2, true), cols, rows, 2, false)
  const outside = new Uint8Array(cols * rows)
  const stack: number[] = []
  const push = (c: number, r: number) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return
    const i = r * cols + c
    if (outside[i] || closed[i]) return
    outside[i] = 1
    stack.push(i)
  }
  for (let c = 0; c < cols; c++) {
    push(c, 0)
    push(c, rows - 1)
  }
  for (let r = 0; r < rows; r++) {
    push(0, r)
    push(cols - 1, r)
  }
  while (stack.length) {
    const i = stack.pop()!
    const c = i % cols
    const r = (i - c) / cols
    push(c + 1, r)
    push(c - 1, r)
    push(c, r + 1)
    push(c, r - 1)
  }
  return outside.map((o) => 1 - o)
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No camera photo'))
    img.src = url
  })
}

interface Light {
  shape: Uint8Array
  cols: number
  rows: number
  color: [number, number, number]
}

/** Paint the map: photo through the canvas → photo mapping, light tinted, its edge drawn. */
function paint(photo: HTMLImageElement, show: Show, lights: Light[]): string {
  const width = MAP_WIDTH
  const height = Math.max(1, Math.round((MAP_WIDTH * show.canvas_height) / show.canvas_width))
  const source = document.createElement('canvas')
  source.width = photo.naturalWidth
  source.height = photo.naturalHeight
  const sctx = source.getContext('2d', { willReadFrequently: true })!
  sctx.drawImage(photo, 0, 0)
  const pixels = sctx.getImageData(0, 0, source.width, source.height).data
  const pw = source.width
  const ph = source.height

  const toPhoto = gridMapper(gridFromView(show.camera_view))
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const octx = out.getContext('2d')!
  const image = octx.createImageData(width, height)
  const data = image.data
  // Which light covers each map pixel, as a bit per light, for the edges below.
  const cover = new Uint16Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [fx, fy] = toPhoto((x + 0.5) / width, (y + 0.5) / height)
      const o = (y * width + x) * 4
      let r = 0
      let g = 0
      let b = 0
      if (fx >= 0 && fx < 1 && fy >= 0 && fy < 1) {
        const p = (Math.floor(fy * ph) * pw + Math.floor(fx * pw)) * 4
        r = pixels[p] * 0.8
        g = pixels[p + 1] * 0.8
        b = pixels[p + 2] * 0.8
        let bits = 0
        lights.forEach((light, k) => {
          if (light.shape[Math.floor(fy * light.rows) * light.cols + Math.floor(fx * light.cols)]) {
            bits |= 1 << k
            r = r * 0.82 + light.color[0] * 0.18
            g = g * 0.82 + light.color[1] * 0.18
            b = b * 0.82 + light.color[2] * 0.18
          }
        })
        cover[y * width + x] = bits
      }
      data[o] = r
      data[o + 1] = g
      data[o + 2] = b
      data[o + 3] = 255
    }
  }
  // Each light's outline, two pixels wide.
  lights.forEach((light, k) => {
    const bit = 1 << k
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x
        if (!(cover[i] & bit)) continue
        const edge = !(cover[i - 1] & bit) || !(cover[i + 1] & bit) || !(cover[i - width] & bit) || !(cover[i + width] & bit)
          || !(cover[i - 2] & bit) || !(cover[i + 2] & bit) || !(cover[i - 2 * width] & bit) || !(cover[i + 2 * width] & bit)
        if (!edge) continue
        data[i * 4] = light.color[0]
        data[i * 4 + 1] = light.color[1]
        data[i * 4 + 2] = light.color[2]
      }
    }
  })
  octx.putImageData(image, 0, 0)
  return out.toDataURL('image/jpeg', 0.85)
}

/**
 * The canvas map of ``show`` as an image URL, or null before the canvas has
 * been placed on a camera's photo. Rebuilt when the placement or a
 * calibration changes.
 */
export function useCanvasMap(show: Show, outputs: Output[]): string | null {
  const [map, setMap] = useState<string | null>(null)
  const view = show.camera_view
  const calibrated = outputs
    .map((output, index) => ({ output, index }))
    .filter(({ output }) => view != null && output.calibration?.camera_id === view.camera_id && output.blend.auto !== false)
  const key = JSON.stringify([view, show.canvas_width, show.canvas_height,
    calibrated.map(({ output, index }) => [output.id, index, output.calibration?.captured_at])])

  useEffect(() => {
    if (!view) {
      setMap(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const photo = await loadImage(snapshotUrl(view.camera_id, Date.now()))
        const grids = await Promise.all(calibrated.map(({ output }) => mappingApi.calibrationGrid(output.id)))
        const lights = grids.map((grid, k) => ({
          shape: lightShape(grid),
          cols: grid.cols,
          rows: grid.rows,
          color: rgb(outputColor(calibrated[k].index)),
        }))
        if (!cancelled) setMap(paint(photo, show, lights))
      } catch {
        if (!cancelled) setMap(null)
      }
    })()
    return () => {
      cancelled = true
    }
    // ``key`` stands for everything the map is drawn from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return map
}
