/**
 * The countdown scene layer: days until Christmas (gold foil, frosted ice,
 * candy cane or marquee bulbs) or until Halloween (a glowing jack-o'-lantern
 * orange or ghostly green), as holiday motion graphics; the look picks the holiday.
 * Like the other objects it answers people who come near: it lights up
 * (a faster sweep of light and more glints), grows, or jumps.
 *
 * The artwork (number, ribbon, holly…) is painted with the 2D canvas, which
 * can draw text, into a texture that is only repainted when the number
 * changes; the ticking clock is a small strip patched into that texture once
 * a second. Everything that moves every frame (the foil's sweep of light,
 * twinkling glints, chasing bulbs, the boost when someone walks up) happens
 * in the shader, so a mini PC pays almost nothing per frame.
 *
 * The artwork sits in canvas space, so a countdown spanning two projectors
 * lines up across both: placed by hand like an object (each pin is one
 * countdown, moved, sized and turned on the preview), or centred on the
 * layer's "Where" area for scenes saved before it could be placed. It counts with
 * the server's clock in the computer's own time zone, and turns into
 * "Merry Christmas" on the 25th or "Happy Halloween" on the 31st.
 *
 * Each part (the number, its 3D side, the words, the banner's stitching,
 * the clock, the decorations) can be given its own colour over the look;
 * a part left alone keeps the look's own colouring.
 */

import type { PersonSpot } from '../people'
import type { CountdownColors, LayerBlend, SceneLayer, SourceRect, Surface, SurfaceKind } from '../types'
import { applyHomography } from '../geometry'
import { nearOf } from './catalog'
import { flatAt, glMat3, type FlatPart } from './flat'
import { LAYER_VERTEX } from './shaders'

// -- the count ----------------------------------------------------------------------------

export type Holiday = 'christmas' | 'halloween'

interface HolidayInfo {
  /** Month (0 is January) and day of the big day. */
  month: number
  day: number
  name: string
  /** The small line above the hours on the last day. */
  eve: string
  /** The two script lines on the day itself, and the caption under them. */
  greeting: [string, string]
  wish: string
}

const HOLIDAYS: Record<Holiday, HolidayInfo> = {
  christmas: { month: 11, day: 25, name: 'Christmas', eve: "It's Christmas Eve", greeting: ['Merry', 'Christmas'], wish: 'From our house to yours' },
  halloween: { month: 9, day: 31, name: 'Halloween', eve: 'Halloween is tomorrow', greeting: ['Happy', 'Halloween'], wish: 'Trick or treat!' },
}

export interface Countdown {
  /** True on the big day itself. */
  arrived: boolean
  /** Whole days left, not counting today's remainder. */
  days: number
  hours: number
  minutes: number
  seconds: number
}

/** Time left until midnight at the start of the holiday's next day (25 December, 31 October), by the wall clock. */
export function untilHoliday(nowMs: number, holiday: Holiday = 'christmas'): Countdown {
  const { month, day } = HOLIDAYS[holiday]
  const now = new Date(nowMs)
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  if (m === month && d === day) return { arrived: true, days: 0, hours: 0, minutes: 0, seconds: 0 }
  const year = m > month || (m === month && d > day) ? y + 1 : y
  // Calendar days, so a daylight-saving change cannot make it 67 one hour and 68 the next.
  const calendarDays = Math.round((Date.UTC(year, month, day) - Date.UTC(y, m, d)) / 86_400_000)
  const sinceMidnight = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
  let left = 86_400 - sinceMidnight
  let days = calendarDays - 1
  if (left === 86_400) {
    left = 0
    days += 1
  }
  return {
    arrived: false,
    days,
    hours: Math.floor(left / 3600),
    minutes: Math.floor((left % 3600) / 60),
    seconds: left % 60,
  }
}

/** The words around the big number. */
export function countdownWords(c: Countdown, holiday: Holiday = 'christmas'): { top: string; value: string; caption: string } {
  const h = HOLIDAYS[holiday]
  if (c.arrived) return { top: '', value: '', caption: h.wish }
  if (c.days > 0) {
    return { top: 'Only', value: String(c.days), caption: `${c.days === 1 ? 'Day' : 'Days'} until ${h.name}` }
  }
  // The last day counts the hours, then the minutes.
  if (c.hours > 0) {
    return { top: h.eve, value: String(c.hours), caption: `${c.hours === 1 ? 'Hour' : 'Hours'} until ${h.name}` }
  }
  const minutes = Math.max(1, c.minutes + (c.seconds > 0 ? 1 : 0))
  return { top: 'Almost there', value: String(minutes), caption: `${minutes === 1 ? 'Minute' : 'Minutes'} until ${h.name}` }
}

// -- fonts ---------------------------------------------------------------------------------

const FONTS: Array<[string, string, string]> = [
  ['Countdown Display', '900', new URL('./fonts/playfair-display-900.woff2', import.meta.url).href],
  ['Countdown Caps', '700', new URL('./fonts/cinzel-700.woff2', import.meta.url).href],
  ['Countdown Script', '400', new URL('./fonts/great-vibes-400.woff2', import.meta.url).href],
  ['Countdown Spooky', '400', new URL('./fonts/creepster-400.woff2', import.meta.url).href],
]
let fontsState: 'none' | 'loading' | 'ready' = 'none'

/** True once the bundled fonts are in; until then a stand-in serif is drawn. */
export function countdownFontsReady(): boolean {
  if (fontsState === 'none' && typeof FontFace !== 'undefined') {
    fontsState = 'loading'
    Promise.all(
      FONTS.map(([family, weight, url]) => new FontFace(family, `url(${url})`, { weight }).load().then((f) => {
        document.fonts.add(f)
      })),
    )
      .catch(() => undefined)
      .finally(() => {
        fontsState = 'ready'
      })
  }
  return fontsState === 'ready'
}

const DISPLAY = '"Countdown Display", "Playfair Display", Georgia, serif'
const CAPS = '"Countdown Caps", "Cinzel", "Trajan Pro", Georgia, serif'
const SCRIPT = '"Countdown Script", "Great Vibes", "Brush Script MT", cursive'
const SPOOKY = '"Countdown Spooky", "Creepster", Impact, fantasy'

// -- the artwork ---------------------------------------------------------------------------

/** The artwork is designed at this size and scaled to fit. */
export const DESIGN_W = 1600
export const DESIGN_H = 1000
/** Where the ticking clock goes, in design units; nothing else is drawn there. */
const CLOCK = { x: 420, y: 846, w: 760, h: 150 }

// New looks go at the end: the shader knows them by their place in this list.
export const COUNTDOWN_STYLES = ['gold', 'frost', 'candy', 'marquee', 'pumpkin', 'ghostly'] as const
export type CountdownStyle = (typeof COUNTDOWN_STYLES)[number]

const HALLOWEEN_STYLES: readonly string[] = ['pumpkin', 'ghostly']

/** Which day a look counts to. */
export function holidayOf(style: string): Holiday {
  return HALLOWEEN_STYLES.includes(style) ? 'halloween' : 'christmas'
}

interface Palette {
  /** Face gradient, top to bottom. */
  face: string[]
  /** The extruded depth behind the face, front to back. */
  depth: [string, string]
  /** Small lettering and flourishes. */
  trim: string[]
  edge: string
}

