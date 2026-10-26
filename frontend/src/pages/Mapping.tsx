import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, type Session } from '@/api/client'
import type { Projector } from '@/api/types'
import { ConfirmDialog, EmptyState, ErrorBanner, InfoTip, Panel, SectionBar, Spinner, ToastStack, useToasts } from '@/components/ui'
import { CameraIcon, EditorIcon, MiniPcIcon, RunShowIcon, ScenesIcon, type LucideIcon } from '@/components/icons'
import { classNames } from '@/lib/format'
import { mappingApi } from '@/mapping/api'
import { CameraPanel } from '@/mapping/editor/CameraPanel'
import { CanvasElements } from '@/mapping/editor/CanvasElements'
import { CanvasOverview, OutputPreviews } from '@/mapping/editor/CanvasOverview'
import { CueList, MediaLibrary } from '@/mapping/editor/panels'
import { NumberField } from '@/mapping/editor/controls'
import { OutputInspector } from '@/mapping/editor/OutputInspector'
import { PlayersPanel } from '@/mapping/editor/PlayersPanel'
import { ProjectorMedia } from '@/mapping/editor/ProjectorMedia'
import { SavedMaps } from '@/mapping/editor/SavedMaps'
import { ScenesPanel } from '@/mapping/editor/ScenesPanel'
import { TransportBar } from '@/mapping/editor/TransportBar'
import { sideBySide, withDefaults } from '@/mapping/geometry'
import { EditSender, useLocalChannel } from '@/mapping/live'
import type { Cue, MediaAsset, Output, SavedMap, ShowSummary, TransportAction } from '@/mapping/types'
import { useShowRuntime } from '@/mapping/useShowRuntime'

const SHOW_KEY = 'pc.mapping.show'
/** Geometry is saved this long after the last change while dragging. */
const SAVE_DELAY_MS = 250

/** What the server takes for an output: everything but its place in the show. */
function outputBody(output: Output): Partial<Output> {
  const { id: _id, show_id: _show, position: _position, ...body } = output
  void _id
  void _show
  void _position
  return body
}

type Section = 'show' | 'scenes' | 'camera' | 'players' | 'remote'

/** The Mapping tabs, in the order of a show's life, each with its own address. */
const SECTIONS: Array<{ id: Section; slug: string; label: string; icon: LucideIcon; hint: string }> = [
  { id: 'remote', slug: 'run', label: 'Run the show', icon: RunShowIcon,
    hint: 'GO plays the next cue. Pause, Stop and Blackout act on every projector at once.' },
  { id: 'show', slug: 'editor', label: 'Editor', icon: EditorIcon,
    hint: 'Build the show: cues and media, where each projector lands on the picture, warp and blends.' },
  { id: 'scenes', slug: 'scenes', label: 'Scenes', icon: ScenesIcon,
    hint: 'Light effects that react to people. Make one here, then add it to a cue.' },
  { id: 'camera', slug: 'camera', label: 'Camera', icon: CameraIcon,
    hint: 'Let the camera line every projector up with the building, and see who it tracks.' },
  { id: 'players', slug: 'players', label: 'Players', icon: MiniPcIcon,
    hint: 'The mini PCs beside the projectors. Approve a new one’s code and pick its projector.' },
]

type EditorPart = 'cues' | 'projectors' | 'elements' | 'maps'

