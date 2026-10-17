import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import type { EventRow, Projector } from '@/api/types'
import { Chip, EmptyState, ErrorBanner, Panel, Spinner } from '@/components/ui'
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

  const load = async () => {
    setLoading(true)
    try {
      const rows = await api.events({
        hours,
        severity: severity || undefined,
        projector_id: projectorId ? Number(projectorId) : undefined,
      })
      setEvents(rows)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events')
    } finally {
      setLoading(false)
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
      <h1 className="text-lg font-semibold text-slate-100">Logs</h1>
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
          <ul className="max-h-64 space-y-1 overflow-y-auto font-mono text-xs">
            {live.map((message, index) => (
              <li key={`${message.at}-${index}`} className="text-slate-400">
                <span className="text-slate-600">
                  {new Date(message.at).toLocaleTimeString()}
                </span>{' '}
                <span className="text-sky-400">{message.type}</span>{' '}
                {String(message.payload.name ?? '')}{' '}
                {String(message.payload.capability ?? message.payload.message ?? '')}{' '}
                <span
                  className={
                    ['confirmed', 'accepted', 'ok'].includes(
                      String(message.payload.outcome),
                    )
                      ? 'text-emerald-400'
                      : message.payload.outcome
                        ? 'text-red-400'
                        : ''
                  }
                >
                  {String(message.payload.outcome ?? '')}
                </span>
              </li>
            ))}
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
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-2 pr-4 font-medium">Time</th>
                  <th className="pb-2 pr-4 font-medium">Severity</th>
                  <th className="pb-2 pr-4 font-medium">Projector</th>
                  <th className="pb-2 pr-4 font-medium">Kind</th>
                  <th className="pb-2 font-medium">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="whitespace-nowrap py-1.5 pr-4 tnum text-slate-400">
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
