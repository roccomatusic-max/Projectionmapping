/**
 * More of the festivals families celebrate across the US: a girl lighting a row of diyas, a box of Diwali sweets
 * shared, Holi's coloured powder thrown, a flying alebrije, papel picado strung up for the Day of the Dead, a step
 * team for Juneteenth, Kwanzaa gifts, a dragon dance, a kumquat tree for Lunar New Year, a Mardi Gras float
 * throwing beads and a leprechaun sliding down the rainbow.
 *
 * Painted the same way as sprites.ts: facing right, one frame at a time, into a cell of w by h design units.
 */

import { arm, dot, head, person, rr, seated, standing, type Dress } from './figures'
import {
  circle, ellipse, rgba, saying, shade, SPARKLE, TAU, wheel,
  type Ctx, type SpriteColors, type SpriteRow,
} from './sprites'

const PEACH = '#f5c9a0'
const TAN = '#c68a5a'
const BROWN = '#8d5a3b'
const DEEP = '#6b4226'

/** A little clay lamp with its flame, lit or not. */
function diya(ctx: Ctx, x: number, y: number, s: number, lit: number, flick: number) {
  ctx.fillStyle = '#c2410c'
  ctx.beginPath()
  ctx.moveTo(x - 12 * s, y - 6 * s)
  ctx.quadraticCurveTo(x, y + 8 * s, x + 12 * s, y - 6 * s)
  ctx.lineTo(x + 16 * s, y - 9 * s)
  ctx.lineTo(x + 8 * s, y - 6 * s)
  ctx.fill()
  ctx.fillStyle = '#fbbf24'
  ctx.fillRect(x - 10 * s, y - 7 * s, 20 * s, 2 * s)
  if (lit <= 0) return
  const h = (10 + flick * 2) * s * lit
  const g = ctx.createRadialGradient(x + 10 * s, y - 12 * s, 1, x + 10 * s, y - 12 * s, 26 * s * lit)
  g.addColorStop(0, rgba('#fde68a', 0.6))
  g.addColorStop(1, rgba('#fde68a', 0))
  ctx.fillStyle = g
  circle(ctx, x + 10 * s, y - 12 * s, 26 * s * lit)
  ctx.fill()
  ctx.fillStyle = '#fbbf24'
  ctx.beginPath()
  ctx.moveTo(x + 7 * s, y - 9 * s)
  ctx.quadraticCurveTo(x + 10 * s, y - 9 * s - h, x + 13 * s, y - 9 * s)
  ctx.fill()
  ctx.fillStyle = '#fef9c3'
  ellipse(ctx, x + 10 * s, y - 11 * s, 1.6 * s, 3 * s * lit)
  ctx.fill()
}

// -- lighting the diyas -------------------------------------------------------------------------------------------

/** Level: a girl in her best lehenga lighting a row of diyas one by one as people come. */
function diyaLighter(ctx: Ctx, f: number, n: number, { color, color2 }: SpriteColors) {
  const k = f / (n - 1)
  const g = 212
  const lamps = 7
  const lit = Math.round(k * lamps)
  for (let l = 0; l < lamps; l++) diya(ctx, 70 + l * 32, g - 4, 1, l < lit ? 1 : 0, (l * 7 + f) % 3 === 0 ? 1 : 0)
  // Petals of a small rangoli under the row.
  for (let l = 0; l < lit; l++) {
    for (let p = 0; p < 4; p++) {
      const a = (p / 4) * TAU + 0.4
      ctx.fillStyle = rgba(p % 2 ? color2 : '#fb923c', 0.75)
      ellipse(ctx, 80 + l * 32 + Math.cos(a) * 6, g + 6 + Math.sin(a) * 2, 4, 2, a)
      ctx.fill()
    }
  }
  const x = Math.min(270, 50 + lit * 32)
  const d: Dress = { skin: TAN, hair: '#1c1917', shirt: color, pants: color2 }
  person(ctx, x, g, 0.9, -1, d, { skirt: true, open: k > 0.95 ? 0.7 : 0.2 }, () => {
    // A long braid, a dupatta and the taper she lights them with.
    ctx.strokeStyle = '#1c1917'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(10, -112)
    ctx.quadraticCurveTo(16, -90, 12, -70)
    ctx.stroke()
    ctx.strokeStyle = rgba(color2, 0.85)
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(-14, -104)
    ctx.quadraticCurveTo(0, -80, 14, -104)
    ctx.stroke()
    dot(ctx, -2, -124, 2, '#ef4444')
    if (k > 0.95) {
      arm(ctx, [-10, -98, -20, -112, -26, -126], 8, d.shirt)
      arm(ctx, [10, -98, 18, -112, 24, -126], 8, d.shirt)
      dot(ctx, -26, -128, 5, d.skin)
      dot(ctx, 24, -128, 5, d.skin)
    } else {
      arm(ctx, [-10, -98, -24, -76, -34, -46], 8, d.shirt)
      ctx.strokeStyle = '#fef3c7'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(-34, -46)
      ctx.lineTo(-44, -26)
      ctx.stroke()
      dot(ctx, -45, -24, 3, '#fbbf24')
      arm(ctx, [10, -98, 14, -78, 10, -62], 8, d.shirt)
    }
  })
}

// -- a box of sweets ------------------------------------------------------------------------------------------------

