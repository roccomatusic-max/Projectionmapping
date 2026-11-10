import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { EmptyState, Modal, Panel } from '@/components/ui'
import { classNames } from '@/lib/format'
import { type SceneGroup, type Tonight, tonightApi, whenText } from '@/lib/tonight'
import { mappingApi } from '../api'
import type { ServerClock } from '../live'
import type { PeopleTracker } from '../people'
import { KIND, layerLabel, STARTERS, type Starter, starterLayers } from '../scene/catalog'
import { MAX_LAYERS } from '../scene/library'
import { targetBox } from '../scene/masks'
import type {
  AiStatus, Cue, LayerTarget, MappingScene, MediaAsset, ObjectPin, SceneLayer, Show, SourceRect, SurfaceKind,
  TransportState,
} from '../types'
import { ElementLibrary } from './ElementLibrary'
import { outputColor } from './panels'
import { sceneOn } from './EachProjector'
import { type Backdrop, ScenePreview, SURFACE_KINDS } from './ScenePreview'
import { LayerCard, PLACEABLE, placingFor, SINGLE } from './ScenesPanel'

/** Scene edits are saved this long after the last change, as on the rest of the Scenes tab. */
const SAVE_DELAY_MS = 400

type Step = 'where' | 'look' | 'place' | 'send' | 'done'

const STEPS: Array<{ id: Exclude<Step, 'done'>; label: string }> = [
  { id: 'where', label: 'Where it goes' },
  { id: 'look', label: 'How it looks' },
  { id: 'place', label: 'Put things in place' },
  { id: 'send', label: 'Put it on the house' },
]

/** One projector, or all of them. */
type Where = { kind: 'all' } | { kind: 'output'; id: number }

/** Each kind of traced house part, as the "Where" a layer decorates. */
const PART_TARGET: Record<SurfaceKind, LayerTarget> = {
  wall: 'walls',
  roof: 'roof',
  window: 'windows',
  door: 'doors',
  ground: 'ground',
  other: 'building',
}

const PART_WORDS: Record<SurfaceKind, string> = {
  wall: 'the walls',
  roof: 'the roof',
  window: 'the windows',
  door: 'the doors',
  ground: 'the driveway',
  other: 'the other traced parts',
}

const WHOLE: SourceRect = { x: 0, y: 0, w: 1, h: 1 }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Where two boxes overlap, or null when they do not. */
function overlap(a: SourceRect, b: SourceRect): SourceRect | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const w = Math.min(a.x + a.w, b.x + b.w) - x
  const h = Math.min(a.y + a.h, b.y + b.h) - y
  return w > 0.005 && h > 0.005 ? { x, y, w, h } : null
}

/** The box around a traced part. */
function partBox(points: Array<[number, number]>): SourceRect {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/**
 * The part of the picture a new scene is made for: the projector's box,
 * narrowed to the chosen kind of house part inside it.
 */
function areaFor(show: Show, rect: SourceRect, part: SurfaceKind | null): SourceRect {
  if (!part) return rect
  const boxes = show.surfaces
    .filter((s) => s.kind === part)
    .map((s) => overlap(partBox(s.points), rect))
    .filter((b): b is SourceRect => b != null)
  if (!boxes.length) return rect
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y }
}

/** Pins given as fractions of ``from`` moved into ``to``, sized to match. */
function movePins(pins: ObjectPin[], to: SourceRect): ObjectPin[] {
  return pins.map((p) => ({
    ...p,
    x: clamp(to.x + p.x * to.w, 0, 1),
    y: clamp(to.y + p.y * to.h, 0, 1),
    size: clamp(p.size * to.h, 0.3, 3),
  }))
}

/** Layers whose "Where" can be set (not people-following ones, not ones placed by hand). */
function usesTarget(layer: SceneLayer) {
  const kind = KIND[layer.type]
  return !!kind && (kind.group !== 'people' || layer.type === 'particles') && layer.pins == null
}

/**
 * A ready-made scene fitted to where it goes: everything spread over an
 * area goes on the chosen part, and things put in a spot land inside the
 * projector's box (and the part), so nothing ends up where it cannot be seen.
 */
export function fitStarter(starter: Starter, show: Show, rect: SourceRect, part: SurfaceKind | null): SceneLayer[] {
  if (rect === WHOLE && !part) return starterLayers(starter, show.surfaces)
  const target = part ? PART_TARGET[part] : null
  // Without traced parts each pin stays a fraction of its area, to place here.
  const relative = starterLayers(starter, [])
  return relative.map((l) => {
    const layer = { ...l }
    if (target && usesTarget(layer)) layer.target = target
    if (layer.pins?.length) {
      const box = starter.placed
        ? overlap(targetBox(target ?? layer.target, show.surfaces), rect) ?? rect
        : areaFor(show, rect, part)
      layer.pins = movePins(layer.pins, box)
    }
    return layer
  })
}

