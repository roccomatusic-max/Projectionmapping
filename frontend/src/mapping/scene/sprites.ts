/**
 * The pictures the flying and walking elements are made of: Santa's sleigh
 * and reindeer, a Christmas train, birds, bats, elves, penguins, shooting
 * stars and ghosts; for Halloween a witch on a broom, a UFO, skeletons,
 * zombies and black cats; and through the year turkeys, Cupid,
 * leprechauns, the Easter bunny, eagles, firework rockets, balloons,
 * butterflies and fish. Each is painted with the 2D canvas, facing right, once
 * per frame of its animation (legs galloping, wings flapping, wheels
 * turning) into one picture the GPU then stamps wherever they are; nothing
 * is repainted while they move, so a mini PC only pays for the stamping.
 *
 * Every painter draws one frame into a cell of w by h design units, with
 * the context already scaled; f runs from 0 to frames - 1 and wraps.
 */

type Ctx = CanvasRenderingContext2D

export interface SpriteColors {
  color: string
  color2: string
}

export interface SpriteRow {
  id: string
  frames: number
  /** Cell size in design units. */
  w: number
  h: number
  paint: (ctx: Ctx, f: number, frames: number, c: SpriteColors) => void
}

const TAU = Math.PI * 2

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))))
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU)
}

function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
}

/** A leg in two parts from the hip, bending at the knee; angles in radians from straight down. */
function leg(ctx: Ctx, x: number, y: number, upper: number, lower: number, a1: number, a2: number, width: number, color: string, hoof: string) {
  const kx = x + Math.sin(a1) * upper
  const ky = y + Math.cos(a1) * upper
  const fx = kx + Math.sin(a1 + a2) * lower
  const fy = ky + Math.cos(a1 + a2) * lower
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(kx, ky)
  ctx.lineTo(fx, fy)
  ctx.stroke()
  ctx.fillStyle = hoof
  circle(ctx, fx, fy, width * 0.62)
  ctx.fill()
}

function glow(ctx: Ctx, x: number, y: number, r: number, color: string, a = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba(color, a))
  g.addColorStop(0.35, rgba(color, a * 0.45))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  circle(ctx, x, y, r)
  ctx.fill()
}

function present(ctx: Ctx, x: number, y: number, w: number, h: number, box: string, ribbon: string) {
  ctx.fillStyle = box
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = shade(box, -0.25)
  ctx.fillRect(x, y + h * 0.75, w, h * 0.25)
  ctx.fillStyle = ribbon
  ctx.fillRect(x + w * 0.42, y, w * 0.16, h)
  ctx.fillRect(x, y + h * 0.36, w, h * 0.16)
  ctx.beginPath()
  ctx.ellipse(x + w * 0.38, y - h * 0.06, w * 0.14, h * 0.09, -0.5, 0, TAU)
  ctx.ellipse(x + w * 0.62, y - h * 0.06, w * 0.14, h * 0.09, 0.5, 0, TAU)
  ctx.fill()
}

const SKIN = '#f2c08f'
const FUR = '#fbfbf7'

// -- Santa's sleigh and reindeer --------------------------------------------------------

function reindeer(ctx: Ctx, cx: number, cy: number, phase: number, lead: boolean, harness: string) {
  const body = '#8a5a32'
  const dark = '#5b3a1e'
  const s = Math.sin(phase)
  const c = Math.cos(phase)
  // Legs behind the body first: the far pair, darker.
  leg(ctx, cx + 30, cy + 10, 26, 26, 0.9 * s + 0.35, -0.9 + 0.5 * c, 7, dark, '#2a1a0c')
  leg(ctx, cx - 34, cy + 8, 26, 26, -0.8 * s - 0.3, 0.7 + 0.4 * c, 8, dark, '#2a1a0c')
  // Body.
  const g = ctx.createLinearGradient(0, cy - 26, 0, cy + 26)
  g.addColorStop(0, shade(body, 0.18))
  g.addColorStop(0.6, body)
  g.addColorStop(1, shade(body, -0.25))
  ctx.fillStyle = g
  ellipse(ctx, cx, cy, 50, 23, -0.06)
  ctx.fill()
  ctx.fillStyle = '#d9b48a'
  ellipse(ctx, cx + 4, cy + 13, 34, 9, -0.06)
  ctx.fill()
  // Tail.
  ctx.fillStyle = FUR
  ellipse(ctx, cx - 50, cy - 8, 9, 6, -0.6)
  ctx.fill()
  // Neck and head.
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.moveTo(cx + 30, cy - 18)
  ctx.quadraticCurveTo(cx + 52, cy - 34, cx + 62, cy - 58)
  ctx.lineTo(cx + 80, cy - 52)
  ctx.quadraticCurveTo(cx + 66, cy - 22, cx + 46, cy + 4)
  ctx.closePath()
  ctx.fill()
  ellipse(ctx, cx + 74, cy - 60, 17, 12, 0.25)
  ctx.fill()
  ellipse(ctx, cx + 92, cy - 54, 10, 8, 0.3)
  ctx.fill()
  // Ear and eye.
  ctx.fillStyle = dark
  ellipse(ctx, cx + 62, cy - 70, 9, 4, -0.7)
  ctx.fill()
  ctx.fillStyle = '#1a0f07'
  circle(ctx, cx + 78, cy - 63, 2.6)
  ctx.fill()
  // Antlers.
  ctx.strokeStyle = '#e8d3a8'
  ctx.lineWidth = 4.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx + 70, cy - 70)
  ctx.quadraticCurveTo(cx + 62, cy - 96, cx + 44, cy - 108)
  ctx.moveTo(cx + 64, cy - 90)
  ctx.lineTo(cx + 74, cy - 104)
  ctx.moveTo(cx + 54, cy - 101)
  ctx.lineTo(cx + 56, cy - 116)
  ctx.moveTo(cx + 76, cy - 70)
  ctx.quadraticCurveTo(cx + 84, cy - 94, cx + 74, cy - 112)
  ctx.moveTo(cx + 82, cy - 90)
  ctx.lineTo(cx + 94, cy - 98)
  ctx.stroke()
  // Nose: Rudolph's glows.
  if (lead) {
    glow(ctx, cx + 101, cy - 53, 26, '#ff2a2a', 0.85)
    ctx.fillStyle = '#ff3b3b'
    circle(ctx, cx + 101, cy - 53, 6.5)
    ctx.fill()
    ctx.fillStyle = '#ffd0d0'
    circle(ctx, cx + 99, cy - 55, 2)
    ctx.fill()
  } else {
    ctx.fillStyle = '#2a1a0c'
    circle(ctx, cx + 100, cy - 53, 4.5)
    ctx.fill()
  }
  // Collar with a bell.
  ctx.strokeStyle = harness
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(cx + 40, cy - 30)
  ctx.lineTo(cx + 56, cy - 6)
  ctx.stroke()
  ctx.fillStyle = '#ffd34d'
  circle(ctx, cx + 50, cy - 12, 5)
  ctx.fill()
  // Near legs.
  leg(ctx, cx + 34, cy + 12, 27, 27, 0.95 * -s + 0.4, -1.0 + 0.5 * -c, 8, body, '#2a1a0c')
  leg(ctx, cx - 30, cy + 10, 27, 27, -0.85 * -s - 0.35, 0.8 + 0.4 * -c, 9, body, '#2a1a0c')
}