function mithaiBox(sharing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 242
    const x = 90
    // A grandmother in a sari holding out the open box of sweets.
    const d: Dress = { skin: BROWN, hair: '#e5e7eb', shirt: color, pants: color }
    standing(ctx, x, g, 1, d, { skirt: true, open: sharing ? 0.6 : 0 })
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(x - 14, g - 104)
    ctx.lineTo(x + 6, g - 104)
    ctx.lineTo(x + 24, g - 40)
    ctx.lineTo(x + 12, g - 40)
    ctx.fill()
    ctx.fillStyle = '#e5e7eb'
    dot(ctx, x - 12, g - 128, 8, '#e5e7eb')
    dot(ctx, x + 2, g - 124, 2.2, '#ef4444')
    const lift = sharing ? Math.min(1, p / 0.3) * 18 : 0
    const bx = x + 46 + lift
    const by = g - 92 - lift * 0.4
    arm(ctx, [x + 10, g - 98, x + 26, g - 90, bx - 16, by + 4], 9, d.shirt)
    arm(ctx, [x - 10, g - 98, x + 6, g - 80, bx - 20, by + 8], 9, shade(d.shirt, -0.1))
    // The box, its lid open, the sweets in rows: ladoos, barfi and jalebi.
    ctx.fillStyle = shade(color2, -0.1)
    ctx.beginPath()
    ctx.moveTo(bx - 26, by - 6)
    ctx.lineTo(bx + 26, by - 6)
    ctx.lineTo(bx + 30, by - 30)
    ctx.lineTo(bx - 22, by - 30)
    ctx.fill()
    ctx.fillStyle = color2
    rr(ctx, bx - 28, by - 6, 56, 18, 3)
    for (let k = 0; k < 4; k++) dot(ctx, bx - 20 + k * 13, by - 6, 5, '#fb923c')
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = '#fef3c7'
      ctx.save()
      ctx.translate(bx - 16 + k * 16, by + 2)
      ctx.rotate(0.6)
      ctx.fillRect(-4, -4, 8, 8)
      ctx.fillStyle = '#86efac'
      ctx.fillRect(-1, -4, 2, 2)
      ctx.restore()
    }
    // For people: a sweet lifted out and offered, sparkles round the box.
    if (sharing) {
      const q = (p * 2) % 1
      dot(ctx, bx + 10 + q * 40, by - 14 - Math.sin(q * Math.PI) * 30, 6, '#fb923c')
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU + p * 4
        dot(ctx, bx + Math.cos(a) * 44, by - 10 + Math.sin(a) * 22, 2, '#fde68a')
      }
    }
    // Diyas glowing at her feet.
    diya(ctx, 30, g - 2, 0.8, 1, f % 2)
    diya(ctx, 180, g - 2, 0.8, 1, (f + 1) % 2)
  }
}

// -- Holi ----------------------------------------------------------------------------------------------------------

const HOLI = ['#f472b6', '#facc15', '#4ade80', '#60a5fa', '#c084fc', '#fb923c']

function holiColors(throwing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 232
    // Two friends in white kurtas already splashed with colour, bowls of gulal at their feet.
    const pals: Array<[number, number, string, Dress]> = [
      [80, 1, color, { skin: TAN, hair: '#1c1917', shirt: '#f8fafc', pants: '#f8fafc' }],
      [190, -1, color2, { skin: BROWN, hair: '#1c1917', shirt: '#f8fafc', pants: '#f8fafc' }],
    ]
    for (let b = 0; b < 3; b++) {
      ctx.fillStyle = '#e2e8f0'
      ctx.beginPath()
      ctx.ellipse(120 + b * 16, g - 4, 9, 6, 0, 0, Math.PI)
      ctx.fill()
      ctx.fillStyle = HOLI[b]
      ellipse(ctx, 120 + b * 16, g - 5, 8, 3)
      ctx.fill()
    }
    pals.forEach(([x, dir, c, d], j) => {
      const throwT = throwing ? ((p * 2 + j * 0.5) % 1) : 0
      const jump = throwing ? Math.abs(Math.sin(p * TAU * 2 + j)) * 8 : 0
      person(ctx, x, g - jump, 0.95, dir, d, { open: throwing ? 0.9 : 0.3 }, () => {
        // Splashes of colour already on them.
        for (let s = 0; s < 4; s++) dot(ctx, -8 + s * 6, -94 + (s % 2) * 14, 4, rgba(HOLI[(s + j * 2) % 6], 0.8))
        dot(ctx, 6, -124, 5, rgba(c, 0.7))
        if (throwing) {
          const a = throwT < 0.4 ? -1.2 : -0.2
          arm(ctx, [10, -98, 24 + Math.cos(a) * 10, -110 + Math.sin(a) * 10, 34 + Math.cos(a) * 18, -120 + Math.sin(a) * 18], 8, d.shirt)
          arm(ctx, [-10, -98, -24, -116, -26, -138], 8, d.shirt)
        } else {
          // A handful of colour held ready.
          arm(ctx, [10, -98, 22, -90, 30, -96], 8, d.shirt)
          dot(ctx, 32, -98, 6, c)
          arm(ctx, [-10, -98, -14, -78, -10, -62], 8, d.shirt)
        }
      })
    })
    // The clouds of colour: drifting puffs, or great bursts flung into the air.
    const puffs = throwing ? 14 : 5
    for (let k = 0; k < puffs; k++) {
      const q = (p * (throwing ? 1.5 : 0.5) + k / puffs) % 1
      const from = k % 2 ? 80 : 190
      const dir = k % 2 ? 1 : -1
      const x = from + dir * (20 + q * (throwing ? 90 : 30)) + Math.sin(k) * 10
      const y = g - 130 - q * (throwing ? 90 : 40) + Math.cos(k * 1.7) * 20
      const r = 8 + q * (throwing ? 26 : 12)
      ctx.fillStyle = rgba(HOLI[k % 6], (1 - q) * 0.55)
      circle(ctx, x, y, r)
      ctx.fill()
    }
  }
}

