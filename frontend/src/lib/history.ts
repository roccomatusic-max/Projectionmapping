/** Show history, the energy report and season wrap-ups. Mirrors backend/app/api/routes/show_history.py. */

import { request } from '@/api/client'

export type NightOutcome = 'running' | 'played' | 'missed' | 'failed'

export interface Problem {
  at: string
  kind: string
  label: string
  message: string
  severity: string
  projector: string | null
}

export interface TimelineEntry {
  at: string
  kind: 'cue' | 'scene' | 'start' | 'stop'
  label: string
}

export interface Hottest {
  key: string
  celsius: number
  fahrenheit: number
}

export interface NightProjector {
  id: number
  name: string
  on_hours: number
  /** Hottest reading of each sensor, °C. */
  temps: Record<string, number>
  hottest: Hottest | null
  watts: number
  kwh: number
  cost: number
}

export interface ShowNight {
  id: number
  /** "YYYY-MM-DD": the night it belongs to (after midnight still counts as the night before). */
  night: string
  key: string | null
  title: string
  /** weekly / calendar: planned; hand: GO pressed somewhere; earlier: rebuilt from the log. */
  source: 'weekly' | 'calendar' | 'hand' | 'earlier'
  show_id: number | null
  show_name: string
  group_name: string | null
  planned_start: string | null
  planned_end: string | null
  started_at: string | null
  ended_at: string | null
  started_by: string | null
  ended_by: string | null
  outcome: NightOutcome
  message: string
  minutes: number | null
  timeline: TimelineEntry[]
  problems: Problem[]
  projectors: NightProjector[]
  hottest: (Hottest & { projector: string }) | null
  kwh: number
  cost: number
}

export interface NightsReply {
  nights: ShowNight[]
  currency: string
  price_per_kwh: number
  history_since: string
  days: number
}

export interface EnergyProjector {
  id: number
  name: string
  model: string
  driver: string
  watts: number
  default_watts: number
  watts_is_default: boolean
  hours: number
  kwh: number
  cost: number
}

export interface EnergyWeek {
  start: string
  end: string
  this_week: boolean
  projectors: Array<{ id: number; name: string; hours: number; kwh: number; cost: number }>
  hours: number
  kwh: number
  cost: number
}

export interface EnergyReport {
  weeks: EnergyWeek[]
  projectors: EnergyProjector[]
  nights: Array<{ night: string; kwh: number; cost: number }>
  total_kwh: number
  total_cost: number
  price_per_kwh: number
  currency: string
  history_since: string
}

export interface Season {
  key: string
  name: string
  start: string
  end: string
  kind: 'holiday' | 'calendar'
  nights_played: number
  finished: boolean
  just_finished: boolean
}

export interface Wrapup {
  name: string
  start: string
  end: string
  nights_played: number
  shows_played: number
  nights_missed: number
  missed: Array<{ night: string; title: string; outcome: NightOutcome; message: string }>
  first_night: string | null
  last_night: string | null
  show_hours: number
  average_minutes: number | null
  longest: { night: string; title: string; minutes: number } | null
  projectors: Array<{ id: number; name: string; hours: number; kwh: number; cost: number; hottest: (Hottest & { night: string }) | null }>
  kwh: number
  cost: number
  currency: string
  hottest: (Hottest & { night: string; title: string; projector: string }) | null
  problems: Array<{ kind: string; label: string; count: number }>
  problems_total: number
  clean_nights: number
  groups: Array<{ name: string; shows: number }>
  nights: Array<{ night: string; title: string; outcome: NightOutcome; minutes: number | null; problems: number; hottest: (Hottest & { projector: string }) | null; kwh: number }>
  history_since: string
}

export const historyApi = {
  nights: (days = 60) => request<NightsReply>(`/history/nights?days=${days}`),
  energy: (weeks = 8) => request<EnergyReport>(`/history/energy?weeks=${weeks}`),
  saveEnergy: (body: { price_per_kwh: number; currency: string; watts: Record<string, number> }) =>
    request<EnergyReport>('/history/energy/settings', { method: 'PUT', body }),
  seasons: () => request<{ seasons: Season[]; just_finished: Season | null }>('/history/seasons'),
  wrapup: (start: string, end: string, name: string) =>
    request<Wrapup>(`/history/wrapup?${new URLSearchParams({ start, end, name })}`),
}

/** "Sat, Oct 25" for a "YYYY-MM-DD" night. */
export function nightLabel(night: string, withYear = false): string {
  const [y, m, d] = night.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  })
}

export function timeOf(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'
}

export function minutesText(minutes: number | null | undefined): string {
  if (minutes == null) return '—'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export function money(value: number, currency: string): string {
  return `${currency}${value.toFixed(2)}`
}

export function degreesF(celsius: number): string {
  return `${Math.round((celsius * 9) / 5 + 32)} °F`
}

/** Whether the person last asked for °C on the temperature chart. */
export function prefersCelsius(): boolean {
  try {
    return localStorage.getItem('pc.temperature-unit') === 'C'
  } catch {
    return false
  }
}

export function degrees(celsius: number, celsiusFirst = prefersCelsius()): string {
  return celsiusFirst ? `${Math.round(celsius * 10) / 10} °C` : degreesF(celsius)
}

export const SENSOR_LABEL: Record<string, string> = {
  intake: 'intake',
  exhaust: 'exhaust',
  optics: 'optics',
}
