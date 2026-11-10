import { useEffect, useState } from 'react'
import { request } from '@/api/client'
import { classNames, parseServerTime } from '@/lib/format'

/**
 * Keeping a picture on every projector (backend services/output_care.py):
 * restart every mini PC's output at a set time each day, and restart one
 * that has no picture while a show should be on.
 */

export interface OutputCarePlayer {
  player_id: number
  problem: string | null
  gave_up: boolean
  restarts_last_hour: number
  last_restart_at: string | null
  last_restart_reason: string | null
}

export interface OutputCareStatus {
  daily_enabled: boolean
  daily_time: string
  watchdog_enabled: boolean
  next_daily_at: string | null
  daily_waiting: string | null
  last_daily_at: string | null
  last_daily_note: string | null
  watching: string | null
  timezone: string
  players: OutputCarePlayer[]
}

export function loadOutputCare(): Promise<OutputCareStatus> {
  return request<OutputCareStatus>('/mapping/output-care')
}

/** "7:00 AM", "tomorrow at 7:00 AM", "Mon 7:00 AM". */
export function when(iso: string | null, withDay = true): string {
  if (!iso) return ''
  const date = parseServerTime(iso)
  if (Number.isNaN(date.getTime())) return ''
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (!withDay) return time
  const today = new Date()
  const days = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000,
  )
  if (days === 0) return `today at ${time}`
  if (days === 1) return `tomorrow at ${time}`
  if (days === -1) return `yesterday at ${time}`
  return `${date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at ${time}`
}

export function OutputCarePanel({
  status,
  canEdit,
  onSaved,
  onError,
}: {
  status: OutputCareStatus | null
  canEdit: boolean
  onSaved: (status: OutputCareStatus) => void
  onError: (message: string) => void
}) {
  const [time, setTime] = useState(status?.daily_time ?? '07:00')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (status) setTime(status.daily_time)
  }, [status?.daily_time])

  if (!status) return null

  const save = async (change: Partial<Pick<OutputCareStatus, 'daily_enabled' | 'daily_time' | 'watchdog_enabled'>>) => {
    setBusy(true)
    try {
      onSaved(
        await request<OutputCareStatus>('/mapping/output-care', {
          method: 'PUT',
          body: {
            daily_enabled: status.daily_enabled,
            daily_time: status.daily_time,
            watchdog_enabled: status.watchdog_enabled,
            ...change,
          },
        }),
      )
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not save that')
      setTime(status.daily_time)
    } finally {
      setBusy(false)
    }
  }

  const troubled = status.players.filter((p) => p.problem || p.gave_up).length
  const watchWords = !status.watchdog_enabled
    ? 'Off.'
    : status.watching
      ? troubled
        ? `Watching now, because ${status.watching}. ${troubled === 1 ? 'One mini PC has' : `${troubled} mini PCs have`} no picture: see below.`
        : `Watching now, because ${status.watching}. Every picture is fine.`
      : 'Not watching right now: no show is on. It starts by itself when a show plays or it is show time on the Calendar.'

  return (
    <div className="space-y-3 rounded-md bg-panel-850 p-3 ring-1 ring-white/5">
      <div>
        <p className="text-sm font-medium text-slate-200">Keep a picture on every projector</p>
        <p className="text-xs text-slate-500">
          Restarting an output closes and reopens the picture on that mini PC, like its Restart output button. The
          projector goes dark for a few seconds. The computer itself never restarts.
        </p>
      </div>

      <div className="flex items-start gap-2 text-sm text-slate-300">
        <input
          id="care-daily"
          type="checkbox"
          className="mt-1"
          checked={status.daily_enabled}
          disabled={!canEdit || busy}
          onChange={(e) => void save({ daily_enabled: e.target.checked })}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="care-daily">Restart every output each day at</label>
            <input
              type="time"
              aria-label="Daily restart time"
              className="input w-32 py-1 text-sm"
              value={time}
              disabled={!canEdit || busy || !status.daily_enabled}
              onChange={(e) => setTime(e.target.value)}
              onBlur={() => time && time !== status.daily_time && void save({ daily_time: time })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </div>
          <p className="text-xs text-slate-500">
            If a show is on, about to start, or an automation is running then, it waits and does it as soon as that is
            over.
          </p>
          {status.daily_enabled && (
            <p className={classNames('text-xs', status.daily_waiting ? 'text-amber-300' : 'text-slate-400')}>
              {status.daily_waiting
                ? `Waiting because ${status.daily_waiting}. It restarts as soon as that is over.`
                : `Next: ${when(status.next_daily_at)}.`}
              {status.last_daily_at && (
                <span className="text-slate-500">
                  {' '}
                  Last: {when(status.last_daily_at)}
                  {status.last_daily_note ? `, ${status.last_daily_note.charAt(0).toLowerCase()}${status.last_daily_note.slice(1)}` : ''}.
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <label className="flex items-start gap-2 border-t border-white/5 pt-3 text-sm text-slate-300">
        <input
          type="checkbox"
          className="mt-1"
          checked={status.watchdog_enabled}
          disabled={!canEdit || busy}
          onChange={(e) => void save({ watchdog_enabled: e.target.checked })}
        />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block">Restart an output that has no picture during a show</span>
          <span className="block text-xs text-slate-500">
            While a show plays (or it is show time on the Calendar), each mini PC is checked every 10 seconds. If its
            picture stops for half a minute, its output is restarted. After 3 tries in an hour that do not help, you get
            an alert instead. A show that is dark on purpose, a blackout or the emergency stop never count.
          </span>
          <span className={classNames('block text-xs', troubled && status.watching ? 'text-amber-300' : 'text-slate-400')}>
            {watchWords}
          </span>
        </span>
      </label>
    </div>
  )
}

/** One line on a mini PC's card: its picture right now, or its last restart. */
export function OutputCareLine({ care, watching }: { care: OutputCarePlayer | undefined; watching: boolean }) {
  if (!care) return null
  if (care.gave_up)
    return (
      <p className="mt-2 text-xs text-red-300">
        No picture: its output is {care.problem ?? 'failing'}. Restarting it {care.restarts_last_hour} times did not
        help. Try Restart computer, or check the cable to the projector.
      </p>
    )
  if (care.problem && watching)
    return (
      <p className="mt-2 text-xs text-amber-300">
        No picture: its output is {care.problem}. It restarts by itself if that lasts half a minute.
      </p>
    )
  if (care.last_restart_at)
    return (
      <p className="mt-2 text-xs text-slate-500">
        Output restarted {when(care.last_restart_at)}
        {care.last_restart_reason === 'daily restart' ? ' (daily restart)' : ` (it was ${care.last_restart_reason})`}.
      </p>
    )
  return null
}
