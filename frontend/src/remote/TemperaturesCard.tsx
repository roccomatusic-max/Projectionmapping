import { useEffect, useState } from 'react'
import type { Projector, TemperatureReading, TemperatureSensor } from '@/api/types'
import { HeaterIcon, TemperatureIcon } from '@/components/icons'
import { classNames } from '@/lib/format'
import { fahrenheit, heaterApi, type Heater, type HeatersOverview, type UsbSensor } from '@/lib/heater'

/**
 * Temperatures on the phone: each projector's sensors and the box sensors,
 * read from what the server already collects (projector status for the
 * projectors, the heater overview for the boxes and outside). Nothing here
 * asks a projector or sensor for anything new.
 */

/** Hottest first, the way the Monitoring tiles are ordered. */
const ORDER = ['exhaust', 'optics', 'intake']
const SHORT: Record<string, string> = { exhaust: 'Exhaust', optics: 'Optics', intake: 'Intake' }

function sensorsOf(projector: Projector): TemperatureSensor[] {
  const field = projector.state.equipment?.temperature
  if (field?.availability !== 'available' || !field.value || typeof field.value !== 'object') return []
  return ((field.value as TemperatureReading).sensors ?? [])
    .filter((s) => s.celsius != null)
    .sort((a, b) => rank(a.key) - rank(b.key))
}

function rank(key: string): number {
  const i = ORDER.indexOf(key)
  return i === -1 ? ORDER.length : i
}

/** The projector itself says it is too warm (its own temperature check). */
function saysHot(projector: Projector): boolean {
  const value = projector.state.equipment?.temperature?.value as TemperatureReading | null | undefined
  const condition = value?.condition
  return (!!condition && condition !== 'ok')
    || projector.state.warnings.some((w) => /temp/i.test(w))
    || projector.state.errors.some((e) => /temp/i.test(e))
}

/** The heater overview, every 30 s and whenever the phone is looked at
 *  again. (The remote has no live feed for heaters, so it polls.) */
