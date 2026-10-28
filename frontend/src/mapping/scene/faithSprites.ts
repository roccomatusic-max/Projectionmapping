/**
 * Passover, the High Holy Days, Ramadan and Eid: a family seder where the youngest asks the four questions, the
 * hunt for the afikomen, the door opened for Elijah, the sea parting, the shofar, apples dipped in honey, tashlich
 * crumbs for the ducks, a family in their sukkah, a family watching for the real moon, breaking the fast at iftar,
 * Eid gifts and a child walking with a lit fanous.
 *
 * Painted the same way as sprites.ts: facing right, one frame at a time, into a cell of w by h design units.
 */

import { arm, dot, head, person, rr, seated, standing, type Dress } from './figures'
import {
  circle, ellipse, rgba, saying, shade, SPARKLE, TAU,
  type Ctx, type SpriteColors, type SpriteRow,
} from './sprites'

const PEACH = '#f5c9a0'
const TAN = '#c68a5a'
const BROWN = '#8d5a3b'
const OLIVE = '#d9a77a'

/** A kippah on a head at (x, y). */
function kippah(ctx: Ctx, x: number, y: number, c: string) {
  ctx.fillStyle = c
  ctx.beginPath()
  ctx.arc(x, y - 12, 10, Math.PI, TAU)
  ctx.fill()
}

/** A headscarf over a head at (x, y), the face left showing, turned to dir. */
function hijab(ctx: Ctx, x: number, y: number, dir: number, c: string, skin: string, o: { open?: number; blink?: boolean } = {}) {
  ctx.fillStyle = c
  ctx.beginPath()
  ctx.arc(x, y, 20, 0, TAU)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x - 20, y + 2)
  ctx.lineTo(x + 20, y + 2)
  ctx.lineTo(x + 18, y + 26)
  ctx.lineTo(x - 18, y + 26)
  ctx.fill()
  ctx.fillStyle = shade(c, -0.12)
  ctx.beginPath()
  ctx.arc(x, y, 20, Math.PI * 0.15, Math.PI * 0.85)
  ctx.fill()
  head(ctx, x + dir * 4, y + 1, 12.5, skin, dir, o)
}

/** A plain wooden table seen from the front, its top at y. */
function table(ctx: Ctx, x0: number, x1: number, y: number, g: number, cloth: string) {
  ctx.fillStyle = cloth
  rr(ctx, x0, y, x1 - x0, 14, 3)
  ctx.fillStyle = shade(cloth, -0.08)
  ctx.fillRect(x0 + 4, y + 14, x1 - x0 - 8, 22)
  ctx.fillStyle = '#d6c29a'
  ctx.fillRect(x0 + 10, y + 36, 6, g - y - 36)
  ctx.fillRect(x1 - 16, y + 36, 6, g - y - 36)
}

function cup(ctx: Ctx, x: number, y: number, s: number, wine = '#be123c') {
  ctx.fillStyle = '#e2e8f0'
  ctx.beginPath()
  ctx.moveTo(x - 6 * s, y - 16 * s)
  ctx.lineTo(x + 6 * s, y - 16 * s)
  ctx.lineTo(x + 4 * s, y - 6 * s)
  ctx.lineTo(x + 1 * s, y - 4 * s)
  ctx.lineTo(x + 1 * s, y)
  ctx.lineTo(x + 4 * s, y + 1 * s)
  ctx.lineTo(x - 4 * s, y + 1 * s)
  ctx.lineTo(x - 1 * s, y)
  ctx.lineTo(x - 1 * s, y - 4 * s)
  ctx.lineTo(x - 4 * s, y - 6 * s)
  ctx.fill()
  ctx.fillStyle = wine
  ctx.fillRect(x - 5 * s, y - 13 * s, 10 * s, 5 * s)
}

// -- the seder ------------------------------------------------------------------------------------------

function sederTable(asking: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 222
    const top = g - 70
    // Grandpa at the head of the table (kippah on), Mum, and the youngest, who stands to ask the questions.
    const grandpa: Dress = { skin: PEACH, hair: '#e5e7eb', shirt: '#e2e8f0', pants: '#94a3b8' }
    const mum: Dress = { skin: OLIVE, hair: '#3f2a1c', shirt: color2, pants: '#94a3b8' }
    const kid: Dress = { skin: PEACH, hair: '#78350f', shirt: color, pants: '#cbd5e1' }
    seated(ctx, 50, g, 52, 0.85, 1, grandpa)
    kippah(ctx, 50 + 2 * 0.85, g - 52 - 62 * 0.85, color)
    seated(ctx, 140, g, 52, 0.82, 1, mum)
    const raise = Math.max(0, Math.sin(p * TAU)) * 10
    if (asking) {
      person(ctx, 230, g - 6, 0.8, -1, kid, { open: 0.4 + 0.4 * Math.abs(Math.sin(p * TAU * 3)) }, () => {
        kippah(ctx, -2, -118, color2)
        // Holding up the Haggadah to read from.
        arm(ctx, [-10, -98, -24, -100, -34, -112], 8, kid.shirt)
        arm(ctx, [10, -98, -4, -96, -22, -108], 8, kid.shirt)
        ctx.fillStyle = '#f8fafc'
        rr(ctx, -46, -130, 22, 28, 2)
        ctx.fillStyle = color
        rr(ctx, -44, -128, 18, 4, 1)
      })
    } else {
      seated(ctx, 230, g, 52, 0.78, -1, kid)
      kippah(ctx, 230 - 2 * 0.78, g - 52 - 62 * 0.78, color2)
    }
    // Grandpa lifting his cup now and then.
    arm(ctx, [62, g - 92, 76, g - 84, 84, top - 4 - raise], 7, grandpa.shirt)
    table(ctx, 30, 270, top, g, '#f8fafc')
    ctx.fillStyle = color
    ctx.fillRect(30, top + 10, 240, 4)
    // The seder plate with its six foods, the covered matzah and the cups (Elijah's in the middle).
    ctx.fillStyle = '#e2e8f0'
    ellipse(ctx, 150, top - 3, 30, 7)
    ctx.fill()
    const foods = ['#a3e635', '#fef3c7', '#f8fafc', '#a16207', '#16a34a', '#fca5a5']
    foods.forEach((c, k) => dot(ctx, 132 + k * 7, top - 6 + (k % 2) * 3, 3.5, c))
    ctx.fillStyle = '#f1f5f9'
    rr(ctx, 86, top - 10, 30, 10, 2)
    ctx.fillStyle = color2
    ctx.fillRect(86, top - 6, 30, 2)
    cup(ctx, 84, top - 1 - raise, 1)
    cup(ctx, 200, top - 1, 1.3)
    cup(ctx, 248, top - 1, 1)
    // Candles in silver sticks.
    for (const cx of [170, 182]) {
      ctx.fillStyle = '#cbd5e1'
      rr(ctx, cx - 2, top - 20, 4, 20, 1)
      ctx.fillStyle = '#f8fafc'
      rr(ctx, cx - 2, top - 34, 4, 14, 1)
      ctx.fillStyle = '#fbbf24'
      ellipse(ctx, cx, top - 38 - Math.sin(p * TAU * 3 + cx) * 1, 2.5, 5)
      ctx.fill()
    }
  }
}

