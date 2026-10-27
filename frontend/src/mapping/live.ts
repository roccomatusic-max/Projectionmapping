/**
 * Live plumbing for the mapping module: the server clock, the WebSocket
 * feed, and the same-machine channel the editor uses while dragging.
 */

import { useEffect, useRef, useState } from 'react'
import { getToken } from '@/api/client'
import type { BusMessage } from '@/api/types'
import { mappingApi } from './api'
import type { Output } from './types'

/** One reading of the server's clock: when (performance.now()), the round
 *  trip it took, and the offset (server ms minus performance.now()) it gave. */
interface ClockSample {
  at: number
  rtt: number
  offset: number
}

/** Readings older than this are forgotten (ms). */
const SAMPLE_WINDOW_MS = 180_000
/** How often a reading is taken once in step (ms). */
const SAMPLE_EVERY_MS = 3000
/** A difference larger than this is taken in one jump; smaller ones are eased in (ms). */
const STEP_MS = 30
/** How fast a small difference is eased in: 5 ms a second (0.5 %), too little to see. */
const SLEW_PER_MS = 0.005
/** The two clocks may run apart by at most this much (0.02 %), however the readings scatter. */
const MAX_SKEW = 2e-4

/**
 * The server's show clock, as seen from this browser.
 *
 * Built on performance.now(), which never jumps, rather than the
 * computer's own time, which Windows may set at any moment. NTP-style
 * readings are taken every few seconds; the quickest round trips of the
 * last few minutes are the ones trusted (a slow one was held up on one of
 * its two legs, which skews it), and a straight line through them gives
 * both the offset and how fast the two clocks run apart.
 *
 * What the line says is eased in at 0.5 % rather than jumped to, so a new
 * reading never makes a picture skip; only a large difference (the first
 * reading, or after the computer slept) is taken in one step, and counted.
 */
export class ServerClock {
  private samples: ClockSample[] = []
  /** The offset in use, server ms minus performance.now(). */
  private applied = 0
  private appliedAt = 0
  /** The straight line through the trusted readings: offset at ``fitAt``, and its slope. */
  private fitOffset = 0
  private fitAt = 0
  private fitSkew = 0
  private bestRtt = Infinity
  private timer: number | undefined
  private wake: (() => void) | undefined
  synced = false
  /** Times the clock jumped rather than eased into step since the page opened. */
  steps = 0

  /** The show clock now, ms. */
  now(): number {
    return this.at(performance.now())
  }

  /** The show clock at a performance.now() time, such as a frame's timestamp. */
  at(perf: number): number {
    if (perf > this.appliedAt) {
      if (this.synced) {
        const want = this.fitOffset + this.fitSkew * (perf - this.fitAt)
        const limit = (perf - this.appliedAt) * SLEW_PER_MS
        this.applied += Math.max(-limit, Math.min(limit, want - this.applied))
      }
      this.appliedAt = perf
    }
    return perf + this.applied
  }

  /** Half the quickest recent round trip: how far off this clock can be, at most (ms). */
  get uncertainty(): number {
    return this.synced ? this.bestRtt / 2 : Infinity
  }

  /** How far the clock in use still is from what the readings say (ms); eased in over time. */
  get easing(): number {
    if (!this.synced) return 0
    const perf = performance.now()
    return this.fitOffset + this.fitSkew * (perf - this.fitAt) - this.at(perf) + perf
  }

  async sync(samples = 6) {
    for (let i = 0; i < samples; i++) {
      const t0 = performance.now()
      try {
        const { now_ms } = await mappingApi.clock()
        const t1 = performance.now()
        this.samples.push({ at: (t0 + t1) / 2, rtt: t1 - t0, offset: now_ms - (t0 + t1) / 2 })
      } catch {
        /* keep the previous estimate */
      }
    }
    this.fit()
  }

