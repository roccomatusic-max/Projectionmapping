/**
 * The home page's evening view: what plays tonight, when, what is coming
 * up on the next nights, and whether everything it needs is ready.
 *
 * Shows play only on nights added to the calendar (services/show_calendar.py):
 * "Add a show tonight" puts one on tonight, and a night with nothing on it
 * says "No show tonight". Scene groups pick a scene for every projector at
 * once ("Halloween night"); one click on a group makes every projector
 * follow it, and tonight's own show play it. Playlists play groups in turn
 * through the night (Playlists.tsx). The server starts and stops each
 * planned show by itself (services/tonight.py).
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Session } from '@/api/client'
import type { Projector, TemperatureReading } from '@/api/types'
import { useFleetContext } from '@/live/LiveProvider'
import { useTicker } from '@/hooks/useLiveData'
import { mappingApi } from '@/mapping/api'
import type { MappingScene, Show } from '@/mapping/types'
import { outputColor } from '@/mapping/editor/panels'
import { useShowStatus } from '@/components/shell/ShowStatus'
import { Banner, Chip, ConfirmDialog, EmptyState, Modal, StatusDot } from '@/components/ui'
import { TONE_TEXT, type Tone } from '@/components/tone'
import {
  AddIcon,
  BlackoutIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  EditIcon,
  RunShowIcon,
  ScenesIcon,
  StopIcon,
} from '@/components/icons'
import { classNames, formatHours } from '@/lib/format'
import { LiveView } from './LiveView'
import { HistoryLine } from './HistoryLine'
import { PlaylistTimeline, PlaylistsPanel } from './Playlists'
import { isLive, lampTone, matchesFilter, peakLampHours } from '@/lib/status'
import { problemText, stopLabel, useWalkInfo, walkDay, walkTime, walkVerdict } from '@/lib/walkthrough'
import { calendarApi, dayText, isoDate, latestShow, type CalendarData } from '@/lib/calendar'
import { EntryEditor } from '@/components/calendar/EntryEditor'
import { spanText, timeOf, tonightApi, whenText, type Playlist, type SceneGroup, type Tonight } from '@/lib/tonight'

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

/** Everything the evening view reads, kept live from the feed. */
function useTonightData() {
  const { subscribe } = useFleetContext()
  const [tonight, setTonight] = useState<Tonight | null>(null)
  const [groups, setGroups] = useState<SceneGroup[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [scenes, setScenes] = useState<MappingScene[]>([])
  const [shows, setShows] = useState<Record<number, Show>>({})
  const [error, setError] = useState<string | null>(null)

  const loadTonight = useCallback(async () => {
    try {
      setTonight(await tonightApi.get())
      setError(null)
    } catch (err) {
      setError(errorText(err, "Tonight's show could not be loaded"))
    }
  }, [])
  const loadGroups = useCallback(() => tonightApi.groups().then(setGroups).catch(() => undefined), [])
  const loadPlaylists = useCallback(() => tonightApi.playlists().then(setPlaylists).catch(() => undefined), [])
  const loadScenes = useCallback(() => mappingApi.listScenes().then(setScenes).catch(() => undefined), [])
  const loadShow = useCallback(
    (id: number) =>
      mappingApi
        .getShow(id)
        .then((show) => setShows((current) => ({ ...current, [id]: show })))
        .catch(() => undefined),
    [],
  )

  useEffect(() => {
    void loadTonight()
    void loadGroups()
    void loadPlaylists()
    void loadScenes()
  }, [loadTonight, loadGroups, loadPlaylists, loadScenes])

  // Every show a group belongs to, and tonight's, for projector names and cues.
  const showIds = useMemo(
    () => [...new Set([...groups.map((g) => g.show_id), ...(tonight?.show_id != null ? [tonight.show_id] : [])])],
    [groups, tonight?.show_id],
  )
  const showKey = showIds.join(',')
  useEffect(() => {
    for (const id of showIds) void loadShow(id)
  }, [showKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () =>
      subscribe((message) => {
        const showId = (message.payload as { show_id?: number }).show_id
        if (message.type === 'tonight') void loadTonight()
        else if (message.type === 'scene_groups') {
          void loadGroups()
          void loadPlaylists()
        } else if (message.type === 'playlists') void loadPlaylists()
        else if (message.type === 'mapping_scene') void loadScenes()
        else if (message.type === 'mapping_show' && showId != null) void loadShow(showId)
        else if (message.type === 'mapping_shows') {
          void loadTonight()
          void loadGroups()
          void loadPlaylists()
        }
      }),
    [subscribe, loadTonight, loadGroups, loadPlaylists, loadScenes, loadShow],
  )

  return { tonight, setTonight, groups, playlists, scenes, shows, error, setError, reload: loadTonight, loadGroups, loadPlaylists }
}

/* ------------------------------------------------------------------ */
/* Tonight's show card                                                 */
/* ------------------------------------------------------------------ */

/** Where in tonight's show time we are, in one plain line and a tone. */
export function timeLine(tonight: Tonight, now: Date): { chip: string; tone: Tone; line: string } {
  const when = tonight.next_starts_at ? whenText(tonight.next_starts_at, now) : null
  const next = when && tonight.next_title ? `${when} (${tonight.next_title})` : when
  const left = (iso: string | null) => (iso ? spanText(new Date(iso).getTime() - now.getTime()) : '')
  switch (tonight.state) {
    case 'running':
      return { chip: 'Show time now', tone: 'ok', line: `On until ${whenText(tonight.ends_at, now)} (${left(tonight.ends_at)} left)` }
    case 'later':
      return { chip: `Starts in ${left(tonight.starts_at)}`, tone: 'busy', line: `The show starts by itself at ${whenText(tonight.starts_at, now)}` }
    case 'done':
      return { chip: 'Finished for tonight', tone: 'idle', line: next ? `Next show ${next}` : 'No more shows on the calendar.' }
    case 'not_tonight': {
      const why = tonight.cancelled_by ? 'The calendar says no show tonight.' : 'Nothing is planned tonight.'
      return { chip: 'No show tonight', tone: 'idle', line: next ? `${why} Next show ${next}` : why }
    }
    default:
      return {
        chip: 'No show planned',
        tone: 'idle',
        line: 'Nothing is on the calendar. Add a show tonight, or press Start now.',
      }
  }
}

/** Whether tonight has a show of its own: on now, still to come, or over. */
export function showTonight(tonight: Tonight): boolean {
  return tonight.state === 'running' || tonight.state === 'later' || tonight.state === 'done'
}

/** What tonight's card calls the night: the show's look, or that there is none. */
export function tonightName(tonight: Tonight, groups: SceneGroup[]): string {
  if (!showTonight(tonight)) return tonight.state === 'off' ? 'No show planned' : 'No show tonight'
  return tonight.playlist_name ?? tonight.group_name ?? tonight.title ?? (groups.length ? 'Show' : 'No scene group yet')
}

/**
 * Tonight's show times in plain lines: "6:45 PM to 11:00 PM · projectors
 * turn on and off by themselves", and one line per show time with its name
 * when the night has several.
 */
export function plannedLines(tonight: Tonight): string[] {
  const slots = tonight.tonight_slots
  if (slots.length === 0) return []
  const power = (on: boolean) => (on ? ' · projectors turn on and off by themselves' : '')
  if (slots.length === 1) return [`${timeOf(slots[0].starts_at)} to ${timeOf(slots[0].ends_at)}${power(slots[0].power)}`]
  return slots.map((s) => `${timeOf(s.starts_at)} to ${timeOf(s.ends_at)} · ${s.title}`)
}

/** How far ahead the card lists the shows coming up. */
const AHEAD_DAYS = 14

/**
 * The calendar from today for two weeks: tonight's own entry (to change it),
 * the newest show (a new one starts from its times) and the nights coming up.
 * Reloads when tonight's plan changes, and every minute.
 */
export function useCalendarAhead(tonight: Tonight | null) {
  const [data, setData] = useState<CalendarData | null>(null)
  const load = useCallback(() => {
    calendarApi.get(isoDate(new Date()), AHEAD_DAYS + 1).then(setData).catch(() => undefined)
  }, [])
  useEffect(() => {
    load()
  }, [load, tonight])
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [load])
  const entry = tonight && showTonight(tonight) && tonight.state !== 'done' ? data?.entries.find((e) => e.id === tonight.entry_id) ?? null : null
  const ahead = (data?.days ?? []).filter((d) => d.date > (data?.today ?? '') && d.slots.length > 0)
  return { data, reload: load, entry, ahead, like: latestShow(data?.entries ?? []) }
}

/** The next nights with a show, one line each; nights not listed have none. */
export function ComingUp({ ahead, phone = false }: { ahead: CalendarData['days']; phone?: boolean }) {
  const shown = ahead.slice(0, phone ? 5 : 7)
  return (
    <div className={phone ? 'text-[15px]' : 'text-sm'}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Coming up</p>
      {shown.length === 0 ? (
        <p className="mt-1 text-slate-400">No shows on the calendar in the next two weeks.</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {shown.map((day) =>
            day.slots.map((slot) => (
              <li key={slot.key} className="tnum flex min-w-0 gap-2 text-slate-300">
                <span className={classNames('shrink-0 text-slate-400', phone ? 'w-24' : 'w-28')}>{dayText(day.date)}</span>
                <span className="w-16 shrink-0">{timeOf(slot.starts_at)}</span>
                <span className="min-w-0 truncate text-slate-200">{slot.title}</span>
              </li>
            )),
          )}
        </ul>
      )}
      {ahead.length > 0 && <p className="mt-1 text-2xs text-slate-500">Nights not listed have no show.</p>}
    </div>
  )
}

function Tile({
  label,
  value,
  sub,
  tone = 'idle',
  to,
  title,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: Tone
  to?: string
  title?: string
}) {
  const body = (
    <>
      <span className="eyebrow flex items-center gap-1.5">
        <StatusDot tone={tone} />
        {label}
      </span>
      <span className={classNames('tnum text-xl font-semibold leading-tight', tone === 'idle' || tone === 'ok' ? 'text-slate-100' : TONE_TEXT[tone])}>
        {value}
      </span>
      {sub && <span className="truncate text-2xs text-slate-500">{sub}</span>}
    </>
  )
  const className = 'flex min-w-0 flex-col items-start gap-0.5 px-4 py-3 text-left'
  return to ? (
    <Link to={to} title={title} className={classNames(className, 'transition-colors hover:bg-white/[0.03]')}>
      {body}
    </Link>
  ) : (
    <div title={title} className={className}>
      {body}
    </div>
  )
}

/** The hottest sensor any projector reports, and whether one says it is too hot. */
function hottest(projectors: Projector[]): { celsius: number; fahrenheit: number | null; name: string } | null {
  let best: { celsius: number; fahrenheit: number | null; name: string } | null = null
  for (const p of projectors) {
    const field = p.state.equipment?.temperature
    if (field?.availability !== 'available' || !field.value || typeof field.value !== 'object') continue
    for (const sensor of (field.value as TemperatureReading).sensors ?? []) {
      if (sensor.celsius != null && (!best || sensor.celsius > best.celsius)) {
        best = { celsius: sensor.celsius, fahrenheit: sensor.fahrenheit, name: p.name }
      }
    }
  }
  return best
}

function tooHot(projectors: Projector[]): boolean {
  return projectors.some((p) => {
    const value = p.state.equipment?.temperature?.value as TemperatureReading | null | undefined
    const condition = value?.condition
    return (condition && condition !== 'ok') || p.state.warnings.some((w) => /temp/i.test(w)) || p.state.errors.some((e) => /temp/i.test(e))
  })
}

function Metrics() {
  const { projectors } = useFleetContext()
  const status = useShowStatus()
  const enabled = projectors.filter((p) => p.enabled)
  const online = enabled.filter((p) => isLive(p)).length
  const powered = enabled.filter((p) => isLive(p) && p.state.power === 'on').length
  const faults = enabled.filter((p) => matchesFilter(p, 'faults')).length
  const warnings = enabled.filter((p) => matchesFilter(p, 'warnings')).length
  const heat = hottest(enabled)
  const hot = tooHot(enabled)
  const lamp = enabled
    .map((p) => ({ p, hours: peakLampHours(p) }))
    .filter((x): x is { p: Projector; hours: number } => x.hours != null)
    .sort((a, b) => b.hours - a.hours)[0]
  const { paired, online: minisOnline, waiting } = status.players
  const transport = status.transport
  const emergency = !!transport?.emergency
  const cue = transport?.current
  const playing = transport?.status === 'playing' || transport?.status === 'paused'
  const walk = useWalkInfo()
  const walked = walk?.last ?? null
  const verdict = walkVerdict(walked)

  return (
    <div className="grid grid-cols-2 divide-white/[0.06] border-t border-white/[0.06] sm:grid-cols-4 xl:grid-cols-8 xl:divide-x [&>*]:border-b [&>*]:border-white/[0.06] xl:[&>*]:border-b-0">
      <Tile
        label="Projectors"
        to="/projectors"
        value={
          <>
            {online}
            <span className="text-sm font-normal text-slate-500">/{enabled.length} online</span>
          </>
        }
        sub={enabled.length === 0 ? 'none added yet' : `${powered} on${online < enabled.length ? ` · ${enabled.length - online} not answering` : ''}`}
        tone={enabled.length === 0 ? 'idle' : online === enabled.length ? 'ok' : 'warn'}
      />
      <Tile
        label="Problems"
        to="/alerts"
        value={faults + warnings}
        sub={faults + warnings === 0 ? 'nothing wrong' : [faults && `${faults} fault${faults === 1 ? '' : 's'}`, warnings && `${warnings} warning${warnings === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
        tone={faults > 0 ? 'fault' : warnings > 0 ? 'warn' : 'ok'}
        title="Faults and warnings the projectors report (fan, temperature, lamp, filter, cover)"
      />
      <Tile
        label="Hottest"
        value={heat ? `${heat.fahrenheit != null ? Math.round(heat.fahrenheit) : Math.round(heat.celsius)}°${heat.fahrenheit != null ? 'F' : 'C'}` : '—'}
        sub={heat ? `${Math.round(heat.celsius)}°C · ${heat.name}` : hot ? 'a projector says it is too hot' : 'not reported yet'}
        tone={hot ? 'warn' : heat ? 'ok' : 'idle'}
        title="The highest temperature any projector's sensors report. Read every few minutes."
      />
      <Tile
        label="Lamp hours"
        value={lamp ? formatHours(lamp.hours) : '—'}
        sub={lamp ? `highest · ${lamp.p.name}` : 'not reported'}
        tone={lamp ? lampTone(lamp.hours, lamp.p.lamp_warn_hours, lamp.p.lamp_critical_hours) : 'idle'}
      />
      <Tile
        label="Mini PCs"
        to="/mapping/players"
        value={
          <>
            {minisOnline}
            <span className="text-sm font-normal text-slate-500">/{paired} connected</span>
          </>
        }
        sub={waiting > 0 ? `${waiting} waiting to be approved` : paired === 0 ? 'none paired yet' : minisOnline === paired ? 'all connected' : `${paired - minisOnline} not connected`}
        tone={waiting > 0 ? 'busy' : paired === 0 ? 'idle' : minisOnline === paired ? 'ok' : 'warn'}
      />
      <Tile
        label="Emergency stop"
        value={emergency ? 'ON' : 'Off'}
        sub={emergency ? 'clear it in the red bar' : 'ready if you need it'}
        tone={emergency ? 'fault' : 'ok'}
      />
      <Tile
        label="Last checked"
        value={walk?.active ? 'Walking' : walked ? walkDay(walked) : '—'}
        sub={walk?.active
          ? `projector ${walk.active.index + 1} of ${walk.active.stops.length} lit up`
          : walked
            ? `${walkTime(walked)} · ${verdict.text}`
            : 'Walk the yard on the phone'}
        tone={walk?.active ? 'busy' : verdict.tone}
        title={walked
          ? walked.stops.map((stop) => `${stopLabel(stop)}: ${stop.result === 'good' ? 'looked good' : stop.result === 'wrong' ? problemText(stop) : 'not checked'}`).join('\n')
          : 'Walk the yard from the phone remote (Tonight or Projectors tab): each projector lights up in turn and you tap how it looks.'}
      />
      <Tile
        label="Show now"
        to="/mapping/run"
        value={transport?.status === 'paused' ? 'Paused' : playing ? 'Playing' : emergency ? 'Stopped' : transport?.status === 'blackout' ? 'Blackout' : 'Stopped'}
        sub={playing && cue ? `${status.showName ?? 'show'} · cue ${cue.position + 1}` : 'nothing playing'}
        tone={transport?.status === 'playing' ? 'ok' : transport?.status === 'paused' ? 'warn' : 'idle'}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Scene groups                                                        */
/* ------------------------------------------------------------------ */

const SAME = 'same'
const NONE = 'none'

function GroupEditor({
  group,
  shows,
  showOptions,
  defaultShowId,
  scenes,
  onClose,
  onSaved,
}: {
  group: SceneGroup | null
  shows: Record<number, Show>
  showOptions: { id: number; name: string }[]
  defaultShowId: number | null
  scenes: MappingScene[]
  onClose: () => void
  onSaved: (group: SceneGroup, useNow: boolean) => Promise<void>
}) {
  const status = useShowStatus()
  const [showId, setShowId] = useState<number | null>(group?.show_id ?? defaultShowId ?? showOptions[0]?.id ?? null)
  const show = showId != null ? shows[showId] : undefined
  // A new group starts from what is set now: the cue playing, else the first.
  const startingCue = useMemo(() => {
    if (!show) return null
    const cues = [...show.cues].sort((a, b) => a.position - b.position)
    const live = status.transport?.show_id === show.id ? status.transport.current : null
    return cues.find((c) => c.id === live?.id) ?? cues[0] ?? null
  }, [show, status.transport])
  const [name, setName] = useState(group?.name ?? '')
  const [everywhere, setEverywhere] = useState<string>(
    group ? (group.scene_id == null ? NONE : String(group.scene_id)) : startingCue?.scene_id != null ? String(startingCue.scene_id) : NONE,
  )
  const [own, setOwn] = useState<Record<string, string>>(() => {
    const source = group?.output_scenes ?? startingCue?.output_scenes ?? {}
    return Object.fromEntries(Object.entries(source).map(([k, v]) => [k, v == null ? NONE : String(v)]))
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const outputs = show ? [...show.outputs].sort((a, b) => a.position - b.position) : []

  const save = async (useNow: boolean) => {
    if (showId == null) return
    const body = {
      name: name.trim(),
      scene_id: everywhere === NONE ? null : Number(everywhere),
      output_scenes: Object.fromEntries(
        Object.entries(own)
          .filter(([key, value]) => value !== SAME && outputs.some((o) => String(o.id) === key))
          .map(([key, value]) => [key, value === NONE ? null : Number(value)]),
      ),
    }
    setBusy(true)
    try {
      const saved = group ? await tonightApi.updateGroup(group.id, body) : await tonightApi.createGroup({ ...body, show_id: showId })
      await onSaved(saved, useNow)
    } catch (err) {
      setError(errorText(err, 'Saving the scene group failed'))
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!group) return
    setBusy(true)
    try {
      await tonightApi.deleteGroup(group.id)
      onClose()
    } catch (err) {
      setError(errorText(err, 'Deleting the scene group failed'))
      setBusy(false)
    }
  }

  const sceneOptions = scenes.map((s) => (
    <option key={s.id} value={s.id}>
      {s.name}
    </option>
  ))

  return (
    <Modal open label={group ? `Change ${group.name}` : 'New scene group'} onClose={onClose}>
      <div className="space-y-4 p-5">
        <div>
          <h3 className="text-base font-semibold text-slate-50">{group ? `Change “${group.name}”` : 'New scene group'}</h3>
          <p className="mt-1 text-sm text-slate-400">
            Pick a scene for every projector. Picking the group on the home page makes every projector play these, in every cue.
          </p>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-400">Name</span>
          <input
            className="input w-full"
            value={name}
            maxLength={128}
            placeholder="Halloween night"
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        {!group && showOptions.length > 1 && (
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-400">Show</span>
            <select
              className="input w-full"
              value={showId ?? ''}
              onChange={(e) => {
                setShowId(Number(e.target.value))
                setOwn({})
              }}
            >
              {showOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-400">Every projector plays</span>
          <select className="input w-full" value={everywhere} onChange={(e) => setEverywhere(e.target.value)}>
            <option value={NONE}>No scene</option>
            {sceneOptions}
          </select>
        </label>
        {outputs.length > 0 && (
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-400">Or a different scene on some projectors</span>
            {outputs.map((o, i) => (
              <label key={o.id} className="flex items-center gap-3 text-sm">
                <span className="flex w-32 shrink-0 items-center gap-1.5 truncate text-slate-300">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: outputColor(i) }} />
                  {o.name}
                </span>
                <select
                  className={classNames('input min-w-0 flex-1 py-1 text-sm', (own[String(o.id)] ?? SAME) !== SAME && 'ring-1 ring-sky-500/60')}
                  aria-label={`Scene on ${o.name}`}
                  value={own[String(o.id)] ?? SAME}
                  onChange={(e) => setOwn((current) => ({ ...current, [String(o.id)]: e.target.value }))}
                >
                  <option value={SAME}>Same as every projector</option>
                  <option value={NONE}>No scene</option>
                  {sceneOptions}
                </select>
              </label>
            ))}
          </div>
        )}
        {show && outputs.length === 0 && (
          <p className="text-xs text-slate-500">This show has no projectors yet. Add them in Mapping → Set up, then pick a scene for each here.</p>
        )}
        {scenes.length === 0 && (
          <p className="text-xs text-slate-500">
            There are no scenes yet. Make some on the <Link to="/mapping/scenes" className="text-sky-300 hover:underline">Scenes page</Link> first.
          </p>
        )}
        {error && <Banner tone="fault">{error}</Banner>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {group && (
            <button className="btn-danger-outline sm:mr-auto" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Delete group
            </button>
          )}
          <button className="btn-default sm:ml-auto" onClick={onClose}>
            Cancel
          </button>
          {!group && (
            <button className="btn-default" disabled={busy || !name.trim() || showId == null} onClick={() => void save(false)}>
              Save
            </button>
          )}
          <button className="btn-primary" disabled={busy || !name.trim() || showId == null} onClick={() => void save(!group)}>
            {group ? 'Save' : 'Save and play tonight'}
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete “${group?.name}”?`}
        body="The scenes themselves are kept, and so is what the projectors are playing now."
        confirmLabel="Delete group"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
      />
    </Modal>
  )
}

/** "House: Pumpkins · Garage: Ghosts", for a group's button. */
export function groupLines(group: SceneGroup, show: Show | undefined, scenes: MappingScene[]): string[] {
  const sceneName = (id: number | null) => (id == null ? 'No scene' : scenes.find((s) => s.id === id)?.name ?? 'Deleted scene')
  if (!show || show.outputs.length === 0) return [`Every projector: ${sceneName(group.scene_id)}`]
  return [...show.outputs]
    .sort((a, b) => a.position - b.position)
    .map((o) => {
      const own = group.output_scenes ?? {}
      const id = String(o.id) in own ? own[String(o.id)] : group.scene_id
      return `${o.name}: ${sceneName(id)}`
    })
}

/** What picking a group did, for the notice under the card. */
export function usedText(group: SceneGroup, tonight: Tonight, transport: { show_id: number | null; status: string } | null | undefined): { tone: Tone; text: string } {
  const live = transport?.show_id === group.show_id && transport?.status === 'playing'
  const now = live ? `Every projector is now playing ${group.name}.` : `${group.name} is set.`
  const planned = tonight.tonight_slots.find((s) => new Date(s.ends_at).getTime() > Date.now())
  const playlistNext = tonight.playlist_steps.find((s) => s.state === 'later')
  if (tonight.playlist_name && tonight.state === 'running' && playlistNext) {
    return { tone: 'warn', text: `${now} At ${timeOf(playlistNext.starts_at)} the playlist ${tonight.playlist_name} moves on to ${playlistNext.group_name ?? 'its next step'}.` }
  }
  if (planned && planned.group_id !== group.id) {
    return { tone: 'warn', text: `${now} Tonight’s ${planned.title} covers several nights and keeps its own look at ${timeOf(planned.starts_at)}. Change it on the Calendar.` }
  }
  if (!planned) {
    return { tone: live ? 'ok' : 'warn', text: `${now} No show is planned tonight, so it plays when you press Start now. Add a show tonight to have it start by itself.` }
  }
  return { tone: 'ok', text: live ? now : `${group.name} plays tonight at ${timeOf(planned.starts_at)}, on every projector.` }
}

/* ------------------------------------------------------------------ */
/* The two panels                                                      */
/* ------------------------------------------------------------------ */

export function TonightShow({ session }: { session: Session }) {
  const status = useShowStatus()
  const { tonight, setTonight, groups, playlists, scenes, shows, error, setError, reload, loadGroups, loadPlaylists } = useTonightData()
  const [planning, setPlanning] = useState(false)
  const [editor, setEditor] = useState<{ group: SceneGroup | null } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: Tone; text: string } | null>(null)
  const ahead = useCalendarAhead(tonight)
  useTicker(15_000)

  const canOperate = session.role !== 'viewer'
  const canEdit = session.role === 'admin'
  const now = new Date()

  if (!status.ready && !tonight) return null
  if (status.ready && status.shows.length === 0) {
    return (
      <div className="panel">
        <EmptyState icon={RunShowIcon} title="Tonight's show" action={canEdit && <Link to="/mapping/setup" className="btn-primary">Set up the show</Link>}>
          Set up a show first: add your projectors (Mapping → Set up) and a cue (Mapping → Cues). Then pick tonight's scenes here.
        </EmptyState>
      </div>
    )
  }

  const time = tonight ? timeLine(tonight, now) : null
  const transport = status.transport
  const playingTonight = !!tonight?.show_id && transport?.show_id === tonight.show_id && (transport.status === 'playing' || transport.status === 'paused')
  const showOptions = status.shows.map((s) => ({ id: s.id, name: s.name }))
  const multipleShows = showOptions.length > 1
  const visibleGroups = groups
  const planned = !!tonight && showTonight(tonight)

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

  return (
    <>
      <section className="panel overflow-hidden" aria-label="Tonight's show">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3 px-4 py-4">
          <div className="min-w-[min(18rem,100%)] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="eyebrow flex items-center gap-1.5">
                <BlackoutIcon size={13} aria-hidden /> Tonight's show
              </h2>
              {time && (
                <Chip tone={time.tone}>
                  <StatusDot tone={time.tone} pulse={time.tone === 'ok'} /> {time.chip}
                </Chip>
              )}
            </div>
            <p className={classNames('mt-1.5 truncate text-2xl font-semibold tracking-tight', planned ? 'text-slate-50' : 'text-slate-400')}>
              {tonight ? tonightName(tonight, groups) : ''}
            </p>
            {tonight && <PlaylistTimeline tonight={tonight} className="mt-1.5" />}
            {tonight && plannedLines(tonight).map((line) => (
              <p key={line} className="tnum mt-0.5 text-sm text-slate-200">
                {line}
              </p>
            ))}
            {multipleShows && planned && <p className="mt-0.5 text-sm text-slate-400">{tonight?.show_name}</p>}
            {time && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-300">
                <ClockIcon size={14} className="shrink-0 text-slate-500" aria-hidden />
                {time.line}
              </p>
            )}
            {tonight?.last_message && <p className="mt-1 text-xs text-slate-500">Last: {tonight.last_message}</p>}
            <HistoryLine />
            {ahead.data && (
              <div className="mt-3 border-t border-white/[0.06] pt-2.5">
                <ComingUp ahead={ahead.ahead} />
              </div>
            )}
          </div>
          {canOperate && (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {tonight && (
                <button className="btn-default" disabled={!ahead.data} onClick={() => setPlanning(true)}>
                  {ahead.entry ? <EditIcon size={15} aria-hidden /> : <AddIcon size={15} aria-hidden />}{' '}
                  {ahead.entry ? 'Change tonight’s show' : 'Add a show tonight'}
                </button>
              )}
              <Link to="/calendar" className="btn-default">
                <CalendarIcon size={15} aria-hidden /> Calendar
              </Link>
              {playingTonight ? (
                <button className="btn-default" disabled={busy != null} onClick={() => void stop()}>
                  <StopIcon size={15} aria-hidden /> Stop the show
                </button>
              ) : (
                <button className="btn-primary" disabled={busy != null || !tonight?.show_id || !!transport?.emergency} onClick={() => void start()}>
                  <RunShowIcon size={15} aria-hidden /> Start now
                </button>
              )}
            </div>
          )}
        </div>
        {(notice || error) && (
          <div className="px-4 pb-3">
            {error && <Banner tone="fault" onDismiss={() => setError(null)}>{error}</Banner>}
            {notice && (
              <Banner tone={notice.tone} onDismiss={() => setNotice(null)}>
                {notice.text}
              </Banner>
            )}
          </div>
        )}
        {planning && tonight && (
          <EntryEditor
            entry={ahead.entry}
            date={isoDate(now)}
            night={isoDate(now)}
            like={ahead.like}
            groupId={tonight.plan_group_id}
            playlistId={tonight.plan_playlist_id}
            groups={groups}
            playlists={playlists}
            shows={showOptions}
            defaultShowId={tonight.show_id}
            onClose={() => setPlanning(false)}
            onSaved={(message) => {
              setPlanning(false)
              setNotice({ tone: 'ok', text: message })
              void reload()
              ahead.reload()
            }}
          />
        )}
        <Metrics />
        <LiveView />
      </section>

      <section className="panel" aria-label="Tonight's scenes">
        <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-white/[0.06] px-4 py-2.5">
          <div className="flex min-w-0 items-start gap-2">
            <ScenesIcon size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-100">Pick tonight's scenes</h2>
              <p className="mt-0.5 text-xs text-slate-500">One click sets a scene on every projector now, and on tonight’s show.</p>
            </div>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Link className="btn-default btn-sm" to="/mapping/scenes"
                title="Make a new scene, pick the projector it goes on, and put it in tonight's show">
                <ScenesIcon size={14} aria-hidden /> Make a scene
              </Link>
              <button className="btn-default btn-sm" onClick={() => setEditor({ group: null })}>
                <AddIcon size={14} aria-hidden /> New scene group
              </button>
            </div>
          )}
        </header>
        {visibleGroups.length === 0 ? (
          <EmptyState
            icon={ScenesIcon}
            title="No scene groups yet"
            action={
              canEdit && (
                <button className="btn-primary" onClick={() => setEditor({ group: null })}>
                  <AddIcon size={15} aria-hidden /> Make your first scene group
                </button>
              )
            }
          >
            A scene group is a name, like “Halloween night”, with a scene for each projector. Make one for each look you want,
            then pick one here each evening.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {visibleGroups.map((group) => {
              // With a playlist on, its step playing now is marked instead.
              const active = !tonight?.playlist_id && tonight?.group_id === group.id
              const playlistNow = !!tonight?.playlist_id && tonight.state === 'running' && tonight.group_id === group.id
              const show = shows[group.show_id]
              return (
                <div
                  key={group.id}
                  className={classNames(
                    'group relative flex min-w-0 flex-col rounded-lg border transition-colors',
                    active ? 'border-sky-400/70 bg-sky-500/[0.09]' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20',
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-col items-start gap-1 px-4 py-3 text-left disabled:cursor-default"
                    disabled={!canOperate || busy != null}
                    aria-pressed={active}
                    onClick={() => void useGroup(group)}
                    title={canOperate ? (active ? 'Playing tonight. Click again to set it on every projector once more.' : 'Play this tonight, on every projector') : undefined}
                  >
                    <span className="flex w-full items-center gap-2 pr-7">
                      <span className="truncate text-base font-semibold text-slate-50">{group.name}</span>
                      {active && (
                        <Chip tone="ok" className="shrink-0">
                          <CheckIcon size={12} aria-hidden /> {planned ? 'Tonight' : 'Picked'}
                        </Chip>
                      )}
                      {playlistNow && (
                        <Chip tone="ok" className="shrink-0" title={`${tonight?.playlist_name} is playing this now`}>
                          Now
                        </Chip>
                      )}
                      {busy === `group-${group.id}` && <span className="text-xs text-slate-400">Setting…</span>}
                    </span>
                    {multipleShows && <span className="text-2xs text-slate-500">{show?.name ?? ''}</span>}
                    {groupLines(group, show, scenes).map((line) => (
                      <span key={line} className="block w-full truncate text-xs text-slate-400">
                        {line}
                      </span>
                    ))}
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn-ghost btn-icon absolute right-1.5 top-1.5"
                      aria-label={`Change ${group.name}`}
                      title="Change this group"
                      onClick={() => setEditor({ group })}
                    >
                      <EditIcon size={14} aria-hidden />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {groups.length > 0 && (
        <PlaylistsPanel
          tonight={tonight}
          groups={groups}
          playlists={playlists}
          showOptions={showOptions}
          canOperate={canOperate}
          canEdit={canEdit}
          onTonight={setTonight}
          onNotice={setNotice}
          onChanged={() => void loadPlaylists()}
        />
      )}

      {editor && (
        <GroupEditor
          group={editor.group}
          shows={shows}
          showOptions={showOptions}
          defaultShowId={tonight?.show_id ?? null}
          scenes={scenes}
          onClose={() => {
            setEditor(null)
            void loadGroups()
          }}
          onSaved={async (saved, useNow) => {
            setEditor(null)
            await loadGroups()
            if (useNow) await useGroup(saved)
            else setNotice({ tone: 'ok', text: `${saved.name} saved.` })
          }}
        />
      )}
    </>
  )
}
