import { useEffect, useMemo, useRef, useState } from 'react'
import { classNames } from '@/lib/format'
import { mappingApi, mediaUrl, snapshotUrl } from '../api'
import { applyHomography, squareToQuad, withDefaults } from '../geometry'
import type { ServerClock } from '../live'
import { OutputView } from '../OutputView'
import { PeopleTracker } from '../people'
import { Playback, type TimelinePreview } from '../playback'
import type { TextureSource } from '../renderer'
import { MAX_PINS } from '../scene/engine'
import { SimulatedCrowd } from '../scene/simulate'
import type { MappingScene, MediaAsset, ObjectPin, Output, Point, Show, SourceRect, Surface, SurfaceKind } from '../types'

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
  { id: 'ground', label: 'Driveway or ground', color: '#fb923c' },
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
export type Backdrop = { kind: 'none' } | { kind: 'camera' } | { kind: 'house' } | { kind: 'media'; id: number }

export interface Drawing {
  kind: SurfaceKind
  points: Point[]
}

/**
 * One layer's things being placed by hand. radius is an object's size in
 * canvas heights; box, when given, makes each one a rectangle that size
 * (a countdown) instead of a ring. max caps how many can be put down.
 */
export interface Placing {
  pins: ObjectPin[]
  radius: number
  box?: { w: number; h: number }
  max?: number
  selected: number | null
  /** The pins are the points of a path, in order: a line joins them and they do not turn. */
  path?: boolean
  /** Smallest and largest size the size handle gives (usually 0.3 to 3). */
  sizeRange?: [number, number]
}

/** How far the turn handle sits above the top edge, in overlay units. */
const HANDLE_GAP = 14

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * Where a placed thing is on a preview width by height pixels: its middle,
 * outline, and the size and turn handles. min is the smallest ring radius
 * in pixels and gap how far the turn handle sits above the top.
 */
