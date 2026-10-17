import { Link } from 'react-router-dom'
import type { Projector } from '@/api/types'
import { classNames, relativeTime, renderTelemetry } from '@/lib/format'
import {
  InputBadge,
  LampMeter,
  PowerGlyph,
  ProjectorMark,
  ShutterGlyph,
  type Tone,
} from './graphics'
import { ChevronIcon, PowerIcon, ShutterIcon, WarningIcon } from './icons'

/** Connection tone. A stale device is never green: liveness is observed,
 *  not remembered. */
export function connectionTone(projector: Projector): Tone {
  const { state } = projector
  if (!projector.enabled) return 'idle'
  if (state.stale || !state.online) return 'fault'
  if (state.health === 'error') return 'fault'
  if (state.health === 'warning') return 'warn'
  return 'ok'
}

export function ProjectorCard({
  projector,
  onPower,
  onShutter,
  canControl,
  busy,
}: {
  projector: Projector
  onPower: (projector: Projector, state: 'on' | 'off') => void
  onShutter: (projector: Projector, state: 'open' | 'closed') => void
  canControl: boolean
  busy?: boolean
}) {
  const { state } = projector
  const live = state.online && !state.stale
  const transitioning = state.power === 'warming' || state.power === 'cooling'
  const input = renderTelemetry(state.active_input, (value) =>
    typeof value === 'string' ? value : value.label,
  )
  const inputCode =
    state.active_input.availability === 'available' && typeof state.active_input.value === 'object'
      ? state.active_input.value?.code ?? ''
      : ''
  const lamps = state.lamp_hours
  const lampValues =
    lamps.availability === 'available' && Array.isArray(lamps.value)
      ? lamps.value.map((lamp) => lamp.hours).filter((h): h is number => h != null)
      : []
  const peakLampHours = lampValues.length > 0 ? Math.max(...lampValues) : null
  const problems = [...state.errors, ...state.warnings]
  const offlineReason = !state.online && state.last_error && !state.errors.includes(state.last_error)
    ? state.last_error
    : null

  return (
    <article className={classNames('panel flex flex-col', !projector.enabled && 'opacity-60')}>
      <header className="flex items-center gap-3 px-4 pt-4">
        <ProjectorMark tone={connectionTone(projector)} pulse={transitioning} />
        <div className="min-w-0 flex-1">
          <Link
            to={`/projectors/${projector.id}`}
            className="block truncate text-sm font-semibold text-slate-100 hover:text-sky-300"
          >
            {projector.name}
          </Link>
          <p className="truncate text-xs text-slate-400">
            {projector.model}
            {projector.location && <span className="text-slate-500"> · {projector.location}</span>}
          </p>
        </div>
        <span
          className={classNames(
            'tnum shrink-0 text-[11px]',
            state.stale ? 'text-amber-400' : 'text-slate-500',
          )}
          title={
            state.stale
              ? 'No successful poll inside the staleness window — last known value, not a live reading.'
              : 'Last successful reply'
          }
        >
          {relativeTime(state.last_seen_at)}
          {state.stale && ' · stale'}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4">
        <PowerGlyph state={state.power} live={live} size="sm" />
        <ShutterGlyph state={state.shutter} live={live} size="sm" />
        <div className="col-span-2 flex items-center justify-between gap-3 rounded-lg bg-panel-850 px-3 py-2">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">Input</span>
          {input.muted ? (
            <span className="text-xs text-slate-500" title={input.title}>
              {input.text}
            </span>
          ) : (
            <span className="text-sm">
              <InputBadge code={inputCode} label={input.text} />
            </span>
          )}
        </div>
        <div className="col-span-2">
          <LampMeter
            label={lampValues.length > 1 ? `Lamp hours (highest of ${lampValues.length})` : 'Lamp hours'}
            hours={peakLampHours}
            warn={projector.lamp_warn_hours}
            critical={projector.lamp_critical_hours}
            compact
            note={
              peakLampHours == null
                ? (lamps.note ?? 'Lamp hours have not been read yet')
                : undefined
            }
          />
        </div>
      </div>

      {(problems.length > 0 || offlineReason) && (
        <ul className="mx-4 mb-3 space-y-1">
          {state.errors.map((error) => (
            <li key={error} className="flex items-start gap-1.5 text-xs text-red-300">
              <WarningIcon size={13} className="mt-0.5 shrink-0" aria-hidden /> <span className="break-words">{error}</span>
            </li>
          ))}
          {state.warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-1.5 text-xs text-amber-300">
              <WarningIcon size={13} className="mt-0.5 shrink-0" aria-hidden /> <span className="break-words">{warning}</span>
            </li>
          ))}
          {offlineReason && <li className="break-words text-xs text-slate-500">{offlineReason}</li>}
        </ul>
      )}

      <footer className="mt-auto flex items-center gap-2 border-t border-white/5 px-3 py-2.5">
        <button
          className="btn-default flex-1"
          disabled={!canControl || busy || !live || transitioning}
          onClick={() => onPower(projector, state.power === 'on' ? 'off' : 'on')}
          title={transitioning ? 'Wait for the projector to finish its transition' : undefined}
        >
          <PowerIcon size={15} aria-hidden />
          {state.power === 'on' ? 'Power off' : 'Power on'}
        </button>
        <button
          className="btn-default flex-1"
          disabled={!canControl || busy || !live || state.power !== 'on'}
          onClick={() => onShutter(projector, state.shutter === 'closed' ? 'open' : 'closed')}
          title={state.power !== 'on' ? 'Shutter control needs the lamp on' : undefined}
        >
          <ShutterIcon size={15} aria-hidden />
          {state.shutter === 'closed' ? 'Open' : 'Close'}
        </button>
        <Link to={`/projectors/${projector.id}`} className="btn-ghost px-2" aria-label="Details">
          <ChevronIcon size={18} />
        </Link>
      </footer>
    </article>
  )
}
