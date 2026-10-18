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
