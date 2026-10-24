import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { api, clearSession, getSession, type Session } from '@/api/client'
import type { CommandResult, Projector } from '@/api/types'
import { ConfirmDialog } from '@/components/ui'
import { EmergencyBanner, EmergencyStopButton, type UsePower } from '@/components/EmergencyStop'
import {
  AddToHomeIcon,
  BlackoutIcon,
  ChevronDownIcon,
  ClockIcon,
  MoreIcon,
  PauseIcon,
  PowerIcon,
  ProjectorIcon,
  SceneIcon,
  ShareIcon,
  ShutterIcon,
  SignOutIcon,
  StopIcon,
} from '@/components/icons'
import { useFleet } from '@/hooks/useLiveData'
import { OUTCOME_LABEL, classNames } from '@/lib/format'
import { mappingApi } from '@/mapping/api'
import { formatDuration } from '@/mapping/editor/controls'
import { ServerClock, useMappingFeed } from '@/mapping/live'
import type { Show, ShowSummary, TransportAction, TransportState } from '@/mapping/types'
import { addHomeScreenTags, onHomeScreen, phoneKind } from './homeScreen'
import TonightTab from './TonightTab'

/**
 * Show Remote: run the show and switch the projectors from a phone.
 *
 * Opened at /remote on the main computer and added to the phone's Home
 * Screen, where it opens full screen like an app. Built for one thumb, in
 * the dark: big targets, live state, and nothing that can be pressed by
 * accident that cannot be undone straight away.
 */

const SHOW_KEY = 'pc.remote.show'
type Tab = 'show' | 'tonight' | 'projectors'

export default function RemotePage() {
  const [session, setSession] = useState<Session | null>(() => getSession())
  const [tab, setTab] = useState<Tab>('show')

  useEffect(() => {
    addHomeScreenTags()
    const onUnauthorized = () => setSession(null)
    window.addEventListener('pc:unauthorized', onUnauthorized)
    return () => window.removeEventListener('pc:unauthorized', onUnauthorized)
  }, [])

  const signOut = () => {
    clearSession()
    setSession(null)
  }

  return (
    <div className="remote-app flex h-[100dvh] flex-col bg-panel-950 pt-[env(safe-area-inset-top)] text-slate-200">
      {!session ? (
        <Welcome onSignedIn={setSession} />
      ) : (
        <SignedIn session={session} tab={tab} onTab={setTab} onSignOut={signOut} />
      )}
    </div>
  )
}

/** Each projector's power, read only while the emergency stop's report is open. */
const usePhonePower: UsePower = () => {
  const { projectors } = useFleet(5000)
  return (id) => projectors.find((p) => p.id === id)?.state.power
}

function SignedIn({ session, tab, onTab, onSignOut }: {
  session: Session
  tab: Tab
  onTab: (tab: Tab) => void
  onSignOut: () => void
}) {
  const canRun = session.role === 'admin' || session.role === 'operator'
  const [showId, setShowId] = useState<number | null>(() => Number(localStorage.getItem(SHOW_KEY)) || null)
  // One live link for both tabs: the emergency stop is on either.
  const live = useTransport(showId)

  useEffect(() => {
    if (showId != null) localStorage.setItem(SHOW_KEY, String(showId))
  }, [showId])

  return (
    <>
      {canRun && (
        <div className="space-y-2 px-4 pt-2">
          <EmergencyBanner emergency={live.transport?.emergency} canClear={canRun} variant="remote" />
          <EmergencyStopButton variant="remote" usePower={usePhonePower} />
        </div>
      )}
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === 'show'
          ? <ShowTab session={session} onSignOut={onSignOut} showId={showId} onShowId={setShowId} live={live} />
          : tab === 'tonight'
            ? <TonightTab session={session} transport={live.transport} />
            : <ProjectorsTab session={session} />}
      </main>
      <nav className="grid grid-cols-3 border-t border-white/[0.06] bg-panel-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <TabButton active={tab === 'show'} onClick={() => onTab('show')} icon={<SceneIcon size={22} />} label="Show" />
        <TabButton active={tab === 'tonight'} onClick={() => onTab('tonight')} icon={<ClockIcon size={22} />} label="Tonight" />
        <TabButton active={tab === 'projectors'} onClick={() => onTab('projectors')}
          icon={<ProjectorIcon size={22} />} label="Projectors" />
      </nav>
    </>
  )
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={classNames('flex flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-medium', active ? 'text-sky-300' : 'text-slate-500')}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      {label}
    </button>
  )
}