// -- the alebrije ---------------------------------------------------------------------------------------------------

function alebrije(waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 192
    const bob = Math.sin(p) * 4
    const x = 130
    const y = g - 70 + bob
    const s = Math.sin(p * 2)
    // A jaguar-ish spirit animal with butterfly wings, painted all over in bright patterns, prowling along.
    const wing = waving ? 0.6 + Math.sin(p * 3) * 0.5 : 0.3 + Math.sin(p) * 0.15
    for (const side of [0, 1]) {
      ctx.save()
      ctx.translate(x - 6, y - 16)
      ctx.rotate(-0.4 - wing * (side ? 1 : 0.6))
      ctx.fillStyle = side ? color2 : shade(color2, -0.2)
      ctx.beginPath()
      ctx.ellipse(-30, -18, 36, 18, 0.3, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#fde68a'
      for (let k = 0; k < 4; k++) dot(ctx, -50 + k * 13, -20 + (k % 2) * 6, 4, k % 2 ? '#fde68a' : '#f472b6')
      ctx.restore()
    }
    // Legs.
    ctx.strokeStyle = color
    ctx.lineWidth = 9
    for (const [lx, k] of [[x - 38, s], [x - 28, -s], [x + 24, -s], [x + 34, s]] as const) {
      ctx.beginPath()
      ctx.moveTo(lx, y + 10)
      ctx.lineTo(lx + k * 12, g - 4)
      ctx.stroke()
    }
    ctx.fillStyle = color
    ellipse(ctx, x, y, 50, 22)
    ctx.fill()
    // The tail curling up.
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(x - 46, y - 6)
    ctx.bezierCurveTo(x - 80, y - 10, x - 80, y - 50, x - 62, y - 54 + Math.sin(p * 2) * 6)
    ctx.stroke()
    // Patterns: stripes, dots and zigzags in every colour.
    const pats = ['#facc15', '#f472b6', '#4ade80', '#60a5fa', '#f8fafc']
    for (let k = 0; k < 6; k++) {
      ctx.strokeStyle = pats[k % 5]
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(x - 36 + k * 13, y - 18)
      ctx.lineTo(x - 30 + k * 13, y - 6)
      ctx.lineTo(x - 36 + k * 13, y + 6)
      ctx.stroke()
      dot(ctx, x - 30 + k * 13, y + 14, 2.5, pats[(k + 2) % 5])
    }
    // The head with big eyes and a grin.
    const hx = x + 54
    const hy = y - 18
    ctx.fillStyle = color
    circle(ctx, hx, hy, 20)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(hx - 12, hy - 14)
    ctx.lineTo(hx - 8, hy - 32)
    ctx.lineTo(hx, hy - 18)
    ctx.moveTo(hx + 4, hy - 18)
    ctx.lineTo(hx + 12, hy - 32)
    ctx.lineTo(hx + 14, hy - 12)
    ctx.fill()
    dot(ctx, hx + 6, hy - 4, 6, '#fde68a')
    dot(ctx, hx + 7, hy - 4, 3, '#111')
    ctx.strokeStyle = '#f8fafc'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(hx + 10, hy + 6, 7, 0.2, Math.PI - 0.6)
    ctx.stroke()
    for (let k = 0; k < 3; k++) dot(ctx, hx - 10 + k * 5, hy + 10, 2, pats[k])
    if (waving) for (let k = 0; k < 6; k++) {
      const q = ((f / frames) * 2 + k / 6) % 1
      dot(ctx, x - 40 + k * 20, y - 40 - q * 50, 2.5, rgba(pats[k % 5], 1 - q))
    }
  }
}

// -- papel picado -----------------------------------------------------------------------------------------------------

