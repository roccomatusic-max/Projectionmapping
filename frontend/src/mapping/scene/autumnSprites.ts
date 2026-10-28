/**
 * Pictures for the autumn holidays after Halloween: for Veterans Day an
 * honor guard carrying the flag, a bugler, jets flying over in formation
 * and a bald eagle on the roof; for Diwali a rangoli, star lanterns and a
 * painted elephant.
 *
 * Painted the same way as sprites.ts: facing right, one frame at a time,
 * into a cell of w by h design units.
 */

import { note } from './halloweenSprites'
import {
  circle, eagle, ellipse, glow, limb, rgba, ribbon, saying, shade, SPARKLE, TAU,
  type Ctx, type SpriteColors, type SpriteRow,
} from './sprites'

const SKIN = '#c68e5d'

/** The Stars and Stripes, w by h, rippling with phase p (0 lies flat). */
export function usFlag(ctx: Ctx, x: number, y: number, w: number, h: number, p: number, ripple = 1) {
  const rows = 13
  const col = 24
  const wave = (u: number) => Math.sin(u * 5 - p) * h * 0.08 * ripple * u
  for (let c = 0; c < col; c++) {
    const u0 = c / col
    const u1 = (c + 1) / col
    const shadeK = Math.cos(u0 * 5 - p) * 0.12 * ripple
    for (let r = 0; r < rows; r++) {
      const v0 = r / rows
      ctx.fillStyle = r % 2 ? shade('#f8fafc', -0.05 + shadeK) : shade('#b91c1c', shadeK)
      ctx.beginPath()
      ctx.moveTo(x + u0 * w, y + v0 * h + wave(u0))
      ctx.lineTo(x + u1 * w + 0.6, y + v0 * h + wave(u1))
      ctx.lineTo(x + u1 * w + 0.6, y + (v0 + 1 / rows) * h + wave(u1) + 0.6)
      ctx.lineTo(x + u0 * w, y + (v0 + 1 / rows) * h + wave(u0) + 0.6)
      ctx.fill()
    }
  }
  // The blue canton with rows of stars.
  const cw = w * 0.4
  const ch = h * (7 / 13)
  ctx.fillStyle = '#1e3a8a'
  ctx.beginPath()
  ctx.moveTo(x, y)
  for (let c = 0; c <= 10; c++) ctx.lineTo(x + (c / 10) * cw, y + wave((c / 10) * 0.4))
  for (let c = 10; c >= 0; c--) ctx.lineTo(x + (c / 10) * cw, y + ch + wave((c / 10) * 0.4))
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 6; c++) {
      const u = (c + 0.5 + (r % 2) * 0.4) / 6.4
      circle(ctx, x + u * cw, y + ((r + 0.6) / 5.4) * ch + wave(u * 0.4), Math.max(0.8, h * 0.022))
      ctx.fill()
    }
  }
}

// -- an honor guard ---------------------------------------------------------------------------------

