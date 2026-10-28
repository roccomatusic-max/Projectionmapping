/**
 * The last of the holiday folk: a Pi Day baker, an Earth Day birdhouse that birds move into, a thank-you letter
 * posted for Veterans Day, Lincoln tipping his hat, a New Year's resolution list that never ends, Grandma making
 * tamales, a haunted doorbell, a Halloween candy swap, a child trimming the tree, a secret Valentine admirer,
 * an Easter egg-and-spoon race, a Fourth of July seed-spitting contest, Paul Revere's midnight ride, a Labor Day
 * hammock nap and a scout raising the flag.
 *
 * Painted the same way as sprites.ts: facing right, one frame at a time, into a cell of w by h design units.
 */

import { arm, dot, head, person, rr, standing, type Dress } from './figures'
import {
  circle, ellipse, heartPath, rgba, saying, shade, SPARKLE, TAU,
  type Ctx, type SpriteColors, type SpriteRow,
} from './sprites'

const PEACH = '#f5c9a0'
const TAN = '#c68a5a'
const BROWN = '#8d5a3b'

// -- Pi Day -------------------------------------------------------------------------------------------------------

const PI_DIGITS = '3.14159265358979323846264338327950288419716939937510'

function piDayPie(cutting: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 232
    // A little table with a big round pie, its lattice top and a π cut into the crust.
    ctx.fillStyle = '#e2e8f0'
    rr(ctx, 120, g - 70, 120, 8, 3)
    ctx.fillRect(130, g - 62, 6, 62)
    ctx.fillRect(224, g - 62, 6, 62)
    const px = 180
    const py = g - 78
    const slice = cutting ? Math.min(1, p / 0.4) : 0
    ctx.fillStyle = shade(color, -0.15)
    ellipse(ctx, px, py + 4, 46, 12)
    ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.ellipse(px, py, 44, 11, 0, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = '#fde68a'
    ctx.lineWidth = 2
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath()
      ctx.moveTo(px + k * 14 - 6, py - 9)
      ctx.lineTo(px + k * 14 + 6, py + 9)
      ctx.stroke()
    }
    ctx.fillStyle = color2
    ctx.font = 'bold 18px serif'
    ctx.fillText('π', px - 5, py + 5)
    // The slice lifted out on the server, from the near side of the pie.
    const sx = px - 26
    const sy = py - slice * 40
    if (cutting) {
      ctx.fillStyle = '#e2e8f0'
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px - 40, py - 5)
      ctx.lineTo(px - 38, py + 6)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(sx - 14, sy - 4)
      ctx.lineTo(sx + 16, sy)
      ctx.lineTo(sx - 12, sy + 6)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#fde68a'
      ctx.fillRect(sx - 16, sy - 4, 5, 10)
    }
    // The baker in a tall chef's hat, holding the server.
    const bx = 106
    const d: Dress = { skin: PEACH, hair: '#ca8a04', shirt: '#f8fafc', pants: '#94a3b8' }
    person(ctx, bx, g, 0.95, 1, d, { open: cutting ? 0.7 : 0.1 }, () => {
      ctx.fillStyle = '#f8fafc'
      rr(ctx, -12, -158, 28, 26, 8)
      for (const [x, y] of [[-8, -158], [4, -162], [14, -156]] as const) dot(ctx, x, y, 8, '#f8fafc')
      ctx.fillStyle = color2
      ctx.fillRect(-12, -136, 28, 4)
      const hx = cutting ? (sx - 22 - bx) / 0.95 : 36
      const hy = cutting ? (sy + 2 - g) / 0.95 : -86
      arm(ctx, [10, -98, 22, (hy - 98) / 2 + 4, hx, hy], 8, d.shirt)
      ctx.strokeStyle = '#cbd5e1'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(hx, hy)
      ctx.lineTo(hx + 18, hy + (cutting ? 0 : -6 + Math.sin(p * TAU) * 3))
      ctx.stroke()
      arm(ctx, [-10, -98, -14, -78, -10, -62], 8, d.shirt)
    })
    // The digits of π running along a ribbon over the top, faster when there's pie being served.
    ctx.font = 'bold 15px monospace'
    const off = Math.floor(p * (cutting ? 24 : 8))
    for (let k = 0; k < 14; k++) {
      const ch = PI_DIGITS[(k + off) % PI_DIGITS.length]
      ctx.fillStyle = rgba(k % 2 ? color2 : '#fde68a', 0.4 + 0.6 * Math.sin(((k + 0.5) / 14) * Math.PI))
      ctx.fillText(ch, 40 + k * 16, 34 + Math.sin(k * 0.6 + p * TAU) * 6)
    }
  }
}

// -- the birdhouse --------------------------------------------------------------------------------------------------

function bird(ctx: Ctx, x: number, y: number, flap: number, color: string, dir = 1) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(dir, 1)
  ctx.fillStyle = color
  ellipse(ctx, 0, 0, 10, 7)
  ctx.fill()
  circle(ctx, 8, -5, 5)
  ctx.fill()
  ctx.fillStyle = '#fbbf24'
  ctx.beginPath()
  ctx.moveTo(12, -6)
  ctx.lineTo(18, -4)
  ctx.lineTo(12, -2)
  ctx.fill()
  dot(ctx, 9, -6, 1.2, '#111')
  ctx.fillStyle = shade(color, -0.15)
  ctx.beginPath()
  ctx.moveTo(-2, -2)
  ctx.lineTo(-12, -2 - flap * 10)
  ctx.lineTo(4, -4)
  ctx.fill()
  ctx.restore()
}

/** Level: a kid builds a birdhouse as people come, piece by piece, then paints it and two birds move in. */
function birdhouseBuilder(ctx: Ctx, f: number, n: number, { color, color2 }: SpriteColors) {
  const k = f / (n - 1)
  const g = 232
  const hx = 190
  // The post.
  ctx.fillStyle = '#d6c29a'
  ctx.fillRect(hx - 4, g - 110 * Math.min(1, k / 0.15), 8, 110 * Math.min(1, k / 0.15))
  if (k > 0.2) {
    const wall = Math.min(1, (k - 0.2) / 0.2)
    ctx.fillStyle = k > 0.6 ? color : '#e7d5b0'
    ctx.fillRect(hx - 26, g - 110 - 50 * wall, 52, 50 * wall)
  }
  if (k > 0.45) {
    ctx.fillStyle = k > 0.6 ? color2 : '#d6c29a'
    ctx.beginPath()
    ctx.moveTo(hx - 34, g - 158)
    ctx.lineTo(hx, g - 190)
    ctx.lineTo(hx + 34, g - 158)
    ctx.closePath()
    ctx.fill()
    dot(ctx, hx, g - 136, 9, '#475569')
    ctx.fillStyle = '#d6c29a'
    ctx.fillRect(hx - 1, g - 124, 3, 10)
    ctx.fillRect(hx - 6, g - 120, 13, 3)
  }
  if (k > 0.6) {
    // Painted flowers on the front.
    for (const [x, y] of [[-16, -122], [16, -124]] as const) {
      for (let a = 0; a < 5; a++) dot(ctx, hx + x + Math.cos((a / 5) * TAU) * 4, g + y + Math.sin((a / 5) * TAU) * 4, 2.5, '#fde68a')
      dot(ctx, hx + x, g + y, 2, '#fb923c')
    }
  }
  // The birds arrive: one lands on the perch, then its mate with a twig.
  if (k > 0.72) bird(ctx, hx + 10, g - 126, f % 2, '#60a5fa', 1)
  if (k > 0.88) {
    bird(ctx, hx - 20, g - 196, (f + 1) % 2, '#f472b6', 1)
    ctx.strokeStyle = '#d6c29a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(hx - 6, g - 199)
    ctx.lineTo(hx + 8, g - 204)
    ctx.stroke()
  }
  // The kid with a hammer (or a paintbrush once it's built), and a recycling-bin of offcuts.
  const d: Dress = { skin: TAN, hair: '#1c1917', shirt: '#4ade80', pants: '#93c5fd' }
  const swing = f % 2 ? -0.6 : 0.4
  person(ctx, 110, g, 0.9, 1, d, { open: k >= 1 ? 0.7 : 0.2 }, () => {
    ctx.fillStyle = '#fde68a'
    ctx.beginPath()
    ctx.arc(2, -126, 17, Math.PI, TAU)
    ctx.fill()
    rr(ctx, 2, -130, 26, 5, 2)
    if (k >= 1) {
      arm(ctx, [10, -98, 22, -118, 28, -140], 8, d.shirt)
      arm(ctx, [-10, -98, -22, -118, -28, -140], 8, d.shirt)
      return
    }
    const ex = 34 + Math.cos(swing) * 20
    const ey = -110 + Math.sin(swing) * 20
    arm(ctx, [10, -98, 28, -104, ex, ey], 8, d.shirt)
    ctx.strokeStyle = '#d6c29a'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex + 14, ey - 14)
    ctx.stroke()
    if (k > 0.6) dot(ctx, ex + 16, ey - 16, 4, color)
    else {
      ctx.fillStyle = '#cbd5e1'
      ctx.fillRect(ex + 10, ey - 22, 12, 6)
    }
    arm(ctx, [-10, -98, -14, -78, -10, -62], 8, d.shirt)
  })
  ctx.fillStyle = '#4ade80'
  rr(ctx, 20, g - 34, 30, 34, 3)
  ctx.fillStyle = '#f8fafc'
  ctx.font = 'bold 16px sans-serif'
  ctx.fillText('♻', 27, g - 12)
}

