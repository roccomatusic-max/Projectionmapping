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
 * - Clock: the time and date now, its colon blinking.
 * - Moon: tonight's moon as it really is (worked out from the date), how
 *   much is lit and when it is next full.
 * - Next holiday: days until the next one (every US holiday from New
 *   Year's to Kwanzaa, with Diwali and Hanukkah), the one after, and the
 *   greeting on the day.
 * - New Year's: days until New Year, then on New Year's Eve the hours,
 *   minutes and seconds to midnight (repainted once a second that day).
 * - Hanukkah menorah: tonight's candles lit (worked out from the Hebrew
 *   calendar), or the days until the first night.
 * - Advent calendar: a door opens each day of December up to Christmas.
 * - Lunar New Year: days to go and the year's animal, then the festival.
 * - Tonight's show: when tonight's show starts and ends, or the next one,
 *   from the server's plan for tonight (the Dashboard and the Calendar).
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
import { diwali, easter, hanukkahEve, hanukkahStart, lastWeekday, LUNAR_NEW_YEAR, nthWeekday, ZODIAC } from './holidays'
import { santaNow, santaWords, type SantaNow } from './santa'
import { tonightNow } from './showtimes'
import { LAYER_VERTEX } from './shaders'
import { weatherFor, weatherLook } from './weather'
import { landRings } from './worldmap'

// New boards go at the end: the shader knows them by their place in this list.
export const INFO_STYLES = [
  'santa', 'weather', 'days', 'message', 'clock', 'moon', 'holiday', 'new-year', 'menorah', 'advent', 'lunar-new-year', 'showtimes',
] as const
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
  clock: { w: 1400, h: 560 },
  moon: { w: 1400, h: 800 },
  holiday: { w: 1400, h: 860 },
  'new-year': { w: 1400, h: 860 },
  menorah: { w: 1400, h: 920 },
  advent: { w: 1400, h: 980 },
  'lunar-new-year': { w: 1400, h: 860 },
  showtimes: { w: 1400, h: 660 },
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

// -- clock ---------------------------------------------------------------------------------------

/** The time now, in this computer's own way of writing it (7:42 PM), and the date. */
export function clockWords(nowMs: number) {
  const now = new Date(nowMs)
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const [hm, ampm = ''] = time.split(' ')
  return { hm, ampm, date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }
}

function paintClock(ctx: Ctx, fx: Ctx, nowMs: number, color: string, color2: string) {
  const { w, h } = BOARD.clock
  panel(ctx, fx, w, h, color, color2)
  const { hm, ampm, date } = clockWords(nowMs)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#dbeafe'
  fitFont(ctx, date.toUpperCase(), CAPS, '700', 46, w - 200)
  ctx.fillText(date.toUpperCase(), w / 2, 104)
  // The hours and minutes, with the colon marked (fx green) so the shader can blink it.
  const size = fitFont(ctx, `${hm} ${ampm}`, DISPLAY, '900', 300, w - 220)
  ctx.font = `900 ${size}px ${DISPLAY}`
  const [hh, mm] = hm.split(':')
  const small = Math.round(size * 0.36)
  const wh = ctx.measureText(hh).width
  const wc = ctx.measureText(':').width
  const wm = ctx.measureText(mm).width
  ctx.font = `700 ${small}px ${CAPS}`
  const wa = ampm ? ctx.measureText(ampm).width + small * 0.3 : 0
  let x = (w - (wh + wc + wm + wa)) / 2
  const y = 350
  ctx.font = `900 ${size}px ${DISPLAY}`
  fx.font = ctx.font
  ctx.textAlign = 'left'
  fx.textAlign = 'left'
  fx.textBaseline = 'middle'
  ctx.fillStyle = gold(ctx, y - size / 2, y + size / 2, color2)
  ctx.fillText(hh, x, y)
  fx.fillStyle = '#ff0000'
  fx.fillText(hh, x, y)
  x += wh
  ctx.fillText(':', x, y - size * 0.04)
  fx.fillStyle = '#00ff00'
  fx.fillText(':', x, y - size * 0.04)
  x += wc
  ctx.fillText(mm, x, y)
  fx.fillStyle = '#ff0000'
  fx.fillText(mm, x, y)
  x += wm + small * 0.3
  if (ampm) {
    ctx.font = `700 ${small}px ${CAPS}`
    ctx.fillStyle = '#e2e8f0'
    ctx.fillText(ampm, x, y + size * 0.18)
  }
}

// -- moon ----------------------------------------------------------------------------------------

/** Days in one round of the moon's phases. */
const SYNODIC = 29.530588853
/** A new moon to count from: 6 January 2000, 18:14 UTC. */
const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14)

const MOON_NAMES: Array<[number, string]> = [
  [1.85, 'New moon'], [5.54, 'Waxing crescent'], [9.23, 'First quarter'], [12.92, 'Waxing gibbous'],
  [16.61, 'Full moon'], [20.3, 'Waning gibbous'], [23.99, 'Last quarter'], [27.68, 'Waning crescent'], [99, 'New moon'],
]

