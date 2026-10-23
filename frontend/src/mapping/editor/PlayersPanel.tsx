import { useCallback, useEffect, useState } from 'react'
import { request } from '@/api/client'
import {
  BlackoutIcon,
  InfoIcon,
  OsdIcon,
  PowerIcon,
  RefreshIcon,
  ShowIcon,
  TargetIcon,
  TestPatternIcon,
} from '@/components/icons'
import { ConfirmDialog } from '@/components/ui'
import { classNames } from '@/lib/format'
import type { TestPattern } from '../types'
import { formatBytes } from './controls'

/** Where the Windows installer for the computers beside the projectors is published. */
export const MINIPC_DOWNLOAD = 'https://github.com/roccomatusic-max/Projectionmapping/releases/tag/minipc-latest'
/** The one line pasted into PowerShell on a mini PC (minipc/README.md, Install). */
export const MINIPC_INSTALL_LINE =
  "[Net.ServicePointManager]::SecurityProtocol='Tls12'; irm https://github.com/roccomatusic-max/Projectionmapping/releases/download/minipc-latest/install-minipc.ps1 | iex"

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
    /** Player: half the round trip to the server clock (ms). */
    clock_ms?: number
    /** Player: its live link to the server ("open" when it is). */
    link?: string
    /** Player: the status overlay is on its projector. */
    overlay?: boolean
    /** The address it reports from on the network. */
    address?: string
  }
  /** The other half of a mini PC: its camera on a player, its player on a camera. */
  companion_id: number | null
  /** What its output shows instead of the show ("none": the show itself). */
  screen?: TestPattern | null
  /** The Mini PC app on that computer, once it has checked in. */
  app?: {
    /** Heard from in the last few seconds. */
    connected: boolean
    /** It can restart and shut down its computer. */
    power: boolean
    computer: string | null
    /** Known: it can be turned on over the network. */
    mac: string | null
  } | null
}

type PlayerAction = 'restart_output' | 'overlay_on' | 'overlay_off' | 'reboot' | 'shutdown' | 'wake'

/** What the projector of a mini PC can be switched to from here. */
const SCREENS: Array<{ id: TestPattern; label: string; hint: string }> = [
  { id: 'none', label: 'Show', hint: 'The show, as the Editor and the cues make it' },
  { id: 'grid', label: 'Grid', hint: 'A test grid, for lining the projector up' },
  { id: 'white', label: 'White', hint: 'Full white: is it on, and where does its light land?' },
  { id: 'black', label: 'Black', hint: 'Nothing: this projector only, the others carry on' },
]