// -- the thank-you letter ---------------------------------------------------------------------------------------------

function thankYouLetter(posting: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 232
    // A mailbox on its post, its little flag going up once the letter's in.
    const mx = 200
    ctx.fillStyle = '#d6c29a'
    ctx.fillRect(mx - 4, g - 80, 8, 80)
    ctx.fillStyle = color2
    rr(ctx, mx - 30, g - 116, 60, 36, 14)
    ctx.fillStyle = shade(color2, -0.2)
    ctx.fillRect(mx - 30, g - 96, 60, 16)
    const up = posting && p > 0.55
    ctx.fillStyle = '#ef4444'
    ctx.save()
    ctx.translate(mx + 26, g - 98)
    ctx.rotate(up ? -Math.PI / 2 : 0)
    ctx.fillRect(0, -3, 22, 6)
    ctx.fillRect(16, -3, 8, 12)
    ctx.restore()
    // The kid, a letter covered in stars and stripes and a heart.
    const d: Dress = { skin: BROWN, hair: '#1c1917', shirt: color, pants: '#93c5fd' }
    const reach = posting ? Math.min(1, p / 0.5) : 0
    person(ctx, 110 + reach * 24, g, 0.85, 1, d, { open: posting ? 0.6 : 0, skirt: true }, () => {
      dot(ctx, -14, -132, 8, '#1c1917')
      dot(ctx, 18, -132, 8, '#1c1917')
      if (posting && p > 0.55) {
        // Letter in: a salute.
        arm(ctx, [10, -98, 22, -116, 8, -128], 8, d.shirt)
        arm(ctx, [-10, -98, -14, -78, -10, -62], 8, d.shirt)
        return
      }
      const lx = posting ? 30 + reach * 30 : 24
      const ly = posting ? -110 : -90
      arm(ctx, [10, -98, 22, ly + 4, lx, ly], 8, d.shirt)
      arm(ctx, [-10, -98, 4, -86, lx - 10, ly + 6], 8, d.shirt)
      ctx.fillStyle = '#f8fafc'
      rr(ctx, lx - 6, ly - 18, 34, 24, 2)
      ctx.fillStyle = '#ef4444'
      for (let k = 0; k < 3; k++) ctx.fillRect(lx + 10, ly - 14 + k * 6, 16, 2)
      ctx.fillStyle = '#60a5fa'
      ctx.fillRect(lx - 3, ly - 15, 11, 9)
      ctx.fillStyle = '#f472b6'
      heartPath(ctx, lx + 4, ly + 0, 5)
      ctx.fill()
    })
    if (posting && p > 0.55) {
      for (let k = 0; k < 6; k++) {
        const q = ((p - 0.55) * 2.2 + k / 6) % 1
        ctx.fillStyle = rgba(k % 2 ? '#f8fafc' : '#fde68a', 1 - q)
        ctx.font = '14px sans-serif'
        ctx.fillText('★', mx - 30 + k * 12, g - 130 - q * 40)
      }
    }
  }
}

// -- Lincoln ------------------------------------------------------------------------------------------------------

function lincolnHat(tipping: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 262
    const x = 120
    const d: Dress = { skin: PEACH, hair: '#78716c', shirt: color, pants: color, shoes: '#94a3b8' }
    const bow = tipping ? Math.sin(Math.min(1, p / 0.5) * Math.PI) * 0.12 : 0
    ctx.save()
    ctx.translate(x, g)
    ctx.rotate(bow)
    ctx.translate(-x, -g)
    // Tall and thin: a frock coat to the knees, a bow tie and the chin beard.
    standing(ctx, x, g, 1, d, { open: tipping ? 0.5 : 0 })
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x - 16, g - 100)
    ctx.lineTo(x + 16, g - 100)
    ctx.lineTo(x + 20, g - 40)
    ctx.lineTo(x - 20, g - 40)
    ctx.fill()
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(x - 5, g - 102)
    ctx.lineTo(x + 5, g - 102)
    ctx.lineTo(x, g - 80)
    ctx.fill()
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(x - 8, g - 104)
    ctx.lineTo(x + 8, g - 98)
    ctx.lineTo(x + 8, g - 104)
    ctx.lineTo(x - 8, g - 98)
    ctx.fill()
    ctx.fillStyle = '#78716c'
    ctx.beginPath()
    ctx.moveTo(x - 10, g - 114)
    ctx.quadraticCurveTo(x + 2, g - 90, x + 16, g - 114)
    ctx.quadraticCurveTo(x + 4, g - 104, x - 10, g - 114)
    ctx.fill()
    // The stovepipe hat: on his head, or raised high in a greeting.
    const raised = tipping && p > 0.15
    const hx = raised ? x + 34 : x + 2
    const hy = raised ? g - 176 - Math.sin(p * TAU * 2) * 4 : g - 132
    if (raised) {
      arm(ctx, [x + 10, g - 98, x + 30, g - 122, hx, hy + 6], 9, d.shirt)
      dot(ctx, hx, hy + 6, 5, d.skin)
    } else arm(ctx, [x + 10, g - 98, x + 14, g - 72, x + 12, g - 50], 9, d.shirt)
    arm(ctx, [x - 10, g - 98, x - 14, g - 72, x - 12, g - 50], 9, shade(d.shirt, -0.1))
    ctx.fillStyle = color2
    rr(ctx, hx - 22, hy - 2, 44, 6, 3)
    rr(ctx, hx - 14, hy - 46, 28, 46, 2)
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(hx - 14, hy - 10, 28, 4)
    ctx.restore()
  }
}

// -- New Year's resolutions ---------------------------------------------------------------------------------------

