import { useState } from 'react'
import { EmptyState } from '@/components/ui'
import { classNames } from '@/lib/format'
import { mappingApi } from '../api'
import type { Cue, MappingScene, MediaAsset, Show } from '../types'
import { outputColor } from './panels'

/** The scene a cue plays on one projector: its own choice there, else the cue's scene. */
export function sceneOn(cue: Cue, outputId: number): number | null {
  const own = cue.output_scenes ?? {}
  return String(outputId) in own ? own[String(outputId)] : cue.scene_id
}

const SHARED = 'shared'
const NOTHING = 'nothing'

/**
 * What each projector plays, cue by cue: one row per cue, one column per
 * projector, and in each cell its picture and its scene. Left alone, a
 * projector shows its part of the cue's shared picture and the cue's
 * scene; either can be set apart for that projector (a picture or video of
 * its own fills its box and does not blend with the others). Ones set
 * apart are marked in blue.
 */
export function EachProjector({
  show,
  media,
  scenes,
  canEdit,
  onChanged,
  onError,
}: {
  show: Show
  media: MediaAsset[]
  scenes: MappingScene[]
  canEdit: boolean
  onChanged: () => Promise<unknown> | void
  onError: (message: string | null) => void
}) {
  const [saving, setSaving] = useState<number | null>(null)
  const outputs = [...show.outputs].sort((a, b) => a.position - b.position)
  const cues = [...show.cues].sort((a, b) => a.position - b.position)
  const pictures = media.filter((m) => m.kind !== 'audio')

  const save = async (cue: Cue, patch: Partial<Cue>) => {
    setSaving(cue.id)
    try {
      await mappingApi.updateCue(cue.id, patch)
      await onChanged()
      onError(null)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Saving the cue failed')
    } finally {
      setSaving(null)
    }
  }

  const choosePicture = (cue: Cue, outputId: number, choice: string) => {
    const own = { ...(cue.output_media ?? {}) }
    if (choice === SHARED) delete own[String(outputId)]
    else own[String(outputId)] = choice === NOTHING ? null : Number(choice)
    return save(cue, { output_media: own })
  }

  const chooseScene = (cue: Cue, outputId: number, sceneId: number | null) => {
    const own = { ...(cue.output_scenes ?? {}) }
    // Back on the cue's own scene: follow the cue again.
    if (sceneId === cue.scene_id) delete own[String(outputId)]
    else own[String(outputId)] = sceneId
    return save(cue, { output_scenes: own })
  }

  if (outputs.length === 0 || cues.length === 0) {
    return (
      <EmptyState title={outputs.length === 0 ? 'No projectors in this show yet' : 'No cues yet'}>
        {outputs.length === 0
          ? 'Add one for each projector in Set up → Your projectors.'
          : 'Add a cue on the Cues page (or Make a scene), then choose here what each projector plays in it.'}
      </EmptyState>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-separate border-spacing-y-1.5 text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="pb-1 pr-3 font-medium">Cue</th>
            {outputs.map((o, i) => (
              <th key={o.id} className="pb-1 pr-3 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: outputColor(i) }} />
                  {o.name}
                  <span className="tnum font-normal text-slate-600">{o.width} × {o.height}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cues.map((cue) => {
            const cueScene = scenes.find((s) => s.id === cue.scene_id)
            return (
              <tr key={cue.id} className="align-top">
                <td className="whitespace-nowrap pr-3 pt-1 text-slate-300">
                  <span className="tnum mr-1.5 text-slate-500">{cue.position + 1}</span>
                  {cue.name || 'Untitled cue'}
                </td>
                {outputs.map((o) => {
                  const key = String(o.id)
                  const ownMedia = cue.output_media ?? {}
                  const picture = !(key in ownMedia) ? SHARED : ownMedia[key] == null ? NOTHING : String(ownMedia[key])
                  const scene = sceneOn(cue, o.id)
                  const sceneApart = key in (cue.output_scenes ?? {}) && scene !== cue.scene_id
                  const disabled = !canEdit || saving === cue.id
                  return (
                    <td key={o.id} className="pr-3">
                      <div className="flex w-48 flex-col gap-1">
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="w-10 shrink-0">Picture</span>
                          <select
                            className={classNames('input py-1 text-xs', picture !== SHARED && 'ring-1 ring-sky-500/60')}
                            aria-label={`Picture on ${o.name} in cue ${cue.position + 1}`}
                            value={picture}
                            disabled={disabled}
                            onChange={(e) => void choosePicture(cue, o.id, e.target.value)}
                          >
                            <option value={SHARED}>Its part of the cue’s picture</option>
                            <option value={NOTHING}>Nothing</option>
                            {pictures.map((m) => (
                              <option key={m.id} value={String(m.id)}>Its own: {m.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="w-10 shrink-0">Scene</span>
                          <select
                            className={classNames('input py-1 text-xs', sceneApart && 'ring-1 ring-sky-500/60')}
                            aria-label={`Scene on ${o.name} in cue ${cue.position + 1}`}
                            value={scene ?? ''}
                            disabled={disabled}
                            onChange={(e) => void chooseScene(cue, o.id, e.target.value ? Number(e.target.value) : null)}
                          >
                            <option value="">No scene</option>
                            {scenes.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}{s.id === cueScene?.id ? ' (the cue’s)' : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
