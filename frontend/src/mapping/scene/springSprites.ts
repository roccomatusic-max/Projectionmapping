/**
 * Pictures for St Patrick's Day and Easter: Irish step dancers, a leprechaun
 * trap that snaps shut, a harpist, children hunting eggs, a bunny painting an
 * egg, lambs springing, an egg roll and an Easter bonnet out for a stroll.
 *
 * Painted the same way as sprites.ts: facing right, one frame at a time,
 * into a cell of w by h design units.
 */

import { note } from './halloweenSprites'
import { arm, dot, head, rr, standing, type Dress } from './figures'
import {
  ellipse, rgba, saying, shade, SPARKLE, TAU,
  type Ctx, type SpriteColors, type SpriteRow,
} from './sprites'

const TAN = '#c68a5a'
const BROWN = '#9a6440'
const PEACH = '#f5c9a0'
const EGGS = ['#f472b6', '#38bdf8', '#facc15', '#a78bfa', '#4ade80', '#fb923c']

/** An egg at (x, y), size r, tipped by a, with two stripes of zigzag. */
function egg(ctx: Ctx, x: number, y: number, r: number, a: number, c: string, c2: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(a)
  ctx.fillStyle = c
  ellipse(ctx, 0, 0, r * 0.78, r)
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.strokeStyle = c2
  ctx.lineWidth = r * 0.18
  for (const yy of [-r * 0.3, r * 0.3]) {
    ctx.beginPath()
    for (let k = 0; k <= 6; k++) ctx.lineTo(-r + (k * 2 * r) / 6, yy + (k % 2 ? -r * 0.12 : r * 0.12))
    ctx.stroke()
  }
  ctx.restore()
  ctx.fillStyle = rgba('#ffffff', 0.35)
  ellipse(ctx, -r * 0.3, -r * 0.4, r * 0.18, r * 0.28, -0.3)
  ctx.fill()
  ctx.restore()
}

function grass(ctx: Ctx, x0: number, x1: number, g: number, h: number) {
  ctx.fillStyle = '#22c55e'
  for (let x = x0; x < x1; x += 7) {
    ctx.beginPath()
    ctx.moveTo(x, g)
    ctx.lineTo(x + 3, g - h * (0.6 + 0.4 * ((x * 7) % 5) / 5))
    ctx.lineTo(x + 6, g)
    ctx.fill()
  }
}

// -- Irish step dancers ----------------------------------------------------------------------------------

