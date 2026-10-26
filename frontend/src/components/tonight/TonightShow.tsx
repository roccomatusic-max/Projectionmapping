/**
 * The home page's evening view: what plays tonight, when, and whether
 * everything it needs is ready.
 *
 * Scene groups pick a scene for every projector at once ("Halloween
 * night"); one click on a group makes every projector follow it. Tonight's
 * show time starts and stops the show by itself (services/tonight.py on
 * the server).
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
import { isLive, lampTone, matchesFilter, peakLampHours } from '@/lib/status'
import { problemText, stopLabel, useWalkInfo, walkDay, walkTime, walkVerdict } from '@/lib/walkthrough'
import {
  DAY_NAMES,
  clockText,
  describeDays,
  spanText,
  timeOf,
  tonightApi,
  whenText,
  type SceneGroup,
  type Tonight,
} from '@/lib/tonight'

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

/** Everything the evening view reads, kept live from the feed. */
function useTonightData() {
  const { subscribe } = useFleetContext()
  const [tonight, setTonight] = useState<Tonight | null>(null)
  const [groups, setGroups] = useState<SceneGroup[]>([])
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
    void loadScenes()
  }, [loadTonight, loadGroups, loadScenes])

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
        else if (message.type === 'scene_groups') void loadGroups()
        else if (message.type === 'mapping_scene') void loadScenes()
        else if (message.type === 'mapping_show' && showId != null) void loadShow(showId)
        else if (message.type === 'mapping_shows') {
          void loadTonight()
          void loadGroups()
        }
      }),
    [subscribe, loadTonight, loadGroups, loadScenes, loadShow],
  )

  return { tonight, setTonight, groups, scenes, shows, error, setError, reload: loadTonight, loadGroups }
}

/* ------------------------------------------------------------------ */
/* Tonight's show card                                                 */
/* ------------------------------------------------------------------ */

/** Where in tonight's show time we are, in one plain line and a tone. */
export function timeLine(tonight: Tonight, now: Date): { chip: string; tone: Tone; line: string } {
  const when = tonight.next_starts_at ? whenText(tonight.next_starts_at, now) : null
  const next = when && tonight.next_title && tonight.next_title !== tonight.group_name ? `${when} (${tonight.next_title})` : when
  const left = (iso: string | null) => (iso ? spanText(new Date(iso).getTime() - now.getTime()) : '')
  switch (tonight.state) {
    case 'running':
      return { chip: 'Show time now', tone: 'ok', line: `On until ${whenText(tonight.ends_at, now)} (${left(tonight.ends_at)} left)` }
    case 'later':
      return { chip: `Starts in ${left(tonight.starts_at)}`, tone: 'busy', line: `The show starts by itself at ${whenText(tonight.starts_at, now)}` }
    case 'done':
      return { chip: 'Finished for tonight', tone: 'idle', line: next ? `Next show ${next}` : 'Finished for tonight' }
    case 'not_tonight': {
      const why = tonight.cancelled_by ? `The calendar says no show tonight (${tonight.cancelled_by}).` : 'Not on tonight.'
      return { chip: 'No show tonight', tone: 'idle', line: next ? `${why} Next show ${next}` : why }
    }
    default:
      return {
        chip: 'No show time set',
        tone: 'idle',
        line: 'The show does not start by itself. Set a time, or press Start now.',
      }
  }
}

/**
 * What the calendar plans tonight, in plain lines: "From the calendar:
 * Halloween, 5:00 PM to 11:30 PM", one line per show time when there are
 * several. Empty on a night the weekly show time plans.
 */