/** Where the moon is in its phases now: its age in days, how much is lit, its name, days to the next full and new moon. */
export function moonNow(nowMs: number) {
  const age = ((((nowMs - NEW_MOON_MS) / 86_400_000) % SYNODIC) + SYNODIC) % SYNODIC
  const lit = (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2
  const name = MOON_NAMES.find(([upTo]) => age < upTo)![1]
  const toFull = (SYNODIC / 2 - age + SYNODIC) % SYNODIC
  const toNew = SYNODIC - age
  return { age, lit, name, toFull, toNew }
}

function paintMoonDisc(ctx: Ctx, cx: number, cy: number, r: number, age: number) {
  // The dark part faintly, then the lit part: half the disc on the lit side and the curved edge between.
  const glowG = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.5)
  glowG.addColorStop(0, 'rgba(254,249,195,0.25)')
  glowG.addColorStop(1, 'rgba(254,249,195,0)')
  ctx.fillStyle = glowG
  ctx.beginPath()
  ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1e293b'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  const k = Math.cos((2 * Math.PI * age) / SYNODIC)
  ctx.save()
  ctx.translate(cx, cy)
  // Waxing is lit on the right (as seen from the northern half of the world), waning on the left.
  if (age > SYNODIC / 2) ctx.scale(-1, 1)
  ctx.beginPath()
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false)
  ctx.ellipse(0, 0, r * Math.abs(k), r, 0, Math.PI / 2, -Math.PI / 2, k > 0)
  ctx.closePath()
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r)
  g.addColorStop(0, '#fffbeb')
  g.addColorStop(1, '#e7dcae')
  ctx.fillStyle = g
  ctx.fill()
  ctx.clip()
  // Craters.
  ctx.fillStyle = 'rgba(160,150,110,0.35)'
  for (const [x, y, s] of [[-0.3, -0.25, 0.18], [0.25, 0.1, 0.24], [-0.1, 0.4, 0.12], [0.4, -0.4, 0.1], [-0.45, 0.2, 0.09]]) {
    ctx.beginPath()
    ctx.arc((age > SYNODIC / 2 ? -x : x) * r, y * r, s * r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function paintMoon(ctx: Ctx, fx: Ctx, nowMs: number, color: string, color2: string) {
  const { w, h } = BOARD.moon
  panel(ctx, fx, w, h, color, color2)
  const m = moonNow(nowMs)
  paintMoonDisc(ctx, 330, h / 2 + 20, 230, m.age)
  const x = 640
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#dbeafe'
  fitFont(ctx, 'THE MOON TONIGHT', CAPS, '700', 44, w - x - 80)
  ctx.fillText('THE MOON TONIGHT', x, 170)
  ctx.fillStyle = '#ffffff'
  fitFont(ctx, m.name, SCRIPT, '400', 120, w - x - 80)
  ctx.fillText(m.name, x, 300)
  ctx.fillStyle = gold(ctx, 380, 480, color2)
  fitFont(ctx, `${Math.round(m.lit * 100)}% lit`, DISPLAY, '900', 110, w - x - 80)
  ctx.fillText(`${Math.round(m.lit * 100)}% lit`, x, 440)
  fx.font = ctx.font
  fx.textAlign = 'left'
  fx.textBaseline = 'middle'
  fx.fillStyle = '#ff0000'
  fx.fillText(`${Math.round(m.lit * 100)}% lit`, x, 440)
  const full = m.toFull < 0.75 || m.toFull > SYNODIC - 0.75
    ? 'Full moon tonight!'
    : `Full moon in ${Math.round(m.toFull)} day${Math.round(m.toFull) === 1 ? '' : 's'}`
  ctx.fillStyle = '#cbd5e1'
  fitFont(ctx, full, CAPS, '700', 46, w - x - 80)
  ctx.fillText(full, x, 590)
  const when = new Date(nowMs + m.toFull * 86_400_000).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  ctx.fillStyle = '#94a3b8'
  fitFont(ctx, when, CAPS, '700', 34, w - x - 80)
  ctx.fillText(when, x, 660)
}

// -- the next holiday ------------------------------------------------------------------------------

interface HolidayDay {
  name: string
  /** What the board says on the day. */
  greeting: string
  icon: 'heart' | 'shamrock' | 'egg' | 'flower' | 'star' | 'pumpkin' | 'leaf' | 'tree' | 'burst'
  accent: string
  date: Date
}

function holidaysOf(year: number): HolidayDay[] {
  return [
    { name: 'New Year’s Day', greeting: `Happy New Year ${year}!`, icon: 'burst', accent: '#fbbf24', date: new Date(year, 0, 1) },
    { name: 'Valentine’s Day', greeting: 'Happy Valentine’s Day!', icon: 'heart', accent: '#f43f5e', date: new Date(year, 1, 14) },
    { name: 'St Patrick’s Day', greeting: 'Happy St Patrick’s Day!', icon: 'shamrock', accent: '#22c55e', date: new Date(year, 2, 17) },
    { name: 'Easter', greeting: 'Happy Easter!', icon: 'egg', accent: '#c084fc', date: easter(year) },
    { name: 'Mother’s Day', greeting: 'Happy Mother’s Day!', icon: 'flower', accent: '#f472b6', date: nthWeekday(year, 4, 0, 2) },
    { name: 'Father’s Day', greeting: 'Happy Father’s Day!', icon: 'star', accent: '#38bdf8', date: nthWeekday(year, 5, 0, 3) },
    { name: 'the Fourth of July', greeting: 'Happy Fourth of July!', icon: 'star', accent: '#ef4444', date: new Date(year, 6, 4) },
    { name: 'Halloween', greeting: 'Happy Halloween!', icon: 'pumpkin', accent: '#f97316', date: new Date(year, 9, 31) },
    { name: 'Thanksgiving', greeting: 'Happy Thanksgiving!', icon: 'leaf', accent: '#ea580c', date: nthWeekday(year, 10, 4, 4) },
    { name: 'Christmas', greeting: 'Merry Christmas!', icon: 'tree', accent: '#22c55e', date: new Date(year, 11, 25) },
    { name: 'MLK Day', greeting: 'Happy MLK Day!', icon: 'star', accent: '#60a5fa', date: nthWeekday(year, 0, 1, 3) },
    { name: 'Presidents’ Day', greeting: 'Happy Presidents’ Day!', icon: 'star', accent: '#3b82f6', date: nthWeekday(year, 1, 1, 3) },
    { name: 'Memorial Day', greeting: 'We remember and honor', icon: 'star', accent: '#ef4444', date: lastWeekday(year, 4, 1) },
    { name: 'Juneteenth', greeting: 'Happy Juneteenth!', icon: 'star', accent: '#ef4444', date: new Date(year, 5, 19) },
    { name: 'Labor Day', greeting: 'Happy Labor Day!', icon: 'star', accent: '#f59e0b', date: nthWeekday(year, 8, 1, 1) },
    { name: 'Veterans Day', greeting: 'Thank you, veterans', icon: 'star', accent: '#22c55e', date: new Date(year, 10, 11) },
    { name: 'Diwali', greeting: 'Happy Diwali!', icon: 'burst', accent: '#f59e0b', date: diwali(year) },
    { name: 'Hanukkah', greeting: 'Happy Hanukkah!', icon: 'star', accent: '#60a5fa', date: hanukkahStart(year) },
    { name: 'Kwanzaa', greeting: 'Happy Kwanzaa!', icon: 'burst', accent: '#22c55e', date: new Date(year, 11, 26) },
  ]
}

/** Today's holiday if there is one, then the next ones, with whole days to each by this computer's calendar. */
export function nextHolidays(nowMs: number): Array<HolidayDay & { days: number }> {
  const now = new Date(nowMs)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const days = (d: Date) => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - today) / 86_400_000)
  return [...holidaysOf(now.getFullYear()), ...holidaysOf(now.getFullYear() + 1)]
    .map((hd) => ({ ...hd, days: days(hd.date) }))
    .filter((hd) => hd.days >= 0)
    .sort((a, b) => a.days - b.days)
}