function resolutionList(reading: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 242
    const x = 100
    const d: Dress = { skin: TAN, hair: '#1c1917', shirt: color, pants: '#93c5fd' }
    // The list: a short note being written, or a scroll unrolling all the way to the ground and beyond.
    const unroll = reading ? Math.min(1, p / 0.5) : 0
    const top = g - 112
    const len = 30 + unroll * 150
    const sx = x + 34
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(sx, top)
    ctx.lineTo(sx + 44, top)
    ctx.lineTo(sx + 44 + unroll * 30, Math.min(g, top + len))
    if (top + len > g) ctx.lineTo(sx + 44 + unroll * 30 + (top + len - g), g)
    ctx.lineTo(sx + unroll * 30 + Math.max(0, top + len - g), g > top + len ? top + len : g)
    ctx.lineTo(sx + unroll * 30, Math.min(g, top + len))
    ctx.closePath()
    ctx.fill()
    if (top + len > g) {
      // The rest rolled up on the ground.
      ctx.fillStyle = '#e2e8f0'
      circle(ctx, sx + 74 + (top + len - g), g - 8, 8)
      ctx.fill()
    }
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 2
    const rows = Math.floor((Math.min(g, top + len) - top - 8) / 10)
    for (let r = 0; r < rows; r++) {
      const y = top + 8 + r * 10
      const k = (y - top) / Math.max(1, len)
      ctx.beginPath()
      ctx.moveTo(sx + 6 + k * unroll * 30, y)
      ctx.lineTo(sx + 26 + ((r * 7) % 12) + k * unroll * 30, y)
      ctx.stroke()
    }
    ctx.fillStyle = '#16a34a'
    ctx.font = 'bold 9px sans-serif'
    for (let r = 0; r < Math.min(rows, 8); r++) ctx.fillText('✓', sx + 34 + ((top + 8 + r * 10 - top) / Math.max(1, len)) * unroll * 30, top + 11 + r * 10)
    person(ctx, x, g, 0.9, 1, d, { open: reading ? 0.6 : 0 }, () => {
      // A party hat.
      ctx.fillStyle = color2
      ctx.beginPath()
      ctx.moveTo(-10, -132)
      ctx.lineTo(4, -170)
      ctx.lineTo(16, -132)
      ctx.fill()
      dot(ctx, 4, -172, 4, '#fde68a')
      arm(ctx, [10, -98, 24, -104, 36, -112], 8, d.shirt)
      if (reading) arm(ctx, [-10, -98, 8, -106, 34, -110], 8, d.shirt)
      else {
        // Writing, the pencil wiggling.
        const w = Math.sin(p * TAU * 4) * 3
        arm(ctx, [-10, -98, 10, -92, 36 + w, -94], 8, d.shirt)
        ctx.strokeStyle = '#fde68a'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(36 + w, -94)
        ctx.lineTo(44 + w, -104)
        ctx.stroke()
      }
    })
    if (reading) for (let k = 0; k < 10; k++) {
      const q = (p * 1.2 + k / 10) % 1
      ctx.fillStyle = rgba(['#f472b6', '#fde68a', '#60a5fa', '#4ade80'][k % 4], 1 - q * 0.6)
      ctx.fillRect(20 + ((k * 53) % 240), 20 + q * 180, 5, 3)
    }
  }
}

// -- making tamales -----------------------------------------------------------------------------------------------

function tamaleMaker(offering: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 242
    // The table, the big steamer pot and the stack of finished tamales.
    ctx.fillStyle = '#e2e8f0'
    rr(ctx, 110, g - 76, 160, 8, 3)
    ctx.fillRect(118, g - 68, 6, 68)
    ctx.fillRect(256, g - 68, 6, 68)
    ctx.fillStyle = color2
    rr(ctx, 200, g - 140, 56, 64, 6)
    ctx.fillStyle = shade(color2, 0.15)
    rr(ctx, 196, g - 146, 64, 8, 3)
    for (let s = 0; s < 3; s++) {
      const q = (p * 1.4 + s / 3) % 1
      ctx.strokeStyle = rgba('#f8fafc', (1 - q) * 0.75)
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(214 + s * 14, g - 152 - q * 40)
      ctx.quadraticCurveTo(222 + s * 14, g - 162 - q * 40, 214 + s * 14, g - 172 - q * 40)
      ctx.stroke()
    }
    const husk = (x: number, y: number, a: number) => {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(a)
      ctx.fillStyle = '#fde68a'
      ctx.beginPath()
      ctx.moveTo(-16, -5)
      ctx.lineTo(16, -7)
      ctx.lineTo(18, 0)
      ctx.lineTo(16, 7)
      ctx.lineTo(-16, 5)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#d6c29a'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(-12, 0)
      ctx.lineTo(14, 0)
      ctx.stroke()
      ctx.restore()
    }
    for (let k = 0; k < 5; k++) husk(160 + (k % 3) * 6, g - 82 - k * 8, (k % 2 ? 0.1 : -0.1))
    // The husk she's spreading masa on.
    ctx.fillStyle = '#fde68a'
    ctx.beginPath()
    ctx.moveTo(116, g - 78)
    ctx.lineTo(150, g - 84)
    ctx.lineTo(152, g - 76)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#fef3c7'
    ellipse(ctx, 132, g - 80, 10, 3)
    ctx.fill()
    // Grandma in her apron.
    const d: Dress = { skin: BROWN, hair: '#e5e7eb', shirt: color, pants: color }
    const x = 80
    standing(ctx, x, g, 1, d, { skirt: true, open: offering ? 0.6 : 0.1 })
    ctx.fillStyle = '#f8fafc'
    rr(ctx, x - 12, g - 90, 26, 46, 4)
    dot(ctx, x - 10, g - 132, 8, '#e5e7eb')
    if (offering) {
      // One held out on a plate.
      const lift = Math.min(1, p / 0.3)
      const hx = x + 40 + lift * 10
      const hy = g - 100 - lift * 12
      arm(ctx, [x + 10, g - 98, x + 24, g - 100, hx, hy], 9, d.shirt)
      arm(ctx, [x - 10, g - 98, x + 6, g - 92, hx - 8, hy + 4], 9, shade(d.shirt, -0.1))
      ctx.fillStyle = '#f8fafc'
      ellipse(ctx, hx + 10, hy, 24, 5)
      ctx.fill()
      husk(hx + 10, hy - 6, 0)
      for (let s = 0; s < 2; s++) {
        const q = (p * 2 + s / 2) % 1
        ctx.strokeStyle = rgba('#f8fafc', (1 - q) * 0.7)
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(hx + 4 + s * 10, hy - 12 - q * 24)
        ctx.quadraticCurveTo(hx + 10 + s * 10, hy - 18 - q * 24, hx + 4 + s * 10, hy - 24 - q * 24)
        ctx.stroke()
      }
    } else {
      // Spreading the masa with the back of a spoon.
      const w = Math.sin(p * TAU * 2) * 8
      arm(ctx, [x + 10, g - 98, x + 30, g - 92, x + 48 + w, g - 86], 9, d.shirt)
      ctx.strokeStyle = '#cbd5e1'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(x + 48 + w, g - 86)
      ctx.lineTo(x + 56 + w, g - 80)
      ctx.stroke()
      arm(ctx, [x - 10, g - 98, x + 4, g - 86, x + 30, g - 80], 9, shade(d.shirt, -0.1))
    }
  }
}

// -- the haunted doorbell ---------------------------------------------------------------------------------------------

