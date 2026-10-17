/**
 * Live fleet state and command tracking, shared by every page.
 *
 * One WebSocket and one REST safety-net poll serve the whole app, so moving
 * between pages neither reloads the fleet nor opens another socket. The
 * socket is the fast path; the poll keeps the screen honest if it drops, and
 * the shell says so rather than showing frozen values as if they were live.
 *
 * Commands go through here too. Each one is tracked from the click to the
 * projector's own read-back:
 *
 *   pending     request on its way to the server
 *   accepted    the projector acknowledged; waiting for the read-back
 *   sent        acknowledged, and this command has no read-back to wait for
 *   confirmed   the projector reports the requested state
 *   unverified  acknowledged, but the read-back never showed the new state
 *   failed      refused, timed out, or could not be delivered
 *   unavailable not sent: unsupported or gated on this unit
 *
 * Nothing is ever retried from here. A timed-out power command in
 * particular may or may not have acted; the next poll tells us which.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ApiError, api, getToken } from '@/api/client'
import type {
  Alert,
  BusMessage,
  CommandResult,
  GroupCommandResult,
  Outcome,
  Overview,
  Projector,
  Telemetry,
} from '@/api/types'
import { OUTCOME_HELP, OUTCOME_LABEL } from '@/lib/format'
import { isLive, type Tone } from '@/lib/status'

export type WsStatus = 'connecting' | 'open' | 'closed'

export type CommandPhase =
  | 'pending'
  | 'accepted'
  | 'sent'
  | 'confirmed'
  | 'unverified'
  | 'failed'
  | 'unavailable'

export interface CommandSpec {
  capability: string
  params?: Record<string, unknown>
  /** What the operator pressed, e.g. "Power off". */
  label: string
}

export interface TrackedCommand extends CommandSpec {
  id: number
  projectorId: number
  projectorName: string
  phase: CommandPhase
  outcome?: Outcome
  detail?: string
  latencyMs?: number | null
  startedAt: number
  updatedAt: number
  /** Part of a multi-projector dispatch. */
  bulk?: boolean
}

export interface Toast {
  id: number
  tone: Tone
  title: string
  detail?: string
}

/** Commands the server confirms by reading the state back afterwards. */
const READ_BACK = new Set(['power.set', 'shutter.set', 'input.set'])

/** How long to wait for a read-back before calling it unverified. The
 *  server gives up on power after ~60 s; the margin covers a slow poll. */
const READ_BACK_TIMEOUT_MS: Record<string, number> = {
  'power.set': 90_000,
  'shutter.set': 30_000,
  'input.set': 30_000,
}

const ACTIVE_PHASES: CommandPhase[] = ['pending', 'accepted']

export function phaseIsActive(phase: CommandPhase) {
  return ACTIVE_PHASES.includes(phase)
}

export const PHASE_LABEL: Record<CommandPhase, string> = {
  pending: 'Sending',
  accepted: 'Awaiting read-back',
  sent: 'Sent',
  confirmed: 'Confirmed',
  unverified: 'Not confirmed',
  failed: 'Failed',
  unavailable: 'Unavailable',
}

export const PHASE_TONE: Record<CommandPhase, Tone> = {
  pending: 'busy',
  accepted: 'busy',
  sent: 'idle',
  confirmed: 'ok',
  unverified: 'warn',
  failed: 'fault',
  unavailable: 'idle',
}

/** Does the projector's reported state show what this command asked for? */
function readBackMatches(command: TrackedCommand, projector: Projector): boolean {
  if (!isLive(projector)) return false
  const params = command.params ?? {}
  switch (command.capability) {
    case 'power.set':
      return projector.state.power === params.state
    case 'shutter.set':
      return projector.state.shutter === params.state
    case 'input.set': {
      const value = projector.state.active_input?.value
      const code = value && typeof value === 'object' ? value.code : value
      return typeof code === 'string' && code.toUpperCase() === String(params.input).toUpperCase()
    }
    default:
      return false
  }
}

function phaseFromOutcome(capability: string, outcome: Outcome): CommandPhase {
  switch (outcome) {
    case 'confirmed':
      return 'confirmed'
    case 'accepted':
    case 'ok':
      return READ_BACK.has(capability) ? 'accepted' : 'sent'
    case 'unsupported':
      return 'unavailable'
    default:
      return 'failed'
  }
}