/** Level: strings of cut-paper banners going up one after another as people come, fluttering. */
function papelPicado(ctx: Ctx, f: number, n: number, { color, color2 }: SpriteColors) {
  const k = f / (n - 1)
  const strings = 3
  const cols = ['#f472b6', '#facc15', '#4ade80', '#60a5fa', '#fb923c', '#c084fc', color, color2]
  for (let s = 0; s < strings; s++) {
    const shown = Math.max(0, Math.min(1, k * strings - s))
    if (shown <= 0) break
    const y0 = 30 + s * 60
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(10, y0)
    ctx.quadraticCurveTo(150, y0 + 26, 290, y0)
    ctx.stroke()
    const flags = Math.round(9 * shown)
    for (let q = 0; q < flags; q++) {
      const t = (q + 0.5) / 9
      const x = 10 + t * 280
      const y = y0 + Math.sin(t * Math.PI) * 13 + 1
      const flutter = Math.sin(f * 1.7 + q + s) * 0.08
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(flutter)
      ctx.fillStyle = cols[(q + s * 3) % cols.length]
      ctx.beginPath()
      ctx.moveTo(-13, 0)
      ctx.lineTo(13, 0)
      ctx.lineTo(13, 30)
      for (let z = 0; z < 5; z++) ctx.lineTo(13 - z * 6.5 - 3.25, 34 + (z % 2) * -4)
      ctx.lineTo(-13, 30)
      ctx.closePath()
      ctx.fill()
      // Cut-out holes: a flower and little diamonds.
      ctx.globalCompositeOperation = 'destination-out'
      circle(ctx, 0, 13, 4)
      ctx.fill()
      for (let a = 0; a < 4; a++) {
        ctx.beginPath()
        ctx.ellipse(Math.cos((a / 4) * TAU) * 7, 13 + Math.sin((a / 4) * TAU) * 7, 2.5, 1.5, (a / 4) * TAU, 0, TAU)
        ctx.fill()
      }
      for (const dx of [-8, 8]) {
        ctx.beginPath()
        ctx.moveTo(dx, 23)
        ctx.lineTo(dx + 2, 26)
        ctx.lineTo(dx, 29)
        ctx.lineTo(dx - 2, 26)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
      ctx.restore()
    }
  }
}

// -- the step team -------------------------------------------------------------------------------------------------

function stepTeam(stepping: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 232
    // Three steppers in matching shirts, stomping, clapping and slapping in unison.
    const beat = Math.floor(p * 8) % 4
    const skins = [BROWN, DEEP, TAN]
    for (let j = 0; j < 3; j++) {
      const x = 60 + j * 70
      const d: Dress = { skin: skins[j], hair: '#1c1917', shirt: color, pants: '#d6c29a', shoes: '#f8fafc' }
      const stomp = stepping && beat % 2 === 0
      const lift = stomp ? 12 : 0
      person(ctx, x, g, 0.95, 1, d, { stride: stepping ? (beat === 1 ? 0.6 : beat === 3 ? -0.6 : 0.1) : 0, open: stepping && beat === 2 ? 0.7 : 0 }, () => {
        ctx.fillStyle = color2
        ctx.font = 'bold 14px sans-serif'
        ctx.fillText('★', -6, -74)
        if (!stepping) {
          // Ready: arms crossed, chin up.
          arm(ctx, [-10, -98, 4, -84, 14, -88], 8, d.shirt)
          arm(ctx, [10, -98, -4, -80, -14, -86], 8, shade(d.shirt, -0.1))
          return
        }
        if (beat === 0) {
          arm(ctx, [-10, -98, -24, -80, -14 - lift * 0, -54], 8, d.shirt)
          arm(ctx, [10, -98, 24, -80, 14, -54], 8, d.shirt)
        } else if (beat === 1) {
          arm(ctx, [-10, -98, -4, -116, 2, -128], 8, d.shirt)
          arm(ctx, [10, -98, 8, -116, 4, -128], 8, d.shirt)
        } else if (beat === 2) {
          arm(ctx, [-10, -98, -30, -110, -40, -130], 8, d.shirt)
          arm(ctx, [10, -98, 30, -110, 40, -130], 8, d.shirt)
        } else {
          arm(ctx, [-10, -98, 0, -74, 10, -50], 8, d.shirt)
          arm(ctx, [10, -98, 18, -76, 20, -56], 8, d.shirt)
        }
      })
      if (stepping && (beat === 1 || beat === 0)) {
        // The clap or the stomp, shown as little bursts.
        const by = beat === 1 ? g - 124 : g - 4
        for (let s = 0; s < 5; s++) {
          const a = (s / 5) * Math.PI + Math.PI
          ctx.strokeStyle = rgba('#fde68a', 0.9)
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(x + 3 + Math.cos(a) * 8, by + Math.sin(a) * 8 * (beat === 1 ? 1 : 0.5))
          ctx.lineTo(x + 3 + Math.cos(a) * 16, by + Math.sin(a) * 16 * (beat === 1 ? 1 : 0.5))
          ctx.stroke()
        }
      }
    }
  }
}

// -- Kwanzaa gifts ---------------------------------------------------------------------------------------------------

