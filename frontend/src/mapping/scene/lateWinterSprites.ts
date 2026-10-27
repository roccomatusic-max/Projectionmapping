/**
 * Pictures for the holidays from Martin Luther King Jr. Day to Mardi Gras:
 * marchers arm in arm, children holding hands, a child letting a dove go,
 * volunteers planting a tree; the groundhog, who sees his shadow when the sky
 * is really clear; a serenade, a candy heart with its sayings, a waltzing
 * couple, penguins proposing with a pebble, a child with a heart balloon;
 * Mount Rushmore, the Liberty Bell, young Washington and the cherry tree, a
 * fife and drum; a balcony throwing beads, a brass band, a jester, a king
 * cake, a carnival mask and a dancing crawfish.
 *
 * Painted the same way as sprites.ts: facing right, one frame at a time,
 * into a cell of w by h design units.
 */

import { arm, dot, head, rr, standing, type Dress } from './figures'
import {
  ellipse, heartPath, rgba, saying, shade, SKIN, SPARKLE, TAU,
  type Ctx, type SpriteColors, type SpriteRow,
} from './sprites'

const TAN = '#c68a5a'
const BROWN = '#9a6440'
const DEEP = '#7a4a2c'
const PEACH = '#f5c9a0'

/** A sign on a pole: a white board with a red heart, or a dove of peace. */
function placard(ctx: Ctx, x: number, top: number, pole: number, kind: 'heart' | 'dove') {
  ctx.fillStyle = '#a16207'
  ctx.fillRect(x - 2, top + 30, 4, pole)
  ctx.fillStyle = kind === 'dove' ? '#bfdbfe' : '#f8fafc'
  rr(ctx, x - 28, top, 56, 40, 4)
  if (kind === 'heart') {
    ctx.fillStyle = '#ef4444'
    heartPath(ctx, x, top + 19, 13)
    ctx.fill()
  } else dove(ctx, x - 4, top + 22, 0.62, 0.3, 1)
}

/** A white dove at (x, y), its wings at flap (0 down to 1 up), facing dir, with an olive sprig in its beak. */
function dove(ctx: Ctx, x: number, y: number, s: number, flap: number, dir: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s * dir, s)
  ctx.fillStyle = '#e2e8f0'
  ctx.beginPath()
  ctx.moveTo(-20, 2)
  ctx.lineTo(-38, -6)
  ctx.lineTo(-36, 10)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ellipse(ctx, 0, 2, 22, 11)
  ctx.fill()
  dot(ctx, 20, -6, 9, '#ffffff')
  ctx.fillStyle = '#f59e0b'
  ctx.beginPath()
  ctx.moveTo(27, -7)
  ctx.lineTo(35, -4)
  ctx.lineTo(27, -3)
  ctx.fill()
  dot(ctx, 22, -8, 1.8, '#1f2937')
  ctx.strokeStyle = '#4d7c0f'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(32, -4)
  ctx.lineTo(42, 2)
  ctx.stroke()
  ctx.fillStyle = '#65a30d'
  ellipse(ctx, 38, 0, 4, 2, 0.6)
  ctx.fill()
  ellipse(ctx, 42, 3, 4, 2, 0.3)
  ctx.fill()
  ctx.fillStyle = '#f1f5f9'
  ctx.save()
  ctx.translate(-2, -2)
  ctx.rotate(-0.4 - flap * 1.4)
  ellipse(ctx, -16, 0, 20, 7)
  ctx.fill()
  ctx.restore()
  ctx.restore()
}

// -- marchers arm in arm ---------------------------------------------------------------------------

function dreamersMarch(singing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 226
    const people: Array<[number, Dress]> = [
      [80, { skin: DEEP, hair: '#292524', shirt: color2 }],
      [150, { skin: SKIN, hair: '#78350f', shirt: '#f8fafc' }],
      [220, { skin: BROWN, hair: '#292524', shirt: color }],
    ]
    // The signs, held up behind.
    const sway = Math.sin(p) * 3
    placard(ctx, 62 + sway, 22, 110, 'dove')
    placard(ctx, 254 - sway, 22, 110, 'heart')
    people.forEach(([x, d], i) => {
      const bob = Math.abs(Math.sin(p + i)) * 3
      ctx.save()
      ctx.translate(0, -bob)
      // Far arm: to the one behind (or the back sign's pole).
      if (i === 0) arm(ctx, [x - 10, g - 96, x - 18, g - 76, 62 + sway, g - 96], 10, shade(d.shirt, -0.2))
      else if (singing) arm(ctx, [x - 10, g - 96, x - 22, g - 128, x - 35, g - 150], 10, shade(d.shirt, -0.2))
      standing(ctx, x, g + bob, 1, d, { stride: Math.sin(p + i * 0.6), open: singing ? 0.7 : 0 })
      // Near arm: linked with the next one's (raised together when singing), or up holding the front sign.
      if (i === 2) {
        arm(ctx, [x + 10, g - 96, x + 24, g - 112, 254 - sway, g - 120], 10, d.shirt)
        dot(ctx, 254 - sway, g - 120, 5, d.skin)
      } else if (singing) {
        arm(ctx, [x + 10, g - 96, x + 22, g - 128, x + 35, g - 150], 10, d.shirt)
        dot(ctx, x + 35, g - 152, 6, d.skin)
      } else {
        arm(ctx, [x + 10, g - 96, x + 28, g - 74, x + 58, g - 84], 10, d.shirt)
        dot(ctx, x + 58, g - 84, 5, d.skin)
      }
      ctx.restore()
    })
  }
}

// -- children holding hands --------------------------------------------------------------------------

function unityCircle(raised: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const kids: Dress[] = [
      { skin: PEACH, hair: '#d97706', shirt: color },
      { skin: DEEP, hair: '#292524', shirt: color2 },
      { skin: TAN, hair: '#292524', shirt: '#22c55e' },
      { skin: SKIN, hair: '#78350f', shirt: '#f472b6' },
      { skin: BROWN, hair: '#292524', shirt: '#38bdf8' },
    ]
    const k = 0.72
    const hop = raised ? Math.abs(Math.sin(p)) * 10 : 0
    const hy = raised ? -150 : -64 + Math.sin(p) * 4
    kids.forEach((d, i) => {
      const x = 36 + i * 52
      ctx.save()
      ctx.translate(x, 196 - (i % 2 ? hop : hop * 0.6))
      ctx.scale(k, k)
      standing(ctx, 0, 0, i % 2 ? -1 : 1, d, { skirt: i % 2 === 1, open: raised ? 0.7 : 0 })
      // Hands joined with the ones either side.
      const reach = 52 / k / 2
      if (i > 0) arm(ctx, [-10, -96, -reach * 0.6, (hy - 96) / 2, -reach, hy], 9, shade(d.shirt, -0.15))
      if (i < kids.length - 1) arm(ctx, [10, -96, reach * 0.6, (hy - 96) / 2, reach, hy], 9, d.shirt)
      dot(ctx, i > 0 ? -reach : -14, i > 0 ? hy : -50, 6, d.skin)
      dot(ctx, i < kids.length - 1 ? reach : 14, i < kids.length - 1 ? hy : -50, 6, d.skin)
      ctx.restore()
    })
  }
}

// -- a child letting a dove go ---------------------------------------------------------------------------

function doveRelease(releasing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color }: SpriteColors) => {
    const p = f / frames
    const g = 246
    const d: Dress = { skin: TAN, hair: '#292524', shirt: color }
    standing(ctx, 80, g, 1, d, { open: releasing && p > 0.3 ? 0.6 : 0 })
    if (!releasing) {
      // Holding the dove in cupped hands, its head bobbing.
      dove(ctx, 112, g - 108 + Math.sin(p * TAU) * 1.5, 0.75, 0, 1)
      arm(ctx, [70, g - 96, 82, g - 76, 104, g - 94], 10, shade(color, -0.15))
      arm(ctx, [90, g - 96, 100, g - 78, 118, g - 96], 10, color)
      dot(ctx, 104, g - 95, 6, d.skin)
      dot(ctx, 118, g - 97, 6, d.skin)
      return
    }
    // Hands lift and open, the dove flies up and away, and the child waves after it.
    const lift = Math.min(1, p / 0.25)
    const hy = g - 96 - lift * 50
    if (p < 0.75) {
      const q = Math.max(0, (p - 0.2) / 0.55)
      const flap = q > 0 ? 0.5 + 0.5 * Math.sin(p * TAU * 4) : 0
      dove(ctx, 112 + q * 70, hy - 12 - q * 170, 0.75, flap, 1)
    }
    arm(ctx, [70, g - 96, 84, g - 120, 102 - lift * 6, hy], 10, shade(color, -0.15))
    arm(ctx, [90, g - 96, 104, g - 118, 122 + lift * 6, hy - (p > 0.75 ? Math.sin(p * TAU * 3) * 8 : 0)], 10, color)
    dot(ctx, 102 - lift * 6, hy, 6, d.skin)
    dot(ctx, 122 + lift * 6, hy - (p > 0.75 ? Math.sin(p * TAU * 3) * 8 : 0), 6, d.skin)
    if (p >= 0.3) for (let k = 0; k < 2; k++) dot(ctx, 150 + k * 20, 30 + k * 14, 2, rgba('#ffffff', 0.7))
  }
}