// -- the hunt for the afikomen ------------------------------------------------------------------------------

function afikomenHunt(found: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 212
    // The sofa, a cushion lifted as the child looks under it.
    ctx.fillStyle = color2
    rr(ctx, 110, g - 96, 120, 46, 12)
    rr(ctx, 100, g - 70, 20, 60, 8)
    rr(ctx, 220, g - 70, 20, 60, 8)
    ctx.fillStyle = shade(color2, -0.12)
    rr(ctx, 116, g - 54, 108, 30, 6)
    ctx.fillStyle = '#d6c29a'
    ctx.fillRect(112, g - 14, 6, 14)
    ctx.fillRect(222, g - 14, 6, 14)
    const lift = found ? 0 : Math.max(0, Math.sin(p * TAU)) * 16
    ctx.fillStyle = shade(color2, 0.15)
    ctx.save()
    ctx.translate(176, g - 58)
    ctx.rotate(-lift * 0.02)
    rr(ctx, -40, -10 - lift, 80, 14, 5)
    ctx.restore()
    if (lift > 8) {
      // Nothing under there yet: just a sock.
      ctx.fillStyle = '#f8fafc'
      rr(ctx, 160, g - 60, 14, 6, 3)
    }
    const kid: Dress = { skin: TAN, hair: '#1c1917', shirt: color, pants: '#cbd5e1' }
    if (!found) {
      // On tiptoe, peeking under the cushion.
      person(ctx, 86, g, 0.85, 1, kid, { stride: Math.sin(p * TAU * 2) * 0.3 }, () => {
        kippah(ctx, 2, -118, color2)
        arm(ctx, [10, -98, 40, -96, 76 + lift * 0.2, -70 - lift], 8, kid.shirt)
        arm(ctx, [-10, -98, -14, -76, -10, -60], 8, kid.shirt)
      })
      return
    }
    // Found it: the napkin-wrapped matzah held high.
    const jump = Math.abs(Math.sin(p * TAU * 2)) * 14
    person(ctx, 76, g - jump, 0.85, 1, kid, { open: 0.9 }, () => {
      kippah(ctx, 2, -118, color2)
      arm(ctx, [-10, -98, -24, -122, -26, -146], 8, kid.shirt)
      arm(ctx, [10, -98, 24, -122, 26, -146], 8, kid.shirt)
      ctx.fillStyle = '#f8fafc'
      ctx.save()
      ctx.translate(0, -160)
      ctx.rotate(Math.sin(p * TAU * 2) * 0.1)
      rr(ctx, -30, -14, 60, 26, 4)
      ctx.fillStyle = color
      ctx.fillRect(-30, -4, 60, 4)
      ctx.fillStyle = '#f2d39b'
      rr(ctx, -12, -18, 24, 6, 2)
      ctx.restore()
    })
    for (let k = 0; k < 5; k++) {
      const a = (k * TAU) / 5 + p * 3
      dot(ctx, 76 + Math.cos(a) * 52, g - 150 - jump + Math.sin(a) * 26, 3, k % 2 ? color : '#fde68a')
    }
  }
}

// -- the door opened for Elijah ----------------------------------------------------------------------------

/** Level: the door swinging open as people come, starlight pouring in and the wine in Elijah's cup trembling. */
function elijahsDoor(ctx: Ctx, f: number, n: number, { color, color2 }: SpriteColors) {
  const k = f / (n - 1)
  const g = 252
  // Night outside the doorway, then the light.
  ctx.fillStyle = '#d6c29a'
  ctx.fillRect(46, g - 230, 128, 12)
  ctx.fillRect(46, g - 230, 12, 230)
  ctx.fillRect(162, g - 230, 12, 230)
  const lightG = ctx.createLinearGradient(110, g - 218, 110, g)
  lightG.addColorStop(0, rgba('#e0f2fe', 0.15 + 0.6 * k))
  lightG.addColorStop(1, rgba('#fef9c3', 0.1 + 0.5 * k))
  ctx.fillStyle = lightG
  ctx.fillRect(58, g - 218, 104, 218)
  for (let s = 0; s < 6; s++) {
    const sx = 66 + ((s * 37) % 90)
    const sy = g - 210 + ((s * 53) % 120)
    dot(ctx, sx, sy, 1.5 + k * 1.5, rgba('#f8fafc', 0.4 + 0.6 * k))
  }
  // The door on its hinge, narrowing as it swings in.
  const w = 104 * (1 - k * 0.82)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(58, g - 218)
  ctx.lineTo(58 + w, g - 218 + k * 10)
  ctx.lineTo(58 + w, g - k * 10)
  ctx.lineTo(58, g)
  ctx.fill()
  ctx.fillStyle = shade(color, -0.15)
  if (w > 30) {
    rr(ctx, 66, g - 200, w - 18, 70, 4)
    rr(ctx, 66, g - 110, w - 18, 90, 4)
  }
  dot(ctx, 58 + w - 10, g - 110, 4, '#fde68a')
  // Light spilling across the floor.
  if (k > 0.1) {
    ctx.fillStyle = rgba('#fef9c3', 0.35 * k)
    ctx.beginPath()
    ctx.moveTo(58, g)
    ctx.lineTo(162, g)
    ctx.lineTo(214, g + 10)
    ctx.lineTo(40, g + 10)
    ctx.fill()
  }
  // Elijah's cup on its little table, the wine rippling more as the door opens.
  ctx.fillStyle = '#e7d3b0'
  rr(ctx, 176, g - 70, 40, 8, 2)
  ctx.fillRect(193, g - 62, 6, 62)
  ctx.save()
  ctx.translate(196, g - 72)
  ctx.scale(1.6, 1.6)
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(-8, -26)
  ctx.lineTo(8, -26)
  ctx.quadraticCurveTo(8, -10, 1, -8)
  ctx.lineTo(1, -2)
  ctx.lineTo(6, 0)
  ctx.lineTo(-6, 0)
  ctx.lineTo(-1, -2)
  ctx.lineTo(-1, -8)
  ctx.quadraticCurveTo(-8, -10, -8, -26)
  ctx.fill()
  ctx.fillStyle = '#be123c'
  ellipse(ctx, 0, -25, 7.5, 2)
  ctx.fill()
  ctx.strokeStyle = rgba('#fecdd3', 0.8 * k)
  ctx.lineWidth = 0.8
  for (let r = 0; r < 2; r++) {
    ctx.beginPath()
    ctx.ellipse(0, -25, 2 + r * 2.5 + (f % 2), 0.6 + r * 0.6, 0, 0, TAU)
    ctx.stroke()
  }
  ctx.restore()
  if (k > 0.8) {
    ctx.fillStyle = rgba('#fef9c3', 0.7)
    for (let s = 0; s < 4; s++) dot(ctx, 196 + Math.cos(s * 1.7) * 18, g - 128 + Math.sin(s * 1.7) * 10, 2.5, rgba('#fef9c3', 0.8))
  }
}

