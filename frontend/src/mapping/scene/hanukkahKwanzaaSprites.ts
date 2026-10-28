/**
 * Pictures for Hanukkah and Kwanzaa: a chef flipping latkes, children
 * spinning a dreidel, a menorah in the window lit for tonight's night, a
 * klezmer band, a baker filling jelly doughnuts, a djembe drummer, Kwanzaa
 * dancers, an elder with the principle of the day, the unity cup raised and
 * a harvest basket carried home.
 *
 * Painted the same way as sprites.ts: facing right, one frame at a time,
 * into a cell of w by h design units.
 */

import { arm, dot, head, rr } from './figures'
import { note } from './halloweenSprites'
import { KWANZAA_PRINCIPLES } from './holidays'
import {
  ellipse, glow, rgba, saying, shade, SKIN, SPARKLE, TAU,
  type Ctx, type SpriteColors, type SpriteRow,
} from './sprites'

/** A kente-cloth band: blocks of red, gold and green with thin black-green lines between. */
function kente(ctx: Ctx, x: number, y: number, w: number, h: number, seed = 0) {
  const colours = ['#dc2626', '#facc15', '#16a34a', '#f97316']
  const n = Math.max(2, Math.round(w / 10))
  for (let k = 0; k < n; k++) {
    ctx.fillStyle = colours[(k + seed) % colours.length]
    ctx.fillRect(x + (k * w) / n, y, w / n + 0.5, h)
  }
  ctx.fillStyle = '#14532d'
  for (let k = 1; k < n; k += 2) ctx.fillRect(x + (k * w) / n, y + h * 0.3, 2, h * 0.4)
}

const BROWN = '#9a6440'
const DEEP = '#7a4a2c'
const TAN = '#c68a5a'

// -- a chef frying latkes ---------------------------------------------------------------------------

function latkeChef(flipping: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    // The pan jerks up at the start and the middle latke turns over in the air, landing back in the pan.
    const jerk = flipping && p < 0.25 ? Math.sin((p / 0.25) * Math.PI) * 8 : 0
    // Table and burner.
    ctx.fillStyle = '#a16207'
    rr(ctx, 118, 172, 78, 8, 3)
    ctx.fillRect(124, 180, 6, 56)
    ctx.fillRect(184, 180, 6, 56)
    ctx.fillStyle = '#94a3b8'
    rr(ctx, 132, 158, 50, 14, 4)
    for (let k = 0; k < 5; k++) {
      const h = 6 + 3 * Math.sin(p * TAU * 3 + k * 1.9)
      ctx.fillStyle = '#60a5fa'
      ctx.beginPath()
      ctx.moveTo(138 + k * 9, 158)
      ctx.quadraticCurveTo(141 + k * 9, 158 - h * 1.4, 144 + k * 9, 158)
      ctx.fill()
    }
    // Legs and shoes.
    ctx.fillStyle = '#64748b'
    rr(ctx, 64, 176, 16, 56, 5)
    rr(ctx, 84, 176, 16, 56, 5)
    ctx.fillStyle = '#475569'
    rr(ctx, 60, 228, 26, 10, 4)
    rr(ctx, 82, 228, 28, 10, 4)
    // Far arm on the hip.
    arm(ctx, [64, 112, 50, 140, 64, 156], 13, '#e2e8f0')
    // Double-breasted chef's jacket and the apron in the element's colour.
    ctx.fillStyle = '#f8fafc'
    rr(ctx, 56, 100, 52, 84, 14)
    ctx.fillStyle = color
    rr(ctx, 60, 140, 46, 46, 6)
    ctx.fillRect(56, 140, 52, 5)
    for (const y of [114, 128]) for (const x of [74, 90]) dot(ctx, x, y, 2.6, '#94a3b8')
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(70, 100)
    ctx.lineTo(96, 100)
    ctx.lineTo(83, 112)
    ctx.fill()
    // Head, a curly moustache and the tall white hat.
    head(ctx, 84, 80, 19, SKIN, 1, { open: flipping && p > 0.2 && p < 0.7 ? 0.6 : 0 })
    ctx.strokeStyle = '#78350f'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(84, 87)
    ctx.quadraticCurveTo(92, 82, 98, 88)
    ctx.quadraticCurveTo(102, 84, 100, 81)
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    rr(ctx, 66, 54, 38, 12, 4)
    for (const [x, y, r] of [[72, 42, 12], [85, 34, 14], [97, 42, 12]] as const) dot(ctx, x, y, r, '#ffffff')
    ctx.fillRect(66, 42, 38, 16)
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1.5
    for (const x of [76, 86, 96]) {
      ctx.beginPath()
      ctx.moveTo(x, 44)
      ctx.lineTo(x, 56)
      ctx.stroke()
    }
    // The pan, with three latkes sizzling in the oil.
    ctx.save()
    ctx.translate(0, -jerk)
    ctx.strokeStyle = '#57534e'
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(104, 150)
    ctx.lineTo(130, 152)
    ctx.stroke()
    ctx.fillStyle = '#94a3b8'
    ellipse(ctx, 157, 151, 30, 9)
    ctx.fill()
    ctx.fillStyle = '#a8a29e'
    ellipse(ctx, 157, 149, 26, 6.5)
    ctx.fill()
    const latke = (x: number, y: number, ry: number, rot: number, under: boolean) => {
      ctx.fillStyle = under ? '#b45309' : '#d97706'
      ellipse(ctx, x, y, 10, ry, rot)
      ctx.fill()
      ctx.fillStyle = under ? '#d97706' : '#fbbf24'
      for (let k = 0; k < 4; k++) {
        ellipse(ctx, x - 6 + k * 4, y - ry * 0.2 + (k % 2) * ry * 0.3, 1.8, Math.max(0.8, ry * 0.25), rot)
        ctx.fill()
      }
    }
    latke(145, 148, 3.5, 0, false)
    latke(170, 147, 3.5, 0, false)
    if (!flipping || p > 0.85) latke(157, 149, 3.5, 0, flipping)
    ctx.fillStyle = '#ffffff'
    for (let k = 0; k < 6; k++) {
      const q = (p * 2 + k / 6) % 1
      dot(ctx, 138 + ((k * 37) % 40), 148 - q * 6, 1.4 * (1 - q), '#ffffff')
    }
    ctx.restore()
    if (flipping && p <= 0.85) {
      const q = Math.min(1, p / 0.85)
      const th = q * Math.PI
      latke(157 - Math.sin(q * Math.PI) * 6, 147 - jerk - Math.sin(q * Math.PI) * 92, 3.5 + 7 * Math.abs(Math.sin(th)), Math.sin(th) * 0.4, Math.cos(th) < 0)
      // Drops of oil flicked off.
      if (q < 0.5) for (let k = 0; k < 3; k++) dot(ctx, 150 + k * 9, 140 - q * 40 - k * 6, 1.8, '#fde68a')
    }
    // Steam off the pan.
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.lineWidth = 3
    for (let k = 0; k < 3; k++) {
      const q = (p + k / 3) % 1
      const x = 146 + k * 12
      ctx.globalAlpha = Math.sin(q * Math.PI)
      ctx.beginPath()
      ctx.moveTo(x, 138 - q * 30)
      ctx.quadraticCurveTo(x + 8, 128 - q * 30, x, 118 - q * 30)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    // Near arm holding the pan handle.
    arm(ctx, [96, 112, 112, 136, 106, 150 - jerk], 13, '#ffffff')
    dot(ctx, 106, 150 - jerk, 6.5, SKIN)
  }
}