// -- volunteers planting a tree --------------------------------------------------------------------------

/** Level from a bare sapling to a leafy young tree. */
function treePlanters(ctx: Ctx, f: number, n: number, { color, color2 }: SpriteColors) {
  const u = f / (n - 1)
  const g = 236
  // The tree.
  const top = g - 40 - u * 120
  ctx.strokeStyle = '#92400e'
  ctx.lineCap = 'round'
  ctx.lineWidth = 4 + u * 6
  ctx.beginPath()
  ctx.moveTo(140, g - 12)
  ctx.lineTo(140, top + 10)
  ctx.stroke()
  ctx.lineWidth = 2 + u * 3
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(140, top + 30 + u * 20)
    ctx.lineTo(140 + s * (10 + u * 24), top + 10 + u * 6)
    ctx.stroke()
  }
  const r = 10 + u * 34
  for (const [dx, dy, k] of [[0, 0, 1], [-0.7, 0.4, 0.8], [0.7, 0.4, 0.8], [-0.4, -0.4, 0.75], [0.45, -0.35, 0.7]] as const) {
    ctx.fillStyle = k === 1 ? '#16a34a' : '#22c55e'
    ellipse(ctx, 140 + dx * r, top + dy * r, r * k * 0.8, r * k * 0.7)
    ctx.fill()
  }
  if (u > 0.7) for (let k = 0; k < 7; k++) dot(ctx, 140 + Math.cos(k * 2.3) * r * 0.8, top + Math.sin(k * 2.3) * r * 0.5, 3, '#fbcfe8')
  // The mound of fresh earth.
  ctx.fillStyle = '#92400e'
  ellipse(ctx, 140, g - 6, 40, 10)
  ctx.fill()
  // A volunteer with a shovel (left) and one with a watering can (right).
  const a: Dress = { skin: BROWN, hair: '#292524', shirt: color }
  const b: Dress = { skin: PEACH, hair: '#a16207', shirt: color2 }
  arm(ctx, [44, g - 96, 52, g - 70, 66, g - 66], 10, shade(color, -0.2))
  standing(ctx, 54, g, 1, a)
  ctx.strokeStyle = '#a16207'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(70, g - 100)
  ctx.lineTo(96, g - 18)
  ctx.stroke()
  ctx.fillStyle = '#94a3b8'
  ctx.beginPath()
  ctx.moveTo(90, g - 22)
  ctx.lineTo(104, g - 26)
  ctx.lineTo(104, g - 4)
  ctx.lineTo(96, g)
  ctx.lineTo(90, g - 6)
  ctx.fill()
  arm(ctx, [64, g - 96, 72, g - 78, 76, g - 76], 10, color)
  dot(ctx, 76, g - 76, 5, a.skin)
  standing(ctx, 214, g, -1, b, { open: u > 0.85 ? 0.6 : 0 })
  arm(ctx, [204, g - 96, 192, g - 76, 180, g - 82], 10, color2)
  // The can, pouring once the tree is going.
  ctx.fillStyle = '#22c55e'
  rr(ctx, 160, g - 92, 26, 20, 4)
  ctx.strokeStyle = '#22c55e'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(162, g - 86)
  ctx.lineTo(146, g - 100)
  ctx.stroke()
  dot(ctx, 180, g - 82, 5, b.skin)
  if (u > 0.3) {
    ctx.fillStyle = rgba('#93c5fd', 0.8)
    for (let k = 0; k < 5; k++) dot(ctx, 144 - k * 1.5, g - 96 + k * 14, 2, rgba('#93c5fd', 0.8))
  }
}

// -- the groundhog -------------------------------------------------------------------------------------

function groundhogAt(ctx: Ctx, up: number, mood: 'sleepy' | 'shocked' | 'happy', f: number, color: string) {
  const cy = 190 - up * 76
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, 220, 182)
  ctx.clip()
  const body = color
  const belly = shade(color, 0.35)
  const shake = mood === 'shocked' ? Math.sin(f * 3) * 2 : 0
  ctx.translate(shake, 0)
  ctx.fillStyle = body
  ellipse(ctx, 100, cy + 30, 30, 40)
  ctx.fill()
  ctx.fillStyle = belly
  ellipse(ctx, 104, cy + 36, 18, 28)
  ctx.fill()
  // Head and little round ears.
  dot(ctx, 84, cy - 14, 7, shade(body, -0.15))
  dot(ctx, 116, cy - 14, 7, shade(body, -0.15))
  ctx.fillStyle = body
  ellipse(ctx, 100, cy, 24, 20)
  ctx.fill()
  ctx.fillStyle = belly
  ellipse(ctx, 104, cy + 8, 13, 9)
  ctx.fill()
  dot(ctx, 104, cy + 2, 4, '#57534e')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(101, cy + 10, 3, 5)
  ctx.fillRect(105, cy + 10, 3, 5)
  // Eyes.
  for (const ex of [92, 112]) {
    if (mood === 'sleepy') {
      ctx.strokeStyle = '#1f2937'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(ex, cy - 6, 3.5, 0.2, Math.PI - 0.2)
      ctx.stroke()
    } else if (mood === 'shocked') {
      dot(ctx, ex, cy - 6, 6, '#ffffff')
      dot(ctx, ex + 1, cy - 6, 2.5, '#1f2937')
    } else {
      ctx.strokeStyle = '#1f2937'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(ex, cy - 4, 4, Math.PI * 1.15, Math.PI * 1.85)
      ctx.stroke()
    }
  }
  // Paws: up in fright, waving, or resting on the edge.
  if (mood === 'shocked') {
    arm(ctx, [80, cy + 20, 70, cy, 76, cy - 18], 9, body)
    arm(ctx, [120, cy + 20, 130, cy, 124, cy - 18], 9, body)
  } else if (mood === 'happy') {
    const w = Math.sin(f * 2) * 8
    arm(ctx, [80, cy + 20, 66, cy + 4, 60 + w, cy - 14], 9, body)
    arm(ctx, [120, cy + 20, 134, cy + 4, 140 - w, cy - 14], 9, body)
  } else {
    dot(ctx, 86, cy + 26, 6, shade(body, -0.1))
    dot(ctx, 114, cy + 26, 6, shade(body, -0.1))
  }
  ctx.restore()
}

function groundhog(mood: 'rise' | 'shadow' | 'spring') {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const up = mood === 'rise' ? f / (frames - 1) : 1
    // The burrow: a mound of snow (or grass in an early spring) with the hole.
    const spring = mood === 'spring'
    ctx.fillStyle = spring ? '#65a30d' : '#e2e8f0'
    ellipse(ctx, 100, 188, 90, 16)
    ctx.fill()
    if (mood === 'shadow') {
      // His shadow, long and grey on the bright snow: he has seen it.
      ctx.fillStyle = '#f8fafc'
      ellipse(ctx, 160, 188, 60, 12)
      ctx.fill()
      ctx.fillStyle = '#64748b'
      ellipse(ctx, 166, 188, 40, 7)
      ctx.fill()
      ellipse(ctx, 204, 186, 11, 6)
      ctx.fill()
    }
    ctx.fillStyle = '#57534e'
    ellipse(ctx, 100, 184, 34, 8)
    ctx.fill()
    groundhogAt(ctx, up, mood === 'shadow' ? 'shocked' : mood === 'spring' ? 'happy' : up < 0.6 ? 'sleepy' : 'happy', f, color)
    ctx.fillStyle = spring ? '#84cc16' : '#f1f5f9'
    ctx.beginPath()
    ctx.ellipse(100, 186, 36, 5, 0, 0, Math.PI)
    ctx.fill()
    if (spring) {
      // Crocuses coming up.
      for (const [x, c] of [[30, color2], [50, '#facc15'], [150, color2], [176, '#f472b6']] as const) {
        ctx.strokeStyle = '#16a34a'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x, 188)
        ctx.lineTo(x, 172 - (f % 2) * 2)
        ctx.stroke()
        ctx.fillStyle = c
        ellipse(ctx, x, 168 - (f % 2) * 2, 5, 7)
        ctx.fill()
      }
    }
    if (mood === 'shadow') {
      ctx.strokeStyle = '#facc15'
      ctx.lineWidth = 2.5
      for (let k = 0; k < 4; k++) {
        const a = -Math.PI * 0.85 + k * 0.4
        ctx.beginPath()
        ctx.moveTo(100 + Math.cos(a) * 44, 100 + Math.sin(a) * 40)
        ctx.lineTo(100 + Math.cos(a) * 56, 100 + Math.sin(a) * 52)
        ctx.stroke()
      }
    }
  }
}

