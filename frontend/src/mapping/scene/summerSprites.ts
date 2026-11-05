/**
 * Pictures for the Fourth of July, Labor Day and the summer: the Statue of Liberty's torch, a hot dog eating
 * contest, a drum major, ants carrying off the picnic, children writing with sparklers, a bike parade,
 * ironworkers on a beam, a cannonball into the pool, a lemonade stand that turns to hot cocoa when it's cold,
 * a sandcastle and cornhole.
 *
 * Painted the same way as sprites.ts: facing right, one frame at a time, into a cell of w by h design units.
 */

import { arm, dot, head, rr, standing, type Dress } from './figures'
import {
  circle, ellipse, rgba, saying, shade, SPARKLE, TAU,
  type Ctx, type SpriteColors, type SpriteRow,
} from './sprites'

const TAN = '#c68a5a'
const BROWN = '#8d5a3b'
const PEACH = '#f5c9a0'

// -- the Statue of Liberty ---------------------------------------------------------------------------------

/** Level: her torch from a small flame to blazing, as people come. */
function liberty(ctx: Ctx, f: number, n: number, { color }: SpriteColors) {
  const k = f / (n - 1)
  const g = 316
  const x = 92
  const shadeC = shade(color, -0.2)
  // The pedestal.
  ctx.fillStyle = '#d6d3d1'
  rr(ctx, x - 40, g - 40, 80, 40, 3)
  ctx.fillStyle = '#a8a29e'
  ctx.fillRect(x - 46, g - 46, 92, 8)
  // Robes falling in folds, the tablet in her left arm.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x - 16, g - 196)
  ctx.lineTo(x + 18, g - 196)
  ctx.lineTo(x + 34, g - 46)
  ctx.lineTo(x - 34, g - 46)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = shadeC
  ctx.lineWidth = 2.5
  for (let j = -2; j <= 2; j++) {
    ctx.beginPath()
    ctx.moveTo(x + j * 5, g - 180)
    ctx.quadraticCurveTo(x + j * 10, g - 110, x + j * 13, g - 48)
    ctx.stroke()
  }
  ctx.fillStyle = shadeC
  ctx.beginPath()
  ctx.moveTo(x - 18, g - 190)
  ctx.lineTo(x + 20, g - 150)
  ctx.lineTo(x + 18, g - 140)
  ctx.lineTo(x - 20, g - 176)
  ctx.fill()
  ctx.fillStyle = shade(color, 0.15)
  ctx.save()
  ctx.translate(x - 26, g - 150)
  ctx.rotate(-0.15)
  rr(ctx, -10, -22, 22, 40, 3)
  ctx.restore()
  arm(ctx, [x - 12, g - 186, x - 28, g - 160, x - 24, g - 140], 9, color)
  // Head, the crown of seven rays.
  head(ctx, x + 2, g - 214, 15, color, 1, { blink: true })
  ctx.fillStyle = color
  rr(ctx, x - 14, g - 232, 32, 8, 3)
  for (let j = 0; j < 7; j++) {
    const a = -Math.PI + (j + 0.5) * (Math.PI / 7)
    ctx.beginPath()
    ctx.moveTo(x + 2 + Math.cos(a) * 14 - 3, g - 228 + Math.sin(a) * 4)
    ctx.lineTo(x + 2 + Math.cos(a) * 30, g - 230 + Math.sin(a) * 26)
    ctx.lineTo(x + 2 + Math.cos(a) * 14 + 3, g - 228 + Math.sin(a) * 4)
    ctx.fill()
  }
  // The right arm raised with the torch, its flame (and its glow) growing.
  arm(ctx, [x + 12, g - 190, x + 24, g - 230, x + 28, g - 262], 10, color)
  ctx.fillStyle = shadeC
  rr(ctx, x + 20, g - 274, 16, 14, 3)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x + 16, g - 278)
  ctx.lineTo(x + 40, g - 278)
  ctx.lineTo(x + 34, g - 270)
  ctx.lineTo(x + 22, g - 270)
  ctx.fill()
  const h = 12 + k * 26
  const glow = ctx.createRadialGradient(x + 28, g - 282 - h / 2, 2, x + 28, g - 282 - h / 2, 18 + k * 30)
  glow.addColorStop(0, rgba('#fde68a', 0.5 + k * 0.4))
  glow.addColorStop(1, rgba('#fde68a', 0))
  ctx.fillStyle = glow
  circle(ctx, x + 28, g - 282 - h / 2, 18 + k * 30)
  ctx.fill()
  ctx.fillStyle = '#f59e0b'
  ctx.beginPath()
  ctx.moveTo(x + 18, g - 280)
  ctx.quadraticCurveTo(x + 20 + (f % 2) * 3, g - 282 - h, x + 28, g - 284 - h * 1.1)
  ctx.quadraticCurveTo(x + 36, g - 282 - h * 0.7, x + 38, g - 280)
  ctx.fill()
  ctx.fillStyle = '#fde68a'
  ellipse(ctx, x + 28, g - 286 - h * 0.3, 5, h * 0.35)
  ctx.fill()
}

// -- a hot dog eating contest -----------------------------------------------------------------------------

