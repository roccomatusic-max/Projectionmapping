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

// -- things that fall, drift, rise and hang -----------------------------------------------------

/** A snow crystal, six arms; each frame is a different crystal. */
function snowCrystal(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  glow(ctx, 64, 64, 62, color2, 0.3)
  ctx.save()
  ctx.translate(64, 64)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const v = f % 4
  for (let k = 0; k < 6; k++) {
    ctx.save()
    ctx.rotate((k / 6) * TAU)
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, -54)
    ctx.stroke()
    ctx.lineWidth = 4
    const pairs: Array<[number, number, number]> =
      v === 0 ? [[-22, 14, 0.9], [-38, 10, 0.9]]
        : v === 1 ? [[-30, 12, 1.05]]
          : v === 2 ? [[-16, 10, 0.8], [-27, 13, 0.8], [-38, 11, 0.8], [-47, 7, 0.8]]
            : [[-20, 18, 0.7], [-36, 14, 0.7]]
    for (const [y, len, a] of pairs) {
      ctx.beginPath()
      ctx.moveTo(-Math.sin(a) * len, y - Math.cos(a) * len)
      ctx.lineTo(0, y)
      ctx.lineTo(Math.sin(a) * len, y - Math.cos(a) * len)
      ctx.stroke()
    }
    if (v === 1) {
      // A little plate on the end.
      ctx.beginPath()
      for (let j = 0; j < 6; j++) ctx.lineTo(Math.cos((j / 6) * TAU) * 8, -54 + Math.sin((j / 6) * TAU) * 8)
      ctx.closePath()
      ctx.fill()
    }
    if (v === 3) {
      ctx.beginPath()
      ctx.moveTo(0, -42)
      ctx.lineTo(-7, -50)
      ctx.lineTo(0, -60)
      ctx.lineTo(7, -50)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }
  ctx.beginPath()
  for (let j = 0; j < 6; j++) ctx.lineTo(Math.cos((j / 6) * TAU + Math.PI / 6) * 11, Math.sin((j / 6) * TAU + Math.PI / 6) * 11)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** An autumn leaf: maple or oak, in the element's two colours and a darker one of each. */
function fallingLeaf(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const col = [color, color2, shade(color, -0.25), shade(color2, 0.2)][f % 4]
  const maple = f % 2 === 0
  ctx.save()
  ctx.translate(70, 74)
  ctx.beginPath()
  const steps = 90
  for (let i = 0; i <= steps; i++) {
    // From the stem round and back, the edge in lobes.
    const a = -Math.PI / 2 + 0.32 + (i / steps) * (TAU - 0.64)
    const lobes = maple
      ? 0.42 + 0.58 * Math.pow(Math.abs(Math.cos(2.5 * (a + Math.PI / 2))), 0.7) - 0.08 * (i % 6 === 3 ? 1 : 0)
      : 0.8 + 0.1 * Math.cos(9 * (a + Math.PI / 2))
    const rx = maple ? 60 : 46
    const ry = maple ? 60 : 64
    ctx.lineTo(Math.cos(a) * rx * lobes, -Math.sin(a) * ry * lobes)
  }
  ctx.closePath()
  const g = ctx.createRadialGradient(-10, -16, 4, 0, 0, 70)
  g.addColorStop(0, shade(col, 0.35))
  g.addColorStop(0.6, col)
  g.addColorStop(1, shade(col, -0.35))
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = shade(col, -0.45)
  ctx.lineWidth = 2
  ctx.stroke()
  // Veins and the stem.
  ctx.strokeStyle = rgba('#fff7e6', 0.45)
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(0, 46)
  ctx.lineTo(0, -48)
  for (const a of maple ? [0.9, -0.9, 2.1, -2.1] : [0.7, -0.7, 0.9, -0.9]) {
    const y0 = maple ? 6 : a > 0.8 || a < -0.8 ? 20 : -14
    const len = maple ? 40 : 26
    ctx.moveTo(0, y0)
    ctx.lineTo(Math.sin(a) * len, y0 - Math.cos(a) * len)
  }
  ctx.stroke()
  ctx.strokeStyle = shade(col, -0.5)
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(0, 40)
  ctx.quadraticCurveTo(4, 56, -2, 64)
  ctx.stroke()
  ctx.restore()
}

/** A cherry blossom petal, notched at the tip; frames curl it a little differently. */
function petal(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  ctx.save()
  ctx.translate(45, 48)
  ctx.scale(1, 0.7 + 0.1 * (f % 4))
  ctx.beginPath()
  ctx.moveTo(0, 36)
  ctx.bezierCurveTo(-40, 10, -30, -34, -8, -38)
  ctx.lineTo(0, -28)
  ctx.lineTo(8, -38)
  ctx.bezierCurveTo(30, -34, 40, 10, 0, 36)
  const g = ctx.createLinearGradient(0, 36, 0, -38)
  g.addColorStop(0, shade(color2, 0.1))
  g.addColorStop(0.45, color)
  g.addColorStop(1, shade(color, 0.55))
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = rgba('#ffffff', 0.5)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(0, 30)
  ctx.lineTo(0, -20)
  ctx.stroke()
  ctx.restore()
}

/** A scrap of confetti: a strip, a curl, a dot or a star, in party colours. */
function confetti(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const col = [color, color2, '#fbbf24', '#22c55e', '#38bdf8', '#f472b6'][f % 6]
  ctx.fillStyle = col
  ctx.strokeStyle = col
  const kind = f % 4
  if (kind === 0) {
    ctx.fillRect(16, 30, 48, 20)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fillRect(16, 30, 48, 6)
  } else if (kind === 1) {
    ctx.lineWidth = 9
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let x = 0; x <= 56; x += 4) ctx.lineTo(12 + x, 40 + Math.sin(x / 9) * 14)
    ctx.stroke()
  } else if (kind === 2) {
    circle(ctx, 40, 40, 17)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    circle(ctx, 34, 34, 6)
    ctx.fill()
  } else {
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 9 : 22
      const a = (i / 10) * TAU - Math.PI / 2
      ctx.lineTo(40 + Math.cos(a) * r, 40 + Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fill()
  }
}

function heartPath(ctx: Ctx, cx: number, cy: number, s: number) {
  ctx.beginPath()
  ctx.moveTo(cx, cy + s * 0.9)
  ctx.bezierCurveTo(cx - s * 1.3, cy + s * 0.1, cx - s * 0.9, cy - s * 0.95, cx, cy - s * 0.4)
  ctx.bezierCurveTo(cx + s * 0.9, cy - s * 0.95, cx + s * 1.3, cy + s * 0.1, cx, cy + s * 0.9)
  ctx.closePath()
}

/** A shiny heart, in either colour. */
function fallingHeart(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const col = f % 2 ? color2 : color
  glow(ctx, 55, 52, 52, col, 0.35)
  heartPath(ctx, 55, 50, 40)
  const g = ctx.createRadialGradient(40, 30, 4, 55, 50, 56)
  g.addColorStop(0, shade(col, 0.5))
  g.addColorStop(0.5, col)
  g.addColorStop(1, shade(col, -0.35))
  ctx.fillStyle = g
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ellipse(ctx, 36, 32, 9, 5, -0.6)
  ctx.fill()
}

/** A shamrock: four leaves for luck, or three. */
function clover(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const leaves = f % 2 ? 3 : 4
  ctx.save()
  ctx.translate(60, 56)
  ctx.strokeStyle = shade(color, -0.3)
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(8, 30, 2, 52)
  ctx.stroke()
  for (let k = 0; k < leaves; k++) {
    ctx.save()
    ctx.rotate((k / leaves) * TAU + (leaves === 3 ? 0 : Math.PI / 4))
    heartPath(ctx, 0, -22, 20)
    const g = ctx.createLinearGradient(0, 0, 0, -44)
    g.addColorStop(0, shade(color, -0.25))
    g.addColorStop(1, shade(color, 0.25))
    ctx.fillStyle = g
    ctx.fill()
    ctx.strokeStyle = rgba(color2, 0.7)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, -4)
    ctx.lineTo(0, -30)
    ctx.stroke()
    ctx.restore()
  }
  ctx.restore()
}

/** A spider hanging head down on its thread, legs paddling; outlined in its glow so it shows on a dark house. */
function hangingSpider(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  ctx.save()
  ctx.shadowColor = color2
  ctx.shadowBlur = 14
  ctx.strokeStyle = shade(color, 0.15)
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const wig = Math.sin(p + k * 1.3 + (side > 0 ? 0.7 : 0)) * 0.18
      const a = -0.9 + k * 0.55 + wig
      const kx = 80 + side * (24 + Math.cos(a) * 28)
      const ky = 78 + Math.sin(a) * 30 - 10
      ctx.beginPath()
      ctx.moveTo(80 + side * 14, 80 + k * 6)
      ctx.lineTo(kx, ky)
      ctx.lineTo(kx + side * 16, ky + 28 + k * 4)
      ctx.stroke()
    }
  }
  // Abdomen above (it hangs from it), head below.
  const g = ctx.createRadialGradient(72, 46, 4, 80, 56, 40)
  g.addColorStop(0, shade(color, 0.35))
  g.addColorStop(1, color)
  ctx.fillStyle = g
  ellipse(ctx, 80, 56, 32, 36)
  ctx.fill()
  ctx.fillStyle = shade(color, 0.1)
  circle(ctx, 80, 104, 20)
  ctx.fill()
  ctx.restore()
  // A mark on its back and glowing eyes.
  ctx.fillStyle = rgba(color2, 0.85)
  ctx.beginPath()
  ctx.moveTo(80, 36)
  ctx.lineTo(90, 54)
  ctx.lineTo(80, 72)
  ctx.lineTo(70, 54)
  ctx.closePath()
  ctx.fill()
  for (const x of [72, 88]) {
    glow(ctx, x, 110, 10, color2, 1)
    ctx.fillStyle = '#ffffff'
    circle(ctx, x, 110, 3.5)
    ctx.fill()
  }
}

/** The spider's silk: a thin bright line, stretched to length where drawn. */
function silk(ctx: Ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, 'rgba(255,255,255,0.25)')
  g.addColorStop(1, 'rgba(255,255,255,0.8)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 8, 256)
}

/** A paper sky lantern with a flame inside; frames flicker. */
function skyLantern(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const flick = [1, 0.85, 0.95, 0.78][f % 4]
  glow(ctx, 60, 96, 76 * flick, color, 0.55)
  ctx.beginPath()
  ctx.moveTo(30, 22)
  ctx.quadraticCurveTo(60, 8, 90, 22)
  ctx.lineTo(100, 138)
  ctx.quadraticCurveTo(60, 148, 20, 138)
  ctx.closePath()
  const g = ctx.createLinearGradient(0, 150, 0, 10)
  g.addColorStop(0, shade(color2, 0.5))
  g.addColorStop(0.35, shade(color, 0.2))
  g.addColorStop(1, shade(color, -0.25))
  ctx.fillStyle = g
  ctx.fill()
  // Paper ribs.
  ctx.strokeStyle = rgba('#7c2d12', 0.35)
  ctx.lineWidth = 2
  ctx.beginPath()
  for (const x of [45, 60, 75]) {
    ctx.moveTo(x, 16)
    ctx.lineTo(x + (x - 60) * 0.35, 142)
  }
  ctx.stroke()
  // The flame at the open bottom.
  glow(ctx, 60, 136, 26 * flick, color2, 1)
  ctx.fillStyle = '#fff7d6'
  ellipse(ctx, 60, 134, 6, 10 * flick)
  ctx.fill()
}

/** A jellyfish pulsing its bell, tentacles trailing; see-through and glowing. */
function jellyfish(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const squeeze = 0.5 + 0.5 * Math.sin(p)
  const bw = 62 - squeeze * 12
  const bh = 50 + squeeze * 10
  glow(ctx, 80, 64, 90, color, 0.35)
  // Tentacles.
  ctx.lineCap = 'round'
  for (let k = 0; k < 7; k++) {
    const x0 = 80 - bw * 0.8 + (k / 6) * bw * 1.6
    ctx.strokeStyle = rgba(k % 2 ? color2 : color, 0.7)
    ctx.lineWidth = k % 2 ? 3 : 4.5
    ctx.beginPath()
    ctx.moveTo(x0, 74)
    for (let y = 0; y <= 130; y += 10) ctx.lineTo(x0 + Math.sin(p + y / 22 + k) * (4 + y * 0.07), 74 + y)
    ctx.stroke()
  }
  // Frilly arms in the middle.
  ctx.strokeStyle = rgba(color2, 0.9)
  ctx.lineWidth = 7
  for (const dx of [-8, 8]) {
    ctx.beginPath()
    ctx.moveTo(80 + dx, 72)
    for (let y = 0; y <= 80; y += 8) ctx.lineTo(80 + dx + Math.sin(p * 1.3 + y / 12 + dx) * 7, 72 + y)
    ctx.stroke()
  }
  // The bell.
  ctx.beginPath()
  ctx.moveTo(80 - bw, 76)
  ctx.bezierCurveTo(80 - bw, 76 - bh * 1.3, 80 + bw, 76 - bh * 1.3, 80 + bw, 76)
  for (let k = 0; k <= 8; k++) ctx.lineTo(80 + bw - (k / 8) * bw * 2, 76 + (k % 2 ? 6 : 0))
  ctx.closePath()
  const g = ctx.createRadialGradient(80, 50, 6, 80, 60, bw * 1.2)
  g.addColorStop(0, rgba('#ffffff', 0.9))
  g.addColorStop(0.4, rgba(color, 0.75))
  g.addColorStop(1, rgba(color, 0.4))
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = rgba(color2, 0.8)
  ctx.lineWidth = 2.5
  ctx.stroke()
}

/** A soap bubble: a thin rainbow rim and a window of light. */
function risingBubble(ctx: Ctx, _f: number, _n: number, { color, color2 }: SpriteColors) {
  const g = ctx.createRadialGradient(50, 50, 30, 50, 50, 46)
  g.addColorStop(0, 'rgba(255,255,255,0.03)')
  g.addColorStop(0.75, rgba(color, 0.25))
  g.addColorStop(0.92, rgba(color2, 0.7))
  g.addColorStop(1, 'rgba(255,255,255,0.0)')
  ctx.fillStyle = g
  circle(ctx, 50, 50, 46)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 2
  circle(ctx, 50, 50, 42)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ellipse(ctx, 34, 32, 10, 6, -0.7)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  circle(ctx, 64, 68, 4)
  ctx.fill()
}

/** A hot air balloon with striped panels and a wicker basket; each frame is another pattern. */
function hotAirBalloon(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const schemes = [[color, color2], [color2, '#fbbf24'], ['#fbbf24', color], [color, '#f8fafc']]
  const [a, b] = schemes[f % 4]
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(100, 220)
  ctx.bezierCurveTo(10, 150, 4, 12, 100, 12)
  ctx.bezierCurveTo(196, 12, 190, 150, 100, 220)
  ctx.clip()
  for (let k = 0; k < 8; k++) {
    ctx.fillStyle = k % 2 ? b : a
    ctx.beginPath()
    const x0 = (k / 8) * 200
    const x1 = ((k + 1) / 8) * 200
    ctx.moveTo(100, 230)
    ctx.quadraticCurveTo(x0 + (x0 - 100) * 0.2, 60, (x0 - 100) * 0.3 + 100, 0)
    ctx.lineTo((x1 - 100) * 0.3 + 100, 0)
    ctx.quadraticCurveTo(x1 + (x1 - 100) * 0.2, 60, 100, 230)
    ctx.closePath()
    ctx.fill()
  }
  const shine = ctx.createLinearGradient(10, 0, 190, 0)
  shine.addColorStop(0, 'rgba(0,0,0,0.35)')
  shine.addColorStop(0.35, 'rgba(255,255,255,0.18)')
  shine.addColorStop(1, 'rgba(0,0,0,0.45)')
  ctx.fillStyle = shine
  ctx.fillRect(0, 0, 200, 230)
  ctx.restore()
  // Ropes, the burner's glow and the basket.
  ctx.strokeStyle = '#6b4b2a'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(72, 208)
  ctx.lineTo(82, 254)
  ctx.moveTo(128, 208)
  ctx.lineTo(118, 254)
  ctx.stroke()
  glow(ctx, 100, 236, 22, '#fb923c', 0.9)
  ctx.fillStyle = '#a16207'
  ctx.beginPath()
  ctx.roundRect(78, 252, 44, 34, 5)
  ctx.fill()
  ctx.strokeStyle = '#713f12'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let y = 258; y < 286; y += 7) {
    ctx.moveTo(80, y)
    ctx.lineTo(120, y)
  }
  ctx.stroke()
}

