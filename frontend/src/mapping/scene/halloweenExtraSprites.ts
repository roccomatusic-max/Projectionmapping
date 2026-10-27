/**
 * More for Halloween: a pumpkin carver, a mad scientist, singing jack-o'-lanterns, a portrait whose eyes follow
 * you, a sarcophagus that opens, apple bobbing, a grave digger, a phantom organist, a man turning into a werewolf,
 * a skeleton in a lawn chair dressed for the real temperature, a skeleton photographer, a ghostly tea party, a
 * witch casting a spell and a scaredy ghost.
 *
 * Painted the same way as sprites.ts: facing right, one frame at a time, into a cell of w by h design units.
 */

import { jackOLantern } from './halloweenSprites'
import { arm, dot, head, rr, standing, type Dress } from './figures'
import {
  circle, ellipse, rgba, saying, shade, SPARKLE, TAU,
  type Ctx, type SpriteColors, type SpriteRow,
} from './sprites'

const PEACH = '#f5c9a0'
const BONE = '#f1f5f9'

/** A skull at (x, y) of radius r, turned to dir, its jaw open by jaw (0 to 1). */
function skull(ctx: Ctx, x: number, y: number, r: number, dir: number, jaw = 0) {
  ctx.fillStyle = BONE
  circle(ctx, x, y, r)
  ctx.fill()
  rr(ctx, x - r * 0.55 + dir * r * 0.15, y + r * 0.5 + jaw * r * 0.3, r * 1.1, r * 0.45, r * 0.15)
  ctx.fillStyle = '#334155'
  for (const k of [-1, 1]) {
    ellipse(ctx, x + dir * r * 0.2 + k * r * 0.36, y + r * 0.05, r * 0.24, r * 0.28)
    ctx.fill()
  }
  ctx.beginPath()
  ctx.moveTo(x + dir * r * 0.2, y + r * 0.35)
  ctx.lineTo(x + dir * r * 0.2 - r * 0.1, y + r * 0.5)
  ctx.lineTo(x + dir * r * 0.2 + r * 0.1, y + r * 0.5)
  ctx.fill()
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 1.2
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath()
    ctx.moveTo(x + dir * r * 0.15 + k * r * 0.18, y + r * 0.62 + jaw * r * 0.3)
    ctx.lineTo(x + dir * r * 0.15 + k * r * 0.18, y + r * 0.86 + jaw * r * 0.3)
    ctx.stroke()
  }
}

/** A skeleton's arm or leg through the points, bone white with knobbly joints. */
function bones(ctx: Ctx, pts: number[], w = 5) {
  arm(ctx, pts, w, BONE)
  for (let k = 2; k < pts.length; k += 2) dot(ctx, pts[k], pts[k + 1], w * 0.7, BONE)
}

/** A skeleton's ribcage centred at (x, y). */
function ribs(ctx: Ctx, x: number, y: number) {
  ctx.strokeStyle = BONE
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(x, y - 26)
  ctx.lineTo(x, y + 22)
  ctx.stroke()
  ctx.lineWidth = 3
  for (let k = 0; k < 4; k++) {
    const yy = y - 18 + k * 10
    const w = 16 - k * 2
    ctx.beginPath()
    ctx.moveTo(x - w, yy + 4)
    ctx.quadraticCurveTo(x, yy - 4, x + w, yy + 4)
    ctx.stroke()
  }
  ctx.fillStyle = BONE
  ellipse(ctx, x, y + 26, 14, 6)
  ctx.fill()
}

// -- a pumpkin carver -------------------------------------------------------------------------------------

function pumpkinCarver(lit: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 216
    // The table, the pumpkin on it: carving away, then lit and leering for people.
    ctx.fillStyle = '#a16207'
    rr(ctx, 100, g - 70, 110, 8, 3)
    ctx.fillRect(108, g - 62, 6, 62)
    ctx.fillRect(196, g - 62, 6, 62)
    const glow = lit ? Math.min(1, p / 0.25) : 0
    if (glow > 0) {
      const gr = ctx.createRadialGradient(160, g - 104, 4, 160, g - 104, 70)
      gr.addColorStop(0, rgba(color2, 0.5 * glow))
      gr.addColorStop(1, rgba(color2, 0))
      ctx.fillStyle = gr
      circle(ctx, 160, g - 104, 70)
      ctx.fill()
    }
    jackOLantern(ctx, 160, g - 104, 36, color2, glow > 0.5 ? (p > 0.6 ? 'laugh' : 'boo') : 'dark', 0)
    if (!lit) {
      // Half the face cut so far, shown as dark slits.
      ctx.fillStyle = '#7c2d12'
      ctx.beginPath()
      ctx.moveTo(146, g - 116)
      ctx.lineTo(154, g - 104)
      ctx.lineTo(138, g - 104)
      ctx.fill()
    }
    // The carver: leaning in with the knife, or jumping back with hands up.
    const d: Dress = { skin: PEACH, hair: '#78350f', shirt: color, pants: '#1e3a8a' }
    const back = lit ? Math.min(1, p / 0.3) : 0
    const x = 80 - back * 22
    const hop = lit ? Math.sin(Math.min(1, p / 0.3) * Math.PI) * 10 : 0
    standing(ctx, x, g - hop, 1, d, { open: lit ? 0.9 : 0 })
    if (lit) {
      arm(ctx, [x - 10, g - 98 - hop, x - 18, g - 120 - hop, x - 14, g - 140 - hop], 9, d.shirt)
      arm(ctx, [x + 10, g - 98 - hop, x + 20, g - 120 - hop, x + 18, g - 140 - hop], 9, d.shirt)
      dot(ctx, x - 14, g - 142 - hop, 5, d.skin)
      dot(ctx, x + 18, g - 142 - hop, 5, d.skin)
    } else {
      const cut = Math.sin(p * TAU * 2) * 4
      arm(ctx, [x + 10, g - 98, x + 30, g - 92, 136 + cut, g - 108 + cut], 9, d.shirt)
      ctx.strokeStyle = '#cbd5e1'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(136 + cut, g - 108 + cut)
      ctx.lineTo(146 + cut, g - 116 + cut)
      ctx.stroke()
      arm(ctx, [x - 10, g - 98, x + 10, g - 84, 130, g - 90], 9, shade(d.shirt, -0.15))
      // A pile of pulp and seeds.
      ctx.fillStyle = '#fb923c'
      ellipse(ctx, 196, g - 74, 10, 4)
      ctx.fill()
      for (let k = 0; k < 4; k++) dot(ctx, 190 + k * 4, g - 76, 1.5, '#fef3c7')
    }
  }
}

// -- a mad scientist -------------------------------------------------------------------------------------------