function hotDogs(racing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 206
    // The table with its bunting, a stack of hot dogs going down.
    ctx.fillStyle = '#f8fafc'
    rr(ctx, 20, g - 70, 200, 10, 2)
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = k % 2 ? '#1d4ed8' : '#dc2626'
      ctx.beginPath()
      ctx.moveTo(22 + k * 33, g - 60)
      ctx.lineTo(55 + k * 33, g - 60)
      ctx.lineTo(38 + k * 33, g - 40)
      ctx.fill()
    }
    ctx.fillStyle = '#94a3b8'
    ctx.fillRect(30, g - 60, 5, 60)
    ctx.fillRect(205, g - 60, 5, 60)
    const left = racing ? 7 - Math.floor(p * 6) : 7
    for (let k = 0; k < left; k++) {
      const x = 150 + (k % 3) * 22
      const y = g - 78 - Math.floor(k / 3) * 9
      ctx.fillStyle = '#f59e0b'
      rr(ctx, x - 11, y - 3, 22, 9, 4)
      ctx.fillStyle = '#b91c1c'
      rr(ctx, x - 13, y - 5, 26, 6, 3)
      ctx.strokeStyle = '#facc15'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let j = 0; j < 5; j++) ctx.lineTo(x - 9 + j * 4.5, y - 3 + (j % 2) * 2)
      ctx.stroke()
    }
    // The eater behind the table, a hot dog in each hand, chomping (fast for people).
    const chomp = Math.sin(p * TAU * (racing ? 4 : 1))
    const d: Dress = { skin: PEACH, hair: '#78350f', shirt: color, pants: '#334155' }
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, 240, g - 70)
    ctx.clip()
    standing(ctx, 90, g - 6, 1, d, { open: 0.3 + Math.max(0, chomp) * 0.7 })
    ctx.fillStyle = color2
    ctx.fillRect(75, g - 104, 30, 6)
    ctx.restore()
    const hand = (sx: number, phase: number) => {
      const up = racing ? Math.max(0, Math.sin(p * TAU * 4 + phase)) : 0.3
      const hx = 104 + sx * 6
      const hy = g - 96 - up * 20
      arm(ctx, [80 + sx * 10, g - 104, hx - 6, g - 84, hx, hy], 9, d.skin)
      ctx.save()
      ctx.translate(hx, hy - 4)
      ctx.rotate(-0.6)
      ctx.fillStyle = '#f59e0b'
      rr(ctx, -4, -14, 9, 24, 4)
      ctx.fillStyle = '#b91c1c'
      rr(ctx, -2, -18, 5, 26, 2)
      ctx.restore()
    }
    hand(-1, 0)
    hand(1, Math.PI)
    if (racing) {
      for (let k = 0; k < 3; k++) {
        const u = (p * 3 + k / 3) % 1
        dot(ctx, 112 + u * 20, g - 128 - u * 20 + k * 4, 2.5, rgba('#f59e0b', 1 - u))
      }
    }
  }
}

// -- a drum major -------------------------------------------------------------------------------------------

function drumMajor(tossing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 276
    const d: Dress = { skin: TAN, hair: '#1c1917', shirt: color, pants: '#f8fafc', shoes: '#f8fafc' }
    const knee = Math.max(0, Math.sin(p)) * 20
    ctx.translate(0, -Math.abs(Math.cos(p)) * 2)
    standing(ctx, 80, g, 1, d, { stride: Math.sin(p) * 0.6, bald: true })
    // A high-step: the front knee lifted.
    if (knee > 4) {
      ctx.fillStyle = 'rgba(0,0,0,0)'
      arm(ctx, [82, g - 50, 98, g - 50 - knee, 98, g - 14 - knee], 11, d.pants!)
      ctx.fillStyle = '#f8fafc'
      rr(ctx, 94, g - 20 - knee, 18, 8, 3)
    }
    // A cross-strap, gold braid and the tall shako with its plume.
    ctx.strokeStyle = color2
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(68, g - 104)
    ctx.lineTo(94, g - 56)
    ctx.stroke()
    ctx.fillStyle = color
    rr(ctx, 68, g - 172, 30, 40, 4)
    ctx.fillStyle = '#111827'
    rr(ctx, 66, g - 136, 34, 6, 3)
    ctx.fillStyle = color2
    ctx.fillRect(68, g - 160, 30, 4)
    dot(ctx, 83, g - 150, 5, color2)
    ctx.fillStyle = '#f8fafc'
    for (let k = 0; k < 4; k++) {
      ellipse(ctx, 83 + Math.sin(p + k) * 2, g - 182 - k * 10, 7 - k, 12, Math.sin(p) * 0.1)
      ctx.fill()
    }
    // The baton: pumped high and low as he marches, or thrown up spinning and caught.
    arm(ctx, [70, g - 98, 64, g - 78, 66 - Math.sin(p) * 8, g - 60], 9, shade(color, -0.15))
    dot(ctx, 66 - Math.sin(p) * 8, g - 58, 5, '#f8fafc')
    let bx: number
    let by: number
    let ba: number
    if (tossing) {
      const u = (f / frames)
      const air = Math.sin(u * Math.PI)
      bx = 120
      by = g - 150 - air * 90
      ba = u * TAU * 3
      arm(ctx, [92, g - 98, 108, g - 120, 116, g - 140 - air * 10], 9, color)
      dot(ctx, 116, g - 142 - air * 10, 5, '#f8fafc')
    } else {
      const pump = Math.sin(p)
      bx = 116
      by = g - 120 - pump * 30
      ba = -0.4 + pump * 0.3
      arm(ctx, [92, g - 98, 106, g - 104 - pump * 14, bx, by], 9, color)
      dot(ctx, bx, by, 5, '#f8fafc')
    }
    ctx.save()
    ctx.translate(bx, by)
    ctx.rotate(ba)
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(0, -40)
    ctx.lineTo(0, 40)
    ctx.stroke()
    dot(ctx, 0, -40, 6, '#f8fafc')
    dot(ctx, 0, 40, 4, color2)
    ctx.restore()
  }
}

