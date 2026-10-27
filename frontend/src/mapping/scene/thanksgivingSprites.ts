/**
 * Pictures for Thanksgiving: a giant turkey balloon from the parade, a
 * sousaphone player marching, the Mayflower, a wishbone being pulled,
 * geese flying south, a tom turkey fanning his tail, a turkey with a sign
 * and runners in the turkey trot.
 *
 * Painted the same way as sprites.ts: facing right, one frame at a time,
 * into a cell of w by h design units.
 */

import {
  circle, ellipse, glow, limb, rgba, saying, shade, SKIN, SPARKLE, TAU,
  type Ctx, type SpriteColors, type SpriteRow,
} from './sprites'

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

/** A turkey's fanned tail behind (cx, cy): bands of feathers, open from 0 (folded) to 1 (a full fan). */
function tailFan(ctx: Ctx, cx: number, cy: number, open: number, size: number, colours: string[]) {
  const spread = Math.PI * (0.25 + 0.75 * open)
  for (let b = colours.length - 1; b >= 0; b--) {
    ctx.fillStyle = colours[b]
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    const n = 13
    for (let k = 0; k <= n; k++) {
      const a = Math.PI / 2 + 0.25 - spread / 2 + (k / n) * spread
      const r = (size * (0.5 + b * 0.18)) * (k % 2 ? 1.06 : 1)
      ctx.lineTo(cx - Math.cos(a) * r * 0.9, cy - Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fill()
  }
  // Pale tips along the edge.
  ctx.fillStyle = '#fef3c7'
  for (let k = 0; k <= 13; k++) {
    const a = Math.PI / 2 + 0.25 - spread / 2 + (k / 13) * spread
    const r = size * (0.5 + (colours.length - 1) * 0.18)
    circle(ctx, cx - Math.cos(a) * r * 0.9, cy - Math.sin(a) * r, size * 0.035)
    ctx.fill()
  }
}

/** A turkey's head on its neck from (x, y) to the head at (hx, hy), facing right, wattle and snood. */
function turkeyHead(ctx: Ctx, x: number, y: number, hx: number, hy: number, puff: number) {
  ctx.strokeStyle = '#93c5fd'
  ctx.lineWidth = 14
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.quadraticCurveTo((x + hx) / 2 + 10, (y + hy) / 2, hx, hy + 8)
  ctx.stroke()
  ctx.fillStyle = '#bfdbfe'
  circle(ctx, hx, hy, 13)
  ctx.fill()
  ctx.fillStyle = '#facc15'
  ctx.beginPath()
  ctx.moveTo(hx + 10, hy - 3)
  ctx.lineTo(hx + 24, hy + 2)
  ctx.lineTo(hx + 10, hy + 6)
  ctx.fill()
  ctx.fillStyle = '#dc2626'
  ellipse(ctx, hx + 8, hy + 16 + puff * 4, 5 + puff * 2, 11 + puff * 6)
  ctx.fill()
  // The snood over the beak, long and red when he is showing off.
  ctx.beginPath()
  ctx.moveTo(hx + 8, hy - 8)
  ctx.quadraticCurveTo(hx + 20, hy - 6, hx + 18 + puff * 4, hy + 10 + puff * 10)
  ctx.lineWidth = 4 + puff * 2
  ctx.strokeStyle = '#ef4444'
  ctx.stroke()
  ctx.fillStyle = '#111'
  circle(ctx, hx + 3, hy - 3, 2.6)
  ctx.fill()
}

// -- a turkey balloon from the parade ---------------------------------------------------------------

function paradeBalloon(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const sway = Math.sin(p)
  // The handling ropes hanging down below it.
  ctx.strokeStyle = 'rgba(226,232,240,0.65)'
  ctx.lineWidth = 2
  for (let k = 0; k < 5; k++) {
    const x = 70 + k * 36
    ctx.beginPath()
    ctx.moveTo(x, 196)
    ctx.quadraticCurveTo(x + sway * 10, 230, x - 6 + sway * 14, 258)
    ctx.stroke()
  }
  // The tail, a fan of shiny panels with seams.
  tailFan(ctx, 120, 150, 1, 120, [color2, '#f59e0b', '#ea580c', '#facc15'].map((c, k) => shade(c, 0.05 * k)))
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 2
  for (let k = 0; k < 7; k++) {
    const a = 0.5 + k * 0.36
    ctx.beginPath()
    ctx.moveTo(120, 150)
    ctx.lineTo(120 - Math.cos(a) * 110, 150 - Math.sin(a) * 120)
    ctx.stroke()
  }
  // A big round shiny body, squashing a little as it floats.
  ctx.save()
  ctx.translate(140, 156)
  ctx.scale(1 + sway * 0.03, 1 - sway * 0.03)
  const g = ctx.createRadialGradient(-24, -24, 8, 0, 0, 70)
  g.addColorStop(0, shade(color, 0.45))
  g.addColorStop(0.5, color)
  g.addColorStop(1, shade(color, -0.35))
  ctx.fillStyle = g
  ellipse(ctx, 0, 0, 64, 50)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ellipse(ctx, -26, -26, 18, 9, -0.5)
  ctx.fill()
  ctx.fillStyle = shade(color, -0.15)
  ellipse(ctx, -14, 6, 30, 18, -0.4)
  ctx.fill()
  ctx.restore()
  // A pilgrim hat on the head, and a big smile.
  const hx = 218
  const hy = 96 + sway * 3
  ctx.strokeStyle = '#93c5fd'
  ctx.lineWidth = 22
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(186, 140)
  ctx.quadraticCurveTo(206, 120, hx, hy + 10)
  ctx.stroke()
  ctx.fillStyle = '#bfdbfe'
  circle(ctx, hx, hy, 24)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ellipse(ctx, hx - 8, hy - 10, 8, 4, -0.5)
  ctx.fill()
  ctx.fillStyle = '#facc15'
  ctx.beginPath()
  ctx.moveTo(hx + 18, hy - 2)
  ctx.lineTo(hx + 42, hy + 6)
  ctx.lineTo(hx + 18, hy + 12)
  ctx.fill()
  ctx.fillStyle = '#dc2626'
  ellipse(ctx, hx + 14, hy + 26, 7, 14)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, hx + 6, hy - 6, 5)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  circle(ctx, hx + 7, hy - 8, 1.8)
  ctx.fill()
  ctx.fillStyle = '#1f2937'
  ctx.fillRect(hx - 34, hy - 26, 60, 7)
  ctx.beginPath()
  ctx.moveTo(hx - 22, hy - 24)
  ctx.lineTo(hx - 18, hy - 64)
  ctx.lineTo(hx + 12, hy - 64)
  ctx.lineTo(hx + 16, hy - 24)
  ctx.fill()
  ctx.fillStyle = '#facc15'
  ctx.fillRect(hx - 12, hy - 38, 18, 12)
  ctx.fillStyle = '#1f2937'
  ctx.fillRect(hx - 7, hy - 34, 8, 4)
  // Feet hanging down.
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 7
  for (const x of [128, 156]) {
    ctx.beginPath()
    ctx.moveTo(x, 200)
    ctx.lineTo(x + sway * 3, 222)
    ctx.lineTo(x + 12 + sway * 3, 226)
    ctx.stroke()
  }
}

// -- a sousaphone player marching -------------------------------------------------------------------

function tubaPlayer(playing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const s = Math.sin(p)
    // High-stepping: the knee comes right up.
    const lift = (k: number) => Math.max(0, k)
    ctx.translate(0, -Math.abs(Math.cos(p)) * 4)
    for (const [x, k, col] of [[86, s, shade(color, -0.35)], [104, -s, shade(color, -0.2)]] as const) {
      const [fx, fy] = limb(ctx, x, 168, 34, 34, lift(k) * 1.4 - 0.1, -lift(k) * 1.6, 14, col)
      ctx.fillStyle = '#111827'
      rr(ctx, fx - 8, fy - 4, 22, 10, 4)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(fx - 6, fy - 8, 14, 4)
    }
    // Jacket with a stripe of braid, a sash.
    ctx.fillStyle = color
    rr(ctx, 70, 92, 50, 82, 10)
    ctx.fillStyle = color2
    ctx.fillRect(90, 92, 6, 82)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(70, 164, 50, 6)
    // Head, cheeks puffed when playing loud, and a tall shako with a plume.
    ctx.fillStyle = SKIN
    circle(ctx, 98, 72, 17)
    ctx.fill()
    if (playing) {
      ctx.fillStyle = rgba('#f43f5e', 0.55)
      circle(ctx, 106, 78, 7 + Math.abs(s) * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#111'
    circle(ctx, 106, 68, 2.2)
    ctx.fill()
    ctx.fillStyle = '#111827'
    ctx.fillRect(82, 32, 32, 30)
    ctx.fillStyle = color2
    ctx.fillRect(80, 56, 36, 6)
    ctx.fillRect(94, 38, 8, 8)
    ctx.fillStyle = '#111827'
    ctx.fillRect(84, 60, 30, 4)
    ctx.fillStyle = '#ffffff'
    ellipse(ctx, 98, 24, 6, 12, Math.sin(p) * 0.2)
    ctx.fill()
    // The sousaphone: round the body, over the shoulder, its great bell facing forward above the head.
    const bounce = playing ? Math.sin(p * 2) * 3 : 0
    const brass = '#facc15'
    ctx.strokeStyle = brass
    ctx.lineWidth = 12
    ctx.beginPath()
    ctx.ellipse(94, 132, 40, 26, -0.2, 0, TAU)
    ctx.stroke()
    ctx.strokeStyle = shade(brass, 0.4)
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.ellipse(94, 132, 40, 26, -0.2, Math.PI * 1.1, Math.PI * 1.7)
    ctx.stroke()
    ctx.strokeStyle = brass
    ctx.lineWidth = 12
    ctx.beginPath()
    ctx.moveTo(60, 120)
    ctx.quadraticCurveTo(48, 70, 100, 54 + bounce)
    ctx.stroke()
    // Mouthpiece to the lips.
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(120, 112)
    ctx.quadraticCurveTo(126, 92, 112, 80)
    ctx.stroke()
    ctx.save()
    ctx.translate(126, 48 + bounce)
    ctx.rotate(-0.15)
    const bg = ctx.createRadialGradient(0, 0, 4, 0, 0, 44)
    bg.addColorStop(0, '#a16207')
    bg.addColorStop(0.6, shade(brass, 0.2))
    bg.addColorStop(1, shade(brass, -0.1))
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.moveTo(-34, -6)
    ctx.quadraticCurveTo(0, -10, 30, -40)
    ctx.lineTo(30, 40)
    ctx.quadraticCurveTo(0, 10, -34, 8)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#854d0e'
    ellipse(ctx, 30, 0, 9, 40)
    ctx.fill()
    ctx.fillStyle = shade(brass, 0.3)
    ellipse(ctx, 32, 0, 5, 36)
    ctx.fill()
    ctx.restore()
    if (playing) {
      // Blasts of sound out of the bell.
      ctx.strokeStyle = rgba(color2, 0.9)
      ctx.lineWidth = 3
      for (let k = 0; k < 3; k++) {
        const r = 14 + k * 12 + Math.abs(s) * 6
        ctx.beginPath()
        ctx.arc(158, 48 + bounce, r, -0.6, 0.6)
        ctx.stroke()
      }
    }
    // Hands on the valves.
    const [hx, hy] = limb(ctx, 114, 104, 18, 18, 1.2, 0.8, 11, color)
    ctx.fillStyle = '#f8fafc'
    circle(ctx, hx, hy, 6)
    ctx.fill()
  }
}

// -- the Mayflower ----------------------------------------------------------------------------------

function mayflower(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const billow = 0.6 + 0.4 * Math.sin(p)
  const wood = color
  // Masts and rigging.
  ctx.strokeStyle = shade(wood, -0.3)
  ctx.lineWidth = 6
  for (const [x, top] of [[96, 50], [170, 26], [236, 70]] as const) {
    ctx.beginPath()
    ctx.moveTo(x, 210)
    ctx.lineTo(x, top)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(226,232,240,0.45)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(20, 180)
  ctx.lineTo(96, 50)
  ctx.lineTo(170, 26)
  ctx.lineTo(236, 70)
  ctx.lineTo(300, 160)
  ctx.moveTo(310, 150)
  ctx.lineTo(236, 70)
  ctx.stroke()
  // Sails, square ones bellied out by the wind.
  const sail = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = '#f5f0e1'
    ctx.beginPath()
    ctx.moveTo(x - w / 2, y)
    ctx.lineTo(x + w / 2, y)
    ctx.quadraticCurveTo(x + w / 2 + 12 * billow, y + h / 2, x + w / 2, y + h)
    ctx.lineTo(x - w / 2, y + h)
    ctx.quadraticCurveTo(x - w / 2 + 12 * billow, y + h / 2, x - w / 2, y)
    ctx.fill()
    ctx.strokeStyle = '#d6cfb8'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + 10 * billow, y + h / 2, x, y + h)
    ctx.stroke()
    ctx.strokeStyle = shade(wood, -0.3)
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(x - w / 2 - 4, y)
    ctx.lineTo(x + w / 2 + 4, y)
    ctx.stroke()
  }
  sail(96, 64, 60, 50)
  sail(96, 120, 70, 54)
  sail(170, 40, 66, 54)
  sail(170, 100, 80, 62)
  // The lateen sail on the mizzen.
  ctx.fillStyle = '#f5f0e1'
  ctx.beginPath()
  ctx.moveTo(236, 76)
  ctx.lineTo(276, 160)
  ctx.quadraticCurveTo(250, 150 - 10 * billow, 214, 160)
  ctx.closePath()
  ctx.fill()
  // Pennants streaming from the tops.
  for (const [x, top] of [[96, 50], [170, 26], [236, 70]] as const) {
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.quadraticCurveTo(x + 20, top + 2 + Math.sin(p + x) * 4, x + 34, top + 4)
    ctx.lineTo(x, top + 10)
    ctx.fill()
  }
  // The hull: high at the stern (left), a beakhead at the bow (right).
  const g = ctx.createLinearGradient(0, 196, 0, 262)
  g.addColorStop(0, shade(wood, 0.15))
  g.addColorStop(1, shade(wood, -0.35))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(30, 166)
  ctx.lineTo(70, 166)
  ctx.lineTo(74, 200)
  ctx.lineTo(250, 204)
  ctx.lineTo(296, 186)
  ctx.lineTo(312, 192)
  ctx.lineTo(276, 214)
  ctx.quadraticCurveTo(260, 262, 210, 264)
  ctx.lineTo(80, 264)
  ctx.quadraticCurveTo(44, 260, 34, 220)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#facc15'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(40, 220)
  ctx.lineTo(270, 222)
  ctx.stroke()
  ctx.fillStyle = '#1c1917'
  for (let k = 0; k < 6; k++) {
    rr(ctx, 90 + k * 28, 230, 12, 10, 2)
  }
  // Lit stern windows.
  for (let k = 0; k < 3; k++) {
    glow(ctx, 44 + k * 10, 186, 9, '#fbbf24', 0.6)
    ctx.fillStyle = '#fde68a'
    ctx.fillRect(40 + k * 10, 180, 7, 12)
  }
  // Waves rolling past along the bottom.
  ctx.fillStyle = '#1d4ed8'
  ctx.beginPath()
  ctx.moveTo(0, 300)
  for (let x = 0; x <= 320; x += 10) ctx.lineTo(x, 262 + Math.sin(x * 0.06 + p) * 6)
  ctx.lineTo(320, 300)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#bfdbfe'
  ctx.lineWidth = 3
  ctx.beginPath()
  for (let x = 0; x <= 320; x += 10) ctx.lineTo(x, 262 + Math.sin(x * 0.06 + p) * 6)
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  for (let k = 0; k < 4; k++) {
    circle(ctx, 290 + Math.sin(p + k) * 6, 250 + k * 4, 4 - k * 0.6)
    ctx.fill()
  }
}

// -- a wishbone -------------------------------------------------------------------------------------

function wishbone(pulling: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    // Tugging to and fro, then pulled until it snaps (from frame 5 of 8), the winner holding up the big half.
    const tug = pulling ? Math.min(1, p / 0.6) : 0.15 + 0.1 * Math.sin(p * TAU)
    const snapped = pulling && p >= 0.62
    const bone = '#f5e6c8'
    const cx = 130
    const cy = 96
    const spread = 18 + tug * 26
    const hand = (x: number, y: number, d: number, sleeve: string) => {
      // An arm reaching in from the side, fingers round the end.
      ctx.fillStyle = sleeve
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(d * -0.2)
      rr(ctx, d > 0 ? 6 : -90, -12, 84, 24, 10)
      ctx.fillStyle = '#ffffff'
      rr(ctx, d > 0 ? 4 : -10, -13, 8, 26, 3)
      ctx.fillStyle = SKIN
      ellipse(ctx, 0, 0, 13, 15)
      ctx.fill()
      ctx.strokeStyle = shade(SKIN, -0.2)
      ctx.lineWidth = 2
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath()
        ctx.moveTo(-d * 6, k * 6)
        ctx.lineTo(-d * 12, k * 6)
        ctx.stroke()
      }
      ctx.restore()
    }
    if (!snapped) {
      // The bone: a V, its point at the bottom, the two ends pulled apart.
      ctx.strokeStyle = bone
      ctx.lineWidth = 9
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(cx - spread * 2, cy - 30)
      ctx.quadraticCurveTo(cx - spread, cy + 20, cx, cy + 40)
      ctx.quadraticCurveTo(cx + spread, cy + 20, cx + spread * 2, cy - 30)
      ctx.stroke()
      ctx.fillStyle = bone
      ellipse(ctx, cx, cy + 40, 9, 7)
      ctx.fill()
      hand(cx - spread * 2 - 4, cy - 34, -1, color)
      hand(cx + spread * 2 + 4, cy - 34, 1, color2)
      if (pulling && p > 0.45) {
        // About to go.
        ctx.strokeStyle = '#fde047'
        ctx.lineWidth = 2
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * TAU + 0.3
          ctx.beginPath()
          ctx.moveTo(cx + Math.cos(a) * 12, cy + 30 + Math.sin(a) * 12)
          ctx.lineTo(cx + Math.cos(a) * 20, cy + 30 + Math.sin(a) * 20)
          ctx.stroke()
        }
      }
    } else {
      const k = (p - 0.62) / 0.38
      // The left hand drops back with the little piece; the right lifts the big one, with a sparkle.
      ctx.strokeStyle = bone
      ctx.lineWidth = 9
      ctx.lineCap = 'round'
      const lx = cx - 70 - k * 10
      const ly = cy - 20 + k * 20
      ctx.beginPath()
      ctx.moveTo(lx, ly)
      ctx.lineTo(lx + 22, ly + 30)
      ctx.stroke()
      hand(lx - 4, ly - 4, -1, color)
      const rx = cx + 64
      const ry = cy - 34 - k * 30
      ctx.beginPath()
      ctx.moveTo(rx, ry)
      ctx.quadraticCurveTo(rx - 24, ry + 40, rx - 50, ry + 64)
      ctx.quadraticCurveTo(rx - 40, ry + 70, rx - 30, ry + 64)
      ctx.stroke()
      hand(rx + 4, ry - 4, 1, color2)
      glow(ctx, rx - 44, ry + 60, 26, '#fde047', 0.8)
      ctx.fillStyle = '#fef9c3'
      ctx.beginPath()
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * TAU
        const r = j % 2 ? 4 : 12
        ctx.lineTo(rx - 44 + Math.cos(a) * r, ry + 60 + Math.sin(a) * r)
      }
      ctx.fill()
    }
  }
}