const SCREEN_LABEL: Partial<Record<TestPattern, string>> = {
  grid: 'Test grid',
  white: 'White',
  black: 'Black',
  red: 'Red',
  green: 'Green',
  blue: 'Blue',
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
          <p>To install it, open PowerShell on the mini PC, paste this line and press Enter:</p>
          <p className="select-all break-all rounded bg-black/30 px-2 py-1 font-mono text-xs text-slate-100">
            {MINIPC_INSTALL_LINE}
          </p>
          <p className="text-xs text-slate-500">
            If it says Smart App Control blocks the app, turn that off in Windows Security → App &amp; browser
            control → Smart App Control settings, then paste the line again.
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
            <PlayerControls player={player} outputs={outputs} canEdit={canEdit} onPatch={patch}
              onRemove={remove} onError={onError} reload={load} />
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * Everything one mini PC can be asked from here: which output it plays,
 * what its projector shows, the status overlay, restarting its output or
 * the whole computer, shutting it down and turning it back on.
 */
function PlayerControls({
  player,
  outputs,
  canEdit,
  onPatch,
  onRemove,
  onError,
  reload,
}: {
  player: Player
  outputs: OutputChoice[]
  canEdit: boolean
  onPatch: (player: Player, body: Partial<Player>) => Promise<void>
  onRemove: (player: Player) => Promise<void>
  onError: (message: string) => void
  reload: () => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'reboot' | 'shutdown' | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 12000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const { report, app } = player
  const appHere = !!app?.connected
  const reachable = player.online || appHere
  const canPower = appHere && !!app?.power
  const screen = player.screen ?? 'none'
  const overlay = !!report.overlay

  const run = async (key: string, work: () => Promise<string | null>) => {
    setBusy(key)
    try {
      const message = await work()
      if (message) setNotice(message)
      await reload()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'That did not reach the mini PC')
    } finally {
      setBusy(null)
    }
  }

  const send = (action: PlayerAction) =>
    run(action, async () => {
      const reply = await request<{ message: string }>(`/mapping/players/${player.id}/command`, {
        method: 'POST',
        body: { action },
      })
      return reply.message
    })

  const show = (pattern: TestPattern) =>
    run(`screen:${pattern}`, async () => {
      await request(`/mapping/players/${player.id}/screen`, { method: 'POST', body: { pattern } })
      return null
    })

  const identify = () =>
    run('identify', async () => {
      await request(`/mapping/players/${player.id}/identify`, { method: 'POST' })
      return `${player.name} shows its name on its projector for a few seconds.`
    })

  // What it is doing, in words.
  const doing = !player.online
    ? appHere
      ? 'The mini PC is on, but its output is not answering. Try Restart output.'
      : 'Not heard from recently. Check it is on and plugged into the network.'
    : player.output_id == null
      ? 'Paired. Pick an output below to give it a picture.'
      : screen !== 'none'
        ? `${SCREEN_LABEL[screen] ?? 'A test picture'} on its projector instead of the show.`
        : report.cue
          ? `Playing cue ${report.cue}.`
          : 'Showing its output. Nothing is playing.'

  const facts = player.online
    ? [
        report.width ? `${report.width}×${report.height}` : null,
        report.fps != null ? `${report.fps.toFixed(0)} fps` : null,
        report.link && report.link !== 'open' ? 'live link down' : null,
        report.clock_ms != null ? `clock ±${report.clock_ms} ms` : null,
        report.drift_ms != null ? `drift ${report.drift_ms} ms` : null,
        report.people_ms != null ? `camera to here ${report.people_ms} ms` : null,
        report.cache === 'on'
          ? `media saved here${report.cached_bytes ? ` (${formatBytes(report.cached_bytes)})` : ''}`
          : `media ${report.cache === 'syncing' ? 'downloading' : 'streamed'}`,
      ].filter(Boolean)
    : []
  const where = [app?.computer ? `computer ${app.computer}` : null, report.address ?? null].filter(Boolean)

  const off = !canEdit || !reachable
  const needsApp = reachable && !canPower
  const powerReason = !reachable
    ? 'It is offline.'
    : !appHere
      ? 'This mini PC runs an older Mini PC app. Paste the install line into PowerShell on it once to update it.'
      : 'Only the Windows Mini PC app can restart or shut down its computer.'

  return (
    <div className="mt-2 space-y-2.5">
      <div className="space-y-0.5 text-xs">
        <p className={player.online && screen === 'none' ? 'text-slate-300' : 'text-amber-200'}>{doing}</p>
        {facts.length > 0 && <p className="tnum text-slate-500">{facts.join(' · ')}</p>}
        {where.length > 0 && <p className="text-slate-600">{where.join(' · ')}</p>}
      </div>

      <label className="flex flex-wrap items-center gap-2">
        <span className="w-20 shrink-0 text-xs text-slate-400">Plays</span>
        <select
          className="input w-auto min-w-0 flex-1 py-1 text-xs"
          value={player.output_id ?? ''}
          disabled={!canEdit}
          onChange={(event) => onPatch(player, { output_id: event.target.value ? Number(event.target.value) : null })}
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
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 shrink-0 text-xs text-slate-400">Projector</span>
        <div className="seg flex-1" role="group" aria-label={`What ${player.name}'s projector shows`}>
          {SCREENS.map((option) => (
            <button
              key={option.id}
              className={classNames('seg-item px-2 py-1 text-xs', screen === option.id && 'seg-item-active')}
              disabled={!canEdit || player.output_id == null || busy != null || screen === option.id}
              title={player.output_id == null ? 'Pick an output first' : option.hint}
              aria-pressed={screen === option.id}
              onClick={() => show(option.id)}
            >
              {option.id === 'none' ? <ShowIcon size={12} aria-hidden /> : option.id === 'grid' ? <TestPatternIcon size={12} aria-hidden /> : option.id === 'black' ? <BlackoutIcon size={12} aria-hidden /> : null}
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button className="btn-default btn-sm" disabled={!canEdit || !player.online || busy != null}
          onClick={identify} title="Show this mini PC's name on its projector for a few seconds">
          <TargetIcon size={12} aria-hidden /> Identify
        </button>
        <button
          className={classNames('btn-default btn-sm', overlay && 'ring-1 ring-sky-400/50')}
          disabled={!canEdit || !player.online || busy != null}
          aria-pressed={overlay}
          onClick={() => send(overlay ? 'overlay_off' : 'overlay_on')}
          title="Show what it is playing, its resolution and timing on top of the picture, on the projector itself"
        >
          <OsdIcon size={12} aria-hidden /> {overlay ? 'Hide info on screen' : 'Info on screen'}
        </button>
        <button className="btn-default btn-sm" disabled={off || busy != null} onClick={() => send('restart_output')}
          title="Close and reopen the full-screen output on this mini PC. Use it when the picture is stuck.">
          <RefreshIcon size={12} aria-hidden /> Restart output
        </button>
        <button className="btn-default btn-sm" disabled={off || !canPower || busy != null}
          onClick={() => setConfirm('reboot')} title={canPower ? 'Restart the whole mini PC' : powerReason}>
          <RefreshIcon size={12} aria-hidden /> Restart computer
        </button>
        <button className="btn-danger-outline btn-sm" disabled={off || !canPower || busy != null}
          onClick={() => setConfirm('shutdown')} title={canPower ? 'Turn the mini PC off' : powerReason}>
          <PowerIcon size={12} aria-hidden /> Shut down
        </button>
        {!reachable && app?.mac && (
          <button className="btn-primary btn-sm" disabled={!canEdit || busy != null} onClick={() => send('wake')}
            title="Send the turn-on signal over the network (Wake-on-LAN)">
            <PowerIcon size={12} aria-hidden /> Turn on
          </button>
        )}
        <button className="btn-ghost btn-sm ml-auto text-red-300" disabled={!canEdit} onClick={() => onRemove(player)}>
          Remove
        </button>
      </div>

      {needsApp && canEdit && (
        <div className="flex items-start gap-2 rounded-md border border-white/[0.06] bg-panel-900 px-3 py-2 text-xs text-slate-400">
          <InfoIcon size={13} className="mt-px shrink-0 text-slate-500" aria-hidden />
          <div className="min-w-0 space-y-1.5">
            <p>Restart computer and Shut down need: {powerReason}</p>
            {!appHere && (
              <p className="select-all break-all rounded bg-black/30 px-2 py-1 font-mono text-[11px] text-slate-200">
                {MINIPC_INSTALL_LINE}
              </p>
            )}
          </div>
        </div>
      )}

      {notice && (
        <p role="status" className="rounded-md bg-sky-500/10 px-3 py-2 text-xs text-sky-100 ring-1 ring-sky-500/25">
          {notice}
        </p>
      )}

      <ConfirmDialog
        open={confirm != null}
        danger
        title={confirm === 'reboot' ? `Restart ${player.name}?` : `Shut down ${player.name}?`}
        target={<span className="text-slate-200">{player.name}{app?.computer ? ` (${app.computer})` : ''}</span>}
        body={
          confirm === 'reboot'
            ? 'Its projector shows nothing for a minute or two while the mini PC restarts. It comes back by itself and picks the show up again.'
            : `Its projector goes dark until the mini PC is turned on again${app?.mac ? ' with Turn on here (if its BIOS allows Wake-on-LAN) or' : ' with'} its power button.`
        }
        confirmLabel={confirm === 'reboot' ? 'Restart it' : 'Shut it down'}
        onConfirm={() => {
          const action = confirm
          setConfirm(null)
          if (action) void send(action)
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
