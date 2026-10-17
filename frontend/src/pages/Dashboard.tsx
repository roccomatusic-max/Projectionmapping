import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Session } from '@/api/client'
import { api, ApiError } from '@/api/client'
import type { Projector } from '@/api/types'
import { useFleet, useTicker } from '@/hooks/useLiveData'
import { ProjectorCard } from '@/components/ProjectorCard'
import {
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Spinner,
  ToastStack,
  useToasts,
} from '@/components/ui'
import { FleetBar, StatTile, type FleetSegmentKind } from '@/components/graphics'
import {
  ControlIcon,
  DashboardIcon,
  EnergyIcon,
  FaultIcon,
  LiveIcon,
  OfflineIcon,
  PowerIcon,
  ProjectorIcon,
  RefreshIcon,
  WarningIcon,
} from '@/components/icons'
import { OUTCOME_HELP, OUTCOME_LABEL, outcomeTone } from '@/lib/format'

type PendingCommand = {
  projector: Projector
  kind: 'power' | 'shutter'
  state: string
}

type Filter = 'all' | 'online' | 'on' | 'standby' | 'warnings' | 'faults'

function isLive(p: Projector) {
  return p.state.online && !p.state.stale
}

function matches(p: Projector, filter: Filter): boolean {
  switch (filter) {
    case 'online': return isLive(p)
    case 'on': return isLive(p) && p.state.power === 'on'
    case 'standby': return isLive(p) && p.state.power === 'off'
    case 'warnings': return p.state.health === 'warning' || p.state.warnings.length > 0
    // Matches the server's "faults" count: a device-reported error, not mere unreachability
    // (that is what the Online tile is for).
    case 'faults': return p.state.health === 'error'
    default: return true
  }
}

function segmentKind(p: Projector): FleetSegmentKind {
  if (!isLive(p)) return 'offline'
  if (p.state.power === 'on') return 'on'
  if (p.state.power === 'warming' || p.state.power === 'cooling') return 'transition'
  return 'standby'
}