// -- the sea parting -------------------------------------------------------------------------------------------

/** Level: the waters drawing back into two walls as people come, a dry path between them. */
function seaParting(ctx: Ctx, f: number, n: number, { color, color2 }: SpriteColors) {
  const k = f / (n - 1)
  const g = 212
  const gap = k * 120
  // The seabed path.
  ctx.fillStyle = '#e7d3a6'
  ctx.beginPath()
  ctx.moveTo(150 - gap / 2, g - 60)
  ctx.lineTo(150 + gap / 2, g - 60)
  ctx.lineTo(150 + gap * 0.8, g)
  ctx.lineTo(150 - gap * 0.8, g)
  ctx.fill()
  // The two walls of water, foam along their tops and faces.
  for (const side of [-1, 1]) {
    const inner = 150 + side * gap / 2
    const outer = side < 0 ? 0 : 300
    const h = 60 + k * 110
    const water = ctx.createLinearGradient(0, g - h, 0, g)
    water.addColorStop(0, shade(color, 0.35))
    water.addColorStop(1, color)
    ctx.fillStyle = water
    ctx.beginPath()
    ctx.moveTo(outer, g)
    ctx.lineTo(outer, g - h + 10)
    for (let s = 0; s <= 8; s++) {
      const x = outer + (inner - outer) * (s / 8)
      ctx.lineTo(x, g - h + Math.sin(s * 1.3 + f * 0.9) * 6)
    }
    ctx.quadraticCurveTo(inner + side * 14, g - h * 0.5, inner + side * gap * 0.3, g)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = rgba('#f8fafc', 0.85)
    ctx.lineWidth = 4
    ctx.beginPath()
    for (let s = 0; s <= 8; s++) {
      const x = outer + (inner - outer) * (s / 8)
      ctx.lineTo(x, g - h + Math.sin(s * 1.3 + f * 0.9) * 6)
    }
    ctx.stroke()
    ctx.strokeStyle = rgba(color2, 0.6)
    ctx.lineWidth = 2.5
    for (let r = 1; r < 4; r++) {
      ctx.beginPath()
      ctx.moveTo(outer, g - h + r * h * 0.22)
      ctx.quadraticCurveTo((outer + inner) / 2, g - h + r * h * 0.22 - 8, inner + side * (r * 4), g - h + r * h * 0.24)
      ctx.stroke()
    }
    // Spray off the face of the wall.
    for (let s = 0; s < 3; s++) dot(ctx, inner + side * 6, g - h * (0.3 + s * 0.2) - (f % 3) * 2, 3, rgba('#f8fafc', 0.7 * k))
  }
  // Travellers crossing on dry ground once it's open.
  if (k > 0.6) {
    const a = (k - 0.6) / 0.4
    for (let j = 0; j < 3; j++) {
      const x = 130 + j * 16
      const y = g - 4 - j * 6
      ctx.fillStyle = rgba(['#f8fafc', '#fde68a', '#e2e8f0'][j], a)
      rr(ctx, x - 4, y - 22, 8, 18, 3)
      dot(ctx, x, y - 26, 4, rgba('#e7c7a0', a))
      ctx.fillRect(x - 3, y - 4, 2, 4)
      ctx.fillRect(x + 1, y - 4, 2, 4)
    }
  }
}

// -- the shofar ----------------------------------------------------------------------------------------------