function irishDancers(dancing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 236
    const dancer = (x: number, dir: number, dress: string, trim: string, hair: string, ph: number) => {
      const q = (p + ph) % 1
      const hop = dancing ? Math.abs(Math.sin(q * TAU)) * 12 : Math.abs(Math.sin(q * TAU * 2)) * 3
      // Which foot is up, and how high (a high kick for people).
      const right = Math.sin(q * TAU) > 0
      const kick = dancing ? Math.abs(Math.sin(q * TAU)) : Math.abs(Math.sin(q * TAU)) * 0.25
      ctx.save()
      ctx.translate(0, -hop)
      for (const [up, sx] of [[right, 6], [!right, -6]] as const) {
        const fx = up ? x + dir * (10 + kick * 34) : x + sx * 0.6
        const fy = up ? g - 6 - kick * 70 : g - 4
        arm(ctx, [x + sx * 0.6, g - 72, up ? x + dir * (6 + kick * 22) : x + sx * 0.6, up ? g - 40 - kick * 44 : g - 36, fx, fy], 9, '#f8fafc')
        ctx.fillStyle = '#475569'
        ellipse(ctx, fx + dir * 4, fy + 2, 9, 4, up ? -dir * kick * 0.8 : 0)
        ctx.fill()
      }
      // Arms held straight down at her sides, the stiff dress with Celtic knots.
      arm(ctx, [x - 12, g - 128, x - 16, g - 98, x - 16, g - 80], 8, shade(dress, -0.15))
      ctx.fillStyle = dress
      ctx.beginPath()
      ctx.moveTo(x - 13, g - 132)
      ctx.lineTo(x + 13, g - 132)
      ctx.lineTo(x + 16, g - 96)
      ctx.lineTo(x + 32, g - 64)
      ctx.lineTo(x - 32, g - 64)
      ctx.lineTo(x - 16, g - 96)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = trim
      ctx.lineWidth = 2.5
      for (const [cx, cy] of [[x - 16, g - 76], [x, g - 74], [x + 16, g - 76], [x, g - 112]] as const) {
        ctx.beginPath()
        ctx.arc(cx, cy, 6, 0, TAU)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(cx - 6, cy)
        ctx.lineTo(cx + 6, cy)
        ctx.stroke()
      }
      ctx.fillStyle = trim
      ctx.fillRect(x - 32, g - 68, 64, 4)
      arm(ctx, [x + 12, g - 128, x + 16, g - 98, x + 16, g - 80], 8, dress)
      dot(ctx, x - 16, g - 78, 4.5, PEACH)
      dot(ctx, x + 16, g - 78, 4.5, PEACH)
      // Big ringlet curls and a headband.
      for (let k = 0; k < 9; k++) dot(ctx, x - 18 + (k % 3) * 18 + (k > 5 ? 0 : 0), g - 160 + Math.floor(k / 3) * 14, 7, hair)
      head(ctx, x + dir * 2, g - 148, 15, PEACH, dir, { open: dancing ? 0.4 : 0 })
      ctx.fillStyle = hair
      ctx.beginPath()
      ctx.arc(x + dir * 2, g - 150, 16, Math.PI * 1.02, Math.PI * 1.98)
      ctx.fill()
      ctx.fillStyle = trim
      ctx.fillRect(x - 14, g - 162, 30, 4)
      ctx.restore()
    }
    dancer(72, 1, color, color2, '#b45309', 0)
    dancer(168, -1, color2, color, '#78350f', 0.25)
  }
}

// -- a leprechaun trap -----------------------------------------------------------------------------------

function leprechaun(ctx: Ctx, x: number, g: number, dir: number, step: number, laughing: boolean, color: string) {
  ctx.save()
  ctx.translate(x, g)
  ctx.scale(dir * 0.55, 0.55)
  const d: Dress = { skin: PEACH, hair: '#ea580c', shirt: color, pants: '#15803d', shoes: '#57534e' }
  standing(ctx, 0, 0, 1, d, { stride: step, open: laughing ? 0.8 : 0 })
  // Orange beard, a tall hat with a gold buckle.
  ctx.fillStyle = '#ea580c'
  ctx.beginPath()
  ctx.moveTo(-6, -112)
  ctx.quadraticCurveTo(8, -84, 20, -112)
  ctx.quadraticCurveTo(8, -104, -6, -112)
  ctx.fill()
  ctx.fillStyle = '#15803d'
  rr(ctx, -20, -136, 44, 6, 3)
  rr(ctx, -12, -168, 28, 34, 3)
  ctx.fillStyle = '#facc15'
  ctx.fillRect(-12, -144, 28, 6)
  ctx.strokeStyle = '#facc15'
  ctx.lineWidth = 2
  ctx.strokeRect(-2, -146, 8, 10)
  arm(ctx, [10, -96, 22, -80, 30, -90], 9, color)
  dot(ctx, 30, -90, 5, PEACH)
  if (laughing) dot(ctx, 34, -96, 6, '#facc15')
  ctx.restore()
}

