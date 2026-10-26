import { useEffect, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '@/api/client'
import type { TemperatureHistory as History, TemperatureSensorHistory, TemperatureState } from '@/api/types'
import { Banner, EmptyState, Panel, Spinner } from '@/components/ui'
import { ChartTooltip } from '@/components/monitoring/ChartTooltip'
import { TemperatureIcon } from '@/components/icons'
import { classNames, relativeTime } from '@/lib/format'

const CHART_AXIS = { stroke: '#64748b', fontSize: 11 }
const CHART_GRID = '#1f2733'
/** Not green or red: those mean OK and fault everywhere else. */
const SENSOR_COLOR: Record<string, string> = {
  intake: '#38bdf8',
  exhaust: '#f59e0b',
  optics: '#a78bfa',
}
const EXTRA_COLORS = ['#f472b6', '#2dd4bf']
const TILE_ORDER = ['exhaust', 'optics', 'intake']

function tileOrder(key: string): number {
  const index = TILE_ORDER.indexOf(key)
  return index === -1 ? TILE_ORDER.length : index
}

const RANGES = [
  { hours: 1, label: 'Last hour' },
  { hours: 12, label: 'Last 12 hours' },
  { hours: 24 * 7, label: 'Last 7 days' },
] as const

type Unit = 'F' | 'C'
const UNIT_KEY = 'pc.temperature-unit'
const RANGE_KEY = 'pc.temperature-range'

function stored<T extends string | number>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const raw = localStorage.getItem(key)
    const value = (typeof fallback === 'number' ? Number(raw) : raw) as T
    return allowed.includes(value) ? value : fallback
  } catch {
    return fallback
  }
}

function remember(key: string, value: string | number) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Private window or blocked storage: the choice just is not remembered.
  }
}

function toUnit(celsius: number, unit: Unit): number {
  return unit === 'F' ? Math.round((celsius * 9) / 5 + 32) : Math.round(celsius * 10) / 10
}

function degrees(celsius: number | null | undefined, unit: Unit): string {
  return celsius == null ? '—' : `${toUnit(celsius, unit)} °${unit}`
}

