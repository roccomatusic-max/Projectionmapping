import { useState } from 'react'
import { EmptyState, Panel } from '@/components/ui'
import { classNames } from '@/lib/format'
import { mappingApi } from '../api'
import type { Cue, MappingScene, Show } from '../types'
import { outputColor } from './panels'

/** The scene a cue plays on one projector: its own choice there, else the cue's scene. */
export function sceneOn(cue: Cue, outputId: number): number | null {
  const own = cue.output_scenes ?? {}
  return String(outputId) in own ? own[String(outputId)] : cue.scene_id
}

/**
 * Which scene each projector plays, cue by cue: one row per cue, one
 * column per projector. A projector left on the cue's scene follows it;
 * picking another scene (or none) there is remembered for that projector.
 */
export function ProjectorScenes({
  show,
  scenes,
  canEdit,
  onChanged,
  onError,
}: {
  show: Show
  scenes: MappingScene[]
  canEdit: boolean
  onChanged: () => Promise<void> | void
  onError: (message: string | null) => void
}) {
  const [saving, setSaving] = useState<number | null>(null)
  const outputs = [...show.outputs].sort((a, b) => a.position - b.position)
  const cues = [...show.cues].sort((a, b) => a.position - b.position)

  const choose = async (cue: Cue, outputId: number, sceneId: number | null) => {
    const own = { ...(cue.output_scenes ?? {}) }
    // Back on the cue's own scene: follow the cue again.
    if (sceneId === cue.scene_id) delete own[String(outputId)]
    else own[String(outputId)] = sceneId
    setSaving(cue.id)
    try {
      await mappingApi.updateCue(cue.id, { output_scenes: own })
      await onChanged()
      onError(null)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Saving the cue failed')
    } finally {
      setSaving(null)
    }
  }

  return (
    <Panel
      title="Scenes on each projector"
      description="Pick which scene each projector plays in each cue. A projector that differs from the cue's scene is marked in blue. When tonight's show starts, its scene group (Dashboard → Pick tonight's scenes) sets every cue, so for tonight use Make a scene, which changes both."
    >
      {outputs.length === 0 || cues.length === 0 ? (
        <EmptyState title={outputs.length === 0 ? 'No projectors in this show yet' : 'No cues yet'}>
          {outputs.length === 0
            ? 'Add projector outputs in the Editor first.'
            : 'Press "Add to cues" on a scene below, then choose here what each projector plays.'}
        </EmptyState>
      ) : (
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
                    const value = sceneOn(cue, o.id)
                    const differs = String(o.id) in (cue.output_scenes ?? {}) && value !== cue.scene_id
                    return (
                      <td key={o.id} className="pr-3">
                        <select
                          className={classNames('input w-44 py-1 text-xs', differs && 'ring-1 ring-sky-500/60')}
                          aria-label={`Scene on ${o.name} in cue ${cue.position + 1}`}
                          value={value ?? ''}
                          disabled={!canEdit || saving === cue.id}
                          onChange={(e) => void choose(cue, o.id, e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">No scene</option>
                          {scenes.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
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
      )}
    </Panel>
  )
}
