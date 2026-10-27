/**
 * Pictures for Earth Day, Cinco de Mayo, Mother's Day, Memorial Day, Father's Day and Juneteenth: children
 * picking up litter and recycling, a rain barrel that fills in real rain, a folklórico dancer, a piñata, flowers
 * for mom, breakfast in bed, a garden blooming, a soldier saluting, the flag at half-staff, dad at the grill, on
 * the dock and behind the mower, the reading of General Order No. 3, the Juneteenth flag and double Dutch.
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
const DEEP = '#5c3a24'
const PEACH = '#f5c9a0'
const CANDY = ['#f472b6', '#facc15', '#38bdf8', '#4ade80', '#fb923c', '#a78bfa']

function flower(ctx: Ctx, x: number, y: number, r: number, c: string, open = 1) {
  for (let j = 0; j < 5; j++) {
    const a = (j / 5) * TAU - Math.PI / 2
    dot(ctx, x + Math.cos(a) * r * 0.6 * open, y + Math.sin(a) * r * 0.6 * open, r * (0.35 + 0.2 * open), c)
  }
  dot(ctx, x, y, r * 0.35, '#fde047')
}

// -- picking up litter -------------------------------------------------------------------------------------

function litterPicker(cheer: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 236
    const d: Dress = { skin: TAN, hair: '#292524', shirt: color, pants: '#1e3a8a' }
    const bob = Math.abs(Math.cos(p)) * 2
    ctx.translate(0, -bob)
    // The bag over the far shoulder.
    arm(ctx, [70, g - 98, 56, g - 76, 52, g - 66], 9, shade(color, -0.2))
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(40, g - 70)
    ctx.quadraticCurveTo(26, g - 30, 44, g - 20)
    ctx.lineTo(70, g - 22)
    ctx.quadraticCurveTo(76, g - 44, 62, g - 70)
    ctx.fill()
    ctx.strokeStyle = shade(color2, -0.3)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(44, g - 70)
    ctx.lineTo(60, g - 70)
    ctx.stroke()
    standing(ctx, 80, g + bob, 1, d, { stride: Math.sin(p), open: cheer ? 0.6 : 0 })
    // A recycling arrow on the shirt.
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(80, g - 82, 7, 0.3, TAU - 0.6)
    ctx.stroke()
    // The grabber: swept along the ground, or lifting a can high to drop it in the bag.
    const lift = cheer ? Math.max(0, Math.sin(p)) : 0
    const tipX = cheer ? 150 - lift * 40 : 150 + Math.sin(p) * 8
    const tipY = cheer ? g - 6 - lift * 110 : g - 6
    arm(ctx, [90, g - 98, 104, g - 76, 112, g - 72], 9, d.skin)
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(112, g - 72)
    ctx.lineTo(tipX, tipY)
    ctx.stroke()
    ctx.strokeStyle = '#facc15'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(tipX, tipY)
    ctx.lineTo(tipX + 6, tipY + 6)
    ctx.moveTo(tipX, tipY)
    ctx.lineTo(tipX - 4, tipY + 8)
    ctx.stroke()
    if (cheer && lift > 0.1) {
      ctx.fillStyle = '#dc2626'
      rr(ctx, tipX - 4, tipY + 4, 9, 14, 2)
      ctx.fillStyle = '#e5e7eb'
      ctx.fillRect(tipX - 4, tipY + 8, 9, 3)
    } else if (!cheer) {
      // A can waiting in front.
      ctx.fillStyle = '#16a34a'
      rr(ctx, 160 + ((f * 3) % 8), g - 12, 14, 9, 2)
    }
  }
}

// -- recycling bins ---------------------------------------------------------------------------------------

function recycleBins(tossing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 196
    const bins: Array<[number, string]> = [[120, color], [168, color2], [216, '#64748b']]
    const open = tossing ? Math.sin(Math.min(1, Math.max(0, (p - 0.35) / 0.5)) * Math.PI) : 0
    bins.forEach(([x, c], k) => {
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.moveTo(x - 20, g - 70)
      ctx.lineTo(x + 20, g - 70)
      ctx.lineTo(x + 16, g)
      ctx.lineTo(x - 16, g)
      ctx.fill()
      // The lid: the first one flips up for the throw.
      ctx.save()
      ctx.translate(x + 22, g - 72)
      ctx.rotate(k === 0 ? -open * 1.6 : 0)
      ctx.fillStyle = shade(c, -0.2)
      rr(ctx, -46, -6, 48, 8, 3)
      ctx.restore()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 3
      if (k === 0) {
        // Three chasing arrows.
        for (let j = 0; j < 3; j++) {
          const a = (j / 3) * TAU - Math.PI / 2
          ctx.beginPath()
          ctx.arc(x, g - 36, 11, a + 0.25, a + 1.75)
          ctx.stroke()
        }
      } else if (k === 1) {
        // A leaf for compost.
        ctx.beginPath()
        ctx.ellipse(x, g - 36, 7, 12, 0.6, 0, TAU)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x - 6, g - 26)
        ctx.lineTo(x + 6, g - 46)
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.moveTo(x - 8, g - 44)
        ctx.lineTo(x + 8, g - 44)
        ctx.lineTo(x + 6, g - 26)
        ctx.lineTo(x - 6, g - 26)
        ctx.closePath()
        ctx.stroke()
      }
    })
    // The child: bobbing with a bottle, or throwing it in an arc into the first bin.
    const d: Dress = { skin: PEACH, hair: '#b45309', shirt: '#22c55e' }
    ctx.save()
    ctx.translate(46, g)
    ctx.scale(0.85, 0.85)
    const bob = Math.abs(Math.sin(p * TAU)) * 3
    standing(ctx, 0, -bob, 1, d, { skirt: true, open: tossing && p > 0.3 ? 0.7 : 0 })
    const throwing = tossing && p < 0.45
    const k = throwing ? p / 0.45 : 0
    const hx = tossing ? 10 + Math.sin(k * Math.PI) * 18 : 18
    const hy = tossing ? -98 - bob - Math.sin(k * Math.PI) * 40 : -70 - bob
    arm(ctx, [10, -96 - bob, hx, hy + 10, hx + 4, hy], 8, d.skin)
    arm(ctx, [-10, -96 - bob, -16, -76 - bob, -14, -60 - bob], 8, d.skin)
    if (!tossing || throwing) {
      ctx.fillStyle = rgba('#7dd3fc', 0.9)
      rr(ctx, hx, hy - 18, 9, 20, 3)
      ctx.fillStyle = '#2563eb'
      ctx.fillRect(hx + 2, hy - 22, 5, 4)
    }
    ctx.restore()
    if (tossing && p >= 0.45 && p < 0.85) {
      const u = (p - 0.45) / 0.4
      const bx = 68 + u * 52
      const by = g - 150 - Math.sin(u * Math.PI) * 40 + u * 70
      ctx.save()
      ctx.translate(bx, by)
      ctx.rotate(u * 9)
      ctx.fillStyle = rgba('#7dd3fc', 0.9)
      rr(ctx, -4, -10, 9, 20, 3)
      ctx.restore()
    }
  }
}

// -- a rain barrel -------------------------------------------------------------------------------------------

function rainBarrel(rain: boolean, people: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 226
    // The downspout off the house, and the barrel, its water level up in the rain.
    ctx.fillStyle = '#94a3b8'
    ctx.fillRect(40, 0, 10, 128)
    ctx.fillRect(40, 118, 30, 10)
    ctx.fillStyle = color
    rr(ctx, 30, g - 96, 70, 96, 10)
    ctx.fillStyle = shade(color, -0.2)
    for (const y of [g - 80, g - 20]) ctx.fillRect(30, y, 70, 5)
    ctx.fillStyle = '#7dd3fc'
    ellipse(ctx, 65, g - 96, 33, 6)
    ctx.fill()
    ctx.fillStyle = '#94a3b8'
    rr(ctx, 98, g - 30, 10, 6, 2)
    if (rain) {
      // Water pouring from the spout into the barrel, rain streaks, and puddle rings.
      ctx.strokeStyle = rgba('#bae6fd', 0.9)
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(66, 128)
      ctx.lineTo(66, g - 96)
      ctx.stroke()
      ctx.lineWidth = 2
      for (let k = 0; k < 14; k++) {
        const x = (k * 37 + f * 9) % 220
        const y = ((k * 53 + f * 26) % 200)
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x - 3, y + 14)
        ctx.stroke()
      }
      for (const [x, ph] of [[150, 0], [196, 0.5]] as const) {
        const u = (p + ph) % 1
        ctx.strokeStyle = rgba('#bae6fd', 1 - u)
        ellipse(ctx, x, g - 2, 6 + u * 18, 2 + u * 4)
        ctx.stroke()
      }
    }
    const d: Dress = { skin: BROWN, hair: '#1c1917', shirt: color2, pants: '#334155', shoes: '#facc15' }
    if (rain) {
      // In boots and a raincoat under an umbrella; for people, jumping in the puddle.
      const jump = people ? Math.abs(Math.sin(p * TAU)) * 22 : 0
      ctx.save()
      ctx.translate(170, g - jump)
      ctx.scale(0.85, 0.85)
      standing(ctx, 0, 0, -1, d, { open: people ? 0.8 : 0 })
      arm(ctx, [-10, -96, -18, -110, -16, -140], 9, d.shirt)
      ctx.strokeStyle = '#334155'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(-16, -140)
      ctx.lineTo(-16, -200)
      ctx.stroke()
      ctx.fillStyle = '#facc15'
      ctx.beginPath()
      ctx.arc(-16, -196, 48, Math.PI, 0)
      ctx.fill()
      ctx.fillStyle = '#f59e0b'
      for (let k = 0; k < 4; k++) {
        ctx.beginPath()
        ctx.arc(-52 + k * 24, -196, 12, 0, Math.PI)
        ctx.fill()
      }
      arm(ctx, [10, -96, 20, -76, 26, -64], 9, d.shirt)
      ctx.restore()
      if (people && Math.abs(Math.sin(p * TAU)) < 0.3) {
        ctx.fillStyle = rgba('#bae6fd', 0.9)
        for (let k = 0; k < 6; k++) dot(ctx, 150 + k * 8, g - 10 - (k % 3) * 8, 3, rgba('#bae6fd', 0.9))
      }
    } else {
      // Filling a watering can at the tap and watering the flowers (they lift their heads for people).
      const pour = people ? 0.5 + 0.5 * Math.sin(p * TAU * 2) : 0.2 + 0.1 * Math.sin(p * TAU)
      for (let k = 0; k < 3; k++) {
        const x = 170 + k * 20
        ctx.strokeStyle = '#16a34a'
        ctx.lineWidth = 3
        const up = people ? 1 : 0.6
        ctx.beginPath()
        ctx.moveTo(x, g)
        ctx.quadraticCurveTo(x + 8 * (1 - up), g - 20, x + 10 * (1 - up), g - 30 - up * 10)
        ctx.stroke()
        flower(ctx, x + 10 * (1 - up), g - 32 - up * 10, 8, CANDY[k], up)
      }
      ctx.save()
      ctx.translate(126, g)
      ctx.scale(0.85, 0.85)
      standing(ctx, 0, 0, 1, d, { skirt: true, open: people ? 0.5 : 0 })
      ctx.restore()
      ctx.save()
      ctx.translate(150, g - 70)
      ctx.rotate(pour * 0.5)
      ctx.fillStyle = '#22c55e'
      rr(ctx, -10, -12, 26, 22, 4)
      ctx.strokeStyle = '#22c55e'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(14, -4)
      ctx.lineTo(32, -16)
      ctx.stroke()
      ctx.restore()
      arm(ctx, [135, g - 83, 146, g - 70, 150, g - 70], 8, d.skin)
      if (pour > 0.35) {
        ctx.strokeStyle = rgba('#bae6fd', 0.8)
        ctx.lineWidth = 1.5
        for (let k = 0; k < 4; k++) {
          ctx.beginPath()
          ctx.moveTo(176 + k * 2, g - 74 + k * 3)
          ctx.lineTo(178 + k * 7, g - 40)
          ctx.stroke()
        }
      }
    }
  }
}

// -- a folklórico dancer --------------------------------------------------------------------------------

function folklorico(swirl: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 246
    const x = 110
    const amp = swirl ? 1 : 0.35
    const lh = Math.sin(p) * amp
    const rh = Math.sin(p + Math.PI) * amp
    // The skirt held out in both hands: a wide fan of ruffles, rising on the side that's lifted.
    const lx = x - 50 - amp * 30
    const rx = x + 50 + amp * 30
    const ly = g - 100 - lh * 40
    const ry = g - 100 - rh * 40
    const bands = [color, color2, shade(color, 0.25), '#ffffff']
    // Each ruffle hangs from the waist out to the hands and sweeps down to a hem near the floor.
    for (let k = 3; k >= 0; k--) {
      const s = 1 - k * 0.12
      const Lx = x + (lx - x) * s
      const Ly = ly + (g - 100 - ly) * (1 - s)
      const Rx = x + (rx - x) * s
      const Ry = ry + (g - 100 - ry) * (1 - s)
      const bottom = g - 14 - k * 10
      const cy = 2 * bottom - (Ly + Ry) / 2
      ctx.fillStyle = bands[k]
      ctx.beginPath()
      ctx.moveTo(x - 12, g - 100)
      ctx.lineTo(Lx, Ly)
      ctx.quadraticCurveTo(x, cy, Rx, Ry)
      ctx.lineTo(x + 12, g - 100)
      ctx.fill()
      if (k === 0) {
        // Lace scallops along the outer hem.
        for (let j = 1; j < 14; j++) {
          const u = j / 14
          const hx = (1 - u) * (1 - u) * Lx + 2 * u * (1 - u) * x + u * u * Rx
          const hy = (1 - u) * (1 - u) * Ly + 2 * u * (1 - u) * cy + u * u * Ry
          dot(ctx, hx, hy, 3.2, '#ffffff')
        }
      }
    }
    // Ribbons of trim.
    ctx.strokeStyle = color2
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x + (lx - x) * 0.7, ly + (g - 100 - ly) * 0.3)
    ctx.quadraticCurveTo(x, g - 40, x + (rx - x) * 0.7, ry + (g - 100 - ry) * 0.3)
    ctx.stroke()
    // Stamping feet.
    const stamp = Math.sin(p * 2) > 0
    ctx.fillStyle = '#1f2937'
    rr(ctx, x - 16, g - 8 - (stamp ? 6 : 0), 16, 8, 3)
    rr(ctx, x + 2, g - 8 - (stamp ? 0 : 6), 16, 8, 3)
    // Bodice, arms out to the skirt's edges, a flower and ribbons in her hair.
    ctx.fillStyle = '#ffffff'
    rr(ctx, x - 13, g - 140, 26, 44, 8)
    ctx.fillStyle = color2
    ctx.fillRect(x - 13, g - 112, 26, 5)
    arm(ctx, [x - 10, g - 132, x - 36, g - 120 - lh * 20, lx + 6, ly], 7, TAN)
    arm(ctx, [x + 10, g - 132, x + 36, g - 120 - rh * 20, rx - 6, ry], 7, TAN)
    head(ctx, x + 2, g - 156, 15, TAN, 1, { open: swirl ? 0.5 : 0 })
    ctx.fillStyle = '#1c1917'
    ctx.beginPath()
    ctx.arc(x + 2, g - 158, 16, Math.PI * 1.02, Math.PI * 1.98)
    ctx.fill()
    dot(ctx, x - 14, g - 150, 9, '#1c1917')
    flower(ctx, x - 10, g - 172, 8, '#ef4444')
    flower(ctx, x + 10, g - 174, 6, '#facc15')
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x - 16, g - 150)
    ctx.quadraticCurveTo(x - 28, g - 130 + Math.sin(p) * 6, x - 22, g - 110)
    ctx.stroke()
  }
}

// -- a piñata -------------------------------------------------------------------------------------------

function pinataParty(hit: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 246
    const burst = hit && p >= 0.5
    const sway = Math.sin(p * TAU) * (hit ? 0.05 : 0.2)
    // The rope, and the star piñata swinging on it (split open once it's hit).
    ctx.save()
    ctx.translate(176, 0)
    ctx.rotate(sway)
    ctx.strokeStyle = '#d6d3d1'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, 66)
    ctx.stroke()
    const drawStar = (dx: number, dy: number, half: number) => {
      ctx.save()
      ctx.translate(dx, dy + 96)
      ctx.beginPath()
      if (half !== 0) {
        ctx.rect(half < 0 ? -60 : 0, -60, 60, 120)
        ctx.clip()
      }
      ctx.fillStyle = color
      circle(ctx, 0, 0, 26)
      ctx.fill()
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU - Math.PI / 2
        ctx.fillStyle = CANDY[k]
        ctx.beginPath()
        ctx.moveTo(Math.cos(a - 0.35) * 22, Math.sin(a - 0.35) * 22)
        ctx.lineTo(Math.cos(a) * 52, Math.sin(a) * 52)
        ctx.lineTo(Math.cos(a + 0.35) * 22, Math.sin(a + 0.35) * 22)
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * 52, Math.sin(a) * 52)
        ctx.lineTo(Math.cos(a) * 60, Math.sin(a) * 60 + 8)
        ctx.stroke()
      }
      ctx.fillStyle = color2
      for (let k = 0; k < 3; k++) ctx.fillRect(-26, -12 + k * 10, 52, 4)
      ctx.restore()
    }
    if (burst) {
      const u = (p - 0.5) / 0.5
      drawStar(-u * 16, u * 6, -1)
      drawStar(u * 16, u * 6, 1)
    } else drawStar(0, 0, 0)
    ctx.restore()
    if (burst) {
      // Candy raining down.
      const u = (p - 0.5) / 0.5
      for (let k = 0; k < 16; k++) {
        const cx = 176 + Math.sin(k * 2.3) * (20 + u * 40)
        const cy = 100 + u * u * 150 + (k % 4) * 10 + Math.abs(Math.sin(k * 1.7)) * u * 40
        ctx.save()
        ctx.translate(cx, Math.min(g - 4, cy))
        ctx.rotate(k + u * 6)
        ctx.fillStyle = CANDY[k % CANDY.length]
        rr(ctx, -5, -3, 10, 6, 3)
        ctx.restore()
      }
    }
    // A blindfolded child swinging a stick: a wind-up, then a big swing.
    const d: Dress = { skin: TAN, hair: '#1c1917', shirt: color2, pants: '#1e3a8a' }
    standing(ctx, 70, g, 1, d, { open: hit ? 0.7 : 0.2 })
    ctx.fillStyle = '#dc2626'
    ctx.fillRect(56, g - 126, 34, 6)
    const swing = hit ? (p < 0.4 ? -1 + (p / 0.4) * 0.3 : Math.min(1, -0.7 + ((p - 0.4) / 0.15) * 1.7)) : -0.6 + Math.sin(p * TAU) * 0.4
    const a = -Math.PI / 2 + swing * 1.2
    const hx = 80 + Math.cos(a) * 26
    const hy = g - 96 + Math.sin(a) * 26
    arm(ctx, [64, g - 98, (64 + hx) / 2, (g - 98 + hy) / 2 + 6, hx, hy], 8, d.skin)
    arm(ctx, [80, g - 98, (80 + hx) / 2 + 4, (g - 98 + hy) / 2 + 8, hx, hy], 8, d.skin)
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(hx, hy)
    ctx.lineTo(hx + Math.cos(a) * 70, hy + Math.sin(a) * 70)
    ctx.stroke()
  }
}

// -- flowers for mom -------------------------------------------------------------------------------------

function bouquet(ctx: Ctx, x: number, y: number) {
  ctx.strokeStyle = '#16a34a'
  ctx.lineWidth = 2
  for (let k = 0; k < 5; k++) {
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x - 12 + k * 6, y - 26)
    ctx.stroke()
  }
  for (let k = 0; k < 5; k++) flower(ctx, x - 12 + k * 6, y - 28 - (k % 2) * 6, 6, CANDY[k])
  ctx.fillStyle = '#fde68a'
  ctx.beginPath()
  ctx.moveTo(x - 8, y - 12)
  ctx.lineTo(x + 8, y - 12)
  ctx.lineTo(x + 2, y + 8)
  ctx.lineTo(x - 2, y + 8)
  ctx.fill()
}

function flowersForMom(giving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 246
    const mom: Dress = { skin: TAN, hair: '#44281a', shirt: color, shoes: '#7c2d12' }
    const kid: Dress = { skin: TAN, hair: '#44281a', shirt: color2 }
    const hug = giving && p > 0.5
    // Mom: hands on her knees to see, or bending to hug.
    ctx.save()
    if (hug) {
      ctx.translate(170, g)
      ctx.rotate(-0.12)
      ctx.translate(-170, -g)
    }
    standing(ctx, 170, g, -1, mom, { skirt: true, open: giving ? 0.6 : 0 })
    ctx.fillStyle = mom.hair
    ellipse(ctx, 180, g - 108, 12, 22)
    ctx.fill()
    if (hug) {
      arm(ctx, [160, g - 98, 130, g - 94, 104, g - 80], 9, mom.skin)
      arm(ctx, [180, g - 98, 150, g - 86, 120, g - 74], 9, mom.skin)
    } else {
      arm(ctx, [160, g - 98, 150, g - 76, 152, g - 60], 9, mom.skin)
      arm(ctx, [180, g - 98, 190, g - 76, 186, g - 60], 9, mom.skin)
    }
    ctx.restore()
    // The child: flowers hidden behind the back, then held up high.
    ctx.save()
    const hop = giving ? Math.abs(Math.sin(Math.min(p, 0.5) * TAU)) * 10 : Math.abs(Math.sin(p * TAU)) * 3
    ctx.translate(96, g - hop)
    ctx.scale(0.72, 0.72)
    if (!giving) bouquet(ctx, -26, -64)
    standing(ctx, 0, 0, 1, kid, { open: giving ? 0.8 : 0 })
    if (giving) {
      arm(ctx, [10, -96, 30, -110, 44, -130], 9, kid.skin)
      arm(ctx, [-10, -96, 16, -112, 40, -132], 9, kid.skin)
      bouquet(ctx, 44, -126)
    } else {
      arm(ctx, [-10, -96, -18, -78, -24, -62], 9, kid.skin)
      arm(ctx, [10, -96, 4, -78, -16, -64], 9, kid.skin)
    }
    ctx.restore()
    if (hug) {
      const u = (p - 0.5) / 0.5
      ctx.fillStyle = rgba('#f472b6', 1 - u)
      ctx.beginPath()
      const hx = 140
      const hy = g - 150 - u * 40
      ctx.moveTo(hx, hy + 8)
      ctx.bezierCurveTo(hx - 14, hy - 2, hx - 8, hy - 14, hx, hy - 6)
      ctx.bezierCurveTo(hx + 8, hy - 14, hx + 14, hy - 2, hx, hy + 8)
      ctx.fill()
    }
  }
}

// -- breakfast in bed ------------------------------------------------------------------------------------

function breakfastTray(proud: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 236
    const d: Dress = { skin: PEACH, hair: '#78350f', shirt: color2, pants: '#475569' }
    const bob = Math.abs(Math.cos(p)) * 2
    ctx.translate(0, -bob)
    standing(ctx, 80, g + bob, 1, d, { stride: Math.sin(p) * 0.6, open: proud ? 0.6 : 0 })
    // The tray held out in front: pancakes with syrup, orange juice, a flower in a vase.
    const lift = proud ? 18 + Math.sin(p * 2) * 4 : 0
    const tilt = proud ? 0 : Math.sin(p * 2) * 0.05
    ctx.save()
    ctx.translate(120, g - 80 - lift)
    ctx.rotate(tilt)
    ctx.fillStyle = color
    rr(ctx, -34, 0, 68, 7, 3)
    ctx.fillStyle = '#f8fafc'
    ellipse(ctx, -12, -2, 18, 4)
    ctx.fill()
    ctx.fillStyle = '#d97706'
    for (let k = 0; k < 3; k++) {
      ellipse(ctx, -12, -6 - k * 5, 14, 4)
      ctx.fill()
    }
    ctx.fillStyle = '#facc15'
    rr(ctx, -16, -22, 8, 5, 2)
    ctx.fillStyle = rgba('#fb923c', 0.9)
    rr(ctx, 10, -18, 9, 18, 2)
    ctx.fillStyle = rgba('#e0f2fe', 0.6)
    rr(ctx, 24, -14, 7, 14, 2)
    ctx.strokeStyle = '#16a34a'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(27, -14)
    ctx.lineTo(28, -30)
    ctx.stroke()
    flower(ctx, 28, -32, 6, '#f43f5e')
    ctx.restore()
    arm(ctx, [70, g - 98, 82, g - 84 - lift / 2, 90, g - 80 - lift], 9, d.skin)
    arm(ctx, [90, g - 98, 116, g - 86 - lift / 2, 144, g - 80 - lift], 9, d.skin)
  }
}

// -- mom's garden ------------------------------------------------------------------------------------------

/** Level: the bed of flowers opening one by one as people come. */
function momGarden(ctx: Ctx, f: number, n: number, { color, color2 }: SpriteColors) {
  const g = 216
  const k = f / (n - 1)
  ctx.fillStyle = '#78350f'
  ellipse(ctx, 140, g - 4, 100, 10)
  ctx.fill()
  for (let j = 0; j < 7; j++) {
    const x = 60 + j * 26
    const open = Math.max(0, Math.min(1, k * 7 - j))
    const h = 30 + (j % 3) * 10
    ctx.strokeStyle = '#16a34a'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x, g - 6)
    ctx.lineTo(x, g - 6 - h * (0.6 + 0.4 * open))
    ctx.stroke()
    ctx.fillStyle = '#22c55e'
    ellipse(ctx, x - 6, g - 18, 7, 3, -0.5)
    ctx.fill()
    const c = [color, color2, '#facc15', '#f472b6', '#a78bfa', '#fb923c', '#38bdf8'][j]
    if (open > 0.05) flower(ctx, x, g - 8 - h * (0.6 + 0.4 * open), 10, c, open)
    else dot(ctx, x, g - 6 - h * 0.6, 4, '#4ade80')
  }
  // Mom kneeling at the end of the bed with a trowel, a sun hat on.
  const x = 40
  ctx.fillStyle = '#475569'
  rr(ctx, x - 20, g - 30, 34, 24, 8)
  ctx.fillStyle = color
  ctx.save()
  ctx.translate(x - 2, g - 34)
  ctx.rotate(0.25)
  rr(ctx, -14, -50, 28, 52, 10)
  ctx.restore()
  head(ctx, x + 12, g - 98, 15, BROWN, 1, { open: k > 0.9 ? 0.5 : 0 })
  ctx.fillStyle = '#fde68a'
  ellipse(ctx, x + 12, g - 108, 30, 6)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(x + 12, g - 110, 15, 12, 0, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.fillRect(x - 3, g - 114, 30, 4)
  arm(ctx, [x + 8, g - 74, x + 22, g - 52, x + 30 + Math.sin(f) * 3, g - 30], 8, BROWN)
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(x + 30, g - 30)
  ctx.lineTo(x + 38, g - 14)
  ctx.stroke()
}