/** A firefly: a soft glow round a bright spot. */
function firefly(ctx: Ctx, _f: number, _n: number, { color, color2 }: SpriteColors) {
  glow(ctx, 32, 32, 31, color, 1)
  glow(ctx, 32, 32, 12, color2, 1)
  ctx.fillStyle = '#fffbe0'
  circle(ctx, 32, 32, 4)
  ctx.fill()
}

/** A bumblebee from the side, wings a blur of beats. */
function bee(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const beat = Math.abs(Math.cos((f / frames) * TAU * 2))
  // Back wing, body, front wing.
  ctx.fillStyle = 'rgba(220,240,255,0.55)'
  ellipse(ctx, 74, 52 - beat * 6, 24, 12 + beat * 9, -0.5 - beat * 0.5)
  ctx.fill()
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(80, 76, 52, 36, 0, 0, TAU)
  ctx.clip()
  const g = ctx.createLinearGradient(0, 40, 0, 112)
  g.addColorStop(0, shade(color, 0.35))
  g.addColorStop(1, shade(color, -0.2))
  ctx.fillStyle = g
  ctx.fillRect(20, 30, 120, 90)
  ctx.fillStyle = '#1c1917'
  for (const x of [52, 84]) {
    ctx.beginPath()
    ctx.ellipse(x, 76, 9, 40, 0.1, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
  // Stinger, head, eye, antenna.
  ctx.fillStyle = '#1c1917'
  ctx.beginPath()
  ctx.moveTo(30, 72)
  ctx.lineTo(10, 80)
  ctx.lineTo(32, 86)
  ctx.closePath()
  ctx.fill()
  circle(ctx, 134, 70, 22)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  circle(ctx, 142, 64, 7)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 144, 64, 3.5)
  ctx.fill()
  ctx.strokeStyle = '#1c1917'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(140, 50)
  ctx.quadraticCurveTo(150, 30, 160, 28)
  ctx.stroke()
  ctx.fillStyle = color2
  ellipse(ctx, 70, 108, 12, 6)
  ctx.fill()
  ctx.fillStyle = 'rgba(235,248,255,0.7)'
  ellipse(ctx, 88, 50 - beat * 8, 28, 14 + beat * 11, -0.35 - beat * 0.5)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'
  ctx.lineWidth = 1.5
  ctx.stroke()
}

// -- more flyers and swimmers ----------------------------------------------------------------------

/** A dragon in flight, wings beating, tail curling behind; its fire is a row of its own. */
function dragon(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  // Wings beat mostly above the body, dipping just below it on the down stroke.
  const lift = 0.32 + 0.68 * Math.sin(p)
  const dark = shade(color, -0.35)
  // Room above for the wings.
  ctx.translate(0, 60)
  // A bat-like wing: an arm to the tip, finger bones fanning back, the skin scalloped between them.
  const wing = (front: boolean) => {
    const k = front ? 1 : 0.82
    const sx = front ? 236 : 222
    const sy = 140
    const ex = sx + 44 * k
    const ey = sy - 96 * lift * k - 8
    const tip: [number, number] = [sx + 150 * k, sy - 190 * lift * k]
    const ends: Array<[number, number]> = [
      tip,
      [sx + 96 * k, sy - 118 * lift * k + 46],
      [sx + 36 * k, sy - 60 * lift * k + 58],
      [sx - 40, sy + 10],
    ]
    ctx.fillStyle = front ? shade(color, -0.05) : dark
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(ex, ey)
    ctx.lineTo(tip[0], tip[1])
    for (let i = 1; i < ends.length; i++) {
      const [px, py] = ends[i - 1]
      const [qx, qy] = ends[i]
      // Each scallop bows in towards the elbow.
      ctx.quadraticCurveTo((px + qx) / 2 + (ex - (px + qx) / 2) * 0.35, (py + qy) / 2 + (ey - (py + qy) / 2) * 0.35, qx, qy)
    }
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = shade(color, front ? -0.45 : -0.6)
    ctx.lineCap = 'round'
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(ex, ey)
    ctx.lineTo(tip[0], tip[1])
    ctx.stroke()
    ctx.lineWidth = 3.5
    ctx.beginPath()
    for (const [x, y] of ends.slice(1, 3)) {
      ctx.moveTo(ex, ey)
      ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.fillStyle = color2
    circle(ctx, ex, ey, 5)
    ctx.fill()
  }
  wing(false)
  // Tail, curling behind.
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineWidth = 26
  ctx.beginPath()
  ctx.moveTo(200, 160)
  ctx.bezierCurveTo(140, 190 + lift * 10, 90, 130, 40, 150 - lift * 14)
  ctx.stroke()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(40, 150 - lift * 14)
  ctx.lineTo(8, 128 - lift * 14)
  ctx.lineTo(18, 162 - lift * 14)
  ctx.closePath()
  ctx.fill()
  // Back legs.
  ctx.strokeStyle = dark
  ctx.lineWidth = 16
  ctx.beginPath()
  ctx.moveTo(214, 178)
  ctx.lineTo(196, 214)
  ctx.lineTo(176, 222)
  ctx.stroke()
  // Body and belly.
  const g = ctx.createLinearGradient(0, 120, 0, 200)
  g.addColorStop(0, shade(color, 0.25))
  g.addColorStop(1, shade(color, -0.3))
  ctx.fillStyle = g
  ellipse(ctx, 250, 166, 66, 34, -0.12)
  ctx.fill()
  ctx.fillStyle = color2
  ellipse(ctx, 256, 186, 50, 14, -0.12)
  ctx.fill()
  ctx.strokeStyle = shade(color2, -0.3)
  ctx.lineWidth = 2
  for (let x = 220; x < 300; x += 12) {
    ctx.beginPath()
    ctx.moveTo(x, 178)
    ctx.lineTo(x + 2, 196)
    ctx.stroke()
  }
  // Spines down the back.
  ctx.fillStyle = color2
  for (let k = 0; k < 7; k++) {
    const x = 200 + k * 22
    const y = 140 - Math.sin((k / 6) * Math.PI) * 10 + (k > 4 ? (k - 4) * 6 : 0)
    ctx.beginPath()
    ctx.moveTo(x - 8, y + 4)
    ctx.lineTo(x, y - 14)
    ctx.lineTo(x + 8, y + 4)
    ctx.closePath()
    ctx.fill()
  }
  // Neck and head.
  ctx.strokeStyle = color
  ctx.lineWidth = 30
  ctx.beginPath()
  ctx.moveTo(300, 150)
  ctx.quadraticCurveTo(340, 110, 380, 104)
  ctx.stroke()
  ctx.fillStyle = color
  ellipse(ctx, 392, 100, 34, 22, 0.1)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(400, 92)
  ctx.lineTo(462, 104)
  ctx.lineTo(456, 118)
  ctx.lineTo(398, 120)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = shade(color2, -0.1)
  ctx.beginPath()
  ctx.moveTo(380, 84)
  ctx.lineTo(352, 56)
  ctx.lineTo(392, 80)
  ctx.moveTo(394, 80)
  ctx.lineTo(376, 50)
  ctx.lineTo(406, 82)
  ctx.fill()
  // Eye and nostril.
  ctx.fillStyle = '#fde047'
  ellipse(ctx, 404, 94, 8, 6)
  ctx.fill()
  ctx.fillStyle = '#111'
  ellipse(ctx, 406, 94, 2.5, 5.5)
  ctx.fill()
  circle(ctx, 452, 106, 3)
  ctx.fill()
  // Front legs.
  ctx.strokeStyle = shade(color, -0.15)
  ctx.lineWidth = 12
  ctx.beginPath()
  ctx.moveTo(296, 184)
  ctx.lineTo(312, 212)
  ctx.lineTo(330, 210)
  ctx.stroke()
  wing(true)
}

/** Dragon fire: a cone of flame, brightest at the mouth; frames flicker. */
function dragonFire(ctx: Ctx, f: number, _n: number, { color2 }: SpriteColors) {
  const k = [1, 0.9, 1.05, 0.85][f % 4]
  glow(ctx, 120, 70, 110 * k, '#f97316', 0.6)
  const tongue = (len: number, w: number, col: string, wob: number) => {
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.moveTo(0, 70)
    ctx.quadraticCurveTo(len * 0.5, 70 - w + wob, len, 70 + wob * 0.5)
    ctx.quadraticCurveTo(len * 0.5, 70 + w + wob, 0, 70)
    ctx.fill()
  }
  tongue(300 * k, 52, rgba('#dc2626', 0.75), Math.sin(f * 2.1) * 8)
  tongue(250 * k, 38, rgba('#f97316', 0.9), Math.sin(f * 1.7) * 6)
  tongue(190 * k, 24, color2, Math.sin(f * 2.9) * 4)
  tongue(110 * k, 12, '#fffbeb', 0)
}

/** An owl flying across, head turned to look at you; big eyes in the element's second colour. */
function owl(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const lift = 0.35 + 0.65 * Math.sin((f / frames) * TAU)
  const wing = (front: boolean) => {
    const tip = 110 - lift * (front ? 90 : 70)
    ctx.fillStyle = front ? shade(color, 0.05) : shade(color, -0.3)
    ctx.beginPath()
    ctx.moveTo(130, 120)
    ctx.quadraticCurveTo(front ? 110 : 150, tip - 20, front ? 60 : 110, tip)
    for (let k = 0; k < 5; k++) ctx.lineTo((front ? 60 : 110) + k * 14, tip + 14 + (k % 2) * 8)
    ctx.quadraticCurveTo(150, 130, 170, 130)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = rgba('#fef3c7', 0.4)
    ctx.lineWidth = 2
    ctx.stroke()
  }
  wing(false)
  // Body and tail.
  const g = ctx.createLinearGradient(0, 90, 0, 170)
  g.addColorStop(0, shade(color, 0.2))
  g.addColorStop(1, shade(color, -0.2))
  ctx.fillStyle = g
  ellipse(ctx, 160, 132, 64, 34, -0.1)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(100, 130)
  ctx.lineTo(60, 140)
  ctx.lineTo(70, 152)
  ctx.lineTo(104, 146)
  ctx.fill()
  ctx.fillStyle = shade(color, 0.45)
  for (let k = 0; k < 6; k++) {
    ctx.beginPath()
    ctx.arc(140 + k * 12, 146 + (k % 2) * 6, 4, 0, Math.PI)
    ctx.fill()
  }
  // Round head facing out, with ear tufts and the face disc.
  ctx.fillStyle = color
  circle(ctx, 230, 100, 42)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(196, 74)
  ctx.lineTo(194, 46)
  ctx.lineTo(214, 66)
  ctx.moveTo(264, 74)
  ctx.lineTo(266, 46)
  ctx.lineTo(246, 66)
  ctx.fill()
  ctx.fillStyle = shade(color, 0.5)
  ellipse(ctx, 214, 104, 20, 22)
  ellipse(ctx, 246, 104, 20, 22)
  ctx.fill()
  for (const x of [214, 246]) {
    glow(ctx, x, 102, 22, color2, 0.6)
    ctx.fillStyle = color2
    circle(ctx, x, 102, 12)
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, x, 102, 6)
    ctx.fill()
    ctx.fillStyle = '#fff'
    circle(ctx, x - 3, 98, 2.5)
    ctx.fill()
  }
  ctx.fillStyle = '#f59e0b'
  ctx.beginPath()
  ctx.moveTo(224, 116)
  ctx.lineTo(236, 116)
  ctx.lineTo(230, 132)
  ctx.closePath()
  ctx.fill()
  wing(true)
}

/** A Christmas angel blowing a trumpet: white robe, gold halo and wings beating slowly. */
function angel(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const lift = Math.sin((f / frames) * TAU)
  glow(ctx, 160, 120, 130, color2, 0.25)
  const wing = (front: boolean) => {
    const tip = 70 - lift * (front ? 40 : 30)
    const g = ctx.createLinearGradient(130, tip, 130, 150)
    g.addColorStop(0, shade(color2, 0.4))
    g.addColorStop(1, front ? '#ffffff' : '#e2e8f0')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(140, 120)
    ctx.quadraticCurveTo(front ? 100 : 140, tip - 30, front ? 40 : 80, tip)
    for (let k = 0; k < 5; k++) ctx.quadraticCurveTo((front ? 40 : 80) + k * 16 + 4, tip + 30 + k * 6, (front ? 50 : 90) + k * 16, tip + 24 + k * 8)
    ctx.quadraticCurveTo(130, 140, 150, 136)
    ctx.closePath()
    ctx.fill()
  }
  wing(false)
  // Flowing robe, horizontal as she flies.
  const robe = ctx.createLinearGradient(0, 110, 0, 190)
  robe.addColorStop(0, '#ffffff')
  robe.addColorStop(1, shade(color, -0.15))
  ctx.fillStyle = robe
  ctx.beginPath()
  ctx.moveTo(196, 120)
  ctx.quadraticCurveTo(140, 116, 70, 150 + lift * 6)
  ctx.lineTo(60, 176 + lift * 4)
  ctx.lineTo(80, 168)
  ctx.lineTo(84, 186 + lift * 4)
  ctx.quadraticCurveTo(150, 176, 206, 160)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = color2
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(176, 126)
  ctx.lineTo(186, 160)
  ctx.stroke()
  // Head, hair, halo.
  ctx.fillStyle = '#facc15'
  circle(ctx, 222, 112, 24)
  ctx.fill()
  ctx.fillStyle = SKIN
  circle(ctx, 230, 116, 18)
  ctx.fill()
  ctx.fillStyle = '#3b2a1a'
  circle(ctx, 238, 112, 2.5)
  ctx.fill()
  ctx.strokeStyle = color2
  ctx.lineWidth = 5
  ellipse(ctx, 222, 84, 24, 7, -0.15)
  ctx.stroke()
  // Arms and the trumpet.
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 10
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(206, 132)
  ctx.lineTo(240, 128)
  ctx.stroke()
  ctx.fillStyle = color2
  ctx.fillRect(244, 120, 40, 6)
  ctx.beginPath()
  ctx.moveTo(282, 123)
  ctx.lineTo(306, 108)
  ctx.lineTo(306, 138)
  ctx.closePath()
  ctx.fill()
  wing(true)
}

/** A shark gliding, tail sweeping; white belly in the second colour. */
function shark(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const sweep = Math.sin((f / frames) * TAU)
  // Tail.
  ctx.fillStyle = shade(color, -0.15)
  ctx.beginPath()
  ctx.moveTo(80, 86)
  ctx.lineTo(18, 28 + sweep * 14)
  ctx.quadraticCurveTo(40, 80, 30, 132 + sweep * 10)
  ctx.closePath()
  ctx.fill()
  // Body.
  ctx.beginPath()
  ctx.moveTo(70, 86)
  ctx.bezierCurveTo(140, 40, 260, 36, 360, 82)
  ctx.quadraticCurveTo(300, 120, 200, 122)
  ctx.quadraticCurveTo(120, 118, 70, 86)
  const g = ctx.createLinearGradient(0, 40, 0, 122)
  g.addColorStop(0, shade(color, 0.2))
  g.addColorStop(0.55, color)
  g.addColorStop(1, shade(color, -0.2))
  ctx.fillStyle = g
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(120, 104)
  ctx.quadraticCurveTo(240, 132, 352, 88)
  ctx.quadraticCurveTo(300, 120, 200, 122)
  ctx.quadraticCurveTo(150, 120, 120, 104)
  ctx.fill()
  // Fins.
  ctx.fillStyle = shade(color, -0.1)
  ctx.beginPath()
  ctx.moveTo(180, 52)
  ctx.quadraticCurveTo(196, 20, 186, 4)
  ctx.quadraticCurveTo(220, 30, 232, 48)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(230, 112)
  ctx.lineTo(200 - sweep * 6, 150)
  ctx.lineTo(258, 116)
  ctx.closePath()
  ctx.fill()
  // Gills, eye, mouth.
  ctx.strokeStyle = shade(color, -0.4)
  ctx.lineWidth = 2.5
  for (let k = 0; k < 4; k++) {
    ctx.beginPath()
    ctx.moveTo(276 + k * 8, 70)
    ctx.quadraticCurveTo(272 + k * 8, 86, 278 + k * 8, 100)
    ctx.stroke()
  }
  ctx.fillStyle = '#0b0b0b'
  circle(ctx, 324, 70, 5)
  ctx.fill()
  ctx.strokeStyle = '#3f3f46'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(316, 96)
  ctx.quadraticCurveTo(336, 102, 350, 92)
  ctx.stroke()
}

/** A sea turtle rowing with its flippers: patterned shell, spotted skin. */
function seaTurtle(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const stroke = Math.sin((f / frames) * TAU)
  const flipper = (x: number, y: number, len: number, a: number) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(a)
    ctx.fillStyle = shade(color2, -0.1)
    ctx.beginPath()
    ctx.moveTo(0, -10)
    ctx.quadraticCurveTo(len * 0.6, -18, len, 4)
    ctx.quadraticCurveTo(len * 0.5, 10, 0, 10)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  flipper(180, 96, 90, -0.9 - stroke * 0.6)
  flipper(96, 124, 50, 2.6 + stroke * 0.3)
  // Head.
  ctx.fillStyle = color2
  ellipse(ctx, 252, 108, 30, 20, 0.1)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 262, 102, 4)
  ctx.fill()
  // Shell with plates.
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(150, 110, 84, 54, -0.05, 0, TAU)
  const g = ctx.createRadialGradient(140, 90, 10, 150, 110, 90)
  g.addColorStop(0, shade(color, 0.3))
  g.addColorStop(1, shade(color, -0.35))
  ctx.fillStyle = g
  ctx.fill()
  ctx.clip()
  ctx.strokeStyle = shade(color, 0.45)
  ctx.lineWidth = 3
  for (const [x, y] of [[150, 104], [110, 98], [190, 100], [130, 140], [172, 140], [150, 70], [108, 66], [194, 68]]) {
    ctx.beginPath()
    for (let j = 0; j < 6; j++) ctx.lineTo(x + Math.cos((j / 6) * TAU) * 22, y + Math.sin((j / 6) * TAU) * 18)
    ctx.closePath()
    ctx.stroke()
  }
  ctx.restore()
  ctx.strokeStyle = shade(color, -0.5)
  ctx.lineWidth = 4
  ellipse(ctx, 150, 110, 84, 54, -0.05)
  ctx.stroke()
  flipper(196, 130, 80, 0.5 + stroke * 0.5)
}

