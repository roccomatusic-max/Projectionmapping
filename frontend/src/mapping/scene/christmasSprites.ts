/**
 * More pictures for Christmas: a nutcracker that cracks walnuts, a wreath
 * that sings, mistletoe, a gingerbread house that lights up, an elf in the
 * workshop, a snowman that melts when it is really warm, Santa looking out
 * of a window and Santa stuck in the chimney, Krampus, children making snow
 * angels, a yeti, a mailbox for letters to the North Pole, a bell ringer,
 * cookies left out for Santa, a moose with lights in its antlers, sugar plum
 * fairies, a nativity, penguins fishing through the ice, lit lawn reindeer,
 * a blow-up Santa, an elf hanging the lights and a one-horse open sleigh.
 *
 * Painted the same way as sprites.ts: facing right, one frame at a time,
 * into a cell of w by h design units.
 */

import { note } from './halloweenSprites'
import {
  circle, ellipse, FUR, glow, heartPath, limb, rgba, ribbon, saying, shade, SKIN, SPARKLE, TAU,
  type Ctx, type SpriteColors, type SpriteRow,
} from './sprites'

/** A number from 0 to 1 that is always the same for the same n (for painting the same needles every frame). */
function noise(n: number): number {
  const s = Math.sin(n * 91.345 + 47.853) * 43758.5453
  return s - Math.floor(s)
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

/** Little coloured bulbs along a sagging wire from (x1, y1) to (x2, y2); lit is how many of them (0 to 1) are on. */
function bulbs(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, count: number, sag: number, lit: number, twinkle = 0) {
  const colours = ['#ef4444', '#22c55e', '#facc15', '#3b82f6', '#f97316']
  ctx.strokeStyle = '#14532d'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + sag * 2, x2, y2)
  ctx.stroke()
  for (let k = 0; k < count; k++) {
    const u = (k + 0.5) / count
    const x = (1 - u) * (1 - u) * x1 + 2 * u * (1 - u) * ((x1 + x2) / 2) + u * u * x2
    const y = (1 - u) * (1 - u) * y1 + 2 * u * (1 - u) * ((y1 + y2) / 2 + sag * 2) + u * u * y2
    const on = u <= lit + 1e-6
    const c = colours[k % colours.length]
    if (on) glow(ctx, x, y + 5, 12, c, 0.55 + 0.3 * Math.sin(twinkle + k * 2.1))
    ctx.fillStyle = on ? shade(c, 0.35) : shade(c, -0.55)
    ellipse(ctx, x, y + 5, 3.6, 5.5)
    ctx.fill()
  }
}

// -- a nutcracker -----------------------------------------------------------------------------------

function nutcracker(cracking: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    // The jaw drops open and a walnut goes in, then it snaps shut and the pieces fall.
    const open = cracking ? (p < 0.5 ? Math.sin((p / 0.5) * (Math.PI / 2)) : Math.max(0, 1 - (p - 0.5) / 0.1)) : 0
    const blink = !cracking && f === frames - 1
    // The stand.
    ctx.fillStyle = '#92400e'
    rr(ctx, 24, 282, 112, 16, 5)
    ctx.fillStyle = '#b45309'
    rr(ctx, 24, 282, 112, 5, 3)
    // White breeches and tall black boots.
    for (const x of [62, 98]) {
      ctx.fillStyle = '#f1f5f9'
      rr(ctx, x - 13, 196, 26, 56, 6)
      ctx.fillStyle = '#cbd5e1'
      ctx.fillRect(x + 5, 198, 7, 50)
      ctx.fillStyle = '#1f2937'
      rr(ctx, x - 15, 244, 30, 40, 6)
      ctx.fillStyle = '#4b5563'
      ctx.fillRect(x - 15, 248, 30, 4)
    }
    // Coat, belt, the gold braid across the chest and epaulettes.
    const g = ctx.createLinearGradient(40, 0, 120, 0)
    g.addColorStop(0, shade(color, -0.25))
    g.addColorStop(0.45, shade(color, 0.1))
    g.addColorStop(1, shade(color, -0.3))
    ctx.fillStyle = g
    rr(ctx, 40, 124, 80, 86, 12)
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(40, 182, 80, 10)
    ctx.fillStyle = color2
    rr(ctx, 73, 179, 14, 16, 3)
    ctx.strokeStyle = color2
    ctx.lineWidth = 2.5
    for (let k = 0; k < 4; k++) {
      ctx.beginPath()
      ctx.moveTo(64, 138 + k * 11)
      ctx.lineTo(96, 138 + k * 11)
      ctx.stroke()
      ctx.fillStyle = color2
      circle(ctx, 80, 138 + k * 11, 3.2)
      ctx.fill()
    }
    for (const x of [42, 118]) {
      ctx.fillStyle = color2
      ellipse(ctx, x, 128, 15, 7)
      ctx.fill()
      ctx.strokeStyle = shade(color2, -0.2)
      ctx.lineWidth = 2
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath()
        ctx.moveTo(x + k * 5, 133)
        ctx.lineTo(x + k * 5, 142)
        ctx.stroke()
      }
    }
    // Arms down by his sides, white gloves; a gold sceptre in one hand.
    ctx.fillStyle = shade(color, -0.15)
    rr(ctx, 25, 130, 17, 62, 8)
    rr(ctx, 118, 130, 17, 62, 8)
    ctx.fillStyle = color2
    ctx.fillRect(130, 150, 5, 74)
    circle(ctx, 132, 148, 6)
    ctx.fill()
    ctx.fillStyle = '#f8fafc'
    circle(ctx, 33, 196, 9)
    ctx.fill()
    circle(ctx, 127, 196, 9)
    ctx.fill()
    // The big square head, white hair at the sides.
    ctx.fillStyle = '#f5d0b0'
    rr(ctx, 46, 62, 68, 46, 10)
    ctx.fillStyle = FUR
    rr(ctx, 38, 66, 14, 54, 7)
    rr(ctx, 108, 66, 14, 54, 7)
    // Eyes, rosy cheeks, nose, moustache.
    for (const x of [66, 94]) {
      if (blink) {
        ctx.strokeStyle = '#1f2937'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(x - 7, 80)
        ctx.lineTo(x + 7, 80)
        ctx.stroke()
      } else {
        ctx.fillStyle = '#ffffff'
        ellipse(ctx, x, 80, 7, 8)
        ctx.fill()
        ctx.fillStyle = '#1d4ed8'
        circle(ctx, x + (cracking ? 0 : 1), 81, 4)
        ctx.fill()
        ctx.fillStyle = '#111'
        circle(ctx, x + (cracking ? 0 : 1), 81, 2)
        ctx.fill()
      }
      ctx.strokeStyle = '#1f2937'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(x - 9, 68 - (cracking ? open * 4 : 0))
      ctx.lineTo(x + 9, 70 - (cracking ? open * 4 : 0))
      ctx.stroke()
      ctx.fillStyle = rgba('#f43f5e', 0.45)
      circle(ctx, x + (x < 80 ? -6 : 6), 94, 6)
      ctx.fill()
    }
    ctx.fillStyle = '#e8b48f'
    ellipse(ctx, 80, 90, 6, 8)
    ctx.fill()
    // The mouth: a dark hole that opens as the jaw drops, with a row of big teeth at the top.
    const jaw = open * 26
    ctx.fillStyle = '#450a0a'
    ctx.fillRect(54, 104, 52, jaw + 2)
    ctx.fillStyle = '#ffffff'
    for (let k = 0; k < 5; k++) rr(ctx, 56 + k * 10, 103, 8, 7, 2)
    if (cracking && p > 0.12 && p < 0.55) {
      // The walnut, in the open mouth.
      ctx.fillStyle = '#a16207'
      ellipse(ctx, 80, 106 + jaw / 2, 11, 10)
      ctx.fill()
      ctx.strokeStyle = '#713f12'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(80, 97 + jaw / 2)
      ctx.quadraticCurveTo(76, 106 + jaw / 2, 80, 115 + jaw / 2)
      ctx.stroke()
    }
    ctx.fillStyle = FUR
    ctx.beginPath()
    ctx.moveTo(56, 102)
    ctx.quadraticCurveTo(68, 94, 80, 101)
    ctx.quadraticCurveTo(92, 94, 104, 102)
    ctx.quadraticCurveTo(92, 108, 80, 104)
    ctx.quadraticCurveTo(68, 108, 56, 102)
    ctx.fill()
    // The lower jaw and beard, dropping.
    ctx.save()
    ctx.translate(0, jaw)
    ctx.fillStyle = '#f5d0b0'
    rr(ctx, 50, 106, 60, 16, 6)
    ctx.fillStyle = '#ffffff'
    for (let k = 0; k < 5; k++) rr(ctx, 56 + k * 10, 104, 8, 6, 2)
    ctx.fillStyle = FUR
    ctx.beginPath()
    ctx.moveTo(46, 114)
    ctx.quadraticCurveTo(80, 128, 114, 114)
    ctx.quadraticCurveTo(108, 140, 80, 146)
    ctx.quadraticCurveTo(52, 140, 46, 114)
    ctx.fill()
    ctx.restore()
    if (cracking && p >= 0.5) {
      // The cracked shell falling away.
      const k = (p - 0.5) / 0.5
      ctx.fillStyle = '#a16207'
      for (let j = 0; j < 3; j++) {
        ctx.save()
        ctx.translate(80 + (j - 1) * (8 + 30 * k), 120 + k * k * 150)
        ctx.rotate((j - 1) * k * 3)
        ctx.beginPath()
        ctx.arc(0, 0, 7, 0, Math.PI)
        ctx.fill()
        ctx.restore()
      }
    }
    // A tall black shako with a gold band, a badge and a white plume.
    ctx.fillStyle = '#1f2937'
    ctx.beginPath()
    ctx.moveTo(44, 66)
    ctx.lineTo(48, 12)
    ctx.lineTo(112, 12)
    ctx.lineTo(116, 66)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#374151'
    ctx.fillRect(50, 14, 10, 50)
    ctx.fillStyle = color2
    ctx.fillRect(44, 56, 72, 8)
    ctx.fillRect(46, 12, 68, 5)
    ctx.beginPath()
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU - Math.PI / 2
      const r = k % 2 ? 6 : 14
      ctx.lineTo(80 + Math.cos(a) * r, 36 + Math.sin(a) * r)
    }
    ctx.fill()
    ctx.fillStyle = FUR
    ellipse(ctx, 80, 9, 8, 8, cracking ? Math.sin(p * TAU) * 0.2 : 0)
    ctx.fill()
  }
}

// -- a singing wreath -------------------------------------------------------------------------------

function wreath(singing: boolean) {
  return (ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) => {
    const cx = 100
    const cy = 92
    const mouth = singing ? [0.35, 0.9, 0.55, 1, 0.4, 0.85, 0.25, 0.7][f % 8] : 0
    // The ring of fir, tuft by tuft, darker underneath.
    ctx.fillStyle = shade(color, -0.45)
    circle(ctx, cx, cy, 80)
    ctx.arc(cx, cy, 34, 0, TAU, true)
    ctx.fill('evenodd')
    for (let k = 0; k < 120; k++) {
      const a = noise(k) * TAU
      const r = 40 + noise(k + 300) * 36
      const x = cx + Math.cos(a) * r
      const y = cy + Math.sin(a) * r
      ctx.fillStyle = shade(color, -0.3 + noise(k + 600) * 0.55)
      ellipse(ctx, x, y, 13, 4.5, a + Math.PI / 2 + (noise(k + 900) - 0.5))
      ctx.fill()
    }
    // Pine cones and berries.
    for (const a of [0.6, 2.5, 4.1]) {
      ctx.fillStyle = '#92400e'
      ellipse(ctx, cx + Math.cos(a) * 60, cy + Math.sin(a) * 60, 7, 10, a)
      ctx.fill()
    }
    for (let k = 0; k < 9; k++) {
      const a = 0.3 + k * 0.7
      ctx.fillStyle = '#dc2626'
      circle(ctx, cx + Math.cos(a) * 70, cy + Math.sin(a) * 70, 4)
      ctx.fill()
    }
    // Twinkling lights round it.
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU + 0.2
      const on = (k + f) % 3 !== 0
      const x = cx + Math.cos(a) * 52
      const y = cy + Math.sin(a) * 52
      if (on) glow(ctx, x, y, 10, color2, 0.7)
      ctx.fillStyle = on ? shade(color2, 0.4) : shade(color2, -0.4)
      circle(ctx, x, y, 3.2)
      ctx.fill()
    }
    // A face: eyes in the fir above the middle, the middle itself the mouth.
    const look = singing ? 0 : [0, -1, 1, 0][f % 4]
    for (const d of [-1, 1]) {
      const ex = cx + d * 24
      ctx.fillStyle = '#ffffff'
      ellipse(ctx, ex, 44, 11, singing ? 12 : 11)
      ctx.fill()
      if (!singing && f % 4 === 3) {
        ctx.fillStyle = shade(color, -0.2)
        ellipse(ctx, ex, 44, 11, 11)
        ctx.fill()
        ctx.strokeStyle = '#111'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.arc(ex, 42, 8, 0.3, Math.PI - 0.3)
        ctx.stroke()
      } else {
        ctx.fillStyle = '#111'
        circle(ctx, ex + look * 4, 46 - mouth * 2, 5)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        circle(ctx, ex + look * 4 - 1.5, 44 - mouth * 2, 1.6)
        ctx.fill()
      }
      // Eyebrows that go up with the high notes.
      ctx.strokeStyle = shade(color, -0.6)
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(ex - 9, 28 - mouth * 6)
      ctx.lineTo(ex + 9, 28 - mouth * 6 + d * 2)
      ctx.stroke()
    }
    if (singing) {
      // Wide open, singing, the tongue showing.
      ctx.fillStyle = '#7f1d1d'
      ellipse(ctx, cx, cy + 6, 28, 8 + mouth * 22)
      ctx.fill()
      ctx.fillStyle = '#f87171'
      ellipse(ctx, cx, cy + 10 + mouth * 14, 16, 4 + mouth * 6)
      ctx.fill()
      ctx.strokeStyle = shade(color, -0.6)
      ctx.lineWidth = 4
      ellipse(ctx, cx, cy + 6, 29, 9 + mouth * 22)
      ctx.stroke()
    } else {
      // A shut-mouthed smile across the middle.
      ctx.strokeStyle = '#dc2626'
      ctx.lineWidth = 7
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(cx, cy - 10, 30, 0.5, Math.PI - 0.5)
      ctx.stroke()
    }
    // The bow at the bottom.
    ctx.fillStyle = '#dc2626'
    for (const d of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(cx, 168)
      ctx.quadraticCurveTo(cx + d * 30, 140, cx + d * 36, 166)
      ctx.quadraticCurveTo(cx + d * 30, 186, cx, 168)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(cx + d * 4, 170)
      ctx.lineTo(cx + d * 22, 198)
      ctx.lineTo(cx + d * 12, 196)
      ctx.lineTo(cx + d * 2, 174)
      ctx.fill()
    }
    ctx.fillStyle = '#b91c1c'
    rr(ctx, cx - 8, 160, 16, 16, 4)
  }
}

