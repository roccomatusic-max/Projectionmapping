/**
 * Birthdays, parties and graduation: a bounce house, a magician pulling a rabbit out of his hat, a clown twisting
 * balloon animals, party horns, musical chairs, pin the tail on the donkey, a limbo bar going lower, a sack race,
 * a face painter, a karaoke singer, a DJ, a graduate crossing the stage, a graduate by this year's "Class of"
 * sign, a graduation car parade and the valedictorian's speech.
 *
 * Painted the same way as sprites.ts: facing right, one frame at a time, into a cell of w by h design units.
 */

import { arm, dot, head, rr, standing, type Dress } from './figures'
import {
  ellipse, rgba, saying, shade, SPARKLE, TAU, vehicleWheel,
  type Ctx, type SpriteColors, type SpriteRow,
} from './sprites'

const PEACH = '#f5c9a0'
const TAN = '#c68a5a'
const BROWN = '#8d5a3b'
const CONFETTI = ['#f43f5e', '#38bdf8', '#facc15', '#a78bfa', '#34d399']

/** Someone drawn at a scale s with their feet at (x, g); arms is painted in their own units (shoulders at ∓10, -98). */
function person(ctx: Ctx, x: number, g: number, s: number, dir: number, d: Dress, o: Parameters<typeof standing>[5] = {}, arms?: () => void) {
  ctx.save()
  ctx.translate(x, g)
  ctx.scale(s, s)
  standing(ctx, 0, 0, dir, d, o)
  arms?.()
  ctx.restore()
}

/** Hair over a head redrawn at (x, y). */
function hair(ctx: Ctx, x: number, y: number, dir: number, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y - 2, 17, Math.PI * 1.02, Math.PI * 1.98)
  ctx.quadraticCurveTo(x, y - 12, x - dir * 14, y)
  ctx.fill()
}

/** A striped party hat on a head at (x, y). */
function partyHat(ctx: Ctx, x: number, y: number, c: string, c2: string, tilt = 0) {
  ctx.save()
  ctx.translate(x, y - 14)
  ctx.rotate(tilt)
  ctx.fillStyle = c
  ctx.beginPath()
  ctx.moveTo(-12, 0)
  ctx.lineTo(12, 0)
  ctx.lineTo(0, -34)
  ctx.fill()
  ctx.strokeStyle = c2
  ctx.lineWidth = 3
  for (const k of [0.3, 0.6]) {
    ctx.beginPath()
    ctx.moveTo(-12 * (1 - k), -34 * k)
    ctx.lineTo(12 * (1 - k), -34 * k)
    ctx.stroke()
  }
  dot(ctx, 0, -35, 5, c2)
  ctx.restore()
}

/** A graduation cap (the flat board and its tassel) on a head at (x, y). */
function mortarboard(ctx: Ctx, x: number, y: number, c: string, tassel: string, swing = 0, dir = 1) {
  ctx.fillStyle = shade(c, -0.1)
  rr(ctx, x - 13, y - 22, 26, 10, 3)
  ctx.fillStyle = c
  ctx.beginPath()
  ctx.moveTo(x - 26, y - 24)
  ctx.lineTo(x, y - 32)
  ctx.lineTo(x + 26, y - 24)
  ctx.lineTo(x, y - 16)
  ctx.closePath()
  ctx.fill()
  dot(ctx, x, y - 24, 2.5, tassel)
  arm(ctx, [x, y - 24, x + dir * 16, y - 22, x + dir * (18 + swing), y - 6], 2.5, tassel)
  dot(ctx, x + dir * (18 + swing), y - 4, 3.5, tassel)
}

/** A long balloon twisted into a dog, facing right, standing at (x, y). */
function balloonDog(ctx: Ctx, x: number, y: number, s: number, c: string) {
  ctx.fillStyle = c
  const bit = (bx: number, by: number, rx: number, ry: number, a: number) => {
    ellipse(ctx, x + bx * s, y + by * s, rx * s, ry * s, a)
    ctx.fill()
  }
  bit(0, -22, 18, 7, 0)
  bit(-14, -8, 4, 10, 0.2)
  bit(12, -8, 4, 10, -0.2)
  bit(20, -36, 6, 12, 0.5)
  bit(32, -44, 11, 6, 0)
  bit(16, -52, 4, 9, -0.3)
  bit(24, -54, 4, 9, 0.3)
  bit(-22, -32, 4, 10, -0.6)
  ctx.fillStyle = rgba('#ffffff', 0.55)
  ellipse(ctx, x - 4 * s, y - 25 * s, 8 * s, 2 * s)
  ctx.fill()
}

/** A five-pointed burst of light (a camera flash, a magic twinkle). */
function twinkle(ctx: Ctx, x: number, y: number, r: number, a: number) {
  ctx.fillStyle = rgba('#fffbeb', a)
  ctx.beginPath()
  for (let k = 0; k < 8; k++) {
    const ang = (k * Math.PI) / 4
    const rr2 = k % 2 ? r * 0.3 : r
    ctx.lineTo(x + Math.cos(ang) * rr2, y + Math.sin(ang) * rr2)
  }
  ctx.fill()
}

// -- a bounce house ---------------------------------------------------------------------------------------------

function bounceHouse(wild: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 232
    // The castle sags and swells as the children land.
    const squash = Math.sin(p * TAU * 2) * (wild ? 0.03 : 0.012)
    ctx.save()
    ctx.translate(0, g)
    ctx.scale(1 - squash * 0.5, 1 + squash)
    ctx.translate(0, -g)
    ctx.fillStyle = color2
    rr(ctx, 16, g - 40, 228, 40, 16)
    ctx.fillStyle = color
    rr(ctx, 34, g - 150, 192, 116, 12)
    for (const tx of [26, 194]) {
      ctx.fillStyle = color2
      rr(ctx, tx, g - 184, 40, 150, 16)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(tx - 4, g - 180)
      ctx.lineTo(tx + 44, g - 180)
      ctx.lineTo(tx + 20, g - 222)
      ctx.fill()
      dot(ctx, tx + 20, g - 224, 6, color2)
    }
    // Battlements along the top.
    ctx.fillStyle = color2
    for (let k = 0; k < 5; k++) rr(ctx, 70 + k * 26, g - 166, 18, 20, 6)
    ctx.restore()
    // The doorway: pale netting with the children jumping inside it.
    ctx.fillStyle = rgba('#f8fafc', 0.25)
    rr(ctx, 66, g - 132, 128, 92, 10)
    const kids: Array<[number, string, string]> = [[92, '#fb7185', '#7c2d12'], [130, '#38bdf8', '#facc15'], [166, '#a3e635', '#1c1917']]
    kids.forEach(([kx, shirt, hairC], j) => {
      const hop = Math.abs(Math.sin(p * TAU * 2 + j * 1.3)) * (wild ? 44 : 14)
      const up = wild || hop > 10
      const d: Dress = { skin: j === 1 ? TAN : PEACH, hair: hairC, shirt, pants: '#e2e8f0' }
      person(ctx, kx, g - 40 - hop, 0.55, j % 2 ? -1 : 1, d, { open: wild ? 0.8 : 0, stride: Math.sin(p * TAU + j) * 0.4 }, () => {
        if (up) {
          arm(ctx, [-10, -98, -24, -122, -26, -146], 9, shirt)
          arm(ctx, [10, -98, 24, -122, 26, -146], 9, shirt)
        } else {
          arm(ctx, [-10, -98, -26, -86, -34, -78], 9, shirt)
          arm(ctx, [10, -98, 26, -86, 34, -78], 9, shirt)
        }
      })
    })
    ctx.strokeStyle = rgba('#ffffff', 0.5)
    ctx.lineWidth = 1.5
    for (let k = 1; k < 8; k++) {
      ctx.beginPath()
      ctx.moveTo(66 + k * 16, g - 132)
      ctx.lineTo(66 + k * 16, g - 40)
      ctx.stroke()
    }
    ctx.strokeStyle = color2
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.roundRect(66, g - 132, 128, 92, 10)
    ctx.stroke()
  }
}

// -- a magician -------------------------------------------------------------------------------------------------