// -- children playing dreidel --------------------------------------------------------------------------

/** A child sitting cross-legged on the ground at x, turned to dir; arms 'lap', 'clap' (open 0 to 1) or 'up'. */
function sittingKid(ctx: Ctx, x: number, dir: number, shirt: string, skin: string, hair: string, arms: 'lap' | 'clap' | 'up', open = 0) {
  ctx.fillStyle = '#64748b'
  ellipse(ctx, x, 186, 28, 11)
  ctx.fill()
  dot(ctx, x + dir * 22, 190, 6, '#475569')
  dot(ctx, x - dir * 20, 192, 6, '#475569')
  if (arms === 'up') arm(ctx, [x - dir * 8, 140, x - dir * 20, 116, x - dir * 18, 92], 9, shade(shirt, -0.2))
  ctx.fillStyle = shirt
  rr(ctx, x - 15, 130, 30, 52, 11)
  head(ctx, x + dir * 2, 112, 17, skin, dir, { open: arms === 'up' ? 0.8 : 0 })
  ctx.fillStyle = hair
  ctx.beginPath()
  ctx.arc(x + dir * 2, 110, 18, Math.PI * 1.05, Math.PI * 1.95)
  ctx.quadraticCurveTo(x + dir * 2, 96, x - 14, 110)
  ctx.fill()
  if (arms === 'lap') {
    arm(ctx, [x + dir * 6, 140, x + dir * 16, 162, x + dir * 22, 176], 9, shirt)
    dot(ctx, x + dir * 22, 177, 5, skin)
  } else if (arms === 'clap') {
    const hx = x + dir * 24
    arm(ctx, [x + dir * 4, 140, x + dir * 16, 156, hx - dir * open * 5, 148 - open * 4], 9, shirt)
    dot(ctx, hx - dir * open * 5, 148 - open * 4, 5, skin)
    dot(ctx, hx + dir * open * 5, 150 - open * 6, 5, skin)
  } else {
    arm(ctx, [x + dir * 8, 140, x + dir * 20, 116, x + dir * 18, 92], 9, shirt)
    dot(ctx, x + dir * 18, 90, 5.5, skin)
    dot(ctx, x - dir * 18, 90, 5.5, skin)
  }
}

const LETTERS = ['נ', 'ג', 'ה', 'ש']

function dreidelGame(spinning: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const landed = spinning && p >= 0.74
    // Gelt between them.
    for (const [x, y] of [[92, 190], [104, 193], [138, 191], [150, 194], [146, 188]] as const) {
      ctx.fillStyle = '#ca8a04'
      ellipse(ctx, x, y + 1.5, 7, 3.5)
      ctx.fill()
      ctx.fillStyle = '#facc15'
      ellipse(ctx, x, y, 7, 3.5)
      ctx.fill()
    }
    const clap = spinning && !landed ? Math.abs(Math.sin(p * TAU * 3)) : Math.abs(Math.sin(p * TAU))
    sittingKid(ctx, 46, 1, '#f59e0b', SKIN, '#78350f', landed ? 'up' : 'clap', clap)
    sittingKid(ctx, 194, -1, '#60a5fa', TAN, '#422006', landed ? 'up' : spinning ? 'clap' : 'lap', clap)
    // The dreidel, spinning on its point (or just landed, and wobbling to a stop on Gimel).
    const wob = spinning ? (landed ? Math.sin(p * TAU * 2) * 0.05 : Math.sin(p * TAU * 3) * 0.08) : Math.sin(p * TAU) * 0.05
    ctx.save()
    ctx.translate(120, 184)
    ctx.rotate(wob)
    ctx.translate(-120, -184)
    if (spinning && !landed) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 2.5
      for (let k = 0; k < 3; k++) {
        ctx.beginPath()
        ctx.ellipse(120, 132 + k * 14, 40 + k * 2, 8, 0, Math.PI * (0.1 + (p * 6 + k * 0.3) % 0.4), Math.PI * (0.9 - (p * 6) % 0.3))
        ctx.stroke()
      }
    }
    ctx.fillStyle = shade(color2, -0.2)
    rr(ctx, 114, 84, 12, 28, 4)
    ctx.fillStyle = color2
    rr(ctx, 115, 84, 5, 28, 3)
    ctx.fillStyle = shade(color, -0.25)
    ctx.beginPath()
    ctx.moveTo(94, 156)
    ctx.lineTo(146, 156)
    ctx.lineTo(120, 186)
    ctx.closePath()
    ctx.fill()
    // The faces: one full face at rest, or two sliding round as it spins.
    const q = spinning && !landed ? (p * 6) % 1 : 0
    const face = spinning && !landed ? Math.floor(p * 6) % 4 : spinning ? 1 : 0
    const w1 = 52 * (1 - q)
    const faceAt = (x: number, w: number, letter: string, light: number) => {
      if (w < 1) return
      ctx.fillStyle = shade(color, light)
      ctx.fillRect(x, 106, w, 52)
      ctx.save()
      ctx.translate(x + w / 2, 134)
      ctx.scale(Math.max(0.05, w / 52), 1)
      ctx.fillStyle = color2
      ctx.font = 'bold 34px "Noto Sans Hebrew", Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(letter, 0, 0)
      ctx.restore()
    }
    faceAt(94, w1, LETTERS[face], 0.05 - q * 0.3)
    faceAt(94 + w1, 52 - w1, LETTERS[(face + 1) % 4], -0.3 + q * 0.35)
    ctx.fillStyle = rgba('#ffffff', 0.25)
    ctx.fillRect(94, 106, 52, 5)
    ctx.restore()
    if (landed) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU + p * 4
        dot(ctx, 120 + Math.cos(a) * 46, 132 + Math.sin(a) * 30, 2.5, '#fde68a')
      }
    }
  }
}