function leprechaunTrap(sprung: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const g = 196
    const p = f / frames
    // Before it springs (frames 0 to 3) he creeps in from the right for the gold; then the box drops.
    const down = sprung && p >= 0.5
    const lepX = sprung ? (p < 0.5 ? 220 - (p / 0.5) * 70 : 150) : 260
    // The bait: a little pile of gold coins.
    if (!down) {
      for (const [x, y] of [[124, g - 4], [134, g - 2], [129, g - 8], [118, g - 1]] as const) {
        ctx.fillStyle = '#ca8a04'
        ellipse(ctx, x, y + 1, 6, 3)
        ctx.fill()
        ctx.fillStyle = '#facc15'
        ellipse(ctx, x, y, 6, 3)
        ctx.fill()
      }
      if (f % 2 === 0) dot(ctx, 132, g - 12, 2, '#ffffff')
    }
    if (sprung && !down) leprechaun(ctx, lepX, g, -1, Math.sin(p * TAU * 4), false, color)
    // The box: propped on a stick over the gold, or dropped and rattling.
    const ang = down ? Math.sin(p * TAU * 4) * 0.03 : -0.5
    ctx.save()
    ctx.translate(80, g)
    ctx.rotate(ang)
    ctx.fillStyle = color
    rr(ctx, 0, -60, 110, 60, 4)
    ctx.fillStyle = shade(color, -0.2)
    ctx.fillRect(0, -60, 110, 8)
    ctx.fillStyle = color2
    for (const [x, y] of [[28, -28], [60, -34], [90, -22]] as const) {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU - Math.PI / 2
        dot(ctx, x + Math.cos(a) * 5, y + Math.sin(a) * 5, 5, color2)
      }
    }
    ctx.restore()
    if (!down) {
      ctx.strokeStyle = '#a16207'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(154, g)
      ctx.lineTo(166, g - 52)
      ctx.stroke()
    } else {
      ctx.strokeStyle = '#a16207'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(196, g - 2)
      ctx.lineTo(240, g - 10)
      ctx.stroke()
      if (p >= 0.75) {
        // Popping out of the top with a coin, laughing.
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, 240, g - 60)
        ctx.clip()
        leprechaun(ctx, 136, g - 60 + 50 - ((p - 0.75) / 0.25) * 30, 1, 0, true, color)
        ctx.restore()
      } else {
        // Rattling.
        ctx.strokeStyle = rgba('#ffffff', 0.7)
        ctx.lineWidth = 2
        for (const s of [-1, 1]) {
          ctx.beginPath()
          ctx.moveTo(135 + s * 64, g - 40)
          ctx.lineTo(135 + s * 72, g - 46)
          ctx.moveTo(135 + s * 64, g - 24)
          ctx.lineTo(135 + s * 74, g - 24)
          ctx.stroke()
        }
      }
    }
    // A little ladder up to it.
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(22, g)
    ctx.lineTo(44, g - 70)
    ctx.moveTo(36, g)
    ctx.lineTo(58, g - 70)
    for (let k = 1; k < 6; k++) {
      ctx.moveTo(22 + k * 3.7, g - k * 12)
      ctx.lineTo(36 + k * 3.7, g - k * 12)
    }
    ctx.stroke()
  }
}

// -- a harpist -----------------------------------------------------------------------------------------