function magician(trick: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 262
    // The table with its long cloth, and the top hat upside down on it.
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(130, g - 92)
    ctx.lineTo(206, g - 92)
    ctx.lineTo(214, g)
    ctx.lineTo(122, g)
    ctx.fill()
    ctx.fillStyle = shade(color2, -0.15)
    for (let k = 0; k < 4; k++) ctx.fillRect(132 + k * 22, g - 92, 4, 92)
    const hx = 168
    const hy = g - 92
    // The rabbit, rising out of the hat on the trick (the hat in front hides the rest of him).
    const rise = trick ? Math.min(1, Math.max(0, (p - 0.25) / 0.35)) : 0
    if (rise > 0) {
      const ry = hy - 6 - rise * 44
      ctx.fillStyle = '#f8fafc'
      ellipse(ctx, hx - 7, ry - 22, 5, 15, -0.2)
      ctx.fill()
      ellipse(ctx, hx + 7, ry - 22, 5, 15, 0.2)
      ctx.fill()
      ctx.fillStyle = '#fbcfe8'
      ellipse(ctx, hx - 7, ry - 22, 2, 10, -0.2)
      ctx.fill()
      ellipse(ctx, hx + 7, ry - 22, 2, 10, 0.2)
      ctx.fill()
      dot(ctx, hx, ry, 15, '#f8fafc')
      ellipse(ctx, hx, ry + 22, 16, 18)
      ctx.fill()
      dot(ctx, hx - 5, ry - 3, 2.2, '#1f2937')
      dot(ctx, hx + 5, ry - 3, 2.2, '#1f2937')
      dot(ctx, hx, ry + 4, 2.6, '#f472b6')
    }
    ctx.fillStyle = '#94a3b8'
    ellipse(ctx, hx, hy - 2, 30, 6)
    ctx.fill()
    ctx.fillStyle = '#cbd5e1'
    rr(ctx, hx - 22, hy - 40, 44, 40, 4)
    ctx.fillStyle = color
    ctx.fillRect(hx - 22, hy - 14, 44, 8)
    ctx.fillStyle = '#e2e8f0'
    ellipse(ctx, hx, hy - 40, 22, 6)
    ctx.fill()
    if (rise > 0.6) {
      for (let k = 0; k < 4; k++) {
        const a = k * 1.7 + p * 9
        twinkle(ctx, hx + Math.cos(a) * 46, hy - 80 + Math.sin(a) * 30, 9, 0.9 * Math.abs(Math.sin(p * 20 + k)))
      }
    }
    // The magician in his cape and tall hat, waving his wand over the hat (a tap for the trick).
    const x = 66
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x - 14, g - 104)
    ctx.lineTo(x + 12, g - 104)
    ctx.lineTo(x + 26, g - 10)
    ctx.lineTo(x - 34, g - 10)
    ctx.closePath()
    ctx.fill()
    const d: Dress = { skin: PEACH, hair: '#78716c', shirt: '#f1f5f9', pants: '#94a3b8', shoes: '#475569' }
    standing(ctx, x, g, 1, d, { open: trick && p > 0.5 ? 0.7 : 0 })
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x - 4, g - 100)
    ctx.lineTo(x + 4, g - 92)
    ctx.lineTo(x - 4, g - 84)
    ctx.fill()
    ctx.fillStyle = '#94a3b8'
    rr(ctx, x - 13, g - 172, 28, 36, 3)
    rr(ctx, x - 20, g - 138, 42, 6, 3)
    ctx.fillStyle = color
    ctx.fillRect(x - 13, g - 146, 28, 6)
    arm(ctx, [x - 10, g - 98, x - 18, g - 76, x - 14, g - 58], 9, '#cbd5e1')
    const wave = trick ? (p < 0.25 ? Math.sin(p * TAU * 4) * 10 : -12) : Math.sin(p * TAU) * 14
    const [wx, wy] = arm(ctx, [x + 10, g - 98, x + 30, g - 112, x + 50, g - 126 + wave * 0.4], 9, '#cbd5e1')
    dot(ctx, wx, wy, 5, '#f1f5f9')
    ctx.save()
    ctx.translate(wx, wy)
    ctx.rotate(0.5 + wave * 0.02)
    ctx.fillStyle = '#e2e8f0'
    rr(ctx, -2, -4, 46, 5, 2)
    ctx.fillStyle = '#f8fafc'
    rr(ctx, 36, -4, 10, 5, 2)
    ctx.restore()
    if (!trick) twinkle(ctx, wx + Math.cos(0.5) * 46, wy + Math.sin(0.5) * 46, 7, 0.4 + 0.4 * Math.sin(p * TAU * 2))
  }
}

// -- a balloon twister -------------------------------------------------------------------------------------------

function balloonClown(giving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 262
    const x = 92
    const d: Dress = { skin: '#fef2f2', hair: '#f97316', shirt: color, pants: color2, shoes: '#ef4444' }
    // Big floppy shoes.
    ctx.fillStyle = '#ef4444'
    ellipse(ctx, x - 6, g - 4, 18, 6)
    ctx.fill()
    ellipse(ctx, x + 18, g - 4, 18, 6)
    ctx.fill()
    standing(ctx, x, g, 1, d, { open: giving ? 0.6 : 0.2 })
    for (let k = 0; k < 4; k++) dot(ctx, x - 8 + (k % 2) * 14, g - 96 + Math.floor(k / 2) * 18, 3.5, color2)
    // A ruff, curly wig and a red nose.
    ctx.fillStyle = '#f8fafc'
    for (let k = 0; k < 6; k++) {
      ellipse(ctx, x - 14 + k * 6, g - 104, 6, 4, k)
      ctx.fill()
    }
    for (const [cx, cy] of [[-16, -128], [20, -128], [-12, -140], [14, -142], [0, -146]]) dot(ctx, x + cx, g + cy, 9, '#f97316')
    dot(ctx, x + 14, g - 118, 4.5, '#ef4444')
    if (giving) {
      // Holding out a finished balloon dog to whoever came over.
      const u = Math.min(1, p / 0.3)
      arm(ctx, [x - 10, g - 98, x - 22, g - 80, x - 18, g - 60], 9, color)
      const [hx, hy] = arm(ctx, [x + 10, g - 98, x + 28, g - 100 - u * 4, x + 52 + u * 10, g - 104 - u * 8], 9, color)
      dot(ctx, hx, hy, 6, '#f8fafc')
      balloonDog(ctx, hx + 8, hy - 2 + Math.sin(p * TAU * 2) * 2, 1.25, color2)
    } else {
      // Twisting a long balloon between both hands.
      const tw = Math.sin(p * TAU)
      const [lx, ly] = arm(ctx, [x - 10, g - 98, x + 2, g - 80, x + 18, g - 92 + tw * 4], 9, shade(color, -0.12))
      const [rx, ry] = arm(ctx, [x + 10, g - 98, x + 30, g - 86, x + 46, g - 96 - tw * 4], 9, color)
      ctx.fillStyle = color2
      ellipse(ctx, (lx + rx) / 2, (ly + ry) / 2, 18 + tw * 3, 6, tw * 0.3)
      ctx.fill()
      ellipse(ctx, rx + 10, ry - 22, 6, 24, 0.3 + tw * 0.2)
      ctx.fill()
      ellipse(ctx, lx - 6, ly + 14, 5, 12, -0.4)
      ctx.fill()
      dot(ctx, lx, ly, 6, '#f8fafc')
      dot(ctx, rx, ry, 6, '#f8fafc')
    }
    // A bunch of long balloons ready in his belt.
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = CONFETTI[k]
      ellipse(ctx, x - 22 - k * 4, g - 74 - k * 8, 3.5, 20, -0.25 - k * 0.15)
      ctx.fill()
    }
  }
}

// -- party horns -------------------------------------------------------------------------------------------------

