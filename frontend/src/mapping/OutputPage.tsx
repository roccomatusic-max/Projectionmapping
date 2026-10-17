import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { withDefaults } from './geometry'
import { useLocalChannel } from './live'
import { type CalibrationFrame, type FrameStats, OutputView } from './OutputView'
import { PeopleTracker } from './people'
import type { CalibrationStepMessage, PeopleMessage, Show } from './types'
import { useShowRuntime } from './useShowRuntime'

/** A calibration that stops sending frames (camera gone) ends after this. */
const CALIBRATION_WATCHDOG_MS = 15000

const STATUS_LABEL = {
  playing: 'Playing',
  paused: 'Paused',
  stopped: 'Stopped',
  blackout: 'Blackout',
} as const

/** An output window opened from the editor on an operator's computer. */
export default function OutputPage() {
  const params = useParams()
  return <OutputScreen showId={Number(params.showId)} outputId={Number(params.outputId)} />
}

/**
 * The image that feeds one projector: full screen, no chrome.
 *
 * A click enters full screen, F toggles it; H toggles the status overlay.
 */
export function OutputScreen({
  showId,
  outputId,
  playerId,
  hudExtra,
  onStats,
  onShow,
}: {
  showId: number
  outputId: number
  /** Set on a paired player, so "identify" requests for it are honoured. */
  playerId?: number
  hudExtra?: ReactNode
  onStats?: (stats: FrameStats & { width: number; height: number; cue: string | null }) => void
  onShow?: (show: Show) => void
}) {
  const people = useRef<PeopleTracker>()
  if (!people.current) people.current = new PeopleTracker(showId)
  const [calibration, setCalibration] = useState<CalibrationFrame | null>(null)
  const watchdog = useRef<number>()

  const onCalibrationStep = (step: CalibrationStepMessage) => {
    if (step.show_id !== showId) return
    window.clearTimeout(watchdog.current)
    if (step.status !== 'running' || !step.pattern) {
      setCalibration(null)
      return
    }
    // The output being read shows the pattern; the rest of the show goes
    // dark so their light does not land in the camera's picture.
    setCalibration({ pattern: step.output_id === outputId ? step.pattern : null })
    watchdog.current = window.setTimeout(() => setCalibration(null), CALIBRATION_WATCHDOG_MS)
  }
  useEffect(() => () => window.clearTimeout(watchdog.current), [])

  const runtime = useShowRuntime(Number.isFinite(showId) ? showId : null, (message) => {
    const forPlayer = playerId != null && message.payload.player_id === playerId
    if (message.type === 'mapping_identify' && (forPlayer || message.payload.output_id === outputId)) flashIdentify()
    if (message.type === 'mapping_player' && forPlayer) window.dispatchEvent(new CustomEvent('pc:player-changed'))
    if (message.type === 'mapping_calib_pattern') onCalibrationStep(message.payload as unknown as CalibrationStepMessage)
    if (message.type === 'mapping_people') people.current!.update(message.payload as unknown as PeopleMessage)
  })
  const { show, setShow, transport, link, clock, playback, error } = runtime
  const [hud, setHud] = useState(playerId == null)
  const [identify, setIdentify] = useState(false)
  const [stats, setStats] = useState<FrameStats>({ fps: 0, drift: null })
  const [size, setSize] = useState<[number, number]>(() => pixelSize())
  const identifyTimer = useRef<number>()

  const flashIdentify = () => {
    setIdentify(true)
    window.clearTimeout(identifyTimer.current)
    identifyTimer.current = window.setTimeout(() => setIdentify(false), 4000)
  }

  useEffect(() => {
    if (show) onShow?.(show)
  }, [show]) // eslint-disable-line react-hooks/exhaustive-deps

  const statsRef = useRef({ size, transport })
  statsRef.current = { size, transport }
  const handleStats = useCallback(
    (frame: FrameStats) => {
      setStats(frame)
      const { size: [width, height], transport: t } = statsRef.current
      onStats?.({ ...frame, width, height, cue: t?.current ? `${t.current.position + 1} ${t.current.name}` : null })
    },
    [onStats],
  )

  // Geometry edits from an editor on this computer arrive per frame here,
  // ahead of the saved copy coming back over the network.
  useLocalChannel((message) => {
    if (message.type === 'output' && message.output.id === outputId) {
      const output = withDefaults(message.output)
      setShow((current) =>
        current ? { ...current, outputs: current.outputs.map((o) => (o.id === output.id ? output : o)) } : current,
      )
    }
  })

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else enterFullscreen()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'f' || event.key === 'F') toggleFullscreen()
      if (event.key === 'h' || event.key === 'H') setHud((v) => !v)
    }
    const onResize = () => setSize(pixelSize())
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [toggleFullscreen])

  const output = show?.outputs.find((o) => o.id === outputId)

  useEffect(() => {
    document.title = output ? `${output.name} · Output` : 'Output'
  }, [output])

  // Hide the cursor over the image once the overlay is away. During a
  // calibration nothing but the pattern may be on screen.
  const showHud = hud && !calibration
  const cursor = showHud ? 'default' : 'none'

  if (error) return <Message text={error} />
  if (!show) return <Message text="Loading show…" />
  if (!output) return <Message text={`Output ${outputId} is not part of ${show.name}.`} />

  const shown = identify ? { ...output, test_pattern: 'id' as const } : output
  const mismatch = size[0] !== output.width || size[1] !== output.height

  return (
    <div className="fixed inset-0 bg-black" style={{ cursor }} onClick={enterFullscreen}>
      <OutputView
        output={shown}
        canvasWidth={show.canvas_width}
        canvasHeight={show.canvas_height}
        playback={playback}
        clock={clock}
        pixelSize={size}
        className="block h-full w-full"
        onStats={handleStats}
        calibration={calibration}
        interaction={transport?.current?.interaction ?? 'none'}
        people={people.current}
      />
      {showHud && (
        <div className="pointer-events-none absolute left-4 top-4 space-y-1 rounded-lg bg-black/70 px-4 py-3 font-mono text-xs text-slate-200 ring-1 ring-white/10">
          <p className="text-sm font-semibold text-white">
            {output.name} <span className="font-normal text-slate-400">· {show.name}</span>
          </p>
          <p>
            {transport ? STATUS_LABEL[transport.status] : '—'}
            {transport?.current ? ` · cue ${transport.current.position + 1} ${transport.current.name}` : ''}
          </p>
          <p>
            link {link} · clock {clock.synced ? `±${Math.round(clock.rtt / 2)} ms` : 'syncing'} · {stats.fps.toFixed(0)} fps
            {stats.drift != null ? ` · drift ${(stats.drift * 1000).toFixed(0)} ms` : ''}
          </p>
          <p className={mismatch ? 'text-amber-300' : 'text-slate-400'}>
            window {size[0]} × {size[1]} · output set to {output.width} × {output.height}
            {mismatch ? ' (mismatch: check the display resolution)' : ''}
          </p>
          {hudExtra}
          <p className="text-slate-500">click or F full screen · Esc leave it · H hide this</p>
        </div>
      )}
    </div>
  )
}

/**
 * Fill the display, hiding every part of the browser. Browsers allow this
 * only from a click or key press; a player started in kiosk mode is full
 * screen from boot and never needs it.
 */
export function enterFullscreen() {
  if (!document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => undefined)
}

function pixelSize(): [number, number] {
  const dpr = window.devicePixelRatio || 1
  return [Math.round(window.innerWidth * dpr), Math.round(window.innerHeight * dpr)]
}

function Message({ text }: { text: string }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black text-sm text-slate-400">{text}</div>
  )
}