function madScientist(erupting: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 246
    // The bench with flasks bubbling.
    ctx.fillStyle = '#64748b'
    rr(ctx, 110, g - 80, 120, 8, 2)
    ctx.fillRect(118, g - 72, 6, 72)
    ctx.fillRect(216, g - 72, 6, 72)
    const flask = (x: number, c: string, h: number) => {
      ctx.fillStyle = rgba('#e0f2fe', 0.35)
      ctx.beginPath()
      ctx.moveTo(x - 4, g - 80 - h)
      ctx.lineTo(x + 4, g - 80 - h)
      ctx.lineTo(x + 4, g - 80 - h * 0.55)
      ctx.lineTo(x + 16, g - 80)
      ctx.lineTo(x - 16, g - 80)
      ctx.lineTo(x - 4, g - 80 - h * 0.55)
      ctx.fill()
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.moveTo(x - 10, g - 80 - h * 0.25)
      ctx.lineTo(x + 10, g - 80 - h * 0.25)
      ctx.lineTo(x + 16, g - 80)
      ctx.lineTo(x - 16, g - 80)
      ctx.fill()
      for (let k = 0; k < 3; k++) {
        const u = (p * 2 + k / 3 + x * 0.01) % 1
        dot(ctx, x - 3 + k * 3, g - 84 - u * h, 2.2, rgba(c, 1 - u))
      }
    }
    flask(140, color, 40)
    flask(204, color2, 30)
    // The big one in his hand: poured, then it boils over in a mushroom of smoke.
    const boom = erupting && p > 0.4 ? (p - 0.4) / 0.6 : 0
    if (boom > 0) {
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU
        const r = 10 + boom * 26
        ctx.fillStyle = rgba(k % 2 ? color : '#bef264', 0.75 * (1 - boom * 0.6))
        circle(ctx, 172 + Math.cos(a) * r, g - 150 - boom * 40 + Math.sin(a) * r * 0.6, 12 + boom * 10)
        ctx.fill()
      }
      ctx.strokeStyle = rgba('#bef264', 0.8)
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(172, g - 96)
      ctx.lineTo(172, g - 140 - boom * 30)
      ctx.stroke()
    }
    // The scientist in a lab coat, goggles up, hair wild (standing on end once it blows).
    const d: Dress = { skin: PEACH, hair: '#e5e7eb', shirt: '#f8fafc', pants: '#334155' }
    standing(ctx, 80, g, 1, d, { open: erupting ? 0.9 : 0.3, bald: true })
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(64, g - 104)
    ctx.lineTo(96, g - 104)
    ctx.lineTo(102, g - 40)
    ctx.lineTo(58, g - 40)
    ctx.fill()
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(80, g - 100)
    ctx.lineTo(80, g - 42)
    ctx.stroke()
    const wild = erupting && boom > 0 ? 1.6 : 1
    for (let k = 0; k < 7; k++) {
      const a = Math.PI + (k / 6) * Math.PI
      ctx.strokeStyle = '#e5e7eb'
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(82 + Math.cos(a) * 12, g - 124 + Math.sin(a) * 12)
      ctx.lineTo(82 + Math.cos(a) * (24 * wild) + Math.sin(f + k) * 2, g - 124 + Math.sin(a) * (22 * wild))
      ctx.stroke()
    }
    ctx.fillStyle = '#334155'
    ctx.fillRect(66, g - 134, 34, 4)
    for (const x of [74, 92]) {
      dot(ctx, x, g - 134, 6, '#334155')
      dot(ctx, x, g - 134, 4, color2)
    }
    arm(ctx, [70, g - 98, 62, g - 76, 64, g - 60], 9, '#f8fafc')
    const lift = erupting ? Math.min(1, p / 0.4) : Math.sin(p * TAU) * 0.2
    const hx = 150 + lift * 14
    const hy = g - 100 - lift * 6
    arm(ctx, [90, g - 98, 120, g - 98, hx, hy], 9, '#f8fafc')
    ctx.save()
    ctx.translate(hx + 16, hy)
    ctx.rotate(erupting ? lift * 0.9 : 0.2)
    ctx.fillStyle = rgba('#e0f2fe', 0.4)
    rr(ctx, -6, -24, 12, 30, 4)
    ctx.fillStyle = color
    rr(ctx, -6, -6, 12, 12, 4)
    ctx.restore()
    if (erupting && p < 0.45) {
      ctx.strokeStyle = color
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(hx + 26, hy - 6)
      ctx.quadraticCurveTo(hx + 30, hy + 10, 172, g - 96)
      ctx.stroke()
    }
  }
}

// -- singing jack-o'-lanterns -------------------------------------------------------------------------------

function singingPumpkins(loud: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color2 }: SpriteColors) => {
    const p = f / frames
    const g = 156
    // A hay bale they sit on.
    ctx.fillStyle = '#ca8a04'
    rr(ctx, 14, g - 44, 212, 44, 6)
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = 2
    for (let k = 0; k < 6; k++) {
      ctx.beginPath()
      ctx.moveTo(20 + k * 36, g - 40)
      ctx.lineTo(26 + k * 36, g - 4)
      ctx.stroke()
    }
    // Three jack-o'-lanterns, singing in turn; together and bouncing for people.
    const sizes = [26, 34, 22]
    ;[60, 120, 184].forEach((x, k) => {
      const on = loud || Math.floor(p * 4) % 3 === k
      const bob = on ? Math.abs(Math.sin(p * TAU * (loud ? 2 : 1) + k)) * (loud ? 10 : 5) : 0
      const r = sizes[k]
      jackOLantern(ctx, x, g - 44 - r * 0.82 - bob, r, color2, on ? (f % 2 ? 'boo' : 'laugh') : 'grin', k === 0 ? 0.4 : k === 2 ? -0.4 : 0)
    })
  }
}

// -- a haunted portrait --------------------------------------------------------------------------------------------