// -- a menorah in the window --------------------------------------------------------------------------

/** Lit candles (0 to 8): the candles go in from the right, one more each night, with the shamash in the middle. */
function windowMenorah(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const lit = f
  // The window: trim, warm room light behind the glass, the sash bars and the sill.
  ctx.fillStyle = '#f1e9d8'
  rr(ctx, 8, 6, 204, 172, 6)
  const g = ctx.createRadialGradient(110, 120, 10, 110, 100, 120)
  g.addColorStop(0, lit ? '#fcd34d' : '#334155')
  g.addColorStop(0.5, lit ? '#b45309' : '#1e293b')
  g.addColorStop(1, '#1e293b')
  ctx.fillStyle = g
  ctx.fillRect(22, 20, 176, 144)
  ctx.fillStyle = '#f1e9d8'
  ctx.fillRect(107, 20, 6, 144)
  ctx.fillRect(22, 86, 176, 6)
  ctx.fillStyle = rgba('#ffffff', 0.12)
  ctx.beginPath()
  ctx.moveTo(30, 24)
  ctx.lineTo(60, 24)
  ctx.lineTo(30, 70)
  ctx.fill()
  ctx.fillStyle = '#e7dcc4'
  rr(ctx, 0, 160, 220, 16, 4)
  ctx.fillStyle = '#c9b996'
  ctx.fillRect(4, 172, 212, 5)
  // The menorah: a foot, a stem and four curved arms each side up to the cups.
  const metal = color2
  const cups = [34, 52, 70, 88, 132, 150, 168, 186]
  ctx.strokeStyle = metal
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  for (const x of cups) {
    ctx.beginPath()
    ctx.moveTo(110, 142)
    ctx.quadraticCurveTo(x, 142, x, 116)
    ctx.stroke()
  }
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(110, 156)
  ctx.lineTo(110, 98)
  ctx.stroke()
  ctx.fillStyle = metal
  ctx.beginPath()
  ctx.moveTo(94, 160)
  ctx.lineTo(126, 160)
  ctx.lineTo(116, 150)
  ctx.lineTo(104, 150)
  ctx.fill()
  const candle = (x: number, top: number, on: boolean, i: number) => {
    ctx.fillStyle = metal
    rr(ctx, x - 6, top + 22, 12, 5, 2)
    ctx.fillStyle = i % 2 ? '#f8fafc' : color
    ctx.fillRect(x - 3, top, 6, 22)
    ctx.strokeStyle = '#1f2937'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, top - 3)
    ctx.stroke()
    if (!on) return
    glow(ctx, x, top - 9, 18, '#fbbf24', 0.75)
    ctx.fillStyle = '#fde68a'
    ctx.beginPath()
    ctx.moveTo(x, top - 17 - (i % 3))
    ctx.quadraticCurveTo(x + 5, top - 7, x, top - 2)
    ctx.quadraticCurveTo(x - 5, top - 7, x, top - 17 - (i % 3))
    ctx.fill()
    dot(ctx, x, top - 6, 1.8, '#fff7ed')
  }
  cups.forEach((x, i) => candle(x, 94, i >= 8 - lit, i))
  candle(110, 74, lit > 0, 1)
}

// -- a klezmer band ----------------------------------------------------------------------------------