function partyHorns(blowing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 222
    const guests: Array<[number, number, Dress, string]> = [
      [60, 0.82, { skin: PEACH, hair: '#ca8a04', shirt: '#f472b6', pants: '#e2e8f0' }, CONFETTI[1]],
      [140, 0.95, { skin: BROWN, hair: '#1c1917', shirt: '#38bdf8', pants: '#cbd5e1' }, CONFETTI[2]],
      [220, 0.78, { skin: TAN, hair: '#7c2d12', shirt: '#a3e635', pants: '#e2e8f0' }, CONFETTI[0]],
    ]
    guests.forEach(([gx, s, d, horn], j) => {
      const bob = Math.abs(Math.sin(p * TAU * (blowing ? 2 : 1) + j)) * (blowing ? 8 : 3)
      const dir = j === 2 ? -1 : 1
      person(ctx, gx, g - bob, s, dir, d, { blink: !blowing && Math.sin(p * TAU + j * 2) > 0.9 }, () => {
        if (blowing) {
          head(ctx, dir * 2, -118, 16, d.skin, dir, { puff: true })
          hair(ctx, dir * 2, -118, dir, d.hair)
        }
        partyHat(ctx, dir * 2, -126, color, color2, dir * 0.15)
        // The horn at the mouth: curled up, or blown out straight with a curl at its tip.
        const mx = dir * 10
        const my = -112
        const u = blowing ? Math.min(1, ((p * 2 + j * 0.15) % 1) / 0.3) : 0
        const len = 6 + u * 44
        ctx.strokeStyle = horn
        ctx.lineWidth = 7
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(mx, my)
        ctx.lineTo(mx + dir * len, my + 2)
        ctx.stroke()
        ctx.lineWidth = 5
        ctx.beginPath()
        ctx.arc(mx + dir * (len + 6), my + 2 + 4 * (1 - u), 6 + (1 - u) * 2, -Math.PI / 2, Math.PI * (1.2 - u * 0.6))
        ctx.stroke()
        dot(ctx, mx - dir * 2, my, 3, '#f8fafc')
        arm(ctx, [-dir * 10, -98, -dir * 2, -100, mx - dir * 2, my + 4], 8, shade(d.shirt, -0.1))
        if (blowing) arm(ctx, [dir * 10, -98, dir * 24, -116, dir * 26, -138], 8, d.shirt)
        else arm(ctx, [dir * 10, -98, dir * 20, -78, dir * 22, -60], 8, d.shirt)
      })
    })
    if (blowing) {
      for (let k = 0; k < 14; k++) {
        const q = (p + k / 14) % 1
        ctx.fillStyle = CONFETTI[k % 5]
        ctx.save()
        ctx.translate(20 + ((k * 37) % 240), 10 + q * 120)
        ctx.rotate(q * 8 + k)
        ctx.fillRect(-4, -2, 8, 4)
        ctx.restore()
      }
    }
  }
}

// -- musical chairs ---------------------------------------------------------------------------------------------

/** A child sitting on a seat at height seatY above (x, g), facing dir, at scale s. */
function seated(ctx: Ctx, x: number, g: number, seatY: number, s: number, dir: number, d: Dress, open = 0) {
  ctx.save()
  ctx.translate(x, g)
  ctx.scale(s, s)
  const sy = -seatY / s
  const pants = d.pants ?? '#64748b'
  arm(ctx, [0, sy, dir * 26, sy, dir * 28, -6], 11, pants)
  ctx.fillStyle = d.shoes ?? '#475569'
  rr(ctx, dir > 0 ? dir * 28 - 6 : dir * 28 - 12, -8, 18, 8, 3)
  ctx.fillStyle = d.shirt
  rr(ctx, -15, sy - 50, 30, 52, 10)
  head(ctx, dir * 2, sy - 62, 16, d.skin, dir, { open })
  hair(ctx, dir * 2, sy - 62, dir, d.hair)
  ctx.restore()
}

function chair(ctx: Ctx, x: number, g: number, c: string, dir: number) {
  ctx.fillStyle = '#94a3b8'
  ctx.fillRect(x - 14, g - 34, 4, 34)
  ctx.fillRect(x + 10, g - 34, 4, 34)
  ctx.fillStyle = c
  rr(ctx, x - 18, g - 40, 36, 7, 3)
  rr(ctx, x - dir * 18 - 3, g - 82, 6, 46, 3)
}

function musicalChairs(scramble: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 212
    const seats = [104, 164, 224]
    const kids: Dress[] = [
      { skin: PEACH, hair: '#ca8a04', shirt: '#f472b6', pants: '#e2e8f0' },
      { skin: BROWN, hair: '#1c1917', shirt: '#38bdf8', pants: '#cbd5e1' },
      { skin: TAN, hair: '#7c2d12', shirt: '#a3e635', pants: '#e2e8f0' },
      { skin: PEACH, hair: '#78350f', shirt: '#facc15', pants: '#cbd5e1' },
    ]
    // The speaker playing (stopped dead for the scramble).
    ctx.fillStyle = color2
    rr(ctx, 6, g - 56, 40, 56, 6)
    for (const [cy, r] of [[-38, 9], [-14, 6]] as const) {
      dot(ctx, 26, g + cy, r + (scramble ? 0 : Math.abs(Math.sin(p * TAU * 4)) * 2), '#e2e8f0')
      dot(ctx, 26, g + cy, r * 0.4, '#94a3b8')
    }
    if (!scramble) {
      for (let k = 0; k < 3; k++) {
        const q = (p * 2 + k / 3) % 1
        ctx.fillStyle = rgba(color, Math.sin(q * Math.PI))
        ctx.font = 'bold 22px sans-serif'
        ctx.fillText(k % 2 ? '♫' : '♪', 22 + q * 20 + k * 6, g - 64 - q * 70)
      }
    }
    const circling = (j: number, at: number) => {
      const a = at * TAU + (j * TAU) / 4
      return { x: 164 + Math.cos(a) * 92, back: Math.sin(a) < 0, dir: Math.sin(a) < 0 ? 1 : -1 }
    }
    if (!scramble) {
      // Marching round the chairs: the ones going behind first, then the chairs, then the ones in front.
      const at = p * 0.5
      const order = [0, 1, 2, 3].map((j) => ({ j, ...circling(j, at) }))
      const walk = (o: (typeof order)[number]) =>
        person(ctx, o.x, g - (o.back ? 8 : 0), o.back ? 0.5 : 0.58, o.dir, kids[o.j], { stride: Math.sin(p * TAU * 4 + o.j) * 0.6 }, () => {
          arm(ctx, [-10, -98, -14, -76, -12 + Math.sin(p * TAU * 4) * 3, -58], 8, kids[o.j].shirt)
          arm(ctx, [10, -98, 14, -76, 12, -58], 8, kids[o.j].shirt)
        })
      order.filter((o) => o.back).forEach(walk)
      seats.forEach((sx, k) => chair(ctx, sx, g, k % 2 ? color2 : color, k === 1 ? -1 : 1))
      order.filter((o) => !o.back).forEach(walk)
      return
    }
    // The music stops: three dive for the chairs and one is left standing.
    seats.forEach((sx, k) => chair(ctx, sx, g, k % 2 ? color2 : color, k === 1 ? -1 : 1))
    const u = Math.min(1, p / 0.3)
    const start = [0, 1, 2, 3].map((j) => circling(j, 0.1))
    for (let j = 0; j < 3; j++) {
      if (u < 1) {
        const sx = start[j].x + (seats[j] - start[j].x) * u
        person(ctx, sx, g, 0.58, seats[j] > start[j].x ? 1 : -1, kids[j], { stride: Math.sin(u * 12) * 0.8, open: 0.6 })
      } else {
        const dir = j === 1 ? -1 : 1
        seated(ctx, seats[j] + dir * 2, g, 40, 0.58, dir, kids[j], 0.5)
      }
    }
    // The one left out, hands on head.
    const lx = 60 + (1 - u) * 10
    person(ctx, lx, g, 0.58, 1, kids[3], { open: 0.9 }, () => {
      arm(ctx, [-10, -98, -24, -122, -10, -134], 8, kids[3].shirt)
      arm(ctx, [10, -98, 26, -122, 14, -134], 8, kids[3].shirt)
    })
  }
}

// -- pin the tail on the donkey --------------------------------------------------------------------------------