// -- a serenade ------------------------------------------------------------------------------------------

function heartNote(ctx: Ctx, f: number) {
  ctx.fillStyle = f % 2 ? '#f472b6' : '#ef4444'
  heartPath(ctx, 32, 32, 22)
  ctx.fill()
  ctx.fillStyle = rgba('#ffffff', 0.5)
  ellipse(ctx, 22, 24, 5, 3, -0.6)
  ctx.fill()
}

function serenade(playing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 226
    const strum = Math.sin(p * (playing ? 2 : 1)) * (playing ? 6 : 3)
    // On one knee: the back leg kneeling, the front foot planted.
    arm(ctx, [96, g - 58, 84, g - 12, 56, g - 8], 13, '#475569')
    ctx.fillStyle = '#334155'
    rr(ctx, 46, g - 14, 16, 10, 3)
    arm(ctx, [100, g - 58, 128, g - 58, 130, g - 8], 13, '#64748b')
    ctx.fillStyle = '#334155'
    rr(ctx, 124, g - 10, 24, 9, 3)
    // Body, head, the rose in his teeth.
    ctx.fillStyle = color
    rr(ctx, 84, g - 116, 32, 60, 10)
    head(ctx, 104, g - 132, 16, TAN, 1, { blink: true })
    ctx.fillStyle = '#292524'
    ctx.beginPath()
    ctx.arc(104, g - 134, 17, Math.PI * 1.02, Math.PI * 1.98)
    ctx.fill()
    ctx.strokeStyle = '#16a34a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(108, g - 124)
    ctx.lineTo(126, g - 132)
    ctx.stroke()
    dot(ctx, 128, g - 134, 5, '#e11d48')
    // The guitar, its neck out towards his love.
    ctx.save()
    ctx.translate(108, g - 78)
    ctx.rotate(-0.4)
    ctx.fillStyle = '#b45309'
    ellipse(ctx, -6, 0, 20, 16)
    ctx.fill()
    ellipse(ctx, 14, 0, 15, 12)
    ctx.fill()
    dot(ctx, 6, 0, 5, '#422006')
    ctx.fillStyle = '#78350f'
    ctx.fillRect(24, -3, 46, 6)
    ctx.fillStyle = color2
    rr(ctx, 68, -5, 12, 10, 3)
    ctx.restore()
    arm(ctx, [114, g - 108, 140, g - 112, 166, g - 116], 9, shade(color, -0.1))
    dot(ctx, 166, g - 116, 5, TAN)
    arm(ctx, [92, g - 108, 98, g - 86, 110 + strum * 0.3, g - 82 + strum], 9, color)
    dot(ctx, 110 + strum * 0.3, g - 82 + strum, 5, TAN)
  }
}

// -- a candy heart -----------------------------------------------------------------------------------------

const SWEET = [['BE', 'MINE'], ['HUG', 'ME'], ['XO', 'XO'], ['LOVE', 'YOU']]
const PASTEL = ['#f9a8d4', '#fde68a', '#a7f3d0', '#c4b5fd']

function candyHeart(ctx: Ctx, f: number) {
  const c = PASTEL[f % 4]
  ctx.fillStyle = shade(c, -0.25)
  heartPath(ctx, 104, 98, 82)
  ctx.fill()
  ctx.fillStyle = c
  heartPath(ctx, 100, 92, 82)
  ctx.fill()
  ctx.fillStyle = rgba('#ffffff', 0.35)
  ellipse(ctx, 62, 56, 18, 9, -0.6)
  ctx.fill()
  ctx.fillStyle = '#e11d48'
  ctx.font = 'bold 30px "Arial Black", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(SWEET[f % 4][0], 100, 82)
  ctx.fillText(SWEET[f % 4][1], 100, 116)
}

// -- a waltzing couple ---------------------------------------------------------------------------------------

function waltz(dancing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const th = dancing ? p * TAU : Math.sin(p * TAU) * 0.25
    const g = 246
    const c = Math.cos(th)
    const manX = 110 - 22 * c
    const herX = 110 + 22 * c
    const side = Math.sign(herX - manX) || 1
    const man: Dress = { skin: SKIN, hair: '#78350f', shirt: '#94a3b8', pants: '#64748b' }
    const her: Dress = { skin: BROWN, hair: '#292524', shirt: color }
    const spin = dancing ? Math.abs(Math.sin(th)) : 0
    const drawHim = () => {
      standing(ctx, manX, g, side, man, { stride: dancing ? Math.sin(th * 2) * 0.6 : 0, blink: true })
      ctx.fillStyle = color2
      ctx.fillRect(manX - 3, g - 104, 6, 14)
    }
    const drawHer = () => {
      // A long ball gown, swirling out as they turn.
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(herX - 12, g - 104)
      ctx.lineTo(herX + 12, g - 104)
      ctx.quadraticCurveTo(herX + 16, g - 50, herX + 34 + spin * 14, g - 2)
      ctx.lineTo(herX - 34 - spin * 14, g - 2)
      ctx.quadraticCurveTo(herX - 16, g - 50, herX - 12, g - 104)
      ctx.fill()
      ctx.fillStyle = shade(color, 0.25)
      for (let k = 0; k < 3; k++) {
        ctx.beginPath()
        ctx.moveTo(herX - 6 + k * 6, g - 80)
        ctx.lineTo(herX - 26 + k * 22 - spin * 6, g - 4)
        ctx.lineTo(herX - 20 + k * 22 - spin * 6, g - 4)
        ctx.fill()
      }
      head(ctx, herX - side * 2, g - 118, 15, her.skin, -side, { blink: true })
      ctx.fillStyle = her.hair
      ctx.beginPath()
      ctx.arc(herX - side * 2, g - 120, 16, Math.PI * 1.02, Math.PI * 1.98)
      ctx.fill()
      dot(ctx, herX + side * 12, g - 124, 8, her.hair)
    }
    // Whoever is further away is painted first.
    if (Math.sin(th) > 0) {
      drawHer()
      drawHim()
    } else {
      drawHim()
      drawHer()
    }
    // His hand on her back; their other hands joined, out to the side.
    const jx = manX - side * 30
    const jy = g - 124
    arm(ctx, [manX - side * 10, g - 96, manX - side * 22, g - 112, jx, jy], 9, '#94a3b8')
    arm(ctx, [herX - side * 10, g - 96, (herX + jx) / 2, g - 118, jx + side * 4, jy + 2], 7, her.skin)
    dot(ctx, jx, jy, 5, man.skin)
    arm(ctx, [manX + side * 10, g - 96, manX + side * 20, g - 82, herX - side * 2, g - 90], 9, '#94a3b8')
  }
}

// -- penguins proposing with a pebble ---------------------------------------------------------------------------

function penguin(ctx: Ctx, x: number, g: number, dir: number, bow: number, flap: number, body: string, pebble: boolean) {
  ctx.save()
  ctx.translate(x, g)
  ctx.scale(dir, 1)
  ctx.rotate(bow * 0.6)
  ctx.fillStyle = '#f59e0b'
  ellipse(ctx, -8, -2, 9, 4)
  ctx.fill()
  ellipse(ctx, 10, -2, 9, 4)
  ctx.fill()
  ctx.fillStyle = body
  ellipse(ctx, 0, -46, 30, 46)
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  ellipse(ctx, 8, -40, 20, 36)
  ctx.fill()
  ctx.fillStyle = body
  ellipse(ctx, 4, -94, 20, 18)
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  ellipse(ctx, 12, -92, 9, 8)
  ctx.fill()
  dot(ctx, 14, -96, 2.5, '#1f2937')
  ctx.fillStyle = '#f59e0b'
  ctx.beginPath()
  ctx.moveTo(22, -94)
  ctx.lineTo(36, -90)
  ctx.lineTo(22, -86)
  ctx.fill()
  if (pebble) dot(ctx, 36, -89, 5, '#cbd5e1')
  ctx.save()
  ctx.translate(-10, -64)
  ctx.rotate(0.3 + flap * 0.9)
  ctx.fillStyle = shade(body, -0.15)
  ellipse(ctx, 0, 20, 8, 24)
  ctx.fill()
  ctx.restore()
  ctx.restore()
}

