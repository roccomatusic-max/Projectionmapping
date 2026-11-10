import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { api, type Session } from '@/api/client'
import type { Projector, TemperatureReading } from '@/api/types'
import {
  BrightnessIcon,
  CheckIcon,
  ChevronLeftIcon,
  CloseIcon,
  PowerIcon,
  ShutterIcon,
  TestPatternIcon,
  WarningIcon,
} from '@/components/icons'
import { useFleet } from '@/hooks/useLiveData'
import { classNames, formatHours } from '@/lib/format'
import { peakLampHours } from '@/lib/status'
import {
  PROBLEMS,
  problemText,
  stopLabel,
  type Walk,
  type WalkInfo,
  type WalkProblem,
  type WalkStop,
  walkApi,
  walkVerdict,
  walkWhen,
} from '@/lib/walkthrough'

/**
 * Walk the yard: check every projector in turn, from the phone.
 *
 * Each mini PC's projector lights up with its name, a crosshair, corners
 * and focus marks over the grid while the others go black. Walk to where
 * it can be seen, then tap Looks good or Something's wrong; the next one
 * lights up. At the end every projector goes back to the show, and the
 * Dashboard's Tonight's show says when they were last checked.
 * The server keeps the walk (services/walkthrough.py), so closing the app
 * mid-walk and opening it again picks it up.
 */

const POLL_MS = 4000

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

