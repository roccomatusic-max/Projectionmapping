/**
 * The projector fleet as a searchable, sortable, filterable grid or list,
 * with multi-select and bulk commands. The dashboard and the Projectors
 * page both use it, so the two never disagree about what a projector looks
 * like or how a bulk command behaves.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Projector } from '@/api/types'
import { classNames, inputsFromCapabilities } from '@/lib/format'
import {
  compareProjectors,
  isLive,
  matchesFilter,
  matchesQuery,
  type FleetFilter,
  type SortKey,
} from '@/lib/status'
import { latestCommand, phaseIsActive, useOps } from '@/live/LiveProvider'
import { useDrivers, useGroups } from '@/live/useCatalog'
import { ProjectorCard, type QuickAction } from '../ProjectorCard'
import { PhaseBadge } from '../status'
import { EmptyState, SearchInput } from '../ui'
import {
  CloseIcon,
  GridViewIcon,
  ListViewIcon,
  PowerIcon,
  SelectIcon,
  ShutterIcon,
  SortIcon,
  HdmiIcon,
} from '../icons'
import { ProjectorTable } from './ProjectorTable'
import { inputRequest, powerRequest, shutterRequest, useProjectorCommand } from './useProjectorCommand'

type View = 'grid' | 'list'

const FILTERS: Array<{ id: FleetFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'attention', label: 'Attention' },
  { id: 'online', label: 'Online' },
  { id: 'offline', label: 'Offline' },
  { id: 'on', label: 'On' },
  { id: 'standby', label: 'Standby' },
  { id: 'warnings', label: 'Warnings' },
  { id: 'faults', label: 'Faults' },
]

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'status', label: 'Status' },
  { id: 'name', label: 'Name' },
  { id: 'model', label: 'Model' },
  { id: 'host', label: 'IP address' },
  { id: 'lamp', label: 'Lamp hours' },
]

/** Per-viewer conveniences only; the page works the same without them. */
function readPref<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const value = localStorage.getItem(key) as T | null
    return value && allowed.includes(value) ? value : fallback
  } catch {
    return fallback
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode or blocked storage: the preference just is not kept.
  }
}

