import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, type Session } from '@/api/client'
import type { Projector, Scene } from '@/api/types'
import { useFleetContext, useOps, latestCommand, phaseIsActive, type TrackedCommand } from '@/live/LiveProvider'
import { useDrivers, useGroups } from '@/live/useCatalog'
import { ConfirmDialog, EmptyState, ErrorBanner, PageHeader, Panel, Spinner, StatusDot, ToastStack } from '@/components/ui'
import { CommandStrip } from '@/components/ProjectorCard'
import { LinkBadge, PowerBadge, ShutterBadge } from '@/components/status'
import { inputIcon } from '@/components/graphics'
import { TONE_EDGE } from '@/components/tone'
import {
  CheckIcon,
  ControlIcon,
  FullscreenIcon,
  GroupsIcon,
  HdmiIcon,
  PowerIcon,
  SceneIcon,
  ShutterIcon,
} from '@/components/icons'
import { useBulkResults } from '@/components/fleet/BulkResults'
import {
  inputRequest,
  powerRequest,
  shutterRequest,
  useProjectorCommand,
  type CommandRequest,
} from '@/components/fleet/useProjectorCommand'
import { classNames, inputsFromCapabilities } from '@/lib/format'
import { deviceTone, isLive } from '@/lib/status'

/**
 * Show control: pick projectors (or a group), then send one command to all
 * of them. Every command asks first, and every projector's result is shown
 * separately until its own read-back confirms it.
 */