const PALETTES: Record<CountdownStyle, Palette> = {
  gold: {
    face: ['#fff8dc', '#ffe08a', '#f2b632', '#a8680a', '#d9961c', '#ffe7a1', '#fff4c9'],
    depth: ['#7a4b07', '#2e1a02'],
    trim: ['#fff3c4', '#f5c451', '#b97c12'],
    edge: 'rgba(255,250,225,0.85)',
  },
  frost: {
    face: ['#ffffff', '#f2f9ff', '#cfe6ff', '#7fb1e6', '#a9d2fb', '#e9f5ff', '#ffffff'],
    depth: ['#2f5d8c', '#0b1f38'],
    trim: ['#ffffff', '#cfe6ff', '#86b6e8'],
    edge: 'rgba(255,255,255,0.9)',
  },
  candy: {
    face: ['#ffffff', '#fff5f5', '#ffffff'],
    depth: ['#7f1020', '#2c0309'],
    trim: ['#ffffff', '#ffe4e6', '#fda4af'],
    edge: 'rgba(255,255,255,0.95)',
  },
  marquee: {
    face: ['#3a0d0a', '#240605'],
    depth: ['#5c3a0a', '#1a0d02'],
    trim: ['#fff3c4', '#f5c451', '#b97c12'],
    edge: 'rgba(255,214,120,0.9)',
  },
  pumpkin: {
    face: ['#fff1c2', '#ffcf6b', '#ff9a1f', '#c2410c', '#ea580c', '#ffb347', '#ffe3a6'],
    depth: ['#5a1a02', '#140400'],
    trim: ['#ffe3a6', '#ff9a1f', '#c2410c'],
    edge: 'rgba(255,232,180,0.85)',
  },
  ghostly: {
    face: ['#f7fff0', '#e2ffd0', '#b6f58c', '#4d9e2a', '#86d957', '#d9ffc2', '#f4ffec'],
    depth: ['#24451a', '#050d03'],
    trim: ['#f0ffe6', '#a3e635', '#4d7c0f'],
    edge: 'rgba(240,255,230,0.9)',
  },
}

// -- a colour for each part ------------------------------------------------------------------

export type CountdownPart = keyof CountdownColors

/**
 * Every part that can have its own colour, in the order the settings list
 * them. "banner" and "glow" are the layer's two colours; the rest are kept in
 * the layer's ``colors``.
 */
export const COUNTDOWN_PARTS: Array<{ id: CountdownPart | 'banner' | 'glow'; label: string }> = [
  { id: 'number', label: 'Big number' },
  { id: 'depth', label: "Number's 3D side" },
  { id: 'top', label: 'Words above the number' },
  { id: 'banner', label: 'Banner' },
  { id: 'caption', label: 'Words on the banner' },
  { id: 'stitch', label: 'Banner stitching' },
  { id: 'clock', label: 'Clock numbers' },
  { id: 'labels', label: 'Clock words' },
  { id: 'decorations', label: 'Decorations' },
  { id: 'glow', label: 'Glow' },
]

/** The colour each part has in a look before anything is picked, to start each colour picker from. */
export function countdownLookColors(style: string): Record<CountdownPart, string> {
  const look: CountdownStyle = (COUNTDOWN_STYLES as readonly string[]).includes(style) ? (style as CountdownStyle) : 'gold'
  const pal = PALETTES[look]
  const light = lightFor(look)
  return {
    number: look === 'candy' ? CANDY_RED : look === 'marquee' ? PALETTES.gold.face[2] : pal.face[2],
    depth: pal.depth[0],
    top: pal.trim[1],
    caption: look === 'frost' || look === 'candy' ? '#e8f1ff' : pal.trim[1],
    stitch: light,
    clock: pal.trim[1],
    labels: light,
    decorations: DECORATION[look],
  }
}

const CANDY_RED = '#d61f2c'

/** The pale colour of the stitching and the clock's words in each look. */
function lightFor(style: CountdownStyle) {
  return style === 'frost' ? '#e0f2ff' : style === 'ghostly' ? '#d9ffc2' : '#ffe9a8'
}

/** The main colour of each look's decorations (holly, snowflakes, peppermints, pumpkins, ghosts). */
const DECORATION: Record<CountdownStyle, string> = {
  gold: '#1f7a3a',
  frost: '#ffffff',
  candy: CANDY_RED,
  marquee: '#1f7a3a',
  pumpkin: '#ea580c',
  ghostly: '#ffffff',
}

/** A metallic face gradient, top to bottom, made from one colour like the looks' own. */
function faceFrom(c: string): string[] {
  return [shade(c, 0.8), shade(c, 0.45), c, shade(c, -0.4), shade(c, -0.15), shade(c, 0.4), shade(c, 0.7)]
}

/** Small lettering's gradient from one colour. */
function trimFrom(c: string): string[] {
  return [shade(c, 0.6), c, shade(c, -0.35)]
}

type Ctx = CanvasRenderingContext2D