function pebblePenguins(offering: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color }: SpriteColors) => {
    const p = f / frames
    const g = 186
    const waddle = Math.sin(p * TAU) * 0.06
    const bow = offering ? Math.sin(Math.min(1, p / 0.5) * Math.PI) : 0
    const given = offering && p >= 0.5
    if (given) dot(ctx, 128, g - 4, 6, '#cbd5e1')
    penguin(ctx, 72, g, 1, offering ? bow * 0.9 : waddle, 0, color, !given)
    penguin(ctx, 166, g, -1, offering ? 0 : -waddle, given ? Math.abs(Math.sin(p * TAU * 3)) : 0, shade(color, 0.12), false)
    if (given) {
      for (let k = 0; k < 3; k++) {
        const q = ((p - 0.5) * 2 + k / 3) % 1
        ctx.fillStyle = k % 2 ? '#f472b6' : '#ef4444'
        heartPath(ctx, 120 + Math.sin(q * 6 + k) * 10, 80 - q * 60, 8 + q * 4)
        ctx.fill()
      }
    }
  }
}

// -- a child with a heart balloon ------------------------------------------------------------------------------

function heartBalloonKid(jumping: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const hop = jumping ? Math.abs(Math.sin(p)) * 16 : Math.abs(Math.cos(p)) * 2
    const g = 256 - hop
    const d: Dress = { skin: PEACH, hair: '#a16207', shirt: color2 }
    ctx.save()
    ctx.translate(70, g)
    ctx.scale(0.85, 0.85)
    ctx.translate(-70, -g)
    if (jumping) {
      const w = Math.sin(p * 2) * 10
      arm(ctx, [60, g - 96, 48, g - 120, 44 + w, g - 142], 9, shade(color2, -0.2))
      dot(ctx, 44 + w, g - 144, 5.5, d.skin)
    }
    standing(ctx, 70, g, 1, d, { stride: jumping ? 0 : Math.sin(p), open: jumping ? 0.7 : 0, skirt: true })
    arm(ctx, [80, g - 96, 92, g - 80, 100, g - 92], 9, color2)
    dot(ctx, 100, g - 92, 5.5, d.skin)
    ctx.restore()
    // The string and the big heart balloon bobbing over her.
    const bx = 120 + Math.sin(p) * 6
    const by = 70 - (jumping ? Math.abs(Math.sin(p)) * 8 : 0) + Math.cos(p) * 3
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(100 * 0.85 + 70 * 0.15, g - 92 * 0.85)
    ctx.quadraticCurveTo(110, (g + by) / 2, bx, by + 38)
    ctx.stroke()
    ctx.fillStyle = color
    heartPath(ctx, bx, by, 40)
    ctx.fill()
    ctx.fillStyle = rgba('#ffffff', 0.4)
    ellipse(ctx, bx - 18, by - 14, 8, 5, -0.6)
    ctx.fill()
    ctx.fillStyle = shade(color, -0.2)
    ctx.beginPath()
    ctx.moveTo(bx - 4, by + 40)
    ctx.lineTo(bx + 4, by + 40)
    ctx.lineTo(bx, by + 35)
    ctx.fill()
  }
}

// -- Mount Rushmore -------------------------------------------------------------------------------------------

/** Frame 0 looks left, 1 ahead, 2 right, 3 all four with their eyes shut in a stony smile. */
function rushmore(ctx: Ctx, f: number) {
  const look = f === 0 ? -1 : f === 2 ? 1 : 0
  const shut = f === 3
  const stone = '#d6d3d1'
  const dark = '#a8a29e'
  // The mountain.
  ctx.fillStyle = dark
  ctx.beginPath()
  ctx.moveTo(0, 220)
  ctx.lineTo(10, 120)
  ctx.lineTo(40, 70)
  ctx.lineTo(90, 30)
  ctx.lineTo(170, 18)
  ctx.lineTo(250, 36)
  ctx.lineTo(310, 70)
  ctx.lineTo(336, 150)
  ctx.lineTo(340, 220)
  ctx.fill()
  ctx.fillStyle = '#c4bfba'
  for (let k = 0; k < 9; k++) {
    ctx.beginPath()
    ctx.moveTo(10 + k * 38, 220)
    ctx.lineTo(24 + k * 38, 176 + (k % 3) * 8)
    ctx.lineTo(42 + k * 38, 220)
    ctx.fill()
  }
  const face = (cx: number, cy: number, s: number, kind: 'george' | 'tom' | 'teddy' | 'abe') => {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(s, s)
    // Hair or wig behind, then the face.
    ctx.fillStyle = shade(stone, -0.08)
    if (kind === 'george') {
      ellipse(ctx, -2, -18, 34, 30)
      ctx.fill()
      for (const y of [-6, 6]) dot(ctx, -30, y, 8, shade(stone, -0.12))
    } else if (kind === 'tom') {
      ellipse(ctx, -4, -20, 34, 28)
      ctx.fill()
    } else if (kind === 'abe') {
      ellipse(ctx, 0, -24, 32, 22)
      ctx.fill()
    } else {
      ellipse(ctx, 0, -22, 30, 22)
      ctx.fill()
    }
    ctx.fillStyle = stone
    ellipse(ctx, 0, 0, 28, 38)
    ctx.fill()
    ctx.fillStyle = rgba('#78716c', 0.35)
    ellipse(ctx, -16, 4, 8, 22)
    ctx.fill()
    // Brow, nose, eyes.
    ctx.fillStyle = shade(stone, -0.18)
    ctx.fillRect(-18, -14, 36, 4)
    ctx.beginPath()
    ctx.moveTo(-3, -10)
    ctx.lineTo(5, 10)
    ctx.lineTo(-5, 12)
    ctx.fill()
    for (const ex of [-11, 11]) {
      if (shut) {
        ctx.strokeStyle = '#57534e'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.arc(ex, -5, 5, 0.3, Math.PI - 0.3)
        ctx.stroke()
      } else {
        ctx.fillStyle = '#e7e5e4'
        ellipse(ctx, ex, -5, 6, 4)
        ctx.fill()
        dot(ctx, ex + look * 3, -5, 2.6, '#44403c')
      }
    }
    ctx.strokeStyle = '#78716c'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    if (shut) ctx.arc(0, 18, 9, 0.3, Math.PI - 0.3)
    else {
      ctx.moveTo(-9, 22)
      ctx.lineTo(9, 22)
    }
    ctx.stroke()
    if (kind === 'teddy') {
      // Spectacles and a big moustache.
      ctx.strokeStyle = '#57534e'
      ctx.lineWidth = 2
      for (const ex of [-11, 11]) {
        ctx.beginPath()
        ctx.arc(ex, -5, 8, 0, TAU)
        ctx.stroke()
      }
      ctx.fillStyle = shade(stone, -0.25)
      ellipse(ctx, -7, 16, 10, 4, 0.2)
      ctx.fill()
      ellipse(ctx, 7, 16, 10, 4, -0.2)
      ctx.fill()
    } else if (kind === 'abe') {
      // A chin beard and hollow cheeks.
      ctx.fillStyle = shade(stone, -0.22)
      ctx.beginPath()
      ctx.moveTo(-24, 10)
      ctx.quadraticCurveTo(0, 54, 24, 10)
      ctx.quadraticCurveTo(0, 34, -24, 10)
      ctx.fill()
    }
    ctx.restore()
  }
  face(66, 94, 1.15, 'george')
  face(140, 104, 1, 'tom')
  face(206, 116, 0.9, 'teddy')
  face(276, 104, 1.1, 'abe')
}

// -- the Liberty Bell --------------------------------------------------------------------------------------

