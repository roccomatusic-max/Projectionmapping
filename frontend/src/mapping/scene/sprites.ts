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
  ctx.fill()
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
  ctx.fill()
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
  ctx.fill()
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
  ctx.fill()
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
  ctx.fill()
  circle(ctx, 120, 72, 5)
  ctx.fill()
  ctx.fillStyle = '#7f1d1d'
  circle(ctx, 107, 71, 2.5)
  ctx.fill()
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
  ctx.fill()
  ellipse(ctx, 222, 74, 5, 4.5)
  ctx.fill()
  ctx.fillStyle = '#000'
  ellipse(ctx, 202, 72, 1.6, 4.5)
  ctx.fill()
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
    ctx.fill()
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
  ctx.fill()
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
  ctx.fill()
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
  ctx.fill()
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
    ctx.fill()
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
      ctx.fill()
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
  ctx.fill()
  ellipse(ctx, 112, 82, 6, 4)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 90, 82, 2.5)
  ctx.fill()
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
  ctx.fill()
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
  ctx.fill()
  ellipse(ctx, 114, 70, 6, 4)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 94, 70, 2.5)
  ctx.fill()
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
  ctx.fill()
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
  ctx.fill()
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
  ctx.fill()
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
    ctx.fill()
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
  ctx.fill()
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

// -- on the roofline: perched birds, hanging bats, bells and stockings --------------------------

type Percher = 'crow' | 'dove' | 'cardinal'

/** A bird sitting on the roofline, feet at the bottom middle: sitting, looking round, pecking, calling. */
function perchedBird(kind: Percher) {
  return (ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) => {
    const pose = f % 4
    const body = color
    // Tail down behind.
    ctx.fillStyle = shade(body, -0.25)
    ctx.beginPath()
    ctx.moveTo(62, 112)
    ctx.lineTo(18, 160)
    ctx.lineTo(34, 164)
    ctx.lineTo(80, 126)
    ctx.closePath()
    ctx.fill()
    // Feet gripping the edge.
    ctx.strokeStyle = kind === 'dove' ? '#f472b6' : '#3f3f46'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    for (const x of [78, 94]) {
      ctx.beginPath()
      ctx.moveTo(x, 140)
      ctx.lineTo(x + 2, 164)
      ctx.moveTo(x - 6, 166)
      ctx.lineTo(x + 10, 166)
      ctx.stroke()
    }
    // Body and folded wing.
    const g = ctx.createLinearGradient(0, 70, 0, 150)
    g.addColorStop(0, shade(body, kind === 'crow' ? 0.18 : 0.12))
    g.addColorStop(1, shade(body, -0.2))
    ctx.fillStyle = g
    ellipse(ctx, 88, 116, 42, 32, -0.35)
    ctx.fill()
    ctx.fillStyle = shade(body, kind === 'dove' ? -0.08 : -0.18)
    ellipse(ctx, 74, 112, 32, 18, -0.55)
    ctx.fill()
    if (kind === 'crow') {
      ctx.strokeStyle = 'rgba(148,163,184,0.5)'
      ctx.lineWidth = 2
      for (let k = 0; k < 3; k++) {
        ctx.beginPath()
        ctx.moveTo(56 + k * 8, 112 + k * 4)
        ctx.lineTo(86 + k * 6, 100 + k * 4)
        ctx.stroke()
      }
    }
    // Head: turned, down to peck, or up and calling.
    const [hx, hy, tilt] = pose === 2 ? [126, 112, 0.6] : pose === 1 ? [114, 70, -0.1] : [118, 72, 0]
    ctx.save()
    ctx.translate(hx, hy)
    ctx.rotate(tilt)
    ctx.fillStyle = body
    circle(ctx, 0, 0, 24)
    ctx.fill()
    if (kind === 'cardinal') {
      ctx.beginPath()
      ctx.moveTo(-18, -12)
      ctx.lineTo(-30, -44)
      ctx.lineTo(4, -20)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#111'
      ctx.beginPath()
      ctx.moveTo(4, -10)
      ctx.lineTo(26, -4)
      ctx.lineTo(24, 14)
      ctx.lineTo(4, 12)
      ctx.closePath()
      ctx.fill()
    }
    const open = pose === 3 ? 7 : 0
    const beak = kind === 'crow' ? '#27272a' : kind === 'cardinal' ? '#f97316' : '#fda4af'
    const bl = kind === 'crow' ? 30 : 18
    ctx.fillStyle = beak
    ctx.beginPath()
    ctx.moveTo(18, -6)
    ctx.lineTo(18 + bl, 2 - open)
    ctx.lineTo(18, 4)
    ctx.closePath()
    ctx.moveTo(18, 6)
    ctx.lineTo(18 + bl * 0.9, 6 + open)
    ctx.lineTo(18, 10)
    ctx.closePath()
    ctx.fill()
    if (kind === 'dove') {
      // An olive branch in its beak.
      ctx.strokeStyle = '#4d7c0f'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(26, 6)
      ctx.quadraticCurveTo(46, 14, 62, 10)
      ctx.stroke()
      ctx.fillStyle = color2
      for (const [x, y, a] of [[38, 4, -0.6], [48, 18, 0.6], [56, 4, -0.5], [62, 14, 0.4]] as const) {
        ellipse(ctx, x, y, 8, 3.5, a)
        ctx.fill()
      }
    }
    ctx.fillStyle = kind === 'crow' ? color2 : '#111'
    circle(ctx, 8, -6, kind === 'crow' ? 4.5 : 4)
    ctx.fill()
    ctx.fillStyle = kind === 'crow' ? '#111' : '#fff'
    circle(ctx, kind === 'crow' ? 9 : 9.5, kind === 'crow' ? -6 : -7.5, kind === 'crow' ? 2 : 1.4)
    ctx.fill()
    ctx.restore()
  }
}

/** A bat hanging upside down from the gutter, wrapped in its wings, eyes glowing; feet at the top middle. */
function hangingBat(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const shiver = [0, 2, 0, -2][f % 4]
  ctx.strokeStyle = shade(color, 0.2)
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(52, 4)
  ctx.lineTo(56, 26)
  ctx.moveTo(68, 4)
  ctx.lineTo(64, 26)
  ctx.stroke()
  // Wrapped wings, a little rim of light so it shows on a dark house.
  ctx.shadowColor = rgba(color2, 0.7)
  ctx.shadowBlur = 10
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(60, 20)
  ctx.bezierCurveTo(100 + shiver, 26, 104 + shiver, 100, 72, 128)
  ctx.lineTo(48, 128)
  ctx.bezierCurveTo(16 - shiver, 100, 20 - shiver, 26, 60, 20)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.strokeStyle = shade(color, 0.25)
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(60, 26)
  ctx.lineTo(60, 120)
  ctx.moveTo(60, 40)
  ctx.quadraticCurveTo(84, 70, 74, 120)
  ctx.moveTo(60, 40)
  ctx.quadraticCurveTo(36, 70, 46, 120)
  ctx.stroke()
  // Head at the bottom, ears pointing down.
  ctx.fillStyle = color
  circle(ctx, 60, 132, 18)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(48, 140)
  ctx.lineTo(44, 164)
  ctx.lineTo(56, 146)
  ctx.moveTo(72, 140)
  ctx.lineTo(76, 164)
  ctx.lineTo(64, 146)
  ctx.fill()
  if (f % 4 !== 3) {
    glow(ctx, 53, 134, 9, color2, 0.9)
    glow(ctx, 67, 134, 9, color2, 0.9)
    ctx.fillStyle = '#fff'
    circle(ctx, 53, 134, 2.4)
    ctx.fill()
    circle(ctx, 67, 134, 2.4)
    ctx.fill()
  }
}

/** A golden jingle bell with a bow; frames catch the light differently. */
function jingleBell(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  // Bow on top.
  ctx.fillStyle = color2
  ellipse(ctx, 40, 22, 22, 11, 0.4)
  ctx.fill()
  ellipse(ctx, 80, 22, 22, 11, -0.4)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(56, 26)
  ctx.lineTo(38, 54)
  ctx.lineTo(50, 52)
  ctx.lineTo(60, 30)
  ctx.lineTo(70, 52)
  ctx.lineTo(82, 54)
  ctx.lineTo(64, 26)
  ctx.fill()
  ctx.fillStyle = shade(color2, -0.2)
  circle(ctx, 60, 24, 8)
  ctx.fill()
  // The bell.
  const shine = [0.35, 0.55, 0.4, 0.7][f % 4]
  const g = ctx.createRadialGradient(46, 60, 4, 60, 80, 52)
  g.addColorStop(0, shade(color, shine + 0.2))
  g.addColorStop(0.5, color)
  g.addColorStop(1, shade(color, -0.4))
  ctx.fillStyle = g
  circle(ctx, 60, 82, 44)
  ctx.fill()
  ctx.strokeStyle = shade(color, -0.35)
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(60, 82, 44, Math.PI * 0.05, Math.PI * 0.95)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(24, 82)
  ctx.lineTo(96, 82)
  ctx.stroke()
  ctx.fillStyle = '#1f1a10'
  ctx.beginPath()
  ctx.roundRect(50, 92, 20, 18, 9)
  ctx.fill()
  ctx.fillRect(58, 108, 4, 14)
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ellipse(ctx, 44, 62, 10, 6, -0.6)
  ctx.fill()
}

/** A ribbon the bells and stockings hang on. */
function ribbon(ctx: Ctx, _f: number, _n: number, { color2 }: SpriteColors) {
  ctx.fillStyle = color2
  ctx.fillRect(1, 0, 6, 256)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(2, 0, 2, 256)
}

/** A Christmas stocking with a fur cuff and a present peeking out; two patterns. */
function stocking(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const sock = () => {
    ctx.beginPath()
    ctx.moveTo(30, 40)
    ctx.lineTo(86, 40)
    ctx.lineTo(86, 120)
    ctx.quadraticCurveTo(88, 150, 60, 158)
    ctx.lineTo(28, 166)
    ctx.quadraticCurveTo(4, 170, 6, 148)
    ctx.quadraticCurveTo(8, 132, 30, 126)
    ctx.closePath()
  }
  // A present and a candy cane poking out of the top.
  present(ctx, 44, 8, 30, 28, '#2563eb', '#facc15')
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(38, 40)
  ctx.lineTo(38, 10)
  ctx.arc(30, 10, 8, 0, Math.PI, true)
  ctx.stroke()
  ctx.strokeStyle = '#dc2626'
  ctx.setLineDash([5, 6])
  ctx.stroke()
  ctx.setLineDash([])
  sock()
  const g = ctx.createLinearGradient(6, 0, 88, 0)
  g.addColorStop(0, shade(color, -0.2))
  g.addColorStop(0.5, shade(color, 0.1))
  g.addColorStop(1, shade(color, -0.25))
  ctx.fillStyle = g
  ctx.fill()
  ctx.save()
  sock()
  ctx.clip()
  ctx.fillStyle = color2
  if (f % 2 === 0) {
    for (const y of [70, 100, 130]) ctx.fillRect(0, y, 100, 9)
  } else {
    for (const [x, y] of [[44, 74], [66, 98], [40, 112], [24, 146], [62, 136]]) {
      ctx.beginPath()
      for (let k = 0; k < 10; k++) {
        const r = k % 2 ? 3.5 : 8
        const a = -Math.PI / 2 + (k * Math.PI) / 5
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
      }
      ctx.fill()
    }
  }
  ctx.restore()
  // Fluffy cuff.
  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.roundRect(24, 34, 68, 24, 12)
  ctx.fill()
  ctx.fillStyle = '#e2e8f0'
  for (const x of [34, 50, 66, 82]) {
    circle(ctx, x, 50, 4)
    ctx.fill()
  }
}

// -- sliding down the roof -----------------------------------------------------------------------

/** A child on a sled, scarf flying; the second frame has both arms up. */
function sledder(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const cheer = f % 2 === 1
  // Sled with curled runner.
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(30, 140)
  ctx.lineTo(190, 140)
  ctx.quadraticCurveTo(214, 140, 210, 118)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(36, 116, 160, 16, 6)
  ctx.fill()
  ctx.fillStyle = shade(color, -0.3)
  for (const x of [60, 160]) ctx.fillRect(x, 130, 8, 10)
  // Legs out in front in boots.
  ctx.strokeStyle = '#1e3a8a'
  ctx.lineWidth = 16
  ctx.beginPath()
  ctx.moveTo(90, 110)
  ctx.lineTo(150, 108)
  ctx.stroke()
  ctx.fillStyle = '#3f2a1d'
  ctx.beginPath()
  ctx.roundRect(146, 96, 22, 22, 6)
  ctx.fill()
  // Puffy coat.
  const g = ctx.createLinearGradient(0, 50, 0, 120)
  g.addColorStop(0, '#60a5fa')
  g.addColorStop(1, '#1d4ed8')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(66, 54, 52, 64, 18)
  ctx.fill()
  // Scarf flying out behind.
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.roundRect(70, 50, 48, 12, 6)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(72, 54)
  ctx.quadraticCurveTo(40, 44, 14, 56)
  ctx.lineTo(16, 68)
  ctx.quadraticCurveTo(42, 58, 74, 62)
  ctx.fill()
  // Head with a bobble hat.
  ctx.fillStyle = SKIN
  circle(ctx, 98, 34, 20)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.arc(98, 30, 21, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  circle(ctx, 98, 6, 7)
  ctx.fill()
  ctx.fillRect(77, 26, 42, 6)
  ctx.fillStyle = '#111'
  circle(ctx, 106, 36, 2.5)
  ctx.fill()
  ctx.fillStyle = '#7f1d1d'
  ellipse(ctx, 110, 46, 4, cheer ? 5 : 2)
  ctx.fill()
  // Arms: holding the rope, or both up cheering.
  ctx.strokeStyle = '#2563eb'
  ctx.lineWidth = 11
  ctx.beginPath()
  if (cheer) {
    ctx.moveTo(78, 64)
    ctx.lineTo(70, 20)
    ctx.moveTo(110, 64)
    ctx.lineTo(126, 22)
  } else {
    ctx.moveTo(108, 68)
    ctx.lineTo(140, 90)
  }
  ctx.stroke()
  if (!cheer) {
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(142, 92)
    ctx.quadraticCurveTo(180, 100, 204, 120)
    ctx.stroke()
  }
}

/** A penguin sliding on its belly, flippers back (or flapping). */
function slidingPenguin(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const flap = f % 2 === 1
  ctx.fillStyle = color
  // Body lying flat, nose first.
  ctx.beginPath()
  ctx.ellipse(110, 80, 92, 34, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.ellipse(118, 94, 76, 20, 0, 0, TAU)
  ctx.fill()
  // Head and beak.
  ctx.fillStyle = color
  circle(ctx, 196, 70, 26)
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  ellipse(ctx, 204, 76, 14, 12)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 206, 66, 3.5)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(218, 72)
  ctx.lineTo(244, 78)
  ctx.lineTo(218, 84)
  ctx.closePath()
  ctx.fill()
  // Flipper.
  ctx.fillStyle = shade(color, 0.15)
  ctx.beginPath()
  if (flap) {
    ctx.moveTo(120, 62)
    ctx.quadraticCurveTo(100, 20, 84, 14)
    ctx.quadraticCurveTo(96, 44, 104, 70)
  } else {
    ctx.moveTo(130, 66)
    ctx.quadraticCurveTo(80, 56, 46, 70)
    ctx.quadraticCurveTo(84, 74, 124, 78)
  }
  ctx.closePath()
  ctx.fill()
  // Feet trailing.
  ctx.fillStyle = color2
  ellipse(ctx, 18, 76, 14, 7, 0.3)
  ctx.fill()
  ellipse(ctx, 22, 92, 14, 7, -0.3)
  ctx.fill()
  // Snow spray.
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  for (const [x, y, r] of [[10, 112, 6], [24, 118, 4], [40, 114, 5], [4, 102, 3]]) {
    circle(ctx, x, y, r)
    ctx.fill()
  }
}

// -- more walkers -------------------------------------------------------------------------------

/** A snowman waddling along, scarf in the second colour. */
function snowman(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  ctx.translate(85, 236)
  ctx.rotate(s * 0.08)
  ctx.translate(-85, -236 + Math.abs(s) * -6)
  const ball = (x: number, y: number, r: number) => {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(1, shade(color, -0.12))
    ctx.fillStyle = g
    circle(ctx, x, y, r)
    ctx.fill()
  }
  ball(85, 194, 44)
  // Stick arms.
  ctx.strokeStyle = '#5b3a1e'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(60, 130)
  ctx.lineTo(22, 108 - s * 10)
  ctx.lineTo(12, 112 - s * 10)
  ctx.moveTo(30, 113 - s * 10)
  ctx.lineTo(24, 98 - s * 10)
  ctx.moveTo(110, 130)
  ctx.lineTo(148, 108 + s * 10)
  ctx.lineTo(160, 104 + s * 10)
  ctx.stroke()
  ball(85, 130, 32)
  ctx.fillStyle = '#1f2937'
  for (const y of [118, 134, 150]) {
    circle(ctx, 85, y, 4)
    ctx.fill()
  }
  ball(85, 78, 26)
  // Face: coal eyes, carrot nose, smile.
  ctx.fillStyle = '#111'
  circle(ctx, 80, 72, 3.5)
  ctx.fill()
  circle(ctx, 96, 72, 3.5)
  ctx.fill()
  for (let k = 0; k < 5; k++) {
    circle(ctx, 78 + k * 6, 88 + Math.sin((k / 4) * Math.PI) * 4, 2)
    ctx.fill()
  }
  ctx.fillStyle = '#f97316'
  ctx.beginPath()
  ctx.moveTo(90, 78)
  ctx.lineTo(124, 84)
  ctx.lineTo(90, 86)
  ctx.closePath()
  ctx.fill()
  // Scarf.
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.roundRect(60, 98, 50, 12, 6)
  ctx.fill()
  ctx.fillRect(66, 104, 12, 34 + s * 4)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(66, 118, 12, 3)
  // Top hat.
  ctx.fillStyle = '#111827'
  ctx.fillRect(58, 52, 54, 7)
  ctx.fillRect(66, 18, 38, 36)
  ctx.fillStyle = color2
  ctx.fillRect(66, 42, 38, 7)
}

/** Santa walking with his sack over his shoulder. */
function santaWalking(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  ctx.translate(0, Math.abs(Math.cos(p)) * -4)
  // Sack behind.
  const sk = ctx.createRadialGradient(56, 70, 8, 60, 84, 60)
  sk.addColorStop(0, shade(color2, 0.25))
  sk.addColorStop(1, shade(color2, -0.25))
  ctx.fillStyle = sk
  ctx.beginPath()
  ctx.ellipse(58, 88, 48, 56, -0.3, 0, TAU)
  ctx.fill()
  present(ctx, 30, 34, 24, 20, '#16a34a', '#facc15')
  present(ctx, 58, 30, 22, 22, '#2563eb', '#f8fafc')
  // Legs and boots.
  const [ax, ay] = limb(ctx, 92, 196, 34, 30, s * 0.45, Math.max(0, -s) * 0.5, 22, shade(color, -0.1))
  const [bx, by] = limb(ctx, 116, 196, 34, 30, -s * 0.45, Math.max(0, s) * 0.5, 22, color)
  ctx.fillStyle = '#111'
  for (const [x, y] of [[ax, ay], [bx, by]]) {
    ctx.beginPath()
    ctx.roundRect(x - 14, y - 10, 34, 22, 8)
    ctx.fill()
  }
  // Round body, belt and fur trim.
  const g = ctx.createRadialGradient(100, 140, 10, 106, 150, 66)
  g.addColorStop(0, shade(color, 0.2))
  g.addColorStop(1, shade(color, -0.25))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(106, 152, 50, 58, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = FUR
  ctx.fillRect(100, 98, 14, 108)
  ctx.beginPath()
  ctx.roundRect(56, 196, 100, 14, 7)
  ctx.fill()
  ctx.fillStyle = '#111'
  ctx.fillRect(56, 150, 100, 14)
  ctx.fillStyle = '#facc15'
  ctx.fillRect(98, 147, 20, 20)
  ctx.fillStyle = '#111'
  ctx.fillRect(103, 152, 10, 10)
  // Head: rosy face, big beard, hat.
  ctx.fillStyle = SKIN
  circle(ctx, 114, 70, 24)
  ctx.fill()
  ctx.fillStyle = FUR
  ctx.beginPath()
  ctx.moveTo(88, 72)
  ctx.quadraticCurveTo(92, 124, 118, 128)
  ctx.quadraticCurveTo(146, 120, 140, 72)
  ctx.quadraticCurveTo(114, 88, 88, 72)
  ctx.fill()
  ellipse(ctx, 124, 80, 12, 6)
  ctx.fill()
  ctx.fillStyle = '#f87171'
  circle(ctx, 130, 74, 6)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 124, 64, 3)
  ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(88, 56)
  ctx.quadraticCurveTo(100, 18, 136, 30)
  ctx.quadraticCurveTo(152, 40, 150, 62)
  ctx.lineTo(140, 56)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = FUR
  ctx.beginPath()
  ctx.roundRect(86, 50, 58, 13, 6)
  ctx.fill()
  circle(ctx, 152, 64, 8)
  ctx.fill()
  // Arm over the shoulder holding the sack, the other swinging.
  ctx.strokeStyle = shade(color, -0.05)
  ctx.lineWidth = 18
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(94, 110)
  ctx.lineTo(78, 84)
  ctx.lineTo(80, 60)
  ctx.moveTo(128, 112)
  ctx.lineTo(146 + s * 10, 150)
  ctx.stroke()
  ctx.fillStyle = '#111'
  circle(ctx, 80, 56, 9)
  ctx.fill()
  circle(ctx, 148 + s * 10, 156, 9)
  ctx.fill()
}

/** A mother hen strutting, head bobbing. */
function hen(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const bob = Math.sin(p * 2) * 5
  // Legs.
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  for (const [x, a] of [[92, s * 0.4], [110, -s * 0.4]] as const) {
    ctx.beginPath()
    ctx.moveTo(x, 132)
    ctx.lineTo(x + Math.sin(a) * 34, 166)
    ctx.lineTo(x + Math.sin(a) * 34 + 12, 168)
    ctx.stroke()
  }
  // Tail feathers.
  ctx.fillStyle = shade(color, -0.2)
  ctx.beginPath()
  ctx.moveTo(52, 100)
  ctx.quadraticCurveTo(22, 50, 34, 30)
  ctx.quadraticCurveTo(52, 60, 70, 84)
  ctx.closePath()
  ctx.fill()
  // Plump body and wing.
  const g = ctx.createRadialGradient(100, 90, 10, 100, 104, 64)
  g.addColorStop(0, shade(color, 0.25))
  g.addColorStop(1, shade(color, -0.15))
  ctx.fillStyle = g
  ellipse(ctx, 100, 104, 56, 38, -0.1)
  ctx.fill()
  ctx.fillStyle = shade(color, -0.12)
  ellipse(ctx, 92, 100, 32, 20, -0.25)
  ctx.fill()
  ctx.strokeStyle = shade(color, -0.3)
  ctx.lineWidth = 2
  for (let k = 0; k < 3; k++) {
    ctx.beginPath()
    ctx.arc(80 + k * 12, 104, 10, 0.2, Math.PI - 0.2)
    ctx.stroke()
  }
  // Neck, head, comb and wattle.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(130, 92)
  ctx.quadraticCurveTo(140, 70, 146, 52 + bob)
  ctx.lineTo(160, 60 + bob)
  ctx.quadraticCurveTo(156, 86, 150, 104)
  ctx.closePath()
  ctx.fill()
  circle(ctx, 152, 52 + bob, 17)
  ctx.fill()
  ctx.fillStyle = color2
  for (const [x, y, r] of [[142, 34, 7], [152, 30, 8], [162, 36, 6]]) {
    circle(ctx, x, y + bob, r)
    ctx.fill()
  }
  ellipse(ctx, 166, 70 + bob, 5, 8)
  ctx.fill()
  ctx.fillStyle = '#f59e0b'
  ctx.beginPath()
  ctx.moveTo(166, 50 + bob)
  ctx.lineTo(182, 56 + bob)
  ctx.lineTo(166, 60 + bob)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 156, 48 + bob, 3)
  ctx.fill()
}

/** A fluffy chick hurrying after its mother. */
function chick(ctx: Ctx, f: number, frames: number) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  for (const [x, a] of [[40, s * 0.5], [50, -s * 0.5]] as const) {
    ctx.beginPath()
    ctx.moveTo(x, 62)
    ctx.lineTo(x + Math.sin(a) * 14, 76)
    ctx.stroke()
  }
  const g = ctx.createRadialGradient(40, 40, 4, 44, 46, 30)
  g.addColorStop(0, '#fef9c3')
  g.addColorStop(1, '#facc15')
  ctx.fillStyle = g
  ellipse(ctx, 44, 48, 26, 20)
  ctx.fill()
  circle(ctx, 62, 30 + Math.sin(p * 2) * 2, 15)
  ctx.fill()
  ctx.fillStyle = '#eab308'
  ellipse(ctx, 38, 46, 12, 7, -0.3 + s * 0.2)
  ctx.fill()
  ctx.fillStyle = '#f97316'
  ctx.beginPath()
  ctx.moveTo(74, 28)
  ctx.lineTo(84, 32)
  ctx.lineTo(74, 36)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 66, 26, 2.5)
  ctx.fill()
}

function vehicleWheel(ctx: Ctx, x: number, y: number, r: number, turn: number) {
  ctx.fillStyle = '#111827'
  circle(ctx, x, y, r)
  ctx.fill()
  ctx.fillStyle = '#cbd5e1'
  circle(ctx, x, y, r * 0.5)
  ctx.fill()
  ctx.strokeStyle = '#64748b'
  ctx.lineWidth = 3
  for (let k = 0; k < 3; k++) {
    const a = turn + (k * TAU) / 3
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5)
    ctx.stroke()
  }
}

/** An ice cream van with a giant cone on the roof and a serving window. */
function iceCreamTruck(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const turn = (f / frames) * TAU
  // Cone on the roof.
  ctx.fillStyle = '#d97706'
  ctx.beginPath()
  ctx.moveTo(150, 54)
  ctx.lineTo(196, 54)
  ctx.lineTo(173, 104)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#92400e'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(158, 62)
  ctx.lineTo(186, 84)
  ctx.moveTo(188, 62)
  ctx.lineTo(160, 84)
  ctx.stroke()
  ctx.fillStyle = color2
  circle(ctx, 162, 44, 18)
  ctx.fill()
  circle(ctx, 184, 44, 18)
  ctx.fill()
  circle(ctx, 173, 28, 18)
  ctx.fill()
  ctx.fillStyle = '#dc2626'
  circle(ctx, 176, 10, 7)
  ctx.fill()
  // Body.
  const g = ctx.createLinearGradient(0, 80, 0, 190)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(1, '#cbd5e1')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(20, 186)
  ctx.lineTo(20, 96)
  ctx.quadraticCurveTo(20, 86, 32, 86)
  ctx.lineTo(262, 86)
  ctx.lineTo(262, 186)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(262, 104)
  ctx.lineTo(306, 104)
  ctx.lineTo(340, 140)
  ctx.lineTo(344, 186)
  ctx.lineTo(262, 186)
  ctx.closePath()
  ctx.fill()
  // Stripe and serving window with an awning.
  ctx.fillStyle = color
  ctx.fillRect(20, 156, 324, 12)
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(60, 100, 150, 46)
  ctx.fillStyle = '#fde68a'
  ctx.fillRect(66, 106, 138, 34)
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = k % 2 ? '#ffffff' : color
    ctx.beginPath()
    ctx.moveTo(56 + k * 26, 92)
    ctx.lineTo(82 + k * 26, 92)
    ctx.lineTo(82 + k * 26, 104)
    ctx.arc(69 + k * 26, 104, 13, 0, Math.PI)
    ctx.fill()
  }
  // Cab window.
  ctx.fillStyle = '#93c5fd'
  ctx.beginPath()
  ctx.moveTo(272, 112)
  ctx.lineTo(302, 112)
  ctx.lineTo(328, 140)
  ctx.lineTo(272, 140)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#facc15'
  ctx.fillRect(334, 164, 10, 10)
  vehicleWheel(ctx, 78, 188, 24, turn)
  vehicleWheel(ctx, 290, 188, 24, turn)
}

/** A fire engine with a ladder; the lights on top flash between frames. */
function fireTruck(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const turn = (f / frames) * TAU
  const flash = f % 2 === 0
  // Ladder on top.
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(30, 64)
  ctx.lineTo(300, 64)
  ctx.moveTo(30, 82)
  ctx.lineTo(300, 82)
  for (let x = 40; x < 300; x += 22) {
    ctx.moveTo(x, 64)
    ctx.lineTo(x, 82)
  }
  ctx.stroke()
  // Body.
  const g = ctx.createLinearGradient(0, 86, 0, 176)
  g.addColorStop(0, shade(color, 0.15))
  g.addColorStop(1, shade(color, -0.25))
  ctx.fillStyle = g
  ctx.fillRect(20, 88, 300, 88)
  ctx.beginPath()
  ctx.moveTo(320, 176)
  ctx.lineTo(320, 70)
  ctx.lineTo(372, 70)
  ctx.lineTo(400, 120)
  ctx.lineTo(404, 176)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#93c5fd'
  ctx.beginPath()
  ctx.moveTo(332, 80)
  ctx.lineTo(366, 80)
  ctx.lineTo(388, 118)
  ctx.lineTo(332, 118)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#e2e8f0'
  ctx.fillRect(20, 130, 300, 8)
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = shade(color, -0.35)
    ctx.fillRect(40 + k * 68, 96, 54, 28)
  }
  // Hose reel.
  ctx.fillStyle = '#facc15'
  circle(ctx, 290, 150, 14)
  ctx.fill()
  // Flashing lights on the cab roof.
  for (const [x, on] of [[336, flash], [362, !flash]] as const) {
    if (on) glow(ctx, x, 64, 26, color2, 0.9)
    ctx.fillStyle = on ? '#ffffff' : shade(color2, -0.4)
    ctx.beginPath()
    ctx.roundRect(x - 9, 56, 18, 12, 4)
    ctx.fill()
  }
  vehicleWheel(ctx, 80, 178, 24, turn)
  vehicleWheel(ctx, 250, 178, 24, turn)
  vehicleWheel(ctx, 360, 178, 24, turn)
}

/** A low race car with a number and a spoiler. */
function raceCar(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const turn = (f / frames) * TAU
  // Speed lines behind.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 3
  for (const y of [50, 66, 82]) {
    ctx.beginPath()
    ctx.moveTo(2 + (f % 2) * 6, y)
    ctx.lineTo(30, y)
    ctx.stroke()
  }
  const g = ctx.createLinearGradient(0, 30, 0, 100)
  g.addColorStop(0, shade(color, 0.3))
  g.addColorStop(1, shade(color, -0.25))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(40, 96)
  ctx.lineTo(40, 60)
  ctx.lineTo(110, 54)
  ctx.lineTo(140, 30)
  ctx.lineTo(196, 30)
  ctx.lineTo(220, 56)
  ctx.lineTo(290, 70)
  ctx.lineTo(296, 96)
  ctx.closePath()
  ctx.fill()
  // Spoiler.
  ctx.fillRect(34, 30, 34, 8)
  ctx.fillRect(48, 36, 6, 24)
  ctx.fillStyle = '#93c5fd'
  ctx.beginPath()
  ctx.moveTo(146, 36)
  ctx.lineTo(192, 36)
  ctx.lineTo(210, 56)
  ctx.lineTo(134, 56)
  ctx.closePath()
  ctx.fill()
  // Number roundel and stripe.
  ctx.fillStyle = color2
  ctx.fillRect(40, 70, 256, 6)
  ctx.fillStyle = '#ffffff'
  circle(ctx, 112, 76, 16)
  ctx.fill()
  ctx.fillStyle = '#111'
  ctx.font = 'bold 22px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('7', 112, 77)
  vehicleWheel(ctx, 86, 98, 20, turn)
  vehicleWheel(ctx, 244, 98, 20, turn)
}

/** A marching band drummer in a tall hat, sticks hitting the drum. */
function drummer(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  // Legs, knees high.
  const [ax, ay] = limb(ctx, 82, 186, 36, 36, Math.max(0, s) * 1.1, -Math.max(0, s) * 1.2, 15, '#f8fafc')
  const [bx, by] = limb(ctx, 100, 186, 36, 36, Math.max(0, -s) * 1.1, -Math.max(0, -s) * 1.2, 15, '#e2e8f0')
  ctx.fillStyle = '#111'
  ellipse(ctx, ax + 6, ay + 2, 12, 6)
  ctx.fill()
  ellipse(ctx, bx + 6, by + 2, 12, 6)
  ctx.fill()
  // Jacket with braid.
  const g = ctx.createLinearGradient(0, 100, 0, 192)
  g.addColorStop(0, shade(color, 0.15))
  g.addColorStop(1, shade(color, -0.25))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(66, 100, 52, 92, 10)
  ctx.fill()
  ctx.strokeStyle = color2
  ctx.lineWidth = 3
  for (let k = 0; k < 4; k++) {
    ctx.beginPath()
    ctx.moveTo(72, 112 + k * 14)
    ctx.lineTo(112, 112 + k * 14)
    ctx.stroke()
  }
  // Head and tall plumed hat.
  ctx.fillStyle = SKIN
  circle(ctx, 96, 80, 18)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 103, 78, 2.5)
  ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(78, 22, 36, 50, 6)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.fillRect(78, 62, 36, 6)
  ctx.fillRect(78, 22, 36, 5)
  ctx.fillStyle = '#ffffff'
  ellipse(ctx, 96, 14, 7, 14)
  ctx.fill()
  ctx.strokeStyle = color2
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(80, 70)
  ctx.quadraticCurveTo(96, 96, 112, 70)
  ctx.stroke()
  // Drum in front.
  ctx.fillStyle = '#f8fafc'
  ellipse(ctx, 132, 150, 30, 10)
  ctx.fill()
  const d = ctx.createLinearGradient(102, 0, 162, 0)
  d.addColorStop(0, shade(color2, -0.2))
  d.addColorStop(0.5, shade(color2, 0.3))
  d.addColorStop(1, shade(color2, -0.3))
  ctx.fillStyle = d
  ctx.fillRect(102, 150, 60, 40)
  ellipse(ctx, 132, 190, 30, 10)
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let k = 0; k < 5; k++) {
    ctx.moveTo(104 + k * 13, 152)
    ctx.lineTo(110 + k * 13, 188)
  }
  ctx.stroke()
  // Arms and sticks, one up one down.
  const hit = Math.sin(p * 2)
  ctx.strokeStyle = shade(color, -0.05)
  ctx.lineWidth = 12
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(100, 112)
  ctx.lineTo(124, 132 - hit * 10)
  ctx.moveTo(84, 114)
  ctx.lineTo(112, 136 + hit * 10)
  ctx.stroke()
  ctx.strokeStyle = '#d6b37a'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(124, 132 - hit * 10)
  ctx.lineTo(146, 140 - hit * 22)
  ctx.moveTo(112, 136 + hit * 10)
  ctx.lineTo(136, 144 + hit * 4)
  ctx.stroke()
}

/** A scarecrow shuffling along, straw sticking out, patched clothes, arms still out straight. */
function scarecrow(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  ctx.translate(100, 280)
  ctx.rotate(s * 0.06)
  ctx.translate(-100, -280)
  const straw = (x: number, y: number, dir: number) => {
    ctx.strokeStyle = '#eab308'
    ctx.lineWidth = 3
    for (let k = 0; k < 5; k++) {
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + dir * (8 + k * 3), y + (k - 2) * 5)
      ctx.stroke()
    }
  }
  // Legs in patched trousers.
  const [ax, ay] = limb(ctx, 88, 192, 40, 40, s * 0.35, 0.1, 18, '#1e3a8a')
  const [bx, by] = limb(ctx, 110, 192, 40, 40, -s * 0.35, 0.1, 18, '#1d4ed8')
  straw(ax, ay + 8, -1)
  straw(bx, by + 8, 1)
  // Arms out straight like on the pole.
  ctx.strokeStyle = color
  ctx.lineWidth = 18
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(30, 124 + s * 4)
  ctx.lineTo(170, 124 - s * 4)
  ctx.stroke()
  straw(24, 124 + s * 4, -1)
  straw(176, 124 - s * 4, 1)
  // Plaid shirt.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(70, 110, 60, 88, 8)
  ctx.fill()
  ctx.strokeStyle = shade(color, -0.35)
  ctx.lineWidth = 3
  for (let k = 0; k < 4; k++) {
    ctx.beginPath()
    ctx.moveTo(70, 124 + k * 20)
    ctx.lineTo(130, 124 + k * 20)
    ctx.moveTo(82 + k * 14, 110)
    ctx.lineTo(82 + k * 14, 198)
    ctx.stroke()
  }
  ctx.fillStyle = color2
  ctx.fillRect(108, 160, 16, 16)
  // Sack head with a stitched smile.
  ctx.fillStyle = '#d6b37a'
  ctx.beginPath()
  ctx.ellipse(100, 80, 30, 32, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#111'
  for (const x of [88, 112]) {
    ctx.beginPath()
    ctx.moveTo(x - 7, 72)
    ctx.lineTo(x + 7, 72)
    ctx.lineTo(x, 82)
    ctx.closePath()
    ctx.fill()
  }
  ctx.strokeStyle = '#111'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(100, 88, 14, 0.3, Math.PI - 0.3)
  for (let k = 0; k < 5; k++) {
    const a = 0.4 + k * 0.58
    ctx.moveTo(100 + Math.cos(a) * 11, 88 + Math.sin(a) * 11)
    ctx.lineTo(100 + Math.cos(a) * 17, 88 + Math.sin(a) * 17)
  }
  ctx.stroke()
  // Floppy hat.
  ctx.fillStyle = '#78350f'
  ellipse(ctx, 100, 56, 46, 9)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(74, 56)
  ctx.quadraticCurveTo(76, 20, 104, 22)
  ctx.quadraticCurveTo(128, 24, 126, 56)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.fillRect(76, 44, 50, 7)
}

