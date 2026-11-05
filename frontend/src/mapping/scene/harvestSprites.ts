/**
 * Thanksgiving, autumn and a little more Halloween: a pie cooling on the sill, Dad carving the turkey, the family
 * saying what they're thankful for, a child leaping into the leaf pile, apples dropping into a basket, a hayride,
 * a cider press, a prize pumpkin that grows, a turkey in disguise, the candy chute, trunk-or-treat, a costume
 * parade, the family watching the parade from the curb and a kite that flies on the real wind.
 *
 * Painted the same way as sprites.ts: facing right, one frame at a time, into a cell of w by h design units.
 */

import { arm, dot, head, person, rr, seated, standing, type Dress } from './figures'
import {
  circle, ellipse, rgba, saying, shade, SPARKLE, TAU, wheel,
  type Ctx, type SpriteColors, type SpriteRow,
} from './sprites'

const PEACH = '#f5c9a0'
const TAN = '#c68a5a'
const BROWN = '#8d5a3b'
const LEAVES = ['#f97316', '#facc15', '#ef4444', '#fb923c', '#eab308']

/** An autumn leaf at (x, y): pointed oval, a stem and its middle vein. */
function leaf(ctx: Ctx, x: number, y: number, r: number, a: number, c: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(a)
  ctx.fillStyle = c
  ctx.beginPath()
  ctx.moveTo(-r, 0)
  ctx.quadraticCurveTo(0, -r * 0.75, r, 0)
  ctx.quadraticCurveTo(0, r * 0.75, -r, 0)
  ctx.fill()
  ctx.strokeStyle = shade(c, -0.25)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(-r - 3, 0)
  ctx.lineTo(r * 0.8, 0)
  ctx.stroke()
  ctx.restore()
}

function pie(ctx: Ctx, x: number, y: number, r: number, slice = 0) {
  ctx.fillStyle = '#e2e8f0'
  ellipse(ctx, x, y + 2, r + 4, (r + 4) * 0.3)
  ctx.fill()
  ctx.fillStyle = '#d97706'
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * 0.3, 0, slice, TAU)
  ctx.lineTo(x, y)
  ctx.fill()
  ctx.fillStyle = '#ea580c'
  ctx.beginPath()
  ctx.ellipse(x, y, r * 0.8, r * 0.22, 0, slice, TAU)
  ctx.lineTo(x, y)
  ctx.fill()
  ctx.strokeStyle = '#fbbf24'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * 0.3, 0, slice, TAU)
  ctx.stroke()
}

function steam(ctx: Ctx, x: number, y: number, p: number, n = 3) {
  ctx.strokeStyle = rgba('#f8fafc', 0.55)
  ctx.lineWidth = 2.5
  for (let k = 0; k < n; k++) {
    const q = (p + k / n) % 1
    ctx.globalAlpha = 1 - q
    ctx.beginPath()
    ctx.moveTo(x + (k - 1) * 10, y - q * 30)
    ctx.quadraticCurveTo(x + (k - 1) * 10 + 6, y - 10 - q * 30, x + (k - 1) * 10, y - 20 - q * 30)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

// -- a pie cooling on the windowsill ---------------------------------------------------------------------------

function pieThief(sneaking: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 232
    // The window and its sill.
    ctx.fillStyle = rgba('#fde68a', 0.35)
    rr(ctx, 40, 20, 150, 130, 4)
    ctx.strokeStyle = color2
    ctx.lineWidth = 8
    ctx.strokeRect(40, 20, 150, 130)
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(115, 20)
    ctx.lineTo(115, 150)
    ctx.moveTo(40, 85)
    ctx.lineTo(190, 85)
    ctx.stroke()
    // Gingham curtains.
    for (const side of [-1, 1]) {
      ctx.fillStyle = rgba(color, 0.85)
      ctx.beginPath()
      const cx = side < 0 ? 44 : 186
      ctx.moveTo(cx, 24)
      ctx.lineTo(cx + side * -30, 24)
      ctx.quadraticCurveTo(cx + side * -10, 70, cx, 110)
      ctx.fill()
    }
    ctx.fillStyle = '#e7d3b0'
    rr(ctx, 28, 148, 174, 12, 3)
    // The pie, steaming; for people, a slice goes missing.
    const taken = sneaking && p > 0.45
    pie(ctx, 115, 140, 34, taken ? 0.9 : 0)
    steam(ctx, 115, 126, p)
    // The child creeping up below the sill.
    const kid: Dress = { skin: TAN, hair: '#1c1917', shirt: color, pants: '#cbd5e1' }
    if (!sneaking) {
      const peek = Math.max(0, Math.sin(p * TAU)) * 14
      head(ctx, 236, g - 70 - peek, 15, kid.skin, -1, { open: 0.2 })
      ctx.fillStyle = kid.hair
      ctx.beginPath()
      ctx.arc(236, g - 72 - peek, 16, Math.PI * 1.05, Math.PI * 1.95)
      ctx.fill()
      // Sniffing the air.
      for (let k = 0; k < 3; k++) {
        const q = (p * 2 + k / 3) % 1
        dot(ctx, 214 - q * 40, g - 78 - peek - q * 30, 2, rgba('#fde68a', 1 - q))
      }
      // Hiding behind a bush.
      for (const [bx, by, br] of [[214, g - 26, 26], [244, g - 34, 28], [266, g - 22, 20], [230, g - 52, 20]] as const) {
        ctx.fillStyle = by < g - 40 ? '#65a30d' : '#4d7c0f'
        circle(ctx, bx, by, br)
        ctx.fill()
      }
      return
    }
    // Reaching up, then off with the slice, crumbs on the chin.
    const reach = Math.min(1, p / 0.45)
    person(ctx, 230 - reach * 40 + (taken ? (p - 0.45) * 80 : 0), g, 0.9, -1, kid, { open: taken ? 0.6 : 0, stride: taken ? Math.sin(p * TAU * 4) * 0.6 : 0 }, () => {
      if (!taken) {
        arm(ctx, [-10, -98, -30, -110 - reach * 10, -44 - reach * 6, -120 - reach * 16], 8, kid.shirt)
        arm(ctx, [10, -98, 14, -78, 10, -62], 8, kid.shirt)
      } else {
        arm(ctx, [-10, -98, -20, -108, -16, -120], 8, kid.shirt)
        ctx.fillStyle = '#ea580c'
        ctx.beginPath()
        ctx.moveTo(-26, -122)
        ctx.lineTo(-6, -128)
        ctx.lineTo(-10, -116)
        ctx.fill()
        ctx.fillStyle = '#fbbf24'
        ctx.fillRect(-26, -124, 6, 4)
        arm(ctx, [10, -98, 14, -78, 10, -62], 8, kid.shirt)
      }
    })
  }
}

// -- Dad carving the turkey ---------------------------------------------------------------------------------------

function turkeyCarver(carving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 242
    const top = g - 70
    const dad: Dress = { skin: PEACH, hair: '#78350f', shirt: color2, pants: '#94a3b8' }
    standing(ctx, 70, g, 1, dad, { open: carving ? 0.6 : 0 })
    // His apron.
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(62, g - 96)
    ctx.lineTo(80, g - 96)
    ctx.lineTo(88, g - 44)
    ctx.lineTo(56, g - 44)
    ctx.fill()
    // The table and the roast turkey on its platter.
    ctx.fillStyle = '#f8fafc'
    rr(ctx, 90, top, 150, 12, 3)
    ctx.fillStyle = color
    ctx.fillRect(90, top + 8, 150, 4)
    ctx.fillStyle = '#d6c29a'
    ctx.fillRect(100, top + 12, 6, g - top - 12)
    ctx.fillRect(226, top + 12, 6, g - top - 12)
    ctx.fillStyle = '#e2e8f0'
    ellipse(ctx, 170, top - 2, 52, 9)
    ctx.fill()
    const bird = ctx.createRadialGradient(160, top - 34, 4, 170, top - 22, 46)
    bird.addColorStop(0, '#fcd34d')
    bird.addColorStop(1, '#b45309')
    ctx.fillStyle = bird
    ctx.beginPath()
    ctx.ellipse(170, top - 22, 40, 24, 0, Math.PI, TAU)
    ctx.quadraticCurveTo(210, top - 2, 170, top - 4)
    ctx.quadraticCurveTo(130, top - 2, 130, top - 22)
    ctx.fill()
    // Drumsticks with paper frills.
    for (const side of [-1, 1]) {
      const missing = carving && side > 0 && p > 0.6
      if (missing) continue
      ctx.fillStyle = '#c2410c'
      ellipse(ctx, 170 + side * 34, top - 12, 12, 8, side * 0.5)
      ctx.fill()
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(170 + side * 46 - 3, top - 22, 6, 8)
    }
    steam(ctx, 170, top - 48, p)
    // Knife and fork: resting, or carving slices.
    if (carving) {
      const saw = Math.sin(p * TAU * 4) * 6
      arm(ctx, [80, g - 98, 100, g - 92, 122 + saw, top - 30], 9, dad.shirt)
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(122 + saw, top - 30)
      ctx.lineTo(140 + saw, top - 14)
      ctx.stroke()
      arm(ctx, [62, g - 98, 92, g - 112, 128, top - 46], 9, shade(dad.shirt, -0.08))
      ctx.beginPath()
      ctx.moveTo(128, top - 46)
      ctx.lineTo(146, top - 32)
      ctx.stroke()
      // Slices falling onto the platter, then the drumstick held up.
      for (let k = 0; k < Math.floor(p * 6); k++) {
        ctx.fillStyle = '#fef3c7'
        ellipse(ctx, 132 + k * 6, top - 4, 7, 3, 0.3)
        ctx.fill()
      }
      if (p > 0.6) {
        ctx.fillStyle = '#c2410c'
        ellipse(ctx, 150, top - 66, 12, 8, -0.8)
        ctx.fill()
      }
    } else {
      arm(ctx, [80, g - 98, 96, g - 82, 110, g - 76], 9, dad.shirt)
      arm(ctx, [60, g - 98, 54, g - 78, 58, g - 62], 9, shade(dad.shirt, -0.08))
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(110, g - 76)
      ctx.lineTo(126, g - 92)
      ctx.stroke()
    }
  }
}