function libertyBell(ringing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const swing = Math.sin(p) * (ringing ? 0.3 : 0.04)
    // The wooden frame and yoke.
    ctx.fillStyle = color
    ctx.fillRect(30, 40, 12, 214)
    ctx.fillRect(178, 40, 12, 214)
    rr(ctx, 20, 248, 180, 10, 3)
    rr(ctx, 22, 28, 176, 20, 6)
    ctx.save()
    ctx.translate(110, 48)
    ctx.rotate(swing)
    // The clapper, swinging behind the lip.
    dot(ctx, -swing * 30, 150, 9, '#57534e')
    const bronze = ctx.createLinearGradient(-60, 0, 60, 0)
    bronze.addColorStop(0, '#8a6a3e')
    bronze.addColorStop(0.4, '#c9a26a')
    bronze.addColorStop(1, '#7a5a30')
    ctx.fillStyle = bronze
    ctx.beginPath()
    ctx.moveTo(-26, 14)
    ctx.quadraticCurveTo(-34, 70, -48, 128)
    ctx.quadraticCurveTo(-64, 146, -66, 152)
    ctx.lineTo(66, 152)
    ctx.quadraticCurveTo(64, 146, 48, 128)
    ctx.quadraticCurveTo(34, 70, 26, 14)
    ctx.quadraticCurveTo(0, 0, -26, 14)
    ctx.fill()
    ctx.fillStyle = shade('#c9a26a', -0.2)
    rr(ctx, -12, -4, 24, 16, 6)
    rr(ctx, -62, 140, 124, 8, 4)
    ctx.fillRect(-30, 36, 60, 4)
    ctx.fillStyle = '#4a3820'
    ctx.font = 'bold 9px Georgia, serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('PROCLAIM LIBERTY', 0, 48)
    // The crack.
    ctx.strokeStyle = '#3f2e1a'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-8, 146)
    ctx.lineTo(-4, 128)
    ctx.lineTo(-10, 112)
    ctx.lineTo(-6, 96)
    ctx.lineTo(-11, 82)
    ctx.stroke()
    ctx.restore()
    if (ringing && Math.abs(Math.sin(p)) > 0.85) {
      ctx.strokeStyle = color2
      ctx.lineWidth = 3
      const s = Math.sign(Math.sin(p))
      for (let k = 0; k < 3; k++) {
        ctx.beginPath()
        ctx.arc(110 + s * 80, 140, 12 + k * 10, -0.6, 0.6)
        if (s < 0) {
          ctx.beginPath()
          ctx.arc(110 + s * 80, 140, 12 + k * 10, Math.PI - 0.6, Math.PI + 0.6)
        }
        ctx.stroke()
      }
    }
  }
}

// -- young Washington and the cherry tree ------------------------------------------------------------------

function cherryTree(confessing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 246
    // The tree, laden with cherries (some falling for people).
    ctx.fillStyle = '#92400e'
    ctx.beginPath()
    ctx.moveTo(156, g)
    ctx.lineTo(164, g - 150)
    ctx.lineTo(176, g - 150)
    ctx.lineTo(182, g)
    ctx.fill()
    const sway = Math.sin(p * TAU) * 3
    for (const [x, y, r] of [[170, 70, 46], [130, 96, 34], [208, 96, 34], [150, 52, 30], [196, 54, 30]] as const) {
      ctx.fillStyle = '#16a34a'
      ellipse(ctx, x + sway, y, r, r * 0.8)
      ctx.fill()
    }
    for (let k = 0; k < 14; k++) {
      const x = 120 + ((k * 37) % 100) + sway
      const y = 44 + ((k * 23) % 70)
      const falls = confessing && k % 3 === 0
      const q = falls ? ((p + k * 0.13) % 1) : 0
      const yy = y + q * q * (g - y - 6)
      dot(ctx, x - 3, yy, 4.5, '#dc2626')
      dot(ctx, x + 4, yy + 1, 4.5, '#b91c1c')
      ctx.strokeStyle = '#166534'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(x - 3, yy - 4)
      ctx.lineTo(x, yy - 10)
      ctx.lineTo(x + 4, yy - 3)
      ctx.stroke()
    }
    // Young George: blue coat, white breeches, a tricorn, a little hatchet.
    ctx.save()
    ctx.translate(64, g)
    ctx.scale(0.82, 0.82)
    const d: Dress = { skin: PEACH, hair: '#f1f5f9', shirt: color, pants: '#f1f5f9', shoes: '#57534e' }
    arm(ctx, [-10, -96, -20, -70, -14, -50], 9, shade(color, -0.2))
    standing(ctx, 0, 0, 1, d, { open: confessing ? 0.5 : 0 })
    ctx.fillStyle = color2
    ctx.fillRect(-15, -104, 4, 48)
    ctx.fillRect(11, -104, 4, 48)
    // Tricorn hat.
    ctx.fillStyle = '#57534e'
    ctx.beginPath()
    ctx.moveTo(-22, -128)
    ctx.quadraticCurveTo(2, -150, 26, -128)
    ctx.quadraticCurveTo(2, -134, -22, -128)
    ctx.fill()
    ctx.fillStyle = color2
    ctx.fillRect(-18, -131, 40, 3)
    if (confessing) {
      // Hand up ("I cannot tell a lie!"), the hatchet held out behind.
      arm(ctx, [10, -96, 22, -118, 20, -142], 9, color)
      dot(ctx, 20, -144, 6, d.skin)
    } else {
      arm(ctx, [10, -96, 20, -76, 30, -66], 9, color)
      dot(ctx, 30, -66, 6, d.skin)
      ctx.strokeStyle = '#a16207'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(30, -66)
      ctx.lineTo(44, -86)
      ctx.stroke()
      ctx.fillStyle = '#cbd5e1'
      ctx.beginPath()
      ctx.moveTo(40, -92)
      ctx.lineTo(54, -86)
      ctx.lineTo(46, -78)
      ctx.fill()
      // Whistling.
      ctx.strokeStyle = rgba('#ffffff', 0.7)
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(30, -122 - (f % 2) * 4, 4, 0, TAU)
      ctx.stroke()
    }
    ctx.restore()
    if (confessing) {
      ctx.strokeStyle = '#a16207'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(48, g - 46)
      ctx.lineTo(34, g - 62)
      ctx.stroke()
      ctx.fillStyle = '#cbd5e1'
      ctx.beginPath()
      ctx.moveTo(30, g - 70)
      ctx.lineTo(40, g - 66)
      ctx.lineTo(32, g - 58)
      ctx.fill()
    }
  }
}

// -- fife and drum -----------------------------------------------------------------------------------------

function fifeAndDrum(lively: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 246
    const soldier = (x: number, ph: number) => {
      const bob = Math.abs(Math.sin(p + ph)) * (lively ? 6 : 3)
      const d: Dress = { skin: PEACH, hair: '#f1f5f9', shirt: color, pants: '#f1f5f9', shoes: '#57534e' }
      ctx.save()
      ctx.translate(0, -bob)
      standing(ctx, x, g + bob, 1, d, { stride: Math.sin(p + ph) })
      ctx.fillStyle = color2
      ctx.fillRect(x - 15, g - 104, 30, 5)
      ctx.fillRect(x - 3, g - 100, 6, 40)
      ctx.fillStyle = '#57534e'
      ctx.beginPath()
      ctx.moveTo(x - 20, g - 128)
      ctx.quadraticCurveTo(x + 2, g - 150, x + 26, g - 128)
      ctx.quadraticCurveTo(x + 2, g - 134, x - 20, g - 128)
      ctx.fill()
      ctx.restore()
      return bob
    }
    // The drummer, his drum on his hip.
    const b1 = soldier(70, 0)
    ctx.save()
    ctx.translate(0, -b1)
    ctx.fillStyle = '#f8fafc'
    rr(ctx, 74, g - 72, 40, 26, 4)
    ctx.strokeStyle = color2
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let k = 0; k <= 4; k++) ctx.lineTo(74 + k * 10, k % 2 ? g - 48 : g - 70)
    ctx.stroke()
    ctx.fillStyle = color2
    ctx.fillRect(72, g - 74, 44, 4)
    ctx.fillRect(72, g - 48, 44, 4)
    const hit = (ph: number) => (lively ? Math.max(0, Math.sin(p * 2 + ph)) * 26 : Math.max(0, Math.sin(p + ph)) * 12)
    for (const [ph, sx] of [[0, 62], [Math.PI, 80]] as const) {
      const h = hit(ph)
      const hx = sx + 18
      const hy = g - 86 - h
      arm(ctx, [sx, g - 96, sx + 6, g - 80, hx, hy], 9, color)
      ctx.strokeStyle = '#a16207'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(hx, hy)
      ctx.lineTo(hx + 20, hy + 14 + h * 0.4)
      ctx.stroke()
      dot(ctx, hx, hy, 5, PEACH)
    }
    ctx.restore()
    // The fifer, his fife out to the side.
    const b2 = soldier(170, 1.2)
    ctx.save()
    ctx.translate(0, -b2)
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(176, g - 112)
    ctx.lineTo(226, g - 108)
    ctx.stroke()
    const tap = f % 2 ? 1.5 : 0
    arm(ctx, [162, g - 96, 180, g - 90, 196, g - 110 + tap], 9, shade(color, -0.15))
    arm(ctx, [178, g - 96, 200, g - 94, 214, g - 108 - tap], 9, color)
    dot(ctx, 196, g - 110 + tap, 5, PEACH)
    dot(ctx, 214, g - 108 - tap, 5, PEACH)
    ctx.restore()
  }
}

