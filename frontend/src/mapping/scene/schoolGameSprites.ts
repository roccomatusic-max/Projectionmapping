/**
 * Back to school, game day and April Fools': a crossing guard holding up her stop sign, a child with a huge
 * backpack, a teacher writing today's day on the board, a spelling bee, a science fair volcano, a referee calling
 * a touchdown, cheerleaders, fans doing the wave, a field goal, the team mascot, a can of "nuts" full of spring
 * snakes and a clown's squirting flower.
 *
 * Painted the same way as sprites.ts: facing right, one frame at a time, into a cell of w by h design units.
 */

import { arm, dot, hair, head, person, rr, standing, type Dress } from './figures'
import {
  circle, ellipse, rgba, saying, shade, SPARKLE, TAU,
  type Ctx, type SpriteColors, type SpriteRow,
} from './sprites'

const PEACH = '#f5c9a0'
const TAN = '#c68a5a'
const BROWN = '#8d5a3b'

function octagon(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath()
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + (k * Math.PI) / 4
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  ctx.closePath()
}

// -- a crossing guard ------------------------------------------------------------------------------------------

function crossingGuard(stopping: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 262
    // The crosswalk stripes.
    ctx.fillStyle = rgba('#f8fafc', 0.75)
    for (let k = 0; k < 6; k++) {
      ctx.beginPath()
      ctx.moveTo(110 + k * 30, g - 2)
      ctx.lineTo(128 + k * 30, g - 2)
      ctx.lineTo(132 + k * 30, g + 2)
      ctx.lineTo(114 + k * 30, g + 2)
      ctx.fill()
    }
    if (stopping) {
      // Two children crossing behind her, holding hands.
      const u = (p * 1.2) % 1
      const kids: Dress[] = [
        { skin: PEACH, hair: '#ca8a04', shirt: '#f472b6', pants: '#e2e8f0' },
        { skin: BROWN, hair: '#1c1917', shirt: '#38bdf8', pants: '#cbd5e1' },
      ]
      kids.forEach((d, j) => {
        const kx = 290 - u * 200 + j * 26
        person(ctx, kx, g - 4, 0.6, -1, d, { stride: Math.sin(p * TAU * 6 + j) * 0.7 }, () => {
          arm(ctx, [-10, -98, -14, -76, -12, -60], 8, d.shirt)
          arm(ctx, [10, -98, 22, -78, j ? -26 : 34, -66], 8, d.shirt)
          ctx.fillStyle = j ? '#a3e635' : '#facc15'
          rr(ctx, 4, -104, 22, 34, 6)
        })
      })
    }
    // The guard in her bright vest.
    const x = 84
    const d: Dress = { skin: TAN, hair: '#7c2d12', shirt: '#e2e8f0', pants: '#94a3b8', shoes: '#475569' }
    standing(ctx, x, g, 1, d, { open: stopping ? 0.4 : 0 })
    ctx.fillStyle = color
    rr(ctx, x - 15, g - 106, 30, 48, 8)
    ctx.fillStyle = color2
    ctx.fillRect(x - 15, g - 84, 30, 5)
    ctx.fillRect(x - 6, g - 106, 4, 48)
    ctx.fillRect(x + 4, g - 106, 4, 48)
    ctx.fillStyle = color
    rr(ctx, x - 16, g - 140, 36, 10, 4)
    rr(ctx, x + 10, g - 134, 16, 5, 2)
    // The stop sign on its pole: down at her side, or held up high with the other hand out.
    const sign = (sx: number, sy: number) => {
      ctx.fillStyle = '#cbd5e1'
      ctx.fillRect(sx - 2, sy, 4, 70)
      ctx.fillStyle = '#f8fafc'
      octagon(ctx, sx, sy, 27)
      ctx.fill()
      ctx.fillStyle = '#ef4444'
      octagon(ctx, sx, sy, 24)
      ctx.fill()
      ctx.fillStyle = '#f8fafc'
      ctx.font = 'bold 15px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('STOP', sx, sy + 1)
    }
    if (stopping) {
      sign(x + 40, g - 186)
      arm(ctx, [x + 10, g - 98, x + 26, g - 120, x + 38, g - 138], 9, '#e2e8f0')
      dot(ctx, x + 38, g - 138, 5, d.skin)
      arm(ctx, [x - 10, g - 98, x - 32, g - 104, x - 54, g - 108], 9, '#e2e8f0')
      ctx.fillStyle = d.skin
      rr(ctx, x - 62, g - 118, 9, 16, 4)
    } else {
      sign(x + 34, g - 120)
      arm(ctx, [x + 10, g - 98, x + 22, g - 80, x + 32, g - 74], 9, '#e2e8f0')
      dot(ctx, x + 32, g - 74, 5, d.skin)
      const w = Math.sin(p * TAU * 2) * 8
      arm(ctx, [x - 10, g - 98, x - 26, g - 118, x - 30 + w, g - 140], 9, '#e2e8f0')
      dot(ctx, x - 30 + w, g - 142, 5, d.skin)
    }
  }
}

// -- a child with a huge backpack -----------------------------------------------------------------------------