/** The Editor, one part at a time, so no part needs a long scroll to reach. */
export const EDITOR_PARTS: Array<{ id: EditorPart; label: string; hint: string }> = [
  { id: 'cues', label: 'Cues and media', hint: 'The list GO plays, and the videos and pictures it uses' },
  { id: 'projectors', label: 'Projectors', hint: 'Where each projector lands on the picture: warp, masks, blends, colour' },
  { id: 'elements', label: 'Elements', hint: 'Objects, flying things, live boards and countdowns on a cue, and a picture of its own on one projector' },
  { id: 'maps', label: 'Saved maps and show', hint: 'Keep or reuse the lined-up projectors; rename, resize or delete the show' },
]

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
  const { section: slug } = useParams()
  const navigate = useNavigate()
  const current = SECTIONS.find((s) => s.slug === slug)
  const section: Section = current?.id ?? 'show'
  const setSection = (id: Section) => navigate(`/mapping/${SECTIONS.find((s) => s.id === id)!.slug}`)
  const [search, setSearch] = useSearchParams()
  const part: EditorPart = EDITOR_PARTS.find((p) => p.id === search.get('part'))?.id ?? 'cues'
  const setPart = (id: EditorPart) => setSearch(id === 'cues' ? {} : { part: id }, { replace: true })
  const [selectedOutput, setSelectedOutput] = useState<number | null>(null)
  const [projectors, setProjectors] = useState<Projector[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [playersKey, setPlayersKey] = useState(0)
  const [mapsKey, setMapsKey] = useState(0)
  const [savedMaps, setSavedMaps] = useState<SavedMap[]>([])
  const toasts = useToasts()
  const [confirm, setConfirm] = useState<{ title: string; body: string; action: () => void } | null>(null)

  const cameraFeed = useRef(new EventTarget()).current
  // The GO bar sticks under the top bar; things that stick below it (the
  // Scenes preview) need its height.
  const [barEl, setBarEl] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!barEl) return
    const publish = () => document.documentElement.style.setProperty('--mapping-bar', `${barEl.offsetHeight}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(barEl)
    return () => observer.disconnect()
  }, [barEl])
  const runtime = useShowRuntime(showId, (message) => {
    if (message.type === 'mapping_player') setPlayersKey((n) => n + 1)
    if (message.type === 'mapping_map') setMapsKey((n) => n + 1)
    if (CAMERA_MESSAGES.has(message.type)) cameraFeed.dispatchEvent(new CustomEvent('message', { detail: message }))
  })
  const { show, setShow, media, reloadMedia, scenes, transport, clock, playback, link } = runtime

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

  // Each output's edits go out live while a handle moves, so the mini PCs
  // move the picture on the house straight away, and are saved once it stops.
  const senders = useRef(new Map<number, EditSender>())
  const sender = useCallback((id: number) => {
    let found = senders.current.get(id)
    if (!found) {
      found = new EditSender(
        (output) => mappingApi.liveOutput(output.id, outputBody(output)),
        async (output) => withDefaults(await mappingApi.updateOutput(output.id, outputBody(output))),
      )
      senders.current.set(id, found)
    }
    return found
  }, [])
  useEffect(() => {
    const map = senders.current
    return () => {
      map.forEach((s) => s.dispose())
      map.clear()
    }
  }, [])

  const changeOutput = useCallback(
    (target: Output, patch: Partial<Output>) => {
      const next = withDefaults({ ...target, ...patch })
      setOverrides((map) => new Map(map).set(next.id, next))
      broadcast({ type: 'output', output: next })
      sender(next.id).live(next)
      const serial = (editSerial.current.get(next.id) ?? 0) + 1
      editSerial.current.set(next.id, serial)
      window.clearTimeout(saveTimers.current.get(next.id))
      saveTimers.current.set(
        next.id,
        window.setTimeout(async () => {
          try {
            const saved = await sender(next.id).save(next)
            if (!saved) return
            setShow((current) =>
              current ? { ...current, outputs: current.outputs.map((o) => (o.id === saved.id ? saved : o)) } : current,
            )
            // Drop the override only if nothing changed while saving.
            if (editSerial.current.get(saved.id) === serial) {
              setOverrides((map) => {
                const copy = new Map(map)
                copy.delete(saved.id)
                return copy
              })
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Saving the output failed')
          }
        }, SAVE_DELAY_MS),
      )
    },
    [broadcast, sender, setShow],
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

  const startCreating = () => {
    setCreating(true)
    mappingApi.listMaps().then(setSavedMaps).catch(() => setSavedMaps([]))
  }

  const createShow = (name: string, width: number, height: number, mapId: number | null) =>
    guard(async () => {
      const created = await mappingApi.createShow({ name, canvas_width: width, canvas_height: height })
      if (mapId != null) await mappingApi.applyMap(created.id, mapId, { outputs: true, surfaces: true, players: false })
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

  // /mapping on its own: the GO button on a phone, the editor at a desk.
  if (!current) return <Navigate to={window.innerWidth < 768 ? '/mapping/run' : '/mapping/editor'} replace />

  if (shows === null) return <Spinner label="Loading shows…" />

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <current.icon size={18} strokeWidth={1.75} className="shrink-0 text-slate-500" aria-hidden />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight tracking-tight text-slate-50">{current.label}</h1>
              <p className="mt-0.5 text-xs text-slate-400">{current.hint}</p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {link !== 'open' && (
              <span className="text-xs text-yellow-300" title="The live connection to the server dropped. It reconnects by itself.">
                Reconnecting…
              </span>
            )}
            {shows.length > 0 && section !== 'players' && (
              <label className="flex items-center gap-2 text-xs text-slate-400">
                Show
                <select className="input w-auto py-1.5" value={showId ?? ''} onChange={(e) => setShowId(Number(e.target.value))}
                  title="The show you are working on. Each show has its own canvas, projectors and cues.">
                  {shows.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.canvas_width}×{s.canvas_height}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {canEdit && section !== 'players' && section !== 'remote' && (
              <button className="btn-default text-xs" onClick={startCreating} title="Start another show with its own canvas and cues">
                New show
              </button>
            )}
          </div>
        </div>
        <div role="tablist" aria-label="Mapping" className="flex overflow-x-auto border-b border-white/[0.06] lg:hidden">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={section === s.id}
              onClick={() => setSection(s.id)}
              title={s.hint}
              className={classNames('tab', section === s.id && 'tab-active')}
            >
              <s.icon size={14} aria-hidden />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {creating && <NewShowForm maps={savedMaps} onCreate={createShow} onCancel={() => setCreating(false)} busy={busy} />}

      {shows.length === 0 && !creating && (
        <Panel>
          <EmptyState
            title="No shows yet"
            action={
              canEdit ? (
                <button className="btn-primary" onClick={startCreating}>
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
        <Panel title="Mini PCs and cameras" description="Each mini PC drives one projector. A camera plugged into one comes with it.">
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
          <div ref={setBarEl} className={section === 'remote' ? undefined : 'z-30 -mx-1 bg-panel-950/95 px-1 pb-1 backdrop-blur md:sticky md:top-[var(--shell-top,3rem)]'}>
            <TransportBar show={show} transport={transport} clock={clock} canRun={canRun} busy={busy}
              large={section === 'remote'} onCommand={command} />
          </div>

          {section === 'remote' && (
            <Panel title="Cues">
              <CueList show={show} media={media} scenes={scenes} transport={transport} canEdit={false} canRun={canRun} compact {...cueOps} />
            </Panel>
          )}

          {section === 'scenes' && (
            <ScenesPanel
              show={show}
              scenes={scenes}
              media={media}
              clock={clock}
              cameraPeople={runtime.people}
              canEdit={canEdit}
              onError={setError}
              reloadScenes={runtime.reloadScenes}
              reloadMedia={reloadMedia}
              onShowChanged={() => runtime.refresh()}
            />
          )}

          {section === 'camera' && (
            <Panel>
              <CameraPanel show={show} outputs={outputs} canEdit={canEdit} feed={cameraFeed}
                refreshKey={playersKey} onError={setError} onShowChanged={() => void runtime.refresh()} />
            </Panel>
          )}

          {section === 'show' && (
            <div className="space-y-4">
              <SectionBar label="Editor sections" sections={EDITOR_PARTS} value={part} onChange={setPart} />

              {part === 'cues' && (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                  <Panel title="Cues" description="GO plays them from the top, one after another. Play jumps straight to one."
                    action={<CueHelp />}>
                    <CueList show={show} media={media} scenes={scenes} transport={transport} canEdit={canEdit} canRun={canRun} {...cueOps} />
                  </Panel>
                  <Panel title="Media library" description="Your videos and pictures. Add cue puts one at the end of the cue list.">
                    <MediaLibrary media={media} canEdit={canEdit} onUploaded={() => void reloadMedia()}
                      onDelete={deleteMedia} onAddCue={addCue} />
                  </Panel>
                </div>
              )}

              {part === 'projectors' && (
                <>
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
                    <Panel
                      title="Where each projector lands on the picture"
                      description={`The whole picture is ${show.canvas_width} × ${show.canvas_height}. Each numbered box is the part one projector shows; after the camera calibration they sit where each projector's light really lands.${canEdit ? ' Drag a box to move it, or pull its edges to resize it.' : ''}`}
                      action={
                        canEdit ? (
                          <div className="flex gap-2">
                            {outputs.length > 1 && <ArrangeButton onArrange={arrange} />}
                            <button className="btn-default text-xs" onClick={addOutput} disabled={busy}
                              title="Add another projector to this show. Each one gets its own box on the picture.">
                              Add projector
                            </button>
                          </div>
                        ) : undefined
                      }
                    >
                      {outputs.length === 0 ? (
                        <EmptyState title="No projectors in this show yet">
                          Press Add projector once for each projector that lights the building.
                        </EmptyState>
                      ) : (
                        <CanvasOverview show={show} outputs={outputs} selectedId={output?.id ?? null}
                          onSelect={setSelectedOutput}
                          onChange={canEdit ? (o, source) => changeOutput(o, { source }) : undefined} />
                      )}
                    </Panel>

                    {outputs.length > 0 && (
                      <Panel title="Pick a projector" description="What each one shows right now. Click one to set it up below.">
                        <OutputPreviews show={show} outputs={outputs} selectedId={output?.id ?? null}
                          playback={playback} clock={clock} transport={transport} onSelect={setSelectedOutput} />
                      </Panel>
                    )}
                  </div>

                    {output && (
                      <Panel title={`Set up ${output.name}`}
                        description={`${output.width} × ${output.height}. Line its picture up with the building, mask out what it should not light, and blend where it overlaps a neighbour.`}>
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
                </>
              )}

              {part === 'elements' && (
                <>
                  <Panel title="Media and elements"
                    description="A cue's media with its elements on top and each projector's box outlined, so you can see where everything lands. Add objects, a flying sleigh, the Santa tracker or a countdown here and drag them into place.">
                    <CanvasElements show={show} outputs={outputs} scenes={scenes} media={media} clock={clock}
                      transport={transport} canEdit={canEdit} reloadScenes={runtime.reloadScenes}
                      onShowChanged={() => runtime.refresh()} onError={setError} />
                  </Panel>

                  {outputs.length > 1 && show.cues.length > 0 && (
                    <Panel title="Pictures on each projector"
                      description="Each projector shows its part of the cue's shared picture, or a picture or video of its own that stays apart from the others. Ones set apart are marked in blue.">
                      <ProjectorMedia show={show} media={media} canEdit={canEdit} onChanged={() => reloadShow()} onError={setError} />
                    </Panel>
                  )}
                </>
              )}

              {part === 'maps' && (
                <div className="grid gap-4 xl:grid-cols-2">
                  <Panel title="Saved maps"
                    description="Keep this show's lined-up projectors, calibration and traced house parts, and start other shows from them.">
                    <SavedMaps
                      show={show}
                      canEdit={canEdit}
                      refreshKey={mapsKey}
                      onError={setError}
                      onApplied={(message) => {
                        toasts.push('ok', message)
                        setOverrides(new Map())
                        setSelectedOutput(null)
                        setPlayersKey((n) => n + 1)
                        void reloadShow()
                      }}
                    />
                  </Panel>

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
              )}
            </div>
          )}
        </>
      )}

      <ToastStack toasts={toasts.toasts} onDismiss={toasts.dismiss} />

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

