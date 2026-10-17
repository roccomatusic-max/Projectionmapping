import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ApiError, api, downloadCsv, type Session } from '@/api/client'
import type { Alert, Enclosure, MaintenanceRecord, Projector, TelemetryPoint } from '@/api/types'
import {
  Chip,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Panel,
  Spinner,
  ToastStack,
  useToasts,
} from '@/components/ui'
import { Glyph, type Tone } from '@/components/graphics'
import { classNames, formatDateTime, relativeTime } from '@/lib/format'
import {
  CoverIcon,
  FaultIcon,
  LampIcon,
  MaintenanceIcon,
  MonitoringIcon,
  OkIcon,
  TemperatureIcon,
  WarningIcon,
  type LucideIcon,
} from '@/components/icons'

const CHART_AXIS = { stroke: '#64748b', fontSize: 11 }
const CHART_GRID = '#1f2733'

export default function Monitoring({ session }: { session: Session }) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [projectors, setProjectors] = useState<Projector[]>([])
  const [usage, setUsage] = useState<{
    note: string
    usage: Array<{ projector_id: number; day: string; estimated_on_hours: number }>
  } | null>(null)
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([])
  const [enclosures, setEnclosures] = useState<Enclosure[]>([])
  const [lampSeries, setLampSeries] = useState<TelemetryPoint[]>([])
  const [selectedProjector, setSelectedProjector] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { toasts, push, dismiss } = useToasts()

  const canAcknowledge = session.role !== 'viewer'

  const load = async () => {
    try {
      const [a, p, u, m, e] = await Promise.all([
        api.alerts(),
        api.listProjectors(),
        api.usage(30),
        api.maintenance(),
        api.listEnclosures(),
      ])
      setAlerts(a)
      setProjectors(p)
      setUsage(u)
      setMaintenance(m)
      setEnclosures(e)
      // Functional update: the 30 s refresh closes over the initial null and
      // must not overwrite a projector the operator has since chosen. Prefer
      // a projector that is actually answering for the charts.
      if (p.length > 0) {
        const first = p.find((x) => x.state.online && !x.state.stale) ?? p[0]
        setSelectedProjector((current) => current ?? first.id)
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load monitoring data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 30000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedProjector === null) return
    void api
      .telemetry(selectedProjector, undefined, 30)
      .then((result) =>
        setLampSeries(result.points.filter((point) => point.metric.startsWith('lamp'))),
      )
      .catch(() => undefined)
  }, [selectedProjector])

  if (loading) return <Spinner />

  const usageByDay = Object.values(
    (usage?.usage ?? [])
      .filter((row) => selectedProjector === null || row.projector_id === selectedProjector)
      .reduce<Record<string, { day: string; hours: number }>>((acc, row) => {
        acc[row.day] = acc[row.day] ?? { day: row.day, hours: 0 }
        acc[row.day].hours += row.estimated_on_hours
        return acc
      }, {}),
  ).sort((a, b) => a.day.localeCompare(b.day))

  const lampByTime = lampSeries.reduce<Record<string, Record<string, number | string>>>(
    (acc, point) => {
      const key = point.recorded_at.slice(0, 10)
      acc[key] = acc[key] ?? { day: key }
      if (point.value_num != null) acc[key][point.metric] = point.value_num
      return acc
    },
    {},
  )
  const lampRows = Object.values(lampByTime).sort((a, b) =>
    String(a.day).localeCompare(String(b.day)),
  )
  const lampMetrics = [...new Set(lampSeries.map((point) => point.metric))].sort()

  return (
    <div className="space-y-5">
      <PageHeader
        icon={MonitoringIcon}
        title="Monitoring"
        subtitle={`${alerts.filter((a) => a.state === 'open').length} open alert(s) · ${enclosures.length} enclosure(s)`}
        actions={
          <label className="flex items-center gap-2 text-xs text-slate-400">
            Charts for
            <select
              className="input w-auto"
              value={selectedProjector ?? ''}
              onChange={(event) => setSelectedProjector(Number(event.target.value))}
            >
              {projectors.map((projector) => (
                <option key={projector.id} value={projector.id}>
                  {projector.name}
                </option>
              ))}
            </select>
          </label>
        }
      />

      {error && <ErrorBanner message={error} />}

      <Panel
        icon={FaultIcon}
        title="Open alerts"
        description="One notification per unresolved condition. Acknowledging silences repeats without resolving it."
      >
        {alerts.length === 0 ? (
          <EmptyState title="No open alerts" icon={OkIcon}>Everything the platform monitors is nominal.</EmptyState>
        ) : (
          <ul className="divide-y divide-white/5">
            {alerts.map((alert) => (
              <li key={alert.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-slate-200">{alert.message}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {alert.kind} · opened {relativeTime(alert.opened_at)}
                    {alert.notify_count > 1 && ` · notified ${alert.notify_count}×`}
                    {alert.acknowledged_by && ` · acknowledged by ${alert.acknowledged_by}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Chip tone={alert.severity === 'critical' ? 'fault' : 'warn'}>
                    {alert.severity}
                  </Chip>
                  {alert.state === 'open' && canAcknowledge && (
                    <button
                      className="btn-default text-xs"
                      onClick={async () => {
                        try {
                          await api.acknowledgeAlert(alert.id)
                          push('ok', 'Alert acknowledged')
                          void load()
                        } catch (err) {
                          push(
                            'fault',
                            'Could not acknowledge',
                            err instanceof ApiError ? err.message : undefined,
                          )
                        }
                      }}
                    >
                      Acknowledge
                    </button>
                  )}
                  {alert.state === 'acknowledged' && <Chip tone="idle">acknowledged</Chip>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        icon={TemperatureIcon}
        title="Enclosures"
        description="Latest reading per sensor, each with its own age. A stale reading is shown as stale, never as current. Monitoring software is not a safety device."
      >
        {enclosures.length === 0 ? (
          <EmptyState title="No enclosures configured" icon={CoverIcon}>
            Register an enclosure and post sensor readings to it (see the Integrations guide) to see temperature, humidity and leak state here.
          </EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {enclosures.map((enclosure) => (
              <EnclosureTile
                key={enclosure.id}
                enclosure={enclosure}
                projectorName={enclosure.projector_id ? projectors.find((p) => p.id === enclosure.projector_id)?.name : undefined}
              />
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          icon={MonitoringIcon}
          title="Estimated daily operating hours"
          description={usage?.note}
        >
          {usageByDay.length === 0 ? (
            <EmptyState title="No usage data yet">
              Operating hours accumulate as the monitor polls.
            </EmptyState>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={usageByDay}>
                <CartesianGrid stroke={CHART_GRID} vertical={false} />
                <XAxis dataKey="day" {...CHART_AXIS} tickLine={false} />
                <YAxis {...CHART_AXIS} tickLine={false} axisLine={false} unit="h" />
                <Tooltip
                  contentStyle={{
                    background: '#141820',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="hours" fill="#38bdf8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel
          icon={LampIcon}
          title="Lamp hours over time"
          description="Read from the projector's own runtime counter — the authoritative figure."
        >
          {lampRows.length === 0 ? (
            <EmptyState title="No lamp history yet">
              Lamp runtime is read on the maintenance polling tier (every 5 minutes by
              default).
            </EmptyState>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={lampRows}>
                <CartesianGrid stroke={CHART_GRID} vertical={false} />
                <XAxis dataKey="day" {...CHART_AXIS} tickLine={false} />
                <YAxis {...CHART_AXIS} tickLine={false} axisLine={false} unit="h" />
                <Tooltip
                  contentStyle={{
                    background: '#141820',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                {lampMetrics.map((metric, index) => (
                  <Line
                    key={metric}
                    type="monotone"
                    dataKey={metric}
                    stroke={['#38bdf8', '#22c55e', '#f59e0b', '#a78bfa'][index % 4]}
                    // A single day of data has no line to draw; show the points.
                    dot={lampRows.length < 3}
                    strokeWidth={2}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <Panel
        icon={MaintenanceIcon}
        title="Maintenance"
        action={
          <button
            className="btn-default text-xs"
            onClick={() =>
              void downloadCsv(api.maintenanceCsvUrl(), 'maintenance.csv').catch(() =>
                push('fault', 'Export failed'),
              )
            }
          >
            Export CSV
          </button>
        }
      >
        <MaintenanceSection
          records={maintenance}
          projectors={projectors}
          canEdit={session.role !== 'viewer'}
          onAdded={() => void load()}
          onError={(message) => push('fault', 'Could not save', message)}
        />
      </Panel>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}

function MaintenanceSection({
  records,
  projectors,
  canEdit,
  onAdded,
  onError,
}: {
  records: MaintenanceRecord[]
  projectors: Projector[]
  canEdit: boolean
  onAdded: () => void
  onError: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    projector_id: projectors[0]?.id ?? 0,
    kind: 'lamp_replacement',
    lamp_index: 1,
    hours_at_service: 0,
    notes: '',
  })
  const [busy, setBusy] = useState(false)
  const names = Object.fromEntries(projectors.map((p) => [p.id, p.name]))

  return (
    <div className="space-y-3">
      {canEdit && (
        <div>
          <button className="btn-default text-xs" onClick={() => setOpen((v) => !v)}>
            {open ? 'Cancel' : 'Record maintenance'}
          </button>
        </div>
      )}

      {open && (
        <form
          className="grid gap-3 rounded-md bg-panel-850 p-3 sm:grid-cols-5"
          onSubmit={async (event) => {
            event.preventDefault()
            setBusy(true)
            try {
              await api.addMaintenance(form)
              setOpen(false)
              onAdded()
            } catch (err) {
              onError(err instanceof ApiError ? err.message : 'Could not save')
            } finally {
              setBusy(false)
            }
          }}
        >
          <div>
            <label className="label">Projector</label>
            <select
              className="input"
              value={form.projector_id}
              onChange={(e) =>
                setForm({ ...form, projector_id: Number(e.target.value) })
              }
            >
              {projectors.map((projector) => (
                <option key={projector.id} value={projector.id}>
                  {projector.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Type</label>
            <select
              className="input"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
            >
              <option value="lamp_replacement">Lamp replacement</option>
              <option value="filter_clean">Filter clean</option>
              <option value="filter_replacement">Filter replacement</option>
              <option value="service">Service</option>
              <option value="note">Note</option>
            </select>
          </div>
          <div>
            <label className="label">Lamp #</label>
            <input
              className="input tnum"
              type="number"
              min={1}
              max={4}
              value={form.lamp_index}
              onChange={(e) => setForm({ ...form, lamp_index: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Hours at service</label>
            <input
              className="input tnum"
              type="number"
              value={form.hours_at_service}
              onChange={(e) =>
                setForm({ ...form, hours_at_service: Number(e.target.value) })
              }
            />
          </div>
          <div className="sm:col-span-5">
            <label className="label">Notes</label>
            <input
              className="input"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="sm:col-span-5">
            <button className="btn-primary text-xs" disabled={busy}>
              {busy ? 'Saving…' : 'Save record'}
            </button>
          </div>
        </form>
      )}

      {records.length === 0 ? (
        <p className="text-sm text-slate-500">No maintenance recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="pb-2 pr-4 font-medium">Date</th>
                <th className="pb-2 pr-4 font-medium">Projector</th>
                <th className="pb-2 pr-4 font-medium">Type</th>
                <th className="pb-2 pr-4 font-medium">Lamp</th>
                <th className="pb-2 pr-4 font-medium">Hours</th>
                <th className="pb-2 pr-4 font-medium">By</th>
                <th className="pb-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {records.map((record) => (
                <tr key={record.id}>
                  <td className="py-1.5 pr-4 tnum text-slate-400">
                    {formatDateTime(record.performed_at)}
                  </td>
                  <td className="py-1.5 pr-4 text-slate-300">
                    {names[record.projector_id] ?? record.projector_id}
                  </td>
                  <td className="py-1.5 pr-4 text-slate-300">{record.kind}</td>
                  <td className="py-1.5 pr-4 tnum text-slate-400">
                    {record.lamp_index ?? '—'}
                  </td>
                  <td className="py-1.5 pr-4 tnum text-slate-400">
                    {record.hours_at_service ?? '—'}
                  </td>
                  <td className="py-1.5 pr-4 text-slate-500">
                    {record.performed_by ?? '—'}
                  </td>
                  <td className="py-1.5 text-slate-400">{record.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


const METRIC_ICON: Record<string, LucideIcon> = {
  temperature: TemperatureIcon,
  humidity: MonitoringIcon,
  leak: WarningIcon,
  door: CoverIcon,
  fan: MonitoringIcon,
}

function readingTone(enclosure: Enclosure, metric: string, value: number | string | null, stale: boolean): Tone {
  if (stale || value == null) return 'unknown'
  const n = typeof value === 'number' ? value : Number(value)
  if (metric === 'temperature' && !Number.isNaN(n)) {
    if (n >= enclosure.temp_critical_c) return 'fault'
    if (n >= enclosure.temp_warn_c) return 'warn'
    return 'ok'
  }
  if (metric === 'humidity' && !Number.isNaN(n)) return n >= enclosure.humidity_warn_pct ? 'warn' : 'ok'
  if (metric === 'leak' || metric === 'door') return n ? 'fault' : 'ok'
  return 'ok'
}

function formatReading(metric: string, value: number | string | null): string {
  if (value == null) return '—'
  if (typeof value !== 'number') return String(value)
  if (metric === 'temperature') return `${value.toFixed(1)} °C`
  if (metric === 'humidity') return `${Math.round(value)} %`
  if (metric === 'leak') return value ? 'Water detected' : 'Dry'
  if (metric === 'door') return value ? 'Open' : 'Closed'
  return value.toLocaleString()
}

function EnclosureTile({ enclosure, projectorName }: { enclosure: Enclosure; projectorName?: string }) {
  const entries = Object.entries(enclosure.latest)
  const worst = entries.reduce<Tone>((acc, [metric, r]) => {
    const t = readingTone(enclosure, metric, r.value, r.stale)
    const rank: Record<Tone, number> = { fault: 4, warn: 3, unknown: 2, busy: 1, ok: 0, idle: 0 }
    return rank[t] > rank[acc] ? t : acc
  }, entries.length ? 'ok' : 'unknown')
  const ringTone: Record<Tone, string> = {
    ok: 'ring-emerald-500/30', warn: 'ring-amber-500/40', fault: 'ring-red-500/50',
    unknown: 'ring-white/10', idle: 'ring-white/10', busy: 'ring-sky-500/30',
  }
  return (
    <div className={classNames('rounded-lg bg-panel-850 p-3 ring-1', ringTone[worst])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-100">{enclosure.name}</p>
          <p className="truncate text-xs text-slate-500">
            {[enclosure.location, projectorName && `houses ${projectorName}`].filter(Boolean).join(' · ') || 'No location set'}
          </p>
        </div>
        {enclosure.block_startup_on_fault && (
          <Chip tone="idle" title="Automations with an enclosure check refuse to start while this enclosure reports a fault or stale data.">
            blocks startup
          </Chip>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">No readings received yet.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {entries.map(([metric, r]) => (
            <div key={metric}>
              <Glyph
                icon={METRIC_ICON[metric] ?? MonitoringIcon}
                tone={readingTone(enclosure, metric, r.value, r.stale)}
                caption={metric}
                label={formatReading(metric, r.value)}
                size="sm"
              />
              <p className={classNames('mt-1 pl-11 text-[11px]', r.stale ? 'text-amber-400' : 'text-slate-500')}>
                {relativeTime(r.recorded_at)}{r.stale && ' · stale'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