function pinTheTail(pinned: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 242
    // The donkey poster on the fence.
    ctx.fillStyle = '#d6d3d1'
    ctx.fillRect(196, g - 60, 6, 60)
    ctx.fillRect(262, g - 60, 6, 60)
    ctx.fillStyle = '#f8fafc'
    rr(ctx, 182, g - 176, 96, 120, 4)
    ctx.fillStyle = '#94a3b8'
    ellipse(ctx, 236, g - 104, 26, 16)
    ctx.fill()
    for (const lx of [218, 228, 244, 254]) ctx.fillRect(lx - 2, g - 92, 5, 26)
    ctx.save()
    ctx.translate(208, g - 128)
    ctx.rotate(-0.5)
    ellipse(ctx, 0, 0, 9, 15)
    ctx.fill()
    ctx.restore()
    ellipse(ctx, 198, g - 140, 4, 10, -0.2)
    ctx.fill()
    ellipse(ctx, 206, g - 142, 4, 10, 0.3)
    ctx.fill()
    dot(ctx, 204, g - 128, 1.8, '#1f2937')
    // An X where the tail belongs.
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(258, g - 110)
    ctx.lineTo(266, g - 102)
    ctx.moveTo(266, g - 110)
    ctx.lineTo(258, g - 102)
    ctx.stroke()
    const tail = (tx: number, ty: number, a: number) => {
      ctx.save()
      ctx.translate(tx, ty)
      ctx.rotate(a)
      ctx.strokeStyle = '#d6d3d1'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.quadraticCurveTo(8, 10, 2, 22)
      ctx.stroke()
      for (let k = -1; k <= 1; k++) arm(ctx, [2, 22, 2 + k * 5, 32], 3, '#d6d3d1')
      dot(ctx, 0, 0, 3.5, color2)
      ctx.restore()
    }
    const d: Dress = { skin: PEACH, hair: '#78350f', shirt: color2, pants: '#cbd5e1' }
    if (!pinned) {
      // Blindfolded and spun round: stumbling about, arms out, tail in hand.
      const sway = Math.sin(p * TAU)
      const x = 100 + sway * 14
      ctx.save()
      ctx.translate(x, g)
      ctx.rotate(sway * 0.06)
      ctx.translate(-x, -g)
      standing(ctx, x, g, 1, d, { stride: Math.sin(p * TAU * 2) * 0.5 })
      ctx.fillStyle = color
      ctx.fillRect(x - 15, g - 126, 30, 7)
      arm(ctx, [x - 10, g - 98, x - 30, g - 104, x - 48, g - 110 + sway * 6], 9, d.shirt)
      const [hx, hy] = arm(ctx, [x + 10, g - 98, x + 32, g - 104, x + 52, g - 112 - sway * 6], 9, d.shirt)
      dot(ctx, hx, hy, 5, d.skin)
      tail(hx + 2, hy, 0.4)
      ctx.restore()
      return
    }
    // It goes on: right on the donkey's nose. Off comes the blindfold.
    const u = Math.min(1, p / 0.35)
    const x = 100 + u * 42
    standing(ctx, x, g, 1, d, { stride: u < 1 ? Math.sin(u * 14) * 0.5 : 0, open: u >= 1 ? 0.9 : 0 })
    ctx.fillStyle = color
    ctx.fillRect(x - 15, g - (u >= 1 ? 142 : 126), 30, 7)
    if (u < 1) {
      const [hx, hy] = arm(ctx, [x + 10, g - 98, x + 32, g - 108, x + 52, g - 118], 9, d.shirt)
      dot(ctx, hx, hy, 5, d.skin)
      tail(hx + 2, hy, 0.4)
      arm(ctx, [x - 10, g - 98, x - 26, g - 84, x - 28, g - 66], 9, d.shirt)
    } else {
      tail(196, g - 124, -0.6)
      arm(ctx, [x - 10, g - 98, x - 20, g - 120, x - 8, g - 136], 9, d.shirt)
      arm(ctx, [x + 10, g - 98, x + 22, g - 120, x + 12, g - 136], 9, d.shirt)
      // A friend laughing and pointing.
      const fd: Dress = { skin: BROWN, hair: '#1c1917', shirt: '#38bdf8', pants: '#e2e8f0' }
      person(ctx, 40, g, 0.8, 1, fd, { open: 0.5 + 0.4 * Math.abs(Math.sin(p * 24)) }, () => {
        arm(ctx, [10, -98, 34, -106, 56, -112], 9, fd.shirt)
        arm(ctx, [-10, -98, -14, -74, -4, -62], 9, fd.shirt)
      })
    }
  }
}

// -- the limbo -------------------------------------------------------------------------------------------------

/** Level: the bar lower and the dancer bent further back under it, as people come. */
function limbo(ctx: Ctx, f: number, n: number, { color, color2 }: SpriteColors) {
  const k = f / (n - 1)
  const g = 222
  const barY = g - 150 + k * 66
  for (const px of [44, 216]) {
    ctx.fillStyle = color2
    rr(ctx, px - 4, g - 170, 8, 170, 3)
    ctx.fillStyle = '#e2e8f0'
    rr(ctx, px - 14, g - 6, 28, 6, 3)
  }
  // The bar, striped like a candy cane.
  ctx.fillStyle = '#f8fafc'
  rr(ctx, 40, barY - 4, 180, 8, 4)
  ctx.fillStyle = color
  for (let j = 0; j < 9; j++) ctx.fillRect(48 + j * 20, barY - 4, 8, 8)
  // The dancer: knees bent, leaning back further and further.
  const lean = 0.2 + k * 1.05
  const fx = 152
  const knee = [166, g - 36 + k * 8]
  const hip = [136, g - 62 + k * 24]
  const top = [hip[0] - Math.sin(lean) * 52, hip[1] - Math.cos(lean) * 52]
  const hd = [top[0] - Math.sin(lean) * 20, top[1] - Math.cos(lean) * 20]
  arm(ctx, [fx - 14, g - 4, knee[0] - 10, knee[1] + 2, hip[0], hip[1]], 11, TAN)
  arm(ctx, [fx + 6, g - 4, knee[0], knee[1], hip[0] + 4, hip[1]], 11, shade(TAN, -0.1))
  ctx.fillStyle = '#e2e8f0'
  rr(ctx, fx - 22, g - 8, 16, 8, 3)
  rr(ctx, fx - 2, g - 8, 16, 8, 3)
  // A grass skirt round the hips.
  ctx.strokeStyle = '#bef264'
  ctx.lineWidth = 3
  for (let j = -4; j <= 4; j++) {
    ctx.beginPath()
    ctx.moveTo(hip[0] + j * 3, hip[1] - 4)
    ctx.lineTo(hip[0] + j * 4 + 8, hip[1] + 22)
    ctx.stroke()
  }
  arm(ctx, [hip[0], hip[1], top[0], top[1]], 26, color)
  // A flower lei round the neck.
  for (let j = 0; j < 6; j++) dot(ctx, top[0] + Math.cos(j * 1.1) * 12, top[1] + Math.sin(j * 1.1) * 6, 4, CONFETTI[j % 5])
  head(ctx, hd[0], hd[1], 14, TAN, -1, { open: k > 0.6 ? 0.5 : 0 })
  ctx.fillStyle = '#1c1917'
  ctx.beginPath()
  ctx.arc(hd[0], hd[1] - 2, 15, Math.PI * 1.1, Math.PI * 2.1)
  ctx.fill()
  // Arms out wide for balance, wobbling more the lower it gets.
  const wob = Math.sin(f * 2.3) * k * 6
  arm(ctx, [top[0], top[1], top[0] - 26, top[1] + 6 + wob, top[0] - 48, top[1] + 2 + wob], 8, TAN)
  arm(ctx, [top[0] + 4, top[1] + 4, top[0] + 26, top[1] - 6 - wob, top[0] + 46, top[1] - 16 - wob], 8, TAN)
}

// -- a sack race ------------------------------------------------------------------------------------------------