/** Frame 0 looks left, 1 ahead, 2 right, 3 the face drops away to a screaming skull. */
function hauntedPortrait(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const cx = 90
  const cy = 112
  // The gilt frame, curled corners.
  ctx.fillStyle = color2
  rr(ctx, 10, 10, 160, 204, 10)
  ctx.fillStyle = shade(color2, -0.25)
  rr(ctx, 22, 22, 136, 180, 6)
  for (const [x, y] of [[16, 16], [164, 16], [16, 208], [164, 208]] as const) dot(ctx, x, y, 10, color2)
  // The painting: a dim green-grey ground lit by a candle (pale enough to show), the sitter in a high collar.
  ctx.fillStyle = '#4b5563'
  ctx.fillRect(28, 28, 124, 168)
  const gr = ctx.createRadialGradient(cx, cy - 20, 10, cx, cy - 20, 90)
  gr.addColorStop(0, '#9ca3af')
  gr.addColorStop(1, '#4b5563')
  ctx.fillStyle = gr
  ctx.fillRect(28, 28, 124, 168)
  ctx.save()
  ctx.beginPath()
  ctx.rect(28, 28, 124, 168)
  ctx.clip()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(cx - 52, 196)
  ctx.quadraticCurveTo(cx - 48, cy + 30, cx, cy + 22)
  ctx.quadraticCurveTo(cx + 48, cy + 30, cx + 52, 196)
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.moveTo(cx - 16, cy + 16)
  ctx.lineTo(cx, cy + 40)
  ctx.lineTo(cx + 16, cy + 16)
  ctx.fill()
  if (f === 3) {
    skull(ctx, cx, cy - 18, 28, 1, 1)
    ctx.fillStyle = '#f87171'
    for (const k of [-1, 1]) dot(ctx, cx + 6 + k * 10, cy - 16, 3, '#f87171')
  } else {
    // A long pale face, hair in a severe bun, and eyes that follow you.
    ctx.fillStyle = '#e7d7c1'
    ellipse(ctx, cx, cy - 18, 24, 31)
    ctx.fill()
    ctx.fillStyle = '#1f2937'
    ctx.beginPath()
    ctx.ellipse(cx, cy - 32, 26, 22, 0, Math.PI, 0)
    ctx.fill()
    dot(ctx, cx, cy - 58, 12, '#1f2937')
    const look = f - 1
    for (const k of [-1, 1]) {
      ctx.fillStyle = '#f8fafc'
      ellipse(ctx, cx + k * 10, cy - 18, 7, 4.5)
      ctx.fill()
      dot(ctx, cx + k * 10 + look * 4, cy - 18, 3, '#111827')
    }
    ctx.strokeStyle = '#7f1d1d'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx - 8, cy + 2)
    ctx.lineTo(cx + 8, cy + 2)
    ctx.stroke()
  }
  ctx.restore()
}

// -- a sarcophagus -------------------------------------------------------------------------------------------

/** Level: the lid sliding aside, glowing eyes in the dark, then the mummy's hand reaching out. */
function sarcophagus(ctx: Ctx, f: number, n: number, { color, color2 }: SpriteColors) {
  const k = f / (n - 1)
  const x = 92
  const top = 16
  const g = 256
  const coffin = () => {
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.quadraticCurveTo(x + 44, top + 4, x + 46, top + 70)
    ctx.lineTo(x + 36, g - 4)
    ctx.lineTo(x - 36, g - 4)
    ctx.lineTo(x - 46, top + 70)
    ctx.quadraticCurveTo(x - 44, top + 4, x, top)
  }
  // The inside: dark with a pale mummy you can only make out by its wrappings and eyes.
  ctx.fillStyle = '#1f2937'
  coffin()
  ctx.fill()
  ctx.save()
  coffin()
  ctx.clip()
  ctx.strokeStyle = '#d6d3d1'
  ctx.lineWidth = 5
  for (let j = 0; j < 14; j++) {
    ctx.beginPath()
    ctx.moveTo(x - 28, top + 40 + j * 14)
    ctx.lineTo(x + 28, top + 34 + j * 14 + (j % 2) * 8)
    ctx.stroke()
  }
  if (k > 0.2) {
    for (const s of [-1, 1]) dot(ctx, x + s * 10, top + 56, 4 + k * 2, rgba('#facc15', 0.6 + k * 0.4))
  }
  ctx.restore()
  // The lid, sliding to the side and tipping.
  ctx.save()
  ctx.translate(k * 52, 0)
  ctx.translate(x, g)
  ctx.rotate(k * 0.08)
  ctx.translate(-x, -g)
  ctx.fillStyle = color2
  coffin()
  ctx.fill()
  ctx.fillStyle = color
  ellipse(ctx, x, top + 48, 24, 30)
  ctx.fill()
  ctx.fillStyle = '#fde68a'
  ellipse(ctx, x, top + 52, 14, 20)
  ctx.fill()
  ctx.fillStyle = '#111827'
  for (const s of [-1, 1]) {
    ellipse(ctx, x + s * 6, top + 48, 3.5, 2)
    ctx.fill()
  }
  for (let j = 0; j < 6; j++) {
    ctx.fillStyle = j % 2 ? color : '#facc15'
    ctx.fillRect(x - 30 + j, top + 92 + j * 20, 60 - j * 2, 8)
  }
  ctx.fillStyle = '#facc15'
  ctx.beginPath()
  ctx.moveTo(x - 30, top + 84)
  ctx.lineTo(x + 30, top + 84)
  ctx.lineTo(x, top + 74)
  ctx.fill()
  ctx.restore()
  if (k >= 1) {
    // A wrapped hand reaching out of the gap.
    arm(ctx, [x - 10, top + 120, x - 40, top + 126, x - 64, top + 118], 10, '#d6d3d1')
    for (let j = 0; j < 4; j++) arm(ctx, [x - 64, top + 118, x - 76, top + 110 + j * 5], 4, '#d6d3d1')
  }
}

// -- bobbing for apples -------------------------------------------------------------------------------------