// -- mistletoe --------------------------------------------------------------------------------------

function mistletoe(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  // A red bow at the top, sprigs of pale leaves hanging from it with white berries.
  const leaf = (x: number, y: number, a: number, s: number) => {
    ctx.fillStyle = shade(color, -0.05)
    ellipse(ctx, x + Math.sin(a) * s, y + Math.cos(a) * s, s * 0.42, s, -a)
    ctx.fill()
    ctx.strokeStyle = shade(color, -0.35)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.sin(a) * s * 1.7, y + Math.cos(a) * s * 1.7)
    ctx.stroke()
  }
  ctx.strokeStyle = shade(color, -0.4)
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  for (const [x, y] of [[40, 96], [60, 112], [84, 100]] as const) {
    ctx.beginPath()
    ctx.moveTo(60, 36)
    ctx.quadraticCurveTo((60 + x) / 2, 60, x, y)
    ctx.stroke()
  }
  leaf(52, 60, 0.9, 22)
  leaf(66, 62, -0.8, 22)
  leaf(44, 88, 0.6, 20)
  leaf(78, 86, -0.5, 20)
  leaf(58, 96, 0.1, 18)
  // Berries in clusters, one glinting in turn.
  const berries = [[50, 76], [56, 80], [62, 74], [70, 80], [64, 84], [44, 104], [80, 108], [60, 118], [66, 114]]
  berries.forEach(([x, y], k) => {
    ctx.fillStyle = '#f8fafc'
    circle(ctx, x, y, 5.5)
    ctx.fill()
    ctx.fillStyle = 'rgba(148,163,184,0.6)'
    circle(ctx, x + 1.5, y + 1.5, 2.5)
    ctx.fill()
    if ((k + f) % 4 === 0) glow(ctx, x - 1.5, y - 1.5, 9, '#ffffff', 0.8)
  })
  // The bow.
  ctx.fillStyle = color2
  for (const d of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(60, 30)
    ctx.quadraticCurveTo(60 + d * 30, 4, 60 + d * 34, 28)
    ctx.quadraticCurveTo(60 + d * 28, 46, 60, 30)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(60 + d * 3, 32)
    ctx.lineTo(60 + d * 18, 58)
    ctx.lineTo(60 + d * 9, 56)
    ctx.fill()
  }
  ctx.fillStyle = shade(color2, -0.2)
  rr(ctx, 53, 23, 14, 14, 4)
}

/** A heart floating up from under the mistletoe. */
function kissHeart(ctx: Ctx, f: number) {
  const c = f % 2 ? '#f472b6' : '#ef4444'
  glow(ctx, 32, 32, 30, c, 0.4)
  ctx.fillStyle = c
  heartPath(ctx, 32, 30, 20)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ellipse(ctx, 24, 24, 5, 3, -0.6)
  ctx.fill()
}

// -- a gingerbread house ----------------------------------------------------------------------------

function gingerbreadHouse(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  // From dark to every window lit, the lights along the roof coming on, and the door opening to a gingerbread
  // man waving.
  const level = f / (frames - 1)
  const dough = color
  // Chimney, with smoke once it is lit.
  ctx.fillStyle = shade(dough, -0.1)
  ctx.fillRect(176, 40, 30, 60)
  ctx.fillStyle = FUR
  rr(ctx, 172, 34, 38, 12, 6)
  if (level > 0.3) {
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = `rgba(226,232,240,${0.5 - k * 0.12})`
      circle(ctx, 194 + k * 10, 24 - k * 14, 9 + k * 3)
      ctx.fill()
    }
  }
  // Walls.
  const g = ctx.createLinearGradient(0, 120, 0, 256)
  g.addColorStop(0, shade(dough, 0.12))
  g.addColorStop(1, shade(dough, -0.2))
  ctx.fillStyle = g
  ctx.fillRect(40, 124, 180, 132)
  // Icing piped along the walls.
  ctx.strokeStyle = FUR
  ctx.lineWidth = 4
  ctx.beginPath()
  for (let x = 40; x <= 220; x += 15) ctx.arc(x + 7.5, 250, 7.5, Math.PI, 0)
  ctx.stroke()
  // The roof: a slab each side with snowy icing dripping off the edge.
  ctx.fillStyle = shade(dough, -0.25)
  ctx.beginPath()
  ctx.moveTo(22, 134)
  ctx.lineTo(130, 40)
  ctx.lineTo(238, 134)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = FUR
  ctx.beginPath()
  ctx.moveTo(16, 136)
  ctx.lineTo(130, 34)
  ctx.lineTo(244, 136)
  ctx.lineTo(244, 142)
  for (let x = 244; x >= 16; x -= 14) ctx.quadraticCurveTo(x - 4, 156 + noise(x) * 8, x - 7, 142)
  ctx.lineTo(16, 142)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = shade(dough, -0.25)
  ctx.beginPath()
  ctx.moveTo(36, 128)
  ctx.lineTo(130, 46)
  ctx.lineTo(224, 128)
  ctx.closePath()
  ctx.fill()
  // Gumdrops on the roof.
  const drops = ['#ef4444', '#22c55e', '#facc15', '#a855f7', '#3b82f6']
  for (let k = 0; k < 7; k++) {
    const u = (k + 0.5) / 7
    const x = 50 + u * 160
    const y = 120 - (1 - Math.abs(u - 0.5) * 2) * 66
    ctx.fillStyle = drops[k % drops.length]
    ctx.beginPath()
    ctx.arc(x, y, 7, Math.PI, 0)
    ctx.lineTo(x + 7, y + 3)
    ctx.lineTo(x - 7, y + 3)
    ctx.fill()
  }
  // Lights along the edge of the roof, coming on one by one.
  bulbs(ctx, 24, 138, 130, 44, 7, 0, Math.max(0, (level - 0.45) / 0.2), f)
  bulbs(ctx, 130, 44, 236, 138, 7, 0, Math.max(0, (level - 0.65) / 0.2), f + 3)
  // Two windows with candy-cane frames, lit in turn.
  for (const [x, on] of [[62, level >= 0.2], [168, level >= 0.35]] as const) {
    if (on) glow(ctx, x + 15, 172, 40, '#fbbf24', 0.6)
    ctx.fillStyle = on ? '#fde68a' : '#422006'
    ctx.fillRect(x, 156, 30, 32)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 5
    ctx.strokeRect(x, 156, 30, 32)
    ctx.strokeStyle = '#dc2626'
    ctx.setLineDash([5, 5])
    ctx.strokeRect(x, 156, 30, 32)
    ctx.setLineDash([])
    ctx.strokeStyle = on ? '#b45309' : '#1c1917'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x + 15, 156)
    ctx.lineTo(x + 15, 188)
    ctx.moveTo(x, 172)
    ctx.lineTo(x + 30, 172)
    ctx.stroke()
  }
  // The door, swinging open once everything is lit.
  const opening = Math.max(0, (level - 0.75) / 0.25)
  ctx.fillStyle = opening > 0 ? '#fde68a' : '#422006'
  if (opening > 0) glow(ctx, 130, 226, 46, '#fbbf24', 0.5 * opening)
  ctx.beginPath()
  ctx.moveTo(110, 256)
  ctx.lineTo(110, 214)
  ctx.arc(130, 214, 20, Math.PI, 0)
  ctx.lineTo(150, 256)
  ctx.fill()
  if (opening > 0.5) {
    // A gingerbread man in the doorway, waving.
    const gx = 130
    ctx.fillStyle = '#9a3412'
    circle(ctx, gx, 214, 9)
    ctx.fill()
    rr(ctx, gx - 8, 222, 16, 20, 6)
    ctx.strokeStyle = '#9a3412'
    ctx.lineWidth = 7
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(gx - 6, 226)
    ctx.lineTo(gx - 14, 236)
    ctx.moveTo(gx + 6, 226)
    ctx.lineTo(gx + 14, 210 + (f % 2) * 4)
    ctx.moveTo(gx - 4, 240)
    ctx.lineTo(gx - 7, 254)
    ctx.moveTo(gx + 4, 240)
    ctx.lineTo(gx + 7, 254)
    ctx.stroke()
    ctx.fillStyle = '#111'
    circle(ctx, gx - 3, 212, 1.6)
    circle(ctx, gx + 3, 212, 1.6)
    ctx.fill()
    ctx.fillStyle = color2
    circle(ctx, gx, 230, 2)
    ctx.fill()
  }
  ctx.save()
  ctx.translate(110, 256)
  ctx.scale(1 - opening * 0.85, 1)
  ctx.fillStyle = '#7c2d12'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -42)
  ctx.arc(20, -42, 20, Math.PI, 0)
  ctx.lineTo(40, 0)
  ctx.fill()
  ctx.fillStyle = color2
  circle(ctx, 32, -22, 3)
  ctx.fill()
  ctx.restore()
  // Candy canes either side of the door.
  for (const x of [26, 234]) {
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, 256)
    ctx.lineTo(x, 196)
    ctx.arc(x + (x < 100 ? 9 : -9), 196, 9, Math.PI, x < 100 ? 0 : TAU, x >= 100)
    ctx.stroke()
    ctx.strokeStyle = '#dc2626'
    ctx.setLineDash([6, 6])
    ctx.stroke()
    ctx.setLineDash([])
  }
}

// -- an elf at the workbench ------------------------------------------------------------------------

function workshopElf(busy: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU * (busy ? 2 : 1)
    // The hammer up and coming down: one blow a turn, two when busy.
    const lift = Math.max(0, Math.sin(p))
    const hit = Math.cos(p) > 0.85 && Math.sin(p) < 0.3
    // The bench.
    ctx.fillStyle = '#92400e'
    ctx.fillRect(110, 150, 104, 14)
    ctx.fillStyle = '#78350f'
    ctx.fillRect(118, 164, 10, 56)
    ctx.fillRect(196, 164, 10, 56)
    ctx.fillStyle = '#b45309'
    ctx.fillRect(110, 150, 104, 4)
    // The toy on the bench: a little wooden train engine, jumping at each blow; stars when busy.
    const jump = hit ? 4 : 0
    ctx.save()
    ctx.translate(160, 150 - jump)
    ctx.fillStyle = color2
    ctx.fillRect(-20, -26, 26, 18)
    ctx.fillStyle = shade(color2, -0.2)
    ctx.fillRect(4, -40, 18, 32)
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(-16, -36, 6, 12)
    ctx.fillStyle = '#facc15'
    for (const x of [-12, 4, 16]) {
      circle(ctx, x, -6, 6)
      ctx.fill()
    }
    ctx.restore()
    if (busy && hit) {
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k - 2) * 0.5
        ctx.strokeStyle = '#fde047'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(150 + Math.cos(a) * 18, 118 + Math.sin(a) * 18)
        ctx.lineTo(150 + Math.cos(a) * 30, 118 + Math.sin(a) * 30)
        ctx.stroke()
      }
    }
    // The elf, standing at the bench: legs in striped stockings, curled shoes.
    for (const [x, d] of [[62, -1], [84, 1]] as const) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x - 6, 168, 12, 40)
      ctx.fillStyle = '#dc2626'
      for (let y = 172; y < 206; y += 10) ctx.fillRect(x - 6, y, 12, 5)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(x - 8, 206)
      ctx.lineTo(x + 12 * (d > 0 ? 1 : 0.6), 214)
      ctx.quadraticCurveTo(x + 22, 214, x + 20, 202)
      ctx.lineTo(x + 8, 206)
      ctx.lineTo(x + 8, 218)
      ctx.lineTo(x - 8, 218)
      ctx.closePath()
      ctx.fill()
    }
    // Tunic with a belt and a zig-zag hem.
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(52, 112)
    ctx.lineTo(94, 112)
    ctx.lineTo(102, 172)
    for (let x = 102; x >= 44; x -= 10) ctx.lineTo(x - 5, x % 20 ? 178 : 170)
    ctx.lineTo(44, 172)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(48, 142, 52, 8)
    ctx.fillStyle = '#facc15'
    ctx.fillRect(68, 141, 10, 10)
    // Back arm holding the toy steady.
    limb(ctx, 88, 120, 22, 24, 1.2, 0.4, 11, shade(color, -0.15))
    ctx.fillStyle = SKIN
    circle(ctx, 130, 128, 6)
    ctx.fill()
    // Head: pointed ear, rosy cheek, a hat with a bell flopping.
    ctx.fillStyle = SKIN
    circle(ctx, 74, 92, 20)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(58, 88)
    ctx.lineTo(44, 74)
    ctx.lineTo(60, 98)
    ctx.fill()
    ctx.fillStyle = rgba('#f43f5e', 0.45)
    circle(ctx, 84, 100, 5)
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, 84, 90, 2.4)
    ctx.fill()
    ctx.strokeStyle = '#7c2d12'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(82, 98, 6, 0.3, Math.PI - 0.6)
    ctx.stroke()
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(52, 82)
    ctx.quadraticCurveTo(64, 44, 92, 50 + lift * 6)
    ctx.quadraticCurveTo(104, 56, 108, 70 + lift * 4)
    ctx.quadraticCurveTo(88, 62, 96, 82)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    rr(ctx, 50, 78, 50, 10, 5)
    ctx.fillStyle = '#facc15'
    circle(ctx, 109, 72 + lift * 4, 6)
    ctx.fill()
    // The hammer arm, from the shoulder: raised high, then down on the toy.
    const a1 = 1.45 + lift * 1.25
    const a2 = -0.15 - lift * 0.35
    const [hx, hy] = limb(ctx, 82, 118, 24, 22, a1, a2, 11, color)
    ctx.save()
    ctx.translate(hx, hy)
    ctx.rotate(-(a1 + a2))
    ctx.fillStyle = '#a16207'
    ctx.fillRect(-3, -4, 6, 34)
    ctx.fillStyle = '#6b7280'
    rr(ctx, -11, 26, 22, 13, 2)
    ctx.fillStyle = '#9ca3af'
    ctx.fillRect(-11, 26, 22, 3)
    ctx.restore()
    ctx.fillStyle = SKIN
    circle(ctx, hx, hy, 6)
    ctx.fill()
  }
}

