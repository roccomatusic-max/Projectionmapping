import { useState } from 'react'
import type { Output } from '../types'

/**
 * The house picture's shape. A show is made on one picture of the whole
 * house; its size in pixels never reaches a projector (each one draws its
 * own box of it at its own resolution), so only its shape is asked for.
 * It is kept as pixels 2160 tall (or wide, for a tall picture).
 */
const BASE = 2160
const MAX_SIDE = 32768

export const PICTURE_SHAPES: Array<{ id: string; label: string; ratio: number }> = [
  { id: '16:9', label: 'Wide, like a TV (16:9)', ratio: 16 / 9 },
  { id: '16:10', label: 'Wide, like most projectors (16:10)', ratio: 16 / 10 },
  { id: '4:3', label: 'Nearly square (4:3)', ratio: 4 / 3 },
  { id: '21:9', label: 'Extra wide (21:9)', ratio: 21 / 9 },
  { id: '32:9', label: 'Two projectors wide (32:9)', ratio: 32 / 9 },
  { id: '48:9', label: 'Three projectors wide (48:9)', ratio: 48 / 9 },
  { id: '9:16', label: 'Tall (9:16)', ratio: 9 / 16 },
]

const near = (a: number, b: number) => Math.abs(a / b - 1) < 0.01

/** Pixels for a picture of this shape (width over height). */
export function pictureSize(ratio: number): { canvas_width: number; canvas_height: number } {
  const r = Math.min(MAX_SIDE / BASE, Math.max(BASE / MAX_SIDE, ratio))
  return r >= 1
    ? { canvas_width: Math.round(BASE * r), canvas_height: BASE }
    : { canvas_width: BASE, canvas_height: Math.round(BASE / r) }
}

/** "16:9", or "2.93 : 1" for a shape of its own. */
export function shapeName(width: number, height: number): string {
  const ratio = width / Math.max(1, height)
  const known = PICTURE_SHAPES.find((s) => near(s.ratio, ratio))
  if (known) return known.id
  return ratio >= 1 ? `${ratio.toFixed(2)} : 1` : `1 : ${(1 / ratio).toFixed(2)}`
}

/** The shape that just holds these projectors side by side, each in its own shape. */
export function sideBySideRatio(outputs: Array<Pick<Output, 'width' | 'height'>>): number | null {
  if (outputs.length === 0) return null
  return outputs.reduce((sum, o) => sum + o.width / Math.max(1, o.height), 0)
}

/**
 * Picks the picture's shape: a common one, the one that just holds the
 * show's projectors side by side, or one of its own (as width : height).
 */
export function PictureShapeField({
  width,
  height,
  outputs = [],
  disabled,
  onChange,
}: {
  width: number
  height: number
  outputs?: Array<Pick<Output, 'width' | 'height'>>
  disabled?: boolean
  onChange: (size: { canvas_width: number; canvas_height: number }) => void
}) {
  const ratio = width / Math.max(1, height)
  const fit = outputs.length > 1 ? sideBySideRatio(outputs) : null
  const known = PICTURE_SHAPES.find((s) => near(s.ratio, ratio))
  const [own, setOwn] = useState(() => !known && !(fit && near(fit, ratio)))
  const value = own ? 'own' : known ? known.id : fit && near(fit, ratio) ? 'fit' : 'own'
  const [a, setA] = useState(() => Number(ratio.toFixed(2)))
  const [b, setB] = useState(1)

  const pick = (id: string) => {
    if (id === 'own') {
      setOwn(true)
      setA(Number(ratio.toFixed(2)))
      setB(1)
      return
    }
    setOwn(false)
    const next = id === 'fit' ? fit : PICTURE_SHAPES.find((s) => s.id === id)?.ratio
    if (next) onChange(pictureSize(next))
  }
  const typed = (nextA: number, nextB: number) => {
    setA(nextA)
    setB(nextB)
    if (nextA > 0 && nextB > 0) onChange(pictureSize(nextA / nextB))
  }

  return (
    <div className="space-y-1.5">
      <label className="block">
        <span className="label">Shape of the house picture</span>
        <select className="input" value={value} disabled={disabled} onChange={(e) => pick(e.target.value)}>
          {PICTURE_SHAPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          {fit && (
            <option value="fit">
              Just fits my {outputs.length} projectors side by side ({shapeName(pictureSize(fit).canvas_width, pictureSize(fit).canvas_height)})
            </option>
          )}
          <option value="own">A shape of its own…</option>
        </select>
      </label>
      {value === 'own' && (
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <input type="number" className="input w-20 py-1 text-xs" min={0.1} max={15} step={0.1} value={a} disabled={disabled}
            aria-label="Width part of the shape" onChange={(e) => typed(Number(e.target.value), b)} />
          wide to
          <input type="number" className="input w-20 py-1 text-xs" min={0.1} max={15} step={0.1} value={b} disabled={disabled}
            aria-label="Height part of the shape" onChange={(e) => typed(a, Number(e.target.value))} />
          tall
        </div>
      )}
    </div>
  )
}
