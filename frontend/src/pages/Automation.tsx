import { useEffect, useState } from 'react'
import { ApiError, api, type Session } from '@/api/client'
import type { Automation as AutomationType, AutomationRun, Group, Scene } from '@/api/types'
import {
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Panel,
  Spinner,
  ToastStack,
  useToasts,
} from '@/components/ui'
import { formatDateTime } from '@/lib/format'
import { AutomationIcon, SceneIcon } from '@/components/icons'

/** Templates matching the startup/shutdown sequences in the project brief.
 *  Each is a real, runnable step list, not an illustration. */
function templates(groupId: number | null) {
  const target = groupId
    ? { type: 'group' as const, id: groupId }
    : { type: 'all' as const }
  return [
    {
      name: 'House Projection Mapping — Startup',
      description: 'Checks, power on, wait for operational state, select input, open shutters.',
      trigger_type: 'manual' as const,
      abort_on_failure: true,
      steps: [
        { type: 'check_online', label: 'Check projector connectivity', target },
        { type: 'check_faults', label: 'Verify no critical faults', target, block_on: ['error'] },
        {
          type: 'command', label: 'Power on', target,
          capability: 'power.set', params: { state: 'on' },
        },
        {
          type: 'wait_state', label: 'Wait for operational state', target,
          capability: 'power.get', expect: 'on', timeout: 180, interval: 5,
        },
        {
          type: 'command', label: 'Select input', target,
          capability: 'input.set', params: { input: 'HD1' },
        },
        {
          type: 'command', label: 'Open shutters', target,
          capability: 'shutter.set', params: { state: 'open' },
        },
        { type: 'notify', label: 'Record completion', message: 'Startup sequence complete' },
      ],
    },
    {
      name: 'House Projection Mapping — Shutdown',
      description: 'Close shutters, power off, monitor the cooling transition.',
      trigger_type: 'manual' as const,
      abort_on_failure: false,
      steps: [
        {
          type: 'command', label: 'Close shutters', target,
          capability: 'shutter.set', params: { state: 'closed' },
        },
        { type: 'delay', label: 'Settle', seconds: 2 },
        {
          type: 'command', label: 'Power off', target,
          capability: 'power.set', params: { state: 'off' },
        },
        {
          type: 'wait_state', label: 'Wait for standby (cooling complete)', target,
          capability: 'power.get', expect: 'off', timeout: 300, interval: 10,
        },
        {
          type: 'notify', label: 'Record completion',
          message: 'Shutdown complete. Keep enclosure ventilation running until cooling has finished.',
        },
      ],
    },
  ]
}