// -- a soldier saluting -----------------------------------------------------------------------------------------

function saluting(salute: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 256
    const d: Dress = { skin: TAN, hair: '#1c1917', shirt: color, pants: shade(color, -0.25), shoes: '#111827' }
    ctx.save()
    ctx.translate(90, g)
    ctx.scale(1.15, 1.15)
    standing(ctx, 0, 0, 1, d, { bald: true, blink: !salute && f === frames - 1 })
    // White belt, gold buttons, ribbons; the white peaked cap.
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(-15, -62, 30, 5)
    for (let k = 0; k < 4; k++) dot(ctx, 4, -100 + k * 11, 1.8, color2)
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = ['#dc2626', '#facc15', '#2563eb'][k]
      ctx.fillRect(-12 + k * 6, -96, 5, 4)
    }
    ctx.fillStyle = '#111827'
    rr(ctx, -12, -134, 32, 6, 3)
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.ellipse(2, -136, 18, 7, 0, Math.PI, 0)
    ctx.fill()
    rr(ctx, -16, -142, 36, 8, 4)
    dot(ctx, 4, -138, 3, color2)
    // At attention, arms at the sides; or the salute, the right hand to the cap's brim.
    arm(ctx, [-10, -96, -14, -76, -14, -58], 8, d.shirt)
    dot(ctx, -14, -56, 4.5, '#f8fafc')
    const up = salute ? Math.min(1, p / 0.3) : 0
    if (up > 0) {
      arm(ctx, [10, -96, 26 - up * 2, -110 + (1 - up) * 30, 12 + (1 - up) * 10, -128 + (1 - up) * 50], 8, d.shirt)
      dot(ctx, 12 + (1 - up) * 10, -128 + (1 - up) * 50, 4.5, '#f8fafc')
    } else {
      arm(ctx, [10, -96, 14, -76, 14, -58], 8, d.shirt)
      dot(ctx, 14, -56, 4.5, '#f8fafc')
    }
    ctx.restore()
  }
}

