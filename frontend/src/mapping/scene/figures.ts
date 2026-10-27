/**
 * Little helpers for painting people (and the rounded boxes, limbs and dots
 * everything is made of) shared by the holiday sprite files.
 */

import { circle, ellipse, rgba, shade, type Ctx } from './sprites'

export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

/** An arm (or leg) through the points given as x, y, x, y…; returns the last point. */
export function arm(ctx: Ctx, pts: number[], width: number, color: string) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(pts[0], pts[1])
  for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1])
  ctx.stroke()
  return [pts[pts.length - 2], pts[pts.length - 1]] as const
}

export function dot(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color
  circle(ctx, x, y, r)
  ctx.fill()
}

/** A face turned a little towards dir (1 right, -1 left): smile 0 to 1, open for a mouth wide open, blink shut. */
export function head(ctx: Ctx, x: number, y: number, r: number, skin: string, dir: number, o: { open?: number; blink?: boolean; puff?: boolean } = {}) {
  ctx.fillStyle = skin
  circle(ctx, x, y, r)
  ctx.fill()
  if (o.puff) {
    // Cheeks blown out (blowing a horn or a clarinet).
    circle(ctx, x + dir * r * 0.55, y + r * 0.3, r * 0.42)
    ctx.fill()
  }
  ctx.fillStyle = shade(skin, -0.14)
  circle(ctx, x - dir * r * 0.55, y + r * 0.05, r * 0.22)
  ctx.fill()
  const eye = Math.max(1.6, r * 0.11)
  for (const ex of [x + dir * r * 0.08, x + dir * r * 0.58]) {
    if (o.blink) {
      ctx.strokeStyle = '#1f2937'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(ex, y - r * 0.12, eye, 0.2, Math.PI - 0.2)
      ctx.stroke()
    } else dot(ctx, ex, y - r * 0.1, eye, '#1f2937')
  }
  dot(ctx, x + dir * r * 0.68, y + r * 0.28, r * 0.16, rgba('#f87171', 0.35))
  if (o.open) {
    ctx.fillStyle = '#7f1d1d'
    ellipse(ctx, x + dir * r * 0.36, y + r * 0.42, r * 0.2, r * 0.12 + r * 0.16 * o.open)
    ctx.fill()
  } else if (!o.puff) {
    ctx.strokeStyle = shade(skin, -0.5)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x + dir * r * 0.34, y + r * 0.22, r * 0.26, 0.35, Math.PI - 0.35)
    ctx.stroke()
  }
}

export interface Dress {
  skin: string
  hair: string
  shirt: string
  pants?: string
  shoes?: string
}

/**
 * A person standing with their feet on the ground line g at x, turned to dir: legs striding (stride -1 to 1),
 * trousers (or a skirt), the body, the head and hair. The arms are left to the caller: the shoulders are at
 * (x -/+ 10, g - 98) and the head at (x + dir * 2, g - 116).
 */
export function standing(ctx: Ctx, x: number, g: number, dir: number, d: Dress, o: { stride?: number; skirt?: boolean; open?: number; blink?: boolean; bald?: boolean } = {}) {
  const s = o.stride ?? 0
  const pants = d.pants ?? '#64748b'
  const shoes = d.shoes ?? '#475569'
  for (const [k, col] of [[-s, shade(pants, -0.15)], [s, pants]] as const) {
    const fx = x + dir * k * 14
    arm(ctx, [x + dir * k * 3, g - 50, x + dir * k * 9, g - 26 + Math.abs(k) * 2, fx, g - 6], 11, o.skirt ? d.skin : col)
    ctx.fillStyle = shoes
    rr(ctx, dir > 0 ? fx - 6 : fx - 12, g - 8, 18, 8, 3)
  }
  ctx.fillStyle = d.shirt
  if (o.skirt) {
    ctx.beginPath()
    ctx.moveTo(x - 14, g - 104)
    ctx.lineTo(x + 14, g - 104)
    ctx.lineTo(x + 24, g - 40)
    ctx.lineTo(x - 24, g - 40)
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.fillStyle = pants
    rr(ctx, x - 14, g - 62, 28, 16, 5)
    ctx.fillStyle = d.shirt
    rr(ctx, x - 15, g - 106, 30, 52, 10)
  }
  head(ctx, x + dir * 2, g - 118, 16, d.skin, dir, { open: o.open, blink: o.blink })
  if (!o.bald) {
    ctx.fillStyle = d.hair
    ctx.beginPath()
    ctx.arc(x + dir * 2, g - 120, 17, Math.PI * 1.02, Math.PI * 1.98)
    ctx.quadraticCurveTo(x + dir * 2, g - 130, x - dir * 14, g - 118)
    ctx.fill()
  }
}

