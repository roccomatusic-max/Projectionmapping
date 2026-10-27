/**
 * More for Christmas: an elf on the shelf who only moves when nobody's looking, an advent calendar opened up to
 * today, Santa checking his list, children building a snowman, a star for the top of the tree, a tangle of lights,
 * an ugly sweater dance, a puppy in a box, reindeer food, a tower of presents, a dog in a sweater, children
 * peeking for Santa and Mrs Claus's cookies.
 *
 * Painted the same way as sprites.ts: facing right, one frame at a time, into a cell of w by h design units.
 */

import { arm, dot, head, rr, standing, type Dress } from './figures'
import {
  circle, ellipse, rgba, saying, shade, SPARKLE, TAU,
  type Ctx, type SpriteColors, type SpriteRow,
} from './sprites'

const PEACH = '#f5c9a0'
const TAN = '#c68a5a'
const BROWN = '#8d5a3b'
const BULBS = ['#ef4444', '#facc15', '#22c55e', '#38bdf8', '#f472b6']

function star(ctx: Ctx, x: number, y: number, r: number, c: string) {
  ctx.fillStyle = c
  ctx.beginPath()
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5
    const rr2 = k % 2 ? r * 0.45 : r
    ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2)
  }
  ctx.fill()
}

function present(ctx: Ctx, x: number, y: number, w: number, h: number, c: string, ribbon: string) {
  ctx.fillStyle = c
  rr(ctx, x - w / 2, y - h, w, h, 2)
  ctx.fillStyle = ribbon
  ctx.fillRect(x - w * 0.08, y - h, w * 0.16, h)
  ctx.fillRect(x - w / 2, y - h * 0.62, w, h * 0.14)
  ellipse(ctx, x - w * 0.14, y - h - 3, w * 0.14, h * 0.1, -0.5)
  ctx.fill()
  ellipse(ctx, x + w * 0.14, y - h - 3, w * 0.14, h * 0.1, 0.5)
  ctx.fill()
}

/** A little tree with lights (lit 0 to 1) and room for a star at its top (x, top). */
function littleTree(ctx: Ctx, x: number, g: number, h: number, lit: number, f: number) {
  ctx.fillStyle = '#78350f'
  ctx.fillRect(x - 6, g - 14, 12, 14)
  for (let k = 0; k < 3; k++) {
    const y0 = g - 14 - k * h * 0.26
    const w = h * (0.42 - k * 0.1)
    ctx.fillStyle = k % 2 ? '#15803d' : '#16a34a'
    ctx.beginPath()
    ctx.moveTo(x - w, y0)
    ctx.lineTo(x + w, y0)
    ctx.lineTo(x, y0 - h * 0.42)
    ctx.fill()
  }
  for (let k = 0; k < 14; k++) {
    const u = (k + 0.5) / 14
    const yy = g - 20 - u * h * 0.78
    const span = (1 - u) * h * 0.34
    const bx = x + Math.sin(k * 2.4) * span
    const on = lit > 0 && (k + f) % 3 !== 0
    dot(ctx, bx, yy, 3.2, on ? BULBS[k % BULBS.length] : shade(BULBS[k % BULBS.length], -0.45))
  }
}

// -- an elf on the shelf -------------------------------------------------------------------------------------

/** Six poses on a shelf: frozen in whichever one when people look, moving on to the next when nobody does. */
function elfOnShelf(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const sx = 20
  const sy = 120
  ctx.fillStyle = '#a16207'
  rr(ctx, sx, sy, 160, 10, 2)
  ctx.fillStyle = '#854d0e'
  ctx.fillRect(sx + 16, sy + 10, 8, 20)
  ctx.fillRect(sx + 136, sy + 10, 8, 20)
  const elf = (x: number, y: number, rot: number, pose: 'sit' | 'hang' | 'lie' | 'split' | 'wave' | 'mug') => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    const red = color
    // Legs.
    if (pose === 'sit') {
      arm(ctx, [-4, 0, -4, 26], 6, red)
      arm(ctx, [4, 0, 6, 26], 6, red)
    } else if (pose === 'hang') {
      arm(ctx, [-4, 0, -6, 30], 6, red)
      arm(ctx, [4, 0, 8, 28], 6, red)
    } else if (pose === 'split') {
      arm(ctx, [-2, 0, -26, 4], 6, red)
      arm(ctx, [2, 0, 26, 4], 6, red)
    } else if (pose === 'lie') {
      arm(ctx, [0, 0, 22, -2, 26, -14], 6, red)
      arm(ctx, [0, 2, 24, 2, 32, -6], 6, red)
    } else if (pose !== 'mug') {
      arm(ctx, [-4, 0, -6, 24], 6, red)
      arm(ctx, [4, 0, 6, 24], 6, red)
    }
    if (pose !== 'mug') {
      ctx.fillStyle = red
      rr(ctx, -9, -26, 18, 28, 6)
      ctx.fillStyle = '#f8fafc'
      ctx.beginPath()
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU
        ctx.lineTo(Math.cos(a) * 10 + (k % 2 ? 0 : Math.cos(a) * 3), -26 + Math.sin(a) * 4)
      }
      ctx.fill()
    }
    head(ctx, 0, -38, 11, PEACH, 1, { blink: pose === 'lie' })
    ctx.fillStyle = red
    ctx.beginPath()
    ctx.moveTo(-11, -42)
    ctx.lineTo(11, -42)
    ctx.quadraticCurveTo(4, -60, 18, -66)
    ctx.quadraticCurveTo(-4, -64, -11, -42)
    ctx.fill()
    dot(ctx, 18, -66, 4, '#f8fafc')
    ctx.fillStyle = '#f8fafc'
    rr(ctx, -12, -46, 24, 5, 2)
    // Arms for each pose.
    if (pose === 'hang') {
      arm(ctx, [-8, -22, -12, -44, -10, -56], 5, red)
      arm(ctx, [8, -22, 12, -44, 10, -56], 5, red)
    } else if (pose === 'wave') {
      arm(ctx, [8, -22, 18, -36, 20, -50], 5, red)
      arm(ctx, [-8, -22, -12, -8], 5, red)
    } else if (pose === 'lie') {
      arm(ctx, [-6, -22, -14, -10, -10, -2], 5, red)
    } else if (pose !== 'mug') {
      arm(ctx, [-8, -22, -14, -6], 5, red)
      arm(ctx, [8, -22, 14, -6], 5, red)
    }
    ctx.restore()
  }
  if (f === 0) elf(60, sy - 2, 0, 'sit')
  else if (f === 1) elf(130, sy + 66, 0, 'hang')
  else if (f === 2) elf(80, sy - 8, -Math.PI / 2, 'lie')
  else if (f === 3) elf(100, sy - 6, 0, 'split')
  else if (f === 4) {
    // Hugging a candy cane bigger than he is.
    ctx.strokeStyle = '#f8fafc'
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(146, sy)
    ctx.lineTo(146, sy - 70)
    ctx.arc(134, sy - 70, 12, 0, Math.PI, true)
    ctx.stroke()
    ctx.strokeStyle = '#dc2626'
    ctx.lineWidth = 7
    ctx.setLineDash([6, 6])
    ctx.stroke()
    ctx.setLineDash([])
    elf(130, sy - 2, 0, 'wave')
  } else {
    // Sitting in a mug of cocoa with marshmallows.
    ctx.fillStyle = color2
    rr(ctx, 70, sy - 40, 44, 40, 6)
    ctx.strokeStyle = color2
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(116, sy - 20, 10, -1.2, 1.2)
    ctx.stroke()
    elf(92, sy - 32, 0, 'mug')
    ctx.fillStyle = color2
    rr(ctx, 70, sy - 40, 44, 14, 6)
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = '#f8fafc'
      rr(ctx, 74 + k * 9, sy - 44 - (k % 2) * 3, 8, 7, 2)
    }
  }
}

