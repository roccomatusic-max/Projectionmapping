/**
 * Winter, Valentine's and early spring: a neighbour shovelling the real snow, an igloo going up, a child catching
 * snowflakes, an ice sculptor, a snowshoe hiker, a ski lift, a sled dog team, chestnuts roasting, the Christmas tree
 * lot, a proposal, a Valentine's mailbox, dyeing Easter eggs and tapping the maples for syrup.
 *
 * Painted the same way as sprites.ts: facing right, one frame at a time, into a cell of w by h design units.
 */

import { arm, dot, head, person, rr, seated, standing, type Dress } from './figures'
import {
  circle, ellipse, heartPath, rgba, saying, shade, SPARKLE, TAU, wheel,
  type Ctx, type SpriteColors, type SpriteRow,
} from './sprites'

const PEACH = '#f5c9a0'
const TAN = '#c68a5a'
const BROWN = '#8d5a3b'

/** A knit hat with a bobble on a head at (x, y). */
function beanie(ctx: Ctx, x: number, y: number, r: number, c: string, bobble = '#f8fafc') {
  ctx.fillStyle = c
  ctx.beginPath()
  ctx.arc(x, y - r * 0.15, r * 1.05, Math.PI, TAU)
  ctx.fill()
  ctx.fillStyle = shade(c, -0.15)
  ctx.fillRect(x - r * 1.05, y - r * 0.3, r * 2.1, r * 0.35)
  dot(ctx, x, y - r * 1.2, r * 0.32, bobble)
}

/** A scarf round the neck at (x, y), its end blowing. */
function scarf(ctx: Ctx, x: number, y: number, c: string, flap: number) {
  ctx.fillStyle = c
  rr(ctx, x - 13, y, 26, 8, 4)
  ctx.beginPath()
  ctx.moveTo(x - 10, y + 4)
  ctx.lineTo(x - 22 - flap, y + 22)
  ctx.lineTo(x - 14 - flap, y + 26)
  ctx.lineTo(x - 4, y + 8)
  ctx.fill()
}

function flakes(ctx: Ctx, p: number, n: number, w: number, h: number) {
  for (let k = 0; k < n; k++) {
    const q = (p + (k * 0.37) % 1) % 1
    dot(ctx, ((k * 53) % w) + Math.sin(q * TAU + k) * 6, q * h, 1.6 + (k % 3) * 0.7, rgba('#f8fafc', 0.85))
  }
}

// -- shovelling the real snow -----------------------------------------------------------------------------------

function snowShoveler(snowing: boolean, acting: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 252
    // The path, the banks of snow either side.
    ctx.fillStyle = '#e2e8f0'
    ctx.beginPath()
    ctx.ellipse(220, g, 70, snowing ? 30 + p * 6 : 22, 0, Math.PI, TAU)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(20, g, 40, 18, 0, Math.PI, TAU)
    ctx.fill()
    const d: Dress = { skin: PEACH, hair: '#78350f', shirt: color, pants: '#475569', shoes: '#334155' }
    const x = 110
    if (snowing && !acting) {
      // Scoop, lift and throw onto the bank.
      const q = (p * 2) % 1
      const lift = q < 0.5 ? q * 2 : 1 - (q - 0.5) * 2
      standing(ctx, x, g, 1, d, { stride: 0.4 - lift * 0.3 })
      beanie(ctx, x + 2, g - 118, 16, color2)
      scarf(ctx, x, g - 104, color2, Math.sin(p * TAU * 2) * 3)
      const bx = x + 50 + lift * 30
      const by = g - 10 - lift * 60
      arm(ctx, [x + 10, g - 98, x + 24, g - 74, x + 28 + lift * 10, g - 62 - lift * 30], 9, d.shirt)
      arm(ctx, [x - 10, g - 98, x + 4, g - 86, x + 10 + lift * 8, g - 84 - lift * 30], 9, shade(d.shirt, -0.1))
      ctx.strokeStyle = '#d6c29a'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(x + 6 + lift * 8, g - 90 - lift * 30)
      ctx.lineTo(bx, by)
      ctx.stroke()
      ctx.fillStyle = '#94a3b8'
      rr(ctx, bx - 4, by - 6, 26, 12, 3)
      if (q < 0.55) {
        ctx.fillStyle = '#f8fafc'
        ctx.beginPath()
        ctx.ellipse(bx + 9, by - 6, 12, 6, 0, Math.PI, TAU)
        ctx.fill()
      } else {
        for (let k = 0; k < 6; k++) dot(ctx, bx + 20 + k * 8, by - 20 + (q - 0.55) * 60 + (k % 2) * 6, 3, '#f8fafc')
      }
      flakes(ctx, p, 22, 280, g)
      return
    }
    // Leaning on the shovel: looking up for snow, or (for people) waving, or flinging a snowy wave of a cheer.
    standing(ctx, x, g, 1, d, { open: acting ? 0.6 : 0, blink: !acting && Math.sin(p * TAU) > 0.9 })
    beanie(ctx, x + 2, g - 118, 16, color2)
    scarf(ctx, x, g - 104, color2, Math.sin(p * TAU) * 3)
    ctx.strokeStyle = '#d6c29a'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(x + 22, g - 96)
    ctx.lineTo(x + 40, g - 6)
    ctx.stroke()
    ctx.fillStyle = '#94a3b8'
    rr(ctx, x + 28, g - 12, 26, 12, 3)
    arm(ctx, [x + 10, g - 98, x + 18, g - 96, x + 22, g - 96], 9, d.shirt)
    if (acting) arm(ctx, [x - 10, g - 98, x - 22, g - 120, x - 22 + Math.sin(p * TAU * 3) * 6, g - 142], 9, shade(d.shirt, -0.1))
    else arm(ctx, [x - 10, g - 98, x - 14, g - 112, x - 2, g - 126], 9, shade(d.shirt, -0.1))
    if (snowing) flakes(ctx, p, 22, 280, g)
  }
}

// -- building an igloo -------------------------------------------------------------------------------------------