function backpackKid(waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 212
    const x = 78
    const d: Dress = { skin: PEACH, hair: '#78350f', shirt: '#38bdf8', pants: '#cbd5e1', shoes: '#f8fafc' }
    ctx.translate(0, -Math.abs(Math.cos(p)) * 2)
    // The backpack, nearly as big as she is.
    ctx.fillStyle = color
    rr(ctx, x - 40, g - 112, 34, 62, 12)
    ctx.fillStyle = shade(color, -0.15)
    rr(ctx, x - 40, g - 76, 34, 22, 8)
    ctx.fillStyle = color2
    rr(ctx, x - 34, g - 104, 20, 6, 3)
    standing(ctx, x, g, 1, d, { stride: Math.sin(p) * 0.7, open: waving ? 0.7 : 0 })
    // Ponytail bouncing.
    ctx.fillStyle = d.hair
    ellipse(ctx, x - 14, g - 120 + Math.sin(p * 2) * 2, 6, 12, 0.5 + Math.sin(p) * 0.2)
    ctx.fill()
    arm(ctx, [x - 8, g - 104, x - 6, g - 80], 4, color2)
    if (waving) {
      const w = Math.sin(p * 3) * 10
      arm(ctx, [x + 10, g - 98, x + 24, g - 120, x + 28 + w, g - 142], 8, d.shirt)
      dot(ctx, x + 28 + w, g - 144, 5, d.skin)
    } else {
      // Swinging a lunchbox.
      const sw = Math.sin(p) * 0.5
      const [hx, hy] = arm(ctx, [x + 10, g - 98, x + 14 + sw * 10, g - 78, x + 16 + sw * 22, g - 60], 8, d.shirt)
      dot(ctx, hx, hy, 5, d.skin)
      ctx.fillStyle = color2
      rr(ctx, hx - 10, hy + 2, 22, 16, 3)
      ctx.strokeStyle = shade(color2, -0.2)
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(hx + 1, hy + 2, 5, Math.PI, TAU)
      ctx.stroke()
    }
    arm(ctx, [x - 10, g - 98, x - 4, g - 80, x + 2, g - 66], 8, shade(d.shirt, -0.12))
  }
}

// -- a teacher writing today's day on the board ------------------------------------------------------------

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const BOARD_POSES = 4
export const BOARD_HELLO = 6

function teacherBoard(hello: boolean) {
  return (ctx: Ctx, f: number, _frames: number, { color, color2 }: SpriteColors) => {
    const poses = hello ? BOARD_HELLO : BOARD_POSES
    const day = WEEKDAYS[Math.floor(f / poses) % 7]
    const p = (f % poses) / poses
    const g = 252
    // The whiteboard (pale so it shows) with today's day written up in marker.
    ctx.fillStyle = '#cbd5e1'
    rr(ctx, 84, g - 214, 188, 128, 6)
    ctx.fillStyle = '#f8fafc'
    rr(ctx, 90, g - 208, 176, 116, 4)
    ctx.fillStyle = '#94a3b8'
    rr(ctx, 96, g - 90, 164, 6, 2)
    ctx.fillStyle = color2
    rr(ctx, 120, g - 94, 18, 5, 2)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = color
    ctx.font = 'bold 22px "Comic Sans MS", "Chalkboard SE", "Marker Felt", sans-serif'
    ctx.fillText('Happy', 178, g - 182)
    let size = 34
    do {
      ctx.font = `bold ${size}px "Comic Sans MS", "Chalkboard SE", "Marker Felt", sans-serif`
      size -= 2
    } while (ctx.measureText(`${day}!`).width > 160)
    ctx.fillText(`${day}!`, 178, g - 148)
    // A smiley and an apple drawn underneath.
    ctx.strokeStyle = color2
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(150, g - 112, 9, 0, TAU)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(150, g - 111, 5, 0.3, Math.PI - 0.3)
    ctx.stroke()
    dot(ctx, 147, g - 115, 1.3, color2)
    dot(ctx, 153, g - 115, 1.3, color2)
    ctx.strokeStyle = '#ef4444'
    ctx.beginPath()
    ctx.arc(206, g - 110, 8, 0, TAU)
    ctx.stroke()
    arm(ctx, [206, g - 118, 208, g - 124], 2, '#16a34a')
    // The teacher's desk with a real apple on it.
    ctx.fillStyle = '#e7d3b0'
    rr(ctx, 166, g - 58, 96, 10, 3)
    ctx.fillStyle = '#d6c29a'
    ctx.fillRect(172, g - 48, 8, 48)
    ctx.fillRect(248, g - 48, 8, 48)
    dot(ctx, 236, g - 66, 8, '#ef4444')
    arm(ctx, [236, g - 74, 238, g - 80], 2.5, '#16a34a')
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = ['#38bdf8', '#facc15', '#a3e635'][k]
      rr(ctx, 184 + k * 12, g - 78 - (k % 2) * 4, 10, 20 + (k % 2) * 4, 2)
    }
    // The teacher: writing on the board, or turned round to greet the class.
    const x = 66
    const d: Dress = { skin: BROWN, hair: '#1c1917', shirt: '#f9a8d4', pants: '#94a3b8' }
    if (!hello) {
      standing(ctx, x, g, 1, d, { skirt: true })
      ctx.fillStyle = d.hair
      dot(ctx, x - 12, g - 128, 9, d.hair)
      // Drawing the smiley under the words.
      const w = Math.sin(p * TAU) * 6
      const [hx, hy] = arm(ctx, [x + 10, g - 98, x + 30, g - 112, x + 50 + w, g - 118 + Math.cos(p * TAU) * 4], 8, '#f9a8d4')
      dot(ctx, hx, hy, 5, d.skin)
      ctx.fillStyle = color
      rr(ctx, hx + 2, hy - 8, 5, 12, 2)
      arm(ctx, [x - 10, g - 98, x - 16, g - 78, x - 12, g - 62], 8, shade('#f9a8d4', -0.1))
    } else {
      standing(ctx, x, g, -1, d, { skirt: true, open: 0.6 })
      dot(ctx, x + 12, g - 128, 9, d.hair)
      const w = Math.sin(p * TAU * 2) * 10
      arm(ctx, [x - 10, g - 98, x - 24, g - 118, x - 28 + w, g - 140], 8, '#f9a8d4')
      dot(ctx, x - 28 + w, g - 142, 5, d.skin)
      // Pointing back at the board with the marker.
      arm(ctx, [x + 10, g - 98, x + 26, g - 114, x + 40, g - 128], 8, shade('#f9a8d4', -0.1))
      dot(ctx, x + 40, g - 128, 5, d.skin)
      ctx.fillStyle = color
      rr(ctx, x + 40, g - 136, 5, 12, 2)
    }
  }
}

// -- a spelling bee ---------------------------------------------------------------------------------------------