// -- the flag at half-staff ---------------------------------------------------------------------------------

function memorialFlag(half: boolean) {
  return (ctx: Ctx, f: number, frames: number) => {
    const p = (f / frames) * TAU
    const g = 296
    ctx.fillStyle = '#94a3b8'
    ctx.fillRect(28, 14, 6, g - 14)
    dot(ctx, 31, 12, 6, '#facc15')
    ctx.fillStyle = '#64748b'
    rr(ctx, 16, g - 10, 30, 10, 3)
    const top = half ? 120 : 22
    // The flag in the breeze: stripes rippling, the blue canton with its stars.
    const W = 120
    const H = 72
    for (let s = 0; s < 13; s++) {
      ctx.fillStyle = s % 2 ? '#f8fafc' : '#dc2626'
      ctx.beginPath()
      for (let j = 0; j <= 12; j++) {
        const x = 34 + (j / 12) * W
        const y = top + (s / 13) * H + Math.sin(p + j * 0.6) * 4 * (j / 12)
        if (j === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      for (let j = 12; j >= 0; j--) {
        const x = 34 + (j / 12) * W
        const y = top + ((s + 1) / 13) * H + Math.sin(p + j * 0.6) * 4 * (j / 12) + 0.6
        ctx.lineTo(x, y)
      }
      ctx.fill()
    }
    ctx.fillStyle = '#1e3a8a'
    ctx.beginPath()
    for (let j = 0; j <= 5; j++) {
      const x = 34 + (j / 12) * W
      ctx.lineTo(x, top + Math.sin(p + j * 0.6) * 4 * (j / 12))
    }
    for (let j = 5; j >= 0; j--) {
      const x = 34 + (j / 12) * W
      ctx.lineTo(x, top + H * (7 / 13) + Math.sin(p + j * 0.6) * 4 * (j / 12))
    }
    ctx.fill()
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) dot(ctx, 40 + c * 11 + (r % 2) * 5, top + 6 + r * 9 + Math.sin(p + c) * 0.8, 1.6, '#ffffff')
    }
    // A wreath of poppies at the foot of the pole.
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU
      dot(ctx, 70 + Math.cos(a) * 18, g - 22 + Math.sin(a) * 12, 6, '#15803d')
    }
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + 0.3
      dot(ctx, 70 + Math.cos(a) * 18, g - 22 + Math.sin(a) * 12, 5, '#dc2626')
      dot(ctx, 70 + Math.cos(a) * 18, g - 22 + Math.sin(a) * 12, 1.8, '#111827')
    }
  }
}