// -- what we're thankful for ----------------------------------------------------------------------------------------

function thanksTable(raising: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 222
    const top = g - 66
    const people: Array<[number, number, Dress, number]> = [
      [40, 1, { skin: BROWN, hair: '#d6d3d1', shirt: '#e2e8f0', pants: '#94a3b8' }, 0.85],
      [104, 1, { skin: TAN, hair: '#1c1917', shirt: color2, pants: '#94a3b8' }, 0.75],
      [196, -1, { skin: PEACH, hair: '#ca8a04', shirt: '#f9a8d4', pants: '#cbd5e1' }, 0.7],
      [260, -1, { skin: BROWN, hair: '#3f2a1c', shirt: color, pants: '#94a3b8' }, 0.85],
    ]
    for (const [x, dir, d, s] of people) seated(ctx, x, g, 52, s, dir, d, raising ? 0.6 : 0)
    // Holding hands for grace, or glasses raised in a toast.
    for (const [x, dir, d, s] of people) {
      const sy = g - 52 - 44 * s
      if (raising) {
        const up = Math.min(1, p / 0.3) * 22 + Math.sin(p * TAU * 2 + x) * 2
        arm(ctx, [x + dir * 8, sy, x + dir * 20, sy - 6, x + dir * 24, sy - 16 - up], 7, d.shirt)
        ctx.fillStyle = rgba('#fef3c7', 0.85)
        rr(ctx, x + dir * 24 - 4, sy - 32 - up, 8, 14, 2)
      } else {
        arm(ctx, [x + dir * 8, sy, x + dir * 22, sy + 16, x + dir * 34, top - 6], 7, d.shirt)
      }
    }
    // The table: turkey, corn, pumpkin pie and a candle.
    ctx.fillStyle = '#f8fafc'
    rr(ctx, 20, top, 260, 12, 3)
    ctx.fillStyle = color
    ctx.fillRect(20, top + 8, 260, 4)
    ctx.fillStyle = shade('#f8fafc', -0.06)
    ctx.fillRect(26, top + 12, 248, 22)
    ctx.fillStyle = '#d6c29a'
    ctx.fillRect(36, top + 34, 6, g - top - 34)
    ctx.fillRect(258, top + 34, 6, g - top - 34)
    ctx.fillStyle = '#b45309'
    ctx.beginPath()
    ctx.ellipse(150, top - 12, 26, 15, 0, Math.PI, TAU)
    ctx.fill()
    pie(ctx, 214, top - 4, 14)
    ctx.fillStyle = '#facc15'
    ellipse(ctx, 92, top - 5, 12, 5, 0.2)
    ctx.fill()
    ctx.fillStyle = '#fef3c7'
    rr(ctx, 120, top - 26, 6, 26, 2)
    ctx.fillStyle = rgba('#fbbf24', 0.8)
    ellipse(ctx, 123, top - 31 - Math.sin(p * TAU * 3), 3, 5)
    ctx.fill()
    if (raising) {
      for (let k = 0; k < 4; k++) {
        const q = (p * 1.5 + k / 4) % 1
        ctx.fillStyle = rgba(['#fde68a', '#f9a8d4', '#fdba74', '#bef264'][k], 1 - q)
        ctx.font = 'bold 16px sans-serif'
        ctx.fillText('♥', 60 + k * 54, top - 60 - q * 40)
      }
    }
  }
}

// -- jumping in the leaf pile -----------------------------------------------------------------------------------