/** A cue (or scene group) with ``sceneId`` put on one projector, or on all of them. */
function placed<T extends Pick<Cue, 'scene_id' | 'output_scenes'>>(item: T, where: Where, sceneId: number) {
  if (where.kind === 'all') return { scene_id: sceneId, output_scenes: {} as Record<string, number | null> }
  const own = { ...(item.output_scenes ?? {}) }
  if (item.scene_id === sceneId) delete own[String(where.id)]
  else own[String(where.id)] = sceneId
  return { scene_id: item.scene_id, output_scenes: own }
}

/** The scene groups tonight's show uses (and that set every cue when it starts). */
function tonightsGroupIds(tonight: Tonight | null): Set<number> {
  const ids = new Set<number>()
  if (!tonight) return ids
  tonight.tonight_slots.forEach((s) => s.group_id != null && ids.add(s.group_id))
  if (tonight.group_id != null && tonight.source !== 'calendar') ids.add(tonight.group_id)
  return ids
}

/**
 * Make a scene, start to finish: pick the projector (and the part of the
 * house) it goes on, pick how it looks, put things where they belong with
 * that projector's part of the house outlined, and put it there with one
 * button. It writes the same scenes, cues and scene groups as the rest of
 * the app, so everything made here also shows on the other Scenes pages.
 */