export default function WalkTheYard({ session, onClose }: { session: Session; onClose: () => void }) {
  const canRun = session.role === 'admin' || session.role === 'operator'
  const [walk, setWalk] = useState<Walk | null>(null)
  const [last, setLast] = useState<Walk | null>(null)
  /** The walk that just ended, for its summary. */
  const [ended, setEnded] = useState<Walk | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [askStopShow, setAskStopShow] = useState(false)
  const scroller = useRef<HTMLElement>(null)

  // Each projector, and the summary, start at the top of the screen.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [walk?.index, ended?.id])

  const load = useCallback(async () => {
    try {
      const info = await walkApi.get()
      setWalk((current) => {
        // Ended somewhere else: the show started, someone pressed the emergency stop.
        if (current && !info.active && info.last?.id === current.id) setEnded(info.last)
        return info.active
      })
      setLast(info.last)
      setLoaded(true)
    } catch (err) {
      setProblem(errorText(err, 'Could not reach Projector Control'))
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void load(), POLL_MS)
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const act = async (work: () => Promise<Walk | null>) => {
    setBusy(true)
    try {
      const next = await work()
      if (next && next.status !== 'walking') {
        setEnded(next)
        setLast(next)
        setWalk(null)
      } else {
        setWalk(next)
      }
      setProblem(null)
    } catch (err) {
      setProblem(errorText(err, 'That did not go through'))
    } finally {
      setBusy(false)
    }
  }

  const start = (stopShow = false) =>
    act(async () => {
      try {
        setEnded(null)
        return await walkApi.start(stopShow)
      } catch (err) {
        if (!stopShow && err instanceof Error && /show is playing/i.test(err.message)) {
          setAskStopShow(true)
          return null
        }
        throw err
      }
    })

  const end = () =>
    act(async () => {
      const info = await walkApi.stop()
      return info.last
    })

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-panel-950 pt-[env(safe-area-inset-top)] text-slate-200">
      <header className="flex items-center gap-3 px-4 pb-2 pt-3">
        <button className="flex h-10 w-10 items-center justify-center rounded-full bg-panel-850 text-slate-300 ring-1 ring-white/[0.06]"
          onClick={onClose} aria-label={walk ? 'Hide (the walk goes on)' : 'Close'}>
          {walk ? <ChevronLeftIcon size={20} /> : <CloseIcon size={20} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold text-slate-50">Walk the yard</p>
          <p className="truncate text-xs text-slate-500">
            {walk ? `Projector ${walk.index + 1} of ${walk.stops.length}` : 'Check every projector in turn'}
          </p>
        </div>
        {walk && canRun && (
          <button className="rounded-full bg-panel-850 px-4 py-2 text-sm font-medium text-slate-200 ring-1 ring-white/[0.08] active:bg-panel-800 disabled:opacity-50"
            disabled={busy} onClick={() => void end()}>
            End walk
          </button>
        )}
      </header>

      <main ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
          {problem && (
            <button className="rounded-2xl bg-red-500/10 px-4 py-3 text-left text-sm text-red-300 ring-1 ring-red-500/20" onClick={() => setProblem(null)}>
              {problem}
            </button>
          )}
          {!loaded ? (
            <p className="py-10 text-center text-sm text-slate-500">Loading…</p>
          ) : walk ? (
            <StopView walk={walk} canRun={canRun} busy={busy} act={act} />
          ) : ended ? (
            <Summary walk={ended} canRun={canRun} busy={busy} onAgain={() => void start()} onDone={onClose} />
          ) : (
            <Intro last={last} canRun={canRun} busy={busy} askStopShow={askStopShow}
              onStart={(stopShow) => {
                setAskStopShow(false)
                void start(stopShow)
              }}
              onKeepShow={() => setAskStopShow(false)} />
          )}
        </div>
      </main>
    </div>
  )
}

// -- before the walk ------------------------------------------------------------

function Intro({ last, canRun, busy, askStopShow, onStart, onKeepShow }: {
  last: Walk | null
  canRun: boolean
  busy: boolean
  askStopShow: boolean
  onStart: (stopShow: boolean) => void
  onKeepShow: () => void
}) {
  const verdict = walkVerdict(last)
  const steps = [
    'One projector lights up with a grid and its name. The others go dark.',
    'Walk to where you can see it. Check it is sharp, on target and bright.',
    'Tap Looks good, or Something’s wrong and what. The next one lights up.',
    'At the end every projector goes back to the show.',
  ]
  return (
    <>
      <ol className="space-y-2.5">
        {steps.map((step, i) => (
          <li key={step} className="flex items-start gap-3 rounded-2xl bg-panel-900 px-4 py-3.5 ring-1 ring-white/[0.06]">
            <span className="tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sm font-semibold text-sky-300">{i + 1}</span>
            <span className="text-[15px] leading-snug text-slate-300">{step}</span>
          </li>
        ))}
      </ol>

      {askStopShow ? (
        <div className="rounded-3xl bg-amber-500/10 p-4 ring-1 ring-amber-500/25">
          <p className="text-[15px] font-medium text-amber-100">The show is playing.</p>
          <p className="mt-1 text-sm text-amber-200/80">Walking the yard stops it. Start it again from the Show or Tonight tab afterwards.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="rounded-xl bg-amber-500 py-3 text-[15px] font-semibold text-panel-950 active:scale-[0.98] disabled:opacity-50"
              disabled={busy} onClick={() => onStart(true)}>
              Stop the show
            </button>
            <button className="rounded-xl bg-panel-850 py-3 text-[15px] text-slate-200 ring-1 ring-white/[0.08]" onClick={onKeepShow}>
              Keep playing
            </button>
          </div>
        </div>
      ) : (
        <button
          className="flex h-20 items-center justify-center gap-3 rounded-3xl bg-gradient-to-b from-sky-500 to-sky-700 text-xl font-semibold text-white shadow-[0_18px_40px_-16px_rgba(14,165,233,0.7)] active:scale-[0.97] disabled:from-panel-750 disabled:to-panel-800 disabled:text-slate-500 disabled:shadow-none"
          disabled={!canRun || busy}
          onClick={() => onStart(false)}
        >
          <TestPatternIcon size={24} aria-hidden /> Start the walk
        </button>
      )}
      {!canRun && <p className="text-center text-sm text-slate-500">Your account can see the last walk but not start one.</p>}

      <section className="rounded-3xl bg-panel-900 p-4 ring-1 ring-white/[0.06]">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Last checked</p>
        {last ? (
          <>
            <p className="mt-1 text-[16px] text-slate-100">
              {walkWhen(last)} · <span className={verdict.tone === 'warn' ? 'text-amber-300' : verdict.tone === 'ok' ? 'text-emerald-300' : 'text-slate-400'}>{verdict.text}</span>
            </p>
            <StopList walk={last} />
          </>
        ) : (
          <p className="mt-1 text-[15px] text-slate-400">Not walked yet.</p>
        )}
      </section>
    </>
  )
}

// -- one projector -------------------------------------------------------------------

function StopView({ walk, canRun, busy, act }: {
  walk: Walk
  canRun: boolean
  busy: boolean
  act: (work: () => Promise<Walk | null>) => Promise<void>
}) {
  const stop = walk.stops[walk.index]
  const { projectors, refresh } = useFleet(5000)
  const projector = projectors.find((p) => p.id === stop.projector_id) ?? null
  const [wrong, setWrong] = useState(false)
  const [problems, setProblems] = useState<WalkProblem[]>([])
  const [note, setNote] = useState('')
  const [sent, setSent] = useState<string | null>(null)

  // A fresh form for each projector; the walk read every few seconds leaves it be.
  useEffect(() => {
    setWrong(false)
    setSent(null)
  }, [walk.id, walk.index])

  const openWrong = () => {
    setProblems(stop.result === 'wrong' ? stop.problems : [])
    setNote(stop.result === 'wrong' ? stop.note : '')
    setWrong(true)
  }

  const toggle = (id: WalkProblem) =>
    setProblems((current) => (current.includes(id) ? current.filter((p) => p !== id) : [...current, id]))

  const command = async (what: string, work: () => Promise<unknown>) => {
    setSent(`${what}…`)
    try {
      await work()
      setSent(`${what}: sent.`)
    } catch (err) {
      setSent(errorText(err, `${what} did not go through`))
    } finally {
      if (projector) await api.status(projector.id, true).catch(() => undefined)
      void refresh()
    }
  }

  return (
    <>
      <Progress walk={walk} busy={busy} onPick={(i) => void act(() => walkApi.go(i))} />

      <section className="rounded-3xl bg-panel-900 p-5 ring-1 ring-white/[0.06]">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-300">Lit up now</p>
        <p className="mt-1 text-[26px] font-semibold leading-tight text-slate-50">{stopLabel(stop)}</p>
        <p className="mt-1 text-sm text-slate-400">
          {stop.name}
          {stop.output_name !== stopLabel(stop) && ` · ${stop.output_name}`}
        </p>
        <Readings stop={stop} projector={projector} />
        {canRun && projector && (projector.state.power === 'off' || projector.state.shutter === 'closed') && (
          <div className="mt-3 flex flex-wrap gap-2">
            {projector.state.power === 'off' && (
              <button className="flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-200 ring-1 ring-emerald-400/25"
                onClick={() => void command('Turn on', () => api.power(projector.id, 'on'))}>
                <PowerIcon size={16} aria-hidden /> Turn it on
              </button>
            )}
            {projector.state.shutter === 'closed' && (
              <button className="flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-200 ring-1 ring-emerald-400/25"
                onClick={() => void command('Open shutter', () => api.shutter(projector.id, 'open'))}>
                <ShutterIcon size={16} aria-hidden /> Open the shutter
              </button>
            )}
          </div>
        )}
        {sent && <p className="mt-2 text-xs text-slate-400">{sent}</p>}
      </section>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-panel-900 p-1.5 ring-1 ring-white/[0.06]" role="group" aria-label="Test picture">
        <PictureButton active={walk.picture === 'id'} disabled={!canRun || busy} icon={<TestPatternIcon size={18} />}
          label="Grid and name" onClick={() => void act(() => walkApi.picture('id'))} />
        <PictureButton active={walk.picture === 'white'} disabled={!canRun || busy} icon={<BrightnessIcon size={18} />}
          label="All white" onClick={() => void act(() => walkApi.picture('white'))} />
      </div>
      <p className="-mt-2 px-1 text-xs leading-relaxed text-slate-500">
        {walk.picture === 'id'
          ? 'Look for: the name reads the right way round, the circles are crisp at the middle and the corners, and the outline sits on the house.'
          : 'White shows how bright it is and where the edges fall. Switch back to the grid to check focus.'}
      </p>

      {canRun && !wrong && (
        <div className="grid grid-cols-1 gap-3">
          <button
            className="flex h-20 items-center justify-center gap-3 rounded-3xl bg-gradient-to-b from-emerald-500 to-emerald-700 text-xl font-semibold text-white shadow-[0_18px_40px_-16px_rgba(16,185,129,0.75)] active:scale-[0.97] disabled:opacity-50"
            disabled={busy}
            onClick={() => void act(() => walkApi.answer(walk.index, 'good'))}
          >
            <CheckIcon size={24} aria-hidden /> Looks good
          </button>
          <button
            className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-panel-850 text-[16px] font-semibold text-amber-200 ring-1 ring-amber-500/25 active:scale-[0.98] disabled:opacity-50"
            disabled={busy}
            onClick={openWrong}
          >
            <WarningIcon size={20} aria-hidden /> Something&apos;s wrong
          </button>
        </div>
      )}

      {canRun && wrong && (
        <section className="rounded-3xl bg-panel-900 p-4 ring-1 ring-amber-500/25">
          <p className="text-[15px] font-medium text-amber-100">What&apos;s wrong with {stopLabel(stop)}?</p>
          <p className="text-xs text-slate-500">Tap all that fit.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PROBLEMS.map((p) => {
              const on = problems.includes(p.id)
              return (
                <button key={p.id} aria-pressed={on}
                  className={classNames('rounded-full px-4 py-2.5 text-[15px] ring-1 transition active:scale-95',
                    on ? 'bg-amber-500 font-semibold text-panel-950 ring-amber-400' : 'bg-panel-850 text-slate-200 ring-white/[0.08]')}
                  onClick={() => toggle(p.id)}>
                  {p.label}
                </button>
              )
            })}
          </div>
          <input className="input mt-3 w-full rounded-xl px-4 py-3 text-base" placeholder="A note, if it helps (optional)"
            aria-label="Note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <button className="rounded-xl bg-amber-500 py-3.5 text-[16px] font-semibold text-panel-950 active:scale-[0.98] disabled:opacity-50"
              disabled={busy || (problems.length === 0 && !note.trim())}
              onClick={() => void act(() => walkApi.answer(walk.index, 'wrong', problems, note))}>
              Save and go on
            </button>
            <button className="rounded-xl bg-panel-850 px-5 py-3.5 text-[15px] text-slate-200 ring-1 ring-white/[0.08]" onClick={() => setWrong(false)}>
              Back
            </button>
          </div>
        </section>
      )}

      {canRun && walk.stops.length > 1 && (
        <div className="flex justify-between px-1 text-sm">
          <button className="py-2 text-slate-400 disabled:opacity-30" disabled={busy || walk.index === 0}
            onClick={() => void act(() => walkApi.go(walk.index - 1))}>
            ‹ Previous
          </button>
          <button className="py-2 text-slate-400 disabled:opacity-30" disabled={busy || walk.index === walk.stops.length - 1}
            onClick={() => void act(() => walkApi.go(walk.index + 1))}>
            Skip for now ›
          </button>
        </div>
      )}
    </>
  )
}

function Progress({ walk, busy, onPick }: { walk: Walk; busy: boolean; onPick: (index: number) => void }) {
  return (
    <ol className="flex gap-1.5" aria-label="Projectors on this walk">
      {walk.stops.map((stop, i) => (
        <li key={stop.player_id} className="min-w-0 flex-1">
          <button
            className={classNames(
              'h-2 w-full rounded-full transition',
              i === walk.index ? 'bg-sky-400' : stop.result === 'good' ? 'bg-emerald-500/70' : stop.result === 'wrong' ? 'bg-amber-500/80' : 'bg-panel-750',
            )}
            disabled={busy}
            aria-label={`${stopLabel(stop)}${stop.result === 'good' ? ', looked good' : stop.result === 'wrong' ? ', something wrong' : ''}`}
            aria-current={i === walk.index ? 'step' : undefined}
            onClick={() => onPick(i)}
          />
        </li>
      ))}
    </ol>
  )
}

function PictureButton({ active, disabled, icon, label, onClick }: {
  active: boolean
  disabled: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={classNames('flex items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-medium transition disabled:opacity-50',
        active ? 'bg-sky-500/20 text-sky-100 ring-1 ring-sky-400/30' : 'text-slate-400')}
      aria-pressed={active}
      disabled={disabled && !active}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  )
}

const POWER_TEXT: Record<Projector['state']['power'], string> = {
  on: 'On',
  off: 'Off',
  warming: 'Warming up',
  cooling: 'Cooling down',
  unknown: 'Unknown',
}

function hottest(projector: Projector): { celsius: number; fahrenheit: number | null } | null {
  const field = projector.state.equipment?.temperature
  if (field?.availability !== 'available' || !field.value || typeof field.value !== 'object') return null
  let best: { celsius: number; fahrenheit: number | null } | null = null
  for (const sensor of (field.value as TemperatureReading).sensors ?? []) {
    if (sensor.celsius != null && (!best || sensor.celsius > best.celsius)) best = { celsius: sensor.celsius, fahrenheit: sensor.fahrenheit }
  }
  return best
}

function Readings({ stop, projector }: { stop: WalkStop; projector: Projector | null }) {
  const live = !!projector && projector.state.online && !projector.state.stale
  const heat = projector ? hottest(projector) : null
  const lamp = projector ? peakLampHours(projector) : null
  const rows: Array<{ label: string; value: string; tone: 'ok' | 'warn' | 'idle' }> = [
    { label: 'Mini PC', value: stop.online ? 'Connected' : 'Not answering', tone: stop.online ? 'ok' : 'warn' },
  ]
  if (!projector) {
    rows.push({ label: 'Projector', value: stop.projector_id ? 'Not found' : 'None linked to this output', tone: 'idle' })
  } else if (!live) {
    rows.push({ label: 'Projector', value: 'Not answering', tone: 'warn' })
  } else {
    const on = projector.state.power === 'on'
    rows.push({ label: 'Power', value: POWER_TEXT[projector.state.power], tone: on ? 'ok' : 'warn' })
    if (projector.state.shutter !== 'unknown')
      rows.push({ label: 'Shutter', value: projector.state.shutter === 'closed' ? 'Closed' : 'Open', tone: projector.state.shutter === 'closed' ? 'warn' : 'ok' })
    if (heat)
      rows.push({
        label: 'Hottest',
        value: heat.fahrenheit != null ? `${Math.round(heat.fahrenheit)}°F` : `${Math.round(heat.celsius)}°C`,
        tone: heat.celsius >= 45 ? 'warn' : 'ok',
      })
    if (lamp != null) rows.push({ label: 'Lamp', value: formatHours(lamp), tone: lamp >= projector.lamp_warn_hours ? 'warn' : 'ok' })
  }
  const issues = projector && live ? [...projector.state.errors, ...projector.state.warnings] : []
  if (!stop.online) issues.unshift('This mini PC is not connected, so its projector cannot show the test picture.')
  if (projector && live && projector.state.power === 'off') issues.unshift('The projector is off. Turn it on and give it about a minute to warm up.')
  return (
    <>
      <dl className="mt-4 grid grid-cols-2 gap-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-xl bg-panel-850 px-3 py-2 ring-1 ring-white/[0.05]">
            <dt className="text-2xs uppercase tracking-wide text-slate-500">{row.label}</dt>
            <dd className={classNames('text-[15px] font-medium', row.tone === 'warn' ? 'text-amber-300' : row.tone === 'ok' ? 'text-slate-100' : 'text-slate-400')}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {issues.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-amber-200">
          {issues.slice(0, 4).map((issue) => (
            <li key={issue} className="flex items-start gap-1.5"><WarningIcon size={14} className="mt-0.5 shrink-0" aria-hidden /> {issue}</li>
          ))}
        </ul>
      )}
    </>
  )
}