function AppMark({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  return (
    <img src="/remote-icon-180.png" alt="" aria-hidden
      className={classNames('shadow-lg shadow-black/40', size === 'lg' ? 'h-20 w-20 rounded-[22px]' : 'h-9 w-9 rounded-[10px]')} />
  )
}

// -- first open: add to the Home Screen, then sign in ---------------------------------

function Welcome({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  // A Home Screen app keeps its own sign-in, separate from Safari's, so
  // it is added first and signed in to once, there.
  const [install, setInstall] = useState(() => !onHomeScreen() && phoneKind() !== 'other')
  return install ? <InstallGuide onSkip={() => setInstall(false)} /> : <SignIn onSignedIn={onSignedIn} />
}

function InstallGuide({ onSkip }: { onSkip: () => void }) {
  const iphone = phoneKind() === 'iphone'
  const steps: Array<{ icon: ReactNode; text: ReactNode }> = iphone
    ? [
        { icon: <ShareIcon size={20} />, text: <>Tap <b className="text-slate-100">Share</b> in Safari&apos;s toolbar</> },
        { icon: <AddToHomeIcon size={20} />, text: <>Choose <b className="text-slate-100">Add to Home Screen</b>, then <b className="text-slate-100">Add</b></> },
        { icon: <SceneIcon size={20} />, text: <>Open <b className="text-slate-100">Show Remote</b> from your Home Screen and sign in</> },
      ]
    : [
        { icon: <MoreIcon size={20} />, text: <>Tap the <b className="text-slate-100">⋮</b> menu in Chrome</> },
        { icon: <AddToHomeIcon size={20} />, text: <>Choose <b className="text-slate-100">Add to Home screen</b></> },
        { icon: <SceneIcon size={20} />, text: <>Open <b className="text-slate-100">Show Remote</b> from your Home screen and sign in</> },
      ]
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="text-center">
        <div className="flex justify-center"><AppMark /></div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-50">Show Remote</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-400">
          Put it on your Home Screen and it opens full screen, like an app.
        </p>
      </div>
      <ol className="mt-8 space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-4 rounded-2xl bg-panel-900 px-4 py-3.5 ring-1 ring-white/[0.06]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300">{step.icon}</span>
            <span className="text-[15px] leading-snug text-slate-300">{step.text}</span>
          </li>
        ))}
      </ol>
      <button className="mt-8 text-sm text-slate-500 underline-offset-4 active:underline" onClick={onSkip}>
        Use it in the browser instead
      </button>
    </div>
  )
}

function SignIn({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onSignedIn(await api.login(username, password, true))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="mb-4 text-center">
        <div className="flex justify-center"><AppMark /></div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-50">Show Remote</h1>
        <p className="mt-2 text-[15px] text-slate-400">Sign in with your Projector Control account. This phone stays signed in.</p>
      </div>
      {error && <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/25">{error}</p>}
      <input className="input rounded-xl px-4 py-3.5 text-base" placeholder="Username" aria-label="Username" value={username}
        autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        onChange={(e) => setUsername(e.target.value)} required />
      <input className="input rounded-xl px-4 py-3.5 text-base" type="password" placeholder="Password" aria-label="Password"
        value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} required />
      <button className="btn-primary mt-2 rounded-xl py-3.5 text-base" disabled={busy || !username || !password}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

// -- the show ----------------------------------------------------------------------

const STATUS: Record<TransportState['status'], { label: string; dot: string; text: string; glow: string }> = {
  playing: { label: 'Playing', dot: 'bg-emerald-400', text: 'text-emerald-300', glow: 'from-emerald-500/20' },
  paused: { label: 'Paused', dot: 'bg-amber-400', text: 'text-amber-300', glow: 'from-amber-500/15' },
  stopped: { label: 'Stopped', dot: 'bg-slate-500', text: 'text-slate-400', glow: 'from-slate-500/10' },
  blackout: { label: 'Blackout', dot: 'bg-red-500', text: 'text-red-300', glow: 'from-red-500/15' },
}

/** The show, the transport and a synced clock, kept live. No media is loaded. */
function useTransport(showId: number | null) {
  const [show, setShow] = useState<Show | null>(null)
  const [transport, setTransport] = useState<TransportState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const clock = useRef(new ServerClock()).current

  const refresh = useCallback(async () => {
    try {
      const [loaded, state] = await Promise.all([
        showId != null ? mappingApi.getShow(showId) : Promise.resolve(null),
        mappingApi.transport(),
      ])
      setShow(loaded)
      setTransport(state)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the show')
    }
  }, [showId])

  useEffect(() => {
    clock.start()
    return () => clock.stop()
  }, [clock])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // A phone sleeps between cues; catch up the moment it is looked at again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void refresh()
      void clock.sync(3)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh, clock])

  const link = useMappingFeed((message) => {
    const payload = message.payload as Record<string, unknown>
    if (message.type === 'mapping_transport') setTransport(payload as unknown as TransportState)
    else if (message.type === 'mapping_show' && payload.show_id === showId) void refresh()
    else if (message.type === 'mapping_reconnected') void refresh()
  })

  return { show, transport, clock, link, error }
}

