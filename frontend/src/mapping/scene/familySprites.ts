/**
 * Indigenous Peoples' Day, Grandparents Day and a couple more for the Super Bowl and April Fools': a Three Sisters
 * garden of corn, beans and squash, two paddlers in a canoe, Grandpa reading a story, Grandma knitting a scarf that
 * grows, grandparents on the porch swing, a whoopee cushion and a touchdown dance.
 *
 * Painted the same way as sprites.ts: facing right, one frame at a time, into a cell of w by h design units.
 */

import { arm, dot, head, person, rr, seated, type Dress } from './figures'
import {
  ellipse, rgba, saying, shade, SPARKLE, TAU,
  type Ctx, type SpriteColors, type SpriteRow,
} from './sprites'

const PEACH = '#f5c9a0'
const TAN = '#c68a5a'
const BROWN = '#8d5a3b'

// -- the Three Sisters ------------------------------------------------------------------------------------------

/** Level: corn, beans and squash growing together on their mounds as people come, from seedlings to harvest. */
function threeSisters(ctx: Ctx, f: number, n: number, { color, color2 }: SpriteColors) {
  const k = f / (n - 1)
  const g = 232
  for (const mx of [60, 150, 240]) {
    // The mound.
    ctx.fillStyle = '#c8a77a'
    ctx.beginPath()
    ctx.ellipse(mx, g, 40, 14, 0, Math.PI, TAU)
    ctx.fill()
    // Corn: the stalk, its leaves and (later) the ears with their silk.
    const h = 20 + k * 170
    ctx.strokeStyle = '#84cc16'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(mx, g - 10)
    ctx.lineTo(mx, g - 10 - h)
    ctx.stroke()
    ctx.fillStyle = '#65a30d'
    const leaves = 1 + Math.floor(k * 6)
    for (let l = 0; l < leaves; l++) {
      const ly = g - 20 - (l + 0.5) * (h / (leaves + 0.5))
      const side = l % 2 ? 1 : -1
      ctx.beginPath()
      ctx.moveTo(mx, ly)
      ctx.quadraticCurveTo(mx + side * 26, ly - 16, mx + side * 34, ly + 4)
      ctx.quadraticCurveTo(mx + side * 22, ly - 6, mx, ly + 4)
      ctx.fill()
    }
    if (k > 0.55) {
      const a = Math.min(1, (k - 0.55) / 0.3)
      for (const side of [-1, 1]) {
        ctx.fillStyle = color
        ellipse(ctx, mx + side * 8, g - 10 - h * 0.55, 6 * a + 1, 16 * a + 2, side * 0.25)
        ctx.fill()
        ctx.fillStyle = '#a3e635'
        ellipse(ctx, mx + side * 10, g - 4 - h * 0.55, 5 * a + 1, 10 * a + 1, side * 0.3)
        ctx.fill()
        ctx.strokeStyle = '#fde68a'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(mx + side * 6, g - 26 - h * 0.55 - 14 * a)
        ctx.lineTo(mx + side * 12, g - 38 - h * 0.55 - 14 * a)
        ctx.stroke()
      }
      // The tassel.
      ctx.strokeStyle = '#fde68a'
      ctx.lineWidth = 2
      for (let t = -2; t <= 2; t++) {
        ctx.beginPath()
        ctx.moveTo(mx, g - 10 - h)
        ctx.lineTo(mx + t * 5, g - 24 - h)
        ctx.stroke()
      }
    }
    // Beans twining up the stalk.
    if (k > 0.15) {
      const bh = (h - 10) * Math.min(1, (k - 0.15) / 0.6)
      ctx.strokeStyle = '#4ade80'
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let y = 0; y <= bh; y += 3) ctx.lineTo(mx + Math.sin(y * 0.12) * 7, g - 12 - y)
      ctx.stroke()
      for (let y = 14; y < bh; y += 22) {
        ctx.fillStyle = '#86efac'
        ellipse(ctx, mx + Math.sin(y * 0.12) * 7 + 5, g - 12 - y, 5, 3, 0.4)
        ctx.fill()
        if (k > 0.7) {
          ctx.fillStyle = '#bef264'
          rr(ctx, mx + Math.sin(y * 0.12) * 7 - 7, g - 16 - y, 3, 12, 1.5)
        }
      }
    }
    // Squash vines along the ground, big leaves and then the squash themselves.
    if (k > 0.3) {
      const v = Math.min(1, (k - 0.3) / 0.5)
      for (const side of [-1, 1]) {
        ctx.strokeStyle = '#4d7c0f'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(mx, g - 6)
        ctx.quadraticCurveTo(mx + side * 20 * v, g - 2, mx + side * 42 * v, g)
        ctx.stroke()
        ctx.fillStyle = '#65a30d'
        ellipse(ctx, mx + side * 26 * v, g - 10, 10 * v, 7 * v)
        ctx.fill()
      }
      if (k > 0.75) {
        const a = (k - 0.75) / 0.25
        ctx.fillStyle = color2
        ellipse(ctx, mx + 30, g - 6, 8 + 6 * a, 6 + 4 * a)
        ctx.fill()
        ctx.strokeStyle = shade(color2, -0.2)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(mx + 30, g - 12 - 4 * a)
        ctx.lineTo(mx + 30, g - 1)
        ctx.stroke()
      }
    }
  }
  // Pollen and seeds drifting when everything has come up.
  if (k > 0.8) for (let s = 0; s < 6; s++) dot(ctx, 30 + s * 46, 40 + ((s * 31) % 60), 2, rgba('#fde68a', 0.7))
}

