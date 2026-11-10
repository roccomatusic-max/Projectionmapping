/**
 * Keeps a timeline's videos and sounds playing in step with the server's
 * clock, and its moving pictures (GIFs, animated WebP) on the right frame.
 *
 * Each video or sound clip that is on, or about to come on, has its own
 * <video> or <audio>, kept at the position the timeline says, the same way
 * cue media is (playback.ts): small drift is absorbed by nudging the rate,
 * large drift by seeking. Sounds play only where they are wanted (one mini
 * PC per sound, so a house of projectors does not echo); everywhere else
 * no <audio> is made at all.
 */

import { mediaUrl } from './api'
import { clipGain, clipOn } from './scene/timeline'
import type { ItemMedia } from './scene/engine'
import type { MediaAsset, TimelineClip } from './types'

const SEEK_THRESHOLD = 0.15
const MAX_RATE_DELTA = 0.05
const CORRECT_EVERY_MS = 200
/** Videos and sounds are made this long before their clip starts, so they are ready. */
export const PRELOAD_SECONDS = 3
/** A moving picture not on for this long is let go (it is read again if it comes back). */
const MOVING_KEEP_MS = 20_000

/** One clip wanted now: ``local`` is seconds since it started (negative: soon). */
export interface MediaWant {
  key: string
  clip: TimelineClip
  /** Seconds into the timeline, for the clip's fades. */
  t: number
  playing: boolean
  /** Sound may play here. */
  audible: boolean
}

interface Entry {
  el: HTMLVideoElement | HTMLAudioElement
  asset: MediaAsset
  lastCorrect: number
  /** It has shown a frame, so it keeps being drawn (its last frame) while it seeks. */
  shown: boolean
}

/** Seconds into the file where the clip should be, ``local`` seconds after it starts. */
function fileTime(clip: TimelineClip, local: number, duration: number | null): number {
  let t = clip.offset + Math.max(0, local)
  if (duration && duration > 0) {
    if (clip.loop) t %= duration
    else t = Math.min(t, Math.max(0, duration - 0.04))
  }
  return t
}

export class TimelineMedia {
  private entries = new Map<string, Entry>()
  private moving = new Map<number, MovingPicture>()
  /** When each moving picture was last wanted, to let go of ones no longer used. */
  private movingSeen = new Map<number, number>()

  constructor(private assets: () => Map<number, MediaAsset>) {}

  /** Bring every video and sound in line with ``wants``; anything not wanted is let go. */
  update(wants: MediaWant[], now: number) {
    const assets = this.assets()
    const keep = new Set<string>()
    for (const want of wants) {
      const { clip } = want
      const asset = clip.media_id != null ? assets.get(clip.media_id) : undefined
      if (!asset) continue
      const local = want.t - clip.start
      if (local < -PRELOAD_SECONDS || local >= clip.length) continue
      if (clip.kind === 'media' && asset.kind === 'image') {
        if (MovingPicture.may(asset)) {
          if (!this.moving.has(asset.id)) this.moving.set(asset.id, new MovingPicture(asset))
          this.movingSeen.set(asset.id, now)
        }
        continue
      }
      const sound = clip.kind === 'sound'
      if (sound && (asset.kind !== 'audio' || !want.audible)) continue
      if (!sound && asset.kind !== 'video') continue
      keep.add(want.key)
      const entry = this.entries.get(want.key) ?? this.make(want.key, asset, clip, sound)
      this.correct(entry, want, local, now)
    }
    for (const [key, entry] of this.entries) {
      if (!keep.has(key)) this.release(key, entry)
    }
    for (const [id, picture] of this.moving) {
      if (now - (this.movingSeen.get(id) ?? 0) > MOVING_KEEP_MS) {
        picture.dispose()
        this.moving.delete(id)
        this.movingSeen.delete(id)
      }
    }
  }

  private make(key: string, asset: MediaAsset, clip: TimelineClip, sound: boolean): Entry {
    const el = sound ? new Audio() : document.createElement('video')
    if (el instanceof HTMLVideoElement) el.playsInline = true
    el.muted = !sound
    el.preload = 'auto'
    el.loop = clip.loop
    el.src = mediaUrl(asset.id)
    // Tried again while still wanted after a failed load (the server
    // restarting), backing off to once a minute.
    let attempts = 0
    el.onerror = () => {
      const wait = Math.min(60_000, 2000 * 2 ** attempts++)
      window.setTimeout(() => {
        if (this.entries.get(key)?.el !== el) return
        el.src = mediaUrl(asset.id)
        el.load()
      }, wait)
    }
    const entry = { el, asset, lastCorrect: 0, shown: false }
    this.entries.set(key, entry)
    return entry
  }

