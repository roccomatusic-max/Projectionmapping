/**
 * What the mapping show is doing, on every page.
 *
 * The transport arrives over the same live feed as the projectors
 * (mapping_transport); the mini PC list is re-read now and then because
 * "online" comes from their heartbeats, which are not announced.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { request } from '@/api/client'
import { classNames } from '@/lib/format'
import { useFleetContext } from '@/live/LiveProvider'
import { mappingApi } from '@/mapping/api'
import type { ShowSummary, TransportState } from '@/mapping/types'
import type { Player } from '@/mapping/editor/PlayersPanel'
import { MiniPcIcon } from '../icons'
import type { Tone } from '../tone'
import { StatusDot } from '../ui'

export interface ShowStatus {
  /** Nothing loaded yet, or this server has no mapping module. */
  ready: boolean
  transport: TransportState | null
  /** The show the transport is on, when it is on one. */
  showName: string | null
  shows: ShowSummary[]
  /** Mini PCs (not cameras) that are paired. */
  players: { paired: number; online: number; waiting: number; cameras: number; camerasOnline: number }
}

const EMPTY: ShowStatus = {
  ready: false,
  transport: null,
  showName: null,
  shows: [],
  players: { paired: 0, online: 0, waiting: 0, cameras: 0, camerasOnline: 0 },
}

const ShowStatusContext = createContext<ShowStatus>(EMPTY)

const PLAYERS_EVERY_MS = 15_000

export function ShowStatusProvider({ children }: { children: ReactNode }) {
  const { subscribe } = useFleetContext()
  const [transport, setTransport] = useState<TransportState | null>(null)
  const [shows, setShows] = useState<ShowSummary[]>([])
  const [players, setPlayers] = useState<Player[] | null>(null)

  const loadShows = useCallback(() => mappingApi.listShows().then(setShows).catch(() => undefined), [])
  const loadPlayers = useCallback(
    () => request<Player[]>('/mapping/players').then(setPlayers).catch(() => undefined),
    [],
  )

  useEffect(() => {
    void mappingApi.transport().then(setTransport).catch(() => undefined)
    void loadShows()
    void loadPlayers()
    const timer = window.setInterval(() => void loadPlayers(), PLAYERS_EVERY_MS)
    return () => window.clearInterval(timer)
  }, [loadShows, loadPlayers])

  useEffect(
    () =>
      subscribe((message) => {
        if (message.type === 'mapping_transport') setTransport(message.payload as unknown as TransportState)
        else if (message.type === 'mapping_shows' || message.type === 'mapping_show') void loadShows()
        else if (message.type === 'mapping_player' || message.type === 'mapping_players') void loadPlayers()
        else if (message.type === 'mapping_reconnected') void mappingApi.transport().then(setTransport).catch(() => undefined)
      }),
    [subscribe, loadShows, loadPlayers],
  )

  const value = useMemo<ShowStatus>(() => {
    const list = players ?? []
    const minis = list.filter((p) => p.kind === 'player' && p.approved)
    const cameras = list.filter((p) => p.kind === 'camera' && p.approved)
    const waiting = list.filter((p) => !p.approved && !(p.kind === 'camera' && p.companion_id != null)).length
    return {
      ready: transport != null,
      transport,
      showName: shows.find((s) => s.id === transport?.show_id)?.name ?? null,
      shows,
      players: {
        paired: minis.length,
        online: minis.filter((p) => p.online).length,
        waiting,
        cameras: cameras.length,
        camerasOnline: cameras.filter((p) => p.online).length,
      },
    }
  }, [transport, shows, players])

  return <ShowStatusContext.Provider value={value}>{children}</ShowStatusContext.Provider>
}

export function useShowStatus() {
  return useContext(ShowStatusContext)
}

/** The show's state in a word, a tone for its dot, and one line of detail. */
export function describeShow(status: ShowStatus): { label: string; tone: Tone; detail: string } {
  const t = status.transport
  const cue = t?.current
  const cueText = cue ? `cue ${cue.position + 1}${cue.name ? ` · ${cue.name}` : ''}` : ''
  const show = status.showName ?? 'the show'
  if (t?.emergency) {
    return { label: 'Stopped (emergency)', tone: 'fault', detail: 'The emergency stop is on: every output is black' }
  }
  switch (t?.status) {
    case 'playing':
      return { label: 'Playing', tone: 'ok', detail: `${show}, ${cueText}` }
    case 'paused':
      return { label: 'Paused', tone: 'warn', detail: `${show}, ${cueText}` }
    case 'blackout':
      return { label: 'Blackout', tone: 'fault', detail: 'Every projector is showing black' }
    default:
      return { label: 'Stopped', tone: 'idle', detail: 'Nothing is playing. Press GO to start.' }
  }
}

/** The top bar's show readout: one click to the GO button. */
export function ShowStatusChip() {
  const status = useShowStatus()
  if (!status.ready) return null
  const { label, tone, detail } = describeShow(status)
  const { paired, online, waiting } = status.players
  const playersTone: Tone = waiting > 0 ? 'busy' : paired === 0 ? 'idle' : online === paired ? 'ok' : 'warn'
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs">
      <Link
        to="/mapping/run"
        className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 hover:bg-white/[0.05]"
        title={`Show: ${label}. ${detail}. Click to open Run the show.`}
      >
        <StatusDot tone={tone} pulse={tone === 'ok'} />
        <span className={classNames('truncate font-medium', tone === 'fault' ? 'text-red-300' : 'text-slate-100')}>
          {status.transport?.emergency ? 'Emergency stop on' : `Show ${label.toLowerCase()}`}
        </span>
        {status.transport?.current && (status.transport.status === 'playing' || status.transport.status === 'paused') && (
          <span className="hidden min-w-0 truncate text-slate-400 md:inline">
            · cue {status.transport.current.position + 1}
            {status.transport.current.name ? ` ${status.transport.current.name}` : ''}
          </span>
        )}
      </Link>
      {(paired > 0 || waiting > 0) && (
        <Link
          to="/mapping/players"
          className="hidden items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-slate-400 hover:bg-white/[0.05] sm:flex"
          title={
            waiting > 0
              ? `${waiting} mini PC${waiting === 1 ? '' : 's'} waiting for you to approve the code on its projector`
              : `${online} of ${paired} mini PCs connected`
          }
        >
          <MiniPcIcon size={13} className="text-slate-500" aria-hidden />
          {waiting > 0 ? (
            <span className="text-sky-300">{waiting} to approve</span>
          ) : (
            <>
              <span className={classNames('tnum', playersTone === 'ok' ? 'text-slate-200' : 'text-yellow-300')}>{online}</span>/
              <span className="tnum">{paired}</span> mini PCs
            </>
          )}
        </Link>
      )}
    </div>
  )
}
