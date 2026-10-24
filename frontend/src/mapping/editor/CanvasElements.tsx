import { useEffect, useRef, useState } from 'react'
import { EmptyState } from '@/components/ui'
import { mappingApi } from '../api'
import type { ServerClock } from '../live'
import { PeopleTracker } from '../people'
import { COUNTDOWN_COLORS, COUNTDOWN_PRESETS, KIND, layerLabel, newLayer, STARTERS } from '../scene/catalog'
import type { MappingScene, MediaAsset, ObjectPin, Output, SceneLayer, Show, TransportState } from '../types'
import { Slider } from './controls'
import { CountdownColorPickers } from './CountdownColors'
import { outputColor } from './panels'
import { type Backdrop, ScenePreview } from './ScenePreview'
import { PLACEABLE, placingFor } from './ScenesPanel'

/** Edits are saved this long after the last change, as in the Scenes tab. */
const SAVE_DELAY_MS = 400

/** How the ready-made scenes colour an object and make it react, so a new one looks right at once. */
function starterLook(style: string): Partial<SceneLayer> {
  const used = STARTERS.flatMap((s) => s.layers).find((l) => l.type === 'shapes' && l.style === style)
  if (!used) return {}
  const { color, color2, change, near, reacts_to } = used
  return Object.fromEntries(Object.entries({ color, color2, change, near, reacts_to }).filter(([, v]) => v != null))
}

/** What the Add menu offers: each kind of object by itself, and a countdown for each holiday. */
const ADDABLE: Array<{ value: string; label: string; make: () => SceneLayer }> = [
  ...KIND.shapes.styles.map((s) => ({
    value: `shapes:${s.id}`,
    label: s.label,
    make: () => newLayer('shapes', { ...starterLook(s.id), style: s.id, name: s.label, pins: [] }),
  })),
  ...COUNTDOWN_PRESETS.map((p) => ({
    value: `countdown:${p.id}`,
    label: p.label,
    make: () => newLayer('countdown', {
      ...COUNTDOWN_COLORS[p.style], style: p.style, name: p.label, pins: [{ x: 0.5, y: 0.42, size: 1, rotation: 0 }],
    }),
  })),
]