  private fit() {
    const latest = this.samples.at(-1)?.at ?? 0
    this.samples = this.samples.filter((s) => latest - s.at <= SAMPLE_WINDOW_MS).slice(-80)
    if (!this.samples.length) return
    const best = Math.min(...this.samples.map((s) => s.rtt))
    // Readings nearly as quick as the quickest: on a wired network a
    // millisecond or two. Anything slower waited somewhere on one leg.
    const trusted = this.samples.filter((s) => s.rtt <= best + Math.max(1.5, best * 0.5))
    const n = trusted.length
    const meanAt = trusted.reduce((sum, s) => sum + s.at, 0) / n
    const meanOffset = trusted.reduce((sum, s) => sum + s.offset, 0) / n
    let skew = 0
    const span = trusted[n - 1].at - trusted[0].at
    if (n >= 4 && span >= 30_000) {
      let num = 0
      let den = 0
      for (const s of trusted) {
        num += (s.at - meanAt) * (s.offset - meanOffset)
        den += (s.at - meanAt) ** 2
      }
      skew = den > 0 ? Math.max(-MAX_SKEW, Math.min(MAX_SKEW, num / den)) : 0
    }
    this.fitOffset = meanOffset
    this.fitAt = meanAt
    this.fitSkew = skew
    this.bestRtt = best
    const perf = performance.now()
    const want = meanOffset + skew * (perf - meanAt)
    if (!this.synced || Math.abs(want - this.at(perf) + perf) > STEP_MS) {
      if (this.synced) this.steps++
      this.applied = want
      this.appliedAt = perf
    }
    this.synced = true
  }

  /** Start over after a sleep or a long stall: old readings may be stale. */
  resync() {
    this.samples = []
    void this.sync(6)
  }

  get rtt() {
    return this.bestRtt
  }

  start(intervalMs = SAMPLE_EVERY_MS) {
    void this.sync()
    this.timer = window.setInterval(() => void this.sync(1), intervalMs)
    // A computer waking from sleep, or a page brought back, may have missed
    // a lot: performance.now() can stand still while asleep.
    let last = performance.now()
    const check = () => {
      const now = performance.now()
      if (document.visibilityState === 'visible' && now - last > 5000) this.resync()
      last = now
    }
    this.wake = () => {
      if (document.visibilityState === 'visible') this.resync()
    }
    document.addEventListener('visibilitychange', this.wake)
    this.watch = window.setInterval(check, 1000)
  }

  private watch: number | undefined

  stop() {
    window.clearInterval(this.timer)
    window.clearInterval(this.watch)
    if (this.wake) document.removeEventListener('visibilitychange', this.wake)
  }
}

export type LinkStatus = 'connecting' | 'open' | 'closed'

/** Subscribe to the server's WebSocket feed, keeping only mapping messages. */
/** Silence after which the feed is treated as dead (the server pings every 25 s). */
const SILENT_MS = 70_000

export function useMappingFeed(onMessage: (message: BusMessage) => void): LinkStatus {
  const [status, setStatus] = useState<LinkStatus>('connecting')
  const handler = useRef(onMessage)
  handler.current = onMessage

  useEffect(() => {
    let socket: WebSocket | null = null
    let retry = 0
    let timer: number | undefined
    let disposed = false
    let lastHeard = Date.now()

    const connect = () => {
      const token = getToken()
      if (!token || disposed) return
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
      socket = new WebSocket(`${scheme}://${window.location.host}/api/ws?token=${encodeURIComponent(token)}`)
      setStatus('connecting')
      socket.onopen = () => {
        retry = 0
        lastHeard = Date.now()
        setStatus('open')
        // Anything may have changed while we were away.
        handler.current({ type: 'mapping_reconnected', payload: {}, at: new Date().toISOString() })
      }
      socket.onmessage = (event) => {
        lastHeard = Date.now()
        try {
          const message = JSON.parse(event.data as string) as BusMessage
          if (message.type.startsWith('mapping_')) handler.current(message)
        } catch {
          /* ignore malformed frames */
        }
      }
      socket.onclose = () => {
        setStatus('closed')
        if (disposed) return
        retry = Math.min(retry + 1, 6)
        timer = window.setTimeout(connect, 500 * 2 ** retry)
      }
    }
    // A phone or laptop that slept has a dead socket and may be waiting
    // out a long retry; reconnect the moment it is looked at again.
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || disposed) return
      if (socket && socket.readyState !== WebSocket.CLOSED) return
      window.clearTimeout(timer)
      retry = 0
      connect()
    }
    document.addEventListener('visibilitychange', onVisible)
    // A socket silent past the server's pings is half-open (the Mac slept,
    // a cable or Wi-Fi dropped without a close): a mini PC would otherwise
    // miss every cue until it is restarted. Drop it and connect again.
    const watchdog = window.setInterval(() => {
      if (disposed || socket?.readyState !== WebSocket.OPEN || Date.now() - lastHeard < SILENT_MS) return
      const dead = socket
      dead.onclose = null
      dead.onmessage = null
      dead.close()
      setStatus('closed')
      retry = 0
      connect()
    }, 10_000)
    connect()
    return () => {
      disposed = true
      window.clearInterval(watchdog)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearTimeout(timer)
      socket?.close()
    }
  }, [])

  return status
}