function hauntedDoorbell(opening: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 252
    const dx = 80
    const dw = 100
    const dh = 190
    // The frame and the open doorway (lit from inside).
    ctx.fillStyle = '#e2e8f0'
    rr(ctx, dx - 10, g - dh - 14, dw + 20, dh + 14, 4)
    const open = opening ? Math.min(1, p / 0.3) : 0
    ctx.fillStyle = rgba('#fde68a', 0.25 + open * 0.5)
    ctx.fillRect(dx, g - dh, dw, dh)
    // Who opens it: a big friendly monster with a bowl of candy.
    if (open > 0) {
      const mx = dx + 50
      const peek = open
      ctx.fillStyle = color
      rr(ctx, mx - 34, g - 150 * peek, 68, 150 * peek, 28)
      if (peek > 0.5) {
        dot(ctx, mx - 12, g - 124, 10, '#f8fafc')
        dot(ctx, mx + 14, g - 126, 12, '#f8fafc')
        dot(ctx, mx - 10, g - 122, 4, '#111')
        dot(ctx, mx + 16, g - 124, 5, '#111')
        ctx.fillStyle = '#f8fafc'
        ctx.beginPath()
        ctx.moveTo(mx - 16, g - 102)
        ctx.lineTo(mx + 18, g - 102)
        ctx.lineTo(mx + 1, g - 88)
        ctx.closePath()
        ctx.fill()
        for (const h of [-1, 1]) {
          ctx.beginPath()
          ctx.fillStyle = color
          ctx.moveTo(mx + h * 20, g - 140)
          ctx.lineTo(mx + h * 30, g - 166)
          ctx.lineTo(mx + h * 8, g - 146)
          ctx.fill()
        }
        // The bowl held out.
        const by = g - 70
        arm(ctx, [mx + 26, g - 84, mx + 46, by - 2, mx + 60, by], 12, shade(color, -0.1))
        ctx.fillStyle = color2
        ctx.beginPath()
        ctx.ellipse(mx + 74, by, 24, 12, 0, 0, Math.PI)
        ctx.fill()
        for (let k = 0; k < 5; k++) dot(ctx, mx + 58 + k * 8, by - 2 - (k % 2) * 4, 4, ['#f472b6', '#facc15', '#4ade80', '#60a5fa', '#fb923c'][k])
      }
    }
    // The door itself, swung open on its hinge (drawn narrowing).
    const w = dw * (1 - open * 0.85)
    ctx.fillStyle = color2
    ctx.fillRect(dx, g - dh, w, dh)
    if (w > 30) {
      ctx.strokeStyle = shade(color2, -0.2)
      ctx.lineWidth = 3
      ctx.strokeRect(dx + w * 0.15, g - dh + 18, w * 0.7, 60)
      ctx.strokeRect(dx + w * 0.15, g - dh + 96, w * 0.7, 70)
      // The mail slot, with glowing eyes looking out while it waits.
      ctx.fillStyle = '#475569'
      ctx.fillRect(dx + w * 0.3, g - dh + 82, w * 0.4, 8)
      if (!opening && Math.floor(p * 6) % 3 !== 2) {
        dot(ctx, dx + w * 0.42, g - dh + 86, 2.5, '#a3e635')
        dot(ctx, dx + w * 0.58, g - dh + 86, 2.5, '#a3e635')
      }
      dot(ctx, dx + w * 0.85, g - 90, 4, '#fde68a')
    }
    // The doorbell, glowing and ringing (rings drawn as arcs) when someone's come.
    const bx = dx + dw + 22
    ctx.fillStyle = '#e2e8f0'
    rr(ctx, bx - 7, g - 112, 14, 22, 3)
    dot(ctx, bx, g - 101, 4, opening ? '#fde68a' : '#94a3b8')
    if (opening && p < 0.5) {
      ctx.strokeStyle = rgba('#fde68a', 0.9)
      ctx.lineWidth = 2
      for (let r = 0; r < 3; r++) {
        ctx.beginPath()
        ctx.arc(bx, g - 101, 12 + r * 8 + (p * 40) % 8, -0.8, 0.8)
        ctx.stroke()
      }
    }
    // A pumpkin on the step.
    ctx.fillStyle = '#fb923c'
    ellipse(ctx, dx + dw + 50, g - 16, 22, 16)
    ctx.fill()
    ctx.fillStyle = '#fde68a'
    for (const ex of [-8, 6]) {
      ctx.beginPath()
      ctx.moveTo(dx + dw + 50 + ex, g - 22)
      ctx.lineTo(dx + dw + 55 + ex, g - 16)
      ctx.lineTo(dx + dw + 45 + ex, g - 16)
      ctx.fill()
    }
  }
}

// -- the candy swap -------------------------------------------------------------------------------------------------

const CANDY = ['#f472b6', '#facc15', '#4ade80', '#60a5fa', '#fb923c', '#c084fc']

function candyTrader(trading: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 232
    // The step they sit on, a pile of candy each.
    ctx.fillStyle = '#e2e8f0'
    rr(ctx, 30, g - 40, 240, 40, 4)
    for (let k = 0; k < 14; k++) {
      const side = k < 7 ? 0 : 1
      const cx = (side ? 186 : 84) + ((k % 7) - 3) * 7
      const cy = g - 42 - ((k * 3) % 4) * 3
      ctx.fillStyle = CANDY[k % 6]
      rr(ctx, cx - 5, cy - 3, 10, 6, 2)
    }
    const kids: Array<[number, number, Dress, string]> = [
      [60, 1, { skin: PEACH, hair: '#ca8a04', shirt: color, pants: '#93c5fd' }, 'witch'],
      [220, -1, { skin: BROWN, hair: '#1c1917', shirt: color2, pants: '#e2e8f0' }, 'cat'],
    ]
    const q = trading ? (p * 2) % 1 : 0
    kids.forEach(([x, dir, d, hat]) => {
      person(ctx, x, g - 40, 0.8, dir, d, { open: trading ? 0.6 : 0 }, () => {
        if (hat === 'witch') {
          ctx.fillStyle = color
          rr(ctx, -20, -138, 44, 6, 3)
          ctx.beginPath()
          ctx.moveTo(-10, -136)
          ctx.lineTo(4, -176)
          ctx.lineTo(16, -136)
          ctx.fill()
        } else {
          ctx.fillStyle = color2
          for (const ex of [-10, 12]) {
            ctx.beginPath()
            ctx.moveTo(ex - 6, -130)
            ctx.lineTo(ex, -148)
            ctx.lineTo(ex + 6, -130)
            ctx.fill()
          }
          ctx.strokeStyle = '#f8fafc'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(10, -114)
          ctx.lineTo(24, -116)
          ctx.moveTo(10, -110)
          ctx.lineTo(24, -108)
          ctx.stroke()
        }
        if (trading) {
          arm(ctx, [10, -98, 30, -100, 46, -104], 8, d.shirt)
          arm(ctx, [-10, -98, -14, -78, -10, -62], 8, d.shirt)
        } else {
          // Sorting: one hand dipping into the pile.
          const dip = Math.sin(p * TAU * 2) * 8
          arm(ctx, [10, -98, 28, -80, 40, -62 + dip], 8, d.shirt)
          arm(ctx, [-10, -98, -14, -78, -10, -62], 8, d.shirt)
        }
      })
    })
    if (trading) {
      // Two sweets crossing in the air between them, and a handshake once it's done.
      const ax = 100 + q * 80
      const bx = 180 - q * 80
      const y = g - 130 - Math.sin(q * Math.PI) * 40
      ctx.fillStyle = '#facc15'
      rr(ctx, ax - 10, y - 4, 20, 8, 2)
      ctx.fillStyle = '#f472b6'
      circle(ctx, bx, y, 7)
      ctx.fill()
      ctx.strokeStyle = '#f8fafc'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(bx, y + 7)
      ctx.lineTo(bx, y + 20)
      ctx.stroke()
    }
    // Their pillowcases.
    ctx.fillStyle = '#f8fafc'
    rr(ctx, 24, g - 34, 20, 30, 6)
    rr(ctx, 256, g - 34, 20, 30, 6)
  }
}

