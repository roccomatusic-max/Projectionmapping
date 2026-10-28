import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError, api, type Session } from '@/api/client'
import type {
  Capability,
  CapabilityManifest,
  CommandLogRow,
  ConnectionTest,
  FanReading,
  Projector,
  Telemetry,
  TemperatureReading,
  TemperatureSensor,
} from '@/api/types'
import { useFleetContext, useOps, latestCommand, phaseIsActive, type TrackedCommand } from '@/live/LiveProvider'
import { useDrivers } from '@/live/useCatalog'
import { useTicker } from '@/hooks/useLiveData'
import {
  inputRequest,
  powerRequest,
  shutterRequest,
  useProjectorCommand,
} from '@/components/fleet/useProjectorCommand'
import { CommandStrip } from '@/components/ProjectorCard'
import { Freshness, LinkBadge, PowerBadge, ShutterBadge } from '@/components/status'
import { LampMeter, ProjectorMark, inputIcon } from '@/components/graphics'
import {
  Banner,
  Chip,
  EmptyState,
  InfoTip,
  Panel,
  Spinner,
  Tabs,
  UnavailableNote,
  Value,
} from '@/components/ui'
import { TONE_TEXT, type Tone } from '@/components/tone'
import {
  BackIcon,
  BrightnessIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  ChevronIcon,
  ColorIcon,
  ContrastIcon,
  CoverIcon,
  EditIcon,
  EnterIcon,
  FanIcon,
  FaultIcon,
  FilterIcon,
  FreezeIcon,
  HdmiIcon,
  LampIcon,
  LensIcon,
  LiveIcon,
  LogsIcon,
  MaintenanceIcon,
  OsdIcon,
  PictureIcon,
  PowerIcon,
  RefreshIcon,
  RemoteIcon,
  ShutterIcon,
  TemperatureIcon,
  type LucideIcon,
} from '@/components/icons'
import {
  OUTCOME_HELP,
  OUTCOME_LABEL,
  classNames,
  formatDateTime,
  inputsFromCapabilities,
  outcomeTone,
  relativeTime,
  renderTelemetry,
} from '@/lib/format'
import {
  activeInput,
  attentionItems,
  deviceTone,
  isLive,
  isTransitioning,
  lampReadings,
} from '@/lib/status'
import { ProjectorForm } from './Projectors'

type TabId = 'picture' | 'remote' | 'lamp' | 'log'

/* ------------------------------------------------------------------ */
/* Capability gating                                                    */
/* ------------------------------------------------------------------ */

interface Gate {
  capability: (name: string) => Capability | undefined
  /** Declared, not retracted on this unit, and trusted or opted into. */
  usable: (name: string) => boolean
  /** Why a capability cannot be used here, or null when it can. */
  reason: (name: string) => string | null
  /** Enabled only because the operator opted into unverified commands. */
  unverified: (name: string) => boolean
  /** The technical why behind a reason, for a tooltip. */
  detail: (name: string) => string | undefined
}

