/**
 * The emergency stop: one press-and-hold that stops the show, turns every
 * output black, stops automations and turns every projector off.
 *
 * It sits in the top bar of every page and at the top of the phone remote.
 * Holding it for a second fires it, so a brush of the hand does not; there
 * is no second dialog to get through when it matters. Every projector's
 * answer is shown on its own line: the stop is never reported as one
 * success.
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { request } from '@/api/client'
import { classNames } from '@/lib/format'
import type { EmergencyState, TransportState } from '@/mapping/types'
import { EmergencyIcon } from './icons'
import { ConfirmDialog, Modal, Spinner, StatusDot, type Tone } from './ui'

/** How long the button must be held down. */
export const HOLD_MS = 1000

export type EmergencyOutcome = 'off' | 'waiting' | 'already_off' | 'failed'

export interface EmergencyProjector {
  projector_id: number
  name: string | null
  result: EmergencyOutcome
  detail: string
  shutter: string | null
  power: string | null
  error?: string | null
}

export interface EmergencyResult {
  transport: TransportState
  projectors: EmergencyProjector[]
  players: Array<{ id: number; name: string; online: boolean }>
  automations_stopped: string[]
}

export const emergencyApi = {
  stop: () => request<EmergencyResult>('/emergency/stop', { method: 'POST' }),
  clear: () => request<EmergencyResult>('/emergency/clear', { method: 'POST' }),
}

/** Live power of a projector, for "turned off by itself" after the press. */
export type UsePower = () => (projectorId: number) => string | undefined

// -- the button ---------------------------------------------------------------

function useHold(onFire: () => void, disabled: boolean) {
  const [holding, setHolding] = useState(false)
  const [hint, setHint] = useState(false)
  const timer = useRef<number>()
  const hintTimer = useRef<number>()
  const fired = useRef(false)

  const start = () => {
    if (disabled || timer.current) return
    fired.current = false
    setHint(false)
    setHolding(true)
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      fired.current = true
      setHolding(false)
      onFire()
    }, HOLD_MS)
  }
  const cancel = () => {
    if (!timer.current) return
    window.clearTimeout(timer.current)
    timer.current = undefined
    setHolding(false)
    if (!fired.current) {
      setHint(true)
      window.clearTimeout(hintTimer.current)
      hintTimer.current = window.setTimeout(() => setHint(false), 2500)
    }
  }

  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      window.clearTimeout(hintTimer.current)
    },
    [],
  )

  const handlers = {
    onPointerDown: (event: React.PointerEvent) => {
      if (event.button !== 0) return
      ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
      start()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'Enter') return
      event.preventDefault()
      if (!event.repeat) start()
    },
    onKeyUp: (event: KeyboardEvent) => {
      if (event.key === ' ' || event.key === 'Enter') cancel()
    },
    onBlur: cancel,
    // A long press on a phone would otherwise open the copy menu.
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  }
  return { holding, hint, handlers }
}

/**
 * The button and everything after the press. ``variant`` picks the top
 * bar's compact form or the phone remote's full-width strip.
 */
export function EmergencyStopButton({
  variant,
  usePower,
}: {
  variant: 'bar' | 'remote'
  usePower: UsePower
}) {
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<EmergencyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const fire = useCallback(async () => {
    setOpen(true)
    setSending(true)
    setError(null)
    setResult(null)
    if (navigator.vibrate) navigator.vibrate(60)
    try {
      setResult(await emergencyApi.stop())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No answer from Projector Control')
    } finally {
      setSending(false)
    }
  }, [])

  const { holding, hint, handlers } = useHold(() => void fire(), sending)
  const label = holding ? 'Keep holding…' : hint ? 'Hold it down' : variant === 'bar' ? 'Emergency stop' : 'Emergency stop: hold to stop everything'

  return (
    <>
      <button
        type="button"
        {...handlers}
        aria-label="Emergency stop. Hold for one second to stop the show, black out every output and turn every projector off."
        title="Hold for one second: stops the show, blacks out every mini PC and turns every projector off"
        className={classNames(
          'relative isolate select-none overflow-hidden font-semibold text-white [-webkit-touch-callout:none] [touch-action:none]',
          'bg-red-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] ring-1 ring-red-400/50 hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300',
          variant === 'bar'
            ? 'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs sm:px-3'
            : 'flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px]',
        )}
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 -z-10 bg-red-900/70"
          style={{ width: holding ? '100%' : '0%', transition: holding ? `width ${HOLD_MS}ms linear` : 'width 150ms ease-out' }}
        />
        <EmergencyIcon size={variant === 'bar' ? 15 : 20} strokeWidth={2.25} aria-hidden />
        {variant === 'bar' ? (
          <>
            <span className="hidden whitespace-nowrap sm:inline">{label}</span>
            <span className="whitespace-nowrap sm:hidden">{holding ? 'Hold…' : 'Stop'}</span>
          </>
        ) : (
          <span className="whitespace-nowrap">{label}</span>
        )}
      </button>
      {/* On the body: the top bar's blur would otherwise trap the window in the bar. */}
      {createPortal(
        <EmergencyResults
          open={open}
          sending={sending}
          result={result}
          error={error}
          usePower={usePower}
          onRetry={() => void fire()}
          onClose={() => setOpen(false)}
          phone={variant === 'remote'}
        />,
        document.body,
      )}
    </>
  )
}