/** A soldier in dress blues, legs at the given angles, arms drawn by the caller. */
function dressBlues(ctx: Ctx, x: number, legs: [number, number], coat: string, trim: string) {
  const hip = 160
  for (const [k, a] of [[-1, legs[0]], [1, legs[1]]] as const) {
    const [fx, fy] = limb(ctx, x + k * 8, hip, 46, 46, a, Math.max(0, -a) * 0.5, 15, '#3b5b9a')
    // The gold stripe down the trouser leg.
    ctx.strokeStyle = trim
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x + k * 8 + 5, hip)
    ctx.lineTo(fx + 5, fy - 4)
    ctx.stroke()
    ctx.fillStyle = '#0a0a0a'
    ellipse(ctx, fx + 7, fy + 3, 13, 6)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ellipse(ctx, fx + 10, fy + 1, 5, 2)
    ctx.fill()
  }
  // Coat, belt, buttons, ribbons.
  const g = ctx.createLinearGradient(x - 26, 0, x + 26, 0)
  g.addColorStop(0, shade(coat, -0.3))
  g.addColorStop(0.5, shade(coat, 0.15))
  g.addColorStop(1, shade(coat, -0.25))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(x - 24, 84)
  ctx.lineTo(x + 24, 84)
  ctx.lineTo(x + 22, 168)
  ctx.lineTo(x - 22, 168)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(x - 23, 140, 46, 7)
  ctx.fillStyle = trim
  ctx.fillRect(x - 4, 140, 8, 7)
  for (let k = 0; k < 4; k++) {
    circle(ctx, x + 4, 96 + k * 12, 2.2)
    ctx.fill()
  }
  for (const [c, dy] of [['#dc2626', 0], ['#2563eb', 5], ['#facc15', 10]] as const) {
    ctx.fillStyle = c
    ctx.fillRect(x - 18, 96 + dy, 12, 4)
  }
  // Epaulettes.
  ctx.fillStyle = trim
  for (const k of [-1, 1]) {
    ctx.fillRect(x + k * 24 - 7, 82, 14, 5)
  }
}

function guardHead(ctx: Ctx, x: number, coat: string, trim: string) {
  ctx.fillStyle = SKIN
  ctx.fillRect(x - 5, 70, 12, 16)
  ellipse(ctx, x + 2, 58, 15, 17)
  ctx.fill()
  ctx.fillStyle = '#1c1917'
  circle(ctx, x + 9, 56, 2)
  ctx.fill()
  ctx.fillStyle = shade(SKIN, -0.2)
  ctx.beginPath()
  ctx.moveTo(x + 16, 58)
  ctx.lineTo(x + 20, 64)
  ctx.lineTo(x + 15, 65)
  ctx.fill()
  // Peaked cap: a white top, a dark band with gold, a black visor.
  ctx.fillStyle = '#f8fafc'
  ellipse(ctx, x + 2, 40, 20, 7)
  ctx.fill()
  ctx.fillStyle = shade(coat, -0.2)
  ctx.fillRect(x - 15, 40, 33, 10)
  ctx.fillStyle = trim
  ctx.fillRect(x - 15, 44, 33, 2)
  circle(ctx, x + 4, 45, 3.5)
  ctx.fill()
  ctx.fillStyle = '#0a0a0a'
  ctx.beginPath()
  ctx.moveTo(x + 4, 50)
  ctx.quadraticCurveTo(x + 18, 50, x + 26, 56)
  ctx.lineTo(x + 6, 54)
  ctx.closePath()
  ctx.fill()
}

function honorGuard(saluting: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const s = Math.sin(p)
    const x = 80
    const bob = saluting ? 0 : -Math.abs(Math.cos(p)) * 3
    ctx.save()
    ctx.translate(0, bob)
    if (saluting) {
      // At attention, the flag held upright beside him, his right hand to the peak of his cap.
      ctx.fillStyle = '#a16207'
      ctx.fillRect(120, 6, 5, 240)
      ctx.fillStyle = '#facc15'
      circle(ctx, 122.5, 6, 5)
      ctx.fill()
      usFlag(ctx, 125, 12, 42, 30, p, 1.4)
      dressBlues(ctx, x, [-0.04, 0.04], color, color2)
      limb(ctx, x + 22, 88, 32, 34, 0.15, 0.2, 10, color)
      ctx.fillStyle = '#f8fafc'
      circle(ctx, 120, 150, 7)
      ctx.fill()
      guardHead(ctx, x, color, color2)
      const [hx, hy] = limb(ctx, x - 22, 88, 30, 28, 2.5, 1.9, 10, color)
      ctx.fillStyle = '#f8fafc'
      ellipse(ctx, hx + 6, hy - 2, 9, 5, -0.6)
      ctx.fill()
    } else {
      // Marching, the flag held up in front of him and streaming back over his head.
      ctx.save()
      ctx.translate(126, 160)
      ctx.rotate(0.06)
      ctx.fillStyle = '#a16207'
      ctx.fillRect(-2.5, -158, 5, 158)
      ctx.fillStyle = '#facc15'
      circle(ctx, 0, -158, 5)
      ctx.fill()
      ctx.translate(-2, -154)
      ctx.scale(-1, 1)
      usFlag(ctx, 0, 0, 62, 38, p * 1.5, 1.6)
      ctx.restore()
      dressBlues(ctx, x, [s * 0.45, -s * 0.45], color, color2)
      // The far arm swinging; the near one up at the pole.
      limb(ctx, x - 20, 88, 32, 32, -s * 0.5, 0.25, 10, shade(color, -0.2))
      guardHead(ctx, x, color, color2)
      const [hx, hy] = limb(ctx, x + 20, 88, 28, 26, 0.9, -0.55, 10, color)
      ctx.fillStyle = '#f8fafc'
      circle(ctx, hx, hy, 7)
      ctx.fill()
    }
    ctx.restore()
  }
}

