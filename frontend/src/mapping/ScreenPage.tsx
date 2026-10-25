import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError, enterPlayerMode, getToken, request, setPlayerToken } from '@/api/client'
import { HOLD_MS, useHold } from '@/components/EmergencyStop'
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

/** How often to ask which version the server runs. */
const VERSION_MS = 60_000

/**
 * Reload when the server has been updated, so the screen gets the new page:
 * it stays open day and night and nothing else would ever reload it.
 */
function useNewBuild() {
  useEffect(() => {
    let first: string | null = null
    const check = async () => {
      try {
        const { version } = (await fetch('/api/health', { cache: 'no-store' }).then((r) => r.json())) as { version?: string }
        if (!version) return
        if (first == null) first = version
        else if (version !== first) window.location.reload()
      } catch {
        /* restarting, or the network: next time */
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), VERSION_MS)
    return () => window.clearInterval(timer)
  }, [])
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
  useNewBuild()

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

  // An output nobody linked yet: with only one projector there is no doubt which it is.
  const unlinked = output != null && output.projector_id == null
  const projectors = usePoll(signedIn && unlinked ? projectorsLoader : null, SHOW_MS).value
  const onlyProjector = projectors?.length === 1 ? projectors[0].id : null
  const guessed = unlinked && onlyProjector != null
  const projectorId = output?.projector_id ?? onlyProjector
  const loadProjector = useCallback(() => request<Projector>(`/projectors/${projectorId}`), [projectorId])
  const projector = usePoll(signedIn && projectorId != null ? loadProjector : null, PROJECTOR_MS).value

  const tonight = usePoll(signedIn ? tonightLoader : null, TONIGHT_MS).value
  const scenes = usePoll(signedIn ? scenesLoader : null, SCENES_MS).value
  const { picture, tried } = usePicture(signedIn ? playerId : null)

  const lost = now - lastAnswer > LOST_MS
  const { busy, said, press, pressEmergency } = useButtons()
  const name = player?.name ?? me?.name ?? 'Mini PC'

  if (!me) {
    return (
      <Frame idle={idle}>
        <Centered>
          <p className="text-[length:calc(var(--u)*5)] font-semibold text-white">Status screen</p>
          <p className="max-w-[60vw] text-[length:calc(var(--u)*2.6)] text-slate-400">
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
          <p className="text-[length:calc(var(--u)*5)] font-semibold text-white">{name}</p>
          {code ? (
            <>
              <p className="text-[length:calc(var(--u)*2.8)] text-slate-400">Waiting to be approved on Mapping → Players with the code</p>
              <p className="font-mono text-[length:calc(var(--u)*12)] font-semibold tracking-[0.15em] text-white">{code}</p>
            </>
          ) : (
            <p className="text-[length:calc(var(--u)*2.8)] text-amber-300">Looking for the main server…</p>
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
        <div className="flex items-center justify-between gap-[2vw] bg-red-600 px-[2vw] py-[calc(var(--u)*1.4)] text-white">
          <span className="text-[length:calc(var(--u)*4.2)] font-bold uppercase tracking-wide">Emergency stop is on</span>
          <span className="text-[length:calc(var(--u)*2.4)]">
            Pressed {new Date(emergency.at_ms - offset).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            {emergency.by ? ` by ${emergency.by}` : ''} · everything is black until someone presses Clear
          </span>
        </div>
      )}
      {lost && (
        <div className="bg-amber-500 px-[2vw] py-[calc(var(--u)*1)] text-[length:calc(var(--u)*2.6)] font-semibold text-black">
          Cannot reach the main server. Showing what it last said.
        </div>
      )}

      <header className="flex items-baseline justify-between gap-[2vw] px-[2vw] pb-[calc(var(--u)*1)] pt-[calc(var(--u)*2)]">
        <div className="min-w-0">
          <p className="truncate text-[length:calc(var(--u)*4)] font-semibold text-white">{name}</p>
          <p className="truncate text-[length:calc(var(--u)*2.2)] text-slate-400">
            {output ? `Plays “${output.name}”` : 'No output picked'}
            {show ? ` of ${show.name}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tnum text-[length:calc(var(--u)*5.5)] font-semibold leading-none text-white">
            {new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </p>
          <p className="text-[length:calc(var(--u)*2)] text-slate-500">
            {new Date(now).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
        </div>
      </header>

      <main className={classNames(
        'grid min-h-0 flex-1 gap-[calc(var(--u)*1.4)] px-[2vw] pb-[calc(var(--u)*1.2)]',
        'grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto] landscape:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] landscape:grid-rows-[auto_minmax(0,1fr)]',
        lost && 'opacity-60',
      )}>
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
            <p className="mt-[calc(var(--u)*1.4)] rounded-lg bg-amber-500/15 px-[1vw] py-[calc(var(--u)*0.8)] text-[length:calc(var(--u)*2.4)] text-amber-200">
              The projector shows a test picture ({testPicture}) instead of the show. Change it on Mapping → Players.
            </p>
          )}
          <TonightLine tonight={tonight} now={now} />
        </Card>

        <Card title="What the projector gets" className="landscape:col-start-2 landscape:row-span-2 landscape:row-start-1">
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

        <Card title="Projector" className="landscape:col-start-1 landscape:row-start-2">
          <ProjectorStatus projector={projector} linked={output != null && projectorId != null} hasOutput={output != null}
            guessed={guessed} outputName={output?.name ?? null}
            choices={unlinked && !guessed ? (projectors ?? []) : []}
            onLink={(id) => void press('link_projector', { projector_id: id })} />
        </Card>
      </main>

      <Controls
        status={transportState?.status ?? null}
        emergency={emergency != null}
        hasProjector={projectorId != null}
        busy={busy}
        said={said}
        onPress={(action, extra) => void press(action, extra)}
        onEmergency={() => void pressEmergency()}
      />
    </Frame>
  )
}

const transportLoader = () => request<TransportState>('/mapping/transport')

// -- the buttons --------------------------------------------------------------------------

type ScreenAction = 'start_tonight' | 'stop_tonight' | 'go' | 'pause' | 'resume' | 'blackout'
  | 'power_on' | 'power_off' | 'restart_output' | 'link_projector'

interface ScreenResult {
  ok: boolean
  message: string
}

/** How long an answer stays under the buttons. */
const SAID_MS = 8000

/**
 * The buttons send as this mini PC: the server lets its own account run the
 * show, turn its projector on and off and restart its output, nothing more.
 */
function useButtons() {
  const [busy, setBusy] = useState<ScreenAction | 'emergency' | null>(null)
  const [said, setSaid] = useState<ScreenResult | null>(null)
  const timer = useRef<number>()
  const say = useCallback((result: ScreenResult) => {
    setSaid(result)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setSaid(null), SAID_MS)
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const send = useCallback(async (which: ScreenAction | 'emergency', call: () => Promise<ScreenResult>) => {
    setBusy(which)
    try {
      say(await call())
    } catch (err) {
      say({ ok: false, message: err instanceof Error ? err.message : 'No answer from the main server' })
    } finally {
      setBusy(null)
    }
  }, [say])

  const press = useCallback(
    (action: ScreenAction, extra: { projector_id?: number; confirm?: boolean } = {}) =>
      send(action, () => request<ScreenResult>('/mapping/players/me/control', { method: 'POST', body: { action, ...extra } })),
    [send],
  )
  const pressEmergency = useCallback(
    () => send('emergency', () => request<ScreenResult>('/mapping/players/me/emergency-stop', { method: 'POST' })),
    [send],
  )
  return { busy, said, press, pressEmergency }
}

/** Stop the show and Projector off ask for a second press within this long. */
const ARM_MS = 4000

function Controls({ status, emergency, hasProjector, busy, said, onPress, onEmergency }: {
  status: string | null
  emergency: boolean
  hasProjector: boolean
  busy: string | null
  said: ScreenResult | null
  onPress: (action: ScreenAction, extra?: { confirm?: boolean }) => void
  onEmergency: () => void
}) {
  const [armed, setArmed] = useState<'stop_tonight' | 'power_off' | null>(null)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(null), ARM_MS)
    return () => window.clearTimeout(t)
  }, [armed])
  const twice = (action: 'stop_tonight' | 'power_off') => {
    if (armed !== action) return setArmed(action)
    setArmed(null)
    onPress(action, { confirm: true })
  }
  const { holding, hint, handlers } = useHold(onEmergency, busy === 'emergency')
  const playing = status === 'playing'
  const paused = status === 'paused'

  return (
    <footer className="px-[2vw] pb-[calc(var(--u)*2)]">
      <div className="flex flex-wrap items-stretch gap-[0.8vw] gap-y-[calc(var(--u)*1)] portrait:[&>*]:basis-[22%]">
        <ScreenButton tone="go" disabled={emergency || busy != null} onClick={() => onPress('start_tonight')}>
          Start tonight
        </ScreenButton>
        <ScreenButton tone="go" disabled={emergency || busy != null} onClick={() => onPress('go')}>
          GO next cue
        </ScreenButton>
        <ScreenButton disabled={!(playing || paused) || busy != null} onClick={() => onPress(paused ? 'resume' : 'pause')}>
          {paused ? 'Play again' : 'Pause'}
        </ScreenButton>
        <ScreenButton tone={armed === 'stop_tonight' ? 'armed' : undefined} disabled={busy != null} onClick={() => twice('stop_tonight')}>
          {armed === 'stop_tonight' ? 'Again to stop' : 'Stop show'}
        </ScreenButton>
        <ScreenButton disabled={busy != null} onClick={() => onPress('blackout')}>
          Blackout
        </ScreenButton>
        <span className="w-[0.8vw] shrink-0 portrait:hidden" aria-hidden />
        <ScreenButton disabled={!hasProjector || emergency || busy != null} onClick={() => onPress('power_on')}>
          Projector on
        </ScreenButton>
        <ScreenButton tone={armed === 'power_off' ? 'armed' : undefined} disabled={!hasProjector || busy != null}
          onClick={() => twice('power_off')}>
          {armed === 'power_off' ? 'Again: off' : 'Projector off'}
        </ScreenButton>
        <ScreenButton disabled={busy != null} onClick={() => onPress('restart_output')}>
          Restart output
        </ScreenButton>
        <span className="w-[0.8vw] shrink-0 portrait:hidden" aria-hidden />
        <button
          type="button"
          {...handlers}
          title="Hold for one second: stops the show, blacks out every mini PC and turns every projector off"
          className="relative isolate flex-[1.4] select-none overflow-hidden rounded-xl bg-red-600 px-[1vw] py-[calc(var(--u)*1.6)] text-[length:calc(var(--u)*2.4)] font-bold leading-tight text-white ring-1 ring-red-400/50 [touch-action:none] hover:bg-red-500"
        >
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 -z-10 bg-red-900/70"
            style={{ width: holding ? '100%' : '0%', transition: holding ? `width ${HOLD_MS}ms linear` : 'width 150ms ease-out' }}
          />
          {holding ? 'Keep holding…' : hint ? 'Hold it down' : 'Emergency stop (hold)'}
        </button>
      </div>
      <p className={classNames('mt-[calc(var(--u)*0.6)] h-[calc(var(--u)*3.2)] truncate text-[length:calc(var(--u)*2.2)] leading-[calc(var(--u)*3.2)]', said?.ok === false ? 'text-amber-300' : 'text-slate-300')}>
        {busy ? 'Sending…' : said?.message ?? ''}
      </p>
    </footer>
  )
}

function ScreenButton({ children, onClick, disabled, tone }: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  tone?: 'go' | 'armed'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={classNames(
        'flex-1 rounded-xl px-[0.8vw] py-[calc(var(--u)*1.4)] text-[length:calc(var(--u)*2.2)] font-semibold leading-tight ring-1 transition-colors disabled:cursor-default disabled:opacity-35',
        tone === 'go' && 'bg-emerald-600 text-white ring-emerald-400/40 enabled:hover:bg-emerald-500',
        tone === 'armed' && 'bg-amber-500 text-black ring-amber-300 enabled:hover:bg-amber-400',
        !tone && 'bg-white/[0.08] text-white ring-white/10 enabled:hover:bg-white/[0.14]',
      )}
    >
      {children}
    </button>
  )
}
const tonightLoader = () => request<Tonight>('/tonight')
const scenesLoader = () => request<MappingScene[]>('/mapping/scenes')
const projectorsLoader = () => request<Projector[]>('/projectors')

// -- parts ------------------------------------------------------------------------------

function Frame({ children, idle }: { children: ReactNode; idle: boolean }) {
  return (
    <div className={classNames('fixed inset-0 flex flex-col overflow-hidden bg-[#05070b] text-slate-200 [--u:min(1vh,0.5625vw)]', idle && 'cursor-none')}>
      {children}
    </div>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-[calc(var(--u)*2)] text-center">{children}</div>
}

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={classNames('flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl bg-white/[0.04] px-[1.4vw] py-[calc(var(--u)*1.4)] ring-1 ring-white/[0.06]', className)}>
      <h2 className="mb-[calc(var(--u)*1)] text-[length:calc(var(--u)*1.9)] font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</h2>
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
  if (!transport) return <p className="text-[length:calc(var(--u)*3)] text-slate-500">Loading…</p>
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
    <div className="space-y-[calc(var(--u)*1.2)]">
      <p className={classNames('flex min-w-0 items-center gap-[1vw] whitespace-nowrap text-[length:calc(var(--u)*6)] font-bold leading-none', word.color)}>
        <span className={classNames('inline-block h-[calc(var(--u)*3)] w-[calc(var(--u)*3)] shrink-0 rounded-full', word.dot, transport.status === 'playing' && !emergency && 'animate-pulse')} />
        {word.text}
      </p>
      {cue && transport.status !== 'stopped' ? (
        <div>
          <p className="truncate text-[length:calc(var(--u)*4.4)] font-semibold text-white">
            {cue.position < 0 ? 'Scene' : `Cue ${cue.position + 1}${cueCount ? ` of ${cueCount}` : ''}`}
            {cue.name ? ` · ${cue.name}` : ''}
          </p>
          <p className="truncate text-[length:calc(var(--u)*2.6)] text-slate-400">
            {scene ? `${scene} on this projector` : 'No scene on this projector'}
            {playingTime != null ? ` · ${elapsedText(playingTime)} in` : ''}
          </p>
        </div>
      ) : (
        <p className="text-[length:calc(var(--u)*3.2)] text-slate-400">Nothing is playing.</p>
      )}
      {otherShow && (
        <p className="text-[length:calc(var(--u)*2.4)] text-amber-200">Another show is playing; this projector belongs to a different one.</p>
      )}
    </div>
  )
}

function TonightLine({ tonight, now }: { tonight: Tonight | null; now: number }) {
  if (!tonight) return null
  const date = new Date(now)
  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const today = tonight.state === 'running' || tonight.state === 'later'
  // From the weekly show time or the calendar: the times of tonight's show.
  const when =
    today && tonight.starts_at && tonight.ends_at
      ? `${time(tonight.starts_at)} to ${time(tonight.ends_at)}`
      : today && tonight.start_at
        ? `${clockText(tonight.start_at)} to ${clockText(tonight.end_at)}`
        : null
  const name = today ? tonight.title ?? tonight.group_name : null
  let text: string
  let tone = 'text-slate-300'
  if (tonight.state === 'running') {
    const ends = tonight.ends_at ? new Date(tonight.ends_at).getTime() - now : null
    text = `On now${ends != null && ends > 0 ? `, ${spanText(ends)} left` : ''}`
    tone = 'text-emerald-300'
  } else if (tonight.state === 'later') {
    const starts = tonight.starts_at ? new Date(tonight.starts_at).getTime() - now : null
    text = starts != null && starts > 0 ? `Starts in ${spanText(starts)}` : 'Starting'
  } else {
    text = tonight.cancelled_by
      ? `No show tonight (${tonight.cancelled_by}).`
      : tonight.state === 'done'
        ? 'Done for tonight.'
        : tonight.next_starts_at
          ? 'No show tonight.'
          : 'No show time set.'
    if (tonight.next_starts_at) {
      text += ` Next: ${whenText(tonight.next_starts_at, date)}${tonight.next_title ? `, ${tonight.next_title}` : ''}`
    }
    tone = tonight.next_starts_at ? 'text-slate-400' : 'text-slate-500'
  }
  return (
    <div className="mt-[calc(var(--u)*1.4)] border-t border-white/[0.06] pt-[calc(var(--u)*1.2)]">
      <p className="truncate text-[length:calc(var(--u)*1.9)] font-semibold uppercase tracking-[0.2em] text-slate-500">
        Tonight’s show{name ? ` · ${name}` : ''}
      </p>
      <p className="truncate text-[length:calc(var(--u)*2.8)] font-medium">
        {when && <span className="font-semibold text-white">{when} · </span>}
        <span className={tone}>{text}</span>
      </p>
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
              'absolute inset-x-0 bottom-0 px-[1vw] py-[calc(var(--u)*0.6)] text-center text-[length:calc(var(--u)*2.2)]',
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
  return <p className="tnum mt-[calc(var(--u)*1)] truncate text-[length:calc(var(--u)*2.2)] text-slate-400">{facts.join(' · ')}</p>
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
    <div className="min-w-0">
      <p className="truncate text-[length:calc(var(--u)*1.8)] text-slate-500">{label}</p>
      <p className={classNames('truncate text-[length:calc(var(--u)*3.2)] font-semibold leading-tight', className ?? 'text-white')}>{children}</p>
    </div>
  )
}

function ProjectorStatus({ projector, linked, hasOutput, guessed, outputName, choices, onLink }: {
  projector: Projector | null
  linked: boolean
  hasOutput: boolean
  guessed: boolean
  outputName: string | null
  choices: Projector[]
  onLink: (projectorId: number) => void
}) {
  if (!hasOutput) {
    return <p className="text-[length:calc(var(--u)*3)] text-slate-400">Pick an output for this mini PC on Mapping → Players.</p>
  }
  if (!linked) {
    return (
      <div className="space-y-[calc(var(--u)*1.4)]">
        <p className="text-[length:calc(var(--u)*3)] text-slate-300">
          Which projector does {outputName ?? 'this output'} drive?{choices.length ? ' Click it:' : ''}
        </p>
        {choices.length > 0 ? (
          <div className="flex flex-wrap gap-[0.8vw]">
            {choices.map((p) => (
              <button key={p.id} type="button" onClick={() => onLink(p.id)}
                className="rounded-xl bg-sky-600 px-[1.4vw] py-[calc(var(--u)*1.2)] text-[length:calc(var(--u)*2.6)] font-semibold text-white ring-1 ring-sky-400/40 hover:bg-sky-500">
                {p.name}
                <span className="ml-[0.6vw] text-[length:calc(var(--u)*1.9)] font-normal text-sky-100/80">{p.model}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[length:calc(var(--u)*2.4)] text-slate-500">Add the projector on the Projectors page first.</p>
        )}
      </div>
    )
  }
  if (!projector) return <p className="text-[length:calc(var(--u)*3)] text-slate-500">Loading…</p>

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
    <div className="space-y-[calc(var(--u)*1.4)]">
      <div className="flex items-baseline justify-between gap-x-[1.6vw]">
        <p className="min-w-0 truncate text-[length:calc(var(--u)*3.2)] font-semibold text-white">
          {projector.name}
          <span className="ml-[0.8vw] text-[length:calc(var(--u)*2)] font-normal text-slate-500">
            {projector.manufacturer} {projector.model} · {projector.host}
          </span>
        </p>
        <p className={classNames('shrink-0 text-[length:calc(var(--u)*2.6)] font-semibold', live ? 'text-emerald-300' : 'text-red-300')}>
          {live ? 'Answering' : state.last_seen_at ? 'Not answering' : 'Never reached'}
        </p>
      </div>
      {guessed && (
        <p className="text-[length:calc(var(--u)*2)] text-slate-500">
          The only projector there is. Link it to {outputName ?? 'this output'} on the Editor’s Projectors tab to be sure.
        </p>
      )}

      <div className="grid grid-cols-4 gap-x-[1.2vw] gap-y-[calc(var(--u)*1)]">
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
          <Fact label="Lamp hours"
            className={lampHours >= projector.lamp_critical_hours ? 'text-red-300' : lampHours >= projector.lamp_warn_hours ? 'text-yellow-200' : 'text-white'}>
            {formatHours(lampHours)}
          </Fact>
        )}
        {temperatures.map((sensor) => (
          <Fact key={sensor.key} label={sensor.label}>
            {sensor.fahrenheit} °F
          </Fact>
        ))}
      </div>

      {(() => {
        // Only what needs a look, so a healthy projector takes one line.
        const flagged = erst ? CONDITIONS.filter((c) => erst[c.key] && erst[c.key] !== 'ok') : []
        return (
          <>
            {flagged.length > 0 && (
              <div className="flex flex-wrap gap-[0.6vw]">
                {flagged.map((c) => {
                  const look = conditionLook(erst![c.key])
                  return (
                    <span key={c.key} className={classNames('rounded-lg px-[0.8vw] py-[calc(var(--u)*0.4)] text-[length:calc(var(--u)*2.2)] font-medium', look.className)}>
                      {c.label} {look.text}
                    </span>
                  )
                })}
              </div>
            )}
            {problems.length > 0 ? (
              <ul className="space-y-[calc(var(--u)*0.4)]">
                {problems.slice(0, 3).map((item) => (
                  <li key={item.text} className={classNames('truncate text-[length:calc(var(--u)*2.6)] font-medium', item.severity === 'critical' ? 'text-red-300' : 'text-yellow-200')}>
                    {item.text}
                    {item.detail && <span className="ml-[0.8vw] text-[length:calc(var(--u)*2.2)] font-normal text-slate-400">{item.detail}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              live && (
                <p className="truncate text-[length:calc(var(--u)*2.6)] text-emerald-300">
                  {erst && flagged.length === 0 ? 'All checks OK. ' : ''}No errors or warnings.
                </p>
              )
            )}
            {!erst && (
              <p className="truncate text-[length:calc(var(--u)*2)] text-slate-500">
                Fans, filter and cover are not reported: turn PJLink on in the projector’s network menu.
              </p>
            )}
          </>
        )
      })()}
    </div>
  )
}