function spellingBee(spelling: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 252
    // The judges' table with its bell.
    ctx.fillStyle = '#e2e8f0'
    rr(ctx, 160, g - 64, 80, 8, 3)
    ctx.fillStyle = '#cbd5e1'
    ctx.fillRect(166, g - 56, 6, 56)
    ctx.fillRect(228, g - 56, 6, 56)
    const ding = spelling && p > 0.75
    ctx.fillStyle = '#facc15'
    ctx.beginPath()
    ctx.arc(210, g - 64, 12, Math.PI, TAU)
    ctx.fill()
    dot(ctx, 210, g - 78, 3, '#fde68a')
    if (ding) {
      ctx.strokeStyle = rgba('#fde68a', 0.9)
      ctx.lineWidth = 2.5
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k - 1) * 0.6
        ctx.beginPath()
        ctx.moveTo(210 + Math.cos(a) * 18, g - 72 + Math.sin(a) * 18)
        ctx.lineTo(210 + Math.cos(a) * 28, g - 72 + Math.sin(a) * 28)
        ctx.stroke()
      }
    }
    // The microphone on its stand.
    ctx.fillStyle = '#94a3b8'
    ctx.fillRect(122, g - 120, 3, 120)
    rr(ctx, 110, g - 4, 28, 4, 2)
    dot(ctx, 123, g - 124, 5, '#cbd5e1')
    // The speller with a number card pinned on.
    const x = 86
    const d: Dress = { skin: TAN, hair: '#1c1917', shirt: color2, pants: '#cbd5e1' }
    const jump = ding ? Math.abs(Math.sin(p * TAU * 4)) * 12 : 0
    standing(ctx, x, g - jump, 1, d, { open: spelling && !ding ? 0.4 * Math.abs(Math.sin(p * TAU * 6)) : ding ? 0.9 : 0 })
    ctx.fillStyle = '#f8fafc'
    rr(ctx, x - 9, g - 96 - jump, 18, 14, 2)
    ctx.fillStyle = color
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('12', x, g - 89 - jump)
    if (ding) {
      arm(ctx, [x - 10, g - 98 - jump, x - 24, g - 122 - jump, x - 26, g - 146 - jump], 8, color2)
      arm(ctx, [x + 10, g - 98 - jump, x + 24, g - 122 - jump, x + 26, g - 146 - jump], 8, color2)
    } else if (spelling) {
      arm(ctx, [x - 10, g - 98, x - 14, g - 76, x - 10, g - 62], 8, color2)
      arm(ctx, [x + 10, g - 98, x + 14, g - 76, x + 10, g - 62], 8, color2)
    } else {
      // Thinking hard: a hand on the chin.
      arm(ctx, [x + 10, g - 98, x + 22, g - 92, x + 16, g - 108], 8, color2)
      dot(ctx, x + 16, g - 108, 5, d.skin)
      arm(ctx, [x - 10, g - 98, x - 14, g - 76, x - 10, g - 62], 8, color2)
      ctx.fillStyle = rgba('#f8fafc', 0.6 + 0.4 * Math.sin(p * TAU))
      ctx.font = 'bold 28px sans-serif'
      ctx.fillText('?', x + 30, g - 156 - Math.sin(p * TAU) * 4)
    }
    // The letters coming out one at a time: B, E, E.
    if (spelling) {
      const letters = ['B', 'E', 'E']
      const shown = Math.min(3, Math.floor(p / 0.22) + 1)
      ctx.font = 'bold 34px "Countdown Display", "Playfair Display", Georgia, serif'
      for (let k = 0; k < shown; k++) {
        const lx = 40 + k * 44
        const ly = 40 + Math.sin(p * TAU * 2 + k) * 3
        ctx.fillStyle = '#f8fafc'
        circle(ctx, lx, ly, 20)
        ctx.fill()
        ctx.fillStyle = color
        ctx.fillText(letters[k], lx, ly + 2)
      }
    }
  }
}

// -- a science fair volcano -----------------------------------------------------------------------------------

function scienceVolcano(erupting: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 252
    // The table and its trifold poster.
    ctx.fillStyle = '#e2e8f0'
    rr(ctx, 100, g - 72, 140, 8, 3)
    ctx.fillStyle = '#cbd5e1'
    ctx.fillRect(108, g - 64, 6, 64)
    ctx.fillRect(226, g - 64, 6, 64)
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(196, g - 156, 44, 84)
    ctx.fillStyle = '#e2e8f0'
    ctx.fillRect(180, g - 150, 16, 78)
    ctx.fillStyle = color2
    rr(ctx, 202, g - 148, 32, 8, 2)
    for (let k = 0; k < 3; k++) rr(ctx, 202, g - 132 + k * 14, 30 - k * 6, 4, 2)
    // The volcano.
    const vx = 150
    const top = g - 140
    ctx.fillStyle = '#d6a46a'
    ctx.beginPath()
    ctx.moveTo(vx - 48, g - 72)
    ctx.lineTo(vx - 10, top)
    ctx.lineTo(vx + 10, top)
    ctx.lineTo(vx + 48, g - 72)
    ctx.fill()
    ctx.fillStyle = '#b8895a'
    ctx.beginPath()
    ctx.moveTo(vx + 4, top)
    ctx.lineTo(vx + 10, top)
    ctx.lineTo(vx + 48, g - 72)
    ctx.lineTo(vx + 20, g - 72)
    ctx.fill()
    const flow = erupting ? Math.min(1, p / 0.4) : 0
    if (flow > 0) {
      // The foam shooting up and running down the sides.
      ctx.fillStyle = color
      for (let k = 0; k < 9; k++) {
        const q = (p * 2 + k / 9) % 1
        const sx = vx + Math.sin(k * 2.3) * 30 * q
        const sy = top - 10 - Math.sin(q * Math.PI) * 70 * flow
        circle(ctx, sx, sy, 7 - q * 3)
        ctx.fill()
      }
      ctx.beginPath()
      ctx.moveTo(vx - 12, top)
      ctx.quadraticCurveTo(vx - 30, top + 30 * flow, vx - 24 - flow * 20, top + 60 * flow)
      ctx.lineTo(vx - 14, top + 50 * flow)
      ctx.quadraticCurveTo(vx - 4, top + 20, vx, top + 12)
      ctx.quadraticCurveTo(vx + 8, top + 30 * flow, vx + 22 + flow * 6, top + 64 * flow)
      ctx.lineTo(vx + 30 + flow * 6, top + 52 * flow)
      ctx.quadraticCurveTo(vx + 20, top + 10, vx + 12, top)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = shade(color, 0.3)
      ellipse(ctx, vx, top - 4, 16, 8)
      ctx.fill()
    } else {
      // A little wisp of steam.
      ctx.fillStyle = rgba('#f8fafc', 0.5)
      circle(ctx, vx + Math.sin(p * TAU) * 4, top - 12 - p * 10, 5)
      ctx.fill()
    }
    // The young scientist in goggles and a lab coat.
    const x = 62
    const d: Dress = { skin: PEACH, hair: '#ca8a04', shirt: '#f8fafc', pants: '#94a3b8' }
    const back = erupting ? Math.min(1, p / 0.3) * 10 : 0
    standing(ctx, x - back, g, 1, d, { open: erupting ? 0.9 : 0 })
    ctx.strokeStyle = color2
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x - back - 15, g - 122)
    ctx.lineTo(x - back + 20, g - 122)
    ctx.stroke()
    ctx.fillStyle = rgba('#bae6fd', 0.8)
    rr(ctx, x - back + 2, g - 128, 18, 10, 4)
    if (erupting) {
      arm(ctx, [x - back - 10, g - 98, x - back - 24, g - 122, x - back - 28, g - 146], 8, '#f8fafc')
      arm(ctx, [x - back + 10, g - 98, x - back + 24, g - 122, x - back + 28, g - 146], 8, '#f8fafc')
    } else {
      // Tipping a beaker of vinegar into the top.
      const tip = 0.3 + Math.sin(p * TAU) * 0.1
      const [hx, hy] = arm(ctx, [x + 10, g - 98, x + 40, g - 118, x + 66, g - 150], 8, '#f8fafc')
      ctx.save()
      ctx.translate(hx + 4, hy)
      ctx.rotate(tip)
      ctx.fillStyle = rgba('#e0f2fe', 0.8)
      rr(ctx, -8, -16, 16, 22, 3)
      ctx.fillStyle = rgba(color2, 0.8)
      ctx.fillRect(-7, -4, 14, 9)
      ctx.restore()
      dot(ctx, hx, hy, 5, d.skin)
      arm(ctx, [x - 10, g - 98, x - 14, g - 76, x - 10, g - 62], 8, '#e2e8f0')
    }
  }
}

