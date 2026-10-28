/**
 * Pictures for New Year's and Lunar New Year: Baby New Year with the coming
 * year on his sash, Father Time with the year's sand running out, children
 * with party horns, a toast at midnight, a conga line, a polar bear plunge,
 * a rose parade float, a Mummers strutter, a reveller asleep before
 * midnight; the animal of the year, the god of fortune, a festival drum,
 * dumplings in the steamer, children wishing a happy new year, the Nian
 * beast, a lucky cat and a child with a rabbit lantern.
 *
 * Painted the same way as sprites.ts: facing right, one frame at a time,
 * into a cell of w by h design units.
 */

import { arm, dot, head, rr } from './figures'
import { ZODIAC } from './holidays'
import {
  circle, ellipse, glow, heartPath, rgba, saying, shade, SKIN, SPARKLE, TAU,
  type Ctx, type SpriteColors, type SpriteRow,
} from './sprites'

const TAN = '#c68a5a'
const BROWN = '#9a6440'
const PEACH = '#f5c9a0'

/** The year coming next (or just arrived, all through January). */
export function comingYear(now = new Date()) {
  return now.getMonth() === 0 ? now.getFullYear() : now.getFullYear() + 1
}

/** A cone party hat at (x, y) (its brim), leaning by a, with stripes and a pom-pom. */
function partyHat(ctx: Ctx, x: number, y: number, h: number, a: number, color: string, stripe: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(a)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(-h * 0.36, 0)
  ctx.lineTo(h * 0.36, 0)
  ctx.lineTo(0, -h)
  ctx.closePath()
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.strokeStyle = stripe
  ctx.lineWidth = h * 0.12
  for (let k = 0; k < 4; k++) {
    ctx.beginPath()
    ctx.moveTo(-h, -k * h * 0.3)
    ctx.lineTo(h, -k * h * 0.3 - h * 0.35)
    ctx.stroke()
  }
  ctx.restore()
  dot(ctx, 0, -h, h * 0.14, stripe)
  ctx.restore()
}

/** A party horn from the lips at (x, y) to dir: rolled up (out 0) or blown all the way out (1), with a frilly end. */
function partyHorn(ctx: Ctx, x: number, y: number, dir: number, out: number, color: string, stripe: string) {
  ctx.fillStyle = stripe
  rr(ctx, dir > 0 ? x : x - 10, y - 3, 10, 6, 2)
  const sx = x + dir * 10
  if (out < 0.2) {
    ctx.strokeStyle = color
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(sx + dir * 7, y + 6, 7, dir > 0 ? -Math.PI / 2 : -Math.PI / 2, dir > 0 ? Math.PI * 1.3 : -Math.PI * 2.3, dir < 0)
    ctx.stroke()
    return
  }
  const len = 14 + out * 38
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(sx, y - 3)
  ctx.lineTo(sx + dir * len, y - 5)
  ctx.lineTo(sx + dir * len, y + 5)
  ctx.lineTo(sx, y + 3)
  ctx.fill()
  ctx.fillStyle = stripe
  for (let k = 1; k < 4; k++) ctx.fillRect(sx + dir * (len * k) / 4 - 1.5, y - 4, 3, 8)
  ctx.fillStyle = color
  for (let k = 0; k < 5; k++) dot(ctx, sx + dir * (len + 3), y - 8 + k * 4, 3, k % 2 ? color : stripe)
}

// -- Baby New Year -----------------------------------------------------------------------------------

function babyNewYear(cheering: boolean) {
  const year = String(comingYear())
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const bounce = cheering ? Math.abs(Math.sin(p)) * 10 : 0
    ctx.translate(0, -bounce)
    // Chubby legs out in front, the nappy, the body.
    ctx.fillStyle = PEACH
    ellipse(ctx, 60, 190 + bounce * 0.3, 16, 10, -0.3)
    ctx.fill()
    ellipse(ctx, 122, 190 + bounce * 0.3, 16, 10, 0.3)
    ctx.fill()
    if (!cheering) arm(ctx, [70, 122, 56, 146, 66, 162], 13, PEACH)
    ctx.fillStyle = PEACH
    rr(ctx, 64, 110, 54, 60, 22)
    ctx.fillStyle = '#ffffff'
    ellipse(ctx, 91, 172, 36, 20)
    ctx.fill()
    dot(ctx, 70, 166, 3, '#93c5fd')
    dot(ctx, 112, 166, 3, '#93c5fd')
    // The sash with the coming year.
    ctx.save()
    ctx.translate(91, 140)
    ctx.rotate(-0.55)
    ctx.fillStyle = color2
    ctx.fillRect(-42, -10, 84, 20)
    ctx.fillStyle = color
    ctx.font = 'bold 15px Georgia, serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(year, 0, 1)
    ctx.restore()
    // A big round head, one curl, and a tiny top hat.
    head(ctx, 92, 86, 26, PEACH, 1, { open: cheering ? 0.8 : 0 })
    ctx.strokeStyle = '#d97706'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(84, 60, 6, Math.PI * 0.2, Math.PI * 1.6)
    ctx.stroke()
    ctx.save()
    ctx.translate(104, 64)
    ctx.rotate(0.25)
    ctx.fillStyle = color
    rr(ctx, -18, -2, 36, 6, 3)
    rr(ctx, -11, -26, 22, 26, 3)
    ctx.fillStyle = color2
    ctx.fillRect(-11, -8, 22, 5)
    ctx.restore()
    if (cheering) {
      // Both arms up, a noisemaker twirling in one hand.
      const w = Math.sin(p * 2) * 8
      arm(ctx, [70, 122, 54, 102, 50 + w, 78], 13, PEACH)
      arm(ctx, [112, 122, 132, 104, 136 - w, 80], 13, PEACH)
      ctx.save()
      ctx.translate(136 - w, 72)
      ctx.rotate(p * 2)
      ctx.fillStyle = color2
      rr(ctx, -2, -22, 4, 22, 2)
      ctx.fillStyle = color
      rr(ctx, 0, -24, 18, 10, 3)
      ctx.restore()
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + p
        dot(ctx, 92 + Math.cos(a) * 70, 70 + Math.sin(a) * 30, 3, k % 2 ? color2 : '#f472b6')
      }
    } else {
      // Shaking a rattle.
      const sh = Math.sin(p) * 6
      arm(ctx, [112, 124, 128, 144, 136, 128 + sh], 13, PEACH)
      ctx.strokeStyle = color2
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(136, 132 + sh)
      ctx.lineTo(146, 108 + sh)
      ctx.stroke()
      dot(ctx, 148, 102 + sh, 9, color2)
      dot(ctx, 145, 99 + sh, 3, '#ffffff')
    }
  }
}

// -- Father Time -------------------------------------------------------------------------------------

/** Frame f of n is how much of the year has gone: the top of the hourglass full on 1 January, empty by New Year's Eve. */
function fatherTime(ctx: Ctx, f: number, n: number, { color, color2 }: SpriteColors) {
  const gone = f / (n - 1)
  // The scythe, behind him.
  ctx.strokeStyle = '#a16207'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(34, 272)
  ctx.lineTo(48, 26)
  ctx.stroke()
  ctx.fillStyle = '#cbd5e1'
  ctx.beginPath()
  ctx.moveTo(46, 28)
  ctx.quadraticCurveTo(100, 6, 132, 40)
  ctx.quadraticCurveTo(96, 24, 48, 42)
  ctx.closePath()
  ctx.fill()
  // A long robe and sandals.
  ctx.fillStyle = '#a16207'
  rr(ctx, 64, 266, 24, 8, 4)
  rr(ctx, 90, 266, 26, 8, 4)
  arm(ctx, [70, 112, 52, 140, 46, 150], 14, shade(color, -0.15))
  dot(ctx, 46, 150, 7, SKIN)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(66, 104)
  ctx.lineTo(112, 104)
  ctx.quadraticCurveTo(122, 190, 128, 268)
  ctx.lineTo(52, 268)
  ctx.quadraticCurveTo(58, 190, 66, 104)
  ctx.fill()
  ctx.strokeStyle = shade(color, -0.2)
  ctx.lineWidth = 2
  for (const x of [76, 96, 112]) {
    ctx.beginPath()
    ctx.moveTo(x, 150)
    ctx.quadraticCurveTo(x - 4, 210, x - 2, 266)
    ctx.stroke()
  }
  ctx.fillStyle = color2
  ctx.fillRect(62, 160, 56, 6)
  // Bald head, bushy brows and a long white beard down to his belt.
  head(ctx, 90, 82, 20, SKIN, 1)
  ctx.fillStyle = '#f1f5f9'
  ellipse(ctx, 74, 80, 7, 10)
  ctx.fill()
  ctx.fillRect(90, 66, 16, 3)
  ctx.beginPath()
  ctx.moveTo(76, 90)
  ctx.quadraticCurveTo(80, 120, 92, 166)
  ctx.quadraticCurveTo(104, 120, 110, 88)
  ctx.quadraticCurveTo(94, 100, 76, 90)
  ctx.fill()
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 1.5
  for (const x of [86, 92, 98]) {
    ctx.beginPath()
    ctx.moveTo(x, 104)
    ctx.lineTo(x + 1, 150)
    ctx.stroke()
  }
  // The hourglass held out, the sand of the year that is left in the top.
  const hx = 150
  ctx.fillStyle = '#a16207'
  rr(ctx, hx - 24, 108, 48, 8, 3)
  rr(ctx, hx - 24, 186, 48, 8, 3)
  ctx.fillRect(hx - 22, 116, 4, 70)
  ctx.fillRect(hx + 18, 116, 4, 70)
  ctx.fillStyle = rgba('#e0f2fe', 0.45)
  ctx.beginPath()
  ctx.moveTo(hx - 16, 116)
  ctx.lineTo(hx + 16, 116)
  ctx.quadraticCurveTo(hx + 16, 140, hx + 2, 151)
  ctx.quadraticCurveTo(hx + 16, 162, hx + 16, 186)
  ctx.lineTo(hx - 16, 186)
  ctx.quadraticCurveTo(hx - 16, 162, hx - 2, 151)
  ctx.quadraticCurveTo(hx - 16, 140, hx - 16, 116)
  ctx.fill()
  const sand = '#fbbf24'
  const top = 1 - gone
  if (top > 0.02) {
    const y = 148 - top * 28
    const w = 4 + 12 * Math.min(1, (148 - y) / 22)
    ctx.fillStyle = sand
    ctx.beginPath()
    ctx.moveTo(hx - w, y)
    ctx.lineTo(hx + w, y)
    ctx.lineTo(hx + 2, 150)
    ctx.lineTo(hx - 2, 150)
    ctx.closePath()
    ctx.fill()
    ctx.fillRect(hx - 0.8, 150, 1.6, 34 - gone * 22)
  }
  if (gone > 0.02) {
    ctx.fillStyle = sand
    const h = 4 + gone * 26
    ctx.beginPath()
    ctx.moveTo(hx - 15, 185)
    ctx.lineTo(hx + 15, 185)
    ctx.quadraticCurveTo(hx + 10, 185 - h, hx, 185 - h - 4)
    ctx.quadraticCurveTo(hx - 10, 185 - h, hx - 15, 185)
    ctx.fill()
  }
  arm(ctx, [108, 114, 128, 140, hx - 22, 150], 14, color)
  dot(ctx, hx - 22, 150, 7, SKIN)
}

