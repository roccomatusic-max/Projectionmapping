import { useEffect, useState } from 'react'
import { classNames } from '@/lib/format'
import type { ServerClock } from '../live'
import type { Show, TransportAction, TransportState } from '../types'
import { formatDuration } from './controls'

const STATUS: Record<TransportState['status'], { label: string; tone: string }> = {
  playing: { label: 'Playing', tone: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' },
  paused: { label: 'Paused', tone: 'bg-amber-500/15 text-amber-300 ring-amber-500/30' },
  stopped: { label: 'Stopped', tone: 'bg-slate-500/15 text-slate-300 ring-slate-500/30' },
  blackout: { label: 'Blackout', tone: 'bg-red-500/15 text-red-300 ring-red-500/30' },
}

/**
 * GO, pause, stop, blackout. Big targets on Run the show: this is pressed
 * on a phone in the dark as often as at a desk. Elsewhere (Editor, Scenes,
 * Camera) it is one slim line, so the work area starts near the top.
 */
export function TransportBar({
  show,
  transport,
  clock,
  canRun,
  busy,
  large = false,
  onCommand,
}: {
  show: Show
  transport: TransportState | null
  clock: ServerClock
  canRun: boolean
  busy: boolean
  large?: boolean
  onCommand: (action: TransportAction, extra?: { cue?: number }) => void
}) {
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 250)
    return () => window.clearInterval(timer)
  }, [])

  const held = !!transport?.emergency
  // A scene an automation plays on its own is live on every show; GO then starts this one.
  const thisShow = transport?.show_id === show.id || (transport?.current?.position ?? 0) < 0
  const status = thisShow && transport ? transport.status : 'stopped'
  const current = thisShow ? transport?.current ?? null : null
  const nextIndex = current ? current.position + 1 : 0
  const next = show.cues[nextIndex]
  const elapsed =
    current && transport
      ? transport.status === 'paused'
        ? transport.paused_position ?? 0
        : Math.max(0, (clock.now() - current.started_at_ms) / 1000)
      : null
  const otherShowLive = transport && !thisShow && (transport.status === 'playing' || transport.status === 'paused')

  return (
    <div className={classNames('panel flex flex-wrap items-center', large ? 'gap-3 p-4' : 'gap-2 px-3 py-2')}>
      <button
        className={classNames('btn-primary min-w-[9rem] font-semibold', large ? 'w-full px-8 py-6 text-2xl sm:w-auto' : 'min-w-[6rem] px-5 py-1.5 text-base')}
        disabled={!canRun || busy || !next || held}
        onClick={() => onCommand('go')}
        title={held ? 'The emergency stop is on. Clear it in the red bar at the top first.'
          : next ? `Next: cue ${nextIndex + 1} ${next.name}` : 'No further cue'}
      >
        GO
      </button>
      <div className={classNames('flex', large ? 'gap-2' : 'gap-1.5')}>
        {status === 'paused' ? (
          <button className={classNames('btn-default', large ? 'btn-lg' : 'btn-sm')} disabled={!canRun || busy || held}
            onClick={() => onCommand('resume')}>
            Resume
          </button>
        ) : (
          <button className={classNames('btn-default', large ? 'btn-lg' : 'btn-sm')} disabled={!canRun || busy || status !== 'playing'}
            onClick={() => onCommand('pause')}>
            Pause
          </button>
        )}
        <button className={classNames('btn-default', large ? 'btn-lg' : 'btn-sm')} disabled={!canRun || busy || status === 'stopped'}
          onClick={() => onCommand('stop')}>
          Stop
        </button>
        <button className={classNames('btn-danger', large ? 'btn-lg' : 'btn-sm')} disabled={!canRun || busy}
          onClick={() => onCommand('blackout')} title="Black on every output at once">
          Blackout
        </button>
      </div>
      <div className={classNames('min-w-0 flex-1', large ? 'basis-full sm:basis-auto' : 'flex flex-wrap items-center gap-x-3')}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={classNames('chip ring-1', STATUS[status].tone)}>{STATUS[status].label}</span>
          {current && (
            <span className="truncate text-sm text-slate-100">
              {current.position < 0 ? `Scene · ${current.name}` : `Cue ${current.position + 1}${current.name ? ` · ${current.name}` : ''}`}
              <span className="ml-2 tnum text-slate-400">{formatDuration(elapsed)}</span>
            </span>
          )}
        </div>
        <p className={classNames('truncate text-xs text-slate-500', large && 'mt-0.5')}>
          {held
            ? 'GO is held by the emergency stop. Clear it in the red bar at the top first.'
            : otherShowLive
            ? 'Another show is live; GO here takes over all outputs.'
            : next
              ? `Next: cue ${nextIndex + 1}${next.name ? ` · ${next.name}` : ''}`
              : show.cues.length
                ? 'Last cue'
                : 'No cues yet'}
          {!canRun && ' · your role can watch but not run the show'}
        </p>
      </div>
    </div>
  )
}