export function FleetBrowser({
  projectors,
  canControl,
  storageKey,
  defaultView = 'grid',
  defaultSort = 'status',
  filter: controlledFilter,
  onFilterChange,
  rowActions,
  toolbarExtra,
}: {
  projectors: Projector[]
  canControl: boolean
  storageKey: string
  defaultView?: View
  defaultSort?: SortKey
  filter?: FleetFilter
  onFilterChange?: (filter: FleetFilter) => void
  rowActions?: (projector: Projector) => ReactNode
  toolbarExtra?: ReactNode
}) {
  const { commands } = useOps()
  const drivers = useDrivers()
  const { groups } = useGroups()
  const { ask, dialog } = useProjectorCommand()

  const [view, setViewState] = useState<View>(() => readPref(`${storageKey}.view`, defaultView, ['grid', 'list']))
  const [sort, setSortState] = useState<SortKey>(() =>
    readPref(`${storageKey}.sort`, defaultSort, ['status', 'name', 'model', 'host', 'lamp']),
  )
  const [descending, setDescending] = useState(false)
  const [localFilter, setLocalFilter] = useState<FleetFilter>('all')
  const [query, setQuery] = useState('')
  const [groupId, setGroupId] = useState<number | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [inputMenu, setInputMenu] = useState(false)
  const [lastBulk, setLastBulk] = useState<{ label: string; ids: number[]; at: number } | null>(null)

  const filter = controlledFilter ?? localFilter
  const setFilter = (next: FleetFilter) => (onFilterChange ? onFilterChange(next) : setLocalFilter(next))
  const setView = (next: View) => {
    setViewState(next)
    writePref(`${storageKey}.view`, next)
  }
  const setSort = (next: SortKey) => {
    if (next === sort) setDescending((d) => !d)
    else {
      setSortState(next)
      setDescending(false)
      writePref(`${storageKey}.sort`, next)
    }
  }

  const group = groups.find((g) => g.id === groupId) ?? null

  const counts = useMemo(() => {
    const result = {} as Record<FleetFilter, number>
    for (const f of FILTERS) result[f.id] = projectors.filter((p) => matchesFilter(p, f.id)).length
    return result
  }, [projectors])

  const shown = useMemo(() => {
    const members = group ? new Set(group.projector_ids) : null
    const list = projectors.filter(
      (p) => matchesFilter(p, filter) && matchesQuery(p, query) && (!members || members.has(p.id)),
    )
    list.sort((a, b) => compareProjectors(sort, a, b))
    if (descending) list.reverse()
    return list
  }, [projectors, filter, query, group, sort, descending])

  // Drop selections that no longer exist (a projector was removed).
  useEffect(() => {
    setSelected((current) => {
      const ids = new Set(projectors.map((p) => p.id))
      const next = new Set([...current].filter((id) => ids.has(id)))
      return next.size === current.size ? current : next
    })
  }, [projectors])

  const selectedList = useMemo(() => projectors.filter((p) => selected.has(p.id)), [projectors, selected])
  const shownAllSelected = shown.length > 0 && shown.every((p) => selected.has(p.id))

  const toggle = useCallback((projector: Projector) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(projector.id)) next.delete(projector.id)
      else next.add(projector.id)
      return next
    })
  }, [])
  const toggleAllShown = () =>
    setSelected((current) => {
      const next = new Set(current)
      if (shownAllSelected) shown.forEach((p) => next.delete(p.id))
      else shown.forEach((p) => next.add(p.id))
      return next
    })
  const endSelection = () => {
    setSelecting(false)
    setSelected(new Set())
    setInputMenu(false)
  }

  const onAction = useCallback(
    (projector: Projector, action: QuickAction) => {
      if (action === 'power-on') ask(powerRequest([projector], 'on'))
      else if (action === 'power-off') ask(powerRequest([projector], 'off'))
      else if (action === 'shutter-open') ask(shutterRequest([projector], 'open'))
      else ask(shutterRequest([projector], 'closed'))
    },
    [ask],
  )

  const commandFor = useCallback((id: number) => latestCommand(commands, id), [commands])

  // Inputs offered for a bulk switch: the union across the selected
  // projectors' drivers. One without that input reports it per device.
  const bulkInputs = useMemo(() => {
    const driverIds = new Set(selectedList.map((p) => p.driver))
    const merged = new Map<string, string>()
    for (const driver of drivers) {
      if (!driverIds.has(driver.driver_id)) continue
      for (const [code, label] of inputsFromCapabilities(driver.capabilities)) {
        if (!merged.has(code)) merged.set(code, label)
      }
    }
    return [...merged.entries()]
  }, [drivers, selectedList])

  const bulk = (request: ReturnType<typeof powerRequest>) => {
    setInputMenu(false)
    const before = new Set(commands.map((c) => c.id))
    ask({
      ...request,
      onDone: () => setLastBulk({ label: request.spec.label, ids: [...before].map(Number), at: Date.now() }),
    })
  }

  // The rows of the last bulk dispatch, followed live through the tracker.
  const bulkRows = useMemo(() => {
    if (!lastBulk) return []
    const before = new Set(lastBulk.ids)
    return commands.filter((c) => c.bulk && !before.has(c.id) && c.label === lastBulk.label && c.startedAt >= lastBulk.at - 60_000)
  }, [commands, lastBulk])

  const selectedOffline = selectedList.filter((p) => !isLive(p)).length
  const bulkBusy = selectedList.some((p) => {
    const c = latestCommand(commands, p.id)
    return c !== undefined && phaseIsActive(c.phase)
  })

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search name, model, IP, location"
          className="w-full sm:w-72"
        />
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          {groups.length > 0 && (
            <select
              className="input w-auto py-1 text-xs"
              value={groupId ?? ''}
              onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}
              aria-label="Show group"
            >
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.projector_ids.length})
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <SortIcon size={13} aria-hidden />
            <span className="sr-only">Sort by</span>
            <select
              className="input w-auto py-1 text-xs"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div className="seg" role="group" aria-label="View">
            <button
              className={classNames('seg-item px-2 py-1', view === 'grid' && 'seg-item-active')}
              onClick={() => setView('grid')}
              aria-pressed={view === 'grid'}
              title="Cards"
            >
              <GridViewIcon size={14} aria-hidden />
              <span className="sr-only">Cards</span>
            </button>
            <button
              className={classNames('seg-item px-2 py-1', view === 'list' && 'seg-item-active')}
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
              title="List"
            >
              <ListViewIcon size={14} aria-hidden />
              <span className="sr-only">List</span>
            </button>
          </div>
          {canControl && (
            <button
              className={classNames('btn-default btn-sm', selecting && 'border-sky-500/50 bg-sky-500/10')}
              onClick={() => (selecting ? endSelection() : setSelecting(true))}
              aria-pressed={selecting}
              title="Select several projectors to command together"
            >
              <SelectIcon size={14} aria-hidden /> {selecting ? 'Done' : 'Select'}
            </button>
          )}
          {toolbarExtra}
        </div>
      </div>
      <div
        className="-mx-3 flex gap-1 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
        role="group"
        aria-label="Filter projectors"
      >
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={classNames(
              'inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
              filter === f.id
                ? 'border-sky-500/50 bg-sky-500/10 text-slate-50'
                : 'border-white/[0.07] text-slate-400 hover:border-white/15 hover:text-slate-200',
              counts[f.id] === 0 && filter !== f.id && 'opacity-50',
            )}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            <span className="tnum text-slate-500">{counts[f.id]}</span>
          </button>
        ))}
        <span className="ml-auto hidden shrink-0 self-center text-xs text-slate-500 sm:inline">
          {shown.length === projectors.length ? `${shown.length} shown` : `${shown.length} of ${projectors.length} shown`}
        </span>
      </div>

      {selecting && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <button className="btn-ghost btn-sm" onClick={toggleAllShown}>
            {shownAllSelected ? 'Deselect shown' : `Select all shown (${shown.length})`}
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              className="btn-ghost btn-sm"
              onClick={() => setSelected(new Set(g.projector_ids))}
              title={g.description || undefined}
            >
              <span className="h-2 w-2 rounded-sm" style={{ background: g.color }} aria-hidden />
              {g.name}
            </button>
          ))}
          <span className="ml-auto">{selected.size} selected</span>
        </div>
      )}

      {/* Fleet */}
      {shown.length === 0 ? (
        <div className="panel">
          <EmptyState
            title={projectors.length === 0 ? 'No projectors registered yet' : 'No projector matches'}
            action={
              projectors.length > 0 && (
                <button
                  className="btn-default btn-sm"
                  onClick={() => {
                    setQuery('')
                    setGroupId(null)
                    setFilter('all')
                  }}
                >
                  Clear filters
                </button>
              )
            }
          />
        </div>
      ) : view === 'grid' ? (
        <div className="card-grid">
          {shown.map((projector) => (
            <ProjectorCard
              key={projector.id}
              projector={projector}
              command={commandFor(projector.id)}
              canControl={canControl}
              selectable={selecting}
              selected={selected.has(projector.id)}
              onToggleSelect={toggle}
              onAction={onAction}
            />
          ))}
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <ProjectorTable
            projectors={shown}
            commandFor={commandFor}
            sort={sort}
            descending={descending}
            onSort={setSort}
            allSelected={shownAllSelected}
            onToggleAll={toggleAllShown}
            canControl={canControl}
            selectable={selecting}
            isSelected={(id) => selected.has(id)}
            onToggleSelect={toggle}
            onAction={onAction}
            rowActions={rowActions}
          />
        </div>
      )}

      {/* Results of the last bulk command, per projector, live */}
      {bulkRows.length > 0 && lastBulk && (
        <div className="panel">
          <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">{lastBulk.label}: per-projector results</h2>
              <p className="text-xs text-slate-500">
                Dispatched together; each projector acts at its own pace and is confirmed separately.
              </p>
            </div>
            <button className="btn-ghost btn-sm btn-icon" onClick={() => setLastBulk(null)} aria-label="Hide results">
              <CloseIcon size={15} />
            </button>
          </header>
          <ul className="divide-y divide-white/5">
            {bulkRows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-slate-200">{row.projectorName}</p>
                  {row.detail && <p className="break-words text-xs text-slate-500">{row.detail}</p>}
                </div>
                <PhaseBadge command={row} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Bulk action bar */}
      {selecting && selected.size > 0 && (
        <div className="sticky bottom-20 z-30 lg:bottom-4">
          <div className="panel flex flex-col gap-2 border-sky-500/40 bg-panel-850 px-3 py-2.5 shadow-overlay sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-50">
                {selected.size} selected
                {selectedOffline > 0 && (
                  <span className="ml-2 text-xs font-normal text-yellow-300">{selectedOffline} not responding</span>
                )}
              </p>
              <p className="truncate text-xs text-slate-400">{selectedList.map((p) => p.name).join(', ')}</p>
            </div>
            <div className="relative flex flex-wrap gap-1.5">
              <button className="btn-primary btn-sm" disabled={bulkBusy} onClick={() => bulk(powerRequest(selectedList, 'on'))}>
                <PowerIcon size={13} aria-hidden /> On
              </button>
              <button className="btn-danger-outline btn-sm" disabled={bulkBusy} onClick={() => bulk(powerRequest(selectedList, 'off'))}>
                <PowerIcon size={13} aria-hidden /> Off
              </button>
              <button className="btn-default btn-sm" disabled={bulkBusy} onClick={() => bulk(shutterRequest(selectedList, 'open'))}>
                <ShutterIcon size={13} aria-hidden /> Open
              </button>
              <button className="btn-default btn-sm" disabled={bulkBusy} onClick={() => bulk(shutterRequest(selectedList, 'closed'))}>
                <ShutterIcon size={13} aria-hidden /> Close
              </button>
              <button
                className="btn-default btn-sm"
                disabled={bulkBusy || bulkInputs.length === 0}
                onClick={() => setInputMenu((open) => !open)}
                aria-expanded={inputMenu}
              >
                <HdmiIcon size={13} aria-hidden /> Input
              </button>
              <button className="btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
                Clear
              </button>
              {inputMenu && (
                <div className="absolute bottom-full right-0 z-40 mb-2 grid w-64 grid-cols-2 gap-1 rounded-lg border border-white/10 bg-panel-850 p-2 shadow-overlay">
                  {bulkInputs.map(([code, label]) => (
                    <button
                      key={code}
                      className="btn-ghost btn-sm justify-start"
                      onClick={() => bulk(inputRequest(selectedList, code, label))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {bulkBusy && (
            <p className="mt-1 text-right text-2xs text-slate-500">
              Waiting for the previous command to resolve before another can be sent.
            </p>
          )}
        </div>
      )}

      {dialog}
    </div>
  )
}