function leafJumper(jumping: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 222
    const kid: Dress = { skin: PEACH, hair: '#b45309', shirt: color, pants: '#cbd5e1' }
    // The pile, a mound of leaves.
    const pileLeaves = (n: number) => {
      for (let k = 0; k < n; k++) {
        const a = (k * 2.4) % Math.PI
        const r = 50 * Math.sqrt(((k * 37) % 100) / 100)
        leaf(ctx, 180 + Math.cos(a) * r * 1.3, g - 6 - Math.sin(a) * r * 0.7, 9, k, LEAVES[k % 5])
      }
    }
    if (!jumping) {
      pileLeaves(46)
      // Raking more leaves onto the pile.
      const rake = Math.sin(p * TAU) * 12
      person(ctx, 70, g, 0.95, 1, kid, {}, () => {
        // Knit hat.
        ctx.fillStyle = color2
        ctx.beginPath()
        ctx.arc(2, -122, 17, Math.PI, TAU)
        ctx.fill()
        dot(ctx, 2, -142, 5, '#f8fafc')
        arm(ctx, [10, -98, 24, -84, 40 + rake, -70], 8, kid.shirt)
        arm(ctx, [-10, -98, 4, -76, 22 + rake, -60], 8, shade(kid.shirt, -0.1))
        ctx.strokeStyle = '#d6c29a'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(10 + rake, -94)
        ctx.lineTo(70 + rake, 0)
        ctx.stroke()
        ctx.strokeStyle = '#94a3b8'
        ctx.lineWidth = 2
        for (let t = -3; t <= 3; t++) {
          ctx.beginPath()
          ctx.moveTo(70 + rake, 0)
          ctx.lineTo(70 + rake + t * 5, 6)
          ctx.stroke()
        }
      })
      for (let k = 0; k < 4; k++) leaf(ctx, 130 + rake + k * 8, g - 6, 7, k + p * 3, LEAVES[(k + 2) % 5])
      return
    }
    // Run, leap, land in the middle and burst out laughing, leaves flying everywhere.
    if (p < 0.35) {
      pileLeaves(46)
      const q = p / 0.35
      const x = 60 + q * 120
      const y = g - Math.sin(q * Math.PI) * 70
      person(ctx, x, y, 0.95, 1, kid, { stride: q < 0.4 ? Math.sin(q * 30) * 0.8 : 0.9, open: 0.8 }, () => {
        ctx.fillStyle = color2
        ctx.beginPath()
        ctx.arc(2, -122, 17, Math.PI, TAU)
        ctx.fill()
        arm(ctx, [10, -98, 24, -120, 30, -142], 8, kid.shirt)
        arm(ctx, [-10, -98, -24, -120, -30, -142], 8, kid.shirt)
      })
      return
    }
    const q = (p - 0.35) / 0.65
    pileLeaves(30)
    head(ctx, 180, g - 40, 15, kid.skin, 1, { open: 0.9 })
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.arc(180, g - 44, 16, Math.PI, TAU)
    ctx.fill()
    arm(ctx, [170, g - 20, 156, g - 50, 150, g - 70], 8, kid.shirt)
    arm(ctx, [190, g - 20, 204, g - 50, 210, g - 70], 8, kid.shirt)
    for (let k = 0; k < 18; k++) {
      const a = -Math.PI * (0.1 + 0.8 * ((k * 0.618) % 1))
      const v = 60 + (k % 5) * 18
      const x = 180 + Math.cos(a) * v * q * 1.6
      const y = g - 30 + Math.sin(a) * v * q * 1.8 + q * q * 90
      leaf(ctx, x, Math.min(g - 4, y), 8, k + q * 6, LEAVES[k % 5])
    }
  }
}

// -- apple picking -----------------------------------------------------------------------------------------------

function applePicker(picking: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 252
    // The tree.
    ctx.fillStyle = '#a16207'
    ctx.beginPath()
    ctx.moveTo(140, g)
    ctx.lineTo(150, g - 120)
    ctx.lineTo(166, g - 120)
    ctx.lineTo(172, g)
    ctx.fill()
    for (const [cx, cy, r] of [[158, g - 170, 64], [110, g - 140, 44], [206, g - 144, 46], [150, g - 210, 40]] as const) {
      ctx.fillStyle = cy < g - 160 ? '#4d7c0f' : '#65a30d'
      circle(ctx, cx, cy, r)
      ctx.fill()
    }
    const apples: Array<[number, number]> = [[120, g - 150], [180, g - 190], [206, g - 130], [140, g - 200], [96, g - 128], [176, g - 150], [226, g - 160]]
    const dropped = picking ? Math.floor(p * 4) : 0
    apples.forEach(([ax, ay], k) => {
      if (k < dropped) return
      dot(ctx, ax, ay, 7, color)
      dot(ctx, ax - 2, ay - 2, 2, rgba('#fff', 0.6))
    })
    // The bushel basket filling up.
    ctx.fillStyle = '#d6c29a'
    ctx.beginPath()
    ctx.moveTo(40, g - 40)
    ctx.lineTo(90, g - 40)
    ctx.lineTo(84, g)
    ctx.lineTo(46, g)
    ctx.fill()
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = 2
    for (let y = g - 30; y < g; y += 10) {
      ctx.beginPath()
      ctx.moveTo(42, y)
      ctx.lineTo(88, y)
      ctx.stroke()
    }
    for (let k = 0; k < 4 + dropped; k++) dot(ctx, 52 + (k % 4) * 9, g - 42 - Math.floor(k / 4) * 8, 6, color)
    // An apple falling.
    if (picking) {
      const q = (p * 4) % 1
      const [ax, ay] = apples[Math.min(apples.length - 1, dropped)]
      const x = ax + (66 - ax) * q
      const y = ay + (g - 50 - ay) * q - Math.sin(q * Math.PI) * 30
      dot(ctx, x, y, 7, color)
    }
    // A child holding the basket out, cheering as apples land.
    const kid: Dress = { skin: BROWN, hair: '#1c1917', shirt: color2, pants: '#cbd5e1' }
    person(ctx, 30, g, 0.8, 1, kid, { open: picking ? 0.7 : 0 }, () => {
      if (picking) {
        arm(ctx, [10, -98, 24, -118, 28, -138], 8, kid.shirt)
        arm(ctx, [-10, -98, -22, -118, -26, -138], 8, kid.shirt)
      } else {
        arm(ctx, [10, -98, 30, -84, 40, -66], 8, kid.shirt)
        arm(ctx, [-10, -98, -4, -80, 6, -66], 8, kid.shirt)
      }
    })
    // Leaves falling.
    for (let k = 0; k < 3; k++) {
      const q = (p + k / 3) % 1
      leaf(ctx, 100 + k * 50 + Math.sin(q * 6) * 10, g - 180 + q * 170, 6, q * 6, LEAVES[k])
    }
  }
}

// -- the hayride -------------------------------------------------------------------------------------------------

