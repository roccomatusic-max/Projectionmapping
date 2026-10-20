import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { classNames } from '@/lib/format'
import {
  applyHomography,
  invertHomography,
  isConvex,
  meshBase,
  squareToQuad,
  warpPoint,
} from '../geometry'
import type { ServerClock } from '../live'
import { OutputView } from '../OutputView'
import type { Playback } from '../playback'
import type { Output, Point } from '../types'

export type EditMode = 'corners' | 'mesh' | 'masks'

interface Handle {
  key: string
  at: Point
}

const CORNER_NAMES = ['Top left', 'Top right', 'Bottom right', 'Bottom left']

/**
 * Live preview of one output with draggable handles over it.
 *
 * Handles live in output space, the space the projector draws in, so a
 * handle dragged here moves exactly that point of the projected image.
 * Arrow keys nudge the selected handle one projector pixel (Shift: ten,
 * Alt: a tenth), which is how the last millimetres are done on site.
 */
export function WarpEditor({
  output,
  canvasWidth,
  canvasHeight,
  playback,
  clock,
  mode,
  selectedMask,
  readOnly,
  onChange,
  onSelectMask,
  outputs,
}: {
  output: Output
  canvasWidth: number
  canvasHeight: number
  playback: Playback
  clock: ServerClock
  mode: EditMode
  selectedMask: number | null
  readOnly: boolean
  onChange: (patch: Partial<Output>) => void
  onSelectMask: (index: number | null) => void
  /** The show's outputs, so the preview blends overlaps like the projector will. */
  outputs?: Output[]
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const dragging = useRef<string | null>(null)
  const W = output.width
  const H = output.height
  const H_ = useMemo(() => squareToQuad(output.warp.corners), [output.warp.corners])

  useEffect(() => setSelected(null), [mode, output.id, selectedMask])

  const handles: Handle[] = useMemo(() => {
    if (mode === 'corners') return output.warp.corners.map((at, i) => ({ key: `c${i}`, at }))
    if (mode === 'mesh' && output.warp.mesh) {
      const mesh = output.warp.mesh
      return mesh.points.map((offset, i) => {
        const [bu, bv] = meshBase(mesh, i)
        return { key: `m${i}`, at: applyHomography(H_, bu + offset[0], bv + offset[1]) }
      })
    }
    if (mode === 'masks' && selectedMask != null && output.masks[selectedMask]) {
      return output.masks[selectedMask].points.map((at, i) => ({ key: `k${i}`, at }))
    }
    return []
  }, [mode, output.warp, output.masks, selectedMask, H_])

  /** Move one handle to an output-space point. */
  const moveHandle = useCallback(
    (key: string, to: Point) => {
      const index = Number(key.slice(1))
      const kind = key[0]
      if (kind === 'c') {
        const corners = output.warp.corners.map((p, i) => (i === index ? to : p)) as Point[]
        // A folded quad would turn the image inside out; refuse the move.
        if (!isConvex(corners)) return
        onChange({ warp: { ...output.warp, corners } })
      } else if (kind === 'm' && output.warp.mesh) {
        const mesh = output.warp.mesh
        const [u, v] = applyHomography(invertHomography(H_), to[0], to[1])
        const [bu, bv] = meshBase(mesh, index)
        const points = mesh.points.map((p, i) => (i === index ? ([u - bu, v - bv] as Point) : p))
        onChange({ warp: { ...output.warp, mesh: { ...mesh, points } } })
      } else if (kind === 'k' && selectedMask != null) {
        const masks = output.masks.map((m, i) =>
          i === selectedMask ? { ...m, points: m.points.map((p, j) => (j === index ? to : p)) } : m,
        )
        onChange({ masks })
      }
    },
    [output, H_, selectedMask, onChange],
  )

  const toOutput = (event: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current!.getBoundingClientRect()
    return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height]
  }

  const onPointerDown = (key: string) => (event: React.PointerEvent) => {
    event.stopPropagation()
    setSelected(key)
    if (readOnly) return
    dragging.current = key
    ;(event.target as Element).setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragging.current) return
    moveHandle(dragging.current, toOutput(event))
  }

  const onPointerUp = () => {
    dragging.current = null
  }

  /** In mask mode a click on the image adds a point on the nearest edge. */
  const onBackgroundClick = (event: React.MouseEvent) => {
    if (readOnly || mode !== 'masks' || selectedMask == null) return
    const mask = output.masks[selectedMask]
    if (!mask) return
    const p = toOutput(event)
    let best = 0
    let bestDistance = Infinity
    mask.points.forEach((a, i) => {
      const b = mask.points[(i + 1) % mask.points.length]
      const d = segmentDistance(p, a, b, W, H)
      if (d < bestDistance) {
        bestDistance = d
        best = i
      }
    })
    const points = [...mask.points]
    points.splice(best + 1, 0, p)
    onChange({ masks: output.masks.map((m, i) => (i === selectedMask ? { ...m, points } : m)) })
    setSelected(`k${best + 1}`)
  }

  const removeMaskPoint = (index: number) => {
    if (readOnly || selectedMask == null) return
    const mask = output.masks[selectedMask]
    if (!mask || mask.points.length <= 3) return
    const points = mask.points.filter((_, j) => j !== index)
    onChange({ masks: output.masks.map((m, i) => (i === selectedMask ? { ...m, points } : m)) })
    setSelected(null)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!selected || readOnly) return
    const steps: Record<string, Point> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected.startsWith('k')) {
      event.preventDefault()
      removeMaskPoint(Number(selected.slice(1)))
      return
    }
    const step = steps[event.key]
    if (!step) return
    event.preventDefault()
    const handle = handles.find((h) => h.key === selected)
    if (!handle) return
    const pixels = event.shiftKey ? 10 : event.altKey ? 0.1 : 1
    moveHandle(selected, [handle.at[0] + (step[0] * pixels) / W, handle.at[1] + (step[1] * pixels) / H])
  }

  const outline = useMemo(() => warpedOutline(output), [output])
  const meshLines = useMemo(() => (mode === 'mesh' ? warpedMeshLines(output) : []), [mode, output])
  const r = Math.max(W, H) * 0.011
  const selectedHandle = handles.find((h) => h.key === selected)

  return (
    <div>
      <div
        className="relative mx-auto overflow-hidden rounded-md bg-black ring-1 ring-white/10"
        // As wide as there is room for, but never taller than about 60% of the screen.
        style={{ aspectRatio: `${W} / ${H}`, width: `min(100%, calc(55vh * ${W / H}))` }}
      >
        <OutputView
          output={output}
          outputs={outputs}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          playback={playback}
          clock={clock}
          className="absolute inset-0 h-full w-full"
        />
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full touch-none outline-none"
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={onBackgroundClick}
          aria-label="Warp handles. Select a handle and use the arrow keys to nudge it."
        >
          <polygon
            points={outline.map(([x, y]) => `${x * W},${y * H}`).join(' ')}
            fill="none"
            stroke="rgba(56,189,248,0.8)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
          {meshLines.map((line, i) => (
            <polyline
              key={i}
              points={line.map(([x, y]) => `${x * W},${y * H}`).join(' ')}
              fill="none"
              stroke="rgba(56,189,248,0.45)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {output.masks.map((mask, i) => (
            <polygon
              key={i}
              points={mask.points.map(([x, y]) => `${x * W},${y * H}`).join(' ')}
              fill={mode === 'masks' && i === selectedMask ? 'rgba(244,63,94,0.18)' : 'rgba(244,63,94,0.06)'}
              stroke={mask.enabled ? 'rgba(244,63,94,0.9)' : 'rgba(148,163,184,0.6)'}
              strokeDasharray={mask.invert ? '6 4' : undefined}
              strokeWidth={mode === 'masks' && i === selectedMask ? 2 : 1}
              vectorEffect="non-scaling-stroke"
              onClick={(event) => {
                if (mode !== 'masks' || i === selectedMask) return
                event.stopPropagation()
                onSelectMask(i)
              }}
              className={mode === 'masks' ? 'cursor-pointer' : undefined}
            />
          ))}
          {handles.map((handle) => {
            const active = handle.key === selected
            return (
              <g key={handle.key}>
                <circle
                  cx={handle.at[0] * W}
                  cy={handle.at[1] * H}
                  r={r * 2.2}
                  fill="transparent"
                  className={readOnly ? 'cursor-default' : 'cursor-grab'}
                  onPointerDown={onPointerDown(handle.key)}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    if (handle.key.startsWith('k')) removeMaskPoint(Number(handle.key.slice(1)))
                  }}
                  onClick={(event) => event.stopPropagation()}
                />
                <circle
                  cx={handle.at[0] * W}
                  cy={handle.at[1] * H}
                  r={active ? r * 1.3 : r}
                  fill={active ? '#fbbf24' : handle.key[0] === 'k' ? '#fb7185' : '#38bdf8'}
                  stroke="#0a0c10"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              </g>
            )
          })}
        </svg>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className={classNames(selectedHandle ? 'text-slate-300' : undefined)}>
          {selectedHandle
            ? `${handleLabel(selectedHandle.key)} · ${(selectedHandle.at[0] * W).toFixed(1)}, ${(selectedHandle.at[1] * H).toFixed(1)} px`
            : 'Select a handle'}
        </span>
        <span>Arrows nudge 1 px · Shift 10 px · Alt 0.1 px</span>
        {mode === 'masks' && <span>Click the image to add a point · double-click a point to remove it</span>}
      </p>
    </div>
  )
}