function sleighTeam(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const phase = (f / frames) * TAU
  // Reins and harness under everything.
  const deer = [480, 620, 760, 900]
  const ys = deer.map((_, i) => 150 + Math.sin(phase + i * 0.9) * 5 - (i % 2) * 6)
  ctx.strokeStyle = shade(color2, -0.15)
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(352, 150)
  deer.forEach((x, i) => ctx.lineTo(x + 40, ys[i] - 8))
  ctx.stroke()
  ctx.strokeStyle = '#7a4b07'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(268, 118)
  ctx.quadraticCurveTo(560, 70, deer[3] + 60, ys[3] - 40)
  ctx.stroke()
  deer.forEach((x, i) => reindeer(ctx, x, ys[i], phase + i * 0.9, i === deer.length - 1, color2))

  // The sack of toys behind Santa.
  const sack = ctx.createRadialGradient(100, 100, 6, 112, 118, 70)
  sack.addColorStop(0, '#b7834c')
  sack.addColorStop(1, '#6b4423')
  ctx.fillStyle = sack
  ctx.beginPath()
  ctx.moveTo(52, 156)
  ctx.quadraticCurveTo(30, 70, 104, 60)
  ctx.quadraticCurveTo(176, 66, 160, 156)
  ctx.closePath()
  ctx.fill()
  present(ctx, 70, 40, 30, 26, '#2f9e44', '#ffd34d')
  present(ctx, 104, 30, 34, 34, '#1d4ed8', '#f8fafc')
  present(ctx, 136, 46, 24, 22, '#f59e0b', '#c8102e')

  // Santa.
  const coat = ctx.createLinearGradient(0, 60, 0, 170)
  coat.addColorStop(0, '#ef3b3b')
  coat.addColorStop(1, '#9b0f17')
  ctx.fillStyle = coat
  ellipse(ctx, 216, 128, 44, 42)
  ctx.fill()
  ctx.fillStyle = '#111'
  ctx.fillRect(176, 132, 82, 11)
  ctx.fillStyle = '#ffd34d'
  ctx.fillRect(208, 129, 17, 17)
  ctx.fillStyle = '#111'
  ctx.fillRect(213, 134, 7, 7)
  // Arm and mitten on the reins.
  ctx.strokeStyle = '#d9252c'
  ctx.lineWidth = 17
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(228, 108)
  ctx.quadraticCurveTo(256, 112, 270, 118)
  ctx.stroke()
  ctx.fillStyle = '#1f2937'
  circle(ctx, 272, 118, 10)
  ctx.fill()
  // Head, beard and hat.
  ctx.fillStyle = SKIN
  circle(ctx, 236, 76, 21)
  ctx.fill()
  ctx.fillStyle = FUR
  ctx.beginPath()
  ctx.moveTo(214, 78)
  ctx.quadraticCurveTo(212, 122, 238, 120)
  ctx.quadraticCurveTo(262, 116, 258, 80)
  ctx.quadraticCurveTo(236, 92, 214, 78)
  ctx.fill()
  ellipse(ctx, 244, 86, 12, 5)
  ctx.fill()
  ctx.fillStyle = '#e8a07a'
  circle(ctx, 252, 76, 5)
  ctx.fill()
  ctx.fillStyle = '#1a1a1a'
  circle(ctx, 244, 70, 2.4)
  ctx.fill()
  ctx.fillStyle = '#d61f2c'
  ctx.beginPath()
  ctx.moveTo(212, 64)
  ctx.quadraticCurveTo(222, 30, 252, 46)
  ctx.quadraticCurveTo(240, 40, 196, 52)
  ctx.lineTo(258, 62)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(214, 62)
  ctx.quadraticCurveTo(204, 40, 186, 46)
  ctx.lineTo(196, 58)
  ctx.fill()
  ctx.fillStyle = FUR
  ctx.beginPath()
  ctx.roundRect(208, 56, 54, 12, 6)
  ctx.fill()
  circle(ctx, 184, 50, 9)
  ctx.fill()

  // The sleigh, in the layer's colour with a trim in the second colour.
  const body = ctx.createLinearGradient(0, 96, 0, 214)
  body.addColorStop(0, shade(color, 0.25))
  body.addColorStop(0.5, color)
  body.addColorStop(1, shade(color, -0.4))
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.moveTo(34, 92)
  ctx.quadraticCurveTo(24, 150, 60, 200)
  ctx.lineTo(300, 204)
  ctx.quadraticCurveTo(352, 200, 362, 150)
  ctx.quadraticCurveTo(366, 128, 346, 126)
  ctx.quadraticCurveTo(330, 160, 290, 156)
  ctx.lineTo(100, 150)
  ctx.quadraticCurveTo(74, 140, 76, 100)
  ctx.quadraticCurveTo(58, 82, 34, 92)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = color2
  ctx.lineWidth = 5
  ctx.stroke()
  // Swirl on the side.
  ctx.lineWidth = 3.5
  ctx.beginPath()
  ctx.moveTo(110, 178)
  ctx.bezierCurveTo(150, 160, 190, 196, 230, 176)
  ctx.bezierCurveTo(250, 166, 262, 178, 252, 186)
  ctx.stroke()
  // Runners.
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(40, 228)
  ctx.lineTo(330, 228)
  ctx.bezierCurveTo(380, 228, 392, 192, 368, 180)
  ctx.bezierCurveTo(352, 174, 346, 196, 362, 200)
  ctx.moveTo(90, 204)
  ctx.lineTo(90, 228)
  ctx.moveTo(260, 204)
  ctx.lineTo(260, 228)
  ctx.stroke()
  // A lantern on the front.
  glow(ctx, 352, 120, 34, '#ffd27a', 0.7)
  ctx.fillStyle = '#ffe9a8'
  ctx.fillRect(345, 110, 14, 18)
}

// -- the Christmas train -------------------------------------------------------------------

function wheel(ctx: Ctx, x: number, y: number, r: number, turn: number, rim: string) {
  ctx.fillStyle = '#1f2937'
  circle(ctx, x, y, r)
  ctx.fill()
  ctx.strokeStyle = rim
  ctx.lineWidth = r * 0.18
  circle(ctx, x, y, r * 0.8)
  ctx.stroke()
  ctx.lineWidth = r * 0.12
  ctx.beginPath()
  for (let k = 0; k < 4; k++) {
    const a = turn + (k * Math.PI) / 4
    ctx.moveTo(x - Math.cos(a) * r * 0.75, y - Math.sin(a) * r * 0.75)
    ctx.lineTo(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75)
  }
  ctx.stroke()
  ctx.fillStyle = '#ffd34d'
  circle(ctx, x, y, r * 0.18)
  ctx.fill()
}

function engine(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const turn = (f / frames) * (Math.PI / 2)
  const bodyG = ctx.createLinearGradient(0, 110, 0, 240)
  bodyG.addColorStop(0, shade(color, 0.3))
  bodyG.addColorStop(0.45, color)
  bodyG.addColorStop(1, shade(color, -0.45))
  // Cab at the back (left), boiler to the front.
  ctx.fillStyle = shade(color2, -0.1)
  ctx.fillRect(40, 70, 150, 170)
  ctx.fillStyle = shade(color2, 0.15)
  ctx.fillRect(28, 56, 176, 22)
  ctx.fillStyle = '#ffe9a8'
  ctx.fillRect(70, 100, 46, 46)
  ctx.fillRect(130, 100, 46, 46)
  ctx.fillStyle = bodyG
  ctx.beginPath()
  ctx.roundRect(180, 124, 270, 112, 40)
  ctx.fill()
  // Gold bands.
  ctx.fillStyle = '#f5c451'
  for (const x of [250, 330, 410]) ctx.fillRect(x, 126, 10, 108)
  // Chimney and dome.
  ctx.fillStyle = '#1f2937'
  ctx.beginPath()
  ctx.moveTo(374, 124)
  ctx.lineTo(364, 64)
  ctx.lineTo(420, 64)
  ctx.lineTo(410, 124)
  ctx.fill()
  ctx.fillStyle = '#f5c451'
  ctx.fillRect(360, 56, 64, 12)
  ellipse(ctx, 296, 120, 26, 18)
  ctx.fill()
  // Headlight.
  glow(ctx, 458, 150, 44, '#fff3c4', 0.8)
  ctx.fillStyle = '#fff7d6'
  circle(ctx, 452, 150, 13)
  ctx.fill()
  // Cow catcher.
  ctx.fillStyle = '#374151'
  ctx.beginPath()
  ctx.moveTo(440, 236)
  ctx.lineTo(500, 286)
  ctx.lineTo(440, 286)
  ctx.fill()
  // Frame and wheels.
  ctx.fillStyle = '#111827'
  ctx.fillRect(30, 232, 420, 22)
  wheel(ctx, 110, 266, 44, turn, '#d61f2c')
  wheel(ctx, 260, 278, 32, turn * 1.4, '#d61f2c')
  wheel(ctx, 360, 278, 32, turn * 1.4, '#d61f2c')
  ctx.strokeStyle = '#9ca3af'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(110 + Math.cos(turn * 4) * 26, 266 + Math.sin(turn * 4) * 26)
  ctx.lineTo(360 + Math.cos(turn * 4) * 18, 278 + Math.sin(turn * 4) * 18)
  ctx.stroke()
  // A wreath on the front of the boiler.
  ctx.strokeStyle = '#15803d'
  ctx.lineWidth = 9
  circle(ctx, 420, 180, 18)
  ctx.stroke()
  ctx.fillStyle = '#d61f2c'
  circle(ctx, 420, 196, 6)
  ctx.fill()
}