function hayride(waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 192
    const bump = Math.abs(Math.sin(p * TAU * 2)) * 2
    // The horse pulling: body, a short arched neck, the head nodding down, mane and tail.
    const hx = 250
    const nod = Math.sin(p * TAU * 2) * 0.08
    ctx.fillStyle = '#92400e'
    ellipse(ctx, hx, g - 56 - bump, 34, 15)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(hx + 18, g - 64 - bump)
    ctx.quadraticCurveTo(hx + 30, g - 92 - bump, hx + 42, g - 90 - bump)
    ctx.lineTo(hx + 46, g - 76 - bump)
    ctx.quadraticCurveTo(hx + 36, g - 66 - bump, hx + 32, g - 50 - bump)
    ctx.fill()
    ctx.save()
    ctx.translate(hx + 44, g - 86 - bump)
    ctx.rotate(0.95 + nod)
    ellipse(ctx, 10, 0, 16, 7.5)
    ctx.fill()
    ctx.restore()
    ctx.beginPath()
    ctx.moveTo(hx + 38, g - 90 - bump)
    ctx.lineTo(hx + 40, g - 102 - bump)
    ctx.lineTo(hx + 44, g - 90 - bump)
    ctx.fill()
    dot(ctx, hx + 46, g - 82 - bump, 1.8, '#111')
    ctx.fillStyle = '#451a03'
    ctx.beginPath()
    ctx.moveTo(hx + 20, g - 66 - bump)
    ctx.quadraticCurveTo(hx + 26, g - 92 - bump, hx + 40, g - 94 - bump)
    ctx.quadraticCurveTo(hx + 30, g - 84 - bump, hx + 26, g - 62 - bump)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(hx - 32, g - 62 - bump)
    ctx.quadraticCurveTo(hx - 46, g - 50 - bump, hx - 42, g - 30 - bump + Math.sin(p * TAU * 2) * 3)
    ctx.lineTo(hx - 36, g - 54 - bump)
    ctx.fill()
    const s = Math.sin(p * TAU * 2)
    ctx.strokeStyle = '#92400e'
    ctx.lineWidth = 6
    for (const [lx, k] of [[hx - 20, s], [hx - 12, -s], [hx + 16, -s], [hx + 24, s]] as const) {
      ctx.beginPath()
      ctx.moveTo(lx, g - 44 - bump)
      ctx.lineTo(lx + k * 8, g - 4)
      ctx.stroke()
    }
    ctx.strokeStyle = '#78350f'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(hx - 26, g - 52 - bump)
    ctx.lineTo(200, g - 44)
    ctx.stroke()
    // Kids and Grandpa sitting on the hay bales.
    const riders: Array<[number, Dress, number]> = [
      [60, { skin: PEACH, hair: '#ca8a04', shirt: color, pants: '#cbd5e1' }, 0.7],
      [104, { skin: BROWN, hair: '#1c1917', shirt: color2, pants: '#cbd5e1' }, 0.66],
      [148, { skin: TAN, hair: '#3f2a1c', shirt: '#f9a8d4', pants: '#cbd5e1' }, 0.7],
    ]
    riders.forEach(([rx, d, sc], j) => {
      const y = g - 36 - bump
      seated(ctx, rx, y, 22, sc, 1, d, waving ? 0.7 : 0)
      const sy = y - 22 - 44 * sc
      if (waving) arm(ctx, [rx + 6, sy, rx + 16, sy - 18, rx + 14 + Math.sin(p * TAU * 3 + j) * 8, sy - 36], 7, d.shirt)
    })
    // The wagon and its bales.
    ctx.fillStyle = '#fde68a'
    for (let k = 0; k < 4; k++) rr(ctx, 30 + k * 42, g - 52 - bump, 40, 18, 3)
    ctx.strokeStyle = '#eab308'
    ctx.lineWidth = 1.5
    for (let k = 0; k < 12; k++) {
      ctx.beginPath()
      ctx.moveTo(34 + k * 14, g - 50 - bump)
      ctx.lineTo(38 + k * 14, g - 36 - bump)
      ctx.stroke()
    }
    ctx.fillStyle = '#b91c1c'
    rr(ctx, 24, g - 36 - bump, 180, 14, 2)
    wheel(ctx, 56, g - 14, 14, p * TAU * 2, '#e7d3b0')
    wheel(ctx, 176, g - 14, 14, p * TAU * 2, '#e7d3b0')
    // Hay blowing off the back.
    for (let k = 0; k < 4; k++) {
      const q = (p * 2 + k / 4) % 1
      ctx.strokeStyle = rgba('#fde68a', 1 - q)
      ctx.beginPath()
      ctx.moveTo(24 - q * 30, g - 44 + q * 30)
      ctx.lineTo(16 - q * 30, g - 42 + q * 30)
      ctx.stroke()
    }
  }
}

// -- the cider press -------------------------------------------------------------------------------------------

function ciderPress(pouring: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 242
    // The press: frame, screw, crank wheel and the slatted tub.
    ctx.fillStyle = '#a16207'
    ctx.fillRect(84, g - 170, 10, 170)
    ctx.fillRect(176, g - 170, 10, 170)
    ctx.fillRect(80, g - 176, 110, 14)
    ctx.fillStyle = '#94a3b8'
    const down = (Math.sin(p * TAU) + 1) * 6
    ctx.fillRect(132, g - 162, 6, 50 + down)
    ctx.strokeStyle = '#64748b'
    ctx.lineWidth = 3
    const turn = p * TAU * 2
    ctx.beginPath()
    ctx.moveTo(135 + Math.cos(turn) * 34, g - 168 + Math.sin(turn) * 4)
    ctx.lineTo(135 - Math.cos(turn) * 34, g - 168 - Math.sin(turn) * 4)
    ctx.stroke()
    dot(ctx, 135 + Math.cos(turn) * 34, g - 168 + Math.sin(turn) * 4, 5, '#d6c29a')
    ctx.fillStyle = '#d6c29a'
    rr(ctx, 106, g - 114 + down, 58, 10, 2)
    ctx.fillStyle = '#d97706'
    rr(ctx, 104, g - 102, 62, 50, 4)
    ctx.strokeStyle = '#78350f'
    ctx.lineWidth = 2
    for (let x = 112; x < 164; x += 10) {
      ctx.beginPath()
      ctx.moveTo(x, g - 100)
      ctx.lineTo(x, g - 54)
      ctx.stroke()
    }
    // Apples heaped in the tub.
    for (let k = 0; k < 5; k++) dot(ctx, 112 + k * 11, g - 104 + down * 0.5, 6, k % 2 ? color : '#a3e635')
    // The spout and the cider running into the jug.
    ctx.fillStyle = '#94a3b8'
    ctx.fillRect(160, g - 52, 20, 6)
    ctx.fillStyle = rgba('#fbbf24', 0.85)
    ctx.fillRect(176, g - 46, 4, 26 + Math.sin(p * TAU * 6))
    ctx.fillStyle = rgba('#f8fafc', 0.6)
    rr(ctx, 166, g - 22, 26, 22, 6)
    const fill = pouring ? 0.4 + 0.5 * p : 0.6
    ctx.fillStyle = rgba('#d97706', 0.9)
    ctx.fillRect(168, g - 2 - 18 * fill, 22, 18 * fill)
    // The farmer cranking, or pouring cups for people.
    const farmer: Dress = { skin: PEACH, hair: '#78716c', shirt: '#f8fafc', pants: color2 }
    standing(ctx, 46, g, 1, farmer, { open: pouring ? 0.5 : 0 })
    ctx.fillStyle = color2
    ctx.fillRect(38, g - 104, 6, 50)
    ctx.fillRect(56, g - 104, 6, 50)
    ctx.fillStyle = '#fde68a'
    ctx.beginPath()
    ctx.ellipse(48, g - 132, 26, 6, 0, 0, TAU)
    ctx.fill()
    rr(ctx, 36, g - 150, 24, 18, 6)
    if (pouring) {
      arm(ctx, [56, g - 98, 70, g - 108, 80, g - 124], 9, '#f8fafc')
      ctx.fillStyle = rgba('#f8fafc', 0.8)
      rr(ctx, 76, g - 142, 12, 16, 2)
      ctx.fillStyle = '#d97706'
      ctx.fillRect(77, g - 136, 10, 9)
      steam(ctx, 82, g - 146, p, 2)
      arm(ctx, [36, g - 98, 30, g - 78, 34, g - 62], 9, '#f8fafc')
    } else {
      arm(ctx, [56, g - 98, 80, g - 140, 135 + Math.cos(turn) * 34, g - 168 + Math.sin(turn) * 4], 9, '#f8fafc')
      arm(ctx, [36, g - 98, 30, g - 78, 34, g - 62], 9, '#f8fafc')
    }
  }
}

// -- the prize pumpkin ---------------------------------------------------------------------------------------------

