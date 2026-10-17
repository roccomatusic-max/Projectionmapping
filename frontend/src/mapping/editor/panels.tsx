import { useRef, useState } from 'react'
import { classNames } from '@/lib/format'
import { probeMedia, uploadMedia } from '../api'
import type { Cue, Fit, Interaction, MappingScene, MediaAsset, Show, TransportState } from '../types'
import { formatBytes, formatDuration } from './controls'

// -- cue list --------------------------------------------------------------------

export function CueList({
  show,
  media,
  scenes = [],
  transport,
  canEdit,
  canRun,
  onUpdate,
  onDelete,
  onMove,
  onGoto,
  compact = false,
}: {
  show: Show
  media: MediaAsset[]
  /** The scene library, for the cue's Scene choice. */
  scenes?: MappingScene[]
  transport: TransportState | null
  canEdit: boolean
  canRun: boolean
  /** Remote view: name and a big play button, no editing. */
  compact?: boolean
  onUpdate: (cue: Cue, patch: Partial<Cue>) => void
  onDelete: (cue: Cue) => void
  onMove: (cue: Cue, delta: -1 | 1) => void
  onGoto: (cue: Cue) => void
}) {
  const live = transport?.show_id === show.id && transport.status !== 'stopped' ? transport.current : null
  if (show.cues.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No cues yet. Upload media below and add it as a cue, or add a scene from the Scenes tab. GO steps through
        the cues in order.
      </p>
    )
  }
  if (compact) {
    return (
      <ol className="space-y-2">
        {show.cues.map((cue, index) => {
          const isLive = live?.id === cue.id
          const asset = media.find((m) => m.id === cue.media_id)
          const scene = scenes.find((s) => s.id === cue.scene_id)
          return (
            <li key={cue.id}>
              <button
                className={classNames(
                  'flex w-full items-center gap-3 rounded-md px-4 py-3 text-left ring-1 transition-colors disabled:opacity-60',
                  isLive ? 'bg-emerald-500/15 ring-emerald-500/40' : 'bg-panel-850 ring-white/5 hover:bg-panel-800',
                )}
                disabled={!canRun}
                onClick={() => onGoto(cue)}
              >
                <span className="tnum w-6 text-lg font-semibold text-slate-400">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base text-slate-100">
                    {cue.name || asset?.name || scene?.name || 'Black'}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {asset ? `${asset.kind} · ${formatDuration(asset.duration)}` : scene ? 'scene' : 'black'}
                    {asset && scene ? ' · scene' : ''}
                    {cue.loop ? ' · loops' : ''}
                  </span>
                </span>
                <span className={classNames('text-sm font-medium', isLive ? 'text-emerald-300' : 'text-sky-300')}>
                  {isLive ? 'Live' : 'Play'}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    )
  }
  return (
    <ol className="space-y-2">
      {show.cues.map((cue, index) => {
        const isLive = live?.id === cue.id
        const asset = media.find((m) => m.id === cue.media_id)
        const scene = scenes.find((s) => s.id === cue.scene_id)
        return (
          <li
            key={cue.id}
            className={classNames(
              'rounded-md p-3 ring-1',
              isLive ? 'bg-emerald-500/10 ring-emerald-500/40' : 'bg-panel-850 ring-white/5',
            )}
          >
            <div className="flex items-center gap-2">
              <span className="tnum w-6 shrink-0 text-center text-sm font-semibold text-slate-400">{index + 1}</span>
              <input
                className="input py-1 text-sm"
                defaultValue={cue.name}
                key={`${cue.id}:${cue.name}`}
                placeholder={asset?.name ?? scene?.name ?? 'Untitled cue'}
                disabled={!canEdit}
                onBlur={(event) => event.target.value !== cue.name && onUpdate(cue, { name: event.target.value })}
              />
              <button
                className={classNames('btn shrink-0 px-3 py-1 text-xs', isLive ? 'bg-emerald-600 text-white' : 'btn-default')}
                disabled={!canRun}
                onClick={() => onGoto(cue)}
                title="Jump straight to this cue"
              >
                {isLive ? 'Live' : 'Play'}
              </button>
            </div>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 pl-8">
              <select
                className="input py-1 text-xs"
                value={cue.media_id ?? ''}
                disabled={!canEdit}
                onChange={(event) => onUpdate(cue, { media_id: event.target.value ? Number(event.target.value) : null })}
              >
                <option value="">Black</option>
                {media.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <select
                className="input py-1 text-xs"
                value={cue.fit}
                disabled={!canEdit}
                onChange={(event) => onUpdate(cue, { fit: event.target.value as Fit })}
                title="How the media fits the canvas"
              >
                <option value="fill">Fill</option>
                <option value="fit">Fit</option>
                <option value="stretch">Stretch</option>
              </select>
              {(scenes.length > 0 || cue.scene_id != null) && (
                <select
                  className="input col-span-2 py-1 text-xs"
                  value={cue.scene_id ?? ''}
                  disabled={!canEdit}
                  title="A reactive scene drawn over the media (or on its own over black)"
                  onChange={(event) => onUpdate(cue, { scene_id: event.target.value ? Number(event.target.value) : null })}
                >
                  <option value="">No scene</option>
                  {scenes.map((s) => (
                    <option key={s.id} value={s.id}>
                      Scene: {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 pl-8">
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                <input type="checkbox" className="accent-sky-500" checked={cue.loop} disabled={!canEdit}
                  onChange={(event) => onUpdate(cue, { loop: event.target.checked })} />
                Loop
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-400" title="Crossfade into this cue">
                Fade
                <input type="number" className="input w-16 py-1 text-xs" min={0} max={60} step={0.5}
                  defaultValue={cue.fade_seconds} key={`f${cue.id}:${cue.fade_seconds}`} disabled={!canEdit}
                  onBlur={(event) => {
                    const v = Number(event.target.value)
                    if (Number.isFinite(v) && v !== cue.fade_seconds) onUpdate(cue, { fade_seconds: v })
                  }} />
                s
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-400"
                title="Go to the next cue by itself after this long. Empty: wait for GO (a non-looping video advances when it ends).">
                Auto
                <input type="number" className="input w-16 py-1 text-xs" min={0} step={1} placeholder="—"
                  defaultValue={cue.follow_seconds ?? ''} key={`a${cue.id}:${cue.follow_seconds}`} disabled={!canEdit}
                  onBlur={(event) => {
                    const v = event.target.value === '' ? null : Number(event.target.value)
                    if (v !== cue.follow_seconds && (v === null || v > 0)) onUpdate(cue, { follow_seconds: v })
                  }} />
                s
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-400"
                title="A simple effect people seen by a depth camera have on the media. Scenes do much more.">
                People
                <select className="input w-auto py-1 text-xs" value={cue.interaction ?? 'none'} disabled={!canEdit}
                  onChange={(event) => onUpdate(cue, { interaction: event.target.value as Interaction })}>
                  <option value="none">No effect</option>
                  <option value="spotlight">Spotlight</option>
                  <option value="ripple">Ripple</option>
                </select>
              </label>
              <span className="ml-auto flex items-center gap-1">
                <span className="mr-2 text-xs text-slate-500">
                  {asset ? `${asset.kind} · ${formatDuration(asset.duration)}` : ''}
                </span>
                <button className="btn-ghost px-2 py-1 text-xs" disabled={!canEdit || index === 0}
                  onClick={() => onMove(cue, -1)} aria-label="Move up">↑</button>
                <button className="btn-ghost px-2 py-1 text-xs" disabled={!canEdit || index === show.cues.length - 1}
                  onClick={() => onMove(cue, 1)} aria-label="Move down">↓</button>
                <button className="btn-ghost px-2 py-1 text-xs text-red-300" disabled={!canEdit}
                  onClick={() => onDelete(cue)}>Delete</button>
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// -- media library ---------------------------------------------------------------

const ACCEPT = '.mp4,.m4v,.mov,.webm,.png,.jpg,.jpeg,.webp'

interface Upload {
  id: number
  name: string
  progress: number
  error?: string
}

let uploadId = 0

export function MediaLibrary({
  media,
  canEdit,
  onUploaded,
  onDelete,
  onAddCue,
}: {
  media: MediaAsset[]
  canEdit: boolean
  onUploaded: () => void
  onDelete: (asset: MediaAsset) => void
  onAddCue: (asset: MediaAsset) => void
}) {
  const [uploads, setUploads] = useState<Upload[]>([])
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const upload = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const id = ++uploadId
      setUploads((list) => [...list, { id, name: file.name, progress: 0 }])
      const set = (patch: Partial<Upload>) =>
        setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)))
      try {
        const probed = await probeMedia(file)
        await uploadMedia(file, probed, (progress) => set({ progress }))
        setUploads((list) => list.filter((u) => u.id !== id))
        onUploaded()
      } catch (err) {
        set({ error: err instanceof Error ? err.message : 'Upload failed' })
      }
    }
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <div
          className={classNames(
            'flex flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-5 text-center text-sm transition-colors',
            over ? 'border-sky-400 bg-sky-500/10 text-sky-200' : 'border-white/15 text-slate-400',
          )}
          onDragOver={(event) => {
            event.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setOver(false)
            void upload(event.dataTransfer.files)
          }}
        >
          <p>Drop video or images here</p>
          <button className="btn-ghost text-xs" onClick={() => input.current?.click()}>
            or choose files
          </button>
          <p className="text-xs text-slate-500">H.264 or HEVC (.mp4 .mov .webm), PNG, JPEG, WebP</p>
          <input ref={input} type="file" multiple accept={ACCEPT} className="hidden"
            onChange={(event) => event.target.files && void upload(event.target.files)} />
        </div>
      )}
      {uploads.map((u) => (
        <div key={u.id} className="rounded-md bg-panel-850 px-3 py-2 text-xs ring-1 ring-white/5">
          <div className="flex justify-between gap-2">
            <span className="truncate text-slate-200">{u.name}</span>
            <span className={u.error ? 'text-red-300' : 'tnum text-slate-400'}>
              {u.error ?? `${Math.round(u.progress * 100)} %`}
            </span>
          </div>
          {!u.error && (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sky-500/15">
              <div className="h-full rounded-full bg-sky-400" style={{ width: `${u.progress * 100}%` }} />
            </div>
          )}
        </div>
      ))}
      {media.length === 0 && uploads.length === 0 && <p className="text-sm text-slate-500">The library is empty.</p>}
      <ul className="divide-y divide-white/5">
        {media.map((asset) => (
          <li key={asset.id} className="flex items-center gap-3 py-2">
            <span className="chip shrink-0 bg-panel-800 text-slate-400 ring-1 ring-white/5">{asset.kind}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-slate-200">{asset.name}</p>
              <p className="text-xs text-slate-500">
                {asset.width && asset.height ? `${asset.width} × ${asset.height}` : 'size unknown'}
                {asset.kind === 'video' ? ` · ${formatDuration(asset.duration)}` : ''} · {formatBytes(asset.size_bytes)}
              </p>
            </div>
            {canEdit && (
              <>
                <button className="btn-default px-2 py-1 text-xs" onClick={() => onAddCue(asset)}>
                  Add cue
                </button>
                <button className="btn-ghost px-2 py-1 text-xs text-red-300" onClick={() => onDelete(asset)}>
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// -- canvas overview ----------------------------------------------------------------

const OUTPUT_COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#2dd4bf', '#fb7185', '#facc15']

export function outputColor(index: number) {
  return OUTPUT_COLORS[index % OUTPUT_COLORS.length]
}
