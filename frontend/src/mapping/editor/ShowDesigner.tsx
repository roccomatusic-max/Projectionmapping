import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Film, Music, Pause, Play, Plus, Sparkles, SkipBack } from 'lucide-react'
import { EmptyState, Modal } from '@/components/ui'
import { classNames } from '@/lib/format'
import { mappingApi, mediaUrl } from '../api'
import type { ServerClock } from '../live'
import type { TimelinePreview } from '../playback'
import { PeopleTracker } from '../people'
import { layerLabel } from '../scene/catalog'
import {
  basePins,
  clipOn,
  emptyTimeline,
  END_CHOICES,
  fillPin,
  fitPin,
  mediaAspect,
  placeAt,
  showsOn,
  timelineTime,
} from '../scene/timeline'
import type {
  ClipKey,
  ClipPin,
  Cue,
  MappingScene,
  MediaAsset,
  ObjectPin,
  Output,
  SceneLayer,
  Show,
  Timeline,
  TimelineClip,
  TransportState,
} from '../types'
import { ClipInspector } from './ClipInspector'
import { formatDuration } from './controls'
import { ElementLibrary } from './ElementLibrary'
import { MediaDrop, mediaKindLabel, outputColor } from './panels'
import { type Backdrop, type Placing, ScenePreview } from './ScenePreview'
import { PLACEABLE, placingFor, SINGLE } from './ScenesPanel'
import { clockText, playheadLeft, TimelineTracks } from './TimelineTracks'
import { YourProjectors } from './YourProjectors'

/** Changes are saved this long after the last one. */
const SAVE_DELAY_MS = 500
/** Most rows and clips a timeline can have (backend MAX_TRACKS, MAX_CLIPS). */
const MAX_TRACKS = 12
const MAX_CLIPS = 80
const MAX_SECONDS = 3600
/** A move this close to the playhead is the one dragging changes. */
const KEY_NEAR = 0.05

const NO_LAYERS: SceneLayer[] = []

function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** The first row with nothing on it from ``start`` for ``length`` seconds; -1 when every row is busy. */
function freeTrack(timeline: Timeline, start: number, length: number): number {
  for (let track = 0; track < MAX_TRACKS; track++) {
    const busy = timeline.clips.some((c) => c.track === track && c.start < start + length && start < c.start + c.length)
    if (!busy) return track
  }
  return -1
}

/** ``clip`` added to the timeline, making the timeline longer or giving it another row when it needs one. */
function withClip(timeline: Timeline, clip: TimelineClip): Timeline {
  const track = freeTrack(timeline, clip.start, clip.length)
  const placed = { ...clip, track: track < 0 ? 0 : track }
  return {
    ...timeline,
    length: Math.min(MAX_SECONDS, Math.max(timeline.length, Math.ceil(placed.start + placed.length))),
    tracks: Math.min(MAX_TRACKS, Math.max(timeline.tracks, placed.track + 1)),
    clips: [...timeline.clips, placed],
  }
}

const samePins = (a: ClipPin[] | null, b: ClipPin[] | null) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * The show designer: a video editor for one cue. A cue's timeline holds
 * rows of clips (videos and pictures, elements, sounds) that come in, move
 * and go at set times while the cue plays. Clips are dragged along the
 * rows, placed and moved on the picture of the house at the playhead, and
 * the whole thing is played here, or on the house through the cue.
 */
