import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { Panel } from '@/components/ui'
import { classNames } from '@/lib/format'
import { mappingApi, mediaUrl, snapshotUrl, uploadMedia } from '../api'
import { applyHomography, invertHomography, isConvex, squareToQuad } from '../geometry'
import type { AiStatus, HousePhoto, Point, Show, Surface, SurfaceKind, TracedHouse } from '../types'
import { SURFACE_KINDS } from './ScenePreview'

/** Longest side kept in the media library. */
const KEEP_SIDE = 2048
/** Longest side sent to Claude; larger pictures are scaled down on its side anyway. */
const TRACE_SIDE = 1568
/** Room around the photo, in photo widths and heights, for corners past its edges. */
const PAD = 0.12
/** The show takes this many parts. */
const MAX_SURFACES = 64
/** While a corner is dragged, the parts are saved this often, so the house follows. */
const LIVE_SAVE_MS = 250

const FULL_FRAME: Point[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]
const CORNER_NAMES = ['top left', 'top right', 'bottom right', 'bottom left']
const KIND_COLOR = Object.fromEntries(SURFACE_KINDS.map((k) => [k.id, k.color])) as Record<SurfaceKind, string>

const THEMES = [
  { label: 'Halloween', prompt: 'A spooky but friendly Halloween scene' },
  { label: 'Christmas', prompt: 'A cosy Christmas scene' },
  { label: 'Thanksgiving', prompt: 'A warm autumn harvest scene' },
  { label: 'Winter', prompt: 'A frosty winter wonderland scene' },
  { label: 'Party', prompt: 'A colourful birthday party scene' },
]

type Drag = { kind: 'corner'; index: number; corners: Point[]; surfaces: Surface[] } | { kind: 'point'; id: string; index: number }

const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v))
/** Canvas points the show accepts (the server allows 4 canvases past each edge). */
const onCanvas = ([x, y]: Point): Point => [clamp(x, -4, 5), clamp(y, -4, 5)]
const newId = () => Math.random().toString(36).slice(2, 10)

/** A part with every canvas point moved, its flat-object corners too when it has them. */
function moveSurface(surface: Surface, move: (p: Point) => Point): Surface {
  const { flat } = surface
  return {
    ...surface,
    points: surface.points.map((p) => onCanvas(move(p))),
    ...(flat ? { flat: { ...flat, corners: flat.corners.map((p) => onCanvas(move(p))) } } : {}),
  }
}

/** The picture drawn onto a canvas no bigger than ``side``, and its size. */
function scaled(img: HTMLImageElement, side: number) {
  const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = src
  await img.decode()
  return img
}

/**
 * Start from a photo of the house: take or pick one, let Claude find the
 * walls, roof, windows and doors on it (or trace them by hand), line the
 * photo up with the canvas by dragging its four corners, then make a scene
 * for those parts.
 *
 * The parts are the show's house parts, shown on the photo. Dragging a
 * corner keeps every part where it is on the house in the photo and moves
 * it on the canvas, saved as it goes, so a scene playing on the house
 * follows along.
 */