function clock(ms: number, hours: number): string {
  const date = new Date(ms)
  if (hours > 24) return date.toLocaleString([], { weekday: 'short', hour: 'numeric' })
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function when(iso: string): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const age = Date.now() - date.getTime()
  if (age < 20 * 3600 * 1000 && date.getDate() === new Date().getDate()) return time
  if (age < 6 * 24 * 3600 * 1000) return `${date.toLocaleDateString([], { weekday: 'short' })} ${time}`
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`
}

const STATE_RING: Record<TemperatureState, string> = {
  ok: 'ring-white/[0.06]',
  unknown: 'ring-white/[0.06]',
  near: 'ring-yellow-500/50',
  over: 'ring-red-500/60',
}
const STATE_TEXT: Record<TemperatureState, string> = {
  ok: 'text-slate-100',
  unknown: 'text-slate-500',
  near: 'text-yellow-300',
  over: 'text-red-300',
}

/**
 * Temperatures over time for one projector, on the Monitoring page.
 *
 * The projector is read every minute on the diagnostics poll; the server
 * keeps the samples for a month and sends the chart the hottest reading in
 * each slice of the range, so a short spike always shows.
 */
export default function TemperatureHistory({ projectorId, projectorName }: { projectorId: number | null; projectorName?: string }) {
  const [hours, setHours] = useState<number>(() => stored(RANGE_KEY, 12, RANGES.map((r) => r.hours)))
  const [unit, setUnit] = useState<Unit>(() => stored<Unit>(UNIT_KEY, 'F', ['F', 'C']))
  const [data, setData] = useState<History | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (projectorId === null) return
    // A slower reply for the previous projector or range must not land last.
    let current = true
    setLoading(true)
    const load = () =>
      api
        .temperatures(projectorId, hours)
        .then((result) => {
          if (!current) return
          setData(result)
          setError(null)
        })
        .catch((err) => {
          if (current) setError(err instanceof Error ? err.message : 'Could not load temperatures')
        })
        .finally(() => {
          if (current) setLoading(false)
        })
    void load()
    const timer = window.setInterval(() => void load(), 60000)
    return () => {
      current = false
      window.clearInterval(timer)
    }
  }, [projectorId, hours])

  // Tiles in the order the lines usually stack on the chart, top to bottom:
  // exhaust air runs hottest, the room air coming in coolest.
  const sensors = [...(data?.projector_id === projectorId ? data.sensors : [])].sort(
    (a, b) => tileOrder(a.key) - tileOrder(b.key),
  )
  const colorOf = (key: string, index: number) => SENSOR_COLOR[key] ?? EXTRA_COLORS[index % EXTRA_COLORS.length]
  const rows = (data?.points ?? []).map((point) => {
    const row: Record<string, number | null> = { t: point.t }
    for (const sensor of sensors) {
      const value = point[sensor.key]
      row[sensor.key] = value == null ? null : toUnit(value, unit)
    }
    return row
  })
  const hasPoints = rows.some((row) => sensors.some((s) => row[s.key] != null))
  const limits = sensors.filter((s) => s.limit_celsius != null)
  const plotted = rows.flatMap((row) => sensors.map((s) => row[s.key])).filter((v): v is number => v != null)
  const limitValues = limits.map((s) => toUnit(s.limit_celsius!, unit))
  // Round numbers on the scale: tens of °F, fives of °C.
  const step = unit === 'F' ? 10 : 5
  const low = plotted.length ? Math.floor((Math.min(...plotted) - 2) / step) * step : 0
  const high = Math.ceil((Math.max(...plotted, ...limitValues) + 2) / step) * step
  const ticks = Array.from({ length: Math.max(0, Math.round((high - low) / step)) + 1 }, (_, i) => low + i * step)
  const fault = data?.condition === 'error' || sensors.some((s) => s.state === 'over')
  const rangeLabel = RANGES.find((r) => r.hours === hours)?.label.toLowerCase() ?? ''

  return (
    <Panel
      icon={TemperatureIcon}
      title={`Projector temperatures${projectorName ? ` · ${projectorName}` : ''}`}
      description={
        data
          ? `Read from the projector ${data.sample_interval_seconds > 90 ? `every ${Math.round(data.sample_interval_seconds / 60)} minutes` : 'every minute'} and kept for ${data.retention_days} days. Each point on the line is the hottest reading in its slice of time.`
          : 'Read from the projector every minute and kept for a month.'
      }
      action={
        <div className="flex flex-wrap items-center gap-2">
          <div className="seg" role="group" aria-label="Time range">
            {RANGES.map((range) => (
              <button
                key={range.hours}
                className={classNames('seg-item px-2 py-1 text-xs', hours === range.hours && 'seg-item-active')}
                aria-pressed={hours === range.hours}
                onClick={() => {
                  setHours(range.hours)
                  remember(RANGE_KEY, range.hours)
                }}
              >
                {range.label}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Units">
            {(['F', 'C'] as const).map((u) => (
              <button
                key={u}
                className={classNames('seg-item px-2 py-1 text-xs', unit === u && 'seg-item-active')}
                aria-pressed={unit === u}
                onClick={() => {
                  setUnit(u)
                  remember(UNIT_KEY, u)
                }}
              >
                °{u}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {projectorId === null ? (
        <EmptyState title="No projectors yet" icon={TemperatureIcon}>
          Add a projector to see its temperatures here.
        </EmptyState>
      ) : loading && !data ? (
        <Spinner label="Loading temperatures…" size="sm" />
      ) : error && !data ? (
        <Banner tone="fault">{error}</Banner>
      ) : sensors.length === 0 ? (
        <EmptyState title="No temperature readings yet" icon={TemperatureIcon}>
          {data?.note ??
            'Readings appear here a minute or two after the projector starts answering. Panasonic projectors give numbers; projectors controlled by PJLink only say OK, warning or fault.'}
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {(data?.warnings ?? []).map((warning) => (
            <Banner key={warning} tone={fault ? 'fault' : 'warn'} title={fault ? 'Too hot' : 'Running hot'}>
              {warning}
            </Banner>
          ))}

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {sensors.map((sensor, index) => (
              <SensorTile key={sensor.key} sensor={sensor} unit={unit} color={colorOf(sensor.key, index)} />
            ))}
            {data?.hottest && (
              <div className="rounded-lg bg-panel-850 p-3 ring-1 ring-white/[0.06]">
                <p className="text-xs text-slate-500">Hottest, {rangeLabel}</p>
                <p className="tnum mt-1 text-2xl font-semibold text-slate-100">{degrees(data.hottest.celsius, unit)}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {data.hottest.label} · {when(data.hottest.recorded_at)}
                </p>
                {data.condition && (
                  <p className="mt-1 text-xs text-slate-500">
                    The projector's own check:{' '}
                    <span className={data.condition === 'ok' ? 'text-green-400' : data.condition === 'error' ? 'text-red-300' : 'text-yellow-300'}>
                      {data.condition === 'ok' ? 'OK' : data.condition === 'error' ? 'fault' : data.condition}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          {hasPoints ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={CHART_GRID} vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={[new Date(data!.since).getTime(), new Date(data!.until).getTime()]}
                  tickFormatter={(ms: number) => clock(ms, hours)}
                  {...CHART_AXIS}
                  tickLine={false}
                  minTickGap={40}
                />
                <YAxis
                  {...CHART_AXIS}
                  tickLine={false}
                  axisLine={false}
                  unit={`°${unit}`}
                  width={52}
                  domain={[low, high]}
                  ticks={ticks.length <= 12 ? ticks : undefined}
                  allowDecimals={false}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      title={(ms) => new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                      format={(value, key) => [`${value} °${unit}`, sensors.find((s) => s.key === key)?.label ?? key]}
                    />
                  }
                />
                {limits.map((sensor) => (
                  <ReferenceLine
                    key={`${sensor.key}-limit`}
                    y={toUnit(sensor.limit_celsius!, unit)}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    label={{ value: `${sensor.label} limit`, position: 'insideTopLeft', fill: '#f87171', fontSize: 11 }}
                  />
                ))}
                {sensors.map((sensor, index) => (
                  <Line
                    key={sensor.key}
                    type="monotone"
                    dataKey={sensor.key}
                    name={sensor.label}
                    stroke={colorOf(sensor.key, index)}
                    strokeWidth={2}
                    // One sample has no line to draw; show the point.
                    dot={plotted.length <= sensors.length}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-500">
              No readings {rangeLabel}. The projector may have been unplugged or not answering.
            </p>
          )}
          <p className="text-xs text-slate-500">
            Gaps in a line mean the projector was not answering then. The dashed red line is the hottest room
            air the projector is rated for; exhaust air and the optics module have no published limit, so for
            those the projector's own temperature check is what counts.
          </p>
        </div>
      )}
    </Panel>
  )
}

function SensorTile({ sensor, unit, color }: { sensor: TemperatureSensorHistory; unit: Unit; color: string }) {
  return (
    <div className={classNames('rounded-lg bg-panel-850 p-3 ring-1', STATE_RING[sensor.state])}>
      <p className="flex items-center gap-2 text-xs text-slate-400">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
        {sensor.label}
      </p>
      <p className={classNames('tnum mt-1 text-2xl font-semibold', STATE_TEXT[sensor.state])}>
        {degrees(sensor.latest?.celsius, unit)}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {sensor.latest
          ? sensor.latest_is_current
            ? 'now'
            : `last read ${relativeTime(sensor.latest.recorded_at)}`
          : 'no reading'}
        {sensor.hottest && <> · hottest {degrees(sensor.hottest.celsius, unit)} at {when(sensor.hottest.recorded_at)}</>}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">
        {sensor.limit_celsius != null
          ? `Limit ${degrees(sensor.limit_celsius, unit)}, warns from ${degrees(sensor.warn_celsius, unit)}`
          : 'No published limit'}
      </p>
    </div>
  )
}