// -- dad at the grill -------------------------------------------------------------------------------------------

function grillDad(flip: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 246
    // The kettle grill (grey, so it shows), glowing coals, burgers and smoke.
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(140, g - 66)
    ctx.lineTo(128, g)
    ctx.moveTo(200, g - 66)
    ctx.lineTo(212, g)
    ctx.moveTo(170, g - 54)
    ctx.lineTo(170, g)
    ctx.stroke()
    ctx.fillStyle = '#94a3b8'
    ctx.beginPath()
    ctx.arc(170, g - 96, 42, 0, Math.PI)
    ctx.fill()
    ctx.fillStyle = '#cbd5e1'
    ellipse(ctx, 156, g - 78, 12, 6, -0.4)
    ctx.fill()
    ctx.fillStyle = '#f97316'
    ellipse(ctx, 170, g - 96, 40, 5)
    ctx.fill()
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(128, g - 98)
    ctx.lineTo(212, g - 98)
    ctx.stroke()
    const flare = flip ? Math.max(0, Math.sin(p * TAU)) : 0
    for (let k = 0; k < 5; k++) {
      const h = 6 + Math.sin(f * 2 + k * 1.7) * 3 + flare * 22
      ctx.fillStyle = k % 2 ? '#facc15' : '#f97316'
      ctx.beginPath()
      ctx.moveTo(140 + k * 15, g - 98)
      ctx.quadraticCurveTo(146 + k * 15, g - 98 - h, 150 + k * 15, g - 98)
      ctx.fill()
    }
    const burgers = [146, 194]
    for (const x of burgers) {
      ctx.fillStyle = '#78350f'
      rr(ctx, x - 12, g - 106, 24, 8, 4)
    }
    // The flipped burger, up in the air and turning.
    const fly = flip ? Math.sin(Math.min(1, p / 0.7) * Math.PI) : 0
    ctx.save()
    ctx.translate(170, g - 104 - fly * 70)
    ctx.rotate(flip ? Math.min(1, p / 0.7) * Math.PI * 2 : 0)
    ctx.fillStyle = '#78350f'
    rr(ctx, -12, -4, 24, 8, 4)
    ctx.restore()
    for (let k = 0; k < 3; k++) {
      const u = (p + k / 3) % 1
      ctx.fillStyle = rgba('#e5e7eb', 0.4 * (1 - u))
      circle(ctx, 160 + k * 12 + Math.sin(u * 6 + k) * 8, g - 110 - u * 80, 8 + u * 10)
      ctx.fill()
    }
    // Dad in an apron with the spatula.
    const d: Dress = { skin: PEACH, hair: '#78350f', shirt: color2, pants: '#334155' }
    standing(ctx, 80, g, 1, d, { open: flip ? 0.7 : 0 })
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(68, g - 98)
    ctx.lineTo(92, g - 98)
    ctx.lineTo(96, g - 44)
    ctx.lineTo(64, g - 44)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 9px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('#1', 80, g - 70)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(82, g - 136, 14, 8, 0, Math.PI, 0)
    ctx.fill()
    rr(ctx, 68, g - 138, 28, 6, 3)
    arm(ctx, [70, g - 98, 62, g - 76, 64, g - 60], 9, d.shirt)
    const sx = flip ? 150 - fly * 10 : 140 + Math.sin(p * TAU) * 4
    const sy = flip ? g - 104 - fly * 30 : g - 102
    arm(ctx, [90, g - 98, 112, g - 94, sx - 26, sy + 4], 9, d.shirt)
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(sx - 26, sy + 4)
    ctx.lineTo(sx, sy)
    ctx.stroke()
    ctx.fillStyle = '#cbd5e1'
    rr(ctx, sx - 2, sy - 3, 16, 5, 2)
  }
}