/** Level: a pumpkin swelling bigger and bigger as people come, the vine curling and a blue ribbon at the end. */
function giantPumpkin(ctx: Ctx, f: number, n: number, { color, color2 }: SpriteColors) {
  const k = f / (n - 1)
  const g = 252
  const r = 24 + k * 96
  const cx = 150
  const cy = g - r * 0.8
  ctx.fillStyle = rgba('#000', 0.25)
  ellipse(ctx, cx, g, r * 1.15, 8)
  ctx.fill()
  // The ribs.
  for (let s = -2; s <= 2; s++) {
    ctx.fillStyle = s % 2 ? shade(color, -0.12) : color
    ellipse(ctx, cx + s * r * 0.36, cy, r * 0.5, r * 0.8)
    ctx.fill()
  }
  ctx.fillStyle = shade(color, 0.12)
  ellipse(ctx, cx, cy, r * 0.42, r * 0.78)
  ctx.fill()
  ctx.fillStyle = '#65a30d'
  rr(ctx, cx - 5, cy - r * 0.8 - 14, 10, 18, 3)
  ctx.strokeStyle = '#4d7c0f'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx + 4, cy - r * 0.8 - 6)
  for (let t = 0; t < 1; t += 0.05) ctx.lineTo(cx + 10 + t * 50, cy - r * 0.8 - 10 + Math.sin(t * 14) * 8 * (0.5 + k))
  ctx.stroke()
  ctx.fillStyle = '#65a30d'
  ellipse(ctx, cx + 40, cy - r * 0.8 - 6, 12, 8, 0.4)
  ctx.fill()
  // The prize: the scale's dial creeping round, then the ribbon.
  ctx.fillStyle = '#e2e8f0'
  circle(ctx, 40, g - 40, 22)
  ctx.fill()
  ctx.strokeStyle = '#ef4444'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(40, g - 40)
  ctx.lineTo(40 + Math.cos(-Math.PI / 2 + k * TAU * 0.9) * 16, g - 40 + Math.sin(-Math.PI / 2 + k * TAU * 0.9) * 16)
  ctx.stroke()
  ctx.fillStyle = '#94a3b8'
  ctx.fillRect(36, g - 18, 8, 18)
  if (k > 0.95) {
    const rx = cx + r * 0.75
    const ry = cy - r * 0.3
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(rx - 8, ry)
    ctx.lineTo(rx - 14, ry + 34)
    ctx.lineTo(rx - 4, ry + 28)
    ctx.lineTo(rx, ry + 36)
    ctx.lineTo(rx + 6, ry)
    ctx.fill()
    for (let s = 0; s < 10; s++) {
      const a = (s / 10) * TAU
      ctx.beginPath()
      ctx.arc(rx + Math.cos(a) * 12, ry - 6 + Math.sin(a) * 12, 6, 0, TAU)
      ctx.fill()
    }
    dot(ctx, rx, ry - 6, 11, '#fde68a')
    ctx.fillStyle = color2
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText('1st', rx - 9, ry - 2)
  }
}

// -- a turkey in disguise -------------------------------------------------------------------------------------

/** The disguises, one after another: Santa, a cow, a pirate, a cat. */
const DISGUISES = 4

function turkeyBody(ctx: Ctx, x: number, g: number, color: string, wobble: number) {
  // Tail fan.
  for (let k = 0; k < 7; k++) {
    const a = Math.PI * (1.15 + k * 0.12)
    ctx.fillStyle = ['#b45309', '#f59e0b', '#dc2626', '#92400e'][k % 4]
    ellipse(ctx, x - 6 + Math.cos(a) * 36, g - 70 + Math.sin(a) * 36, 11, 26, a + Math.PI / 2)
    ctx.fill()
  }
  ctx.fillStyle = color
  ellipse(ctx, x, g - 52, 28, 30)
  ctx.fill()
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 4
  for (const lx of [x - 8, x + 8]) {
    ctx.beginPath()
    ctx.moveTo(lx, g - 24)
    ctx.lineTo(lx, g - 2)
    ctx.lineTo(lx + 8, g)
    ctx.stroke()
  }
  ctx.fillStyle = shade(color, 0.1)
  ctx.beginPath()
  ctx.arc(x + 20, g - 92 + wobble, 14, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#f59e0b'
  ctx.beginPath()
  ctx.moveTo(x + 32, g - 94 + wobble)
  ctx.lineTo(x + 44, g - 90 + wobble)
  ctx.lineTo(x + 32, g - 86 + wobble)
  ctx.fill()
  ctx.fillStyle = '#dc2626'
  ellipse(ctx, x + 32, g - 80 + wobble, 3, 8)
  ctx.fill()
  dot(ctx, x + 24, g - 96 + wobble, 3, '#f8fafc')
  dot(ctx, x + 25, g - 96 + wobble, 1.6, '#111')
}

function turkeyDisguise(ctx: Ctx, f: number, _frames: number, { color, color2 }: SpriteColors) {
  const which = Math.floor(f / 2) % DISGUISES
  const g = 232
  const x = 130
  const wobble = f % 2 ? -2 : 0
  turkeyBody(ctx, x, g, color, wobble)
  const hx = x + 20
  const hy = g - 92 + wobble
  if (which === 0) {
    // Santa: hat and a cotton-wool beard.
    ctx.fillStyle = '#dc2626'
    ctx.beginPath()
    ctx.moveTo(hx - 14, hy - 8)
    ctx.lineTo(hx + 14, hy - 8)
    ctx.lineTo(hx - 18, hy - 40)
    ctx.fill()
    dot(ctx, hx - 18, hy - 40, 5, '#f8fafc')
    ctx.fillStyle = '#f8fafc'
    rr(ctx, hx - 16, hy - 12, 32, 7, 3)
    for (let k = 0; k < 6; k++) dot(ctx, hx - 6 + (k % 3) * 9, hy + 10 + Math.floor(k / 3) * 9, 7, '#f8fafc')
  } else if (which === 1) {
    // A cow: spots stuck on and a pair of horns.
    for (const [sx, sy, r] of [[x - 10, g - 60, 9], [x + 10, g - 40, 7], [x - 4, g - 34, 5]] as const) dot(ctx, sx, sy, r, '#f8fafc')
    ctx.strokeStyle = '#f8fafc'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(hx - 8, hy - 10)
    ctx.quadraticCurveTo(hx - 14, hy - 24, hx - 6, hy - 26)
    ctx.moveTo(hx + 6, hy - 12)
    ctx.quadraticCurveTo(hx + 8, hy - 26, hx + 16, hy - 26)
    ctx.stroke()
  } else if (which === 2) {
    // A pirate: hat and an eye patch.
    ctx.fillStyle = '#e2e8f0'
    ctx.beginPath()
    ctx.moveTo(hx - 22, hy - 8)
    ctx.quadraticCurveTo(hx, hy - 36, hx + 22, hy - 8)
    ctx.fill()
    ctx.fillStyle = '#1f2937'
    dot(ctx, hx + 4, hy - 4, 5, '#1f2937')
    ctx.strokeStyle = '#1f2937'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(hx - 12, hy - 10)
    ctx.lineTo(hx + 12, hy + 2)
    ctx.stroke()
  } else {
    // A cat: ears and whiskers.
    ctx.fillStyle = color2
    for (const ex of [hx - 10, hx + 8]) {
      ctx.beginPath()
      ctx.moveTo(ex - 6, hy - 8)
      ctx.lineTo(ex, hy - 26)
      ctx.lineTo(ex + 6, hy - 8)
      ctx.fill()
    }
    ctx.strokeStyle = '#f8fafc'
    ctx.lineWidth = 1.2
    for (const wy of [-2, 2]) {
      ctx.beginPath()
      ctx.moveTo(hx + 26, hy + wy)
      ctx.lineTo(hx + 44, hy + wy * 3)
      ctx.stroke()
    }
  }
  // The sign stuck in the lawn beside him, which gives him away.
  ctx.fillStyle = '#d6c29a'
  ctx.fillRect(40, g - 34, 4, 34)
  ctx.fillStyle = '#f8fafc'
  rr(ctx, 2, g - 70, 84, 36, 4)
  ctx.fillStyle = color2
  ctx.font = 'bold 14px sans-serif'
  const words = ['I’m Santa!', 'Moo.', 'Arr!', 'Meow.'][which]
  ctx.fillText(words, 10, g - 47)
}

// -- the candy chute ---------------------------------------------------------------------------------------------

function candyChute(sliding: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 242
    // The porch railing with a skeleton hand ready at the top of the chute.
    ctx.fillStyle = '#d6c29a'
    ctx.fillRect(0, g - 104, 76, 104)
    ctx.fillStyle = shade('#d6c29a', -0.15)
    for (let y = g - 84; y < g; y += 20) ctx.fillRect(0, y, 76, 3)
    ctx.fillStyle = '#e2e8f0'
    ctx.fillRect(0, g - 150, 70, 8)
    for (let x = 6; x < 70; x += 14) ctx.fillRect(x, g - 142, 5, 38)
    // The chute: a long tube wrapped in orange and black tape.
    ctx.save()
    ctx.translate(60, g - 150)
    const len = 190
    const ang = 0.6
    ctx.rotate(ang)
    ctx.fillStyle = color
    rr(ctx, 0, -9, len, 18, 9)
    ctx.fillStyle = color2
    for (let s = 12; s < len - 10; s += 28) ctx.fillRect(s, -9, 10, 18)
    // Candy sliding down inside.
    if (sliding) {
      const q = (p * 2) % 1
      ctx.fillStyle = ['#f472b6', '#facc15', '#a78bfa'][Math.floor(p * 2) % 3]
      rr(ctx, q * (len - 20), -5, 16, 10, 3)
    }
    ctx.restore()
    // The skeleton hand dropping a candy in.
    const tip = sliding ? Math.sin(p * TAU * 2) * 6 : 0
    ctx.strokeStyle = '#f8fafc'
    ctx.lineWidth = 3
    for (let k = 0; k < 4; k++) {
      ctx.beginPath()
      ctx.moveTo(40 + k * 5, g - 170)
      ctx.lineTo(42 + k * 5, g - 160 + tip)
      ctx.stroke()
    }
    rr(ctx, 36, g - 182, 26, 12, 4)
    ctx.fillStyle = '#f8fafc'
    ctx.fill()
    // The end of the chute and a trick-or-treater holding out a bucket.
    const ex = 60 + Math.cos(0.6) * 190
    const ey = g - 150 + Math.sin(0.6) * 190
    const kid: Dress = { skin: TAN, hair: '#1c1917', shirt: '#a78bfa', pants: '#a78bfa' }
    person(ctx, ex + 50, g, 0.85, -1, kid, { open: sliding && (p * 2) % 1 > 0.85 ? 0.9 : 0.2 }, () => {
      // A wizard hat and a cape.
      ctx.fillStyle = '#6d28d9'
      ctx.beginPath()
      ctx.moveTo(-20, -130)
      ctx.lineTo(24, -130)
      ctx.lineTo(4, -176)
      ctx.fill()
      ctx.fillStyle = '#fde68a'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText('★', -2, -144)
      arm(ctx, [-10, -98, -30, -84, -48, -72], 8, kid.shirt)
      arm(ctx, [10, -98, 14, -78, 10, -62], 8, kid.shirt)
    })
    ctx.fillStyle = '#f97316'
    ctx.beginPath()
    ctx.arc(ex + 8, ey + 6, 14, 0, Math.PI)
    ctx.fill()
    ctx.fillRect(ex - 6, ey - 2, 28, 8)
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(ex + 2, ey + 6, 4, 3)
    ctx.fillRect(ex + 10, ey + 6, 4, 3)
    if (sliding && (p * 2) % 1 > 0.85) {
      for (let k = 0; k < 4; k++) dot(ctx, ex + 8 + Math.cos(k * 1.6) * 20, ey - 12 + Math.sin(k * 1.6) * 8, 3, '#fde68a')
    }
  }
}