// -- a bugler ---------------------------------------------------------------------------------------

function bugler(playing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const x = 76
    dressBlues(ctx, x, [-0.04, 0.04], color, color2)
    limb(ctx, x - 22, 88, 32, 34, -0.12, 0.1, 10, shade(color, -0.2))
    ctx.fillStyle = '#f8fafc'
    circle(ctx, x - 26, 152, 7)
    ctx.fill()
    guardHead(ctx, x, color, color2)
    const brass = (bx: number, by: number, a: number) => {
      ctx.save()
      ctx.translate(bx, by)
      ctx.rotate(a)
      const g = ctx.createLinearGradient(0, -6, 0, 6)
      g.addColorStop(0, '#fde68a')
      g.addColorStop(0.5, '#eab308')
      g.addColorStop(1, '#a16207')
      ctx.strokeStyle = g
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(40, 0)
      ctx.quadraticCurveTo(52, 0, 52, 10)
      ctx.quadraticCurveTo(52, 20, 30, 20)
      ctx.lineTo(18, 20)
      ctx.stroke()
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(40, -2)
      ctx.lineTo(66, -14)
      ctx.lineTo(66, 14)
      ctx.lineTo(40, 2)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#fef9c3'
      ellipse(ctx, 66, 0, 3, 14)
      ctx.fill()
      // The cord and tassel.
      ctx.strokeStyle = color2
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(22, 20)
      ctx.quadraticCurveTo(28, 34, 36, 22)
      ctx.stroke()
      ctx.restore()
    }
    if (playing) {
      // Raised to his lips, swaying gently with the long notes.
      const sway = Math.sin(p) * 0.04
      brass(x + 18, 66, -0.12 + sway)
      const [hx, hy] = limb(ctx, x + 22, 88, 26, 24, 1.6, -1.9, 10, color)
      ctx.fillStyle = '#f8fafc'
      circle(ctx, hx, hy, 7)
      ctx.fill()
    } else {
      // Held at his side.
      limb(ctx, x + 22, 88, 30, 30, 0.15, 0.4, 10, color)
      brass(x + 26, 150, 1.45)
      ctx.fillStyle = '#f8fafc'
      circle(ctx, x + 34, 148, 7)
      ctx.fill()
    }
  }
}

// -- jets flying over -------------------------------------------------------------------------------

