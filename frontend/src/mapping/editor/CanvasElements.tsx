import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { EmptyState, Modal } from '@/components/ui'
import { classNames } from '@/lib/format'
import { mappingApi } from '../api'
import type { ServerClock } from '../live'
import { PeopleTracker } from '../people'
import { layerLabel } from '../scene/catalog'
import { MAX_LAYERS } from '../scene/library'
import type { MappingScene, MediaAsset, ObjectPin, Output, SceneLayer, Show, TransportState } from '../types'
import { Slider } from './controls'
import { CountdownColorPickers } from './CountdownColors'
import { ElementLibrary } from './ElementLibrary'
import { outputColor } from './panels'
import { type Backdrop, ScenePreview } from './ScenePreview'
import { InfoFields } from './InfoFields'
import { PLACEABLE, placingFor, SINGLE } from './ScenesPanel'

/** Edits are saved this long after the last change, as in the Scenes tab. */
const SAVE_DELAY_MS = 400

/**
 * Where an element lives: on the picked cue only, on every cue of the show,
 * or (elements added before there was a choice) inside the cue's scene,
 * which plays wherever that scene plays.
 */
type Home = 'cue' | 'every' | 'scene'

/** Where new elements go, remembered on this computer. */
const WHERE_KEY = 'pm.elementsWhere'

function readWhere(): 'cue' | 'every' {
  try {
    return localStorage.getItem(WHERE_KEY) === 'every' ? 'every' : 'cue'
  } catch {
    return 'cue'
  }
}

const NO_LAYERS: SceneLayer[] = []


/**
 * The cue's media with its scene and elements on top and every projector's
 * box outlined over both, so it can be seen where things land. Elements
 * (objects, movers, boards and the countdown) are added and placed right
 * here, each either on this cue only (kept in the cue) or on every cue
 * (kept in the show, in the same place on each). Scene groups and
 * playlists change cues' scenes but never these. Elements added before
 * there was a choice live in the cue's scene and can be moved out of it.
 */
