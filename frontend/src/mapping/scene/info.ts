/**
 * Live info elements: boards that show something real and keep it up to
 * date, placed by hand like the countdown (one each, moved, sized and
 * turned on the preview).
 *
 * - Santa tracker: a map of the world with Santa's route, where he is now,
 *   the next stop, how many presents are delivered and when he reaches
 *   this house. Worked out from the clock (santa.ts), so it needs no
 *   internet; before Christmas Eve it counts down to his takeoff.
 * - Weather: the temperature and sky now at a town or ZIP code, through
 *   the server from Open-Meteo every ten minutes.
 * - Days until: any date of the year, with its name.
 * - Message board: a lit sign whose words scroll across in bulbs, typed in
 *   the Editor or from the phone remote.
 *
 * Like the countdown, the artwork is painted with the 2D canvas only when
 * the words change (once a minute at most; the tracker's presents counter
 * is a strip patched in once a second), and everything that moves every
 * frame happens in the shader: the sweep of light, glints, chasing bulbs,
 * Santa's glowing dot on the map, the falling snow or rain on the weather
 * and the message's scrolling bulbs.
 */

import type { PersonSpot } from '../people'
import type { LayerBlend, SceneLayer, SourceRect, Surface, SurfaceKind } from '../types'
import { nearOf } from './catalog'
import { countdownFontsReady } from './countdown'
import { santaNow, santaWords, type SantaNow } from './santa'
import { LAYER_VERTEX } from './shaders'
import { weatherFor, weatherLook } from './weather'
import { landRings } from './worldmap'

// New boards go at the end: the shader knows them by their place in this list.
export const INFO_STYLES = ['santa', 'weather', 'days', 'message'] as const
export type InfoStyle = (typeof INFO_STYLES)[number]

export function infoStyle(style: string): InfoStyle {
  return (INFO_STYLES as readonly string[]).includes(style) ? (style as InfoStyle) : 'santa'
}

/** Each board's artwork size in design units. */
export const BOARD: Record<InfoStyle, { w: number; h: number }> = {
  santa: { w: 1600, h: 1000 },
  weather: { w: 1400, h: 700 },
  days: { w: 1400, h: 900 },
  message: { w: 2400, h: 400 },
}

/** Height in canvas heights of a board placed by hand at pin size 1. */
export function infoPinHeight(style: string, layerSize: number) {
  return infoStyle(style) === 'message' ? 0.05 + 0.16 * layerSize : 0.15 + 0.5 * layerSize
}

const DISPLAY = '"Countdown Display", "Playfair Display", Georgia, serif'
const CAPS = '"Countdown Caps", "Cinzel", "Trajan Pro", Georgia, serif'
const SCRIPT = '"Countdown Script", "Great Vibes", "Brush Script MT", cursive'
const SIGN = '"Arial Black", "Arial Bold", Arial, "Helvetica Neue", sans-serif'

type Ctx = CanvasRenderingContext2D

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))))
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

function fitFont(ctx: Ctx, text: string, family: string, weight: string, size: number, maxWidth: number) {
  let s = size
  ctx.font = `${weight} ${s}px ${family}`
  while (s > 10 && ctx.measureText(text).width > maxWidth) {
    s = Math.floor(s * 0.92)
    ctx.font = `${weight} ${s}px ${family}`
  }
  return s
}

function gold(ctx: Ctx, top: number, bottom: number, color2: string) {
  const g = ctx.createLinearGradient(0, top, 0, bottom)
  g.addColorStop(0, '#fffbe8')
  g.addColorStop(0.35, shade(color2, 0.35))
  g.addColorStop(0.6, color2)
  g.addColorStop(1, shade(color2, -0.35))
  return g
}

/** The board itself: a dark rounded panel with a bright frame. fx red marks shiny parts. */
function panel(ctx: Ctx, fx: Ctx, w: number, h: number, color: string, color2: string) {
  const r = Math.min(w, h) * 0.06
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, rgba(color, 1))
  g.addColorStop(1, shade(color, -0.6).replace('rgb(', 'rgba(').replace(')', ',1)'))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(14, 14, w - 28, h - 28, r)
  ctx.fill()
  ctx.lineWidth = 9
  ctx.strokeStyle = gold(ctx, 0, h, color2)
  ctx.stroke()
  ctx.lineWidth = 2
  ctx.strokeStyle = rgba(color2, 0.6)
  ctx.beginPath()
  ctx.roundRect(34, 34, w - 68, h - 68, r * 0.7)
  ctx.stroke()
  fx.strokeStyle = '#ff0000'
  fx.lineWidth = 9
  fx.beginPath()
  fx.roundRect(14, 14, w - 28, h - 28, r)
  fx.stroke()
}

function snowflake(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.12
  ctx.lineCap = 'round'
  for (let k = 0; k < 6; k++) {
    ctx.rotate(Math.PI / 3)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, -r)
    ctx.moveTo(0, -r * 0.55)
    ctx.lineTo(r * 0.25, -r * 0.78)
    ctx.moveTo(0, -r * 0.55)
    ctx.lineTo(-r * 0.25, -r * 0.78)
    ctx.stroke()
  }
  ctx.restore()
}

// -- the Santa tracker -------------------------------------------------------------------------

/** The map's place on the board, in design units, and its view of the world. */
const MAP = { x: 70, y: 168, w: 900, h: 540, lat0: 80, lat1: -58 }

function mapXY(lon: number, lat: number): [number, number] {
  return [MAP.x + ((lon + 180) / 360) * MAP.w, MAP.y + ((MAP.lat0 - lat) / (MAP.lat0 - MAP.lat1)) * MAP.h]
}