function car(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors, load: 'gifts' | 'tree') {
  const turn = (f / frames) * (Math.PI / 2)
  // Coupling to the car ahead.
  ctx.fillStyle = '#111827'
  ctx.fillRect(0, 214, 400, 14)
  if (load === 'gifts') {
    present(ctx, 56, 70, 80, 74, '#2563eb', '#f8fafc')
    present(ctx, 150, 52, 92, 92, '#f59e0b', '#c8102e')
    present(ctx, 256, 84, 74, 60, '#9333ea', '#ffd34d')
    present(ctx, 112, 30, 54, 44, '#16a34a', '#ffd34d')
  } else {
    // A tree with lights.
    ctx.fillStyle = '#5b3a1e'
    ctx.fillRect(188, 120, 24, 34)
    const layers: Array<[number, number, number]> = [[200, 18, 110], [200, 50, 140], [200, 84, 170]]
    ctx.fillStyle = '#166534'
    for (const [x, top, wdt] of layers) {
      ctx.beginPath()
      ctx.moveTo(x, top)
      ctx.lineTo(x + wdt / 2, top + 64)
      ctx.lineTo(x - wdt / 2, top + 64)
      ctx.closePath()
      ctx.fill()
    }
    const bulbs = ['#ef4444', '#facc15', '#3b82f6', '#f472b6', '#fff']
    for (let k = 0; k < 16; k++) {
      const t = k / 16
      const y = 40 + t * 104
      const x = 200 + Math.sin(k * 2.4 + f) * (16 + t * 64)
      glow(ctx, x, y, 9, bulbs[k % bulbs.length], 0.9)
    }
    ctx.fillStyle = '#ffd34d'
    ctx.beginPath()
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5
      const r = k % 2 ? 7 : 17
      ctx.lineTo(200 + Math.cos(a) * r, 16 + Math.sin(a) * r)
    }
    ctx.fill()
  }
  const g = ctx.createLinearGradient(0, 140, 0, 230)
  g.addColorStop(0, shade(color2, 0.2))
  g.addColorStop(1, shade(color2, -0.35))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(30, 140, 340, 82, 10)
  ctx.fill()
  ctx.strokeStyle = '#f5c451'
  ctx.lineWidth = 6
  ctx.stroke()
  ctx.fillStyle = shade(color, 0)
  ctx.fillRect(30, 140, 340, 14)
  wheel(ctx, 100, 236, 26, turn * 1.6, color)
  wheel(ctx, 300, 236, 26, turn * 1.6, color)
}

function puff(ctx: Ctx) {
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 60)
  g.addColorStop(0, 'rgba(255,255,255,0.95)')
  g.addColorStop(0.55, 'rgba(235,240,248,0.6)')
  g.addColorStop(1, 'rgba(220,228,240,0)')
  ctx.fillStyle = g
  circle(ctx, 64, 64, 60)
  ctx.fill()
}

// -- birds, bats and ghosts -----------------------------------------------------------------

function bird(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const flap = Math.sin((f / frames) * TAU)
  const body = color
  // Far wing.
  ctx.fillStyle = shade(body, -0.35)
  ctx.beginPath()
  ctx.moveTo(120, 86)
  ctx.quadraticCurveTo(110, 86 - 60 * flap, 70, 80 - 74 * flap)
  ctx.quadraticCurveTo(100, 96 - 20 * flap, 146, 92)
  ctx.fill()
  // Tail.
  ctx.fillStyle = shade(body, -0.2)
  ctx.beginPath()
  ctx.moveTo(70, 94)
  ctx.lineTo(10, 74)
  ctx.lineTo(16, 110)
  ctx.closePath()
  ctx.fill()
  // Body and head with a crest.
  const g = ctx.createLinearGradient(0, 60, 0, 130)
  g.addColorStop(0, shade(body, 0.25))
  g.addColorStop(1, shade(body, -0.25))
  ctx.fillStyle = g
  ellipse(ctx, 120, 96, 56, 28, -0.1)
  ctx.fill()
  circle(ctx, 182, 78, 24)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(170, 60)
  ctx.lineTo(160, 26)
  ctx.lineTo(190, 56)
  ctx.fill()
  // Mask, eye and beak.
  ctx.fillStyle = '#111'
  ellipse(ctx, 196, 82, 12, 9)
  ctx.fill()
  ctx.fillStyle = '#fff'
  circle(ctx, 190, 74, 3)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(202, 72)
  ctx.lineTo(236, 84)
  ctx.lineTo(202, 92)
  ctx.closePath()
  ctx.fill()
  // Near wing.
  ctx.fillStyle = shade(body, 0.05)
  ctx.beginPath()
  ctx.moveTo(100, 92)
  ctx.quadraticCurveTo(120, 92 - 80 * flap, 156, 70 - 96 * flap)
  ctx.quadraticCurveTo(150, 104 - 20 * flap, 150, 102)
  ctx.closePath()
  ctx.fill()
}

function bat(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const flap = Math.sin((f / frames) * TAU)
  const tip = 80 - 66 * flap
  ctx.fillStyle = color
  for (const side of [-1, 1]) {
    const x0 = 128
    ctx.beginPath()
    ctx.moveTo(x0, 70)
    ctx.quadraticCurveTo(x0 + side * 50, tip - 20, x0 + side * 118, tip)
    ctx.quadraticCurveTo(x0 + side * 100, tip + 30, x0 + side * 92, tip + 40)
    ctx.quadraticCurveTo(x0 + side * 76, tip + 18, x0 + side * 64, tip + 44)
    ctx.quadraticCurveTo(x0 + side * 50, tip + 22, x0 + side * 36, 100)
    ctx.closePath()
    ctx.fill()
  }
  ellipse(ctx, 128, 88, 22, 30)
  ctx.fill()
  circle(ctx, 128, 58, 18)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(114, 50)
  ctx.lineTo(110, 26)
  ctx.lineTo(124, 44)
  ctx.moveTo(142, 50)
  ctx.lineTo(146, 26)
  ctx.lineTo(132, 44)
  ctx.fill()
  glow(ctx, 121, 58, 9, color2, 0.9)
  glow(ctx, 135, 58, 9, color2, 0.9)
  ctx.fillStyle = '#fff'
  circle(ctx, 121, 58, 2.6)
  circle(ctx, 135, 58, 2.6)
  ctx.fill()
}

function ghost(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  glow(ctx, 100, 110, 100, color2, 0.35)
  const g = ctx.createLinearGradient(0, 20, 0, 230)
  g.addColorStop(0, rgba(color, 0.98))
  g.addColorStop(1, rgba(color, 0.55))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(30, 200)
  ctx.bezierCurveTo(30, 40, 170, 40, 170, 160)
  for (let k = 0; k <= 6; k++) {
    const x = 170 - (k * 140) / 6
    const y = 196 + Math.sin(p + k * 1.3) * 14 + (k % 2 ? 22 : 0)
    ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#111827'
  ellipse(ctx, 104, 100, 10, 15)
  ctx.fill()
  ellipse(ctx, 140, 100, 10, 15)
  ctx.fill()
  ellipse(ctx, 124, 138, 9, 12 + 4 * Math.sin(p))
  ctx.fill()
}

// -- walkers --------------------------------------------------------------------------------

function elf(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors, waving = false) {
  const p = (f / frames) * TAU
  const swing = waving ? 0 : Math.sin(p)
  const bob = waving ? 0 : Math.abs(Math.cos(p)) * -6
  ctx.save()
  ctx.translate(0, bob)
  // Legs in striped stockings.
  for (const [k, side] of [[-1, 0], [1, 1]] as const) {
    const a = k * swing * 0.5
    ctx.save()
    ctx.translate(76 + side * 22, 200)
    ctx.rotate(a)
    ctx.fillStyle = side ? '#f8fafc' : '#e2e8f0'
    ctx.fillRect(-9, 0, 18, 58)
    ctx.fillStyle = color2
    for (let y = 6; y < 58; y += 16) ctx.fillRect(-9, y, 18, 7)
    ctx.fillStyle = '#5b3a1e'
    ctx.beginPath()
    ctx.moveTo(-12, 54)
    ctx.quadraticCurveTo(30, 52, 34, 40)
    ctx.lineTo(36, 64)
    ctx.lineTo(-12, 66)
    ctx.fill()
    ctx.restore()
  }
  // Back arm.
  ctx.strokeStyle = shade(color, -0.3)
  ctx.lineWidth = 15
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(78, 136)
  ctx.lineTo(78 - swing * 26, 186)
  ctx.stroke()
  // Tunic with a belt and a jagged hem.
  const g = ctx.createLinearGradient(0, 120, 0, 214)
  g.addColorStop(0, shade(color, 0.2))
  g.addColorStop(1, shade(color, -0.3))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(52, 128)
  ctx.lineTo(112, 128)
  ctx.lineTo(126, 206)
  for (let k = 0; k < 5; k++) ctx.lineTo(126 - (k + 0.5) * 17, k % 2 ? 206 : 222)
  ctx.lineTo(38, 206)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#1f2937'
  ctx.fillRect(46, 170, 74, 11)
  ctx.fillStyle = '#ffd34d'
  ctx.fillRect(76, 167, 14, 17)
  ctx.fillStyle = FUR
  ctx.beginPath()
  ctx.ellipse(82, 128, 34, 9, 0, 0, TAU)
  ctx.fill()
  // Head with pointy ears.
  ctx.fillStyle = SKIN
  circle(ctx, 86, 100, 27)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(62, 96)
  ctx.lineTo(42, 82)
  ctx.lineTo(64, 108)
  ctx.fill()
  ctx.fillStyle = '#e88f7a'
  circle(ctx, 104, 108, 6)
  ctx.fill()
  ctx.fillStyle = '#1a1a1a'
  circle(ctx, 98, 96, 3.2)
  ctx.fill()
  ctx.strokeStyle = '#7a2e1e'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(98, 108, 8, 0.2, Math.PI * 0.8)
  ctx.stroke()
  // Floppy hat with a bell.
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(58, 88)
  ctx.quadraticCurveTo(70, 28, 118, 40 + swing * 6)
  ctx.quadraticCurveTo(150, 60, 140, 92)
  ctx.quadraticCurveTo(128, 64, 110, 82)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = FUR
  ctx.beginPath()
  ctx.roundRect(56, 80, 62, 14, 7)
  ctx.fill()
  ctx.fillStyle = '#ffd34d'
  circle(ctx, 141, 96, 8)
  ctx.fill()
  // Front arm: swinging, or waving above the head.
  ctx.strokeStyle = color
  ctx.lineWidth = 15
  ctx.beginPath()
  ctx.moveTo(90, 138)
  if (waving) {
    const w = Math.sin(p) * 0.5
    const ex = 128
    const ey = 118
    ctx.lineTo(ex, ey)
    ctx.lineTo(ex + Math.sin(w) * 34, ey - Math.cos(w) * 34)
    ctx.stroke()
    ctx.fillStyle = SKIN
    circle(ctx, ex + Math.sin(w) * 40, ey - Math.cos(w) * 40, 9)
  } else {
    ctx.lineTo(90 + swing * 26, 186)
    ctx.stroke()
    ctx.fillStyle = SKIN
    circle(ctx, 90 + swing * 28, 192, 8)
  }
  ctx.fill()
  ctx.restore()
}

function penguin(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const tilt = Math.sin(p) * 0.12
  ctx.save()
  ctx.translate(96, 246)
  ctx.rotate(tilt)
  ctx.translate(-96, -246)
  // Feet.
  ctx.fillStyle = color2
  const step = Math.sin(p)
  ellipse(ctx, 72 + step * 10, 244, 22, 9)
  ctx.fill()
  ellipse(ctx, 120 - step * 10, 244, 22, 9)
  ctx.fill()
  // Body and belly.
  const g = ctx.createLinearGradient(40, 0, 160, 0)
  g.addColorStop(0, '#0b1220')
  g.addColorStop(1, '#253247')
  ctx.fillStyle = g
  ellipse(ctx, 96, 150, 64, 92)
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  ellipse(ctx, 110, 164, 42, 72)
  ctx.fill()
  // Flippers.
  ctx.fillStyle = '#111827'
  ctx.save()
  ctx.translate(48, 130)
  ctx.rotate(0.35 + Math.sin(p) * 0.25)
  ellipse(ctx, 0, 40, 14, 46)
  ctx.fill()
  ctx.restore()
  // Face.
  ctx.fillStyle = '#fff'
  circle(ctx, 118, 84, 10)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 121, 84, 5)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(128, 96)
  ctx.lineTo(162, 106)
  ctx.lineTo(128, 114)
  ctx.closePath()
  ctx.fill()
  // A scarf in the layer's colour.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(40, 116, 116, 20, 9)
  ctx.fill()
  ctx.save()
  ctx.translate(58, 126)
  ctx.rotate(0.4 + Math.sin(p + 1) * 0.3)
  ctx.fillRect(-10, 0, 20, 54)
  ctx.restore()
  ctx.fillStyle = shade(color, 0.35)
  for (let x = 52; x < 150; x += 26) ctx.fillRect(x, 116, 9, 20)
  ctx.restore()
}