function harpist(playing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 236
    // Stool.
    ctx.fillStyle = '#a16207'
    rr(ctx, 36, g - 66, 50, 10, 4)
    ctx.fillRect(42, g - 56, 6, 56)
    ctx.fillRect(74, g - 56, 6, 56)
    // The harp: a soundbox leaning back to her, the pillar, the curved neck, and its strings.
    ctx.fillStyle = '#b45309'
    ctx.beginPath()
    ctx.moveTo(110, g - 4)
    ctx.lineTo(96, g - 150)
    ctx.lineTo(108, g - 152)
    ctx.lineTo(124, g - 4)
    ctx.fill()
    ctx.fillStyle = '#92400e'
    ctx.fillRect(170, g - 150, 9, 148)
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(98, g - 154)
    ctx.quadraticCurveTo(140, g - 190, 182, g - 160)
    ctx.lineTo(180, g - 148)
    ctx.quadraticCurveTo(140, g - 176, 104, g - 142)
    ctx.fill()
    ctx.fillStyle = '#a16207'
    rr(ctx, 104, g - 6, 80, 8, 3)
    ctx.strokeStyle = rgba('#fef3c7', 0.85)
    ctx.lineWidth = 1.2
    for (let k = 0; k < 10; k++) {
      const u = (k + 0.5) / 10
      const topY = g - 150 - Math.sin(u * Math.PI) * 18 + u * 6
      const wob = playing && k % 3 === f % 3 ? Math.sin(p * 6) * 1.5 : 0
      ctx.beginPath()
      ctx.moveTo(106 + u * 66, topY)
      ctx.lineTo(116 + u * 58 + wob, g - 8 - u * 6)
      ctx.stroke()
    }
    // The harpist: long red hair, a green dress, reaching into the strings.
    const pluckA = playing ? Math.sin(p * 2) * 10 : Math.sin(p) * 4
    const pluckB = playing ? Math.cos(p * 2) * 10 : Math.cos(p) * 4
    ctx.fillStyle = '#ea580c'
    ellipse(ctx, 58, g - 118, 18, 34)
    ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(46, g - 136)
    ctx.lineTo(74, g - 136)
    ctx.lineTo(102, g - 4)
    ctx.lineTo(40, g - 4)
    ctx.closePath()
    ctx.fill()
    head(ctx, 64, g - 150, 15, PEACH, 1, { blink: true })
    ctx.fillStyle = '#ea580c'
    ctx.beginPath()
    ctx.arc(64, g - 152, 16, Math.PI * 1.02, Math.PI * 1.95)
    ctx.fill()
    ctx.fillStyle = color2
    ctx.fillRect(48, g - 164, 30, 3)
    arm(ctx, [56, g - 128, 90, g - 116, 130 + pluckA, g - 110 + pluckA * 0.5], 8, shade(color, -0.15))
    dot(ctx, 130 + pluckA, g - 110 + pluckA * 0.5, 4.5, PEACH)
    arm(ctx, [70, g - 128, 98, g - 90, 140 + pluckB, g - 76 + pluckB * 0.5], 8, color)
    dot(ctx, 140 + pluckB, g - 76 + pluckB * 0.5, 4.5, PEACH)
  }
}

// -- children hunting eggs ---------------------------------------------------------------------------------

function eggHunt(found: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 196
    // Eggs hidden in the grass.
    egg(ctx, 30, g - 8, 9, 0.4, EGGS[0], '#ffffff')
    egg(ctx, 206, g - 8, 9, -0.3, EGGS[1], '#ffffff')
    egg(ctx, 120, g - 6, 8, 0.2, EGGS[2], '#ffffff')
    // One crouched, peering into the grass.
    const look = Math.sin(p * TAU) * 0.15
    ctx.save()
    ctx.translate(70, g)
    ctx.scale(0.8, 0.8)
    arm(ctx, [-4, -50, 18, -36, 22, -4], 11, '#64748b')
    ctx.fillStyle = color
    ctx.save()
    ctx.rotate(0.5 + look)
    rr(ctx, -16, -100, 32, 54, 10)
    ctx.restore()
    head(ctx, 48 + look * 20, -92, 16, TAN, 1)
    ctx.fillStyle = '#292524'
    ctx.beginPath()
    ctx.arc(48 + look * 20, -94, 17, Math.PI * 1.02, Math.PI * 1.98)
    ctx.fill()
    arm(ctx, [26, -70, 44, -40, 54, -16], 9, color)
    ctx.restore()
    // One with a basket: looking about, or jumping up with an egg held high.
    const jump = found ? Math.sin(Math.min(1, p / 0.4) * Math.PI) * 18 : 0
    const d: Dress = { skin: PEACH, hair: '#d97706', shirt: color2 }
    ctx.save()
    ctx.translate(170, g - jump)
    ctx.scale(0.8, 0.8)
    standing(ctx, 0, 0, -1, d, { skirt: true, open: found ? 0.8 : 0 })
    // The basket.
    arm(ctx, [10, -96, 18, -70, 18, -56], 8, color2)
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(22, -52, 14, Math.PI, 0)
    ctx.stroke()
    ctx.fillStyle = '#d97706'
    ctx.beginPath()
    ctx.moveTo(6, -52)
    ctx.lineTo(38, -52)
    ctx.lineTo(34, -32)
    ctx.lineTo(10, -32)
    ctx.fill()
    egg(ctx, 16, -56, 6, -0.3, EGGS[3], '#ffffff')
    egg(ctx, 28, -56, 6, 0.3, EGGS[4], '#ffffff')
    if (found) {
      arm(ctx, [-10, -96, -20, -124, -20, -150], 8, color2)
      egg(ctx, -20, -164, 11, Math.sin(p * TAU * 2) * 0.3, EGGS[5], '#ffffff')
    } else {
      arm(ctx, [-10, -96, -22, -76, -18, -60], 8, color2)
    }
    ctx.restore()
    grass(ctx, 0, 240, g, 16)
  }
}

