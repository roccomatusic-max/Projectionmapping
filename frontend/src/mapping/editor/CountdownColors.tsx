import { COUNTDOWN_COLORS, KIND } from '../scene/catalog'
import { COUNTDOWN_PARTS, countdownLookColors } from '../scene/countdown'
import type { CountdownColors, SceneLayer } from '../types'

type Part = (typeof COUNTDOWN_PARTS)[number]['id']

/** What picking a look does to a countdown: its banner and glow, and every part back to the look's own colour. */
export function countdownLook(style: string): Partial<SceneLayer> {
  return { style, ...(COUNTDOWN_COLORS[style] ?? COUNTDOWN_COLORS.gold), colors: null }
}

/**
 * A colour picker for each part of a countdown (number, words, banner,
 * stitching, clock, decorations, glow), each starting from the look's own
 * colour, and "Reset to preset" to go back to the look. With ``withLook``
 * the look itself can be picked here too.
 */
export function CountdownColorPickers({
  layer,
  canEdit,
  withLook = false,
  onChange,
}: {
  layer: SceneLayer
  canEdit: boolean
  withLook?: boolean
  onChange: (patch: Partial<SceneLayer>) => void
}) {
  const look = countdownLookColors(layer.style)
  const preset = COUNTDOWN_COLORS[layer.style] ?? COUNTDOWN_COLORS.gold
  const own = layer.colors ?? {}
  const valueOf = (id: Part) => (id === 'banner' ? layer.color : id === 'glow' ? layer.color2 : own[id] ?? look[id])
  // Picked by hand, rather than the look's own.
  const picked = (id: Part) =>
    id === 'banner'
      ? layer.color.toLowerCase() !== preset.color.toLowerCase()
      : id === 'glow'
        ? layer.color2.toLowerCase() !== preset.color2.toLowerCase()
        : !!own[id]
  const set = (id: Part, value: string) => {
    if (id === 'banner') onChange({ color: value })
    else if (id === 'glow') onChange({ color2: value })
    else onChange({ colors: { ...own, [id]: value } as CountdownColors })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        {withLook && (
          <label className="block">
            <span className="label">Look</span>
            <select className="input w-auto py-1 text-sm" value={layer.style} disabled={!canEdit}
              onChange={(e) => onChange(countdownLook(e.target.value))}>
              {KIND.countdown.styles.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        )}
        <button className="btn-ghost px-2 py-1 text-xs" disabled={!canEdit || !COUNTDOWN_PARTS.some((p) => picked(p.id))}
          title="Every colour back to the look's own"
          onClick={() => onChange(countdownLook(layer.style))}>
          Reset to preset
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Colour for each part. Each starts as the look's own colour; picking a look starts them all over.
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
        {COUNTDOWN_PARTS.map((part) => (
          <label key={part.id} className="flex min-w-0 items-center gap-2 text-xs text-slate-300">
            <input type="color" className="h-7 w-10 shrink-0 cursor-pointer rounded bg-transparent"
              value={valueOf(part.id)} disabled={!canEdit} aria-label={part.label}
              onChange={(e) => set(part.id, e.target.value)} />
            <span className="min-w-0 truncate">
              {part.label}
              {!picked(part.id) && <span className="text-slate-500"> (look's)</span>}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