// -- trimming the tree ----------------------------------------------------------------------------------------------

/** Level: a child on a step stool hangs one more ornament on the tree for each bit nearer people come, until it's full and twinkling. */
function treeTrimmer(ctx: Ctx, f: number, n: number, { color, color2 }: SpriteColors) {
  const k = f / (n - 1)
  const g = 252
  const tx = 170
  ctx.fillStyle = '#d6c29a'
  ctx.fillRect(tx - 7, g - 30, 14, 30)
  for (let t = 0; t < 4; t++) {
    const w = 84 - t * 16
    const y = g - 30 - t * 46
    ctx.fillStyle = t % 2 ? '#22c55e' : '#16a34a'
    ctx.beginPath()
    ctx.moveTo(tx - w, y)
    ctx.lineTo(tx, y - 76)
    ctx.lineTo(tx + w, y)
    ctx.fill()
  }
  // Ornaments, in the order she hangs them.
  const spots: Array<[number, number]> = [
    [tx - 50, g - 44], [tx + 46, g - 40], [tx - 10, g - 60], [tx + 20, g - 96], [tx - 38, g - 92], [tx + 4, g - 128],
    [tx - 24, g - 140], [tx + 30, g - 146], [tx - 6, g - 176], [tx + 14, g - 196], [tx - 60, g - 38], [tx + 64, g - 42],
  ]
  const hung = Math.round(k * spots.length)
  const cols = [color, color2, '#fde68a', '#f8fafc', '#f472b6', '#60a5fa']
  spots.slice(0, hung).forEach(([x, y], s) => {
    dot(ctx, x, y, 7, cols[s % cols.length])
    dot(ctx, x - 2, y - 2, 2, rgba('#fff', 0.8))
  })
  if (k >= 1) {
    // Full: the lights come on and twinkle, and the star.
    for (let s = 0; s < 16; s++) dot(ctx, tx - 70 + ((s * 37) % 140) * (1 - ((s * 13) % 4) * 0.2), g - 40 - ((s * 29) % 170), 2.5, (s + f) % 3 ? '#fde68a' : '#f8fafc')
    ctx.fillStyle = '#fde68a'
    ctx.font = 'bold 30px sans-serif'
    ctx.fillText('★', tx - 13, g - 196)
  }
  // The stool and the child, reaching to where the next one goes.
  const [nx, ny] = spots[Math.min(hung, spots.length - 1)]
  ctx.fillStyle = '#e2e8f0'
  rr(ctx, 50, g - 34, 40, 6, 2)
  ctx.fillRect(54, g - 30, 5, 30)
  ctx.fillRect(81, g - 30, 5, 30)
  const d: Dress = { skin: PEACH, hair: '#7c2d12', shirt: '#f87171', pants: '#93c5fd' }
  const kx = 70
  const ky = g - 34
  person(ctx, kx, ky, 0.85, 1, d, { open: k >= 1 ? 0.7 : 0.3 }, () => {
    if (k >= 1) {
      arm(ctx, [10, -98, 22, -118, 28, -140], 8, d.shirt)
      arm(ctx, [-10, -98, -22, -118, -28, -140], 8, d.shirt)
      return
    }
    // Reaching towards the next spot, as far as an arm goes.
    let hx = (nx - kx) / 0.85 - 10
    let hy = (ny - ky) / 0.85 + 98
    const len = Math.hypot(hx, hy)
    if (len > 58) {
      hx = (hx / len) * 58
      hy = (hy / len) * 58
    }
    hx += 10
    hy -= 98
    arm(ctx, [10, -98, (10 + hx) / 2, (hy - 98) / 2 - 6, hx, hy], 8, d.shirt)
    dot(ctx, hx, hy + 8, 6, cols[hung % cols.length])
    arm(ctx, [-10, -98, -14, -78, -10, -62], 8, d.shirt)
  })
}

// -- the secret admirer ----------------------------------------------------------------------------------------------

function secretAdmirer(sneaking: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 242
    // The front door with its bell and the step.
    ctx.fillStyle = '#e2e8f0'
    rr(ctx, 178, g - 196, 96, 196, 3)
    ctx.fillStyle = color2
    ctx.fillRect(186, g - 188, 80, 180)
    ctx.strokeStyle = shade(color2, -0.2)
    ctx.lineWidth = 3
    ctx.strokeRect(198, g - 176, 56, 60)
    ctx.strokeRect(198, g - 104, 56, 80)
    dot(ctx, 256, g - 92, 4, '#fde68a')
    ctx.fillStyle = '#cbd5e1'
    rr(ctx, 168, g - 10, 116, 10, 2)
    const bell = sneaking && p > 0.32 && p < 0.55
    dot(ctx, 288, g - 110, 5, bell ? '#fde68a' : '#94a3b8')
    if (bell) {
      ctx.strokeStyle = '#fde68a'
      ctx.lineWidth = 2
      for (let r = 0; r < 2; r++) {
        ctx.beginPath()
        ctx.arc(288, g - 110, 12 + r * 8, -0.8, 0.8)
        ctx.stroke()
      }
    }
    // The heart box left on the step once delivered.
    if (sneaking && p > 0.35) {
      ctx.fillStyle = color
      heartPath(ctx, 226, g - 22, 13)
      ctx.fill()
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(224, g - 34, 4, 22)
      for (let s = 0; s < 4; s++) {
        const q = ((p - 0.35) * 2 + s / 4) % 1
        ctx.fillStyle = rgba(color, 1 - q)
        heartPath(ctx, 210 + s * 12, g - 40 - q * 50, 5)
        ctx.fill()
      }
    }
    // The admirer: peeking from behind the bush holding the box, or tiptoeing over, ringing and dashing back.
    let x = 60
    let dir = 1
    if (sneaking) {
      if (p < 0.3) x = 60 + (p / 0.3) * 150
      else if (p < 0.4) x = 210
      else if (p < 0.7) {
        x = 210 - ((p - 0.4) / 0.3) * 150
        dir = -1
      }
    }
    const d: Dress = { skin: TAN, hair: '#1c1917', shirt: '#f472b6', pants: '#93c5fd' }
    const walking = sneaking && p < 0.7 && !(p >= 0.3 && p < 0.4)
    const peek = !sneaking || p >= 0.7 ? Math.sin(p * TAU * 2) * 0.5 + 0.5 : 1
    const hidden = !sneaking || p >= 0.7
    person(ctx, x, g - (hidden ? 30 - peek * 30 : 0), 0.85, dir, d, { stride: walking ? Math.sin(p * TAU * 6) * 0.7 : 0, open: sneaking && p >= 0.7 ? 0.6 : 0 }, () => {
      if (!sneaking || p < 0.35) {
        arm(ctx, [10, -98, 24, -94, 34, -96], 8, d.shirt)
        arm(ctx, [-10, -98, 8, -90, 28, -94], 8, d.shirt)
        ctx.fillStyle = color
        heartPath(ctx, 40, -98, 13)
        ctx.fill()
      } else if (p < 0.4) {
        arm(ctx, [10, -98, 30, -100, 50, -110], 8, d.shirt)
        arm(ctx, [-10, -98, -14, -78, -10, -62], 8, d.shirt)
      } else {
        arm(ctx, [10, -98, 0, -116, -6, -124], 8, d.shirt)
        arm(ctx, [-10, -98, -14, -78, -10, -62], 8, d.shirt)
      }
    })
    // The bush in front of the hiding spot.
    for (const [bx, by, r] of [[40, g - 26, 30], [70, g - 34, 34], [100, g - 24, 28]] as const) {
      ctx.fillStyle = '#22c55e'
      circle(ctx, bx, by, r)
      ctx.fill()
    }
    for (let s = 0; s < 5; s++) dot(ctx, 34 + s * 16, g - 40 + (s % 2) * 14, 3.5, '#f9a8d4')
  }
}