// -- more walkers ------------------------------------------------------------------------------------

/** A mummy stumbling along, arms out, bandages wrapped round and one trailing behind; eyes glowing. */
function mummy(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const wrap = shade(color, -0.25)
  limb(ctx, 82, 186, 50, 50, s * 0.3, Math.max(0, -s) * 0.4, 20, shade(color, -0.12))
  limb(ctx, 100, 186, 50, 50, -s * 0.3, Math.max(0, s) * 0.4, 20, color)
  // Back arm straight out.
  ctx.strokeStyle = shade(color, -0.15)
  ctx.lineWidth = 16
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(96, 114)
  ctx.lineTo(164, 110 + s * 3)
  ctx.stroke()
  // Body.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(60, 98, 62, 98, 18)
  ctx.fill()
  // Wraps across the body and legs.
  ctx.strokeStyle = wrap
  ctx.lineWidth = 2.5
  for (let y = 106; y < 196; y += 11) {
    ctx.beginPath()
    ctx.moveTo(60, y + 4)
    ctx.lineTo(122, y - 3 + ((y / 11) % 2) * 6)
    ctx.stroke()
  }
  // A loose strip trailing behind, swinging.
  ctx.strokeStyle = color
  ctx.lineWidth = 9
  ctx.beginPath()
  ctx.moveTo(62, 150)
  ctx.quadraticCurveTo(36, 170 + s * 10, 16, 196 + s * 14)
  ctx.stroke()
  // Head.
  ctx.fillStyle = color
  circle(ctx, 94, 70, 30)
  ctx.fill()
  ctx.strokeStyle = wrap
  ctx.lineWidth = 2.5
  for (let y = 48; y < 98; y += 9) {
    ctx.beginPath()
    ctx.moveTo(64, y)
    ctx.lineTo(124, y + 4)
    ctx.stroke()
  }
  ctx.fillStyle = '#1c1917'
  ctx.fillRect(92, 62, 34, 12)
  for (const x of [104, 118]) {
    glow(ctx, x, 68, 12, color2, 1)
    ctx.fillStyle = '#ffffff'
    circle(ctx, x, 68, 3)
    ctx.fill()
  }
  // Front arm straight out.
  ctx.strokeStyle = color
  ctx.lineWidth = 16
  ctx.beginPath()
  ctx.moveTo(90, 118)
  ctx.lineTo(170, 120 - s * 3)
  ctx.stroke()
  ctx.strokeStyle = wrap
  ctx.lineWidth = 2
  for (let x = 104; x < 168; x += 12) {
    ctx.beginPath()
    ctx.moveTo(x, 110)
    ctx.lineTo(x + 6, 128)
    ctx.stroke()
  }
}

/** A gingerbread man running for it: iced edges, gumdrop buttons, a smile. */
function gingerbreadMan(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const icing = (path: () => void) => {
    path()
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 4
    ctx.setLineDash([7, 5])
    ctx.stroke()
    ctx.setLineDash([])
  }
  const limbAt = (x: number, y: number, len: number, a: number) => () => {
    ctx.beginPath()
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(a)
    ctx.roundRect(-15, -4, 30, len, 15)
    ctx.restore()
  }
  ctx.save()
  ctx.translate(85, 210)
  ctx.rotate(0.12)
  ctx.translate(-85, -210)
  icing(limbAt(72, 140, 66, s * 0.7))
  icing(limbAt(100, 140, 66, -s * 0.7))
  icing(limbAt(64, 94, 58, 1.6 - s * 0.6))
  icing(() => {
    ctx.beginPath()
    ctx.roundRect(54, 86, 64, 72, 24)
  })
  icing(limbAt(110, 94, 58, -1.6 + s * 0.6))
  icing(() => circle(ctx, 88, 58, 34))
  // Face and buttons.
  ctx.fillStyle = '#ffffff'
  circle(ctx, 78, 52, 5)
  circle(ctx, 100, 52, 5)
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(89, 64, 12, 0.3, Math.PI - 0.3)
  ctx.stroke()
  ctx.fillStyle = color2
  for (const y of [104, 124, 144]) {
    circle(ctx, 86, y, 7)
    ctx.fill()
  }
  ctx.restore()
}

/** A toy soldier marching, legs stiff, in a red coat and tall hat; the second row salutes. */
function toySoldier(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors, saluting = false) {
  const p = (f / frames) * TAU
  const s = saluting ? 0 : Math.sin(p)
  const trousers = '#1e3a8a'
  // Straight legs swinging from the hip.
  for (const [a, col] of [[s * 0.35, shade(trousers, -0.2)], [-s * 0.35, trousers]] as const) {
    ctx.save()
    ctx.translate(86, 186)
    ctx.rotate(a)
    ctx.fillStyle = col
    ctx.fillRect(-9, 0, 18, 88)
    ctx.fillStyle = '#111'
    ctx.beginPath()
    ctx.roundRect(-10, 82, 28, 14, 4)
    ctx.fill()
    ctx.restore()
  }
  // Back arm.
  ctx.strokeStyle = shade(color, -0.3)
  ctx.lineWidth = 15
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(86, 118)
  ctx.lineTo(86 - s * 30, 178)
  ctx.stroke()
  // Coat with gold belt and buttons.
  const g = ctx.createLinearGradient(56, 0, 118, 0)
  g.addColorStop(0, shade(color, -0.2))
  g.addColorStop(0.5, shade(color, 0.15))
  g.addColorStop(1, shade(color, -0.25))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(58, 106, 58, 88, 10)
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(58, 168, 58, 10)
  ctx.fillStyle = color2
  ctx.fillRect(80, 168, 14, 10)
  for (const y of [120, 138, 156]) {
    circle(ctx, 87, y, 4)
    ctx.fill()
  }
  // Epaulettes.
  ctx.fillStyle = color2
  ellipse(ctx, 62, 110, 12, 6)
  ellipse(ctx, 112, 110, 12, 6)
  ctx.fill()
  // Head, rosy cheeks, moustache, tall black hat with a plume.
  ctx.fillStyle = SKIN
  circle(ctx, 88, 84, 22)
  ctx.fill()
  ctx.fillStyle = '#f87171'
  circle(ctx, 100, 92, 5)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 96, 80, 3)
  ctx.fill()
  ctx.fillStyle = '#4b2e14'
  ellipse(ctx, 98, 98, 10, 4, 0.1)
  ctx.fill()
  // The hat is black fur: lit from one side so it still shows on a house.
  const hat = ctx.createLinearGradient(64, 0, 112, 0)
  hat.addColorStop(0, '#4b5563')
  hat.addColorStop(0.35, '#1f2937')
  hat.addColorStop(1, '#0b0f17')
  ctx.fillStyle = hat
  ctx.beginPath()
  ctx.roundRect(64, 16, 48, 64, 14)
  ctx.fill()
  ctx.strokeStyle = color2
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = color2
  ctx.fillRect(64, 70, 48, 6)
  ctx.strokeStyle = color2
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(64, 74)
  ctx.quadraticCurveTo(88, 108, 112, 74)
  ctx.stroke()
  ctx.fillStyle = color
  ellipse(ctx, 70, 20, 7, 14, -0.3)
  ctx.fill()
  // Front arm: swinging, or up to the hat in a salute.
  ctx.strokeStyle = color
  ctx.lineWidth = 15
  ctx.beginPath()
  ctx.moveTo(90, 118)
  if (saluting) {
    ctx.lineTo(126, 104)
    ctx.lineTo(112, 72)
  } else ctx.lineTo(90 + s * 30, 178)
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  if (saluting) circle(ctx, 110, 70, 8)
  else circle(ctx, 90 + s * 31, 182, 8)
  ctx.fill()
}

/** A friendly T. rex stomping along: big head, little arms, tail out behind. */
function dinosaur(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const bob = Math.abs(Math.cos(p)) * 4
  const dark = shade(color, -0.3)
  ctx.save()
  ctx.translate(0, -bob)
  // Far leg.
  limb(ctx, 150, 160, 44, 44, -s * 0.45, 0.3 + Math.max(0, s) * 0.5, 26, dark)
  // Tail.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(130, 120)
  ctx.quadraticCurveTo(60, 120 + s * 6, 8, 150 + s * 10)
  ctx.quadraticCurveTo(70, 160, 140, 176)
  ctx.closePath()
  ctx.fill()
  // Body.
  const g = ctx.createLinearGradient(0, 90, 0, 200)
  g.addColorStop(0, shade(color, 0.2))
  g.addColorStop(1, shade(color, -0.2))
  ctx.fillStyle = g
  ellipse(ctx, 170, 146, 56, 44, -0.35)
  ctx.fill()
  ctx.fillStyle = color2
  ellipse(ctx, 190, 160, 30, 30, -0.35)
  ctx.fill()
  // Back spots.
  ctx.fillStyle = dark
  for (const [x, y, r] of [[150, 118, 7], [170, 110, 6], [134, 136, 5], [100, 136, 5]]) {
    circle(ctx, x, y, r)
    ctx.fill()
  }
  // Neck and big head.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(190, 112)
  ctx.quadraticCurveTo(210, 80, 236, 72)
  ctx.lineTo(250, 120)
  ctx.quadraticCurveTo(220, 130, 210, 150)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(214, 40, 116, 56, 26)
  ctx.fill()
  // Jaw, teeth, eye, nostril.
  ctx.fillStyle = shade(color, -0.1)
  ctx.beginPath()
  ctx.roundRect(224, 86, 96, 26, 12)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  for (let x = 240; x < 316; x += 12) {
    ctx.beginPath()
    ctx.moveTo(x, 88)
    ctx.lineTo(x + 5, 98)
    ctx.lineTo(x + 10, 88)
    ctx.fill()
  }
  ctx.fillStyle = '#ffffff'
  circle(ctx, 254, 58, 10)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 257, 58, 5)
  ctx.fill()
  circle(ctx, 318, 52, 3)
  ctx.fill()
  ctx.strokeStyle = dark
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(240, 44)
  ctx.lineTo(268, 48)
  ctx.stroke()
  // Little arms.
  ctx.strokeStyle = dark
  ctx.lineWidth = 9
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(210, 150)
  ctx.lineTo(230, 160 + s * 4)
  ctx.lineTo(238, 152 + s * 4)
  ctx.stroke()
  // Near leg.
  limb(ctx, 166, 162, 44, 44, s * 0.45, 0.3 + Math.max(0, -s) * 0.5, 30, color)
  ctx.restore()
}

/** A white duck waddling, the ducklings behind her are a row of their own. */
function duck(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  ctx.save()
  ctx.translate(100, 150)
  ctx.rotate(s * 0.06)
  ctx.translate(-100, -150)
  // Feet.
  ctx.fillStyle = color2
  for (const [x, a] of [[86, s], [108, -s]] as const) {
    ellipse(ctx, x + a * 10, 160, 14, 5)
    ctx.fill()
  }
  ctx.strokeStyle = color2
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(90, 128)
  ctx.lineTo(86 + s * 10, 158)
  ctx.moveTo(104, 128)
  ctx.lineTo(108 - s * 10, 158)
  ctx.stroke()
  // Body and tail.
  const g = ctx.createLinearGradient(0, 70, 0, 140)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(1, shade(color, -0.15))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(30, 82)
  ctx.quadraticCurveTo(40, 136, 100, 136)
  ctx.quadraticCurveTo(150, 136, 150, 100)
  ctx.quadraticCurveTo(140, 74, 90, 84)
  ctx.quadraticCurveTo(50, 90, 30, 82)
  ctx.fill()
  ctx.strokeStyle = shade(color, -0.25)
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(64, 100)
  ctx.quadraticCurveTo(96, 126, 126, 100)
  ctx.stroke()
  // Neck and head.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(130, 96)
  ctx.quadraticCurveTo(128, 60, 146, 44)
  ctx.lineTo(164, 56)
  ctx.quadraticCurveTo(150, 80, 150, 104)
  ctx.closePath()
  ctx.fill()
  circle(ctx, 154, 44, 20)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(168, 40)
  ctx.quadraticCurveTo(194, 40, 196, 50)
  ctx.quadraticCurveTo(184, 56, 168, 52)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 160, 38, 3.5)
  ctx.fill()
  ctx.restore()
}

/** A fluffy yellow duckling, hurrying. */
function duckling(ctx: Ctx, f: number, frames: number, { color2 }: SpriteColors) {
  const s = Math.sin((f / frames) * TAU)
  const yellow = '#fde047'
  ctx.strokeStyle = color2
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(52, 80)
  ctx.lineTo(48 + s * 8, 100)
  ctx.moveTo(64, 80)
  ctx.lineTo(68 - s * 8, 100)
  ctx.stroke()
  const g = ctx.createRadialGradient(50, 60, 4, 56, 70, 40)
  g.addColorStop(0, '#fffbe0')
  g.addColorStop(1, yellow)
  ctx.fillStyle = g
  ellipse(ctx, 56, 72, 34, 22)
  ctx.fill()
  ctx.fillStyle = yellow
  circle(ctx, 84, 46, 18)
  ctx.fill()
  // Fluff on top.
  ctx.strokeStyle = yellow
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(82, 28)
  ctx.lineTo(80, 20)
  ctx.moveTo(86, 28)
  ctx.lineTo(90, 21)
  ctx.stroke()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(98, 44)
  ctx.lineTo(114, 48)
  ctx.lineTo(98, 54)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 90, 42, 3)
  ctx.fill()
}

// -- things that pop up, bounce, leap and fly on a string ----------------------------------------

/** A zombie hand clawing up out of the ground; the frames flex its fingers. */
function zombieHand(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const flex = Math.sin((f / frames) * TAU) * 0.5 + 0.5
  // Ragged sleeve.
  ctx.fillStyle = shade(color, -0.1)
  ctx.beginPath()
  ctx.moveTo(38, 200)
  ctx.lineTo(42, 130)
  for (let k = 0; k < 5; k++) ctx.lineTo(42 + k * 9 + 4, k % 2 ? 136 : 124)
  ctx.lineTo(84, 130)
  ctx.lineTo(86, 200)
  ctx.closePath()
  ctx.fill()
  // Forearm, palm and grasping fingers.
  const skin = color2
  ctx.fillStyle = skin
  ctx.beginPath()
  ctx.roundRect(48, 70, 30, 70, 12)
  ctx.fill()
  ellipse(ctx, 62, 66, 22, 20)
  ctx.fill()
  ctx.strokeStyle = skin
  ctx.lineCap = 'round'
  ctx.lineWidth = 9
  const fingers: Array<[number, number]> = [[44, -0.6], [54, -0.2], [64, 0.05], [74, 0.3]]
  for (const [x, a] of fingers) {
    const bend = 0.4 + flex * 0.8
    const [kx, ky] = [x + Math.sin(a) * 22, 52 - Math.cos(a) * 22]
    ctx.beginPath()
    ctx.moveTo(x, 54)
    ctx.lineTo(kx, ky)
    ctx.lineTo(kx + Math.sin(a + bend) * 16, ky - Math.cos(a + bend) * 16)
    ctx.stroke()
  }
  ctx.lineWidth = 10
  ctx.beginPath()
  ctx.moveTo(80, 76)
  ctx.lineTo(96, 60 - flex * 8)
  ctx.stroke()
  ctx.strokeStyle = shade(skin, -0.35)
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(56, 90)
  ctx.lineTo(66, 104)
  ctx.moveTo(60, 116)
  ctx.lineTo(70, 112)
  ctx.stroke()
}