// -- a snowman that melts -----------------------------------------------------------------------------

/** From a proud snowman (0) to a puddle with his hat, scarf and carrot in it (1); waving tips his hat. */
function snowman(ctx: Ctx, m: number, wave: number, { color, color2 }: SpriteColors) {
  const sy = 1 - 0.82 * m
  const sx = 1 + 0.45 * m
  const base = 252
  if (m > 0.05) {
    // The puddle he is melting into.
    ctx.fillStyle = `rgba(147,197,253,${0.25 + 0.5 * m})`
    ellipse(ctx, 90, base, 40 + 50 * m, 5 + 6 * m)
    ctx.fill()
  }
  const yb = base - 50 * sy
  const ym = yb - 50 * sy - 34 * sy * 0.85
  const yh = ym - 34 * sy - 26 * sy * 0.85
  const ball = (y: number, r: number) => {
    const g = ctx.createRadialGradient(90 - r * 0.35, y - r * sy * 0.4, r * 0.1, 90, y, r * sx)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(1, '#cbd5e1')
    ctx.fillStyle = g
    ellipse(ctx, 90, y, r * sx, r * sy)
    ctx.fill()
  }
  // Stick arms, drooping as he melts (one waving).
  ctx.strokeStyle = '#78350f'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  const arm = (d: number, a: number) => {
    const x0 = 90 + d * 30 * sx
    const x1 = x0 + d * Math.cos(a) * 46
    const y1 = ym - Math.sin(a) * 46
    ctx.beginPath()
    ctx.moveTo(x0, ym)
    ctx.lineTo(x1, y1)
    ctx.moveTo(x0 + d * Math.cos(a) * 30, ym - Math.sin(a) * 30)
    ctx.lineTo(x0 + d * Math.cos(a) * 30 + d * 10, ym - Math.sin(a) * 30 - 10)
    ctx.stroke()
  }
  if (m < 0.85) {
    arm(-1, 0.5 - m * 1.4)
    arm(1, wave ? 1.2 + Math.sin(wave * TAU) * 0.4 : 0.5 - m * 1.4)
  }
  ball(yb, 50)
  ball(ym, 34)
  ball(yh, 26)
  // Coal buttons, the scarf, the face.
  ctx.fillStyle = '#1f2937'
  for (const k of [-0.5, 0, 0.5]) {
    circle(ctx, 90, ym + k * 30 * sy, 3.5)
    ctx.fill()
  }
  // Scarf round his neck, its end hanging (or lying in the puddle).
  ctx.fillStyle = color2
  rr(ctx, 90 - 30 * sx, ym - 34 * sy - 4, 60 * sx, 11, 5)
  ctx.save()
  ctx.translate(90 + 18 * sx, ym - 30 * sy)
  ctx.rotate(-0.1 - m * 1.2)
  rr(ctx, -6, 0, 13, 38 * (1 - m * 0.4), 4)
  ctx.fillStyle = shade(color2, 0.4)
  ctx.fillRect(-6, 12, 13, 4)
  ctx.fillRect(-6, 22, 13, 4)
  ctx.restore()
  const look = wave ? 1 : 0
  ctx.fillStyle = '#1f2937'
  circle(ctx, 82 + look * 2, yh - 6 * sy, 3.2)
  ctx.fill()
  circle(ctx, 98 + look * 2, yh - 6 * sy, 3.2)
  ctx.fill()
  for (let k = 0; k < 5; k++) {
    const a = 0.5 + k * 0.5
    circle(ctx, 90 + Math.cos(a) * 12, yh + Math.sin(a) * 10 * sy - (m > 0.4 ? -Math.sin(a) * 6 * m : 0), 1.8)
    ctx.fill()
  }
  // Carrot nose, drooping.
  ctx.fillStyle = '#f97316'
  ctx.save()
  ctx.translate(92, yh + 2 * sy)
  ctx.rotate(m * 0.9)
  ctx.beginPath()
  ctx.moveTo(0, -4)
  ctx.lineTo(24, 0)
  ctx.lineTo(0, 4)
  ctx.fill()
  ctx.restore()
  // Top hat, tipped up when he waves, slipping as he melts.
  ctx.save()
  ctx.translate(90 + m * 10, yh - 22 * sy - (wave ? 10 + Math.sin(wave * TAU) * 6 : 0))
  ctx.rotate(m * 0.5 - (wave ? 0.25 : 0))
  ctx.fillStyle = color
  ctx.fillRect(-28, -4, 56, 7)
  ctx.fillRect(-18, -40, 36, 38)
  ctx.fillStyle = '#dc2626'
  ctx.fillRect(-18, -12, 36, 7)
  ctx.fillStyle = '#16a34a'
  ellipse(ctx, 10, -10, 6, 3, -0.5)
  ctx.fill()
  ctx.restore()
}

// -- Santa at the window ------------------------------------------------------------------------------

function windowSanta(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  // Warm firelight inside, Santa from the chest up looking left, ahead, right, and a finger to his lips.
  const g = ctx.createRadialGradient(100, 120, 10, 100, 110, 150)
  g.addColorStop(0, rgba(color2, 0.9))
  g.addColorStop(0.6, rgba(color2, 0.45))
  g.addColorStop(1, rgba(color2, 0.1))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 200, 220)
  const look = [-1, 0, 1, 0][f]
  const shh = f === 3
  const hx = 100 + look * 6
  // Coat and white trim.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(18, 220)
  ctx.quadraticCurveTo(24, 150, 70, 140)
  ctx.lineTo(130, 140)
  ctx.quadraticCurveTo(176, 150, 182, 220)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = FUR
  ctx.fillRect(92, 150, 16, 70)
  // Face, cheeks, nose.
  ctx.fillStyle = SKIN
  circle(ctx, hx, 92, 30)
  ctx.fill()
  ctx.fillStyle = rgba('#f43f5e', 0.45)
  circle(ctx, hx - 16, 100, 7)
  circle(ctx, hx + 16, 100, 7)
  ctx.fill()
  // Beard and moustache.
  ctx.fillStyle = FUR
  ctx.beginPath()
  ctx.moveTo(hx - 34, 92)
  ctx.quadraticCurveTo(hx - 36, 156, hx, 164)
  ctx.quadraticCurveTo(hx + 36, 156, hx + 34, 92)
  ctx.quadraticCurveTo(hx + 20, 112, hx, 108)
  ctx.quadraticCurveTo(hx - 20, 112, hx - 34, 92)
  ctx.fill()
  ellipse(ctx, hx - 10, 108, 13, 6, 0.2)
  ctx.fill()
  ellipse(ctx, hx + 10, 108, 13, 6, -0.2)
  ctx.fill()
  ctx.fillStyle = '#fb7185'
  circle(ctx, hx + look * 3, 100, 6)
  ctx.fill()
  // Eyes (a wink with the finger to the lips) and bushy brows.
  for (const d of [-1, 1]) {
    const ex = hx + d * 12
    if (shh && d > 0) {
      ctx.strokeStyle = '#111'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(ex, 86, 5, 0.3, Math.PI - 0.3)
      ctx.stroke()
    } else {
      ctx.fillStyle = '#111'
      circle(ctx, ex + look * 3, 86, 3.6)
      ctx.fill()
    }
    ctx.fillStyle = FUR
    ellipse(ctx, ex, 76, 9, 4, d * 0.15)
    ctx.fill()
  }
  // Hat flopping over to one side, white trim and bobble.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(hx - 32, 72)
  ctx.quadraticCurveTo(hx - 20, 22, hx + 20, 30)
  ctx.quadraticCurveTo(hx + 50, 40, hx + 56, 76)
  ctx.lineTo(hx + 40, 70)
  ctx.lineTo(hx + 32, 72)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = FUR
  rr(ctx, hx - 36, 64, 72, 14, 7)
  circle(ctx, hx + 56, 80, 10)
  ctx.fill()
  if (shh) {
    // A mittened finger up to his lips.
    ctx.strokeStyle = color
    ctx.lineWidth = 16
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(150, 220)
    ctx.quadraticCurveTo(140, 150, hx + 6, 132)
    ctx.stroke()
    ctx.fillStyle = FUR
    rr(ctx, hx - 4, 122, 22, 12, 5)
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 2
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.roundRect(hx - 4, 110, 20, 22, 8)
    ctx.roundRect(hx + 1, 92, 8, 24, 4)
    ctx.fill()
    ctx.stroke()
  }
}

// -- Santa stuck in the chimney -----------------------------------------------------------------------

function stuckSanta(kicking: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color }: SpriteColors) => {
    const p = (f / frames) * TAU
    const k = kicking ? 1 : 0.35
    // Upside down in the chimney: his bottom and legs sticking out of the top, boots kicking.
    const bob = Math.sin(p * (kicking ? 2 : 1)) * 3 * k
    ctx.save()
    ctx.translate(0, bob)
    // The seat of his trousers and the belt, then two legs kicking.
    ctx.fillStyle = color
    ellipse(ctx, 100, 120, 44, 26)
    ctx.fill()
    ctx.fillStyle = FUR
    rr(ctx, 56, 128, 88, 10, 5)
    const legs = [[82, Math.sin(p) * 0.7 * k - 0.25], [118, -Math.sin(p) * 0.7 * k + 0.25]] as const
    for (const [x, a] of legs) {
      ctx.save()
      ctx.translate(x, 112)
      ctx.rotate(Math.PI + a)
      ctx.fillStyle = shade(color, -0.08)
      rr(ctx, -12, 0, 24, 62, 10)
      ctx.fillStyle = FUR
      rr(ctx, -14, 54, 28, 10, 5)
      ctx.fillStyle = '#1f2937'
      rr(ctx, -12, 62, 24, 22, 6)
      rr(ctx, -12, 76, 34, 12, 6)
      ctx.restore()
    }
    ctx.restore()
    // The chimney in front, bricks and a ledge of snow; soot puffing out when he kicks.
    ctx.fillStyle = '#b91c1c'
    ctx.fillRect(48, 140, 104, 120)
    ctx.strokeStyle = '#7f1d1d'
    ctx.lineWidth = 2
    for (let y = 152; y < 260; y += 16) {
      ctx.beginPath()
      ctx.moveTo(48, y)
      ctx.lineTo(152, y)
      ctx.stroke()
      for (let x = 48 + ((y / 16) % 2) * 13; x < 152; x += 26) {
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x, y + 16)
        ctx.stroke()
      }
    }
    ctx.fillStyle = '#991b1b'
    ctx.fillRect(40, 132, 120, 16)
    ctx.fillStyle = FUR
    ctx.beginPath()
    ctx.moveTo(38, 134)
    ctx.quadraticCurveTo(70, 122, 100, 130)
    ctx.quadraticCurveTo(130, 120, 162, 134)
    ctx.lineTo(162, 140)
    ctx.quadraticCurveTo(150, 148, 140, 140)
    ctx.quadraticCurveTo(110, 146, 90, 140)
    ctx.quadraticCurveTo(60, 148, 38, 140)
    ctx.fill()
    if (kicking) {
      for (let j = 0; j < 3; j++) {
        const q = ((f / frames) * 2 + j / 3) % 1
        ctx.fillStyle = `rgba(100,116,139,${0.5 * (1 - q)})`
        circle(ctx, 40 + j * 60 + Math.sin(q * 6 + j) * 8, 130 - q * 50, 8 + q * 10)
        ctx.fill()
      }
    }
  }
}

// -- shaggy ones: Krampus and the yeti ----------------------------------------------------------------

/** A shaggy body: an ellipse fringed all round with tufts of fur, and strands down it. */
function shaggy(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, fur: string, seed: number) {
  ctx.fillStyle = fur
  ellipse(ctx, cx, cy, rx, ry)
  ctx.fill()
  for (let k = 0; k < 34; k++) {
    const a = (k / 34) * TAU
    const len = 8 + noise(seed + k) * 10
    const x = cx + Math.cos(a) * rx
    const y = cy + Math.sin(a) * ry
    ctx.beginPath()
    ctx.moveTo(x - Math.sin(a) * 6, y + Math.cos(a) * 6)
    ctx.lineTo(x + Math.cos(a) * len + (a > 0.5 && a < 2.6 ? 0 : 0), y + Math.sin(a) * len + (Math.sin(a) > 0 ? len * 0.5 : 0))
    ctx.lineTo(x + Math.sin(a) * 6, y - Math.cos(a) * 6)
    ctx.fill()
  }
  ctx.strokeStyle = shade(fur, -0.25)
  ctx.lineWidth = 2
  for (let k = 0; k < 14; k++) {
    const x = cx + (noise(seed + 50 + k) - 0.5) * rx * 1.4
    const y = cy + (noise(seed + 80 + k) - 0.5) * ry * 1.2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + 3, y + 8, x - 1, y + 16)
    ctx.stroke()
  }
}