// -- the egg-and-spoon race -------------------------------------------------------------------------------------------

function eggSpoonRace(racing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 232
    // Start line chalked on the grass and the finish ribbon.
    ctx.strokeStyle = '#f8fafc'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(30, g)
    ctx.lineTo(50, g - 16)
    ctx.stroke()
    ctx.fillStyle = '#e2e8f0'
    ctx.fillRect(286, g - 110, 5, 110)
    ctx.strokeStyle = color2
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(288, g - 80)
    ctx.quadraticCurveTo(278, g - 70, 288, g - 60)
    ctx.stroke()
    const kids: Array<[number, Dress, string]> = [
      [0, { skin: PEACH, hair: '#ca8a04', shirt: color, pants: '#93c5fd' }, '#f8fafc'],
      [1, { skin: BROWN, hair: '#1c1917', shirt: color2, pants: '#e2e8f0' }, '#fde68a'],
    ]
    // The one further back first.
    kids.reverse().forEach(([j, d, egg]) => {
      const run = racing ? Math.min(1, p * (j ? 1.1 : 1.25)) : 0
      const x = 70 + j * 50 + run * 110
      const g2 = g - j * 12
      const wobble = Math.sin(p * TAU * (racing ? 6 : 1) + j) * (racing ? 0.5 : 0.2)
      const dropped = racing && j === 1 && p > 0.6
      person(ctx, x, g2, 0.8, 1, d, { stride: racing ? Math.sin(p * TAU * 5 + j) * 0.8 : 0, open: dropped ? 0.9 : racing ? 0.4 : 0 }, () => {
        arm(ctx, [10, -98, 26, -92, 46, -94], 8, d.shirt)
        ctx.strokeStyle = '#cbd5e1'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(46, -94)
        ctx.lineTo(68, -96)
        ctx.stroke()
        ctx.fillStyle = '#cbd5e1'
        ellipse(ctx, 72, -96, 7, 3)
        ctx.fill()
        if (!dropped) {
          ctx.fillStyle = egg
          ellipse(ctx, 72 + wobble * 4, -104, 6, 8, wobble)
          ctx.fill()
        }
        arm(ctx, [-10, -98, -24, -88, -30, -74], 8, d.shirt)
      })
      if (dropped) {
        // The egg tumbles off and splats.
        const q = Math.min(1, (p - 0.6) / 0.2)
        const ex = x + 58 + q * 16
        if (q < 1) {
          ctx.fillStyle = egg
          ellipse(ctx, ex, g2 - 80 + q * q * 76, 5, 7, q * 6)
          ctx.fill()
        } else {
          ctx.fillStyle = '#f8fafc'
          ellipse(ctx, ex, g2 - 2, 14, 4)
          ctx.fill()
          dot(ctx, ex, g2 - 3, 4, '#facc15')
        }
      }
    })
  }
}

// -- watermelon seed spitting -------------------------------------------------------------------------------------------

function seedSpitters(spitting: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 232
    // Little flags in the grass marking how far the seeds have gone.
    for (let m = 0; m < 4; m++) {
      const mx = 150 + m * 40
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(mx, g)
      ctx.lineTo(mx, g - 26)
      ctx.stroke()
      ctx.fillStyle = m % 2 ? color2 : '#fde68a'
      ctx.beginPath()
      ctx.moveTo(mx, g - 26)
      ctx.lineTo(mx + 12, g - 21)
      ctx.lineTo(mx, g - 16)
      ctx.fill()
    }
    const kids: Array<[number, Dress]> = [
      [50, { skin: PEACH, hair: '#c2410c', shirt: color2, pants: '#93c5fd' }],
      [100, { skin: TAN, hair: '#1c1917', shirt: '#f8fafc', pants: '#fde68a' }],
    ]
    kids.forEach(([x, d], j) => {
      const t = spitting ? (p * 2 + j * 0.5) % 1 : 0
      const puff = spitting && t < 0.3
      person(ctx, x, g, 0.85, 1, d, { open: spitting ? (t < 0.3 ? 0 : 0.5) : 0.3 }, () => {
        if (puff) dot(ctx, 12, -116, 6, rgba('#fca5a5', 0.85))
        // The slice of watermelon: to the mouth, or held down while they aim.
        const sx = spitting ? 36 : 22
        const sy = spitting ? -70 : -112 + Math.abs(Math.sin(p * TAU * 2)) * 6
        arm(ctx, [10, -98, 22, (sy - 98) / 2, sx - 4, sy], 8, d.shirt)
        ctx.fillStyle = '#4ade80'
        ctx.beginPath()
        ctx.arc(sx + 8, sy - 6, 18, 0, Math.PI)
        ctx.fill()
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(sx + 8, sy - 6, 15, 0, Math.PI)
        ctx.fill()
        for (let s = 0; s < 3; s++) dot(ctx, sx + 2 + s * 6, sy - 1 + (s % 2) * 3, 1.5, '#475569')
        arm(ctx, [-10, -98, -14, -78, -10, -62], 8, d.shirt)
      })
      if (spitting && t >= 0.3) {
        // The seed flying in an arc, and where it lands.
        const q = (t - 0.3) / 0.7
        const dist = 140 + j * 40
        const sx = x + 14 + q * dist
        const sy = g - 100 - Math.sin(q * Math.PI) * 50 + q * 98
        dot(ctx, sx, sy, 4, '#f8fafc')
        if (q > 0.95) for (let s = 0; s < 5; s++) dot(ctx, x + 14 + dist + Math.cos(s) * 8, g - 4 - Math.abs(Math.sin(s)) * 6, 1.5, '#fde68a')
      }
    })
    // The cooler with the rest of the melon.
    ctx.fillStyle = '#60a5fa'
    rr(ctx, 6, g - 30, 34, 30, 4)
    ctx.fillStyle = '#f8fafc'
    rr(ctx, 4, g - 34, 38, 6, 2)
  }
}

// -- Paul Revere ------------------------------------------------------------------------------------------------------