// -- ants carrying off the picnic ---------------------------------------------------------------------------

function picnicAnts(cheering: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 136
    const ant = (x: number, ph: number) => {
      const legs = Math.sin(p * 2 + ph)
      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      for (let k = 0; k < 3; k++) {
        const s = (k % 2 ? 1 : -1) * legs * 5
        ctx.beginPath()
        ctx.moveTo(x - 6 + k * 6, g - 18)
        ctx.lineTo(x - 8 + k * 6 + s, g - 8)
        ctx.lineTo(x - 10 + k * 6 + s, g)
        ctx.stroke()
      }
      dot(ctx, x - 12, g - 18, 7, color)
      dot(ctx, x, g - 20, 5, color)
      dot(ctx, x + 11, g - 24, 6, color)
      dot(ctx, x + 14, g - 26, 1.6, '#ffffff')
      ctx.beginPath()
      ctx.moveTo(x + 14, g - 29)
      ctx.quadraticCurveTo(x + 20, g - 42, x + 26, g - 40)
      ctx.stroke()
      // Arms up holding the load.
      ctx.beginPath()
      ctx.moveTo(x + 2, g - 22)
      ctx.lineTo(x + 4, g - 40 - (cheering ? 10 : 0))
      ctx.stroke()
    }
    const lift = cheering ? 10 + Math.abs(Math.sin(p * 2)) * 6 : 0
    // A slice of watermelon over the first two and a sandwich over the last two.
    ctx.save()
    ctx.translate(70, g - 52 - lift + Math.sin(p * 2) * 1.5)
    ctx.fillStyle = '#16a34a'
    ctx.beginPath()
    ctx.arc(0, 0, 48, 0, Math.PI)
    ctx.fill()
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.arc(0, 0, 43, 0, Math.PI)
    ctx.fill()
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.arc(0, 0, 40, 0, Math.PI)
    ctx.fill()
    for (let k = 0; k < 7; k++) {
      const a = 0.4 + k * 0.38
      ctx.fillStyle = '#111827'
      ellipse(ctx, Math.cos(a) * 24, Math.sin(a) * 22, 2, 3.4, a)
      ctx.fill()
    }
    ctx.restore()
    ctx.save()
    ctx.translate(190, g - 50 - lift + Math.sin(p * 2 + 1) * 1.5)
    ctx.fillStyle = '#fbbf24'
    rr(ctx, -30, -6, 60, 10, 4)
    ctx.fillStyle = '#4ade80'
    ctx.fillRect(-32, 3, 64, 4)
    ctx.fillStyle = '#ef4444'
    ctx.fillRect(-28, 6, 56, 5)
    ctx.fillStyle = '#fbbf24'
    rr(ctx, -30, 10, 60, 9, 4)
    ctx.restore()
    for (const [x, ph] of [[46, 0], [96, 1.5], [170, 0.7], [212, 2.2]] as const) ant(x, ph)
  }
}

// -- writing with sparklers --------------------------------------------------------------------------------------

/** "USA" as strokes, each a list of points, for the sparkler trails. */
const USA: number[][][] = [
  [[0, 0], [0, 30], [8, 40], [16, 40], [24, 30], [24, 0]],
  [[60, 6], [52, 0], [40, 0], [34, 8], [38, 18], [56, 22], [60, 32], [54, 40], [42, 40], [34, 34]],
  [[70, 40], [82, 0], [94, 40]],
  [[74, 26], [90, 26]],
]