function zawadi(giving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 232
    // A child on the mkeka mat handing a handmade gift (a book with a kente ribbon) to her grandfather.
    ctx.fillStyle = '#d6c29a'
    rr(ctx, 30, g - 8, 230, 8, 2)
    const kente = ['#16a34a', '#facc15', '#dc2626', '#1f2937']
    for (let k = 0; k < 23; k++) {
      ctx.fillStyle = kente[k % 4]
      ctx.fillRect(32 + k * 10, g - 7, 5, 6)
    }
    const pop: Dress = { skin: DEEP, hair: '#e5e7eb', shirt: color, pants: '#94a3b8' }
    seated(ctx, 70, g, 46, 0.95, 1, pop, giving ? 0.6 : 0)
    ctx.fillStyle = color2
    ctx.beginPath()
    const hy = g - 46 - 62 * 0.95
    ctx.ellipse(72, hy - 12, 15, 9, 0, Math.PI, TAU)
    ctx.fill()
    ctx.fillStyle = '#d6c29a'
    rr(ctx, 44, g - 46, 50, 46, 4)
    const kid: Dress = { skin: BROWN, hair: '#1c1917', shirt: color2, pants: '#f8fafc' }
    const reach = giving ? Math.min(1, p / 0.4) : 0
    person(ctx, 176 - reach * 30, g, 0.78, -1, kid, { skirt: true, open: giving ? 0.6 : 0 }, () => {
      // Puffs of hair, and the gift held behind her back or held out.
      dot(ctx, -14, -134, 8, '#1c1917')
      dot(ctx, 18, -134, 8, '#1c1917')
      if (giving) {
        arm(ctx, [-10, -98, -28, -100, -46, -104], 8, kid.shirt)
        arm(ctx, [10, -98, -10, -96, -40, -100], 8, kid.shirt)
        ctx.fillStyle = '#f8fafc'
        rr(ctx, -66, -116, 26, 20, 2)
        ctx.fillStyle = kente[2]
        ctx.fillRect(-54, -116, 4, 20)
        ctx.fillStyle = kente[1]
        ctx.fillRect(-66, -108, 26, 4)
      } else {
        arm(ctx, [-10, -98, 0, -80, 14, -76], 8, kid.shirt)
        arm(ctx, [10, -98, 18, -82, 18, -74], 8, kid.shirt)
        ctx.fillStyle = '#f8fafc'
        rr(ctx, 12, -88, 18, 14, 2)
      }
    })
    if (giving) {
      // Grandpa's hands out to take it, and a smile.
      arm(ctx, [80, g - 88, 100, g - 92, 118, g - 96], 8, pop.shirt)
      if (p > 0.5) for (let k = 0; k < 5; k++) {
        const q = (p * 2 + k / 5) % 1
        dot(ctx, 100 + k * 12, g - 130 - q * 40, 2.5, rgba(kente[k % 3], 1 - q))
      }
    }
    // The kinara on a low table behind them.
    ctx.fillStyle = '#a16207'
    rr(ctx, 230, g - 70, 50, 6, 2)
    ctx.fillRect(252, g - 64, 6, 56)
    const candles = ['#16a34a', '#16a34a', '#16a34a', '#1f2937', '#dc2626', '#dc2626', '#dc2626']
    candles.forEach((c, k) => {
      ctx.fillStyle = c
      rr(ctx, 232 + k * 7, g - 92, 5, 22, 1)
      dot(ctx, 234.5 + k * 7, g - 96, 2.2, '#fbbf24')
    })
  }
}

// -- the dragon dance ------------------------------------------------------------------------------------------------

function dragonDance(waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 212
    const segs = 6
    const pts: Array<[number, number]> = []
    for (let k = 0; k < segs; k++) {
      const x = 40 + k * 46
      const y = g - 120 + Math.sin(p * 2 - k * 0.9) * (waving ? 30 : 16)
      pts.push([x, y])
    }
    // The dancers underneath, each holding a pole.
    pts.forEach(([x, y], k) => {
      const d: Dress = { skin: [TAN, PEACH, BROWN][k % 3], hair: '#1c1917', shirt: color2, pants: '#fde68a' }
      const s = Math.sin(p * 2 - k * 0.9)
      person(ctx, x, g, 0.7, 1, d, { stride: s * 0.7 }, () => {
        arm(ctx, [10, -98, 14, -112, 4, -128 + (y - (g - 120)) / 0.7 * 0.2], 8, d.shirt)
      })
      ctx.strokeStyle = '#d6c29a'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(x + 3, g - 88)
      ctx.lineTo(x, y + 12)
      ctx.stroke()
    })
    // The body: a scaly ribbon through the poles, with a fringe underneath.
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#fde68a'
    ctx.lineWidth = 6
    ctx.beginPath()
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y + 14) : ctx.moveTo(x - 20, y + 14)))
    ctx.stroke()
    ctx.strokeStyle = color
    ctx.lineWidth = 26
    ctx.beginPath()
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x - 24, y)))
    ctx.stroke()
    ctx.strokeStyle = color2
    ctx.lineWidth = 4
    ctx.setLineDash([6, 6])
    ctx.beginPath()
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y - 6) : ctx.moveTo(x - 24, y - 6)))
    ctx.stroke()
    ctx.setLineDash([])
    // Spines along the back.
    pts.forEach(([x, y]) => {
      ctx.fillStyle = '#fde68a'
      ctx.beginPath()
      ctx.moveTo(x - 8, y - 12)
      ctx.lineTo(x, y - 24)
      ctx.lineTo(x + 8, y - 12)
      ctx.fill()
    })
    // The head at the front, its jaw opening, whiskers trailing, and the tail at the back.
    const [hx, hy] = pts[segs - 1]
    const jaw = waving ? 0.25 + Math.sin(p * 4) * 0.15 : 0.08
    ctx.fillStyle = color
    rr(ctx, hx, hy - 20, 40, 26, 8)
    ctx.save()
    ctx.translate(hx + 4, hy + 4)
    ctx.rotate(jaw)
    rr(ctx, 0, 0, 36, 10, 4)
    ctx.fillStyle = '#f8fafc'
    for (let t = 0; t < 4; t++) ctx.fillRect(8 + t * 7, -2, 3, 4)
    ctx.restore()
    dot(ctx, hx + 24, hy - 10, 6, '#f8fafc')
    dot(ctx, hx + 26, hy - 10, 3, '#111')
    ctx.strokeStyle = '#fde68a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(hx + 36, hy - 4)
    ctx.quadraticCurveTo(hx + 56, hy - 10 + Math.sin(p * 3) * 6, hx + 64, hy + 6)
    ctx.moveTo(hx + 16, hy - 20)
    ctx.quadraticCurveTo(hx + 4, hy - 40, hx - 6, hy - 36)
    ctx.stroke()
    ctx.fillStyle = '#fde68a'
    ctx.beginPath()
    ctx.moveTo(hx + 10, hy - 20)
    ctx.lineTo(hx + 6, hy - 34)
    ctx.lineTo(hx + 18, hy - 22)
    ctx.fill()
    const [tx, ty] = pts[0]
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(tx - 24, ty - 10)
    ctx.lineTo(tx - 48, ty - 24 + Math.sin(p * 3) * 6)
    ctx.lineTo(tx - 40, ty)
    ctx.lineTo(tx - 48, ty + 20)
    ctx.lineTo(tx - 24, ty + 10)
    ctx.fill()
    // The pearl it chases, on a pole carried ahead.
    if (waving) {
      ctx.strokeStyle = '#d6c29a'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(hx + 76, g - 70)
      ctx.lineTo(hx + 76, hy - 4)
      ctx.stroke()
      dot(ctx, hx + 76, hy - 12, 10, '#fef9c3')
    }
    ctx.lineCap = 'butt'
  }
}

