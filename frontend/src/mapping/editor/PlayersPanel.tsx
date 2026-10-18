import { useCallback, useEffect, useState } from 'react'
import { request } from '@/api/client'
import { classNames } from '@/lib/format'
import { formatBytes } from './controls'

/** Where the Windows installer for the computers beside the projectors is published. */
export const MINIPC_DOWNLOAD = 'https://github.com/roccomatusic-max/Projectionmapping/releases/tag/minipc-latest'

export interface Player {
  id: number
  name: string
  /** "camera" for the camera program; it pairs the same way. */
  kind: 'player' | 'camera'
  code: string
  approved: boolean
  output_id: number | null
  show_id: number | null
  online: boolean
  last_seen_at: string | null
  report: {
    fps?: number
    drift_ms?: number
    width?: number
    height?: number
    cache?: string
    cached_bytes?: number
    cue?: string
    camera?: string
    depth?: boolean
    people?: number
    activity?: string
    /** Camera: people reports a second, and their age when sent (ms). */
    tracking_rate?: number
    tracking_ms?: number
    /** Player: how old the camera's people reports are when they arrive (ms). */
    people_ms?: number
  }
  /** The other half of a mini PC: its camera on a player, its player on a camera. */
  companion_id: number | null
}

interface NetworkInfo {
  /** Only this computer can reach the server, so no mini PC can. */
  local_only: boolean
  /** Mini PCs find the server by themselves. */
  discoverable: boolean
  address: string | null
}

export interface OutputChoice {
  id: number
  label: string
}

/**
 * The small computers beside the projectors.
 *
 * A new one shows a six-letter code on its projector; approving that code
 * here and picking an output is the whole setup. A camera plugged into a
 * mini PC comes with it: approved, listed and removed together.
 */