// -- what happened ----------------------------------------------------------------

const RESULT_LOOK: Record<EmergencyOutcome, { tone: Tone; label: string }> = {
  off: { tone: 'ok', label: 'Off' },
  waiting: { tone: 'busy', label: 'Turning off when ready' },
  already_off: { tone: 'idle', label: 'Already off' },
  failed: { tone: 'fault', label: 'Did not turn off' },
}

/** One plain sentence on the whole press, counting each projector. */
export function summarise(result: EmergencyResult): string {
  const count = (key: EmergencyOutcome) => result.projectors.filter((p) => p.result === key).length
  const total = result.projectors.length
  if (total === 0) return 'Show stopped and every output black. There are no projectors to turn off.'
  const parts: string[] = []
  const off = count('off') + count('already_off')
  parts.push(`${off} of ${total} projector${total === 1 ? '' : 's'} off`)
  if (count('waiting')) parts.push(`${count('waiting')} turning off as soon as ${count('waiting') === 1 ? 'it is' : 'they are'} ready`)
  if (count('failed')) parts.push(`${count('failed')} did not turn off`)
  return `Show stopped and every output black. ${parts.join(', ')}.`
}

function EmergencyResults({
  open,
  sending,
  result,
  error,
  usePower,
  onRetry,
  onClose,
  phone,
}: {
  open: boolean
  sending: boolean
  result: EmergencyResult | null
  error: string | null
  usePower: UsePower
  onRetry: () => void
  onClose: () => void
  phone: boolean
}) {
  const failed = result?.projectors.filter((p) => p.result === 'failed').length ?? 0
  return (
    <Modal open={open} label="Emergency stop" onClose={onClose}>
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-400" aria-hidden>
            <EmergencyIcon size={18} />
          </span>
          <div className="min-w-0 flex-1" aria-live="polite">
            <h2 className="text-base font-semibold text-slate-50">
              {sending ? 'Stopping everything…' : error ? 'The emergency stop did not get through' : failed ? 'Stopped, but check these' : 'Everything is stopped'}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {sending
                ? 'Blacking out the mini PCs and turning the projectors off.'
                : error
                  ? `Projector Control did not answer (${error}). Nothing may have stopped. Try again, or turn the projectors off at the projectors.`
                  : result && summarise(result)}
            </p>
          </div>
        </div>

        {sending && (
          <div className="mt-5 flex justify-center">
            <Spinner label="Waiting for the projectors to answer" />
          </div>
        )}

        {result && <ResultLists result={result} usePower={usePower} phone={phone} />}

        {result && (
          <p className="mt-4 rounded-md bg-white/[0.03] px-3 py-2 text-xs leading-relaxed text-slate-400 ring-1 ring-white/[0.06]">
            The show and automations stay held until you clear the emergency stop in the red bar at the top. Clearing it
            turns nothing back on: turn the projectors on, then press GO.
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          {error && (
            <button className="btn-danger" onClick={onRetry}>
              Try again
            </button>
          )}
          <button className="btn-default" onClick={onClose} disabled={sending}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ResultLists({ result, usePower, phone }: { result: EmergencyResult; usePower: UsePower; phone: boolean }) {
  const powerOf = usePower()
  const online = result.players.filter((p) => p.online)
  const offline = result.players.filter((p) => !p.online)
  return (
    <div className={classNames('mt-4 space-y-4 overflow-y-auto', phone ? 'max-h-[50vh]' : 'max-h-[55vh]')}>
      <Section title="Projectors">
        {result.projectors.length === 0 && <Row tone="idle" name="No projectors" detail="There are no projectors to turn off." />}
        {result.projectors.map((p) => {
          let look = RESULT_LOOK[p.result]
          let detail = p.detail
          // A held power off reports back over the live feed when it lands.
          const now = powerOf(p.projector_id)
          if (p.result === 'waiting' && (now === 'cooling' || now === 'off')) {
            look = { tone: 'ok', label: 'Off' }
            detail = 'Turned off by itself once it was ready.'
          }
          return <Row key={p.projector_id} tone={look.tone} name={p.name ?? `Projector ${p.projector_id}`} status={look.label} detail={detail} />
        })}
      </Section>
      <Section title="Mini PCs">
        {result.players.length === 0 && <Row tone="idle" name="No mini PCs paired" detail="Nothing to black out." />}
        {online.map((p) => (
          <Row key={p.id} tone="ok" name={p.name} status="Black" detail="Told to go black straight away." />
        ))}
        {offline.map((p) => (
          <Row key={p.id} tone="warn" name={p.name} status="Not connected" detail="Goes black the moment it connects again." />
        ))}
      </Section>
      {result.automations_stopped.length > 0 && (
        <Section title="Automations">
          {result.automations_stopped.map((name) => (
            <Row key={name} tone="ok" name={name} status="Stopped" detail="It was running and was stopped where it was." />
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="eyebrow mb-1.5">{title}</h3>
      <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-md bg-white/[0.02] ring-1 ring-white/[0.06]">{children}</ul>
    </section>
  )
}

function Row({ tone, name, status, detail }: { tone: Tone; name: string; status?: string; detail: string }) {
  return (
    <li className="flex items-start gap-2.5 px-3 py-2">
      <StatusDot tone={tone} className="mt-1.5" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium text-slate-100">{name}</span>
          {status && <span className={classNames('text-xs', tone === 'fault' ? 'text-red-300' : tone === 'ok' ? 'text-emerald-300' : tone === 'warn' ? 'text-yellow-300' : tone === 'busy' ? 'text-sky-300' : 'text-slate-400')}>{status}</span>}
        </p>
        {detail.replace(/\.$/, '') !== status && <p className="text-xs leading-relaxed text-slate-400">{detail}</p>}
      </div>
    </li>
  )
}

// -- while it is on -------------------------------------------------------------------

function pressedAt(emergency: EmergencyState): string {
  const at = new Date(emergency.at_ms)
  const today = new Date().toDateString() === at.toDateString()
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return today ? time : `${at.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`
}

/** The red bar shown everywhere while the stop is on, with the way out. */
export function EmergencyBanner({
  emergency,
  canClear,
  variant = 'bar',
}: {
  emergency: EmergencyState | null | undefined
  canClear: boolean
  variant?: 'bar' | 'remote'
}) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!emergency) return null

  const clear = async () => {
    setAsking(false)
    setBusy(true)
    setError(null)
    try {
      await emergencyApi.clear()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear it')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="alert"
      className={classNames(
        'flex items-start gap-2.5 bg-red-600/20 text-red-50 ring-1 ring-inset ring-red-500/40',
        variant === 'bar' ? 'px-3 py-2 lg:px-6' : 'rounded-2xl px-4 py-3',
      )}
    >
      <EmergencyIcon size={18} className="mt-0.5 shrink-0 text-red-300" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">Emergency stop is on</p>
        <p className="mt-0.5 text-xs leading-relaxed text-red-100/80">
          Pressed{emergency.by ? ` by ${emergency.by}` : ''} at {pressedAt(emergency)}. Every output is black; GO and automations
          are held until it is cleared.
        </p>
        {error && <p className="mt-1 text-xs text-red-200">{error}</p>}
      </div>
      {canClear && (
        <button className="btn-sm btn shrink-0 border border-red-300/40 text-red-50 hover:bg-red-500/20" onClick={() => setAsking(true)} disabled={busy}>
          {busy ? 'Clearing…' : 'Clear'}
        </button>
      )}
      {createPortal(
        <ConfirmDialog
          open={asking}
          title="Clear the emergency stop?"
          body="This only lifts the hold. Nothing turns back on by itself: turn the projectors on, then press GO when you are ready."
          confirmLabel="Clear it"
          onCancel={() => setAsking(false)}
          onConfirm={() => void clear()}
        />,
        document.body,
      )}
    </div>
  )
}