// -- children with party horns ----------------------------------------------------------------------------

/** A child's legs, shoes and shirt (the head and arms are drawn by whoever uses it). */
function standingKid(ctx: Ctx, x: number, dir: number, shirt: string, bob: number) {
  ctx.save()
  ctx.translate(0, -bob)
  ctx.fillStyle = '#64748b'
  rr(ctx, x - 12, 160, 10, 34 + bob, 4)
  rr(ctx, x + 2, 160, 10, 34 + bob, 4)
  ctx.fillStyle = '#475569'
  rr(ctx, x - 14 + dir * 2, 190 + bob, 14, 7, 3)
  rr(ctx, x + dir * 2, 190 + bob, 14, 7, 3)
  ctx.fillStyle = shirt
  rr(ctx, x - 15, 116, 30, 50, 10)
  ctx.restore()
}

function noisemakerKids(blowing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const kid = (x: number, dir: number, shirt: string, skin: string, hair: string, ph: number) => {
      const s = Math.sin(p + ph)
      const bob = blowing ? Math.abs(s) * 6 : Math.abs(s) * 1.5
      standingKid(ctx, x, dir, shirt, bob)
      ctx.save()
      ctx.translate(0, -bob)
      arm(ctx, [x - dir * 8, 124, x - dir * 18, 146, x - dir * 14 + (blowing ? -dir * s * 6 : 0), blowing ? 116 : 160], 8, shade(shirt, -0.2))
      head(ctx, x + dir * 2, 98, 16, skin, dir, { puff: blowing && s > -0.3 })
      ctx.fillStyle = hair
      ctx.beginPath()
      ctx.arc(x + dir * 2, 96, 17, Math.PI * 1.05, Math.PI * 1.95)
      ctx.quadraticCurveTo(x, 84, x - 14, 96)
      ctx.fill()
      partyHat(ctx, x - dir * 2, 84, 30, -dir * 0.2, color, color2)
      const out = blowing ? Math.max(0, Math.sin(p * 2 + ph)) : 0
      partyHorn(ctx, x + dir * 12, 106, dir, out, color2, color)
      arm(ctx, [x + dir * 8, 124, x + dir * 20, 132, x + dir * 18, 108], 8, shirt)
      dot(ctx, x + dir * 18, 108, 4.5, skin)
      ctx.restore()
    }
    kid(62, 1, '#f472b6', SKIN, '#78350f', 0)
    kid(160, -1, '#38bdf8', BROWN, '#292524', 1.5)
    if (blowing) {
      // Confetti.
      for (let k = 0; k < 12; k++) {
        const q = (f / frames + k / 12) % 1
        const x = 20 + ((k * 53) % 180)
        ctx.save()
        ctx.translate(x + Math.sin(q * 6 + k) * 6, 10 + q * 60)
        ctx.rotate(q * 8 + k)
        ctx.fillStyle = ['#facc15', '#f472b6', '#38bdf8', '#4ade80'][k % 4]
        ctx.fillRect(-3, -2, 6, 4)
        ctx.restore()
      }
    }
  }
}

// -- a toast at midnight ---------------------------------------------------------------------------

/** A champagne flute held at (x, y) (its stem), tipped by a. */
function flute(ctx: Ctx, x: number, y: number, a: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(a)
  ctx.fillStyle = rgba('#e0f2fe', 0.6)
  ctx.beginPath()
  ctx.moveTo(-6, -30)
  ctx.lineTo(6, -30)
  ctx.lineTo(3, -6)
  ctx.lineTo(-3, -6)
  ctx.fill()
  ctx.fillStyle = '#fcd34d'
  ctx.beginPath()
  ctx.moveTo(-5, -22)
  ctx.lineTo(5, -22)
  ctx.lineTo(3, -7)
  ctx.lineTo(-3, -7)
  ctx.fill()
  dot(ctx, -1, -16, 1, '#fff7ed')
  dot(ctx, 1.5, -11, 0.8, '#fff7ed')
  ctx.fillStyle = '#e2e8f0'
  ctx.fillRect(-1, -6, 2, 12)
  ellipse(ctx, 0, 6, 6, 1.8)
  ctx.fill()
  ctx.restore()
}

function midnightToast(mode: 'chat' | 'clink' | 'kiss') {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const meet = mode === 'clink' ? Math.sin(Math.min(1, p / 0.5) * (Math.PI / 2)) * (p < 0.75 ? 1 : 1 - (p - 0.75) * 2) : 0
    const lean = mode === 'kiss' ? 1 : 0
    const sway = Math.sin(p * TAU) * 2
    // He: a grey suit and a bow tie in the element's second colour.
    ctx.fillStyle = '#64748b'
    rr(ctx, 64, 176, 14, 58, 5)
    rr(ctx, 82, 176, 14, 58, 5)
    ctx.fillStyle = '#475569'
    rr(ctx, 60, 230, 22, 8, 4)
    rr(ctx, 80, 230, 24, 8, 4)
    ctx.save()
    ctx.translate(80, 180)
    ctx.rotate(lean * 0.12 + sway * 0.01)
    ctx.translate(-80, -180)
    arm(ctx, [64, 112, 56, 142, 66, 160], 12, '#64748b')
    ctx.fillStyle = '#94a3b8'
    rr(ctx, 58, 100, 46, 82, 12)
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(74, 102)
    ctx.lineTo(90, 102)
    ctx.lineTo(82, 134)
    ctx.fill()
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(74, 102)
    ctx.lineTo(82, 106)
    ctx.lineTo(90, 102)
    ctx.lineTo(90, 110)
    ctx.lineTo(82, 106)
    ctx.lineTo(74, 110)
    ctx.fill()
    head(ctx, 84, 82, 18, SKIN, 1, { blink: lean > 0, open: mode === 'clink' && meet > 0.9 ? 0.6 : 0 })
    ctx.fillStyle = '#78350f'
    ctx.beginPath()
    ctx.arc(84, 80, 19, Math.PI * 1.05, Math.PI * 1.9)
    ctx.fill()
    partyHat(ctx, 78, 66, 28, -0.25, color, color2)
    const ax = 112 + meet * 6 - lean * 8
    const ay = 116 - meet * 14
    arm(ctx, [96, 110, 104, 136, ax, ay + 10], 12, '#94a3b8')
    dot(ctx, ax, ay + 10, 5.5, SKIN)
    flute(ctx, ax + 2, ay + 4, 0.15 * meet)
    ctx.restore()
    // She: a sparkly dress.
    ctx.save()
    ctx.translate(140, 180)
    ctx.rotate(-lean * 0.12 - sway * 0.01)
    ctx.translate(-140, -180)
    ctx.fillStyle = TAN
    rr(ctx, 130, 190, 10, 44, 4)
    rr(ctx, 144, 190, 10, 44, 4)
    ctx.fillStyle = color
    rr(ctx, 126, 230, 18, 7, 3)
    rr(ctx, 142, 230, 18, 7, 3)
    arm(ctx, [154, 112, 162, 142, 154, 160], 9, TAN)
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(128, 104)
    ctx.lineTo(154, 104)
    ctx.quadraticCurveTo(158, 150, 166, 196)
    ctx.lineTo(118, 196)
    ctx.quadraticCurveTo(124, 150, 128, 104)
    ctx.fill()
    for (let k = 0; k < 14; k++) dot(ctx, 124 + ((k * 23) % 40), 112 + ((k * 37) % 80), 1.6, k % 3 === f % 3 ? '#ffffff' : shade(color2, 0.4))
    head(ctx, 140, 84, 17, TAN, -1, { blink: lean > 0, open: mode === 'clink' && meet > 0.9 ? 0.6 : 0 })
    ctx.fillStyle = '#292524'
    ctx.beginPath()
    ctx.arc(140, 82, 18, Math.PI * 1.1, Math.PI * 1.95)
    ctx.quadraticCurveTo(162, 100, 156, 112)
    ctx.quadraticCurveTo(150, 92, 156, 84)
    ctx.fill()
    ctx.fillStyle = color
    ctx.fillRect(126, 70, 28, 4)
    const bx = 116 - meet * 6 + lean * 8
    const by = 116 - meet * 14
    arm(ctx, [130, 110, 124, 136, bx, by + 10], 9, TAN)
    dot(ctx, bx, by + 10, 5, TAN)
    flute(ctx, bx - 2, by + 4, -0.15 * meet)
    ctx.restore()
    if (mode === 'clink' && meet > 0.85) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU
        ctx.strokeStyle = '#fde68a'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(114 + Math.cos(a) * 12, 86 + Math.sin(a) * 12)
        ctx.lineTo(114 + Math.cos(a) * 22, 86 + Math.sin(a) * 22)
        ctx.stroke()
      }
    }
    if (mode === 'kiss') {
      // A heart floating up from them at midnight.
      ctx.fillStyle = '#f43f5e'
      heartPath(ctx, 112, 54 - p * 16, 12 + Math.sin(p * TAU) * 2)
      ctx.fill()
    }
  }
}

// -- a conga line ------------------------------------------------------------------------------------------