// -- a bunny painting an egg ----------------------------------------------------------------------------------

function bunnyPainter(painting: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 206
    // The big egg on its stand, stripes going on one by one.
    ctx.fillStyle = '#a16207'
    rr(ctx, 120, g - 22, 70, 10, 3)
    ctx.fillRect(130, g - 12, 6, 12)
    ctx.fillRect(174, g - 12, 6, 12)
    const done = painting ? f + 1 : 1
    ctx.save()
    ctx.translate(155, g - 72)
    ctx.fillStyle = '#fef9c3'
    ellipse(ctx, 0, 0, 38, 50)
    ctx.fill()
    ctx.clip()
    const bands = [color, color2, '#facc15', '#4ade80']
    for (let k = 0; k < Math.min(done, 8); k++) {
      const y = -42 + k * 12
      ctx.strokeStyle = bands[k % 4]
      ctx.lineWidth = 6
      ctx.beginPath()
      for (let j = 0; j <= 8; j++) ctx.lineTo(-40 + j * 10, y + (j % 2 ? -4 : 4))
      ctx.stroke()
    }
    ctx.restore()
    // The paint pot.
    ctx.fillStyle = '#94a3b8'
    rr(ctx, 20, g - 22, 28, 22, 4)
    ctx.fillStyle = bands[(done - 1) % 4]
    ellipse(ctx, 34, g - 22, 14, 4)
    ctx.fill()
    // The bunny, standing up, brush in paw.
    const fur = '#f8fafc'
    ctx.fillStyle = fur
    ellipse(ctx, 76, g - 10, 18, 8)
    ctx.fill()
    ellipse(ctx, 76, g - 54, 28, 40)
    ctx.fill()
    ctx.fillStyle = '#fbcfe8'
    ellipse(ctx, 82, g - 48, 16, 26)
    ctx.fill()
    dot(ctx, 52, g - 34, 10, fur)
    const tilt = painting ? Math.sin(p * TAU * 2) * 0.08 : 0
    ctx.save()
    ctx.translate(80, g - 104)
    ctx.rotate(tilt)
    for (const [x, a] of [[-10, -0.25], [8, 0.2]] as const) {
      ctx.fillStyle = fur
      ellipse(ctx, x, -34, 9, 26, a)
      ctx.fill()
      ctx.fillStyle = '#fbcfe8'
      ellipse(ctx, x, -32, 4, 18, a)
      ctx.fill()
    }
    ctx.fillStyle = fur
    ellipse(ctx, 0, 0, 24, 20)
    ctx.fill()
    dot(ctx, 8, -4, 3, '#1f2937')
    dot(ctx, 20, 2, 3, '#f472b6')
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 1
    for (const k of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(20, 4)
      ctx.lineTo(36, 2 + k * 5)
      ctx.stroke()
    }
    ctx.strokeStyle = '#be185d'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(16, 8, 4, 0.2, Math.PI - 0.2)
    ctx.stroke()
    ctx.restore()
    // The brush: dabbing on the egg, or dipping in the pot.
    const bx = painting ? 112 + Math.sin(p * TAU * 2) * 4 : 44 + Math.sin(p * TAU) * 2
    const by = painting ? g - 110 + done * 10 : g - 34 + Math.abs(Math.sin(p * TAU)) * -10
    arm(ctx, [92, g - 72, 104, g - 70, bx - 8, by + 8], 9, fur)
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(bx - 10, by + 10)
    ctx.lineTo(bx + 6, by - 4)
    ctx.stroke()
    dot(ctx, bx + 7, by - 5, 4, bands[(done - 1) % 4])
  }
}

