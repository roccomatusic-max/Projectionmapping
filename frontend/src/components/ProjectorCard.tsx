import { memo } from 'react'
import { Link } from 'react-router-dom'
import type { Projector } from '@/api/types'
import { classNames } from '@/lib/format'
import {
  attentionItems,
  attentionTone,
  deviceTone,
  isLive,
  isTransitioning,
  lampReadings,
  peakLampHours,
} from '@/lib/status'
import { phaseIsActive, type TrackedCommand } from '@/live/LiveProvider'
import { useTicker } from '@/hooks/useLiveData'
import { LampMeter } from './graphics'
import { ChevronIcon, PowerIcon, ShutterIcon } from './icons'
import { CommandLine, Freshness, InputLabel, LinkBadge, PowerBadge, ShutterBadge } from './status'
import { StatusDot } from './ui'
import { TONE_EDGE, TONE_TEXT } from './tone'

export { connectionTone } from '@/lib/status'

export type QuickAction = 'power-on' | 'power-off' | 'shutter-open' | 'shutter-closed'

/** The last command on this projector, while it is still worth showing:
 *  in flight, recently settled, or a problem the operator has not yet
 *  replaced with another command. */
export function CommandStrip({ command, className }: { command?: TrackedCommand; className?: string }) {
  useTicker(3000)
  if (!command) return null
  const age = Date.now() - command.updatedAt
  const sticky = command.phase === 'failed' || command.phase === 'unverified' || command.phase === 'unavailable'
  if (!phaseIsActive(command.phase) && !(sticky && age < 120_000) && age > 12_000) return null
  return <CommandLine command={command} className={className} />
}

/**
 * Quick controls the card offers, worked out from confirmed state. A
 * projector that is offline, warming, cooling or already has a command in
 * flight offers nothing to press.
 */
export function quickControls(projector: Projector, command: TrackedCommand | undefined, canControl: boolean) {
  const live = isLive(projector)
  const busy = command !== undefined && phaseIsActive(command.phase)
  const { power, shutter } = projector.state
  const transitioning = isTransitioning(projector)
  const base = !canControl ? 'Your role is view-only' : !live ? 'Projector is not responding' : busy ? 'A command is still in progress' : null
  return {
    power: {
      next: (power === 'on' ? 'off' : 'on') as 'on' | 'off',
      label: power === 'on' ? 'Power off' : 'Power on',
      disabled: Boolean(base) || transitioning || power === 'unknown',
      reason: base ?? (transitioning ? 'Wait for the projector to finish warming up or cooling down' : undefined),
    },
    shutter: {
      next: (shutter === 'closed' ? 'open' : 'closed') as 'open' | 'closed',
      label: shutter === 'closed' ? 'Open' : 'Close',
      disabled: Boolean(base) || power !== 'on' || shutter === 'unknown',
      reason: base ?? (power !== 'on' ? 'Shutter control needs the projector powered on' : undefined),
    },
  }
}

export const ProjectorCard = memo(function ProjectorCard({
  projector,
  command,
  canControl,
  selectable = false,
  selected = false,
  onToggleSelect,
  onAction,
}: {
  projector: Projector
  command?: TrackedCommand
  canControl: boolean
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (projector: Projector) => void
  onAction: (projector: Projector, action: QuickAction) => void
}) {
  const { state } = projector
  const tone = deviceTone(projector)
  const live = isLive(projector)
  const lamps = lampReadings(projector)
  const peak = peakLampHours(projector)
  const issues = attentionItems(projector)
  const controls = quickControls(projector, command, canControl)

  return (
    <article
      className={classNames(
        'panel relative flex flex-col overflow-hidden transition-colors duration-300',
        'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:transition-colors before:duration-300',
        TONE_EDGE[tone],
        selected && 'border-sky-500/60 bg-sky-500/[0.05] ring-1 ring-sky-500/40',
        !projector.enabled && 'opacity-60',
      )}
      aria-label={projector.name}
    >
      <header className="flex items-start gap-2.5 px-3.5 pt-3">
        {selectable && (
          <input
            type="checkbox"
            className="mt-0.5"
            checked={selected}
            onChange={() => onToggleSelect?.(projector)}
            aria-label={`Select ${projector.name}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <Link
            to={`/projectors/${projector.id}`}
            className="block truncate text-sm font-semibold text-slate-50 hover:text-sky-300"
          >
            {projector.name}
          </Link>
          <p className="truncate text-xs text-slate-500" title={projector.location || undefined}>
            <span className="tnum text-slate-400">{projector.host}</span>
            <span className="text-slate-600"> · </span>
            {projector.model || projector.manufacturer}
          </p>
        </div>
        <Freshness projector={projector} className="pt-0.5 text-2xs" />
      </header>

      <div className="flex flex-wrap gap-1.5 px-3.5 pt-2.5">
        <LinkBadge projector={projector} />
        <PowerBadge projector={projector} />
        <ShutterBadge projector={projector} />
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 px-3.5 pt-3 text-xs">
        <dt className="eyebrow">Input</dt>
        <dt className="eyebrow">{lamps.length > 1 ? `Lamp (max of ${lamps.length})` : 'Lamp'}</dt>
        <dd className="min-w-0 text-sm">
          <InputLabel projector={projector} />
        </dd>
        <dd className="min-w-0">
          <LampMeter
            label=""
            hours={peak}
            warn={projector.lamp_warn_hours}
            critical={projector.lamp_critical_hours}
            compact
            note={peak == null ? (state.lamp_hours?.note ?? 'Lamp hours have not been read yet') : undefined}
          />
        </dd>
      </dl>

      {issues.length > 0 && (
        <ul className="mx-3.5 mt-3 space-y-1">
          {issues.slice(0, 2).map((item) => (
            <li key={item.text} className="flex items-start gap-1.5 text-xs" title={item.detail}>
              <StatusDot tone={attentionTone(item.severity)} className="mt-1.5" />
              <span className={classNames('min-w-0 break-words', TONE_TEXT[attentionTone(item.severity)])}>
                {item.text}
                {item.detail && !live && <span className="block truncate text-slate-500">{item.detail}</span>}
              </span>
            </li>
          ))}
          {issues.length > 2 && (
            <li className="pl-3.5 text-xs text-slate-500">
              <Link to={`/projectors/${projector.id}`} className="hover:text-slate-300">+{issues.length - 2} more</Link>
            </li>
          )}
        </ul>
      )}

      <CommandStrip command={command} className="mx-3.5 mt-3" />

      <footer className="mt-auto flex items-center gap-1.5 px-2.5 pb-2.5 pt-3">
        <button
          className="btn-default btn-sm flex-1"
          disabled={controls.power.disabled}
          title={controls.power.reason}
          onClick={() => onAction(projector, controls.power.next === 'on' ? 'power-on' : 'power-off')}
        >
          <PowerIcon size={13} aria-hidden />
          {controls.power.label}
        </button>
        <button
          className="btn-default btn-sm flex-1"
          disabled={controls.shutter.disabled}
          title={controls.shutter.reason}
          onClick={() => onAction(projector, controls.shutter.next === 'open' ? 'shutter-open' : 'shutter-closed')}
        >
          <ShutterIcon size={13} aria-hidden />
          {controls.shutter.label}
          <span className="sr-only"> shutter</span>
        </button>
        <Link to={`/projectors/${projector.id}`} className="btn-ghost btn-sm btn-icon" aria-label={`Open ${projector.name}`}>
          <ChevronIcon size={16} />
        </Link>
      </footer>
    </article>
  )
})