// -- a balcony throwing beads -------------------------------------------------------------------------------

function beadLoop(ctx: Ctx, x: number, y: number, r: number, a: number, colour: string) {
  for (let k = 0; k < 14; k++) {
    const t = (k / 14) * TAU
    dot(ctx, x + Math.cos(t + a) * r, y + Math.sin(t + a) * r * 0.6, 2.6, colour)
  }
}

function beadBalcony(throwing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    // Behind the railing: a reveller in a feathered mask.
    const d: Dress = { skin: TAN, hair: '#292524', shirt: color }
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, 220, 168)
    ctx.clip()
    standing(ctx, 90, 250, 1, d, { open: throwing ? 0.7 : 0 })
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(74, 126)
    ctx.quadraticCurveTo(92, 118, 112, 126)
    ctx.quadraticCurveTo(92, 140, 74, 126)
    ctx.fill()
    dot(ctx, 86, 128, 3, '#1f2937')
    dot(ctx, 102, 128, 3, '#1f2937')
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = ['#a855f7', '#22c55e', '#facc15'][k]
      ellipse(ctx, 74 - k * 4, 112 - k * 8, 5, 16, -0.5 - k * 0.2)
      ctx.fill()
    }
    // Beads round the neck.
    beadLoop(ctx, 90, 162, 14, 0, '#facc15')
    beadLoop(ctx, 90, 166, 16, 0.3, '#a855f7')
    ctx.restore()
    // The throwing arm, and strings of beads flying out.
    const swing = throwing ? Math.sin(Math.min(1, p / 0.3) * Math.PI) : 0
    const hx = 120 + swing * 20
    const hy = 120 - swing * 30 + (throwing ? 0 : Math.sin(p * TAU) * 4)
    arm(ctx, [100, 152, 110, 136, hx, hy], 10, color)
    dot(ctx, hx, hy, 6, d.skin)
    if (!throwing) beadLoop(ctx, hx + 6, hy + 14, 10, p * TAU, '#22c55e')
    else {
      ;['#a855f7', '#22c55e', '#facc15'].forEach((c, k) => {
        const q = (p * 1.2 + k * 0.28) % 1
        beadLoop(ctx, 130 + q * 80, 110 - Math.sin(q * Math.PI) * 60 + q * 100, 12, q * 8 + k, c)
      })
    }
    // The wrought-iron railing and the balcony floor, beads hanging off it.
    ctx.fillStyle = '#cbd5e1'
    ctx.fillRect(10, 166, 200, 6)
    rr(ctx, 4, 222, 212, 10, 3)
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 3
    for (let x = 18; x < 210; x += 16) {
      ctx.beginPath()
      ctx.moveTo(x, 172)
      ctx.lineTo(x, 222)
      ctx.stroke()
    }
    ctx.lineWidth = 2
    for (let x = 26; x < 200; x += 32) {
      ctx.beginPath()
      ctx.arc(x, 196, 8, 0, TAU)
      ctx.stroke()
    }
    for (const [x, c] of [[40, '#a855f7'], [150, '#facc15'], [190, '#22c55e']] as const) {
      for (let k = 0; k < 10; k++) dot(ctx, x + Math.sin(k * 0.6) * 6, 172 + k * 5, 2.4, c)
    }
  }
}

// -- a brass band -----------------------------------------------------------------------------------------

function brassBand(hot: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 246
    const brass = '#facc15'
    // The trombonist.
    const b1 = Math.abs(Math.sin(p)) * (hot ? 7 : 3)
    ctx.save()
    ctx.translate(0, -b1)
    standing(ctx, 70, g + b1, 1, { skin: DEEP, hair: '#292524', shirt: '#f8fafc' }, { stride: Math.sin(p), open: 0 })
    ctx.fillStyle = color
    rr(ctx, 54, g - 140, 34, 10, 4)
    rr(ctx, 60, g - 150, 22, 12, 4)
    const tilt = hot ? -0.25 : -0.05
    // The trombone: the bell tube out front on top, the slide below it pushing in and out.
    const slide = (Math.sin(p * 2) + 1) * 12
    ctx.save()
    ctx.translate(82, g - 112)
    ctx.rotate(tilt)
    ctx.strokeStyle = brass
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-2, -2)
    ctx.lineTo(30, -10)
    ctx.stroke()
    ctx.fillStyle = brass
    ctx.beginPath()
    ctx.moveTo(28, -12)
    ctx.lineTo(48, -22)
    ctx.lineTo(48, 4)
    ctx.lineTo(28, -6)
    ctx.fill()
    ctx.strokeRect(0, 0, 34, 5)
    ctx.strokeRect(14 + slide, 1, 34, 4)
    ctx.restore()
    const sx = 82 + Math.cos(tilt) * (46 + slide)
    const sy = g - 112 + Math.sin(tilt) * (46 + slide) + 3
    arm(ctx, [80, g - 96, 90, g - 92, 86, g - 110], 10, '#f8fafc')
    arm(ctx, [62, g - 96, 84, g - 84, sx, sy], 10, '#e2e8f0')
    dot(ctx, sx, sy, 5, DEEP)
    ctx.restore()
    // The trumpeter, bell up when it gets hot.
    const b2 = Math.abs(Math.cos(p)) * (hot ? 7 : 3)
    ctx.save()
    ctx.translate(0, -b2)
    standing(ctx, 190, g + b2, 1, { skin: BROWN, hair: '#292524', shirt: color2 }, { stride: -Math.sin(p), open: 0 })
    ctx.fillStyle = color
    rr(ctx, 174, g - 140, 34, 10, 4)
    rr(ctx, 180, g - 150, 22, 12, 4)
    ctx.save()
    ctx.translate(204, g - 112)
    ctx.rotate(hot ? -0.5 : -0.1)
    ctx.fillStyle = brass
    ctx.fillRect(0, -3, 34, 6)
    ctx.beginPath()
    ctx.moveTo(30, -3)
    ctx.lineTo(48, -12)
    ctx.lineTo(48, 12)
    ctx.lineTo(30, 3)
    ctx.fill()
    for (let k = 0; k < 3; k++) ctx.fillRect(10 + k * 6, -9, 3, 6)
    ctx.restore()
    arm(ctx, [198, g - 96, 208, g - 100, 214, g - 112 - (hot ? 6 : 0)], 10, color2)
    dot(ctx, 214, g - 112 - (hot ? 6 : 0), 5, BROWN)
    ctx.restore()
  }
}

// -- a juggling jester ----------------------------------------------------------------------------------------

function jester(fast: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 256
    // Legs in two colours, curled shoes with bells.
    arm(ctx, [80, g - 60, 76, g - 30, 72, g - 6], 12, color)
    arm(ctx, [100, g - 60, 104, g - 30, 108, g - 6], 12, color2)
    for (const [x, d] of [[72, -1], [108, 1]] as const) {
      ctx.fillStyle = '#facc15'
      ctx.beginPath()
      ctx.moveTo(x - 8, g)
      ctx.quadraticCurveTo(x + d * 20, g, x + d * 18, g - 12)
      ctx.lineTo(x + 8, g - 8)
      ctx.lineTo(x - 8, g - 8)
      ctx.fill()
      dot(ctx, x + d * 18, g - 14, 3, '#fde68a')
    }
    // A diamond-patterned tunic with a zigzag hem.
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(70, g - 116)
    ctx.lineTo(110, g - 116)
    ctx.lineTo(116, g - 58)
    for (let k = 0; k <= 6; k++) ctx.lineTo(116 - k * 7.6, k % 2 ? g - 46 : g - 58)
    ctx.closePath()
    ctx.clip()
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        ctx.fillStyle = (row + col) % 2 ? color : color2
        ctx.beginPath()
        const x = 66 + col * 12 + (row % 2) * 6
        const y = g - 120 + row * 12
        ctx.moveTo(x, y - 6)
        ctx.lineTo(x + 6, y)
        ctx.lineTo(x, y + 6)
        ctx.lineTo(x - 6, y)
        ctx.fill()
      }
    }
    ctx.restore()
    for (let k = 0; k < 5; k++) dot(ctx, 72 + k * 9, g - 116, 5, '#f8fafc')
    head(ctx, 90, g - 134, 16, PEACH, 1, { open: fast ? 0.6 : 0 })
    // The three-pointed hat with bells.
    for (const [a, c] of [[-0.9, color], [0, color2], [0.9, color]] as const) {
      ctx.save()
      ctx.translate(90, g - 144)
      ctx.rotate(a + Math.sin(p * TAU + a) * 0.1)
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.moveTo(-8, 0)
      ctx.quadraticCurveTo(2, -26, 10, -34)
      ctx.lineTo(8, 0)
      ctx.fill()
      dot(ctx, 10, -36, 4, '#facc15')
      ctx.restore()
    }
    // Juggling: three balls low and slow, or five high and fast.
    const n = fast ? 5 : 3
    const high = fast ? 100 : 56
    const hands = (q: number) => Math.sin(q * TAU) * 6
    arm(ctx, [76, g - 108, 66, g - 92, 62, g - 104 + hands(p)], 9, color2)
    arm(ctx, [104, g - 108, 114, g - 92, 118, g - 104 - hands(p)], 9, color)
    dot(ctx, 62, g - 104 + hands(p), 5, PEACH)
    dot(ctx, 118, g - 104 - hands(p), 5, PEACH)
    const balls = ['#ef4444', '#facc15', '#22c55e', '#38bdf8', '#f472b6']
    for (let k = 0; k < n; k++) {
      const q = (p * (fast ? 2 : 1) + k / n) % 1
      // Up from one hand, over the top, down into the other, back underneath.
      const a = q * TAU
      const x = 90 - Math.cos(a) * 28
      const y = g - 110 - Math.max(0, Math.sin(a)) * high - Math.min(0, Math.sin(a)) * 6
      dot(ctx, x, y, 6, balls[k])
    }
  }
}