// -- springing lambs --------------------------------------------------------------------------------------

function lamb(pronking: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 166
    const hop = pronking ? Math.abs(Math.sin(p)) * 34 : 0
    ctx.translate(0, -hop)
    // Thin legs: walking, or all four straight down for a pronk.
    for (const [x, ph, far] of [[56, 0, true], [104, Math.PI, true], [64, Math.PI, false], [112, 0, false]] as const) {
      const k = pronking ? 0 : Math.sin(p + ph) * 0.4
      ctx.strokeStyle = far ? '#78716c' : '#a8a29e'
      ctx.lineWidth = 6
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x, g - 50)
      ctx.lineTo(x + Math.sin(k) * 30, g - 6 + hop * 0 - (pronking ? 0 : Math.abs(k) * 6))
      ctx.stroke()
      dot(ctx, x + Math.sin(k) * 30, g - 4 - (pronking ? 0 : Math.abs(k) * 6), 4, '#57534e')
    }
    // A fleecy body of curls.
    ctx.fillStyle = color
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU
      ellipse(ctx, 84 + Math.cos(a) * 34, g - 64 + Math.sin(a) * 18, 14, 13)
      ctx.fill()
    }
    ellipse(ctx, 84, g - 64, 36, 22)
    ctx.fill()
    ctx.fillStyle = shade(color, -0.08)
    for (let k = 0; k < 6; k++) dot(ctx, 66 + k * 8, g - 64 + (k % 2) * 8, 5, shade(color, -0.08))
    dot(ctx, 46, g - 72, 9, color)
    // Head: a soft face, floppy ears, a ribbon.
    const nod = pronking ? -0.2 : Math.sin(p * 2) * 0.08
    ctx.save()
    ctx.translate(124, g - 80)
    ctx.rotate(nod)
    ctx.fillStyle = '#e7e5e4'
    ellipse(ctx, 6, 0, 14, 18, 0.5)
    ctx.fill()
    dot(ctx, -2, -14, 10, color)
    ctx.fillStyle = '#d6d3d1'
    ellipse(ctx, -10, -2, 10, 5, 0.6)
    ctx.fill()
    dot(ctx, 8, -4, 2.4, '#1f2937')
    dot(ctx, 16, 10, 2.4, '#f9a8d4')
    ctx.restore()
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(110, g - 70)
    ctx.lineTo(102, g - 60)
    ctx.lineTo(114, g - 62)
    ctx.lineTo(120, g - 52)
    ctx.lineTo(120, g - 64)
    ctx.fill()
    dot(ctx, 114, g - 66, 3.5, color2)
  }
}

// -- an egg roll -----------------------------------------------------------------------------------------