function shofarBlower(blowing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 262
    const x = 88
    const d: Dress = { skin: PEACH, hair: '#78716c', shirt: '#e2e8f0', pants: '#94a3b8' }
    standing(ctx, x, g, 1, d, { blink: blowing })
    // A grey beard, the white kippah and the tallit (prayer shawl) over his shoulders.
    ctx.fillStyle = '#d6d3d1'
    ctx.beginPath()
    ctx.moveTo(x - 8, g - 112)
    ctx.quadraticCurveTo(x + 6, g - 88, x + 18, g - 110)
    ctx.fill()
    kippah(ctx, x + 2, g - 118, '#f8fafc')
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(x - 18, g - 104)
    ctx.lineTo(x + 18, g - 104)
    ctx.lineTo(x + 22, g - 56)
    ctx.lineTo(x - 22, g - 56)
    ctx.fill()
    ctx.fillStyle = color
    for (const yy of [g - 72, g - 64]) ctx.fillRect(x - 21, yy, 42, 3)
    ctx.strokeStyle = '#f8fafc'
    ctx.lineWidth = 1.5
    for (let k = 0; k < 6; k++) {
      ctx.beginPath()
      ctx.moveTo(x - 20 + k * 8, g - 56)
      ctx.lineTo(x - 20 + k * 8, g - 46)
      ctx.stroke()
    }
    // The ram's horn: held ready, or raised to his lips and blown.
    ctx.save()
    if (blowing) {
      ctx.translate(x + 12, g - 112)
      ctx.rotate(-0.35)
    } else {
      ctx.translate(x + 20, g - 80)
      ctx.rotate(0.2)
    }
    const horn = ctx.createLinearGradient(0, 0, 70, 0)
    horn.addColorStop(0, '#fef3c7')
    horn.addColorStop(1, '#a16207')
    ctx.fillStyle = horn
    ctx.beginPath()
    ctx.moveTo(0, -2)
    ctx.quadraticCurveTo(40, 0, 60, -26)
    ctx.lineTo(74, -22)
    ctx.quadraticCurveTo(50, 12, 0, 4)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#78350f'
    ellipse(ctx, 67, -24, 7, 3, 0.3)
    ctx.fill()
    ctx.restore()
    if (blowing) {
      arm(ctx, [x + 10, g - 98, x + 30, g - 110, x + 40, g - 122], 9, '#e2e8f0')
      arm(ctx, [x - 10, g - 98, x + 8, g - 104, x + 24, g - 114], 9, '#cbd5e1')
      // The blasts: long rings going out from the bell of the horn.
      ctx.strokeStyle = rgba(color2, 0.8)
      ctx.lineWidth = 3
      for (let r = 0; r < 3; r++) {
        const q = (p * 2 + r / 3) % 1
        ctx.beginPath()
        ctx.arc(x + 76, g - 150, 10 + q * 50, -1.4, 0.2)
        ctx.globalAlpha = 1 - q
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    } else {
      arm(ctx, [x + 10, g - 98, x + 20, g - 84, x + 24, g - 76], 9, '#e2e8f0')
      arm(ctx, [x - 10, g - 98, x - 16, g - 78, x - 12, g - 62], 9, '#cbd5e1')
    }
  }
}

// -- apples and honey ---------------------------------------------------------------------------------------

function applesHoney(eating: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 222
    const top = g - 64
    const kid: Dress = { skin: BROWN, hair: '#1c1917', shirt: color2, pants: '#cbd5e1' }
    seated(ctx, 70, g, 46, 0.85, 1, kid, eating ? 0.6 : 0)
    // The table: a bowl of apple slices and the honey pot.
    table(ctx, 100, 220, top, g, '#f8fafc')
    ctx.fillStyle = '#e2e8f0'
    ellipse(ctx, 180, top - 4, 26, 8)
    ctx.fill()
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(166 + k * 9, top - 8, 7, Math.PI, TAU)
      ctx.fill()
      ctx.fillStyle = '#fef9c3'
      ctx.beginPath()
      ctx.arc(166 + k * 9, top - 8, 5, Math.PI, TAU)
      ctx.fill()
    }
    ctx.fillStyle = '#fbbf24'
    rr(ctx, 120, top - 30, 26, 30, 8)
    ctx.fillStyle = '#d97706'
    rr(ctx, 118, top - 34, 30, 6, 3)
    const s = 0.85
    const hx = 70 + 2 * s
    const hy = g - 46 - 62 * s
    if (eating) {
      // A happy bite of honey-dipped apple.
      const bite = Math.abs(Math.sin(p * TAU * 2))
      arm(ctx, [hx - 4, hy + 32, hx + 14, hy + 24, hx + 12 + bite * 2, hy + 8], 8, kid.shirt)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(hx + 16, hy + 8, 7, Math.PI * 0.8, Math.PI * 2.2)
      ctx.fill()
      ctx.fillStyle = '#fde68a'
      ctx.beginPath()
      ctx.arc(hx + 16, hy + 8, 5, Math.PI * 0.9, Math.PI * 2.1)
      ctx.fill()
      for (let k = 0; k < 3; k++) {
        const q = (p * 2 + k / 3) % 1
        ctx.fillStyle = rgba('#fde68a', 1 - q)
        ctx.font = 'bold 14px sans-serif'
        ctx.fillText('♥', hx + 20 + k * 8, hy - 18 - q * 24)
      }
    } else {
      // Dipping a slice in the honey, a drip coming off it.
      const dip = Math.max(0, Math.sin(p * TAU))
      const [ax, ay] = arm(ctx, [hx - 4, hy + 32, hx + 30, hy + 26, 132, top - 34 - (1 - dip) * 14], 8, kid.shirt)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(ax + 2, ay + 2, 7, 0, Math.PI)
      ctx.fill()
      ctx.fillStyle = 'rgba(251,191,36,0.95)'
      ellipse(ctx, ax + 2, ay + 10 + dip * 4, 2.5, 3 + dip * 3)
      ctx.fill()
    }
  }
}

// -- tashlich ------------------------------------------------------------------------------------------------

