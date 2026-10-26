/**
 * One heater over time: the temperature inside the box and outside, and
 * when the heater was on (the orange band). Recorded every minute and kept
 * for a month; longer ranges average each slice.
 */

import { useEffect, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Banner, Panel, Spinner } from '@/components/ui'
import { HeaterIcon } from '@/components/icons'
import { classNames } from '@/lib/format'
import { heaterApi, toF, type Heater, type HeaterHistory } from '@/lib/heater'

const RANGES = [
  { hours: 1, label: 'Last hour' },
  { hours: 12, label: 'Last 12 hours' },
  { hours: 24 * 7, label: 'Last 7 days' },
] as const

const INSIDE = '#38bdf8'
const OUTSIDE = '#a78bfa'
const HEAT = '#fb923c'

function clock(ms: number, hours: number): string {
  const date = new Date(ms)
  if (hours > 24) return date.toLocaleString([], { weekday: 'short', hour: 'numeric' })
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function minutesText(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${hours} hour${hours === 1 ? '' : 's'}${rest ? ` ${rest} min` : ''}`
}

export function HeaterChart({ heater }: { heater: Heater }) {
  const [hours, setHours] = useState<number>(12)
  const [data, setData] = useState<HeaterHistory | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    const load = () =>
      heaterApi
        .history(heater.id, hours)
        .then((result) => {
          if (!current) return
          setData(result)
          setError(null)
        })
        .catch((err) => current && setError(err instanceof Error ? err.message : 'Could not load the history'))
    void load()
    const timer = window.setInterval(() => void load(), 60000)
    return () => {
      current = false
      window.clearInterval(timer)
    }
  }, [heater.id, hours])

  const rows = (data?.points ?? []).map((p) => ({
    t: p.t,
    inside: p.inside == null ? null : Math.round(toF(p.inside) * 10) / 10,
    outside: p.outside == null ? null : Math.round(toF(p.outside) * 10) / 10,
    on: p.on,
  }))
  const values = rows.flatMap((r) => [r.inside, r.outside]).filter((v): v is number => v != null)
  const onLine = toF(heater.on_below_c)
  const offLine = toF(heater.off_above_c)
  const low = Math.floor((Math.min(onLine, ...values) - 5) / 10) * 10
  const high = Math.ceil((Math.max(offLine, ...values) + 5) / 10) * 10

  return (
    <Panel
      icon={HeaterIcon}
      title={`${heater.name}: inside, outside and heating`}
      description={
        data
          ? `Heated for ${minutesText(data.minutes_on)} in the ${RANGES.find((r) => r.hours === hours)?.label.toLowerCase()}. Recorded every minute and kept for a month.`
          : 'Recorded every minute and kept for a month.'
      }
      action={
        <div className="seg" role="group" aria-label="Time range">
          {RANGES.map((range) => (
            <button
              key={range.hours}
              className={classNames('seg-item px-2 py-1 text-xs', hours === range.hours && 'seg-item-active')}
              aria-pressed={hours === range.hours}
              onClick={() => setHours(range.hours)}
            >
              {range.label}
            </button>
          ))}
        </div>
      }
    >
      {error && !data ? (
        <Banner tone="fault">{error}</Banner>
      ) : !data ? (
        <Spinner label="Loading…" size="sm" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing recorded yet. The first point appears a minute after the heater is added.</p>
      ) : (
        <div className="space-y-2">
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#1f2733" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={[new Date(data.since).getTime(), new Date(data.until).getTime()]}
                tickFormatter={(ms: number) => clock(ms, hours)}
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis yAxisId="temp" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} unit="°F" width={52} domain={[low, high]} allowDecimals={false} />
              <YAxis yAxisId="on" orientation="right" hide domain={[0, 1]} />
              <Tooltip
                labelFormatter={(ms: number) => new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                formatter={(value: number, key: string) =>
                  key === 'on'
                    ? [value >= 0.99 ? 'on' : value <= 0.01 ? 'off' : `on ${Math.round(value * 100)}% of the time`, 'Heater']
                    : [`${Math.round(value)} °F`, key === 'inside' ? 'Inside the box' : 'Outside']
                }
                contentStyle={{ background: '#141820', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 12 }}
              />
              <Area yAxisId="on" type="stepAfter" dataKey="on" stroke="none" fill={HEAT} fillOpacity={0.22} isAnimationActive={false} />
              <ReferenceLine yAxisId="temp" y={onLine} stroke={INSIDE} strokeDasharray="4 4" strokeOpacity={0.6}
                label={{ value: `on below ${Math.round(onLine)}°`, position: 'insideBottomLeft', fill: '#7dd3fc', fontSize: 11 }} />
              <ReferenceLine yAxisId="temp" y={offLine} stroke={INSIDE} strokeDasharray="4 4" strokeOpacity={0.6}
                label={{ value: `off at ${Math.round(offLine)}°`, position: 'insideTopLeft', fill: '#7dd3fc', fontSize: 11 }} />
              <Line yAxisId="temp" type="monotone" dataKey="inside" stroke={INSIDE} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
              <Line yAxisId="temp" type="monotone" dataKey="outside" stroke={OUTSIDE} strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: INSIDE }} />Inside the box</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t border-dashed" style={{ borderColor: OUTSIDE }} />Outside</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm" style={{ background: HEAT, opacity: 0.35 }} />Heater on</span>
          </p>
        </div>
      )}
    </Panel>
  )
}