// -- sparkle and shooting star ---------------------------------------------------------------

function sparkle(ctx: Ctx, f: number, frames: number, { color2 }: SpriteColors) {
  const s = 0.6 + 0.4 * Math.sin((f / frames) * TAU)
  glow(ctx, 32, 32, 30 * s, color2, 0.8)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4
    const r = k % 2 ? 4 : 30 * s
    ctx.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r)
  }
  ctx.fill()
}

function shootingStar(ctx: Ctx, _f: number, _n: number, { color, color2 }: SpriteColors) {
  const tail = ctx.createLinearGradient(0, 0, 470, 0)
  tail.addColorStop(0, rgba(color2, 0))
  tail.addColorStop(0.7, rgba(color2, 0.5))
  tail.addColorStop(1, rgba(color, 1))
  ctx.fillStyle = tail
  ctx.beginPath()
  ctx.moveTo(0, 48)
  ctx.lineTo(470, 34)
  ctx.lineTo(470, 62)
  ctx.closePath()
  ctx.fill()
  glow(ctx, 470, 48, 44, color, 1)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5
    const r = k % 2 ? 8 : 20
    ctx.lineTo(470 + Math.cos(a) * r, 48 + Math.sin(a) * r)
  }
  ctx.fill()
}

// -- speech bubbles -----------------------------------------------------------------------------

function saying(words: string) {
  return (ctx: Ctx, _f: number, _n: number, { color }: SpriteColors) => {
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath()
    ctx.roundRect(8, 8, 344, 96, 48)
    ctx.moveTo(70, 100)
    ctx.lineTo(50, 132)
    ctx.lineTo(104, 102)
    ctx.fill()
    // The words in the element's colour, unless that is too pale to read on white.
    const n = parseInt(color.slice(1), 16)
    const light = 0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255) > 170
    ctx.fillStyle = light ? '#334155' : shade(color, -0.1)
    let size = 54
    do {
      ctx.font = `bold ${size}px "Countdown Script", "Great Vibes", Georgia, serif`
      size -= 3
    } while (size > 20 && ctx.measureText(words).width > 310)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(words, 180, 58)
  }
}

/** A bone: a thick rounded stroke with knobs at both ends. */
function bone(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, w: number, color: string) {
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineWidth = w
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.fillStyle = color
  circle(ctx, x1, y1, w * 0.62)
  circle(ctx, x2, y2, w * 0.62)
  ctx.fill()
}

/** A limb in two parts from the joint at (x, y): angles in radians from straight down; returns the end. */
function limb(ctx: Ctx, x: number, y: number, upper: number, lower: number, a1: number, a2: number, width: number, color: string) {
  const kx = x + Math.sin(a1) * upper
  const ky = y + Math.cos(a1) * upper
  const ex = kx + Math.sin(a1 + a2) * lower
  const ey = ky + Math.cos(a1 + a2) * lower
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(kx, ky)
  ctx.lineTo(ex, ey)
  ctx.stroke()
  return [ex, ey] as const
}

// -- Halloween ----------------------------------------------------------------------------------

function witch(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const skin = '#9bd16b'
  // Cape streaming out behind.
  ctx.fillStyle = shade(color, -0.25)
  ctx.beginPath()
  ctx.moveTo(214, 96)
  ctx.bezierCurveTo(170, 70 + s * 8, 120, 60 - s * 10, 70, 74 + s * 12)
  ctx.lineTo(92, 92 + s * 6)
  ctx.lineTo(64, 104 - s * 8)
  ctx.bezierCurveTo(120, 128, 170, 140, 220, 150)
  ctx.closePath()
  ctx.fill()
  // The broom: a handle and a fan of bristles tied on.
  ctx.strokeStyle = '#7a4b25'
  ctx.lineWidth = 9
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(100, 176)
  ctx.lineTo(388, 168)
  ctx.stroke()
  for (let k = 0; k < 14; k++) {
    const a = -0.38 + (k / 13) * 0.76 + Math.sin(p + k) * 0.04
    ctx.strokeStyle = k % 3 ? '#c99a4b' : '#a87a32'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(112, 176)
    ctx.lineTo(112 - Math.cos(a) * 96, 176 + Math.sin(a) * 60)
    ctx.stroke()
  }
  ctx.fillStyle = color2
  ctx.fillRect(104, 166, 16, 20)
  // A little black cat riding at the back.
  ctx.fillStyle = '#0b0b10'
  ellipse(ctx, 140, 152, 20, 16)
  ctx.fill()
  circle(ctx, 154, 134, 12)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(146, 126)
  ctx.lineTo(148, 112)
  ctx.lineTo(154, 124)
  ctx.moveTo(158, 124)
  ctx.lineTo(164, 112)
  ctx.lineTo(164, 128)
  ctx.fill()
  ctx.strokeStyle = '#0b0b10'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(122, 154)
  ctx.quadraticCurveTo(100, 140 + s * 10, 110, 118 + s * 6)
  ctx.stroke()
  glow(ctx, 158, 133, 6, color2, 0.9)
  // Dress sitting on the broom, a leg hanging down with a pointed boot.
  ctx.fillStyle = '#111111'
  ctx.save()
  ctx.translate(234, 176)
  ctx.rotate(0.15 + s * 0.12)
  ctx.fillRect(-7, 0, 14, 42)
  ctx.beginPath()
  ctx.moveTo(-8, 38)
  ctx.lineTo(30, 46)
  ctx.lineTo(-8, 52)
  ctx.fill()
  ctx.restore()
  const g = ctx.createLinearGradient(0, 90, 0, 180)
  g.addColorStop(0, shade(color, 0.2))
  g.addColorStop(1, shade(color, -0.2))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(206, 100)
  ctx.lineTo(250, 100)
  ctx.lineTo(268, 176)
  ctx.lineTo(190, 178)
  ctx.closePath()
  ctx.fill()
  // Arms forward to the handle.
  ctx.strokeStyle = shade(color, 0.1)
  ctx.lineWidth = 13
  ctx.beginPath()
  ctx.moveTo(240, 112)
  ctx.lineTo(290, 150)
  ctx.lineTo(312, 166)
  ctx.stroke()
  ctx.fillStyle = skin
  circle(ctx, 314, 166, 8)
  ctx.fill()
  // Hair flying back.
  ctx.strokeStyle = '#e8590c'
  ctx.lineWidth = 6
  for (let k = 0; k < 5; k++) {
    ctx.beginPath()
    ctx.moveTo(222, 76 + k * 6)
    ctx.quadraticCurveTo(196, 80 + k * 8 + s * 8, 172 - k * 4, 90 + k * 10 - s * 6)
    ctx.stroke()
  }
  // Face with a long nose and a grin.
  ctx.fillStyle = skin
  circle(ctx, 240, 78, 22)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(256, 74)
  ctx.lineTo(286, 88)
  ctx.lineTo(256, 86)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 250, 72, 3)
  ctx.fill()
  ctx.strokeStyle = '#2f4d1d'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(246, 88, 8, 0.1, Math.PI * 0.7)
  ctx.stroke()
  // The hat: a wide brim and a tall bent point.
  ctx.fillStyle = color
  ellipse(ctx, 236, 58, 44, 9, -0.12)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(212, 58)
  ctx.lineTo(258, 52)
  ctx.quadraticCurveTo(232, 30, 206, 4 + s * 3)
  ctx.quadraticCurveTo(214, 30, 212, 58)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(214, 50)
  ctx.lineTo(254, 45)
  ctx.lineTo(256, 53)
  ctx.lineTo(213, 58)
  ctx.closePath()
  ctx.fill()
}

