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

/** One picture centred on cx, cy; with crop below 1 only its top part shows (still placed as if whole). */
function stamp(ctx: CanvasRenderingContext2D, style: string, layer: SceneLayer, rowId: string, frame: number,
  cx: number, cy: number, height: number, flip = false, crop = 1) {
  const rows: SpriteRow[] = SPRITE_ROWS[style]
  const row = rows.find((r) => r.id === rowId) ?? rows[0]
  const { canvas, cells } = atlasFor(style, layer)
  const list = cells.get(row.id)!
  const cell = list[((frame % list.length) + list.length) % list.length]
  const w = (height * row.w) / row.h
  ctx.save()
  ctx.translate(cx, cy)
  if (flip) ctx.scale(-1, 1)
  ctx.drawImage(canvas, cell.u * canvas.width, cell.v * canvas.height, cell.du * canvas.width, cell.dv * canvas.height * crop,
    -w / 2, -height / 2, w, height * crop)
  ctx.restore()
}

const FLOCKS = new Set(['birds', 'bats', 'butterflies', 'fish', 'bees', 'dragonflies', 'hummingbirds', 'pufferfish', 'koi', 'ladybugs', 'moths', 'clownfish'])
/** Small things that come many at a time: shown as a scatter. */
const SCATTER = new Set([
  'snowfall', 'leaves', 'petals', 'confetti', 'falling-hearts', 'clovers', 'fireflies', 'rising-bubbles', 'falling-presents',
  'red-envelopes', 'candy-canes', 'gold-coins', 'falling-candy',
])
/** Ones that float up: three of them. */
const RISERS = new Set(['balloons', 'lanterns', 'jellyfish', 'hot-air-balloons', 'floating-candles'])
/** Ones that sit on the roofline, or hang under it. */
const PERCHERS = new Set(['crows', 'doves', 'cardinals', 'perched-owls', 'seagulls', 'wolves', 'robins'])
/** Ones that peek over a window sill. */
const PEEKERS = new Set(['peeking-ghosts', 'peeking-elves', 'window-cats', 'window-eyes'])
const HANGERS = new Set(['jingle-bells', 'stockings', 'hanging-bats', 'ornaments', 'pinatas'])