function eggRoll(cheering: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 166
    // The egg, rolling along in front.
    egg(ctx, 176, g - 16, 15, p * TAU, color, '#ffffff')
    grass(ctx, 0, 220, g, 10)
    const d: Dress = { skin: BROWN, hair: '#292524', shirt: color2 }
    ctx.save()
    ctx.translate(90, g)
    ctx.scale(0.8, 0.8)
    if (cheering) {
      standing(ctx, 0, 0, 1, d, { open: 0.8, stride: Math.sin(p * TAU) * 0.5 })
      const w = Math.sin(p * TAU * 2) * 10
      arm(ctx, [10, -96, 22, -120, 28 + w, -144], 9, d.shirt)
      ctx.strokeStyle = '#a16207'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(28 + w, -144)
      ctx.lineTo(40 + w, -190)
      ctx.stroke()
      ctx.fillStyle = '#a16207'
      ellipse(ctx, 42 + w, -196, 6, 9)
      ctx.fill()
      arm(ctx, [-10, -96, -24, -116, -30, -140], 9, shade(d.shirt, -0.15))
    } else {
      // Bent over, pushing it along with a long spoon.
      arm(ctx, [-6, -50, -12 + Math.sin(p * TAU) * 6, -24, -16 + Math.sin(p * TAU) * 12, -4], 11, '#64748b')
      arm(ctx, [6, -50, 14 - Math.sin(p * TAU) * 6, -24, 18 - Math.sin(p * TAU) * 12, -4], 11, '#475569')
      ctx.fillStyle = d.shirt
      ctx.save()
      ctx.translate(0, -50)
      ctx.rotate(0.9)
      rr(ctx, -15, -54, 30, 54, 10)
      ctx.restore()
      head(ctx, 54, -78, 16, d.skin, 1, { open: 0.3 })
      ctx.fillStyle = d.hair
      ctx.beginPath()
      ctx.arc(54, -80, 17, Math.PI * 1.02, Math.PI * 1.98)
      ctx.fill()
      ctx.strokeStyle = '#a16207'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(40, -60)
      ctx.lineTo(96, -16)
      ctx.stroke()
      ctx.fillStyle = '#a16207'
      ellipse(ctx, 100, -12, 9, 6, 0.6)
      ctx.fill()
      arm(ctx, [30, -66, 40, -50, 50, -52], 9, d.shirt)
      dot(ctx, 50, -52, 5, d.skin)
    }
    ctx.restore()
  }
}

// -- an Easter bonnet out for a stroll -----------------------------------------------------------------------

function bonnetStroll(waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 256
    const d: Dress = { skin: TAN, hair: '#292524', shirt: color, shoes: color2 }
    const bob = Math.abs(Math.cos(p)) * 3
    ctx.translate(0, -bob)
    if (waving) {
      const w = Math.sin(p * 2) * 10
      arm(ctx, [80, g - 96, 64, g - 118, 60 + w, g - 140], 9, d.skin)
      dot(ctx, 60 + w, g - 142, 5.5, d.skin)
    } else arm(ctx, [80, g - 96, 76 - Math.sin(p) * 10, g - 70, 74 - Math.sin(p) * 14, g - 50], 9, d.skin)
    standing(ctx, 90, g + bob, 1, d, { skirt: true, stride: Math.sin(p) })
    ctx.fillStyle = color2
    ctx.fillRect(77, g - 96, 26, 5)
    // The bonnet: a wide brim heaped with flowers, a ribbon trailing.
    const tip = Math.sin(p) * 0.04
    ctx.save()
    ctx.translate(92, g - 134)
    ctx.rotate(tip)
    ctx.strokeStyle = color2
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(-30, 2)
    ctx.quadraticCurveTo(-46, 24, -40 + Math.sin(p * 2) * 6, 46)
    ctx.stroke()
    ctx.fillStyle = '#fde68a'
    ellipse(ctx, 0, 0, 58, 12)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(0, -2, 26, 22, 0, Math.PI, 0)
    ctx.fill()
    ctx.fillStyle = color2
    ctx.fillRect(-26, -8, 52, 6)
    const flowers = ['#f472b6', '#a78bfa', '#facc15', '#fb7185', '#38bdf8', '#f9a8d4']
    for (let k = 0; k < 9; k++) {
      const x = -34 + k * 8.5
      const y = -14 - Math.sin((k / 8) * Math.PI) * 22
      ctx.fillStyle = '#16a34a'
      ellipse(ctx, x - 5, y + 6, 6, 3, -0.4)
      ctx.fill()
      for (let j = 0; j < 5; j++) {
        const a = (j / 5) * TAU
        dot(ctx, x + Math.cos(a) * 4.5, y + Math.sin(a) * 4.5, 3.5, flowers[k % flowers.length])
      }
      dot(ctx, x, y, 2.5, '#fef3c7')
    }
    ctx.restore()
    if (waving) {
      arm(ctx, [100, g - 96, 118, g - 118, 132, g - 136], 9, d.skin)
      dot(ctx, 132, g - 136, 5.5, d.skin)
    } else {
      // A little basket on her arm.
      arm(ctx, [100, g - 96, 108, g - 74, 118, g - 70], 9, d.skin)
      ctx.strokeStyle = '#a16207'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(122, g - 64, 10, Math.PI, 0)
      ctx.stroke()
      ctx.fillStyle = '#d97706'
      rr(ctx, 110, g - 64, 24, 14, 4)
      egg(ctx, 118, g - 66, 5, 0.2, EGGS[0], '#ffffff')
      egg(ctx, 127, g - 66, 5, -0.2, EGGS[1], '#ffffff')
    }
  }
}

