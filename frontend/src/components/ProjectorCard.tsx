import { Link } from 'react-router-dom'
import type { Projector } from '@/api/types'
import { Chip, StatusDot, Value } from './ui'
import {
  POWER_LABEL,
  SHUTTER_LABEL,
  classNames,
  relativeTime,
  renderTelemetry,
} from '@/lib/format'

/** Connection tone. A stale device is never green: liveness is observed,
 *  not remembered. */
export function connectionTone(projector: Projector) {
  const { state } = projector
  if (!projector.enabled) return 'idle' as const
  if (state.stale || !state.online) return 'fault' as const
  if (state.health === 'error') return 'fault' as const
  if (state.health === 'warning') return 'warn' as const
  return 'ok' as const
}

function powerTone(projector: Projector) {
  if (!projector.state.online || projector.state.stale) return 'unknown' as const
  switch (projector.state.power) {
    case 'on':
      return 'ok' as const
    case 'warming':
    case 'cooling':
      return 'busy' as const
    case 'off':
      return 'idle' as const
    default:
      return 'unknown' as const
  }
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
  const input = renderTelemetry(state.active_input, (value) =>
    typeof value === 'string' ? value : value.label,
  )
  const lamps = state.lamp_hours
  const lampHourValues =
    lamps.availability === 'available' && Array.isArray(lamps.value)
      ? lamps.value.map((lamp) => lamp.hours).filter((h): h is number => h != null)
      : []
  const peakLampHours = lampHourValues.length > 0 ? Math.max(...lampHourValues) : null
  const lampTone =
    peakLampHours == null
      ? 'idle'
      : peakLampHours >= projector.lamp_critical_hours
        ? 'fault'
        : peakLampHours >= projector.lamp_warn_hours
          ? 'warn'
          : 'ok'

  const transitioning = state.power === 'warming' || state.power === 'cooling'

  return (
    <article
      className={classNames(
        'panel flex flex-col transition-colors',
        !projector.enabled && 'opacity-60',
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-white/5 px-4 py-3">
        <div className="min-w-0">
          <Link
            to={`/projectors/${projector.id}`}
            className="flex items-center gap-2 text-sm font-semibold text-slate-100 hover:text-sky-300"
          >
            <StatusDot tone={connectionTone(projector)} pulse={transitioning} />
            <span className="truncate">{projector.name}</span>
          </Link>
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {projector.manufacturer} {projector.model}
            {projector.location && ` · ${projector.location}`}
          </p>
        </div>
        <Chip tone={powerTone(projector)}>
          {live ? POWER_LABEL[state.power] : 'Offline'}
        </Chip>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-4 py-3 text-xs">
        <div>
          <dt className="text-slate-500">Address</dt>
          <dd className="tnum text-slate-300">
            {projector.host}:{projector.port}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Input</dt>
          <dd>
            <Value text={input.text} muted={input.muted} title={input.title} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Shutter</dt>
          <dd
            className={classNames(
              state.shutter === 'closed' ? 'text-amber-300' : 'text-slate-300',
            )}
          >
            {live ? SHUTTER_LABEL[state.shutter] : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Lamp hours</dt>
          <dd>
            {peakLampHours == null ? (
              <Value
                text={lamps.availability === 'unsupported' ? 'n/a' : '—'}
                muted
                title={lamps.note ?? 'Not read yet'}
              />
            ) : (
              <span
                className={classNames(
                  'tnum',
                  lampTone === 'fault'
                    ? 'text-red-300'
                    : lampTone === 'warn'
                      ? 'text-amber-300'
                      : 'text-slate-300',
                )}
                title={`Highest of ${(lamps.value ?? []).length} lamp(s). Warn at ${projector.lamp_warn_hours}h, replace at ${projector.lamp_critical_hours}h.`}
              >
                {peakLampHours.toLocaleString()} h
              </span>
            )}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-slate-500">Last reply</dt>
          <dd
            className={classNames(
              'tnum',
              state.stale ? 'text-amber-300' : 'text-slate-300',
            )}
            title={
              state.stale
                ? 'No successful poll inside the staleness window — this is the last known value, not a live reading.'
                : undefined
            }
          >
            {relativeTime(state.last_seen_at)}
            {state.stale && ' · stale'}
            {state.queue_depth > 0 && ` · ${state.queue_depth} queued`}
          </dd>
        </div>
      </dl>

      {(state.errors.length > 0 || state.warnings.length > 0 || state.last_error) && (
        <div className="mx-4 mb-3 space-y-1">
          {state.errors.map((error) => (
            <p key={error} className="text-xs text-red-300">
              ● {error}
            </p>
          ))}
          {state.warnings.map((warning) => (
            <p key={warning} className="text-xs text-amber-300">
              ● {warning}
            </p>
          ))}
          {state.last_error && !state.online && !state.errors.includes(state.last_error) && (
            <p className="break-words text-xs text-slate-500">{state.last_error}</p>
          )}
        </div>
      )}

      <footer className="mt-auto flex flex-wrap items-center gap-2 border-t border-white/5 px-4 py-3">
        <button
          className="btn-default flex-1"
          disabled={!canControl || busy || !live || transitioning}
          onClick={() => onPower(projector, state.power === 'on' ? 'off' : 'on')}
          title={
            transitioning
              ? `Projector is ${POWER_LABEL[state.power].toLowerCase()}; wait for it to settle`
              : undefined
          }
        >
          {state.power === 'on' ? 'Power off' : 'Power on'}
        </button>
        <button
          className="btn-default flex-1"
          disabled={!canControl || busy || !live || state.power !== 'on'}
          onClick={() =>
            onShutter(projector, state.shutter === 'closed' ? 'open' : 'closed')
          }
          title={state.power !== 'on' ? 'Shutter control needs the lamp on' : undefined}
        >
          {state.shutter === 'closed' ? 'Open shutter' : 'Close shutter'}
        </button>
        <Link to={`/projectors/${projector.id}`} className="btn-ghost">
          Details →
        </Link>
      </footer>
    </article>
  )
}
