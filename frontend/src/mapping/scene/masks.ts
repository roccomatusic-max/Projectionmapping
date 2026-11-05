/**
 * Where a layer is drawn, rasterised once (not per frame) with the 2D canvas.
 *
 * A layer's target picks traced surfaces (walls, roof, windows…). For fills
 * the image holds, per pixel: R inside the target, G the same blurred (how
 * deep inside, for shading toward the edges). For trim it holds the stroke
 * (R), its glow (G); for string lights each bulb (R), its halo (G) and the
 * bulb's number along the line (B), so the shader can twinkle and chase.
 *
 * Coordinates: the image covers ``rect`` of the canvas (canvas fractions),
 * top row first, which is how the shader samples it.
 */

import type { LayerTarget, SceneLayer, SourceRect, Surface, SurfaceKind } from '../types'

export interface MaskCanvas {
  canvas: HTMLCanvasElement
  /** False when the layer covers everything and needs no mask. */
  used: boolean
}

export const KINDS: Record<Exclude<LayerTarget, 'everywhere' | 'outside'>, SurfaceKind[]> = {
  building: ['wall', 'roof', 'window', 'door', 'other'],
  walls: ['wall', 'other'],
  roof: ['roof'],
  windows: ['window'],
  doors: ['door'],
  ground: ['ground'],
}

/** Building parts: what "Around the building" stays off (the driveway is around it). */
const BUILDING = KINDS.building

/** Things cut out of walls, so a wall texture does not cover its windows. */
const HOLES: SurfaceKind[] = ['window', 'door']

function pick(surfaces: Surface[], target: LayerTarget): Surface[] {
  if (target === 'everywhere' || target === 'outside') return surfaces
  return surfaces.filter((s) => KINDS[target].includes(s.kind))
}

type Mapper = (p: [number, number]) => [number, number]