// -- the kumquat tree -----------------------------------------------------------------------------------------------

function tangerineTree(picking: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 242
    // A potted kumquat tree hung with red envelopes, and a child picking two oranges to give for luck.
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(120, g - 50)
    ctx.lineTo(180, g - 50)
    ctx.lineTo(172, g)
    ctx.lineTo(128, g)
    ctx.fill()
    ctx.fillStyle = '#fde68a'
    ctx.fillRect(124, g - 40, 52, 4)
    ctx.fillStyle = '#78350f'
    ctx.fillRect(146, g - 110, 8, 62)
    for (const [cx, cy, r] of [[150, g - 140, 48], [118, g - 120, 30], [182, g - 122, 30], [150, g - 180, 26]] as const) {
      ctx.fillStyle = cy < g - 160 ? '#15803d' : '#16a34a'
      circle(ctx, cx, cy, r)
      ctx.fill()
    }
    const fruit: Array<[number, number]> = [[118, g - 120], [140, g - 160], [176, g - 130], [160, g - 112], [130, g - 140], [190, g - 116], [150, g - 186], [102, g - 112]]
    const taken = picking ? Math.min(2, Math.floor(p * 3)) : 0
    fruit.forEach(([fx, fy], k) => {
      if (k < taken) return
      dot(ctx, fx, fy, 6, color)
      dot(ctx, fx - 2, fy - 2, 1.6, rgba('#fff', 0.7))
    })
    // Red envelopes hanging.
    for (const [ex, ey] of [[128, g - 104], [170, g - 150], [196, g - 100]] as const) {
      const sw = Math.sin(p * TAU + ex) * 0.1
      ctx.save()
      ctx.translate(ex, ey)
      ctx.rotate(sw)
      ctx.fillStyle = '#dc2626'
      rr(ctx, -6, 0, 12, 18, 1)
      ctx.fillStyle = '#fde68a'
      ctx.fillRect(-4, 6, 8, 2)
      ctx.restore()
    }
    const kid: Dress = { skin: PEACH, hair: '#1c1917', shirt: '#dc2626', pants: '#f8fafc' }
    person(ctx, 84, g, 0.85, 1, kid, { open: picking ? 0.6 : 0 }, () => {
      // Hair in two buns.
      dot(ctx, -12, -132, 7, '#1c1917')
      dot(ctx, 16, -132, 7, '#1c1917')
      ctx.fillStyle = '#fde68a'
      ctx.fillRect(-6, -84, 16, 3)
      if (picking) {
        // Reaching up, then holding out a kumquat in each hand.
        if (p < 0.66) {
          arm(ctx, [10, -98, 26, -116, 38, -136], 8, kid.shirt)
          arm(ctx, [-10, -98, -14, -78, -10, -62], 8, kid.shirt)
        } else {
          arm(ctx, [10, -98, 26, -104, 40, -110], 8, kid.shirt)
          arm(ctx, [-10, -98, 4, -106, 30, -112], 8, kid.shirt)
          dot(ctx, 42, -114, 6, color)
          dot(ctx, 30, -116, 6, color)
        }
      } else {
        arm(ctx, [10, -98, 14, -78, 10, -62], 8, kid.shirt)
        arm(ctx, [-10, -98, -14, -78, -10, -62], 8, kid.shirt)
      }
    })
  }
}

// -- the Mardi Gras float -------------------------------------------------------------------------------------------