/** Level: the igloo rising block by block as people come, the builder popping out of the door at the end. */
function iglooBuilder(ctx: Ctx, f: number, n: number, { color, color2 }: SpriteColors) {
  const k = f / (n - 1)
  const g = 232
  const cx = 150
  const R = 90
  const rows = 6
  const done = k * rows
  for (let row = 0; row < rows; row++) {
    const fill = Math.max(0, Math.min(1, done - row))
    if (fill <= 0) break
    const a0 = (row / rows) * (Math.PI / 2)
    const a1 = ((row + 1) / rows) * (Math.PI / 2)
    const y0 = g - Math.sin(a0) * R
    const y1 = g - Math.sin(a1) * R
    const w0 = Math.cos(a0) * R
    const w1 = Math.cos(a1) * R
    const blocks = Math.max(2, Math.round(8 - row))
    for (let b = 0; b < blocks * fill; b++) {
      const t0 = b / blocks
      const t1 = (b + 1) / blocks
      ctx.fillStyle = (b + row) % 2 ? '#f1f5f9' : '#e2e8f0'
      ctx.beginPath()
      ctx.moveTo(cx - w0 + t0 * w0 * 2, y0)
      ctx.lineTo(cx - w0 + t1 * w0 * 2, y0)
      ctx.lineTo(cx - w1 + t1 * w1 * 2, y1)
      ctx.lineTo(cx - w1 + t0 * w1 * 2, y1)
      ctx.fill()
      ctx.strokeStyle = rgba(color, 0.6)
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }
  // The doorway tunnel.
  ctx.fillStyle = '#e2e8f0'
  ctx.beginPath()
  ctx.ellipse(cx + 70, g, 34, 36, 0, Math.PI, TAU)
  ctx.fill()
  ctx.fillStyle = k > 0.9 ? rgba('#fde68a', 0.85) : '#334155'
  ctx.beginPath()
  ctx.ellipse(cx + 84, g, 16, 22, 0, Math.PI, TAU)
  ctx.fill()
  // The builder: carrying a block while it goes up, then waving from the door, warm light inside.
  const kid: Dress = { skin: BROWN, hair: '#1c1917', shirt: color2, pants: '#475569' }
  if (k < 0.95) {
    person(ctx, 40, g, 0.85, 1, kid, {}, () => {
      beanie(ctx, 2, -118, 16, color)
      arm(ctx, [10, -98, 26, -108, 34, -120], 8, kid.shirt)
      arm(ctx, [-10, -98, 8, -112, 26, -126], 8, kid.shirt)
      ctx.fillStyle = '#f1f5f9'
      rr(ctx, 18, -144, 30, 18, 2)
    })
  } else {
    head(ctx, cx + 84, g - 22, 12, kid.skin, 1, { open: 0.7 })
    beanie(ctx, cx + 84, g - 22, 12, color)
    arm(ctx, [cx + 92, g - 6, cx + 102, g - 22, cx + 104, g - 40], 7, kid.shirt)
    for (let s = 0; s < 4; s++) dot(ctx, cx - 40 + s * 26, g - R - 20 - (s % 2) * 10, 2.5, rgba('#fde68a', 0.8))
  }
}

// -- catching snowflakes ---------------------------------------------------------------------------------------

function snowflakeCatcher(catching: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 242
    const x = 110
    const kid: Dress = { skin: PEACH, hair: '#ca8a04', shirt: color, pants: '#475569' }
    // Head tipped back, tongue out, arms out wide; a flake lands and she giggles.
    const tip = catching ? 0.35 : 0.1
    standing(ctx, x, g, 1, kid, { stride: catching ? Math.sin(p * TAU * 2) * 0.3 : 0 })
    ctx.save()
    ctx.translate(x + 2, g - 104)
    ctx.rotate(-tip)
    head(ctx, 0, -14, 16, kid.skin, 1, { open: catching ? 0.9 : 0.2 })
    beanie(ctx, 0, -14, 16, color2)
    if (catching) {
      ctx.fillStyle = '#f472b6'
      rr(ctx, 6, -6, 6, 7, 3)
    }
    ctx.restore()
    scarf(ctx, x, g - 104, color2, Math.sin(p * TAU) * 4)
    if (catching) {
      arm(ctx, [x - 10, g - 98, x - 34, g - 110, x - 50, g - 124], 8, kid.shirt)
      arm(ctx, [x + 10, g - 98, x + 34, g - 110, x + 50, g - 124], 8, kid.shirt)
      dot(ctx, x - 52, g - 126, 6, color2)
      dot(ctx, x + 52, g - 126, 6, color2)
    } else {
      arm(ctx, [x - 10, g - 98, x - 16, g - 80, x - 12, g - 64], 8, kid.shirt)
      // Holding out a mitten to look at a flake.
      arm(ctx, [x + 10, g - 98, x + 26, g - 96, x + 34, g - 108], 8, kid.shirt)
      dot(ctx, x + 36, g - 110, 6, color2)
    }
    // Big snowflakes, one landing on her tongue now and then.
    const star = (sx: number, sy: number, r: number, a: number) => {
      ctx.strokeStyle = '#f8fafc'
      ctx.lineWidth = 1.6
      for (let k = 0; k < 3; k++) {
        const t = a + (k * Math.PI) / 3
        ctx.beginPath()
        ctx.moveTo(sx - Math.cos(t) * r, sy - Math.sin(t) * r)
        ctx.lineTo(sx + Math.cos(t) * r, sy + Math.sin(t) * r)
        ctx.stroke()
      }
    }
    for (let k = 0; k < 7; k++) {
      const q = (p + k / 7) % 1
      star(20 + ((k * 41) % 240) + Math.sin(q * TAU + k) * 8, q * g, 4 + (k % 3), q * 3)
    }
    if (catching) {
      const q = (p * 2) % 1
      star(x + 20 - q * 6, g - 200 + q * 76, 5, q * 4)
      if (q > 0.9) for (let s = 0; s < 3; s++) dot(ctx, x + 30 + s * 8, g - 140 - s * 6, 2, '#fde68a')
    }
  }
}

// -- the ice sculptor ------------------------------------------------------------------------------------------------

