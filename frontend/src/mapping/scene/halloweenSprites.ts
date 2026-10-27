/**
 * More pictures for Halloween and the Day of the Dead: the Headless
 * Horseman, a haunted tree that wakes up, a candy bowl with a hand in it,
 * a skeleton band, a mad scientist's Tesla coil, hands on the windows and
 * figures in them, a rocking chair nobody is sitting in, a swamp monster,
 * gargoyles on the roof, a mailbox that bites, skeletons hanging from the
 * gutter, eyes in the hedge, a spider on the wall, snakes, tentacles, a
 * fortune teller, dancing zombies, a creaking cemetery gate and a tower of
 * jack-o'-lanterns; catrinas, sugar skulls and an ofrenda.
 *
 * Painted the same way as sprites.ts: facing right, one frame at a time,
 * into a cell of w by h design units.
 */

import {
  circle, ellipse, glow, limb, leg, rgba, saying, shade, SPARKLE, TAU,
  type Ctx, type SpriteColors, type SpriteRow,
} from './sprites'

/** A number from 0 to 1 that is always the same for the same n (for painting the same speckles every frame). */
function noise(n: number): number {
  const s = Math.sin(n * 91.345 + 47.853) * 43758.5453
  return s - Math.floor(s)
}

// -- jack-o'-lanterns -------------------------------------------------------------------------------

type Mood = 'grin' | 'boo' | 'laugh' | 'dark'

/** A carved pumpkin lit from inside: look moves the face left (-1) or right (1) as if it turned. */
export function jackOLantern(ctx: Ctx, x: number, y: number, r: number, light: string, mood: Mood = 'grin', look = 0) {
  const ry = r * 0.82
  // Ribs: overlapping lobes, the outer ones darker.
  for (const [dx, k, w] of [[-0.62, -0.28, 0.5], [0.62, -0.28, 0.5], [-0.3, -0.1, 0.55], [0.3, -0.1, 0.55], [0, 0.05, 0.5]] as const) {
    const g = ctx.createLinearGradient(x, y - ry, x, y + ry)
    g.addColorStop(0, shade('#f97316', k + 0.15))
    g.addColorStop(0.6, shade('#ea580c', k))
    g.addColorStop(1, shade('#9a3412', k))
    ctx.fillStyle = g
    ellipse(ctx, x + dx * r * 0.62 + look * r * 0.05, y, r * w, ry)
    ctx.fill()
  }
  ctx.strokeStyle = 'rgba(124,45,18,0.55)'
  ctx.lineWidth = r * 0.04
  for (const dx of [-0.45, -0.15, 0.15, 0.45]) {
    ctx.beginPath()
    ctx.moveTo(x + dx * r, y - ry * 0.92)
    ctx.quadraticCurveTo(x + dx * r * 1.25, y, x + dx * r, y + ry * 0.94)
    ctx.stroke()
  }
  // Stem.
  ctx.fillStyle = '#4d7c0f'
  ctx.beginPath()
  ctx.moveTo(x - r * 0.1, y - ry * 0.9)
  ctx.quadraticCurveTo(x - r * 0.05, y - ry * 1.25, x + r * 0.16, y - ry * 1.32)
  ctx.lineTo(x + r * 0.18, y - ry * 1.18)
  ctx.quadraticCurveTo(x + r * 0.08, y - ry * 1.1, x + r * 0.1, y - ry * 0.88)
  ctx.closePath()
  ctx.fill()
  if (mood === 'dark') return
  // The face, cut through to the candle.
  const fx = x + look * r * 0.32
  const fill = () => {
    const g = ctx.createRadialGradient(fx, y, 0, fx, y, r)
    g.addColorStop(0, '#fff7c2')
    g.addColorStop(0.45, '#fde047')
    g.addColorStop(1, light)
    ctx.fillStyle = g
    ctx.fill()
  }
  const sq = 1 - Math.abs(look) * 0.25
  for (const k of [-1, 1]) {
    ctx.beginPath()
    const ex = fx + k * r * 0.36 * sq
    const ey = y - ry * 0.28
    if (mood === 'laugh') {
      // Squeezed shut with laughing: upturned crescents.
      ctx.moveTo(ex - r * 0.2, ey + r * 0.04)
      ctx.quadraticCurveTo(ex, ey - r * 0.24, ex + r * 0.2, ey + r * 0.04)
      ctx.quadraticCurveTo(ex, ey - r * 0.08, ex - r * 0.2, ey + r * 0.04)
    } else {
      const tall = mood === 'boo' ? 1.3 : 1
      ctx.moveTo(ex - r * 0.17, ey + r * 0.12)
      ctx.lineTo(ex + k * r * 0.02, ey - r * 0.2 * tall)
      ctx.lineTo(ex + r * 0.17, ey + r * 0.12)
    }
    ctx.closePath()
    fill()
  }
  // Nose.
  ctx.beginPath()
  ctx.moveTo(fx - r * 0.08, y + r * 0.02)
  ctx.lineTo(fx, y - r * 0.12)
  ctx.lineTo(fx + r * 0.08, y + r * 0.02)
  ctx.closePath()
  fill()
  // Mouth: a jagged grin, wide open for a Boo or a laugh.
  ctx.beginPath()
  const mw = r * 0.62 * sq
  const my = y + ry * 0.3
  const open = mood === 'grin' ? 0.16 : 0.36
  ctx.moveTo(fx - mw, my - r * 0.08)
  ctx.quadraticCurveTo(fx, my + r * (0.18 + open * 0.3), fx + mw, my - r * 0.08)
  ctx.quadraticCurveTo(fx, my + r * (0.18 + open * 1.4), fx - mw, my - r * 0.08)
  ctx.closePath()
  fill()
  ctx.fillStyle = '#c2410c'
  for (const k of [-0.32, 0.32]) {
    ctx.fillRect(fx + k * mw - r * 0.05, my - r * 0.02, r * 0.1, r * 0.12)
  }
}

// -- the Headless Horseman ----------------------------------------------------------------------------

function horse(ctx: Ctx, cx: number, cy: number, p: number, rear: boolean, eye: string) {
  // Black, but lit enough to show up on a wall.
  const coat = '#3f3a36'
  const s = Math.sin(p)
  const c = Math.cos(p)
  const far = '#292524'
  // Far legs.
  if (rear) {
    leg(ctx, cx + 62, cy + 2, 30, 32, 1.4 + 0.2 * s, -1.9, 10, far, '#000')
    leg(ctx, cx - 58, cy + 10, 34, 36, 0.25, -0.05, 12, far, '#000')
  } else {
    leg(ctx, cx + 58, cy + 10, 32, 34, 0.9 * s + 0.25, -1 + 0.6 * c, 10, far, '#000')
    leg(ctx, cx - 56, cy + 8, 34, 36, -0.9 * s - 0.2, 0.9 + 0.4 * c, 12, far, '#000')
  }
  // Tail streaming back.
  ctx.strokeStyle = '#0a0a0a'
  ctx.lineCap = 'round'
  for (let k = 0; k < 6; k++) {
    ctx.lineWidth = 7 - k
    ctx.beginPath()
    ctx.moveTo(cx - 82, cy - 18)
    ctx.bezierCurveTo(cx - 110, cy - 30 + k * 4 + s * 6, cx - 128, cy - 6 + k * 6, cx - 150, cy - 20 + k * 9 - s * 8)
    ctx.stroke()
  }
  // Body.
  const g = ctx.createLinearGradient(0, cy - 34, 0, cy + 34)
  g.addColorStop(0, shade(coat, 0.3))
  g.addColorStop(0.5, coat)
  g.addColorStop(1, shade(coat, -0.6))
  ctx.fillStyle = g
  ellipse(ctx, cx, cy, 86, 33, -0.04)
  ctx.fill()
  // Neck and head.
  ctx.beginPath()
  ctx.moveTo(cx + 50, cy - 22)
  ctx.quadraticCurveTo(cx + 78, cy - 78, cx + 104, cy - 96)
  ctx.lineTo(cx + 124, cy - 78)
  ctx.quadraticCurveTo(cx + 98, cy - 40, cx + 84, cy + 8)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = shade(coat, 0.12)
  ellipse(ctx, cx + 124, cy - 76, 36, 15, 0.75)
  ctx.fill()
  ctx.fillStyle = '#0a0a0a'
  ellipse(ctx, cx + 142, cy - 54, 9, 7, 0.75)
  ctx.fill()
  // Ears.
  ctx.fillStyle = coat
  ctx.beginPath()
  ctx.moveTo(cx + 100, cy - 100)
  ctx.lineTo(cx + 104, cy - 124)
  ctx.lineTo(cx + 112, cy - 98)
  ctx.fill()
  // A red eye, glowing.
  glow(ctx, cx + 118, cy - 86, 12, eye, 0.9)
  ctx.fillStyle = '#fecaca'
  circle(ctx, cx + 118, cy - 86, 2.5)
  ctx.fill()
  // Mane flying back.
  ctx.strokeStyle = '#000'
  for (let k = 0; k < 7; k++) {
    const mx = cx + 90 - k * 8
    const my = cy - 104 + k * 11
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(mx, my)
    ctx.quadraticCurveTo(mx - 12, my - 14 + s * 4, mx - 24 - k * 2, my - 8 - c * 5)
    ctx.stroke()
  }
  // Near legs.
  if (rear) {
    leg(ctx, cx + 70, cy + 4, 30, 32, 1.2 - 0.2 * s, -1.7, 11, coat, '#000')
    leg(ctx, cx - 50, cy + 12, 34, 36, -0.15, 0.1, 13, coat, '#000')
  } else {
    leg(ctx, cx + 66, cy + 10, 32, 34, -0.9 * s + 0.25, -1 - 0.6 * c, 11, coat, '#000')
    leg(ctx, cx - 48, cy + 10, 34, 36, 0.9 * s - 0.2, 0.9 - 0.4 * c, 13, coat, '#000')
  }
  // Saddle cloth.
  ctx.fillStyle = '#450a0a'
  ctx.beginPath()
  ctx.moveTo(cx - 34, cy - 28)
  ctx.lineTo(cx + 24, cy - 28)
  ctx.lineTo(cx + 20, cy + 10)
  ctx.lineTo(cx - 30, cy + 10)
  ctx.closePath()
  ctx.fill()
}

function headlessHorseman(rearing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const s = Math.sin(p)
    const bob = rearing ? 0 : -Math.abs(Math.sin(p)) * 8
    ctx.save()
    ctx.translate(0, bob)
    if (rearing) {
      // Up on the hind legs, front hooves pawing the air.
      ctx.translate(14, 40)
      ctx.translate(110, 230)
      ctx.rotate(-0.42)
      ctx.translate(-110, -230)
    }
    const cx = 150
    const cy = 168
    // The cloak streaming out behind the rider.
    ctx.fillStyle = shade(color, -0.35)
    ctx.beginPath()
    ctx.moveTo(150, 72)
    ctx.bezierCurveTo(110, 62 + s * 10, 60, 50 - s * 12, 18, 66 + s * 14)
    ctx.lineTo(36, 82 + s * 6)
    ctx.lineTo(14, 98 - s * 10)
    ctx.lineTo(40, 108)
    ctx.bezierCurveTo(80, 120, 118, 132, 150, 140)
    ctx.closePath()
    ctx.fill()
    horse(ctx, cx, cy, p, rearing, '#ef4444')
    // Rider: a boot in the stirrup, a dark coat, and nothing above the collar.
    ctx.fillStyle = '#0a0a0a'
    ctx.beginPath()
    ctx.moveTo(140, 136)
    ctx.lineTo(162, 136)
    ctx.lineTo(158, 186)
    ctx.lineTo(170, 194)
    ctx.lineTo(146, 196)
    ctx.closePath()
    ctx.fill()
    const coat = ctx.createLinearGradient(120, 60, 180, 140)
    coat.addColorStop(0, shade(color, 0.15))
    coat.addColorStop(1, shade(color, -0.3))
    ctx.fillStyle = coat
    ctx.beginPath()
    ctx.moveTo(128, 142)
    ctx.lineTo(124, 96)
    ctx.quadraticCurveTo(128, 70, 150, 64)
    ctx.quadraticCurveTo(172, 70, 176, 96)
    ctx.lineTo(178, 142)
    ctx.closePath()
    ctx.fill()
    // Buttons and the high collar, empty, a wisp of mist rising out of it.
    ctx.fillStyle = '#a8a29e'
    for (let k = 0; k < 3; k++) {
      circle(ctx, 162, 92 + k * 14, 2.5)
      ctx.fill()
    }
    ctx.fillStyle = shade(color, -0.5)
    ctx.beginPath()
    ctx.moveTo(136, 70)
    ctx.lineTo(142, 50)
    ctx.lineTo(158, 56)
    ctx.lineTo(166, 48)
    ctx.lineTo(166, 70)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#1c1917'
    ellipse(ctx, 151, 58, 11, 4)
    ctx.fill()
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = `rgba(203,213,225,${0.35 - k * 0.1})`
      ctx.lineWidth = 4 - k
      ctx.beginPath()
      ctx.moveTo(150 + k * 3, 56)
      ctx.bezierCurveTo(144 + s * 6, 40 - k * 6, 160 - s * 4, 30 - k * 8, 150 + s * 8, 14 - k * 4)
      ctx.stroke()
    }
    // The arm holding up the lit pumpkin, high and forward when he rears.
    const reach = rearing ? 2.6 : 1.8 + 0.1 * s
    const [hx, hy] = limb(ctx, 168, 78, 30, 30, reach, rearing ? 0.2 : 0.5, 11, shade(color, -0.1))
    jackOLantern(ctx, hx + 6, hy - 18, 22, color2, rearing ? 'boo' : 'grin', 0.4)
    glow(ctx, hx + 6, hy - 18, 46, color2, 0.25)
    ctx.restore()
  }
}

