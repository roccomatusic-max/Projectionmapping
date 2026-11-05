/**
 * A cue's timeline (the show designer), worked out at one moment.
 *
 * A timeline is rows of clips, each a video or picture, an element or a
 * sound, with a start and a length. A clip comes in and goes out its own
 * way (fades, slides in from an edge, grows, spins), and can move: key
 * points say where it is at set times and it glides between them. Pictures
 * and elements are turned here into scene items the engine draws, one per
 * clip, so every projector draws the same moment from the server's clock.
 * The videos and sounds themselves are kept playing in step by
 * ../timelineMedia.ts.
 */

import type { ClipEntrance, ClipKey, ClipPin, MappingScene, MediaAsset, ObjectPin, SceneLayer, SourceRect, Timeline, TimelineClip } from '../types'
import type { ItemMedia, SceneItem } from './engine'

export const ENTRANCES: Array<{ id: ClipEntrance; into: string; out: string }> = [
  { id: 'fade', into: 'Fade in', out: 'Fade out' },
  { id: 'left', into: 'Slide in from the left', out: 'Slide out to the left' },
  { id: 'right', into: 'Slide in from the right', out: 'Slide out to the right' },
  { id: 'top', into: 'Drop in from the top', out: 'Fly up and away' },
  { id: 'bottom', into: 'Rise up from the bottom', out: 'Sink down and away' },
  { id: 'grow', into: 'Grow from nothing', out: 'Shrink away' },
  { id: 'spin', into: 'Spin in', out: 'Spin away' },
  { id: 'none', into: 'Just appear', out: 'Just go' },
]

export const END_CHOICES: Array<{ id: Timeline['end']; label: string; detail: string }> = [
  { id: 'loop', label: 'Start again', detail: 'Plays round and round until the next GO.' },
  { id: 'next', label: 'Go to the next cue', detail: 'Moves on by itself when it ends.' },
  { id: 'hold', label: 'Stay on the last moment', detail: 'Stops at the end and waits for GO.' },
]

/** A new, empty timeline. */
export function emptyTimeline(): Timeline {
  return { length: 30, end: 'loop', tracks: 4, clips: [] }
}

/** Seconds into the timeline ``elapsed`` seconds after its cue started. */
export function timelineTime(timeline: Timeline, elapsed: number): number {
  if (!(elapsed > 0)) return 0
  if (timeline.end === 'loop') return elapsed % timeline.length
  return Math.min(elapsed, timeline.length)
}

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))

/** Width over height of a picture or video; 16:9 when it is not known. */
export function mediaAspect(asset: MediaAsset | undefined): number {
  return asset?.width && asset?.height ? asset.width / asset.height : 16 / 9
}

const WHOLE: SourceRect = { x: 0, y: 0, w: 1, h: 1 }

/**
 * A picture's place covering the whole canvas, or one projector's ``box`` of
 * it (cropping what does not fit). A pin's size is its height in canvas heights.
 */
export function fillPin(canvasAspect: number, aspect: number, box: SourceRect = WHOLE): ClipPin {
  const size = Math.max(box.h, (box.w * canvasAspect) / aspect)
  return { x: box.x + box.w / 2, y: box.y + box.h / 2, size, rotation: 0 }
}

/** A picture's place showing all of it, as big as fits on the canvas (or in ``box``). */
export function fitPin(canvasAspect: number, aspect: number, box: SourceRect = WHOLE): ClipPin {
  const size = Math.min(box.h, (box.w * canvasAspect) / aspect)
  return { x: box.x + box.w / 2, y: box.y + box.h / 2, size, rotation: 0 }
}

/** Where a clip sits before any moves: its own place, or for an element its objects. */
export function basePins(clip: TimelineClip, canvasAspect: number, aspect: number): ClipPin[] | null {
  if (clip.kind === 'element') return (clip.layer?.pins as ClipPin[] | null | undefined) ?? null
  return [clip.pin ?? fillPin(canvasAspect, aspect)]
}

function mixPin(a: ClipPin, b: ClipPin, k: number): ClipPin {
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    size: a.size + (b.size - a.size) * k,
    rotation: (a.rotation ?? 0) + ((b.rotation ?? 0) - (a.rotation ?? 0)) * k,
  }
}

/** The key points around ``local``, and how far it is from the first to the second. */
function around(keys: ClipKey[], local: number): [ClipKey, ClipKey, number] {
  let i = 0
  while (i + 1 < keys.length && keys[i + 1].t <= local) i++
  const a = keys[i]
  const b = keys[Math.min(i + 1, keys.length - 1)]
  if (b === a || local <= a.t) return [a, a, 0]
  return [a, b, ease((local - a.t) / Math.max(1e-6, b.t - a.t))]
}