/** A love letter flying on little wings, sealed with a heart. */
function loveLetter(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  ctx.translate(0, 30)
  const flap = Math.sin((f / frames) * TAU)
  const bob = flap * 4
  const wing = (dir: number, far: boolean) => {
    ctx.fillStyle = far ? '#e2e8f0' : '#ffffff'
    ctx.beginPath()
    ctx.moveTo(100, 54 + bob)
    ctx.bezierCurveTo(100 + dir * 20, 10 - flap * 30, 100 + dir * 70, 8 - flap * 36, 100 + dir * 84, 26 - flap * 34)
    ctx.bezierCurveTo(100 + dir * 60, 34 - flap * 20, 100 + dir * 40, 44, 100, 64 + bob)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 1.5
    for (let k = 1; k < 4; k++) {
      ctx.beginPath()
      ctx.moveTo(100 + dir * 12 * k, 52 + bob - k * 4)
      ctx.lineTo(100 + dir * 18 * k, 34 - flap * 22 - k * 2)
      ctx.stroke()
    }
  }
  wing(-1, true)
  // Envelope.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(40, 50 + bob, 120, 76, 6)
  ctx.fill()
  ctx.strokeStyle = shade(color, -0.25)
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(42, 122 + bob)
  ctx.lineTo(100, 86 + bob)
  ctx.lineTo(158, 122 + bob)
  ctx.stroke()
  ctx.fillStyle = shade(color, -0.08)
  ctx.beginPath()
  ctx.moveTo(40, 54 + bob)
  ctx.lineTo(100, 98 + bob)
  ctx.lineTo(160, 54 + bob)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  // Wax heart seal.
  ctx.fillStyle = color2
  heartPath(ctx, 100, 96 + bob, 14)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  circle(ctx, 95, 90 + bob, 3)
  ctx.fill()
  wing(1, false)
}

/** A seahorse standing upright, curled tail, back fin fluttering. */
function seahorse(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const sway = Math.sin(p) * 3
  ctx.translate(sway, 0)
  const g = ctx.createLinearGradient(40, 0, 120, 0)
  g.addColorStop(0, shade(color, 0.3))
  g.addColorStop(1, shade(color, -0.25))
  // Curled tail.
  ctx.strokeStyle = color
  ctx.lineWidth = 12
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(78, 150)
  ctx.quadraticCurveTo(70, 196, 92, 204)
  ctx.quadraticCurveTo(112, 206, 108, 188)
  ctx.quadraticCurveTo(104, 176, 92, 184)
  ctx.stroke()
  // Body: belly bulging forward, back straight.
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(62, 40)
  ctx.quadraticCurveTo(46, 90, 66, 150)
  ctx.lineTo(90, 154)
  ctx.quadraticCurveTo(118, 112, 98, 70)
  ctx.quadraticCurveTo(92, 50, 84, 40)
  ctx.closePath()
  ctx.fill()
  // Belly ridges.
  ctx.strokeStyle = shade(color, 0.35)
  ctx.lineWidth = 2
  for (let k = 0; k < 6; k++) {
    ctx.beginPath()
    ctx.moveTo(82 + k * 2, 78 + k * 12)
    ctx.lineTo(100 - Math.abs(k - 2) * 2, 80 + k * 12)
    ctx.stroke()
  }
  // Back fin flutters.
  ctx.fillStyle = rgba(color2, 0.85)
  ctx.beginPath()
  ctx.moveTo(56, 86)
  ctx.quadraticCurveTo(34 - Math.sin(p * 2) * 8, 100, 54, 124)
  ctx.closePath()
  ctx.fill()
  // Head with a long snout and crown.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(76, 34, 20, 16, -0.4, 0, TAU)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(84, 30)
  ctx.lineTo(122, 40)
  ctx.lineTo(122, 50)
  ctx.lineTo(86, 46)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = color2
  for (const [x, y] of [[62, 18], [70, 14], [78, 16]]) {
    ctx.beginPath()
    ctx.moveTo(x - 4, y + 6)
    ctx.lineTo(x, y - 6)
    ctx.lineTo(x + 4, y + 6)
    ctx.fill()
  }
  ctx.fillStyle = '#ffffff'
  circle(ctx, 80, 30, 6)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 82, 30, 3)
  ctx.fill()
}

/** A mermaid swimming, tail flicking, hair streaming behind. */
function mermaid(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  // Hair streaming back.
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(226, 50)
  ctx.bezierCurveTo(190, 20, 150, 50 + s * 8, 120, 46 + s * 12)
  ctx.bezierCurveTo(150, 66 + s * 6, 190, 74, 222, 74)
  ctx.closePath()
  ctx.fill()
  // Tail: scales, then a fin that flicks.
  const tailY = 92 + s * 14
  const g = ctx.createLinearGradient(40, 0, 200, 0)
  g.addColorStop(0, shade(color, -0.25))
  g.addColorStop(1, shade(color, 0.2))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(196, 78)
  ctx.bezierCurveTo(150, 72, 100, 84 + s * 6, 60, tailY)
  ctx.lineTo(62, tailY + 14)
  ctx.bezierCurveTo(100, 104 + s * 6, 150, 110, 200, 104)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = shade(color, 0.35)
  ctx.lineWidth = 1.5
  for (let k = 0; k < 6; k++) {
    const x = 90 + k * 18
    ctx.beginPath()
    ctx.arc(x, 92 + s * (6 - k) * 0.8, 7, 0.3, Math.PI - 0.3)
    ctx.stroke()
  }
  ctx.fillStyle = shade(color, 0.1)
  ctx.beginPath()
  ctx.moveTo(64, tailY + 7)
  ctx.bezierCurveTo(40, tailY - 30 - s * 10, 14, tailY - 26 - s * 12, 8, tailY - 22 - s * 14)
  ctx.quadraticCurveTo(30, tailY + 7, 8, tailY + 36 - s * 14)
  ctx.bezierCurveTo(14, tailY + 40, 40, tailY + 44, 64, tailY + 7)
  ctx.fill()
  // Body and arm reaching forward.
  ctx.fillStyle = SKIN
  ctx.beginPath()
  ctx.ellipse(212, 84, 22, 14, -0.1, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = SKIN
  ctx.lineWidth = 9
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(222, 80)
  ctx.quadraticCurveTo(248, 70 + s * 6, 270, 74 - s * 10)
  ctx.stroke()
  // Shell top.
  ctx.fillStyle = color2
  circle(ctx, 210, 88, 7)
  ctx.fill()
  circle(ctx, 224, 87, 7)
  ctx.fill()
  // Head.
  ctx.fillStyle = SKIN
  circle(ctx, 238, 58, 17)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.arc(236, 56, 19, Math.PI * 0.95, Math.PI * 1.9)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 245, 57, 2.5)
  ctx.fill()
  ctx.strokeStyle = '#be123c'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(244, 63, 5, 0.3, Math.PI - 0.6)
  ctx.stroke()
}

/** A little yellow submarine with portholes, periscope and a turning propeller. */
function submarine(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const turn = (f / frames) * Math.PI
  // Propeller.
  ctx.fillStyle = '#64748b'
  ctx.fillRect(22, 84, 18, 8)
  ctx.fillStyle = '#94a3b8'
  const blade = Math.cos(turn * 2) * 26
  ellipse(ctx, 22, 88 - blade / 2, 6, Math.abs(blade / 2) + 2)
  ctx.fill()
  ellipse(ctx, 22, 88 + blade / 2, 6, Math.abs(blade / 2) + 2)
  ctx.fill()
  // Hull.
  const g = ctx.createLinearGradient(0, 40, 0, 136)
  g.addColorStop(0, shade(color, 0.3))
  g.addColorStop(1, shade(color, -0.3))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(140, 90, 104, 44, 0, 0, TAU)
  ctx.fill()
  // Fins.
  ctx.fillStyle = shade(color, -0.2)
  ctx.beginPath()
  ctx.moveTo(48, 70)
  ctx.lineTo(30, 50)
  ctx.lineTo(56, 58)
  ctx.closePath()
  ctx.moveTo(48, 110)
  ctx.lineTo(30, 130)
  ctx.lineTo(56, 122)
  ctx.closePath()
  ctx.fill()
  // Tower and periscope.
  ctx.fillStyle = shade(color, 0.05)
  ctx.beginPath()
  ctx.roundRect(120, 30, 56, 30, 8)
  ctx.fill()
  ctx.strokeStyle = '#475569'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(160, 32)
  ctx.lineTo(160, 6)
  ctx.lineTo(176, 6)
  ctx.stroke()
  // Portholes, lit.
  for (const x of [100, 140, 180]) {
    ctx.fillStyle = '#334155'
    circle(ctx, x, 88, 14)
    ctx.fill()
    ctx.fillStyle = color2
    circle(ctx, x, 88, 10)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    circle(ctx, x - 3, 85, 3)
    ctx.fill()
  }
  // Rivets.
  ctx.fillStyle = shade(color, -0.35)
  for (let k = 0; k < 10; k++) {
    circle(ctx, 70 + k * 16, 118, 2)
    ctx.fill()
  }
}

/** A folded paper crane flapping its angular wings. */
function origamiCrane(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const flap = Math.sin((f / frames) * TAU)
  const light = shade(color, 0.3)
  const dark = shade(color, -0.3)
  const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, fill: string) => {
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.lineTo(cx, cy)
    ctx.closePath()
    ctx.fill()
  }
  // Far wing behind the body.
  tri(104, 80, 136, 80, 124 + 4 * flap, 80 - 58 * flap, dark)
  // Tail and neck points rising from the ends, a little head at the tip.
  tri(70, 84, 86, 94, 18, 34, light)
  tri(136, 80, 152, 90, 190, 32, light)
  tri(190, 32, 210, 44, 186, 42, color)
  // Body: a folded diamond, darker underneath.
  tri(70, 84, 110, 68, 150, 84, color)
  tri(70, 84, 110, 102, 150, 84, dark)
  // Near wing, its fold and edge in the second colour.
  tri(92, 80, 132, 80, 98 - 8 * flap, 80 - 68 * flap, light)
  ctx.strokeStyle = rgba(color2, 0.8)
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(92, 80)
  ctx.lineTo(132, 80)
  ctx.lineTo(98 - 8 * flap, 80 - 68 * flap)
  ctx.closePath()
  ctx.moveTo(112, 80)
  ctx.lineTo(98 - 8 * flap, 80 - 68 * flap)
  ctx.stroke()
}

/** A round pufferfish covered in spikes, little fins whirring. */
function pufferfish(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  // Tail.
  ctx.fillStyle = shade(color, -0.15)
  ctx.beginPath()
  ctx.moveTo(40, 70)
  ctx.lineTo(10, 50 + Math.sin(p) * 8)
  ctx.lineTo(10, 90 + Math.sin(p) * 8)
  ctx.closePath()
  ctx.fill()
  // Spikes all round.
  ctx.fillStyle = shade(color, -0.3)
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * TAU
    ctx.beginPath()
    ctx.moveTo(84 + Math.cos(a - 0.12) * 40, 70 + Math.sin(a - 0.12) * 38)
    ctx.lineTo(84 + Math.cos(a) * 54, 70 + Math.sin(a) * 52)
    ctx.lineTo(84 + Math.cos(a + 0.12) * 40, 70 + Math.sin(a + 0.12) * 38)
    ctx.fill()
  }
  // Body: darker back, pale belly, spots.
  const g = ctx.createLinearGradient(0, 30, 0, 110)
  g.addColorStop(0, shade(color, -0.1))
  g.addColorStop(0.6, shade(color, 0.25))
  g.addColorStop(1, '#fef9c3')
  ctx.fillStyle = g
  ellipse(ctx, 84, 70, 44, 42)
  ctx.fill()
  ctx.fillStyle = shade(color, -0.35)
  for (const [x, y] of [[66, 46], [84, 40], [100, 50], [58, 62], [76, 58]]) {
    circle(ctx, x, y, 3.5)
    ctx.fill()
  }
  // Side fin whirring.
  ctx.fillStyle = rgba(color2, 0.8)
  ellipse(ctx, 86, 82, 14, 6 + Math.abs(Math.sin(p * 2)) * 6, 0.6)
  ctx.fill()
  // Big eye and pouty mouth.
  ctx.fillStyle = '#ffffff'
  circle(ctx, 108, 58, 11)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 111, 58, 6)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  circle(ctx, 113, 55, 2)
  ctx.fill()
  ctx.fillStyle = color2
  ellipse(ctx, 128, 76, 5, 6)
  ctx.fill()
}

/** A koi carp gliding, its tail sweeping; patches in the second colour. */
function koi(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  // Long flowing tail.
  ctx.fillStyle = rgba('#ffffff', 0.85)
  ctx.beginPath()
  ctx.moveTo(60, 56)
  ctx.bezierCurveTo(30, 40 + s * 10, 12, 20 + s * 18, 4, 30 + s * 20)
  ctx.quadraticCurveTo(26, 56 + s * 8, 4, 84 + s * 20)
  ctx.bezierCurveTo(12, 92 + s * 18, 30, 76 + s * 10, 60, 64)
  ctx.closePath()
  ctx.fill()
  // White body.
  const g = ctx.createLinearGradient(0, 30, 0, 90)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(1, '#e2e8f0')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(56, 60)
  ctx.bezierCurveTo(90, 26, 160, 28, 196, 52)
  ctx.quadraticCurveTo(206, 60, 196, 70)
  ctx.bezierCurveTo(160, 92, 90, 92, 56, 60)
  ctx.fill()
  // Coloured patches clipped to the body.
  ctx.save()
  ctx.clip()
  ctx.fillStyle = color
  ellipse(ctx, 120, 40, 34, 18, 0.2)
  ctx.fill()
  ellipse(ctx, 176, 52, 22, 14)
  ctx.fill()
  ctx.fillStyle = color2
  ellipse(ctx, 86, 54, 14, 10)
  ctx.fill()
  ctx.restore()
  // Fins and whiskers.
  ctx.fillStyle = rgba('#ffffff', 0.8)
  ctx.beginPath()
  ctx.moveTo(150, 76)
  ctx.quadraticCurveTo(140, 104 + s * 6, 124, 100)
  ctx.lineTo(136, 78)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(140, 36)
  ctx.quadraticCurveTo(120, 18, 100, 34)
  ctx.fill()
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(200, 66)
  ctx.quadraticCurveTo(210, 76, 206, 84)
  ctx.stroke()
  ctx.fillStyle = '#111'
  circle(ctx, 188, 54, 3)
  ctx.fill()
}

/** A striped candy cane tumbling; each frame turned another way. */
function candyCane(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  ctx.translate(60, 60)
  ctx.rotate(f * 1.1)
  ctx.translate(-60, -60)
  const path = () => {
    ctx.beginPath()
    ctx.moveTo(70, 108)
    ctx.lineTo(70, 36)
    ctx.arc(52, 36, 18, 0, Math.PI, true)
    ctx.lineTo(34, 46)
  }
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 14
  path()
  ctx.stroke()
  ctx.strokeStyle = color
  ctx.lineWidth = 14
  ctx.setLineDash([7, 9])
  path()
  ctx.stroke()
  ctx.setLineDash([])
  ctx.strokeStyle = rgba(color2, 0.7)
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(66, 104)
  ctx.lineTo(66, 40)
  ctx.stroke()
}

/** A gold coin spinning as it falls: face on, turning, edge on, turning. */
function goldCoin(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const w = Math.cos((f / frames) * Math.PI)
  const rx = Math.max(4, Math.abs(w) * 38)
  ctx.fillStyle = shade(color, -0.35)
  ellipse(ctx, 50 + (w < 0 ? -3 : 3), 50, rx, 38)
  ctx.fill()
  const g = ctx.createLinearGradient(10, 10, 90, 90)
  g.addColorStop(0, shade(color, 0.45))
  g.addColorStop(0.5, color)
  g.addColorStop(1, shade(color, -0.2))
  ctx.fillStyle = g
  ellipse(ctx, 50, 50, rx, 38)
  ctx.fill()
  if (rx > 14) {
    ctx.strokeStyle = shade(color, -0.25)
    ctx.lineWidth = 3
    ellipse(ctx, 50, 50, rx * 0.78, 30)
    ctx.stroke()
    ctx.save()
    ctx.translate(50, 50)
    ctx.scale(rx / 38, 1)
    ctx.fillStyle = shade(color2, -0.1)
    ctx.font = 'bold 34px Georgia, serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(f % 4 < 2 ? '$' : '★', 0, 2)
    ctx.restore()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ellipse(ctx, 50 - rx * 0.4, 30, rx * 0.18, 6, -0.5)
  ctx.fill()
}

/** Wrapped sweets: a twist wrapper, a lollipop, a candy corn and a peppermint. */
function candy(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  ctx.translate(50, 50)
  ctx.rotate(f * 0.9)
  if (f % 4 === 0) {
    ctx.fillStyle = color2
    for (const d of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(d * 18, 0)
      ctx.lineTo(d * 40, -16)
      ctx.lineTo(d * 36, 0)
      ctx.lineTo(d * 40, 16)
      ctx.closePath()
      ctx.fill()
    }
    const g = ctx.createRadialGradient(-6, -6, 2, 0, 0, 22)
    g.addColorStop(0, shade(color, 0.5))
    g.addColorStop(1, color)
    ctx.fillStyle = g
    ellipse(ctx, 0, 0, 22, 16)
    ctx.fill()
  } else if (f % 4 === 1) {
    ctx.strokeStyle = '#f8fafc'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(0, 14)
    ctx.lineTo(0, 46)
    ctx.stroke()
    ctx.fillStyle = color
    circle(ctx, 0, 0, 22)
    ctx.fill()
    ctx.strokeStyle = color2
    ctx.lineWidth = 5
    ctx.beginPath()
    for (let a = 0; a < 4 * Math.PI; a += 0.2) ctx.lineTo(Math.cos(a) * a * 1.6, Math.sin(a) * a * 1.6)
    ctx.stroke()
  } else if (f % 4 === 2) {
    const band = (y0: number, y1: number, c: string) => {
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.moveTo(-20 * (1 - (y0 + 26) / 52), y0)
      ctx.lineTo(20 * (1 - (y0 + 26) / 52), y0)
      ctx.lineTo(20 * (1 - (y1 + 26) / 52), y1)
      ctx.lineTo(-20 * (1 - (y1 + 26) / 52), y1)
      ctx.closePath()
      ctx.fill()
    }
    // Upside down so the wide end is at the bottom: yellow, orange, white tip.
    ctx.scale(1, -1)
    band(-26, -6, '#facc15')
    band(-6, 12, '#f97316')
    band(12, 26, '#ffffff')
  } else {
    ctx.fillStyle = '#ffffff'
    circle(ctx, 0, 0, 24)
    ctx.fill()
    ctx.fillStyle = color
    for (let k = 0; k < 6; k++) {
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, 24, (k * TAU) / 6, (k * TAU) / 6 + 0.5)
      ctx.closePath()
      ctx.fill()
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'
    ctx.lineWidth = 2
    circle(ctx, 0, 0, 24)
    ctx.stroke()
  }
}

/** A present drifting down under a little parachute, swinging. */
function parachutePresent(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const swing = Math.sin((f / frames) * TAU) * 0.18
  ctx.translate(80, 30)
  ctx.rotate(swing)
  ctx.translate(-80, -30)
  // Canopy with panels.
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = k % 2 ? color2 : '#ffffff'
    ctx.beginPath()
    ctx.moveTo(80, 70)
    ctx.arc(80, 70, 66, Math.PI + (k * Math.PI) / 4, Math.PI + ((k + 1) * Math.PI) / 4)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  for (let k = 0; k < 4; k++) {
    ctx.beginPath()
    ctx.arc(30 + k * 33.3, 70, 16.6, Math.PI, 0, true)
    ctx.fill()
  }
  // Strings.
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (const x of [16, 48, 112, 144]) {
    ctx.moveTo(x, 70)
    ctx.lineTo(80 + (x - 80) * 0.35, 142)
  }
  ctx.stroke()
  present(ctx, 54, 140, 52, 46, color, color2)
}

/** A sparkler held up from the ground, throwing sparks. */
function sparkler(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  // Wire.
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(60, 196)
  ctx.lineTo(60, 76)
  ctx.stroke()
  ctx.strokeStyle = '#475569'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(60, 130)
  ctx.lineTo(60, 68)
  ctx.stroke()
  // Burning tip.
  glow(ctx, 60, 66, 46, color, 0.9)
  glow(ctx, 60, 66, 18, '#ffffff', 1)
  // Sparks: different every frame.
  let seed = f * 9301 + 49297
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  ctx.lineCap = 'round'
  for (let k = 0; k < 26; k++) {
    const a = rnd() * TAU
    const r0 = 6 + rnd() * 10
    const r1 = r0 + 12 + rnd() * 26
    ctx.strokeStyle = rnd() < 0.5 ? '#ffffff' : rnd() < 0.5 ? color : color2
    ctx.lineWidth = 1.5 + rnd() * 1.5
    ctx.beginPath()
    ctx.moveTo(60 + Math.cos(a) * r0, 66 + Math.sin(a) * r0)
    ctx.lineTo(60 + Math.cos(a) * r1, 66 + Math.sin(a) * r1)
    ctx.stroke()
    if (rnd() < 0.4) {
      const bx = 60 + Math.cos(a) * r1
      const by = 66 + Math.sin(a) * r1
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.lineTo(bx + Math.cos(a + 0.8) * 8, by + Math.sin(a + 0.8) * 8)
      ctx.moveTo(bx, by)
      ctx.lineTo(bx + Math.cos(a - 0.8) * 8, by + Math.sin(a - 0.8) * 8)
      ctx.stroke()
    }
  }
}

/** A floating candle, wax dripping, flame flickering. */
function floatingCandle(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const lean = [0, 0.08, -0.06, 0.04][f % 4]
  const tall = [1, 1.12, 0.94, 1.06][f % 4]
  glow(ctx, 40, 40, 40, color2, 0.6)
  // Body.
  const g = ctx.createLinearGradient(20, 0, 60, 0)
  g.addColorStop(0, shade(color, -0.15))
  g.addColorStop(0.4, shade(color, 0.3))
  g.addColorStop(1, shade(color, -0.25))
  ctx.fillStyle = g
  ctx.fillRect(24, 60, 32, 100)
  ellipse(ctx, 40, 160, 16, 5)
  ctx.fill()
  // Drips.
  ctx.fillStyle = shade(color, 0.2)
  ellipse(ctx, 40, 60, 16, 5)
  ctx.fill()
  for (const [x, h] of [[28, 18], [46, 28], [53, 12]]) {
    ctx.beginPath()
    ctx.roundRect(x - 3, 60, 6, h, 3)
    ctx.fill()
  }
  // Wick and flame.
  ctx.strokeStyle = '#111'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(40, 58)
  ctx.lineTo(40, 50)
  ctx.stroke()
  ctx.save()
  ctx.translate(40, 52)
  ctx.rotate(lean)
  ctx.scale(1, tall)
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(-11, -6, -6, -24, 0, -34)
  ctx.bezierCurveTo(6, -24, 11, -6, 0, 0)
  ctx.fill()
  ctx.fillStyle = '#fffbeb'
  ctx.beginPath()
  ctx.moveTo(0, -2)
  ctx.bezierCurveTo(-5, -6, -3, -16, 0, -22)
  ctx.bezierCurveTo(3, -16, 5, -6, 0, -2)
  ctx.fill()
  ctx.restore()
}

/** A jack-o'-lantern rolling along, its face turning with it. */
function rollingPumpkin(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  ctx.translate(80, 80)
  ctx.rotate((f / frames) * TAU)
  const g = ctx.createRadialGradient(-16, -18, 8, 0, 0, 70)
  g.addColorStop(0, shade(color, 0.3))
  g.addColorStop(1, shade(color, -0.3))
  ctx.fillStyle = g
  for (const [x, rx] of [[-30, 32], [30, 32], [-12, 34], [12, 34], [0, 34]] as const) {
    ellipse(ctx, x, 4, rx, 58)
    ctx.fill()
  }
  ctx.strokeStyle = shade(color, -0.4)
  ctx.lineWidth = 2
  for (const x of [-26, 0, 26]) {
    ctx.beginPath()
    ctx.ellipse(x * 0.6, 4, Math.abs(x) + 14, 56, 0, -1.2, 1.2)
    ctx.stroke()
  }
  ctx.fillStyle = '#3f6212'
  ctx.beginPath()
  ctx.roundRect(-6, -66, 12, 18, 3)
  ctx.fill()
  // Glowing face.
  glow(ctx, 0, 10, 40, color2, 0.5)
  ctx.fillStyle = color2
  for (const d of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(d * 22, -14)
    ctx.lineTo(d * 8, -14)
    ctx.lineTo(d * 15, -30)
    ctx.closePath()
    ctx.fill()
  }
  ctx.beginPath()
  ctx.moveTo(-30, 12)
  ctx.quadraticCurveTo(0, 46, 30, 12)
  ctx.lineTo(18, 18)
  ctx.lineTo(12, 10)
  ctx.lineTo(4, 20)
  ctx.lineTo(-4, 12)
  ctx.lineTo(-12, 20)
  ctx.lineTo(-20, 12)
  ctx.closePath()
  ctx.fill()
}

// -- peeking over the window sills, eyes in the dark, owls and gulls on the roof ---------------

/** Frames 0–3 of a peeker: looking left, ahead, right, then blinking. */
function peekLook(f: number): { look: number; blink: boolean } {
  return { look: [-1, 0, 1, 0][f % 4], blink: f % 4 === 3 }
}

function peekEyes(ctx: Ctx, x: number, y: number, gap: number, r: number, look: number, blink: boolean, iris = '#111') {
  for (const d of [-1, 1]) {
    const ex = x + d * gap
    if (blink) {
      ctx.strokeStyle = '#111'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(ex, y - r * 0.2, r * 0.9, 0.3, Math.PI - 0.3)
      ctx.stroke()
      continue
    }
    ctx.fillStyle = '#ffffff'
    ellipse(ctx, ex, y, r, r * 1.2)
    ctx.fill()
    ctx.fillStyle = iris
    circle(ctx, ex + look * r * 0.45, y + r * 0.1, r * 0.62)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    circle(ctx, ex + look * r * 0.45 - r * 0.2, y - r * 0.2, r * 0.2)
    ctx.fill()
  }
}

/** A ghost peeking over the sill, little hands gripping it; sill at the bottom of the cell. */
function peekingGhost(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const { look, blink } = peekLook(f)
  glow(ctx, 100, 86, 96, color, 0.25)
  const g = ctx.createLinearGradient(0, 14, 0, 150)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(1, shade(color, -0.12))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(34, 150)
  ctx.lineTo(34, 86)
  ctx.bezierCurveTo(34, 8, 166, 8, 166, 86)
  ctx.lineTo(166, 150)
  ctx.closePath()
  ctx.fill()
  // Eyes as black ovals, a round "oh" mouth and blushing cheeks.
  ctx.fillStyle = '#111'
  for (const d of [-1, 1]) {
    if (blink) {
      ctx.fillRect(100 + d * 24 - 9, 80, 18, 4)
    } else {
      ellipse(ctx, 100 + d * 24 + look * 8, 80, 10, 15)
      ctx.fill()
    }
  }
  ellipse(ctx, 100 + look * 6, 114, 8, 11)
  ctx.fill()
  ctx.fillStyle = rgba(color2, 0.45)
  for (const d of [-1, 1]) {
    ellipse(ctx, 100 + d * 44, 102, 11, 7)
    ctx.fill()
  }
  // Hands over the sill.
  for (const x of [34, 166]) {
    ctx.fillStyle = shade(color, -0.04)
    ellipse(ctx, x, 140, 22, 13)
    ctx.fill()
    ctx.strokeStyle = shade(color, -0.25)
    ctx.lineWidth = 2
    for (const k of [-8, 0, 8]) {
      ctx.beginPath()
      ctx.moveTo(x + k, 132)
      ctx.lineTo(x + k, 146)
      ctx.stroke()
    }
  }
}

/** An elf in a pointed hat peeking over the sill. */
function peekingElf(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const { look, blink } = peekLook(f)
  // Pointed ears.
  ctx.fillStyle = shade(SKIN, -0.05)
  for (const d of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(100 + d * 40, 84)
    ctx.lineTo(100 + d * 76, 60)
    ctx.lineTo(100 + d * 42, 106)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = SKIN
  circle(ctx, 100, 98, 44)
  ctx.fill()
  // Hat flopping over to one side, a bell on the tip.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(52, 76)
  ctx.lineTo(148, 76)
  ctx.quadraticCurveTo(146, 34, 176, 18)
  ctx.quadraticCurveTo(104, 4, 52, 76)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#facc15'
  circle(ctx, 178, 18, 8)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.roundRect(48, 66, 104, 16, 8)
  ctx.fill()
  peekEyes(ctx, 100, 98, 16, 7, look, blink)
  ctx.fillStyle = 'rgba(244,114,182,0.45)'
  for (const d of [-1, 1]) {
    circle(ctx, 100 + d * 28, 112, 7)
    ctx.fill()
  }
  ctx.strokeStyle = '#7c2d12'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(100 + look * 4, 114, 12, 0.25, Math.PI - 0.25)
  ctx.stroke()
  // Hands in green cuffs over the sill.
  for (const x of [46, 154]) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(x - 20, 140, 40, 10, 4)
    ctx.fill()
    ctx.fillStyle = SKIN
    ellipse(ctx, x, 138, 18, 11)
    ctx.fill()
  }
}

/** A cat peeking over the sill, eyes following people, paws on the ledge. */
function peekingCat(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const { look, blink } = peekLook(f)
  ctx.fillStyle = color
  for (const d of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(100 + d * 50, 80)
    ctx.lineTo(100 + d * 40, 24)
    ctx.lineTo(100 + d * 12, 60)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = '#f9a8d4'
  for (const d of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(100 + d * 42, 70)
    ctx.lineTo(100 + d * 39, 38)
    ctx.lineTo(100 + d * 22, 60)
    ctx.closePath()
    ctx.fill()
  }
  const g = ctx.createRadialGradient(90, 80, 10, 100, 98, 64)
  g.addColorStop(0, shade(color, 0.25))
  g.addColorStop(1, shade(color, -0.15))
  ctx.fillStyle = g
  ellipse(ctx, 100, 100, 58, 46)
  ctx.fill()
  // Eyes in the second colour with slit pupils.
  for (const d of [-1, 1]) {
    const ex = 100 + d * 22
    if (blink) {
      ctx.strokeStyle = '#111'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(ex, 90, 10, 0.3, Math.PI - 0.3)
      ctx.stroke()
      continue
    }
    ctx.fillStyle = color2
    ellipse(ctx, ex, 94, 12, 14)
    ctx.fill()
    ctx.fillStyle = '#111'
    ellipse(ctx, ex + look * 5, 94, 3.5, 11)
    ctx.fill()
    ctx.fillStyle = '#fff'
    circle(ctx, ex - 4, 89, 2.5)
    ctx.fill()
  }
  ctx.fillStyle = '#f472b6'
  ctx.beginPath()
  ctx.moveTo(93, 108)
  ctx.lineTo(107, 108)
  ctx.lineTo(100, 116)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = shade(color, -0.45)
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(100, 116)
  ctx.quadraticCurveTo(92, 126, 86, 120)
  ctx.moveTo(100, 116)
  ctx.quadraticCurveTo(108, 126, 114, 120)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'
  ctx.lineWidth = 1.5
  for (const d of [-1, 1]) {
    for (const k of [-1, 0, 1]) {
      ctx.beginPath()
      ctx.moveTo(100 + d * 30, 112 + k * 5)
      ctx.lineTo(100 + d * 74, 106 + k * 9)
      ctx.stroke()
    }
  }
  // Paws on the ledge.
  for (const x of [58, 142]) {
    ctx.fillStyle = shade(color, 0.1)
    ellipse(ctx, x, 142, 22, 11)
    ctx.fill()
    ctx.strokeStyle = shade(color, -0.35)
    ctx.lineWidth = 2
    for (const k of [-7, 0, 7]) {
      ctx.beginPath()
      ctx.moveTo(x + k, 136)
      ctx.lineTo(x + k, 146)
      ctx.stroke()
    }
  }
}

/** Two glowing eyes in the dark; the last frame is a blink. The pupils are a row of their own. */
function windowEyes(ctx: Ctx, f: number, _n: number, { color }: SpriteColors) {
  const shut = f % 4 === 3
  for (const x of [60, 160]) {
    glow(ctx, x, 55, 62, color, 0.35)
    const g = ctx.createRadialGradient(x, 55, 4, x, 55, 46)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(1, color)
    ctx.fillStyle = g
    const h = shut ? 3 : 28
    ctx.beginPath()
    ctx.moveTo(x - 46, 55)
    ctx.quadraticCurveTo(x, 55 - h * 2, x + 46, 55)
    ctx.quadraticCurveTo(x, 55 + h * 2, x - 46, 55)
    ctx.closePath()
    ctx.fill()
  }
}

/** The iris and pupil, placed by the motion so they look at whoever is nearest. */
function eyePupil(ctx: Ctx, _f: number, _n: number, { color2 }: SpriteColors) {
  const g = ctx.createRadialGradient(28, 28, 2, 32, 32, 28)
  g.addColorStop(0, shade(color2, 0.4))
  g.addColorStop(1, shade(color2, -0.3))
  ctx.fillStyle = g
  circle(ctx, 32, 32, 27)
  ctx.fill()
  ctx.fillStyle = '#050505'
  circle(ctx, 32, 32, 13)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  circle(ctx, 25, 24, 5)
  ctx.fill()
}

/** An owl sitting on the roofline, head turned left, ahead or right, or blinking; feet at the bottom. */
function perchedOwl(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  ctx.translate(0, 12)
  const look = [-1, 0, 1, 0][f % 4]
  const blink = f % 4 === 3
  // Tail and body.
  ctx.fillStyle = shade(color, -0.3)
  ctx.beginPath()
  ctx.moveTo(70, 170)
  ctx.lineTo(100, 196)
  ctx.lineTo(130, 170)
  ctx.closePath()
  ctx.fill()
  const g = ctx.createRadialGradient(92, 120, 10, 100, 132, 66)
  g.addColorStop(0, shade(color, 0.3))
  g.addColorStop(1, shade(color, -0.2))
  ctx.fillStyle = g
  ellipse(ctx, 100, 136, 52, 58)
  ctx.fill()
  // Breast feathers.
  ctx.fillStyle = shade(color, 0.45)
  ellipse(ctx, 100, 146, 32, 40)
  ctx.fill()
  ctx.strokeStyle = shade(color, -0.1)
  ctx.lineWidth = 2
  for (let r = 0; r < 4; r++) {
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath()
      ctx.arc(100 + k * 14 + (r % 2) * 7, 124 + r * 15, 6, 0.2, Math.PI - 0.2)
      ctx.stroke()
    }
  }
  // Wings folded at the sides.
  ctx.fillStyle = shade(color, -0.15)
  for (const d of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(100 + d * 44, 140, 16, 44, d * 0.15, 0, TAU)
    ctx.fill()
  }
  // Feet gripping the edge.
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  for (const x of [84, 116]) {
    for (const k of [-6, 0, 6]) {
      ctx.beginPath()
      ctx.moveTo(x, 188)
      ctx.lineTo(x + k, 198)
      ctx.stroke()
    }
  }
  // Head turned: the face shifts towards where it looks.
  const hx = 100 + look * 10
  ctx.fillStyle = color
  ellipse(ctx, hx, 62, 50, 44)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(hx - 44, 40)
  ctx.lineTo(hx - 38, 6)
  ctx.lineTo(hx - 18, 28)
  ctx.moveTo(hx + 44, 40)
  ctx.lineTo(hx + 38, 6)
  ctx.lineTo(hx + 18, 28)
  ctx.fill()
  // Facial disc and big eyes.
  ctx.fillStyle = shade(color, 0.5)
  for (const d of [-1, 1]) {
    circle(ctx, hx + look * 8 + d * 21, 62, 22)
    ctx.fill()
  }
  for (const d of [-1, 1]) {
    const ex = hx + look * 10 + d * 21
    if (blink) {
      ctx.strokeStyle = '#111'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(ex, 58, 12, 0.3, Math.PI - 0.3)
      ctx.stroke()
      continue
    }
    ctx.fillStyle = color2
    circle(ctx, ex, 62, 15)
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, ex + look * 3, 62, 8)
    ctx.fill()
    ctx.fillStyle = '#fff'
    circle(ctx, ex - 4, 57, 3)
    ctx.fill()
  }
  ctx.fillStyle = '#78350f'
  ctx.beginPath()
  ctx.moveTo(hx + look * 10 - 6, 74)
  ctx.lineTo(hx + look * 10 + 6, 74)
  ctx.lineTo(hx + look * 10, 88)
  ctx.closePath()
  ctx.fill()
}