/** A goat's leg from the hip: thigh, the shin bending back, the cannon down to a split hoof. Returns the hoof. */
function goatLeg(ctx: Ctx, x: number, y: number, a: number, col: string) {
  const [kx, ky] = limb(ctx, x, y, 30, 0.01, a + 0.35, 0, 22, col)
  const [hx, hy] = limb(ctx, kx, ky, 28, 0.01, a - 0.55, 0, 15, col)
  const [fx, fy] = limb(ctx, hx, hy, 24, 0.01, a * 0.6, 0, 11, col)
  ctx.fillStyle = '#1c1917'
  ctx.beginPath()
  ctx.moveTo(fx - 9, fy - 2)
  ctx.lineTo(fx + 10, fy - 2)
  ctx.lineTo(fx + 12, fy + 8)
  ctx.lineTo(fx - 9, fy + 8)
  ctx.closePath()
  ctx.fill()
  return [fx, fy] as const
}

function krampus(staring: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const s = staring ? 0 : Math.sin(p)
    const rattle = staring ? Math.sin(p * 2) : 0
    ctx.translate(0, staring ? 0 : -Math.abs(Math.cos(p)) * 4)
    const fur = color
    goatLeg(ctx, 96, 186, -s * 0.5, shade(fur, -0.3))
    // Tail.
    ctx.strokeStyle = shade(fur, -0.2)
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(70, 176)
    ctx.quadraticCurveTo(44, 190 + s * 6, 40, 220)
    ctx.stroke()
    ctx.fillStyle = shade(fur, -0.2)
    ellipse(ctx, 40, 224, 6, 9)
    ctx.fill()
    // The far arm, swinging a chain.
    const [cx2, cy2] = limb(ctx, 100, 120, 30, 28, staring ? -0.4 : -0.3 - s * 0.4, staring ? -0.8 : 0.3, 15, shade(fur, -0.3))
    ctx.strokeStyle = '#a8a29e'
    ctx.lineWidth = 2.5
    for (let k = 0; k < 6; k++) {
      const sw = staring ? rattle * 0.6 : s * 0.3
      ellipse(ctx, cx2 + Math.sin(sw) * k * 9, cy2 + 6 + k * 9, 4, 6, sw)
      ctx.stroke()
    }
    // Shaggy body, a belt of bells, chains across the chest.
    shaggy(ctx, 108, 146, 42, 56, fur, 3)
    ctx.fillStyle = '#44403c'
    ctx.fillRect(68, 168, 82, 8)
    for (let k = 0; k < 4; k++) {
      const bx = 80 + k * 18
      const by = 182 + (k % 2 ? rattle * 2 : -rattle * 2)
      ctx.fillStyle = color2
      ctx.beginPath()
      ctx.arc(bx, by, 6, Math.PI, 0)
      ctx.lineTo(bx + 7, by + 6)
      ctx.lineTo(bx - 7, by + 6)
      ctx.fill()
      ctx.fillStyle = shade(color2, -0.4)
      circle(ctx, bx, by + 7, 2)
      ctx.fill()
    }
    ctx.strokeStyle = '#d6d3d1'
    ctx.lineWidth = 2.5
    for (let k = 0; k < 8; k++) {
      ellipse(ctx, 78 + k * 8, 112 + k * 7, 4.5, 3, 0.8 + (k % 2) * 1.2)
      ctx.stroke()
    }
    goatLeg(ctx, 120, 188, s * 0.5, fur)
    // Head: a shaggy mane, a dark red face pushed forward, glowing eyes, long horns, the tongue out.
    shaggy(ctx, 134, 100, 26, 30, shade(fur, 0.05), 9)
    const hx = 152
    const hy = 84
    ctx.fillStyle = '#7f1d1d'
    ellipse(ctx, hx, hy, 20, 24)
    ctx.fill()
    ellipse(ctx, hx + 18, hy + 8, 14, 11, 0.2)
    ctx.fill()
    // Mouth open with fangs, the tongue hanging (longer when he stares).
    ctx.fillStyle = '#450a0a'
    ellipse(ctx, hx + 18, hy + 18, 12, staring ? 9 : 6)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    for (const d of [-6, 6]) {
      ctx.beginPath()
      ctx.moveTo(hx + 18 + d - 3, hy + 12)
      ctx.lineTo(hx + 18 + d, hy + 22)
      ctx.lineTo(hx + 18 + d + 3, hy + 12)
      ctx.fill()
    }
    ctx.strokeStyle = '#f472b6'
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(hx + 18, hy + 20)
    const tl = staring ? 58 : 34
    ctx.bezierCurveTo(hx + 30 + rattle * 6, hy + 20 + tl * 0.4, hx + 8, hy + 20 + tl * 0.7, hx + 20 + rattle * 4, hy + 20 + tl)
    ctx.stroke()
    for (const d of [-8, 8]) {
      glow(ctx, hx + 8 + d * 0.8, hy - 6, 10, '#facc15', 0.8)
      ctx.fillStyle = '#fde047'
      ellipse(ctx, hx + 8 + d * 0.8, hy - 6, 4.5, 3, d > 0 ? 0.3 : -0.3)
      ctx.fill()
      ctx.fillStyle = '#111'
      circle(ctx, hx + 9 + d * 0.8, hy - 6, 1.5)
      ctx.fill()
    }
    // Two long horns curving back.
    ctx.fillStyle = '#e7e5e4'
    for (const [bx, k] of [[hx - 10, 1], [hx + 4, 0.85]] as const) {
      ctx.beginPath()
      ctx.moveTo(bx - 6, hy - 18)
      ctx.quadraticCurveTo(bx - 30 * k, hy - 60 * k, bx - 6 * k, hy - 84 * k)
      ctx.quadraticCurveTo(bx - 20 * k, hy - 56 * k, bx + 6, hy - 20)
      ctx.closePath()
      ctx.fill()
    }
    ctx.strokeStyle = '#a8a29e'
    ctx.lineWidth = 1.5
    for (let k = 1; k < 5; k++) {
      ctx.beginPath()
      ctx.moveTo(hx - 22 - k, hy - 22 - k * 12)
      ctx.lineTo(hx - 12 - k, hy - 22 - k * 12)
      ctx.stroke()
    }
    // Pointed ear.
    ctx.fillStyle = '#7f1d1d'
    ctx.beginPath()
    ctx.moveTo(hx - 14, hy - 6)
    ctx.lineTo(hx - 38, hy - 14)
    ctx.lineTo(hx - 14, hy + 4)
    ctx.fill()
    // The near arm, with a bundle of birch twigs (raised and shaking when he stares).
    const a1 = staring ? 2.7 + rattle * 0.15 : 0.5 + s * 0.4
    const [ax, ay] = limb(ctx, 124, 120, 30, 28, a1, staring ? 0.3 : -0.4, 16, fur)
    ctx.fillStyle = '#7f1d1d'
    circle(ctx, ax, ay, 7)
    ctx.fill()
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = 2
    const ba = staring ? Math.PI + 0.2 + rattle * 0.3 : 0.9 + s * 0.3
    for (let k = -3; k <= 3; k++) {
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(ax + Math.sin(ba + k * 0.08) * 56, ay + Math.cos(ba + k * 0.08) * 56)
      ctx.stroke()
    }
    ctx.fillStyle = '#dc2626'
    circle(ctx, ax + Math.sin(ba) * 10, ay + Math.cos(ba) * 10, 4)
    ctx.fill()
  }
}

function yeti(roaring: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const s = roaring ? 0 : Math.sin(p)
    const beat = roaring ? Math.sin(p * 2) : 0
    ctx.translate(0, roaring ? Math.abs(beat) * -4 : -Math.abs(Math.cos(p)) * 6)
    const fur = color
    // Legs: thick and short, big flat feet.
    for (const [x, a, col] of [[100, -s * 0.45, shade(fur, -0.15)], [140, s * 0.45, fur]] as const) {
      const [fx, fy] = limb(ctx, x, 214, 30, 30, a, Math.max(0, -a) * 0.6, 32, col)
      ctx.fillStyle = shade(color2, -0.1)
      ellipse(ctx, fx + 10, fy + 6, 22, 9)
      ctx.fill()
    }
    // Far arm.
    const far = roaring ? Math.PI - 0.5 + beat * 0.15 : -0.2 - s * 0.35
    limb(ctx, 104, 116, 46, 44, far, roaring ? -0.4 : 0.25, 24, shade(fur, -0.15))
    shaggy(ctx, 120, 160, 58, 70, fur, 21)
    // Belly patch.
    ctx.fillStyle = shade(fur, -0.06)
    ellipse(ctx, 132, 170, 32, 44)
    ctx.fill()
    // Near arm: swinging, or up roaring and thumping his chest (behind his head).
    const near = roaring ? Math.PI - 0.2 - beat * 0.3 : 0.3 + s * 0.4
    const [hx, hy] = limb(ctx, 146, 118, 46, 44, near, roaring ? 0.6 : -0.3, 26, fur)
    ctx.fillStyle = color2
    ellipse(ctx, hx, hy, 11, 13)
    ctx.fill()
    // Head: fur all round a pale blue face, a big mouth (roaring wide).
    shaggy(ctx, 148, 82, 34, 32, fur, 33)
    ctx.fillStyle = color2
    ellipse(ctx, 160, 88, 22, 24)
    ctx.fill()
    const mouth = roaring ? 0.6 + 0.4 * Math.abs(beat) : 0.15
    ctx.fillStyle = '#1e3a8a'
    ellipse(ctx, 164, 100, 13, 4 + mouth * 12)
    ctx.fill()
    if (mouth > 0.3) {
      ctx.fillStyle = '#f87171'
      ellipse(ctx, 164, 104 + mouth * 6, 8, 3 + mouth * 3)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      for (const d of [-7, 7]) {
        ctx.beginPath()
        ctx.moveTo(164 + d - 3, 100 - mouth * 9)
        ctx.lineTo(164 + d, 100 - mouth * 9 + 7)
        ctx.lineTo(164 + d + 3, 100 - mouth * 9)
        ctx.fill()
      }
    }
    for (const d of [-9, 9]) {
      ctx.fillStyle = '#ffffff'
      circle(ctx, 162 + d, 80, 5)
      ctx.fill()
      ctx.fillStyle = '#111'
      circle(ctx, 164 + d, 80, 2.8)
      ctx.fill()
      ctx.strokeStyle = shade(color2, -0.4)
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(162 + d - 6, roaring ? 68 + Math.abs(d) * 0.3 : 72)
      ctx.lineTo(162 + d + 6, roaring ? 74 - Math.abs(d) * 0.3 : 71)
      ctx.stroke()
    }
    ctx.fillStyle = shade(color2, -0.3)
    ellipse(ctx, 166, 90, 4, 3)
    ctx.fill()
  }
}

// -- children making snow angels --------------------------------------------------------------------

function snowAngel(sweeping: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    // Seen from above, lying on their back in the snow: arms and legs sweeping out and in.
    const q = sweeping ? 0.5 - 0.5 * Math.cos((f / frames) * TAU) : 0.2
    const blink = !sweeping && f === 1
    const cx = 110
    // The snow, and the angel already pressed into it (the wings as far as the arms go, the skirt by the legs).
    ctx.fillStyle = rgba('#e0f2fe', 0.9)
    ellipse(ctx, cx, 104, 104, 92)
    ctx.fill()
    ctx.fillStyle = rgba('#93c5fd', 0.55)
    for (const d of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(cx + d * 14, 70)
      ctx.arc(cx + d * 14, 70, 70, d > 0 ? -0.75 : Math.PI - 0.15, d > 0 ? 0.15 : Math.PI + 0.75)
      ctx.closePath()
      ctx.fill()
    }
    ctx.beginPath()
    ctx.moveTo(cx - 8, 116)
    ctx.lineTo(cx - 48, 190)
    ctx.quadraticCurveTo(cx, 202, cx + 48, 190)
    ctx.lineTo(cx + 8, 116)
    ctx.fill()
    ctx.fillStyle = rgba('#93c5fd', 0.4)
    circle(ctx, cx, 40, 30)
    ctx.fill()
    // Legs (snow boots), then the coat.
    for (const d of [-1, 1]) {
      const a = d * (0.08 + q * 0.38)
      ctx.save()
      ctx.translate(cx + d * 10, 120)
      ctx.rotate(-a)
      ctx.fillStyle = shade(color, -0.35)
      rr(ctx, -9, 0, 18, 50, 8)
      ctx.fillStyle = '#7c2d12'
      rr(ctx, -10, 44, 20, 22, 7)
      ctx.restore()
    }
    for (const d of [-1, 1]) {
      // Arms from the shoulders, swept from the sides up over the head.
      const a = d * (0.5 + q * 1.5)
      ctx.save()
      ctx.translate(cx + d * 22, 70)
      ctx.rotate(-a)
      ctx.fillStyle = shade(color, -0.1)
      rr(ctx, -8, 0, 16, 48, 8)
      ctx.fillStyle = color2
      circle(ctx, 0, 50, 9)
      ctx.fill()
      ctx.restore()
    }
    ctx.fillStyle = color
    rr(ctx, cx - 26, 62, 52, 64, 16)
    ctx.fillStyle = color2
    rr(ctx, cx - 26, 64, 52, 10, 5)
    ctx.fillStyle = shade(color, 0.3)
    for (const y of [84, 98, 112]) {
      circle(ctx, cx, y, 3)
      ctx.fill()
    }
    // Face up: rosy cheeks, a big smile; the hat with its bobble above.
    ctx.fillStyle = SKIN
    circle(ctx, cx, 46, 20)
    ctx.fill()
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.arc(cx, 42, 21, Math.PI * 1.05, -0.05 * Math.PI)
    ctx.fill()
    rr(ctx, cx - 22, 30, 44, 8, 4)
    ctx.fillStyle = '#ffffff'
    circle(ctx, cx, 14, 8)
    ctx.fill()
    ctx.fillStyle = rgba('#f43f5e', 0.5)
    circle(ctx, cx - 11, 54, 4)
    circle(ctx, cx + 11, 54, 4)
    ctx.fill()
    ctx.fillStyle = '#111'
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 2
    for (const d of [-7, 7]) {
      if (blink) {
        ctx.beginPath()
        ctx.moveTo(cx + d - 3, 46)
        ctx.lineTo(cx + d + 3, 46)
        ctx.stroke()
      } else {
        circle(ctx, cx + d, 46, 2.4)
        ctx.fill()
      }
    }
    ctx.beginPath()
    ctx.arc(cx, 54, sweeping ? 7 : 5, 0.2, Math.PI - 0.2)
    if (sweeping) {
      ctx.fillStyle = '#7f1d1d'
      ctx.fill()
    } else ctx.stroke()
  }
}

