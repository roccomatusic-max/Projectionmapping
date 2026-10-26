import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ConfirmDialog, EmptyState, Modal, Panel, SectionBar } from '@/components/ui'
import { classNames } from '@/lib/format'
import { mappingApi } from '../api'
import type { ServerClock } from '../live'
import type { PeopleTracker } from '../people'
import {
  BLENDS,
  CHANGES,
  changeOf,
  KIND,
  LAYER_KINDS,
  layerLabel,
  MOTIONS,
  motionOf,
  NEARS,
  nearOf,
  newLayer,
  normaliseLayer,
  REACTIONS,
  STARTERS,
  TARGETS,
} from '../scene/catalog'
import type { Dial } from '../scene/catalog'
import { countdownPinHeight, DESIGN_H, DESIGN_W } from '../scene/countdown'
import { objectRadius } from '../scene/engine'
import { startingSquare } from '../scene/flat'
import type { AiStatus, LayerType, MappingScene, MediaAsset, Point, SceneLayer, Show, Surface, SurfaceKind } from '../types'
import { Slider } from './controls'
import { CornerPicker } from './CornerPicker'
import { CountdownColorPickers, countdownLook } from './CountdownColors'
import { PaintHouse } from './PaintHouse'
import { ProjectorScenes, sceneOn } from './ProjectorScenes'
import { type Backdrop, type Drawing, type PeopleSource, ScenePreview, SURFACE_KINDS } from './ScenePreview'
import { SceneRecorder } from './SceneRecorder'

/** Scene edits are saved this long after the last change. */
const SAVE_DELAY_MS = 400
const SCENE_KEY = 'pc.mapping.scene'
/** How long a part's checkerboard square stays on the projectors after the last change. */
const FLAT_TEST_MS = 10 * 60 * 1000
/** While a corner is dragged, the projectors follow this often. */
const FLAT_SEND_MS = 600
const DIALS: Dial[] = ['size', 'amount', 'speed', 'fade']

type ScenePart = 'edit' | 'house' | 'projectors' | 'paint'

/** The Scenes tab, one part at a time; the preview stays beside the part that needs it. */
export const SCENE_PARTS: Array<{ id: ScenePart; label: string; hint: string }> = [
  { id: 'edit', label: 'Make and change scenes', hint: 'Your scenes, their layers, and a live preview' },
  { id: 'projectors', label: 'Scenes on each projector', hint: 'A different scene, or none, on one projector in a cue' },
  { id: 'house', label: 'House parts', hint: 'Trace the walls, roof, windows and doors so scenes can decorate each one' },
  { id: 'paint', label: 'Paint the house (Beta)', hint: 'An AI repaints a photo of your house as you describe it' },
]

/** Layers whose things can be placed by hand on the preview. */
export const PLACEABLE = new Set<LayerType>(['shapes', 'countdown'])

/** What the preview needs to place, pick, size and turn a layer's things. */
export function placingFor(layer: SceneLayer, selected: number | null) {
  if (layer.type === 'countdown') {
    // One countdown, a rectangle the shape of its artwork.
    const h = countdownPinHeight(layer.size)
    const w = (h * DESIGN_W) / DESIGN_H
    return { pins: layer.pins!, radius: Math.hypot(w, h) / 2, box: { w, h }, max: 1, selected }
  }
  return { pins: layer.pins!, radius: objectRadius(layer.size), selected }
}

/**
 * Scenes: reactive designs made of layers (a glow around each person,
 * gingerbread on the walls, snow falling…), tried live on simulated people
 * and played as cues like media.
 */