/** A seagull standing on the roofline: sitting, looking round, pecking, squawking; feet at the bottom. */
function perchedGull(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const pose = f % 4
  // Legs.
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(84, 128)
  ctx.lineTo(80, 158)
  ctx.moveTo(98, 128)
  ctx.lineTo(100, 158)
  ctx.stroke()
  // Tail and body.
  ctx.fillStyle = '#111827'
  ctx.beginPath()
  ctx.moveTo(40, 104)
  ctx.lineTo(8, 112)
  ctx.lineTo(44, 122)
  ctx.closePath()
  ctx.fill()
  const g = ctx.createLinearGradient(0, 70, 0, 140)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(1, '#e2e8f0')
  ctx.fillStyle = g
  ellipse(ctx, 86, 106, 52, 28, -0.1)
  ctx.fill()
  // Grey wing with black tips.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(116, 92)
  ctx.quadraticCurveTo(70, 82, 26, 108)
  ctx.quadraticCurveTo(70, 122, 112, 112)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#111827'
  ctx.beginPath()
  ctx.moveTo(48, 100)
  ctx.lineTo(18, 110)
  ctx.lineTo(50, 112)
  ctx.closePath()
  ctx.fill()
  // Head, by pose.
  const [hx, hy] = pose === 2 ? [146, 112] : pose === 1 ? [126, 60] : [132, 62]
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(110, 96)
  ctx.quadraticCurveTo(120, 78, hx - 6, hy + 8)
  ctx.lineTo(hx + 12, hy + 14)
  ctx.quadraticCurveTo(132, 96, 126, 108)
  ctx.closePath()
  ctx.fill()
  circle(ctx, hx, hy, 18)
  ctx.fill()
  const dir = pose === 1 ? -1 : 1
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(hx + dir * 14, hy - 2)
  ctx.lineTo(hx + dir * 42, hy + 2)
  ctx.lineTo(hx + dir * 14, hy + 8)
  ctx.closePath()
  ctx.fill()
  if (pose === 3) {
    // Beak wide open, squawking.
    ctx.beginPath()
    ctx.moveTo(hx + 14, hy + 6)
    ctx.lineTo(hx + 38, hy + 20)
    ctx.lineTo(hx + 14, hy + 12)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = '#dc2626'
  circle(ctx, hx + dir * 34, hy + 5, 2.5)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, hx + dir * 6, hy - 4, 3)
  ctx.fill()
}


// -- throwing, jack-in-the-boxes, moles, coffins, graves, party poppers and a birthday cake ------

/** The arm's angle through a throw: holding the ball, wound back over the head, throwing, following through. */
const THROW_ARM = [0.5, Math.PI + 0.7, 2.1, 1.3]

/** A child in a puffy coat and bobble hat throwing snowballs; frames run through one throw. */
function snowballKid(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const k = f % 4
  // Boots and legs, braced.
  limb(ctx, 82, 168, 30, 30, -0.25, 0.2, 18, '#1e3a8a')
  limb(ctx, 104, 168, 30, 30, 0.3, -0.1, 18, '#1e40af')
  ctx.fillStyle = '#3f2a1d'
  ellipse(ctx, 74, 228, 14, 8)
  ctx.fill()
  ellipse(ctx, 116, 228, 14, 8)
  ctx.fill()
  // Far arm.
  limb(ctx, 82, 112, 26, 24, -0.6, 0.4, 16, shade(color, -0.2))
  // Puffy coat with quilting.
  const g = ctx.createLinearGradient(60, 0, 130, 0)
  g.addColorStop(0, shade(color, -0.15))
  g.addColorStop(0.5, shade(color, 0.2))
  g.addColorStop(1, shade(color, -0.2))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(62, 100, 66, 76, 22)
  ctx.fill()
  ctx.strokeStyle = shade(color, -0.3)
  ctx.lineWidth = 2
  for (const y of [122, 144, 164]) {
    ctx.beginPath()
    ctx.moveTo(66, y)
    ctx.lineTo(124, y)
    ctx.stroke()
  }
  // Head, scarf and bobble hat.
  ctx.fillStyle = SKIN
  circle(ctx, 96, 74, 24)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 106, 72, 3)
  ctx.fill()
  ctx.fillStyle = 'rgba(244,114,182,0.5)'
  circle(ctx, 106, 82, 5)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.roundRect(72, 94, 50, 12, 6)
  ctx.fill()
  ctx.fillRect(74, 100, 12, 30)
  ctx.beginPath()
  ctx.arc(96, 66, 25, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(70, 60, 52, 9)
  circle(ctx, 96, 38, 9)
  ctx.fill()
  // Throwing arm with a mitten, holding the snowball until it goes.
  const [hx, hy] = limb(ctx, 106, 112, 28, 26, THROW_ARM[k], k === 1 ? 0.6 : -0.2, 16, color)
  ctx.fillStyle = color2
  circle(ctx, hx, hy, 9)
  ctx.fill()
  if (k < 2) {
    ctx.fillStyle = '#f8fafc'
    circle(ctx, hx + 2, hy - 8, 11)
    ctx.fill()
  }
}

/** A child in a T-shirt and cap throwing water balloons; frames run through one throw. */
function balloonKid(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const k = f % 4
  limb(ctx, 84, 168, 30, 30, -0.25, 0.2, 14, SKIN)
  limb(ctx, 104, 168, 30, 30, 0.3, -0.1, 14, shade(SKIN, -0.08))
  ctx.fillStyle = '#ffffff'
  ellipse(ctx, 76, 228, 13, 7)
  ctx.fill()
  ellipse(ctx, 116, 228, 13, 7)
  ctx.fill()
  // Shorts and T-shirt.
  ctx.fillStyle = '#1d4ed8'
  ctx.beginPath()
  ctx.roundRect(70, 150, 50, 30, 6)
  ctx.fill()
  limb(ctx, 84, 112, 24, 22, -0.5, 0.4, 11, shade(SKIN, -0.1))
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(68, 100, 54, 58, 12)
  ctx.fill()
  ctx.fillStyle = shade(color, 0.3)
  ctx.fillRect(68, 120, 54, 6)
  ctx.fillStyle = SKIN
  circle(ctx, 96, 76, 23)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 106, 74, 3)
  ctx.fill()
  ctx.strokeStyle = '#7c2d12'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(104, 82, 7, 0.2, Math.PI - 0.6)
  ctx.stroke()
  // Cap with its peak forward.
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.arc(96, 70, 24, Math.PI, 0)
  ctx.fill()
  ctx.fillRect(110, 64, 26, 7)
  const [hx, hy] = limb(ctx, 106, 112, 26, 24, THROW_ARM[k], k === 1 ? 0.6 : -0.2, 11, SKIN)
  if (k < 2) waterBalloon(ctx, 0, 1, { color, color2 }, hx + 2, hy - 10, 0.5)
}

/** A snowball, flying. */
function snowball(ctx: Ctx) {
  const g = ctx.createRadialGradient(18, 18, 2, 24, 24, 22)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(1, '#cbd5e1')
  ctx.fillStyle = g
  circle(ctx, 24, 24, 20)
  ctx.fill()
  ctx.fillStyle = 'rgba(148,163,184,0.5)'
  for (const [x, y] of [[30, 30], [16, 28], [28, 14]]) {
    circle(ctx, x, y, 3)
    ctx.fill()
  }
}

/** A water balloon, wobbly, with its knot; drawn at x, y scaled by s (or filling its cell). */
function waterBalloon(ctx: Ctx, _f: number, _n: number, { color2 }: SpriteColors, x = 24, y = 26, s = 1) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  const g = ctx.createRadialGradient(-6, -8, 2, 0, 0, 22)
  g.addColorStop(0, shade(color2, 0.5))
  g.addColorStop(1, shade(color2, -0.15))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(0, 0, 18, 20, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = shade(color2, -0.2)
  ctx.beginPath()
  ctx.moveTo(-4, 19)
  ctx.lineTo(4, 19)
  ctx.lineTo(0, 25)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ellipse(ctx, -7, -8, 4, 6, -0.5)
  ctx.fill()
  ctx.restore()
}

/** A snowball bursting where it lands. */
function snowSplat(ctx: Ctx) {
  ctx.fillStyle = 'rgba(248,250,252,0.95)'
  ellipse(ctx, 60, 64, 34, 14)
  ctx.fill()
  for (let k = 0; k < 10; k++) {
    const a = Math.PI + (k / 9) * Math.PI
    const r = 30 + (k % 3) * 10
    circle(ctx, 60 + Math.cos(a) * r, 60 + Math.sin(a) * r * 0.8, 5 + (k % 2) * 3)
    ctx.fill()
  }
}

/** A jack-in-the-box's box with its crank: lid shut, or open. */
function jackBox(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const open = f % 2 === 1
  const g = ctx.createLinearGradient(14, 0, 106, 0)
  g.addColorStop(0, shade(color, -0.2))
  g.addColorStop(1, shade(color, 0.2))
  ctx.fillStyle = g
  ctx.fillRect(14, 30, 92, 80)
  ctx.fillStyle = color2
  ctx.fillRect(14, 30, 92, 8)
  ctx.fillRect(14, 102, 92, 8)
  // A star on the front.
  ctx.fillStyle = '#facc15'
  ctx.beginPath()
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 9 : 20
    const a = -Math.PI / 2 + (k * Math.PI) / 5
    ctx.lineTo(60 + Math.cos(a) * r, 70 + Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fill()
  // Crank on the side.
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(106, 70)
  ctx.lineTo(116, 70)
  ctx.lineTo(116, 52)
  ctx.stroke()
  ctx.fillStyle = '#dc2626'
  circle(ctx, 116, 50, 4)
  ctx.fill()
  // The lid, shut on top or flung open behind.
  ctx.fillStyle = shade(color, 0.1)
  if (open) {
    ctx.beginPath()
    ctx.moveTo(14, 30)
    ctx.lineTo(4, 0)
    ctx.lineTo(18, 0)
    ctx.lineTo(24, 30)
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.fillRect(10, 22, 100, 10)
  }
}

/** A jester on a spring, bobbing: the spring at the bottom of the cell, the head on top. */
function jester(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const s = Math.sin((f / frames) * TAU)
  // The spring.
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(70, 220)
  for (let k = 0; k < 8; k++) ctx.lineTo(k % 2 ? 52 : 88, 206 - k * 12)
  ctx.lineTo(70 + s * 4, 110)
  ctx.stroke()
  ctx.save()
  ctx.translate(70, 110)
  ctx.rotate(s * 0.15)
  // Ruff collar.
  for (let k = 0; k < 7; k++) {
    ctx.fillStyle = k % 2 ? color : color2
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, 34, Math.PI * 0.1 + (k * Math.PI * 0.8) / 7 + Math.PI, Math.PI * 0.1 + ((k + 1) * Math.PI * 0.8) / 7 + Math.PI)
    ctx.closePath()
    ctx.fill()
  }
  // Face.
  ctx.fillStyle = '#fde7d4'
  circle(ctx, 0, -30, 26)
  ctx.fill()
  ctx.fillStyle = '#dc2626'
  circle(ctx, 0, -26, 6)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, -9, -36, 3)
  ctx.fill()
  circle(ctx, 9, -36, 3)
  ctx.fill()
  ctx.strokeStyle = '#dc2626'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(0, -24, 14, 0.2, Math.PI - 0.2)
  ctx.stroke()
  // Three-pointed hat with bells.
  for (const [d, c] of [[-1, color], [0, color2], [1, color]] as const) {
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.moveTo(-24 + (d + 1) * 16, -46)
    ctx.quadraticCurveTo(d * 30, -80, d * 44, -78 + Math.abs(d) * 14 + s * 4)
    ctx.lineTo(-8 + (d + 1) * 16, -48)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#facc15'
    circle(ctx, d * 44, -76 + Math.abs(d) * 14 + s * 4, 6)
    ctx.fill()
  }
  ctx.restore()
}

/** A mole poking its head out, sniffing; the mound is a row of its own. */
function mole(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const sniff = Math.sin((f / frames) * TAU)
  const g = ctx.createRadialGradient(56, 60, 8, 65, 80, 60)
  g.addColorStop(0, shade(color, 0.3))
  g.addColorStop(1, shade(color, -0.2))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(20, 150)
  ctx.bezierCurveTo(14, 40, 116, 40, 110, 150)
  ctx.closePath()
  ctx.fill()
  // Big digging paws.
  ctx.fillStyle = color2
  for (const d of [-1, 1]) {
    ellipse(ctx, 65 + d * 40, 126, 16, 12, d * 0.4)
    ctx.fill()
    ctx.strokeStyle = shade(color2, -0.3)
    ctx.lineWidth = 2
    for (const k of [-6, 0, 6]) {
      ctx.beginPath()
      ctx.moveTo(65 + d * 40 + k, 118)
      ctx.lineTo(65 + d * 46 + k, 112)
      ctx.stroke()
    }
  }
  // Squinty eyes and a pink snout that twitches.
  ctx.strokeStyle = '#111'
  ctx.lineWidth = 3
  for (const d of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(65 + d * 14 - 5, 70)
    ctx.lineTo(65 + d * 14 + 5, 70)
    ctx.stroke()
  }
  ctx.fillStyle = color2
  ellipse(ctx, 65, 88 + sniff * 2, 14 + Math.abs(sniff) * 2, 10)
  ctx.fill()
  ctx.fillStyle = shade(color2, -0.35)
  circle(ctx, 60, 88 + sniff * 2, 2.5)
  ctx.fill()
  circle(ctx, 70, 88 + sniff * 2, 2.5)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'
  ctx.lineWidth = 1.2
  for (const d of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(65 + d * 12, 92)
    ctx.lineTo(65 + d * 36, 86 + sniff * 3)
    ctx.moveTo(65 + d * 12, 95)
    ctx.lineTo(65 + d * 36, 98 - sniff * 3)
    ctx.stroke()
  }
}

/** An upright coffin opening: shut, eyes in the crack, door open, the vampire stepping out. */
function coffin(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const stage = f % 4
  const shape = (inset: number) => {
    ctx.beginPath()
    ctx.moveTo(80, 6 + inset)
    ctx.lineTo(134 - inset, 46)
    ctx.lineTo(118 - inset, 254 - inset)
    ctx.lineTo(42 + inset, 254 - inset)
    ctx.lineTo(26 + inset, 46)
    ctx.closePath()
  }
  // The inside: red satin.
  ctx.fillStyle = '#3f0d12'
  shape(0)
  ctx.fill()
  ctx.fillStyle = '#7f1d1d'
  shape(10)
  ctx.fill()
  if (stage >= 2) {
    // The vampire inside, arms crossed, then stepping out with arms wide.
    const out = stage === 3
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(80, 60)
    ctx.lineTo(out ? 140 : 112, out ? 120 : 110)
    ctx.lineTo(110, 250)
    ctx.lineTo(50, 250)
    ctx.lineTo(out ? 20 : 48, out ? 120 : 110)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#18181b'
    ctx.beginPath()
    ctx.moveTo(80, 90)
    ctx.lineTo(102, 110)
    ctx.lineTo(98, 248)
    ctx.lineTo(62, 248)
    ctx.lineTo(58, 110)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(72, 96)
    ctx.lineTo(80, 130)
    ctx.lineTo(88, 96)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#e2e8f0'
    ellipse(ctx, 80, 74, 18, 22)
    ctx.fill()
    ctx.fillStyle = '#18181b'
    ctx.beginPath()
    ctx.moveTo(62, 66)
    ctx.quadraticCurveTo(80, 44, 98, 66)
    ctx.lineTo(80, 60)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#dc2626'
    circle(ctx, 73, 74, 3)
    ctx.fill()
    circle(ctx, 87, 74, 3)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.moveTo(74, 86)
    ctx.lineTo(76, 93)
    ctx.lineTo(78, 86)
    ctx.moveTo(82, 86)
    ctx.lineTo(84, 93)
    ctx.lineTo(86, 86)
    ctx.fill()
    if (out) {
      ctx.fillStyle = '#e2e8f0'
      circle(ctx, 140, 120, 7)
      ctx.fill()
      circle(ctx, 20, 120, 7)
      ctx.fill()
    }
  }
  // The door: shut, ajar with red eyes in the crack, or swung open to the side.
  const wood = ctx.createLinearGradient(26, 0, 134, 0)
  wood.addColorStop(0, shade(color, -0.25))
  wood.addColorStop(0.5, shade(color, 0.15))
  wood.addColorStop(1, shade(color, -0.3))
  ctx.fillStyle = wood
  if (stage === 0) {
    shape(0)
    ctx.fill()
  } else if (stage === 1) {
    ctx.save()
    ctx.translate(-14, 0)
    shape(0)
    ctx.fill()
    ctx.restore()
    glow(ctx, 126, 80, 16, '#ef4444', 1)
    ctx.fillStyle = '#ef4444'
    circle(ctx, 122, 80, 3)
    ctx.fill()
    circle(ctx, 131, 80, 3)
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.moveTo(26, 46)
    ctx.lineTo(4, 40)
    ctx.lineTo(10, 252)
    ctx.lineTo(42, 254)
    ctx.closePath()
    ctx.fill()
  }
  if (stage <= 1) {
    ctx.fillStyle = '#cbd5e1'
    const cx = stage === 1 ? 66 : 80
    ctx.fillRect(cx - 4, 70, 8, 60)
    ctx.fillRect(cx - 20, 88, 40, 8)
  }
}

/** A tombstone with "RIP" and moss; the ghost rising from behind it is the ghost picture. */
function tombstone(ctx: Ctx) {
  const g = ctx.createLinearGradient(20, 0, 120, 0)
  g.addColorStop(0, '#64748b')
  g.addColorStop(0.5, '#94a3b8')
  g.addColorStop(1, '#475569')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(22, 160)
  ctx.lineTo(22, 60)
  ctx.arc(70, 60, 48, Math.PI, 0)
  ctx.lineTo(118, 160)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#334155'
  ctx.font = 'bold 30px Georgia, serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('RIP', 70, 70)
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(84, 22)
  ctx.lineTo(76, 40)
  ctx.lineTo(86, 52)
  ctx.stroke()
  ctx.fillStyle = 'rgba(77,124,15,0.7)'
  ellipse(ctx, 34, 154, 18, 8)
  ctx.fill()
  ellipse(ctx, 108, 150, 14, 10)
  ctx.fill()
  ctx.fillStyle = '#3b2614'
  ellipse(ctx, 70, 160, 64, 8)
  ctx.fill()
}

/** A party popper, a striped cone with a pull string; its mouth is at the top. */
function partyPopper(ctx: Ctx, _f: number, _n: number, { color, color2 }: SpriteColors) {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(50, 136)
  ctx.lineTo(18, 20)
  ctx.lineTo(82, 20)
  ctx.closePath()
  ctx.clip()
  for (let k = 0; k < 10; k++) {
    ctx.fillStyle = k % 2 ? color : color2
    ctx.beginPath()
    ctx.moveTo(0, 10 + k * 14)
    ctx.lineTo(100, -10 + k * 14)
    ctx.lineTo(100, 4 + k * 14)
    ctx.lineTo(0, 24 + k * 14)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  ctx.fillStyle = shade(color2, -0.3)
  ellipse(ctx, 50, 20, 32, 7)
  ctx.fill()
  ctx.strokeStyle = '#f8fafc'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(50, 136)
  ctx.quadraticCurveTo(64, 150, 74, 140)
  ctx.stroke()
}

/** A birthday cake: candles lit and flickering, or just blown out with smoke curling up. */
function birthdayCake(lit: boolean) {
  return (ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) => {
    // Plate, two tiers, icing drips and sprinkles.
    ctx.fillStyle = '#e2e8f0'
    ellipse(ctx, 110, 206, 100, 12)
    ctx.fill()
    const tier = (x: number, y: number, w: number, h: number) => {
      const g = ctx.createLinearGradient(x, 0, x + w, 0)
      g.addColorStop(0, shade(color, -0.15))
      g.addColorStop(0.5, shade(color, 0.2))
      g.addColorStop(1, shade(color, -0.2))
      ctx.fillStyle = g
      ctx.fillRect(x, y, w, h)
      ellipse(ctx, x + w / 2, y + h, w / 2, 10)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ellipse(ctx, x + w / 2, y, w / 2, 10)
      ctx.fill()
      for (let k = 0; k < 7; k++) {
        const dx = x + 8 + (k * (w - 16)) / 6
        ctx.beginPath()
        ctx.roundRect(dx - 5, y, 10, 10 + (k % 3) * 7, 5)
        ctx.fill()
      }
      const cols = ['#f472b6', '#38bdf8', '#facc15', '#22c55e', color2]
      for (let k = 0; k < 12; k++) {
        ctx.fillStyle = cols[k % cols.length]
        ctx.fillRect(x + 10 + ((k * 37) % (w - 20)), y + 22 + ((k * 13) % (h - 26)), 6, 3)
      }
    }
    tier(30, 140, 160, 60)
    tier(60, 96, 100, 46)
    // Candles.
    for (let k = 0; k < 5; k++) {
      const x = 72 + k * 19
      ctx.fillStyle = k % 2 ? color2 : '#ffffff'
      ctx.fillRect(x - 3, 66, 7, 30)
      ctx.strokeStyle = k % 2 ? '#ffffff' : color2
      ctx.lineWidth = 2
      for (let j = 0; j < 3; j++) {
        ctx.beginPath()
        ctx.moveTo(x - 3, 72 + j * 9)
        ctx.lineTo(x + 4, 68 + j * 9)
        ctx.stroke()
      }
      if (lit) {
        const flick = [0, 0.15, -0.1, 0.08][(f + k) % 4]
        glow(ctx, x, 54, 16, '#fbbf24', 0.8)
        ctx.save()
        ctx.translate(x, 64)
        ctx.rotate(flick)
        ctx.fillStyle = '#fbbf24'
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.bezierCurveTo(-7, -4, -4, -16, 0, -22)
        ctx.bezierCurveTo(4, -16, 7, -4, 0, 0)
        ctx.fill()
        ctx.fillStyle = '#fffbeb'
        ellipse(ctx, 0, -6, 2.5, 5)
        ctx.fill()
        ctx.restore()
      } else {
        // A wisp of smoke curling up from each wick.
        ctx.strokeStyle = 'rgba(203,213,225,0.7)'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(x, 64)
        for (let j = 1; j <= 6; j++) ctx.lineTo(x + Math.sin(j * 1.2 + f + k) * 5, 64 - j * 9)
        ctx.stroke()
      }
    }
  }
}


// -- skiers, skaters, shy animals, a parade on stilts, footballers -----------------------------

/** A skier crouched on skis, poles back; the second frame jumps with arms up. */
function skier(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const air = f % 2 === 1
  // Skis.
  ctx.strokeStyle = color2
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(14, 150)
  ctx.lineTo(196, 150)
  ctx.quadraticCurveTo(212, 150, 214, 138)
  ctx.stroke()
  // Legs bent.
  limb(ctx, 98, 100, 30, 30, air ? 0.3 : 0.9, air ? -0.5 : -1.5, 16, '#1e293b')
  limb(ctx, 110, 100, 30, 30, air ? 0.5 : 1.1, air ? -0.6 : -1.6, 16, '#334155')
  ctx.fillStyle = '#111'
  ctx.fillRect(104, 138, 22, 12)
  ctx.fillRect(122, 138, 22, 12)
  // Jacket leaning forward.
  ctx.save()
  ctx.translate(106, 92)
  ctx.rotate(air ? 0.1 : 0.5)
  const g = ctx.createLinearGradient(-22, 0, 22, 0)
  g.addColorStop(0, shade(color, -0.2))
  g.addColorStop(1, shade(color, 0.25))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(-22, -54, 44, 60, 14)
  ctx.fill()
  ctx.restore()
  // Head with goggles and helmet.
  const hx = air ? 112 : 140
  const hy = air ? 26 : 40
  ctx.fillStyle = SKIN
  circle(ctx, hx, hy, 17)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.arc(hx, hy - 2, 19, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = '#0ea5e9'
  ctx.beginPath()
  ctx.roundRect(hx - 4, hy - 4, 22, 9, 4)
  ctx.fill()
  // Arms and poles.
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 3
  if (air) {
    // Arms flung up and out in a V, poles with them.
    for (const d of [-1, 1]) {
      const [ex, ey] = limb(ctx, 108 + d * 9, 58, 24, 22, Math.PI - d * 0.9, -d * 0.25, 11, color)
      ctx.beginPath()
      ctx.moveTo(ex, ey)
      ctx.lineTo(ex + d * 22, ey - 30)
      ctx.stroke()
    }
  } else {
    const [ex, ey] = limb(ctx, 120, 66, 22, 22, 1.3, 0.4, 11, color)
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex - 70, ey + 26)
    ctx.stroke()
  }
}

/** An ice skater gliding with one leg back and arms out, scarf flying. */
function iceSkater(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  ctx.save()
  ctx.translate(104, 250)
  ctx.rotate(s * 0.08)
  ctx.translate(-90, -250)
  // Gliding on one leg with the other stretched out behind, swapping legs each stride.
  const back = s > 0
  const [ax, ay] = limb(ctx, 88, 150, 46, 46, back ? -0.95 : 0.05, back ? -0.25 : 0, 13, '#1e293b')
  const [bx, by] = limb(ctx, 96, 150, 46, 46, back ? 0.05 : -0.95, back ? 0 : -0.25, 13, '#334155')
  for (const [x, y] of [[ax, ay], [bx, by]]) {
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.roundRect(x - 10, y - 6, 26, 12, 4)
    ctx.fill()
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - 12, y + 9)
    ctx.lineTo(x + 20, y + 9)
    ctx.stroke()
  }
  // Skating dress.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(78, 96)
  ctx.lineTo(104, 96)
  ctx.lineTo(122, 156 + s * 3)
  ctx.lineTo(60, 156 - s * 3)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = shade(color, 0.35)
  ctx.fillRect(66, 148, 50, 4)
  // Arms out for balance.
  limb(ctx, 82, 100, 28, 26, -1.9 + s * 0.2, 0.3, 9, SKIN)
  limb(ctx, 100, 100, 28, 26, 1.9 + s * 0.2, -0.3, 9, SKIN)
  // Head, scarf streaming behind, earmuffs.
  ctx.fillStyle = SKIN
  circle(ctx, 92, 72, 20)
  ctx.fill()
  ctx.fillStyle = '#7c2d12'
  ctx.beginPath()
  ctx.arc(90, 68, 21, Math.PI * 0.95, Math.PI * 1.9)
  ctx.fill()
  ctx.fillStyle = color2
  circle(ctx, 76, 70, 8)
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(78, 88, 30, 9, 4)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(80, 90)
  ctx.quadraticCurveTo(54, 84 + s * 6, 30, 92 + s * 10)
  ctx.lineTo(32, 100 + s * 10)
  ctx.quadraticCurveTo(56, 96 + s * 6, 82, 97)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 100, 70, 2.5)
  ctx.fill()
  ctx.restore()
}

/** A snail sliding along, eye stalks waving; hiding: tucked into its shell. */
function snail(hiding: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    if (!hiding) {
      // Soft body with eye stalks.
      ctx.fillStyle = color2
      ctx.beginPath()
      ctx.moveTo(20, 118)
      ctx.quadraticCurveTo(90, 106 + Math.sin(p) * 3, 172, 104)
      ctx.quadraticCurveTo(196, 100, 188, 80)
      ctx.quadraticCurveTo(176, 66, 160, 80)
      ctx.lineTo(140, 118)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = color2
      ctx.lineWidth = 5
      ctx.lineCap = 'round'
      for (const [d, w] of [[0, 1], [12, -1]] as const) {
        const ex = 176 + d + Math.sin(p + d) * 4 * w
        const ey = 40 + Math.cos(p + d) * 3
        ctx.beginPath()
        ctx.moveTo(176 + d * 0.5, 80)
        ctx.lineTo(ex, ey)
        ctx.stroke()
        ctx.fillStyle = '#111'
        circle(ctx, ex, ey, 4.5)
        ctx.fill()
      }
      ctx.strokeStyle = shade(color2, -0.3)
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(182, 92, 6, 0.2, Math.PI - 0.4)
      ctx.stroke()
    }
    // The spiral shell.
    const g = ctx.createRadialGradient(80, 60, 6, 84, 70, 56)
    g.addColorStop(0, shade(color, 0.35))
    g.addColorStop(1, shade(color, -0.25))
    ctx.fillStyle = g
    circle(ctx, 84, 70, 48)
    ctx.fill()
    ctx.strokeStyle = shade(color, -0.4)
    ctx.lineWidth = 4
    ctx.beginPath()
    for (let a = 0; a < 5.2 * Math.PI; a += 0.15) {
      const r = 4 + a * 2.6
      ctx.lineTo(86 + Math.cos(a) * r, 72 + Math.sin(a) * r)
    }
    ctx.stroke()
    if (hiding) {
      ctx.fillStyle = shade(color2, -0.2)
      ellipse(ctx, 84, 118, 30, 5)
      ctx.fill()
    }
  }
}

/** A tortoise plodding along; hiding: head and legs pulled into the shell. */
function tortoise(hiding: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    ctx.translate(-8, 0)
    const s = Math.sin((f / frames) * TAU)
    if (!hiding) {
      ctx.fillStyle = color2
      for (const [x, a] of [[60, s], [146, -s], [80, -s], [126, s]] as const) {
        ctx.beginPath()
        ctx.roundRect(x - 11 + a * 6, 104, 22, 30, 8)
        ctx.fill()
      }
      // Head on a long neck.
      ctx.beginPath()
      ctx.moveTo(160, 94)
      ctx.quadraticCurveTo(186, 82, 196, 70 + s * 2)
      ctx.lineTo(206, 82 + s * 2)
      ctx.quadraticCurveTo(190, 104, 162, 112)
      ctx.closePath()
      ctx.fill()
      ellipse(ctx, 204, 74 + s * 2, 18, 14)
      ctx.fill()
      ctx.fillStyle = '#111'
      circle(ctx, 210, 70 + s * 2, 3)
      ctx.fill()
      ctx.strokeStyle = shade(color2, -0.35)
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(210, 78 + s * 2, 7, 0.3, Math.PI - 0.8)
      ctx.stroke()
      ctx.fillStyle = color2
      ctx.beginPath()
      ctx.moveTo(40, 100)
      ctx.lineTo(22, 108)
      ctx.lineTo(44, 110)
      ctx.fill()
    } else {
      ctx.fillStyle = shade(color2, -0.2)
      for (const x of [60, 146]) {
        ellipse(ctx, x, 122, 10, 8)
        ctx.fill()
      }
    }
    // Domed shell with plates.
    const g = ctx.createRadialGradient(96, 50, 10, 102, 80, 90)
    g.addColorStop(0, shade(color, 0.3))
    g.addColorStop(1, shade(color, -0.3))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(32, 112)
    ctx.bezierCurveTo(32, 20, 172, 20, 172, 112)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = shade(color, -0.45)
    ctx.lineWidth = 3
    ctx.beginPath()
    for (const [x, y] of [[102, 64], [66, 88], [138, 88]]) {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU
        ctx.lineTo(x + Math.cos(a) * 20, y + Math.sin(a) * 16)
      }
      ctx.closePath()
    }
    ctx.stroke()
    ctx.fillStyle = shade(color, -0.35)
    ctx.fillRect(30, 108, 144, 8)
  }
}

/** A hedgehog trundling along; hiding: curled into a prickly ball. */
function hedgehog(hiding: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const s = Math.sin((f / frames) * TAU)
    const spikes = (cx: number, cy: number, r: number, from: number, to: number) => {
      ctx.fillStyle = shade(color, -0.35)
      for (let k = 0; k <= 22; k++) {
        const a = from + ((to - from) * k) / 22
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a - 0.1) * r * 0.8, cy + Math.sin(a - 0.1) * r * 0.8)
        ctx.lineTo(cx + Math.cos(a) * (r + 14), cy + Math.sin(a) * (r + 14))
        ctx.lineTo(cx + Math.cos(a + 0.1) * r * 0.8, cy + Math.sin(a + 0.1) * r * 0.8)
        ctx.fill()
      }
    }
    if (hiding) {
      spikes(100, 76, 46, 0, TAU)
      ctx.fillStyle = color
      circle(ctx, 100, 76, 46)
      ctx.fill()
      ctx.fillStyle = shade(color, -0.2)
      for (let k = 0; k < 16; k++) {
        circle(ctx, 100 + Math.cos(k * 2.4) * (12 + (k % 4) * 9), 76 + Math.sin(k * 2.4) * (12 + (k % 4) * 9), 3)
        ctx.fill()
      }
      return
    }
    ctx.fillStyle = color2
    for (const [x, a] of [[70, s], [130, -s]] as const) {
      ctx.beginPath()
      ctx.roundRect(x - 7 + a * 5, 100, 14, 22, 6)
      ctx.fill()
    }
    spikes(92, 92, 50, Math.PI * 0.95, Math.PI * 2.05)
    ctx.fillStyle = color
    ellipse(ctx, 92, 90, 54, 34)
    ctx.fill()
    // Pale face and snout with a black nose.
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(130, 64)
    ctx.quadraticCurveTo(178, 80, 186, 96)
    ctx.quadraticCurveTo(160, 116, 126, 112)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, 186, 95, 5)
    ctx.fill()
    circle(ctx, 154, 84, 3.5)
    ctx.fill()
    ctx.fillStyle = shade(color2, -0.2)
    circle(ctx, 140, 70, 6)
    ctx.fill()
  }
}

/** A skunk strolling, tail up; hiding: turned round with tail high and a green cloud. */
function skunk(hiding: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const s = Math.sin((f / frames) * TAU)
    if (hiding) {
      ctx.fillStyle = rgba(color2, 0.45)
      for (const [x, y, r] of [[48, 48, 26], [30, 82, 22], [64, 22, 20], [22, 42, 16]]) {
        circle(ctx, x + s * 3, y, r)
        ctx.fill()
      }
    }
    // Legs.
    ctx.fillStyle = color
    for (const [x, a] of [[86, s], [150, -s], [100, -s], [140, s]] as const) {
      ctx.beginPath()
      ctx.roundRect(x - 7 + a * (hiding ? 0 : 5), 108, 14, 22, 5)
      ctx.fill()
    }
    // Big bushy tail, held straight up when it sprays.
    ctx.save()
    ctx.translate(82, 92)
    ctx.rotate(hiding ? -0.2 : -0.6 + s * 0.08)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(-50, -10, -54, -80, -14, -96)
    ctx.bezierCurveTo(20, -100, 26, -60, 10, -30)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(-6, -4)
    ctx.bezierCurveTo(-30, -20, -36, -70, -12, -84)
    ctx.bezierCurveTo(-10, -60, -8, -30, 4, -14)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    // Body with the white stripe.
    ctx.fillStyle = color
    ellipse(ctx, 120, 94, 50, 26)
    ctx.fill()
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(84, 78)
    ctx.quadraticCurveTo(124, 62, 168, 76)
    ctx.quadraticCurveTo(124, 72, 84, 86)
    ctx.closePath()
    ctx.fill()
    // Head, snout, white blaze.
    ctx.fillStyle = color
    ellipse(ctx, 172, 86, 22, 18)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(186, 84)
    ctx.lineTo(206, 94)
    ctx.lineTo(184, 98)
    ctx.fill()
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(166, 70)
    ctx.lineTo(178, 70)
    ctx.lineTo(188, 88)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#f472b6'
    circle(ctx, 205, 94, 3.5)
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, 178, 82, 3)
    ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(160, 72)
    ctx.lineTo(164, 58)
    ctx.lineTo(172, 70)
    ctx.fill()
  }
}

/** Uncle Sam on stilts in his striped trousers and starry top hat. */
function stiltWalker(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const s = Math.sin((f / frames) * TAU)
  // Stilts as long striped legs.
  for (const [x, a] of [[86, s * 0.18], [104, -s * 0.18]] as const) {
    ctx.save()
    ctx.translate(x, 170)
    ctx.rotate(a)
    for (let k = 0; k < 8; k++) {
      ctx.fillStyle = k % 2 ? '#ffffff' : color
      ctx.fillRect(-8, k * 22, 16, 22)
    }
    ctx.fillStyle = '#111'
    ctx.fillRect(-12, 176, 24, 8)
    ctx.restore()
  }
  // Blue tailcoat.
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(74, 96)
  ctx.lineTo(116, 96)
  ctx.lineTo(122, 178)
  ctx.lineTo(96, 160)
  ctx.lineTo(68, 178)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(88, 96)
  ctx.lineTo(102, 96)
  ctx.lineTo(95, 124)
  ctx.closePath()
  ctx.fill()
  // Waving arm and the other on the hip.
  limb(ctx, 112, 102, 26, 24, Math.PI - 0.6 + s * 0.4, -0.5, 11, color2)
  limb(ctx, 76, 102, 22, 20, -0.9, 1.6, 11, color2)
  // Face with a white goatee.
  ctx.fillStyle = SKIN
  circle(ctx, 95, 74, 18)
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.moveTo(84, 82)
  ctx.lineTo(106, 82)
  ctx.lineTo(95, 102)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 101, 70, 2.5)
  ctx.fill()
  // Top hat with stars and a stripe.
  ctx.fillStyle = color2
  ctx.fillRect(70, 54, 50, 6)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(78, 8, 34, 46)
  ctx.fillStyle = color
  ctx.fillRect(78, 18, 34, 6)
  ctx.fillRect(78, 34, 34, 6)
  ctx.fillStyle = color2
  ctx.fillRect(78, 44, 34, 10)
  ctx.fillStyle = '#ffffff'
  for (const x of [84, 95, 106]) {
    circle(ctx, x, 49, 2)
    ctx.fill()
  }
}

/** A football player in helmet and pads running with the ball tucked under one arm. */
function footballPlayer(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const s = Math.sin((f / frames) * TAU)
  const [ax, ay] = limb(ctx, 84, 150, 34, 32, s * 0.7, -Math.max(0, s) * 1.1, 17, '#e2e8f0')
  const [bx, by] = limb(ctx, 100, 150, 34, 32, -s * 0.7, -Math.max(0, -s) * 1.1, 17, '#f1f5f9')
  ctx.fillStyle = '#111'
  ellipse(ctx, ax + 6, ay + 3, 12, 6)
  ctx.fill()
  ellipse(ctx, bx + 6, by + 3, 12, 6)
  ctx.fill()
  limb(ctx, 80, 100, 26, 24, -0.8 - s * 0.4, 0.6, 13, color)
  // Jersey with shoulder pads and a number.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(60, 98)
  ctx.quadraticCurveTo(92, 82, 124, 98)
  ctx.lineTo(116, 156)
  ctx.lineTo(70, 156)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = color2
  ctx.font = 'bold 26px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('21', 92, 126)
  // Ball tucked under the near arm.
  ctx.fillStyle = '#7c2d12'
  ellipse(ctx, 118, 120, 18, 11, -0.4)
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(110, 122)
  ctx.lineTo(126, 115)
  ctx.stroke()
  limb(ctx, 104, 100, 24, 22, 0.6, -1.9, 13, shade(color, 0.1))
  // Helmet with face mask.
  ctx.fillStyle = color2
  circle(ctx, 98, 66, 22)
  ctx.fill()
  ctx.fillStyle = SKIN
  ctx.beginPath()
  ctx.arc(108, 70, 12, -0.9, 1.4)
  ctx.fill()
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(110, 62)
  ctx.lineTo(124, 66)
  ctx.lineTo(122, 80)
  ctx.lineTo(108, 82)
  ctx.moveTo(112, 72)
  ctx.lineTo(124, 72)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.fillRect(84, 46, 6, 40)
}


