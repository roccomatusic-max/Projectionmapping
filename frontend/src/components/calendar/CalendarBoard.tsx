/**
 * The show calendar: a month, a week or a list of what plays each night.
 *
 * Only the shows added here play; a night with none has no show, and
 * nothing fills nights in by itself. The server decides which show times
 * each night has (services/show_calendar.py); this only draws them and
 * opens the editor. Used by the Calendar page and the phone remote's
 * Calendar tab.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { BusMessage } from '@/api/types'
import { Banner, Chip, Spinner, StatusDot } from '@/components/ui'
import { AddIcon, BlackoutIcon, ChevronIcon, ChevronLeftIcon, EditIcon, PowerIcon } from '@/components/icons'
import { classNames } from '@/lib/format'
import {
  addDays,
  calendarApi,
  dayText,
  entryWhen,
  fromIso,
  isoDate,
  latestShow,
  startOfWeek,
  type CalendarData,
  type CalendarDay,
  type CalendarEntry,
  type CalendarSlot,
} from '@/lib/calendar'
import { DAY_NAMES, clockText, describeDays, timeOf, tonightApi, type Playlist, type SceneGroup, type Tonight } from '@/lib/tonight'
import { mappingApi } from '@/mapping/api'
import type { ShowSummary } from '@/mapping/types'
import { EntryEditor } from './EntryEditor'

type View = 'month' | 'week' | 'list'
const VIEW_KEY = 'calendar-view'
/** The list starts with two weeks and grows two at a time, up to what one read covers. */
const LIST_DAYS = 14
const LIST_MAX = 124

/** A colour for each scene group, so the same look reads the same all month. */
const SWATCHES = [
  { bar: 'bg-sky-400', pill: 'bg-sky-500/15 text-sky-100 ring-sky-500/30', dot: 'bg-sky-400' },
  { bar: 'bg-orange-400', pill: 'bg-orange-500/15 text-orange-100 ring-orange-500/30', dot: 'bg-orange-400' },
  { bar: 'bg-violet-400', pill: 'bg-violet-500/15 text-violet-100 ring-violet-500/30', dot: 'bg-violet-400' },
  { bar: 'bg-emerald-400', pill: 'bg-emerald-500/15 text-emerald-100 ring-emerald-500/30', dot: 'bg-emerald-400' },
  { bar: 'bg-rose-400', pill: 'bg-rose-500/15 text-rose-100 ring-rose-500/30', dot: 'bg-rose-400' },
  { bar: 'bg-amber-300', pill: 'bg-amber-400/15 text-amber-100 ring-amber-400/30', dot: 'bg-amber-300' },
  { bar: 'bg-teal-400', pill: 'bg-teal-500/15 text-teal-100 ring-teal-500/30', dot: 'bg-teal-400' },
]
const PLAIN = { bar: 'bg-slate-400', pill: 'bg-white/[0.06] text-slate-200 ring-white/10', dot: 'bg-slate-400' }

function swatch(groupId: number | null) {
  return groupId == null ? PLAIN : SWATCHES[groupId % SWATCHES.length]
}

/** Playlists take the colours from the other end, so they rarely match a group's. */
function playlistSwatch(playlistId: number) {
  return SWATCHES[SWATCHES.length - 1 - (playlistId % SWATCHES.length)]
}

/** Whether this device's clock reads the same as the show computer's zone. */
function sameClock(zone: string): boolean {
  try {
    const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: 'numeric', day: 'numeric' }
    return new Date().toLocaleString('en-US', { ...opts, timeZone: zone }) === new Date().toLocaleString('en-US', opts)
  } catch {
    return true
  }
}

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

function readView(): View | null {
  try {
    const saved = localStorage.getItem(VIEW_KEY)
    return saved === 'month' || saved === 'week' || saved === 'list' ? saved : null
  } catch {
    return null
  }
}

function saveView(view: View) {
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    // A private window: the view is simply not remembered.
  }
}

function rangeFor(view: View, anchor: Date, today: Date, listDays: number): { start: Date; days: number } {
  if (view === 'list') return { start: today, days: listDays }
  if (view === 'week') return { start: startOfWeek(anchor), days: 7 }
  return { start: startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1)), days: 42 }
}

type Editing = { entry: CalendarEntry | null; date?: string; night?: string }

