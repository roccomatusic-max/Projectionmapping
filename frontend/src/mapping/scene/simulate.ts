/**
 * Made-up people for designing without a camera.
 *
 * They wander across the lower part of the canvas (where people in front of
 * a building appear from a camera's point of view), at walking pace, with
 * the occasional pause. One can be dragged by hand. They are reported in
 * the same shape a depth camera's people arrive in, so scenes cannot tell
 * the difference.
 */

import type { PeopleMessage, Person } from '../types'

interface Walker {
  id: number
  x: number
  y: number
  heading: number
  speed: number
  pauseUntil: number
  z: number
  size: number
}

/** Canvas heights per second; a stroll. */
const WALK = 0.18

function random(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class SimulatedCrowd {
  private walkers: Walker[] = []
  private rand = random(7)
  private last = 0
  /** The person being dragged, and where to. */
  private held: { id: number; x: number; y: number } | null = null

  constructor(
    count: number,
    /** Canvas width / height, so walking speed is the same both ways. */
    private aspect: number,
  ) {
    this.setCount(count)
  }

  setAspect(aspect: number) {
    this.aspect = aspect
  }

  setCount(count: number) {
    while (this.walkers.length < count) {
      const id = (this.walkers.at(-1)?.id ?? 0) + 1
      this.walkers.push({
        id,
        x: 0.15 + this.rand() * 0.7,
        y: 0.6 + this.rand() * 0.3,
        heading: this.rand() * Math.PI * 2,
        speed: WALK * (0.6 + this.rand() * 0.8),
        pauseUntil: 0,
        z: 2 + this.rand() * 4,
        size: 0.045 + this.rand() * 0.02,
      })
    }
    this.walkers.length = count
  }

  get count() {
    return this.walkers.length
  }

  /** Nearest person within ``reach`` canvas heights of a canvas point, if any. */
  pick(x: number, y: number, reach = 0.12): number | null {
    let best: Walker | null = null
    let bestD = reach
    for (const w of this.walkers) {
      const d = Math.hypot((w.x - x) * this.aspect, w.y - y)
      if (d < bestD) {
        bestD = d
        best = w
      }
    }
    return best?.id ?? null
  }

  hold(id: number | null, x = 0, y = 0) {
    this.held = id == null ? null : { id, x, y }
  }

  step(nowMs: number) {
    const dt = this.last ? Math.min(0.1, (nowMs - this.last) / 1000) : 0
    this.last = nowMs
    for (const w of this.walkers) {
      if (this.held?.id === w.id) {
        w.x = this.held.x
        w.y = this.held.y
        continue
      }
      if (nowMs < w.pauseUntil) continue
      if (this.rand() < dt * 0.15) w.pauseUntil = nowMs + 800 + this.rand() * 2500
      w.heading += (this.rand() - 0.5) * dt * 2.5
      const dx = (Math.cos(w.heading) * w.speed * dt) / this.aspect
      const dy = Math.sin(w.heading) * w.speed * dt * 0.35
      w.x += dx
      w.y += dy
      // Turn back at the edges of the walking area.
      if (w.x < 0.05 || w.x > 0.95) {
        w.heading = Math.PI - w.heading
        w.x = Math.min(0.95, Math.max(0.05, w.x))
      }
      if (w.y < 0.55 || w.y > 0.95) {
        w.heading = -w.heading
        w.y = Math.min(0.95, Math.max(0.55, w.y))
      }
      // Further back is further from a camera at the front.
      w.z = 1.5 + (0.95 - w.y) * 12
    }
  }

  people(): Person[] {
    return this.walkers.map((w) => ({ id: w.id, cx: w.x, cy: w.y, x: w.x, y: w.y, z: w.z, size: w.size }))
  }

  message(showId: number): PeopleMessage {
    return { camera_id: -1, show_id: showId, people: this.people(), at: Date.now() }
  }
}
