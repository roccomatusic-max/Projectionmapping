import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Session } from '@/api/client'
import type { Overview, Projector } from '@/api/types'
import { useFleetContext, useOps } from '@/live/LiveProvider'
import { useTicker } from '@/hooks/useLiveData'
import { FleetBrowser } from '@/components/fleet/FleetBrowser'
import { PhaseBadge } from '@/components/status'
import { Banner, EmptyState, PageHeader, Panel, Spinner, StatusDot } from '@/components/ui'
import { FleetBar, type FleetSegmentKind } from '@/components/graphics'
import { TONE_TEXT } from '@/components/tone'
import {
  AddIcon,
  AlertsIcon,
  ChevronIcon,
  DashboardIcon,
  HistoryIcon,
  OkIcon,
  RefreshIcon,
  WarningIcon,
} from '@/components/icons'
import { classNames, relativeTime } from '@/lib/format'
import {
  attentionItems,
  attentionTone,
  isLive,
  matchesFilter,
  type AttentionItem,
  type FleetFilter,
  type Tone,
} from '@/lib/status'

function segmentKind(p: Projector): FleetSegmentKind {
  if (!isLive(p)) return 'offline'
  if (p.state.power === 'on') return 'on'
  if (p.state.power === 'warming' || p.state.power === 'cooling') return 'transition'
  return 'standby'
}

function Metric({
  label,
  value,
  sub,
  tone = 'idle',
  active,
  onClick,
  title,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: Tone
  active?: boolean
  onClick?: () => void
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={classNames(
        'group flex min-w-0 flex-col items-start gap-0.5 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]',
        active && 'bg-sky-500/[0.07] shadow-[inset_0_-2px_0_theme(colors.sky.400)]',
      )}
    >
      <span className="eyebrow flex items-center gap-1.5">
        <StatusDot tone={tone} />
        {label}
      </span>
      <span className={classNames('tnum text-2xl font-semibold leading-tight', tone === 'idle' ? 'text-slate-100' : TONE_TEXT[tone])}>
        {value}
      </span>
      {sub && <span className="truncate text-2xs text-slate-500">{sub}</span>}
    </button>
  )
}

function OverviewStrip({
  overview,
  projectors,
  attentionCount,
  filter,
  onFilter,
}: {
  overview: Overview | null
  projectors: Projector[]
  attentionCount: number
  filter: FleetFilter
  onFilter: (filter: FleetFilter) => void
}) {
  const toggle = (next: FleetFilter) => onFilter(filter === next ? 'all' : next)
  const transitioning = (overview?.warming ?? 0) + (overview?.cooling ?? 0)
  const offline = projectors.filter((p) => matchesFilter(p, 'offline')).length
  const online = projectors.filter((p) => matchesFilter(p, 'online')).length
  const enabled = projectors.filter((p) => p.enabled).length
  // Counted here, with the same rules the cards use, so the strip and the
  // grid can never disagree.
  const warnings = projectors.filter((p) => matchesFilter(p, 'warnings')).length
  const faults = projectors.filter((p) => matchesFilter(p, 'faults')).length
  return (
    <div className="panel grid grid-cols-2 divide-white/[0.06] overflow-hidden sm:grid-cols-3 lg:grid-cols-6 lg:divide-x [&>*]:border-b [&>*]:border-white/[0.06] lg:[&>*]:border-b-0">
      <Metric
        label="Projectors"
        value={overview?.total ?? projectors.length}
        sub={enabled === projectors.length ? 'all enabled' : `${enabled} enabled`}
        active={filter === 'all'}
        onClick={() => onFilter('all')}
        title="Show every projector"
      />
      <Metric
        label="Online"
        value={
          <>
            {online}
            <span className="text-base font-normal text-slate-500">/{enabled}</span>
          </>
        }
        sub={offline > 0 ? <span className="text-slate-400">{offline} offline</span> : 'all responding'}
        tone={offline > 0 ? 'idle' : online > 0 ? 'ok' : 'idle'}
        active={filter === 'offline'}
        onClick={() => toggle(offline > 0 ? 'offline' : 'online')}
        title="Counted from a successful poll inside the staleness window, not from a remembered state. Click to filter."
      />
      <Metric
        label="Powered on"
        value={overview?.powered_on ?? '—'}
        sub={`${overview?.standby ?? 0} standby${transitioning ? ` · ${transitioning} transitioning` : ''}`}
        tone={(overview?.powered_on ?? 0) > 0 ? 'ok' : 'idle'}
        active={filter === 'on'}
        onClick={() => toggle('on')}
        title="Click to filter"
      />
      <Metric
        label="Warnings"
        value={warnings}
        tone={warnings > 0 ? 'warn' : 'idle'}
        sub="device-reported"
        active={filter === 'warnings'}
        onClick={() => toggle('warnings')}
        title="Projectors reporting a warning (fan, temperature, filter, cover or lamp). Click to filter."
      />
      <Metric
        label="Faults"
        value={faults}
        tone={faults > 0 ? 'fault' : 'idle'}
        sub="device-reported"
        active={filter === 'faults'}
        onClick={() => toggle('faults')}
        title="Projectors reporting an error. Unreachable projectors are counted under Online. Click to filter."
      />
      <Metric
        label="Need attention"
        value={attentionCount}
        tone={attentionCount > 0 ? 'warn' : 'ok'}
        sub={attentionCount > 0 ? 'offline, faults, warnings, lamps' : 'nothing outstanding'}
        active={filter === 'attention'}
        onClick={() => toggle('attention')}
        title="Projectors that are offline, faulted, warning or past lamp replacement. Click to filter."
      />
    </div>
  )
}