// -- an advent calendar ---------------------------------------------------------------------------------------

const ICONS = ['star', 'tree', 'gift', 'bell', 'candy', 'sock'] as const

/** Frame n has the first n of its 24 doors open (n = 24 is Christmas Eve onwards). */
function adventCalendar(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  // A house-shaped calendar: roof, then a grid of six by four little doors.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(20, 70)
  ctx.lineTo(140, 10)
  ctx.lineTo(260, 70)
  ctx.fill()
  rr(ctx, 26, 66, 228, 182, 6)
  star(ctx, 140, 34, 14, color2)
  for (let k = 0; k < 24; k++) {
    const c = k % 6
    const r = Math.floor(k / 6)
    const x = 38 + c * 36
    const y = 78 + r * 42
    const open = k < f
    if (open) {
      // The little picture behind the door.
      ctx.fillStyle = '#fef3c7'
      rr(ctx, x, y, 30, 34, 3)
      const icon = ICONS[k % ICONS.length]
      const ix = x + 15
      const iy = y + 18
      if (icon === 'star') star(ctx, ix, iy, 10, '#facc15')
      else if (icon === 'tree') {
        ctx.fillStyle = '#16a34a'
        ctx.beginPath()
        ctx.moveTo(ix - 10, iy + 10)
        ctx.lineTo(ix + 10, iy + 10)
        ctx.lineTo(ix, iy - 12)
        ctx.fill()
      } else if (icon === 'gift') present(ctx, ix, iy + 11, 18, 16, '#dc2626', '#facc15')
      else if (icon === 'bell') {
        ctx.fillStyle = '#eab308'
        ctx.beginPath()
        ctx.moveTo(ix - 10, iy + 8)
        ctx.quadraticCurveTo(ix - 8, iy - 12, ix, iy - 12)
        ctx.quadraticCurveTo(ix + 8, iy - 12, ix + 10, iy + 8)
        ctx.fill()
        dot(ctx, ix, iy + 10, 3, '#eab308')
      } else if (icon === 'candy') {
        ctx.strokeStyle = '#dc2626'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(ix + 2, iy + 12)
        ctx.lineTo(ix + 2, iy - 4)
        ctx.arc(ix - 4, iy - 4, 6, 0, Math.PI, true)
        ctx.stroke()
      } else {
        ctx.fillStyle = '#dc2626'
        rr(ctx, ix - 5, iy - 12, 10, 16, 2)
        rr(ctx, ix - 5, iy, 16, 9, 4)
        ctx.fillStyle = '#f8fafc'
        ctx.fillRect(ix - 6, iy - 14, 12, 5)
      }
      // The door swung open to the left.
      ctx.fillStyle = shade(color2, -0.1)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - 8, y + 3)
      ctx.lineTo(x - 8, y + 31)
      ctx.lineTo(x, y + 34)
      ctx.fill()
    } else {
      ctx.fillStyle = color2
      rr(ctx, x, y, 30, 34, 3)
      ctx.fillStyle = shade(color, -0.1)
      ctx.font = 'bold 15px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(k + 1), x + 15, y + 18)
    }
  }
}

// -- Santa checking his list ----------------------------------------------------------------------------------

