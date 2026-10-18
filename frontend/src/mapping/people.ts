/**
 * People seen by a depth camera, filtered and predicted for drawing.
 *
 * The camera reports up to 30 times a second; output windows draw at 60 fps.
 * Every report arrives a little late (the camera's own exposure and
 * readout, finding people in the depth picture, the network), so instead of
 * easing toward the last report, which trails a walking person by a tenth
 * of a second, each person is tracked with a position and a velocity
 * (an alpha-beta filter) and drawn where they are now: the filtered
 * position carried forward by how old it is. Stood still, the filter
 * leans on its history and the picture keeps still; on the move it follows
 * the camera closely. Corrections when a report disagrees with the
 * prediction are blended out over a few frames rather than jumped to.
 *
 * Reports carry ``captured_at``, the moment the camera took the picture in
 * server time, and the output windows keep a clock in step with the server,
 * so each report's age is measured, not guessed.
 */

import type { Spot } from './renderer'
import type { PeopleMessage } from './types'

/** The server-synced clock (live.ts ServerClock), or anything with now() in ms. */
export interface TrackingClock {
  now(): number
  synced?: boolean
}

interface Axis {
  /** Filtered position at the last report's capture time. */
  p: number
  /** Velocity, canvas fractions per second. */
  v: number
}

interface Tracked {
  x: Axis
  y: Axis
  /** Capture time of the last report, ms on the clock. */
  capturedAt: number
  /** What was drawn minus what the filter says, blended out after each correction. */
  ox: number
  oy: number
  z: number | null
  radius: number
  strength: number
  seenAt: number
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
const LOST_MS = 400
const FADE_IN_S = 0.15
const FADE_OUT_S = 0.8
/**
 * Filter cut-off in Hz: low when still (no wobble), rising with speed
 * (no lag). Speed is in canvas fractions per second.
 */
const MIN_CUTOFF = 1.0
const SPEED_CUTOFF = 20
/** Below 1 the velocity listens less to each report than the position does: steadier prediction. */
const VELOCITY_GAIN = 0.6
/** Never carry a position forward further than this (s): a stop overshoots by at most speed × this. */
const MAX_AHEAD_S = 0.12
/** One output frame: the picture drawn now is on the projector a frame later. */
const DISPLAY_AHEAD_S = 1 / 60
/** Corrections blend out with this time constant (s). */
const BLEND_S = 0.035
/** A gap longer than this (s) between reports starts the person afresh. */
const RESTART_S = 0.5
/** Reports claiming to be older than this (ms) are from an unsynced clock: treated as new. */
const IMPLAUSIBLE_AGE_MS = 1500

function seedOf(key: string) {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10007) / 10007
}

/** One alpha-beta step: dt in seconds, alpha from the speed-adaptive cut-off. */
function step(axis: Axis, measured: number, dt: number, speed: number) {
  const cutoff = MIN_CUTOFF + SPEED_CUTOFF * speed
  const tau = 1 / (2 * Math.PI * cutoff)
  const alpha = dt / (dt + tau)
  const beta = (VELOCITY_GAIN * alpha * alpha) / (2 - alpha)
  const predicted = axis.p + axis.v * dt
  const residual = measured - predicted
  axis.p = predicted + alpha * residual
  axis.v += (beta / dt) * residual
}

/** Recent report ages: [arrived at (performance.now()), age ms], for the Players tab. */
const ages: Array<[number, number]> = []

/**
 * How old the camera's reports are when they reach this window (ms), median
 * of the last few seconds; null when no camera is reporting.
 */
export function trackingDelayMs(): number | null {
  const since = performance.now() - 3000
  while (ages.length && ages[0][0] < since) ages.shift()
  if (!ages.length) return null
  const sorted = ages.map(([, age]) => age).sort((a, b) => a - b)
  return Math.round(sorted[sorted.length >> 1])
}