// -- geese flying south -----------------------------------------------------------------------------

function goose(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const flap = Math.sin((f / frames) * TAU)
  const body = color
  // The far wing.
  ctx.fillStyle = shade(body, -0.25)
  ctx.beginPath()
  ctx.moveTo(100, 66)
  ctx.quadraticCurveTo(84, 40 - flap * 30, 60, 20 - flap * 40)
  ctx.quadraticCurveTo(96, 42 - flap * 12, 124, 62)
  ctx.closePath()
  ctx.fill()
  // Body, pale underneath, white at the tail.
  ctx.fillStyle = body
  ellipse(ctx, 104, 74, 48, 17, -0.05)
  ctx.fill()
  ctx.fillStyle = shade(body, 0.45)
  ellipse(ctx, 110, 82, 34, 8)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ellipse(ctx, 58, 76, 10, 6)
  ctx.fill()
  ctx.fillStyle = shade(body, -0.4)
  ctx.beginPath()
  ctx.moveTo(60, 70)
  ctx.lineTo(40, 66)
  ctx.lineTo(44, 80)
  ctx.closePath()
  ctx.fill()
  // The long dark neck and head, a white chinstrap.
  ctx.strokeStyle = color2
  ctx.lineWidth = 9
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(140, 70)
  ctx.quadraticCurveTo(160, 64, 178, 62)
  ctx.stroke()
  ctx.fillStyle = color2
  ellipse(ctx, 184, 60, 11, 8)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ellipse(ctx, 180, 64, 6, 4, 0.3)
  ctx.fill()
  ctx.fillStyle = shade(color2, -0.3)
  ctx.beginPath()
  ctx.moveTo(192, 58)
  ctx.lineTo(206, 62)
  ctx.lineTo(192, 64)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  circle(ctx, 187, 57, 1.6)
  ctx.fill()
  // The near wing.
  ctx.fillStyle = shade(body, 0.1)
  ctx.beginPath()
  ctx.moveTo(96, 70)
  ctx.quadraticCurveTo(90, 50 - flap * 40, 54, 30 - flap * 70)
  ctx.quadraticCurveTo(70, 56 - flap * 30, 64, 58 - flap * 20)
  ctx.quadraticCurveTo(100, 66, 128, 70)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = shade(body, -0.3)
  ctx.lineWidth = 1.5
  for (let k = 0; k < 3; k++) {
    ctx.beginPath()
    ctx.moveTo(84 - k * 8, 62 - flap * (20 + k * 12))
    ctx.lineTo(70 - k * 8, 48 - flap * (34 + k * 14))
    ctx.stroke()
  }
}