/** Lighter (k > 0) or darker (k < 0), as #rrggbb. */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.round(Math.max(0, Math.min(255, k >= 0 ? v + (255 - v) * k : v * (1 + k))))
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('')}`
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

function vertical(ctx: Ctx, top: number, bottom: number, stops: string[]) {
  const g = ctx.createLinearGradient(0, top, 0, bottom)
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c))
  return g
}

/** Text with even letter spacing, centred on x, without relying on ctx.letterSpacing. */
function spaced(ctx: Ctx, text: string, x: number, y: number, spacing: number, how: 'fill' | 'stroke' = 'fill') {
  const widths = [...text].map((ch) => ctx.measureText(ch).width)
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (widths.length - 1)
  let cx = x - total / 2
  const align = ctx.textAlign
  ctx.textAlign = 'left'
  ;[...text].forEach((ch, i) => {
    if (how === 'fill') ctx.fillText(ch, cx, y)
    else ctx.strokeText(ch, cx, y)
    cx += widths[i] + spacing
  })
  ctx.textAlign = align
  return total
}

function fitFont(ctx: Ctx, text: string, family: string, weight: string, size: number, maxWidth: number, spacing = 0) {
  let s = size
  for (let i = 0; i < 12; i++) {
    ctx.font = `${weight} ${s}px ${family}`
    const w = ctx.measureText(text).width + spacing * Math.max(0, text.length - 1) * (s / size)
    if (w <= maxWidth) break
    s *= 0.92
  }
  return s
}

/** A holly leaf from the origin along +x, length l, width w. */
function hollyLeaf(ctx: Ctx, l: number, w: number) {
  const upper: Array<[number, number]> = [[0, 0], [0.22 * l, -0.44 * w], [0.46 * l, -0.52 * w], [0.7 * l, -0.44 * w], [l, 0]]
  const lower = upper.map(([x, y]) => [x, -y] as [number, number]).reverse()
  const points = [...upper, ...lower.slice(1)]
  ctx.beginPath()
  ctx.moveTo(0, 0)
  for (let i = 1; i < points.length; i++) {
    const [px, py] = points[i - 1]
    const [x, y] = points[i]
    // Each edge between spikes curves in toward the middle vein.
    ctx.quadraticCurveTo((px + x) / 2, ((py + y) / 2) * 0.35, x, y)
  }
  ctx.closePath()
}

function holly(ctx: Ctx, x: number, y: number, s: number, flip: boolean, leaf: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(flip ? -s : s, s)
  const leaves: Array<[number, number]> = [[-0.35, 150], [0.35, 140], [-1.25, 120]]
  for (const [angle, l] of leaves) {
    ctx.save()
    ctx.rotate(angle - Math.PI / 2 + 0.6)
    const g = ctx.createLinearGradient(0, -40, 0, 40)
    g.addColorStop(0, shade(leaf, 0.35))
    g.addColorStop(0.5, leaf)
    g.addColorStop(1, shade(leaf, -0.55))
    ctx.fillStyle = g
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = 10
    ctx.shadowOffsetY = 5
    hollyLeaf(ctx, l, 70)
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.strokeStyle = shade(leaf, 0.5)
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(6, 0)
    ctx.quadraticCurveTo(l * 0.5, -4, l * 0.92, 0)
    ctx.stroke()
    ctx.restore()
  }
  const berries: Array<[number, number]> = [[-14, -10], [16, -16], [2, 14]]
  for (const [bx, by] of berries) {
    const g = ctx.createRadialGradient(bx - 7, by - 8, 2, bx, by, 24)
    g.addColorStop(0, '#ffd6d6')
    g.addColorStop(0.25, '#ff3b3b')
    g.addColorStop(0.8, '#a10d14')
    g.addColorStop(1, '#4a0307')
    ctx.fillStyle = g
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetY = 4
    ctx.beginPath()
    ctx.arc(bx, by, 22, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function snowflake(ctx: Ctx, x: number, y: number, r: number, color: string, glow: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.shadowColor = glow
  ctx.shadowBlur = r * 0.35
  for (let i = 0; i < 6; i++) {
    ctx.save()
    ctx.rotate((i * Math.PI) / 3)
    ctx.lineWidth = r * 0.09
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, -r)
    for (const at of [0.45, 0.72]) {
      const b = r * (at === 0.45 ? 0.3 : 0.22)
      ctx.moveTo(0, -r * at)
      ctx.lineTo(-b, -r * at - b)
      ctx.moveTo(0, -r * at)
      ctx.lineTo(b, -r * at - b)
    }
    ctx.stroke()
    ctx.restore()
  }
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.12, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function peppermint(ctx: Ctx, x: number, y: number, r: number, red: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 6
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = red
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(Math.cos(a + 0.5) * r * 0.6, Math.sin(a + 0.5) * r * 0.6, Math.cos(a + 0.25) * r * 0.96, Math.sin(a + 0.25) * r * 0.96)
    ctx.arc(0, 0, r * 0.96, a + 0.25, a + 0.6)
    ctx.quadraticCurveTo(Math.cos(a + 0.7) * r * 0.5, Math.sin(a + 0.7) * r * 0.5, 0, 0)
    ctx.fill()
  }
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r)
  g.addColorStop(0, 'rgba(255,255,255,0.7)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.05)')
  g.addColorStop(1, 'rgba(0,0,0,0.25)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** A carved jack-o'-lantern lit from inside. */
function jackOLantern(ctx: Ctx, x: number, y: number, r: number, glow: string, body?: string) {
  // The look's own orange, or the picked colour lighter and darker.
  const [light, mid, dark] = body ? [shade(body, 0.12), body, shade(body, -0.42)] : ['#ff8c1a', '#ea580c', '#9a3412']
  ctx.save()
  ctx.translate(x, y)
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 14
  ctx.shadowOffsetY = 6
  // Ribs: overlapping ovals, the outer ones darker.
  for (const [ox, w, k] of [[-0.48, 0.62, -0.35], [0.48, 0.62, -0.35], [-0.22, 0.6, -0.12], [0.22, 0.6, -0.12], [0, 0.55, 0]] as const) {
    const g = ctx.createRadialGradient(ox * r - r * 0.15, -r * 0.35, r * 0.05, ox * r, 0, r)
    g.addColorStop(0, shade(light, 0.35 + k))
    g.addColorStop(0.6, shade(mid, k))
    g.addColorStop(1, shade(dark, k - 0.2))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(ox * r, 0, w * r, r * 0.86, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.shadowColor = 'transparent'
  // The stem.
  ctx.fillStyle = '#4d7c0f'
  ctx.beginPath()
  ctx.moveTo(-r * 0.1, -r * 0.8)
  ctx.quadraticCurveTo(-r * 0.05, -r * 1.12, r * 0.18, -r * 1.2)
  ctx.lineTo(r * 0.22, -r * 1.08)
  ctx.quadraticCurveTo(r * 0.08, -r * 1.02, r * 0.1, -r * 0.8)
  ctx.closePath()
  ctx.fill()
  // The face, glowing.
  ctx.fillStyle = '#fff3b0'
  ctx.shadowColor = glow
  ctx.shadowBlur = r * 0.35
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(side * r * 0.42, -r * 0.08)
    ctx.lineTo(side * r * 0.14, -r * 0.08)
    ctx.lineTo(side * r * 0.3, -r * 0.42)
    ctx.closePath()
    ctx.fill()
  }
  ctx.beginPath()
  ctx.moveTo(-r * 0.08, r * 0.08)
  ctx.lineTo(r * 0.08, r * 0.08)
  ctx.lineTo(0, -r * 0.06)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-r * 0.55, r * 0.22)
  ctx.quadraticCurveTo(0, r * 0.75, r * 0.55, r * 0.22)
  ctx.lineTo(r * 0.32, r * 0.3)
  ctx.lineTo(r * 0.24, r * 0.44)
  ctx.lineTo(r * 0.1, r * 0.33)
  ctx.lineTo(-r * 0.1, r * 0.33)
  ctx.lineTo(-r * 0.24, r * 0.44)
  ctx.lineTo(-r * 0.32, r * 0.3)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** A little ghost with a wavy hem. */
function ghost(ctx: Ctx, x: number, y: number, r: number, flip: boolean, glow: string, body?: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(flip ? -1 : 1, 1)
  ctx.rotate(-0.12)
  ctx.shadowColor = glow
  ctx.shadowBlur = r * 0.5
  const g = ctx.createLinearGradient(0, -r, 0, r)
  g.addColorStop(0, body ? shade(body, 0.6) : '#ffffff')
  g.addColorStop(0.7, body ?? '#eef7ff')
  g.addColorStop(1, body ? rgba(shade(body, -0.15), 0.75) : 'rgba(214,232,255,0.75)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(-r * 0.62, r * 0.9)
  ctx.lineTo(-r * 0.62, -r * 0.2)
  ctx.arc(0, -r * 0.2, r * 0.62, Math.PI, 0)
  ctx.lineTo(r * 0.62, r * 0.9)
  for (let i = 0; i < 4; i++) {
    const x0 = r * 0.62 - (i * r * 1.24) / 4
    ctx.quadraticCurveTo(x0 - r * 0.155, r * (i % 2 ? 0.7 : 1.1), x0 - r * 0.31, r * 0.9)
  }
  ctx.closePath()
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = '#0b1020'
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(side * r * 0.22, -r * 0.25, r * 0.1, r * 0.16, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.beginPath()
  ctx.ellipse(0, r * 0.12, r * 0.12, r * 0.17, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** A bat in silhouette, wings out, rimmed by the glow. */
function bat(ctx: Ctx, x: number, y: number, r: number, tilt: number, glow: string, body = '#0a0612') {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  ctx.fillStyle = body
  ctx.shadowColor = glow
  ctx.shadowBlur = r * 0.6
  ctx.beginPath()
  ctx.moveTo(0, -r * 0.22)
  ctx.lineTo(r * 0.1, -r * 0.42)
  ctx.lineTo(r * 0.14, -r * 0.2)
  ctx.quadraticCurveTo(r * 0.55, -r * 0.6, r * 1.2, -r * 0.35)
  ctx.quadraticCurveTo(r * 1.0, -r * 0.1, r * 1.02, r * 0.12)
  ctx.quadraticCurveTo(r * 0.82, -r * 0.02, r * 0.66, r * 0.12)
  ctx.quadraticCurveTo(r * 0.5, -r * 0.02, r * 0.36, r * 0.16)
  ctx.quadraticCurveTo(r * 0.2, r * 0.05, 0, r * 0.32)
  ctx.quadraticCurveTo(-r * 0.2, r * 0.05, -r * 0.36, r * 0.16)
  ctx.quadraticCurveTo(-r * 0.5, -r * 0.02, -r * 0.66, r * 0.12)
  ctx.quadraticCurveTo(-r * 0.82, -r * 0.02, -r * 1.02, r * 0.12)
  ctx.quadraticCurveTo(-r * 1.0, -r * 0.1, -r * 1.2, -r * 0.35)
  ctx.quadraticCurveTo(-r * 0.55, -r * 0.6, -r * 0.14, -r * 0.2)
  ctx.lineTo(-r * 0.1, -r * 0.42)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** A thin rule with a diamond, either side of the small top line. */
function flourish(ctx: Ctx, x: number, y: number, length: number, dir: number, style: string | CanvasGradient) {
  ctx.save()
  ctx.strokeStyle = style
  ctx.fillStyle = style
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + dir * length, y)
  ctx.stroke()
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x + dir * length * 0.15, y - 9)
  ctx.lineTo(x + dir * length * 0.85, y - 9)
  ctx.moveTo(x + dir * length * 0.15, y + 9)
  ctx.lineTo(x + dir * length * 0.85, y + 9)
  ctx.stroke()
  const d = (cx: number, r: number) => {
    ctx.beginPath()
    ctx.moveTo(cx, y - r)
    ctx.lineTo(cx + r, y)
    ctx.lineTo(cx, y + r)
    ctx.lineTo(cx - r, y)
    ctx.closePath()
    ctx.fill()
  }
  d(x + dir * length, 11)
  d(x + dir * (length + 26), 6)
  ctx.restore()
}

/** Four-point star used as a static ornament (the moving glints are in the shader). */
function star(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2
    const rr = i % 2 === 0 ? r : r * 0.22
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fill()
}

/** The satin ribbon across the middle, with folded, notched tails. */
function ribbon(ctx: Ctx, cy: number, color: string, edge: string): Path2D {
  const cx = DESIGN_W / 2
  const bw = 1060
  const bh = 128
  const arch = 16
  const left = cx - bw / 2
  const right = cx + bw / 2
  const top = cy - bh / 2
  const bottom = cy + bh / 2
  const tail = 190
  const drop = 30

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 12
  for (const side of [-1, 1]) {
    const inner = side < 0 ? left + 70 : right - 70
    const outer = inner + side * (tail + 70)
    const g = ctx.createLinearGradient(0, top + drop, 0, bottom + drop)
    g.addColorStop(0, shade(color, -0.2))
    g.addColorStop(0.5, shade(color, -0.42))
    g.addColorStop(1, shade(color, -0.62))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(inner, top + drop)
    ctx.lineTo(outer, top + drop)
    ctx.lineTo(outer - side * 46, cy + drop)
    ctx.lineTo(outer, bottom + drop)
    ctx.lineTo(inner, bottom + drop)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  // The folds where the band tucks behind into the tails.
  for (const side of [-1, 1]) {
    const x = side < 0 ? left : right
    ctx.fillStyle = shade(color, -0.75)
    ctx.beginPath()
    ctx.moveTo(x, bottom)
    ctx.lineTo(x - side * 70, bottom)
    ctx.lineTo(x - side * 70, bottom + drop)
    ctx.closePath()
    ctx.fill()
  }

  const band = new Path2D()
  band.moveTo(left, top)
  band.quadraticCurveTo(cx, top - arch, right, top)
  band.lineTo(right, bottom)
  band.quadraticCurveTo(cx, bottom - arch, left, bottom)
  band.closePath()
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 30
  ctx.shadowOffsetY = 14
  ctx.fillStyle = vertical(ctx, top - arch, bottom, [
    shade(color, 0.32), shade(color, 0.05), color, shade(color, -0.25), shade(color, -0.45),
  ])
  ctx.fill(band)
  ctx.restore()
  // Satin sheen across the top of the band.
  ctx.save()
  ctx.clip(band)
  const sheen = ctx.createLinearGradient(0, top - arch, 0, bottom)
  sheen.addColorStop(0, 'rgba(255,255,255,0.35)')
  sheen.addColorStop(0.3, 'rgba(255,255,255,0.06)')
  sheen.addColorStop(0.31, 'rgba(255,255,255,0)')
  sheen.addColorStop(1, 'rgba(0,0,0,0.15)')
  ctx.fillStyle = sheen
  ctx.fillRect(left, top - arch, bw, bh + arch)
  // Stitching just inside both edges.
  ctx.strokeStyle = edge
  ctx.lineWidth = 2.5
  ctx.setLineDash([14, 9])
  for (const y0 of [top + 14, bottom - 14]) {
    ctx.beginPath()
    ctx.moveTo(left, y0)
    ctx.quadraticCurveTo(cx, y0 - arch, right, y0)
    ctx.stroke()
  }
  ctx.restore()
  return band
}

export interface ArtOptions {
  style: CountdownStyle
  ribbon: string
  glow: string
  words: { top: string; value: string; caption: string }
  /** The big day itself: the greeting instead of the number. */
  arrived: boolean
  /** Each part's own colour; a part left out keeps the look's. */
  colors?: CountdownColors | null
}

/**
 * Paint the artwork at ``scale`` (pixels per design unit) into ``art``, and
 * where the light should catch (R: foil; G: bulb; B: bulb's number) into ``fx``.
 */
export function paintArt(art: HTMLCanvasElement, fx: HTMLCanvasElement, scale: number, o: ArtOptions) {
  const W = Math.round(DESIGN_W * scale)
  const H = Math.round(DESIGN_H * scale)
  for (const c of [art, fx]) {
    c.width = W
    c.height = H
  }
  const ctx = art.getContext('2d')!
  const fxc = fx.getContext('2d')!
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  fxc.setTransform(1, 0, 0, 1, 0, 0)
  fxc.fillStyle = '#000'
  fxc.fillRect(0, 0, W, H)
  fxc.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'
  fxc.textBaseline = 'alphabetic'
  fxc.textAlign = 'center'

  const pal = PALETTES[o.style]
  const own = o.colors ?? {}
  const holiday = holidayOf(o.style)
  const spooky = holiday === 'halloween'
  // "Merry Christmas" is too thin for bulbs; the marquee look writes it in gold.
  const bulbsOn = o.style === 'marquee' && !o.arrived
  // A picked number colour replaces the face (the marquee's gold rim while its bulbs are on).
  const numberFace = own.number ? faceFrom(own.number) : null
  const face = bulbsOn ? pal.face : numberFace ?? (o.style === 'marquee' ? PALETTES.gold.face : pal.face)
  const depthColors = own.depth ? [own.depth, shade(own.depth, -0.7)] : pal.depth
  const cx = DESIGN_W / 2
  const trimStops = (t: string[]) => vertical(ctx, 0, DESIGN_H, [t[0], t[1], t[2], t[1]])
  const trim = trimStops(pal.trim)
  const topTrim = own.top ? trimStops(trimFrom(own.top)) : trim
  const ribbonY = 728

  // A soft halo of the glow colour behind everything, so the artwork reads
  // as light on the house rather than a sticker.
  // An ellipse that has faded out before the clock's strip.
  ctx.save()
  ctx.translate(cx, 450)
  ctx.scale(1.2, 0.6)
  const halo = ctx.createRadialGradient(0, 0, 40, 0, 0, 600)
  halo.addColorStop(0, rgba(o.glow, 0.3))
  halo.addColorStop(0.5, rgba(o.glow, 0.09))
  halo.addColorStop(1, rgba(o.glow, 0))
  ctx.fillStyle = halo
  ctx.fillRect(-600, -600, 1200, 1200)
  ctx.restore()

  // -- the top line -------------------------------------------------------------
  if (o.words.top) {
    const topFamily = spooky ? SPOOKY : CAPS
    const topWeight = spooky ? '400' : '700'
    const size = fitFont(ctx, o.words.top.toUpperCase(), topFamily, topWeight, spooky ? 70 : 62, 760, 16)
    ctx.font = `${topWeight} ${size}px ${topFamily}`
    ctx.fillStyle = topTrim
    ctx.shadowColor = rgba(o.glow, 0.8)
    ctx.shadowBlur = 22
    const w = spaced(ctx, o.words.top.toUpperCase(), cx, 150, size * 0.26)
    ctx.shadowBlur = 0
    fxc.font = ctx.font
    fxc.fillStyle = '#f00'
    spaced(fxc, o.words.top.toUpperCase(), cx, 150, size * 0.26)
    for (const dir of [-1, 1]) flourish(ctx, cx + dir * (w / 2 + 30), 130, 150, dir, topTrim)
  }

  // -- the hero: the number, or "Merry Christmas" / "Happy Halloween" -----------------
  const lines: Array<{ text: string; y: number; size: number; family: string; weight: string }> = []
  if (o.arrived) {
    const [first, second] = HOLIDAYS[holiday].greeting
    const family = spooky ? SPOOKY : SCRIPT
    const s1 = fitFont(ctx, first, family, '400', spooky ? 260 : 300, 1100)
    const s2 = fitFont(ctx, second, family, '400', spooky ? 260 : 300, 1300)
    lines.push({ text: first, y: 330, size: Math.min(s1, s2), family, weight: '400' })
    lines.push({ text: second, y: 590, size: Math.min(s1, s2), family, weight: '400' })
  } else {
    const base = o.words.value.length >= 3 ? 470 : 540
    const size = fitFont(ctx, o.words.value, DISPLAY, '900', base, 1000)
    lines.push({ text: o.words.value, y: 590, size, family: DISPLAY, weight: '900' })
  }

  for (const line of lines) {
    ctx.font = `${line.weight} ${line.size}px ${line.family}`
    const m = ctx.measureText(line.text)
    const top = line.y - (m.actualBoundingBoxAscent || line.size * 0.72)
    const bottom = line.y + (m.actualBoundingBoxDescent || 0)
    const depth = Math.max(10, Math.round(line.size * 0.045))

    // Outer glow.
    ctx.save()
    ctx.shadowColor = rgba(o.glow, 0.9)
    ctx.shadowBlur = 70
    ctx.fillStyle = rgba(o.glow, 0.55)
    ctx.fillText(line.text, cx, line.y + depth)
    ctx.restore()

    // Extruded depth: copies stepping back down and to the right.
    for (let i = depth; i >= 1; i--) {
      const t = i / depth
      ctx.fillStyle = t > 0.95 ? 'rgba(0,0,0,0.75)' : mixHex(depthColors[0], depthColors[1], t)
      ctx.fillText(line.text, cx + i * 0.55, line.y + i)
    }

    // The face.
    if (o.style === 'candy') {
      ctx.fillStyle = candyStripes(ctx, own.number ?? CANDY_RED)
    } else {
      ctx.fillStyle = vertical(ctx, top, bottom, face)
    }
    ctx.fillText(line.text, cx, line.y)

    if (bulbsOn) {
      ctx.lineWidth = 9
      ctx.strokeStyle = vertical(ctx, top, bottom, numberFace ?? PALETTES.gold.face)
      ctx.strokeText(line.text, cx, line.y)
      bulbs(ctx, fxc, line, cx, o.glow)
    } else {
      // A bright bevel line on the upper edges.
      ctx.save()
      ctx.lineWidth = Math.max(2, line.size * 0.008)
      ctx.strokeStyle = own.number ? rgba(shade(own.number, 0.85), 0.85) : pal.edge
      ctx.globalCompositeOperation = 'source-atop'
      ctx.strokeText(line.text, cx - 1.5, line.y - 2)
      ctx.restore()
      // Light catches the face.
      fxc.font = ctx.font
      fxc.fillStyle = '#f00'
      fxc.fillText(line.text, cx, line.y)
    }
  }

  // -- ribbon and caption ----------------------------------------------------------
  // Picked stitching is drawn a little stronger, so the colour reads.
  const band = ribbon(ctx, ribbonY, o.ribbon, own.stitch ? rgba(own.stitch, 0.85) : rgba(lightFor(o.style), 0.55))
  // The ribbon hides the foot of the number, so light must not catch it there.
  fxc.fillStyle = '#000'
  fxc.fill(band)
  const caption = o.words.caption.toUpperCase()
  const capSize = fitFont(ctx, caption, CAPS, '700', 58, 860, 10)
  ctx.font = `700 ${capSize}px ${CAPS}`
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  spaced(ctx, caption, cx + 2, ribbonY + capSize * 0.36 + 3, capSize * 0.18)
  ctx.fillStyle = own.caption
    ? vertical(ctx, ribbonY - 30, ribbonY + 30, trimFrom(own.caption))
    : o.style === 'frost' || o.style === 'candy' ? vertical(ctx, ribbonY - 30, ribbonY + 30, ['#ffffff', '#e8f1ff', '#c9dcf5']) : trim
  spaced(ctx, caption, cx, ribbonY + capSize * 0.36, capSize * 0.18)
  ctx.restore()
  fxc.font = ctx.font
  fxc.fillStyle = '#f00'
  spaced(fxc, caption, cx, ribbonY + capSize * 0.36, capSize * 0.18)

  // -- ornaments at the ribbon's ends -------------------------------------------------
  const ends: Array<[number, boolean]> = [[cx - 545, false], [cx + 545, true]]
  const deco = own.decorations ?? undefined
  for (const [x, flip] of ends) {
    if (o.style === 'frost') {
      snowflake(ctx, x, ribbonY - 6, 78, deco ?? '#ffffff', rgba(o.glow, 0.9))
      snowflake(ctx, x + (flip ? 95 : -95), ribbonY - 100, 34, deco ? shade(deco, 0.3) : '#e6f3ff', rgba(o.glow, 0.9))
    } else if (o.style === 'candy') {
      peppermint(ctx, x, ribbonY - 4, 70, deco ?? CANDY_RED)
      peppermint(ctx, x + (flip ? 80 : -80), ribbonY - 82, 38, deco ?? CANDY_RED)
    } else if (o.style === 'pumpkin') {
      jackOLantern(ctx, x, ribbonY - 10, 82, o.glow, deco)
      jackOLantern(ctx, x + (flip ? 92 : -92), ribbonY - 104, 40, o.glow, deco)
    } else if (o.style === 'ghostly') {
      ghost(ctx, x, ribbonY - 20, 82, flip, o.glow, deco)
      ghost(ctx, x + (flip ? 100 : -100), ribbonY - 130, 40, !flip, o.glow, deco)
    } else {
      holly(ctx, x, ribbonY - 4, 0.95, flip, deco ?? DECORATION.gold)
    }
  }

  if (spooky) {
    // Bats instead of stars, flying out from behind the number.
    const bats: Array<[number, number, number, number]> = [
      [240, 300, 58, -0.25], [1360, 290, 66, 0.2], [180, 500, 34, 0.15], [1430, 510, 38, -0.2], [170, 140, 28, 0.3], [1440, 130, 30, -0.3],
    ]
    for (const [x, y, r, tilt] of bats) bat(ctx, x, y, r, tilt, o.glow, deco)
    return
  }
  // Scattered static stars around the hero; the shader makes some glint.
  ctx.fillStyle = deco ? trimStops(trimFrom(deco)) : trim
  ctx.shadowColor = rgba(o.glow, 0.9)
  ctx.shadowBlur = 14
  const stars: Array<[number, number, number]> = [
    [250, 260, 22], [1350, 240, 26], [190, 470, 12], [1420, 500, 14], [330, 120, 10], [1270, 110, 12],
  ]
  for (const [x, y, r] of stars) {
    star(ctx, x, y, r)
    fxc.fillStyle = '#f00'
    star(fxc, x, y, r)
  }
  ctx.shadowBlur = 0
}

function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t)
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`
}