// -- a mailbox for letters to the North Pole --------------------------------------------------------

function northPoleMailbox(open: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    // A candy-striped post.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(90, 120, 20, 140)
    ctx.save()
    ctx.beginPath()
    ctx.rect(90, 120, 20, 140)
    ctx.clip()
    ctx.strokeStyle = '#dc2626'
    ctx.lineWidth = 7
    for (let y = 110; y < 270; y += 18) {
      ctx.beginPath()
      ctx.moveTo(86, y)
      ctx.lineTo(114, y + 14)
      ctx.stroke()
    }
    ctx.restore()
    // The box, side on, with a gold trim and the door on the right.
    const g = ctx.createLinearGradient(0, 70, 0, 128)
    g.addColorStop(0, shade(color, 0.25))
    g.addColorStop(1, shade(color, -0.3))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(34, 128)
    ctx.lineTo(34, 96)
    ctx.arc(62, 96, 28, Math.PI, Math.PI * 1.5)
    ctx.lineTo(150, 68)
    ctx.arc(150, 96, 28, Math.PI * 1.5, 0)
    ctx.lineTo(178, 128)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = color2
    ctx.lineWidth = 3
    ctx.stroke()
    // "Letters to Santa" on its side.
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 15px Georgia, serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Letters to', 100, 94)
    ctx.fillText('Santa', 100, 112)
    if (open) {
      // The door dropped open, letters sticking out.
      ctx.fillStyle = '#3f0d0d'
      ellipse(ctx, 178, 98, 6, 28)
      ctx.fill()
      ctx.save()
      ctx.translate(178, 128)
      ctx.rotate(1.2)
      ctx.fillStyle = shade(color, -0.1)
      rr(ctx, -6, -60, 10, 60, 4)
      ctx.restore()
      for (let k = 0; k < 3; k++) {
        ctx.save()
        ctx.translate(176, 92 + k * 10)
        ctx.rotate(-0.3 + k * 0.25 + Math.sin(p + k) * 0.05)
        ctx.fillStyle = '#f8fafc'
        ctx.fillRect(0, -7, 26, 16)
        ctx.fillStyle = '#ef4444'
        ctx.fillRect(18, -5, 6, 6)
        ctx.restore()
      }
    } else {
      ctx.fillStyle = shade(color, -0.15)
      rr(ctx, 172, 74, 8, 54, 3)
      ctx.fillStyle = color2
      circle(ctx, 182, 100, 4)
      ctx.fill()
    }
    // The flag: down, or up and waving for people.
    ctx.save()
    ctx.translate(46, 104)
    ctx.rotate(open ? -0.05 + Math.sin(p * 2) * 0.15 : -1.5)
    ctx.fillStyle = color2
    ctx.fillRect(-3, -42, 6, 42)
    ctx.fillRect(-3, -42, 24, 14)
    ctx.restore()
    // Snow on top, and a little bow.
    ctx.fillStyle = FUR
    ctx.beginPath()
    ctx.moveTo(36, 92)
    ctx.quadraticCurveTo(44, 66, 66, 68)
    ctx.lineTo(150, 68)
    ctx.quadraticCurveTo(176, 66, 178, 92)
    ctx.quadraticCurveTo(160, 80, 140, 84)
    ctx.quadraticCurveTo(100, 76, 70, 84)
    ctx.quadraticCurveTo(50, 80, 36, 92)
    ctx.fill()
    ctx.fillStyle = '#16a34a'
    ellipse(ctx, 92, 70, 9, 5, -0.4)
    ellipse(ctx, 108, 70, 9, 5, 0.4)
    ctx.fill()
    ctx.fillStyle = '#dc2626'
    circle(ctx, 100, 70, 4)
    ctx.fill()
  }
}

/** A letter to Santa flying up to the North Pole. */
function letter(ctx: Ctx, f: number) {
  ctx.save()
  ctx.translate(32, 32)
  ctx.rotate(f ? 0.25 : -0.2)
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(-22, -14, 44, 28)
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(-22, -14)
  ctx.lineTo(0, 4)
  ctx.lineTo(22, -14)
  ctx.stroke()
  ctx.fillStyle = '#ef4444'
  heartPath(ctx, 0, 2, 5)
  ctx.fill()
  ctx.fillStyle = '#16a34a'
  ctx.fillRect(12, -11, 7, 8)
  ctx.restore()
}

// -- a bell ringer ----------------------------------------------------------------------------------

function bellRinger(ringing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU * (ringing ? 2 : 1)
    const swing = Math.sin(p) * (ringing ? 0.9 : 0.35)
    // Boots and a long coat with a cape.
    ctx.fillStyle = '#1f2937'
    rr(ctx, 76, 236, 24, 18, 6)
    rr(ctx, 104, 236, 26, 18, 6)
    const g = ctx.createLinearGradient(60, 0, 150, 0)
    g.addColorStop(0, shade(color, -0.3))
    g.addColorStop(0.5, shade(color, 0.05))
    g.addColorStop(1, shade(color, -0.3))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(84, 96)
    ctx.lineTo(122, 96)
    ctx.lineTo(140, 240)
    ctx.lineTo(66, 240)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = shade(color, -0.15)
    ctx.beginPath()
    ctx.moveTo(78, 100)
    ctx.quadraticCurveTo(104, 92, 130, 100)
    ctx.lineTo(140, 140)
    ctx.quadraticCurveTo(104, 150, 68, 140)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = color2
    for (const y of [150, 172, 194, 216]) {
      circle(ctx, 104, y, 3)
      ctx.fill()
    }
    // Back arm holding a lantern.
    const [lx, ly] = limb(ctx, 82, 110, 30, 30, -0.15, 0.35, 13, shade(color, -0.25))
    ctx.strokeStyle = '#44403c'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(lx, ly)
    ctx.lineTo(lx, ly + 10)
    ctx.stroke()
    glow(ctx, lx, ly + 26, 26, '#fbbf24', 0.6)
    ctx.fillStyle = '#44403c'
    rr(ctx, lx - 10, ly + 10, 20, 6, 2)
    rr(ctx, lx - 10, ly + 38, 20, 6, 2)
    ctx.fillStyle = '#fde68a'
    ctx.fillRect(lx - 8, ly + 16, 16, 22)
    // A long striped scarf.
    ctx.fillStyle = '#16a34a'
    rr(ctx, 84, 92, 40, 12, 6)
    ctx.save()
    ctx.translate(114, 100)
    ctx.rotate(-0.1 + swing * 0.1)
    ctx.fillRect(-6, 0, 12, 52)
    ctx.fillStyle = '#ffffff'
    for (const y of [12, 28, 44]) ctx.fillRect(-6, y, 12, 5)
    ctx.restore()
    // Head, rosy, singing; a top hat with a sprig of holly.
    ctx.fillStyle = SKIN
    circle(ctx, 104, 74, 20)
    ctx.fill()
    ctx.fillStyle = rgba('#f43f5e', 0.45)
    circle(ctx, 114, 80, 5)
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, 114, 70, 2.4)
    ctx.fill()
    ctx.fillStyle = '#7f1d1d'
    ellipse(ctx, 116, 84, 4, ringing ? 5 : 2.5)
    ctx.fill()
    ctx.fillStyle = '#a8a29e'
    ctx.beginPath()
    ctx.moveTo(86, 70)
    ctx.quadraticCurveTo(84, 92, 98, 92)
    ctx.lineTo(96, 76)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(80, 52, 50, 6)
    ctx.fillRect(88, 18, 34, 36)
    ctx.fillStyle = '#dc2626'
    ctx.fillRect(88, 44, 34, 6)
    ctx.fillStyle = '#16a34a'
    ellipse(ctx, 118, 44, 7, 3.5, -0.5)
    ctx.fill()
    ctx.fillStyle = '#ef4444'
    circle(ctx, 114, 46, 2.5)
    ctx.fill()
    // The ringing arm: the bell swinging up and down from the elbow.
    const a1 = 1.9 + swing * 0.25
    const [hx, hy] = limb(ctx, 120, 108, 28, 24, a1, -0.6 + swing * 0.5, 13, color)
    ctx.save()
    ctx.translate(hx, hy)
    ctx.rotate(-0.4 + swing * 0.8)
    ctx.fillStyle = '#7c2d12'
    ctx.fillRect(-3, -18, 6, 18)
    const bg = ctx.createLinearGradient(-14, 0, 14, 0)
    bg.addColorStop(0, shade(color2, -0.3))
    bg.addColorStop(0.4, shade(color2, 0.4))
    bg.addColorStop(1, shade(color2, -0.35))
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.moveTo(-6, 0)
    ctx.quadraticCurveTo(-8, 18, -16, 26)
    ctx.lineTo(16, 26)
    ctx.quadraticCurveTo(8, 18, 6, 0)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = shade(color2, -0.4)
    circle(ctx, swing * 5, 28, 4)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = '#f8fafc'
    circle(ctx, hx, hy, 7)
    ctx.fill()
    if (ringing && Math.abs(swing) > 0.75) {
      ctx.strokeStyle = shade(color2, 0.3)
      ctx.lineWidth = 3
      for (let k = 0; k < 3; k++) {
        ctx.beginPath()
        ctx.arc(hx + 12, hy + 22, 22 + k * 8, -0.8, 0.4)
        ctx.stroke()
      }
    }
  }
}

// -- cookies and milk for Santa -----------------------------------------------------------------------

function cookiePlate(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  // 0: cookies, milk and a carrot for the reindeer, "For Santa"; 1: the steam of the warm cookies glinting;
  // 2: Christmas morning, crumbs, an empty glass and "Thank you! ♥ S".
  const eaten = f === 2
  // The plate.
  ctx.fillStyle = '#e2e8f0'
  ellipse(ctx, 92, 136, 76, 16)
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  ellipse(ctx, 92, 132, 70, 13)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ellipse(ctx, 92, 132, 64, 11)
  ctx.stroke()
  const cookie = (x: number, y: number, r: number, bite: boolean) => {
    ctx.fillStyle = '#d97706'
    ctx.beginPath()
    if (bite) {
      ctx.arc(x, y, r, 0.9, TAU - 0.4)
      ctx.arc(x + r * 0.95, y - r * 0.05, r * 0.45, Math.PI + 0.6, Math.PI - 0.7, true)
    } else ctx.arc(x, y, r, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#451a03'
    for (let k = 0; k < 5; k++) {
      circle(ctx, x + (noise(x + k) - 0.5) * r * 1.2, y + (noise(y + k * 3) - 0.5) * r * 1.2, 2.6)
      ctx.fill()
    }
  }
  if (!eaten) {
    cookie(66, 120, 20, false)
    cookie(104, 122, 20, false)
    cookie(84, 104, 20, false)
    // A carrot for the reindeer.
    ctx.fillStyle = '#f97316'
    ctx.beginPath()
    ctx.moveTo(122, 136)
    ctx.lineTo(160, 128)
    ctx.lineTo(124, 128)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#16a34a'
    ellipse(ctx, 166, 126, 8, 3, -0.3)
    ctx.fill()
    if (f === 1) {
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(70 + k * 16, 92)
        ctx.bezierCurveTo(62 + k * 16, 80, 78 + k * 16, 72, 70 + k * 16, 58)
        ctx.stroke()
      }
    }
  } else {
    // Crumbs, a bitten cookie and the stalk of the carrot.
    cookie(70, 124, 14, true)
    ctx.fillStyle = '#d97706'
    for (let k = 0; k < 14; k++) {
      circle(ctx, 50 + noise(k) * 90, 124 + noise(k + 20) * 14, 1.5 + noise(k + 40) * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#16a34a'
    ellipse(ctx, 140, 130, 8, 3, -0.3)
    ctx.fill()
  }
  // The glass of milk.
  ctx.fillStyle = 'rgba(226,232,240,0.35)'
  ctx.beginPath()
  ctx.moveTo(176, 140)
  ctx.lineTo(172, 70)
  ctx.lineTo(206, 70)
  ctx.lineTo(202, 140)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  const top = eaten ? 132 : 80
  ctx.moveTo(176, 140)
  ctx.lineTo(172 + (140 - top) * 0 + (top - 70) * 0.06, top)
  ctx.lineTo(206 - (top - 70) * 0.06, top)
  ctx.lineTo(202, 140)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(176, 140)
  ctx.lineTo(172, 70)
  ctx.moveTo(206, 70)
  ctx.lineTo(202, 140)
  ctx.stroke()
  // The note, propped on the glass.
  ctx.save()
  ctx.translate(120, 52)
  ctx.rotate(-0.08)
  ctx.fillStyle = '#fefce8'
  ctx.fillRect(-46, -20, 92, 38)
  ctx.strokeStyle = color2
  ctx.lineWidth = 2
  ctx.strokeRect(-43, -17, 86, 32)
  ctx.fillStyle = color
  ctx.font = 'bold 16px Georgia, serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(eaten ? 'Thank you!' : 'For Santa', 0, eaten ? -6 : 0)
  if (eaten) {
    ctx.font = 'italic 13px Georgia, serif'
    ctx.fillText('♥ S.', 0, 10)
  }
  ctx.restore()
}

// -- a moose with lights in its antlers ---------------------------------------------------------------

function moose(looking: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const s = looking ? 0 : Math.sin(p)
    const c = looking ? 0 : Math.cos(p)
    const body = color
    const dark = shade(body, -0.3)
    // Far legs, then the body with its hump.
    for (const [x, a] of [[96, -s * 0.45], [196, s * 0.45]] as const) {
      limb(ctx, x, 150, 44, 44, a, Math.max(0, -a) * 0.8, 12, dark)
    }
    const g = ctx.createLinearGradient(0, 96, 0, 170)
    g.addColorStop(0, shade(body, 0.12))
    g.addColorStop(1, shade(body, -0.25))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(78, 120)
    ctx.quadraticCurveTo(80, 92, 130, 96)
    ctx.quadraticCurveTo(176, 72, 212, 104)
    ctx.quadraticCurveTo(226, 140, 206, 166)
    ctx.quadraticCurveTo(140, 178, 86, 162)
    ctx.quadraticCurveTo(70, 146, 78, 120)
    ctx.fill()
    ctx.fillStyle = shade(body, -0.15)
    ctx.beginPath()
    ctx.moveTo(74, 116)
    ctx.lineTo(64, 128)
    ctx.lineTo(76, 128)
    ctx.fill()
    for (const [x, a] of [[110, s * 0.45], [206, -s * 0.45]] as const) {
      const [fx, fy] = limb(ctx, x, 156, 44, 44, a, Math.max(0, -a) * 0.8, 14, body)
      ctx.fillStyle = '#292524'
      ellipse(ctx, fx + 3, fy + 3, 8, 5)
      ctx.fill()
    }
    // Neck and the long head, lowered while walking, raised to look.
    const lift = looking ? 1 : 0
    ctx.save()
    ctx.translate(212, 106)
    ctx.rotate(-0.15 - lift * 0.45 + c * 0.04)
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.moveTo(-14, -16)
    ctx.quadraticCurveTo(16, -26, 36, -6)
    ctx.lineTo(28, 30)
    ctx.quadraticCurveTo(0, 30, -10, 26)
    ctx.closePath()
    ctx.fill()
    // The bell under its chin.
    ctx.fillStyle = dark
    ctx.beginPath()
    ctx.moveTo(28, 18)
    ctx.quadraticCurveTo(26, 46, 18, 50)
    ctx.quadraticCurveTo(16, 30, 12, 22)
    ctx.fill()
    // Head: long, a big droopy nose.
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.moveTo(26, -14)
    ctx.quadraticCurveTo(52, -16, 76, 4)
    ctx.quadraticCurveTo(86, 16, 76, 26)
    ctx.quadraticCurveTo(52, 30, 30, 18)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = shade(body, -0.2)
    ellipse(ctx, 74, 14, 12, 12)
    ctx.fill()
    ctx.fillStyle = '#1c1917'
    ellipse(ctx, 80, 14, 3, 2.4)
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, 42, -2, 3.4)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    circle(ctx, 43, -3, 1.1)
    ctx.fill()
    // Ear.
    ctx.fillStyle = dark
    ellipse(ctx, 22, -18, 6, 13, -0.6 - lift * 0.4)
    ctx.fill()
    // Broad flat antlers, a string of lights wound round them, twinkling (all lit and blinking when it looks).
    ctx.fillStyle = '#d6c4a8'
    ctx.beginPath()
    ctx.moveTo(26, -24)
    ctx.quadraticCurveTo(-6, -40, -24, -70)
    for (let k = 0; k < 5; k++) {
      ctx.lineTo(-20 + k * 12, -88 + (k % 2) * 6)
      ctx.lineTo(-14 + k * 12, -70)
    }
    ctx.quadraticCurveTo(40, -60, 34, -26)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    ctx.save()
    ctx.translate(212, 106)
    ctx.rotate(-0.15 - lift * 0.45 + c * 0.04)
    const colours = ['#ef4444', '#22c55e', '#facc15', '#3b82f6', '#f472b6']
    for (let k = 0; k < 9; k++) {
      const u = k / 8
      const x = -18 + u * 56
      const y = -74 + Math.sin(u * 9) * 6 + u * 10
      const on = looking ? (k + f) % 2 === 0 : (k + f) % 3 !== 0
      const col = k % 3 === 0 ? color2 : colours[k % colours.length]
      if (on) glow(ctx, x, y, 11, col, 0.75)
      ctx.fillStyle = on ? shade(col, 0.4) : shade(col, -0.5)
      circle(ctx, x, y, 3.4)
      ctx.fill()
    }
    ctx.restore()
  }
}