/** Level: a block of ice chipped away into a swan as people come, chips flying. */
function iceSculptor(ctx: Ctx, f: number, n: number, { color, color2 }: SpriteColors) {
  const k = f / (n - 1)
  const g = 252
  const cx = 160
  // The plinth.
  ctx.fillStyle = '#cbd5e1'
  rr(ctx, cx - 50, g - 40, 100, 40, 3)
  const ice = (path: () => void) => {
    const grad = ctx.createLinearGradient(cx - 50, g - 200, cx + 50, g - 40)
    grad.addColorStop(0, rgba('#e0f2fe', 0.95))
    grad.addColorStop(1, rgba(color, 0.75))
    ctx.fillStyle = grad
    ctx.beginPath()
    path()
    ctx.fill()
  }
  // The swan, always the same shape; the block's leftover ice fades as she's carved out.
  ice(() => {
    ctx.moveTo(cx - 44, g - 60)
    ctx.quadraticCurveTo(cx - 30, g - 40, cx + 30, g - 44)
    ctx.quadraticCurveTo(cx + 46, g - 60, cx + 30, g - 90)
    ctx.quadraticCurveTo(cx + 10, g - 70, cx - 4, g - 96)
    ctx.quadraticCurveTo(cx - 16, g - 140, cx - 10, g - 170)
    ctx.quadraticCurveTo(cx - 6, g - 190, cx + 10, g - 186)
    ctx.lineTo(cx + 22, g - 180)
    ctx.lineTo(cx + 8, g - 176)
    ctx.quadraticCurveTo(cx - 2, g - 150, cx + 14, g - 110)
    ctx.quadraticCurveTo(cx - 20, g - 100, cx - 44, g - 60)
  })
  if (k < 1) {
    ctx.fillStyle = rgba('#e0f2fe', 0.75 * (1 - k))
    rr(ctx, cx - 48, g - 200, 96, 160, 4)
    ctx.strokeStyle = rgba('#f8fafc', 0.6 * (1 - k))
    ctx.lineWidth = 2
    ctx.strokeRect(cx - 48, g - 200, 96, 160)
  }
  // Highlights on the finished swan.
  if (k > 0.6) {
    ctx.strokeStyle = rgba('#f8fafc', (k - 0.6) * 2)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx - 8, g - 160)
    ctx.quadraticCurveTo(cx - 12, g - 130, cx - 2, g - 104)
    ctx.moveTo(cx - 30, g - 62)
    ctx.quadraticCurveTo(cx, g - 54, cx + 24, g - 56)
    ctx.stroke()
  }
  // The sculptor with a chisel, chips of ice flying.
  const d: Dress = { skin: TAN, hair: '#1c1917', shirt: color2, pants: '#475569' }
  const x = 74
  const tap = f % 2 ? 4 : -2
  standing(ctx, x, g, 1, d, { open: k > 0.95 ? 0.6 : 0 })
  beanie(ctx, x + 2, g - 118, 16, '#e2e8f0', color2)
  arm(ctx, [x + 10, g - 98, x + 30, g - 110, x + 52 + tap, g - 120 + k * 30], 9, d.shirt)
  arm(ctx, [x - 10, g - 98, x + 16, g - 106, x + 46, g - 116 + k * 30], 9, shade(d.shirt, -0.1))
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x + 54 + tap, g - 122 + k * 30)
  ctx.lineTo(x + 76, g - 126 + k * 30)
  ctx.stroke()
  for (let s = 0; s < 5; s++) {
    const a = -0.6 + s * 0.3
    dot(ctx, x + 84 + Math.cos(a) * (8 + (f % 3) * 8), g - 126 + k * 30 + Math.sin(a) * 14, 2, rgba('#e0f2fe', 0.9))
  }
}

// -- a snowshoe hiker -------------------------------------------------------------------------------------------------

function snowshoeHiker(waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 232
    const x = 80
    const s = Math.sin(p)
    const d: Dress = { skin: PEACH, hair: '#78716c', shirt: color, pants: '#475569', shoes: '#334155' }
    ctx.translate(0, -Math.abs(Math.cos(p)) * 3)
    // Poles planting in turn.
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x - 20 - s * 10, g - 70)
    ctx.lineTo(x - 30 - s * 20, g)
    ctx.stroke()
    standing(ctx, x, g, 1, d, { stride: s * 0.9, open: waving ? 0.6 : 0 })
    // A backpack with a rolled mat.
    ctx.fillStyle = color2
    rr(ctx, x - 30, g - 108, 18, 44, 5)
    ctx.fillStyle = '#e2e8f0'
    rr(ctx, x - 34, g - 116, 26, 10, 5)
    beanie(ctx, x + 2, g - 118, 16, color2)
    scarf(ctx, x, g - 104, '#e2e8f0', Math.sin(p * 2) * 3)
    // The snowshoes, big ovals under each boot.
    for (const k of [-s, s]) {
      const fx = x + k * 14
      ctx.strokeStyle = '#d6c29a'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.ellipse(fx + 4, g - 2, 18, 4, 0, 0, TAU)
      ctx.stroke()
      ctx.lineWidth = 1
      for (let t = -2; t <= 2; t++) {
        ctx.beginPath()
        ctx.moveTo(fx + 4 + t * 6, g - 5)
        ctx.lineTo(fx + 4 + t * 6, g + 1)
        ctx.stroke()
      }
    }
    if (waving) arm(ctx, [x + 10, g - 98, x + 22, g - 120, x + 22 + Math.sin(p * 3) * 6, g - 142], 9, d.shirt)
    else {
      arm(ctx, [x + 10, g - 98, x + 20 + s * 8, g - 84, x + 26 + s * 12, g - 70], 9, d.shirt)
      ctx.strokeStyle = '#cbd5e1'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(x + 26 + s * 12, g - 72)
      ctx.lineTo(x + 34 + s * 22, g)
      ctx.stroke()
    }
    arm(ctx, [x - 10, g - 98, x - 16 - s * 6, g - 84, x - 20 - s * 10, g - 70], 9, shade(d.shirt, -0.1))
    // Footprints behind.
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = rgba('#cbd5e1', 0.5 - k * 0.12)
      ellipse(ctx, x - 50 - k * 34, g + 2, 14, 3)
      ctx.fill()
    }
  }
}

// -- the ski lift ----------------------------------------------------------------------------------------------------