function candyStripes(ctx: Ctx, red: string): CanvasPattern {
  const tile = document.createElement('canvas')
  tile.width = 120
  tile.height = 120
  const t = tile.getContext('2d')!
  t.fillStyle = '#fffafa'
  t.fillRect(0, 0, 120, 120)
  t.fillStyle = red
  for (const off of [-120, 0, 120]) {
    t.beginPath()
    t.moveTo(off, 120)
    t.lineTo(off + 120, 0)
    t.lineTo(off + 165, 0)
    t.lineTo(off + 45, 120)
    t.closePath()
    t.fill()
  }
  // A little roundness on each stripe.
  const g = t.createLinearGradient(0, 0, 120, 120)
  g.addColorStop(0, 'rgba(255,255,255,0.25)')
  g.addColorStop(1, 'rgba(0,0,0,0.12)')
  t.fillStyle = g
  t.fillRect(0, 0, 120, 120)
  return ctx.createPattern(tile, 'repeat')!
}

/** Marquee style: light bulbs on a grid inside the number's shape. */
function bulbs(
  ctx: Ctx,
  fxc: Ctx,
  line: { text: string; y: number; size: number; family: string; weight: string },
  cx: number,
  glow: string,
) {
  const S = 0.5
  const shape = document.createElement('canvas')
  shape.width = DESIGN_W * S
  shape.height = DESIGN_H * S
  const s = shape.getContext('2d', { willReadFrequently: true })!
  s.scale(S, S)
  s.textAlign = 'center'
  s.textBaseline = 'alphabetic'
  s.font = `${line.weight} ${line.size}px ${line.family}`
  s.fillStyle = '#fff'
  s.fillText(line.text, cx, line.y)
  // Shrink the shape a little so bulbs stay off the gold rim.
  s.globalCompositeOperation = 'destination-out'
  s.lineWidth = 34
  s.strokeStyle = '#000'
  s.strokeText(line.text, cx, line.y)
  const data = s.getImageData(0, 0, shape.width, shape.height).data
  const step = Math.max(30, line.size * 0.075)
  let n = 0
  for (let y = step / 2; y < DESIGN_H; y += step) {
    const row = Math.round(y / step)
    for (let x = row % 2 ? step : step / 2; x < DESIGN_W; x += step) {
      const px = Math.floor(x * S)
      const py = Math.floor(y * S)
      if (data[(py * shape.width + px) * 4 + 3] < 128) continue
      const r = step * 0.3
      // Glass and a faint halo; the shader lights it.
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2)
      g.addColorStop(0, rgba(glow, 0.55))
      g.addColorStop(0.45, rgba(glow, 0.18))
      g.addColorStop(1, rgba(glow, 0))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r * 2.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#5a4120'
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      const phase = Math.round(((n * 0.6180339) % 1) * 254) + 1
      fxc.globalCompositeOperation = 'lighter'
      fxc.fillStyle = `rgb(0,255,${phase})`
      fxc.beginPath()
      fxc.arc(x, y, r, 0, Math.PI * 2)
      fxc.fill()
      fxc.globalCompositeOperation = 'source-over'
      n++
    }
  }
}

