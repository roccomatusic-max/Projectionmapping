/**
 * Per-projector results of the last bulk command, followed live through the
 * command tracker. A bulk command is never reported as one success: each
 * row shows that projector's own phase until its read-back confirms it.
 */

import { useCallback, useMemo, useState } from 'react'
import { useOps } from '@/live/LiveProvider'
import { PhaseBadge } from '../status'
import { CloseIcon } from '../icons'
import type { CommandRequest } from './useProjectorCommand'

export function useBulkResults() {
  const { commands } = useOps()
  const [last, setLast] = useState<{ label: string; before: Set<number>; at: number } | null>(null)

  /** Wraps a request so its rows show up here once it is dispatched. */
  const track = useCallback(
    (request: CommandRequest): CommandRequest => {
      const before = new Set(commands.map((c) => c.id))
      return {
        ...request,
        onDone: () => {
          request.onDone?.()
          setLast({ label: request.spec.label, before, at: Date.now() })
        },
      }
    },
    [commands],
  )

  const rows = useMemo(() => {
    if (!last) return []
    return commands.filter(
      (c) => c.bulk && !last.before.has(c.id) && c.label === last.label && c.startedAt >= last.at - 60_000,
    )
  }, [commands, last])

  const confirmed = rows.filter((r) => r.phase === 'confirmed').length
  const panel =
    rows.length > 0 && last ? (
      <div className="panel">
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-100">{last.label}: per-projector results</h2>
            <p className="text-xs text-slate-500">
              <span className="tnum">{confirmed} of {rows.length}</span> confirmed. Dispatched together; each
              projector acts at its own pace and is confirmed separately.
            </p>
          </div>
          <button className="btn-ghost btn-sm btn-icon" onClick={() => setLast(null)} aria-label="Hide results">
            <CloseIcon size={15} />
          </button>
        </header>
        <ul className="divide-y divide-white/5">
          {rows.map((row) => (
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
    ) : null

  return { track, panel }
}
