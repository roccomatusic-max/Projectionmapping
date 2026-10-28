/**
 * Automation builder.
 *
 * Every function it offers comes from the drivers' capability manifests for
 * the projectors a step targets, so it can only describe things those
 * projectors can do. Saving is allowed only after a server-side Check of the
 * exact draft has passed: targets resolve, functions exist and are not gated
 * on any targeted unit, parameters are valid, the schedule can fire.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '@/api/client'
import { mappingApi } from '@/mapping/api'
import type { MappingScene, Show } from '@/mapping/types'
import type {
  Automation,
  AutomationStep,
  AutomationValidation,
  Capability,
  DriverInfo,
  Enclosure,
  Group,
  Projector,
  Scene,
} from '@/api/types'
import { classNames, formatDateTime } from '@/lib/format'
import { ErrorBanner, Spinner } from './ui'
import {
  AutomationIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  CopyIcon,
  DeleteIcon,
  FaultIcon,
  LiveIcon,
  LogsIcon,
  OkIcon,
  PowerIcon,
  RunShowIcon,
  SceneIcon,
  ScenesIcon,
  TemperatureIcon,
  WarningIcon,
  type LucideIcon,
} from './icons'

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export interface Draft {
  name: string
  description: string
  enabled: boolean
  trigger_type: Automation['trigger_type']
  schedule: Record<string, unknown>
  steps: AutomationStep[]
  abort_on_failure: boolean
}

type Target = { type: 'all' | 'group' | 'projector'; id?: number }

/** The light show side: scenes from Mapping → Scenes and the shows with their cues. */
export interface Lights {
  scenes: MappingScene[]
  shows: Show[]
}

const NO_LIGHTS: Lights = { scenes: [], shows: [] }

/** Every show with its cues, for the steps that play scenes or start a show. */
export async function loadLights(): Promise<Lights> {
  const [scenes, summaries] = await Promise.all([mappingApi.listScenes(), mappingApi.listShows()])
  const shows = await Promise.all(summaries.map((s) => mappingApi.getShow(s.id)))
  return { scenes, shows }
}

interface FunctionEntry {
  cap: Capability
  drivers: Set<string>
  /** Enum values accepted by every targeted driver that has the function. */
  params: string[]
  /** Enum values accepted by at least one targeted driver. */
  allParams: string[]
  labels: Record<string, string>
}

interface FunctionIndex {
  targeted: Projector[]
  functions: Map<string, FunctionEntry>
}

const STEP_KINDS: Array<{ type: string; label: string; hint: string; icon: LucideIcon }> = [
  { type: 'command', label: 'Send a command', hint: 'Power, shutter, input, lens…', icon: PowerIcon },
  { type: 'wait_state', label: 'Wait for a state', hint: 'Poll until projectors report it', icon: ClockIcon },
  { type: 'check_online', label: 'Check connectivity', hint: 'Fail if any target is not responding', icon: LiveIcon },
  { type: 'check_faults', label: 'Check for faults', hint: 'Fail if any target reports an error', icon: FaultIcon },
  { type: 'check_enclosure', label: 'Check an enclosure', hint: 'Block on heat, leak or stale sensors', icon: TemperatureIcon },
  { type: 'play_scene', label: 'Play a scene', hint: 'One of your scenes, on every projector', icon: ScenesIcon },
  { type: 'show', label: 'Start or stop the show', hint: 'Start at a cue, or stop', icon: RunShowIcon },
  { type: 'delay', label: 'Delay', hint: 'Pause for a number of seconds', icon: ClockIcon },
  { type: 'notify', label: 'Notify', hint: 'Record a message and alert', icon: LogsIcon },
  // Offered only when presets exist; they cannot be made on any page.
  { type: 'scene', label: 'Run a projector preset', hint: 'A saved set of projector commands', icon: SceneIcon },
]

const CATEGORY: Array<[string, string]> = [
  ['power.', 'Power'], ['shutter.', 'Shutter'], ['input.', 'Input'], ['lens.', 'Lens'],
  ['lamp.', 'Lamp'], ['image.', 'Image'], ['osd.', 'On-screen display'], ['remote.', 'Remote keys'],
]

const PARAM_KEY: Record<string, string> = {
  'power.set': 'state', 'shutter.set': 'state', 'input.set': 'input',
  'image.freeze': 'state', 'osd.set': 'state', 'lamp.select': 'mode', 'lamp.power': 'mode',
}

const WAIT_QUERIES: Array<[string, string, string[]]> = [
  ['power.get', 'Power', ['on', 'off', 'warming', 'cooling']],
  ['shutter.get', 'Shutter', ['open', 'closed']],
  ['input.get', 'Input', []],
]

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function emptyDraft(): Draft {
  return {
    name: '', description: '', enabled: true, trigger_type: 'manual', schedule: {},
    steps: [], abort_on_failure: true,
  }
}

export function draftFromAutomation(a: Automation): Draft {
  return {
    name: a.name, description: a.description, enabled: a.enabled, trigger_type: a.trigger_type,
    schedule: { ...a.schedule }, steps: a.steps.map(upgradeStep),
    abort_on_failure: a.abort_on_failure,
  }
}