function sparklerKids(writing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 236
    // A child holding a sparkler out towards (tx, ty): the hand a stick's length short of the fizzing tip.
    const kid = (x: number, dir: number, shirt: string, tx: number, ty: number) => {
      const d: Dress = { skin: dir > 0 ? PEACH : BROWN, hair: dir > 0 ? '#b45309' : '#111827', shirt, pants: '#1e3a8a' }
      ctx.save()
      ctx.translate(x, g)
      ctx.scale(0.9, 0.9)
      standing(ctx, 0, 0, dir, d, { open: writing ? 0.6 : 0.2 })
      ctx.restore()
      const sx = x + dir * 9
      const sy = g - 88
      const len = Math.hypot(tx - sx, ty - sy) || 1
      const hx = tx - ((tx - sx) / len) * 22
      const hy = ty - ((ty - sy) / len) * 22
      arm(ctx, [sx, sy, (sx + hx) / 2 + dir * 4, (sy + hy) / 2 + 8, hx, hy], 7, d.skin)
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(hx, hy)
      ctx.lineTo(tx, ty)
      ctx.stroke()
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU + f
        const r = 6 + ((k * 7 + f * 3) % 8)
        ctx.strokeStyle = k % 2 ? '#fde68a' : '#ffffff'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(tx, ty)
        ctx.lineTo(tx + Math.cos(a) * r, ty + Math.sin(a) * r)
        ctx.stroke()
      }
      dot(ctx, tx, ty, 3, '#ffffff')
    }
    if (writing) {
      // The letters glowing in the air, drawn stroke by stroke (the newest end where the sparkler is).
      const total = USA.reduce((n, s) => n + s.length - 1, 0)
      const done = p * total * 1.15
      const ox = 72
      const oy = 84
      const sc = 0.72
      let seen = 0
      let tip: [number, number] = [ox, oy]
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const stroke of USA) {
        for (let k = 1; k < stroke.length; k++) {
          const u = Math.max(0, Math.min(1, done - seen))
          seen++
          if (u <= 0) continue
          const [x0, y0] = stroke[k - 1]
          const [x1, y1] = stroke[k]
          const ex = x0 + (x1 - x0) * u
          const ey = y0 + (y1 - y0) * u
          for (const [w, c] of [[7, rgba('#f59e0b', 0.35)], [3, '#fef3c7']] as const) {
            ctx.strokeStyle = c
            ctx.lineWidth = w
            ctx.beginPath()
            ctx.moveTo(ox + x0 * sc, oy + y0 * sc)
            ctx.lineTo(ox + ex * sc, oy + ey * sc)
            ctx.stroke()
          }
          tip = [ox + ex * sc, oy + ey * sc]
        }
      }
      kid(56, 1, color, tip[0], tip[1])
      kid(196, -1, color2, 168 + Math.sin(p * TAU * 2) * 12, 104 + Math.cos(p * TAU * 2) * 12)
    } else {
      // Small circles of light, round and round.
      const a = p * TAU
      kid(56, 1, color, 96 + Math.cos(a) * 8, 112 + Math.sin(a) * 8)
      kid(196, -1, color2, 156 + Math.cos(-a) * 8, 112 + Math.sin(-a) * 8)
    }
  }
}

// -- a bike parade -----------------------------------------------------------------------------------------

function bikeParade(ringing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 216
    // Wheels with streamers woven through the spokes, the frame, a flag on a stick off the back.
    for (const x of [60, 160]) {
      ctx.strokeStyle = '#e5e7eb'
      ctx.lineWidth = 4
      circle(ctx, x, g - 32, 30)
      ctx.stroke()
      for (let k = 0; k < 6; k++) {
        const a = p + (k / 6) * TAU
        ctx.strokeStyle = [color, '#f8fafc', color2][k % 3]
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(x, g - 32)
        ctx.lineTo(x + Math.cos(a) * 28, g - 32 + Math.sin(a) * 28)
        ctx.stroke()
      }
    }
    ctx.strokeStyle = color
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(60, g - 32)
    ctx.lineTo(94, g - 80)
    ctx.lineTo(146, g - 80)
    ctx.lineTo(160, g - 32)
    ctx.moveTo(94, g - 80)
    ctx.lineTo(110, g - 32)
    ctx.lineTo(146, g - 80)
    ctx.moveTo(148, g - 86)
    ctx.lineTo(144, g - 104)
    ctx.stroke()
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(134, g - 106)
    ctx.lineTo(156, g - 104)
    ctx.stroke()
    // Handlebar tassels.
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = k % 2 ? color2 : '#f8fafc'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(156, g - 104)
      ctx.lineTo(166 + Math.sin(p * 2 + k) * 3, g - 92 + k * 3)
      ctx.stroke()
    }
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(70, g - 50)
    ctx.lineTo(44, g - 170)
    ctx.stroke()
    ctx.fillStyle = '#1d4ed8'
    ctx.fillRect(44, g - 170, 14, 11)
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = k % 2 ? '#f8fafc' : '#dc2626'
      ctx.fillRect(58, g - 170 + k * 4.4 + Math.sin(p + k) * 0.6, 22 + Math.sin(p * 2) * 2, 4.4)
    }
    ctx.fillStyle = '#dc2626'
    ctx.fillRect(44, g - 159, 14, 11)
    // The rider pedalling, a bell on the bars that rings for people.
    const pedal = (a: number, col: string) => {
      const fx = 110 + Math.cos(a) * 14
      const fy = g - 32 + Math.sin(a) * 14
      arm(ctx, [98, g - 92, (98 + fx) / 2 + 14, (g - 92 + fy) / 2 - 6, fx, fy], 10, col)
    }
    pedal(p + Math.PI, '#334155')
    ctx.fillStyle = '#1f2937'
    rr(ctx, 86, g - 98, 22, 7, 3)
    ctx.fillStyle = color2
    ctx.save()
    ctx.translate(100, g - 98)
    ctx.rotate(0.25)
    rr(ctx, -14, -50, 28, 52, 10)
    ctx.restore()
    pedal(p, '#475569')
    head(ctx, 116, g - 158, 15, TAN, 1, { open: ringing ? 0.7 : 0 })
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.ellipse(114, g - 164, 18, 13, 0, Math.PI, 0)
    ctx.fill()
    ctx.strokeStyle = '#f8fafc'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(100, g - 166)
    ctx.lineTo(128, g - 166)
    ctx.stroke()
    arm(ctx, [108, g - 132, 128, g - 120, 140, g - 106], 8, color2)
    if (ringing) {
      const w = Math.sin(p * 3) * 8
      arm(ctx, [112, g - 132, 120, g - 152, 118 + w, g - 176], 8, color2)
      dot(ctx, 118 + w, g - 178, 4.5, TAN)
    } else arm(ctx, [112, g - 132, 134, g - 118, 150, g - 106], 8, shade(color2, -0.15))
    dot(ctx, 150, g - 110, 5, '#facc15')
    if (ringing && f % 2 === 0) {
      ctx.strokeStyle = rgba('#fde68a', 0.9)
      ctx.lineWidth = 2
      for (const r of [9, 14]) {
        ctx.beginPath()
        ctx.arc(150, g - 110, r, -1.1, -0.2)
        ctx.stroke()
      }
    }
  }
}