function appleBobbing(got: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 196
    // The washtub of water (pale, so it shows) with apples bobbing.
    ctx.fillStyle = '#94a3b8'
    ctx.beginPath()
    ctx.moveTo(110, g - 56)
    ctx.lineTo(206, g - 56)
    ctx.lineTo(196, g)
    ctx.lineTo(120, g)
    ctx.fill()
    ctx.fillStyle = rgba('#7dd3fc', 0.8)
    ellipse(ctx, 158, g - 56, 48, 8)
    ctx.fill()
    const dunk = got ? Math.sin(Math.min(1, p / 0.6) * Math.PI) : Math.sin(p * TAU) * 0.15 + 0.15
    for (let k = 0; k < 4; k++) {
      if (got && p > 0.5 && k === 1) continue
      const ax = 128 + k * 20
      const ay = g - 58 + Math.sin(p * TAU + k * 2) * 2
      dot(ctx, ax, ay, 8, k % 2 ? color2 : '#dc2626')
      arm(ctx, [ax, ay - 7, ax + 2, ay - 12], 2, '#78350f')
    }
    if (got && dunk > 0.3) {
      for (let k = 0; k < 6; k++) dot(ctx, 140 + k * 7, g - 66 - Math.abs(Math.sin(k + f)) * 10, 3, rgba('#bae6fd', 0.9))
    }
    // The child, hands behind their back, ducking in and coming up with an apple in their teeth.
    const d: Dress = { skin: PEACH, hair: '#ea580c', shirt: color, pants: '#475569' }
    const lean = 0.2 + dunk * 0.55
    for (const [sx, c] of [[-4, shade(d.pants!, -0.15)], [6, d.pants!]] as const) {
      arm(ctx, [90 + sx, g - 54, 90 + sx * 1.6, g - 28, 90 + sx * 2, g - 6], 11, c)
      ctx.fillStyle = '#475569'
      rr(ctx, 84 + sx * 2, g - 8, 18, 8, 3)
    }
    ctx.save()
    ctx.translate(90, g - 54)
    ctx.rotate(lean * 1.4)
    ctx.fillStyle = d.shirt
    rr(ctx, -15, -52, 30, 52, 10)
    arm(ctx, [-8, -44, -16, -20, -6, -6], 8, d.shirt)
    head(ctx, 2, -66, 16, d.skin, 1, { open: got && p > 0.5 ? 0.6 : 0, blink: dunk > 0.6 })
    ctx.fillStyle = d.hair
    ctx.beginPath()
    ctx.arc(2, -68, 17, Math.PI * 1.02, Math.PI * 1.98)
    ctx.fill()
    if (got && p > 0.5) {
      dot(ctx, 10, -54, 8, '#dc2626')
      arm(ctx, [10, -61, 12, -66], 2, '#78350f')
    }
    ctx.restore()
  }
}

// -- a grave digger ------------------------------------------------------------------------------------------

function graveDigger(scared: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 216
    // The headstone and the heap of earth (lightened so it shows).
    ctx.fillStyle = '#94a3b8'
    ctx.beginPath()
    ctx.moveTo(176, g - 30)
    ctx.lineTo(176, g - 92)
    ctx.quadraticCurveTo(200, g - 118, 224, g - 92)
    ctx.lineTo(224, g - 30)
    ctx.fill()
    ctx.strokeStyle = '#475569'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(192, g - 80)
    ctx.lineTo(208, g - 80)
    ctx.moveTo(200, g - 90)
    ctx.lineTo(200, g - 62)
    ctx.stroke()
    ctx.fillStyle = '#92400e'
    ellipse(ctx, 196, g - 22, 46, 22)
    ctx.fill()
    ctx.fillStyle = '#1f2937'
    ellipse(ctx, 140, g - 4, 36, 7)
    ctx.fill()
    // The skeleton popping up out of the hole for people.
    const up = scared ? Math.min(1, p / 0.3) : 0
    if (up > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, 240, g - 4)
      ctx.clip()
      const y = g + 40 - up * 90
      ribs(ctx, 140, y)
      skull(ctx, 140, y - 46, 15, -1, scared && f % 2 ? 0.6 : 0)
      bones(ctx, [128, y - 22, 116, y - 44, 110, y - 66])
      bones(ctx, [152, y - 22, 164, y - 44, 170, y - 66])
      ctx.restore()
    }
    // The digger: shovelling into the hole, or leaping back with his hat flying.
    const d: Dress = { skin: PEACH, hair: '#57534e', shirt: color, pants: color2 }
    const leap = scared ? Math.sin(Math.min(1, p / 0.4) * Math.PI) * 26 : 0
    const x = scared ? 66 - up * 20 : 70
    standing(ctx, x, g - leap, 1, d, { open: scared ? 0.9 : 0, stride: scared ? 0.6 : 0 })
    ctx.fillStyle = '#57534e'
    const hatUp = scared ? up * 30 : 0
    rr(ctx, x - 16, g - 134 - leap - hatUp, 36, 5, 2)
    rr(ctx, x - 9, g - 152 - leap - hatUp, 22, 18, 3)
    if (scared) {
      arm(ctx, [x - 10, g - 98 - leap, x - 22, g - 118 - leap, x - 18, g - 138 - leap], 9, d.shirt)
      arm(ctx, [x + 10, g - 98 - leap, x + 22, g - 118 - leap, x + 24, g - 138 - leap], 9, d.shirt)
    } else {
      const dig = Math.sin(p * TAU)
      const tx = 126 + dig * 6
      const ty = g - 10 - Math.max(0, -dig) * 24
      ctx.strokeStyle = '#a16207'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(x + 6, g - 110)
      ctx.lineTo(tx, ty)
      ctx.stroke()
      ctx.fillStyle = '#94a3b8'
      ctx.beginPath()
      ctx.ellipse(tx + 4, ty + 2, 9, 6, 0.6, 0, TAU)
      ctx.fill()
      arm(ctx, [x + 10, g - 98, x + 18, g - 92, x + 24 + (tx - x) * 0.2, g - 96 + (ty - g + 96) * 0.2], 9, d.shirt)
      arm(ctx, [x - 10, g - 98, x + 10, g - 80, x + 30 + (tx - x) * 0.4, g - 88 + (ty - g + 88) * 0.4], 9, shade(d.shirt, -0.15))
      if (dig < -0.6) for (let k = 0; k < 4; k++) dot(ctx, tx + 10 + k * 6, ty - 10 - k * 4, 3, '#92400e')
    }
  }
}

// -- a phantom organist ---------------------------------------------------------------------------------------