// -- trunk-or-treat ------------------------------------------------------------------------------------------------

function trunkOrTreat(giving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 222
    // The back of the car, trunk up and decorated as a monster's mouth.
    ctx.fillStyle = '#cbd5e1'
    rr(ctx, 30, g - 110, 170, 80, 12)
    ctx.fillStyle = shade('#cbd5e1', -0.2)
    ctx.beginPath()
    ctx.moveTo(40, g - 110)
    ctx.lineTo(190, g - 110)
    ctx.lineTo(176, g - 178)
    ctx.lineTo(54, g - 178)
    ctx.fill()
    // Teeth along the open lid and the bottom, and two big eyes on top.
    ctx.fillStyle = '#f8fafc'
    for (let x = 48; x < 186; x += 18) {
      ctx.beginPath()
      ctx.moveTo(x, g - 110)
      ctx.lineTo(x + 9, g - 94)
      ctx.lineTo(x + 18, g - 110)
      ctx.fill()
    }
    const look = Math.sin(p * TAU) * 4
    for (const ex of [90, 140]) {
      dot(ctx, ex, g - 186, 14, '#f8fafc')
      dot(ctx, ex + look, g - 184, 6, '#111827')
    }
    // The tongue (a red blanket) with candy on it.
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(60, g - 60)
    ctx.quadraticCurveTo(115, g - 40, 170, g - 60)
    ctx.lineTo(160, g - 20)
    ctx.quadraticCurveTo(115, g, 70, g - 20)
    ctx.fill()
    for (let k = 0; k < 6; k++) dot(ctx, 84 + k * 12, g - 44 + (k % 2) * 6, 4, ['#facc15', '#f472b6', '#a3e635'][k % 3])
    ctx.fillStyle = '#334155'
    circle(ctx, 56, g - 22, 18)
    ctx.fill()
    circle(ctx, 176, g - 22, 18)
    ctx.fill()
    ctx.fillStyle = '#ef4444'
    rr(ctx, 30, g - 92, 12, 8, 2)
    rr(ctx, 188, g - 92, 12, 8, 2)
    // The grown-up in a witch hat handing candy to a little dinosaur.
    const mum: Dress = { skin: PEACH, hair: '#ca8a04', shirt: color2, pants: '#334155' }
    person(ctx, 232, g, 0.95, -1, mum, { skirt: true, open: giving ? 0.5 : 0 }, () => {
      ctx.fillStyle = '#4c1d95'
      ctx.beginPath()
      ctx.ellipse(-2, -132, 28, 6, 0, 0, TAU)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(-16, -134)
      ctx.lineTo(14, -134)
      ctx.lineTo(8, -176)
      ctx.lineTo(18, -184)
      ctx.fill()
      const reach = giving ? Math.min(1, p / 0.3) : 0
      arm(ctx, [-10, -98, -24 - reach * 10, -92, -36 - reach * 18, -86], 9, mum.shirt)
      dot(ctx, -38 - reach * 18, -86, 4, '#facc15')
      arm(ctx, [10, -98, 14, -78, 10, -62], 9, mum.shirt)
    })
    if (giving) {
      ctx.save()
      ctx.translate(138, g)
      // A green dinosaur costume, hopping.
      const hop = Math.abs(Math.sin(p * TAU * 2)) * 6
      ctx.translate(0, -hop)
      ctx.fillStyle = '#4ade80'
      rr(ctx, -14, -74, 28, 54, 10)
      ctx.fillRect(-10, -22, 8, 22)
      ctx.fillRect(4, -22, 8, 22)
      circle(ctx, 2, -86, 16)
      ctx.fill()
      ctx.fillStyle = '#facc15'
      for (let k = 0; k < 4; k++) {
        ctx.beginPath()
        ctx.moveTo(-14, -96 + k * 18)
        ctx.lineTo(-22, -90 + k * 18)
        ctx.lineTo(-14, -84 + k * 18)
        ctx.fill()
      }
      head(ctx, 4, -84, 10, BROWN, 1, { open: 0.8 })
      ctx.fillStyle = '#f97316'
      rr(ctx, 12, -60, 16, 14, 4)
      ctx.restore()
    }
  }
}

// -- the costume parade ----------------------------------------------------------------------------------------