function skiLift(waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 252
    // The slope, the tower and the cable climbing up to the right.
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.moveTo(0, g - 4)
    ctx.lineTo(300, g - 154)
    ctx.stroke()
    ctx.fillStyle = '#94a3b8'
    ctx.fillRect(140, g - 220, 8, 148)
    ctx.fillRect(120, g - 224, 48, 6)
    const cable = (x: number) => g - 150 - x * 0.42
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, cable(0))
    ctx.lineTo(300, cable(300))
    ctx.stroke()
    // Three chairs moving up, the middle one carrying two skiers.
    for (let c = 0; c < 3; c++) {
      const x = ((p + c / 3) % 1) * 360 - 30
      const y = cable(x)
      const swing = Math.sin(p * TAU * 2 + c) * 0.06
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(swing)
      ctx.strokeStyle = '#64748b'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(0, 56)
      ctx.stroke()
      ctx.fillStyle = '#475569'
      rr(ctx, -24, 56, 48, 6, 2)
      rr(ctx, -24, 34, 4, 26, 2)
      if (c === 1) {
        const riders: Array<[number, Dress, string]> = [
          [-10, { skin: PEACH, hair: '#ca8a04', shirt: color, pants: '#475569' }, color2],
          [12, { skin: BROWN, hair: '#1c1917', shirt: color2, pants: '#475569' }, color],
        ]
        riders.forEach(([rx, d, hat], j) => {
          seated(ctx, rx, 96, 38, 0.55, 1, d, waving ? 0.7 : 0)
          beanie(ctx, rx + 1, 96 - 38 - 62 * 0.55, 9, hat)
          // Goggles.
          ctx.fillStyle = '#fbbf24'
          rr(ctx, rx - 2, 96 - 38 - 62 * 0.55 - 4, 12, 5, 2)
          // Skis dangling.
          ctx.fillStyle = j ? '#ef4444' : '#38bdf8'
          rr(ctx, rx + 6, 94, 34, 3, 1.5)
          if (waving) arm(ctx, [rx + 4, 96 - 38 - 24, rx + 10, 96 - 38 - 40, rx + 8 + Math.sin(p * TAU * 3 + j) * 4, 96 - 38 - 54], 5, d.shirt)
        })
      }
      ctx.restore()
    }
    // Pine trees down the slope.
    for (const [tx, ts] of [[40, 0.8], [230, 1], [270, 0.7]] as const) {
      const ty = g - 4 - (tx / 300) * 150
      ctx.fillStyle = '#166534'
      for (let l = 0; l < 3; l++) {
        ctx.beginPath()
        ctx.moveTo(tx - (22 - l * 5) * ts, ty - l * 18 * ts)
        ctx.lineTo(tx, ty - (34 + l * 18) * ts)
        ctx.lineTo(tx + (22 - l * 5) * ts, ty - l * 18 * ts)
        ctx.fill()
      }
      ctx.fillStyle = '#f8fafc'
      ctx.beginPath()
      ctx.moveTo(tx - 6 * ts, ty - 60 * ts)
      ctx.lineTo(tx, ty - 70 * ts)
      ctx.lineTo(tx + 6 * ts, ty - 60 * ts)
      ctx.fill()
    }
  }
}

// -- the sled dog team ----------------------------------------------------------------------------------------------

function sledDogs(waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 212
    // Four huskies in pairs, running.
    const dog = (x: number, ph: number) => {
      const s = Math.sin(p * 2 + ph)
      const y = g - 30 - Math.abs(Math.cos(p * 2 + ph)) * 4
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 5
      for (const [lx, k] of [[x - 14, s], [x - 8, -s], [x + 10, -s], [x + 16, s]] as const) {
        ctx.beginPath()
        ctx.moveTo(lx, y + 6)
        ctx.lineTo(lx + k * 10, g - 2)
        ctx.stroke()
      }
      ctx.fillStyle = '#94a3b8'
      ellipse(ctx, x, y, 22, 10)
      ctx.fill()
      ctx.fillStyle = '#f1f5f9'
      ellipse(ctx, x + 4, y + 4, 16, 6)
      ctx.fill()
      // Curled tail, head, pointy ears.
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.arc(x - 24, y - 8, 7, 0.5, Math.PI * 1.6)
      ctx.stroke()
      ctx.fillStyle = '#94a3b8'
      circle(ctx, x + 24, y - 10, 10)
      ctx.fill()
      ctx.fillStyle = '#f1f5f9'
      ellipse(ctx, x + 30, y - 6, 8, 5)
      ctx.fill()
      ctx.fillStyle = '#94a3b8'
      for (const ex of [x + 18, x + 26]) {
        ctx.beginPath()
        ctx.moveTo(ex - 4, y - 16)
        ctx.lineTo(ex, y - 28)
        ctx.lineTo(ex + 4, y - 16)
        ctx.fill()
      }
      dot(ctx, x + 37, y - 7, 2.5, '#1f2937')
      dot(ctx, x + 26, y - 12, 1.8, '#1f2937')
      ctx.fillStyle = color
      rr(ctx, x - 6, y - 10, 14, 20, 3)
    }
    // Harness line.
    ctx.strokeStyle = color2
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(110, g - 40)
    ctx.lineTo(300, g - 40)
    ctx.stroke()
    dog(190, 0)
    dog(262, 1.4)
    // The sled and the musher on the runners.
    ctx.fillStyle = '#d6c29a'
    ctx.beginPath()
    ctx.moveTo(30, g - 10)
    ctx.lineTo(120, g - 10)
    ctx.quadraticCurveTo(136, g - 10, 134, g - 30)
    ctx.lineTo(128, g - 30)
    ctx.quadraticCurveTo(128, g - 16, 118, g - 16)
    ctx.lineTo(30, g - 16)
    ctx.fill()
    ctx.fillStyle = color
    rr(ctx, 54, g - 48, 70, 32, 4)
    ctx.fillStyle = '#d6c29a'
    ctx.fillRect(36, g - 76, 5, 64)
    const d: Dress = { skin: PEACH, hair: '#78350f', shirt: color2, pants: '#475569', shoes: '#334155' }
    person(ctx, 30, g - 14, 0.8, 1, d, { open: waving ? 0.7 : 0 }, () => {
      // A fur-trimmed hood.
      ctx.fillStyle = '#e7e5e4'
      ctx.beginPath()
      ctx.arc(2, -118, 21, 0, TAU)
      ctx.fill()
      head(ctx, 4, -118, 15, d.skin, 1, { open: waving ? 0.7 : 0 })
      if (waving) arm(ctx, [10, -98, 22, -120, 22 + Math.sin(p * 3) * 6, -142], 8, d.shirt)
      else arm(ctx, [10, -98, 10, -84, 14, -76], 8, d.shirt)
      arm(ctx, [-10, -98, 0, -86, 12, -78], 8, shade(d.shirt, -0.1))
    })
    // Snow kicked up.
    for (let k = 0; k < 6; k++) {
      const q = ((f / frames) * 2 + k / 6) % 1
      dot(ctx, 30 - q * 30 + k * 4, g - 6 - Math.sin(q * Math.PI) * 14, 2.5, rgba('#f8fafc', 1 - q))
    }
  }
}

// -- chestnuts roasting ------------------------------------------------------------------------------------------