export function ShowDesigner({
  show,
  outputs,
  scenes,
  media,
  clock,
  transport,
  canEdit,
  canRun,
  onPlayOnHouse,
  reloadMedia,
  onShowChanged,
  onError,
}: {
  show: Show
  outputs: Output[]
  scenes: MappingScene[]
  media: MediaAsset[]
  clock: ServerClock
  transport: TransportState | null
  canEdit: boolean
  canRun: boolean
  onPlayOnHouse: (cue: Cue) => void
  reloadMedia: () => Promise<unknown>
  onShowChanged: () => Promise<unknown>
  onError: (message: string | null) => void
}) {
  const live = transport?.show_id === show.id && (transport.status === 'playing' || transport.status === 'paused') ? transport.current : null
  const [cueId, setCueId] = useState<number | null>(
    () => show.cues.find((c) => c.timeline)?.id ?? live?.id ?? show.cues[0]?.id ?? null,
  )
  const cue = show.cues.find((c) => c.id === cueId) ?? null
  const [draft, setDraft] = useState<{ cueId: number; timeline: Timeline } | null>(null)
  const timeline = cue ? (draft?.cueId === cue.id ? draft.timeline : cue.timeline ?? null) : null
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = timeline?.clips.find((c) => c.id === selectedId) ?? null
  const [pinIndex, setPinIndex] = useState<number | null>(null)
  const [adding, setAdding] = useState<'media' | 'element' | 'sound' | null>(null)
  const [busy, setBusy] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [withScene, setWithScene] = useState(true)
  const [sound, setSound] = useState(true)
  const [follow, setFollow] = useState(false)
  const [backdropChoice, setBackdropChoice] = useState<'media' | 'camera' | 'none'>('media')
  /** The projector the preview shows, as that projector shows it; null is the whole house. */
  const [viewId, setViewId] = useState<number | null>(null)
  const viewed = outputs.find((o) => o.id === viewId) ?? null
  const tracker = useState(() => new PeopleTracker(show.id))[0]
  const mediaById = useMemo(() => new Map(media.map((m) => [m.id, m])), [media])
  const canvasAspect = show.canvas_width / show.canvas_height

  // -- the playhead ----------------------------------------------------------------
  const timeRef = useRef(0)
  const playingRef = useRef(false)
  const [playing, setPlaying] = useState(false)
  /** The playhead's time for what React draws (the readout, the handles), a few times a second. */
  const [shownTime, setShownTime] = useState(0)
  const playheadRef = useRef<HTMLDivElement>(null)
  const readoutRef = useRef<HTMLSpanElement>(null)
  const tracksBox = useRef<HTMLDivElement>(null)
  const [tracksWidth, setTracksWidth] = useState(900)
  useEffect(() => {
    const el = tracksBox.current
    if (!el) return
    const observer = new ResizeObserver(() => setTracksWidth(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [timeline != null])
  const length = timeline?.length ?? 30
  const pps = Math.max(4, ((tracksWidth - 90) / length) * zoom)

  const latest = useRef({ timeline, pps, follow, live })
  latest.current = { timeline, pps, follow, live }

  const seek = useCallback((seconds: number) => {
    const tl = latest.current.timeline
    timeRef.current = Math.max(0, Math.min(tl?.length ?? 0, seconds))
    setShownTime(timeRef.current)
  }, [])

  const setPlay = (on: boolean) => {
    playingRef.current = on
    setPlaying(on)
    if (on && timeline && timeRef.current >= timeline.length - 0.01) timeRef.current = 0
  }

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let shown = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = performance.now()
      const dt = (now - last) / 1000
      last = now
      const { timeline: tl, pps: scale, follow: following, live: on } = latest.current
      if (!tl) return
      if (following && on && cueId === on.id) {
        // Keep up with the house: where the playing cue is now.
        const elapsed = on === transport?.current && transport?.status === 'paused'
          ? transport.paused_position ?? 0
          : (clock.now() - on.started_at_ms) / 1000
        timeRef.current = timelineTime(tl, elapsed)
      } else if (playingRef.current) {
        let t = timeRef.current + dt
        if (t >= tl.length) {
          if (tl.end === 'loop') t %= tl.length
          else {
            t = tl.length
            playingRef.current = false
            setPlaying(false)
          }
        }
        timeRef.current = t
      }
      if (playheadRef.current) playheadRef.current.style.left = `${playheadLeft(timeRef.current, scale)}px`
      if (readoutRef.current) readoutRef.current.textContent = clockText(timeRef.current)
      if (now - shown > 120) {
        shown = now
        setShownTime((old) => (Math.abs(old - timeRef.current) > 0.001 ? timeRef.current : old))
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [cueId, clock, transport])

  useEffect(() => {
    setSelectedId(null)
    setPinIndex(null)
    setPlay(false)
    seek(0)
  }, [cueId]) // eslint-disable-line react-hooks/exhaustive-deps

  // -- saving ----------------------------------------------------------------------
  const timer = useRef<number>()
  const serial = useRef(0)
  const pending = useRef<(() => Promise<boolean>) | null>(null)
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      void pending.current?.()
    },
    [],
  )
  const save = (id: number, next: Timeline | null, now = false): Promise<boolean> => {
    if (next) setDraft({ cueId: id, timeline: next })
    const mine = ++serial.current
    window.clearTimeout(timer.current)
    const run = async () => {
      if (pending.current === run) pending.current = null
      try {
        await mappingApi.updateCue(id, { timeline: next })
        await onShowChanged()
        if (serial.current === mine) setDraft(null)
        onError(null)
        return true
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Saving the timeline failed')
        return false
      }
    }
    pending.current = run
    if (now) return run()
    timer.current = window.setTimeout(() => void run(), SAVE_DELAY_MS)
    return Promise.resolve(true)
  }
  const put = (next: Timeline, done = true) => {
    if (!cue) return
    if (done) void save(cue.id, next)
    else setDraft({ cueId: cue.id, timeline: next })
  }
  const changeClip = (id: string, patch: Partial<TimelineClip>) => {
    if (!timeline) return
    put({ ...timeline, clips: timeline.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  }

  // -- making and adding -----------------------------------------------------------
  const makeTimeline = async () => {
    if (!cue) return
    setBusy(true)
    await save(cue.id, emptyTimeline(), true)
    setBusy(false)
  }

  const newCue = async () => {
    setBusy(true)
    try {
      const n = show.cues.filter((c) => c.timeline).length + 1
      const made = await mappingApi.createCue(show.id, { name: `Show ${n}`, loop: true, timeline: emptyTimeline() })
      await onShowChanged()
      setCueId(made.id)
      onError(null)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Making the cue failed')
    } finally {
      setBusy(false)
    }
  }

  const add = (clip: TimelineClip) => {
    if (!timeline) return
    if (timeline.clips.length >= MAX_CLIPS) {
      onError(`A timeline holds up to ${MAX_CLIPS} clips. Remove one first.`)
      return
    }
    setAdding(null)
    put(withClip(timeline, clip))
    setSelectedId(clip.id)
    setPinIndex(null)
  }

  const clipBase = (kind: TimelineClip['kind'], name: string, seconds: number): TimelineClip => ({
    id: newId(), kind, name: name.slice(0, 64), track: 0, start: Math.round(timeRef.current * 10) / 10,
    length: Math.max(0.5, Math.min(MAX_SECONDS, seconds)),
    enter: kind === 'sound' ? 'none' : 'fade', enter_seconds: 1,
    exit: kind === 'sound' ? 'none' : 'fade', exit_seconds: 1,
    opacity: 1, media_id: null, pin: null, offset: 0, loop: true, volume: 1, sound: false, output_id: null,
    target: 'everywhere', layer: null, keys: [],
  })

  const addMedia = (asset: MediaAsset) => {
    const name = asset.name.replace(/\.[^.]+$/, '')
    if (asset.kind === 'audio') {
      add({ ...clipBase('sound', name, asset.duration ?? 10), media_id: asset.id, loop: false })
      return
    }
    const aspect = mediaAspect(asset)
    const video = asset.kind === 'video'
    // Videos cover the house (or the projector being looked at); pictures
    // start a good size in the middle.
    const box = viewed?.source
    const fit = fitPin(canvasAspect, aspect, box)
    const pin = video ? fillPin(canvasAspect, aspect, box) : { ...fit, size: Math.min(0.6 * (box?.h ?? 1), fit.size) }
    add({ ...clipBase('media', name, video && asset.duration ? asset.duration : 5), media_id: asset.id, pin, outputs: onViewed })
  }

  const addElement = (layer: SceneLayer) => {
    // Looking at one projector, its objects start inside that projector's box.
    const box = viewed?.source
    const placed = box && layer.pins
      ? { ...layer, pins: layer.pins.map((p) => ({ ...p, x: box.x + p.x * box.w, y: box.y + p.y * box.h })) }
      : layer
    add({ ...clipBase('element', layerLabel(layer), 10), layer: placed, outputs: onViewed })
  }
  /** Something added while looking at one projector goes on that projector only. */
  const onViewed = viewed ? [viewed.id] : null

  // -- placing on the picture at the playhead --------------------------------------
  const local = selected ? shownTime - selected.start : 0
  const onNow = selected ? clipOn(selected, shownTime) : false
  const selectedAsset = selected?.media_id != null ? mediaById.get(selected.media_id) : undefined
  const aspect = mediaAspect(selectedAsset)
  const base = selected ? basePins(selected, canvasAspect, aspect) : null
  const placed = selected && onNow ? placeAt(selected, local, base) : null
  let placing: Placing | null = null
  if (canEdit && selected && placed?.pins && onNow) {
    if (selected.kind === 'media') {
      placing = {
        pins: placed.pins as ObjectPin[], radius: 0.1, box: { w: aspect, h: 1 }, max: 1, selected: 0, sizeRange: [0.02, 6],
      }
    } else if (selected.layer && PLACEABLE.has(selected.layer.type)) {
      const sel = pinIndex ?? (SINGLE.has(selected.layer.type) && placed.pins.length ? 0 : null)
      placing = placingFor({ ...selected.layer, pins: placed.pins as ObjectPin[] }, sel)
    }
  }

  /** Pins moved on the picture: the clip's own place, or with moves, its move at the playhead. */
  const onPins = (pins: ObjectPin[], sel: number | null) => {
    setPinIndex(sel)
    if (!selected || !placed || !timeline) return
    if (samePins(pins, placed.pins)) return
    if (playingRef.current) setPlay(false)
    const at = Math.round(Math.max(0, local) * 100) / 100
    if (!selected.keys.length) {
      if (selected.kind === 'media') changeClip(selected.id, { pin: pins[0] })
      else if (selected.layer) changeClip(selected.id, { layer: { ...selected.layer, pins } })
      return
    }
    // An object added on the picture is added at every move, where it was put.
    const added = placed.pins && pins.length === placed.pins.length + 1 ? pins[pins.length - 1] : null
    let keys: ClipKey[] = selected.keys.map((k) => (added && k.pins.length === placed.pins!.length ? { ...k, pins: [...k.pins, added] } : k))
    const near = keys.findIndex((k) => Math.abs(k.t - at) < KEY_NEAR)
    if (near >= 0) keys = keys.map((k, i) => (i === near ? { ...k, pins } : k))
    else keys = [...keys, { t: at, pins, opacity: placed.opacity }].sort((a, b) => a.t - b.t)
    const patch: Partial<TimelineClip> = { keys }
    if (added && selected.kind === 'element' && selected.layer?.pins) patch.layer = { ...selected.layer, pins: [...selected.layer.pins, added as ObjectPin] }
    changeClip(selected.id, patch)
  }

  /** Start moving: the place now becomes the first move, and the playhead a second one to drag. */
  const addMove = () => {
    if (!selected || !base) return
    const at = Math.round(Math.max(0, Math.min(selected.length, local)) * 100) / 100
    const now = placeAt(selected, at, base)
    const pins = now.pins ?? base
    let keys = selected.keys.filter((k) => Math.abs(k.t - at) >= KEY_NEAR)
    if (!keys.length && at > KEY_NEAR) keys = [{ t: 0, pins: base, opacity: 1 }]
    keys = [...keys, { t: at, pins, opacity: now.opacity }].sort((a, b) => a.t - b.t)
    changeClip(selected.id, { keys })
  }

  // -- what the preview draws ------------------------------------------------------
  // A projector with a scene of its own in this cue shows that one instead.
  const ownScene = viewed && cue && String(viewed.id) in (cue.output_scenes ?? {})
  const sceneId = ownScene ? cue!.output_scenes[String(viewed!.id)] : cue?.scene_id ?? null
  const scene = sceneId != null ? scenes.find((s) => s.id === sceneId) ?? null : null
  const cueLayers = cue?.elements ?? NO_LAYERS
  const everyLayers = show.every_cue_elements ?? NO_LAYERS
  const context = useMemo<MappingScene | null>(() => {
    if (!withScene) return null
    const layers = [...(scene?.layers ?? []), ...cueLayers, ...everyLayers]
    return layers.length ? { id: -4, name: '', description: '', layers, created_at: '', updated_at: '' } : null
  }, [withScene, scene, cueLayers, everyLayers])
  const shown = useMemo(
    () => (timeline && viewed ? { ...timeline, clips: timeline.clips.filter((c) => c.kind === 'sound' || showsOn(c, viewed.id)) } : timeline),
    [timeline, viewed],
  )
  const preview = useMemo<TimelinePreview | null>(
    () => (shown ? { timeline: shown, time: () => timeRef.current, playing: () => playingRef.current || latest.current.follow, sound } : null),
    [shown, sound],
  )
  const hasMedia = cue?.media_id != null && mediaById.get(cue.media_id)?.kind !== 'audio' && mediaById.has(cue.media_id)
  const backdrop: Backdrop =
    backdropChoice === 'media' && hasMedia ? { kind: 'media', id: cue!.media_id! }
      : backdropChoice !== 'none' && show.camera_view ? { kind: 'camera' }
        : { kind: 'none' }

  // Space plays and pauses; Delete takes the picked clip off.
  const keyState = useRef({ selected, timeline, canEdit })
  keyState.current = { selected, timeline, canEdit }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === ' ') {
        event.preventDefault()
        setPlay(!playingRef.current)
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && keyState.current.canEdit && keyState.current.selected) {
        event.preventDefault()
        const { timeline: tl, selected: clip } = keyState.current
        if (tl && clip) {
          put({ ...tl, clips: tl.clips.filter((c) => c.id !== clip.id) })
          setSelectedId(null)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // re-bound each render so it sees the latest put()

  if (show.cues.length === 0 && !canEdit) {
    return <EmptyState title="No cues yet">A timeline belongs to a cue; this show has none.</EmptyState>
  }

  const cuePicker = (
    <div className="flex flex-wrap items-end gap-3">
      {show.cues.length > 0 && (
        <label className="block">
          <span className="label">Cue</span>
          <select className="input w-auto py-1 text-sm" value={cue?.id ?? ''} onChange={(e) => setCueId(Number(e.target.value))}>
            {show.cues.map((c, i) => (
              <option key={c.id} value={c.id}>
                {i + 1}. {c.name || 'Untitled'}{c.timeline ? ` · timeline ${clockText(c.timeline.length, false)}` : ''}{c.id === live?.id ? ' (playing)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {canEdit && (
        <button type="button" className="btn-default py-1 text-sm" disabled={busy} onClick={() => void newCue()}
          title="Adds a cue at the end of the cue list with an empty timeline">
          <Plus size={14} aria-hidden /> New cue with a timeline
        </button>
      )}
    </div>
  )

  if (!cue || !timeline) {
    return (
      <div className="space-y-4">
        {cuePicker}
        <EmptyState
          title={cue ? `“${cue.name || `Cue ${cue.position + 1}`}” has no timeline yet` : 'No cues yet'}
          action={canEdit && cue ? (
            <button className="btn-primary" disabled={busy} onClick={() => void makeTimeline()}>
              Make a timeline for this cue
            </button>
          ) : undefined}
        >
          A timeline is like a video editor for one cue: put videos, pictures, elements and sounds on rows, say when
          each one comes in, how it moves and when it goes, and GO plays it all on the house. Whatever the cue already
          shows (its video and scene) stays underneath.
        </EmptyState>
      </div>
    )
  }

  const cueNumber = cue.position + 1
  const isLive = live?.id === cue.id
  const lastEnd = Math.max(0, ...timeline.clips.map((c) => c.start + c.length))

  const hint = !canEdit ? null
    : !selected
      ? timeline.clips.length
        ? 'Click a clip to change it. Drag clips along a row to change when they play, or onto another row; drag their ends to make them shorter or longer.'
        : 'Add a video, picture, element or sound. It goes in at the playhead (the red line); drag it along to change when it plays.'
      : selected.kind === 'sound'
        ? 'Sounds play from one mini PC, through its sound output (HDMI to the projector, or speakers plugged into the mini PC).'
        : !onNow
          ? `Move the playhead into “${selected.name}” to place it on the picture.`
          : !placing
            ? 'This element spreads itself over the house; it can fade, but it has no place to move.'
            : selected.keys.length
              ? `Drag it on the picture to set where it is at ${clockText(Math.max(0, local))} into the clip. It glides from move to move.`
              : 'Drag it on the picture to put it in place; pull the square corner to size it and the round handle to turn it. To make it travel, press Add a move here.'

  return (
    <div className="space-y-3">
      <Modal open={adding != null} label="Add to the timeline" size="lg" className="sm:max-w-4xl" onClose={() => setAdding(null)}>
        <div className="p-4 sm:p-5">
          {adding === 'element' ? (
            <>
              <h2 className="mb-3 text-base font-semibold text-slate-100">Add an element at {clockText(timeRef.current)}</h2>
              <ElementLibrary disabled={busy} onPick={(layer) => addElement(layer)} />
            </>
          ) : (
            <MediaPicker
              kind={adding === 'sound' ? 'sound' : 'visual'}
              media={media}
              at={timeRef.current}
              onPick={addMedia}
              onUploaded={async (asset) => {
                await reloadMedia()
                addMedia(asset)
              }}
            />
          )}
        </div>
      </Modal>

      {cuePicker}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-default px-2 py-1" title="Back to the start" onClick={() => seek(0)}>
          <SkipBack size={15} aria-hidden />
        </button>
        <button type="button" className="btn-primary px-3 py-1" onClick={() => setPlay(!playing)}
          title="Play the timeline here (Space). The house is not changed.">
          {playing ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
          {playing ? 'Pause' : 'Play here'}
        </button>
        <span className="tnum min-w-[7.5rem] text-sm text-slate-200">
          <span ref={readoutRef}>{clockText(shownTime)}</span>
          <span className="text-slate-500"> / {clockText(timeline.length)}</span>
        </span>
        {canRun && (
          <button type="button" className={classNames('btn px-3 py-1 text-sm', isLive ? 'bg-emerald-600 text-white' : 'btn-default')}
            onClick={() => onPlayOnHouse(cue)}
            title="Plays this cue on every projector now, from the start of its timeline">
            {isLive ? 'Playing on the house · start again' : 'Play it on the house'}
          </button>
        )}
        {isLive && (
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" className="accent-sky-500" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            Follow the house
          </label>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
          <input type="checkbox" className="accent-sky-500" checked={sound} onChange={(e) => setSound(e.target.checked)} />
          Sound here
        </label>
      </div>

      <YourProjectors show={show} outputs={outputs} viewId={viewed?.id ?? null} onView={setViewId}
        canEdit={canEdit} onChanged={onShowChanged} onError={onError} />

      <ScenePreview
        show={show}
        scene={context}
        media={media}
        clock={clock}
        cameraPeople={tracker}
        peopleSource="simulated"
        count={0}
        sendToProjectors={false}
        backdrop={backdrop}
        surfaces={show.surfaces}
        showSurfaces={false}
        drawing={null}
        onDrawingChange={() => undefined}
        onDrawingDone={() => undefined}
        onSurfacesChange={() => undefined}
        onSurfacesDone={() => undefined}
        placing={placing}
        onPinsChange={onPins}
        timeline={preview}
        overlay={<ProjectorBoxes show={show} outputs={outputs} />}
        view={viewed ? { source: viewed.source, aspect: viewed.width / viewed.height } : null}
      />
      {viewed && cue.output_media && String(viewed.id) in cue.output_media && (
        <p className="text-xs text-amber-200">
          In this cue {viewed.name} plays a picture of its own instead of its part of the cue’s picture
          (Editor → Elements → Pictures on each projector); this preview shows the cue’s picture.
        </p>
      )}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}

      <div className="flex flex-wrap items-end gap-2">
        {canEdit && (
          <>
            <button type="button" className="btn-default py-1 text-sm" onClick={() => setAdding('media')}>
              <Film size={14} aria-hidden /> Video or picture
            </button>
            <button type="button" className="btn-default py-1 text-sm" onClick={() => setAdding('element')}>
              <Sparkles size={14} aria-hidden /> Element
            </button>
            <button type="button" className="btn-default py-1 text-sm" onClick={() => setAdding('sound')}>
              <Music size={14} aria-hidden /> Sound
            </button>
          </>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          Zoom
          <input type="range" className="w-28 accent-sky-500" min={1} max={12} step={0.5} value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))} />
        </label>
      </div>

      <div ref={tracksBox}>
        <TimelineTracks
          timeline={timeline}
          media={mediaById}
          selectedId={selectedId}
          pps={pps}
          canEdit={canEdit}
          playheadRef={playheadRef}
          time={() => timeRef.current}
          onSelect={(id) => {
            setSelectedId(id)
            setPinIndex(null)
          }}
          onSeek={(t) => {
            setPlay(false)
            setFollow(false)
            seek(t)
          }}
          onChange={(next, done) => put(next, done)}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-3 rounded-md bg-panel-850 p-3 ring-1 ring-white/5">
          <h3 className="text-sm font-medium text-slate-100">The whole timeline</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Length</span>
              <span className="flex items-center gap-1">
                <input type="number" className="input tnum py-1" min={1} max={MAX_SECONDS} step={1} disabled={!canEdit}
                  key={`${cue.id}:${timeline.length}`}
                  defaultValue={timeline.length}
                  onBlur={(e) => {
                    const v = Math.round(Number(e.target.value) * 10) / 10
                    if (Number.isFinite(v) && v >= 1 && v !== timeline.length) put({ ...timeline, length: Math.min(MAX_SECONDS, v) })
                  }} />
                <span className="text-xs text-slate-500">seconds</span>
              </span>
            </label>
            <label className="block">
              <span className="label">Rows</span>
              <select className="input py-1 text-sm" value={timeline.tracks} disabled={!canEdit}
                onChange={(e) => {
                  const tracks = Number(e.target.value)
                  const used = Math.max(0, ...timeline.clips.map((c) => c.track + 1))
                  if (tracks < used) onError(`Row ${used} has clips on it; move them down first.`)
                  else put({ ...timeline, tracks })
                }}>
                {Array.from({ length: MAX_TRACKS }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          {lastEnd > timeline.length + 0.01 && (
            <p className="text-xs text-amber-300">Some clips go on past the end ({clockText(lastEnd)}); the part after {clockText(timeline.length)} is not played.</p>
          )}
          <div role="radiogroup" aria-label="When it ends" className="space-y-1">
            <span className="label">When it ends</span>
            {END_CHOICES.map((choice) => (
              <label key={choice.id} className="flex cursor-pointer items-start gap-2 text-sm text-slate-200">
                <input type="radio" name="timeline-end" className="mt-1 accent-sky-500" disabled={!canEdit}
                  checked={timeline.end === choice.id} onChange={() => put({ ...timeline, end: choice.id })} />
                <span>{choice.label}<span className="block text-xs text-slate-500">{choice.detail}</span></span>
              </label>
            ))}
            {timeline.end === 'next' && cue.follow_seconds != null && (
              <p className="text-xs text-amber-300">This cue also has Auto set to {cue.follow_seconds} s in the cue list, which wins.</p>
            )}
          </div>
          <label className="block">
            <span className="label">Under the timeline here</span>
            <select className="input py-1 text-sm" value={backdropChoice} onChange={(e) => setBackdropChoice(e.target.value as typeof backdropChoice)}>
              <option value="media">{hasMedia ? `Cue ${cueNumber}'s own video or picture` : show.camera_view ? 'The house photo (the cue has no video)' : 'Black (the cue has no video)'}</option>
              {show.camera_view && <option value="camera">The house photo from the camera</option>}
              <option value="none">Black</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" className="accent-sky-500" checked={withScene} onChange={(e) => setWithScene(e.target.checked)} />
            Show the cue’s scene and elements here too
          </label>
          {canEdit && (
            <button type="button" className="btn-ghost px-2 py-0.5 text-xs text-rose-300"
              onClick={() => {
                if (window.confirm(`Take the timeline off cue ${cueNumber}? Its ${timeline.clips.length} clips go too; the media stays in the library.`)) {
                  void save(cue.id, null, true)
                  setDraft(null)
                }
              }}>
              Take the timeline off this cue
            </button>
          )}
        </div>

        <div className="rounded-md bg-panel-850 p-3 ring-1 ring-white/5">
          {selected ? (
            <ClipInspector
              clip={selected}
              asset={selectedAsset}
              show={show}
              outputs={outputs}
              viewed={viewed}
              canEdit={canEdit}
              local={local}
              onNow={onNow}
              pinIndex={pinIndex}
              canvasAspect={canvasAspect}
              onChange={(patch) => changeClip(selected.id, patch)}
              onAddMove={addMove}
              onJump={(t) => {
                setPlay(false)
                seek(selected.start + t)
              }}
              onDuplicate={() => {
                const copy = { ...selected, id: newId(), start: Math.round((selected.start + selected.length) * 10) / 10 }
                add(copy)
              }}
              onRemove={() => {
                put({ ...timeline, clips: timeline.clips.filter((c) => c.id !== selected.id) })
                setSelectedId(null)
              }}
              onPinIndex={setPinIndex}
            />
          ) : (
            <p className="text-sm text-slate-500">
              Pick a clip on the timeline to set how it comes in and goes out, how long it plays, and how it moves.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Each projector's box over the preview, as in Editor → Elements. */
function ProjectorBoxes({ show, outputs }: { show: Show; outputs: Output[] }) {
  const W = show.canvas_width
  const H = show.canvas_height
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
      {outputs.map((o, i) => (
        <g key={o.id}>
          <rect x={o.source.x * W} y={o.source.y * H} width={o.source.w * W} height={o.source.h * H}
            fill="none" stroke={outputColor(i)} strokeWidth={1.5} strokeDasharray="10 6" vectorEffect="non-scaling-stroke" opacity={0.7} />
          <text x={o.source.x * W + H / 80} y={o.source.y * H + H / 24} fill={outputColor(i)} fontSize={H / 32} fontWeight={600} opacity={0.8}>
            {i + 1} {o.name}
          </text>
        </g>
      ))}
    </svg>
  )
}

/** Pick a video or picture (or a sound) from the library, or upload new ones. */
function MediaPicker({
  kind,
  media,
  at,
  onPick,
  onUploaded,
}: {
  kind: 'visual' | 'sound'
  media: MediaAsset[]
  at: number
  onPick: (asset: MediaAsset) => void
  onUploaded: (asset: MediaAsset) => void | Promise<void>
}) {
  const list = media.filter((m) => (kind === 'sound' ? m.kind === 'audio' : m.kind !== 'audio'))
  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-slate-100">
        {kind === 'sound' ? 'Add a sound' : 'Add a video or picture'} at {clockText(at)}
      </h2>
      <MediaDrop onUploaded={(asset) => void onUploaded(asset)}
        hint={kind === 'sound' ? 'Drop sounds (or videos and pictures) here to add them' : 'Drop videos, pictures or GIFs (or sounds) here to add them'} />
      {list.length === 0 ? (
        <p className="text-sm text-slate-500">{kind === 'sound' ? 'No sounds in the library yet.' : 'No videos or pictures in the library yet.'}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((asset) => (
            <li key={asset.id}>
              <button type="button" onClick={() => onPick(asset)}
                className="flex w-full items-center gap-3 rounded-md bg-panel-850 p-2 text-left ring-1 ring-white/5 hover:bg-panel-800 hover:ring-sky-400/50">
                <span className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-black">
                  {asset.kind === 'image' ? (
                    <img src={mediaUrl(asset.id)} alt="" className="h-full w-full object-contain" loading="lazy" />
                  ) : asset.kind === 'video' ? (
                    <video src={`${mediaUrl(asset.id)}#t=0.5`} muted preload="metadata" className="h-full w-full object-contain" />
                  ) : (
                    <Music size={20} className="text-emerald-300" aria-hidden />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-100">{asset.name}</span>
                  <span className="block text-xs text-slate-500">
                    {mediaKindLabel(asset)}{asset.kind !== 'image' ? ` · ${formatDuration(asset.duration)}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