/** A mound of dug-up earth the hand comes out of. */
function dirtMound(ctx: Ctx) {
  const g = ctx.createLinearGradient(0, 10, 0, 60)
  g.addColorStop(0, '#6b4a2b')
  g.addColorStop(1, '#3b2614')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(0, 60)
  ctx.quadraticCurveTo(30, 12, 80, 14)
  ctx.quadraticCurveTo(130, 12, 160, 60)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#8b6440'
  for (const [x, y, r] of [[40, 34, 5], [70, 24, 4], [104, 30, 6], [124, 44, 4], [56, 46, 3]]) {
    circle(ctx, x, y, r)
    ctx.fill()
  }
}

/** A painted Easter egg hatching: whole, cracking, then a chick climbing out. */
function hatchingEgg(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const stage = f % 5
  const eggPath = (top: boolean) => {
    ctx.beginPath()
    if (top) {
      ctx.moveTo(26, 96)
      ctx.bezierCurveTo(26, 30, 114, 30, 114, 96)
      for (let k = 0; k <= 8; k++) ctx.lineTo(114 - k * 11, 96 + (k % 2 ? -10 : 6))
    } else {
      ctx.moveTo(26, 96)
      for (let k = 0; k <= 8; k++) ctx.lineTo(26 + k * 11, 96 + (k % 2 ? -10 : 6))
      ctx.bezierCurveTo(118, 140, 96, 166, 70, 166)
      ctx.bezierCurveTo(44, 166, 22, 140, 26, 96)
    }
    ctx.closePath()
  }
  const paint = (top: boolean) => {
    eggPath(top)
    const g = ctx.createRadialGradient(54, 70, 6, 70, 100, 80)
    g.addColorStop(0, shade(color, 0.6))
    g.addColorStop(1, color)
    ctx.fillStyle = g
    ctx.fill()
    ctx.save()
    eggPath(top)
    ctx.clip()
    ctx.strokeStyle = color2
    ctx.lineWidth = 7
    for (const y of [70, 118]) {
      ctx.beginPath()
      for (let x = 20; x <= 120; x += 10) ctx.lineTo(x, y + ((x / 10) % 2 ? -6 : 6))
      ctx.stroke()
    }
    ctx.fillStyle = '#ffffff'
    for (const x of [44, 70, 96]) {
      circle(ctx, x, 94, 5)
      ctx.fill()
    }
    ctx.restore()
  }
  const chick = (y: number, wings: boolean) => {
    ctx.fillStyle = '#fde047'
    circle(ctx, 70, y, 30)
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, 60, y - 6, 4)
    circle(ctx, 80, y - 6, 4)
    ctx.fill()
    ctx.fillStyle = '#f97316'
    ctx.beginPath()
    ctx.moveTo(64, y + 4)
    ctx.lineTo(76, y + 4)
    ctx.lineTo(70, y + 14)
    ctx.closePath()
    ctx.fill()
    if (wings) {
      ctx.fillStyle = '#facc15'
      ellipse(ctx, 36, y + 6, 14, 8, -0.8)
      ellipse(ctx, 104, y + 6, 14, 8, 0.8)
      ctx.fill()
    }
  }
  if (stage <= 2) {
    // Whole, then cracks spreading.
    ctx.beginPath()
    ctx.moveTo(70, 166)
    ctx.bezierCurveTo(10, 166, 14, 30, 70, 30)
    ctx.bezierCurveTo(126, 30, 130, 166, 70, 166)
    const g = ctx.createRadialGradient(54, 70, 6, 70, 100, 80)
    g.addColorStop(0, shade(color, 0.6))
    g.addColorStop(1, color)
    ctx.fillStyle = g
    ctx.fill()
    ctx.save()
    ctx.clip()
    ctx.strokeStyle = color2
    ctx.lineWidth = 7
    for (const y of [70, 118]) {
      ctx.beginPath()
      for (let x = 10; x <= 130; x += 10) ctx.lineTo(x, y + ((x / 10) % 2 ? -6 : 6))
      ctx.stroke()
    }
    ctx.restore()
    if (stage > 0) {
      ctx.strokeStyle = '#3f2a1d'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(48, 92)
      ctx.lineTo(58, 82)
      ctx.lineTo(66, 96)
      ctx.lineTo(76, 84)
      if (stage > 1) {
        ctx.lineTo(86, 98)
        ctx.lineTo(96, 86)
        ctx.moveTo(48, 92)
        ctx.lineTo(36, 100)
      }
      ctx.stroke()
    }
    return
  }
  // Open: the chick pops its head out, then climbs out waving.
  if (stage === 3) {
    chick(78, false)
    paint(false)
    ctx.save()
    ctx.translate(62, 30)
    ctx.rotate(-0.55)
    ctx.translate(-70, -70)
    paint(true)
    ctx.restore()
  } else {
    paint(false)
    chick(60, true)
    ctx.save()
    ctx.translate(118, 30)
    ctx.rotate(0.9)
    ctx.scale(0.55, 0.55)
    ctx.translate(-70, -60)
    paint(true)
    ctx.restore()
  }
}

/** A striped beach ball. */
function beachBall(ctx: Ctx, _f: number, _n: number, { color, color2 }: SpriteColors) {
  const cols = [color, '#ffffff', color2, '#facc15', '#ffffff', '#22c55e']
  ctx.save()
  ctx.beginPath()
  ctx.arc(60, 60, 54, 0, TAU)
  ctx.clip()
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = cols[k]
    ctx.beginPath()
    ctx.moveTo(60, 60)
    ctx.arc(60, 60, 56, (k / 6) * TAU, ((k + 1) / 6) * TAU)
    ctx.closePath()
    ctx.fill()
  }
  const g = ctx.createRadialGradient(42, 38, 4, 60, 60, 60)
  g.addColorStop(0, 'rgba(255,255,255,0.55)')
  g.addColorStop(0.5, 'rgba(255,255,255,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.4)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 120, 120)
  ctx.restore()
  ctx.fillStyle = '#ffffff'
  circle(ctx, 60, 60, 8)
  ctx.fill()
}

/** A dolphin mid-leap, tail flicking. */
/** A dolphin mid-leap, tail flicking: rounded forehead, short beak, curved fin. */
function dolphin(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const flick = Math.sin((f / frames) * TAU)
  // Tail flukes.
  ctx.fillStyle = shade(color, -0.2)
  ctx.beginPath()
  ctx.moveTo(52, 86)
  ctx.quadraticCurveTo(26, 70 + flick * 8, 6, 60 + flick * 14)
  ctx.quadraticCurveTo(24, 86, 6, 112 + flick * 14)
  ctx.quadraticCurveTo(26, 102 + flick * 8, 52, 90)
  ctx.closePath()
  ctx.fill()
  // Curved dorsal fin.
  ctx.beginPath()
  ctx.moveTo(126, 52)
  ctx.quadraticCurveTo(140, 30, 126, 12)
  ctx.quadraticCurveTo(162, 26, 172, 46)
  ctx.closePath()
  ctx.fill()
  // Body.
  const g = ctx.createLinearGradient(0, 40, 0, 112)
  g.addColorStop(0, shade(color, 0.25))
  g.addColorStop(0.6, color)
  g.addColorStop(1, shade(color, -0.2))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(44, 86)
  ctx.bezierCurveTo(100, 50, 180, 38, 232, 48)
  ctx.quadraticCurveTo(258, 54, 264, 70)
  ctx.lineTo(292, 76)
  ctx.quadraticCurveTo(298, 82, 290, 86)
  ctx.lineTo(262, 88)
  ctx.bezierCurveTo(220, 112, 120, 110, 44, 92)
  ctx.closePath()
  ctx.fill()
  // Pale belly and the line of the mouth.
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(120, 100)
  ctx.bezierCurveTo(180, 112, 236, 104, 268, 86)
  ctx.lineTo(288, 86)
  ctx.bezierCurveTo(250, 112, 170, 114, 120, 100)
  ctx.fill()
  ctx.strokeStyle = shade(color, -0.4)
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(262, 80)
  ctx.quadraticCurveTo(276, 84, 290, 81)
  ctx.stroke()
  // Flipper and eye.
  ctx.fillStyle = shade(color, -0.15)
  ctx.beginPath()
  ctx.moveTo(196, 96)
  ctx.quadraticCurveTo(180 - flick * 4, 124, 166 - flick * 6, 132)
  ctx.quadraticCurveTo(196, 120, 214, 100)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#0b0b0b'
  circle(ctx, 244, 66, 4.5)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  circle(ctx, 245.5, 64.5, 1.5)
  ctx.fill()
}

/** A splash where a dolphin goes in or comes out. */
function splash(ctx: Ctx, _f: number, _n: number, { color2 }: SpriteColors) {
  ctx.fillStyle = rgba('#e0f2fe', 0.85)
  for (let k = 0; k < 9; k++) {
    const a = Math.PI + (k / 8) * Math.PI
    ctx.beginPath()
    ctx.ellipse(80 + Math.cos(a) * 46, 90 + Math.sin(a) * 60, 7, 16, a + Math.PI / 2, 0, TAU)
    ctx.fill()
  }
  ctx.fillStyle = rgba(color2, 0.5)
  ellipse(ctx, 80, 92, 70, 9)
  ctx.fill()
}

/** A diamond kite with a ribbon tail. */
function kite(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const wave = (f / frames) * TAU
  // Tail with bows.
  ctx.strokeStyle = '#f8fafc'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(80, 120)
  for (let y = 120; y <= 196; y += 6) ctx.lineTo(80 + Math.sin(wave + y / 14) * 12, y)
  ctx.stroke()
  for (const y of [140, 162, 184]) {
    const x = 80 + Math.sin(wave + y / 14) * 12
    ctx.fillStyle = y === 162 ? color : color2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x - 12, y - 7)
    ctx.lineTo(x - 12, y + 7)
    ctx.closePath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 12, y - 7)
    ctx.lineTo(x + 12, y + 7)
    ctx.closePath()
    ctx.fill()
  }
  // The four panels.
  const quads: Array<[number, number, string]> = [[80, 4, color], [146, 52, color2], [80, 124, color], [14, 52, color2]]
  for (let k = 0; k < 4; k++) {
    const [ax, ay, col] = quads[k]
    const [bx, by] = quads[(k + 1) % 4]
    ctx.fillStyle = k % 2 ? shade(col, -0.15) : col
    ctx.beginPath()
    ctx.moveTo(80, 52)
    ctx.lineTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.closePath()
    ctx.fill()
  }
  ctx.strokeStyle = '#78350f'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(80, 4)
  ctx.lineTo(80, 124)
  ctx.moveTo(14, 52)
  ctx.lineTo(146, 52)
  ctx.stroke()
}

/** A kite string: a thin bright line stretched where drawn. */
function kiteString(ctx: Ctx) {
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.fillRect(2, 0, 4, 256)
}

/** A cartoon rocket ship flying nose first to the right, flame flickering. */
function rocketShip(ctx: Ctx, f: number, n: number, c: SpriteColors) {
  ctx.translate(300, 0)
  ctx.rotate(Math.PI / 2)
  rocketShipUpright(ctx, f, n, c)
}

function rocketShipUpright(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const k = [1, 0.85, 1.1, 0.92][f % 4]
  glow(ctx, 70, 250, 60 * k, '#f97316', 0.7)
  ctx.fillStyle = '#fbbf24'
  ctx.beginPath()
  ctx.moveTo(48, 226)
  ctx.quadraticCurveTo(70, 226 + 80 * k, 92, 226)
  ctx.fill()
  ctx.fillStyle = '#fff7d6'
  ctx.beginPath()
  ctx.moveTo(58, 226)
  ctx.quadraticCurveTo(70, 226 + 44 * k, 82, 226)
  ctx.fill()
  // Fins.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(40, 160)
  ctx.lineTo(10, 230)
  ctx.lineTo(44, 216)
  ctx.closePath()
  ctx.moveTo(100, 160)
  ctx.lineTo(130, 230)
  ctx.lineTo(96, 216)
  ctx.closePath()
  ctx.fill()
  // Body.
  const g = ctx.createLinearGradient(36, 0, 104, 0)
  g.addColorStop(0, '#cbd5e1')
  g.addColorStop(0.45, '#ffffff')
  g.addColorStop(1, '#94a3b8')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(70, 10)
  ctx.bezierCurveTo(118, 60, 108, 170, 98, 226)
  ctx.lineTo(42, 226)
  ctx.bezierCurveTo(32, 170, 22, 60, 70, 10)
  ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(70, 10)
  ctx.bezierCurveTo(90, 30, 98, 46, 100, 60)
  ctx.lineTo(40, 60)
  ctx.bezierCurveTo(42, 46, 50, 30, 70, 10)
  ctx.fill()
  // Window.
  ctx.fillStyle = '#475569'
  circle(ctx, 70, 110, 22)
  ctx.fill()
  const w = ctx.createRadialGradient(62, 102, 2, 70, 110, 18)
  w.addColorStop(0, '#ffffff')
  w.addColorStop(0.4, shade(color2, 0.3))
  w.addColorStop(1, shade(color2, -0.3))
  ctx.fillStyle = w
  circle(ctx, 70, 110, 16)
  ctx.fill()
  ctx.fillStyle = color
  ctx.fillRect(44, 200, 52, 10)
}

/** An octopus pumping along, tentacles curling. */
function octopus(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  ctx.lineCap = 'round'
  for (let k = 0; k < 8; k++) {
    const x0 = 56 + k * 12.5
    const side = (k - 3.5) / 3.5
    ctx.strokeStyle = shade(color, k % 2 ? -0.15 : 0)
    ctx.lineWidth = 15
    ctx.beginPath()
    ctx.moveTo(x0, 110)
    let x = x0
    let y = 110
    for (let s = 0; s < 10; s++) {
      x += side * 6 + Math.sin(p + s * 0.6 + k) * 4
      y += 9
      ctx.lineTo(x, y)
    }
    // Curl at the tip.
    ctx.quadraticCurveTo(x + side * 16, y + 12, x + side * 20, y)
    ctx.stroke()
    ctx.fillStyle = color2
    for (let s = 2; s < 9; s += 2) {
      circle(ctx, x0 + side * 6 * s + Math.sin(p + s * 0.6 + k) * 3, 110 + s * 9, 2.5)
      ctx.fill()
    }
  }
  // Head.
  const g = ctx.createRadialGradient(86, 50, 8, 100, 70, 70)
  g.addColorStop(0, shade(color, 0.35))
  g.addColorStop(1, shade(color, -0.2))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(100, 70, 52 + Math.sin(p) * 4, 60 - Math.sin(p) * 4, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = color2
  for (const [x, y] of [[80, 40], [116, 34], [100, 56]]) {
    circle(ctx, x, y, 6)
    ctx.fill()
  }
  for (const x of [80, 120]) {
    ctx.fillStyle = '#ffffff'
    circle(ctx, x, 96, 12)
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, x + 2, 98, 6)
    ctx.fill()
  }
}

/** An astronaut floating, waving slowly; gold visor in the second colour. */
function astronaut(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const wave = Math.sin((f / frames) * TAU)
  const suit = color
  const edge = shade(suit, -0.25)
  // Backpack.
  ctx.fillStyle = edge
  ctx.beginPath()
  ctx.roundRect(54, 60, 76, 80, 12)
  ctx.fill()
  // Legs.
  ctx.strokeStyle = suit
  ctx.lineCap = 'round'
  ctx.lineWidth = 26
  ctx.beginPath()
  ctx.moveTo(80, 140)
  ctx.lineTo(70, 180)
  ctx.moveTo(106, 140)
  ctx.lineTo(122, 176)
  ctx.stroke()
  // Body.
  ctx.fillStyle = suit
  ctx.beginPath()
  ctx.roundRect(64, 80, 60, 70, 20)
  ctx.fill()
  ctx.fillStyle = '#ef4444'
  ctx.fillRect(80, 100, 26, 16)
  ctx.fillStyle = '#3b82f6'
  ctx.fillRect(84, 104, 8, 8)
  // Arms: one waving.
  ctx.strokeStyle = suit
  ctx.lineWidth = 20
  ctx.beginPath()
  ctx.moveTo(70, 96)
  ctx.lineTo(44, 128)
  ctx.moveTo(118, 92)
  ctx.lineTo(146, 66 + wave * 14)
  ctx.lineTo(156, 40 + wave * 18)
  ctx.stroke()
  // Helmet and visor.
  ctx.fillStyle = suit
  circle(ctx, 94, 54, 38)
  ctx.fill()
  ctx.strokeStyle = edge
  ctx.lineWidth = 4
  ctx.stroke()
  const v = ctx.createLinearGradient(70, 34, 120, 74)
  v.addColorStop(0, shade(color2, 0.6))
  v.addColorStop(0.5, color2)
  v.addColorStop(1, shade(color2, -0.4))
  ctx.fillStyle = v
  ellipse(ctx, 98, 56, 26, 20)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ellipse(ctx, 88, 48, 8, 4, -0.5)
  ctx.fill()
}