export function useBoxes(): HeatersOverview | null {
  const [data, setData] = useState<HeatersOverview | null>(null)
  useEffect(() => {
    let alive = true
    const load = () => {
      heaterApi.overview().then((result) => alive && setData(result)).catch(() => undefined)
    }
    const onVisible = () => document.visibilityState === 'visible' && load()
    load()
    const timer = window.setInterval(load, 30000)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return data
}

/** One line at the top of the Projectors tab: the hottest projector sensor
 *  and the box, tapping it jumps down to the full list. */
export function TemperatureGlance({ projectors, data, onOpen }: {
  projectors: Projector[]
  data: HeatersOverview | null
  onOpen: () => void
}) {
  const live = projectors.filter((p) => p.enabled && p.state.online && !p.state.stale)
  const readings = live.flatMap((p) => sensorsOf(p))
  const hottest = readings.length ? Math.max(...readings.map((s) => s.celsius!)) : null
  const hot = live.some(saysHot)
  const boxes = [
    ...(data?.sensors ?? []).map((s) => s.celsius),
    ...(data?.heaters ?? []).filter((h) => h.inside?.source === 'projector').map((h) => h.inside!.celsius),
  ]
  const box = boxes.length ? Math.min(...boxes) : null
  if (hottest == null && box == null) return null
  return (
    <button onClick={onOpen}
      className={classNames('flex items-center gap-3 rounded-2xl px-4 py-3 text-left ring-1 active:bg-white/[0.03]',
        hot ? 'bg-red-500/10 ring-red-500/25' : 'bg-panel-900 ring-white/[0.06]')}>
      <TemperatureIcon size={20} className={hot ? 'text-red-300' : 'text-sky-300'} />
      <span className="min-w-0 flex-1 truncate text-[15px] text-slate-300">
        {hottest != null && <>Hottest <b className={classNames('tnum font-semibold', hot ? 'text-red-200' : 'text-slate-50')}>{fahrenheit(hottest)}</b></>}
        {hottest != null && box != null && <span className="text-slate-600"> · </span>}
        {box != null && <>Box <b className="tnum font-semibold text-slate-50">{fahrenheit(box)}</b></>}
      </span>
      <span className="shrink-0 text-xs text-slate-500">{hot ? 'Running hot' : 'See all'}</span>
    </button>
  )
}

export default function TemperaturesCard({ projectors, data }: { projectors: Projector[]; data: HeatersOverview | null }) {
  const shown = projectors.filter((p) => p.enabled)
  const sensors = data?.sensors ?? []
  const heaters = data?.heaters ?? []
  // A heater that reads the projector's own temperature has no USB sensor
  // of its own; show its inside reading as the box.
  const projectorBoxes = heaters.filter((h) => h.inside?.source === 'projector' && !sensors.some((s) => s.player_id === h.sensor_player_id))
  const outside = data?.outside?.celsius ?? null

  if (shown.length === 0 && sensors.length === 0 && projectorBoxes.length === 0 && outside == null) return null

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        <TemperatureIcon size={14} /> Temperatures
      </h2>
      <ul className="overflow-hidden rounded-3xl bg-panel-900 ring-1 ring-white/[0.06]">
        {shown.map((p, i) => (
          <ProjectorRow key={p.id} projector={p} first={i === 0} />
        ))}
        {sensors.map((s, i) => (
          <BoxRow key={`s${s.player_id}`} sensor={s} heater={heaters.find((h) => h.sensor_player_id === s.player_id) ?? null}
            first={shown.length === 0 && i === 0} />
        ))}
        {projectorBoxes.map((h, i) => (
          <HeaterRow key={`h${h.id}`} heater={h} first={shown.length === 0 && sensors.length === 0 && i === 0} />
        ))}
        {outside != null && (
          <li className={classNames('flex items-center justify-between gap-3 px-4 py-3.5',
            (shown.length > 0 || sensors.length > 0 || projectorBoxes.length > 0) && 'border-t border-white/[0.05]')}>
            <div className="min-w-0">
              <p className="truncate text-[16px] text-slate-100">Outside</p>
              {data?.outside.place && <p className="truncate text-[13px] text-slate-500">{data.outside.place.name}</p>}
            </div>
            <span className="tnum text-[22px] font-semibold text-slate-50">{fahrenheit(outside)}</span>
          </li>
        )}
      </ul>
    </section>
  )
}

function ProjectorRow({ projector, first }: { projector: Projector; first: boolean }) {
  const live = projector.state.online && !projector.state.stale
  const readings = live ? sensorsOf(projector) : []
  const hot = live && saysHot(projector)
  return (
    <li className={classNames('px-4 py-3.5', !first && 'border-t border-white/[0.05]', hot && 'bg-red-500/[0.08]')}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[16px] text-slate-100">{projector.name}</p>
        {hot && <span className="shrink-0 text-xs font-semibold text-red-300">Running hot</span>}
      </div>
      {readings.length > 0 ? (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {readings.map((s) => (
            <div key={s.key} className="rounded-xl bg-panel-850 px-2.5 py-2 ring-1 ring-white/[0.04]">
              <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">{SHORT[s.key] ?? s.label}</p>
              <p className={classNames('tnum text-[20px] font-semibold', hot ? 'text-red-200' : 'text-slate-50')}>
                {s.fahrenheit != null ? `${Math.round(s.fahrenheit)} °F` : fahrenheit(s.celsius)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-0.5 text-[13px] text-slate-500">
          {!live ? 'Not answering' : noReadingText(projector)}
        </p>
      )}
    </li>
  )
}

function noReadingText(projector: Projector): string {
  const field = projector.state.equipment?.temperature
  if (!field || field.availability === 'unsupported') return 'This projector does not report temperatures'
  return 'No reading yet'
}

function BoxRow({ sensor, heater, first }: { sensor: UsbSensor; heater: Heater | null; first: boolean }) {
  return (
    <li className={classNames('flex items-center justify-between gap-3 px-4 py-3.5', !first && 'border-t border-white/[0.05]')}>
      <div className="min-w-0">
        <p className="truncate text-[16px] text-slate-100">{heater ? heater.name : `${sensor.player_name} box`}</p>
        <p className="truncate text-[13px] text-slate-500">
          {sensor.humidity != null && `${Math.round(sensor.humidity)}% humidity`}
          {sensor.humidity != null && heater && ' · '}
          {heater && <HeaterWord heater={heater} />}
          {sensor.humidity == null && !heater && 'Box sensor'}
        </p>
      </div>
      <span className="tnum shrink-0 text-[22px] font-semibold text-slate-50">{fahrenheit(sensor.celsius)}</span>
    </li>
  )
}

function HeaterRow({ heater, first }: { heater: Heater; first: boolean }) {
  return (
    <li className={classNames('flex items-center justify-between gap-3 px-4 py-3.5', !first && 'border-t border-white/[0.05]')}>
      <div className="min-w-0">
        <p className="truncate text-[16px] text-slate-100">{heater.name}</p>
        <p className="truncate text-[13px] text-slate-500"><HeaterWord heater={heater} /></p>
      </div>
      <span className="tnum shrink-0 text-[22px] font-semibold text-slate-50">{fahrenheit(heater.inside?.celsius)}</span>
    </li>
  )
}

function HeaterWord({ heater }: { heater: Heater }) {
  if (heater.plug_error || heater.is_on === null) return <span className="text-amber-300">Heater plug not answering</span>
  return heater.is_on
    ? <span className="inline-flex items-center gap-1 text-amber-300"><HeaterIcon size={12} /> Heater on</span>
    : <span>Heater off</span>
}