function klezmer(playing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const amp = playing ? 1 : 0.45
    const bounceA = playing ? Math.abs(Math.sin(p)) * 5 : 0
    const bounceB = playing ? Math.abs(Math.cos(p)) * 5 : 0
    // -- the fiddler, facing right.
    ctx.save()
    ctx.translate(0, -bounceA)
    ctx.fillStyle = '#64748b'
    rr(ctx, 62, 178, 14, 62, 5)
    rr(ctx, 80, 178, 14, 62, 5)
    ctx.fillStyle = '#475569'
    rr(ctx, 58, 236, 22, 9, 4)
    rr(ctx, 78, 236, 24, 9, 4)
    ctx.fillStyle = '#f8fafc'
    rr(ctx, 56, 106, 46, 78, 12)
    ctx.fillStyle = color
    rr(ctx, 56, 108, 16, 76, 8)
    rr(ctx, 86, 108, 16, 76, 8)
    head(ctx, 82, 88, 17, SKIN, 1, { blink: playing && Math.sin(p) > 0.5 })
    ctx.fillStyle = '#78350f'
    ctx.beginPath()
    ctx.moveTo(72, 94)
    ctx.quadraticCurveTo(84, 118, 98, 96)
    ctx.quadraticCurveTo(86, 102, 72, 94)
    ctx.fill()
    ctx.fillStyle = '#78716c'
    ctx.beginPath()
    ctx.ellipse(82, 76, 19, 8, 0, Math.PI, 0)
    ctx.fill()
    rr(ctx, 78, 72, 30, 6, 3)
    // The fiddle on his shoulder: body, neck, scroll; held by the far hand.
    ctx.save()
    ctx.translate(100, 106)
    ctx.rotate(0.34 + Math.sin(p) * 0.04 * amp)
    ctx.fillStyle = '#c2410c'
    ellipse(ctx, 6, 0, 17, 8)
    ctx.fill()
    ctx.fillStyle = '#ea580c'
    ellipse(ctx, 2, -1, 9, 5)
    ctx.fill()
    ctx.fillStyle = '#57534e'
    ctx.fillRect(18, -2, 30, 4)
    dot(ctx, 50, 0, 4, '#c2410c')
    ctx.restore()
    arm(ctx, [66, 114, 92, 138, 136, 124], 11, shade(color, -0.15))
    dot(ctx, 136, 124, 5.5, SKIN)
    // The bow sawing across the strings, the near hand at its end.
    const b = Math.sin(p * (playing ? 2 : 1)) * amp
    const cx = 110
    const cy = 112
    const px = -0.35
    const py = 0.94
    const s0 = -34 + b * 22
    const s1 = 30 + b * 22
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(cx + px * s0, cy + py * s0)
    ctx.lineTo(cx + px * s1, cy + py * s1)
    ctx.stroke()
    const hx = cx + px * s1
    const hy = cy + py * s1
    arm(ctx, [92, 114, (92 + hx) / 2 + 10, (114 + hy) / 2 + 12, hx, hy], 11, color)
    dot(ctx, hx, hy, 5.5, SKIN)
    ctx.restore()
    // -- the clarinettist, facing left towards him.
    ctx.save()
    ctx.translate(0, -bounceB)
    ctx.fillStyle = '#64748b'
    rr(ctx, 160, 178, 14, 62, 5)
    rr(ctx, 178, 178, 14, 62, 5)
    ctx.fillStyle = '#475569'
    rr(ctx, 154, 236, 24, 9, 4)
    rr(ctx, 176, 236, 22, 9, 4)
    arm(ctx, [190, 114, 178, 140, 152, 138], 11, shade(color2, -0.2))
    ctx.fillStyle = '#f8fafc'
    rr(ctx, 152, 106, 46, 78, 12)
    ctx.fillStyle = color2
    rr(ctx, 152, 108, 16, 76, 8)
    rr(ctx, 182, 108, 16, 76, 8)
    head(ctx, 172, 88, 17, TAN, -1, { puff: playing })
    // A brimmed hat.
    ctx.fillStyle = '#57534e'
    rr(ctx, 150, 70, 44, 6, 3)
    rr(ctx, 158, 54, 28, 18, 6)
    ctx.fillStyle = color
    ctx.fillRect(158, 66, 28, 4)
    // The clarinet from his lips down and out, its bell tipping up as he plays.
    ctx.save()
    ctx.translate(160, 98)
    ctx.rotate(-0.95 + Math.max(0, Math.sin(p)) * 0.3 * amp)
    ctx.fillStyle = '#475569'
    ctx.fillRect(-56, -3, 56, 6)
    ctx.beginPath()
    ctx.moveTo(-56, -3)
    ctx.lineTo(-68, -9)
    ctx.lineTo(-68, 9)
    ctx.lineTo(-56, 3)
    ctx.fill()
    for (let k = 0; k < 5; k++) dot(ctx, -12 - k * 9, -3, 1.6, '#e2e8f0')
    ctx.restore()
    // Hands on the clarinet, fingers tapping.
    const tap = Math.sin(p * 4) > 0 ? 1 : 0
    arm(ctx, [172, 116, 164, 128, 149, 114 + tap], 11, color2)
    dot(ctx, 149, 114 + tap, 5.5, TAN)
    arm(ctx, [184, 118, 160, 146, 136, 133 - tap], 11, color2)
    dot(ctx, 136, 133 - tap, 5.5, TAN)
    ctx.restore()
  }
}

// -- a baker filling jelly doughnuts ---------------------------------------------------------------------

