/**
 * Flying and walking elements: Santa's sleigh and reindeer, a Christmas
 * train, flocks of birds or bats, elves, penguins, shooting stars and
 * ghosts that travel over the house; a witch on her broom, a UFO that
 * beams people up, skeletons, zombies, black cats, turkeys, Cupid,
 * leprechauns, a hopping Easter bunny, eagles, butterflies and fish;
 * firework rockets that go up and burst, and balloons that float away.
 *
 * Each follows a path: the points placed by hand on the preview (a line
 * through them, in order), or, with fewer than two, a path of its own:
 * fliers sweep along just above the roofline (or arc over the top of the
 * picture before the house is traced), walkers and the train go along the
 * bottom of the house. Where everything is comes from the time since the
 * cue started, which every output shares, so a sleigh crossing from one
 * projector to the next is in the same place on both.
 *
 * The pictures are painted once into one texture (sprites.ts) and stamped
 * where each one is; the positions are worked out here, in the browser,
 * which is a few dozen sums a frame. People make them react: a flock
 * scatters away from someone who comes near and settles back, elves jump
 * and wave, the sleigh lights up and Santa says "Ho ho ho!".
 */

import type { PersonSpot } from '../people'
import type { LayerBlend, ObjectPin, SceneLayer, SourceRect, Surface } from '../types'
import { nearOf } from './catalog'
import { SPRITE_ROWS, type SpriteRow } from './sprites'

// New styles go at the end, after the ones saved scenes already use.
export const MOVER_STYLES = [
  'sleigh', 'train', 'birds', 'bats', 'elves', 'penguins', 'shooting-stars', 'ghosts',
  'witch', 'ufo', 'skeletons', 'zombies', 'black-cats', 'turkeys', 'cupid', 'leprechauns', 'bunnies', 'eagles',
  'rockets', 'balloons', 'butterflies', 'fish',
] as const
export type MoverStyle = (typeof MOVER_STYLES)[number]

type Motion = 'flyer' | 'flock' | 'walker' | 'train' | 'streak' | 'rocket' | 'rise'

/** How each travels; trail leaves sparkles behind, hop goes in bounds. */
const STYLE: Record<MoverStyle, { motion: Motion; ground: boolean; height: number; trail?: boolean; hop?: boolean }> = {
  sleigh: { motion: 'flyer', ground: false, height: 1, trail: true },
  train: { motion: 'train', ground: true, height: 0.8 },
  birds: { motion: 'flock', ground: false, height: 0.3 },
  bats: { motion: 'flock', ground: false, height: 0.3 },
  elves: { motion: 'walker', ground: true, height: 0.85 },
  penguins: { motion: 'walker', ground: true, height: 0.7 },
  'shooting-stars': { motion: 'streak', ground: false, height: 0.22 },
  ghosts: { motion: 'flyer', ground: false, height: 0.7 },
  witch: { motion: 'flyer', ground: false, height: 0.85, trail: true },
  ufo: { motion: 'flyer', ground: false, height: 0.7 },
  skeletons: { motion: 'walker', ground: true, height: 0.95 },
  zombies: { motion: 'walker', ground: true, height: 0.95 },
  'black-cats': { motion: 'walker', ground: true, height: 0.6 },
  turkeys: { motion: 'walker', ground: true, height: 0.7 },
  cupid: { motion: 'flyer', ground: false, height: 0.6 },
  leprechauns: { motion: 'walker', ground: true, height: 0.85 },
  bunnies: { motion: 'walker', ground: true, height: 0.6, hop: true },
  eagles: { motion: 'flyer', ground: false, height: 0.6 },
  // Rockets go up from the bottom of the house and burst; balloons float up from it.
  rockets: { motion: 'rocket', ground: true, height: 0.22 },
  balloons: { motion: 'rise', ground: true, height: 0.75 },
  butterflies: { motion: 'flock', ground: false, height: 0.28 },
  fish: { motion: 'flock', ground: false, height: 0.3 },
}

/** Width over height of a style's main picture. */
function ratioOf(style: MoverStyle): number {
  const main = SPRITE_ROWS[style][0]
  return main.w / main.h
}

function hasRow(style: MoverStyle, id: string): boolean {
  return SPRITE_ROWS[style].some((r) => r.id === id)
}

export function moverStyle(style: string): MoverStyle {
  return (MOVER_STYLES as readonly string[]).includes(style) ? (style as MoverStyle) : 'sleigh'
}

/** Height of one (the sleigh team, the engine, a bird…) in canvas heights. */
export function moverHeight(layer: SceneLayer): number {
  return (0.04 + 0.22 * layer.size) * STYLE[moverStyle(layer.style)].height
}

/** Walkers and the train go along the ground; the rest fly. */
export function moverWalks(style: string): boolean {
  return STYLE[moverStyle(style)].ground
}

// -- paths --------------------------------------------------------------------------------

interface PathPoint {
  x: number
  y: number
  size: number
}

/** A smooth line through points (x across in canvas heights, y down), walked by distance. */
export class MoverPath {
  private xs: number[] = []
  private ys: number[] = []
  private ss: number[] = []
  private cum: number[] = []
  readonly length: number

