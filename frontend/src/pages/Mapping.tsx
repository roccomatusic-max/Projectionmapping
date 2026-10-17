import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, type Session } from '@/api/client'
import type { Projector } from '@/api/types'
import { ConfirmDialog, EmptyState, ErrorBanner, Panel, Spinner } from '@/components/ui'
import { classNames } from '@/lib/format'
import { mappingApi } from '@/mapping/api'
import { CameraPanel } from '@/mapping/editor/CameraPanel'
import { CueList, CanvasOverview, MediaLibrary, outputColor } from '@/mapping/editor/panels'
import { NumberField } from '@/mapping/editor/controls'
import { OutputInspector } from '@/mapping/editor/OutputInspector'
import { PlayersPanel } from '@/mapping/editor/PlayersPanel'
import { TransportBar } from '@/mapping/editor/TransportBar'
import { sideBySide, withDefaults } from '@/mapping/geometry'
import { useLocalChannel } from '@/mapping/live'
import type { Cue, MediaAsset, Output, ShowSummary, TransportAction } from '@/mapping/types'
import { useShowRuntime } from '@/mapping/useShowRuntime'

const SHOW_KEY = 'pc.mapping.show'
/** Geometry is saved this long after the last change while dragging. */
const SAVE_DELAY_MS = 250

type Section = 'show' | 'camera' | 'players' | 'remote'

/** Messages the camera tab follows: progress, new photos, tracked people. */
const CAMERA_MESSAGES = new Set(['mapping_calib_pattern', 'mapping_camera', 'mapping_people'])