function chestnutRoaster(offering: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 242
    // The cart with its coal brazier glowing.
    ctx.fillStyle = color
    rr(ctx, 110, g - 100, 120, 60, 6)
    ctx.fillStyle = shade(color, -0.15)
    ctx.fillRect(110, g - 60, 120, 6)
    wheel(ctx, 130, g - 20, 20, 0, '#e2e8f0')
    wheel(ctx, 210, g - 20, 20, 0, '#e2e8f0')
    ctx.fillStyle = '#334155'
    rr(ctx, 130, g - 116, 80, 18, 4)
    const glowA = 0.5 + 0.3 * Math.sin(p * TAU * 3)
    ctx.fillStyle = rgba('#f97316', glowA)
    ellipse(ctx, 170, g - 116, 36, 6)
    ctx.fill()
    for (let k = 0; k < 9; k++) {
      ctx.fillStyle = '#78350f'
      ellipse(ctx, 140 + k * 7.5, g - 120 - (k % 2) * 3, 5, 4)
      ctx.fill()
      ctx.strokeStyle = '#fde68a'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(138 + k * 7.5, g - 122 - (k % 2) * 3)
      ctx.lineTo(142 + k * 7.5, g - 120 - (k % 2) * 3)
      ctx.stroke()
    }
    // Smoke and sparks.
    for (let k = 0; k < 4; k++) {
      const q = (p + k / 4) % 1
      ctx.fillStyle = rgba('#e2e8f0', 0.4 * (1 - q))
      circle(ctx, 170 + Math.sin(q * 5 + k) * 10, g - 126 - q * 80, 8 + q * 10)
      ctx.fill()
      dot(ctx, 160 + k * 8, g - 130 - ((p * 3 + k / 4) % 1) * 40, 1.6, rgba('#fbbf24', 1 - ((p * 3 + k / 4) % 1)))
    }
    // The vendor in a flat cap, shaking the pan or holding out a paper cone.
    const d: Dress = { skin: PEACH, hair: '#78716c', shirt: color2, pants: '#475569' }
    const x = 70
    standing(ctx, x, g, 1, d, { open: offering ? 0.6 : 0 })
    ctx.fillStyle = '#94a3b8'
    ctx.beginPath()
    ctx.ellipse(x + 4, g - 128, 18, 8, 0, Math.PI, TAU)
    ctx.fill()
    ctx.fillRect(x + 4, g - 130, 20, 4)
    scarf(ctx, x, g - 104, '#ef4444', Math.sin(p * TAU) * 3)
    if (offering) {
      arm(ctx, [x - 10, g - 98, x - 26, g - 104, x - 40, g - 112], 9, d.shirt)
      ctx.fillStyle = '#f8fafc'
      ctx.beginPath()
      ctx.moveTo(x - 50, g - 128)
      ctx.lineTo(x - 30, g - 128)
      ctx.lineTo(x - 40, g - 104)
      ctx.fill()
      for (let k = 0; k < 3; k++) dot(ctx, x - 46 + k * 6, g - 130, 3.5, '#78350f')
      steam(ctx, x - 40, g - 136, p)
      arm(ctx, [x + 10, g - 98, x + 30, g - 104, x + 56, g - 114], 9, d.shirt)
    } else {
      const shake = Math.sin(p * TAU * 4) * 4
      arm(ctx, [x + 10, g - 98, x + 30, g - 106, x + 56 + shake, g - 114], 9, d.shirt)
      arm(ctx, [x - 10, g - 98, x + 10, g - 110, x + 50 + shake, g - 116], 9, shade(d.shirt, -0.1))
    }
    ctx.strokeStyle = '#475569'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x + 56, g - 114)
    ctx.lineTo(x + 66, g - 118)
    ctx.stroke()
  }
}

function steam(ctx: Ctx, x: number, y: number, p: number) {
  ctx.strokeStyle = rgba('#f8fafc', 0.55)
  ctx.lineWidth = 2
  for (let k = 0; k < 2; k++) {
    const q = (p + k / 2) % 1
    ctx.globalAlpha = 1 - q
    ctx.beginPath()
    ctx.moveTo(x + (k - 0.5) * 8, y - q * 20)
    ctx.quadraticCurveTo(x + (k - 0.5) * 8 + 5, y - 8 - q * 20, x + (k - 0.5) * 8, y - 16 - q * 20)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

// -- the Christmas tree lot -----------------------------------------------------------------------------------------

function treeLot(tying: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 242
    // String lights over the lot.
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, 30)
    ctx.quadraticCurveTo(150, 60, 300, 30)
    ctx.stroke()
    for (let k = 0; k < 10; k++) {
      const x = 15 + k * 30
      const y = 30 + Math.sin((x / 300) * Math.PI) * 15 + 3
      dot(ctx, x, y, 3.5, (k + Math.floor(p * 4)) % 3 === 0 ? '#fde68a' : ['#ef4444', '#4ade80', '#60a5fa'][k % 3])
    }
    // Trees leaning on the rail.
    const pine = (x: number, y: number, s: number) => {
      ctx.fillStyle = '#15803d'
      for (let l = 0; l < 3; l++) {
        ctx.beginPath()
        ctx.moveTo(x - (26 - l * 6) * s, y - l * 22 * s)
        ctx.lineTo(x, y - (40 + l * 22) * s)
        ctx.lineTo(x + (26 - l * 6) * s, y - l * 22 * s)
        ctx.fill()
      }
      ctx.fillStyle = '#78350f'
      ctx.fillRect(x - 3 * s, y, 6 * s, 12 * s)
    }
    for (const [tx, ts] of [[20, 0.9], [60, 1.1], [100, 0.85]] as const) pine(tx, g - 12, ts)
    ctx.fillStyle = '#d6c29a'
    ctx.fillRect(0, g - 50, 130, 5)
    ctx.fillStyle = '#f8fafc'
    rr(ctx, 6, g - 100 - 80, 80, 26, 3)
    ctx.fillStyle = '#b91c1c'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText('TREES', 22, g - 162)
    // The car, its roof waiting for the tree.
    ctx.fillStyle = color
    rr(ctx, 150, g - 60, 140, 40, 10)
    ctx.beginPath()
    ctx.moveTo(176, g - 60)
    ctx.lineTo(194, g - 92)
    ctx.lineTo(258, g - 92)
    ctx.lineTo(276, g - 60)
    ctx.fill()
    ctx.fillStyle = rgba('#bae6fd', 0.6)
    ctx.beginPath()
    ctx.moveTo(186, g - 62)
    ctx.lineTo(198, g - 86)
    ctx.lineTo(222, g - 86)
    ctx.lineTo(222, g - 62)
    ctx.fill()
    wheel(ctx, 180, g - 18, 16, 0, '#e2e8f0')
    wheel(ctx, 262, g - 18, 16, 0, '#e2e8f0')
    // The tree on the roof: lifted up for people, tied down with twine.
    const up = tying ? Math.min(1, p / 0.4) : 0
    if (tying) {
      // Lying on its side across the roof, slid up from the lot.
      ctx.save()
      ctx.translate(176 + up * 50 - 50, g - 100 - (1 - up) * 20)
      ctx.rotate(Math.PI / 2)
      pine(0, 0, 0.9)
      ctx.restore()
    }
    if (tying && p > 0.4) {
      ctx.strokeStyle = '#fde68a'
      ctx.lineWidth = 2
      for (const sx of [208, 244]) {
        ctx.beginPath()
        ctx.moveTo(sx, g - 120)
        ctx.lineTo(sx + 2, g - 92)
        ctx.stroke()
      }
    }
    // The lot worker in a plaid jacket.
    const d: Dress = { skin: BROWN, hair: '#1c1917', shirt: color2, pants: '#475569' }
    standing(ctx, 134, g, 1, d, { open: tying ? 0.5 : 0 })
    ctx.strokeStyle = shade(color2, -0.3)
    ctx.lineWidth = 1.5
    for (const yy of [g - 94, g - 80, g - 66]) {
      ctx.beginPath()
      ctx.moveTo(119, yy)
      ctx.lineTo(149, yy)
      ctx.stroke()
    }
    beanie(ctx, 136, g - 118, 16, '#ef4444')
    if (tying) {
      arm(ctx, [144, g - 98, 170, g - 110, 196 + Math.sin(p * TAU * 4) * 4, g - 116], 9, d.shirt)
      arm(ctx, [124, g - 98, 150, g - 118, 180, g - 124], 9, shade(d.shirt, -0.1))
    } else {
      arm(ctx, [144, g - 98, 150, g - 80, 146, g - 64], 9, d.shirt)
      arm(ctx, [124, g - 98, 110, g - 112, 96, g - 124], 9, shade(d.shirt, -0.1))
    }
  }
}

