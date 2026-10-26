import type { ReactNode } from 'react'

/** One entry recharts hands a custom tooltip. */
interface TooltipEntry {
  dataKey?: string | number
  name?: string | number
  value?: number | string | null
  color?: string
  stroke?: string
  fill?: string
}

/**
 * The hover box for the Monitoring charts.
 *
 * Entries are listed hottest (highest) first, so the box reads in the same
 * order as the lines on screen, top to bottom, and each name has its line's
 * colour beside it. Recharts' own box lists them in the order the lines
 * were declared, which matched nothing on screen. Keys in ``last`` (a band
 * such as "heater on" that is not on the value scale) go at the bottom.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  title,
  format,
  last = [],
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: number | string
  title?: (label: number | string) => ReactNode
  format: (value: number, key: string) => [ReactNode, ReactNode]
  last?: string[]
}) {
  if (!active || !payload?.length) return null
  const rank = (entry: TooltipEntry) =>
    typeof entry.value === 'number' ? entry.value : Number.NEGATIVE_INFINITY
  const entries = payload
    .filter((entry) => entry.value != null)
    .map((entry, index) => ({ entry, index }))
    // Highest first; ties (and the pinned keys) keep their declared order.
    .sort((a, b) => {
      const ka = String(a.entry.dataKey)
      const kb = String(b.entry.dataKey)
      const la = last.indexOf(ka)
      const lb = last.indexOf(kb)
      // A pinned key sorts after every other one, pinned keys in ``last`` order.
      if (la !== -1 || lb !== -1) return la - lb || a.index - b.index
      return rank(b.entry) - rank(a.entry) || a.index - b.index
    })
    .map(({ entry }) => entry)
  if (entries.length === 0) return null
  return (
    <div className="rounded-md border border-white/[0.08] bg-[#141820] px-3 py-2 text-xs shadow-lg">
      {label != null && <p className="mb-1.5 font-medium text-slate-200">{title ? title(label) : label}</p>}
      <ul className="space-y-1">
        {entries.map((entry) => {
          const key = String(entry.dataKey)
          const [value, name] = format(Number(entry.value), key)
          const color = entry.stroke && entry.stroke !== 'none' ? entry.stroke : entry.color ?? entry.fill
          return (
            <li key={key} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
              <span className="text-slate-300">{name}</span>
              <span className="tnum ml-auto pl-4 font-medium text-slate-100">{value}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
