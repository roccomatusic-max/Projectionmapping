/** Walk the yard: each projector in turn, checked from the phone. Mirrors backend/app/schemas/walkthrough.py. */

import { useEffect, useState } from 'react'
import { request } from '@/api/client'
import type { Tone } from '@/lib/status'

export type WalkProblem = 'blurry' | 'off_target' | 'dark' | 'wrong_projector' | 'nothing' | 'other'
export type WalkPicture = 'id' | 'white'

export interface WalkStop {
  player_id: number
  /** The mini PC's name. */
  name: string
  output_id: number
  output_name: string
  projector_id: number | null
  projector_name: string | null
  /** The mini PC answers right now. */
  online: boolean
  result: 'good' | 'wrong' | null
  problems: WalkProblem[]
  note: string
  checked_at: string | null
}

export interface Walk {
  id: string
  started_at: string
  started_by: string
  finished_at: string | null
  status: 'walking' | 'done' | 'stopped'
  reason: string | null
  /** The stop whose projector shows the test picture; the others are black. */
  index: number
  picture: WalkPicture
  stops: WalkStop[]
}

export interface WalkInfo {
  active: Walk | null
  last: Walk | null
}

export const PROBLEMS: Array<{ id: WalkProblem; label: string }> = [
  { id: 'blurry', label: 'Blurry' },
  { id: 'off_target', label: 'Off target' },
  { id: 'dark', label: 'Too dark' },
  { id: 'wrong_projector', label: 'Wrong projector lit up' },
  { id: 'nothing', label: 'Nothing showing' },
  { id: 'other', label: 'Something else' },
]

const PROBLEM_TEXT: Record<WalkProblem, string> = {
  blurry: 'blurry',
  off_target: 'off target',
  dark: 'too dark',
  wrong_projector: 'wrong projector lit up',
  nothing: 'nothing showing',
  other: 'something else',
}

export const walkApi = {
  get: () => request<WalkInfo>('/walkthrough'),
  start: (stopShow = false) => request<Walk>('/walkthrough/start', { method: 'POST', body: { stop_show: stopShow } }),
  answer: (index: number, result: 'good' | 'wrong', problems: WalkProblem[] = [], note = '') =>
    request<Walk>('/walkthrough/answer', { method: 'POST', body: { index, result, problems, note } }),
  go: (index: number) => request<Walk>('/walkthrough/go', { method: 'POST', body: { index } }),
  picture: (picture: WalkPicture) => request<Walk>('/walkthrough/picture', { method: 'POST', body: { picture } }),
  stop: () => request<WalkInfo>('/walkthrough/stop', { method: 'POST' }),
}

/** What a projector on the walk is called: its projector, else its output, else the mini PC. */
export function stopLabel(stop: WalkStop): string {
  return stop.projector_name || stop.output_name || stop.name
}

export function problemText(stop: WalkStop): string {
  const parts = stop.problems.map((p) => PROBLEM_TEXT[p])
  if (stop.note) parts.push(`“${stop.note}”`)
  return parts.join(', ') || "something's wrong"
}

/** "Today", "Yesterday", "Oct 24". */
export function walkDay(walk: Walk): string {
  const at = new Date(walk.finished_at ?? walk.started_at)
  const days = Math.round((startOfDay(new Date()) - startOfDay(at)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return at.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** "5:40 PM". */
export function walkTime(walk: Walk): string {
  return new Date(walk.finished_at ?? walk.started_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** "Today 5:40 PM", "Yesterday 6:02 PM", "Oct 24, 6:10 PM". */
export function walkWhen(walk: Walk): string {
  const day = walkDay(walk)
  return `${day}${/\d/.test(day) ? ',' : ''} ${walkTime(walk)}`
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** How the last walk went, in a few words, and its colour. */
export function walkVerdict(walk: Walk | null): { text: string; tone: Tone } {
  if (!walk) return { text: 'not walked yet', tone: 'idle' }
  const total = walk.stops.length
  const checked = walk.stops.filter((s) => s.result)
  const wrong = checked.filter((s) => s.result === 'wrong')
  if (wrong.length) return { text: `${wrong.length} of ${total} need${wrong.length === 1 ? 's' : ''} a look`, tone: 'warn' }
  if (checked.length === total) return { text: total === 1 ? 'looked good' : `all ${total} looked good`, tone: 'ok' }
  if (checked.length) return { text: `${checked.length} of ${total} checked, all good`, tone: 'ok' }
  return { text: 'stopped before any were checked', tone: 'idle' }
}

/** The walk going on and the last one, read now and every minute (sooner when it changes). */
export function useWalkInfo(pollMs = 60_000): WalkInfo | null {
  const [info, setInfo] = useState<WalkInfo | null>(null)
  useEffect(() => {
    let stopped = false
    const load = () =>
      walkApi
        .get()
        .then((next) => !stopped && setInfo(next))
        .catch(() => undefined)
    void load()
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void load(), pollMs)
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [pollMs])
  return info
}