function sackRace(waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 222
    const racers: Array<[number, number, Dress]> = [
      [62, 0, { skin: PEACH, hair: '#ca8a04', shirt: color, pants: color }],
      [148, 0.5, { skin: BROWN, hair: '#1c1917', shirt: color2, pants: color2 }],
    ]
    for (const [x, ph, d] of racers) {
      const hop = Math.abs(Math.sin((p + ph) * TAU)) * 30
      const y = g - hop
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(0.9, 0.9)
      // The sack from the waist down, squashed a little as it lands.
      const squash = hop < 6 ? 4 : 0
      ctx.fillStyle = '#e7d3a6'
      ctx.beginPath()
      ctx.moveTo(-20, -76)
      ctx.lineTo(20, -76)
      ctx.quadraticCurveTo(26 + squash, -30, 22 + squash, 0)
      ctx.lineTo(-22 - squash, 0)
      ctx.quadraticCurveTo(-26 - squash, -30, -20, -76)
      ctx.fill()
      ctx.strokeStyle = '#b8a07a'
      ctx.lineWidth = 2
      for (let j = 0; j < 3; j++) {
        ctx.beginPath()
        ctx.moveTo(-14 + j * 12, -64)
        ctx.lineTo(-12 + j * 12, -12)
        ctx.stroke()
      }
      ctx.fillStyle = d.shirt
      rr(ctx, -15, -110, 30, 40, 10)
      head(ctx, 2, -122, 16, d.skin, 1, { open: waving ? 0.8 : hop > 20 ? 0.4 : 0 })
      hair(ctx, 2, -122, 1, d.hair)
      // Both fists gripping the top of the sack, or one waving.
      arm(ctx, [-10, -102, -20, -86, -18, -74], 8, d.shirt)
      dot(ctx, -18, -74, 5, d.skin)
      if (waving) {
        const w = Math.sin(p * TAU * 3) * 10
        arm(ctx, [10, -102, 24, -122, 30 + w, -144], 8, d.shirt)
        dot(ctx, 30 + w, -146, 5, d.skin)
      } else {
        arm(ctx, [10, -102, 22, -86, 18, -74], 8, d.shirt)
        dot(ctx, 18, -74, 5, d.skin)
      }
      ctx.restore()
      // A shadow on the grass.
      ctx.fillStyle = rgba('#94a3b8', 0.25)
      ellipse(ctx, x, g - 2, 24 - hop * 0.3, 4)
      ctx.fill()
    }
  }
}

// -- a face painter ----------------------------------------------------------------------------------------------

function facePainter(reveal: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 242
    // The painter with a palette, dabbing at a child on a stool.
    const pd: Dress = { skin: TAN, hair: '#1c1917', shirt: color, pants: '#cbd5e1' }
    standing(ctx, 66, g, 1, pd, { open: reveal ? 0.5 : 0 })
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(52, g - 106)
    ctx.lineTo(80, g - 106)
    ctx.lineTo(84, g - 50)
    ctx.lineTo(48, g - 50)
    ctx.fill()
    for (let k = 0; k < 5; k++) dot(ctx, 54 + k * 6, g - 66 + (k % 2) * 4, 2.5, CONFETTI[k])
    const [px, py] = arm(ctx, [56, g - 98, 40, g - 80, 30, g - 84], 9, color)
    ctx.fillStyle = '#e7d3a6'
    ellipse(ctx, px - 4, py - 4, 22, 12, -0.2)
    ctx.fill()
    for (let k = 0; k < 4; k++) dot(ctx, px - 16 + k * 9, py - 6 + (k % 2) * 4, 4, ['#fb923c', '#1f2937', '#f8fafc', '#38bdf8'][k])
    const stool = { x: 166, seat: 52 }
    ctx.fillStyle = '#d6d3d1'
    ctx.fillRect(stool.x - 16, g - stool.seat, 4, stool.seat)
    ctx.fillRect(stool.x + 12, g - stool.seat, 4, stool.seat)
    ctx.fillStyle = color2
    rr(ctx, stool.x - 20, g - stool.seat - 6, 40, 8, 3)
    const kid: Dress = { skin: PEACH, hair: '#ca8a04', shirt: color2, pants: '#e2e8f0' }
    const dir = reveal ? 1 : -1
    seated(ctx, stool.x, g, stool.seat, 0.8, dir, kid)
    // The kid's face (tiger stripes, nose and whiskers going on as the painter works).
    const s = 0.8
    const hx = stool.x + dir * 2 * s
    const hy = g - stool.seat - 62 * s
    const done = reveal ? 1 : 0.35 + 0.6 * p
    ctx.save()
    ctx.beginPath()
    ctx.arc(hx, hy, 16 * s, 0, TAU)
    ctx.clip()
    ctx.fillStyle = rgba('#fb923c', 0.9)
    ctx.fillRect(hx - 16 * s, hy - 16 * s, 32 * s * done, 32 * s)
    ctx.restore()
    hair(ctx, hx, hy + 2, dir, kid.hair)
    ctx.strokeStyle = '#7c2d12'
    ctx.lineWidth = 2
    for (let k = 0; k < 3; k++) {
      if (k / 3 > done) break
      ctx.beginPath()
      ctx.moveTo(hx - dir * 10 + dir * k * 4, hy - 12)
      ctx.lineTo(hx - dir * 6 + dir * k * 4, hy - 4)
      ctx.stroke()
    }
    for (const ex of [hx + dir * 1, hx + dir * 9]) dot(ctx, ex, hy - 2, 1.8, '#1f2937')
    if (reveal) {
      // The painter steps back, brush raised, to admire it.
      arm(ctx, [76, g - 98, 92, g - 118, 98, g - 140], 9, color)
      dot(ctx, 98, g - 142, 5, pd.skin)
      dot(ctx, hx + dir * 12, hy + 3, 2.5, '#1f2937')
      ctx.strokeStyle = '#f8fafc'
      ctx.lineWidth = 1.2
      for (const wy of [-1, 2, 5]) {
        ctx.beginPath()
        ctx.moveTo(hx + dir * 12, hy + 4)
        ctx.lineTo(hx + dir * 22, hy + wy)
        ctx.stroke()
      }
      // A roar: mouth wide, both hands up as claws.
      ctx.fillStyle = '#7f1d1d'
      ellipse(ctx, hx + dir * 7, hy + 7, 4, 3 + 2 * Math.abs(Math.sin(p * TAU * 2)))
      ctx.fill()
      const cl = Math.sin(p * TAU * 2) * 3
      arm(ctx, [hx - 6, hy + 22, hx + 6, hy + 4, hx + 14, hy - 10 + cl], 7, kid.shirt)
      arm(ctx, [hx + 6, hy + 22, hx + 24, hy + 10, hx + 30, hy - 4 - cl], 7, kid.shirt)
      dot(ctx, hx + 14, hy - 12 + cl, 4.5, '#fb923c')
      dot(ctx, hx + 30, hy - 6 - cl, 4.5, '#fb923c')
    } else {
      // The brush at work on the child's cheek.
      const dab = Math.sin(p * TAU * 3) * 3
      const [bx, by] = arm(ctx, [76, g - 98, 100, g - 116, 126 + dab, hy - 6], 9, color)
      dot(ctx, bx, by, 5, pd.skin)
      ctx.strokeStyle = '#e7d3a6'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.lineTo(bx + 18, by - 2)
      ctx.stroke()
      dot(ctx, bx + 19, by - 2, 2.5, '#fb923c')
    }
  }
}

// -- a karaoke singer --------------------------------------------------------------------------------------------