// -- the proposal ----------------------------------------------------------------------------------------------------

function proposal(asking: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 252
    const him: Dress = { skin: TAN, hair: '#1c1917', shirt: '#e2e8f0', pants: '#475569' }
    const her: Dress = { skin: PEACH, hair: '#78350f', shirt: color, pants: color }
    if (!asking) {
      // Strolling arm in arm, a rose in her hand.
      const sw = Math.sin(p * TAU * 2) * 0.3
      standing(ctx, 110, g, 1, him, { stride: sw })
      standing(ctx, 150, g, 1, her, { skirt: true, stride: -sw })
      arm(ctx, [120, g - 98, 130, g - 82, 140, g - 80], 9, him.shirt)
      arm(ctx, [140, g - 98, 158, g - 86, 166, g - 96], 9, her.shirt)
      ctx.strokeStyle = '#16a34a'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(166, g - 96)
      ctx.lineTo(172, g - 118)
      ctx.stroke()
      dot(ctx, 173, g - 120, 6, '#ef4444')
      return
    }
    // Down on one knee with the ring box open, then she says yes and he leaps up, hearts everywhere.
    const yes = p > 0.5
    if (!yes) {
      ctx.save()
      ctx.translate(110, g)
      // Kneeling: one knee down, the other foot forward.
      arm(ctx, [0, -50, 10, -24, 4, -4], 11, him.pants!)
      arm(ctx, [6, -50, 30, -46, 32, -6], 11, shade(him.pants!, -0.15))
      ctx.fillStyle = '#334155'
      rr(ctx, -4, -8, 18, 8, 3)
      rr(ctx, 26, -8, 18, 8, 3)
      ctx.fillStyle = him.shirt
      rr(ctx, -12, -100, 30, 52, 10)
      head(ctx, 6, -114, 16, him.skin, 1, { open: 0.3 })
      ctx.fillStyle = him.hair
      ctx.beginPath()
      ctx.arc(6, -116, 17, Math.PI * 1.02, Math.PI * 1.98)
      ctx.fill()
      arm(ctx, [14, -92, 30, -86, 46, -92], 9, him.shirt)
      ctx.fillStyle = color2
      rr(ctx, 44, -100, 14, 10, 2)
      ctx.strokeStyle = '#fde68a'
      ctx.lineWidth = 2
      circle(ctx, 51, -106, 4)
      ctx.stroke()
      ctx.fillStyle = '#e0f2fe'
      dot(ctx, 51, -110, 2.5, '#e0f2fe')
      ctx.restore()
      for (let k = 0; k < 4; k++) dot(ctx, 161 + Math.cos(p * 20 + k * 1.6) * 12, g - 154 + Math.sin(p * 20 + k * 1.6) * 6, 1.6, '#fde68a')
      standing(ctx, 190, g, -1, her, { skirt: true, open: 0.9 })
      arm(ctx, [180, g - 98, 172, g - 110, 180, g - 116], 9, her.shirt)
      arm(ctx, [200, g - 98, 196, g - 110, 186, g - 116], 9, her.shirt)
      return
    }
    const q = (p - 0.5) / 0.5
    const jump = Math.abs(Math.sin(q * Math.PI * 2)) * 18
    standing(ctx, 140, g - jump, 1, him, { open: 0.9 })
    standing(ctx, 170, g - jump, -1, her, { skirt: true, open: 0.9 })
    arm(ctx, [150, g - 98 - jump, 162, g - 90 - jump, 170, g - 86 - jump], 9, him.shirt)
    arm(ctx, [160, g - 98 - jump, 150, g - 90 - jump, 142, g - 86 - jump], 9, her.shirt)
    arm(ctx, [130, g - 98 - jump, 118, g - 120 - jump, 116, g - 142 - jump], 9, him.shirt)
    arm(ctx, [180, g - 98 - jump, 192, g - 120 - jump, 194, g - 142 - jump], 9, her.shirt)
    for (let k = 0; k < 7; k++) {
      const r = (q + k / 7) % 1
      ctx.fillStyle = rgba(k % 2 ? color : '#f9a8d4', 1 - r)
      heartPath(ctx, 70 + k * 30, 140 - r * 120, 5 + (k % 3))
      ctx.fill()
    }
  }
}

// -- the Valentine's mailbox ----------------------------------------------------------------------------------------