/** The ticking "hours : minutes : seconds" strip, painted on its own small canvas. */
export function paintClock(
  canvas: HTMLCanvasElement,
  scale: number,
  c: Countdown,
  style: CountdownStyle,
  glow: string,
  colors?: CountdownColors | null,
) {
  const W = Math.floor(CLOCK.w * scale)
  const H = Math.floor(CLOCK.h * scale)
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W
    canvas.height = H
  }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, W, H)
  if (c.arrived) return
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  const pal = PALETTES[style]
  const groups = [
    [String(c.hours).padStart(2, '0'), 'Hours'],
    [String(c.minutes).padStart(2, '0'), 'Minutes'],
    [String(c.seconds).padStart(2, '0'), 'Seconds'],
  ]
  const cell = 64
  const gap = 250
  const mid = CLOCK.w / 2
  const fill = vertical(ctx, 10, 100, colors?.clock ? trimFrom(colors.clock) : [pal.trim[0], pal.trim[1], pal.trim[2]])
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  groups.forEach(([digits, label], gi) => {
    const gx = mid + (gi - 1) * gap
    ctx.font = `900 96px ${DISPLAY}`
    ctx.shadowColor = rgba(glow, 0.85)
    ctx.shadowBlur = 16
    ctx.fillStyle = fill
    // Each digit centred in its own cell, so the numbers do not wobble as they tick.
    ;[...digits].forEach((d, i) => ctx.fillText(d, gx + (i - 0.5) * cell, 96))
    ctx.shadowBlur = 0
    ctx.font = `700 27px ${CAPS}`
    ctx.fillStyle = colors?.labels ? rgba(colors.labels, 0.95) : rgba(style === 'frost' ? '#e0f0ff' : style === 'ghostly' ? '#e8ffd9' : '#ffe9a8', 0.9)
    spaced(ctx, label.toUpperCase(), gx, 142, 4)
    if (gi < 2) {
      ctx.fillStyle = fill
      for (const dy of [44, 76]) {
        ctx.beginPath()
        ctx.arc(gx + gap / 2, dy, 6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  })
}

// -- where it goes -------------------------------------------------------------------------

const TARGET_KINDS: Record<string, SurfaceKind[]> = {
  building: ['wall', 'roof', 'window', 'door', 'other'],
  walls: ['wall', 'other'],
  roof: ['roof'],
  windows: ['window'],
  doors: ['door'],
}

/** The artwork's rectangle in canvas fractions: fitted into the "Where" area, Size and Height applied. */
export function countdownBox(layer: SceneLayer, surfaces: Surface[], canvasWidth: number, canvasHeight: number): SourceRect {
  let box: SourceRect = { x: 0, y: 0, w: 1, h: 1 }
  const kinds = TARGET_KINDS[layer.target]
  const chosen = kinds ? surfaces.filter((s) => kinds.includes(s.kind)) : []
  if (chosen.length) {
    const xs = chosen.flatMap((s) => s.points.map((p) => p[0]))
    const ys = chosen.flatMap((s) => s.points.map((p) => p[1]))
    const x0 = Math.max(0, Math.min(...xs))
    const y0 = Math.max(0, Math.min(...ys))
    box = { x: x0, y: y0, w: Math.min(1, Math.max(...xs)) - x0, h: Math.min(1, Math.max(...ys)) - y0 }
  }
  const bw = box.w * canvasWidth
  const bh = box.h * canvasHeight
  const fit = Math.min(bw / DESIGN_W, bh / DESIGN_H) * (0.3 + 0.7 * layer.size)
  const w = DESIGN_W * fit
  const h = DESIGN_H * fit
  const x = box.x * canvasWidth + (bw - w) / 2
  const y = box.y * canvasHeight + (bh - h) * (1 - layer.fade)
  return { x: x / canvasWidth, y: y / canvasHeight, w: w / canvasWidth, h: h / canvasHeight }
}

/** Height in canvas heights of a countdown placed by hand at pin size 1; it is DESIGN_W/DESIGN_H wide. */
export function countdownPinHeight(layerSize: number) {
  return 0.15 + 0.5 * layerSize
}

/** One countdown on the canvas: centre in canvas fractions, half size in canvas heights, angle in radians. */
interface Placement {
  cx: number
  cy: number
  hw: number
  hh: number
  angle: number
  /** The straightened house part it sits on (a sloped roof), drawn through its perspective. */
  part?: FlatPart | null
}

function placements(layer: SceneLayer, surfaces: Surface[], canvasWidth: number, canvasHeight: number): Placement[] {
  const aspect = canvasWidth / Math.max(1, canvasHeight)
  if (layer.pins) {
    const h = countdownPinHeight(layer.size)
    return layer.pins.map((pin) => ({
      cx: pin.x,
      cy: pin.y,
      hh: (h * pin.size) / 2,
      hw: (h * pin.size * DESIGN_W) / DESIGN_H / 2,
      angle: ((pin.rotation ?? 0) * Math.PI) / 180,
    }))
  }
  const box = countdownBox(layer, surfaces, canvasWidth, canvasHeight)
  return [{ cx: box.x + box.w / 2, cy: box.y + box.h / 2, hw: (box.w * aspect) / 2, hh: box.h / 2, angle: 0 }]
}

/** The rectangle around a placement, turned, in canvas fractions. */
function bounds(p: Placement, aspect: number): SourceRect {
  if (p.part) {
    const { toFlat, toCanvas } = p.part
    const [fx, fy] = applyHomography(toFlat, p.cx * aspect, p.cy)
    const ca = Math.cos(p.angle)
    const sa = Math.sin(p.angle)
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
      const dx = u * p.hw
      const dy = v * p.hh
      const [x, y] = applyHomography(toCanvas, fx + ca * dx - sa * dy, fy + sa * dx + ca * dy)
      return [x / aspect, y]
    })
    const xs = pts.map((q) => q[0])
    const ys = pts.map((q) => q[1])
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
  }
  const c = Math.abs(Math.cos(p.angle))
  const s = Math.abs(Math.sin(p.angle))
  const hx = (p.hw * c + p.hh * s) / aspect
  const hy = p.hw * s + p.hh * c
  return { x: p.cx - hx, y: p.cy - hy, w: hx * 2, h: hy * 2 }
}