// -- sugar plum fairies -----------------------------------------------------------------------------

function sugarPlumFairy(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const flap = Math.sin(p)
  ctx.save()
  ctx.translate(110, 100)
  ctx.rotate(0.35)
  // Wings, see-through and flapping.
  for (const [d, k] of [[-1, 0.6], [1, 1]] as const) {
    ctx.save()
    ctx.scale(1, 0.55 + 0.45 * Math.abs(flap) * k + 0.1)
    ctx.fillStyle = `rgba(224,242,254,${0.4 + 0.2 * k})`
    ellipse(ctx, -24 + d * 4, -46, 22, 42, -0.5 + d * 0.1)
    ctx.fill()
    ellipse(ctx, -32 + d * 4, 4, 16, 26, 0.6)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.lineWidth = 1.5
    ellipse(ctx, -24 + d * 4, -46, 22, 42, -0.5 + d * 0.1)
    ctx.stroke()
    ctx.restore()
  }
  // Legs trailing out behind, pointed toes.
  ctx.strokeStyle = SKIN
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-6, 30)
  ctx.lineTo(-40, 50 + flap * 3)
  ctx.moveTo(4, 30)
  ctx.lineTo(-30, 62 - flap * 3)
  ctx.stroke()
  ctx.fillStyle = color
  ellipse(ctx, -42, 51 + flap * 3, 6, 3.5, 0.5)
  ellipse(ctx, -32, 63 - flap * 3, 6, 3.5, 0.5)
  ctx.fill()
  // The tutu, layer on layer.
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = shade(color, 0.15 * k)
    ellipse(ctx, 0, 24 + k * 2, 34 - k * 6, 10 - k * 2, -0.15)
    ctx.fill()
  }
  // Body and arms: one out with the wand.
  ctx.fillStyle = shade(color, -0.1)
  rr(ctx, -10, -8, 22, 32, 9)
  ctx.strokeStyle = SKIN
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(8, -2)
  ctx.lineTo(34, -12)
  ctx.moveTo(-6, -2)
  ctx.lineTo(-18, 12)
  ctx.stroke()
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(32, -10)
  ctx.lineTo(54, -30)
  ctx.stroke()
  glow(ctx, 56, -32, 16, color2, 0.9)
  ctx.fillStyle = color2
  ctx.beginPath()
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU - Math.PI / 2 + f * 0.3
    const r = k % 2 ? 3 : 8
    ctx.lineTo(56 + Math.cos(a) * r, -32 + Math.sin(a) * r)
  }
  ctx.fill()
  // Head with her hair in a bun and a little crown.
  ctx.fillStyle = SKIN
  circle(ctx, 2, -22, 13)
  ctx.fill()
  ctx.fillStyle = '#7c2d12'
  ctx.beginPath()
  ctx.arc(0, -24, 14, Math.PI * 0.95, Math.PI * 1.95)
  ctx.fill()
  circle(ctx, -12, -34, 8)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(-6, -36)
  ctx.lineTo(-4, -46)
  ctx.lineTo(0, -40)
  ctx.lineTo(4, -48)
  ctx.lineTo(8, -40)
  ctx.lineTo(12, -44)
  ctx.lineTo(12, -34)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 9, -22, 1.8)
  ctx.fill()
  ctx.fillStyle = rgba('#f43f5e', 0.5)
  circle(ctx, 8, -16, 3)
  ctx.fill()
  ctx.restore()
}

// -- a nativity -------------------------------------------------------------------------------------

function nativity(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  // From a dim stable under a faint star, to the star blazing, light pouring out and an angel above the roof.
  const level = f / (frames - 1)
  // The star and its rays.
  const sx = 150
  const sy = 34
  glow(ctx, sx, sy, 30 + level * 40, color2, 0.4 + 0.6 * level)
  if (level > 0.2) {
    ctx.strokeStyle = rgba(color2, 0.3 + 0.5 * level)
    ctx.lineWidth = 3
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + Math.PI / 8
      const len = (k === 2 ? 70 : 22) * (0.4 + level)
      ctx.beginPath()
      ctx.moveTo(sx + Math.cos(a) * 10, sy + Math.sin(a) * 10)
      ctx.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len)
      ctx.stroke()
    }
  }
  ctx.fillStyle = shade(color2, 0.3 + 0.4 * level)
  ctx.beginPath()
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU - Math.PI / 2
    const r = k % 2 ? 4 : k % 4 === 0 ? 16 : 9
    ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r)
  }
  ctx.fill()
  // The angel, once the star is bright.
  if (level > 0.7) {
    const a = (level - 0.7) / 0.3
    ctx.globalAlpha = a
    glow(ctx, 70, 70, 40, '#fef9c3', 0.5)
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ellipse(ctx, 54, 64, 18, 10, -0.6)
    ellipse(ctx, 86, 64, 18, 10, 0.6)
    ctx.fill()
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(70, 60)
    ctx.lineTo(58, 100)
    ctx.lineTo(82, 100)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = SKIN
    circle(ctx, 70, 54, 7)
    ctx.fill()
    ctx.strokeStyle = '#facc15'
    ctx.lineWidth = 2
    ellipse(ctx, 70, 44, 8, 2.5)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  // The stable: posts and a thatched roof.
  const wood = '#92400e'
  ctx.fillStyle = wood
  ctx.fillRect(40, 120, 10, 156)
  ctx.fillRect(250, 120, 10, 156)
  const inside = ctx.createRadialGradient(150, 230, 10, 150, 210, 130)
  inside.addColorStop(0, rgba('#fde68a', 0.15 + 0.6 * level))
  inside.addColorStop(1, rgba('#fde68a', 0.02 + 0.1 * level))
  ctx.fillStyle = inside
  ctx.fillRect(50, 124, 200, 152)
  ctx.fillStyle = '#a16207'
  ctx.beginPath()
  ctx.moveTo(22, 132)
  ctx.lineTo(150, 82)
  ctx.lineTo(278, 132)
  ctx.lineTo(270, 140)
  ctx.lineTo(150, 98)
  ctx.lineTo(30, 140)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#ca8a04'
  ctx.lineWidth = 2
  for (let k = 0; k < 18; k++) {
    const u = k / 17
    const x = 30 + u * 240
    const y = 136 - (1 - Math.abs(u - 0.5) * 2) * 46
    ctx.beginPath()
    ctx.moveTo(x, y - 6)
    ctx.lineTo(x + 3, y + 8)
    ctx.stroke()
  }
  // Straw on the floor.
  ctx.fillStyle = '#ca8a04'
  ellipse(ctx, 150, 272, 110, 8)
  ctx.fill()
  // The manger and the baby, glowing.
  glow(ctx, 150, 236, 34 + 20 * level, '#fef3c7', 0.35 + 0.5 * level)
  ctx.fillStyle = wood
  ctx.beginPath()
  ctx.moveTo(122, 240)
  ctx.lineTo(178, 240)
  ctx.lineTo(170, 258)
  ctx.lineTo(130, 258)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = wood
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(128, 256)
  ctx.lineTo(118, 272)
  ctx.moveTo(172, 256)
  ctx.lineTo(182, 272)
  ctx.stroke()
  ctx.fillStyle = '#facc15'
  ellipse(ctx, 150, 240, 30, 5)
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  ellipse(ctx, 152, 234, 16, 7)
  ctx.fill()
  ctx.fillStyle = SKIN
  circle(ctx, 136, 232, 6)
  ctx.fill()
  // Mary kneeling on the left, in blue.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(92, 270)
  ctx.quadraticCurveTo(84, 220, 100, 196)
  ctx.quadraticCurveTo(110, 186, 116, 196)
  ctx.quadraticCurveTo(124, 230, 122, 270)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  ellipse(ctx, 106, 196, 11, 13)
  ctx.fill()
  ctx.fillStyle = SKIN
  circle(ctx, 109, 198, 7)
  ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(106, 194, 13, Math.PI * 0.9, Math.PI * 2.1)
  ctx.lineTo(118, 214)
  ctx.lineTo(96, 214)
  ctx.closePath()
  ctx.fill()
  // Joseph standing on the right with his staff.
  ctx.fillStyle = '#a16207'
  ctx.beginPath()
  ctx.moveTo(186, 272)
  ctx.lineTo(192, 196)
  ctx.lineTo(214, 196)
  ctx.lineTo(220, 272)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#78350f'
  ctx.fillRect(194, 194, 18, 30)
  ctx.fillStyle = SKIN
  circle(ctx, 201, 184, 8)
  ctx.fill()
  ctx.fillStyle = '#78716c'
  ellipse(ctx, 200, 192, 7, 6)
  ctx.fill()
  ctx.fillStyle = '#d6d3d1'
  ctx.beginPath()
  ctx.arc(203, 182, 10, Math.PI, 0)
  ctx.lineTo(214, 196)
  ctx.lineTo(192, 196)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#7c2d12'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(226, 272)
  ctx.lineTo(226, 170)
  ctx.arc(218, 170, 8, 0, Math.PI, true)
  ctx.stroke()
}

// -- penguins ice fishing ---------------------------------------------------------------------------