function phantomOrganist(wild: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 246
    // The pipes, the console and its keys.
    for (let k = 0; k < 9; k++) {
      const h = 70 + Math.sin((k / 8) * Math.PI) * 50
      ctx.fillStyle = shade(color2, k % 2 ? -0.15 : 0)
      rr(ctx, 120 + k * 13, g - 110 - h, 10, h, 3)
      ctx.fillStyle = '#1f2937'
      ctx.fillRect(122 + k * 13, g - 120, 6, 4)
    }
    ctx.fillStyle = '#7c2d12'
    rr(ctx, 112, g - 112, 126, 70, 4)
    ctx.fillStyle = '#f8fafc'
    rr(ctx, 118, g - 80, 112, 10, 2)
    ctx.fillStyle = '#111827'
    for (let k = 0; k < 14; k++) ctx.fillRect(122 + k * 8, g - 80, 3, 6)
    ctx.fillStyle = '#7c2d12'
    ctx.fillRect(118, g - 42, 8, 42)
    ctx.fillRect(224, g - 42, 8, 42)
    // The bench and the phantom: a cape billowing out, white half-mask; his head turns to you for people.
    ctx.fillStyle = '#57534e'
    rr(ctx, 50, g - 52, 60, 8, 3)
    const flare = wild ? 0.5 + 0.5 * Math.sin(p * TAU * 2) : 0.15 + 0.1 * Math.sin(p * TAU)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(76, g - 132)
    ctx.quadraticCurveTo(20 - flare * 30, g - 100, 30 - flare * 40, g - 20 + flare * 6)
    ctx.lineTo(96, g - 30)
    ctx.lineTo(96, g - 128)
    ctx.fill()
    ctx.fillStyle = '#dc2626'
    ctx.beginPath()
    ctx.moveTo(78, g - 128)
    ctx.quadraticCurveTo(36 - flare * 20, g - 96, 42 - flare * 30, g - 30)
    ctx.lineTo(92, g - 36)
    ctx.fill()
    ctx.fillStyle = color
    rr(ctx, 72, g - 128, 30, 80, 10)
    arm(ctx, [90, g - 60, 116, g - 58, 120, g - 20], 10, shade(color, -0.15))
    const turn = wild ? -1 : 1
    head(ctx, 88, g - 144, 15, '#e7d7c1', turn, { open: wild ? 0.5 : 0 })
    ctx.fillStyle = '#111827'
    ctx.beginPath()
    ctx.arc(88, g - 146, 16, Math.PI * 1.02, Math.PI * 1.98)
    ctx.fill()
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.ellipse(88 + turn * 6, g - 146, 8, 11, 0, -Math.PI / 2, Math.PI / 2, turn < 0)
    ctx.fill()
    // Hands crashing on the keys.
    const a = wild ? Math.sin(p * TAU * 4) * 10 : Math.sin(p * TAU * 2) * 4
    const b = wild ? Math.cos(p * TAU * 4) * 10 : Math.cos(p * TAU * 2) * 4
    arm(ctx, [92, g - 118, 118, g - 104, 140 + a, g - 82 - Math.abs(a) * 0.6], 8, color)
    dot(ctx, 140 + a, g - 82 - Math.abs(a) * 0.6, 4.5, '#e7d7c1')
    arm(ctx, [96, g - 116, 140, g - 100, 186 + b, g - 82 - Math.abs(b) * 0.6], 8, shade(color, -0.1))
    dot(ctx, 186 + b, g - 82 - Math.abs(b) * 0.6, 4.5, '#e7d7c1')
  }
}

// -- a werewolf turning ---------------------------------------------------------------------------------------

/** Level: an ordinary man in a plaid shirt, growing fur, ears and a snout, the shirt bursting, till he howls. */
function werewolfChange(ctx: Ctx, f: number, n: number, { color, color2 }: SpriteColors) {
  const k = f / (n - 1)
  const g = 256
  const x = 100
  const fur = '#8b6b4a'
  const s = 1 + k * 0.18
  ctx.save()
  ctx.translate(x, g)
  ctx.scale(s, s)
  // Legs (trousers torn short as he grows), then the plaid shirt splitting.
  for (const sx of [-8, 8]) {
    arm(ctx, [sx, -50, sx * 1.2, -24, sx * 1.4, -6], 12, '#1e3a8a')
    if (k > 0.5) arm(ctx, [sx * 1.3, -16, sx * 1.4, -6], 12, fur)
    ctx.fillStyle = k > 0.6 ? fur : '#57534e'
    rr(ctx, sx * 1.4 - 9, -8, 20, 8, 3)
  }
  ctx.fillStyle = color
  rr(ctx, -17, -108, 34, 62, 10)
  ctx.strokeStyle = color2
  ctx.lineWidth = 2
  for (let j = 0; j < 4; j++) {
    ctx.beginPath()
    ctx.moveTo(-17, -98 + j * 14)
    ctx.lineTo(17, -98 + j * 14)
    ctx.moveTo(-12 + j * 8, -108)
    ctx.lineTo(-12 + j * 8, -48)
    ctx.stroke()
  }
  if (k > 0.3) {
    // Rips with fur showing through.
    ctx.fillStyle = fur
    for (let j = 0; j < Math.round(k * 5); j++) {
      ctx.beginPath()
      const yy = -96 + j * 10
      ctx.moveTo(-4 + (j % 2) * 6, yy)
      ctx.lineTo(4 + (j % 2) * 6, yy + 4)
      ctx.lineTo(-2 + (j % 2) * 6, yy + 9)
      ctx.fill()
    }
  }
  // Arms: down at his sides, growing claws, then flung wide.
  const wide = Math.max(0, k - 0.6) / 0.4
  for (const sd of [-1, 1]) {
    const hx = sd * (20 + wide * 24)
    const hy = -56 - wide * 50
    arm(ctx, [sd * 14, -100, sd * (20 + wide * 14), -78 - wide * 30, hx, hy], 9, k > 0.4 ? fur : color)
    dot(ctx, hx, hy, 5, k > 0.2 ? fur : PEACH)
    if (k > 0.4) for (let j = -1; j <= 1; j++) arm(ctx, [hx, hy, hx + sd * 4 + j * 3, hy + 8], 1.8, '#f8fafc')
  }
  // The head: a face, then fur, pointed ears and a snout growing out; at the end it tips back to howl.
  const howl = k >= 1 ? -0.5 : 0
  ctx.save()
  ctx.translate(0, -120)
  ctx.rotate(howl)
  const skin = k > 0.3 ? fur : PEACH
  if (k > 0.2) {
    for (const sd of [-1, 1]) {
      ctx.fillStyle = fur
      ctx.beginPath()
      ctx.moveTo(sd * 6, -12)
      ctx.lineTo(sd * (10 + k * 4), -20 - k * 16)
      ctx.lineTo(sd * 16, -6)
      ctx.fill()
    }
  }
  head(ctx, 0, 0, 16, skin, 1, { open: k >= 1 ? 1 : k > 0.6 ? 0.4 : 0 })
  if (k > 0.4) {
    ctx.fillStyle = fur
    ctx.beginPath()
    ctx.moveTo(6, -6)
    ctx.lineTo(16 + k * 14, 2)
    ctx.lineTo(6, 12)
    ctx.fill()
    dot(ctx, 16 + k * 14, 1, 3, '#111827')
    for (const ex of [2, 10]) dot(ctx, ex, -2, 2.2, '#facc15')
  }
  if (k < 0.5) {
    ctx.fillStyle = '#44403c'
    ctx.beginPath()
    ctx.arc(0, -2, 17, Math.PI * 1.02, Math.PI * 1.98)
    ctx.fill()
  }
  ctx.restore()
  ctx.restore()
  if (k >= 1) {
    // The moon he howls at.
    dot(ctx, 170, 40, 22, '#fef3c7')
    dot(ctx, 162, 34, 4, '#fde68a')
    dot(ctx, 176, 48, 3, '#fde68a')
  }
}

// -- a skeleton in a lawn chair (dressed for the real temperature) ----------------------------------------------