/**
 * The old "Activate a scene" step ran a projector preset, so it listed none
 * of the scenes on Mapping → Scenes. One left without a preset chosen was
 * meant to play one of those scenes: it becomes "Play a scene".
 */
function upgradeStep(step: AutomationStep): AutomationStep {
  if (step.type !== 'scene' || step.scene_id != null) return { ...step }
  const label = step.label && !step.label.startsWith('Scene: ') ? step.label : undefined
  return { type: 'play_scene', fade_seconds: 2, ...(label ? { label } : {}) }
}

function targetKey(target: Target | undefined): string {
  if (!target || target.type === 'all') return 'all'
  return `${target.type}:${target.id ?? ''}`
}

function parseTarget(key: string): Target {
  if (key === 'all') return { type: 'all' }
  const [type, id] = key.split(':')
  return { type: type as 'group' | 'projector', id: Number(id) }
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export function AutomationBuilder({
  initial,
  existingId,
  onSaved,
  onCancel,
}: {
  initial: Draft
  existingId: number | null
  onSaved: (automation: Automation) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<Draft>(initial)
  const [selected, setSelected] = useState<number | null>(initial.steps.length ? 0 : null)
  const [projectors, setProjectors] = useState<Projector[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [drivers, setDrivers] = useState<DriverInfo[]>([])
  const [scenes, setScenes] = useState<Scene[]>([])
  const [lights, setLights] = useState<Lights>(NO_LIGHTS)
  const [enclosures, setEnclosures] = useState<Enclosure[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [check, setCheck] = useState<{ signature: string; result: AutomationValidation } | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void Promise.all([api.listProjectors(), api.listGroups(), api.drivers(), api.listScenes(), api.listEnclosures(),
                      loadLights().catch(() => NO_LIGHTS)])
      .then(([p, g, d, s, e, l]) => {
        setProjectors(p); setGroups(g); setDrivers(d.drivers); setScenes(s); setEnclosures(e); setLights(l)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const signature = JSON.stringify(draft)
  const checked = check?.signature === signature ? check.result : null
  const canSave = Boolean(checked?.ok) && draft.name.trim().length > 0

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const updateStep = (index: number, patch: Partial<AutomationStep>) =>
    setDraft((d) => ({ ...d, steps: d.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) }))
  const addStep = (type: string) => {
    const step: AutomationStep = { type, target: { type: 'all' } }
    if (type === 'command') Object.assign(step, { capability: 'power.set', params: { state: 'on' } })
    if (type === 'wait_state') Object.assign(step, { capability: 'power.get', expect: 'on', timeout: 180, interval: 5 })
    if (type === 'delay') step.seconds = 5
    if (type === 'check_faults') Object.assign(step, { block_on: ['error'] })
    if (type === 'check_enclosure') Object.assign(step, { enclosure_id: enclosures[0]?.id, require_fresh: true, max_age_seconds: 600 })
    if (type === 'scene') step.scene_id = scenes[0]?.id
    if (type === 'play_scene') Object.assign(step, { mapping_scene_id: lights.scenes[0]?.id, fade_seconds: 2 })
    if (type === 'show') Object.assign(step, { action: 'start', show_id: lights.shows[0]?.id })
    if (type === 'notify') Object.assign(step, { message: '', severity: 'info' })
    setDraft((d) => ({ ...d, steps: [...d.steps, step] }))
    setSelected(draft.steps.length)
  }
  const removeStep = (index: number) => {
    setDraft((d) => ({ ...d, steps: d.steps.filter((_, i) => i !== index) }))
    setSelected((s) => (s === null ? null : s === index ? null : s > index ? s - 1 : s))
  }
  const moveStep = (index: number, delta: number) => {
    const to = index + delta
    if (to < 0 || to >= draft.steps.length) return
    setDraft((d) => {
      const steps = [...d.steps]
      ;[steps[index], steps[to]] = [steps[to], steps[index]]
      return { ...d, steps }
    })
    setSelected(to)
  }
  const duplicateStep = (index: number) => {
    setDraft((d) => {
      const steps = [...d.steps]
      steps.splice(index + 1, 0, JSON.parse(JSON.stringify(d.steps[index])))
      return { ...d, steps }
    })
    setSelected(index + 1)
  }

  /** Projectors a target resolves to, for building the function list. */
  const resolve = (target: Target | undefined): Projector[] => {
    if (!target || target.type === 'all') return projectors.filter((p) => p.enabled)
    if (target.type === 'group') {
      const group = groups.find((g) => g.id === target.id)
      return projectors.filter((p) => group?.projector_ids.includes(p.id))
    }
    return projectors.filter((p) => p.id === target.id)
  }

  /**
   * Functions offered for a target: the union of non-query capabilities
   * across the targeted projectors' drivers. Enum parameters (inputs, lamp
   * modes) are intersected, so only values every targeted unit accepts are
   * offered; `allParams` keeps the union for the hint text.
   */
  const functionsFor = (target: Target | undefined): FunctionIndex => {
    const targeted = resolve(target)
    const driverIds = new Set(targeted.map((p) => p.driver))
    const merged = new Map<string, FunctionEntry>()
    for (const driver of drivers) {
      if (!driverIds.has(driver.driver_id)) continue
      for (const cap of driver.capabilities) {
        if (cap.kind === 'query' || cap.name === 'lens.memory') continue
        const entry = merged.get(cap.name)
        if (!entry) {
          merged.set(cap.name, {
            cap, drivers: new Set([driver.driver_id]),
            params: [...cap.params], allParams: [...cap.params],
            labels: { ...(cap.param_labels ?? {}) },
          })
          continue
        }
        entry.drivers.add(driver.driver_id)
        entry.params = entry.params.filter((v) => cap.params.includes(v))
        for (const v of cap.params) if (!entry.allParams.includes(v)) entry.allParams.push(v)
        Object.assign(entry.labels, cap.param_labels ?? {})
        // A function gated on any targeted driver is shown as gated.
        if (cap.requires_opt_in && !entry.cap.requires_opt_in) entry.cap = cap
      }
    }
    return { targeted, functions: merged }
  }

  const runCheck = async () => {
    setChecking(true)
    try {
      const result = await api.validateAutomation({ ...draft, name: draft.name || 'draft' })
      setCheck({ signature, result })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Check failed')
    } finally {
      setChecking(false)
    }
  }

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        ...draft,
        steps: draft.steps.map((step) => ({
          ...step,
          label: step.label?.trim() || summarise(step, projectors, groups, scenes, enclosures, lights),
        })),
      }
      const saved = existingId
        ? await api.updateAutomation(existingId, body)
        : await api.createAutomation(body)
      onSaved(saved)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="Loading builder…" />

  const problemsFor = (index: number | null) =>
    checked?.problems.filter((p) => p.step === index) ?? []

  return (
    <section className="panel">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-sky-500/15 text-sky-300" aria-hidden>
            <AutomationIcon size={15} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              {existingId ? 'Edit automation' : 'New automation'}
            </h2>
            <p className="text-xs text-slate-400">
              Build the sequence, run Check, then save. Saving requires a passing check of this exact draft.
            </p>
          </div>
        </div>
        <button className="btn-ghost text-xs" onClick={onCancel}>
          <CloseIcon size={14} aria-hidden /> Cancel
        </button>
      </header>

      <div className="space-y-5 p-4">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {/* ---- identity + trigger ---- */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={draft.name} placeholder="House mapping — startup"
                   onChange={(e) => update({ name: e.target.value })} />
          </div>
          <div className="lg:col-span-2">
            <label className="label">Description</label>
            <input className="input" value={draft.description} placeholder="What this sequence is for"
                   onChange={(e) => update({ description: e.target.value })} />
          </div>
        </div>

        <TriggerEditor draft={draft} update={update} />

        <div className="flex flex-wrap gap-5 text-sm text-slate-300">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
            Enabled
          </label>
          <label className="flex items-center gap-2" title="Off: continue past failed steps and report them all at the end.">
            <input type="checkbox" checked={draft.abort_on_failure}
                   onChange={(e) => update({ abort_on_failure: e.target.checked })} />
            Stop at the first failed step
          </label>
        </div>

        {/* ---- steps ---- */}
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <p className="label">Steps</p>
            {draft.steps.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-sm text-slate-500">
                No steps yet. Add one from the list below.
              </p>
            ) : (
              <ol className="space-y-1.5">
                {draft.steps.map((step, index) => {
                  const kind = STEP_KINDS.find((k) => k.type === step.type)
                  const Icon = kind?.icon ?? LogsIcon
                  const problems = problemsFor(index)
                  const worst = problems.some((p) => p.severity === 'error') ? 'error'
                    : problems.length ? 'warning' : null
                  return (
                    <li key={index}>
                      <button
                        className={classNames(
                          'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left',
                          selected === index
                            ? 'border-sky-500/60 bg-panel-800'
                            : 'border-white/5 bg-panel-850 hover:bg-panel-800',
                        )}
                        onClick={() => setSelected(index)}
                      >
                        <span className="tnum w-5 text-xs text-slate-500">{index + 1}</span>
                        <Icon size={16} className="shrink-0 text-slate-400" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-slate-100">
                            {summarise(step, projectors, groups, scenes, enclosures, lights)}
                          </span>
                          {step.label && <span className="block truncate text-xs text-slate-500">{step.label}</span>}
                        </span>
                        {worst === 'error' && <FaultIcon size={15} className="text-red-400" aria-label="Has errors" />}
                        {worst === 'warning' && <WarningIcon size={15} className="text-yellow-400" aria-label="Has warnings" />}
                        {checked && !worst && <OkIcon size={15} className="text-green-400" aria-label="Checked" />}
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}

            <p className="label mt-4">Add a step</p>
            <div className="grid grid-cols-2 gap-1.5">
              {STEP_KINDS.filter((kind) => kind.type !== 'scene' || scenes.length > 0).map((kind) => (
                <button
                  key={kind.type}
                  className="flex items-start gap-2 rounded-lg border border-white/5 bg-panel-850 px-2.5 py-2 text-left hover:bg-panel-800"
                  onClick={() => addStep(kind.type)}
                >
                  <kind.icon size={15} className="mt-0.5 shrink-0 text-sky-300" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-slate-100">{kind.label}</span>
                    <span className="block text-[11px] leading-snug text-slate-500">{kind.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-3">
            <p className="label">Step details</p>
            {selected === null || !draft.steps[selected] ? (
              <p className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-sm text-slate-500">
                Select a step to edit it.
              </p>
            ) : (
              <div className="rounded-lg border border-white/5 bg-panel-850 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-100">
                    Step {selected + 1} · {STEP_KINDS.find((k) => k.type === draft.steps[selected].type)?.label}
                  </span>
                  <span className="flex gap-1">
                    <button className="btn-ghost px-2 text-xs" onClick={() => moveStep(selected, -1)} disabled={selected === 0} title="Move up">↑</button>
                    <button className="btn-ghost px-2 text-xs" onClick={() => moveStep(selected, 1)} disabled={selected === draft.steps.length - 1} title="Move down">↓</button>
                    <button className="btn-ghost px-2 text-xs" onClick={() => duplicateStep(selected)} title="Duplicate"><CopyIcon size={13} /></button>
                    <button className="btn-ghost px-2 text-xs text-red-300" onClick={() => removeStep(selected)} title="Remove"><DeleteIcon size={13} /></button>
                  </span>
                </div>
                <StepEditor
                  step={draft.steps[selected]}
                  onChange={(patch) => updateStep(selected, patch)}
                  projectors={projectors}
                  groups={groups}
                  scenes={scenes}
                  lights={lights}
                  enclosures={enclosures}
                  functionsFor={functionsFor}
                />
                {problemsFor(selected).length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {problemsFor(selected).map((p, i) => (
                      <li key={i} className={classNames('flex items-start gap-1.5 text-xs', p.severity === 'error' ? 'text-red-300' : 'text-yellow-300')}>
                        {p.severity === 'error' ? <FaultIcon size={13} className="mt-0.5 shrink-0" /> : <WarningIcon size={13} className="mt-0.5 shrink-0" />}
                        {p.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ---- check + save ---- */}
        <div className="rounded-lg border border-white/5 bg-panel-850 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-default" onClick={() => void runCheck()} disabled={checking}>
              <CheckIcon size={15} aria-hidden /> {checking ? 'Checking…' : 'Check'}
            </button>
            <button className="btn-primary" onClick={() => void save()} disabled={!canSave || saving}
                    title={!canSave ? (draft.name.trim() ? 'Run Check on this draft first' : 'Give it a name') : undefined}>
              <OkIcon size={15} aria-hidden /> {saving ? 'Saving…' : existingId ? 'Save changes' : 'Save automation'}
            </button>
            {check && check.signature !== signature && (
              <span className="text-xs text-yellow-300">Draft changed since the last check — run Check again.</span>
            )}
            {checked && (
              <span className={classNames('flex items-center gap-1.5 text-sm', checked.ok ? 'text-green-300' : 'text-red-300')}>
                {checked.ok ? <OkIcon size={15} /> : <FaultIcon size={15} />}
                {checked.ok
                  ? `Ready — ${checked.problems.length ? `${checked.problems.length} warning(s)` : 'no problems'}`
                  : `${checked.problems.filter((p) => p.severity === 'error').length} problem(s) to fix`}
              </span>
            )}
          </div>

          {checked && (
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div>
                {checked.problems.filter((p) => p.step === null).map((p, i) => (
                  <p key={i} className={classNames('flex items-start gap-1.5 text-xs', p.severity === 'error' ? 'text-red-300' : 'text-yellow-300')}>
                    {p.severity === 'error' ? <FaultIcon size={13} className="mt-0.5 shrink-0" /> : <WarningIcon size={13} className="mt-0.5 shrink-0" />}
                    {p.message}
                  </p>
                ))}
                {checked.problems.filter((p) => p.step !== null).length > 0 && (
                  <p className="text-xs text-slate-400">
                    Step problems are shown on the step — click a flagged step in the list.
                  </p>
                )}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  Next runs {checked.timezone && <span className="normal-case tracking-normal text-slate-600">· {checked.timezone}</span>}
                </p>
                {draft.trigger_type === 'manual' ? (
                  <p className="text-xs text-slate-400">Manual — runs only when you press Run now.</p>
                ) : checked.next_runs.length === 0 ? (
                  <p className="text-xs text-yellow-300">This schedule never fires.</p>
                ) : (
                  <ul className="text-xs text-slate-300">
                    {checked.next_runs.map((iso) => <li key={iso} className="tnum">{formatDateTime(iso)}</li>)}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Trigger                                                              */
/* ------------------------------------------------------------------ */

function TriggerEditor({ draft, update }: { draft: Draft; update: (patch: Partial<Draft>) => void }) {
  const setSchedule = (patch: Record<string, unknown>) => update({ schedule: { ...draft.schedule, ...patch } })
  const days = (draft.schedule.days as number[] | undefined) ?? []
  return (
    <div>
      <p className="label">Trigger</p>
      <div className="flex flex-wrap gap-1.5">
        {(['manual', 'once', 'daily', 'weekly', 'cron'] as const).map((t) => (
          <button
            key={t}
            className={classNames('btn text-sm', draft.trigger_type === t ? 'bg-sky-600 text-white' : 'btn-default')}
            onClick={() => update({ trigger_type: t, schedule: t === draft.trigger_type ? draft.schedule : {} })}
          >
            {t === 'manual' ? 'Manual' : t === 'once' ? 'Once' : t === 'daily' ? 'Daily' : t === 'weekly' ? 'Weekly' : 'Cron'}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {draft.trigger_type === 'once' && (
          <div>
            <label className="label">Date and time</label>
            <input type="datetime-local" className="input" value={String(draft.schedule.run_at ?? '')}
                   onChange={(e) => setSchedule({ run_at: e.target.value })} />
          </div>
        )}
        {(draft.trigger_type === 'daily' || draft.trigger_type === 'weekly') && (
          <div>
            <label className="label">Time</label>
            <input type="time" className="input" value={String(draft.schedule.at ?? '')}
                   onChange={(e) => setSchedule({ at: e.target.value })} />
          </div>
        )}
        {draft.trigger_type === 'weekly' && (
          <div className="sm:col-span-2">
            <label className="label">Days</label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((name, index) => (
                <button key={name}
                        className={classNames('btn px-3 py-1.5 text-xs', days.includes(index) ? 'bg-sky-600 text-white' : 'btn-default')}
                        onClick={() => setSchedule({ days: days.includes(index) ? days.filter((d) => d !== index) : [...days, index].sort() })}>
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}
        {draft.trigger_type === 'cron' && (
          <div className="sm:col-span-3">
            <label className="label">Cron expression (minute hour day month weekday)</label>
            <input className="input font-mono" value={String(draft.schedule.cron ?? '')} placeholder="30 20 * * fri,sat"
                   onChange={(e) => setSchedule({ cron: e.target.value })} />
            <p className="mt-1 text-xs text-slate-500">
              Examples: <code>30 20 * * *</code> every day 20:30 · <code>0 22 * * fri,sat</code> weekends 22:00 · <code>*/15 18-23 * * *</code> every 15 min in the evening
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Step editor                                                          */
/* ------------------------------------------------------------------ */

function TargetSelect({ value, onChange, projectors, groups }: {
  value: Target | undefined
  onChange: (t: Target) => void
  projectors: Projector[]
  groups: Group[]
}) {
  return (
    <div>
      <label className="label">Target</label>
      <select className="input" value={targetKey(value)} onChange={(e) => onChange(parseTarget(e.target.value))}>
        <option value="all">All projectors</option>
        {groups.length > 0 && (
          <optgroup label="Groups">
            {groups.map((g) => <option key={g.id} value={`group:${g.id}`}>{g.name} ({g.projector_ids.length})</option>)}
          </optgroup>
        )}
        <optgroup label="Projectors">
          {projectors.map((p) => <option key={p.id} value={`projector:${p.id}`}>{p.name}</option>)}
        </optgroup>
      </select>
    </div>
  )
}

function StepEditor({ step, onChange, projectors, groups, scenes, lights, enclosures, functionsFor }: {
  step: AutomationStep
  onChange: (patch: Partial<AutomationStep>) => void
  projectors: Projector[]
  groups: Group[]
  scenes: Scene[]
  lights: Lights
  enclosures: Enclosure[]
  functionsFor: (t: Target | undefined) => FunctionIndex
}) {
  const target = step.target as Target | undefined
  const { targeted, functions } = useMemo(() => functionsFor(target), [functionsFor, target])

  const label = (
    <div>
      <label className="label">Label (optional)</label>
      <input className="input" value={step.label ?? ''} placeholder="Shown in run reports"
             onChange={(e) => onChange({ label: e.target.value })} />
    </div>
  )

  switch (step.type) {
    case 'command': {
      const entry = step.capability ? functions.get(step.capability) : undefined
      const cap = entry?.cap
      const gatedOn = cap?.requires_opt_in ? targeted.filter((p) => !p.allow_unverified_commands) : []
      const missingOn = step.capability
        ? targeted.filter((p) => {
            const d = functions.get(step.capability!)
            return d ? !d.drivers.has(p.driver) : true
          })
        : []
      const key = step.capability ? PARAM_KEY[step.capability] : undefined
      const params = step.params ?? {}
      const grouped = CATEGORY.map(([prefix, name]) => ({
        name,
        caps: [...functions.values()].filter((f) => f.cap.name.startsWith(prefix)).map((f) => f.cap),
      })).filter((g) => g.caps.length)
      const isJog = step.capability?.startsWith('lens.') && !['lens.home', 'lens.calibrate'].includes(step.capability)
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <TargetSelect value={target} onChange={(t) => onChange({ target: t })} projectors={projectors} groups={groups} />
          <div>
            <label className="label">Function</label>
            <select className="input" value={step.capability ?? ''}
                    onChange={(e) => {
                      const next = functions.get(e.target.value)
                      const k = PARAM_KEY[e.target.value]
                      const first = next?.params[0]
                      const range = next?.cap.value_range
                      const jog = e.target.value.startsWith('lens.') && !['lens.home', 'lens.calibrate'].includes(e.target.value)
                      onChange({
                        capability: e.target.value,
                        params: k && first ? { [k]: first } : range ? { value: range[0] } : jog ? { direction: 1, step: 1 } : {},
                      })
                    }}>
              <option value="">Choose…</option>
              {grouped.map((g) => (
                <optgroup key={g.name} label={g.name}>
                  {g.caps.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.description}{c.requires_opt_in ? ' (needs opt-in)' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {targeted.length === 0 && <p className="mt-1 text-xs text-yellow-300">The target has no enabled projectors.</p>}
          </div>

          {entry && cap && entry.allParams.length > 0 && key && (
            <div>
              <label className="label">{key === 'input' ? 'Input' : key === 'mode' ? 'Mode' : 'State'}</label>
              <select className="input" value={String(params[key] ?? '')}
                      onChange={(e) => onChange({ params: { ...params, [key]: e.target.value } })}>
                {!entry.params.includes(String(params[key])) && params[key] != null && (
                  <option value={String(params[key])}>{String(params[key])} (not on every target)</option>
                )}
                {entry.params.map((p) => <option key={p} value={p}>{entry.labels[p] ?? p}</option>)}
              </select>
              {entry.allParams.length !== entry.params.length && (
                <p className="mt-1 text-xs text-slate-500">
                  Only {key === 'input' ? 'inputs' : 'values'} every targeted projector has are listed.
                </p>
              )}
            </div>
          )}
          {cap && cap.value_range && (
            <div>
              <label className="label">Value ({cap.value_range[0]}–{cap.value_range[1]})</label>
              <input type="number" className="input tnum" min={cap.value_range[0]} max={cap.value_range[1]}
                     value={Number(params.value ?? cap.value_range[0])}
                     onChange={(e) => onChange({ params: { ...params, value: Number(e.target.value) } })} />
            </div>
          )}
          {cap && isJog && (
            <div>
              <label className="label">Jog</label>
              <div className="flex gap-2">
                {([-1, 1] as const).map((dir) => (
                  <button key={dir}
                          className={classNames('btn flex-1', Number(params.direction) === dir ? 'bg-sky-600 text-white' : 'btn-default')}
                          onClick={() => onChange({ params: { ...params, direction: dir, step: Number(params.step ?? 1) } })}>
                    {dir < 0 ? '− / left / down' : '+ / right / up'}
                  </button>
                ))}
                <input type="number" className="input w-20 tnum" min={1} max={10} value={Number(params.step ?? 1)}
                       onChange={(e) => onChange({ params: { ...params, step: Number(e.target.value) } })} title="Steps (1–10)" />
              </div>
            </div>
          )}
          {label}
          {cap && (
            <div className="sm:col-span-2 space-y-1 text-xs">
              {gatedOn.length > 0 && (
                <p className="flex items-start gap-1.5 text-yellow-300">
                  <WarningIcon size={13} className="mt-0.5 shrink-0" />
                  Gated on {gatedOn.map((p) => p.name).join(', ')}: {cap.caveat ?? 'enable "allow unverified commands" on those projectors first.'}
                </p>
              )}
              {missingOn.length > 0 && (
                <p className="flex items-start gap-1.5 text-red-300">
                  <FaultIcon size={13} className="mt-0.5 shrink-0" />
                  Not available on {missingOn.map((p) => p.name).join(', ')} — remove them from the target or pick another function.
                </p>
              )}
              {cap.disruptive && <p className="text-slate-500">This command changes projector state; it will be audited under the automation.</p>}
            </div>
          )}
        </div>
      )
    }
    case 'wait_state': {
      const query = WAIT_QUERIES.find(([k]) => k === (step.capability ?? 'power.get')) ?? WAIT_QUERIES[0]
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <TargetSelect value={target} onChange={(t) => onChange({ target: t })} projectors={projectors} groups={groups} />
          <div>
            <label className="label">Wait until</label>
            <select className="input" value={query[0]}
                    onChange={(e) => {
                      const q = WAIT_QUERIES.find(([k]) => k === e.target.value)!
                      onChange({ capability: q[0], expect: q[2][0] ?? '' })
                    }}>
              {WAIT_QUERIES.map(([k, name]) => <option key={k} value={k}>{name} reports…</option>)}
            </select>
          </div>
          <div>
            <label className="label">Expected state</label>
            {query[2].length ? (
              <select className="input" value={String(step.expect ?? '')} onChange={(e) => onChange({ expect: e.target.value })}>
                {query[2].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            ) : (
              <input className="input" value={String(step.expect ?? '')} placeholder="e.g. HD1"
                     onChange={(e) => onChange({ expect: e.target.value.toUpperCase() })} />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Timeout (s)</label>
              <input type="number" className="input tnum" min={1} max={3600} value={Number(step.timeout ?? 180)}
                     onChange={(e) => onChange({ timeout: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Poll every (s)</label>
              <input type="number" className="input tnum" min={1} max={120} value={Number(step.interval ?? 5)}
                     onChange={(e) => onChange({ interval: Number(e.target.value) })} />
            </div>
          </div>
          {label}
          <p className="text-xs text-slate-500 sm:col-span-2">
            A lamp strike takes 30–60 s; a cool-down longer. Give power transitions at least 180 s.
          </p>
        </div>
      )
    }
    case 'delay':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Seconds (0–1800)</label>
            <input type="number" className="input tnum" min={0} max={1800} value={Number(step.seconds ?? 5)}
                   onChange={(e) => onChange({ seconds: Number(e.target.value) })} />
          </div>
          {label}
        </div>
      )
    case 'check_online':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <TargetSelect value={target} onChange={(t) => onChange({ target: t })} projectors={projectors} groups={groups} />
          {label}
          <p className="text-xs text-slate-500 sm:col-span-2">Fails if any targeted projector did not answer its last poll.</p>
        </div>
      )
    case 'check_faults': {
      const blockOn = (step.block_on as string[] | undefined) ?? ['error']
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <TargetSelect value={target} onChange={(t) => onChange({ target: t })} projectors={projectors} groups={groups} />
          <div>
            <label className="label">Block when health is</label>
            <select className="input" value={blockOn.includes('warning') ? 'warning' : 'error'}
                    onChange={(e) => onChange({ block_on: e.target.value === 'warning' ? ['error', 'warning'] : ['error'] })}>
              <option value="error">Error</option>
              <option value="warning">Warning or error</option>
            </select>
          </div>
          {label}
        </div>
      )
    }
    case 'check_enclosure':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Enclosure</label>
            {enclosures.length === 0 ? (
              <p className="text-xs text-yellow-300">No enclosures are configured yet.</p>
            ) : (
              <select className="input" value={Number(step.enclosure_id ?? enclosures[0].id)}
                      onChange={(e) => onChange({ enclosure_id: Number(e.target.value) })}>
                {enclosures.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="label">Sensor data no older than (s)</label>
            <input type="number" className="input tnum" min={30} max={86400} value={Number(step.max_age_seconds ?? 600)}
                   onChange={(e) => onChange({ max_age_seconds: Number(e.target.value) })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300 sm:col-span-2">
            <input type="checkbox" checked={step.require_fresh !== false} onChange={(e) => onChange({ require_fresh: e.target.checked })} />
            Treat stale or missing sensor data as unsafe (recommended)
          </label>
          {label}
        </div>
      )
    case 'play_scene': {
      const chosen = lights.scenes.find((s) => s.id === step.mapping_scene_id)
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Scene</label>
            {lights.scenes.length === 0 ? (
              <p className="text-xs text-yellow-300">
                You have no scenes yet. Make one on <Link className="underline" to="/mapping/scenes">Scenes</Link>.
              </p>
            ) : (
              <select className="input" value={chosen ? chosen.id : ''}
                      onChange={(e) => onChange({ mapping_scene_id: Number(e.target.value) })}>
                {!chosen && <option value="" disabled>Choose a scene…</option>}
                {lights.scenes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="label">Fade in (seconds)</label>
            <input type="number" className="input tnum" min={0} max={30} step={0.5}
                   value={Number(step.fade_seconds ?? 2)}
                   onChange={(e) => onChange({ fade_seconds: Number(e.target.value) })} />
          </div>
          <p className="text-xs text-slate-400 sm:col-span-2">
            Plays on every projector until something else plays. Pressing GO on Run the show afterwards starts the
            show from its first cue.
          </p>
          {label}
        </div>
      )
    }
    case 'show': {
      const action = step.action === 'stop' ? 'stop' : 'start'
      const show = lights.shows.find((s) => s.id === step.show_id)
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Do</label>
            <select className="input" value={action}
                    onChange={(e) => onChange(e.target.value === 'stop'
                      ? { action: 'stop', show_id: undefined, cue_id: undefined }
                      : { action: 'start', show_id: lights.shows[0]?.id, cue_id: undefined })}>
              <option value="start">Start the show</option>
              <option value="stop">Stop the show</option>
            </select>
          </div>
          {action === 'start' && (
            lights.shows.length === 0 ? (
              <p className="text-xs text-yellow-300">You have no shows yet. Make one in Mapping → Set up.</p>
            ) : (
              <>
                <div>
                  <label className="label">Show</label>
                  <select className="input" value={show ? show.id : ''}
                          onChange={(e) => onChange({ show_id: Number(e.target.value), cue_id: undefined })}>
                    {!show && <option value="" disabled>Choose a show…</option>}
                    {lights.shows.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                {show && (
                  <div>
                    <label className="label">Start at</label>
                    {show.cues.length === 0 ? (
                      <p className="text-xs text-yellow-300">This show has no cues yet.</p>
                    ) : (
                      <select className="input" value={step.cue_id == null ? '' : Number(step.cue_id)}
                              onChange={(e) => onChange({ cue_id: e.target.value === '' ? undefined : Number(e.target.value) })}>
                        <option value="">The first cue</option>
                        {show.cues.map((cue, i) => (
                          <option key={cue.id} value={cue.id}>{cueName(cue, i, lights)}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </>
            )
          )}
          {label}
        </div>
      )
    }
    case 'scene':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Projector preset</label>
            {scenes.length === 0 ? (
              <p className="text-xs text-yellow-300">
                There are no projector presets. To play one of your scenes, remove this step and add Play a scene.
              </p>
            ) : (
              <select className="input" value={Number(step.scene_id ?? scenes[0].id)} onChange={(e) => onChange({ scene_id: Number(e.target.value) })}>
                {scenes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
          {label}
        </div>
      )
    case 'notify':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Message</label>
            <input className="input" value={String(step.message ?? '')} onChange={(e) => onChange({ message: e.target.value })} />
          </div>
          <div>
            <label className="label">Severity</label>
            <select className="input" value={String(step.severity ?? 'info')} onChange={(e) => onChange({ severity: e.target.value })}>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          {label}
        </div>
      )
    default:
      return <p className="text-sm text-slate-500">Unknown step type.</p>
  }
}

/* ------------------------------------------------------------------ */
/* Summaries                                                            */
/* ------------------------------------------------------------------ */

export function describeTarget(target: Target | undefined, projectors: Projector[], groups: Group[]): string {
  if (!target || target.type === 'all') return 'all projectors'
  if (target.type === 'group') return groups.find((g) => g.id === target.id)?.name ?? `group ${target.id}`
  return projectors.find((p) => p.id === target.id)?.name ?? `projector ${target.id}`
}

/** "power.set" → "Power", "lens.zoom" → "Lens zoom", "remote.menu" → "Remote key menu". */
export function functionName(capability: string | undefined): string {
  if (!capability) return 'Command'
  const [group, action] = capability.split('.')
  const groupName = group === 'osd' ? 'OSD' : group === 'remote' ? 'Remote key' : group.charAt(0).toUpperCase() + group.slice(1)
  if (!action || action === 'set') return groupName
  if (group === 'image' && action !== 'freeze') return action.charAt(0).toUpperCase() + action.slice(1)
  return `${groupName} ${action.replace(/_/g, ' ')}`
}

/** "Cue 2 · Ghosts (Haunted house)": the cue's name and the scene it plays. */
function cueName(cue: Show['cues'][number], index: number, lights: Lights): string {
  const scene = lights.scenes.find((s) => s.id === cue.scene_id)?.name
  const name = cue.name || scene || 'Untitled'
  return `Cue ${index + 1} · ${name}${scene && scene !== name ? ` (${scene})` : ''}`
}

export function summarise(step: AutomationStep, projectors: Projector[], groups: Group[], scenes: Scene[],
                          enclosures: Enclosure[], lights: Lights = NO_LIGHTS): string {
  const target = describeTarget(step.target as Target | undefined, projectors, groups)
  const params = step.params ?? {}
  switch (step.type) {
    case 'command': {
      const value = params.state ?? params.input ?? params.mode ?? params.value
      const dir = params.direction != null ? (Number(params.direction) > 0 ? ' +' : ' −') : ''
      return `${functionName(step.capability)}${value != null ? ` → ${String(value)}` : ''}${dir} · ${target}`
    }
    case 'wait_state':
      return `Wait until ${functionName(step.capability ?? 'power.get').replace(/ get$/, '').toLowerCase()} is ${step.expect ?? '?'} · ${target} (≤${step.timeout ?? 180}s)`
    case 'delay':
      return `Delay ${step.seconds ?? 0}s`
    case 'check_online':
      return `Check ${target} are responding`
    case 'check_faults':
      return `Check ${target} for faults`
    case 'check_enclosure':
      return `Check enclosure ${enclosures.find((e) => e.id === step.enclosure_id)?.name ?? step.enclosure_id ?? '?'}`
    case 'scene':
      return `Projector preset: ${scenes.find((s) => s.id === step.scene_id)?.name ?? step.scene_id ?? '?'}`
    case 'play_scene':
      return `Play scene: ${lights.scenes.find((s) => s.id === step.mapping_scene_id)?.name ?? 'choose one'}`
    case 'show': {
      if (step.action === 'stop') return 'Stop the show'
      const show = lights.shows.find((s) => s.id === step.show_id)
      if (!show) return 'Start the show'
      const index = step.cue_id == null ? -1 : show.cues.findIndex((c) => c.id === step.cue_id)
      return `Start “${show.name}”${index >= 0 ? ` at ${cueName(show.cues[index], index, lights)}` : ''}`
    }
    case 'notify':
      return `Notify: ${step.message || '(empty)'}`
    default:
      return step.type
  }
}