function sufganiyot(filling: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const squeeze = filling ? Math.min(1, p / 0.7) : 0
    const squirt = filling && p >= 0.7
    // Table and tray of doughnuts dusted with sugar.
    ctx.fillStyle = '#a16207'
    rr(ctx, 104, 170, 112, 8, 3)
    ctx.fillRect(110, 178, 6, 50)
    ctx.fillRect(204, 178, 6, 50)
    ctx.fillStyle = '#cbd5e1'
    rr(ctx, 110, 162, 100, 8, 3)
    const doughnut = (x: number, puff: number) => {
      ctx.fillStyle = '#c2410c'
      ellipse(ctx, x, 154, 15 + puff, 9 + puff * 0.6)
      ctx.fill()
      ctx.fillStyle = '#f59e0b'
      ellipse(ctx, x, 150, 14 + puff, 6 + puff * 0.5)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ellipse(ctx, x, 156, 15 + puff, 2.5)
      ctx.fill()
      ctx.fillStyle = rgba('#ffffff', 0.85)
      for (let k = 0; k < 6; k++) dot(ctx, x - 9 + ((k * 7) % 18), 147 + (k % 3) * 2, 1.4, '#ffffff')
    }
    doughnut(130, 0)
    doughnut(160, squeeze * 3)
    doughnut(190, 0)
    if (squirt) {
      // A blob of jelly squirting out the top, and a puff of sugar.
      const q = (p - 0.7) / 0.3
      ctx.fillStyle = color2
      ellipse(ctx, 160, 144 - q * 10, 6 + q * 4, 5 + q * 6)
      ctx.fill()
      dot(ctx, 166 + q * 10, 132 - q * 16, 3, color2)
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU
        dot(ctx, 160 + Math.cos(a) * (12 + q * 18), 146 + Math.sin(a) * (6 + q * 10) - q * 6, 2.2 * (1 - q * 0.6), '#ffffff')
      }
    }
    // Warm doughnuts steaming (always a little).
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 2.5
    for (const [k, x] of [[0, 130], [1, 190]] as const) {
      const q = (p + k * 0.5) % 1
      ctx.globalAlpha = Math.sin(q * Math.PI)
      ctx.beginPath()
      ctx.moveTo(x, 140 - q * 26)
      ctx.quadraticCurveTo(x + 7, 132 - q * 26, x, 122 - q * 26)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    // The baker.
    const sway = Math.sin(p * TAU) * 2
    ctx.fillStyle = '#64748b'
    rr(ctx, 54, 176, 15, 54, 5)
    rr(ctx, 74, 176, 15, 54, 5)
    ctx.fillStyle = '#475569'
    rr(ctx, 50, 226, 24, 9, 4)
    rr(ctx, 72, 226, 26, 9, 4)
    arm(ctx, [56, 112, 46 + sway, 142, 58, 160], 13, '#e2e8f0')
    ctx.fillStyle = '#f8fafc'
    rr(ctx, 46, 100, 52, 84, 14)
    ctx.fillStyle = color
    rr(ctx, 50, 132, 44, 54, 6)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 18px "Noto Sans Hebrew", Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('✡', 72, 156)
    head(ctx, 74, 80, 19, TAN, 1, { open: squirt ? 0.8 : 0 })
    ctx.fillStyle = '#422006'
    ctx.beginPath()
    ctx.arc(74, 78, 20, Math.PI * 1.1, Math.PI * 1.75)
    ctx.fill()
    // A soft baker's cap.
    ctx.fillStyle = '#ffffff'
    ellipse(ctx, 74, 60, 24, 11)
    ctx.fill()
    ctx.fillRect(56, 60, 36, 8)
    // The piping bag of jelly, squeezed down to the doughnut.
    const bx = 138
    const by = 92
    const fat = 1 - squeeze * 0.45
    ctx.fillStyle = rgba('#f8fafc', 0.95)
    ctx.beginPath()
    ctx.moveTo(bx - 10 * fat, by)
    ctx.lineTo(bx + 14 * fat, by + 6)
    ctx.lineTo(158, 140)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(bx - 6 * fat, by + 10)
    ctx.lineTo(bx + 10 * fat, by + 14)
    ctx.lineTo(156, 134)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#94a3b8'
    ctx.beginPath()
    ctx.moveTo(154, 132)
    ctx.lineTo(162, 134)
    ctx.lineTo(159, 144)
    ctx.fill()
    arm(ctx, [88, 112, 108, 120, bx, by + 2], 13, '#ffffff')
    dot(ctx, bx, by + 2, 7 - squeeze, TAN)
  }
}

// -- a djembe drummer --------------------------------------------------------------------------------

function djembeDrummer(playing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU * (playing ? 2 : 1)
    const amp = playing ? 22 : 9
    const left = Math.max(0, Math.sin(p)) * amp
    const right = Math.max(0, -Math.sin(p)) * amp
    // Stool.
    ctx.fillStyle = '#a16207'
    rr(ctx, 40, 184, 50, 10, 4)
    ctx.fillRect(46, 194, 6, 34)
    ctx.fillRect(78, 194, 6, 34)
    // Legs: thighs out, shins down.
    arm(ctx, [64, 178, 108, 180, 112, 226], 15, '#e5e7eb')
    ctx.fillStyle = '#78716c'
    rr(ctx, 104, 222, 26, 9, 4)
    // The djembe between his knees: a goblet of carved wood with rope lacing and a skin head.
    ctx.fillStyle = '#a16207'
    ctx.beginPath()
    ctx.moveTo(104, 140)
    ctx.quadraticCurveTo(106, 176, 122, 184)
    ctx.lineTo(118, 226)
    ctx.lineTo(146, 226)
    ctx.lineTo(142, 184)
    ctx.quadraticCurveTo(158, 176, 160, 140)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ca8a04'
    ctx.fillRect(116, 196, 32, 5)
    ctx.strokeStyle = '#fef3c7'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let k = 0; k <= 8; k++) {
      const x = 106 + k * 6.5
      ctx.lineTo(x, k % 2 ? 160 : 144)
    }
    ctx.stroke()
    ctx.fillStyle = '#f5deb3'
    ellipse(ctx, 132, 140, 28, 8)
    ctx.fill()
    ctx.strokeStyle = '#d6b88a'
    ctx.lineWidth = 2
    ctx.stroke()
    // Ripples where a hand just struck.
    for (const [h, x] of [[left, 120], [right, 144]] as const) {
      if (h < 3) {
        ctx.strokeStyle = rgba('#ffffff', 0.6)
        ctx.lineWidth = 1.5
        ellipse(ctx, x, 140, 9, 3)
        ctx.stroke()
        ellipse(ctx, x, 140, 15, 5)
        ctx.stroke()
      }
    }
    // Far arm, body (a dashiki with an embroidered neck), head and kufi.
    const bob = playing ? Math.abs(Math.sin(p)) * 3 : 0
    arm(ctx, [62, 112 + bob, 86, 132 - left * 0.3, 118, 136 - left], 11, shade(color, -0.2))
    dot(ctx, 118, 136 - left, 6, DEEP)
    ctx.fillStyle = color
    rr(ctx, 50, 102 + bob, 46, 80, 12)
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(60, 104 + bob)
    ctx.lineTo(86, 104 + bob)
    ctx.lineTo(73, 130 + bob)
    ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(66, 104 + bob)
    ctx.lineTo(80, 104 + bob)
    ctx.lineTo(73, 118 + bob)
    ctx.fill()
    kente(ctx, 50, 168 + bob, 46, 8, 1)
    head(ctx, 76, 82 + bob, 17, BROWN, 1, { open: playing && Math.sin(p) > 0.6 ? 0.7 : 0 })
    ctx.save()
    ctx.beginPath()
    ctx.rect(56, 56 + bob, 42, 20)
    ctx.clip()
    ctx.beginPath()
    ctx.ellipse(76, 76 + bob, 18, 16, 0, Math.PI, 0)
    ctx.fillStyle = '#dc2626'
    ctx.fill()
    kente(ctx, 56, 66 + bob, 42, 6, 2)
    ctx.restore()
    // Near arm.
    arm(ctx, [88, 112 + bob, 112, 132 - right * 0.3, 142, 138 - right], 11, color)
    dot(ctx, 142, 138 - right, 6, BROWN)
  }
}