// -- a haunted tree that wakes up ---------------------------------------------------------------

/** A bare, crooked branch, splitting as it goes; reach bends it forward (to the right) like a clawing hand. */
function branch(ctx: Ctx, x: number, y: number, len: number, a: number, w: number, depth: number, reach: number, seed: number) {
  const bend = (noise(seed) - 0.5) * 0.6 + reach * 0.5
  const ex = x + Math.sin(a + bend * 0.5) * len
  const ey = y - Math.cos(a + bend * 0.5) * len
  ctx.lineWidth = w
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.quadraticCurveTo(x + Math.sin(a) * len * 0.6, y - Math.cos(a) * len * 0.6, ex, ey)
  ctx.stroke()
  if (depth <= 0) return
  const spread = 0.5 + 0.3 * noise(seed + 1)
  branch(ctx, ex, ey, len * 0.7, a + bend - spread * (1 - reach * 0.4), w * 0.62, depth - 1, reach, seed * 1.7 + 3)
  branch(ctx, ex, ey, len * 0.66, a + bend + spread * (1 - reach * 0.2), w * 0.6, depth - 1, reach, seed * 2.3 + 7)
}

function hauntedTree(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  // How awake: asleep at 0, eyes opening, mouth groaning, branches clawing forward at the end.
  const k = f / (frames - 1)
  const bark = color
  const reach = Math.max(0, (k - 0.4) / 0.6)
  ctx.strokeStyle = shade(bark, -0.2)
  ctx.lineCap = 'round'
  // Branches from the top of the trunk, the forward ones reaching out further as it wakes.
  branch(ctx, 120, 120, 62, -0.7 - reach * 0.2, 16, 3, -reach * 0.3, 1.3)
  branch(ctx, 130, 112, 70, -0.1 + reach * 0.3, 18, 3, reach * 0.8, 2.9)
  branch(ctx, 140, 122, 66, 0.6 + reach * 0.5, 15, 3, reach * 1.1, 5.1)
  branch(ctx, 116, 160, 46, -1.2, 10, 2, -reach * 0.2, 7.7)
  branch(ctx, 146, 170, 52, 1.1 + reach * 0.4, 11, 2, reach, 9.4)
  // Trunk, twisted, wider at the roots.
  const g = ctx.createLinearGradient(80, 0, 190, 0)
  g.addColorStop(0, shade(bark, -0.35))
  g.addColorStop(0.45, shade(bark, 0.1))
  g.addColorStop(1, shade(bark, -0.45))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(52, 318)
  ctx.quadraticCurveTo(92, 300, 98, 250)
  ctx.bezierCurveTo(104, 200, 88, 160, 112, 112)
  ctx.lineTo(150, 108)
  ctx.bezierCurveTo(160, 160, 150, 210, 166, 256)
  ctx.quadraticCurveTo(176, 298, 220, 318)
  ctx.closePath()
  ctx.fill()
  // Bark lines.
  ctx.strokeStyle = rgba('#000000', 0.35)
  ctx.lineWidth = 2.5
  for (let j = 0; j < 9; j++) {
    const x = 104 + noise(j) * 50
    ctx.beginPath()
    ctx.moveTo(x, 130 + noise(j + 9) * 40)
    ctx.bezierCurveTo(x - 6, 180, x + 8, 230, x - 2 + (noise(j + 3) - 0.5) * 20, 280 + noise(j + 5) * 30)
    ctx.stroke()
  }
  // Roots.
  ctx.strokeStyle = shade(bark, -0.3)
  ctx.lineWidth = 12
  for (const [x1, x2] of [[96, 30], [118, 80], [150, 196], [166, 250]] as const) {
    ctx.beginPath()
    ctx.moveTo(x1, 296)
    ctx.quadraticCurveTo((x1 + x2) / 2, 302, x2, 318)
    ctx.stroke()
  }
  // The face in the bark: knots for eyes that open and glow, a hollow for a mouth that opens to groan.
  const ex = 0.2 + Math.min(1, k * 2.2)
  const eyeOpen = Math.max(0, Math.min(1, (k - 0.08) / 0.35))
  for (const [x, y, rot] of [[110, 186, 0.3], [150, 182, -0.3]] as const) {
    ctx.fillStyle = shade(bark, -0.55)
    ellipse(ctx, x, y, 15, 9 * ex, rot)
    ctx.fill()
    if (eyeOpen > 0) {
      ctx.fillStyle = rgba(color2, 0.95)
      ellipse(ctx, x, y, 10, 6 * eyeOpen, rot)
      ctx.fill()
      glow(ctx, x, y, 22, color2, 0.6 * eyeOpen)
    }
    // A heavy brow over each.
    ctx.strokeStyle = shade(bark, -0.5)
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(x - 16, y - 12 - rot * 10 - eyeOpen * 4)
    ctx.quadraticCurveTo(x, y - 18 - eyeOpen * 4, x + 16, y - 12 + rot * 10 - eyeOpen * 4)
    ctx.stroke()
  }
  const mouth = Math.max(0, (k - 0.3) / 0.7)
  ctx.fillStyle = '#0c0a09'
  ellipse(ctx, 130, 232, 16 + mouth * 6, 6 + mouth * 22, 0)
  ctx.fill()
  if (mouth > 0.1) {
    glow(ctx, 130, 236, 16 + mouth * 10, color2, 0.25 * mouth)
  }
}

// -- a bowl of candy with a hand in it -----------------------------------------------------------

function wrappedCandy(ctx: Ctx, x: number, y: number, r: number, a: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(a)
  ctx.fillStyle = shade(color, -0.15)
  ctx.beginPath()
  ctx.moveTo(-r * 0.9, 0)
  ctx.lineTo(-r * 1.6, -r * 0.55)
  ctx.lineTo(-r * 1.6, r * 0.55)
  ctx.closePath()
  ctx.moveTo(r * 0.9, 0)
  ctx.lineTo(r * 1.6, -r * 0.55)
  ctx.lineTo(r * 1.6, r * 0.55)
  ctx.closePath()
  ctx.fill()
  const g = ctx.createLinearGradient(0, -r * 0.6, 0, r * 0.6)
  g.addColorStop(0, shade(color, 0.35))
  g.addColorStop(1, shade(color, -0.2))
  ctx.fillStyle = g
  ellipse(ctx, 0, 0, r, r * 0.62)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ellipse(ctx, -r * 0.3, -r * 0.25, r * 0.35, r * 0.14)
  ctx.fill()
  ctx.restore()
}

const CANDY = ['#ef4444', '#a855f7', '#f59e0b', '#22c55e', '#3b82f6', '#f8fafc', '#ec4899', '#facc15']

function candyBowl(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  // How far the hand has come up out of the candy: not at all at 0, grabbing out at the end.
  const k = f / (frames - 1)
  const skin = color2
  // The stand and the bowl, a black witch's cauldron of a bowl.
  ctx.fillStyle = '#1f2937'
  ctx.fillRect(100, 168, 20, 40)
  ctx.beginPath()
  ctx.ellipse(110, 212, 46, 8, 0, 0, TAU)
  ctx.fill()
  // The hand, behind the front of the bowl.
  if (k > 0.02) {
    const up = Math.min(1, k * 1.25)
    const lean = Math.max(0, (k - 0.6) / 0.4)
    ctx.save()
    ctx.translate(112, 120)
    ctx.rotate(0.15 + lean * 0.55)
    const armLen = 20 + up * 70
    // Sleeve, tattered.
    const sl = ctx.createLinearGradient(-14, 0, 14, 0)
    sl.addColorStop(0, shade(color, -0.4))
    sl.addColorStop(1, shade(color, 0.05))
    ctx.fillStyle = sl
    ctx.beginPath()
    ctx.moveTo(-16, 20)
    ctx.lineTo(-13, -armLen + 34)
    ctx.lineTo(-6, -armLen + 28)
    ctx.lineTo(0, -armLen + 36)
    ctx.lineTo(7, -armLen + 27)
    ctx.lineTo(14, -armLen + 34)
    ctx.lineTo(16, 20)
    ctx.closePath()
    ctx.fill()
    // Wrist and hand.
    ctx.fillStyle = skin
    ctx.fillRect(-9, -armLen + 10, 18, 26)
    const hy = -armLen
    ellipse(ctx, 0, hy + 4, 15, 17)
    ctx.fill()
    // Long knobbly fingers: spread wide, then curling in to grab.
    const curl = Math.max(0, (k - 0.75) / 0.25)
    ctx.strokeStyle = skin
    ctx.lineCap = 'round'
    const nails = shade('#1c1917', 0.1)
    for (let j = 0; j < 5; j++) {
      const thumb = j === 0
      const a = thumb ? -1.25 + curl * 0.5 : -0.5 + j * 0.28
      const len = thumb ? 20 : 30 + (j === 2 ? 6 : 0) - (j === 4 ? 6 : 0)
      const bx = Math.sin(a) * 12
      const by = hy - Math.cos(a) * 12
      const mx = bx + Math.sin(a) * len * 0.55
      const my = by - Math.cos(a) * len * 0.55
      const a2 = a + (thumb ? 0.6 : 0.9) * curl + 0.15
      const tx = mx + Math.sin(a2) * len * 0.5
      const ty = my - Math.cos(a2) * len * 0.5
      ctx.lineWidth = thumb ? 7 : 6
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.lineTo(mx, my)
      ctx.lineTo(tx, ty)
      ctx.stroke()
      ctx.fillStyle = shade(skin, -0.2)
      circle(ctx, mx, my, 3.6)
      ctx.fill()
      ctx.fillStyle = nails
      ellipse(ctx, tx + Math.sin(a2) * 3, ty - Math.cos(a2) * 3, 3, 4.5, a2)
      ctx.fill()
    }
    ctx.restore()
  }
  // The bowl: round, black, a rim catching the light, candy heaped in it.
  const g = ctx.createRadialGradient(92, 132, 6, 110, 140, 70)
  g.addColorStop(0, '#4b5563')
  g.addColorStop(0.5, '#1f2937')
  g.addColorStop(1, '#030712')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(44, 120)
  ctx.bezierCurveTo(46, 176, 174, 176, 176, 120)
  ctx.closePath()
  ctx.fill()
  for (let j = 0; j < 14; j++) {
    const x = 56 + noise(j * 3.1) * 108
    const y = 112 + noise(j * 1.7) * 14 - Math.sin(((x - 56) / 108) * Math.PI) * 14
    // The candy jostles as the hand pushes up through it.
    const jig = k > 0.02 && k < 0.6 ? (noise(j + f * 13) - 0.5) * 6 : 0
    wrappedCandy(ctx, x + jig, y - jig * 0.5, 9 + noise(j * 2.9) * 3, (noise(j * 5.1) - 0.5) * 1.6, CANDY[j % CANDY.length])
  }
  ctx.strokeStyle = '#6b7280'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.ellipse(110, 120, 66, 9, 0, 0, Math.PI)
  ctx.stroke()
  // A spooky label.
  ctx.fillStyle = '#f97316'
  ctx.font = 'bold 15px Georgia, serif'
  ctx.textAlign = 'center'
  ctx.fillText('TAKE ONE', 110, 154)
}

// -- a skeleton band ----------------------------------------------------------------------------

function skull(ctx: Ctx, x: number, y: number, r: number, bone: string, eyes: string, jaw = 0, tilt = 0) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  ctx.fillStyle = bone
  circle(ctx, 0, 0, r)
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(-r * 0.55, r * 0.4, r * 1.1, r * 0.55, r * 0.2)
  ctx.fill()
  // Jaw, dropping open.
  ctx.beginPath()
  ctx.roundRect(-r * 0.5, r * 0.88 + jaw * r * 0.35, r * 1.0, r * 0.32, r * 0.15)
  ctx.fill()
  ctx.fillStyle = '#111'
  ellipse(ctx, -r * 0.36, -r * 0.02, r * 0.27, r * 0.33)
  ctx.fill()
  ellipse(ctx, r * 0.36, -r * 0.02, r * 0.27, r * 0.33)
  ctx.fill()
  glow(ctx, -r * 0.36, 0, r * 0.3, eyes, 0.9)
  glow(ctx, r * 0.36, 0, r * 0.3, eyes, 0.9)
  ctx.fillStyle = '#111'
  ctx.beginPath()
  ctx.moveTo(0, r * 0.3)
  ctx.lineTo(-r * 0.12, r * 0.52)
  ctx.lineTo(r * 0.12, r * 0.52)
  ctx.fill()
  ctx.strokeStyle = shade(bone, -0.4)
  ctx.lineWidth = r * 0.06
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath()
    ctx.moveTo(k * r * 0.18, r * 0.72)
    ctx.lineTo(k * r * 0.18, r * 0.94)
    ctx.stroke()
  }
  ctx.restore()
}

