import { useState } from 'react'
import { EmptyState } from '@/components/ui'
import { classNames } from '@/lib/format'
import { mappingApi } from '../api'
import type { Cue, MediaAsset, Show } from '../types'
import { outputColor } from './panels'

const SHARED = 'shared'
const NOTHING = 'nothing'

/**
 * What each projector shows, cue by cue: its part of the cue's picture
 * (the default), a picture or video of its own, or nothing. A picture of
 * its own fills that projector's slice and does not blend with the others.
 */
export function ProjectorMedia({
  show,
  media,
  canEdit,
  onChanged,
  onError,
}: {
  show: Show
  media: MediaAsset[]
  canEdit: boolean
  onChanged: () => Promise<void> | void
  onError: (message: string | null) => void
}) {
  const [saving, setSaving] = useState<number | null>(null)
  const outputs = [...show.outputs].sort((a, b) => a.position - b.position)
  const cues = [...show.cues].sort((a, b) => a.position - b.position)

  const choose = async (cue: Cue, outputId: number, choice: string) => {
    const own = { ...(cue.output_media ?? {}) }
    if (choice === SHARED) delete own[String(outputId)]
    else own[String(outputId)] = choice === NOTHING ? null : Number(choice)
    setSaving(cue.id)
    try {
      await mappingApi.updateCue(cue.id, { output_media: own })
      await onChanged()
      onError(null)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Saving the cue failed')
    } finally {
      setSaving(null)
    }
  }

  if (outputs.length < 2 || cues.length === 0) {
    return (
      <EmptyState title={outputs.length < 2 ? 'One projector so far' : 'No cues yet'}>
        {outputs.length < 2
          ? 'With two or more projectors, each one can show its part of the picture or a picture of its own.'
          : 'Add a cue first, then choose here what each projector shows in it.'}
      </EmptyState>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-separate border-spacing-y-1 text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="pb-1 pr-3 font-medium">Cue</th>
            {outputs.map((o, i) => (
              <th key={o.id} className="pb-1 pr-3 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: outputColor(i) }} />
                  {o.name}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cues.map((cue) => (
            <tr key={cue.id}>
              <td className="whitespace-nowrap pr-3 text-slate-300">
                <span className="tnum mr-1.5 text-slate-500">{cue.position + 1}</span>
                {cue.name || 'Untitled cue'}
              </td>
              {outputs.map((o) => {
                const own = cue.output_media ?? {}
                const key = String(o.id)
                const value = !(key in own) ? SHARED : own[key] == null ? NOTHING : String(own[key])
                return (
                  <td key={o.id} className="pr-3">
                    <select
                      className={classNames('input w-44 py-1 text-xs', value !== SHARED && 'ring-1 ring-sky-500/60')}
                      aria-label={`What ${o.name} shows in cue ${cue.position + 1}`}
                      value={value}
                      disabled={!canEdit || saving === cue.id}
                      onChange={(e) => void choose(cue, o.id, e.target.value)}
                    >
                      <option value={SHARED}>Shared picture</option>
                      <option value={NOTHING}>Nothing</option>
                      {media.filter((m) => m.kind !== 'audio').map((m) => (
                        <option key={m.id} value={String(m.id)}>
                          Own: {m.name}
                        </option>
                      ))}
                    </select>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
