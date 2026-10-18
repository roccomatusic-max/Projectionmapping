/**
 * Turns transport state into textures, frame by frame.
 *
 * Each output window runs one of these. It owns the <video>/<img> elements
 * for the live cue and the one fading out, and keeps every video at the
 * position the server clock says it should be: small drift is absorbed by
 * nudging playbackRate, large drift by seeking. Not frame-locked; see
 * docs/MAPPING.md for what that means across computers.
 *
 * It also says which scenes play (a cue's scene, crossfading with the
 * previous cue's) and passes on the people and the show's traced surfaces
 * the scenes react to and are shaped by.
 */

import { mediaUrl } from './api'
import type { PeopleTracker, PersonSpot } from './people'
import type { TextureSource } from './renderer'
import type { SceneItem } from './scene/engine'
import type { MappingScene, MediaAsset, Surface, TransportCue, TransportState } from './types'

/** Drift beyond this is corrected by a seek rather than a rate change. */
const SEEK_THRESHOLD = 0.15
const MAX_RATE_DELTA = 0.05
const CORRECT_EVERY_MS = 200

interface Slot {
  key: string
  cue: TransportCue
  element: HTMLVideoElement | HTMLImageElement
  asset: MediaAsset
}

export interface Frame {
  a: TextureSource | null
  b: TextureSource | null
  /** Weight of ``a``; below 1 during a crossfade. */
  mix: number
  blackout: boolean
  /** Measured drift of the live video, seconds, for the status overlay. */
  drift: number | null
  scenes: SceneItem[]
  people: PersonSpot[]
  surfaces: Surface[]
}

function cueKey(cue: TransportCue) {
  return `${cue.id}:${cue.started_at_ms}:${cue.media_id}`
}

export class Playback {
  private state: TransportState | null = null
  private media = new Map<number, MediaAsset>()
  private slots = new Map<string, Slot>()
  private lastCorrection = 0
  private drift: number | null = null
  private scenes = new Map<number, MappingScene>()
  private surfaces: Surface[] = []
  private people: PeopleTracker | null = null
  private peopleAt = -1
  private peopleNow: PersonSpot[] = []
  /** A scene shown whatever the transport says (the scene designer's preview). */
  private preview: { scene: MappingScene; startedAt: number } | null = null
  /** What the preview scene is drawn over, such as a photo of the building. */
  private backdrop: TextureSource | null = null

  setScenes(scenes: MappingScene[]) {
    this.scenes = new Map(scenes.map((scene) => [scene.id, scene]))
  }

  setSurfaces(surfaces: Surface[]) {
    this.surfaces = surfaces
  }

  setPeople(people: PeopleTracker | null) {
    this.people = people
  }

  /** Show ``scene`` instead of the transport (over ``backdrop``); null hands back. */
  setPreview(scene: MappingScene | null, backdrop: TextureSource | null = null) {
    this.backdrop = backdrop
    if (!scene) this.preview = null
    else if (this.preview?.scene.id === scene.id) this.preview.scene = scene
    else this.preview = { scene, startedAt: performance.now() }
  }

  /** People, advanced once per animation frame however many outputs ask. */
  private spots(): PersonSpot[] {
    if (!this.people) return []
    const now = performance.now()
    if (now - this.peopleAt > 4) {
      this.peopleAt = now
      this.peopleNow = this.people.spots(now)
    }
    return this.peopleNow
  }

  private sceneItems(state: TransportState | null, now: number, mix: number): SceneItem[] {
    if (this.preview) {
      return [{ scene: this.preview.scene, weight: 1, time: (performance.now() - this.preview.startedAt) / 1000, clock: now }]
    }
    if (!state || state.status === 'stopped' || state.status === 'blackout' || !state.current) return []
    const items: SceneItem[] = []
    const add = (cue: TransportCue | null, weight: number) => {
      const scene = cue?.scene_id != null ? this.scenes.get(cue.scene_id) : undefined
      if (cue && scene && weight > 0) items.push({ scene, weight, time: Math.max(0, now - cue.started_at_ms) / 1000, clock: now })
    }
    // The outgoing scene first, so the incoming one draws on top of it.
    if (mix < 1) add(state.previous, 1 - mix)
    add(state.current, mix)
    return items
  }

  setMedia(assets: MediaAsset[]) {
    this.media = new Map(assets.map((asset) => [asset.id, asset]))
  }

  /** ``authoritative`` is a fresh GET, which wins even over a higher
   *  revision: the server may have restarted and begun counting again. */
  setState(state: TransportState, authoritative = false) {
    if (!authoritative && this.state && state.revision < this.state.revision) return
    this.state = state
    const wanted = new Set<string>()
    for (const cue of [state.current, state.previous]) {
      if (cue && cue.media_id != null && state.status !== 'stopped' && state.status !== 'blackout') {
        wanted.add(cueKey(cue))
        this.ensure(cue)
      }
    }
    for (const [key, slot] of this.slots) {
      if (!wanted.has(key)) this.release(slot)
    }
  }