export default function ControlCenter({ session, fullscreen = false }: { session: Session; fullscreen?: boolean }) {
  const { projectors, loading, error, wsStatus } = useFleetContext()
  const { commands, notify, toasts, dismissToast } = useOps()
  const { groups } = useGroups()
  const drivers = useDrivers()
  const { ask, dialog } = useProjectorCommand()
  const bulkResults = useBulkResults()
  const [scenes, setScenes] = useState<Scene[]>([])
  const [scenePending, setScenePending] = useState<Scene | null>(null)
  const [sceneBusy, setSceneBusy] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const canControl = session.role !== 'viewer'

  useEffect(() => {
    api.listScenes().then(setScenes).catch(() => undefined)
  }, [])

  const ordered = useMemo(() => [...projectors].sort((a, b) => a.name.localeCompare(b.name)), [projectors])
  const selectedList = useMemo(() => ordered.filter((p) => selected.has(p.id)), [ordered, selected])
  const selectedOffline = selectedList.filter((p) => !isLive(p)).length

  // Inputs offered = union across the drivers of the selected projectors. A
  // projector lacking a given input reports it as unavailable in its result.
  const inputs = useMemo(() => {
    const driverIds = new Set(selectedList.map((p) => p.driver))
    const merged = new Map<string, string>()
    for (const driver of drivers) {
      if (!driverIds.has(driver.driver_id)) continue
      for (const [code, label] of inputsFromCapabilities(driver.capabilities)) {
        if (!merged.has(code)) merged.set(code, label)
      }
    }
    return [...merged.entries()]
  }, [drivers, selectedList])

  const busy = selectedList.some((p) => {
    const c = latestCommand(commands, p.id)
    return c !== undefined && phaseIsActive(c.phase)
  })
  const blocked = !canControl ? 'Your role is view-only' : selected.size === 0 ? 'Select projectors first' : busy ? 'A command is still in progress on the selection' : undefined

  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const send = (request: CommandRequest) => ask(bulkResults.track(request))

  const runScene = async (scene: Scene) => {
    setSceneBusy(true)
    try {
      const result = await api.activateScene(scene.id)
      if (result.error || result.total == null) {
        notify('fault', `Scene “${scene.name}” failed`, result.error)
        return
      }
      const accepted = result.total - result.failed
      notify(
        result.failed === 0 ? 'ok' : accepted === 0 ? 'fault' : 'warn',
        `Scene “${result.name ?? scene.name}”: ${accepted} of ${result.total} accepted`,
        'Each projector’s card shows its confirmed state once it reads back.',
      )
    } catch (err) {
      notify('fault', 'Scene failed', err instanceof ApiError ? err.message : undefined)
    } finally {
      setSceneBusy(false)
    }
  }

  const live = wsStatus === 'open'

  return (
    <div className={classNames('space-y-4', fullscreen && 'min-h-screen bg-panel-950 p-3 sm:p-4')}>
      <PageHeader
        icon={ControlIcon}
        title="Control Center"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <StatusDot tone={live ? 'ok' : 'warn'} />
            {live ? 'Live' : 'Polling'} · <span className="tnum">{selected.size}</span> of{' '}
            <span className="tnum">{projectors.length}</span> selected
          </span>
        }
        actions={
          fullscreen ? (
            <Link to="/control" className="btn-default">
              Exit full screen
            </Link>
          ) : (
            <Link to="/control/fullscreen" className="btn-default">
              <FullscreenIcon size={14} aria-hidden /> Full screen
            </Link>
          )
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-3">
          {/* Selection shortcuts */}
          <div className="flex flex-wrap items-center gap-1.5">
            <GroupsIcon size={14} className="mr-1 text-slate-500" aria-hidden />
            <button className="btn-default btn-sm" onClick={() => setSelected(new Set(projectors.map((p) => p.id)))}>
              All
            </button>
            <button
              className="btn-default btn-sm"
              onClick={() => setSelected(new Set(projectors.filter(isLive).map((p) => p.id)))}
            >
              Responding
            </button>
            {groups.map((group) => (
              <button
                key={group.id}
                className="btn-default btn-sm"
                onClick={() => setSelected(new Set(group.projector_ids))}
                style={{ boxShadow: `inset 3px 0 0 ${group.color}` }}
              >
                {group.name}
                <span className="tnum text-2xs text-slate-500">{group.projector_ids.length}</span>
              </button>
            ))}
            <button className="btn-ghost btn-sm" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>

          {loading ? (
            <Panel>
              <Spinner />
            </Panel>
          ) : projectors.length === 0 ? (
            <Panel>
              <EmptyState title="No projectors registered">
                <Link to="/projectors?add=1" className="text-sky-300 hover:underline">
                  Add a projector
                </Link>{' '}
                to control it from here.
              </EmptyState>
            </Panel>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {ordered.map((projector) => (
                <SelectTile
                  key={projector.id}
                  projector={projector}
                  command={latestCommand(commands, projector.id)}
                  selected={selected.has(projector.id)}
                  onToggle={() => toggle(projector.id)}
                />
              ))}
            </div>
          )}

          {bulkResults.panel}

          {/* Phones and tablets: the actions follow the thumb. Inputs and
              scenes stay in the panel further down. */}
          {selected.size > 0 && (
            <div className="sticky bottom-20 z-30 xl:hidden">
              <div className="panel flex flex-wrap items-center gap-1.5 border-sky-500/40 bg-panel-850 px-3 py-2.5 shadow-overlay">
                <p className="w-full text-xs text-slate-300">
                  <span className="tnum font-medium text-slate-50">{selected.size}</span> selected
                  {selectedOffline > 0 && <span className="ml-2 text-yellow-300">{selectedOffline} not responding</span>}
                </p>
                <button className="btn-primary btn-sm flex-1" disabled={Boolean(blocked)} onClick={() => send(powerRequest(selectedList, 'on'))}>
                  <PowerIcon size={13} aria-hidden /> On
                </button>
                <button className="btn-danger-outline btn-sm flex-1" disabled={Boolean(blocked)} onClick={() => send(powerRequest(selectedList, 'off'))}>
                  <PowerIcon size={13} aria-hidden /> Off
                </button>
                <button className="btn-default btn-sm flex-1" disabled={Boolean(blocked)} onClick={() => send(shutterRequest(selectedList, 'open'))}>
                  <ShutterIcon size={13} aria-hidden /> Open
                </button>
                <button className="btn-default btn-sm flex-1" disabled={Boolean(blocked)} onClick={() => send(shutterRequest(selectedList, 'closed'))}>
                  <ShutterIcon size={13} aria-hidden /> Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <aside className="space-y-3 xl:sticky xl:top-16 xl:self-start">
          <Panel
            icon={ControlIcon}
            title="Send to selection"
            description={
              selected.size === 0
                ? 'Pick projectors on the left or a group above.'
                : `${selected.size} projector${selected.size === 1 ? '' : 's'}${selectedOffline ? `, ${selectedOffline} not responding` : ''}. Each acts at its own pace; this is not frame-accurate sync.`
            }
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="btn-primary btn-lg whitespace-nowrap text-sm"
                  disabled={Boolean(blocked)}
                  title={blocked}
                  onClick={() => send(powerRequest(selectedList, 'on'))}
                >
                  <PowerIcon size={17} aria-hidden /> Power on
                </button>
                <button
                  className="btn-danger-outline btn-lg whitespace-nowrap text-sm"
                  disabled={Boolean(blocked)}
                  title={blocked}
                  onClick={() => send(powerRequest(selectedList, 'off'))}
                >
                  <PowerIcon size={17} aria-hidden /> Power off
                </button>
                <button
                  className="btn-default btn-lg whitespace-nowrap text-sm"
                  disabled={Boolean(blocked)}
                  title={blocked}
                  onClick={() => send(shutterRequest(selectedList, 'open'))}
                >
                  <ShutterIcon size={17} aria-hidden /> Open shutters
                </button>
                <button
                  className="btn-default btn-lg whitespace-nowrap text-sm"
                  disabled={Boolean(blocked)}
                  title={blocked}
                  onClick={() => send(shutterRequest(selectedList, 'closed'))}
                >
                  <ShutterIcon size={17} aria-hidden /> Close shutters
                </button>
              </div>

              <div>
                <p className="label flex items-center gap-1.5">
                  <HdmiIcon size={12} aria-hidden /> Input
                </p>
                {inputs.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    {selected.size === 0 ? 'Inputs appear once projectors are selected.' : 'No switchable inputs on the selection.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {inputs.map(([code, label]) => {
                      const Icon = inputIcon(code)
                      return (
                        <button
                          key={code}
                          className="btn-default btn-sm"
                          disabled={Boolean(blocked)}
                          title={blocked}
                          onClick={() => send(inputRequest(selectedList, code, label))}
                        >
                          <Icon size={13} className="text-slate-400" aria-hidden />
                          <span className="truncate">{label}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </Panel>

          {scenes.length > 0 && (
            <Panel icon={SceneIcon} title="Scenes" description="Run a saved set of actions on their own targets.">
              <div className="flex flex-wrap gap-1.5">
                {scenes.map((scene) => (
                  <button
                    key={scene.id}
                    className="btn-default btn-sm"
                    disabled={!canControl || sceneBusy}
                    onClick={() => setScenePending(scene)}
                    title={scene.description}
                  >
                    <SceneIcon size={13} aria-hidden /> {scene.name}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                A blackout scene closes projector shutters. It is an operational convenience, not a certified
                emergency safety mechanism.
              </p>
            </Panel>
          )}
        </aside>
      </div>

      {dialog}
      <ConfirmDialog
        open={scenePending !== null}
        title={`Activate scene “${scenePending?.name}”?`}
        body={
          <>
            <p>{scenePending?.description || 'Runs every action in the scene now.'}</p>
            <p className="mt-2 text-xs text-slate-400">
              {scenePending?.actions.length} action(s). Each projector reports its own result.
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
      {/* Full-screen mode has no app shell, so it shows its own notifications. */}
      {fullscreen && <ToastStack toasts={toasts} onDismiss={dismissToast} />}
    </div>
  )
}

function SelectTile({
  projector,
  command,
  selected,
  onToggle,
}: {
  projector: Projector
  command?: TrackedCommand
  selected: boolean
  onToggle: () => void
}) {
  const tone = deviceTone(projector)
  return (
    <div
      className={classNames(
        'panel relative overflow-hidden transition-colors duration-200',
        'before:absolute before:inset-y-0 before:left-0 before:w-[3px]',
        TONE_EDGE[tone],
        selected ? 'border-sky-500/60 bg-sky-500/[0.06] ring-1 ring-sky-500/40' : 'hover:border-white/10',
      )}
    >
      <button
        onClick={onToggle}
        aria-pressed={selected}
        aria-label={`${selected ? 'Deselect' : 'Select'} ${projector.name}`}
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400"
      >
        <span
          className={classNames(
            'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
            selected ? 'border-sky-400 bg-sky-500 text-white' : 'border-slate-600 text-transparent',
          )}
          aria-hidden
        >
          <CheckIcon size={12} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-100">{projector.name}</span>
          <span className="tnum block truncate text-2xs text-slate-500">{projector.host}</span>
        </span>
      </button>
      <div className="flex flex-wrap gap-1.5 px-3.5 pb-2.5">
        <LinkBadge projector={projector} compact />
        <PowerBadge projector={projector} />
        <ShutterBadge projector={projector} />
      </div>
      <CommandStrip command={command} className="mx-3.5 mb-2.5" />
    </div>
  )
}
