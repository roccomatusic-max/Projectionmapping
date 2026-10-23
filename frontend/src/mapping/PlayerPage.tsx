import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, enterPlayerMode, getToken, request, setPlayerToken } from '@/api/client'
import { enterFullscreen, OutputScreen, OVERLAY_EVENT } from './OutputPage'
import { trackingDelayMs } from './people'
import type { Show } from './types'

/**
 * A player: the page a small computer beside a projector opens full screen.
 *
 * First run shows a pairing code on the projector. Once an administrator
 * approves that code on the Mapping page and picks an output, this page
 * renders that output from then on, including after a reboot. The media
 * the show uses is downloaded to this machine ahead of time when the
 * browser allows it.
 */

const PLAYER_KEY = 'pc.player'
const HELLO_MS = 3000
const REPORT_MS = 5000

interface Identity {
  device_id: string
  secret: string
  name: string
}

interface Assignment {
  player_id: number
  name: string
  output_id: number | null
  show_id: number | null
  /** Asked from the Players page, each to do once: "reload", "overlay_on", "overlay_off". */
  commands?: string[]
}

function obey(commands: string[] | undefined) {
  for (const command of commands ?? []) {
    if (command === 'reload') window.location.reload()
    if (command === 'overlay_on' || command === 'overlay_off')
      window.dispatchEvent(new CustomEvent(OVERLAY_EVENT, { detail: command === 'overlay_on' }))
  }
}

type CacheState = { mode: 'off' | 'syncing' | 'on'; bytes: number; failed: number }

function randomHex(bytes: number) {
  const values = crypto.getRandomValues(new Uint8Array(bytes))
  return Array.from(values, (b) => b.toString(16).padStart(2, '0')).join('')
}

function identity(): Identity {
  let stored: Identity | null = null
  try {
    stored = JSON.parse(localStorage.getItem(PLAYER_KEY) ?? 'null') as Identity | null
  } catch {
    /* regenerate */
  }
  // The Mini PC app opens this page with its computer's identity in the
  // fragment, which never reaches the server. Using it lets the camera on
  // the same computer pair together with this player.
  const given = new URLSearchParams(window.location.hash.slice(1))
  const device_id = given.get('device_id')
  const secret = given.get('secret')
  if (device_id && secret) {
    history.replaceState(null, '', window.location.pathname + window.location.search)
    const fromApp = { device_id, secret, name: given.get('name') || stored?.name || 'Mini PC' }
    if (stored?.device_id !== device_id) setPlayerToken(null)
    localStorage.setItem(PLAYER_KEY, JSON.stringify(fromApp))
    return fromApp
  }
  if (stored?.device_id && stored.secret) return stored
  const id = randomHex(12)
  const created = { device_id: id, secret: randomHex(32), name: `Player ${id.slice(-4).toUpperCase()}` }
  localStorage.setItem(PLAYER_KEY, JSON.stringify(created))
  return created
}

// This tab is a player from the moment the page loads: every request,
// media URL and the live feed below use the player's own token.
enterPlayerMode()