  private ensure(cue: TransportCue) {
    const key = cueKey(cue)
    if (this.slots.has(key)) {
      this.slots.get(key)!.cue = cue
      return
    }
    const asset = this.media.get(cue.media_id!)
    if (!asset) return
    let element: HTMLVideoElement | HTMLImageElement
    if (asset.kind === 'video') {
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.preload = 'auto'
      video.loop = cue.loop
      video.src = mediaUrl(asset.id)
      element = video
    } else {
      const img = new Image()
      img.decoding = 'async'
      img.src = mediaUrl(asset.id)
      element = img
    }
    this.slots.set(key, { key, cue, element, asset })
  }

  private release(slot: Slot) {
    if (slot.element instanceof HTMLVideoElement) {
      slot.element.pause()
      slot.element.removeAttribute('src')
      slot.element.load()
    }
    this.slots.delete(slot.key)
  }

  private source(cue: TransportCue | null): TextureSource | null {
    if (!cue) return null
    const slot = this.slots.get(cueKey(cue))
    if (!slot) return null
    const el = slot.element
    const width = slot.asset.width || (el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth)
    const height = slot.asset.height || (el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight)
    return { element: el, width, height, fit: cue.fit }
  }

  /** Where the media of ``cue`` should be now, seconds. */
  private target(cue: TransportCue, now: number, duration: number | null): number {
    const state = this.state!
    let t = state.status === 'paused' && cue === state.current
      ? state.paused_position ?? 0
      : (now - cue.started_at_ms) / 1000
    t = Math.max(0, t)
    if (duration && duration > 0) t = cue.loop ? t % duration : Math.min(t, Math.max(0, duration - 0.04))
    return t
  }

  private correct(slot: Slot, now: number, playing: boolean, measure: boolean) {
    const video = slot.element
    if (!(video instanceof HTMLVideoElement) || video.readyState < 1) return
    const duration = Number.isFinite(video.duration) ? video.duration : slot.asset.duration
    const target = this.target(slot.cue, now, duration)
    let diff = video.currentTime - target
    if (duration && slot.cue.loop) {
      // Across the loop point 0.02 and 9.98 are 0.04 apart, not 9.96.
      diff = ((diff + duration * 1.5) % duration) - duration / 2
    }
    if (measure) this.drift = diff
    if (!playing) {
      if (!video.paused) video.pause()
      if (Math.abs(diff) > 0.04 && !video.seeking) video.currentTime = target
      return
    }
    if (Math.abs(diff) > SEEK_THRESHOLD) {
      if (!video.seeking) video.currentTime = target
      video.playbackRate = 1
    } else {
      const rate = Math.abs(diff) < 0.01 ? 1 : 1 - Math.max(-MAX_RATE_DELTA, Math.min(MAX_RATE_DELTA, diff * 0.8))
      if (Math.abs(video.playbackRate - rate) > 0.001) video.playbackRate = rate
    }
    if (video.paused) void video.play().catch(() => undefined)
  }

  frame(now: number): Frame {
    const state = this.state
    const people = this.spots()
    const surfaces = this.surfaces
    if (this.preview) {
      const scenes = this.sceneItems(state, now, 1)
      return { a: this.backdrop, b: null, mix: 1, blackout: false, drift: null, scenes, people, surfaces }
    }
    if (!state || state.status === 'stopped' || state.status === 'blackout' || !state.current) {
      const scenes = this.sceneItems(state, now, 1)
      return { a: null, b: null, mix: 1, blackout: scenes.length === 0, drift: null, scenes, people, surfaces }
    }
    let mix = 1
    if (state.previous && state.fade_started_at_ms != null) {
      const fadeMs = Math.max(1, state.current.fade_seconds * 1000)
      mix = Math.min(1, Math.max(0, (now - state.fade_started_at_ms) / fadeMs))
    }
    if (now - this.lastCorrection > CORRECT_EVERY_MS) {
      this.lastCorrection = now
      const playing = state.status === 'playing'
      const current = this.slots.get(cueKey(state.current))
      if (current) this.correct(current, now, playing, true)
      if (state.previous && mix < 1) {
        const previous = this.slots.get(cueKey(state.previous))
        if (previous) this.correct(previous, now, playing, false)
      }
    }
    return {
      a: this.source(state.current),
      b: mix < 1 ? this.source(state.previous) : null,
      mix,
      blackout: false,
      drift: this.drift,
      scenes: this.sceneItems(state, now, mix),
      people,
      surfaces,
    }
  }

  dispose() {
    for (const slot of [...this.slots.values()]) this.release(slot)
  }
}
