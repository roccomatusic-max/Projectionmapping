import { Copy, Trash2 } from 'lucide-react'
import type { ClipEntrance, MediaAsset, Output, SceneLayer, Show, TimelineClip } from '../types'
import { ENTRANCES, fillPin, fitPin, mediaAspect } from '../scene/timeline'
import { Slider } from './controls'
import { CountdownColorPickers } from './CountdownColors'
import { InfoFields } from './InfoFields'
import { clockText } from './TimelineTracks'

/** Where a picture or video may show, as layers can (scene/catalog targets). */
const TARGETS: Array<{ id: NonNullable<TimelineClip['target']>; label: string }> = [
  { id: 'everywhere', label: 'Anywhere it is put' },
  { id: 'building', label: 'Only on the house' },
  { id: 'walls', label: 'Only on the walls' },
  { id: 'roof', label: 'Only on the roof' },
  { id: 'windows', label: 'Only in the windows' },
  { id: 'doors', label: 'Only on the doors' },
  { id: 'outside', label: 'Only off the house' },
  { id: 'ground', label: 'Only on the driveway or ground' },
]

function Seconds({ label, value, min = 0, max, disabled, onChange }: {
  label: string
  value: number
  min?: number
  max?: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="flex items-center gap-1">
        <input type="number" className="input tnum py-1" step={0.1} min={min} max={max} disabled={disabled}
          key={value}
          defaultValue={Math.round(value * 100) / 100}
          onBlur={(e) => {
            const v = Math.round(Number(e.target.value) * 100) / 100
            if (e.target.value !== '' && Number.isFinite(v) && v !== value) onChange(Math.max(min, max != null ? Math.min(max, v) : v))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }} />
        <span className="text-xs text-slate-500">s</span>
      </span>
    </label>
  )
}

/**
 * Everything about the clip picked on the timeline: when it plays, how it
 * comes in and goes out, how strongly it shows, its moves, and what each
 * kind has of its own (a video's sound, a sound's projector, an element's
 * colours and words).
 */