function congaLine(wild: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    // One, two, three… kick! (the last quarter of the step).
    const kick = p >= 0.75 ? Math.sin(((p - 0.75) / 0.25) * Math.PI) : 0
    const dancers: Array<[number, string, string, string]> = [
      [222, color, SKIN, '#78350f'], [146, color2, BROWN, '#292524'], [70, '#f472b6', TAN, '#a16207'],
    ]
    dancers.forEach(([x, shirt, skin, hair], i) => {
      const bob = Math.abs(Math.sin(p * TAU * 2 + i)) * 4
      // Legs: stepping, and the kick out to the side.
      const k = kick * (wild ? 1.3 : 0.9)
      arm(ctx, [x - 4, 150 - bob, x - 8 + Math.sin(p * TAU * 3) * 4, 196], 11, '#64748b')
      arm(ctx, [x + 6, 150 - bob, x + 10 + k * 26, 194 - k * 26], 11, '#64748b')
      dot(ctx, x - 8 + Math.sin(p * TAU * 3) * 4, 196, 6, '#475569')
      dot(ctx, x + 10 + k * 26, 194 - k * 26, 6, '#475569')
      ctx.fillStyle = shirt
      rr(ctx, x - 16, 104 - bob, 32, 52, 10)
      head(ctx, x + 2, 86 - bob, 15, skin, 1, { open: wild ? 0.6 : 0 })
      ctx.fillStyle = hair
      ctx.beginPath()
      ctx.arc(x + 2, 84 - bob, 16, Math.PI * 1.05, Math.PI * 1.9)
      ctx.fill()
      partyHat(ctx, x - 1, 72 - bob, 26, -0.2 + Math.sin(p * TAU + i) * 0.1, i === 1 ? color : color2, '#ffffff')
      if (i === 0 || wild) {
        // The leader shakes maracas; with people, everyone's arms go up.
        const w = Math.sin(p * TAU * 2 + i) * 8
        arm(ctx, [x + 6, 112 - bob, x + 20, 96 - bob, x + 18 + w, 72 - bob], 8, skin)
        dot(ctx, x + 18 + w, 68 - bob, 7, i === 0 ? '#facc15' : skin)
      } else {
        // Hands on the hips of the one in front.
        arm(ctx, [x + 6, 114 - bob, x + 34, 128 - bob, x + 58, 140], 8, skin)
        dot(ctx, x + 58, 140, 5, skin)
      }
    })
  }
}

// -- a polar bear plunge -------------------------------------------------------------------------------

function polarPlunge(jumping: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    // Snow, and a hole in the ice full of cold water.
    ctx.fillStyle = '#e2e8f0'
    ellipse(ctx, 140, 204, 100, 16)
    ctx.fill()
    ctx.fillStyle = '#bfdbfe'
    ellipse(ctx, 166, 202, 46, 11)
    ctx.fill()
    ctx.fillStyle = '#3b82f6'
    ellipse(ctx, 166, 203, 40, 8.5)
    ctx.fill()
    ctx.strokeStyle = rgba('#ffffff', 0.6)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(140, 203)
    ctx.quadraticCurveTo(150, 200, 160, 203)
    ctx.stroke()
    // Where the swimmer is: shivering on the edge, crouching, leaping, under, then popping up.
    let x = 70
    let y = 0
    let rot = 0
    let show = true
    let popped = false
    const shiver = jumping ? 0 : Math.sin(p * TAU * 4) * 2
    if (jumping) {
      if (p < 0.2) y = (p / 0.2) * 10
      else if (p < 0.5) {
        const q = (p - 0.2) / 0.3
        x = 70 + q * 96
        y = 10 - Math.sin(q * Math.PI) * 46 + q * 40
        rot = q * 2.7
      } else if (p < 0.75) show = false
      else popped = true
    }
    if (jumping && p >= 0.45 && p < 0.8) {
      // The splash.
      const q = (p - 0.45) / 0.35
      for (let k = 0; k < 14; k++) {
        const a = Math.PI + (k / 13) * Math.PI
        const r = 0.6 + 0.4 * ((k * 7) % 3) / 2
        dot(ctx, 166 + Math.cos(a) * (14 + q * 56 * r), 198 + Math.sin(a) * q * 110 * r + q * q * 70, 6 * (1 - q * 0.5), k % 2 ? '#ffffff' : '#93c5fd')
      }
    }
    if (popped) {
      const q = (p - 0.75) / 0.25
      // Just the head and arms up out of the water.
      ctx.save()
      ctx.beginPath()
      ctx.rect(100, 0, 140, 202)
      ctx.clip()
      arm(ctx, [156, 200, 146, 176, 140, 158 - q * 6], 9, PEACH)
      arm(ctx, [176, 200, 186, 176, 192, 158 - q * 6], 9, PEACH)
      head(ctx, 166, 186 - q * 4, 15, PEACH, 1, { open: 0.9 })
      ctx.restore()
      partyHat(ctx, 166, 174 - q * 4, 24, 0.3, color2, '#ffffff')
      ctx.strokeStyle = rgba('#ffffff', 0.7)
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(166, 202, 24, 5, 0, 0, TAU)
      ctx.stroke()
      return
    }
    if (!show) return
    // Turning about the middle of the body as it dives, head first into the hole.
    ctx.save()
    ctx.translate(x + shiver, 130 + y)
    ctx.rotate(rot)
    ctx.translate(0, 60)
    // Legs, an old-fashioned striped bathing suit, arms hugging himself (or out to dive).
    const crouch = jumping && p < 0.2 ? p / 0.2 : 0
    arm(ctx, [-6, -50, -8 - crouch * 6, -28 + crouch * 8, -6, 0], 11, PEACH)
    arm(ctx, [6, -50, 10 + crouch * 6, -28 + crouch * 8, 8, 0], 11, PEACH)
    ctx.fillStyle = color
    rr(ctx, -16, -102 + crouch * 10, 32, 58, 10)
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(-16, -102 + crouch * 10, 32, 58, 10)
    ctx.clip()
    ctx.fillStyle = '#ffffff'
    for (let k = 0; k < 6; k++) ctx.fillRect(-16, -96 + crouch * 10 + k * 10, 32, 4)
    ctx.restore()
    head(ctx, 2, -118 + crouch * 10, 15, PEACH, 1, { open: jumping ? 0.7 : 0 })
    partyHat(ctx, -1, -130 + crouch * 10, 24, -0.2, color2, '#ffffff')
    if (jumping && p >= 0.2) {
      arm(ctx, [-6, -90, 4, -126, 14, -150], 9, PEACH)
      arm(ctx, [6, -90, 16, -124, 24, -146], 9, PEACH)
    } else {
      arm(ctx, [-10, -90, 12, -82, -4, -72 + shiver], 9, PEACH)
      arm(ctx, [10, -90, 22, -76, 2, -66 - shiver], 9, PEACH)
    }
    ctx.restore()
    if (!jumping) {
      // Teeth chattering.
      ctx.strokeStyle = rgba('#ffffff', 0.7)
      ctx.lineWidth = 2
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(70 + s * 26, 70)
        ctx.lineTo(70 + s * 32, 66 + (f % 2) * 4)
        ctx.lineTo(70 + s * 26, 62)
        ctx.stroke()
      }
    }
  }
}

// -- a rose parade float ---------------------------------------------------------------------------------

function roseFloat(waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const bob = Math.sin(p) * 1.5
    ctx.translate(0, bob)
    const rose = (x: number, y: number, r: number, c: string) => {
      dot(ctx, x, y, r, c)
      ctx.strokeStyle = shade(c, -0.3)
      ctx.lineWidth = Math.max(1, r * 0.2)
      ctx.beginPath()
      ctx.arc(x, y, r * 0.55, 0.3, 4.6)
      ctx.stroke()
    }
    // The skirt of leaves, and the deck covered in roses with the year in golden flowers.
    ctx.fillStyle = '#16a34a'
    ctx.beginPath()
    ctx.moveTo(14, 206)
    for (let k = 0; k <= 22; k++) ctx.lineTo(14 + k * 15, 206 + (k % 2) * 8)
    ctx.lineTo(344, 160)
    ctx.lineTo(14, 160)
    ctx.fill()
    ctx.fillStyle = shade(color, -0.25)
    rr(ctx, 16, 140, 328, 64, 14)
    for (let k = 0; k < 60; k++) rose(24 + ((k * 37) % 312), 148 + ((k * 17) % 50), 6, k % 5 ? color : shade(color, 0.3))
    // A wave of golden roses along the side (no words: it is mirrored when it goes the other way).
    for (let k = 0; k < 15; k++) rose(34 + k * 21, 172 + Math.sin(k * 0.9) * 12, 8, color2)
    // A giant rose at the front.
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + Math.sin(p) * 0.04
      ctx.fillStyle = shade(color, 0.1)
      ellipse(ctx, 318 + Math.cos(a) * 18, 98 + Math.sin(a) * 18, 22, 16, a)
      ctx.fill()
    }
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + 0.6
      ctx.fillStyle = shade(color, -0.1)
      ellipse(ctx, 318 + Math.cos(a) * 9, 98 + Math.sin(a) * 9, 14, 10, a)
      ctx.fill()
    }
    dot(ctx, 318, 98, 8, shade(color, -0.35))
    ctx.fillStyle = '#16a34a'
    ellipse(ctx, 292, 130, 18, 7, -0.5)
    ctx.fill()
    ellipse(ctx, 340, 132, 16, 6, 0.5)
    ctx.fill()
    // An arch of white and pink flowers over the throne.
    ctx.strokeStyle = '#16a34a'
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.arc(110, 140, 76, Math.PI, 0)
    ctx.stroke()
    for (let k = 0; k <= 16; k++) {
      const a = Math.PI + (k / 16) * Math.PI
      rose(110 + Math.cos(a) * 76, 140 + Math.sin(a) * 76, 7, k % 2 ? '#f8fafc' : '#f9a8d4')
    }
    // The queen on her throne, in white with a tiara, waving.
    ctx.fillStyle = color2
    rr(ctx, 82, 70, 56, 72, 10)
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(98, 100)
    ctx.lineTo(122, 100)
    ctx.lineTo(132, 142)
    ctx.lineTo(88, 142)
    ctx.fill()
    head(ctx, 110, 86, 13, TAN, 1)
    ctx.fillStyle = '#422006'
    ctx.beginPath()
    ctx.arc(110, 84, 14, Math.PI * 1.05, Math.PI * 1.95)
    ctx.quadraticCurveTo(126, 96, 122, 104)
    ctx.quadraticCurveTo(116, 90, 98, 90)
    ctx.fill()
    ctx.fillStyle = '#e2e8f0'
    ctx.beginPath()
    ctx.moveTo(100, 74)
    ctx.lineTo(104, 66)
    ctx.lineTo(108, 72)
    ctx.lineTo(112, 62)
    ctx.lineTo(116, 72)
    ctx.lineTo(120, 66)
    ctx.lineTo(122, 74)
    ctx.fill()
    const w = waving ? Math.sin(p * 2) * 0.5 : Math.sin(p) * 0.15
    ctx.save()
    ctx.translate(120, 106)
    ctx.rotate(-1.9 + w)
    arm(ctx, [0, 0, 16, 0, 26, -6], 6, '#f8fafc')
    dot(ctx, 28, -7, 4, TAN)
    ctx.restore()
    if (waving) {
      for (let k = 0; k < 8; k++) {
        const q = (f / frames + k / 8) % 1
        ctx.fillStyle = k % 2 ? color : '#f9a8d4'
        ellipse(ctx, 40 + ((k * 41) % 280) + Math.sin(q * 8) * 8, 20 + q * 120, 4, 2.5, q * 6)
        ctx.fill()
      }
    }
  }
}

