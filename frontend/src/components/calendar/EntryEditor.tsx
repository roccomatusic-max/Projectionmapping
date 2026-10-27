/**
 * Add a show to the calendar: one night, or a run of nights with a last
 * night (every night, or the weekdays picked). Nothing repeats by itself,
 * so a night nobody added a show to has no show. Also changes a "no show"
 * night made earlier, and takes one night out of a run. Used by the
 * Calendar page, the Dashboard's Tonight's show card and the phone remote.
 */

import { useMemo, useState } from 'react'
import { Banner, ConfirmDialog, Modal } from '@/components/ui'
import { classNames } from '@/lib/format'
import { addDays, calendarApi, dayText, fromIso, isoDate, weekday, type CalendarEntry, type EntryBody } from '@/lib/calendar'
import { DAY_NAMES, describeDays, type Playlist, type SceneGroup } from '@/lib/tonight'

type Repeat = 'once' | 'range'
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

function repeatOf(entry: CalendarEntry | null): Repeat {
  return !entry || entry.end_date === entry.start_date ? 'once' : 'range'
}

/** Takes one night out of a run: trims an end, or puts a "no show" on a night in the middle. */
async function skipNight(entry: CalendarEntry, night: string): Promise<void> {
  const body = (changes: Partial<EntryBody>): EntryBody => ({
    kind: entry.kind,
    title: entry.title,
    show_id: entry.show_id,
    group_id: entry.group_id,
    playlist_id: entry.playlist_id,
    start_date: entry.start_date,
    end_date: entry.end_date,
    days: entry.days,
    start_at: entry.start_at,
    end_at: entry.end_at,
    power: entry.power,
    note: entry.note,
    ...changes,
  })
  // The nights the run still plays, without this one.
  const last = entry.end_date ?? entry.start_date
  const plays: string[] = []
  for (let d = fromIso(entry.start_date); isoDate(d) <= last; d = addDays(d, 1)) {
    if (entry.days.includes(weekday(d)) && isoDate(d) !== night) plays.push(isoDate(d))
  }
  if (plays.length === 0) return calendarApi.remove(entry.id)
  if (night < plays[0] || night > plays[plays.length - 1]) {
    await calendarApi.update(entry.id, body({ start_date: plays[0], end_date: plays[plays.length - 1] }))
    return
  }
  await calendarApi.create({ ...body({ start_date: night, end_date: night, days: ALL_DAYS }), kind: 'off', title: '', show_id: null, group_id: null, playlist_id: null, start_at: null, end_at: null, note: '' })
}