// -- a tom turkey fanning his tail ------------------------------------------------------------------

function strut(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  // From walking about with his tail down to puffed right up, tail in a full fan, wattle bright red.
  const level = f / (frames - 1)
  const puff = level
  // Legs.
  limb(ctx, 112, 172, 26, 28, 0.1, -0.1, 7, '#d97706')
  limb(ctx, 132, 172, 26, 28, -0.1, 0.1, 7, '#f59e0b')
  // The tail rising from down behind to a full fan.
  ctx.save()
  ctx.translate(104, 140)
  ctx.rotate(-(1 - level) * 1.2)
  tailFan(ctx, 0, 0, 0.2 + 0.8 * level, 70 + 50 * level, [color2, '#b45309', '#7c2d12', '#facc15'])
  ctx.restore()
  // Body, feathers fluffed out as he puffs up; wings dropped to drag on the ground.
  const g = ctx.createRadialGradient(124, 126, 10, 124, 136, 60)
  g.addColorStop(0, shade(color, 0.25))
  g.addColorStop(1, shade(color, -0.3))
  ctx.fillStyle = g
  ellipse(ctx, 124, 138, 44 + puff * 12, 36 + puff * 10)
  ctx.fill()
  ctx.strokeStyle = shade(color, -0.35)
  ctx.lineWidth = 2
  for (let k = 0; k < 10; k++) {
    const x = 100 + (k % 5) * 12
    const y = 124 + Math.floor(k / 5) * 16
    ctx.beginPath()
    ctx.arc(x, y, 6, 0.2, Math.PI - 0.2)
    ctx.stroke()
  }
  ctx.fillStyle = shade(color, -0.2)
  ctx.beginPath()
  ctx.moveTo(100, 132)
  ctx.quadraticCurveTo(120, 150 + puff * 10, 150, 150 + puff * 22)
  ctx.lineTo(96, 160 + puff * 16)
  ctx.closePath()
  ctx.fill()
  // The beard hanging from his chest.
  ctx.strokeStyle = '#1c1917'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(158, 130)
  ctx.lineTo(160, 152)
  ctx.moveTo(161, 130)
  ctx.lineTo(164, 150)
  ctx.stroke()
  // Head: pulled in when he struts.
  turkeyHead(ctx, 152, 116, 176 - puff * 10, 74 + puff * 14, puff)
}