export class PeopleTracker {
  private people = new Map<string, Tracked>()
  private last = performance.now()

  constructor(
    private showId: number,
    private clock: TrackingClock = { now: () => Date.now() },
  ) {}

  private clockNow() {
    return this.clock.now()
  }

  update(message: PeopleMessage) {
    if (message.show_id !== this.showId) return
    const now = performance.now()
    const clockNow = this.clockNow()
    let capturedAt = clockNow
    if (message.captured_at != null && this.clock.synced !== false) {
      const age = clockNow - message.captured_at
      if (age > -50 && age < IMPLAUSIBLE_AGE_MS) {
        capturedAt = Math.min(clockNow, message.captured_at)
        if (message.camera_id > 0) {
          ages.push([now, age])
          if (ages.length > 200) ages.shift()
        }
      }
    }
    for (const person of message.people) {
      if (person.x == null || person.y == null) continue
      const key = `${message.camera_id}:${person.id}`
      const radius = Math.min(0.3, Math.max(0.06, person.size * 1.5))
      const known = this.people.get(key)
      const dt = known ? (capturedAt - known.capturedAt) / 1000 : 0
      if (known && dt > 0.002 && dt < RESTART_S) {
        const before = this.position(known, clockNow)
        const speed = Math.hypot(known.x.v, known.y.v)
        step(known.x, person.x, dt, speed)
        step(known.y, person.y, dt, speed)
        known.capturedAt = capturedAt
        const after = this.position(known, clockNow)
        known.ox = before.x - after.x
        known.oy = before.y - after.y
      } else if (known && dt >= RESTART_S) {
        Object.assign(known, {
          x: { p: person.x, v: 0 }, y: { p: person.y, v: 0 }, capturedAt, ox: 0, oy: 0,
        })
      } else if (!known) {
        this.people.set(key, {
          x: { p: person.x, v: 0 }, y: { p: person.y, v: 0 }, capturedAt, ox: 0, oy: 0,
          z: person.z, radius, strength: 0, seenAt: now, seed: seedOf(key),
        })
        continue
      }
      // A report out of order (dt <= 0) still says the person is there.
      const tracked = this.people.get(key)!
      tracked.z = person.z
      tracked.radius = radius
      tracked.seenAt = now
    }
  }

  /** Where the filter puts someone at clock time `at`, without the blend. */
  private position(p: Tracked, at: number) {
    const ahead = Math.min(MAX_AHEAD_S, Math.max(0, (at - p.capturedAt) / 1000 + DISPLAY_AHEAD_S))
    return { x: p.x.p + p.x.v * ahead, y: p.y.p + p.y.v * ahead }
  }

  /** Advance to now and return what to draw. */
  spots(now = performance.now()): PersonSpot[] {
    const dt = Math.min(0.25, Math.max(0, (now - this.last) / 1000))
    this.last = now
    const clockNow = this.clockNow()
    const blend = Math.exp(-dt / BLEND_S)
    const out: PersonSpot[] = []
    for (const [key, p] of this.people) {
      const seen = now - p.seenAt < LOST_MS
      if (!seen) {
        // Lost: stop carrying them forward, let the effect fade where they were.
        const held = this.position(p, clockNow)
        p.x.p = held.x
        p.y.p = held.y
        p.capturedAt = clockNow
        p.x.v *= 0.8
        p.y.v *= 0.8
      }
      p.ox *= blend
      p.oy *= blend
      p.strength = seen ? Math.min(1, p.strength + dt / FADE_IN_S) : p.strength - dt / FADE_OUT_S
      if (p.strength <= 0 && !seen) {
        this.people.delete(key)
        continue
      }
      const at = this.position(p, clockNow)
      out.push({
        x: at.x + p.ox, y: at.y + p.oy, radius: p.radius, strength: p.strength,
        vx: p.x.v, vy: p.y.v, z: p.z, seed: p.seed,
      })
    }
    return out
  }
}