// -- a referee --------------------------------------------------------------------------------------------------

function referee(touchdown: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 262
    const x = 92
    const d: Dress = { skin: PEACH, hair: '#78716c', shirt: '#f8fafc', pants: '#f8fafc', shoes: '#475569' }
    standing(ctx, x, g, 1, d, { open: touchdown ? 0.3 : 0 })
    // Stripes on the shirt (pale grey so the shirt still shows), a cap and a whistle.
    ctx.fillStyle = '#64748b'
    for (let k = 0; k < 4; k++) ctx.fillRect(x - 13 + k * 8, g - 106, 4, 50)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x + 2, g - 128, 16, Math.PI, TAU)
    ctx.fill()
    rr(ctx, x + 6, g - 132, 20, 5, 2)
    dot(ctx, x + 18, g - 110, 3, '#cbd5e1')
    // A yellow flag tucked in the belt.
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(x - 14, g - 60)
    ctx.lineTo(x - 26, g - 50)
    ctx.lineTo(x - 18, g - 40)
    ctx.fill()
    if (touchdown) {
      // Both arms straight up: touchdown!
      const pump = Math.abs(Math.sin(p * TAU * 2)) * 6
      arm(ctx, [x - 10, g - 98, x - 24, g - 124 - pump, x - 26, g - 162 - pump], 9, '#f1f5f9')
      arm(ctx, [x + 10, g - 98, x + 26, g - 124 - pump, x + 30, g - 162 - pump], 9, '#f1f5f9')
      dot(ctx, x - 26, g - 164 - pump, 5, d.skin)
      dot(ctx, x + 30, g - 164 - pump, 5, d.skin)
      ctx.strokeStyle = rgba('#f8fafc', 0.7)
      ctx.lineWidth = 2
      for (let k = 0; k < 2; k++) {
        ctx.beginPath()
        ctx.arc(x + 22, g - 110, 6 + k * 6 + ((p * 4) % 1) * 4, -0.6, 0.6)
        ctx.stroke()
      }
    } else {
      // Signalling a first down, pointing up the field again and again.
      const pt = Math.sin(p * TAU)
      arm(ctx, [x + 10, g - 98, x + 34, g - 102 - pt * 4, x + 58, g - 106 - pt * 6], 9, '#f1f5f9')
      dot(ctx, x + 58, g - 106 - pt * 6, 5, d.skin)
      arm(ctx, [x - 10, g - 98, x - 16, g - 78, x - 12, g - 62], 9, '#e2e8f0')
    }
  }
}

// -- cheerleaders -------------------------------------------------------------------------------------------------