function hash(n: number) {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return s - Math.floor(s)
}

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
  if (RISERS.has(style)) {
    // Balloons keep a colour each; lanterns flicker and jellyfish pulse.
    const big = style === 'hot-air-balloons' ? 0.62 : style === 'balloons' ? 0.8 : 0.6
    ;[[0.27, 0.55, 0], [0.5, 0.42, 1], [0.73, 0.58, 2]].forEach(([x, y, i]) =>
      stamp(ctx, style, layer, 'main', style === 'balloons' || style === 'hot-air-balloons' ? i : f + i * 3,
        W * x, H * y - ((time * 0.04 + i * 0.1) % 0.2) * H * 0.3, H * big))
    return
  }
  if (SCATTER.has(style)) {
    const frames = main.frames
    const many = style === 'fireflies' ? 18 : 14
    const big = {
      leaves: 0.2, 'falling-hearts': 0.18, clovers: 0.17, 'rising-bubbles': 0.2, fireflies: 0.13, 'falling-presents': 0.2,
      'red-envelopes': 0.2, 'candy-canes': 0.2, 'gold-coins': 0.15, 'falling-candy': 0.16,
    }[style] ?? 0.13
    for (let i = 0; i < many; i++) {
      const fall = style === 'fireflies' ? Math.sin(time + i) * 0.03 : ((time * 0.06 + hash(i + 9)) % 1) * (style === 'rising-bubbles' ? -1 : 1)
      const y = ((hash(i + 3) + fall) % 1 + 1) % 1
      ctx.save()
      ctx.globalAlpha = style === 'fireflies' ? 0.3 + 0.7 * Math.pow(Math.max(0, Math.sin(time * 2 + i * 7)), 2) : 1
      const x = W * (0.06 + 0.88 * hash(i)) + Math.sin(time + i) * W * 0.02
      ctx.translate(x, H * (0.05 + 0.9 * y))
      ctx.rotate(style === 'fireflies' || style === 'rising-bubbles' ? 0 : time * (0.5 + hash(i + 5)) + i)
      stamp(ctx, style, layer, 'main', Math.floor(hash(i + 7) * frames), 0, 0, H * big * (0.75 + 0.5 * hash(i + 1)))
      ctx.restore()
    }
    return
  }
  if (style === 'hanging-spiders') {
    ;[[0.25, 0.45], [0.52, 0.7], [0.78, 0.38]].forEach(([x, len], i) => {
      const y = H * (len + Math.sin(time * 0.8 + i * 2) * 0.05)
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fillRect(W * x - 1, 0, 2, y - H * 0.1)
      stamp(ctx, style, layer, 'main', f + i * 3, W * x, y, H * 0.32)
    })
    return
  }
  if (style === 'dragon') {
    stamp(ctx, style, layer, 'main', f, W * 0.4, H * 0.5, H * 0.95)
    stamp(ctx, style, layer, 'fire', Math.floor(time * 12), W * 0.84, H * 0.47, H * 0.28)
    return
  }
  if (style === 'ducklings' || style === 'hens') {
    stamp(ctx, style, layer, 'main', f, W * 0.72, H * 0.58, H * 0.5)
    ;[0.48, 0.33, 0.18].forEach((x, i) => stamp(ctx, style, layer, 'baby', f + i * 2, W * x, H * 0.7, H * 0.25))
    return
  }
  if (PERCHERS.has(style) || HANGERS.has(style)) {
    // A roofline with three on it, or under it on ribbons.
    const roof = H * 0.3
    ctx.strokeStyle = 'rgba(148,163,184,0.8)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(0, roof + H * 0.12)
    ctx.lineTo(W * 0.5, roof - H * 0.05)
    ctx.lineTo(W, roof + H * 0.12)
    ctx.stroke()
    const at = (x: number) => roof + H * 0.12 - (1 - Math.abs(x - 0.5) * 2) * H * 0.17
    ;[0.24, 0.5, 0.76].forEach((x, i) => {
      const top = at(x)
      if (PERCHERS.has(style)) {
        const pose = Math.floor(hash(Math.floor(time / 1.3) + i * 7) * 4)
        stamp(ctx, style, layer, 'main', pose, W * x, top - H * 0.19, H * 0.38)
      } else if (style === 'hanging-bats') {
        stamp(ctx, style, layer, 'main', f + i, W * x, top + H * 0.18, H * 0.36)
      } else {
        const len = H * (0.18 + (i % 2) * 0.14)
        const swing = Math.sin(time * 1.4 + i * 2) * 0.12
        ctx.save()
        ctx.translate(W * x, top)
        ctx.rotate(swing)
        stamp(ctx, style, layer, 'thread', 0, 0, len / 2, len)
        stamp(ctx, style, layer, 'main', style === 'stockings' ? i : style === 'pinatas' ? 0 : f + i, 0, len + H * 0.14, H * 0.32)
        ctx.restore()
      }
    })
    return
  }
  if (PEEKERS.has(style)) {
    // A window with one coming up over the sill and ducking down again (or eyes opening in the dark).
    const wx = W * 0.5
    const sill = H * 0.86
    ctx.fillStyle = '#0b1220'
    ctx.fillRect(W * 0.24, H * 0.1, W * 0.52, sill - H * 0.1)
    ctx.strokeStyle = 'rgba(148,163,184,0.8)'
    ctx.lineWidth = 3
    ctx.strokeRect(W * 0.24, H * 0.1, W * 0.52, sill - H * 0.1)
    const look = Math.floor(time / 1.2) % 4
    if (style === 'window-eyes') {
      const eh = H * 0.34
      const cy = H * 0.46
      stamp(ctx, style, layer, 'main', look === 3 ? 3 : 0, wx, cy, eh)
      if (look !== 3) {
        const u = eh / 110
        const lx = Math.sin(time * 0.8)
        for (const d of [-1, 1]) stamp(ctx, style, layer, 'pupil', 0, wx + (d * 50 + lx * 17) * u, cy, 46 * u)
      }
      return
    }
    const up = Math.min(1, Math.max(0, 1.6 * Math.sin(((time * 0.25) % 1) * Math.PI) - 0.2))
    const ph = H * 0.6
    stamp(ctx, style, layer, 'main', look, wx, sill + ph * 0.04 - ph * up + ph / 2, ph, false, up)
    ctx.fillStyle = 'rgba(148,163,184,0.9)'
    ctx.fillRect(W * 0.2, sill, W * 0.6, H * 0.05)
    return
  }
  if (style === 'snowball-kids' || style === 'water-balloon-kids') {
    // A throw in an arc to a splat on the wall.
    const k = (time * 0.5) % 1
    const fr = k < 0.35 ? 0 : k < 0.45 ? 1 : k < 0.55 ? 2 : k < 0.65 ? 3 : 0
    stamp(ctx, style, layer, 'main', fr, W * 0.2, H * 0.6, H * 0.72)
    const a = (k - 0.5) / 0.3
    if (a > 0 && a < 1) stamp(ctx, style, layer, 'ball', 0, W * (0.28 + 0.5 * a), H * (0.36 - Math.sin(a * Math.PI) * 0.25 - 0.1 * a), H * 0.1)
    else if (a >= 1) stamp(ctx, style, layer, 'splat', 0, W * 0.78, H * 0.26, H * 0.24)
    return
  }
  if (style === 'jack-in-the-box') {
    const up = Math.min(1, Math.max(0, 2 * Math.sin(((time * 0.3) % 1) * Math.PI) - 0.3))
    const bh = H * 0.4
    stamp(ctx, style, layer, 'box', up > 0.03 ? 1 : 0, W / 2, H * 0.96 - bh / 2, bh)
    const top = H * 0.96 - bh + (bh * 30) / 110
    const jh = H * 0.7
    if (up > 0.02) stamp(ctx, style, layer, 'main', f, W / 2, top - jh * up + jh / 2, jh, false, up)
    return
  }
  if (style === 'moles' || style === 'burrow-bunnies') {
    ;[[0.25, 0.4], [0.52, 1], [0.78, 0.7]].forEach(([x, up], i) => {
      const k = Math.min(1, Math.max(0, up + Math.sin(time * 1.4 + i * 2) * 0.3))
      const mh = H * 0.5
      if (k > 0.02) stamp(ctx, style, layer, 'main', f + i * 3, W * x, H * 0.86 - mh * k + mh / 2, mh, false, k)
      stamp(ctx, style, layer, 'mound', 0, W * x, H * 0.88, H * 0.2)
    })
    return
  }
  if (style === 'grave-ghosts') {
    const up = 0.5 + 0.5 * Math.sin(time * 0.9)
    ctx.save()
    ctx.globalAlpha = 0.85 * Math.min(1, up * 2)
    stamp(ctx, style, layer, 'main', f, W / 2, H * (0.6 - up * 0.32), H * 0.5)
    ctx.restore()
    stamp(ctx, style, layer, 'stone', 0, W / 2, H * 0.72, H * 0.5)
    return
  }
  if (style === 'party-poppers') {
    // Going off: confetti fanning out of it.
    stamp(ctx, style, layer, 'main', 0, W * 0.42, H * 0.76, H * 0.42)
    const k = (time * 0.5) % 1
    for (let j = 0; j < 16; j++) {
      const a = -Math.PI / 2 + (hash(j) - 0.5) * 1.4
      const r = H * (0.25 + 0.5 * hash(j + 3)) * Math.min(1, k * 2.5)
      ctx.save()
      ctx.translate(W * 0.42 + Math.cos(a) * r, H * 0.56 + Math.sin(a) * r + k * k * H * 0.25)
      ctx.rotate(time * 3 + j)
      stamp(ctx, style, layer, 'burst', j, 0, 0, H * 0.09)
      ctx.restore()
    }
    return
  }
  if (style === 'zombie-hands') {
    ;[[0.25, 0.55], [0.52, 0.95], [0.78, 0.7]].forEach(([x, up], i) => {
      const k = Math.min(1, up + Math.sin(time * 1.2 + i * 2) * 0.12)
      stamp(ctx, style, layer, 'main', f + i * 3, W * x, H * (0.98 - k * 0.42), H * 0.5)
      stamp(ctx, style, layer, 'mound', 0, W * x, H * 0.9, H * 0.18)
    })
    return
  }
  if (style === 'hatching-eggs') {
    // Three at different stages, as people bring them on.
    ;[[0.2, 0], [0.5, 2 + Math.floor(time * 0.7) % 2], [0.8, 4]].forEach(([x, stage]) =>
      stamp(ctx, style, layer, 'main', stage, W * x, H * 0.58, H * 0.62))
    return
  }
  if (style === 'dolphins') {
    const k = (time * 0.35) % 1
    const x = W * (0.15 + 0.7 * k)
    const y = H * (0.82 - Math.sin(k * Math.PI) * 0.5)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(Math.cos(k * Math.PI) * -0.9)
    stamp(ctx, style, layer, 'main', f, 0, 0, H * 0.32)
    ctx.restore()
    stamp(ctx, style, layer, 'splash', 0, W * 0.15, H * 0.82, H * 0.22)
    stamp(ctx, style, layer, 'splash', 0, W * 0.85, H * 0.82, H * 0.22)
    return
  }
  if (style === 'kites') {
    ;[[0.32, 0.36, 0], [0.7, 0.28, 1]].forEach(([x, y, i]) => {
      const kx = W * x + Math.sin(time + i * 3) * W * 0.04
      const ky = H * y + Math.sin(time * 1.3 + i) * H * 0.04
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(W * (x - 0.12), H)
      ctx.lineTo(kx, ky + H * 0.08)
      ctx.stroke()
      stamp(ctx, style, layer, 'main', f + i * 4, kx, ky, H * 0.42)
    })
    return
  }
  if (style === 'beach-balls') {
    ;[[0.3, 0.3], [0.7, 0.9]].forEach(([x, ph], i) => {
      const y = H * (0.8 - Math.abs(Math.sin(time * 2.2 + ph * 3)) * 0.45)
      ctx.save()
      ctx.translate(W * x, y)
      ctx.rotate(time * (i ? -2 : 2))
      stamp(ctx, style, layer, 'main', 0, 0, 0, H * 0.32)
      ctx.restore()
    })
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
  if (style === 'helicopter') {
    stamp(ctx, style, layer, 'search', 0, W * 0.6 + Math.sin(time) * W * 0.05, H * 0.72, H * 0.6)
    stamp(ctx, style, layer, 'main', f, W / 2, H * 0.3, H * 0.5)
    return
  }
  if (style === 'icicles' || style === 'web-spiders') {
    // Under the gutter: a row of icicles dripping, or webs with their spiders going round.
    ctx.fillStyle = 'rgba(148,163,184,0.8)'
    ctx.fillRect(0, H * 0.06, W, H * 0.04)
    if (style === 'icicles') {
      ;[0.2, 0.5, 0.8].forEach((x, i) => {
        stamp(ctx, style, layer, 'main', i, W * x, H * 0.1 + H * 0.28, H * 0.56)
        const k = (time * 0.6 + i * 0.37) % 1
        stamp(ctx, style, layer, 'drop', 0, W * x, H * (0.7 + 0.28 * k * k), H * 0.08)
      })
      return
    }
    stamp(ctx, style, layer, 'main', 0, W * 0.5, H * 0.48, H * 0.76)
    const a = time * 0.8
    stamp(ctx, style, layer, 'spider', f, W * 0.5 + Math.cos(a) * H * 0.18, H * 0.48 + Math.sin(a) * H * 0.18, H * 0.22)
    return
  }
  if (style === 'cuckoo-clock' || style === 'moon') {
    // The real time on the clock (the cuckoo out on the minute), or tonight's moon.
    const now = new Date()
    if (style === 'moon') {
      const age = ((((now.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86_400_000) % 29.530588853) + 29.530588853) % 29.530588853
      stamp(ctx, style, layer, 'main', Math.round((age / 29.530588853) * main.frames) % main.frames, W / 2, H / 2, H * 0.9)
      return
    }
    const ch = H * 0.94
    const u = ch / 300
    stamp(ctx, style, layer, 'main', 0, W / 2, H / 2, ch)
    const min = now.getMinutes() + now.getSeconds() / 60
    const hours = (now.getHours() % 12) + min / 60
    for (const [a, frame] of [[(hours / 12) * Math.PI * 2, 0], [(min / 60) * Math.PI * 2, 1]] as const) {
      ctx.save()
      ctx.translate(W / 2, H / 2 + (136 - 150) * u)
      ctx.rotate(a)
      stamp(ctx, style, layer, 'hand', frame, 0, -21 * u, 42 * u)
      ctx.restore()
    }
    if (now.getSeconds() < 3) stamp(ctx, style, layer, 'cuckoo', Math.floor(time * 3), W / 2, H / 2 + (55 - 150) * u, 36 * u)
    return
  }
  if (style === 'sprinklers') {
    const a = Math.sin(time * 0.9) * 0.9
    ctx.save()
    ctx.translate(W / 2, H * 0.68)
    ctx.rotate(a * 0.35)
    stamp(ctx, style, layer, 'spray', f, 0, -H * 0.26, H * 0.6, a < 0)
    ctx.restore()
    stamp(ctx, style, layer, 'main', 0, W / 2, H * 0.8, H * 0.3)
    return
  }
  if (style === 'cauldrons') {
    stamp(ctx, style, layer, 'main', f, W / 2, H * 0.55, H * 0.8)
    for (let j = 0; j < 4; j++) {
      const q = (time * 0.6 + j / 4) % 1
      stamp(ctx, style, layer, 'brew', 0, W * (0.42 + 0.16 * hash(j)), H * (0.32 - q * 0.28), H * (0.06 + q * 0.06))
    }
    return
  }
  if (style === 'pot-of-gold') {
    ctx.save()
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 0.8)
    stamp(ctx, style, layer, 'rainbow', 0, W * 0.62, H * 0.5, H * 0.66)
    ctx.restore()
    stamp(ctx, style, layer, 'main', f, W * 0.3, H * 0.72, H * 0.48)
    return
  }
  if (style === 'leaf-piles' || style === 'puddles') {
    const k = (time * 0.4) % 1
    if (style === 'puddles') {
      stamp(ctx, style, layer, 'main', f, W / 2, H * 0.78, H * 0.3)
      if (k < 0.3) stamp(ctx, style, layer, 'splash', 0, W / 2, H * 0.62, H * 0.4 * Math.sin((k / 0.3) * Math.PI))
      return
    }
    stamp(ctx, style, layer, 'main', 0, W / 2, H * 0.78, H * 0.4)
    for (let j = 0; j < 8; j++) {
      const a = k * 1.4
      const x = W * 0.5 + (hash(j) - 0.5) * W * 0.8 * a
      const y = H * 0.62 - H * (0.6 + 0.4 * hash(j + 4)) * a + H * 0.7 * a * a
      if (y < H * 0.85) stamp(ctx, style, layer, 'leaf', j, x, y, H * 0.08)
    }
    return
  }
  if (style === 'easter-eggs' || style === 'diyas') {
    const xs = style === 'diyas' ? [0.14, 0.38, 0.62, 0.86] : [0.2, 0.5, 0.8]
    xs.forEach((x, i) => {
      const hop = style === 'easter-eggs' && i === Math.floor(time * 0.7) % 3 ? Math.abs(Math.sin(time * 4)) * H * 0.12 : 0
      stamp(ctx, style, layer, 'main', style === 'diyas' ? f + i * 2 : i, W * x, H * 0.66 - hop, H * (style === 'diyas' ? 0.36 : 0.44))
    })
    return
  }
  if (style === 'glowing-pumpkins') {
    stamp(ctx, style, layer, Math.floor(time * 0.5) % 2 ? 'boo' : 'main', f, W / 2, H / 2, H * 0.86)
    return
  }
  if (style === 'snow-globes' || style === 'gift-boxes') {
    // Snow whirling up and settling; a present going from wrapped to open.
    const frame = style === 'snow-globes' ? main.frames - 1 - (Math.floor(time * 1.5) % main.frames) : Math.floor(time * 0.8) % main.frames
    stamp(ctx, style, layer, 'main', frame, W / 2, H / 2, H * 0.88)
    return
  }
  if (style === 'peacocks') {
    stamp(ctx, style, layer, Math.floor(time * 0.3) % 2 ? 'wave' : 'main', f, W / 2, H / 2, H * 0.92)
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