/** A red envelope with a gold emblem, falling. */
function redEnvelope(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const g = ctx.createLinearGradient(0, 10, 0, 120)
  g.addColorStop(0, shade(color, 0.15))
  g.addColorStop(1, shade(color, -0.2))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(14, 10, 62, 110, 6)
  ctx.fill()
  ctx.fillStyle = shade(color, -0.1)
  ctx.beginPath()
  ctx.moveTo(14, 16)
  ctx.lineTo(45, 46)
  ctx.lineTo(76, 16)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = color2
  ctx.lineWidth = 3
  ctx.strokeRect(20, 16, 50, 98)
  if (f % 2 === 0) {
    ctx.fillStyle = color2
    circle(ctx, 45, 74, 16)
    ctx.fill()
    ctx.fillStyle = shade(color, -0.1)
    ctx.fillRect(37, 66, 16, 16)
    ctx.fillStyle = color2
    ctx.fillRect(41, 70, 8, 8)
  } else {
    ctx.fillStyle = color2
    for (const [x, y] of [[45, 60], [45, 88], [33, 74], [57, 74]]) {
      circle(ctx, x, y, 5)
      ctx.fill()
    }
  }
}

/** A wrapped present tumbling down; each frame another wrapping. */
function fallingPresent(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const looks: Array<[string, string]> = [[color, color2], [color2, color], ['#2563eb', '#facc15'], ['#f8fafc', color]]
  const [box, ribbon] = looks[f % 4]
  present(ctx, 18, 30, 74, 66, box, ribbon)
}

/** A folded paper aeroplane. */
function paperPlane(ctx: Ctx, _f: number, _n: number, { color }: SpriteColors) {
  ctx.fillStyle = '#e2e8f0'
  ctx.beginPath()
  ctx.moveTo(196, 50)
  ctx.lineTo(10, 10)
  ctx.lineTo(70, 56)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(196, 50)
  ctx.lineTo(10, 96)
  ctx.lineTo(70, 56)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#94a3b8'
  ctx.beginPath()
  ctx.moveTo(196, 50)
  ctx.lineTo(70, 56)
  ctx.lineTo(76, 76)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(40, 82)
  ctx.lineTo(150, 58)
  ctx.stroke()
}

// -- more Halloween -------------------------------------------------------------------------------

/** A child in a cape and mask carrying a pumpkin bucket of sweets. */
function trickOrTreater(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const bob = Math.abs(Math.cos(p)) * -5
  ctx.translate(0, bob)
  // Cape behind, flapping.
  ctx.fillStyle = shade(color, -0.3)
  ctx.beginPath()
  ctx.moveTo(78, 112)
  ctx.quadraticCurveTo(30 - s * 6, 170, 26 - s * 10, 222)
  ctx.lineTo(90, 210)
  ctx.closePath()
  ctx.fill()
  // Legs.
  const [ax, ay] = limb(ctx, 84, 196, 34, 34, s * 0.5, Math.max(0, -s) * 0.6, 15, '#1e293b')
  const [bx, by] = limb(ctx, 100, 196, 34, 34, -s * 0.5, Math.max(0, s) * 0.6, 15, '#334155')
  ctx.fillStyle = '#111827'
  ellipse(ctx, ax + 6, ay + 2, 13, 6)
  ctx.fill()
  ellipse(ctx, bx + 6, by + 2, 13, 6)
  ctx.fill()
  // Body in the costume colour with a star on the chest.
  const g = ctx.createLinearGradient(0, 110, 0, 204)
  g.addColorStop(0, shade(color, 0.2))
  g.addColorStop(1, shade(color, -0.2))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(66, 110, 50, 92, 16)
  ctx.fill()
  ctx.fillStyle = '#facc15'
  ctx.beginPath()
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 6 : 14
    const a = -Math.PI / 2 + (k * Math.PI) / 5
    ctx.lineTo(92 + Math.cos(a) * r, 146 + Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fill()
  // Head with a mask over the eyes.
  ctx.fillStyle = SKIN
  circle(ctx, 94, 80, 30)
  ctx.fill()
  ctx.fillStyle = '#5b3a1e'
  ctx.beginPath()
  ctx.arc(94, 76, 31, Math.PI * 1.02, Math.PI * 1.98)
  ctx.quadraticCurveTo(110, 60, 94, 62)
  ctx.quadraticCurveTo(76, 60, 63, 72)
  ctx.fill()
  ctx.fillStyle = shade(color, -0.35)
  ctx.beginPath()
  ctx.roundRect(70, 74, 52, 16, 8)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ellipse(ctx, 88, 82, 6, 4)
  ellipse(ctx, 112, 82, 6, 4)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 90, 82, 2.5)
  circle(ctx, 114, 82, 2.5)
  ctx.fill()
  ctx.strokeStyle = '#7c2d12'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(106, 96, 8, 0.2, Math.PI - 0.4)
  ctx.stroke()
  // Arm holding out the pumpkin bucket.
  const [hx, hy] = limb(ctx, 104, 124, 28, 26, 1.2 + s * 0.1, -0.6, 13, shade(color, 0.05))
  ctx.strokeStyle = '#111827'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(hx + 14, hy + 16, 18, Math.PI * 1.1, Math.PI * 1.9)
  ctx.stroke()
  const b = ctx.createRadialGradient(hx + 8, hy + 22, 3, hx + 14, hy + 30, 26)
  b.addColorStop(0, shade(color2, 0.35))
  b.addColorStop(1, shade(color2, -0.2))
  ctx.fillStyle = b
  ellipse(ctx, hx + 14, hy + 30, 22, 18)
  ctx.fill()
  ctx.fillStyle = '#111'
  ctx.beginPath()
  ctx.moveTo(hx + 4, hy + 26)
  ctx.lineTo(hx + 9, hy + 20)
  ctx.lineTo(hx + 12, hy + 27)
  ctx.moveTo(hx + 16, hy + 27)
  ctx.lineTo(hx + 20, hy + 20)
  ctx.lineTo(hx + 24, hy + 26)
  ctx.moveTo(hx + 2, hy + 34)
  for (let k = 0; k <= 6; k++) ctx.lineTo(hx + 2 + k * 4, hy + 34 + (k % 2 ? 6 : 0))
  ctx.lineTo(hx + 26, hy + 40)
  ctx.lineTo(hx + 2, hy + 40)
  ctx.fill()
  // Sweets peeking out of the top.
  for (const [dx, col] of [[6, '#ef4444'], [14, '#a855f7'], [22, '#22c55e']] as const) {
    ctx.fillStyle = col
    circle(ctx, hx + dx, hy + 13, 4.5)
    ctx.fill()
  }
}

/** A hunched werewolf with a shaggy coat, lurching along on two legs. */
function werewolf(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const fur = color
  const dark = shade(fur, -0.35)
  const shag = (x: number, y: number, rx: number, ry: number, col: string) => {
    ctx.fillStyle = col
    ctx.beginPath()
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * TAU
      const r = k % 2 ? 0.86 : 1.08
      ctx.lineTo(x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r)
    }
    ctx.closePath()
    ctx.fill()
  }
  // Far leg and arm.
  limb(ctx, 92, 190, 46, 48, -s * 0.45 + 0.1, 0.5 + Math.max(0, s) * 0.4, 22, dark)
  limb(ctx, 98, 120, 50, 46, 0.8 - s * 0.4, -0.6, 17, dark)
  // Tail.
  ctx.strokeStyle = dark
  ctx.lineWidth = 16
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(70, 184)
  ctx.quadraticCurveTo(36, 196, 26 + s * 6, 230)
  ctx.stroke()
  // Hunched body, torn trousers.
  shag(104, 150, 46, 56, fur)
  ctx.fillStyle = '#3f3f6b'
  ctx.beginPath()
  ctx.moveTo(66, 180)
  ctx.lineTo(140, 180)
  ctx.lineTo(134, 214)
  for (let k = 0; k < 6; k++) ctx.lineTo(134 - (k + 0.5) * 11, k % 2 ? 212 : 224)
  ctx.lineTo(70, 212)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = shade(fur, 0.35)
  ellipse(ctx, 120, 146, 18, 26, 0.3)
  ctx.fill()
  // Near leg: bent back, big clawed foot.
  const [fx, fy] = limb(ctx, 112, 196, 44, 48, s * 0.45 + 0.1, 0.5 + Math.max(0, -s) * 0.4, 24, fur)
  ctx.fillStyle = fur
  ellipse(ctx, fx + 12, fy + 4, 20, 8)
  ctx.fill()
  // Head: long snout, pointed ears, glowing eyes.
  ctx.save()
  ctx.translate(150, 92)
  ctx.rotate(0.1 + Math.sin(p * 2) * 0.04)
  shag(0, 0, 32, 30, fur)
  ctx.fillStyle = fur
  ctx.beginPath()
  ctx.moveTo(10, -14)
  ctx.lineTo(62, 2)
  ctx.lineTo(58, 16)
  ctx.lineTo(10, 22)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#111'
  ellipse(ctx, 60, 6, 7, 5)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  for (const x of [26, 38, 50]) {
    ctx.beginPath()
    ctx.moveTo(x, 16)
    ctx.lineTo(x + 4, 26)
    ctx.lineTo(x + 8, 16)
    ctx.fill()
  }
  ctx.fillStyle = fur
  for (const [x, a] of [[-14, -0.3], [4, 0.2]] as const) {
    ctx.beginPath()
    ctx.moveTo(x - 10, -20)
    ctx.lineTo(x + Math.sin(a) * 30, -54)
    ctx.lineTo(x + 12, -20)
    ctx.fill()
  }
  ctx.fillStyle = shade(fur, 0.4)
  ctx.beginPath()
  ctx.moveTo(-2, -22)
  ctx.lineTo(4 + 6, -46)
  ctx.lineTo(10, -22)
  ctx.fill()
  glow(ctx, 16, -8, 14, color2, 0.9)
  ctx.fillStyle = color2
  ellipse(ctx, 16, -8, 6, 4, 0.2)
  ctx.fill()
  ctx.restore()
  // Near arm with claws, reaching forward.
  const [hx, hy] = limb(ctx, 118, 120, 46, 44, 1.3 + s * 0.3, -0.2, 18, fur)
  ctx.strokeStyle = '#f5f5f4'
  ctx.lineWidth = 3
  for (const d of [-6, 0, 6]) {
    ctx.beginPath()
    ctx.moveTo(hx + 6, hy + d)
    ctx.lineTo(hx + 18, hy + d + 4)
    ctx.stroke()
  }
}

/** A vampire in a high-collared cape, gliding along with the cape sweeping. */
function vampire(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const cape = color
  // Cape: dark outside, red lining showing as it sweeps.
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(78, 96)
  ctx.quadraticCurveTo(20 - s * 8, 170, 18 - s * 14, 276)
  ctx.lineTo(80, 262)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = cape
  ctx.beginPath()
  ctx.moveTo(80, 96)
  ctx.quadraticCurveTo(34 - s * 8, 170, 38 - s * 12, 278)
  for (let k = 0; k < 4; k++) ctx.lineTo(38 + (k + 0.5) * 20, k % 2 ? 278 : 266)
  ctx.lineTo(120, 270)
  ctx.lineTo(118, 100)
  ctx.closePath()
  ctx.fill()
  // Legs in black trousers, shiny shoes.
  limb(ctx, 92, 196, 40, 40, s * 0.35, Math.max(0, -s) * 0.4, 16, '#0f0f14')
  const [fx, fy] = limb(ctx, 104, 196, 40, 40, -s * 0.35, Math.max(0, s) * 0.4, 16, '#1c1c24')
  ctx.fillStyle = '#000'
  ellipse(ctx, fx + 8, fy + 4, 14, 6)
  ctx.fill()
  // Waistcoat and shirt.
  ctx.fillStyle = '#1f1f2b'
  ctx.beginPath()
  ctx.roundRect(78, 108, 46, 92, 10)
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.moveTo(92, 108)
  ctx.lineTo(110, 108)
  ctx.lineTo(101, 160)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = shade(color2, -0.1)
  ctx.beginPath()
  ctx.moveTo(92, 114)
  ctx.lineTo(101, 120)
  ctx.lineTo(110, 114)
  ctx.lineTo(110, 126)
  ctx.lineTo(101, 120)
  ctx.lineTo(92, 126)
  ctx.fill()
  // The tall collar, standing up behind the head.
  ctx.fillStyle = cape
  ctx.beginPath()
  ctx.moveTo(70, 112)
  ctx.lineTo(56, 40)
  ctx.lineTo(96, 96)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(74, 108)
  ctx.lineTo(62, 50)
  ctx.lineTo(92, 96)
  ctx.closePath()
  ctx.fill()
  // Pale face, widow's peak, fangs.
  ctx.fillStyle = '#e8e4f0'
  ctx.beginPath()
  ctx.ellipse(106, 72, 24, 30, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#0b0b0f'
  ctx.beginPath()
  ctx.moveTo(80, 70)
  ctx.quadraticCurveTo(84, 36, 108, 40)
  ctx.quadraticCurveTo(132, 40, 130, 70)
  ctx.lineTo(124, 56)
  ctx.lineTo(112, 62)
  ctx.lineTo(104, 50)
  ctx.lineTo(96, 60)
  ctx.lineTo(86, 56)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#b91c1c'
  ellipse(ctx, 112, 72, 4, 3)
  ellipse(ctx, 124, 72, 3.5, 3)
  ctx.fill()
  ctx.strokeStyle = '#4c0519'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(108, 88)
  ctx.quadraticCurveTo(118, 92, 126, 87)
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  for (const x of [112, 122]) {
    ctx.beginPath()
    ctx.moveTo(x - 2, 89)
    ctx.lineTo(x, 96)
    ctx.lineTo(x + 2, 89)
    ctx.fill()
  }
  // Arm holding the cape open, a little lighter so it shows against the cape.
  ctx.strokeStyle = shade(cape, 0.22)
  ctx.lineWidth = 15
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(116, 116)
  ctx.lineTo(146, 150 + s * 4)
  ctx.lineTo(156, 132 + s * 6)
  ctx.stroke()
  ctx.fillStyle = '#e8e4f0'
  circle(ctx, 158, 128 + s * 6, 7)
  ctx.fill()
}

/** Frankenstein's monster: flat head, bolts, arms out, stiff steps. */
function frankenstein(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const skin = color2
  const sway = s * 0.04
  ctx.translate(95, 290)
  ctx.rotate(sway)
  ctx.translate(-95, -290)
  // Stiff legs in big boots.
  for (const [x, a, col] of [[82, -s * 0.28, '#1f2937'], [106, s * 0.28, '#273449']] as const) {
    ctx.save()
    ctx.translate(x, 196)
    ctx.rotate(a)
    ctx.fillStyle = col
    ctx.fillRect(-11, 0, 22, 64)
    ctx.fillStyle = '#111'
    ctx.beginPath()
    ctx.roundRect(-14, 58, 38, 22, 6)
    ctx.fill()
    ctx.restore()
  }
  // Back arm straight out.
  ctx.strokeStyle = shade(color, -0.3)
  ctx.lineWidth = 18
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(98, 118)
  ctx.lineTo(166, 124 + s * 3)
  ctx.stroke()
  ctx.fillStyle = shade(skin, -0.2)
  circle(ctx, 172, 124 + s * 3, 10)
  ctx.fill()
  // Jacket, too small, with patches.
  const g = ctx.createLinearGradient(0, 104, 0, 204)
  g.addColorStop(0, shade(color, 0.15))
  g.addColorStop(1, shade(color, -0.25))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(60, 104, 72, 100, 10)
  ctx.fill()
  ctx.fillStyle = shade(color, 0.3)
  ctx.fillRect(70, 160, 18, 16)
  ctx.strokeStyle = shade(color, -0.5)
  ctx.lineWidth = 2
  ctx.strokeRect(70, 160, 18, 16)
  // Head: square, flat top, stitches, bolts.
  ctx.fillStyle = '#9ca3af'
  ctx.fillRect(56, 76, 14, 10)
  ctx.fillRect(122, 76, 14, 10)
  ctx.fillStyle = skin
  ctx.beginPath()
  ctx.roundRect(66, 36, 60, 70, 8)
  ctx.fill()
  ctx.fillStyle = '#111827'
  ctx.beginPath()
  ctx.moveTo(62, 52)
  ctx.lineTo(62, 30)
  ctx.lineTo(130, 30)
  ctx.lineTo(130, 52)
  for (let k = 0; k < 6; k++) ctx.lineTo(130 - (k + 0.5) * 11.3, k % 2 ? 52 : 44)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = shade(skin, -0.35)
  ctx.fillRect(84, 60, 14, 4)
  ctx.fillRect(108, 60, 14, 4)
  ctx.fillStyle = '#fef9c3'
  ellipse(ctx, 92, 70, 6, 4)
  ellipse(ctx, 114, 70, 6, 4)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 94, 70, 2.5)
  circle(ctx, 116, 70, 2.5)
  ctx.fill()
  ctx.strokeStyle = '#1f2937'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(96, 92)
  ctx.lineTo(120, 92)
  ctx.moveTo(72, 46)
  ctx.lineTo(96, 56)
  for (let k = 0; k < 4; k++) {
    ctx.moveTo(76 + k * 6, 44 + k * 2.4)
    ctx.lineTo(74 + k * 6, 54 + k * 2.4)
  }
  ctx.stroke()
  // Near arm straight out.
  ctx.strokeStyle = color
  ctx.lineWidth = 18
  ctx.beginPath()
  ctx.moveTo(100, 124)
  ctx.lineTo(170, 132 - s * 3)
  ctx.stroke()
  ctx.fillStyle = skin
  circle(ctx, 176, 132 - s * 3, 10)
  ctx.fill()
}

