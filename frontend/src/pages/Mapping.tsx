import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, type Session } from '@/api/client'
import type { Projector } from '@/api/types'
import { ConfirmDialog, EmptyState, ErrorBanner, InfoTip, Panel, SectionBar, Spinner, ToastStack, useToasts } from '@/components/ui'
import { CameraIcon, CuesIcon, DesignerIcon, MiniPcIcon, RunShowIcon, ScenesIcon, SetupIcon, type LucideIcon } from '@/components/icons'
import { classNames } from '@/lib/format'
import { mappingApi } from '@/mapping/api'
import { CameraPanel } from '@/mapping/editor/CameraPanel'
import { CanvasElements } from '@/mapping/editor/CanvasElements'
import { CanvasOverview, OutputPreviews } from '@/mapping/editor/CanvasOverview'
import { EachProjector } from '@/mapping/editor/EachProjector'
import { CueList, MediaLibrary } from '@/mapping/editor/panels'
import { OutputInspector } from '@/mapping/editor/OutputInspector'
import { PlayersPanel } from '@/mapping/editor/PlayersPanel'
import { PictureShapeField } from '@/mapping/editor/PictureShape'
import { SavedMaps } from '@/mapping/editor/SavedMaps'
import { HOUSE_BOXES, ScenesPanel } from '@/mapping/editor/ScenesPanel'
import { ShowDesigner } from '@/mapping/editor/ShowDesigner'
import { TransportBar } from '@/mapping/editor/TransportBar'
import { YourProjectors } from '@/mapping/editor/YourProjectors'
import { withDefaults } from '@/mapping/geometry'
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

type Section = 'setup' | 'cues' | 'designer' | 'scenes' | 'remote' | 'camera' | 'players'

/** The Mapping tabs, in the order a show is built and played, each with its own address. */
const SECTIONS: Array<{ id: Section; slug: string; label: string; icon: LucideIcon; hint: string }> = [
  { id: 'setup', slug: 'setup', label: 'Set up', icon: SetupIcon,
    hint: 'Once for the house: your projectors and where each lands on the picture, your house, saved maps.' },
  { id: 'cues', slug: 'cues', label: 'Cues', icon: CuesIcon,
    hint: 'The list GO plays, one cue after another, and the videos and pictures it uses.' },
  { id: 'designer', slug: 'designer', label: 'Show designer', icon: DesignerIcon,
    hint: 'Build a cue: what comes in, moves and goes on its timeline, its elements, and what each projector plays.' },
  { id: 'scenes', slug: 'scenes', label: 'Scenes', icon: ScenesIcon,
    hint: 'Your ready-made looks that react to people: make one step by step, or change one.' },
  { id: 'remote', slug: 'run', label: 'Run the show', icon: RunShowIcon,
    hint: 'GO plays the next cue. Pause, Stop and Blackout act on every projector at once.' },
  { id: 'camera', slug: 'camera', label: 'Camera', icon: CameraIcon,
    hint: 'Let the camera line every projector up with the building, and see who it tracks.' },
  { id: 'players', slug: 'players', label: 'Players', icon: MiniPcIcon,
    hint: 'The mini PCs beside the projectors. Approve a new one’s code and pick its projector.' },
]

type SetupPart = 'projectors' | 'house' | 'maps'

/** Set up, one part at a time. */
const SETUP_PARTS: Array<{ id: SetupPart; label: string; hint: string }> = [
  { id: 'projectors', label: 'Your projectors', hint: 'Each projector’s box on the picture of the house, its size, and lining it up: warp, masks, blends, colour' },
  { id: 'house', label: 'Your house', hint: 'The walls, roof, windows and doors: from a photo, traced by hand, or painted by an AI' },
  { id: 'maps', label: 'Saved maps and show', hint: 'Keep or reuse the lined-up projectors; rename the show, change its shape or delete it' },
]

type DesignerPart = 'timeline' | 'elements' | 'projectors'

/** The Show designer builds one cue, from three sides. */
const DESIGNER_PARTS: Array<{ id: DesignerPart; label: string; hint: string }> = [
  { id: 'timeline', label: 'Timeline', hint: 'Videos, pictures, elements and sounds that come in, move and go at set times' },
  { id: 'elements', label: 'Elements', hint: 'Objects, flying things, live boards and countdowns on this cue or on every cue' },
  { id: 'projectors', label: 'Each projector', hint: 'Cue by cue, the picture and the scene each projector plays' },
]

/**
 * Old addresses, from before Editor and Scenes were sorted into Set up,
 * Cues and the Show designer, and where each is now.
 */