/** Where the clip is ``local`` seconds after it starts, from its moves, before coming in or going out. */
export function placeAt(clip: TimelineClip, local: number, base: ClipPin[] | null): { pins: ClipPin[] | null; opacity: number } {
  const keys = clip.keys
  if (!keys.length) return { pins: base, opacity: 1 }
  const [a, b, k] = around(keys, local)
  const opacity = a.opacity + (b.opacity - a.opacity) * k
  // Things spread over an area by themselves have no place to move.
  if (!base || !a.pins.length) return { pins: base, opacity }
  if (b.pins.length !== a.pins.length) return { pins: a.pins, opacity }
  return { pins: a.pins.map((p, i) => mixPin(p, b.pins[i], k)), opacity }
}

/**
 * How far in (0 not yet, 1 fully) the clip is at ``local``, and which way
 * it is coming or going: entering, leaving, or neither.
 */
export function inOut(clip: TimelineClip, local: number): { e: number; how: ClipEntrance } {
  const enter = clip.enter === 'none' ? 0 : Math.min(clip.enter_seconds, clip.length / 2)
  const exit = clip.exit === 'none' ? 0 : Math.min(clip.exit_seconds, clip.length / 2)
  if (enter > 0 && local < enter) return { e: ease(local / enter), how: clip.enter }
  if (exit > 0 && local > clip.length - exit) return { e: ease((clip.length - local) / exit), how: clip.exit }
  return { e: 1, how: 'none' }
}

/**
 * The pins moved by a slide, grow or spin part way in; ``margin`` is how
 * far past the edge (in canvas fractions across and down) a pin must go
 * to be out of sight.
 */
function moved(pins: ClipPin[], how: ClipEntrance, e: number, margin: (pin: ClipPin) => [number, number]): ClipPin[] {
  if (e >= 1 || how === 'none' || how === 'fade') return pins
  const away = 1 - e
  return pins.map((pin) => {
    const [mx, my] = margin(pin)
    switch (how) {
      case 'left':
        return { ...pin, x: pin.x - (pin.x + mx) * away }
      case 'right':
        return { ...pin, x: pin.x + (1 - pin.x + mx) * away }
      case 'top':
        return { ...pin, y: pin.y - (pin.y + my) * away }
      case 'bottom':
        return { ...pin, y: pin.y + (1 - pin.y + my) * away }
      case 'grow':
        return { ...pin, size: Math.max(0.001, pin.size * e) }
      case 'spin':
        return { ...pin, size: Math.max(0.001, pin.size * e), rotation: (pin.rotation ?? 0) + 360 * away }
      default:
        return pin
    }
  })
}

/** Whether the clip is on at ``t`` seconds into the timeline. */
export function clipOn(clip: TimelineClip, t: number): boolean {
  return t >= clip.start && t < clip.start + clip.length
}

/** A clip's picture or element at one moment, with how strongly it shows. */
export interface ClipMoment {
  local: number
  opacity: number
  pins: ClipPin[] | null
}

/** Where a picture or element clip is, and how strongly it shows, at ``t``; null while it is off. */
export function clipMoment(clip: TimelineClip, t: number, canvasAspect: number, aspect: number): ClipMoment | null {
  if (clip.kind === 'sound' || !clipOn(clip, t)) return null
  const local = t - clip.start
  const place = placeAt(clip, local, basePins(clip, canvasAspect, aspect))
  const { e, how } = inOut(clip, local)
  let opacity = clip.opacity * place.opacity
  if (how === 'fade') opacity *= e
  let pins = place.pins
  if (pins) {
    const margin = clip.kind === 'media'
      ? (pin: ClipPin): [number, number] => [(pin.size * aspect) / canvasAspect / 2, pin.size / 2]
      : (pin: ClipPin): [number, number] => [(0.2 * pin.size) / canvasAspect, 0.2 * pin.size]
    pins = moved(pins, how, e, margin)
  }
  return opacity > 0.001 ? { local, opacity, pins } : null
}

/** How loud a sound (or a video's own sound) is at ``t``, 0..1: its volume, faded in and out. */
export function clipGain(clip: TimelineClip, t: number): number {
  if (!clipOn(clip, t)) return 0
  const { e, how } = inOut(clip, t - clip.start)
  return clip.volume * (how === 'none' ? 1 : e)
}

