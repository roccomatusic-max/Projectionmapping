/**
 * The pictures the flying and walking elements are made of: Santa's sleigh
 * and reindeer, a Christmas train, birds, bats, elves, penguins, shooting
 * stars and ghosts. Each is painted with the 2D canvas, facing right, once
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

function hoho(ctx: Ctx, _f: number, _n: number, { color }: SpriteColors) {
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.beginPath()
  ctx.roundRect(8, 8, 344, 96, 48)
  ctx.moveTo(70, 100)
  ctx.lineTo(50, 132)
  ctx.lineTo(104, 102)
  ctx.fill()
  ctx.fillStyle = shade(color, -0.1)
  ctx.font = 'bold 54px "Countdown Script", "Great Vibes", Georgia, serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('Ho ho ho!', 180, 58)
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

// -- the rows each style is made of ------------------------------------------------------

const SPARKLE: SpriteRow = { id: 'sparkle', frames: 4, w: 64, h: 64, paint: sparkle }

export const SPRITE_ROWS: Record<string, SpriteRow[]> = {
  sleigh: [
    { id: 'main', frames: 8, w: 1024, h: 256, paint: sleighTeam },
    { id: 'bubble', frames: 1, w: 360, h: 140, paint: hoho },
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
}