// -- after the walk -------------------------------------------------------------------

function Summary({ walk, canRun, busy, onAgain, onDone }: {
  walk: Walk
  canRun: boolean
  busy: boolean
  onAgain: () => void
  onDone: () => void
}) {
  const verdict = walkVerdict(walk)
  const early = walk.status === 'stopped' && walk.stops.some((s) => !s.result)
  return (
    <>
      <section className={classNames('rounded-3xl p-5 ring-1',
        verdict.tone === 'warn' ? 'bg-amber-500/10 ring-amber-500/25' : verdict.tone === 'ok' ? 'bg-emerald-500/10 ring-emerald-500/25' : 'bg-panel-900 ring-white/[0.06]')}>
        <p className={classNames('text-[22px] font-semibold leading-tight',
          verdict.tone === 'warn' ? 'text-amber-100' : verdict.tone === 'ok' ? 'text-emerald-100' : 'text-slate-100')}>
          {verdict.tone === 'ok' && !early ? 'All set for the show' : early ? 'Walk ended early' : 'Some need a look'}
        </p>
        <p className="mt-1 text-[15px] text-slate-300">
          {early && walk.reason ? `It ended because ${walk.reason}. ` : ''}
          {verdict.text[0].toUpperCase() + verdict.text.slice(1)}. Every projector is back to what it showed before.
        </p>
        <StopList walk={walk} />
      </section>
      <div className="grid grid-cols-2 gap-3">
        <button className="h-14 rounded-2xl bg-panel-850 text-[16px] font-semibold text-slate-100 ring-1 ring-white/[0.08] active:scale-[0.98] disabled:opacity-50"
          disabled={!canRun || busy} onClick={onAgain}>
          Walk again
        </button>
        <button className="h-14 rounded-2xl bg-sky-600 text-[16px] font-semibold text-white active:scale-[0.98]" onClick={onDone}>
          Done
        </button>
      </div>
    </>
  )
}