function iceFishing(catching: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = f / frames
    // Pulling the fish up out of the hole and holding it up, then letting it back down.
    const up = catching ? Math.sin(Math.min(1, p / 0.6) * (Math.PI / 2)) : 0
    const bob = catching ? 0 : Math.sin(p * TAU) * 3
    // The snow and the hole in the ice.
    ctx.fillStyle = rgba('#e0f2fe', 0.85)
    ellipse(ctx, 110, 190, 96, 10)
    ctx.fill()
    ctx.fillStyle = '#1e3a8a'
    ellipse(ctx, 150, 188, 26, 6)
    ctx.fill()
    ctx.fillStyle = '#3b82f6'
    ellipse(ctx, 150, 189, 20, 3.5)
    ctx.fill()
    // A little bucket to sit on.
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(50, 190)
    ctx.lineTo(46, 152)
    ctx.lineTo(90, 152)
    ctx.lineTo(86, 190)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = shade(color2, -0.25)
    ctx.fillRect(44, 150, 48, 6)
    // The penguin sitting on it: round black back, white front, feet.
    ctx.fillStyle = '#f59e0b'
    ellipse(ctx, 92, 188, 12, 4)
    ellipse(ctx, 104, 188, 12, 4)
    ctx.fill()
    ctx.fillStyle = color
    ellipse(ctx, 76, 128 - up * 4, 30, 40)
    ctx.fill()
    ctx.fillStyle = '#f8fafc'
    ellipse(ctx, 86, 134 - up * 4, 20, 31)
    ctx.fill()
    // Head, a woolly hat, beak, eye.
    ctx.fillStyle = color
    circle(ctx, 82, 84 - up * 6, 20)
    ctx.fill()
    ctx.fillStyle = '#f8fafc'
    ellipse(ctx, 90, 88 - up * 6, 10, 12)
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, 92, 84 - up * 6, 2.6)
    ctx.fill()
    ctx.fillStyle = '#f59e0b'
    ctx.beginPath()
    ctx.moveTo(98, 88 - up * 6)
    ctx.lineTo(110, 92 - up * 6)
    ctx.lineTo(98, 94 - up * 6)
    ctx.fill()
    ctx.fillStyle = '#dc2626'
    ctx.beginPath()
    ctx.arc(82, 80 - up * 6, 20, Math.PI * 1.05, -0.05 * Math.PI)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    rr(ctx, 61, 72 - up * 6, 42, 7, 3)
    circle(ctx, 82, 58 - up * 6, 6)
    ctx.fill()
    // The rod, the line down the hole, the fish on it.
    const tipX = 150
    const tipY = 70 - up * 30 + bob
    ctx.strokeStyle = '#78350f'
    ctx.lineWidth = 3.5
    ctx.beginPath()
    ctx.moveTo(92, 128)
    ctx.lineTo(tipX, tipY)
    ctx.stroke()
    const fishY = 196 - up * 100
    ctx.strokeStyle = 'rgba(226,232,240,0.8)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(tipX, tipY)
    ctx.lineTo(150, Math.min(188, fishY - 14))
    ctx.stroke()
    // Flipper on the rod.
    ctx.fillStyle = shade(color, 0.15)
    ellipse(ctx, 100, 124, 8, 18, -0.9)
    ctx.fill()
    if (up > 0.05) {
      ctx.save()
      ctx.translate(150, fishY)
      ctx.rotate(Math.PI / 2 + Math.sin(p * 30) * 0.25 * up)
      ctx.fillStyle = '#38bdf8'
      ellipse(ctx, 0, 0, 16, 7)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(-14, 0)
      ctx.lineTo(-26, -8)
      ctx.lineTo(-26, 8)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#111'
      circle(ctx, 9, -2, 1.6)
      ctx.fill()
      ctx.restore()
      // The splash as it comes out.
      if (up < 0.5) {
        ctx.fillStyle = rgba('#bae6fd', 0.8)
        for (let k = -2; k <= 2; k++) {
          circle(ctx, 150 + k * 8, 182 - (2 - Math.abs(k)) * 6 * (0.5 - up) * 2, 3)
          ctx.fill()
        }
      }
    }
  }
}

// -- lit lawn reindeer ------------------------------------------------------------------------------

function lawnReindeer(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  // A wire frame strung with white lights. Head turned back (left), up ahead, turned out (right), down grazing.
  const pose = f % 4
  const lines: [number, number, number, number][] = []
  const path = (pts: [number, number][]) => {
    for (let k = 0; k < pts.length - 1; k++) lines.push([pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]])
  }
  // Body and legs.
  path([[60, 112], [90, 98], [140, 100], [160, 108], [162, 130], [140, 140], [80, 140], [56, 132], [60, 112]])
  path([[70, 140], [66, 176], [68, 210]])
  path([[86, 140], [92, 176], [90, 210]])
  path([[140, 140], [140, 176], [144, 210]])
  path([[154, 136], [162, 176], [166, 210]])
  path([[56, 116], [44, 108]])
  // Neck and head by pose.
  const heads: Record<number, [number, number][]> = {
    0: [[150, 104], [150, 74], [128, 58], [112, 64], [126, 72], [150, 74]],
    1: [[150, 104], [160, 62], [182, 48], [194, 58], [174, 72], [160, 62]],
    2: [[150, 104], [168, 74], [192, 72], [196, 84], [176, 86], [168, 74]],
    3: [[150, 108], [176, 150], [188, 196], [176, 202], [168, 186], [176, 150]],
  }
  path(heads[pose])
  // Antlers.
  const [ax, ay] = pose === 0 ? [138, 60] : pose === 1 ? [174, 50] : pose === 2 ? [178, 72] : [176, 160]
  const flip = pose === 0 ? -1 : 1
  const up = pose === 3 ? 0.6 : 1
  path([[ax, ay], [ax - 8 * flip, ay - 26 * up], [ax - 20 * flip, ay - 44 * up]])
  path([[ax - 8 * flip, ay - 26 * up], [ax + 6 * flip, ay - 40 * up]])
  path([[ax + 6 * flip, ay], [ax + 14 * flip, ay - 22 * up], [ax + 26 * flip, ay - 36 * up]])
  // The wire, a glow along it, and the bulbs, a few twinkling.
  ctx.strokeStyle = rgba(color, 0.25)
  ctx.lineWidth = 10
  ctx.lineCap = 'round'
  for (const [x1, y1, x2, y2] of lines) {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  ctx.strokeStyle = shade(color, -0.1)
  ctx.lineWidth = 2.5
  for (const [x1, y1, x2, y2] of lines) {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  let k = 0
  for (const [x1, y1, x2, y2] of lines) {
    const len = Math.hypot(x2 - x1, y2 - y1)
    const count = Math.max(1, Math.round(len / 11))
    for (let j = 0; j < count; j++) {
      const u = (j + 0.5) / count
      const x = x1 + (x2 - x1) * u
      const y = y1 + (y2 - y1) * u
      const tw = noise(k * 1.7 + f * 0.31) > 0.85
      if (tw) glow(ctx, x, y, 9, color, 0.9)
      ctx.fillStyle = tw ? '#ffffff' : shade(color, 0.2)
      circle(ctx, x, y, 2.6)
      ctx.fill()
      k++
    }
  }
  // A red bow round the neck.
  const [bx, by] = pose === 3 ? [160, 124] : [152, 96]
  ctx.fillStyle = color2
  ellipse(ctx, bx - 7, by, 7, 4, 0.4)
  ellipse(ctx, bx + 7, by, 7, 4, -0.4)
  ctx.fill()
  circle(ctx, bx, by, 3)
  ctx.fill()
}

// -- a blow-up Santa --------------------------------------------------------------------------------

function blowUpSanta(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  // Flat on the lawn with the fan whirring, filling up wobbling and leaning, to standing tall and waving.
  const level = f / (frames - 1)
  // The fan box and the stakes.
  ctx.fillStyle = '#334155'
  rr(ctx, 136, 296, 34, 20, 4)
  ctx.strokeStyle = '#64748b'
  ctx.lineWidth = 2
  circle(ctx, 153, 306, 7)
  ctx.stroke()
  if (level < 0.12) {
    // A heap of red and white on the grass.
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(40, 316)
    ctx.quadraticCurveTo(60, 290, 90, 300)
    ctx.quadraticCurveTo(110, 286, 140, 304)
    ctx.quadraticCurveTo(170, 296, 186, 316)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = FUR
    ellipse(ctx, 80, 306, 22, 6, 0.2)
    ellipse(ctx, 160, 312, 14, 4)
    ctx.fill()
    ctx.fillStyle = SKIN
    ellipse(ctx, 120, 300, 16, 6, -0.1)
    ctx.fill()
    ctx.fillStyle = '#111'
    rr(ctx, 50, 308, 22, 8, 4)
    return
  }
  const h = 0.2 + 0.8 * level
  const lean = (1 - level) * 0.15 * (f % 2 ? 1 : -0.6)
  ctx.save()
  ctx.translate(110, 316)
  ctx.rotate(lean)
  ctx.scale(1 + (1 - level) * 0.12, h)
  ctx.translate(-110, -316)
  // Boots, the round body, belt, the beard and face, the hat; seams in the plastic.
  ctx.fillStyle = '#111'
  rr(ctx, 66, 290, 36, 26, 10)
  rr(ctx, 118, 290, 36, 26, 10)
  const g = ctx.createRadialGradient(96, 190, 10, 110, 210, 110)
  g.addColorStop(0, shade(color, 0.3))
  g.addColorStop(1, shade(color, -0.2))
  ctx.fillStyle = g
  ellipse(ctx, 110, 220, 74, 84)
  ctx.fill()
  ctx.fillStyle = FUR
  rr(ctx, 102, 140, 16, 160, 6)
  ctx.fillStyle = '#111'
  rr(ctx, 38, 226, 144, 18, 6)
  ctx.fillStyle = color2
  rr(ctx, 98, 222, 24, 26, 4)
  ctx.fillStyle = '#111'
  rr(ctx, 104, 228, 12, 14, 2)
  // Arms: one down, one up waving once he is full.
  ctx.fillStyle = color
  ctx.save()
  ctx.translate(46, 178)
  ctx.rotate(0.35)
  rr(ctx, -14, 0, 28, 74, 14)
  ctx.fillStyle = '#f8fafc'
  circle(ctx, 0, 78, 14)
  ctx.fill()
  ctx.restore()
  ctx.save()
  ctx.translate(174, 178)
  ctx.rotate(level > 0.9 ? -2.6 : -0.35 - level * 0.6)
  ctx.fillStyle = color
  rr(ctx, -14, 0, 28, 74, 14)
  ctx.fillStyle = '#f8fafc'
  circle(ctx, 0, 78, 14)
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = SKIN
  circle(ctx, 110, 104, 36)
  ctx.fill()
  ctx.fillStyle = FUR
  ctx.beginPath()
  ctx.moveTo(72, 104)
  ctx.quadraticCurveTo(70, 176, 110, 182)
  ctx.quadraticCurveTo(150, 176, 148, 104)
  ctx.quadraticCurveTo(110, 130, 72, 104)
  ctx.fill()
  ellipse(ctx, 98, 124, 15, 7, 0.2)
  ellipse(ctx, 122, 124, 15, 7, -0.2)
  ctx.fill()
  ctx.fillStyle = '#fb7185'
  circle(ctx, 110, 114, 7)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 98, 98, 4)
  circle(ctx, 122, 98, 4)
  ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(74, 84)
  ctx.quadraticCurveTo(84, 20, 128, 30)
  ctx.quadraticCurveTo(160, 42, 166, 90)
  ctx.lineTo(146, 82)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = FUR
  rr(ctx, 70, 76, 80, 16, 8)
  circle(ctx, 166, 94, 12)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'
  ctx.lineWidth = 2
  for (const x of [70, 150]) {
    ctx.beginPath()
    ctx.moveTo(x, 160)
    ctx.quadraticCurveTo(x + (x < 110 ? -8 : 8), 220, x, 290)
    ctx.stroke()
  }
  ctx.restore()
  // Ropes to the stakes.
  ctx.strokeStyle = 'rgba(226,232,240,0.6)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(110 - 60 * (1 + (1 - level) * 0.12), 316 - 200 * h)
  ctx.lineTo(16, 316)
  ctx.moveTo(110 + 60 * (1 + (1 - level) * 0.12), 316 - 200 * h)
  ctx.lineTo(204, 316)
  ctx.stroke()
}

// -- an elf hanging the lights ----------------------------------------------------------------------

function lightsElf(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  // Up a ladder stringing the lights along the gutter: as people come, more and more of them light,
  // and with all of them on the elf waves.
  const level = f / (frames - 1)
  const done = level > 0.95
  // The gutter line the lights hang from.
  ctx.strokeStyle = 'rgba(226,232,240,0.35)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(60, 30)
  ctx.lineTo(258, 30)
  ctx.stroke()
  // The lights: drooping between hooks, lit from the far end back to the elf.
  for (let k = 0; k < 4; k++) {
    const x1 = 70 + k * 46
    const lit = Math.max(0, Math.min(1, level * 4 - (3 - k)))
    bulbs(ctx, x1 + 46, 30, x1, 30, 5, 10, lit, f + k)
  }
  // The ladder.
  ctx.strokeStyle = '#a8a29e'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(30, 278)
  ctx.lineTo(62, 70)
  ctx.moveTo(80, 278)
  ctx.lineTo(62, 70)
  ctx.moveTo(52, 278)
  ctx.lineTo(74, 70)
  ctx.stroke()
  ctx.lineWidth = 4
  for (let k = 0; k < 7; k++) {
    const y = 250 - k * 28
    const u = (278 - y) / 208
    ctx.beginPath()
    ctx.moveTo(30 + u * 32, y)
    ctx.lineTo(52 + u * 22, y)
    ctx.stroke()
  }
  // The elf on the ladder: legs, tunic, head; one arm up holding the string to the gutter, or waving.
  const ex = 72
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(ex - 12, 150, 9, 36)
  ctx.fillRect(ex + 2, 150, 9, 30)
  ctx.fillStyle = '#dc2626'
  for (let y = 154; y < 184; y += 9) {
    ctx.fillRect(ex - 12, y, 9, 4)
    ctx.fillRect(ex + 2, y, 9, 4)
  }
  ctx.fillStyle = color
  ellipse(ctx, ex - 8, 188, 10, 5)
  ellipse(ctx, ex + 8, 182, 10, 5)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(ex - 18, 100)
  ctx.lineTo(ex + 16, 100)
  ctx.lineTo(ex + 22, 152)
  ctx.lineTo(ex - 22, 152)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#1f2937'
  ctx.fillRect(ex - 20, 126, 41, 6)
  // Coil of spare lights over the shoulder.
  ctx.strokeStyle = '#14532d'
  ctx.lineWidth = 3
  ellipse(ctx, ex - 14, 128, 12, 16, 0.3)
  ctx.stroke()
  ctx.fillStyle = SKIN
  circle(ctx, ex, 80, 17)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(ex - 14, 76)
  ctx.lineTo(ex - 26, 64)
  ctx.lineTo(ex - 12, 86)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, ex + 8, 78, 2.2)
  ctx.fill()
  ctx.strokeStyle = '#7c2d12'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(ex + 7, 84, 5, 0.2, Math.PI - 0.5)
  ctx.stroke()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(ex - 16, 72)
  ctx.quadraticCurveTo(ex - 4, 36, ex + 22, 46)
  ctx.quadraticCurveTo(ex + 34, 52, ex + 38, 66)
  ctx.quadraticCurveTo(ex + 18, 58, ex + 18, 72)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  rr(ctx, ex - 18, 68, 38, 8, 4)
  ctx.fillStyle = '#facc15'
  circle(ctx, ex + 38, 68, 5)
  ctx.fill()
  if (done) {
    const [hx, hy] = limb(ctx, ex + 12, 106, 20, 18, 2.6, 0.5, 9, color)
    ctx.fillStyle = SKIN
    circle(ctx, hx, hy, 5)
    ctx.fill()
  } else {
    // Reaching up to hook the lights on the gutter.
    const [hx, hy] = limb(ctx, ex + 12, 106, 22, 22, 2.75, 0.05, 9, color)
    ctx.fillStyle = SKIN
    circle(ctx, hx, hy, 5)
    ctx.fill()
    ctx.strokeStyle = '#14532d'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(hx, hy)
    ctx.lineTo(70, 30)
    ctx.stroke()
  }
}