export function HousePhotoPanel({
  show,
  surfaces,
  ai,
  canEdit,
  busy,
  onSurfacesChange,
  onSurfacesSaved,
  onDescribe,
  onStartNew,
  reloadMedia,
  onError,
}: {
  show: Show
  surfaces: Surface[]
  ai: AiStatus | null
  canEdit: boolean
  busy: boolean
  onSurfacesChange: (next: Surface[]) => void
  /** After parts were saved: reload the show. */
  onSurfacesSaved: () => Promise<void> | void
  onDescribe: (prompt: string) => void
  onStartNew: () => void
  reloadMedia: () => Promise<unknown>
  onError: (message: string | null) => void
}) {
  const [lineup, setLineup] = useState<HousePhoto | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [found, setFound] = useState<TracedHouse | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [drawing, setDrawing] = useState<{ kind: SurfaceKind; points: Point[] } | null>(null)
  const [theme, setTheme] = useState('')
  const [drag, setDrag] = useState<Drag | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const liveTimer = useRef<number | null>(null)
  const livePending = useRef<Surface[] | null>(null)
  // The click that ends a drag is not a click on the photo.
  const justDragged = useRef(false)

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    mappingApi
      .getHousePhoto(show.id)
      .then((saved) => !cancelled && setLineup(saved))
      .catch(() => !cancelled && setLineup(null))
      .finally(() => !cancelled && setLoaded(true))
    return () => {
      cancelled = true
    }
  }, [show.id])

  useEffect(() => {
    let cancelled = false
    setPhoto(null)
    if (lineup) {
      loadImage(mediaUrl(lineup.media_id)).then(
        (img) => !cancelled && setPhoto(img),
        () => !cancelled && onError('The photo of the house could not be loaded. Take or choose it again.'),
      )
    }
    return () => {
      cancelled = true
    }
    // Only a different photo needs loading, not moved corners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineup?.media_id])

  useEffect(() => () => window.clearTimeout(liveTimer.current ?? undefined), [])

  // Photo units per screen pixel.
  const [unit, setUnit] = useState(1.5)
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const measure = () => svg.clientWidth && setUnit(((1 + 2 * PAD) * 1000) / svg.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [lineup != null])

  const corners = lineup?.corners ?? FULL_FRAME
  // Canvas → photo, and back.
  const toPhoto = useMemo(() => squareToQuad(corners), [corners])
  const toCanvas = useMemo(() => invertHomography(toPhoto), [toPhoto])
  const aspect = photo ? photo.naturalHeight / photo.naturalWidth : 0.66
  const W = 1000
  const H = W * aspect
  const view = `${-PAD * W} ${-PAD * H} ${(1 + 2 * PAD) * W} ${(1 + 2 * PAD) * H}`
  const px = ([x, y]: Point) => `${x * W},${y * H}`

  const run = async (label: string, work: () => Promise<unknown>) => {
    setWorking(label)
    onError(null)
    try {
      await work()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setWorking(null)
    }
  }

  const saveLineup = async (next: HousePhoto) => {
    setLineup(next)
    await mappingApi.saveHousePhoto(show.id, next)
  }

  const saveParts = async (next: Surface[]) => {
    onSurfacesChange(next)
    await mappingApi.saveSurfaces(show.id, next)
    await onSurfacesSaved()
  }

  /** Keep a picture of the house in the media library and start lining it up. */
  const keepPicture = (img: HTMLImageElement, name: string, start: Point[]) =>
    run('photo', async () => {
      const canvas = scaled(img, KEEP_SIDE)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
      if (!blob) throw new Error('The photo could not be read')
      const file = new File([blob], name, { type: 'image/jpeg' })
      const asset = await uploadMedia(file, { width: canvas.width, height: canvas.height, duration: null }, () => undefined)
      await reloadMedia()
      setFound(null)
      setSelected(null)
      await saveLineup({ media_id: asset.id, corners: start, description: '' })
    })

  const pickFile = async (file: File) => {
    const url = URL.createObjectURL(file)
    try {
      const img = await loadImage(url)
      await keepPicture(img, 'House photo.jpg', FULL_FRAME)
    } catch {
      onError('That file is not a photo this browser can open. Try a JPEG or PNG.')
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const takeCameraPhoto = async () => {
    const view = show.camera_view
    if (!view) return
    try {
      const img = await loadImage(snapshotUrl(view.camera_id, Date.now()))
      // The Camera page already knows where the canvas is on its photo.
      await keepPicture(img, 'House photo (camera).jpg', view.corners)
    } catch {
      onError('Could not get a photo from the camera. Check it on the Camera page.')
    }
  }

  const findParts = () =>
    run('trace', async () => {
      if (!photo || !lineup) return
      const canvas = scaled(photo, TRACE_SIDE)
      const traced = await mappingApi.traceHousePhoto({
        image: canvas.toDataURL('image/jpeg', 0.9),
        width: canvas.width,
        height: canvas.height,
      })
      setFound(traced)
      setSelected(null)
      if (traced.description) await saveLineup({ ...lineup, description: traced.description })
    })

  const acceptFound = (replace: boolean) =>
    run('parts', async () => {
      if (!found) return
      const made: Surface[] = found.parts.map((part) => ({
        id: newId(),
        name: part.name,
        kind: part.kind,
        points: part.points.map((p) => onCanvas(applyHomography(toCanvas, p[0], p[1]))),
      }))
      const next = (replace ? made : [...surfaces, ...made]).slice(0, MAX_SURFACES)
      await saveParts(next)
      setFound(null)
    })

  const finishDrawing = () =>
    run('parts', async () => {
      if (!drawing || drawing.points.length < 3) {
        setDrawing(null)
        return
      }
      const label = SURFACE_KINDS.find((k) => k.id === drawing.kind)!.label
      const same = surfaces.filter((s) => s.kind === drawing.kind).length
      const part: Surface = {
        id: newId(),
        name: `${label} ${same + 1}`,
        kind: drawing.kind,
        points: drawing.points.map((p) => onCanvas(applyHomography(toCanvas, p[0], p[1]))),
      }
      setDrawing(null)
      await saveParts([...surfaces, part].slice(0, MAX_SURFACES))
      setSelected(part.id)
    })

  // -- dragging -------------------------------------------------------------------

  const pointAt = (event: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current!.getBoundingClientRect()
    return [
      -PAD + ((event.clientX - rect.left) / rect.width) * (1 + 2 * PAD),
      -PAD + ((event.clientY - rect.top) / rect.height) * (1 + 2 * PAD),
    ]
  }

  const saveLive = (next: Surface[]) => {
    livePending.current = next
    if (liveTimer.current != null) return
    liveTimer.current = window.setTimeout(() => {
      liveTimer.current = null
      const pending = livePending.current
      livePending.current = null
      if (pending) void mappingApi.saveSurfaces(show.id, pending).catch(() => undefined)
    }, LIVE_SAVE_MS)
  }

  const startDrag = (event: ReactPointerEvent, next: Drag) => {
    if (!canEdit || drawing) return
    event.stopPropagation()
    event.preventDefault()
    svgRef.current?.setPointerCapture(event.pointerId)
    setDrag(next)
  }

  const onMove = (event: ReactPointerEvent) => {
    if (!drag || !lineup) return
    const [x, y] = pointAt(event)
    if (drag.kind === 'corner') {
      const moved = drag.corners.map((c, i) => (i === drag.index ? [clamp(x, -PAD, 1 + PAD), clamp(y, -PAD, 1 + PAD)] : c)) as Point[]
      if (!isConvex(moved)) return
      // Every part stays where it is on the photo, so it moves on the canvas.
      const before = squareToQuad(drag.corners)
      const after = invertHomography(squareToQuad(moved))
      const next = drag.surfaces.map((s) =>
        moveSurface(s, ([u, v]) => {
          const [px2, py2] = applyHomography(before, u, v)
          return applyHomography(after, px2, py2)
        }),
      )
      setLineup({ ...lineup, corners: moved })
      onSurfacesChange(next)
      saveLive(next)
    } else {
      const canvasPoint = onCanvas(applyHomography(toCanvas, clamp(x, -PAD, 1 + PAD), clamp(y, -PAD, 1 + PAD)))
      onSurfacesChange(
        surfaces.map((s) => (s.id === drag.id ? { ...s, points: s.points.map((p, i) => (i === drag.index ? canvasPoint : p)) } : s)),
      )
    }
  }

  const endDrag = () => {
    if (!drag || !lineup) return
    setDrag(null)
    justDragged.current = true
    window.setTimeout(() => (justDragged.current = false), 300)
    window.clearTimeout(liveTimer.current ?? undefined)
    liveTimer.current = null
    livePending.current = null
    void run('save', async () => {
      if (drag.kind === 'corner') await mappingApi.saveHousePhoto(show.id, lineup)
      await saveParts(surfaces)
    })
  }

  const onPhotoClick = (event: ReactMouseEvent) => {
    if (justDragged.current) {
      justDragged.current = false
      return
    }
    if (drawing) {
      const [x, y] = pointAt(event)
      if (x < -PAD || y < -PAD || x > 1 + PAD || y > 1 + PAD) return
      const first = drawing.points[0]
      // Clicking near the first point closes the outline.
      if (first && drawing.points.length >= 3 && Math.hypot(first[0] - x, (first[1] - y) * aspect) < 0.02) {
        void finishDrawing()
        return
      }
      setDrawing({ ...drawing, points: [...drawing.points, [x, y]] })
    } else {
      setSelected(null)
    }
  }

  // -- what is shown ------------------------------------------------------------------

  const shown = surfaces.map((s) => ({
    surface: s,
    points: s.points.map(([u, v]) => applyHomography(toPhoto, u, v)),
  }))
  const picked = shown.find((s) => s.surface.id === selected)
  const counts = (parts: Array<{ kind: SurfaceKind }>) => {
    const by = new Map<SurfaceKind, number>()
    for (const p of parts) by.set(p.kind, (by.get(p.kind) ?? 0) + 1)
    return SURFACE_KINDS.filter((k) => by.has(k.id))
      .map((k) => `${by.get(k.id)} ${k.label.toLowerCase()}${by.get(k.id)! > 1 ? 's' : ''}`)
      .join(', ')
  }
  // Handles and labels keep their size on screen, however wide the photo is shown.
  const handle = 10 * unit
  const disabled = busy || working != null

  if (!loaded) return null

  return (
    <div className="space-y-4">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void pickFile(file)
        }}
      />

      <Panel
        title="Start from a photo of the house"
        description="Take a photo of the house in daylight from the street. Claude finds the walls, roof, windows and doors, you line the photo up with the projectors, and a scene decorates each part."
        action={
          canEdit && lineup ? (
            <div className="flex gap-2">
              <button className="btn-default px-2 py-1 text-xs" disabled={disabled} onClick={() => fileRef.current?.click()}>
                New photo
              </button>
              {show.camera_view && (
                <button className="btn-ghost px-2 py-1 text-xs" disabled={disabled} onClick={() => void takeCameraPhoto()}>
                  Camera photo
                </button>
              )}
            </div>
          ) : undefined
        }
      >
        {!lineup ? (
          canEdit ? (
            <div className="space-y-3">
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
                <li>Take or choose a photo of the front of the house.</li>
                <li>Claude finds the walls, roof, windows and doors on it (or you trace them by hand).</li>
                <li>Drag the photo's four blue corners to where the edges of the projected picture are.</li>
                <li>Make a scene: objects on the windows and door, lights on the roof, all reacting to people.</li>
              </ol>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" disabled={disabled} onClick={() => fileRef.current?.click()}>
                  {working === 'photo' ? 'Saving the photo…' : 'Take or choose a photo'}
                </button>
                {show.camera_view && (
                  <button className="btn-default" disabled={disabled} onClick={() => void takeCameraPhoto()}>
                    Use the camera's photo
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500">
                On a phone, this opens the camera. Stand where people watch from, with the whole front of the house in the picture.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No photo of the house yet.</p>
          )
        ) : (
          <div className="space-y-3">
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                {ai?.available ? (
                  <button className="btn-primary px-3 py-1 text-xs" disabled={disabled || !photo} onClick={() => void findParts()}>
                    {working === 'trace' ? 'Claude is looking at the photo…' : surfaces.length || found ? 'Find the parts again' : 'Find the walls, roof, windows and doors'}
                  </button>
                ) : ai ? (
                  <span className="text-xs text-slate-400">
                    To have Claude find the parts, add an Anthropic key in{' '}
                    <Link className="text-sky-300 hover:underline" to="/settings?part=ai">Settings → AI keys</Link>. You can trace them by hand meanwhile.
                  </span>
                ) : null}
                {working === 'trace' && <span className="text-xs text-slate-500">This takes up to a minute, about 5 cents.</span>}
              </div>
            )}

            {found && (
              <div className="space-y-2 rounded-md bg-sky-500/10 p-3 text-sm text-sky-50 ring-1 ring-sky-500/30">
                <p>
                  Claude found {counts(found.parts)} (dashed on the photo).
                  {found.description && <span className="text-sky-100/70"> {found.description}</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary px-3 py-1 text-xs" disabled={disabled} onClick={() => void acceptFound(true)}>
                    {surfaces.length ? `Use these instead of your ${surfaces.length} part${surfaces.length === 1 ? '' : 's'}` : 'Use these parts'}
                  </button>
                  {surfaces.length > 0 && (
                    <button className="btn-default px-3 py-1 text-xs" disabled={disabled} onClick={() => void acceptFound(false)}>
                      Add them to your parts
                    </button>
                  )}
                  <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setFound(null)}>Discard</button>
                </div>
              </div>
            )}

            <div className="relative mx-auto overflow-hidden rounded-md bg-black ring-1 ring-white/10"
              style={{ maxWidth: `${(70 / aspect).toFixed(1)}vh` }}>
              <svg
                ref={svgRef}
                viewBox={view}
                className={classNames('block w-full touch-none select-none', drawing && 'cursor-crosshair')}
                onPointerMove={onMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onClick={onPhotoClick}
                role="img"
                aria-label="Photo of the house with its parts"
              >
                {photo && <image href={photo.src} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />}
                {/* Outside the projected picture is darkened. */}
                <path
                  d={`M${-PAD * W},${-PAD * H}H${(1 + PAD) * W}V${(1 + PAD) * H}H${-PAD * W}Z M${corners.map(px).join(' L')} Z`}
                  fill="rgba(0,0,0,0.55)"
                  fillRule="evenodd"
                  pointerEvents="none"
                />
                {shown.map(({ surface, points }) => (
                  <polygon
                    key={surface.id}
                    points={points.map(px).join(' ')}
                    fill={KIND_COLOR[surface.kind]}
                    fillOpacity={surface.id === selected ? 0.35 : 0.18}
                    stroke={KIND_COLOR[surface.kind]}
                    strokeWidth={surface.id === selected ? 3 : 2}
                    vectorEffect="non-scaling-stroke"
                    className={canEdit && !drawing ? 'cursor-pointer' : undefined}
                    onClick={(e) => {
                      if (drawing) return
                      e.stopPropagation()
                      setSelected(surface.id)
                    }}
                  />
                ))}
                {found?.parts.map((part, i) => (
                  <polygon
                    key={`found${i}`}
                    points={part.points.map(px).join(' ')}
                    fill={KIND_COLOR[part.kind]}
                    fillOpacity={0.12}
                    stroke={KIND_COLOR[part.kind]}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                ))}
                <polygon points={corners.map(px).join(' ')} fill="none" stroke="#38bdf8" strokeWidth={2}
                  strokeDasharray="10 6" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                {picked && canEdit && !drawing &&
                  picked.points.map((p, i) => (
                    <circle key={i} cx={p[0] * W} cy={p[1] * H} r={handle * 0.7} fill="#fff" stroke={KIND_COLOR[picked.surface.kind]}
                      strokeWidth={2 * unit} className="cursor-move" onPointerDown={(e) => startDrag(e, { kind: 'point', id: picked.surface.id, index: i })} />
                  ))}
                {drawing && (
                  <>
                    <polyline points={drawing.points.map(px).join(' ')} fill="none" stroke={KIND_COLOR[drawing.kind]} strokeWidth={2}
                      vectorEffect="non-scaling-stroke" pointerEvents="none" />
                    {drawing.points.map((p, i) => (
                      <circle key={i} cx={p[0] * W} cy={p[1] * H} r={handle * 0.5} fill={KIND_COLOR[drawing.kind]} pointerEvents="none" />
                    ))}
                  </>
                )}
                {canEdit &&
                  !drawing &&
                  corners.map((c, i) => (
                    <g key={i} className="cursor-move" onPointerDown={(e) => startDrag(e, { kind: 'corner', index: i, corners, surfaces })}>
                      <circle cx={c[0] * W} cy={c[1] * H} r={handle * 2.2} fill="transparent" />
                      <circle cx={c[0] * W} cy={c[1] * H} r={handle} fill="#0ea5e9" stroke="#fff" strokeWidth={2 * unit} />
                      <text x={c[0] * W} y={c[1] * H + (i < 2 ? handle * 2.6 : -handle * 1.6)} textAnchor="middle" fontSize={13 * unit}
                        fill="#e0f2fe" stroke="#0c4a6e" strokeWidth={3 * unit} paintOrder="stroke" pointerEvents="none">
                        {CORNER_NAMES[i]}
                      </text>
                    </g>
                  ))}
              </svg>
              {!photo && <p className="absolute inset-0 grid place-items-center text-sm text-slate-500">Loading the photo…</p>}
            </div>

            {canEdit && (
              <div className="space-y-2 text-xs text-slate-400">
                <p>
                  <span className="font-medium text-slate-200">Line it up:</span> drag the four blue corners to where the corners of the projected
                  picture land on the house. Easiest at dusk: put the projectors on White (Players page) and match the corners to the light. If a scene is
                  playing, it moves on the house as you drag.
                </p>
                {drawing ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span>Click around the {SURFACE_KINDS.find((k) => k.id === drawing.kind)!.label.toLowerCase()} on the photo, corner by corner.</span>
                    <button className="btn-primary px-2 py-1 text-xs" disabled={drawing.points.length < 3 || disabled} onClick={() => void finishDrawing()}>
                      Finish ({drawing.points.length} points)
                    </button>
                    <button className="btn-ghost px-2 py-1 text-xs" disabled={!drawing.points.length}
                      onClick={() => setDrawing({ ...drawing, points: drawing.points.slice(0, -1) })}>
                      Undo point
                    </button>
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setDrawing(null)}>Cancel</button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span>Trace by hand:</span>
                    {SURFACE_KINDS.map((k) => (
                      <button key={k.id} className="btn-default px-2 py-0.5 text-xs" disabled={disabled}
                        onClick={() => {
                          setSelected(null)
                          setDrawing({ kind: k.id, points: [] })
                        }}>
                        <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: k.color }} />
                        {k.label}
                      </button>
                    ))}
                  </div>
                )}
                {picked && !drawing && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md bg-panel-850 p-2 ring-1 ring-white/5">
                    <span className="text-slate-200">{picked.surface.name}</span>
                    <span>Drag its white points to fix the outline.</span>
                    <button className="btn-ghost px-2 py-0.5 text-xs text-red-300" disabled={disabled}
                      onClick={() => {
                        setSelected(null)
                        void run('parts', () => saveParts(surfaces.filter((s) => s.id !== picked.surface.id)))
                      }}>
                      Remove this part
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Panel>

      {lineup && canEdit && surfaces.length > 0 && (
        <Panel
          title="Make a scene for these parts"
          description={`${counts(surfaces)} on the house. Objects go on the windows and doors, lights along the roof, and everything reacts to people.`}
        >
          {ai?.available ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (theme.trim().length < 3) return
                const house = lineup.description ? ` The house: ${lineup.description}` : ''
                onDescribe(
                  `${theme.trim()}.${house} Decorate the traced parts separately: objects on the windows and the doors, ` +
                    'lights or trim along the roof, things on the walls, and people effects on top.',
                )
              }}
            >
              <div className="flex flex-wrap gap-2">
                {THEMES.map((t) => (
                  <button key={t.label} type="button"
                    className={classNames('rounded-full px-3 py-1 text-xs ring-1', theme === t.prompt ? 'bg-sky-500/20 text-sky-50 ring-sky-500/40' : 'bg-panel-850 text-slate-300 ring-white/10 hover:bg-panel-800')}
                    onClick={() => setTheme(t.prompt)}>
                    {t.label}
                  </button>
                ))}
              </div>
              <input className="input text-sm" maxLength={600} placeholder="Or describe it: pumpkins in the windows, bats over the roof, a ghost at the door"
                value={theme} onChange={(e) => setTheme(e.target.value)} />
              <button className="btn-primary px-3 py-1 text-xs" disabled={disabled || theme.trim().length < 3}>
                Make the scene
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span>Ready-made scenes already decorate the walls, roof, windows and doors separately.</span>
              <button className="btn-primary px-3 py-1 text-xs" disabled={disabled} onClick={onStartNew}>
                Pick a ready-made scene
              </button>
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}