function niceList(checking: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color }: SpriteColors) => {
    const p = f / frames
    const g = 256
    const d: Dress = { skin: PEACH, hair: '#f8fafc', shirt: color, pants: color, shoes: '#111827' }
    // A round Santa: belly, belt, beard and hat.
    ctx.save()
    ctx.translate(90, g)
    ctx.scale(1.15, 1.15)
    standing(ctx, 0, 0, 1, d, { open: checking ? 0.5 : 0 })
    ctx.fillStyle = color
    ellipse(ctx, 2, -70, 26, 30)
    ctx.fill()
    ctx.fillStyle = '#111827'
    ctx.fillRect(-24, -64, 52, 7)
    ctx.fillStyle = '#facc15'
    ctx.fillRect(-2, -66, 10, 11)
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(-14, -112)
    ctx.quadraticCurveTo(4, -76, 22, -112)
    ctx.quadraticCurveTo(4, -100, -14, -112)
    ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(-16, -128)
    ctx.lineTo(20, -128)
    ctx.quadraticCurveTo(6, -150, -20, -144)
    ctx.fill()
    dot(ctx, -22, -142, 5, '#f8fafc')
    ctx.fillStyle = '#f8fafc'
    rr(ctx, -18, -132, 40, 7, 3)
    // Little round glasses, looked over at people.
    ctx.strokeStyle = '#facc15'
    ctx.lineWidth = 1.5
    const gy = checking ? -114 : -118
    for (const ex of [3, 12]) {
      ctx.beginPath()
      ctx.arc(ex, gy, 4, 0, TAU)
      ctx.stroke()
    }
    ctx.restore()
    // The long list unrolled down to the ground; a big tick going on for people.
    const sx = 136
    const sy = g - 150
    ctx.fillStyle = '#fef3c7'
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx + 36, sy)
    ctx.lineTo(sx + 40, g - 10)
    ctx.quadraticCurveTo(sx + 28, g, sx + 14, g - 6)
    ctx.lineTo(sx + 4, g - 6)
    ctx.fill()
    ctx.fillStyle = '#d6c08f'
    rr(ctx, sx - 4, sy - 6, 44, 9, 4)
    ctx.strokeStyle = '#a8a29e'
    ctx.lineWidth = 1.2
    const scroll = checking ? 0 : (f % 4) * 3
    for (let k = 0; k < 12; k++) {
      const y = sy + 10 + k * 10 + scroll
      if (y > g - 12) break
      ctx.beginPath()
      ctx.moveTo(sx + 6, y)
      ctx.lineTo(sx + 26 - (k % 3) * 4, y)
      ctx.stroke()
    }
    arm(ctx, [102, g - 112, 122, g - 120, sx, sy], 10, color)
    dot(ctx, sx, sy, 5, '#f8fafc')
    arm(ctx, [80, g - 112, 70, g - 86, 76, g - 70], 10, shade(color, -0.15))
    if (checking && p > 0.3) {
      const u = Math.min(1, (p - 0.3) / 0.3)
      ctx.strokeStyle = '#16a34a'
      ctx.lineWidth = 5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(sx + 8, sy + 60)
      ctx.lineTo(sx + 8 + 8 * Math.min(1, u * 2), sy + 60 + 8 * Math.min(1, u * 2))
      if (u > 0.5) ctx.lineTo(sx + 16 + (u - 0.5) * 2 * 20, sy + 68 - (u - 0.5) * 2 * 28)
      ctx.stroke()
    }
  }
}

// -- building a snowman -------------------------------------------------------------------------------------

/** Level: a ball rolled bigger, a second on top, the head, then the carrot, coal, scarf and hat. */
function snowmanBuilders(ctx: Ctx, f: number, n: number, { color, color2 }: SpriteColors) {
  const k = f / (n - 1)
  const g = 226
  const x = 140
  const snow = '#f8fafc'
  const r1 = 22 + Math.min(1, k * 3) * 18
  dot(ctx, x, g - r1, r1, snow)
  if (k > 0.33) dot(ctx, x, g - 2 * r1 - 24 * Math.min(1, (k - 0.33) * 4), 26 * Math.min(1, (k - 0.33) * 4), snow)
  const hy = g - 2 * r1 - 52
  if (k > 0.55) dot(ctx, x, hy - 14, 18 * Math.min(1, (k - 0.55) * 5), snow)
  if (k > 0.75) {
    dot(ctx, x - 6, hy - 18, 2.5, '#1f2937')
    dot(ctx, x + 6, hy - 18, 2.5, '#1f2937')
    ctx.fillStyle = '#f97316'
    ctx.beginPath()
    ctx.moveTo(x + 2, hy - 13)
    ctx.lineTo(x + 22, hy - 10)
    ctx.lineTo(x + 2, hy - 8)
    ctx.fill()
    for (let j = 0; j < 3; j++) dot(ctx, x, g - 2 * r1 - 12 + j * 10, 2.5, '#1f2937')
    ctx.strokeStyle = '#78350f'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x - 22, g - 2 * r1 - 20)
    ctx.lineTo(x - 46, g - 2 * r1 - 40)
    ctx.moveTo(x + 22, g - 2 * r1 - 20)
    ctx.lineTo(x + 46, g - 2 * r1 - 36)
    ctx.stroke()
  }
  if (k >= 1) {
    ctx.fillStyle = color
    rr(ctx, x - 18, hy - 2, 36, 8, 3)
    rr(ctx, x + 6, hy + 2, 8, 22, 3)
    ctx.fillStyle = '#1f2937'
    rr(ctx, x - 18, hy - 34, 36, 4, 2)
    rr(ctx, x - 11, hy - 54, 22, 22, 2)
    ctx.fillStyle = color2
    ctx.fillRect(x - 11, hy - 40, 22, 4)
  }
  // Two children: one pushing the ball, one lifting the head on, cheering at the end.
  const kid = (kx: number, dir: number, shirt: string, skin: string, reach: boolean) => {
    const d: Dress = { skin, hair: '#292524', shirt, pants: '#1e3a8a' }
    ctx.save()
    ctx.translate(kx, g)
    ctx.scale(0.78, 0.78)
    standing(ctx, 0, 0, dir, d, { open: k >= 1 ? 0.8 : 0 })
    ctx.fillStyle = shirt === color ? color2 : color
    ctx.beginPath()
    ctx.ellipse(dir * 2, -126, 17, 13, 0, Math.PI, 0)
    ctx.fill()
    dot(ctx, dir * 2, -140, 5, '#f8fafc')
    if (k >= 1) {
      arm(ctx, [-10, -96, -18, -118, -16, -140], 9, shirt)
      arm(ctx, [10, -96, 18, -118, 16, -140], 9, shirt)
    } else if (reach) {
      arm(ctx, [dir * 10, -96, dir * 30, -100, dir * 44, -96], 9, shirt)
      arm(ctx, [-dir * 10, -96, dir * 24, -90, dir * 44, -86], 9, shade(shirt, -0.15))
    } else {
      arm(ctx, [dir * 10, -96, dir * 20, -76, dir * 22, -60], 9, shirt)
    }
    ctx.restore()
  }
  kid(70, 1, color2, PEACH, k < 0.4)
  kid(212, -1, color, BROWN, k >= 0.4 && k < 1)
}