/** Ribs, spine and pelvis of a skeleton standing at x, its hips at y. */
function skeletonTorso(ctx: Ctx, x: number, y: number, bone: string) {
  ctx.fillStyle = bone
  ellipse(ctx, x, y - 4, 22, 12)
  ctx.fill()
  ctx.fillStyle = shade(bone, -0.4)
  circle(ctx, x - 8, y - 4, 4.5)
  ctx.fill()
  circle(ctx, x + 8, y - 4, 4.5)
  ctx.fill()
  ctx.fillStyle = bone
  for (let k = 0; k < 3; k++) {
    ellipse(ctx, x, y - 20 - k * 8, 5.5, 4)
    ctx.fill()
  }
  ctx.strokeStyle = bone
  ctx.lineWidth = 5.5
  ctx.lineCap = 'round'
  for (let k = 0; k < 4; k++) {
    const yy = y - 92 + k * 12
    const w = 26 - k * 2.5
    ctx.beginPath()
    ctx.moveTo(x - w, yy + 6)
    ctx.quadraticCurveTo(x, yy - 7, x + w, yy + 6)
    ctx.stroke()
  }
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(x, y - 100)
  ctx.lineTo(x, y - 44)
  ctx.stroke()
}

function skeletonMusician(which: 0 | 1 | 2) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const s = Math.sin(p)
    const bone = color
    const x = 96
    const hip = 168
    const bob = -Math.abs(Math.sin(p)) * 4
    ctx.save()
    ctx.translate(0, bob)
    if (which === 1) {
      // The drummer sits behind a bass drum and a snare, sticks flying.
      for (const k of [-1, 1]) limb(ctx, x + k * 9, hip, 34, 34, k * 0.9, -k * 0.9, 8, bone)
      skeletonTorso(ctx, x, hip, bone)
      skull(ctx, x + 2, 50, 26, bone, color2, Math.max(0, s) * 0.5, s * 0.08)
      const stick = (sx: number, hit: number, a1: number) => {
        const [hx, hy] = limb(ctx, sx, 80, 30, 28, a1 - hit * 0.3, 0.9 + hit * 0.5, 7, bone)
        ctx.strokeStyle = '#d6d3d1'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(hx, hy)
        ctx.lineTo(hx + 30, hy + 12 - hit * 26)
        ctx.stroke()
      }
      stick(x - 24, Math.max(0, s), 0.9)
      stick(x + 24, Math.max(0, -s), 0.4)
      // Snare and cymbal.
      ctx.fillStyle = '#e5e7eb'
      ctx.fillRect(126, 118, 54, 20)
      ctx.fillStyle = '#b91c1c'
      ctx.fillRect(126, 124, 54, 8)
      ctx.fillStyle = '#facc15'
      ellipse(ctx, 160, 74 + Math.max(0, -s) * 4, 30, 5, 0.2 * Math.max(0, -s))
      ctx.fill()
      ctx.fillStyle = '#525252'
      ctx.fillRect(158, 74, 3, 60)
      // The bass drum in front, a skull painted on it.
      const g = ctx.createRadialGradient(92, 196, 6, 96, 200, 52)
      g.addColorStop(0, '#f5f5f4')
      g.addColorStop(1, '#a8a29e')
      ctx.fillStyle = '#7f1d1d'
      circle(ctx, 96, 200, 50)
      ctx.fill()
      ctx.fillStyle = g
      circle(ctx, 96, 200, 43)
      ctx.fill()
      skull(ctx, 96, 194, 18, '#1c1917', color2)
    } else {
      // Standing, one foot tapping.
      limb(ctx, x - 10, hip, 38, 40, -0.1, 0.05, 8, bone)
      const tap = Math.max(0, s) * 0.35
      const [fx, fy] = limb(ctx, x + 10, hip, 38, 40, 0.15 + tap * 0.4, -tap, 8, bone)
      ctx.fillStyle = bone
      ellipse(ctx, x - 4, 248 - 2, 12, 5)
      ctx.fill()
      ellipse(ctx, fx + 8, fy + 2, 12, 5, -tap)
      ctx.fill()
      skeletonTorso(ctx, x, hip, bone)
      if (which === 0) {
        // Guitar across the body, strumming hand going up and down.
        skull(ctx, x + 4, 48, 26, bone, color2, 0.25 + 0.25 * Math.max(0, s), 0.15 + s * 0.05)
        ctx.save()
        ctx.translate(x, 128)
        ctx.rotate(-0.5)
        ctx.fillStyle = '#ea580c'
        ellipse(ctx, -10, 0, 30, 24)
        ctx.fill()
        ellipse(ctx, 18, 0, 22, 18)
        ctx.fill()
        ctx.fillStyle = '#1c1917'
        circle(ctx, 4, 0, 8)
        ctx.fill()
        ctx.fillStyle = '#78350f'
        ctx.fillRect(36, -5, 74, 10)
        ctx.fillRect(106, -8, 18, 16)
        ctx.strokeStyle = '#e7e5e4'
        ctx.lineWidth = 1
        for (let k = -3; k <= 3; k += 2) {
          ctx.beginPath()
          ctx.moveTo(-20, k)
          ctx.lineTo(120, k)
          ctx.stroke()
        }
        ctx.restore()
        limb(ctx, x - 22, 82, 28, 32, 0.3 + 0.2 * s, -1.2, 7, bone)
        limb(ctx, x + 22, 82, 30, 30, -2.2, -0.5, 7, bone)
      } else {
        // Trumpet up at the mouth, swinging up on the high notes.
        const lift = 0.5 + 0.5 * s
        skull(ctx, x + 2, 50, 26, bone, color2, 0.1, -0.15 - lift * 0.15)
        ctx.save()
        ctx.translate(x + 22, 68)
        ctx.rotate(-0.2 - lift * 0.25)
        ctx.fillStyle = '#facc15'
        ctx.fillRect(0, -4, 64, 8)
        ctx.beginPath()
        ctx.moveTo(60, -4)
        ctx.lineTo(88, -18)
        ctx.lineTo(88, 18)
        ctx.lineTo(60, 4)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#ca8a04'
        ctx.fillRect(22, -12, 6, 8)
        ctx.fillRect(32, -12, 6, 8)
        ctx.fillRect(42, -12, 6, 8)
        ctx.fillStyle = '#fef08a'
        ellipse(ctx, 88, 0, 4, 18)
        ctx.fill()
        ctx.restore()
        limb(ctx, x - 22, 82, 30, 30, -2.2 + lift * 0.2, -1.1, 7, bone)
        limb(ctx, x + 22, 82, 28, 26, -1.9 + lift * 0.2, -0.6, 7, bone)
      }
    }
    ctx.restore()
  }
}

/** A musical note floating up. */
export function note(ctx: Ctx, f: number, _n: number, { color2 }: SpriteColors) {
  ctx.fillStyle = color2
  ctx.strokeStyle = color2
  ctx.lineWidth = 5
  if (f % 2) {
    // Two notes joined.
    ellipse(ctx, 18, 50, 9, 7, -0.4)
    ctx.fill()
    ellipse(ctx, 46, 44, 9, 7, -0.4)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(26, 48)
    ctx.lineTo(26, 12)
    ctx.lineTo(54, 6)
    ctx.lineTo(54, 42)
    ctx.stroke()
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(26, 14)
    ctx.lineTo(54, 8)
    ctx.stroke()
  } else {
    ellipse(ctx, 26, 48, 11, 8, -0.4)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(35, 46)
    ctx.lineTo(35, 8)
    ctx.quadraticCurveTo(44, 20, 52, 24)
    ctx.stroke()
  }
}

// -- a mad scientist's Tesla coil ------------------------------------------------------------------

function jagged(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, steps: number, amp: number, seed: number) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  for (let k = 1; k < steps; k++) {
    const q = k / steps
    const nx = -(y2 - y1)
    const ny = x2 - x1
    const len = Math.hypot(nx, ny) || 1
    const off = (noise(seed + k * 1.31) - 0.5) * amp
    ctx.lineTo(x1 + (x2 - x1) * q + (nx / len) * off, y1 + (y2 - y1) * q + (ny / len) * off)
  }
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

function teslaCoil(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  // Base: a wooden box with dials and a lever.
  ctx.fillStyle = '#57534e'
  ctx.fillRect(28, 252, 104, 44)
  ctx.fillStyle = '#78716c'
  ctx.fillRect(28, 252, 104, 8)
  for (const [x, a] of [[52, f * 0.7], [80, -f * 0.4]] as const) {
    ctx.fillStyle = '#e7e5e4'
    circle(ctx, x, 278, 9)
    ctx.fill()
    ctx.strokeStyle = '#b91c1c'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, 278)
    ctx.lineTo(x + Math.cos(a) * 7, 278 + Math.sin(a) * 7)
    ctx.stroke()
  }
  ctx.fillStyle = f % 2 ? '#22c55e' : '#14532d'
  circle(ctx, 112, 270, 5)
  ctx.fill()
  ctx.fillStyle = f % 3 ? '#7f1d1d' : '#ef4444'
  circle(ctx, 112, 284, 5)
  ctx.fill()
  // The column, wound with copper wire.
  const g = ctx.createLinearGradient(62, 0, 98, 0)
  g.addColorStop(0, '#7c2d12')
  g.addColorStop(0.4, '#f59e0b')
  g.addColorStop(1, '#78350f')
  ctx.fillStyle = g
  ctx.fillRect(62, 90, 36, 162)
  ctx.strokeStyle = 'rgba(69,26,3,0.6)'
  ctx.lineWidth = 1.5
  for (let y = 94; y < 250; y += 4) {
    ctx.beginPath()
    ctx.moveTo(62, y)
    ctx.lineTo(98, y + 2)
    ctx.stroke()
  }
  // The ring on top, polished metal.
  const t = ctx.createLinearGradient(0, 56, 0, 96)
  t.addColorStop(0, shade(color, 0.5))
  t.addColorStop(0.5, color)
  t.addColorStop(1, shade(color, -0.45))
  ctx.fillStyle = t
  ellipse(ctx, 80, 76, 50, 20)
  ctx.fill()
  ctx.fillStyle = shade(color, -0.6)
  ellipse(ctx, 80, 72, 18, 6)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ellipse(ctx, 62, 66, 18, 4, -0.1)
  ctx.fill()
  // Crackling: a few small sparks jumping off the ring, different each frame.
  glow(ctx, 80, 72, 70, color2, 0.25)
  ctx.lineCap = 'round'
  for (let k = 0; k < 4; k++) {
    const a = noise(f * 7.3 + k * 2.1) * TAU
    const r = 22 + noise(f * 3.1 + k) * 50
    const sx = 80 + Math.cos(a) * 44
    const sy = 72 + Math.sin(a) * 16
    const ex = sx + Math.cos(a) * r
    const ey = sy + Math.sin(a) * r * 0.8 - 14
    ctx.strokeStyle = rgba(color2, 0.7)
    ctx.lineWidth = 5
    jagged(ctx, sx, sy, ex, ey, 5, 16, f * 11 + k * 5)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.8
    jagged(ctx, sx, sy, ex, ey, 5, 16, f * 11 + k * 5)
  }
}

/** A bolt of lightning from the top of the cell to the bottom, for the coil to throw at people. */
function arc(ctx: Ctx, f: number, _n: number, { color2 }: SpriteColors) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const [w, c] of [[14, rgba(color2, 0.35)], [7, rgba(color2, 0.85)], [2.5, '#ffffff']] as const) {
    ctx.strokeStyle = c
    ctx.lineWidth = w
    jagged(ctx, 50, 4, 50, 396, 14, 46, f * 17.7)
    // A fork or two off the main bolt.
    for (let k = 0; k < 2; k++) {
      const y = 100 + noise(f * 5 + k) * 220
      jagged(ctx, 50 + (noise(f + k * 3) - 0.5) * 20, y, 50 + (noise(f * 2 + k) - 0.5) * 90, y + 50, 4, 18, f * 3 + k)
    }
  }
  glow(ctx, 50, 396, 40, color2, 0.8)
}

// -- hands on the window, and figures in it --------------------------------------------------------

function hand(ctx: Ctx, x: number, y: number, s: number, a: number, skin: string, left: boolean) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(a)
  if (left) ctx.scale(-1, 1)
  // Pressed flat on the glass: the palm paler where it presses.
  const g = ctx.createRadialGradient(0, 8 * s, 2, 0, 8 * s, 30 * s)
  g.addColorStop(0, shade(skin, 0.35))
  g.addColorStop(1, skin)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(-20 * s, -10 * s, 40 * s, 44 * s, 14 * s)
  ctx.fill()
  ctx.lineCap = 'round'
  ctx.strokeStyle = skin
  const fingers: Array<[number, number, number, number]> = [
    [-15, -8, -0.22, 34], [-5, -12, -0.06, 42], [6, -12, 0.06, 44], [16, -8, 0.2, 36],
  ]
  for (const [fx, fy, fa, len] of fingers) {
    ctx.lineWidth = 10 * s
    ctx.beginPath()
    ctx.moveTo(fx * s, fy * s)
    ctx.lineTo((fx + Math.sin(fa) * len) * s, (fy - Math.cos(fa) * len) * s)
    ctx.stroke()
    ctx.fillStyle = shade(skin, 0.4)
    ellipse(ctx, (fx + Math.sin(fa) * (len - 3)) * s, (fy - Math.cos(fa) * (len - 3)) * s, 3.4 * s, 4.5 * s, fa)
    ctx.fill()
  }
  // Thumb.
  ctx.lineWidth = 11 * s
  ctx.beginPath()
  ctx.moveTo(-18 * s, 18 * s)
  ctx.lineTo(-38 * s, 2 * s)
  ctx.stroke()
  ctx.restore()
}