// -- Kwanzaa dancers ---------------------------------------------------------------------------------

function kwanzaaDancers(dancing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const dancer = (x: number, dir: number, skin: string, dress: string, wrap: string, ph: number) => {
      const s = Math.sin(p + ph)
      const bob = dancing ? Math.abs(Math.sin(p * 2 + ph)) * 6 : Math.abs(s) * 2
      const sway = s * (dancing ? 10 : 5)
      ctx.save()
      ctx.translate(0, -bob)
      // Feet stepping under the hem.
      ctx.fillStyle = shade(skin, -0.1)
      ellipse(ctx, x - 10 + s * 4, 232 + bob, 9, 4)
      ctx.fill()
      ellipse(ctx, x + 10 - s * 4, 232 + bob, 9, 4)
      ctx.fill()
      // Far arm: out and down swaying, or up over her head.
      const up = dancing ? 1 : 0
      const far = up ? [x - dir * 10, 112, x - dir * 28, 88 + s * 6, x - dir * 22 + sway * 0.4, 62 + s * 4] : [x - dir * 10, 114, x - dir * 34, 134 - s * 10, x - dir * 50, 128 - s * 18]
      arm(ctx, far, 9, skin)
      // A long wrap dress with kente bands, the hem swinging.
      ctx.fillStyle = dress
      ctx.beginPath()
      ctx.moveTo(x - 16, 104)
      ctx.lineTo(x + 16, 104)
      ctx.quadraticCurveTo(x + 22, 170, x + 34 + sway, 226)
      ctx.lineTo(x - 34 + sway, 226)
      ctx.quadraticCurveTo(x - 22, 170, x - 16, 104)
      ctx.fill()
      ctx.save()
      ctx.clip()
      kente(ctx, x - 40, 150, 80, 10, ph > 1 ? 1 : 0)
      kente(ctx, x - 40, 196, 80, 12, ph > 1 ? 2 : 3)
      ctx.restore()
      // Head and a tall gele headwrap.
      head(ctx, x + dir * 2, 86, 16, skin, dir, { open: dancing ? 0.5 : 0 })
      ctx.fillStyle = wrap
      ctx.beginPath()
      ctx.moveTo(x - 18, 80)
      ctx.quadraticCurveTo(x - 22, 48, x + dir * 4, 44)
      ctx.quadraticCurveTo(x + 26, 50, x + 18, 80)
      ctx.quadraticCurveTo(x, 70, x - 18, 80)
      ctx.fill()
      ctx.strokeStyle = shade(wrap, -0.25)
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x - 14, 64)
      ctx.quadraticCurveTo(x, 54, x + 16, 66)
      ctx.stroke()
      // Near arm.
      const near = up ? [x + dir * 10, 112, x + dir * 28, 88 - s * 6, x + dir * 22 + sway * 0.4, 62 - s * 4] : [x + dir * 10, 114, x + dir * 34, 134 + s * 10, x + dir * 50, 128 + s * 18]
      arm(ctx, near, 9, skin)
      const [hx, hy] = [near[4], near[5]]
      dot(ctx, hx, hy, 5, skin)
      dot(ctx, far[4], far[5], 5, skin)
      ctx.restore()
    }
    dancer(72, 1, BROWN, color, color2, 0)
    dancer(168, -1, '#8d5524', color2, color, Math.PI * 0.5)
  }
}

// -- an elder with the principle of the day -----------------------------------------------------------

const MEANINGS = ['Unity', 'Self-determination', 'Collective work', 'Cooperative economics', 'Purpose', 'Creativity', 'Faith']

/** Frame n is the nth principle (Umoja on the first day, 26 December, to Imani on 1 January). */
function habariGani(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  // The sign on a post, edged in kente.
  ctx.fillStyle = '#a16207'
  ctx.fillRect(158, 136, 8, 122)
  kente(ctx, 96, 34, 132, 104, f)
  ctx.fillStyle = '#fef3c7'
  rr(ctx, 102, 40, 120, 92, 6)
  const fit = (text: string, weight: string, size: number, max: number, y: number, fill: string) => {
    let s = size
    do {
      ctx.font = `${weight} ${s}px Georgia, serif`
      s -= 1
    } while (s > 9 && ctx.measureText(text).width > max)
    ctx.fillStyle = fill
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 162, y)
  }
  // Which day of seven, with its candle colour (three red, the black one in the middle, three green).
  const day = f + 1
  const lamp = f < 3 ? '#dc2626' : f === 3 ? '#475569' : '#16a34a'
  dot(ctx, 116, 54, 9, lamp)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 12px Georgia, serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(day), 116, 55)
  fit(KWANZAA_PRINCIPLES[f], 'bold', 30, 108, 84, '#7f1d1d')
  // The meaning, on two lines when it is long.
  const words = MEANINGS[f].split(' ')
  if (words.length > 1 && MEANINGS[f].length > 12) {
    fit(words[0], 'italic', 15, 108, 108, '#14532d')
    fit(words.slice(1).join(' '), 'italic', 15, 108, 124, '#14532d')
  } else fit(MEANINGS[f], 'italic', 16, 108, 114, '#14532d')
  // The elder, pointing at it: a kufi, a grey beard and a long dashiki.
  ctx.fillStyle = '#e5e7eb'
  rr(ctx, 40, 176, 15, 78, 5)
  rr(ctx, 60, 176, 15, 78, 5)
  ctx.fillStyle = '#78716c'
  rr(ctx, 36, 250, 24, 8, 4)
  rr(ctx, 58, 250, 26, 8, 4)
  arm(ctx, [42, 116, 34, 150, 42, 176], 12, shade(color, -0.2))
  dot(ctx, 42, 178, 6, DEEP)
  ctx.fillStyle = color
  rr(ctx, 32, 102, 52, 94, 14)
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(44, 104)
  ctx.lineTo(72, 104)
  ctx.lineTo(58, 132)
  ctx.fill()
  kente(ctx, 32, 184, 52, 9, 3)
  head(ctx, 60, 82, 18, DEEP, 1)
  ctx.fillStyle = '#d1d5db'
  ctx.beginPath()
  ctx.moveTo(50, 88)
  ctx.quadraticCurveTo(62, 116, 78, 90)
  ctx.quadraticCurveTo(64, 98, 50, 88)
  ctx.fill()
  ctx.save()
  ctx.beginPath()
  ctx.rect(40, 54, 42, 22)
  ctx.clip()
  ctx.beginPath()
  ctx.ellipse(60, 76, 19, 17, 0, Math.PI, 0)
  ctx.fillStyle = '#16a34a'
  ctx.fill()
  kente(ctx, 40, 64, 42, 6, 1)
  ctx.restore()
  arm(ctx, [76, 112, 92, 104, 104, 92], 12, color)
  dot(ctx, 105, 91, 6, DEEP)
}

