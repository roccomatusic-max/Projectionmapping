/**
 * People seen by a depth camera, smoothed for drawing.
 *
 * The camera reports a few times a second; output windows draw at 60 fps.
 * Each person glides toward their latest reported position and fades in
 * when first seen and out when the camera loses them, so effects follow
 * people without stepping or popping.
 */

import type { Spot } from './renderer'
import type { PeopleMessage } from './types'

interface Tracked {
  x: number
  y: number
  tx: number
  ty: number
  radius: number
  strength: number
  seenAt: number
}

/** Not reported for this long (ms): start fading out. */
const LOST_MS = 600
const FADE_IN_S = 0.3
const FADE_OUT_S = 0.8
/** Position follow rate, per second. */
const FOLLOW = 12

export class PeopleTracker {
  private people = new Map<number, Tracked>()
  private last = performance.now()

  constructor(private showId: number) {}

  update(message: PeopleMessage) {
    if (message.show_id !== this.showId) return
    const now = performance.now()
    for (const person of message.people) {
      if (person.x == null || person.y == null) continue
      const radius = Math.min(0.3, Math.max(0.06, person.size * 1.5))
      const known = this.people.get(person.id)
      if (known) {
        known.tx = person.x
        known.ty = person.y
        known.radius = radius
        known.seenAt = now
      } else {
        this.people.set(person.id, {
          x: person.x, y: person.y, tx: person.x, ty: person.y, radius, strength: 0, seenAt: now,
        })
      }
    }
  }

  /** Advance to now and return what to draw. */
  spots(now = performance.now()): Spot[] {
    const dt = Math.min(0.25, Math.max(0, (now - this.last) / 1000))
    this.last = now
    const follow = 1 - Math.exp(-FOLLOW * dt)
    const out: Spot[] = []
    for (const [id, p] of this.people) {
      p.x += (p.tx - p.x) * follow
      p.y += (p.ty - p.y) * follow
      const seen = now - p.seenAt < LOST_MS
      p.strength = seen ? Math.min(1, p.strength + dt / FADE_IN_S) : p.strength - dt / FADE_OUT_S
      if (p.strength <= 0 && !seen) {
        this.people.delete(id)
        continue
      }
      out.push({ x: p.x, y: p.y, radius: p.radius, strength: p.strength })
    }
    return out
  }
}