function jet(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  // Afterburner, flickering.
  const flame = 0.8 + 0.2 * Math.sin(f * 2.4)
  glow(ctx, 22, 60, 26 * flame, color2, 0.8)
  ctx.fillStyle = '#fef9c3'
  ellipse(ctx, 24, 60, 14 * flame, 5)
  ctx.fill()
  const g = ctx.createLinearGradient(0, 36, 0, 82)
  g.addColorStop(0, shade(color, 0.35))
  g.addColorStop(0.5, color)
  g.addColorStop(1, shade(color, -0.4))
  ctx.fillStyle = g
  // Fuselage, sharp at the nose.
  ctx.beginPath()
  ctx.moveTo(34, 52)
  ctx.lineTo(220, 48)
  ctx.quadraticCurveTo(272, 52, 296, 60)
  ctx.quadraticCurveTo(272, 68, 220, 72)
  ctx.lineTo(34, 70)
  ctx.closePath()
  ctx.fill()
  // Tail fin and tailplane.
  ctx.fillStyle = shade(color, -0.1)
  ctx.beginPath()
  ctx.moveTo(48, 52)
  ctx.lineTo(26, 6)
  ctx.lineTo(52, 6)
  ctx.lineTo(96, 50)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = shade(color, -0.3)
  ctx.beginPath()
  ctx.moveTo(40, 66)
  ctx.lineTo(16, 82)
  ctx.lineTo(44, 82)
  ctx.lineTo(84, 66)
  ctx.closePath()
  ctx.fill()
  // The wing, swept back.
  ctx.fillStyle = shade(color, -0.2)
  ctx.beginPath()
  ctx.moveTo(110, 66)
  ctx.lineTo(70, 104)
  ctx.lineTo(102, 104)
  ctx.lineTo(176, 68)
  ctx.closePath()
  ctx.fill()
  // Canopy.
  const c = ctx.createLinearGradient(0, 36, 0, 54)
  c.addColorStop(0, '#e0f2fe')
  c.addColorStop(1, '#0369a1')
  ctx.fillStyle = c
  ctx.beginPath()
  ctx.moveTo(196, 50)
  ctx.quadraticCurveTo(222, 30, 252, 50)
  ctx.closePath()
  ctx.fill()
  // Roundel and a star on the fin.
  ctx.fillStyle = '#1e3a8a'
  circle(ctx, 140, 60, 8)
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 2.6 : 6.4
    const a = (k / 10) * TAU - Math.PI / 2
    k ? ctx.lineTo(140 + Math.cos(a) * r, 60 + Math.sin(a) * r) : ctx.moveTo(140 + Math.cos(a) * r, 60 + Math.sin(a) * r)
  }
  ctx.fill()
  ctx.fillStyle = '#dc2626'
  ctx.fillRect(150, 58, 14, 4)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(60, 52, 150, 2)
}

/** A puff of coloured smoke: red, white and blue. */
function smoke(ctx: Ctx, f: number) {
  const c = ['#ef4444', '#f8fafc', '#3b82f6'][f % 3]
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30)
  g.addColorStop(0, rgba(c, 0.85))
  g.addColorStop(0.6, rgba(c, 0.45))
  g.addColorStop(1, rgba(c, 0))
  ctx.fillStyle = g
  circle(ctx, 32, 32, 30)
  ctx.fill()
}

// -- a bald eagle on the roof -----------------------------------------------------------------------