// -- a turkey holding up a sign ---------------------------------------------------------------------

function signTurkey(holding: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const s = Math.sin(p)
    const peck = holding ? 0 : Math.max(0, Math.sin(p * 2))
    const hop = holding ? Math.abs(s) * 6 : 0
    ctx.translate(0, -hop)
    limb(ctx, 96, 206, 24, 28, 0.15, -0.15, 7, '#d97706')
    limb(ctx, 116, 206, 24, 28, -0.15, 0.15, 7, '#f59e0b')
    tailFan(ctx, 86, 176, 0.75, 92, ['#b45309', '#7c2d12', '#ea580c', '#facc15'])
    const g = ctx.createRadialGradient(106, 164, 10, 106, 172, 50)
    g.addColorStop(0, shade(color, 0.25))
    g.addColorStop(1, shade(color, -0.3))
    ctx.fillStyle = g
    ellipse(ctx, 106, 174, 40, 34)
    ctx.fill()
    if (holding) {
      // A sign on a stick, held up in its wings, bobbing.
      ctx.fillStyle = '#92400e'
      ctx.fillRect(120, 44 + s * 3, 7, 150)
      ctx.save()
      ctx.translate(124, 54 + s * 3)
      ctx.rotate(s * 0.05)
      ctx.fillStyle = '#fef3c7'
      rr(ctx, -70, -40, 140, 74, 6)
      ctx.strokeStyle = '#92400e'
      ctx.lineWidth = 4
      ctx.strokeRect(-66, -36, 132, 66)
      ctx.fillStyle = color2
      ctx.font = 'bold 22px Georgia, serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('EAT MORE', 0, -14)
      ctx.fillText('PIE!', 0, 14)
      ctx.restore()
      ctx.fillStyle = shade(color, -0.15)
      ellipse(ctx, 124, 160, 12, 22, 0.3)
      ctx.fill()
      turkeyHead(ctx, 128, 156, 152, 120, 0.5)
    } else {
      ctx.fillStyle = shade(color, -0.15)
      ellipse(ctx, 100, 176, 26, 16, -0.3)
      ctx.fill()
      // Pecking at the grass now and then, looking round between.
      turkeyHead(ctx, 132, 160, 150 + peck * 20, 116 + peck * 80, 0.2)
    }
  }
}