function paulRevere(waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 222
    const bob = Math.abs(Math.sin(p)) * 6
    const hx = 140
    const hy = g - 92 - bob
    // The galloping horse: legs gathered then stretched.
    const s = Math.sin(p)
    ctx.strokeStyle = '#d6c29a'
    ctx.lineWidth = 9
    ctx.lineCap = 'round'
    for (const [lx, a] of [[hx - 46, s], [hx - 34, s * 0.7], [hx + 34, -s], [hx + 46, -s * 0.7]] as const) {
      ctx.beginPath()
      ctx.moveTo(lx, hy + 14)
      ctx.lineTo(lx + a * 16, hy + 46)
      ctx.lineTo(lx + a * 22, g - 4)
      ctx.stroke()
    }
    ctx.fillStyle = '#d6c29a'
    ellipse(ctx, hx, hy, 60, 24)
    ctx.fill()
    // The tail streaming.
    ctx.strokeStyle = '#fde68a'
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(hx - 56, hy - 8)
    ctx.quadraticCurveTo(hx - 80, hy - 4 + s * 6, hx - 92, hy + 14 + s * 8)
    ctx.stroke()
    // Neck and head reaching forward.
    ctx.fillStyle = '#d6c29a'
    ctx.beginPath()
    ctx.moveTo(hx + 40, hy - 16)
    ctx.lineTo(hx + 72, hy - 52)
    ctx.lineTo(hx + 86, hy - 40)
    ctx.lineTo(hx + 58, hy + 8)
    ctx.fill()
    ctx.save()
    ctx.translate(hx + 80, hy - 46)
    ctx.rotate(0.5 + s * 0.08)
    rr(ctx, -10, -12, 46, 22, 9)
    ctx.restore()
    dot(ctx, hx + 84, hy - 50, 2.5, '#111')
    ctx.fillStyle = '#d6c29a'
    ctx.beginPath()
    ctx.moveTo(hx + 72, hy - 56)
    ctx.lineTo(hx + 76, hy - 68)
    ctx.lineTo(hx + 80, hy - 54)
    ctx.fill()
    ctx.fillStyle = '#fde68a'
    for (let k = 0; k < 4; k++) dot(ctx, hx + 50 + k * 7, hy - 22 - k * 9, 5, '#fde68a')
    ctx.lineCap = 'butt'
    // The rider: tricorn hat, cloak flying, a lantern held out (or held high and shouting for people).
    const rx = hx - 4
    const ry = hy - 18
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(rx - 4, ry - 50)
    ctx.quadraticCurveTo(rx - 40, ry - 40 + s * 6, rx - 50, ry - 6 + s * 4)
    ctx.lineTo(rx - 6, ry - 14)
    ctx.fill()
    ctx.fillStyle = color2
    rr(ctx, rx - 12, ry - 56, 26, 44, 8)
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 9
    ctx.beginPath()
    ctx.moveTo(rx, ry - 14)
    ctx.lineTo(rx + 20, ry + 4)
    ctx.lineTo(rx + 18, ry + 26)
    ctx.stroke()
    head(ctx, rx + 3, ry - 70, 13, PEACH, 1, { open: waving ? 0.9 : 0.2 })
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(rx - 16, ry - 78)
    ctx.lineTo(rx + 3, ry - 94)
    ctx.lineTo(rx + 22, ry - 78)
    ctx.lineTo(rx + 3, ry - 82)
    ctx.fill()
    const lx = waving ? rx + 26 : rx + 34
    const ly = waving ? ry - 112 + Math.sin(p * 2) * 4 : ry - 40
    arm(ctx, [rx + 8, ry - 48, waving ? rx + 20 : rx + 22, waving ? ry - 80 : ry - 44, lx, ly], 7, color2)
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(lx, ly)
    ctx.lineTo(lx, ly + 8)
    ctx.stroke()
    const glow = ctx.createRadialGradient(lx, ly + 18, 1, lx, ly + 18, 36)
    glow.addColorStop(0, rgba('#fde68a', 0.65))
    glow.addColorStop(1, rgba('#fde68a', 0))
    ctx.fillStyle = glow
    circle(ctx, lx, ly + 18, 36)
    ctx.fill()
    ctx.fillStyle = '#e2e8f0'
    rr(ctx, lx - 7, ly + 8, 14, 20, 2)
    ctx.fillStyle = '#fde68a'
    ctx.fillRect(lx - 4, ly + 12, 8, 12)
    // Dust kicked up behind.
    for (let k = 0; k < 4; k++) {
      const q = ((f / frames) * 2 + k / 4) % 1
      ctx.fillStyle = rgba('#e7d5b0', 0.5 * (1 - q))
      circle(ctx, hx - 70 - q * 60, g - 8 - q * 10, 6 + q * 10)
      ctx.fill()
    }
  }
}

// -- the hammock ------------------------------------------------------------------------------------------------------

function hammockNapper(awake: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 212
    const swing = Math.sin(p * TAU) * (awake ? 2 : 6)
    // Two posts and the hammock slung between, rocking gently.
    ctx.fillStyle = '#d6c29a'
    ctx.fillRect(30, g - 130, 10, 130)
    ctx.fillRect(270, g - 130, 10, 130)
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(40, g - 120)
    ctx.lineTo(70 + swing, g - 84)
    ctx.moveTo(270, g - 120)
    ctx.lineTo(240 + swing, g - 84)
    ctx.stroke()
    const d: Dress = { skin: TAN, hair: '#78716c', shirt: '#f8fafc', pants: '#93c5fd' }
    // The napper lying along it: legs to the right, head on the left, a straw hat over his face and a glass
    // of lemonade on the ground. Awake, he sits up and lifts the hat to wave.
    const bodyY = g - 74 + swing * 0.3
    if (!awake) {
      ctx.fillStyle = d.shirt
      rr(ctx, 90 + swing, bodyY - 22, 70, 24, 10)
      ctx.strokeStyle = d.pants!
      ctx.lineWidth = 12
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(160 + swing, bodyY - 10)
      ctx.lineTo(220 + swing, bodyY - 14)
      ctx.stroke()
      ctx.lineCap = 'butt'
      dot(ctx, 226 + swing, bodyY - 18, 7, '#e2e8f0')
      head(ctx, 80 + swing, bodyY - 24, 14, d.skin, 1)
      ctx.fillStyle = '#fde68a'
      ellipse(ctx, 86 + swing, bodyY - 34, 22, 6, -0.3)
      ctx.fill()
      ellipse(ctx, 86 + swing, bodyY - 40, 11, 8, -0.3)
      ctx.fill()
      ctx.fillStyle = color2
      ctx.fillRect(78 + swing, bodyY - 41, 16, 3)
      // The snores.
      ctx.font = 'bold 18px sans-serif'
      for (let k = 0; k < 3; k++) {
        const q = (p + k / 3) % 1
        ctx.fillStyle = rgba('#f8fafc', 1 - q)
        ctx.fillText('z', 96 + q * 40 + k * 4, bodyY - 60 - q * 50)
      }
    } else {
      const sx = 130 + swing
      ctx.save()
      person(ctx, sx, bodyY + 30, 0.9, 1, d, { open: 0.7 }, () => {
        arm(ctx, [-10, -98, -24, -116, -28, -140], 8, d.shirt)
        ctx.fillStyle = '#fde68a'
        ellipse(ctx, -28, -150, 22, 6, -0.4)
        ctx.fill()
        ellipse(ctx, -28, -156, 11, 8, -0.4)
        ctx.fill()
        arm(ctx, [10, -98, 30, -100 + Math.sin(p * TAU * 2) * 8, 46, -116], 8, d.shirt)
      })
      ctx.restore()
    }
    // The hammock netting over the top of him.
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(70 + swing, g - 84)
    ctx.quadraticCurveTo(155 + swing, g - 30, 240 + swing, g - 84)
    ctx.quadraticCurveTo(155 + swing, g - 50, 70 + swing, g - 84)
    ctx.fill()
    ctx.strokeStyle = color2
    ctx.lineWidth = 2
    for (let k = 1; k < 8; k++) {
      const t = k / 8
      const x = 70 + swing + t * 170
      ctx.beginPath()
      ctx.moveTo(x, g - 84 + Math.sin(t * Math.PI) * 26)
      ctx.lineTo(x, g - 84 + Math.sin(t * Math.PI) * 41)
      ctx.stroke()
    }
    // Lemonade on the grass.
    ctx.fillStyle = rgba('#fde68a', 0.85)
    rr(ctx, 160, g - 22, 14, 20, 2)
    dot(ctx, 172, g - 22, 4, '#a3e635')
  }
}

// -- raising the flag -------------------------------------------------------------------------------------------------

