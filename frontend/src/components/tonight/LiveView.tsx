/**
 * A small live picture of what each mini PC is really putting out, for the
 * home page.
 *
 * The pictures come from the mini PCs themselves, every few seconds and
 * only while someone has this open: the Mini PC app photographs its whole
 * screen (so a Windows message over the show shows up too); without the
 * newer app, the player page sends what it drew. See
 * routes/mapping_players.py ("live view").
 */

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getToken, request } from '@/api/client'
import type { Player } from '@/mapping/editor/PlayersPanel'
import { useFleetContext } from '@/live/LiveProvider'
import { ChevronIcon, ShowIcon } from '@/components/icons'
import { StatusDot } from '@/components/ui'
import { classNames } from '@/lib/format'

const HIDDEN_KEY = 'pc.dashboard.liveview.hidden'
/** How often each picture is fetched; the mini PCs send one about every 3 s. */
const PICTURE_MS = 3000
const PLAYERS_MS = 15_000
/** A picture older than this is marked as old. */
const STALE_SECONDS = 20

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

function writeHidden(hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(HIDDEN_KEY, '1')
    else localStorage.removeItem(HIDDEN_KEY)
  } catch {
    // Private windows may refuse storage; the choice then lasts this visit.
  }
}

interface Picture {
  url: string
  /** Seconds old when fetched. */
  age: number
  fetchedAt: number
  source: 'screen' | 'page'
}

/** The latest picture of one mini PC's output, fetched every few seconds. */
function usePicture(playerId: number): { picture: Picture | null; tried: boolean } {
  const [picture, setPicture] = useState<Picture | null>(null)
  const [tried, setTried] = useState(false)

  useEffect(() => {
    let stopped = false
    let current: string | null = null
    const load = async () => {
      if (document.hidden) return
      try {
        const token = getToken()
        const response = await fetch(`/api/mapping/players/${playerId}/picture`, {
          headers: { 'X-Client': 'ui', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          cache: 'no-store',
        })
        if (stopped) return
        setTried(true)
        if (response.status !== 200) return
        const blob = await response.blob()
        if (stopped) return
        const url = URL.createObjectURL(blob)
        if (current) URL.revokeObjectURL(current)
        current = url
        setPicture({
          url,
          age: Number(response.headers.get('X-Picture-Age') ?? '0'),
          fetchedAt: Date.now(),
          source: response.headers.get('X-Picture-From') === 'page' ? 'page' : 'screen',
        })
      } catch {
        // The server restarting: try again next time.
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), PICTURE_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
      if (current) URL.revokeObjectURL(current)
    }
  }, [playerId])

  return { picture, tried }
}

function ageText(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  return 'over an hour ago'
}

function MiniPcPicture({ player }: { player: Player }) {
  const { picture, tried } = usePicture(player.id)
  const age = picture ? picture.age + (Date.now() - picture.fetchedAt) / 1000 : null
  const stale = age != null && age > STALE_SECONDS
  const note = !player.online
    ? 'Offline'
    : !picture
      ? tried
        ? 'Waiting for a picture'
        : 'Loading…'
      : stale
        ? `No new picture for ${ageText(age!).replace(' ago', '')}`
        : null
  const title =
    picture?.source === 'page'
      ? 'What the player page drew. Rerun the install line on this mini PC to see its whole screen, Windows messages included.'
      : 'A picture of this mini PC’s whole screen, taken on the mini PC.'
  return (
    <div className="w-32 shrink-0 sm:w-40" title={title}>
      <div className="relative aspect-video w-full overflow-hidden rounded bg-black ring-1 ring-white/10">
        {picture && (
          <img
            src={picture.url}
            alt={`What ${player.name} is showing`}
            className={classNames('absolute inset-0 h-full w-full object-contain', (stale || !player.online) && 'opacity-40 grayscale')}
          />
        )}
        {note && (
          <span
            className={classNames(
              'absolute inset-x-0 bottom-0 px-1 py-0.5 text-center text-[10px]',
              !player.online ? 'bg-red-950/80 text-red-200' : 'bg-black/60 text-slate-300',
            )}
          >
            {note}
          </span>
        )}
      </div>
      <span className="mt-1 flex items-center gap-1.5 text-2xs text-slate-400">
        <StatusDot tone={!player.online ? 'fault' : stale || !picture ? 'warn' : 'ok'} />
        <span className="truncate">{player.name}</span>
        {age != null && !stale && player.online && <span className="ml-auto shrink-0 text-slate-600">{ageText(age)}</span>}
      </span>
    </div>
  )
}

function Pictures() {
  const { subscribe } = useFleetContext()
  const [players, setPlayers] = useState<Player[] | null>(null)
  const load = useCallback(() => request<Player[]>('/mapping/players').then(setPlayers).catch(() => undefined), [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), PLAYERS_MS)
    return () => window.clearInterval(timer)
  }, [load])
  useEffect(
    () =>
      subscribe((message) => {
        if (message.type === 'mapping_player' || message.type === 'mapping_players') void load()
      }),
    [subscribe, load],
  )

  if (!players) return <p className="text-xs text-slate-500">Loading…</p>
  const minis = players.filter((p) => p.kind === 'player' && p.approved).sort((a, b) => a.name.localeCompare(b.name))
  if (minis.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        No mini PCs paired yet. Once one is paired on the <Link to="/mapping/players" className="text-sky-300 hover:underline">Players page</Link>,
        its picture shows here.
      </p>
    )
  }
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {minis.map((player) => (
        <MiniPcPicture key={player.id} player={player} />
      ))}
    </div>
  )
}

export function LiveView() {
  const [hidden, setHidden] = useState(readHidden)
  const toggle = () => {
    writeHidden(!hidden)
    setHidden(!hidden)
  }
  return (
    <div className="border-t border-white/[0.06] px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="eyebrow flex items-center gap-1.5">
          <ShowIcon size={13} aria-hidden /> Live view
        </span>
        <span className="hidden text-2xs text-slate-500 sm:inline">what each mini PC is putting out now</span>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" className="btn-ghost btn-sm" onClick={toggle} aria-expanded={!hidden}>
            {hidden ? 'Show' : 'Hide'}
          </button>
          <Link to="/mapping/players" className="btn-ghost btn-sm hidden sm:inline-flex">
            Players <ChevronIcon size={13} aria-hidden />
          </Link>
        </span>
      </div>
      {!hidden && <Pictures />}
    </div>
  )
}