function cheerleaders(jumping: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 252
    const skins = [PEACH, BROWN, TAN]
    const hairs = ['#ca8a04', '#1c1917', '#7c2d12']
    const pom = (px: number, py: number) => {
      ctx.fillStyle = color2
      for (let k = 0; k < 8; k++) {
        const a = (k * TAU) / 8 + p * 4
        circle(ctx, px + Math.cos(a) * 7, py + Math.sin(a) * 7, 7)
        ctx.fill()
      }
      dot(ctx, px, py, 7, shade(color2, 0.25))
    }
    for (let j = 0; j < 3; j++) {
      const x = 56 + j * 84
      const air = jumping ? Math.max(0, Math.sin(p * TAU)) * 40 : 0
      const y = g - air
      const d: Dress = { skin: skins[j], hair: hairs[j], shirt: color, pants: color, shoes: '#f8fafc' }
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(0.88, 0.88)
      if (air > 16) {
        // A toe-touch jump: legs kicked out to both sides.
        arm(ctx, [0, -50, -26, -56, -44, -66], 11, d.skin)
        arm(ctx, [0, -50, 26, -56, 44, -66], 11, d.skin)
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.moveTo(-14, -60)
        ctx.lineTo(14, -60)
        ctx.lineTo(22, -40)
        ctx.lineTo(-22, -40)
        ctx.fill()
        ctx.fillStyle = color
        rr(ctx, -15, -106, 30, 50, 10)
        head(ctx, 2, -118, 16, d.skin, 1, { open: 0.7 })
        hair(ctx, 2, -118, 1, d.hair)
      } else {
        standing(ctx, 0, 0, 1, d, { skirt: true, open: jumping ? 0.6 : 0 })
      }
      // A ponytail and the V on her top.
      ctx.fillStyle = d.hair
      ellipse(ctx, -14, -126, 5, 12, 0.6 + Math.sin(p * TAU * 2) * 0.3)
      ctx.fill()
      ctx.strokeStyle = color2
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(-10, -100)
      ctx.lineTo(0, -84)
      ctx.lineTo(10, -100)
      ctx.stroke()
      if (jumping) {
        arm(ctx, [-10, -98, -26, -126, -34, -150], 8, d.skin)
        arm(ctx, [10, -98, 26, -126, 34, -150], 8, d.skin)
        pom(-36, -154)
        pom(36, -154)
      } else {
        // Pom-poms up and down in turn.
        const s = Math.sin(p * TAU + j)
        arm(ctx, [-10, -98, -24, -110 - s * 10, -28, -126 - s * 20], 8, d.skin)
        arm(ctx, [10, -98, 22, -84 + s * 10, 24, -70 + s * 16], 8, d.skin)
        pom(-30, -130 - s * 20)
        pom(26, -66 + s * 16)
      }
      ctx.restore()
    }
  }
}

// -- fans doing the wave -------------------------------------------------------------------------------------

function stadiumWave(wave: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 192
    const skins = [PEACH, BROWN, TAN, PEACH, TAN, BROWN, PEACH, TAN]
    const hairs = ['#ca8a04', '#1c1917', '#7c2d12', '#1c1917', '#78350f', '#1c1917', '#d6d3d1', '#ca8a04']
    for (const [row, by] of [[0, g - 64], [1, g]] as const) {
      for (let j = 0; j < 7; j++) {
        const k = row * 7 + j
        const x = 26 + j * 44 + row * 12
        // When the wave reaches them they leap up, arms high; otherwise a little bounce and clapping.
        const reach = (p * 1.4 - j / 8) * 1
        const up = wave ? Math.max(0, Math.sin(Math.min(1, Math.max(0, reach)) * Math.PI)) : 0
        const bob = Math.abs(Math.sin(p * TAU * 2 + k)) * 2
        const y = by - 26 - up * 22 - bob
        const shirt = k % 2 ? color : color2
        ctx.fillStyle = shirt
        rr(ctx, x - 13, y - 30, 26, 40, 9)
        head(ctx, x + 1, y - 42, 12, skins[k % 8], 1, { open: up > 0.5 ? 0.8 : 0 })
        ctx.fillStyle = hairs[k % 8]
        ctx.beginPath()
        ctx.arc(x + 1, y - 44, 12.5, Math.PI * 1.05, Math.PI * 1.95)
        ctx.fill()
        if (up > 0.3) {
          arm(ctx, [x - 8, y - 26, x - 16, y - 46, x - 16, y - 66 * up], 6, shirt)
          arm(ctx, [x + 8, y - 26, x + 16, y - 46, x + 16, y - 66 * up], 6, shirt)
        } else {
          const clap = Math.abs(Math.sin(p * TAU * 3 + k)) * 4
          arm(ctx, [x - 8, y - 24, x - 10, y - 12, x - clap, y - 16], 6, shirt)
          arm(ctx, [x + 8, y - 24, x + 10, y - 12, x + clap, y - 16], 6, shirt)
        }
        if (k === 9) {
          // A foam finger.
          ctx.fillStyle = color2
          rr(ctx, x + 12, y - 70 - up * 10, 12, 30, 5)
          rr(ctx, x + 14, y - 92 - up * 10, 7, 24, 3)
        }
      }
      // The bleacher bench in front of each row.
      ctx.fillStyle = '#cbd5e1'
      rr(ctx, 4, by - 16, 312, 8, 3)
      ctx.fillStyle = '#94a3b8'
      for (let j = 0; j < 6; j++) ctx.fillRect(20 + j * 56, by - 8, 4, 8)
    }
  }
}

// -- a field goal ------------------------------------------------------------------------------------------------