function describe(phase: CommandPhase, result: CommandResult): string {
  if (phase === 'accepted') return 'Acknowledged by the projector. Waiting for it to report the new state.'
  if (phase === 'sent') return 'Acknowledged. This setting cannot be read back from the projector.'
  return result.error ?? OUTCOME_HELP[result.outcome]
}

/** Take a telemetry field from a live update only when it carries a value. */
function keepIfAvailable<T extends Telemetry<unknown> | undefined>(incoming: T, current: T): T {
  if (incoming && incoming.availability === 'available') return incoming
  return current ?? incoming
}

const EQUIPMENT_FIELDS = [
  'manufacturer', 'model', 'serial_number', 'firmware', 'filter_usage',
  'temperature', 'fan', 'resolution', 'input_signal',
] as const

export function mergeLiveState(projector: Projector, payload: Record<string, unknown>): Projector {
  const online = Boolean(payload.online)
  const state = projector.state
  const deep = payload.tier === 'diagnostics' || payload.tier === 'maintenance'
  let equipment = state.equipment
  if (deep) {
    equipment = { ...(state.equipment ?? {}) }
    for (const field of EQUIPMENT_FIELDS) {
      const incoming = payload[field] as Telemetry<unknown> | undefined
      if (incoming) equipment[field] = keepIfAvailable(incoming, equipment[field])
    }
  }
  return {
    ...projector,
    state: {
      ...state,
      online,
      // A failed poll is news, but it is not a fresh reading: keep the
      // previous last-seen time and staleness.
      stale: online ? false : state.stale,
      power: (payload.power as Projector['state']['power']) ?? 'unknown',
      shutter: (payload.shutter as Projector['state']['shutter']) ?? 'unknown',
      health: (payload.health as Projector['state']['health']) ?? 'unknown',
      active_input: (payload.active_input as Projector['state']['active_input']) ?? state.active_input,
      // Only the diagnostics tiers read lamp data; a shallow poll carries an
      // "unavailable" placeholder that must not overwrite the last reading.
      lamp_hours: keepIfAvailable(payload.lamp_hours as Projector['state']['lamp_hours'], state.lamp_hours),
      lamp_status: keepIfAvailable(payload.lamp_status as Projector['state']['lamp_status'], state.lamp_status),
      error_status: keepIfAvailable(payload.error_status as Projector['state']['error_status'], state.error_status),
      equipment,
      errors: (payload.errors as string[]) ?? [],
      warnings: (payload.warnings as string[]) ?? [],
      last_error: online ? null : ((payload.errors as string[])?.[0] ?? state.last_error),
      consecutive_failures: online ? 0 : state.consecutive_failures + 1,
      last_seen_at: online ? new Date().toISOString() : state.last_seen_at,
    },
  }
}

/** Keep the previous object when nothing changed, so memoised cards and rows
 *  skip re-rendering on every poll. That is what stops the grid flickering. */
export function shareUnchanged(previous: Projector[], next: Projector[]): Projector[] {
  const byId = new Map(previous.map((p) => [p.id, p]))
  let changed = previous.length !== next.length
  const merged = next.map((projector, index) => {
    const old = byId.get(projector.id)
    if (old && JSON.stringify(old) === JSON.stringify(projector)) {
      if (previous[index] !== old) changed = true
      return old
    }
    changed = true
    return projector
  })
  return changed ? merged : previous
}

/* ------------------------------------------------------------------ */

interface FleetContextValue {
  projectors: Projector[]
  overview: Overview | null
  /** Unresolved alerts (open and acknowledged). */
  alerts: Alert[]
  loading: boolean
  error: string | null
  wsStatus: WsStatus
  /** When the fleet was last brought up to date from the server. */
  lastSync: number | null
  refresh: () => Promise<void>
  refreshAlerts: () => Promise<void>
  subscribe: (handler: (message: BusMessage) => void) => () => void
}

interface OpsContextValue {
  commands: TrackedCommand[]
  toasts: Toast[]
  notify: (tone: Tone, title: string, detail?: string) => void
  dismissToast: (id: number) => void
  run: (projector: Projector, spec: CommandSpec) => Promise<CommandResult | null>
  runBulk: (projectors: Projector[], spec: CommandSpec) => Promise<GroupCommandResult | null>
  clearCommands: () => void
}