  constructor(points: PathPoint[]) {
    const n = points.length
    const p = (i: number) => points[Math.max(0, Math.min(n - 1, i))]
    for (let i = 0; i < n - 1; i++) {
      // Catmull-Rom through the points, a few steps per span.
      const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)]
      const steps = 12
      for (let k = 0; k < steps; k++) {
        const t = k / steps
        const t2 = t * t
        const t3 = t2 * t
        const cr = (a: number, b: number, c: number, d: number) =>
          0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
        this.xs.push(cr(p0.x, p1.x, p2.x, p3.x))
        this.ys.push(cr(p0.y, p1.y, p2.y, p3.y))
        this.ss.push(p1.size + (p2.size - p1.size) * t)
      }
    }
    const last = points[n - 1]
    this.xs.push(last.x)
    this.ys.push(last.y)
    this.ss.push(last.size)
    let total = 0
    this.cum.push(0)
    for (let i = 1; i < this.xs.length; i++) {
      total += Math.hypot(this.xs[i] - this.xs[i - 1], this.ys[i] - this.ys[i - 1])
      this.cum.push(total)
    }
    this.length = Math.max(1e-6, total)
  }

  /** The spot d along the path: where, how big, and which way it heads. */
  at(d: number): { x: number; y: number; size: number; dx: number; dy: number } {
    const cum = this.cum
    const s = Math.max(0, Math.min(this.length, d))
    let lo = 0
    let hi = cum.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (cum[mid] <= s) lo = mid
      else hi = mid
    }
    const span = cum[hi] - cum[lo] || 1
    const t = (s - cum[lo]) / span
    const dx = this.xs[hi] - this.xs[lo]
    const dy = this.ys[hi] - this.ys[lo]
    const len = Math.hypot(dx, dy) || 1
    return {
      x: this.xs[lo] + dx * t,
      y: this.ys[lo] + dy * t,
      size: this.ss[lo] + (this.ss[hi] - this.ss[lo]) * t,
      dx: dx / len,
      dy: dy / len,
    }
  }
}

/** Highest point of the traced parts at canvas fraction x, or null where there are none. */
function topAt(surfaces: Surface[], x: number): number | null {
  let best: number | null = null
  for (const s of surfaces) {
    const pts = s.points
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i]
      const [bx, by] = pts[(i + 1) % pts.length]
      if ((ax <= x && x <= bx) || (bx <= x && x <= ax)) {
        const y = bx === ax ? Math.min(ay, by) : ay + ((x - ax) / (bx - ax)) * (by - ay)
        if (best == null || y < best) best = y
      }
    }
  }
  return best
}

/**
 * The path a layer follows, in canvas heights across (x) and down (y):
 * the points placed by hand when there are two or more, otherwise one of
 * its own over the roofline or along the bottom of the house.
 */
export function moverPathPoints(layer: SceneLayer, surfaces: Surface[], aspect: number): { points: PathPoint[]; drawn: boolean } {
  const pins = layer.pins ?? []
  if (pins.length >= 2) {
    return { points: pins.map((p: ObjectPin) => ({ x: p.x * aspect, y: p.y, size: p.size })), drawn: true }
  }
  const style = moverStyle(layer.style)
  const h = moverHeight(layer)
  const parts = surfaces.filter((s) => s.points.length >= 3)
  const xs = parts.flatMap((s) => s.points.map((p) => p[0]))
  const ys = parts.flatMap((s) => s.points.map((p) => p[1]))
  if (STYLE[style].ground) {
    // Along the bottom of the house, or of the picture.
    const y = parts.length ? Math.min(0.97, Math.max(...ys)) : 0.93
    const x0 = parts.length ? Math.max(0, Math.min(...xs)) * aspect : 0.06 * aspect
    const x1 = parts.length ? Math.min(1, Math.max(...xs)) * aspect : 0.94 * aspect
    // The train comes in from one side and leaves by the other.
    const out = style === 'train' ? h * 4 : 0
    return { points: [{ x: x0 - out, y, size: 1 }, { x: x1 + out, y, size: 1 }], drawn: false }
  }
  const roofs = parts.filter((s) => s.kind === 'roof')
  const over = roofs.length ? roofs : parts
  if (!over.length) {
    // An arc over the top of the picture until the house is traced.
    return {
      points: [
        { x: -0.25, y: 0.36, size: 1 },
        { x: aspect * 0.25, y: 0.2, size: 1 },
        { x: aspect * 0.5, y: 0.14, size: 1 },
        { x: aspect * 0.75, y: 0.2, size: 1 },
        { x: aspect + 0.25, y: 0.36, size: 1 },
      ],
      drawn: false,
    }
  }
  // Just above the roofline, from beyond the left edge to beyond the right.
  const ox = over.flatMap((s) => s.points.map((p) => p[0]))
  const left = Math.max(0, Math.min(...ox))
  const right = Math.min(1, Math.max(...ox))
  const lift = h * (style === 'sleigh' ? 0.75 : 1.2)
  const points: PathPoint[] = []
  const steps = 10
  for (let i = 0; i <= steps; i++) {
    const x = left + ((right - left) * i) / steps
    const top = topAt(over, Math.min(right - 1e-4, Math.max(left + 1e-4, x)))
    points.push({ x: x * aspect, y: Math.max(h * 0.6, (top ?? 0.3) - lift), size: 1 })
  }
  const first = points[0]
  const last = points[points.length - 1]
  points.unshift({ x: -0.3, y: Math.max(h, first.y - 0.08), size: 1 })
  points.push({ x: aspect + 0.3, y: Math.max(h, last.y - 0.08), size: 1 })
  return { points, drawn: false }
}

