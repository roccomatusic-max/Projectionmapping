/**
 * Live plumbing for the mapping module: the server clock, the WebSocket
 * feed, and the same-machine channel the editor uses while dragging.
 */

import { useEffect, useRef, useState } from 'react'
import { getToken } from '@/api/client'
import type { BusMessage } from '@/api/types'
import { mappingApi } from './api'
import type { Output } from './types'

/**
 * Offset between this browser's clock and the server's.
 *
 * NTP-style: several round trips, keep the one with the shortest RTT,
 * assume the server answered halfway through it. Re-sampled periodically
 * because laptop clocks drift and sleep.
 */
export class ServerClock {
  private offset = 0
  private bestRtt = Infinity
  private timer: number | undefined
  synced = false

  now(): number {
    return Date.now() + this.offset
  }

  async sync(samples = 6) {
    let best = Infinity
    let offset = this.offset
    for (let i = 0; i < samples; i++) {
      const t0 = Date.now()
      try {
        const { now_ms } = await mappingApi.clock()
        const t1 = Date.now()
        const rtt = t1 - t0
        if (rtt < best) {
          best = rtt
          offset = now_ms - (t0 + t1) / 2
        }
      } catch {
        /* keep the previous estimate */
      }
    }
    if (best < Infinity) {
      this.offset = offset
      this.bestRtt = best
      this.synced = true
    }
  }

  get rtt() {
    return this.bestRtt
  }

  start(intervalMs = 30000) {
    void this.sync()
    this.timer = window.setInterval(() => void this.sync(3), intervalMs)
  }

  stop() {
    window.clearInterval(this.timer)
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