export default function Dashboard({ session }: { session: Session }) {
  const { projectors, overview, loading, error, refresh, wsStatus } = useFleet()
  const { toasts, push, dismiss } = useToasts()
  const [pending, setPending] = useState<PendingCommand | null>(null)
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState<Filter>('all')
  useTicker(5000)

  const visible = useMemo(() => projectors.filter((p) => matches(p, filter)), [projectors, filter])
  const segments = useMemo(() => {
    const order: Record<FleetSegmentKind, number> = { on: 0, transition: 1, standby: 2, offline: 3 }
    return projectors
      .filter((p) => p.enabled)
      .map((p) => ({ name: p.name, kind: segmentKind(p) }))
      .sort((a, b) => order[a.kind] - order[b.kind])
  }, [projectors])
  const toggle = (next: Filter) => setFilter((current) => (current === next ? 'all' : next))

  const canControl = session.role !== 'viewer'

  const setBusy = (id: number, busy: boolean) =>
    setBusyIds((current) => {
      const next = new Set(current)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })

  const run = async (command: PendingCommand) => {
    const { projector, kind, state } = command
    setBusy(projector.id, true)
    try {
      const result =
        kind === 'power'
          ? await api.power(projector.id, state as 'on' | 'off')
          : await api.shutter(projector.id, state as 'open' | 'closed')
      push(
        outcomeTone(result.outcome),
        `${projector.name}: ${OUTCOME_LABEL[result.outcome]}`,
        result.error ?? OUTCOME_HELP[result.outcome],
      )
      void refresh()
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'The command could not be sent'
      push('fault', `${projector.name}: command failed`, message)
    } finally {
      setBusy(projector.id, false)
    }
  }

  const online = overview?.online ?? 0
  const faults = overview?.faults ?? 0
  const warnings = overview?.warnings ?? 0

  return (
    <div className="space-y-5">
      <PageHeader
        icon={DashboardIcon}
        title="Fleet overview"
        subtitle={
          <>
            {wsStatus === 'open' ? (
              <LiveIcon size={13} className="text-emerald-400" aria-hidden />
            ) : (
              <OfflineIcon size={13} className="text-amber-400" aria-hidden />
            )}
            {wsStatus === 'open'
              ? 'Live updates connected'
              : 'Live link down — falling back to periodic refresh'}
          </>
        }
        actions={
          <>
            <Link to="/control" className="btn-default">
              <ControlIcon size={15} aria-hidden /> Control Center
            </Link>
            <button className="btn-default" onClick={() => void refresh()}>
              <RefreshIcon size={15} aria-hidden /> Refresh
            </button>
          </>
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile icon={ProjectorIcon} label="Registered" value={overview?.total ?? '—'}
                  onClick={() => setFilter('all')} active={filter === 'all'} hint="Show every projector" />
        <StatTile
          icon={LiveIcon}
          label="Online"
          value={online}
          tone={online > 0 ? 'ok' : 'idle'}
          hint="Counted from a successful poll inside the staleness window, not from a remembered state. Click to filter."
          onClick={() => toggle('online')} active={filter === 'online'}
        />
        <StatTile
          icon={PowerIcon}
          label="Powered on"
          value={overview?.powered_on ?? '—'}
          tone={(overview?.powered_on ?? 0) > 0 ? 'ok' : 'idle'}
          onClick={() => toggle('on')} active={filter === 'on'} hint="Click to filter"
        />
        <StatTile icon={EnergyIcon} label="Standby" value={overview?.standby ?? '—'}
                  onClick={() => toggle('standby')} active={filter === 'standby'} hint="Click to filter" />
        <StatTile icon={WarningIcon} label="Warnings" value={warnings} tone={warnings > 0 ? 'warn' : 'idle'}
                  onClick={() => toggle('warnings')} active={filter === 'warnings'} hint="Click to filter" />
        <StatTile icon={FaultIcon} label="Faults" value={faults} tone={faults > 0 ? 'fault' : 'idle'}
                  onClick={() => toggle('faults')} active={filter === 'faults'} hint="Click to filter" />
      </div>

      {segments.length > 0 && (
        <div className="panel px-4 py-3">
          <FleetBar segments={segments} />
        </div>
      )}

      {(overview?.stale ?? 0) > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <OfflineIcon size={16} aria-hidden />
          {overview?.stale} projector(s) have not answered recently. Their last known
          values are shown as stale rather than live.
        </div>
      )}

      {(overview?.open_alerts ?? 0) > 0 && (
        <Link
          to="/monitoring"
          className="flex items-center justify-between rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200 hover:bg-red-500/15"
        >
          <span className="flex items-center gap-2">
            <FaultIcon size={16} aria-hidden />
            {overview?.open_alerts} open alert(s)
            {(overview?.critical_alerts ?? 0) > 0 &&
              `, ${overview?.critical_alerts} critical`}
          </span>
          <span>View →</span>
        </Link>
      )}

      {loading ? (
        <div className="panel p-6">
          <Spinner label="Loading projectors…" />
        </div>
      ) : projectors.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="No projectors registered yet"
            action={
              <Link to="/projectors" className="btn-primary">
                Add your first projector
              </Link>
            }
          >
            Add a projector by IP address to start monitoring and controlling it.
          </EmptyState>
        </div>
      ) : visible.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="No projectors match this filter"
            action={<button className="btn-default" onClick={() => setFilter('all')}>Show all</button>}
          />
        </div>
      ) : (
        <div className="card-grid">
          {visible.map((projector) => (
            <ProjectorCard
              key={projector.id}
              projector={projector}
              canControl={canControl}
              busy={busyIds.has(projector.id)}
              onPower={(target, state) =>
                setPending({ projector: target, kind: 'power', state })
              }
              onShutter={(target, state) =>
                setPending({ projector: target, kind: 'shutter', state })
              }
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.kind === 'power'
            ? `Power ${pending.state} ${pending.projector.name}?`
            : `${pending?.state === 'closed' ? 'Close' : 'Open'} shutter on ${pending?.projector.name}?`
        }
        body={
          pending?.kind === 'power' ? (
            <>
              <p>
                This drives real hardware. A power change takes tens of seconds and
                cannot be interrupted part-way.
              </p>
              {pending.state === 'off' && (
                <p className="mt-2 text-amber-300">
                  The projector will enter its cooling cycle. It cannot be powered
                  back on until cooling finishes.
                </p>
              )}
            </>
          ) : (
            <p>
              {pending?.state === 'closed'
                ? 'The image will be blanked. The lamp stays on.'
                : 'The image will be shown.'}
            </p>
          )
        }
        confirmLabel={pending?.kind === 'power' ? `Power ${pending.state}` : 'Confirm'}
        danger={pending?.kind === 'power' && pending.state === 'off'}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const command = pending
          setPending(null)
          if (command) void run(command)
        }}
      />

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