// -- where each one is ----------------------------------------------------------------------

export interface Sprite {
  /** Centre, in canvas heights across and down. */
  x: number
  y: number
  /** Half width and half height, canvas heights. */
  hw: number
  hh: number
  angle: number
  flip: boolean
  alpha: number
  glow: number
  row: string
  frame: number
}

function hash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return s - Math.floor(s)
}

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

interface Near {
  k: number
  /** Unit vector from the nearest person to the point. */
  ax: number
  ay: number
  dist: number
}

/** How near the nearest person is to a point (canvas heights), 0..1 within the layer's reach. */
function nearAt(x: number, y: number, radius: number, people: PersonSpot[], reach: number, aspect: number): Near {
  const within = 0.06 + 0.5 * reach + radius
  let best: Near = { k: 0, ax: 0, ay: -1, dist: 1 }
  for (const p of people) {
    const dx = x - p.x * aspect
    const dy = y - p.y
    const d = Math.hypot(dx, dy)
    const k = p.strength * (1 - smoothstep(0, 1, d / within))
    if (k > best.k) best = { k, ax: d > 1e-4 ? dx / d : 0, ay: d > 1e-4 ? dy / d : -1, dist: d }
  }
  return best
}

/** Facing the way it travels: mirrored when heading left, tilted up to a limit. */
function heading(dx: number, dy: number, limit: number): { angle: number; flip: boolean } {
  const flip = dx < 0
  const a = flip ? Math.atan2(-dy, -dx) : Math.atan2(dy, dx)
  return { angle: Math.max(-limit, Math.min(limit, a)), flip }
}

/** A speech bubble over one ("Ho ho ho!"), showing as someone comes near. */
function bubble(s: Sprite, size: number, flip: boolean, k: number): Sprite {
  const bh = size * 0.32
  return {
    x: s.x + (flip ? 1 : -1) * s.hw * 0.3,
    y: s.y - s.hh - bh * 0.7,
    hw: (bh * 360) / 140,
    hh: bh,
    angle: 0,
    flip: false,
    alpha: s.alpha * smoothstep(0.2, 0.5, k),
    glow: 0,
    row: 'bubble',
    frame: 0,
  }
}

/** What one does when someone comes near; flocks scatter by themselves (below). */
function react(s: Sprite, action: string, near: Near, t: number, ph: number, reach: number) {
  const k = near.k
  if (k <= 0.001) return
  if (action === 'light') s.glow = Math.max(s.glow, k)
  else if (action === 'grow') {
    s.hw *= 1 + 0.6 * k
    s.hh *= 1 + 0.6 * k
  } else if (action === 'flee') {
    const d = (0.1 + 0.4 * reach) * k
    s.x += near.ax * d
    s.y += near.ay * d - 0.05 * k
  } else if (action === 'follow') {
    const d = Math.max(0, near.dist - s.hh) * 0.6 * k
    s.x -= near.ax * d
    s.y -= near.ay * d
  } else if (action === 'jump') s.y -= Math.abs(Math.sin(t * 9 + ph)) * s.hh * 1.2 * k
  else if (action === 'dance') {
    s.angle += Math.sin(t * 10 + ph) * 0.3 * k
    s.y -= Math.abs(Math.sin(t * 10 + ph)) * s.hh * 0.5 * k
  } else if (action === 'hide') s.alpha *= 1 - smoothstep(0.25, 0.85, k)
  else if (action === 'appear') s.alpha *= smoothstep(0.05, 0.6, k)
}

export interface MoverFrame {
  layer: SceneLayer
  path: MoverPath
  drawn: boolean
  aspect: number
  people: PersonSpot[]
  /** Seconds since the cue started, shared by every output. */
  time: number
  dt: number
  /** Per-layer memory: how scared each bird is (flocks only). */
  scared: number[]
}