export default function PlayerPage() {
  const me = useRef(identity()).current
  const [code, setCode] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(() => getToken())
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [cache, setCache] = useState<CacheState>({ mode: 'off', bytes: 0, failed: 0 })
  const stats = useRef<Record<string, unknown>>({})

  useEffect(() => {
    document.title = 'Player'
  }, [])

  // -- pairing ---------------------------------------------------------------
  useEffect(() => {
    if (token) return
    let stopped = false
    const hello = async () => {
      try {
        const reply = await request<{ status: string; code: string; access_token: string | null }>(
          '/mapping/players/hello',
          { method: 'POST', body: me },
        )
        if (stopped) return
        setCode(reply.code)
        setProblem(null)
        if (reply.access_token) {
          setPlayerToken(reply.access_token)
          setToken(reply.access_token)
        }
      } catch (err) {
        if (!stopped) setProblem(err instanceof Error ? err.message : 'Cannot reach the server')
      }
    }
    void hello()
    const timer = window.setInterval(() => void hello(), HELLO_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [token, me])

  // -- heartbeat -------------------------------------------------------------
  const report = useCallback(async () => {
    try {
      const next = await request<Assignment>('/mapping/players/me', {
        method: 'POST',
        body: { ...stats.current, cache: cache.mode, cached_bytes: cache.bytes },
      })
      obey(next.commands)
      setAssignment((current) =>
        current &&
        current.output_id === next.output_id &&
        current.show_id === next.show_id &&
        current.name === next.name
          ? current
          : next,
      )
      setProblem(null)
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
        // Removed on the server: start pairing again.
        setPlayerToken(null)
        setAssignment(null)
        setToken(null)
      } else {
        setProblem(err instanceof Error ? err.message : 'Cannot reach the server')
      }
    }
  }, [cache.mode, cache.bytes])

  useEffect(() => {
    if (!token) return
    void report()
    const timer = window.setInterval(() => void report(), REPORT_MS)
    // A re-assignment is pushed as a bus message; react to it at once.
    const onChange = () => void report()
    window.addEventListener('pc:player-changed', onChange)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('pc:player-changed', onChange)
    }
  }, [token, report])

  // -- media cache -----------------------------------------------------------
  useEffect(() => {
    if (!token || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/media-sw.js').catch(() => setCache((c) => ({ ...c, mode: 'off' })))
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type: string; bytes?: number; failed?: number }
      if (data.type === 'synced') {
        setCache({ mode: data.failed ? 'syncing' : 'on', bytes: data.bytes ?? 0, failed: data.failed ?? 0 })
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [token])

  const syncMedia = useCallback(
    async (show: Show, sceneMedia: number[] = []) => {
      if (!('serviceWorker' in navigator) || !token) return
      // Pictures given to single projectors too: the computer may be moved to another projector.
      const cueMedia = show.cues.flatMap((c) => [c.media_id, ...Object.values(c.output_media ?? {})])
      const ids = [...new Set([...cueMedia.filter((id): id is number => id != null), ...sceneMedia])]
      try {
        const registration = await navigator.serviceWorker.ready
        setCache((c) => ({ ...c, mode: 'syncing' }))
        registration.active?.postMessage({ type: 'sync', ids, token })
      } catch {
        setCache((c) => ({ ...c, mode: 'off' }))
      }
    },
    [token],
  )

  // -- screens ---------------------------------------------------------------
  if (!token) {
    return (
      <Screen>
        <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Pair this player</p>
        <p className="font-mono text-[18vh] font-semibold leading-none tracking-[0.15em] text-white">
          {code ?? '······'}
        </p>
        <p className="max-w-xl text-center text-lg text-slate-400">
          Open <span className="text-slate-200">Mapping → Players</span> on {window.location.host} and approve
          this code.
        </p>
        <p className="text-sm text-slate-600">{me.name}</p>
        {problem && <p className="text-sm text-amber-400">{problem}</p>}
      </Screen>
    )
  }

  if (!assignment || assignment.output_id == null || assignment.show_id == null) {
    return (
      <Screen>
        <p className="text-4xl font-semibold text-white">{assignment?.name ?? me.name}</p>
        <p className="text-lg text-slate-400">Paired. Waiting for an output to be assigned.</p>
        {problem && <p className="text-sm text-amber-400">{problem}</p>}
      </Screen>
    )
  }

  return (
    <OutputScreen
      key={`${assignment.show_id}:${assignment.output_id}`}
      showId={assignment.show_id}
      outputId={assignment.output_id}
      playerId={assignment.player_id}
      onShow={syncMedia}
      onStats={(s) => {
        stats.current = {
          fps: Math.round(s.fps * 10) / 10,
          drift_ms: s.drift == null ? null : Math.round(s.drift * 1000),
          width: s.width,
          height: s.height,
          cue: s.cue,
          people_ms: trackingDelayMs(),
          clock_ms: s.clockMs,
          link: s.link,
          overlay: s.overlay,
        }
      }}
      hudExtra={
        <p className="text-slate-400">
          player {assignment.name} · media cache {cache.mode}
          {cache.bytes ? ` (${(cache.bytes / 1e9).toFixed(2)} GB)` : ''}
          {cache.failed ? ` · ${cache.failed} file(s) failed` : ''}
          {problem ? ` · ${problem}` : ''}
        </p>
      }
    />
  )
}

function Screen({ children }: { children: React.ReactNode }) {
  // In kiosk mode the window already covers the display; anywhere else the
  // browser's own bars are still showing until someone clicks once.
  const [framed, setFramed] = useState(isFramed)
  useEffect(() => {
    const update = () => setFramed(isFramed())
    document.addEventListener('fullscreenchange', update)
    window.addEventListener('resize', update)
    return () => {
      document.removeEventListener('fullscreenchange', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  return (
    <div
      className="fixed inset-0 flex cursor-none flex-col items-center justify-center gap-6 bg-black"
      onClick={enterFullscreen}
    >
      {children}
      {framed && <p className="text-sm text-slate-500">Click anywhere to fill the screen.</p>}
    </div>
  )
}

function isFramed() {
  return !document.fullscreenElement && window.innerHeight < window.screen.height
}