function fieldGoal(kicking: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 252
    // The goalposts.
    ctx.fillStyle = '#facc15'
    ctx.fillRect(250, g - 120, 6, 120)
    ctx.fillRect(220, g - 124, 66, 6)
    ctx.fillRect(220, g - 230, 6, 110)
    ctx.fillRect(280, g - 230, 6, 110)
    const ball = (bx: number, by: number, a: number) => {
      ctx.save()
      ctx.translate(bx, by)
      ctx.rotate(a)
      ctx.fillStyle = '#b45309'
      ellipse(ctx, 0, 0, 11, 7)
      ctx.fill()
      ctx.strokeStyle = '#f8fafc'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(-4, 0)
      ctx.lineTo(4, 0)
      for (let k = -1; k <= 1; k++) {
        ctx.moveTo(k * 3, -2)
        ctx.lineTo(k * 3, 2)
      }
      ctx.stroke()
      ctx.restore()
    }
    // The holder, kneeling beside the ball and facing the kicker, a finger on top of it.
    const hx = 150
    const ballX = 118
    const hd: Dress = { skin: BROWN, hair: '#1c1917', shirt: color2, pants: '#e2e8f0' }
    const facingLeft = (draw: () => void) => {
      ctx.save()
      ctx.translate(hx * 2, 0)
      ctx.scale(-1, 1)
      draw()
      ctx.restore()
    }
    facingLeft(() => {
      arm(ctx, [hx, g - 40, hx - 20, g - 26, hx - 22, g - 4], 11, '#e2e8f0')
      arm(ctx, [hx, g - 40, hx + 10, g - 10, hx - 8, g - 6], 11, shade('#e2e8f0', -0.1))
      ctx.fillStyle = hd.shirt
      rr(ctx, hx - 14, g - 86, 28, 50, 10)
      ctx.fillStyle = '#f8fafc'
      circle(ctx, hx + 2, g - 98, 15)
      ctx.fill()
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(hx + 2, g - 100, 16, Math.PI * 0.9, Math.PI * 2.1)
      ctx.fill()
      arm(ctx, [hx + 8, g - 98, hx + 6, g - 94, hx + 16, g - 92], 3, '#94a3b8')
    })
    // The kicker, helmet on: a run up to the ball and a big swing of the leg.
    const kx = 44 + (kicking ? Math.min(1, p / 0.2) * 40 : 0)
    const kd: Dress = { skin: PEACH, hair: '#78350f', shirt: color, pants: '#e2e8f0', shoes: '#f8fafc' }
    const swing = kicking ? Math.min(1, p / 0.25) : 0
    const after = kicking && p > 0.25
    const legA = after ? -1.4 : -0.2 + swing * 0.2 + Math.sin(p * TAU) * 0.05
    if (!kicking) {
      standing(ctx, kx, g, 1, kd, { stride: Math.sin(p * TAU) * 0.1 })
    } else {
      // Standing leg, then the kicking leg flung up.
      arm(ctx, [kx, g - 50, kx - 2, g - 26, kx - 4, g - 6], 11, kd.pants!)
      ctx.fillStyle = '#f8fafc'
      rr(ctx, kx - 10, g - 8, 18, 8, 3)
      const kneeX = kx + Math.sin(-legA) * 24
      const kneeY = g - 50 + Math.cos(legA) * 24
      const footX = kneeX + Math.sin(-legA * 0.9) * 26
      const footY = kneeY + Math.cos(legA * 0.9) * 22
      arm(ctx, [kx + 4, g - 50, kneeX, kneeY, footX, footY], 11, shade(kd.pants!, -0.1))
      ctx.fillStyle = '#f8fafc'
      rr(ctx, footX - 4, footY - 4, 18, 8, 3)
      ctx.fillStyle = kd.pants!
      rr(ctx, kx - 14, g - 62, 28, 16, 5)
      ctx.fillStyle = kd.shirt
      rr(ctx, kx - 15, g - 106, 30, 52, 10)
    }
    ctx.fillStyle = '#f8fafc'
    circle(ctx, kx + 2, g - 118, 15)
    ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(kx + 2, g - 120, 17, Math.PI * 0.9, Math.PI * 2.1)
    ctx.fill()
    ctx.fillStyle = color2
    ctx.fillRect(kx - 1, g - 137, 5, 18)
    arm(ctx, [kx + 8, g - 118, kx + 12, g - 112, kx + 20, g - 112], 3, '#94a3b8')
    arm(ctx, [kx - 10, g - 98, kx - 26, g - 104, kx - 36, g - 116], 9, color)
    arm(ctx, [kx + 10, g - 98, kx + 24, g - 92, kx + 32, g - 82], 9, color)
    if (!kicking || p < 0.2) {
      ball(ballX, g - 12, -1.4)
      facingLeft(() => arm(ctx, [hx + 10, g - 80, hx + 22, g - 50, hx * 2 - ballX, g - 24], 8, hd.shirt))
      if (!kicking) return
    } else facingLeft(() => arm(ctx, [hx + 10, g - 80, hx + 22, g - 68, hx + 28, g - 60], 8, hd.shirt))
    // The ball sails up and through the uprights.
    const u = Math.min(1, Math.max(0, (p - 0.2) / 0.55))
    const bx = ballX + u * (253 - ballX)
    const by = g - 12 - Math.sin(u * Math.PI * 0.62) * 200 - u * 10
    ball(bx, by, u * TAU * 2)
    if (p > 0.75) {
      for (let k = 0; k < 6; k++) {
        const a = (k * TAU) / 6 + p * 2
        dot(ctx, 253 + Math.cos(a) * (18 + (p - 0.75) * 80), g - 190 + Math.sin(a) * (18 + (p - 0.75) * 80), 3, k % 2 ? color2 : '#f8fafc')
      }
    }
  }
}

// -- the team mascot --------------------------------------------------------------------------------------------

function teamMascot(hyped: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 262
    const fur = '#d6a46a'
    const jump = hyped ? Math.abs(Math.sin(p * TAU * 2)) * 30 : 0
    const sway = hyped ? 0 : Math.sin(p * TAU) * 10
    const x = 100 + sway
    const y = g - jump
    // Big furry feet and legs.
    for (const s of [-1, 1]) {
      arm(ctx, [x + s * 10, y - 60, x + s * 14, y - 30, x + s * 18, y - 10], 20, fur)
      ctx.fillStyle = shade(fur, -0.1)
      ellipse(ctx, x + s * 20, y - 6, 16, 8)
      ctx.fill()
    }
    // The jersey: team colours, stripes on the sleeves.
    ctx.fillStyle = color
    rr(ctx, x - 30, y - 140, 60, 88, 24)
    ctx.fillStyle = color2
    ctx.fillRect(x - 30, y - 70, 60, 8)
    ctx.fillStyle = '#f8fafc'
    circle(ctx, x, y - 104, 16)
    ctx.fill()
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(x - 8, y - 112)
    ctx.lineTo(x + 8, y - 112)
    ctx.lineTo(x, y - 94)
    ctx.fill()
    // The big bear head.
    const hy = y - 168
    dot(ctx, x - 26, hy - 24, 12, fur)
    dot(ctx, x + 26, hy - 24, 12, fur)
    dot(ctx, x - 26, hy - 24, 6, '#fbcfe8')
    dot(ctx, x + 26, hy - 24, 6, '#fbcfe8')
    dot(ctx, x, hy, 34, fur)
    ctx.fillStyle = '#f5e1c0'
    ellipse(ctx, x + 4, hy + 12, 18, 13)
    ctx.fill()
    dot(ctx, x + 4, hy + 4, 6, '#57534e')
    dot(ctx, x - 10, hy - 10, 5, '#f8fafc')
    dot(ctx, x + 16, hy - 10, 5, '#f8fafc')
    dot(ctx, x - 9, hy - 9, 2.5, '#1f2937')
    dot(ctx, x + 17, hy - 9, 2.5, '#1f2937')
    ctx.strokeStyle = '#57534e'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(x + 4, hy + 12, 8, 0.3, Math.PI - 0.3)
    ctx.stroke()
    // Arms: dancing side to side, or waving a team flag overhead.
    if (hyped) {
      arm(ctx, [x - 24, y - 126, x - 40, y - 150, x - 44, y - 178], 16, color)
      dot(ctx, x - 44, y - 182, 10, fur)
      const [hx, hy2] = arm(ctx, [x + 24, y - 126, x + 40, y - 150, x + 46, y - 180], 16, color)
      dot(ctx, hx, hy2, 10, fur)
      ctx.fillStyle = '#e2e8f0'
      ctx.fillRect(hx - 2, hy2 - 70, 4, 74)
      const wv = Math.sin(p * TAU * 3) * 6
      ctx.fillStyle = color2
      ctx.beginPath()
      ctx.moveTo(hx + 2, hy2 - 70)
      ctx.quadraticCurveTo(hx + 26, hy2 - 76 + wv, hx + 50, hy2 - 66)
      ctx.lineTo(hx + 50, hy2 - 36)
      ctx.quadraticCurveTo(hx + 26, hy2 - 46 + wv, hx + 2, hy2 - 40)
      ctx.fill()
    } else {
      const a = Math.sin(p * TAU)
      arm(ctx, [x - 24, y - 126, x - 44, y - 112 - a * 14, x - 52, y - 92 - a * 20], 16, color)
      dot(ctx, x - 52, y - 90 - a * 20, 10, fur)
      arm(ctx, [x + 24, y - 126, x + 44, y - 112 + a * 14, x + 52, y - 92 + a * 20], 16, color)
      dot(ctx, x + 52, y - 90 + a * 20, 10, fur)
    }
  }
}