/** Everything one layer shows this frame. */
export function moverSprites(f: MoverFrame): Sprite[] {
  const { layer, path, drawn, aspect, people, time: t } = f
  const style = moverStyle(layer.style)
  const action = nearOf(layer)
  const reach = layer.reach ?? 0.5
  const H = moverHeight(layer)
  const L = path.length
  const out: Sprite[] = []
  const ends = (s: number) => (drawn ? smoothstep(0, 0.08, s) * smoothstep(0, 0.08, L - s) : 1)
  const motion = STYLE[style].motion
  // Each style keeps its own spacing, so a witch and a UFO do not fly on top of each other.
  const own = MOVER_STYLES.indexOf(style) * 0.37

  if (motion === 'flyer') {
    const v = 0.04 + 0.4 * layer.speed
    const gap = drawn ? 0.5 : 0.2
    const lap = L + gap
    const n = style === 'sleigh' ? 1 : 1 + Math.round(layer.amount * 5)
    const ratio = ratioOf(style)
    const floaty = style === 'ghosts' ? 0.25 : style === 'ufo' ? 0.18 : 0.07
    for (let i = 0; i < n; i++) {
      const s = (((t * v + (i * lap) / n + own * lap) % lap) + lap) % lap
      if (s > L) continue
      const p = path.at(s)
      const size = H * p.size
      const ph = hash(i + 3)
      const { angle, flip } = heading(p.dx, p.dy, style === 'sleigh' ? 0.4 : 0.15)
      const sprite: Sprite = {
        x: p.x,
        y: p.y + Math.sin(t * (floaty > 0.1 ? 1.6 : 2.6) + ph * 6) * size * floaty,
        hw: (size * ratio) / 2,
        hh: size / 2,
        angle,
        flip,
        alpha: ends(s) * (style === 'ghosts' ? 0.75 + 0.25 * Math.sin(t * 2.3 + ph * 9) : 1),
        glow: 0,
        row: 'main',
        frame: Math.floor(t * (style === 'ghosts' ? 6 : style === 'ufo' ? 4 : 9) + ph * 8),
      }
      const near = nearAt(sprite.x, sprite.y, sprite.hh, people, reach, aspect)
      react(sprite, action, near, t, ph * 6, reach)
      if (style === 'ufo' && near.k > 0.15) {
        // A beam of light down onto whoever is under it.
        const bh = size * 2.4
        out.push({
          x: sprite.x, y: sprite.y + sprite.hh * 0.45 + bh / 2, hw: (bh * 200) / 300 / 2, hh: bh / 2,
          angle: 0, flip: false, alpha: sprite.alpha * smoothstep(0.15, 0.5, near.k), glow: 0, row: 'beam', frame: 0,
        })
      }
      if (STYLE[style].trail) {
        // A trail of sparkles from the runners, longer with Trail turned up.
        const count = Math.round(6 + layer.fade * 18)
        for (let k = 1; k <= count; k++) {
          const ds = s - sprite.hw * 0.8 - k * size * 0.22
          if (ds < 0) break
          const q = path.at(ds)
          const lapNo = Math.floor((t * v) / lap)
          const j = hash(k * 7.1 + lapNo)
          out.push({
            x: q.x + (j - 0.5) * size * 0.2,
            y: q.y + size * 0.3 + (hash(k * 3.3 + lapNo) - 0.5) * size * 0.35 + Math.sin(t * 3 + k) * size * 0.05,
            hw: size * 0.13 * (1 - k / (count + 1)),
            hh: size * 0.13 * (1 - k / (count + 1)),
            angle: 0,
            flip: false,
            alpha: sprite.alpha * (1 - k / (count + 1)) * (0.4 + 0.6 * layer.fade),
            glow: 0.3,
            row: 'sparkle',
            frame: Math.floor(t * 10 + k) % 4,
          })
        }
      }
      out.push(sprite)
      // Santa (or the witch) calls out to whoever comes near.
      if (hasRow(style, 'bubble') && near.k > 0.2) out.push(bubble(sprite, size, flip, near.k))
    }
    return out
  }

  if (motion === 'flock') {
    const v = 0.03 + 0.3 * layer.speed
    const gap = drawn ? 0.5 : 0.3
    const n = 3 + Math.round(layer.amount * 25)
    const spread = H * (1.4 + 0.3 * Math.sqrt(n))
    const lap = L + gap + spread * 2
    const centre = (((t * v) % lap) + lap) % lap - spread
    if (f.scared.length !== n) f.scared = new Array(n).fill(0)
    const scatter = 0.12 + 0.5 * reach
    for (let i = 0; i < n; i++) {
      const hA = hash(i * 1.7 + 0.3)
      const hB = hash(i * 2.9 + 1.1)
      const along = (hA - 0.5) * spread * 2.2
      const s = centre + along
      if (s < -spread || s > L + spread) continue
      const p = path.at(s)
      const size = H * p.size * (0.8 + 0.4 * hB)
      // Spread around the path, each bobbing and drifting on its own.
      const side = (hB - 0.5) * spread * 1.2
      let x = p.x - p.dy * side + Math.sin(t * 0.9 + i) * size * 0.5
      let y = p.y + p.dx * side + Math.sin(t * 1.3 + i * 2.1) * size * 0.6
      const near = nearAt(x, y, size, people, reach, aspect)
      let scared = f.scared[i]
      if (action === 'flee') {
        // Rise at once, settle back over a few seconds.
        const target = smoothstep(0.05, 0.5, near.k)
        scared += (target - scared) * (1 - Math.exp(-f.dt / (target > scared ? 0.12 : 2.5)))
        f.scared[i] = scared
        const ax = near.ax + (hA - 0.5) * 0.8
        const ay = near.ay - 0.9
        const len = Math.hypot(ax, ay) || 1
        x += (ax / len) * scatter * scared
        y += (ay / len) * scatter * scared
      }
      const flap = 1 + scared * 1.8
      const { angle, flip } = heading(p.dx, p.dy - scared * 0.6, 0.35)
      const sprite: Sprite = {
        x, y, hw: (size * 1.45) / 2, hh: size / 2, angle, flip,
        alpha: ends(Math.max(0, Math.min(L, s))) * (s < 0 || s > L ? 0.0 : 1),
        glow: 0, row: 'main',
        frame: Math.floor(((t * 3.2 * flap + hA * 8) % 1) * 8),
      }
      if (action !== 'flee') react(sprite, action, near, t, hA * 6, reach)
      out.push(sprite)
    }
    return out
  }

  if (motion === 'walker') {
    const v = 0.025 + 0.12 * layer.speed
    const n = 1 + Math.round(layer.amount * 7)
    const ratio = ratioOf(style)
    const hop = STYLE[style].hop
    const waves = hasRow(style, 'wave')
    for (let i = 0; i < n; i++) {
      const ph = hash(i * 5.3 + 2 + own * 10)
      const u = t * v * (0.85 + 0.3 * ph) + (i / n) * 2 * L + ph * L * 0.3
      const m = ((u % (2 * L)) + 2 * L) % (2 * L)
      const forward = m < L
      const s = forward ? m : 2 * L - m
      const p = path.at(s)
      const size = H * p.size
      const near = nearAt(p.x, p.y - size / 2, size / 2, people, reach, aspect)
      const stride = size * (hop ? 1.1 : 0.55)
      const excited = (action === 'dance' || action === 'jump') && near.k > 0.35
      const step = (((u / stride) % 1) + 1) % 1
      const sprite: Sprite = {
        x: p.x,
        // Hoppers go in bounds, up off the ground and down again.
        y: p.y - size / 2 - (hop ? Math.sin(step * Math.PI) * size * 0.45 : 0),
        hw: (size * ratio) / 2,
        hh: size / 2,
        angle: 0,
        flip: forward ? p.dx < 0 : p.dx > 0,
        alpha: 1,
        glow: 0,
        row: waves && excited ? 'wave' : 'main',
        frame: waves && excited ? Math.floor(t * 8 + ph * 4) : Math.floor(step * 8),
      }
      // Walkers jump for joy rather than shake; the ones that can dance do that instead.
      react(sprite, action === 'dance' ? (waves ? 'none' : 'jump') : action, near, t, ph * 6, reach)
      out.push(sprite)
      if (hasRow(style, 'bubble') && near.k > 0.2) out.push(bubble(sprite, size, sprite.flip, near.k))
    }
    return out
  }

  if (motion === 'train') {
    const v = 0.04 + 0.3 * layer.speed
    const eh = H
    const ew = eh * 1.6
    const ch = (eh * 264) / 320
    const cw = (ch * 400) / 264
    const link = eh * 0.04
    const cars = 2 + Math.round(layer.amount * 4)
    const length = ew + cars * (cw + link)
    const lap = L + length + (drawn ? 0.6 : 0.1)
    const head = (((t * v) % lap) + lap) % lap
    const wheels = Math.floor(((head / (eh * 0.5)) % 1) * 4)
    const place = (centre: number, w: number, hgt: number, row: string) => {
      if (centre < 0 || centre > L) return null
      const p = path.at(centre)
      const { angle, flip } = heading(p.dx, p.dy, 0.6)
      // Sit on the line: up from it, square to it.
      const nx = p.dy
      const ny = -p.dx
      const up = ny > 0 ? -1 : 1
      const sprite: Sprite = {
        x: p.x + nx * up * (hgt / 2) * p.size,
        y: p.y + ny * up * (hgt / 2) * p.size,
        hw: (w / 2) * p.size,
        hh: (hgt / 2) * p.size,
        angle, flip, alpha: ends(centre), glow: 0, row, frame: wheels,
      }
      return sprite
    }
    const engine = place(head - ew / 2, ew, eh, 'main')
    let near: Near = { k: 0, ax: 0, ay: -1, dist: 1 }
    if (engine) {
      near = nearAt(engine.x, engine.y, engine.hh, people, reach, aspect)
      // Puffs of steam from the chimney, rising and fading behind it.
      const dir = engine.flip ? -1 : 1
      const cx = engine.x + dir * engine.hw * 0.53 * Math.cos(engine.angle) + engine.hh * 0.62 * Math.sin(engine.angle) * dir
      const cy = engine.y - engine.hh * 0.62
      const puffs = 7
      for (let k = 0; k < puffs; k++) {
        const a = (t * 0.9 + k / puffs) % 1
        out.push({
          x: cx - dir * a * eh * 0.9,
          y: cy - a * eh * 1.1,
          hw: eh * (0.12 + a * 0.3),
          hh: eh * (0.12 + a * 0.3),
          angle: 0, flip: false,
          alpha: (1 - a) * 0.7 * (0.35 + 0.65 * layer.fade) * engine.alpha,
          glow: 0, row: 'puff', frame: 0,
        })
      }
    }
    for (let j = 0; j < cars; j++) {
      const c = place(head - ew - link - j * (cw + link) - cw / 2, cw, ch, j % 2 ? 'tree' : 'gifts')
      if (!c) continue
      react(c, action, nearAt(c.x, c.y, c.hh, people, reach, aspect), t, j, reach)
      out.push(c)
    }
    if (engine) {
      react(engine, action, near, t, 0, reach)
      out.push(engine)
    }
    return out
  }

  if (motion === 'rocket') {
    // Each goes up from the bottom of the house (or along the drawn path) and bursts.
    const n = 1 + Math.round(layer.amount * 5)
    const rh = H
    const rw = rh * (160 / 48)
    const sparks = 16 + Math.round(layer.fade * 20)
    for (let i = 0; i < n; i++) {
      const period = (2.6 + hash(i * 3.1) * 2.6) / (0.4 + 1.2 * layer.speed)
      const u = (t + hash(i * 7.7) * period) / period
      const cycle = Math.floor(u)
      const q = u - cycle
      const seed = cycle * 17.3 + i * 5.1
      const climb = 0.32
      let x0: number
      let y0: number
      let x1: number
      let y1: number
      if (drawn) {
        const a = path.at(0)
        const b = path.at(L)
        ;[x0, y0, x1, y1] = [a.x, a.y, b.x, b.y]
      } else {
        const base = path.at(hash(seed) * L)
        x0 = base.x
        y0 = base.y
        x1 = x0 + (hash(seed + 1) - 0.5) * 0.15
        y1 = Math.max(0.08, y0 - 0.45 - hash(seed + 2) * 0.3)
      }
      if (q < climb) {
        const k = q / climb
        const e = 1 - (1 - k) * (1 - k)
        let x = x0 + (x1 - x0) * e
        let y = y0 + (y1 - y0) * e
        let dx = x1 - x0
        let dy = y1 - y0
        if (drawn) {
          const p = path.at(e * L)
          ;({ x, y, dx, dy } = p)
        }
        const len = Math.hypot(dx, dy) || 1
        const { angle, flip } = heading(dx / len, dy / len, Math.PI)
        const shell: Sprite = {
          x: x - (dx / len) * rw * 0.35, y: y - (dy / len) * rw * 0.35, hw: rw / 2, hh: rh / 2,
          angle, flip, alpha: smoothstep(0, 0.1, k), glow: 0, row: 'main', frame: 0,
        }
        react(shell, action, nearAt(x, y, rh, people, reach, aspect), t, i, reach)
        out.push(shell)
        continue
      }
      // The burst: sparks fly out, slow down, drift down and fade.
      const k = (q - climb) / (1 - climb)
      const near = nearAt(x1, y1, H * 3, people, reach, aspect)
      const big = 1 + (action === 'grow' ? 0.8 : 0.35) * near.k
      const radius = H * (2.2 + hash(seed + 3) * 1.6) * big * (1 - Math.pow(1 - Math.min(1, k * 1.6), 3))
      const fade = 1 - smoothstep(0.45, 1, k)
      const rows = ['spark1', 'spark2', 'spark3']
      const look = Math.floor(hash(seed + 4) * 3)
      // An outer ring and an inner one in another colour, each spark with a short tail.
      for (const [ring, count, row] of [[1, sparks, rows[look]], [0.55, Math.round(sparks * 0.6), rows[(look + 1) % 3]]] as const) {
        for (let j = 0; j < count; j++) {
          const a = (j / count) * Math.PI * 2 + hash(seed + j + ring) * 0.25
          const sr = H * 0.3 * (1 - k * 0.5) * (action === 'light' ? 1 + 0.6 * near.k : 1)
          for (let m = 0; m < 3; m++) {
            const r = radius * ring * (1 - m * 0.09)
            out.push({
              x: x1 + Math.cos(a) * r,
              y: y1 + Math.sin(a) * r + k * k * H * 1.4,
              hw: sr * (1 - m * 0.3), hh: sr * (1 - m * 0.3), angle: 0, flip: false,
              alpha: fade * (1 - m * 0.35) * (0.75 + 0.25 * Math.sin(t * 20 + j)),
              glow: near.k,
              row, frame: 0,
            })
          }
        }
      }
    }
    return out
  }

  if (motion === 'rise') {
    // Balloons float up from the bottom of the house, swaying, and away off the top.
    const n = 1 + Math.round(layer.amount * 9)
    const ratio = ratioOf(style)
    for (let i = 0; i < n; i++) {
      const period = (7 + hash(i * 2.3) * 5) / (0.3 + 1.4 * layer.speed)
      const u = (t + hash(i * 9.1) * period) / period
      const cycle = Math.floor(u)
      const q = u - cycle
      const seed = cycle * 11.7 + i * 3.3
      const size = H * (0.8 + 0.4 * hash(seed + 5))
      let x: number
      let y: number
      if (drawn) {
        const p = path.at(q * L)
        x = p.x
        y = p.y
      } else {
        const base = path.at(hash(seed) * L)
        x = base.x + Math.sin(t * 0.8 + i * 2) * size * 0.3
        y = base.y - size * 0.4 - q * (base.y + size * 1.5)
      }
      const sprite: Sprite = {
        x, y, hw: (size * ratio) / 2, hh: size / 2, angle: Math.sin(t * 1.1 + i) * 0.12, flip: false,
        alpha: smoothstep(0, 0.06, q) * (1 - smoothstep(0.92, 1, q)), glow: 0, row: 'main', frame: i,
      }
      react(sprite, action, nearAt(x, y, size / 2, people, reach, aspect), t, i, reach)
      out.push(sprite)
    }
    return out
  }

  // Shooting stars: each streaks across now and then, from a spot of its own.
  const n = 1 + Math.round(layer.amount * 5)
  const sh = H
  const sw = sh * (512 / 96)
  for (let i = 0; i < n; i++) {
    const period = (3 + hash(i * 3.1) * 5) / (0.4 + 1.2 * layer.speed)
    const u = (t + hash(i * 7.7) * period) / period
    const cycle = Math.floor(u)
    const w = 0.35
    const q = (u - cycle) / w
    if (q > 1) continue
    let x: number
    let y: number
    let dx: number
    let dy: number
    if (drawn) {
      const p = path.at(q * L)
      ;({ x, y, dx, dy } = p)
    } else {
      const seed = cycle * 13.1 + i * 3.7
      const left = hash(seed) < 0.5
      const a = 0.25 + hash(seed + 1) * 0.35
      const length = 0.35 + hash(seed + 2) * 0.4
      dx = (left ? -1 : 1) * Math.cos(a)
      dy = Math.sin(a)
      const x0 = hash(seed + 3) * aspect
      const y0 = 0.04 + hash(seed + 4) * 0.28
      x = x0 + dx * length * q
      y = y0 + dy * length * q
    }
    const { angle, flip } = heading(dx, dy, Math.PI)
    const alpha = Math.sin(Math.PI * Math.min(1, q))
    const star: Sprite = {
      // The head is at the front of the picture.
      x: x - dx * sw * 0.42,
      y: y - dy * sw * 0.42,
      hw: sw / 2, hh: sh / 2, angle, flip, alpha, glow: 0, row: 'main', frame: 0,
    }
    react(star, action, nearAt(x, y, sh, people, reach, aspect), t, i, reach)
    out.push(star)
  }
  return out
}