// -- runners in the turkey trot ---------------------------------------------------------------------

function trotRunner(cheering: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const s = Math.sin(p)
    ctx.translate(0, -Math.abs(Math.sin(p)) * 8)
    // Legs: a running stride, knees up.
    for (const [k, col] of [[-s, shade(SKIN, -0.2)], [s, SKIN]] as const) {
      const [fx, fy] = limb(ctx, 100, 158, 36, 36, k * 0.8, Math.max(0, -k) * 1.5 + 0.2, 12, col)
      ctx.fillStyle = color2
      rr(ctx, fx - 8, fy - 4, 24, 10, 4)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(fx - 6, fy + 4, 22, 3)
    }
    // Shorts and running shirt with a race number.
    ctx.fillStyle = '#1f2937'
    rr(ctx, 84, 148, 34, 22, 6)
    // Far arm.
    if (cheering) limb(ctx, 92, 102, 26, 24, Math.PI - 0.4 + s * 0.1, -0.3, 10, shade(SKIN, -0.2))
    else limb(ctx, 92, 104, 26, 22, s * 0.8, -1.4, 10, shade(SKIN, -0.2))
    ctx.fillStyle = color
    rr(ctx, 82, 96, 38, 58, 10)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(90, 114, 24, 18)
    ctx.fillStyle = '#111'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('1127', 102, 124)
    // Head, smiling, and a plush turkey hat with drumstick legs flopping.
    ctx.fillStyle = SKIN
    circle(ctx, 106, 76, 17)
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, 114, 74, 2.2)
    ctx.fill()
    ctx.strokeStyle = '#7c2d12'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(112, 80, 6, 0.2, Math.PI - 0.4)
    ctx.stroke()
    // A plush roast turkey hat: drumsticks flopping down by the ears.
    for (const [x, a] of [[86, 0.35 + s * 0.25], [124, -0.35 - s * 0.25]] as const) {
      ctx.save()
      ctx.translate(x, 60)
      ctx.rotate(a)
      ctx.fillStyle = '#c2410c'
      rr(ctx, -6, 0, 12, 26, 6)
      ctx.fillStyle = '#ffffff'
      circle(ctx, 0, 30, 5)
      ctx.fill()
      ctx.restore()
    }
    const hat = ctx.createRadialGradient(98, 50, 4, 104, 58, 26)
    hat.addColorStop(0, '#f59e0b')
    hat.addColorStop(1, '#b45309')
    ctx.fillStyle = hat
    ctx.beginPath()
    ctx.ellipse(104, 62, 25, 18, 0, Math.PI, 0)
    ctx.quadraticCurveTo(104, 50, 79, 62)
    ctx.fill()
    ctx.fillStyle = '#fde68a'
    ellipse(ctx, 96, 50, 7, 3, -0.4)
    ctx.fill()
    // Near arm: pumping, or both up cheering.
    const a1 = cheering ? Math.PI - 0.75 + s * 0.15 : -s * 0.8
    const [hx, hy] = limb(ctx, 112, 104, 26, 24, a1, cheering ? 0.2 : -1.4, 10, SKIN)
    ctx.fillStyle = SKIN
    circle(ctx, hx, hy, 6)
    ctx.fill()
  }
}

