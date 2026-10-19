import { useEffect, useRef, useState } from 'react'
import { api } from '@/api/client'
import type { EventRow, Projector } from '@/api/types'
import { Chip, EmptyState, ErrorBanner, PageHeader, Panel, Spinner, StatusDot } from '@/components/ui'
import { formatDateTime } from '@/lib/format'
import { LiveIcon, LogsIcon } from '@/components/icons'
import { useBusMessages } from '@/hooks/useLiveData'

export default function Logs() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [projectors, setProjectors] = useState<Projector[]>([])
  const [severity, setSeverity] = useState('')
  const [projectorId, setProjectorId] = useState('')
  const [hours, setHours] = useState(168)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Live tail: command results stream in alongside the stored event log.
  const live = useBusMessages(
    ['command_result', 'command_verified', 'command_unverified', 'alert'],
    () => undefined,
    40,
  )

  // Only the newest request's reply is shown, so a slow reply for the
  // previous filter cannot overwrite the current one.
  const latest = useRef(0)
  const load = async () => {
    const request = ++latest.current
    setLoading(true)
    try {
      const rows = await api.events({
        hours,
        severity: severity || undefined,
        projector_id: projectorId ? Number(projectorId) : undefined,
      })
      if (request !== latest.current) return
      setEvents(rows)
      setError(null)
    } catch (err) {
      if (request !== latest.current) return
      setError(err instanceof Error ? err.message : 'Failed to load events')
    } finally {
      if (request === latest.current) setLoading(false)
    }
  }

  useEffect(() => {
    void api.listProjectors().then(setProjectors).catch(() => undefined)
  }, [])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severity, projectorId, hours])

  const names = Object.fromEntries(projectors.map((p) => [p.id, p.name]))

  return (
    <div className="space-y-5">
      <PageHeader icon={LogsIcon} title="Logs" subtitle="Commands with their wire frames and replies, plus system events." />
      {error && <ErrorBanner message={error} />}

      <Panel
        icon={LiveIcon}
        title="Live activity"
        description="Commands and alerts as they happen on this server."
      >
        {live.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nothing yet. Activity appears here as commands are dispatched.
          </p>
        ) : (
          <ul className="max-h-64 divide-y divide-white/5 overflow-y-auto text-xs">
            {live.map((message, index) => {
              const outcome = String(message.payload.outcome ?? '')
              const good = ['confirmed', 'accepted', 'ok', 'queued'].includes(outcome)
              return (
                <li key={`${message.at}-${index}`} className="flex items-center gap-3 py-1.5">
                  <StatusDot tone={message.type === 'alert' ? 'fault' : !outcome ? 'busy' : good ? 'ok' : 'fault'} />
                  <span className="tnum w-20 shrink-0 text-slate-500">{new Date(message.at).toLocaleTimeString()}</span>
                  <span className="w-36 shrink-0 truncate text-slate-300">{String(message.payload.name ?? '—')}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-slate-400">
                    {String(message.payload.capability ?? message.payload.message ?? message.type)}
                  </span>
                  {outcome && <span className={good ? 'text-green-400' : 'text-red-400'}>{outcome}</span>}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel
        icon={LogsIcon}
        title="Event history"
        action={
          <div className="flex flex-wrap gap-2">
            <select
              className="input w-auto text-xs"
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
            >
              <option value="">All severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
            <select
              className="input w-auto text-xs"
              value={projectorId}
              onChange={(event) => setProjectorId(event.target.value)}
            >
              <option value="">All projectors</option>
              {projectors.map((projector) => (
                <option key={projector.id} value={projector.id}>
                  {projector.name}
                </option>
              ))}
            </select>
            <select
              className="input w-auto text-xs"
              value={hours}
              onChange={(event) => setHours(Number(event.target.value))}
            >
              <option value={24}>Last 24 hours</option>
              <option value={168}>Last 7 days</option>
              <option value={720}>Last 30 days</option>
            </select>
          </div>
        }
      >
        {loading ? (
          <Spinner />
        ) : events.length === 0 ? (
          <EmptyState title="No events in this range" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table text-xs">
              <thead>
                <tr>
                  <th className="pl-3">Time</th>
                  <th>Severity</th>
                  <th>Projector</th>
                  <th>Kind</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr
                    key={event.id}
                    className={
                      event.severity === 'critical'
                        ? 'shadow-[inset_3px_0_0_0_#ef4444]'
                        : event.severity === 'warning'
                          ? 'shadow-[inset_3px_0_0_0_#f59e0b]'
                          : undefined
                    }
                  >
                    <td className="whitespace-nowrap py-1.5 pl-3 pr-4 tnum text-slate-400">
                      {formatDateTime(event.created_at)}
                    </td>
                    <td className="py-1.5 pr-4">
                      <Chip
                        tone={
                          event.severity === 'critical'
                            ? 'fault'
                            : event.severity === 'warning'
                              ? 'warn'
                              : 'idle'
                        }
                      >
                        {event.severity}
                      </Chip>
                    </td>
                    <td className="py-1.5 pr-4 text-slate-400">
                      {event.projector_id ? names[event.projector_id] ?? event.projector_id : '—'}
                    </td>
                    <td className="py-1.5 pr-4 font-mono text-slate-500">{event.kind}</td>
                    <td className="py-1.5 text-slate-300">{event.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
