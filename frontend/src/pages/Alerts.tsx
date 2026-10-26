import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, type Session } from '@/api/client'
import type { Alert } from '@/api/types'
import { useFleetContext, useOps } from '@/live/LiveProvider'
import { useTicker } from '@/hooks/useLiveData'
import { Chip, EmptyState, PageHeader, Panel, Spinner, StatusDot, Tabs } from '@/components/ui'
import { AlertsIcon, CheckIcon, OkIcon, PhoneIcon } from '@/components/icons'
import { classNames, formatDateTime, relativeTime } from '@/lib/format'

type View = 'unresolved' | 'resolved'
type Severity = 'all' | 'critical' | 'warning'

function kindLabel(kind: string): string {
  return kind.replace(/_/g, ' ')
}

function AlertRow({
  alert,
  projectorName,
  canAcknowledge,
  onAcknowledge,
}: {
  alert: Alert
  projectorName?: string
  canAcknowledge: boolean
  onAcknowledge: (alert: Alert) => void
}) {
  const tone = alert.state === 'resolved' ? 'idle' : alert.severity === 'critical' ? 'fault' : alert.severity === 'warning' ? 'warn' : 'idle'
  return (
    <li
      className={classNames(
        'flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start',
        alert.state === 'open' && alert.severity === 'critical' && 'bg-red-500/[0.04]',
      )}
    >
      <StatusDot tone={tone} className="mt-1.5 hidden sm:inline-flex" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={tone}>{alert.severity}</Chip>
          {projectorName && alert.projector_id != null && (
            <Link to={`/projectors/${alert.projector_id}`} className="text-sm font-medium text-slate-100 hover:text-sky-300">
              {projectorName}
            </Link>
          )}
          <span className="text-xs text-slate-500">{kindLabel(alert.kind)}</span>
        </div>
        <p className="mt-1 break-words text-sm text-slate-200">{alert.message}</p>
        <p className="tnum mt-0.5 text-2xs text-slate-500" title={formatDateTime(alert.opened_at)}>
          Opened {relativeTime(alert.opened_at)}
          {alert.notify_count > 1 && ` · notified ${alert.notify_count}×`}
          {alert.acknowledged_by && ` · acknowledged by ${alert.acknowledged_by} ${relativeTime(alert.acknowledged_at)}`}
          {alert.resolved_at && ` · resolved ${relativeTime(alert.resolved_at)}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {alert.state === 'open' && canAcknowledge && (
          <button className="btn-default btn-sm" onClick={() => onAcknowledge(alert)}>
            <CheckIcon size={13} aria-hidden /> Acknowledge
          </button>
        )}
        {alert.state === 'acknowledged' && <Chip tone="idle">Acknowledged</Chip>}
      </div>
    </li>
  )
}

/**
 * Every unresolved condition the platform is watching, worst first.
 * Acknowledging silences repeat notifications; the alert stays until the
 * condition itself clears.
 */
export default function Alerts({ session }: { session: Session }) {
  const { alerts, projectors, refreshAlerts, overview } = useFleetContext()
  const { notify } = useOps()
  const [view, setView] = useState<View>('unresolved')
  const [severity, setSeverity] = useState<Severity>('all')
  const [resolved, setResolved] = useState<Alert[] | null>(null)
  useTicker(10000)

  const canAcknowledge = session.role !== 'viewer'
  const names = useMemo(() => Object.fromEntries(projectors.map((p) => [p.id, p.name])), [projectors])

  useEffect(() => {
    void refreshAlerts()
  }, [refreshAlerts])

  useEffect(() => {
    if (view !== 'resolved') return
    setResolved(null)
    api.alerts('resolved').then(setResolved).catch(() => setResolved([]))
  }, [view])

  const source = view === 'unresolved' ? alerts : (resolved ?? [])
  const shown = useMemo(() => {
    const rank = (a: Alert) => (a.state === 'open' ? 0 : 1) * 10 + (a.severity === 'critical' ? 0 : a.severity === 'warning' ? 1 : 2)
    return source
      .filter((a) => severity === 'all' || a.severity === severity)
      .sort((a, b) => (view === 'unresolved' ? rank(a) - rank(b) : 0) || b.opened_at.localeCompare(a.opened_at))
  }, [source, severity, view])

  const acknowledge = async (alert: Alert) => {
    try {
      await api.acknowledgeAlert(alert.id)
      notify('ok', 'Alert acknowledged', 'Repeat notifications are silenced until the condition clears.')
      void refreshAlerts()
    } catch (err) {
      notify('fault', 'Could not acknowledge', err instanceof ApiError ? err.message : undefined)
    }
  }

  const openCount = alerts.filter((a) => a.state === 'open').length
  const acknowledged = alerts.filter((a) => a.state === 'acknowledged').length

  return (
    <div className="space-y-4">
      <PageHeader
        icon={AlertsIcon}
        title="Alerts"
        subtitle={
          overview
            ? `${openCount} open · ${acknowledged} acknowledged · ${overview.critical_alerts} critical`
            : undefined
        }
        actions={
          <div className="seg" role="group" aria-label="Severity">
            {(['all', 'critical', 'warning'] as Severity[]).map((value) => (
              <button
                key={value}
                className={classNames('seg-item px-2.5 py-1 text-xs capitalize', severity === value && 'seg-item-active')}
                aria-pressed={severity === value}
                onClick={() => setSeverity(value)}
              >
                {value}
              </button>
            ))}
          </div>
        }
      />

      <section className="panel">
        <Tabs
          className="px-2"
          value={view}
          onChange={setView}
          tabs={[
            { id: 'unresolved', label: 'Unresolved', badge: alerts.length > 0 ? <span className="tnum text-xs text-slate-500">{alerts.length}</span> : undefined },
            { id: 'resolved', label: 'Recently resolved' },
          ]}
        />
        {view === 'resolved' && resolved === null ? (
          <div className="p-4">
            <Spinner />
          </div>
        ) : shown.length === 0 ? (
          <EmptyState title={view === 'unresolved' ? 'No unresolved alerts' : 'Nothing resolved yet'} icon={OkIcon}>
            {view === 'unresolved' ? 'Everything the platform monitors is nominal.' : undefined}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-white/5">
            {shown.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                projectorName={alert.projector_id != null ? names[alert.projector_id] : undefined}
                canAcknowledge={canAcknowledge}
                onAcknowledge={acknowledge}
              />
            ))}
          </ul>
        )}
      </section>

      <Panel>
        <p className="text-xs text-slate-500">
          Alerts open when a projector stops answering, runs hot, reports a fault or warning, passes its lamp
          thresholds, does not confirm a command or shuts down unexpectedly, when a mini PC goes offline, when
          tonight's show does not start, when an automation fails, or when an enclosure sensor goes out of range.
          Each closes by itself once its condition clears.
        </p>
        {session.role === 'admin' && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
            <PhoneIcon size={13} aria-hidden />
            Get them on your phone, even with the app closed:{' '}
            <Link to="/settings?part=phone" className="text-sky-300 hover:underline">
              Settings → Phone alerts
            </Link>
          </p>
        )}
      </Panel>
    </div>
  )
}