// -- storks, flying pigs, unicorns, a magic carpet, fairies, a superhero, ladybugs and moths -----

/** A stork flying with a baby's bundle hanging from its beak. */
function stork(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  ctx.translate(0, 24)
  const flap = Math.sin((f / frames) * TAU)
  const wing = (far: boolean) => {
    ctx.fillStyle = far ? '#e2e8f0' : '#ffffff'
    ctx.beginPath()
    ctx.moveTo(140, 70)
    ctx.quadraticCurveTo(120, 70 - 70 * flap, 70, 66 - 84 * flap)
    ctx.lineTo(96, 80)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#111827'
    ctx.beginPath()
    ctx.moveTo(70, 66 - 84 * flap)
    ctx.lineTo(96, 80)
    ctx.lineTo(86, 72 - 40 * flap)
    ctx.closePath()
    ctx.fill()
  }
  wing(true)
  // Long legs trailing.
  ctx.strokeStyle = '#f97316'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(96, 84)
  ctx.lineTo(20, 92)
  ctx.moveTo(98, 88)
  ctx.lineTo(24, 100)
  ctx.stroke()
  // Body, neck stretched forward, beak.
  ctx.fillStyle = '#ffffff'
  ellipse(ctx, 130, 80, 46, 18, -0.05)
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 10
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(170, 76)
  ctx.quadraticCurveTo(200, 66, 214, 64)
  ctx.stroke()
  circle(ctx, 218, 62, 11)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.fillStyle = '#f97316'
  ctx.beginPath()
  ctx.moveTo(226, 58)
  ctx.lineTo(282, 70)
  ctx.lineTo(226, 68)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 220, 58, 2.5)
  ctx.fill()
  // The bundle swinging from the beak.
  const sw = flap * 3
  ctx.strokeStyle = shade(color, -0.2)
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(262, 70)
  ctx.lineTo(244 + sw, 96)
  ctx.moveTo(262, 70)
  ctx.lineTo(276 + sw, 96)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(240 + sw, 96)
  ctx.quadraticCurveTo(260 + sw, 150, 280 + sw, 96)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = SKIN
  circle(ctx, 260 + sw, 106, 10)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.arc(260 + sw, 103, 11, Math.PI, 0)
  ctx.fill()
  wing(false)
}

/** A pink pig flying on little feathered wings, curly tail, trotters tucked. */
function flyingPig(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  ctx.translate(0, 32)
  const flap = Math.sin((f / frames) * TAU)
  const wing = (far: boolean) => {
    ctx.fillStyle = far ? '#e2e8f0' : color2
    ctx.beginPath()
    ctx.moveTo(110, 60)
    ctx.quadraticCurveTo(80, 40 - 40 * flap, 60, 20 - 46 * flap)
    ctx.quadraticCurveTo(100, 30 - 20 * flap, 130, 58)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(148,163,184,0.7)'
    ctx.lineWidth = 1.5
    for (let k = 1; k < 4; k++) {
      ctx.beginPath()
      ctx.moveTo(112 + k * 4, 60)
      ctx.lineTo(70 + k * 12, 26 - 40 * flap + k * 6)
      ctx.stroke()
    }
  }
  wing(true)
  // Curly tail.
  ctx.strokeStyle = shade(color, -0.15)
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(44, 78)
  ctx.bezierCurveTo(28, 64, 18, 84, 30, 88)
  ctx.bezierCurveTo(40, 92, 38, 74, 26, 72)
  ctx.stroke()
  // Trotters tucked under.
  ctx.fillStyle = shade(color, -0.1)
  for (const x of [70, 94, 140, 162]) {
    ctx.beginPath()
    ctx.roundRect(x - 8, 100, 16, 22, 6)
    ctx.fill()
    ctx.fillStyle = '#7c2d12'
    ctx.fillRect(x - 8, 116, 16, 6)
    ctx.fillStyle = shade(color, -0.1)
  }
  // Round body and head with snout.
  const g = ctx.createRadialGradient(100, 70, 10, 110, 84, 80)
  g.addColorStop(0, shade(color, 0.35))
  g.addColorStop(1, shade(color, -0.1))
  ctx.fillStyle = g
  ellipse(ctx, 110, 84, 70, 34)
  ctx.fill()
  ellipse(ctx, 176, 72, 32, 28)
  ctx.fill()
  ctx.fillStyle = shade(color, -0.12)
  ctx.beginPath()
  ctx.moveTo(166, 46)
  ctx.lineTo(172, 26)
  ctx.lineTo(186, 46)
  ctx.closePath()
  ctx.fill()
  ellipse(ctx, 206, 78, 12, 14)
  ctx.fill()
  ctx.fillStyle = shade(color, -0.4)
  circle(ctx, 204, 73, 3)
  ctx.fill()
  circle(ctx, 204, 83, 3)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 184, 64, 3.5)
  ctx.fill()
  ctx.fillStyle = 'rgba(244,63,94,0.35)'
  circle(ctx, 182, 86, 7)
  ctx.fill()
  wing(false)
}

/** A white unicorn flying with a rainbow mane and tail, legs galloping. */
function unicorn(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  ctx.translate(0, 14)
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const rainbow = ['#f43f5e', '#f97316', '#facc15', '#22c55e', '#38bdf8', '#a78bfa']
  // Tail streaming.
  rainbow.forEach((c, k) => {
    ctx.strokeStyle = c
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(70, 92 + k * 3)
    ctx.quadraticCurveTo(40, 80 + k * 6 + s * 8, 10, 100 + k * 7 + s * 12)
    ctx.stroke()
  })
  // Legs galloping.
  ctx.lineCap = 'round'
  for (const [x, a, c] of [[90, s, '#e2e8f0'], [170, -s, '#e2e8f0'], [102, -s, color], [182, s, color]] as const) {
    const [ex, ey] = limb(ctx, x, 120, 30, 28, 0.6 + a * 0.6, -0.8 - a * 0.4, 12, c)
    ctx.fillStyle = color2
    circle(ctx, ex, ey, 6)
    ctx.fill()
  }
  // Body.
  const g = ctx.createLinearGradient(0, 70, 0, 140)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(1, shade(color, -0.1))
  ctx.fillStyle = g
  ellipse(ctx, 136, 108, 66, 28)
  ctx.fill()
  // Neck and head.
  ctx.beginPath()
  ctx.moveTo(180, 100)
  ctx.quadraticCurveTo(196, 60, 214, 44)
  ctx.lineTo(234, 60)
  ctx.quadraticCurveTo(212, 90, 200, 116)
  ctx.closePath()
  ctx.fill()
  ellipse(ctx, 236, 56, 26, 16, 0.4)
  ctx.fill()
  ctx.fillStyle = '#f9a8d4'
  circle(ctx, 254, 66, 5)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 232, 50, 3)
  ctx.fill()
  // Golden spiral horn.
  ctx.fillStyle = '#facc15'
  ctx.beginPath()
  ctx.moveTo(222, 40)
  ctx.lineTo(248, 4)
  ctx.lineTo(232, 44)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#ca8a04'
  ctx.lineWidth = 1.5
  for (let k = 1; k < 4; k++) {
    ctx.beginPath()
    ctx.moveTo(224 + k * 5, 38 - k * 9)
    ctx.lineTo(232 + k * 4, 40 - k * 9)
    ctx.stroke()
  }
  // Rainbow mane down the neck.
  rainbow.forEach((c, k) => {
    ctx.fillStyle = c
    ellipse(ctx, 206 - k * 5, 52 + k * 9, 9, 7, -0.6 + s * 0.1)
    ctx.fill()
  })
  // Little wing.
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.beginPath()
  ctx.moveTo(140, 90)
  ctx.quadraticCurveTo(110, 40 - s * 30, 80, 30 - s * 40)
  ctx.quadraticCurveTo(120, 60 - s * 10, 160, 92)
  ctx.closePath()
  ctx.fill()
}

/** A rider sitting cross-legged on a flying carpet whose fringe and edges ripple. */
function magicCarpet(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  ctx.translate(0, 12)
  const p = (f / frames) * TAU
  const wave = (x: number) => Math.sin(p + x * 0.03) * 7
  // Rider: crossed legs, waistcoat, turban.
  ctx.fillStyle = '#7c3aed'
  ellipse(ctx, 160, 92 + wave(160), 34, 12)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.roundRect(142, 40 + wave(160), 36, 50, 10)
  ctx.fill()
  limb(ctx, 172, 52 + wave(160), 20, 20, 1.9, -1.4, 9, SKIN)
  ctx.fillStyle = SKIN
  circle(ctx, 160, 26 + wave(160), 15)
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  ellipse(ctx, 160, 14 + wave(160), 18, 10)
  ctx.fill()
  ctx.fillStyle = '#dc2626'
  circle(ctx, 160, 10 + wave(160), 4)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 166, 26 + wave(160), 2)
  ctx.fill()
  // The carpet, rippling, with a border pattern and tassels.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(20, 100 + wave(20))
  for (let x = 20; x <= 260; x += 10) ctx.lineTo(x, 100 + wave(x))
  for (let x = 260; x >= 20; x -= 10) ctx.lineTo(x - 10, 116 + wave(x))
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = color2
  ctx.lineWidth = 3
  ctx.beginPath()
  for (let x = 30; x <= 250; x += 10) ctx.lineTo(x, 104 + wave(x))
  ctx.stroke()
  ctx.fillStyle = color2
  for (let x = 40; x <= 240; x += 25) {
    ctx.beginPath()
    ctx.moveTo(x, 106 + wave(x))
    ctx.lineTo(x + 6, 110 + wave(x))
    ctx.lineTo(x, 114 + wave(x))
    ctx.lineTo(x - 6, 110 + wave(x))
    ctx.closePath()
    ctx.fill()
  }
  ctx.strokeStyle = '#facc15'
  ctx.lineWidth = 2
  for (let x = 14; x <= 254; x += 12) {
    ctx.beginPath()
    ctx.moveTo(x, 117 + wave(x))
    ctx.lineTo(x - 3, 128 + wave(x))
    ctx.stroke()
  }
}

/** A tiny glowing fairy with gauzy wings and a wand. */
function fairy(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const flap = Math.sin((f / frames) * TAU * 2)
  glow(ctx, 70, 64, 64, color2, 0.5)
  ctx.fillStyle = rgba('#e0f2fe', 0.6)
  for (const d of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(56, 44, 30, 12 + flap * 6, d * 0.7 - 0.9, 0, TAU)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(54, 62, 22, 9 + flap * 4, d * 0.4 - 0.2, 0, TAU)
    ctx.fill()
  }
  // Dress like a flower, legs, head with a bun.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(66, 50)
  ctx.lineTo(80, 50)
  ctx.lineTo(92, 84)
  ctx.lineTo(54, 84)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = SKIN
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(68, 84)
  ctx.lineTo(62, 106)
  ctx.moveTo(78, 84)
  ctx.lineTo(80, 104)
  ctx.stroke()
  ctx.fillStyle = SKIN
  circle(ctx, 74, 38, 11)
  ctx.fill()
  ctx.fillStyle = '#facc15'
  circle(ctx, 70, 26, 7)
  ctx.beginPath()
  ctx.arc(73, 36, 12, Math.PI * 1.05, Math.PI * 1.8)
  ctx.fill()
  // Wand with a star that sparkles.
  ctx.strokeStyle = '#f8fafc'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(82, 56)
  ctx.lineTo(108, 34)
  ctx.stroke()
  glow(ctx, 110, 32, 14 + Math.abs(flap) * 6, '#ffffff', 1)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 2.5 : 7
    const a = -Math.PI / 2 + (k * Math.PI) / 5
    ctx.lineTo(110 + Math.cos(a) * r, 32 + Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fill()
}

/** A child superhero flying, fist forward, cape rippling. */
function superhero(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  // Cape rippling behind.
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(150, 56)
  for (let k = 0; k <= 6; k++) ctx.lineTo(150 - k * 22, 46 + Math.sin(p + k) * 8 - k * 2)
  for (let k = 6; k >= 0; k--) ctx.lineTo(150 - k * 22, 86 + Math.sin(p + k + 0.5) * 8 + k * 3)
  ctx.closePath()
  ctx.fill()
  // Legs out straight behind, boots.
  ctx.strokeStyle = color
  ctx.lineWidth = 15
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(110, 74)
  ctx.lineTo(50, 70 + Math.sin(p) * 3)
  ctx.moveTo(110, 80)
  ctx.lineTo(52, 86 - Math.sin(p) * 3)
  ctx.stroke()
  ctx.fillStyle = color2
  ellipse(ctx, 44, 70 + Math.sin(p) * 3, 12, 9)
  ctx.fill()
  ellipse(ctx, 46, 86 - Math.sin(p) * 3, 12, 9)
  ctx.fill()
  // Body with an emblem.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(104, 56, 66, 34, 14)
  ctx.fill()
  ctx.fillStyle = '#facc15'
  ctx.beginPath()
  ctx.moveTo(138, 60)
  ctx.lineTo(150, 73)
  ctx.lineTo(138, 86)
  ctx.lineTo(126, 73)
  ctx.closePath()
  ctx.fill()
  // A lightning bolt on the diamond.
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(141, 63)
  ctx.lineTo(133, 75)
  ctx.lineTo(139, 75)
  ctx.lineTo(135, 84)
  ctx.lineTo(144, 70)
  ctx.lineTo(138, 70)
  ctx.closePath()
  ctx.fill()
  // Arm forward with a fist.
  ctx.strokeStyle = color
  ctx.lineWidth = 12
  ctx.beginPath()
  ctx.moveTo(164, 62)
  ctx.lineTo(214, 52)
  ctx.stroke()
  ctx.fillStyle = SKIN
  circle(ctx, 218, 51, 8)
  ctx.fill()
  // Head with a mask.
  ctx.fillStyle = SKIN
  circle(ctx, 180, 52, 18)
  ctx.fill()
  ctx.fillStyle = '#7c2d12'
  ctx.beginPath()
  ctx.arc(178, 48, 19, Math.PI * 0.9, Math.PI * 1.9)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.fillRect(170, 46, 28, 8)
  ctx.fillStyle = '#ffffff'
  circle(ctx, 188, 50, 3)
  ctx.fill()
}

/** A ladybird flying, red wing cases open, spotted. */
function ladybug(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const flap = Math.sin((f / frames) * TAU * 2)
  ctx.fillStyle = 'rgba(226,232,240,0.55)'
  ellipse(ctx, 50, 30, 30, 10 + Math.abs(flap) * 8, -0.5)
  ctx.fill()
  ellipse(ctx, 50, 70, 30, 10 + Math.abs(flap) * 8, 0.5)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 98, 50, 16)
  ctx.fill()
  ctx.fillStyle = '#fff'
  circle(ctx, 104, 44, 4)
  ctx.fill()
  circle(ctx, 104, 56, 4)
  ctx.fill()
  ctx.strokeStyle = '#111'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(110, 42)
  ctx.quadraticCurveTo(124, 30, 128, 34)
  ctx.moveTo(110, 58)
  ctx.quadraticCurveTo(124, 70, 128, 66)
  ctx.stroke()
  const g = ctx.createRadialGradient(58, 40, 4, 64, 50, 40)
  g.addColorStop(0, shade(color, 0.35))
  g.addColorStop(1, shade(color, -0.2))
  ctx.fillStyle = g
  for (const d of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(62, 50 + d * (6 + flap * 6), 36, 22, d * (0.15 + flap * 0.25), 0, TAU)
    ctx.fill()
  }
  ctx.fillStyle = color2
  for (const [x, y] of [[50, 36], [74, 40], [46, 62], [72, 62], [88, 50]]) {
    circle(ctx, x, y + (y < 50 ? -flap * 6 : flap * 6), 5)
    ctx.fill()
  }
}

/** A moth fluttering, soft patterned wings. */
function moth(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const flap = Math.abs(Math.sin((f / frames) * TAU))
  ctx.save()
  ctx.translate(70, 50)
  for (const d of [-1, 1]) {
    ctx.save()
    ctx.scale(1, 0.25 + 0.75 * flap)
    const g = ctx.createRadialGradient(0, d * 20, 4, 0, d * 22, 44)
    g.addColorStop(0, shade(color, 0.35))
    g.addColorStop(1, shade(color, -0.25))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(30, d * 10, 40, d * 46, -6, d * 48)
    ctx.bezierCurveTo(-36, d * 44, -40, d * 16, 0, 0)
    ctx.fill()
    ctx.fillStyle = color2
    circle(ctx, 4, d * 28, 7)
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, 4, d * 28, 3)
    ctx.fill()
    ctx.restore()
  }
  ctx.fillStyle = shade(color, -0.4)
  ellipse(ctx, 0, 0, 22, 7)
  ctx.fill()
  ctx.strokeStyle = shade(color, -0.4)
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(20, -2)
  ctx.quadraticCurveTo(34, -18, 44, -16)
  ctx.moveTo(20, 2)
  ctx.quadraticCurveTo(34, 18, 44, 16)
  ctx.stroke()
  ctx.restore()
}

// -- wolves on the roof, a rising moon, a piñata, ornaments, icicles, flags -----------------------------

/** A wolf sitting on the roofline: sitting, looking left, looking right, howling; paws at the bottom. */
function roofWolf(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const pose = f % 4
  const fur = color
  // Bushy tail curled round.
  ctx.fillStyle = shade(fur, -0.2)
  ctx.beginPath()
  ctx.moveTo(60, 196)
  ctx.bezierCurveTo(10, 200, 4, 150, 30, 140)
  ctx.bezierCurveTo(30, 170, 50, 182, 74, 184)
  ctx.closePath()
  ctx.fill()
  // Haunches and chest, sitting upright.
  const g = ctx.createLinearGradient(40, 0, 140, 0)
  g.addColorStop(0, shade(fur, -0.15))
  g.addColorStop(1, shade(fur, 0.2))
  ctx.fillStyle = g
  ellipse(ctx, 78, 168, 44, 32)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(60, 170)
  ctx.quadraticCurveTo(70, 100, 100, 84)
  ctx.lineTo(126, 96)
  ctx.quadraticCurveTo(122, 150, 112, 196)
  ctx.lineTo(70, 196)
  ctx.closePath()
  ctx.fill()
  // Pale chest ruff.
  ctx.fillStyle = shade(fur, 0.55)
  ctx.beginPath()
  ctx.moveTo(100, 96)
  ctx.quadraticCurveTo(128, 120, 112, 170)
  ctx.quadraticCurveTo(100, 140, 96, 110)
  ctx.closePath()
  ctx.fill()
  // Front legs and paws.
  ctx.fillStyle = shade(fur, 0.1)
  for (const x of [92, 112]) {
    ctx.beginPath()
    ctx.roundRect(x - 7, 140, 14, 54, 6)
    ctx.fill()
    ellipse(ctx, x + 2, 196, 11, 5)
    ctx.fill()
  }
  // Head: turned left or right, or tipped up to howl.
  const [hx, hy, tilt] = pose === 3 ? [116, 70, -0.9] : pose === 1 ? [104, 74, 0.25] : pose === 2 ? [118, 74, -0.15] : [112, 76, 0]
  ctx.save()
  ctx.translate(hx, hy)
  ctx.rotate(tilt)
  ctx.scale(pose === 1 ? -1 : 1, 1)
  ctx.fillStyle = fur
  ctx.beginPath()
  ctx.moveTo(-22, -6)
  ctx.lineTo(-16, -40)
  ctx.lineTo(-4, -20)
  ctx.lineTo(8, -40)
  ctx.lineTo(14, -14)
  ctx.lineTo(44, 0)
  ctx.lineTo(42, 10)
  ctx.lineTo(4, 22)
  ctx.lineTo(-22, 14)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = shade(fur, 0.5)
  ctx.beginPath()
  ctx.moveTo(14, 6)
  ctx.lineTo(42, 6)
  ctx.lineTo(4, 22)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 44, 3, 4)
  ctx.fill()
  ctx.fillStyle = color2
  ellipse(ctx, 10, -6, 4, 3)
  ctx.fill()
  if (pose === 3) {
    // Mouth open in a howl.
    ctx.fillStyle = '#3f0d12'
    ctx.beginPath()
    ctx.moveTo(30, 8)
    ctx.lineTo(44, 12)
    ctx.lineTo(28, 16)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

/** The moon at one of its phases (frame 0 new, 8 full), with craters and a soft glow. */
function moonPhase(ctx: Ctx, f: number, frames: number, { color }: SpriteColors) {
  const k = (f % frames) / frames
  const r = 70
  ctx.save()
  ctx.translate(100, 100)
  glow(ctx, 0, 0, 100, color, 0.35 * Math.sin(k * Math.PI))
  // The dark part faintly (earthshine), then the lit part.
  ctx.fillStyle = 'rgba(71,85,105,0.25)'
  circle(ctx, 0, 0, r)
  ctx.fill()
  ctx.save()
  circle(ctx, 0, 0, r)
  ctx.clip()
  // Lit region: the right half growing to full, then shrinking from the right.
  const waxing = k < 0.5
  const c = Math.cos(k * TAU) // 1 new, -1 full
  ctx.fillStyle = shade(color, 0.1)
  ctx.beginPath()
  if (waxing) {
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2)
    ctx.ellipse(0, 0, Math.abs(c) * r, r, 0, Math.PI / 2, -Math.PI / 2, c > 0)
  } else {
    ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2)
    ctx.ellipse(0, 0, Math.abs(c) * r, r, 0, -Math.PI / 2, Math.PI / 2, c > 0)
  }
  ctx.fill()
  // Craters, only where it is lit (drawn over everything, then the dark side shaded back).
  ctx.globalCompositeOperation = 'source-atop'
  ctx.fillStyle = 'rgba(100,116,139,0.35)'
  for (const [x, y, cr] of [[-24, -20, 14], [20, 18, 10], [-6, 34, 8], [30, -30, 7], [-36, 20, 6]]) {
    circle(ctx, x, y, cr)
    ctx.fill()
  }
  ctx.restore()
  ctx.restore()
}

/** A donkey piñata in fringed paper stripes, hanging by its back. */
function pinata(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const stripes = [color, color2, '#22c55e', '#38bdf8', '#f472b6', '#facc15']
  const fringe = (x: number, y: number, w: number, h: number, i: number) => {
    ctx.fillStyle = stripes[i % stripes.length]
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = shade(stripes[i % stripes.length], -0.25)
    ctx.lineWidth = 1.5
    for (let k = x + 3; k < x + w; k += 6) {
      ctx.beginPath()
      ctx.moveTo(k, y + h - 6)
      ctx.lineTo(k, y + h)
      ctx.stroke()
    }
  }
  ctx.save()
  ctx.translate(0, f % 2 ? 2 : 0)
  // Legs.
  for (const [x, i] of [[52, 1], [76, 2], [132, 3], [156, 4]] as const) for (let k = 0; k < 4; k++) fringe(x - 10, 120 + k * 14, 20, 14, i + k)
  // Body.
  for (let k = 0; k < 4; k++) fringe(36, 70 + k * 14, 136, 14, k)
  // Neck and head.
  for (let k = 0; k < 5; k++) fringe(150, 20 + k * 12, 26, 12, k + 2)
  for (let k = 0; k < 3; k++) fringe(160, 20 + k * 12, 42, 12, k + 3)
  // Ears and tail.
  fringe(152, 0, 10, 22, 0)
  fringe(166, 0, 10, 22, 1)
  fringe(24, 74, 14, 40, 5)
  ctx.fillStyle = '#111'
  circle(ctx, 186, 30, 3)
  ctx.fill()
  ctx.restore()
}

/** A shiny Christmas bauble with a cap; the highlight turns round with the frames. */
function ornament(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const a = (f / frames) * TAU
  ctx.fillStyle = '#cbd5e1'
  ctx.fillRect(40, 6, 20, 12)
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(50, 4, 5, 0, TAU)
  ctx.stroke()
  const g = ctx.createRadialGradient(50 + Math.cos(a) * 18, 52 - 12, 4, 50, 60, 46)
  g.addColorStop(0, shade(color, 0.6))
  g.addColorStop(0.5, color)
  g.addColorStop(1, shade(color, -0.45))
  ctx.fillStyle = g
  circle(ctx, 50, 60, 42)
  ctx.fill()
  // A band of pattern that turns with it.
  ctx.save()
  circle(ctx, 50, 60, 42)
  ctx.clip()
  ctx.fillStyle = color2
  ctx.fillRect(8, 56, 84, 8)
  for (let k = 0; k < 6; k++) {
    const x = 50 + Math.sin(a + (k * TAU) / 6) * 40
    if (Math.cos(a + (k * TAU) / 6) < 0) continue
    ctx.beginPath()
    ctx.moveTo(x, 44)
    ctx.lineTo(x + 6, 52)
    ctx.lineTo(x, 60)
    ctx.lineTo(x - 6, 52)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ellipse(ctx, 50 + Math.cos(a) * 18, 40, 7, 4, -0.5)
  ctx.fill()
}

/** A cluster of icicles of different lengths hanging from the top of the cell. */
function icicles(ctx: Ctx, f: number, _n: number, { color }: SpriteColors) {
  const lens = [[14, 90], [34, 140], [54, 70], [72, 170], [92, 110], [110, 60], [128, 130]]
  lens.forEach(([x, len], i) => {
    const l = len * (0.85 + 0.15 * ((f + i) % 3) / 2)
    const g = ctx.createLinearGradient(x - 8, 0, x + 8, 0)
    g.addColorStop(0, rgba(color, 0.55))
    g.addColorStop(0.5, 'rgba(255,255,255,0.95)')
    g.addColorStop(1, rgba(color, 0.7))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(x - 9, 0)
    ctx.quadraticCurveTo(x - 6, l * 0.5, x, l)
    ctx.quadraticCurveTo(x + 6, l * 0.5, x + 9, 0)
    ctx.closePath()
    ctx.fill()
  })
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.beginPath()
  ctx.roundRect(0, 0, 142, 10, 5)
  ctx.fill()
}

/** One drop of water falling from an icicle. */
function waterDrop(ctx: Ctx, _f: number, _n: number, { color }: SpriteColors) {
  ctx.fillStyle = rgba(color, 0.85)
  ctx.beginPath()
  ctx.moveTo(16, 2)
  ctx.bezierCurveTo(26, 18, 28, 30, 16, 30)
  ctx.bezierCurveTo(4, 30, 6, 18, 16, 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  circle(ctx, 13, 22, 3)
  ctx.fill()
}

/** A flag on a pole, rippling; stripes in the first colour, the corner in the second, with stars. */
function waveFlag(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const wave = (x: number) => Math.sin(p - x * 0.05) * (x - 20) * 0.08
  ctx.fillStyle = '#d4d4d8'
  ctx.fillRect(14, 10, 6, 210)
  ctx.fillStyle = '#facc15'
  circle(ctx, 17, 8, 7)
  ctx.fill()
  const W = 170
  const H = 100
  const rows = 13
  const step = 10
  for (let r = 0; r < rows; r++) {
    ctx.fillStyle = r % 2 ? '#f8fafc' : color
    ctx.beginPath()
    for (let x = 20; x <= 20 + W; x += step) ctx.lineTo(x, 22 + (r * H) / rows + wave(x))
    for (let x = 20 + W; x >= 20; x -= step) ctx.lineTo(x, 22 + ((r + 1) * H) / rows + wave(x) + 0.5)
    ctx.closePath()
    ctx.fill()
  }
  // The corner with stars.
  ctx.fillStyle = color2
  ctx.beginPath()
  for (let x = 20; x <= 92; x += step) ctx.lineTo(x, 22 + wave(x))
  for (let x = 92; x >= 20; x -= step) ctx.lineTo(x, 22 + (7 * H) / rows + wave(x))
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      const x = 28 + c * 14 + (r % 2) * 7
      if (x > 88) continue
      circle(ctx, x, 30 + r * 12 + wave(x), 2.2)
      ctx.fill()
    }
  }
  // Shading along the ripple.
  for (let x = 20; x < 20 + W; x += step) {
    const s = Math.cos(p - x * 0.05)
    ctx.fillStyle = s > 0 ? `rgba(255,255,255,${s * 0.12})` : `rgba(0,0,0,${-s * 0.18})`
    ctx.beginPath()
    ctx.moveTo(x, 22 + wave(x))
    ctx.lineTo(x + step, 22 + wave(x + step))
    ctx.lineTo(x + step, 22 + H + wave(x + step))
    ctx.lineTo(x, 22 + H + wave(x))
    ctx.closePath()
    ctx.fill()
  }
}


// -- presents that open, a cauldron, carved pumpkins, bunnies in burrows, a helicopter, sprinklers, snow globes --

/** A present opening for people: wrapped, shaking, lid lifting, and a teddy bear popping out. */
function giftBox(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const stage = f % 4
  // The teddy rising out of it.
  if (stage === 3) {
    ctx.fillStyle = '#b45309'
    circle(ctx, 80, 64, 30)
    ctx.fill()
    circle(ctx, 56, 40, 11)
    ctx.fill()
    circle(ctx, 104, 40, 11)
    ctx.fill()
    ctx.fillStyle = '#fde68a'
    ellipse(ctx, 80, 74, 13, 10)
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, 70, 58, 3.5)
    ctx.fill()
    circle(ctx, 90, 58, 3.5)
    ctx.fill()
    circle(ctx, 80, 70, 4)
    ctx.fill()
    ctx.strokeStyle = '#b45309'
    ctx.lineWidth = 12
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(56, 100)
    ctx.lineTo(34, 70)
    ctx.moveTo(104, 100)
    ctx.lineTo(126, 70)
    ctx.stroke()
  }
  // The box.
  const g = ctx.createLinearGradient(20, 0, 140, 0)
  g.addColorStop(0, shade(color, -0.25))
  g.addColorStop(1, shade(color, 0.15))
  ctx.fillStyle = g
  ctx.fillRect(22, 104, 116, 92)
  ctx.fillStyle = color2
  ctx.fillRect(72, 104, 16, 92)
  // The lid: on, lifted a little, or flipped back.
  const lid = stage === 2 ? -26 : stage === 3 ? -60 : 0
  ctx.save()
  ctx.translate(stage === 3 ? 30 : 0, lid)
  ctx.rotate(stage === 3 ? -0.5 : 0)
  ctx.fillStyle = shade(color, 0.1)
  ctx.fillRect(16, 88, 128, 20)
  ctx.fillStyle = color2
  ctx.fillRect(72, 88, 16, 20)
  // A bow on top.
  ctx.beginPath()
  ctx.ellipse(66, 80, 16, 10, -0.4, 0, TAU)
  ctx.ellipse(94, 80, 16, 10, 0.4, 0, TAU)
  ctx.fill()
  ctx.fillStyle = shade(color2, -0.25)
  circle(ctx, 80, 84, 6)
  ctx.fill()
  ctx.restore()
}

