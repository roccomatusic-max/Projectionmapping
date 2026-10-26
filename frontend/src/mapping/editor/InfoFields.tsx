import { useEffect, useState } from 'react'
import type { SceneLayer } from '../types'
import { infoStyle } from '../scene/info'

/** Longest message the board scrolls (the server's limit too). */
export const MESSAGE_MAX = 200

/**
 * The words a live info board needs: the weather's town, what a "days
 * until" counts to and its date, or the message board's message. The Santa
 * tracker needs nothing; it reads the clock.
 */
export function InfoFields({ layer, canEdit, onChange }: {
  layer: SceneLayer
  canEdit: boolean
  onChange: (patch: Partial<SceneLayer>) => void
}) {
  const style = infoStyle(layer.style)
  // Typed words are kept here while typing so a slow save does not jump the cursor.
  const [text, setText] = useState(layer.text ?? '')
  useEffect(() => setText(layer.text ?? ''), [layer.id, layer.text])
  const type = (value: string) => {
    setText(value)
    onChange({ text: value })
  }

  if (style === 'santa') {
    return (
      <p className="text-xs text-slate-500">
        Shows where Santa is on Christmas Eve, the next stop, presents delivered and when he reaches your house (your
        computer&apos;s time zone). Before then it counts down to his takeoff. It works without the internet.
      </p>
    )
  }
  if (style === 'weather') {
    return (
      <label className="block">
        <span className="label">Town or ZIP code</span>
        <input className="input py-1 text-sm" value={text} disabled={!canEdit} maxLength={80}
          placeholder="Leave empty to use where the server is" onChange={(e) => type(e.target.value)} />
        <span className="mt-1 block text-xs text-slate-500">
          For example “Ridgewood, NJ” or “07450”. Checked every 10 minutes; the server needs the internet for this one.
        </span>
      </label>
    )
  }
  if (style === 'days') {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Counts down to</span>
          <input className="input py-1 text-sm" value={text} disabled={!canEdit} maxLength={60}
            placeholder="Grandma’s visit" onChange={(e) => type(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Date (comes round every year)</span>
          <input type="date" className="input py-1 text-sm" value={layer.date ?? ''} disabled={!canEdit}
            onChange={(e) => onChange({ date: e.target.value || null })} />
        </label>
      </div>
    )
  }
  return (
    <label className="block">
      <span className="label">Message</span>
      <textarea className="input min-h-[4rem] py-1 text-sm" value={text} disabled={!canEdit} maxLength={MESSAGE_MAX}
        placeholder="Merry Christmas from our house!" onChange={(e) => type(e.target.value.replace(/\s*\n\s*/g, ' '))} />
      <span className="mt-1 block text-xs text-slate-500">
        Short messages sit still in the middle; longer ones scroll across. You can also change it from the phone remote.
      </span>
    </label>
  )
}