/** Where the presents counter goes; patched in once a second. */
const COUNTER = { x: 1010, y: 520, w: 520, h: 110 }

function paintSanta(ctx: Ctx, fx: Ctx, now: SantaNow, nowMs: number, color: string, color2: string) {
  const { w, h } = BOARD.santa
  panel(ctx, fx, w, h, color, color2)
  // Title.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  fitFont(ctx, 'SANTA TRACKER', CAPS, '700', 66, 900)
  ctx.fillStyle = gold(ctx, 70, 140, color2)
  ctx.fillText('SANTA TRACKER', w / 2, 104)
  fx.font = ctx.font
  fx.textAlign = 'center'
  fx.textBaseline = 'middle'
  fx.fillStyle = '#ff0000'
  fx.fillText('SANTA TRACKER', w / 2, 104)
  snowflake(ctx, w / 2 - 520, 104, 30, '#e0f2fe')
  snowflake(ctx, w / 2 + 520, 104, 30, '#e0f2fe')

  // The map: night ocean, glowing land, a faint grid.
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(MAP.x, MAP.y, MAP.w, MAP.h, 22)
  ctx.clip()
  const sea = ctx.createLinearGradient(0, MAP.y, 0, MAP.y + MAP.h)
  sea.addColorStop(0, '#071a3a')
  sea.addColorStop(1, '#03102a')
  ctx.fillStyle = sea
  ctx.fillRect(MAP.x, MAP.y, MAP.w, MAP.h)
  ctx.strokeStyle = 'rgba(147,197,253,0.12)'
  ctx.lineWidth = 1.5
  for (let lon = -150; lon <= 150; lon += 30) {
    const [x] = mapXY(lon, 0)
    ctx.beginPath()
    ctx.moveTo(x, MAP.y)
    ctx.lineTo(x, MAP.y + MAP.h)
    ctx.stroke()
  }
  for (let lat = -40; lat <= 70; lat += 20) {
    const [, y] = mapXY(0, lat)
    ctx.beginPath()
    ctx.moveTo(MAP.x, y)
    ctx.lineTo(MAP.x + MAP.w, y)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(110,190,140,0.55)'
  ctx.strokeStyle = 'rgba(190,242,200,0.75)'
  ctx.lineWidth = 2
  for (const ring of landRings()) {
    ctx.beginPath()
    ring.forEach(([lon, lat], i) => {
      const [x, y] = mapXY(lon, lat)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  // The route: flown in gold, still to fly faint and dashed.
  const route = now.route
  const segment = (from: number, to: number, style: string, dash: number[], width: number) => {
    ctx.strokeStyle = style
    ctx.lineWidth = width
    ctx.setLineDash(dash)
    for (let i = Math.max(1, from); i <= to && i < route.length; i++) {
      const a = route[i - 1]
      const b = route[i]
      if (Math.abs(a.lon - b.lon) > 180) continue
      const [x0, y0] = mapXY(a.lon, a.lat)
      const [x1, y1] = mapXY(b.lon, b.lat)
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }
  segment(now.visited, route.length - 1, 'rgba(255,255,255,0.28)', [6, 8], 2.5)
  segment(1, now.visited - 1, color2, [], 3)
  route.forEach((s, i) => {
    const [x, y] = mapXY(s.lon, s.lat)
    ctx.fillStyle = i < now.visited ? color2 : 'rgba(255,255,255,0.55)'
    ctx.beginPath()
    ctx.arc(x, y, i < now.visited ? 5.5 : 3.5, 0, Math.PI * 2)
    ctx.fill()
  })
  // The North Pole: a little striped pole.
  const [px, py] = mapXY(20, 78)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(px - 4, py - 4, 8, 26)
  ctx.fillStyle = '#d61f2c'
  for (let k = 0; k < 3; k++) ctx.fillRect(px - 4, py + k * 9, 8, 4)
  ctx.restore()
  ctx.strokeStyle = rgba(color2, 0.8)
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(MAP.x, MAP.y, MAP.w, MAP.h, 22)
  ctx.stroke()

  // Where he is, in words.
  const words = santaWords(now, nowMs)
  const right = 1010
  const colW = 520
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#dbeafe'
  fitFont(ctx, words.headline, CAPS, '700', 34, colW)
  ctx.fillText(words.headline, right, 216)
  // The place, on up to two lines.
  ctx.fillStyle = '#ffffff'
  const place = words.place
  let size = fitFont(ctx, place, DISPLAY, '900', 66, colW)
  if (size < 46 && place.includes(',')) {
    const [first, ...rest] = place.split(',')
    size = Math.min(fitFont(ctx, first, DISPLAY, '900', 62, colW), fitFont(ctx, rest.join(',').trim(), DISPLAY, '900', 62, colW))
    ctx.font = `900 ${size}px ${DISPLAY}`
    ctx.fillText(first, right, 290)
    ctx.font = `700 ${Math.round(size * 0.62)}px ${CAPS}`
    ctx.fillStyle = '#bfdbfe'
    ctx.fillText(rest.join(',').trim(), right, 290 + size * 0.85)
  } else {
    ctx.fillText(place, right, 300)
  }
  ctx.fillStyle = '#cbd5e1'
  fitFont(ctx, words.detail, CAPS, '700', 28, colW)
  ctx.fillText(words.detail, right, 420)
  ctx.fillStyle = color2
  ctx.font = `700 28px ${CAPS}`
  ctx.fillText('PRESENTS DELIVERED', right, 500)

  // The banner across the bottom: when he reaches us.
  const by = 742
  const bh = 178
  const ribbon = ctx.createLinearGradient(0, by, 0, by + bh)
  ribbon.addColorStop(0, '#e23a3a')
  ribbon.addColorStop(1, '#8f0d16')
  ctx.fillStyle = ribbon
  ctx.beginPath()
  ctx.roundRect(70, by, w - 140, bh, 30)
  ctx.fill()
  ctx.strokeStyle = gold(ctx, by, by + bh, color2)
  ctx.lineWidth = 6
  ctx.stroke()
  ctx.setLineDash([14, 10])
  ctx.lineWidth = 2.5
  ctx.strokeStyle = 'rgba(255,240,200,0.75)'
  ctx.beginPath()
  ctx.roundRect(88, by + 18, w - 176, bh - 36, 22)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  fitFont(ctx, words.here, DISPLAY, '900', 72, w - 260)
  ctx.fillText(words.here, w / 2, by + bh / 2 + 4)
  fx.font = ctx.font
  fx.textAlign = 'center'
  fx.textBaseline = 'middle'
  fx.fillStyle = '#ff0000'
  fx.fillText(words.here, w / 2, by + bh / 2 + 4)
}

function paintCounter(canvas: HTMLCanvasElement, scale: number, presents: number, color2: string) {
  canvas.width = Math.max(1, Math.round(COUNTER.w * scale))
  canvas.height = Math.max(1, Math.round(COUNTER.h * scale))
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  // Opaque like the panel behind, so a shorter number leaves nothing behind.
  ctx.clearRect(0, 0, COUNTER.w, COUNTER.h)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const text = presents.toLocaleString('en-US')
  fitFont(ctx, text, DISPLAY, '900', 84, COUNTER.w)
  ctx.fillStyle = gold(ctx, 10, COUNTER.h - 10, color2)
  ctx.fillText(text, 0, COUNTER.h / 2 + 4)
}

// -- weather -----------------------------------------------------------------------------------

function weatherIcon(ctx: Ctx, fx: Ctx, icon: string, x: number, y: number, r: number, night: boolean) {
  const sun = () => {
    if (night) {
      ctx.fillStyle = '#fef3c7'
      ctx.beginPath()
      ctx.arc(x - r * 0.15, y - r * 0.2, r * 0.55, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#0b1d3a'
      ctx.beginPath()
      ctx.arc(x + r * 0.12, y - r * 0.38, r * 0.48, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    const g = ctx.createRadialGradient(x, y - r * 0.2, 0, x, y - r * 0.2, r)
    g.addColorStop(0, '#fff7c2')
    g.addColorStop(0.45, '#fbbf24')
    g.addColorStop(1, 'rgba(251,191,36,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y - r * 0.2, r, 0, Math.PI * 2)
    ctx.fill()
    fx.fillStyle = '#0000ff'
    fx.beginPath()
    fx.arc(x, y - r * 0.2, r, 0, Math.PI * 2)
    fx.fill()
  }
  const cloud = (cx: number, cy: number, s: number, tone: string) => {
    ctx.fillStyle = tone
    ctx.beginPath()
    ctx.arc(cx - s * 0.45, cy, s * 0.38, 0, Math.PI * 2)
    ctx.arc(cx, cy - s * 0.2, s * 0.5, 0, Math.PI * 2)
    ctx.arc(cx + s * 0.5, cy + s * 0.02, s * 0.36, 0, Math.PI * 2)
    ctx.roundRect(cx - s * 0.82, cy, s * 1.68, s * 0.38, s * 0.19)
    ctx.fill()
  }
  if (icon === 'sun') sun()
  else if (icon === 'part') {
    sun()
    cloud(x + r * 0.25, y + r * 0.15, r * 0.75, '#e2e8f0')
  } else cloud(x, y - r * 0.1, r * 0.95, icon === 'storm' ? '#64748b' : '#cbd5e1')
  if (icon === 'fog') {
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = r * 0.09
    ctx.lineCap = 'round'
    for (let k = 0; k < 3; k++) {
      ctx.beginPath()
      ctx.moveTo(x - r * 0.8, y + r * (0.45 + k * 0.2))
      ctx.lineTo(x + r * 0.8, y + r * (0.45 + k * 0.2))
      ctx.stroke()
    }
  }
  if (icon === 'storm') {
    ctx.fillStyle = '#facc15'
    ctx.beginPath()
    ctx.moveTo(x, y + r * 0.2)
    ctx.lineTo(x - r * 0.25, y + r * 0.7)
    ctx.lineTo(x, y + r * 0.62)
    ctx.lineTo(x - r * 0.12, y + r * 1.05)
    ctx.lineTo(x + r * 0.28, y + r * 0.45)
    ctx.lineTo(x + r * 0.04, y + r * 0.52)
    ctx.closePath()
    ctx.fill()
  }
  if (icon === 'rain' || icon === 'snow' || icon === 'storm') {
    // Where the shader lets rain or snow fall, under the cloud.
    fx.fillStyle = '#00ff00'
    fx.fillRect(x - r * 0.8, y + r * 0.3, r * 1.6, r * 0.9)
  }
}

interface WeatherView {
  place: string
  temperature: string
  celsius: string
  words: string
  extra: string
  icon: string
  night: boolean
  note: string
}

function weatherView(layer: SceneLayer): WeatherView {
  const { data, error } = weatherFor(layer.text ?? '')
  if (!data) {
    return {
      place: (layer.text || 'Weather').toUpperCase(), temperature: '', celsius: '', words: '', extra: '', icon: 'cloud', night: true,
      note: error ? (error.toLowerCase().includes('find') ? 'Check the town in this element' : 'Weather unavailable right now') : 'Getting the weather…',
    }
  }
  const look = weatherLook(data.code)
  const f = Math.round(data.temperature_f)
  const c = Math.round(((data.temperature_f - 32) * 5) / 9)
  const bits = [
    data.feels_like_f != null ? `Feels like ${Math.round(data.feels_like_f)}°` : '',
    data.high_f != null && data.low_f != null ? `High ${Math.round(data.high_f)}° · Low ${Math.round(data.low_f)}°` : '',
  ].filter(Boolean)
  return {
    place: data.place.toUpperCase(),
    temperature: `${f}°`,
    celsius: `${c} °C`,
    words: look.words,
    extra: bits.join('  ·  '),
    icon: look.icon,
    night: !data.is_day,
    note: '',
  }
}

function paintWeather(ctx: Ctx, fx: Ctx, v: WeatherView, color: string, color2: string) {
  const { w, h } = BOARD.weather
  panel(ctx, fx, w, h, color, color2)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillStyle = gold(ctx, 60, 120, color2)
  fitFont(ctx, v.place, CAPS, '700', 50, w - 160)
  ctx.fillText(v.place, w / 2, 96)
  fx.font = ctx.font
  fx.textAlign = 'center'
  fx.textBaseline = 'middle'
  fx.fillStyle = '#ff0000'
  fx.fillText(v.place, w / 2, 96)
  if (v.note) {
    weatherIcon(ctx, fx, 'cloud', 300, 390, 150, true)
    ctx.fillStyle = '#e2e8f0'
    ctx.textAlign = 'left'
    fitFont(ctx, v.note, CAPS, '700', 46, 760)
    ctx.fillText(v.note, 520, 390)
    return
  }
  weatherIcon(ctx, fx, v.icon, 290, 380, 165, v.night)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ffffff'
  fitFont(ctx, v.temperature, DISPLAY, '900', 250, 460)
  ctx.fillText(v.temperature, 520, 430)
  const tw = ctx.measureText(v.temperature).width
  ctx.fillStyle = '#cbd5e1'
  ctx.font = `700 54px ${CAPS}`
  ctx.fillText('F', 520 + tw + 8, 330)
  ctx.font = `700 40px ${CAPS}`
  ctx.fillText(v.celsius, 520 + tw + 8, 420)
  ctx.fillStyle = gold(ctx, 470, 540, color2)
  fitFont(ctx, v.words, CAPS, '700', 60, w - 600)
  ctx.fillText(v.words, 520, 528)
  ctx.fillStyle = '#e2e8f0'
  fitFont(ctx, v.extra, CAPS, '700', 32, w - 600)
  ctx.fillText(v.extra, 520, 600)
}

// -- days until --------------------------------------------------------------------------------

/** Whole days from today until the date's next return (0 on the day), by this computer's calendar. */
export function daysUntil(date: string | null | undefined, nowMs: number): { days: number; when: Date } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '')
  if (!m) return null
  const month = Number(m[2]) - 1
  const day = Number(m[3])
  const now = new Date(nowMs)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  let year = now.getFullYear()
  let target = Date.UTC(year, month, day)
  if (target < today) {
    year += 1
    target = Date.UTC(year, month, day)
  }
  return { days: Math.round((target - today) / 86_400_000), when: new Date(year, month, day) }
}

function paintDays(ctx: Ctx, fx: Ctx, layer: SceneLayer, nowMs: number) {
  const { w, h } = BOARD.days
  panel(ctx, fx, w, h, layer.color, layer.color2)
  const name = (layer.text ?? '').trim() || 'the big day'
  const left = daysUntil(layer.date, nowMs)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  fx.textAlign = 'center'
  fx.textBaseline = 'middle'
  fx.fillStyle = '#ff0000'
  if (!left) {
    ctx.fillStyle = '#e2e8f0'
    fitFont(ctx, 'Pick a date for this element', CAPS, '700', 54, w - 200)
    ctx.fillText('Pick a date for this element', w / 2, h / 2)
    return
  }
  const today = left.days === 0
  ctx.fillStyle = '#dbeafe'
  fitFont(ctx, today ? 'TODAY IS' : left.days === 1 ? 'ONLY ONE DAY UNTIL' : 'DAYS UNTIL', CAPS, '700', 54, w - 200)
  ctx.fillText(today ? 'TODAY IS' : left.days === 1 ? 'ONLY ONE DAY UNTIL' : 'DAYS UNTIL', w / 2, today ? 170 : 520)
  if (!today) {
    const number = String(left.days)
    fitFont(ctx, number, DISPLAY, '900', 380, w - 300)
    ctx.fillStyle = gold(ctx, 120, 470, layer.color2)
    ctx.fillText(number, w / 2, 300)
    fx.font = ctx.font
    fx.fillText(number, w / 2, 300)
  }
  ctx.fillStyle = '#ffffff'
  fitFont(ctx, name, SCRIPT, '400', today ? 170 : 120, w - 180)
  ctx.fillText(name, w / 2, today ? 420 : 640)
  ctx.fillStyle = '#cbd5e1'
  const when = left.when.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  fitFont(ctx, when, CAPS, '700', 36, w - 300)
  ctx.fillText(when, w / 2, today ? 640 : 770)
}

// -- message board -----------------------------------------------------------------------------

/** The lit area of the message board, in design units. */
const SIGN_AREA = { x: 90, y: 78, w: 2220, h: 244 }
/** Rows of bulbs the words are made of. */
const DOT_ROWS = 15
/** Widest texture strip; longer messages wrap onto more strips. */
const STRIP_W = 4096
const ROW_PX = 8

function paintMessageBoard(ctx: Ctx, fx: Ctx, color2: string) {
  const { w, h } = BOARD.message
  const r = h * 0.16
  ctx.fillStyle = '#05070c'
  ctx.beginPath()
  ctx.roundRect(10, 10, w - 20, h - 20, r)
  ctx.fill()
  ctx.lineWidth = 10
  ctx.strokeStyle = gold(ctx, 0, h, color2)
  ctx.stroke()
  // Bulbs all round the frame; fx green is a bulb, blue its place in the chase.
  const bulbs: Array<[number, number]> = []
  const step = 52
  for (let x = 46; x <= w - 46; x += step) bulbs.push([x, 40], [x, h - 40])
  for (let y = 40 + step; y <= h - 40 - step / 2; y += step) bulbs.push([40, y], [w - 40, y])
  bulbs.forEach(([x, y]) => {
    ctx.fillStyle = shade(color2, -0.55)
    ctx.beginPath()
    ctx.arc(x, y, 11, 0, Math.PI * 2)
    ctx.fill()
    const phase = Math.round((x / w) * 255)
    fx.fillStyle = `rgb(0,255,${phase})`
    fx.beginPath()
    fx.arc(x, y, 11, 0, Math.PI * 2)
    fx.fill()
  })
}

/** The words, white on clear, in strips at most STRIP_W wide; the shader turns them into bulbs. */
function paintMessageStrip(canvas: HTMLCanvasElement, text: string): { width: number; strips: number } {
  const rowH = DOT_ROWS * ROW_PX
  const ctx = canvas.getContext('2d')!
  ctx.font = `900 ${Math.round(rowH * 0.8)}px ${SIGN}`
  const words = text.trim() || ' '
  const width = Math.max(8, Math.ceil(ctx.measureText(words).width) + 8)
  const strips = Math.min(8, Math.ceil(width / STRIP_W))
  canvas.width = Math.min(STRIP_W, width)
  canvas.height = rowH * strips
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = `900 ${Math.round(rowH * 0.8)}px ${SIGN}`
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  for (let k = 0; k < strips; k++) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, k * rowH, canvas.width, rowH)
    ctx.clip()
    ctx.fillText(words, 4 - k * STRIP_W, k * rowH + rowH * 0.54)
    ctx.restore()
  }
  return { width, strips }
}

// -- placing --------------------------------------------------------------------------------------

const TARGET_KINDS: Record<string, SurfaceKind[]> = {
  building: ['wall', 'roof', 'window', 'door', 'other'],
  walls: ['wall', 'other'],
  roof: ['roof'],
  windows: ['window'],
  doors: ['door'],
}

interface Placement {
  cx: number
  cy: number
  hw: number
  hh: number
  angle: number
}

function placements(layer: SceneLayer, surfaces: Surface[], canvasWidth: number, canvasHeight: number): Placement[] {
  const aspect = canvasWidth / Math.max(1, canvasHeight)
  const board = BOARD[infoStyle(layer.style)]
  const ratio = board.w / board.h
  if (layer.pins) {
    const h = infoPinHeight(layer.style, layer.size)
    return layer.pins.map((pin) => ({
      cx: pin.x, cy: pin.y, hh: (h * pin.size) / 2, hw: (h * pin.size * ratio) / 2,
      angle: ((pin.rotation ?? 0) * Math.PI) / 180,
    }))
  }
  // Centred on the layer's area, as big as Size says.
  let box: SourceRect = { x: 0, y: 0, w: 1, h: 1 }
  const kinds = TARGET_KINDS[layer.target]
  const chosen = kinds ? surfaces.filter((s) => kinds.includes(s.kind)) : []
  if (chosen.length) {
    const xs = chosen.flatMap((s) => s.points.map((p) => p[0]))
    const ys = chosen.flatMap((s) => s.points.map((p) => p[1]))
    box = { x: Math.max(0, Math.min(...xs)), y: Math.max(0, Math.min(...ys)), w: 0, h: 0 }
    box.w = Math.min(1, Math.max(...xs)) - box.x
    box.h = Math.min(1, Math.max(...ys)) - box.y
  }
  const bw = box.w * aspect
  const fit = Math.min(bw / ratio, box.h) * (0.3 + 0.7 * layer.size)
  return [{ cx: box.x + box.w / 2, cy: box.y + box.h / 2, hh: fit / 2, hw: (fit * ratio) / 2, angle: 0 }]
}

function bounds(p: Placement, aspect: number): SourceRect {
  const c = Math.abs(Math.cos(p.angle))
  const s = Math.abs(Math.sin(p.angle))
  const hx = (p.hw * c + p.hh * s) / aspect
  const hy = p.hw * s + p.hh * c
  return { x: p.cx - hx, y: p.cy - hy, w: hx * 2, h: hy * 2 }
}

function nearness(box: SourceRect, people: PersonSpot[], reach: number, aspect: number): number {
  const within = 0.04 + 0.5 * reach
  let best = 0
  for (const p of people) {
    const dx = Math.max(box.x - p.x, 0, p.x - (box.x + box.w)) * aspect
    const dy = Math.max(box.y - p.y, 0, p.y - (box.y + box.h))
    const t = Math.min(1, Math.hypot(dx, dy) / within)
    best = Math.max(best, p.strength * (1 - t * t * (3 - 2 * t)))
  }
  return best
}

// -- drawing --------------------------------------------------------------------------------------

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vC;
out vec4 outColor;
uniform sampler2D uArt;
uniform sampler2D uFx;
uniform sampler2D uText;
uniform vec2 uCenter;
uniform vec2 uHalf;
uniform float uAngle;
uniform float uAspect;
uniform float uTime;
uniform vec4 uDial;
uniform float uStrength;
uniform float uReact;
uniform int uKind;
uniform vec3 uColor;
uniform vec3 uGlow;
uniform vec3 uMarker;
uniform int uPrecip;
uniform vec4 uSignArea;
uniform vec2 uBoard;
uniform float uTextW;
uniform float uScroll;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 off = vec2((vC.x - uCenter.x) * uAspect, vC.y - uCenter.y);
  float ca = cos(uAngle);
  float sa = sin(uAngle);
  vec2 uv = vec2(ca * off.x + sa * off.y, -sa * off.x + ca * off.y) / (2.0 * uHalf) + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { outColor = vec4(0.0); return; }
  vec4 art = texture(uArt, uv);
  vec3 fx = texture(uFx, uv).rgb;
  float t = uTime * mix(0.25, 2.0, uDial.y);
  float boost = 1.0 + uReact;
  vec3 col = art.rgb;
  float a = art.a;

  // A sweep of light across the shiny parts every few seconds.
  float d = uv.x * 0.9 + uv.y * 0.5;
  float pos = fract(t * 0.14) * 2.4 - 0.5;
  float sheen = exp(-pow((d - pos) / 0.035, 2.0)) * fx.r;
  col = mix(col, vec3(1.0, 0.98, 0.9) * a, clamp(sheen * 0.6 * boost, 0.0, 1.0));
  col += uGlow * fx.r * a * (0.05 + 0.08 * sin(t * 1.3)) * (0.4 + uReact);

  // Glints on the shiny parts.
  vec2 grid = vec2(48.0, 30.0);
  vec2 g = uv * grid;
  vec2 cell = floor(g);
  float h = hash(cell);
  if (h < uDial.z * (0.3 + 0.7 * uReact) * 0.5) {
    vec2 spot = vec2(hash(cell + 3.7), hash(cell + 9.1)) * 0.6 + 0.2;
    float onFoil = texture(uFx, (cell + spot) / grid).r;
    vec2 q = g - cell - spot;
    float tw = pow(max(0.0, sin(t * (1.5 + h * 3.0) + h * 60.0)), 10.0);
    float rays = exp(-abs(q.x) * 70.0) * exp(-abs(q.y) * 7.0) + exp(-abs(q.y) * 70.0) * exp(-abs(q.x) * 7.0);
    float s = (rays * 0.8 + exp(-dot(q, q) * 260.0)) * tw * onFoil * boost;
    col += mix(vec3(1.0), uGlow, 0.25) * s;
    a = min(1.0, a + s);
  }

  // Santa's spot on the map: a glowing dot with a ring spreading from it.
  if (uKind == 0 && uMarker.z > 0.5) {
    vec2 m = (uv - uMarker.xy) * uBoard / uBoard.y;
    float r = length(m);
    float ring = fract(uTime * 0.6);
    float wave = exp(-pow((r - ring * 0.07) / 0.004, 2.0)) * (1.0 - ring);
    float dot = exp(-r * r / 0.00006);
    float halo = exp(-r * r / 0.0006) * 0.6;
    vec3 c = vec3(1.0, 0.25, 0.2);
    col += (c * (dot * 2.0 + halo) + vec3(1.0, 0.85, 0.6) * wave) * (0.8 + 0.4 * sin(uTime * 5.0));
    a = min(1.0, a + dot + halo * 0.6 + wave * 0.6);
  }

  // Rain or snow falling under the weather's cloud.
  if (uKind == 1 && uPrecip > 0 && fx.g > 0.5) {
    vec2 p = uv * uBoard / uBoard.y;
    float fall = uPrecip == 2 ? 0.12 : 0.9;
    vec2 q = vec2(p.x * 22.0, p.y * 9.0 - uTime * fall * 9.0);
    vec2 c = floor(q);
    float hh = hash(c);
    vec2 f = fract(q) - vec2(0.5 + (hash(c + 1.3) - 0.5) * 0.6, 0.5);
    float drop = uPrecip == 2
      ? exp(-dot(f * vec2(1.0, 2.4), f * vec2(1.0, 2.4)) * 40.0)
      : exp(-f.x * f.x * 900.0) * smoothstep(0.35, 0.0, abs(f.y));
    drop *= step(0.35, hh);
    vec3 dc = uPrecip == 2 ? vec3(1.0) : vec3(0.6, 0.8, 1.0);
    col += dc * drop;
    a = min(1.0, a + drop);
  }

  // The message board: chasing bulbs round the frame, and the words in bulbs.
  if (uKind == 3) {
    if (fx.g > 0.05) {
      float phase = fx.b;
      float on = smoothstep(0.2, 0.9, 0.5 + 0.5 * sin(phase * 60.0 - t * 6.0));
      vec3 bulb = mix(uGlow * 0.35, mix(uGlow, vec3(1.0), 0.35) * 1.3, max(on, uReact)) ;
      col = mix(col, bulb, fx.g);
      a = max(a, fx.g);
    }
    vec2 s = (uv - uSignArea.xy) / uSignArea.zw;
    if (s.x >= 0.0 && s.x <= 1.0 && s.y >= 0.0 && s.y <= 1.0) {
      float rows = ${DOT_ROWS}.0;
      float areaW = uSignArea.z * uBoard.x;
      float areaH = uSignArea.w * uBoard.y;
      float pitch = areaH / rows;
      vec2 px = s * vec2(areaW, areaH);
      vec2 cellI = floor(px / pitch);
      vec2 centre = (cellI + 0.5) * pitch;
      // Strip pixels per design unit, then which pixel of the words this bulb shows.
      float k = ${ROW_PX}.0 / pitch;
      float x = centre.x * k - uScroll;
      float lit = 0.0;
      if (x >= 0.0 && x < uTextW) {
        float strip = floor(x / ${STRIP_W}.0);
        float lx = x - strip * ${STRIP_W}.0;
        float ly = (strip * rows + cellI.y + 0.5) * ${ROW_PX}.0;
        vec2 tsz = vec2(textureSize(uText, 0));
        lit = step(0.45, texture(uText, vec2(lx, ly) / tsz).a);
      }
      vec2 q = (px - centre) / pitch;
      float dotShape = 1.0 - smoothstep(0.3, 0.42, length(q));
      vec3 on = uColor * (1.15 + 0.35 * uReact) + vec3(0.25) * exp(-dot(q, q) * 30.0);
      vec3 offc = uColor * 0.07;
      vec3 c = mix(offc, on, lit);
      col = mix(col, c, dotShape);
      a = max(a, dotShape * mix(0.85, 1.0, lit));
    }
  }

  float kk = clamp(uStrength, 0.0, 1.0);
  outColor = vec4(max(col, vec3(0.0)) * kk, clamp(a, 0.0, 1.0) * kk);
}`

interface Board {
  key: string
  art: HTMLCanvasElement
  fx: HTMLCanvasElement
  extra: HTMLCanvasElement
  extraKey: string
  artTex: WebGLTexture
  fxTex: WebGLTexture
  textTex: WebGLTexture
  textW: number
  strips: number
  scale: number
  seenAt: number
  near: number
}

export interface InfoDraw {
  layer: SceneLayer
  rect: SourceRect
  canvasWidth: number
  canvasHeight: number
  w: number
  surfaces: Surface[]
  people: PersonSpot[]
  strength: number
  dt: number
  time: number
  clockMs: number
  detail: number
  blend: (mode: LayerBlend) => void
}

/** Seconds the message takes to scroll its own length, from the Speed dial: design units a second. */
function scrollSpeed(speed: number) {
  return 120 + 900 * speed
}

export class InfoDrawer {
  private program: WebGLProgram
  private uniforms = new Map<string, WebGLUniformLocation | null>()
  private boards = new Map<string, Board>()

  constructor(private gl: WebGL2RenderingContext) {
    const compile = (type: number, source: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, source)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Info shader: ${gl.getShaderInfoLog(s)}`)
      return s
    }
    this.program = gl.createProgram()!
    for (const shader of [compile(gl.VERTEX_SHADER, LAYER_VERTEX), compile(gl.FRAGMENT_SHADER, FRAGMENT)]) {
      gl.attachShader(this.program, shader)
      gl.deleteShader(shader)
    }
    gl.linkProgram(this.program)
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(`Info shader failed to link: ${gl.getProgramInfoLog(this.program)}`)
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

  draw(key: string, d: InfoDraw) {
    const gl = this.gl
    const { layer } = d
    const style = infoStyle(layer.style)
    const board = BOARD[style]
    const aspect = d.canvasWidth / Math.max(1, d.canvasHeight)
    const places = placements(layer, d.surfaces, d.canvasWidth, d.canvasHeight)
    if (!places.length) return
    let b = this.boards.get(key)
    const nearNow = Math.max(...places.map((p) => nearness(bounds(p, aspect), d.people, layer.reach ?? 0.5, aspect)))
    const near = b ? b.near + (nearNow - b.near) * (1 - Math.exp(-d.dt / 0.35)) : nearNow
    const action = nearOf(layer)
    let react = 0
    if (action === 'light') react = near
    else if (action === 'grow') {
      for (const p of places) {
        p.hw *= 1 + 0.15 * near
        p.hh *= 1 + 0.15 * near
      }
      react = near * 0.5
    } else if (action === 'jump') {
      for (const p of places) p.cy -= Math.abs(Math.sin(d.time * 6)) * 0.14 * p.hh * near
      react = near * 0.5
    }
    const r = d.rect
    const shown = places.filter((p) => {
      const bb = bounds(p, aspect)
      return !(bb.x > r.x + r.w || bb.x + bb.w < r.x || bb.y > r.y + r.h || bb.y + bb.h < r.y)
    })
    if (!b) {
      b = {
        key: '', extraKey: '', scale: 1, near, seenAt: 0, textW: 0, strips: 1,
        art: document.createElement('canvas'), fx: document.createElement('canvas'), extra: document.createElement('canvas'),
        artTex: this.texture(), fxTex: this.texture(), textTex: this.texture(),
      }
      this.boards.set(key, b)
    }
    b.near = near
    b.seenAt = performance.now()
    if (!shown.length) return

    // Paint at about the pixels it covers, in steps so small changes do not repaint.
    const widest = Math.max(...shown.map((p) => (2 * p.hw) / aspect))
    const covers = (widest / r.w) * d.w * d.detail
    const scale = Math.min(1.25, Math.max(0.25, Math.ceil((covers / board.w) * 8) / 8))
    const fonts = countdownFontsReady()
    const santa = style === 'santa' ? santaNow(d.clockMs) : null
    let words = ''
    let precip = 0
    if (santa) {
      const w = santaWords(santa, d.clockMs)
      words = [santa.phase, santa.visited, santa.delivering, w.headline, w.place, w.detail, w.here].join('|')
    } else if (style === 'weather') {
      const v = weatherView(layer)
      words = JSON.stringify(v)
      precip = v.icon === 'snow' ? 2 : v.icon === 'rain' || v.icon === 'storm' ? 1 : 0
    } else if (style === 'days') {
      const left = daysUntil(layer.date, d.clockMs)
      words = [layer.text, layer.date, left?.days].join('|')
    }
    const artKey = [style, layer.color, layer.color2, words, scale, fonts].join('|')
    if (b.key !== artKey) {
      for (const c of [b.art, b.fx]) {
        c.width = Math.max(1, Math.round(board.w * scale))
        c.height = Math.max(1, Math.round(board.h * scale))
      }
      const ctx = b.art.getContext('2d')!
      const fx = b.fx.getContext('2d')!
      for (const c of [ctx, fx]) {
        c.setTransform(scale, 0, 0, scale, 0, 0)
        c.clearRect(0, 0, board.w, board.h)
      }
      fx.fillStyle = '#000000'
      fx.fillRect(0, 0, board.w, board.h)
      if (santa) paintSanta(ctx, fx, santa, d.clockMs, layer.color, layer.color2)
      else if (style === 'weather') paintWeather(ctx, fx, weatherView(layer), layer.color, layer.color2)
      else if (style === 'days') paintDays(ctx, fx, layer, d.clockMs)
      else paintMessageBoard(ctx, fx, layer.color2)
      this.upload(b.artTex, b.art, true)
      this.upload(b.fxTex, b.fx, false)
      b.key = artKey
      b.scale = scale
      b.extraKey = ''
    }
    if (santa) {
      const extraKey = `${santa.presents}|${b.scale}`
      if (b.extraKey !== extraKey) {
        paintCounter(b.extra, b.scale, santa.presents, layer.color2)
        const x = Math.round(COUNTER.x * b.scale)
        const y = Math.round(COUNTER.y * b.scale)
        if (x + b.extra.width <= b.art.width && y + b.extra.height <= b.art.height) {
          // The counter sits on the panel: paint the panel's own pixels under it first.
          const ctx = b.extra.getContext('2d')!
          ctx.globalCompositeOperation = 'destination-over'
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.drawImage(b.art, x, y, b.extra.width, b.extra.height, 0, 0, b.extra.width, b.extra.height)
          ctx.globalCompositeOperation = 'source-over'
          gl.bindTexture(gl.TEXTURE_2D, b.artTex)
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
          gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, b.extra)
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
        }
        b.extraKey = extraKey
      }
    }
    if (style === 'message') {
      const text = (layer.text ?? '').trim() || 'Merry Christmas!'
      if (b.extraKey !== text) {
        const { width, strips } = paintMessageStrip(b.extra, text)
        gl.bindTexture(gl.TEXTURE_2D, b.textTex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, b.extra)
        b.textW = width
        b.strips = strips
        b.extraKey = text
      }
    }

    gl.useProgram(this.program)
    gl.uniform4f(this.u('uRect'), r.x, r.y, r.w, r.h)
    gl.uniform1f(this.u('uAspect'), aspect)
    gl.uniform1f(this.u('uTime'), d.time)
    gl.uniform4f(this.u('uDial'), layer.size, layer.speed, layer.amount, layer.fade)
    gl.uniform1f(this.u('uStrength'), Math.min(1, d.strength))
    gl.uniform1f(this.u('uReact'), Math.max(0, Math.min(1, react)))
    gl.uniform1i(this.u('uKind'), INFO_STYLES.indexOf(style))
    const rgb = (hex: string) => {
      const n = parseInt(hex.slice(1), 16)
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as const
    }
    gl.uniform3f(this.u('uColor'), ...rgb(layer.color))
    gl.uniform3f(this.u('uGlow'), ...rgb(layer.color2))
    gl.uniform2f(this.u('uBoard'), board.w, board.h)
    if (santa) {
      const mx = (MAP.x + ((santa.lon + 180) / 360) * MAP.w) / board.w
      const my = (MAP.y + ((MAP.lat0 - Math.min(MAP.lat0, santa.lat)) / (MAP.lat0 - MAP.lat1)) * MAP.h) / board.h
      gl.uniform3f(this.u('uMarker'), mx, my, 1)
    } else gl.uniform3f(this.u('uMarker'), 0, 0, 0)
    gl.uniform1i(this.u('uPrecip'), precip)
    if (style === 'message') {
      gl.uniform4f(this.u('uSignArea'), SIGN_AREA.x / board.w, SIGN_AREA.y / board.h, SIGN_AREA.w / board.w, SIGN_AREA.h / board.h)
      // Strip pixels per design unit of the sign; scroll right to left, or sit centred when it fits.
      const pitch = SIGN_AREA.h / DOT_ROWS
      const k = ROW_PX / pitch
      const areaPx = SIGN_AREA.w * k
      let scroll: number
      if (b.textW <= areaPx) scroll = (areaPx - b.textW) / 2
      else {
        const travel = b.textW + areaPx
        scroll = areaPx - ((d.time * scrollSpeed(layer.speed) * k) % travel)
      }
      gl.uniform1f(this.u('uTextW'), b.textW)
      gl.uniform1f(this.u('uScroll'), scroll)
    }
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, b.artTex)
    gl.uniform1i(this.u('uArt'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, b.fxTex)
    gl.uniform1i(this.u('uFx'), 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, b.textTex)
    gl.uniform1i(this.u('uText'), 2)
    gl.activeTexture(gl.TEXTURE0)
    d.blend(layer.blend)
    for (const p of shown) {
      gl.uniform2f(this.u('uCenter'), p.cx, p.cy)
      gl.uniform2f(this.u('uHalf'), p.hw, p.hh)
      gl.uniform1f(this.u('uAngle'), p.angle)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
  }

  forget(used: Set<string>) {
    const now = performance.now()
    for (const [key, b] of this.boards) {
      if (!used.has(key) && now - b.seenAt > 5000) {
        for (const tex of [b.artTex, b.fxTex, b.textTex]) this.gl.deleteTexture(tex)
        this.boards.delete(key)
      }
    }
  }

  dispose() {
    for (const b of this.boards.values()) for (const tex of [b.artTex, b.fxTex, b.textTex]) this.gl.deleteTexture(tex)
    this.boards.clear()
    this.gl.deleteProgram(this.program)
  }
}
