import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { request } from '@/api/client'
import { ConfirmDialog } from '@/components/ui'
import { classNames } from '@/lib/format'
import { mappingApi } from '../api'
import { arrange, ARRANGEMENTS, type Arrangement, fitShape, shapeIsOff, shapeRatio, stretchOf, stretchWords, warpUntouched } from '../projectorShape'
import type { Output, Show } from '../types'
import { outputColor } from './panels'
import type { Player } from './PlayersPanel'

/**
 * The show's projectors, each with the resolution it really shows, whether
 * its box on the house picture has its shape, and a button to see the show
 * as that projector shows it. Under them, one press lays them all out side
 * by side, overlapping or apart.
 */
export function YourProjectors({
  show,
  outputs,
  viewId,
  onView,
  canEdit,
  onChanged,
  onError,
}: {
  show: Show
  outputs: Output[]
  /** The projector the preview shows; null is the whole house. */
  viewId: number | null
  onView: (id: number | null) => void
  canEdit: boolean
  onChanged: () => Promise<unknown>
  onError: (message: string | null) => void
}) {
  const cw = show.canvas_width
  const ch = show.canvas_height
  const [players, setPlayers] = useState<Player[]>([])
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState<Arrangement | null>(null)

  const loadPlayers = useCallback(
    () => request<Player[]>('/mapping/players').then(setPlayers).catch(() => undefined),
    [],
  )
  useEffect(() => {
    void loadPlayers()
    const timer = window.setInterval(() => void loadPlayers(), 30_000)
    return () => window.clearInterval(timer)
  }, [loadPlayers])

  const save = async (changes: Array<[Output, Partial<Output>]>) => {
    setBusy(true)
    onError(null)
    try {
      for (const [output, patch] of changes) await mappingApi.updateOutput(output.id, patch)
      await onChanged()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const lay = (how: Arrangement) => {
    const boxes = arrange(outputs, cw, ch, how)
    void save(outputs.map((o, i) => [o, {
      source: boxes[i],
      // The overlaps blend by themselves; hand-set edge blends would fight them.
      blend: { ...o.blend, left: { ...o.blend.left, width: 0 }, right: { ...o.blend.right, width: 0 }, auto: true },
    }]))
  }
  const linedUp = outputs.filter((o) => !warpUntouched(o) || o.calibration)

  if (outputs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 px-4 py-3 text-sm text-slate-400">
        No projectors in this show yet. Add one for each projector in{' '}
        <Link className="text-sky-300 hover:underline" to="/mapping/editor?part=projectors">Editor → Projectors</Link>.
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-lg bg-panel-900/60 p-3 ring-1 ring-white/5">
      <ConfirmDialog
        open={asking != null}
        title="Move every projector's box?"
        body={`${linedUp.map((o) => o.name).join(', ')} ${linedUp.length === 1 ? 'is' : 'are'} lined up on the house. Laying the boxes out again moves what each projector shows, so ${linedUp.length === 1 ? 'it needs' : 'they need'} lining up again afterwards.`}
        confirmLabel="Lay them out"
        onConfirm={() => {
          if (asking) lay(asking)
          setAsking(null)
        }}
        onCancel={() => setAsking(null)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="label mb-0 mr-1">See it as</span>
        <ViewChip active={viewId == null} onClick={() => onView(null)} title="The whole house picture, with every projector's box on it">
          The whole house
        </ViewChip>
        {outputs.map((o, i) => {
          const player = players.find((p) => p.kind === 'player' && p.output_id === o.id)
          const real = player?.report.width === o.width && player?.report.height === o.height
          const off = shapeIsOff(o, cw, ch)
          return (
            <ViewChip key={o.id} active={viewId === o.id} onClick={() => onView(o.id)}
              title={`What ${o.name} shows, in its own shape. ${o.width} × ${o.height}${real ? ', as its mini PC shows it' : player ? '' : ' (no mini PC on it yet, so this size was set by hand)'}.`}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: outputColor(i) }} aria-hidden />
              {o.name}
              <span className="tnum text-[11px] font-normal text-slate-400">{o.width} × {o.height}</span>
              {off && <span className="text-[11px] font-normal text-amber-300">stretched</span>}
            </ViewChip>
          )
        })}
      </div>

      {outputs.some((o) => shapeIsOff(o, cw, ch)) && (
        <ul className="space-y-1">
          {outputs.filter((o) => shapeIsOff(o, cw, ch)).map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-2 rounded-md bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100 ring-1 ring-amber-500/20">
              <span>
                {o.name}’s box is {stretchWords(stretchOf(o, cw, ch))} for a {o.width} × {o.height} projector, so
                everything it shows looks stretched.
              </span>
              {canEdit && (
                <button type="button" className="btn-default ml-auto px-2 py-0.5 text-xs" disabled={busy}
                  onClick={() => void save([[o, { source: fitShape(o.source, shapeRatio(o, cw, ch)) }]])}>
                  Fix the shape
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && outputs.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span>Lay them out:</span>
          {ARRANGEMENTS.map((a) => (
            <button key={a.id} type="button" className="btn-default px-2 py-0.5 text-xs" disabled={busy} title={a.hint}
              onClick={() => (linedUp.length ? setAsking(a.id) : lay(a.id))}>
              {a.label}
            </button>
          ))}
          <span className="text-slate-500">or</span>
          <Link className="text-sky-300 hover:underline" to="/mapping/editor?part=projectors">drag the boxes yourself and line them up on the house</Link>
        </div>
      )}
    </div>
  )
}

function ViewChip({ active, onClick, title, children }: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button type="button" title={title} aria-pressed={active} onClick={onClick}
      className={classNames(
        'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition',
        active ? 'bg-sky-500/20 text-sky-100 ring-sky-400/60' : 'bg-panel-800 text-slate-300 ring-white/10 hover:bg-panel-700',
      )}>
      {children}
    </button>
  )
}
