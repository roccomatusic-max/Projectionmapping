import { useCallback, useEffect, useRef, useState } from 'react'
import { request } from '@/api/client'
import { classNames } from '@/lib/format'
import { CornerPicker } from './editor/CornerPicker'
import { defaultWarp, type Turn, turnCorners } from './geometry'
import type { Output, Point } from './types'

/**
 * Fitting this mini PC's picture onto the ground with the mouse on its
 * status screen: for a projector on the roof pointing down at a driveway.
 * The four corners of the whole picture are dragged on the picture of what
 * this projector puts out, while the canvas grid shows on the driveway,
 * until its squares look square there. The turn buttons point the
 * picture's top at the house, so it reads the right way up from the street.
 *
 * Corners are the output's own corner pin (output fractions), the same as
 * the Editor's "Corner pin" handles.
 */

/** While a corner is dragged, the projector follows this often. */
const SEND_MS = 600
/** Left alone this long while fitting, the grid goes off by itself. */
const IDLE_MS = 10 * 60 * 1000

interface Said {
  ok: boolean
  message: string
}

export interface FitGround {
  corners: Point[] | null
  begin: () => void
  change: (corners: Point[]) => void
  save: (corners: Point[]) => void
  turn: (how: Turn) => void
  again: () => void
  done: () => void
  said: Said | null
}

/** Fitting state for the status screen; ``output`` is the mini PC's own output. */
export function useFitGround(output: Output | null): FitGround {
  const [corners, setCorners] = useState<Point[] | null>(null)
  const [said, setSaid] = useState<Said | null>(null)
  // What this screen saved last, ahead of the show it polls now and then.
  const saved = useRef<{ output: number; corners: Point[] } | null>(null)
  const timer = useRef<number>()
  const idle = useRef<number>()
  const sentAt = useRef(0)
  const latest = useRef(corners)
  latest.current = corners

  const send = useCallback(async (next: Point[] | null, grid: boolean): Promise<Said> => {
    if (output && next) saved.current = { output: output.id, corners: next }
    let result: Said
    try {
      result = await request<Said>('/mapping/players/me/warp', {
        method: 'POST',
        body: { corners: next, grid },
      })
    } catch (err) {
      result = { ok: false, message: err instanceof Error ? err.message : 'No answer from the main server' }
    }
    if (!result.ok || !grid) setSaid(result)
    return result
  }, [output])

  const finish = useCallback(() => {
    window.clearTimeout(timer.current)
    window.clearTimeout(idle.current)
    if (latest.current) void send(latest.current, false)
    setCorners(null)
  }, [send])

  // Never leave the grid on the driveway: off after a while untouched, and
  // when the screen goes away.
  const touched = useCallback(() => {
    window.clearTimeout(idle.current)
    idle.current = window.setTimeout(finish, IDLE_MS)
  }, [finish])
  const fitting = corners != null
  useEffect(() => {
    if (!fitting) return
    window.addEventListener('pagehide', finish)
    return () => window.removeEventListener('pagehide', finish)
  }, [fitting, finish])
  useEffect(() => () => {
    window.clearTimeout(timer.current)
    window.clearTimeout(idle.current)
  }, [])

  const begin = () => {
    if (!output) return
    const known = saved.current?.output === output.id ? saved.current.corners : null
    const start = known ?? output.warp?.corners ?? defaultWarp().corners
    setCorners(start)
    setSaid(null)
    touched()
    void send(start, true).then((result) => {
      // Refused (the show is playing): nothing to fit yet.
      if (!result.ok) {
        window.clearTimeout(idle.current)
        setCorners(null)
      }
    })
  }

  const change = (next: Point[]) => {
    if (!corners) return
    setCorners(next)
    touched()
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      sentAt.current = Date.now()
      void send(next, true)
    }, Math.max(0, sentAt.current + SEND_MS - Date.now()))
  }

  const save = (next: Point[]) => {
    if (!corners) return
    window.clearTimeout(timer.current)
    setCorners(next)
    touched()
    void send(next, true)
  }

  const turn = (how: Turn) => {
    if (corners) save(turnCorners(corners, how))
  }

  const again = () => save(defaultWarp().corners)

  return { corners, begin, change, save, turn, again, done: finish, said }
}

/** The corners over the picture of this projector's output. */
export function FitGroundHandles({ fit }: { fit: FitGround }) {
  if (!fit.corners) return null
  return <CornerPicker corners={fit.corners} onChange={fit.change} onDone={fit.save} size="large" />
}

const TURNS: Array<{ id: Turn; label: string }> = [
  { id: 'left', label: 'Turn left' },
  { id: 'right', label: 'Turn right' },
  { id: 'over', label: 'Upside down' },
  { id: 'mirror', label: 'Mirror' },
]

/** The button to start, or what to do while fitting. */
export function FitGroundBar({ fit, output, busy }: { fit: FitGround; output: Output | null; busy: boolean }) {
  const text = 'text-[length:calc(var(--u)*2.2)]'
  const button = 'rounded-lg px-[1vw] py-[calc(var(--u)*0.7)] font-semibold ring-1 ring-white/10'
  if (fit.corners) {
    return (
      <div className={classNames('mt-[calc(var(--u)*1)] space-y-[calc(var(--u)*0.8)] rounded-lg bg-yellow-400/10 px-[1vw] py-[calc(var(--u)*0.8)] text-yellow-100', text)}>
        <p>
          Fitting the picture to the ground: drag the four yellow corners (the filled one is top left) until the grid on
          the driveway shows true squares. Drag inside to move the whole picture. Turn it until its top faces the house,
          so it reads the right way up from the street.
        </p>
        <div className="flex flex-wrap gap-[1vw]">
          <button className={classNames(button, 'bg-yellow-400 text-black')} onClick={fit.done}>Done</button>
          {TURNS.map((t) => (
            <button key={t.id} className={classNames(button, 'bg-white/10 text-white')} onClick={() => fit.turn(t.id)}>
              {t.label}
            </button>
          ))}
          <button className={classNames(button, 'bg-white/10 text-white')} onClick={fit.again}>Start again</button>
        </div>
        {fit.said && !fit.said.ok && <p className="text-amber-300">{fit.said.message}</p>}
      </div>
    )
  }
  if (!output || busy) return null
  return (
    <div className={classNames('mt-[calc(var(--u)*1)] flex flex-wrap items-center gap-[1vw] text-slate-400', text)}>
      <button className={classNames(button, 'bg-white/[0.06] text-slate-100')} onClick={fit.begin}
        title="For a projector pointing down at a driveway or path: drag the picture's corners onto the ground">
        Fit the picture to the ground
      </button>
      {fit.said && <span className={fit.said.ok ? 'text-emerald-300' : 'text-amber-300'}>{fit.said.message}</span>}
    </div>
  )
}
