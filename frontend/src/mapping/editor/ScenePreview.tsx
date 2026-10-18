import { useEffect, useMemo, useRef, useState } from 'react'
import { classNames } from '@/lib/format'
import { mappingApi, mediaUrl, snapshotUrl } from '../api'
import { applyHomography, squareToQuad, withDefaults } from '../geometry'
import type { ServerClock } from '../live'
import { OutputView } from '../OutputView'
import { PeopleTracker } from '../people'
import { Playback } from '../playback'
import type { TextureSource } from '../renderer'
import { MAX_PINS } from '../scene/engine'
import { SimulatedCrowd } from '../scene/simulate'
import type { MappingScene, MediaAsset, ObjectPin, Output, Point, Show, Surface, SurfaceKind } from '../types'

/** Reports a camera would send, per second; the trackers expect about this. */
const REPORT_MS = 66
/** Made-up people sent to the projectors, per second. */
const SEND_MS = 100

export const SURFACE_KINDS: Array<{ id: SurfaceKind; label: string; color: string }> = [
  { id: 'wall', label: 'Wall', color: '#38bdf8' },
  { id: 'roof', label: 'Roof', color: '#f472b6' },
  { id: 'window', label: 'Window', color: '#fbbf24' },
  { id: 'door', label: 'Door', color: '#4ade80' },
  { id: 'other', label: 'Other', color: '#a78bfa' },
]

const KIND_COLOR = Object.fromEntries(SURFACE_KINDS.map((k) => [k.id, k.color])) as Record<SurfaceKind, string>

/** An output showing the whole canvas, unwarped: for previews and recordings. */
export function wholeCanvasOutput(showId: number, id: number, name: string, width: number, height: number): Output {
  const base: Omit<Output, 'warp' | 'blend' | 'color'> & Partial<Pick<Output, 'warp' | 'blend' | 'color'>> = {
    id,
    show_id: showId,
    position: 0,
    name,
    projector_id: null,
    width,
    height,
    source: { x: 0, y: 0, w: 1, h: 1 },
    masks: [],
    test_pattern: 'none',
    enabled: true,
  }
  return withDefaults(base)
}

export type PeopleSource = 'simulated' | 'camera'
export type Backdrop = { kind: 'none' } | { kind: 'camera' } | { kind: 'media'; id: number }

export interface Drawing {
  kind: SurfaceKind
  points: Point[]
}

/**
 * A photo of the building straightened onto the canvas, so a scene can be
 * judged against the real house. Uses the four corners from the Camera tab
 * (the finer hand-placed points are left out; a preview does not need them).
 */
export async function straightenedPhoto(show: Show, version: number): Promise<HTMLImageElement | null> {
  const view = show.camera_view
  if (!view) return null
  const photo = new Image()
  photo.src = snapshotUrl(view.camera_id, version)
  try {
    await photo.decode()
  } catch {
    return null
  }
  const pw = photo.naturalWidth
  const ph = photo.naturalHeight
  const src = document.createElement('canvas')
  src.width = pw
  src.height = ph
  const sctx = src.getContext('2d')!
  sctx.drawImage(photo, 0, 0)
  const pixels = sctx.getImageData(0, 0, pw, ph).data
  const w = Math.min(1280, show.canvas_width)
  const h = Math.max(1, Math.round((w * show.canvas_height) / show.canvas_width))
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const octx = out.getContext('2d')!
  const image = octx.createImageData(w, h)
  const H = squareToQuad(view.corners)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [u, v] = applyHomography(H, (x + 0.5) / w, (y + 0.5) / h)
      const sx = Math.floor(u * pw)
      const sy = Math.floor(v * ph)
      const o = (y * w + x) * 4
      if (sx >= 0 && sy >= 0 && sx < pw && sy < ph) {
        const i = (sy * pw + sx) * 4
        image.data[o] = pixels[i]
        image.data[o + 1] = pixels[i + 1]
        image.data[o + 2] = pixels[i + 2]
      }
      image.data[o + 3] = 255
    }
  }
  octx.putImageData(image, 0, 0)
  const result = new Image()
  result.src = out.toDataURL('image/jpeg', 0.9)
  await result.decode()
  return result
}