// -- the canoe ---------------------------------------------------------------------------------------------------

function canoe(waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 200
    const bob = Math.sin(p) * 2
    // The water: ripples and the wake behind.
    ctx.strokeStyle = rgba('#bae6fd', 0.7)
    ctx.lineWidth = 2
    for (let r = 0; r < 4; r++) {
      const x = 20 + ((r * 70 + f * 9) % 260)
      ctx.beginPath()
      ctx.moveTo(x, g + 8 + (r % 2) * 6)
      ctx.lineTo(x + 22, g + 8 + (r % 2) * 6)
      ctx.stroke()
    }
    ctx.strokeStyle = rgba('#f8fafc', 0.6)
    ctx.beginPath()
    ctx.moveTo(30, g + 2)
    ctx.lineTo(4, g - 4)
    ctx.moveTo(30, g + 6)
    ctx.lineTo(2, g + 10)
    ctx.stroke()
    ctx.save()
    ctx.translate(0, bob)
    const front: Dress = { skin: TAN, hair: '#1c1917', shirt: color2, pants: '#cbd5e1' }
    const back: Dress = { skin: BROWN, hair: '#1c1917', shirt: '#e2e8f0', pants: '#cbd5e1' }
    // The paddlers sit low in the canoe, stroking on opposite sides in turn.
    const paddler = (x: number, d: Dress, phase: number, braid: boolean) => {
      const s = Math.sin(p + phase)
      seated(ctx, x, g + 20, 24, 0.8, 1, d)
      const hx = x + 1.6
      const hy = g + 20 - 24 - 62 * 0.8
      if (braid) {
        ctx.strokeStyle = d.hair
        ctx.lineWidth = 5
        ctx.beginPath()
        ctx.moveTo(hx - 10, hy + 2)
        ctx.quadraticCurveTo(hx - 16, hy + 16, hx - 12, hy + 30)
        ctx.stroke()
      }
      if (waving) {
        // Paddle laid across, one hand up to wave.
        arm(ctx, [x - 6, hy + 30, x - 10, hy + 6, x - 4 + Math.sin(p * 3) * 6, hy - 18], 7, d.shirt)
        ctx.strokeStyle = '#e7c7a0'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(x - 30, g - 6)
        ctx.lineTo(x + 40, g - 12)
        ctx.stroke()
        return undefined
      }
      return () => {
        // Both hands on the paddle, the blade dipping in ahead and pulling back past the hull.
        const sx = -s * 22
        const dip = Math.max(0, -Math.cos(p + phase)) * 10
        const top: [number, number] = [x + 14 + sx * 0.6, hy + 4 + dip * 0.4]
        const blade: [number, number] = [x + 34 + sx * 1.3, g + 14 + dip]
        ctx.strokeStyle = '#e7c7a0'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(top[0], top[1])
        ctx.lineTo(blade[0], blade[1])
        ctx.stroke()
        ctx.fillStyle = '#e7c7a0'
        ellipse(ctx, blade[0] + 1, blade[1] + 4, 4, 11, -0.3)
        ctx.fill()
        const mid: [number, number] = [top[0] + (blade[0] - top[0]) * 0.4, top[1] + (blade[1] - top[1]) * 0.4]
        arm(ctx, [x + 4, hy + 24, (x + top[0]) / 2, hy + 18, top[0], top[1]], 7, d.shirt)
        arm(ctx, [x + 8, hy + 30, (x + mid[0]) / 2 + 4, hy + 36, mid[0], mid[1]], 7, shade(d.shirt, -0.08))
        if (s < -0.3) for (let d2 = 0; d2 < 3; d2++) dot(ctx, blade[0] - 8 - d2 * 7, g - 2 - d2 * 3, 2, rgba('#f8fafc', 0.8))
      }
    }
    const paddles = [paddler(90, back, Math.PI, false), paddler(180, front, 0, true)]
    // The birchbark canoe over their legs.
    ctx.fillStyle = '#f1e7d0'
    ctx.beginPath()
    ctx.moveTo(30, g - 18)
    ctx.quadraticCurveTo(44, g - 10, 60, g - 8)
    ctx.lineTo(230, g - 8)
    ctx.quadraticCurveTo(254, g - 10, 270, g - 20)
    ctx.quadraticCurveTo(262, g + 10, 230, g + 12)
    ctx.lineTo(70, g + 12)
    ctx.quadraticCurveTo(38, g + 10, 30, g - 18)
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(44, g - 6)
    ctx.lineTo(256, g - 6)
    ctx.stroke()
    ctx.strokeStyle = '#a8a29e'
    ctx.lineWidth = 1.5
    for (let x = 70; x < 240; x += 26) {
      ctx.beginPath()
      ctx.moveTo(x, g - 2)
      ctx.lineTo(x + 8, g + 8)
      ctx.stroke()
    }
    for (const paint of paddles) paint?.()
    ctx.restore()
  }
}

