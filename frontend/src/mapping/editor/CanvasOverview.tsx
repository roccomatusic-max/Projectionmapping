import { useRef, useState } from 'react'
import { classNames } from '@/lib/format'
import { dragRect, type RectHandle } from '../geometry'
import type { ServerClock } from '../live'
import { OutputView } from '../OutputView'
import type { Playback } from '../playback'
import type { Output, Show, SourceRect, TransportState } from '../types'
import { useCanvasMap } from './canvasMap'
import { outputColor } from './panels'

const MAP_KEY = 'pm.canvasMap'

function mapWanted(): boolean {
  try {
    return localStorage.getItem(MAP_KEY) !== 'off'
  } catch {
    return true
  }
}

const HANDLES: { key: RectHandle; at: [number, number]; cursor: string }[] = [
  { key: 'nw', at: [0, 0], cursor: 'nwse-resize' },
  { key: 'n', at: [0.5, 0], cursor: 'ns-resize' },
  { key: 'ne', at: [1, 0], cursor: 'nesw-resize' },
  { key: 'e', at: [1, 0.5], cursor: 'ew-resize' },
  { key: 'se', at: [1, 1], cursor: 'nwse-resize' },
  { key: 's', at: [0.5, 1], cursor: 'ns-resize' },
  { key: 'sw', at: [0, 1], cursor: 'nesw-resize' },
  { key: 'w', at: [0, 0.5], cursor: 'ew-resize' },
]

/** Screen pixels within which a dragged edge snaps to a neighbour. */
const SNAP_PX = 8

interface Drag {
  id: number
  handle: RectHandle
  pointer: [number, number]
  start: SourceRect
  others: SourceRect[]
}

/**
 * The whole canvas with each output's slice drawn on it.
 *
 * Every output gets its own box, numbered and labelled. With ``onChange`` the
 * selected box can be dragged to move it and pulled by its edges or corners
 * to resize it; edges snap to the canvas border and to neighbouring boxes.
 * The selected box is drawn last, so it stays grabbable where boxes overlap.
 *
 * Once the canvas has been placed on a camera's photo, the photo of the
 * building is drawn behind the boxes with each projector's light on it
 * (the canvas map), so the boxes sit where the projectors really land.
 */