function perchedEagle(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const look = [-1, 0, 1, 0][f]
  const spread = f === 3
  const body = color
  if (spread) {
    // Wings out wide, calling.
    for (const k of [-1, 1]) {
      ctx.fillStyle = shade(body, -0.15)
      ctx.beginPath()
      ctx.moveTo(100, 96)
      ctx.quadraticCurveTo(100 + k * 60, 30, 100 + k * 98, 26)
      for (let j = 0; j < 5; j++) ctx.lineTo(100 + k * (96 - j * 10), 40 + j * 16 + (j % 2) * 8)
      ctx.quadraticCurveTo(100 + k * 30, 140, 100, 130)
      ctx.closePath()
      ctx.fill()
    }
  }
  // Body and folded wings, feathers layered.
  const g = ctx.createLinearGradient(0, 70, 0, 200)
  g.addColorStop(0, shade(body, 0.15))
  g.addColorStop(1, shade(body, -0.35))
  ctx.fillStyle = g
  ellipse(ctx, 100, 136, 38, 58)
  ctx.fill()
  ctx.strokeStyle = rgba('#000000', 0.25)
  ctx.lineWidth = 2
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 4; k++) {
      ctx.beginPath()
      ctx.arc(80 + k * 13, 110 + r * 18, 8, 0.2, Math.PI - 0.2)
      ctx.stroke()
    }
  }
  // Tail, white, over the edge.
  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.moveTo(84, 186)
  ctx.lineTo(116, 186)
  ctx.lineTo(112, 218)
  ctx.lineTo(88, 218)
  ctx.closePath()
  ctx.fill()
  // Talons gripping.
  ctx.strokeStyle = color2
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  for (const k of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(100 + k * 14, 184)
    ctx.lineTo(100 + k * 16, 198)
    ctx.stroke()
    ctx.strokeStyle = '#1c1917'
    ctx.lineWidth = 3
    for (let j = -1; j <= 1; j++) {
      ctx.beginPath()
      ctx.moveTo(100 + k * 16, 198)
      ctx.lineTo(100 + k * 16 + j * 7, 206)
      ctx.stroke()
    }
    ctx.strokeStyle = color2
    ctx.lineWidth = 6
  }
  // The white head, turned, the hooked yellow beak and a fierce eye.
  const hx = 100 + look * 8
  ctx.fillStyle = '#f8fafc'
  ellipse(ctx, hx, 70, 26, 24)
  ctx.fill()
  ctx.fillStyle = '#e2e8f0'
  for (let k = 0; k < 6; k++) {
    ctx.beginPath()
    ctx.moveTo(hx - 22 + k * 9, 86)
    ctx.lineTo(hx - 18 + k * 9, 100)
    ctx.lineTo(hx - 14 + k * 9, 86)
    ctx.fill()
  }
  const dir = look === 0 ? 1 : look
  const bx = look === 0 ? hx : hx + dir * 22
  ctx.fillStyle = color2
  ctx.beginPath()
  if (look === 0) {
    ctx.moveTo(hx - 8, 76)
    ctx.lineTo(hx + 8, 76)
    ctx.quadraticCurveTo(hx + 4, 96, hx, 98)
    ctx.quadraticCurveTo(hx - 4, 96, hx - 8, 76)
  } else {
    ctx.moveTo(bx - dir * 10, 70)
    ctx.quadraticCurveTo(bx + dir * 12, 68, bx + dir * 16, 82)
    ctx.lineTo(bx + dir * 8, 80)
    ctx.lineTo(bx - dir * 8, 84)
  }
  ctx.closePath()
  ctx.fill()
  if (spread) {
    ctx.fillStyle = '#7f1d1d'
    ellipse(ctx, bx + dir * 4, 82, 5, 3)
    ctx.fill()
  }
  for (const k of look === 0 ? [-1, 1] : [dir]) {
    const ex = look === 0 ? hx + k * 11 : hx + dir * 8
    ctx.fillStyle = '#facc15'
    circle(ctx, ex, 64, 4.5)
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, ex + (look === 0 ? 0 : dir), 64, 2.2)
    ctx.fill()
    ctx.strokeStyle = '#475569'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(ex - 7, 58 + (look === 0 ? k * -1 : 0))
    ctx.lineTo(ex + 7, 60)
    ctx.stroke()
  }
}

// -- Diwali ---------------------------------------------------------------------------------------