/** The grim reaper floating in a hooded robe, scythe over the shoulder. */
function grimReaper(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const robe = color
  // Scythe behind.
  ctx.strokeStyle = '#5b3a1e'
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(60, 270)
  ctx.lineTo(190, 30)
  ctx.stroke()
  const b = ctx.createLinearGradient(130, 10, 230, 60)
  b.addColorStop(0, '#e5e7eb')
  b.addColorStop(1, '#6b7280')
  ctx.fillStyle = b
  ctx.beginPath()
  ctx.moveTo(186, 34)
  ctx.quadraticCurveTo(150, 0, 90, 18)
  ctx.quadraticCurveTo(150, 14, 196, 50)
  ctx.closePath()
  ctx.fill()
  // Robe with a tattered hem that wafts.
  const g = ctx.createLinearGradient(60, 0, 200, 0)
  g.addColorStop(0, shade(robe, -0.3))
  g.addColorStop(0.5, shade(robe, 0.15))
  g.addColorStop(1, shade(robe, -0.2))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(110, 30)
  ctx.bezierCurveTo(170, 24, 176, 120, 186, 230)
  for (let k = 0; k <= 7; k++) {
    const x = 186 - k * 15
    ctx.lineTo(x, 236 + (k % 2 ? 26 : 0) + Math.sin(p + k) * 8)
  }
  ctx.bezierCurveTo(60, 140, 60, 40, 110, 30)
  ctx.fill()
  // The dark hood opening and the eyes glowing inside.
  ctx.fillStyle = '#050505'
  ellipse(ctx, 128, 74, 24, 30, 0.1)
  ctx.fill()
  glow(ctx, 120, 70, 12, color2, 0.9 + 0.1 * s)
  glow(ctx, 138, 72, 12, color2, 0.9 + 0.1 * s)
  ctx.fillStyle = color2
  circle(ctx, 120, 70, 3.5)
  circle(ctx, 138, 72, 3.5)
  ctx.fill()
  // Sleeve reaching to the scythe, bony fingers round the handle.
  ctx.strokeStyle = shade(robe, 0.12)
  ctx.lineWidth = 22
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(150, 104)
  ctx.quadraticCurveTo(146, 136, 132, 148)
  ctx.stroke()
  ctx.strokeStyle = '#f1efe6'
  ctx.lineWidth = 4
  for (let k = 0; k < 4; k++) {
    ctx.beginPath()
    ctx.arc(126 + k * 2.2, 146 + k * 5, 6, -0.6, 2.2)
    ctx.stroke()
  }
}

/** A rat scurrying, long pink tail. */
function rat(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  ctx.strokeStyle = color2
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(50, 70)
  ctx.bezierCurveTo(30, 66, 20, 50 + s * 8, 4, 60 + s * 10)
  ctx.stroke()
  limb(ctx, 66, 74, 14, 14, -s * 0.8, 0.5, 6, shade(color, -0.3))
  limb(ctx, 130, 74, 14, 14, s * 0.8, -0.3, 6, shade(color, -0.3))
  const g = ctx.createLinearGradient(0, 40, 0, 92)
  g.addColorStop(0, shade(color, 0.2))
  g.addColorStop(1, shade(color, -0.25))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(96, 68, 50, 24 - Math.abs(s) * 2, 0, 0, TAU)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(130, 54)
  ctx.quadraticCurveTo(176, 58, 190, 76)
  ctx.quadraticCurveTo(160, 86, 128, 84)
  ctx.fill()
  ctx.fillStyle = color2
  circle(ctx, 190, 76, 5)
  ctx.fill()
  ellipse(ctx, 142, 48, 13, 15)
  ctx.fill()
  ctx.fillStyle = shade(color, -0.1)
  ellipse(ctx, 142, 50, 8, 10)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 162, 64, 3.5)
  ctx.fill()
  ctx.fillStyle = '#fff'
  circle(ctx, 163, 63, 1.2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 1.2
  for (const d of [-4, 2, 8]) {
    ctx.beginPath()
    ctx.moveTo(184, 76)
    ctx.lineTo(198, 72 + d)
    ctx.stroke()
  }
  limb(ctx, 80, 80, 14, 14, s * 0.8, 0.5, 7, color)
  limb(ctx, 120, 82, 14, 14, -s * 0.8, -0.3, 7, color)
}

// -- more winter ----------------------------------------------------------------------------------

/** A polar bear padding along in a scarf. */
function polarBear(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const fur = color
  const shadow = shade(fur, -0.18)
  const pawLeg = (x: number, a: number, col: string) => {
    ctx.save()
    ctx.translate(x, 118)
    ctx.rotate(a)
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.roundRect(-15, 0, 30, 64, 14)
    ctx.fill()
    ctx.restore()
  }
  pawLeg(84, s * 0.35, shadow)
  pawLeg(206, -s * 0.35, shadow)
  // Body.
  const g = ctx.createLinearGradient(0, 50, 0, 160)
  g.addColorStop(0, shade(fur, 0.1))
  g.addColorStop(1, shade(fur, -0.15))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(146, 110, 92, 52, 0, 0, TAU)
  ctx.fill()
  ellipse(ctx, 196, 92, 44, 38, -0.3)
  ctx.fill()
  pawLeg(100, -s * 0.35, fur)
  pawLeg(220, s * 0.35, fur)
  // Head.
  ctx.fillStyle = fur
  ellipse(ctx, 252, 80, 34, 28)
  ctx.fill()
  ellipse(ctx, 280, 90, 18, 14)
  ctx.fill()
  circle(ctx, 236, 54, 10)
  ctx.fill()
  ctx.fillStyle = shadow
  circle(ctx, 236, 54, 5)
  ctx.fill()
  ctx.fillStyle = '#111'
  ellipse(ctx, 294, 86, 7, 5)
  circle(ctx, 262, 72, 3.5)
  ctx.fill()
  // Scarf round the neck, the end blowing back over the shoulder.
  ctx.strokeStyle = color2
  ctx.lineCap = 'round'
  ctx.lineWidth = 16
  ctx.beginPath()
  ctx.moveTo(218, 58)
  ctx.quadraticCurveTo(212, 92, 232, 112)
  ctx.stroke()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(214, 70)
  ctx.quadraticCurveTo(192, 66 + s * 4, 172, 76 + s * 8)
  ctx.lineTo(176, 92 + s * 8)
  ctx.quadraticCurveTo(196, 84, 216, 88)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  for (const y of [78, 86]) ctx.fillRect(180, y + s * 8 - (y - 78) * 0.1, 14, 3)
  ctx.fillStyle = shade(color2, -0.25)
  ctx.fillRect(166, 74 + s * 8, 8, 20)
}

/** A reindeer walking on its own, collar and bell in the first colour; the second row has Rudolph's nose lit. */
function walkingReindeer(lit: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color }: SpriteColors) => {
    reindeer(ctx, 104, 132, (f / frames) * TAU, lit, color)
  }
}

/** A Victorian caroler in a coat and scarf with a songbook, singing. */
function caroler(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const sing = 0.5 + 0.5 * Math.sin(p * 2)
  // Long coat over the legs.
  limb(ctx, 86, 210, 30, 30, s * 0.3, 0, 14, '#1f2937')
  limb(ctx, 104, 210, 30, 30, -s * 0.3, 0, 14, '#334155')
  const g = ctx.createLinearGradient(0, 108, 0, 236)
  g.addColorStop(0, shade(color, 0.15))
  g.addColorStop(1, shade(color, -0.25))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(74, 112)
  ctx.lineTo(116, 112)
  ctx.lineTo(132, 236)
  ctx.lineTo(58, 236)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#facc15'
  for (const y of [136, 160, 184]) {
    circle(ctx, 98, y, 3)
    ctx.fill()
  }
  // Scarf.
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.roundRect(74, 104, 46, 14, 7)
  ctx.fill()
  ctx.fillRect(78, 112, 12, 46)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(78, 124, 12, 4)
  ctx.fillRect(78, 140, 12, 4)
  // Head, rosy cheeks, mouth singing.
  ctx.fillStyle = SKIN
  circle(ctx, 98, 76, 26)
  ctx.fill()
  ctx.fillStyle = 'rgba(244,114,182,0.6)'
  circle(ctx, 112, 84, 6)
  ctx.fill()
  ctx.fillStyle = '#111'
  ctx.beginPath()
  ctx.arc(108, 72, 3, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = '#7f1d1d'
  ellipse(ctx, 112, 92, 5, 2 + sing * 5)
  ctx.fill()
  // Top hat.
  ctx.fillStyle = '#111827'
  ctx.fillRect(66, 52, 64, 8)
  ctx.fillRect(76, 14, 44, 40)
  ctx.fillStyle = color2
  ctx.fillRect(76, 42, 44, 8)
  // Arms holding the songbook open in front.
  ctx.strokeStyle = shade(color, -0.1)
  ctx.lineWidth = 13
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(100, 122)
  ctx.lineTo(118, 148)
  ctx.lineTo(136, 132)
  ctx.stroke()
  ctx.fillStyle = '#7f1d1d'
  ctx.beginPath()
  ctx.moveTo(126, 108)
  ctx.lineTo(160, 104)
  ctx.lineTo(160, 140)
  ctx.lineTo(126, 144)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#fef3c7'
  ctx.beginPath()
  ctx.moveTo(130, 110)
  ctx.lineTo(156, 107)
  ctx.lineTo(156, 136)
  ctx.lineTo(130, 140)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#a8a29e'
  ctx.lineWidth = 1.5
  for (let k = 0; k < 4; k++) {
    ctx.beginPath()
    ctx.moveTo(134, 117 + k * 6)
    ctx.lineTo(152, 115 + k * 6)
    ctx.stroke()
  }
  // A note floating up from the song.
  ctx.fillStyle = shade(color2, 0.2)
  ctx.globalAlpha = sing
  ellipse(ctx, 140, 60 - sing * 20, 6, 4.5, -0.4)
  ctx.fill()
  ctx.fillRect(144, 30 - sing * 20, 3, 30)
  ctx.globalAlpha = 1
}

// -- garden, pond and sea -------------------------------------------------------------------------

/** A squirrel bounding along with an acorn, big bushy tail. */
function squirrel(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const fur = color
  ctx.translate(0, 12)
  // Tail curling up behind, swishing.
  const t = ctx.createLinearGradient(0, 10, 0, 130)
  t.addColorStop(0, shade(fur, 0.25))
  t.addColorStop(1, shade(fur, -0.15))
  ctx.fillStyle = t
  ctx.beginPath()
  ctx.moveTo(70, 112)
  ctx.bezierCurveTo(10, 120, -4 + s * 6, 40, 30 + s * 6, 14)
  ctx.bezierCurveTo(60, -4, 86 + s * 4, 26, 64, 46)
  ctx.bezierCurveTo(50, 60, 60, 86, 86, 98)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = shade(fur, 0.4)
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(60, 104)
  ctx.bezierCurveTo(24, 100, 20 + s * 6, 46, 40 + s * 6, 26)
  ctx.stroke()
  // Hind leg, stretched or tucked with the bound.
  ctx.fillStyle = shade(fur, -0.15)
  ellipse(ctx, 96 - s * 6, 118, 26, 18, -0.3 + s * 0.4)
  ctx.fill()
  ctx.fillStyle = shade(fur, -0.25)
  ellipse(ctx, 84 - s * 14, 140, 16, 6)
  ctx.fill()
  // Body.
  ctx.fillStyle = fur
  ctx.beginPath()
  ctx.ellipse(120, 104, 40, 28, -0.4 - s * 0.15, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#fde8c8'
  ellipse(ctx, 134, 110, 18, 16, -0.4)
  ctx.fill()
  // Head and ear.
  ctx.fillStyle = fur
  circle(ctx, 152, 70, 22)
  ctx.fill()
  ellipse(ctx, 172, 78, 12, 9, 0.3)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(138, 54)
  ctx.lineTo(140, 30)
  ctx.lineTo(152, 50)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 160, 64, 4)
  circle(ctx, 182, 76, 3)
  ctx.fill()
  ctx.fillStyle = '#fff'
  circle(ctx, 161.5, 62.5, 1.4)
  ctx.fill()
  // Front paws holding the acorn.
  ctx.fillStyle = color2
  ellipse(ctx, 172, 104, 10, 12)
  ctx.fill()
  ctx.fillStyle = '#78350f'
  ctx.beginPath()
  ctx.ellipse(172, 94, 12, 6, 0, Math.PI, 0)
  ctx.fill()
  ctx.fillRect(170, 84, 4, 6)
  ctx.fillStyle = shade(fur, -0.1)
  ellipse(ctx, 162, 108, 7, 5, 0.4)
  ctx.fill()
  ellipse(ctx, 150 + s * 10, 136, 12, 5)
  ctx.fill()
}

/** Two lovebirds flying side by side, a little heart between them. */
function lovebirds(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const one = (x: number, y: number, ph: number, body: string, wing: string, scale: number) => {
    const flap = Math.sin(p + ph)
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(scale, scale)
    const feather = (a: number, col: string) => {
      ctx.save()
      ctx.translate(2, -4)
      ctx.rotate(a)
      ctx.fillStyle = col
      ellipse(ctx, -24, 0, 30, 10)
      ctx.fill()
      ctx.restore()
    }
    // Far wing up and down behind the body.
    feather(0.5 + flap * 0.75, shade(wing, -0.3))
    ctx.fillStyle = shade(body, -0.2)
    ctx.beginPath()
    ctx.moveTo(-40, 6)
    ctx.lineTo(-74, 0)
    ctx.lineTo(-70, 18)
    ctx.closePath()
    ctx.fill()
    const g = ctx.createLinearGradient(0, -24, 0, 24)
    g.addColorStop(0, shade(body, 0.25))
    g.addColorStop(1, shade(body, -0.15))
    ctx.fillStyle = g
    ellipse(ctx, -6, 6, 40, 20, -0.1)
    ctx.fill()
    ctx.fillStyle = shade(body, 0.35)
    circle(ctx, 32, -6, 17)
    ctx.fill()
    ctx.fillStyle = '#f97316'
    ctx.beginPath()
    ctx.moveTo(46, -10)
    ctx.quadraticCurveTo(60, -4, 46, 4)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, 36, -10, 3)
    ctx.fill()
    feather(0.35 + flap * 0.7, wing)
    ctx.restore()
  }
  one(120, 90, 0.6, color, color2, 0.9)
  // The heart between them, beating.
  const beat = 1 + 0.12 * Math.sin(p * 2)
  ctx.fillStyle = '#ef4444'
  heartPath(ctx, 196, 70, 15 * beat)
  ctx.fill()
  one(170, 132, 0, color2, color, 1)
}

