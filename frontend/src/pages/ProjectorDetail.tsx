import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError, api, type Session } from '@/api/client'
import type {
  Capability,
  CapabilityManifest,
  CommandLogRow,
  CommandResult,
  ConnectionTest,
  Projector,
} from '@/api/types'
import {
  Chip,
  ConfirmDialog,
  ErrorBanner,
  Panel,
  Spinner,
  StatusDot,
  ToastStack,
  UnavailableNote,
  Value,
  useToasts,
} from '@/components/ui'
import { connectionTone } from '@/components/ProjectorCard'
import {
  OUTCOME_HELP,
  OUTCOME_LABEL,
  POWER_LABEL,
  SHUTTER_LABEL,
  classNames,
  formatDateTime,
  healthTone,
  inputsFromCapabilities,
  outcomeTone,
  relativeTime,
  renderTelemetry,
} from '@/lib/format'
import { useTicker } from '@/hooks/useLiveData'

const REMOTE_KEYS: Array<[string, string, string]> = [
  ['menu', 'Menu', 'col-start-1'],
  ['up', '▲', 'col-start-2'],
  ['back', 'Return', 'col-start-3'],
  ['left', '◀', 'col-start-1 row-start-2'],
  ['enter', 'Enter', 'col-start-2 row-start-2'],
  ['right', '▶', 'col-start-3 row-start-2'],
  ['down', '▼', 'col-start-2 row-start-3'],
]