/** Ids for the scenes clips draw as: negative, below every cue's elements, the same for a clip each frame. */
const sceneIds = new Map<string, number>()
let nextId = -3_000_000
function sceneId(key: string): number {
  let id = sceneIds.get(key)
  if (id == null) {
    id = nextId--
    sceneIds.set(key, id)
  }
  return id
}

const PICTURE: SceneLayer = {
  id: 'clip', type: 'picture', name: '', enabled: true, opacity: 1, blend: 'normal',
  color: '#ffffff', color2: '#ffffff', size: 0.5, speed: 0.3, amount: 0.5, fade: 0.5, style: 'still',
  target: 'everywhere', reacts_to: 'always', reaction: 0, motion: 'none', change: 'none', near: 'none',
}

function asScene(id: number, layers: SceneLayer[]): MappingScene {
  return { id, name: '', description: '', layers, created_at: '', updated_at: '' }
}

/** A clip's video or moving picture as it should be drawn now, from ../timelineMedia.ts. */
export type ClipSource = (clip: TimelineClip, local: number) => Pick<ItemMedia, 'source' | 'frame'> | null

/**
 * The scene items a timeline draws ``t`` seconds in, bottom row first.
 * ``scope`` tells timelines apart (one per cue) so each clip keeps its own
 * state in the engine; ``weight`` is the cue's share during a crossfade.
 */
/** ``clip`` shows on projector ``outputId`` (null: a preview of the whole house, where all do). */
export function showsOn(clip: TimelineClip, outputId: number | null): boolean {
  return outputId == null || outputId < 0 || !clip.outputs?.length || clip.outputs.includes(outputId)
}

export function timelineItems({
  timeline,
  scope,
  t,
  weight,
  clock,
  canvasAspect,
  media,
  source,
  outputId = null,
}: {
  timeline: Timeline
  scope: string
  t: number
  weight: number
  clock: number
  canvasAspect: number
  media: Map<number, MediaAsset>
  source?: ClipSource
  /** The projector drawn; null draws every clip (a preview of the whole house). */
  outputId?: number | null
}): SceneItem[] {
  const items: SceneItem[] = []
  const clips = timeline.clips
    .filter((clip) => clip.kind !== 'sound' && clipOn(clip, t) && showsOn(clip, outputId))
    .sort((a, b) => a.track - b.track || a.start - b.start)
  for (const clip of clips) {
    const asset = clip.media_id != null ? media.get(clip.media_id) : undefined
    const aspect = mediaAspect(asset)
    const moment = clipMoment(clip, t, canvasAspect, aspect)
    if (!moment) continue
    const id = sceneId(`${scope}:${clip.id}`)
    if (clip.kind === 'element' && clip.layer) {
      const layer: SceneLayer = {
        ...clip.layer,
        opacity: clip.layer.opacity * moment.opacity,
        pins: moment.pins as ObjectPin[] | null,
      }
      items.push({ scene: asScene(id, [layer]), weight, time: moment.local, clock })
      continue
    }
    if (clip.kind !== 'media' || clip.media_id == null || !asset || asset.kind === 'audio') continue
    const pin = moment.pins?.[0]
    if (!pin) continue
    const live = source?.(clip, moment.local) ?? null
    // A video not ready yet draws nothing rather than a still of something else.
    if (asset.kind === 'video' && !live?.source) continue
    const layer: SceneLayer = { ...PICTURE, id: clip.id, opacity: moment.opacity, target: clipTarget(clip) }
    items.push({
      scene: asScene(id, [layer]),
      weight,
      time: moment.local,
      clock,
      media: {
        mediaId: clip.media_id,
        aspect,
        x: pin.x,
        y: pin.y,
        size: pin.size,
        rotation: pin.rotation ?? 0,
        source: live?.source ?? null,
        frame: live?.frame ?? null,
      },
    })
  }
  return items
}

/** Where on the house a clip's picture may show (all of it, or only the walls, windows…). */
export function clipTarget(clip: TimelineClip): SceneLayer['target'] {
  return clip.target ?? 'everywhere'
}

/** Every file a timeline plays, for the mini PCs to keep a copy of. */
export function timelineMediaIds(timeline: Timeline | null | undefined): number[] {
  if (!timeline) return []
  const ids = new Set<number>()
  for (const clip of timeline.clips) {
    if (clip.media_id != null) ids.add(clip.media_id)
    if (clip.layer?.media_id != null) ids.add(clip.layer.media_id)
  }
  return [...ids]
}