const SEVERITY_ORDER = { critical: 0, warning: 1, notice: 2 } as const

function AttentionPanel({ projectors }: { projectors: Projector[] }) {
  const rows = useMemo(
    () =>
      projectors
        .map((projector) => ({ projector, items: attentionItems(projector) }))
        .filter((row) => row.items.length > 0)
        .sort(
          (a, b) =>
            SEVERITY_ORDER[a.items[0].severity] - SEVERITY_ORDER[b.items[0].severity] ||
            a.projector.name.localeCompare(b.projector.name),
        ),
    [projectors],
  )
  return (
    <Panel
      icon={WarningIcon}
      title="Needs attention"
      description={rows.length ? `${rows.length} projector${rows.length === 1 ? '' : 's'}` : undefined}
      bodyClassName=""
    >
      {rows.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-4 text-sm text-slate-400">
          <OkIcon size={16} className="text-green-400" aria-hidden /> Nothing needs attention.
        </p>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-white/5 overflow-y-auto">
          {rows.map(({ projector, items }) => (
            <li key={projector.id}>
              <Link
                to={`/projectors/${projector.id}`}
                className="flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-white/[0.03]"
              >
                <StatusDot tone={attentionTone(items[0].severity)} className="mt-1.5" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-100">{projector.name}</span>
                  {items.slice(0, 3).map((item: AttentionItem) => (
                    <span
                      key={item.text}
                      className={classNames('block truncate text-xs', TONE_TEXT[attentionTone(item.severity)])}
                      title={item.detail}
                    >
                      {item.text}
                      {item.detail && <span className="text-slate-500"> · {item.detail}</span>}
                    </span>
                  ))}
                </span>
                <ChevronIcon size={15} className="mt-0.5 shrink-0 text-slate-600" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function AlertsSummary() {
  const { alerts, overview } = useFleetContext()
  const open = alerts.filter((a) => a.state === 'open')
  const sorted = [...open].sort(
    (a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1) || b.opened_at.localeCompare(a.opened_at),
  )
  return (
    <Panel
      icon={AlertsIcon}
      title="Alerts"
      description={
        overview && overview.open_alerts > 0
          ? `${overview.open_alerts} unresolved · ${overview.critical_alerts} critical`
          : undefined
      }
      action={<Link to="/alerts" className="btn-ghost btn-sm">All alerts</Link>}
      bodyClassName=""
    >
      {sorted.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-4 text-sm text-slate-400">
          <OkIcon size={16} className="text-green-400" aria-hidden /> No open alerts.
        </p>
      ) : (
        <ul className="divide-y divide-white/5">
          {sorted.slice(0, 5).map((alert) => (
            <li key={alert.id} className="flex items-start gap-2.5 px-4 py-2">
              <StatusDot tone={alert.severity === 'critical' ? 'fault' : 'warn'} className="mt-1.5" />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm text-slate-200">{alert.message}</span>
                <span className="text-2xs text-slate-500">opened {relativeTime(alert.opened_at)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function RecentCommands() {
  const { commands } = useOps()
  useTicker(5000)
  if (commands.length === 0) return null
  return (
    <Panel icon={HistoryIcon} title="Recent commands" description="From this browser" bodyClassName="">
      <ul className="divide-y divide-white/5">
        {commands.slice(0, 6).map((command) => (
          <li key={command.id} className="flex items-center justify-between gap-2 px-4 py-2" title={command.detail}>
            <span className="min-w-0">
              <span className="block truncate text-sm text-slate-200">
                {command.projectorName} <span className="text-slate-500">· {command.label}</span>
              </span>
              <span className="text-2xs text-slate-500">{relativeTime(new Date(command.startedAt).toISOString())}</span>
            </span>
            <PhaseBadge command={command} />
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export default function Dashboard({ session }: { session: Session }) {
  const { projectors, overview, loading, refresh, lastSync } = useFleetContext()
  const [filter, setFilter] = useState<FleetFilter>('all')
  useTicker(5000)

  const canControl = session.role !== 'viewer'
  const attentionCount = useMemo(
    () => projectors.filter((p) => matchesFilter(p, 'attention')).length,
    [projectors],
  )
  const segments = useMemo(() => {
    const order: Record<FleetSegmentKind, number> = { on: 0, transition: 1, standby: 2, offline: 3 }
    return projectors
      .filter((p) => p.enabled)
      .map((p) => ({ name: p.name, kind: segmentKind(p) }))
      .sort((a, b) => order[a.kind] - order[b.kind])
  }, [projectors])

  return (
    <div className="space-y-4">
      <PageHeader
        icon={DashboardIcon}
        title="Dashboard"
        subtitle={
          lastSync
            ? <>Fleet state · updated <span className="tnum">{relativeTime(new Date(lastSync).toISOString())}</span></>
            : 'Fleet state'
        }
        actions={
          <button className="btn-default btn-sm" onClick={() => void refresh()}>
            <RefreshIcon size={14} aria-hidden /> Refresh
          </button>
        }
      />

      {loading ? (
        <div className="panel p-6">
          <Spinner label="Loading projectors…" />
        </div>
      ) : projectors.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="No projectors registered yet"
            action={
              session.role === 'admin' && (
                <Link to="/projectors?add=1" className="btn-primary">
                  <AddIcon size={15} aria-hidden /> Add your first projector
                </Link>
              )
            }
          >
            Add a projector by IP address to start monitoring and controlling it.
          </EmptyState>
        </div>
      ) : (
        <>
          <OverviewStrip
            overview={overview}
            projectors={projectors}
            attentionCount={attentionCount}
            filter={filter}
            onFilter={setFilter}
          />

          {segments.length > 1 && (
            <div className="px-1">
              <FleetBar segments={segments} />
            </div>
          )}

          {(overview?.stale ?? 0) > 0 && (
            <Banner tone="warn">
              {overview?.stale} projector{overview?.stale === 1 ? ' has' : 's have'} not answered recently. Their last
              known values are marked stale rather than shown as live.
            </Banner>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-4 xl:order-2">
              <AttentionPanel projectors={projectors} />
              {/* Phones and tablets have the Alerts tab; the wide layout
                  keeps alerts and recent commands beside the fleet. */}
              <div className="hidden space-y-4 xl:block">
                <AlertsSummary />
                <RecentCommands />
              </div>
            </div>
            <div className="min-w-0 xl:order-1">
              <FleetBrowser
                projectors={projectors}
                canControl={canControl}
                storageKey="pc.dashboard"
                defaultView="grid"
                filter={filter}
                onFilterChange={setFilter}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