function pinShape(place: Placing, pin: ObjectPin, width: number, height: number, min: number, gap: number) {
  const cx = pin.x * width
  const cy = pin.y * height
  const a = ((pin.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  // Turned clockwise on screen, which is y down.
  const turn = (lx: number, ly: number): [number, number] => [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos]
  const local = (x: number, y: number): [number, number] => {
    const dx = x - cx
    const dy = y - cy
    return [dx * cos + dy * sin, -dx * sin + dy * cos]
  }
  if (place.box) {
    const hw = (place.box.w * pin.size * height) / 2
    const hh = (place.box.h * pin.size * height) / 2
    return {
      cx, cy, hw, hh, r: Math.hypot(hw, hh), local,
      corners: [turn(-hw, -hh), turn(hw, -hh), turn(hw, hh), turn(-hw, hh)],
      size: turn(hw, hh),
      reach: Math.hypot(hw, hh),
      ...turnHandle(turn, hh, gap, height),
    }
  }
  const r = Math.max(min, place.radius * pin.size * height)
  return {
    cx, cy, hw: r, hh: r, r, local,
    corners: null,
    size: turn(r * Math.SQRT1_2, r * Math.SQRT1_2),
    reach: place.radius * pin.size * height,
    ...turnHandle(turn, r, gap, height),
  }
}

/**
 * The turn handle sits above the middle (before turning), or below it when
 * above would be off the preview. below says which.
 */
function turnHandle(turn: (lx: number, ly: number) => [number, number], half: number, gap: number, height: number) {
  const above = turn(0, -half - gap)
  const below = above[1] < 0 || above[1] > height
  return below
    ? { top: turn(0, half), turn: turn(0, half + gap), below: true }
    : { top: turn(0, -half), turn: above, below: false }
}

/**
 * A photo of the building straightened onto the canvas, so a scene can be
 * judged against the real house. Uses the four corners from the Camera tab
 * (the finer hand-placed points are left out; a preview does not need them).
 */
export async function straightenedPhoto(show: Show, version: number): Promise<HTMLImageElement | null> {
  const view = show.camera_view
  if (!view) return null
  return straightened(show, snapshotUrl(view.camera_id, version), view.corners)
}

/** The show's own photo of the house (Scenes → Your house → Start from a photo), straightened with its four corners. */
export async function straightenedHousePhoto(show: Show): Promise<HTMLImageElement | null> {
  const saved = await mappingApi.getHousePhoto(show.id).catch(() => null)
  return saved ? straightened(show, mediaUrl(saved.media_id), saved.corners) : null
}

/** The part of a picture inside ``corners`` (TL, TR, BR, BL), stretched to the canvas's shape. */
async function straightened(show: Show, url: string, corners: Point[]): Promise<HTMLImageElement | null> {
  const photo = new Image()
  photo.src = url
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
  const H = squareToQuad(corners)
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
    if (backdrop.kind === 'camera' || backdrop.kind === 'house') {
      void (backdrop.kind === 'camera' ? straightenedPhoto(show, Date.now()) : straightenedHousePhoto(show)).then((img) => {
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
  overlay,
  picker,
  timeline = null,
  view = null,
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
   * Things of one layer being placed by hand: clicks add one, drags move
   * one, and a click on one picks it; the picked one has handles to size
   * and turn it.
   */
  placing?: Placing | null
  /** Pins changed or one was picked; the scene saves itself shortly after. */
  onPinsChange?: (pins: ObjectPin[], selected: number | null) => void
  onStats?: (fps: number, sceneScale: number | null) => void
  /** Drawn on top of everything, ignoring the pointer (the Editor's projector boxes). */
  overlay?: React.ReactNode
  /** On top and taking the pointer: the corners of a house part being straightened. */
  picker?: React.ReactNode
  /** A cue's timeline drawn over the scene at the designer's playhead (the Show designer). */
  timeline?: TimelinePreview | null
  /**
   * Show only one projector's box of the picture, in that projector's shape,
   * as it shows it (stretched, if its box is the wrong shape). Placing and
   * dragging work as on the whole picture.
   */
  view?: { source: SourceRect; aspect: number } | null
}) {
  const playback = useMemo(() => new Playback(), [])
  const aspect = show.canvas_width / show.canvas_height
  const crowd = useMemo(() => new SimulatedCrowd(count, aspect), []) // eslint-disable-line react-hooks/exhaustive-deps
  const simulated = useMemo(() => new PeopleTracker(show.id), [show.id])
  const source = useBackdrop(show, backdrop, media)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<
    | { kind: 'person'; id: number }
    | { kind: 'point'; surface: number; point: number }
    | { kind: 'pin'; index: number; dx: number; dy: number }
    | { kind: 'pin-size'; index: number }
    | { kind: 'pin-turn'; index: number; below: boolean }
    | null
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
  useEffect(() => playback.setCanvas(show.canvas_width, show.canvas_height), [playback, show.canvas_width, show.canvas_height])
  useEffect(() => playback.setMedia(media), [playback, media])
  useEffect(() => playback.setTimelinePreview(timeline), [playback, timeline])
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
      if (place?.path && place.pins.length > 0) {
        // The path: a line through the points in order, with arrows the way it goes.
        ctx.strokeStyle = 'rgba(56,189,248,0.85)'
        ctx.lineWidth = 2 * unit
        ctx.setLineDash([6 * unit, 4 * unit])
        ctx.beginPath()
        place.pins.forEach((pin, i) => (i === 0 ? ctx.moveTo(pin.x * w, pin.y * h) : ctx.lineTo(pin.x * w, pin.y * h)))
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = '#38bdf8'
        for (let i = 1; i < place.pins.length; i++) {
          const a = place.pins[i - 1]
          const b = place.pins[i]
          const mx = ((a.x + b.x) / 2) * w
          const my = ((a.y + b.y) / 2) * h
          const ang = Math.atan2((b.y - a.y) * h, (b.x - a.x) * w)
          const s = 6 * unit
          ctx.beginPath()
          ctx.moveTo(mx + Math.cos(ang) * s, my + Math.sin(ang) * s)
          ctx.lineTo(mx + Math.cos(ang + 2.5) * s, my + Math.sin(ang + 2.5) * s)
          ctx.lineTo(mx + Math.cos(ang - 2.5) * s, my + Math.sin(ang - 2.5) * s)
          ctx.closePath()
          ctx.fill()
        }
        ctx.font = `${Math.round(9 * unit)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        place.pins.forEach((pin, i) => {
          ctx.fillStyle = '#0f172a'
          ctx.beginPath()
          ctx.arc(pin.x * w, pin.y * h, 7 * unit, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#e0f2fe'
          ctx.fillText(String(i + 1), pin.x * w, pin.y * h + 0.5)
        })
      }
      if (place) {
        // A dashed outline around each placed thing; the picked one is solid
        // and has a square handle to size it and a round one to turn it.
        place.pins.forEach((pin, i) => {
          const g = pinShape(place, pin, w, h, 6 * unit, HANDLE_GAP * unit)
          const picked = i === place.selected
          ctx.beginPath()
          if (g.corners) g.corners.forEach(([x, y], k) => (k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
          else ctx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2)
          ctx.closePath()
          ctx.lineWidth = (picked ? 2 : 1) * unit
          ctx.strokeStyle = picked ? '#38bdf8' : 'rgba(56,189,248,0.7)'
          ctx.setLineDash(picked ? [] : [3 * unit, 3 * unit])
          ctx.stroke()
          ctx.setLineDash([])
          if (!picked) return
          if (!place.path) {
            ctx.beginPath()
            ctx.moveTo(g.top[0], g.top[1])
            ctx.lineTo(g.turn[0], g.turn[1])
            ctx.stroke()
          }
          ctx.fillStyle = '#0f172a'
          ctx.lineWidth = 1.5 * unit
          const s = 4.5 * unit
          ctx.beginPath()
          ctx.rect(g.size[0] - s, g.size[1] - s, s * 2, s * 2)
          ctx.fill()
          ctx.stroke()
          if (place.path) return
          ctx.beginPath()
          ctx.arc(g.turn[0], g.turn[1], s, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
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

  /** The placed thing under the pointer, the nearest if several. */
  const pickPin = (p: Point) => {
    if (!placing) return null
    const rect = boxRef.current!.getBoundingClientRect()
    const x = p[0] * rect.width
    const y = p[1] * rect.height
    let best: number | null = null
    let bestD = Infinity
    placing.pins.forEach((pin, i) => {
      const g = pinShape(placing, pin, rect.width, rect.height, 12, HANDLE_GAP)
      const d = Math.hypot(x - g.cx, y - g.cy)
      const [lx, ly] = g.local(x, y)
      const inside = g.corners ? Math.abs(lx) <= g.hw && Math.abs(ly) <= g.hh : d < g.r
      if (inside && d < bestD) {
        bestD = d
        best = i
      }
    })
    return best as number | null
  }

  /** The picked thing's size or turn handle under the pointer. */
  const pickHandle = (p: Point): { kind: 'pin-size' } | { kind: 'pin-turn'; below: boolean } | null => {
    if (!placing || placing.selected == null) return null
    const pin = placing.pins[placing.selected]
    if (!pin) return null
    const rect = boxRef.current!.getBoundingClientRect()
    const unit = Math.max(1, rect.height / 300)
    const g = pinShape(placing, pin, rect.width, rect.height, 6 * unit, HANDLE_GAP * unit)
    const x = p[0] * rect.width
    const y = p[1] * rect.height
    const near = (q: [number, number]) => Math.hypot(x - q[0], y - q[1]) < Math.max(12, 8 * unit)
    if (!placing.path && near(g.turn)) return { kind: 'pin-turn', below: g.below }
    if (near(g.size)) return { kind: 'pin-size' }
    return null
  }

  /** A pointer position in the preview's own pixels, not clamped to it. */
  const toPixels = (event: React.PointerEvent): [number, number, number, number] => {
    const rect = boxRef.current!.getBoundingClientRect()
    return [event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height]
  }

  const onPointerDown = (event: React.PointerEvent) => {
    const p = toCanvas(event)
    if (placing && onPinsChange) {
      const handle = pickHandle(p)
      if (handle && placing.selected != null) {
        drag.current = { ...handle, index: placing.selected }
        ;(event.target as Element).setPointerCapture(event.pointerId)
        return
      }
      const hit = pickPin(p)
      if (hit != null) {
        onPinsChange(placing.pins, hit)
        // Keep the spot that was grabbed under the pointer while dragging.
        drag.current = { kind: 'pin', index: hit, dx: placing.pins[hit].x - p[0], dy: placing.pins[hit].y - p[1] }
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
      if (placing.max === 1 && placing.pins.length === 1) {
        // Only one allowed: a click elsewhere moves it there.
        onPinsChange([{ ...placing.pins[0], x: p[0], y: p[1] }], 0)
        return
      }
      if (placing.pins.length >= (placing.max ?? MAX_PINS)) {
        onPinsChange(placing.pins, null)
        return
      }
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
    else if (d.kind === 'pin' || d.kind === 'pin-size' || d.kind === 'pin-turn') {
      const pin = placing?.pins[d.index]
      if (!placing || !onPinsChange || !pin) return
      let next: ObjectPin
      if (d.kind === 'pin') {
        next = { ...pin, x: clamp01(p[0] + d.dx), y: clamp01(p[1] + d.dy) }
      } else {
        const [x, y, width, height] = toPixels(event)
        const g = pinShape(placing, { ...pin, size: 1 }, width, height, 0, 0)
        if (d.kind === 'pin-size') {
          // The size handle's distance from the middle at size 1 is g.reach.
          const size = Math.hypot(x - g.cx, y - g.cy) / Math.max(1, g.reach)
          const [least, most] = placing.sizeRange ?? [0.3, 3]
          next = { ...pin, size: Math.round(Math.min(most, Math.max(least, size)) * 100) / 100 }
        } else {
          // The turn handle sits straight above (or below) the middle when not turned.
          let deg = (Math.atan2(y - g.cy, x - g.cx) * 180) / Math.PI + (d.below ? -90 : 90)
          if (deg > 180) deg -= 360
          if (deg < -180) deg += 360
          // Settle on straight and on quarter turns when close.
          const square = Math.round(deg / 90) * 90
          if (Math.abs(deg - square) < 4) deg = square === -180 ? 180 : square
          next = { ...pin, rotation: Math.round(deg) }
        }
      }
      onPinsChange(placing.pins.map((q, i) => (i === d.index ? next : q)), d.index)
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

  // One projector's view is the whole picture blown up behind a window the
  // shape of that projector, so pointer positions (read from the picture's
  // own on-screen box) stay in canvas fractions.
  const shape = view ? view.aspect : show.canvas_width / show.canvas_height
  const inner: React.CSSProperties = view
    ? {
        position: 'absolute',
        width: `${100 / view.source.w}%`,
        height: `${100 / view.source.h}%`,
        left: `${(-100 * view.source.x) / view.source.w}%`,
        top: `${(-100 * view.source.y) / view.source.h}%`,
      }
    : { position: 'absolute', inset: 0 }
  return (
    <div
      className="relative mx-auto overflow-hidden rounded-md bg-black ring-1 ring-white/10"
      // As wide as there is room for, but short enough to leave its controls in view.
      style={{ aspectRatio: `${shape}`, width: `min(100%, calc(52vh * ${shape}))` }}
    >
    <div
      ref={boxRef}
      className={classNames(
        drawing || placing ? 'cursor-crosshair' : peopleSource === 'simulated' || showSurfaces ? 'cursor-pointer' : '',
      )}
      style={inner}
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
      {overlay && <div className="pointer-events-none absolute inset-0">{overlay}</div>}
      {picker}
    </div>
    </div>
  )
}