export default function Mapping({ session }: { session: Session }) {
  const canEdit = session.role === 'admin'
  const canRun = session.role === 'admin' || session.role === 'operator'
  const [shows, setShows] = useState<ShowSummary[] | null>(null)
  const [showId, setShowId] = useState<number | null>(() => {
    const stored = Number(localStorage.getItem(SHOW_KEY))
    return Number.isFinite(stored) && stored > 0 ? stored : null
  })
  const [section, setSection] = useState<Section>(() => (window.innerWidth < 768 ? 'remote' : 'show'))
  const [selectedOutput, setSelectedOutput] = useState<number | null>(null)
  const [projectors, setProjectors] = useState<Projector[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [playersKey, setPlayersKey] = useState(0)
  const [confirm, setConfirm] = useState<{ title: string; body: string; action: () => void } | null>(null)

  const cameraFeed = useRef(new EventTarget()).current
  const runtime = useShowRuntime(showId, (message) => {
    if (message.type === 'mapping_player') setPlayersKey((n) => n + 1)
    if (CAMERA_MESSAGES.has(message.type)) cameraFeed.dispatchEvent(new CustomEvent('message', { detail: message }))
  })
  const { show, setShow, media, reloadMedia, transport, clock, playback, link } = runtime

  // Local geometry edits win over the server copy until they are saved, so
  // an echo of an older save never yanks a handle back mid-drag.
  const [overrides, setOverrides] = useState<Map<number, Output>>(new Map())
  const saveTimers = useRef(new Map<number, number>())
  const editSerial = useRef(new Map<number, number>())
  const broadcast = useLocalChannel()

  const loadShows = useCallback(async () => {
    try {
      const list = await mappingApi.listShows()
      setShows(list)
      setShowId((current) => (current && list.some((s) => s.id === current) ? current : list[0]?.id ?? null))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shows')
    }
  }, [])

  useEffect(() => {
    void loadShows()
    api.listProjectors().then(setProjectors).catch(() => undefined)
  }, [loadShows])

  useEffect(() => {
    if (showId != null) localStorage.setItem(SHOW_KEY, String(showId))
    setOverrides(new Map())
    setSelectedOutput(null)
  }, [showId])

  useEffect(() => {
    if (runtime.error) setError(runtime.error)
  }, [runtime.error])

  const outputs = useMemo(
    () => (show?.outputs ?? []).map((o) => overrides.get(o.id) ?? o),
    [show, overrides],
  )
  const output = outputs.find((o) => o.id === selectedOutput) ?? outputs[0] ?? null

  const changeOutput = useCallback(
    (target: Output, patch: Partial<Output>) => {
      const next = withDefaults({ ...target, ...patch })
      setOverrides((map) => new Map(map).set(next.id, next))
      broadcast({ type: 'output', output: next })
      const serial = (editSerial.current.get(next.id) ?? 0) + 1
      editSerial.current.set(next.id, serial)
      window.clearTimeout(saveTimers.current.get(next.id))
      saveTimers.current.set(
        next.id,
        window.setTimeout(async () => {
          try {
            const { id, show_id: _s, position: _p, ...body } = next
            void _s
            void _p
            const saved = withDefaults(await mappingApi.updateOutput(id, body))
            setShow((current) =>
              current ? { ...current, outputs: current.outputs.map((o) => (o.id === saved.id ? saved : o)) } : current,
            )
            // Drop the override only if nothing changed while saving.
            if (editSerial.current.get(id) === serial) {
              setOverrides((map) => {
                const copy = new Map(map)
                copy.delete(id)
                return copy
              })
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Saving the output failed')
          }
        }, SAVE_DELAY_MS),
      )
    },
    [broadcast, setShow],
  )

  const guard = async (work: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await work()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const reloadShow = async () => {
    await runtime.refresh()
    await loadShows()
  }

  const command = (action: TransportAction, extra: { cue?: number } = {}) => {
    if (!show) return
    void guard(async () => {
      // GO on a show that is not the live one starts it from its first cue.
      if (action === 'go' && transport?.show_id !== show.id) {
        await mappingApi.command('goto', { show_id: show.id, cue: 0 })
      } else if (action === 'goto') {
        await mappingApi.command('goto', { show_id: show.id, cue: extra.cue })
      } else {
        await mappingApi.command(action, { show_id: show.id })
      }
    })
  }

  const addOutput = () =>
    show &&
    guard(async () => {
      const n = show.outputs.length + 1
      const created = await mappingApi.createOutput(show.id, { name: `Projector ${n}` })
      await reloadShow()
      setSelectedOutput(created.id)
    })

  const arrange = (overlap: number) => {
    if (!show || outputs.length < 2) return
    const layout = sideBySide(outputs.length, overlap)
    outputs.forEach((o, i) =>
      changeOutput(o, {
        source: layout[i].source,
        blend: {
          ...o.blend,
          left: { ...o.blend.left, width: layout[i].blendLeft },
          right: { ...o.blend.right, width: layout[i].blendRight },
        },
      }),
    )
  }

  const openWindow = async (target: Output) => {
    if (!show) return
    const url = `/mapping/output/${show.id}/${target.id}`
    const name = `output-${target.id}`
    // Chrome and Edge can place the window on a chosen display.
    const w = window as Window & { getScreenDetails?: () => Promise<{ screens: ScreenLike[] }> }
    if (w.getScreenDetails) {
      try {
        const { screens } = await w.getScreenDetails()
        const others = screens.filter((s) => !s.isPrimary)
        const pick = others.length === 1 ? others[0] : await chooseScreen(screens)
        if (pick) {
          window.open(url, name,
            `popup,left=${pick.availLeft},top=${pick.availTop},width=${pick.availWidth},height=${pick.availHeight}`)
          return
        }
      } catch {
        /* permission refused: fall through */
      }
    }
    window.open(url, name, 'popup,width=1280,height=800')
  }

  const createShow = (name: string, width: number, height: number) =>
    guard(async () => {
      const created = await mappingApi.createShow({ name, canvas_width: width, canvas_height: height })
      setCreating(false)
      await loadShows()
      setShowId(created.id)
    })

  const cueOps = {
    onUpdate: (cue: Cue, patch: Partial<Cue>) =>
      guard(async () => {
        await mappingApi.updateCue(cue.id, patch)
        await runtime.refresh()
      }),
    onDelete: (cue: Cue) =>
      setConfirm({
        title: 'Delete cue',
        body: `Delete cue ${cue.position + 1}${cue.name ? ` "${cue.name}"` : ''}?`,
        action: () =>
          guard(async () => {
            await mappingApi.deleteCue(cue.id)
            await reloadShow()
          }),
      }),
    onMove: (cue: Cue, delta: -1 | 1) =>
      show &&
      guard(async () => {
        const ids = show.cues.map((c) => c.id)
        const i = ids.indexOf(cue.id)
        ;[ids[i], ids[i + delta]] = [ids[i + delta], ids[i]]
        await mappingApi.reorderCues(show.id, ids)
        await runtime.refresh()
      }),
    onGoto: (cue: Cue) => command('goto', { cue: cue.position }),
  }

  const addCue = (asset: MediaAsset) =>
    show &&
    guard(async () => {
      await mappingApi.createCue(show.id, {
        name: asset.name.replace(/\.[^.]+$/, ''),
        media_id: asset.id,
        loop: asset.kind === 'video',
      })
      await reloadShow()
    })

  const deleteMedia = (asset: MediaAsset) =>
    setConfirm({
      title: 'Delete media',
      body: `Delete ${asset.name} from the library? Cues using it will play black.`,
      action: () =>
        guard(async () => {
          await mappingApi.deleteMedia(asset.id)
          await reloadMedia()
          await runtime.refresh()
        }),
    })

  if (shows === null) return <Spinner label="Loading shows…" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-slate-100">Mapping</h1>
        {shows.length > 0 && (
          <select className="input w-auto py-1.5" value={showId ?? ''} onChange={(e) => setShowId(Number(e.target.value))}>
            {shows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.canvas_width}×{s.canvas_height}
              </option>
            ))}
          </select>
        )}
        {canEdit && (
          <button className="btn-default text-xs" onClick={() => setCreating(true)}>
            New show
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className={classNames('text-xs', link === 'open' ? 'text-slate-500' : 'text-amber-300')}>
            live link {link}
          </span>
          <div className="inline-flex gap-0.5 rounded-md bg-panel-850 p-0.5 ring-1 ring-white/5">
            {(['remote', 'show', 'camera', 'players'] as Section[]).map((s) => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={classNames(
                  'rounded px-3 py-1 text-xs font-medium capitalize',
                  section === s ? 'bg-panel-700 text-slate-100' : 'text-slate-400 hover:text-slate-200',
                )}
              >
                {s === 'show' ? 'Editor' : s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {creating && <NewShowForm onCreate={createShow} onCancel={() => setCreating(false)} busy={busy} />}

      {shows.length === 0 && !creating && (
        <Panel>
          <EmptyState
            title="No shows yet"
            action={
              canEdit ? (
                <button className="btn-primary" onClick={() => setCreating(true)}>
                  Create a show
                </button>
              ) : undefined
            }
          >
            A show is a content canvas (the flat image of the building), the projectors that each cover part of it,
            and a list of cues to play.
          </EmptyState>
        </Panel>
      )}

      {section === 'players' && (
        <Panel title="Players" description="The small computers beside the projectors, each driving one output.">
          <PlayersPanel
            outputs={outputs.map((o) => ({ id: o.id, label: `${show?.name ?? ''} · ${o.name}` }))}
            canEdit={canEdit}
            refreshKey={playersKey}
            onError={setError}
          />
        </Panel>
      )}

      {show && section !== 'players' && (
        <>
          <TransportBar show={show} transport={transport} clock={clock} canRun={canRun} busy={busy}
            large={section === 'remote'} onCommand={command} />

          {section === 'remote' && (
            <Panel title="Cues">
              <CueList show={show} media={media} transport={transport} canEdit={false} canRun={canRun} compact {...cueOps} />
            </Panel>
          )}

          {section === 'camera' && (
            <Panel title="Camera" description="Line the show up with the camera, let it calibrate each projector, and see who it tracks.">
              <CameraPanel show={show} outputs={outputs} canEdit={canEdit} feed={cameraFeed}
                refreshKey={playersKey} onError={setError} onShowChanged={() => void runtime.refresh()} />
            </Panel>
          )}

          {section === 'show' && (
            <div className="grid gap-4 2xl:grid-cols-[420px_minmax(0,1fr)]">
              <div className="space-y-4">
                <Panel title="Cues" description="GO plays them in order.">
                  <CueList show={show} media={media} transport={transport} canEdit={canEdit} canRun={canRun} {...cueOps} />
                </Panel>
                <Panel title="Media library">
                  <MediaLibrary media={media} canEdit={canEdit} onUploaded={() => void reloadMedia()}
                    onDelete={deleteMedia} onAddCue={addCue} />
                </Panel>
              </div>

              <div className="min-w-0 space-y-4">
                <Panel
                  title="Canvas"
                  description={`${show.canvas_width} × ${show.canvas_height}. Each coloured box is the part one projector shows.`}
                  action={
                    canEdit ? (
                      <div className="flex gap-2">
                        {outputs.length > 1 && <ArrangeButton onArrange={arrange} />}
                        <button className="btn-default text-xs" onClick={addOutput} disabled={busy}>
                          Add output
                        </button>
                      </div>
                    ) : undefined
                  }
                >
                  {outputs.length === 0 ? (
                    <EmptyState title="No outputs">Add one output per projector.</EmptyState>
                  ) : (
                    <>
                      <CanvasOverview show={show} outputs={outputs} selectedId={output?.id ?? null}
                        onSelect={setSelectedOutput} />
                      <div className="mt-3 flex flex-wrap gap-2">
                        {outputs.map((o, i) => (
                          <button
                            key={o.id}
                            onClick={() => setSelectedOutput(o.id)}
                            className={classNames(
                              'chip ring-1',
                              o.id === output?.id ? 'bg-panel-700 text-slate-100 ring-white/20' : 'bg-panel-850 text-slate-400 ring-white/5',
                            )}
                          >
                            <span className="h-2 w-2 rounded-full" style={{ background: outputColor(i) }} />
                            {o.name}
                            {o.test_pattern !== 'none' && <span className="text-amber-300">· {o.test_pattern}</span>}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </Panel>

                {output && (
                  <Panel title={output.name} description={`${output.width} × ${output.height} output`}>
                    <OutputInspector
                      show={show}
                      output={output}
                      projectors={projectors}
                      playback={playback}
                      clock={clock}
                      canEdit={canEdit}
                      onChange={(patch) => changeOutput(output, patch)}
                      onOpenWindow={() => void openWindow(output)}
                      onIdentify={() => void guard(() => mappingApi.identifyOutput(output.id))}
                      onDelete={() =>
                        setConfirm({
                          title: 'Delete output',
                          body: `Delete ${output.name} and its warp, masks and blends?`,
                          action: () =>
                            guard(async () => {
                              await mappingApi.deleteOutput(output.id)
                              setSelectedOutput(null)
                              await reloadShow()
                            }),
                        })
                      }
                    />
                  </Panel>
                )}

                {canEdit && (
                  <ShowSettings
                    key={show.id}
                    name={show.name}
                    width={show.canvas_width}
                    height={show.canvas_height}
                    onSave={(body) =>
                      guard(async () => {
                        await mappingApi.updateShow(show.id, body)
                        await reloadShow()
                      })
                    }
                    onDelete={() =>
                      setConfirm({
                        title: 'Delete show',
                        body: `Delete ${show.name}, its outputs and cues? Media stays in the library.`,
                        action: () =>
                          guard(async () => {
                            await mappingApi.deleteShow(show.id)
                            setShowId(null)
                            await loadShows()
                          }),
                      })
                    }
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirm != null}
        title={confirm?.title ?? ''}
        body={confirm?.body ?? ''}
        danger
        confirmLabel="Delete"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          confirm?.action()
          setConfirm(null)
        }}
      />
    </div>
  )
}

interface ScreenLike {
  label: string
  isPrimary: boolean
  availLeft: number
  availTop: number
  availWidth: number
  availHeight: number
  width: number
  height: number
}

/** A minimal display picker; the Window Management API has no UI of its own. */
function chooseScreen(screens: ScreenLike[]): Promise<ScreenLike | null> {
  const lines = screens.map((s, i) => `${i + 1}: ${s.label || 'Display'} (${s.width}×${s.height})${s.isPrimary ? ' main' : ''}`)
  const answer = window.prompt(`Open the output on which display?\n${lines.join('\n')}`, '2')
  const index = Number(answer) - 1
  return Promise.resolve(screens[index] ?? null)
}

function ArrangeButton({ onArrange }: { onArrange: (overlap: number) => void }) {
  const [open, setOpen] = useState(false)
  const [overlap, setOverlap] = useState(15)
  if (!open) {
    return (
      <button className="btn-ghost text-xs" onClick={() => setOpen(true)} title="Lay the outputs out left to right with blends">
        Side by side…
      </button>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1 text-xs text-slate-400">
        overlap
        <input type="number" className="input w-16 py-1 text-xs" min={0} max={50} value={overlap}
          onChange={(e) => setOverlap(Number(e.target.value))} />%
      </label>
      <button className="btn-primary px-2 py-1 text-xs" onClick={() => { onArrange(Math.max(0, Math.min(50, overlap)) / 100); setOpen(false) }}>
        Apply
      </button>
      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  )
}

function NewShowForm({
  onCreate,
  onCancel,
  busy,
}: {
  onCreate: (name: string, width: number, height: number) => void
  onCancel: () => void
  busy: boolean
}) {
  const [name, setName] = useState('')
  const [width, setWidth] = useState(3840)
  const [height, setHeight] = useState(2160)
  return (
    <Panel title="New show" description="The canvas is the flat image of the building that content is made for.">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_140px_140px_auto]"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) onCreate(name.trim(), width, height)
        }}
      >
        <label className="block">
          <span className="label">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Town Hall façade" autoFocus />
        </label>
        <NumberField label="Canvas width" value={width} min={16} suffix="px" onChange={(v) => setWidth(Math.round(v))} />
        <NumberField label="Canvas height" value={height} min={16} suffix="px" onChange={(v) => setHeight(Math.round(v))} />
        <div className="flex items-end gap-2">
          <button className="btn-primary" disabled={busy || !name.trim()}>Create</button>
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </Panel>
  )
}

function ShowSettings({
  name,
  width,
  height,
  onSave,
  onDelete,
}: {
  name: string
  width: number
  height: number
  onSave: (body: { name: string; canvas_width: number; canvas_height: number }) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState({ name, canvas_width: width, canvas_height: height })
  const dirty = draft.name !== name || draft.canvas_width !== width || draft.canvas_height !== height
  return (
    <Panel title="Show settings">
      <div className="grid gap-3 sm:grid-cols-[1fr_140px_140px]">
        <label className="block">
          <span className="label">Name</span>
          <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <NumberField label="Canvas width" value={draft.canvas_width} suffix="px"
          onChange={(v) => setDraft({ ...draft, canvas_width: Math.round(v) })} />
        <NumberField label="Canvas height" value={draft.canvas_height} suffix="px"
          onChange={(v) => setDraft({ ...draft, canvas_height: Math.round(v) })} />
      </div>
      <div className="mt-4 flex justify-between">
        <button className="btn-primary" disabled={!dirty || !draft.name.trim()} onClick={() => onSave(draft)}>Save</button>
        <button className="btn-danger" onClick={onDelete}>Delete show</button>
      </div>
    </Panel>
  )
}
