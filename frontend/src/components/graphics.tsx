/**
 * Graphic building blocks shared by every page.
 *
 * Rules these follow: status colour is never the only cue (each graphic
 * carries an icon and a label), a value against a limit is a meter with a
 * track in a lighter step of the same hue, and numbers are set in text
 * tokens — the coloured mark beside them carries the state.
 */

import type { ReactNode } from 'react'
import type { LampReading, PowerState, ShutterState } from '@/api/types'
import { classNames, POWER_LABEL, SHUTTER_LABEL } from '@/lib/format'
import {
  CoverIcon,
  DigitalLinkIcon,
  DviIcon,
  FanIcon,
  FaultIcon,
  FilterIcon,
  HdmiIcon,
  LampIcon,
  OkIcon,
  PowerIcon,
  ProjectorIcon,
  RgbIcon,
  SdiIcon,
  ShutterIcon,
  TemperatureIcon,
  VideoIcon,
  WarningIcon,
  type LucideIcon,
} from './icons'

import { TONE_RING, TONE_SOFT_BG, TONE_TEXT, type Tone } from './tone'
import { lampTone } from '@/lib/status'

export type { Tone }
export { TONE_RING, TONE_TEXT }

/* ------------------------------------------------------------------ */
/* Projector mark: the device icon inside a status ring                 */
/* ------------------------------------------------------------------ */