function rangoli(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  // Drawn ring by ring from the middle out, as people come; lamps round the edge lit at the end.
  const k = f / (frames - 1)
  const cx = 150
  const cy = 60
  const sy = 0.38
  const palette = [color, color2, '#22c55e', '#3b82f6', '#a855f7', '#f97316']
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(1, sy)
  const rings = 6
  for (let r = rings - 1; r >= 0; r--) {
    const q = Math.max(0, Math.min(1, k * rings - r))
    if (q <= 0) continue
    const R = 20 + r * 22
    const petals = 8 + r * 4
    ctx.fillStyle = palette[r % palette.length]
    for (let j = 0; j < Math.round(petals * q); j++) {
      const a = (j / petals) * TAU + r * 0.2
      ctx.save()
      ctx.rotate(a)
      ctx.beginPath()
      ctx.moveTo(R - 12, 0)
      ctx.quadraticCurveTo(R + 2, -9 - r, R + 16, 0)
      ctx.quadraticCurveTo(R + 2, 9 + r, R - 12, 0)
      ctx.fill()
      ctx.restore()
    }
    // A ring of white dots between the colours, as drawn in rice flour.
    ctx.fillStyle = '#fafaf9'
    const dots = petals * 2
    for (let j = 0; j < Math.round(dots * q); j++) {
      const a = (j / dots) * TAU
      circle(ctx, Math.cos(a) * (R - 14), Math.sin(a) * (R - 14), 2.4)
      ctx.fill()
    }
  }
  // The flower in the middle.
  if (k > 0) {
    ctx.fillStyle = color2
    circle(ctx, 0, 0, 14)
    ctx.fill()
    ctx.fillStyle = color
    circle(ctx, 0, 0, 7)
    ctx.fill()
  }
  ctx.restore()
  // Diyas round it, lit once it is finished.
  if (k >= 0.99) {
    for (let j = 0; j < 8; j++) {
      const a = (j / 8) * TAU
      const x = cx + Math.cos(a) * 140
      const y = cy + Math.sin(a) * 140 * sy
      ctx.fillStyle = '#c2410c'
      ctx.beginPath()
      ctx.ellipse(x, y, 9, 4, 0, 0, Math.PI)
      ctx.fill()
      glow(ctx, x, y - 8, 16, '#fde047', 0.9)
      ctx.fillStyle = '#fef9c3'
      ellipse(ctx, x, y - 7, 2.5, 5)
      ctx.fill()
    }
  }
}

function starLantern(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const cx = 70
  const cy = 90
  // A paper star, five points, lit from within.
  glow(ctx, cx, cy, 90, color2, 0.35 + 0.08 * Math.sin(p))
  for (let j = 0; j < 5; j++) {
    const a = (j / 5) * TAU - Math.PI / 2
    const b = a + TAU / 10
    const c = a - TAU / 10
    for (const [side, k] of [[b, 0.18], [c, -0.2]] as const) {
      ctx.fillStyle = shade(color, k)
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(a) * 64, cy + Math.sin(a) * 64)
      ctx.lineTo(cx + Math.cos(side) * 26, cy + Math.sin(side) * 26)
      ctx.closePath()
      ctx.fill()
    }
  }
  // Glowing middle and a paper rim.
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 30)
  g.addColorStop(0, '#fffbeb')
  g.addColorStop(1, rgba(color2, 0))
  ctx.fillStyle = g
  circle(ctx, cx, cy, 30)
  ctx.fill()
  ctx.strokeStyle = color2
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let j = 0; j <= 10; j++) {
    const a = (j / 10) * TAU - Math.PI / 2
    const r = j % 2 ? 26 : 64
    j ? ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  }
  ctx.stroke()
  // Paper tassels from the lower points, swaying.
  for (const j of [1, 2, 3, 4]) {
    const a = (j / 5) * TAU - Math.PI / 2
    if (Math.sin(a) < 0.1) continue
    const x = cx + Math.cos(a) * 64
    const y = cy + Math.sin(a) * 64
    ctx.strokeStyle = color2
    ctx.lineWidth = 2.5
    for (let t = -1; t <= 1; t++) {
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.quadraticCurveTo(x + t * 4 + Math.sin(p + j) * 4, y + 30, x + t * 6 + Math.sin(p + j) * 8, y + 56)
      ctx.stroke()
    }
  }
  ctx.strokeStyle = color2
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx, 4)
  ctx.lineTo(cx, 26)
  ctx.stroke()
}

