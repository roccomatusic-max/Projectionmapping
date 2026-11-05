import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { formatClock } from '@/lib/format'
import { phaseIsActive, useOps } from '@/live/LiveProvider'
import { useTicker } from '@/hooks/useLiveData'
import { PhaseBadge } from '../status'
import { EmptyState } from '../ui'
import { CloseIcon, HistoryIcon } from '../icons'

/**
 * Commands sent from this browser, newest first, each with where it stands
 * between the click and the projector's read-back. The full audit trail,
 * including other operators and automations, is on Monitoring → Log.
 */
export function ActivityPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { commands, clearCommands } = useOps()
  useTicker(open ? 2000 : 60000)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const finished = commands.some((c) => !phaseIsActive(c.phase))
  return (
    <div className="fixed inset-0 z-[55] bg-black/50 animate-fade-in" onClick={onClose}>
      <aside
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-white/10 bg-panel-900 shadow-overlay animate-slide-up"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Command activity"
      >
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-50">Command activity</h2>
            <p className="text-xs text-slate-500">Sent from this browser. Full history is in Logs.</p>
          </div>
          <div className="flex items-center gap-1">
            {finished && (
              <button className="btn-ghost btn-sm" onClick={clearCommands}>
                Clear finished
              </button>
            )}
            <button className="btn-ghost btn-icon" onClick={onClose} aria-label="Close">
              <CloseIcon size={17} />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {commands.length === 0 ? (
            <EmptyState title="No commands sent yet" icon={HistoryIcon}>
              Power, shutter, input and other commands appear here with their confirmation status.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-white/5">
              {commands.map((command) => (
                <li key={command.id} className="px-4 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-100">
                        <Link to={`/projectors/${command.projectorId}`} className="hover:text-sky-300" onClick={onClose}>
                          {command.projectorName}
                        </Link>
                        <span className="text-slate-500"> · </span>
                        {command.label}
                      </p>
                      <p className="tnum text-2xs text-slate-500">
                        {formatClock(new Date(command.startedAt).toISOString())}
                        {command.latencyMs != null && ` · ${command.latencyMs} ms`}
                        {command.bulk && ' · bulk'}
                      </p>
                    </div>
                    <PhaseBadge command={command} />
                  </div>
                  {command.detail && <p className="mt-1 break-words text-xs text-slate-400">{command.detail}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}