// -- story time with Grandpa ----------------------------------------------------------------------------------

function armchair(ctx: Ctx, x: number, g: number, c: string) {
  ctx.fillStyle = shade(c, -0.1)
  rr(ctx, x - 40, g - 140, 80, 100, 16)
  ctx.fillStyle = c
  rr(ctx, x - 50, g - 76, 22, 56, 8)
  rr(ctx, x + 28, g - 76, 22, 56, 8)
  rr(ctx, x - 36, g - 56, 72, 30, 6)
  ctx.fillStyle = '#d6c29a'
  ctx.fillRect(x - 44, g - 20, 6, 20)
  ctx.fillRect(x + 38, g - 20, 6, 20)
}

function storyTime(turning: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 232
    armchair(ctx, 80, g, color2)
    const gramps: Dress = { skin: PEACH, hair: '#e5e7eb', shirt: '#e2e8f0', pants: '#94a3b8' }
    seated(ctx, 80, g, 56, 1, 1, gramps, turning ? 0 : 0.3 + 0.3 * Math.abs(Math.sin(p * TAU * 3)))
    // Glasses on the end of his nose.
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(80 + 9, g - 56 - 62 + 1, 5, 0, TAU)
    ctx.stroke()
    // The grandchild cross-legged on the rug, looking up.
    const kid: Dress = { skin: PEACH, hair: '#ca8a04', shirt: color, pants: '#cbd5e1' }
    ctx.fillStyle = rgba(color2, 0.35)
    ellipse(ctx, 180, g - 2, 70, 8)
    ctx.fill()
    seated(ctx, 186, g, 14, 0.8, -1, kid, turning ? 0.8 : 0)
    // The open book, held out so they can see when he turns it round.
    if (turning) {
      const tilt = Math.min(1, p / 0.3)
      arm(ctx, [88, g - 98, 110, g - 104, 122 + tilt * 6, g - 116], 9, gramps.shirt)
      ctx.save()
      ctx.translate(132 + tilt * 6, g - 128)
      ctx.fillStyle = '#f8fafc'
      rr(ctx, -24, -18, 48, 34, 3)
      // A picture of a dragon on the page.
      ctx.fillStyle = '#86efac'
      ellipse(ctx, -10, 2, 9, 6)
      ctx.fill()
      dot(ctx, -1, -4, 4, '#86efac')
      ctx.fillStyle = '#fb923c'
      ctx.beginPath()
      ctx.moveTo(3, -4)
      ctx.lineTo(18, -10 + Math.sin(p * TAU * 4) * 3)
      ctx.lineTo(18, 2)
      ctx.fill()
      ctx.fillStyle = '#bae6fd'
      for (let l = 0; l < 3; l++) ctx.fillRect(4, 4 + l * 4, 16, 2)
      ctx.strokeStyle = '#cbd5e1'
      ctx.beginPath()
      ctx.moveTo(0, -18)
      ctx.lineTo(0, 16)
      ctx.stroke()
      ctx.restore()
      for (let s = 0; s < 3; s++) {
        const q = (p * 2 + s / 3) % 1
        dot(ctx, 196 + s * 8, g - 76 - q * 30, 2.5, rgba('#fde68a', 1 - q))
      }
    } else {
      const page = Math.floor(p * 2) % 2
      arm(ctx, [88, g - 98, 100, g - 92, 108, g - 100], 9, gramps.shirt)
      ctx.fillStyle = color
      rr(ctx, 98, g - 118, 32, 24, 2)
      ctx.fillStyle = '#f8fafc'
      rr(ctx, 100, g - 116, 28, 20, 1)
      ctx.strokeStyle = '#cbd5e1'
      ctx.lineWidth = 1
      for (let l = 0; l < 4; l++) {
        ctx.beginPath()
        ctx.moveTo(103, g - 111 + l * 4)
        ctx.lineTo(112, g - 111 + l * 4)
        ctx.moveTo(116, g - 111 + l * 4)
        ctx.lineTo(125, g - 111 + l * 4)
        ctx.stroke()
      }
      if (page) {
        ctx.fillStyle = '#f1f5f9'
        ctx.beginPath()
        ctx.moveTo(114, g - 116)
        ctx.quadraticCurveTo(120, g - 124, 126, g - 116)
        ctx.lineTo(126, g - 96)
        ctx.lineTo(114, g - 96)
        ctx.fill()
      }
    }
    // A lamp beside the chair.
    ctx.fillStyle = '#cbd5e1'
    ctx.fillRect(14, g - 150, 4, 150)
    ctx.fillStyle = '#fde68a'
    ctx.beginPath()
    ctx.moveTo(2, g - 150)
    ctx.lineTo(30, g - 150)
    ctx.lineTo(24, g - 176)
    ctx.lineTo(8, g - 176)
    ctx.fill()
  }
}