const BUBBLE = { id: 'bubble', frames: 1, w: 360, h: 140 }

export const THANKSGIVING_ROWS: Record<string, SpriteRow[]> = {
  'parade-balloons': [{ id: 'main', frames: 4, w: 290, h: 260, paint: paradeBalloon }, SPARKLE],
  'tuba-players': [
    { id: 'main', frames: 8, w: 200, h: 240, paint: tubaPlayer(false) },
    { id: 'wave', frames: 8, w: 200, h: 240, paint: tubaPlayer(true) },
    { ...BUBBLE, paint: saying('Oom-pah-pah!') },
    SPARKLE,
  ],
  mayflower: [
    { id: 'main', frames: 4, w: 320, h: 300, paint: mayflower },
    { ...BUBBLE, paint: saying('Land ho!') },
    SPARKLE,
  ],
  wishbone: [
    { id: 'main', frames: 4, w: 260, h: 170, paint: wishbone(false) },
    { id: 'act', frames: 8, w: 260, h: 170, paint: wishbone(true) },
    { ...BUBBLE, paint: saying('Make a wish!') },
    SPARKLE,
  ],
  geese: [
    { id: 'main', frames: 8, w: 220, h: 120, paint: goose },
    { ...BUBBLE, paint: saying('Honk honk!') },
    SPARKLE,
  ],
  // Tail down, to puffed up in a full fan.
  'strutting-tom': [
    { id: 'main', frames: 8, w: 240, h: 230, paint: strut },
    { ...BUBBLE, paint: saying('Gobble gobble!') },
    SPARKLE,
  ],
  'sign-turkey': [
    { id: 'main', frames: 6, w: 220, h: 240, paint: signTurkey(false) },
    { id: 'act', frames: 6, w: 220, h: 240, paint: signTurkey(true) },
    SPARKLE,
  ],
  'turkey-trot': [
    { id: 'main', frames: 8, w: 200, h: 240, paint: trotRunner(false) },
    { id: 'wave', frames: 8, w: 200, h: 240, paint: trotRunner(true) },
    { ...BUBBLE, paint: saying('Gobble wobble!') },
    SPARKLE,
  ],
}