function costumeParade(waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 222
    // An astronaut, a princess and a pumpkin, marching along.
    const kids: Array<[number, number, string]> = [[40, 0, 'astronaut'], [110, 1.6, 'princess'], [180, 3.2, 'pumpkin']]
    for (const [x, ph, what] of kids) {
      const s = Math.sin(p + ph)
      const bob = Math.abs(Math.cos(p + ph)) * 3
      const d: Dress = what === 'astronaut'
        ? { skin: PEACH, hair: '#78350f', shirt: '#f1f5f9', pants: '#e2e8f0', shoes: '#cbd5e1' }
        : what === 'princess'
          ? { skin: BROWN, hair: '#1c1917', shirt: color2, pants: color2, shoes: '#f8fafc' }
          : { skin: TAN, hair: '#1c1917', shirt: '#16a34a', pants: '#16a34a' }
      person(ctx, x, g - bob, 0.8, 1, d, { stride: s * 0.7, skirt: what === 'princess', open: waving ? 0.6 : 0 }, () => {
        if (what === 'astronaut') {
          ctx.strokeStyle = '#e2e8f0'
          ctx.lineWidth = 4
          circle(ctx, 2, -118, 22)
          ctx.stroke()
          ctx.fillStyle = rgba('#bae6fd', 0.3)
          ctx.fill()
          ctx.fillStyle = color
          rr(ctx, -8, -90, 16, 10, 2)
        } else if (what === 'princess') {
          ctx.fillStyle = '#fde68a'
          ctx.beginPath()
          ctx.moveTo(-10, -132)
          ctx.lineTo(-10, -146)
          ctx.lineTo(-4, -138)
          ctx.lineTo(2, -148)
          ctx.lineTo(8, -138)
          ctx.lineTo(14, -146)
          ctx.lineTo(14, -132)
          ctx.fill()
        } else {
          ctx.fillStyle = '#f97316'
          ellipse(ctx, 0, -76, 26, 30)
          ctx.fill()
          ctx.fillStyle = '#1f2937'
          ctx.beginPath()
          ctx.moveTo(-8, -84)
          ctx.lineTo(-2, -76)
          ctx.lineTo(-14, -76)
          ctx.fill()
          ctx.beginPath()
          ctx.moveTo(8, -84)
          ctx.lineTo(14, -76)
          ctx.lineTo(2, -76)
          ctx.fill()
          ctx.fillRect(-10, -66, 20, 4)
        }
        if (waving) arm(ctx, [10, -98, 22, -118, 24 + Math.sin(p * 3 + ph) * 6, -140], 8, d.shirt)
        else arm(ctx, [10, -98, 18 + s * 6, -78, 14 + s * 10, -62], 8, d.shirt)
        // Everyone carries a bucket.
        arm(ctx, [-10, -98, -14 - s * 6, -78, -12 - s * 10, -62], 8, shade(d.shirt, -0.1))
        ctx.fillStyle = what === 'pumpkin' ? '#f8fafc' : '#f97316'
        rr(ctx, -22 - s * 10, -62, 18, 16, 4)
      })
    }
  }
}

// -- watching the parade from the curb ----------------------------------------------------------------------------

function paradeWatchers(cheering: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 222
    // A blanket over the curb, a flask of cocoa.
    ctx.fillStyle = rgba(color, 0.7)
    rr(ctx, 10, g - 14, 250, 14, 3)
    ctx.fillStyle = color2
    for (let x = 18; x < 250; x += 30) ctx.fillRect(x, g - 14, 10, 14)
    const fam: Array<[number, Dress, number]> = [
      [50, { skin: PEACH, hair: '#78350f', shirt: '#e2e8f0', pants: '#94a3b8' }, 0.95],
      [110, { skin: PEACH, hair: '#ca8a04', shirt: '#f9a8d4', pants: '#cbd5e1' }, 0.7],
      [160, { skin: PEACH, hair: '#78350f', shirt: color2, pants: '#cbd5e1' }, 0.62],
      [214, { skin: PEACH, hair: '#ca8a04', shirt: '#93c5fd', pants: '#94a3b8' }, 0.9],
    ]
    fam.forEach(([x, d, s], j) => {
      const jump = cheering && j > 0 && j < 3 ? Math.abs(Math.sin(p * TAU * 2 + j)) * 10 : 0
      seated(ctx, x, g - 4 - jump, 18, s, j < 2 ? 1 : -1, d, cheering ? 0.8 : 0)
      const sy = g - 4 - jump - 18 - 44 * s
      // A knit hat each.
      ctx.fillStyle = j % 2 ? color : color2
      ctx.beginPath()
      ctx.arc(x + (j < 2 ? 2 : -2) * s, g - 4 - jump - 18 - 62 * s - 3, 16 * s, Math.PI, TAU)
      ctx.fill()
      if (cheering) {
        arm(ctx, [x - 6, sy, x - 14, sy - 16, x - 12, sy - 34], 7, d.shirt)
        arm(ctx, [x + 6, sy, x + 14, sy - 16, x + 12 + Math.sin(p * TAU * 3 + j) * 4, sy - 34], 7, d.shirt)
        if (j === 1 || j === 2) {
          // Little flags waving.
          ctx.fillStyle = '#f8fafc'
          ctx.fillRect(x + 12, sy - 54, 2, 22)
          ctx.fillStyle = j === 1 ? '#ef4444' : '#3b82f6'
          ctx.fillRect(x + 14, sy - 54 + Math.sin(p * TAU * 4) * 2, 16, 10)
        }
      } else {
        arm(ctx, [x + 6, sy, x + 10, sy + 14, x + 4, sy + 26], 7, d.shirt)
      }
    })
    ctx.fillStyle = '#ef4444'
    rr(ctx, 250, g - 40, 14, 30, 4)
    ctx.fillStyle = '#f8fafc'
    rr(ctx, 249, g - 46, 16, 8, 2)
    // A giant parade balloon edging into view above them when people come.
    if (cheering) {
      const bx = 330 - Math.min(1, p / 0.5) * 140
      ctx.fillStyle = '#fbbf24'
      ellipse(ctx, bx, 50, 44, 34)
      ctx.fill()
      dot(ctx, bx - 14, 42, 6, '#f8fafc')
      dot(ctx, bx - 14, 42, 3, '#111')
      ctx.fillStyle = '#f97316'
      ctx.beginPath()
      ctx.moveTo(bx - 40, 54)
      ctx.lineTo(bx - 56, 60)
      ctx.lineTo(bx - 40, 64)
      ctx.fill()
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 1.5
      for (const lx of [-20, 0, 20]) {
        ctx.beginPath()
        ctx.moveTo(bx + lx, 82)
        ctx.lineTo(bx + lx * 1.5, 140)
        ctx.stroke()
      }
    }
  }
}

// -- a kite on the real wind ---------------------------------------------------------------------------------------

/** How the wind is drawn, from still to gusty, and the poses within each. */
export const WIND_BANDS = 4
export const KITE_POSES = 4

/** Which band a real wind speed falls in. */
export function windBand(mph: number | null | undefined) {
  if (mph == null) return 2
  return mph < 4 ? 0 : mph < 10 ? 1 : mph < 18 ? 2 : 3
}