// -- Grandma's scarf -------------------------------------------------------------------------------------------

/** Level: Grandma rocking and knitting, the scarf in her lap growing longer and longer the closer people come. */
function knittingGrandma(ctx: Ctx, f: number, n: number, { color, color2 }: SpriteColors) {
  const k = f / (n - 1)
  const g = 232
  const rock = Math.sin(f * 1.3) * 0.05
  ctx.save()
  ctx.translate(90, g)
  ctx.rotate(rock)
  ctx.translate(-90, -g)
  // The rocking chair.
  ctx.strokeStyle = '#d6c29a'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(40, g - 4)
  ctx.quadraticCurveTo(90, g + 6, 150, g - 8)
  ctx.stroke()
  ctx.lineWidth = 5
  for (const lx of [60, 120]) {
    ctx.beginPath()
    ctx.moveTo(lx, g)
    ctx.lineTo(lx, g - 58)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(56, g - 58)
  ctx.lineTo(48, g - 160)
  ctx.moveTo(56, g - 58)
  ctx.lineTo(128, g - 58)
  ctx.stroke()
  for (let s = 0; s < 4; s++) {
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(54 - s * 2, g - 70 - s * 22)
    ctx.lineTo(60 - s * 2, g - 70 - s * 22)
    ctx.stroke()
  }
  const nana: Dress = { skin: PEACH, hair: '#f1f5f9', shirt: color2, pants: '#cbd5e1' }
  seated(ctx, 76, g, 58, 1, 1, nana, k > 0.9 ? 0.5 : 0)
  // Her bun and glasses.
  dot(ctx, 64, g - 58 - 62 - 10, 8, '#f1f5f9')
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(76 + 9, g - 58 - 62 + 1, 5, 0, TAU)
  ctx.stroke()
  // Hands and needles.
  const click = f % 2 ? 3 : -3
  arm(ctx, [84, g - 102, 100, g - 86, 110, g - 92 + click], 9, nana.shirt)
  arm(ctx, [70, g - 102, 86, g - 82, 122, g - 90 - click], 9, shade(nana.shirt, -0.08))
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(104, g - 104 + click)
  ctx.lineTo(124, g - 82 + click)
  ctx.moveTo(130, g - 106 - click)
  ctx.lineTo(112, g - 80 - click)
  ctx.stroke()
  ctx.restore()
  // The scarf: striped, hanging from the needles over her knees and piling up on the floor.
  const len = 20 + k * 170
  ctx.lineWidth = 16
  ctx.lineCap = 'butt'
  let x = 118
  let y = g - 86
  const step = 10
  for (let d = 0; d < len; d += step) {
    let nx = x
    let ny = y + step
    if (ny > g - 8) {
      ny = g - 8
      nx = x + step
    }
    ctx.strokeStyle = Math.floor(d / 20) % 2 ? color : '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(nx, ny)
    ctx.stroke()
    x = nx
    y = ny
  }
  ctx.lineCap = 'round'
  // Fringe on the end and a ball of yarn rolling off.
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  for (let t = -6; t <= 6; t += 3) {
    ctx.beginPath()
    ctx.moveTo(x, y + t)
    ctx.lineTo(x + 8, y + t)
    ctx.stroke()
  }
  dot(ctx, x + 26 + k * 6, g - 9, 9, color)
  ctx.strokeStyle = shade(color, -0.2)
  ctx.beginPath()
  ctx.arc(x + 26 + k * 6, g - 9, 6, 0.3 + k * 6, 2.5 + k * 6)
  ctx.stroke()
}

// -- the porch swing ----------------------------------------------------------------------------------------------

function porchSwing(waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 232
    // The beam and chains.
    ctx.fillStyle = '#d6c29a'
    ctx.fillRect(10, 10, 240, 10)
    const sw = Math.sin(p) * (waving ? 4 : 10)
    ctx.save()
    ctx.translate(130, 20)
    ctx.rotate(sw * 0.006)
    ctx.translate(-130, -20)
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 2
    for (const cx of [40, 220]) {
      ctx.beginPath()
      ctx.moveTo(cx, 20)
      ctx.lineTo(cx + sw, g - 80)
      ctx.stroke()
    }
    ctx.translate(sw, 0)
    const pop: Dress = { skin: BROWN, hair: '#d6d3d1', shirt: '#e2e8f0', pants: '#94a3b8' }
    const nan: Dress = { skin: BROWN, hair: '#e5e7eb', shirt: color2, pants: '#cbd5e1' }
    // The seat back, the couple and then the seat front.
    ctx.fillStyle = shade(color, -0.1)
    rr(ctx, 30, g - 150, 200, 64, 6)
    seated(ctx, 92, g - 30, 50, 0.9, 1, pop, waving ? 0.5 : 0)
    seated(ctx, 166, g - 30, 50, 0.85, -1, nan, waving ? 0.5 : 0)
    // Pop's flat cap, Nan's glasses.
    ctx.fillStyle = '#94a3b8'
    ctx.beginPath()
    ctx.ellipse(94, g - 30 - 50 - 62 * 0.9 - 8, 15, 7, 0, Math.PI, TAU)
    ctx.fill()
    ctx.fillRect(94, g - 30 - 50 - 62 * 0.9 - 10, 18, 4)
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(166 - 7, g - 30 - 50 - 62 * 0.85 + 1, 4, 0, TAU)
    ctx.stroke()
    const hy = g - 30 - 50 - 44
    if (waving) {
      arm(ctx, [100, hy, 112, hy - 20, 112 + Math.sin(p * 3) * 6, hy - 40], 8, pop.shirt)
      arm(ctx, [158, hy, 146, hy - 20, 146 - Math.sin(p * 3 + 1) * 6, hy - 40], 8, nan.shirt)
    } else {
      // Holding hands between them, a jug of lemonade at Nan's side.
      arm(ctx, [100, hy, 112, hy + 22, 128, hy + 30], 8, pop.shirt)
      arm(ctx, [158, hy, 146, hy + 22, 130, hy + 30], 8, nan.shirt)
      dot(ctx, 129, hy + 30, 5, BROWN)
    }
    ctx.fillStyle = color
    rr(ctx, 26, g - 86, 208, 12, 4)
    ctx.restore()
    // Lemonade on the porch rail.
    ctx.fillStyle = rgba('#fef9c3', 0.85)
    rr(ctx, 250, g - 40, 16, 40, 4)
    ctx.fillStyle = '#fde047'
    ctx.fillRect(252, g - 30, 12, 28)
  }
}