const FleetContext = createContext<FleetContextValue | null>(null)
const OpsContext = createContext<OpsContextValue | null>(null)

let commandSeq = 0
let toastSeq = 0

export function LiveProvider({ children }: { children: ReactNode }) {
  const [projectors, setProjectors] = useState<Projector[]>([])
  const [overview, setOverview] = useState<Overview | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting')
  const [lastSync, setLastSync] = useState<number | null>(null)
  const [commands, setCommands] = useState<TrackedCommand[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])

  const listeners = useRef(new Set<(message: BusMessage) => void>())
  const alertSignature = useRef<string | null>(null)
  const projectorsRef = useRef(projectors)
  projectorsRef.current = projectors

  /* -- toasts ------------------------------------------------------ */

  const dismissToast = useCallback(
    (id: number) => setToasts((current) => current.filter((t) => t.id !== id)),
    [],
  )

  const notify = useCallback((tone: Tone, title: string, detail?: string) => {
    const toast = { id: ++toastSeq, tone, title, detail }
    // Keep the stack short; the activity panel has the full history.
    setToasts((current) => [...current.slice(-3), toast])
    // Problems stay up long enough to read; routine news goes quickly.
    const ttl = tone === 'fault' ? 12000 : tone === 'warn' ? 9000 : 4500
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== toast.id)), ttl)
  }, [])

  /* -- fleet ------------------------------------------------------- */

  const refreshAlerts = useCallback(async () => {
    try {
      setAlerts(await api.alerts())
    } catch {
      // The overview counters still show the totals; the list can wait.
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [list, stats] = await Promise.all([api.listProjectors(), api.overview()])
      setProjectors((current) => shareUnchanged(current, list))
      setOverview(stats)
      setError(null)
      setLastSync(Date.now())
      // Fetch the alert list only when the counts say it changed.
      const signature = `${stats.open_alerts}:${stats.critical_alerts}`
      if (signature !== alertSignature.current) {
        alertSignature.current = signature
        void refreshAlerts()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fleet state')
    } finally {
      setLoading(false)
    }
  }, [refreshAlerts])

  // Safety-net poll: slower while the socket carries updates, faster when it
  // is down, paused while the tab is hidden.
  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const interval = wsStatus === 'open' ? 15000 : 8000
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh()
    }, interval)
    const onVisible = () => {
      if (!document.hidden) void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh, wsStatus])

  /* -- commands ---------------------------------------------------- */

  const patchCommand = useCallback((id: number, patch: Partial<TrackedCommand>) => {
    setCommands((current) =>
      current.map((command) =>
        command.id === id ? { ...command, ...patch, updatedAt: Date.now() } : command,
      ),
    )
  }, [])

  const addCommand = useCallback((command: TrackedCommand) => {
    setCommands((current) => [command, ...current].slice(0, 80))
  }, [])

  // Resolve the command awaiting read-back for this projector and capability.
  // Reads the ref, not state, so the socket event and the observed-state
  // check cannot both settle (and both announce) the same command.
  const commandsRef = useRef(commands)
  commandsRef.current = commands
  const settle = useCallback(
    (projectorId: number, capability: string, phase: CommandPhase, detail: string) => {
      const target = commandsRef.current.find(
        (c) => c.projectorId === projectorId && c.capability === capability && c.phase === 'accepted',
      )
      if (!target) return
      commandsRef.current = commandsRef.current.map((c) => (c.id === target.id ? { ...c, phase } : c))
      if (phase === 'confirmed' && !target.bulk) {
        notify('ok', `${target.projectorName}: ${target.label} confirmed`)
      } else if (phase === 'unverified') {
        notify('warn', `${target.projectorName}: ${target.label} not confirmed`, detail)
      }
      patchCommand(target.id, { phase, detail })
    },
    [notify, patchCommand],
  )

  const run = useCallback(
    async (projector: Projector, spec: CommandSpec): Promise<CommandResult | null> => {
      const id = ++commandSeq
      const now = Date.now()
      addCommand({
        ...spec, id, projectorId: projector.id, projectorName: projector.name,
        phase: 'pending', startedAt: now, updatedAt: now,
      })
      const params = spec.params ?? {}
      try {
        let result: CommandResult
        switch (spec.capability) {
          case 'power.set':
            result = await api.power(projector.id, params.state as 'on' | 'off')
            break
          case 'shutter.set':
            result = await api.shutter(projector.id, params.state as 'open' | 'closed')
            break
          case 'input.set':
            result = await api.input(projector.id, String(params.input))
            break
          default:
            result = await api.command(projector.id, spec.capability, params)
        }
        const phase = phaseFromOutcome(spec.capability, result.outcome)
        patchCommand(id, {
          phase, outcome: result.outcome, detail: describe(phase, result), latencyMs: result.latency_ms,
        })
        if (phase === 'failed' || phase === 'unavailable') {
          notify(
            phase === 'failed' ? 'fault' : 'warn',
            `${projector.name}: ${spec.label} — ${OUTCOME_LABEL[result.outcome]}`,
            result.error ?? OUTCOME_HELP[result.outcome],
          )
        } else if (phase === 'confirmed') {
          notify('ok', `${projector.name}: ${spec.label} confirmed`)
        }
        return result
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'The command could not be sent'
        patchCommand(id, { phase: 'failed', detail: message })
        notify('fault', `${projector.name}: ${spec.label} failed`, message)
        return null
      }
    },
    [addCommand, notify, patchCommand],
  )

  const runBulk = useCallback(
    async (targets: Projector[], spec: CommandSpec): Promise<GroupCommandResult | null> => {
      if (targets.length === 0) return null
      const now = Date.now()
      const ids = new Map<number, number>()
      setCommands((current) => [
        ...targets.map((projector) => {
          const id = ++commandSeq
          ids.set(projector.id, id)
          return {
            ...spec, id, projectorId: projector.id, projectorName: projector.name,
            phase: 'pending' as const, startedAt: now, updatedAt: now, bulk: true,
          }
        }),
        ...current,
      ].slice(0, 80))
      try {
        const result = await api.selectionCommand(
          targets.map((p) => p.id), spec.capability, spec.params ?? {},
        )
        const seen = new Set<number>()
        for (const row of result.results) {
          if (row.projector_id == null) continue
          const id = ids.get(row.projector_id)
          if (id == null) continue
          seen.add(row.projector_id)
          const phase = phaseFromOutcome(spec.capability, row.outcome)
          patchCommand(id, { phase, outcome: row.outcome, detail: describe(phase, row), latencyMs: row.latency_ms })
        }
        // A device the server did not answer for is not a success.
        for (const [projectorId, id] of ids) {
          if (!seen.has(projectorId)) patchCommand(id, { phase: 'failed', detail: 'No result returned for this projector' })
        }
        const { succeeded, failed, total } = result.summary
        notify(
          failed === 0 ? 'ok' : succeeded === 0 ? 'fault' : 'warn',
          `${spec.label}: ${succeeded} of ${total} acknowledged`,
          failed > 0
            ? `${failed} projector(s) did not accept the command.`
            : READ_BACK.has(spec.capability)
              ? 'Waiting for each projector to report the new state.'
              : undefined,
        )
        return result
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Could not dispatch'
        for (const id of ids.values()) patchCommand(id, { phase: 'failed', detail: message })
        notify('fault', `${spec.label} failed`, message)
        return null
      }
    },
    [notify, patchCommand],
  )

  const clearCommands = useCallback(
    () => setCommands((current) => current.filter((c) => phaseIsActive(c.phase))),
    [],
  )

  // Confirm from observed state: if a poll shows what was asked for, that is
  // a read-back, whether or not the socket delivered the verification event.
  useEffect(() => {
    const waiting = commands.filter((c) => c.phase === 'accepted')
    if (waiting.length === 0) return
    const byId = new Map(projectors.map((p) => [p.id, p]))
    for (const command of waiting) {
      const projector = byId.get(command.projectorId)
      if (projector && readBackMatches(command, projector)) {
        settle(command.projectorId, command.capability, 'confirmed', 'The projector reports the requested state.')
      }
    }
  }, [projectors, commands, settle])

  // Give up waiting after the read-back window.
  useEffect(() => {
    if (!commands.some((c) => c.phase === 'accepted')) return
    const timer = window.setInterval(() => {
      const now = Date.now()
      for (const command of commands) {
        if (command.phase !== 'accepted') continue
        const limit = READ_BACK_TIMEOUT_MS[command.capability] ?? 30_000
        if (now - command.updatedAt > limit) {
          settle(
            command.projectorId, command.capability, 'unverified',
            `No read-back within ${Math.round(limit / 1000)} s. The projector may still be ` +
              'transitioning, or the command may not have taken effect. Not retried.',
          )
        }
      }
    }, 2000)
    return () => window.clearInterval(timer)
  }, [commands, settle])

  /* -- socket ------------------------------------------------------ */

  useEffect(() => {
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
        const payload = message.payload ?? {}

        if (message.type === 'projector_state') {
          const id = payload.projector_id as number
          setProjectors((current) =>
            current.map((projector) => (projector.id === id ? mergeLiveState(projector, payload) : projector)),
          )
          setLastSync(Date.now())
        } else if (message.type === 'command_verified') {
          settle(
            payload.projector_id as number, String(payload.capability), 'confirmed',
            `Read back from the projector after ${payload.after_seconds ?? '?'} s.`,
          )
        } else if (message.type === 'command_unverified') {
          settle(payload.projector_id as number, String(payload.capability), 'unverified', String(payload.message ?? ''))
        }

        // Anything that changes the fleet counters triggers a cheap refresh
        // of just the overview rather than a full reload.
        if (
          message.type === 'projector_offline' ||
          message.type === 'projector_online' ||
          message.type === 'alert' ||
          message.type === 'alert_resolved'
        ) {
          void api.overview().then(setOverview).catch(() => undefined)
        }
        if (message.type === 'alert' || message.type === 'alert_resolved') {
          void refreshAlerts()
          if (message.type === 'alert' && payload.severity === 'critical') {
            notify('fault', String(payload.message ?? 'Critical alert'))
          }
        }

        for (const listener of listeners.current) listener(message)
      }

      const scheduleReconnect = () => {
        if (disposed) return
        setWsStatus('closed')
        retries = Math.min(retries + 1, 6)
        reconnectTimer = window.setTimeout(connect, Math.min(1000 * 2 ** retries, 30000))
      }
      socket.onclose = scheduleReconnect
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
  }, [notify, refreshAlerts, settle])

  const subscribe = useCallback((handler: (message: BusMessage) => void) => {
    listeners.current.add(handler)
    return () => {
      listeners.current.delete(handler)
    }
  }, [])

  const fleet = useMemo<FleetContextValue>(
    () => ({ projectors, overview, alerts, loading, error, wsStatus, lastSync, refresh, refreshAlerts, subscribe }),
    [projectors, overview, alerts, loading, error, wsStatus, lastSync, refresh, refreshAlerts, subscribe],
  )
  const ops = useMemo<OpsContextValue>(
    () => ({ commands, toasts, notify, dismissToast, run, runBulk, clearCommands }),
    [commands, toasts, notify, dismissToast, run, runBulk, clearCommands],
  )

  return (
    <FleetContext.Provider value={fleet}>
      <OpsContext.Provider value={ops}>{children}</OpsContext.Provider>
    </FleetContext.Provider>
  )
}