function trace(ctx: CanvasRenderingContext2D, surface: Surface, map: Mapper) {
  surface.points.forEach((p, i) => {
    const [x, y] = map(p)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
}

/** Each surface's closed outline as a list of pixel points. */
function outlines(
  surfaces: Surface[],
  traced: boolean,
  map: Mapper,
  w: number,
  h: number,
): Array<Array<[number, number]>> {
  if (!traced) {
    // Nothing traced: trim the edge of the picture.
    const m = Math.round(Math.min(w, h) * 0.02)
    return [[[m, m], [w - m, m], [w - m, h - m], [m, h - m], [m, m]]]
  }
  return surfaces.map((s) => {
    const pts = s.points.map(map)
    return [...pts, pts[0]]
  })
}

/** A seeded random number so drips and bulbs land in the same place on every output. */
function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** The box around a target's traced parts in canvas fractions; the whole canvas when none are traced. */
export function targetBox(target: LayerTarget, surfaces: Surface[]): SourceRect {
  const chosen = target === 'everywhere' || target === 'outside' ? [] : pick(surfaces, target)
  if (!chosen.length) return { x: 0, y: 0, w: 1, h: 1 }
  const xs = chosen.flatMap((s) => s.points.map((p) => p[0]))
  const ys = chosen.flatMap((s) => s.points.map((p) => p[1]))
  const x = Math.max(0, Math.min(...xs))
  const y = Math.max(0, Math.min(...ys))
  return { x, y, w: Math.min(1, Math.max(...xs)) - x, h: Math.min(1, Math.max(...ys)) - y }
}

export function rasteriseLayerMask(
  layer: SceneLayer,
  surfaces: Surface[],
  rect: SourceRect,
  width: number,
  height: number,
  canvas: HTMLCanvasElement = document.createElement('canvas'),
): MaskCanvas {
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.filter = 'none'
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'lighter'
  // Canvas fraction → this image's pixels.
  const map: Mapper = ([x, y]) => [((x - rect.x) / rect.w) * width, ((y - rect.y) / rect.h) * height]
  // Lengths are given at a 1080-pixel-tall canvas and scaled to this image.
  const px = height / rect.h / 1080
  const chosen = pick(surfaces, layer.target)
  let used = true

  if (layer.type === 'outline' || layer.type === 'lights') {
    const lines = outlines(chosen, surfaces.length > 0, map, width, height)
    if (layer.type === 'outline') drawTrim(ctx, layer, lines, px)
    else drawBulbs(ctx, layer, lines, px)
  } else if (surfaces.length === 0 || layer.target === 'everywhere') {
    used = false
  } else if (layer.target === 'outside') {
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(0, 0, width, height)
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = '#000'
    ctx.beginPath()
    surfaces.filter((s) => BUILDING.includes(s.kind)).forEach((s) => trace(ctx, s, map))
    ctx.fill('nonzero')
    // destination-out cleared alpha; put the opaque black back underneath.
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)
  } else {
    fillWithDepth(ctx, chosen, surfaces, layer.target, map, px)
  }
  ctx.restore()
  return { canvas, used }
}

function fillWithDepth(
  ctx: CanvasRenderingContext2D,
  chosen: Surface[],
  all: Surface[],
  target: LayerTarget,
  map: Mapper,
  px: number,
) {
  const holes = target === 'walls' ? all.filter((s) => HOLES.includes(s.kind)) : []
  const fill = (color: string, blur: number) => {
    const layer = document.createElement('canvas')
    layer.width = ctx.canvas.width
    layer.height = ctx.canvas.height
    const c = layer.getContext('2d')!
    c.filter = blur > 0 ? `blur(${blur}px)` : 'none'
    c.fillStyle = color
    c.beginPath()
    chosen.forEach((s) => trace(c, s, map))
    c.fill('nonzero')
    if (holes.length) {
      c.globalCompositeOperation = 'destination-out'
      c.beginPath()
      holes.forEach((s) => trace(c, s, map))
      c.fill('nonzero')
    }
    ctx.drawImage(layer, 0, 0)
  }
  fill('#ff0000', 0)
  fill('#00ff00', Math.max(2, 40 * px))
}

function strokeAll(ctx: CanvasRenderingContext2D, lines: Array<Array<[number, number]>>) {
  ctx.beginPath()
  for (const line of lines) {
    line.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  }
  ctx.stroke()
}

function drawTrim(
  ctx: CanvasRenderingContext2D,
  layer: SceneLayer,
  lines: Array<Array<[number, number]>>,
  px: number,
) {
  const width = (3 + layer.size * 30) * px
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // Glow first (G), blurred.
  ctx.filter = `blur(${Math.max(1, width * (0.6 + layer.fade * 2))}px)`
  ctx.strokeStyle = '#00ff00'
  ctx.lineWidth = width * 1.6
  strokeAll(ctx, lines)
  ctx.filter = 'none'
  ctx.strokeStyle = '#ff0000'
  ctx.lineWidth = width
  if (layer.style === 'icing') {
    // Frosting: a slightly lumpy line with drips hanging from the
    // flatter edges.
    ctx.fillStyle = '#ff0000'
    let n = 0
    for (const line of lines) {
      for (let i = 0; i < line.length - 1; i++) {
        const [x0, y0] = line[i]
        const [x1, y1] = line[i + 1]
        const len = Math.hypot(x1 - x0, y1 - y0)
        const steps = Math.max(1, Math.floor(len / (width * 0.6)))
        for (let k = 0; k <= steps; k++) {
          const t = k / steps
          const x = x0 + (x1 - x0) * t
          const y = y0 + (y1 - y0) * t
          const r = width * (0.5 + 0.25 * hash(++n))
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fill()
        }
        // Drips only hang from edges closer to horizontal than vertical.
        if (Math.abs(y1 - y0) > Math.abs(x1 - x0)) continue
        const drips = Math.floor(len / (width * 3.5))
        for (let k = 0; k < drips; k++) {
          const h = hash(++n)
          if (h < 0.35) continue
          const t = (k + 0.5 + (hash(++n) - 0.5) * 0.6) / Math.max(1, drips)
          const x = x0 + (x1 - x0) * t
          const y = y0 + (y1 - y0) * t
          const dw = width * (0.45 + 0.35 * hash(++n))
          const dl = width * (0.8 + 2.8 * h * h)
          ctx.beginPath()
          ctx.moveTo(x - dw, y)
          ctx.lineTo(x - dw, y + dl)
          ctx.arc(x, y + dl, dw, Math.PI, 0, true)
          ctx.lineTo(x + dw, y)
          ctx.closePath()
          ctx.fill()
        }
      }
    }
  } else {
    strokeAll(ctx, lines)
  }
}

function drawBulbs(
  ctx: CanvasRenderingContext2D,
  layer: SceneLayer,
  lines: Array<Array<[number, number]>>,
  px: number,
) {
  const spacing = (70 - layer.amount * 55) * px
  const radius = (2.5 + layer.size * 9) * px
  const bulbs: Array<[number, number]> = []
  for (const line of lines) {
    let carry = 0
    for (let i = 0; i < line.length - 1; i++) {
      const [x0, y0] = line[i]
      const [x1, y1] = line[i + 1]
      const len = Math.hypot(x1 - x0, y1 - y0)
      let d = carry
      while (d < len) {
        const t = d / len
        bulbs.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t])
        d += spacing
      }
      carry = d - len
    }
  }
  // Halo (G), blurred.
  ctx.filter = `blur(${Math.max(1, radius * 1.4)}px)`
  ctx.fillStyle = '#00ff00'
  for (const [x, y] of bulbs) {
    ctx.beginPath()
    ctx.arc(x, y, radius * 1.8, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.filter = 'none'
  // The bulb's number (B) on a square around it, sharp-edged so the number
  // is exact wherever the bulb or its halo is drawn.
  const ids = document.createElement('canvas')
  ids.width = ctx.canvas.width
  ids.height = ctx.canvas.height
  const ic = ids.getContext('2d')!
  const half = Math.ceil(radius * 3)
  bulbs.forEach(([x, y], i) => {
    ic.fillStyle = `rgb(0,0,${(i % 255) + 1})`
    ic.fillRect(Math.round(x) - half, Math.round(y) - half, half * 2, half * 2)
  })
  ctx.drawImage(ids, 0, 0)
  ctx.fillStyle = '#ff0000'
  for (const [x, y] of bulbs) {
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** What a mask depends on; a different key means rasterise again. */
export function maskKey(layer: SceneLayer, surfacesKey: string, rect: SourceRect, w: number, h: number) {
  const needsDials = layer.type === 'outline' || layer.type === 'lights'
  return JSON.stringify([
    layer.type === 'outline' || layer.type === 'lights' ? layer.type : 'fill',
    layer.target,
    needsDials ? [layer.style, layer.size, layer.amount, layer.fade] : null,
    surfacesKey,
    rect,
    w,
    h,
  ])
}