/** A witch's cauldron on three legs over a fire, bubbling green. */
function cauldron(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  // Fire underneath.
  for (let k = 0; k < 5; k++) {
    const x = 60 + k * 20
    const h = 26 + Math.sin(p * 2 + k * 1.7) * 8
    ctx.fillStyle = k % 2 ? '#f97316' : '#facc15'
    ctx.beginPath()
    ctx.moveTo(x - 10, 214)
    ctx.quadraticCurveTo(x, 214 - h * 1.4, x + 10, 214)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = '#44403c'
  ctx.fillRect(48, 210, 124, 8)
  // Glow from the brew.
  glow(ctx, 110, 80, 90, color, 0.45)
  // Pot.
  const g = ctx.createRadialGradient(90, 120, 10, 110, 140, 80)
  g.addColorStop(0, '#52525b')
  g.addColorStop(1, '#09090b')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(40, 96)
  ctx.bezierCurveTo(30, 200, 190, 200, 180, 96)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#27272a'
  ctx.lineWidth = 7
  for (const [x0, x1] of [[60, 50], [160, 170], [110, 110]]) {
    ctx.beginPath()
    ctx.moveTo(x0, 176)
    ctx.lineTo(x1, 210)
    ctx.stroke()
  }
  // The brew, bubbles popping.
  ctx.fillStyle = color
  ellipse(ctx, 110, 96, 72, 14)
  ctx.fill()
  for (let k = 0; k < 6; k++) {
    const q = (f / frames + k / 6) % 1
    const x = 60 + ((k * 37) % 100)
    ctx.fillStyle = shade(color, 0.35)
    circle(ctx, x, 94 - q * 30, 5 + q * 8)
    ctx.fill()
  }
  ctx.fillStyle = '#3f3f46'
  ellipse(ctx, 110, 96, 74, 16)
  ctx.lineWidth = 8
  ctx.strokeStyle = '#27272a'
  ctx.stroke()
  // A bone poking out.
  ctx.strokeStyle = color2
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(140, 92)
  ctx.lineTo(160, 60 + Math.sin(p) * 4)
  ctx.stroke()
  ctx.fillStyle = color2
  circle(ctx, 158, 58 + Math.sin(p) * 4, 5)
  ctx.fill()
  circle(ctx, 165, 62 + Math.sin(p) * 4, 5)
  ctx.fill()
}

/** One green bubble rising from the cauldron. */
function brewBubble(ctx: Ctx, _f: number, _n: number, { color }: SpriteColors) {
  ctx.strokeStyle = shade(color, 0.4)
  ctx.lineWidth = 3
  ctx.fillStyle = rgba(color, 0.35)
  circle(ctx, 20, 20, 16)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  circle(ctx, 14, 14, 4)
  ctx.fill()
}

/** A carved jack-o'-lantern lit from inside: a grin, or (boo) a shout with wide eyes. */
function litPumpkin(boo: boolean) {
  return (ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) => {
    const flick = [1, 0.85, 0.95, 0.75][f % 4]
    glow(ctx, 100, 104, 96, color2, 0.35 * flick)
    // Ribbed pumpkin.
    for (const [x, rx] of [[62, 40], [138, 40], [84, 42], [116, 42], [100, 44]]) {
      const g = ctx.createRadialGradient(x - 10, 90, 8, x, 110, 70)
      g.addColorStop(0, shade(color, 0.25))
      g.addColorStop(1, shade(color, -0.3))
      ctx.fillStyle = g
      ellipse(ctx, x, 114, rx, 66)
      ctx.fill()
    }
    ctx.fillStyle = '#4d7c0f'
    ctx.beginPath()
    ctx.moveTo(94, 52)
    ctx.quadraticCurveTo(96, 30, 112, 22)
    ctx.lineTo(116, 30)
    ctx.quadraticCurveTo(106, 36, 106, 52)
    ctx.closePath()
    ctx.fill()
    // The carved face, lit.
    const lit = (path: () => void) => {
      const g = ctx.createRadialGradient(100, 120, 4, 100, 120, 60)
      g.addColorStop(0, '#fffbeb')
      g.addColorStop(0.5, color2)
      g.addColorStop(1, shade(color2, -0.4 * (1 - flick)))
      ctx.fillStyle = g
      path()
      ctx.fill()
    }
    const eye = (x: number, d: number) => lit(() => {
      ctx.beginPath()
      if (boo) {
        ctx.ellipse(x, 92, 16, 20, 0, 0, TAU)
      } else {
        ctx.moveTo(x - 16, 104)
        ctx.lineTo(x + d * 4, 78)
        ctx.lineTo(x + 16, 104)
        ctx.closePath()
      }
    })
    eye(74, -1)
    eye(126, 1)
    lit(() => {
      ctx.beginPath()
      ctx.moveTo(100, 108)
      ctx.lineTo(108, 122)
      ctx.lineTo(92, 122)
      ctx.closePath()
    })
    lit(() => {
      ctx.beginPath()
      if (boo) {
        ctx.ellipse(100, 152, 26, 22, 0, 0, TAU)
      } else {
        ctx.moveTo(56, 136)
        for (let k = 0; k <= 8; k++) ctx.lineTo(56 + k * 11, 140 + (k % 2 ? 10 : 0) + Math.sin((k / 8) * Math.PI) * 16)
        ctx.lineTo(144, 136)
        ctx.quadraticCurveTo(100, 196, 56, 136)
        ctx.closePath()
      }
    })
  }
}

/** A rabbit poking up out of its burrow, ears twitching, nose sniffing. */
function burrowBunny(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const s = Math.sin((f / frames) * TAU)
  // Ears.
  for (const [x, a] of [[64, -0.25 + s * 0.08], [96, 0.2 - s * 0.05]] as const) {
    ctx.save()
    ctx.translate(x, 70)
    ctx.rotate(a)
    ctx.fillStyle = color
    ellipse(ctx, 0, -34, 13, 38)
    ctx.fill()
    ctx.fillStyle = color2
    ellipse(ctx, 0, -32, 6, 28)
    ctx.fill()
    ctx.restore()
  }
  const g = ctx.createRadialGradient(72, 90, 6, 80, 110, 60)
  g.addColorStop(0, shade(color, 0.25))
  g.addColorStop(1, shade(color, -0.2))
  ctx.fillStyle = g
  ellipse(ctx, 80, 104, 40, 36)
  ctx.fill()
  ellipse(ctx, 80, 160, 50, 34)
  ctx.fill()
  // Face.
  ctx.fillStyle = '#111'
  circle(ctx, 66, 96, 5)
  ctx.fill()
  circle(ctx, 94, 96, 5)
  ctx.fill()
  ctx.fillStyle = '#fff'
  circle(ctx, 68, 94, 1.6)
  ctx.fill()
  circle(ctx, 96, 94, 1.6)
  ctx.fill()
  ctx.fillStyle = color2
  ellipse(ctx, 80, 112 + s, 6, 4)
  ctx.fill()
  ctx.strokeStyle = 'rgba(17,17,17,0.5)'
  ctx.lineWidth = 1.5
  for (const d of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(80 + d * 6, 114)
    ctx.lineTo(80 + d * 30, 108 + s * 2)
    ctx.moveTo(80 + d * 6, 116)
    ctx.lineTo(80 + d * 30, 120 - s * 2)
    ctx.stroke()
  }
  // Paws on the rim.
  ctx.fillStyle = shade(color, 0.3)
  ellipse(ctx, 62, 140, 12, 9)
  ctx.fill()
  ellipse(ctx, 98, 140, 12, 9)
  ctx.fill()
}

/** A helicopter, rotor a blur, searchlight underneath. */
function helicopter(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  // Tail boom and tail rotor.
  ctx.fillStyle = shade(color, -0.15)
  ctx.beginPath()
  ctx.moveTo(150, 78)
  ctx.lineTo(270, 70)
  ctx.lineTo(270, 80)
  ctx.lineTo(150, 98)
  ctx.closePath()
  ctx.fill()
  ctx.fillRect(258, 46, 12, 34)
  ctx.strokeStyle = 'rgba(203,213,225,0.7)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(264 + Math.cos(p * 3) * 18, 60 + Math.sin(p * 3) * 18)
  ctx.lineTo(264 - Math.cos(p * 3) * 18, 60 - Math.sin(p * 3) * 18)
  ctx.stroke()
  // Body with a big bubble window (facing left).
  const g = ctx.createLinearGradient(0, 50, 0, 130)
  g.addColorStop(0, shade(color, 0.3))
  g.addColorStop(1, shade(color, -0.3))
  ctx.fillStyle = g
  ellipse(ctx, 110, 90, 64, 36)
  ctx.fill()
  ctx.fillStyle = 'rgba(186,230,253,0.85)'
  ctx.beginPath()
  ctx.ellipse(76, 84, 34, 26, 0, Math.PI * 0.95, Math.PI * 2.05)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = color2
  ctx.fillRect(120, 82, 46, 8)
  // Skids.
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(80, 124)
  ctx.lineTo(84, 140)
  ctx.moveTo(136, 124)
  ctx.lineTo(132, 140)
  ctx.moveTo(56, 140)
  ctx.lineTo(160, 140)
  ctx.stroke()
  // Searchlight.
  ctx.fillStyle = '#fef9c3'
  circle(ctx, 70, 120, 7)
  ctx.fill()
  // Main rotor: mast and a blurred disc.
  ctx.fillStyle = '#334155'
  ctx.fillRect(106, 46, 8, 12)
  ctx.fillStyle = 'rgba(148,163,184,0.25)'
  ellipse(ctx, 110, 44, 104, 7)
  ctx.fill()
  ctx.strokeStyle = 'rgba(30,41,59,0.85)'
  ctx.lineWidth = 5
  ctx.beginPath()
  const c = Math.cos(p * 2) * 104
  ctx.moveTo(110 - c, 44)
  ctx.lineTo(110 + c, 44)
  ctx.stroke()
}

/** The searchlight's beam: narrow at the top, wide and soft at the bottom. */
function searchBeam(ctx: Ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, 300)
  g.addColorStop(0, 'rgba(254,249,195,0.75)')
  g.addColorStop(1, 'rgba(254,249,195,0.05)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(90, 0)
  ctx.lineTo(110, 0)
  ctx.lineTo(180, 300)
  ctx.lineTo(20, 300)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(254,249,195,0.25)'
  ellipse(ctx, 100, 294, 80, 6)
  ctx.fill()
}

/** A garden sprinkler head on its spike. */
function sprinklerHead(ctx: Ctx, _f: number, _n: number, { color }: SpriteColors) {
  ctx.fillStyle = '#3f6212'
  ellipse(ctx, 40, 96, 36, 6)
  ctx.fill()
  ctx.fillStyle = '#64748b'
  ctx.fillRect(36, 40, 8, 56)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(24, 26, 32, 22, 8)
  ctx.fill()
  ctx.fillStyle = shade(color, -0.3)
  ctx.fillRect(36, 14, 8, 14)
}

/** A fan of water drops arcing from the sprinkler (the base is at the bottom middle). */
function sprinklerSpray(ctx: Ctx, f: number, frames: number, { color2 }: SpriteColors) {
  const p = f / frames
  for (let k = 0; k < 40; k++) {
    const j = (k % 10) / 10
    const lane = Math.floor(k / 10)
    const q = (p + j) % 1
    const spread = (lane - 1.5) * 0.14
    const x = 150 + (q * 150 + 10) * Math.sin(spread)
    const y = 200 - Math.sin(q * Math.PI) * 170 * (1 - Math.abs(spread)) - q * 20
    ctx.fillStyle = rgba(color2, 0.75 * (1 - q * 0.6))
    ellipse(ctx, x + q * 120, y, 3.5, 5)
    ctx.fill()
  }
}

/** A snow globe with a little house inside; snow swirls more in the later frames, then settles. */
function snowGlobe(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const swirl = f / Math.max(1, frames - 1)
  // Base.
  const b = ctx.createLinearGradient(0, 160, 0, 210)
  b.addColorStop(0, shade(color, 0.2))
  b.addColorStop(1, shade(color, -0.35))
  ctx.fillStyle = b
  ctx.beginPath()
  ctx.moveTo(40, 168)
  ctx.lineTo(160, 168)
  ctx.lineTo(176, 210)
  ctx.lineTo(24, 210)
  ctx.closePath()
  ctx.fill()
  // Glass.
  const g = ctx.createRadialGradient(80, 70, 10, 100, 100, 90)
  g.addColorStop(0, 'rgba(224,242,254,0.45)')
  g.addColorStop(1, 'rgba(56,189,248,0.25)')
  ctx.fillStyle = g
  circle(ctx, 100, 100, 80)
  ctx.fill()
  ctx.save()
  circle(ctx, 100, 100, 78)
  ctx.clip()
  // Snowy ground, a little house and a tree.
  ctx.fillStyle = '#f8fafc'
  ellipse(ctx, 100, 168, 90, 26)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.fillRect(74, 116, 44, 34)
  ctx.fillStyle = '#7f1d1d'
  ctx.beginPath()
  ctx.moveTo(68, 118)
  ctx.lineTo(96, 92)
  ctx.lineTo(124, 118)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#fde047'
  ctx.fillRect(84, 126, 10, 10)
  ctx.fillStyle = '#15803d'
  for (const [y, w] of [[112, 18], [126, 22], [140, 26]]) {
    ctx.beginPath()
    ctx.moveTo(146, y - 18)
    ctx.lineTo(146 + w, y)
    ctx.lineTo(146 - w, y)
    ctx.closePath()
    ctx.fill()
  }
  // Snow: settled on the ground when still, whirling when shaken.
  ctx.fillStyle = '#ffffff'
  for (let k = 0; k < 40; k++) {
    const a = k * 2.4 + swirl * 4
    const r = 10 + ((k * 13) % 60)
    const x = 100 + Math.cos(a) * r * swirl + ((k * 29) % 120 - 60) * (1 - swirl)
    const y = 100 + Math.sin(a) * r * swirl * 0.8 + (60 + (k % 5)) * (1 - swirl)
    circle(ctx, x, y, 2.5)
    ctx.fill()
  }
  ctx.restore()
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ellipse(ctx, 70, 54, 20, 10, -0.6)
  ctx.fill()
}


// -- manta rays, clownfish, anglerfish, starfish, surfers, sailboats, a snowplow, a pirate ship, Rudolph --

/** A manta ray gliding, wingtips rising and falling. */
function mantaRay(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const s = Math.sin((f / frames) * TAU)
  // Long thin tail.
  ctx.strokeStyle = shade(color, -0.3)
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(60, 80)
  ctx.quadraticCurveTo(30, 82 + s * 6, 4, 76)
  ctx.stroke()
  // Wings as one diamond shape that flexes.
  const g = ctx.createLinearGradient(0, 20, 0, 140)
  g.addColorStop(0, shade(color, 0.2))
  g.addColorStop(1, shade(color, -0.35))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(60, 80)
  ctx.quadraticCurveTo(100, 40 - s * 20, 130, 8 - s * 30)
  ctx.quadraticCurveTo(150, 50, 200, 74)
  ctx.quadraticCurveTo(150, 104, 130, 150 + s * 30)
  ctx.quadraticCurveTo(100, 118 + s * 20, 60, 80)
  ctx.fill()
  // Pale underside showing at the edge, head fins and eyes.
  ctx.fillStyle = rgba(color2, 0.6)
  ctx.beginPath()
  ctx.moveTo(150, 80)
  ctx.quadraticCurveTo(170, 72, 200, 74)
  ctx.quadraticCurveTo(172, 86, 150, 80)
  ctx.fill()
  ctx.fillStyle = shade(color, -0.2)
  ellipse(ctx, 206, 68, 10, 5, -0.4)
  ctx.fill()
  ellipse(ctx, 206, 82, 10, 5, 0.4)
  ctx.fill()
  ctx.fillStyle = '#e2e8f0'
  for (let k = 0; k < 6; k++) {
    circle(ctx, 110 + k * 8, 64 + (k % 2) * 6 - s * 4, 2)
    ctx.fill()
  }
}

/** A clownfish: orange with white bands edged in black. */
function clownfish(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const s = Math.sin((f / frames) * TAU)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(26, 50)
  ctx.lineTo(6, 30 + s * 6)
  ctx.lineTo(6, 70 + s * 6)
  ctx.closePath()
  ctx.fill()
  const g = ctx.createRadialGradient(80, 40, 6, 76, 50, 56)
  g.addColorStop(0, shade(color, 0.3))
  g.addColorStop(1, shade(color, -0.2))
  ctx.fillStyle = g
  ellipse(ctx, 74, 50, 52, 28)
  ctx.fill()
  ctx.save()
  ellipse(ctx, 74, 50, 52, 28)
  ctx.clip()
  for (const x of [44, 82, 112]) {
    ctx.fillStyle = '#111'
    ctx.fillRect(x - 9, 0, 18, 100)
    ctx.fillStyle = color2
    ctx.fillRect(x - 6, 0, 12, 100)
  }
  ctx.restore()
  ctx.fillStyle = shade(color, -0.1)
  ellipse(ctx, 70, 82 + s * 2, 14, 7, 0.3)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 112, 44, 5)
  ctx.fill()
  ctx.fillStyle = '#fff'
  circle(ctx, 113, 42, 1.6)
  ctx.fill()
}

/** An anglerfish in the dark, its lure glowing on a stalk, jaws full of teeth. */
function anglerfish(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const s = Math.sin((f / frames) * TAU)
  // Lure.
  ctx.strokeStyle = shade(color, 0.1)
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(130, 56)
  ctx.quadraticCurveTo(150, 4, 196 + s * 4, 26)
  ctx.stroke()
  glow(ctx, 198 + s * 4, 30, 34, color2, 0.9)
  ctx.fillStyle = '#fefce8'
  circle(ctx, 198 + s * 4, 30, 7)
  ctx.fill()
  // Tail.
  ctx.fillStyle = shade(color, -0.25)
  ctx.beginPath()
  ctx.moveTo(40, 100)
  ctx.lineTo(6, 70 + s * 8)
  ctx.lineTo(6, 134 + s * 8)
  ctx.closePath()
  ctx.fill()
  // Body.
  const g = ctx.createRadialGradient(110, 90, 10, 100, 104, 80)
  g.addColorStop(0, shade(color, 0.2))
  g.addColorStop(1, shade(color, -0.4))
  ctx.fillStyle = g
  ellipse(ctx, 100, 104, 70, 54)
  ctx.fill()
  // Wide mouth with teeth.
  ctx.fillStyle = '#0b0b0f'
  ctx.beginPath()
  ctx.moveTo(110, 110)
  ctx.quadraticCurveTo(150, 100, 174, 92)
  ctx.quadraticCurveTo(170, 140, 124, 142)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#f1f5f9'
  for (let k = 0; k < 6; k++) {
    const x = 124 + k * 8
    ctx.beginPath()
    ctx.moveTo(x, 104 - k * 1.6)
    ctx.lineTo(x + 3, 116 - k * 1.6)
    ctx.lineTo(x + 6, 103 - k * 1.6)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x - 2, 140 - k * 2)
    ctx.lineTo(x + 1, 128 - k * 2)
    ctx.lineTo(x + 4, 139 - k * 2)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = '#fefce8'
  circle(ctx, 140, 76, 9)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 142, 76, 4)
  ctx.fill()
  ctx.fillStyle = shade(color, -0.1)
  ellipse(ctx, 92, 140, 18, 10, 0.5 + s * 0.2)
  ctx.fill()
}

/** A starfish creeping along, its arms curling in turn. */
function starfish(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  ctx.save()
  ctx.translate(80, 80)
  const g = ctx.createRadialGradient(-6, -6, 4, 0, 0, 70)
  g.addColorStop(0, shade(color, 0.3))
  g.addColorStop(1, shade(color, -0.25))
  ctx.fillStyle = g
  ctx.beginPath()
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k * TAU) / 5
    const len = 64 + Math.sin(p + k * 1.3) * 6
    const bend = Math.sin(p + k) * 0.12
    ctx.lineTo(Math.cos(a - 0.36) * 22, Math.sin(a - 0.36) * 22)
    ctx.quadraticCurveTo(Math.cos(a + bend) * len * 0.7, Math.sin(a + bend) * len * 0.7, Math.cos(a + bend) * len, Math.sin(a + bend) * len)
    ctx.quadraticCurveTo(Math.cos(a + bend) * len * 0.7, Math.sin(a + bend) * len * 0.7, Math.cos(a + 0.36) * 22, Math.sin(a + 0.36) * 22)
  }
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = color2
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k * TAU) / 5
    for (let j = 1; j <= 3; j++) {
      circle(ctx, Math.cos(a) * j * 15, Math.sin(a) * j * 15, 3.5 - j * 0.6)
      ctx.fill()
    }
  }
  // A friendly face.
  ctx.fillStyle = '#111'
  circle(ctx, -7, -4, 3)
  ctx.fill()
  circle(ctx, 7, -4, 3)
  ctx.fill()
  ctx.strokeStyle = '#111'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, 4, 6, 0.3, Math.PI - 0.3)
  ctx.stroke()
  ctx.restore()
}

/** A surfer standing on a board riding a curling wave. */
function surfer(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  // The wave curling behind.
  const w = ctx.createLinearGradient(0, 120, 0, 230)
  w.addColorStop(0, '#38bdf8')
  w.addColorStop(1, '#0c4a6e')
  ctx.fillStyle = w
  ctx.beginPath()
  ctx.moveTo(0, 230)
  ctx.lineTo(0, 150)
  ctx.bezierCurveTo(10, 100 + s * 4, 60, 90, 80, 120)
  ctx.bezierCurveTo(60, 110, 50, 140, 70, 160)
  ctx.bezierCurveTo(120, 190, 200, 190, 240, 196)
  ctx.lineTo(240, 230)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  for (let k = 0; k < 8; k++) {
    circle(ctx, 20 + k * 8 + Math.sin(p + k) * 2, 104 + Math.abs(k - 4) * 3 + Math.cos(p + k) * 2, 4)
    ctx.fill()
  }
  // Board.
  ctx.save()
  ctx.translate(150, 182)
  ctx.rotate(-0.1 + s * 0.05)
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.ellipse(0, 0, 60, 8, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(-56, -1, 112, 2)
  ctx.restore()
  // Surfer crouched, arms out.
  const lean = s * 0.06
  ctx.save()
  ctx.translate(150, 176)
  ctx.rotate(lean)
  limb(ctx, -12, -54, 28, 28, -0.45, 0.6, 12, '#1e3a8a')
  limb(ctx, 10, -54, 28, 28, 0.55, -0.5, 12, '#1e40af')
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(-16, -104, 34, 54, 10)
  ctx.fill()
  limb(ctx, -10, -96, 24, 22, -2.1, 0.4, 9, SKIN)
  limb(ctx, 14, -96, 24, 22, 2.1, -0.4, 9, SKIN)
  ctx.fillStyle = SKIN
  circle(ctx, 4, -120, 15)
  ctx.fill()
  ctx.fillStyle = '#facc15'
  ctx.beginPath()
  ctx.arc(2, -124, 16, Math.PI * 0.9, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** A little sailboat, sail filled, rocking on the water. */
function sailboat(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  ctx.save()
  ctx.translate(110, 196)
  ctx.rotate(Math.sin(p) * 0.06)
  ctx.translate(-110, -196)
  // Sails.
  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.moveTo(110, 20)
  ctx.quadraticCurveTo(170 + Math.sin(p) * 4, 90, 176, 160)
  ctx.lineTo(110, 160)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(104, 40)
  ctx.quadraticCurveTo(60, 100, 48, 160)
  ctx.lineTo(104, 160)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#78350f'
  ctx.fillRect(105, 14, 6, 152)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(110, 8)
  ctx.lineTo(134, 14)
  ctx.lineTo(110, 20)
  ctx.closePath()
  ctx.fill()
  // Hull.
  const g = ctx.createLinearGradient(0, 166, 0, 200)
  g.addColorStop(0, shade(color, 0.15))
  g.addColorStop(1, shade(color, -0.3))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(26, 166)
  ctx.lineTo(196, 166)
  ctx.lineTo(176, 200)
  ctx.lineTo(48, 200)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(34, 172, 154, 4)
  ctx.restore()
  // Water lapping.
  ctx.fillStyle = 'rgba(56,189,248,0.8)'
  ctx.beginPath()
  ctx.moveTo(0, 210)
  for (let x = 0; x <= 220; x += 10) ctx.lineTo(x, 198 + Math.sin(p + x * 0.08) * 4)
  ctx.lineTo(220, 210)
  ctx.closePath()
  ctx.fill()
}

/** A snowplow truck with its blade down, throwing a plume of snow off to the side. */
function snowplow(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  // Snow pushed up in a bank ahead of the blade and thrown off its top in a spray.
  ctx.fillStyle = 'rgba(241,245,249,0.95)'
  ctx.beginPath()
  ctx.moveTo(296, 178)
  ctx.quadraticCurveTo(318, 130, 346, 178)
  ctx.closePath()
  ctx.fill()
  for (let k = 0; k < 34; k++) {
    const q = ((f / frames) + ((k * 0.618) % 1)) % 1
    const vx = 6 + ((k * 0.37) % 1) * 32
    const vy = 100 + ((k * 0.73) % 1) * 60
    const x = 304 + vx * q
    const y = 96 - vy * q + 150 * q * q
    ctx.fillStyle = `rgba(255,255,255,${0.95 * (1 - q * 0.7)})`
    circle(ctx, x, y, 2.5 + ((k * 0.29) % 1) * 3.5)
    ctx.fill()
  }
  // Body: dump bed and cab (facing right).
  ctx.fillStyle = shade(color, -0.15)
  ctx.fillRect(20, 70, 160, 80)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(180, 54, 86, 96, 10)
  ctx.fill()
  ctx.fillStyle = 'rgba(186,230,253,0.9)'
  ctx.fillRect(220, 66, 38, 34)
  // Flashing light on the roof.
  const on = Math.sin(p * 2) > 0
  if (on) glow(ctx, 222, 46, 30, '#f59e0b', 0.9)
  ctx.fillStyle = on ? '#fbbf24' : '#92400e'
  ctx.fillRect(214, 42, 16, 12)
  // Blade.
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(272, 96)
  ctx.lineTo(304, 86)
  ctx.quadraticCurveTo(316, 130, 304, 172)
  ctx.lineTo(272, 160)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = shade(color2, -0.35)
  ctx.lineWidth = 5
  for (const y of [104, 126, 148]) {
    ctx.beginPath()
    ctx.moveTo(276, y)
    ctx.lineTo(306, y + 12)
    ctx.stroke()
  }
  // The sander hopper on the back, with a stripe.
  ctx.fillStyle = color2
  ctx.fillRect(20, 92, 160, 10)
  // Wheels.
  for (const x of [60, 140, 228]) {
    ctx.fillStyle = '#27272a'
    circle(ctx, x, 156, 22)
    ctx.fill()
    ctx.fillStyle = '#a1a1aa'
    circle(ctx, x, 156, 10)
    ctx.fill()
    ctx.strokeStyle = '#52525b'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(p) * 12, 156 + Math.sin(p) * 12)
    ctx.lineTo(x - Math.cos(p) * 12, 156 - Math.sin(p) * 12)
    ctx.stroke()
  }
}

/** A pirate ship sailing, skull flag flying, cannon ports along the side. */
function pirateShip(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  ctx.save()
  ctx.translate(150, 210)
  ctx.rotate(Math.sin(p) * 0.04)
  ctx.translate(-150, -210)
  // Masts and sails.
  for (const [x, h] of [[110, 170], [190, 140]]) {
    ctx.fillStyle = '#78350f'
    ctx.fillRect(x - 3, 210 - h - 30, 6, h)
    for (let k = 0; k < 2; k++) {
      const top = 210 - h - 16 + k * 58
      ctx.fillStyle = '#f5f5f4'
      ctx.beginPath()
      ctx.moveTo(x - 42, top)
      ctx.quadraticCurveTo(x + 6 + Math.sin(p) * 3, top + 26, x - 42, top + 50)
      ctx.lineTo(x + 42, top + 50)
      ctx.quadraticCurveTo(x + 52 + Math.sin(p) * 3, top + 26, x + 42, top)
      ctx.closePath()
      ctx.fill()
    }
  }
  // Skull flag.
  ctx.fillStyle = '#111'
  ctx.beginPath()
  ctx.moveTo(110, 12)
  for (let x = 110; x >= 70; x -= 8) ctx.lineTo(x, 12 + Math.sin(p * 2 + x * 0.2) * 3)
  for (let x = 70; x <= 110; x += 8) ctx.lineTo(x, 40 + Math.sin(p * 2 + x * 0.2) * 3)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  circle(ctx, 90, 24, 6)
  ctx.fill()
  ctx.fillRect(84, 30, 12, 4)
  // Hull.
  const g = ctx.createLinearGradient(0, 160, 0, 230)
  g.addColorStop(0, shade(color, 0.15))
  g.addColorStop(1, shade(color, -0.35))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(20, 160)
  ctx.lineTo(280, 166)
  ctx.lineTo(258, 230)
  ctx.lineTo(56, 230)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = color2
  ctx.fillRect(30, 176, 244, 6)
  ctx.fillStyle = '#111'
  for (let k = 0; k < 5; k++) {
    circle(ctx, 80 + k * 38, 198, 7)
    ctx.fill()
  }
  ctx.restore()
  ctx.fillStyle = 'rgba(56,189,248,0.75)'
  ctx.beginPath()
  ctx.moveTo(0, 240)
  for (let x = 0; x <= 300; x += 12) ctx.lineTo(x, 226 + Math.sin(p + x * 0.07) * 5)
  ctx.lineTo(300, 240)
  ctx.closePath()
  ctx.fill()
}

/** A reindeer flying, legs tucked, with a glowing red nose. */
function rudolph(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  ctx.translate(0, 10)
  // Legs, galloping through the air.
  for (const [x, a, c] of [[70, s, shade(color, -0.25)], [150, -s, shade(color, -0.25)], [84, -s, color], [164, s, color]] as const) {
    const [ex, ey] = limb(ctx, x, 110, 28, 26, 0.9 + a * 0.5, -1.2 - a * 0.3, 10, c)
    ctx.fillStyle = '#292524'
    circle(ctx, ex, ey, 5)
    ctx.fill()
  }
  const g = ctx.createLinearGradient(0, 70, 0, 130)
  g.addColorStop(0, shade(color, 0.2))
  g.addColorStop(1, shade(color, -0.2))
  ctx.fillStyle = g
  ellipse(ctx, 116, 100, 60, 24)
  ctx.fill()
  ctx.fillStyle = '#fef3c7'
  ellipse(ctx, 60, 92, 10, 8)
  ctx.fill()
  // Neck and head.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(156, 92)
  ctx.quadraticCurveTo(176, 60, 196, 54)
  ctx.lineTo(206, 70)
  ctx.quadraticCurveTo(184, 84, 174, 108)
  ctx.closePath()
  ctx.fill()
  ellipse(ctx, 210, 62, 24, 14, 0.25)
  ctx.fill()
  // Antlers.
  ctx.strokeStyle = '#a16207'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  for (const d of [0, 10]) {
    ctx.beginPath()
    ctx.moveTo(196 + d, 50)
    ctx.lineTo(186 + d, 18)
    ctx.moveTo(190 + d, 32)
    ctx.lineTo(176 + d, 24)
    ctx.moveTo(188 + d, 24)
    ctx.lineTo(198 + d, 10)
    ctx.stroke()
  }
  ctx.fillStyle = '#111'
  circle(ctx, 210, 56, 3)
  ctx.fill()
  // The nose, glowing, brighter on the beat.
  glow(ctx, 234, 68, 26 + Math.abs(s) * 8, color2, 0.9)
  ctx.fillStyle = color2
  circle(ctx, 234, 68, 8)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  circle(ctx, 232, 65, 2.5)
  ctx.fill()
  // A bell collar.
  ctx.strokeStyle = '#b91c1c'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(168, 84)
  ctx.lineTo(184, 98)
  ctx.stroke()
  ctx.fillStyle = '#facc15'
  circle(ctx, 178, 100, 5)
  ctx.fill()
}


// -- fountains, spider webs, leaf piles, puddles, garden gnomes, a cuckoo clock, robins, peacocks,
//    a pot of gold, Easter eggs, teddy bears and diyas ----------------------------------------

/** A firework fountain: a cone on the ground throwing up a spray of sparks that arc over and fall. */
function fountain(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = f / frames
  for (let k = 0; k < 70; k++) {
    const q = (p + ((k * 0.618) % 1)) % 1
    const a = ((k * 0.37) % 1 - 0.5) * 0.9
    const v = 380 * (0.75 + ((k * 0.73) % 1) * 0.25)
    const x = 130 + Math.sin(a) * v * q
    const y = 214 - Math.cos(a) * v * q + 270 * q * q
    const c = k % 3 === 0 ? '#ffffff' : k % 3 === 1 ? color : color2
    ctx.fillStyle = rgba(c, 1 - q * q)
    circle(ctx, x, y, 3.5 * (1 - q * 0.5))
    ctx.fill()
    // A short streak behind each spark.
    ctx.strokeStyle = rgba(c, 0.4 * (1 - q))
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x - Math.sin(a) * 14, y + Math.cos(a) * 14 - 20 * q)
    ctx.stroke()
  }
  glow(ctx, 130, 210, 34, color, 0.8)
  ctx.fillStyle = '#7c2d12'
  ctx.beginPath()
  ctx.moveTo(116, 246)
  ctx.lineTo(124, 214)
  ctx.lineTo(136, 214)
  ctx.lineTo(144, 246)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = color2
  ctx.fillRect(120, 226, 20, 6)
}

/** A spider's web strung in a corner, dew catching the light. */
function spiderWeb(ctx: Ctx, _f: number, _n: number, { color }: SpriteColors) {
  ctx.strokeStyle = rgba(color, 0.85)
  ctx.lineWidth = 2
  const cx = 110
  const cy = 110
  const spokes = 10
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * TAU
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(a) * 104, cy + Math.sin(a) * 104)
    ctx.stroke()
  }
  for (let r = 14; r < 104; r += 13) {
    ctx.beginPath()
    for (let k = 0; k <= spokes; k++) {
      const a = (k / spokes) * TAU
      const a0 = ((k - 0.5) / spokes) * TAU
      if (k === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
      else ctx.quadraticCurveTo(cx + Math.cos(a0) * r * 0.9, cy + Math.sin(a0) * r * 0.9, cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    }
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(224,242,254,0.9)'
  for (let k = 0; k < 9; k++) {
    const a = k * 2.3
    const r = 20 + ((k * 31) % 80)
    circle(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.2)
    ctx.fill()
  }
}

/** A plump spider scuttling, its eight legs stepping in turn; lit grey with markings, so it shows when projected. */
function webSpider(ctx: Ctx, f: number, frames: number, { color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const d of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const swing = Math.sin(p + k * 1.6 + (d > 0 ? Math.PI : 0)) * 0.16
      // Out from the body, up to the knee, down to the foot.
      const a = -0.9 + k * 0.6 + swing
      const kx = 50 + d * Math.cos(a) * 26
      const ky = 54 + Math.sin(a) * 20 - 14
      const fx = 50 + d * (Math.cos(a) * 42 + 4)
      const fy = 54 + Math.sin(a) * 34 + 8
      ctx.strokeStyle = '#a1a1aa'
      ctx.lineWidth = 4.5
      ctx.beginPath()
      ctx.moveTo(50 + d * 8, 54)
      ctx.lineTo(kx, ky)
      ctx.lineTo(fx, fy)
      ctx.stroke()
    }
  }
  const g = ctx.createRadialGradient(44, 56, 4, 50, 64, 26)
  g.addColorStop(0, '#a1a1aa')
  g.addColorStop(1, '#3f3f46')
  ctx.fillStyle = g
  ellipse(ctx, 50, 66, 19, 22)
  ctx.fill()
  ctx.fillStyle = '#71717a'
  circle(ctx, 50, 40, 12)
  ctx.fill()
  // An hourglass marking on its back.
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(43, 58)
  ctx.lineTo(57, 58)
  ctx.lineTo(50, 66)
  ctx.lineTo(57, 74)
  ctx.lineTo(43, 74)
  ctx.lineTo(50, 66)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#fff'
  circle(ctx, 45, 37, 3.2)
  ctx.fill()
  circle(ctx, 55, 37, 3.2)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 45, 38, 1.5)
  ctx.fill()
  circle(ctx, 55, 38, 1.5)
  ctx.fill()
}

/** A pile of autumn leaves. */
function leafPile(ctx: Ctx, _f: number, _n: number, { color, color2 }: SpriteColors) {
  const cols = [color, color2, '#b45309', '#dc2626', '#facc15', '#92400e']
  for (let k = 0; k < 70; k++) {
    const x = 20 + ((k * 53) % 200)
    const top = 110 - Math.sin(((x - 20) / 200) * Math.PI) * 80
    const y = top + ((k * 29) % Math.max(1, 120 - top))
    ctx.save()
    ctx.translate(x, Math.min(118, y))
    ctx.rotate(k * 1.7)
    ctx.fillStyle = cols[k % cols.length]
    ctx.beginPath()
    ctx.moveTo(-12, 0)
    ctx.quadraticCurveTo(0, -9, 12, 0)
    ctx.quadraticCurveTo(0, 9, -12, 0)
    ctx.fill()
    ctx.restore()
  }
}

/** One leaf, for the ones flying out of the pile. */
function pileLeaf(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  ctx.fillStyle = [color, color2, '#dc2626', '#facc15'][f % 4]
  ctx.beginPath()
  ctx.moveTo(4, 20)
  ctx.quadraticCurveTo(20, 2, 36, 20)
  ctx.quadraticCurveTo(20, 38, 4, 20)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(4, 20)
  ctx.lineTo(36, 20)
  ctx.stroke()
}

/** A puddle with rings spreading across it. */
function puddle(ctx: Ctx, f: number, frames: number, { color }: SpriteColors) {
  const p = f / frames
  const g = ctx.createRadialGradient(110, 40, 10, 110, 40, 110)
  g.addColorStop(0, rgba(color, 0.65))
  g.addColorStop(1, rgba(color, 0.35))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(110, 40, 104, 32, 0, 0, TAU)
  ctx.fill()
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(110, 40, 102, 30, 0, 0, TAU)
  ctx.clip()
  for (let k = 0; k < 3; k++) {
    const q = (p + k / 3) % 1
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - q)})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(80 + k * 30, 36 + k * 4, 10 + q * 60, 3 + q * 18, 0, 0, TAU)
    ctx.stroke()
  }
  ctx.restore()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ellipse(ctx, 70, 30, 24, 4, -0.1)
  ctx.fill()
}

/** A garden gnome with a pointed hat and white beard, walking. */
function gnome(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  // Boots.
  for (const [x, a] of [[66, s], [94, -s]] as const) {
    ctx.fillStyle = '#3f2a1d'
    ellipse(ctx, x + a * 8, 226 - Math.max(0, a) * 6, 15, 9)
    ctx.fill()
  }
  // Coat.
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(50, 220)
  ctx.quadraticCurveTo(46, 150, 80, 128)
  ctx.quadraticCurveTo(114, 150, 110, 220)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#3f2a1d'
  ctx.fillRect(50, 186, 60, 8)
  // Arms.
  limb(ctx, 56, 150, 24, 22, -0.5 - s * 0.3, 0.6, 12, color2)
  limb(ctx, 104, 150, 24, 22, 0.5 + s * 0.3, -0.6, 12, color2)
  // Face, big nose, white beard.
  ctx.fillStyle = SKIN
  circle(ctx, 80, 112, 22)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(58, 112)
  ctx.quadraticCurveTo(60, 172, 80, 176)
  ctx.quadraticCurveTo(100, 172, 102, 112)
  ctx.quadraticCurveTo(80, 126, 58, 112)
  ctx.fill()
  ctx.fillStyle = '#f9a8a8'
  circle(ctx, 80, 114, 8)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 72, 104, 2.5)
  ctx.fill()
  circle(ctx, 88, 104, 2.5)
  ctx.fill()
  // Tall pointed hat, flopping a little.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(54, 104)
  ctx.quadraticCurveTo(70, 50, 82 + s * 6, 6)
  ctx.quadraticCurveTo(96, 60, 106, 104)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = shade(color, -0.2)
  ctx.fillRect(54, 98, 52, 8)
}

/** A cuckoo clock (the house): carved roof, a little door at the top, pine-cone weights. Hands are rows of their own. */
function cuckooClock(ctx: Ctx, _f: number, _n: number, { color, color2 }: SpriteColors) {
  // Pine-cone weights on chains.
  ctx.strokeStyle = '#a8a29e'
  ctx.lineWidth = 2
  for (const x of [80, 120]) {
    ctx.beginPath()
    ctx.moveTo(x, 200)
    ctx.lineTo(x, x === 80 ? 270 : 250)
    ctx.stroke()
    ctx.fillStyle = '#78350f'
    ellipse(ctx, x, x === 80 ? 282 : 262, 9, 16)
    ctx.fill()
  }
  // House.
  const g = ctx.createLinearGradient(30, 0, 170, 0)
  g.addColorStop(0, shade(color, -0.25))
  g.addColorStop(1, shade(color, 0.1))
  ctx.fillStyle = g
  ctx.fillRect(36, 70, 128, 134)
  // Roof with carved leaves.
  ctx.fillStyle = shade(color, -0.4)
  ctx.beginPath()
  ctx.moveTo(18, 84)
  ctx.lineTo(100, 8)
  ctx.lineTo(182, 84)
  ctx.lineTo(168, 84)
  ctx.lineTo(100, 26)
  ctx.lineTo(32, 84)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = color2
  for (let k = 0; k < 5; k++) {
    ellipse(ctx, 60 + k * 20, 210, 8, 5, k * 0.5)
    ctx.fill()
  }
  // The little door the bird comes out of.
  ctx.fillStyle = '#1c1917'
  ctx.beginPath()
  ctx.roundRect(88, 40, 24, 30, [12, 12, 0, 0])
  ctx.fill()
  // Clock face.
  ctx.fillStyle = '#fef3c7'
  circle(ctx, 100, 136, 44)
  ctx.fill()
  ctx.strokeStyle = shade(color, -0.4)
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.fillStyle = '#292524'
  ctx.font = 'bold 12px Georgia, serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let h = 1; h <= 12; h++) {
    const a = (h / 12) * TAU - Math.PI / 2
    ctx.fillText(String(h), 100 + Math.cos(a) * 34, 136 + Math.sin(a) * 34)
  }
  ctx.fillStyle = '#292524'
  circle(ctx, 100, 136, 4)
  ctx.fill()
}

/** One clock hand, pointing up from the bottom middle (frame 0 hour hand, 1 minute hand). */
function clockHand(ctx: Ctx, f: number) {
  const long = f % 2 === 1
  ctx.fillStyle = '#1c1917'
  ctx.beginPath()
  ctx.moveTo(6, 100)
  ctx.lineTo(10, long ? 4 : 34)
  ctx.lineTo(14, 100)
  ctx.closePath()
  ctx.fill()
}

/** The cuckoo, beak open (frame 1) or shut. */
function cuckooBird(ctx: Ctx, f: number, _n: number, { color2 }: SpriteColors) {
  const open = f % 2 === 1
  ctx.fillStyle = '#92400e'
  ellipse(ctx, 40, 44, 28, 20)
  ctx.fill()
  ctx.fillStyle = '#b45309'
  ellipse(ctx, 34, 44, 18, 10, 0.3)
  ctx.fill()
  circle(ctx, 60, 30, 14)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(70, open ? 24 : 27)
  ctx.lineTo(90, 28)
  ctx.lineTo(70, open ? 36 : 32)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 62, 26, 2.5)
  ctx.fill()
}