// -- a Mummers strutter --------------------------------------------------------------------------------

function mummer(strutting: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const s = Math.sin(p)
    const dip = strutting ? (1 - Math.cos(p * 2)) * 8 : Math.abs(s) * 3
    ctx.translate(0, dip)
    // The great feathered backpiece fanning out behind.
    const shimmy = strutting ? Math.sin(p * 3) * 0.05 : Math.sin(p) * 0.02
    for (let k = 0; k < 11; k++) {
      const a = -Math.PI / 2 + (k - 5) * 0.2 + shimmy
      ctx.save()
      ctx.translate(96, 132)
      ctx.rotate(a + Math.PI / 2)
      ctx.fillStyle = k % 2 ? color : color2
      ellipse(ctx, 0, -54, 12, 44)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ellipse(ctx, 0, -94, 8, 9)
      ctx.fill()
      ctx.restore()
    }
    // Legs in a high-kneed strut, gold slippers.
    const k1 = strutting ? Math.max(0, s) : Math.max(0, s) * 0.6
    const k2 = strutting ? Math.max(0, -s) : Math.max(0, -s) * 0.6
    for (const [kk, x, col] of [[k2, 86, shade(color, -0.25)], [k1, 104, color]] as const) {
      arm(ctx, [x, 176, x + 8 + kk * 18, 206 - kk * 20, x + 6 + kk * 10, 246 - kk * 22], 12, col)
      ctx.fillStyle = '#facc15'
      rr(ctx, x + kk * 10, 242 - kk * 22, 22, 9, 4)
    }
    // A sequinned suit with a ruffled collar.
    ctx.fillStyle = color
    rr(ctx, 74, 112, 46, 70, 12)
    for (let k = 0; k < 16; k++) dot(ctx, 78 + ((k * 13) % 40), 118 + ((k * 23) % 60), 2, (k + f) % 4 === 0 ? '#ffffff' : color2)
    for (let k = 0; k < 7; k++) dot(ctx, 76 + k * 7, 112, 6, '#ffffff')
    head(ctx, 98, 92, 16, SKIN, 1, { open: 0.5 })
    dot(ctx, 104, 84, 3, rgba('#ffffff', 0.9))
    ctx.fillStyle = color2
    rr(ctx, 82, 68, 34, 10, 4)
    // The parasol over his shoulder, bobbing (twirling for people).
    ctx.save()
    ctx.translate(146, 72 + s * 4)
    ctx.rotate(0.15 + (strutting ? Math.sin(p * 2) * 0.3 : 0))
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(0, 40)
    ctx.lineTo(0, -40)
    ctx.stroke()
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(-34, -30)
    ctx.quadraticCurveTo(0, -66, 34, -30)
    ctx.closePath()
    ctx.fill()
    for (let k = 0; k < 7; k++) dot(ctx, -30 + k * 10, -30, 5, k % 2 ? color : '#ffffff')
    ctx.restore()
    arm(ctx, [112, 122, 132, 136, 144, 112 + s * 4], 10, color)
    dot(ctx, 144, 112 + s * 4, 5.5, SKIN)
    arm(ctx, [80, 122, 66, 110 - s * 6, 58, 92 - s * 8], 10, shade(color, -0.2))
    dot(ctx, 58, 92 - s * 8, 5.5, SKIN)
  }
}

// -- a reveller asleep before midnight ----------------------------------------------------------------------

function sleepyReveler(awake: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const up = awake ? Math.min(1, p / 0.2) : 0
    const jolt = awake && p < 0.25 ? Math.sin((p / 0.25) * Math.PI) * 10 : 0
    // The armchair.
    ctx.fillStyle = shade(color, -0.1)
    rr(ctx, 20, 70, 100, 120, 26)
    ctx.fillStyle = color
    rr(ctx, 30, 130, 130, 44, 12)
    rr(ctx, 12, 120, 30, 70, 12)
    rr(ctx, 138, 120, 30, 70, 12)
    ctx.fillStyle = '#a16207'
    ctx.fillRect(28, 188, 8, 10)
    ctx.fillRect(150, 188, 8, 10)
    // Him: legs out, slumped (or sat bolt upright).
    arm(ctx, [80, 150, 150, 152, 158, 194], 14, '#64748b')
    ctx.fillStyle = '#475569'
    rr(ctx, 150, 190, 26, 9, 4)
    ctx.save()
    ctx.translate(80, 150)
    ctx.rotate((1 - up) * -0.3)
    ctx.translate(0, -jolt)
    ctx.fillStyle = '#e2e8f0'
    rr(ctx, -20, -64, 42, 66, 12)
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(-4, -64)
    ctx.lineTo(4, -64)
    ctx.lineTo(6, -30)
    ctx.lineTo(0, -24)
    ctx.lineTo(-6, -30)
    ctx.fill()
    const hx = 4 + (1 - up) * -8
    const hy = -84 + (1 - up) * 10
    head(ctx, hx, hy, 18, SKIN, 1, { blink: !awake, open: awake ? 0.9 : 0.35 })
    ctx.fillStyle = '#78350f'
    ctx.beginPath()
    ctx.arc(hx, hy - 2, 19, Math.PI * 1.05, Math.PI * 1.9)
    ctx.fill()
    // The party hat: knocked sideways while he sleeps, straight when he jumps up.
    partyHat(ctx, hx - 2, hy - 15, 28, awake ? -0.1 + jolt * 0.02 : -1.1, color2, '#ffffff')
    if (awake) {
      // Blowing his horn and waving.
      partyHorn(ctx, hx + 14, hy + 8, 1, p > 0.25 ? 0.5 + 0.5 * Math.sin(p * TAU * 2) : 0.2, color2, '#ffffff')
      arm(ctx, [-14, -54, -34, -78, -30 + Math.sin(p * TAU * 2) * 8, -104], 10, '#e2e8f0')
      dot(ctx, -30 + Math.sin(p * TAU * 2) * 8, -106, 5.5, SKIN)
      arm(ctx, [16, -54, 34, -64, 26, -80], 10, '#e2e8f0')
      dot(ctx, 26, -80, 5.5, SKIN)
    } else {
      // Arms dangling, the horn slipped to his lap.
      arm(ctx, [-14, -54, -22, -24, -16, 0], 10, '#e2e8f0')
      arm(ctx, [16, -54, 30, -26, 40, -8], 10, '#e2e8f0')
      dot(ctx, 40, -8, 5.5, SKIN)
      ctx.fillStyle = color2
      ctx.save()
      ctx.translate(48, -2)
      ctx.rotate(0.3)
      ctx.fillRect(0, -3, 28, 6)
      ctx.restore()
    }
    ctx.restore()
    if (!awake) {
      // Z's drifting up.
      ctx.fillStyle = '#e2e8f0'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (let k = 0; k < 3; k++) {
        const q = (p + k / 3) % 1
        ctx.globalAlpha = Math.sin(q * Math.PI)
        ctx.font = `bold ${12 + q * 14}px Arial, sans-serif`
        ctx.fillText('Z', 100 + q * 40 + Math.sin(q * 6) * 6, 54 - q * 46)
      }
      ctx.globalAlpha = 1
    } else if (p < 0.3) {
      // Startled lines.
      ctx.strokeStyle = '#fde68a'
      ctx.lineWidth = 2.5
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI * 0.9 + k * 0.35
        ctx.beginPath()
        ctx.moveTo(84 + Math.cos(a) * 28, 66 - jolt + Math.sin(a) * 28)
        ctx.lineTo(84 + Math.cos(a) * 40, 66 - jolt + Math.sin(a) * 40)
        ctx.stroke()
      }
    }
  }
}

// -- the animal of the year ---------------------------------------------------------------------------