export function CanvasOverview({
  show,
  outputs,
  selectedId,
  onSelect,
  onChange,
}: {
  show: Show
  outputs: Output[]
  selectedId: number | null
  onSelect: (id: number) => void
  onChange?: (output: Output, source: SourceRect) => void
}) {
  const W = show.canvas_width
  const H = show.canvas_height
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const map = useCanvasMap(show, outputs)
  const [mapOn, setMapOn] = useState(mapWanted)
  const showMap = map != null && mapOn
  const toggleMap = (on: boolean) => {
    setMapOn(on)
    try {
      localStorage.setItem(MAP_KEY, on ? 'on' : 'off')
    } catch {
      /* remembered for this page only */
    }
  }

  const toCanvas = (event: { clientX: number; clientY: number }): [number, number] => {
    const svg = svgRef.current!
    const ctm = svg.getScreenCTM()
    if (!ctm) return [0, 0]
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse())
    return [p.x / W, p.y / H]
  }

  const begin = (output: Output, handle: RectHandle) => (event: React.PointerEvent) => {
    event.stopPropagation()
    onSelect(output.id)
    if (!onChange) return
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
    setDrag({
      id: output.id,
      handle,
      pointer: toCanvas(event),
      start: output.source,
      others: outputs.filter((o) => o.id !== output.id).map((o) => o.source),
    })
  }

  const move = (event: React.PointerEvent) => {
    if (!drag || !onChange) return
    const output = outputs.find((o) => o.id === drag.id)
    if (!output) return
    const [x, y] = toCanvas(event)
    const box = svgRef.current!.getBoundingClientRect()
    // Alt drags freely, without snapping.
    const snapX = event.altKey ? 0 : (SNAP_PX / box.width) * 1.04
    const snapY = event.altKey ? 0 : (SNAP_PX / box.height) * 1.04
    const next = dragRect(drag.start, drag.handle, x - drag.pointer[0], y - drag.pointer[1], drag.others, snapX, snapY)
    const s = output.source
    if (next.x !== s.x || next.y !== s.y || next.w !== s.w || next.h !== s.h) onChange(output, next)
  }

  const end = () => setDrag(null)

  // Selected last so it sits on top.
  const order = outputs
    .map((o, i) => ({ o, i }))
    .sort((a, b) => Number(a.o.id === selectedId) - Number(b.o.id === selectedId))
  const handleSize = Math.min(W, H) * 0.028
  const strokeFor = (active: boolean) => (active ? 3 : 1.5)

  return (
    <div className="space-y-2">
      <svg
        ref={svgRef}
        viewBox={`${-W * 0.02} ${-H * 0.02} ${W * 1.04} ${H * 1.04}`}
        className="w-full touch-none select-none rounded-md bg-panel-950"
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <rect x={0} y={0} width={W} height={H} fill="#141820" stroke="rgba(255,255,255,0.15)" strokeWidth={2}
          vectorEffect="non-scaling-stroke" />
        {showMap && <image href={map} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />}
        {order.map(({ o, i }) => {
          const color = outputColor(i)
          const active = o.id === selectedId
          const x = o.source.x * W
          const y = o.source.y * H
          const w = o.source.w * W
          const h = o.source.h * H
          const label = `${i + 1}  ${o.name}`
          // Fit the label inside the box, whatever its size.
          const font = Math.max(Math.min(H / 16, (w * 0.9) / (label.length * 0.6), h / 4), Math.min(W, H) / 60)
          const pad = font * 0.5
          const editable = active && onChange != null
          return (
            <g key={o.id} data-output={o.id}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={color}
                fillOpacity={showMap ? (active ? 0.12 : 0.04) : active ? 0.28 : 0.14}
                stroke={color}
                strokeWidth={strokeFor(active)}
                vectorEffect="non-scaling-stroke"
                className={editable ? 'cursor-move' : 'cursor-pointer'}
                onPointerDown={begin(o, 'move')}
              />
              <text
                x={x + pad}
                y={y + pad + font * 0.85}
                fill="#e2e8f0"
                fontSize={font}
                fontWeight={600}
                style={{ pointerEvents: 'none' }}
              >
                {label}
              </text>
              {h > font * 3.2 && (
                <text
                  x={x + pad}
                  y={y + pad + font * 2.1}
                  fill="#94a3b8"
                  fontSize={font * 0.7}
                  style={{ pointerEvents: 'none' }}
                >
                  {Math.round(w)} × {Math.round(h)} of the canvas
                </text>
              )}
              {editable &&
                HANDLES.map((handle) => (
                  <rect
                    key={handle.key}
                    x={x + handle.at[0] * w - handleSize / 2}
                    y={y + handle.at[1] * h - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    rx={handleSize * 0.2}
                    fill="#0b0e14"
                    stroke={color}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: handle.cursor }}
                    onPointerDown={begin(o, handle.key)}
                  />
                ))}
            </g>
          )
        })}
      </svg>
      {map != null && (
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" className="accent-sky-500" checked={mapOn} onChange={(e) => toggleMap(e.target.checked)} />
          The building from the camera, with each projector's light (from the last calibration)
        </label>
      )}
    </div>
  )
}

/**
 * A live preview of every output side by side: exactly what each projector
 * shows, with its warp, masks and blends. Click one to edit it.
 */
export function OutputPreviews({
  show,
  outputs,
  selectedId,
  playback,
  clock,
  transport,
  onSelect,
}: {
  show: Show
  outputs: Output[]
  selectedId: number | null
  playback: Playback
  clock: ServerClock
  transport: TransportState | null
  onSelect: (id: number) => void
}) {
  const live = transport?.show_id === show.id && (transport.status === 'playing' || transport.status === 'paused')
  const idle = transport?.show_id !== show.id || transport.status === 'stopped'
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
      {outputs.map((o, i) => {
        const active = o.id === selectedId
        const note = !o.enabled
          ? 'Output off'
          : o.test_pattern !== 'none'
            ? `Test pattern: ${o.test_pattern}`
            : idle
              ? 'Nothing playing'
              : !live
                ? 'Blackout'
                : null
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onSelect(o.id)}
            className={classNames(
              'group rounded-lg bg-panel-850 p-2 text-left ring-1 transition',
              active ? 'ring-2' : 'ring-white/5 hover:ring-white/20',
            )}
            style={active ? { ['--tw-ring-color' as string]: outputColor(i) } : undefined}
          >
            <div
              className="relative w-full overflow-hidden rounded bg-black"
              style={{ aspectRatio: `${o.width} / ${o.height}` }}
            >
              <OutputView
                output={o}
                outputs={show.outputs}
                canvasWidth={show.canvas_width}
                canvasHeight={show.canvas_height}
                playback={playback}
                clock={clock}
                className="absolute inset-0 h-full w-full"
              />
              {note && (
                <span className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-center text-[11px] text-slate-300">
                  {note}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-slate-950"
                style={{ background: outputColor(i) }}
              >
                {i + 1}
              </span>
              <span className={classNames('truncate font-medium', active ? 'text-slate-100' : 'text-slate-300')}>
                {o.name}
              </span>
              <span className="ml-auto shrink-0 text-slate-500">
                {o.width}×{o.height}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