function elephant(raised: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const s = Math.sin(p)
    const c = Math.cos(p)
    const hide = '#94a3b8'
    const far = shade(hide, -0.25)
    // Far legs, then body.
    for (const [x, ph] of [[78, 0], [182, Math.PI]] as const) {
      ctx.fillStyle = far
      const a = raised ? 0 : Math.sin(p + ph) * 0.18
      ctx.save()
      ctx.translate(x, 140)
      ctx.rotate(a)
      ctx.fillRect(-12, 0, 24, 64)
      ctx.restore()
    }
    const g = ctx.createLinearGradient(0, 60, 0, 170)
    g.addColorStop(0, shade(hide, 0.2))
    g.addColorStop(1, shade(hide, -0.35))
    ctx.fillStyle = g
    ellipse(ctx, 124, 116, 86, 56)
    ctx.fill()
    // Tail.
    ctx.strokeStyle = shade(hide, -0.3)
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(40, 110)
    ctx.quadraticCurveTo(28, 130 + s * 6, 32, 150)
    ctx.stroke()
    // The caparison: a cloth over its back, gold edged, with tassels.
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(70, 70)
    ctx.quadraticCurveTo(124, 54, 178, 70)
    ctx.lineTo(172, 150)
    ctx.quadraticCurveTo(124, 160, 76, 150)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = color2
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.fillStyle = color2
    for (let k = 0; k < 7; k++) {
      const x = 80 + k * 15
      circle(ctx, x, 154 + Math.sin(k * 1.3) * 2, 4)
      ctx.fill()
      ctx.fillRect(x - 1.5, 156, 3, 10 + s * 2)
    }
    for (const [x, y] of [[100, 100], [148, 100], [124, 124]] as const) {
      ctx.fillStyle = shade(color2, 0.2)
      for (let j = 0; j < 6; j++) {
        const a = (j / 6) * TAU
        ellipse(ctx, x + Math.cos(a) * 8, y + Math.sin(a) * 8, 6, 3, a)
        ctx.fill()
      }
      ctx.fillStyle = '#dc2626'
      circle(ctx, x, y, 4)
      ctx.fill()
    }
    // Near legs, with anklets.
    for (const [x, ph] of [[92, Math.PI], [196, 0]] as const) {
      const a = raised ? (x > 150 ? -0.3 + 0.1 * s : 0) : Math.sin(p + ph) * 0.18
      ctx.save()
      ctx.translate(x, 140)
      ctx.rotate(a)
      ctx.fillStyle = shade(hide, -0.05)
      ctx.fillRect(-13, 0, 26, 66)
      ctx.fillStyle = '#e2e8f0'
      ellipse(ctx, 0, 66, 15, 6)
      ctx.fill()
      ctx.fillStyle = color2
      ctx.fillRect(-13, 48, 26, 5)
      ctx.restore()
    }
    // Head, big ear, and the trunk: swinging as it walks, or raised to trumpet.
    ctx.fillStyle = shade(hide, 0.05)
    ellipse(ctx, 206, 88, 36, 40)
    ctx.fill()
    ctx.fillStyle = shade(hide, -0.15)
    ctx.beginPath()
    ctx.moveTo(196, 58)
    ctx.quadraticCurveTo(150 + c * 4, 50, 156, 110)
    ctx.quadraticCurveTo(170, 132, 198, 118)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = shade(color, 0.2)
    ellipse(ctx, 176, 92, 12, 18, 0.2)
    ctx.fill()
    ctx.strokeStyle = shade(hide, 0.05)
    ctx.lineCap = 'round'
    ctx.lineWidth = 20
    ctx.beginPath()
    ctx.moveTo(228, 96)
    if (raised) {
      ctx.quadraticCurveTo(250, 70, 244, 34 + s * 4)
      ctx.quadraticCurveTo(240, 14, 254, 8)
    } else {
      ctx.quadraticCurveTo(240 + s * 6, 140, 232 + s * 10, 176)
      ctx.quadraticCurveTo(230 + s * 10, 190, 242 + s * 8, 192)
    }
    ctx.stroke()
    ctx.strokeStyle = rgba('#1e293b', 0.3)
    ctx.lineWidth = 2
    for (let k = 0; k < 5; k++) {
      ctx.beginPath()
      if (raised) ctx.arc(240, 70 - k * 9, 9, 0, Math.PI)
      else ctx.arc(234 + s * k * 1.5, 116 + k * 12, 9, Math.PI, TAU)
      ctx.stroke()
    }
    // Painted patterns on its forehead and trunk, a gold headpiece, a tusk and an eye.
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(186, 52)
    ctx.lineTo(232, 52)
    ctx.lineTo(214, 92)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#dc2626'
    circle(ctx, 210, 64, 5)
    ctx.fill()
    ctx.fillStyle = '#ec4899'
    for (let k = 0; k < 3; k++) {
      circle(ctx, 222, 104 + k * 10, 3)
      ctx.fill()
    }
    ctx.fillStyle = '#fefce8'
    ctx.beginPath()
    ctx.moveTo(220, 112)
    ctx.quadraticCurveTo(236, 128, 254, 124)
    ctx.quadraticCurveTo(236, 118, 228, 106)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#1c1917'
    circle(ctx, 214, 84, 3.5)
    ctx.fill()
    if (raised) {
      // Petals blown up out of the trunk.
      for (let k = 0; k < 6; k++) {
        const q = ((f / frames) + k / 6) % 1
        ctx.fillStyle = ['#f97316', '#facc15', '#ec4899'][k % 3]
        ellipse(ctx, 256 + Math.sin(k * 2 + q * 6) * 12 * q, 6 - q * 4 + k, 4, 2.5, k)
        ctx.fill()
      }
    }
  }
}