/** A frog hopping: crouched, then stretched out mid-leap. */
function frog(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  // In the air for the middle of the bound, as the walker lifts it.
  const leap = Math.sin((f / frames) * Math.PI)
  const skin = color
  const belly = color2
  ctx.save()
  ctx.translate(96, 120)
  ctx.rotate(-0.35 * leap)
  // Back legs: folded, or kicked out behind.
  // Back legs: thigh, shin and webbed foot, folded under or kicked out behind.
  const leg = shade(skin, -0.2)
  ctx.fillStyle = leg
  ellipse(ctx, -30, 10, 28, 15, 0.2 + leap * 0.35)
  ctx.fill()
  const kx = -50 - leap * 6
  const ky = 18
  const fx = kx + 32 - leap * 70
  const fy = 30 + leap * 6
  ctx.strokeStyle = leg
  ctx.lineWidth = 11
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(kx, ky)
  ctx.lineTo(fx, fy)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(fx, fy - 6)
  ctx.lineTo(fx - 18, fy - 4)
  ctx.lineTo(fx - 14, fy + 6)
  ctx.lineTo(fx + 4, fy + 6)
  ctx.closePath()
  ctx.fill()
  // Body.
  const g = ctx.createLinearGradient(0, -40, 0, 30)
  g.addColorStop(0, shade(skin, 0.2))
  g.addColorStop(1, shade(skin, -0.15))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(0, 0, 50, 30, -0.15, 0, TAU)
  ctx.fill()
  ctx.fillStyle = belly
  ellipse(ctx, 14, 14, 30, 13, -0.15)
  ctx.fill()
  ctx.fillStyle = shade(skin, -0.25)
  for (const [x, y, r] of [[-20, -12, 6], [-4, -20, 5], [-30, 2, 4]]) {
    circle(ctx, x, y, r)
    ctx.fill()
  }
  // Front legs.
  ctx.strokeStyle = skin
  ctx.lineWidth = 9
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(28, 14)
  ctx.lineTo(36 + leap * 16, 30 + leap * 4)
  ctx.stroke()
  // Head with big eyes on top.
  ctx.fillStyle = skin
  ellipse(ctx, 38, -10, 26, 20)
  ctx.fill()
  for (const x of [26, 48]) {
    ctx.fillStyle = skin
    circle(ctx, x, -28, 12)
    ctx.fill()
    ctx.fillStyle = '#fff'
    circle(ctx, x + 1, -29, 8)
    ctx.fill()
    ctx.fillStyle = '#111'
    ellipse(ctx, x + 3, -29, 5, 3.5)
    ctx.fill()
  }
  ctx.strokeStyle = shade(skin, -0.45)
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(46, -6, 16, 0.25, 1.2)
  ctx.stroke()
  ctx.restore()
}

/** A dragonfly: long slim body, four see-through wings blurring. */
function dragonfly(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const flap = Math.sin((f / frames) * TAU * 2)
  const wing = (x: number, y: number, len: number, a: number) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(a)
    const g = ctx.createLinearGradient(0, 0, 0, -len)
    g.addColorStop(0, rgba(color2, 0.55))
    g.addColorStop(1, 'rgba(255,255,255,0.25)')
    ctx.fillStyle = g
    ellipse(ctx, 0, -len / 2, 13, len / 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()
  }
  wing(108, 64, 70, -0.5 + flap * 0.35)
  wing(96, 66, 64, -1.0 + flap * 0.35)
  // Tail, segmented.
  for (let k = 0; k < 8; k++) {
    ctx.fillStyle = k % 2 ? shade(color, -0.2) : color
    ellipse(ctx, 88 - k * 10, 70 + k * 0.6, 7, 5)
    ctx.fill()
  }
  const g = ctx.createRadialGradient(112, 64, 2, 112, 70, 18)
  g.addColorStop(0, shade(color, 0.5))
  g.addColorStop(1, shade(color, -0.15))
  ctx.fillStyle = g
  ellipse(ctx, 112, 70, 18, 10)
  ctx.fill()
  ctx.fillStyle = shade(color2, -0.2)
  circle(ctx, 134, 66, 10)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  circle(ctx, 137, 62, 3.5)
  ctx.fill()
  wing(108, 72, 64, Math.PI + 0.5 - flap * 0.3)
  wing(96, 74, 58, Math.PI + 1.0 - flap * 0.3)
}

/** A hummingbird hovering, wings a blur, long beak. */
function hummingbird(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const flap = Math.sin((f / frames) * TAU * 2)
  const wing = (a: number, alpha: number) => {
    ctx.save()
    ctx.translate(86, 70)
    ctx.rotate(a)
    ctx.fillStyle = rgba(color, alpha)
    ellipse(ctx, -6, -40, 14, 42)
    ctx.fill()
    ctx.restore()
  }
  wing(-0.9 + flap * 0.7, 0.4)
  // Tail.
  ctx.fillStyle = shade(color, -0.3)
  ctx.beginPath()
  ctx.moveTo(60, 92)
  ctx.lineTo(20, 120)
  ctx.lineTo(30, 126)
  ctx.lineTo(70, 100)
  ctx.closePath()
  ctx.fill()
  // Body: shimmering green-ish back, throat in the second colour.
  const g = ctx.createLinearGradient(50, 50, 130, 110)
  g.addColorStop(0, shade(color, 0.3))
  g.addColorStop(1, shade(color, -0.3))
  ctx.fillStyle = g
  ellipse(ctx, 88, 86, 34, 18, -0.6)
  ctx.fill()
  ctx.fillStyle = color2
  ellipse(ctx, 112, 70, 12, 14, -0.5)
  ctx.fill()
  ctx.fillStyle = shade(color, 0.1)
  circle(ctx, 122, 56, 15)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 126, 52, 3)
  ctx.fill()
  ctx.strokeStyle = '#1f2937'
  ctx.lineWidth = 3.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(134, 58)
  ctx.lineTo(190, 66)
  ctx.stroke()
  wing(-0.4 - flap * 0.8, 0.55)
}

/** A whale swimming, tail rising and falling. */
function whale(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  // Tail flukes.
  ctx.fillStyle = shade(color, -0.15)
  ctx.save()
  ctx.translate(70, 110)
  ctx.rotate(s * 0.25)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(-40, -20, -66, -46)
  ctx.quadraticCurveTo(-46, -6, -36, 0)
  ctx.quadraticCurveTo(-46, 6, -66, 46)
  ctx.quadraticCurveTo(-40, 20, 0, 6)
  ctx.fill()
  ctx.restore()
  // Body.
  const g = ctx.createLinearGradient(0, 40, 0, 190)
  g.addColorStop(0, shade(color, 0.2))
  g.addColorStop(0.6, color)
  g.addColorStop(1, shade(color, -0.25))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(66, 108 + s * 4)
  ctx.bezierCurveTo(140, 40, 330, 30, 400, 110)
  ctx.bezierCurveTo(410, 150, 380, 186, 300, 188)
  ctx.bezierCurveTo(200, 190, 120, 150, 66, 112 + s * 4)
  ctx.fill()
  // Pale belly with grooves.
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(180, 160)
  ctx.bezierCurveTo(260, 186, 360, 182, 398, 128)
  ctx.bezierCurveTo(390, 176, 340, 194, 290, 192)
  ctx.bezierCurveTo(240, 190, 200, 176, 180, 160)
  ctx.fill()
  ctx.strokeStyle = shade(color2, -0.2)
  ctx.lineWidth = 2
  for (let k = 0; k < 5; k++) {
    ctx.beginPath()
    ctx.moveTo(300 + k * 16, 182 - k * 5)
    ctx.lineTo(372 + k * 6, 152 - k * 6)
    ctx.stroke()
  }
  // Flipper, eye and smile.
  ctx.fillStyle = shade(color, -0.2)
  ctx.beginPath()
  ctx.moveTo(300, 160)
  ctx.quadraticCurveTo(290, 200 + s * 6, 256, 210 + s * 8)
  ctx.quadraticCurveTo(276, 180, 280, 160)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 352, 122, 5)
  ctx.fill()
  ctx.strokeStyle = shade(color, -0.45)
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(370, 140)
  ctx.quadraticCurveTo(388, 142, 400, 128)
  ctx.stroke()
}

/** The spout a whale blows up when someone comes near. */
/** The spout a whale blows up when someone comes near: a column of spray fanning out at the top. */
function whaleSpout(ctx: Ctx, f: number) {
  const k = [1, 0.92, 1.06, 0.96][f % 4]
  const g = ctx.createLinearGradient(0, 160, 0, 40)
  g.addColorStop(0, 'rgba(186,230,253,0.95)')
  g.addColorStop(1, 'rgba(224,242,254,0.8)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(70, 160)
  ctx.quadraticCurveTo(74, 80, 80, 52)
  ctx.quadraticCurveTo(86, 80, 90, 160)
  ctx.fill()
  ctx.fillStyle = 'rgba(224,242,254,0.85)'
  for (let i = 0; i < 11; i++) {
    const a = -Math.PI / 2 + (i - 5) * 0.28
    const r = (34 + (i % 2) * 10) * k
    ctx.beginPath()
    ctx.ellipse(80 + Math.cos(a) * r, 58 + Math.sin(a) * r * 0.8 + Math.abs(i - 5) * 4, 6, 13, a + Math.PI / 2, 0, TAU)
    ctx.fill()
  }
}

/** A crab scuttling sideways, claws snapping. */
function crab(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const shell = color
  // Legs, four a side, stepping in turn.
  ctx.strokeStyle = shade(shell, -0.2)
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let k = 0; k < 4; k++) {
    const a = Math.sin(p + k * 1.2) * 0.25
    for (const side of [-1, 1]) {
      const x0 = 100 + side * (22 + k * 8)
      ctx.beginPath()
      ctx.moveTo(x0, 92)
      ctx.lineTo(x0 + side * (22 + k * 4 + Math.sin(a) * 10), 84 - k * 2)
      ctx.lineTo(x0 + side * (30 + k * 8 + Math.sin(a) * 16), 134 - Math.abs(a) * 10)
      ctx.stroke()
    }
  }
  // Shell.
  const g = ctx.createRadialGradient(92, 70, 4, 100, 86, 56)
  g.addColorStop(0, shade(shell, 0.35))
  g.addColorStop(1, shade(shell, -0.2))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(100, 88, 54, 32, 0, Math.PI, 0)
  ctx.quadraticCurveTo(150, 112, 100, 112)
  ctx.quadraticCurveTo(50, 112, 46, 88)
  ctx.fill()
  ctx.fillStyle = shade(shell, 0.25)
  for (const [x, y] of [[80, 72], [100, 66], [120, 72]]) {
    circle(ctx, x, y, 4)
    ctx.fill()
  }
  // Eyes on stalks.
  for (const x of [86, 114]) {
    ctx.strokeStyle = shell
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(x, 62)
    ctx.lineTo(x + (x - 100) * 0.2, 40)
    ctx.stroke()
    ctx.fillStyle = '#fff'
    circle(ctx, x + (x - 100) * 0.2, 38, 8)
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, x + (x - 100) * 0.2, 38, 4)
    ctx.fill()
  }
  // Claws up, snapping.
  for (const side of [-1, 1]) {
    const open = 0.25 + 0.25 * Math.max(0, side * s)
    const cx = 100 + side * 66
    const cy = 50
    ctx.strokeStyle = shell
    ctx.lineWidth = 9
    ctx.beginPath()
    ctx.moveTo(100 + side * 40, 82)
    ctx.lineTo(cx, cy + 14)
    ctx.stroke()
    ctx.fillStyle = shade(shell, 0.1)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(side, 1)
    ctx.beginPath()
    ctx.ellipse(0, 0, 16, 22, -0.2, 0, TAU)
    ctx.fill()
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(-2, -16)
    ctx.lineTo(8, -40)
    ctx.lineTo(14, -14)
    ctx.closePath()
    ctx.fill()
    ctx.rotate(open)
    ctx.fillStyle = shade(shell, 0.1)
    ctx.beginPath()
    ctx.moveTo(-14, -12)
    ctx.lineTo(-12, -40)
    ctx.lineTo(0, -14)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}

// -- any time ----------------------------------------------------------------------------------------

/** A friendly robot with an antenna light and a screen face; the second row waves both arms. */
function robot(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors, waving = false) {
  const p = (f / frames) * TAU
  const s = waving ? 0 : Math.sin(p)
  const metal = (x: number, y: number, w: number, h: number, r: number) => {
    const g = ctx.createLinearGradient(x, 0, x + w, 0)
    g.addColorStop(0, shade(color, -0.2))
    g.addColorStop(0.4, shade(color, 0.3))
    g.addColorStop(1, shade(color, -0.3))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    ctx.fill()
  }
  // Legs and feet, stiff steps.
  for (const [x, a] of [[76, s * 0.25], [108, -s * 0.25]] as const) {
    ctx.save()
    ctx.translate(x, 200)
    ctx.rotate(a)
    metal(-10, 0, 20, 52, 6)
    ctx.fillStyle = '#334155'
    ctx.beginPath()
    ctx.roundRect(-16, 50, 38, 16, 6)
    ctx.fill()
    ctx.restore()
  }
  // Arms: swinging, or both up and waving.
  const arm = (x: number, side: number) => {
    const a = waving ? Math.PI * 0.82 + Math.sin(f * 1.6 + side) * 0.2 : s * 0.4
    ctx.save()
    ctx.translate(x, 130)
    ctx.rotate(side * a)
    metal(-8, 0, 16, 58, 7)
    ctx.strokeStyle = '#475569'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(0, 66, 9, 0.3, Math.PI - 0.3, true)
    ctx.stroke()
    ctx.restore()
  }
  arm(56, 1)
  // Body with a panel of lights.
  metal(52, 110, 84, 96, 14)
  ctx.fillStyle = '#0f172a'
  ctx.beginPath()
  ctx.roundRect(66, 128, 56, 40, 6)
  ctx.fill()
  for (let k = 0; k < 3; k++) {
    const on = (f + k) % 3 === 0
    ctx.fillStyle = on ? color2 : rgba(color2, 0.25)
    circle(ctx, 78 + k * 16, 140, 5)
    ctx.fill()
  }
  ctx.fillStyle = '#22c55e'
  ctx.fillRect(72, 154, 44 * (0.4 + 0.6 * ((f % 4) / 3)), 6)
  arm(132, -1)
  // Head: screen face, antenna with a blinking light.
  ctx.strokeStyle = '#64748b'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(94, 40)
  ctx.lineTo(94, 18)
  ctx.stroke()
  glow(ctx, 94, 14, 14, color2, f % 2 ? 0.9 : 0.4)
  ctx.fillStyle = color2
  circle(ctx, 94, 14, 6)
  ctx.fill()
  metal(58, 38, 72, 62, 14)
  ctx.fillStyle = '#0f172a'
  ctx.beginPath()
  ctx.roundRect(66, 48, 56, 42, 9)
  ctx.fill()
  ctx.fillStyle = color2
  if (waving) {
    ctx.strokeStyle = color2
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(82, 66, 6, Math.PI, 0)
    ctx.moveTo(112, 66)
    ctx.arc(106, 66, 6, 0, Math.PI, true)
    ctx.stroke()
  } else {
    ellipse(ctx, 82, 64, 5, 7)
    ellipse(ctx, 106, 64, 5, 7)
    ctx.fill()
  }
  ctx.strokeStyle = color2
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(94, 74, 10, 0.3, Math.PI - 0.3)
  ctx.stroke()
  ctx.fillStyle = '#94a3b8'
  ctx.fillRect(50, 58, 10, 22)
  ctx.fillRect(128, 58, 10, 22)
}

/** A dog trotting, tail wagging, collar in the second colour. */
function dog(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const fur = color
  const dark = shade(fur, -0.3)
  limb(ctx, 72, 104, 30, 30, -s * 0.5, 0.3, 12, dark)
  limb(ctx, 166, 104, 30, 30, s * 0.5, -0.25, 12, dark)
  // Tail wagging fast.
  ctx.strokeStyle = fur
  ctx.lineWidth = 10
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(56, 90)
  ctx.quadraticCurveTo(36, 70, 30 + Math.sin(p * 3) * 12, 44)
  ctx.stroke()
  // Body.
  const g = ctx.createLinearGradient(0, 60, 0, 130)
  g.addColorStop(0, shade(fur, 0.2))
  g.addColorStop(1, shade(fur, -0.15))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(118, 96, 66, 30, -0.05, 0, TAU)
  ctx.fill()
  ctx.fillStyle = shade(fur, 0.45)
  ellipse(ctx, 150, 108, 26, 16)
  ctx.fill()
  limb(ctx, 84, 108, 30, 30, s * 0.5, 0.3, 13, fur)
  limb(ctx, 178, 108, 30, 30, -s * 0.5, -0.25, 13, fur)
  // Head, floppy ear, tongue out.
  ctx.fillStyle = fur
  ctx.beginPath()
  ctx.moveTo(168, 84)
  ctx.lineTo(186, 50)
  ctx.lineTo(206, 66)
  ctx.lineTo(186, 100)
  ctx.closePath()
  ctx.fill()
  circle(ctx, 196, 52, 24)
  ctx.fill()
  ellipse(ctx, 222, 62, 18, 12)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 238, 58, 5.5)
  circle(ctx, 204, 46, 3.5)
  ctx.fill()
  ctx.fillStyle = '#f472b6'
  ellipse(ctx, 222, 78 + Math.abs(s) * 3, 6, 10)
  ctx.fill()
  ctx.fillStyle = dark
  ctx.beginPath()
  ctx.ellipse(184, 52, 10, 24, 0.5 + s * 0.15, 0, TAU)
  ctx.fill()
  // Collar and tag.
  ctx.strokeStyle = color2
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(180, 66)
  ctx.lineTo(198, 82)
  ctx.stroke()
  ctx.fillStyle = '#facc15'
  circle(ctx, 194, 88, 5)
  ctx.fill()
}

