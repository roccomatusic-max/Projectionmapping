import { useEffect, useMemo, useRef, useState } from 'react'
import { SearchInput } from '@/components/ui'
import { classNames } from '@/lib/format'
import {
  ELEMENT_KINDS,
  type ElementKind,
  LIBRARY,
  type LibraryItem,
  type Occasion,
  OCCASIONS,
  searchLibrary,
} from '../scene/library'
import { COUNTDOWN_PRESETS } from '../scene/catalog'
import { holidayOf, untilHoliday } from '../scene/countdown'
import type { SceneLayer } from '../types'
import { paintThumb, THUMB_H, THUMB_W } from './elementThumbs'

/** Cards painted per animation frame while the list fills in, so typing stays quick. */
const PAINT_PER_FRAME = 6

/** The holiday whose chip is picked when the library opens: the next one coming up. */
function seasonNow(): Occasion | null {
  const now = new Date()
  const m = now.getMonth()
  const d = now.getDate()
  if (m === 9 || (m === 10 && d === 1)) return 'halloween'
  if (m === 10) return 'thanksgiving'
  if (m === 11 && d < 27) return 'christmas'
  if ((m === 11 && d >= 27) || (m === 0 && d <= 2)) return 'new-year'
  if (m === 1 && d <= 15) return 'valentines'
  if ((m === 1 && d > 15) || (m === 2 && d <= 17)) return 'st-patricks'
  if (m === 6 && d <= 5) return 'fourth-of-july'
  // Otherwise the next holiday in the coming two weeks, if there is one.
  let soonest: Occasion | null = null
  let best = 15
  for (const p of COUNTDOWN_PRESETS) {
    const occasion = p.occasions[0] as Occasion
    if (p.id === 'birthday' || p.id === 'big-day' || occasion === 'winter') continue
    const c = untilHoliday(now.getTime(), holidayOf(p.style))
    const days = c.arrived ? 0 : c.days
    if (days < best) {
      best = days
      soonest = occasion
    }
  }
  return soonest
}

/**
 * Find an element to add: type what you want ("witch", "fireworks",
 * "snow"), or pick a holiday and a kind, and click its picture. The
 * pictures move while the pointer is over them.
 */
export function ElementLibrary({ onPick, disabled = false }: {
  onPick: (layer: SceneLayer, item: LibraryItem) => void
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const [occasion, setOccasion] = useState<Occasion | null>(() => seasonNow())
  const [kind, setKind] = useState<ElementKind | null>(null)
  const results = useMemo(() => searchLibrary(query, occasion, kind), [query, occasion, kind])
  // Starting to type searches every holiday; a holiday can be picked again to narrow it.
  const type = (value: string) => {
    if (!query.trim() && value.trim()) setOccasion(null)
    setQuery(value)
  }

  return (
    <div className="space-y-3">
      <SearchInput value={query} onChange={type}
        placeholder={`Search ${LIBRARY.length} elements: witch, fireworks, snow, turkey…`} />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Holiday">
        <ChipButton on={occasion == null} onClick={() => setOccasion(null)}>All holidays</ChipButton>
        {OCCASIONS.map((o) => (
          <ChipButton key={o.id} on={occasion === o.id} onClick={() => setOccasion(occasion === o.id ? null : o.id)}>
            {o.label}
          </ChipButton>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind">
        <ChipButton on={kind == null} onClick={() => setKind(null)}>Every kind</ChipButton>
        {ELEMENT_KINDS.map((k) => (
          <ChipButton key={k.id} on={kind === k.id} onClick={() => setKind(kind === k.id ? null : k.id)}>{k.label}</ChipButton>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        {results.length
          ? `${results.length} found. Click one to add it; point at it to see it move.`
          : 'Nothing matches. Try another word, or pick “All holidays”.'}
      </p>
      <Grid items={results} onPick={onPick} disabled={disabled} />
    </div>
  )
}

function ChipButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={classNames(
        'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
        on ? 'border-sky-400/60 bg-sky-500/20 text-sky-100' : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200',
      )}>
      {children}
    </button>
  )
}

function Grid({ items, onPick, disabled }: {
  items: LibraryItem[]
  onPick: (layer: SceneLayer, item: LibraryItem) => void
  disabled: boolean
}) {
  const canvases = useRef(new Map<string, HTMLCanvasElement>())
  const layers = useMemo(() => new Map(items.map((i) => [i.id, i.make()])), [items])
  const [hover, setHover] = useState<string | null>(null)

  // Paint the still pictures a few at a time.
  useEffect(() => {
    let raf = 0
    let next = 0
    const step = () => {
      for (let n = 0; n < PAINT_PER_FRAME && next < items.length; n++, next++) {
        const item = items[next]
        const canvas = canvases.current.get(item.id)
        if (canvas) paintThumb(item, layers.get(item.id)!, canvas, 1.2)
      }
      if (next < items.length) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [items, layers])

  // The one under the pointer moves.
  useEffect(() => {
    if (!hover) return
    const item = items.find((i) => i.id === hover)
    const canvas = canvases.current.get(hover)
    if (!item || !canvas) return
    const start = performance.now()
    let raf = 0
    const tick = () => {
      paintThumb(item, layers.get(item.id)!, canvas, 1.2 + (performance.now() - start) / 1000)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [hover, items, layers])

  return (
    <div className="grid max-h-[60vh] grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 overflow-y-auto pr-1">
      {items.map((item) => (
        <button key={item.id} type="button" disabled={disabled}
          className="group overflow-hidden rounded-lg border border-white/[0.08] bg-black/40 text-left transition hover:border-sky-400/50 disabled:opacity-50"
          onMouseEnter={() => setHover(item.id)} onMouseLeave={() => setHover((h) => (h === item.id ? null : h))}
          onFocus={() => setHover(item.id)} onBlur={() => setHover((h) => (h === item.id ? null : h))}
          onClick={() => onPick(item.make(), item)}>
          <canvas
            ref={(el) => {
              if (el) canvases.current.set(item.id, el)
              else canvases.current.delete(item.id)
            }}
            width={THUMB_W * 2} height={THUMB_H * 2} className="block aspect-[8/5] w-full bg-black" aria-hidden />
          <span className="block truncate px-2 py-1.5 text-xs text-slate-200 group-hover:text-white">{item.name}</span>
        </button>
      ))}
    </div>
  )
}