// -- ironworkers on a beam --------------------------------------------------------------------------------------

function ironworkers(waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const y = 130
    // The crane cable and the I-beam swaying a little.
    const sway = Math.sin(p) * 0.02
    ctx.save()
    ctx.translate(140, 0)
    ctx.rotate(sway)
    ctx.translate(-140, 0)
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(140, 0)
    ctx.lineTo(140, y - 40)
    ctx.lineTo(80, y - 6)
    ctx.moveTo(140, y - 40)
    ctx.lineTo(200, y - 6)
    ctx.stroke()
    dot(ctx, 140, y - 40, 5, '#64748b')
    ctx.fillStyle = color2
    ctx.fillRect(20, y - 6, 240, 6)
    ctx.fillRect(20, y + 14, 240, 6)
    ctx.fillRect(20, y, 240, 14)
    ctx.fillStyle = shade(color2, -0.2)
    ctx.fillRect(20, y + 2, 240, 10)
    for (let k = 0; k < 10; k++) dot(ctx, 32 + k * 24, y + 7, 2, shade(color2, 0.3))
    // Two sitting on it with their lunch, legs swinging; for people they wave down.
    const worker = (x: number, skin: string, ph: number, waves: boolean) => {
      const swing = Math.sin(p + ph) * 10
      arm(ctx, [x - 4, y - 8, x + 8, y + 8, x + 12 + swing, y + 50], 11, '#1e3a8a')
      arm(ctx, [x - 10, y - 8, x, y + 10, x + 2 - swing, y + 50], 11, '#1e40af')
      ctx.fillStyle = '#78350f'
      rr(ctx, x + 6 + swing, y + 46, 18, 9, 3)
      rr(ctx, x - 4 - swing, y + 46, 18, 9, 3)
      ctx.fillStyle = color
      rr(ctx, x - 16, y - 58, 30, 52, 10)
      head(ctx, x, y - 72, 15, skin, 1, { open: waves ? 0.7 : 0 })
      ctx.fillStyle = '#facc15'
      ctx.beginPath()
      ctx.ellipse(x, y - 78, 18, 13, 0, Math.PI, 0)
      ctx.fill()
      rr(ctx, x - 20, y - 80, 40, 5, 2)
      if (waves) {
        const w = Math.sin(p * 2 + ph) * 10
        arm(ctx, [x + 6, y - 50, x + 22, y - 76, x + 20 + w, y - 100], 8, color)
        dot(ctx, x + 20 + w, y - 102, 5, skin)
      } else {
        // A sandwich to the mouth now and then.
        const eat = Math.max(0, Math.sin(p + ph))
        arm(ctx, [x + 6, y - 50, x + 22, y - 36 - eat * 20, x + 14, y - 50 - eat * 14], 8, color)
        ctx.fillStyle = '#fbbf24'
        rr(ctx, x + 8, y - 56 - eat * 14, 14, 9, 3)
      }
      arm(ctx, [x - 10, y - 50, x - 22, y - 30, x - 22, y - 10], 8, shade(color, -0.15))
    }
    worker(90, PEACH, 0, waving)
    worker(180, BROWN, 1.3, waving)
    ctx.restore()
  }
}

// -- a cannonball into the pool ----------------------------------------------------------------------------