function windowHands(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  // Fogged glass round them.
  const g = ctx.createRadialGradient(110, 110, 10, 110, 110, 110)
  g.addColorStop(0, rgba(color2, 0.35))
  g.addColorStop(1, rgba(color2, 0))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 220, 200)
  const dx = [-30, 0, 30, 0][f]
  const drag = f === 3
  if (drag) {
    // Sliding down the glass, leaving streaks in the mist.
    ctx.strokeStyle = rgba(color, 0.45)
    ctx.lineCap = 'round'
    for (const cx of [62, 158]) {
      for (let k = -2; k <= 2; k++) {
        ctx.lineWidth = 7
        ctx.beginPath()
        ctx.moveTo(cx + k * 9, 46)
        ctx.lineTo(cx + k * 9 + (noise(cx + k) - 0.5) * 6, 110)
        ctx.stroke()
      }
    }
  }
  const y = drag ? 128 : 84
  hand(ctx, 62 + dx, y, 1.15, -0.18, color, true)
  hand(ctx, 158 + dx, y, 1.15, 0.18, color, false)
}

function windowFigure(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  // Lit from behind by the candle: warm light on the curtain, the figure black against it.
  const g = ctx.createRadialGradient(150, 140, 10, 110, 130, 140)
  g.addColorStop(0, rgba(color2, 0.95))
  g.addColorStop(0.5, rgba(color2, 0.55))
  g.addColorStop(1, rgba(color2, 0.08))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 200, 220)
  // Curtain folds.
  ctx.strokeStyle = rgba('#7c2d12', 0.25)
  ctx.lineWidth = 6
  for (let x = 12; x < 200; x += 22) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.quadraticCurveTo(x + 6, 110, x, 220)
    ctx.stroke()
  }
  const look = [-1, 0, 1, 0][f]
  ctx.fillStyle = color
  // Shoulders and a high-collared dress.
  ctx.beginPath()
  ctx.moveTo(30, 220)
  ctx.quadraticCurveTo(36, 150, 80, 140)
  ctx.lineTo(120, 140)
  ctx.quadraticCurveTo(164, 150, 170, 220)
  ctx.closePath()
  ctx.fill()
  ctx.fillRect(88, 116, 24, 30)
  // Head, turned, with her hair up in a bun.
  const hx = 100 + look * 4
  ellipse(ctx, hx, 94, 26, 31)
  ctx.fill()
  circle(ctx, hx - look * 20, 60, 15)
  ctx.fill()
  if (look) {
    // In profile: nose and chin.
    ctx.beginPath()
    ctx.moveTo(hx + look * 22, 84)
    ctx.lineTo(hx + look * 34, 98)
    ctx.lineTo(hx + look * 24, 104)
    ctx.quadraticCurveTo(hx + look * 26, 118, hx + look * 14, 122)
    ctx.lineTo(hx, 120)
    ctx.closePath()
    ctx.fill()
  }
  // Eyes that glow, shut when she blinks.
  const blink = f === 3
  for (const k of look ? [1] : [-1, 1]) {
    const ex = hx + (look ? look * 14 : k * 10)
    if (blink) {
      ctx.strokeStyle = rgba('#fef08a', 0.8)
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(ex - 5, 92)
      ctx.lineTo(ex + 5, 92)
      ctx.stroke()
    } else {
      glow(ctx, ex, 91, 9, '#fef08a', 0.95)
      ctx.fillStyle = '#ffffff'
      circle(ctx, ex, 91, 2.2)
      ctx.fill()
    }
  }
}

// -- a rocking chair with nobody in it ---------------------------------------------------------------