/** What the cue settings do, in one place. */
function CueHelp() {
  return (
    <InfoTip label="What do the cue settings do?" text="What these do">
      <span className="block"><b>Media</b>: the video or picture this cue shows. Black shows nothing.</span>
      <span className="mt-1 block"><b>Fill / Fit / Stretch</b>: Fill covers the whole picture and may crop; Fit shows it all with black edges; Stretch pulls it to the picture's shape.</span>
      <span className="mt-1 block"><b>Scene</b>: reactive light drawn on top (made on the Scenes tab).</span>
      <span className="mt-1 block"><b>Loop</b>: start the video again when it ends.</span>
      <span className="mt-1 block"><b>Fade</b>: seconds to blend from the previous cue into this one.</span>
      <span className="mt-1 block"><b>Auto</b>: move to the next cue by itself after this many seconds. Empty waits for GO.</span>
      <span className="mt-1 block"><b>People</b>: a simple reaction when the camera sees someone.</span>
    </InfoTip>
  )
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
  maps,
  onCreate,
  onCancel,
  busy,
}: {
  maps: SavedMap[]
  onCreate: (name: string, width: number, height: number, mapId: number | null) => void
  onCancel: () => void
  busy: boolean
}) {
  const [name, setName] = useState('')
  const [width, setWidth] = useState(3840)
  const [height, setHeight] = useState(2160)
  const [mapId, setMapId] = useState<number | null>(null)
  const map = maps.find((m) => m.id === mapId) ?? null
  return (
    <Panel title="New show" description="The canvas is the flat image of the building that content is made for.">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_200px_140px_140px_auto]"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) onCreate(name.trim(), map?.canvas_width ?? width, map?.canvas_height ?? height, mapId)
        }}
      >
        <label className="block">
          <span className="label">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Town Hall façade" autoFocus />
        </label>
        <label className="block">
          <span className="label">Start from</span>
          <select className="input" value={mapId ?? ''} onChange={(e) => setMapId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Nothing (blank)</option>
            {maps.map((m) => (
              <option key={m.id} value={m.id}>Saved map: {m.name}</option>
            ))}
          </select>
        </label>
        <NumberField label="Canvas width" value={map?.canvas_width ?? width} min={16} suffix="px" disabled={map != null}
          onChange={(v) => setWidth(Math.round(v))} />
        <NumberField label="Canvas height" value={map?.canvas_height ?? height} min={16} suffix="px" disabled={map != null}
          onChange={(v) => setHeight(Math.round(v))} />
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