// -- fishing off the dock ---------------------------------------------------------------------------------------

function fishingDock(catching: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 150
    // Water ripples (pale so they show), the dock and its posts.
    ctx.strokeStyle = rgba('#7dd3fc', 0.7)
    ctx.lineWidth = 2
    for (let k = 0; k < 6; k++) {
      ctx.beginPath()
      const y = g + 20 + k * 9
      for (let x = 120; x < 260; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.1 + f + k) * 2)
      ctx.stroke()
    }
    ctx.fillStyle = '#a16207'
    ctx.fillRect(0, g - 6, 130, 12)
    ctx.fillStyle = '#854d0e'
    for (const x of [10, 60, 110]) ctx.fillRect(x, g + 6, 10, 60)
    // Dad and his son sitting on the edge, legs dangling.
    const pull = catching ? Math.min(1, p / 0.4) : 0
    const fish = catching ? Math.max(0, (p - 0.3) / 0.7) : 0
    const sit = (x: number, d: Dress, s: number, cheer: boolean) => {
      ctx.save()
      ctx.translate(x, g - 6)
      ctx.scale(s, s)
      const swing = Math.sin(p * TAU + x) * 6
      arm(ctx, [0, -4, 18, 0, 22 + swing * 0.5, 38], 11, d.pants ?? '#334155')
      arm(ctx, [-6, -4, 14, 2, 14 - swing * 0.5, 38], 11, shade(d.pants ?? '#334155', -0.15))
      ctx.fillStyle = d.shirt
      rr(ctx, -16, -54, 30, 52, 10)
      head(ctx, 2, -66, 16, d.skin, 1, { open: cheer ? 0.8 : 0 })
      ctx.fillStyle = d.hair
      ctx.beginPath()
      ctx.arc(2, -68, 17, Math.PI * 1.02, Math.PI * 1.98)
      ctx.fill()
      ctx.restore()
    }
    const dad: Dress = { skin: BROWN, hair: DEEP, shirt: color, pants: '#1e3a8a' }
    sit(70, dad, 1, catching && fish > 0.5)
    // His cap.
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.ellipse(72, g - 82, 16, 9, 0, Math.PI, 0)
    ctx.fill()
    rr(ctx, 72, g - 84, 22, 4, 2)
    sit(28, { skin: BROWN, hair: DEEP, shirt: color2, pants: '#475569' }, 0.7, catching && fish > 0.5)
    if (catching && fish > 0.5) arm(ctx, [34, g - 40, 40, g - 60, 44, g - 74], 6, color2)
    // The rod, bending as it's pulled, and the line.
    const bend = catching ? 0.4 + pull * 0.6 : 0.15 + Math.sin(p * TAU) * 0.05
    const rx = 82
    const ry = g - 40
    const tipX = rx + 110 - bend * 20
    const tipY = ry - 70 + bend * 30 - (catching ? pull * 30 : 0)
    arm(ctx, [76, g - 46, 82, g - 40], 9, dad.skin)
    ctx.strokeStyle = '#334155'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(rx, ry)
    ctx.quadraticCurveTo(rx + 70, ry - 70, tipX, tipY)
    ctx.stroke()
    const fx = catching ? tipX + 10 - fish * 20 : 220
    const fy = catching ? g + 20 - fish * 90 : g + 24
    ctx.strokeStyle = rgba('#e5e7eb', 0.8)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(tipX, tipY)
    ctx.lineTo(fx, fy)
    ctx.stroke()
    if (catching && fish > 0) {
      ctx.save()
      ctx.translate(fx, fy + 16)
      ctx.rotate(Math.PI / 2 + Math.sin(f * 2.5) * 0.4)
      ctx.fillStyle = '#4ade80'
      ellipse(ctx, 0, 0, 16, 7)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(14, 0)
      ctx.lineTo(24, -7)
      ctx.lineTo(24, 7)
      ctx.fill()
      dot(ctx, -9, -2, 1.8, '#111827')
      ctx.restore()
      if (fish < 0.4) {
        for (let k = 0; k < 5; k++) dot(ctx, fx - 12 + k * 6, g + 20 - Math.sin(k) * 8, 2.5, rgba('#bae6fd', 0.9))
      }
    } else {
      dot(ctx, fx, fy, 4, '#ef4444')
      dot(ctx, fx, fy - 3, 3, '#f8fafc')
    }
  }
}