/** A robin on the roofline: sitting, looking, pecking, singing; feet at the bottom. */
function perchedRobin(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const pose = f % 4
  ctx.fillStyle = shade(color, -0.25)
  ctx.beginPath()
  ctx.moveTo(52, 110)
  ctx.lineTo(16, 140)
  ctx.lineTo(30, 146)
  ctx.lineTo(66, 120)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#a16207'
  ctx.lineWidth = 3
  for (const x of [72, 86]) {
    ctx.beginPath()
    ctx.moveTo(x, 134)
    ctx.lineTo(x + 2, 156)
    ctx.moveTo(x - 6, 158)
    ctx.lineTo(x + 8, 158)
    ctx.stroke()
  }
  ctx.fillStyle = color
  ellipse(ctx, 78, 110, 36, 28, -0.3)
  ctx.fill()
  // Red breast.
  ctx.fillStyle = color2
  ellipse(ctx, 94, 116, 20, 20, -0.3)
  ctx.fill()
  const [hx, hy, tilt] = pose === 2 ? [110, 106, 0.6] : pose === 1 ? [100, 70, -0.1] : pose === 3 ? [102, 70, -0.45] : [104, 72, 0]
  ctx.save()
  ctx.translate(hx, hy)
  ctx.rotate(tilt)
  ctx.fillStyle = color
  circle(ctx, 0, 0, 20)
  ctx.fill()
  ctx.fillStyle = color2
  ellipse(ctx, 8, 10, 10, 8)
  ctx.fill()
  ctx.fillStyle = '#facc15'
  ctx.beginPath()
  ctx.moveTo(16, pose === 3 ? -6 : -2)
  ctx.lineTo(32, 2)
  ctx.lineTo(16, pose === 3 ? 10 : 5)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 6, -4, 3.5)
  ctx.fill()
  ctx.fillStyle = '#fff'
  circle(ctx, 7, -5, 1.2)
  ctx.fill()
  ctx.restore()
  if (pose === 3) {
    // A few notes as it sings.
    ctx.fillStyle = '#e0f2fe'
    ctx.font = 'bold 20px Georgia, serif'
    ctx.fillText('♪', 128, 44)
    ctx.fillText('♫', 142, 24)
  }
}

/** A peacock strutting with its train folded, or (display) fanned out in a great circle of eyes. */
function peacock(display: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const s = Math.sin(p)
    if (display) {
      // The fan, shimmering.
      for (let k = 0; k < 17; k++) {
        const a = Math.PI + (k / 16) * Math.PI
        const len = 98 + Math.sin(p + k) * 4
        ctx.strokeStyle = shade(color, -0.2)
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(110, 150)
        ctx.lineTo(110 + Math.cos(a) * len, 150 + Math.sin(a) * len)
        ctx.stroke()
        ctx.fillStyle = rgba(color, 0.85)
        ellipse(ctx, 110 + Math.cos(a) * (len - 10), 150 + Math.sin(a) * (len - 10), 16, 10, a)
        ctx.fill()
        ctx.fillStyle = color2
        ellipse(ctx, 110 + Math.cos(a) * (len - 10), 150 + Math.sin(a) * (len - 10), 8, 6, a)
        ctx.fill()
        ctx.fillStyle = '#1e3a8a'
        circle(ctx, 110 + Math.cos(a) * (len - 10), 150 + Math.sin(a) * (len - 10), 3.5)
        ctx.fill()
      }
    } else {
      // Long train sweeping behind.
      ctx.fillStyle = shade(color, -0.1)
      ctx.beginPath()
      ctx.moveTo(90, 150)
      ctx.quadraticCurveTo(40, 170, 4, 200 + s * 3)
      ctx.lineTo(10, 214)
      ctx.quadraticCurveTo(60, 196, 100, 170)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = color2
      for (let k = 0; k < 5; k++) {
        circle(ctx, 20 + k * 16, 204 - k * 9 + s * 2, 4)
        ctx.fill()
      }
    }
    // Legs walking (or standing to display).
    const step = display ? 0 : s
    limb(ctx, 104, 176, 24, 22, step * 0.4, -step * 0.2, 5, '#78716c')
    limb(ctx, 116, 176, 24, 22, -step * 0.4, step * 0.2, 5, '#a8a29e')
    // Blue body and long neck.
    const g = ctx.createLinearGradient(0, 100, 0, 190)
    g.addColorStop(0, '#2563eb')
    g.addColorStop(1, '#1e3a8a')
    ctx.fillStyle = g
    ellipse(ctx, 112, 160, 24, 22)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(104, 150)
    ctx.quadraticCurveTo(110, 110, 124, 92)
    ctx.lineTo(134, 98)
    ctx.quadraticCurveTo(124, 120, 124, 154)
    ctx.closePath()
    ctx.fill()
    circle(ctx, 132, 90, 11)
    ctx.fill()
    ctx.fillStyle = '#fde68a'
    ctx.beginPath()
    ctx.moveTo(140, 88)
    ctx.lineTo(152, 92)
    ctx.lineTo(140, 95)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#fff'
    ellipse(ctx, 133, 88, 5, 2.5)
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, 134, 88, 1.8)
    ctx.fill()
    // Crest.
    ctx.strokeStyle = '#1e40af'
    ctx.lineWidth = 1.5
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath()
      ctx.moveTo(130, 80)
      ctx.lineTo(126 + k * 6, 64)
      ctx.stroke()
      ctx.fillStyle = color2
      circle(ctx, 126 + k * 6, 63, 2.5)
      ctx.fill()
    }
  }
}

/** A pot of gold heaped with coins that glint. */
function potOfGold(ctx: Ctx, f: number, frames: number, { color }: SpriteColors) {
  const p = f / frames
  // Coins heaped up.
  for (let k = 0; k < 16; k++) {
    const x = 50 + ((k * 37) % 100)
    const y = 70 - Math.sin(((x - 50) / 100) * Math.PI) * 30 + (k % 3) * 6
    const g = ctx.createLinearGradient(x - 12, y, x + 12, y)
    g.addColorStop(0, '#a16207')
    g.addColorStop(0.5, '#fde047')
    g.addColorStop(1, '#ca8a04')
    ctx.fillStyle = g
    ellipse(ctx, x, y, 13, 6, (k % 5) * 0.2)
    ctx.fill()
  }
  // A glint moving across the heap.
  const gx = 50 + ((p * 3) % 1) * 100
  glow(ctx, gx, 56, 14, '#ffffff', 0.9)
  // The black pot.
  const g = ctx.createRadialGradient(80, 110, 10, 100, 130, 80)
  g.addColorStop(0, '#3f3f46')
  g.addColorStop(1, '#09090b')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(30, 82)
  ctx.bezierCurveTo(10, 200, 190, 200, 170, 82)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#27272a'
  ellipse(ctx, 100, 82, 74, 12)
  ctx.fill()
  ctx.fillStyle = color
  ctx.fillRect(40, 110, 120, 8)
}

/** A rainbow arc (the base is the bottom of the cell). */
function rainbowArc(ctx: Ctx) {
  const cols = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#8b5cf6']
  cols.forEach((c, k) => {
    ctx.strokeStyle = rgba(c, 0.8)
    ctx.lineWidth = 14
    ctx.beginPath()
    ctx.arc(200, 200, 180 - k * 14, Math.PI, 0)
    ctx.stroke()
  })
}

/** A painted Easter egg; each frame is another pattern. */
function easterEgg(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const kind = f % 4
  const base = [color, color2, '#a78bfa', '#34d399'][kind]
  const trim = [color2, color, '#fde047', '#f472b6'][kind]
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(50, 6)
  ctx.bezierCurveTo(88, 6, 96, 80, 92, 96)
  ctx.bezierCurveTo(86, 126, 14, 126, 8, 96)
  ctx.bezierCurveTo(4, 80, 12, 6, 50, 6)
  ctx.closePath()
  const g = ctx.createRadialGradient(36, 40, 6, 50, 70, 70)
  g.addColorStop(0, shade(base, 0.4))
  g.addColorStop(1, shade(base, -0.2))
  ctx.fillStyle = g
  ctx.fill()
  ctx.clip()
  ctx.fillStyle = trim
  if (kind === 0) {
    for (let k = 0; k < 3; k++) {
      ctx.beginPath()
      for (let x = 0; x <= 100; x += 10) ctx.lineTo(x, 44 + k * 26 + (x % 20 ? 6 : -6))
      ctx.lineTo(100, 50 + k * 26)
      ctx.lineTo(0, 50 + k * 26)
      ctx.fill()
    }
  } else if (kind === 1) {
    for (let k = 0; k < 14; k++) {
      circle(ctx, 14 + ((k * 23) % 76), 20 + ((k * 37) % 96), 6)
      ctx.fill()
    }
  } else if (kind === 2) {
    for (let k = 0; k < 4; k++) ctx.fillRect(0, 26 + k * 24, 100, 8)
  } else {
    for (let k = 0; k < 6; k++) {
      ctx.beginPath()
      ctx.moveTo(10 + k * 16, 60)
      ctx.lineTo(18 + k * 16, 48)
      ctx.lineTo(26 + k * 16, 60)
      ctx.lineTo(18 + k * 16, 72)
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.restore()
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ellipse(ctx, 34, 32, 8, 14, 0.4)
  ctx.fill()
}

/** A teddy bear walking, holding a red heart. */
function teddyBear(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const fur = color
  // Legs.
  for (const [x, a] of [[66, s], [100, -s]] as const) {
    ctx.fillStyle = shade(fur, -0.1)
    ellipse(ctx, x + a * 8, 200 - Math.max(0, a) * 6, 16, 22)
    ctx.fill()
    ctx.fillStyle = shade(fur, 0.35)
    ellipse(ctx, x + a * 8 + 4, 216 - Math.max(0, a) * 6, 10, 7)
    ctx.fill()
  }
  // Body.
  const g = ctx.createRadialGradient(76, 140, 10, 84, 160, 60)
  g.addColorStop(0, shade(fur, 0.25))
  g.addColorStop(1, shade(fur, -0.2))
  ctx.fillStyle = g
  ellipse(ctx, 84, 160, 42, 46)
  ctx.fill()
  ctx.fillStyle = shade(fur, 0.35)
  ellipse(ctx, 88, 166, 24, 28)
  ctx.fill()
  // Head and ears.
  ctx.fillStyle = fur
  circle(ctx, 54, 62, 14)
  ctx.fill()
  circle(ctx, 112, 62, 14)
  ctx.fill()
  circle(ctx, 84, 88, 36)
  ctx.fill()
  ctx.fillStyle = shade(fur, 0.4)
  circle(ctx, 54, 62, 7)
  ctx.fill()
  circle(ctx, 112, 62, 7)
  ctx.fill()
  ellipse(ctx, 94, 100, 15, 11)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 74, 82, 4)
  ctx.fill()
  circle(ctx, 100, 82, 4)
  ctx.fill()
  ellipse(ctx, 98, 96, 6, 4)
  ctx.fill()
  // Arms holding a heart out front.
  limb(ctx, 60, 136, 22, 20, 0.8 + s * 0.1, -1.6, 15, shade(fur, -0.05))
  ctx.save()
  ctx.translate(112, 150)
  ctx.scale(1.1, 1.1)
  ctx.fillStyle = color2
  heartPath(ctx, 0, 0, 22)
  ctx.fill()
  ctx.restore()
  limb(ctx, 108, 136, 20, 16, 1.4 + s * 0.1, -1.4, 15, fur)
}

/** A diya: a clay oil lamp with its flame; the frames flicker. */
function diya(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const flick = [1, 0.85, 1.08, 0.9][f % 4]
  glow(ctx, 60, 40, 46 * flick, '#fbbf24', 0.75)
  ctx.save()
  ctx.translate(60, 62)
  ctx.scale(1, flick)
  ctx.fillStyle = '#f59e0b'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(-10, -8, -6, -28, 0, -40)
  ctx.bezierCurveTo(6, -28, 10, -8, 0, 0)
  ctx.fill()
  ctx.fillStyle = '#fef3c7'
  ellipse(ctx, 0, -10, 3, 8)
  ctx.fill()
  ctx.restore()
  // The clay bowl with painted dots.
  const g = ctx.createLinearGradient(0, 60, 0, 96)
  g.addColorStop(0, shade(color, 0.15))
  g.addColorStop(1, shade(color, -0.35))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(14, 64)
  ctx.quadraticCurveTo(60, 120, 106, 64)
  ctx.quadraticCurveTo(84, 54, 60, 62)
  ctx.quadraticCurveTo(36, 54, 14, 64)
  ctx.fill()
  ctx.fillStyle = color2
  for (let k = 0; k < 5; k++) {
    circle(ctx, 30 + k * 15, 76 + Math.abs(k - 2) * -2, 3)
    ctx.fill()
  }
}

// -- Santa in the chimney, candles in the windows, a disco ball, searchlights, the New Year's ball,
//    champagne, firecrackers, graduation caps -----------------------------------------------------

/** Santa from the waist up, waving (frames), to come up out of a chimney. */
function chimneySanta(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const wave = Math.sin(p)
  // Coat.
  const g = ctx.createLinearGradient(40, 0, 160, 0)
  g.addColorStop(0, shade(color, -0.25))
  g.addColorStop(1, shade(color, 0.1))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(44, 200)
  ctx.quadraticCurveTo(40, 120, 100, 112)
  ctx.quadraticCurveTo(160, 120, 156, 200)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(94, 120, 12, 80)
  // One arm waving over his head, the other holding the chimney edge.
  const [hx, hy] = limb(ctx, 146, 132, 34, 32, -2.4 + wave * 0.35, -0.5 + wave * 0.3, 20, color)
  ctx.fillStyle = '#f8fafc'
  circle(ctx, hx, hy, 11)
  ctx.fill()
  limb(ctx, 56, 134, 30, 26, 0.5, -0.6, 20, color)
  ctx.fillStyle = color2
  circle(ctx, 72, 186, 11)
  ctx.fill()
  // Face, cheeks, big white beard.
  ctx.fillStyle = SKIN
  circle(ctx, 100, 82, 28)
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.moveTo(70, 82)
  ctx.quadraticCurveTo(66, 150, 100, 156)
  ctx.quadraticCurveTo(134, 150, 130, 82)
  ctx.quadraticCurveTo(100, 104, 70, 82)
  ctx.fill()
  ctx.fillStyle = '#fca5a5'
  circle(ctx, 84, 88, 6)
  ctx.fill()
  circle(ctx, 116, 88, 6)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 90, 76, 3)
  ctx.fill()
  circle(ctx, 110, 76, 3)
  ctx.fill()
  ctx.fillStyle = '#f1a07a'
  circle(ctx, 100, 88, 6)
  ctx.fill()
  // Mouth open in a laugh.
  ctx.fillStyle = '#7f1d1d'
  ellipse(ctx, 100, 106, 8, 5 + Math.abs(wave) * 3)
  ctx.fill()
  // Hat flopping over.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(70, 70)
  ctx.quadraticCurveTo(96, 20, 140, 38 + wave * 4)
  ctx.lineTo(132, 52)
  ctx.quadraticCurveTo(110, 50, 130, 70)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.roundRect(66, 60, 68, 16, 8)
  ctx.fill()
  circle(ctx, 142, 40 + wave * 4, 10)
  ctx.fill()
}

/** A brick chimney with snow on top (Santa comes up out of it). */
function chimney(ctx: Ctx) {
  ctx.fillStyle = '#9a3412'
  ctx.fillRect(10, 30, 180, 130)
  ctx.strokeStyle = '#7c2d12'
  ctx.lineWidth = 3
  for (let r = 0; r < 6; r++) {
    const y = 30 + r * 22
    ctx.beginPath()
    ctx.moveTo(10, y)
    ctx.lineTo(190, y)
    ctx.stroke()
    for (let x = 10 + (r % 2) * 22; x < 190; x += 44) {
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x, y + 22)
      ctx.stroke()
    }
  }
  ctx.fillStyle = '#7c2d12'
  ctx.fillRect(0, 14, 200, 22)
  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.moveTo(0, 18)
  ctx.quadraticCurveTo(40, 0, 80, 12)
  ctx.quadraticCurveTo(130, 2, 200, 16)
  ctx.lineTo(200, 26)
  ctx.quadraticCurveTo(150, 34, 100, 28)
  ctx.quadraticCurveTo(50, 36, 0, 26)
  ctx.closePath()
  ctx.fill()
}

/** An electric window candle, its bulb flickering (frames), on a little brass base. */
function windowCandle(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const flick = [1, 0.9, 1.06, 0.94][f % 4]
  glow(ctx, 40, 44, 40 * flick, color2, 0.8)
  ctx.save()
  ctx.translate(40, 60)
  ctx.scale(flick, flick)
  ctx.fillStyle = '#fde68a'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(-11, -8, -7, -28, 0, -38)
  ctx.bezierCurveTo(7, -28, 11, -8, 0, 0)
  ctx.fill()
  ctx.fillStyle = '#fffbeb'
  ellipse(ctx, 0, -12, 4, 9)
  ctx.fill()
  ctx.restore()
  const g = ctx.createLinearGradient(28, 0, 52, 0)
  g.addColorStop(0, shade(color, -0.1))
  g.addColorStop(0.5, '#ffffff')
  g.addColorStop(1, shade(color, -0.15))
  ctx.fillStyle = g
  ctx.fillRect(30, 62, 20, 72)
  ctx.fillStyle = '#ca8a04'
  ctx.beginPath()
  ctx.moveTo(18, 150)
  ctx.lineTo(62, 150)
  ctx.lineTo(54, 134)
  ctx.lineTo(26, 134)
  ctx.closePath()
  ctx.fill()
  ellipse(ctx, 40, 150, 26, 6)
  ctx.fill()
}

/** A mirror ball, its facets catching the light as it turns. */
function discoBall(ctx: Ctx, f: number, frames: number, { color }: SpriteColors) {
  const turn = f / frames
  ctx.fillStyle = '#a1a1aa'
  ctx.fillRect(56, 0, 8, 18)
  ctx.save()
  circle(ctx, 60, 72, 52)
  ctx.clip()
  ctx.fillStyle = '#52525b'
  ctx.fillRect(0, 0, 120, 140)
  const rows = 10
  for (let r = 0; r < rows; r++) {
    const lat = -Math.PI / 2 + ((r + 0.5) / rows) * Math.PI
    const y = 72 + Math.sin(lat) * 52
    const rad = Math.cos(lat) * 52
    const cols = Math.max(4, Math.round(16 * Math.cos(lat)))
    for (let c = 0; c < cols; c++) {
      const lon = ((c + turn + (r % 2) * 0.5) / cols) * Math.PI * 2
      const z = Math.cos(lon)
      if (z < 0) continue
      const x = 60 + Math.sin(lon) * rad
      const b = 0.35 + 0.65 * z * (0.5 + 0.5 * Math.sin(lon * 3 + r))
      ctx.fillStyle = (c + r + Math.floor(turn * cols)) % 7 === 0 ? '#ffffff' : `rgba(${Math.round(160 + 90 * b)},${Math.round(165 + 85 * b)},${Math.round(180 + 75 * b)},1)`
      ctx.fillRect(x - (5 * z + 1), y - 4.5, 10 * z + 1.5, 8.5)
    }
  }
  ctx.restore()
  glow(ctx, 40, 50, 18, color, 0.7)
}

/** One spot of coloured light thrown by the mirror ball. */
function lightSpot(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const c = [color, color2, '#ffffff', '#a5f3fc'][f % 4]
  glow(ctx, 20, 20, 20, c, 0.95)
}

/** A searchlight on its stand, pointing up; the beam is its own picture. */
function searchlightBase(ctx: Ctx, _f: number, _n: number, { color }: SpriteColors) {
  ctx.fillStyle = '#3f3f46'
  ctx.beginPath()
  ctx.moveTo(20, 120)
  ctx.lineTo(50, 70)
  ctx.lineTo(70, 70)
  ctx.lineTo(100, 120)
  ctx.closePath()
  ctx.fill()
  const g = ctx.createLinearGradient(30, 0, 90, 0)
  g.addColorStop(0, '#52525b')
  g.addColorStop(0.5, '#a1a1aa')
  g.addColorStop(1, '#52525b')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(30, 26, 60, 50, 10)
  ctx.fill()
  ctx.fillStyle = '#fffbeb'
  ellipse(ctx, 60, 26, 30, 9)
  ctx.fill()
  glow(ctx, 60, 22, 34, color, 0.8)
}

/** A long searchlight beam: its foot at the bottom middle, fading out at the top. */
function skyBeam(ctx: Ctx, _f: number, _n: number, { color }: SpriteColors) {
  const g = ctx.createLinearGradient(0, 600, 0, 0)
  g.addColorStop(0, rgba(color, 0.6))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(44, 600)
  ctx.lineTo(56, 600)
  ctx.lineTo(100, 0)
  ctx.lineTo(0, 0)
  ctx.closePath()
  ctx.fill()
}

/** The New Year's ball: a glittering sphere of crystal triangles, twinkling with the frames. */
function newYearBall(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  glow(ctx, 80, 80, 80, color2, 0.45)
  ctx.save()
  circle(ctx, 80, 80, 62)
  ctx.clip()
  const g = ctx.createRadialGradient(60, 56, 6, 80, 80, 64)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.5, color)
  g.addColorStop(1, shade(color, -0.4))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 160, 160)
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'
  ctx.lineWidth = 1.5
  for (let k = -6; k <= 6; k++) {
    ctx.beginPath()
    ctx.moveTo(0, 80 + k * 13)
    ctx.lineTo(160, 80 + k * 13 - 50)
    ctx.moveTo(0, 80 + k * 13 - 50)
    ctx.lineTo(160, 80 + k * 13)
    ctx.stroke()
  }
  for (let k = 0; k < 12; k++) {
    const on = (k * 5 + f) % 4 === 0
    if (!on) continue
    const x = 30 + ((k * 37) % 100)
    const y = 30 + ((k * 53) % 100)
    glow(ctx, x, y, 12, '#ffffff', 0.95)
  }
  ctx.restore()
}

/** The pole the ball comes down, with the year's lights at the bottom (base at the bottom of the cell). */
function ballPole(ctx: Ctx, _f: number, _n: number, { color2 }: SpriteColors) {
  const g = ctx.createLinearGradient(40, 0, 60, 0)
  g.addColorStop(0, '#71717a')
  g.addColorStop(0.5, '#e4e4e7')
  g.addColorStop(1, '#71717a')
  ctx.fillStyle = g
  ctx.fillRect(44, 0, 12, 470)
  ctx.fillStyle = '#27272a'
  ctx.fillRect(10, 470, 80, 30)
  ctx.fillStyle = color2
  for (let k = 0; k < 4; k++) {
    ctx.fillRect(16 + k * 18, 476, 14, 18)
  }
}

/** A champagne bottle in its foil, cork in (frame 0) or out with foam spilling (frame 1). */
function champagneBottle(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const open = f % 2 === 1
  const g = ctx.createLinearGradient(20, 0, 80, 0)
  g.addColorStop(0, shade(color, -0.35))
  g.addColorStop(0.4, shade(color, 0.3))
  g.addColorStop(1, shade(color, -0.4))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(40, 40)
  ctx.lineTo(60, 40)
  ctx.lineTo(60, 92)
  ctx.quadraticCurveTo(82, 104, 82, 130)
  ctx.lineTo(82, 236)
  ctx.quadraticCurveTo(82, 244, 74, 244)
  ctx.lineTo(26, 244)
  ctx.quadraticCurveTo(18, 244, 18, 236)
  ctx.lineTo(18, 130)
  ctx.quadraticCurveTo(18, 104, 40, 92)
  ctx.closePath()
  ctx.fill()
  // Gold foil and label.
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(38, 36)
  ctx.lineTo(62, 36)
  ctx.lineTo(62, 96)
  ctx.lineTo(38, 96)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#fef3c7'
  ctx.fillRect(24, 150, 52, 50)
  ctx.fillStyle = shade(color2, -0.3)
  ctx.font = 'bold 14px Georgia, serif'
  ctx.textAlign = 'center'
  ctx.fillText('BRUT', 50, 180)
  if (!open) {
    ctx.fillStyle = '#d6b37a'
    ctx.beginPath()
    ctx.roundRect(40, 20, 20, 20, 4)
    ctx.fill()
  } else {
    // Foam frothing over the neck.
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    for (let k = 0; k < 9; k++) {
      circle(ctx, 40 + ((k * 11) % 22), 30 - k * 3, 7 - k * 0.3)
      ctx.fill()
    }
    for (let k = 0; k < 4; k++) {
      ellipse(ctx, 36 + k * 9, 46 + k * 10, 5, 9)
      ctx.fill()
    }
  }
}

/** A cork flying, turning. */
function cork(ctx: Ctx) {
  ctx.fillStyle = '#d6b37a'
  ctx.beginPath()
  ctx.roundRect(8, 4, 24, 32, 5)
  ctx.fill()
  ctx.fillStyle = '#a16207'
  ctx.fillRect(8, 4, 24, 6)
}

/** A string of red firecrackers hanging from the eaves; frame k shows the bottom k gone off. */
function firecrackers(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const gone = f % frames
  ctx.strokeStyle = color2
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(50, 0)
  ctx.lineTo(50, 300)
  ctx.stroke()
  const count = 10
  for (let k = 0; k < count; k++) {
    if (count - k <= gone) continue
    const y = 30 + k * 27
    for (const d of [-1, 1]) {
      ctx.save()
      ctx.translate(50 + d * 14, y)
      ctx.rotate(d * 0.5)
      const g = ctx.createLinearGradient(-7, 0, 7, 0)
      g.addColorStop(0, shade(color, -0.3))
      g.addColorStop(0.5, shade(color, 0.25))
      g.addColorStop(1, shade(color, -0.3))
      ctx.fillStyle = g
      ctx.fillRect(-7, -14, 14, 28)
      ctx.fillStyle = color2
      ctx.fillRect(-7, -14, 14, 4)
      ctx.fillRect(-7, 10, 14, 4)
      ctx.restore()
    }
  }
  // A tassel at the top.
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(40, 0)
  ctx.lineTo(60, 0)
  ctx.lineTo(56, 22)
  ctx.lineTo(44, 22)
  ctx.closePath()
  ctx.fill()
}

/** A bang: a star of light with sparks. */
function bang(ctx: Ctx, f: number, _n: number, { color2 }: SpriteColors) {
  glow(ctx, 50, 50, 50, color2, 0.9)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU + f * 0.3
    const r = k % 2 ? 14 : 40
    ctx.lineTo(50 + Math.cos(a) * r, 50 + Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fill()
}

/** A graduation cap with its tassel, tilted a little differently each frame (they spin as they fly). */
function gradCap(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const a = (f / frames) * TAU
  const squash = 0.35 + 0.65 * Math.abs(Math.cos(a))
  ctx.save()
  ctx.translate(60, 46)
  ctx.scale(1, squash)
  ctx.fillStyle = shade(color, -0.2)
  ctx.beginPath()
  ctx.moveTo(-26, 4)
  ctx.lineTo(26, 4)
  ctx.lineTo(22, 34)
  ctx.lineTo(-22, 34)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, -28)
  ctx.lineTo(56, 0)
  ctx.lineTo(0, 24)
  ctx.lineTo(-56, 0)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = color2
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(60, 46)
  ctx.lineTo(96, 46 + 6 * squash)
  ctx.lineTo(98, 78)
  ctx.stroke()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(92, 76)
  ctx.lineTo(104, 76)
  ctx.lineTo(102, 94)
  ctx.lineTo(94, 94)
  ctx.closePath()
  ctx.fill()
  circle(ctx, 60, 46, 4)
  ctx.fill()
}

// -- a school bus, a tractor, deer, foxes, raccoons, a witch who crashes into the house, rain clouds,
//    hockey players, a lighthouse -------------------------------------------------------------------

/** A yellow school bus driving along (facing right); stopped, its stop sign swings out and the lights flash. */
function schoolBus(stopped: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const bob = stopped ? 0 : Math.sin(p * 2) * 1.5
    ctx.save()
    ctx.translate(0, bob)
    const g = ctx.createLinearGradient(0, 30, 0, 150)
    g.addColorStop(0, shade(color, 0.15))
    g.addColorStop(1, shade(color, -0.2))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.roundRect(14, 34, 300, 112, [16, 30, 8, 8])
    ctx.fill()
    // Hood out front.
    ctx.beginPath()
    ctx.roundRect(300, 80, 50, 66, [4, 16, 8, 4])
    ctx.fill()
    ctx.fillStyle = '#111827'
    ctx.fillRect(14, 112, 336, 8)
    ctx.fillRect(14, 126, 336, 4)
    // Windows, the last one the driver's.
    ctx.fillStyle = 'rgba(186,230,253,0.9)'
    for (let k = 0; k < 6; k++) {
      ctx.beginPath()
      ctx.roundRect(28 + k * 44, 48, 36, 36, 4)
      ctx.fill()
    }
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(296, 46, 6, 66)
    ctx.fillStyle = color2
    ctx.font = 'bold 15px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('SCHOOL BUS', 150, 106)
    // Red and amber lights on the roof corners, flashing when it stops.
    const on = stopped && Math.sin(p * 2) > 0
    for (const x of [24, 290]) {
      if (on) glow(ctx, x, 34, 22, '#ef4444', 0.95)
      ctx.fillStyle = on ? '#fca5a5' : '#991b1b'
      circle(ctx, x, 36, 6)
      ctx.fill()
    }
    ctx.fillStyle = '#fef9c3'
    circle(ctx, 344, 100, 7)
    ctx.fill()
    glow(ctx, 352, 100, 16, '#fef9c3', 0.7)
    if (stopped) {
      // The stop arm out from the side.
      ctx.fillStyle = '#334155'
      ctx.fillRect(206, 88, 26, 6)
      ctx.fillStyle = '#dc2626'
      ctx.beginPath()
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + Math.PI / 8
        ctx.lineTo(246 + Math.cos(a) * 20, 90 + Math.sin(a) * 20)
      }
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 11px Arial, sans-serif'
      ctx.fillText('STOP', 246, 94)
      if (on) glow(ctx, 246, 90, 26, '#ef4444', 0.6)
    }
    ctx.restore()
    for (const x of [70, 282]) {
      ctx.fillStyle = '#27272a'
      circle(ctx, x, 148, 20)
      ctx.fill()
      ctx.fillStyle = '#a1a1aa'
      circle(ctx, x, 148, 9)
      ctx.fill()
      ctx.strokeStyle = '#52525b'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(x + Math.cos(p) * 8, 148 + Math.sin(p) * 8)
      ctx.lineTo(x - Math.cos(p) * 8, 148 - Math.sin(p) * 8)
      ctx.stroke()
    }
  }
}

/** A farm tractor (facing right) chugging, puffing from its stack, the big back wheel turning. */
function tractor(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const chug = Math.sin(p * 4) * 1.5
  ctx.save()
  ctx.translate(0, chug)
  ctx.fillStyle = shade(color, -0.1)
  ctx.beginPath()
  ctx.roundRect(110, 86, 120, 50, 8)
  ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(40, 40, 90, 96, 10)
  ctx.fill()
  ctx.fillStyle = 'rgba(186,230,253,0.85)'
  ctx.fillRect(54, 52, 62, 40)
  ctx.fillStyle = '#334155'
  ctx.fillRect(196, 50, 10, 40)
  ctx.fillStyle = shade(color, -0.35)
  ctx.fillRect(226, 96, 10, 34)
  ctx.restore()
  // A puff from the stack.
  ctx.fillStyle = `rgba(212,212,216,${0.6 - (f / frames) * 0.4})`
  circle(ctx, 204 - (f / frames) * 20, 40 - (f / frames) * 30, 8 + (f / frames) * 10)
  ctx.fill()
  for (const [x, r] of [[72, 46], [206, 26]] as const) {
    ctx.fillStyle = '#18181b'
    circle(ctx, x, 156 - r + 26, r)
    ctx.fill()
    ctx.fillStyle = color2
    circle(ctx, x, 156 - r + 26, r * 0.45)
    ctx.fill()
    ctx.strokeStyle = '#3f3f46'
    ctx.lineWidth = 5
    for (let k = 0; k < 8; k++) {
      const a = p + (k / 8) * TAU
      ctx.beginPath()
      ctx.moveTo(x + Math.cos(a) * r * 0.85, 156 - r + 26 + Math.sin(a) * r * 0.85)
      ctx.lineTo(x + Math.cos(a) * r, 156 - r + 26 + Math.sin(a) * r)
      ctx.stroke()
    }
  }
}

/** A deer walking (facing right), white tail; with alert, standing with its head up and ears turned. */
function deer(alert: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const s = alert ? 0 : Math.sin(p)
    const legs: Array<[number, number]> = [[70, s], [86, -s], [150, -s], [166, s]]
    for (const [x, a] of legs) limb(ctx, x, 120, 34, 32, a * 0.35, -a * 0.25 + 0.1, 7, shade(color, -0.2))
    const g = ctx.createLinearGradient(0, 70, 0, 140)
    g.addColorStop(0, color)
    g.addColorStop(1, shade(color, 0.35))
    ctx.fillStyle = g
    ellipse(ctx, 120, 104, 62, 28)
    ctx.fill()
    // White tail flag (up when alert).
    ctx.fillStyle = '#ffffff'
    ellipse(ctx, 56, alert ? 84 : 96, 8, alert ? 14 : 9, alert ? -0.5 : 0.3)
    ctx.fill()
    // Neck and head: grazing down, or up and watching.
    const [nx, ny] = alert ? [176, 44] : [190, 92 + Math.max(0, Math.sin(p * 0.5)) * 30]
    ctx.strokeStyle = color
    ctx.lineWidth = 22
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(160, 96)
    ctx.lineTo(nx, ny)
    ctx.stroke()
    ctx.fillStyle = color
    ellipse(ctx, nx + 10, ny - 4, 20, 13, alert ? 0.2 : 0.5)
    ctx.fill()
    ctx.fillStyle = shade(color, 0.4)
    ellipse(ctx, nx - 6, ny - 18, 6, 13, -0.4)
    ctx.fill()
    ellipse(ctx, nx + 8, ny - 20, 6, 13, 0.3)
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, nx + 10, ny - 8, 3)
    ctx.fill()
    circle(ctx, nx + 27, ny - 1, 3)
    ctx.fill()
    // A buck's small antlers in the second colour.
    ctx.strokeStyle = color2
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(nx + 2, ny - 16)
    ctx.lineTo(nx - 4, ny - 40)
    ctx.moveTo(nx - 2, ny - 30)
    ctx.lineTo(nx - 14, ny - 36)
    ctx.moveTo(nx + 10, ny - 16)
    ctx.lineTo(nx + 18, ny - 40)
    ctx.moveTo(nx + 15, ny - 30)
    ctx.lineTo(nx + 26, ny - 34)
    ctx.stroke()
  }
}

/** A red fox trotting (facing right), brush tail with a white tip. */
function fox(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  for (const [x, a] of [[64, s], [76, -s], [126, -s], [138, s]] as const) {
    limb(ctx, x, 92, 18, 18, a * 0.45, -a * 0.2, 7, shade(color, -0.5))
  }
  // Tail streaming behind.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(56, 76)
  ctx.quadraticCurveTo(20, 60 + s * 4, 6, 84 + s * 4)
  ctx.quadraticCurveTo(26, 96, 60, 90)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ellipse(ctx, 12, 84 + s * 4, 9, 6, 0.3)
  ctx.fill()
  const g = ctx.createLinearGradient(0, 60, 0, 104)
  g.addColorStop(0, shade(color, 0.1))
  g.addColorStop(1, shade(color, -0.15))
  ctx.fillStyle = g
  ellipse(ctx, 100, 80, 46, 18)
  ctx.fill()
  ctx.fillStyle = color2
  ellipse(ctx, 132, 88, 16, 10)
  ctx.fill()
  // Head with pointed ears and a pointed muzzle.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(130, 70)
  ctx.lineTo(140, 40)
  ctx.lineTo(150, 58)
  ctx.lineTo(160, 40)
  ctx.lineTo(166, 62)
  ctx.lineTo(192, 74)
  ctx.lineTo(160, 86)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(150, 76)
  ctx.lineTo(192, 74)
  ctx.lineTo(160, 86)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 191, 74, 3.5)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(158, 64, 4, 2.4, -0.3, 0, TAU)
  ctx.fill()
}

/** A raccoon popping up, little hands on the rim, masked eyes looking about (frames turn its head). */
function raccoon(ctx: Ctx, f: number, _n: number, { color }: SpriteColors) {
  const look = [-6, 0, 6, 0][f % 4]
  ctx.fillStyle = color
  ellipse(ctx, 80, 120, 46, 50)
  ctx.fill()
  // Head.
  ctx.save()
  ctx.translate(80 + look, 64)
  ctx.fillStyle = color
  ellipse(ctx, 0, 0, 40, 32)
  ctx.fill()
  for (const d of [-1, 1]) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(d * 18, -22)
    ctx.lineTo(d * 30, -44)
    ctx.lineTo(d * 38, -16)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#e7e5e4'
    ellipse(ctx, d * 18, 4, 16, 10)
    ctx.fill()
    // The black mask.
    ctx.fillStyle = '#1c1917'
    ellipse(ctx, d * 15, -4, 14, 9, d * 0.3)
    ctx.fill()
    ctx.fillStyle = '#fff'
    circle(ctx, d * 14 + look * 0.4, -5, 4)
    ctx.fill()
    ctx.fillStyle = '#111'
    circle(ctx, d * 14 + look * 0.6, -5, 2)
    ctx.fill()
  }
  ctx.fillStyle = '#1c1917'
  ellipse(ctx, 0, 12, 6, 4)
  ctx.fill()
  ctx.restore()
  // Hands over the rim.
  ctx.fillStyle = '#44403c'
  ellipse(ctx, 46, 138, 12, 8)
  ctx.fill()
  ellipse(ctx, 114, 138, 12, 8)
  ctx.fill()
}