function tashlich(tossing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 212
    // The stream with its ripples.
    ctx.fillStyle = rgba(color, 0.55)
    ctx.beginPath()
    ctx.moveTo(130, g)
    ctx.quadraticCurveTo(160, g - 40, 280, g - 42)
    ctx.lineTo(280, g)
    ctx.fill()
    ctx.strokeStyle = rgba('#f8fafc', 0.6)
    ctx.lineWidth = 2
    for (let k = 0; k < 4; k++) {
      const rx = 170 + k * 26 + Math.sin(p * TAU + k) * 6
      ctx.beginPath()
      ctx.moveTo(rx, g - 18 + (k % 2) * 8)
      ctx.lineTo(rx + 14, g - 18 + (k % 2) * 8)
      ctx.stroke()
    }
    // Ducks: paddling about, then coming in for the crumbs.
    const come = tossing ? Math.min(1, p / 0.4) : 0
    for (let j = 0; j < 2; j++) {
      const dx = 250 - j * 34 - come * 50 + (tossing ? 0 : Math.sin(p * TAU + j) * 8)
      const dy = g - 22 - j * 6
      const peck = tossing && come >= 1 && Math.sin(p * TAU * 4 + j) > 0
      ctx.fillStyle = j ? '#f8fafc' : '#d6c29a'
      ellipse(ctx, dx, dy, 15, 8)
      ctx.fill()
      dot(ctx, dx - 12, dy - (peck ? 2 : 10), 6, j ? '#f8fafc' : '#16a34a')
      ctx.fillStyle = '#f59e0b'
      ctx.beginPath()
      ctx.moveTo(dx - 17, dy - (peck ? 2 : 10))
      ctx.lineTo(dx - 25, dy - (peck ? 0 : 8))
      ctx.lineTo(dx - 17, dy - (peck ? -1 : 7))
      ctx.fill()
      dot(ctx, dx - 13, dy - (peck ? 4 : 12), 1.4, '#1f2937')
    }
    // A child (in their holiday best) throwing crumbs from a paper bag.
    const kid: Dress = { skin: PEACH, hair: '#ca8a04', shirt: color2, pants: '#e2e8f0' }
    const toss = tossing ? (p * 3) % 1 : 0
    standing(ctx, 76, g, 1, kid, { skirt: true, open: tossing ? 0.4 : 0 })
    ctx.fillStyle = '#d6c29a'
    rr(ctx, 46, g - 86, 18, 22, 2)
    arm(ctx, [66, g - 98, 58, g - 84, 56, g - 78], 8, kid.shirt)
    if (tossing) {
      const [hx, hy] = arm(ctx, [86, g - 98, 100 + toss * 10, g - 104 - toss * 14, 112 + toss * 18, g - 112 - toss * 10], 8, kid.shirt)
      dot(ctx, hx, hy, 4.5, kid.skin)
      for (let k = 0; k < 6; k++) {
        const q = (toss + k / 6) % 1
        dot(ctx, hx + q * 90, hy + Math.sin(q * Math.PI) * -24 + q * q * 70, 2.2, '#fef3c7')
      }
    } else {
      arm(ctx, [86, g - 98, 96, g - 84, 92, g - 74], 8, kid.shirt)
    }
  }
}

// -- a family in their sukkah ---------------------------------------------------------------------------------

function sukkah(waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 252
    // The frame, the cloth walls drawn back and the roof of leafy branches.
    ctx.fillStyle = '#d6c29a'
    for (const px of [20, 236]) ctx.fillRect(px, g - 200, 8, 200)
    ctx.fillRect(20, g - 204, 224, 8)
    ctx.fillStyle = rgba(color2, 0.5)
    ctx.beginPath()
    ctx.moveTo(28, g - 196)
    ctx.quadraticCurveTo(46, g - 100, 30, g)
    ctx.lineTo(28, g)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(236, g - 196)
    ctx.quadraticCurveTo(218, g - 100, 234, g)
    ctx.lineTo(236, g)
    ctx.fill()
    for (let k = 0; k < 14; k++) {
      ctx.fillStyle = ['#65a30d', '#4d7c0f', '#84cc16'][k % 3]
      ellipse(ctx, 22 + k * 17, g - 208 + (k % 2) * 6, 16, 6, (k % 3) * 0.4 - 0.4)
      ctx.fill()
    }
    // Hanging fruit and paper chains.
    const hang: Array<[number, string]> = [[60, '#ef4444'], [104, '#facc15'], [150, '#a855f7'], [196, '#fb923c']]
    for (const [hx, c] of hang) {
      const sw = Math.sin(p * TAU + hx) * 2
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(hx, g - 196)
      ctx.lineTo(hx + sw, g - 170)
      ctx.stroke()
      dot(ctx, hx + sw, g - 164, 6, c)
    }
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.beginPath()
    for (let k = 0; k <= 10; k++) ctx.lineTo(30 + k * 20.6, g - 186 + (k % 2 ? 8 : 0))
    ctx.stroke()
    // The family at their table.
    const dad: Dress = { skin: OLIVE, hair: '#1c1917', shirt: '#e2e8f0', pants: '#94a3b8' }
    const kid: Dress = { skin: OLIVE, hair: '#3f2a1c', shirt: color2, pants: '#cbd5e1' }
    seated(ctx, 70, g, 48, 0.9, 1, dad)
    kippah(ctx, 70 + 2 * 0.9, g - 48 - 62 * 0.9, color)
    if (waving) {
      // Shaking the lulav and etrog: to the front, the sides, up and down.
      const dirs: Array<[number, number]> = [[1, 0], [0, -1], [-1, 0], [0, 1]]
      const [ux, uy] = dirs[Math.floor(p * 4) % 4]
      const shake = Math.sin(p * TAU * 8) * 3
      person(ctx, 184, g, 0.85, -1, kid, { open: 0.4 }, () => {
        kippah(ctx, -2, -118, color)
        const hx = -24 + ux * 10
        const hy = -100 + uy * 14 + shake
        arm(ctx, [-10, -98, -18, -96, hx, hy], 8, kid.shirt)
        arm(ctx, [10, -98, -4, -96, hx + 4, hy + 6], 8, kid.shirt)
        // The palm frond bundle and the yellow citron.
        ctx.fillStyle = '#4d7c0f'
        ctx.save()
        ctx.translate(hx, hy)
        ctx.rotate(-0.15 + ux * 0.3)
        rr(ctx, -3, -66, 6, 70, 3)
        ctx.fillStyle = '#84cc16'
        ellipse(ctx, -6, -40, 3, 16, -0.2)
        ctx.fill()
        ellipse(ctx, 6, -36, 3, 14, 0.2)
        ctx.fill()
        ctx.restore()
        ctx.fillStyle = '#facc15'
        ellipse(ctx, hx + 6, hy + 6, 7, 9, 0.3)
        ctx.fill()
      })
    } else {
      seated(ctx, 184, g, 48, 0.85, -1, kid)
      kippah(ctx, 184 - 2 * 0.85, g - 48 - 62 * 0.85, color)
    }
    table(ctx, 96, 170, g - 64, g, '#f8fafc')
    ctx.fillStyle = '#fde68a'
    ellipse(ctx, 120, g - 70, 12, 6)
    ctx.fill()
    ctx.fillStyle = '#fb923c'
    dot(ctx, 148, g - 70, 6, '#ef4444')
    // Stars through the gaps in the roof.
    for (let k = 0; k < 3; k++) dot(ctx, 70 + k * 60, g - 226 + (k % 2) * 6, 2, rgba('#f8fafc', 0.5 + 0.5 * Math.sin(p * TAU + k)))
  }
}