// -- a can of "nuts" ---------------------------------------------------------------------------------------------

function snakeCan(sprung: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 232
    // The prankster holding out the can.
    const x = 60
    const d: Dress = { skin: TAN, hair: '#1c1917', shirt: '#a3e635', pants: '#cbd5e1' }
    const fall = sprung ? Math.min(1, p / 0.2) : 0
    ctx.save()
    ctx.translate(x, g)
    ctx.rotate(-fall * 0.12)
    ctx.translate(-x, -g)
    standing(ctx, x, g, 1, d, { open: sprung ? 0.9 : 0 })
    if (!sprung) {
      // A sly grin and a raised eyebrow.
      ctx.strokeStyle = '#1f2937'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x + 8, g - 128)
      ctx.lineTo(x + 16, g - 131)
      ctx.stroke()
    }
    ctx.restore()
    const cx = 128
    const cy = g - 84
    // The can with its label.
    ctx.fillStyle = '#cbd5e1'
    rr(ctx, cx - 20, cy - 44, 40, 50, 4)
    ctx.fillStyle = color
    ctx.fillRect(cx - 20, cy - 34, 40, 28)
    ctx.fillStyle = '#f8fafc'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('NUTS', cx, cy - 20)
    arm(ctx, [x + 10, g - 98, x + 36, g - 92, cx - 18, cy - 14], 8, d.shirt)
    dot(ctx, cx - 18, cy - 14, 5, d.skin)
    if (!sprung) {
      ctx.fillStyle = '#e2e8f0'
      ellipse(ctx, cx, cy - 46, 22, 5)
      ctx.fill()
      arm(ctx, [x - 10, g - 98, x - 16, g - 78, x - 12, g - 62], 8, d.shirt)
      return
    }
    // Pop: the lid flies off and the spring snakes shoot out.
    const u = Math.min(1, p / 0.3)
    const lid = p / 0.5
    if (lid < 1) {
      ctx.save()
      ctx.translate(cx + lid * 90, cy - 46 - Math.sin(lid * Math.PI * 0.7) * 90)
      ctx.rotate(lid * 9)
      ctx.fillStyle = '#e2e8f0'
      ellipse(ctx, 0, 0, 22, 5)
      ctx.fill()
      ctx.restore()
    }
    arm(ctx, [x - 10, g - 98, x - 26, g - 116, x - 30, g - 136], 8, d.shirt)
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + (k - 1) * 0.5
      const len = u * (110 + k * 10) + Math.sin(p * TAU * 3 + k) * 6
      const segs = 10
      for (let s = 0; s < segs; s++) {
        const q = s / segs
        const sx = cx + Math.cos(a) * len * q + Math.sin(q * 14 + p * 20) * 6
        const sy = cy - 46 + Math.sin(a) * len * q
        dot(ctx, sx, sy, 7, s % 2 ? color2 : color)
      }
      const tx = cx + Math.cos(a) * len
      const ty = cy - 46 + Math.sin(a) * len
      dot(ctx, tx, ty, 9, color2)
      dot(ctx, tx - 3, ty - 2, 2, '#1f2937')
      dot(ctx, tx + 3, ty - 2, 2, '#1f2937')
      arm(ctx, [tx, ty + 6, tx + 2, ty + 12], 2, '#ef4444')
    }
  }
}

// -- a squirting flower -------------------------------------------------------------------------------------

