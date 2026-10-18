import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { request } from '@/api/client'
import type { BusMessage } from '@/api/types'
import { classNames } from '@/lib/format'
import { mappingApi, snapshotUrl } from '../api'
import { type Grid, gridCorners, gridFromView, gridPoint } from '../cameraView'
import type {
  ApplyResult,
  CalibrationGrid,
  CalibrationStepMessage,
  CameraView,
  Output,
  PeopleMessage,
  Person,
  Point,
  Show,
} from '../types'
import { MINIPC_DOWNLOAD, type Player } from './PlayersPanel'
import { outputColor } from './panels'

const CORNER_LABELS = ['TL', 'TR', 'BR', 'BL']
/** How long one Live view request keeps the photos coming. */
const LIVE_SECONDS = 120
/** A calibration with no word from the camera for this long has stopped. */
const SILENT_MS = 120_000

type Progress = Pick<CalibrationStepMessage, 'step' | 'steps' | 'status' | 'message'>
type StepKey = 'camera' | 'patterns' | 'correct' | 'hand'

const STEPS: Array<{ key: StepKey; title: string; hint: string }> = [
  { key: 'camera', title: 'Camera', hint: 'Aim it and take a photo' },
  { key: 'patterns', title: 'Patterns', hint: 'Projectors show stripes' },
  { key: 'correct', title: 'Correct', hint: 'Fit the picture to the light' },
  { key: 'hand', title: 'Map by hand', hint: 'Fine-tune on the photo' },
]

/** A hand grid: the canvas points at even steps, as placed on the photo. */

/** Where one projector's light falls on the photo. */
interface Footprint {
  outputId: number
  color: string
  cols: number
  rows: number
  lit: boolean[]
}