function cannonball(jumping: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 226
    // The pool (pale water so it shows), the diving board on its stand.
    ctx.fillStyle = rgba('#7dd3fc', 0.55)
    ctx.fillRect(90, g - 30, 150, 30)
    ctx.strokeStyle = rgba('#e0f2fe', 0.9)
    ctx.lineWidth = 2
    for (let k = 0; k < 3; k++) {
      ctx.beginPath()
      for (let x = 96; x < 236; x += 8) ctx.lineTo(x, g - 22 + k * 8 + Math.sin(x * 0.12 + f) * 2)
      ctx.stroke()
    }
    ctx.fillStyle = '#e5e7eb'
    ctx.fillRect(84, g - 36, 156, 6)
    ctx.fillStyle = '#94a3b8'
    ctx.fillRect(14, g - 40, 16, 40)
    const flex = jumping ? (p < 0.25 ? Math.sin((p / 0.25) * Math.PI) * 8 : 0) : Math.abs(Math.sin(p * TAU)) * 5
    ctx.strokeStyle = color2
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(10, g - 44)
    ctx.quadraticCurveTo(60, g - 44, 104, g - 44 + flex)
    ctx.stroke()
    const d: Dress = { skin: TAN, hair: '#1c1917', shirt: TAN, pants: color }
    if (!jumping || p < 0.25) {
      // Bouncing at the end of the board.
      const hop = jumping ? 0 : Math.abs(Math.sin(p * TAU)) * 14
      ctx.save()
      ctx.translate(88, g - 48 + flex - hop)
      ctx.scale(0.75, 0.75)
      standing(ctx, 0, 0, 1, d, { open: 0.3 })
      arm(ctx, [-10, -96, -18, -110, -16, -128], 9, d.skin)
      arm(ctx, [10, -96, 18, -110, 16, -128], 9, d.skin)
      ctx.restore()
    } else if (p < 0.65) {
      // Up and over in a tuck.
      const u = (p - 0.25) / 0.4
      const bx = 100 + u * 70
      const by = g - 120 - Math.sin(u * Math.PI) * 50 + u * 70
      ctx.save()
      ctx.translate(bx, by)
      ctx.rotate(u * 1.2)
      dot(ctx, 0, 0, 22, color)
      arm(ctx, [-6, -6, 10, 10, 18, -4], 10, d.skin)
      head(ctx, 6, -24, 13, d.skin, 1, { open: 0.9 })
      ctx.fillStyle = d.hair
      ctx.beginPath()
      ctx.arc(6, -26, 14, Math.PI * 1.02, Math.PI * 1.98)
      ctx.fill()
      ctx.restore()
    } else {
      // The splash.
      const u = (p - 0.65) / 0.35
      for (let k = 0; k < 14; k++) {
        const a = -Math.PI / 2 + (k / 13 - 0.5) * 2.2
        const r = 20 + u * 70
        const sx = 172 + Math.cos(a) * r * 0.7
        const sy = g - 30 + Math.sin(a) * r * (1 - u * 0.4) + u * u * 50
        dot(ctx, sx, Math.min(g - 26, sy), 6 - u * 3, rgba('#e0f2fe', 1 - u * 0.5))
      }
      ctx.fillStyle = rgba('#e0f2fe', 0.9 - u * 0.6)
      ellipse(ctx, 172, g - 30, 26 + u * 20, 8)
      ctx.fill()
    }
  }
}

// -- a lemonade stand (hot cocoa when it's cold) -----------------------------------------------------------------

function lemonadeStand(cold: boolean, pouring: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 236
    // The stand: its counter, posts and a sign; behind it the seller.
    const d: Dress = { skin: PEACH, hair: '#ca8a04', shirt: cold ? '#dc2626' : color2 }
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, 240, g - 80)
    ctx.clip()
    standing(ctx, 120, g, 1, d, { open: pouring ? 0.6 : 0, skirt: true })
    if (cold) {
      // A knitted hat with a bobble.
      ctx.fillStyle = '#16a34a'
      ctx.beginPath()
      ctx.ellipse(122, g - 124, 18, 16, 0, Math.PI, 0)
      ctx.fill()
      dot(ctx, 122, g - 142, 6, '#f8fafc')
    } else {
      dot(ctx, 104, g - 116, 7, d.hair)
      dot(ctx, 140, g - 116, 7, d.hair)
    }
    ctx.restore()
    ctx.fillStyle = '#a16207'
    ctx.fillRect(40, g - 150, 6, 150)
    ctx.fillRect(194, g - 150, 6, 150)
    ctx.fillStyle = color
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = k % 2 ? '#f8fafc' : (cold ? '#dc2626' : color)
      ctx.beginPath()
      ctx.moveTo(36 + k * 28, g - 156)
      ctx.lineTo(64 + k * 28, g - 156)
      ctx.lineTo(64 + k * 28, g - 144)
      ctx.quadraticCurveTo(50 + k * 28, g - 134, 36 + k * 28, g - 144)
      ctx.fill()
    }
    ctx.fillStyle = '#fef3c7'
    rr(ctx, 30, g - 80, 180, 80, 4)
    ctx.fillStyle = cold ? '#78350f' : '#ca8a04'
    ctx.font = 'bold 26px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(cold ? 'HOT COCOA' : 'LEMONADE', 120, g - 54)
    ctx.font = 'bold 18px sans-serif'
    ctx.fillStyle = cold ? '#dc2626' : '#16a34a'
    ctx.fillText(cold ? '50¢' : '25¢', 120, g - 26)
    // On the counter: the pitcher (lemons) or the pot (steam), and a cup.
    if (cold) {
      ctx.fillStyle = '#94a3b8'
      rr(ctx, 50, g - 106, 34, 26, 5)
      for (let k = 0; k < 3; k++) {
        const u = (p + k / 3) % 1
        ctx.strokeStyle = rgba('#e5e7eb', 0.7 * (1 - u))
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(58 + k * 9, g - 110 - u * 30)
        ctx.quadraticCurveTo(54 + k * 9, g - 120 - u * 30, 58 + k * 9, g - 128 - u * 30)
        ctx.stroke()
      }
    } else {
      ctx.fillStyle = rgba('#fde047', 0.85)
      rr(ctx, 50, g - 118, 30, 38, 5)
      dot(ctx, 60, g - 96, 5, '#facc15')
      dot(ctx, 70, g - 104, 5, '#facc15')
      ctx.fillStyle = rgba('#e0f2fe', 0.8)
      ctx.fillRect(56, g - 112, 6, 6)
    }
    // Pouring a cup for people and holding it out.
    const reach = pouring ? Math.min(1, p / 0.5) : 0
    const cx = 150 + reach * 30
    const cy = g - 90 - reach * 6
    arm(ctx, [130, g - 98, 140 + reach * 10, g - 90, cx, cy], 8, d.skin)
    ctx.fillStyle = cold ? '#f8fafc' : '#fde047'
    rr(ctx, cx - 6, cy - 16, 13, 16, 2)
    if (cold) {
      ctx.fillStyle = '#78350f'
      ctx.fillRect(cx - 5, cy - 14, 11, 3)
    }
    if (pouring && p > 0.5) {
      const u = (p - 0.5) / 0.5
      dot(ctx, cx, cy - 26 - u * 10, 4, rgba(cold ? '#f472b6' : '#facc15', 1 - u))
    }
  }
}

