/**
 * Playlists: scene groups taking turns through the night.
 *
 * "Halloween night" might be Spooky from 6:45 PM, Pumpkins from 8:00 PM
 * and Quiet from 9:30 PM, each fading in over a few seconds. Picking one
 * plays it now and on tonight's show (when tonight has one of its own);
 * the Calendar can put one on any night. The server moves the projectors on at each time
 * (services/playlists.py and services/tonight.py).
 */

import { useState } from 'react'
import { Banner, Chip, ConfirmDialog, EmptyState, Modal } from '@/components/ui'
import type { Tone } from '@/components/tone'
import { AddIcon, CheckIcon, DeleteIcon, EditIcon, ListViewIcon } from '@/components/icons'
import { classNames } from '@/lib/format'
import {
  clockText,
  fadeText,
  nightOrder,
  playlistNow,
  timeOf,
  tonightApi,
  type Playlist,
  type PlaylistStep,
  type SceneGroup,
  type Tonight,
} from '@/lib/tonight'

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

export const FADES = [0, 2, 5, 10, 20, 30]

/** The step after ``last``: an hour later, the next group along. */
function nextStep(steps: PlaylistStep[], groups: SceneGroup[]): PlaylistStep {
  const last = steps[steps.length - 1]
  if (!last) return { at: '18:45', group_id: groups[0]?.id ?? 0, fade_seconds: 5 }
  const [h, m] = last.at.split(':').map(Number)
  const at = `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const used = new Set(steps.map((s) => s.group_id))
  const group = groups.find((g) => !used.has(g.id)) ?? groups[0]
  return { at, group_id: group?.id ?? 0, fade_seconds: last.fade_seconds }
}

/** Tonight's playlist as a row of steps: done ones dimmed, the one on now lit. */
export function PlaylistTimeline({ tonight, className }: { tonight: Tonight; className?: string }) {
  const steps = tonight.playlist_steps
  if (!tonight.playlist_name || steps.length === 0) return null
  const { now, next } = playlistNow(tonight)
  return (
    <div className={classNames('space-y-1.5', className)}>
      <ol className="flex flex-wrap items-center gap-1.5" aria-label={`${tonight.playlist_name}, tonight`}>
        {steps.map((step, i) => (
          <li
            key={`${step.starts_at}-${i}`}
            className={classNames(
              'tnum flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
              step.state === 'now' && 'border-emerald-400/60 bg-emerald-500/15 text-emerald-100',
              step.state === 'later' && 'border-white/10 text-slate-200',
              step.state === 'done' && 'border-white/[0.06] text-slate-500',
              step.state === 'never' && 'border-dashed border-white/10 text-slate-500 line-through',
            )}
            title={step.state === 'never' ? 'This time is after the show ends, so it does not play.' : `${fadeText(step.fade_seconds)}`}
          >
            <span className="font-medium">{timeOf(step.starts_at)}</span>
            <span className="truncate">{step.group_name ?? 'Deleted group'}</span>
            {step.state === 'now' && <span className="text-2xs font-semibold uppercase tracking-wide text-emerald-300">now</span>}
          </li>
        ))}
      </ol>
      {(now || next) && (
        <p className="text-sm text-slate-300">
          {now}
          {now && next && <span className="text-slate-500"> · </span>}
          {next && <span className="text-slate-400">{next}</span>}
        </p>
      )}
    </div>
  )
}

/** "6:45 PM Spooky · 8:00 PM Pumpkins · 9:30 PM Quiet". */
function stepsLine(playlist: Playlist, groups: SceneGroup[]): string[] {
  const name = (id: number) => groups.find((g) => g.id === id)?.name ?? 'Deleted group'
  return playlist.steps.map((s) => `${clockText(s.at)}  ${name(s.group_id)}${s.fade_seconds > 0 ? '' : ' (cut)'}`)
}

export function PlaylistsPanel({
  tonight,
  groups,
  playlists,
  showOptions,
  canOperate,
  canEdit,
  onTonight,
  onNotice,
  onChanged,
}: {
  tonight: Tonight | null
  groups: SceneGroup[]
  playlists: Playlist[]
  showOptions: { id: number; name: string }[]
  canOperate: boolean
  canEdit: boolean
  onTonight: (next: Tonight) => void
  onNotice: (notice: { tone: Tone; text: string }) => void
  onChanged: () => void
}) {
  const [editor, setEditor] = useState<{ playlist: Playlist | null } | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const multipleShows = showOptions.length > 1

  const use = async (playlist: Playlist) => {
    setBusy(playlist.id)
    try {
      const next = await tonightApi.usePlaylist(playlist.id)
      onTonight(next)
      onNotice(usedPlaylistText(playlist, next))
    } catch (err) {
      onNotice({ tone: 'fault', text: errorText(err, 'That did not work') })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="panel" aria-label="Playlists">
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex min-w-0 items-start gap-2">
          <ListViewIcon size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-100">Playlists</h2>
            <p className="mt-0.5 text-xs text-slate-500">Scene groups that take turns through the night, at the times you set, with a fade between them.</p>
          </div>
        </div>
        {canEdit && groups.length > 0 && (
          <button className="btn-default btn-sm" onClick={() => setEditor({ playlist: null })}>
            <AddIcon size={14} aria-hidden /> New playlist
          </button>
        )}
      </header>
      {playlists.length === 0 ? (
        <EmptyState
          icon={ListViewIcon}
          title="No playlists yet"
          action={
            canEdit &&
            groups.length > 0 && (
              <button className="btn-primary" onClick={() => setEditor({ playlist: null })}>
                <AddIcon size={15} aria-hidden /> Make a playlist
              </button>
            )
          }
        >
          {groups.length > 0
            ? 'A playlist changes the scenes by itself during the night: spooky at 6:45, pumpkins at 8:00, something quiet at 9:30.'
            : 'Make a few scene groups first. A playlist plays them one after another at the times you pick.'}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {playlists.map((playlist) => {
            // Tonight's show plays it (picked last, with no show tonight, it only waits for Start now).
            const active = tonight?.playlist_id === playlist.id && (tonight.state === 'later' || tonight.state === 'running')
            const playingNow = tonight?.playlist_id === playlist.id && tonight.state === 'running'
            return (
              <div
                key={playlist.id}
                className={classNames(
                  'relative flex min-w-0 flex-col rounded-lg border transition-colors',
                  active || playingNow ? 'border-sky-400/70 bg-sky-500/[0.09]' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20',
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-col items-start gap-1 px-4 py-3 text-left disabled:cursor-default"
                  disabled={!canOperate || busy != null}
                  aria-pressed={active}
                  onClick={() => void use(playlist)}
                  title={canOperate ? 'Play this tonight' : undefined}
                >
                  <span className="flex w-full items-center gap-2 pr-7">
                    <span className="truncate text-base font-semibold text-slate-50">{playlist.name}</span>
                    {playingNow ? (
                      <Chip tone="ok" className="shrink-0">
                        <CheckIcon size={12} aria-hidden /> Playing
                      </Chip>
                    ) : (
                      active && (
                        <Chip tone="ok" className="shrink-0">
                          <CheckIcon size={12} aria-hidden /> Tonight
                        </Chip>
                      )
                    )}
                    {busy === playlist.id && <span className="text-xs text-slate-400">Setting…</span>}
                  </span>
                  {multipleShows && <span className="text-2xs text-slate-500">{showOptions.find((s) => s.id === playlist.show_id)?.name ?? ''}</span>}
                  {stepsLine(playlist, groups).map((line, i) => (
                    <span key={`${line}-${i}`} className="tnum block w-full truncate whitespace-pre text-xs text-slate-400">
                      {line}
                    </span>
                  ))}
                </button>
                {canEdit && (
                  <button
                    type="button"
                    className="btn-ghost btn-icon absolute right-1.5 top-1.5"
                    aria-label={`Change ${playlist.name}`}
                    title="Change this playlist"
                    onClick={() => setEditor({ playlist })}
                  >
                    <EditIcon size={14} aria-hidden />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
      {editor && (
        <PlaylistEditor
          playlist={editor.playlist}
          groups={groups}
          showOptions={showOptions}
          defaultShowId={tonight?.show_id ?? null}
          onClose={() => {
            setEditor(null)
            onChanged()
          }}
          onSaved={async (saved, useNow) => {
            setEditor(null)
            onChanged()
            if (useNow) await use(saved)
            else onNotice({ tone: 'ok', text: `${saved.name} saved.` })
          }}
        />
      )}
    </section>
  )
}

/** What picking a playlist did, for the notice under the card. */
export function usedPlaylistText(playlist: Playlist, tonight: Tonight): { tone: Tone; text: string } {
  const planned = tonight.tonight_slots.find((s) => new Date(s.ends_at).getTime() > Date.now())
  if (planned && planned.playlist_id !== playlist.id) {
    return {
      tone: 'warn',
      text: `${playlist.name} is set. Tonight’s ${planned.title} covers several nights and keeps its own look; change it on the Calendar.`,
    }
  }
  if (tonight.playlist_id === playlist.id && tonight.state === 'running') {
    return { tone: 'ok', text: `Playing ${playlist.name}. The scenes change by themselves at each time.` }
  }
  if (!planned) {
    return { tone: 'warn', text: `${playlist.name} is set, but no show is planned tonight. Add a show tonight, or press Start now.` }
  }
  return { tone: 'ok', text: `${playlist.name} plays tonight. The scenes change by themselves at each time once the show starts.` }
}

function PlaylistEditor({
  playlist,
  groups,
  showOptions,
  defaultShowId,
  onClose,
  onSaved,
}: {
  playlist: Playlist | null
  groups: SceneGroup[]
  showOptions: { id: number; name: string }[]
  defaultShowId: number | null
  onClose: () => void
  onSaved: (playlist: Playlist, useNow: boolean) => Promise<void>
}) {
  const [showId, setShowId] = useState<number | null>(
    playlist?.show_id ?? (groups.some((g) => g.show_id === defaultShowId) ? defaultShowId : groups[0]?.show_id ?? null),
  )
  const showGroups = groups.filter((g) => g.show_id === showId)
  const [name, setName] = useState(playlist?.name ?? '')
  const [steps, setSteps] = useState<PlaylistStep[]>(() => {
    if (playlist) return playlist.steps.map((s) => ({ ...s }))
    const first = nextStep([], showGroups)
    return [first, nextStep([first], showGroups)]
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const change = (index: number, patch: Partial<PlaylistStep>) =>
    setSteps((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  const times = steps.map((s) => s.at)
  const problem = !name.trim()
    ? 'Give the playlist a name.'
    : steps.length === 0
      ? 'Add at least one step.'
      : steps.some((s) => !s.at)
        ? 'Every step needs a time.'
        : steps.some((s) => !showGroups.some((g) => g.id === s.group_id))
          ? 'Pick a scene group for every step.'
          : new Set(times).size !== times.length
            ? 'Two steps start at the same time. Give each its own time.'
            : null

  const save = async (useNow: boolean) => {
    if (problem) return
    setBusy(true)
    setError(null)
    const body = { name: name.trim(), show_id: showId, steps: [...steps].sort((a, b) => nightOrder(a.at) - nightOrder(b.at)) }
    try {
      const saved = playlist ? await tonightApi.updatePlaylist(playlist.id, body) : await tonightApi.createPlaylist(body)
      await onSaved(saved, useNow)
    } catch (err) {
      setError(errorText(err, 'Saving the playlist failed'))
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!playlist) return
    setBusy(true)
    try {
      await tonightApi.deletePlaylist(playlist.id)
      onClose()
    } catch (err) {
      setError(errorText(err, 'Deleting the playlist failed'))
      setBusy(false)
    }
  }

  return (
    <Modal open label={playlist ? `Change ${playlist.name}` : 'New playlist'} onClose={onClose} size="lg">
      <div className="space-y-4 p-5">
        <div>
          <h3 className="text-base font-semibold text-slate-50">{playlist ? `Change “${playlist.name}”` : 'New playlist'}</h3>
          <p className="mt-1 text-sm text-slate-400">
            At each time, every projector moves on to that scene group, fading over the time you pick. Before the first time, the first
            group plays. Times after midnight count as the same night.
          </p>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-400">Name</span>
          <input className="input w-full" value={name} maxLength={128} placeholder="Halloween night" onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        {!playlist && showOptions.length > 1 && (
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-400">Show</span>
            <select
              className="input w-full"
              value={showId ?? ''}
              onChange={(e) => {
                const id = Number(e.target.value)
                setShowId(id)
                const first = groups.find((g) => g.show_id === id)?.id ?? 0
                setSteps((current) => current.map((s) => ({ ...s, group_id: first })))
              }}
            >
              {showOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="space-y-2">
          <div className="hidden grid-cols-[8.75rem_minmax(0,1fr)_7rem_2rem] gap-2 text-xs font-medium text-slate-400 sm:grid">
            <span>From</span>
            <span>Scene group</span>
            <span>Fade in</span>
            <span />
          </div>
          {steps.map((step, i) => (
            <div key={i} className="grid grid-cols-[8.75rem_minmax(0,1fr)_2rem] gap-2 rounded-lg border border-white/[0.06] p-2 sm:grid-cols-[8.75rem_minmax(0,1fr)_7rem_2rem] sm:border-0 sm:p-0">
              <input
                type="time"
                className="input w-full"
                aria-label={`Step ${i + 1} time`}
                value={step.at}
                onChange={(e) => change(i, { at: e.target.value })}
              />
              <select
                className="input min-w-0 w-full"
                aria-label={`Step ${i + 1} scene group`}
                value={step.group_id || ''}
                onChange={(e) => change(i, { group_id: Number(e.target.value) })}
              >
                {!showGroups.some((g) => g.id === step.group_id) && <option value="">Pick a group</option>}
                {showGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <select
                className="input order-last col-span-2 w-full sm:order-none sm:col-span-1"
                aria-label={`Step ${i + 1} fade`}
                value={step.fade_seconds}
                onChange={(e) => change(i, { fade_seconds: Number(e.target.value) })}
              >
                {FADES.map((f) => (
                  <option key={f} value={f}>
                    {f === 0 ? 'Cut' : `${f} sec`}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-ghost btn-icon"
                aria-label={`Remove step ${i + 1}`}
                title="Remove this step"
                disabled={steps.length <= 1}
                onClick={() => setSteps((current) => current.filter((_, j) => j !== i))}
              >
                <DeleteIcon size={15} aria-hidden />
              </button>
            </div>
          ))}
          {steps.length < 24 && (
            <button type="button" className="btn-default btn-sm" onClick={() => setSteps((current) => [...current, nextStep(current, showGroups)])}>
              <AddIcon size={14} aria-hidden /> Add a step
            </button>
          )}
        </div>
        {showGroups.length === 0 && <p className="text-xs text-slate-500">This show has no scene groups yet. Make them under “Pick tonight’s scenes” first.</p>}
        {problem && name.trim() && <p className="text-xs text-amber-300">{problem}</p>}
        {error && <Banner tone="fault">{error}</Banner>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {playlist && (
            <button className="btn-danger-outline sm:mr-auto" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Delete playlist
            </button>
          )}
          <button className="btn-default sm:ml-auto" onClick={onClose}>
            Cancel
          </button>
          {!playlist && (
            <button className="btn-default" disabled={busy || !!problem} onClick={() => void save(false)}>
              Save
            </button>
          )}
          <button className="btn-primary" disabled={busy || !!problem} onClick={() => void save(!playlist)}>
            {playlist ? 'Save' : 'Save and play tonight'}
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete “${playlist?.name}”?`}
        body="The scene groups in it are kept. Calendar nights that play it go back to the scenes the cues have."
        confirmLabel="Delete playlist"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
      />
    </Modal>
  )
}