/** The twelve animals in red paper cut-outs: each paints itself round (120, 130) in the colour given. */
function zodiacAnimal(ctx: Ctx, n: number, red: string, cut: string) {
  ctx.fillStyle = red
  ctx.strokeStyle = red
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const legs = (xs: number[], y: number, len: number, w: number) => {
    for (const x of xs) rr(ctx, x - w / 2, y, w, len, w / 2)
  }
  const swirl = (x: number, y: number, r: number) => {
    ctx.strokeStyle = cut
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(x, y, r, 0.3, TAU - 0.8)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y, r * 0.45, 0.3, TAU - 0.8)
    ctx.stroke()
    ctx.strokeStyle = red
  }
  const eye = (x: number, y: number, r = 4) => dot(ctx, x, y, r, cut)
  const tri = (pts: number[]) => {
    ctx.beginPath()
    ctx.moveTo(pts[0], pts[1])
    for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1])
    ctx.closePath()
    ctx.fill()
  }
  switch (ZODIAC[n]) {
    case 'Rat': {
      ellipse(ctx, 116, 140, 46, 28)
      ctx.fill()
      tri([150, 124, 190, 140, 150, 156])
      dot(ctx, 146, 112, 14, red)
      dot(ctx, 146, 112, 7, cut)
      legs([94, 136], 158, 18, 9)
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(72, 146)
      ctx.quadraticCurveTo(40, 170, 50, 120)
      ctx.quadraticCurveTo(58, 96, 80, 104)
      ctx.stroke()
      eye(166, 134)
      swirl(112, 140, 14)
      break
    }
    case 'Ox': {
      rr(ctx, 64, 110, 104, 52, 22)
      legs([76, 96, 140, 158], 150, 34, 13)
      ellipse(ctx, 180, 122, 22, 18)
      ctx.fill()
      ctx.lineWidth = 7
      ctx.beginPath()
      ctx.moveTo(172, 108)
      ctx.quadraticCurveTo(160, 84, 176, 76)
      ctx.moveTo(190, 108)
      ctx.quadraticCurveTo(206, 88, 196, 74)
      ctx.stroke()
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(64, 122)
      ctx.quadraticCurveTo(48, 140, 54, 160)
      ctx.stroke()
      eye(186, 118)
      dot(ctx, 190, 132, 3, cut)
      swirl(104, 134, 14)
      swirl(140, 132, 10)
      break
    }
    case 'Tiger': {
      ellipse(ctx, 112, 140, 54, 26)
      ctx.fill()
      legs([74, 94, 132, 150], 150, 32, 12)
      dot(ctx, 170, 118, 24, red)
      tri([152, 104, 156, 86, 168, 98])
      tri([176, 96, 188, 86, 190, 106])
      ctx.lineWidth = 7
      ctx.beginPath()
      ctx.moveTo(60, 136)
      ctx.quadraticCurveTo(30, 120, 44, 92)
      ctx.stroke()
      ctx.strokeStyle = cut
      ctx.lineWidth = 4
      for (let k = 0; k < 5; k++) {
        ctx.beginPath()
        ctx.moveTo(80 + k * 16, 118)
        ctx.lineTo(86 + k * 16, 136)
        ctx.stroke()
      }
      eye(166, 112)
      eye(180, 112)
      ctx.beginPath()
      ctx.moveTo(166, 128)
      ctx.lineTo(173, 132)
      ctx.lineTo(180, 128)
      ctx.stroke()
      break
    }
    case 'Rabbit': {
      ellipse(ctx, 112, 146, 40, 32)
      ctx.fill()
      dot(ctx, 148, 112, 22, red)
      ellipse(ctx, 138, 70, 9, 30, -0.2)
      ctx.fill()
      ellipse(ctx, 158, 72, 9, 30, 0.25)
      ctx.fill()
      dot(ctx, 72, 150, 12, red)
      ellipse(ctx, 120, 176, 22, 7)
      ctx.fill()
      ctx.fillStyle = cut
      ellipse(ctx, 138, 72, 3.5, 20, -0.2)
      ctx.fill()
      ellipse(ctx, 158, 74, 3.5, 20, 0.25)
      ctx.fill()
      eye(156, 108)
      swirl(108, 146, 14)
      break
    }
    case 'Dragon': {
      ctx.lineWidth = 22
      ctx.beginPath()
      ctx.moveTo(40, 150)
      ctx.bezierCurveTo(70, 100, 100, 190, 130, 140)
      ctx.bezierCurveTo(150, 106, 160, 110, 172, 112)
      ctx.stroke()
      for (let k = 0; k < 7; k++) {
        const x = 50 + k * 17
        const y = 136 + Math.sin(k * 1.1 + 1) * 18 - 16
        tri([x - 6, y + 6, x, y - 10, x + 6, y + 6])
      }
      ellipse(ctx, 184, 110, 22, 15)
      ctx.fill()
      tri([196, 104, 216, 108, 198, 118])
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(176, 98)
      ctx.quadraticCurveTo(168, 76, 182, 70)
      ctx.moveTo(204, 118)
      ctx.quadraticCurveTo(222, 130, 214, 146)
      ctx.stroke()
      legs([84, 138], 150, 22, 9)
      eye(186, 104)
      ctx.strokeStyle = cut
      ctx.lineWidth = 2
      for (let k = 0; k < 6; k++) {
        ctx.beginPath()
        ctx.arc(60 + k * 18, 144 + Math.sin(k * 1.1 + 1) * 18 - 8, 4, 0, Math.PI)
        ctx.stroke()
      }
      break
    }
    case 'Snake': {
      ctx.lineWidth = 16
      ctx.beginPath()
      ctx.moveTo(60, 176)
      ctx.bezierCurveTo(200, 176, 200, 130, 120, 130)
      ctx.bezierCurveTo(50, 130, 60, 86, 140, 88)
      ctx.stroke()
      ellipse(ctx, 156, 86, 20, 13)
      ctx.fill()
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(174, 90)
      ctx.lineTo(188, 92)
      ctx.lineTo(194, 88)
      ctx.moveTo(188, 92)
      ctx.lineTo(194, 97)
      ctx.stroke()
      eye(160, 82)
      ctx.fillStyle = cut
      for (let k = 0; k < 8; k++) dot(ctx, 80 + k * 14, 176, 2.2, cut)
      for (let k = 0; k < 5; k++) dot(ctx, 90 + k * 14, 130, 2.2, cut)
      break
    }
    case 'Horse': {
      ellipse(ctx, 110, 136, 50, 24)
      ctx.fill()
      tri([140, 124, 164, 80, 176, 92, 156, 134])
      ellipse(ctx, 180, 92, 22, 11, 0.5)
      ctx.fill()
      tri([164, 78, 168, 64, 174, 80])
      // Prancing: one front leg up.
      ctx.lineWidth = 11
      ctx.beginPath()
      ctx.moveTo(146, 146)
      ctx.lineTo(166, 156)
      ctx.lineTo(170, 140)
      ctx.stroke()
      legs([78, 96, 128], 146, 40, 11)
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.moveTo(62, 128)
      ctx.quadraticCurveTo(36, 140, 40, 176)
      ctx.stroke()
      ctx.strokeStyle = cut
      ctx.lineWidth = 3
      for (let k = 0; k < 4; k++) {
        ctx.beginPath()
        ctx.moveTo(150 + k * 5, 112 - k * 9)
        ctx.lineTo(144 + k * 5, 106 - k * 9)
        ctx.stroke()
      }
      eye(180, 86)
      swirl(104, 134, 12)
      break
    }
    case 'Goat': {
      rr(ctx, 70, 112, 92, 46, 20)
      legs([82, 100, 134, 150], 146, 36, 10)
      ellipse(ctx, 176, 104, 18, 14, 0.4)
      ctx.fill()
      tri([180, 116, 186, 140, 192, 114])
      ctx.lineWidth = 7
      ctx.beginPath()
      ctx.moveTo(168, 94)
      ctx.bezierCurveTo(150, 60, 120, 80, 140, 100)
      ctx.stroke()
      tri([70, 116, 58, 104, 72, 128])
      eye(178, 100)
      ctx.strokeStyle = cut
      ctx.lineWidth = 3
      for (let k = 0; k < 4; k++) {
        ctx.beginPath()
        ctx.arc(94 + k * 18, 134, 6, Math.PI, 0)
        ctx.stroke()
      }
      break
    }
    case 'Monkey': {
      ellipse(ctx, 116, 146, 32, 34)
      ctx.fill()
      dot(ctx, 128, 98, 24, red)
      dot(ctx, 104, 92, 9, red)
      dot(ctx, 152, 92, 9, red)
      ctx.fillStyle = cut
      ellipse(ctx, 134, 104, 13, 11)
      ctx.fill()
      dot(ctx, 128, 94, 3, red)
      dot(ctx, 140, 94, 3, red)
      ctx.strokeStyle = red
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(134, 106, 5, 0.3, Math.PI - 0.3)
      ctx.stroke()
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.moveTo(140, 132)
      ctx.quadraticCurveTo(170, 110, 176, 84)
      ctx.moveTo(90, 160)
      ctx.bezierCurveTo(50, 180, 50, 120, 70, 120)
      ctx.stroke()
      dot(ctx, 178, 80, 7, red)
      ellipse(ctx, 110, 180, 26, 7)
      ctx.fill()
      swirl(116, 150, 12)
      break
    }
    case 'Rooster': {
      ellipse(ctx, 120, 140, 38, 30)
      ctx.fill()
      dot(ctx, 150, 104, 16, red)
      tri([162, 102, 178, 108, 162, 112])
      for (let k = 0; k < 3; k++) dot(ctx, 140 + k * 8, 88 - (k % 2) * 4, 6, red)
      ellipse(ctx, 160, 120, 4, 7)
      ctx.fill()
      ctx.lineWidth = 7
      for (let k = 0; k < 4; k++) {
        ctx.beginPath()
        ctx.moveTo(90, 132)
        ctx.quadraticCurveTo(60 - k * 6, 90 + k * 10, 54 + k * 4, 130 + k * 12)
        ctx.stroke()
      }
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(112, 166)
      ctx.lineTo(110, 186)
      ctx.lineTo(102, 190)
      ctx.moveTo(128, 166)
      ctx.lineTo(130, 186)
      ctx.lineTo(138, 190)
      ctx.stroke()
      eye(154, 100)
      ctx.strokeStyle = cut
      ctx.lineWidth = 3
      for (let k = 0; k < 3; k++) {
        ctx.beginPath()
        ctx.arc(116 + k * 4, 140, 16 - k * 5, 0.2, Math.PI - 0.2)
        ctx.stroke()
      }
      break
    }
    case 'Dog': {
      rr(ctx, 70, 118, 88, 40, 18)
      legs([80, 98, 132, 148], 146, 34, 11)
      dot(ctx, 170, 108, 20, red)
      ellipse(ctx, 190, 116, 14, 9)
      ctx.fill()
      ellipse(ctx, 160, 108, 8, 18, 0.3)
      ctx.fillStyle = shade(red, -0.2)
      ctx.fill()
      ctx.fillStyle = red
      ctx.lineWidth = 7
      ctx.beginPath()
      ctx.moveTo(72, 126)
      ctx.quadraticCurveTo(52, 104, 62, 86)
      ctx.stroke()
      eye(176, 102)
      dot(ctx, 202, 112, 4, cut)
      swirl(112, 138, 12)
      break
    }
    default: {
      // Pig.
      ellipse(ctx, 116, 140, 54, 36)
      ctx.fill()
      legs([84, 102, 132, 150], 160, 22, 12)
      dot(ctx, 166, 124, 20, red)
      tri([150, 108, 156, 88, 166, 106])
      ctx.fillStyle = cut
      ellipse(ctx, 184, 128, 8, 10)
      ctx.fill()
      dot(ctx, 182, 125, 2, red)
      dot(ctx, 182, 132, 2, red)
      ctx.strokeStyle = red
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(62, 132)
      ctx.arc(54, 128, 7, 0, TAU - 0.5)
      ctx.stroke()
      eye(168, 116)
      swirl(112, 140, 16)
      break
    }
  }
}

function zodiacMedallion(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  // A round gold frame with a scalloped red border, a cream paper middle, the year's animal cut in red, its name below.
  glow(ctx, 120, 120, 120, color2, 0.25)
  dot(ctx, 120, 120, 112, color2)
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU
    dot(ctx, 120 + Math.cos(a) * 102, 120 + Math.sin(a) * 102, 9, color)
  }
  dot(ctx, 120, 120, 96, '#fef3c7')
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  circle(ctx, 120, 120, 88)
  ctx.stroke()
  ctx.save()
  ctx.translate(120, 116)
  ctx.scale(0.82, 0.82)
  ctx.translate(-120, -130)
  zodiacAnimal(ctx, f, color, '#fef3c7')
  ctx.restore()
  ctx.fillStyle = color
  ctx.font = 'bold 18px Georgia, serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(ZODIAC[f].toUpperCase(), 120, 190)
}

// -- the god of fortune ------------------------------------------------------------------------------