// -- drawing ----------------------------------------------------------------------------------

const MAX_ATLAS = 4096
const BATCH = 64

const VERTEX = `#version 300 es
precision highp float;
uniform vec4 uA[${BATCH}];
uniform vec4 uB[${BATCH}];
uniform vec4 uC[${BATCH}];
uniform vec4 uRect;
uniform float uAspect;
out vec2 vUv;
flat out float vAlpha;
flat out float vGlow;
void main() {
  int id = gl_VertexID / 6;
  int v = gl_VertexID - id * 6;
  vec2 corner = v == 0 ? vec2(-1.0, -1.0) : (v == 1 || v == 4) ? vec2(1.0, -1.0) : (v == 2 || v == 3) ? vec2(-1.0, 1.0) : vec2(1.0, 1.0);
  vec4 a = uA[id];
  vec4 b = uB[id];
  vec4 c = uC[id];
  vec2 l = corner * a.zw;
  float ca = cos(b.x);
  float sa = sin(b.x);
  vec2 p = a.xy + vec2(ca * l.x - sa * l.y, sa * l.x + ca * l.y);
  vec2 uv = (vec2(p.x / uAspect, p.y) - uRect.xy) / uRect.zw;
  gl_Position = vec4(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.0, 1.0);
  vec2 t = corner * 0.5 + 0.5;
  if (b.y < 0.0) t.x = 1.0 - t.x;
  vUv = c.xy + t * c.zw;
  vAlpha = b.z;
  vGlow = b.w;
}`

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
flat in float vAlpha;
flat in float vGlow;
uniform sampler2D uAtlas;
uniform vec3 uGlowColor;
out vec4 outColor;
void main() {
  vec4 c = texture(uAtlas, vUv);
  c.rgb = c.rgb * (1.0 + 0.6 * vGlow) + uGlowColor * c.a * 0.35 * vGlow;
  outColor = c * clamp(vAlpha, 0.0, 1.0);
}`

interface Cell {
  u: number
  v: number
  du: number
  dv: number
}

interface Atlas {
  key: string
  tex: WebGLTexture
  cells: Map<string, Cell[]>
}

interface LayerMemory {
  atlas: Atlas | null
  pathKey: string
  path: MoverPath | null
  drawn: boolean
  scared: number[]
  seenAt: number
}

/** Paints every frame of every picture a style needs into one canvas. */
export function paintAtlas(rows: SpriteRow[], scale: number, colors: { color: string; color2: string }) {
  const pad = 2
  let width = 0
  let height = 0
  const layout = rows.map((row) => {
    const cw = Math.max(4, Math.ceil(row.w * scale))
    const ch = Math.max(4, Math.ceil(row.h * scale))
    const cols = Math.max(1, Math.min(row.frames, Math.floor(MAX_ATLAS / (cw + pad))))
    const lines = Math.ceil(row.frames / cols)
    const y = height
    height += lines * (ch + pad)
    width = Math.max(width, cols * (cw + pad))
    return { row, cw, ch, cols, y }
  })
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const cells = new Map<string, Cell[]>()
  for (const { row, cw, ch, cols, y } of layout) {
    const list: Cell[] = []
    for (let f = 0; f < row.frames; f++) {
      const x0 = (f % cols) * (cw + pad) + 1
      const y0 = y + Math.floor(f / cols) * (ch + pad) + 1
      ctx.save()
      ctx.beginPath()
      ctx.rect(x0, y0, cw, ch)
      ctx.clip()
      ctx.translate(x0, y0)
      ctx.scale(cw / row.w, ch / row.h)
      row.paint(ctx, f, row.frames, colors)
      ctx.restore()
      list.push({ u: x0 / width, v: y0 / height, du: cw / width, dv: ch / height })
    }
    cells.set(row.id, list)
  }
  return { canvas, cells }
}

export interface MoverDraw {
  layer: SceneLayer
  rect: SourceRect
  canvasWidth: number
  canvasHeight: number
  /** Scene buffer height in pixels, for how sharp to paint the pictures. */
  h: number
  surfaces: Surface[]
  surfacesKey: string
  people: PersonSpot[]
  strength: number
  time: number
  dt: number
  detail: number
  blend: (mode: LayerBlend) => void
}

export class MoverDrawer {
  private program: WebGLProgram
  private uniforms = new Map<string, WebGLUniformLocation | null>()
  private memory = new Map<string, LayerMemory>()
  private a = new Float32Array(BATCH * 4)
  private b = new Float32Array(BATCH * 4)
  private c = new Float32Array(BATCH * 4)

  constructor(private gl: WebGL2RenderingContext) {
    const compile = (type: number, source: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, source)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Mover shader: ${gl.getShaderInfoLog(s)}`)
      return s
    }
    this.program = gl.createProgram()!
    for (const shader of [compile(gl.VERTEX_SHADER, VERTEX), compile(gl.FRAGMENT_SHADER, FRAGMENT)]) {
      gl.attachShader(this.program, shader)
      gl.deleteShader(shader)
    }
    gl.linkProgram(this.program)
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(`Mover shader failed to link: ${gl.getProgramInfoLog(this.program)}`)
    }
  }

  private u(name: string) {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name))
    return this.uniforms.get(name)!
  }

  draw(key: string, d: MoverDraw) {
    const gl = this.gl
    const { layer } = d
    const aspect = d.canvasWidth / Math.max(1, d.canvasHeight)
    const style = moverStyle(layer.style)
    let mem = this.memory.get(key)
    if (!mem) {
      mem = { atlas: null, pathKey: '', path: null, drawn: false, scared: [], seenAt: 0 }
      this.memory.set(key, mem)
    }
    mem.seenAt = performance.now()
    const pathKey = [style, layer.size, JSON.stringify(layer.pins ?? null), d.surfacesKey, aspect.toFixed(4)].join('|')
    if (pathKey !== mem.pathKey) {
      const { points, drawn } = moverPathPoints(layer, d.surfaces, aspect)
      mem.path = new MoverPath(points)
      mem.drawn = drawn
      mem.pathKey = pathKey
    }
    const frame: MoverFrame = {
      layer, path: mem.path!, drawn: mem.drawn, aspect, people: d.people, time: d.time, dt: d.dt, scared: mem.scared,
    }
    const sprites = moverSprites(frame)
    mem.scared = frame.scared
    // Only the ones on this output.
    const r = d.rect
    const shown = sprites.filter((s) => {
      if (s.alpha <= 0.002) return false
      const e = Math.max(s.hw, s.hh) * 1.42
      return !(s.x / aspect + e / aspect < r.x || (s.x - e) / aspect > r.x + r.w || s.y + e < r.y || s.y - e > r.y + r.h)
    })
    if (!shown.length) return

    // Paint at about the size they show, in steps, so small changes do not repaint.
    const rows = SPRITE_ROWS[style]
    const pxHigh = (moverHeight(layer) / r.h) * d.h * d.detail
    const scale = Math.min(1, Math.max(0.15, Math.ceil(((pxHigh * 1.3) / rows[0].h) * 8) / 8))
    const atlasKey = [style, layer.color, layer.color2, scale].join('|')
    if (mem.atlas?.key !== atlasKey) {
      const { canvas, cells } = paintAtlas(rows, scale, { color: layer.color, color2: layer.color2 })
      const tex = mem.atlas?.tex ?? gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      mem.atlas = { key: atlasKey, tex, cells }
    }
    const cells = mem.atlas.cells

    gl.useProgram(this.program)
    gl.uniform4f(this.u('uRect'), r.x, r.y, r.w, r.h)
    gl.uniform1f(this.u('uAspect'), aspect)
    const n = parseInt(layer.color2.slice(1), 16)
    gl.uniform3f(this.u('uGlowColor'), ((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, mem.atlas.tex)
    gl.uniform1i(this.u('uAtlas'), 0)
    d.blend(layer.blend)
    const strength = Math.min(1, d.strength)
    for (let start = 0; start < shown.length; start += BATCH) {
      const batch = shown.slice(start, start + BATCH)
      batch.forEach((s, i) => {
        const list = cells.get(s.row) ?? cells.get('main')!
        const cell = list[((s.frame % list.length) + list.length) % list.length]
        this.a.set([s.x, s.y, s.hw, s.hh], i * 4)
        this.b.set([s.angle, s.flip ? -1 : 1, s.alpha * strength, s.glow], i * 4)
        this.c.set([cell.u, cell.v, cell.du, cell.dv], i * 4)
      })
      gl.uniform4fv(this.u('uA'), this.a)
      gl.uniform4fv(this.u('uB'), this.b)
      gl.uniform4fv(this.u('uC'), this.c)
      gl.drawArrays(gl.TRIANGLES, 0, batch.length * 6)
    }
  }

  /** Give back the pictures of layers not drawn for a while. */
  forget(used: Set<string>) {
    const now = performance.now()
    for (const [key, mem] of this.memory) {
      if (!used.has(key) && now - mem.seenAt > 5000) {
        if (mem.atlas) this.gl.deleteTexture(mem.atlas.tex)
        this.memory.delete(key)
      }
    }
  }

  dispose() {
    for (const mem of this.memory.values()) if (mem.atlas) this.gl.deleteTexture(mem.atlas.tex)
    this.memory.clear()
    this.gl.deleteProgram(this.program)
  }
}