// -- a king cake -----------------------------------------------------------------------------------------

function kingCake(cutting: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const lift = cutting ? Math.sin(Math.min(1, p / 0.5) * (Math.PI / 2)) : 0
    // The plate.
    ctx.fillStyle = '#e2e8f0'
    ellipse(ctx, 110, 128, 104, 30)
    ctx.fill()
    // The ring of cake: its side, then the iced top in purple, green and gold bands, with a hole in the middle.
    ctx.fillStyle = '#b45309'
    ellipse(ctx, 110, 112, 88, 36)
    ctx.fill()
    const bands = [color, color2, '#facc15']
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * TAU
      const a1 = ((k + 1) / 12) * TAU
      if (k === 1 && lift > 0.05) continue
      ctx.fillStyle = bands[k % 3]
      ctx.beginPath()
      ctx.moveTo(110 + Math.cos(a0) * 38, 98 + Math.sin(a0) * 14)
      ctx.ellipse(110, 98, 88, 34, 0, a0, a1)
      ctx.ellipse(110, 98, 38, 14, 0, a1, a0, true)
      ctx.fill()
      ctx.fillStyle = rgba('#ffffff', 0.6)
      for (let j = 0; j < 4; j++) {
        const a = a0 + (a1 - a0) * (j + 0.5) / 4
        dot(ctx, 110 + Math.cos(a) * 64, 98 + Math.sin(a) * 24, 1.5, '#ffffff')
      }
    }
    ctx.fillStyle = '#e2e8f0'
    ellipse(ctx, 110, 100, 36, 12)
    ctx.fill()
    if (lift > 0.05) {
      // The slice lifted out, and the little baby popping up from the cut.
      const a0 = TAU / 12
      const a1 = (2 * TAU) / 12
      ctx.fillStyle = '#fde68a'
      ctx.beginPath()
      ctx.moveTo(110 + Math.cos(a0) * 38, 98 + Math.sin(a0) * 14)
      ctx.ellipse(110, 98, 88, 34, 0, a0, a1)
      ctx.ellipse(110, 98, 38, 14, 0, a1, a0, true)
      ctx.fill()
      const by = 112 - lift * 30 + (cutting && p > 0.5 ? Math.sin(p * TAU * 3) * 3 : 0)
      dot(ctx, 150, by, 7, '#fda4af')
      ctx.fillStyle = '#fda4af'
      ellipse(ctx, 150, by + 12, 6, 9)
      ctx.fill()
      dot(ctx, 148, by - 1, 1.2, '#1f2937')
      dot(ctx, 153, by - 1, 1.2, '#1f2937')
      ctx.save()
      ctx.translate(178, 104 - lift * 50)
      ctx.rotate(-lift * 0.3)
      ctx.fillStyle = '#b45309'
      ctx.beginPath()
      ctx.moveTo(-22, 0)
      ctx.lineTo(22, 6)
      ctx.lineTo(22, 22)
      ctx.lineTo(-22, 16)
      ctx.fill()
      ctx.fillStyle = color2
      ctx.beginPath()
      ctx.moveTo(-22, 0)
      ctx.lineTo(22, 6)
      ctx.lineTo(16, -6)
      ctx.lineTo(-18, -10)
      ctx.fill()
      ctx.restore()
      ctx.fillStyle = '#cbd5e1'
      ctx.save()
      ctx.translate(196, 82 - lift * 50)
      ctx.rotate(-0.3)
      rr(ctx, 0, 0, 34, 8, 2)
      ctx.fillStyle = '#a16207'
      rr(ctx, 30, 1, 18, 6, 2)
      ctx.restore()
    }
  }
}

// -- a carnival mask --------------------------------------------------------------------------------------

function carnivalMask(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const look = f === 0 ? -1 : f === 2 ? 1 : 0
  const wink = f === 3
  // Plumes fanning up from the top corner.
  for (let k = 0; k < 5; k++) {
    ctx.save()
    ctx.translate(76, 92)
    ctx.rotate(-1.2 + k * 0.32)
    ctx.fillStyle = [color, color2, '#facc15', color, color2][k]
    ellipse(ctx, 0, -38, 9, 34)
    ctx.fill()
    ctx.strokeStyle = rgba('#ffffff', 0.5)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, -4)
    ctx.lineTo(0, -70)
    ctx.stroke()
    ctx.restore()
  }
  // The mask: two halves, gold edging, sequins.
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(30, 100)
  ctx.bezierCurveTo(30, 50, 110, 64, 130, 84)
  ctx.bezierCurveTo(150, 64, 230, 50, 230, 100)
  ctx.bezierCurveTo(230, 150, 160, 150, 130, 130)
  ctx.bezierCurveTo(100, 150, 30, 150, 30, 100)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.clip()
  ctx.fillStyle = color2
  ctx.fillRect(130, 0, 130, 200)
  ctx.restore()
  ctx.strokeStyle = '#facc15'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(30, 100)
  ctx.bezierCurveTo(30, 50, 110, 64, 130, 84)
  ctx.bezierCurveTo(150, 64, 230, 50, 230, 100)
  ctx.bezierCurveTo(230, 150, 160, 150, 130, 130)
  ctx.bezierCurveTo(100, 150, 30, 150, 30, 100)
  ctx.closePath()
  ctx.stroke()
  for (let k = 0; k < 18; k++) dot(ctx, 44 + ((k * 41) % 176), 82 + ((k * 23) % 50), 2, k % 2 ? '#fde68a' : '#ffffff')
  // Eye holes with real eyes looking out.
  for (const [ex, side] of [[88, -1], [172, 1]] as const) {
    ctx.fillStyle = '#facc15'
    ellipse(ctx, ex, 102, 28, 16, side * -0.15)
    ctx.fill()
    if (wink && side > 0) {
      ctx.fillStyle = '#c68a5a'
      ellipse(ctx, ex, 102, 23, 12, side * -0.15)
      ctx.fill()
      ctx.strokeStyle = '#57534e'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(ex, 98, 12, 0.3, Math.PI - 0.3)
      ctx.stroke()
      continue
    }
    ctx.fillStyle = '#ffffff'
    ellipse(ctx, ex, 102, 23, 12, side * -0.15)
    ctx.fill()
    dot(ctx, ex + look * 10, 103, 8, '#7c2d12')
    dot(ctx, ex + look * 10, 103, 4, '#1f2937')
    dot(ctx, ex + look * 10 - 2, 100, 1.6, '#ffffff')
  }
  // The stick.
  ctx.strokeStyle = '#facc15'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(214, 130)
  ctx.lineTo(240, 186)
  ctx.stroke()
}

// -- a dancing crawfish -------------------------------------------------------------------------------------