function flag(ctx: Ctx, x: number, y: number, w: number, h: number, wave: number, unfurl: number) {
  // Stripes as wavy strips, a blue canton with stars.
  const fw = w * unfurl
  for (let s = 0; s < 7; s++) {
    ctx.fillStyle = s % 2 ? '#f8fafc' : '#ef4444'
    ctx.beginPath()
    const y0 = y + (s * h) / 7
    for (let k = 0; k <= 8; k++) {
      const t = k / 8
      const dy = Math.sin(t * 5 + wave) * 4 * t
      if (k === 0) ctx.moveTo(x, y0)
      else ctx.lineTo(x + t * fw, y0 + dy)
    }
    for (let k = 8; k >= 0; k--) {
      const t = k / 8
      ctx.lineTo(x + t * fw, y0 + h / 7 + Math.sin(t * 5 + wave) * 4 * t)
    }
    ctx.fill()
  }
  ctx.fillStyle = '#60a5fa'
  ctx.fillRect(x, y, fw * 0.42, h * 0.54)
  if (unfurl > 0.6) for (let k = 0; k < 6; k++) dot(ctx, x + 6 + (k % 3) * fw * 0.13, y + 6 + Math.floor(k / 3) * h * 0.22, 1.8, '#f8fafc')
}

function flagRaiser(raising: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 272
    const px = 160
    // The pole and its gold ball.
    ctx.fillStyle = '#e2e8f0'
    ctx.fillRect(px - 3, 24, 6, g - 24)
    dot(ctx, px, 22, 6, '#fde68a')
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px + 4, 28)
    ctx.lineTo(px + 4, g - 90)
    ctx.stroke()
    // The flag: folded near the bottom while it waits, hoisted to the top for people, flying there.
    const up = raising ? Math.min(1, p / 0.6) : 0
    const fy = (g - 130) - up * (g - 170)
    flag(ctx, px + 4, fy, 100, 60, f * 0.9, raising ? 0.4 + up * 0.6 : 0.25)
    // The scout in uniform and neckerchief, hauling hand over hand, then saluting.
    const d: Dress = { skin: BROWN, hair: '#1c1917', shirt: color, pants: '#d6c29a' }
    person(ctx, px - 40, g, 0.95, 1, d, { open: raising && p > 0.6 ? 0.3 : 0 }, () => {
      ctx.fillStyle = color2
      ctx.beginPath()
      ctx.moveTo(-10, -102)
      ctx.lineTo(12, -102)
      ctx.lineTo(1, -84)
      ctx.fill()
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(2, -126, 17, Math.PI, TAU)
      ctx.fill()
      rr(ctx, 2, -130, 24, 5, 2)
      if (raising && p > 0.6) {
        arm(ctx, [10, -98, 22, -116, 8, -128], 8, d.shirt)
        arm(ctx, [-10, -98, -14, -78, -10, -62], 8, d.shirt)
      } else if (raising) {
        const hand = Math.floor(p * 10) % 2
        arm(ctx, [10, -98, 28, -110, 44, hand ? -150 : -120], 8, d.shirt)
        arm(ctx, [-10, -98, 18, -110, 44, hand ? -116 : -146], 8, shade(d.shirt, -0.1))
      } else {
        arm(ctx, [10, -98, 14, -78, 10, -62], 8, d.shirt)
        arm(ctx, [-10, -98, -14, -78, -10, -62], 8, d.shirt)
      }
    })
  }
}

const BUBBLE = { id: 'bubble', frames: 1, w: 360, h: 140 }

export const OBSERVANCE_ROWS: Record<string, SpriteRow[]> = {
  'pi-day-pie': [
    { id: 'main', frames: 8, w: 280, h: 240, paint: piDayPie(false) },
    { id: 'act', frames: 10, w: 280, h: 240, paint: piDayPie(true) },
    { ...BUBBLE, paint: saying('Happy Pi Day!') },
    SPARKLE,
  ],
  'birdhouse-builder': [
    { id: 'main', frames: 9, w: 260, h: 240, paint: birdhouseBuilder },
    SPARKLE,
  ],
  'thank-you-letter': [
    { id: 'main', frames: 6, w: 260, h: 240, paint: thankYouLetter(false) },
    { id: 'act', frames: 10, w: 260, h: 240, paint: thankYouLetter(true) },
    { ...BUBBLE, paint: saying('Thank you, veterans!') },
    SPARKLE,
  ],
  'lincoln-hat': [
    { id: 'main', frames: 4, w: 220, h: 270, paint: lincolnHat(false) },
    { id: 'act', frames: 10, w: 220, h: 270, paint: lincolnHat(true) },
    { ...BUBBLE, paint: saying('Happy Presidents’ Day!') },
    SPARKLE,
  ],
  'resolution-list': [
    { id: 'main', frames: 8, w: 280, h: 250, paint: resolutionList(false) },
    { id: 'act', frames: 10, w: 280, h: 250, paint: resolutionList(true) },
    { ...BUBBLE, paint: saying('New year, new me!') },
    SPARKLE,
  ],
  'tamale-maker': [
    { id: 'main', frames: 8, w: 280, h: 250, paint: tamaleMaker(false) },
    { id: 'act', frames: 10, w: 280, h: 250, paint: tamaleMaker(true) },
    { ...BUBBLE, paint: saying('¡Provecho!') },
    SPARKLE,
  ],
  'haunted-doorbell': [
    { id: 'main', frames: 6, w: 280, h: 260, paint: hauntedDoorbell(false) },
    { id: 'act', frames: 10, w: 280, h: 260, paint: hauntedDoorbell(true) },
    { ...BUBBLE, paint: saying('Who rang the bell?') },
    SPARKLE,
  ],
  'candy-trader': [
    { id: 'main', frames: 8, w: 300, h: 240, paint: candyTrader(false) },
    { id: 'act', frames: 10, w: 300, h: 240, paint: candyTrader(true) },
    { ...BUBBLE, paint: saying('Trade you!') },
    SPARKLE,
  ],
  'tree-trimmer': [
    { id: 'main', frames: 13, w: 270, h: 270, paint: treeTrimmer },
    SPARKLE,
  ],
  'secret-admirer': [
    { id: 'main', frames: 8, w: 300, h: 250, paint: secretAdmirer(false) },
    { id: 'act', frames: 16, w: 300, h: 250, paint: secretAdmirer(true) },
    { ...BUBBLE, paint: saying('Be my Valentine!') },
    SPARKLE,
  ],
  'egg-spoon-race': [
    { id: 'main', frames: 6, w: 300, h: 240, paint: eggSpoonRace(false) },
    { id: 'act', frames: 14, w: 300, h: 240, paint: eggSpoonRace(true) },
    { ...BUBBLE, paint: saying('Steady… steady!') },
    SPARKLE,
  ],
  'seed-spitters': [
    { id: 'main', frames: 8, w: 300, h: 240, paint: seedSpitters(false) },
    { id: 'act', frames: 12, w: 300, h: 240, paint: seedSpitters(true) },
    { ...BUBBLE, paint: saying('Beat that!') },
    SPARKLE,
  ],
  'paul-revere': [
    { id: 'main', frames: 8, w: 300, h: 230, paint: paulRevere(false) },
    { id: 'wave', frames: 8, w: 300, h: 230, paint: paulRevere(true) },
    SPARKLE,
  ],
  'hammock-napper': [
    { id: 'main', frames: 8, w: 310, h: 220, paint: hammockNapper(false) },
    { id: 'act', frames: 8, w: 310, h: 220, paint: hammockNapper(true) },
    { ...BUBBLE, paint: saying('Happy Labor Day!') },
    SPARKLE,
  ],
  'flag-raiser': [
    { id: 'main', frames: 4, w: 280, h: 280, paint: flagRaiser(false) },
    { id: 'act', frames: 12, w: 280, h: 280, paint: flagRaiser(true) },
    SPARKLE,
  ],
}