function rockingChair(ghosted: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const a = Math.sin((f / frames) * TAU) * 0.2
    const wood = color
    ctx.save()
    // Rock about the point of the rockers touching the ground.
    ctx.translate(100, 226)
    ctx.rotate(a)
    ctx.translate(-100, -226)
    ctx.lineCap = 'round'
    ctx.strokeStyle = shade(wood, -0.25)
    ctx.lineWidth = 9
    // Rockers.
    ctx.beginPath()
    ctx.moveTo(26, 210)
    ctx.quadraticCurveTo(100, 244, 178, 206)
    ctx.stroke()
    // Back legs and the tall back.
    ctx.strokeStyle = wood
    ctx.lineWidth = 9
    for (const [x1, y1, x2, y2] of [[56, 220, 62, 160], [140, 222, 132, 160], [62, 162, 42, 30], [132, 162, 112, 30]] as const) {
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
    ctx.lineWidth = 7
    for (let k = 0; k < 5; k++) {
      ctx.beginPath()
      ctx.moveTo(56 - k * 3.2, 140 - k * 24)
      ctx.lineTo(127 - k * 3.2, 140 - k * 24)
      ctx.stroke()
    }
    ctx.lineWidth = 6
    for (let k = 0; k < 4; k++) {
      ctx.beginPath()
      ctx.moveTo(62 + k * 16, 140)
      ctx.lineTo(50 + k * 16, 40)
      ctx.stroke()
    }
    // Seat with a faded cushion and a knitted shawl over the back.
    ctx.fillStyle = shade(wood, 0.1)
    ctx.beginPath()
    ctx.moveTo(54, 156)
    ctx.lineTo(162, 150)
    ctx.lineTo(170, 166)
    ctx.lineTo(60, 172)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#7f1d1d'
    ctx.beginPath()
    ctx.roundRect(62, 142, 96, 14, 6)
    ctx.fill()
    ctx.fillStyle = shade(color2, -0.35)
    ctx.beginPath()
    ctx.moveTo(40, 34)
    ctx.lineTo(116, 34)
    ctx.lineTo(108, 80)
    for (let k = 0; k < 6; k++) ctx.lineTo(102 - k * 11, 80 + (k % 2) * 9)
    ctx.closePath()
    ctx.fill()
    // Arms.
    ctx.strokeStyle = wood
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.moveTo(62, 116)
    ctx.lineTo(160, 112)
    ctx.moveTo(156, 112)
    ctx.lineTo(160, 158)
    ctx.stroke()
    if (ghosted) {
      // A grey old lady, see-through, rocking and knitting.
      const k = Math.sin((f / frames) * TAU * 2)
      ctx.globalAlpha = 0.62
      const g = ctx.createLinearGradient(0, 30, 0, 200)
      g.addColorStop(0, '#ffffff')
      g.addColorStop(1, rgba(color2, 0.4))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(70, 150)
      ctx.quadraticCurveTo(64, 96, 90, 80)
      ctx.lineTo(116, 80)
      ctx.quadraticCurveTo(140, 100, 150, 150)
      ctx.lineTo(176, 200)
      ctx.lineTo(132, 204)
      ctx.lineTo(122, 162)
      ctx.closePath()
      ctx.fill()
      circle(ctx, 104, 60, 20)
      ctx.fill()
      circle(ctx, 98, 38, 11)
      ctx.fill()
      ctx.globalAlpha = 0.9
      ctx.fillStyle = '#1e293b'
      circle(ctx, 110, 58, 2.5)
      ctx.fill()
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 1.5
      ctx.strokeRect(104, 54, 12, 7)
      // Needles clicking.
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(122, 118 + k * 3)
      ctx.lineTo(152, 100 - k * 3)
      ctx.moveTo(126, 104 - k * 3)
      ctx.lineTo(150, 122 + k * 3)
      ctx.stroke()
      ctx.fillStyle = '#ef4444'
      circle(ctx, 140, 126, 9)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }
}

// -- a swamp monster rising out of the muck -------------------------------------------------------

function swampMonster(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const skin = color
  // Arms raised, clawing, swaying.
  for (const k of [-1, 1]) {
    const [hx, hy] = limb(ctx, 110 + k * 40, 120, 34, 30, k * (2.0 + 0.15 * s * k), k * 0.6, 18, shade(skin, -0.1))
    ctx.fillStyle = shade(skin, -0.1)
    circle(ctx, hx, hy, 12)
    ctx.fill()
    ctx.strokeStyle = shade(skin, -0.1)
    ctx.lineWidth = 5
    for (let j = -1; j <= 1; j++) {
      ctx.beginPath()
      ctx.moveTo(hx, hy)
      ctx.lineTo(hx + k * 6 + j * 8, hy - 18)
      ctx.stroke()
    }
  }
  // Scaly body.
  const g = ctx.createLinearGradient(60, 0, 160, 0)
  g.addColorStop(0, shade(skin, -0.35))
  g.addColorStop(0.5, shade(skin, 0.1))
  g.addColorStop(1, shade(skin, -0.4))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(56, 240)
  ctx.quadraticCurveTo(50, 130, 76, 104)
  ctx.quadraticCurveTo(110, 84, 144, 104)
  ctx.quadraticCurveTo(170, 130, 164, 240)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = shade(skin, 0.3)
  ellipse(ctx, 110, 170, 30, 52)
  ctx.fill()
  ctx.strokeStyle = rgba('#000000', 0.25)
  ctx.lineWidth = 2
  for (let y = 132; y < 220; y += 12) {
    ctx.beginPath()
    ctx.moveTo(86, y)
    ctx.quadraticCurveTo(110, y + 6, 134, y)
    ctx.stroke()
  }
  // Head: fins on top, gills, big round eyes.
  ctx.fillStyle = shade(skin, -0.05)
  ellipse(ctx, 110, 74, 40, 36)
  ctx.fill()
  ctx.fillStyle = shade(skin, -0.25)
  for (const [x, a] of [[110, 0], [86, -0.5], [134, 0.5]] as const) {
    ctx.save()
    ctx.translate(x, 46)
    ctx.rotate(a)
    ctx.beginPath()
    ctx.moveTo(-8, 4)
    ctx.quadraticCurveTo(0, -30 - s * 3, 8, 4)
    ctx.fill()
    ctx.restore()
  }
  for (const k of [-1, 1]) {
    ctx.strokeStyle = shade(skin, -0.4)
    ctx.lineWidth = 3
    for (let j = 0; j < 3; j++) {
      ctx.beginPath()
      ctx.moveTo(110 + k * (32 - j * 2), 78 + j * 7)
      ctx.lineTo(110 + k * (42 - j * 2), 84 + j * 7)
      ctx.stroke()
    }
    ctx.fillStyle = '#fefce8'
    circle(ctx, 110 + k * 16, 66, 12)
    ctx.fill()
    ctx.fillStyle = color2
    circle(ctx, 110 + k * 16 + s * 2, 67, 7)
    ctx.fill()
    ctx.fillStyle = '#000'
    ellipse(ctx, 110 + k * 16 + s * 2, 67, 2.5, 6)
    ctx.fill()
  }
  ctx.fillStyle = '#1a2e05'
  ellipse(ctx, 110, 94, 18, 6 + Math.max(0, s) * 4)
  ctx.fill()
  // Weed draped over it and muck dripping off.
  ctx.strokeStyle = '#365314'
  ctx.lineWidth = 5
  for (const [x, y] of [[80, 50], [128, 44], [62, 130], [150, 126]] as const) {
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.bezierCurveTo(x - 6, y + 20, x + 8, y + 34, x + (noise(x) - 0.5) * 10, y + 52)
    ctx.stroke()
  }
  ctx.fillStyle = rgba('#4d7c0f', 0.85)
  for (let k = 0; k < 5; k++) {
    const x = 70 + noise(k * 3.3) * 80
    const y = 120 + ((noise(k * 1.9) * 100 + f * 14) % 110)
    ellipse(ctx, x, y, 3, 5)
    ctx.fill()
  }
}

/** Dark, bubbling water for the swamp monster to come up out of. */
function muck(ctx: Ctx, f: number, _n: number, { color }: SpriteColors) {
  const g = ctx.createRadialGradient(130, 50, 10, 130, 50, 130)
  g.addColorStop(0, shade(color, -0.55))
  g.addColorStop(0.7, shade(color, -0.7))
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ellipse(ctx, 130, 54, 128, 42)
  ctx.fill()
  ctx.strokeStyle = rgba('#a3e635', 0.35)
  ctx.lineWidth = 2
  for (let k = 0; k < 3; k++) {
    ctx.beginPath()
    ctx.ellipse(130, 52, 60 + k * 22, 14 + k * 6, 0, 0, TAU)
    ctx.stroke()
  }
  for (let k = 0; k < 5; k++) {
    ctx.fillStyle = rgba('#bef264', 0.5)
    circle(ctx, 50 + noise(k * 2.1 + f) * 160, 40 + noise(k * 3.7) * 24, 3 + noise(k + f) * 4)
    ctx.fill()
  }
  // Reeds at the edge.
  ctx.strokeStyle = '#3f6212'
  ctx.lineWidth = 3
  for (const x of [14, 24, 230, 242]) {
    ctx.beginPath()
    ctx.moveTo(x, 70)
    ctx.quadraticCurveTo(x + 4, 40, x - 2, 12)
    ctx.stroke()
  }
}

// -- gargoyles -----------------------------------------------------------------------------------

function gargoyleBody(ctx: Ctx, stone: string, spread: number, flap: number) {
  const dark = shade(stone, -0.35)
  // Wings: folded behind, or spread wide.
  for (const k of [-1, 1]) {
    ctx.fillStyle = k < 0 ? dark : shade(stone, -0.2)
    ctx.beginPath()
    const bx = 100 + k * 18
    ctx.moveTo(bx, 96)
    const tx = 100 + k * (40 + 70 * spread)
    const ty = 70 - 60 * spread + flap * 30
    ctx.lineTo(tx, ty)
    for (let j = 0; j < 4; j++) {
      const q = (j + 1) / 4
      ctx.quadraticCurveTo(tx + (bx - tx) * (q - 0.12) + k * 4, ty + 50 * q + 20 * spread, tx + (bx - tx) * q, ty + 62 * q + 30 * spread * (1 - q))
    }
    ctx.closePath()
    ctx.fill()
  }
}

function gargoyle(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  // Looking left, ahead, right, then wings out and roaring.
  const look = [-1, 0, 1, 0][f]
  const roar = f === 3
  const stone = color
  gargoyleBody(ctx, stone, roar ? 1 : 0, 0)
  const g = ctx.createLinearGradient(0, 60, 0, 212)
  g.addColorStop(0, shade(stone, 0.2))
  g.addColorStop(1, shade(stone, -0.4))
  ctx.fillStyle = g
  // Crouched body, knees up, claws over the edge.
  ellipse(ctx, 100, 140, 40, 46)
  ctx.fill()
  for (const k of [-1, 1]) {
    ellipse(ctx, 100 + k * 30, 176, 18, 26, k * 0.3)
    ctx.fill()
    ctx.fillStyle = shade(stone, -0.3)
    for (let j = -1; j <= 1; j++) {
      ctx.beginPath()
      ctx.moveTo(100 + k * 30 + j * 8 - 3, 198)
      ctx.lineTo(100 + k * 30 + j * 8, 212)
      ctx.lineTo(100 + k * 30 + j * 8 + 3, 198)
      ctx.fill()
    }
    ctx.fillStyle = g
  }
  // Head: horns, pointed ears, heavy brow, a snout turned the way it looks.
  const hx = 100 + look * 10
  ctx.fillStyle = shade(stone, 0.05)
  ellipse(ctx, hx, 76, 30, 28)
  ctx.fill()
  for (const k of [-1, 1]) {
    ctx.fillStyle = shade(stone, -0.15)
    ctx.beginPath()
    ctx.moveTo(hx + k * 16, 56)
    ctx.quadraticCurveTo(hx + k * 30, 30, hx + k * 22, 18)
    ctx.quadraticCurveTo(hx + k * 20, 40, hx + k * 6, 54)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(hx + k * 26, 70)
    ctx.lineTo(hx + k * 46, 58)
    ctx.lineTo(hx + k * 28, 84)
    ctx.fill()
  }
  ctx.fillStyle = shade(stone, 0.12)
  ellipse(ctx, hx + look * 14, 90, 18, 12)
  ctx.fill()
  ctx.fillStyle = '#1c1917'
  if (roar) {
    ellipse(ctx, hx, 96, 14, 12)
    ctx.fill()
    ctx.fillStyle = '#e7e5e4'
    for (const k of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(hx + k * 9, 86)
      ctx.lineTo(hx + k * 6, 96)
      ctx.lineTo(hx + k * 3, 86)
      ctx.fill()
    }
  } else {
    ctx.fillRect(hx + look * 14 - 10, 96, 20, 2)
  }
  // Eyes: dead stone, glowing as it roars.
  for (const k of [-1, 1]) {
    const ex = hx + k * 12 + look * 8
    ctx.fillStyle = shade(stone, -0.5)
    ellipse(ctx, ex, 72, 7, 5)
    ctx.fill()
    if (roar) glow(ctx, ex, 72, 14, color2, 1)
    else glow(ctx, ex, 72, 6, color2, 0.5)
  }
  ctx.strokeStyle = shade(stone, -0.4)
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(hx - 22, 62)
  ctx.lineTo(hx - 4, 66)
  ctx.moveTo(hx + 22, 62)
  ctx.lineTo(hx + 4, 66)
  ctx.stroke()
  // Cracks and moss.
  ctx.strokeStyle = rgba('#000000', 0.3)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(84, 120)
  ctx.lineTo(92, 134)
  ctx.lineTo(88, 150)
  ctx.stroke()
  ctx.fillStyle = rgba('#4d7c0f', 0.5)
  ellipse(ctx, 76, 160, 8, 4)
  ctx.fill()
}

function gargoyleFlying(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const flap = Math.sin((f / frames) * TAU)
  const stone = color
  // A bat's wings of stone from the shoulders, the far one behind, beating.
  const wing = (k: number, tone: number) => {
    const sx = 150
    const sy = 104
    const tip = { x: sx - 30 + k * 10, y: sy - 90 * flap * k - 10 }
    ctx.fillStyle = shade(stone, tone)
    ctx.beginPath()
    ctx.moveTo(sx + 16, sy)
    ctx.quadraticCurveTo(sx + 10, (sy + tip.y) / 2 - 10, tip.x + 20, tip.y)
    ctx.lineTo(tip.x - 40, tip.y + 10 * flap * k + 6)
    for (let j = 0; j < 4; j++) {
      const q = (j + 1) / 4
      const ex = tip.x - 40 + (sx - 40 - (tip.x - 40)) * q
      const ey = tip.y + (sy + 8 - tip.y) * q
      ctx.quadraticCurveTo(ex + 6, ey - 14 * Math.sign(sy - tip.y || 1), ex, ey)
    }
    ctx.lineTo(sx - 30, sy + 6)
    ctx.closePath()
    ctx.fill()
    // The finger bones of the wing.
    ctx.strokeStyle = shade(stone, tone - 0.2)
    ctx.lineWidth = 3
    for (let j = 0; j < 3; j++) {
      const q = (j + 1) / 4
      ctx.beginPath()
      ctx.moveTo(tip.x + 20, tip.y)
      ctx.lineTo(tip.x - 40 + (sx - 40 - (tip.x - 40)) * q, tip.y + (sy + 8 - tip.y) * q)
      ctx.stroke()
    }
  }
  wing(-1, -0.35)
  // Body stretched out, legs tucked, a pointed tail behind.
  const g = ctx.createLinearGradient(0, 84, 0, 140)
  g.addColorStop(0, shade(stone, 0.25))
  g.addColorStop(1, shade(stone, -0.4))
  ctx.fillStyle = g
  ellipse(ctx, 150, 112, 56, 22, -0.05)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(100, 112)
  ctx.quadraticCurveTo(60, 124 + flap * 6, 26, 108)
  ctx.lineTo(14, 112)
  ctx.lineTo(28, 118)
  ctx.quadraticCurveTo(60, 138, 104, 124)
  ctx.fill()
  ctx.fillStyle = shade(stone, -0.2)
  ellipse(ctx, 128, 132, 16, 9, 0.4)
  ctx.fill()
  // Head: horns, an ear, a snout with fangs, a glowing eye.
  ctx.fillStyle = shade(stone, 0.1)
  ellipse(ctx, 216, 100, 26, 22)
  ctx.fill()
  ellipse(ctx, 238, 108, 18, 12)
  ctx.fill()
  ctx.fillStyle = shade(stone, -0.15)
  ctx.beginPath()
  ctx.moveTo(204, 82)
  ctx.quadraticCurveTo(190, 58, 176, 54)
  ctx.quadraticCurveTo(192, 70, 196, 88)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(200, 92)
  ctx.lineTo(180, 76)
  ctx.lineTo(196, 100)
  ctx.fill()
  ctx.fillStyle = '#e7e5e4'
  for (const x of [240, 248]) {
    ctx.beginPath()
    ctx.moveTo(x - 3, 116)
    ctx.lineTo(x, 124)
    ctx.lineTo(x + 3, 116)
    ctx.fill()
  }
  glow(ctx, 222, 96, 12, color2, 1)
  wing(1, -0.05)
}

// -- a mailbox that bites ----------------------------------------------------------------------

function mailbox(biting: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const open = biting ? 0.15 + 0.85 * Math.abs(Math.sin((f / frames) * Math.PI * 2)) : 0
    // Post.
    ctx.fillStyle = '#57534e'
    ctx.fillRect(84, 130, 20, 110)
    ctx.fillStyle = '#44403c'
    ctx.fillRect(84, 130, 6, 110)
    // The box, side on: rounded top, the door (the jaw) on the right.
    const g = ctx.createLinearGradient(0, 60, 0, 136)
    g.addColorStop(0, shade(color, 0.3))
    g.addColorStop(1, shade(color, -0.35))
    // Inside of the mouth first.
    if (open > 0.02) {
      ctx.fillStyle = '#450a0a'
      ctx.beginPath()
      ctx.moveTo(150, 72)
      ctx.lineTo(150 + 46 * open, 136)
      ctx.lineTo(150, 136)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#ef4444'
      ellipse(ctx, 156 + 10 * open, 124, 14 + 10 * open, 6)
      ctx.fill()
    }
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(30, 136)
    ctx.lineTo(30, 92)
    ctx.arc(62, 92, 32, Math.PI, Math.PI * 1.5)
    ctx.lineTo(150, 60)
    ctx.lineTo(150, 136)
    ctx.closePath()
    ctx.fill()
    // Teeth along the top edge of the mouth.
    ctx.fillStyle = '#fefce8'
    for (let k = 0; k < 4; k++) {
      const y = 70 + k * 16
      ctx.beginPath()
      ctx.moveTo(150, y)
      ctx.lineTo(150 + 10 * open + 4, y + 7)
      ctx.lineTo(150, y + 14)
      ctx.fill()
    }
    // The door hinged at the bottom, swinging down and out with each bite, teeth along it too.
    ctx.save()
    ctx.translate(150, 136)
    ctx.rotate(open * 1.1)
    ctx.fillStyle = shade(color, -0.1)
    ctx.beginPath()
    ctx.roundRect(-4, -78, 10, 78, 3)
    ctx.fill()
    ctx.fillStyle = '#fefce8'
    for (let k = 0; k < 4; k++) {
      ctx.beginPath()
      ctx.moveTo(-4, -70 + k * 17)
      ctx.lineTo(-14, -63 + k * 17)
      ctx.lineTo(-4, -56 + k * 17)
      ctx.fill()
    }
    ctx.fillStyle = '#d6d3d1'
    ctx.fillRect(2, -44, 8, 6)
    ctx.restore()
    // The flag, up and waving when it bites.
    ctx.save()
    ctx.translate(46, 104)
    ctx.rotate(biting ? -1.5 + Math.sin(f * 1.7) * 0.2 : -0.1)
    ctx.fillStyle = color2
    ctx.fillRect(-3, -40, 6, 40)
    ctx.fillRect(-3, -40, 22, 14)
    ctx.restore()
    // Googly eyes on top.
    for (const k of [-1, 1]) {
      const ex = 104 + k * 16
      ctx.fillStyle = '#ffffff'
      circle(ctx, ex, 52, 12)
      ctx.fill()
      ctx.strokeStyle = '#1c1917'
      ctx.lineWidth = 2
      ctx.stroke()
      const lx = biting ? 4 : Math.sin(f * 1.3 + k) * 4
      ctx.fillStyle = '#1c1917'
      circle(ctx, ex + lx, 54, 5)
      ctx.fill()
    }
    if (biting) {
      ctx.strokeStyle = '#1c1917'
      ctx.lineWidth = 3
      for (const k of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(104 + k * 26, 34)
        ctx.lineTo(104 + k * 6, 40)
        ctx.stroke()
      }
    }
    // Letters it has caught.
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(56, 108, 40, 20)
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(56, 108)
    ctx.lineTo(76, 120)
    ctx.lineTo(96, 108)
    ctx.stroke()
    ctx.fillStyle = '#e2e8f0'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillStyle = '#f8fafc'
    ctx.textAlign = 'center'
    ctx.fillText('U.S. MALE', 92, 152)
  }
}

// -- a skeleton hanging from the gutter -----------------------------------------------------------

function hangingSkeleton(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const bone = color
  ctx.save()
  // Swinging from its hands.
  ctx.translate(80, 6)
  ctx.rotate(s * 0.12)
  ctx.translate(-80, -6)
  // Arms up to the rope, hands round it.
  for (const k of [-1, 1]) {
    limb(ctx, 80 + k * 22, 108, 34, 34, Math.PI - k * 0.35, k * 0.25, 7, bone)
    ctx.fillStyle = bone
    circle(ctx, 80 + k * 6, 16, 7)
    ctx.fill()
  }
  skull(ctx, 82, 80, 24, bone, color2, 0.35 + 0.3 * Math.max(0, s), -0.15 + s * 0.15)
  skeletonTorso(ctx, 80, 206, bone)
  // Legs kicking, a jig in the air.
  for (const k of [-1, 1]) {
    const a = k * 0.2 + Math.sin(p + (k > 0 ? 0 : Math.PI)) * 0.55
    const [fx, fy] = limb(ctx, 80 + k * 9, 206, 40, 40, a, -Math.max(0, Math.sin(p * 2 + k)) * 0.8, 8, bone)
    ctx.fillStyle = bone
    ellipse(ctx, fx + 6, fy + 2, 11, 5, a)
    ctx.fill()
  }
  ctx.restore()
}

/** An old rope, twisted. */
function rope(ctx: Ctx) {
  ctx.fillStyle = '#a16207'
  ctx.fillRect(1, 0, 6, 256)
  ctx.strokeStyle = '#713f12'
  ctx.lineWidth = 1.5
  for (let y = 0; y < 256; y += 6) {
    ctx.beginPath()
    ctx.moveTo(1, y)
    ctx.lineTo(7, y + 4)
    ctx.stroke()
  }
}

// -- eyes in the hedge -------------------------------------------------------------------------------

