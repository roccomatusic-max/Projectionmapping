/** Scene groups and tonight's show. Mirrors backend/app/schemas/tonight.py. */

import { request } from '@/api/client'

export interface SceneGroup {
  id: number
  show_id: number
  name: string
  position: number
  /** The scene for every projector not listed in ``output_scenes``. */
  scene_id: number | null
  /** {output id: scene id, or null for no scene there}. */
  output_scenes: Record<string, number | null>
  updated_at: string
}

export type PlanState = 'off' | 'later' | 'running' | 'done' | 'not_tonight'

export interface Tonight {
  show_id: number | null
  show_name: string | null
  group_id: number | null
  group_name: string | null
  enabled: boolean
  start_at: string | null
  end_at: string | null
  /** Monday 0 to Sunday 6. */
  days: number[]
  power: boolean
  state: PlanState
  starts_at: string | null
  ends_at: string | null
  next_starts_at: string | null
  /** Where tonight's show time comes from: the weekly show time or the calendar. */
  source: 'weekly' | 'calendar' | null
  /** Its name, and the calendar entry it comes from. */
  title: string | null
  entry_id: number | null
  /** Every show time today. */
  tonight_slots: Slot[]
  /** The calendar's "no show" entry keeping tonight dark. */
  cancelled_by: string | null
  /** The name of the next show to start. */
  next_title: string | null
  last_message: string
  timezone: string
}

/** One show time on one night. Mirrors SlotOut in backend/app/schemas/tonight.py. */
export interface Slot {
  key: string
  source: 'weekly' | 'calendar'
  entry_id: number | null
  title: string
  show_id: number | null
  group_id: number | null
  group_name: string | null
  starts_at: string
  ends_at: string
  power: boolean
}

export interface PlanChanges {
  show_id?: number | null
  enabled?: boolean
  start_at?: string | null
  end_at?: string | null
  days?: number[]
  power?: boolean
}

export interface TonightAction {
  ok: boolean
  message: string
  tonight: Tonight
}

export type GroupBody = Pick<SceneGroup, 'name' | 'scene_id' | 'output_scenes'>

export const tonightApi = {
  get: () => request<Tonight>('/tonight'),
  update: (body: PlanChanges) => request<Tonight>('/tonight', { method: 'PUT', body }),
  start: () => request<TonightAction>('/tonight/start', { method: 'POST' }),
  stop: () => request<TonightAction>('/tonight/stop', { method: 'POST' }),
  groups: () => request<SceneGroup[]>('/mapping/scene-groups'),
  createGroup: (body: GroupBody & { show_id: number }) =>
    request<SceneGroup>('/mapping/scene-groups', { method: 'POST', body }),
  updateGroup: (id: number, body: Partial<GroupBody>) =>
    request<SceneGroup>(`/mapping/scene-groups/${id}`, { method: 'PATCH', body }),
  deleteGroup: (id: number) => request<void>(`/mapping/scene-groups/${id}`, { method: 'DELETE' }),
  useGroup: (id: number) => request<Tonight>(`/mapping/scene-groups/${id}/use`, { method: 'POST' }),
}

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** "every night", "weeknights", "Fri and Sat", "Mon, Wed and Fri". */
export function describeDays(days: number[]): string {
  const sorted = [...new Set(days)].sort()
  if (sorted.length === 7) return 'every night'
  if (sorted.length === 0) return 'no nights picked'
  if (sorted.join() === '0,1,2,3,4') return 'weeknights'
  if (sorted.join() === '5,6') return 'weekends'
  const names = sorted.map((d) => DAY_NAMES[d])
  return names.length === 1 ? `${names[0]} only` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** "18:30" as "6:30 PM". */
export function clockText(value: string | null): string {
  if (!value) return '—'
  const [h, m] = value.split(':').map(Number)
  const date = new Date(2000, 0, 1, h, m)
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** An ISO time as "6:30 PM", with the weekday when it is not today. */
export function whenText(iso: string | null, now = new Date()): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return time
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (date.toDateString() === tomorrow.toDateString()) return `tomorrow ${time}`
  // Within the week the weekday says it; further out it needs the date.
  if (date.getTime() - now.getTime() < 6 * 86_400_000) return `${date.toLocaleDateString([], { weekday: 'long' })} ${time}`
  return `${date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`
}

/** "6:30 PM", from an ISO time. */
export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** A span of time in plain words: "2 h 15 min", "45 min", "under a minute". */
export function spanText(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'under a minute'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60
  if (days > 0) return `${days} day${days === 1 ? '' : 's'}${hours ? ` ${hours} h` : ''}`
  if (hours > 0) return `${hours} h${rest ? ` ${rest} min` : ''}`
  return `${rest} min`
}