function lawnChairSkeleton(cold: boolean, waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 196
    const shiver = cold ? Math.sin(f * 7) * 1.2 : 0
    // The folding lawn chair, striped webbing.
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(60, g)
    ctx.lineTo(130, g - 70)
    ctx.moveTo(130, g)
    ctx.lineTo(70, g - 60)
    ctx.moveTo(70, g - 60)
    ctx.lineTo(56, g - 140)
    ctx.stroke()
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = k % 2 ? '#f8fafc' : color
      ctx.save()
      ctx.translate(58 + k * 3, g - 132 + k * 15)
      ctx.rotate(0.15)
      ctx.fillRect(0, 0, 18, 12)
      ctx.restore()
      ctx.fillStyle = k % 2 ? '#f8fafc' : color
      ctx.fillRect(74 + k * 12, g - 66, 12, 10)
    }
    ctx.translate(shiver, 0)
    // The skeleton lounging: legs out (bony, or under a blanket), a drink in one hand.
    if (cold) {
      ctx.fillStyle = color2
      ctx.beginPath()
      ctx.moveTo(70, g - 110)
      ctx.lineTo(96, g - 110)
      ctx.lineTo(176, g - 50)
      ctx.lineTo(176, g - 10)
      ctx.lineTo(140, g - 10)
      ctx.lineTo(80, g - 56)
      ctx.fill()
      ctx.strokeStyle = shade(color2, -0.25)
      ctx.lineWidth = 3
      for (let k = 0; k < 4; k++) {
        ctx.beginPath()
        ctx.moveTo(80 + k * 22, g - 104 + k * 16)
        ctx.lineTo(88 + k * 22, g - 56 + k * 10)
        ctx.stroke()
      }
    } else {
      bones(ctx, [90, g - 64, 132, g - 62, 160, g - 14])
      bones(ctx, [84, g - 64, 124, g - 58, 146, g - 12])
      ribs(ctx, 82, g - 96)
    }
    skull(ctx, 78, g - 134, 15, 1, waving && f % 2 ? 0.4 : 0)
    if (cold) {
      // A knitted hat and scarf, a steaming mug.
      ctx.fillStyle = '#dc2626'
      ctx.beginPath()
      ctx.ellipse(78, g - 140, 16, 14, 0, Math.PI, 0)
      ctx.fill()
      dot(ctx, 78, g - 156, 5, '#f8fafc')
      ctx.fillStyle = '#16a34a'
      rr(ctx, 64, g - 118, 30, 8, 3)
      rr(ctx, 84, g - 118, 8, 26, 3)
    } else {
      // Sunglasses.
      ctx.fillStyle = '#111827'
      rr(ctx, 70, g - 140, 12, 7, 3)
      rr(ctx, 84, g - 140, 12, 7, 3)
    }
    const hx = 112
    const hy = g - 100 + (waving ? 0 : Math.sin(p * TAU) * 3)
    bones(ctx, [84, g - 116, 100, g - 96, hx, hy])
    if (cold) {
      ctx.fillStyle = '#f8fafc'
      rr(ctx, hx - 2, hy - 16, 16, 18, 3)
      for (let k = 0; k < 2; k++) {
        const u = (p + k / 2) % 1
        ctx.strokeStyle = rgba('#e5e7eb', 0.7 * (1 - u))
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(hx + 4 + k * 5, hy - 20 - u * 16)
        ctx.quadraticCurveTo(hx + k * 5, hy - 26 - u * 16, hx + 4 + k * 5, hy - 32 - u * 16)
        ctx.stroke()
      }
    } else {
      ctx.fillStyle = rgba('#fde047', 0.85)
      rr(ctx, hx - 2, hy - 20, 12, 22, 2)
      ctx.strokeStyle = '#f472b6'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(hx + 4, hy - 20)
      ctx.lineTo(hx + 10, hy - 32)
      ctx.stroke()
    }
    // The other arm: resting, or waving a bony hand at people.
    if (waving) {
      const w = Math.sin(p * TAU * 2) * 10
      bones(ctx, [72, g - 116, 58, g - 140, 56 + w, g - 164])
    } else bones(ctx, [72, g - 116, 62, g - 96, 64, g - 80])
  }
}

// -- a skeleton photographer --------------------------------------------------------------------------------

function skeletonPhotographer(flash: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 236
    // The tripod and the old bellows camera, facing out to the street.
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(130, g - 110)
    ctx.lineTo(108, g)
    ctx.moveTo(130, g - 110)
    ctx.lineTo(152, g)
    ctx.moveTo(130, g - 110)
    ctx.lineTo(130, g)
    ctx.stroke()
    ctx.fillStyle = '#78350f'
    rr(ctx, 100, g - 150, 40, 42, 4)
    ctx.fillStyle = '#44403c'
    ctx.beginPath()
    ctx.moveTo(140, g - 146)
    ctx.lineTo(168, g - 138)
    ctx.lineTo(168, g - 120)
    ctx.lineTo(140, g - 112)
    ctx.fill()
    ctx.strokeStyle = '#78716c'
    ctx.lineWidth = 1.5
    for (let k = 1; k < 4; k++) {
      ctx.beginPath()
      ctx.moveTo(140 + k * 7, g - 146 + k * 2)
      ctx.lineTo(140 + k * 7, g - 112 - k * 2)
      ctx.stroke()
    }
    dot(ctx, 172, g - 129, 8, '#cbd5e1')
    dot(ctx, 172, g - 129, 4, '#1f2937')
    // The skeleton: under the black cloth, or popped out holding up the flash powder.
    const out = flash ? Math.min(1, p / 0.3) : 0
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(98, g - 152)
    ctx.quadraticCurveTo(80 - out * 10, g - 150, 70, g - 100 + out * 30)
    ctx.lineTo(102, g - 108)
    ctx.fill()
    ribs(ctx, 70, g - 80)
    bones(ctx, [62, g - 52, 58, g - 28, 56, g - 4])
    bones(ctx, [78, g - 52, 82, g - 28, 84, g - 4])
    if (out > 0.3) skull(ctx, 72, g - 128, 14, 1, flash && p > 0.6 ? 0.5 : 0)
    else {
      ctx.fillStyle = color
      ellipse(ctx, 86, g - 128, 18, 16)
      ctx.fill()
    }
    bones(ctx, [76, g - 104, 96, g - 110, 104, g - 132])
    const fx = 58 - out * 6
    const fy = g - 150 - out * 30
    bones(ctx, [62, g - 104, 52, g - 128, fx, fy])
    ctx.strokeStyle = '#a8a29e'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(fx, fy)
    ctx.lineTo(fx, fy - 26)
    ctx.stroke()
    ctx.fillStyle = '#a8a29e'
    ctx.fillRect(fx - 12, fy - 30, 24, 5)
    if (flash && p >= 0.35 && p < 0.7) {
      // The flash going off: a white burst and a puff of smoke.
      const u = (p - 0.35) / 0.35
      const gr = ctx.createRadialGradient(fx, fy - 34, 2, fx, fy - 34, 40)
      gr.addColorStop(0, rgba('#ffffff', 1 - u * 0.5))
      gr.addColorStop(1, rgba(color2, 0))
      ctx.fillStyle = gr
      circle(ctx, fx, fy - 34, 40)
      ctx.fill()
    }
    if (flash && p >= 0.55) {
      const u = (p - 0.55) / 0.45
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = rgba('#cbd5e1', 0.5 * (1 - u))
        circle(ctx, fx - 6 + k * 8, fy - 40 - u * 30 - k * 4, 8 + u * 8)
        ctx.fill()
      }
    }
  }
}