/** The backdrop as the renderer's media, dimmed a little so added light shows. */
function useBackdrop(show: Show, backdrop: Backdrop, media: MediaAsset[]): TextureSource | null {
  const [source, setSource] = useState<TextureSource | null>(null)
  const asset = backdrop.kind === 'media' ? media.find((m) => m.id === backdrop.id) : undefined
  useEffect(() => {
    let cancelled = false
    setSource(null)
    if (backdrop.kind === 'camera') {
      void straightenedPhoto(show, Date.now()).then((img) => {
        if (!cancelled && img) setSource({ element: img, width: img.naturalWidth, height: img.naturalHeight, fit: 'stretch' })
      })
    } else if (asset) {
      if (asset.kind === 'video') {
        const video = document.createElement('video')
        video.muted = true
        video.loop = true
        video.playsInline = true
        video.src = mediaUrl(asset.id)
        void video.play().catch(() => undefined)
        setSource({ element: video, width: asset.width || 1920, height: asset.height || 1080, fit: 'fill' })
        return () => {
          cancelled = true
          video.pause()
          video.removeAttribute('src')
          video.load()
        }
      }
      const img = new Image()
      img.src = mediaUrl(asset.id)
      void img.decode().then(() => {
        if (!cancelled) setSource({ element: img, width: img.naturalWidth, height: img.naturalHeight, fit: 'fill' })
      }, () => undefined)
    }
    return () => {
      cancelled = true
    }
    // Re-load only when the choice changes, not on every show edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backdrop.kind, backdrop.kind === 'media' ? backdrop.id : 0, asset?.id, show.id, show.camera_view?.camera_id])
  return source
}

/**
 * The scene, live, over the building, with people to try it on.
 *
 * Simulated people wander about and can be dragged; with ``sendToProjectors``
 * they are also sent to the real outputs, so a scene can be tried on the
 * building with nobody standing in front of it. ``tracing`` turns clicks into
 * the outline of a house part instead.
 */
export function ScenePreview({
  show,
  scene,
  media,
  clock,
  cameraPeople,
  peopleSource,
  count,
  sendToProjectors,
  backdrop,
  surfaces,
  showSurfaces,
  drawing,
  onDrawingChange,
  onDrawingDone,
  onSurfacesChange,
  onSurfacesDone,
  placing,
  onPinsChange,
  onStats,
}: {
  show: Show
  scene: MappingScene | null
  media: MediaAsset[]
  clock: ServerClock
  /** People the real camera sees. */
  cameraPeople: PeopleTracker
  peopleSource: PeopleSource
  count: number
  sendToProjectors: boolean
  backdrop: Backdrop
  surfaces: Surface[]
  showSurfaces: boolean
  /** A house part being traced; clicks add its points. */
  drawing: Drawing | null
  onDrawingChange: (drawing: Drawing | null) => void
  /** The outline was closed by clicking its first point. */
  onDrawingDone: () => void
  onSurfacesChange: (surfaces: Surface[]) => void
  /** A drag of a traced point ended; time to save. */
  onSurfacesDone: () => void
  /**
   * Objects of one layer being placed by hand: clicks add one, drags move
   * one, and a click on one picks it. radius is an object's size in
   * canvas heights.
   */
  placing?: { pins: ObjectPin[]; radius: number; selected: number | null } | null
  /** Pins changed or one was picked; the scene saves itself shortly after. */
  onPinsChange?: (pins: ObjectPin[], selected: number | null) => void
  onStats?: (fps: number, sceneScale: number | null) => void
}) {
  const playback = useMemo(() => new Playback(), [])
  const aspect = show.canvas_width / show.canvas_height
  const crowd = useMemo(() => new SimulatedCrowd(count, aspect), []) // eslint-disable-line react-hooks/exhaustive-deps
  const simulated = useMemo(() => new PeopleTracker(show.id), [show.id])
  const source = useBackdrop(show, backdrop, media)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<
    { kind: 'person'; id: number } | { kind: 'point'; surface: number; point: number } | { kind: 'pin'; index: number } | null
  >(null)
  const latest = useRef({ surfaces, showSurfaces, drawing, peopleSource, sendToProjectors, placing })
  latest.current = { surfaces, showSurfaces, drawing, peopleSource, sendToProjectors, placing }

  const output = useMemo(
    () => wholeCanvasOutput(show.id, -1, 'Scene preview', show.canvas_width, show.canvas_height),
    [show.id, show.canvas_width, show.canvas_height],
  )

  useEffect(() => () => playback.dispose(), [playback])
  useEffect(() => crowd.setAspect(aspect), [crowd, aspect])
  useEffect(() => crowd.setCount(count), [crowd, count])
  useEffect(() => playback.setSurfaces(surfaces), [playback, surfaces])
  useEffect(() => {
    playback.setPeople(peopleSource === 'camera' ? cameraPeople : simulated)
  }, [playback, peopleSource, cameraPeople, simulated])
  useEffect(() => {
    // Always a scene (an empty one when none is chosen) so the preview
    // never follows the transport.
    const shown = scene ?? { id: -1, name: '', description: '', layers: [], created_at: '', updated_at: '' }
    playback.setPreview(shown, source)
  }, [playback, scene, source])

  // Walk the simulated people, report them like a camera, and draw the overlay.
  useEffect(() => {
    let raf = 0
    let reported = 0
    let sent = 0
    let sending = false
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = performance.now()
      const { peopleSource: from, sendToProjectors: send } = latest.current
      if (from === 'simulated') {
        crowd.step(now)
        if (now - reported >= REPORT_MS) {
          reported = now
          simulated.update(crowd.message(show.id))
        }
        if (send && !sending && now - sent >= SEND_MS) {
          sent = now
          sending = true
          const people = crowd.people().map((p) => ({ id: p.id, x: p.cx, y: p.cy, z: p.z, size: p.size }))
          void mappingApi.simulatedPeople(show.id, people).catch(() => undefined).finally(() => {
            sending = false
          })
        }
      }
      drawOverlay()
    }
    const drawOverlay = () => {
      const canvas = overlayRef.current
      if (!canvas) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.round(canvas.clientWidth * dpr)
      const h = Math.round(canvas.clientHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, w, h)
      const { surfaces: parts, showSurfaces: outline, drawing: draft, peopleSource: from, placing: place } = latest.current
      const unit = Math.max(1, h / 300)
      if (outline || draft) {
        parts.forEach((s) => {
          ctx.beginPath()
          s.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * w, y * h) : ctx.lineTo(x * w, y * h)))
          ctx.closePath()
          ctx.fillStyle = `${KIND_COLOR[s.kind]}22`
          ctx.fill()
          ctx.strokeStyle = KIND_COLOR[s.kind]
          ctx.lineWidth = unit
          ctx.stroke()
          ctx.fillStyle = KIND_COLOR[s.kind]
          s.points.forEach(([x, y]) => {
            ctx.beginPath()
            ctx.arc(x * w, y * h, 2.5 * unit, 0, Math.PI * 2)
            ctx.fill()
          })
        })
      }
      if (draft) {
        ctx.strokeStyle = KIND_COLOR[draft.kind]
        ctx.fillStyle = KIND_COLOR[draft.kind]
        ctx.lineWidth = unit * 1.5
        ctx.setLineDash([4 * unit, 3 * unit])
        ctx.beginPath()
        draft.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * w, y * h) : ctx.lineTo(x * w, y * h)))
        ctx.stroke()
        ctx.setLineDash([])
        draft.points.forEach(([x, y], i) => {
          ctx.beginPath()
          ctx.arc(x * w, y * h, (i === 0 ? 4.5 : 3) * unit, 0, Math.PI * 2)
          ctx.fill()
        })
      }
      if (place) {
        // A dashed ring around each placed object; the picked one is solid.
        place.pins.forEach((pin, i) => {
          const r = Math.max(6 * unit, place.radius * pin.size * h)
          ctx.beginPath()
          ctx.arc(pin.x * w, pin.y * h, r, 0, Math.PI * 2)
          ctx.lineWidth = (i === place.selected ? 2 : 1) * unit
          ctx.strokeStyle = i === place.selected ? '#38bdf8' : 'rgba(56,189,248,0.7)'
          ctx.setLineDash(i === place.selected ? [] : [3 * unit, 3 * unit])
          ctx.stroke()
          ctx.setLineDash([])
        })
      }
      if (from === 'simulated') {
        for (const p of crowd.people()) {
          ctx.beginPath()
          ctx.arc(p.cx * w, p.cy * h, 6 * unit, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(255,255,255,0.75)'
          ctx.lineWidth = unit
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(p.cx * w, p.cy * h, 1.5 * unit, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.9)'
          ctx.fill()
        }
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [crowd, simulated, show.id])

  const toCanvas = (event: React.PointerEvent): Point => {
    const rect = boxRef.current!.getBoundingClientRect()
    return [
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    ]
  }

  /** Nearest traced point within a few pixels. */
  const pickPoint = (p: Point) => {
    const rect = boxRef.current!.getBoundingClientRect()
    let best: { surface: number; point: number } | null = null
    let bestD = 12
    surfaces.forEach((s, si) =>
      s.points.forEach(([x, y], pi) => {
        const d = Math.hypot((x - p[0]) * rect.width, (y - p[1]) * rect.height)
        if (d < bestD) {
          bestD = d
          best = { surface: si, point: pi }
        }
      }),
    )
    return best as { surface: number; point: number } | null
  }

  /** The placed object under the pointer, the nearest if several. */
  const pickPin = (p: Point) => {
    if (!placing) return null
    const rect = boxRef.current!.getBoundingClientRect()
    let best: number | null = null
    let bestD = Infinity
    placing.pins.forEach((pin, i) => {
      const d = Math.hypot((pin.x - p[0]) * rect.width, (pin.y - p[1]) * rect.height)
      const r = Math.max(12, placing.radius * pin.size * rect.height)
      if (d < r && d < bestD) {
        bestD = d
        best = i
      }
    })
    return best as number | null
  }

  const onPointerDown = (event: React.PointerEvent) => {
    const p = toCanvas(event)
    if (placing && onPinsChange) {
      const hit = pickPin(p)
      if (hit != null) {
        onPinsChange(placing.pins, hit)
        drag.current = { kind: 'pin', index: hit }
        ;(event.target as Element).setPointerCapture(event.pointerId)
        return
      }
      if (peopleSource === 'simulated') {
        const id = crowd.pick(p[0], p[1])
        if (id != null) {
          drag.current = { kind: 'person', id }
          crowd.hold(id, p[0], p[1])
          ;(event.target as Element).setPointerCapture(event.pointerId)
          return
        }
      }
      if (placing.pins.length >= MAX_PINS) return
      const size = placing.selected != null ? placing.pins[placing.selected]?.size ?? 1 : 1
      onPinsChange([...placing.pins, { x: p[0], y: p[1], size }], placing.pins.length)
      return
    }
    if (drawing) {
      const first = drawing.points[0]
      const rect = boxRef.current!.getBoundingClientRect()
      if (first && drawing.points.length >= 3 && Math.hypot((first[0] - p[0]) * rect.width, (first[1] - p[1]) * rect.height) < 12) {
        // Clicking the first point closes the outline; the panel saves it.
        onDrawingDone()
        return
      }
      onDrawingChange({ ...drawing, points: [...drawing.points, p] })
      return
    }
    if (showSurfaces) {
      const hit = pickPoint(p)
      if (hit) {
        drag.current = { kind: 'point', ...hit }
        ;(event.target as Element).setPointerCapture(event.pointerId)
        return
      }
    }
    if (peopleSource === 'simulated') {
      const id = crowd.pick(p[0], p[1])
      if (id != null) {
        drag.current = { kind: 'person', id }
        crowd.hold(id, p[0], p[1])
        ;(event.target as Element).setPointerCapture(event.pointerId)
      }
    }
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = toCanvas(event)
    if (d.kind === 'person') crowd.hold(d.id, p[0], p[1])
    else if (d.kind === 'pin') {
      if (placing && onPinsChange) {
        onPinsChange(placing.pins.map((pin, i) => (i === d.index ? { ...pin, x: p[0], y: p[1] } : pin)), d.index)
      }
    } else {
      onSurfacesChange(
        surfaces.map((s, si) =>
          si === d.surface ? { ...s, points: s.points.map((q, pi) => (pi === d.point ? p : q)) } : s,
        ),
      )
    }
  }

  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (d?.kind === 'person') crowd.hold(null)
    if (d?.kind === 'point') onSurfacesDone()
  }

  return (
    <div
      ref={boxRef}
      className={classNames(
        'relative w-full overflow-hidden rounded-md bg-black ring-1 ring-white/10',
        drawing || placing ? 'cursor-crosshair' : peopleSource === 'simulated' || showSurfaces ? 'cursor-pointer' : '',
      )}
      style={{ aspectRatio: `${show.canvas_width} / ${show.canvas_height}` }}
    >
      <OutputView
        output={output}
        canvasWidth={show.canvas_width}
        canvasHeight={show.canvas_height}
        playback={playback}
        clock={clock}
        className="absolute inset-0 h-full w-full"
        onStats={(s) => onStats?.(s.fps, s.sceneScale)}
      />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  )
}