function movedTo(slug: string | undefined, part: string | null): string | null {
  if (slug === 'editor') {
    if (part === 'projectors') return '/mapping/setup'
    if (part === 'maps') return '/mapping/setup?part=maps'
    if (part === 'elements') return '/mapping/designer?part=elements'
    return '/mapping/cues'
  }
  if (slug === 'scenes' && part && (HOUSE_BOXES as readonly string[]).includes(part)) return `/mapping/setup?part=${part}`
  if (slug === 'scenes' && part === 'projectors') return '/mapping/designer?part=projectors'
  return null
}

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
  const section: Section = current?.id ?? 'cues'
  const setSection = (id: Section) => navigate(`/mapping/${SECTIONS.find((s) => s.id === id)!.slug}`)
  const [search, setSearch] = useSearchParams()
  const asked = search.get('part')
  // Start from a photo and Paint the house are boxes on Your house, with addresses of their own.
  const setupPart: SetupPart = asked && (HOUSE_BOXES as readonly string[]).includes(asked) ? 'house'
    : SETUP_PARTS.find((p) => p.id === asked)?.id ?? 'projectors'
  const designerPart: DesignerPart = DESIGNER_PARTS.find((p) => p.id === asked)?.id ?? 'timeline'
  const setPart = (id: string, first: string) => setSearch(id === first ? {} : { part: id }, { replace: true })
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

  const moved = movedTo(slug, asked)
  if (moved) return <Navigate to={moved} replace />
  // /mapping on its own: the GO button on a phone, the cues at a desk.
  if (!current) return <Navigate to={window.innerWidth < 768 ? '/mapping/run' : '/mapping/cues'} replace />

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
                  title="The show you are working on. Each show has its own picture of the house, projectors and cues.">
                  {shows.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {canEdit && section !== 'players' && section !== 'remote' && (
              <button className="btn-default text-xs" onClick={startCreating} title="Start another show with its own projectors and cues">
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
            A show is one picture of your whole house, the projectors that each show their own part of it (each at
            its own resolution), and a list of cues to play.
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

          {section === 'designer' && (
            <SectionBar label="Show designer sections" sections={DESIGNER_PARTS} value={designerPart}
              onChange={(id) => setPart(id, 'timeline')} />
          )}

          {section === 'designer' && designerPart === 'timeline' && (
            <Panel title="Timeline"
              description="Pick a cue and lay out what happens while it plays: videos and pictures, elements and sounds on rows, each coming in, moving and going at its own time. See it as each projector shows it, and put a clip on every projector or only some. Play it on the house plays it on every projector together.">
              <ShowDesigner
                show={show}
                outputs={outputs}
                scenes={scenes}
                media={media}
                clock={clock}
                transport={transport}
                canEdit={canEdit}
                canRun={canRun}
                onPlayOnHouse={(cue) => command('goto', { cue: cue.position })}
                reloadMedia={reloadMedia}
                onShowChanged={() => runtime.refresh()}
                onError={setError}
              />
            </Panel>
          )}

          {section === 'designer' && designerPart === 'elements' && (
            <Panel title="Elements on the cue"
              description="The cue's picture with its elements on top and each projector's box outlined, so you can see where everything lands. Add objects, a flying sleigh, the Santa tracker or a countdown, put each on this cue only or on every cue, and drag them into place. To make a scene of its own, use Scenes → Make a scene.">
              <CanvasElements show={show} outputs={outputs} scenes={scenes} media={media} clock={clock}
                transport={transport} canEdit={canEdit} reloadScenes={runtime.reloadScenes}
                onShowChanged={() => runtime.refresh()} onError={setError} />
            </Panel>
          )}

          {section === 'designer' && designerPart === 'projectors' && (
            <Panel title="Each projector, cue by cue"
              description="Left alone, each projector shows its part of the cue's picture and the cue's scene. Here one can play a picture or video of its own (it fills that projector and does not blend with the others), a scene of its own, or nothing. Ones set apart are marked in blue. When tonight's show starts, its scene group (Dashboard → Pick tonight's scenes) sets every cue's scenes, so for tonight use Make a scene, which changes both.">
              <EachProjector show={show} media={media} scenes={scenes} canEdit={canEdit}
                onChanged={() => reloadShow()} onError={setError} />
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
              transport={transport}
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

          {section === 'cues' && (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Panel title="Cues" description="GO plays them from the top, one after another. Play jumps straight to one. Build what a cue shows in the Show designer."
                action={<CueHelp />}>
                <CueList show={show} media={media} scenes={scenes} transport={transport} canEdit={canEdit} canRun={canRun} {...cueOps} />
              </Panel>
              <Panel title="Media library" description="Your videos and pictures. Add cue puts one at the end of the cue list.">
                <MediaLibrary media={media} canEdit={canEdit} onUploaded={() => void reloadMedia()}
                  onDelete={deleteMedia} onAddCue={addCue} />
              </Panel>
            </div>
          )}

          {section === 'setup' && (
            <div className="space-y-4">
              <SectionBar label="Set up sections" sections={SETUP_PARTS} value={setupPart} onChange={(id) => setPart(id, 'projectors')} />

              {setupPart === 'projectors' && (
                <>
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
                    <Panel
                      title="Your projectors on the picture of the house"
                      description={`The show is made once, on one picture of the whole house. Each numbered box is the part one projector shows, at that projector's own resolution (its mini PC tells it), so boxes can sit side by side, overlap or be apart. After the camera calibration they sit where each projector's light really lands.${canEdit ? " Drag a box to move it, or pull its edges to resize it: it keeps its projector's shape (hold Shift to change the shape)." : ''}`}
                      action={
                        canEdit ? (
                          <button className="btn-default text-xs" onClick={addOutput} disabled={busy}
                            title="Add another projector to this show. Each one gets its own box on the picture.">
                            Add projector
                          </button>
                        ) : undefined
                      }
                    >
                      {outputs.length === 0 ? (
                        <EmptyState title="No projectors in this show yet">
                          Press Add projector once for each projector that lights the house.
                        </EmptyState>
                      ) : (
                        <div className="space-y-3">
                          <YourProjectors show={show} outputs={outputs} viewId={output?.id ?? null}
                            onView={(id) => id != null && setSelectedOutput(id)} pick
                            canEdit={canEdit} onChanged={() => reloadShow()} onError={setError} />
                          <CanvasOverview show={show} outputs={outputs} selectedId={output?.id ?? null}
                            onSelect={setSelectedOutput}
                            onChange={canEdit ? (o, source) => changeOutput(o, { source }) : undefined} />
                        </div>
                      )}
                    </Panel>

                    {outputs.length > 0 && (
                      <Panel title="What each one shows" description="Live, as each projector shows it. Click one to set it up below.">
                        <OutputPreviews show={show} outputs={outputs} selectedId={output?.id ?? null}
                          playback={playback} clock={clock} transport={transport} onSelect={setSelectedOutput} />
                      </Panel>
                    )}
                  </div>

                  {output && (
                    <Panel title={`Line up ${output.name}`}
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
                            title: 'Delete projector',
                            body: `Delete ${output.name} from this show, with its warp, masks and blends?`,
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

              {setupPart === 'house' && (
                <ScenesPanel
                  house
                  show={show}
                  scenes={scenes}
                  media={media}
                  clock={clock}
                  cameraPeople={runtime.people}
                  canEdit={canEdit}
                  transport={transport}
                  onError={setError}
                  reloadScenes={runtime.reloadScenes}
                  reloadMedia={reloadMedia}
                  onShowChanged={() => runtime.refresh()}
                />
              )}

              {setupPart === 'maps' && (
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
                      outputs={outputs}
                      onSave={(body) =>
                        guard(async () => {
                          await mappingApi.updateShow(show.id, body)
                          await reloadShow()
                        })
                      }
                      onDelete={() =>
                        setConfirm({
                          title: 'Delete show',
                          body: `Delete ${show.name}, its projectors and cues? Media stays in the library.`,
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
      <span className="mt-1 block"><b>Scene</b>: reactive light drawn on top (Scenes → Make a scene puts one on a projector for you).</span>
      <span className="mt-1 block"><b>Loop</b>: start the video again when it ends.</span>
      <span className="mt-1 block"><b>Fade</b>: seconds to blend from the previous cue into this one.</span>
      <span className="mt-1 block"><b>Auto</b>: move to the next cue by itself after this many seconds. Empty waits for GO.</span>
      <span className="mt-1 block"><b>People</b>: a simple reaction when the camera sees someone.</span>
    </InfoTip>
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
  const [size, setSize] = useState({ canvas_width: 3840, canvas_height: 2160 })
  const [mapId, setMapId] = useState<number | null>(null)
  const map = maps.find((m) => m.id === mapId) ?? null
  return (
    <Panel title="New show"
      description="A show is made on one picture of the whole house. Pick its shape; each projector then shows its own part of it at its own resolution.">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_200px_minmax(0,280px)_auto]"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) onCreate(name.trim(), map?.canvas_width ?? size.canvas_width, map?.canvas_height ?? size.canvas_height, mapId)
        }}
      >
        <label className="block">
          <span className="label">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Halloween" autoFocus />
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
        <PictureShapeField key={mapId ?? 'own'} width={map?.canvas_width ?? size.canvas_width}
          height={map?.canvas_height ?? size.canvas_height} disabled={map != null} onChange={setSize} />
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
  outputs,
  onSave,
  onDelete,
}: {
  name: string
  width: number
  height: number
  outputs: Output[]
  onSave: (body: { name: string; canvas_width: number; canvas_height: number }) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState({ name, canvas_width: width, canvas_height: height })
  const reshaped = draft.canvas_width / draft.canvas_height !== width / height
  const dirty = draft.name !== name || reshaped
  return (
    <Panel title="Show settings">
      <div className="grid gap-3 sm:grid-cols-[1fr_minmax(0,280px)]">
        <label className="block">
          <span className="label">Name</span>
          <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <PictureShapeField width={draft.canvas_width} height={draft.canvas_height} outputs={outputs}
          onChange={(size) => setDraft({ ...draft, ...size })} />
      </div>
      {reshaped && (
        <p className="mt-2 text-xs text-amber-200">
          Everything stays at the same place on the picture, so things get wider or narrower with it. After saving, use
          Lay them out (Your projectors) so each projector’s box has its shape again.
        </p>
      )}
      <div className="mt-4 flex justify-between">
        <button className="btn-primary" disabled={!dirty || !draft.name.trim()} onClick={() => onSave(draft)}>Save</button>
        <button className="btn-danger" onClick={onDelete}>Delete show</button>
      </div>
    </Panel>
  )
}
