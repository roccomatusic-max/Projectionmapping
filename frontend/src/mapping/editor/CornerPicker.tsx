import { useRef } from 'react'
import type { Point } from '../types'

/**
 * Four corners to drag with the mouse (or a finger) over a picture: the
 * Scenes preview, or the picture of a projector's output on a mini PC's
 * status screen. Corners are in fractions of the box it covers (they may
 * lie outside it); ``toBox``/``fromBox`` convert when the caller works in
 * another space. Dragging inside the shape moves all four.
 */
export function CornerPicker({
  corners,
  onChange,
  onDone,
  toBox = (p) => p,
  fromBox = (p) => p,
  size = 'normal',
}: {
  /** Top-left, top-right, bottom-right, bottom-left, in the caller's space. */
  corners: Point[]
  /** While dragging. */
  onChange: (corners: Point[]) => void
  /** A drag ended. */
  onDone: (corners: Point[]) => void
  toBox?: (p: Point) => Point
  fromBox?: (p: Point) => Point
  /** Bigger handles for a monitor read from across the room. */
  size?: 'normal' | 'large'
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ index: number | 'all'; start: Point; from: Point[] } | null>(null)
  const latest = useRef(corners)
  latest.current = corners

  const boxPoint = (event: React.PointerEvent): Point => {
    const r = boxRef.current!.getBoundingClientRect()
    return [(event.clientX - r.left) / Math.max(1, r.width), (event.clientY - r.top) / Math.max(1, r.height)]
  }

  const start = (index: number | 'all') => (event: React.PointerEvent) => {
    event.stopPropagation()
    event.preventDefault()
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
    drag.current = { index, start: boxPoint(event), from: latest.current.map(toBox) }
  }

  const move = (event: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = boxPoint(event)
    const dx = p[0] - d.start[0]
    const dy = p[1] - d.start[1]
    const moved = d.from.map((q, i) => (d.index === 'all' || d.index === i ? ([q[0] + dx, q[1] + dy] as Point) : q))
    onChange(moved.map(fromBox))
  }

  const end = () => {
    if (!drag.current) return
    drag.current = null
    onDone(latest.current)
  }

  const box = corners.map(toBox)
  const shape = box.map((p) => `${p[0] * 100},${p[1] * 100}`).join(' ')
  const handle = size === 'large' ? 'h-[calc(var(--u,1vh)*4.5)] w-[calc(var(--u,1vh)*4.5)] border-[3px]' : 'h-5 w-5 border-2'
  return (
    <div
      ref={boxRef}
      className="pointer-events-none absolute inset-0 touch-none"
    >
      <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon
          points={shape}
          fill="rgba(250, 204, 21, 0.1)"
          stroke="#facc15"
          strokeWidth={size === 'large' ? 3 : 2}
          vectorEffect="non-scaling-stroke"
          className="pointer-events-auto cursor-move"
          onPointerDown={start('all')}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      </svg>
      {box.map((p, i) => (
        <div
          key={i}
          title={['Top left', 'Top right', 'Bottom right', 'Bottom left'][i]}
          className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-yellow-400 shadow-[0_0_0_2px_rgba(0,0,0,0.6)] ${handle} ${i === 0 ? 'bg-yellow-400' : 'bg-black/60'}`}
          style={{ left: `${p[0] * 100}%`, top: `${p[1] * 100}%` }}
          onPointerDown={start(i)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      ))}
    </div>
  )
}