// -- the whoopee cushion -----------------------------------------------------------------------------------------

function whoopee(sitting: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 232
    // The kitchen chair with the cushion on it, the prankster hiding behind the plant.
    ctx.fillStyle = '#d6c29a'
    ctx.fillRect(100, g - 140, 8, 140)
    ctx.fillRect(160, g - 64, 8, 64)
    rr(ctx, 98, g - 70, 74, 10, 3)
    for (let s = 0; s < 3; s++) ctx.fillRect(100, g - 136 + s * 22, 30, 5)
    const kid: Dress = { skin: TAN, hair: '#78350f', shirt: color2, pants: '#cbd5e1' }
    // A pot plant to hide behind.
    ctx.fillStyle = '#d97706'
    rr(ctx, 210, g - 40, 40, 40, 4)
    if (!sitting) {
      // The cushion waiting, the kid peeking out with a grin.
      ctx.fillStyle = color
      ellipse(ctx, 140, g - 76, 24, 7)
      ctx.fill()
      ctx.fillStyle = shade(color, -0.15)
      rr(ctx, 160, g - 80, 12, 6, 2)
      const peek = Math.max(0, Math.sin(p * TAU)) * 40
      head(ctx, 236 - peek * 0.3, g - 62 - peek, 14, kid.skin, -1, { open: 0.3 })
      ctx.fillStyle = kid.hair
      ctx.beginPath()
      ctx.arc(236 - peek * 0.3, g - 64 - peek, 15, Math.PI * 1.05, Math.PI * 1.95)
      ctx.fill()
    }
    ctx.fillStyle = '#65a30d'
    for (let l = 0; l < 5; l++) {
      ctx.beginPath()
      ctx.ellipse(230 + (l - 2) * 8, g - 56 - (l % 2) * 14, 9, 22, (l - 2) * 0.35, 0, TAU)
      ctx.fill()
    }
    if (!sitting) return
    // Uncle sits down: squash! The puff, the noise, his surprise and the kid laughing.
    const down = Math.min(1, p / 0.25)
    const uncle: Dress = { skin: PEACH, hair: '#78716c', shirt: '#e2e8f0', pants: '#94a3b8' }
    ctx.fillStyle = color
    ellipse(ctx, 140, g - 72, 24 + down * 6, 7 - down * 4)
    ctx.fill()
    const seatY = 66 + (1 - down) * 30 + (down >= 1 ? Math.abs(Math.sin(p * TAU * 4)) * 6 : 0)
    seated(ctx, 128, g, seatY, 1, 1, uncle, down >= 1 ? 0.9 : 0)
    const sy = g - seatY - 44
    if (down >= 1) {
      // Arms flung up in surprise.
      arm(ctx, [138, sy, 152, sy - 22, 160, sy - 40], 9, uncle.shirt)
      arm(ctx, [118, sy, 106, sy - 22, 100, sy - 40], 9, shade(uncle.shirt, -0.08))
    } else {
      arm(ctx, [138, sy, 150, sy + 14, 162, sy + 18], 9, uncle.shirt)
    }
    if (down >= 1) {
      const q = (p - 0.25) / 0.75
      for (let s = 0; s < 4; s++) {
        ctx.fillStyle = rgba('#e2e8f0', 0.7 * (1 - q))
        ellipse(ctx, 170 + q * 40 + s * 8, g - 76 - s * 6, 8 + q * 10, 5 + q * 6)
        ctx.fill()
      }
      ctx.fillStyle = '#fde68a'
      ctx.font = 'bold 26px sans-serif'
      ctx.save()
      ctx.translate(180, g - 104 - q * 10)
      ctx.rotate(-0.15)
      ctx.fillText('PFFT!', 0, 0)
      ctx.restore()
      person(ctx, 236, g, 0.75, -1, kid, { open: 0.9 }, () => {
        arm(ctx, [-10, -98, -20, -80, -4, -70], 8, kid.shirt)
        arm(ctx, [10, -98, 20, -80, 6, -70], 8, kid.shirt)
      })
    }
  }
}