function ufo(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  glow(ctx, 160, 120, 150, color2, 0.25)
  // Glass dome with a little alien inside.
  const dome = ctx.createLinearGradient(0, 30, 0, 110)
  dome.addColorStop(0, rgba(color2, 0.55))
  dome.addColorStop(1, rgba(color2, 0.2))
  ctx.fillStyle = dome
  ctx.beginPath()
  ctx.ellipse(160, 100, 64, 66, 0, Math.PI, TAU)
  ctx.fill()
  ctx.fillStyle = '#7ee05a'
  ellipse(ctx, 160, 72, 22, 26)
  ctx.fill()
  ellipse(ctx, 160, 100, 16, 14)
  ctx.fill()
  ctx.fillStyle = '#0b0b10'
  ellipse(ctx, 151, 72, 8, 11, 0.4)
  ctx.fill()
  ellipse(ctx, 169, 72, 8, 11, -0.4)
  ctx.fill()
  ctx.strokeStyle = '#7ee05a'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(152, 50)
  ctx.lineTo(144, 34)
  ctx.moveTo(168, 50)
  ctx.lineTo(176, 34)
  ctx.stroke()
  ctx.fillStyle = color2
  circle(ctx, 144, 33, 4)
  circle(ctx, 176, 33, 4)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ellipse(ctx, 132, 66, 10, 22, 0.5)
  ctx.fill()
  // The saucer.
  const metal = ctx.createLinearGradient(0, 96, 0, 150)
  metal.addColorStop(0, '#e2e8f0')
  metal.addColorStop(0.5, '#94a3b8')
  metal.addColorStop(1, '#334155')
  ctx.fillStyle = metal
  ellipse(ctx, 160, 122, 152, 30)
  ctx.fill()
  ctx.fillStyle = '#475569'
  ellipse(ctx, 160, 140, 70, 14)
  ctx.fill()
  // Lights chasing round the rim.
  for (let k = 0; k < 9; k++) {
    const x = 32 + k * 32
    const on = (k + f) % 3 === 0
    const c = on ? (k % 2 ? color : color2) : '#1e293b'
    if (on) glow(ctx, x, 124, 18, c, 0.8)
    ctx.fillStyle = on ? '#ffffff' : c
    circle(ctx, x, 124, 6)
    ctx.fill()
    ctx.fillStyle = rgba(c === '#1e293b' ? '#1e293b' : c, 0.9)
    circle(ctx, x, 124, 4.5)
    ctx.fill()
  }
}

function ufoBeam(ctx: Ctx, _f: number, _n: number, { color2 }: SpriteColors) {
  const g = ctx.createLinearGradient(0, 0, 0, 300)
  g.addColorStop(0, rgba(color2, 0.75))
  g.addColorStop(1, rgba(color2, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(70, 0)
  ctx.lineTo(130, 0)
  ctx.lineTo(196, 300)
  ctx.lineTo(4, 300)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 4
  for (let k = 1; k < 5; k++) {
    const y = k * 60
    const half = 30 + (66 * y) / 300
    ellipse(ctx, 100, y, half, 8)
    ctx.stroke()
  }
}

function skeleton(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors, dancing = false) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const boneC = color
  const line = shade(color, -0.35)
  const hip = { x: 90, y: 182 }
  const bob = dancing ? -Math.abs(s) * 10 : -Math.abs(Math.cos(p)) * 5
  ctx.save()
  ctx.translate(0, bob)
  // Legs.
  for (const k of [-1, 1]) {
    const a = dancing ? (k === 1 ? 0.2 + 0.9 * Math.max(0, s) : -0.15) : k * s * 0.45
    const knee = dancing ? (k === 1 ? -0.9 * Math.max(0, s) : 0.1) : Math.max(0, -k * s) * 0.6
    const [fx, fy] = limb(ctx, hip.x + k * 10, hip.y, 46, 48, a, knee, 9, boneC)
    ctx.fillStyle = boneC
    ellipse(ctx, fx + 9, fy + 3, 14, 6)
    ctx.fill()
  }
  // Pelvis and spine.
  ctx.fillStyle = boneC
  ellipse(ctx, hip.x, hip.y - 4, 24, 13)
  ctx.fill()
  ctx.fillStyle = line
  circle(ctx, hip.x - 9, hip.y - 4, 5)
  circle(ctx, hip.x + 9, hip.y - 4, 5)
  ctx.fill()
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = boneC
    ellipse(ctx, hip.x, hip.y - 22 - k * 9, 6, 4.5)
    ctx.fill()
  }
  // Ribs.
  ctx.strokeStyle = boneC
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  for (let k = 0; k < 4; k++) {
    const y = 100 + k * 13
    const w = 30 - k * 3
    ctx.beginPath()
    ctx.moveTo(hip.x - w, y + 6)
    ctx.quadraticCurveTo(hip.x, y - 8, hip.x + w, y + 6)
    ctx.stroke()
  }
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(hip.x, 92)
  ctx.lineTo(hip.x, 150)
  ctx.stroke()
  // Shoulders and arms.
  bone(ctx, hip.x - 30, 92, hip.x + 30, 92, 7, boneC)
  for (const k of [-1, 1]) {
    const a = dancing ? k * (2.3 + 0.4 * Math.sin(p + (k > 0 ? 0 : Math.PI))) : -k * s * 0.5
    const elbow = dancing ? k * -0.6 : 0.3
    const [hx, hy] = limb(ctx, hip.x + k * 30, 94, 38, 36, a, elbow, 8, boneC)
    ctx.fillStyle = boneC
    circle(ctx, hx, hy, 7)
    ctx.fill()
  }
  // Skull with glowing eyes.
  ctx.fillStyle = boneC
  circle(ctx, hip.x + 4, 54, 30)
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(hip.x - 12, 64, 34, 24, 6)
  ctx.fill()
  ctx.fillStyle = '#111'
  ellipse(ctx, hip.x - 4, 54, 8, 10)
  ctx.fill()
  ellipse(ctx, hip.x + 16, 54, 8, 10)
  ctx.fill()
  glow(ctx, hip.x - 4, 55, 8, color2, 0.9)
  glow(ctx, hip.x + 16, 55, 8, color2, 0.9)
  ctx.fillStyle = '#111'
  ctx.beginPath()
  ctx.moveTo(hip.x + 6, 64)
  ctx.lineTo(hip.x + 2, 72)
  ctx.lineTo(hip.x + 10, 72)
  ctx.fill()
  ctx.strokeStyle = line
  ctx.lineWidth = 2
  for (let x = hip.x - 8; x <= hip.x + 18; x += 6) {
    ctx.beginPath()
    ctx.moveTo(x, 78)
    ctx.lineTo(x, 88)
    ctx.stroke()
  }
  ctx.restore()
}