// -- dad mowing the lawn -------------------------------------------------------------------------------------

function lawnMower(waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 216
    // The mower out in front: deck, wheels, the handle back to his hands, clippings flying out the side.
    ctx.fillStyle = color
    rr(ctx, 150, g - 30, 70, 22, 6)
    ctx.fillStyle = shade(color, -0.25)
    ctx.fillRect(166, g - 40, 30, 10)
    for (const x of [158, 212]) {
      dot(ctx, x, g - 8, 9, '#1f2937')
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, g - 8)
      ctx.lineTo(x + Math.cos(p * 2) * 7, g - 8 + Math.sin(p * 2) * 7)
      ctx.stroke()
    }
    for (let k = 0; k < 8; k++) {
      const u = ((f / frames) * 2 + k / 8) % 1
      dot(ctx, 220 + u * 30, g - 22 - Math.sin(u * Math.PI) * 20 + (k % 3) * 4, 2, '#4ade80')
    }
    // Stripes of fresh-cut lawn behind.
    ctx.fillStyle = rgba('#4ade80', 0.5)
    ctx.fillRect(0, g - 3, 150, 3)
    const d: Dress = { skin: PEACH, hair: '#a16207', shirt: color2, pants: '#78716c' }
    standing(ctx, 90, g, 1, d, { stride: Math.sin(p) })
    // Sun hat... a baseball cap, raised in the wave.
    if (waving) {
      const w = Math.sin(p * 2) * 8
      arm(ctx, [82, g - 98, 70, g - 120, 64 + w, g - 144], 9, d.skin)
      ctx.fillStyle = '#1e3a8a'
      ctx.beginPath()
      ctx.ellipse(64 + w, g - 152, 12, 7, 0, Math.PI, 0)
      ctx.fill()
      rr(ctx, 64 + w, g - 154, 16, 4, 2)
    } else {
      ctx.fillStyle = '#1e3a8a'
      ctx.beginPath()
      ctx.ellipse(92, g - 128, 16, 9, 0, Math.PI, 0)
      ctx.fill()
      rr(ctx, 92, g - 130, 22, 4, 2)
      arm(ctx, [82, g - 98, 100, g - 82, 124, g - 78], 9, shade(d.shirt, -0.15))
    }
    arm(ctx, [100, g - 98, 112, g - 84, 126, g - 80], 9, d.shirt)
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(124, g - 80)
    ctx.lineTo(166, g - 30)
    ctx.stroke()
  }
}