// -- the unity cup -------------------------------------------------------------------------------------

function unityCup(raising: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const up = raising ? Math.sin(Math.min(1, p / 0.4) * (Math.PI / 2)) : 0
    const shake = raising && p > 0.4 ? Math.sin(p * TAU * 4) * 2 : 0
    // The table: a woven mkeka mat, ears of corn and a bowl of fruit.
    ctx.fillStyle = '#a16207'
    rr(ctx, 98, 172, 128, 8, 3)
    ctx.fillRect(104, 180, 6, 48)
    ctx.fillRect(214, 180, 6, 48)
    ctx.fillStyle = '#d6a85c'
    rr(ctx, 102, 164, 120, 10, 2)
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = 1
    for (let x = 106; x < 222; x += 8) {
      ctx.beginPath()
      ctx.moveTo(x, 164)
      ctx.lineTo(x + 4, 174)
      ctx.stroke()
    }
    for (const [x, a] of [[122, -0.3], [212, 0.4]] as const) {
      ctx.save()
      ctx.translate(x, 158)
      ctx.rotate(a)
      ctx.fillStyle = '#84cc16'
      ellipse(ctx, -6, 2, 12, 4, 0.3)
      ctx.fill()
      ctx.fillStyle = '#facc15'
      ellipse(ctx, 2, 0, 14, 5)
      ctx.fill()
      ctx.strokeStyle = '#ca8a04'
      for (let k = -10; k < 14; k += 4) {
        ctx.beginPath()
        ctx.moveTo(k, -4)
        ctx.lineTo(k, 4)
        ctx.stroke()
      }
      ctx.restore()
    }
    dot(ctx, 158, 150, 8, '#ef4444')
    dot(ctx, 172, 146, 8, '#22c55e')
    dot(ctx, 186, 150, 8, '#f97316')
    ctx.strokeStyle = '#facc15'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(172, 136, 16, 0.4, 1.6)
    ctx.stroke()
    ctx.fillStyle = '#b45309'
    ctx.beginPath()
    ctx.ellipse(172, 154, 26, 10, 0, 0, Math.PI)
    ctx.fill()
    // The elder raising the kikombe cha umoja.
    ctx.fillStyle = '#e5e7eb'
    rr(ctx, 50, 178, 15, 52, 5)
    rr(ctx, 70, 178, 15, 52, 5)
    ctx.fillStyle = '#78716c'
    rr(ctx, 46, 226, 24, 8, 4)
    rr(ctx, 68, 226, 26, 8, 4)
    const cx = 104 + up * 8 + shake
    const cy = 132 - up * 90
    arm(ctx, [52, 114, 52 + up * 22, 140 - up * 52, cx - 8, cy + 8], 12, shade(color, -0.2))
    ctx.fillStyle = color
    rr(ctx, 42, 104, 52, 84, 14)
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(54, 106)
    ctx.lineTo(82, 106)
    ctx.lineTo(68, 134)
    ctx.fill()
    kente(ctx, 42, 176, 52, 8, 0)
    head(ctx, 70, 84, 18, BROWN, 1, { open: up > 0.8 ? 0.7 : 0 })
    ctx.save()
    ctx.beginPath()
    ctx.rect(50, 52, 42, 26)
    ctx.clip()
    ctx.beginPath()
    ctx.ellipse(70, 78, 20, 20, 0, Math.PI, 0)
    ctx.fillStyle = color2
    ctx.fill()
    kente(ctx, 50, 66, 42, 6, 2)
    ctx.restore()
    if (up > 0.7) glow(ctx, cx, cy - 14, 26, '#fde68a', 0.5 * up)
    ctx.fillStyle = '#eab308'
    ctx.beginPath()
    ctx.moveTo(cx - 14, cy - 24)
    ctx.lineTo(cx + 14, cy - 24)
    ctx.quadraticCurveTo(cx + 12, cy - 4, cx + 2, cy - 2)
    ctx.lineTo(cx + 2, cy + 10)
    ctx.lineTo(cx + 9, cy + 14)
    ctx.lineTo(cx - 9, cy + 14)
    ctx.lineTo(cx - 2, cy + 10)
    ctx.lineTo(cx - 2, cy - 2)
    ctx.quadraticCurveTo(cx - 12, cy - 4, cx - 14, cy - 24)
    ctx.fill()
    ctx.fillStyle = '#fde68a'
    ctx.fillRect(cx - 10, cy - 22, 5, 14)
    arm(ctx, [86, 114, 102 + up * 6, 140 - up * 50, cx + 6, cy + 6], 12, color)
    dot(ctx, cx - 8, cy + 8, 6, BROWN)
    dot(ctx, cx + 6, cy + 6, 6, BROWN)
  }
}

// -- a harvest basket carried home -------------------------------------------------------------------------