function zombie(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const skin = color2
  const lurch = Math.sin(p * 2) * 0.05
  ctx.save()
  ctx.translate(90, 290)
  ctx.rotate(0.08 + lurch)
  ctx.translate(-90, -290)
  // Legs, one dragging.
  limb(ctx, 82, 186, 50, 50, s * 0.35, Math.max(0, -s) * 0.5, 17, '#1e3a5f')
  limb(ctx, 100, 186, 50, 50, -s * 0.2 - 0.1, 0.15, 17, '#274b78')
  ctx.fillStyle = '#2b2118'
  ellipse(ctx, 82 + Math.sin(s * 0.35) * 100 + 8, 286, 16, 7)
  ctx.fill()
  ellipse(ctx, 100 + Math.sin(-s * 0.2 - 0.1) * 100 + 8, 288, 16, 7)
  ctx.fill()
  // Back arm, reaching forward.
  ctx.strokeStyle = shade(skin, -0.25)
  ctx.lineWidth = 13
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(96, 112)
  ctx.lineTo(150, 112 + s * 4)
  ctx.lineTo(170, 116 + s * 4)
  ctx.stroke()
  // Torn shirt.
  const g = ctx.createLinearGradient(0, 100, 0, 196)
  g.addColorStop(0, shade(color, 0.15))
  g.addColorStop(1, shade(color, -0.3))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(62, 104)
  ctx.lineTo(118, 104)
  ctx.lineTo(124, 194)
  for (let k = 0; k < 6; k++) ctx.lineTo(124 - (k + 0.5) * 11, k % 2 ? 194 : 206)
  ctx.lineTo(56, 196)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = shade(skin, -0.1)
  ctx.beginPath()
  ctx.moveTo(80, 140)
  ctx.lineTo(94, 150)
  ctx.lineTo(84, 162)
  ctx.closePath()
  ctx.fill()
  // Head tilted, sunken eyes, messy hair.
  ctx.fillStyle = skin
  circle(ctx, 98, 72, 28)
  ctx.fill()
  ctx.fillStyle = '#1f2937'
  ctx.beginPath()
  for (let k = 0; k < 7; k++) {
    const a = Math.PI + (k / 6) * Math.PI
    ctx.lineTo(98 + Math.cos(a) * 30, 66 + Math.sin(a) * (k % 2 ? 22 : 34))
  }
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#e8f5d0'
  circle(ctx, 106, 70, 7)
  circle(ctx, 120, 72, 5)
  ctx.fill()
  ctx.fillStyle = '#7f1d1d'
  circle(ctx, 107, 71, 2.5)
  circle(ctx, 121, 73, 2)
  ctx.fill()
  ctx.strokeStyle = '#3f1d1d'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(104, 88)
  ctx.lineTo(112, 86)
  ctx.lineTo(120, 89)
  ctx.stroke()
  // Front arm, reaching.
  ctx.strokeStyle = skin
  ctx.lineWidth = 13
  ctx.beginPath()
  ctx.moveTo(90, 116)
  ctx.lineTo(146, 122 - s * 4)
  ctx.lineTo(172, 126 - s * 4)
  ctx.stroke()
  ctx.restore()
}

function blackCat(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const c = Math.cos(p)
  const body = color
  // A glow of moonlight round the edges, or a black cat would not show on the house.
  ctx.shadowColor = rgba(color2, 0.85)
  ctx.shadowBlur = 12
  // Far legs.
  limb(ctx, 76, 104, 28, 26, -s * 0.5, 0.2, 10, shade(body, -0.3))
  limb(ctx, 178, 104, 28, 26, s * 0.5, -0.2, 10, shade(body, -0.3))
  // Tail curling up.
  ctx.strokeStyle = body
  ctx.lineWidth = 11
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(62, 92)
  ctx.bezierCurveTo(30, 80, 24 + s * 6, 40, 44 + c * 8, 16)
  ctx.stroke()
  // Body, arched a little with each step.
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.moveTo(60, 100)
  ctx.quadraticCurveTo(120, 64 - Math.abs(s) * 4, 190, 88)
  ctx.quadraticCurveTo(198, 120, 170, 122)
  ctx.lineTo(80, 122)
  ctx.quadraticCurveTo(54, 120, 60, 100)
  ctx.fill()
  // Near legs.
  limb(ctx, 88, 108, 28, 26, s * 0.5, 0.2, 11, body)
  limb(ctx, 168, 108, 28, 26, -s * 0.5, -0.2, 11, body)
  // Head with pointed ears and glowing eyes.
  circle(ctx, 206, 76, 26)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(188, 62)
  ctx.lineTo(186, 30)
  ctx.lineTo(204, 52)
  ctx.moveTo(210, 52)
  ctx.lineTo(226, 32)
  ctx.lineTo(228, 64)
  ctx.fill()
  ctx.shadowBlur = 0
  glow(ctx, 202, 72, 13, color2, 0.9)
  glow(ctx, 222, 74, 11, color2, 0.9)
  ctx.fillStyle = color2
  ellipse(ctx, 202, 72, 6, 5)
  ellipse(ctx, 222, 74, 5, 4.5)
  ctx.fill()
  ctx.fillStyle = '#000'
  ellipse(ctx, 202, 72, 1.6, 4.5)
  ellipse(ctx, 222, 74, 1.4, 4)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'
  ctx.lineWidth = 1.5
  for (const dy of [-3, 3]) {
    ctx.beginPath()
    ctx.moveTo(226, 86)
    ctx.lineTo(252, 84 + dy * 2)
    ctx.stroke()
  }
}

// -- through the year ---------------------------------------------------------------------------

function turkey(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  ctx.translate(20, -16)
  // Legs.
  limb(ctx, 112, 170, 30, 30, s * 0.45, -0.2, 7, '#f59e0b')
  limb(ctx, 132, 170, 30, 30, -s * 0.45, -0.2, 7, '#d97706')
  // The tail fan behind, in bands.
  const bands = [color2, '#f59e0b', '#b91c1c', '#facc15']
  for (let b = bands.length - 1; b >= 0; b--) {
    ctx.fillStyle = bands[b]
    ctx.beginPath()
    for (let k = 0; k <= 9; k++) {
      const a = Math.PI * 0.62 + (k / 9) * Math.PI * 0.9
      const r = 46 + b * 20 + (k % 2 ? 6 : 0)
      ctx.lineTo(96 + Math.cos(a) * r, 120 - Math.sin(a) * r * 0.95)
    }
    ctx.lineTo(96, 120)
    ctx.closePath()
    ctx.fill()
  }
  // Body.
  const g = ctx.createRadialGradient(118, 120, 10, 118, 130, 60)
  g.addColorStop(0, shade(color, 0.2))
  g.addColorStop(1, shade(color, -0.3))
  ctx.fillStyle = g
  ellipse(ctx, 120, 134, 52, 42)
  ctx.fill()
  ctx.fillStyle = shade(color, -0.15)
  ellipse(ctx, 108, 136, 30, 20, -0.4)
  ctx.fill()
  // Neck and bobbing head.
  const hx = 172 + s * 6
  ctx.strokeStyle = '#c2a389'
  ctx.lineWidth = 14
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(150, 116)
  ctx.quadraticCurveTo(170, 96, hx, 70)
  ctx.stroke()
  ctx.fillStyle = '#c2a389'
  circle(ctx, hx, 62, 15)
  ctx.fill()
  ctx.fillStyle = '#facc15'
  ctx.beginPath()
  ctx.moveTo(hx + 12, 58)
  ctx.lineTo(hx + 28, 64)
  ctx.lineTo(hx + 12, 68)
  ctx.fill()
  ctx.fillStyle = '#dc2626'
  ellipse(ctx, hx + 12, 78, 5, 12)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, hx + 4, 58, 3)
  ctx.fill()
}

function cupid(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const flap = Math.sin((f / frames) * TAU)
  const skin = '#ffd3b5'
  // Back wing.
  const wing = (x: number, y: number, lift: number, shadeK: number) => {
    ctx.fillStyle = shade('#ffffff', shadeK)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x - 30, y - 40 - 50 * lift, x - 70, y - 30 - 70 * lift)
    ctx.quadraticCurveTo(x - 50, y - 10 - 30 * lift, x - 60, y + 4 - 20 * lift)
    ctx.quadraticCurveTo(x - 30, y + 6, x, y + 12)
    ctx.fill()
  }
  wing(110, 92, flap, -0.18)
  // Body and legs trailing back.
  ctx.fillStyle = skin
  ellipse(ctx, 110, 112, 30, 24, -0.3)
  ctx.fill()
  ctx.strokeStyle = skin
  ctx.lineWidth = 15
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(90, 124)
  ctx.lineTo(56, 136 + flap * 4)
  ctx.moveTo(96, 130)
  ctx.lineTo(66, 150 - flap * 4)
  ctx.stroke()
  // A pink cloth.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(84, 108)
  ctx.quadraticCurveTo(110, 136, 136, 112)
  ctx.lineTo(124, 132)
  ctx.quadraticCurveTo(104, 140, 86, 126)
  ctx.fill()
  // Head with golden curls.
  ctx.fillStyle = skin
  circle(ctx, 148, 76, 24)
  ctx.fill()
  ctx.fillStyle = '#fcd34d'
  for (const [x, y] of [[132, 60], [146, 54], [160, 56], [128, 74], [168, 64]]) {
    circle(ctx, x, y, 9)
    ctx.fill()
  }
  ctx.fillStyle = '#111'
  circle(ctx, 158, 78, 2.6)
  ctx.fill()
  ctx.fillStyle = '#f9a8b4'
  circle(ctx, 162, 88, 5)
  ctx.fill()
  // Bow and a heart-tipped arrow.
  ctx.strokeStyle = color2
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.arc(176, 112, 36, -1.2, 1.2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(176 + Math.cos(-1.2) * 36, 112 + Math.sin(-1.2) * 36)
  ctx.lineTo(176 + Math.cos(1.2) * 36, 112 + Math.sin(1.2) * 36)
  ctx.stroke()
  ctx.strokeStyle = '#a16207'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(150, 112)
  ctx.lineTo(222, 112)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(236, 112)
  ctx.bezierCurveTo(232, 100, 216, 100, 220, 112)
  ctx.bezierCurveTo(216, 124, 232, 124, 236, 112)
  ctx.fill()
  ctx.strokeStyle = skin
  ctx.lineWidth = 10
  ctx.beginPath()
  ctx.moveTo(130, 100)
  ctx.lineTo(170, 112)
  ctx.stroke()
  // Front wing.
  wing(120, 88, flap, 0)
}