function StopList({ walk }: { walk: Walk }) {
  return (
    <ul className="mt-3 space-y-2">
      {walk.stops.map((stop) => (
        <li key={stop.player_id} className="flex items-start gap-2.5 text-[15px]">
          <span className={classNames('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
            stop.result === 'good' ? 'bg-emerald-500/20 text-emerald-300' : stop.result === 'wrong' ? 'bg-amber-500/20 text-amber-300' : 'bg-panel-800 text-slate-500')}>
            {stop.result === 'good' ? <CheckIcon size={12} aria-hidden /> : stop.result === 'wrong' ? <WarningIcon size={12} aria-hidden /> : <span className="text-[10px]">–</span>}
          </span>
          <span className="min-w-0">
            <span className="text-slate-100">{stopLabel(stop)}</span>
            <span className="text-slate-400">
              {stop.result === 'good' ? ' looked good' : stop.result === 'wrong' ? `: ${problemText(stop)}` : ' not checked'}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** When the projectors were last checked, and the button that walks the yard. */
export function WalkCard({ info, onWalk }: { info: WalkInfo | null; onWalk: () => void }) {
  const active = info?.active ?? null
  const last = info?.last ?? null
  const verdict = walkVerdict(last)
  return (
    <button
      className="flex items-center gap-3 rounded-2xl bg-panel-900 px-4 py-3.5 text-left ring-1 ring-white/[0.06] active:scale-[0.99]"
      onClick={onWalk}
    >
      <span className={classNames('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
        active ? 'bg-sky-500/20 text-sky-300' : verdict.tone === 'warn' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/10 text-emerald-300')}>
        <TestPatternIcon size={20} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-medium text-slate-100">{active ? 'Continue walking the yard' : 'Walk the yard'}</span>
        <span className={classNames('block truncate text-[13px]', verdict.tone === 'warn' && !active ? 'text-amber-300' : 'text-slate-500')}>
          {active
            ? `Projector ${active.index + 1} of ${active.stops.length} is lit up`
            : last
              ? `Last checked ${walkWhen(last)} · ${verdict.text}`
              : 'Check each projector before the show'}
        </span>
      </span>
      <span className="text-slate-500" aria-hidden>›</span>
    </button>
  )
}