export function CanvasElements({
  show,
  outputs,
  scenes,
  media,
  clock,
  transport,
  canEdit,
  reloadScenes,
  onShowChanged,
  onError,
}: {
  show: Show
  outputs: Output[]
  scenes: MappingScene[]
  media: MediaAsset[]
  clock: ServerClock
  transport: TransportState | null
  canEdit: boolean
  reloadScenes: () => Promise<unknown>
  onShowChanged: () => Promise<unknown>
  onError: (message: string | null) => void
}) {
  const playing = transport?.show_id === show.id ? transport.current?.id ?? null : null
  const [cueId, setCueId] = useState<number | null>(playing ?? show.cues[0]?.id ?? null)
  const cue = show.cues.find((c) => c.id === cueId) ?? show.cues[0] ?? null
  // Follow the show as it plays, until another cue is picked by hand.
  const followed = useRef(playing)
  useEffect(() => {
    if (playing != null && playing !== followed.current) setCueId(playing)
    followed.current = playing
  }, [playing])

  const [sceneDraft, setSceneDraft] = useState<MappingScene | null>(null)
  const [cueDraft, setCueDraft] = useState<{ id: number; layers: SceneLayer[] } | null>(null)
  const [everyDraft, setEveryDraft] = useState<{ showId: number; layers: SceneLayer[] } | null>(null)
  const saved = cue?.scene_id != null ? scenes.find((s) => s.id === cue.scene_id) ?? null : null
  const scene = sceneDraft && sceneDraft.id === saved?.id ? sceneDraft : saved
  const cueLayers = cue && cueDraft?.id === cue.id ? cueDraft.layers : cue?.elements ?? NO_LAYERS
  const everyLayers = everyDraft?.showId === show.id ? everyDraft.layers : show.every_cue_elements ?? NO_LAYERS
  const [layerId, setLayerId] = useState<string | null>(null)
  const [pinIndex, setPinIndex] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  /** The element library is open. */
  const [picking, setPicking] = useState(false)
  /** Where the next element picked goes. */
  const [where, setWhere] = useState<'cue' | 'every'>(readWhere)
  const [people, setPeople] = useState(true)
  const tracker = useState(() => new PeopleTracker(show.id))[0]

  const hasMedia = cue?.media_id != null && media.some((m) => m.id === cue.media_id)
  const [backdropChoice, setBackdropChoice] = useState<'media' | 'camera' | 'none'>('media')
  const backdrop: Backdrop =
    backdropChoice === 'media' && hasMedia
      ? { kind: 'media', id: cue!.media_id! }
      : backdropChoice === 'camera' && show.camera_view
        ? { kind: 'camera' }
        : backdropChoice === 'media' && show.camera_view
          ? { kind: 'camera' }
          : { kind: 'none' }

  // Each place (a cue, the show, a scene) saves on its own delay, so moving
  // on to another cue straight after a change still saves the first one.
  const timers = useRef(new Map<string, number>())
  const serials = useRef(new Map<string, number>())
  const pending = useRef(new Map<string, () => Promise<boolean>>())
  // Leaving the page (another Editor section or tab) saves a change still
  // waiting for its delay instead of dropping it.
  useEffect(
    () => () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer)
      for (const write of pending.current.values()) void write()
    },
    [],
  )
  useEffect(() => {
    setLayerId(null)
    setPinIndex(null)
  }, [cue?.id])

  /** Save after the delay, or at once; resolves to whether it was saved. */
  const schedule = (key: string, write: () => Promise<unknown>, reload: () => Promise<unknown>, clear: () => void, now: boolean) => {
    const mine = (serials.current.get(key) ?? 0) + 1
    serials.current.set(key, mine)
    window.clearTimeout(timers.current.get(key))
    const run = async () => {
      if (pending.current.get(key) === run) pending.current.delete(key)
      try {
        await write()
        await reload()
        if (serials.current.get(key) === mine) clear()
        onError(null)
        return true
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Saving the elements failed')
        return false
      }
    }
    pending.current.set(key, run)
    if (now) return run()
    timers.current.set(key, window.setTimeout(() => void run(), SAVE_DELAY_MS))
    return Promise.resolve(true)
  }

  const putScene = (next: MappingScene, now = false) => {
    setSceneDraft(next)
    return schedule(`scene:${next.id}`,
      () => mappingApi.updateScene(next.id, { name: next.name, description: next.description, layers: next.layers }),
      reloadScenes, () => setSceneDraft(null), now)
  }
  const putCue = (cueId: number, layers: SceneLayer[], now = false) => {
    setCueDraft({ id: cueId, layers })
    return schedule(`cue:${cueId}`, () => mappingApi.updateCue(cueId, { elements: layers }),
      onShowChanged, () => setCueDraft((d) => (d?.id === cueId ? null : d)), now)
  }
  const putEvery = (layers: SceneLayer[], now = false) => {
    setEveryDraft({ showId: show.id, layers })
    return schedule(`show:${show.id}`, () => mappingApi.updateShow(show.id, { every_cue_elements: layers }),
      onShowChanged, () => setEveryDraft(null), now)
  }

  // Every element of this cue: its own, the show's on every cue, and older
  // ones placed inside its scene (and snow, which places itself on the ledges).
  const elements: { layer: SceneLayer; home: Home }[] = [
    ...cueLayers.map((layer) => ({ layer, home: 'cue' as const })),
    ...everyLayers.map((layer) => ({ layer, home: 'every' as const })),
    ...(scene?.layers ?? [])
      .filter((l) => (PLACEABLE.has(l.type) && l.pins) || l.type === 'snowcap')
      .map((layer) => ({ layer, home: 'scene' as const })),
  ]
  const picked = canEdit ? elements.find((e) => e.layer.id === layerId) : undefined
  const layer = picked?.layer
  const pickedPin = pinIndex ?? (layer && SINGLE.has(layer.type) && layer.pins!.length > 0 ? 0 : null)
  const placing = layer?.pins ? placingFor(layer, pickedPin) : null
  const pin = layer && pickedPin != null ? layer.pins![pickedPin] : undefined

  // The preview draws the cue's scene with its elements and the every-cue ones on top, as the projectors do.
  const shown = useMemo<MappingScene | null>(() => {
    if (!scene && cueLayers.length === 0 && everyLayers.length === 0) return null
    const layers = [...(scene?.layers ?? []), ...cueLayers, ...everyLayers]
    return { id: -2, name: scene?.name ?? '', description: '', layers, created_at: '', updated_at: '' }
  }, [scene, cueLayers, everyLayers])

  const changeLayer = (home: Home, id: string, patch: Partial<SceneLayer>) => {
    const edit = (layers: SceneLayer[]) => layers.map((l) => (l.id === id ? { ...l, ...patch } : l))
    if (home === 'cue' && cue) void putCue(cue.id, edit(cueLayers))
    else if (home === 'every') void putEvery(edit(everyLayers))
    else if (home === 'scene' && scene) void putScene({ ...scene, layers: edit(scene.layers) })
  }

  const full = (to: 'cue' | 'every') => {
    if ((to === 'cue' ? cueLayers : everyLayers).length < MAX_LAYERS) return false
    onError(to === 'cue'
      ? `This cue already has ${MAX_LAYERS} elements of its own, the most it can hold. Remove one first.`
      : `There are already ${MAX_LAYERS} elements on every cue, the most there can be. Remove one first.`)
    return true
  }

  const add = async (made: SceneLayer) => {
    if (!cue || full(where)) return
    setPicking(false)
    setBusy(true)
    const ok = where === 'cue' ? await putCue(cue.id, [...cueLayers, made], true) : await putEvery([...everyLayers, made], true)
    setBusy(false)
    if (!ok) return
    setLayerId(made.id)
    setPinIndex(SINGLE.has(made.type) ? 0 : null)
  }

  const removeFrom = (home: Home, id: string, now = false) => {
    if (home === 'cue' && cue) return putCue(cue.id, cueLayers.filter((l) => l.id !== id), now)
    if (home === 'every') return putEvery(everyLayers.filter((l) => l.id !== id), now)
    if (home === 'scene' && scene) return putScene({ ...scene, layers: scene.layers.filter((l) => l.id !== id) }, now)
    return Promise.resolve(true)
  }

  const remove = (home: Home, id: string) => {
    void removeFrom(home, id)
    if (layerId === id) {
      setLayerId(null)
      setPinIndex(null)
    }
  }

  /** Put an element on this cue only or on every cue, taking it from where it was. */
  const move = async (item: { layer: SceneLayer; home: Home }, to: 'cue' | 'every') => {
    if (!cue || item.home === to || full(to)) return
    setBusy(true)
    // Added where it goes first, so a failed save never loses it.
    const ok = to === 'cue' ? await putCue(cue.id, [...cueLayers, item.layer], true) : await putEvery([...everyLayers, item.layer], true)
    if (ok) await removeFrom(item.home, item.layer.id, true)
    setBusy(false)
  }

  const pickWhere = (next: 'cue' | 'every') => {
    setWhere(next)
    try {
      localStorage.setItem(WHERE_KEY, next)
    } catch {
      // Remembering it is only a convenience.
    }
  }

  if (show.cues.length === 0 || !cue) {
    return <EmptyState title="No cues yet">Add a cue from the media library first; elements go on a cue.</EmptyState>
  }

  const W = show.canvas_width
  const H = show.canvas_height
  const boxes = (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
      {outputs.map((o, i) => (
        <g key={o.id}>
          <rect x={o.source.x * W} y={o.source.y * H} width={o.source.w * W} height={o.source.h * H}
            fill="none" stroke={outputColor(i)} strokeWidth={2} strokeDasharray="10 6" vectorEffect="non-scaling-stroke" />
          <text x={o.source.x * W + H / 80} y={o.source.y * H + H / 24} fill={outputColor(i)} fontSize={H / 30} fontWeight={600}>
            {i + 1} {o.name}
          </text>
        </g>
      ))}
    </svg>
  )

  const cueNumber = show.cues.findIndex((c) => c.id === cue.id) + 1
  const cueName = cue.name || `Cue ${cueNumber}`
  const sceneName = scene?.name ?? 'its scene'

  const hint = !canEdit
    ? null
    : !layer
      ? elements.length
        ? 'Pick an element below to move it or change its colours, or add another.'
        : 'Add an element, then click the picture to put it where you want it.'
      : SINGLE.has(layer.type)
        ? `Drag the ${layer.type === 'countdown' ? 'countdown' : 'board'} to move it. Pull the square corner to size it and the round handle to turn it.`
        : layer.type === 'movers'
          ? layer.pins!.length < 2
            ? 'It flies or walks on a path of its own. To pick its path, click points on the picture in order (two or more).'
            : 'Click to add a point to the end of the path. Drag a point to move it; pick one and pull its square corner to make it bigger or smaller there.'
          : layer.type === 'snowcap'
            ? 'Snow settles by itself on the level edges of the traced house parts (Scenes → House parts), and melts where people stand.'
            : `Click the picture to put ${layerLabel(layer).toLowerCase()} there. Drag one to move it; click one to pick it, then use its handles to size or turn it.`

  return (
    <div className="space-y-3">
      <Modal open={picking} label="Add an element" size="lg" className="sm:max-w-4xl" onClose={() => setPicking(false)}>
        <div className="p-4 sm:p-5">
          <h2 className="mb-3 text-base font-semibold text-slate-100">Add an element</h2>
          <div className="mb-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Where it goes">
            {([
              ['cue', 'This cue only', `Only on cue ${cueNumber}, “${cueName}”.`],
              ['every', 'Every cue', `On all ${show.cues.length} cue${show.cues.length === 1 ? '' : 's'}, in the same place on each, and on cues you add later.`],
            ] as const).map(([value, title, detail]) => (
              <button key={value} type="button" role="radio" aria-checked={where === value}
                className={classNames(
                  'rounded-md px-3 py-2 text-left ring-1 transition-colors',
                  where === value ? 'bg-sky-500/15 ring-sky-400/60' : 'bg-panel-850 ring-white/10 hover:bg-panel-800',
                )}
                onClick={() => pickWhere(value)}>
                <span className="flex items-center gap-2 text-sm font-medium text-slate-100">
                  <span className={classNames('h-3 w-3 rounded-full ring-2', where === value ? 'bg-sky-400 ring-sky-400/40' : 'ring-slate-500')} />
                  {title}
                </span>
                <span className="mt-0.5 block pl-5 text-xs text-slate-400">{detail}</span>
              </button>
            ))}
          </div>
          <ElementLibrary disabled={busy} onPick={(made) => void add(made)} />
        </div>
      </Modal>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="label">Cue</span>
          <select className="input w-auto py-1 text-sm" value={cue.id} onChange={(e) => setCueId(Number(e.target.value))}>
            {show.cues.map((c, i) => (
              <option key={c.id} value={c.id}>
                {i + 1}. {c.name}{c.id === playing ? ' (playing)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Under the elements</span>
          <select className="input w-auto py-1 text-sm" value={backdropChoice}
            onChange={(e) => setBackdropChoice(e.target.value as typeof backdropChoice)}>
            <option value="media">{hasMedia ? "The cue's media" : show.camera_view ? 'The cue has no media: house photo' : 'The cue has no media'}</option>
            {show.camera_view && <option value="camera">The house photo from the camera</option>}
            <option value="none">Nothing</option>
          </select>
        </label>
        {canEdit && (
          <div className="block">
            <span className="label">Add an element</span>
            <button type="button" className="btn-primary py-1 text-sm" disabled={busy} onClick={() => setPicking(true)}>
              <Plus size={14} aria-hidden /> Find an element…
            </button>
          </div>
        )}
        <label className="flex items-center gap-2 pb-1.5 text-xs text-slate-400">
          <input type="checkbox" className="accent-sky-500" checked={people} onChange={(e) => setPeople(e.target.checked)} />
          Pretend people walk by
        </label>
      </div>

      <ScenePreview
        show={show}
        scene={shown}
        media={media}
        clock={clock}
        cameraPeople={tracker}
        peopleSource="simulated"
        count={people ? 2 : 0}
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
        onPinsChange={(pins: ObjectPin[], selected) => {
          if (!picked) return
          changeLayer(picked.home, picked.layer.id, { pins })
          setPinIndex(selected)
        }}
        overlay={boxes}
      />
      {hint && <p className="text-xs text-slate-500">{hint}</p>}

      {elements.length > 0 && (
        <ul className="space-y-1">
          {elements.map(({ layer: l, home }) => {
            const open = l.id === layer?.id
            const change = (patch: Partial<SceneLayer>) => changeLayer(home, l.id, patch)
            return (
              <li key={`${home}:${l.id}`} className="rounded-md bg-panel-850 ring-1 ring-white/5">
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="flex shrink-0">
                    <span className="h-3 w-3 rounded-l-sm" style={{ background: l.color }} />
                    <span className="h-3 w-3 rounded-r-sm" style={{ background: l.color2 }} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-100">
                    {layerLabel(l)}
                    <span className="text-xs text-slate-500">
                      {l.type === 'movers'
                        ? l.pins!.length >= 2 ? ` · path of ${l.pins!.length} points` : ' · its own path'
                        : PLACEABLE.has(l.type) && !SINGLE.has(l.type) ? ` · ${l.pins!.length} placed` : ''}
                    </span>
                  </span>
                  {canEdit ? (
                    <select aria-label={`Where ${layerLabel(l).toLowerCase()} shows`} disabled={busy}
                      className={classNames('input w-auto py-0.5 text-xs', home === 'every' ? 'text-sky-300' : home === 'scene' ? 'text-amber-200' : '')}
                      value={home}
                      onChange={(e) => void move({ layer: l, home }, e.target.value as 'cue' | 'every')}>
                      <option value="cue">This cue only</option>
                      <option value="every">Every cue</option>
                      {home === 'scene' && <option value="scene">In the scene “{sceneName}”</option>}
                    </select>
                  ) : (
                    <span className="text-xs text-slate-500">{home === 'cue' ? 'This cue only' : home === 'every' ? 'Every cue' : `In the scene “${sceneName}”`}</span>
                  )}
                  {canEdit && (
                    <>
                      <button className="btn-ghost px-2 py-0.5 text-xs"
                        onClick={() => {
                          setLayerId(open ? null : l.id)
                          setPinIndex(null)
                        }}>
                        {open ? 'Done' : 'Move and colours'}
                      </button>
                      <button className="btn-ghost px-2 py-0.5 text-xs text-rose-300" disabled={busy} onClick={() => remove(home, l.id)}
                        title={home === 'every' ? 'Takes it off every cue' : home === 'scene' ? `Takes it out of the scene “${sceneName}”, wherever that plays` : 'Takes it off this cue'}>
                        {home === 'every' ? 'Remove from all' : 'Remove'}
                      </button>
                    </>
                  )}
                </div>
                {open && (
                  <div className="grid gap-3 border-t border-white/[0.06] px-3 py-3 sm:grid-cols-2">
                    {l.type === 'info' && (
                      <div className="sm:col-span-2">
                        <InfoFields layer={l} canEdit={canEdit} onChange={(patch) => change(patch)} />
                      </div>
                    )}
                    {l.type === 'countdown' ? (
                      <div className="sm:col-span-2">
                        <CountdownColorPickers layer={l} canEdit={canEdit} withLook
                          onChange={(patch) => change(patch)} />
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 text-xs text-slate-400">
                        Colours
                        <input type="color" className="h-7 w-12 cursor-pointer rounded bg-transparent" value={l.color}
                          onChange={(e) => change({ color: e.target.value })} />
                        <input type="color" className="h-7 w-12 cursor-pointer rounded bg-transparent" value={l.color2}
                          onChange={(e) => change({ color2: e.target.value })} />
                      </label>
                    )}
                    {(l.type === 'movers' || l.type === 'snowcap') && (
                      <Slider label="Size" min={0} max={1} step={0.01} value={l.size}
                        onChange={(size) => change({ size })} />
                    )}
                    {l.type === 'movers' && (
                      <Slider label={l.style === 'sleigh' || l.style === 'train' ? 'Speed' : 'How many'} min={0} max={1} step={0.01}
                        value={l.style === 'sleigh' || l.style === 'train' ? l.speed : l.amount}
                        onChange={(v) => change(l.style === 'sleigh' || l.style === 'train' ? { speed: v } : { amount: v })} />
                    )}
                    {l.type === 'movers' && l.pins!.length > 0 && (
                      <button className="btn-ghost justify-self-start px-2 py-0.5 text-xs"
                        onClick={() => {
                          change({ pins: [] })
                          setPinIndex(null)
                        }}>
                        Clear the path (use its own)
                      </button>
                    )}
                    {pin && (
                      <>
                        <Slider label={l.type === 'movers' ? 'Size at the picked point' : 'Size of the picked one'} min={0.3} max={3} step={0.05} value={pin.size}
                          onChange={(size) =>
                            change({ pins: l.pins!.map((p, i) => (i === pickedPin ? { ...p, size } : p)) })} />
                        {l.type !== 'movers' && (
                          <Slider label="Turn" min={-180} max={180} step={1} value={pin.rotation ?? 0}
                            onChange={(rotation) =>
                              change({ pins: l.pins!.map((p, i) => (i === pickedPin ? { ...p, rotation } : p)) })} />
                        )}
                        {!SINGLE.has(l.type) && (
                          <button className="btn-ghost justify-self-start px-2 py-0.5 text-xs"
                            onClick={() => {
                              change({ pins: l.pins!.filter((_, i) => i !== pickedPin) })
                              setPinIndex(null)
                            }}>
                            Remove the picked one
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {elements.length > 0 && (
        <p className="text-xs text-slate-500">
          “This cue only” stays with this cue. “Every cue” shows on all the cues in the same place, keeps going
          smoothly from one cue to the next, and “Remove from all” takes it off every cue. Tonight’s scene group and
          playlists change the scenes but leave elements where you put them.
          {elements.some((e) => e.home === 'scene') &&
            ` Ones marked “In the scene” were added before there was a choice and play wherever “${sceneName}” plays; pick This cue only or Every cue to take them out of it.`}
        </p>
      )}
    </div>
  )
}