export default function Automation({ session }: { session: Session }) {
  const [automations, setAutomations] = useState<AutomationType[]>([])
  const [scenes, setScenes] = useState<Scene[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [runs, setRuns] = useState<Record<number, AutomationRun[]>>({})
  const [expanded, setExpanded] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<AutomationType | null>(null)
  const [sceneConfirm, setSceneConfirm] = useState<Scene | null>(null)
  const [busy, setBusy] = useState(false)
  const { toasts, push, dismiss } = useToasts()

  const isAdmin = session.role === 'admin'
  const canRun = session.role !== 'viewer'

  const load = async () => {
    try {
      const [a, s, g] = await Promise.all([
        api.listAutomations(),
        api.listScenes(),
        api.listGroups(),
      ])
      setAutomations(a)
      setScenes(s)
      setGroups(g)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load automations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const showRuns = async (automation: AutomationType) => {
    if (expanded === automation.id) {
      setExpanded(null)
      return
    }
    setExpanded(automation.id)
    if (!runs[automation.id]) {
      const history = await api.automationRuns(automation.id)
      setRuns((current) => ({ ...current, [automation.id]: history }))
    }
  }

  const createTemplate = async (template: ReturnType<typeof templates>[number]) => {
    setBusy(true)
    try {
      await api.createAutomation(template as unknown as Record<string, unknown>)
      push('ok', `Created “${template.name}”`)
      void load()
    } catch (err) {
      push('fault', 'Could not create', err instanceof ApiError ? err.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold text-slate-100">Automation</h1>
      {error && <ErrorBanner message={error} />}

      <Panel
        icon={AutomationIcon}
        title="Automations"
        description="Multi-step sequences. Each step reports its own per-projector result."
      >
        {automations.length === 0 ? (
          <EmptyState title="No automations yet">
            Create one from a template below, or build your own through the API.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-white/5">
            {automations.map((automation) => (
              <li key={automation.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-100">{automation.name}</p>
                    <p className="text-xs text-slate-400">{automation.description}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Chip tone={automation.enabled ? 'ok' : 'idle'}>
                        {automation.trigger_type}
                      </Chip>
                      {automation.schedule?.at ? (
                        <span>at {String(automation.schedule.at)}</span>
                      ) : null}
                      <span>{automation.steps.length} steps</span>
                      {automation.last_run_at && (
                        <span>last run {formatDateTime(automation.last_run_at)}</span>
                      )}
                      {automation.last_status && (
                        <Chip
                          tone={
                            automation.last_status === 'success'
                              ? 'ok'
                              : automation.last_status === 'partial'
                                ? 'warn'
                                : 'fault'
                          }
                        >
                          {automation.last_status}
                        </Chip>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      className="btn-ghost text-xs"
                      onClick={() => void showRuns(automation)}
                    >
                      {expanded === automation.id ? 'Hide runs' : 'Runs'}
                    </button>
                    <button
                      className="btn-primary text-xs"
                      disabled={!canRun || busy}
                      onClick={() => setConfirming(automation)}
                    >
                      <SceneIcon size={13} aria-hidden /> Run now
                    </button>
                    {isAdmin && (
                      <button
                        className="btn-ghost text-xs text-red-300"
                        onClick={async () => {
                          await api.deleteAutomation(automation.id)
                          void load()
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {expanded === automation.id && (
                  <div className="mt-3 space-y-2 rounded-md bg-panel-850 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Steps</p>
                    <ol className="space-y-1 text-xs text-slate-400">
                      {automation.steps.map((step, index) => (
                        <li key={index}>
                          {index + 1}. {step.label ?? step.type}
                          <span className="text-slate-600">
                            {' '}
                            ({step.type}
                            {step.capability ? ` · ${step.capability}` : ''})
                          </span>
                        </li>
                      ))}
                    </ol>

                    <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">
                      Recent runs
                    </p>
                    {(runs[automation.id] ?? []).length === 0 ? (
                      <p className="text-xs text-slate-500">No runs recorded.</p>
                    ) : (
                      <ul className="space-y-2">
                        {(runs[automation.id] ?? []).slice(0, 5).map((run) => (
                          <li key={run.id} className="rounded bg-panel-800 p-2">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-slate-400">
                                {formatDateTime(run.started_at)} · {run.trigger}
                              </span>
                              <Chip
                                tone={
                                  run.status === 'success'
                                    ? 'ok'
                                    : run.status === 'partial'
                                      ? 'warn'
                                      : 'fault'
                                }
                              >
                                {run.status}
                              </Chip>
                            </div>
                            <ul className="mt-1 space-y-0.5">
                              {run.step_results.map((step) => (
                                <li
                                  key={step.step}
                                  className={
                                    step.ok ? 'text-xs text-slate-500' : 'text-xs text-red-300'
                                  }
                                >
                                  {step.ok ? '✓' : '✕'} {step.label}
                                  {step.error ? ` — ${step.error}` : ''}
                                  {step.detail ? ` — ${step.detail}` : ''}
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {isAdmin && (
        <Panel
          title="Templates"
          description="Ready-made startup and shutdown sequences you can create and then edit."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {templates(groups[0]?.id ?? null).map((template) => (
              <div key={template.name} className="rounded-md bg-panel-850 p-3">
                <p className="text-sm font-medium text-slate-200">{template.name}</p>
                <p className="mt-1 text-xs text-slate-400">{template.description}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Targets: {groups[0]?.name ?? 'all projectors'} · {template.steps.length}{' '}
                  steps
                </p>
                <button
                  className="btn-default mt-3 text-xs"
                  disabled={busy}
                  onClick={() => void createTemplate(template)}
                >
                  Create
                </button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel icon={SceneIcon} title="Scenes" description="Reusable one-shot actions over projectors or groups.">
        {scenes.length === 0 ? (
          <EmptyState title="No scenes defined">
            Scenes activate a fixed set of commands in one action.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-white/5">
            {scenes.map((scene) => (
              <li key={scene.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="text-sm text-slate-200">{scene.name}</p>
                  <p className="text-xs text-slate-500">
                    {scene.description || `${scene.actions.length} action(s)`}
                  </p>
                </div>
                <button
                  className="btn-default text-xs"
                  disabled={!canRun || busy}
                  onClick={() => setSceneConfirm(scene)}
                >
                  Activate
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ConfirmDialog
        open={confirming !== null}
        title={`Run “${confirming?.name}”?`}
        body={
          <>
            <p>
              This runs {confirming?.steps.length} step(s) against live projectors,
              including power commands.
            </p>
            <p className="mt-2 text-xs text-slate-400">
              {confirming?.abort_on_failure
                ? 'The run stops at the first failed step.'
                : 'The run continues past failed steps and reports them at the end.'}
            </p>
          </>
        }
        confirmLabel="Run now"
        danger
        onCancel={() => setConfirming(null)}
        onConfirm={async () => {
          const automation = confirming
          setConfirming(null)
          if (!automation) return
          setBusy(true)
          try {
            const result = await api.runAutomation(automation.id)
            const failed = result.steps.filter((step) => !step.ok).length
            push(
              result.status === 'success' ? 'ok' : failed ? 'warn' : 'fault',
              `${result.name}: ${result.status}`,
              failed ? `${failed} step(s) failed` : undefined,
            )
            setRuns((current) => {
              const next = { ...current }
              delete next[automation.id]
              return next
            })
            void load()
          } catch (err) {
            push('fault', 'Run failed', err instanceof ApiError ? err.message : undefined)
          } finally {
            setBusy(false)
          }
        }}
      />
      <ConfirmDialog
        open={sceneConfirm !== null}
        title={`Activate scene “${sceneConfirm?.name}”?`}
        body={sceneConfirm?.description || 'Runs every action in the scene against live projectors.'}
        confirmLabel="Activate"
        onCancel={() => setSceneConfirm(null)}
        onConfirm={async () => {
          const scene = sceneConfirm
          setSceneConfirm(null)
          if (!scene) return
          setBusy(true)
          try {
            const result = await api.activateScene(scene.id)
            push(
              result.failed === 0 ? 'ok' : 'warn',
              `${result.name}: ${result.total - result.failed}/${result.total} succeeded`,
            )
          } catch (err) {
            push('fault', 'Scene failed', err instanceof ApiError ? err.message : undefined)
          } finally {
            setBusy(false)
          }
        }}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