function leprechaun(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors, jig = false) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const skin = '#f5c6a0'
  const hop = jig ? -Math.abs(s) * 22 : -Math.abs(Math.cos(p)) * 5
  ctx.save()
  ctx.translate(0, hop)
  // Legs: walking, or kicking heels together in a jig.
  const legs: Array<[number, number, number]> = jig
    ? [[84, -0.5 * Math.max(0, s) - 0.1, 0.4], [100, 0.5 * Math.max(0, s) + 0.1, -0.4]]
    : [[84, s * 0.45, Math.max(0, s) * 0.4], [100, -s * 0.45, Math.max(0, -s) * 0.4]]
  for (const [x, a, k] of legs) {
    const [fx, fy] = limb(ctx, x, 200, 34, 34, a, k, 13, shade(color, -0.35))
    ctx.fillStyle = '#111'
    ellipse(ctx, fx + 8, fy + 4, 15, 7)
    ctx.fill()
    ctx.fillStyle = color2
    ctx.fillRect(fx + 2, fy, 8, 6)
  }
  // Coat.
  const g = ctx.createLinearGradient(0, 120, 0, 214)
  g.addColorStop(0, shade(color, 0.2))
  g.addColorStop(1, shade(color, -0.25))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(60, 128)
  ctx.lineTo(118, 128)
  ctx.lineTo(128, 210)
  ctx.lineTo(54, 210)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#111'
  ctx.fillRect(56, 172, 72, 10)
  ctx.fillStyle = color2
  ctx.fillRect(84, 168, 16, 18)
  ctx.fillStyle = '#111'
  ctx.fillRect(88, 172, 8, 10)
  // Arms: swinging, or up in the air.
  ctx.strokeStyle = color
  ctx.lineWidth = 13
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(88, 138)
  if (jig) {
    ctx.lineTo(124, 112)
    ctx.lineTo(132 + s * 6, 82)
  } else {
    ctx.lineTo(88 + s * 26, 188)
  }
  ctx.stroke()
  ctx.fillStyle = skin
  circle(ctx, jig ? 132 + s * 6 : 88 + s * 28, jig ? 76 : 194, 8)
  ctx.fill()
  // Face, red beard and a tall green hat with a buckle.
  ctx.fillStyle = skin
  circle(ctx, 94, 104, 25)
  ctx.fill()
  ctx.fillStyle = '#ea580c'
  ctx.beginPath()
  ctx.moveTo(70, 106)
  ctx.quadraticCurveTo(80, 152, 104, 140)
  ctx.quadraticCurveTo(124, 132, 118, 104)
  ctx.quadraticCurveTo(96, 122, 70, 106)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 104, 98, 3)
  ctx.fill()
  ctx.fillStyle = '#f59e9e'
  circle(ctx, 112, 108, 5)
  ctx.fill()
  ctx.fillStyle = shade(color, -0.1)
  ellipse(ctx, 94, 82, 40, 8)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(68, 82)
  ctx.lineTo(74, 22)
  ctx.lineTo(116, 22)
  ctx.lineTo(120, 82)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#111'
  ctx.fillRect(70, 62, 50, 12)
  ctx.strokeStyle = color2
  ctx.lineWidth = 4
  ctx.strokeRect(88, 60, 14, 16)
  ctx.restore()
}

function bunny(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  // One hop: crouched, stretched out in the air, landing.
  const q = f / frames
  const stretch = Math.sin(q * Math.PI)
  const fur = color
  const dark = shade(color, -0.18)
  ctx.save()
  ctx.translate(120, 180)
  ctx.rotate(-0.25 * Math.sin(q * TAU))
  ctx.translate(-120, -180)
  // Hind leg: folded under, or kicked out behind.
  ctx.fillStyle = dark
  ctx.save()
  ctx.translate(86, 168)
  ctx.rotate(-0.2 - stretch * 1.1)
  ellipse(ctx, 0, 18, 18, 36)
  ctx.fill()
  ellipse(ctx, -4, 52, 24, 9)
  ctx.fill()
  ctx.restore()
  // Body.
  const g = ctx.createLinearGradient(0, 110, 0, 200)
  g.addColorStop(0, shade(fur, 0.15))
  g.addColorStop(1, shade(fur, -0.15))
  ctx.fillStyle = g
  ellipse(ctx, 116, 160, 58 + stretch * 10, 40 - stretch * 6, -0.1)
  ctx.fill()
  // Fluffy tail.
  ctx.fillStyle = '#ffffff'
  circle(ctx, 56 - stretch * 6, 150, 16)
  ctx.fill()
  // Front paws reaching forward in the air.
  ctx.fillStyle = dark
  ellipse(ctx, 156 + stretch * 16, 192 - stretch * 8, 9, 18, -0.6 - stretch * 0.6)
  ctx.fill()
  // Head and long ears.
  ctx.fillStyle = fur
  circle(ctx, 172, 118, 30)
  ctx.fill()
  for (const [x, a] of [[160, -0.5], [176, -0.25]] as const) {
    ctx.save()
    ctx.translate(x, 96)
    ctx.rotate(a - stretch * 0.35)
    ctx.fillStyle = fur
    ellipse(ctx, 0, -40, 13, 44)
    ctx.fill()
    ctx.fillStyle = color2
    ellipse(ctx, 0, -38, 6, 34)
    ctx.fill()
    ctx.restore()
  }
  ctx.fillStyle = '#111'
  circle(ctx, 184, 112, 4)
  ctx.fill()
  ctx.fillStyle = color2
  circle(ctx, 200, 124, 5)
  ctx.fill()
  // A bow at the neck.
  ctx.beginPath()
  ctx.moveTo(150, 140)
  ctx.lineTo(136, 128)
  ctx.lineTo(136, 152)
  ctx.closePath()
  ctx.moveTo(150, 140)
  ctx.lineTo(164, 128)
  ctx.lineTo(164, 152)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function eagle(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const flap = Math.sin((f / frames) * TAU)
  const body = color
  const wing = (lift: number, k: number) => {
    // A broad wing from the shoulder to a tip of spread, fingered feathers.
    const tx = 112
    const ty = 98 - 118 * lift
    ctx.fillStyle = shade(body, k)
    ctx.beginPath()
    ctx.moveTo(206, 96)
    ctx.quadraticCurveTo(190, 98 - 70 * lift, tx + 12, ty)
    for (let i = 0; i <= 6; i++) {
      const u = i / 6
      const x = tx + 12 - u * 20 + (i % 2 ? 10 : 0)
      const y = ty + (98 - ty) * u * 0.55 + (i % 2 ? 6 * Math.sign(lift || 1) : 0)
      ctx.lineTo(x, y)
    }
    ctx.quadraticCurveTo(110, 100, 120, 102)
    ctx.closePath()
    ctx.fill()
  }
  wing(flap, -0.3)
  // White tail.
  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.moveTo(90, 100)
  ctx.lineTo(20, 86)
  ctx.lineTo(24, 122)
  ctx.closePath()
  ctx.fill()
  // Body.
  const g = ctx.createLinearGradient(0, 70, 0, 130)
  g.addColorStop(0, shade(body, 0.15))
  g.addColorStop(1, shade(body, -0.25))
  ctx.fillStyle = g
  ellipse(ctx, 160, 104, 76, 24, -0.05)
  ctx.fill()
  // Talons.
  ctx.fillStyle = color2
  ellipse(ctx, 140, 128, 10, 6)
  ctx.fill()
  // White head, hooked beak.
  ctx.fillStyle = '#f8fafc'
  ellipse(ctx, 248, 92, 30, 20, -0.15)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(272, 84)
  ctx.quadraticCurveTo(300, 84, 298, 104)
  ctx.lineTo(286, 98)
  ctx.lineTo(272, 100)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 262, 86, 3.4)
  ctx.fill()
  wing(flap * 1.1, 0.05)
}

function rocket(ctx: Ctx, _f: number, _n: number, { color }: SpriteColors) {
  const tail = ctx.createLinearGradient(0, 0, 130, 0)
  tail.addColorStop(0, 'rgba(255,170,60,0)')
  tail.addColorStop(1, 'rgba(255,220,140,0.9)')
  ctx.fillStyle = tail
  ctx.beginPath()
  ctx.moveTo(0, 24)
  ctx.lineTo(130, 16)
  ctx.lineTo(130, 32)
  ctx.closePath()
  ctx.fill()
  glow(ctx, 136, 24, 24, color, 1)
  ctx.fillStyle = '#fff'
  circle(ctx, 136, 24, 6)
  ctx.fill()
}

