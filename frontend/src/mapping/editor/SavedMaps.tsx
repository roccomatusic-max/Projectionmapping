import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/api/client'
import { ConfirmDialog, EmptyState, Modal } from '@/components/ui'
import { mappingApi } from '../api'
import type { MapParts, SavedMap, Show } from '../types'

/**
 * Saved maps: keep this show's mapping by name, and copy one into it.
 *
 * A map is everything lined up for one building: each projector's slice,
 * corner pin, mesh, masks, blends and calibration, plus the traced house
 * parts. Saving it once means the next show starts already mapped.
 */
export function SavedMaps({
  show,
  canEdit,
  refreshKey,
  onError,
  onApplied,
}: {
  show: Show
  canEdit: boolean
  refreshKey: number
  onError: (message: string) => void
  onApplied: (message: string) => void
}) {
  const [maps, setMaps] = useState<SavedMap[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(show.name)
  const [busy, setBusy] = useState(false)
  const [replace, setReplace] = useState<string | null>(null)
  const [applying, setApplying] = useState<SavedMap | null>(null)
  const [deleting, setDeleting] = useState<SavedMap | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      setMaps(await mappingApi.listMaps())
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Loading the saved maps failed')
    }
  }, [onError])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const work = async (task: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await task()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const save = (mapName: string, overwrite = false) =>
    work(async () => {
      try {
        await mappingApi.saveMap(show.id, { name: mapName, replace: overwrite })
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setReplace(mapName)
          return
        }
        throw err
      }
      setSaving(false)
      onApplied(`Saved the map as "${mapName}".`)
      await load()
    })

  const download = (saved: SavedMap) =>
    work(async () => {
      const file = await mappingApi.exportMap(saved.id)
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${saved.name.replace(/[\\/:*?"<>|]+/g, '-')}.map.json`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    })

  const loadFile = (file: File) =>
    work(async () => {
      let body: unknown
      try {
        body = JSON.parse(await file.text())
      } catch {
        throw new Error(`${file.name} is not a saved map file.`)
      }
      try {
        const saved = await mappingApi.importMap(body)
        onApplied(`Loaded the map "${saved.name}". Use it in a show with "Use in this show".`)
      } catch (err) {
        if (err instanceof ApiError && err.status === 422) {
          throw new Error(`${file.name} is not a saved map from Projector Control, or it is damaged.`)
        }
        throw err
      }
      await load()
    })

  const hasMapping = show.outputs.length > 0 || show.surfaces.length > 0

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          {saving ? (
            <form
              className="flex flex-1 flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                if (name.trim()) void save(name.trim())
              }}
            >
              <input className="input min-w-[12rem] flex-1 py-1.5" value={name} autoFocus
                onChange={(e) => setName(e.target.value)} placeholder="Our house" aria-label="Map name" />
              <button className="btn-primary text-xs" disabled={busy || !name.trim()}>Save</button>
              <button type="button" className="btn-ghost text-xs" onClick={() => setSaving(false)}>Cancel</button>
            </form>
          ) : (
            <button className="btn-primary text-xs" disabled={!hasMapping || busy}
              title={hasMapping ? undefined : 'Add an output or trace the house first'}
              onClick={() => { setName(show.name); setSaving(true) }}>
              Save this show's map
            </button>
          )}
          <button className="btn-default text-xs" disabled={busy} onClick={() => fileInput.current?.click()}>
            Load a map file
          </button>
          <input ref={fileInput} type="file" accept=".json,application/json" className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void loadFile(file)
            }} />
        </div>
      )}

      {maps === null ? null : maps.length === 0 ? (
        <EmptyState title="No saved maps yet">
          Once this show lines up with the building, save its map. A new show can then start from it with every projector,
          calibration and traced house part already in place.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-white/[0.06] rounded-md ring-1 ring-white/[0.06]">
          {maps.map((saved) => (
            <li key={saved.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-100">{saved.name}</div>
                <div className="text-xs text-slate-500">{describe(saved)}</div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {canEdit && (
                  <button className="btn-primary px-2 py-1 text-xs" disabled={busy} onClick={() => setApplying(saved)}>
                    Use in this show
                  </button>
                )}
                <button className="btn-ghost px-2 py-1 text-xs" disabled={busy} onClick={() => void download(saved)}
                  title="Save it as a file, to load on another computer">
                  Download
                </button>
                {canEdit && (
                  <button className="btn-ghost px-2 py-1 text-xs text-red-300" disabled={busy} onClick={() => setDeleting(saved)}>
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {applying && (
        <ApplyDialog
          show={show}
          map={applying}
          busy={busy}
          onCancel={() => setApplying(null)}
          onApply={(parts) =>
            void work(async () => {
              const result = await mappingApi.applyMap(show.id, applying.id, parts)
              setApplying(null)
              const moved = result.players_moved
              onApplied(
                `${show.name} now uses the map "${applying.name}".` +
                  (moved ? ` ${moved} mini PC${moved === 1 ? '' : 's'} switched to this show.` : ''),
              )
            })
          }
        />
      )}

      <ConfirmDialog
        open={replace != null}
        title="Replace the saved map?"
        body={`A map named "${replace}" is already saved. Replace it with this show's map?`}
        confirmLabel="Replace"
        onCancel={() => setReplace(null)}
        onConfirm={() => {
          if (replace) void save(replace, true)
          setReplace(null)
        }}
      />
      <ConfirmDialog
        open={deleting != null}
        title="Delete saved map"
        body={`Delete the saved map "${deleting?.name}"? Shows that already use it keep their mapping.`}
        danger
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting
          setDeleting(null)
          if (target) void work(async () => { await mappingApi.deleteMap(target.id); await load() })
        }}
      />
    </div>
  )
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function describe(saved: SavedMap) {
  const parts = [plural(saved.output_count, 'projector')]
  if (saved.output_names.length) parts[0] += ` (${saved.output_names.join(', ')})`
  if (saved.calibrated_count) parts.push(`${saved.calibrated_count} calibrated`)
  if (saved.surface_count) parts.push(plural(saved.surface_count, 'house part'))
  parts.push(`${saved.canvas_width}×${saved.canvas_height}`)
  return parts.join(' · ')
}

function ApplyDialog({
  show,
  map,
  busy,
  onApply,
  onCancel,
}: {
  show: Show
  map: SavedMap
  busy: boolean
  onApply: (parts: MapParts) => void
  onCancel: () => void
}) {
  const [parts, setParts] = useState<MapParts>({
    outputs: map.output_count > 0,
    surfaces: map.surface_count > 0,
    players: false,
  })
  const toggle = (key: keyof MapParts) => setParts((p) => ({ ...p, [key]: !p[key] }))
  const resize = show.canvas_width !== map.canvas_width || show.canvas_height !== map.canvas_height
  return (
    <Modal open label={`Use ${map.name}`} onClose={onCancel}>
      <div className="space-y-4 p-5">
        <div>
          <h3 className="text-base font-semibold text-slate-50">Use “{map.name}” in {show.name}</h3>
          <p className="mt-1 text-sm text-slate-400">Cues and media stay as they are. Choose what to copy in:</p>
        </div>
        <div className="space-y-3 text-sm">
          <Check checked={parts.outputs} disabled={map.output_count === 0} onChange={() => toggle('outputs')}
            label={`Projector outputs (${map.output_count})`}
            hint={`Slices, corner pins, meshes, masks, blends and calibration.${show.outputs.length ? ` Replaces this show's ${plural(show.outputs.length, 'output')}.` : ''}`} />
          <Check checked={parts.surfaces} disabled={map.surface_count === 0} onChange={() => toggle('surfaces')}
            label={`Traced house parts (${map.surface_count})`}
            hint={`Walls, roof, windows and doors for the scenes.${show.surfaces.length ? ` Replaces the ${plural(show.surfaces.length, 'part')} traced here.` : ''}`} />
          {map.player_count > 0 && (
            <Check checked={parts.players && parts.outputs} disabled={!parts.outputs} onChange={() => toggle('players')}
              label="Switch the mini PCs to this show"
              hint={`The ${plural(map.player_count, 'mini PC')} that showed these outputs will show ${show.name} from now on, even if another show is playing.`} />
          )}
        </div>
        {resize && (
          <p className="rounded-md bg-panel-850 px-3 py-2 text-xs text-slate-400">
            The canvas changes from {show.canvas_width}×{show.canvas_height} to {map.canvas_width}×{map.canvas_height} so
            everything lines up as it was saved.
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="btn-default" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" disabled={busy || (!parts.outputs && !parts.surfaces)}
            onClick={() => onApply({ ...parts, players: parts.players && parts.outputs })}>
            Use this map
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Check({
  checked,
  disabled,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  disabled?: boolean
  onChange: () => void
  label: string
  hint: string
}) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input type="checkbox" className="mt-0.5" checked={checked} disabled={disabled} onChange={onChange} />
      <span>
        <span className="block font-medium text-slate-200">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  )
}