function karaoke(belting: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 262
    // The words on the screen, the bouncing ball going along them.
    ctx.fillStyle = '#e2e8f0'
    rr(ctx, 130, g - 200, 64, 46, 4)
    ctx.fillStyle = '#94a3b8'
    ctx.fillRect(158, g - 154, 8, 20)
    ctx.fillStyle = '#64748b'
    for (let k = 0; k < 3; k++) rr(ctx, 138, g - 192 + k * 12, 48 - (k % 2) * 12, 5, 2)
    dot(ctx, 140 + ((p * 3) % 1) * 44, g - 196 - Math.abs(Math.sin(p * TAU * 6)) * 6 + Math.floor((p * 3) % 3) * 12, 3, color2)
    if (belting) {
      // A spotlight on the singer.
      const sp = ctx.createLinearGradient(72, 0, 72, g)
      sp.addColorStop(0, rgba('#fef9c3', 0))
      sp.addColorStop(1, rgba('#fef9c3', 0.35))
      ctx.fillStyle = sp
      ctx.beginPath()
      ctx.moveTo(60, 0)
      ctx.lineTo(84, 0)
      ctx.lineTo(126, g)
      ctx.lineTo(20, g)
      ctx.fill()
    }
    const sway = Math.sin(p * TAU) * (belting ? 0.08 : 0.04)
    const x = 72
    ctx.save()
    ctx.translate(x, g)
    ctx.rotate(sway)
    ctx.translate(-x, -g)
    const d: Dress = { skin: BROWN, hair: '#1c1917', shirt: color, pants: '#cbd5e1' }
    standing(ctx, x, g, 1, d, { open: belting ? 0.6 + 0.4 * Math.abs(Math.sin(p * TAU * 2)) : 0.3 * Math.abs(Math.sin(p * TAU * 2)), blink: belting })
    // Sequins on the jacket.
    for (let k = 0; k < 6; k++) dot(ctx, x - 10 + (k % 3) * 10, g - 96 + Math.floor(k / 3) * 22, 2, rgba('#ffffff', 0.5 + 0.5 * Math.sin(p * TAU * 3 + k)))
    // Microphone in one hand at the mouth; the other arm thrown out wide for the big note.
    const [mx, my] = arm(ctx, [x + 10, g - 98, x + 22, g - 96, x + 24, g - 112], 9, color)
    ctx.fillStyle = '#cbd5e1'
    ctx.save()
    ctx.translate(mx, my)
    ctx.rotate(-0.4)
    rr(ctx, -3, -2, 6, 18, 2)
    ctx.restore()
    dot(ctx, mx + 2, my - 4, 6, '#94a3b8')
    dot(ctx, mx, my, 5, d.skin)
    if (belting) arm(ctx, [x - 10, g - 98, x - 34, g - 116, x - 52, g - 138], 9, color)
    else arm(ctx, [x - 10, g - 98, x - 20, g - 78, x - 14 + Math.sin(p * TAU) * 4, g - 62], 9, color)
    ctx.restore()
  }
}

// -- a DJ --------------------------------------------------------------------------------------------------------

function djBooth(drop: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 232
    if (drop) {
      // Light beams sweeping from the booth.
      for (let k = 0; k < 4; k++) {
        const a = -Math.PI / 2 + Math.sin(p * TAU + k * 1.6) * 0.8
        ctx.strokeStyle = rgba(CONFETTI[k], 0.4)
        ctx.lineWidth = 10
        ctx.beginPath()
        ctx.moveTo(130, g - 96)
        ctx.lineTo(130 + Math.cos(a) * 240, g - 96 + Math.sin(a) * 240)
        ctx.stroke()
      }
    }
    const x = 130
    const bounce = Math.abs(Math.sin(p * TAU * 2)) * (drop ? 10 : 3)
    const d: Dress = { skin: TAN, hair: '#1c1917', shirt: color, pants: '#94a3b8' }
    standing(ctx, x, g - 40 - bounce, 1, d, { open: drop ? 0.7 : 0 })
    // Headphones.
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(x + 2, g - 158 - bounce, 18, Math.PI * 1.05, Math.PI * 1.95)
    ctx.stroke()
    dot(ctx, x - 14, g - 152 - bounce, 6, color2)
    if (drop) {
      // Both hands in the air.
      arm(ctx, [x - 10, g - 138 - bounce, x - 26, g - 164 - bounce, x - 30, g - 190 - bounce], 9, color)
      arm(ctx, [x + 10, g - 138 - bounce, x + 26, g - 164 - bounce, x + 30, g - 190 - bounce], 9, color)
    } else {
      // A hand on the record scratching back and forth, the other pressing the headphone to an ear.
      const sc = Math.sin(p * TAU * 2) * 6
      arm(ctx, [x + 10, g - 138 - bounce, x + 34, g - 120, x + 52 + sc, g - 104], 9, color)
      arm(ctx, [x - 10, g - 138 - bounce, x - 22, g - 150 - bounce, x - 16, g - 158 - bounce], 9, color)
    }
    // The booth with its two turntables and speakers.
    ctx.fillStyle = color2
    rr(ctx, 40, g - 100, 180, 100, 8)
    ctx.fillStyle = '#e2e8f0'
    rr(ctx, 44, g - 110, 172, 12, 4)
    for (const tx of [82, 178]) {
      ctx.fillStyle = '#cbd5e1'
      ellipse(ctx, tx, g - 112, 26, 6)
      ctx.fill()
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 1.5
      const turn = p * TAU * 2
      ctx.beginPath()
      ctx.moveTo(tx + Math.cos(turn) * 22, g - 112 + Math.sin(turn) * 5)
      ctx.lineTo(tx - Math.cos(turn) * 22, g - 112 - Math.sin(turn) * 5)
      ctx.stroke()
    }
    for (const sx of [72, 188]) {
      const thump = drop || Math.sin(p * TAU * 4) > 0 ? 2 : 0
      dot(ctx, sx, g - 54, 22 + thump, shade(color2, 0.25))
      dot(ctx, sx, g - 54, 9, shade(color2, -0.15))
    }
    ctx.fillStyle = drop ? rgba('#fef08a', 0.9) : shade(color2, 0.2)
    for (let k = 0; k < 5; k++) rr(ctx, 112 + k * 8, g - 80 + (k % 2 ? 4 : 0), 5, 30 - (k % 2) * 8, 2)
  }
}

// -- a graduate crossing the stage -----------------------------------------------------------------------------

function diplomaWalk(given: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 262
    // The stage edge.
    ctx.fillStyle = '#d6d3d1'
    rr(ctx, 0, g - 6, 280, 6, 2)
    // The principal, holding out the diploma.
    const pd: Dress = { skin: PEACH, hair: '#d6d3d1', shirt: '#cbd5e1', pants: '#94a3b8' }
    standing(ctx, 206, g - 6, -1, pd, { bald: true })
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(204, g - 104)
    ctx.lineTo(210, g - 90)
    ctx.lineTo(204, g - 70)
    ctx.lineTo(198, g - 90)
    ctx.fill()
    const scroll = (sx: number, sy: number, a: number) => {
      ctx.save()
      ctx.translate(sx, sy)
      ctx.rotate(a)
      ctx.fillStyle = '#f8fafc'
      rr(ctx, -20, -5, 40, 10, 5)
      ctx.fillStyle = '#e2e8f0'
      ellipse(ctx, -20, 0, 3, 5)
      ctx.fill()
      ctx.fillStyle = color2
      ctx.fillRect(-3, -6, 6, 12)
      ctx.restore()
    }
    // The graduate in cap and gown.
    const gd: Dress = { skin: BROWN, hair: '#1c1917', shirt: color, pants: color, shoes: '#e2e8f0' }
    const u = given ? Math.min(1, p / 0.3) : 0
    const x = given ? 116 + u * 20 : 108 + Math.sin(p * TAU) * 3
    standing(ctx, x, g - 6, 1, gd, { skirt: true, open: given && p > 0.4 ? 0.8 : 0, stride: given && u < 1 ? Math.sin(u * 12) * 0.5 : 0 })
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(x - 10, g - 106)
    ctx.lineTo(x + 2, g - 92)
    ctx.lineTo(x + 14, g - 106)
    ctx.lineTo(x + 8, g - 78)
    ctx.lineTo(x - 4, g - 78)
    ctx.fill()
    mortarboard(ctx, x + 2, g - 124, color, color2, Math.sin(p * TAU) * 3)
    if (!given) {
      // Waiting a step away; the principal holds it ready.
      arm(ctx, [196, g - 104, 182, g - 92, 168, g - 98], 9, pd.shirt)
      dot(ctx, 168, g - 98, 5, pd.skin)
      scroll(162, g - 102, -0.2)
      arm(ctx, [x + 10, g - 104, x + 18, g - 82, x + 16, g - 66], 9, color)
      arm(ctx, [x - 10, g - 104, x - 16, g - 82, x - 12, g - 66], 9, shade(color, -0.1))
      return
    }
    if (p < 0.55) {
      // A handshake, the diploma passing over.
      const shake = Math.sin(p * TAU * 6) * 3
      arm(ctx, [196, g - 104, 182, g - 92, 166, g - 92 + shake], 9, pd.shirt)
      arm(ctx, [x + 10, g - 104, x + 20, g - 92, 160, g - 92 + shake], 9, color)
      dot(ctx, 163, g - 92 + shake, 6, gd.skin)
      arm(ctx, [214, g - 104, 196, g - 116, 176, g - 118], 9, shade(pd.shirt, -0.1))
      scroll(170, g - 122, 0)
      arm(ctx, [x - 10, g - 104, x - 16, g - 82, x - 12, g - 66], 9, shade(color, -0.1))
    } else {
      // Diploma held high, and the camera flashes go off.
      arm(ctx, [196, g - 104, 186, g - 82, 188, g - 66], 9, pd.shirt)
      const [hx, hy] = arm(ctx, [x + 10, g - 104, x + 22, g - 136, x + 24, g - 164], 9, color)
      scroll(hx, hy - 4, -0.9)
      arm(ctx, [x - 10, g - 104, x - 26, g - 120, x - 34, g - 140], 9, shade(color, -0.1))
      for (let k = 0; k < 3; k++) {
        const on = Math.sin(p * 40 + k * 2.1) > 0.6
        if (on) twinkle(ctx, 20 + k * 110, 30 + (k % 2) * 30, 14, 0.9)
      }
    }
  }
}

