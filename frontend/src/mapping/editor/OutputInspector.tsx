import { useEffect, useState } from 'react'
import type { Projector } from '@/api/types'
import { defaultBlend, defaultColor, defaultWarp, emptyMesh, resampleMesh } from '../geometry'
import type { ServerClock } from '../live'
import type { Playback } from '../playback'
import type { BlendEdge, Mask, Output, Show, TestPattern } from '../types'
import { NumberField, Segmented, Slider, Toggle } from './controls'
import { type EditMode, WarpEditor } from './WarpEditor'

type Tab = 'geometry' | 'masks' | 'blend' | 'color' | 'output'

const PATTERNS: Array<{ value: TestPattern; label: string; title: string }> = [
  { value: 'none', label: 'Show', title: 'The live show content' },
  { value: 'grid', label: 'Grid', title: 'Canvas grid: lines meet across projectors when aligned' },
  { value: 'id', label: 'ID', title: 'Output name, corners and crosshair' },
  { value: 'white', label: 'White', title: 'Full white, for checking blends' },
  { value: 'red', label: 'R', title: 'Red' },
  { value: 'green', label: 'G', title: 'Green' },
  { value: 'blue', label: 'B', title: 'Blue' },
  { value: 'black', label: 'Black', title: 'Black' },
]

const MESH_SIZES = [0, 3, 4, 5, 7, 9]

