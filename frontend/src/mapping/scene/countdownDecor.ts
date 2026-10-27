/**
 * The decorations of the holiday countdowns, painted with the 2D canvas
 * once when the number changes (countdown.ts): fireworks and champagne for
 * New Year, a dove for MLK Day, lanterns, a groundhog, hearts with Cupid's
 * arrow, a laurel wreath, a Mardi Gras mask, shamrocks and gold coins,
 * painted eggs, the Earth, maracas, roses, poppies, a necktie, the
 * Juneteenth star, a gear with tools, a medal, maple leaves and an acorn, a
 * diya, a dreidel and the Star of David, a kinara, balloons and a cupcake,
 * and a faceted star. Each is drawn round (x, y) at radius r in the
 * countdown's design units, with soft shadows so it reads on a house wall.
 */

export type Ctx = CanvasRenderingContext2D

/** Lighter (k > 0) or darker (k < 0), as #rrggbb. */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.round(Math.max(0, Math.min(255, k >= 0 ? v + (255 - v) * k : v * (1 + k))))
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('')}`
}

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

function shadow(ctx: Ctx, blur = 12, dy = 6, a = 0.5) {
  ctx.shadowColor = `rgba(0,0,0,${a})`
  ctx.shadowBlur = blur
  ctx.shadowOffsetY = dy
}

function noShadow(ctx: Ctx) {
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
}

function radial(ctx: Ctx, x: number, y: number, r: number, stops: string[], fx = -0.35, fy = -0.4) {
  const g = ctx.createRadialGradient(x + fx * r, y + fy * r, r * 0.05, x, y, r)
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c))
  return g
}

/** A five-point star's outline. */
export function star5Path(ctx: Ctx, x: number, y: number, r: number, inner = 0.42, rot = -Math.PI / 2) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5
    const rr = i % 2 === 0 ? r : r * inner
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  ctx.closePath()
}

/** A five-point star cut in facets, light on one side of each point and dark on the other. */
export function facetStar(ctx: Ctx, x: number, y: number, r: number, color: string, glow?: string) {
  ctx.save()
  if (glow) {
    ctx.shadowColor = glow
    ctx.shadowBlur = r * 0.5
  } else shadow(ctx, r * 0.25, r * 0.08)
  ctx.fillStyle = color
  star5Path(ctx, x, y, r)
  ctx.fill()
  noShadow(ctx)
  const pts: Array<[number, number]> = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 === 0 ? r : r * 0.42
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr])
  }
  for (let i = 0; i < 10; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[(i + 1) % 10]
    ctx.fillStyle = i % 2 === 0 ? shade(color, 0.38) : shade(color, -0.3)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.closePath()
    ctx.fill()
  }
  ctx.strokeStyle = rgba(shade(color, 0.7), 0.8)
  ctx.lineWidth = Math.max(1, r * 0.035)
  star5Path(ctx, x, y, r)
  ctx.stroke()
  ctx.restore()
}

// -- New Year ----------------------------------------------------------------------------------

/** A firework burst: long rays with sparks at their tips, shorter rays inside and a white-hot heart. */
export function fireworkBurst(ctx: Ctx, x: number, y: number, r: number, outer: string, inner: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.lineCap = 'round'
  ctx.shadowColor = outer
  ctx.shadowBlur = r * 0.25
  const n = 26
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (i % 3) * 0.03
    const l = r * (0.78 + 0.22 * (((i * 7) % 5) / 4))
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const g = ctx.createLinearGradient(ca * r * 0.2, sa * r * 0.2, ca * l, sa * l)
    g.addColorStop(0, rgba(outer, 0))
    g.addColorStop(0.6, rgba(outer, 0.8))
    g.addColorStop(1, shade(outer, 0.5))
    ctx.strokeStyle = g
    ctx.lineWidth = r * 0.04
    ctx.beginPath()
    ctx.moveTo(ca * r * 0.2, sa * r * 0.2)
    ctx.lineTo(ca * l, sa * l)
    ctx.stroke()
    ctx.fillStyle = shade(outer, 0.65)
    ctx.beginPath()
    ctx.arc(ca * l, sa * l, r * 0.055, 0, Math.PI * 2)
    ctx.fill()
    // A trail of falling sparks under some of the tips.
    if (i % 2 === 0) {
      for (const [k, s] of [[0.84, 0.03], [0.68, 0.022]] as const) {
        ctx.beginPath()
        ctx.arc(ca * l * k, sa * l * k + r * 0.04, r * s, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  ctx.shadowColor = inner
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26
    ctx.strokeStyle = shade(inner, 0.3)
    ctx.lineWidth = r * 0.035
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12)
    ctx.lineTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45)
    ctx.stroke()
  }
  ctx.fillStyle = radial(ctx, 0, 0, r * 0.24, ['#ffffff', shade(inner, 0.5), rgba(inner, 0)], 0, 0)
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.24, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** A champagne flute, bubbles rising in it, leaning by tilt (radians). */
export function flute(ctx: Ctx, x: number, y: number, r: number, tilt: number, wine: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  const bowl = new Path2D()
  bowl.moveTo(-0.3 * r, -r)
  bowl.quadraticCurveTo(-0.33 * r, -0.1 * r, -0.06 * r, 0.18 * r)
  bowl.lineTo(0.06 * r, 0.18 * r)
  bowl.quadraticCurveTo(0.33 * r, -0.1 * r, 0.3 * r, -r)
  bowl.closePath()
  shadow(ctx, 14, 6, 0.45)
  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  ctx.fill(bowl)
  noShadow(ctx)
  ctx.save()
  ctx.clip(bowl)
  const g = ctx.createLinearGradient(0, -0.62 * r, 0, 0.2 * r)
  g.addColorStop(0, shade(wine, 0.45))
  g.addColorStop(0.5, wine)
  g.addColorStop(1, shade(wine, -0.35))
  ctx.fillStyle = g
  ctx.fillRect(-r, -0.62 * r, 2 * r, r)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.beginPath()
  ctx.ellipse(0, -0.62 * r, 0.31 * r, 0.035 * r, 0, 0, Math.PI * 2)
  ctx.fill()
  const bubbles: Array<[number, number, number]> = [[-0.08, -0.1, 0.03], [0.05, -0.25, 0.025], [-0.02, -0.4, 0.03], [0.1, -0.5, 0.02], [-0.12, -0.52, 0.022], [0.02, 0.05, 0.02]]
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'
  ctx.lineWidth = r * 0.012
  for (const [bx, by, br] of bubbles) {
    ctx.beginPath()
    ctx.arc(bx * r, by * r, br * r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'
  ctx.lineWidth = r * 0.028
  ctx.stroke(bowl)
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = r * 0.03
  ctx.beginPath()
  ctx.moveTo(-0.2 * r, -0.9 * r)
  ctx.quadraticCurveTo(-0.22 * r, -0.4 * r, -0.12 * r, -0.05 * r)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'
  ctx.lineWidth = r * 0.05
  ctx.beginPath()
  ctx.moveTo(0, 0.18 * r)
  ctx.lineTo(0, 0.86 * r)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = r * 0.02
  ctx.beginPath()
  ctx.ellipse(0, 0.88 * r, 0.28 * r, 0.06 * r, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

/** Two flutes clinking, with a splash of sparkle where they touch. */
export function clinkingFlutes(ctx: Ctx, x: number, y: number, r: number, wine: string, glow: string) {
  flute(ctx, x - 0.3 * r, y, r, 0.3, wine)
  flute(ctx, x + 0.3 * r, y, r, -0.3, wine)
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = glow
  ctx.shadowBlur = r * 0.3
  for (const [dx, dy, s] of [[0, -1.1, 0.12], [-0.22, -1.25, 0.07], [0.24, -1.22, 0.08], [0.05, -1.4, 0.05]] as const) {
    sparkle(ctx, x + dx * r, y + dy * r, s * r)
  }
  ctx.restore()
}

/** A four-point sparkle. */
export function sparkle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2
    const rr = i % 2 === 0 ? r : r * 0.22
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fill()
}

// -- MLK Day ------------------------------------------------------------------------------------

/** A white dove in flight with an olive branch in its beak. */
export function dove(ctx: Ctx, x: number, y: number, r: number, flip: boolean, body = '#ffffff', glow = '#93c5fd') {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(flip ? -1 : 1, 1)
  ctx.shadowColor = rgba(glow, 0.9)
  ctx.shadowBlur = r * 0.35
  const light = body
  const mid = shade(body, -0.12)
  const dark = shade(body, -0.3)
  // The far wing, behind.
  ctx.fillStyle = dark
  ctx.beginPath()
  ctx.moveTo(0.05 * r, -0.12 * r)
  ctx.quadraticCurveTo(0.2 * r, -0.7 * r, 0.6 * r, -0.95 * r)
  ctx.quadraticCurveTo(0.45 * r, -0.45 * r, 0.32 * r, -0.08 * r)
  ctx.closePath()
  ctx.fill()
  // Tail fan.
  ctx.fillStyle = mid
  ctx.beginPath()
  ctx.moveTo(-0.45 * r, 0)
  ctx.lineTo(-1.05 * r, -0.18 * r)
  ctx.quadraticCurveTo(-1.12 * r, 0.06 * r, -1.0 * r, 0.3 * r)
  ctx.closePath()
  ctx.fill()
  // Body.
  ctx.fillStyle = radial(ctx, 0.1 * r, -0.1 * r, 0.7 * r, [light, light, mid, dark])
  ctx.beginPath()
  ctx.ellipse(0, 0, 0.58 * r, 0.27 * r, -0.12, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0.55 * r, -0.2 * r, 0.2 * r, 0, Math.PI * 2)
  ctx.fill()
  noShadow(ctx)
  // The near wing, raised, with its long feathers.
  ctx.fillStyle = radial(ctx, -0.2 * r, -0.5 * r, 0.8 * r, [light, light, mid])
  ctx.beginPath()
  ctx.moveTo(0.15 * r, -0.12 * r)
  ctx.quadraticCurveTo(-0.05 * r, -0.75 * r, -0.62 * r, -1.0 * r)
  for (let i = 0; i < 5; i++) {
    const t = i / 4
    const fx = -0.62 * r + t * 0.55 * r
    const fy = -1.0 * r + t * 0.8 * r
    ctx.quadraticCurveTo(fx - 0.12 * r, fy + 0.12 * r, fx + 0.08 * r, fy + 0.18 * r)
  }
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = rgba(dark, 0.9)
  ctx.lineWidth = r * 0.018
  for (let i = 1; i < 5; i++) {
    const t = i / 5
    ctx.beginPath()
    ctx.moveTo(0.05 * r - t * 0.1 * r, -0.2 * r - t * 0.1 * r)
    ctx.lineTo(-0.62 * r + t * 0.55 * r, -1.0 * r + t * 0.8 * r)
    ctx.stroke()
  }
  // Beak and eye.
  ctx.fillStyle = '#f59e0b'
  ctx.beginPath()
  ctx.moveTo(0.72 * r, -0.24 * r)
  ctx.lineTo(0.9 * r, -0.17 * r)
  ctx.lineTo(0.72 * r, -0.13 * r)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#0f172a'
  ctx.beginPath()
  ctx.arc(0.6 * r, -0.25 * r, 0.035 * r, 0, Math.PI * 2)
  ctx.fill()
  // The olive branch.
  ctx.strokeStyle = '#4d7c0f'
  ctx.lineWidth = r * 0.03
  ctx.beginPath()
  ctx.moveTo(0.82 * r, -0.17 * r)
  ctx.quadraticCurveTo(1.0 * r, -0.05 * r, 1.18 * r, 0.12 * r)
  ctx.stroke()
  for (const [t, side] of [[0.25, 1], [0.45, -1], [0.62, 1], [0.8, -1], [0.97, 1]] as const) {
    const bx = 0.82 * r + t * 0.36 * r
    const by = -0.17 * r + t * t * 0.29 * r
    ctx.save()
    ctx.translate(bx, by)
    ctx.rotate(0.6 + side * 0.9)
    ctx.fillStyle = side > 0 ? '#65a30d' : '#4d7c0f'
    ctx.beginPath()
    ctx.ellipse(0.07 * r, 0, 0.09 * r, 0.035 * r, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.restore()
}

// -- Lunar New Year ---------------------------------------------------------------------------

/** A red paper lantern lit from inside, with gold caps and a tassel. */
export function paperLantern(ctx: Ctx, x: number, y: number, r: number, red: string, gold = '#fbbf24') {
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = shade(gold, -0.2)
  ctx.lineWidth = r * 0.03
  ctx.beginPath()
  ctx.moveTo(0, -0.95 * r)
  ctx.lineTo(0, -0.66 * r)
  ctx.stroke()
  shadow(ctx, r * 0.3, r * 0.08, 0.5)
  ctx.fillStyle = radial(ctx, 0, 0, 0.85 * r, ['#ffe2a8', shade(red, 0.25), red, shade(red, -0.5)], 0, -0.05)
  ctx.beginPath()
  ctx.ellipse(0, 0, 0.82 * r, 0.6 * r, 0, 0, Math.PI * 2)
  ctx.fill()
  noShadow(ctx)
  ctx.strokeStyle = rgba(shade(red, -0.55), 0.7)
  ctx.lineWidth = r * 0.025
  for (const k of [-0.62, -0.32, 0, 0.32, 0.62]) {
    ctx.beginPath()
    ctx.ellipse(0, 0, Math.abs(k) * 0.82 * r + 0.001, 0.6 * r, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  const capG = ctx.createLinearGradient(-0.32 * r, 0, 0.32 * r, 0)
  capG.addColorStop(0, shade(gold, -0.35))
  capG.addColorStop(0.45, shade(gold, 0.45))
  capG.addColorStop(1, shade(gold, -0.4))
  ctx.fillStyle = capG
  ctx.fillRect(-0.32 * r, -0.7 * r, 0.64 * r, 0.14 * r)
  ctx.fillRect(-0.32 * r, 0.56 * r, 0.64 * r, 0.14 * r)
  // A gold emblem: a ring with a flower in it.
  ctx.strokeStyle = gold
  ctx.lineWidth = r * 0.04
  ctx.beginPath()
  ctx.arc(0, 0, 0.24 * r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = gold
  for (let i = 0; i < 4; i++) {
    ctx.save()
    ctx.rotate((i * Math.PI) / 2 + Math.PI / 4)
    ctx.beginPath()
    ctx.ellipse(0, -0.1 * r, 0.05 * r, 0.1 * r, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  // Tassel.
  ctx.strokeStyle = shade(gold, -0.15)
  ctx.lineWidth = r * 0.02
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath()
    ctx.moveTo(i * 0.025 * r, 0.82 * r)
    ctx.lineTo(i * 0.04 * r, 1.35 * r)
    ctx.stroke()
  }
  ctx.fillStyle = red
  ctx.beginPath()
  ctx.arc(0, 0.78 * r, 0.07 * r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** A gold coin with a square hole (Lunar New Year) or a shamrock pressed in it (St. Patrick's). */
export function goldCoin(ctx: Ctx, x: number, y: number, r: number, tilt: number, mark: 'square' | 'clover' | 'plain' = 'plain') {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  ctx.scale(1, 0.9)
  shadow(ctx, r * 0.4, r * 0.15, 0.5)
  ctx.fillStyle = radial(ctx, 0, 0, r, ['#fff6c7', '#fcd34d', '#d4a017', '#8a6206'])
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  noShadow(ctx)
  ctx.strokeStyle = '#a07a10'
  ctx.lineWidth = r * 0.09
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#b8860b'
  if (mark === 'square') {
    ctx.fillStyle = 'rgba(60,30,0,0.75)'
    ctx.fillRect(-r * 0.22, -r * 0.22, r * 0.44, r * 0.44)
  } else if (mark === 'clover') {
    shamrock(ctx, 0, -r * 0.05, r * 0.45, 0, '#b8860b', false)
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  sparkle(ctx, -r * 0.45, -r * 0.45, r * 0.3)
  ctx.restore()
}

// -- Groundhog Day ---------------------------------------------------------------------------------

/** A groundhog popping out of its burrow, paws up, buck teeth showing. */
export function groundhog(ctx: Ctx, x: number, y: number, r: number, flip: boolean, fur = '#8b5a2b') {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(flip ? -1 : 1, 1)
  const dirt = '#3f2a14'
  shadow(ctx, r * 0.2, r * 0.08)
  ctx.fillStyle = radial(ctx, 0, 0.55 * r, r, [shade(dirt, 0.25), dirt, shade(dirt, -0.5)], 0, -0.3)
  ctx.beginPath()
  ctx.ellipse(0, 0.58 * r, 0.95 * r, 0.3 * r, 0, 0, Math.PI * 2)
  ctx.fill()
  noShadow(ctx)
  // Body and head.
  ctx.fillStyle = radial(ctx, 0, 0, 0.6 * r, [shade(fur, 0.35), fur, shade(fur, -0.45)])
  ctx.beginPath()
  ctx.ellipse(0, 0.08 * r, 0.44 * r, 0.55 * r, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = rgba(shade(fur, 0.45), 0.9)
  ctx.beginPath()
  ctx.ellipse(0, 0.16 * r, 0.24 * r, 0.36 * r, 0, 0, Math.PI * 2)
  ctx.fill()
  for (const s of [-1, 1]) {
    ctx.fillStyle = shade(fur, -0.3)
    ctx.beginPath()
    ctx.arc(s * 0.27 * r, -0.74 * r, 0.09 * r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#d6a77a'
    ctx.beginPath()
    ctx.arc(s * 0.27 * r, -0.74 * r, 0.045 * r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = radial(ctx, 0, -0.5 * r, 0.4 * r, [shade(fur, 0.35), fur, shade(fur, -0.35)])
  ctx.beginPath()
  ctx.ellipse(0, -0.5 * r, 0.36 * r, 0.3 * r, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#e9c9a3'
  ctx.beginPath()
  ctx.ellipse(0, -0.38 * r, 0.2 * r, 0.14 * r, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1c1008'
  ctx.beginPath()
  ctx.ellipse(0, -0.46 * r, 0.07 * r, 0.05 * r, 0, 0, Math.PI * 2)
  ctx.fill()
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#0b0603'
    ctx.beginPath()
    ctx.arc(s * 0.15 * r, -0.6 * r, 0.05 * r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(s * 0.15 * r + 0.015 * r, -0.615 * r, 0.017 * r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#fffaf0'
  ctx.fillRect(-0.045 * r, -0.33 * r, 0.04 * r, 0.08 * r)
  ctx.fillRect(0.005 * r, -0.33 * r, 0.04 * r, 0.08 * r)
  // Paws held up, with little claws.
  for (const s of [-1, 1]) {
    ctx.fillStyle = shade(fur, 0.15)
    ctx.beginPath()
    ctx.ellipse(s * 0.19 * r, -0.08 * r, 0.09 * r, 0.12 * r, s * 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#2a1a0a'
    ctx.lineWidth = r * 0.015
    for (const k of [-1, 0, 1]) {
      ctx.beginPath()
      ctx.moveTo(s * 0.19 * r + k * 0.035 * r, -0.18 * r)
      ctx.lineTo(s * 0.19 * r + k * 0.04 * r, -0.23 * r)
      ctx.stroke()
    }
  }
  // The near lip of the burrow covers his middle.
  ctx.fillStyle = radial(ctx, 0, 0.6 * r, 0.8 * r, [shade(dirt, 0.35), shade(dirt, 0.1), shade(dirt, -0.3)], 0, -0.6)
  ctx.beginPath()
  ctx.ellipse(0, 0.62 * r, 0.82 * r, 0.2 * r, 0, Math.PI * 1.02, Math.PI * 1.98, true)
  ctx.fill()
  ctx.fillStyle = '#5b3d1e'
  for (const [dx, dy, s] of [[-0.6, 0.55, 0.05], [0.55, 0.5, 0.04], [-0.3, 0.72, 0.035], [0.35, 0.74, 0.045], [0.75, 0.62, 0.03]] as const) {
    ctx.beginPath()
    ctx.arc(dx * r, dy * r, s * r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// -- Valentine's Day -----------------------------------------------------------------------------

export function heartPath(ctx: Ctx, r: number) {
  ctx.beginPath()
  ctx.moveTo(0, 0.85 * r)
  ctx.bezierCurveTo(-1.1 * r, 0.05 * r, -0.75 * r, -0.95 * r, 0, -0.42 * r)
  ctx.bezierCurveTo(0.75 * r, -0.95 * r, 1.1 * r, 0.05 * r, 0, 0.85 * r)
  ctx.closePath()
}

/** A glossy heart. */
export function glossyHeart(ctx: Ctx, x: number, y: number, r: number, tilt: number, color: string, glow?: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  if (glow) {
    ctx.shadowColor = glow
    ctx.shadowBlur = r * 0.4
  } else shadow(ctx, r * 0.3, r * 0.1)
  ctx.fillStyle = radial(ctx, 0, 0, 1.1 * r, [shade(color, 0.5), color, shade(color, -0.5)])
  heartPath(ctx, r)
  ctx.fill()
  noShadow(ctx)
  ctx.strokeStyle = rgba(shade(color, 0.6), 0.7)
  ctx.lineWidth = r * 0.04
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath()
  ctx.ellipse(-0.42 * r, -0.38 * r, 0.2 * r, 0.1 * r, -0.7, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.beginPath()
  ctx.arc(-0.2 * r, -0.5 * r, 0.04 * r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** A heart with Cupid's arrow through it. */
export function arrowHeart(ctx: Ctx, x: number, y: number, r: number, flip: boolean, color: string, glow: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(flip ? -1 : 1, 1)
  const shaft = (from: number, to: number) => {
    ctx.strokeStyle = '#f5d08a'
    ctx.lineWidth = r * 0.06
    ctx.beginPath()
    ctx.moveTo(-1.3 * r * from, 0.5 * r * from)
    ctx.lineTo(1.3 * r * to, -0.5 * r * to)
    ctx.stroke()
  }
  ctx.lineCap = 'round'
  shaft(1, 0)
  // Fletching.
  ctx.fillStyle = '#fdf2f8'
  for (const k of [0, 0.12, 0.24]) {
    const bx = -1.3 * r + k * r
    const by = 0.5 * r - k * 0.38 * r
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(bx - 0.12 * r, by - 0.18 * r)
    ctx.lineTo(bx + 0.06 * r, by - 0.05 * r)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(bx + 0.05 * r, by + 0.2 * r)
    ctx.lineTo(bx + 0.1 * r, by + 0.01 * r)
    ctx.closePath()
    ctx.fill()
  }
  glossyHeart(ctx, 0, 0, r * 0.85, 0, color, glow)
  shaft(-0.42, 1)
  ctx.fillStyle = '#e5e7eb'
  ctx.beginPath()
  ctx.moveTo(1.48 * r, -0.57 * r)
  ctx.lineTo(1.18 * r, -0.6 * r)
  ctx.lineTo(1.28 * r, -0.36 * r)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// -- Presidents' Day, Memorial Day, Veterans Day, Juneteenth -------------------------------------------

/** A gold laurel wreath round a blue disc with a white star. */
export function laurel(ctx: Ctx, x: number, y: number, r: number, leaf: string, disc = '#1e3a8a') {
  ctx.save()
  ctx.translate(x, y)
  for (const side of [-1, 1]) {
    for (let k = 0; k < 9; k++) {
      const a = Math.PI / 2 + side * (0.25 + k * 0.29)
      const px = Math.cos(a) * 0.82 * r
      const py = Math.sin(a) * 0.82 * r
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(a + side * (Math.PI / 2 + 0.5))
      shadow(ctx, r * 0.08, r * 0.03, 0.4)
      const g = ctx.createLinearGradient(0, -0.06 * r, 0, 0.06 * r)
      g.addColorStop(0, shade(leaf, 0.45))
      g.addColorStop(1, shade(leaf, -0.35))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(0.13 * r, 0, 0.15 * r, 0.06 * r, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }
  // A ribbon bow tying the two branches.
  ctx.fillStyle = '#b91c1c'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(0, 0.82 * r)
    ctx.lineTo(s * 0.2 * r, 1.1 * r)
    ctx.lineTo(s * 0.08 * r, 1.08 * r)
    ctx.closePath()
    ctx.fill()
  }
  shadow(ctx, r * 0.2, r * 0.06)
  ctx.fillStyle = radial(ctx, 0, 0, 0.62 * r, [shade(disc, 0.45), disc, shade(disc, -0.5)])
  ctx.beginPath()
  ctx.arc(0, 0, 0.6 * r, 0, Math.PI * 2)
  ctx.fill()
  noShadow(ctx)
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = r * 0.05
  ctx.stroke()
  facetStar(ctx, 0, 0.02 * r, 0.42 * r, '#f8fafc')
  ctx.restore()
}

/** A red remembrance poppy on its stem. */
export function poppy(ctx: Ctx, x: number, y: number, r: number, red: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = '#3f6212'
  ctx.lineWidth = r * 0.06
  ctx.beginPath()
  ctx.moveTo(0, 0.2 * r)
  ctx.quadraticCurveTo(0.2 * r, 0.7 * r, 0.05 * r, 1.05 * r)
  ctx.stroke()
  ctx.fillStyle = '#4d7c0f'
  ctx.beginPath()
  ctx.ellipse(0.22 * r, 0.75 * r, 0.22 * r, 0.07 * r, -0.6, 0, Math.PI * 2)
  ctx.fill()
  shadow(ctx, r * 0.25, r * 0.08)
  for (const [a, k] of [[-2.4, 0], [-0.7, 0], [0.75, 0.08], [2.35, 0.08]] as const) {
    const px = Math.cos(a) * 0.36 * r
    const py = Math.sin(a) * 0.36 * r
    ctx.fillStyle = radial(ctx, px, py, 0.55 * r, [shade(red, 0.35 - k), red, shade(red, -0.45 - k)], -Math.cos(a) * 0.6, -Math.sin(a) * 0.6)
    ctx.beginPath()
    ctx.arc(px, py, 0.52 * r, 0, Math.PI * 2)
    ctx.fill()
  }
  noShadow(ctx)
  ctx.strokeStyle = rgba(shade(red, -0.6), 0.5)
  ctx.lineWidth = r * 0.02
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * 0.25 * r, Math.sin(a) * 0.25 * r)
    ctx.quadraticCurveTo(Math.cos(a + 0.2) * 0.55 * r, Math.sin(a + 0.2) * 0.55 * r, Math.cos(a + 0.1) * 0.75 * r, Math.sin(a + 0.1) * 0.75 * r)
    ctx.stroke()
  }
  ctx.fillStyle = '#111111'
  ctx.beginPath()
  ctx.arc(0, 0, 0.22 * r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#3f3f46'
  ctx.lineWidth = r * 0.035
  ctx.beginPath()
  ctx.arc(0, 0, 0.13 * r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#18181b'
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    ctx.beginPath()
    ctx.arc(Math.cos(a) * 0.3 * r, Math.sin(a) * 0.3 * r, 0.035 * r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** A medal: a striped ribbon in a V, and a star hanging from it. */
export function medal(ctx: Ctx, x: number, y: number, r: number, metal: string, stripes = ['#b91c1c', '#ffffff', '#1d4ed8', '#ffffff', '#b91c1c']) {
  ctx.save()
  ctx.translate(x, y)
  shadow(ctx, r * 0.2, r * 0.06)
  for (const s of [-1, 1]) {
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(s * 0.05 * r, -1.0 * r)
    ctx.lineTo(s * 0.5 * r, -1.0 * r)
    ctx.lineTo(s * 0.18 * r, -0.05 * r)
    ctx.lineTo(-s * 0.12 * r, -0.05 * r)
    ctx.closePath()
    ctx.fillStyle = stripes[0]
    ctx.fill()
    ctx.clip()
    noShadow(ctx)
    const w = 0.45 / stripes.length
    stripes.forEach((c, i) => {
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.moveTo(s * (0.05 + i * w) * r, -1.0 * r)
      ctx.lineTo(s * (0.05 + (i + 1) * w) * r, -1.0 * r)
      ctx.lineTo(s * (-0.12 + (i + 1) * w * 0.67) * r, -0.05 * r)
      ctx.lineTo(s * (-0.12 + i * w * 0.67) * r, -0.05 * r)
      ctx.closePath()
      ctx.fill()
    })
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(-r, -1.0 * r, 2 * r, 0.1 * r)
    ctx.restore()
  }
  ctx.fillStyle = shade(metal, -0.2)
  ctx.beginPath()
  ctx.arc(0, -0.02 * r, 0.08 * r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = radial(ctx, 0, 0.45 * r, 0.5 * r, [shade(metal, 0.55), metal, shade(metal, -0.45)])
  ctx.beginPath()
  ctx.arc(0, 0.45 * r, 0.46 * r, 0, Math.PI * 2)
  ctx.fill()
  facetStar(ctx, 0, 0.47 * r, 0.38 * r, shade(metal, 0.15))
  ctx.restore()
}

/** The Juneteenth flag's emblem: a white star inside a bursting nova, on a blue and red medallion. */
export function juneteenthStar(ctx: Ctx, x: number, y: number, r: number, blue = '#1d4ed8', red = '#dc2626') {
  ctx.save()
  ctx.translate(x, y)
  shadow(ctx, r * 0.25, r * 0.08)
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fillStyle = blue
  ctx.fill()
  noShadow(ctx)
  ctx.save()
  ctx.clip()
  ctx.fillStyle = radial(ctx, 0, 0, r, [shade(blue, 0.4), blue, shade(blue, -0.45)])
  ctx.fillRect(-r, -r, 2 * r, 2 * r)
  // The flag's arc: red below a curved horizon.
  ctx.fillStyle = radial(ctx, 0, r, 1.2 * r, [shade(red, 0.25), red, shade(red, -0.4)], 0, -0.5)
  ctx.beginPath()
  ctx.moveTo(-r, 0.3 * r)
  ctx.quadraticCurveTo(0, -0.05 * r, r, 0.15 * r)
  ctx.lineTo(r, r)
  ctx.lineTo(-r, r)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = r * 0.07
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.96, 0, Math.PI * 2)
  ctx.stroke()
  // The nova: a twelve-point burst drawn as an outline.
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = r * 0.05
  ctx.lineJoin = 'miter'
  ctx.beginPath()
  for (let i = 0; i < 24; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 12
    const rr = i % 2 === 0 ? 0.78 * r : 0.5 * r
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = 'rgba(255,255,255,0.8)'
  ctx.shadowBlur = r * 0.2
  star5Path(ctx, 0, 0.03 * r, 0.36 * r)
  ctx.fill()
  ctx.restore()
}

// -- Mardi Gras -----------------------------------------------------------------------------------

function feather(ctx: Ctx, x: number, y: number, len: number, angle: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  const g = ctx.createLinearGradient(0, 0, len, 0)
  g.addColorStop(0, shade(color, -0.3))
  g.addColorStop(0.6, color)
  g.addColorStop(1, shade(color, 0.4))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(len * 0.5, -len * 0.2, len, -len * 0.04)
  ctx.quadraticCurveTo(len * 0.55, len * 0.14, 0, 0)
  ctx.fill()
  ctx.strokeStyle = rgba(shade(color, 0.6), 0.8)
  ctx.lineWidth = len * 0.015
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(len * 0.5, -len * 0.04, len, -len * 0.04)
  ctx.stroke()
  ctx.strokeStyle = rgba(shade(color, -0.4), 0.6)
  for (let i = 1; i < 9; i++) {
    const t = i / 9
    ctx.beginPath()
    ctx.moveTo(len * t, -len * 0.03)
    ctx.lineTo(len * (t + 0.06), -len * (0.09 + 0.05 * Math.sin(t * Math.PI)))
    ctx.moveTo(len * t, -len * 0.02)
    ctx.lineTo(len * (t + 0.06), len * (0.05 * Math.sin(t * Math.PI)))
    ctx.stroke()
  }
  ctx.restore()
}

/** A Mardi Gras mask with feathers and a gold-wrapped stick. */
export function mardiMask(ctx: Ctx, x: number, y: number, r: number, flip: boolean, face: string, gold = '#facc15', plume = '#16a34a') {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(flip ? -1 : 1, 1)
  feather(ctx, -0.65 * r, -0.2 * r, 1.0 * r, -2.2, plume)
  feather(ctx, -0.6 * r, -0.25 * r, 0.95 * r, -1.85, gold)
  feather(ctx, -0.55 * r, -0.25 * r, 0.85 * r, -1.5, face)
  // The stick.
  ctx.strokeStyle = shade(gold, -0.25)
  ctx.lineWidth = r * 0.07
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0.72 * r, 0.18 * r)
  ctx.lineTo(1.1 * r, 1.05 * r)
  ctx.stroke()
  ctx.strokeStyle = '#7e22ce'
  ctx.lineWidth = r * 0.02
  for (let i = 0; i < 6; i++) {
    const t = 0.15 + i * 0.13
    const sx = 0.72 * r + t * 0.38 * r
    const sy = 0.18 * r + t * 0.87 * r
    ctx.beginPath()
    ctx.moveTo(sx - 0.04 * r, sy + 0.02 * r)
    ctx.lineTo(sx + 0.04 * r, sy - 0.03 * r)
    ctx.stroke()
  }
  const mask = new Path2D()
  mask.moveTo(0, -0.1 * r)
  mask.bezierCurveTo(-0.15 * r, -0.32 * r, -0.6 * r, -0.42 * r, -0.85 * r, -0.2 * r)
  mask.bezierCurveTo(-0.95 * r, 0.05 * r, -0.75 * r, 0.3 * r, -0.45 * r, 0.3 * r)
  mask.bezierCurveTo(-0.25 * r, 0.3 * r, -0.12 * r, 0.15 * r, 0, 0.12 * r)
  mask.bezierCurveTo(0.12 * r, 0.15 * r, 0.25 * r, 0.3 * r, 0.45 * r, 0.3 * r)
  mask.bezierCurveTo(0.75 * r, 0.3 * r, 0.95 * r, 0.05 * r, 0.85 * r, -0.2 * r)
  mask.bezierCurveTo(0.6 * r, -0.42 * r, 0.15 * r, -0.32 * r, 0, -0.1 * r)
  shadow(ctx, r * 0.25, r * 0.08)
  ctx.fillStyle = radial(ctx, 0, 0, 0.9 * r, [shade(face, 0.45), face, shade(face, -0.5)], -0.2, -0.5)
  ctx.fill(mask)
  noShadow(ctx)
  // Harlequin diamonds in gold on one cheek.
  ctx.save()
  ctx.clip(mask)
  ctx.fillStyle = rgba(gold, 0.55)
  for (let i = 0; i < 4; i++) {
    const dx = 0.2 * r + i * 0.18 * r
    ctx.beginPath()
    ctx.moveTo(dx, -0.4 * r)
    ctx.lineTo(dx + 0.09 * r, -0.05 * r)
    ctx.lineTo(dx, 0.35 * r)
    ctx.lineTo(dx - 0.09 * r, -0.05 * r)
    ctx.closePath()
    if (i % 2 === 0) ctx.fill()
  }
  ctx.restore()
  ctx.strokeStyle = gold
  ctx.lineWidth = r * 0.05
  ctx.stroke(mask)
  for (const s of [-1, 1]) {
    ctx.save()
    ctx.translate(s * 0.4 * r, 0)
    ctx.rotate(s * 0.18)
    ctx.fillStyle = '#12021f'
    ctx.beginPath()
    ctx.ellipse(0, 0, 0.19 * r, 0.1 * r, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = shade(gold, 0.3)
    ctx.lineWidth = r * 0.03
    ctx.stroke()
    ctx.restore()
  }
  // Glitter along the top edge.
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 9; i++) {
    const t = i / 8
    const gx = -0.8 * r + t * 1.6 * r
    const gy = -0.2 * r - Math.sin(t * Math.PI) * 0.12 * r
    ctx.beginPath()
    ctx.arc(gx, gy, (i % 3 === 0 ? 0.03 : 0.018) * r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** A short swag of shiny beads. */
export function beads(ctx: Ctx, x: number, y: number, r: number, tilt: number, colors: string[]) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  const n = 9
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const bx = (t - 0.5) * 2 * r
    const by = Math.sin(t * Math.PI) * 0.55 * r
    const c = colors[i % colors.length]
    ctx.fillStyle = radial(ctx, bx, by, 0.16 * r, ['#ffffff', shade(c, 0.2), shade(c, -0.45)])
    ctx.beginPath()
    ctx.arc(bx, by, 0.16 * r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// -- St. Patrick's Day ---------------------------------------------------------------------------

/** A three-leaf shamrock on its stem. */
export function shamrock(ctx: Ctx, x: number, y: number, r: number, tilt: number, color: string, withShadow = true) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  ctx.strokeStyle = shade(color, -0.3)
  ctx.lineWidth = r * 0.09
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 0.05 * r)
  ctx.quadraticCurveTo(0.1 * r, 0.55 * r, 0.3 * r, 0.95 * r)
  ctx.stroke()
  for (const a of [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]) {
    ctx.save()
    ctx.rotate(a + Math.PI / 2)
    ctx.translate(0, -0.5 * r)
    if (withShadow) shadow(ctx, r * 0.2, r * 0.06, 0.45)
    ctx.fillStyle = radial(ctx, 0, 0, 0.6 * r, [shade(color, 0.45), color, shade(color, -0.45)], -0.2, -0.3)
    ctx.rotate(Math.PI)
    heartPath(ctx, 0.52 * r)
    ctx.fill()
    noShadow(ctx)
    ctx.strokeStyle = rgba(shade(color, 0.55), 0.7)
    ctx.lineWidth = r * 0.025
    ctx.beginPath()
    ctx.moveTo(0, 0.42 * r)
    ctx.lineTo(0, -0.12 * r)
    ctx.stroke()
    ctx.restore()
  }
  ctx.restore()
}

// -- Easter ---------------------------------------------------------------------------------------

function eggPath(r: number) {
  const p = new Path2D()
  p.moveTo(0, -r)
  p.bezierCurveTo(0.45 * r, -r, 0.75 * r, -0.35 * r, 0.72 * r, 0.2 * r)
  p.bezierCurveTo(0.7 * r, 0.62 * r, 0.38 * r, 0.9 * r, 0, 0.9 * r)
  p.bezierCurveTo(-0.38 * r, 0.9 * r, -0.7 * r, 0.62 * r, -0.72 * r, 0.2 * r)
  p.bezierCurveTo(-0.75 * r, -0.35 * r, -0.45 * r, -r, 0, -r)
  p.closePath()
  return p
}

/** A painted Easter egg: a zigzag band, a stripe and a row of dots, shaded round. */
export function paintedEgg(ctx: Ctx, x: number, y: number, r: number, tilt: number, base: string, band: string, stripe: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  const egg = eggPath(r)
  shadow(ctx, r * 0.3, r * 0.1)
  ctx.fillStyle = base
  ctx.fill(egg)
  noShadow(ctx)
  ctx.save()
  ctx.clip(egg)
  ctx.fillStyle = band
  ctx.beginPath()
  const z = 9
  ctx.moveTo(-r, -0.25 * r)
  for (let i = 0; i <= z; i++) ctx.lineTo(-r + (i * 2 * r) / z, i % 2 ? -0.08 * r : -0.25 * r)
  for (let i = z; i >= 0; i--) ctx.lineTo(-r + (i * 2 * r) / z, i % 2 ? 0.06 * r : -0.11 * r)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = stripe
  ctx.fillRect(-r, 0.3 * r, 2 * r, 0.13 * r)
  ctx.fillStyle = shade(stripe, -0.2)
  ctx.fillRect(-r, 0.5 * r, 2 * r, 0.05 * r)
  ctx.fillStyle = '#ffffff'
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath()
    ctx.arc(i * 0.2 * r, -0.55 * r, 0.055 * r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = band
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath()
    ctx.arc(i * 0.24 * r, 0.7 * r, 0.04 * r, 0, Math.PI * 2)
    ctx.fill()
  }
  // Round: lit from the top left, dark at the bottom right.
  const g = ctx.createRadialGradient(-0.3 * r, -0.5 * r, 0.05 * r, 0, 0, 1.1 * r)
  g.addColorStop(0, 'rgba(255,255,255,0.55)')
  g.addColorStop(0.45, 'rgba(255,255,255,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.35)')
  ctx.fillStyle = g
  ctx.fillRect(-r, -r, 2 * r, 2 * r)
  ctx.restore()
  ctx.restore()
}

/** A small five-petal blossom. */
export function blossom(ctx: Ctx, x: number, y: number, r: number, tilt: number, petal: string, middle = '#facc15') {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  shadow(ctx, r * 0.3, r * 0.1, 0.4)
  for (let i = 0; i < 5; i++) {
    ctx.save()
    ctx.rotate((i * Math.PI * 2) / 5)
    ctx.fillStyle = radial(ctx, 0, -0.5 * r, 0.55 * r, [shade(petal, 0.5), petal, shade(petal, -0.3)], 0, 0.4)
    ctx.beginPath()
    ctx.ellipse(0, -0.5 * r, 0.32 * r, 0.5 * r, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  noShadow(ctx)
  ctx.fillStyle = radial(ctx, 0, 0, 0.25 * r, [shade(middle, 0.5), middle, shade(middle, -0.35)])
  ctx.beginPath()
  ctx.arc(0, 0, 0.24 * r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// -- Earth Day ------------------------------------------------------------------------------------

/** The Earth: blue seas, green land, wisps of cloud and a glow of air round it. */
export function globe(ctx: Ctx, x: number, y: number, r: number, sea: string, land = '#22c55e') {
  ctx.save()
  ctx.translate(x, y)
  ctx.shadowColor = 'rgba(125,211,252,0.9)'
  ctx.shadowBlur = r * 0.35
  ctx.fillStyle = radial(ctx, 0, 0, r, [shade(sea, 0.45), sea, shade(sea, -0.55)])
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  noShadow(ctx)
  ctx.save()
  ctx.clip()
  const lands: Array<Array<[number, number]>> = [
    // The Americas.
    [[-0.62, -0.72], [-0.3, -0.78], [-0.18, -0.5], [-0.35, -0.3], [-0.28, -0.1], [-0.4, 0.05], [-0.25, 0.2], [-0.18, 0.5], [-0.3, 0.85], [-0.45, 0.6], [-0.5, 0.25], [-0.62, 0.05], [-0.75, -0.3]],
    // Europe and Africa.
    [[0.15, -0.75], [0.45, -0.7], [0.5, -0.45], [0.35, -0.35], [0.55, -0.2], [0.62, 0.15], [0.45, 0.45], [0.35, 0.7], [0.22, 0.45], [0.12, 0.1], [0.05, -0.15], [0.2, -0.35], [0.08, -0.55]],
    // A bit of Asia at the edge.
    [[0.7, -0.6], [0.95, -0.4], [1.0, 0], [0.8, -0.1], [0.68, -0.35]],
  ]
  for (const shape of lands) {
    ctx.fillStyle = radial(ctx, -0.2 * r, -0.2 * r, 1.2 * r, [shade(land, 0.35), land, shade(land, -0.45)])
    ctx.beginPath()
    shape.forEach(([px, py], i) => {
      const [nx, ny] = shape[(i + 1) % shape.length]
      if (i === 0) ctx.moveTo(px * r, py * r)
      ctx.quadraticCurveTo(px * r, py * r, ((px + nx) / 2) * r, ((py + ny) / 2) * r)
    })
    ctx.closePath()
    ctx.fill()
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = r * 0.05
  ctx.lineCap = 'round'
  for (const [cx0, cy0, w] of [[-0.1, -0.35, 0.5], [0.3, 0.3, 0.45], [-0.5, 0.45, 0.35]] as const) {
    ctx.beginPath()
    ctx.moveTo(cx0 * r, cy0 * r)
    ctx.quadraticCurveTo((cx0 + w / 2) * r, (cy0 - 0.08) * r, (cx0 + w) * r, cy0 * r)
    ctx.stroke()
  }
  const g = ctx.createRadialGradient(-0.4 * r, -0.45 * r, 0.05 * r, 0, 0, r)
  g.addColorStop(0, 'rgba(255,255,255,0.45)')
  g.addColorStop(0.4, 'rgba(255,255,255,0)')
  g.addColorStop(1, 'rgba(0,0,30,0.4)')
  ctx.fillStyle = g
  ctx.fillRect(-r, -r, 2 * r, 2 * r)
  ctx.restore()
  ctx.strokeStyle = 'rgba(186,230,253,0.7)'
  ctx.lineWidth = r * 0.04
  ctx.beginPath()
  ctx.arc(0, 0, r * 1.02, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** A leaf with its midrib. */
export function leaf(ctx: Ctx, x: number, y: number, r: number, tilt: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  shadow(ctx, r * 0.3, r * 0.1, 0.4)
  const g = ctx.createLinearGradient(0, -0.4 * r, 0, 0.4 * r)
  g.addColorStop(0, shade(color, 0.4))
  g.addColorStop(1, shade(color, -0.4))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(-r, 0)
  ctx.quadraticCurveTo(-0.2 * r, -0.62 * r, r, 0)
  ctx.quadraticCurveTo(-0.2 * r, 0.62 * r, -r, 0)
  ctx.fill()
  noShadow(ctx)
  ctx.strokeStyle = rgba(shade(color, 0.55), 0.85)
  ctx.lineWidth = r * 0.05
  ctx.beginPath()
  ctx.moveTo(-r, 0)
  ctx.lineTo(0.85 * r, 0)
  for (const t of [-0.5, -0.1, 0.3]) {
    ctx.moveTo(t * r, 0)
    ctx.lineTo((t + 0.25) * r, -0.2 * r)
    ctx.moveTo(t * r, 0)
    ctx.lineTo((t + 0.25) * r, 0.2 * r)
  }
  ctx.stroke()
  ctx.restore()
}

// -- Cinco de Mayo -------------------------------------------------------------------------------

/** A painted maraca leaning by tilt. */
export function maraca(ctx: Ctx, x: number, y: number, r: number, tilt: number, colors: string[]) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  const wood = ctx.createLinearGradient(-0.07 * r, 0, 0.07 * r, 0)
  wood.addColorStop(0, '#78350f')
  wood.addColorStop(0.5, '#d97706')
  wood.addColorStop(1, '#78350f')
  ctx.fillStyle = wood
  shadow(ctx, r * 0.2, r * 0.06)
  ctx.beginPath()
  ctx.moveTo(-0.06 * r, 0.1 * r)
  ctx.lineTo(-0.09 * r, 0.95 * r)
  ctx.quadraticCurveTo(0, 1.02 * r, 0.09 * r, 0.95 * r)
  ctx.lineTo(0.06 * r, 0.1 * r)
  ctx.closePath()
  ctx.fill()
  const head = new Path2D()
  head.ellipse(0, -0.32 * r, 0.42 * r, 0.52 * r, 0, 0, Math.PI * 2)
  ctx.fillStyle = colors[0]
  ctx.fill(head)
  noShadow(ctx)
  ctx.save()
  ctx.clip(head)
  const bands = [colors[1], colors[2], colors[3] ?? colors[1]]
  bands.forEach((c, i) => {
    const by = -0.62 * r + i * 0.3 * r
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.moveTo(-0.5 * r, by)
    for (let k = 0; k <= 8; k++) ctx.lineTo(-0.5 * r + k * 0.125 * r, by + (k % 2 ? 0.07 : -0.07) * r)
    ctx.lineTo(0.5 * r, by + 0.12 * r)
    for (let k = 8; k >= 0; k--) ctx.lineTo(-0.5 * r + k * 0.125 * r, by + 0.12 * r + (k % 2 ? 0.07 : -0.07) * r)
    ctx.closePath()
    ctx.fill()
  })
  ctx.fillStyle = '#ffffff'
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath()
    ctx.arc(k * 0.15 * r, -0.03 * r, 0.035 * r, 0, Math.PI * 2)
    ctx.fill()
  }
  const g = ctx.createRadialGradient(-0.15 * r, -0.55 * r, 0.03 * r, 0, -0.32 * r, 0.6 * r)
  g.addColorStop(0, 'rgba(255,255,255,0.6)')
  g.addColorStop(0.5, 'rgba(255,255,255,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.35)')
  ctx.fillStyle = g
  ctx.fillRect(-r, -r, 2 * r, 2 * r)
  ctx.restore()
  ctx.restore()
}

/** A few pieces of confetti tumbling round a point. */
export function confetti(ctx: Ctx, x: number, y: number, r: number, colors: string[], seed: number) {
  ctx.save()
  const spots: Array<[number, number, number]> = [[0, 0, 0.4], [1.1, -0.6, -0.8], [-1.0, 0.5, 1.2], [0.7, 1.0, 2.1], [-0.6, -1.1, -1.6]]
  spots.forEach(([dx, dy, a], i) => {
    const c = colors[(i + seed) % colors.length]
    ctx.save()
    ctx.translate(x + dx * r, y + dy * r)
    ctx.rotate(a + seed)
    ctx.shadowColor = rgba(c, 0.8)
    ctx.shadowBlur = r * 0.4
    ctx.fillStyle = c
    ctx.fillRect(-0.45 * r, -0.2 * r, 0.9 * r, 0.4 * r)
    ctx.shadowBlur = 0
    ctx.fillStyle = rgba(shade(c, -0.35), 0.9)
    ctx.fillRect(0.05 * r, -0.2 * r, 0.4 * r, 0.4 * r)
    ctx.restore()
  })
  ctx.restore()
}

// -- Mother's Day ----------------------------------------------------------------------------------

/** An open rose with two leaves, its petals curling round a tight centre. */
export function rose(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  for (const s of [-1, 1]) {
    ctx.save()
    ctx.translate(s * 0.55 * r, 0.45 * r)
    ctx.rotate(s * 0.5)
    const g = ctx.createLinearGradient(0, -0.2 * r, 0, 0.2 * r)
    g.addColorStop(0, '#4ade80')
    g.addColorStop(1, '#166534')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(-0.4 * r, 0)
    ctx.quadraticCurveTo(0, -0.28 * r, 0.4 * r, 0)
    ctx.quadraticCurveTo(0, 0.28 * r, -0.4 * r, 0)
    ctx.fill()
    ctx.restore()
  }
  shadow(ctx, r * 0.3, r * 0.1)
  for (const [ring, n, k] of [[1, 6, -0.25], [0.72, 5, -0.1], [0.48, 4, 0.08]] as const) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 1.3
      const px = Math.cos(a) * 0.36 * r * ring
      const py = Math.sin(a) * 0.3 * r * ring
      ctx.fillStyle = radial(ctx, px, py, 0.5 * r * ring, [shade(color, 0.35 + k), shade(color, k), shade(color, -0.45 + k)], -Math.cos(a) * 0.5, -Math.sin(a) * 0.5)
      ctx.beginPath()
      ctx.ellipse(px, py, 0.42 * r * ring, 0.32 * r * ring, a, 0, Math.PI * 2)
      ctx.fill()
    }
    noShadow(ctx)
  }
  // The tight centre, a curl.
  ctx.strokeStyle = shade(color, -0.55)
  ctx.lineWidth = r * 0.035
  ctx.beginPath()
  for (let t = 0; t < 14; t++) {
    const a = t * 0.55
    const rr = 0.02 * r + t * 0.014 * r
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.85)
  }
  ctx.stroke()
  ctx.restore()
}

// -- Father's Day ----------------------------------------------------------------------------------

/** A striped necktie under a white collar. */
export function necktie(ctx: Ctx, x: number, y: number, r: number, color: string, stripe: string) {
  ctx.save()
  ctx.translate(x, y)
  shadow(ctx, r * 0.25, r * 0.08)
  ctx.fillStyle = '#f8fafc'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(0, -0.95 * r)
    ctx.lineTo(s * 0.5 * r, -1.0 * r)
    ctx.lineTo(s * 0.32 * r, -0.62 * r)
    ctx.closePath()
    ctx.fill()
  }
  const blade = new Path2D()
  blade.moveTo(-0.12 * r, -0.72 * r)
  blade.lineTo(0.12 * r, -0.72 * r)
  blade.lineTo(0.32 * r, 0.6 * r)
  blade.lineTo(0, 0.95 * r)
  blade.lineTo(-0.32 * r, 0.6 * r)
  blade.closePath()
  const g = ctx.createLinearGradient(-0.3 * r, 0, 0.3 * r, 0)
  g.addColorStop(0, shade(color, -0.35))
  g.addColorStop(0.45, shade(color, 0.2))
  g.addColorStop(1, shade(color, -0.45))
  ctx.fillStyle = g
  ctx.fill(blade)
  noShadow(ctx)
  ctx.save()
  ctx.clip(blade)
  ctx.strokeStyle = stripe
  ctx.lineWidth = r * 0.07
  for (let i = -6; i < 8; i++) {
    ctx.beginPath()
    ctx.moveTo(-0.5 * r, i * 0.22 * r)
    ctx.lineTo(0.5 * r, i * 0.22 * r - 0.35 * r)
    ctx.stroke()
  }
  ctx.restore()
  ctx.fillStyle = shade(color, -0.15)
  ctx.beginPath()
  ctx.moveTo(-0.18 * r, -0.98 * r)
  ctx.lineTo(0.18 * r, -0.98 * r)
  ctx.lineTo(0.12 * r, -0.7 * r)
  ctx.lineTo(-0.12 * r, -0.7 * r)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = r * 0.02
  ctx.stroke()
  ctx.restore()
}

/** A bow tie. */
export function bowTie(ctx: Ctx, x: number, y: number, r: number, color: string, dots: string) {
  ctx.save()
  ctx.translate(x, y)
  shadow(ctx, r * 0.25, r * 0.08)
  for (const s of [-1, 1]) {
    ctx.fillStyle = radial(ctx, s * 0.5 * r, 0, 0.7 * r, [shade(color, 0.3), color, shade(color, -0.45)], -s * 0.3, -0.3)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(s * 0.4 * r, -0.65 * r, s * 0.95 * r, -0.45 * r)
    ctx.quadraticCurveTo(s * 1.05 * r, 0, s * 0.95 * r, 0.45 * r)
    ctx.quadraticCurveTo(s * 0.4 * r, 0.65 * r, 0, 0)
    ctx.fill()
  }
  noShadow(ctx)
  ctx.fillStyle = dots
  for (const [dx, dy] of [[-0.5, -0.15], [-0.7, 0.2], [0.5, -0.15], [0.7, 0.2], [-0.35, 0.25], [0.35, 0.25]] as const) {
    ctx.beginPath()
    ctx.arc(dx * r, dy * r, 0.06 * r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = shade(color, -0.2)
  ctx.beginPath()
  ctx.ellipse(0, 0, 0.17 * r, 0.25 * r, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// -- Labor Day -----------------------------------------------------------------------------------

/** A steel gear with a hammer and a wrench crossed in front. */
export function gearAndTools(ctx: Ctx, x: number, y: number, r: number, steel: string) {
  ctx.save()
  ctx.translate(x, y)
  shadow(ctx, r * 0.25, r * 0.08)
  ctx.beginPath()
  const teeth = 10
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2
    const rr = i % 4 < 2 ? r : 0.8 * r
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fillStyle = radial(ctx, 0, 0, r, [shade(steel, 0.55), steel, shade(steel, -0.55)])
  ctx.fill()
  noShadow(ctx)
  ctx.fillStyle = shade(steel, -0.6)
  ctx.beginPath()
  ctx.arc(0, 0, 0.3 * r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = shade(steel, 0.4)
  ctx.lineWidth = r * 0.04
  ctx.beginPath()
  ctx.arc(0, 0, 0.62 * r, 0, Math.PI * 2)
  ctx.stroke()
  // The hammer, leaning one way.
  ctx.save()
  ctx.rotate(-0.75)
  shadow(ctx, r * 0.2, r * 0.06)
  const wood = ctx.createLinearGradient(-0.07 * r, 0, 0.07 * r, 0)
  wood.addColorStop(0, '#78350f')
  wood.addColorStop(0.5, '#d97706')
  wood.addColorStop(1, '#78350f')
  ctx.fillStyle = wood
  ctx.fillRect(-0.06 * r, -0.6 * r, 0.12 * r, 1.45 * r)
  const head = ctx.createLinearGradient(0, -0.85 * r, 0, -0.55 * r)
  head.addColorStop(0, '#e2e8f0')
  head.addColorStop(1, '#475569')
  ctx.fillStyle = head
  ctx.fillRect(-0.32 * r, -0.85 * r, 0.64 * r, 0.26 * r)
  ctx.beginPath()
  ctx.moveTo(0.32 * r, -0.85 * r)
  ctx.quadraticCurveTo(0.5 * r, -0.8 * r, 0.52 * r, -0.62 * r)
  ctx.lineTo(0.32 * r, -0.59 * r)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  // The wrench, leaning the other.
  ctx.save()
  ctx.rotate(0.75)
  shadow(ctx, r * 0.2, r * 0.06)
  const metal = ctx.createLinearGradient(-0.08 * r, 0, 0.08 * r, 0)
  metal.addColorStop(0, '#64748b')
  metal.addColorStop(0.5, '#f1f5f9')
  metal.addColorStop(1, '#64748b')
  ctx.fillStyle = metal
  ctx.fillRect(-0.07 * r, -0.55 * r, 0.14 * r, 1.25 * r)
  for (const end of [-0.72, 0.85]) {
    ctx.beginPath()
    ctx.arc(0, end * r, 0.2 * r, 0, Math.PI * 2)
    ctx.fill()
  }
  noShadow(ctx)
  ctx.restore()
  // The jaws' open mouths.
  ctx.save()
  ctx.rotate(0.75)
  ctx.fillStyle = shade(steel, -0.65)
  ctx.fillRect(-0.07 * r, -0.95 * r, 0.14 * r, 0.22 * r)
  ctx.beginPath()
  ctx.arc(0, 0.85 * r, 0.08 * r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.restore()
}

/** A yellow hard hat. */
export function hardHat(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  shadow(ctx, r * 0.25, r * 0.08)
  ctx.fillStyle = radial(ctx, 0, -0.1 * r, 0.9 * r, [shade(color, 0.5), color, shade(color, -0.45)], -0.3, -0.5)
  ctx.beginPath()
  ctx.ellipse(0, 0.25 * r, 1.0 * r, 0.16 * r, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-0.75 * r, 0.22 * r)
  ctx.bezierCurveTo(-0.78 * r, -0.62 * r, 0.78 * r, -0.62 * r, 0.75 * r, 0.22 * r)
  ctx.closePath()
  ctx.fill()
  noShadow(ctx)
  ctx.fillStyle = shade(color, 0.3)
  ctx.beginPath()
  ctx.moveTo(-0.1 * r, -0.42 * r)
  ctx.lineTo(0.1 * r, -0.42 * r)
  ctx.lineTo(0.12 * r, 0.2 * r)
  ctx.lineTo(-0.12 * r, 0.2 * r)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// -- Thanksgiving ---------------------------------------------------------------------------------

const MAPLE: Array<[number, number]> = [
  [0, -1], [0.16, -0.66], [0.42, -0.8], [0.34, -0.42], [0.86, -0.58], [0.7, -0.26], [0.96, -0.06], [0.52, 0.1],
  [0.6, 0.34], [0.18, 0.24], [0.06, 0.52],
]

/** A maple leaf in autumn colours. */
export function mapleLeaf(ctx: Ctx, x: number, y: number, r: number, tilt: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  const pts = [...MAPLE, ...MAPLE.slice(1).reverse().map(([px, py]) => [-px, py] as [number, number])]
  shadow(ctx, r * 0.25, r * 0.08, 0.45)
  ctx.fillStyle = radial(ctx, 0, -0.1 * r, 1.1 * r, [shade(color, 0.4), color, shade(color, -0.45)], -0.2, -0.3)
  ctx.beginPath()
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px * r, py * r) : ctx.moveTo(px * r, py * r)))
  ctx.closePath()
  ctx.fill()
  noShadow(ctx)
  ctx.strokeStyle = rgba(shade(color, -0.5), 0.8)
  ctx.lineWidth = r * 0.04
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 0.95 * r)
  ctx.lineTo(0, 0.3 * r)
  for (const [px, py] of [[0, -0.9], [0.8, -0.5], [-0.8, -0.5], [0.55, 0.3], [-0.55, 0.3]] as const) {
    ctx.moveTo(0, 0.3 * r)
    ctx.lineTo(px * r * 0.9, py * r * 0.9)
  }
  ctx.stroke()
  ctx.restore()
}

/** An acorn in its cap. */
export function acorn(ctx: Ctx, x: number, y: number, r: number, tilt: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  shadow(ctx, r * 0.25, r * 0.08)
  ctx.fillStyle = radial(ctx, 0, 0.2 * r, 0.6 * r, ['#f2c879', '#b7791f', '#6b3e0e'])
  ctx.beginPath()
  ctx.ellipse(0, 0.2 * r, 0.45 * r, 0.6 * r, 0, 0, Math.PI)
  ctx.lineTo(-0.45 * r, 0.1 * r)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#e9b866'
  ctx.beginPath()
  ctx.moveTo(-0.05 * r, 0.75 * r)
  ctx.lineTo(0, 0.88 * r)
  ctx.lineTo(0.05 * r, 0.75 * r)
  ctx.fill()
  ctx.fillStyle = radial(ctx, 0, -0.05 * r, 0.6 * r, ['#a16207', '#713f12', '#3b1f07'])
  ctx.beginPath()
  ctx.ellipse(0, 0.08 * r, 0.55 * r, 0.38 * r, 0, Math.PI, Math.PI * 2)
  ctx.lineTo(0.55 * r, 0.14 * r)
  ctx.quadraticCurveTo(0, 0.24 * r, -0.55 * r, 0.14 * r)
  ctx.closePath()
  ctx.fill()
  noShadow(ctx)
  ctx.strokeStyle = 'rgba(30,15,3,0.6)'
  ctx.lineWidth = r * 0.025
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath()
    ctx.moveTo(i * 0.12 * r, -0.25 * r)
    ctx.lineTo(i * 0.12 * r + 0.12 * r, 0.16 * r)
    ctx.moveTo(i * 0.12 * r, 0.16 * r)
    ctx.lineTo(i * 0.12 * r + 0.12 * r, -0.25 * r)
    ctx.stroke()
  }
  ctx.strokeStyle = '#3b1f07'
  ctx.lineWidth = r * 0.08
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, -0.3 * r)
  ctx.quadraticCurveTo(0.05 * r, -0.5 * r, 0.18 * r, -0.55 * r)
  ctx.stroke()
  ctx.restore()
}

// -- Diwali --------------------------------------------------------------------------------------

/** A clay diya with a painted rim and a flame burning at its spout. */
export function diya(ctx: Ctx, x: number, y: number, r: number, clay: string, glow: string) {
  ctx.save()
  ctx.translate(x, y)
  // The flame and its glow.
  ctx.save()
  ctx.shadowColor = glow
  ctx.shadowBlur = r * 0.9
  const flame = ctx.createRadialGradient(0.55 * r, -0.25 * r, 0.02 * r, 0.55 * r, -0.4 * r, 0.5 * r)
  flame.addColorStop(0, '#ffffff')
  flame.addColorStop(0.3, '#fff3b0')
  flame.addColorStop(0.65, '#fbbf24')
  flame.addColorStop(1, 'rgba(234,88,12,0.2)')
  ctx.fillStyle = flame
  ctx.beginPath()
  ctx.moveTo(0.55 * r, -1.0 * r)
  ctx.bezierCurveTo(0.68 * r, -0.6 * r, 0.8 * r, -0.3 * r, 0.55 * r, -0.12 * r)
  ctx.bezierCurveTo(0.3 * r, -0.3 * r, 0.42 * r, -0.6 * r, 0.55 * r, -1.0 * r)
  ctx.fill()
  ctx.restore()
  shadow(ctx, r * 0.25, r * 0.08)
  const bowl = new Path2D()
  bowl.moveTo(-0.8 * r, -0.05 * r)
  bowl.quadraticCurveTo(-0.75 * r, 0.6 * r, 0, 0.6 * r)
  bowl.quadraticCurveTo(0.45 * r, 0.6 * r, 0.62 * r, 0.15 * r)
  bowl.lineTo(0.85 * r, -0.12 * r)
  bowl.quadraticCurveTo(0.4 * r, -0.08 * r, 0, -0.05 * r)
  bowl.closePath()
  ctx.fillStyle = radial(ctx, -0.1 * r, 0.1 * r, 0.9 * r, [shade(clay, 0.4), clay, shade(clay, -0.55)], -0.2, -0.4)
  ctx.fill(bowl)
  noShadow(ctx)
  ctx.fillStyle = '#3b1503'
  ctx.beginPath()
  ctx.ellipse(-0.05 * r, -0.05 * r, 0.72 * r, 0.12 * r, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = rgba('#fbbf24', 0.5)
  ctx.beginPath()
  ctx.ellipse(-0.05 * r, -0.05 * r, 0.6 * r, 0.07 * r, 0, 0, Math.PI * 2)
  ctx.fill()
  // A painted band of dots and petals round the bowl.
  ctx.save()
  ctx.clip(bowl)
  ctx.fillStyle = '#fde68a'
  for (let i = 0; i < 9; i++) {
    const t = i / 8
    const px = -0.65 * r + t * 1.15 * r
    const py = 0.22 * r + Math.sin(t * Math.PI) * 0.08 * r
    ctx.beginPath()
    ctx.arc(px, py, 0.04 * r, 0, Math.PI * 2)
    ctx.fill()
    if (i % 2 === 0) {
      ctx.beginPath()
      ctx.moveTo(px, py + 0.08 * r)
      ctx.lineTo(px + 0.06 * r, py + 0.2 * r)
      ctx.lineTo(px - 0.06 * r, py + 0.2 * r)
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.restore()
  ctx.strokeStyle = '#1c0a01'
  ctx.lineWidth = r * 0.04
  ctx.beginPath()
  ctx.moveTo(0.5 * r, -0.08 * r)
  ctx.lineTo(0.56 * r, -0.16 * r)
  ctx.stroke()
  ctx.restore()
}

// -- Hanukkah -------------------------------------------------------------------------------------

/** The Star of David: two interlaced triangles, silver with a blue edge. */
export function starOfDavid(ctx: Ctx, x: number, y: number, r: number, color: string, glow?: string) {
  ctx.save()
  ctx.translate(x, y)
  if (glow) {
    ctx.shadowColor = glow
    ctx.shadowBlur = r * 0.4
  }
  ctx.lineWidth = r * 0.16
  ctx.lineJoin = 'miter'
  for (const rot of [-Math.PI / 2, Math.PI / 2]) {
    const g = ctx.createLinearGradient(-r, -r, r, r)
    g.addColorStop(0, shade(color, 0.6))
    g.addColorStop(0.5, color)
    g.addColorStop(1, shade(color, -0.4))
    ctx.strokeStyle = g
    ctx.beginPath()
    for (let i = 0; i < 3; i++) {
      const a = rot + (i * Math.PI * 2) / 3
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.stroke()
  }
  ctx.restore()
}

/** A dreidel spinning on its point, the Star of David on its front face. */
export function dreidel(ctx: Ctx, x: number, y: number, r: number, tilt: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  shadow(ctx, r * 0.25, r * 0.08)
  // Handle.
  const h = ctx.createLinearGradient(-0.1 * r, 0, 0.1 * r, 0)
  h.addColorStop(0, shade(color, -0.4))
  h.addColorStop(0.5, shade(color, 0.5))
  h.addColorStop(1, shade(color, -0.5))
  ctx.fillStyle = h
  ctx.fillRect(-0.09 * r, -1.0 * r, 0.18 * r, 0.35 * r)
  // Front face and side face of the box.
  ctx.fillStyle = radial(ctx, -0.1 * r, -0.3 * r, 0.8 * r, [shade(color, 0.5), color, shade(color, -0.3)])
  ctx.beginPath()
  ctx.moveTo(-0.5 * r, -0.62 * r)
  ctx.lineTo(0.2 * r, -0.62 * r)
  ctx.lineTo(0.2 * r, 0.15 * r)
  ctx.lineTo(-0.5 * r, 0.15 * r)
  ctx.closePath()
  ctx.fill()
  noShadow(ctx)
  ctx.fillStyle = shade(color, -0.4)
  ctx.beginPath()
  ctx.moveTo(0.2 * r, -0.62 * r)
  ctx.lineTo(0.5 * r, -0.75 * r)
  ctx.lineTo(0.5 * r, 0.02 * r)
  ctx.lineTo(0.2 * r, 0.15 * r)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = shade(color, 0.3)
  ctx.beginPath()
  ctx.moveTo(-0.5 * r, -0.62 * r)
  ctx.lineTo(-0.2 * r, -0.75 * r)
  ctx.lineTo(0.5 * r, -0.75 * r)
  ctx.lineTo(0.2 * r, -0.62 * r)
  ctx.closePath()
  ctx.fill()
  // The point.
  ctx.fillStyle = shade(color, -0.15)
  ctx.beginPath()
  ctx.moveTo(-0.5 * r, 0.15 * r)
  ctx.lineTo(0.2 * r, 0.15 * r)
  ctx.lineTo(-0.1 * r, 0.95 * r)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = shade(color, -0.55)
  ctx.beginPath()
  ctx.moveTo(0.2 * r, 0.15 * r)
  ctx.lineTo(0.5 * r, 0.02 * r)
  ctx.lineTo(-0.1 * r, 0.95 * r)
  ctx.closePath()
  ctx.fill()
  starOfDavid(ctx, -0.15 * r, -0.24 * r, 0.24 * r, '#f1f5f9')
  ctx.restore()
}

// -- Kwanzaa --------------------------------------------------------------------------------------

/** A kinara: three red candles, the black one in the middle, three green, all lit. */
export function kinara(ctx: Ctx, x: number, y: number, r: number, glow: string) {
  ctx.save()
  ctx.translate(x, y)
  const colors = ['#b91c1c', '#b91c1c', '#b91c1c', '#111111', '#15803d', '#15803d', '#15803d']
  const wood = ctx.createLinearGradient(0, 0.35 * r, 0, 0.7 * r)
  wood.addColorStop(0, '#a16207')
  wood.addColorStop(0.5, '#713f12')
  wood.addColorStop(1, '#3b1f07')
  shadow(ctx, r * 0.25, r * 0.08)
  ctx.fillStyle = wood
  ctx.beginPath()
  ctx.moveTo(-1.0 * r, 0.38 * r)
  ctx.lineTo(1.0 * r, 0.38 * r)
  ctx.lineTo(0.85 * r, 0.62 * r)
  ctx.lineTo(-0.85 * r, 0.62 * r)
  ctx.closePath()
  ctx.fill()
  noShadow(ctx)
  ctx.fillStyle = '#facc15'
  for (let i = -6; i <= 6; i++) {
    ctx.beginPath()
    ctx.arc(i * 0.13 * r, 0.5 * r, 0.025 * r, 0, Math.PI * 2)
    ctx.fill()
  }
  colors.forEach((c, i) => {
    const cx = (i - 3) * 0.27 * r
    const top = -0.25 * r - (3 - Math.abs(i - 3)) * 0.06 * r
    ctx.fillStyle = '#854d0e'
    ctx.fillRect(cx - 0.09 * r, 0.26 * r, 0.18 * r, 0.12 * r)
    const g = ctx.createLinearGradient(cx - 0.07 * r, 0, cx + 0.07 * r, 0)
    g.addColorStop(0, shade(c, c === '#111111' ? 0.25 : -0.3))
    g.addColorStop(0.45, shade(c, c === '#111111' ? 0.4 : 0.3))
    g.addColorStop(1, shade(c, -0.45))
    ctx.fillStyle = g
    ctx.fillRect(cx - 0.07 * r, top, 0.14 * r, 0.26 * r - top)
    ctx.save()
    ctx.shadowColor = glow
    ctx.shadowBlur = r * 0.3
    const f = ctx.createRadialGradient(cx, top - 0.1 * r, 0.01 * r, cx, top - 0.12 * r, 0.16 * r)
    f.addColorStop(0, '#ffffff')
    f.addColorStop(0.4, '#fde68a')
    f.addColorStop(1, 'rgba(249,115,22,0.3)')
    ctx.fillStyle = f
    ctx.beginPath()
    ctx.moveTo(cx, top - 0.3 * r)
    ctx.quadraticCurveTo(cx + 0.09 * r, top - 0.08 * r, cx, top - 0.02 * r)
    ctx.quadraticCurveTo(cx - 0.09 * r, top - 0.08 * r, cx, top - 0.3 * r)
    ctx.fill()
    ctx.restore()
  })
  ctx.restore()
}

/** An ear of corn in its husk (muhindi). */
export function earOfCorn(ctx: Ctx, x: number, y: number, r: number, tilt: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  shadow(ctx, r * 0.25, r * 0.08)
  const ear = new Path2D()
  ear.ellipse(0, -0.15 * r, 0.32 * r, 0.8 * r, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#eab308'
  ctx.fill(ear)
  noShadow(ctx)
  ctx.save()
  ctx.clip(ear)
  for (let row = -8; row <= 6; row++) {
    for (let col = -2; col <= 2; col++) {
      const kx = col * 0.13 * r + (row % 2 ? 0.065 * r : 0)
      const ky = row * 0.1 * r
      ctx.fillStyle = radial(ctx, kx, ky, 0.07 * r, ['#fef9c3', '#facc15', '#a16207'])
      ctx.beginPath()
      ctx.ellipse(kx, ky, 0.06 * r, 0.05 * r, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
  for (const s of [-1, 1]) {
    const g = ctx.createLinearGradient(s * 0.5 * r, 0, 0, 0)
    g.addColorStop(0, '#65a30d')
    g.addColorStop(1, '#bef264')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(0, 0.95 * r)
    ctx.quadraticCurveTo(s * 0.6 * r, 0.3 * r, s * 0.3 * r, -0.75 * r)
    ctx.quadraticCurveTo(s * 0.3 * r, 0.2 * r, 0, 0.95 * r)
    ctx.fill()
  }
  ctx.restore()
}

// -- Birthdays ------------------------------------------------------------------------------------

/** One shiny balloon on a curling string. */
export function balloon(ctx: Ctx, x: number, y: number, r: number, color: string, tie: [number, number]) {
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'
  ctx.lineWidth = r * 0.03
  ctx.beginPath()
  ctx.moveTo(x, y + 0.55 * r)
  ctx.bezierCurveTo(x + 0.2 * r, y + 0.9 * r, tie[0] - 0.2 * r, tie[1] - 0.4 * r, tie[0], tie[1])
  ctx.stroke()
  shadow(ctx, r * 0.3, r * 0.1)
  ctx.fillStyle = radial(ctx, x, y, 0.6 * r, [shade(color, 0.6), color, shade(color, -0.45)])
  ctx.beginPath()
  ctx.moveTo(x, y + 0.5 * r)
  ctx.bezierCurveTo(x - 0.6 * r, y + 0.25 * r, x - 0.48 * r, y - 0.55 * r, x, y - 0.55 * r)
  ctx.bezierCurveTo(x + 0.48 * r, y - 0.55 * r, x + 0.6 * r, y + 0.25 * r, x, y + 0.5 * r)
  ctx.fill()
  noShadow(ctx)
  ctx.fillStyle = shade(color, -0.25)
  ctx.beginPath()
  ctx.moveTo(x, y + 0.48 * r)
  ctx.lineTo(x - 0.07 * r, y + 0.6 * r)
  ctx.lineTo(x + 0.07 * r, y + 0.6 * r)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.beginPath()
  ctx.ellipse(x - 0.18 * r, y - 0.22 * r, 0.08 * r, 0.16 * r, 0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** Three balloons tied together with a bow. */
export function balloonBunch(ctx: Ctx, x: number, y: number, r: number, colors: string[]) {
  const tie: [number, number] = [x, y + 1.0 * r]
  balloon(ctx, x - 0.48 * r, y - 0.25 * r, 0.75 * r, colors[0], tie)
  balloon(ctx, x + 0.5 * r, y - 0.2 * r, 0.72 * r, colors[1], tie)
  balloon(ctx, x, y - 0.6 * r, 0.8 * r, colors[2], tie)
  ctx.save()
  ctx.fillStyle = colors[3] ?? colors[0]
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(tie[0], tie[1])
    ctx.lineTo(tie[0] + s * 0.16 * r, tie[1] - 0.08 * r)
    ctx.lineTo(tie[0] + s * 0.16 * r, tie[1] + 0.08 * r)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

/** A cupcake with swirled frosting, sprinkles and a lit candle. */
export function cupcake(ctx: Ctx, x: number, y: number, r: number, frosting: string, wrapper: string, glow: string) {
  ctx.save()
  ctx.translate(x, y)
  shadow(ctx, r * 0.25, r * 0.08)
  ctx.fillStyle = wrapper
  ctx.beginPath()
  ctx.moveTo(-0.6 * r, 0.05 * r)
  ctx.lineTo(0.6 * r, 0.05 * r)
  ctx.lineTo(0.42 * r, 0.8 * r)
  ctx.lineTo(-0.42 * r, 0.8 * r)
  ctx.closePath()
  ctx.fill()
  noShadow(ctx)
  ctx.strokeStyle = shade(wrapper, -0.35)
  ctx.lineWidth = r * 0.03
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath()
    ctx.moveTo(i * 0.14 * r, 0.06 * r)
    ctx.lineTo(i * 0.1 * r, 0.8 * r)
    ctx.stroke()
  }
  for (const [cy, w] of [[0.0, 0.7], [-0.22, 0.55], [-0.42, 0.36]] as const) {
    ctx.fillStyle = radial(ctx, 0, cy * r, w * r, [shade(frosting, 0.55), frosting, shade(frosting, -0.35)], -0.3, -0.5)
    ctx.beginPath()
    ctx.ellipse(0, cy * r, w * r, 0.18 * r, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  const sprinkles = ['#f43f5e', '#38bdf8', '#facc15', '#a78bfa', '#34d399']
  for (let i = 0; i < 12; i++) {
    const a = i * 2.4
    const sx = Math.cos(a) * 0.45 * r * ((i % 3) / 3 + 0.3)
    const sy = -0.2 * r + Math.sin(a) * 0.15 * r
    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(a)
    ctx.fillStyle = sprinkles[i % sprinkles.length]
    ctx.fillRect(-0.05 * r, -0.015 * r, 0.1 * r, 0.03 * r)
    ctx.restore()
  }
  ctx.fillStyle = '#f9a8d4'
  ctx.fillRect(-0.04 * r, -0.85 * r, 0.08 * r, 0.32 * r)
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 3; i++) ctx.fillRect(-0.04 * r, -0.8 * r + i * 0.1 * r, 0.08 * r, 0.03 * r)
  ctx.save()
  ctx.shadowColor = glow
  ctx.shadowBlur = r * 0.4
  ctx.fillStyle = '#fde68a'
  ctx.beginPath()
  ctx.moveTo(0, -1.1 * r)
  ctx.quadraticCurveTo(0.08 * r, -0.92 * r, 0, -0.86 * r)
  ctx.quadraticCurveTo(-0.08 * r, -0.92 * r, 0, -1.1 * r)
  ctx.fill()
  ctx.restore()
  ctx.restore()
}

/** A faceted star trailing streaks of light: a big day is coming. */
export function shootingStar(ctx: Ctx, x: number, y: number, r: number, flip: boolean, color: string, glow: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(flip ? -1 : 1, 1)
  ctx.lineCap = 'round'
  for (const [dy, w, len] of [[-0.25, 0.08, 1.4], [0, 0.11, 1.8], [0.25, 0.08, 1.3]] as const) {
    const g = ctx.createLinearGradient(-0.2 * r, 0, -len * r, 0)
    g.addColorStop(0, rgba(glow, 0.9))
    g.addColorStop(1, rgba(glow, 0))
    ctx.strokeStyle = g
    ctx.lineWidth = w * r
    ctx.beginPath()
    ctx.moveTo(-0.2 * r, dy * r)
    ctx.quadraticCurveTo(-0.8 * r, dy * r + 0.15 * r, -len * r, dy * r + 0.35 * r)
    ctx.stroke()
  }
  facetStar(ctx, 0, 0, 0.62 * r, color, rgba(glow, 0.9))
  ctx.restore()
}