// -- a graduate by this year's "Class of" sign ------------------------------------------------------------------

/** The years the yard sign can show, one picture each (the frame counts yearIndex × poses). */
export const CLASS_YEARS = 12
export const CLASS_FIRST_YEAR = 2025
export const CLASS_POSES = 4
export const CLASS_TOSS = 6

function classOf(tossing: boolean) {
  return (ctx: Ctx, f: number, _frames: number, { color, color2 }: SpriteColors) => {
    const poses = tossing ? CLASS_TOSS : CLASS_POSES
    const year = CLASS_FIRST_YEAR + Math.floor(f / poses)
    const p = (f % poses) / poses
    const g = 262
    // The yard sign on its stakes: "Class of 2027".
    ctx.fillStyle = '#d6d3d1'
    ctx.fillRect(160, g - 70, 4, 70)
    ctx.fillRect(222, g - 70, 4, 70)
    ctx.fillStyle = '#f8fafc'
    rr(ctx, 146, g - 152, 94, 86, 6)
    ctx.fillStyle = color
    rr(ctx, 150, g - 148, 86, 22, 4)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#f8fafc'
    ctx.font = 'bold 15px "Countdown Caps", "Cinzel", Georgia, serif'
    ctx.fillText('CLASS OF', 193, g - 136)
    ctx.fillStyle = color
    ctx.font = 'bold 36px "Countdown Display", "Playfair Display", Georgia, serif'
    ctx.fillText(String(year), 193, g - 94)
    ctx.fillStyle = color2
    for (let k = 0; k < 5; k++) dot(ctx, 158 + k * 17, g - 72, 3, color2)
    // The graduate.
    const x = 78
    const gd: Dress = { skin: PEACH, hair: '#78350f', shirt: color, pants: color, shoes: '#e2e8f0' }
    standing(ctx, x, g, 1, gd, { skirt: true, open: tossing ? 0.8 : 0, blink: !tossing && f % poses === 2 })
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(x - 10, g - 106)
    ctx.lineTo(x + 2, g - 92)
    ctx.lineTo(x + 14, g - 106)
    ctx.lineTo(x + 8, g - 74)
    ctx.lineTo(x - 4, g - 74)
    ctx.fill()
    if (!tossing) {
      mortarboard(ctx, x + 2, g - 124, color, color2, Math.sin(p * TAU) * 3)
      // Pointing proudly at the sign.
      arm(ctx, [x + 10, g - 98, x + 34, g - 104, x + 56, g - 110 + Math.sin(p * TAU) * 2], 9, color)
      dot(ctx, x + 56, g - 110 + Math.sin(p * TAU) * 2, 5, gd.skin)
      arm(ctx, [x - 10, g - 98, x - 16, g - 78, x - 12, g - 62], 9, shade(color, -0.1))
      return
    }
    // The cap thrown high and spinning; arms up in a cheer.
    const air = Math.sin(p * Math.PI)
    const cx = x + 12
    const cy = g - 150 - air * 90
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(p * TAU * 1.5)
    mortarboard(ctx, 0, 24, color, color2, 4)
    ctx.restore()
    hair(ctx, x + 2, g - 118, 1, gd.hair)
    arm(ctx, [x - 10, g - 98, x - 24, g - 124, x - 28, g - 150], 9, shade(color, -0.1))
    arm(ctx, [x + 10, g - 98, x + 24, g - 124, x + 28 - air * 8, g - 150 - air * 6], 9, color)
    for (let k = 0; k < 8; k++) {
      const q = (p + k / 8) % 1
      ctx.fillStyle = k % 2 ? color2 : '#f8fafc'
      ctx.fillRect(20 + k * 30, 10 + q * 110, 6, 4)
    }
  }
}

// -- a graduation car parade ----------------------------------------------------------------------------------

function gradParade(honking: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 212
    const bob = Math.sin(p * TAU * 2) * 1.5
    // Balloons tied to the back, streamers blowing behind.
    for (let k = 0; k < 3; k++) {
      const bx = 34 + k * 14 + Math.sin(p * TAU + k) * 3
      const by = g - 150 - k * 10
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(48, g - 70)
      ctx.lineTo(bx, by + 14)
      ctx.stroke()
      ctx.fillStyle = k === 1 ? '#f8fafc' : color2
      ellipse(ctx, bx, by, 11, 14)
      ctx.fill()
    }
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = CONFETTI[k + 1]
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(30, g - 60 + k * 8)
      for (let s = 1; s <= 4; s++) ctx.lineTo(30 - s * 8, g - 60 + k * 8 + Math.sin(p * TAU * 3 + s + k) * 5)
      ctx.stroke()
    }
    ctx.save()
    ctx.translate(0, bob)
    // The car.
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(30, g - 28)
    ctx.lineTo(30, g - 62)
    ctx.quadraticCurveTo(32, g - 70, 52, g - 72)
    ctx.lineTo(92, g - 74)
    ctx.lineTo(114, g - 108)
    ctx.lineTo(186, g - 108)
    ctx.lineTo(214, g - 74)
    ctx.lineTo(252, g - 68)
    ctx.quadraticCurveTo(264, g - 62, 262, g - 28)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = rgba('#e2e8f0', 0.55)
    ctx.beginPath()
    ctx.moveTo(102, g - 76)
    ctx.lineTo(120, g - 102)
    ctx.lineTo(148, g - 102)
    ctx.lineTo(148, g - 76)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(156, g - 76)
    ctx.lineTo(156, g - 102)
    ctx.lineTo(182, g - 102)
    ctx.lineTo(204, g - 76)
    ctx.fill()
    ctx.fillStyle = '#fef9c3'
    rr(ctx, 252, g - 62, 10, 8, 3)
    ctx.fillStyle = '#fca5a5'
    rr(ctx, 30, g - 60, 6, 10, 2)
    // A giant cap on the roof.
    mortarboard(ctx, 150, g - 92, '#f8fafc', color2, Math.sin(p * TAU * 2) * 4, -1)
    // Ribbons and a big bow on the bonnet.
    ctx.fillStyle = color2
    ellipse(ctx, 228, g - 74, 12, 7, -0.4)
    ctx.fill()
    ellipse(ctx, 244, g - 74, 12, 7, 0.4)
    ctx.fill()
    dot(ctx, 236, g - 74, 5, shade(color2, -0.15))
    // The graduate leaning out of the window, cap on, waving a diploma (and cheering for people).
    const hx = 176
    const hy = g - 94
    head(ctx, hx, hy, 13, TAN, 1, { open: honking ? 0.8 : 0 })
    hair(ctx, hx, hy + 1, 1, '#1c1917')
    ctx.save()
    ctx.translate(hx, hy)
    ctx.scale(0.8, 0.8)
    mortarboard(ctx, 0, -2, shade(color, 0.3), color2, 2)
    ctx.restore()
    if (honking) {
      const w = Math.sin(p * TAU * 3) * 10
      arm(ctx, [hx + 6, hy + 16, hx + 22, hy - 6, hx + 26 + w, hy - 28], 7, color2)
      ctx.fillStyle = '#f8fafc'
      rr(ctx, hx + 20 + w, hy - 42, 10, 24, 4)
    } else {
      arm(ctx, [hx + 4, hy + 18, hx + 22, hy + 18, hx + 30, hy + 20], 7, color2)
    }
    ctx.restore()
    for (const wx of [70, 222]) vehicleWheel(ctx, wx, g - 20, 20, p * TAU * 2)
    if (honking) {
      // Honk honk: sound waves from the front.
      ctx.strokeStyle = rgba('#f8fafc', 0.8)
      ctx.lineWidth = 3
      for (let k = 0; k < 2; k++) {
        const r = 8 + ((p * 4 + k * 0.5) % 1) * 18
        ctx.beginPath()
        ctx.arc(266, g - 58, r, -0.7, 0.7)
        ctx.stroke()
      }
    }
  }
}