/** A metal trash can with its lid knocked askew. */
function trashCan(ctx: Ctx) {
  const g = ctx.createLinearGradient(10, 0, 150, 0)
  g.addColorStop(0, '#52525b')
  g.addColorStop(0.45, '#d4d4d8')
  g.addColorStop(1, '#52525b')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(14, 20)
  ctx.lineTo(146, 20)
  ctx.lineTo(136, 160)
  ctx.lineTo(24, 160)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#71717a'
  ctx.lineWidth = 3
  for (const y of [56, 96, 136]) {
    ctx.beginPath()
    ctx.moveTo(16, y)
    ctx.lineTo(144, y)
    ctx.stroke()
  }
  ctx.fillStyle = '#a1a1aa'
  ctx.beginPath()
  ctx.roundRect(4, 10, 152, 14, 6)
  ctx.fill()
}

/** The witch splatted flat against the wall, arms and legs out, hat askew, broom snapped. */
function witchSplat(ctx: Ctx, _f: number, _n: number, { color, color2 }: SpriteColors) {
  const skin = '#9bd16b'
  // Broom in two pieces.
  ctx.strokeStyle = '#78350f'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(20, 40)
  ctx.lineTo(90, 90)
  ctx.moveTo(150, 170)
  ctx.lineTo(210, 210)
  ctx.stroke()
  ctx.fillStyle = '#ca8a04'
  ctx.beginPath()
  ctx.moveTo(206, 200)
  ctx.lineTo(240, 226)
  ctx.lineTo(214, 236)
  ctx.closePath()
  ctx.fill()
  // Arms and legs spread.
  for (const [x, y, a] of [[100, 100, 2.3], [140, 100, -2.3], [108, 150, 0.6], [132, 150, -0.6]] as const) {
    limb(ctx, x, y, 34, 30, a, a > 0 ? 0.3 : -0.3, 14, y < 120 ? color : '#111827')
  }
  // Dress.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(98, 92)
  ctx.lineTo(142, 92)
  ctx.lineTo(160, 160)
  ctx.lineTo(80, 160)
  ctx.closePath()
  ctx.fill()
  // Head squashed, swirly eyes, hat crumpled.
  ctx.fillStyle = skin
  ellipse(ctx, 120, 72, 24, 20)
  ctx.fill()
  ctx.strokeStyle = '#111'
  ctx.lineWidth = 2
  for (const d of [-1, 1]) {
    ctx.beginPath()
    for (let k = 0; k < 14; k++) {
      const a = k * 0.8
      ctx.lineTo(120 + d * 9 + Math.cos(a) * k * 0.45, 68 + Math.sin(a) * k * 0.45)
    }
    ctx.stroke()
  }
  ctx.fillStyle = '#1f2937'
  ctx.beginPath()
  ctx.moveTo(92, 58)
  ctx.lineTo(150, 50)
  ctx.lineTo(126, 18)
  ctx.lineTo(136, 6)
  ctx.lineTo(112, 22)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = color2
  ctx.fillRect(98, 50, 46, 6)
  // Stars of the bump.
  ctx.fillStyle = '#fde047'
  for (const [x, y] of [[74, 40], [168, 34], [160, 80]]) {
    ctx.beginPath()
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU - Math.PI / 2
      const r = k % 2 ? 4 : 10
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fill()
  }
}

/** A puffy rain cloud; frames make its edge billow. Dark when it rains (dark), else pale. */
function rainCloud(dark: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const base = dark ? color2 : color
    const lumps: Array<[number, number, number]> = [[60, 90, 40], [110, 64, 52], [170, 70, 46], [214, 96, 34], [140, 104, 44], [86, 106, 34]]
    for (const [x, y, r] of lumps) {
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 4, x, y, r)
      g.addColorStop(0, shade(base, 0.35))
      g.addColorStop(1, shade(base, -0.15))
      ctx.fillStyle = g
      circle(ctx, x, y + Math.sin(p + x) * 2, r + Math.sin(p * 2 + y) * 1.5)
      ctx.fill()
    }
    ctx.fillStyle = shade(base, -0.1)
    ctx.beginPath()
    ctx.roundRect(40, 100, 190, 32, 16)
    ctx.fill()
  }
}

/** One rain drop streak. */
function rainStreak(ctx: Ctx) {
  ctx.strokeStyle = 'rgba(191,219,254,0.9)'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(10, 4)
  ctx.lineTo(6, 36)
  ctx.stroke()
}

/** A zig-zag of lightning. */
function lightningBolt(ctx: Ctx) {
  glow(ctx, 50, 100, 60, '#fef08a', 0.6)
  ctx.fillStyle = '#fefce8'
  ctx.beginPath()
  ctx.moveTo(56, 0)
  ctx.lineTo(26, 92)
  ctx.lineTo(52, 92)
  ctx.lineTo(34, 200)
  ctx.lineTo(80, 76)
  ctx.lineTo(54, 76)
  ctx.lineTo(74, 0)
  ctx.closePath()
  ctx.fill()
}

/** A hockey player: ready, winding up, slapping the puck, following through (frames 0–3). */
function hockeyPlayer(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const pose = f % 4
  // Skates.
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 3
  for (const x of [64, 100]) {
    ctx.fillStyle = '#111827'
    ctx.fillRect(x - 12, 206, 26, 12)
    ctx.beginPath()
    ctx.moveTo(x - 14, 222)
    ctx.lineTo(x + 16, 222)
    ctx.stroke()
  }
  limb(ctx, 74, 150, 30, 30, 0.25, -0.2, 18, '#1f2937')
  limb(ctx, 94, 150, 30, 30, -0.2, 0.15, 18, '#1f2937')
  // Jersey with stripes and a number.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(54, 86, 60, 70, 12)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.fillRect(54, 136, 60, 8)
  ctx.font = 'bold 22px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('9', 84, 124)
  // Stick and arms by pose: low, back over the shoulder, through the puck, high finish.
  const stick = [0.6, -2.3, 0.2, 2.3][pose]
  const hx = 104
  const hy = 104
  ctx.save()
  ctx.translate(hx, hy)
  ctx.rotate(-stick)
  ctx.strokeStyle = '#a16207'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(0, -10)
  ctx.lineTo(0, 96)
  ctx.lineTo(26, 102)
  ctx.stroke()
  ctx.restore()
  limb(ctx, 66, 96, 22, 22, 0.9, 0.6, 12, color)
  limb(ctx, 104, 96, 18, 14, -stick * 0.3, 0.2, 12, color)
  // Helmet and face.
  ctx.fillStyle = SKIN
  circle(ctx, 84, 66, 18)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.arc(84, 64, 20, Math.PI, 0)
  ctx.fill()
  ctx.strokeStyle = '#d4d4d8'
  ctx.lineWidth = 2
  for (const y of [66, 74]) {
    ctx.beginPath()
    ctx.moveTo(88, y)
    ctx.lineTo(104, y)
    ctx.stroke()
  }
  ctx.fillStyle = '#111'
  circle(ctx, 92, 64, 2.5)
  ctx.fill()
}

/** A puck. */
function puck(ctx: Ctx) {
  ctx.fillStyle = '#18181b'
  ellipse(ctx, 24, 26, 20, 10)
  ctx.fill()
  ctx.fillStyle = '#3f3f46'
  ellipse(ctx, 24, 22, 20, 9)
  ctx.fill()
  ctx.strokeStyle = '#a1a1aa'
  ctx.lineWidth = 1.5
  ctx.stroke()
}

/** Where a puck hits: a star of ice chips. */
function puckHit(ctx: Ctx) {
  ctx.strokeStyle = 'rgba(224,242,254,0.95)'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU
    ctx.beginPath()
    ctx.moveTo(80 + Math.cos(a) * 14, 50 + Math.sin(a) * 9)
    ctx.lineTo(80 + Math.cos(a) * 46, 50 + Math.sin(a) * 30)
    ctx.stroke()
  }
}

/** A striped lighthouse with its lamp room (the beam is its own picture). */
function lighthouse(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = f / frames
  // Tower, tapering, in stripes.
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(40, 300)
  ctx.lineTo(56, 90)
  ctx.lineTo(104, 90)
  ctx.lineTo(120, 300)
  ctx.closePath()
  ctx.clip()
  for (let k = 0; k < 5; k++) {
    ctx.fillStyle = k % 2 ? '#f8fafc' : color
    ctx.fillRect(30, 90 + k * 42, 100, 42)
  }
  const g = ctx.createLinearGradient(40, 0, 120, 0)
  g.addColorStop(0, 'rgba(0,0,0,0.25)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.15)')
  g.addColorStop(1, 'rgba(0,0,0,0.3)')
  ctx.fillStyle = g
  ctx.fillRect(30, 90, 100, 210)
  ctx.restore()
  ctx.fillStyle = '#1f2937'
  ctx.fillRect(44, 80, 72, 12)
  ctx.fillRect(66, 200, 28, 40)
  // Lamp room glowing, the lamp turning.
  ctx.fillStyle = 'rgba(254,249,195,0.9)'
  ctx.fillRect(58, 46, 44, 34)
  glow(ctx, 80 + Math.sin(p * TAU) * 14, 62, 30, color2, 0.9)
  ctx.fillStyle = '#1f2937'
  ctx.beginPath()
  ctx.moveTo(52, 46)
  ctx.lineTo(80, 18)
  ctx.lineTo(108, 46)
  ctx.closePath()
  ctx.fill()
  ctx.fillRect(78, 6, 4, 14)
}

/** The lighthouse's beam: its narrow end on the left middle, widening and fading to the right. */
function lighthouseBeam(ctx: Ctx, _f: number, _n: number, { color2 }: SpriteColors) {
  const g = ctx.createLinearGradient(0, 0, 600, 0)
  g.addColorStop(0, rgba(color2, 0.75))
  g.addColorStop(1, rgba(color2, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(0, 46)
  ctx.lineTo(600, 0)
  ctx.lineTo(600, 100)
  ctx.lineTo(0, 54)
  ctx.closePath()
  ctx.fill()
}

// -- tumbleweeds, Bigfoot, skeleton dogs, sunflowers, tulips, a bird feeder, a beehive, wind chimes,
//    a campfire -------------------------------------------------------------------------------------

/** A tumbleweed: a tangled ball of dry twigs (it turns as it rolls). */
function tumbleweed(ctx: Ctx, _f: number, _n: number, { color }: SpriteColors) {
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  for (let k = 0; k < 46; k++) {
    const a = k * 2.39
    const b = k * 1.7 + 1
    const r1 = 20 + ((k * 13) % 40)
    const r2 = 20 + ((k * 29) % 42)
    ctx.lineWidth = 1.5 + (k % 3)
    ctx.strokeStyle = k % 4 ? color : shade(color, -0.3)
    ctx.beginPath()
    ctx.moveTo(70 + Math.cos(a) * r1, 70 + Math.sin(a) * r1)
    ctx.quadraticCurveTo(70 + Math.cos(a + 1) * 10, 70 + Math.sin(a + 1) * 10, 70 + Math.cos(b) * r2, 70 + Math.sin(b) * r2)
    ctx.stroke()
  }
}

/** Bigfoot striding (facing right), one arm swinging, turning his head to look back at people (frames 8–11 of look). */
function bigfoot(look: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color }: SpriteColors) => {
    const p = (f / frames) * TAU
    const s = Math.sin(p)
    const fur = color
    limb(ctx, 92, 196, 50, 46, s * 0.45, -Math.max(0, s) * 0.5, 34, shade(fur, -0.2))
    limb(ctx, 120, 196, 50, 46, -s * 0.45, -Math.max(0, -s) * 0.5, 34, fur)
    // Shaggy body.
    const g = ctx.createLinearGradient(60, 0, 160, 0)
    g.addColorStop(0, shade(fur, -0.25))
    g.addColorStop(1, shade(fur, 0.15))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(70, 210)
    ctx.quadraticCurveTo(54, 120, 92, 82)
    ctx.quadraticCurveTo(130, 74, 150, 110)
    ctx.quadraticCurveTo(156, 170, 142, 210)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = shade(fur, -0.35)
    ctx.lineWidth = 2
    for (let k = 0; k < 14; k++) {
      const x = 74 + ((k * 23) % 70)
      const y = 110 + ((k * 37) % 90)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - 4, y + 10)
      ctx.stroke()
    }
    // Long arms.
    limb(ctx, 132, 112, 52, 50, -s * 0.5 - 0.1, 0.3, 22, fur)
    limb(ctx, 88, 112, 52, 50, s * 0.5 + 0.1, 0.3, 22, shade(fur, -0.2))
    // Head: ahead, or turned to look out at people.
    ctx.fillStyle = fur
    ellipse(ctx, 124, 70, 26, 30)
    ctx.fill()
    ctx.fillStyle = shade(fur, 0.35)
    if (look) {
      ellipse(ctx, 124, 76, 17, 16)
      ctx.fill()
      ctx.fillStyle = '#111'
      circle(ctx, 117, 72, 3)
      ctx.fill()
      circle(ctx, 131, 72, 3)
      ctx.fill()
      ellipse(ctx, 124, 86, 6, 3)
      ctx.fill()
    } else {
      ellipse(ctx, 138, 76, 12, 15)
      ctx.fill()
      ctx.fillStyle = '#111'
      circle(ctx, 142, 70, 3)
      ctx.fill()
    }
  }
}

/** A skeleton dog trotting (facing right), tail wagging. */
function skeletonDog(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const b = color
  for (const [x, a] of [[60, s], [72, -s], [140, -s], [152, s]] as const) {
    const [ex, ey] = limb(ctx, x, 96, 26, 26, a * 0.45, -a * 0.25, 5, b)
    ctx.fillStyle = b
    ellipse(ctx, ex + 4, ey, 6, 3)
    ctx.fill()
  }
  // Spine and ribs.
  ctx.strokeStyle = b
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(56, 86)
  ctx.quadraticCurveTo(100, 70, 154, 84)
  ctx.stroke()
  ctx.lineWidth = 4
  for (let k = 0; k < 6; k++) {
    const x = 92 + k * 9
    ctx.beginPath()
    ctx.moveTo(x, 80)
    ctx.quadraticCurveTo(x - 6, 96, x + 2, 106 - Math.abs(k - 2.5) * 3)
    ctx.stroke()
  }
  // Hips.
  ctx.fillStyle = b
  ellipse(ctx, 64, 88, 14, 10)
  ctx.fill()
  // Wagging tail of little bones.
  for (let k = 0; k < 5; k++) {
    const a = -0.6 + s * 0.6 * (k / 5)
    circle(ctx, 50 - k * 7 * Math.cos(a), 84 - k * 7 * Math.sin(a) - k * 2, 3.5)
    ctx.fill()
  }
  // Skull with glowing eyes.
  ctx.fillStyle = b
  ellipse(ctx, 172, 70, 20, 16)
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(180, 66, 28, 14, 6)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(158, 60)
  ctx.lineTo(164, 40)
  ctx.lineTo(172, 58)
  ctx.closePath()
  ctx.fill()
  glow(ctx, 172, 68, 9, color2, 0.9)
  ctx.fillStyle = '#111'
  ctx.fillRect(186, 78, 18, 2)
  ctx.fillStyle = color2
  circle(ctx, 172, 68, 3.5)
  ctx.fill()
}

/** A sunflower on its stalk, the head turned left, ahead or right (frames 0–2), or nodding (3). */
function sunflower(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const pose = f % 4
  const turn = [-1, 0, 1, 0][pose]
  const hx = 70 + turn * 10
  const hy = pose === 3 ? 66 : 56
  ctx.strokeStyle = '#3f6212'
  ctx.lineWidth = 9
  ctx.beginPath()
  ctx.moveTo(70, 300)
  ctx.quadraticCurveTo(66, 170, hx, hy + 20)
  ctx.stroke()
  ctx.fillStyle = '#4d7c0f'
  for (const [y, d] of [[200, -1], [160, 1], [240, 1]] as const) {
    ellipse(ctx, 70 + d * 26, y, 26, 11, d * 0.5)
    ctx.fill()
  }
  // Petals round the head, foreshortened as it turns.
  ctx.save()
  ctx.translate(hx, hy)
  ctx.scale(1 - Math.abs(turn) * 0.3, pose === 3 ? 0.8 : 1)
  ctx.fillStyle = color
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * TAU
    ellipse(ctx, Math.cos(a) * 40, Math.sin(a) * 40, 16, 7, a)
    ctx.fill()
  }
  const g = ctx.createRadialGradient(-6, -6, 2, 0, 0, 30)
  g.addColorStop(0, shade(color2, 0.2))
  g.addColorStop(1, shade(color2, -0.35))
  ctx.fillStyle = g
  circle(ctx, 0, 0, 28)
  ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  for (let k = 0; k < 30; k++) {
    const a = k * 2.4
    const r = Math.sqrt(k) * 4.6
    circle(ctx, Math.cos(a) * r, Math.sin(a) * r, 1.6)
    ctx.fill()
  }
  ctx.restore()
}

/** A tulip: a closed bud, opening, and open (frames 0–3). */
function tulip(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const open = (f % 4) / 3
  ctx.strokeStyle = '#4d7c0f'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(50, 200)
  ctx.quadraticCurveTo(46, 130, 50, 74)
  ctx.stroke()
  ctx.fillStyle = '#65a30d'
  ctx.beginPath()
  ctx.moveTo(50, 196)
  ctx.quadraticCurveTo(16, 150, 26, 110)
  ctx.quadraticCurveTo(44, 150, 50, 176)
  ctx.fill()
  // Petals: three in front leaning out as it opens, two behind.
  ctx.fillStyle = shade(color, -0.25)
  for (const d of [-1, 1]) {
    ctx.save()
    ctx.translate(50, 76)
    ctx.rotate(d * 0.15 * open)
    ellipse(ctx, d * 10, -18, 14, 26)
    ctx.fill()
    ctx.restore()
  }
  ctx.fillStyle = color2
  if (open > 0.5) {
    ellipse(ctx, 50, 62, 7, 7)
    ctx.fill()
  }
  for (const [d, k] of [[-1, 1], [0, 0], [1, 1]] as const) {
    ctx.save()
    ctx.translate(50, 80)
    ctx.rotate(d * (0.15 + 0.6 * open))
    const g = ctx.createLinearGradient(0, -50, 0, 0)
    g.addColorStop(0, shade(color, 0.25))
    g.addColorStop(1, shade(color, -0.1))
    ctx.fillStyle = g
    ellipse(ctx, 0, -22 + k * 2, 13 - k * 1, 26)
    ctx.fill()
    ctx.restore()
  }
}

/** A bird feeder on a post: a little roofed tray with seed. */
function birdFeeder(ctx: Ctx, _f: number, _n: number, { color, color2 }: SpriteColors) {
  ctx.fillStyle = '#78350f'
  ctx.fillRect(66, 120, 12, 180)
  ctx.fillStyle = shade(color, -0.2)
  ctx.fillRect(22, 112, 100, 10)
  ctx.fillStyle = color2
  ellipse(ctx, 72, 110, 40, 6)
  ctx.fill()
  ctx.fillStyle = '#a16207'
  ctx.fillRect(30, 60, 8, 52)
  ctx.fillRect(106, 60, 8, 52)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(10, 66)
  ctx.lineTo(72, 22)
  ctx.lineTo(134, 66)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.beginPath()
  ctx.moveTo(10, 66)
  ctx.lineTo(72, 22)
  ctx.lineTo(80, 28)
  ctx.lineTo(24, 66)
  ctx.closePath()
  ctx.fill()
}

/** A little songbird at the feeder: pecking or looking up (frames). */
function feederBird(ctx: Ctx, f: number, _n: number, { color2 }: SpriteColors) {
  const peck = f % 2 === 1
  ctx.fillStyle = '#ca8a04'
  ellipse(ctx, 34, 36, 20, 14, -0.2)
  ctx.fill()
  ctx.fillStyle = '#fef08a'
  ellipse(ctx, 40, 42, 12, 9)
  ctx.fill()
  ctx.fillStyle = '#ca8a04'
  ctx.beginPath()
  ctx.moveTo(16, 34)
  ctx.lineTo(2, 30)
  ctx.lineTo(16, 42)
  ctx.closePath()
  ctx.fill()
  const [hx, hy] = peck ? [52, 40] : [48, 22]
  circle(ctx, hx, hy, 11)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, hx + 4, hy - 2, 2)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(hx + 9, hy - 2)
  ctx.lineTo(hx + 18, hy + (peck ? 6 : 1))
  ctx.lineTo(hx + 9, hy + 3)
  ctx.closePath()
  ctx.fill()
}

/** A straw beehive (a skep) on a stand, a dark doorway at the bottom. */
function beehive(ctx: Ctx, _f: number, _n: number, { color }: SpriteColors) {
  ctx.fillStyle = '#78350f'
  ctx.fillRect(30, 170, 10, 30)
  ctx.fillRect(120, 170, 10, 30)
  ctx.fillRect(20, 164, 120, 10)
  for (let k = 0; k < 6; k++) {
    const y = 160 - k * 24
    const w = 62 - k * k * 1.6
    const g = ctx.createLinearGradient(80 - w, 0, 80 + w, 0)
    g.addColorStop(0, shade(color, -0.3))
    g.addColorStop(0.45, shade(color, 0.2))
    g.addColorStop(1, shade(color, -0.35))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.roundRect(80 - w, y - 24, w * 2, 28, 14)
    ctx.fill()
  }
  ctx.fillStyle = '#1c1917'
  ctx.beginPath()
  ctx.arc(80, 162, 12, Math.PI, 0)
  ctx.fill()
}

/** Wind chimes: a wooden disc with tubes of different lengths, swinging (frames) and catching the light. */
function windChimes(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  ctx.fillStyle = '#92400e'
  ellipse(ctx, 70, 12, 50, 8)
  ctx.fill()
  const tubes = [[30, 120], [50, 150], [70, 170], [90, 140], [110, 110]]
  tubes.forEach(([x, len], i) => {
    const a = Math.sin(p + i * 1.3) * 0.12
    ctx.save()
    ctx.translate(x, 16)
    ctx.rotate(a)
    ctx.strokeStyle = 'rgba(203,213,225,0.7)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, 14)
    ctx.stroke()
    const g = ctx.createLinearGradient(-6, 0, 6, 0)
    g.addColorStop(0, shade(color, -0.3))
    g.addColorStop(0.4, '#ffffff')
    g.addColorStop(1, shade(color, -0.2))
    ctx.fillStyle = g
    ctx.fillRect(-6, 14, 12, len - 14)
    ctx.restore()
  })
  // Clapper and the sail it hangs from.
  const swing = Math.sin(p * 1.5) * 10
  ctx.strokeStyle = 'rgba(203,213,225,0.7)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(70, 12)
  ctx.lineTo(70 + swing, 196)
  ctx.stroke()
  ctx.fillStyle = '#a16207'
  circle(ctx, 70 + swing * 0.6, 120, 9)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.moveTo(70 + swing, 196)
  ctx.lineTo(56 + swing, 226)
  ctx.lineTo(84 + swing, 226)
  ctx.closePath()
  ctx.fill()
}

/** A campfire: logs crossed in a ring of stones, flames licking up (frames). */
function campfire(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  glow(ctx, 100, 120, 70, color, 0.5)
  for (let k = 0; k < 7; k++) {
    const x = 64 + k * 12
    const h = 70 + Math.sin(p * 2 + k * 1.9) * 22 + (3 - Math.abs(k - 3)) * 14
    const sway = Math.sin(p * 3 + k) * 6
    for (const [c, w, hh] of [[color, 16, h], [color2, 10, h * 0.7], ['#fef3c7', 5, h * 0.4]] as const) {
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.moveTo(x - w, 150)
      ctx.quadraticCurveTo(x - w * 0.5, 150 - hh * 0.6, x + sway, 150 - hh)
      ctx.quadraticCurveTo(x + w * 0.5, 150 - hh * 0.6, x + w, 150)
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.strokeStyle = '#78350f'
  ctx.lineWidth = 14
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(52, 166)
  ctx.lineTo(148, 140)
  ctx.moveTo(52, 140)
  ctx.lineTo(148, 166)
  ctx.stroke()
  for (let k = 0; k < 9; k++) {
    ctx.fillStyle = k % 2 ? '#78716c' : '#a8a29e'
    ellipse(ctx, 34 + k * 16.5, 170 + Math.abs(k - 4) * -1, 12, 9)
    ctx.fill()
  }
}

/** One rising spark (or ember). */
function ember(ctx: Ctx, _f: number, _n: number, { color2 }: SpriteColors) {
  glow(ctx, 12, 12, 12, color2, 1)
}

// -- a kinara, Ramadan lanterns, hula dancers, a mariachi, a bagpiper, pilgrims, a cornucopia,
//    a Christmas tree that lights up, a cow ---------------------------------------------------------

/** A Kwanzaa kinara: seven candles, three red, one black, three green; frame k has the first k lit (0–7). */
function kinara(ctx: Ctx, f: number, _n: number, _c: SpriteColors) {
  const lit = f % 8
  const order = [3, 2, 4, 1, 5, 0, 6] // the black one first, then left to right outward
  const colors = ['#b91c1c', '#b91c1c', '#b91c1c', '#374151', '#15803d', '#15803d', '#15803d']
  // Carved wooden base.
  const g = ctx.createLinearGradient(0, 120, 0, 170)
  g.addColorStop(0, '#a16207')
  g.addColorStop(1, '#713f12')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(20, 120)
  ctx.lineTo(260, 120)
  ctx.lineTo(240, 150)
  ctx.lineTo(160, 150)
  ctx.lineTo(170, 176)
  ctx.lineTo(110, 176)
  ctx.lineTo(120, 150)
  ctx.lineTo(40, 150)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#fbbf24'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(30, 132)
  ctx.lineTo(250, 132)
  ctx.stroke()
  for (let k = 0; k < 7; k++) {
    const x = 40 + k * 33.3
    const top = k === 3 ? 44 : 60
    ctx.fillStyle = '#713f12'
    ctx.fillRect(x - 9, 110, 18, 12)
    const c = ctx.createLinearGradient(x - 7, 0, x + 7, 0)
    c.addColorStop(0, shade(colors[k], -0.2))
    c.addColorStop(0.4, shade(colors[k], 0.35))
    c.addColorStop(1, shade(colors[k], -0.3))
    ctx.fillStyle = c
    ctx.fillRect(x - 7, top, 14, 110 - top)
    if (order.indexOf(k) < lit) {
      glow(ctx, x, top - 14, 20, '#fbbf24', 0.7)
      ctx.fillStyle = '#fde68a'
      ctx.beginPath()
      ctx.moveTo(x, top - 26)
      ctx.quadraticCurveTo(x + 7, top - 8, x, top - 2)
      ctx.quadraticCurveTo(x - 7, top - 8, x, top - 26)
      ctx.fill()
    }
  }
}

/** A Ramadan fanous: a brass lantern with coloured glass and a dome; frames flicker the light inside. */
function fanous(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const flick = 0.75 + 0.25 * Math.sin((f / frames) * TAU * 3)
  const brass = '#b45309'
  glow(ctx, 60, 100, 54 * flick, color2, 0.45)
  ctx.strokeStyle = brass
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(60, 16, 10, 0, TAU)
  ctx.stroke()
  // Dome and spire.
  ctx.fillStyle = brass
  ctx.beginPath()
  ctx.moveTo(30, 60)
  ctx.quadraticCurveTo(32, 30, 60, 26)
  ctx.quadraticCurveTo(88, 30, 90, 60)
  ctx.closePath()
  ctx.fill()
  // Glass body: hexagon panes, lit.
  ctx.fillStyle = shade(color, -0.1 + flick * 0.2)
  ctx.beginPath()
  ctx.moveTo(30, 62)
  ctx.lineTo(90, 62)
  ctx.lineTo(100, 110)
  ctx.lineTo(90, 150)
  ctx.lineTo(30, 150)
  ctx.lineTo(20, 110)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = `rgba(255,240,200,${0.35 * flick})`
  ellipse(ctx, 60, 108, 18, 30)
  ctx.fill()
  // Brass lattice: frame, star cut-outs.
  ctx.strokeStyle = brass
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(48, 62)
  ctx.lineTo(44, 150)
  ctx.moveTo(72, 62)
  ctx.lineTo(76, 150)
  ctx.moveTo(20, 110)
  ctx.lineTo(100, 110)
  ctx.stroke()
  for (const [x, y] of [[34, 86], [60, 86], [86, 86], [34, 130], [60, 130], [86, 130]] as const) {
    ctx.fillStyle = brass
    ctx.beginPath()
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU
      const r = k % 2 ? 3 : 6
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    }
    ctx.fill()
  }
  // Base.
  ctx.fillStyle = brass
  ctx.beginPath()
  ctx.moveTo(30, 150)
  ctx.lineTo(90, 150)
  ctx.lineTo(76, 170)
  ctx.lineTo(44, 170)
  ctx.closePath()
  ctx.fill()
  circle(ctx, 60, 176, 6)
  ctx.fill()
}

/** A hula dancer in a grass skirt and lei, hips swaying, arms flowing side to side. */
function hulaDancer(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const hip = s * 10
  // Legs, knees bent.
  limb(ctx, 76 + hip * 0.4, 168, 34, 34, 0.2, -0.3, 14, SKIN)
  limb(ctx, 100 + hip * 0.4, 168, 34, 34, -0.2, 0.3, 14, SKIN)
  // Body.
  ctx.fillStyle = SKIN
  ctx.beginPath()
  ctx.roundRect(72, 92, 34, 56, 12)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.beginPath()
  ctx.roundRect(70, 96, 38, 22, 8)
  ctx.fill()
  // Grass skirt, swinging with the hips.
  for (let k = 0; k < 16; k++) {
    const x = 66 + hip + k * 3
    ctx.strokeStyle = k % 2 ? '#a3a33a' : '#84843a'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(x, 140)
    ctx.quadraticCurveTo(x - hip * 0.5, 170, x - hip * 1.2 + (k - 8) * 1.2, 196)
    ctx.stroke()
  }
  ctx.fillStyle = color
  ctx.fillRect(64 + hip, 136, 50, 8)
  // Arms flowing to one side, both together.
  const a = s * 0.7
  limb(ctx, 76, 100, 30, 30, -1.4 + a, -0.6 + a * 0.4, 9, SKIN)
  limb(ctx, 102, 100, 30, 30, 1.4 + a, 0.6 + a * 0.4, 9, SKIN)
  // Head, hair and flower.
  ctx.fillStyle = '#1c1917'
  ellipse(ctx, 88, 78, 22, 30)
  ctx.fill()
  ctx.fillStyle = SKIN
  circle(ctx, 90, 70, 16)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 95, 68, 2)
  ctx.fill()
  ctx.fillStyle = color
  for (let k = 0; k < 5; k++) {
    const aa = (k / 5) * TAU
    circle(ctx, 74 + Math.cos(aa) * 5, 60 + Math.sin(aa) * 5, 4)
    ctx.fill()
  }
  // Lei.
  for (let k = 0; k < 11; k++) {
    ctx.fillStyle = k % 2 ? color : shade(color, 0.4)
    circle(ctx, 76 + k * 2.6, 90 + Math.sin((k / 10) * Math.PI) * 12, 4.5)
    ctx.fill()
  }
}

/** A mariachi in a wide sombrero and charro suit, strumming a guitar (frames), head bobbing. */
function mariachi(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const strum = Math.sin(p * 2)
  // Legs, one foot tapping.
  limb(ctx, 82, 170, 36, 36, 0.05, 0, 15, color)
  limb(ctx, 104, 170, 36, 36 - Math.max(0, s) * 4, -0.05, 0, 15, color)
  ctx.fillStyle = '#111'
  ellipse(ctx, 86, 242, 12, 6)
  ctx.fill()
  ellipse(ctx, 108, 242 - Math.max(0, s) * 4, 12, 6)
  ctx.fill()
  // Short jacket with silver buttons down the trousers.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(70, 100, 48, 76, 10)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(86, 104, 16, 50)
  ctx.fillStyle = color2
  for (let k = 0; k < 5; k++) {
    circle(ctx, 72, 184 + k * 11, 2.5)
    ctx.fill()
    circle(ctx, 116, 184 + k * 11, 2.5)
    ctx.fill()
  }
  ctx.fillStyle = '#b91c1c'
  ctx.beginPath()
  ctx.moveTo(94, 108)
  ctx.lineTo(82, 116)
  ctx.lineTo(106, 116)
  ctx.closePath()
  ctx.fill()
  // Guitar across the body.
  ctx.save()
  ctx.translate(96, 150)
  ctx.rotate(-0.5)
  const g = ctx.createRadialGradient(-10, 0, 4, -10, 0, 40)
  g.addColorStop(0, '#f59e0b')
  g.addColorStop(1, '#92400e')
  ctx.fillStyle = g
  ellipse(ctx, -14, 0, 30, 24)
  ctx.fill()
  ellipse(ctx, 14, 0, 22, 18)
  ctx.fill()
  ctx.fillStyle = '#1c1917'
  circle(ctx, 4, 0, 7)
  ctx.fill()
  ctx.fillStyle = '#451a03'
  ctx.fillRect(30, -4, 64, 8)
  ctx.fillRect(90, -7, 16, 14)
  ctx.restore()
  // Strumming arm and the neck hand.
  ctx.strokeStyle = color
  ctx.lineWidth = 12
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(78, 112)
  ctx.lineTo(80 + strum * 6, 146 + strum * 4)
  ctx.moveTo(112, 112)
  ctx.lineTo(150, 104)
  ctx.stroke()
  ctx.fillStyle = SKIN
  circle(ctx, 82 + strum * 6, 150 + strum * 4, 6)
  ctx.fill()
  circle(ctx, 152, 102, 6)
  ctx.fill()
  // Head, moustache and a wide sombrero.
  const bob = s * 2
  ctx.fillStyle = SKIN
  circle(ctx, 94, 80 + bob, 18)
  ctx.fill()
  ctx.fillStyle = '#1c1917'
  ellipse(ctx, 96, 88 + bob, 9, 3)
  ctx.fill()
  circle(ctx, 100, 76 + bob, 2.2)
  ctx.fill()
  circle(ctx, 89, 76 + bob, 2.2)
  ctx.fill()
  ctx.fillStyle = color
  ellipse(ctx, 94, 62 + bob, 62, 12)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(74, 62 + bob)
  ctx.quadraticCurveTo(80, 22 + bob, 94, 20 + bob)
  ctx.quadraticCurveTo(108, 22 + bob, 114, 62 + bob)
  ctx.fill()
  ctx.strokeStyle = color2
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.ellipse(94, 62 + bob, 56, 9, 0, 0, TAU)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(76, 52 + bob)
  ctx.lineTo(112, 52 + bob)
  ctx.stroke()
}

/** A bagpiper in a kilt, the bag under one arm, drones over the shoulder, marching. */
function bagpiper(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  // Legs and socks, marching.
  const [ax, ay] = limb(ctx, 84, 180, 30, 32, Math.max(0, s) * 0.8, -Math.max(0, s) * 0.9, 13, SKIN)
  const [bx, by] = limb(ctx, 102, 180, 30, 32, Math.max(0, -s) * 0.8, -Math.max(0, -s) * 0.9, 13, SKIN)
  ctx.fillStyle = '#f8fafc'
  for (const [x, y] of [[ax, ay], [bx, by]]) {
    ctx.fillRect(x - 7, y - 20, 14, 18)
    ctx.fillStyle = '#111'
    ellipse(ctx, x + 5, y + 2, 11, 5)
    ctx.fill()
    ctx.fillStyle = '#f8fafc'
  }
  // Tartan kilt.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(70, 150)
  ctx.lineTo(118, 150)
  ctx.lineTo(122 + s * 3, 190)
  ctx.lineTo(66 + s * 3, 190)
  ctx.closePath()
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.strokeStyle = color2
  ctx.globalAlpha = 0.6
  ctx.lineWidth = 3
  for (let k = 0; k < 6; k++) {
    ctx.beginPath()
    ctx.moveTo(64 + k * 11, 150)
    ctx.lineTo(64 + k * 11, 192)
    ctx.moveTo(60, 156 + k * 8)
    ctx.lineTo(126, 156 + k * 8)
    ctx.stroke()
  }
  ctx.restore()
  ctx.fillStyle = '#f8fafc'
  ellipse(ctx, 94, 160, 8, 10)
  ctx.fill()
  // Jacket.
  ctx.fillStyle = '#334155'
  ctx.beginPath()
  ctx.roundRect(70, 98, 48, 56, 10)
  ctx.fill()
  // The bag, squeezed in time, with drones over the shoulder.
  const sq = 1 + Math.sin(p * 2) * 0.06
  ctx.fillStyle = color
  ellipse(ctx, 116, 130, 22 * sq, 16 / sq, 0.3)
  ctx.fill()
  ctx.strokeStyle = '#1c1917'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (const [x, y] of [[96, 46], [108, 40], [122, 50]]) {
    ctx.moveTo(114, 120)
    ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.fillStyle = '#e2e8f0'
  for (const [x, y] of [[96, 46], [108, 40], [122, 50]]) {
    circle(ctx, x, y, 4)
    ctx.fill()
  }
  // Chanter down the front, both hands on it.
  ctx.strokeStyle = '#1c1917'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(100, 94)
  ctx.lineTo(96, 150)
  ctx.stroke()
  ctx.fillStyle = SKIN
  circle(ctx, 97, 118 + Math.sin(p * 4) * 2, 6)
  ctx.fill()
  circle(ctx, 96, 136 - Math.sin(p * 4) * 2, 6)
  ctx.fill()
  // Head with puffed cheeks and a feathered bonnet.
  ctx.fillStyle = SKIN
  circle(ctx, 94, 78, 18)
  ctx.fill()
  ctx.fillStyle = '#fca5a5'
  circle(ctx, 104, 84, 6 + Math.sin(p * 2))
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 100, 74, 2.3)
  ctx.fill()
  ctx.fillStyle = '#1e293b'
  ctx.beginPath()
  ctx.roundRect(74, 36, 40, 34, 8)
  ctx.fill()
  ctx.fillStyle = color2
  ctx.fillRect(74, 62, 40, 6)
  ctx.fillStyle = '#ffffff'
  ellipse(ctx, 80, 34, 6, 12, -0.4)
  ctx.fill()
}