export function ScenesPanel({
  show,
  scenes,
  media,
  clock,
  cameraPeople,
  canEdit,
  onError,
  reloadScenes,
  reloadMedia,
  onShowChanged,
}: {
  show: Show
  scenes: MappingScene[]
  media: MediaAsset[]
  clock: ServerClock
  cameraPeople: PeopleTracker
  canEdit: boolean
  onError: (message: string | null) => void
  reloadScenes: () => Promise<void>
  reloadMedia: () => Promise<unknown>
  onShowChanged: () => Promise<void> | void
}) {
  const [search, setSearch] = useSearchParams()
  const part: ScenePart = SCENE_PARTS.find((p) => p.id === search.get('part'))?.id ?? 'edit'
  const setPart = (id: ScenePart) => setSearch(id === 'edit' ? {} : { part: id }, { replace: true })
  const [starting, setStarting] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(() => Number(localStorage.getItem(SCENE_KEY)) || null)
  const [drafts, setDrafts] = useState<Map<number, MappingScene>>(new Map())
  const [ai, setAi] = useState<AiStatus | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<MappingScene | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [openLayer, setOpenLayer] = useState<string | null>(null)
  const [selectedPin, setSelectedPin] = useState<number | null>(null)
  useEffect(() => setSelectedPin(null), [openLayer, selectedId])
  const saveTimers = useRef(new Map<number, number>())
  const serials = useRef(new Map<number, number>())

  // Preview settings.
  const [peopleSource, setPeopleSource] = useState<PeopleSource>('simulated')
  const [count, setCount] = useState(3)
  const [sendToProjectors, setSendToProjectors] = useState(false)
  const [backdrop, setBackdrop] = useState<Backdrop>(() => (show.camera_view ? { kind: 'camera' } : { kind: 'none' }))
  const [fps, setFps] = useState<{ fps: number; scale: number | null } | null>(null)

  // House parts.
  const [surfaces, setSurfaces] = useState<Surface[]>(show.surfaces)
  const [tracing, setTracing] = useState(false)
  const [drawing, setDrawing] = useState<Drawing | null>(null)
  // The part whose corners are being set (a sloped roof), and whether a corner is held.
  const [straightening, setStraightening] = useState<string | null>(null)
  const holding = useRef(false)
  const surfacesRef = useRef(surfaces)
  surfacesRef.current = surfaces
  useEffect(() => {
    // A save while dragging comes back a moment behind the mouse: keep the mouse's.
    if (!holding.current) setSurfaces(show.surfaces)
  }, [show.id, show.surfaces])

  const list = useMemo(() => scenes.map((s) => drafts.get(s.id) ?? s), [scenes, drafts])
  // Nothing picked yet (or the picked one was deleted): show the first.
  const scene = list.find((s) => s.id === selectedId) ?? list[0] ?? null

  useEffect(() => {
    if (selectedId != null) localStorage.setItem(SCENE_KEY, String(selectedId))
  }, [selectedId])

  useEffect(() => {
    mappingApi.aiStatus().then(setAi).catch(() => setAi(null))
  }, [])

  // Stop sending made-up people when leaving the tab.
  useEffect(() => () => setSendToProjectors(false), [])

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

  const change = useCallback(
    (target: MappingScene, patch: Partial<MappingScene>) => {
      const next = { ...target, ...patch }
      setDrafts((map) => new Map(map).set(next.id, next))
      const serial = (serials.current.get(next.id) ?? 0) + 1
      serials.current.set(next.id, serial)
      window.clearTimeout(saveTimers.current.get(next.id))
      saveTimers.current.set(
        next.id,
        window.setTimeout(async () => {
          try {
            await mappingApi.updateScene(next.id, { name: next.name, description: next.description, layers: next.layers })
            await reloadScenes()
            if (serials.current.get(next.id) === serial) {
              setDrafts((map) => {
                const copy = new Map(map)
                copy.delete(next.id)
                return copy
              })
            }
          } catch (err) {
            onError(err instanceof Error ? err.message : 'Saving the scene failed')
          }
        }, SAVE_DELAY_MS),
      )
    },
    [onError, reloadScenes],
  )

  const create = (name: string, description: string, layers: SceneLayer[]) =>
    guard('create', async () => {
      const taken = new Set(scenes.map((s) => s.name))
      let unique = name
      for (let n = 2; taken.has(unique); n++) unique = `${name} ${n}`
      const created = await mappingApi.createScene({ name: unique, description, layers })
      await reloadScenes()
      setSelectedId(created.id)
    })

  const addToCues = (target: MappingScene) =>
    guard('cue', async () => {
      await mappingApi.createCue(show.id, { name: target.name, scene_id: target.id, media_id: null, loop: true })
      await onShowChanged()
    })

  const describe = (prompt: string, target: MappingScene | null) =>
    guard(target ? 'change' : 'describe', async () => {
      const made = await mappingApi.describeScene({ prompt, show_id: show.id, scene_id: target?.id })
      if (target) {
        setDrafts((map) => {
          const copy = new Map(map)
          copy.delete(target.id)
          return copy
        })
      }
      await reloadScenes()
      setSelectedId(made.id)
    })

  /**
   * A painting starts a scene of its own: the picture, with sparkles that
   * follow people on top. Other effects can be added to it, and the picture
   * can be added to any other scene as a Picture layer.
   */
  const addPainting = async (asset: MediaAsset, prompt: string) => {
    await reloadMedia()
    const name = prompt.length > 40 ? `${prompt.slice(0, 40).trimEnd()}…` : prompt
    await create(`Painted: ${name}`, prompt, [
      newLayer('picture', { media_id: asset.id, name: 'Painted house', target: surfaces.length ? 'building' : 'everywhere' }),
      newLayer('particles', { name: 'Sparkles from people', style: 'sparks', color: '#fff7c2', color2: '#ffd166', amount: 0.4, reacts_to: 'movement', reaction: 0.6 }),
    ])
  }

  const saveSurfaces = (next: Surface[]) =>
    guard('surfaces', async () => {
      await mappingApi.saveSurfaces(show.id, next)
      await onShowChanged()
    })

  // -- straightening a part: its four corners and the checkerboard on the projectors
  const flatTimer = useRef<number>()
  const flatSentAt = useRef(0)
  const setFlatCorners = (id: string, corners: Point[] | null, how: 'drag' | 'save' | 'finish') => {
    const flat = corners ? { corners, test_until: how === 'finish' ? null : clock.now() + FLAT_TEST_MS } : null
    const next = surfacesRef.current.map((s) => (s.id === id ? { ...s, flat } : s))
    surfacesRef.current = next
    setSurfaces(next)
    holding.current = how === 'drag'
    window.clearTimeout(flatTimer.current)
    if (how !== 'drag') {
      void saveSurfaces(next)
      return
    }
    // While dragging, the projectors follow a couple of times a second.
    flatTimer.current = window.setTimeout(() => {
      flatSentAt.current = Date.now()
      mappingApi.saveSurfaces(show.id, surfacesRef.current).catch((err) =>
        onError(err instanceof Error ? err.message : 'Saving the corners failed'))
    }, Math.max(0, flatSentAt.current + FLAT_SEND_MS - Date.now()))
  }
  const finishStraightening = () => {
    const part = surfacesRef.current.find((s) => s.id === straightening)
    if (part?.flat) setFlatCorners(part.id, part.flat.corners, 'finish')
    setStraightening(null)
  }
  // Keep the checkerboard on while the corners are still being looked at.
  useEffect(() => {
    if (!straightening) return
    const timer = window.setInterval(() => {
      const part = surfacesRef.current.find((s) => s.id === straightening)
      if (part?.flat) setFlatCorners(part.id, part.flat.corners, 'save')
    }, FLAT_TEST_MS / 2)
    return () => window.clearInterval(timer)
  }, [straightening]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => window.clearTimeout(flatTimer.current), [])

  // Tracing and straightening belong to House parts; leaving it puts the preview back to normal.
  useEffect(() => {
    if (part !== 'house') {
      setTracing(false)
      setDrawing(null)
      if (straightening) finishStraightening()
    }
  }, [part]) // eslint-disable-line react-hooks/exhaustive-deps
  const straightPart = surfaces.find((s) => s.id === straightening) ?? null

  const finishDrawing = () => {
    if (!drawing || drawing.points.length < 3) {
      setDrawing(null)
      return
    }
    const same = surfaces.filter((s) => s.kind === drawing.kind).length
    const label = SURFACE_KINDS.find((k) => k.id === drawing.kind)!.label
    const next = [
      ...surfaces,
      { id: Math.random().toString(36).slice(2, 10), name: `${label} ${same + 1}`, kind: drawing.kind, points: drawing.points },
    ]
    setSurfaces(next)
    setDrawing(null)
    void saveSurfaces(next)
  }

  const updateLayer = (target: MappingScene, id: string, patch: Partial<SceneLayer>) =>
    change(target, { layers: target.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) })

  const moveLayer = (target: MappingScene, id: string, delta: number) => {
    const layers = [...target.layers]
    const i = layers.findIndex((l) => l.id === id)
    const j = i + delta
    if (j < 0 || j >= layers.length) return
    ;[layers[i], layers[j]] = [layers[j], layers[i]]
    change(target, { layers })
  }

  const addLayer = (target: MappingScene, type: LayerType) => {
    const layer = newLayer(type)
    change(target, { layers: [...target.layers, layer] })
    setOpenLayer(layer.id)
  }

  const hasHouse = surfaces.length > 0
  // An open objects layer that is placed by hand turns clicks on the preview into placing.
  const placingLayer = canEdit ? scene?.layers.find((l) => l.id === openLayer && PLACEABLE.has(l.type) && l.pins) : undefined
  // A lone countdown is always the picked one, so its handles show at once.
  const pickedPin = selectedPin ?? (placingLayer?.type === 'countdown' && placingLayer.pins!.length > 0 ? 0 : null)
  const placing = placingLayer ? placingFor(placingLayer, pickedPin) : null

  const inShow = (target: MappingScene) =>
    show.cues.some((c) => show.outputs.some((o) => sceneOn(c, o.id) === target.id) || c.scene_id === target.id)

  const startFrom = async (name: string, description: string, layers: SceneLayer[]) => {
    setStarting(false)
    await create(name, description, layers)
    setPart('edit')
  }

  return (
    <div className="space-y-4">
      <SectionBar label="Scenes sections" value={part} onChange={setPart} sections={SCENE_PARTS.filter((p) => p.id !== 'paint' || canEdit)} />

      {part === 'projectors' && (
        <ProjectorScenes show={show} scenes={list} canEdit={canEdit} onChanged={onShowChanged} onError={onError} />
      )}

      {part === 'paint' && canEdit && (
        <PaintHouse show={{ ...show, surfaces }} media={media} busy={busy != null}
          onPainted={async (asset, prompt) => {
            await addPainting(asset, prompt)
            setPart('edit')
          }} onError={onError} />
      )}

      {(part === 'edit' || part === 'house') && (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="min-w-0 space-y-4">
            {part === 'edit' && (
              <>
                <Panel
                  title="Your scenes"
                  description="Pick one to change it and see it in the preview. Add to cues makes it play when GO reaches it."
                  action={
                    canEdit ? (
                      <button className="btn-primary px-3 py-1 text-xs" disabled={busy != null} onClick={() => setStarting(true)}>
                        New scene
                      </button>
                    ) : undefined
                  }
                >
                  {list.length === 0 ? (
                    <EmptyState
                      title="No scenes yet"
                      action={
                        canEdit ? (
                          <button className="btn-primary" onClick={() => setStarting(true)}>
                            Start a new scene
                          </button>
                        ) : undefined
                      }
                    >
                      Start from a ready-made scene (Halloween, Christmas, a party…) or a blank one.
                    </EmptyState>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {list.map((s) => (
                        <li key={s.id}>
                          <button
                            className={classNames(
                              'rounded-md px-3 py-1.5 text-left text-sm ring-1',
                              s.id === scene?.id ? 'bg-sky-500/15 text-sky-50 ring-sky-500/40' : 'bg-panel-850 text-slate-200 ring-white/5 hover:bg-panel-800',
                            )}
                            title={`${s.layers.length} layer${s.layers.length === 1 ? '' : 's'}${inShow(s) ? ', used in this show' : ''}`}
                            onClick={() => setSelectedId(s.id)}
                          >
                            {s.name}
                            {inShow(s) && <span className="ml-1.5 text-2xs text-emerald-300">in show</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                {scene ? (
                  <Panel
                    title="Change this scene"
                    action={
                      canEdit ? (
                        <div className="flex gap-2">
                          <button className="btn-primary px-3 py-1 text-xs" disabled={busy != null} onClick={() => void addToCues(scene)}>
                            Add to cues
                          </button>
                          <button className="btn-ghost px-2 py-1 text-xs" disabled={busy != null}
                            onClick={() => void create(scene.name, scene.description, scene.layers.map((l) => ({ ...l })))}>
                            Duplicate
                          </button>
                          <button className="btn-ghost px-2 py-1 text-xs text-red-300" onClick={() => setConfirmDelete(scene)}>
                            Delete
                          </button>
                        </div>
                      ) : undefined
                    }
                  >
                    <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
                      <label className="block">
                        <span className="label">Name</span>
                        <input className="input" value={scene.name} disabled={!canEdit} maxLength={128}
                          onChange={(e) => e.target.value.trim() && change(scene, { name: e.target.value })} />
                      </label>
                      <label className="block">
                        <span className="label">Description</span>
                        <input className="input" value={scene.description} disabled={!canEdit}
                          onChange={(e) => change(scene, { description: e.target.value })} />
                      </label>
                    </div>

                    {canEdit && ai?.available && (
                      <div className="mt-4">
                        <DescribeBox
                          placeholder="Change it in words: make the snow heavier, and the trails red"
                          busy={busy === 'change'}
                          disabled={busy != null}
                          action="Change scene"
                          compact
                          onSubmit={(prompt) => void describe(prompt, scene)}
                        />
                      </div>
                    )}

                    <div className="mt-5 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-200">Layers</h3>
                      {canEdit && (
                        <select className="input w-auto max-w-[15rem] py-1 text-xs" value="" title="Add an effect to this scene"
                          onChange={(e) => e.target.value && addLayer(scene, e.target.value as LayerType)}>
                          <option value="">Add a layer…</option>
                          <optgroup label="Follow people">
                            {LAYER_KINDS.filter((k) => k.group === 'people').map((k) => (
                              <option key={k.type} value={k.type}>{k.label}: {k.about}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Objects that react to people">
                            {LAYER_KINDS.filter((k) => k.group === 'objects').map((k) => (
                              <option key={k.type} value={k.type}>{k.label}: {k.about}</option>
                            ))}
                          </optgroup>
                        </select>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">The top layer draws over the ones below it.</p>
                    {scene.layers.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-500">No layers yet. Add one above.</p>
                    ) : (
                      <ol className="mt-3 space-y-2">
                        {[...scene.layers].reverse().map((layer, shownIndex) => (
                          <LayerCard
                            key={layer.id}
                            layer={layer}
                            media={media}
                            open={openLayer === layer.id}
                            selectedPin={openLayer === layer.id ? pickedPin : null}
                            onSelectPin={setSelectedPin}
                            hasHouse={hasHouse}
                            canEdit={canEdit}
                            isTop={shownIndex === 0}
                            isBottom={shownIndex === scene.layers.length - 1}
                            onToggle={() => setOpenLayer((v) => (v === layer.id ? null : layer.id))}
                            onChange={(patch) => updateLayer(scene, layer.id, patch)}
                            onMove={(up) => moveLayer(scene, layer.id, up ? 1 : -1)}
                            onDuplicate={() => {
                              const copy = { ...layer, id: newLayer(layer.type).id }
                              const i = scene.layers.findIndex((l) => l.id === layer.id)
                              change(scene, { layers: [...scene.layers.slice(0, i + 1), copy, ...scene.layers.slice(i + 1)] })
                            }}
                            onDelete={() => change(scene, { layers: scene.layers.filter((l) => l.id !== layer.id) })}
                          />
                        ))}
                      </ol>
                    )}

                    {canEdit && (
                      <div className="mt-5 border-t border-white/[0.06] pt-4">
                        <h3 className="mb-2 text-sm font-semibold text-slate-200">Save as video</h3>
                        <SceneRecorder
                          key={scene.id}
                          show={{ ...show, surfaces }}
                          scene={scene}
                          clock={clock}
                          onDone={() => void reloadMedia()}
                          onError={onError}
                        />
                      </div>
                    )}
                  </Panel>
                ) : list.length > 0 ? (
                  <Panel>
                    <EmptyState title="Pick a scene above">
                      Scenes are layers of light that react to people: glows and trails that follow them, sparks,
                      ripples, shadows, and looks for the building like gingerbread, snow, ice or string lights.
                    </EmptyState>
                  </Panel>
                ) : null}
              </>
            )}

            {part === 'house' && (
              <Panel
                title="House parts"
                description={
                  hasHouse
                    ? 'Traced on the canvas, so scenes can decorate walls, roof, windows and doors separately.'
                    : 'Trace the walls, roof, windows and doors, so scenes can decorate each part. Without them, scenes cover the whole picture.'
                }
                action={
                  canEdit ? (
                    <button className={classNames('text-xs', tracing ? 'btn-primary' : 'btn-default')} onClick={() => {
                      setTracing((v) => !v)
                      setDrawing(null)
                    }}>
                      {tracing ? 'Done' : 'Trace'}
                    </button>
                  ) : undefined
                }
              >
                {tracing && (
                  <div className="mb-3 space-y-2">
                    {drawing ? (
                      <div className="space-y-2 rounded-md bg-panel-850 p-2 text-xs text-slate-300 ring-1 ring-white/5">
                        <p>
                          Click around the {SURFACE_KINDS.find((k) => k.id === drawing.kind)!.label.toLowerCase()} on the preview,
                          corner by corner. Click the first point (or Finish) to close it.
                        </p>
                        <div className="flex gap-2">
                          <button className="btn-primary px-2 py-1 text-xs" disabled={drawing.points.length < 3} onClick={finishDrawing}>
                            Finish ({drawing.points.length} points)
                          </button>
                          <button className="btn-ghost px-2 py-1 text-xs" disabled={!drawing.points.length}
                            onClick={() => setDrawing({ ...drawing, points: drawing.points.slice(0, -1) })}>
                            Undo point
                          </button>
                          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setDrawing(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-slate-400">
                          Add a part, then click its corners on the preview. Drag a traced point to adjust it.
                          {backdrop.kind === 'none' ? ' Pick a photo of the house as the backdrop to trace over.' : ''}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {SURFACE_KINDS.map((k) => (
                            <button key={k.id} className="btn-default px-2 py-1 text-xs" onClick={() => setDrawing({ kind: k.id, points: [] })}>
                              <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: k.color }} />
                              Add {k.label.toLowerCase()}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {surfaces.length === 0 ? (
                  !tracing && <p className="text-xs text-slate-500">Nothing traced yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {surfaces.map((s, i) => (
                      <li key={s.id} className="flex items-center gap-2 text-xs">
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ background: SURFACE_KINDS.find((k) => k.id === s.kind)?.color }} />
                        <input
                          className="input py-0.5 text-xs"
                          defaultValue={s.name}
                          key={`${s.id}:${s.name}`}
                          disabled={!canEdit}
                          onBlur={(e) => {
                            if (e.target.value === s.name || !e.target.value.trim()) return
                            const next = surfaces.map((x, j) => (j === i ? { ...x, name: e.target.value.trim() } : x))
                            setSurfaces(next)
                            void saveSurfaces(next)
                          }}
                        />
                        <select className="input w-auto py-0.5 text-xs" value={s.kind} disabled={!canEdit}
                          onChange={(e) => {
                            const next = surfaces.map((x, j) => (j === i ? { ...x, kind: e.target.value as SurfaceKind } : x))
                            setSurfaces(next)
                            void saveSurfaces(next)
                          }}>
                          {SURFACE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                        </select>
                        {canEdit && (
                          <button
                            className={classNames('shrink-0 px-1.5 py-0.5 text-xs', straightening === s.id ? 'btn-primary' : 'btn-ghost')}
                            title="Draw things on this part so they look right from the street, not stretched (for a roof that slopes away)"
                            onClick={() => {
                              if (straightening === s.id) {
                                finishStraightening()
                                return
                              }
                              if (straightening) finishStraightening()
                              setTracing(false)
                              setDrawing(null)
                              setStraightening(s.id)
                              setFlatCorners(s.id, s.flat?.corners ?? startingSquare(s, show.canvas_width / show.canvas_height), 'save')
                            }}
                          >
                            {straightening === s.id ? 'Done' : s.flat ? 'Straightened ✓' : 'Straighten'}
                          </button>
                        )}
                        {canEdit && (
                          <button className="btn-ghost px-1.5 py-0.5 text-xs text-red-300" onClick={() => {
                            const next = surfaces.filter((_, j) => j !== i)
                            setSurfaces(next)
                            void saveSurfaces(next)
                          }}>
                            Remove
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {straightPart && (
                  <div className="mt-3 space-y-2 rounded-md bg-panel-850 p-2 text-xs text-slate-300 ring-1 ring-yellow-400/30">
                    <p className="font-semibold text-slate-100">Straighten “{straightPart.name}”</p>
                    <p>
                      A checkerboard square with a yellow circle is on the projectors now. Look at it from the street and
                      drag the four yellow corners on the preview (the filled one is top left) until the squares on the
                      {straightPart.kind === 'roof' ? ' roof' : ' part'} look like true squares and the circle looks round.
                      Drag inside the square to move all of it.
                    </p>
                    <p className="text-slate-400">
                      Everything you put on this part is then drawn the same way, so it is not stretched. You can also do
                      this with the mouse on the mini PC’s own monitor.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-primary px-2 py-1 text-xs" onClick={finishStraightening}>Done</button>
                      <button className="btn-ghost px-2 py-1 text-xs"
                        onClick={() => setFlatCorners(straightPart.id, startingSquare(straightPart, show.canvas_width / show.canvas_height), 'save')}>
                        Start again
                      </button>
                      <button className="btn-ghost px-2 py-1 text-xs text-red-300" onClick={() => {
                        setFlatCorners(straightPart.id, null, 'save')
                        setStraightening(null)
                      }}>
                        Don’t straighten this part
                      </button>
                    </div>
                  </div>
                )}
              </Panel>
            )}
          </div>

          <div className="min-w-0 xl:sticky xl:top-[calc(var(--shell-top,3rem)+var(--mapping-bar,0px)+0.5rem)]">
            <Panel
              title={scene ? scene.name : 'Preview'}
              description={
                placingLayer
                  ? `Click to put ${layerLabel(placingLayer).toLowerCase()} there. Drag one to move it; click one to pick it and change its size below.`
                  : peopleSource === 'simulated'
                  ? 'Live. The white rings are made-up people walking past; drag one to move it.'
                  : 'Live, with the people the camera sees.'
              }
              action={
                fps && (
                  <span className="tnum text-xs text-slate-500">
                    {fps.fps.toFixed(0)} fps{fps.scale != null && fps.scale < 1 ? ` · detail ${Math.round(fps.scale * 100)}%` : ''}
                  </span>
                )
              }
            >
              <ScenePreview
                show={show}
                scene={scene}
                media={media}
                clock={clock}
                cameraPeople={cameraPeople}
                peopleSource={peopleSource}
                count={count}
                sendToProjectors={sendToProjectors && canEdit}
                backdrop={backdrop}
                surfaces={surfaces}
                showSurfaces={tracing || straightPart != null}
                drawing={drawing}
                onDrawingChange={setDrawing}
                onDrawingDone={finishDrawing}
                onSurfacesChange={setSurfaces}
                onSurfacesDone={() => void saveSurfaces(surfaces)}
                placing={tracing || drawing ? null : placing}
                onPinsChange={(pins, selected) => {
                  if (!scene || !placingLayer) return
                  updateLayer(scene, placingLayer.id, { pins })
                  setSelectedPin(selected)
                }}
                onStats={(f, scale) => setFps({ fps: f, scale })}
                picker={straightPart?.flat ? (
                  <CornerPicker
                    corners={straightPart.flat.corners}
                    onChange={(corners) => setFlatCorners(straightPart.id, corners, 'drag')}
                    onDone={(corners) => setFlatCorners(straightPart.id, corners, 'save')}
                  />
                ) : undefined}
              />
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
                <label className="flex items-center gap-1.5">
                  People
                  <select className="input w-auto py-1 text-xs" value={peopleSource}
                    onChange={(e) => setPeopleSource(e.target.value as PeopleSource)}>
                    <option value="simulated">Made up</option>
                    <option value="camera">From the camera</option>
                  </select>
                </label>
                {peopleSource === 'simulated' && (
                  <label className="flex items-center gap-1.5 whitespace-nowrap">
                    How many
                    <input type="range" min={0} max={8} value={count} className="w-24 accent-sky-500"
                      onChange={(e) => setCount(Number(e.target.value))} />
                    <span className="tnum w-3 text-slate-200">{count}</span>
                  </label>
                )}
                {peopleSource === 'simulated' && canEdit && (
                  <label className="flex items-center gap-1.5" title="Also send these made-up people to the projectors, to try a scene on the building with nobody there">
                    <input type="checkbox" className="accent-sky-500" checked={sendToProjectors}
                      onChange={(e) => setSendToProjectors(e.target.checked)} />
                    Send to the projectors
                  </label>
                )}
                <label className="flex items-center gap-1.5">
                  Backdrop
                  <select
                    className="input w-auto max-w-[14rem] py-1 text-xs"
                    value={backdrop.kind === 'media' ? `m${backdrop.id}` : backdrop.kind}
                    onChange={(e) => {
                      const v = e.target.value
                      setBackdrop(v === 'none' || v === 'camera' ? { kind: v } : { kind: 'media', id: Number(v.slice(1)) })
                    }}
                  >
                    <option value="none">Black</option>
                    {show.camera_view && <option value="camera">Camera photo of the house</option>}
                    {media.map((m) => (
                      <option key={m.id} value={`m${m.id}`}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </Panel>
          </div>
        </div>
      )}

      <Modal open={starting} label="Start a new scene" onClose={() => setStarting(false)} size="lg">
        <div className="space-y-4 p-5">
          <div>
            <h3 className="text-base font-semibold text-slate-50">Start a new scene</h3>
            <p className="mt-1 text-sm text-slate-400">Pick a ready-made one to change as you like, or start blank.</p>
          </div>
          {ai?.available ? (
            <div className="rounded-md bg-panel-850 p-3 ring-1 ring-white/5">
              <p className="mb-2 text-sm font-medium text-slate-200">Describe it in words</p>
              <DescribeBox
                placeholder="A Christmas scene that turns my house into a gingerbread house, with snow, and sparkles that follow people"
                busy={busy === 'describe'}
                disabled={busy != null}
                action="Create scene"
                compact
                onSubmit={(prompt) => {
                  setStarting(false)
                  setPart('edit')
                  void describe(prompt, null)
                }}
              />
            </div>
          ) : ai ? (
            <p className="text-xs text-slate-500">
              To describe scenes in plain words instead, add an Anthropic API key in{' '}
              <Link className="text-sky-300 hover:underline" to="/settings?part=ai">Settings → AI keys</Link>. Everything else works without one.
            </p>
          ) : null}
          <div className="space-y-3">
              {[...new Set(STARTERS.map((s) => s.occasion))].map((occasion) => (
                <div key={occasion}>
                  <p className="mb-1 mt-2 text-[11px] uppercase tracking-wide text-slate-500">{occasion}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {STARTERS.filter((s) => s.occasion === occasion).map((starter) => (
                      <button
                        key={starter.name}
                        className="rounded-md bg-panel-850 px-3 py-2 text-left ring-1 ring-white/5 hover:bg-panel-800 disabled:opacity-50"
                        disabled={busy != null}
                        onClick={() => void startFrom(starter.name, starter.description, starter.layers.map(normaliseLayer))}
                      >
                        <span className="block text-sm text-slate-100">{starter.name}</span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{starter.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
          <div className="flex justify-between gap-2 border-t border-white/[0.06] pt-3">
            <button className="btn-default" disabled={busy != null} onClick={() => void startFrom('New scene', '', [])}>
              Blank scene
            </button>
            <button className="btn-ghost" onClick={() => setStarting(false)}>Cancel</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete != null}
        title="Delete scene"
        body={`Delete the scene "${confirmDelete?.name ?? ''}"? Cues using it keep their media and lose the scene.`}
        danger
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const target = confirmDelete
          setConfirmDelete(null)
          if (target) {
            void guard('delete', async () => {
              await mappingApi.deleteScene(target.id)
              await reloadScenes()
              await onShowChanged()
              setSelectedId(null)
            })
          }
        }}
      />
    </div>
  )
}

function DescribeBox({
  placeholder,
  busy,
  disabled,
  action,
  compact = false,
  onSubmit,
}: {
  placeholder: string
  busy: boolean
  disabled: boolean
  action: string
  compact?: boolean
  onSubmit: (prompt: string) => void
}) {
  const [text, setText] = useState('')
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim().length >= 3) onSubmit(text.trim())
      }}
    >
      <textarea
        className="input min-h-0 text-sm"
        rows={compact ? 2 : 4}
        maxLength={2000}
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <button className="btn-primary px-3 py-1 text-xs" disabled={disabled || text.trim().length < 3}>
          {busy ? 'Designing…' : action}
        </button>
        {busy && <span className="text-xs text-slate-500">This takes up to a minute.</span>}
      </div>
    </form>
  )
}

function LayerCard({
  layer,
  media,
  open,
  selectedPin,
  onSelectPin,
  hasHouse,
  canEdit,
  isTop,
  isBottom,
  onToggle,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
}: {
  layer: SceneLayer
  media: MediaAsset[]
  open: boolean
  selectedPin: number | null
  onSelectPin: (index: number | null) => void
  hasHouse: boolean
  canEdit: boolean
  isTop: boolean
  isBottom: boolean
  onToggle: () => void
  onChange: (patch: Partial<SceneLayer>) => void
  onMove: (up: boolean) => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const kind = KIND[layer.type]
  if (!kind) return null
  const usesColors = layer.type !== 'distort' && layer.type !== 'picture'
  const placed = PLACEABLE.has(layer.type) && layer.pins != null
  const single = layer.type === 'countdown'
  const usesTarget = (kind.group !== 'people' || layer.type === 'particles') && !placed
  const near = nearOf(layer)
  const pin = placed && selectedPin != null ? layer.pins![selectedPin] : undefined
  return (
    <li className={classNames('rounded-md ring-1', layer.enabled ? 'bg-panel-850 ring-white/5' : 'bg-panel-900 ring-white/5 opacity-70')}>
      <div className="flex items-center gap-2 px-3 py-2">
        <input type="checkbox" className="accent-sky-500" checked={layer.enabled} disabled={!canEdit}
          title="Show this layer" onChange={(e) => onChange({ enabled: e.target.checked })} />
        {usesColors && (
          <span className="flex shrink-0">
            <span className="h-3 w-3 rounded-l-sm" style={{ background: layer.color }} />
            <span className="h-3 w-3 rounded-r-sm" style={{ background: layer.color2 }} />
          </span>
        )}
        <button className="min-w-0 flex-1 text-left" onClick={onToggle}>
          <span className="block truncate text-sm text-slate-100">{layerLabel(layer)}</span>
          <span className="block truncate text-xs text-slate-500">
            {kind.label}
            {usesTarget && layer.target !== 'everywhere' ? ` · ${TARGETS.find((t) => t.id === layer.target)?.label}` : ''}
            {placed ? ` · ${layer.pins!.length} placed by hand` : ''}
            {near !== 'none' ? ` · near people: ${NEARS.find((n) => n.id === near)?.label.toLowerCase()}` : ''}
            {layer.reacts_to !== 'always' ? ` · reacts to ${REACTIONS.find((r) => r.id === layer.reacts_to)?.label.toLowerCase()}` : ''}
          </span>
        </button>
        {canEdit && (
          <span className="flex shrink-0 items-center">
            <button className="btn-ghost px-1.5 py-0.5 text-xs" disabled={isTop} onClick={() => onMove(true)} aria-label="Move up">↑</button>
            <button className="btn-ghost px-1.5 py-0.5 text-xs" disabled={isBottom} onClick={() => onMove(false)} aria-label="Move down">↓</button>
          </span>
        )}
        <button className="btn-ghost px-2 py-0.5 text-xs" onClick={onToggle}>{open ? 'Close' : 'Edit'}</button>
      </div>
      {open && (
        <div className="space-y-4 border-t border-white/[0.06] px-3 py-3">
          <p className="text-xs text-slate-500">{kind.about}.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Name</span>
              <input className="input py-1 text-sm" value={layer.name} placeholder={layerLabel({ ...layer, name: '' })}
                disabled={!canEdit} maxLength={64} onChange={(e) => onChange({ name: e.target.value })} />
            </label>
            {layer.type === 'picture' && (
              <label className="block">
                <span className="label">Picture</span>
                <select className="input py-1 text-sm" value={layer.media_id ?? ''} disabled={!canEdit}
                  onChange={(e) => onChange({ media_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Choose a picture…</option>
                  {media.filter((m) => m.kind === 'image').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
            )}
            {kind.styles.length > 1 && (
              <label className="block">
                <span className="label">Style</span>
                <select className="input py-1 text-sm" value={layer.style} disabled={!canEdit}
                  onChange={(e) => {
                    const style = e.target.value
                    // A countdown's look is a starting point: it brings its own colours.
                    onChange(layer.type === 'countdown' ? countdownLook(style) : { style })
                  }}>
                  {kind.styles.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
            )}
            {layer.type === 'countdown' && (
              <div className="sm:col-span-2">
                <CountdownColorPickers layer={layer} canEdit={canEdit} onChange={onChange} />
              </div>
            )}
            {usesColors && layer.type !== 'countdown' && (
              <div className="flex gap-3">
                <label className="block">
                  <span className="label">Colour</span>
                  <input type="color" className="h-8 w-14 cursor-pointer rounded bg-transparent" value={layer.color}
                    disabled={!canEdit} onChange={(e) => onChange({ color: e.target.value })} />
                </label>
                <label className="block">
                  <span className="label">Second colour</span>
                  <input type="color" className="h-8 w-14 cursor-pointer rounded bg-transparent" value={layer.color2}
                    disabled={!canEdit} onChange={(e) => onChange({ color2: e.target.value })} />
                </label>
              </div>
            )}
            {PLACEABLE.has(layer.type) && (
              <label className="block">
                <span className="label">Placement</span>
                <select className="input py-1 text-sm" value={placed ? 'hand' : 'spread'} disabled={!canEdit}
                  onChange={(e) => {
                    const hand = e.target.value === 'hand'
                    onSelectPin(hand && single ? 0 : null)
                    onChange({ pins: hand ? (single ? [{ x: 0.5, y: 0.42, size: 1, rotation: 0 }] : []) : null })
                  }}>
                  <option value="spread">{single ? 'Centred on an area' : 'Spread over an area'}</option>
                  <option value="hand">{single ? 'Where I put it' : 'Where I put them'}</option>
                </select>
              </label>
            )}
            {usesTarget && (
              <label className="block">
                <span className="label">Where</span>
                <select className="input py-1 text-sm" value={layer.target} disabled={!canEdit}
                  onChange={(e) => onChange({ target: e.target.value as SceneLayer['target'] })}>
                  {TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                {!hasHouse && layer.target !== 'everywhere' && (
                  <span className="mt-1 block text-xs text-amber-300">Trace the house parts to use this; until then it covers everything.</span>
                )}
              </label>
            )}
            {kind.nears && (
              <label className="block">
                <span className="label">When someone comes near</span>
                <select className="input py-1 text-sm" value={near} disabled={!canEdit}
                  onChange={(e) => onChange({ near: e.target.value as SceneLayer['near'] })}>
                  {NEARS.filter((n) => kind.nears!.includes(n.id)).map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                </select>
              </label>
            )}
            {kind.motions && (
              <label className="block">
                <span className="label">Moves</span>
                <select className="input py-1 text-sm" value={motionOf(layer)} disabled={!canEdit}
                  onChange={(e) => onChange({ motion: e.target.value as SceneLayer['motion'] })}>
                  {MOTIONS.filter((m) => kind.motions!.includes(m.id)).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
            )}
            {kind.changes && (
              <label className="block">
                <span className="label">Changes</span>
                <select className="input py-1 text-sm" value={changeOf(layer)} disabled={!canEdit}
                  onChange={(e) => onChange({ change: e.target.value as SceneLayer['change'] })}>
                  {CHANGES.filter((c) => kind.changes!.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
            )}
            <label className="block">
              <span className="label">{kind.nears ? 'Whole layer reacts to' : 'Reacts to'}</span>
              <select className="input py-1 text-sm" value={layer.reacts_to} disabled={!canEdit}
                title={REACTIONS.find((r) => r.id === layer.reacts_to)?.hint}
                onChange={(e) => onChange({ reacts_to: e.target.value as SceneLayer['reacts_to'] })}>
                {REACTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
            {layer.type !== 'distort' && (
              <label className="block">
                <span className="label">Mix</span>
                <select className="input py-1 text-sm" value={layer.blend} disabled={!canEdit}
                  onChange={(e) => onChange({ blend: e.target.value as SceneLayer['blend'] })}>
                  {BLENDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </label>
            )}
          </div>
          {placed && (
            <div className="rounded-md bg-panel-900 px-3 py-2.5 text-xs ring-1 ring-sky-500/30">
              <p className="text-slate-300">
                {single
                  ? layer.pins!.length === 0
                    ? 'Click on the preview to put it where you want it.'
                    : 'Drag it on the preview, or click where it should go. Drag the square corner handle to size it and the round handle to turn it.'
                  : layer.pins!.length === 0
                    ? 'Click on the preview to put the first one where you want it.'
                    : `${layer.pins!.length} placed. Click the preview to add more, drag one to move it, click one to pick it, then use its handles to size or turn it.`}
              </p>
              {canEdit && (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {pin ? (
                    <>
                      {!single && <span className="text-slate-400">Picked one:</span>}
                      <label className="flex items-center gap-1.5 text-slate-400">
                        Size
                        <input type="range" min={0.3} max={3} step={0.05} value={pin.size} className="w-28 accent-sky-500"
                          onChange={(e) => onChange({
                            pins: layer.pins!.map((p, i) => (i === selectedPin ? { ...p, size: Number(e.target.value) } : p)),
                          })} />
                        <span className="tnum w-9 text-slate-200">{Math.round(pin.size * 100)}%</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-slate-400">
                        Turn
                        <input type="range" min={-180} max={180} step={1} value={pin.rotation ?? 0} className="w-28 accent-sky-500"
                          onChange={(e) => onChange({
                            pins: layer.pins!.map((p, i) => (i === selectedPin ? { ...p, rotation: Number(e.target.value) } : p)),
                          })} />
                        <span className="tnum w-9 text-slate-200">{Math.round(pin.rotation ?? 0)}°</span>
                      </label>
                      {!single && (
                        <button className="btn-ghost px-2 py-0.5 text-xs text-red-300" onClick={() => {
                          onSelectPin(null)
                          onChange({ pins: layer.pins!.filter((_, i) => i !== selectedPin) })
                        }}>
                          Remove it
                        </button>
                      )}
                    </>
                  ) : (
                    layer.pins!.length > 0 && (
                      <span className="text-slate-500">{single ? 'Click it on the preview to size or turn it.' : 'Click one on the preview to size, turn or remove it.'}</span>
                    )
                  )}
                  {layer.pins!.length > 0 && !single && (
                    <button className="btn-ghost ml-auto px-2 py-0.5 text-xs" onClick={() => {
                      onSelectPin(null)
                      onChange({ pins: [] })
                    }}>
                      Remove all
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Slider label="Strength" value={layer.opacity} min={0} max={1} step={0.01} disabled={!canEdit}
              format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => onChange({ opacity: v })} />
            {near !== 'none' && (
              <Slider label="How near counts as near" value={layer.reach ?? 0.5} min={0} max={1} step={0.01} disabled={!canEdit}
                format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => onChange({ reach: v })} />
            )}
            {layer.reacts_to !== 'always' && (
              <Slider label="How much it reacts" value={layer.reaction} min={0} max={1} step={0.01} disabled={!canEdit}
                format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => onChange({ reaction: v })} />
            )}
            {DIALS.filter((d) => kind.dials[d] && !(placed && d === (single ? 'fade' : 'amount'))).map((d) => (
              <Slider key={d} label={kind.dials[d]!} value={layer[d]} min={0} max={1} step={0.01} disabled={!canEdit}
                format={(v) => `${Math.round(v * 100)}`} onChange={(v) => onChange({ [d]: v })} />
            ))}
          </div>
          {canEdit && (
            <div className="flex justify-end gap-2">
              <button className="btn-ghost px-2 py-1 text-xs" onClick={onDuplicate}>Duplicate</button>
              <button className="btn-ghost px-2 py-1 text-xs text-red-300" onClick={onDelete}>Remove layer</button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
