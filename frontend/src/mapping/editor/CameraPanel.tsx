import { useCallback, useEffect, useRef, useState } from 'react'
import { request } from '@/api/client'
import type { BusMessage } from '@/api/types'
import { classNames } from '@/lib/format'
import { mappingApi, snapshotUrl } from '../api'
import type {
  ApplyResult,
  CalibrationStepMessage,
  Output,
  PeopleMessage,
  Person,
  Point,
  Show,
} from '../types'
import type { Player } from './PlayersPanel'
import { outputColor } from './panels'

const DEFAULT_CORNERS: Point[] = [
  [0.15, 0.15],
  [0.85, 0.15],
  [0.85, 0.85],
  [0.15, 0.85],
]
const CORNER_LABELS = ['TL', 'TR', 'BR', 'BL']

type Progress = Pick<CalibrationStepMessage, 'step' | 'steps' | 'status' | 'message'>

/**
 * The camera pointed at the building: line the show up with it, let it
 * calibrate each projector, and see who it is tracking.
 */
export function CameraPanel({
  show,
  outputs,
  canEdit,
  feed,
  refreshKey,
  onError,
  onShowChanged,
}: {
  show: Show
  outputs: Output[]
  canEdit: boolean
  /** Mapping messages from the page's live feed. */
  feed: EventTarget
  refreshKey: number
  onError: (message: string) => void
  onShowChanged: () => void
}) {
  const [cameras, setCameras] = useState<Player[] | null>(null)
  const [cameraId, setCameraId] = useState<number | null>(show.camera_view?.camera_id ?? null)
  const [photo, setPhoto] = useState<number>(() => Date.now())
  const [hasPhoto, setHasPhoto] = useState(true)
  const [corners, setCorners] = useState<Point[]>(show.camera_view?.corners ?? DEFAULT_CORNERS)
  const [progress, setProgress] = useState<Map<number, Progress>>(new Map())
  const [people, setPeople] = useState<Person[]>([])
  const [mesh, setMesh] = useState(9)
  const [results, setResults] = useState<ApplyResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const peopleTimer = useRef<number>()

  const load = useCallback(async () => {
    try {
      const list = (await request<Player[]>('/mapping/players')).filter((p) => p.kind === 'camera' && p.approved)
      setCameras(list)
      setCameraId((current) => (current != null && list.some((c) => c.id === current) ? current : list[0]?.id ?? null))
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load cameras')
    }
  }, [onError])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 5000)
    return () => window.clearInterval(timer)
  }, [load, refreshKey])

  // A different show, or the same show marked from another screen.
  useEffect(() => {
    setCorners(show.camera_view?.corners ?? DEFAULT_CORNERS)
    if (show.camera_view) setCameraId(show.camera_view.camera_id)
  }, [show.id, show.camera_view])

  useEffect(() => {
    const onMessage = (event: Event) => {
      const message = (event as CustomEvent<BusMessage>).detail
      const payload = message.payload as Record<string, unknown>
      if (payload.camera_id !== cameraId) return
      if (message.type === 'mapping_camera') {
        setPhoto(Date.now())
        setHasPhoto(true)
      } else if (message.type === 'mapping_calib_pattern') {
        const step = payload as unknown as CalibrationStepMessage
        setProgress((current) => new Map(current).set(step.output_id, step))
      } else if (message.type === 'mapping_people') {
        setPeople((payload as unknown as PeopleMessage).people)
        window.clearTimeout(peopleTimer.current)
        peopleTimer.current = window.setTimeout(() => setPeople([]), 1500)
      }
    }
    feed.addEventListener('message', onMessage)
    return () => feed.removeEventListener('message', onMessage)
  }, [feed, cameraId])

  const camera = cameras?.find((c) => c.id === cameraId) ?? null

  const guard = async (action: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await action()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'That did not work')
    } finally {
      setBusy(false)
    }
  }

  const saveCorners = (next: Point[]) =>
    guard(async () => {
      if (cameraId == null) return
      await mappingApi.updateShow(show.id, { camera_view: { camera_id: cameraId, corners: next } })
      onShowChanged()
    })

  const calibrate = (output: Output) =>
    guard(async () => {
      if (cameraId == null) return
      setProgress((current) => new Map(current).set(output.id, { step: 0, steps: 0, status: 'running', message: 'Starting…' }))
      await mappingApi.calibrate(output.id, cameraId)
    })

  const applyAll = () =>
    guard(async () => {
      setResults(await mappingApi.applyCalibration(show.id, mesh))
      onShowChanged()
    })

  if (cameras === null) return <p className="text-sm text-slate-400">Loading cameras…</p>

  if (cameras.length === 0) {
    return (
      <div className="space-y-2 text-sm text-slate-400">
        <p>No camera is paired yet.</p>
        <p>
          On the computer the camera is plugged into, run the camera program from the <code>camera-agent</code>{' '}
          folder of the repository. It prints a pairing code; approve that code on the Players tab.
        </p>
      </div>
    )
  }

  const calibrating = [...progress.values()].some((p) => p.status === 'running')
  const marked = show.camera_view?.camera_id === cameraId

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {cameras.length > 1 ? (
          <select className="input w-auto py-1 text-sm" value={cameraId ?? ''}
            onChange={(event) => setCameraId(Number(event.target.value))}>
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        ) : (
          <span className="text-sm font-medium text-slate-200">{camera?.name}</span>
        )}
        <span className={classNames('text-xs', camera?.online ? 'text-emerald-300' : 'text-red-300')}>
          {camera?.online ? `online · ${camera.report.activity ?? 'idle'}` : 'offline'}
        </span>
        {camera?.report.camera && <span className="text-xs text-slate-500">{camera.report.camera}</span>}
        <div className="ml-auto flex gap-2">
          <button className="btn-default text-xs" disabled={!canEdit || !camera?.online || busy || calibrating}
            onClick={() => guard(() => mappingApi.cameraCommand(cameraId!, 'snapshot'))}>
            Take photo
          </button>
          {camera?.report.depth && (
            <button className="btn-ghost text-xs" disabled={!canEdit || !camera.online || busy}
              title="Re-learn the empty scene, so only people count. Clear the area first."
              onClick={() => guard(() => mappingApi.cameraCommand(cameraId!, 'background'))}>
              Re-learn empty scene
            </button>
          )}
        </div>
      </div>

      <ol className="list-inside list-decimal space-y-0.5 text-xs text-slate-400">
        <li>Point the camera at the building, fix it in place, and take a photo.</li>
        <li>Drag the four corners onto where the canvas corners are on the building.</li>
        <li>Calibrate each output. Its projector shows stripes for about half a minute; keep the camera still.</li>
        <li>Apply to outputs. Fine-tune by hand afterwards if needed.</li>
      </ol>

      <CornerPhoto
        src={cameraId != null && hasPhoto ? snapshotUrl(cameraId, photo) : null}
        onMissing={() => setHasPhoto(false)}
        corners={corners}
        people={people}
        editable={canEdit}
        onChange={setCorners}
        onCommit={(next) => void saveCorners(next)}
      />
      {!marked && canEdit && (
        <p className="text-xs text-amber-300">The corners are not saved for this camera yet: drag one to save them.</p>
      )}

      <div className="space-y-2">
        {outputs.map((output, index) => {
          const state = progress.get(output.id)
          const running = state?.status === 'running'
          return (
            <div key={output.id} className="flex flex-wrap items-center gap-3 rounded-md bg-panel-850 px-3 py-2 ring-1 ring-white/5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: outputColor(index) }} />
              <span className="text-sm text-slate-200">{output.name}</span>
              <span className="text-xs text-slate-500">
                {output.calibration
                  ? `calibrated ${new Date(output.calibration.captured_at).toLocaleString()} · ${Math.round(output.calibration.coverage * 100)}% of the photo`
                  : 'not calibrated'}
              </span>
              {state && (
                <span className={classNames('text-xs', state.status === 'failed' ? 'text-red-300' : running ? 'text-sky-300' : 'text-emerald-300')}>
                  {running && state.steps ? `${state.step + 1} / ${state.steps}` : ''} {state.message}
                </span>
              )}
              {running && state.steps > 0 && (
                <div className="h-1 w-24 overflow-hidden rounded bg-panel-700">
                  <div className="h-full bg-sky-400" style={{ width: `${((state.step + 1) / state.steps) * 100}%` }} />
                </div>
              )}
              <button className="btn-default ml-auto px-3 py-1 text-xs"
                disabled={!canEdit || !camera?.online || busy || calibrating}
                onClick={() => void calibrate(output)}>
                {output.calibration ? 'Calibrate again' : 'Calibrate'}
              </button>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-400"
          title="Control points per side. More follows a curved or uneven wall more closely.">
          Mesh
          <select className="input w-auto py-1 text-xs" value={mesh} onChange={(event) => setMesh(Number(event.target.value))}>
            <option value={2}>Corners only</option>
            <option value={5}>5 × 5</option>
            <option value={9}>9 × 9</option>
            <option value={17}>17 × 17</option>
          </select>
        </label>
        <button className="btn-primary text-xs"
          disabled={!canEdit || busy || calibrating || !marked || !outputs.some((o) => o.calibration?.camera_id === cameraId)}
          onClick={() => void applyAll()}>
          Apply to outputs
        </button>
        <span className="text-xs text-slate-500">Replaces each calibrated output's warp; masks, blends and colour stay.</span>
      </div>
      {results && (
        <ul className="space-y-1 text-xs">
          {results.map((r) => (
            <li key={r.output_id} className={r.applied ? 'text-emerald-300' : 'text-amber-300'}>
              {r.name}:{' '}
              {r.applied
                ? `applied · ${Math.round(r.measured * 100)}% of points measured · ${r.residual_px.toFixed(1)} px off a flat wall`
                : r.reason}
            </li>
          ))}
        </ul>
      )}

      {camera?.report.depth && (
        <p className="text-xs text-slate-500">
          {people.length ? `Tracking ${people.length} ${people.length === 1 ? 'person' : 'people'}. ` : 'Nobody in view. '}
          Pick an effect per cue under Cues → People.
        </p>
      )}
    </div>
  )
}

/** The camera photo with the canvas outline on it and draggable corners. */
function CornerPhoto({
  src,
  onMissing,
  corners,
  people,
  editable,
  onChange,
  onCommit,
}: {
  src: string | null
  onMissing: () => void
  corners: Point[]
  people: Person[]
  editable: boolean
  onChange: (corners: Point[]) => void
  onCommit: (corners: Point[]) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const dragging = useRef<number | null>(null)
  const latest = useRef(corners)
  latest.current = corners

  const at = (event: React.PointerEvent): Point => {
    const rect = box.current!.getBoundingClientRect()
    const clamp = (v: number) => Math.min(1.5, Math.max(-0.5, v))
    return [clamp((event.clientX - rect.left) / rect.width), clamp((event.clientY - rect.top) / rect.height)]
  }

  return (
    <div
      ref={box}
      className="relative w-full select-none overflow-hidden rounded-md bg-black ring-1 ring-white/10"
      style={{ aspectRatio: src ? undefined : '16 / 9', touchAction: 'none' }}
      onPointerMove={(event) => {
        if (dragging.current == null) return
        const next = latest.current.map((p, i) => (i === dragging.current ? at(event) : p))
        onChange(next)
      }}
      onPointerUp={() => {
        if (dragging.current != null) onCommit(latest.current)
        dragging.current = null
      }}
    >
      {src ? (
        <img src={src} alt="What the camera sees" className="block w-full" draggable={false} onError={onMissing} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
          No photo yet. Press Take photo.
        </div>
      )}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
        <polygon
          points={corners.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="rgba(56, 189, 248, 0.12)"
          stroke="rgb(56, 189, 248)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {people.map((p) => (
        <span key={p.id} className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400 ring-2 ring-black"
          style={{ left: `${p.cx * 100}%`, top: `${p.cy * 100}%` }} title={p.z != null ? `${p.z.toFixed(1)} m` : undefined} />
      ))}
      {corners.map(([x, y], i) => (
        <span
          key={i}
          className={classNames(
            'absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-sky-500/80 text-[10px] font-bold text-white ring-2 ring-white',
            editable ? 'cursor-grab' : '',
          )}
          style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
          onPointerDown={(event) => {
            if (!editable) return
            event.preventDefault()
            box.current?.setPointerCapture(event.pointerId)
            dragging.current = i
          }}
        >
          {CORNER_LABELS[i]}
        </span>
      ))}
    </div>
  )
}