function ShowTab({ session, onSignOut, showId, onShowId: setShowId, live }: {
  session: Session
  onSignOut: () => void
  showId: number | null
  onShowId: (update: number | null | ((current: number | null) => number | null)) => void
  live: ReturnType<typeof useTransport>
}) {
  const canRun = session.role === 'admin' || session.role === 'operator'
  const [shows, setShows] = useState<ShowSummary[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [menu, setMenu] = useState(false)
  const { show, transport, clock, link, error } = live
  const [, tick] = useState(0)

  useEffect(() => {
    mappingApi
      .listShows()
      .then((list) => {
        setShows(list)
        setShowId((current) => (current && list.some((s) => s.id === current) ? current : list[0]?.id ?? null))
      })
      .catch((err) => setProblem(err instanceof Error ? err.message : 'Could not load the shows'))
  }, [setShowId])

  // Follow the show that goes live, wherever it was started from.
  useEffect(() => {
    if (transport?.show_id && transport.status !== 'stopped') setShowId(transport.show_id)
  }, [transport?.show_id, transport?.status, setShowId])

  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 250)
    return () => window.clearInterval(timer)
  }, [])

  const command = async (action: TransportAction, cue?: number) => {
    if (!show) return
    setBusy(true)
    try {
      // GO on a show that is not the live one starts it from its first cue.
      if (action === 'go' && transport?.show_id !== show.id) await mappingApi.command('goto', { show_id: show.id, cue: 0 })
      else if (action === 'goto') await mappingApi.command('goto', { show_id: show.id, cue })
      else await mappingApi.command(action, { show_id: show.id })
      setProblem(null)
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'The command did not go through')
    } finally {
      setBusy(false)
    }
  }

  const held = !!transport?.emergency
  // A scene an automation plays on its own is live on every show; GO then starts this one.
  const thisShow = !!show && (transport?.show_id === show.id || (transport?.current?.position ?? 0) < 0)
  const status = thisShow && transport ? transport.status : 'stopped'
  const look = STATUS[status]
  const current = thisShow ? transport?.current ?? null : null
  const nextIndex = current ? current.position + 1 : 0
  const next = show?.cues[nextIndex]
  const elapsed =
    current && transport
      ? transport.status === 'paused'
        ? transport.paused_position ?? 0
        : Math.max(0, (clock.now() - current.started_at_ms) / 1000)
      : null
  const message = problem ?? error

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-6 pt-3">
      <header className="flex items-center gap-3">
        <AppMark size="sm" />
        <div className="min-w-0 flex-1">
          {shows && shows.length > 1 ? (
            <label className="relative flex max-w-full items-center gap-1">
              <span className="truncate text-[17px] font-semibold text-slate-50">{show?.name ?? 'Choose a show'}</span>
              <ChevronDownIcon size={18} className="shrink-0 text-slate-400" />
              {/* The phone's own picker opens over the name. */}
              <select className="absolute inset-0 opacity-0" value={showId ?? ''} aria-label="Show"
                onChange={(e) => setShowId(Number(e.target.value))}>
                {shows.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          ) : (
            <p className="truncate text-[17px] font-semibold text-slate-50">{show?.name ?? 'Show Remote'}</p>
          )}
          <p className={classNames('flex items-center gap-1.5 text-xs', link === 'open' ? 'text-slate-500' : 'text-amber-300')}>
            <span className={classNames('h-1.5 w-1.5 rounded-full', link === 'open' ? 'bg-emerald-400' : 'animate-pulse bg-amber-400')} />
            {link === 'open' ? 'Live' : 'Reconnecting…'}
          </p>
        </div>
        <div className="relative">
          <button className="flex h-10 w-10 items-center justify-center rounded-full bg-panel-850 text-slate-300 ring-1 ring-white/[0.06]"
            onClick={() => setMenu((open) => !open)} aria-label="Menu" aria-expanded={menu}>
            <MoreIcon size={20} />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-2xl bg-panel-850 shadow-xl shadow-black/50 ring-1 ring-white/10">
                <p className="border-b border-white/[0.06] px-4 py-3 text-xs text-slate-500">Signed in as {session.username}</p>
                <button className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] text-slate-200 active:bg-white/5" onClick={onSignOut}>
                  <SignOutIcon size={18} /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {link !== 'open' && (
        <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200 ring-1 ring-amber-500/20">
          Can&apos;t reach Projector Control right now. What you see may be out of date.
        </p>
      )}
      {message && (
        <button className="rounded-2xl bg-red-500/10 px-4 py-3 text-left text-sm text-red-300 ring-1 ring-red-500/20" onClick={() => setProblem(null)}>
          {message}
        </button>
      )}

      {shows && shows.length === 0 && (
        <p className="rounded-2xl bg-panel-900 p-5 text-[15px] text-slate-400 ring-1 ring-white/[0.06]">
          No shows yet. Make one on the Mapping tab of Projector Control.
        </p>
      )}

      {show && (
        <>
          <section aria-live="polite"
            className={classNames('relative overflow-hidden rounded-3xl bg-panel-900 p-5 ring-1 ring-white/[0.06]')}>
            <div className={classNames('pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent', look.glow)} />
            <div className="relative">
              <div className="flex items-center justify-between">
                <span className={classNames('flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em]', look.text)}>
                  <span className={classNames('h-2 w-2 rounded-full', look.dot, status === 'playing' && 'animate-pulse')} />
                  {look.label}
                </span>
                <span className="tnum text-3xl font-semibold tracking-tight text-slate-50">{formatDuration(elapsed)}</span>
              </div>
              <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">Now</p>
              <p className="mt-0.5 truncate text-[22px] font-semibold leading-tight text-slate-50">
                {current ? <><span className="text-slate-500">{current.position < 0 ? 'Scene' : current.position + 1}</span>  {current.name || 'Untitled cue'}</> : 'Nothing playing'}
              </p>
              <div className="mt-4 border-t border-white/[0.06] pt-3">
                <p className="truncate text-[15px] text-slate-400">
                  <span className="text-slate-500">Up next </span>
                  {next ? <span className="text-slate-200">{nextIndex + 1}  {next.name || 'Untitled cue'}</span>
                    : show.cues.length ? 'End of the show' : 'No cues yet'}
                </p>
              </div>
            </div>
          </section>

          <button
            className="group relative flex h-40 flex-col items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-b from-emerald-500 to-emerald-700 text-white shadow-[0_18px_40px_-16px_rgba(16,185,129,0.75),inset_0_1px_0_rgba(255,255,255,0.25)] transition duration-100 active:scale-[0.97] active:from-emerald-400 disabled:from-panel-750 disabled:to-panel-800 disabled:text-slate-500 disabled:shadow-none"
            disabled={!canRun || busy || !next || held}
            onClick={() => void command('go')}
          >
            <span className="text-6xl font-bold tracking-wider">GO</span>
            {held ? <span className="mt-1 text-sm font-medium">Held by the emergency stop</span>
              : next && <span className="mt-1 max-w-[85%] truncate text-sm font-medium text-white/80">{next.name || `Cue ${nextIndex + 1}`}</span>}
          </button>

          <div className="grid grid-cols-3 gap-3">
            {status === 'paused' ? (
              <BigButton icon={<SceneIcon size={22} />} label="Resume" disabled={!canRun || busy || held} onClick={() => void command('resume')} />
            ) : (
              <BigButton icon={<PauseIcon size={22} />} label="Pause" disabled={!canRun || busy || status !== 'playing'}
                onClick={() => void command('pause')} />
            )}
            <BigButton icon={<StopIcon size={22} />} label="Stop" disabled={!canRun || busy || status === 'stopped'}
              onClick={() => void command('stop')} />
            <BigButton icon={<BlackoutIcon size={22} />} label="Blackout" tone="danger" disabled={!canRun || busy || status === 'blackout'}
              onClick={() => void command('blackout')} />
          </div>
          {!canRun && <p className="text-center text-sm text-slate-500">Your account can watch the show but not run it.</p>}

          <section className="mt-1">
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Cues</h2>
            <ol className="overflow-hidden rounded-3xl bg-panel-900 ring-1 ring-white/[0.06]">
              {show.cues.map((cue, i) => {
                const live = current?.id === cue.id
                const open = picked === cue.id
                return (
                  <li key={cue.id} className={classNames(i > 0 && 'border-t border-white/[0.05]', live && 'bg-emerald-500/[0.07]')}>
                    <button className="flex w-full items-center gap-3 px-4 py-4 text-left active:bg-white/[0.03]"
                      onClick={() => setPicked(open ? null : cue.id)} aria-expanded={open}>
                      <span className={classNames('tnum flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                        live ? 'bg-emerald-500 text-white' : 'bg-panel-800 text-slate-400')}>
                        {cue.position + 1}
                      </span>
                      <span className={classNames('min-w-0 flex-1 truncate text-[16px]', live ? 'font-medium text-emerald-100' : 'text-slate-200')}>
                        {cue.name || 'Untitled cue'}
                      </span>
                      {live && <span className={classNames('text-xs font-medium', look.text)}>{look.label}</span>}
                    </button>
                    {open && (
                      <div className="flex gap-2 px-4 pb-4">
                        <button className="btn-primary flex-1 rounded-xl py-3 text-[15px]" disabled={!canRun || busy || held}
                          onClick={() => {
                            setPicked(null)
                            void command('goto', cue.position)
                          }}>
                          Play now
                        </button>
                        <button className="btn-default rounded-xl px-5 py-3 text-[15px]" onClick={() => setPicked(null)}>Cancel</button>
                      </div>
                    )}
                  </li>
                )
              })}
              {show.cues.length === 0 && <li className="px-4 py-4 text-[15px] text-slate-500">Add cues on the Mapping tab.</li>}
            </ol>
          </section>
        </>
      )}
    </div>
  )
}