export function MakeScene({
  show,
  scenes,
  media,
  clock,
  cameraPeople,
  canEdit,
  ai,
  transport,
  hasHousePhoto,
  startWith,
  onError,
  reloadScenes,
  onShowChanged,
  onOpenScene,
}: {
  show: Show
  scenes: MappingScene[]
  media: MediaAsset[]
  clock: ServerClock
  cameraPeople: PeopleTracker
  canEdit: boolean
  ai: AiStatus | null
  transport: TransportState | null
  hasHousePhoto: boolean
  /** A scene to put somewhere (from "Put it on a projector" on Change a scene), and a projector picked already. */
  startWith: { sceneId: number | null; outputId: number | null }
  onError: (message: string | null) => void
  reloadScenes: () => Promise<void>
  onShowChanged: () => Promise<void> | void
  /** Open a scene on Change a scene, for every setting there is. */
  onOpenScene: (id: number) => void
}) {
  const outputs = useMemo(() => [...show.outputs].sort((a, b) => a.position - b.position), [show.outputs])
  const [where, setWhere] = useState<Where | null>(() => {
    if (startWith.outputId != null && show.outputs.some((o) => o.id === startWith.outputId)) {
      return { kind: 'output', id: startWith.outputId }
    }
    return show.outputs.length === 1 ? { kind: 'output', id: show.outputs[0].id } : null
  })
  const [part, setPart] = useState<SurfaceKind | null>(null)
  const [sceneId, setSceneId] = useState<number | null>(startWith.sceneId)
  const [step, setStep] = useState<Step>('where')
  const [busy, setBusy] = useState<string | null>(null)
  const [tonight, setTonight] = useState<Tonight | null>(null)
  const [groups, setGroups] = useState<SceneGroup[]>([])
  const [keepIn, setKeepIn] = useState<Set<number> | null>(null)
  const [done, setDone] = useState<string | null>(null)

  // A new "Put it on a projector" from Change a scene starts again with that scene.
  useEffect(() => {
    if (startWith.sceneId == null) return
    setSceneId(startWith.sceneId)
    setStep('where')
    setDone(null)
  }, [startWith.sceneId])

  const loadTonight = useCallback(async () => {
    try {
      const [t, g] = await Promise.all([tonightApi.get(), tonightApi.groups()])
      setTonight(t)
      setGroups(g.filter((x) => x.show_id === show.id))
    } catch {
      /* the page still works without it; the summary just says less */
    }
  }, [show.id])
  useEffect(() => {
    void loadTonight()
  }, [loadTonight])

  // -- the scene being made, saved shortly after each change
  const [draft, setDraft] = useState<MappingScene | null>(null)
  const saved = scenes.find((s) => s.id === sceneId) ?? null
  const scene = draft && draft.id === saved?.id ? draft : saved
  const saveTimer = useRef<number>()
  const serial = useRef(0)
  const pending = useRef<(() => Promise<void>) | null>(null)
  const change = (next: MappingScene) => {
    setDraft(next)
    const mine = ++serial.current
    window.clearTimeout(saveTimer.current)
    const write = async () => {
      pending.current = null
      try {
        await mappingApi.updateScene(next.id, { name: next.name, description: next.description, layers: next.layers })
        await reloadScenes()
        if (serial.current === mine) setDraft(null)
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Saving the scene failed')
      }
    }
    pending.current = write
    saveTimer.current = window.setTimeout(() => void write(), SAVE_DELAY_MS)
  }
  const flush = async () => {
    window.clearTimeout(saveTimer.current)
    await pending.current?.()
  }
  useEffect(() => () => {
    window.clearTimeout(saveTimer.current)
    void pending.current?.()
  }, [])

  const guard = async (label: string, work: () => Promise<unknown>) => {
    setBusy(label)
    try {
      await work()
      onError(null)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBusy(null)
    }
  }

  // -- where it goes
  const output = where?.kind === 'output' ? outputs.find((o) => o.id === where.id) ?? null : null
  const rect = output ? output.source : WHOLE
  const area = areaFor(show, rect, part)
  const whereName = where?.kind === 'all' ? 'every projector' : output?.name ?? ''
  const partsHere = useMemo(() => {
    const kinds = new Set<SurfaceKind>()
    show.surfaces.forEach((s) => overlap(partBox(s.points), rect) && kinds.add(s.kind))
    return SURFACE_KINDS.filter((k) => kinds.has(k.id))
  }, [show.surfaces, rect])
  useEffect(() => {
    if (part && !partsHere.some((k) => k.id === part)) setPart(null)
  }, [part, partsHere])

  // -- what each projector plays tonight
  const tonightIds = tonightsGroupIds(tonight)
  const tonightGroups = groups.filter((g) => tonightIds.has(g.id))
  const tonightShowId = tonight?.tonight_slots.find((s) => s.show_id != null)?.show_id ?? tonight?.show_id ?? null
  const otherShowTonight = tonightShowId != null && tonightShowId !== show.id
  const cues = useMemo(() => [...show.cues].sort((a, b) => a.position - b.position), [show.cues])
  const nameOf = (id: number | null) => (id == null ? 'nothing' : scenes.find((s) => s.id === id)?.name ?? 'a deleted scene')
  /** What a projector plays: tonight's scene group decides when the show starts, else the cues. */
  const plays = (outputId: number): string => {
    const group = tonightGroups[0]
    if (group) return nameOf(String(outputId) in group.output_scenes ? group.output_scenes[String(outputId)] : group.scene_id)
    if (!cues.length) return 'nothing yet'
    const each = new Set(cues.map((c) => sceneOn(c, outputId)))
    return each.size === 1 ? nameOf([...each][0]) : 'a different scene in each cue'
  }
  const keep = keepIn ?? new Set(tonightGroups.map((g) => g.id))

  const goTo = async (next: Step) => {
    await flush()
    setStep(next)
  }

  // -- how it looks
  const create = (name: string, description: string, layers: SceneLayer[]) =>
    guard('create', async () => {
      const taken = new Set(scenes.map((s) => s.name))
      let unique = name
      for (let n = 2; taken.has(unique); n++) unique = `${name} ${n}`
      const made = await mappingApi.createScene({ name: unique, description, layers })
      await reloadScenes()
      setSceneId(made.id)
      setStep('place')
    })

  const describe = (prompt: string) =>
    guard('describe', async () => {
      const said = part ? `${prompt}. Put it all on ${PART_WORDS[part]}.` : prompt
      const made = await mappingApi.describeScene({ prompt: said, show_id: show.id })
      // Things Claude put in a spot are moved into this projector's part of the house.
      if (rect !== WHOLE) {
        const layers = made.layers.map((l) => (l.pins?.length ? { ...l, pins: movePins(l.pins, area) } : l))
        await mappingApi.updateScene(made.id, { name: made.name, description: made.description, layers })
      }
      await reloadScenes()
      setSceneId(made.id)
      setStep('place')
    })

  // -- putting things in place
  const [openLayer, setOpenLayer] = useState<string | null>(null)
  const [selectedPin, setSelectedPin] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)
  useEffect(() => setSelectedPin(null), [openLayer, sceneId])
  const placingLayer = canEdit && step === 'place'
    ? scene?.layers.find((l) => l.id === openLayer && PLACEABLE.has(l.type) && l.pins)
    : undefined
  const pickedPin = selectedPin ?? (placingLayer && SINGLE.has(placingLayer.type) && placingLayer.pins!.length > 0 ? 0 : null)
  const placing = placingLayer ? placingFor(placingLayer, pickedPin) : null

  const updateLayer = (id: string, patch: Partial<SceneLayer>) =>
    scene && change({ ...scene, layers: scene.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) })

  /** Something new in the scene, inside this projector's part of the house, ready to place. */
  const addLayer = (layer: SceneLayer) => {
    if (!scene) return
    setPicking(false)
    if (scene.layers.length >= MAX_LAYERS) return
    const made = { ...layer }
    // A board or countdown starts in the middle of this projector's part, not of the whole picture.
    if (made.pins?.length) made.pins = movePins(made.pins.map((p) => ({ ...p, size: p.size / Math.max(0.3, area.h) })), area)
    if (part && usesTarget(made)) made.target = PART_TARGET[part]
    change({ ...scene, layers: [...scene.layers, made] })
    setOpenLayer(made.id)
  }

  // -- putting it on the house
  const playing = transport?.show_id === show.id && (transport.status === 'playing' || transport.status === 'paused')
  const send = () =>
    scene && where &&
    guard('send', async () => {
      await flush()
      if (!cues.length) {
        await mappingApi.createCue(show.id, {
          name: scene.name, media_id: null, loop: true,
          ...placed({ scene_id: null, output_scenes: {} }, where, scene.id),
        })
      }
      for (const cue of cues) await mappingApi.updateCue(cue.id, placed(cue, where, scene.id))
      // Tonight's scene group sets every cue when the show starts, so it has to say the same.
      for (const group of groups.filter((g) => keep.has(g.id))) {
        await tonightApi.updateGroup(group.id, placed(group, where, scene.id))
      }
      await onShowChanged()
      await loadTonight()
      setDone(scene.name)
      setStep('done')
    })

  const playNow = () => guard('play', () => mappingApi.command('goto', { show_id: show.id, cue: 0 }))

  // -- the picture: the house, every projector's box, and the chosen one bright
  const [backdrop, setBackdrop] = useState<Backdrop>(() => (show.camera_view ? { kind: 'camera' } : { kind: 'none' }))
  useEffect(() => {
    if (hasHousePhoto) setBackdrop({ kind: 'house' })
  }, [hasHousePhoto])
  const W = show.canvas_width
  const H = show.canvas_height
  const boxes = (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
      {where && (
        <path
          fillRule="evenodd"
          fill="rgba(2,6,23,0.65)"
          d={`M0 0H${W}V${H}H0Z M${rect.x * W} ${rect.y * H}h${rect.w * W}v${rect.h * H}h${-rect.w * W}Z`}
        />
      )}
      {where && part && (
        <>
          <clipPath id="make-scene-projector">
            <rect x={rect.x * W} y={rect.y * H} width={rect.w * W} height={rect.h * H} />
          </clipPath>
          <g clipPath="url(#make-scene-projector)">
            {show.surfaces.filter((s) => s.kind === part).map((s) => (
              <polygon key={s.id} points={s.points.map(([x, y]) => `${x * W},${y * H}`).join(' ')}
                fill={`${SURFACE_KINDS.find((k) => k.id === part)?.color}33`}
                stroke={SURFACE_KINDS.find((k) => k.id === part)?.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        </>
      )}
      {outputs.map((o, i) => {
        const chosen = where?.kind === 'all' || (where?.kind === 'output' && where.id === o.id)
        return (
          <g key={o.id} opacity={where && !chosen ? 0.45 : 1}>
            <rect x={o.source.x * W} y={o.source.y * H} width={o.source.w * W} height={o.source.h * H}
              fill="none" stroke={outputColor(i)} strokeWidth={chosen ? 4 : 2} strokeDasharray={chosen ? undefined : '10 6'}
              vectorEffect="non-scaling-stroke" />
            <text x={o.source.x * W + H / 80} y={o.source.y * H + H / 22} fill={outputColor(i)} fontSize={H / 26} fontWeight={700}
              stroke="rgba(2,6,23,0.8)" strokeWidth={H / 400} paintOrder="stroke">
              {o.name}
            </text>
          </g>
        )
      })}
    </svg>
  )

  const previewScene = step === 'where' || step === 'look' ? null : scene
  const preview = (
    <Panel
      title={where ? `What ${whereName === 'every projector' ? 'the projectors light' : `${whereName} lights`}` : 'Your house'}
      description={
        placingLayer
          ? placingLayer.type === 'movers'
            ? 'Click points on the picture, in order, for the path it follows. Drag a point to move it.'
            : `Click the picture to put ${layerLabel(placingLayer).toLowerCase()} there. Drag one to move it; click one to size or turn it.`
          : where
            ? part
              ? `The bright box is what ${where.kind === 'all' ? 'the projectors light' : `${whereName} lights`}; the scene goes on ${PART_WORDS[part]} outlined in it. The rest stays as it is.`
              : `The bright part is where ${where.kind === 'all' ? 'the scene' : 'it'} shows on the house. The rest stays as it is.`
            : 'Each coloured box is the part of the house one projector lights.'
      }
    >
      <ScenePreview
        show={show}
        scene={previewScene}
        media={media}
        clock={clock}
        cameraPeople={cameraPeople}
        peopleSource="simulated"
        count={previewScene ? 2 : 0}
        sendToProjectors={false}
        backdrop={backdrop}
        surfaces={show.surfaces}
        showSurfaces={false}
        drawing={null}
        onDrawingChange={() => undefined}
        onDrawingDone={() => undefined}
        onSurfacesChange={() => undefined}
        onSurfacesDone={() => undefined}
        placing={placing}
        onPinsChange={(pins, selected) => {
          if (!placingLayer) return
          updateLayer(placingLayer.id, { pins })
          setSelectedPin(selected)
        }}
        overlay={boxes}
      />
      {(show.camera_view || hasHousePhoto) && (
        <label className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
          Under it
          <select className="input w-auto py-1 text-xs" value={backdrop.kind}
            onChange={(e) => setBackdrop({ kind: e.target.value as 'none' | 'camera' | 'house' })}>
            {hasHousePhoto && <option value="house">Your photo of the house</option>}
            {show.camera_view && <option value="camera">The camera's photo of the house</option>}
            <option value="none">Black</option>
          </select>
        </label>
      )}
    </Panel>
  )

  if (outputs.length === 0) {
    return (
      <Panel>
        <EmptyState title="No projectors in this show yet"
          action={canEdit ? <Link className="btn-primary" to="/mapping/setup">Add a projector</Link> : undefined}>
          A scene goes on a projector. Add one for each projector that lights the house (Set up → Your projectors), then come
          back here.
        </EmptyState>
      </Panel>
    )
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step)
  const reached = (id: Step) => {
    if (id === 'where') return true
    if (id === 'look') return where != null
    return where != null && scene != null
  }

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((s, i) => {
          const current = s.id === step
          const finished = step === 'done' || i < stepIndex
          return (
            <li key={s.id}>
              <button
                className={classNames(
                  'flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ring-1',
                  current ? 'bg-sky-500/15 font-medium text-sky-50 ring-sky-400/50'
                    : finished ? 'text-slate-200 ring-white/10 hover:bg-white/[0.04]' : 'text-slate-500 ring-white/5',
                )}
                disabled={!canEdit || !reached(s.id) || busy != null}
                aria-current={current ? 'step' : undefined}
                onClick={() => void goTo(s.id)}
              >
                <span className={classNames(
                  'flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold',
                  current ? 'bg-sky-500 text-white' : finished ? 'bg-emerald-500/80 text-white' : 'bg-panel-800 text-slate-400',
                )}>
                  {finished && !current ? '✓' : i + 1}
                </span>
                {s.label}
              </button>
            </li>
          )
        })}
      </ol>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-w-0 space-y-4">
          {step === 'where' && (
            <Panel title="1. Where should it go?"
              description={scene
                ? `Pick the projector to put “${scene.name}” on.`
                : 'Pick the projector first. Its box on the picture is the part of the house it lights, so you see where the scene will be before you make it.'}>
              <div className="grid gap-2 sm:grid-cols-2">
                {outputs.map((o, i) => {
                  const chosen = where?.kind === 'output' && where.id === o.id
                  return (
                    <button key={o.id}
                      className={classNames('rounded-lg px-3 py-2.5 text-left ring-1 transition-colors',
                        chosen ? 'bg-sky-500/15 ring-sky-400/60' : 'bg-panel-850 ring-white/5 hover:bg-panel-800')}
                      disabled={!canEdit}
                      aria-pressed={chosen}
                      onClick={() => setWhere({ kind: 'output', id: o.id })}>
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-100">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: outputColor(i) }} />
                        {o.name}
                      </span>
                      <span className="mt-1 block text-xs text-slate-400">
                        {tonightGroups.length ? 'Tonight' : 'Plays'}: <span className="text-slate-200">{plays(o.id)}</span>
                      </span>
                    </button>
                  )
                })}
                {outputs.length > 1 && (
                  <button
                    className={classNames('rounded-lg px-3 py-2.5 text-left ring-1 transition-colors',
                      where?.kind === 'all' ? 'bg-sky-500/15 ring-sky-400/60' : 'bg-panel-850 ring-white/5 hover:bg-panel-800')}
                    disabled={!canEdit}
                    aria-pressed={where?.kind === 'all'}
                    onClick={() => setWhere({ kind: 'all' })}>
                    <span className="block text-sm font-medium text-slate-100">Every projector</span>
                    <span className="mt-1 block text-xs text-slate-400">One scene across the whole house</span>
                  </button>
                )}
              </div>

              {where && !scene && (
                <div className="mt-5">
                  <p className="text-sm font-medium text-slate-200">Which part of the house?</p>
                  {partsHere.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <PartChip label={where.kind === 'all' ? 'All of it' : `All that ${whereName} lights`} chosen={part == null}
                        disabled={!canEdit} onClick={() => setPart(null)} />
                      {partsHere.map((k) => (
                        <PartChip key={k.id} label={k.label} color={k.color} chosen={part === k.id} disabled={!canEdit}
                          onClick={() => setPart(k.id)} />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">
                      All of it. To put a scene on just the roof, the windows or the driveway, trace them once
                      in <Link className="text-sky-300 hover:underline" to="/mapping/setup?part=house">Set up → Your house</Link> or
                      let Claude find them in <Link className="text-sky-300 hover:underline" to="/mapping/setup?part=photo">Start from a photo</Link>.
                    </p>
                  )}
                </div>
              )}

              {canEdit && (
                <div className="mt-5 flex justify-end">
                  <button className="btn-primary" disabled={!where}
                    onClick={() => void goTo(scene ? 'place' : 'look')}>
                    {scene ? 'Next: put things in place →' : 'Next: pick how it looks →'}
                  </button>
                </div>
              )}
            </Panel>
          )}

          {step === 'look' && where && (
            <Panel title="2. How should it look?"
              description={`For ${whereName}${part ? `, on ${PART_WORDS[part]}` : ''}. Pick a ready-made scene to change as you like, start empty, or reuse one you made before.`}
              action={<button className="btn-ghost px-2 py-1 text-xs" onClick={() => setStep('where')}>← Back</button>}>
              {busy === 'describe' && (
                <p className="mb-3 rounded-md bg-sky-500/10 px-3 py-2 text-sm text-sky-100 ring-1 ring-sky-500/30">
                  Claude is designing the scene. It appears here in up to a minute.
                </p>
              )}
              {ai?.available ? (
                <DescribeIt busy={busy != null} onSubmit={(prompt) => void describe(prompt)} />
              ) : ai ? (
                <p className="mb-3 text-xs text-slate-500">
                  To describe a scene in plain words instead, add an Anthropic API key in{' '}
                  <Link className="text-sky-300 hover:underline" to="/settings?part=ai">Settings → AI keys</Link>. Everything
                  else works without one.
                </p>
              ) : null}

              <div className="space-y-3">
                {occasionsFor(part).map((occasion) => (
                  <div key={occasion}>
                    <p className="mb-1 mt-2 text-[11px] uppercase tracking-wide text-slate-500">{occasion}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {STARTERS.filter((s) => s.occasion === occasion).map((starter) => (
                        <button key={starter.name}
                          className="rounded-md bg-panel-850 px-3 py-2 text-left ring-1 ring-white/5 hover:bg-panel-800 disabled:opacity-50"
                          disabled={busy != null}
                          onClick={() => void create(starter.name, starter.description, fitStarter(starter, show, rect, part))}>
                          <span className="block text-sm text-slate-100">{starter.name}</span>
                          <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{starter.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {scenes.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">One of my scenes</p>
                  <div className="flex flex-wrap gap-2">
                    {scenes.map((s) => (
                      <button key={s.id} className="rounded-md bg-panel-850 px-3 py-1.5 text-sm text-slate-200 ring-1 ring-white/5 hover:bg-panel-800"
                        disabled={busy != null}
                        onClick={() => {
                          setSceneId(s.id)
                          setStep('place')
                        }}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 border-t border-white/[0.06] pt-3">
                <button className="btn-default" disabled={busy != null}
                  onClick={() => void create(output ? `${output.name} scene` : 'New scene', '', [])}>
                  Start empty and add things myself
                </button>
              </div>
            </Panel>
          )}

          {step === 'place' && where && scene && (
            <Panel title="3. Put things in place"
              description={`“${scene.name}” on ${whereName}${part ? `, ${PART_WORDS[part]}` : ''}. Press Edit on a thing to move it on the picture or change its colours. Every change saves by itself.`}
              action={<button className="btn-ghost px-2 py-1 text-xs" onClick={() => void goTo(sceneId === startWith.sceneId ? 'where' : 'look')}>← Back</button>}>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <label className="block">
                  <span className="label">Name</span>
                  <input className="input" value={scene.name} maxLength={128} disabled={!canEdit}
                    onChange={(e) => e.target.value.trim() && change({ ...scene, name: e.target.value })} />
                </label>
                {canEdit && (
                  <button className="btn-default inline-flex items-center gap-1.5" disabled={scene.layers.length >= MAX_LAYERS}
                    title={scene.layers.length >= MAX_LAYERS ? `A scene holds up to ${MAX_LAYERS} things; take one out to add another.` : undefined}
                    onClick={() => setPicking(true)}>
                    <Plus size={14} aria-hidden /> Add something…
                  </button>
                )}
              </div>
              <Modal open={picking} label="Add something" size="lg" className="sm:max-w-4xl" onClose={() => setPicking(false)}>
                <div className="p-4 sm:p-5">
                  <h2 className="mb-1 text-base font-semibold text-slate-100">Add something</h2>
                  <p className="mb-3 text-xs text-slate-400">
                    It goes in this scene, which plays on every cue where you put it. To put something on one cue only,
                    or on every cue whatever scene plays, add it in{' '}
                    <Link to="/mapping/designer?part=elements" className="text-sky-300 hover:underline">Show designer → Elements</Link>.
                  </p>
                  <ElementLibrary onPick={addLayer} />
                </div>
              </Modal>
              {scene.layers.length === 0 ? (
                <p className="mt-4 rounded-md bg-panel-850 px-3 py-3 text-sm text-slate-400 ring-1 ring-white/5">
                  Nothing in it yet. Press <span className="text-slate-200">Add something</span> and pick one, then click the
                  picture to put it there.
                </p>
              ) : (
                <ol className="mt-4 space-y-2">
                  {[...scene.layers].reverse().map((layer, shownIndex) => (
                    <LayerCard
                      key={layer.id}
                      layer={layer}
                      media={media}
                      open={openLayer === layer.id}
                      selectedPin={openLayer === layer.id ? pickedPin : null}
                      onSelectPin={setSelectedPin}
                      hasHouse={show.surfaces.length > 0}
                      canEdit={canEdit}
                      isTop={shownIndex === 0}
                      isBottom={shownIndex === scene.layers.length - 1}
                      onToggle={() => setOpenLayer((v) => (v === layer.id ? null : layer.id))}
                      onChange={(patch) => updateLayer(layer.id, patch)}
                      onMove={(up) => {
                        const layers = [...scene.layers]
                        const i = layers.findIndex((l) => l.id === layer.id)
                        const j = i + (up ? 1 : -1)
                        if (j < 0 || j >= layers.length) return
                        ;[layers[i], layers[j]] = [layers[j], layers[i]]
                        change({ ...scene, layers })
                      }}
                      onDuplicate={() => {
                        const i = scene.layers.findIndex((l) => l.id === layer.id)
                        const copy = { ...layer, id: Math.random().toString(36).slice(2, 10) }
                        change({ ...scene, layers: [...scene.layers.slice(0, i + 1), copy, ...scene.layers.slice(i + 1)] })
                      }}
                      onDelete={() => change({ ...scene, layers: scene.layers.filter((l) => l.id !== layer.id) })}
                    />
                  ))}
                </ol>
              )}
              {canEdit && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => void flush().then(() => onOpenScene(scene.id))}>
                    More settings and Save as video
                  </button>
                  <button className="btn-primary" onClick={() => void goTo('send')}>
                    Next: put it on the house →
                  </button>
                </div>
              )}
            </Panel>
          )}

          {step === 'send' && where && scene && (
            <Panel title="4. Put it on the house"
              action={<button className="btn-ghost px-2 py-1 text-xs" onClick={() => setStep('place')}>← Back</button>}>
              <p className="text-base text-slate-100">
                {where.kind === 'all'
                  ? <>Every projector will play <b>{scene.name}</b>.</>
                  : <><b>{output?.name}</b> will play <b>{scene.name}</b>.</>}
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
                {outputs.map((o, i) => {
                  const mine = where.kind === 'all' || o.id === output?.id
                  return (
                    <li key={o.id} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: outputColor(i) }} />
                      <span className="w-32 shrink-0 truncate text-slate-400">{o.name}</span>
                      {mine
                        ? <span className="text-emerald-300">{scene.name} (new)</span>
                        : <span>keeps {plays(o.id)}</span>}
                    </li>
                  )
                })}
              </ul>
              <p className="mt-3 text-xs text-slate-500">
                {cues.length > 1 ? `It goes in all ${cues.length} cues of the show “${show.name}”` : `It goes in the show “${show.name}”`}
                {playing ? ', and shows on the house straight away, because the show is playing.' : '.'}
                {tonight?.starts_at && !otherShowTonight && ` Tonight's show starts ${whenText(tonight.starts_at)}.`}
              </p>
              {otherShowTonight && (
                <p className="mt-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-200 ring-1 ring-amber-500/30">
                  Tonight's show plays a different show, not “{show.name}”. Pick that show at the top of the page first if
                  you want it there tonight.
                </p>
              )}
              {groups.length > 0 && (
                <div className="mt-4 rounded-md bg-panel-850 p-3 ring-1 ring-white/5">
                  <p className="text-sm text-slate-200">Also keep it in these scene groups</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    A scene group sets every projector when the show starts. Tonight's is ticked, so the show starts with
                    this scene.
                  </p>
                  <div className="mt-2 space-y-1">
                    {groups.map((g) => (
                      <label key={g.id} className="flex items-center gap-2 text-sm text-slate-300">
                        <input type="checkbox" className="accent-sky-500" checked={keep.has(g.id)}
                          onChange={(e) => {
                            const next = new Set(keep)
                            if (e.target.checked) next.add(g.id)
                            else next.delete(g.id)
                            setKeepIn(next)
                          }} />
                        {g.name}
                        {tonightIds.has(g.id) && <span className="text-2xs text-emerald-300">tonight</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {canEdit && (
                <div className="mt-5 flex justify-end">
                  <button className="btn-primary px-5 py-2.5 text-base" disabled={busy != null} onClick={() => void send()}>
                    {busy === 'send' ? 'Putting it there…' : where.kind === 'all' ? 'Put it on every projector' : `Put it on ${output?.name}`}
                  </button>
                </div>
              )}
            </Panel>
          )}

          {step === 'done' && (
            <Panel title="Done">
              <p className="text-base text-slate-100">
                <b>{whereName === 'every projector' ? 'Every projector' : whereName}</b> plays <b>{done}</b> from now on.
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {playing
                  ? 'The show is playing, so it is on the house now.'
                  : otherShowTonight
                    ? 'It plays whenever this show plays.'
                    : tonight?.starts_at
                      ? `You will see it when tonight's show starts, ${whenText(tonight.starts_at)}.`
                      : 'You will see it when the show plays.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {!playing && canEdit && (
                  <button className="btn-default" disabled={busy != null} onClick={() => void playNow()}>
                    Play it on the house now
                  </button>
                )}
                <button className="btn-primary" onClick={() => {
                  setSceneId(null)
                  setDone(null)
                  setPart(null)
                  setStep('where')
                }}>
                  Make another scene
                </button>
                {scene && (
                  <button className="btn-ghost" onClick={() => setStep('place')}>Change it some more</button>
                )}
              </div>
            </Panel>
          )}
        </div>

        <div className="min-w-0 xl:sticky xl:top-[calc(var(--shell-top,3rem)+var(--mapping-bar,0px)+0.5rem)]">{preview}</div>
      </div>
    </div>
  )
}

/** Starter headings, the driveway ones first when the scene is for the driveway (and last otherwise). */
function occasionsFor(part: SurfaceKind | null): string[] {
  const all = [...new Set(STARTERS.map((s) => s.occasion))]
  const drive = all.filter((o) => o === 'On the driveway')
  const rest = all.filter((o) => o !== 'On the driveway')
  return part === 'ground' ? [...drive, ...rest] : [...rest, ...drive]
}

function PartChip({ label, color, chosen, disabled, onClick }: {
  label: string
  color?: string
  chosen: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      className={classNames('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ring-1',
        chosen ? 'bg-sky-500/15 text-sky-50 ring-sky-400/60' : 'bg-panel-850 text-slate-300 ring-white/10 hover:bg-panel-800')}
      aria-pressed={chosen}
      disabled={disabled}
      onClick={onClick}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {label}
    </button>
  )
}

function DescribeIt({ busy, onSubmit }: { busy: boolean; onSubmit: (prompt: string) => void }) {
  const [text, setText] = useState('')
  return (
    <form className="mb-4 rounded-md bg-panel-850 p-3 ring-1 ring-white/5"
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim().length >= 3) onSubmit(text.trim())
      }}>
      <p className="mb-2 text-sm font-medium text-slate-200">Describe it in words</p>
      <textarea className="input min-h-0 text-sm" rows={2} maxLength={2000} value={text} disabled={busy}
        placeholder="Ghosts that wave at people and pumpkins that glow when someone walks up"
        onChange={(e) => setText(e.target.value)} />
      <button className="btn-primary mt-2 px-3 py-1 text-xs" disabled={busy || text.trim().length < 3}>Make it</button>
    </form>
  )
}