// -- a ghostly tea party --------------------------------------------------------------------------------------

function sheetGhost(ctx: Ctx, x: number, y: number, r: number, dir: number, boo: boolean, f: number) {
  ctx.fillStyle = rgba('#f8fafc', 0.92)
  ctx.beginPath()
  ctx.arc(x, y, r, Math.PI, 0)
  ctx.lineTo(x + r, y + r * 1.6)
  for (let k = 0; k < 4; k++) {
    const sx = x + r - (k + 0.5) * (r / 2)
    ctx.quadraticCurveTo(sx, y + r * (1.9 + ((k + f) % 2) * 0.15), x + r - (k + 1) * (r / 2), y + r * 1.6)
  }
  ctx.closePath()
  ctx.fill()
  for (const k of [-1, 1]) {
    ctx.fillStyle = '#1f2937'
    ellipse(ctx, x + dir * r * 0.25 + k * r * 0.3, y - r * 0.05, r * 0.12, r * (boo ? 0.22 : 0.16))
    ctx.fill()
  }
  ctx.fillStyle = '#1f2937'
  ellipse(ctx, x + dir * r * 0.25, y + r * 0.45, r * (boo ? 0.2 : 0.1), r * (boo ? 0.26 : 0.06))
  ctx.fill()
}

function ghostTea(boo: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 196
    // The little round table with a cloth, teapot and two cups.
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(90, g - 70)
    ctx.lineTo(170, g - 70)
    ctx.lineTo(180, g - 30)
    ctx.lineTo(80, g - 30)
    ctx.fill()
    ctx.fillStyle = shade(color, -0.2)
    ctx.fillRect(124, g - 30, 12, 30)
    const lift = boo ? Math.sin(Math.min(1, p / 0.5) * Math.PI * 0.5) * 30 : 0
    const cup = (x: number, ph: number) => {
      const y = g - 74 - lift - (boo ? Math.sin(p * TAU * 2 + ph) * 4 : 0)
      ctx.fillStyle = '#f8fafc'
      rr(ctx, x - 7, y - 10, 14, 10, 3)
      ctx.fillStyle = '#e5e7eb'
      ellipse(ctx, x, y + 1, 11, 3)
      ctx.fill()
      ctx.strokeStyle = '#f8fafc'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x + 9, y - 5, 4, -1.2, 1.2)
      ctx.stroke()
    }
    cup(108, 0)
    cup(152, 2)
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.ellipse(130, g - 84 - lift * 0.5, 14, 12, 0, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = color2
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(142, g - 86 - lift * 0.5)
    ctx.lineTo(152, g - 94 - lift * 0.5)
    ctx.stroke()
    dot(ctx, 130, g - 98 - lift * 0.5, 3, color2)
    // Two ghosts hovering on either side, sipping; they whirl round to say boo to people.
    const bob = (k: number) => Math.sin(p * TAU + k) * 4
    sheetGhost(ctx, 52, g - 104 + bob(0), 28, boo ? -1 : 1, boo, f)
    sheetGhost(ctx, 208, g - 110 + bob(2), 26, boo ? 1 : -1, boo, f + 1)
  }
}

// -- a witch casting a spell ------------------------------------------------------------------------------------

function witchSpell(casting: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 246
    const d: Dress = { skin: '#a3e635', hair: '#111827', shirt: color, shoes: '#111827' }
    standing(ctx, 70, g, 1, d, { skirt: true, open: casting ? 0.6 : 0 })
    // A tall crooked hat.
    ctx.fillStyle = color
    ellipse(ctx, 72, g - 132, 30, 6)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(58, g - 134)
    ctx.lineTo(86, g - 134)
    ctx.quadraticCurveTo(80, g - 170, 98, g - 190)
    ctx.quadraticCurveTo(70, g - 170, 58, g - 134)
    ctx.fill()
    ctx.fillStyle = color2
    ctx.fillRect(60, g - 142, 26, 5)
    // The spellbook in one hand, the wand in the other.
    arm(ctx, [60, g - 98, 52, g - 80, 56, g - 70], 9, color)
    ctx.fillStyle = '#7c2d12'
    rr(ctx, 40, g - 84, 26, 20, 2)
    ctx.fillStyle = '#fef3c7'
    ctx.fillRect(43, g - 82, 20, 16)
    const wave = casting ? Math.min(1, p / 0.3) : 0.2 + Math.sin(p * TAU) * 0.15
    const wx = 100 + wave * 16
    const wy = g - 110 + wave * -16
    arm(ctx, [80, g - 98, 92, g - 104, wx, wy], 9, color)
    ctx.strokeStyle = '#78350f'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(wx, wy)
    ctx.lineTo(wx + 22, wy + 4)
    ctx.stroke()
    dot(ctx, wx + 23, wy + 4, 3, color2)
    // The pumpkin on the ground: zapped by a trail of sparks and turned into a frog.
    const frog = casting && p >= 0.6
    if (casting && p >= 0.3 && p < 0.7) {
      const u = (p - 0.3) / 0.4
      for (let k = 0; k < 8; k++) {
        const v = Math.min(u, k / 8)
        const sx = wx + 22 + (170 - wx - 22) * v
        const sy = wy + 4 + (g - 30 - wy - 4) * v - Math.sin(v * Math.PI) * 30
        dot(ctx, sx, sy, 3 - k * 0.2, k % 2 ? color2 : '#ffffff')
      }
    }
    if (frog) {
      const hop = Math.abs(Math.sin((p - 0.6) * TAU * 2)) * 10
      ctx.fillStyle = '#4ade80'
      ellipse(ctx, 170, g - 16 - hop, 22, 14)
      ctx.fill()
      for (const s of [-1, 1]) {
        dot(ctx, 170 + s * 10, g - 30 - hop, 7, '#4ade80')
        dot(ctx, 170 + s * 10, g - 31 - hop, 3, '#111827')
      }
      ctx.strokeStyle = '#166534'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(170, g - 18 - hop, 10, 0.3, Math.PI - 0.3)
      ctx.stroke()
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU
        dot(ctx, 170 + Math.cos(a) * 30, g - 20 + Math.sin(a) * 18, 2, rgba(color2, 1 - (p - 0.6) / 0.4))
      }
    } else jackOLantern(ctx, 170, g - 24, 24, color2, 'grin', -0.5)
  }
}