const BUBBLE = { id: 'bubble', frames: 1, w: 360, h: 140 }

export const SPRING_ROWS: Record<string, SpriteRow[]> = {
  'irish-dancers': [
    { id: 'main', frames: 4, w: 240, h: 240, paint: irishDancers(false) },
    { id: 'act', frames: 8, w: 240, h: 240, paint: irishDancers(true) },
    { id: 'note', frames: 2, w: 64, h: 64, paint: note },
    SPARKLE,
  ],
  'leprechaun-trap': [
    { id: 'main', frames: 2, w: 240, h: 200, paint: leprechaunTrap(false) },
    { id: 'act', frames: 8, w: 240, h: 200, paint: leprechaunTrap(true) },
    { ...BUBBLE, paint: saying('Ye’ll never catch me!') },
    SPARKLE,
  ],
  harpist: [
    { id: 'main', frames: 4, w: 200, h: 240, paint: harpist(false) },
    { id: 'act', frames: 8, w: 200, h: 240, paint: harpist(true) },
    { id: 'note', frames: 2, w: 64, h: 64, paint: note },
    SPARKLE,
  ],
  'egg-hunt': [
    { id: 'main', frames: 4, w: 240, h: 200, paint: eggHunt(false) },
    { id: 'act', frames: 8, w: 240, h: 200, paint: eggHunt(true) },
    { ...BUBBLE, paint: saying('Found one!') },
    SPARKLE,
  ],
  'bunny-painter': [
    { id: 'main', frames: 4, w: 210, h: 210, paint: bunnyPainter(false) },
    { id: 'act', frames: 8, w: 210, h: 210, paint: bunnyPainter(true) },
    { ...BUBBLE, paint: saying('Ta-da!') },
    SPARKLE,
  ],
  lambs: [
    { id: 'main', frames: 8, w: 160, h: 170, paint: lamb(false) },
    { id: 'wave', frames: 8, w: 160, h: 170, paint: lamb(true) },
    SPARKLE,
  ],
  'egg-roll': [
    { id: 'main', frames: 8, w: 220, h: 170, paint: eggRoll(false) },
    { id: 'wave', frames: 8, w: 220, h: 170, paint: eggRoll(true) },
    SPARKLE,
  ],
  'easter-bonnet': [
    { id: 'main', frames: 8, w: 180, h: 260, paint: bonnetStroll(false) },
    { id: 'wave', frames: 8, w: 180, h: 260, paint: bonnetStroll(true) },
    SPARKLE,
  ],
}