export function calendarLines(tonight: Tonight): string[] {
  const fromCalendar = tonight.tonight_slots.filter((s) => s.source === 'calendar')
  if (fromCalendar.length === 0) return []
  if (fromCalendar.length === 1) {
    const slot = fromCalendar[0]
    return [`From the calendar: ${slot.title}, ${timeOf(slot.starts_at)} to ${timeOf(slot.ends_at)}`]
  }
  return ['From the calendar tonight:', ...fromCalendar.map((s) => `${timeOf(s.starts_at)} to ${timeOf(s.ends_at)} · ${s.title}`)]
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

export function TimesEditor({
  tonight,
  shows,
  onCancel,
  onSaved,
}: {
  tonight: Tonight
  shows: { id: number; name: string }[]
  onCancel: () => void
  onSaved: (next: Tonight) => void
}) {
  const [enabled, setEnabled] = useState(tonight.enabled || !tonight.start_at)
  const [start, setStart] = useState(tonight.start_at ?? '18:00')
  const [end, setEnd] = useState(tonight.end_at ?? '23:00')
  const [days, setDays] = useState<number[]>(tonight.days.length ? tonight.days : [0, 1, 2, 3, 4, 5, 6])
  const [power, setPower] = useState(tonight.power)
  const [showId, setShowId] = useState<number | null>(tonight.show_id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleDay = (day: number) => setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day]))
  const save = async () => {
    setBusy(true)
    try {
      onSaved(await tonightApi.update({ enabled, start_at: start, end_at: end, days, power, show_id: showId }))
    } catch (err) {
      setError(errorText(err, 'Saving the show time failed'))
    } finally {
      setBusy(false)
    }
  }
  const afterMidnight = start && end && end <= start

  return (
    <div className="space-y-4 border-t border-white/[0.06] bg-panel-850/60 px-4 py-4">
      <label className="flex items-start gap-2.5 text-sm text-slate-200">
        <input type="checkbox" className="mt-0.5" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>
          Start and stop the show by itself
          <span className="block text-xs text-slate-500">Off means the show only plays when you press Start now or GO.</span>
        </span>
      </label>
      <div className={classNames('grid gap-4 sm:grid-cols-2 lg:grid-cols-4', !enabled && 'pointer-events-none opacity-50')}>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-400">Starts at</span>
          <input type="time" className="input w-full" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-400">Ends at</span>
          <input type="time" className="input w-full" value={end} onChange={(e) => setEnd(e.target.value)} />
          {afterMidnight && <span className="mt-1 block text-2xs text-slate-500">That is after midnight, the next morning.</span>}
        </label>
        <div className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-400">Nights</span>
          <div className="flex flex-wrap gap-1.5">
            {DAY_NAMES.map((name, day) => (
              <button
                key={name}
                type="button"
                aria-pressed={days.includes(day)}
                onClick={() => toggleDay(day)}
                className={classNames(
                  'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                  days.includes(day) ? 'border-sky-500/60 bg-sky-500/15 text-sky-200' : 'border-white/10 text-slate-400 hover:text-slate-200',
                )}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>
      <label className={classNames('flex items-start gap-2.5 text-sm text-slate-200', !enabled && 'opacity-50')}>
        <input type="checkbox" className="mt-0.5" checked={power} disabled={!enabled} onChange={(e) => setPower(e.target.checked)} />
        <span>
          Turn the projectors on at the start and off at the end
          <span className="block text-xs text-slate-500">The projectors this show uses. They take a minute or two to warm up.</span>
        </span>
      </label>
      {shows.length > 1 && (
        <label className="block max-w-xs text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-400">Show</span>
          <select className="input w-full" value={showId ?? ''} onChange={(e) => setShowId(e.target.value ? Number(e.target.value) : null)}>
            {shows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {enabled && (
        <p className="text-xs text-slate-500">
          If the start time has already passed tonight, the show starts as soon as you save. If the server restarts during show
          time (a power cut), the show starts again by itself.
        </p>
      )}
      {error && <Banner tone="fault">{error}</Banner>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button className="btn-default" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-primary" disabled={busy || (enabled && days.length === 0)} onClick={() => void save()}>
          Save show time
        </button>
      </div>
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
          <p className="text-xs text-slate-500">This show has no projectors yet. Add them in the Editor, then pick a scene for each here.</p>
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
  const fromCalendar = tonight.tonight_slots.find((s) => s.source === 'calendar' && new Date(s.starts_at).getTime() > Date.now())
  if (fromCalendar && fromCalendar.group_id !== group.id) {
    return { tone: 'warn', text: `${now} At ${timeOf(fromCalendar.starts_at)} the calendar’s ${fromCalendar.title} takes over. Change it on the Calendar page.` }
  }
  return { tone: 'ok', text: live ? now : `${group.name} is set for tonight. Every projector will play it when the show starts.` }
}

/* ------------------------------------------------------------------ */
/* The two panels                                                      */
/* ------------------------------------------------------------------ */

export function TonightShow({ session }: { session: Session }) {
  const status = useShowStatus()
  const { tonight, setTonight, groups, scenes, shows, error, setError, loadGroups } = useTonightData()
  const [editingTimes, setEditingTimes] = useState(false)
  const [editor, setEditor] = useState<{ group: SceneGroup | null } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: Tone; text: string } | null>(null)
  useTicker(15_000)

  const canOperate = session.role !== 'viewer'
  const canEdit = session.role === 'admin'
  const now = new Date()

  if (!status.ready && !tonight) return null
  if (status.ready && status.shows.length === 0) {
    return (
      <div className="panel">
        <EmptyState icon={RunShowIcon} title="Tonight's show" action={canEdit && <Link to="/mapping/editor" className="btn-primary">Open the Editor</Link>}>
          Make a show in the Editor first: add your projectors and a cue. Then pick tonight's scenes here.
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
  // Tonight is planned by the calendar (a show, or no show), not the weekly time.
  const onCalendar = !!tonight && (tonight.tonight_slots.some((s) => s.source === 'calendar') || !!tonight.cancelled_by)

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
            <p className="mt-1.5 truncate text-2xl font-semibold tracking-tight text-slate-50">
              {tonight?.group_name ?? (groups.length ? 'Pick tonight’s scenes below' : 'No scene group yet')}
            </p>
            {tonight && calendarLines(tonight).map((line, i) => (
              <p key={line} className={classNames('text-sm', i === 0 ? 'mt-0.5 font-medium text-sky-200' : 'tnum text-slate-200')}>
                {line}
              </p>
            ))}
            {(multipleShows || tonight?.enabled) && (
              <p className="mt-0.5 text-sm text-slate-400">
                {multipleShows && <span>{tonight?.show_name ?? 'No show picked yet'}</span>}
                {multipleShows && tonight?.enabled && <span> · </span>}
                {tonight?.enabled && tonight.start_at && (
                  <span className={onCalendar ? 'text-slate-400' : 'text-slate-200'}>
                    {onCalendar && 'Weekly show time: '}
                    {clockText(tonight.start_at)} to {clockText(tonight.end_at)}, {describeDays(tonight.days)}
                    {tonight.power && !onCalendar && <span className="text-slate-400"> · projectors turn on and off by themselves</span>}
                  </span>
                )}
              </p>
            )}
            {time && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-300">
                <ClockIcon size={14} className="shrink-0 text-slate-500" aria-hidden />
                {time.line}
              </p>
            )}
            {tonight?.last_message && <p className="mt-1 text-xs text-slate-500">Last: {tonight.last_message}</p>}
          </div>
          {canOperate && (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {tonight && !editingTimes && (
                <button className="btn-default" onClick={() => setEditingTimes(true)}>
                  <ClockIcon size={15} aria-hidden /> {tonight.enabled ? 'Change show time' : 'Set show time'}
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
        {editingTimes && tonight && (
          <TimesEditor
            tonight={tonight}
            shows={showOptions}
            onCancel={() => setEditingTimes(false)}
            onSaved={(next) => {
              setTonight(next)
              setEditingTimes(false)
              setNotice({ tone: 'ok', text: next.enabled ? `Show time saved: ${clockText(next.start_at)} to ${clockText(next.end_at)}, ${describeDays(next.days)}.` : 'The show will not start by itself.' })
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
              <p className="mt-0.5 text-xs text-slate-500">One click sets a scene on every projector at once.</p>
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
              const active = tonight?.group_id === group.id
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
                          <CheckIcon size={12} aria-hidden /> Tonight
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