// -- a scaredy ghost -------------------------------------------------------------------------------------------

function scaredyGhost(hiding: boolean) {
  return (ctx: Ctx, f: number, frames: number) => {
    const p = f / frames
    const g = 216
    // The headstone.
    const stone = () => {
      ctx.fillStyle = '#94a3b8'
      ctx.beginPath()
      ctx.moveTo(110, g)
      ctx.lineTo(110, g - 90)
      ctx.quadraticCurveTo(140, g - 124, 170, g - 90)
      ctx.lineTo(170, g)
      ctx.fill()
      ctx.fillStyle = '#475569'
      ctx.font = 'bold 20px Georgia, serif'
      ctx.textAlign = 'center'
      ctx.fillText('R.I.P.', 140, g - 66)
    }
    if (hiding) {
      // Darting behind the stone and peeping out, trembling.
      const u = Math.min(1, p / 0.25)
      const peek = p > 0.4 ? Math.sin(((p - 0.4) / 0.6) * Math.PI) : 0
      const x = 70 + u * 70 + peek * 30 + Math.sin(f * 9) * 1.5
      sheetGhost(ctx, x, g - 110 + u * 10, 26, -1, true, f)
      stone()
      if (peek > 0.2) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(168, 0, 80, g)
        ctx.clip()
        sheetGhost(ctx, x, g - 100, 26, -1, true, f)
        ctx.restore()
      }
    } else {
      stone()
      // Floating about out in front, humming.
      const x = 60 + Math.sin(p * TAU) * 16
      sheetGhost(ctx, x, g - 120 + Math.sin(p * TAU * 2) * 6, 26, 1, false, f)
    }
  }
}

const BUBBLE = { id: 'bubble', frames: 1, w: 360, h: 140 }

export const HALLOWEEN_EXTRA_ROWS: Record<string, SpriteRow[]> = {
  'pumpkin-carver': [
    { id: 'main', frames: 4, w: 230, h: 220, paint: pumpkinCarver(false) },
    { id: 'act', frames: 8, w: 230, h: 220, paint: pumpkinCarver(true) },
    { ...BUBBLE, paint: saying('Boo!') },
    SPARKLE,
  ],
  'mad-scientist': [
    { id: 'main', frames: 4, w: 240, h: 250, paint: madScientist(false) },
    { id: 'act', frames: 8, w: 240, h: 250, paint: madScientist(true) },
    { ...BUBBLE, paint: saying('It’s alive!') },
    SPARKLE,
  ],
  'singing-pumpkins': [
    { id: 'main', frames: 6, w: 240, h: 160, paint: singingPumpkins(false) },
    { id: 'act', frames: 8, w: 240, h: 160, paint: singingPumpkins(true) },
    SPARKLE,
  ],
  'haunted-portrait': [
    { id: 'main', frames: 4, w: 180, h: 224, paint: hauntedPortrait },
    SPARKLE,
  ],
  sarcophagus: [
    { id: 'main', frames: 6, w: 220, h: 260, paint: sarcophagus },
    SPARKLE,
  ],
  'apple-bobbing': [
    { id: 'main', frames: 4, w: 220, h: 200, paint: appleBobbing(false) },
    { id: 'act', frames: 8, w: 220, h: 200, paint: appleBobbing(true) },
    { ...BUBBLE, paint: saying('Got it!') },
    SPARKLE,
  ],
  'grave-digger': [
    { id: 'main', frames: 4, w: 240, h: 220, paint: graveDigger(false) },
    { id: 'act', frames: 8, w: 240, h: 220, paint: graveDigger(true) },
    { ...BUBBLE, paint: saying('Yikes!') },
    SPARKLE,
  ],
  'phantom-organist': [
    { id: 'main', frames: 4, w: 250, h: 250, paint: phantomOrganist(false) },
    { id: 'act', frames: 8, w: 250, h: 250, paint: phantomOrganist(true) },
    SPARKLE,
  ],
  'werewolf-change': [
    { id: 'main', frames: 6, w: 220, h: 270, paint: werewolfChange },
    SPARKLE,
  ],
  'lawn-chair-skeleton': [
    { id: 'main', frames: 4, w: 200, h: 200, paint: lawnChairSkeleton(false, false) },
    { id: 'act', frames: 8, w: 200, h: 200, paint: lawnChairSkeleton(false, true) },
    { id: 'cold', frames: 4, w: 200, h: 200, paint: lawnChairSkeleton(true, false) },
    { id: 'coldact', frames: 8, w: 200, h: 200, paint: lawnChairSkeleton(true, true) },
    { ...BUBBLE, paint: saying('Nice night for it!') },
    { id: 'brr', frames: 1, w: 360, h: 140, paint: saying('Bone-chilling!') },
    SPARKLE,
  ],
  'skeleton-photographer': [
    { id: 'main', frames: 4, w: 220, h: 240, paint: skeletonPhotographer(false) },
    { id: 'act', frames: 8, w: 220, h: 240, paint: skeletonPhotographer(true) },
    { ...BUBBLE, paint: saying('Say cheese!') },
    SPARKLE,
  ],
  'ghost-tea-party': [
    { id: 'main', frames: 4, w: 260, h: 200, paint: ghostTea(false) },
    { id: 'act', frames: 8, w: 260, h: 200, paint: ghostTea(true) },
    { ...BUBBLE, paint: saying('Boo!') },
    SPARKLE,
  ],
  'witch-spell': [
    { id: 'main', frames: 4, w: 220, h: 250, paint: witchSpell(false) },
    { id: 'act', frames: 8, w: 220, h: 250, paint: witchSpell(true) },
    { ...BUBBLE, paint: saying('Abracadabra!') },
    SPARKLE,
  ],
  'scaredy-ghost': [
    { id: 'main', frames: 6, w: 240, h: 220, paint: scaredyGhost(false) },
    { id: 'act', frames: 8, w: 240, h: 220, paint: scaredyGhost(true) },
    { ...BUBBLE, paint: saying('Eek!') },
    SPARKLE,
  ],
}