function makeGate(manifest: CapabilityManifest | null): Gate {
  const capability = (name: string) => manifest?.capabilities.find((item) => item.name === name)
  const reason = (name: string): string | null => {
    const cap = capability(name)
    if (!manifest) return 'Loading what this projector can do…'
    if (!cap) return 'This projector model does not offer it here.'
    const retracted = manifest.retracted[name]
    if (retracted) return retracted
    if (cap.requires_opt_in && !manifest.allow_unverified_commands) {
      return 'Not yet confirmed on this exact model, so it is off. To try it, an administrator turns on “Allow unverified commands” under Edit.'
    }
    return null
  }
  const detail = (name: string) => {
    const cap = capability(name)
    return cap?.requires_opt_in ? cap.caveat ?? 'Documented only for a sibling model.' : undefined
  }
  return {
    capability,
    reason,
    usable: (name) => reason(name) === null,
    unverified: (name) => Boolean(capability(name)?.requires_opt_in && manifest?.allow_unverified_commands),
    detail,
  }
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                                */
/* ------------------------------------------------------------------ */

function ControlBlock({
  icon: Icon,
  title,
  status,
  children,
  footer,
  unverified,
}: {
  icon: LucideIcon
  title: string
  status?: ReactNode
  children: ReactNode
  footer?: ReactNode
  unverified?: boolean
}) {
  return (
    <div className="inset flex flex-col gap-2.5 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow flex items-center gap-1.5">
          <Icon size={13} aria-hidden /> {title}
          {unverified && (
            <span className="rounded bg-yellow-500/15 px-1 text-[10px] normal-case tracking-normal text-yellow-300" title="Enabled through “Allow unverified commands”: the encoding is documented for a sibling model only.">
              unverified
            </span>
          )}
        </span>
        {status}
      </div>
      {children}
      {footer}
    </div>
  )
}

/**
 * Controls this projector cannot use, named on one line instead of a box
 * each, with the reasons a tap or hover away.
 */
function NotAvailable({ items, className }: { items: Array<{ label: string; reason: string; detail?: string }>; className?: string }) {
  if (items.length === 0) return null
  return (
    <p className={classNames('flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500', className)}>
      <span>Not available on this projector: {items.map((item) => item.label).join(', ')}.</span>
      <InfoTip label="Why are these not available?" text="Why?">
        {items.map((item) => (
          <span key={item.label} className="mb-1 block last:mb-0">
            <b>{item.label}</b>: {item.reason}
            {item.detail && <span className="block text-slate-400">({item.detail})</span>}
          </span>
        ))}
      </InfoTip>
    </p>
  )
}

/** Segmented control whose highlighted segment is the projector's
 *  confirmed state. Pressing a segment asks to change to it. */
function StateSwitch<T extends string>({
  options,
  current,
  disabled,
  title,
  onSelect,
  label,
}: {
  options: Array<{ value: T; label: string; icon?: LucideIcon }>
  current: T | null
  disabled: boolean
  title?: string
  onSelect: (value: T) => void
  label: string
}) {
  return (
    <div className="seg w-full" role="group" aria-label={label} title={title}>
      {options.map((option) => {
        const active = current === option.value
        return (
          <button
            key={option.value}
            className={classNames('seg-item py-2', active && 'seg-item-active')}
            aria-pressed={active}
            disabled={disabled || active}
            onClick={() => onSelect(option.value)}
          >
            {option.icon && <option.icon size={14} aria-hidden />}
            {option.label}
            {active && <span className="sr-only"> (current)</span>}
          </button>
        )
      })}
    </div>
  )
}

/** For settings the projector cannot report: what was last sent from here. */
function LastSent({ command, history, capability }: { command?: TrackedCommand; history: CommandLogRow[]; capability: string }) {
  if (command && command.phase !== 'failed' && command.phase !== 'unavailable' && command.phase !== 'notnow') {
    const value = command.params?.state ?? command.params?.value
    return (
      <p className="text-2xs text-slate-500">
        Last sent: <span className="text-slate-300">{String(value)}</span> {relativeTime(new Date(command.startedAt).toISOString())}. Not read back.
      </p>
    )
  }
  const row = history.find((r) => r.capability === capability && (r.outcome === 'accepted' || r.outcome === 'ok' || r.outcome === 'confirmed'))
  if (row) {
    const value = row.params?.state ?? row.params?.value
    return (
      <p className="text-2xs text-slate-500">
        Last sent: <span className="text-slate-300">{String(value)}</span> {relativeTime(row.created_at)}
        {row.username && ` by ${row.username}`}. Not read back.
      </p>
    )
  }
  return <p className="text-2xs text-slate-500">The projector does not report this setting.</p>
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function ProjectorDetail({ session }: { session: Session }) {
  const { id } = useParams()
  const projectorId = Number(id)
  const { projectors, loading, refresh } = useFleetContext()
  const { commands, notify } = useOps()
  const drivers = useDrivers()
  const { ask, dialog } = useProjectorCommand()
  const [manifest, setManifest] = useState<CapabilityManifest | null>(null)
  const [manifestError, setManifestError] = useState<string | null>(null)
  const [history, setHistory] = useState<CommandLogRow[]>([])
  const [probe, setProbe] = useState<ConnectionTest | null>(null)
  const [checking, setChecking] = useState<'poll' | 'test' | null>(null)
  const [tab, setTab] = useState<TabId>('picture')
  const [editing, setEditing] = useState(false)
  // The page stays mounted when the link goes to another projector, so a
  // reply that arrives after that is for the previous one and is dropped.
  const shownId = useRef(projectorId)
  shownId.current = projectorId
  useTicker(5000)

  const projector = projectors.find((p) => p.id === projectorId)
  const canControl = session.role !== 'viewer'
  const isAdmin = session.role === 'admin'

  const loadManifest = useCallback(async () => {
    try {
      const loaded = await api.capabilities(projectorId)
      if (shownId.current !== projectorId) return
      setManifest(loaded)
      setManifestError(null)
    } catch (err) {
      if (shownId.current !== projectorId) return
      setManifestError(err instanceof Error ? err.message : 'Could not load capabilities')
    }
  }, [projectorId])

  const loadHistory = useCallback(async () => {
    try {
      const { commands: rows } = await api.commandHistory(projectorId, 60)
      if (shownId.current === projectorId) setHistory(rows)
    } catch {
      // The log is supplementary; the controls still work without it.
    }
  }, [projectorId])

  useEffect(() => {
    setManifest(null)
    setProbe(null)
    void loadManifest()
    void loadHistory()
  }, [loadManifest, loadHistory])

  // Settled commands change what the log and the manifest say (an input the
  // unit refused is retracted). Reload when one of ours settles.
  const mine = useMemo(() => commands.filter((c) => c.projectorId === projectorId), [commands, projectorId])
  const settledKey = mine.filter((c) => !phaseIsActive(c.phase)).map((c) => `${c.id}:${c.phase}`).join(',')
  useEffect(() => {
    if (!settledKey) return
    void loadHistory()
    void loadManifest()
  }, [settledKey, loadHistory, loadManifest])

  // While the log tab is open, keep it current with other operators' commands.
  useEffect(() => {
    if (tab !== 'log') return
    const timer = window.setInterval(() => void loadHistory(), 15000)
    return () => window.clearInterval(timer)
  }, [tab, loadHistory])

  const gate = useMemo(() => makeGate(manifest), [manifest])

  if (!projector) {
    if (loading) return <Spinner label="Loading projector…" />
    return (
      <div className="panel">
        <EmptyState
          title="Projector not found"
          action={<Link to="/projectors" className="btn-default btn-sm">All projectors</Link>}
        >
          It may have been removed.
        </EmptyState>
      </div>
    )
  }

  const { state } = projector
  const live = isLive(projector)
  const transitioning = isTransitioning(projector)
  const driverName = drivers.find((d) => d.driver_id === projector.driver)?.display_name ?? projector.driver
  const issues = attentionItems(projector)
  const command = (capability?: string) => latestCommand(commands, projectorId, capability)
  const busy = (capability: string) => {
    const c = command(capability)
    return c !== undefined && phaseIsActive(c.phase)
  }

  /** Why this control cannot be pressed right now, or null. */
  const blocked = (capability: string): string | null => {
    if (!canControl) return 'Your role is view-only.'
    if (!projector.enabled) return 'This projector is disabled.'
    if (!live) return 'The projector is not responding.'
    const reason = gate.reason(capability)
    if (reason) return reason
    if (busy(capability)) return 'Waiting for the previous command to resolve.'
    return null
  }

  const send = (capability: string, label: string, params: Record<string, unknown> = {}, confirm?: { title: string; body: ReactNode; danger?: boolean }) =>
    ask({
      projectors: [projector],
      spec: { capability, params, label },
      title: confirm?.title ?? label,
      body: confirm?.body ?? null,
      danger: confirm?.danger,
      confirmLabel: label,
      confirm: Boolean(confirm),
    })

  const pollNow = async () => {
    setChecking('poll')
    try {
      await api.status(projectorId, true)
      await refresh()
      notify('ok', `${projector.name}: status read from the projector`)
    } catch (err) {
      notify('fault', `${projector.name}: poll failed`, err instanceof ApiError ? err.message : undefined)
    } finally {
      setChecking(null)
    }
  }

  const testConnection = async () => {
    setChecking('test')
    try {
      const result = await api.testConnection(projectorId)
      if (shownId.current === projectorId) setProbe(result)
    } catch (err) {
      notify('fault', 'Connection test failed', err instanceof ApiError ? err.message : undefined)
    } finally {
      setChecking(null)
    }
  }

  const powerBlocked = blocked('power.set')
  // Not a block: the server holds a power command the projector refuses
  // while it changes state, and sends it as soon as it is taken.
  const powerNote = powerBlocked ?? (transitioning
    ? state.power === 'warming'
      ? 'Starting up. If you press Standby now, it turns off by itself once start-up finishes.'
      : 'Cooling down, usually 1 to 2 minutes. If you press On now, it turns on by itself once cooling finishes.'
    : null)
  const shutterBlocked = blocked('shutter.set') ?? (state.power !== 'on' ? 'Shutter control needs the projector powered on.' : null)
  const inputBlocked = blocked('input.set')
  const input = activeInput(projector)
  const inputs = manifest ? inputsFromCapabilities(manifest.capabilities) : []
  const retractedParams = manifest?.retracted_params ?? {}

  const extraLampCaps = ['lamp.select', 'lamp.power'].filter((name) => gate.capability(name))
  const tabs: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
    { id: 'picture', label: 'Picture', icon: PictureIcon },
    { id: 'remote', label: 'Remote & lens', icon: RemoteIcon },
    ...(extraLampCaps.length ? [{ id: 'lamp' as const, label: 'Lamp mode', icon: LampIcon }] : []),
    { id: 'log', label: 'Command log', icon: LogsIcon },
  ]

  return (
    <div className="space-y-4">
      {/* Target bar: always says which projector receives the commands. */}
      <div className="z-30 -mx-3 border-b md:sticky md:top-[var(--shell-top,3rem)] border-white/[0.06] bg-panel-950/95 px-3 pb-3 pt-1 backdrop-blur sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6">
        <Link to="/projectors" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
          <BackIcon size={12} aria-hidden /> Projectors
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex w-full min-w-0 items-center gap-3 xl:w-auto xl:flex-1">
            <ProjectorMark tone={deviceTone(projector)} pulse={transitioning} size="md" />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold leading-tight text-slate-50">{projector.name}</h1>
              <p className="truncate text-xs text-slate-400">
                {projector.manufacturer} {projector.model}
                <span className="text-slate-600"> · </span>
                <span className="tnum">{projector.host}:{projector.port}</span>
                {projector.location && <span className="text-slate-500"> · {projector.location}</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <LinkBadge projector={projector} />
            <PowerBadge projector={projector} />
            <ShutterBadge projector={projector} />
            <Freshness projector={projector} className="ml-1 text-xs" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button className="btn-default btn-sm" disabled={checking !== null || !projector.enabled} onClick={() => void pollNow()} title="Ask the projector for every reading now, instead of waiting for the next regular check">
              {checking === 'poll' ? <Spinner size="sm" label={null} /> : <RefreshIcon size={13} aria-hidden />} Check now
            </button>
            <button className="btn-default btn-sm" disabled={checking !== null} onClick={() => void testConnection()} title="Connect and sign in to the projector to prove the address and password work. Changes nothing.">
              {checking === 'test' ? <Spinner size="sm" label={null} /> : <LiveIcon size={13} aria-hidden />} Test connection
            </button>
            {isAdmin && (
              <button className="btn-ghost btn-sm" onClick={() => setEditing(true)}>
                <EditIcon size={13} aria-hidden /> Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Problems first */}
      {!projector.enabled && (
        <Banner tone="idle" title="This projector is disabled">
          It is not polled and cannot be controlled. An administrator can enable it from Edit.
        </Banner>
      )}
      {projector.enabled && !live && (
        <Banner tone="fault" title={state.last_seen_at ? 'Not responding' : 'Never reached'}>
          {state.last_seen_at
            ? `No successful poll since ${formatDateTime(state.last_seen_at)} (${relativeTime(state.last_seen_at)}). Values below are the last known readings, not live state.`
            : 'The projector has not answered since it was added. Check the address, port, network and control password, then Test connection.'}
          {state.last_error && <span className="mt-1 block font-mono text-2xs opacity-80">{state.last_error}</span>}
        </Banner>
      )}
      {live && issues.filter((i) => i.severity !== 'notice').length > 0 && (
        <Banner tone={issues[0].severity === 'critical' ? 'fault' : 'warn'} title="Equipment warnings">
          <ul className="space-y-0.5">
            {issues.filter((i) => i.severity !== 'notice').map((item) => (
              <li key={item.text}>
                {item.text}
                {item.detail && <span className="opacity-70"> · {item.detail}</span>}
              </li>
            ))}
          </ul>
        </Banner>
      )}
      {probe && (
        <Banner
          tone={probe.reachable && probe.authenticated ? 'ok' : 'fault'}
          title={probe.reachable && probe.authenticated ? 'Connection test passed' : 'Connection test failed'}
          onDismiss={() => setProbe(null)}
        >
          {probe.detail}
          {probe.tcp_latency_ms != null && ` · ${probe.tcp_latency_ms} ms`}
          {probe.raw_response && <span className="mt-1 block font-mono text-2xs opacity-80">Projector replied: {probe.raw_response}</span>}
        </Banner>
      )}
      {manifestError && <Banner tone="warn" title="Capabilities could not be loaded">{manifestError}</Banner>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          {/* -- Primary controls ------------------------------------- */}
          <Panel icon={PowerIcon} title="Power, shutter and input" description="The lit button is what the projector itself reports right now, not just the last one pressed.">
            <div className="grid gap-3 md:grid-cols-2">
              <ControlBlock
                icon={PowerIcon}
                title="Power"
                status={<PowerBadge projector={projector} />}
                footer={<CommandStrip command={command('power.set')} />}
              >
                <StateSwitch
                  label="Power"
                  options={[
                    { value: 'on', label: 'On', icon: PowerIcon },
                    { value: 'off', label: 'Standby' },
                  ]}
                  current={live && (state.power === 'on' || state.power === 'off') ? state.power : null}
                  disabled={powerBlocked !== null}
                  title={powerBlocked ?? undefined}
                  onSelect={(value) => ask(powerRequest([projector], value))}
                />
                {powerNote && live && <p className="text-2xs text-slate-500">{powerNote}</p>}
              </ControlBlock>

              <ControlBlock
                icon={ShutterIcon}
                title="Shutter"
                status={<ShutterBadge projector={projector} />}
                footer={<CommandStrip command={command('shutter.set')} />}
              >
                <StateSwitch
                  label="Shutter"
                  options={[
                    { value: 'open', label: 'Open' },
                    { value: 'closed', label: 'Closed' },
                  ]}
                  current={live && state.shutter !== 'unknown' ? state.shutter : null}
                  disabled={shutterBlocked !== null}
                  title={shutterBlocked ?? undefined}
                  onSelect={(value) => ask(shutterRequest([projector], value))}
                />
                {shutterBlocked && live && <p className="text-2xs text-slate-500">{shutterBlocked}</p>}
              </ControlBlock>

              <div className="md:col-span-2">
                <ControlBlock
                  icon={HdmiIcon}
                  title="Input"
                  status={
                    <span className={classNames('text-xs', input.muted ? 'text-slate-500' : 'text-slate-200')} title={input.title}>
                      {input.muted ? input.text : `Active: ${input.text}`}
                    </span>
                  }
                  footer={<CommandStrip command={command('input.set')} />}
                >
                  {!manifest ? (
                    <Spinner size="sm" />
                  ) : inputs.length === 0 ? (
                    <UnavailableNote reason={gate.reason('input.set') ?? 'No inputs declared by this driver.'} />
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      {inputs.map(([code, label]) => {
                        const unavailable = retractedParams[`input.set:${code}`]
                        const Icon = inputIcon(code)
                        const active = live && input.code === code
                        return (
                          <button
                            key={code}
                            className={classNames(
                              'btn-default justify-start',
                              active && 'border-sky-500/60 bg-sky-500/15 text-slate-50 disabled:opacity-100',
                              unavailable && 'line-through',
                            )}
                            aria-pressed={active}
                            disabled={Boolean(inputBlocked) || Boolean(unavailable) || active}
                            title={unavailable ?? inputBlocked ?? (active ? 'Current input' : `Switch to ${label}`)}
                            onClick={() => ask(inputRequest([projector], code, label))}
                          >
                            <Icon size={14} className="text-slate-400" aria-hidden /> {label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {Object.keys(retractedParams).length > 0 && (
                    <p className="text-2xs text-slate-500">
                      Struck-through inputs were refused by this unit: {Object.values(retractedParams).join('; ')}
                    </p>
                  )}
                </ControlBlock>
              </div>

              {gate.usable('image.freeze') && (
                <OnOffBlock
                  icon={FreezeIcon}
                  title="Freeze"
                  capability="image.freeze"
                  gate={gate}
                  blocked={blocked('image.freeze')}
                  command={command('image.freeze')}
                  history={history}
                  onSend={(value) => send('image.freeze', value === 'on' ? 'Freeze on' : 'Freeze off', { state: value })}
                />
              )}
              {gate.usable('osd.set') && (
                <OnOffBlock
                  icon={OsdIcon}
                  title="On-screen display"
                  capability="osd.set"
                  gate={gate}
                  blocked={blocked('osd.set')}
                  command={command('osd.set')}
                  history={history}
                  onSend={(value) => send('osd.set', value === 'on' ? 'OSD on' : 'OSD off', { state: value })}
                />
              )}
            </div>
            {manifest && (
              <NotAvailable
                className="mt-3"
                items={[
                  { label: 'Freeze', capability: 'image.freeze' },
                  { label: 'On-screen display', capability: 'osd.set' },
                ]
                  .filter((item) => !gate.usable(item.capability))
                  .map((item) => ({ label: item.label, reason: gate.reason(item.capability) ?? 'Unavailable', detail: gate.detail(item.capability) }))}
              />
            )}
          </Panel>

          {/* -- Secondary controls ----------------------------------- */}
          <section className="panel">
            <Tabs tabs={tabs} value={tab} onChange={setTab} className="px-2" />
            <div className="p-4">
              {tab === 'picture' && (
                <PictureControls
                  gate={gate}
                  blocked={blocked}
                  commands={mine}
                  history={history}
                  onSend={(capability, label, value) => send(capability, `${label} ${value}`, { value })}
                />
              )}
              {tab === 'remote' && (
                <RemoteAndLens
                  gate={gate}
                  blocked={blocked}
                  lastRemote={mine.find((c) => c.capability.startsWith('remote.') || c.capability.startsWith('lens.'))}
                  onSend={send}
                />
              )}
              {tab === 'lamp' && (
                <LampMode gate={gate} blocked={blocked} command={command} onSend={send} />
              )}
              {tab === 'log' && <CommandHistory rows={history} />}
            </div>
          </section>
        </div>

        {/* -- Equipment status --------------------------------------- */}
        <aside className="min-w-0 space-y-4">
          <EquipmentStatus projector={projector} driverName={driverName} />
        </aside>
      </div>

      {editing && (
        <ProjectorForm
          drivers={drivers}
          projector={projector}
          onClose={() => setEditing(false)}
          onSaved={(message) => {
            setEditing(false)
            notify('ok', message)
            void refresh()
            void loadManifest()
          }}
          onError={(message) => notify('fault', 'Save failed', message)}
        />
      )}
      {dialog}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Freeze / OSD                                                         */
/* ------------------------------------------------------------------ */

function OnOffBlock({
  icon,
  title,
  capability,
  gate,
  blocked,
  command,
  history,
  onSend,
}: {
  icon: LucideIcon
  title: string
  capability: string
  gate: Gate
  blocked: string | null
  command?: TrackedCommand
  history: CommandLogRow[]
  onSend: (value: 'on' | 'off') => void
}) {
  const declared = Boolean(gate.capability(capability))
  return (
    <ControlBlock icon={icon} title={title} unverified={gate.unverified(capability)} footer={<CommandStrip command={command} />}>
      {declared && gate.usable(capability) ? (
        <>
          <div className="seg w-full" role="group" aria-label={title}>
            <button className="seg-item py-2" disabled={blocked !== null} title={blocked ?? undefined} onClick={() => onSend('on')}>
              On
            </button>
            <button className="seg-item py-2" disabled={blocked !== null} title={blocked ?? undefined} onClick={() => onSend('off')}>
              Off
            </button>
          </div>
          <LastSent command={command} history={history} capability={capability} />
        </>
      ) : (
        <UnavailableNote reason={gate.reason(capability) ?? 'Unavailable'} />
      )}
    </ControlBlock>
  )
}

/* ------------------------------------------------------------------ */
/* Picture                                                              */
/* ------------------------------------------------------------------ */

const PICTURE: Array<{ capability: string; label: string; icon: LucideIcon }> = [
  { capability: 'image.brightness', label: 'Brightness', icon: BrightnessIcon },
  { capability: 'image.contrast', label: 'Contrast', icon: ContrastIcon },
  { capability: 'image.color', label: 'Colour', icon: ColorIcon },
  { capability: 'image.tint', label: 'Tint', icon: ColorIcon },
  { capability: 'image.sharpness', label: 'Sharpness', icon: PictureIcon },
]

function PictureControls({
  gate,
  blocked,
  commands,
  history,
  onSend,
}: {
  gate: Gate
  blocked: (capability: string) => string | null
  commands: TrackedCommand[]
  history: CommandLogRow[]
  onSend: (capability: string, label: string, value: number) => void
}) {
  const declared = PICTURE.filter((item) => gate.capability(item.capability))
  const pictureMode = gate.capability('image.picture_mode')
  const testPattern = gate.capability('image.test_pattern')
  const reasons = declared.map((item) => gate.reason(item.capability))
  const sharedGate = reasons.length > 1 && reasons[0] && reasons.every((r) => r === reasons[0]) ? reasons[0] : null
  return (
    <div className="space-y-4">
      {declared.length > 0 && !sharedGate && (
        <p className="text-xs text-slate-500">
          The projector does not report these settings, so each slider starts from the last value sent. Nothing is
          sent until you press Apply.
        </p>
      )}
      {declared.length === 0 || sharedGate ? null : (
        <div className="grid gap-3 md:grid-cols-2">
          {declared.map((item) => (
            <PictureSlider
              key={item.capability}
              {...item}
              range={gate.capability(item.capability)?.value_range ?? [0, 63]}
              unverified={gate.unverified(item.capability)}
              gateReason={gate.reason(item.capability)}
              blocked={blocked(item.capability)}
              lastSent={lastSentValue(item.capability, commands, history)}
              command={commands.find((c) => c.capability === item.capability)}
              onSend={(value) => onSend(item.capability, item.label, value)}
            />
          ))}
        </div>
      )}
      <NotAvailable
        items={[
          ...(declared.length === 0
            ? [{ label: 'Brightness, contrast, colour, tint and sharpness', reason: 'This projector model offers no picture adjustments here.' }]
            : sharedGate
              ? [{ label: declared.map((item) => item.label).join(', '), reason: sharedGate, detail: gate.detail(declared[0].capability) }]
              : []),
          {
            label: 'Picture mode',
            reason: pictureMode
              ? gate.reason('image.picture_mode') ?? 'Picture mode has no control here yet.'
              : 'No picture-mode command has been confirmed for this projector, so none is sent. Use the projector’s own menu.',
          },
          {
            label: 'Test patterns',
            reason: testPattern
              ? gate.reason('image.test_pattern') ?? 'Test patterns have no control here yet.'
              : 'No test-pattern command has been confirmed for this projector. Use the projector’s own menu (Remote & lens tab), or the test patterns in Mapping → Set up → Your projectors.',
          },
        ]}
      />
    </div>
  )
}

function lastSentValue(capability: string, commands: TrackedCommand[], history: CommandLogRow[]): { value: number; at: string } | null {
  const mine = commands.find((c) => c.capability === capability && !['failed', 'unavailable', 'notnow'].includes(c.phase))
  if (mine && typeof mine.params?.value === 'number') {
    return { value: mine.params.value, at: new Date(mine.startedAt).toISOString() }
  }
  const row = history.find((r) => r.capability === capability && ['accepted', 'ok', 'confirmed'].includes(r.outcome))
  const value = row ? Number(row.params?.value) : NaN
  return row && Number.isFinite(value) ? { value, at: row.created_at } : null
}

function PictureSlider({
  label,
  icon,
  range,
  unverified,
  gateReason,
  blocked,
  lastSent,
  command,
  onSend,
}: {
  capability: string
  label: string
  icon: LucideIcon
  range: [number, number]
  unverified: boolean
  gateReason: string | null
  blocked: string | null
  lastSent: { value: number; at: string } | null
  command?: TrackedCommand
  onSend: (value: number) => void
}) {
  const [draft, setDraft] = useState<number | null>(null)
  const value = draft ?? lastSent?.value ?? null
  const [low, high] = range
  return (
    <ControlBlock
      icon={icon}
      title={label}
      unverified={unverified}
      status={<span className="tnum text-sm text-slate-100">{value ?? '—'}</span>}
      footer={<CommandStrip command={command} />}
    >
      {gateReason ? (
        <UnavailableNote reason={gateReason} />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span className="tnum w-6 text-right text-2xs text-slate-500">{low}</span>
            <input
              type="range"
              min={low}
              max={high}
              value={value ?? Math.round((low + high) / 2)}
              onChange={(e) => setDraft(Number(e.target.value))}
              aria-label={label}
              className={classNames(value == null && 'opacity-40')}
            />
            <span className="tnum w-6 text-2xs text-slate-500">{high}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xs text-slate-500">
              {lastSent ? `Last sent ${lastSent.value}, ${relativeTime(lastSent.at)}` : 'Not sent from here yet'}
            </span>
            <button
              className="btn-default btn-sm"
              disabled={blocked !== null || draft === null || draft === lastSent?.value}
              title={blocked ?? undefined}
              onClick={() => {
                if (draft !== null) onSend(draft)
                setDraft(null)
              }}
            >
              Apply {draft !== null ? draft : ''}
            </button>
          </div>
        </>
      )}
    </ControlBlock>
  )
}

/* ------------------------------------------------------------------ */
/* Remote keypad and lens                                               */
/* ------------------------------------------------------------------ */

type Send = (capability: string, label: string, params?: Record<string, unknown>, confirm?: { title: string; body: ReactNode; danger?: boolean }) => void

function RemoteAndLens({
  gate,
  blocked,
  lastRemote,
  onSend,
}: {
  gate: Gate
  blocked: (capability: string) => string | null
  lastRemote?: TrackedCommand
  onSend: Send
}) {
  const key = (name: string, label: ReactNode, aria: string, className?: string) => {
    const capability = `remote.${name}`
    const reason = blocked(capability)
    return (
      <button
        className={classNames('btn-default h-12 text-sm', className)}
        disabled={reason !== null}
        title={reason ?? aria}
        aria-label={aria}
        onClick={() => onSend(capability, `Remote ${aria}`)}
      >
        {label}
      </button>
    )
  }
  const remoteAvailable = gate.usable('remote.menu')
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
      <ControlBlock icon={RemoteIcon} title="Remote keypad" unverified={gate.unverified('remote.menu')}>
        {remoteAvailable ? (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              {key('menu', 'Menu', 'Menu')}
              {key('up', <ChevronUpIcon size={18} />, 'Up')}
              {key('back', 'Return', 'Return')}
              {key('left', <ChevronLeftIcon size={18} />, 'Left')}
              {key('enter', <EnterIcon size={16} />, 'Enter', 'border-sky-500/30')}
              {key('right', <ChevronIcon size={18} />, 'Right')}
              <span />
              {key('down', <ChevronDownIcon size={18} />, 'Down')}
              <span />
            </div>
            <p className="text-2xs text-slate-500">
              Key presses are sent once each and are not read back: the projector does not report its menu position.
            </p>
          </>
        ) : (
          <UnavailableNote reason={gate.reason('remote.menu') ?? 'Unavailable'} />
        )}
      </ControlBlock>
      <LensControls gate={gate} blocked={blocked} onSend={onSend} />
      {lastRemote && (
        <div className="lg:col-span-2">
          <CommandStrip command={lastRemote} />
        </div>
      )}
    </div>
  )
}

function LensControls({ gate, blocked, onSend }: { gate: Gate; blocked: (capability: string) => string | null; onSend: Send }) {
  const axes: Array<[string, string, ReactNode, ReactNode, string, string]> = [
    ['lens.shift_h', 'Shift H', <ChevronLeftIcon size={16} key="l" />, <ChevronIcon size={16} key="r" />, 'left', 'right'],
    ['lens.shift_v', 'Shift V', <ChevronDownIcon size={16} key="d" />, <ChevronUpIcon size={16} key="u" />, 'down', 'up'],
    ['lens.focus', 'Focus', '−', '+', '−', '+'],
    ['lens.zoom', 'Zoom', 'Wide', 'Tele', 'wide', 'tele'],
  ]
  const axesReason = gate.reason('lens.shift_h')
  return (
    <ControlBlock icon={LensIcon} title="Lens" unverified={gate.unverified('lens.shift_h')}>
      <p className="text-2xs text-slate-500">
        One small step per press. No stop command is confirmed for this model, so press-and-hold is deliberately not offered.
      </p>
      {axesReason ? (
        <UnavailableNote reason={axesReason} />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {axes.map(([capability, label, minus, plus, minusName, plusName]) => {
            const reason = blocked(capability)
            return (
              <div key={capability}>
                <p className="eyebrow mb-1">{label}</p>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    className="btn-default h-11"
                    disabled={reason !== null}
                    title={reason ?? `${label} ${minusName}`}
                    aria-label={`${label} ${minusName}`}
                    onClick={() => onSend(capability, `Lens ${label} ${minusName}`, { direction: -1, step: 1 })}
                  >
                    {minus}
                  </button>
                  <button
                    className="btn-default h-11"
                    disabled={reason !== null}
                    title={reason ?? `${label} ${plusName}`}
                    aria-label={`${label} ${plusName}`}
                    onClick={() => onSend(capability, `Lens ${label} ${plusName}`, { direction: 1, step: 1 })}
                  >
                    {plus}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button
          className="btn-default btn-sm"
          disabled={blocked('lens.home') !== null}
          title={blocked('lens.home') ?? undefined}
          onClick={() =>
            onSend('lens.home', 'Lens home', {}, {
              title: 'Move the lens to its home position?',
              body: 'The lens moves to its home position. Any current alignment will be lost.',
              danger: true,
            })
          }
        >
          Home position
        </button>
        <button
          className="btn-default btn-sm"
          disabled={blocked('lens.calibrate') !== null}
          title={blocked('lens.calibrate') ?? undefined}
          onClick={() =>
            onSend('lens.calibrate', 'Lens calibration', {}, {
              title: 'Run lens calibration?',
              body: 'The lens moves through its full range, which takes up to a minute. Do not run this during a show.',
              danger: true,
            })
          }
        >
          Calibrate
        </button>
      </div>
      <p className="text-2xs text-slate-500">
        {gate.capability('lens.memory')?.caveat ??
          'Lens memory is not offered: no lens-memory command could be confirmed for this model.'}
      </p>
    </ControlBlock>
  )
}

/* ------------------------------------------------------------------ */
/* Lamp mode (dual-lamp models)                                         */
/* ------------------------------------------------------------------ */

function LampMode({
  gate,
  blocked,
  command,
  onSend,
}: {
  gate: Gate
  blocked: (capability: string) => string | null
  command: (capability?: string) => TrackedCommand | undefined
  onSend: Send
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {(['lamp.select', 'lamp.power'] as const).map((name) => {
        const cap = gate.capability(name)
        if (!cap) return null
        const reason = gate.reason(name)
        const title = name === 'lamp.select' ? 'Lamp select' : 'Lamp power'
        return (
          <ControlBlock key={name} icon={LampIcon} title={title} unverified={gate.unverified(name)} footer={<CommandStrip command={command(name)} />}>
            {reason ? (
              <UnavailableNote reason={reason} />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  {cap.params.map((param) => {
                    const label = cap.param_labels?.[param] ?? param
                    return (
                      <button
                        key={param}
                        className="btn-default btn-sm justify-start"
                        disabled={blocked(name) !== null}
                        title={blocked(name) ?? undefined}
                        onClick={() =>
                          onSend(name, `${title}: ${label}`, { mode: param }, cap.disruptive
                            ? { title: `${title}: ${label}?`, body: 'The projector changes how it drives its lamps. The image may change brightness.' }
                            : undefined)
                        }
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
                <p className="text-2xs text-slate-500">The projector does not report this setting back.</p>
              </>
            )}
          </ControlBlock>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Equipment status                                                     */
/* ------------------------------------------------------------------ */

function telemetryRow(field: Telemetry<unknown> | undefined, fallbackNote: string) {
  if (!field) return { text: '—', muted: true, title: fallbackNote }
  return renderTelemetry(field, (value) => String(value))
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm">{children}</dd>
    </div>
  )
}

const SUBSYSTEMS: Array<{ key: string; label: string; icon: LucideIcon; equipment?: 'temperature' | 'fan' | 'filter_usage' }> = [
  { key: 'temperature', label: 'Temperature', icon: TemperatureIcon, equipment: 'temperature' },
  { key: 'fan', label: 'Fans', icon: FanIcon, equipment: 'fan' },
  { key: 'lamp', label: 'Lamp', icon: LampIcon },
  { key: 'filter', label: 'Filter', icon: FilterIcon, equipment: 'filter_usage' },
  { key: 'cover', label: 'Cover', icon: CoverIcon },
  { key: 'other', label: 'Other', icon: FaultIcon },
]

const CONDITION_LABEL: Record<string, string> = { ok: 'OK', warning: 'Warning', error: 'Fault' }

function severityTone(severity: string | undefined): Tone {
  if (severity === 'error') return 'fault'
  if (severity === 'warning') return 'warn'
  if (severity === 'ok') return 'ok'
  return 'unknown'
}

function ConditionChip({ severity }: { severity: string | undefined }) {
  return (
    <Chip tone={severityTone(severity)}>
      {severity ? (CONDITION_LABEL[severity] ?? severity) : 'not reported'}
    </Chip>
  )
}

/** Sensor readings, when the driver reads them (Panasonic QTM). */
function temperatureReading(field: Telemetry<unknown> | undefined): TemperatureReading | null {
  if (field?.availability !== 'available' || !field.value || typeof field.value !== 'object') return null
  const value = field.value as TemperatureReading
  return Array.isArray(value.sensors) && value.sensors.length > 0 ? value : null
}

function fanReading(field: Telemetry<unknown> | undefined): FanReading | null {
  if (field?.availability !== 'available' || !field.value || typeof field.value !== 'object') return null
  const value = field.value as FanReading
  return typeof value.condition === 'string' ? value : null
}

function degrees(sensor: TemperatureSensor): { text: string; muted: boolean; title?: string } {
  if (sensor.celsius == null) {
    return { text: `not understood: ${sensor.raw}`, muted: true, title: 'The projector sent a reply this app could not read as degrees.' }
  }
  const fahrenheit = sensor.fahrenheit == null ? '' : ` · ${sensor.fahrenheit} °F`
  return { text: `${sensor.celsius} °C${fahrenheit}`, muted: false }
}

function EquipmentStatus({ projector, driverName }: { projector: Projector; driverName: string }) {
  const { state } = projector
  const equipment = state.equipment ?? {}
  const notRead = 'Not read yet: these are read every few minutes. Press Check now to read them at once.'
  const serial = telemetryRow(equipment.serial_number, notRead)
  const firmware = telemetryRow(equipment.firmware, notRead)
  const reportedModel = equipment.model?.availability === 'available' ? String(equipment.model.value) : null
  const lamps = lampReadings(projector)
  const lampStatus = renderTelemetry(state.lamp_status, (value) => value.state ?? `raw: ${value.raw}`)
  const erst = state.error_status?.availability === 'available' ? (state.error_status.value ?? {}) : null
  const temperatures = temperatureReading(equipment.temperature)
  const fan = fanReading(equipment.fan)

  return (
    <>
      <Panel icon={MaintenanceIcon} title="Equipment" bodyClassName="px-4 py-2">
        <dl className="divide-y divide-white/5">
          <Row label="Model">
            <span className="text-slate-100">{projector.manufacturer} {projector.model}</span>
            {reportedModel && reportedModel !== projector.model && (
              <span className="block text-2xs text-slate-500">reports “{reportedModel}”</span>
            )}
          </Row>
          <Row label="Serial number"><Value {...serial} /></Row>
          <Row label="Firmware"><Value {...firmware} /></Row>
          <Row label="Driver"><span className="text-slate-300">{driverName}</span></Row>
          <Row label="Address"><span className="tnum text-slate-300">{projector.host}:{projector.port}</span></Row>
          {projector.location && <Row label="Location"><span className="text-slate-300">{projector.location}</span></Row>}
          <Row label="Runtime">
            <Value text="n/a" muted title="This driver does not read total projector runtime. Lamp runtime is shown below." />
          </Row>
        </dl>
      </Panel>

      <Panel
        icon={LampIcon}
        title="Lamps"
        description={`Warn at ${projector.lamp_warn_hours.toLocaleString()} h · replace at ${projector.lamp_critical_hours.toLocaleString()} h`}
      >
        <div className="space-y-3">
          {lamps.length === 0 ? (
            <Value
              text={state.lamp_hours?.availability === 'unsupported' ? 'n/a' : '—'}
              muted
              title={state.lamp_hours?.note ?? 'Lamp hours have not been read yet'}
            />
          ) : (
            lamps.map((lamp) => (
              <LampMeter
                key={lamp.index}
                label={lamps.length > 1 ? `Lamp ${lamp.index}` : 'Lamp'}
                hours={lamp.hours}
                warn={projector.lamp_warn_hours}
                critical={projector.lamp_critical_hours}
                note={lamp.error ?? (lamp.unparsed ? `Unparsed reply: ${lamp.raw}` : undefined)}
              />
            ))
          )}
          {lamps.some((lamp) => lamp.unparsed || lamp.error) && (
            <p className="text-xs text-yellow-300">
              Some lamp replies were not understood; hover a lamp for the raw value.
            </p>
          )}
          <div className="flex items-baseline justify-between gap-3 border-t border-white/5 pt-2">
            <span className="text-xs text-slate-500">Lamp control status</span>
            <Value {...lampStatus} className="text-sm" />
          </div>
        </div>
      </Panel>

      <Panel
        icon={TemperatureIcon}
        title="Condition"
        description={
          temperatures && erst
            ? 'Temperatures from the projector’s sensors. OK, warning or fault from the projector’s own checks (PJLink).'
            : temperatures
              ? 'Temperatures from the projector’s sensors.'
              : erst
                ? 'Reported by the projector (PJLink error status).'
                : undefined
        }
        bodyClassName="px-4 py-2"
      >
        <ul className="divide-y divide-white/5">
          {SUBSYSTEMS.filter((sub) => erst || sub.equipment).map((sub) => {
            const field = sub.equipment ? equipment[sub.equipment] : undefined
            const fallback = telemetryRow(field, notRead)
            const showNote = sub.key === 'temperature' ? !temperatures : sub.key === 'fan' && Boolean(fan)
            return (
              <li key={sub.key} className="py-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-slate-300">
                    <sub.icon size={14} className={erst ? TONE_TEXT[severityTone(erst[sub.key])] : 'text-slate-500'} aria-hidden /> {sub.label}
                  </span>
                  {erst ? (
                    <ConditionChip severity={erst[sub.key]} />
                  ) : sub.key === 'temperature' && temperatures ? null : (
                    <Value {...fallback} className="text-sm" />
                  )}
                </div>
                {sub.key === 'temperature' && temperatures && (
                  <dl className="mt-1 space-y-0.5 pl-6">
                    {temperatures.sensors.map((sensor) => (
                      <div key={sensor.key} className="flex items-baseline justify-between gap-3">
                        <dt className="text-xs text-slate-500">{sensor.label}</dt>
                        <dd className="text-sm"><Value {...degrees(sensor)} /></dd>
                      </div>
                    ))}
                  </dl>
                )}
                {showNote && field?.note && (
                  <p className="mt-0.5 pl-6 text-2xs text-slate-500">{field.note}</p>
                )}
              </li>
            )
          })}
        </ul>
        {!erst && (
          <UnavailableNote
            className="my-2"
            reason={
              state.error_status?.note ??
              'This projector is not reporting fan, filter or cover checks. Projectors that answer PJLink report them: turn PJLink on in the projector’s network menu and fill in the PJLink password under Edit.'
            }
          />
        )}
      </Panel>

      <Panel icon={LiveIcon} title="Communication" bodyClassName="px-4 py-2">
        <dl className="divide-y divide-white/5">
          <Row label="Link"><LinkBadge projector={projector} /></Row>
          <Row label="Last reply">
            <span className="tnum text-slate-300" title={formatDateTime(state.last_seen_at)}>{relativeTime(state.last_seen_at)}</span>
          </Row>
          <Row label="Failed polls in a row">
            <span className={classNames('tnum', state.consecutive_failures > 0 ? 'text-yellow-300' : 'text-slate-400')}>
              {state.consecutive_failures}
            </span>
          </Row>
          <Row label="Commands queued"><span className="tnum text-slate-400">{state.queue_depth}</span></Row>
          {state.last_error && (
            <div className="py-1.5">
              <dt className="text-xs text-slate-500">Last error</dt>
              <dd className="mt-0.5 break-words font-mono text-2xs text-slate-400">{state.last_error}</dd>
            </div>
          )}
          {projector.allow_unverified_commands && (
            <div className="py-2">
              <Chip tone="warn" title="Commands documented only for sibling models are enabled on this device.">
                Unverified commands enabled
              </Chip>
            </div>
          )}
        </dl>
      </Panel>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Command log                                                          */
/* ------------------------------------------------------------------ */

function CommandHistory({ rows }: { rows: CommandLogRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No commands recorded yet.</p>
  }
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="table text-xs">
        <thead>
          <tr>
            <th className="pl-4">Time</th>
            <th>Command</th>
            <th>Outcome</th>
            <th>Sent</th>
            <th>Reply</th>
            <th>ms</th>
            <th className="pr-4">By</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="tnum whitespace-nowrap pl-4 text-slate-400">{formatDateTime(row.created_at)}</td>
              <td className="whitespace-nowrap text-slate-200">
                {row.capability}
                {Object.keys(row.params ?? {}).length > 0 && (
                  <span className="text-slate-500"> {Object.values(row.params).map(String).join(' ')}</span>
                )}
              </td>
              <td>
                {row.outcome === 'pending' ? (
                  <Chip tone="busy">Pending</Chip>
                ) : (
                  <Chip tone={outcomeTone(row.outcome)} title={row.error ?? OUTCOME_HELP[row.outcome]}>
                    {OUTCOME_LABEL[row.outcome]}
                  </Chip>
                )}
              </td>
              <td className="font-mono text-slate-500">{row.raw_request ?? '—'}</td>
              <td className="font-mono text-slate-500">{row.raw_response ?? '—'}</td>
              <td className="tnum text-slate-500">{row.latency_ms ?? '—'}</td>
              <td className="whitespace-nowrap pr-4 text-slate-500">{row.username ?? row.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