// -- a star for the top of the tree ------------------------------------------------------------------------------

function starTopper(placing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 276
    const lit = placing && p > 0.5 ? 1 : 0
    littleTree(ctx, 170, g, 220, lit, f)
    // Dad holding the child up on his shoulders.
    const lift = placing ? Math.min(1, p / 0.5) : 0.2 + Math.sin(p * TAU) * 0.05
    const dad: Dress = { skin: TAN, hair: '#292524', shirt: color, pants: '#334155' }
    standing(ctx, 76, g, 1, dad, { open: lit ? 0.6 : 0 })
    const kx = 80 + lift * 6
    const ky = g - 130 - lift * 20
    const kid: Dress = { skin: TAN, hair: '#292524', shirt: color2, pants: '#1e3a8a' }
    arm(ctx, [kx - 4, ky, kx - 14, ky + 14, kx - 16, ky + 34], 9, kid.pants!)
    arm(ctx, [kx + 4, ky, kx + 14, ky + 14, kx + 16, ky + 34], 9, kid.pants!)
    arm(ctx, [66, g - 98, 62, g - 120, kx - 16, ky + 30], 9, dad.shirt)
    arm(ctx, [86, g - 98, 92, g - 120, kx + 16, ky + 30], 9, dad.shirt)
    ctx.fillStyle = kid.shirt
    rr(ctx, kx - 12, ky - 40, 24, 42, 8)
    head(ctx, kx + 2, ky - 52, 13, kid.skin, 1, { open: lit ? 0.8 : 0.2 })
    ctx.fillStyle = kid.hair
    ctx.beginPath()
    ctx.arc(kx + 2, ky - 54, 14, Math.PI * 1.02, Math.PI * 1.98)
    ctx.fill()
    // The star: reached up with, then set on top and shining.
    const tx = 170
    const ty = g - 236
    const sx = placing ? kx + 20 + (tx - kx - 20) * Math.min(1, p / 0.5) : kx + 28
    const sy = placing ? ky - 40 + (ty - ky + 40) * Math.min(1, p / 0.5) : ky - 36
    arm(ctx, [kx + 8, ky - 34, (kx + sx) / 2 + 4, (ky - 34 + sy) / 2 - 6, sx - 6, sy + 6], 7, kid.shirt)
    if (lit) {
      const gr = ctx.createRadialGradient(tx, ty, 2, tx, ty, 34)
      gr.addColorStop(0, rgba('#fde68a', 0.9))
      gr.addColorStop(1, rgba('#fde68a', 0))
      ctx.fillStyle = gr
      circle(ctx, tx, ty, 34)
      ctx.fill()
    }
    star(ctx, sx, sy, 14, '#facc15')
  }
}

// -- a tangle of Christmas lights ----------------------------------------------------------------------------

function lightTangle(fixed: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 236
    const d: Dress = { skin: PEACH, hair: '#78350f', shirt: color, pants: '#334155' }
    if (!fixed || p < 0.4) {
      // Wrapped up in a knot of wire, wobbling.
      const wob = Math.sin(p * TAU * 2) * 0.08
      ctx.save()
      ctx.translate(110, g)
      ctx.rotate(wob)
      standing(ctx, 0, 0, 1, d, { open: 0.5 })
      ctx.fillStyle = color2
      rr(ctx, -16, -136, 34, 8, 3)
      arm(ctx, [-10, -96, -26, -110, -34, -100], 9, d.shirt)
      arm(ctx, [10, -96, 26, -110, 34, -100], 9, d.shirt)
      ctx.strokeStyle = '#166534'
      ctx.lineWidth = 2
      for (let k = 0; k < 9; k++) {
        ctx.beginPath()
        ctx.ellipse(Math.sin(k * 1.7) * 6, -60 - k * 8, 26 + (k % 3) * 6, 10, k * 0.6, 0, TAU)
        ctx.stroke()
      }
      for (let k = 0; k < 16; k++) {
        const a = k * 2.3
        dot(ctx, Math.cos(a) * 28, -40 - (k * 6) % 90, 3.5, shade(BULBS[k % BULBS.length], -0.4))
      }
      ctx.restore()
      if (fixed) {
        // Spinning free.
        for (let k = 0; k < 6; k++) {
          const a = p * 20 + k
          dot(ctx, 110 + Math.cos(a) * 50, g - 80 + Math.sin(a) * 20, 3, rgba('#fde68a', 0.8))
        }
      }
    } else {
      // Strung along the roofline and all lit, a bow and arms out.
      const u = Math.min(1, (p - 0.4) / 0.3)
      ctx.strokeStyle = '#166534'
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let x = 10; x <= 230; x += 10) ctx.lineTo(x, 40 + Math.sin(x * 0.06) * 8)
      ctx.stroke()
      for (let k = 0; k < 22; k++) {
        const x = 15 + k * 10
        if (x > 15 + u * 220) break
        const on = (k + f) % 4 !== 0
        dot(ctx, x, 46 + Math.sin(x * 0.06) * 8, 4, on ? BULBS[k % BULBS.length] : shade(BULBS[k % BULBS.length], -0.3))
      }
      standing(ctx, 110, g, 1, d, { open: 0.8 })
      ctx.fillStyle = color2
      rr(ctx, 94, g - 136, 34, 8, 3)
      arm(ctx, [100, g - 98, 82, g - 118, 70, g - 136], 9, d.shirt)
      arm(ctx, [120, g - 98, 138, g - 118, 150, g - 136], 9, d.shirt)
    }
  }
}

