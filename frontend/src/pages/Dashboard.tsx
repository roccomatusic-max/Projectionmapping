import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Session } from '@/api/client'
import type { Projector } from '@/api/types'
import { useFleetContext } from '@/live/LiveProvider'
import { useTicker } from '@/hooks/useLiveData'
import { FleetBrowser } from '@/components/fleet/FleetBrowser'
import { Banner, EmptyState, PageHeader, Panel, Spinner, StatusDot } from '@/components/ui'
import { FleetBar, type FleetSegmentKind } from '@/components/graphics'
import { TONE_TEXT } from '@/components/tone'
import { TonightShow } from '@/components/tonight/TonightShow'
import { HeaterStatus } from '@/components/heater/HeaterStatus'
import {
  AddIcon,
  AlertsIcon,
  ChevronIcon,
  DashboardIcon,
  OkIcon,
  RefreshIcon,
  WarningIcon,
} from '@/components/icons'
import { classNames, relativeTime } from '@/lib/format'
import {
  attentionItems,
  attentionTone,
  isLive,
  type AttentionItem,
  type FleetFilter,
} from '@/lib/status'

function segmentKind(p: Projector): FleetSegmentKind {
  if (!isLive(p)) return 'offline'
  if (p.state.power === 'on') return 'on'
  if (p.state.power === 'warming' || p.state.power === 'cooling') return 'transition'
  return 'standby'
}

const SEVERITY_ORDER = { critical: 0, warning: 1, notice: 2 } as const

/**
 * One box for everything that needs a look: open alerts first, then each
 * projector with something wrong. The fleet's counts are the filter chips
 * above the projectors, and recent commands are under Activity at the top.
 */
function AttentionPanel({ projectors }: { projectors: Projector[] }) {
  const { alerts } = useFleetContext()
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
  const open = useMemo(
    () =>
      alerts
        .filter((a) => a.state === 'open')
        .sort(
          (a, b) =>
            (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1) || b.opened_at.localeCompare(a.opened_at),
        ),
    [alerts],
  )
  const critical = open.filter((a) => a.severity === 'critical').length
  const summary = [
    open.length ? `${open.length} open alert${open.length === 1 ? '' : 's'}${critical ? ` · ${critical} critical` : ''}` : null,
    rows.length ? `${rows.length} projector${rows.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <Panel
      icon={WarningIcon}
      title="Needs attention"
      description={summary || undefined}
      action={<Link to="/alerts" className="btn-ghost btn-sm">All alerts</Link>}
      bodyClassName=""
    >
      {rows.length === 0 && open.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-4 text-sm text-slate-400">
          <OkIcon size={16} className="text-green-400" aria-hidden /> Nothing needs attention, and no open alerts.
        </p>
      ) : (
        <ul className="max-h-[32rem] divide-y divide-white/5 overflow-y-auto">
          {open.slice(0, 5).map((alert) => (
            <li key={`alert-${alert.id}`}>
              <Link to="/alerts" className="flex items-start gap-2.5 px-4 py-2 transition-colors hover:bg-white/[0.03]">
                <AlertsIcon size={14} className={classNames('mt-1 shrink-0', alert.severity === 'critical' ? 'text-red-400' : 'text-yellow-300')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm text-slate-200">{alert.message}</span>
                  <span className="text-2xs text-slate-500">alert · opened {relativeTime(alert.opened_at)}</span>
                </span>
              </Link>
            </li>
          ))}
          {open.length > 5 && (
            <li className="px-4 py-2 text-xs text-slate-500">
              <Link to="/alerts" className="hover:text-slate-300">+{open.length - 5} more alerts</Link>
            </li>
          )}
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

export default function Dashboard({ session }: { session: Session }) {
  const { projectors, overview, loading, refresh, lastSync } = useFleetContext()
  const [filter, setFilter] = useState<FleetFilter>('all')
  useTicker(5000)

  const canControl = session.role !== 'viewer'
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
            ? <>What the show and every projector are doing right now <span className="whitespace-nowrap">· updated <span className="tnum">{relativeTime(new Date(lastSync).toISOString())}</span></span></>
            : 'What the show and every projector are doing right now'
        }
        actions={
          <button className="btn-default btn-sm" onClick={() => void refresh()}>
            <RefreshIcon size={14} aria-hidden /> Refresh
          </button>
        }
      />

      <TonightShow session={session} />

      <HeaterStatus session={session} />

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
          {segments.length > 1 && (
            <div className="px-1">
              <FleetBar segments={segments} />
            </div>
          )}

          {(overview?.stale ?? 0) > 0 && (
            <Banner tone="warn">
              {overview?.stale} projector{overview?.stale === 1 ? ' has' : 's have'} not answered recently. What you see for
              them is the last thing they reported, and it is marked as old.
            </Banner>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-4 xl:order-2">
              <AttentionPanel projectors={projectors} />
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