// -- the valedictorian's speech ------------------------------------------------------------------------------

function valedictorian(cheering: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 262
    const x = 92
    const gd: Dress = { skin: TAN, hair: '#1c1917', shirt: color, pants: color, shoes: '#e2e8f0' }
    standing(ctx, x, g, 1, gd, { skirt: true, open: cheering ? 0.9 : 0.4 * Math.abs(Math.sin(p * TAU * 3)) })
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(x - 10, g - 106)
    ctx.lineTo(x + 2, g - 92)
    ctx.lineTo(x + 14, g - 106)
    ctx.lineTo(x + 8, g - 74)
    ctx.lineTo(x - 4, g - 74)
    ctx.fill()
    if (cheering) {
      // Cap thrown up off the head, both fists in the air.
      const air = Math.sin(p * Math.PI)
      ctx.save()
      ctx.translate(x + 10, g - 150 - air * 60)
      ctx.rotate(p * TAU)
      mortarboard(ctx, 0, 24, color, color2, 4)
      ctx.restore()
      hair(ctx, x + 2, g - 118, 1, gd.hair)
      arm(ctx, [x - 10, g - 98, x - 26, g - 122, x - 30, g - 148], 9, shade(color, -0.1))
      arm(ctx, [x + 10, g - 98, x + 26, g - 122, x + 30, g - 148], 9, color)
      dot(ctx, x - 30, g - 150, 6, gd.skin)
      dot(ctx, x + 30, g - 150, 6, gd.skin)
    } else {
      mortarboard(ctx, x + 2, g - 124, color, color2, Math.sin(p * TAU) * 2)
      // Speaking: one hand on the podium, the other making a point.
      const pt = Math.sin(p * TAU * 2) * 8
      arm(ctx, [x + 10, g - 98, x + 30, g - 90, x + 44, g - 98], 9, color)
      arm(ctx, [x - 10, g - 98, x - 28, g - 110 - pt, x - 36, g - 128 - pt], 9, shade(color, -0.1))
      dot(ctx, x - 36, g - 130 - pt, 5, gd.skin)
    }
    // The podium with the school's seal and a microphone.
    ctx.fillStyle = '#e7d3b0'
    ctx.beginPath()
    ctx.moveTo(110, g - 96)
    ctx.lineTo(186, g - 96)
    ctx.lineTo(178, g)
    ctx.lineTo(118, g)
    ctx.fill()
    ctx.fillStyle = '#d6c29a'
    rr(ctx, 106, g - 104, 84, 10, 3)
    dot(ctx, 148, g - 56, 18, color2)
    dot(ctx, 148, g - 56, 12, '#f8fafc')
    ctx.strokeStyle = color2
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(140, g - 56)
    ctx.lineTo(148, g - 64)
    ctx.lineTo(156, g - 56)
    ctx.lineTo(148, g - 50)
    ctx.closePath()
    ctx.stroke()
    arm(ctx, [126, g - 104, 120, g - 120, 112, g - 126], 3, '#94a3b8')
    dot(ctx, 110, g - 128, 5, '#cbd5e1')
  }
}

const BUBBLE = { id: 'bubble', frames: 1, w: 360, h: 140 }

export const CELEBRATION_ROWS: Record<string, SpriteRow[]> = {
  'bounce-house': [
    { id: 'main', frames: 8, w: 260, h: 240, paint: bounceHouse(false) },
    { id: 'act', frames: 8, w: 260, h: 240, paint: bounceHouse(true) },
    SPARKLE,
  ],
  magician: [
    { id: 'main', frames: 6, w: 230, h: 270, paint: magician(false) },
    { id: 'act', frames: 12, w: 230, h: 270, paint: magician(true) },
    { ...BUBBLE, paint: saying('Abracadabra!') },
    SPARKLE,
  ],
  'balloon-twister': [
    { id: 'main', frames: 6, w: 200, h: 270, paint: balloonClown(false) },
    { id: 'act', frames: 8, w: 200, h: 270, paint: balloonClown(true) },
    { ...BUBBLE, paint: saying('One for you!') },
    SPARKLE,
  ],
  'party-horns': [
    { id: 'main', frames: 6, w: 280, h: 230, paint: partyHorns(false) },
    { id: 'act', frames: 10, w: 280, h: 230, paint: partyHorns(true) },
    SPARKLE,
  ],
  'musical-chairs': [
    { id: 'main', frames: 16, w: 300, h: 220, paint: musicalChairs(false) },
    { id: 'act', frames: 10, w: 300, h: 220, paint: musicalChairs(true) },
    SPARKLE,
  ],
  'pin-the-tail': [
    { id: 'main', frames: 8, w: 280, h: 250, paint: pinTheTail(false) },
    { id: 'act', frames: 10, w: 280, h: 250, paint: pinTheTail(true) },
    SPARKLE,
  ],
  limbo: [
    { id: 'main', frames: 7, w: 260, h: 230, paint: limbo },
    SPARKLE,
  ],
  'sack-race': [
    { id: 'main', frames: 8, w: 220, h: 230, paint: sackRace(false) },
    { id: 'wave', frames: 8, w: 220, h: 230, paint: sackRace(true) },
    SPARKLE,
  ],
  'face-painter': [
    { id: 'main', frames: 8, w: 230, h: 250, paint: facePainter(false) },
    { id: 'act', frames: 6, w: 230, h: 250, paint: facePainter(true) },
    { ...BUBBLE, paint: saying('Rawr!') },
    SPARKLE,
  ],
  karaoke: [
    { id: 'main', frames: 6, w: 210, h: 270, paint: karaoke(false) },
    { id: 'act', frames: 8, w: 210, h: 270, paint: karaoke(true) },
    SPARKLE,
  ],
  'dj-booth': [
    { id: 'main', frames: 8, w: 260, h: 240, paint: djBooth(false) },
    { id: 'act', frames: 8, w: 260, h: 240, paint: djBooth(true) },
    SPARKLE,
  ],
  'diploma-walk': [
    { id: 'main', frames: 4, w: 260, h: 270, paint: diplomaWalk(false) },
    { id: 'act', frames: 12, w: 260, h: 270, paint: diplomaWalk(true) },
    { ...BUBBLE, paint: saying('Congratulations!') },
    SPARKLE,
  ],
  'class-of': [
    { id: 'main', frames: CLASS_YEARS * CLASS_POSES, w: 250, h: 270, paint: classOf(false) },
    { id: 'act', frames: CLASS_YEARS * CLASS_TOSS, w: 250, h: 270, paint: classOf(true) },
    SPARKLE,
  ],
  'grad-parade': [
    { id: 'main', frames: 8, w: 280, h: 220, paint: gradParade(false) },
    { id: 'wave', frames: 8, w: 280, h: 220, paint: gradParade(true) },
    SPARKLE,
  ],
  valedictorian: [
    { id: 'main', frames: 6, w: 200, h: 270, paint: valedictorian(false) },
    { id: 'act', frames: 8, w: 200, h: 270, paint: valedictorian(true) },
    { ...BUBBLE, paint: saying('We did it!') },
    SPARKLE,
  ],
}