export function ClipInspector({
  clip,
  asset,
  show,
  outputs,
  canEdit,
  local,
  onNow,
  pinIndex,
  canvasAspect,
  onChange,
  onAddMove,
  onJump,
  onDuplicate,
  onRemove,
  onPinIndex,
}: {
  clip: TimelineClip
  asset: MediaAsset | undefined
  show: Show
  outputs: Output[]
  canEdit: boolean
  /** Seconds since the clip started, at the playhead. */
  local: number
  /** The playhead is inside the clip. */
  onNow: boolean
  pinIndex: number | null
  canvasAspect: number
  onChange: (patch: Partial<TimelineClip>) => void
  onAddMove: () => void
  /** Move the playhead to ``t`` seconds into the clip. */
  onJump: (t: number) => void
  onDuplicate: () => void
  onRemove: () => void
  onPinIndex: (index: number | null) => void
}) {
  const off = !canEdit
  const sound = clip.kind === 'sound'
  const video = asset?.kind === 'video'
  const layer = clip.layer
  const changeLayer = (patch: Partial<SceneLayer>) => layer && onChange({ layer: { ...layer, ...patch } })
  const entrances = sound ? ENTRANCES.filter((e) => e.id === 'fade' || e.id === 'none') : ENTRANCES
  const first = [...outputs].sort((a, b) => a.position - b.position)[0]
  const aspect = mediaAspect(asset)
  const pin = clip.keys.length ? null : clip.pin

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input className="input py-1 text-sm font-medium" defaultValue={clip.name} key={`${clip.id}:${clip.name}`} disabled={off}
          aria-label="Clip name" maxLength={64}
          onBlur={(e) => e.target.value !== clip.name && onChange({ name: e.target.value })} />
        {canEdit && (
          <>
            <button type="button" className="btn-ghost shrink-0 px-2 py-1 text-xs" onClick={onDuplicate} title="Put a copy straight after this one">
              <Copy size={13} aria-hidden /> Copy
            </button>
            <button type="button" className="btn-ghost shrink-0 px-2 py-1 text-xs text-rose-300" onClick={onRemove} title="Take it off the timeline (Delete key)">
              <Trash2 size={13} aria-hidden /> Remove
            </button>
          </>
        )}
      </div>
      <p className="text-xs text-slate-500">
        {sound ? 'Sound' : clip.kind === 'element' ? 'Element' : video ? 'Video' : 'Picture'}
        {asset ? ` · ${asset.name}` : ''} · plays {clockText(clip.start)} to {clockText(clip.start + clip.length)}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Seconds label="Starts at" value={clip.start} disabled={off} onChange={(start) => onChange({ start })} />
        <Seconds label="Plays for" value={clip.length} min={0.1} disabled={off} onChange={(length) => onChange({ length })} />
        {(video || sound) && (
          <Seconds label="Start the file at" value={clip.offset} disabled={off} onChange={(offset) => onChange({ offset })} />
        )}
        {(video || sound) && (
          <label className="flex items-end gap-2 pb-1.5 text-xs text-slate-300">
            <input type="checkbox" className="accent-sky-500" checked={clip.loop} disabled={off} onChange={(e) => onChange({ loop: e.target.checked })} />
            Start the file again if it ends first
          </label>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="block">
            <span className="label">Comes in</span>
            <select className="input py-1 text-sm" value={clip.enter} disabled={off}
              onChange={(e) => onChange({ enter: e.target.value as ClipEntrance })}>
              {entrances.map((e) => <option key={e.id} value={e.id}>{e.into}</option>)}
            </select>
          </label>
          {clip.enter !== 'none' && (
            <Slider label="Over" min={0.1} max={10} step={0.1} value={clip.enter_seconds} disabled={off}
              format={(v) => `${v.toFixed(1)} s`} onChange={(enter_seconds) => onChange({ enter_seconds })} />
          )}
        </div>
        <div className="space-y-1">
          <label className="block">
            <span className="label">Goes out</span>
            <select className="input py-1 text-sm" value={clip.exit} disabled={off}
              onChange={(e) => onChange({ exit: e.target.value as ClipEntrance })}>
              {entrances.map((e) => <option key={e.id} value={e.id}>{e.out}</option>)}
            </select>
          </label>
          {clip.exit !== 'none' && (
            <Slider label="Over" min={0.1} max={10} step={0.1} value={clip.exit_seconds} disabled={off}
              format={(v) => `${v.toFixed(1)} s`} onChange={(exit_seconds) => onChange({ exit_seconds })} />
          )}
        </div>
      </div>

      {sound || (video && clip.sound) ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Slider label="Volume" min={0} max={1} step={0.01} value={clip.volume} disabled={off}
            format={(v) => `${Math.round(v * 100)} %`} onChange={(volume) => onChange({ volume })} />
          <label className="block">
            <span className="label">Plays from</span>
            <select className="input py-1 text-sm" value={clip.output_id ?? ''} disabled={off}
              onChange={(e) => onChange({ output_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">{first ? `The first projector's mini PC (${first.name})` : 'The first projector'}</option>
              {outputs.map((o) => <option key={o.id} value={o.id}>{o.name}'s mini PC</option>)}
            </select>
          </label>
        </div>
      ) : null}
      {video && (
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" className="accent-sky-500" checked={clip.sound} disabled={off} onChange={(e) => onChange({ sound: e.target.checked })} />
          Play the video's own sound too
        </label>
      )}

      {!sound && (
        <Slider label="How strongly it shows" min={0} max={1} step={0.01} value={clip.opacity} disabled={off}
          format={(v) => `${Math.round(v * 100)} %`} onChange={(opacity) => onChange({ opacity })} />
      )}

      {clip.kind === 'media' && (
        <div className="space-y-2">
          <label className="block">
            <span className="label">Where it shows</span>
            <select className="input py-1 text-sm" value={clip.target ?? 'everywhere'} disabled={off}
              onChange={(e) => onChange({ target: e.target.value as TimelineClip['target'] })}>
              {TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            {(clip.target ?? 'everywhere') !== 'everywhere' && show.surfaces.length === 0 && (
              <span className="mt-1 block text-xs text-amber-300">Trace the house parts first (Scenes → House parts), or it will not show.</span>
            )}
          </label>
          {canEdit && pin && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => onChange({ pin: fillPin(canvasAspect, aspect) })}>
                Cover the whole house
              </button>
              <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => onChange({ pin: fitPin(canvasAspect, aspect) })}>
                Show all of it
              </button>
              <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => onChange({ pin: { ...pin, rotation: 0 } })}>
                Straighten
              </button>
            </div>
          )}
        </div>
      )}

      {layer && (
        <div className="grid gap-3 sm:grid-cols-2">
          {layer.type === 'info' && (
            <div className="sm:col-span-2">
              <InfoFields layer={layer} canEdit={canEdit} onChange={changeLayer} />
            </div>
          )}
          {layer.type === 'countdown' ? (
            <div className="sm:col-span-2">
              <CountdownColorPickers layer={layer} canEdit={canEdit} withLook onChange={changeLayer} />
            </div>
          ) : (
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Colours
              <input type="color" className="h-7 w-12 cursor-pointer rounded bg-transparent" value={layer.color} disabled={off}
                onChange={(e) => changeLayer({ color: e.target.value })} />
              <input type="color" className="h-7 w-12 cursor-pointer rounded bg-transparent" value={layer.color2} disabled={off}
                onChange={(e) => changeLayer({ color2: e.target.value })} />
            </label>
          )}
          {(layer.type === 'movers' || layer.type === 'snowcap' || !layer.pins) && (
            <Slider label="Size" min={0} max={1} step={0.01} value={layer.size} disabled={off} onChange={(size) => changeLayer({ size })} />
          )}
          {layer.pins && layer.pins.length > 1 && layer.type === 'shapes' && pinIndex != null && canEdit && (
            <button type="button" className="btn-ghost justify-self-start px-2 py-0.5 text-xs"
              onClick={() => {
                const drop = <T,>(pins: T[]) => pins.filter((_, i) => i !== pinIndex)
                onChange({
                  layer: { ...layer, pins: drop(layer.pins!) },
                  keys: clip.keys.map((k) => (k.pins.length === layer.pins!.length ? { ...k, pins: drop(k.pins) } : k)),
                })
                onPinIndex(null)
              }}>
              Remove the picked one
            </button>
          )}
        </div>
      )}

      {!sound && (
        <div className="space-y-2 border-t border-white/[0.06] pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-100">Moves</span>
            <span className="text-xs text-slate-500">
              {clip.keys.length ? `${clip.keys.length} points; it glides from one to the next` : 'It stays where it is put'}
            </span>
            {canEdit && (
              <button type="button" className="btn-default ml-auto px-2 py-0.5 text-xs" disabled={!onNow}
                title={onNow ? 'Then drag it on the picture to where it should be at this moment' : 'Move the playhead into the clip first'}
                onClick={onAddMove}>
                Add a move here ({clockText(Math.max(0, Math.min(clip.length, local)))})
              </button>
            )}
          </div>
          {clip.keys.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {clip.keys.map((key, i) => (
                <li key={`${i}:${key.t}`} className="flex items-center rounded bg-panel-800 text-xs ring-1 ring-white/10">
                  <button type="button" className="px-2 py-0.5 text-slate-200 hover:text-white" onClick={() => onJump(key.t)}
                    title="Move the playhead here">
                    ◆ {clockText(key.t)}{key.opacity < 1 ? ` · ${Math.round(key.opacity * 100)} %` : ''}
                  </button>
                  {canEdit && (
                    <button type="button" className="px-1.5 py-0.5 text-slate-500 hover:text-rose-300" aria-label={`Remove the move at ${clockText(key.t)}`}
                      onClick={() => onChange({ keys: clip.keys.filter((_, j) => j !== i) })}>
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && clip.keys.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              {onNow && (
                <KeyOpacity clip={clip} local={local} onChange={onChange} />
              )}
              <button type="button" className="btn-ghost px-2 py-0.5 text-xs"
                onClick={() => {
                  // Keep it where the first move had it.
                  const firstPins = clip.keys[0].pins
                  if (clip.kind === 'media') onChange({ keys: [], pin: firstPins[0] ?? clip.pin })
                  else if (layer?.pins && firstPins.length) onChange({ keys: [], layer: { ...layer, pins: firstPins } })
                  else onChange({ keys: [] })
                }}>
                Stop it moving
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** How strongly it shows at the move under the playhead, when there is one there. */
function KeyOpacity({ clip, local, onChange }: { clip: TimelineClip; local: number; onChange: (patch: Partial<TimelineClip>) => void }) {
  const index = clip.keys.findIndex((k) => Math.abs(k.t - local) < 0.05)
  if (index < 0) return <span className="text-xs text-slate-500">Put the playhead on a move to fade it there.</span>
  const key = clip.keys[index]
  return (
    <div className="w-48">
      <Slider label={`Shows at ${clockText(key.t)}`} min={0} max={1} step={0.01} value={key.opacity}
        format={(v) => `${Math.round(v * 100)} %`}
        onChange={(opacity) => onChange({ keys: clip.keys.map((k, i) => (i === index ? { ...k, opacity } : k)) })} />
    </div>
  )
}
