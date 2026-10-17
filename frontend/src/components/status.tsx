/**
 * Status indicators for projectors and the commands sent to them.
 *
 * Each indicator carries a word as well as a colour, and each answers one
 * question only: is the link up, what is the power doing, is the shutter
 * open, where is that command. Mixing those is how a standby projector ends
 * up looking broken, or an offline one looking switched off.
 */

import type { Projector } from '@/api/types'
import { activeInput, isLive, linkState } from '@/lib/status'
import { classNames, POWER_LABEL, relativeTime } from '@/lib/format'
import { PHASE_LABEL, PHASE_TONE, type TrackedCommand } from '@/live/LiveProvider'
import { useTicker } from '@/hooks/useLiveData'
import { Chip, StatusDot } from './ui'
import { inputIcon } from './graphics'
import {
  BlankIcon,
  CheckIcon,
  FaultIcon,
  LinkDownIcon,
  LiveIcon,
  PendingIcon,
  PowerIcon,
  ShowIcon,
  UnavailableIcon,
  WarningIcon,
} from './icons'
import { TONE_TEXT, type Tone } from './tone'

export function LinkBadge({ projector }: { projector: Projector; compact?: boolean }) {
  const link = linkState(projector)
  if (link === 'disabled') {
    return <Chip tone="unknown" title="Not polled and not controllable">Disabled</Chip>
  }
  if (link === 'online') {
    return (
      <Chip tone="ok" title="Answered its last poll inside the staleness window">
        <LiveIcon size={11} aria-hidden /> Online
      </Chip>
    )
  }
  return (
    <Chip
      tone="idle"
      title={
        projector.state.last_error ??
        (projector.state.last_seen_at ? 'No answer inside the staleness window' : 'Has never answered')
      }
    >
      <LinkDownIcon size={11} aria-hidden /> Offline
    </Chip>
  )
}

export function powerTone(projector: Projector): Tone {
  if (!isLive(projector)) return 'unknown'
  switch (projector.state.power) {
    case 'on':
      return 'ok'
    case 'warming':
    case 'cooling':
      return 'busy'
    case 'off':
      return 'idle'
    default:
      return 'unknown'
  }
}

/** Power as the projector last reported it. Offline means unknown — a
 *  projector we cannot reach has no power state we can vouch for. */
export function PowerBadge({ projector, short = false }: { projector: Projector; short?: boolean }) {
  const live = isLive(projector)
  const { power } = projector.state
  const tone = powerTone(projector)
  const moving = live && (power === 'warming' || power === 'cooling')
  return (
    <Chip tone={tone} title={live ? 'Read from the projector on the last poll' : 'Unknown while the projector is offline'}>
      {moving ? <StatusDot tone="busy" pulse /> : <PowerIcon size={11} aria-hidden />}
      {live ? POWER_LABEL[power] : short ? 'Unknown' : 'Power unknown'}
    </Chip>
  )
}

/** `short` drops the word "Shutter" where a column header already says it. */
export function ShutterBadge({ projector, short = false }: { projector: Projector; short?: boolean }) {
  const live = isLive(projector)
  const { shutter } = projector.state
  if (!live || shutter === 'unknown') {
    return (
      <Chip tone="unknown" title={live ? 'Shutter state not read' : 'Unknown while the projector is offline'}>
        {short ? '—' : 'Shutter —'}
      </Chip>
    )
  }
  return shutter === 'open' ? (
    <Chip tone="ok" title="Image is showing">
      <ShowIcon size={11} aria-hidden /> {short ? 'Open' : 'Shutter open'}
    </Chip>
  ) : (
    <Chip tone="idle" title="Image blanked by the shutter; the lamp may still be on">
      <BlankIcon size={11} aria-hidden /> {short ? 'Closed' : 'Shutter closed'}
    </Chip>
  )
}

export function InputLabel({ projector, className }: { projector: Projector; className?: string }) {
  const input = activeInput(projector)
  if (input.muted && input.code === '') {
    return (
      <span className={classNames('text-slate-500', className)} title={input.title}>
        {input.text}
      </span>
    )
  }
  const Icon = inputIcon(input.code)
  return (
    <span
      className={classNames('inline-flex min-w-0 items-center gap-1.5', input.muted ? 'text-slate-500' : 'text-slate-100', className)}
      title={input.title}
    >
      <Icon size={13} className="shrink-0 text-slate-500" aria-hidden />
      <span className="truncate">{input.text}</span>
    </span>
  )
}

/**
 * When this projector last answered. "Live" only while polls succeed; once
 * they stop, the label turns into the age of the last reading so nobody
 * mistakes a remembered value for a current one.
 */
export function Freshness({ projector, className }: { projector: Projector; className?: string }) {
  // Ticks on its own, so a memoised card around it still ages its label.
  useTicker(5000)
  const { state } = projector
  if (!projector.enabled) return <span className={classNames('text-slate-600', className)}>Not polled</span>
  if (!state.last_seen_at) {
    return <span className={classNames('text-slate-500', className)}>Never reached</span>
  }
  const live = isLive(projector)
  return (
    <span
      className={classNames('tnum whitespace-nowrap', live ? 'text-slate-500' : 'text-yellow-400/90', className)}
      title={
        live
          ? 'Time of the last successful poll'
          : 'No successful poll inside the staleness window. Values shown are the last known readings, not live state.'
      }
    >
      {live ? `Verified ${relativeTime(state.last_seen_at)}` : `Last reply ${relativeTime(state.last_seen_at)} · stale`}
    </span>
  )
}

const PHASE_ICON = {
  confirmed: CheckIcon,
  unverified: WarningIcon,
  failed: FaultIcon,
  unavailable: UnavailableIcon,
} as const

/** Where a command is between the click and the projector's read-back. */
export function PhaseBadge({ command, showLabel = true }: { command: TrackedCommand; showLabel?: boolean }) {
  const tone = PHASE_TONE[command.phase]
  const active = command.phase === 'pending' || command.phase === 'accepted'
  const Icon = (PHASE_ICON as Record<string, typeof CheckIcon>)[command.phase]
  return (
    <Chip tone={tone} title={command.detail}>
      {active ? (
        <PendingIcon size={11} className="animate-spin" aria-hidden />
      ) : Icon ? (
        <Icon size={11} aria-hidden />
      ) : null}
      {showLabel && PHASE_LABEL[command.phase]}
    </Chip>
  )
}

/** One-line command status: what was pressed and where it stands. */
export function CommandLine({ command, className }: { command: TrackedCommand; className?: string }) {
  return (
    <div className={classNames('flex min-w-0 items-center gap-2 text-xs', className)} title={command.detail}>
      <PhaseBadge command={command} />
      <span className="min-w-0 truncate text-slate-300">{command.label}</span>
      {command.phase === 'accepted' && (
        <span className={classNames('hidden truncate sm:inline', TONE_TEXT.busy)}>waiting for the projector to report it</span>
      )}
    </div>
  )
}