// -- a one-horse open sleigh --------------------------------------------------------------------------

function horseSleigh(waving: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const s = Math.sin(p)
    const c = Math.cos(p)
    const horse = color
    const dark = shade(horse, -0.3)
    // The horse in front (to the right), trotting: diagonal legs together.
    const hx = 262
    const hy = 120 - Math.abs(c) * 4
    limb(ctx, hx - 30, hy + 14, 30, 30, -s * 0.5, Math.max(0, s) * 0.9, 9, dark)
    limb(ctx, hx + 32, hy + 12, 30, 30, s * 0.5, Math.max(0, -s) * 0.9, 9, dark)
    // Tail.
    ctx.fillStyle = shade(horse, -0.45)
    ctx.beginPath()
    ctx.moveTo(hx - 44, hy - 8)
    ctx.quadraticCurveTo(hx - 66, hy + 10 + s * 4, hx - 58, hy + 40)
    ctx.quadraticCurveTo(hx - 50, hy + 16, hx - 40, hy)
    ctx.fill()
    const g = ctx.createLinearGradient(0, hy - 22, 0, hy + 24)
    g.addColorStop(0, shade(horse, 0.15))
    g.addColorStop(1, shade(horse, -0.2))
    ctx.fillStyle = g
    ellipse(ctx, hx, hy, 48, 22)
    ctx.fill()
    for (const [x, a] of [[hx - 26, s * 0.5], [hx + 36, -s * 0.5]] as const) {
      const [fx, fy] = limb(ctx, x, hy + 14, 30, 30, a, Math.max(0, -a) * 0.9, 10, horse)
      ctx.fillStyle = '#1c1917'
      ellipse(ctx, fx + 2, fy + 3, 6, 4)
      ctx.fill()
    }
    // Neck and head, up and proud.
    ctx.fillStyle = horse
    ctx.beginPath()
    ctx.moveTo(hx + 26, hy - 14)
    ctx.quadraticCurveTo(hx + 40, hy - 50, hx + 58, hy - 64)
    ctx.lineTo(hx + 72, hy - 52)
    ctx.quadraticCurveTo(hx + 54, hy - 26, hx + 46, hy + 6)
    ctx.closePath()
    ctx.fill()
    ctx.save()
    ctx.translate(hx + 66, hy - 60)
    ctx.rotate(0.5 + c * 0.05)
    ellipse(ctx, 10, 0, 22, 10)
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, 2, -3, 2.4)
    ctx.fill()
    ctx.fillStyle = dark
    ellipse(ctx, -8, -12, 4, 8, -0.3)
    ctx.fill()
    ctx.restore()
    // Mane.
    ctx.strokeStyle = shade(horse, -0.45)
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    for (let k = 0; k < 5; k++) {
      ctx.beginPath()
      ctx.moveTo(hx + 34 + k * 6, hy - 22 - k * 9)
      ctx.lineTo(hx + 26 + k * 6, hy - 12 - k * 9 + s * 2)
      ctx.stroke()
    }
    // Harness, with a strap of jingle bells.
    ctx.strokeStyle = '#7f1d1d'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(hx - 4, hy - 22)
    ctx.lineTo(hx - 4, hy + 22)
    ctx.moveTo(hx + 30, hy - 30)
    ctx.lineTo(hx + 50, hy - 6)
    ctx.stroke()
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = '#facc15'
      circle(ctx, hx + 32 + k * 5.5, hy - 26 + k * 6.5, 3.6)
      ctx.fill()
    }
    // Shafts from the sleigh to the horse.
    ctx.strokeStyle = '#78350f'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(150, 140)
    ctx.lineTo(hx + 10, hy + 2)
    ctx.stroke()
    // The sleigh: a curling red body on runners, two people in it under a blanket.
    const people = [[72, '#1d4ed8', '#f8fafc'], [112, '#15803d', '#dc2626']] as const
    people.forEach(([x, coat, hat], k) => {
      const wave = waving ? Math.sin(p * 2 + k * 1.5) : 0
      ctx.fillStyle = coat
      rr(ctx, x - 16, 80, 32, 50, 10)
      ctx.fillStyle = SKIN
      circle(ctx, x, 68, 14)
      ctx.fill()
      ctx.fillStyle = hat
      ctx.beginPath()
      ctx.arc(x, 64, 15, Math.PI, 0)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      circle(ctx, x, 48, 5)
      ctx.fill()
      ctx.fillStyle = '#111'
      circle(ctx, x + 7, 68, 2)
      ctx.fill()
      if (waving) {
        const [ax, ay] = limb(ctx, x + 10, 90, 18, 16, 2.7 + wave * 0.25, 0.5 + wave * 0.4, 9, coat)
        ctx.fillStyle = '#dc2626'
        circle(ctx, ax, ay, 6)
        ctx.fill()
      }
    })
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(40, 82)
    ctx.quadraticCurveTo(26, 82, 30, 100)
    ctx.lineTo(44, 150)
    ctx.lineTo(150, 150)
    ctx.quadraticCurveTo(160, 120, 140, 104)
    ctx.lineTo(54, 104)
    ctx.quadraticCurveTo(52, 88, 40, 82)
    ctx.fill()
    ctx.strokeStyle = '#facc15'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(56, 128)
    ctx.bezierCurveTo(72, 112, 88, 140, 104, 124)
    ctx.bezierCurveTo(116, 112, 128, 132, 140, 120)
    ctx.stroke()
    // Runners, curling up at the front.
    ctx.strokeStyle = '#d6d3d1'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(30, 170)
    ctx.lineTo(160, 170)
    ctx.quadraticCurveTo(184, 170, 178, 148)
    ctx.quadraticCurveTo(172, 136, 164, 146)
    ctx.moveTo(60, 150)
    ctx.lineTo(56, 170)
    ctx.moveTo(130, 150)
    ctx.lineTo(134, 170)
    ctx.stroke()
  }
}

const BUBBLE = { id: 'bubble', frames: 1, w: 360, h: 140 }

export const CHRISTMAS_ROWS: Record<string, SpriteRow[]> = {
  nutcracker: [
    { id: 'main', frames: 4, w: 160, h: 300, paint: nutcracker(false) },
    { id: 'act', frames: 8, w: 160, h: 300, paint: nutcracker(true) },
    { ...BUBBLE, paint: saying('Crack!') },
    SPARKLE,
  ],
  'singing-wreath': [
    { id: 'main', frames: 4, w: 200, h: 200, paint: wreath(false) },
    { id: 'act', frames: 8, w: 200, h: 200, paint: wreath(true) },
    { id: 'note', frames: 2, w: 64, h: 64, paint: note },
    { id: 'thread', frames: 1, w: 8, h: 256, paint: ribbon },
    { ...BUBBLE, paint: saying('Fa la la la la!') },
    SPARKLE,
  ],
  mistletoe: [
    { id: 'main', frames: 4, w: 120, h: 130, paint: mistletoe },
    { id: 'note', frames: 2, w: 64, h: 64, paint: kissHeart },
    { id: 'thread', frames: 1, w: 8, h: 256, paint: ribbon },
    { ...BUBBLE, paint: saying('Pucker up!') },
    SPARKLE,
  ],
  // Dark, to every window lit and the gingerbread man at the door.
  'gingerbread-house': [
    { id: 'main', frames: 8, w: 260, h: 260, paint: gingerbreadHouse },
    { ...BUBBLE, paint: saying('Come on in!') },
    SPARKLE,
  ],
  'workshop-elves': [
    { id: 'main', frames: 6, w: 220, h: 220, paint: workshopElf(false) },
    { id: 'act', frames: 8, w: 220, h: 220, paint: workshopElf(true) },
    SPARKLE,
  ],
  // Proud and tall to a puddle, by the real temperature; waving and tipping his hat.
  'melting-snowman': [
    { id: 'main', frames: 8, w: 180, h: 260, paint: (ctx, f, n, c) => snowman(ctx, f / (n - 1), 0, c) },
    { id: 'act', frames: 4, w: 180, h: 260, paint: (ctx, f, n, c) => snowman(ctx, 0, (f + 0.5) / n, c) },
    { ...BUBBLE, paint: saying('Let it snow!') },
    { id: 'melt', frames: 1, w: 360, h: 140, paint: saying('I’m melting!') },
    SPARKLE,
  ],
  // Looking left, ahead, right, then "shh".
  'window-santa': [{ id: 'main', frames: 4, w: 200, h: 220, paint: windowSanta }, SPARKLE],
  'stuck-santa': [
    { id: 'main', frames: 8, w: 200, h: 260, paint: stuckSanta(false) },
    { id: 'act', frames: 8, w: 200, h: 260, paint: stuckSanta(true) },
    { ...BUBBLE, paint: saying('A little help?') },
    SPARKLE,
  ],
  krampus: [
    { id: 'main', frames: 8, w: 220, h: 290, paint: krampus(false) },
    // Standing to stare, the birch raised, chains and bells rattling.
    { id: 'look', frames: 4, w: 220, h: 290, paint: krampus(true) },
    { ...BUBBLE, paint: saying('Have you been good?') },
    SPARKLE,
  ],
  'snow-angels': [
    { id: 'main', frames: 2, w: 220, h: 210, paint: snowAngel(false) },
    { id: 'act', frames: 8, w: 220, h: 210, paint: snowAngel(true) },
    SPARKLE,
  ],
  yeti: [
    { id: 'main', frames: 8, w: 240, h: 300, paint: yeti(false) },
    { id: 'wave', frames: 8, w: 240, h: 300, paint: yeti(true) },
    { ...BUBBLE, paint: saying('RAWRRR!') },
    SPARKLE,
  ],
  'north-pole-mailbox': [
    { id: 'main', frames: 2, w: 210, h: 260, paint: northPoleMailbox(false) },
    { id: 'act', frames: 6, w: 210, h: 260, paint: northPoleMailbox(true) },
    { id: 'note', frames: 2, w: 64, h: 64, paint: letter },
    { ...BUBBLE, paint: saying('Dear Santa…') },
    SPARKLE,
  ],
  'bell-ringer': [
    { id: 'main', frames: 4, w: 200, h: 260, paint: bellRinger(false) },
    { id: 'act', frames: 8, w: 200, h: 260, paint: bellRinger(true) },
    { id: 'note', frames: 2, w: 64, h: 64, paint: note },
    { ...BUBBLE, paint: saying('Merry Christmas!') },
    SPARKLE,
  ],
  // Waiting for Santa, the warm cookies steaming, then Christmas morning.
  'cookies-for-santa': [
    { id: 'main', frames: 3, w: 220, h: 150, paint: cookiePlate },
    { ...BUBBLE, paint: saying('For Santa!') },
    { id: 'thanks', frames: 1, w: 360, h: 140, paint: saying('Santa came!') },
    SPARKLE,
  ],
  moose: [
    { id: 'main', frames: 8, w: 300, h: 250, paint: moose(false) },
    { id: 'look', frames: 4, w: 300, h: 250, paint: moose(true) },
    SPARKLE,
  ],
  'sugar-plum-fairies': [{ id: 'main', frames: 8, w: 220, h: 200, paint: sugarPlumFairy }, SPARKLE],
  // A dim stable to the star blazing and the angel above it.
  nativity: [{ id: 'main', frames: 8, w: 300, h: 280, paint: nativity }, SPARKLE],
  'ice-fishing-penguins': [
    { id: 'main', frames: 6, w: 210, h: 200, paint: iceFishing(false) },
    { id: 'act', frames: 8, w: 210, h: 200, paint: iceFishing(true) },
    { ...BUBBLE, paint: saying('Got one!') },
    SPARKLE,
  ],
  // Head turned back, up ahead, turned out, down grazing.
  'lawn-reindeer': [{ id: 'main', frames: 4, w: 220, h: 220, paint: lawnReindeer }, SPARKLE],
  // Flat on the lawn to blown up and waving.
  'blow-up-santa': [
    { id: 'main', frames: 8, w: 220, h: 320, paint: blowUpSanta },
    { ...BUBBLE, paint: saying('Ho ho ho!') },
    SPARKLE,
  ],
  // None of the lights on to all of them, and the elf waving.
  'lights-elf': [
    { id: 'main', frames: 8, w: 270, h: 280, paint: lightsElf },
    { ...BUBBLE, paint: saying('Ta-da!') },
    SPARKLE,
  ],
  'horse-sleigh': [
    { id: 'main', frames: 8, w: 360, h: 180, paint: horseSleigh(false) },
    { id: 'wave', frames: 8, w: 360, h: 180, paint: horseSleigh(true) },
    { ...BUBBLE, paint: saying('Jingle all the way!') },
    SPARKLE,
  ],
}

