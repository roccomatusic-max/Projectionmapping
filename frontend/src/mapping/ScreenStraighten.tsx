import { useCallback, useEffect, useRef, useState } from 'react'
import { request } from '@/api/client'
import { classNames } from '@/lib/format'
import { CornerPicker } from './editor/CornerPicker'
import { applyHomography, invertHomography, sampleMesh, squareToQuad, warpPoint, withDefaults } from './geometry'
import { startingSquare } from './scene/flat'
import type { Output, Point, Show, Surface } from './types'

/**
 * Straightening a house part with the mouse on a mini PC's status screen:
 * the four corners of the part's checkerboard square are dragged on the
 * picture of what this projector puts out, while the square itself shows
 * on the house, until it looks square from the street (scene/flat.ts).
 *
 * The picture is in this output's own pixels; corners are kept in canvas
 * fractions, so they go through the output's slice and warp both ways.
 */

/** While a corner is dragged, the projector follows this often. */
const SEND_MS = 600

/** Canvas fractions → this output's picture (fractions). */
export function canvasToOutput(output: Output, [x, y]: Point): Point {
  const o = withDefaults(output)
  return warpPoint(o.warp, (x - o.source.x) / o.source.w, (y - o.source.y) / o.source.h)
}

/** This output's picture (fractions) → canvas fractions; the mesh is undone a few steps at a time. */
export function outputToCanvas(output: Output, p: Point): Point {
  const o = withDefaults(output)
  const [tu, tv] = applyHomography(invertHomography(squareToQuad(o.warp.corners)), p[0], p[1])
  let u = tu
  let v = tv
  if (o.warp.mesh) {
    for (let i = 0; i < 8; i++) {
      const [dx, dy] = sampleMesh(o.warp.mesh, u, v)
      u = tu - dx
      v = tv - dy
    }
  }
  return [o.source.x + u * o.source.w, o.source.y + v * o.source.h]
}

interface Said {
  ok: boolean
  message: string
}

export interface Straighten {
  /** The part being straightened, if any. */
  part: Surface | null
  corners: Point[] | null
  begin: (part: Surface) => void
  change: (corners: Point[]) => void
  save: (corners: Point[]) => void
  again: () => void
  done: () => void
  remove: () => void
  said: Said | null
}

/** Straightening state for the status screen; ``show`` is the mini PC's own show. */
export function useStraighten(show: Show | null): Straighten {
  const [partId, setPartId] = useState<string | null>(null)
  const [corners, setCorners] = useState<Point[] | null>(null)
  const [said, setSaid] = useState<Said | null>(null)
  // What this screen saved last, ahead of the show it polls now and then.
  const saved = useRef(new Map<string, Point[] | null>())
  const timer = useRef<number>()
  const sentAt = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const aspect = show ? show.canvas_width / show.canvas_height : 16 / 9
  const part = show?.surfaces.find((s) => s.id === partId) ?? null

  const send = useCallback(async (id: string, next: Point[] | null, test: boolean) => {
    saved.current.set(id, next)
    try {
      const result = await request<Said>('/mapping/players/me/flat', {
        method: 'POST',
        body: { surface_id: id, corners: next, test },
      })
      if (!result.ok || !test) setSaid(result)
    } catch (err) {
      setSaid({ ok: false, message: err instanceof Error ? err.message : 'No answer from the main server' })
    }
  }, [])

  // Keep the checkerboard on while the corners are still being looked at.
  const latest = useRef({ partId, corners })
  latest.current = { partId, corners }
  useEffect(() => {
    if (!partId) return
    const keep = window.setInterval(() => {
      const { partId: id, corners: now } = latest.current
      if (id && now) void send(id, now, true)
    }, 5 * 60 * 1000)
    return () => window.clearInterval(keep)
  }, [partId, send])

  const begin = (surface: Surface) => {
    const known = saved.current.has(surface.id) ? saved.current.get(surface.id) : surface.flat?.corners
    const start = known ?? startingSquare(surface, aspect)
    setPartId(surface.id)
    setCorners(start)
    setSaid(null)
    void send(surface.id, start, true)
  }

  const change = (next: Point[]) => {
    if (!partId) return
    setCorners(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      sentAt.current = Date.now()
      void send(partId, next, true)
    }, Math.max(0, sentAt.current + SEND_MS - Date.now()))
  }

  const save = (next: Point[]) => {
    if (!partId) return
    window.clearTimeout(timer.current)
    setCorners(next)
    void send(partId, next, true)
  }

  const again = () => {
    if (!part) return
    save(startingSquare(part, aspect))
  }

  const done = () => {
    if (partId && corners) void send(partId, corners, false)
    setPartId(null)
    setCorners(null)
  }

  const remove = () => {
    if (partId) void send(partId, null, false)
    setPartId(null)
    setCorners(null)
  }

  return { part, corners, begin, change, save, again, done, remove, said }
}

/** The corners over the picture of this projector's output. */
export function StraightenHandles({ straighten, output }: { straighten: Straighten; output: Output }) {
  if (!straighten.part || !straighten.corners) return null
  return (
    <CornerPicker
      corners={straighten.corners}
      toBox={(p) => canvasToOutput(output, p)}
      fromBox={(p) => outputToCanvas(output, p)}
      onChange={straighten.change}
      onDone={straighten.save}
      size="large"
    />
  )
}

/** The parts to pick from, or what to do while one is being straightened. */
export function StraightenBar({ straighten, show }: { straighten: Straighten; show: Show | null }) {
  const parts = [...(show?.surfaces ?? [])].sort((a, b) => Number(b.kind === 'roof') - Number(a.kind === 'roof'))
  const text = 'text-[length:calc(var(--u)*2.2)]'
  const button = 'rounded-lg px-[1vw] py-[calc(var(--u)*0.7)] font-semibold ring-1 ring-white/10'
  if (straighten.part) {
    return (
      <div className={classNames('mt-[calc(var(--u)*1)] space-y-[calc(var(--u)*0.8)] rounded-lg bg-yellow-400/10 px-[1vw] py-[calc(var(--u)*0.8)] text-yellow-100', text)}>
        <p>
          Straightening <b>{straighten.part.name}</b>: drag the four yellow corners (the filled one is top left) until
          the checkerboard on the house looks like true squares and the circle looks round from the street.
        </p>
        <div className="flex flex-wrap gap-[1vw]">
          <button className={classNames(button, 'bg-yellow-400 text-black')} onClick={straighten.done}>Done</button>
          <button className={classNames(button, 'bg-white/10 text-white')} onClick={straighten.again}>Start again</button>
          <button className={classNames(button, 'bg-white/10 text-red-200')} onClick={straighten.remove}>Don’t straighten</button>
        </div>
      </div>
    )
  }
  if (!parts.length) return null
  return (
    <div className={classNames('mt-[calc(var(--u)*1)] flex flex-wrap items-center gap-[1vw] text-slate-400', text)}>
      <span>Straighten:</span>
      {parts.map((s) => (
        <button key={s.id} className={classNames(button, 'bg-white/[0.06] text-slate-100')} onClick={() => straighten.begin(s)}
          title="Drag four corners so things on this part are not stretched">
          {s.name}{s.flat ? ' ✓' : ''}
        </button>
      ))}
      {straighten.said && (
        <span className={straighten.said.ok ? 'text-emerald-300' : 'text-amber-300'}>{straighten.said.message}</span>
      )}
    </div>
  )
}
