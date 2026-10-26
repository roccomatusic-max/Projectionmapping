/**
 * Small pictures of library elements for the "Add an element" search.
 *
 * Flying and walking ones are their own drawings (sprites.ts) stamped
 * straight onto a 2D canvas, a frame at a time, which costs nothing. The
 * rest (objects, live info, countdowns, snow) are drawn by the real scene
 * engine on one shared, hidden WebGL canvas and copied out, so a picture
 * looks exactly like it will on the house; one GL canvas serves every
 * card, as browsers only allow a few at once.
 */

import { OutputRenderer } from '../renderer'
import type { LibraryItem } from '../scene/library'
import { paintAtlas } from '../scene/movers'
import { SPRITE_ROWS, type SpriteRow } from '../scene/sprites'
import type { MappingScene, SceneLayer, Surface } from '../types'
import { wholeCanvasOutput } from './ScenePreview'

export const THUMB_W = 192
export const THUMB_H = 120

/** The canvas the GL pictures are drawn on, in design pixels (same shape as a card). */
const CANVAS_W = 1600
const CANVAS_H = 1000

/** A window for snow to settle on. */
const THUMB_SURFACES: Surface[] = [
  { id: 'w', name: 'Window', kind: 'window', points: [[0.3, 0.32], [0.7, 0.32], [0.7, 0.72], [0.3, 0.72]] },
]

let gl: { canvas: HTMLCanvasElement; renderer: OutputRenderer } | null = null
let glFailed = false

function glRenderer() {
  if (gl || glFailed) return gl
  try {
    const canvas = document.createElement('canvas')
    const scale = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(THUMB_W * scale)
    canvas.height = Math.round(THUMB_H * scale)
    const renderer = new OutputRenderer(canvas, 256)
    renderer.setOutput(wholeCanvasOutput(0, 0, 'Element picture', canvas.width, canvas.height), CANVAS_W, CANVAS_H)
    gl = { canvas, renderer }
  } catch {
    glFailed = true
  }
  return gl
}

/** The layer as the picture shows it: one of it, big, in the middle. */
function shown(layer: SceneLayer): SceneLayer {
  if (layer.type === 'shapes') return { ...layer, size: 1, pins: [{ x: 0.5, y: 0.5, size: 2.7, rotation: 0 }] }
  if (layer.type === 'info') {
    const message = layer.style === 'message'
    return { ...layer, size: message ? 1 : 0.9, pins: [{ x: 0.5, y: 0.5, size: message ? 1.6 : 1, rotation: 0 }] }
  }
  if (layer.type === 'countdown') return { ...layer, size: 0.9, pins: [{ x: 0.5, y: 0.5, size: 1, rotation: 0 }] }
  if (layer.type === 'snowcap') return { ...layer, size: 0.9, amount: 1, speed: 1, target: 'windows' }
  return layer
}

function paintGl(layer: SceneLayer, ctx: CanvasRenderingContext2D, time: number) {
  const r = glRenderer()
  if (!r) return false
  const scene: MappingScene = { id: -1, name: '', description: '', layers: [shown(layer)], created_at: '', updated_at: '' }
  r.renderer.render({
    scenes: [{ scene, weight: 1, time, clock: Date.now() }],
    surfaces: THUMB_SURFACES,
    frameTime: performance.now() / 1000,
    now: Date.now(),
  })
  ctx.drawImage(r.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height)
  return true
}

// -- flying and walking ones, from their drawings ---------------------------------------------------

const atlases = new Map<string, ReturnType<typeof paintAtlas>>()

function atlasFor(style: string, layer: SceneLayer) {
  const key = [style, layer.color, layer.color2].join('|')
  let atlas = atlases.get(key)
  if (!atlas) {
    const rows = SPRITE_ROWS[style]
    // About the size a card shows them.
    const scale = Math.min(1, (THUMB_H * 2) / rows[0].h)
    atlas = paintAtlas(rows, scale, { color: layer.color, color2: layer.color2 })
    atlases.set(key, atlas)
  }
  return atlas
}

function stamp(ctx: CanvasRenderingContext2D, style: string, layer: SceneLayer, rowId: string, frame: number,
  cx: number, cy: number, height: number, flip = false) {
  const rows: SpriteRow[] = SPRITE_ROWS[style]
  const row = rows.find((r) => r.id === rowId) ?? rows[0]
  const { canvas, cells } = atlasFor(style, layer)
  const list = cells.get(row.id)!
  const cell = list[((frame % list.length) + list.length) % list.length]
  const w = (height * row.w) / row.h
  ctx.save()
  ctx.translate(cx, cy)
  if (flip) ctx.scale(-1, 1)
  ctx.drawImage(canvas, cell.u * canvas.width, cell.v * canvas.height, cell.du * canvas.width, cell.dv * canvas.height,
    -w / 2, -height / 2, w, height)
  ctx.restore()
}

const FLOCKS = new Set(['birds', 'bats', 'butterflies', 'fish'])

function paintSprites(layer: SceneLayer, ctx: CanvasRenderingContext2D, time: number) {
  const style = layer.style
  if (!SPRITE_ROWS[style]) return
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  const f = Math.floor(time * 9)
  const main = SPRITE_ROWS[style][0]
  if (style === 'rockets') {
    // A burst in two colours, as it shows when one goes off.
    const k = 0.55 + 0.45 * ((time * 0.6) % 1)
    for (const [ring, n, row] of [[0.42, 18, 'spark1'], [0.24, 12, 'spark2']] as const) {
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2
        stamp(ctx, style, layer, row, 0, W / 2 + Math.cos(a) * H * ring * k, H / 2 + Math.sin(a) * H * ring * k, H * 0.12)
      }
    }
    return
  }
  if (style === 'balloons') {
    ;[[0.3, 0.55, 0], [0.5, 0.42, 1], [0.7, 0.58, 2]].forEach(([x, y, i]) =>
      stamp(ctx, style, layer, 'main', i, W * x, H * y + Math.sin(time * 2 + i) * H * 0.03, H * 0.8))
    return
  }
  if (FLOCKS.has(style)) {
    ;[[0.3, 0.38, 0.42], [0.62, 0.3, 0.36], [0.5, 0.66, 0.4], [0.8, 0.6, 0.3]].forEach(([x, y, s], i) =>
      stamp(ctx, style, layer, 'main', f + i * 3, W * x, H * y, H * s))
    return
  }
  if (style === 'ufo') {
    stamp(ctx, style, layer, 'beam', 0, W / 2, H * 0.68, H * 0.6)
    stamp(ctx, style, layer, 'main', Math.floor(time * 4), W / 2, H * 0.36, H * 0.48)
    return
  }
  // One, as big as fits.
  const fit = Math.min((H * 0.86) / main.h, (W * 0.92) / main.w)
  stamp(ctx, style, layer, 'main', f, W / 2, H / 2, main.h * fit)
}

/** Paint an element's picture into a card's canvas; time in seconds moves it along. */
export function paintThumb(item: LibraryItem, layer: SceneLayer, canvas: HTMLCanvasElement, time: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#05070c'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (item.type === 'movers') paintSprites(layer, ctx, time)
  else paintGl(layer, ctx, time)
}