function mardiGrasFloat(throwing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 202
    // A float shaped like a big jester's crown on wheels, two masked riders throwing beads.
    ctx.fillStyle = '#facc15'
    rr(ctx, 20, g - 60, 250, 40, 6)
    ctx.fillStyle = color
    for (let k = 0; k < 10; k++) {
      ctx.beginPath()
      ctx.moveTo(20 + k * 25, g - 60)
      ctx.lineTo(32 + k * 25, g - 80)
      ctx.lineTo(45 + k * 25, g - 60)
      ctx.fill()
      dot(ctx, 32 + k * 25, g - 82, 4, k % 2 ? '#16a34a' : '#facc15')
    }
    ctx.fillStyle = color2
    ctx.fillRect(20, g - 34, 250, 6)
    for (let k = 0; k < 12; k++) {
      ctx.fillStyle = k % 2 ? color : '#facc15'
      ctx.beginPath()
      ctx.moveTo(22 + k * 20.5, g - 20)
      ctx.lineTo(32 + k * 20.5, g - 10)
      ctx.lineTo(42 + k * 20.5, g - 20)
      ctx.fill()
    }
    wheel(ctx, 50, g - 10, 10, (f / frames) * TAU * 2, '#e2e8f0')
    wheel(ctx, 240, g - 10, 10, (f / frames) * TAU * 2, '#e2e8f0')
    const riders: Array<[number, Dress]> = [
      [90, { skin: TAN, hair: '#1c1917', shirt: color, pants: color }],
      [190, { skin: PEACH, hair: '#ca8a04', shirt: '#16a34a', pants: '#16a34a' }],
    ]
    riders.forEach(([x, d], j) => {
      const t = throwing ? (p * 2 + j * 0.5) % 1 : 0
      person(ctx, x, g - 80, 0.8, 1, d, { open: throwing ? 0.6 : 0 }, () => {
        // Feathered mask.
        ctx.fillStyle = j ? '#facc15' : '#16a34a'
        rr(ctx, -10, -124, 30, 9, 4)
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.moveTo(-12, -126)
        ctx.quadraticCurveTo(-24, -156, -10, -160)
        ctx.quadraticCurveTo(-8, -140, -4, -126)
        ctx.fill()
        // Strands of beads round the neck.
        for (let b = 0; b < 3; b++) {
          ctx.strokeStyle = ['#facc15', '#16a34a', '#a855f7'][b]
          ctx.lineWidth = 2.5
          ctx.beginPath()
          ctx.arc(2, -100, 10 + b * 4, 0.2, Math.PI - 0.2)
          ctx.stroke()
        }
        if (throwing) {
          const a = t < 0.3 ? -2.2 : -0.6
          arm(ctx, [10, -98, 20 + Math.cos(a) * 12, -104 + Math.sin(a) * 12, 26 + Math.cos(a) * 24, -110 + Math.sin(a) * 24], 8, d.shirt)
          arm(ctx, [-10, -98, -22, -116, -24, -136], 8, d.shirt)
        } else {
          arm(ctx, [10, -98, 22, -110, 22 + Math.sin(p * TAU * 2 + j) * 6, -130], 8, d.shirt)
          arm(ctx, [-10, -98, -14, -78, -10, -62], 8, d.shirt)
        }
      })
      if (throwing && t >= 0.3) {
        // A strand of beads sailing out in an arc.
        const q = (t - 0.3) / 0.7
        const bx = x + 26 + q * 120
        const by = g - 190 - Math.sin(q * Math.PI) * 50 + q * 120
        ctx.strokeStyle = ['#a855f7', '#facc15', '#16a34a'][j + (Math.floor(p * 4) % 2)]
        ctx.lineWidth = 3
        ctx.setLineDash([3, 2])
        ctx.beginPath()
        ctx.ellipse(bx, by, 12, 7, q * 6, 0, TAU)
        ctx.stroke()
        ctx.setLineDash([])
      }
    })
  }
}

// -- the leprechaun on the rainbow ---------------------------------------------------------------------------------