// -- watching for the moon --------------------------------------------------------------------------------

/** The phases the moon is drawn in: 0 new, 2 first quarter, 4 full, 6 last quarter. */
export const MOON_PHASES = 8

/** The moon in a phase (0 to 7): it waxes from the right, is full at 4 and wanes away to the left. */
function moon(ctx: Ctx, x: number, y: number, r: number, phase: number) {
  const k = phase / MOON_PHASES
  ctx.fillStyle = rgba('#94a3b8', 0.25)
  circle(ctx, x, y, r)
  ctx.fill()
  if (phase === 0) {
    ctx.strokeStyle = rgba('#fef9c3', 0.5)
    ctx.lineWidth = 1.5
    circle(ctx, x, y, r)
    ctx.stroke()
    return
  }
  // The lit half, closed off by the terminator: an ellipse as wide as r times cos of the phase angle.
  const waxing = k < 0.5
  const crescent = k < 0.25 || k > 0.75
  const tw = Math.max(0.01, Math.abs(Math.cos(k * TAU)) * r)
  const bulgeRight = waxing === crescent
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, !waxing)
  if (bulgeRight) ctx.ellipse(x, y, tw, r, 0, Math.PI / 2, -Math.PI / 2, true)
  else ctx.ellipse(x, y, tw, r, 0, Math.PI / 2, Math.PI * 1.5, false)
  ctx.closePath()
  ctx.shadowColor = rgba('#fef9c3', 0.9)
  ctx.shadowBlur = r * 0.6
  ctx.fillStyle = '#fef9c3'
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.clip()
  ctx.fillStyle = rgba('#cbd5e1', 0.45)
  for (const [cx, cy, cr] of [[0.3, -0.3, 0.14], [0.4, 0.3, 0.1], [-0.25, 0.35, 0.12], [-0.35, -0.2, 0.09]] as const) {
    circle(ctx, x + cx * r, y + cy * r, cr * r)
    ctx.fill()
  }
  ctx.restore()
}

function moonSighting(cheering: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const phase = f % MOON_PHASES
    const p = Math.floor(f / MOON_PHASES) / Math.max(1, frames / MOON_PHASES)
    const g = 252
    moon(ctx, 210, 50, 30, phase)
    for (let k = 0; k < 4; k++) dot(ctx, 30 + k * 50, 30 + (k % 2) * 30, 1.8, rgba('#f8fafc', 0.6))
    // The telescope on its tripod.
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(150, g - 80)
    ctx.lineTo(136, g)
    ctx.moveTo(150, g - 80)
    ctx.lineTo(164, g)
    ctx.moveTo(150, g - 80)
    ctx.lineTo(150, g)
    ctx.stroke()
    ctx.save()
    ctx.translate(150, g - 84)
    ctx.rotate(-0.75)
    ctx.fillStyle = '#e2e8f0'
    rr(ctx, -16, -6, 56, 12, 4)
    ctx.fillStyle = color2
    rr(ctx, 30, -8, 14, 16, 3)
    ctx.restore()
    // The family: a mother in her headscarf, a father and their son.
    const mum: Dress = { skin: TAN, hair: color, shirt: color, pants: color }
    const dad: Dress = { skin: TAN, hair: '#1c1917', shirt: '#e2e8f0', pants: '#94a3b8' }
    const boy: Dress = { skin: TAN, hair: '#1c1917', shirt: color2, pants: '#cbd5e1' }
    const jump = cheering ? Math.abs(Math.sin(p * TAU * 2)) * 10 : 0
    person(ctx, 46, g, 0.9, 1, mum, { skirt: true, bald: true }, () => {
      hijab(ctx, 2, -118, 1, color, mum.skin, { open: cheering ? 0.7 : 0 })
      if (cheering) {
        arm(ctx, [10, -98, 30, -124, 40, -148], 8, color)
        arm(ctx, [-10, -98, -22, -122, -26, -146], 8, color)
      } else {
        arm(ctx, [10, -98, 32, -116, 52, -134], 8, color)
        arm(ctx, [-10, -98, -14, -76, -10, -60], 8, color)
      }
    })
    person(ctx, 92, g, 1, 1, dad, { open: cheering ? 0.6 : 0 }, () => {
      dot(ctx, 2, -98 - 4, 0, '#000')
      ctx.fillStyle = '#1c1917'
      ctx.beginPath()
      ctx.moveTo(-6, -110)
      ctx.quadraticCurveTo(8, -96, 18, -110)
      ctx.lineTo(16, -104)
      ctx.quadraticCurveTo(6, -94, -4, -104)
      ctx.fill()
      if (cheering) {
        arm(ctx, [10, -98, 26, -122, 30, -146], 9, '#e2e8f0')
        arm(ctx, [-10, -98, -24, -122, -28, -146], 9, '#e2e8f0')
      } else {
        // Hand on his son's shoulder, the other pointing up at the moon.
        arm(ctx, [10, -98, 40, -118, 70, -140], 9, '#e2e8f0')
        arm(ctx, [-10, -98, -4, -80, 8, -64], 9, '#cbd5e1')
      }
    })
    person(ctx, 124, g - jump, 0.72, 1, boy, { open: cheering ? 0.8 : 0 }, () => {
      ctx.fillStyle = '#f8fafc'
      ctx.beginPath()
      ctx.arc(2, -124, 15, Math.PI, TAU)
      ctx.fill()
      if (cheering) {
        arm(ctx, [10, -98, 24, -122, 26, -146], 8, color2)
        arm(ctx, [-10, -98, -22, -122, -26, -146], 8, color2)
      } else {
        // Looking through the eyepiece.
        arm(ctx, [10, -98, 22, -108, 30, -114], 8, color2)
        arm(ctx, [-10, -98, -14, -78, -10, -62], 8, color2)
      }
    })
  }
}

// -- iftar ----------------------------------------------------------------------------------------------------