// -- the touchdown dance ------------------------------------------------------------------------------------------

function touchdown(dancing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 252
    const x = 100
    // The end zone, painted in the team colour.
    ctx.fillStyle = rgba(color, 0.35)
    ctx.fillRect(0, g - 20, 220, 20)
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, g - 22, 220, 3)
    const d: Dress = { skin: BROWN, hair: '#1c1917', shirt: color, pants: '#f8fafc', shoes: '#f8fafc' }
    const helmet = () => {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(2, -120, 19, Math.PI * 0.9, Math.PI * 2.15)
      ctx.fill()
      ctx.fillStyle = color2
      ctx.fillRect(-2, -139, 6, 18)
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(14, -122)
      ctx.lineTo(24, -120)
      ctx.lineTo(22, -104)
      ctx.moveTo(14, -112)
      ctx.lineTo(23, -112)
      ctx.stroke()
      // The number on his chest and shoulder pads.
      ctx.fillStyle = color
      rr(ctx, -20, -106, 40, 14, 6)
      ctx.fillStyle = '#f8fafc'
      ctx.font = 'bold 18px sans-serif'
      ctx.fillText('12', -10, -70)
    }
    const ball = (bx: number, by: number, a: number) => {
      ctx.save()
      ctx.translate(bx, by)
      ctx.rotate(a)
      ctx.fillStyle = '#b45309'
      ellipse(ctx, 0, 0, 13, 8)
      ctx.fill()
      ctx.strokeStyle = '#f8fafc'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(-5, 0)
      ctx.lineTo(5, 0)
      ctx.stroke()
      ctx.restore()
    }
    if (!dancing) {
      // Ready stance, ball tucked under his arm, bouncing on his toes.
      const hop = Math.abs(Math.sin(p * TAU * 2)) * 3
      person(ctx, x, g - hop, 1, 1, d, { stride: 0.3 }, () => {
        helmet()
        arm(ctx, [10, -98, 22, -80, 12, -66], 10, color)
        arm(ctx, [-10, -98, -22, -78, -18, -60], 10, color)
      })
      ball(x + 14, g - 74 - hop, 0.4)
      return
    }
    // Spike the ball, then dance: arms pumping, knees up.
    const q = p * 4
    const step = Math.floor(q) % 4
    if (p < 0.2) {
      const t = p / 0.2
      person(ctx, x, g, 1, 1, d, { stride: 0.4 }, () => {
        helmet()
        arm(ctx, [10, -98, 22, -120 + t * 50, 30, -140 + t * 90], 10, color)
        arm(ctx, [-10, -98, -22, -80, -16, -64], 10, color)
      })
      ball(x + 30 + t * 20, g - 140 + t * 120, t * 3)
    } else {
      const bounce = Math.abs(Math.sin(q * Math.PI)) * 14
      person(ctx, x, g - bounce, 1, 1, d, { stride: step % 2 ? 0.8 : -0.8, open: 0.9 }, () => {
        helmet()
        const up = step % 2 ? 1 : -1
        arm(ctx, [10, -98, 26, -110 - up * 10, 32 + up * 4, -136 - up * 6], 10, color)
        arm(ctx, [-10, -98, -26, -110 + up * 10, -32 - up * 4, -136 + up * 6], 10, color)
      })
      ball(x + 60, g - 30 - Math.abs(Math.sin(q * Math.PI * 0.5)) * 30, q)
      for (let s = 0; s < 6; s++) {
        const r = (p * 2 + s / 6) % 1
        dot(ctx, 30 + s * 30, 20 + r * 150, 3, s % 2 ? color2 : '#f8fafc')
      }
    }
  }
}