export default function ProjectorDetail({ session }: { session: Session }) {
  const { id } = useParams()
  const projectorId = Number(id)
  const [projector, setProjector] = useState<Projector | null>(null)
  const [manifest, setManifest] = useState<CapabilityManifest | null>(null)
  const [history, setHistory] = useState<CommandLogRow[]>([])
  const [probe, setProbe] = useState<ConnectionTest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<{
    title: string
    body: string
    danger?: boolean
    run: () => Promise<void>
  } | null>(null)
  const { toasts, push, dismiss } = useToasts()
  useTicker(5000)

  const canControl = session.role !== 'viewer'

  const load = useCallback(async () => {
    try {
      const [device, caps, log] = await Promise.all([
        api.getProjector(projectorId),
        api.capabilities(projectorId),
        api.commandHistory(projectorId, 40),
      ])
      setProjector(device)
      setManifest(caps)
      setHistory(log.commands)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projector')
    }
  }, [projectorId])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 10000)
    return () => window.clearInterval(timer)
  }, [load])

  const capability = (name: string): Capability | undefined =>
    manifest?.capabilities.find((item) => item.name === name)

  /** Supported means: declared, not retracted for this unit, and either
   *  trusted or explicitly opted into. Everything else explains itself. */
  const usable = (name: string) => {
    const cap = capability(name)
    if (!cap) return false
    if (manifest?.retracted[name]) return false
    if (cap.requires_opt_in && !manifest?.allow_unverified_commands) return false
    return true
  }

  const gateReason = (name: string): string | null => {
    const cap = capability(name)
    if (!cap) return `${name} is not implemented for this driver.`
    const retracted = manifest?.retracted[name]
    if (retracted) return retracted
    if (cap.requires_opt_in && !manifest?.allow_unverified_commands) {
      return (
        cap.caveat ??
        'This command is documented only for a sibling model. Enable “allow unverified commands” in Settings for this projector to use it.'
      )
    }
    return null
  }

  const send = async (
    label: string,
    action: () => Promise<CommandResult>,
  ): Promise<void> => {
    setBusy(true)
    try {
      const result = await action()
      push(
        outcomeTone(result.outcome),
        `${label}: ${OUTCOME_LABEL[result.outcome]}`,
        result.error ?? OUTCOME_HELP[result.outcome],
      )
      await load()
    } catch (err) {
      push(
        'fault',
        `${label} failed`,
        err instanceof ApiError ? err.message : 'The command could not be sent',
      )
    } finally {
      setBusy(false)
    }
  }

  if (error && !projector) return <ErrorBanner message={error} />
  if (!projector || !manifest) return <Spinner label="Loading projector…" />

  const { state } = projector
  const live = state.online && !state.stale
  const input = renderTelemetry(state.active_input, (value) =>
    typeof value === 'string' ? value : `${value.label} (${value.code})`,
  )
  const transitioning = state.power === 'warming' || state.power === 'cooling'
  const inputRetracted = manifest.retracted_params ?? {}
  // Whatever this model's driver declares — a DZ13K lists SDI, a DZ770 lists S-Video.
  const inputs = inputsFromCapabilities(manifest.capabilities)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/projectors" className="text-xs text-slate-500 hover:text-slate-300">
            ← All projectors
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-100">
            <StatusDot tone={connectionTone(projector)} pulse={transitioning} />
            {projector.name}
          </h1>
          <p className="mt-0.5 text-xs text-slate-400">
            {projector.manufacturer} {projector.model} · {projector.host}:
            {projector.port} · {projector.driver}
            {projector.location && ` · ${projector.location}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip tone={live ? 'ok' : 'fault'}>{live ? 'Responding' : 'Not responding'}</Chip>
          <Chip tone={healthTone(state.health)}>Health: {state.health}</Chip>
          <button
            className="btn-default"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                setProbe(await api.testConnection(projectorId))
              } finally {
                setBusy(false)
              }
            }}
          >
            Test connection
          </button>
          <button
            className="btn-default"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await api.status(projectorId, true)
                await load()
                push('ok', 'Status refreshed')
              } catch (err) {
                push(
                  'fault',
                  'Refresh failed',
                  err instanceof ApiError ? err.message : undefined,
                )
              } finally {
                setBusy(false)
              }
            }}
          >
            Poll now
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {probe && (
        <div
          className={classNames(
            'rounded-md border px-3 py-2 text-sm',
            probe.reachable && probe.authenticated
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
              : 'border-red-500/25 bg-red-500/10 text-red-200',
          )}
        >
          <p>{probe.detail}</p>
          {probe.raw_response && (
            <p className="mt-1 font-mono text-xs opacity-70">
              Projector replied: {probe.raw_response}
            </p>
          )}
        </div>
      )}

      {state.stale && (
        <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          No successful poll inside the staleness window. Values below are the last
          known readings, not live state. Last reply {relativeTime(state.last_seen_at)}.
          {state.last_error && ` Last error: ${state.last_error}`}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        {/* -- Power ------------------------------------------------------ */}
        <Panel
          title="Power"
          description="Confirmed by reading the state back, not by the acknowledgement."
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Current</span>
              <Chip
                tone={
                  !live
                    ? 'unknown'
                    : state.power === 'on'
                      ? 'ok'
                      : transitioning
                        ? 'busy'
                        : 'idle'
                }
              >
                {live ? POWER_LABEL[state.power] : 'Unknown'}
              </Chip>
            </div>
            {transitioning && (
              <p className="rounded-md bg-panel-850 px-3 py-2 text-xs text-sky-300">
                {state.power === 'warming'
                  ? 'Lamp is striking. Power commands are refused until start-up finishes.'
                  : 'Cooling. The projector will not accept power-on until cooling completes.'}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn-primary btn-lg"
                disabled={!canControl || busy || !live || transitioning || state.power === 'on'}
                onClick={() =>
                  setConfirm({
                    title: `Power on ${projector.name}?`,
                    body: 'The lamp will strike and the projector will warm up over roughly 30 seconds.',
                    run: () => send('Power on', () => api.power(projectorId, 'on')),
                  })
                }
              >
                Power on
              </button>
              <button
                className="btn-danger btn-lg"
                disabled={!canControl || busy || !live || transitioning || state.power === 'off'}
                onClick={() =>
                  setConfirm({
                    title: `Power off ${projector.name}?`,
                    body: 'The projector will enter its cooling cycle and cannot be restarted until cooling completes.',
                    danger: true,
                    run: () => send('Power off', () => api.power(projectorId, 'off')),
                  })
                }
              >
                Power off
              </button>
            </div>
          </div>
        </Panel>

        {/* -- Shutter / image -------------------------------------------- */}
        <Panel title="Shutter">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Current</span>
              <Chip tone={!live ? 'unknown' : state.shutter === 'open' ? 'ok' : 'warn'}>
                {live ? SHUTTER_LABEL[state.shutter] : 'Unknown'}
              </Chip>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn-default btn-lg"
                disabled={!canControl || busy || !live || !usable('shutter.set')}
                onClick={() =>
                  setConfirm({
                    title: `Open shutter on ${projector.name}?`,
                    body: 'The image will be shown.',
                    run: () => send('Shutter open', () => api.shutter(projectorId, 'open')),
                  })
                }
              >
                Open
              </button>
              <button
                className="btn-default btn-lg"
                disabled={!canControl || busy || !live || !usable('shutter.set')}
                onClick={() =>
                  setConfirm({
                    title: `Close shutter on ${projector.name}?`,
                    body: 'The image will be blanked. The lamp stays on.',
                    danger: true,
                    run: () => send('Shutter close', () => api.shutter(projectorId, 'closed')),
                  })
                }
              >
                Close
              </button>
            </div>
            {!usable('shutter.set') && (
              <UnavailableNote reason={gateReason('shutter.set') ?? 'Unavailable'} />
            )}
          </div>
        </Panel>

        {/* -- Input ------------------------------------------------------- */}
        <Panel title="Input source">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Active</span>
              <Value text={input.text} muted={input.muted} title={input.title} />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {inputs.map(([code, label]) => {
                const unavailable = inputRetracted[`input.set:${code}`]
                return (
                  <button
                    key={code}
                    className={classNames(
                      'btn-default',
                      unavailable && 'line-through opacity-40',
                    )}
                    disabled={
                      !canControl || busy || !live || !usable('input.set') || Boolean(unavailable)
                    }
                    title={unavailable}
                    onClick={() =>
                      setConfirm({
                        title: `Switch ${projector.name} to ${label}?`,
                        body: 'The projector will change its input source. The image may blank briefly while it re-syncs.',
                        run: () => send(`Input ${label}`, () => api.input(projectorId, code)),
                      })
                    }
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            {Object.keys(inputRetracted).length > 0 && (
              <UnavailableNote
                reason={`Struck-through inputs were refused by this unit: ${Object.values(inputRetracted).join('; ')}`}
              />
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* -- Technical status -------------------------------------------- */}
        <Panel
          title="Technical status"
          description="“n/a” means the model has no such query. “—” means it was not read."
          className="xl:col-span-2"
        >
          <TechnicalStatus projector={projector} />
        </Panel>

        {/* -- Remote ------------------------------------------------------- */}
        <Panel
          title="Remote"
          description="Fire-and-forget: the projector does not report OSD cursor position."
        >
          {usable('remote.menu') ? (
            <div className="grid grid-cols-3 grid-rows-3 gap-2">
              {REMOTE_KEYS.map(([key, label, position]) => (
                <button
                  key={key}
                  className={classNames('btn-default btn-lg', position)}
                  disabled={!canControl || busy || !live}
                  onClick={() =>
                    void send(`Remote ${label}`, () =>
                      api.command(projectorId, `remote.${key}`),
                    )
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <UnavailableNote reason={gateReason('remote.menu') ?? 'Unavailable'} />
          )}
        </Panel>
      </div>

      {/* -- Lens ---------------------------------------------------------- */}
      <Panel
        title="Lens"
        description="Discrete jogs, not press-and-hold: no explicit stop command is confirmed for this model."
      >
        <LensControls
          disabled={!canControl || busy || !live}
          usable={usable}
          gateReason={gateReason}
          onJog={(cap, direction) =>
            void send(`Lens ${cap}`, () =>
              api.command(projectorId, cap, { direction, step: 1 }),
            )
          }
          onAction={(cap, title, body) =>
            setConfirm({
              title,
              body,
              run: () => send(cap, () => api.command(projectorId, cap)),
            })
          }
        />
      </Panel>

      {/* -- Command history ----------------------------------------------- */}
      <Panel
        title="Recent commands"
        description="Every command, with the exact frame sent and the projector's reply."
      >
        <CommandHistory rows={history} />
      </Panel>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ''}
        body={confirm?.body ?? ''}
        danger={confirm?.danger}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm
          setConfirm(null)
          if (action) void action.run()
        }}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}

function TechnicalStatus({ projector }: { projector: Projector }) {
  const { state } = projector
  const lamps =
    state.lamp_hours.availability === 'available' && Array.isArray(state.lamp_hours.value)
      ? state.lamp_hours.value
      : []
  const lampStatus = renderTelemetry(state.lamp_status, (value) =>
    value.state ?? `raw: ${value.raw}`,
  )
  const errorStatus = state.error_status

  const rows: Array<[string, { text: string; muted: boolean; title?: string }]> = [
    ['Manufacturer', { text: projector.manufacturer, muted: false }],
    ['Model', { text: projector.model, muted: false }],
    ['Lamp control status', lampStatus],
    [
      'Power',
      {
        text: state.online && !state.stale ? POWER_LABEL[state.power] : '—',
        muted: !state.online || state.stale,
        title: 'From the last successful poll',
      },
    ],
    [
      'Consecutive failures',
      { text: String(state.consecutive_failures), muted: state.consecutive_failures === 0 },
    ],
    ['Last reply', { text: relativeTime(state.last_seen_at), muted: state.stale }],
  ]

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm md:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd>
              <Value text={value.text} muted={value.muted} title={value.title} />
            </dd>
          </div>
        ))}
      </dl>

      <div>
        <h3 className="mb-2 text-xs uppercase tracking-wide text-slate-500">Lamps</h3>
        {lamps.length === 0 ? (
          <Value
            text={state.lamp_hours.availability === 'unsupported' ? 'n/a' : '—'}
            muted
            title={state.lamp_hours.note ?? 'Lamp hours have not been read yet'}
          />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {lamps.map((lamp) => {
              const tone =
                lamp.hours == null
                  ? 'text-slate-500'
                  : lamp.hours >= projector.lamp_critical_hours
                    ? 'text-red-300'
                    : lamp.hours >= projector.lamp_warn_hours
                      ? 'text-amber-300'
                      : 'text-slate-200'
              return (
                <div key={lamp.index} className="rounded-md bg-panel-850 px-3 py-2">
                  <p className="text-xs text-slate-500">Lamp {lamp.index}</p>
                  <p className={classNames('tnum text-sm', tone)}>
                    {lamp.hours == null ? '—' : `${lamp.hours.toLocaleString()} h`}
                  </p>
                  {lamp.error && <p className="text-xs text-red-400">{lamp.error}</p>}
                  {lamp.unparsed && (
                    <p className="text-xs text-amber-400" title={lamp.raw}>
                      unparsed reply
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs uppercase tracking-wide text-slate-500">
          Subsystem status
        </h3>
        {errorStatus.availability !== 'available' ? (
          <UnavailableNote
            reason={
              errorStatus.note ??
              'No per-subsystem error query is available on this transport.'
            }
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(errorStatus.value ?? {}).map(([subsystem, severity]) => (
              <Chip
                key={subsystem}
                tone={
                  severity === 'error' ? 'fault' : severity === 'warning' ? 'warn' : 'ok'
                }
              >
                {subsystem}: {severity}
              </Chip>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function LensControls({
  disabled,
  usable,
  gateReason,
  onJog,
  onAction,
}: {
  disabled: boolean
  usable: (name: string) => boolean
  gateReason: (name: string) => string | null
  onJog: (capability: string, direction: 1 | -1) => void
  onAction: (capability: string, title: string, body: string) => void
}) {
  const axes: Array<[string, string, string, string]> = [
    ['lens.shift_h', 'Shift H', '◀', '▶'],
    ['lens.shift_v', 'Shift V', '▼', '▲'],
    ['lens.focus', 'Focus', '−', '+'],
    ['lens.zoom', 'Zoom', 'Wide', 'Tele'],
  ]
  const axesUsable = usable('lens.shift_h')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-default"
          disabled={disabled || !usable('lens.home')}
          onClick={() =>
            onAction(
              'lens.home',
              'Move lens to home position?',
              'The lens will move to its home position. Any current alignment will be lost.',
            )
          }
        >
          Home position
        </button>
        <button
          className="btn-default"
          disabled={disabled || !usable('lens.calibrate')}
          onClick={() =>
            onAction(
              'lens.calibrate',
              'Run lens calibration?',
              'Calibration moves the lens through its full range and takes up to a minute. Do not run this during a show.',
            )
          }
        >
          Calibrate
        </button>
      </div>

      {axesUsable ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {axes.map(([capability, label, minus, plus]) => (
            <div key={capability} className="rounded-md bg-panel-850 p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">{label}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="btn-default btn-lg"
                  disabled={disabled}
                  onClick={() => onJog(capability, -1)}
                >
                  {minus}
                </button>
                <button
                  className="btn-default btn-lg"
                  disabled={disabled}
                  onClick={() => onJog(capability, 1)}
                >
                  {plus}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <UnavailableNote reason={gateReason('lens.shift_h') ?? 'Unavailable'} />
      )}

      <UnavailableNote reason="Lens memory is not implemented: no lens-memory command could be confirmed for this model, so the platform does not offer one." />
    </div>
  )
}

function CommandHistory({ rows }: { rows: CommandLogRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No commands recorded yet.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="pb-2 pr-4 font-medium">Time</th>
            <th className="pb-2 pr-4 font-medium">Command</th>
            <th className="pb-2 pr-4 font-medium">Sent</th>
            <th className="pb-2 pr-4 font-medium">Reply</th>
            <th className="pb-2 pr-4 font-medium">Outcome</th>
            <th className="pb-2 pr-4 font-medium">ms</th>
            <th className="pb-2 font-medium">By</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="py-1.5 pr-4 tnum text-slate-400">
                {formatDateTime(row.created_at)}
              </td>
              <td className="py-1.5 pr-4 text-slate-300">{row.capability}</td>
              <td className="py-1.5 pr-4 font-mono text-slate-500">
                {row.raw_request ?? '—'}
              </td>
              <td className="py-1.5 pr-4 font-mono text-slate-500">
                {row.raw_response ?? '—'}
              </td>
              <td className="py-1.5 pr-4">
                <Chip
                  tone={
                    row.outcome === 'pending'
                      ? 'busy'
                      : outcomeTone(row.outcome as CommandLogRow['outcome'] & never)
                  }
                  title={row.error ?? undefined}
                >
                  {row.outcome}
                </Chip>
              </td>
              <td className="py-1.5 pr-4 tnum text-slate-500">{row.latency_ms ?? '—'}</td>
              <td className="py-1.5 text-slate-500">
                {row.username ?? row.source}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
