import { useEffect, useMemo, useRef, useState } from 'react'
import { uploadMedia } from '../api'
import type { ServerClock } from '../live'
import { OutputView } from '../OutputView'
import { PeopleTracker } from '../people'
import { Playback } from '../playback'
import { SimulatedCrowd } from '../scene/simulate'
import type { MappingScene, Show } from '../types'
import { wholeCanvasOutput } from './ScenePreview'

const LENGTHS = [10, 20, 30, 60]

/** The best format this browser records in; MP4 seeks and loops better on players. */
function recordingType(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const [mime, ext] of [
    ['video/mp4;codecs=avc1.640028', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9', 'webm'],
    ['video/webm;codecs=vp8', 'webm'],
    ['video/webm', 'webm'],
  ]) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext }
  }
  return null
}

type Phase = { kind: 'idle' } | { kind: 'recording'; until: number } | { kind: 'uploading'; progress: number } | { kind: 'done'; name: string }

/**
 * Record a scene into a video file in the media library, to play as a
 * normal cue or use elsewhere. The video is what the scene draws on its own
 * (black where it draws nothing, no photo of the house), at up to 1920
 * pixels wide, in real time.
 */
export function SceneRecorder({
  show,
  scene,
  clock,
  onDone,
  onError,
}: {
  show: Show
  scene: MappingScene
  clock: ServerClock
  onDone: () => void
  onError: (message: string) => void
}) {
  const type = useMemo(recordingType, [])
  const [seconds, setSeconds] = useState(20)
  const [withPeople, setWithPeople] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [, setTick] = useState(0)

  useEffect(() => {
    if (phase.kind !== 'recording') return
    const timer = window.setInterval(() => setTick((n) => n + 1), 250)
    return () => window.clearInterval(timer)
  }, [phase.kind])

  if (!type) {
    return <p className="text-xs text-slate-500">This browser cannot record video; use a current Chrome or Edge.</p>
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
      {phase.kind === 'idle' || phase.kind === 'done' ? (
        <>
          <label className="flex items-center gap-1.5">
            Length
            <select className="input w-auto py-1 text-xs" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
              {LENGTHS.map((s) => (
                <option key={s} value={s}>
                  {s} s
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5" title="Bake the made-up people into the video, so people effects show">
            <input type="checkbox" className="accent-sky-500" checked={withPeople} onChange={(e) => setWithPeople(e.target.checked)} />
            Include made-up people
          </label>
          <button className="btn-default px-3 py-1 text-xs" onClick={() => setPhase({ kind: 'recording', until: performance.now() + seconds * 1000 })}>
            Record video
          </button>
          {phase.kind === 'done' && <span className="text-emerald-300">Saved “{phase.name}” to the media library.</span>}
        </>
      ) : phase.kind === 'recording' ? (
        <span className="text-sky-300">
          Recording… {Math.max(0, Math.ceil((phase.until - performance.now()) / 1000))} s left (keep this tab open)
        </span>
      ) : (
        <span className="text-sky-300">Saving to the media library… {Math.round(phase.progress * 100)}%</span>
      )}
      {phase.kind === 'recording' && (
        <Recording
          show={show}
          scene={scene}
          clock={clock}
          seconds={seconds}
          withPeople={withPeople}
          type={type}
          onRecorded={async (blob) => {
            const name = `${scene.name} (scene).${type.ext}`
            const file = new File([blob], name, { type: type.mime.split(';')[0] })
            setPhase({ kind: 'uploading', progress: 0 })
            try {
              const { width, height } = recordSize(show)
              await uploadMedia(file, { width, height, duration: seconds }, (progress) =>
                setPhase({ kind: 'uploading', progress }),
              )
              setPhase({ kind: 'done', name })
              onDone()
            } catch (err) {
              setPhase({ kind: 'idle' })
              onError(err instanceof Error ? err.message : 'Saving the video failed')
            }
          }}
          onFailed={(message) => {
            setPhase({ kind: 'idle' })
            onError(message)
          }}
        />
      )}
    </div>
  )
}

function recordSize(show: Show) {
  const width = Math.min(1920, show.canvas_width)
  // Even sizes: video encoders need them.
  const height = Math.round((width * show.canvas_height) / show.canvas_width / 2) * 2
  return { width: Math.round(width / 2) * 2, height }
}

/** A hidden renderer at video size, recorded for ``seconds``. */
function Recording({
  show,
  scene,
  clock,
  seconds,
  withPeople,
  type,
  onRecorded,
  onFailed,
}: {
  show: Show
  scene: MappingScene
  clock: ServerClock
  seconds: number
  withPeople: boolean
  type: { mime: string }
  onRecorded: (blob: Blob) => void
  onFailed: (message: string) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const { width, height } = recordSize(show)
  const playback = useMemo(() => new Playback(), [])
  const output = useMemo(() => wholeCanvasOutput(show.id, -2, 'Recording', width, height), [show.id, width, height])

  useEffect(() => {
    playback.setSurfaces(show.surfaces)
    playback.setPreview(scene)
    const tracker = new PeopleTracker(show.id)
    const crowd = new SimulatedCrowd(withPeople ? 3 : 0, show.canvas_width / show.canvas_height)
    playback.setPeople(tracker)
    const walk = window.setInterval(() => {
      crowd.step(performance.now())
      tracker.update(crowd.message(show.id))
    }, 66)

    const canvas = boxRef.current?.querySelector('canvas')
    if (!canvas) {
      onFailed('Could not start recording.')
      return
    }
    const stream = canvas.captureStream(30)
    const recorder = new MediaRecorder(stream, { mimeType: type.mime, videoBitsPerSecond: 16_000_000 })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data)
    recorder.onstop = () => onRecorded(new Blob(chunks, { type: type.mime.split(';')[0] }))
    recorder.onerror = () => onFailed('Recording failed.')
    recorder.start(1000)
    const stop = window.setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), seconds * 1000)
    return () => {
      window.clearTimeout(stop)
      window.clearInterval(walk)
      stream.getTracks().forEach((t) => t.stop())
      playback.dispose()
    }
    // Recording runs once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={boxRef} aria-hidden className="pointer-events-none fixed -left-[10000px] top-0" style={{ width, height }}>
      <OutputView
        output={output}
        canvasWidth={show.canvas_width}
        canvasHeight={show.canvas_height}
        playback={playback}
        clock={clock}
        pixelSize={[width, height]}
        className="h-full w-full"
      />
    </div>
  )
}