function godOfFortune(bowing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const bow = bowing ? Math.sin(Math.min(1, p / 0.5) * (Math.PI / 2)) * (p < 0.75 ? 1 : 1 - (p - 0.75) * 4) : 0
    const sway = bowing ? 0 : Math.sin(p * TAU) * 0.03
    // Boots and the robe's skirt.
    ctx.fillStyle = '#57534e'
    rr(ctx, 72, 248, 24, 10, 4)
    rr(ctx, 100, 248, 26, 10, 4)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(70, 170)
    ctx.lineTo(130, 170)
    ctx.lineTo(140, 250)
    ctx.lineTo(60, 250)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = color2
    ctx.fillRect(60, 240, 80, 8)
    ctx.fillRect(96, 172, 8, 70)
    // Gold coins tumbling from the ingot as he bows.
    if (bowing && p > 0.3) {
      for (let k = 0; k < 6; k++) {
        const q = ((p - 0.3) / 0.7 + k / 6) % 1
        ctx.fillStyle = '#facc15'
        ellipse(ctx, 150 + k * 6 + q * 10, 140 + q * 108, 7, 3 + 3 * Math.abs(Math.sin(q * 9 + k)))
        ctx.fill()
      }
    }
    // Upper body bending forward from the waist.
    ctx.save()
    ctx.translate(100, 172)
    ctx.rotate(bow * 0.45 + sway)
    ctx.translate(-100, -172)
    ctx.fillStyle = color
    rr(ctx, 64, 96, 72, 82, 18)
    ctx.fillStyle = color2
    dot(ctx, 100, 136, 16, color2)
    ctx.fillStyle = color
    ctx.font = 'bold 18px "Noto Sans CJK SC", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('福', 100, 137)
    ctx.fillStyle = '#16a34a'
    ctx.fillRect(64, 166, 72, 8)
    head(ctx, 104, 76, 20, SKIN, 1, { blink: true })
    // Long thin moustache and beard.
    ctx.strokeStyle = '#57534e'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(110, 86)
    ctx.quadraticCurveTo(124, 90, 126, 104)
    ctx.moveTo(108, 86)
    ctx.quadraticCurveTo(96, 92, 94, 104)
    ctx.stroke()
    ctx.fillStyle = '#57534e'
    ctx.beginPath()
    ctx.moveTo(100, 92)
    ctx.lineTo(116, 92)
    ctx.lineTo(108, 124)
    ctx.fill()
    // The official's hat with its two winged flaps.
    ctx.fillStyle = '#57534e'
    rr(ctx, 84, 44, 40, 20, 6)
    ctx.beginPath()
    ctx.ellipse(104, 44, 16, 10, 0, Math.PI, 0)
    ctx.fill()
    for (const s of [-1, 1]) {
      ctx.save()
      ctx.translate(104 + s * 20, 54)
      ctx.rotate(s * 0.2)
      ellipse(ctx, s * 16, 0, 16, 5)
      ctx.fill()
      ctx.restore()
    }
    ctx.fillStyle = color2
    ctx.fillRect(84, 58, 40, 4)
    dot(ctx, 104, 50, 4, '#16a34a')
    // Holding the gold ingot out in both hands.
    arm(ctx, [72, 108, 90, 140, 128, 140], 14, shade(color, -0.15))
    arm(ctx, [128, 108, 138, 134, 138, 140], 14, color)
    ctx.fillStyle = '#facc15'
    ctx.beginPath()
    ctx.moveTo(116, 128)
    ctx.quadraticCurveTo(140, 140, 164, 128)
    ctx.lineTo(158, 146)
    ctx.lineTo(122, 146)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#fde047'
    ellipse(ctx, 140, 128, 12, 7)
    ctx.fill()
    dot(ctx, 128, 140, 6, SKIN)
    dot(ctx, 150, 140, 6, SKIN)
    ctx.restore()
  }
}

// -- a festival drum ------------------------------------------------------------------------------

function festivalDrum(drumming: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU * (drumming ? 2 : 1)
    const amp = drumming ? 1 : 0.4
    const a = Math.max(0, Math.sin(p)) * amp
    const b = Math.max(0, -Math.sin(p)) * amp
    // The stand.
    ctx.strokeStyle = shade(color, -0.25)
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(130, 228)
    ctx.lineTo(176, 150)
    ctx.moveTo(206, 228)
    ctx.lineTo(160, 150)
    ctx.stroke()
    // The barrel drum, its head facing the drummer.
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(130, 82)
    ctx.quadraticCurveTo(170, 72, 206, 82)
    ctx.quadraticCurveTo(222, 126, 206, 170)
    ctx.quadraticCurveTo(170, 180, 130, 170)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = color2
    for (let k = 0; k < 6; k++) dot(ctx, 134, 88 + k * 15, 2.5, color2)
    ctx.fillRect(166, 76, 4, 102)
    dot(ctx, 190, 112, 6, color2)
    dot(ctx, 190, 140, 6, color2)
    ctx.fillStyle = '#fef3c7'
    ellipse(ctx, 130, 126, 14, 46)
    ctx.fill()
    ctx.strokeStyle = color2
    ctx.lineWidth = 3
    ctx.stroke()
    for (const [h, y] of [[a, 108], [b, 144]] as const) {
      if (h < 0.08) {
        ctx.strokeStyle = rgba('#ffffff', 0.7)
        ctx.lineWidth = 2
        for (const r of [6, 12]) {
          ellipse(ctx, 130, y, r * 0.35, r)
          ctx.stroke()
        }
      }
    }
    // The drummer: a red headband, a gold sash, two sticks with tassels.
    const bob = drumming ? Math.abs(Math.sin(p)) * 3 : 0
    ctx.fillStyle = '#64748b'
    rr(ctx, 46, 170, 15, 58, 5)
    rr(ctx, 66, 170, 15, 58, 5)
    ctx.fillStyle = '#475569'
    rr(ctx, 42, 224, 24, 8, 4)
    rr(ctx, 62, 224, 26, 8, 4)
    const stick = (sx: number, sy: number, h: number, near: boolean) => {
      const hx = sx + 26 - h * 18
      const hy = sy + 6 - h * 34
      arm(ctx, [near ? 76 : 50, 106 + bob, near ? 86 : 64, 130 - h * 10, hx, hy], 11, near ? '#f8fafc' : '#e2e8f0')
      const tx = 124
      const ty = sy - h * 50
      ctx.strokeStyle = '#a16207'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(hx - 6, hy + 4)
      ctx.lineTo(tx, ty)
      ctx.stroke()
      dot(ctx, tx, ty, 4, '#a16207')
      ctx.strokeStyle = color
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(hx - 6, hy + 4)
      ctx.lineTo(hx - 12, hy + 16)
      ctx.stroke()
      dot(ctx, hx, hy, 6, PEACH)
    }
    stick(78, 108, a, false)
    ctx.fillStyle = '#f8fafc'
    rr(ctx, 42, 98 + bob, 44, 76, 12)
    ctx.fillStyle = color2
    ctx.save()
    ctx.translate(64, 136 + bob)
    ctx.rotate(-0.5)
    ctx.fillRect(-32, -5, 64, 10)
    ctx.restore()
    head(ctx, 68, 78 + bob, 17, PEACH, 1, { open: drumming && a > 0.6 ? 0.7 : 0 })
    ctx.fillStyle = '#292524'
    ctx.beginPath()
    ctx.arc(68, 76 + bob, 18, Math.PI * 1.05, Math.PI * 1.9)
    ctx.fill()
    ctx.fillStyle = color
    ctx.fillRect(50, 66 + bob, 36, 6)
    ctx.beginPath()
    ctx.moveTo(52, 68 + bob)
    ctx.lineTo(40, 78 + bob)
    ctx.lineTo(44, 66 + bob)
    ctx.fill()
    stick(78, 144, b, true)
  }
}

// -- grandma's dumplings ---------------------------------------------------------------------------------

function dumplings(steaming: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const lid = steaming ? Math.sin(Math.min(1, p / 0.3) * (Math.PI / 2)) * 34 : 0
    // Grandma behind the table, folding.
    const fold = Math.sin(p * TAU * 2)
    ctx.fillStyle = color
    rr(ctx, 40, 90, 52, 70, 14)
    ctx.fillStyle = color2
    for (const y of [104, 118, 132]) {
      ctx.fillRect(64, y, 10, 3)
      dot(ctx, 66, y + 1.5, 2.5, color2)
    }
    head(ctx, 68, 70, 18, PEACH, 1, { open: steaming && p > 0.4 ? 0.5 : 0 })
    ctx.fillStyle = '#d1d5db'
    ctx.beginPath()
    ctx.arc(68, 68, 19, Math.PI * 1.0, Math.PI * 1.95)
    ctx.fill()
    dot(ctx, 54, 52, 9, '#d1d5db')
    // Round glasses.
    ctx.strokeStyle = '#78716c'
    ctx.lineWidth = 1.5
    circle(ctx, 70, 68, 4.5)
    ctx.stroke()
    circle(ctx, 80, 68, 4.5)
    ctx.stroke()
    // The table, flour, a board of folded dumplings.
    ctx.fillStyle = '#b45309'
    rr(ctx, 14, 150, 206, 10, 3)
    ctx.fillRect(22, 160, 8, 38)
    ctx.fillRect(204, 160, 8, 38)
    ctx.fillStyle = '#d6a85c'
    rr(ctx, 84, 140, 60, 10, 3)
    const dumpling = (x: number, y: number, s: number) => {
      ctx.fillStyle = '#f8fafc'
      ctx.beginPath()
      ctx.moveTo(x - 10 * s, y)
      ctx.quadraticCurveTo(x, y - 14 * s, x + 10 * s, y)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#cbd5e1'
      ctx.lineWidth = 1.2
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath()
        ctx.moveTo(x + k * 4 * s, y - 8 * s)
        ctx.lineTo(x + k * 4.5 * s, y - 4 * s)
        ctx.stroke()
      }
    }
    for (const x of [94, 108, 122, 136]) dumpling(x, 140, 0.8)
    // Hands pinching a dumpling shut (or holding one out on chopsticks when the steamer opens).
    if (steaming && p > 0.4) {
      arm(ctx, [86, 104, 112, 112, 134, 96], 10, color)
      ctx.strokeStyle = '#a16207'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(130, 100)
      ctx.lineTo(160, 82)
      ctx.moveTo(132, 96)
      ctx.lineTo(160, 78)
      ctx.stroke()
      dot(ctx, 134, 98, 6, PEACH)
      dumpling(162, 86, 0.9)
    } else {
      arm(ctx, [48, 106, 64, 136, 78 - fold * 2, 132], 10, shade(color, -0.15))
      arm(ctx, [86, 104, 96, 132, 86 + fold * 2, 132], 10, color)
      dumpling(82, 136, 0.9)
      dot(ctx, 78 - fold * 2, 132, 5.5, PEACH)
      dot(ctx, 86 + fold * 2, 132, 5.5, PEACH)
    }
    // The bamboo steamer, two tiers and the lid.
    const basket = (y: number) => {
      ctx.fillStyle = '#d6a85c'
      ctx.fillRect(160, y, 52, 16)
      ellipse(ctx, 186, y + 16, 26, 6)
      ctx.fill()
      ctx.strokeStyle = '#a16207'
      ctx.lineWidth = 1.5
      for (const yy of [y + 4, y + 10]) {
        ctx.beginPath()
        ctx.moveTo(160, yy)
        ctx.lineTo(212, yy)
        ctx.stroke()
      }
    }
    basket(130)
    basket(112)
    if (steaming && lid > 4) {
      // Dumplings inside, steam billowing out.
      ctx.fillStyle = '#e7d3a8'
      ellipse(ctx, 186, 112, 26, 6)
      ctx.fill()
      for (const x of [176, 190, 200]) dumpling(x, 114, 0.7)
      for (let k = 0; k < 6; k++) {
        const q = (p * 2 + k / 6) % 1
        ctx.fillStyle = rgba('#ffffff', 0.5 * (1 - q))
        circle(ctx, 176 + (k % 3) * 10 + Math.sin(q * 5 + k) * 6, 104 - q * 70, 7 + q * 10)
        ctx.fill()
      }
    }
    ctx.save()
    ctx.translate(186 + lid * 0.4, 108 - lid)
    ctx.rotate(lid * 0.008)
    ctx.fillStyle = '#c99a50'
    ctx.beginPath()
    ctx.ellipse(0, 0, 27, 12, 0, Math.PI, 0)
    ctx.fill()
    ctx.fillRect(-27, -1, 54, 5)
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = 1.2
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath()
      ctx.moveTo(k * 9, -10 + Math.abs(k) * 1.5)
      ctx.lineTo(k * 11, 2)
      ctx.stroke()
    }
    ctx.restore()
  }
}

