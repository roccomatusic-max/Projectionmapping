import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError, enterPlayerMode, getToken, request, setPlayerToken } from '@/api/client'
import type { Projector, TemperatureReading } from '@/api/types'
import { classNames, formatHours } from '@/lib/format'
import { activeInput, attentionItems, isLive, lampReadings } from '@/lib/status'
import { clockText, spanText, whenText, type Tonight } from '@/lib/tonight'
import type { Player } from './editor/PlayersPanel'
import type { MappingScene, Show, TransportState } from './types'

/**
 * The status screen: what a monitor plugged in beside the projector shows.
 *
 * The Mini PC app opens it on the screen that is not the projector
 * (minipc/screens.py), with the computer's identity in the fragment like the
 * player page, and signs in as that mini PC. Everything on it is read only:
 * the show, tonight's times, the emergency stop, the projector this mini PC
 * drives and a picture of what it is putting out, all large enough to read
 * from across the room.
 */

const IDENTITY_KEY = 'pc.screen'
const HELLO_MS = 5000
const PLAYER_MS = 3000
const TRANSPORT_MS = 2000
const PROJECTOR_MS = 4000
const SHOW_MS = 30_000
const TONIGHT_MS = 30_000
const SCENES_MS = 60_000
/** The mini PC sends a picture about every second while this asks for them. */
const PICTURE_MS = 1000
/** A picture older than this is marked as old. */
const STALE_SECONDS = 10
/** This long without an answer from the server: say so. */
const LOST_MS = 10_000

interface Identity {
  device_id: string
  secret: string
  name: string
}

function identity(): Identity | null {
  let stored: Identity | null = null
  try {
    stored = JSON.parse(localStorage.getItem(IDENTITY_KEY) ?? 'null') as Identity | null
  } catch {
    /* none */
  }
  const given = new URLSearchParams(window.location.hash.slice(1))
  const device_id = given.get('device_id')
  const secret = given.get('secret')
  if (device_id && secret) {
    // The secret stays out of the address bar, history and any reload's referrer.
    history.replaceState(null, '', window.location.pathname + window.location.search)
    const fromApp = { device_id, secret, name: given.get('name') || 'Mini PC' }
    if (stored?.device_id !== device_id) setPlayerToken(null)
    try {
      localStorage.setItem(IDENTITY_KEY, JSON.stringify(fromApp))
    } catch {
      /* this visit only */
    }
    return fromApp
  }
  return stored?.device_id && stored.secret ? stored : null
}

// Signed in as the mini PC, like its player page, never as a person.
enterPlayerMode()

/** Fetch ``load`` now and every ``ms``; keeps the last good answer. */
function usePoll<T>(load: (() => Promise<T>) | null, ms: number, onError?: (err: unknown) => void) {
  const [value, setValue] = useState<T | null>(null)
  const [at, setAt] = useState(0)
  const errors = useRef(onError)
  errors.current = onError
  useEffect(() => {
    if (!load) {
      setValue(null)
      return
    }
    let stopped = false
    const run = async () => {
      try {
        const next = await load()
        if (!stopped) {
          setValue(next)
          setAt(Date.now())
        }
      } catch (err) {
        if (!stopped) errors.current?.(err)
      }
    }
    void run()
    const timer = window.setInterval(() => void run(), ms)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [load, ms])
  return { value, at }
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(timer)
  }, [ms])
  return now
}

interface Picture {
  url: string
  /** When it was drawn on the mini PC, by this computer's clock. */
  drawnAt: number
}

/** The latest picture of this mini PC's own output. */
function usePicture(playerId: number | null): { picture: Picture | null; tried: boolean } {
  const [picture, setPicture] = useState<Picture | null>(null)
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (playerId == null) return
    let stopped = false
    let current: string | null = null
    let busy = false
    const load = async () => {
      if (busy) return
      busy = true
      try {
        const token = getToken()
        const response = await fetch(`/api/mapping/players/${playerId}/picture`, {
          headers: { 'X-Client': 'ui', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          cache: 'no-store',
        })
        if (stopped) return
        setTried(true)
        if (response.status !== 200) return
        const age = Number(response.headers.get('X-Picture-Age') ?? '0')
        const blob = await response.blob()
        if (stopped) return
        const url = URL.createObjectURL(blob)
        if (current) URL.revokeObjectURL(current)
        current = url
        setPicture({ url, drawnAt: Date.now() - age * 1000 })
      } catch {
        // The server restarting: next time.
      } finally {
        busy = false
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), PICTURE_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
      if (current) URL.revokeObjectURL(current)
    }
  }, [playerId])
  return { picture, tried }
}