function holidayIcon(ctx: Ctx, icon: HolidayDay['icon'], x: number, y: number, r: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = color
  ctx.strokeStyle = color
  const heart = (s: number) => {
    ctx.beginPath()
    ctx.moveTo(0, s * 0.35)
    ctx.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.5, -s * 1.05, 0, -s * 0.45)
    ctx.bezierCurveTo(s * 0.5, -s * 1.05, s * 1.1, -s * 0.35, 0, s * 0.35)
    ctx.fill()
  }
  if (icon === 'heart') heart(r * 1.1)
  else if (icon === 'shamrock') {
    for (const a of [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]) {
      ctx.save()
      ctx.rotate(a + Math.PI / 2)
      ctx.translate(0, -r * 0.45)
      heart(r * 0.6)
      ctx.restore()
    }
    ctx.lineWidth = r * 0.12
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, r * 0.1)
    ctx.quadraticCurveTo(r * 0.1, r * 0.6, r * 0.35, r * 0.95)
    ctx.stroke()
  } else if (icon === 'egg') {
    ctx.beginPath()
    ctx.ellipse(0, r * 0.08, r * 0.7, r * 0.92, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.save()
    ctx.clip()
    ctx.fillStyle = '#fde68a'
    ctx.fillRect(-r, -r * 0.2, r * 2, r * 0.22)
    ctx.fillStyle = '#f9a8d4'
    ctx.fillRect(-r, r * 0.3, r * 2, r * 0.18)
    ctx.restore()
  } else if (icon === 'flower') {
    for (let k = 0; k < 6; k++) {
      ctx.save()
      ctx.rotate((k * Math.PI) / 3)
      ctx.beginPath()
      ctx.ellipse(0, -r * 0.5, r * 0.28, r * 0.5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    ctx.fillStyle = '#fde047'
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2)
    ctx.fill()
  } else if (icon === 'star') {
    ctx.beginPath()
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5
      const rr = k % 2 ? r * 0.42 : r
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
    ctx.fill()
  } else if (icon === 'pumpkin') {
    for (const [dx, rx] of [[-0.42, 0.45], [0.42, 0.45], [0, 0.55]] as const) {
      ctx.fillStyle = dx === 0 ? color : shade(color, -0.2)
      ctx.beginPath()
      ctx.ellipse(dx * r, r * 0.1, rx * r, r * 0.78, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#4d7c0f'
    ctx.fillRect(-r * 0.08, -r * 0.92, r * 0.16, r * 0.3)
    ctx.fillStyle = '#fde68a'
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(s * r * 0.4, -r * 0.05)
      ctx.lineTo(s * r * 0.15, -r * 0.05)
      ctx.lineTo(s * r * 0.27, -r * 0.3)
      ctx.fill()
    }
    ctx.beginPath()
    ctx.moveTo(-r * 0.45, r * 0.25)
    ctx.quadraticCurveTo(0, r * 0.7, r * 0.45, r * 0.25)
    ctx.quadraticCurveTo(0, r * 0.45, -r * 0.45, r * 0.25)
    ctx.fill()
  } else if (icon === 'leaf') {
    ctx.beginPath()
    for (let k = 0; k <= 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI * 2) / 10
      const rr = k % 2 ? r * 0.5 : r
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.9)
    }
    ctx.fill()
    ctx.strokeStyle = shade(color, -0.4)
    ctx.lineWidth = r * 0.07
    ctx.beginPath()
    ctx.moveTo(0, r * 1.1)
    ctx.lineTo(0, -r * 0.6)
    ctx.stroke()
  } else if (icon === 'tree') {
    for (let k = 0; k < 3; k++) {
      const top = -r + k * r * 0.5
      const half = r * (0.45 + k * 0.22)
      ctx.beginPath()
      ctx.moveTo(0, top)
      ctx.lineTo(half, top + r * 0.75)
      ctx.lineTo(-half, top + r * 0.75)
      ctx.fill()
    }
    ctx.fillStyle = '#92400e'
    ctx.fillRect(-r * 0.12, r * 0.75, r * 0.24, r * 0.3)
    ctx.fillStyle = '#fde047'
    ctx.beginPath()
    ctx.arc(0, -r, r * 0.14, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.lineWidth = r * 0.08
    ctx.lineCap = 'round'
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8
      ctx.strokeStyle = k % 2 ? '#ffffff' : color
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * r * 0.25, Math.sin(a) * r * 0.25)
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function paintHoliday(ctx: Ctx, fx: Ctx, nowMs: number, color: string, color2: string) {
  const { w, h } = BOARD.holiday
  panel(ctx, fx, w, h, color, color2)
  const [next, then] = nextHolidays(nowMs)
  holidayIcon(ctx, next.icon, 250, 400, 150, next.accent)
  const x = 480
  const cx = x + (w - x - 70) / 2
  const room = w - x - 110
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  fx.textAlign = 'center'
  fx.textBaseline = 'middle'
  fx.fillStyle = '#ff0000'
  if (next.days === 0) {
    ctx.fillStyle = '#ffffff'
    fitFont(ctx, next.greeting, SCRIPT, '400', 150, room)
    ctx.fillText(next.greeting, cx, 360)
  } else {
    ctx.fillStyle = '#dbeafe'
    const top = next.days === 1 ? 'ONLY ONE DAY UNTIL' : 'DAYS UNTIL'
    fitFont(ctx, top, CAPS, '700', 50, room)
    ctx.fillText(top, cx, next.days === 1 ? 210 : 470)
    if (next.days > 1) {
      const n = String(next.days)
      fitFont(ctx, n, DISPLAY, '900', 330, room)
      ctx.fillStyle = gold(ctx, 120, 420, color2)
      ctx.fillText(n, cx, 280)
      fx.font = ctx.font
      fx.fillText(n, cx, 280)
    }
    ctx.fillStyle = '#ffffff'
    fitFont(ctx, next.name, SCRIPT, '400', 130, room)
    ctx.fillText(next.name, cx, next.days === 1 ? 360 : 590)
  }
  if (then) {
    const line = `Then ${then.name} in ${then.days} days`
    ctx.fillStyle = '#94a3b8'
    fitFont(ctx, line, CAPS, '700', 36, w - 200)
    ctx.fillText(line, w / 2, 790)
  }
}

// -- New Year's countdown ------------------------------------------------------------------------

/** What the New Year's board shows now: days to go, the last day's hours to midnight, or the greeting. */
export function newYearNow(nowMs: number) {
  const now = new Date(nowMs)
  const year = now.getFullYear()
  if (now.getMonth() === 0 && now.getDate() === 1) return { phase: 'arrived' as const, year, days: 0, left: 0 }
  const midnight = new Date(year + 1, 0, 1).getTime()
  const today = Date.UTC(year, now.getMonth(), now.getDate())
  const days = Math.round((Date.UTC(year + 1, 0, 1) - today) / 86_400_000)
  if (days === 1) return { phase: 'eve' as const, year: year + 1, days, left: Math.max(0, Math.ceil((midnight - nowMs) / 1000)) }
  return { phase: 'days' as const, year: year + 1, days, left: 0 }
}

function paintNewYear(ctx: Ctx, fx: Ctx, nowMs: number, color: string, color2: string) {
  const { w, h } = BOARD['new-year']
  panel(ctx, fx, w, h, color, color2)
  const ny = newYearNow(nowMs)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  fx.textAlign = 'center'
  fx.textBaseline = 'middle'
  fx.fillStyle = '#ff0000'
  holidayIcon(ctx, 'burst', 170, 160, 90, color2)
  holidayIcon(ctx, 'burst', w - 170, 160, 90, '#f472b6')
  if (ny.phase === 'arrived') {
    ctx.fillStyle = '#ffffff'
    fitFont(ctx, 'Happy New Year', SCRIPT, '400', 190, w - 200)
    ctx.fillText('Happy New Year', w / 2, 380)
    ctx.fillStyle = gold(ctx, 520, 760, color2)
    fitFont(ctx, String(ny.year), DISPLAY, '900', 240, w - 300)
    ctx.fillText(String(ny.year), w / 2, 640)
    fx.font = ctx.font
    fx.fillText(String(ny.year), w / 2, 640)
    return
  }
  ctx.fillStyle = '#dbeafe'
  const title = ny.phase === 'eve' ? `COUNTDOWN TO ${ny.year}` : `DAYS UNTIL ${ny.year}`
  fitFont(ctx, title, CAPS, '700', 60, w - 460)
  ctx.fillText(title, w / 2, 160)
  const big = ny.phase === 'eve'
    ? [Math.floor(ny.left / 3600), Math.floor((ny.left % 3600) / 60), ny.left % 60]
      .map((v, i) => (i ? String(v).padStart(2, '0') : String(v))).join(':')
    : String(ny.days)
  fitFont(ctx, big, DISPLAY, '900', 360, w - 200)
  ctx.fillStyle = gold(ctx, 280, 600, color2)
  ctx.fillText(big, w / 2, 450)
  fx.font = ctx.font
  fx.fillText(big, w / 2, 450)
  ctx.fillStyle = '#ffffff'
  const caption = ny.phase === 'eve' ? 'until midnight' : 'New Year’s Eve is coming'
  fitFont(ctx, caption, SCRIPT, '400', 110, w - 200)
  ctx.fillText(caption, w / 2, 720)
}

// -- Hanukkah menorah ------------------------------------------------------------------------------

/** Tonight's Hanukkah night (1 to 8), or how many days until it starts. */
export function menorahNow(nowMs: number) {
  const now = new Date(nowMs)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  for (const year of [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]) {
    const [y, m, d] = hanukkahEve(year)
    const start = Date.UTC(y, m, d)
    const days = Math.round((start - today) / 86_400_000)
    if (days <= 0 && days > -8) return { night: 1 - days, days: 0, start: new Date(y, m, d) }
    if (days > 0) return { night: 0, days, start: new Date(y, m, d) }
  }
  return { night: 0, days: 0, start: now }
}

function paintMenorah(ctx: Ctx, fx: Ctx, nowMs: number, color: string, color2: string) {
  const { w, h } = BOARD.menorah
  panel(ctx, fx, w, h, color, color2)
  const now = menorahNow(nowMs)
  const cx = w / 2
  const top = 330
  const step = 112
  const metal = gold(ctx, 200, 700, color2)
  // The arms: half circles from the middle stem, the base and the stem.
  ctx.strokeStyle = metal
  ctx.lineCap = 'round'
  ctx.lineWidth = 18
  for (let k = 1; k <= 4; k++) {
    ctx.beginPath()
    ctx.arc(cx, top, k * step, 0, Math.PI)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(cx, top - 40)
  ctx.lineTo(cx, 680)
  ctx.stroke()
  ctx.fillStyle = metal
  ctx.beginPath()
  ctx.moveTo(cx - 150, 700)
  ctx.quadraticCurveTo(cx, 640, cx + 150, 700)
  ctx.closePath()
  ctx.fill()
  fx.strokeStyle = '#ff0000'
  fx.lineWidth = 18
  fx.beginPath()
  fx.moveTo(cx, top - 40)
  fx.lineTo(cx, 680)
  fx.stroke()
  // Candles, placed right to left; tonight's are lit, with the helper candle in the middle.
  const candle = (x: number, y: number, lit: boolean, tall: boolean) => {
    const ch = tall ? 110 : 90
    ctx.fillStyle = metal
    ctx.fillRect(x - 26, y - 8, 52, 14)
    const g = ctx.createLinearGradient(x - 14, 0, x + 14, 0)
    g.addColorStop(0, '#cbd5e1')
    g.addColorStop(0.5, '#ffffff')
    g.addColorStop(1, '#94a3b8')
    ctx.fillStyle = g
    ctx.fillRect(x - 14, y - 8 - ch, 28, ch)
    ctx.fillStyle = '#3b82f6'
    for (let k = 0; k < 3; k++) ctx.fillRect(x - 14, y - 8 - ch + 18 + k * 26, 28, 7)
    if (!lit) return
    const fy = y - 8 - ch - 26
    const flame = ctx.createRadialGradient(x, fy, 2, x, fy, 70)
    flame.addColorStop(0, 'rgba(255,240,180,0.9)')
    flame.addColorStop(0.3, 'rgba(251,191,36,0.4)')
    flame.addColorStop(1, 'rgba(251,191,36,0)')
    ctx.fillStyle = flame
    ctx.beginPath()
    ctx.arc(x, fy, 70, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fde68a'
    ctx.beginPath()
    ctx.ellipse(x, fy, 11, 22, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(x, fy + 6, 5, 10, 0, 0, Math.PI * 2)
    ctx.fill()
    fx.fillStyle = '#0000ff'
    fx.beginPath()
    fx.arc(x, fy, 40, 0, Math.PI * 2)
    fx.fill()
  }
  for (let k = 4; k >= 1; k--) {
    candle(cx - k * step, top, now.night >= 4 + k, false)
    candle(cx + k * step, top, now.night >= 5 - k, false)
  }
  candle(cx, top - 40, now.night > 0, true)
  // What tonight is.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  const line = now.night
    ? 'Happy Hanukkah'
    : now.days === 1 ? 'Hanukkah begins tomorrow' : `Hanukkah begins in ${now.days} days`
  fitFont(ctx, line, SCRIPT, '400', 120, w - 200)
  ctx.fillText(line, cx, 770)
  ctx.fillStyle = '#dbeafe'
  const sub = now.night
    ? `TONIGHT IS NIGHT ${now.night} OF 8`
    : `${now.start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()} AT SUNDOWN`
  fitFont(ctx, sub, CAPS, '700', 44, w - 240)
  ctx.fillText(sub, cx, 850)
}

// -- Advent calendar -------------------------------------------------------------------------------

/** The door numbers in the order they hang, mixed up as on a real calendar. */
const ADVENT_ORDER = [7, 18, 3, 22, 12, 1, 15, 9, 24, 5, 20, 11, 2, 14, 19, 8, 23, 16, 10, 4, 17, 21, 6, 13]

/** Which doors are open today (0 before December), and the days to December and to Christmas. */
export function adventNow(nowMs: number) {
  const now = new Date(nowMs)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  if (now.getMonth() === 11) {
    const open = Math.min(24, now.getDate())
    const toChristmas = Math.round((Date.UTC(now.getFullYear(), 11, 25) - today) / 86_400_000)
    return { open, toDecember: 0, toChristmas }
  }
  const toDecember = Math.round((Date.UTC(now.getFullYear(), 11, 1) - today) / 86_400_000)
  return { open: 0, toDecember, toChristmas: toDecember + 24 }
}

function paintAdvent(ctx: Ctx, fx: Ctx, nowMs: number, color: string, color2: string) {
  const { w, h } = BOARD.advent
  panel(ctx, fx, w, h, color, color2)
  const a = adventNow(nowMs)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = gold(ctx, 60, 150, color2)
  fitFont(ctx, 'ADVENT CALENDAR', CAPS, '700', 64, w - 200)
  ctx.fillText('ADVENT CALENDAR', w / 2, 112)
  const cols = 6
  const gx = 110
  const gy = 180
  const cw = (w - gx * 2) / cols
  const rh = 160
  const icons: Array<'star' | 'tree' | 'burst' | 'heart'> = ['star', 'tree', 'burst', 'heart']
  ADVENT_ORDER.forEach((n, i) => {
    const x = gx + (i % cols) * cw + 8
    const y = gy + Math.floor(i / cols) * rh + 8
    const dw = cw - 16
    const dh = rh - 16
    const open = n <= a.open
    const today = n === a.open && a.toChristmas > 0
    if (open) {
      // Inside the door: a little picture, lit up.
      ctx.fillStyle = shade(color, -0.5)
      ctx.fillRect(x, y, dw, dh)
      const g = ctx.createRadialGradient(x + dw / 2, y + dh / 2, 4, x + dw / 2, y + dh / 2, dw * 0.6)
      g.addColorStop(0, rgba(today ? '#fde68a' : '#93c5fd', today ? 0.55 : 0.25))
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(x, y, dw, dh)
      const icon = icons[n % icons.length]
      if (n % 5 === 0) snowflake(ctx, x + dw / 2, y + dh / 2, 40, '#e0f2fe')
      else holidayIcon(ctx, icon, x + dw / 2, y + dh / 2, 40, icon === 'tree' ? '#22c55e' : icon === 'heart' ? '#f43f5e' : color2)
      // The door swung open on its hinge.
      ctx.fillStyle = shade(n % 2 ? '#b91c1c' : '#166534', -0.2)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - dw * 0.18, y + 10)
      ctx.lineTo(x - dw * 0.18, y + dh - 10)
      ctx.lineTo(x, y + dh)
      ctx.closePath()
      ctx.fill()
    } else {
      const g = ctx.createLinearGradient(0, y, 0, y + dh)
      const base = n % 2 ? '#b91c1c' : '#166534'
      g.addColorStop(0, shade(base, 0.15))
      g.addColorStop(1, shade(base, -0.25))
      ctx.fillStyle = g
      ctx.fillRect(x, y, dw, dh)
      ctx.fillStyle = gold(ctx, y + 20, y + dh - 20, color2)
      fitFont(ctx, String(n), DISPLAY, '900', 84, dw - 30)
      ctx.fillText(String(n), x + dw / 2, y + dh / 2 + 4)
      fx.font = ctx.font
      fx.textAlign = 'center'
      fx.textBaseline = 'middle'
      fx.fillStyle = '#ff0000'
      fx.fillText(String(n), x + dw / 2, y + dh / 2 + 4)
    }
    ctx.lineWidth = today ? 8 : 3
    ctx.strokeStyle = today ? '#fde68a' : rgba(color2, 0.7)
    ctx.strokeRect(x, y, dw, dh)
    if (today) {
      fx.strokeStyle = '#ff0000'
      fx.lineWidth = 8
      fx.strokeRect(x, y, dw, dh)
    }
  })
  const line = a.toChristmas <= 0 ? 'Merry Christmas!'
    : a.toChristmas === 1 ? 'Christmas Eve! One more sleep'
      : a.open ? `${a.toChristmas} days until Christmas`
        : a.toDecember === 1 ? 'The first door opens tomorrow' : `The first door opens in ${a.toDecember} days`
  ctx.fillStyle = '#ffffff'
  fitFont(ctx, line, SCRIPT, '400', 84, w - 200)
  ctx.fillText(line, w / 2, 905)
}

// -- Lunar New Year --------------------------------------------------------------------------------

/** Days until the next Lunar New Year and its animal; during the 15 days of the festival, which day it is. */
export function lunarNow(nowMs: number) {
  const now = new Date(nowMs)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    const [m, d] = LUNAR_NEW_YEAR[year] ?? [1, 1]
    const days = Math.round((Date.UTC(year, m, d) - today) / 86_400_000)
    const animal = ZODIAC[(((year - 4) % 12) + 12) % 12]
    if (days <= 0 && days > -15) return { days: 0, festivalDay: 1 - days, animal, year }
    if (days > 0) return { days, festivalDay: 0, animal, year }
  }
  return { days: 0, festivalDay: 0, animal: ZODIAC[0], year: now.getFullYear() }
}

/** A red paper lantern with gold caps and a tassel. */
function redLantern(ctx: Ctx, fx: Ctx, x: number, y: number, r: number) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r * 1.2)
  g.addColorStop(0, '#fca5a5')
  g.addColorStop(0.45, '#dc2626')
  g.addColorStop(1, '#7f1d1d')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * 0.85, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(250,204,21,0.55)'
  ctx.lineWidth = 3
  for (const k of [-0.6, -0.25, 0.25, 0.6]) {
    ctx.beginPath()
    ctx.ellipse(x, y, Math.abs(k) * r, r * 0.85, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.fillStyle = '#facc15'
  ctx.fillRect(x - r * 0.4, y - r * 0.95, r * 0.8, r * 0.18)
  ctx.fillRect(x - r * 0.4, y + r * 0.78, r * 0.8, r * 0.18)
  fx.fillStyle = '#ff0000'
  fx.fillRect(x - r * 0.4, y - r * 0.95, r * 0.8, r * 0.18)
  fx.fillRect(x - r * 0.4, y + r * 0.78, r * 0.8, r * 0.18)
  ctx.strokeStyle = '#facc15'
  ctx.lineWidth = 4
  ctx.beginPath()
  for (let k = -3; k <= 3; k++) {
    ctx.moveTo(x + k * 3, y + r * 0.96)
    ctx.lineTo(x + k * 4, y + r * 1.5)
  }
  ctx.moveTo(x, y - r * 0.95)
  ctx.lineTo(x, y - r * 1.4)
  ctx.stroke()
}

function paintLunar(ctx: Ctx, fx: Ctx, nowMs: number, color: string, color2: string) {
  const { w, h } = BOARD['lunar-new-year']
  panel(ctx, fx, w, h, color, color2)
  const l = lunarNow(nowMs)
  redLantern(ctx, fx, 190, 380, 95)
  redLantern(ctx, fx, w - 190, 380, 95)
  const cx = w / 2
  const room = w - 560
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  fx.textAlign = 'center'
  fx.textBaseline = 'middle'
  fx.fillStyle = '#ff0000'
  ctx.fillStyle = '#fde68a'
  fitFont(ctx, 'LUNAR NEW YEAR', CAPS, '700', 56, room)
  ctx.fillText('LUNAR NEW YEAR', cx, 150)
  if (l.festivalDay) {
    ctx.fillStyle = '#ffffff'
    fitFont(ctx, 'Happy New Year!', SCRIPT, '400', 150, room)
    ctx.fillText('Happy New Year!', cx, 360)
    ctx.fillStyle = gold(ctx, 480, 620, color2)
    const animal = `YEAR OF THE ${l.animal.toUpperCase()}`
    fitFont(ctx, animal, DISPLAY, '900', 92, room)
    ctx.fillText(animal, cx, 560)
    fx.font = ctx.font
    fx.fillText(animal, cx, 560)
    ctx.fillStyle = '#fecaca'
    const day = `DAY ${l.festivalDay} OF THE SPRING FESTIVAL`
    fitFont(ctx, day, CAPS, '700', 40, w - 200)
    ctx.fillText(day, cx, 730)
    return
  }
  const n = String(l.days)
  ctx.fillStyle = gold(ctx, 220, 500, color2)
  fitFont(ctx, n, DISPLAY, '900', 300, room)
  ctx.fillText(n, cx, 360)
  fx.font = ctx.font
  fx.fillText(n, cx, 360)
  ctx.fillStyle = '#dbeafe'
  const top = l.days === 1 ? 'DAY TO GO' : 'DAYS TO GO'
  fitFont(ctx, top, CAPS, '700', 46, room)
  ctx.fillText(top, cx, 540)
  ctx.fillStyle = '#ffffff'
  const animal = `to the Year of the ${l.animal}`
  fitFont(ctx, animal, SCRIPT, '400', 110, w - 200)
  ctx.fillText(animal, cx, 680)
}

// -- Tonight's show ---------------------------------------------------------------------------------

interface ShowtimesView {
  head: string
  big: string
  line: string
}

function timeIn(iso: string | null | undefined, zone: string | undefined, withDay = false) {
  if (!iso) return ''
  const d = new Date(iso)
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', ...(withDay ? { weekday: 'long' } : {}) }
  try {
    return d.toLocaleString(undefined, { ...opts, timeZone: zone || undefined })
  } catch {
    return d.toLocaleString(undefined, opts)
  }
}

/** What the "Tonight's show" board says now, from the server's plan for tonight. */
export function showtimesView(nowMs: number): ShowtimesView {
  const { data: t, error } = tonightNow()
  if (!t) return { head: 'TONIGHT’S SHOW', big: '', line: error ? 'Show times will be back soon' : 'Checking the show times…' }
  const zone = t.timezone
  const slots = (t.tonight_slots ?? []).filter((s) => new Date(s.ends_at).getTime() > nowMs)
  const now = slots.find((s) => new Date(s.starts_at).getTime() <= nowMs)
  if (t.state === 'running' || now) {
    const until = now?.ends_at ?? t.ends_at
    return { head: 'SHOWING NOW', big: now?.title || t.title || 'Enjoy the show!', line: until ? `Until ${timeIn(until, zone)}` : '' }
  }
  const next = slots[0]
  if (next) {
    return {
      head: 'TONIGHT’S SHOW',
      big: `${timeIn(next.starts_at, zone)} – ${timeIn(next.ends_at, zone)}`,
      line: next.title || 'See you tonight!',
    }
  }
  if (t.next_starts_at) {
    return {
      head: t.cancelled_by ? 'NO SHOW TONIGHT' : 'NEXT SHOW',
      big: timeIn(t.next_starts_at, zone, true),
      line: t.next_title || 'See you then!',
    }
  }
  return { head: 'TONIGHT’S SHOW', big: 'Thanks for visiting!', line: 'Check back soon for the next show' }
}

function paintShowtimes(ctx: Ctx, fx: Ctx, v: ShowtimesView, color: string, color2: string) {
  const { w, h } = BOARD.showtimes
  panel(ctx, fx, w, h, color, color2)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  fx.textAlign = 'center'
  fx.textBaseline = 'middle'
  fx.fillStyle = '#ff0000'
  // A star either side of the heading, like a marquee.
  holidayIcon(ctx, 'star', 170, 150, 50, color2)
  holidayIcon(ctx, 'star', w - 170, 150, 50, color2)
  ctx.fillStyle = '#dbeafe'
  fitFont(ctx, v.head, CAPS, '700', 66, w - 460)
  ctx.fillText(v.head, w / 2, 150)
  if (v.big) {
    ctx.fillStyle = gold(ctx, 250, 440, color2)
    fitFont(ctx, v.big, DISPLAY, '900', 170, w - 200)
    ctx.fillText(v.big, w / 2, 345)
    fx.font = ctx.font
    fx.fillText(v.big, w / 2, 345)
  }
  ctx.fillStyle = '#ffffff'
  fitFont(ctx, v.line, SCRIPT, '400', 96, w - 200)
  ctx.fillText(v.line, w / 2, v.big ? 540 : 400)
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

  // Candle flames flicker.
  if (uKind != 3 && fx.b > 0.5) {
    float fl = 0.8 + 0.2 * sin(uTime * 13.0 + uv.x * 40.0) * sin(uTime * 7.3 + uv.y * 23.0);
    col *= fl;
  }

  // The clock's colon blinks once a second.
  if (uKind == 4 && fx.g > 0.5) {
    float on = 0.35 + 0.65 * step(0.5, fract(uTime));
    col *= on;
    a *= on;
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
    } else if (style === 'clock') {
      words = JSON.stringify(clockWords(d.clockMs))
    } else if (style === 'moon') {
      // Repainted as the moon changes, a few times a day.
      words = String(Math.floor(moonNow(d.clockMs).age * 8))
    } else if (style === 'holiday') {
      const [next] = nextHolidays(d.clockMs)
      words = [next.name, next.days].join('|')
    } else if (style === 'new-year') {
      // Once a day, or once a second on New Year's Eve while it counts the hours.
      const ny = newYearNow(d.clockMs)
      words = [ny.phase, ny.days, ny.left].join('|')
    } else if (style === 'menorah') {
      const m = menorahNow(d.clockMs)
      words = [m.night, m.days].join('|')
    } else if (style === 'advent') {
      const a = adventNow(d.clockMs)
      words = [a.open, a.toDecember, a.toChristmas].join('|')
    } else if (style === 'lunar-new-year') {
      const l = lunarNow(d.clockMs)
      words = [l.days, l.festivalDay, l.animal].join('|')
    } else if (style === 'showtimes') {
      words = JSON.stringify(showtimesView(d.clockMs))
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
      else if (style === 'clock') paintClock(ctx, fx, d.clockMs, layer.color, layer.color2)
      else if (style === 'moon') paintMoon(ctx, fx, d.clockMs, layer.color, layer.color2)
      else if (style === 'holiday') paintHoliday(ctx, fx, d.clockMs, layer.color, layer.color2)
      else if (style === 'new-year') paintNewYear(ctx, fx, d.clockMs, layer.color, layer.color2)
      else if (style === 'menorah') paintMenorah(ctx, fx, d.clockMs, layer.color, layer.color2)
      else if (style === 'advent') paintAdvent(ctx, fx, d.clockMs, layer.color, layer.color2)
      else if (style === 'lunar-new-year') paintLunar(ctx, fx, d.clockMs, layer.color, layer.color2)
      else if (style === 'showtimes') paintShowtimes(ctx, fx, showtimesView(d.clockMs), layer.color, layer.color2)
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