function iftar(breaking: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 222
    const top = g - 66
    const grandpa: Dress = { skin: BROWN, hair: '#e5e7eb', shirt: '#f8fafc', pants: '#cbd5e1' }
    const mum: Dress = { skin: BROWN, hair: color, shirt: color, pants: color }
    const girl: Dress = { skin: BROWN, hair: '#1c1917', shirt: color2, pants: '#e2e8f0' }
    seated(ctx, 50, g, 50, 0.85, 1, grandpa, breaking ? 0.4 : 0)
    // A white kufi cap.
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.arc(50 + 1.7, g - 50 - 62 * 0.85 - 4, 13, Math.PI, TAU)
    ctx.fill()
    seated(ctx, 250, g, 50, 0.82, -1, mum)
    hijab(ctx, 250 - 1.6, g - 50 - 62 * 0.82, -1, color, mum.skin, { open: breaking ? 0.5 : 0 })
    seated(ctx, 150, g, 58, 0.8, 1, girl, breaking ? 0.6 : 0)
    // Each raising a date, or waiting with hands folded.
    const lift = breaking ? Math.min(1, p / 0.3) * 20 : 0
    for (const [ax, dir, sh] of [[62, 1, grandpa.shirt], [238, -1, mum.shirt], [160, 1, girl.shirt]] as const) {
      if (breaking) {
        arm(ctx, [ax, g - 92, ax + dir * 14, g - 96 - lift * 0.5, ax + dir * 10, g - 112 - lift], 7, sh)
        ctx.fillStyle = '#7c2d12'
        ellipse(ctx, ax + dir * 10, g - 116 - lift, 3.5, 6)
        ctx.fill()
      } else {
        arm(ctx, [ax, g - 92, ax + dir * 14, g - 80, ax + dir * 22, top - 4], 7, sh)
      }
    }
    table(ctx, 70, 230, top, g, '#f8fafc')
    ctx.fillStyle = color2
    ctx.fillRect(70, top + 10, 160, 4)
    // A bowl of dates, glasses of water, soup and a lantern lit.
    ctx.fillStyle = '#e2e8f0'
    ellipse(ctx, 150, top - 4, 22, 7)
    ctx.fill()
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = '#92400e'
      ellipse(ctx, 138 + k * 6, top - 8 - (k % 2) * 3, 4, 6, 0.3)
      ctx.fill()
    }
    for (const gx of [100, 186]) {
      ctx.fillStyle = rgba('#e0f2fe', 0.8)
      rr(ctx, gx - 5, top - 18, 10, 18, 2)
      ctx.fillStyle = rgba('#7dd3fc', 0.6)
      ctx.fillRect(gx - 4, top - 12, 8, 11)
    }
    ctx.fillStyle = '#fde68a'
    rr(ctx, 208, top - 22, 10, 22, 3)
    ctx.fillStyle = rgba('#fbbf24', 0.5 + 0.3 * Math.sin(p * TAU * 3))
    circle(ctx, 213, top - 12, 8)
    ctx.fill()
    ctx.fillStyle = '#b45309'
    ctx.beginPath()
    ctx.moveTo(206, top - 22)
    ctx.lineTo(213, top - 32)
    ctx.lineTo(220, top - 22)
    ctx.fill()
    // The crescent moon rising in the window as the sun goes down.
    ctx.fillStyle = '#fef9c3'
    ctx.beginPath()
    ctx.arc(150, 34, 16, Math.PI * 0.3, Math.PI * 1.7)
    ctx.arc(157, 32, 13, Math.PI * 1.6, Math.PI * 0.4, true)
    ctx.fill()
  }
}

// -- Eid gifts -----------------------------------------------------------------------------------------------

function eidGifts(opening: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 242
    // Grandma in her headscarf, handing out envelopes.
    const nana: Dress = { skin: OLIVE, hair: color, shirt: color, pants: color }
    standing(ctx, 64, g, 1, nana, { skirt: true, bald: true })
    hijab(ctx, 66, g - 118, 1, color, nana.skin, { open: opening ? 0.5 : 0 })
    const env = (ex: number, ey: number, a: number, open: number) => {
      ctx.save()
      ctx.translate(ex, ey)
      ctx.rotate(a)
      ctx.fillStyle = '#f8fafc'
      rr(ctx, -12, -8, 24, 16, 2)
      ctx.fillStyle = color2
      ctx.beginPath()
      ctx.moveTo(-12, -8)
      ctx.lineTo(0, -8 - open * 10 + (1 - open) * 8)
      ctx.lineTo(12, -8)
      ctx.fill()
      dot(ctx, 0, -2, 2.5, '#fbbf24')
      if (open > 0.5) {
        ctx.fillStyle = '#86efac'
        rr(ctx, -9, -18, 18, 10, 1)
      }
      ctx.restore()
    }
    const kids: Array<[number, Dress, number]> = [
      [150, { skin: OLIVE, hair: '#1c1917', shirt: '#38bdf8', pants: '#e2e8f0' }, 0.78],
      [200, { skin: OLIVE, hair: '#3f2a1c', shirt: '#f472b6', pants: '#e2e8f0' }, 0.68],
    ]
    if (!opening) {
      arm(ctx, [74, g - 98, 96, g - 100, 116, g - 104], 9, color)
      env(120, g - 106, 0.1, 0)
      env(108, g - 112, -0.2, 0)
      arm(ctx, [54, g - 98, 48, g - 78, 52, g - 62], 9, shade(color, -0.1))
      kids.forEach(([kx, d, s], j) => person(ctx, kx, g, s, -1, d, { blink: Math.sin(p * TAU + j * 2) > 0.9 }, () => {
        // Reaching out shyly.
        arm(ctx, [-10, -98, -26, -94, -40, -98 + Math.sin(p * TAU + j) * 3], 8, d.shirt)
        arm(ctx, [10, -98, 14, -76, 10, -60], 8, d.shirt)
      }))
      return
    }
    arm(ctx, [74, g - 98, 90, g - 116, 96, g - 136], 9, color)
    arm(ctx, [54, g - 98, 48, g - 78, 52, g - 62], 9, shade(color, -0.1))
    kids.forEach(([kx, d, s], j) => {
      const jump = Math.abs(Math.sin(p * TAU * 2 + j)) * 16
      person(ctx, kx, g - jump, s, -1, d, { open: 0.8 }, () => {
        arm(ctx, [-10, -98, -24, -122, -28, -146], 8, d.shirt)
        arm(ctx, [10, -98, 24, -122, 26, -146], 8, d.shirt)
        env(-28, -158, -0.3, Math.min(1, p / 0.3))
      })
    })
    for (let k = 0; k < 8; k++) {
      const q = (p + k / 8) % 1
      dot(ctx, 120 + ((k * 29) % 110), 20 + q * 140, 2.5, k % 2 ? '#fde68a' : color2)
    }
  }
}