export function ProjectorMark({
  tone,
  pulse = false,
  size = 'md',
}: {
  tone: Tone
  pulse?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const box = { sm: 'h-8 w-8', md: 'h-11 w-11', lg: 'h-16 w-16' }[size]
  const icon = { sm: 16, md: 22, lg: 32 }[size]
  return (
    <span
      className={classNames(
        'relative inline-flex shrink-0 items-center justify-center rounded-full ring-2',
        box,
        TONE_SOFT_BG[tone],
        TONE_RING[tone],
      )}
      aria-hidden
    >
      {pulse && (
        <span
          className={classNames(
            'absolute inset-0 animate-breathe rounded-full ring-2 opacity-60',
            TONE_RING[tone],
          )}
        />
      )}
      <ProjectorIcon size={icon} className={TONE_TEXT[tone]} strokeWidth={1.75} />
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Power and shutter glyphs: icon + label, state in both                */
/* ------------------------------------------------------------------ */

export function powerTone(state: PowerState, live: boolean): Tone {
  if (!live) return 'unknown'
  switch (state) {
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

export function PowerGlyph({
  state,
  live,
  size = 'md',
}: {
  state: PowerState
  live: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const tone = powerTone(state, live)
  const transitioning = live && (state === 'warming' || state === 'cooling')
  return (
    <Glyph
      icon={PowerIcon}
      tone={tone}
      label={live ? POWER_LABEL[state] : 'Offline'}
      caption="Power"
      size={size}
      pulse={transitioning}
    />
  )
}

export function ShutterGlyph({
  state,
  live,
  size = 'md',
}: {
  state: ShutterState
  live: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const tone: Tone = !live ? 'unknown' : state === 'closed' ? 'idle' : state === 'open' ? 'ok' : 'unknown'
  return (
    <Glyph
      icon={ShutterIcon}
      tone={tone}
      label={live ? SHUTTER_LABEL[state] : '—'}
      caption="Shutter"
      size={size}
      slash={live && state === 'closed'}
    />
  )
}

export function Glyph({
  icon: Icon,
  tone,
  label,
  caption,
  size = 'md',
  pulse = false,
  slash = false,
}: {
  icon: LucideIcon
  tone: Tone
  label: ReactNode
  caption?: string
  size?: 'sm' | 'md' | 'lg'
  pulse?: boolean
  slash?: boolean
}) {
  const box = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-14 w-14' }[size]
  const px = { sm: 16, md: 20, lg: 28 }[size]
  const text = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' }[size]
  return (
    <div className="flex items-center gap-3">
      <span
        className={classNames(
          'relative inline-flex shrink-0 items-center justify-center rounded-lg',
          box,
          TONE_SOFT_BG[tone],
        )}
        aria-hidden
      >
        {pulse && (
          <span className={classNames('absolute inset-0 animate-breathe rounded-lg', TONE_SOFT_BG[tone])} />
        )}
        <Icon size={px} className={classNames('relative', TONE_TEXT[tone])} strokeWidth={1.75} />
        {slash && (
          <span className="absolute left-1/2 top-1/2 h-[2px] w-[70%] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded bg-slate-300" />
        )}
      </span>
      <div className="min-w-0 leading-tight">
        {caption && <p className="text-[11px] uppercase tracking-wide text-slate-500">{caption}</p>}
        <p className={classNames('font-medium text-slate-100', text)}>{label}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Lamp meter: hours against the replacement limit                      */
/* ------------------------------------------------------------------ */

const METER_FILL: Record<Tone, string> = {
  ok: 'bg-green-400',
  warn: 'bg-yellow-400',
  fault: 'bg-red-400',
  idle: 'bg-slate-500',
  busy: 'bg-sky-400',
  unknown: 'bg-slate-600',
}
const METER_TRACK: Record<Tone, string> = {
  ok: 'bg-green-400/15',
  warn: 'bg-yellow-400/15',
  fault: 'bg-red-400/15',
  idle: 'bg-slate-500/15',
  busy: 'bg-sky-400/15',
  unknown: 'bg-slate-600/20',
}

export function LampMeter({
  label,
  hours,
  warn,
  critical,
  compact = false,
  note,
}: {
  label: string
  hours: number | null
  warn: number
  critical: number
  compact?: boolean
  note?: string
}) {
  const tone: Tone = lampTone(hours, warn, critical)
  const pct = hours == null ? 0 : Math.min(100, Math.round((hours / critical) * 100))
  return (
    <div className="min-w-0" title={note ?? `${label}: warn at ${warn.toLocaleString()} h, replace at ${critical.toLocaleString()} h`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={classNames('flex items-center gap-1.5 text-slate-400', compact ? 'text-[11px]' : 'text-xs')}>
          <LampIcon size={compact ? 12 : 14} className={TONE_TEXT[tone]} aria-hidden />
          {label}
        </span>
        <span className={classNames('tnum text-slate-100', compact ? 'text-xs' : 'text-sm')}>
          {hours == null ? '—' : `${hours.toLocaleString()} h`}
        </span>
      </div>
      <div
        className={classNames('mt-1 h-1.5 w-full overflow-hidden rounded-full', METER_TRACK[tone])}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={critical}
        aria-valuenow={hours ?? undefined}
        aria-label={`${label} hours`}
      >
        <div className={classNames('h-full rounded-full', METER_FILL[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function LampMeters({
  lamps,
  warn,
  critical,
}: {
  lamps: LampReading[]
  warn: number
  critical: number
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {lamps.map((lamp) => (
        <LampMeter
          key={lamp.index}
          label={`Lamp ${lamp.index}`}
          hours={lamp.hours}
          warn={warn}
          critical={critical}
          note={lamp.error ?? (lamp.unparsed ? `Unparsed reply: ${lamp.raw}` : undefined)}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Subsystem health tiles (PJLink %1ERST)                               */
/* ------------------------------------------------------------------ */

const SUBSYSTEM_ICON: Record<string, LucideIcon> = {
  fan: FanIcon,
  lamp: LampIcon,
  temperature: TemperatureIcon,
  cover: CoverIcon,
  filter: FilterIcon,
  other: FaultIcon,
}

export function SubsystemTiles({ status }: { status: Record<string, string> }) {
  const entries = Object.entries(status)
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {entries.map(([name, severity]) => {
        const tone: Tone = severity === 'error' ? 'fault' : severity === 'warning' ? 'warn' : severity === 'ok' ? 'ok' : 'unknown'
        const Icon = SUBSYSTEM_ICON[name] ?? FaultIcon
        const Badge = tone === 'ok' ? OkIcon : tone === 'warn' ? WarningIcon : FaultIcon
        return (
          <div
            key={name}
            className={classNames('flex flex-col items-center gap-1 rounded-lg px-2 py-2.5', TONE_SOFT_BG[tone])}
            title={`${name}: ${severity}`}
          >
            <Icon size={20} className={TONE_TEXT[tone]} strokeWidth={1.75} aria-hidden />
            <span className="text-[11px] capitalize text-slate-300">{name}</span>
            <span className={classNames('flex items-center gap-1 text-[11px]', TONE_TEXT[tone])}>
              <Badge size={11} aria-hidden /> {severity}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Input badge: an icon per connector family                            */
/* ------------------------------------------------------------------ */

export function inputIcon(code: string): LucideIcon {
  const c = code.toUpperCase()
  if (c.startsWith('HD')) return HdmiIcon
  if (c.startsWith('DVI')) return DviIcon
  if (c.startsWith('RG')) return RgbIcon
  if (c.startsWith('SD')) return SdiIcon
  if (c.startsWith('DL')) return DigitalLinkIcon
  // PJLink two-character codes: 1x RGB, 3x digital.
  if (/^1[1-9A-Z]$/.test(c)) return RgbIcon
  if (/^3[1-9A-Z]$/.test(c)) return HdmiIcon
  return VideoIcon
}

export function InputBadge({ code, label, muted = false }: { code: string; label: string; muted?: boolean }) {
  const Icon = inputIcon(code)
  return (
    <span className={classNames('inline-flex items-center gap-1.5', muted ? 'text-slate-500' : 'text-slate-100')}>
      <Icon size={14} className={muted ? 'text-slate-600' : 'text-slate-400'} aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Stat tile: icon, label, value                                        */
/* ------------------------------------------------------------------ */

export function StatTile({
  icon: Icon,
  label,
  value,
  tone = 'idle',
  hint,
  onClick,
  active = false,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  tone?: Tone
  hint?: string
  onClick?: () => void
  active?: boolean
}) {
  const body = (
    <>
      <span className={classNames('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', TONE_SOFT_BG[tone])} aria-hidden>
        <Icon size={20} className={TONE_TEXT[tone]} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 text-left">
        <p className="truncate text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
        <p className="tnum text-2xl font-semibold leading-tight text-slate-100">{value}</p>
      </div>
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        className={classNames('panel-interactive flex items-center gap-3 px-4 py-3', active && 'panel-active')}
        title={hint}
        onClick={onClick}
        aria-pressed={active}
      >
        {body}
      </button>
    )
  }
  return (
    <div className="panel flex items-center gap-3 px-4 py-3" title={hint}>
      {body}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Fleet bar: one segment per projector state, in fleet order           */
/* ------------------------------------------------------------------ */

export type FleetSegmentKind = 'on' | 'transition' | 'standby' | 'offline'

const SEGMENT_STYLE: Record<FleetSegmentKind, { fill: string; label: string }> = {
  on: { fill: 'bg-green-400', label: 'Lamp on' },
  transition: { fill: 'bg-sky-400', label: 'Starting / cooling' },
  standby: { fill: 'bg-slate-500', label: 'Standby' },
  offline: { fill: 'bg-red-400', label: 'Offline' },
}

export function FleetBar({ segments }: { segments: Array<{ name: string; kind: FleetSegmentKind }> }) {
  if (segments.length === 0) return null
  const counts = segments.reduce<Record<FleetSegmentKind, number>>(
    (acc, s) => ({ ...acc, [s.kind]: acc[s.kind] + 1 }),
    { on: 0, transition: 0, standby: 0, offline: 0 },
  )
  return (
    <div>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Fleet state">
        {segments.map((segment, index) => (
          <span
            key={`${segment.name}-${index}`}
            className={classNames('h-full flex-1', SEGMENT_STYLE[segment.kind].fill)}
            title={`${segment.name}: ${SEGMENT_STYLE[segment.kind].label}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
        {(Object.keys(SEGMENT_STYLE) as FleetSegmentKind[]).map((kind) =>
          counts[kind] > 0 ? (
            <span key={kind} className="flex items-center gap-1.5">
              <span className={classNames('h-2 w-2 rounded-sm', SEGMENT_STYLE[kind].fill)} aria-hidden />
              {SEGMENT_STYLE[kind].label}
              <span className="tnum text-slate-200">{counts[kind]}</span>
            </span>
          ) : null,
        )}
      </div>
    </div>
  )
}