export function CalendarBoard({
  canEdit,
  subscribe,
  phone = false,
}: {
  canEdit: boolean
  /** The live feed, when there is one; without it the board checks every 30 seconds. */
  subscribe?: (handler: (message: BusMessage) => void) => () => void
  /** Laid out for the phone remote. */
  phone?: boolean
}) {
  const today = useMemo(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }, [])
  const [view, setView] = useState<View>(() => readView() ?? (phone || window.innerWidth < 640 ? 'list' : 'month'))
  const [anchor, setAnchor] = useState<Date>(today)
  const [selected, setSelected] = useState<string>(isoDate(today))
  const [data, setData] = useState<CalendarData | null>(null)
  const [groups, setGroups] = useState<SceneGroup[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [shows, setShows] = useState<ShowSummary[]>([])
  const [tonight, setTonight] = useState<Tonight | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [showPast, setShowPast] = useState(false)
  const [listDays, setListDays] = useState(LIST_DAYS)

  const range = rangeFor(view, anchor, today, listDays)
  const startKey = isoDate(range.start)

  const load = useCallback(async () => {
    try {
      const [next, plan] = await Promise.all([calendarApi.get(startKey, range.days), tonightApi.get()])
      setData(next)
      setTonight(plan)
      setError(null)
    } catch (err) {
      setError(errorText(err, 'The calendar could not be loaded'))
    }
  }, [startKey, range.days])
  const loadGroups = useCallback(() => {
    tonightApi.groups().then(setGroups).catch(() => undefined)
    tonightApi.playlists().then(setPlaylists).catch(() => undefined)
  }, [])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    void loadGroups()
    mappingApi.listShows().then(setShows).catch(() => undefined)
  }, [loadGroups])

  useEffect(() => {
    if (subscribe) {
      return subscribe((message) => {
        if (message.type === 'calendar' || message.type === 'tonight') void load()
        else if (message.type === 'scene_groups' || message.type === 'playlists') {
          void loadGroups()
          void load()
        } else if (message.type === 'mapping_shows') mappingApi.listShows().then(setShows).catch(() => undefined)
      })
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [subscribe, load, loadGroups])

  const pickView = (next: View) => {
    setView(next)
    saveView(next)
    if (next !== 'list') setAnchor(fromIso(selected))
  }
  const step = (direction: 1 | -1) => {
    const next = view === 'week' ? addDays(anchor, 7 * direction) : new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1)
    setAnchor(next)
    if (view === 'week') setSelected(isoDate(startOfWeek(next)))
  }
  const goToday = () => {
    setAnchor(today)
    setSelected(isoDate(today))
  }

  const showOptions = shows.map((s) => ({ id: s.id, name: s.name }))
  const entries = data?.entries ?? []
  const entryById = (id: number | null) => entries.find((e) => e.id === id) ?? null
  const days = data?.days ?? []
  const day = days.find((d) => d.date === selected) ?? null
  const openEntry = (id: number | null, night?: string) => {
    const entry = entryById(id)
    if (entry && canEdit) setEditing({ entry, night })
  }
  const title =
    view === 'week'
      ? `${dayText(isoDate(range.start), { weekday: false })} – ${dayText(isoDate(addDays(range.start, 6)), { weekday: false })}`
      : view === 'month'
        ? anchor.toLocaleDateString([], { month: 'long', year: 'numeric' })
        : 'Coming up'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Calendar view" className="flex rounded-lg bg-white/[0.04] p-0.5">
          {(['month', 'week', 'list'] as View[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => pickView(v)}
              className={classNames('rounded-md px-3 py-1 text-xs font-medium', view === v ? 'bg-white/10 text-slate-50' : 'text-slate-400 hover:text-slate-200')}
            >
              {v === 'list' ? 'List' : v === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
        {view !== 'list' && (
          <div className="flex items-center gap-1">
            <button className="btn-ghost btn-icon" aria-label={view === 'week' ? 'Last week' : 'Last month'} onClick={() => step(-1)}>
              <ChevronLeftIcon size={16} />
            </button>
            <button className="btn-default btn-sm" onClick={goToday}>
              Today
            </button>
            <button className="btn-ghost btn-icon" aria-label={view === 'week' ? 'Next week' : 'Next month'} onClick={() => step(1)}>
              <ChevronIcon size={16} />
            </button>
          </div>
        )}
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        {canEdit && (
          <div className="ml-auto flex gap-2">
            <button className="btn-primary btn-sm" onClick={() => setEditing({ entry: null, date: selected })}>
              <AddIcon size={14} aria-hidden /> Add a show
            </button>
          </div>
        )}
      </div>

      {error && <Banner tone="fault" onDismiss={() => setError(null)}>{error}</Banner>}
      {notice && <Banner tone="ok" onDismiss={() => setNotice(null)}>{notice}</Banner>}
      {data && <p className="text-xs text-slate-500">Shows only play on the nights you add. Nights with nothing on them have no show.</p>}
      {groups.length === 0 && data && (
        <Banner tone="busy">
          Scene groups are the looks you plan on the calendar (“Halloween night”). Make them on the{' '}
          <Link to="/" className="text-sky-300 hover:underline">Dashboard</Link>, under Pick tonight’s scenes.
        </Banner>
      )}
      {!data && !error && <Spinner label="Loading the calendar…" />}

      {data && view === 'month' && (
        <MonthGrid days={days} anchor={anchor} today={data.today} selected={selected} onSelect={setSelected} phone={phone} />
      )}
      {data && view === 'week' && (
        <div className="grid gap-2 lg:grid-cols-7">
          {days.map((d) => (
            <div
              key={d.date}
              className={classNames('rounded-lg border p-2', d.date === data.today ? 'border-sky-500/50 bg-sky-500/[0.04]' : 'border-white/[0.06] bg-white/[0.02]')}
            >
              <DayHeading day={d} today={data.today} small />
              <DayBody day={d} entryById={entryById} onOpen={openEntry} canEdit={canEdit} small />
              {canEdit && (
                <button className="mt-1 text-2xs text-sky-300 hover:underline" onClick={() => setEditing({ entry: null, date: d.date })}>
                  + Add a show
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {data && view === 'list' && (
        <>
          <AgendaList days={days} today={data.today} entryById={entryById} onOpen={openEntry} canEdit={canEdit} />
          {listDays < LIST_MAX && (
            <button className="btn-default btn-sm w-full" onClick={() => setListDays((n) => Math.min(LIST_MAX, n + 14))}>
              Show two more weeks
            </button>
          )}
        </>
      )}

      {data && view === 'month' && day && (
        <section className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3" aria-label="The night picked">
          <div className="flex flex-wrap items-center gap-2">
            <DayHeading day={day} today={data.today} />
            {canEdit && (
              <div className="ml-auto flex gap-2">
                <button className="btn-default btn-sm" onClick={() => setEditing({ entry: null, date: day.date })}>
                  <AddIcon size={14} aria-hidden /> Add a show on {dayText(day.date)}
                </button>
              </div>
            )}
          </div>
          <div className="mt-2">
            <DayBody day={day} entryById={entryById} onOpen={openEntry} canEdit={canEdit} />
          </div>
        </section>
      )}

      {data && (
        <Plans
          entries={entries}
          today={data.today}
          groups={groups}
          playlists={playlists}
          showPast={showPast}
          onShowPast={setShowPast}
          onOpen={(entry) => canEdit && setEditing({ entry })}
          canEdit={canEdit}
        />
      )}
      {data && !sameClock(data.timezone) && (
        <p className="text-2xs text-slate-500">Times are the show computer’s clock ({data.timezone}).</p>
      )}

      {editing && (
        <EntryEditor
          entry={editing.entry}
          date={editing.date}
          night={editing.night}
          like={latestShow(entries)}
          groups={groups}
          playlists={playlists}
          shows={showOptions}
          defaultShowId={tonight?.show_id ?? null}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null)
            setNotice(message)
            void load()
          }}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function stateChip(slot: CalendarSlot): ReactNode {
  if (slot.state === 'running')
    return (
      <Chip tone="ok" className="shrink-0">
        <StatusDot tone="ok" pulse /> On now
      </Chip>
    )
  return null
}

function DayHeading({ day, today, small = false }: { day: CalendarDay; today: string; small?: boolean }) {
  const date = fromIso(day.date)
  const isToday = day.date === today
  return (
    <h3 className={classNames('flex items-center gap-2 font-semibold', small ? 'mb-1 text-xs text-slate-300' : 'text-sm text-slate-100')}>
      {date.toLocaleDateString([], small ? { weekday: 'short', day: 'numeric' } : { weekday: 'long', month: 'long', day: 'numeric' })}
      {isToday && <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-2xs font-medium text-sky-200">Tonight</span>}
    </h3>
  )
}

function DayBody({
  day,
  entryById,
  onOpen,
  canEdit,
  small = false,
}: {
  day: CalendarDay
  entryById: (id: number | null) => CalendarEntry | null
  onOpen: (id: number | null, night?: string) => void
  canEdit: boolean
  small?: boolean
}) {
  const nothing = day.slots.length === 0 && !day.cancelled_by
  return (
    <div className="space-y-1.5">
      {day.slots.map((slot) => (
        <SlotRow key={slot.key} slot={slot} entry={entryById(slot.entry_id)} onOpen={(id) => onOpen(id, day.date)} canEdit={canEdit} small={small} />
      ))}
      {day.cancelled_by && day.slots.length > 0 && !small && (
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => onOpen(day.cancelled_by?.entry_id ?? null)}
          className="block w-full text-left text-2xs text-slate-500 hover:text-slate-300 disabled:cursor-default"
        >
          {day.cancelled_by.title === 'No show' ? 'A no-show night' : `${day.cancelled_by.title} (no show)`} keeps every other show off this night.
        </button>
      )}
      {day.cancelled_by && day.slots.length === 0 && (
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => onOpen(day.cancelled_by?.entry_id ?? null)}
          className="flex w-full items-center gap-2 rounded-md bg-red-500/[0.08] px-2 py-1.5 text-left text-xs text-red-200 ring-1 ring-red-500/20 disabled:cursor-default"
        >
          <BlackoutIcon size={13} aria-hidden className="shrink-0" />
          <span className="truncate">No show{day.cancelled_by.title !== 'No show' && ` · ${day.cancelled_by.title}`}</span>
        </button>
      )}
      {nothing && <p className={classNames('text-slate-500', small ? 'text-2xs' : 'text-xs')}>{small ? 'No show' : 'No show. Nothing is added for this night.'}</p>}
      {!small &&
        day.skipped
          .filter((s) => s.entry_id != null)
          .map((s) => (
            <button
              key={`${s.entry_id}-${s.reason}`}
              type="button"
              disabled={!canEdit}
              onClick={() => onOpen(s.entry_id, day.date)}
              className="block w-full text-left text-2xs text-slate-500 hover:text-slate-300 disabled:cursor-default"
            >
              Not playing this night: {s.title} ({s.reason})
            </button>
          ))}
    </div>
  )
}

function SlotRow({
  slot,
  entry,
  onOpen,
  canEdit,
  small,
}: {
  slot: CalendarSlot
  entry: CalendarEntry | null
  onOpen: (id: number | null) => void
  canEdit: boolean
  small: boolean
}) {
  const color = slot.playlist_id != null ? playlistSwatch(slot.playlist_id) : swatch(slot.group_id)
  const body = (
    <>
      <span className={classNames('w-1 shrink-0 self-stretch rounded-full', color.bar)} />
      <span className="min-w-0 flex-1">
        <span className={classNames('flex items-center gap-2', small ? 'text-xs' : 'text-sm')}>
          <span className="truncate font-medium text-slate-50">{slot.title}</span>
          {stateChip(slot)}
        </span>
        <span className="tnum block text-2xs text-slate-400">
          {timeOf(slot.starts_at)} – {timeOf(slot.ends_at)}
          {slot.power && !small && <PowerIcon size={10} className="ml-1.5 inline text-slate-500" aria-label="projectors turn on and off" />}
        </span>
        {!small && (
          <span className="block truncate text-2xs text-slate-500">
            {entry ? entryWhen(entry, describeDays) : 'Calendar'}
            {slot.playlist_name
              ? slot.playlist_name !== slot.title && ` · ${slot.playlist_name}`
              : slot.group_name && slot.group_name !== slot.title && ` · ${slot.group_name}`}
            {slot.playlist_id != null && ' (playlist)'}
            {!slot.group_name && slot.playlist_id == null && ' · scenes the cues have'}
          </span>
        )}
        {!small && entry?.note && <span className="block truncate text-2xs italic text-slate-500">{entry.note}</span>}
      </span>
      {!small && canEdit && <EditIcon size={13} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />}
    </>
  )
  const className = classNames(
    'flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left',
    slot.state === 'done' && 'opacity-50',
    slot.state === 'running' && 'bg-emerald-500/[0.06] ring-1 ring-emerald-500/30',
  )
  return (
    <button type="button" className={classNames(className, canEdit && 'hover:bg-white/[0.03]')} disabled={!canEdit} onClick={() => onOpen(slot.entry_id)}>
      {body}
    </button>
  )
}

function MonthGrid({
  days,
  anchor,
  today,
  selected,
  onSelect,
  phone,
}: {
  days: CalendarDay[]
  anchor: Date
  today: string
  selected: string
  onSelect: (date: string) => void
  phone: boolean
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.08]">
      <div className="grid grid-cols-7 border-b border-white/[0.08] bg-white/[0.02]">
        {DAY_NAMES.map((name) => (
          <span key={name} className="py-1.5 text-center text-2xs font-semibold uppercase tracking-wide text-slate-500">
            {name}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const date = fromIso(d.date)
          const inMonth = date.getMonth() === anchor.getMonth()
          const isToday = d.date === today
          const isSelected = d.date === selected
          const past = d.date < today
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => onSelect(d.date)}
              aria-pressed={isSelected}
              aria-label={`${date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}: ${
                d.slots.length ? d.slots.map((s) => `${s.title} ${timeOf(s.starts_at)}`).join(', ') : d.cancelled_by ? 'no show' : 'nothing planned'
              }`}
              className={classNames(
                'flex min-w-0 flex-col items-stretch gap-0.5 border-white/[0.06] p-1 text-left transition-colors',
                phone ? 'h-14' : 'h-14 sm:h-24',
                i % 7 !== 6 && 'border-r',
                i < 35 && 'border-b',
                !inMonth && 'bg-black/20',
                isSelected ? 'bg-sky-500/[0.12] ring-1 ring-inset ring-sky-400/60' : 'hover:bg-white/[0.03]',
              )}
            >
              <span
                className={classNames(
                  'tnum flex h-5 w-5 items-center justify-center self-start rounded-full text-2xs font-semibold',
                  isToday ? 'bg-sky-500 text-white' : inMonth ? (past ? 'text-slate-500' : 'text-slate-200') : 'text-slate-600',
                )}
              >
                {date.getDate()}
              </span>
              {/* A phone gets dots; a wider screen the show names. */}
              <span className={classNames('flex flex-wrap gap-0.5', !phone && 'sm:hidden')}>
                {d.slots.map((s) => (
                  <span key={s.key} className={classNames('h-1.5 w-1.5 rounded-full', (s.playlist_id != null ? playlistSwatch(s.playlist_id) : swatch(s.group_id)).dot, s.state === 'done' && 'opacity-50')} />
                ))}
                {d.cancelled_by && d.slots.length === 0 && <span className="h-1.5 w-1.5 rounded-full border border-red-400" />}
              </span>
              {!phone && (
                <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                  {d.slots.slice(0, 2).map((s) => (
                    <span
                      key={s.key}
                      className={classNames('truncate rounded px-1 py-px text-2xs ring-1', (s.playlist_id != null ? playlistSwatch(s.playlist_id) : swatch(s.group_id)).pill, s.state === 'done' && 'opacity-50')}
                    >
                      <span className="tnum text-[10px] opacity-75">{timeOf(s.starts_at).replace(':00', '')}</span> {s.title}
                    </span>
                  ))}
                  {d.slots.length > 2 && <span className="text-[10px] text-slate-400">+{d.slots.length - 2} more</span>}
                  {d.cancelled_by && d.slots.length === 0 && <span className="truncate rounded bg-red-500/10 px-1 py-px text-2xs text-red-200 ring-1 ring-red-500/20">No show</span>}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AgendaList({
  days,
  today,
  entryById,
  onOpen,
  canEdit,
}: {
  days: CalendarDay[]
  today: string
  entryById: (id: number | null) => CalendarEntry | null
  onOpen: (id: number | null, night?: string) => void
  canEdit: boolean
}) {
  const planned = days.filter((d) => d.slots.length > 0 || d.cancelled_by)
  if (planned.length === 0) {
    return <p className="rounded-lg border border-white/[0.06] p-4 text-sm text-slate-400">No shows in these weeks. Press Add a show to put one on a night.</p>
  }
  return (
    <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-lg border border-white/[0.08]">
      {planned.map((d) => (
        <li key={d.date} className={classNames('flex gap-3 px-3 py-2.5', d.date === today && 'bg-sky-500/[0.04]')}>
          <div className="w-12 shrink-0 text-center">
            <span className="block text-2xs font-semibold uppercase text-slate-500">{fromIso(d.date).toLocaleDateString([], { weekday: 'short' })}</span>
            <span className={classNames('tnum block text-lg font-semibold leading-tight', d.date === today ? 'text-sky-300' : 'text-slate-100')}>{fromIso(d.date).getDate()}</span>
            <span className="block text-2xs text-slate-500">{fromIso(d.date).toLocaleDateString([], { month: 'short' })}</span>
          </div>
          <div className="min-w-0 flex-1">
            <DayBody day={d} entryById={entryById} onOpen={onOpen} canEdit={canEdit} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function Plans({
  entries,
  today,
  groups,
  playlists,
  showPast,
  onShowPast,
  onOpen,
  canEdit,
}: {
  entries: CalendarEntry[]
  today: string
  groups: SceneGroup[]
  playlists: Playlist[]
  showPast: boolean
  onShowPast: (show: boolean) => void
  onOpen: (entry: CalendarEntry) => void
  canEdit: boolean
}) {
  const groupName = (id: number | null) => groups.find((g) => g.id === id)?.name ?? null
  const playlistName = (id: number | null) => playlists.find((p) => p.id === id)?.name ?? null
  const looks = (entry: CalendarEntry) =>
    entry.playlist_id != null && playlistName(entry.playlist_id) ? `${playlistName(entry.playlist_id)} (playlist)` : groupName(entry.group_id)
  const sorted = [...entries].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id - b.id)
  const past = sorted.filter((e) => e.end_date != null && e.end_date < today)
  const current = sorted.filter((e) => !(e.end_date != null && e.end_date < today))
  const shown = showPast ? [...current, ...past] : current

  return (
    <section aria-label="Your shows" className="space-y-2 pt-2">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Your shows</h2>
      <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-lg border border-white/[0.08]">
        {shown.map((entry) => {
          const isPast = entry.end_date != null && entry.end_date < today
          const name = entry.title || (entry.kind === 'off' ? 'No show' : playlistName(entry.playlist_id) ?? groupName(entry.group_id) ?? 'Show')
          return (
            <li key={entry.id}>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => onOpen(entry)}
                className={classNames('flex w-full items-start gap-3 px-3 py-2.5 text-left disabled:cursor-default', canEdit && 'hover:bg-white/[0.03]', isPast && 'opacity-50')}
              >
                {entry.kind === 'off' ? (
                  <BlackoutIcon size={15} className="mt-0.5 shrink-0 text-red-300" aria-hidden />
                ) : (
                  <span className={classNames('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', (entry.playlist_id != null ? playlistSwatch(entry.playlist_id) : swatch(entry.group_id)).dot)} />
                )}
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block truncate font-medium text-slate-100">{name}</span>
                  <span className="block text-xs text-slate-400">
                    {entryWhen(entry, describeDays)}
                    {entry.kind === 'show' && ` · ${clockText(entry.start_at)} to ${clockText(entry.end_at)}`}
                  </span>
                  {entry.kind === 'show' && (entry.title || entry.playlist_id != null) && looks(entry) && (
                    <span className="block truncate text-2xs text-slate-500">{looks(entry)}</span>
                  )}
                </span>
                {canEdit && <EditIcon size={13} className="mt-1 shrink-0 text-slate-500" aria-hidden />}
              </button>
            </li>
          )
        })}
        {shown.length === 0 && <li className="px-3 py-2.5 text-xs text-slate-500">No shows added yet. Pick a night and press Add a show.</li>}
      </ul>
      {past.length > 0 && (
        <button className="text-xs text-slate-400 hover:text-slate-200" onClick={() => onShowPast(!showPast)}>
          {showPast ? 'Hide past plans' : `Show ${past.length} past plan${past.length === 1 ? '' : 's'}`}
        </button>
      )}
    </section>
  )
}