function bushEyes(ctx: Ctx, f: number, _n: number, { color, color2 }: SpriteColors) {
  // A dark hedge, clumps of leaves.
  for (let k = 0; k < 16; k++) {
    const x = 20 + noise(k * 1.3) * 260
    const y = 60 + noise(k * 2.7) * 90
    const r = 30 + noise(k * 4.1) * 26
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 2, x, y, r)
    g.addColorStop(0, shade(color, 0.25))
    g.addColorStop(1, shade(color, -0.45))
    ctx.fillStyle = g
    circle(ctx, x, y, r)
    ctx.fill()
  }
  ctx.fillStyle = shade(color, -0.55)
  ctx.fillRect(10, 150, 280, 30)
  // Leaf texture.
  for (let k = 0; k < 60; k++) {
    ctx.fillStyle = rgba('#86efac', 0.12 + noise(k) * 0.1)
    ellipse(ctx, 16 + noise(k * 3.9) * 268, 40 + noise(k * 5.3) * 120, 6, 3, noise(k * 7.1) * 3)
    ctx.fill()
  }
  // Three pairs of eyes in the dark, looking the way the frame says (left, ahead, right), or blinking.
  const look = [-1, 0, 1, 0][f]
  const blink = f === 3
  for (const [x, y, r] of [[70, 96, 9], [160, 76, 11], [236, 112, 8]] as const) {
    for (const k of [-1, 1]) {
      const ex = x + k * r * 1.6
      if (blink) {
        ctx.strokeStyle = color2
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(ex - r, y)
        ctx.quadraticCurveTo(ex, y + 3, ex + r, y)
        ctx.stroke()
        continue
      }
      glow(ctx, ex, y, r * 2.2, color2, 0.5)
      ctx.fillStyle = color2
      ellipse(ctx, ex, y, r, r * 0.7)
      ctx.fill()
      ctx.fillStyle = '#0a0a0a'
      ellipse(ctx, ex + look * r * 0.45, y, r * 0.22, r * 0.6)
      ctx.fill()
    }
  }
}

// -- a big spider crawling on the wall ------------------------------------------------------------------

function wallSpider(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const body = color
  // Eight hairy legs, stepping in turn.
  for (let j = 0; j < 4; j++) {
    for (const k of [-1, 1]) {
      const ph = p + j * 1.6 + (k > 0 ? Math.PI : 0)
      const base = -0.9 + j * 0.6
      const a = base + Math.sin(ph) * 0.18
      const sx = 100 + k * 16
      const sy = 92 + j * 9
      const kx = sx + k * Math.cos(a) * 46
      const ky = sy + Math.sin(a) * 46 - 22
      const ex = kx + k * Math.cos(a + 0.9) * 40
      const ey = ky + Math.sin(a + 0.9) * 50 + 18
      ctx.strokeStyle = shade(body, -0.2)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 9
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(kx, ky)
      ctx.lineTo(ex, ey)
      ctx.stroke()
      // Hairs.
      ctx.strokeStyle = rgba('#a8a29e', 0.5)
      ctx.lineWidth = 1
      for (let h = 0; h < 6; h++) {
        const q = h / 6
        const hx = sx + (kx - sx) * q
        const hy = sy + (ky - sy) * q
        ctx.beginPath()
        ctx.moveTo(hx, hy)
        ctx.lineTo(hx + k * 3, hy - 6)
        ctx.stroke()
      }
      // Orange bands at the knees, as tarantulas have.
      ctx.fillStyle = color2
      circle(ctx, kx, ky, 4.5)
      ctx.fill()
    }
  }
  // Abdomen and head.
  const g = ctx.createRadialGradient(94, 140, 4, 100, 146, 44)
  g.addColorStop(0, shade(body, 0.35))
  g.addColorStop(1, shade(body, -0.4))
  ctx.fillStyle = g
  ellipse(ctx, 100, 146, 34, 42)
  ctx.fill()
  ctx.fillStyle = shade(body, 0.1)
  ellipse(ctx, 100, 92, 24, 22)
  ctx.fill()
  ctx.strokeStyle = rgba('#d6d3d1', 0.25)
  ctx.lineWidth = 1
  for (let k = 0; k < 30; k++) {
    const a = noise(k) * TAU
    const r = 10 + noise(k + 3) * 28
    ctx.beginPath()
    ctx.moveTo(100 + Math.cos(a) * r * 0.8, 146 + Math.sin(a) * r)
    ctx.lineTo(100 + Math.cos(a) * (r + 6) * 0.8, 146 + Math.sin(a) * (r + 6))
    ctx.stroke()
  }
  // Fangs and a cluster of shining eyes.
  ctx.fillStyle = '#0a0a0a'
  ellipse(ctx, 92, 72, 5, 9, 0.2)
  ctx.fill()
  ellipse(ctx, 108, 72, 5, 9, -0.2)
  ctx.fill()
  for (const [x, y, r] of [[93, 84, 4.5], [107, 84, 4.5], [86, 90, 3], [114, 90, 3], [97, 92, 2.5], [103, 92, 2.5]] as const) {
    ctx.fillStyle = '#000'
    circle(ctx, x, y, r)
    ctx.fill()
    glow(ctx, x, y, r * 1.8, '#ef4444', 0.7)
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    circle(ctx, x - r * 0.3, y - r * 0.3, r * 0.3)
    ctx.fill()
  }
}

// -- snakes -------------------------------------------------------------------------------------------

function snake(rearing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const pts: Array<[number, number]> = []
    if (rearing) {
      // Coiled on the ground, the front of it raised, swaying.
      for (let k = 0; k <= 40; k++) {
        const q = k / 40
        const a = q * TAU * 1.1
        pts.push([120 + Math.cos(a) * (60 - q * 20), 140 + Math.sin(a) * 12])
      }
      for (let k = 1; k <= 16; k++) {
        const q = k / 16
        pts.push([132 + q * 40 + Math.sin(q * 3 + p) * 10 * q, 140 - q * 104])
      }
    } else {
      for (let k = 0; k <= 48; k++) {
        const q = k / 48
        pts.push([14 + q * 230, 132 + Math.sin(q * TAU * 1.5 - p) * 14 * (0.4 + 0.6 * q) * (1 - q * 0.6)])
      }
    }
    // Body, thinning to the tail, banded.
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let k = 1; k < pts.length; k++) {
      const q = k / pts.length
      const w = 4 + 18 * Math.min(1, q * 1.8)
      ctx.strokeStyle = Math.floor(k / 3) % 2 ? shade(color, -0.15) : color
      ctx.lineWidth = w
      ctx.beginPath()
      ctx.moveTo(pts[k - 1][0], pts[k - 1][1])
      ctx.lineTo(pts[k][0], pts[k][1])
      ctx.stroke()
      if (k % 3 === 0) {
        ctx.fillStyle = rgba(color2, 0.9)
        ellipse(ctx, pts[k][0], pts[k][1], w * 0.24, w * 0.24)
        ctx.fill()
      }
    }
    const [hx, hy] = pts[pts.length - 1]
    const [px, py] = pts[pts.length - 3]
    const a = Math.atan2(hy - py, hx - px)
    ctx.save()
    ctx.translate(hx, hy)
    ctx.rotate(rearing ? 0 : a)
    // Head, eye, and a forked tongue flicking in and out.
    const tongue = Math.max(0, Math.sin(p * 2))
    if (tongue > 0.1) {
      ctx.strokeStyle = '#dc2626'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(18, 2)
      ctx.lineTo(18 + 18 * tongue, 2)
      ctx.lineTo(24 + 20 * tongue, -4)
      ctx.moveTo(18 + 18 * tongue, 2)
      ctx.lineTo(24 + 20 * tongue, 8)
      ctx.stroke()
    }
    ctx.fillStyle = shade(color, 0.1)
    ellipse(ctx, 6, 0, 18, 12)
    ctx.fill()
    ctx.fillStyle = '#facc15'
    circle(ctx, 10, -5, 4)
    ctx.fill()
    ctx.fillStyle = '#000'
    ellipse(ctx, 10.5, -5, 1.2, 3.5)
    ctx.fill()
    ctx.restore()
  }
}

// -- tentacles from under the ground --------------------------------------------------------------

function tentacle(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  // A curve from the ground up, curling over at the tip.
  const pts: Array<[number, number, number]> = []
  for (let k = 0; k <= 30; k++) {
    const q = k / 30
    const curl = q * q * (2.6 + Math.sin(p) * 0.8)
    const x = 70 + Math.sin(curl) * 40 * q + Math.sin(p + q * 3) * 8 * q
    const y = 256 - q * 210 + (1 - Math.cos(curl)) * 30 * q
    pts.push([x, y, 26 * (1 - q * 0.85)])
  }
  ctx.lineCap = 'round'
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1]
    const [x1, y1, w] = pts[k]
    ctx.strokeStyle = shade(color, -0.2 + (k % 2) * 0.04)
    ctx.lineWidth = w * 2
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }
  // Highlight down its back and suckers down the inside of the curl.
  ctx.strokeStyle = rgba('#ffffff', 0.18)
  ctx.lineWidth = 6
  ctx.beginPath()
  pts.forEach(([x, y, w], k) => (k ? ctx.lineTo(x - w * 0.5, y) : ctx.moveTo(x - w * 0.5, y)))
  ctx.stroke()
  for (let k = 3; k < pts.length - 1; k += 2) {
    const [x, y, w] = pts[k]
    const [nx, ny] = pts[k + 1]
    const a = Math.atan2(ny - y, nx - x) + Math.PI / 2
    const sx = x + Math.cos(a) * w * 0.6
    const sy = y + Math.sin(a) * w * 0.6
    ctx.fillStyle = color2
    circle(ctx, sx, sy, w * 0.32)
    ctx.fill()
    ctx.fillStyle = shade(color2, -0.35)
    circle(ctx, sx, sy, w * 0.14)
    ctx.fill()
  }
}

/** Cracked earth with something glowing underneath. */
function crackedGround(ctx: Ctx, _f: number, _n: number, { color2 }: SpriteColors) {
  ctx.fillStyle = '#292524'
  ellipse(ctx, 100, 44, 96, 28)
  ctx.fill()
  glow(ctx, 100, 42, 70, color2, 0.35)
  ctx.strokeStyle = rgba(color2, 0.8)
  ctx.lineWidth = 2.5
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU + noise(k) * 0.4
    ctx.beginPath()
    ctx.moveTo(100, 44)
    ctx.lineTo(100 + Math.cos(a) * 40, 44 + Math.sin(a) * 12)
    ctx.lineTo(100 + Math.cos(a + 0.2) * 80, 44 + Math.sin(a + 0.2) * 22)
    ctx.stroke()
  }
  ctx.fillStyle = '#44403c'
  for (const [x, y] of [[30, 40], [168, 36], [56, 60], [148, 62]] as const) {
    ellipse(ctx, x, y, 14, 7)
    ctx.fill()
  }
}

// -- a fortune teller and her crystal ball ----------------------------------------------------------

function fortuneTeller(seeing: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const skin = '#d6a77a'
    // Her shawl and dress behind the table.
    const g = ctx.createLinearGradient(0, 60, 0, 170)
    g.addColorStop(0, shade(color, 0.15))
    g.addColorStop(1, shade(color, -0.35))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(40, 170)
    ctx.quadraticCurveTo(46, 100, 110, 92)
    ctx.quadraticCurveTo(174, 100, 180, 170)
    ctx.closePath()
    ctx.fill()
    // Head in a scarf, gold hoops, eyes shut or wide and glowing.
    ctx.fillStyle = skin
    ellipse(ctx, 110, 66, 22, 26)
    ctx.fill()
    ctx.fillStyle = shade(color2, -0.3)
    ctx.beginPath()
    ctx.moveTo(84, 66)
    ctx.quadraticCurveTo(84, 30, 110, 30)
    ctx.quadraticCurveTo(138, 30, 136, 66)
    ctx.quadraticCurveTo(124, 46, 110, 46)
    ctx.quadraticCurveTo(96, 46, 84, 66)
    ctx.fill()
    ctx.fillStyle = '#facc15'
    for (let k = 0; k < 5; k++) {
      circle(ctx, 92 + k * 9, 46 + Math.abs(k - 2) * 2, 2.5)
      ctx.fill()
    }
    ctx.strokeStyle = '#facc15'
    ctx.lineWidth = 2.5
    for (const k of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(110 + k * 22, 80, 6, 0, TAU)
      ctx.stroke()
    }
    for (const k of [-1, 1]) {
      if (seeing) {
        glow(ctx, 110 + k * 9, 64, 9, color2, 1)
        ctx.fillStyle = '#ffffff'
        circle(ctx, 110 + k * 9, 64, 2.5)
        ctx.fill()
      } else {
        ctx.strokeStyle = '#3f2a1a'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(110 + k * 9, 62, 5, 0.2, Math.PI - 0.2)
        ctx.stroke()
      }
    }
    ctx.fillStyle = '#9f1239'
    ellipse(ctx, 110, 80, 6, seeing ? 4 : 2)
    ctx.fill()
    // The table, draped, with stars on the cloth.
    ctx.fillStyle = '#1e1b4b'
    ctx.beginPath()
    ctx.moveTo(20, 172)
    ctx.lineTo(200, 172)
    ctx.lineTo(214, 230)
    ctx.lineTo(6, 230)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#facc15'
    for (let k = 0; k < 7; k++) {
      const x = 20 + noise(k * 2.1) * 180
      const y = 184 + noise(k * 3.3) * 40
      ctx.beginPath()
      for (let j = 0; j < 10; j++) {
        const r = j % 2 ? 2 : 5
        const a = (j / 10) * TAU - Math.PI / 2
        j ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
      }
      ctx.fill()
    }
    // The ball: smoke swirling in it, bright when she sees something.
    const bright = seeing ? 0.75 + 0.25 * Math.sin(p * 2) : 0.3 + 0.1 * Math.sin(p)
    glow(ctx, 110, 146, 70 * bright + 20, color2, 0.55 * bright)
    const b = ctx.createRadialGradient(100, 132, 4, 110, 146, 34)
    b.addColorStop(0, '#ffffff')
    b.addColorStop(0.35, rgba(color2, 0.8))
    b.addColorStop(1, 'rgba(30,27,75,0.92)')
    ctx.fillStyle = b
    circle(ctx, 110, 146, 32)
    ctx.fill()
    ctx.strokeStyle = rgba('#ffffff', 0.45)
    ctx.lineWidth = 2
    for (let k = 0; k < 3; k++) {
      ctx.beginPath()
      ctx.arc(110, 146, 10 + k * 7, p * (k % 2 ? 1 : -1) + k, p * (k % 2 ? 1 : -1) + k + 2.2)
      ctx.stroke()
    }
    ctx.fillStyle = '#78350f'
    ctx.beginPath()
    ctx.moveTo(86, 176)
    ctx.lineTo(134, 176)
    ctx.lineTo(126, 166)
    ctx.lineTo(94, 166)
    ctx.closePath()
    ctx.fill()
    // Hands either side of the ball, fingers spread over it.
    for (const k of [-1, 1]) {
      const wave = seeing ? Math.sin(p * 2 + k) * 4 : 0
      ctx.fillStyle = skin
      ellipse(ctx, 110 + k * 42, 140 + wave, 11, 15, k * 0.5)
      ctx.fill()
      ctx.strokeStyle = skin
      ctx.lineWidth = 4.5
      ctx.lineCap = 'round'
      for (let j = 0; j < 4; j++) {
        ctx.beginPath()
        ctx.moveTo(110 + k * 40, 132 + j * 5 + wave)
        ctx.lineTo(110 + k * (26 - j), 120 + j * 9 + wave)
        ctx.stroke()
      }
      ctx.fillStyle = '#facc15'
      circle(ctx, 110 + k * 30, 128 + wave, 2.5)
      ctx.fill()
    }
  }
}

