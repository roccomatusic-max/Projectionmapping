import { useCallback, useEffect, useRef, useState } from 'react'
import { api, getToken } from '@/api/client'
import type { BusMessage, Overview, Projector } from '@/api/types'

type WsStatus = 'connecting' | 'open' | 'closed'

/** Take a telemetry field from a live update only when it carries a value. */
function keepIfAvailable<T extends { availability: string } | undefined>(incoming: T, current: T): T {
  if (incoming && incoming.availability === 'available') return incoming
  return current ?? incoming
}

/**
 * Live fleet state.
 *
 * The WebSocket is the fast path; a slow REST poll runs alongside it as a
 * safety net. If the socket dies mid-show the dashboard keeps updating —
 * it just updates more slowly, and the header says the link is down rather
 * than quietly showing frozen values as if they were live.
 */
export function useFleet(pollMs = 15000) {
  const [projectors, setProjectors] = useState<Projector[]>([])
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting')
  const socketRef = useRef<WebSocket | null>(null)
  const retryRef = useRef(0)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const [list, stats] = await Promise.all([api.listProjectors(), api.overview()])
      if (!mountedRef.current) return
      setProjectors(list)
      setOverview(stats)
      setError(null)
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load fleet state')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void refresh()
    const timer = window.setInterval(() => void refresh(), pollMs)
    return () => {
      mountedRef.current = false
      window.clearInterval(timer)
    }
  }, [refresh, pollMs])

  // WebSocket with exponential backoff.
  useEffect(() => {
    let reconnectTimer: number | undefined
    let disposed = false

    const connect = () => {
      const token = getToken()
      if (!token || disposed) return
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const socket = new WebSocket(
        `${scheme}://${window.location.host}/api/ws?token=${encodeURIComponent(token)}`,
      )
      socketRef.current = socket
      setWsStatus('connecting')

      socket.onopen = () => {
        retryRef.current = 0
        setWsStatus('open')
      }

      socket.onmessage = (event) => {
        let message: BusMessage
        try {
          message = JSON.parse(event.data as string)
        } catch {
          return
        }
        if (message.type === 'projector_state') {
          const payload = message.payload as Record<string, unknown>
          const id = payload.projector_id as number
          const online = Boolean(payload.online)
          setProjectors((current) =>
            current.map((projector) =>
              projector.id === id
                ? {
                    ...projector,
                    state: {
                      ...projector.state,
                      online,
                      // A failed poll is news, but it is not a fresh reading:
                      // keep the previous last-seen time and staleness.
                      stale: online ? false : projector.state.stale,
                      power: (payload.power as Projector['state']['power']) ?? 'unknown',
                      shutter:
                        (payload.shutter as Projector['state']['shutter']) ?? 'unknown',
                      health: (payload.health as Projector['state']['health']) ?? 'unknown',
                      active_input:
                        (payload.active_input as Projector['state']['active_input']) ??
                        projector.state.active_input,
                      // Only the diagnostics tiers read lamp data; a shallow
                      // poll carries an "unavailable" placeholder that must not
                      // overwrite the last real reading.
                      lamp_hours: keepIfAvailable(
                        payload.lamp_hours as Projector['state']['lamp_hours'],
                        projector.state.lamp_hours,
                      ),
                      lamp_status: keepIfAvailable(
                        payload.lamp_status as Projector['state']['lamp_status'],
                        projector.state.lamp_status,
                      ),
                      error_status: keepIfAvailable(
                        payload.error_status as Projector['state']['error_status'],
                        projector.state.error_status,
                      ),
                      errors: (payload.errors as string[]) ?? [],
                      warnings: (payload.warnings as string[]) ?? [],
                      last_error: online
                        ? null
                        : ((payload.errors as string[])?.[0] ?? projector.state.last_error),
                      last_seen_at: online
                        ? new Date().toISOString()
                        : projector.state.last_seen_at,
                    },
                  }
                : projector,
            ),
          )
        }
        // Any event that changes the fleet counters triggers a cheap
        // refresh of just the overview rather than a full reload.
        if (
          message.type === 'projector_offline' ||
          message.type === 'projector_online' ||
          message.type === 'alert' ||
          message.type === 'alert_resolved'
        ) {
          void api.overview().then(setOverview).catch(() => undefined)
        }
      }

      const scheduleReconnect = () => {
        if (disposed) return
        setWsStatus('closed')
        retryRef.current = Math.min(retryRef.current + 1, 6)
        const delay = Math.min(1000 * 2 ** retryRef.current, 30000)
        reconnectTimer = window.setTimeout(connect, delay)
      }

      socket.onclose = scheduleReconnect
      socket.onerror = () => socket.close()
    }

    connect()
    return () => {
      disposed = true
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [])

  return { projectors, overview, loading, error, refresh, wsStatus }
}

/** Subscribe to bus messages of specific types. */
export function useBusMessages(
  types: string[],
  handler: (message: BusMessage) => void,
  limit = 50,
) {
  const [messages, setMessages] = useState<BusMessage[]>([])
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  const typesRef = useRef(types)
  typesRef.current = types

  useEffect(() => {
    const token = getToken()
    if (!token) return
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(
      `${scheme}://${window.location.host}/api/ws?token=${encodeURIComponent(token)}`,
    )
    socket.onmessage = (event) => {
      let message: BusMessage
      try {
        message = JSON.parse(event.data as string)
      } catch {
        return
      }
      if (!typesRef.current.includes(message.type)) return
      handlerRef.current(message)
      setMessages((current) => [message, ...current].slice(0, limit))
    }
    return () => socket.close()
  }, [limit])

  return messages
}

/** Re-render on an interval so relative timestamps stay honest. */
export function useTicker(intervalMs = 5000) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
}