export function OutputInspector({
  show,
  output,
  projectors,
  playback,
  clock,
  canEdit,
  onChange,
  onDelete,
  onOpenWindow,
  onIdentify,
}: {
  show: Show
  output: Output
  projectors: Projector[]
  playback: Playback
  clock: ServerClock
  canEdit: boolean
  onChange: (patch: Partial<Output>) => void
  onDelete: () => void
  onOpenWindow: () => void
  onIdentify: () => void
}) {
  const [tab, setTab] = useState<Tab>('geometry')
  const [mode, setMode] = useState<EditMode>('corners')
  const [selectedMask, setSelectedMask] = useState<number | null>(null)

  useEffect(() => {
    setSelectedMask(null)
  }, [output.id])

  // The editing mode follows the tab, so the handles match the controls.
  const editMode: EditMode = tab === 'masks' ? 'masks' : mode === 'masks' ? 'corners' : mode
  const meshSize = output.warp.mesh?.cols ?? 0

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Segmented
            value={output.test_pattern}
            options={PATTERNS}
            disabled={!canEdit}
            onChange={(test_pattern) => onChange({ test_pattern })}
          />
          <div className="flex gap-2">
            <button className="btn-ghost text-xs" onClick={onIdentify} title="Flash this output's name on its projector">
              Identify
            </button>
            <button className="btn-default text-xs" onClick={onOpenWindow}>
              Open output window
            </button>
          </div>
        </div>
        <WarpEditor
          output={output}
          canvasWidth={show.canvas_width}
          canvasHeight={show.canvas_height}
          playback={playback}
          clock={clock}
          mode={editMode}
          selectedMask={selectedMask}
          readOnly={!canEdit}
          onChange={onChange}
          onSelectMask={setSelectedMask}
        />
      </div>

      <div className="min-w-0 space-y-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'geometry', label: 'Warp' },
            { value: 'masks', label: 'Masks' },
            { value: 'blend', label: 'Blend' },
            { value: 'color', label: 'Colour' },
            { value: 'output', label: 'Output' },
          ]}
        />

        {tab === 'geometry' && (
          <div className="space-y-4">
            <div>
              <span className="label">Handles</span>
              <Segmented
                value={editMode === 'mesh' ? 'mesh' : 'corners'}
                onChange={(value) => setMode(value as EditMode)}
                options={[
                  { value: 'corners', label: 'Corner pin' },
                  { value: 'mesh', label: 'Mesh', title: output.warp.mesh ? undefined : 'Turn on a mesh first' },
                ]}
              />
            </div>
            <div>
              <span className="label">Mesh warp</span>
              <Segmented
                value={String(meshSize)}
                disabled={!canEdit}
                onChange={(value) => {
                  const n = Number(value)
                  onChange({
                    warp: { ...output.warp, mesh: n ? resampleMesh(output.warp.mesh, n, n) : null },
                  })
                  setMode(n ? 'mesh' : 'corners')
                }}
                options={MESH_SIZES.map((n) => ({ value: String(n), label: n ? `${n}×${n}` : 'Off' }))}
              />
              <p className="mt-1.5 text-xs text-slate-500">
                For curved or uneven surfaces. The corner pin still sets the overall shape.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {output.warp.corners.map(([x, y], i) => (
                <div key={i} className="rounded-md bg-panel-850 px-2.5 py-2 text-xs ring-1 ring-white/5">
                  <p className="text-slate-500">{['Top left', 'Top right', 'Bottom right', 'Bottom left'][i]}</p>
                  <p className="tnum text-slate-200">
                    {(x * output.width).toFixed(1)}, {(y * output.height).toFixed(1)}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-default text-xs"
                disabled={!canEdit}
                onClick={() => onChange({ warp: { ...defaultWarp(), mesh: output.warp.mesh } })}
              >
                Reset corners
              </button>
              <button
                className="btn-default text-xs"
                disabled={!canEdit || !output.warp.mesh}
                onClick={() =>
                  output.warp.mesh &&
                  onChange({ warp: { ...output.warp, mesh: emptyMesh(output.warp.mesh.cols, output.warp.mesh.rows) } })
                }
              >
                Flatten mesh
              </button>
            </div>
          </div>
        )}

        {tab === 'masks' && (
          <MasksPanel
            masks={output.masks}
            selected={selectedMask}
            canEdit={canEdit}
            onSelect={setSelectedMask}
            onChange={(masks) => onChange({ masks })}
          />
        )}

        {tab === 'blend' && (
          <div className="space-y-4">
            {(['left', 'right', 'top', 'bottom'] as const).map((edge) => (
              <BlendEdgeControls
                key={edge}
                name={edge}
                value={output.blend[edge]}
                disabled={!canEdit}
                onChange={(value) => onChange({ blend: { ...output.blend, [edge]: value } })}
              />
            ))}
            <button className="btn-default text-xs" disabled={!canEdit} onClick={() => onChange({ blend: defaultBlend() })}>
              Clear blends
            </button>
            <p className="text-xs text-slate-500">
              Width is the share of this output that overlaps its neighbour. Check with the White pattern: the
              overlap should be as bright as the rest, with no band.
            </p>
          </div>
        )}

        {tab === 'color' && (
          <div className="space-y-3">
            <Slider label="Brightness" value={output.color.brightness} min={0} max={2} step={0.01} disabled={!canEdit}
              onChange={(brightness) => onChange({ color: { ...output.color, brightness } })} />
            <Slider label="Gamma" value={output.color.gamma} min={0.2} max={3} step={0.01} disabled={!canEdit}
              onChange={(gamma) => onChange({ color: { ...output.color, gamma } })} />
            {(['red', 'green', 'blue'] as const).map((channel) => (
              <Slider key={channel} label={channel[0].toUpperCase() + channel.slice(1)} value={output.color[channel]}
                min={0} max={2} step={0.01} disabled={!canEdit}
                onChange={(value) => onChange({ color: { ...output.color, [channel]: value } })} />
            ))}
            <button className="btn-default text-xs" disabled={!canEdit} onClick={() => onChange({ color: defaultColor() })}>
              Reset colour
            </button>
          </div>
        )}

        {tab === 'output' && (
          <OutputSettings
            show={show}
            output={output}
            projectors={projectors}
            canEdit={canEdit}
            onChange={onChange}
            onDelete={onDelete}
          />
        )}
      </div>
    </div>
  )
}

function BlendEdgeControls({
  name,
  value,
  disabled,
  onChange,
}: {
  name: string
  value: BlendEdge
  disabled: boolean
  onChange: (value: BlendEdge) => void
}) {
  return (
    <div className="rounded-md bg-panel-850 p-3 ring-1 ring-white/5">
      <p className="mb-2 text-xs font-medium capitalize text-slate-300">{name} edge</p>
      <div className="space-y-2">
        <Slider label="Width" value={value.width} min={0} max={0.5} step={0.005} disabled={disabled}
          format={(v) => `${(v * 100).toFixed(1)} %`} onChange={(width) => onChange({ ...value, width })} />
        {value.width > 0 && (
          <>
            <Slider label="Gamma" value={value.gamma} min={0.5} max={4} step={0.05} disabled={disabled}
              onChange={(gamma) => onChange({ ...value, gamma })} />
            <Slider label="Curve" value={value.curve} min={0} max={1} step={0.05} disabled={disabled}
              format={(v) => (v === 0 ? 'linear' : v === 1 ? 'S-curve' : v.toFixed(2))}
              onChange={(curve) => onChange({ ...value, curve })} />
          </>
        )}
      </div>
    </div>
  )
}

function MasksPanel({
  masks,
  selected,
  canEdit,
  onSelect,
  onChange,
}: {
  masks: Mask[]
  selected: number | null
  canEdit: boolean
  onSelect: (index: number | null) => void
  onChange: (masks: Mask[]) => void
}) {
  const update = (index: number, patch: Partial<Mask>) =>
    onChange(masks.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  return (
    <div className="space-y-3">
      {masks.length === 0 && (
        <p className="text-xs text-slate-500">
          Masks black out parts of the image: windows, doors, trees, the neighbour's wall.
        </p>
      )}
      {masks.map((mask, i) => (
        <div
          key={i}
          className={
            'rounded-md p-3 ring-1 ' +
            (i === selected ? 'bg-panel-800 ring-rose-500/50' : 'bg-panel-850 ring-white/5')
          }
          onClick={() => onSelect(i)}
        >
          <div className="flex items-center gap-2">
            <input
              className="input py-1 text-xs"
              value={mask.name}
              placeholder={`Mask ${i + 1}`}
              disabled={!canEdit}
              onChange={(event) => update(i, { name: event.target.value })}
            />
            <button
              className="btn-ghost px-2 py-1 text-xs text-red-300"
              disabled={!canEdit}
              onClick={(event) => {
                event.stopPropagation()
                onChange(masks.filter((_, j) => j !== i))
                onSelect(null)
              }}
            >
              Delete
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-4">
            <Toggle checked={mask.enabled} label="On" disabled={!canEdit} onChange={(enabled) => update(i, { enabled })} />
            <Toggle checked={mask.invert} label="Keep inside only" disabled={!canEdit}
              onChange={(invert) => update(i, { invert })} />
          </div>
          <div className="mt-2">
            <Slider label="Feather" value={mask.feather} min={0} max={200} step={1} disabled={!canEdit}
              format={(v) => `${v.toFixed(0)} px`} onChange={(feather) => update(i, { feather })} />
          </div>
        </div>
      ))}
      <button
        className="btn-default text-xs"
        disabled={!canEdit || masks.length >= 64}
        onClick={() => {
          onChange([
            ...masks,
            {
              name: '',
              points: [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6]],
              feather: 0,
              invert: false,
              enabled: true,
            },
          ])
          onSelect(masks.length)
        }}
      >
        Add mask
      </button>
    </div>
  )
}

function OutputSettings({
  show,
  output,
  projectors,
  canEdit,
  onChange,
  onDelete,
}: {
  show: Show
  output: Output
  projectors: Projector[]
  canEdit: boolean
  onChange: (patch: Partial<Output>) => void
  onDelete: () => void
}) {
  const cw = show.canvas_width
  const ch = show.canvas_height
  const s = output.source
  const setSource = (patch: Partial<typeof s>) => onChange({ source: { ...s, ...patch } })
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="label">Name</span>
        <input className="input" value={output.name} disabled={!canEdit}
          onChange={(event) => event.target.value && onChange({ name: event.target.value })} />
      </label>
      <label className="block">
        <span className="label">Projector</span>
        <select
          className="input"
          value={output.projector_id ?? ''}
          disabled={!canEdit}
          onChange={(event) => onChange({ projector_id: event.target.value ? Number(event.target.value) : null })}
        >
          <option value="">Not linked</option>
          {projectors.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.model}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Width" value={output.width} min={16} disabled={!canEdit} suffix="px"
          onChange={(width) => onChange({ width: Math.round(width) })} />
        <NumberField label="Height" value={output.height} min={16} disabled={!canEdit} suffix="px"
          onChange={(height) => onChange({ height: Math.round(height) })} />
      </div>
      <div>
        <p className="label">Slice of the canvas ({cw} × {ch})</p>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={s.x * cw} disabled={!canEdit} suffix="px" onChange={(x) => setSource({ x: x / cw })} />
          <NumberField label="Y" value={s.y * ch} disabled={!canEdit} suffix="px" onChange={(y) => setSource({ y: y / ch })} />
          <NumberField label="Width" value={s.w * cw} min={1} disabled={!canEdit} suffix="px"
            onChange={(w) => w > 0 && setSource({ w: w / cw })} />
          <NumberField label="Height" value={s.h * ch} min={1} disabled={!canEdit} suffix="px"
            onChange={(h) => h > 0 && setSource({ h: h / ch })} />
        </div>
      </div>
      <Toggle checked={output.enabled} label="Output on" disabled={!canEdit} onChange={(enabled) => onChange({ enabled })} />
      <div className="border-t border-white/5 pt-4">
        <button className="btn-danger text-xs" disabled={!canEdit} onClick={onDelete}>
          Delete output
        </button>
      </div>
    </div>
  )
}