function BigButton({ icon, label, tone = 'default', disabled, onClick }: {
  icon: ReactNode
  label: string
  tone?: 'default' | 'danger' | 'caution'
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      className={classNames(
        'flex h-[5.5rem] flex-col items-center justify-center gap-2 rounded-2xl text-[13px] font-semibold transition duration-100 active:scale-[0.96] disabled:opacity-40',
        tone === 'danger'
          ? 'bg-red-600/90 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] active:bg-red-500'
          : tone === 'caution'
            ? 'bg-panel-800 text-red-300 ring-1 ring-red-500/20 active:bg-panel-700'
            : 'bg-panel-800 text-slate-100 ring-1 ring-white/[0.06] active:bg-panel-700',
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  )
}

// -- the projectors -----------------------------------------------------------------

const POWER_LABEL: Record<Projector['state']['power'], string> = {
  on: 'On',
  off: 'Off',
  warming: 'Warming up',
  cooling: 'Cooling down',
  unknown: 'Unknown',
}

type Pending = { title: string; body: string; run: () => Promise<void> }

function ProjectorsTab({ session }: { session: Session }) {
  const canControl = session.role === 'admin' || session.role === 'operator'
  const { projectors, loading, error, refresh, wsStatus } = useFleet(10000)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const enabled = projectors.filter((p) => p.enabled)
  const online = enabled.filter((p) => p.state.online && !p.state.stale).length

  /** Run a command, then read the projectors it went to straight away
   *  rather than waiting for the next poll, so the list shows what they did. */
  const run = async (ids: number[], work: () => Promise<string | void>) => {
    setBusy(true)
    try {
      setNote((await work()) || null)
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'The command did not go through')
    } finally {
      setBusy(false)
      await Promise.allSettled(ids.map((id) => api.status(id, true)))
      void refresh()
    }
  }

  const all = (capability: string, state: string, what: string) =>
    run(enabled.map((p) => p.id), async () => {
      const { results } = await api.allCommand(capability, { state })
      return describe(results, what)
    })


  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-6 pt-3">
      <header className="flex items-center gap-3">
        <AppMark size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold text-slate-50">Projectors</p>
          <p className={classNames('flex items-center gap-1.5 text-xs', wsStatus === 'open' ? 'text-slate-500' : 'text-amber-300')}>
            <span className={classNames('h-1.5 w-1.5 rounded-full', wsStatus === 'open' ? 'bg-emerald-400' : 'animate-pulse bg-amber-400')} />
            {loading ? 'Loading…' : `${online} of ${enabled.length} answering`}
          </p>
        </div>
      </header>

      {(note || error) && (
        <button className="rounded-2xl bg-panel-850 px-4 py-3 text-left text-sm text-slate-200 ring-1 ring-white/10" onClick={() => setNote(null)}>
          {note ?? error}
        </button>
      )}

      {canControl && enabled.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <BigButton icon={<PowerIcon size={22} />} label="All on" disabled={busy} onClick={() => void all('power.set', 'on', 'Turning on')} />
          <BigButton icon={<PowerIcon size={22} />} label="All off" tone="caution" disabled={busy}
            onClick={() => setPending({
              title: 'Turn every projector off?',
              body: 'They cool down first and cannot be turned back on until they have.',
              run: () => all('power.set', 'off', 'Turning off'),
            })} />
          <BigButton icon={<ShutterIcon size={22} />} label="Open shutters" disabled={busy}
            onClick={() => void all('shutter.set', 'open', 'Shutters open')} />
          <BigButton icon={<ShutterIcon size={22} />} label="Close shutters" disabled={busy}
            onClick={() => void all('shutter.set', 'closed', 'Shutters closed')} />
        </div>
      )}

      <ul className="overflow-hidden rounded-3xl bg-panel-900 ring-1 ring-white/[0.06]">
        {projectors.map((p, i) => {
          const live = p.state.online && !p.state.stale
          const on = p.state.power === 'on' || p.state.power === 'warming'
          const shut = p.state.shutter === 'closed'
          return (
            <li key={p.id} className={classNames('flex items-center gap-3 px-4 py-3.5', i > 0 && 'border-t border-white/[0.05]')}>
              <span className={classNames('h-2.5 w-2.5 shrink-0 rounded-full',
                !p.enabled ? 'bg-slate-600' : !live ? 'bg-red-400' : on ? 'bg-emerald-400' : 'bg-slate-500')} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] text-slate-100">{p.name}</p>
                <p className="truncate text-[13px] text-slate-500">
                  {!p.enabled ? 'Switched off in Projector Control' : !live ? 'Not answering'
                    : `${POWER_LABEL[p.state.power]}${shut ? ' · shutter closed' : ''}`}
                </p>
              </div>
              {canControl && p.enabled && (
                <div className="flex shrink-0 gap-2">
                  <RoundButton active={!shut && on} disabled={busy || !live} label={shut ? `Open ${p.name}'s shutter` : `Close ${p.name}'s shutter`}
                    onClick={() => void run([p.id], async () => describe([await api.shutter(p.id, shut ? 'open' : 'closed')],
                      shut ? 'Open shutter' : 'Close shutter'))}>
                    <ShutterIcon size={19} />
                  </RoundButton>
                  <RoundButton active={on} disabled={busy || !live} label={on ? `Turn ${p.name} off` : `Turn ${p.name} on`}
                    onClick={() =>
                      on
                        ? setPending({
                            title: `Turn ${p.name} off?`,
                            body: 'It cools down first and cannot be turned back on until it has.',
                            run: () => run([p.id], async () => describe([await api.power(p.id, 'off')], 'Turn off')),
                          })
                        : void run([p.id], async () => describe([await api.power(p.id, 'on')], 'Turn on'))
                    }>
                    <PowerIcon size={19} />
                  </RoundButton>
                </div>
              )}
            </li>
          )
        })}
        {!loading && projectors.length === 0 && (
          <li className="px-4 py-4 text-[15px] text-slate-500">No projectors yet. Add them in the Projector Control dashboard.</li>
        )}
      </ul>

      <ConfirmDialog
        open={pending != null}
        title={pending?.title ?? ''}
        body={pending?.body ?? ''}
        danger
        confirmLabel="Turn off"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          void pending?.run()
          setPending(null)
        }}
      />
    </div>
  )
}

const TOOK_IT = new Set(['confirmed', 'accepted', 'ok', 'queued'])

/** What happened, without claiming more than the projectors said. The
 *  list below shows each one's state as read back from it. */
function describe(results: CommandResult[], what: string): string | void {
  const missed = results.filter((r) => !TOOK_IT.has(r.outcome))
  if (missed.length === 0) return results.length > 1 ? `${what}: sent to all ${results.length}.` : undefined
  const names = missed.map((r) => `${r.name ?? 'a projector'} ${OUTCOME_LABEL[r.outcome].toLowerCase()}`).join(', ')
  return results.length > 1
    ? `${what}: ${missed.length} of ${results.length} didn't take it. ${names}.`
    : `${what}: ${names}.`
}

function RoundButton({ active, disabled, label, onClick, children }: {
  active: boolean
  disabled: boolean
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      className={classNames(
        'flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-35',
        active ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30' : 'bg-panel-800 text-slate-400 ring-1 ring-white/[0.06]',
      )}
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