const BUBBLE = { id: 'bubble', frames: 1, w: 360, h: 140 }

export const FAMILY_ROWS: Record<string, SpriteRow[]> = {
  'three-sisters-garden': [
    { id: 'main', frames: 7, w: 300, h: 250, paint: threeSisters },
    SPARKLE,
  ],
  'canoe-paddlers': [
    { id: 'main', frames: 8, w: 290, h: 220, paint: canoe(false) },
    { id: 'wave', frames: 8, w: 290, h: 220, paint: canoe(true) },
    SPARKLE,
  ],
  'story-time': [
    { id: 'main', frames: 6, w: 260, h: 240, paint: storyTime(false) },
    { id: 'act', frames: 8, w: 260, h: 240, paint: storyTime(true) },
    { ...BUBBLE, paint: saying('Once upon a time…') },
    SPARKLE,
  ],
  'knitting-grandma': [
    { id: 'main', frames: 7, w: 290, h: 240, paint: knittingGrandma },
    SPARKLE,
  ],
  'porch-swing': [
    { id: 'main', frames: 8, w: 280, h: 240, paint: porchSwing(false) },
    { id: 'act', frames: 8, w: 280, h: 240, paint: porchSwing(true) },
    { ...BUBBLE, paint: saying('Come visit soon!') },
    SPARKLE,
  ],
  'whoopee-cushion': [
    { id: 'main', frames: 6, w: 270, h: 250, paint: whoopee(false) },
    { id: 'act', frames: 10, w: 270, h: 250, paint: whoopee(true) },
    { ...BUBBLE, paint: saying('April Fools!') },
    SPARKLE,
  ],
  'touchdown-dance': [
    { id: 'main', frames: 4, w: 220, h: 270, paint: touchdown(false) },
    { id: 'act', frames: 12, w: 220, h: 270, paint: touchdown(true) },
    { ...BUBBLE, paint: saying('TOUCHDOWN!') },
    SPARKLE,
  ],
}