// -- reading General Order No. 3 ------------------------------------------------------------------------------

function orderReader(proclaim: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    const g = 256
    const d: Dress = { skin: BROWN, hair: '#111827', shirt: color, pants: '#57534e', shoes: '#292524' }
    ctx.save()
    ctx.translate(96, g)
    ctx.scale(1.1, 1.1)
    standing(ctx, 0, 0, 1, d, { open: proclaim ? 0.7 : 0.2 })
    // A long frock coat, a white collar and a bow tie.
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(-15, -100)
    ctx.lineTo(15, -100)
    ctx.lineTo(18, -36)
    ctx.lineTo(-18, -36)
    ctx.fill()
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(-6, -104, 12, 8)
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(-6, -100)
    ctx.lineTo(0, -97)
    ctx.lineTo(6, -100)
    ctx.lineTo(6, -94)
    ctx.lineTo(0, -97)
    ctx.lineTo(-6, -94)
    ctx.fill()
    // The scroll: read from at chest height, then held high to the crowd.
    const up = proclaim ? Math.min(1, p / 0.35) : 0
    const sy = -76 - up * 66 + (proclaim ? 0 : Math.sin(p * TAU) * 2)
    const sx = 30 - up * 6
    arm(ctx, [10, -96, 24, -86 - up * 30, sx - 4, sy + 10], 8, color)
    arm(ctx, [-10, -96, 6, -84 - up * 30, sx - 4, sy + 34], 8, shade(color, -0.15))
    ctx.fillStyle = '#fef3c7'
    rr(ctx, sx - 6, sy, 32, 46, 2)
    ctx.fillStyle = '#d6c08f'
    rr(ctx, sx - 8, sy - 4, 36, 7, 3)
    rr(ctx, sx - 8, sy + 43, 36, 7, 3)
    ctx.strokeStyle = '#78716c'
    ctx.lineWidth = 1.2
    for (let k = 0; k < 6; k++) {
      ctx.beginPath()
      ctx.moveTo(sx - 2, sy + 8 + k * 6)
      ctx.lineTo(sx + 22 - (k % 3) * 4, sy + 8 + k * 6)
      ctx.stroke()
    }
    ctx.restore()
    if (proclaim && p > 0.35) {
      // A burst like the star on the Juneteenth flag.
      const u = (p - 0.35) / 0.65
      ctx.strokeStyle = rgba('#facc15', 1 - u * 0.6)
      ctx.lineWidth = 3
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU
        const cx = 124
        const cy = g - 190
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * (36 + u * 10), cy + Math.sin(a) * (36 + u * 10))
        ctx.lineTo(cx + Math.cos(a) * (50 + u * 16), cy + Math.sin(a) * (50 + u * 16))
        ctx.stroke()
      }
    }
  }
}

// -- the Juneteenth flag -------------------------------------------------------------------------------------

function juneteenthFlag(ctx: Ctx, x: number, y: number, s: number, p: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  const wave = (u: number) => Math.sin(p + u * 4) * 5 * u
  const W = 110
  const H = 70
  // Blue over red, divided by a curved horizon, with a white starburst and star.
  const band = (top: (u: number) => number, bottom: (u: number) => number, c: string) => {
    ctx.fillStyle = c
    ctx.beginPath()
    for (let j = 0; j <= 10; j++) ctx.lineTo((j / 10) * W, top(j / 10) + wave(j / 10))
    for (let j = 10; j >= 0; j--) ctx.lineTo((j / 10) * W, bottom(j / 10) + wave(j / 10))
    ctx.fill()
  }
  const horizon = (u: number) => H * 0.55 - Math.sin(u * Math.PI) * 14
  band(() => 0, horizon, '#1d4ed8')
  band(horizon, () => H, '#dc2626')
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let j = 0; j <= 10; j++) ctx.lineTo((j / 10) * W, horizon(j / 10) + wave(j / 10))
  ctx.stroke()
  const cx = W * 0.45
  const cy = H * 0.42 + wave(0.45)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU - Math.PI / 2
    const r = k % 2 ? 9 : 17
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  }
  ctx.fill()
  ctx.fillStyle = '#1d4ed8'
  ctx.beginPath()
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU - Math.PI / 2
    const r = k % 2 ? 3.5 : 8
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  }
  ctx.fill()
  ctx.restore()
}

function flagBearer(raised: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const g = 256
    const d: Dress = { skin: BROWN, hair: '#111827', shirt: color, pants: color2 }
    const bob = Math.abs(Math.cos(p)) * 2
    ctx.translate(0, -bob)
    const lift = raised ? 30 + Math.sin(p * 2) * 6 : 0
    // The pole and flag behind, then the marcher.
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(102, g - 70 - lift)
    ctx.lineTo(102, g - 230 - lift)
    ctx.stroke()
    dot(ctx, 102, g - 232 - lift, 4, '#facc15')
    juneteenthFlag(ctx, 104, g - 228 - lift, 0.85, p)
    standing(ctx, 80, g + bob, 1, d, { stride: Math.sin(p), open: raised ? 0.7 : 0 })
    arm(ctx, [90, g - 98, 100, g - 104 - lift * 0.5, 102, g - 112 - lift], 9, d.shirt)
    dot(ctx, 102, g - 112 - lift, 5, d.skin)
    if (raised) {
      const w = Math.sin(p * 2) * 10
      arm(ctx, [70, g - 98, 58, g - 120, 54 + w, g - 144], 9, shade(d.shirt, -0.15))
      dot(ctx, 54 + w, g - 146, 5, d.skin)
    } else arm(ctx, [70, g - 98, 66 - Math.sin(p) * 10, g - 76, 64 - Math.sin(p) * 14, g - 58], 9, shade(d.shirt, -0.15))
  }
}

// -- double Dutch ---------------------------------------------------------------------------------------------