function rainbowLeprechaun(sliding: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 232
    // The rainbow arching down into the pot of gold.
    const bands = ['#ef4444', '#fb923c', '#facc15', '#4ade80', '#60a5fa', '#a78bfa']
    const cx = 160
    const cy = g - 10
    bands.forEach((c, k) => {
      ctx.strokeStyle = rgba(c, 0.85)
      ctx.lineWidth = 9
      ctx.beginPath()
      ctx.arc(cx, cy, 130 - k * 9, Math.PI, TAU)
      ctx.stroke()
    })
    // The pot.
    ctx.fillStyle = '#334155'
    ctx.beginPath()
    ctx.ellipse(270, g - 24, 28, 24, 0, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#475569'
    rr(ctx, 240, g - 50, 60, 8, 3)
    for (let k = 0; k < 7; k++) dot(ctx, 250 + (k % 4) * 12, g - 54 - Math.floor(k / 4) * 7, 6, '#facc15')
    // The leprechaun: perched at the top waiting, or whizzing down the rainbow and landing in the gold.
    const r = 130 - 2.5 * 9
    let a: number
    let land = 0
    if (!sliding) a = Math.PI * 1.5 - 0.15 + Math.sin(p * TAU) * 0.03
    else {
      const q = Math.min(1, p / 0.6)
      a = Math.PI * 1.35 + q * q * Math.PI * 0.58
      land = p > 0.6 ? (p - 0.6) / 0.4 : 0
    }
    const lx = sliding && land > 0 ? 268 : cx + Math.cos(a) * r
    const ly = sliding && land > 0 ? g - 70 - Math.abs(Math.sin(land * Math.PI * 2)) * 20 : cy + Math.sin(a) * r - 6
    ctx.save()
    ctx.translate(lx, ly)
    if (sliding && land === 0) ctx.rotate(a + Math.PI / 2)
    // Body, beard, hat with a buckle.
    ctx.fillStyle = color
    rr(ctx, -9, -28, 18, 22, 5)
    ctx.strokeStyle = color
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(-4, -6)
    ctx.lineTo(-8, 2)
    ctx.moveTo(4, -6)
    ctx.lineTo(10, 0)
    ctx.stroke()
    dot(ctx, -8, 3, 3, '#1f2937')
    dot(ctx, 11, 1, 3, '#1f2937')
    head(ctx, 0, -38, 10, PEACH, 1, { open: sliding ? 0.9 : 0.2 })
    ctx.fillStyle = '#fb923c'
    ctx.beginPath()
    ctx.arc(1, -34, 9, 0.1, Math.PI - 0.1)
    ctx.fill()
    ctx.fillStyle = color
    rr(ctx, -10, -66, 20, 20, 2)
    rr(ctx, -15, -48, 30, 5, 2)
    ctx.fillStyle = color2
    ctx.fillRect(-10, -54, 20, 4)
    ctx.fillStyle = '#facc15'
    ctx.fillRect(-3, -55, 6, 6)
    if (sliding) {
      arm(ctx, [-8, -24, -18, -34, -20, -46], 4, color)
      arm(ctx, [8, -24, 18, -34, 20, -46], 4, color)
    } else {
      arm(ctx, [8, -24, 14, -16, 8, -10], 4, color)
      ctx.strokeStyle = '#78350f'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-10, -18)
      ctx.lineTo(-20, -24)
      ctx.stroke()
      dot(ctx, -21, -25, 2, '#e2e8f0')
    }
    ctx.restore()
    if (sliding && land > 0) {
      for (let k = 0; k < 8; k++) {
        const t = (land * 1.4 + k / 8) % 1
        dot(ctx, 270 + Math.cos(k) * 40 * t, g - 60 - Math.sin((k / 8) * Math.PI) * 50 * t + t * t * 30, 4, rgba('#facc15', 1 - t))
      }
    }
  }
}

const BUBBLE = { id: 'bubble', frames: 1, w: 360, h: 140 }

export const HERITAGE_ROWS: Record<string, SpriteRow[]> = {
  'diya-lighter': [
    { id: 'main', frames: 8, w: 300, h: 230, paint: diyaLighter },
    SPARKLE,
  ],
  'mithai-box': [
    { id: 'main', frames: 6, w: 220, h: 250, paint: mithaiBox(false) },
    { id: 'act', frames: 8, w: 220, h: 250, paint: mithaiBox(true) },
    { ...BUBBLE, paint: saying('Happy Diwali!') },
    SPARKLE,
  ],
  'holi-colors': [
    { id: 'main', frames: 8, w: 270, h: 240, paint: holiColors(false) },
    { id: 'act', frames: 10, w: 270, h: 240, paint: holiColors(true) },
    { ...BUBBLE, paint: saying('Happy Holi!') },
    SPARKLE,
  ],
  alebrije: [
    { id: 'main', frames: 8, w: 270, h: 200, paint: alebrije(false) },
    { id: 'wave', frames: 8, w: 270, h: 200, paint: alebrije(true) },
    SPARKLE,
  ],
  'papel-picado': [
    { id: 'main', frames: 9, w: 300, h: 220, paint: papelPicado },
    SPARKLE,
  ],
  'step-team': [
    { id: 'main', frames: 4, w: 260, h: 240, paint: stepTeam(false) },
    { id: 'act', frames: 16, w: 260, h: 240, paint: stepTeam(true) },
    { ...BUBBLE, paint: saying('Happy Juneteenth!') },
    SPARKLE,
  ],
  zawadi: [
    { id: 'main', frames: 6, w: 290, h: 240, paint: zawadi(false) },
    { id: 'act', frames: 10, w: 290, h: 240, paint: zawadi(true) },
    { ...BUBBLE, paint: saying('Habari gani!') },
    SPARKLE,
  ],
  'dragon-dance': [
    { id: 'main', frames: 10, w: 340, h: 220, paint: dragonDance(false) },
    { id: 'wave', frames: 10, w: 340, h: 220, paint: dragonDance(true) },
    SPARKLE,
  ],
  'tangerine-tree': [
    { id: 'main', frames: 6, w: 240, h: 250, paint: tangerineTree(false) },
    { id: 'act', frames: 10, w: 240, h: 250, paint: tangerineTree(true) },
    { ...BUBBLE, paint: saying('Gong hei fat choy!') },
    SPARKLE,
  ],
  'mardi-gras-float': [
    { id: 'main', frames: 8, w: 300, h: 210, paint: mardiGrasFloat(false) },
    { id: 'wave', frames: 10, w: 300, h: 210, paint: mardiGrasFloat(true) },
    SPARKLE,
  ],
  'rainbow-leprechaun': [
    { id: 'main', frames: 6, w: 310, h: 240, paint: rainbowLeprechaun(false) },
    { id: 'act', frames: 12, w: 310, h: 240, paint: rainbowLeprechaun(true) },
    { ...BUBBLE, paint: saying('Top o’ the mornin’!') },
    SPARKLE,
  ],
}