// -- a child with a lit fanous --------------------------------------------------------------------------

function fanousKid(waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 222
    const x = 70
    const d: Dress = { skin: TAN, hair: '#1c1917', shirt: color2, pants: '#e2e8f0', shoes: '#f8fafc' }
    ctx.translate(0, -Math.abs(Math.cos(p)) * 2)
    standing(ctx, x, g, 1, d, { stride: Math.sin(p) * 0.7, open: waving ? 0.6 : 0 })
    arm(ctx, [x - 10, g - 98, x - 4, g - 80, x + 2, g - 66], 8, shade(d.shirt, -0.12))
    // The lantern swinging from a raised hand, glowing.
    const sw = Math.sin(p) * 0.3
    const [hx, hy] = arm(ctx, [x + 10, g - 98, x + 26, g - 114, x + 34, g - 132], 8, d.shirt)
    dot(ctx, hx, hy, 5, d.skin)
    ctx.save()
    ctx.translate(hx, hy)
    ctx.rotate(sw)
    ctx.strokeStyle = '#d97706'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, 14)
    ctx.stroke()
    const glow = ctx.createRadialGradient(0, 34, 2, 0, 34, waving ? 40 : 28)
    glow.addColorStop(0, rgba('#fde68a', 0.7))
    glow.addColorStop(1, rgba('#fde68a', 0))
    ctx.fillStyle = glow
    circle(ctx, 0, 34, waving ? 40 : 28)
    ctx.fill()
    ctx.fillStyle = '#fbbf24'
    ctx.beginPath()
    ctx.moveTo(-10, 14)
    ctx.lineTo(10, 14)
    ctx.lineTo(0, 6)
    ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(-10, 16)
    ctx.lineTo(10, 16)
    ctx.lineTo(13, 42)
    ctx.lineTo(0, 54)
    ctx.lineTo(-13, 42)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = rgba('#fef9c3', 0.85)
    rr(ctx, -6, 20, 12, 20, 2)
    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, 16)
    ctx.lineTo(0, 54)
    ctx.stroke()
    ctx.restore()
  }
}

const BUBBLE = { id: 'bubble', frames: 1, w: 360, h: 140 }

export const FAITH_ROWS: Record<string, SpriteRow[]> = {
  'seder-table': [
    { id: 'main', frames: 6, w: 300, h: 230, paint: sederTable(false) },
    { id: 'act', frames: 8, w: 300, h: 230, paint: sederTable(true) },
    { ...BUBBLE, paint: saying('Why is this night different?') },
    SPARKLE,
  ],
  'afikomen-hunt': [
    { id: 'main', frames: 8, w: 250, h: 220, paint: afikomenHunt(false) },
    { id: 'act', frames: 8, w: 250, h: 220, paint: afikomenHunt(true) },
    { ...BUBBLE, paint: saying('Found it!') },
    SPARKLE,
  ],
  'elijahs-door': [
    { id: 'main', frames: 7, w: 230, h: 270, paint: elijahsDoor },
    SPARKLE,
  ],
  'sea-parting': [
    { id: 'main', frames: 8, w: 300, h: 220, paint: seaParting },
    SPARKLE,
  ],
  'shofar-blower': [
    { id: 'main', frames: 4, w: 220, h: 270, paint: shofarBlower(false) },
    { id: 'act', frames: 8, w: 220, h: 270, paint: shofarBlower(true) },
    { ...BUBBLE, paint: saying('Shanah Tovah!') },
    SPARKLE,
  ],
  'apples-and-honey': [
    { id: 'main', frames: 8, w: 230, h: 230, paint: applesHoney(false) },
    { id: 'act', frames: 8, w: 230, h: 230, paint: applesHoney(true) },
    { ...BUBBLE, paint: saying('A sweet new year!') },
    SPARKLE,
  ],
  tashlich: [
    { id: 'main', frames: 8, w: 280, h: 220, paint: tashlich(false) },
    { id: 'act', frames: 10, w: 280, h: 220, paint: tashlich(true) },
    SPARKLE,
  ],
  sukkah: [
    { id: 'main', frames: 6, w: 260, h: 270, paint: sukkah(false) },
    { id: 'act', frames: 12, w: 260, h: 270, paint: sukkah(true) },
    { ...BUBBLE, paint: saying('Chag Sameach!') },
    SPARKLE,
  ],
  'moon-sighting': [
    { id: 'main', frames: MOON_PHASES * 2, w: 260, h: 260, paint: moonSighting(false) },
    { id: 'act', frames: MOON_PHASES * 4, w: 260, h: 260, paint: moonSighting(true) },
    { ...BUBBLE, paint: saying('Look at the moon!') },
    { id: 'ramadan', frames: 1, w: 360, h: 140, paint: saying('Ramadan Mubarak!') },
    { id: 'eid', frames: 1, w: 360, h: 140, paint: saying('Eid Mubarak!') },
    SPARKLE,
  ],
  iftar: [
    { id: 'main', frames: 6, w: 300, h: 230, paint: iftar(false) },
    { id: 'act', frames: 8, w: 300, h: 230, paint: iftar(true) },
    { ...BUBBLE, paint: saying('Ramadan Mubarak!') },
    SPARKLE,
  ],
  'eid-gifts': [
    { id: 'main', frames: 6, w: 240, h: 250, paint: eidGifts(false) },
    { id: 'act', frames: 8, w: 240, h: 250, paint: eidGifts(true) },
    { ...BUBBLE, paint: saying('Eid Mubarak!') },
    SPARKLE,
  ],
  'fanous-kid': [
    { id: 'main', frames: 8, w: 160, h: 230, paint: fanousKid(false) },
    { id: 'wave', frames: 8, w: 160, h: 230, paint: fanousKid(true) },
    SPARKLE,
  ],
}
