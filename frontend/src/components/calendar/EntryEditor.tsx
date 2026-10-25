/**
 * Plan a show on the calendar, or a night with no show: one night, a run of
 * nights, or every week. Used by the Calendar page and the phone remote.
 */

import { useMemo, useState } from 'react'
import { Banner, ConfirmDialog, Modal } from '@/components/ui'
import { classNames } from '@/lib/format'
import { calendarApi, isoDate, type CalendarEntry, type EntryBody } from '@/lib/calendar'
import { DAY_NAMES, describeDays, type SceneGroup } from '@/lib/tonight'

type Repeat = 'once' | 'range' | 'weekly'
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

function repeatOf(entry: CalendarEntry | null): Repeat {
  if (!entry || entry.end_date === entry.start_date) return 'once'
  return entry.end_date ? 'range' : 'weekly'
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
  kind: startKind = 'show',
  groups,
  shows,
  defaultShowId,
  onClose,
  onSaved,
}: {
  /** The entry to change, or null for a new one. */
  entry: CalendarEntry | null
  /** The night a new entry starts on. */
  date?: string
  kind?: 'show' | 'off'
  groups: SceneGroup[]
  shows: { id: number; name: string }[]
  defaultShowId: number | null
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const today = isoDate(new Date())
  const [kind, setKind] = useState<'show' | 'off'>(entry?.kind ?? startKind)
  const [repeat, setRepeat] = useState<Repeat>(repeatOf(entry))
  const [groupId, setGroupId] = useState<number | null>(entry ? entry.group_id : groups.find((g) => g.show_id === defaultShowId)?.id ?? groups[0]?.id ?? null)
  const [showId, setShowId] = useState<number | null>(entry?.show_id ?? defaultShowId ?? shows[0]?.id ?? null)
  const [title, setTitle] = useState(entry?.title ?? '')
  const [first, setFirst] = useState(entry?.start_date ?? date ?? today)
  const [last, setLast] = useState(entry?.end_date ?? entry?.start_date ?? date ?? today)
  const [days, setDays] = useState<number[]>(entry?.days ?? ALL_DAYS)
  const [hasEnd, setHasEnd] = useState(entry ? entry.end_date != null : false)
  const [start, setStart] = useState(entry?.start_at ?? '18:00')
  const [end, setEnd] = useState(entry?.end_at ?? '22:00')
  const [power, setPower] = useState(entry?.power ?? true)
  const [note, setNote] = useState(entry?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const group = groups.find((g) => g.id === groupId) ?? null
  const multipleShows = shows.length > 1
  const showName = (id: number) => shows.find((s) => s.id === id)?.name ?? ''
  const placeholder = kind === 'off' ? 'No show' : group?.name ?? 'Show'

  const body = useMemo((): EntryBody => {
    const endDate = repeat === 'once' ? first : repeat === 'range' ? last : hasEnd ? last : null
    return {
      kind,
      title: title.trim(),
      show_id: kind === 'show' ? group?.show_id ?? showId : null,
      group_id: kind === 'show' ? groupId : null,
      start_date: first,
      end_date: endDate,
      days: repeat === 'once' ? ALL_DAYS : days,
      start_at: kind === 'show' ? start : null,
      end_at: kind === 'show' ? end : null,
      power,
      note: note.trim(),
    }
  }, [kind, title, group, showId, groupId, first, last, repeat, hasEnd, days, start, end, power, note])

  const problem =
    !first
      ? 'Pick a date.'
      : body.end_date && body.end_date < first
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
      onSaved(entry ? `${name} changed.` : `${name} is on the calendar.`)
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
  const toggleDay = (day: number) => setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()))
  const afterMidnight = start && end && end <= start

  return (
    <Modal open label={entry ? 'Change the plan' : 'Plan a show'} onClose={onClose}>
      <div className="space-y-4 p-5">
        <div>
          <h3 className="text-base font-semibold text-slate-50">
            {entry ? `Change “${entry.title || placeholder}”` : kind === 'off' ? 'A night with no show' : 'Plan a show'}
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            {kind === 'off'
              ? 'The show does not start by itself on these nights, even if the weekly show time says it should.'
              : 'On these nights this replaces the weekly show time. The show starts and stops by itself.'}
          </p>
        </div>

        <Segmented
          label="What happens"
          value={kind}
          onChange={setKind}
          options={[
            { id: 'show', label: 'Play a show' },
            { id: 'off', label: 'No show' },
          ]}
        />

        {kind === 'show' && (
          <Field label="Scene group" hint={group ? undefined : 'Without a group the projectors play what the cues already have.'}>
            <select className="input w-full" value={groupId ?? ''} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                  {multipleShows ? ` (${showName(g.show_id)})` : ''}
                </option>
              ))}
              <option value="">Keep the scenes the cues have</option>
            </select>
          </Field>
        )}
        {kind === 'show' && !group && multipleShows && (
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
              { id: 'weekly', label: 'Every week' },
            ]}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={repeat === 'once' ? 'Date' : repeat === 'range' ? 'First night' : 'Starting'}>
              <input type="date" className="input w-full" value={first} onChange={(e) => setFirst(e.target.value)} />
            </Field>
            {repeat === 'range' && (
              <Field label="Last night">
                <input type="date" className="input w-full" value={last} min={first} onChange={(e) => setLast(e.target.value)} />
              </Field>
            )}
            {repeat === 'weekly' && (
              <div className="text-sm">
                <label className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-400">
                  <input type="checkbox" checked={hasEnd} onChange={(e) => {
                    setHasEnd(e.target.checked)
                    if (e.target.checked && last <= first) setLast(first)
                  }} />
                  Stop repeating after
                </label>
                <input type="date" className="input w-full" value={hasEnd ? last : ''} min={first} disabled={!hasEnd} onChange={(e) => setLast(e.target.value)} />
              </div>
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

        {kind === 'show' && first <= today && (body.end_date == null || body.end_date >= today) && (
          <p className="text-xs text-slate-500">If tonight is one of these nights and the start time has passed, the show starts within a minute of saving.</p>
        )}
        {(error || problem) && <Banner tone={error ? 'fault' : 'warn'}>{error ?? problem}</Banner>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {entry && (
            <button className="btn-danger-outline sm:mr-auto" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Take off the calendar
            </button>
          )}
          <button className="btn-default sm:ml-auto" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || problem != null} onClick={() => void save()}>
            {entry ? 'Save' : kind === 'off' ? 'Save no-show nights' : 'Put on the calendar'}
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={`Take “${entry?.title || placeholder}” off the calendar?`}
        body="Those nights go back to the weekly show time. Scene groups and scenes are kept."
        confirmLabel="Take it off"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
      />
    </Modal>
  )
}