export function PlayersPanel({
  outputs,
  canEdit,
  refreshKey,
  onError,
}: {
  outputs: OutputChoice[]
  canEdit: boolean
  /** Bumped when the server announces a player change. */
  refreshKey: number
  onError: (message: string) => void
}) {
  const [players, setPlayers] = useState<Player[]>([])
  const [network, setNetwork] = useState<NetworkInfo | null>(null)

  useEffect(() => {
    request<NetworkInfo>('/mapping/players/network').then(setNetwork, () => setNetwork(null))
  }, [])

  const load = useCallback(async () => {
    try {
      setPlayers(await request<Player[]>('/mapping/players'))
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load players')
    }
  }, [onError])

  useEffect(() => {
    void load()
    // Online state is derived from heartbeats; refresh it while visible.
    const timer = window.setInterval(() => void load(), 5000)
    return () => window.clearInterval(timer)
  }, [load, refreshKey])

  const patch = async (player: Player, body: Partial<Player>) => {
    try {
      await request(`/mapping/players/${player.id}`, { method: 'PATCH', body })
      await load()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  const remove = async (player: Player) => {
    const camera = player.kind === 'player' && player.companion_id != null ? ' Its camera is removed with it.' : ''
    if (!window.confirm(`Remove ${player.name}? It will go back to showing a pairing code.${camera}`)) return
    try {
      await request(`/mapping/players/${player.id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Remove failed')
    }
  }

  const identify = (player: Player) =>
    request(`/mapping/players/${player.id}/identify`, { method: 'POST' }).catch((err) =>
      onError(err instanceof Error ? err.message : 'Identify failed'),
    )

  const byId = new Map(players.map((p) => [p.id, p]))
  // A mini PC's camera is approved with the mini PC, so it is not asked about.
  const pending = players.filter((p) => !p.approved && !(p.kind === 'camera' && p.companion_id != null))
  const paired = players.filter((p) => p.approved)
  const onMac = navigator.userAgent.includes('Mac')

  return (
    <div className="space-y-4">
      {network?.local_only && (
        <div className="space-y-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-100 ring-1 ring-amber-500/30">
          <p>Mini PCs and phones can’t reach this computer yet. Quit Projector Control and start it like this:</p>
          <p className="rounded bg-black/30 px-2 py-1 font-mono text-xs text-slate-100">
            {onMac ? './dist/ProjectorControl/ProjectorControl --lan' : 'ProjectorControl.exe --lan'}
          </p>
        </div>
      )}

      {players.length === 0 && (
        <div className="space-y-2 text-sm text-slate-400">
          <p>
            No mini PCs yet. Install the{' '}
            <a className="text-sky-300 underline" href={MINIPC_DOWNLOAD} target="_blank" rel="noreferrer">
              Mini PC app
            </a>{' '}
            on each Windows computer beside a projector. It finds this server by itself, fills the projector, and
            shows a pairing code there to approve here. A camera plugged into it comes along.
          </p>
          <p className="text-xs text-slate-500">
            Any other computer can open{' '}
            <span className="font-mono text-slate-300">
              {network?.address ?? `${window.location.protocol}//${window.location.host}`}/player
            </span>{' '}
            in a full-screen browser instead.
          </p>
        </div>
      )}

      {pending.map((player) => (
        <div key={player.id} className="rounded-md bg-amber-500/10 p-3 ring-1 ring-amber-500/30">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-xl font-semibold tracking-[0.2em] text-amber-200">{player.code}</p>
              <p className="text-xs text-slate-400">
                {player.name} · {player.kind === 'camera' ? 'camera, ' : ''}
                {player.companion_id != null ? 'with its camera, ' : ''}waiting for approval
              </p>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary px-3 py-1.5 text-xs" disabled={!canEdit}
                onClick={() => patch(player, { approved: true })}>
                Approve
              </button>
              <button className="btn-ghost px-2 py-1.5 text-xs" disabled={!canEdit} onClick={() => remove(player)}>
                Ignore
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {player.kind === 'camera'
              ? 'Only approve a code you can see in the camera program’s window.'
              : 'Only approve a code you can see on the projector.'}
          </p>
        </div>
      ))}

      {paired.map((player) => (
        <div key={player.id} className="rounded-md bg-panel-850 p-3 ring-1 ring-white/5">
          <div className="flex items-center gap-2">
            <span
              className={classNames('h-2.5 w-2.5 shrink-0 rounded-full', player.online ? 'bg-status-ok' : 'bg-status-fault')}
              title={player.online ? 'Online' : 'Not heard from recently'}
            />
            <input
              className="input py-1 text-sm"
              defaultValue={player.name}
              key={`${player.id}:${player.name}`}
              disabled={!canEdit}
              onBlur={(event) =>
                event.target.value && event.target.value !== player.name && patch(player, { name: event.target.value })
              }
            />
            {player.kind === 'camera' && (
              <span className="shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
                {player.companion_id != null ? `Camera on ${byId.get(player.companion_id)?.name ?? 'a mini PC'}` : 'Camera'}
              </span>
            )}
            <span className={classNames('shrink-0 text-xs', player.online ? 'text-emerald-300' : 'text-red-300')}>
              {player.online ? 'online' : 'offline'}
            </span>
          </div>
          {player.kind === 'camera' ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="flex-1 text-xs text-slate-500">
                {player.online
                  ? `${player.report.camera ?? 'camera'}${player.report.depth ? ' · depth' : ''} · ${player.report.activity ?? 'idle'}` +
                    (player.report.people != null ? ` · ${player.report.people} people` : '') +
                    (player.report.tracking_rate
                      ? ` · ${player.report.tracking_rate.toFixed(0)} updates/s, ${player.report.tracking_ms ?? '?'} ms`
                      : '')
                  : player.companion_id != null
                    ? 'Not seen recently. Check the camera is plugged in.'
                    : 'Start the camera program on its computer.'}
              </p>
              {player.companion_id == null && (
                <button className="btn-ghost px-2 py-1 text-xs text-red-300" disabled={!canEdit} onClick={() => remove(player)}>
                  Remove
                </button>
              )}
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                className="input w-auto flex-1 py-1 text-xs"
                value={player.output_id ?? ''}
                disabled={!canEdit}
                onChange={(event) => patch(player, { output_id: event.target.value ? Number(event.target.value) : null })}
              >
                <option value="">No output</option>
                {player.output_id != null && !outputs.some((o) => o.id === player.output_id) && (
                  <option value={player.output_id}>An output in another show</option>
                )}
                {outputs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button className="btn-ghost px-2 py-1 text-xs" disabled={!canEdit || !player.online}
                onClick={() => identify(player)} title="Show this player's name on its projector">
                Identify
              </button>
              <button className="btn-ghost px-2 py-1 text-xs text-red-300" disabled={!canEdit} onClick={() => remove(player)}>
                Remove
              </button>
            </div>
          )}
          {player.online && player.kind !== 'camera' && (
            <p className="tnum mt-2 text-xs text-slate-500">
              {player.report.fps != null ? `${player.report.fps.toFixed(0)} fps` : '— fps'}
              {player.report.drift_ms != null ? ` · drift ${player.report.drift_ms} ms` : ''}
              {player.report.people_ms != null ? ` · camera to here ${player.report.people_ms} ms` : ''}
              {player.report.width ? ` · ${player.report.width}×${player.report.height}` : ''}
              {` · cache ${player.report.cache ?? 'off'}`}
              {player.report.cached_bytes ? ` (${formatBytes(player.report.cached_bytes)})` : ''}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