// -- the rows each style is made of ------------------------------------------------------------

const BUBBLE = { id: 'bubble', frames: 1, w: 360, h: 140 }

export const AUTUMN_ROWS: Record<string, SpriteRow[]> = {
  'honor-guard': [
    { id: 'main', frames: 8, w: 170, h: 260, paint: honorGuard(false) },
    // Halted at attention, saluting.
    { id: 'halt', frames: 4, w: 170, h: 260, paint: honorGuard(true) },
    SPARKLE,
  ],
  buglers: [
    { id: 'main', frames: 2, w: 160, h: 250, paint: bugler(false) },
    { id: 'act', frames: 4, w: 160, h: 250, paint: bugler(true) },
    { id: 'note', frames: 2, w: 64, h: 64, paint: note },
    SPARKLE,
  ],
  'fighter-jets': [
    { id: 'main', frames: 4, w: 300, h: 110, paint: jet },
    { id: 'smoke', frames: 3, w: 64, h: 64, paint: smoke },
    SPARKLE,
  ],
  // Looking left, ahead, right, then wings spread calling.
  'perched-eagles': [
    { id: 'main', frames: 4, w: 200, h: 220, paint: perchedEagle },
    { id: 'fly', frames: 8, w: 320, h: 180, paint: eagle },
    { ...BUBBLE, paint: saying('Skreee!') },
    SPARKLE,
  ],
  // Bare ground, to the whole pattern drawn and its lamps lit.
  rangoli: [{ id: 'main', frames: 10, w: 300, h: 120, paint: rangoli }, SPARKLE],
  'star-lanterns': [
    { id: 'main', frames: 8, w: 140, h: 220, paint: starLantern },
    { id: 'thread', frames: 1, w: 8, h: 256, paint: ribbon },
    SPARKLE,
  ],
  elephants: [
    { id: 'main', frames: 8, w: 270, h: 210, paint: elephant(false) },
    { id: 'wave', frames: 8, w: 270, h: 210, paint: elephant(true) },
    { ...BUBBLE, paint: saying('Happy Diwali!') },
    SPARKLE,
  ],
}