function spark(which: 'color' | 'color2' | 'white') {
  return (ctx: Ctx, _f: number, _n: number, c: SpriteColors) => {
    const col = which === 'white' ? '#fff3c4' : c[which]
    glow(ctx, 32, 32, 30, col, 1)
    ctx.fillStyle = '#ffffff'
    circle(ctx, 32, 32, 5)
    ctx.fill()
  }
}

function balloon(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const col = [color, color2, '#fbbf24', '#a855f7'][f % 4]
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(60, 168)
  ctx.bezierCurveTo(40, 196, 80, 220, 58, 256)
  ctx.stroke()
  const g = ctx.createRadialGradient(44, 56, 6, 60, 84, 70)
  g.addColorStop(0, shade(col, 0.55))
  g.addColorStop(0.4, col)
  g.addColorStop(1, shade(col, -0.35))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(60, 160)
  ctx.bezierCurveTo(-6, 120, 4, 8, 60, 8)
  ctx.bezierCurveTo(116, 8, 126, 120, 60, 160)
  ctx.fill()
  ctx.fillStyle = shade(col, -0.2)
  ctx.beginPath()
  ctx.moveTo(60, 156)
  ctx.lineTo(50, 172)
  ctx.lineTo(70, 172)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ellipse(ctx, 38, 50, 9, 18, 0.4)
  ctx.fill()
}

function butterfly(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  // Seen from above, heading right; the wings fold as they beat.
  const open = 0.2 + 0.8 * Math.abs(Math.cos((f / frames) * Math.PI))
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(100, 85)
    ctx.scale(1, side * open)
    const g = ctx.createLinearGradient(0, 0, 0, -80)
    g.addColorStop(0, shade(color, -0.25))
    g.addColorStop(1, color)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(6, -4)
    ctx.bezierCurveTo(40, -90, 90, -80, 70, -30)
    ctx.quadraticCurveTo(50, -6, 6, -4)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(0, -4)
    ctx.bezierCurveTo(-30, -70, -70, -50, -50, -20)
    ctx.quadraticCurveTo(-30, -4, 0, -4)
    ctx.fill()
    ctx.fillStyle = color2
    circle(ctx, 48, -50, 10)
    circle(ctx, -34, -34, 7)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(6, -4)
    ctx.bezierCurveTo(40, -90, 90, -80, 70, -30)
    ctx.stroke()
    ctx.restore()
  }
  ctx.fillStyle = '#1f1308'
  ellipse(ctx, 100, 85, 44, 7)
  ctx.fill()
  circle(ctx, 146, 85, 8)
  ctx.fill()
  ctx.strokeStyle = '#1f1308'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(150, 82)
  ctx.quadraticCurveTo(170, 70, 180, 60)
  ctx.moveTo(150, 88)
  ctx.quadraticCurveTo(170, 100, 180, 110)
  ctx.stroke()
}

function fish(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const wag = Math.sin((f / frames) * TAU)
  // Tail.
  ctx.fillStyle = shade(color, -0.15)
  ctx.beginPath()
  ctx.moveTo(60, 70)
  ctx.lineTo(10, 30 + wag * 12)
  ctx.quadraticCurveTo(26, 70, 10, 110 + wag * 12)
  ctx.closePath()
  ctx.fill()
  // Body with stripes.
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(124, 70, 82, 44, 0, 0, TAU)
  ctx.clip()
  const g = ctx.createLinearGradient(0, 26, 0, 114)
  g.addColorStop(0, shade(color, 0.3))
  g.addColorStop(1, shade(color, -0.25))
  ctx.fillStyle = g
  ctx.fillRect(40, 20, 170, 100)
  ctx.fillStyle = color2
  for (const x of [92, 140, 182]) {
    ctx.beginPath()
    ctx.ellipse(x, 70, 9, 50, 0.15 * wag, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
  // Fins.
  ctx.fillStyle = shade(color, -0.1)
  ctx.beginPath()
  ctx.moveTo(110, 30)
  ctx.quadraticCurveTo(124, 4, 150, 30)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(130, 84)
  ctx.lineTo(112 - wag * 6, 104)
  ctx.lineTo(140, 96)
  ctx.closePath()
  ctx.fill()
  // Eye.
  ctx.fillStyle = '#fff'
  circle(ctx, 180, 60, 10)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 183, 60, 5)
  ctx.fill()
}

// -- the rows each style is made of ------------------------------------------------------

const SPARKLE: SpriteRow = { id: 'sparkle', frames: 4, w: 64, h: 64, paint: sparkle }

export const SPRITE_ROWS: Record<string, SpriteRow[]> = {
  sleigh: [
    { id: 'main', frames: 8, w: 1024, h: 256, paint: sleighTeam },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Ho ho ho!') },
    SPARKLE,
  ],
  train: [
    { id: 'main', frames: 4, w: 512, h: 320, paint: engine },
    { id: 'gifts', frames: 4, w: 400, h: 264, paint: (ctx, f, n, c) => car(ctx, f, n, c, 'gifts') },
    { id: 'tree', frames: 4, w: 400, h: 264, paint: (ctx, f, n, c) => car(ctx, f, n, c, 'tree') },
    { id: 'puff', frames: 1, w: 128, h: 128, paint: puff },
    SPARKLE,
  ],
  birds: [{ id: 'main', frames: 8, w: 256, h: 176, paint: bird }, SPARKLE],
  bats: [{ id: 'main', frames: 8, w: 256, h: 160, paint: bat }, SPARKLE],
  elves: [
    { id: 'main', frames: 8, w: 176, h: 288, paint: (ctx, f, n, c) => elf(ctx, f, n, c) },
    { id: 'wave', frames: 4, w: 176, h: 288, paint: (ctx, f, n, c) => elf(ctx, f, n, c, true) },
    SPARKLE,
  ],
  penguins: [{ id: 'main', frames: 8, w: 192, h: 256, paint: penguin }, SPARKLE],
  'shooting-stars': [{ id: 'main', frames: 1, w: 512, h: 96, paint: shootingStar }, SPARKLE],
  ghosts: [{ id: 'main', frames: 8, w: 200, h: 240, paint: ghost }, SPARKLE],
  witch: [
    { id: 'main', frames: 8, w: 400, h: 260, paint: witch },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Hee hee hee!') },
    SPARKLE,
  ],
  ufo: [
    { id: 'main', frames: 3, w: 320, h: 200, paint: ufo },
    { id: 'beam', frames: 1, w: 200, h: 300, paint: ufoBeam },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('We come in peace!') },
    SPARKLE,
  ],
  skeletons: [
    { id: 'main', frames: 8, w: 180, h: 300, paint: (ctx, f, n, c) => skeleton(ctx, f, n, c) },
    { id: 'wave', frames: 8, w: 180, h: 300, paint: (ctx, f, n, c) => skeleton(ctx, f, n, c, true) },
    SPARKLE,
  ],
  zombies: [
    { id: 'main', frames: 8, w: 180, h: 300, paint: zombie },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Braaains!') },
    SPARKLE,
  ],
  'black-cats': [{ id: 'main', frames: 8, w: 260, h: 170, paint: blackCat }, SPARKLE],
  turkeys: [
    { id: 'main', frames: 8, w: 250, h: 220, paint: turkey },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Gobble gobble!') },
    SPARKLE,
  ],
  cupid: [{ id: 'main', frames: 8, w: 240, h: 200, paint: cupid }, SPARKLE],
  leprechauns: [
    { id: 'main', frames: 8, w: 190, h: 280, paint: (ctx, f, n, c) => leprechaun(ctx, f, n, c) },
    { id: 'wave', frames: 8, w: 190, h: 280, paint: (ctx, f, n, c) => leprechaun(ctx, f, n, c, true) },
    SPARKLE,
  ],
  bunnies: [{ id: 'main', frames: 8, w: 240, h: 240, paint: bunny }, SPARKLE],
  eagles: [{ id: 'main', frames: 8, w: 320, h: 180, paint: eagle }, SPARKLE],
  rockets: [
    { id: 'main', frames: 1, w: 160, h: 48, paint: rocket },
    { id: 'spark1', frames: 1, w: 64, h: 64, paint: spark('color') },
    { id: 'spark2', frames: 1, w: 64, h: 64, paint: spark('color2') },
    { id: 'spark3', frames: 1, w: 64, h: 64, paint: spark('white') },
    SPARKLE,
  ],
  balloons: [{ id: 'main', frames: 4, w: 120, h: 260, paint: balloon }, SPARKLE],
  butterflies: [{ id: 'main', frames: 8, w: 200, h: 170, paint: butterfly }, SPARKLE],
  fish: [{ id: 'main', frames: 8, w: 220, h: 140, paint: fish }, SPARKLE],
}