  private correct(entry: Entry, want: MediaWant, local: number, now: number) {
    const { el, asset } = entry
    const { clip } = want
    const gain = Math.min(1, Math.max(0, clipGain(clip, want.t)))
    const heard = clip.kind === 'sound' || (clip.sound && want.audible)
    if (el.muted === heard) el.muted = !heard
    if (heard && Math.abs(el.volume - gain) > 0.01) el.volume = gain
    if (el.loop !== clip.loop) el.loop = clip.loop
    if (now - entry.lastCorrect < CORRECT_EVERY_MS || el.readyState < 1) return
    entry.lastCorrect = now
    const duration = Number.isFinite(el.duration) ? el.duration : asset.duration
    const target = fileTime(clip, local, duration)
    let diff = el.currentTime - target
    if (duration && clip.loop) diff = ((diff + duration * 1.5) % duration) - duration / 2
    const running = want.playing && local >= 0 && clipOn(clip, want.t)
    if (!running) {
      if (!el.paused) el.pause()
      if (Math.abs(diff) > 0.04 && !el.seeking) el.currentTime = target
      return
    }
    if (Math.abs(diff) > SEEK_THRESHOLD) {
      if (!el.seeking) el.currentTime = target
      el.playbackRate = 1
    } else {
      const rate = Math.abs(diff) < 0.01 ? 1 : 1 - Math.max(-MAX_RATE_DELTA, Math.min(MAX_RATE_DELTA, diff * 0.8))
      if (Math.abs(el.playbackRate - rate) > 0.001) el.playbackRate = rate
    }
    if (el.paused) void el.play().catch(() => undefined)
  }

  /** What a picture or video clip draws now; null while a video is not ready. */
  source(key: string, clip: TimelineClip, local: number): Pick<ItemMedia, 'source' | 'frame'> | null {
    const entry = this.entries.get(key)
    if (entry) {
      const el = entry.el
      if (!(el instanceof HTMLVideoElement)) return null
      if (el.readyState >= 2) entry.shown = true
      return entry.shown ? { source: el, frame: null } : null
    }
    const moving = clip.media_id != null ? this.moving.get(clip.media_id) : undefined
    return moving?.at(local * 1000) ?? null
  }

  private release(key: string, entry: Entry) {
    this.entries.delete(key)
    entry.el.onerror = null
    entry.el.pause()
    entry.el.removeAttribute('src')
    entry.el.load()
  }

  dispose() {
    for (const [key, entry] of [...this.entries]) this.release(key, entry)
    for (const picture of this.moving.values()) picture.dispose()
    this.moving.clear()
  }
}

// -- moving pictures -----------------------------------------------------------------

/** The little of WebCodecs' ImageDecoder used here (Chrome and Edge have it). */
interface FrameDecoder {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null }
  decode(options: { frameIndex: number }): Promise<{ image: VideoFrame }>
  close(): void
}
type DecoderClass = { new (init: { data: ArrayBuffer; type: string }): FrameDecoder; isTypeSupported(type: string): Promise<boolean> }

/** Most frames read from one picture; longer GIFs loop over these. */
const MAX_FRAMES = 500

/**
 * A GIF or animated WebP, one frame at a time. Its frames' lengths are read
 * once; then only the frame on show (and the one being decoded) is held,
 * so even a long GIF takes little memory. Without ImageDecoder, or for a
 * picture that does not move, it gives nothing and the still is drawn.
 */
class MovingPicture {
  static may(asset: MediaAsset): boolean {
    return /^image\/(gif|webp|avif)$/.test(asset.content_type) && 'ImageDecoder' in window
  }

  private decoder: FrameDecoder | null = null
  /** Each frame's end, milliseconds from the start. */
  private ends: number[] = []
  private current: ImageBitmap | null = null
  private index = -1
  private busy = false
  private gone = false

  constructor(asset: MediaAsset) {
    void this.load(asset)
  }

  private async load(asset: MediaAsset) {
    try {
      const Decoder = (window as unknown as { ImageDecoder: DecoderClass }).ImageDecoder
      if (!(await Decoder.isTypeSupported(asset.content_type))) return
      const data = await (await fetch(mediaUrl(asset.id))).arrayBuffer()
      const decoder = new Decoder({ data, type: asset.content_type })
      await decoder.tracks.ready
      const count = Math.min(MAX_FRAMES, decoder.tracks.selectedTrack?.frameCount ?? 0)
      if (count < 2 || this.gone) {
        decoder.close()
        return
      }
      let end = 0
      for (let i = 0; i < count; i++) {
        const { image } = await decoder.decode({ frameIndex: i })
        // Microseconds; a frame with no time of its own shows for a tenth of a second.
        end += Math.max(20, (image.duration ?? 100_000) / 1000)
        image.close()
        this.ends.push(end)
      }
      if (this.gone) decoder.close()
      else this.decoder = decoder
    } catch {
      // Drawn as a still instead.
    }
  }

  /** The frame on show ``ms`` into the clip, as it loops. */
  at(ms: number): Pick<ItemMedia, 'source' | 'frame'> | null {
    const decoder = this.decoder
    if (!decoder || !this.ends.length) return null
    const total = this.ends[this.ends.length - 1]
    const t = ((ms % total) + total) % total
    let want = 0
    while (want < this.ends.length - 1 && this.ends[want] <= t) want++
    if (want !== this.index && !this.busy) {
      this.busy = true
      void decoder.decode({ frameIndex: want }).then(async ({ image }) => {
        const bitmap = await createImageBitmap(image)
        image.close()
        if (this.gone) {
          bitmap.close()
          return
        }
        this.current?.close()
        this.current = bitmap
        this.index = want
      }).catch(() => undefined).finally(() => {
        this.busy = false
      })
    }
    return this.current ? { source: this.current, frame: this.index } : null
  }

  dispose() {
    this.gone = true
    this.decoder?.close()
    this.decoder = null
    this.current?.close()
    this.current = null
  }
}
