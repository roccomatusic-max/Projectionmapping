/**
 * Status colour classes, by tone. The only place a status maps to a colour:
 *   ok    green   operational
 *   warn  yellow  needs attention
 *   fault red     critical fault
 *   idle  gray    offline, standby, unavailable
 *   busy  blue    transitioning, command in flight
 */
import type { Tone } from '@/lib/status'

export type { Tone }

export const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-emerald-400',
  warn: 'text-yellow-400',
  fault: 'text-red-400',
  idle: 'text-slate-400',
  busy: 'text-sky-400',
  unknown: 'text-slate-500',
}

export const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-status-ok',
  warn: 'bg-status-warn',
  fault: 'bg-status-fault',
  idle: 'bg-status-idle',
  busy: 'bg-status-busy',
  unknown: 'bg-status-unknown',
}

export const TONE_SOFT_BG: Record<Tone, string> = {
  ok: 'bg-emerald-500/10',
  warn: 'bg-yellow-500/10',
  fault: 'bg-red-500/10',
  idle: 'bg-slate-500/10',
  busy: 'bg-sky-500/10',
  unknown: 'bg-slate-500/10',
}

export const TONE_RING: Record<Tone, string> = {
  ok: 'ring-emerald-500/60',
  warn: 'ring-yellow-500/60',
  fault: 'ring-red-500/60',
  idle: 'ring-slate-600',
  busy: 'ring-sky-500/60',
  unknown: 'ring-slate-700',
}

export const TONE_CHIP: Record<Tone, string> = {
  ok: 'bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/25',
  warn: 'bg-yellow-500/10 text-yellow-300 ring-1 ring-inset ring-yellow-500/25',
  fault: 'bg-red-500/10 text-red-300 ring-1 ring-inset ring-red-500/30',
  idle: 'bg-slate-500/10 text-slate-300 ring-1 ring-inset ring-slate-500/20',
  busy: 'bg-sky-500/10 text-sky-300 ring-1 ring-inset ring-sky-500/25',
  unknown: 'bg-slate-500/10 text-slate-400 ring-1 ring-inset ring-slate-500/20',
}

/** Left-edge accent on cards and rows. */
export const TONE_EDGE: Record<Tone, string> = {
  ok: 'before:bg-emerald-500',
  warn: 'before:bg-yellow-400',
  fault: 'before:bg-red-500',
  idle: 'before:bg-slate-600',
  busy: 'before:bg-sky-400',
  unknown: 'before:bg-slate-700',
}

export const TONE_BANNER: Record<Tone, string> = {
  ok: 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-200',
  warn: 'border-yellow-500/25 bg-yellow-500/[0.08] text-yellow-100',
  fault: 'border-red-500/35 bg-red-500/[0.12] text-red-100',
  idle: 'border-white/10 bg-panel-850 text-slate-300',
  busy: 'border-sky-500/25 bg-sky-500/[0.08] text-sky-100',
  unknown: 'border-white/10 bg-panel-850 text-slate-300',
}
