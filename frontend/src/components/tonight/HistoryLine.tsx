import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShowHistoryIcon } from '@/components/icons'
import { useFleetContext } from '@/live/LiveProvider'
import { type Season, type ShowNight, historyApi, minutesText, nightLabel, timeOf } from '@/lib/history'

function lastText(night: ShowNight): string {
  if (night.outcome === 'missed' || night.outcome === 'failed') {
    return `${nightLabel(night.night)}: did not play. ${night.message}`
  }
  const problems = night.problems.length
  return (
    `${nightLabel(night.night)}, ${timeOf(night.started_at)} to ${timeOf(night.ended_at)}` +
    (night.minutes != null ? ` (${minutesText(night.minutes)})` : '') +
    (problems ? `, ${problems} problem${problems === 1 ? '' : 's'}.` : ', no problems.')
  )
}

/**
 * Under Tonight's show: how the last show went, a link to Show history, and
 * a note when a season (Halloween, Christmas, a run on the calendar) is over.
 */
export function HistoryLine() {
  const { subscribe } = useFleetContext()
  const [last, setLast] = useState<ShowNight | null>(null)
  const [season, setSeason] = useState<Season | null>(null)
  const load = useCallback(() => {
    historyApi
      .nights(14)
      .then((r) => setLast(r.nights.find((n) => n.outcome !== 'running') ?? null))
      .catch(() => undefined)
    historyApi
      .seasons()
      .then((r) => setSeason(r.just_finished))
      .catch(() => undefined)
  }, [])
  useEffect(load, [load])
  useEffect(() => subscribe((message) => {
    if (message.type === 'show_history') load()
  }), [subscribe, load])

  return (
    <div className="mt-1 space-y-0.5 text-xs">
      {season && (
        <p className="text-sky-200">
          {season.name} is over: {season.nights_played} night{season.nights_played === 1 ? '' : 's'} of shows.{' '}
          <Link to={`/history?part=season&season=${encodeURIComponent(season.key)}`} className="font-medium underline-offset-2 hover:underline">
            See the season wrap-up
          </Link>
        </p>
      )}
      <p className="flex flex-wrap items-center gap-x-1.5 text-slate-500">
        <ShowHistoryIcon size={12} className="shrink-0" aria-hidden />
        {last && <span>Last show: {lastText(last)}</span>}
        <Link to="/history" className="text-sky-300 underline-offset-2 hover:underline">
          Show history
        </Link>
      </p>
    </div>
  )
}