function valentineMailbox(posting: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 242
    // A classroom-style box covered in hearts on a post, its flag going up.
    ctx.fillStyle = '#d6c29a'
    ctx.fillRect(146, g - 80, 8, 80)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(110, g - 80)
    ctx.lineTo(190, g - 80)
    ctx.lineTo(190, g - 120)
    ctx.arc(150, g - 120, 40, 0, Math.PI, true)
    ctx.closePath()
    ctx.fill()
    for (const [hx, hy, hs] of [[130, g - 110, 6], [168, g - 130, 5], [150, g - 96, 7], [176, g - 100, 4]] as const) {
      ctx.fillStyle = color2
      heartPath(ctx, hx, hy, hs)
      ctx.fill()
    }
    ctx.fillStyle = '#1f2937'
    rr(ctx, 130, g - 150, 40, 6, 3)
    const flag = posting ? Math.min(1, p / 0.5) : 0
    ctx.save()
    ctx.translate(192, g - 100)
    ctx.rotate(-flag * Math.PI / 2)
    ctx.fillStyle = '#facc15'
    ctx.fillRect(0, -3, 30, 6)
    ctx.fillRect(22, -3, 8, 14)
    ctx.restore()
    // A child with a stack of cards, posting one through the slot.
    const kid: Dress = { skin: BROWN, hair: '#1c1917', shirt: color2, pants: '#475569' }
    const card = (cx: number, cy: number, a: number) => {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(a)
      ctx.fillStyle = '#f8fafc'
      rr(ctx, -12, -8, 24, 16, 2)
      ctx.fillStyle = color
      heartPath(ctx, 0, 0, 4)
      ctx.fill()
      ctx.restore()
    }
    const post = posting ? (p * 2) % 1 : 0
    person(ctx, 70, g, 0.85, 1, kid, { open: posting && post > 0.6 ? 0.7 : 0 }, () => {
      arm(ctx, [-10, -98, 2, -84, 14, -82], 8, kid.shirt)
      card(18, -84, 0.1)
      card(18, -88, -0.1)
      if (posting) {
        const r = Math.min(1, post / 0.6)
        arm(ctx, [10, -98, 40, -128 - r * 6, 64 + r * 6, -148 - r * 10], 8, kid.shirt)
        if (post < 0.6) card(66 + r * 6, -152 - r * 10, -0.2)
      } else {
        arm(ctx, [10, -98, 24, -104, 32, -112], 8, kid.shirt)
        card(36, -118, 0.3)
      }
    })
    if (posting && post > 0.6) {
      for (let k = 0; k < 3; k++) {
        const r = (post - 0.6) / 0.4
        ctx.fillStyle = rgba('#f9a8d4', 1 - r)
        heartPath(ctx, 150 + (k - 1) * 16, g - 160 - r * 30 - k * 6, 5)
        ctx.fill()
      }
    }
  }
}

// -- dyeing Easter eggs -----------------------------------------------------------------------------------------------

/** The dye cups the egg goes into, in order. */
const DYES = ['#f472b6', '#60a5fa', '#facc15', '#4ade80']

function eggDyeing(dipping: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color2 }: SpriteColors) => {
    const p = f / frames
    const g = 222
    const top = g - 60
    const kid: Dress = { skin: PEACH, hair: '#ca8a04', shirt: color2, pants: '#cbd5e1' }
    seated(ctx, 160, g, 46, 0.85, 1, kid, dipping ? 0.6 : 0)
    // The table, the cups of dye and the egg carton of finished eggs.
    ctx.fillStyle = '#f8fafc'
    rr(ctx, 90, top, 180, 10, 3)
    ctx.fillStyle = '#d6c29a'
    ctx.fillRect(100, top + 10, 6, g - top - 10)
    ctx.fillRect(256, top + 10, 6, g - top - 10)
    DYES.forEach((c, k) => {
      const cx = 104 + k * 34
      ctx.fillStyle = rgba('#f8fafc', 0.7)
      rr(ctx, cx - 11, top - 24, 22, 24, 3)
      ctx.fillStyle = rgba(c, 0.85)
      ctx.fillRect(cx - 9, top - 16, 18, 15)
    })
    ctx.fillStyle = '#d6c29a'
    rr(ctx, 236, top - 12, 34, 12, 2)
    const done = dipping ? 1 + Math.floor(p * 4) : 3
    for (let k = 0; k < 4; k++) {
      const c = k < done ? DYES[k] : '#f8fafc'
      ctx.fillStyle = c
      ellipse(ctx, 242 + (k % 2) * 14, top - 16 - Math.floor(k / 2) * 0, 6, 8)
      ctx.fill()
      if (k < done) {
        ctx.strokeStyle = '#f8fafc'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(237 + (k % 2) * 14, top - 18)
        ctx.lineTo(247 + (k % 2) * 14, top - 14)
        ctx.stroke()
      }
    }
    // The wire dipper lowering an egg into a cup and lifting it out changed colour.
    const which = dipping ? Math.floor(p * 4) % 4 : 0
    const cx = 104 + which * 34
    const q = dipping ? (p * 4) % 1 : 0.2 + Math.sin(p * TAU) * 0.1
    const depth = q < 0.5 ? q * 2 : 2 - q * 2
    const ey = top - 30 + depth * 20
    const sy = g - 46 - 44 * 0.85
    const side = cx < 160 ? -1 : 1
    arm(ctx, [160 + side * 8, sy, 160 + side * 20, sy + 4, cx + side * 16, ey - 26], 7, kid.shirt)
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(cx + side * 16, ey - 26)
    ctx.lineTo(cx, ey - 8)
    ctx.stroke()
    circle(ctx, cx, ey, 9)
    ctx.stroke()
    if (depth < 0.6 || !dipping) {
      ctx.fillStyle = dipping && q > 0.5 ? DYES[which] : '#f8fafc'
      ellipse(ctx, cx, ey, 6, 8)
      ctx.fill()
    }
    if (dipping && q > 0.5) for (let k = 0; k < 2; k++) dot(ctx, cx - 3 + k * 6, ey + 12 + (q - 0.5) * 20, 1.8, DYES[which])
  }
}

// -- tapping the maples -------------------------------------------------------------------------------------------