// -- a sandcastle -------------------------------------------------------------------------------------------

/** Level: the castle rising tower by tower as people come, a flag on the top at the end. */
function sandcastle(ctx: Ctx, f: number, n: number, { color, color2 }: SpriteColors) {
  const g = 176
  const k = f / (n - 1)
  const sand = '#fcd34d'
  const dark = shade(sand, -0.2)
  ctx.fillStyle = dark
  ellipse(ctx, 150, g - 4, 80, 8)
  ctx.fill()
  const tower = (x: number, w: number, h: number, u: number) => {
    if (u <= 0) return
    const hh = h * Math.min(1, u)
    ctx.fillStyle = sand
    ctx.fillRect(x - w / 2, g - 4 - hh, w, hh)
    ctx.fillStyle = dark
    for (let j = 0; j < 3; j++) ctx.fillRect(x - w / 2, g - 4 - hh + 8 + j * 14, w, 2)
    if (u >= 1) {
      ctx.fillStyle = sand
      for (let j = 0; j < 3; j++) ctx.fillRect(x - w / 2 + j * (w / 2.5), g - 4 - hh - 8, w / 5, 8)
      dot(ctx, x, g - 4 - hh + 22, 4, dark)
    }
  }
  tower(150, 50, 40, k * 4)
  tower(108, 26, 56, k * 4 - 1)
  tower(192, 26, 56, k * 4 - 2)
  tower(150, 22, 80, k * 4 - 3)
  if (k >= 1) {
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(150, g - 92)
    ctx.lineTo(150, g - 120)
    ctx.stroke()
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(150, g - 120)
    ctx.lineTo(170, g - 114)
    ctx.lineTo(150, g - 108)
    ctx.fill()
  }
  // The builder kneeling with a bucket and spade.
  const x = 40
  ctx.fillStyle = color
  rr(ctx, x - 18, g - 26, 30, 22, 8)
  ctx.save()
  ctx.translate(x - 2, g - 28)
  ctx.rotate(0.2)
  ctx.fillStyle = color
  rr(ctx, -14, -46, 28, 48, 10)
  ctx.restore()
  head(ctx, x + 10, g - 88, 14, TAN, 1, { open: k >= 1 ? 0.7 : 0 })
  ctx.fillStyle = '#facc15'
  ctx.beginPath()
  ctx.ellipse(x + 10, g - 96, 24, 5, 0, 0, TAU)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(x + 10, g - 98, 13, 10, 0, Math.PI, 0)
  ctx.fill()
  const dig = Math.sin(f * 1.7) * 6
  arm(ctx, [x + 6, g - 66, x + 26, g - 50, x + 40 + dig, g - 34], 8, TAN)
  ctx.strokeStyle = '#ef4444'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(x + 40 + dig, g - 34)
  ctx.lineTo(x + 52 + dig, g - 12)
  ctx.stroke()
  ctx.fillStyle = '#38bdf8'
  ctx.beginPath()
  ctx.moveTo(10, g - 30)
  ctx.lineTo(30, g - 30)
  ctx.lineTo(27, g - 4)
  ctx.lineTo(13, g - 4)
  ctx.fill()
}

// -- cornhole -----------------------------------------------------------------------------------------------