// -- an ugly sweater dance ---------------------------------------------------------------------------------------

function uglySweater(dancing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 246
    const x = 100
    const amp = dancing ? 1 : 0.3
    const hip = Math.sin(p * 2) * 8 * amp
    const d: Dress = { skin: BROWN, hair: '#111827', shirt: color, pants: '#1e3a8a' }
    ctx.save()
    ctx.translate(hip, -Math.abs(Math.sin(p * 2)) * 6 * amp)
    standing(ctx, x, g, 1, d, { stride: Math.sin(p * 2) * amp, open: dancing ? 0.7 : 0 })
    // The sweater: zig-zags, a reindeer face with a pompom nose, snowflakes.
    ctx.strokeStyle = color2
    ctx.lineWidth = 3
    for (const y of [g - 100, g - 62]) {
      ctx.beginPath()
      for (let k = 0; k <= 6; k++) ctx.lineTo(x - 15 + k * 5, y + (k % 2 ? -3 : 3))
      ctx.stroke()
    }
    ctx.fillStyle = '#a16207'
    ellipse(ctx, x, g - 80, 8, 10)
    ctx.fill()
    dot(ctx, x, g - 74, 4, '#ef4444')
    if (dancing && Math.floor(p * 2) % 2) dot(ctx, x, g - 74, 6, rgba('#fca5a5', 0.6))
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - 6, g - 88)
    ctx.lineTo(x - 12, g - 96)
    ctx.moveTo(x + 6, g - 88)
    ctx.lineTo(x + 12, g - 96)
    ctx.stroke()
    // A Santa hat with a bell.
    ctx.fillStyle = '#dc2626'
    ctx.beginPath()
    ctx.moveTo(x - 16, g - 128)
    ctx.lineTo(x + 18, g - 128)
    ctx.quadraticCurveTo(x + 30, g - 150 - Math.sin(p * 2) * 4 * amp, x + 34, g - 132)
    ctx.quadraticCurveTo(x + 14, g - 146, x - 16, g - 128)
    ctx.fill()
    dot(ctx, x + 34, g - 130, 4, '#facc15')
    ctx.fillStyle = '#f8fafc'
    rr(ctx, x - 18, g - 132, 38, 7, 3)
    // Arms: a disco point and a hip, swapping.
    const s = Math.sin(p) > 0 ? 1 : -1
    if (dancing) {
      arm(ctx, [x + 10, g - 98, x + 22 + s * 6, g - 120, x + 30 + s * 10, g - 146 + (s < 0 ? 40 : 0)], 9, d.shirt)
      arm(ctx, [x - 10, g - 98, x - 22 - s * 6, g - 120 + (s > 0 ? 30 : 0), x - 30, g - 146 + (s > 0 ? 70 : 0)], 9, shade(d.shirt, -0.12))
    } else {
      arm(ctx, [x + 10, g - 98, x + 22, g - 80, x + 16, g - 64], 9, d.shirt)
      arm(ctx, [x - 10, g - 98, x - 22, g - 80, x - 16, g - 64], 9, shade(d.shirt, -0.12))
    }
    ctx.restore()
  }
}

// -- a puppy in a box -----------------------------------------------------------------------------------------

function presentPuppy(open: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 216
    const bx = 150
    // The box: shaken and wiggling by itself, then the lid off and a puppy popping up.
    const wig = open ? 0 : Math.sin(f * 2.3) * 0.08
    ctx.save()
    ctx.translate(bx, g)
    ctx.rotate(wig)
    present(ctx, 0, 0, 60, 52, color, color2)
    ctx.restore()
    if (open) {
      const up = Math.min(1, p / 0.35)
      ctx.save()
      ctx.translate(bx + up * 50, g - 60 - up * 30)
      ctx.rotate(up * 0.8)
      ctx.fillStyle = color
      rr(ctx, -34, -4, 68, 10, 2)
      ctx.fillStyle = color2
      ctx.fillRect(-5, -4, 10, 10)
      ctx.restore()
      // The puppy: floppy ears, tongue out, a red bow.
      const py = g - 50 - up * 24 + Math.abs(Math.sin(p * TAU * 2)) * -4
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, 260, g - 52)
      ctx.clip()
      dot(ctx, bx, py + 20, 18, '#d6a26a')
      dot(ctx, bx, py - 4, 18, '#d6a26a')
      ctx.fillStyle = '#92400e'
      ellipse(ctx, bx - 16, py - 2, 7, 14, 0.3 + Math.sin(p * TAU * 2) * 0.2)
      ctx.fill()
      ellipse(ctx, bx + 16, py - 2, 7, 14, -0.3 - Math.sin(p * TAU * 2) * 0.2)
      ctx.fill()
      ctx.fillStyle = '#fef3c7'
      ellipse(ctx, bx, py + 6, 9, 7)
      ctx.fill()
      dot(ctx, bx, py + 2, 3.5, '#1f2937')
      dot(ctx, bx - 7, py - 8, 2.5, '#1f2937')
      dot(ctx, bx + 7, py - 8, 2.5, '#1f2937')
      ctx.fillStyle = '#f472b6'
      rr(ctx, bx - 3, py + 10, 6, 8, 3)
      ctx.fillStyle = '#dc2626'
      ctx.beginPath()
      ctx.moveTo(bx, py + 14)
      ctx.lineTo(bx - 10, py + 8)
      ctx.lineTo(bx - 10, py + 20)
      ctx.lineTo(bx, py + 14)
      ctx.lineTo(bx + 10, py + 8)
      ctx.lineTo(bx + 10, py + 20)
      ctx.fill()
      ctx.restore()
    }
    // The child in pyjamas: shaking the box, then arms wide.
    const d: Dress = { skin: PEACH, hair: '#ca8a04', shirt: '#60a5fa', pants: '#60a5fa' }
    const hop = open ? Math.abs(Math.sin(p * TAU * 2)) * 8 : 0
    standing(ctx, 70, g - hop, 1, d, { open: open ? 0.9 : 0 })
    ctx.fillStyle = '#f8fafc'
    for (let k = 0; k < 3; k++) dot(ctx, 64 + k * 6, g - 90 - hop + k * 12, 2, '#f8fafc')
    if (open) {
      arm(ctx, [60, g - 98 - hop, 46, g - 118 - hop, 40, g - 138 - hop], 9, d.shirt)
      arm(ctx, [80, g - 98 - hop, 94, g - 118 - hop, 100, g - 138 - hop], 9, d.shirt)
    } else {
      const sh = Math.sin(f * 2.3) * 4
      arm(ctx, [80, g - 98, 100, g - 80 + sh, 120, g - 40 + sh], 9, d.shirt)
      arm(ctx, [60, g - 98, 84, g - 76 + sh, 120, g - 30 + sh], 9, shade(d.shirt, -0.12))
    }
  }
}