function doubleDutch(fast: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU * (fast ? 2 : 1)
    const g = 226
    // The two turners at the ends, arms circling.
    const turner = (x: number, dir: number, shirt: string, ph: number) => {
      const d: Dress = { skin: dir > 0 ? BROWN : DEEP, hair: '#111827', shirt, pants: '#334155' }
      ctx.save()
      ctx.translate(x, g)
      ctx.scale(0.85, 0.85)
      standing(ctx, 0, 0, dir, d, { skirt: true, open: fast ? 0.5 : 0 })
      ctx.restore()
      const hx = x + dir * 26 + Math.cos(p + ph) * 10 * dir
      const hy = g - 72 + Math.sin(p + ph) * 12
      arm(ctx, [x + dir * 8, g - 82, x + dir * 18, g - 74, hx, hy], 7, d.skin)
      return [hx, hy] as const
    }
    const a1 = turner(36, 1, color, 0)
    const b1 = turner(224, -1, color2, 0)
    // Two ropes turning in opposite directions: each one an arc that sweeps over the jumper and under her feet.
    const rope = (ph: number, c: string) => {
      const s = Math.sin(p + ph)
      const mid = (a1[1] + b1[1]) / 2
      const sag = s * 90
      ctx.strokeStyle = c
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(a1[0], a1[1])
      ctx.quadraticCurveTo(130, mid + sag, b1[0], b1[1])
      ctx.stroke()
    }
    const back = Math.cos(p) < 0
    if (back) rope(0, '#f472b6')
    if (!back) rope(Math.PI, '#facc15')
    // The jumper in the middle: hopping over each rope as it passes under, higher and with a spin for people.
    const hop = Math.abs(Math.sin(p)) * (fast ? 26 : 16)
    const d: Dress = { skin: BROWN, hair: '#111827', shirt: '#a855f7', pants: '#1e3a8a' }
    ctx.save()
    ctx.translate(130, g - hop)
    ctx.scale(0.8, 0.8)
    standing(ctx, 0, 0, fast && Math.sin(p * 0.5) < 0 ? -1 : 1, d, { skirt: true, open: fast ? 0.8 : 0.2 })
    // Puffs of hair on top.
    dot(ctx, -12, -138, 9, '#111827')
    dot(ctx, 14, -138, 9, '#111827')
    arm(ctx, [-10, -96, -26, -84 - hop * 0.5, -32, -96 - hop], 8, d.skin)
    arm(ctx, [10, -96, 26, -84 - hop * 0.5, 32, -96 - hop], 8, d.skin)
    ctx.restore()
    if (back) rope(Math.PI, '#facc15')
    if (!back) rope(0, '#f472b6')
  }
}

const BUBBLE = { id: 'bubble', frames: 1, w: 360, h: 140 }

export const MAY_JUNE_ROWS: Record<string, SpriteRow[]> = {
  'litter-pickers': [
    { id: 'main', frames: 8, w: 200, h: 240, paint: litterPicker(false) },
    { id: 'wave', frames: 8, w: 200, h: 240, paint: litterPicker(true) },
    SPARKLE,
  ],
  'recycle-bins': [
    { id: 'main', frames: 4, w: 250, h: 200, paint: recycleBins(false) },
    { id: 'act', frames: 8, w: 250, h: 200, paint: recycleBins(true) },
    { ...BUBBLE, paint: saying('Recycle!') },
    SPARKLE,
  ],
  'rain-barrel': [
    { id: 'main', frames: 4, w: 230, h: 230, paint: rainBarrel(false, false) },
    { id: 'act', frames: 8, w: 230, h: 230, paint: rainBarrel(false, true) },
    { id: 'rain', frames: 4, w: 230, h: 230, paint: rainBarrel(true, false) },
    { id: 'splash', frames: 8, w: 230, h: 230, paint: rainBarrel(true, true) },
    { ...BUBBLE, paint: saying('Save every drop!') },
    SPARKLE,
  ],
  folklorico: [
    { id: 'main', frames: 4, w: 240, h: 250, paint: folklorico(false) },
    { id: 'act', frames: 8, w: 240, h: 250, paint: folklorico(true) },
    { ...BUBBLE, paint: saying('¡Viva México!') },
    SPARKLE,
  ],
  'pinata-party': [
    { id: 'main', frames: 4, w: 250, h: 250, paint: pinataParty(false) },
    { id: 'act', frames: 8, w: 250, h: 250, paint: pinataParty(true) },
    { ...BUBBLE, paint: saying('¡Dale, dale, dale!') },
    SPARKLE,
  ],
  'flowers-for-mom': [
    { id: 'main', frames: 4, w: 230, h: 250, paint: flowersForMom(false) },
    { id: 'act', frames: 8, w: 230, h: 250, paint: flowersForMom(true) },
    { ...BUBBLE, paint: saying('Happy Mother’s Day!') },
    SPARKLE,
  ],
  'breakfast-tray': [
    { id: 'main', frames: 8, w: 190, h: 240, paint: breakfastTray(false) },
    { id: 'wave', frames: 8, w: 190, h: 240, paint: breakfastTray(true) },
    SPARKLE,
  ],
  'mom-garden': [
    { id: 'main', frames: 8, w: 260, h: 220, paint: momGarden },
    SPARKLE,
  ],
  'saluting-soldier': [
    { id: 'main', frames: 4, w: 180, h: 270, paint: saluting(false) },
    { id: 'act', frames: 4, w: 180, h: 270, paint: saluting(true) },
    { ...BUBBLE, paint: saying('Thank you for remembering') },
    SPARKLE,
  ],
  'memorial-flag': [
    { id: 'main', frames: 6, w: 170, h: 300, paint: memorialFlag(false) },
    { id: 'half', frames: 6, w: 170, h: 300, paint: memorialFlag(true) },
    { ...BUBBLE, paint: saying('We remember') },
    SPARKLE,
  ],
  'grill-dad': [
    { id: 'main', frames: 4, w: 230, h: 250, paint: grillDad(false) },
    { id: 'act', frames: 8, w: 230, h: 250, paint: grillDad(true) },
    { ...BUBBLE, paint: saying('Who’s hungry?') },
    SPARKLE,
  ],
  'fishing-dock': [
    { id: 'main', frames: 4, w: 260, h: 220, paint: fishingDock(false) },
    { id: 'act', frames: 8, w: 260, h: 220, paint: fishingDock(true) },
    { ...BUBBLE, paint: saying('Got one!') },
    SPARKLE,
  ],
  'lawn-mower': [
    { id: 'main', frames: 8, w: 260, h: 220, paint: lawnMower(false) },
    { id: 'wave', frames: 8, w: 260, h: 220, paint: lawnMower(true) },
    SPARKLE,
  ],
  'order-reader': [
    { id: 'main', frames: 4, w: 200, h: 260, paint: orderReader(false) },
    { id: 'act', frames: 8, w: 200, h: 260, paint: orderReader(true) },
    { ...BUBBLE, paint: saying('Happy Juneteenth!') },
    SPARKLE,
  ],
  'juneteenth-flag': [
    { id: 'main', frames: 8, w: 220, h: 260, paint: flagBearer(false) },
    { id: 'wave', frames: 8, w: 220, h: 260, paint: flagBearer(true) },
    SPARKLE,
  ],
  'double-dutch': [
    { id: 'main', frames: 8, w: 260, h: 230, paint: doubleDutch(false) },
    { id: 'act', frames: 8, w: 260, h: 230, paint: doubleDutch(true) },
    SPARKLE,
  ],
}