/** Same-machine fast path: geometry edits reach output windows per frame. */
const CHANNEL = 'pc-mapping'

export type LocalMessage = { type: 'output'; output: Output }

export function useLocalChannel(onMessage?: (message: LocalMessage) => void) {
  const channel = useRef<BroadcastChannel | null>(null)
  const handler = useRef(onMessage)
  handler.current = onMessage
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel(CHANNEL)
    ch.onmessage = (event) => handler.current?.(event.data as LocalMessage)
    channel.current = ch
    return () => ch.close()
  }, [])
  return (message: LocalMessage) => channel.current?.postMessage(message)
}

/** Shortest gap between two live geometry sends for one output (about 25 a second). */
export const LIVE_GAP_MS = 40

type Pending = {
  output: Output
  save: boolean
  done: (saved: Output | null) => void
  fail: (reason: unknown) => void
}

/**
 * Sends one output's edits to the server, in order: live positions while a
 * handle moves (players across the network follow them at once), then the
 * saved copy once it stops. One request at a time, and a newer edit
 * replaces one still waiting, so a slow link skips positions in between
 * rather than falling behind. Nothing sent live can land after the save.
 */
export class EditSender {
  private busy = false
  private waiting: Pending | null = null
  private lastLive = -Infinity
  private gapTimer: number | undefined

  constructor(
    private sendLive: (output: Output) => Promise<void>,
    private sendSave: (output: Output) => Promise<Output>,
  ) {}

  live(output: Output) {
    this.queue({ output, save: false, done: () => undefined, fail: () => undefined })
  }

  /** The saved output, or null when a newer edit took its place first. */
  save(output: Output): Promise<Output | null> {
    return new Promise((done, fail) => this.queue({ output, save: true, done, fail }))
  }

  dispose() {
    window.clearTimeout(this.gapTimer)
    this.waiting?.done(null)
    this.waiting = null
  }

  private queue(next: Pending) {
    // A save still waiting is dropped for a newer edit: the editor saves
    // again after that one anyway.
    this.waiting?.done(null)
    this.waiting = next
    this.pump()
  }

  private pump() {
    window.clearTimeout(this.gapTimer)
    if (this.busy || !this.waiting) return
    const next = this.waiting
    const wait = next.save ? 0 : this.lastLive + LIVE_GAP_MS - performance.now()
    if (wait > 0) {
      this.gapTimer = window.setTimeout(() => this.pump(), wait)
      return
    }
    this.waiting = null
    this.busy = true
    let work: Promise<unknown>
    if (next.save) {
      work = this.sendSave(next.output).then(next.done, next.fail)
    } else {
      this.lastLive = performance.now()
      // A live position that does not arrive is overtaken by the next one, or the save.
      work = this.sendLive(next.output).catch(() => undefined)
    }
    void work.finally(() => {
      this.busy = false
      this.pump()
    })
  }
}
