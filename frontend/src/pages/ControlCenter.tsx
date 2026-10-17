import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, type Session } from '@/api/client'
import type { DriverInfo, Group, GroupCommandResult, Projector, Scene } from '@/api/types'
import { useFleet, useTicker } from '@/hooks/useLiveData'
import {
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Panel,
  Spinner,
  ToastStack,
  useToasts,
  PageHeader,
} from '@/components/ui'
import { connectionTone } from '@/components/ProjectorCard'
import { PowerGlyph, ProjectorMark, ShutterGlyph, inputIcon } from '@/components/graphics'
import {
  CheckIcon,
  ControlIcon,
  GroupsIcon,
  HdmiIcon,
  LiveIcon,
  LogsIcon,
  OfflineIcon,
  PowerIcon,
  SceneIcon,
  ShutterIcon,
} from '@/components/icons'
import {
  OUTCOME_HELP,
  OUTCOME_LABEL,
  classNames,
  formatClock,
  inputsFromCapabilities,
  outcomeTone,
  relativeTime,
} from '@/lib/format'

type BulkAction = {
  label: string
  capability: string
  params?: Record<string, unknown>
  danger?: boolean
  confirmBody: string
}

const ACTIONS: BulkAction[] = [
  {
    label: 'Power on',
    capability: 'power.set',
    params: { state: 'on' },
    confirmBody:
      'Each projector will strike its lamp and warm up. Commands are dispatched together, but each unit warms at its own pace.',
  },
  {
    label: 'Power off',
    capability: 'power.set',
    params: { state: 'off' },
    danger: true,
    confirmBody:
      'Each projector enters its cooling cycle and cannot be restarted until cooling completes.',
  },
  {
    label: 'Open shutters',
    capability: 'shutter.set',
    params: { state: 'open' },
    confirmBody: 'Images will be shown on the selected projectors.',
  },
  {
    label: 'Close shutters',
    capability: 'shutter.set',
    params: { state: 'closed' },
    danger: true,
    confirmBody: 'Images will be blanked. Lamps stay on.',
  },
]