export function useFleetContext(): FleetContextValue {
  const value = useContext(FleetContext)
  if (!value) throw new Error('useFleetContext must be used inside <LiveProvider>')
  return value
}

/** The fleet context, or null outside <LiveProvider> (the phone remote). */
export function useOptionalFleetContext(): FleetContextValue | null {
  return useContext(FleetContext)
}

export function useOps(): OpsContextValue {
  const value = useContext(OpsContext)
  if (!value) throw new Error('useOps must be used inside <LiveProvider>')
  return value
}

/** The command currently in flight (or awaiting read-back) on a projector,
 *  optionally limited to one capability. Used to lock controls so the same
 *  command cannot be fired twice while the first is still unresolved. */
export function activeCommand(
  commands: TrackedCommand[],
  projectorId: number,
  capability?: string,
): TrackedCommand | undefined {
  return commands.find(
    (c) =>
      c.projectorId === projectorId &&
      phaseIsActive(c.phase) &&
      (capability === undefined || c.capability === capability),
  )
}

/** The most recent command on a projector, whatever its phase. */
export function latestCommand(
  commands: TrackedCommand[],
  projectorId: number,
  capability?: string,
): TrackedCommand | undefined {
  return commands.find(
    (c) => c.projectorId === projectorId && (capability === undefined || c.capability === capability),
  )
}