/** A pilgrim in a buckled hat and white collar, walking (facing right), carrying a basket of food. */
function pilgrim(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const [ax, ay] = limb(ctx, 82, 170, 34, 34, s * 0.4, -Math.max(0, s) * 0.4, 14, '#1f2937')
  const [bx, by] = limb(ctx, 98, 170, 34, 34, -s * 0.4, -Math.max(0, -s) * 0.4, 14, '#111827')
  for (const [x, y] of [[ax, ay], [bx, by]]) {
    ctx.fillStyle = '#111'
    ellipse(ctx, x + 5, y + 2, 12, 5)
    ctx.fill()
    ctx.fillStyle = '#d4d4d8'
    ctx.fillRect(x + 1, y - 3, 6, 5)
  }
  // Long dark coat with a belt.
  const g = ctx.createLinearGradient(0, 96, 0, 180)
  g.addColorStop(0, shade(color, 0.1))
  g.addColorStop(1, shade(color, -0.25))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(66, 96, 50, 84, 10)
  ctx.fill()
  ctx.fillStyle = '#1c1917'
  ctx.fillRect(66, 140, 50, 7)
  ctx.fillStyle = '#d4d4d8'
  ctx.strokeStyle = '#d4d4d8'
  ctx.lineWidth = 2
  ctx.strokeRect(86, 139, 10, 9)
  // White collar.
  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.moveTo(70, 98)
  ctx.lineTo(112, 98)
  ctx.lineTo(104, 116)
  ctx.lineTo(91, 108)
  ctx.lineTo(78, 116)
  ctx.closePath()
  ctx.fill()
  // Arm round a basket of corn and squash.
  ctx.fillStyle = '#a16207'
  ctx.beginPath()
  ctx.moveTo(110, 130)
  ctx.lineTo(160, 130)
  ctx.lineTo(152, 160)
  ctx.lineTo(118, 160)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#713f12'
  ctx.lineWidth = 2
  for (let k = 0; k < 3; k++) {
    ctx.beginPath()
    ctx.moveTo(112 + k * 1.5, 138 + k * 8)
    ctx.lineTo(158 - k * 1.5, 138 + k * 8)
    ctx.stroke()
  }
  ctx.fillStyle = color2
  circle(ctx, 124, 124, 10)
  ctx.fill()
  ctx.fillStyle = '#facc15'
  ellipse(ctx, 144, 118, 6, 16, 0.4)
  ctx.fill()
  ctx.fillStyle = '#65a30d'
  ellipse(ctx, 150, 104, 3, 8, 0.6)
  ctx.fill()
  limb(ctx, 104, 106, 26, 26, -0.6 + s * 0.1, -1.0, 11, shade(color, -0.1))
  // Head, buckled hat.
  ctx.fillStyle = SKIN
  circle(ctx, 92, 80, 17)
  ctx.fill()
  ctx.fillStyle = '#111'
  circle(ctx, 99, 78, 2.3)
  ctx.fill()
  ctx.fillStyle = '#3f3f46'
  ellipse(ctx, 92, 66, 30, 6)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(76, 66)
  ctx.lineTo(79, 28)
  ctx.lineTo(105, 28)
  ctx.lineTo(108, 66)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#27272a'
  ctx.fillRect(77, 54, 30, 8)
  ctx.strokeStyle = '#fbbf24'
  ctx.lineWidth = 3
  ctx.strokeRect(86, 53, 12, 10)
}

/** A cornucopia: a woven horn spilling fruit and vegetables. */
function cornucopia(ctx: Ctx, _f: number, _n: number, { color }: SpriteColors) {
  const g = ctx.createLinearGradient(20, 0, 200, 0)
  g.addColorStop(0, shade(color, -0.35))
  g.addColorStop(1, shade(color, 0.15))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(18, 54)
  ctx.bezierCurveTo(50, 40, 70, 140, 140, 70)
  ctx.lineTo(190, 70)
  ctx.lineTo(190, 160)
  ctx.bezierCurveTo(120, 170, 50, 150, 30, 90)
  ctx.quadraticCurveTo(10, 70, 18, 54)
  ctx.fill()
  ctx.strokeStyle = shade(color, -0.4)
  ctx.lineWidth = 2
  for (let k = 0; k < 9; k++) {
    const x = 50 + k * 16
    ctx.beginPath()
    ctx.moveTo(x, 80 + k * -1)
    ctx.quadraticCurveTo(x + 8, 120, x, 160 - k * 2)
    ctx.stroke()
  }
  ctx.fillStyle = shade(color, -0.45)
  ellipse(ctx, 190, 115, 14, 46)
  ctx.fill()
  // A couple of things still in the mouth.
  ctx.fillStyle = '#ea580c'
  circle(ctx, 196, 92, 16)
  ctx.fill()
  ctx.fillStyle = '#7c3aed'
  for (let k = 0; k < 6; k++) {
    circle(ctx, 192 + (k % 2) * 8, 118 + k * 5, 6)
    ctx.fill()
  }
}

/** One piece that spills out: an apple, a pear, grapes, a pumpkin, an ear of corn (frames 0–4). */
function harvestPiece(ctx: Ctx, f: number, _n: number, _c: SpriteColors) {
  const k = f % 5
  if (k === 0) {
    ctx.fillStyle = '#dc2626'
    circle(ctx, 30, 34, 20)
    ctx.fill()
    ctx.fillStyle = '#65a30d'
    ellipse(ctx, 38, 12, 8, 4, -0.5)
    ctx.fill()
  } else if (k === 1) {
    ctx.fillStyle = '#a3e635'
    circle(ctx, 30, 40, 18)
    ctx.fill()
    circle(ctx, 30, 22, 11)
    ctx.fill()
  } else if (k === 2) {
    ctx.fillStyle = '#7c3aed'
    for (let i = 0; i < 9; i++) {
      circle(ctx, 18 + (i % 3) * 12 + Math.floor(i / 3) * 6, 18 + Math.floor(i / 3) * 12, 7)
      ctx.fill()
    }
  } else if (k === 3) {
    ctx.fillStyle = '#ea580c'
    ellipse(ctx, 30, 36, 24, 18)
    ctx.fill()
    ctx.strokeStyle = '#9a3412'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(30, 36, 10, 18, 0, 0, TAU)
    ctx.stroke()
    ctx.fillStyle = '#65a30d'
    ctx.fillRect(28, 14, 5, 8)
  } else {
    ctx.fillStyle = '#facc15'
    ellipse(ctx, 30, 30, 10, 24, 0.5)
    ctx.fill()
    ctx.fillStyle = '#a3a33a'
    ellipse(ctx, 20, 44, 6, 16, 0.9)
    ctx.fill()
  }
}

/** A Christmas tree; frame k has k tenths of its lights on (0–10), the star on at full. */
function christmasTree(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  const on = (f % 11) / 10
  ctx.fillStyle = '#78350f'
  ctx.fillRect(88, 290, 24, 30)
  for (let t = 0; t < 4; t++) {
    const top = 36 + t * 62
    const w = 40 + t * 22
    const g = ctx.createLinearGradient(100 - w, 0, 100 + w, 0)
    g.addColorStop(0, shade(color, -0.35))
    g.addColorStop(0.5, shade(color, 0.1))
    g.addColorStop(1, shade(color, -0.3))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(100, top)
    ctx.quadraticCurveTo(100 - w * 0.4, top + 60, 100 - w, top + 92)
    ctx.quadraticCurveTo(100, top + 80, 100 + w, top + 92)
    ctx.quadraticCurveTo(100 + w * 0.4, top + 60, 100, top)
    ctx.fill()
  }
  // Lights, lit from the bottom up.
  const lights = 40
  for (let k = 0; k < lights; k++) {
    const y = 300 - (k / lights) * 240 - 10
    const half = 14 + ((y - 40) / 260) * 82
    const x = 100 + Math.sin(k * 2.4) * half * 0.8
    const lit = k / lights < on
    const c = ['#ef4444', '#facc15', '#38bdf8', '#22c55e', color2][k % 5]
    if (lit) glow(ctx, x, y, 9, c, 0.8)
    ctx.fillStyle = lit ? '#ffffff' : 'rgba(30,30,30,0.6)'
    circle(ctx, x, y, lit ? 2.5 : 2)
    ctx.fill()
  }
  // Star.
  const lit = on >= 1
  if (lit) glow(ctx, 100, 30, 34, '#fde68a', 0.9)
  ctx.fillStyle = lit ? '#fde047' : '#a8a29e'
  ctx.beginPath()
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k / 10) * TAU
    const r = k % 2 ? 9 : 22
    ctx.lineTo(100 + Math.cos(a) * r, 30 + Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fill()
}

/** A dairy cow grazing (head down) or looking up and mooing (look frames), facing right, tail swishing. */
function cow(look: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const s = Math.sin(p)
    for (const [x, a] of [[66, s * 0.15], [80, -s * 0.15], [160, -s * 0.15], [174, s * 0.15]] as const) {
      const [ex, ey] = limb(ctx, x, 120, 30, 26, a, 0, 13, x % 20 ? '#f5f5f4' : '#e7e5e4')
      ctx.fillStyle = '#292524'
      ctx.fillRect(ex - 7, ey - 2, 14, 8)
    }
    // Tail swishing.
    ctx.strokeStyle = '#f5f5f4'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(54, 80)
    ctx.quadraticCurveTo(40 + s * 10, 110, 44 + s * 14, 140)
    ctx.stroke()
    ctx.fillStyle = '#292524'
    ellipse(ctx, 44 + s * 14, 144, 5, 9)
    ctx.fill()
    // Body with patches.
    ctx.fillStyle = '#f5f5f4'
    ctx.beginPath()
    ctx.roundRect(52, 66, 136, 66, 28)
    ctx.fill()
    ctx.save()
    ctx.clip()
    ctx.fillStyle = color
    ellipse(ctx, 86, 80, 26, 20, 0.4)
    ctx.fill()
    ellipse(ctx, 150, 104, 30, 22, -0.3)
    ctx.fill()
    ellipse(ctx, 60, 120, 16, 14)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = color2
    ellipse(ctx, 120, 134, 14, 8)
    ctx.fill()
    // Head: down in the grass, or up and mooing.
    const [hx, hy] = look ? [206, 64] : [214, 128]
    ctx.strokeStyle = '#f5f5f4'
    ctx.lineWidth = 30
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(180, 86)
    ctx.lineTo(hx - 10, hy)
    ctx.stroke()
    ctx.fillStyle = '#f5f5f4'
    ellipse(ctx, hx, hy, 22, 20)
    ctx.fill()
    ctx.fillStyle = color
    ellipse(ctx, hx - 6, hy - 8, 10, 8)
    ctx.fill()
    ctx.fillStyle = color2
    ellipse(ctx, hx + 14, hy + 8, 13, 11)
    ctx.fill()
    ctx.fillStyle = '#7f1d1d'
    if (look) {
      ellipse(ctx, hx + 16, hy + 12, 6, 4 + Math.max(0, s) * 3)
      ctx.fill()
    }
    ctx.fillStyle = '#111'
    circle(ctx, hx + 4, hy - 4, 3)
    ctx.fill()
    ctx.fillStyle = '#e7e5e4'
    ctx.beginPath()
    ctx.moveTo(hx - 12, hy - 16)
    ctx.quadraticCurveTo(hx - 20, hy - 30, hx - 10, hy - 32)
    ctx.lineTo(hx - 6, hy - 18)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#f5f5f4'
    ellipse(ctx, hx - 20, hy - 8, 10, 5, 0.4)
    ctx.fill()
    // Cowbell.
    ctx.fillStyle = '#ca8a04'
    ctx.beginPath()
    ctx.moveTo(hx - 22, hy + 16)
    ctx.lineTo(hx - 12, hy + 16)
    ctx.lineTo(hx - 8, hy + 30)
    ctx.lineTo(hx - 26, hy + 30)
    ctx.closePath()
    ctx.fill()
  }
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
  // Sitting on the roofline (or hanging under it), flying off when people come near.
  crows: [
    { id: 'main', frames: 4, w: 160, h: 170, paint: perchedBird('crow') },
    { id: 'fly', frames: 8, w: 256, h: 176, paint: (ctx, f, n, c) => bird(ctx, f, n, { ...c, color2: '#52525b' }) },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Caw! Caw!') },
    SPARKLE,
  ],
  doves: [
    { id: 'main', frames: 4, w: 160, h: 170, paint: perchedBird('dove') },
    { id: 'fly', frames: 8, w: 256, h: 176, paint: (ctx, f, n, c) => bird(ctx, f, n, { ...c, color2: '#f59e0b' }) },
    SPARKLE,
  ],
  cardinals: [
    { id: 'main', frames: 4, w: 160, h: 170, paint: perchedBird('cardinal') },
    { id: 'fly', frames: 8, w: 256, h: 176, paint: bird },
    SPARKLE,
  ],
  'hanging-bats': [
    { id: 'main', frames: 4, w: 120, h: 170, paint: hangingBat },
    { id: 'fly', frames: 8, w: 256, h: 160, paint: bat },
    SPARKLE,
  ],
  // Sliding down the roof from the peak and off the end.
  sledders: [
    { id: 'main', frames: 2, w: 220, h: 150, paint: sledder },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Wheee!') },
    SPARKLE,
  ],
  'sliding-penguins': [
    { id: 'main', frames: 2, w: 250, h: 130, paint: slidingPenguin },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Wheee!') },
    SPARKLE,
  ],
  'jingle-bells': [
    { id: 'main', frames: 4, w: 120, h: 130, paint: jingleBell },
    { id: 'thread', frames: 1, w: 8, h: 256, paint: ribbon },
    SPARKLE,
  ],
  stockings: [
    { id: 'main', frames: 2, w: 100, h: 170, paint: stocking },
    { id: 'thread', frames: 1, w: 8, h: 256, paint: ribbon },
    SPARKLE,
  ],
  'candy-canes': [{ id: 'main', frames: 4, w: 120, h: 120, paint: candyCane }, SPARKLE],
  'gold-coins': [{ id: 'main', frames: 8, w: 100, h: 100, paint: goldCoin }, SPARKLE],
  'falling-candy': [{ id: 'main', frames: 4, w: 100, h: 100, paint: candy }, SPARKLE],
  'parachute-presents': [{ id: 'main', frames: 1, w: 160, h: 190, paint: parachutePresent }, SPARKLE],
  sparklers: [{ id: 'main', frames: 4, w: 120, h: 200, paint: sparkler }, SPARKLE],
  'floating-candles': [{ id: 'main', frames: 4, w: 80, h: 170, paint: floatingCandle }, SPARKLE],
  'rolling-pumpkins': [{ id: 'main', frames: 1, w: 160, h: 160, paint: rollingPumpkin }, SPARKLE],
  snowmen: [
    { id: 'main', frames: 8, w: 170, h: 240, paint: snowman },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Let it snow!') },
    SPARKLE,
  ],
  'santa-walking': [
    { id: 'main', frames: 8, w: 200, h: 268, paint: santaWalking },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Merry Christmas!') },
    SPARKLE,
  ],
  hens: [
    { id: 'main', frames: 8, w: 190, h: 170, paint: hen },
    { id: 'baby', frames: 8, w: 90, h: 80, paint: chick },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Cluck cluck!') },
    SPARKLE,
  ],
  'ice-cream-truck': [
    { id: 'main', frames: 4, w: 350, h: 215, paint: iceCreamTruck },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Ice cream!') },
    SPARKLE,
  ],
  'fire-truck': [
    { id: 'main', frames: 4, w: 410, h: 205, paint: fireTruck },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Wee-oo wee-oo!') },
    SPARKLE,
  ],
  'race-cars': [{ id: 'main', frames: 4, w: 300, h: 120, paint: raceCar }, SPARKLE],
  drummers: [{ id: 'main', frames: 8, w: 170, h: 262, paint: drummer }, SPARKLE],
  scarecrows: [
    { id: 'main', frames: 8, w: 200, h: 280, paint: scarecrow },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Boo!') },
    SPARKLE,
  ],
  'love-letters': [{ id: 'main', frames: 8, w: 200, h: 170, paint: loveLetter }, SPARKLE],
  seahorses: [{ id: 'main', frames: 8, w: 130, h: 215, paint: seahorse }, SPARKLE],
  mermaids: [
    { id: 'main', frames: 8, w: 280, h: 150, paint: mermaid },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Hello there!') },
    SPARKLE,
  ],
  submarines: [{ id: 'main', frames: 4, w: 250, h: 140, paint: submarine }, SPARKLE],
  'origami-cranes': [{ id: 'main', frames: 8, w: 220, h: 160, paint: origamiCrane }, SPARKLE],
  pufferfish: [{ id: 'main', frames: 8, w: 160, h: 140, paint: pufferfish }, SPARKLE],
  koi: [{ id: 'main', frames: 8, w: 215, h: 110, paint: koi }, SPARKLE],
  // Fifth batch. Peeking over the window sills, eyes in the dark windows.
  'peeking-ghosts': [
    { id: 'main', frames: 4, w: 200, h: 150, paint: peekingGhost },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Boo!') },
    SPARKLE,
  ],
  'peeking-elves': [
    { id: 'main', frames: 4, w: 200, h: 150, paint: peekingElf },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('I see you!') },
    SPARKLE,
  ],
  'window-cats': [
    { id: 'main', frames: 4, w: 200, h: 150, paint: peekingCat },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Meow?') },
    SPARKLE,
  ],
  'window-eyes': [
    { id: 'main', frames: 4, w: 220, h: 110, paint: windowEyes },
    { id: 'pupil', frames: 1, w: 64, h: 64, paint: eyePupil },
    SPARKLE,
  ],
  // On the roofline: owls turn their heads to watch people, gulls squawk.
  'perched-owls': [
    { id: 'main', frames: 4, w: 200, h: 212, paint: perchedOwl },
    { id: 'fly', frames: 8, w: 300, h: 230, paint: owl },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Hoo hoo!') },
    SPARKLE,
  ],
  seagulls: [
    { id: 'main', frames: 4, w: 170, h: 160, paint: perchedGull },
    { id: 'fly', frames: 8, w: 256, h: 176, paint: (ctx, f, n, c) => bird(ctx, f, n, { color: '#f8fafc', color2: c.color2 }) },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Mine! Mine!') },
    SPARKLE,
  ],
  // Throwing at the house, or at people.
  'snowball-kids': [
    { id: 'main', frames: 4, w: 180, h: 240, paint: snowballKid },
    { id: 'ball', frames: 1, w: 48, h: 48, paint: snowball },
    { id: 'splat', frames: 1, w: 120, h: 80, paint: snowSplat },
    SPARKLE,
  ],
  'water-balloon-kids': [
    { id: 'main', frames: 4, w: 180, h: 240, paint: balloonKid },
    { id: 'ball', frames: 1, w: 48, h: 52, paint: (ctx, f, n, c) => waterBalloon(ctx, f, n, c) },
    { id: 'splat', frames: 1, w: 160, h: 100, paint: splash },
    SPARKLE,
  ],
  // Coming up out of something along the bottom of the house.
  'jack-in-the-box': [
    { id: 'main', frames: 8, w: 140, h: 220, paint: jester },
    { id: 'box', frames: 2, w: 120, h: 110, paint: jackBox },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Surprise!') },
    SPARKLE,
  ],
  moles: [
    { id: 'main', frames: 8, w: 130, h: 150, paint: mole },
    { id: 'mound', frames: 1, w: 160, h: 60, paint: dirtMound },
    SPARKLE,
  ],
  coffins: [
    { id: 'main', frames: 4, w: 160, h: 260, paint: coffin },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Good evening!') },
    SPARKLE,
  ],
  'grave-ghosts': [
    { id: 'main', frames: 8, w: 200, h: 240, paint: ghost },
    { id: 'stone', frames: 1, w: 140, h: 170, paint: tombstone },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Boo!') },
    SPARKLE,
  ],
  'party-poppers': [
    { id: 'main', frames: 1, w: 100, h: 150, paint: partyPopper },
    { id: 'burst', frames: 6, w: 80, h: 80, paint: confetti },
    SPARKLE,
  ],
  'birthday-cakes': [
    { id: 'main', frames: 4, w: 220, h: 220, paint: birthdayCake(true) },
    { id: 'out', frames: 4, w: 220, h: 220, paint: birthdayCake(false) },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Happy birthday!') },
    SPARKLE,
  ],
  skiers: [
    { id: 'main', frames: 2, w: 220, h: 160, paint: skier },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Whoa!') },
    SPARKLE,
  ],
  'ice-skaters': [{ id: 'main', frames: 8, w: 200, h: 260, paint: iceSkater }, SPARKLE],
  // Shy ones stop and hide when people come near.
  snails: [
    { id: 'main', frames: 8, w: 220, h: 130, paint: snail(false) },
    { id: 'hide', frames: 1, w: 220, h: 130, paint: snail(true) },
    SPARKLE,
  ],
  tortoises: [
    { id: 'main', frames: 8, w: 220, h: 130, paint: tortoise(false) },
    { id: 'hide', frames: 1, w: 220, h: 130, paint: tortoise(true) },
    SPARKLE,
  ],
  hedgehogs: [
    { id: 'main', frames: 8, w: 200, h: 130, paint: hedgehog(false) },
    { id: 'hide', frames: 1, w: 200, h: 130, paint: hedgehog(true) },
    SPARKLE,
  ],
  skunks: [
    { id: 'main', frames: 8, w: 210, h: 135, paint: skunk(false) },
    { id: 'hide', frames: 1, w: 210, h: 135, paint: skunk(true) },
    SPARKLE,
  ],
  'uncle-sam': [
    { id: 'main', frames: 8, w: 190, h: 360, paint: stiltWalker },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Happy 4th!') },
    SPARKLE,
  ],
  'football-players': [
    { id: 'main', frames: 8, w: 170, h: 230, paint: footballPlayer },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Touchdown!') },
    SPARKLE,
  ],
  storks: [{ id: 'main', frames: 8, w: 290, h: 190, paint: stork }, SPARKLE],
  'flying-pigs': [{ id: 'main', frames: 8, w: 230, h: 160, paint: flyingPig }, SPARKLE],
  unicorns: [{ id: 'main', frames: 8, w: 270, h: 200, paint: unicorn }, SPARKLE],
  'magic-carpet': [{ id: 'main', frames: 8, w: 270, h: 150, paint: magicCarpet }, SPARKLE],
  fairies: [{ id: 'main', frames: 8, w: 140, h: 130, paint: fairy }, SPARKLE],
  superheroes: [
    { id: 'main', frames: 8, w: 240, h: 130, paint: superhero },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Up and away!') },
    SPARKLE,
  ],
  ladybugs: [{ id: 'main', frames: 8, w: 140, h: 100, paint: ladybug }, SPARKLE],
  moths: [{ id: 'main', frames: 8, w: 130, h: 100, paint: moth }, SPARKLE],
  // Sixth batch.
  wolves: [
    // Looking left, ahead, right, howling (the order the perching ones turn their heads in).
    { id: 'main', frames: 4, w: 200, h: 200, paint: (ctx, f, n, c) => roofWolf(ctx, [1, 0, 2, 3][f % 4], n, c) },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Awooo!') },
    SPARKLE,
  ],
  moon: [{ id: 'main', frames: 24, w: 200, h: 200, paint: moonPhase }, SPARKLE],
  pinatas: [
    { id: 'main', frames: 2, w: 210, h: 180, paint: pinata },
    { id: 'thread', frames: 1, w: 8, h: 256, paint: silk },
    { id: 'candy', frames: 4, w: 100, h: 100, paint: candy },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Candy!') },
    SPARKLE,
  ],
  ornaments: [
    { id: 'main', frames: 8, w: 100, h: 104, paint: ornament },
    { id: 'thread', frames: 1, w: 8, h: 256, paint: ribbon },
    SPARKLE,
  ],
  icicles: [
    { id: 'main', frames: 3, w: 142, h: 180, paint: icicles },
    { id: 'drop', frames: 1, w: 32, h: 32, paint: waterDrop },
    SPARKLE,
  ],
  flags: [{ id: 'main', frames: 8, w: 200, h: 224, paint: waveFlag }, SPARKLE],
  'gift-boxes': [
    { id: 'main', frames: 4, w: 160, h: 200, paint: giftBox },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Surprise!') },
    SPARKLE,
  ],
  cauldrons: [
    { id: 'main', frames: 8, w: 220, h: 220, paint: cauldron },
    { id: 'brew', frames: 1, w: 40, h: 40, paint: brewBubble },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Hubble bubble!') },
    SPARKLE,
  ],
  'glowing-pumpkins': [
    { id: 'main', frames: 4, w: 200, h: 200, paint: litPumpkin(false) },
    { id: 'boo', frames: 4, w: 200, h: 200, paint: litPumpkin(true) },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Boo!') },
    SPARKLE,
  ],
  'burrow-bunnies': [
    { id: 'main', frames: 8, w: 160, h: 200, paint: burrowBunny },
    { id: 'mound', frames: 1, w: 160, h: 60, paint: dirtMound },
    SPARKLE,
  ],
  helicopter: [
    // Painted facing left; turned round to face the way it flies like the rest.
    {
      id: 'main', frames: 8, w: 290, h: 150,
      paint: (ctx, f, n, c) => {
        ctx.translate(290, 0)
        ctx.scale(-1, 1)
        helicopter(ctx, f, n, c)
      },
    },
    { id: 'search', frames: 1, w: 200, h: 300, paint: searchBeam },
    SPARKLE,
  ],
  sprinklers: [
    { id: 'main', frames: 1, w: 80, h: 100, paint: sprinklerHead },
    { id: 'spray', frames: 8, w: 300, h: 210, paint: sprinklerSpray },
    SPARKLE,
  ],
  'snow-globes': [{ id: 'main', frames: 8, w: 200, h: 212, paint: snowGlobe }, SPARKLE],
  'manta-rays': [
    // Painted with the wing tips reaching past the cell at the top of the beat: drawn a little smaller.
    {
      id: 'main', frames: 8, w: 220, h: 160,
      paint: (ctx, f, n, c) => {
        ctx.translate(110, 80)
        ctx.scale(0.68, 0.68)
        ctx.translate(-110, -80)
        mantaRay(ctx, f, n, c)
      },
    },
    SPARKLE,
  ],
  clownfish: [{ id: 'main', frames: 8, w: 130, h: 100, paint: clownfish }, SPARKLE],
  anglerfish: [{ id: 'main', frames: 8, w: 220, h: 170, paint: anglerfish }, SPARKLE],
  starfish: [{ id: 'main', frames: 8, w: 160, h: 160, paint: starfish }, SPARKLE],
  surfers: [
    { id: 'main', frames: 8, w: 240, h: 230, paint: surfer },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Cowabunga!') },
    SPARKLE,
  ],
  sailboats: [{ id: 'main', frames: 8, w: 220, h: 210, paint: sailboat }, SPARKLE],
  snowplow: [
    { id: 'main', frames: 8, w: 350, h: 180, paint: snowplow },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Beep beep!') },
    SPARKLE,
  ],
  'pirate-ship': [
    { id: 'main', frames: 8, w: 300, h: 240, paint: pirateShip },
    { id: 'puff', frames: 1, w: 128, h: 128, paint: puff },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Arr!') },
    SPARKLE,
  ],
  rudolph: [{ id: 'main', frames: 8, w: 250, h: 190, paint: rudolph }, SPARKLE],
  fountains: [{ id: 'main', frames: 8, w: 260, h: 250, paint: fountain }, SPARKLE],
  'web-spiders': [
    { id: 'main', frames: 1, w: 220, h: 220, paint: spiderWeb },
    { id: 'spider', frames: 8, w: 100, h: 100, paint: webSpider },
    { id: 'thread', frames: 1, w: 8, h: 256, paint: silk },
    SPARKLE,
  ],
  'leaf-piles': [
    { id: 'main', frames: 1, w: 240, h: 130, paint: leafPile },
    { id: 'leaf', frames: 4, w: 40, h: 40, paint: pileLeaf },
    SPARKLE,
  ],
  puddles: [
    { id: 'main', frames: 8, w: 220, h: 80, paint: puddle },
    { id: 'splash', frames: 1, w: 160, h: 100, paint: splash },
    SPARKLE,
  ],
  gnomes: [{ id: 'main', frames: 8, w: 160, h: 240, paint: gnome }, SPARKLE],
  'cuckoo-clock': [
    { id: 'main', frames: 1, w: 200, h: 300, paint: cuckooClock },
    { id: 'hand', frames: 2, w: 20, h: 100, paint: clockHand },
    { id: 'cuckoo', frames: 2, w: 100, h: 60, paint: cuckooBird },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Cuckoo!') },
    SPARKLE,
  ],
  robins: [
    { id: 'main', frames: 4, w: 160, h: 170, paint: perchedRobin },
    { id: 'fly', frames: 8, w: 256, h: 176, paint: (ctx, f, n, c) => bird(ctx, f, n, { ...c, color2: '#78350f' }) },
    SPARKLE,
  ],
  peacocks: [
    { id: 'main', frames: 8, w: 240, h: 240, paint: (ctx, f, n, c) => (ctx.translate(10, 0), peacock(false)(ctx, f, n, c)) },
    // Stopping to fan its tail for people.
    { id: 'wave', frames: 8, w: 240, h: 240, paint: (ctx, f, n, c) => (ctx.translate(10, 0), peacock(true)(ctx, f, n, c)) },
    SPARKLE,
  ],
  'pot-of-gold': [
    { id: 'main', frames: 8, w: 200, h: 170, paint: potOfGold },
    { id: 'rainbow', frames: 1, w: 400, h: 200, paint: rainbowArc },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Lucky you!') },
    SPARKLE,
  ],
  'easter-eggs': [
    { id: 'main', frames: 4, w: 100, h: 124, paint: easterEgg },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Found one!') },
    SPARKLE,
  ],
  'teddy-bears': [
    { id: 'main', frames: 8, w: 160, h: 230, paint: teddyBear },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Hugs!') },
    SPARKLE,
  ],
  diyas: [{ id: 'main', frames: 4, w: 120, h: 100, paint: diya }, SPARKLE],
  // Seventh batch.
  'santa-chimney': [
    { id: 'main', frames: 1, w: 200, h: 160, paint: chimney },
    { id: 'santa', frames: 8, w: 200, h: 200, paint: chimneySanta },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Ho ho ho!') },
    SPARKLE,
  ],
  'roof-reindeer': [
    // Looking left, ahead, right (the order the perching ones turn their heads in), then pawing the roof.
    {
      id: 'main', frames: 4, w: 240, h: 210,
      paint: (ctx, f, _n, c) => {
        if (f % 4 === 0) {
          ctx.translate(240, 0)
          ctx.scale(-1, 1)
        }
        reindeer(ctx, 104, 132, f % 4 === 3 ? TAU * 0.25 : 0, false, c.color)
      },
    },
    SPARKLE,
  ],
  'window-candles': [{ id: 'main', frames: 4, w: 80, h: 156, paint: windowCandle }, SPARKLE],
  'disco-ball': [
    { id: 'main', frames: 8, w: 120, h: 130, paint: discoBall },
    { id: 'thread', frames: 1, w: 8, h: 256, paint: silk },
    { id: 'spot', frames: 4, w: 40, h: 40, paint: lightSpot },
    SPARKLE,
  ],
  searchlights: [
    { id: 'main', frames: 1, w: 120, h: 120, paint: searchlightBase },
    { id: 'beam', frames: 1, w: 100, h: 600, paint: skyBeam },
    SPARKLE,
  ],
  'ball-drop': [
    { id: 'main', frames: 1, w: 100, h: 500, paint: ballPole },
    { id: 'ball', frames: 4, w: 160, h: 160, paint: newYearBall },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Happy New Year!') },
    SPARKLE,
  ],
  champagne: [
    { id: 'main', frames: 2, w: 100, h: 250, paint: champagneBottle },
    { id: 'cork', frames: 1, w: 40, h: 40, paint: cork },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Cheers!') },
    SPARKLE,
  ],
  firecrackers: [
    { id: 'main', frames: 11, w: 100, h: 300, paint: firecrackers },
    { id: 'thread', frames: 1, w: 8, h: 256, paint: ribbon },
    { id: 'bang', frames: 4, w: 100, h: 100, paint: bang },
    SPARKLE,
  ],
  'graduation-caps': [
    { id: 'main', frames: 8, w: 120, h: 100, paint: gradCap },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Congrats!') },
    SPARKLE,
  ],
  'school-bus': [
    { id: 'main', frames: 8, w: 360, h: 170, paint: schoolBus(false) },
    { id: 'halt', frames: 4, w: 360, h: 170, paint: schoolBus(true) },
    SPARKLE,
  ],
  tractors: [
    { id: 'main', frames: 8, w: 240, h: 160, paint: tractor },
    { id: 'puff', frames: 1, w: 128, h: 128, paint: puff },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Howdy!') },
    SPARKLE,
  ],
  deer: [
    { id: 'main', frames: 8, w: 220, h: 160, paint: deer(false) },
    { id: 'halt', frames: 4, w: 220, h: 160, paint: deer(true) },
    SPARKLE,
  ],
  foxes: [{ id: 'main', frames: 8, w: 200, h: 120, paint: fox }, SPARKLE],
  raccoons: [
    { id: 'main', frames: 4, w: 160, h: 170, paint: raccoon },
    { id: 'can', frames: 1, w: 160, h: 165, paint: trashCan },
    SPARKLE,
  ],
  'witch-crash': [
    { id: 'main', frames: 8, w: 400, h: 260, paint: witch },
    { id: 'splat', frames: 1, w: 250, h: 240, paint: witchSplat },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Ouch!') },
    SPARKLE,
  ],
  'rain-clouds': [
    { id: 'main', frames: 8, w: 260, h: 140, paint: rainCloud(false) },
    { id: 'dark', frames: 8, w: 260, h: 140, paint: rainCloud(true) },
    { id: 'rain', frames: 1, w: 20, h: 40, paint: rainStreak },
    { id: 'bolt', frames: 1, w: 100, h: 200, paint: lightningBolt },
    SPARKLE,
  ],
  'hockey-players': [
    { id: 'main', frames: 4, w: 170, h: 225, paint: hockeyPlayer },
    { id: 'ball', frames: 1, w: 48, h: 40, paint: puck },
    { id: 'splat', frames: 1, w: 160, h: 100, paint: puckHit },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('He shoots, he scores!') },
    SPARKLE,
  ],
  lighthouse: [
    { id: 'main', frames: 8, w: 160, h: 300, paint: lighthouse },
    { id: 'beam', frames: 1, w: 600, h: 100, paint: lighthouseBeam },
    SPARKLE,
  ],
  tumbleweeds: [{ id: 'main', frames: 1, w: 140, h: 140, paint: tumbleweed }, SPARKLE],
  bigfoot: [
    { id: 'main', frames: 8, w: 220, h: 300, paint: bigfoot(false) },
    { id: 'look', frames: 8, w: 220, h: 300, paint: bigfoot(true) },
    SPARKLE,
  ],
  'skeleton-dogs': [
    { id: 'main', frames: 8, w: 220, h: 160, paint: skeletonDog },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Arf arf!') },
    SPARKLE,
  ],
  sunflowers: [{ id: 'main', frames: 4, w: 140, h: 300, paint: sunflower }, SPARKLE],
  tulips: [{ id: 'main', frames: 4, w: 100, h: 200, paint: tulip }, SPARKLE],
  'bird-feeder': [
    { id: 'main', frames: 1, w: 144, h: 300, paint: birdFeeder },
    { id: 'bird', frames: 2, w: 80, h: 60, paint: feederBird },
    SPARKLE,
  ],
  beehive: [
    { id: 'main', frames: 1, w: 160, h: 200, paint: beehive },
    { id: 'bee', frames: 8, w: 170, h: 130, paint: bee },
    SPARKLE,
  ],
  'wind-chimes': [
    { id: 'main', frames: 8, w: 140, h: 230, paint: windChimes },
    { id: 'thread', frames: 1, w: 8, h: 256, paint: silk },
    SPARKLE,
  ],
  campfire: [
    { id: 'main', frames: 8, w: 200, h: 190, paint: campfire },
    { id: 'ember', frames: 1, w: 24, h: 24, paint: ember },
    SPARKLE,
  ],
  kinara: [
    { id: 'main', frames: 8, w: 280, h: 180, paint: kinara },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Habari gani?') },
    SPARKLE,
  ],
  fanous: [
    { id: 'main', frames: 8, w: 120, h: 184, paint: fanous },
    { id: 'thread', frames: 1, w: 8, h: 256, paint: silk },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Ramadan Kareem!') },
    SPARKLE,
  ],
  'hula-dancers': [
    { id: 'main', frames: 8, w: 180, h: 240, paint: hulaDancer },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Aloha!') },
    SPARKLE,
  ],
  mariachi: [
    { id: 'main', frames: 8, w: 200, h: 250, paint: mariachi },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('¡Olé!') },
    SPARKLE,
  ],
  bagpipers: [{ id: 'main', frames: 8, w: 180, h: 250, paint: bagpiper }, SPARKLE],
  pilgrims: [
    { id: 'main', frames: 8, w: 180, h: 250, paint: pilgrim },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Happy Thanksgiving!') },
    SPARKLE,
  ],
  cornucopia: [
    { id: 'main', frames: 1, w: 220, h: 180, paint: cornucopia },
    { id: 'piece', frames: 5, w: 60, h: 60, paint: harvestPiece },
    SPARKLE,
  ],
  'christmas-tree': [{ id: 'main', frames: 11, w: 200, h: 320, paint: christmasTree }, SPARKLE],
  cows: [
    { id: 'main', frames: 8, w: 256, h: 190, paint: cow(false) },
    { id: 'look', frames: 8, w: 256, h: 190, paint: cow(true) },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: saying('Moo!') },
    SPARKLE,
  ],
}