/** Hide the mouse pointer when it has not moved for a few seconds. */
function useIdleCursor() {
  const [idle, setIdle] = useState(true)
  useEffect(() => {
    let timer = 0
    const moved = () => {
      setIdle(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), 3000)
    }
    window.addEventListener('mousemove', moved)
    return () => {
      window.removeEventListener('mousemove', moved)
      window.clearTimeout(timer)
    }
  }, [])
  return idle
}

export default function ScreenPage() {
  const me = useRef(identity()).current
  const [token, setToken] = useState<string | null>(() => getToken())
  const [playerId, setPlayerId] = useState<number | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [lastAnswer, setLastAnswer] = useState(() => Date.now())
  const now = useNow()
  const idle = useIdleCursor()

  useEffect(() => {
    document.title = 'Status screen'
  }, [])

  // -- signing in as this mini PC --------------------------------------------
  // Once: every hello counts as the player being seen, which only its
  // output page should do.
  useEffect(() => {
    if (!me || (token && playerId != null)) return
    let stopped = false
    const hello = async () => {
      try {
        const reply = await request<{ player_id: number; status: string; code: string; access_token: string | null }>(
          '/mapping/players/hello',
          { method: 'POST', body: me },
        )
        if (stopped) return
        setLastAnswer(Date.now())
        setCode(reply.code)
        setPlayerId(reply.player_id)
        if (reply.access_token) {
          setPlayerToken(reply.access_token)
          setToken(reply.access_token)
          stopped = true
        }
      } catch {
        /* the server is away: try again */
      }
    }
    void hello()
    const timer = window.setInterval(() => {
      if (!stopped) void hello()
    }, HELLO_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [me, token, playerId])

  const signedIn = token != null && playerId != null
  const onError = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) {
      setPlayerToken(null)
      setToken(null)
    }
  }, [])

  const loadPlayers = useCallback(async () => {
    const players = await request<Player[]>('/mapping/players')
    setLastAnswer(Date.now())
    return players
  }, [])
  const players = usePoll(signedIn ? loadPlayers : null, PLAYER_MS, onError).value
  const player = players?.find((p) => p.id === playerId) ?? null

  const transport = usePoll(signedIn ? transportLoader : null, TRANSPORT_MS)
  const transportState = signedIn ? transport.value : null

  const showId = player?.show_id ?? null
  const loadShow = useCallback(() => request<Show>(`/mapping/shows/${showId}`), [showId])
  const show = usePoll(signedIn && showId != null ? loadShow : null, SHOW_MS).value
  const output = show?.outputs.find((o) => o.id === player?.output_id) ?? null

  const projectorId = output?.projector_id ?? null
  const loadProjector = useCallback(() => request<Projector>(`/projectors/${projectorId}`), [projectorId])
  const projector = usePoll(signedIn && projectorId != null ? loadProjector : null, PROJECTOR_MS).value

  const tonight = usePoll(signedIn ? tonightLoader : null, TONIGHT_MS).value
  const scenes = usePoll(signedIn ? scenesLoader : null, SCENES_MS).value
  const { picture, tried } = usePicture(signedIn ? playerId : null)

  const lost = now - lastAnswer > LOST_MS
  const name = player?.name ?? me?.name ?? 'Mini PC'

  if (!me) {
    return (
      <Frame idle={idle}>
        <Centered>
          <p className="text-[5vh] font-semibold text-white">Status screen</p>
          <p className="max-w-[60vw] text-[2.6vh] text-slate-400">
            The Mini PC app opens this by itself on a monitor plugged in beside the projector.
          </p>
        </Centered>
      </Frame>
    )
  }

  if (!signedIn) {
    return (
      <Frame idle={idle}>
        <Centered>
          <p className="text-[5vh] font-semibold text-white">{name}</p>
          {code ? (
            <>
              <p className="text-[2.8vh] text-slate-400">Waiting to be approved on Mapping → Players with the code</p>
              <p className="font-mono text-[12vh] font-semibold tracking-[0.15em] text-white">{code}</p>
            </>
          ) : (
            <p className="text-[2.8vh] text-amber-300">Looking for the main server…</p>
          )}
        </Centered>
      </Frame>
    )
  }

  const emergency = transportState?.emergency ?? null
  const offset = transportState ? transportState.server_time_ms - transport.at : 0
  const testPicture = player?.screen && player.screen !== 'none' ? player.screen : null

  return (
    <Frame idle={idle}>
      {emergency && (
        <div className="flex items-center justify-between gap-[2vw] bg-red-600 px-[2vw] py-[1.4vh] text-white">
          <span className="text-[4.2vh] font-bold uppercase tracking-wide">Emergency stop is on</span>
          <span className="text-[2.4vh]">
            Pressed {new Date(emergency.at_ms - offset).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            {emergency.by ? ` by ${emergency.by}` : ''} · everything is black until someone presses Clear
          </span>
        </div>
      )}
      {lost && (
        <div className="bg-amber-500 px-[2vw] py-[1vh] text-[2.6vh] font-semibold text-black">
          Cannot reach the main server. Showing what it last said.
        </div>
      )}

      <header className="flex items-baseline justify-between gap-[2vw] px-[2vw] pb-[1vh] pt-[2vh]">
        <div className="min-w-0">
          <p className="truncate text-[4vh] font-semibold text-white">{name}</p>
          <p className="truncate text-[2.2vh] text-slate-400">
            {output ? `Plays “${output.name}”` : 'No output picked'}
            {show ? ` of ${show.name}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tnum text-[5.5vh] font-semibold leading-none text-white">
            {new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </p>
          <p className="text-[2vh] text-slate-500">
            {new Date(now).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
        </div>
      </header>

      <main className={classNames('grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,6fr)] grid-rows-[minmax(0,1fr)_auto] gap-[1.6vh] px-[2vw] pb-[2vh]', lost && 'opacity-60')}>
        <Card title="Show">
          <ShowStatus
            transport={transportState}
            show={show}
            outputId={output?.id ?? null}
            scenes={scenes}
            now={now + offset}
            mine={showId}
          />
          {testPicture && (
            <p className="mt-[1.4vh] rounded-lg bg-amber-500/15 px-[1vw] py-[0.8vh] text-[2.4vh] text-amber-200">
              The projector shows a test picture ({testPicture}) instead of the show. Change it on Mapping → Players.
            </p>
          )}
          <TonightLine tonight={tonight} now={now} />
        </Card>

        <Card title="What the projector gets" className="row-span-1">
          <OutputPicture
            picture={picture}
            tried={tried}
            now={now}
            online={player?.online ?? false}
            emergency={emergency != null}
            aspect={output ? output.width / output.height : 16 / 10}
          />
          <PlayerFacts player={player} />
        </Card>

        <Card title="Projector" className="col-span-2">
          <ProjectorStatus projector={projector} linked={output != null && projectorId != null} hasOutput={output != null} />
        </Card>
      </main>
    </Frame>
  )
}

const transportLoader = () => request<TransportState>('/mapping/transport')
const tonightLoader = () => request<Tonight>('/tonight')
const scenesLoader = () => request<MappingScene[]>('/mapping/scenes')

// -- parts ------------------------------------------------------------------------------

function Frame({ children, idle }: { children: ReactNode; idle: boolean }) {
  return (
    <div className={classNames('fixed inset-0 flex flex-col overflow-hidden bg-[#05070b] text-slate-200', idle && 'cursor-none')}>
      {children}
    </div>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-[2vh] text-center">{children}</div>
}

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={classNames('flex min-h-0 flex-col rounded-2xl bg-white/[0.04] px-[1.6vw] py-[1.6vh] ring-1 ring-white/[0.06]', className)}>
      <h2 className="mb-[1vh] text-[1.9vh] font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</h2>
      {children}
    </section>
  )
}

const STATUS_WORD: Record<string, { text: string; color: string; dot: string }> = {
  playing: { text: 'Playing', color: 'text-emerald-300', dot: 'bg-emerald-400' },
  paused: { text: 'Paused', color: 'text-yellow-300', dot: 'bg-yellow-400' },
  stopped: { text: 'Stopped', color: 'text-slate-300', dot: 'bg-slate-500' },
  blackout: { text: 'Blacked out', color: 'text-slate-300', dot: 'bg-slate-500' },
}

function elapsedText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

function ShowStatus({
  transport,
  show,
  outputId,
  scenes,
  now,
  mine,
}: {
  transport: TransportState | null
  show: Show | null
  outputId: number | null
  scenes: MappingScene[] | null
  now: number
  mine: number | null
}) {
  if (!transport) return <p className="text-[3vh] text-slate-500">Loading…</p>
  const emergency = transport.emergency != null
  const word = emergency ? { text: 'Held', color: 'text-red-300', dot: 'bg-red-500' } : STATUS_WORD[transport.status] ?? STATUS_WORD.stopped
  const cue = transport.current
  const otherShow = transport.show_id != null && mine != null && transport.show_id !== mine && transport.status !== 'stopped'
  const perOutput = cue?.output_scenes ?? {}
  const sceneId = cue ? (outputId != null && String(outputId) in perOutput ? perOutput[outputId] : cue.scene_id) : null
  const scene = sceneId != null ? scenes?.find((s) => s.id === sceneId)?.name ?? null : null
  const cueCount = show?.cues.length ?? null
  const playingTime =
    cue && transport.status === 'paused' && transport.paused_position != null
      ? transport.paused_position * 1000
      : cue && transport.status === 'playing'
        ? now - cue.started_at_ms
        : null

  return (
    <div className="space-y-[1.2vh]">
      <p className={classNames('flex items-center gap-[1vw] text-[9vh] font-bold leading-none', word.color)}>
        <span className={classNames('inline-block h-[4.5vh] w-[4.5vh] shrink-0 rounded-full', word.dot, transport.status === 'playing' && !emergency && 'animate-pulse')} />
        {word.text}
      </p>
      {cue && transport.status !== 'stopped' ? (
        <div>
          <p className="truncate text-[4.4vh] font-semibold text-white">
            {cue.position < 0 ? 'Scene' : `Cue ${cue.position + 1}${cueCount ? ` of ${cueCount}` : ''}`}
            {cue.name ? ` · ${cue.name}` : ''}
          </p>
          <p className="text-[2.8vh] text-slate-400">
            {scene ? `${scene} on this projector` : 'No scene on this projector'}
            {playingTime != null ? ` · ${elapsedText(playingTime)} in` : ''}
          </p>
        </div>
      ) : (
        <p className="text-[3.2vh] text-slate-400">Nothing is playing.</p>
      )}
      {otherShow && (
        <p className="text-[2.4vh] text-amber-200">Another show is playing; this projector belongs to a different one.</p>
      )}
    </div>
  )
}

function TonightLine({ tonight, now }: { tonight: Tonight | null; now: number }) {
  if (!tonight) return null
  const date = new Date(now)
  let when: string | null = null
  let text: string
  let tone = 'text-slate-300'
  if (!tonight.enabled) {
    text = 'No show time set.'
    tone = 'text-slate-500'
  } else {
    when = `${clockText(tonight.start_at)} to ${clockText(tonight.end_at)}`
    if (tonight.state === 'running') {
      const ends = tonight.ends_at ? new Date(tonight.ends_at).getTime() - now : null
      text = `On now${ends != null && ends > 0 ? `, ${spanText(ends)} left` : ''}`
      tone = 'text-emerald-300'
    } else if (tonight.state === 'later') {
      const starts = tonight.starts_at ? new Date(tonight.starts_at).getTime() - now : null
      text = starts != null && starts > 0 ? `Starts in ${spanText(starts)}` : 'Starting'
    } else {
      text = tonight.state === 'done' ? 'Done for tonight.' : 'Not tonight.'
      if (tonight.next_starts_at) text += ` Next: ${whenText(tonight.next_starts_at, date)}`
      tone = 'text-slate-400'
    }
  }
  return (
    <div className="mt-auto border-t border-white/[0.06] pt-[1.2vh]">
      <p className="text-[1.9vh] font-semibold uppercase tracking-[0.2em] text-slate-500">
        Tonight’s show{tonight.enabled && tonight.group_name ? ` · ${tonight.group_name}` : ''}
      </p>
      {when && <p className="truncate text-[3.4vh] font-semibold text-white">{when}</p>}
      <p className={classNames('truncate text-[2.6vh] font-medium', tone)}>{text}</p>
    </div>
  )
}

function OutputPicture({
  picture,
  tried,
  now,
  online,
  emergency,
  aspect,
}: {
  picture: Picture | null
  tried: boolean
  now: number
  online: boolean
  emergency: boolean
  aspect: number
}) {
  const age = picture ? (now - picture.drawnAt) / 1000 : null
  const stale = age != null && age > STALE_SECONDS
  const note = !online
    ? 'The output is not answering'
    : !picture
      ? tried
        ? 'Waiting for the first picture…'
        : 'Loading…'
      : stale
        ? `No new picture for ${spanText(age! * 1000)}`
        : null
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <div
        className="relative max-h-full w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/10"
        style={{ aspectRatio: String(aspect) }}
      >
        {picture && (
          <img
            src={picture.url}
            alt="What this mini PC is putting out to the projector"
            className={classNames('absolute inset-0 h-full w-full object-contain', (stale || !online) && 'opacity-40 grayscale')}
          />
        )}
        {(note || emergency) && (
          <span
            className={classNames(
              'absolute inset-x-0 bottom-0 px-[1vw] py-[0.6vh] text-center text-[2.2vh]',
              !online || emergency ? 'bg-red-950/80 text-red-100' : 'bg-black/70 text-slate-300',
            )}
          >
            {emergency ? 'Black: the emergency stop is on' : note}
          </span>
        )}
      </div>
    </div>
  )
}

function PlayerFacts({ player }: { player: Player | null }) {
  if (!player) return null
  const report = player.report ?? {}
  const facts = player.online
    ? [
        report.fps != null ? `${Math.round(report.fps)} frames a second` : null,
        report.width ? `${report.width} × ${report.height}` : null,
        report.cache === 'on' ? 'media saved on this computer' : report.cache === 'syncing' ? 'media downloading' : 'media streamed',
        report.link && report.link !== 'open' ? 'live link down' : null,
      ].filter(Boolean)
    : ['not answering']
  return <p className="tnum mt-[1vh] truncate text-[2.2vh] text-slate-400">{facts.join(' · ')}</p>
}

const POWER: Record<string, { text: string; color: string }> = {
  on: { text: 'On', color: 'text-emerald-300' },
  off: { text: 'Standby', color: 'text-slate-300' },
  warming: { text: 'Warming up', color: 'text-sky-300' },
  cooling: { text: 'Cooling down', color: 'text-sky-300' },
  unknown: { text: 'Unknown', color: 'text-slate-400' },
}

const CONDITIONS: Array<{ key: string; label: string }> = [
  { key: 'temperature', label: 'Heat' },
  { key: 'fan', label: 'Fans' },
  { key: 'lamp', label: 'Lamp' },
  { key: 'filter', label: 'Filter' },
  { key: 'cover', label: 'Cover' },
  { key: 'other', label: 'Other' },
]

function conditionLook(severity: string | undefined): { text: string; className: string } {
  if (severity === 'ok') return { text: 'OK', className: 'bg-emerald-500/15 text-emerald-300' }
  if (severity === 'warning') return { text: 'Warning', className: 'bg-yellow-500/20 text-yellow-200' }
  if (severity === 'error') return { text: 'Fault', className: 'bg-red-500/25 text-red-200' }
  return { text: '—', className: 'bg-white/5 text-slate-500' }
}

function Fact({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className="shrink-0">
      <p className="text-[1.9vh] text-slate-500">{label}</p>
      <p className={classNames('whitespace-nowrap text-[3.8vh] font-semibold leading-tight', className ?? 'text-white')}>{children}</p>
    </div>
  )
}

function ProjectorStatus({ projector, linked, hasOutput }: { projector: Projector | null; linked: boolean; hasOutput: boolean }) {
  if (!hasOutput) {
    return <p className="text-[3vh] text-slate-400">Pick an output for this mini PC on Mapping → Players.</p>
  }
  if (!linked) {
    return (
      <p className="text-[3vh] text-slate-400">
        No projector is linked to this output. Pick one in Editor → Projectors.
      </p>
    )
  }
  if (!projector) return <p className="text-[3vh] text-slate-500">Loading…</p>

  const live = isLive(projector)
  const { state } = projector
  const power = POWER[state.power] ?? POWER.unknown
  const input = activeInput(projector)
  const lamps = lampReadings(projector).filter((l) => l.hours != null)
  const lampHours = lamps.length ? Math.max(...lamps.map((l) => l.hours!)) : null
  const field = state.equipment?.temperature
  const temperatures =
    field?.availability === 'available' && field.value && typeof field.value === 'object'
      ? ((field.value as TemperatureReading).sensors ?? []).filter((s) => s.celsius != null)
      : []
  const erst = state.error_status?.availability === 'available' ? (state.error_status.value ?? {}) : null
  const problems = attentionItems(projector).filter((item) => item.severity !== 'notice')

  return (
    <div className="space-y-[1.4vh]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-[2vw]">
        <p className="truncate text-[3.4vh] font-semibold text-white">
          {projector.name}
          <span className="ml-[1vw] text-[2.2vh] font-normal text-slate-500">
            {projector.manufacturer} {projector.model} · {projector.host}
          </span>
        </p>
        <p className={classNames('text-[2.8vh] font-semibold', live ? 'text-emerald-300' : 'text-red-300')}>
          {live ? 'Answering' : state.last_seen_at ? 'Not answering' : 'Never reached'}
        </p>
      </div>

      <div className="flex flex-wrap gap-x-[3vw] gap-y-[1vh]">
        <Fact label="Power" className={live ? power.color : 'text-slate-500'}>
          {live ? power.text : '—'}
        </Fact>
        <Fact label="Shutter" className={state.shutter === 'closed' ? 'text-yellow-200' : 'text-white'}>
          {live ? (state.shutter === 'open' ? 'Open' : state.shutter === 'closed' ? 'Closed' : '—') : '—'}
        </Fact>
        <Fact label="Input" className={input.muted ? 'text-slate-500' : 'text-white'}>
          {input.text}
        </Fact>
        {lampHours != null && (
          <Fact label={lamps.length > 1 ? `Lamp hours (most of ${lamps.length})` : 'Lamp hours'}
            className={lampHours >= projector.lamp_critical_hours ? 'text-red-300' : lampHours >= projector.lamp_warn_hours ? 'text-yellow-200' : 'text-white'}>
            {formatHours(lampHours)}
          </Fact>
        )}
        {temperatures.map((sensor) => (
          <Fact key={sensor.key} label={sensor.label}>
            {sensor.celsius} °C
            <span className="ml-[0.6vw] text-[2.4vh] font-normal text-slate-400">{sensor.fahrenheit} °F</span>
          </Fact>
        ))}
      </div>

      {erst ? (
        <div className="flex flex-wrap gap-[0.8vw]">
          {CONDITIONS.map((c) => {
            const look = conditionLook(erst[c.key])
            return (
              <span key={c.key} className={classNames('rounded-lg px-[1vw] py-[0.6vh] text-[2.6vh] font-medium', look.className)}>
                {c.label} {look.text}
              </span>
            )
          })}
        </div>
      ) : (
        <p className="text-[2.2vh] text-slate-500">
          Fans, filter and cover are not reported: turn PJLink on in the projector’s network menu.
        </p>
      )}

      {problems.length > 0 ? (
        <ul className="space-y-[0.4vh]">
          {problems.slice(0, 4).map((item) => (
            <li key={item.text} className={classNames('text-[3vh] font-medium', item.severity === 'critical' ? 'text-red-300' : 'text-yellow-200')}>
              {item.text}
              {item.detail && <span className="ml-[0.8vw] text-[2.2vh] font-normal text-slate-400">{item.detail}</span>}
            </li>
          ))}
        </ul>
      ) : (
        live && <p className="text-[2.6vh] text-emerald-300">No errors or warnings.</p>
      )}
    </div>
  )
}
