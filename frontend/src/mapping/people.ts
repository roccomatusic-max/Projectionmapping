/**
 * People seen by a depth camera, smoothed for drawing.
 *
 * The camera reports a few times a second; output windows draw at 60 fps.
 * Each person glides toward their latest reported position and fades in
 * when first seen and out when the camera loses them, so effects follow
 * people without stepping or popping. Their velocity is estimated from the
 * reports, for effects that react to movement.
 */

import type { Spot } from './renderer'
import type { PeopleMessage } from './types'

interface Tracked {
  x: number
  y: number
  tx: number
  ty: number
  vx: number
  vy: number
  z: number | null
  radius: number
  strength: number
  seenAt: number
  reportedAt: number
  seed: number
}

/** A person as scenes see them. Positions in canvas fractions. */
export interface PersonSpot extends Spot {
  /** Velocity in canvas fractions per second. */
  vx: number
  vy: number
  /** Distance from the camera in metres, when it measures depth. */
  z: number | null
  /** Stable per person, 0..1, so each one's effect can differ a little. */
  seed: number
}

/** Not reported for this long (ms): start fading out. */
const LOST_MS = 600
const FADE_IN_S = 0.3
const FADE_OUT_S = 0.8
/** Position follow rate, per second. */
const FOLLOW = 12
/** Velocity smoothing between reports. */
const VELOCITY_KEEP = 0.6

function seedOf(key: string) {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10007) / 10007
}

export class PeopleTracker {
  private people = new Map<string, Tracked>()
  private last = performance.now()

  constructor(private showId: number) {}

  update(message: PeopleMessage) {
    if (message.show_id !== this.showId) return
    const now = performance.now()
    for (const person of message.people) {
      if (person.x == null || person.y == null) continue
      const key = `${message.camera_id}:${person.id}`
      const radius = Math.min(0.3, Math.max(0.06, person.size * 1.5))
      const known = this.people.get(key)
      if (known) {
        const dt = (now - known.reportedAt) / 1000
        if (dt > 0.02 && dt < 1) {
          const vx = (person.x - known.tx) / dt
          const vy = (person.y - known.ty) / dt
          known.vx = known.vx * VELOCITY_KEEP + vx * (1 - VELOCITY_KEEP)
          known.vy = known.vy * VELOCITY_KEEP + vy * (1 - VELOCITY_KEEP)
        }
        known.tx = person.x
        known.ty = person.y
        known.z = person.z
        known.radius = radius
        known.seenAt = now
        known.reportedAt = now
      } else {
        this.people.set(key, {
          x: person.x, y: person.y, tx: person.x, ty: person.y, vx: 0, vy: 0, z: person.z,
          radius, strength: 0, seenAt: now, reportedAt: now, seed: seedOf(key),
        })
      }
    }
  }

  /** Advance to now and return what to draw. */
  spots(now = performance.now()): PersonSpot[] {
    const dt = Math.min(0.25, Math.max(0, (now - this.last) / 1000))
    this.last = now
    const follow = 1 - Math.exp(-FOLLOW * dt)
    const out: PersonSpot[] = []
    for (const [key, p] of this.people) {
      p.x += (p.tx - p.x) * follow
      p.y += (p.ty - p.y) * follow
      const seen = now - p.seenAt < LOST_MS
      if (!seen) {
        p.vx *= 0.9
        p.vy *= 0.9
      }
      p.strength = seen ? Math.min(1, p.strength + dt / FADE_IN_S) : p.strength - dt / FADE_OUT_S
      if (p.strength <= 0 && !seen) {
        this.people.delete(key)
        continue
      }
      out.push({ x: p.x, y: p.y, radius: p.radius, strength: p.strength, vx: p.vx, vy: p.vy, z: p.z, seed: p.seed })
    }
    return out
  }
}