function handleLabel(key: string) {
  const index = Number(key.slice(1))
  if (key[0] === 'c') return CORNER_NAMES[index]
  if (key[0] === 'm') return `Mesh point ${index + 1}`
  return `Mask point ${index + 1}`
}

function segmentDistance(p: Point, a: Point, b: Point, W: number, H: number) {
  const px = p[0] * W
  const py = p[1] * H
  const ax = a[0] * W
  const ay = a[1] * H
  const bx = b[0] * W
  const by = b[1] * H
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** The warped edge of the image, sampled so mesh curvature shows. */
function warpedOutline(output: Output): Point[] {
  const n = 24
  const H = squareToQuad(output.warp.corners)
  const pts: Point[] = []
  for (let i = 0; i < n; i++) pts.push(warpPoint(output.warp, i / n, 0, H))
  for (let i = 0; i < n; i++) pts.push(warpPoint(output.warp, 1, i / n, H))
  for (let i = n; i > 0; i--) pts.push(warpPoint(output.warp, i / n, 1, H))
  for (let i = n; i > 0; i--) pts.push(warpPoint(output.warp, 0, i / n, H))
  return pts
}

function warpedMeshLines(output: Output): Point[][] {
  const mesh = output.warp.mesh
  if (!mesh) return []
  const H = squareToQuad(output.warp.corners)
  const lines: Point[][] = []
  const samples = 32
  for (let r = 0; r < mesh.rows; r++) {
    const v = r / (mesh.rows - 1)
    lines.push(Array.from({ length: samples + 1 }, (_, i) => warpPoint(output.warp, i / samples, v, H)))
  }
  for (let c = 0; c < mesh.cols; c++) {
    const u = c / (mesh.cols - 1)
    lines.push(Array.from({ length: samples + 1 }, (_, i) => warpPoint(output.warp, u, i / samples, H)))
  }
  return lines
}