// -- zombies dancing ----------------------------------------------------------------------------------

function dancingZombie(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  // The famous dance: a shuffle to one side, shoulders hunched, hands up like claws, a head shake.
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const c = Math.cos(p)
  const step = Math.sin(p * 2)
  const skin = color2
  const clothes = color
  const x = 90 + s * 6
  const hip = 160
  ctx.save()
  // Legs: stepping out and in.
  for (const k of [-1, 1]) {
    const a = k * 0.15 + (k === Math.sign(s || 1) ? step * 0.25 : 0)
    const [fx, fy] = limb(ctx, x + k * 12, hip, 44, 44, a, Math.max(0, -step * k) * 0.4, 16, '#334155')
    ctx.fillStyle = '#1c1917'
    ellipse(ctx, fx + 6, fy + 3, 13, 6)
    ctx.fill()
  }
  // Torn shirt.
  const g = ctx.createLinearGradient(x - 30, 0, x + 30, 0)
  g.addColorStop(0, shade(clothes, -0.3))
  g.addColorStop(1, shade(clothes, 0.15))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(x - 30, 84 + Math.abs(s) * 4)
  ctx.lineTo(x + 30, 84 - Math.abs(s) * 4)
  ctx.lineTo(x + 26, hip + 4)
  for (let k = 0; k < 6; k++) ctx.lineTo(x + 22 - k * 9, hip + 4 + (k % 2) * 10)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = shade(skin, -0.1)
  ellipse(ctx, x + 6, 124, 6, 10)
  ctx.fill()
  // Arms up, hands curled like claws, swinging to the beat.
  for (const k of [-1, 1]) {
    const lift = 2.3 + c * 0.25 * k
    const [hx, hy] = limb(ctx, x + k * 28, 90, 30, 30, k * lift, -k * (1.4 + s * 0.2), 11, shade(clothes, -0.1))
    ctx.fillStyle = skin
    circle(ctx, hx, hy, 8)
    ctx.fill()
    ctx.strokeStyle = skin
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    for (let j = -1; j <= 1; j++) {
      ctx.beginPath()
      ctx.moveTo(hx, hy)
      ctx.quadraticCurveTo(hx + k * 8, hy - 8 + j * 4, hx + k * 12, hy + j * 5)
      ctx.stroke()
    }
  }
  // Head, tilted and shaking, sunken eyes, a few hairs.
  const tilt = Math.sin(p * 4) * 0.12 + s * 0.15
  ctx.save()
  ctx.translate(x + 2, 60)
  ctx.rotate(tilt)
  ctx.fillStyle = skin
  ellipse(ctx, 0, 0, 22, 26)
  ctx.fill()
  ctx.fillStyle = shade(skin, -0.45)
  for (const k of [-1, 1]) {
    ellipse(ctx, k * 9, -4, 7, 6)
    ctx.fill()
  }
  ctx.fillStyle = '#fef08a'
  for (const k of [-1, 1]) {
    circle(ctx, k * 9, -4, 2.5)
    ctx.fill()
  }
  ctx.strokeStyle = '#3f1d1d'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(-10, 12)
  ctx.lineTo(-3, 10)
  ctx.lineTo(4, 13)
  ctx.lineTo(10, 10)
  ctx.stroke()
  ctx.strokeStyle = '#1c1917'
  ctx.lineWidth = 2
  for (let k = 0; k < 5; k++) {
    ctx.beginPath()
    ctx.moveTo(-12 + k * 6, -24)
    ctx.lineTo(-16 + k * 7, -34 - noise(k) * 6)
    ctx.stroke()
  }
  ctx.restore()
  ctx.restore()
}

// -- a cemetery gate that creaks open ------------------------------------------------------------------

function creakyGate(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const open = f / (frames - 1)
  // Mist behind the gate, brighter as it opens, glowing in the colour of what waits beyond.
  const m = ctx.createRadialGradient(140, 200, 10, 140, 180, 140)
  m.addColorStop(0, rgba(color2, 0.2 + 0.5 * open))
  m.addColorStop(1, rgba(color2, 0))
  ctx.fillStyle = m
  ctx.fillRect(40, 40, 200, 200)
  // Stone pillars, with balls on top.
  for (const x of [8, 236]) {
    const g = ctx.createLinearGradient(x, 0, x + 36, 0)
    g.addColorStop(0, '#78716c')
    g.addColorStop(1, '#44403c')
    ctx.fillStyle = g
    ctx.fillRect(x, 60, 36, 180)
    ctx.fillStyle = '#57534e'
    ctx.fillRect(x - 4, 52, 44, 12)
    ctx.fillStyle = '#a8a29e'
    circle(ctx, x + 18, 40, 13)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 1.5
    for (let y = 84; y < 240; y += 26) {
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + 36, y)
      ctx.stroke()
    }
  }
  // Two iron halves, each swinging in on its hinge (narrowing as it turns away).
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineCap = 'round'
  for (const k of [-1, 1]) {
    const hinge = k < 0 ? 44 : 236
    const w = 96 * Math.cos(open * 1.25)
    const lift = open * 10
    const x = (q: number) => hinge - k * w * q
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(x(0), 80)
    ctx.lineTo(x(0), 236)
    ctx.moveTo(x(1), 92 + lift)
    ctx.lineTo(x(1), 236 + lift * 0.3)
    ctx.stroke()
    ctx.lineWidth = 4
    for (const y of [104, 210]) {
      ctx.beginPath()
      ctx.moveTo(x(0), y)
      ctx.lineTo(x(1), y + lift * (y / 236))
      ctx.stroke()
    }
    // Bars with spear tips, and a curl of scrollwork.
    for (let j = 1; j <= 5; j++) {
      const q = j / 6
      const top = 66 + Math.sin(q * Math.PI) * -14 + lift * q
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(x(q), top)
      ctx.lineTo(x(q), 230 + lift * q * 0.3)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x(q) - 4, top + 4)
      ctx.lineTo(x(q), top - 8)
      ctx.lineTo(x(q) + 4, top + 4)
      ctx.fill()
    }
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(x(0.5), 150 + lift * 0.5, Math.max(2, 18 * Math.cos(open * 1.25)), 0, TAU)
    ctx.stroke()
  }
  // A sign hanging from the arch, a skull and crossbones.
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(44, 64)
  ctx.quadraticCurveTo(140, 10, 236, 64)
  ctx.stroke()
  ctx.font = 'bold 16px Georgia, serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = color
  ctx.fillText('R.I.P.', 140, 52)
}

// -- a tower of jack-o'-lanterns ------------------------------------------------------------------------

function pumpkinTower(ctx: Ctx, f: number, _n: number, { color2 }: SpriteColors) {
  const look = [-1, 0, 1, 0][f]
  const laugh = f === 3
  glow(ctx, 80, 190, 120, color2, laugh ? 0.35 : 0.2)
  // Biggest at the bottom; each turns its face, the middle one a little behind the others.
  jackOLantern(ctx, 80, 246, 62, color2, laugh ? 'laugh' : 'grin', look)
  jackOLantern(ctx, 80, 160, 48, color2, laugh ? 'laugh' : 'boo', look * 0.8)
  jackOLantern(ctx, 80, 90, 36, color2, laugh ? 'laugh' : 'grin', look * 1.1)
  // A witch's hat on top.
  ctx.fillStyle = '#1e1b4b'
  ctx.beginPath()
  ctx.ellipse(80, 62, 40, 9, 0, 0, TAU)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(56, 60)
  ctx.quadraticCurveTo(72, 30, 76 + look * 6, 6)
  ctx.quadraticCurveTo(98 + look * 12, 14, 104, 22)
  ctx.quadraticCurveTo(90, 34, 104, 60)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#a3e635'
  ctx.fillRect(58, 50, 44, 7)
}

// -- the Day of the Dead -----------------------------------------------------------------------------

/** Petals of a marigold, the cempasúchil. */
function marigold(ctx: Ctx, x: number, y: number, r: number) {
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = ['#c2410c', '#f97316', '#fbbf24'][k]
    for (let j = 0; j < 10; j++) {
      const a = (j / 10) * TAU + k * 0.3
      ellipse(ctx, x + Math.cos(a) * r * (0.55 - k * 0.15), y + Math.sin(a) * r * (0.55 - k * 0.15), r * (0.42 - k * 0.1), r * (0.28 - k * 0.06), a)
      ctx.fill()
    }
  }
}

/** A face painted as a sugar skull: white, dark round the eyes, petals and dots. */
function calaveraFace(ctx: Ctx, x: number, y: number, r: number, accent: string, flower: string, eyeGlow = 0) {
  ctx.fillStyle = '#fafaf9'
  ellipse(ctx, x, y, r, r * 1.12)
  ctx.fill()
  for (const k of [-1, 1]) {
    const ex = x + k * r * 0.4
    const ey = y - r * 0.1
    // Petals round each eye.
    ctx.fillStyle = accent
    for (let j = 0; j < 8; j++) {
      const a = (j / 8) * TAU
      ellipse(ctx, ex + Math.cos(a) * r * 0.3, ey + Math.sin(a) * r * 0.3, r * 0.12, r * 0.07, a)
      ctx.fill()
    }
    ctx.fillStyle = '#111827'
    circle(ctx, ex, ey, r * 0.24)
    ctx.fill()
    if (eyeGlow > 0) glow(ctx, ex, ey, r * 0.4, flower, eyeGlow)
  }
  ctx.fillStyle = '#111827'
  ctx.beginPath()
  ctx.moveTo(x, y + r * 0.14)
  ctx.lineTo(x - r * 0.1, y + r * 0.34)
  ctx.lineTo(x + r * 0.1, y + r * 0.34)
  ctx.fill()
  // A stitched smile across the mouth.
  ctx.strokeStyle = '#111827'
  ctx.lineWidth = r * 0.05
  ctx.beginPath()
  ctx.moveTo(x - r * 0.48, y + r * 0.56)
  ctx.quadraticCurveTo(x, y + r * 0.74, x + r * 0.48, y + r * 0.56)
  ctx.stroke()
  for (let k = -3; k <= 3; k++) {
    ctx.beginPath()
    ctx.moveTo(x + k * r * 0.13, y + r * 0.56)
    ctx.lineTo(x + k * r * 0.13, y + r * 0.74)
    ctx.stroke()
  }
  // A flower on the brow and dots on the chin.
  marigold(ctx, x, y - r * 0.68, r * 0.24)
  ctx.fillStyle = accent
  for (let k = -1; k <= 1; k++) {
    circle(ctx, x + k * r * 0.18, y + r * 0.92, r * 0.05)
    ctx.fill()
  }
}