// -- drawing -------------------------------------------------------------------------------

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vC;
out vec4 outColor;
uniform sampler2D uArt;
uniform sampler2D uFx;
uniform vec2 uCenter;
uniform vec2 uHalf;
uniform float uAngle;
uniform float uAspect;
uniform float uTime;
uniform vec4 uDial;
uniform float uStrength;
uniform float uReact;
uniform int uStyle;
uniform vec3 uGlow;
// On a straightened house part: canvas (in canvas heights) → its flat space, and the centre there.
uniform int uFlatOn;
uniform mat3 uFlatFrom;
uniform vec2 uFlatCenter;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  // Into the artwork's own frame: centred, turned back, scaled to 0..1.
  vec2 off = vec2((vC.x - uCenter.x) * uAspect, vC.y - uCenter.y);
  if (uFlatOn == 1) {
    vec3 f = uFlatFrom * vec3(vC.x * uAspect, vC.y, 1.0);
    off = f.xy / f.z - uFlatCenter;
  }
  float ca = cos(uAngle);
  float sa = sin(uAngle);
  vec2 uv = vec2(ca * off.x + sa * off.y, -sa * off.x + ca * off.y) / (2.0 * uHalf) + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { outColor = vec4(0.0); return; }
  vec4 art = texture(uArt, uv);          // premultiplied
  vec3 fx = texture(uFx, uv).rgb;
  float t = uTime * mix(0.25, 2.0, uDial.y);
  float boost = mix(1.0, 1.0 + uReact, step(0.001, uReact));
  vec3 col = art.rgb;
  float a = art.a;

  // A breath of extra glow on the foil, stronger when someone is near.
  float breathe = 0.5 + 0.5 * sin(t * 1.3);
  col += uGlow * fx.r * a * (0.06 + 0.1 * breathe) * (0.4 + uReact);

  // Halloween looks flicker on the face like a candle in a pumpkin.
  if (uStyle >= 4) {
    float flick = 0.86 + 0.08 * sin(t * 7.3) + 0.05 * sin(t * 13.1 + 1.7) + 0.04 * sin(t * 23.7 + 0.4);
    col *= mix(1.0, flick, fx.r);
  }

  // A sweep of light across the foil every few seconds.
  float d = uv.x * 0.9 + uv.y * 0.5;
  float pos = fract(t * 0.16) * 2.4 - 0.5;
  float sheen = exp(-pow((d - pos) / 0.035, 2.0)) * fx.r;
  float sheen2 = exp(-pow((d - pos + 0.09) / 0.012, 2.0)) * fx.r;
  col = mix(col, vec3(1.0, 0.98, 0.9) * a, clamp((sheen * 0.7 + sheen2 * 0.5) * boost, 0.0, 1.0));

  // Glints: a random spot per cell, on the foil only, twinkling in turn.
  vec2 grid = vec2(40.0, 25.0);
  vec2 g = uv * grid;
  vec2 cell = floor(g);
  float h = hash(cell);
  float many = uDial.z * (0.35 + 0.65 * uReact);
  if (h < many * 0.55) {
    vec2 spot = vec2(hash(cell + 3.7), hash(cell + 9.1)) * 0.6 + 0.2;
    float onFoil = texture(uFx, (cell + spot) / grid).r;
    vec2 q = (g - cell - spot);
    float tw = pow(max(0.0, sin(t * (1.5 + h * 3.0) + h * 60.0)), 10.0);
    float rays = exp(-abs(q.x) * 70.0) * exp(-abs(q.y) * 7.0) + exp(-abs(q.y) * 70.0) * exp(-abs(q.x) * 7.0);
    float core = exp(-dot(q, q) * 260.0);
    float s = (rays * 0.8 + core) * tw * onFoil * boost;
    col += mix(vec3(1.0), uGlow, 0.25) * s;
    a = min(1.0, a + s);
  }

  // Marquee bulbs: chase across the number, with a few twinkling out of turn.
  if (uStyle == 3 && fx.g > 0.01) {
    float phase = fx.b / fx.g;
    float chase = smoothstep(0.1, 0.9, 0.5 + 0.5 * sin(uv.x * 34.0 - t * 5.0));
    float twinkle = step(0.93, fract(phase * 7.0 + t * 0.4));
    float on = clamp(mix(0.25, 1.0, chase) * mix(0.75, 1.0, boost - 1.0) + twinkle, 0.0, 1.0);
    vec3 bulb = mix(vec3(1.0, 0.86, 0.55), vec3(1.0, 0.97, 0.9), on) * mix(0.35, 1.25, on);
    col = mix(col, bulb, fx.g);
    a = max(a, fx.g);
  }

  float k = clamp(uStrength, 0.0, 1.0);
  outColor = vec4(max(col, vec3(0.0)) * k, clamp(a, 0.0, 1.0) * k);
}`

interface Art {
  key: string
  art: HTMLCanvasElement
  fx: HTMLCanvasElement
  clock: HTMLCanvasElement
  clockKey: string
  artTex: WebGLTexture
  fxTex: WebGLTexture
  scale: number
  seenAt: number
  /** How near people are, smoothed, 0..1. */
  near: number
}

/** 0..1: how close the nearest person is to the box, within the layer's reach. */
function nearness(box: SourceRect, people: PersonSpot[], reach: number, aspect: number): number {
  const within = 0.04 + 0.5 * reach
  let best = 0
  for (const p of people) {
    const dx = Math.max(box.x - p.x, 0, p.x - (box.x + box.w)) * aspect
    const dy = Math.max(box.y - p.y, 0, p.y - (box.y + box.h))
    const d = Math.hypot(dx, dy)
    const t = Math.min(1, d / within)
    best = Math.max(best, p.strength * (1 - t * t * (3 - 2 * t)))
  }
  return best
}

export interface CountdownDraw {
  layer: SceneLayer
  rect: SourceRect
  canvasWidth: number
  canvasHeight: number
  /** Scene buffer size, for how sharp to paint the artwork. */
  w: number
  surfaces: Surface[]
  people: PersonSpot[]
  /** Visibility: the layer's strength (and "whole layer reacts to") and crossfade. */
  strength: number
  /** Seconds since the last frame. */
  dt: number
  /** Seconds since the cue started, for the animation. */
  time: number
  /** Epoch milliseconds on the server's clock, for the count. */
  clockMs: number
  /** Detail level, 1 is full. */
  detail: number
  blend: (mode: LayerBlend) => void
}

export class CountdownDrawer {
  private program: WebGLProgram
  private uniforms = new Map<string, WebGLUniformLocation | null>()
  private arts = new Map<string, Art>()

  constructor(private gl: WebGL2RenderingContext) {
    const compile = (type: number, source: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, source)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Countdown shader: ${gl.getShaderInfoLog(s)}`)
      return s
    }
    this.program = gl.createProgram()!
    for (const shader of [compile(gl.VERTEX_SHADER, LAYER_VERTEX), compile(gl.FRAGMENT_SHADER, FRAGMENT)]) {
      gl.attachShader(this.program, shader)
      // Freed with the program.
      gl.deleteShader(shader)
    }
    gl.linkProgram(this.program)
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(`Countdown shader failed to link: ${gl.getProgramInfoLog(this.program)}`)
    }
  }

  private u(name: string) {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name))
    return this.uniforms.get(name)!
  }

  private texture(): WebGLTexture {
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }

  private upload(tex: WebGLTexture, canvas: HTMLCanvasElement, premultiply: boolean) {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  }

  draw(key: string, d: CountdownDraw) {
    const gl = this.gl
    const { layer } = d
    const aspect = d.canvasWidth / Math.max(1, d.canvasHeight)
    const places = placements(layer, d.surfaces, d.canvasWidth, d.canvasHeight)
    if (!places.length) return
    for (const p of places) p.part = flatAt(d.surfaces, p.cx, p.cy, aspect)
    let art = this.arts.get(key)
    const nearNow = Math.max(...places.map((p) => nearness(bounds(p, aspect), d.people, layer.reach ?? 0.5, aspect)))
    const near = art ? art.near + (nearNow - art.near) * (1 - Math.exp(-d.dt / 0.35)) : nearNow
    if (art) art.near = near
    const action = nearOf(layer)
    let react = 0
    if (action === 'light') react = near
    else if (action === 'grow') {
      for (const p of places) {
        p.hw *= 1 + 0.18 * near
        p.hh *= 1 + 0.18 * near
      }
      react = near * 0.5
    } else if (action === 'jump') {
      for (const p of places) p.cy -= Math.abs(Math.sin(d.time * 6)) * 0.16 * p.hh * near
      react = near * 0.5
    }
    // Only the ones on this output.
    const r = d.rect
    const shown = places.filter((p) => {
      const b = bounds(p, aspect)
      return !(b.x > r.x + r.w || b.x + b.w < r.x || b.y > r.y + r.h || b.y + b.h < r.y)
    })
    if (!shown.length) return

    const style: CountdownStyle = (COUNTDOWN_STYLES as readonly string[]).includes(layer.style)
      ? (layer.style as CountdownStyle)
      : 'gold'
    const holiday = holidayOf(style)
    const count = untilHoliday(d.clockMs, holiday)
    // Paint at about the pixels it covers, in steps so small changes do not repaint.
    const widest = Math.max(...shown.map((p) => (2 * p.hw) / aspect))
    const covers = (widest / d.rect.w) * d.w * d.detail
    const scale = Math.min(1.4, Math.max(0.25, Math.ceil((covers / DESIGN_W) * 8) / 8))
    const words = countdownWords(count, holiday)
    const fonts = countdownFontsReady()
    const colors = layer.colors ?? null
    const artKey = [style, layer.color, layer.color2, JSON.stringify(colors), words.top, words.value, words.caption, count.arrived, scale, fonts].join('|')

    if (!art) {
      art = {
        key: '', clockKey: '', scale, near,
        art: document.createElement('canvas'), fx: document.createElement('canvas'), clock: document.createElement('canvas'),
        artTex: this.texture(), fxTex: this.texture(), seenAt: 0,
      }
      this.arts.set(key, art)
    }
    art.seenAt = performance.now()
    if (art.key !== artKey) {
      paintArt(art.art, art.fx, scale, { style, ribbon: layer.color, glow: layer.color2, words, arrived: count.arrived, colors })
      this.upload(art.artTex, art.art, true)
      this.upload(art.fxTex, art.fx, false)
      art.key = artKey
      art.scale = scale
      art.clockKey = ''
    }
    const clockKey = `${count.hours}:${count.minutes}:${count.seconds}:${count.arrived}`
    if (art.clockKey !== clockKey) {
      paintClock(art.clock, art.scale, count, style, layer.color2, colors)
      const x = Math.round(CLOCK.x * art.scale)
      const y = Math.round(CLOCK.y * art.scale)
      const fits = x + art.clock.width <= art.art.width && y + art.clock.height <= art.art.height
      if (fits && art.clock.width > 0 && art.clock.height > 0) {
        gl.bindTexture(gl.TEXTURE_2D, art.artTex)
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, art.clock)
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
      }
      art.clockKey = clockKey
    }

    gl.useProgram(this.program)
    gl.uniform4f(this.u('uRect'), r.x, r.y, r.w, r.h)
    gl.uniform1f(this.u('uAspect'), aspect)
    gl.uniform1f(this.u('uTime'), d.time)
    gl.uniform4f(this.u('uDial'), layer.size, layer.speed, layer.amount, layer.fade)
    gl.uniform1f(this.u('uStrength'), Math.min(1, d.strength))
    gl.uniform1f(this.u('uReact'), Math.max(0, Math.min(1, react)))
    gl.uniform1i(this.u('uStyle'), COUNTDOWN_STYLES.indexOf(style))
    const n = parseInt(layer.color2.slice(1), 16)
    gl.uniform3f(this.u('uGlow'), ((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, art.artTex)
    gl.uniform1i(this.u('uArt'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, art.fxTex)
    gl.uniform1i(this.u('uFx'), 1)
    gl.activeTexture(gl.TEXTURE0)
    d.blend(layer.blend)
    for (const p of shown) {
      gl.uniform2f(this.u('uCenter'), p.cx, p.cy)
      gl.uniform2f(this.u('uHalf'), p.hw, p.hh)
      gl.uniform1f(this.u('uAngle'), p.angle)
      gl.uniform1i(this.u('uFlatOn'), p.part ? 1 : 0)
      if (p.part) {
        gl.uniformMatrix3fv(this.u('uFlatFrom'), false, glMat3(p.part.toFlat))
        gl.uniform2f(this.u('uFlatCenter'), ...applyHomography(p.part.toFlat, p.cx * aspect, p.cy))
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
  }

  /** Give back the artwork of countdowns not drawn for a while. */
  forget(used: Set<string>) {
    const now = performance.now()
    for (const [key, art] of this.arts) {
      if (!used.has(key) && now - art.seenAt > 5000) {
        this.gl.deleteTexture(art.artTex)
        this.gl.deleteTexture(art.fxTex)
        this.arts.delete(key)
      }
    }
  }

  dispose() {
    for (const art of this.arts.values()) {
      this.gl.deleteTexture(art.artTex)
      this.gl.deleteTexture(art.fxTex)
    }
    this.arts.clear()
    this.gl.deleteProgram(this.program)
  }
}