function basketCarrier(waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const s = Math.sin(p)
    const bob = Math.abs(Math.cos(p)) * 3
    ctx.translate(0, -bob)
    // Feet stepping under a long dress.
    ctx.fillStyle = shade(BROWN, -0.1)
    ellipse(ctx, 84 + s * 12, 234 + bob, 10, 4)
    ctx.fill()
    ellipse(ctx, 96 - s * 12, 234 + bob, 10, 4)
    ctx.fill()
    // Far arm swinging, or up waving.
    if (waving) {
      const w = Math.sin(p * 2) * 12
      arm(ctx, [80, 108, 64, 84, 60 + w, 58], 9, shade(BROWN, -0.15))
      dot(ctx, 60 + w, 56, 6, shade(BROWN, -0.15))
    } else arm(ctx, [82, 110, 76 - s * 10, 140, 74 - s * 18, 166], 9, shade(BROWN, -0.15))
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(76, 102)
    ctx.lineTo(108, 102)
    ctx.quadraticCurveTo(112, 170, 124 - s * 6, 230)
    ctx.lineTo(60 - s * 6, 230)
    ctx.quadraticCurveTo(70, 170, 76, 102)
    ctx.fill()
    ctx.save()
    ctx.clip()
    kente(ctx, 50, 200, 84, 12, 1)
    ctx.restore()
    ctx.fillStyle = color2
    ctx.fillRect(74, 140, 38, 6)
    head(ctx, 96, 84, 16, BROWN, 1, { open: waving ? 0.6 : 0 })
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.ellipse(94, 74, 19, 11, 0, Math.PI, 0)
    ctx.fill()
    // The basket on her head, full: oranges, apples, bananas, a pineapple top.
    ctx.fillStyle = '#d97706'
    ctx.beginPath()
    ctx.moveTo(62, 50)
    ctx.lineTo(126, 50)
    ctx.lineTo(118, 70)
    ctx.lineTo(70, 70)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#92400e'
    ctx.lineWidth = 1.5
    for (let k = 0; k < 7; k++) {
      ctx.beginPath()
      ctx.moveTo(66 + k * 9, 52)
      ctx.lineTo(72 + k * 7.5, 68)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(64, 60)
    ctx.lineTo(122, 60)
    ctx.stroke()
    ctx.fillStyle = '#16a34a'
    for (let k = 0; k < 4; k++) {
      ctx.beginPath()
      ctx.moveTo(108, 34)
      ctx.lineTo(100 + k * 6, 14 + (k % 2) * 4)
      ctx.lineTo(106 + k * 4, 34)
      ctx.fill()
    }
    ctx.fillStyle = '#ca8a04'
    ellipse(ctx, 108, 42, 10, 12)
    ctx.fill()
    dot(ctx, 74, 46, 8, '#f97316')
    dot(ctx, 88, 42, 9, '#ef4444')
    ctx.strokeStyle = '#facc15'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(94, 30, 16, 0.6, 1.9)
    ctx.stroke()
    dot(ctx, 120, 46, 7, '#a3e635')
    // Near arm up, steadying the basket.
    arm(ctx, [104, 110, 124, 88, 122, 60], 9, BROWN)
    dot(ctx, 122, 60, 5.5, BROWN)
  }
}

const BUBBLE = { id: 'bubble', frames: 1, w: 360, h: 140 }

export const HANUKKAH_KWANZAA_ROWS: Record<string, SpriteRow[]> = {
  'latke-chef': [
    { id: 'main', frames: 4, w: 210, h: 240, paint: latkeChef(false) },
    { id: 'act', frames: 8, w: 210, h: 240, paint: latkeChef(true) },
    { ...BUBBLE, paint: saying('Hot latkes!') },
    SPARKLE,
  ],
  'dreidel-game': [
    { id: 'main', frames: 4, w: 240, h: 200, paint: dreidelGame(false) },
    { id: 'act', frames: 8, w: 240, h: 200, paint: dreidelGame(true) },
    { ...BUBBLE, paint: saying('Gimel!') },
    SPARKLE,
  ],
  // None lit, to all eight and the shamash.
  'window-menorah': [
    { id: 'main', frames: 9, w: 220, h: 180, paint: windowMenorah },
    { ...BUBBLE, paint: saying('Happy Hanukkah!') },
    SPARKLE,
  ],
  'klezmer-band': [
    { id: 'main', frames: 4, w: 240, h: 250, paint: klezmer(false) },
    { id: 'act', frames: 8, w: 240, h: 250, paint: klezmer(true) },
    { id: 'note', frames: 2, w: 64, h: 64, paint: note },
    { ...BUBBLE, paint: saying('Chag sameach!') },
    SPARKLE,
  ],
  sufganiyot: [
    { id: 'main', frames: 4, w: 220, h: 236, paint: sufganiyot(false) },
    { id: 'act', frames: 8, w: 220, h: 236, paint: sufganiyot(true) },
    { ...BUBBLE, paint: saying('Sufganiyot!') },
    SPARKLE,
  ],
  'djembe-drummer': [
    { id: 'main', frames: 4, w: 200, h: 232, paint: djembeDrummer(false) },
    { id: 'act', frames: 8, w: 200, h: 232, paint: djembeDrummer(true) },
    { id: 'note', frames: 2, w: 64, h: 64, paint: note },
    SPARKLE,
  ],
  'kwanzaa-dancers': [
    { id: 'main', frames: 6, w: 240, h: 240, paint: kwanzaaDancers(false) },
    { id: 'act', frames: 8, w: 240, h: 240, paint: kwanzaaDancers(true) },
    { ...BUBBLE, paint: saying('Heri za Kwanzaa!') },
    SPARKLE,
  ],
  // Umoja to Imani, one for each day of Kwanzaa.
  'habari-gani': [
    { id: 'main', frames: 7, w: 230, h: 260, paint: habariGani },
    { ...BUBBLE, paint: saying('Habari gani?') },
    SPARKLE,
  ],
  'unity-cup': [
    { id: 'main', frames: 4, w: 230, h: 236, paint: unityCup(false) },
    { id: 'act', frames: 8, w: 230, h: 236, paint: unityCup(true) },
    { ...BUBBLE, paint: saying('Harambee!') },
    SPARKLE,
  ],
  'harvest-basket': [
    { id: 'main', frames: 8, w: 180, h: 240, paint: basketCarrier(false) },
    { id: 'wave', frames: 8, w: 180, h: 240, paint: basketCarrier(true) },
    SPARKLE,
  ],
}
