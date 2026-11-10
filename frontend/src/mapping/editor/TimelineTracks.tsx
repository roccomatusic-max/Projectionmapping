import { useRef } from 'react'
import { classNames } from '@/lib/format'
import type { MediaAsset, Timeline, TimelineClip } from '../types'

/** Height of one row, and of the time ruler, in pixels. */
const ROW = 44
const RULER = 26
/** Width of the row names at the left. */
const LABELS = 64
/** How close to a clip's end the pointer must be to stretch it rather than move it. */
const EDGE = 8
/** Clips snap to the playhead and to other clips' ends this close, in pixels. */
const SNAP_PX = 8

/** Seconds between ruler marks, so marks stay at least this many pixels apart. */
const STEPS = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]

/** "1:05.5" */
export function clockText(seconds: number, tenths = true): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const rest = s - m * 60
  return `${m}:${(tenths ? rest.toFixed(1) : Math.floor(rest).toString()).padStart(tenths ? 4 : 2, '0')}`
}

const KIND_STYLE: Record<TimelineClip['kind'], string> = {
  media: 'bg-sky-500/30 ring-sky-400/60 text-sky-50',
  element: 'bg-amber-500/25 ring-amber-400/60 text-amber-50',
  sound: 'bg-emerald-500/25 ring-emerald-400/60 text-emerald-50',
}

type Drag =
  | { kind: 'move'; id: string; x0: number; y0: number; start: number; track: number }
  | { kind: 'start'; id: string; x0: number; start: number; length: number }
  | { kind: 'end'; id: string; x0: number; length: number }
  | { kind: 'seek' }

/**
 * The timeline itself: a time ruler, rows of clips (the top row is drawn
 * on top of the others on the house) and the playhead. Drag a clip to move
 * it in time or to another row, drag its ends to make it start later or
 * end sooner, and click or drag on the ruler to move the playhead.
 */
export function TimelineTracks({
  timeline,
  media,
  selectedId,
  pps,
  canEdit,
  playheadRef,
  onSelect,
  onSeek,
  onChange,
  time,
}: {
  timeline: Timeline
  media: Map<number, MediaAsset>
  selectedId: string | null
  /** Pixels per second. */
  pps: number
  canEdit: boolean
  /** The playhead line, moved every frame by the designer without a re-render. */
  playheadRef: React.RefObject<HTMLDivElement>
  onSelect: (id: string | null) => void
  onSeek: (seconds: number) => void
  /** ``done`` is false while a drag is still going (draw it), true when it ends (save it). */
  onChange: (timeline: Timeline, done: boolean) => void
  /** The playhead's time, for snapping. */
  time: () => number
}) {
  const drag = useRef<Drag | null>(null)
  const moved = useRef(false)
  const areaRef = useRef<HTMLDivElement>(null)
  const latest = useRef(timeline)
  latest.current = timeline

  const width = Math.max(1, timeline.length * pps)
  const step = STEPS.find((s) => s * pps >= 64) ?? 600
  const marks: number[] = []
  for (let t = 0; t <= timeline.length + 1e-6; t += step) marks.push(Math.round(t * 1000) / 1000)

  /** Seconds at a pointer, from the left of the time area. */
  const secondsAt = (clientX: number) => {
    const rect = areaRef.current!.getBoundingClientRect()
    return Math.min(timeline.length, Math.max(0, (clientX - rect.left) / pps))
  }

  /** ``t`` moved onto the playhead or another clip's start or end when it is close. */
  const snap = (t: number, except: string) => {
    const near = SNAP_PX / pps
    const points = [0, timeline.length, time()]
    for (const c of timeline.clips) {
      if (c.id !== except) points.push(c.start, c.start + c.length)
    }
    let best = t
    let gap = near
    for (const p of points) {
      if (Math.abs(p - t) < gap) {
        gap = Math.abs(p - t)
        best = p
      }
    }
    return Math.round(best * 100) / 100
  }

  const change = (id: string, patch: Partial<TimelineClip>) => {
    const tl = latest.current
    onChange({ ...tl, clips: tl.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) }, false)
  }

  const onClipDown = (event: React.PointerEvent, clip: TimelineClip) => {
    event.stopPropagation()
    onSelect(clip.id)
    if (!canEdit) return
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const x = event.clientX - rect.left
    moved.current = false
    if (x < EDGE && rect.width > EDGE * 3) drag.current = { kind: 'start', id: clip.id, x0: event.clientX, start: clip.start, length: clip.length }
    else if (x > rect.width - EDGE && rect.width > EDGE * 3) drag.current = { kind: 'end', id: clip.id, x0: event.clientX, length: clip.length }
    else drag.current = { kind: 'move', id: clip.id, x0: event.clientX, y0: event.clientY, start: clip.start, track: clip.track }
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  }

  const onMove = (event: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    if (d.kind === 'seek') {
      onSeek(secondsAt(event.clientX))
      return
    }
    moved.current = true
    const clip = latest.current.clips.find((c) => c.id === d.id)
    if (!clip) return
    const dt = (event.clientX - d.x0) / pps
    const max = latest.current.length
    if (d.kind === 'move') {
      let start = Math.max(0, Math.min(max - 0.1, d.start + dt))
      // Either end may snap; the start wins when both are close.
      const snappedEnd = snap(start + clip.length, clip.id) - clip.length
      const snappedStart = snap(start, clip.id)
      start = snappedStart !== Math.round(start * 100) / 100 ? snappedStart : snappedEnd
      const rows = Math.round((d.y0 - event.clientY) / ROW)
      const track = Math.max(0, Math.min(latest.current.tracks - 1, d.track + rows))
      change(d.id, { start: Math.max(0, Math.round(start * 100) / 100), track })
    } else if (d.kind === 'start') {
      const end = d.start + d.length
      const start = Math.max(0, Math.min(end - 0.1, snap(d.start + dt, clip.id)))
      change(d.id, { start, length: Math.round((end - start) * 100) / 100 })
    } else {
      const end = Math.min(max, snap(clip.start + d.length + dt, clip.id))
      change(d.id, { length: Math.max(0.1, Math.round((end - clip.start) * 100) / 100) })
    }
  }

  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (d && d.kind !== 'seek' && moved.current) onChange(latest.current, true)
  }

  const rows = Array.from({ length: timeline.tracks }, (_, i) => timeline.tracks - 1 - i)

  return (
    <div className="overflow-x-auto rounded-md bg-panel-900 ring-1 ring-white/10">
      <div className="relative" style={{ width: width + LABELS + 16 }}>
        {/* The ruler: click or drag to move the playhead. */}
        <div className="flex" style={{ height: RULER }}>
          <div className="sticky left-0 z-20 shrink-0 bg-panel-900 text-[10px] uppercase tracking-wide text-slate-500"
            style={{ width: LABELS }}>
            <span className="block px-2 pt-1.5">Time</span>
          </div>
          <div
            ref={areaRef}
            className="relative cursor-ew-resize touch-none border-b border-white/10 bg-panel-850"
            style={{ width }}
            onPointerDown={(event) => {
              drag.current = { kind: 'seek' }
              ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
              onSeek(secondsAt(event.clientX))
            }}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            {marks.map((t) => (
              <span key={t} className="pointer-events-none absolute top-0 h-full border-l border-white/15 pl-1 text-[10px] text-slate-400"
                style={{ left: t * pps }}>
                {clockText(t, step < 1)}
              </span>
            ))}
          </div>
        </div>

        {rows.map((track) => (
          <div key={track} className="flex border-b border-white/[0.04]" style={{ height: ROW }}>
            <div className="sticky left-0 z-20 flex shrink-0 items-center bg-panel-900 px-2 text-[11px] text-slate-500"
              style={{ width: LABELS }}
              title={track === timeline.tracks - 1 ? 'The top row shows over the rows under it' : undefined}>
              Row {track + 1}
            </div>
            <div className="relative" style={{ width }} onPointerDown={() => onSelect(null)}>
              {marks.map((t) => (
                <span key={t} className="pointer-events-none absolute top-0 h-full border-l border-white/[0.04]" style={{ left: t * pps }} />
              ))}
              {timeline.clips.filter((c) => c.track === track).map((clip) => (
                <ClipBar key={clip.id} clip={clip} pps={pps} selected={clip.id === selectedId}
                  asset={clip.media_id != null ? media.get(clip.media_id) : undefined}
                  canEdit={canEdit}
                  onPointerDown={(event) => onClipDown(event, clip)}
                  onPointerMove={onMove}
                  onPointerUp={onUp} />
              ))}
            </div>
          </div>
        ))}

        {/* The playhead, across the ruler and every row. */}
        <div ref={playheadRef} className="pointer-events-none absolute top-0 z-10 h-full w-px bg-rose-400"
          style={{ left: LABELS }}>
          <span className="absolute -left-1.5 top-0 h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-rose-400" />
        </div>
      </div>
    </div>
  )
}

