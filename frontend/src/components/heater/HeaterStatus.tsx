/**
 * The heaters in the projector boxes at a glance: on or off and why, the
 * temperature inside and outside, and Automatic / On for an hour / Keep off.
 *
 * On the Dashboard and Monitoring; shows nothing until a heater is added
 * on Monitoring → Box heater.
 */

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Session } from '@/api/client'
import { useBusMessages, useTicker } from '@/hooks/useLiveData'
import { Banner, Panel, StatusDot } from '@/components/ui'
import { HeaterIcon } from '@/components/icons'
import { classNames, relativeTime } from '@/lib/format'
import {
  fahrenheit,
  heaterApi,
  heaterTone,
  modeWord,
  stateWord,
  type Heater,
  type HeaterModeName,
  type HeatersOverview,
} from '@/lib/heater'

export function useHeaters(pollMs = 20000) {
  const [data, setData] = useState<HeatersOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(
    () =>
      heaterApi
        .overview()
        .then((result) => {
          setData(result)
          setError(null)
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the heaters')),
    [],
  )
  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), pollMs)
    return () => window.clearInterval(timer)
  }, [load, pollMs])
  useBusMessages(['heater'], () => void load())
  return { data, error, reload: load, setData }
}

function clockText(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const MODES: { mode: HeaterModeName; label: string; title: string }[] = [
  { mode: 'auto', label: 'Automatic', title: 'Follow the temperature in the box' },
  { mode: 'on', label: 'On for an hour', title: 'On now for an hour, then back to automatic. Still turns off if the box gets too warm.' },
  { mode: 'off', label: 'Keep off', title: 'Off until you set it back to automatic' },
]

export function HeaterModeButtons({
  heater,
  canControl,
  onChanged,
}: {
  heater: Heater
  canControl: boolean
  onChanged: (heater: Heater) => void
}) {
  const [busy, setBusy] = useState<HeaterModeName | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pick = async (mode: HeaterModeName) => {
    setBusy(mode)
    setError(null)
    try {
      onChanged(await heaterApi.setMode(heater.id, mode))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the heater')
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="space-y-1.5">
      <div className="seg" role="group" aria-label={`${heater.name} mode`}>
        {MODES.map(({ mode, label, title }) => (
          <button
            key={mode}
            type="button"
            title={title}
            disabled={!canControl || busy !== null}
            aria-pressed={heater.mode === mode}
            className={classNames('seg-item whitespace-nowrap px-2.5 py-1 text-xs', heater.mode === mode && 'seg-item-active')}
            onClick={() => void pick(mode)}
          >
            {busy === mode ? 'Switching…' : label}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  )
}

export function HeaterRow({
  heater,
  outside,
  canControl,
  onChanged,
  showName = true,
}: {
  heater: Heater
  outside: number | null
  canControl: boolean
  onChanged: (heater: Heater) => void
  /** Off where the name is already the panel's title. */
  showName?: boolean
}) {
  const tone = heaterTone(heater)
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-100">
          <StatusDot tone={tone} pulse={heater.is_on === true} />
          {showName && heater.name}
          <span className={classNames(showName ? 'text-xs font-normal' : 'text-sm', heater.is_on ? 'text-orange-300' : 'text-slate-400')}>
            {stateWord(heater)}
            {heater.mode !== 'auto' && ` · ${modeWord(heater).toLowerCase()}`}
          </span>
        </p>
        <p className="text-xs text-slate-400">
          Inside{' '}
          <span className="tnum text-slate-200">{fahrenheit(heater.inside?.celsius)}</span>
          {heater.inside && (
            <span className="text-slate-500"> ({heater.inside.source === 'sensor' ? 'USB sensor' : 'projector intake air'})</span>
          )}
          {' · '}Outside <span className="tnum text-slate-200">{fahrenheit(outside)}</span>
          {heater.is_on && heater.on_since && <span className="text-slate-500"> · on since {relativeTime(heater.on_since)}</span>}
        </p>
        <p className="text-xs text-slate-500">{heater.plug_error ?? heater.reason}</p>
        {heater.warmup_at && heater.show_at && new Date(heater.warmup_at).getTime() > Date.now() && (
          <p className="text-xs text-slate-500">
            Warm-up for the show at {clockText(heater.show_at)} starts at {clockText(heater.warmup_at)} if the box is below{' '}
            {fahrenheit(heater.off_above_c)}.
          </p>
        )}
      </div>
      <HeaterModeButtons heater={heater} canControl={canControl} onChanged={onChanged} />
    </div>
  )
}

/** Compact card; nothing at all when no heater has been added. */
export function HeaterStatus({ session, title = 'Box heaters' }: { session: Session; title?: string }) {
  const { data, error, setData } = useHeaters()
  useTicker(30000)
  if (!data || data.heaters.length === 0) return null
  const canControl = session.role === 'admin' || session.role === 'operator'
  const replace = (heater: Heater) =>
    setData((current) => current && { ...current, heaters: current.heaters.map((h) => (h.id === heater.id ? heater : h)) })
  return (
    <Panel
      icon={HeaterIcon}
      title={title}
      description="Keeps the projector boxes above freezing, never running for too long."
      action={
        <Link to="/heater" className="text-xs text-slate-400 hover:text-slate-200">
          Box heater →
        </Link>
      }
    >
      <div className="space-y-4">
        {error && <Banner tone="fault">{error}</Banner>}
        {data.heaters.map((heater) => (
          <HeaterRow key={heater.id} heater={heater} outside={data.outside.celsius} canControl={canControl} onChanged={replace} />
        ))}
      </div>
    </Panel>
  )
}