function cornhole(scoring: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 196
    // The board, slanted, with its hole and a stripe, and a couple of bags already on it.
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(190, g - 4)
    ctx.lineTo(276, g - 4)
    ctx.lineTo(262, g - 40)
    ctx.lineTo(214, g - 40)
    ctx.fill()
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(196, g - 18)
    ctx.lineTo(270, g - 18)
    ctx.lineTo(267, g - 24)
    ctx.lineTo(200, g - 24)
    ctx.fill()
    ctx.fillStyle = '#111827'
    ellipse(ctx, 238, g - 32, 9, 4)
    ctx.fill()
    ctx.fillStyle = '#a16207'
    ctx.fillRect(210, g - 40, 4, 40)
    ctx.fillRect(260, g - 40, 4, 40)
    ctx.fillStyle = color2
    rr(ctx, 210, g - 14, 14, 8, 3)
    // The thrower: a swing of the arm, and the bag's arc.
    const d: Dress = { skin: BROWN, hair: '#111827', shirt: color2, pants: '#475569' }
    const wind = scoring ? Math.min(1, p / 0.3) : 0.3 + Math.sin(p * TAU) * 0.2
    const cheer = scoring && p > 0.75
    standing(ctx, 60, g, 1, d, { open: cheer ? 0.8 : 0, stride: 0.5 })
    if (cheer) {
      arm(ctx, [50, g - 98, 40, g - 120, 38, g - 142], 9, d.shirt)
      arm(ctx, [70, g - 98, 80, g - 120, 84, g - 142], 9, d.shirt)
    } else {
      const a = Math.PI / 2 + 0.8 - wind * 2
      const hx = 70 + Math.cos(a) * 34
      const hy = g - 98 + Math.sin(a) * 34
      arm(ctx, [70, g - 98, hx, hy], 9, d.shirt)
      arm(ctx, [50, g - 98, 44, g - 76, 46, g - 60], 9, shade(d.shirt, -0.15))
      if (!scoring || p < 0.3) {
        ctx.fillStyle = color2
        rr(ctx, hx - 6, hy - 6, 13, 10, 3)
      }
    }
    if (scoring && p >= 0.3) {
      const u = Math.min(1, (p - 0.3) / 0.45)
      const bx = 96 + u * 142
      const by = g - 90 - Math.sin(u * Math.PI) * 80 + u * 58
      if (u < 1) {
        ctx.save()
        ctx.translate(bx, by)
        ctx.rotate(u * 4)
        ctx.fillStyle = color2
        rr(ctx, -7, -5, 14, 10, 3)
        ctx.restore()
      } else {
        // In the hole: a pop of sparkle.
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU
          dot(ctx, 238 + Math.cos(a) * 14, g - 40 + Math.sin(a) * 8, 2.5, '#fde68a')
        }
      }
    }
  }
}

const BUBBLE = { id: 'bubble', frames: 1, w: 360, h: 140 }

export const SUMMER_ROWS: Record<string, SpriteRow[]> = {
  'statue-of-liberty': [
    { id: 'main', frames: 6, w: 180, h: 320, paint: liberty },
    SPARKLE,
  ],
  'hot-dog-contest': [
    { id: 'main', frames: 4, w: 240, h: 210, paint: hotDogs(false) },
    { id: 'act', frames: 8, w: 240, h: 210, paint: hotDogs(true) },
    { ...BUBBLE, paint: saying('Ten more!') },
    SPARKLE,
  ],
  'drum-major': [
    { id: 'main', frames: 8, w: 180, h: 290, paint: drumMajor(false) },
    { id: 'wave', frames: 8, w: 180, h: 290, paint: drumMajor(true) },
    SPARKLE,
  ],
  'picnic-ants': [
    { id: 'main', frames: 8, w: 260, h: 140, paint: picnicAnts(false) },
    { id: 'wave', frames: 8, w: 260, h: 140, paint: picnicAnts(true) },
    SPARKLE,
  ],
  'sparkler-writers': [
    { id: 'main', frames: 4, w: 240, h: 240, paint: sparklerKids(false) },
    { id: 'act', frames: 12, w: 240, h: 240, paint: sparklerKids(true) },
    SPARKLE,
  ],
  'bike-parade': [
    { id: 'main', frames: 8, w: 220, h: 230, paint: bikeParade(false) },
    { id: 'wave', frames: 8, w: 220, h: 230, paint: bikeParade(true) },
    SPARKLE,
  ],
  ironworkers: [
    { id: 'main', frames: 4, w: 280, h: 200, paint: ironworkers(false) },
    { id: 'act', frames: 8, w: 280, h: 200, paint: ironworkers(true) },
    { ...BUBBLE, paint: saying('Happy Labor Day!') },
    SPARKLE,
  ],
  cannonball: [
    { id: 'main', frames: 4, w: 240, h: 240, paint: cannonball(false) },
    { id: 'act', frames: 10, w: 240, h: 240, paint: cannonball(true) },
    { ...BUBBLE, paint: saying('Cannonball!') },
    SPARKLE,
  ],
  'lemonade-stand': [
    { id: 'main', frames: 4, w: 240, h: 240, paint: lemonadeStand(false, false) },
    { id: 'act', frames: 8, w: 240, h: 240, paint: lemonadeStand(false, true) },
    { id: 'cold', frames: 4, w: 240, h: 240, paint: lemonadeStand(true, false) },
    { id: 'coldact', frames: 8, w: 240, h: 240, paint: lemonadeStand(true, true) },
    { ...BUBBLE, paint: saying('Ice cold lemonade!') },
    { id: 'cocoa', frames: 1, w: 360, h: 140, paint: saying('Hot cocoa!') },
    SPARKLE,
  ],
  sandcastle: [
    { id: 'main', frames: 8, w: 240, h: 180, paint: sandcastle },
    SPARKLE,
  ],
  cornhole: [
    { id: 'main', frames: 4, w: 280, h: 200, paint: cornhole(false) },
    { id: 'act', frames: 10, w: 280, h: 200, paint: cornhole(true) },
    { ...BUBBLE, paint: saying('Cornhole!') },
    SPARKLE,
  ],
}