/** Where the playhead line goes for ``seconds``, in the tracks' own pixels. */
export function playheadLeft(seconds: number, pps: number): number {
  return LABELS + seconds * pps
}

function ClipBar({
  clip,
  asset,
  pps,
  selected,
  canEdit,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  clip: TimelineClip
  asset: MediaAsset | undefined
  pps: number
  selected: boolean
  canEdit: boolean
  onPointerDown: (event: React.PointerEvent) => void
  onPointerMove: (event: React.PointerEvent) => void
  onPointerUp: () => void
}) {
  const w = Math.max(6, clip.length * pps)
  const into = clip.enter === 'none' ? 0 : Math.min(clip.enter_seconds, clip.length / 2) * pps
  const out = clip.exit === 'none' ? 0 : Math.min(clip.exit_seconds, clip.length / 2) * pps
  const what = clip.kind === 'element' ? 'element' : clip.kind === 'sound' ? 'sound' : asset?.kind === 'video' ? 'video' : 'picture'
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${clip.name || what}, ${clockText(clip.start)} to ${clockText(clip.start + clip.length)}`}
      className={classNames(
        'absolute top-1 bottom-1 touch-none select-none overflow-hidden rounded ring-1',
        KIND_STYLE[clip.kind],
        selected && 'ring-2 ring-white',
        canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
      )}
      style={{ left: clip.start * pps, width: w }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {into > 0 && <span className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-black/50 to-transparent" style={{ width: into }} />}
      {out > 0 && <span className="pointer-events-none absolute inset-y-0 right-0 bg-gradient-to-l from-black/50 to-transparent" style={{ width: out }} />}
      <span className="pointer-events-none relative block truncate px-1.5 pt-0.5 text-[11px] font-medium leading-4">
        {clip.name || what}
      </span>
      <span className="pointer-events-none relative block truncate px-1.5 text-[10px] leading-3 opacity-70">
        {what}{clip.keys.length ? ` · ${clip.keys.length} moves` : ''}
      </span>
      {clip.keys.map((key, i) => (
        <span key={i} className="pointer-events-none absolute bottom-0.5 h-2 w-2 -translate-x-1 rotate-45 bg-white/90"
          style={{ left: key.t * pps }} />
      ))}
      {canEdit && selected && (
        <>
          <span className="pointer-events-none absolute inset-y-1 left-0.5 w-1 rounded bg-white/60" />
          <span className="pointer-events-none absolute inset-y-1 right-0.5 w-1 rounded bg-white/60" />
        </>
      )}
    </div>
  )
}