// -- reindeer food --------------------------------------------------------------------------------------------

function reindeerFood(throwing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 236
    const d: Dress = { skin: TAN, hair: '#292524', shirt: color, pants: '#475569' }
    standing(ctx, 70, g, 1, d, { open: throwing ? 0.6 : 0, skirt: true })
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.ellipse(72, g - 126, 17, 13, 0, Math.PI, 0)
    ctx.fill()
    // The little bag, and the oats and glitter flung out across the lawn.
    arm(ctx, [60, g - 98, 52, g - 78, 54, g - 66], 8, d.shirt)
    ctx.fillStyle = '#fef3c7'
    ctx.beginPath()
    ctx.moveTo(46, g - 68)
    ctx.lineTo(64, g - 68)
    ctx.lineTo(66, g - 44)
    ctx.lineTo(44, g - 44)
    ctx.fill()
    ctx.fillStyle = color2
    ctx.fillRect(46, g - 66, 18, 4)
    const sw = throwing ? Math.sin(p * TAU * 2) : Math.sin(p * TAU) * 0.3
    const hx = 98 + sw * 10
    const hy = g - 104 - Math.max(0, sw) * 20
    arm(ctx, [80, g - 98, 90, g - 96, hx, hy], 8, d.shirt)
    const n = throwing ? 26 : 8
    for (let k = 0; k < n; k++) {
      const u = ((throwing ? p * 2 : p) + k / n) % 1
      const x = hx + u * (60 + (k % 5) * 18)
      const y = hy + u * u * (g - hy) - Math.sin(u * Math.PI) * 30
      const glitter = k % 3 === 0
      dot(ctx, x, Math.min(g - 2, y), glitter ? 2.5 : 2, glitter ? (k % 2 ? '#fde68a' : '#f0abfc') : '#d6c08f')
    }
    // A sparkly trail on the grass where it lands.
    for (let k = 0; k < 10; k++) {
      const on = (k + f) % 3 === 0
      dot(ctx, 120 + k * 12, g - 3, on ? 2.5 : 1.5, on ? '#fde68a' : '#d6c08f')
    }
  }
}

// -- an elf with a tower of presents -----------------------------------------------------------------------------

function presentTower(teeter: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 266
    const bob = Math.abs(Math.cos(p)) * 2
    ctx.translate(0, -bob)
    // The elf: walking along, hopping on one foot to keep it up for people.
    const one = teeter
    const d: Dress = { skin: PEACH, hair: '#ca8a04', shirt: color, pants: color2, shoes: '#dc2626' }
    standing(ctx, 80, g + bob, 1, d, { stride: one ? 0.8 : Math.sin(p) * 0.8, open: one ? 0.7 : 0 })
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(62, g - 128)
    ctx.lineTo(98, g - 128)
    ctx.quadraticCurveTo(70, g - 150, 52, g - 160)
    ctx.fill()
    dot(ctx, 52, g - 160, 4, '#facc15')
    // The stack, held up high and swaying (wildly for people).
    const sway = (teeter ? 0.25 : 0.05) * Math.sin(p * (teeter ? 2 : 1))
    ctx.save()
    ctx.translate(100, g - 140)
    ctx.rotate(sway)
    const boxes: Array<[number, number, string, string]> = [
      [50, 28, '#dc2626', '#facc15'], [40, 26, '#16a34a', '#f8fafc'], [44, 22, '#2563eb', '#f472b6'],
      [32, 24, '#a855f7', '#facc15'], [26, 18, '#f59e0b', '#dc2626'],
    ]
    let y = 0
    boxes.forEach(([w, h, c, rb], k) => {
      present(ctx, Math.sin(k * 1.7) * 4 + Math.sin(p + k) * sway * 20, y, w, h, c, rb)
      y -= h + 4
    })
    ctx.restore()
    arm(ctx, [70, g - 98, 82, g - 124, 90, g - 140], 8, d.shirt)
    arm(ctx, [90, g - 98, 104, g - 122, 110, g - 140], 8, d.shirt)
  }
}

// -- a dog in a Christmas sweater ---------------------------------------------------------------------------------