// -- children wishing a happy new year ------------------------------------------------------------------

function gongXiKids(bowing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const kid = (x: number, dir: number, skin: string, girl: boolean, ph: number) => {
      const b = bowing ? Math.max(0, Math.sin((p + ph) * TAU)) : 0
      const shake = bowing ? 0 : Math.sin((p + ph) * TAU) * 3
      ctx.fillStyle = '#475569'
      rr(ctx, x - 12, 158, 10, 34, 4)
      rr(ctx, x + 2, 158, 10, 34, 4)
      ctx.fillStyle = '#57534e'
      rr(ctx, x - 14 + dir * 2, 188, 14, 7, 3)
      rr(ctx, x + dir * 2, 188, 14, 7, 3)
      ctx.save()
      ctx.translate(x, 160)
      ctx.rotate(dir * b * 0.38)
      ctx.translate(-x, -160)
      // A red silk jacket with gold frog buttons.
      ctx.fillStyle = color
      rr(ctx, x - 17, 108, 34, 56, 10)
      ctx.fillStyle = color2
      for (const y of [118, 130, 142]) ctx.fillRect(x - 6, y, 12, 3)
      ctx.fillRect(x - 17, 156, 34, 4)
      head(ctx, x + dir * 2, 90, 16, skin, dir, { blink: b > 0.5, open: bowing && b < 0.3 ? 0.6 : 0 })
      ctx.fillStyle = '#292524'
      ctx.beginPath()
      ctx.arc(x + dir * 2, 88, 17, Math.PI * 1.02, Math.PI * 1.98)
      ctx.fill()
      if (girl) {
        dot(ctx, x - 12, 74, 8, '#292524')
        dot(ctx, x + 16, 74, 8, '#292524')
        dot(ctx, x - 12, 74, 3, color)
        dot(ctx, x + 16, 74, 3, color)
      } else {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.ellipse(x + dir * 2, 78, 16, 8, 0, Math.PI, 0)
        ctx.fill()
        dot(ctx, x + dir * 2, 69, 3.5, color2)
      }
      // Fist in palm at the chest, shaking it (the new year greeting).
      const hx = x + dir * 18
      const hy = 126 + shake
      arm(ctx, [x - dir * 6, 116, x + dir * 4, 138, hx, hy], 9, shade(color, -0.2))
      arm(ctx, [x + dir * 8, 116, x + dir * 16, 136, hx + dir * 2, hy], 9, color)
      dot(ctx, hx, hy, 6, skin)
      dot(ctx, hx + dir * 4, hy, 5.5, shade(skin, -0.08))
      ctx.restore()
    }
    kid(56, 1, PEACH, false, 0)
    kid(164, -1, SKIN, true, 0.12)
  }
}

// -- the Nian beast ---------------------------------------------------------------------------------------

function nian(scared: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const s = Math.sin(p)
    const crouch = scared ? 22 : 0
    const tremble = scared ? Math.sin(p * 3) * 2 : 0
    ctx.translate(tremble, crouch)
    // Tail with a tuft.
    ctx.strokeStyle = color
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(72, 120)
    ctx.quadraticCurveTo(40, scared ? 160 : 90 + s * 8, 30, scared ? 170 : 70 + s * 10)
    ctx.stroke()
    dot(ctx, 30, scared ? 172 : 66 + s * 10, 12, color2)
    // Legs: a prowling walk (or tucked under).
    const leg = (x: number, ph: number, dark: boolean) => {
      const k = scared ? 0 : Math.sin(p + ph)
      arm(ctx, [x, 140, x + k * 14, 176 - crouch * 0.6, x + k * 18, 206 - crouch], 18, dark ? shade(color, -0.25) : color)
      ctx.fillStyle = '#f8fafc'
      for (let c = -1; c <= 1; c++) dot(ctx, x + k * 18 + 6 + c * 5, 210 - crouch, 3, '#f8fafc')
    }
    leg(96, Math.PI, true)
    leg(196, 0, true)
    ctx.fillStyle = color
    ellipse(ctx, 146, 126, 82, 38)
    ctx.fill()
    ctx.fillStyle = shade(color, 0.25)
    for (let k = 0; k < 6; k++) {
      ellipse(ctx, 100 + k * 18, 112 - Math.sin(k) * 4, 7, 5)
      ctx.fill()
    }
    ctx.fillStyle = shade(color, 0.35)
    ellipse(ctx, 150, 150, 56, 12)
    ctx.fill()
    leg(110, 0, false)
    leg(210, Math.PI, false)
    // The head: a shaggy mane, one horn, goggling eyes, fangs.
    const hx = 238
    const hy = scared ? 120 : 96 + s * 3
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU
      ctx.fillStyle = k % 2 ? color2 : shade(color2, -0.2)
      ellipse(ctx, hx - 6 + Math.cos(a) * 34, hy + Math.sin(a) * 30, 16, 10, a)
      ctx.fill()
    }
    ctx.fillStyle = color
    ellipse(ctx, hx, hy, 34, 28)
    ctx.fill()
    ctx.fillStyle = '#facc15'
    ctx.beginPath()
    ctx.moveTo(hx - 10, hy - 24)
    ctx.quadraticCurveTo(hx - 4, hy - 58, hx + 8, hy - 62)
    ctx.quadraticCurveTo(hx + 2, hy - 40, hx + 6, hy - 24)
    ctx.fill()
    if (scared) {
      // Paws over its eyes, trembling, a drop of sweat.
      dot(ctx, hx - 4, hy - 8, 9, '#ffffff')
      dot(ctx, hx + 18, hy - 8, 9, '#ffffff')
      arm(ctx, [200, 120, 220, 100, hx + 6, hy - 6], 16, shade(color, 0.1))
      for (let c = -1; c <= 1; c++) dot(ctx, hx + 10 + c * 7, hy - 10, 3, '#f8fafc')
      ctx.fillStyle = '#7f1d1d'
      ellipse(ctx, hx + 14, hy + 14, 10, 4)
      ctx.fill()
      ctx.fillStyle = '#7dd3fc'
      ctx.beginPath()
      ctx.moveTo(hx - 26, hy - 26)
      ctx.quadraticCurveTo(hx - 20, hy - 14, hx - 26, hy - 12)
      ctx.quadraticCurveTo(hx - 32, hy - 14, hx - 26, hy - 26)
      ctx.fill()
    } else {
      for (const ex of [hx - 4, hx + 18]) {
        dot(ctx, ex, hy - 8, 10, '#ffffff')
        dot(ctx, ex + 3, hy - 7, 5, '#1f2937')
      }
      ctx.fillStyle = shade(color, -0.3)
      ctx.fillRect(hx - 14, hy - 22, 16, 4)
      ctx.fillRect(hx + 10, hy - 22, 16, 4)
      ctx.fillStyle = '#7f1d1d'
      ctx.beginPath()
      ctx.ellipse(hx + 12, hy + 12, 20, 9 + Math.max(0, s) * 4, 0, 0, Math.PI)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      for (const x of [hx - 2, hx + 26]) {
        ctx.beginPath()
        ctx.moveTo(x - 3, hy + 12)
        ctx.lineTo(x, hy + 22)
        ctx.lineTo(x + 3, hy + 12)
        ctx.fill()
      }
    }
  }
}

// -- a lucky cat ------------------------------------------------------------------------------------------