/** Nun, gimel, hei or shin, drawn in strokes (so it needs no Hebrew font) in a box about 50 across. */
function hebrewLetter(ctx: Ctx, which: number, color: string) {
  ctx.strokeStyle = color
  ctx.lineWidth = 9
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (which === 0) {
    ctx.moveTo(-8, -24)
    ctx.lineTo(8, -24)
    ctx.lineTo(8, 24)
    ctx.lineTo(-14, 24)
  } else if (which === 1) {
    ctx.moveTo(-8, -24)
    ctx.lineTo(4, -24)
    ctx.lineTo(4, 14)
    ctx.lineTo(12, 26)
    ctx.moveTo(4, 8)
    ctx.lineTo(-12, 26)
  } else if (which === 2) {
    ctx.moveTo(-18, -24)
    ctx.lineTo(16, -24)
    ctx.lineTo(16, 26)
    ctx.moveTo(-14, -6)
    ctx.lineTo(-14, 26)
  } else {
    ctx.moveTo(-20, -24)
    ctx.lineTo(-12, 24)
    ctx.lineTo(12, 24)
    ctx.quadraticCurveTo(22, 4, 20, -24)
    ctx.moveTo(0, -22)
    ctx.lineTo(-4, 18)
  }
  ctx.stroke()
}

/** A spinning dreidel: each frame shows another face (nun, gimel, hei, shin) turning to the front. */
function dreidel(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  // Handle.
  ctx.fillStyle = shade(color, -0.2)
  ctx.beginPath()
  ctx.roundRect(62, 4, 16, 34, 6)
  ctx.fill()
  // Body: a box seen turning, the face going round to the left and the next coming in on the right.
  const w = 90
  const k = Math.floor(f / 2) % 4
  const th = (f % 2) * (Math.PI / 4)
  const wa = w * Math.cos(th)
  const wb = w * Math.sin(th)
  const x0 = 70 - (wa + wb) / 2
  const face = (xa: number, xb: number, tone: number, letter: number) => {
    if (xb - xa < 2) return
    const g = ctx.createLinearGradient(xa, 0, xb, 0)
    g.addColorStop(0, shade(color, tone - 0.1))
    g.addColorStop(1, shade(color, tone + 0.1))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(xa, 36)
    ctx.lineTo(xb, 36)
    ctx.lineTo(xb, 120)
    ctx.lineTo(70, 172)
    ctx.lineTo(xa, 120)
    ctx.closePath()
    ctx.fill()
    ctx.save()
    ctx.beginPath()
    ctx.rect(xa, 36, xb - xa, 90)
    ctx.clip()
    ctx.translate((xa + xb) / 2, 82)
    ctx.scale((xb - xa) / w, 1)
    hebrewLetter(ctx, letter, color2)
    ctx.restore()
  }
  face(x0, x0 + wa, -0.05, k)
  face(x0 + wa, x0 + wa + wb, -0.3, (k + 1) % 4)
  ctx.strokeStyle = color2
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x0, 36)
  ctx.lineTo(x0 + wa + wb, 36)
  ctx.stroke()
}

/** A lion dance: the big lion head and its long cloth body, two dancers' legs beneath; the second row rears up. */
function lionDance(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors, rearing = false) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const lift = rearing ? 40 + Math.sin(p * 2) * 10 : Math.abs(Math.sin(p)) * 6
  ctx.translate(0, 50)
  // Dancers' legs in trousers, four of them.
  for (const [x, ph] of [[70, 0], [110, Math.PI], [220, Math.PI / 2], [256, -Math.PI / 2]] as const) {
    const a = Math.sin(p + ph) * 0.35
    limb(ctx, x, 150, 34, 32, a, Math.max(0, -Math.sin(p + ph)) * 0.5, 16, color2)
  }
  // The cloth body, rippling, with gold scales.
  const g = ctx.createLinearGradient(0, 60, 0, 170)
  g.addColorStop(0, shade(color, 0.15))
  g.addColorStop(1, shade(color, -0.25))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(40, 150)
  ctx.bezierCurveTo(40, 90 + s * 8, 140, 80 - s * 8, 230, 96 - lift)
  ctx.lineTo(250, 156)
  for (let k = 0; k <= 10; k++) ctx.lineTo(250 - k * 21, 160 + (k % 2 ? 10 : 0))
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = shade(color2, 0.1)
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < 8; k++) {
      const x = 70 + k * 20 + r * 10
      const y = 118 + r * 18 - (k / 8) * 16 + Math.sin(p + k) * 3
      ctx.beginPath()
      ctx.arc(x, y, 8, Math.PI, 0)
      ctx.fill()
    }
  }
  // Fur trim along the back and a tail tuft.
  ctx.fillStyle = '#ffffff'
  for (let k = 0; k < 9; k++) {
    circle(ctx, 50 + k * 22, 102 - k * 2.6 + Math.sin(p + k) * 4 - (k > 6 ? lift * 0.3 : 0), 8)
    ctx.fill()
  }
  circle(ctx, 34, 146, 14)
  ctx.fill()
  // The head, mouth opening and closing.
  ctx.save()
  ctx.translate(276, 92 - lift)
  ctx.rotate(rearing ? -0.25 : s * 0.06)
  const open = rearing ? 0.5 + 0.5 * Math.abs(Math.sin(p * 2)) : 0.3 + 0.2 * Math.abs(s)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(-46, 6, 92, 30 + open * 20, 14)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  for (let k = 0; k < 5; k++) {
    ctx.beginPath()
    ctx.moveTo(-36 + k * 18, 8 + open * 20)
    ctx.lineTo(-30 + k * 18, 18 + open * 20)
    ctx.lineTo(-24 + k * 18, 8 + open * 20)
    ctx.fill()
  }
  const h = ctx.createRadialGradient(-6, -26, 6, 0, -14, 60)
  h.addColorStop(0, shade(color, 0.35))
  h.addColorStop(1, shade(color, -0.15))
  ctx.fillStyle = h
  ctx.beginPath()
  ctx.ellipse(0, -16, 54, 40, 0, 0, TAU)
  ctx.fill()
  // Horn, mirror on the forehead, big eyes with lashes.
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(-8, -54)
  ctx.lineTo(0, -80)
  ctx.lineTo(8, -54)
  ctx.fill()
  ctx.fillStyle = '#e5e7eb'
  circle(ctx, 0, -40, 9)
  ctx.fill()
  for (const x of [-22, 22]) {
    ctx.fillStyle = '#ffffff'
    circle(ctx, x, -18, 14)
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, x + 3, -16, 7)
    ctx.fill()
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(x, -18, 15, Math.PI * 1.1, Math.PI * 1.9)
    ctx.stroke()
  }
  ctx.fillStyle = color2
  ellipse(ctx, 0, 4, 14, 9)
  ctx.fill()
  // Fur ruff round the face.
  ctx.fillStyle = '#ffffff'
  for (let k = 0; k < 12; k++) {
    const a = Math.PI * 0.95 + (k / 11) * Math.PI * 1.1
    circle(ctx, Math.cos(a) * 56, -16 + Math.sin(a) * 42, 9)
    ctx.fill()
  }
  ctx.restore()
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
  // Things that fall: each frame is another one (a different crystal, leaf or scrap).
  snowfall: [{ id: 'main', frames: 4, w: 128, h: 128, paint: snowCrystal }, SPARKLE],
  leaves: [{ id: 'main', frames: 4, w: 140, h: 140, paint: fallingLeaf }, SPARKLE],
  petals: [{ id: 'main', frames: 4, w: 90, h: 90, paint: petal }, SPARKLE],
  confetti: [{ id: 'main', frames: 6, w: 80, h: 80, paint: confetti }, SPARKLE],
  'falling-hearts': [{ id: 'main', frames: 2, w: 110, h: 100, paint: fallingHeart }, SPARKLE],
  clovers: [{ id: 'main', frames: 2, w: 120, h: 120, paint: clover }, SPARKLE],
  'hanging-spiders': [
    { id: 'main', frames: 8, w: 160, h: 170, paint: hangingSpider },
    { id: 'thread', frames: 1, w: 8, h: 256, paint: silk },
    SPARKLE,
  ],
  lanterns: [{ id: 'main', frames: 4, w: 120, h: 170, paint: skyLantern }, SPARKLE],
  jellyfish: [{ id: 'main', frames: 8, w: 160, h: 220, paint: jellyfish }, SPARKLE],
  'rising-bubbles': [{ id: 'main', frames: 1, w: 100, h: 100, paint: risingBubble }, SPARKLE],
  'hot-air-balloons': [{ id: 'main', frames: 4, w: 200, h: 290, paint: hotAirBalloon }, SPARKLE],
  fireflies: [{ id: 'main', frames: 1, w: 64, h: 64, paint: firefly }, SPARKLE],
  bees: [{ id: 'main', frames: 8, w: 170, h: 130, paint: bee }, SPARKLE],
  dragon: [
    { id: 'main', frames: 8, w: 480, h: 360, paint: dragon },
    { id: 'fire', frames: 4, w: 320, h: 140, paint: dragonFire },
    SPARKLE,
  ],
  owls: [
    { id: 'main', frames: 8, w: 300, h: 230, paint: owl },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Hoo hoo!') },
    SPARKLE,
  ],
  angels: [
    { id: 'main', frames: 8, w: 320, h: 230, paint: angel },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Peace on earth') },
    SPARKLE,
  ],
  sharks: [{ id: 'main', frames: 8, w: 370, h: 160, paint: shark }, SPARKLE],
  'sea-turtles': [{ id: 'main', frames: 8, w: 300, h: 200, paint: seaTurtle }, SPARKLE],
  mummies: [
    { id: 'main', frames: 8, w: 190, h: 300, paint: mummy },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Mmmmph!') },
    SPARKLE,
  ],
  'gingerbread-men': [
    { id: 'main', frames: 8, w: 180, h: 240, paint: gingerbreadMan },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Catch me if you can!') },
    SPARKLE,
  ],
  'toy-soldiers': [
    { id: 'main', frames: 8, w: 170, h: 300, paint: (ctx, f, n, c) => toySoldier(ctx, f, n, c) },
    { id: 'wave', frames: 1, w: 170, h: 300, paint: (ctx, f, n, c) => toySoldier(ctx, f, n, c, true) },
    SPARKLE,
  ],
  dinosaurs: [
    { id: 'main', frames: 8, w: 340, h: 260, paint: dinosaur },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('ROAR!') },
    SPARKLE,
  ],
  ducklings: [
    { id: 'main', frames: 8, w: 200, h: 170, paint: duck },
    { id: 'baby', frames: 8, w: 120, h: 110, paint: duckling },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Quack quack!') },
    SPARKLE,
  ],
  'trick-or-treaters': [
    { id: 'main', frames: 8, w: 180, h: 280, paint: trickOrTreater },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Trick or treat!') },
    SPARKLE,
  ],
  werewolves: [
    { id: 'main', frames: 8, w: 230, h: 300, paint: werewolf },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Awoooooo!') },
    SPARKLE,
  ],
  vampires: [
    { id: 'main', frames: 8, w: 180, h: 290, paint: vampire },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Good eeevening…') },
    SPARKLE,
  ],
  frankensteins: [
    { id: 'main', frames: 8, w: 200, h: 300, paint: frankenstein },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Friend?') },
    SPARKLE,
  ],
  'grim-reaper': [{ id: 'main', frames: 8, w: 220, h: 280, paint: grimReaper }, SPARKLE],
  // Rising out of the ground: the hand comes up behind its mound of earth.
  'zombie-hands': [
    { id: 'main', frames: 8, w: 140, h: 200, paint: zombieHand },
    { id: 'mound', frames: 1, w: 160, h: 60, paint: dirtMound },
    SPARKLE,
  ],
  rats: [{ id: 'main', frames: 8, w: 200, h: 110, paint: rat }, SPARKLE],
  'falling-presents': [{ id: 'main', frames: 4, w: 110, h: 110, paint: fallingPresent }, SPARKLE],
  'polar-bears': [{ id: 'main', frames: 8, w: 310, h: 190, paint: polarBear }, SPARKLE],
  reindeer: [
    { id: 'main', frames: 8, w: 240, h: 210, paint: walkingReindeer(false) },
    { id: 'wave', frames: 8, w: 240, h: 210, paint: walkingReindeer(true) },
    SPARKLE,
  ],
  carolers: [
    { id: 'main', frames: 8, w: 180, h: 275, paint: caroler },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Joy to the world!') },
    SPARKLE,
  ],
  squirrels: [{ id: 'main', frames: 8, w: 200, h: 172, paint: squirrel }, SPARKLE],
  lovebirds: [{ id: 'main', frames: 8, w: 250, h: 190, paint: lovebirds }, SPARKLE],
  // Whole, cracking, cracked, the chick peeping out, then out and waving.
  'hatching-eggs': [{ id: 'main', frames: 5, w: 140, h: 170, paint: hatchingEgg }, SPARKLE],
  frogs: [
    { id: 'main', frames: 8, w: 200, h: 170, paint: frog },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Ribbit!') },
    SPARKLE,
  ],
  dragonflies: [{ id: 'main', frames: 8, w: 180, h: 130, paint: dragonfly }, SPARKLE],
  hummingbirds: [{ id: 'main', frames: 8, w: 200, h: 140, paint: hummingbird }, SPARKLE],
  dolphins: [
    { id: 'main', frames: 8, w: 300, h: 140, paint: dolphin },
    { id: 'splash', frames: 1, w: 160, h: 100, paint: splash },
    SPARKLE,
  ],
  whales: [
    { id: 'main', frames: 8, w: 420, h: 230, paint: whale },
    { id: 'spout', frames: 4, w: 160, h: 160, paint: whaleSpout },
    SPARKLE,
  ],
  crabs: [{ id: 'main', frames: 8, w: 200, h: 150, paint: crab }, SPARKLE],
  octopus: [{ id: 'main', frames: 8, w: 200, h: 240, paint: octopus }, SPARKLE],
  'beach-balls': [{ id: 'main', frames: 1, w: 120, h: 120, paint: beachBall }, SPARKLE],
  'paper-planes': [{ id: 'main', frames: 1, w: 200, h: 100, paint: paperPlane }, SPARKLE],
  kites: [
    { id: 'main', frames: 8, w: 160, h: 200, paint: kite },
    { id: 'string', frames: 1, w: 8, h: 256, paint: kiteString },
    SPARKLE,
  ],
  'rocket-ship': [{ id: 'main', frames: 4, w: 300, h: 140, paint: rocketShip }, SPARKLE],
  astronauts: [
    { id: 'main', frames: 8, w: 190, h: 200, paint: astronaut },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Hello, Earth!') },
    SPARKLE,
  ],
  robots: [
    { id: 'main', frames: 8, w: 190, h: 270, paint: (ctx, f, n, c) => robot(ctx, f, n, c) },
    { id: 'wave', frames: 8, w: 190, h: 270, paint: (ctx, f, n, c) => robot(ctx, f, n, c, true) },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Hello, human!') },
    SPARKLE,
  ],
  dogs: [
    { id: 'main', frames: 8, w: 260, h: 180, paint: dog },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Woof woof!') },
    SPARKLE,
  ],
  dreidels: [{ id: 'main', frames: 8, w: 140, h: 180, paint: dreidel }, SPARKLE],
  'lion-dance': [
    { id: 'main', frames: 8, w: 350, h: 275, paint: (ctx, f, n, c) => lionDance(ctx, f, n, c) },
    { id: 'wave', frames: 8, w: 350, h: 275, paint: (ctx, f, n, c) => lionDance(ctx, f, n, c, true) },
    SPARKLE,
  ],
  'red-envelopes': [{ id: 'main', frames: 2, w: 90, h: 130, paint: redEnvelope }, SPARKLE],
}