function mapleTapping(pouring: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 252
    // The maple trunk with a spout and a bucket, sap dripping.
    ctx.fillStyle = '#78716c'
    ctx.fillRect(170, 0, 50, g)
    ctx.strokeStyle = '#57534e'
    ctx.lineWidth = 2
    for (let y = 20; y < g; y += 34) {
      ctx.beginPath()
      ctx.moveTo(176, y)
      ctx.lineTo(186, y + 18)
      ctx.moveTo(208, y + 10)
      ctx.lineTo(200, y + 28)
      ctx.stroke()
    }
    ctx.fillStyle = '#e2e8f0'
    ctx.beginPath()
    ctx.ellipse(195, g, 70, 12, 0, Math.PI, TAU)
    ctx.fill()
    ctx.fillStyle = '#94a3b8'
    ctx.fillRect(160, g - 130, 14, 4)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(144, g - 124)
    ctx.lineTo(172, g - 124)
    ctx.lineTo(168, g - 90)
    ctx.lineTo(148, g - 90)
    ctx.fill()
    ctx.fillStyle = shade(color, -0.2)
    ctx.beginPath()
    ctx.moveTo(140, g - 126)
    ctx.lineTo(176, g - 126)
    ctx.lineTo(172, g - 136)
    ctx.lineTo(144, g - 136)
    ctx.fill()
    const q = (p * 3) % 1
    dot(ctx, 160, g - 126 + q * 8, 2.4, rgba('#fef3c7', q < 0.9 ? 0.9 : 0))
    // The boy with a short stack and the jug, or (for people) pouring syrup, glug glug.
    const kid: Dress = { skin: TAN, hair: '#1c1917', shirt: color2, pants: '#475569', shoes: '#334155' }
    const x = 70
    standing(ctx, x, g, 1, kid, { open: pouring ? 0.7 : 0 })
    beanie(ctx, x + 2, g - 118, 16, color)
    ctx.fillStyle = '#e2e8f0'
    ellipse(ctx, x + 40, g - 74, 22, 5)
    ctx.fill()
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = '#fbbf24'
      ellipse(ctx, x + 40, g - 80 - k * 5, 18, 4)
      ctx.fill()
    }
    arm(ctx, [x - 10, g - 98, x + 6, g - 80, x + 24, g - 76], 9, kid.shirt)
    const tilt = pouring ? Math.min(1, p / 0.3) : 0
    const [jx, jy] = arm(ctx, [x + 10, g - 98, x + 28, g - 112, x + 46, g - 118], 9, kid.shirt)
    ctx.save()
    ctx.translate(jx, jy)
    ctx.rotate(tilt * 1.4)
    ctx.fillStyle = rgba('#f8fafc', 0.8)
    rr(ctx, -8, -24, 16, 26, 4)
    ctx.fillStyle = '#b45309'
    ctx.fillRect(-6, -12, 12, 12)
    ctx.fillStyle = color
    ctx.fillRect(-4, -30, 8, 6)
    ctx.restore()
    if (pouring && p > 0.3) {
      ctx.fillStyle = rgba('#b45309', 0.9)
      ctx.fillRect(x + 38, g - 104, 3, 24)
      ctx.beginPath()
      ctx.ellipse(x + 40, g - 92, 12, 3, 0, 0, TAU)
      ctx.fill()
    }
  }
}

const BUBBLE = { id: 'bubble', frames: 1, w: 360, h: 140 }

export const WINTERTIME_ROWS: Record<string, SpriteRow[]> = {
  'snow-shoveler': [
    { id: 'main', frames: 6, w: 280, h: 260, paint: snowShoveler(false, false) },
    { id: 'act', frames: 6, w: 280, h: 260, paint: snowShoveler(false, true) },
    { id: 'snow', frames: 10, w: 280, h: 260, paint: snowShoveler(true, false) },
    { id: 'snowact', frames: 6, w: 280, h: 260, paint: snowShoveler(true, true) },
    { ...BUBBLE, paint: saying('Any snow yet?') },
    { id: 'snowsay', frames: 1, w: 360, h: 140, paint: saying('Let it snow!') },
    SPARKLE,
  ],
  'igloo-builder': [
    { id: 'main', frames: 7, w: 300, h: 240, paint: iglooBuilder },
    SPARKLE,
  ],
  'snowflake-catcher': [
    { id: 'main', frames: 8, w: 240, h: 250, paint: snowflakeCatcher(false) },
    { id: 'act', frames: 10, w: 240, h: 250, paint: snowflakeCatcher(true) },
    { ...BUBBLE, paint: saying('Got one!') },
    SPARKLE,
  ],
  'ice-sculptor': [
    { id: 'main', frames: 7, w: 240, h: 260, paint: iceSculptor },
    SPARKLE,
  ],
  'snowshoe-hiker': [
    { id: 'main', frames: 8, w: 200, h: 240, paint: snowshoeHiker(false) },
    { id: 'wave', frames: 8, w: 200, h: 240, paint: snowshoeHiker(true) },
    SPARKLE,
  ],
  'ski-lift': [
    { id: 'main', frames: 12, w: 300, h: 260, paint: skiLift(false) },
    { id: 'act', frames: 12, w: 300, h: 260, paint: skiLift(true) },
    { ...BUBBLE, paint: saying('Fresh powder!') },
    SPARKLE,
  ],
  'sled-dogs': [
    { id: 'main', frames: 8, w: 310, h: 220, paint: sledDogs(false) },
    { id: 'wave', frames: 8, w: 310, h: 220, paint: sledDogs(true) },
    SPARKLE,
  ],
  'chestnut-roaster': [
    { id: 'main', frames: 8, w: 250, h: 250, paint: chestnutRoaster(false) },
    { id: 'act', frames: 8, w: 250, h: 250, paint: chestnutRoaster(true) },
    { ...BUBBLE, paint: saying('Hot chestnuts!') },
    SPARKLE,
  ],
  'tree-lot': [
    { id: 'main', frames: 6, w: 300, h: 250, paint: treeLot(false) },
    { id: 'act', frames: 10, w: 300, h: 250, paint: treeLot(true) },
    { ...BUBBLE, paint: saying('This one’s perfect!') },
    SPARKLE,
  ],
  proposal: [
    { id: 'main', frames: 8, w: 280, h: 260, paint: proposal(false) },
    { id: 'act', frames: 12, w: 280, h: 260, paint: proposal(true) },
    { ...BUBBLE, paint: saying('Yes!') },
    SPARKLE,
  ],
  'valentine-mailbox': [
    { id: 'main', frames: 6, w: 240, h: 250, paint: valentineMailbox(false) },
    { id: 'act', frames: 10, w: 240, h: 250, paint: valentineMailbox(true) },
    { ...BUBBLE, paint: saying('Be my Valentine!') },
    SPARKLE,
  ],
  'egg-dyeing': [
    { id: 'main', frames: 6, w: 290, h: 230, paint: eggDyeing(false) },
    { id: 'act', frames: 16, w: 290, h: 230, paint: eggDyeing(true) },
    { ...BUBBLE, paint: saying('Look, it’s pink!') },
    SPARKLE,
  ],
  'maple-tapping': [
    { id: 'main', frames: 6, w: 240, h: 260, paint: mapleTapping(false) },
    { id: 'act', frames: 8, w: 240, h: 260, paint: mapleTapping(true) },
    { ...BUBBLE, paint: saying('Maple syrup!') },
    SPARKLE,
  ],
}