function sweaterDog(jumping: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 136
    const hop = jumping ? Math.abs(Math.sin(p)) * 22 : 0
    ctx.translate(0, -hop)
    const fur = '#b45309'
    for (const [x, ph] of [[46, 0], [96, Math.PI], [56, Math.PI], [106, 0]] as const) {
      const k = jumping ? 0.3 : Math.sin(p + ph) * 0.45
      arm(ctx, [x, g - 40, x + Math.sin(k) * 16, g - 4], 7, fur)
    }
    // Wagging tail.
    const wag = Math.sin(p * 4) * 0.6
    arm(ctx, [36, g - 52, 22 + Math.sin(wag) * 8, g - 70 - Math.cos(wag) * 4], 6, fur)
    dot(ctx, 76, g - 50, 26, fur)
    ellipse(ctx, 76, g - 50, 40, 20)
    ctx.fill()
    // The sweater with its snowflakes.
    ctx.fillStyle = color
    rr(ctx, 50, g - 70, 56, 34, 10)
    ctx.fillStyle = color2
    ctx.fillRect(50, g - 46, 56, 4)
    for (const x of [62, 78, 94]) {
      ctx.strokeStyle = '#f8fafc'
      ctx.lineWidth = 1.5
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI
        ctx.beginPath()
        ctx.moveTo(x - Math.cos(a) * 5, g - 58 - Math.sin(a) * 5)
        ctx.lineTo(x + Math.cos(a) * 5, g - 58 + Math.sin(a) * 5)
        ctx.stroke()
      }
    }
    // Head with antlers headband.
    ctx.save()
    ctx.translate(122, g - 74)
    ctx.rotate(jumping ? -0.2 : Math.sin(p * 2) * 0.05)
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = 3
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(s * 6 - 4, -14)
      ctx.lineTo(s * 10 - 4, -34)
      ctx.moveTo(s * 9 - 4, -26)
      ctx.lineTo(s * 16 - 4, -30)
      ctx.stroke()
    }
    dot(ctx, 0, 0, 16, fur)
    ctx.fillStyle = '#fde68a'
    ellipse(ctx, 14, 6, 12, 8)
    ctx.fill()
    dot(ctx, 24, 3, 4, '#1f2937')
    dot(ctx, 6, -5, 2.5, '#1f2937')
    ctx.fillStyle = '#78350f'
    ellipse(ctx, -8, 4, 7, 13, 0.3)
    ctx.fill()
    if (jumping) {
      ctx.fillStyle = '#f472b6'
      rr(ctx, 14, 12, 6, 9, 3)
    }
    ctx.restore()
  }
}

// -- children peeking for Santa ----------------------------------------------------------------------------------

function stairPeekers(gasp: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 236
    // The door frame they peek around (pale so it shows).
    ctx.fillStyle = '#d6d3d1'
    ctx.fillRect(140, 20, 16, g - 20)
    ctx.fillRect(140, 20, 90, 12)
    const lean = gasp ? 0 : Math.sin(p * TAU) * 4
    const kid = (x: number, y: number, s: number, skin: string, hair: string, pj: string, ph: number) => {
      ctx.save()
      ctx.translate(x + lean, y)
      ctx.scale(s, s)
      const d: Dress = { skin, hair, shirt: pj, pants: pj }
      standing(ctx, 0, 0, 1, d, { open: gasp ? 0.9 : 0 })
      for (let k = 0; k < 4; k++) dot(ctx, -8 + (k % 2) * 14, -94 + k * 12, 2.2, '#f8fafc')
      if (gasp) {
        arm(ctx, [-10, -96, -4, -108, 4, -110], 8, pj)
        arm(ctx, [10, -96, 16, -106, 12, -112], 8, pj)
      } else {
        arm(ctx, [10, -96, 22, -90, 30, -80 + Math.sin(p * TAU + ph) * 2], 8, pj)
        arm(ctx, [-10, -96, -16, -76, -14, -60], 8, shade(pj, -0.12))
      }
      ctx.restore()
    }
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, 148, g)
    ctx.clip()
    kid(118, g, 0.95, PEACH, '#b45309', color, 0)
    kid(132, g, 0.72, PEACH, '#ca8a04', color2, 1)
    ctx.restore()
    // A teddy bear dangling from the little one's hand.
    if (!gasp) {
      dot(ctx, 158, g - 46, 9, '#a16207')
      dot(ctx, 158, g - 60, 7, '#a16207')
      dot(ctx, 153, g - 66, 3, '#a16207')
      dot(ctx, 163, g - 66, 3, '#a16207')
    }
    if (gasp) {
      // Santa's shadow on the far wall, caught in the act.
      const u = Math.min(1, p / 0.3)
      ctx.fillStyle = rgba('#94a3b8', 0.6 * u)
      ellipse(ctx, 200, g - 80, 24, 30)
      ctx.fill()
      circle(ctx, 200, g - 124, 14)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(186, g - 130)
      ctx.lineTo(214, g - 130)
      ctx.lineTo(220, g - 150)
      ctx.fill()
      ellipse(ctx, 226, g - 100, 14, 20)
      ctx.fill()
    }
  }
}

// -- Mrs Claus's cookies ----------------------------------------------------------------------------------------