function catrina(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  const p = (f / frames) * TAU
  const s = Math.sin(p)
  const c = Math.cos(p)
  // A long ruffled dress, the skirt held out and swirled from side to side.
  const sway = s * 18
  const g = ctx.createLinearGradient(30, 0, 160, 0)
  g.addColorStop(0, shade(color, -0.35))
  g.addColorStop(0.5, shade(color, 0.1))
  g.addColorStop(1, shade(color, -0.3))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(78, 120)
  ctx.lineTo(112, 120)
  ctx.quadraticCurveTo(140 + sway, 190, 178 + sway, 250)
  for (let k = 0; k <= 8; k++) ctx.quadraticCurveTo(170 + sway - k * 19, 262, 160 + sway - (k + 1) * 19 - sway * (k / 8) * 0.5, 252)
  ctx.quadraticCurveTo(52 + sway * 0.4, 190, 78, 120)
  ctx.closePath()
  ctx.fill()
  // Ruffles in the flower colour.
  ctx.strokeStyle = color2
  ctx.lineWidth = 4
  for (const y of [200, 232]) {
    ctx.beginPath()
    const w = (y - 120) * 0.62
    for (let k = 0; k <= 12; k++) {
      const x = 95 + sway * ((y - 120) / 130) - w + (k / 12) * w * 2
      const yy = y + (k % 2 ? 6 : 0)
      k ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy)
    }
    ctx.stroke()
  }
  // Bodice and arms holding out the skirt.
  ctx.fillStyle = shade(color, -0.1)
  ctx.beginPath()
  ctx.moveTo(76, 80)
  ctx.lineTo(114, 80)
  ctx.lineTo(110, 126)
  ctx.lineTo(80, 126)
  ctx.closePath()
  ctx.fill()
  for (const k of [-1, 1]) {
    const [hx, hy] = limb(ctx, 95 + k * 20, 86, 30, 30, k * (0.5 + 0.25 * (k * s + 1)), k * 0.5, 8, '#fafaf9')
    ctx.fillStyle = shade(color, 0.2)
    ellipse(ctx, hx + k * 6, hy + 4, 10, 16, k * 0.4)
    ctx.fill()
  }
  // Neck, the calavera face, and the grand hat heaped with flowers.
  ctx.fillStyle = '#fafaf9'
  ctx.fillRect(90, 66, 10, 16)
  calaveraFace(ctx, 95, 50, 18, color, color2)
  ctx.fillStyle = '#111827'
  ctx.beginPath()
  ctx.ellipse(95 + c * 2, 32, 54, 10, -0.12 + s * 0.05, 0, TAU)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(95 + c * 2, 22, 26, 14, -0.12, Math.PI, TAU)
  ctx.fill()
  for (const [dx, dy, r] of [[-20, -2, 10], [0, -8, 12], [20, -2, 10], [34, 6, 7], [-34, 6, 7]] as const) {
    marigold(ctx, 95 + dx + c * 2, 22 + dy, r)
  }
  ctx.strokeStyle = '#a855f7'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(130, 20)
  ctx.quadraticCurveTo(150, 0 + s * 6, 156, -4)
  ctx.stroke()
}

function sugarSkull(lit: boolean) {
  return (ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) => {
    const p = (f / frames) * TAU
    const jaw = lit ? Math.abs(Math.sin(p * 2)) * 0.6 : 0
    glow(ctx, 90, 96, 90, color2, lit ? 0.35 : 0.1)
    // Skull with its jaw apart (chattering when lit), on a little bed of marigolds.
    ctx.save()
    ctx.translate(0, -jaw * 4)
    calaveraFace(ctx, 90, 82, 56, color, color2, lit ? 0.9 + 0.1 * Math.sin(p * 3) : 0)
    ctx.restore()
    ctx.fillStyle = '#fafaf9'
    ctx.beginPath()
    ctx.roundRect(56, 136 + jaw * 10, 68, 22, 10)
    ctx.fill()
    ctx.fillStyle = '#111827'
    for (let k = 0; k < 6; k++) ctx.fillRect(62 + k * 10, 136 + jaw * 10, 2, 8)
    for (const x of [26, 154, 46, 134]) marigold(ctx, x, 166, 16)
  }
}

function ofrenda(ctx: Ctx, f: number, frames: number, { color, color2 }: SpriteColors) {
  // How many candles are lit: one more for each step people come.
  const lit = Math.round((f / (frames - 1)) * 8)
  // Papel picado strung across the top.
  const picado = ['#ec4899', '#f97316', '#a855f7', '#22c55e', '#facc15', '#06b6d4']
  ctx.strokeStyle = '#e7e5e4'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(6, 14)
  ctx.quadraticCurveTo(150, 30, 294, 14)
  ctx.stroke()
  for (let k = 0; k < 8; k++) {
    const x = 18 + k * 36
    const y = 16 + Math.sin((k / 7) * Math.PI) * 8
    ctx.fillStyle = picado[k % picado.length]
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 28, y)
    ctx.lineTo(x + 28, y + 30)
    for (let j = 0; j < 4; j++) ctx.lineTo(x + 28 - j * 7 - 3.5, y + 34 - (j % 2) * 3)
    ctx.lineTo(x, y + 30)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    for (const [dx, dy] of [[8, 9], [20, 9], [14, 18], [8, 24], [20, 24]] as const) {
      circle(ctx, x + dx, y + dy, 2.5)
      ctx.fill()
    }
  }
  // Three steps, draped in cloth.
  const steps = [[40, 200, 220, 34], [64, 160, 172, 40], [92, 120, 116, 40]] as const
  for (const [x, y, w, h] of [...steps].reverse()) {
    ctx.fillStyle = shade(color, -0.25)
    ctx.fillRect(x, y, w, h + (y === 200 ? 26 : 0))
    ctx.fillStyle = color
    ctx.fillRect(x, y, w, 8)
    ctx.fillStyle = shade(color, 0.25)
    for (let k = 0; k < w; k += 12) {
      ctx.beginPath()
      ctx.moveTo(x + k, y + 8)
      ctx.lineTo(x + k + 6, y + 15)
      ctx.lineTo(x + k + 12, y + 8)
      ctx.fill()
    }
  }
  // Photographs of those remembered, in frames.
  for (const [x, y] of [[112, 78], [160, 78]] as const) {
    ctx.fillStyle = '#a16207'
    ctx.fillRect(x - 2, y - 2, 32, 40)
    ctx.fillStyle = '#e7e5e4'
    ctx.fillRect(x + 2, y + 2, 24, 32)
    ctx.fillStyle = '#78716c'
    circle(ctx, x + 14, y + 14, 6)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(x + 14, y + 34, 10, 9, 0, Math.PI, TAU)
    ctx.fill()
  }
  // Marigolds, bread and little sugar skulls on the steps.
  for (const x of [70, 96, 204, 230, 56, 244]) marigold(ctx, x, x < 100 || x > 200 ? 196 : 156, 10)
  ctx.fillStyle = '#d97706'
  ellipse(ctx, 150, 152, 18, 10)
  ctx.fill()
  ctx.strokeStyle = '#92400e'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(138, 150)
  ctx.lineTo(162, 150)
  ctx.moveTo(150, 144)
  ctx.lineTo(150, 158)
  ctx.stroke()
  for (const x of [120, 180]) calaveraFace(ctx, x, 190, 9, '#ec4899', color2)
  // Candles along the bottom step and either side, lit one by one.
  const spots = [[52, 200], [248, 200], [76, 160], [224, 160], [100, 120], [200, 120], [140, 200], [160, 200]] as const
  spots.forEach(([x, y], k) => {
    ctx.fillStyle = '#fef3c7'
    ctx.fillRect(x - 5, y - 26, 10, 26)
    if (k < lit) {
      glow(ctx, x, y - 34, 22, color2, 0.8)
      ctx.fillStyle = '#fde68a'
      ellipse(ctx, x, y - 33, 3.5, 7 + noise(k + f) * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ellipse(ctx, x, y - 31, 1.5, 3)
      ctx.fill()
    } else {
      ctx.strokeStyle = '#44403c'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x, y - 26)
      ctx.lineTo(x, y - 31)
      ctx.stroke()
    }
  })
}

// -- the rows each style is made of ------------------------------------------------------------

const BUBBLE = { id: 'bubble', frames: 1, w: 360, h: 140 }

export const HALLOWEEN_ROWS: Record<string, SpriteRow[]> = {
  'headless-horseman': [
    { id: 'main', frames: 8, w: 320, h: 260, paint: headlessHorseman(false) },
    // Rearing up and holding the pumpkin high, for people.
    { id: 'wave', frames: 8, w: 320, h: 260, paint: headlessHorseman(true) },
    { ...BUBBLE, paint: saying('Beware!') },
    SPARKLE,
  ],
  // Asleep to wide awake, branches clawing.
  'haunted-tree': [
    { id: 'main', frames: 8, w: 260, h: 320, paint: hauntedTree },
    { ...BUBBLE, paint: saying('Who goes there?') },
    SPARKLE,
  ],
  // Just candy, to the hand right out and grabbing.
  'candy-bowl': [
    { id: 'main', frames: 8, w: 220, h: 220, paint: candyBowl },
    { ...BUBBLE, paint: saying('Take one…') },
    SPARKLE,
  ],
  // A guitarist, a drummer and a trumpeter.
  'skeleton-band': [
    { id: 'main', frames: 8, w: 200, h: 250, paint: skeletonMusician(0) },
    { id: 'v1', frames: 8, w: 200, h: 250, paint: skeletonMusician(1) },
    { id: 'v2', frames: 8, w: 200, h: 250, paint: skeletonMusician(2) },
    { id: 'note', frames: 2, w: 64, h: 64, paint: note },
    SPARKLE,
  ],
  'tesla-coil': [
    { id: 'main', frames: 8, w: 160, h: 300, paint: teslaCoil },
    { id: 'arc', frames: 6, w: 100, h: 400, paint: arc },
    SPARKLE,
  ],
  // Pressed on the glass to the left, middle and right, then sliding down it.
  'window-hands': [{ id: 'main', frames: 4, w: 220, h: 200, paint: windowHands }, SPARKLE],
  // Looking left, ahead, right, blinking.
  'window-figures': [{ id: 'main', frames: 4, w: 200, h: 220, paint: windowFigure }, SPARKLE],
  'rocking-chair': [
    { id: 'main', frames: 12, w: 200, h: 240, paint: rockingChair(false) },
    { id: 'act', frames: 12, w: 200, h: 240, paint: rockingChair(true) },
    SPARKLE,
  ],
  'swamp-monster': [
    { id: 'main', frames: 8, w: 220, h: 240, paint: swampMonster },
    { id: 'mound', frames: 1, w: 260, h: 100, paint: muck },
    SPARKLE,
  ],
  // Looking left, ahead, right, then wings out roaring (the order the perching ones turn their heads in).
  gargoyles: [
    { id: 'main', frames: 4, w: 200, h: 220, paint: gargoyle },
    { id: 'fly', frames: 8, w: 300, h: 230, paint: gargoyleFlying },
    SPARKLE,
  ],
  'monster-mailbox': [
    { id: 'main', frames: 4, w: 200, h: 240, paint: mailbox(false) },
    { id: 'act', frames: 6, w: 200, h: 240, paint: mailbox(true) },
    { ...BUBBLE, paint: saying('Feed me!') },
    SPARKLE,
  ],
  'hanging-skeletons': [
    { id: 'main', frames: 12, w: 160, h: 300, paint: hangingSkeleton },
    { id: 'thread', frames: 1, w: 8, h: 256, paint: rope },
    SPARKLE,
  ],
  'bush-eyes': [{ id: 'main', frames: 4, w: 300, h: 180, paint: bushEyes }, SPARKLE],
  'wall-spiders': [{ id: 'main', frames: 8, w: 200, h: 200, paint: wallSpider }, SPARKLE],
  snakes: [
    { id: 'main', frames: 8, w: 280, h: 160, paint: snake(false) },
    // Coiled, rearing up to look, tongue flicking.
    { id: 'look', frames: 8, w: 280, h: 160, paint: snake(true) },
    { ...BUBBLE, paint: saying('Hsss!') },
    SPARKLE,
  ],
  tentacles: [
    { id: 'main', frames: 8, w: 140, h: 260, paint: tentacle },
    { id: 'mound', frames: 1, w: 200, h: 75, paint: crackedGround },
    SPARKLE,
  ],
  'fortune-teller': [
    { id: 'main', frames: 8, w: 220, h: 230, paint: fortuneTeller(false) },
    { id: 'act', frames: 8, w: 220, h: 230, paint: fortuneTeller(true) },
    { ...BUBBLE, paint: saying('I see… candy!') },
    SPARKLE,
  ],
  'dancing-zombies': [{ id: 'main', frames: 16, w: 180, h: 250, paint: dancingZombie }, SPARKLE],
  // Shut to wide open.
  'creaky-gate': [
    { id: 'main', frames: 8, w: 280, h: 240, paint: creakyGate },
    { ...BUBBLE, paint: saying('Creeeak…') },
    SPARKLE,
  ],
  'pumpkin-tower': [
    { id: 'main', frames: 4, w: 160, h: 310, paint: pumpkinTower },
    { ...BUBBLE, paint: saying('Boo!') },
    SPARKLE,
  ],
  catrinas: [
    { id: 'main', frames: 8, w: 190, h: 260, paint: catrina },
    { ...BUBBLE, paint: saying('¡Feliz Día de Muertos!') },
    SPARKLE,
  ],
  'sugar-skulls': [
    { id: 'main', frames: 4, w: 180, h: 180, paint: sugarSkull(false) },
    { id: 'act', frames: 8, w: 180, h: 180, paint: sugarSkull(true) },
    SPARKLE,
  ],
  // No candles lit, to all eight.
  ofrenda: [
    { id: 'main', frames: 9, w: 300, h: 260, paint: ofrenda },
    { ...BUBBLE, paint: saying('We remember') },
    SPARKLE,
  ],
}