function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T
  options: { id: T; label: string }[]
  onChange: (id: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-lg bg-white/[0.04] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={classNames(
            'rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:text-sm',
            value === o.id ? 'bg-sky-500/20 text-sky-100 ring-1 ring-sky-500/50' : 'text-slate-400 hover:text-slate-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-2xs text-slate-500">{hint}</span>}
    </label>
  )
}

export function EntryEditor({
  entry,
  date,
  night,
  like,
  groupId: startGroupId,
  playlistId: startPlaylistId,
  groups,
  playlists = [],
  shows,
  defaultShowId,
  onClose,
  onSaved,
}: {
  /** The entry to change, or null for a new one. */
  entry: CalendarEntry | null
  /** The night a new entry starts on. */
  date?: string
  /** The night the entry was opened from: a run of nights can skip just that one. */
  night?: string
  /** A new show starts from this one's times and look (the newest on the calendar). */
  like?: CalendarEntry | null
  /** A new show's look, when one is picked already (tonight's scene group). */
  groupId?: number | null
  playlistId?: number | null
  groups: SceneGroup[]
  playlists?: Playlist[]
  shows: { id: number; name: string }[]
  defaultShowId: number | null
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const today = isoDate(new Date())
  const kind = entry?.kind ?? 'show'
  const [repeat, setRepeat] = useState<Repeat>(repeatOf(entry))
  const pickedPlaylist = startPlaylistId != null && playlists.some((p) => p.id === startPlaylistId) ? startPlaylistId : null
  const pickedGroup = startGroupId != null && groups.some((g) => g.id === startGroupId) ? startGroupId : null
  const [groupId, setGroupId] = useState<number | null>(() => {
    if (entry) return entry.group_id
    if (pickedPlaylist != null) return null
    if (pickedGroup != null) return pickedGroup
    if (like && like.playlist_id == null) return like.group_id
    return like?.playlist_id != null ? null : groups.find((g) => g.show_id === defaultShowId)?.id ?? groups[0]?.id ?? null
  })
  const [playlistId, setPlaylistId] = useState<number | null>(() => {
    if (entry) return entry.playlist_id
    if (pickedPlaylist != null) return pickedPlaylist
    return pickedGroup == null ? like?.playlist_id ?? null : null
  })
  const [showId, setShowId] = useState<number | null>(entry?.show_id ?? like?.show_id ?? defaultShowId ?? shows[0]?.id ?? null)
  const [title, setTitle] = useState(entry?.title ?? '')
  const [first, setFirst] = useState(entry?.start_date ?? date ?? today)
  const [last, setLast] = useState(entry?.end_date ?? entry?.start_date ?? date ?? today)
  const [days, setDays] = useState<number[]>(entry?.days ?? ALL_DAYS)
  const [start, setStart] = useState(entry?.start_at ?? like?.start_at ?? '18:00')
  const [end, setEnd] = useState(entry?.end_at ?? like?.end_at ?? '22:00')
  const [power, setPower] = useState(entry?.power ?? like?.power ?? true)
  const [note, setNote] = useState(entry?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const playlist = playlists.find((p) => p.id === playlistId) ?? null
  const group = playlist ? null : groups.find((g) => g.id === groupId) ?? null
  const multipleShows = shows.length > 1
  const showName = (id: number) => shows.find((s) => s.id === id)?.name ?? ''
  const placeholder = kind === 'off' ? 'No show' : playlist?.name ?? group?.name ?? 'Show'

  const body = useMemo((): EntryBody => {
    const endDate = repeat === 'once' ? first : last
    return {
      kind,
      title: title.trim(),
      show_id: kind === 'show' ? playlist?.show_id ?? group?.show_id ?? showId : null,
      group_id: kind === 'show' && !playlist ? groupId : null,
      playlist_id: kind === 'show' ? playlist?.id ?? null : null,
      start_date: first,
      end_date: endDate,
      days: repeat === 'once' ? ALL_DAYS : days,
      start_at: kind === 'show' ? start : null,
      end_at: kind === 'show' ? end : null,
      power,
      note: note.trim(),
    }
  }, [kind, title, group, playlist, showId, groupId, first, last, repeat, days, start, end, power, note])

  const problem =
    !first
      ? 'Pick a date.'
      : !body.end_date
        ? 'Pick the last night.'
        : body.end_date < first
        ? 'The last night is before the first night.'
        : repeat !== 'once' && days.length === 0
          ? 'Pick at least one night of the week.'
          : kind === 'show' && (!start || !end)
            ? 'Set a start and an end time.'
            : kind === 'show' && start === end
              ? 'The end time has to be different from the start time.'
              : kind === 'show' && body.show_id == null
                ? 'Pick a scene group.'
                : null

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const saved = entry ? await calendarApi.update(entry.id, body) : await calendarApi.create(body)
      const name = saved.title || placeholder
      const when = saved.end_date === saved.start_date ? dayText(saved.start_date) : `${dayText(saved.start_date)} to ${dayText(saved.end_date ?? saved.start_date)}`
      onSaved(entry ? `${name} changed.` : `${name} is on the calendar for ${when}.`)
    } catch (err) {
      setError(errorText(err, 'Saving did not work'))
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!entry) return
    setBusy(true)
    try {
      await calendarApi.remove(entry.id)
      onSaved(`${entry.title || placeholder} taken off the calendar.`)
    } catch (err) {
      setError(errorText(err, 'Deleting did not work'))
      setBusy(false)
    }
  }
  const skip = async () => {
    if (!entry || !night) return
    setBusy(true)
    try {
      await skipNight(entry, night)
      onSaved(`No show on ${dayText(night)}. ${entry.title || placeholder} still plays its other nights.`)
    } catch (err) {
      setError(errorText(err, 'That did not work'))
      setBusy(false)
    }
  }
  const multiNight = !!entry && entry.kind === 'show' && entry.end_date !== entry.start_date
  const toggleDay = (day: number) => setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()))
  const afterMidnight = start && end && end <= start

  return (
    <Modal open label={entry ? 'Change the plan' : 'Plan a show'} onClose={onClose}>
      <div className="space-y-4 p-5">
        <div>
          <h3 className="text-base font-semibold text-slate-50">
            {entry ? `Change “${entry.title || placeholder}”` : 'Add a show'}
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            {kind === 'off'
              ? 'No show on these nights, even where a longer run of shows covers them.'
              : 'The show starts and stops by itself on the nights you pick here, and only those. Nights without a show stay dark.'}
          </p>
        </div>

        {kind === 'show' && (
          <Field
            label={playlists.length ? 'Scene group or playlist' : 'Scene group'}
            hint={
              playlist
                ? 'The playlist’s scene groups take turns at their times, with a fade between them.'
                : group
                  ? undefined
                  : 'Without a group the projectors play what the cues already have.'
            }
          >
            <select
              className="input w-full"
              value={playlist ? `p${playlist.id}` : groupId != null ? `g${groupId}` : ''}
              onChange={(e) => {
                const value = e.target.value
                setPlaylistId(value.startsWith('p') ? Number(value.slice(1)) : null)
                setGroupId(value.startsWith('g') ? Number(value.slice(1)) : null)
              }}
            >
              <optgroup label="Scene groups">
                {groups.map((g) => (
                  <option key={g.id} value={`g${g.id}`}>
                    {g.name}
                    {multipleShows ? ` (${showName(g.show_id)})` : ''}
                  </option>
                ))}
              </optgroup>
              {playlists.length > 0 && (
                <optgroup label="Playlists (groups taking turns)">
                  {playlists.map((p) => (
                    <option key={p.id} value={`p${p.id}`}>
                      {p.name}
                      {multipleShows ? ` (${showName(p.show_id)})` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="">Keep the scenes the cues have</option>
            </select>
          </Field>
        )}
        {kind === 'show' && !group && !playlist && multipleShows && (
          <Field label="Show">
            <select className="input w-full" value={showId ?? ''} onChange={(e) => setShowId(Number(e.target.value))}>
              {shows.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Name (optional)">
          <input className="input w-full" value={title} maxLength={128} placeholder={placeholder} onChange={(e) => setTitle(e.target.value)} />
        </Field>

        <div className="space-y-3">
          <span className="block text-xs font-medium text-slate-400">When</span>
          <Segmented
            label="How often"
            value={repeat}
            onChange={(next) => {
              setRepeat(next)
              if (next === 'range' && last <= first) setLast(first)
            }}
            options={[
              { id: 'once', label: 'One night' },
              { id: 'range', label: 'Several nights' },
            ]}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={repeat === 'once' ? 'Date' : 'First night'}>
              <input type="date" className="input w-full" value={first} onChange={(e) => setFirst(e.target.value)} />
            </Field>
            {repeat === 'range' && (
              <Field label="Last night">
                <input type="date" className="input w-full" value={last} min={first} onChange={(e) => setLast(e.target.value)} />
              </Field>
            )}
          </div>
          {repeat !== 'once' && (
            <div>
              <span className="mb-1 block text-xs font-medium text-slate-400">On these nights · {describeDays(days)}</span>
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
          )}
        </div>

        {kind === 'show' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts at">
                <input type="time" className="input w-full" value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field label="Ends at" hint={afterMidnight ? 'That is after midnight, the next morning.' : undefined}>
                <input type="time" className="input w-full" value={end} onChange={(e) => setEnd(e.target.value)} />
              </Field>
            </div>
            <label className="flex items-start gap-2.5 text-sm text-slate-200">
              <input type="checkbox" className="mt-0.5" checked={power} onChange={(e) => setPower(e.target.checked)} />
              <span>
                Turn the projectors on at the start and off at the end
                <span className="block text-xs text-slate-500">The projectors this show uses. They take a minute or two to warm up.</span>
              </span>
            </label>
          </>
        )}

        <Field label="Note (optional)">
          <textarea className="input min-h-[3.5rem] w-full" value={note} maxLength={2000} placeholder="Trick-or-treat night, neighbours coming over…" onChange={(e) => setNote(e.target.value)} />
        </Field>

        {kind === 'show' && first <= today && body.end_date != null && body.end_date >= today && (
          <p className="text-xs text-slate-500">If tonight is one of these nights and the start time has passed, the show starts within a minute of saving.</p>
        )}
        {(error || problem) && <Banner tone={error ? 'fault' : 'warn'}>{error ?? problem}</Banner>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {entry && (
            <button className="btn-danger-outline sm:mr-auto" disabled={busy} onClick={() => setConfirmDelete(true)}>
              {multiNight ? 'Take off every night' : 'Take off the calendar'}
            </button>
          )}
          {multiNight && night && (
            <button className="btn-default" disabled={busy} onClick={() => void skip()}>
              No show on {dayText(night)} only
            </button>
          )}
          <button className="btn-default sm:ml-auto" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || problem != null} onClick={() => void save()}>
            {entry ? 'Save' : 'Add to the calendar'}
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={`Take “${entry?.title || placeholder}” off the calendar?`}
        body={multiNight ? 'None of its nights will have a show. Scene groups and scenes are kept.' : 'That night will have no show. Scene groups and scenes are kept.'}
        confirmLabel="Take it off"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
      />
    </Modal>
  )
}