export default function ControlCenter({
  session,
  fullscreen = false,
}: {
  session: Session
  fullscreen?: boolean
}) {
  const { projectors, loading, error, refresh, wsStatus } = useFleet(10000)
  const [groups, setGroups] = useState<Group[]>([])
  const [scenes, setScenes] = useState<Scene[]>([])
  const [drivers, setDrivers] = useState<DriverInfo[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [lastResult, setLastResult] = useState<GroupCommandResult | null>(null)
  const [pending, setPending] = useState<{ action: BulkAction } | null>(null)
  const [scenePending, setScenePending] = useState<Scene | null>(null)
  const [busy, setBusy] = useState(false)
  const { toasts, push, dismiss } = useToasts()
  useTicker(5000)

  const canControl = session.role !== 'viewer'

  useEffect(() => {
    void Promise.all([api.listGroups(), api.listScenes(), api.drivers()])
      .then(([g, s, d]) => {
        setGroups(g)
        setScenes(s)
        setDrivers(d.drivers)
      })
      .catch(() => undefined)
  }, [])

  const selectedList = useMemo(
    () => projectors.filter((projector) => selected.has(projector.id)),
    [projectors, selected],
  )

  // Inputs offered = union across the drivers of the selected projectors
  // (all drivers when nothing is selected). A projector lacking a given
  // input reports it as unsupported in the per-device results.
  const inputs = useMemo(() => {
    const driverIds = new Set(
      (selectedList.length ? selectedList : projectors).map((p) => p.driver),
    )
    const merged = new Map<string, string>()
    for (const driver of drivers) {
      if (!driverIds.has(driver.driver_id)) continue
      for (const [code, label] of inputsFromCapabilities(driver.capabilities)) {
        if (!merged.has(code)) merged.set(code, label)
      }
    }
    return [...merged.entries()]
  }, [drivers, projectors, selectedList])

  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const selectAll = () => setSelected(new Set(projectors.map((p) => p.id)))
  const selectNone = () => setSelected(new Set())
  const selectGroup = (group: Group) => setSelected(new Set(group.projector_ids))

  const dispatch = async (action: BulkAction) => {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const result = await api.selectionCommand(
        [...selected],
        action.capability,
        action.params ?? {},
      )
      setLastResult(result)
      const { succeeded, failed, total } = result.summary
      push(
        failed === 0 ? 'ok' : succeeded === 0 ? 'fault' : 'warn',
        `${action.label}: ${succeeded}/${total} succeeded`,
        failed > 0
          ? `${failed} projector(s) did not accept the command. See the results panel.`
          : undefined,
      )
      void refresh()
    } catch (err) {
      push(
        'fault',
        `${action.label} failed`,
        err instanceof ApiError ? err.message : 'Could not dispatch',
      )
    } finally {
      setBusy(false)
    }
  }

  const runScene = async (scene: Scene) => {
    setBusy(true)
    try {
      const result = await api.activateScene(scene.id)
      push(
        result.failed === 0 ? 'ok' : 'warn',
        `Scene “${result.name}”: ${result.total - result.failed}/${result.total} succeeded`,
      )
      void refresh()
    } catch (err) {
      push('fault', 'Scene failed', err instanceof ApiError ? err.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={classNames('space-y-4', fullscreen && 'min-h-screen bg-panel-950 p-4')}>
      <PageHeader
        icon={ControlIcon}
        title="Control Center"
        subtitle={
          <>
            {wsStatus === 'open' ? (
              <LiveIcon size={13} className="text-emerald-400" aria-hidden />
            ) : (
              <OfflineIcon size={13} className="text-amber-400" aria-hidden />
            )}
            {selected.size} of {projectors.length} selected
          </>
        }
        actions={
          fullscreen ? (
            <Link to="/control" className="btn-default">
              Exit full screen
            </Link>
          ) : (
            <Link to="/control/fullscreen" className="btn-default">
              Full-screen view
            </Link>
          )
        }
      />

      {error && <ErrorBanner message={error} />}

      {/* Selection */}
      <Panel icon={GroupsIcon} title="Selection">
        <div className="flex flex-wrap gap-2">
          <button className="btn-default" onClick={selectAll}>
            All projectors
          </button>
          <button className="btn-default" onClick={selectNone}>
            Clear
          </button>
          {groups.map((group) => (
            <button
              key={group.id}
              className="btn-default"
              onClick={() => selectGroup(group)}
              style={{ borderLeft: `3px solid ${group.color}` }}
            >
              {group.name}
              <span className="text-xs text-slate-500">
                ({group.projector_ids.length})
              </span>
            </button>
          ))}
          {groups.length === 0 && (
            <Link to="/groups" className="btn-ghost text-xs">
              Create a group →
            </Link>
          )}
        </div>
      </Panel>

      {/* Projector grid */}
      {loading ? (
        <Panel>
          <Spinner />
        </Panel>
      ) : projectors.length === 0 ? (
        <Panel>
          <EmptyState title="No projectors registered">
            Add projectors before using the control center.
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {projectors.map((projector) => (
            <SelectTile
              key={projector.id}
              projector={projector}
              selected={selected.has(projector.id)}
              onToggle={() => toggle(projector.id)}
            />
          ))}
        </div>
      )}

      {/* Bulk actions */}
      <Panel
        icon={ControlIcon}
        title="Group actions"
        description="Commands are dispatched concurrently. Each projector acts at its own pace — this is not frame-accurate synchronisation."
      >
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {ACTIONS.map((action) => (
              <button
                key={action.label}
                className={action.danger ? 'btn-danger btn-lg' : 'btn-primary btn-lg'}
                disabled={!canControl || busy || selected.size === 0}
                onClick={() => setPending({ action })}
              >
                {action.capability === 'power.set' ? (
                  <PowerIcon size={18} aria-hidden />
                ) : (
                  <ShutterIcon size={18} aria-hidden />
                )}
                {action.label}
              </button>
            ))}
          </div>

          <div>
            <p className="label flex items-center gap-1.5">
              <HdmiIcon size={12} aria-hidden /> Change input on selection
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {inputs.map(([code, label]) => (
                <button
                  key={code}
                  className="btn-default"
                  disabled={!canControl || busy || selected.size === 0}
                  onClick={() =>
                    setPending({
                      action: {
                        label: `Input ${label}`,
                        capability: 'input.set',
                        params: { input: code },
                        confirmBody: `The selected projectors will switch to ${label}. Any projector without that input fitted will report it as unavailable.`,
                      },
                    })
                  }
                >
                  {(() => {
                    const Icon = inputIcon(code)
                    return <Icon size={15} className="text-slate-400" aria-hidden />
                  })()}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {scenes.length > 0 && (
            <div>
              <p className="label flex items-center gap-1.5">
                <SceneIcon size={12} aria-hidden /> Scenes
              </p>
              <div className="flex flex-wrap gap-2">
                {scenes.map((scene) => (
                  <button
                    key={scene.id}
                    className="btn-default"
                    disabled={!canControl || busy}
                    onClick={() => setScenePending(scene)}
                    title={scene.description}
                  >
                    <SceneIcon size={14} aria-hidden /> {scene.name}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                A blackout scene closes projector shutters. It is an operational
                convenience, not a certified emergency safety mechanism.
              </p>
            </div>
          )}
        </div>
      </Panel>

      {/* Per-device results */}
      {lastResult && (
        <Panel
          icon={LogsIcon}
          title="Last dispatch results"
          description={`${lastResult.capability} · dispatched at ${formatClock(lastResult.dispatched_at)}`}
          action={
            <Chip
              tone={
                lastResult.summary.failed === 0
                  ? 'ok'
                  : lastResult.summary.succeeded === 0
                    ? 'fault'
                    : 'warn'
              }
            >
              {lastResult.summary.succeeded}/{lastResult.summary.total} succeeded
            </Chip>
          }
        >
          <ul className="divide-y divide-white/5">
            {lastResult.results.map((result) => (
              <li
                key={result.projector_id ?? result.name}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-200">
                    {result.name ?? `Projector ${result.projector_id}`}
                  </p>
                  {result.error && (
                    <p className="break-words text-xs text-slate-500">{result.error}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {result.latency_ms != null && (
                    <span className="tnum text-xs text-slate-500">
                      {result.latency_ms} ms
                    </span>
                  )}
                  <Chip
                    tone={outcomeTone(result.outcome)}
                    title={OUTCOME_HELP[result.outcome]}
                  >
                    {OUTCOME_LABEL[result.outcome]}
                  </Chip>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={`${pending?.action.label} on ${selected.size} projector(s)?`}
        body={
          <>
            <p>{pending?.action.confirmBody}</p>
            <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-slate-400">
              {selectedList.map((projector) => (
                <li key={projector.id}>• {projector.name}</li>
              ))}
            </ul>
          </>
        }
        confirmLabel={pending?.action.label}
        danger={pending?.action.danger}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const action = pending?.action
          setPending(null)
          if (action) void dispatch(action)
        }}
      />
      <ConfirmDialog
        open={scenePending !== null}
        title={`Activate scene “${scenePending?.name}”?`}
        body={
          <>
            <p>{scenePending?.description || 'Runs every action in the scene now.'}</p>
            <p className="mt-2 text-xs text-slate-400">
              {scenePending?.actions.length} action(s). Each projector reports its own
              result.
            </p>
          </>
        }
        confirmLabel="Activate"
        onCancel={() => setScenePending(null)}
        onConfirm={() => {
          const scene = scenePending
          setScenePending(null)
          if (scene) void runScene(scene)
        }}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}

function SelectTile({
  projector,
  selected,
  onToggle,
}: {
  projector: Projector
  selected: boolean
  onToggle: () => void
}) {
  const live = projector.state.online && !projector.state.stale
  return (
    <button
      onClick={onToggle}
      aria-pressed={selected}
      className={classNames(
        'panel w-full px-3 py-2.5 text-left transition-colors',
        selected ? 'ring-2 ring-sky-500' : 'hover:bg-panel-850',
      )}
    >
      <div className="flex items-center gap-3">
        <ProjectorMark
          tone={connectionTone(projector)}
          size="sm"
          pulse={projector.state.power === 'warming' || projector.state.power === 'cooling'}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-100">{projector.name}</span>
          <span className="block text-[11px] text-slate-500">{relativeTime(projector.state.last_seen_at)}</span>
        </span>
        <span
          className={classNames(
            'inline-flex h-5 w-5 items-center justify-center rounded-full border',
            selected ? 'border-sky-400 bg-sky-500/20 text-sky-300' : 'border-slate-700 text-transparent',
          )}
          aria-hidden
        >
          <CheckIcon size={12} />
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <PowerGlyph state={projector.state.power} live={live} size="sm" />
        <ShutterGlyph state={projector.state.shutter} live={live} size="sm" />
      </div>
    </button>
  )
}