function squirtingFlower(squirt: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 262
    const x = 70
    const d: Dress = { skin: '#fef2f2', hair: '#38bdf8', shirt: color, pants: '#fde68a', shoes: '#ef4444' }
    ctx.fillStyle = '#ef4444'
    ellipse(ctx, x - 6, g - 4, 18, 6)
    ctx.fill()
    ellipse(ctx, x + 18, g - 4, 18, 6)
    ctx.fill()
    const laugh = squirt ? Math.abs(Math.sin(p * TAU * 4)) * 3 : 0
    standing(ctx, x, g - laugh, 1, d, { open: squirt ? 0.9 : 0.2 })
    for (const [cx, cy] of [[-16, -126], [20, -126], [-10, -140], [14, -140]]) dot(ctx, x + cx, g - laugh + cy, 8, '#38bdf8')
    dot(ctx, x + 14, g - laugh - 116, 4.5, '#ef4444')
    // A polka-dot bow tie and the big flower on the lapel.
    ctx.fillStyle = '#facc15'
    ctx.beginPath()
    ctx.moveTo(x, g - laugh - 102)
    ctx.lineTo(x - 12, g - laugh - 110)
    ctx.lineTo(x - 12, g - laugh - 94)
    ctx.closePath()
    ctx.moveTo(x, g - laugh - 102)
    ctx.lineTo(x + 12, g - laugh - 110)
    ctx.lineTo(x + 12, g - laugh - 94)
    ctx.fill()
    const fx = x + 12
    const fy = g - laugh - 86
    ctx.fillStyle = color2
    for (let k = 0; k < 6; k++) {
      const a = (k * TAU) / 6
      circle(ctx, fx + Math.cos(a) * 7, fy + Math.sin(a) * 7, 5.5)
      ctx.fill()
    }
    dot(ctx, fx, fy, 5, '#facc15')
    if (!squirt) {
      // Beckoning: come and smell my flower.
      const b = Math.sin(p * TAU * 2) * 6
      arm(ctx, [x + 10, g - 98, x + 34, g - 100, x + 50 + b * 0.3, g - 112 - b], 9, color)
      dot(ctx, x + 50 + b * 0.3, g - 112 - b, 5, '#f8fafc')
      arm(ctx, [x - 10, g - 98, x - 2, g - 82, x + 10, g - 82], 9, shade(color, -0.1))
      return
    }
    // Squeezing the bulb: water arcs out at whoever leaned in.
    arm(ctx, [x - 10, g - 98, x - 4, g - 76, x + 6, g - 62], 9, shade(color, -0.1))
    dot(ctx, x + 6, g - 62, 6, '#f8fafc')
    arm(ctx, [x + 10, g - 98, x + 24, g - 114, x + 22, g - 132], 9, color)
    dot(ctx, x + 22, g - 134, 5, '#f8fafc')
    const reach = Math.min(1, p / 0.3)
    ctx.strokeStyle = rgba('#7dd3fc', 0.85)
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(fx + 6, fy)
    for (let s = 1; s <= 12; s++) {
      const q = (s / 12) * reach
      ctx.lineTo(fx + 6 + q * 140, fy - Math.sin(q * Math.PI * 0.8) * 50 + q * q * 40)
    }
    ctx.stroke()
    for (let k = 0; k < 6; k++) {
      const q = (p * 3 + k / 6) % 1
      dot(ctx, fx + 6 + 140 * reach + q * 14 - 7, fy - Math.sin(reach * Math.PI * 0.8) * 50 + reach * reach * 40 + q * 40, 2.5, rgba('#bae6fd', 1 - q))
    }
  }
}

const BUBBLE = { id: 'bubble', frames: 1, w: 360, h: 140 }

export const SCHOOL_GAME_ROWS: Record<string, SpriteRow[]> = {
  'crossing-guard': [
    { id: 'main', frames: 6, w: 300, h: 270, paint: crossingGuard(false) },
    { id: 'act', frames: 12, w: 300, h: 270, paint: crossingGuard(true) },
    SPARKLE,
  ],
  'backpack-kid': [
    { id: 'main', frames: 8, w: 160, h: 220, paint: backpackKid(false) },
    { id: 'wave', frames: 8, w: 160, h: 220, paint: backpackKid(true) },
    SPARKLE,
  ],
  'chalkboard-teacher': [
    { id: 'main', frames: 7 * BOARD_POSES, w: 280, h: 260, paint: teacherBoard(false) },
    { id: 'act', frames: 7 * BOARD_HELLO, w: 280, h: 260, paint: teacherBoard(true) },
    { ...BUBBLE, paint: saying('Good morning, class!') },
    SPARKLE,
  ],
  'spelling-bee': [
    { id: 'main', frames: 6, w: 250, h: 260, paint: spellingBee(false) },
    { id: 'act', frames: 12, w: 250, h: 260, paint: spellingBee(true) },
    SPARKLE,
  ],
  'science-volcano': [
    { id: 'main', frames: 6, w: 250, h: 260, paint: scienceVolcano(false) },
    { id: 'act', frames: 10, w: 250, h: 260, paint: scienceVolcano(true) },
    SPARKLE,
  ],
  referee: [
    { id: 'main', frames: 6, w: 180, h: 270, paint: referee(false) },
    { id: 'act', frames: 6, w: 180, h: 270, paint: referee(true) },
    { ...BUBBLE, paint: saying('Touchdown!') },
    SPARKLE,
  ],
  cheerleaders: [
    { id: 'main', frames: 8, w: 280, h: 260, paint: cheerleaders(false) },
    { id: 'act', frames: 8, w: 280, h: 260, paint: cheerleaders(true) },
    { ...BUBBLE, paint: saying('Go team go!') },
    SPARKLE,
  ],
  'stadium-wave': [
    { id: 'main', frames: 6, w: 320, h: 200, paint: stadiumWave(false) },
    { id: 'act', frames: 12, w: 320, h: 200, paint: stadiumWave(true) },
    SPARKLE,
  ],
  'field-goal': [
    { id: 'main', frames: 4, w: 300, h: 260, paint: fieldGoal(false) },
    { id: 'act', frames: 12, w: 300, h: 260, paint: fieldGoal(true) },
    { ...BUBBLE, paint: saying('It’s good!') },
    SPARKLE,
  ],
  'team-mascot': [
    { id: 'main', frames: 8, w: 200, h: 270, paint: teamMascot(false) },
    { id: 'act', frames: 8, w: 200, h: 270, paint: teamMascot(true) },
    SPARKLE,
  ],
  'snake-can': [
    { id: 'main', frames: 4, w: 220, h: 240, paint: snakeCan(false) },
    { id: 'act', frames: 10, w: 220, h: 240, paint: snakeCan(true) },
    { ...BUBBLE, paint: saying('April Fools!') },
    SPARKLE,
  ],
  'squirting-flower': [
    { id: 'main', frames: 6, w: 240, h: 270, paint: squirtingFlower(false) },
    { id: 'act', frames: 8, w: 240, h: 270, paint: squirtingFlower(true) },
    { ...BUBBLE, paint: saying('April Fools!') },
    SPARKLE,
  ],
}