function kiteFlyer(cheering: boolean) {
  return (ctx: Ctx, f: number, _frames: number, { color, color2 }: SpriteColors) => {
    const band = Math.floor(f / KITE_POSES) % WIND_BANDS
    const q = (f % KITE_POSES) / KITE_POSES
    const g = 262
    const kid: Dress = { skin: BROWN, hair: '#1c1917', shirt: color2, pants: '#cbd5e1' }
    // Still air: running to get it up, the kite trailing low. Breezier and the kite climbs, tugging harder.
    const run = band === 0
    const x = 50
    const height = [0.15, 0.45, 0.75, 0.95][band]
    const sway = Math.sin(q * TAU) * (band === 3 ? 18 : 8)
    const kx = 120 + height * 110 + sway
    const ky = g - 70 - height * 170 + Math.cos(q * TAU) * (4 + band * 3)
    const lean = band === 3 ? 0.18 : 0
    const hx = x + 30
    const hy = g - 120
    ctx.save()
    ctx.translate(x, g)
    ctx.rotate(lean)
    ctx.translate(-x, -g)
    standing(ctx, x, g, 1, kid, { stride: run ? Math.sin(q * TAU * 2) * 0.9 : 0.2, open: cheering ? 0.8 : band === 3 ? 0.4 : 0 })
    if (cheering) arm(ctx, [x - 10, g - 98, x - 22, g - 120, x - 24, g - 144], 8, kid.shirt)
    else arm(ctx, [x - 10, g - 98, x + 4, g - 108, x + 22, g - 116], 8, shade(kid.shirt, -0.1))
    arm(ctx, [x + 10, g - 98, x + 20, g - 110, hx, hy], 8, kid.shirt)
    ctx.restore()
    // The string: slack in still air, taut in a strong wind.
    ctx.strokeStyle = rgba('#f8fafc', 0.8)
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(hx + lean * 120, hy + 4)
    const sag = [50, 26, 12, 3][band]
    ctx.quadraticCurveTo((hx + kx) / 2, (hy + ky) / 2 + sag, kx, ky + 22)
    ctx.stroke()
    // The kite: a diamond with a cross spar and a bow-tied tail.
    ctx.save()
    ctx.translate(kx, ky)
    ctx.rotate(sway * 0.02 + (band === 0 ? 0.8 : 0))
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(0, -26)
    ctx.lineTo(18, 0)
    ctx.lineTo(0, 30)
    ctx.lineTo(-18, 0)
    ctx.fill()
    ctx.fillStyle = shade(color, 0.25)
    ctx.beginPath()
    ctx.moveTo(0, -26)
    ctx.lineTo(18, 0)
    ctx.lineTo(0, 0)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(0, 30)
    ctx.lineTo(-18, 0)
    ctx.lineTo(0, 0)
    ctx.fill()
    ctx.strokeStyle = '#f8fafc'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, -26)
    ctx.lineTo(0, 30)
    ctx.moveTo(-18, 0)
    ctx.lineTo(18, 0)
    ctx.stroke()
    ctx.strokeStyle = rgba('#f8fafc', 0.8)
    ctx.beginPath()
    ctx.moveTo(0, 30)
    for (let t = 0; t < 6; t++) {
      const tx = Math.sin(q * TAU * 2 + t) * (3 + band * 3)
      const ty = 30 + t * 12
      ctx.lineTo(tx, ty)
      ctx.fillStyle = t % 2 ? color2 : '#fde68a'
      ctx.fillRect(tx - 4, ty - 2, 8, 4)
    }
    ctx.stroke()
    ctx.restore()
    // Gusts going by.
    ctx.strokeStyle = rgba('#e2e8f0', 0.5)
    ctx.lineWidth = 2
    for (let k = 0; k < band; k++) {
      const y = 40 + k * 46
      const xs = ((q + k * 0.3) % 1) * 260
      ctx.beginPath()
      ctx.moveTo(xs, y)
      ctx.quadraticCurveTo(xs + 20, y - 6, xs + 40, y)
      ctx.stroke()
    }
  }
}

const BUBBLE = { id: 'bubble', frames: 1, w: 360, h: 140 }

export const HARVEST_ROWS: Record<string, SpriteRow[]> = {
  'pie-thief': [
    { id: 'main', frames: 8, w: 280, h: 240, paint: pieThief(false) },
    { id: 'act', frames: 10, w: 280, h: 240, paint: pieThief(true) },
    { ...BUBBLE, paint: saying('Just one bite!') },
    SPARKLE,
  ],
  'turkey-carver': [
    { id: 'main', frames: 6, w: 250, h: 250, paint: turkeyCarver(false) },
    { id: 'act', frames: 10, w: 250, h: 250, paint: turkeyCarver(true) },
    { ...BUBBLE, paint: saying('Who wants a drumstick?') },
    SPARKLE,
  ],
  'thanks-table': [
    { id: 'main', frames: 6, w: 300, h: 230, paint: thanksTable(false) },
    { id: 'act', frames: 8, w: 300, h: 230, paint: thanksTable(true) },
    { ...BUBBLE, paint: saying('Thankful for you!') },
    SPARKLE,
  ],
  'leaf-jumper': [
    { id: 'main', frames: 8, w: 260, h: 230, paint: leafJumper(false) },
    { id: 'act', frames: 12, w: 260, h: 230, paint: leafJumper(true) },
    { ...BUBBLE, paint: saying('Wheee!') },
    SPARKLE,
  ],
  'apple-picker': [
    { id: 'main', frames: 6, w: 260, h: 260, paint: applePicker(false) },
    { id: 'act', frames: 12, w: 260, h: 260, paint: applePicker(true) },
    { ...BUBBLE, paint: saying('Got one!') },
    SPARKLE,
  ],
  hayride: [
    { id: 'main', frames: 8, w: 310, h: 200, paint: hayride(false) },
    { id: 'wave', frames: 8, w: 310, h: 200, paint: hayride(true) },
    SPARKLE,
  ],
  'cider-press': [
    { id: 'main', frames: 8, w: 210, h: 250, paint: ciderPress(false) },
    { id: 'act', frames: 8, w: 210, h: 250, paint: ciderPress(true) },
    { ...BUBBLE, paint: saying('Fresh cider!') },
    SPARKLE,
  ],
  'giant-pumpkin': [
    { id: 'main', frames: 7, w: 300, h: 260, paint: giantPumpkin },
    SPARKLE,
  ],
  'turkey-disguise': [
    { id: 'main', frames: DISGUISES * 2, w: 200, h: 240, paint: turkeyDisguise },
    { ...BUBBLE, paint: saying('I’m not a turkey!') },
    SPARKLE,
  ],
  'candy-chute': [
    { id: 'main', frames: 6, w: 300, h: 250, paint: candyChute(false) },
    { id: 'act', frames: 10, w: 300, h: 250, paint: candyChute(true) },
    { ...BUBBLE, paint: saying('Happy Halloween!') },
    SPARKLE,
  ],
  'trunk-or-treat': [
    { id: 'main', frames: 6, w: 270, h: 230, paint: trunkOrTreat(false) },
    { id: 'act', frames: 8, w: 270, h: 230, paint: trunkOrTreat(true) },
    { ...BUBBLE, paint: saying('Trick or treat!') },
    SPARKLE,
  ],
  'costume-parade': [
    { id: 'main', frames: 8, w: 220, h: 230, paint: costumeParade(false) },
    { id: 'wave', frames: 8, w: 220, h: 230, paint: costumeParade(true) },
    SPARKLE,
  ],
  'parade-watchers': [
    { id: 'main', frames: 6, w: 280, h: 230, paint: paradeWatchers(false) },
    { id: 'act', frames: 10, w: 280, h: 230, paint: paradeWatchers(true) },
    { ...BUBBLE, paint: saying('Here it comes!') },
    SPARKLE,
  ],
  'kite-flyer': [
    { id: 'main', frames: WIND_BANDS * KITE_POSES, w: 270, h: 270, paint: kiteFlyer(false) },
    { id: 'act', frames: WIND_BANDS * KITE_POSES, w: 270, h: 270, paint: kiteFlyer(true) },
    { ...BUBBLE, paint: saying('Up, up and away!') },
    { id: 'calm', frames: 1, w: 360, h: 140, paint: saying('Come on, wind!') },
    SPARKLE,
  ],
}
