import { useCallback, useEffect, useRef, useState } from 'react'
import { api, getToken } from '@/api/client'
import type { BusMessage, Overview, Projector } from '@/api/types'
import {
  mergeLiveState,
  shareUnchanged,
  useFleetContext,
  useOptionalFleetContext,
  type WsStatus,
} from '@/live/LiveProvider'

/**
 * Live fleet state.
 *
 * Inside the app this reads the shared feed kept by <LiveProvider>: one
 * WebSocket plus a slow REST safety net for every page. Screens that live
 * outside the provider (the phone remote) get their own feed with the same
 * behaviour. Either way, if the socket dies mid-show the screen keeps
 * updating — more slowly — and says the link is down rather than quietly
 * showing frozen values as if they were live.
 */
export function useFleet(pollMs = 15000) {
  const shared = useOptionalFleetContext()
  const own = useStandaloneFleet(pollMs, shared === null)
  if (shared) {
    const { projectors, overview, loading, error, refresh, wsStatus, lastSync } = shared
    return { projectors, overview, loading, error, refresh, wsStatus, lastSync }
  }
  return own
}

function useStandaloneFleet(pollMs: number, enabled: boolean) {
  const [projectors, setProjectors] = useState<Projector[]>([])
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting')
  const [lastSync, setLastSync] = useState<number | null>(null)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const [list, stats] = await Promise.all([api.listProjectors(), api.overview()])
      if (!mountedRef.current) return
      setProjectors((current) => shareUnchanged(current, list))
      setOverview(stats)
      setError(null)
      setLastSync(Date.now())
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load fleet state')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    mountedRef.current = true
    void refresh()
    const timer = window.setInterval(() => void refresh(), pollMs)
    return () => {
      mountedRef.current = false
      window.clearInterval(timer)
    }
  }, [refresh, pollMs, enabled])

  // WebSocket with exponential backoff.
  useEffect(() => {
    if (!enabled) return
    let socket: WebSocket | null = null
    let reconnectTimer: number | undefined
    let retries = 0
    let disposed = false

    const connect = () => {
      const token = getToken()
      if (!token || disposed) return
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
      socket = new WebSocket(`${scheme}://${window.location.host}/api/ws?token=${encodeURIComponent(token)}`)
      setWsStatus('connecting')
      socket.onopen = () => {
        retries = 0
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
          const id = message.payload.projector_id as number
          setProjectors((current) =>
            current.map((p) => (p.id === id ? mergeLiveState(p, message.payload) : p)),
          )
        }
        if (
          message.type === 'projector_offline' ||
          message.type === 'projector_online' ||
          message.type === 'alert' ||
          message.type === 'alert_resolved'
        ) {
          void api.overview().then(setOverview).catch(() => undefined)
        }
      }
      socket.onclose = () => {
        if (disposed) return
        setWsStatus('closed')
        retries = Math.min(retries + 1, 6)
        reconnectTimer = window.setTimeout(connect, Math.min(1000 * 2 ** retries, 30000))
      }
      socket.onerror = () => socket?.close()
    }

    connect()
    return () => {
      disposed = true
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      if (socket) {
        socket.onclose = null
        socket.close()
      }
    }
  }, [enabled])

  return { projectors, overview, loading, error, refresh, wsStatus, lastSync }
}

/** Subscribe to bus messages of specific types, over the shared socket. */
export function useBusMessages(
  types: string[],
  handler: (message: BusMessage) => void,
  limit = 50,
) {
  const { subscribe } = useFleetContext()
  const [messages, setMessages] = useState<BusMessage[]>([])
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  const typesRef = useRef(types)
  typesRef.current = types

  useEffect(
    () =>
      subscribe((message) => {
        if (!typesRef.current.includes(message.type)) return
        handlerRef.current(message)
        setMessages((current) => [message, ...current].slice(0, limit))
      }),
    [subscribe, limit],
  )

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