/**
 * The cue's media with its scene elements on top and every projector's box
 * outlined over both, so it can be seen where things land. Elements (objects
 * and the countdown) are added and placed right here; they are stored in the
 * cue's scene, exactly as the Scenes tab stores them, so the Scenes tab and
 * the projectors show the same thing. A cue without a scene gets one.
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

  const [draft, setDraft] = useState<MappingScene | null>(null)
  const saved = cue?.scene_id != null ? scenes.find((s) => s.id === cue.scene_id) ?? null : null
  const scene = draft && draft.id === saved?.id ? draft : saved
  const [layerId, setLayerId] = useState<string | null>(null)
  const [pinIndex, setPinIndex] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [people, setPeople] = useState(true)
  const saveTimer = useRef<number>()
  const serial = useRef(0)
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

  // Leaving the page (another Editor section or tab) saves a change still
  // waiting for its delay instead of dropping it.
  const pendingSave = useRef<(() => void) | null>(null)
  useEffect(
    () => () => {
      window.clearTimeout(saveTimer.current)
      pendingSave.current?.()
    },
    [],
  )
  useEffect(() => {
    setLayerId(null)
    setPinIndex(null)
  }, [cue?.id])

  const elements = scene?.layers.filter((l) => PLACEABLE.has(l.type) && l.pins) ?? []
  const layer = canEdit ? elements.find((l) => l.id === layerId) : undefined
  const pickedPin = pinIndex ?? (layer?.type === 'countdown' && layer.pins!.length > 0 ? 0 : null)
  const placing = layer ? placingFor(layer, pickedPin) : null
  const pin = layer && pickedPin != null ? layer.pins![pickedPin] : undefined

  const save = (next: MappingScene) => {
    setDraft(next)
    const mine = ++serial.current
    window.clearTimeout(saveTimer.current)
    const write = async () => {
      pendingSave.current = null
      try {
        await mappingApi.updateScene(next.id, { name: next.name, description: next.description, layers: next.layers })
        await reloadScenes()
        if (serial.current === mine) setDraft(null)
        onError(null)
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Saving the elements failed')
      }
    }
    pendingSave.current = () => void write()
    saveTimer.current = window.setTimeout(write, SAVE_DELAY_MS)
  }

  const changeLayer = (id: string, patch: Partial<SceneLayer>) => {
    if (!scene) return
    save({ ...scene, layers: scene.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) })
  }

  const add = async (value: string) => {
    const kind = ADDABLE.find((a) => a.value === value)
    if (!kind || !cue) return
    const made = kind.make()
    if (scene) {
      save({ ...scene, layers: [...scene.layers, made] })
    } else {
      // No scene on this cue yet: start one holding just this element.
      setAdding(true)
      try {
        const taken = new Set(scenes.map((s) => s.name))
        let name = `${cue.name} elements`
        for (let n = 2; taken.has(name); n++) name = `${cue.name} elements ${n}`
        const created = await mappingApi.createScene({ name, description: 'Elements added in the Editor', layers: [made] })
        await mappingApi.updateCue(cue.id, { scene_id: created.id })
        await reloadScenes()
        await onShowChanged()
        onError(null)
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Adding the element failed')
        return
      } finally {
        setAdding(false)
      }
    }
    setLayerId(made.id)
    setPinIndex(made.type === 'countdown' ? 0 : null)
  }

  const remove = (id: string) => {
    if (!scene) return
    save({ ...scene, layers: scene.layers.filter((l) => l.id !== id) })
    if (layerId === id) {
      setLayerId(null)
      setPinIndex(null)
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

  const hint = !canEdit
    ? null
    : !layer
      ? elements.length
        ? 'Pick an element below to move it or change its colours, or add another.'
        : 'Add an element, then click the picture to put it where you want it.'
      : layer.type === 'countdown'
        ? 'Drag the countdown to move it. Pull the square corner to size it and the round handle to turn it.'
        : `Click the picture to put ${layerLabel(layer).toLowerCase()} there. Drag one to move it; click one to pick it, then use its handles to size or turn it.`

  return (
    <div className="space-y-3">
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
          <label className="block">
            <span className="label">Add an element</span>
            <select className="input w-auto py-1 text-sm" value="" disabled={adding}
              onChange={(e) => e.target.value && void add(e.target.value)}>
              <option value="">Add…</option>
              <optgroup label="Objects that react to people">
                {ADDABLE.filter((a) => !a.value.startsWith('countdown:')).map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </optgroup>
              <optgroup label="Countdowns">
                {ADDABLE.filter((a) => a.value.startsWith('countdown:')).map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </optgroup>
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 pb-1.5 text-xs text-slate-400">
          <input type="checkbox" className="accent-sky-500" checked={people} onChange={(e) => setPeople(e.target.checked)} />
          Pretend people walk by
        </label>
      </div>

      <ScenePreview
        show={show}
        scene={scene}
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
          if (!layer) return
          changeLayer(layer.id, { pins })
          setPinIndex(selected)
        }}
        overlay={boxes}
      />
      {hint && <p className="text-xs text-slate-500">{hint}</p>}

      {elements.length > 0 && (
        <ul className="space-y-1">
          {elements.map((l) => {
            const open = l.id === layer?.id
            return (
              <li key={l.id} className="rounded-md bg-panel-850 ring-1 ring-white/5">
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="flex shrink-0">
                    <span className="h-3 w-3 rounded-l-sm" style={{ background: l.color }} />
                    <span className="h-3 w-3 rounded-r-sm" style={{ background: l.color2 }} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-100">
                    {layerLabel(l)}
                    <span className="text-xs text-slate-500">
                      {l.type === 'countdown' ? '' : ` · ${l.pins!.length} placed`}
                    </span>
                  </span>
                  {canEdit && (
                    <>
                      <button className="btn-ghost px-2 py-0.5 text-xs"
                        onClick={() => {
                          setLayerId(open ? null : l.id)
                          setPinIndex(null)
                        }}>
                        {open ? 'Done' : 'Move and colours'}
                      </button>
                      <button className="btn-ghost px-2 py-0.5 text-xs text-rose-300" onClick={() => remove(l.id)}>
                        Remove
                      </button>
                    </>
                  )}
                </div>
                {open && (
                  <div className="grid gap-3 border-t border-white/[0.06] px-3 py-3 sm:grid-cols-2">
                    {l.type === 'countdown' ? (
                      <div className="sm:col-span-2">
                        <CountdownColorPickers layer={l} canEdit={canEdit} withLook
                          onChange={(patch) => changeLayer(l.id, patch)} />
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 text-xs text-slate-400">
                        Colours
                        <input type="color" className="h-7 w-12 cursor-pointer rounded bg-transparent" value={l.color}
                          onChange={(e) => changeLayer(l.id, { color: e.target.value })} />
                        <input type="color" className="h-7 w-12 cursor-pointer rounded bg-transparent" value={l.color2}
                          onChange={(e) => changeLayer(l.id, { color2: e.target.value })} />
                      </label>
                    )}
                    {pin && (
                      <>
                        <Slider label="Size of the picked one" min={0.3} max={3} step={0.05} value={pin.size}
                          onChange={(size) =>
                            changeLayer(l.id, { pins: l.pins!.map((p, i) => (i === pickedPin ? { ...p, size } : p)) })} />
                        <Slider label="Turn" min={-180} max={180} step={1} value={pin.rotation ?? 0}
                          onChange={(rotation) =>
                            changeLayer(l.id, { pins: l.pins!.map((p, i) => (i === pickedPin ? { ...p, rotation } : p)) })} />
                        {l.type !== 'countdown' && (
                          <button className="btn-ghost justify-self-start px-2 py-0.5 text-xs"
                            onClick={() => {
                              changeLayer(l.id, { pins: l.pins!.filter((_, i) => i !== pickedPin) })
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
      {scene && (
        <p className="text-xs text-slate-500">
          Saved in the scene “{scene.name}”, so the Scenes tab and the projectors show the same thing. The Scenes tab has
          more ways to make them move and react.
        </p>
      )}
    </div>
  )
}
