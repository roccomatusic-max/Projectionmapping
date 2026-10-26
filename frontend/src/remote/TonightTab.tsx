import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@/api/client'
import { CalendarIcon, CheckIcon, ClockIcon, RunShowIcon, StopIcon } from '@/components/icons'
import { TimesEditor, calendarLines, groupLines, timeLine, usedText } from '@/components/tonight/TonightShow'
import { TONE_DOT, TONE_TEXT, type Tone } from '@/components/tone'
import { classNames } from '@/lib/format'
import { usedPlaylistText } from '@/components/tonight/Playlists'
import { clockText, describeDays, playlistNow, timeOf, tonightApi, type Playlist, type SceneGroup, type Tonight } from '@/lib/tonight'
import { mappingApi } from '@/mapping/api'
import type { MappingScene, Show, ShowSummary, TransportState } from '@/mapping/types'

/**
 * Tonight's show on the phone: the same plan as the Dashboard's card
 * (components/tonight/TonightShow.tsx), laid out for one thumb. Shows what
 * plays tonight and when (a playlist's step on now and the next one),
 * picks tonight's scene group or playlist, starts or stops the show, and
 * sets the show time.
 */

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

export default function TonightTab({ session, transport, onCalendar }: {
  session: Session
  transport: TransportState | null
  /** Opens the Calendar tab. */
  onCalendar?: () => void
}) {
  const canRun = session.role === 'admin' || session.role === 'operator'
  const [tonight, setTonight] = useState<Tonight | null>(null)
  const [groups, setGroups] = useState<SceneGroup[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [scenes, setScenes] = useState<MappingScene[]>([])
  const [shows, setShows] = useState<ShowSummary[]>([])
  const [fullShows, setFullShows] = useState<Record<number, Show>>({})
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: Tone; text: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, tick] = useState(0)

  const load = useCallback(async () => {
    try {
      const [plan, list, lists] = await Promise.all([tonightApi.get(), tonightApi.groups(), tonightApi.playlists()])
      setTonight(plan)
      setGroups(list)
      setPlaylists(lists)
      setError(null)
    } catch (err) {
      setError(errorText(err, "Tonight's show could not be loaded"))
    }
  }, [])

  useEffect(() => {
    void load()
    mappingApi.listScenes().then(setScenes).catch(() => undefined)
    mappingApi.listShows().then(setShows).catch(() => undefined)
    // The plan changes by itself at show time; keep the countdown and state fresh.
    const timer = window.setInterval(() => {
      tick((n) => n + 1)
      if (document.visibilityState === 'visible') void load()
    }, 15_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  // Projector names for each group's lines.
  const showKey = [...new Set(groups.map((g) => g.show_id))].join(',')
  useEffect(() => {
    for (const id of new Set(groups.map((g) => g.show_id))) {
      mappingApi
        .getShow(id)
        .then((show) => setFullShows((current) => ({ ...current, [id]: show })))
        .catch(() => undefined)
    }
  }, [showKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Start or stop on the Show tab or the computer shows up here straight away.
  useEffect(() => {
    void load()
  }, [transport?.status, transport?.show_id, load])

  const act = async (label: string, work: () => Promise<void>) => {
    setBusy(label)
    setNotice(null)
    try {
      await work()
    } catch (err) {
      setNotice({ tone: 'fault', text: errorText(err, 'That did not work') })
    } finally {
      setBusy(null)
    }
  }
  const start = () =>
    act('start', async () => {
      const result = await tonightApi.start()
      setTonight(result.tonight)
      setNotice({ tone: result.ok ? 'ok' : 'warn', text: result.message })
    })
  const stop = () =>
    act('stop', async () => {
      const result = await tonightApi.stop()
      setTonight(result.tonight)
      setNotice({ tone: 'ok', text: `${result.message} The projectors stay on.` })
    })
  const useGroup = (group: SceneGroup) =>
    act(`group-${group.id}`, async () => {
      const next = await tonightApi.useGroup(group.id)
      setTonight(next)
      setNotice(usedText(group, next, transport))
    })
  const usePlaylist = (playlist: Playlist) =>
    act(`playlist-${playlist.id}`, async () => {
      const next = await tonightApi.usePlaylist(playlist.id)
      setTonight(next)
      setNotice(usedPlaylistText(playlist, next))
    })

  const now = new Date()
  const time = tonight ? timeLine(tonight, now) : null
  const held = !!transport?.emergency
  const playingTonight =
    !!tonight?.show_id && transport?.show_id === tonight.show_id && (transport.status === 'playing' || transport.status === 'paused')
  const multipleShows = shows.length > 1
  // Tonight is planned by the calendar (a show, or no show), not the weekly time.
  const onCalendarTonight = !!tonight && (tonight.tonight_slots.some((s) => s.source === 'calendar') || !!tonight.cancelled_by)

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-6 pt-3">
      <header>
        <p className="text-[17px] font-semibold text-slate-50">Tonight&apos;s show</p>
        {multipleShows && <p className="text-xs text-slate-500">{tonight?.show_name ?? 'No show picked yet'}</p>}
      </header>

      {error && (
        <button className="rounded-2xl bg-red-500/10 px-4 py-3 text-left text-sm text-red-300 ring-1 ring-red-500/20" onClick={() => void load()}>
          {error} Tap to try again.
        </button>
      )}

      {tonight && time && (
        <section aria-live="polite" className="rounded-3xl bg-panel-900 p-5 ring-1 ring-white/[0.06]">
          <span className={classNames('flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em]', time.tone === 'idle' ? 'text-slate-400' : TONE_TEXT[time.tone])}>
            <span className={classNames('h-2 w-2 rounded-full', TONE_DOT[time.tone], time.tone === 'ok' && 'animate-pulse')} />
            {time.chip}
          </span>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">Playing tonight</p>
          <p className="mt-0.5 truncate text-[22px] font-semibold leading-tight text-slate-50">
            {tonight.playlist_name ?? tonight.group_name ?? (groups.length ? 'Pick tonight’s scenes below' : 'No scene group yet')}
          </p>
          {tonight.playlist_name && (playlistNow(tonight).now || playlistNow(tonight).next) && (
            <div className="mt-2 space-y-0.5 text-[15px]">
              {playlistNow(tonight).now && <p className="font-medium text-emerald-200">{playlistNow(tonight).now}</p>}
              {playlistNow(tonight).next && <p className="text-slate-300">{playlistNow(tonight).next}</p>}
            </div>
          )}
          {tonight.playlist_steps.length > 0 && (
            <ol className="mt-3 space-y-1 text-sm">
              {tonight.playlist_steps.map((step, i) => (
                <li
                  key={`${step.starts_at}-${i}`}
                  className={classNames(
                    'tnum flex items-center gap-3',
                    step.state === 'now' ? 'font-semibold text-emerald-200' : step.state === 'later' ? 'text-slate-200' : 'text-slate-500',
                    step.state === 'never' && 'line-through',
                  )}
                >
                  <span className="w-20 shrink-0">{timeOf(step.starts_at)}</span>
                  <span className="min-w-0 flex-1 truncate">{step.group_name ?? 'Deleted group'}</span>
                  {step.state === 'now' && <span className="text-2xs uppercase tracking-wide text-emerald-300">now</span>}
                </li>
              ))}
            </ol>
          )}
          <div className="mt-4 space-y-1.5 border-t border-white/[0.06] pt-3 text-[15px]">
            {calendarLines(tonight).map((line, i) => (
              <p key={line} className={i === 0 ? 'font-medium text-sky-200' : 'text-slate-200'}>
                {line}
              </p>
            ))}
            {tonight.enabled && tonight.start_at && !onCalendarTonight ? (
              <>
                <p className="text-slate-200">
                  {clockText(tonight.start_at)} to {clockText(tonight.end_at)}
                </p>
                <p className="text-slate-400">
                  {describeDays(tonight.days)[0].toUpperCase() + describeDays(tonight.days).slice(1)}
                  {tonight.power && ' · projectors turn on and off by themselves'}
                </p>
              </>
            ) : null}
            <p className="flex items-start gap-1.5 text-slate-300">
              <ClockIcon size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />
              {time.line}
            </p>
            {tonight.last_message && <p className="text-xs text-slate-500">Last: {tonight.last_message}</p>}
          </div>
        </section>
      )}

      {notice && (
        <button
          className={classNames(
            'rounded-2xl px-4 py-3 text-left text-sm ring-1',
            notice.tone === 'fault' ? 'bg-red-500/10 text-red-300 ring-red-500/20' : notice.tone === 'warn' ? 'bg-amber-500/10 text-amber-200 ring-amber-500/20' : 'bg-emerald-500/10 text-emerald-200 ring-emerald-500/20',
          )}
          onClick={() => setNotice(null)}
        >
          {notice.text}
        </button>
      )}

      {tonight && canRun && (
        <div className="grid grid-cols-2 gap-3">
          {playingTonight ? (
            <button
              className="flex h-16 items-center justify-center gap-2 rounded-2xl bg-panel-850 text-[16px] font-semibold text-slate-100 ring-1 ring-white/[0.08] active:scale-[0.97] disabled:opacity-50"
              disabled={busy != null}
              onClick={() => void stop()}
            >
              <StopIcon size={20} aria-hidden /> Stop the show
            </button>
          ) : (
            <button
              className="flex h-16 items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-700 text-[16px] font-semibold text-white active:scale-[0.97] disabled:from-panel-750 disabled:to-panel-800 disabled:text-slate-500"
              disabled={busy != null || !tonight.show_id || held}
              onClick={() => void start()}
            >
              <RunShowIcon size={20} aria-hidden /> {held ? 'Held' : 'Start now'}
            </button>
          )}
          <button
            className="flex h-16 items-center justify-center gap-2 rounded-2xl bg-panel-850 text-[16px] font-semibold text-slate-100 ring-1 ring-white/[0.08] active:scale-[0.97]"
            aria-expanded={editing}
            onClick={() => setEditing((open) => !open)}
          >
            <ClockIcon size={20} aria-hidden /> {tonight.enabled ? 'Change time' : 'Set time'}
          </button>
        </div>
      )}
      {onCalendar && (
        <button
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-panel-900 text-[15px] font-medium text-slate-200 ring-1 ring-white/[0.06] active:scale-[0.98]"
          onClick={onCalendar}
        >
          <CalendarIcon size={18} aria-hidden /> Plan shows on the calendar
        </button>
      )}
      {!canRun && <p className="text-center text-sm text-slate-500">Your account can see tonight&apos;s show but not change it.</p>}

      {editing && tonight && (
        <div className="overflow-hidden rounded-3xl ring-1 ring-white/[0.06]">
          <TimesEditor
            tonight={tonight}
            shows={shows.map((s) => ({ id: s.id, name: s.name }))}
            onCancel={() => setEditing(false)}
            onSaved={(next) => {
              setTonight(next)
              setEditing(false)
              setNotice({
                tone: 'ok',
                text: next.enabled ? `Show time saved: ${clockText(next.start_at)} to ${clockText(next.end_at)}, ${describeDays(next.days)}.` : 'The show will not start by itself.',
              })
            }}
          />
        </div>
      )}

      <section className="mt-1">
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Pick tonight&apos;s scenes</h2>
        {groups.length === 0 ? (
          <p className="rounded-3xl bg-panel-900 p-5 text-[15px] text-slate-400 ring-1 ring-white/[0.06]">
            No scene groups yet. Make one on the Dashboard of Projector Control, then pick it here each evening.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-3xl bg-panel-900 ring-1 ring-white/[0.06]">
            {groups.map((group, i) => {
              const active = !tonight?.playlist_id && tonight?.group_id === group.id
              return (
                <li key={group.id} className={classNames(i > 0 && 'border-t border-white/[0.05]', active && 'bg-sky-500/[0.08]')}>
                  <button
                    className="flex w-full items-center gap-3 px-4 py-4 text-left active:bg-white/[0.03] disabled:cursor-default"
                    disabled={!canRun || busy != null}
                    aria-pressed={active}
                    onClick={() => void useGroup(group)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={classNames('block truncate text-[16px]', active ? 'font-semibold text-sky-100' : 'text-slate-200')}>{group.name}</span>
                      {multipleShows && <span className="block truncate text-xs text-slate-500">{shows.find((s) => s.id === group.show_id)?.name}</span>}
                      {groupLines(group, fullShows[group.show_id], scenes).map((line) => (
                        <span key={line} className="block truncate text-xs text-slate-500">
                          {line}
                        </span>
                      ))}
                    </span>
                    {busy === `group-${group.id}` ? (
                      <span className="text-xs text-slate-400">Setting…</span>
                    ) : (
                      active && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
                          <CheckIcon size={12} aria-hidden /> Tonight
                        </span>
                      )
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {playlists.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Or a playlist</h2>
          <ul className="overflow-hidden rounded-3xl bg-panel-900 ring-1 ring-white/[0.06]">
            {playlists.map((playlist, i) => {
              const active = tonight?.plan_playlist_id === playlist.id || (tonight?.playlist_id === playlist.id && tonight.state === 'running')
              const groupName = (id: number) => groups.find((g) => g.id === id)?.name ?? 'Deleted group'
              return (
                <li key={playlist.id} className={classNames(i > 0 && 'border-t border-white/[0.05]', active && 'bg-sky-500/[0.08]')}>
                  <button
                    className="flex w-full items-center gap-3 px-4 py-4 text-left active:bg-white/[0.03] disabled:cursor-default"
                    disabled={!canRun || busy != null}
                    aria-pressed={active}
                    onClick={() => void usePlaylist(playlist)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={classNames('block truncate text-[16px]', active ? 'font-semibold text-sky-100' : 'text-slate-200')}>{playlist.name}</span>
                      {playlist.steps.map((step, j) => (
                        <span key={`${step.at}-${j}`} className="tnum block truncate text-xs text-slate-500">
                          {clockText(step.at)} · {groupName(step.group_id)}
                        </span>
                      ))}
                    </span>
                    {busy === `playlist-${playlist.id}` ? (
                      <span className="text-xs text-slate-400">Setting…</span>
                    ) : (
                      active && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
                          <CheckIcon size={12} aria-hidden /> Tonight
                        </span>
                      )
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 px-1 text-xs text-slate-500">Make and change playlists on the Dashboard of Projector Control.</p>
        </section>
      )}
    </div>
  )
}
