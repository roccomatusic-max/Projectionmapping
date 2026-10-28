/** The show calendar. Mirrors backend/app/schemas/show_calendar.py. */

import { request } from '@/api/client'
import type { Slot } from '@/lib/tonight'

export interface CalendarEntry {
  id: number
  /** "show" plays the show; "off" keeps those nights dark. */
  kind: 'show' | 'off'
  title: string
  show_id: number | null
  group_id: number | null
  /** Plays instead of the group when set. */
  playlist_id: number | null
  /** "YYYY-MM-DD", local dates; the same for one night. Every entry has an end: nothing repeats by itself. */
  start_date: string
  end_date: string | null
  /** Monday 0 to Sunday 6. */
  days: number[]
  start_at: string | null
  end_at: string | null
  power: boolean
  note: string
  created_at: string
  updated_at: string
}

export type EntryBody = Omit<CalendarEntry, 'id' | 'created_at' | 'updated_at'>

export interface CalendarSlot extends Slot {
  state: 'done' | 'running' | 'later'
}

export interface Skipped {
  entry_id: number | null
  title: string
  reason: string
}

export interface CalendarDay {
  date: string
  slots: CalendarSlot[]
  cancelled_by: Skipped | null
  skipped: Skipped[]
}

export interface CalendarData {
  timezone: string
  today: string
  days: CalendarDay[]
  entries: CalendarEntry[]
}

export const calendarApi = {
  get: (start: string, days: number) => request<CalendarData>(`/calendar?start=${start}&days=${days}`),
  create: (body: EntryBody) => request<CalendarEntry>('/calendar/entries', { method: 'POST', body }),
  update: (id: number, body: EntryBody) => request<CalendarEntry>(`/calendar/entries/${id}`, { method: 'PUT', body }),
  remove: (id: number) => request<void>(`/calendar/entries/${id}`, { method: 'DELETE' }),
}

/** A local date as "YYYY-MM-DD". */
export function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** "YYYY-MM-DD" as a local date at midnight. */
export function fromIso(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(date.getDate() + days)
  return next
}

/** Monday 0 to Sunday 6, as the server counts them. */
export function weekday(date: Date): number {
  return (date.getDay() + 6) % 7
}

/** The Monday on or before a date. */
export function startOfWeek(date: Date): Date {
  return addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), -weekday(date))
}

/** "Sat Oct 31", or with the year when it is not this year. */
export function dayText(value: string, opts: { weekday?: boolean } = {}): string {
  const date = fromIso(value)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString([], {
    weekday: opts.weekday === false ? undefined : 'short',
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  })
}

/** When an entry runs, in plain words: "Sat Oct 31", "Nov 1 to Nov 30, Fri and Sat". */
export function entryWhen(entry: Pick<CalendarEntry, 'start_date' | 'end_date' | 'days'>, describeDays: (days: number[]) => string): string {
  if (!entry.end_date || entry.end_date === entry.start_date) return dayText(entry.start_date)
  const nights = describeDays(entry.days)
  return `${dayText(entry.start_date, { weekday: false })} to ${dayText(entry.end_date, { weekday: false })}, ${nights}`
}

/** The newest show on the calendar: a new one starts from its times and look. */
export function latestShow(entries: CalendarEntry[]): CalendarEntry | null {
  return entries.filter((e) => e.kind === 'show').reduce<CalendarEntry | null>((best, e) => (!best || e.id > best.id ? e : best), null)
}