function cookieBaker(baking: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 246
    // The oven: door down and warm light inside for people.
    ctx.fillStyle = '#cbd5e1'
    rr(ctx, 140, g - 110, 90, 110, 6)
    ctx.fillStyle = '#94a3b8'
    for (let k = 0; k < 4; k++) dot(ctx, 156 + k * 20, g - 100, 4, '#64748b')
    const open = baking ? Math.min(1, p / 0.25) : 0
    ctx.fillStyle = open > 0 ? rgba('#fb923c', 0.85) : '#475569'
    rr(ctx, 150, g - 86, 70, 60, 4)
    if (open > 0) {
      ctx.fillStyle = '#94a3b8'
      ctx.beginPath()
      ctx.moveTo(150, g - 26)
      ctx.lineTo(220, g - 26)
      ctx.lineTo(220 + open * 20, g - 26 + open * 12)
      ctx.lineTo(150 - open * 20, g - 26 + open * 12)
      ctx.fill()
    } else {
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(160, g - 92)
      ctx.lineTo(210, g - 92)
      ctx.stroke()
    }
    // Mrs Claus: rolling dough on the counter, or lifting out a tray of cookies.
    const d: Dress = { skin: PEACH, hair: '#f8fafc', shirt: color, shoes: '#111827' }
    standing(ctx, 70, g, 1, d, { skirt: true, open: baking && p > 0.4 ? 0.6 : 0 })
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(60, g - 96)
    ctx.lineTo(80, g - 96)
    ctx.lineTo(90, g - 44)
    ctx.lineTo(50, g - 44)
    ctx.fill()
    dot(ctx, 60, g - 138, 10, '#f8fafc')
    ctx.strokeStyle = '#facc15'
    ctx.lineWidth = 1.5
    for (const ex of [72, 80]) {
      ctx.beginPath()
      ctx.arc(ex, g - 122, 3.5, 0, TAU)
      ctx.stroke()
    }
    if (baking) {
      const u = Math.min(1, Math.max(0, (p - 0.2) / 0.3))
      const tx = 180 - u * 70
      const ty = g - 56 - u * 40
      arm(ctx, [80, g - 98, 96, g - 90, tx - 20, ty + 4], 9, d.shirt)
      dot(ctx, tx - 22, ty + 4, 7, color2)
      ctx.fillStyle = '#94a3b8'
      rr(ctx, tx - 26, ty - 2, 52, 5, 2)
      for (let k = 0; k < 4; k++) {
        dot(ctx, tx - 18 + k * 12, ty - 6, 5, '#d97706')
        dot(ctx, tx - 19 + k * 12, ty - 7, 1.5, '#78350f')
      }
      if (u > 0.5) {
        for (let k = 0; k < 3; k++) {
          const v = (p * 2 + k / 3) % 1
          ctx.strokeStyle = rgba('#e5e7eb', 0.7 * (1 - v))
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(tx - 10 + k * 10, ty - 14 - v * 20)
          ctx.quadraticCurveTo(tx - 14 + k * 10, ty - 20 - v * 20, tx - 10 + k * 10, ty - 26 - v * 20)
          ctx.stroke()
        }
      }
    } else {
      ctx.fillStyle = '#a16207'
      rr(ctx, 86, g - 74, 50, 6, 2)
      ctx.fillStyle = '#fde68a'
      ellipse(ctx, 110, g - 76, 20, 3)
      ctx.fill()
      const roll = Math.sin(p * TAU) * 10
      ctx.fillStyle = '#d6a26a'
      rr(ctx, 98 + roll, g - 86, 24, 7, 3)
      arm(ctx, [80, g - 98, 92, g - 90, 98 + roll, g - 82], 9, d.shirt)
      arm(ctx, [62, g - 98, 90, g - 84, 122 + roll, g - 82], 9, shade(d.shirt, -0.12))
    }
  }
}

const BUBBLE = { id: 'bubble', frames: 1, w: 360, h: 140 }

export const CHRISTMAS_EXTRA_ROWS: Record<string, SpriteRow[]> = {
  'elf-on-shelf': [
    { id: 'main', frames: 6, w: 200, h: 200, paint: elfOnShelf },
    SPARKLE,
  ],
  'advent-calendar': [
    { id: 'main', frames: 25, w: 280, h: 260, paint: adventCalendar },
    SPARKLE,
  ],
  'nice-list': [
    { id: 'main', frames: 4, w: 200, h: 260, paint: niceList(false) },
    { id: 'act', frames: 8, w: 200, h: 260, paint: niceList(true) },
    { ...BUBBLE, paint: saying('You’re on the nice list!') },
    SPARKLE,
  ],
  'snowman-builders': [
    { id: 'main', frames: 8, w: 260, h: 230, paint: snowmanBuilders },
    SPARKLE,
  ],
  'star-topper': [
    { id: 'main', frames: 4, w: 240, h: 280, paint: starTopper(false) },
    { id: 'act', frames: 8, w: 240, h: 280, paint: starTopper(true) },
    { ...BUBBLE, paint: saying('Merry Christmas!') },
    SPARKLE,
  ],
  'light-tangle': [
    { id: 'main', frames: 4, w: 240, h: 240, paint: lightTangle(false) },
    { id: 'act', frames: 8, w: 240, h: 240, paint: lightTangle(true) },
    { ...BUBBLE, paint: saying('Ta-da!') },
    SPARKLE,
  ],
  'ugly-sweater': [
    { id: 'main', frames: 4, w: 200, h: 250, paint: uglySweater(false) },
    { id: 'act', frames: 8, w: 200, h: 250, paint: uglySweater(true) },
    SPARKLE,
  ],
  'present-puppy': [
    { id: 'main', frames: 4, w: 230, h: 220, paint: presentPuppy(false) },
    { id: 'act', frames: 8, w: 230, h: 220, paint: presentPuppy(true) },
    { ...BUBBLE, paint: saying('A puppy!') },
    SPARKLE,
  ],
  'reindeer-food': [
    { id: 'main', frames: 4, w: 260, h: 240, paint: reindeerFood(false) },
    { id: 'act', frames: 8, w: 260, h: 240, paint: reindeerFood(true) },
    { ...BUBBLE, paint: saying('For the reindeer!') },
    SPARKLE,
  ],
  'present-tower': [
    { id: 'main', frames: 8, w: 180, h: 280, paint: presentTower(false) },
    { id: 'wave', frames: 8, w: 180, h: 280, paint: presentTower(true) },
    SPARKLE,
  ],
  'sweater-dog': [
    { id: 'main', frames: 8, w: 160, h: 140, paint: sweaterDog(false) },
    { id: 'wave', frames: 8, w: 160, h: 140, paint: sweaterDog(true) },
    SPARKLE,
  ],
  'stair-peekers': [
    { id: 'main', frames: 4, w: 240, h: 240, paint: stairPeekers(false) },
    { id: 'act', frames: 8, w: 240, h: 240, paint: stairPeekers(true) },
    { ...BUBBLE, paint: saying('Is it him?!') },
    SPARKLE,
  ],
  'cookie-baker': [
    { id: 'main', frames: 4, w: 240, h: 250, paint: cookieBaker(false) },
    { id: 'act', frames: 8, w: 240, h: 250, paint: cookieBaker(true) },
    { ...BUBBLE, paint: saying('Fresh cookies!') },
    SPARKLE,
  ],
}