/**
 * The camera pointed at the building, as a guided calibration: aim the
 * camera, let every projector show its patterns, have the picture fitted
 * and corrected from what the camera saw, then fine-tune by hand on the
 * camera's photo.
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
  const [grid, setGrid] = useState<Grid>(() => gridFromView(show.camera_view))
  const [progress, setProgress] = useState<Map<number, Progress>>(new Map())
  /** Outputs last asked to calibrate; corrected once every one is done. */
  const [batch, setBatch] = useState<number[] | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [mesh, setMesh] = useState(9)
  const [slices, setSlices] = useState(true)
  const [follow, setFollow] = useState(true)
  const [results, setResults] = useState<ApplyResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [liveUntil, setLiveUntil] = useState(0)
  const [footprints, setFootprints] = useState<Footprint[]>([])
  const [step, setStep] = useState<StepKey | null>(null)
  const peopleTimer = useRef<number>()
  const heardAt = useRef(0)

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

  // A different show, or the same show placed from another screen.
  useEffect(() => {
    setGrid(gridFromView(show.camera_view))
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
        heardAt.current = Date.now()
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

  // Where each calibrated projector's light falls, for drawing on the photo.
  const calibratedKey = outputs
    .map((o) => (o.calibration?.camera_id === cameraId ? `${o.id}@${o.calibration?.captured_at}` : ''))
    .join(',')
  useEffect(() => {
    let cancelled = false
    const wanted = outputs.filter((o) => o.calibration?.camera_id === cameraId)
    void Promise.all(
      wanted.map(async (output) => {
        try {
          return footprintOf(output, outputs.indexOf(output), await mappingApi.calibrationGrid(output.id))
        } catch {
          return null
        }
      }),
    ).then((list) => {
      if (!cancelled) setFootprints(list.filter((f): f is Footprint => f !== null))
    })
    return () => {
      cancelled = true
    }
    // calibratedKey stands in for outputs: refetch only when a calibration changes.
  }, [calibratedKey, cameraId])

  useEffect(() => {
    if (!liveUntil) return
    const timer = window.setTimeout(() => setLiveUntil(0), Math.max(0, liveUntil - Date.now()))
    return () => window.clearTimeout(timer)
  }, [liveUntil])

  // A camera that went quiet mid-calibration (unplugged, switched off).
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (Date.now() - heardAt.current < SILENT_MS) return
      setProgress((current) => {
        if (![...current.values()].some((p) => p.status === 'running')) return current
        const next = new Map(current)
        for (const [id, p] of next)
          if (p.status === 'running') next.set(id, { ...p, status: 'failed', message: 'The camera stopped answering' })
        return next
      })
    }, 5000)
    return () => window.clearInterval(timer)
  }, [])

  const camera = cameras?.find((c) => c.id === cameraId) ?? null
  // Projectors set to show a picture apart from the others stay out of the shared one.
  const combined = outputs.filter((o) => o.blend.auto !== false)
  const calibrated = combined.filter((o) => o.calibration?.camera_id === cameraId)
  const placed = show.camera_view?.camera_id === cameraId
  const calibrating = [...progress.values()].some((p) => p.status === 'running')
  const live = liveUntil > Date.now()
  const gridOn = outputs.length > 0 && outputs.every((o) => o.test_pattern === 'grid')

  const done: Record<StepKey, boolean> = {
    camera: !!camera?.online && hasPhoto,
    patterns: combined.length > 0 && calibrated.length === combined.length,
    correct: placed && calibrated.length > 0,
    hand: !!show.camera_view?.mesh,
  }

  // Open on the first step still to do.
  useEffect(() => {
    if (step != null || cameras === null) return
    setStep(!done.camera ? 'camera' : !done.patterns ? 'patterns' : !done.correct ? 'correct' : 'hand')
  }, [cameras, step, done.camera, done.patterns, done.correct])

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

  const correct = async () => {
    setResults(await mappingApi.applyCalibration(show.id, mesh))
    onShowChanged()
  }

  const fitAndCorrect = () =>
    guard(async () => {
      if (cameraId == null) return
      const fitted = await mappingApi.fitCanvas(show.id, cameraId, slices)
      setGrid(gridFromView(fitted.camera_view))
      await correct()
    })

  // Once every projector asked to calibrate has finished: fit the picture
  // into the light (unless it was already placed), then correct.
  useEffect(() => {
    if (!batch) return
    const states = batch.map((id) => progress.get(id)?.status)
    if (states.some((s) => s !== 'done' && s !== 'failed')) return
    setBatch(null)
    if (!states.includes('done') || cameraId == null) return
    void guard(async () => {
      if (!placed) {
        const fitted = await mappingApi.fitCanvas(show.id, cameraId, slices)
        setGrid(gridFromView(fitted.camera_view))
      }
      await correct()
      setStep('correct')
    })
    // guard and correct are recreated each render; the batch is what matters.
  }, [batch, progress])

  const calibrate = (list: Output[]) =>
    guard(async () => {
      if (cameraId == null) return
      setResults(null)
      heardAt.current = Date.now()
      setProgress((current) => {
        const next = new Map(current)
        list.forEach((o, i) =>
          next.set(o.id, { step: 0, steps: 0, status: 'running', message: i === 0 ? 'Starting…' : 'Waiting its turn' }),
        )
        return next
      })
      // The camera works through them one at a time, in this order.
      for (const output of list) await mappingApi.calibrate(output.id, cameraId)
      setBatch(list.map((o) => o.id))
    })

  const saveGrid = (next: Grid) =>
    guard(async () => {
      if (cameraId == null) return
      const view: CameraView = {
        camera_id: cameraId,
        corners: gridCorners(next),
        mesh: next.cols > 2 || next.rows > 2 ? next : null,
      }
      await mappingApi.updateShow(show.id, { camera_view: view })
      if (follow && calibrated.length > 0) await correct()
      else onShowChanged()
    })

  const toggleLive = () =>
    guard(async () => {
      if (cameraId == null) return
      if (live) {
        await mappingApi.cameraCommand(cameraId, 'stop_live')
        setLiveUntil(0)
      } else {
        await mappingApi.cameraCommand(cameraId, 'live', LIVE_SECONDS)
        setLiveUntil(Date.now() + LIVE_SECONDS * 1000)
      }
    })

  const toggleGrid = () =>
    guard(async () => {
      await Promise.all(outputs.map((o) => mappingApi.updateOutput(o.id, { test_pattern: gridOn ? 'none' : 'grid' })))
      onShowChanged()
    })

  if (cameras === null) return <p className="text-sm text-slate-400">Loading cameras…</p>

  if (cameras.length === 0) {
    return (
      <div className="space-y-2 text-sm text-slate-400">
        <p>No camera yet.</p>
        <p>
          Plug a camera into one of the mini PCs running the{' '}
          <a className="text-sky-300 underline" href={MINIPC_DOWNLOAD} target="_blank" rel="noreferrer">
            Mini PC app
          </a>
          . It is found by itself and shows up here, already paired with that mini PC.
        </p>
        <p>
          Any USB webcam is enough to line up the projectors. A depth camera (Intel RealSense, Orbbec or Luxonis OAK)
          does that too, and also lets the picture react to people.
        </p>
      </div>
    )
  }

  const active = step ?? 'camera'
  const photoMode = active === 'hand' ? 'grid' : active === 'correct' ? 'outline' : 'none'
  const canAct = canEdit && !!camera?.online && !busy

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
        {camera?.report.camera && (
          <span className="text-xs text-slate-500">
            {camera.report.camera} · {camera.report.depth ? 'depth camera' : 'webcam'}
          </span>
        )}
        {live && <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-300">Live</span>}
      </div>

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Calibration steps">
        {STEPS.map((s, i) => (
          <li key={s.key}>
            <button
              className={classNames(
                'flex w-full items-start gap-2 rounded-md px-3 py-2 text-left ring-1 transition',
                active === s.key ? 'bg-sky-500/15 ring-sky-400/60' : 'bg-panel-850 ring-white/5 hover:ring-white/20',
              )}
              aria-current={active === s.key ? 'step' : undefined}
              onClick={() => setStep(s.key)}
            >
              <span className={classNames(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                done[s.key] ? 'bg-emerald-500 text-white' : active === s.key ? 'bg-sky-500 text-white' : 'bg-panel-700 text-slate-300',
              )}>
                {done[s.key] ? '✓' : i + 1}
              </span>
              <span>
                <span className="block text-sm font-medium text-slate-100">{s.title}</span>
                <span className="block text-xs text-slate-400">{s.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <CameraPhoto
        src={cameraId != null && hasPhoto ? snapshotUrl(cameraId, photo) : null}
        onMissing={() => setHasPhoto(false)}
        footprints={active === 'camera' ? [] : footprints}
        people={people}
        mode={photoMode}
        grid={grid}
        editable={canEdit && active === 'hand'}
        onChange={setGrid}
        onCommit={(next) => void saveGrid(next)}
      />

      {active === 'camera' && (
        <section className="space-y-3">
          <p className="text-sm text-slate-300">
            {camera?.report.depth
              ? 'A depth camera: it lines up the projectors and lets cues react to people.'
              : 'A webcam: enough to line up the projectors. People effects need a depth camera.'}
          </p>
          <p className="text-xs text-slate-400">
            Point it at the building so it sees every projector's picture, then fix it in place. If it moves later,
            run the patterns again.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-default text-xs" disabled={!canAct || calibrating}
              onClick={() => guard(() => mappingApi.cameraCommand(cameraId!, 'snapshot'))}>
              Take photo
            </button>
            <button className="btn-ghost text-xs" disabled={!canAct || calibrating} onClick={() => void toggleLive()}
              title="A new photo about every second, for aiming the camera">
              {live ? 'Stop live view' : 'Live view'}
            </button>
            {camera?.report.depth && (
              <button className="btn-ghost text-xs" disabled={!canAct}
                title="Re-learn the empty scene, so only people count. Clear the area first."
                onClick={() => guard(() => mappingApi.cameraCommand(cameraId!, 'background'))}>
                Re-learn empty scene
              </button>
            )}
            <button className="btn-primary ml-auto text-xs" onClick={() => setStep('patterns')}>Next: patterns</button>
          </div>
          {camera?.report.depth && (
            <p className="text-xs text-slate-500">
              {people.length ? `Tracking ${people.length} ${people.length === 1 ? 'person' : 'people'}. ` : 'Nobody in view. '}
              Pick an effect per cue under Cues → People.
            </p>
          )}
        </section>
      )}

      {active === 'patterns' && (
        <section className="space-y-3">
          <p className="text-xs text-slate-400">
            Each projector in turn shows black, white and stripe patterns for about half a minute while the camera
            watches; the others go dark. Keep the camera still and the projectors' shutters open. When the last one is
            done, the picture is fitted to the light and the projectors corrected by themselves.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary text-xs" disabled={!canAct || calibrating || combined.length === 0}
              onClick={() => void calibrate(combined)}>
              Calibrate all projectors
            </button>
            {outputs.length === 0 && <span className="text-xs text-amber-300">Add an output on the Show tab first.</span>}
          </div>
          <div className="space-y-2">
            {outputs.map((output, index) => {
              const state = progress.get(output.id)
              const running = state?.status === 'running'
              return (
                <div key={output.id} className="flex flex-wrap items-center gap-3 rounded-md bg-panel-850 px-3 py-2 ring-1 ring-white/5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: outputColor(index) }} />
                  <span className="text-sm text-slate-200">{output.name}</span>
                  <span className="text-xs text-slate-500">
                    {output.blend.auto === false
                      ? 'shows a picture apart from the others, so it is left out (Editor → Blend)'
                      : output.calibration?.camera_id === cameraId
                        ? `calibrated ${new Date(output.calibration!.captured_at).toLocaleString()} · ${Math.round(output.calibration!.coverage * 100)}% of the photo`
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
                  <button className="btn-default ml-auto px-3 py-1 text-xs" disabled={!canAct || calibrating}
                    onClick={() => void calibrate([output])}>
                    {output.calibration?.camera_id === cameraId ? 'Again' : 'Calibrate'}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {active === 'correct' && (
        <section className="space-y-3">
          <p className="text-xs text-slate-400">
            The coloured areas are where the camera saw each projector's light. Fitting places the picture in the
            largest area they light, keeping its shape, and gives each projector the part of the picture its light
            covers. Correcting then sets every projector's corner pin and mesh so the picture lands there, straight.
          </p>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={slices} onChange={(event) => setSlices(event.target.checked)} />
            Give each projector the part of the picture its light covers
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary text-xs" disabled={!canEdit || busy || calibrating || calibrated.length === 0}
              onClick={() => void fitAndCorrect()}>
              Fit to the light and correct
            </button>
            <button className="btn-default text-xs" disabled={!canEdit || busy || calibrating || !placed || calibrated.length === 0}
              onClick={() => guard(correct)}>
              Correct again
            </button>
            <label className="ml-auto flex items-center gap-2 text-xs text-slate-400"
              title="Control points per side of each projector's warp. More follows a curved or uneven wall more closely.">
              Detail
              <select className="input w-auto py-1 text-xs" value={mesh} onChange={(event) => setMesh(Number(event.target.value))}>
                <option value={2}>Corners only</option>
                <option value={5}>5 × 5</option>
                <option value={9}>9 × 9</option>
                <option value={17}>17 × 17</option>
              </select>
            </label>
          </div>
          {calibrated.length === 0 && (
            <p className="text-xs text-amber-300">No projector is calibrated with this camera yet: run the patterns first.</p>
          )}
          <ResultList results={results} />
          {placed && (
            <button className="btn-primary text-xs" onClick={() => setStep('hand')}>Next: map by hand</button>
          )}
        </section>
      )}

      {active === 'hand' && (
        <section className="space-y-3">
          <p className="text-xs text-slate-400">
            Drag the points onto the building: the corners to where the picture's corners belong, the points in
            between onto the features the picture should follow (window lines, ledges). Each time you let go, the
            projectors follow. Live view and the grid on the projectors show the result on the building.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Points
              <select className="input w-auto py-1 text-xs" value={grid.cols}
                disabled={!canEdit || busy}
                onChange={(event) => {
                  const n = Number(event.target.value)
                  const next = resampleGrid(grid, n, n)
                  setGrid(next)
                  void saveGrid(next)
                }}>
                <option value={2}>Corners only</option>
                <option value={3}>3 × 3</option>
                <option value={5}>5 × 5</option>
                <option value={7}>7 × 7</option>
              </select>
            </label>
            <button className="btn-default text-xs" disabled={!canAct || calibrating} onClick={() => void toggleLive()}>
              {live ? 'Stop live view' : 'Live view'}
            </button>
            <button className="btn-default text-xs" disabled={!canEdit || busy || outputs.length === 0} onClick={() => void toggleGrid()}
              title="Every projector shows a grid drawn on the picture, so you can see how it lines up">
              {gridOn ? 'Hide grid on projectors' : 'Show grid on projectors'}
            </button>
            <button className="btn-ghost text-xs" disabled={!canEdit || busy || calibrated.length === 0}
              onClick={() => void fitAndCorrect()} title="Throw away the hand placement and fit to the light again">
              Start again from the light
            </button>
            <label className="ml-auto flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} />
              Projectors follow as I drag
            </label>
          </div>
          {!placed && canEdit && (
            <p className="text-xs text-amber-300">The picture is not placed on this camera's photo yet: drag a point to place it.</p>
          )}
          {calibrated.length < combined.length && (
            <p className="text-xs text-slate-500">
              Projectors the camera has not calibrated ({combined.filter((o) => !calibrated.includes(o)).map((o) => o.name).join(', ')})
              do not follow; run their patterns, or adjust them by hand on the Show tab.
            </p>
          )}
          {combined.length < outputs.length && (
            <p className="text-xs text-slate-500">
              Left out because they show a picture apart from the others ({outputs.filter((o) => !combined.includes(o)).map((o) => o.name).join(', ')}):
              line them up by hand on the Show tab.
            </p>
          )}
          <ResultList results={results} />
        </section>
      )}
    </div>
  )
}

function ResultList({ results }: { results: ApplyResult[] | null }) {
  if (!results) return null
  return (
    <ul className="space-y-1 text-xs">
      {results.map((r) => (
        <li key={r.output_id} className={r.applied ? 'text-emerald-300' : 'text-amber-300'}>
          {r.name}:{' '}
          {r.applied
            ? `corrected · ${Math.round(r.measured * 100)}% from measured light · ${r.residual_px.toFixed(1)} px off a flat wall`
            : r.reason}
        </li>
      ))}
    </ul>
  )
}

// -- the hand grid ------------------------------------------------------------------

/** The same placement with more or fewer points. */
function resampleGrid(grid: Grid, cols: number, rows: number): Grid {
  const points: Point[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) points.push(gridPoint(grid, c / (cols - 1), r / (rows - 1)))
  return { cols, rows, points }
}

function footprintOf(output: Output, index: number, calibration: CalibrationGrid): Footprint {
  return {
    outputId: output.id,
    color: outputColor(index),
    cols: calibration.cols,
    rows: calibration.rows,
    lit: calibration.points.map((p) => p !== null),
  }
}

/** One SVG path of a footprint's lit cells, a rectangle per run along each row. */
function footprintPath(f: Footprint): string {
  let d = ''
  for (let r = 0; r < f.rows; r++) {
    let start = -1
    for (let c = 0; c <= f.cols; c++) {
      const on = c < f.cols && f.lit[r * f.cols + c]
      if (on && start < 0) start = c
      if (!on && start >= 0) {
        d += `M${start} ${r}h${c - start}v1h${start - c}z`
        start = -1
      }
    }
  }
  return d
}

/** The camera photo, with the projectors' light and the picture's placement on it. */
function CameraPhoto({
  src,
  onMissing,
  footprints,
  people,
  mode,
  grid,
  editable,
  onChange,
  onCommit,
}: {
  src: string | null
  onMissing: () => void
  footprints: Footprint[]
  people: Person[]
  /** none: just the photo; outline: where the picture sits; grid: draggable points. */
  mode: 'none' | 'outline' | 'grid'
  grid: Grid
  editable: boolean
  onChange: (grid: Grid) => void
  onCommit: (grid: Grid) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const dragging = useRef<number | null>(null)
  const latest = useRef(grid)
  latest.current = grid
  // Keep showing the last photo until the next one has loaded: no flicker in live view.
  const [shown, setShown] = useState<string | null>(null)
  useEffect(() => {
    if (!src) {
      setShown(null)
      return
    }
    const image = new Image()
    image.onload = () => setShown(src)
    image.onerror = () => {
      setShown((current) => {
        if (current === null) onMissing()
        return current
      })
    }
    image.src = src
    return () => {
      image.onload = null
      image.onerror = null
    }
    // onMissing is a fresh closure each render; the photo address is what matters.
  }, [src])

  const at = (event: React.PointerEvent): Point => {
    const rect = box.current!.getBoundingClientRect()
    const clamp = (v: number) => Math.min(1.5, Math.max(-0.5, v))
    return [clamp((event.clientX - rect.left) / rect.width), clamp((event.clientY - rect.top) / rect.height)]
  }

  // The picture's outline and grid lines, drawn through the placement.
  const lines = useMemo(() => {
    if (mode === 'none') return []
    const steps = 24
    const along = (fixed: number, horizontal: boolean) =>
      Array.from({ length: steps + 1 }, (_, i) => {
        const t = i / steps
        const [x, y] = horizontal ? gridPoint(grid, t, fixed) : gridPoint(grid, fixed, t)
        return `${x},${y}`
      }).join(' ')
    const out: Array<{ points: string; edge: boolean }> = []
    const divisions = mode === 'grid' ? Math.max(grid.cols, grid.rows, 2) - 1 : 1
    for (let i = 0; i <= divisions; i++) {
      const f = i / divisions
      const edge = i === 0 || i === divisions
      out.push({ points: along(f, true), edge }, { points: along(f, false), edge })
    }
    return out
  }, [grid, mode])

  const cornerIndex = (i: number) => {
    const { cols, rows } = grid
    return [0, cols - 1, cols * rows - 1, cols * (rows - 1)].indexOf(i)
  }

  return (
    <div
      ref={box}
      className="relative w-full select-none overflow-hidden rounded-md bg-black ring-1 ring-white/10"
      style={{ aspectRatio: shown ? undefined : '16 / 9', touchAction: 'none' }}
      onPointerMove={(event) => {
        if (dragging.current == null) return
        const index = dragging.current
        const points = latest.current.points.map((p, i) => (i === index ? at(event) : p))
        onChange({ ...latest.current, points })
      }}
      onPointerUp={() => {
        if (dragging.current != null) onCommit(latest.current)
        dragging.current = null
      }}
    >
      {shown ? (
        <img src={shown} alt="What the camera sees" className="block w-full" draggable={false} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
          No photo yet. Press Take photo.
        </div>
      )}
      {footprints.map((f) => (
        <svg key={f.outputId} className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${f.cols} ${f.rows}`} preserveAspectRatio="none" aria-hidden>
          <path d={footprintPath(f)} fill={f.color} fillOpacity={mode === 'grid' ? 0.12 : 0.28} />
        </svg>
      ))}
      {mode !== 'none' && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
          {mode === 'outline' && (
            <polygon points={gridCorners(grid).map(([x, y]) => `${x},${y}`).join(' ')} fill="rgba(56, 189, 248, 0.10)" />
          )}
          {lines.map((line, i) => (
            <polyline key={i} points={line.points} fill="none"
              stroke={line.edge ? 'rgb(56, 189, 248)' : 'rgba(56, 189, 248, 0.6)'}
              strokeWidth={line.edge ? 2 : 1} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      )}
      {people.map((p) => (
        <span key={p.id} className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400 ring-2 ring-black"
          style={{ left: `${p.cx * 100}%`, top: `${p.cy * 100}%` }} title={p.z != null ? `${p.z.toFixed(1)} m` : undefined} />
      ))}
      {mode === 'grid' &&
        grid.points.map(([x, y], i) => {
          const corner = cornerIndex(i)
          return (
            <span
              key={i}
              role="button"
              aria-label={corner >= 0 ? `Corner ${CORNER_LABELS[corner]}` : `Point ${i + 1}`}
              className={classNames(
                'absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-bold text-white ring-2 ring-white',
                corner >= 0 ? 'h-7 w-7 bg-sky-500/80 text-[10px]' : 'h-4 w-4 bg-sky-400/70',
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
              {corner >= 0 ? CORNER_LABELS[corner] : ''}
            </span>
          )
        })}
    </div>
  )
}