function crawfish(dancing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 136
    const bob = dancing ? Math.abs(Math.sin(p * 2)) * 8 : 0
    ctx.translate(0, -bob)
    // Walking legs.
    ctx.strokeStyle = shade(color, -0.2)
    ctx.lineWidth = 3
    for (let k = 0; k < 4; k++) {
      const s = Math.sin(p + k * 1.3) * 6
      ctx.beginPath()
      ctx.moveTo(90 + k * 12, g - 40)
      ctx.lineTo(86 + k * 12 + s, g - 22)
      ctx.lineTo(92 + k * 12 + s, g - 4 + bob)
      ctx.stroke()
    }
    // Tail segments and the fan.
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = k % 2 ? color : shade(color, -0.1)
      ellipse(ctx, 76 - k * 12, g - 52 + k * 3 + (dancing ? Math.sin(p * 2) * k : 0), 12 - k, 14 - k)
      ctx.fill()
    }
    for (let k = -2; k <= 2; k++) {
      ctx.fillStyle = shade(color, -0.15)
      ellipse(ctx, 20, g - 34 + k * 5, 12, 5, k * 0.3)
      ctx.fill()
    }
    // Body and head.
    ctx.fillStyle = color
    ellipse(ctx, 116, g - 56, 34, 20)
    ctx.fill()
    ctx.fillStyle = shade(color, 0.2)
    ellipse(ctx, 110, g - 64, 24, 7)
    ctx.fill()
    dot(ctx, 146, g - 68, 6, '#ffffff')
    dot(ctx, 148, g - 68, 3, '#1f2937')
    // Long feelers.
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    for (const s of [0, 1]) {
      ctx.beginPath()
      ctx.moveTo(148, g - 66)
      ctx.quadraticCurveTo(180, g - 110 - s * 10 + Math.sin(p + s) * 6, 210, g - 96 - s * 20)
      ctx.stroke()
    }
    // Big claws: forward and snapping, or up over its head dancing.
    const claw = (sx: number, sy: number, a: number, open: number, col: string) => {
      ctx.save()
      ctx.translate(sx, sy)
      ctx.rotate(a)
      ctx.fillStyle = col
      rr(ctx, 0, -4, 26, 8, 4)
      ctx.save()
      ctx.translate(26, 0)
      ctx.rotate(-open * 0.4)
      ellipse(ctx, 16, -4, 16, 7)
      ctx.fill()
      ctx.restore()
      ctx.save()
      ctx.translate(26, 0)
      ctx.rotate(open * 0.4)
      ellipse(ctx, 14, 5, 13, 5)
      ctx.fill()
      ctx.restore()
      ctx.restore()
    }
    const snap = Math.max(0, Math.sin(p * 2))
    if (dancing) {
      claw(130, g - 62, -1.6 + Math.sin(p * 2) * 0.3, snap, shade(color, -0.1))
      claw(140, g - 58, -1.2 - Math.sin(p * 2) * 0.3, 1 - snap, color)
    } else {
      claw(132, g - 58, -0.3, snap * 0.5, shade(color, -0.1))
      claw(140, g - 52, 0.05, (1 - snap) * 0.5, color)
    }
  }
}

const BUBBLE = { id: 'bubble', frames: 1, w: 360, h: 140 }

export const LATE_WINTER_ROWS: Record<string, SpriteRow[]> = {
  'dreamers-march': [
    { id: 'main', frames: 8, w: 300, h: 230, paint: dreamersMarch(false) },
    { id: 'wave', frames: 8, w: 300, h: 230, paint: dreamersMarch(true) },
    { ...BUBBLE, paint: saying('We shall overcome!') },
    SPARKLE,
  ],
  'unity-circle': [
    { id: 'main', frames: 4, w: 280, h: 200, paint: unityCircle(false) },
    { id: 'act', frames: 8, w: 280, h: 200, paint: unityCircle(true) },
    { ...BUBBLE, paint: saying('Together!') },
    SPARKLE,
  ],
  'dove-release': [
    { id: 'main', frames: 4, w: 200, h: 250, paint: doveRelease(false) },
    { id: 'act', frames: 8, w: 200, h: 250, paint: doveRelease(true) },
    { ...BUBBLE, paint: saying('Peace!') },
    SPARKLE,
  ],
  // A bare sapling, to a leafy young tree in flower.
  'tree-planters': [
    { id: 'main', frames: 8, w: 260, h: 240, paint: treePlanters },
    { ...BUBBLE, paint: saying('A day of service!') },
    SPARKLE,
  ],
  // Asleep down the hole, to up and looking about.
  groundhog: [
    { id: 'main', frames: 6, w: 220, h: 200, paint: groundhog('rise') },
    { id: 'shadow', frames: 4, w: 220, h: 200, paint: groundhog('shadow') },
    { id: 'spring', frames: 4, w: 220, h: 200, paint: groundhog('spring') },
    { ...BUBBLE, paint: saying('Six more weeks of winter!') },
    { id: 'early', frames: 1, w: 360, h: 140, paint: saying('Early spring!') },
    SPARKLE,
  ],
  serenade: [
    { id: 'main', frames: 4, w: 200, h: 230, paint: serenade(false) },
    { id: 'act', frames: 8, w: 200, h: 230, paint: serenade(true) },
    { id: 'note', frames: 2, w: 64, h: 64, paint: (ctx, f) => heartNote(ctx, f) },
    { ...BUBBLE, paint: saying('Be my Valentine!') },
    SPARKLE,
  ],
  // Its four sayings.
  'candy-heart': [
    { id: 'main', frames: 4, w: 200, h: 190, paint: (ctx, f) => candyHeart(ctx, f) },
    SPARKLE,
  ],
  'waltzing-couple': [
    { id: 'main', frames: 4, w: 220, h: 250, paint: waltz(false) },
    { id: 'act', frames: 8, w: 220, h: 250, paint: waltz(true) },
    { ...BUBBLE, paint: saying('Shall we dance?') },
    SPARKLE,
  ],
  'pebble-penguins': [
    { id: 'main', frames: 4, w: 230, h: 190, paint: pebblePenguins(false) },
    { id: 'act', frames: 8, w: 230, h: 190, paint: pebblePenguins(true) },
    { ...BUBBLE, paint: saying('Will you be mine?') },
    SPARKLE,
  ],
  'heart-balloon': [
    { id: 'main', frames: 8, w: 180, h: 256, paint: heartBalloonKid(false) },
    { id: 'wave', frames: 8, w: 180, h: 256, paint: heartBalloonKid(true) },
    SPARKLE,
  ],
  // Looking left, ahead, right, and a stony smile.
  rushmore: [
    { id: 'main', frames: 4, w: 340, h: 220, paint: (ctx, f) => rushmore(ctx, f) },
    SPARKLE,
  ],
  'liberty-bell': [
    { id: 'main', frames: 4, w: 220, h: 260, paint: libertyBell(false) },
    { id: 'act', frames: 8, w: 220, h: 260, paint: libertyBell(true) },
    { ...BUBBLE, paint: saying('Proclaim liberty!') },
    SPARKLE,
  ],
  'cherry-tree': [
    { id: 'main', frames: 4, w: 250, h: 250, paint: cherryTree(false) },
    { id: 'act', frames: 8, w: 250, h: 250, paint: cherryTree(true) },
    { ...BUBBLE, paint: saying('I cannot tell a lie!') },
    SPARKLE,
  ],
  'fife-and-drum': [
    { id: 'main', frames: 8, w: 240, h: 250, paint: fifeAndDrum(false) },
    { id: 'wave', frames: 8, w: 240, h: 250, paint: fifeAndDrum(true) },
    SPARKLE,
  ],
  'bead-balcony': [
    { id: 'main', frames: 4, w: 220, h: 236, paint: beadBalcony(false) },
    { id: 'act', frames: 8, w: 220, h: 236, paint: beadBalcony(true) },
    { ...BUBBLE, paint: saying('Happy Mardi Gras!') },
    SPARKLE,
  ],
  'brass-band': [
    { id: 'main', frames: 8, w: 260, h: 250, paint: brassBand(false) },
    { id: 'wave', frames: 8, w: 260, h: 250, paint: brassBand(true) },
    SPARKLE,
  ],
  jester: [
    { id: 'main', frames: 6, w: 180, h: 260, paint: jester(false) },
    { id: 'act', frames: 8, w: 180, h: 260, paint: jester(true) },
    SPARKLE,
  ],
  'king-cake': [
    { id: 'main', frames: 1, w: 220, h: 160, paint: kingCake(false) },
    { id: 'act', frames: 8, w: 220, h: 160, paint: kingCake(true) },
    { ...BUBBLE, paint: saying('You found the baby!') },
    SPARKLE,
  ],
  // Looking left, ahead, right, and a wink.
  'carnival-mask': [
    { id: 'main', frames: 4, w: 260, h: 190, paint: carnivalMask },
    SPARKLE,
  ],
  crawfish: [
    { id: 'main', frames: 8, w: 220, h: 140, paint: crawfish(false) },
    { id: 'wave', frames: 8, w: 220, h: 140, paint: crawfish(true) },
    SPARKLE,
  ],
}

