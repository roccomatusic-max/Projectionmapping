import { memo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Projector } from '@/api/types'
import { classNames } from '@/lib/format'
import { attentionItems, attentionTone, deviceTone, peakLampHours, type SortKey } from '@/lib/status'
import type { TrackedCommand } from '@/live/LiveProvider'
import { LampMeter } from '../graphics'
import { ChevronDownIcon, ChevronIcon, ChevronUpIcon, PowerIcon, ShutterIcon } from '../icons'
import { CommandStrip, quickControls, type QuickAction } from '../ProjectorCard'
import { Freshness, InputLabel, LinkBadge, PowerBadge, ShutterBadge } from '../status'
import { StatusDot } from '../ui'
import { TONE_TEXT } from '../tone'

interface RowProps {
  projector: Projector
  command?: TrackedCommand
  canControl: boolean
  selectable: boolean
  selected: boolean
  onToggleSelect: (projector: Projector) => void
  onAction: (projector: Projector, action: QuickAction) => void
  rowActions?: (projector: Projector) => ReactNode
}

function Issues({ projector }: { projector: Projector }) {
  const issues = attentionItems(projector)
  if (issues.length === 0) return <span className="text-slate-600">—</span>
  const first = issues[0]
  const tone = attentionTone(first.severity)
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={issues.map((i) => i.text).join('\n')}>
      <StatusDot tone={tone} />
      <span className={classNames('truncate', TONE_TEXT[tone])}>{first.text}</span>
      {issues.length > 1 && <span className="shrink-0 text-slate-500">+{issues.length - 1}</span>}
    </span>
  )
}

const Row = memo(function Row({
  projector,
  command,
  canControl,
  selectable,
  selected,
  onToggleSelect,
  onAction,
  rowActions,
}: RowProps) {
  const tone = deviceTone(projector)
  const controls = quickControls(projector, command, canControl)
  return (
    <tr className={classNames(selected && 'bg-sky-500/[0.06]', !projector.enabled && 'opacity-60')}>
      <td className="w-0 pl-3 pr-2">
        <span className="flex items-center gap-2.5">
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(projector)}
              aria-label={`Select ${projector.name}`}
            />
          )}
          <StatusDot tone={tone} />
        </span>
      </td>
      <td className="max-w-[16rem]">
        <Link to={`/projectors/${projector.id}`} className="group block min-w-0">
          <span className="block truncate font-medium text-slate-100 group-hover:text-sky-300">{projector.name}</span>
          <span className="block truncate text-xs text-slate-500">
            {projector.model || projector.manufacturer}
            {projector.location && ` · ${projector.location}`}
          </span>
        </Link>
        <CommandStrip command={command} className="mt-1" />
      </td>
      <td className="tnum whitespace-nowrap text-xs text-slate-400">
        {projector.host}
        <span className="text-slate-600">:{projector.port}</span>
      </td>
      <td><LinkBadge projector={projector} /></td>
      <td><PowerBadge projector={projector} /></td>
      <td><ShutterBadge projector={projector} /></td>
      <td className="max-w-[9rem] text-sm"><InputLabel projector={projector} /></td>
      <td className="min-w-[8.5rem]">
        <LampMeter
          label=""
          hours={peakLampHours(projector)}
          warn={projector.lamp_warn_hours}
          critical={projector.lamp_critical_hours}
          compact
        />
      </td>
      <td className="max-w-[14rem] text-xs"><Issues projector={projector} /></td>
      <td className="text-xs"><Freshness projector={projector} /></td>
      <td className="pr-3">
        <span className="flex items-center justify-end gap-1">
          <button
            className="btn-ghost btn-sm btn-icon"
            disabled={controls.power.disabled}
            title={controls.power.reason ?? controls.power.label}
            aria-label={`${controls.power.label}: ${projector.name}`}
            onClick={() => onAction(projector, controls.power.next === 'on' ? 'power-on' : 'power-off')}
          >
            <PowerIcon size={15} />
          </button>
          <button
            className="btn-ghost btn-sm btn-icon"
            disabled={controls.shutter.disabled}
            title={controls.shutter.reason ?? `${controls.shutter.label} shutter`}
            aria-label={`${controls.shutter.label} shutter: ${projector.name}`}
            onClick={() => onAction(projector, controls.shutter.next === 'open' ? 'shutter-open' : 'shutter-closed')}
          >
            <ShutterIcon size={15} />
          </button>
          {rowActions?.(projector)}
          <Link to={`/projectors/${projector.id}`} className="btn-ghost btn-sm btn-icon" aria-label={`Open ${projector.name}`}>
            <ChevronIcon size={16} />
          </Link>
        </span>
      </td>
    </tr>
  )
})