function luckyCat(fast: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU * (fast ? 2 : 1)
    // Beckoning: the paw bends forward and back.
    const wave = (0.5 + 0.5 * Math.sin(p)) * (fast ? 0.55 : 0.35)
    // Body, sitting, and the gold coin held in its lap.
    ctx.fillStyle = color
    ellipse(ctx, 80, 150, 46, 46)
    ctx.fill()
    ctx.fillStyle = shade(color, -0.08)
    ellipse(ctx, 62, 190, 18, 8)
    ctx.fill()
    ellipse(ctx, 98, 190, 18, 8)
    ctx.fill()
    ctx.fillStyle = '#f97316'
    ellipse(ctx, 58, 140, 12, 16)
    ctx.fill()
    ctx.fillStyle = '#facc15'
    ellipse(ctx, 80, 160, 22, 28)
    ctx.fill()
    ctx.strokeStyle = '#ca8a04'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#b45309'
    ctx.font = 'bold 15px "Noto Sans CJK SC", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('福', 80, 160)
    arm(ctx, [56, 128, 56, 152, 64, 166], 14, color)
    // Head with ears, a happy closed-eye face, whiskers.
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(48, 64)
    ctx.lineTo(54, 26)
    ctx.lineTo(74, 52)
    ctx.moveTo(86, 52)
    ctx.lineTo(106, 26)
    ctx.lineTo(112, 64)
    ctx.fill()
    ctx.fillStyle = '#fda4af'
    ctx.beginPath()
    ctx.moveTo(56, 56)
    ctx.lineTo(58, 36)
    ctx.lineTo(68, 52)
    ctx.moveTo(92, 52)
    ctx.lineTo(102, 36)
    ctx.lineTo(104, 56)
    ctx.fill()
    ctx.fillStyle = color
    ellipse(ctx, 80, 74, 38, 32)
    ctx.fill()
    ctx.strokeStyle = '#1f2937'
    ctx.lineWidth = 2.5
    for (const x of [66, 94]) {
      ctx.beginPath()
      ctx.arc(x, 72, 6, Math.PI * 1.1, Math.PI * 1.9)
      ctx.stroke()
    }
    dot(ctx, 80, 82, 3, '#f472b6')
    ctx.beginPath()
    ctx.moveTo(74, 88)
    ctx.quadraticCurveTo(80, 94, 86, 88)
    ctx.stroke()
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 1.2
    for (const s of [-1, 1]) {
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath()
        ctx.moveTo(80 + s * 14, 86)
        ctx.lineTo(80 + s * 36, 82 + k * 6)
        ctx.stroke()
      }
    }
    dot(ctx, 60, 84, 5, rgba('#f87171', 0.4))
    dot(ctx, 100, 84, 5, rgba('#f87171', 0.4))
    // A red collar with a gold bell.
    ctx.fillStyle = color2
    rr(ctx, 50, 100, 60, 9, 4)
    dot(ctx, 80, 112, 7, '#facc15')
    ctx.fillStyle = '#ca8a04'
    ctx.fillRect(74, 112, 12, 2)
    // The raised paw, beckoning.
    ctx.save()
    ctx.translate(112, 118)
    ctx.rotate(wave)
    ctx.fillStyle = color
    ctx.strokeStyle = shade(color, -0.2)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(-9, -60, 18, 64, 9)
    ctx.fill()
    ctx.stroke()
    circle(ctx, 0, -62, 12)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#fda4af'
    dot(ctx, 0, -60, 4, '#fda4af')
    for (const x of [-6, 0, 6]) dot(ctx, x, -68, 2.2, '#fda4af')
    ctx.restore()
  }
}

// -- a child with a rabbit lantern ---------------------------------------------------------------------------

function lanternKid(raised: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const s = Math.sin(p)
    const bob = Math.abs(Math.cos(p)) * 3
    ctx.translate(0, -bob)
    // Legs walking.
    arm(ctx, [70, 160, 70 + s * 10, 186, 68 + s * 16, 210 + bob], 10, '#475569')
    arm(ctx, [80, 160, 80 - s * 10, 186, 82 - s * 16, 210 + bob], 10, '#64748b')
    arm(ctx, [70, 116, 66 - s * 8, 140, 62 - s * 12, 156], 8, shade(color, -0.2))
    ctx.fillStyle = color
    rr(ctx, 58, 108, 34, 56, 10)
    ctx.fillStyle = color2
    for (const y of [118, 130, 142]) ctx.fillRect(70, y, 10, 3)
    head(ctx, 78, 90, 16, PEACH, 1, { open: raised ? 0.6 : 0 })
    ctx.fillStyle = '#292524'
    ctx.beginPath()
    ctx.arc(78, 88, 17, Math.PI * 1.02, Math.PI * 1.98)
    ctx.quadraticCurveTo(80, 80, 62, 90)
    ctx.fill()
    // The stick held out, the rabbit lantern hanging from its end and swinging.
    const lift = raised ? 1 : 0
    const ex = 150
    const ey = raised ? 34 + Math.sin(p * 2) * 6 : 70
    const hx = 98
    const hy = 116 - lift * 22
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(hx, hy)
    ctx.lineTo(ex, ey)
    ctx.stroke()
    arm(ctx, [86, 116, 96, 132 - lift * 20, hx, hy], 8, color)
    dot(ctx, hx, hy, 5, PEACH)
    const swing = Math.sin(p + 0.8) * (raised ? 0.35 : 0.18)
    ctx.save()
    ctx.translate(ex, ey)
    ctx.rotate(swing)
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, 22)
    ctx.stroke()
    glow(ctx, 0, 44, 40, '#fde68a', 0.6)
    ctx.fillStyle = '#f8fafc'
    ellipse(ctx, 0, 46, 22, 16)
    ctx.fill()
    dot(ctx, 18, 36, 10, '#f8fafc')
    ellipse(ctx, 12, 20, 4, 12, -0.3)
    ctx.fill()
    ellipse(ctx, 20, 20, 4, 12, 0.3)
    ctx.fill()
    ctx.fillStyle = '#fca5a5'
    ellipse(ctx, 12, 20, 1.6, 8, -0.3)
    ctx.fill()
    ellipse(ctx, 20, 20, 1.6, 8, 0.3)
    ctx.fill()
    dot(ctx, 22, 34, 2.5, color2)
    ctx.strokeStyle = color2
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 46, 10, 0.5, 2.6)
    ctx.stroke()
    dot(ctx, -22, 44, 5, '#f8fafc')
    ctx.fillStyle = '#fef3c7'
    for (const x of [-12, 10]) {
      ctx.beginPath()
      ctx.arc(x, 62, 5, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  }
}

const BUBBLE = { id: 'bubble', frames: 1, w: 360, h: 140 }

export const NEW_YEAR_ROWS: Record<string, SpriteRow[]> = {
  'baby-new-year': [
    { id: 'main', frames: 4, w: 180, h: 210, paint: babyNewYear(false) },
    { id: 'act', frames: 8, w: 180, h: 210, paint: babyNewYear(true) },
    { ...BUBBLE, paint: saying('Happy New Year!') },
    SPARKLE,
  ],
  // The top of the hourglass full (1 January) to empty (New Year's Eve).
  'father-time': [
    { id: 'main', frames: 8, w: 200, h: 280, paint: fatherTime },
    { ...BUBBLE, paint: saying('Time flies!') },
    SPARKLE,
  ],
  'noisemaker-kids': [
    { id: 'main', frames: 4, w: 220, h: 200, paint: noisemakerKids(false) },
    { id: 'act', frames: 8, w: 220, h: 200, paint: noisemakerKids(true) },
    { ...BUBBLE, paint: saying('Woo-hoo!') },
    SPARKLE,
  ],
  'midnight-toast': [
    { id: 'main', frames: 4, w: 220, h: 240, paint: midnightToast('chat') },
    { id: 'act', frames: 8, w: 220, h: 240, paint: midnightToast('clink') },
    { id: 'kiss', frames: 4, w: 220, h: 240, paint: midnightToast('kiss') },
    { ...BUBBLE, paint: saying('Cheers!') },
    SPARKLE,
  ],
  'conga-line': [
    { id: 'main', frames: 8, w: 300, h: 200, paint: congaLine(false) },
    { id: 'wave', frames: 8, w: 300, h: 200, paint: congaLine(true) },
    { ...BUBBLE, paint: saying('Join the line!') },
    SPARKLE,
  ],
  'polar-plunge': [
    { id: 'main', frames: 4, w: 240, h: 220, paint: polarPlunge(false) },
    { id: 'act', frames: 8, w: 240, h: 220, paint: polarPlunge(true) },
    { ...BUBBLE, paint: saying('Brrr!') },
    SPARKLE,
  ],
  'rose-float': [
    { id: 'main', frames: 8, w: 360, h: 220, paint: roseFloat(false) },
    { id: 'wave', frames: 8, w: 360, h: 220, paint: roseFloat(true) },
    SPARKLE,
  ],
  mummers: [
    { id: 'main', frames: 8, w: 200, h: 260, paint: mummer(false) },
    { id: 'wave', frames: 8, w: 200, h: 260, paint: mummer(true) },
    SPARKLE,
  ],
  'sleepy-reveler': [
    { id: 'main', frames: 4, w: 230, h: 200, paint: sleepyReveler(false) },
    { id: 'act', frames: 8, w: 230, h: 200, paint: sleepyReveler(true) },
    { ...BUBBLE, paint: saying('Did I miss it?!') },
    SPARKLE,
  ],
  // Rat to Pig, in the order of the years.
  'zodiac-animal': [
    { id: 'main', frames: 12, w: 240, h: 240, paint: zodiacMedallion },
    { ...BUBBLE, frames: 12, paint: (ctx, f, n, c) => saying(`Year of the ${ZODIAC[f]}!`)(ctx, f, n, c) },
    SPARKLE,
  ],
  'god-of-fortune': [
    { id: 'main', frames: 4, w: 200, h: 260, paint: godOfFortune(false) },
    { id: 'act', frames: 8, w: 200, h: 260, paint: godOfFortune(true) },
    { ...BUBBLE, paint: saying('Gong xi fa cai!') },
    SPARKLE,
  ],
  'festival-drum': [
    { id: 'main', frames: 4, w: 230, h: 232, paint: festivalDrum(false) },
    { id: 'act', frames: 8, w: 230, h: 232, paint: festivalDrum(true) },
    SPARKLE,
  ],
  dumplings: [
    { id: 'main', frames: 4, w: 230, h: 200, paint: dumplings(false) },
    { id: 'act', frames: 8, w: 230, h: 200, paint: dumplings(true) },
    { ...BUBBLE, paint: saying('Dumplings are ready!') },
    SPARKLE,
  ],
  'gong-xi-kids': [
    { id: 'main', frames: 4, w: 220, h: 200, paint: gongXiKids(false) },
    { id: 'act', frames: 8, w: 220, h: 200, paint: gongXiKids(true) },
    { ...BUBBLE, paint: saying('Xin nian kuai le!') },
    SPARKLE,
  ],
  'nian-beast': [
    { id: 'main', frames: 8, w: 300, h: 220, paint: nian(false) },
    { id: 'look', frames: 4, w: 300, h: 220, paint: nian(true) },
    SPARKLE,
  ],
  'lucky-cat': [
    { id: 'main', frames: 4, w: 160, h: 200, paint: luckyCat(false) },
    { id: 'act', frames: 8, w: 160, h: 200, paint: luckyCat(true) },
    { ...BUBBLE, paint: saying('Good fortune!') },
    SPARKLE,
  ],
  'lantern-kid': [
    { id: 'main', frames: 8, w: 180, h: 230, paint: lanternKid(false) },
    { id: 'wave', frames: 8, w: 180, h: 230, paint: lanternKid(true) },
    SPARKLE,
  ],
}