/** Compact stacked rows for phones: name, state and the next action. */
const MobileRow = memo(function MobileRow({
  projector,
  command,
  selectable,
  selected,
  onToggleSelect,
}: RowProps) {
  const tone = deviceTone(projector)
  const issues = attentionItems(projector)
  return (
    <li className={classNames('flex items-start gap-3 px-3 py-2.5', selected && 'bg-sky-500/[0.06]')}>
      {selectable ? (
        <input
          type="checkbox"
          className="mt-1"
          checked={selected}
          onChange={() => onToggleSelect(projector)}
          aria-label={`Select ${projector.name}`}
        />
      ) : (
        <StatusDot tone={tone} className="mt-1.5" />
      )}
      <Link to={`/projectors/${projector.id}`} className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-slate-100">{projector.name}</span>
          <Freshness projector={projector} className="text-2xs" />
        </span>
        <span className="block truncate text-xs text-slate-500">
          {projector.model || projector.manufacturer} · <span className="tnum">{projector.host}</span>
        </span>
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          <LinkBadge projector={projector} />
          <PowerBadge projector={projector} />
          <ShutterBadge projector={projector} />
        </span>
        {issues[0] && (
          <span className={classNames('mt-1 block truncate text-xs', TONE_TEXT[attentionTone(issues[0].severity)])}>
            {issues[0].text}
            {issues.length > 1 && <span className="text-slate-500"> +{issues.length - 1}</span>}
          </span>
        )}
        <CommandStrip command={command} className="mt-1.5" />
      </Link>
      <ChevronIcon size={16} className="mt-1 shrink-0 text-slate-600" aria-hidden />
    </li>
  )
})

const COLUMNS: Array<{ label: string; sort?: SortKey; className?: string }> = [
  { label: '', className: 'pl-3' },
  { label: 'Projector', sort: 'name' },
  { label: 'Address', sort: 'host' },
  { label: 'Link', sort: 'status' },
  { label: 'Power' },
  { label: 'Shutter' },
  { label: 'Input' },
  { label: 'Lamp', sort: 'lamp' },
  { label: 'Attention' },
  { label: 'Last verified' },
  { label: '', className: 'pr-3' },
]

export function ProjectorTable({
  projectors,
  commandFor,
  sort,
  descending,
  onSort,
  allSelected,
  onToggleAll,
  ...rowProps
}: {
  projectors: Projector[]
  commandFor: (id: number) => TrackedCommand | undefined
  sort: SortKey
  descending: boolean
  onSort: (key: SortKey) => void
  allSelected: boolean
  onToggleAll: () => void
} & Omit<RowProps, 'projector' | 'command' | 'selected'> & { isSelected: (id: number) => boolean }) {
  const { isSelected, ...shared } = rowProps
  return (
    <>
      <ul className="divide-y divide-white/5 lg:hidden">
        {projectors.map((projector) => (
          <MobileRow
            key={projector.id}
            projector={projector}
            command={commandFor(projector.id)}
            selected={isSelected(projector.id)}
            {...shared}
          />
        ))}
      </ul>
      <div className="hidden overflow-x-auto lg:block">
        <table className="table">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {COLUMNS.map((column, index) => (
                <th key={index} className={classNames('pt-2.5', column.className)}>
                  {index === 0 && shared.selectable ? (
                    <input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="Select all shown" />
                  ) : column.sort ? (
                    <button
                      className={classNames(
                        'inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-300',
                        sort === column.sort && 'text-slate-300',
                      )}
                      onClick={() => onSort(column.sort!)}
                      aria-label={`Sort by ${column.label}`}
                    >
                      {column.label}
                      {sort === column.sort &&
                        (descending ? <ChevronDownIcon size={12} aria-hidden /> : <ChevronUpIcon size={12} aria-hidden />)}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projectors.map((projector) => (
              <Row
                key={projector.id}
                projector={projector}
                command={commandFor(projector.id)}
                selected={isSelected(projector.id)}
                {...shared}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
