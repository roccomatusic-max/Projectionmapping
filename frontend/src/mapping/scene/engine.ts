/**
 * Draws scenes into a texture the output renderer lays over the media.
 *
 * The scene buffer covers the output's slice of the canvas at (up to) the
 * output's own resolution, scaled down when the computer cannot keep up.
 * Layers are drawn bottom first, each with its blend mode, in premultiplied
 * colour; the output shader then shows the media through whatever the
 * scene left uncovered (alpha) and adds the scene's light on top.
 *
 * Trails and reveal remember the last frames in a pair of buffers each;
 * every other layer is worked out fresh each frame from the time and the
 * people, so outputs on different computers draw the same picture.
 */

import { mediaUrl } from '../api'
import type { PersonSpot } from '../people'
import type { LayerBlend, MappingScene, ReactsTo, SceneLayer, SourceRect, Surface } from '../types'
import { CHANGES, changeOf, KIND, MOTIONS, motionOf, NEARS, nearOf } from './catalog'
import { CountdownDrawer } from './countdown'
import { maskKey, rasteriseLayerMask } from './masks'
import {
  LAYER_VERTEX,
  layerFragment,
  OBJECTS_FRAGMENT,
  OBJECTS_VERTEX,
  POINTS_FRAGMENT,
  POINTS_VERTEX,
  REVEAL_UPDATE,
  TRAILS_UPDATE,
} from './shaders'

export const MAX_PEOPLE = 16
/** The largest scene buffer side; beyond this soft effects gain nothing visible. */
const MAX_SIDE = 1920
/** Scene detail steps, tried in turn when frames are dropped. */
export const SCENE_SCALES = [1, 0.75, 0.5, 0.35]

/** Width of the image saying where a layer's objects may sit (whole canvas). */
const PLACEMENT_WIDTH = 1024
const FULL_CANVAS: SourceRect = { x: 0, y: 0, w: 1, h: 1 }

/** Objects sit one per cell of a grid over the canvas; the shader uses the same cell size. */
/** Most objects one layer can have placed by hand (the shader's uPins size). */
export const MAX_PINS = 64

export function objectGrid(size: number, aspect: number) {
  const cell = 0.05 + 0.25 * size
  return { cols: Math.ceil(aspect / cell), rows: Math.ceil(1 / cell) }
}

/** Roughly how far an object reaches from its centre, in canvas heights (as the shader draws it). */
export function objectRadius(size: number) {
  return (0.05 + 0.25 * size) * 0.3 * 1.3
}

/** Layers that are drawn around each person, rather than over an area. */
const FOLLOWS_PEOPLE = new Set(['glow', 'ripples', 'trails', 'shadows', 'reveal', 'distort'])

export interface SceneItem {
  scene: MappingScene
  /** 0..1; below 1 while crossfading between cues. */
  weight: number
  /** Seconds since the scene's cue started, on the server's clock, so
   *  every output draws the same moment. */
  time: number
  /** Now on the server's clock, epoch milliseconds (the Christmas countdown). */
  clock?: number
}

export interface DistortParams {
  /** 0 ripple, 1 swirl, 2 bulge. */
  style: number
  size: number
  amount: number
  speed: number
}

export interface SceneFrame {
  items: SceneItem[]
  rect: SourceRect
  canvasWidth: number
  canvasHeight: number
  /** Output (or preview) pixels the scene buffer is scaled from. */
  width: number
  height: number
  surfaces: Surface[]
  people: PersonSpot[]
  /** Any steady clock, seconds; used for how long each frame took. */
  time: number
}

interface Target {
  fbo: WebGLFramebuffer
  tex: WebGLTexture
  w: number
  h: number
}

interface LayerState {
  maskKey: string
  maskTex: WebGLTexture | null
  maskUsed: boolean
  maskCanvas: HTMLCanvasElement | null
  memory: [Target, Target] | null
  seenAt: number
}

interface Program {
  program: WebGLProgram
  uniforms: Map<string, WebGLUniformLocation | null>
}

interface Levels {
  presence: number
  movement: number
  count: number
  closeness: number
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function personEnergy(reacts: ReactsTo, p: PersonSpot, aspect: number): number {
  if (reacts === 'movement') return Math.min(1, Math.hypot(p.vx * aspect, p.vy) / 0.35)
  if (reacts === 'closeness') return p.z == null ? 0.6 : Math.min(1, Math.max(0, (6 - p.z) / 4.5))
  return 1
}

export class SceneEngine {
  private programs = new Map<string, Program>()
  private target: Target | null = null
  private states = new Map<string, LayerState>()
  private vao: WebGLVertexArrayObject
  private empty: WebGLTexture
  private levels: Levels = { presence: 0, movement: 0, count: 0, closeness: 0 }
  private lastTime = 0
  private spotData = new Float32Array(MAX_PEOPLE * 4)
  private pinData = new Float32Array(MAX_PINS * 4)
  private moveData = new Float32Array(MAX_PEOPLE * 4)
  private surfacesKey = ''
  private surfacesRef: Surface[] | null = null
  /** Pictures for "picture" layers, by media id; drawn once loaded. */
  private pictures = new Map<number, { tex: WebGLTexture; ready: boolean }>()
  /** Failed loads per picture, for backing off its retries. */
  private pictureFailures = new Map<number, number>()
  private countdown: CountdownDrawer | null = null
  /** Index into SCENE_SCALES. */
  quality = 0
  /** The distortion the output shader should apply to the media, if any. */
  distort: DistortParams | null = null
  /** Strength of ``distort`` (opacity × crossfade). */
  distortStrength = 0

  constructor(private gl: WebGL2RenderingContext) {
    this.vao = gl.createVertexArray()!
    this.empty = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.empty)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
  }

  get scale() {
    return SCENE_SCALES[this.quality]
  }

  /** Draw at less detail; false when already at the lowest. */
  lowerQuality(): boolean {
    if (this.quality >= SCENE_SCALES.length - 1) return false
    this.quality++
    return true
  }

  // -- GL plumbing ---------------------------------------------------------------------

  private compile(type: number, source: string) {
    const gl = this.gl
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader)
      gl.deleteShader(shader)
      throw new Error(`Scene shader failed to compile: ${log}`)
    }
    return shader
  }

  private program(key: string, vertex: string, fragment: () => string): Program {
    let entry = this.programs.get(key)
    if (!entry) {
      const gl = this.gl
      const program = gl.createProgram()!
      for (const shader of [this.compile(gl.VERTEX_SHADER, vertex), this.compile(gl.FRAGMENT_SHADER, fragment())]) {
        gl.attachShader(program, shader)
        // Freed with the program.
        gl.deleteShader(shader)
      }
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`Scene shader failed to link: ${gl.getProgramInfoLog(program)}`)
      }
      entry = { program, uniforms: new Map() }
      this.programs.set(key, entry)
    }
    return entry
  }

  private u(p: Program, name: string) {
    if (!p.uniforms.has(name)) p.uniforms.set(name, this.gl.getUniformLocation(p.program, name))
    return p.uniforms.get(name)!
  }

  private makeTarget(w: number, h: number): Target {
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    return { fbo, tex, w, h }
  }

  private dropTarget(t: Target | null) {
    if (!t) return
    this.gl.deleteFramebuffer(t.fbo)
    this.gl.deleteTexture(t.tex)
  }

  private dropState(state: LayerState) {
    if (state.maskTex) this.gl.deleteTexture(state.maskTex)
    if (state.memory) state.memory.forEach((t) => this.dropTarget(t))
  }

  private blend(mode: LayerBlend) {
    const gl = this.gl
    if (mode === 'normal') gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    else if (mode === 'screen') gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ZERO, gl.ONE)
    else gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE)
  }

  private picture(mediaId: number): WebGLTexture | null {
    let entry = this.pictures.get(mediaId)
    if (!entry) {
      const gl = this.gl
      const tex = gl.createTexture()!
      entry = { tex, ready: false }
      this.pictures.set(mediaId, entry)
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => {
        if (gl.isContextLost()) return
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        entry!.ready = true
        this.pictureFailures.delete(mediaId)
      }
      // Forget a failed load so a later frame asks again (the server may
      // have been restarting) instead of leaving the layer blank for good.
      img.onerror = () => {
        const failures = this.pictureFailures.get(mediaId) ?? 0
        this.pictureFailures.set(mediaId, failures + 1)
        window.setTimeout(() => {
          if (this.pictures.get(mediaId)?.tex !== tex) return
          this.pictures.delete(mediaId)
          if (!gl.isContextLost()) gl.deleteTexture(tex)
        }, Math.min(60_000, 2000 * 2 ** failures))
      }
      img.src = mediaUrl(mediaId)
    }
    return entry.ready ? entry.tex : null
  }

  // -- people --------------------------------------------------------------------------

  private updateLevels(people: PersonSpot[], aspect: number, dt: number) {
    let presence = 0
    let movement = 0
    let total = 0
    let closeness = 0
    for (const p of people) {
      presence = Math.max(presence, p.strength)
      movement += personEnergy('movement', p, aspect) * p.strength
      total += p.strength
      closeness = Math.max(closeness, personEnergy('closeness', p, aspect) * p.strength)
    }
    const target: Levels = {
      presence,
      movement: total > 0 ? movement / total : 0,
      count: Math.min(1, total / 4),
      closeness,
    }
    // Rise quickly, so a layer answers someone at once, and settle over
    // about half a second, so it swells and fades rather than flickers.
    const rise = 1 - Math.exp(-dt / 0.08)
    const fall = 1 - Math.exp(-dt / 0.5)
    for (const key of Object.keys(target) as Array<keyof Levels>) {
      const gap = target[key] - this.levels[key]
      this.levels[key] += gap * (gap > 0 ? rise : fall)
    }
  }

  /** Overall strength of a layer, and each person's weight for it. */
  private weigh(layer: SceneLayer, people: PersonSpot[], aspect: number, weight: number) {
    const follows = FOLLOWS_PEOPLE.has(layer.type) || (layer.type === 'particles' && layer.style !== 'fireflies')
    const r = layer.reaction
    let strength = layer.opacity * weight
    const reacts = layer.reacts_to
    if (reacts !== 'always') {
      // People-following layers already appear only where someone is; for
      // them presence, movement and closeness weigh each person instead.
      const perPerson = follows && reacts !== 'count'
      if (!perPerson) strength *= 1 - r + r * this.levels[reacts]
    }
    const n = Math.min(people.length, MAX_PEOPLE)
    for (let i = 0; i < n; i++) {
      const p = people[i]
      const energy = follows && (reacts === 'movement' || reacts === 'closeness') ? personEnergy(reacts, p, aspect) : 1
      // By index: this runs per person, per layer, per frame.
      const o = i * 4
      this.spotData[o] = p.x
      this.spotData[o + 1] = p.y
      this.spotData[o + 2] = p.radius
      this.spotData[o + 3] = p.strength * (1 - r + r * energy)
      this.moveData[o] = p.vx * aspect
      this.moveData[o + 1] = p.vy
      this.moveData[o + 2] = energy
      this.moveData[o + 3] = p.seed
    }
    return { strength, count: n }
  }

  // -- drawing -------------------------------------------------------------------------

  /** Draw the scenes; returns the scene texture, or null when there is nothing to draw. */
  render(frame: SceneFrame): WebGLTexture | null {
    const gl = this.gl
    const dt = this.lastTime ? Math.min(0.1, Math.max(0, frame.time - this.lastTime)) : 1 / 60
    this.lastTime = frame.time
    const aspect = frame.canvasWidth / Math.max(1, frame.canvasHeight)
    this.updateLevels(frame.people, aspect, dt)
    this.distort = null
    this.distortStrength = 0

    const drawable = frame.items.filter((item) => item.weight > 0.001 && item.scene.layers.some((l) => l.enabled))
    if (drawable.length === 0) {
      this.forgetUnused(new Set())
      return null
    }

    // Buffer size: the output's pixels, scaled by the detail level.
    const scale = Math.min(this.scale, MAX_SIDE / Math.max(frame.width, frame.height))
    const w = Math.max(16, Math.round(frame.width * scale))
    const h = Math.max(16, Math.round(frame.height * scale))
    if (!this.target || this.target.w !== w || this.target.h !== h) {
      this.dropTarget(this.target)
      this.target = this.makeTarget(w, h)
      // Remembered trails are the old size; start them again.
      for (const state of this.states.values()) {
        if (state.memory) state.memory.forEach((t) => this.dropTarget(t))
        state.memory = null
      }
    }
    if (frame.surfaces !== this.surfacesRef) {
      this.surfacesRef = frame.surfaces
      this.surfacesKey = JSON.stringify(frame.surfaces)
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.fbo)
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.bindVertexArray(this.vao)
    gl.enable(gl.BLEND)

    const used = new Set<string>()
    const rect = frame.rect
    // Pixels of this buffer per canvas height, for line widths and point sizes.
    const pxPerHeight = h / rect.h
    for (const item of drawable) {
      for (const layer of item.scene.layers) {
        if (!layer.enabled || !KIND[layer.type]) continue
        const { strength, count } = this.weigh(layer, frame.people, aspect, item.weight)
        if (layer.type === 'distort') {
          if (strength > this.distortStrength) {
            this.distort = {
              style: Math.max(0, KIND.distort.styles.findIndex((s) => s.id === layer.style)),
              size: layer.size,
              amount: layer.amount,
              speed: layer.speed,
            }
            this.distortStrength = strength
          }
          continue
        }
        if (strength <= 0.001) continue
        const key = `${item.scene.id}:${layer.id}`
        used.add(key)
        if (layer.type === 'countdown') {
          this.countdown ??= new CountdownDrawer(gl)
          this.countdown.draw(key, {
            layer, rect, canvasWidth: frame.canvasWidth, canvasHeight: frame.canvasHeight, w, surfaces: frame.surfaces,
            people: frame.people, strength, time: item.time, clockMs: item.clock ?? Date.now(), detail: this.scale, dt,
            blend: (mode) => this.blend(mode),
          })
          continue
        }
        const state = this.state(key)
        if (layer.type === 'shapes') {
          // Objects check where they may sit against the whole canvas, so
          // an object across two outputs is shown or left out on both.
          const ph = Math.max(64, Math.round(PLACEMENT_WIDTH / aspect))
          this.updateMask(state, layer, frame, FULL_CANVAS, PLACEMENT_WIDTH, ph)
        } else {
          this.updateMask(state, layer, frame, frame.rect, w, h)
        }
        this.drawLayer(layer, state, { strength, count, frame, w, h, dt, pxPerHeight, time: item.time })
      }
    }

    gl.disable(gl.BLEND)
    gl.bindVertexArray(null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.forgetUnused(used)
    return this.target.tex
  }

  private state(key: string): LayerState {
    let state = this.states.get(key)
    if (!state) {
      state = { maskKey: '', maskTex: null, maskUsed: false, maskCanvas: null, memory: null, seenAt: 0 }
      this.states.set(key, state)
    }
    state.seenAt = performance.now()
    return state
  }

  /** Layers not drawn for a while (scene changed, layer deleted) give their memory back. */
  private forgetUnused(used: Set<string>) {
    this.countdown?.forget(used)
    const now = performance.now()
    for (const [key, state] of this.states) {
      if (!used.has(key) && now - state.seenAt > 5000) {
        this.dropState(state)
        this.states.delete(key)
      }
    }
  }

  private updateMask(state: LayerState, layer: SceneLayer, frame: SceneFrame, rect: SourceRect, w: number, h: number) {
    const key = maskKey(layer, this.surfacesKey, rect, w, h)
    if (key === state.maskKey) return
    state.maskKey = key
    const gl = this.gl
    const { canvas, used } = rasteriseLayerMask(layer, frame.surfaces, rect, w, h, state.maskCanvas ?? undefined)
    state.maskCanvas = canvas
    state.maskUsed = used
    if (!used) return
    if (!state.maskTex) {
      state.maskTex = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, state.maskTex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    }
    gl.bindTexture(gl.TEXTURE_2D, state.maskTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
  }

  private setCommon(
    p: Program,
    layer: SceneLayer,
    frame: SceneFrame,
    ctx: { w: number; h: number; pxPerHeight: number; count: number; strength: number; time: number },
  ) {
    const { w, h, pxPerHeight, count, strength, time } = ctx
    const gl = this.gl
    const r = frame.rect
    gl.uniform4f(this.u(p, 'uRect'), r.x, r.y, r.w, r.h)
    gl.uniform2f(this.u(p, 'uCanvas'), frame.canvasWidth, frame.canvasHeight)
    gl.uniform2f(this.u(p, 'uViewport'), w, h)
    gl.uniform1f(this.u(p, 'uPx'), pxPerHeight)
    gl.uniform1f(this.u(p, 'uTime'), time)
    gl.uniform3f(this.u(p, 'uColor'), ...hexToRgb(layer.color))
    gl.uniform3f(this.u(p, 'uColor2'), ...hexToRgb(layer.color2))
    gl.uniform4f(this.u(p, 'uDial'), layer.size, layer.speed, layer.amount, layer.fade)
    gl.uniform1f(this.u(p, 'uStrength'), Math.min(1, strength))
    gl.uniform1i(this.u(p, 'uStyle'), Math.max(0, KIND[layer.type].styles.findIndex((s) => s.id === layer.style)))
    gl.uniform1i(this.u(p, 'uSpots'), count)
    gl.uniform4fv(this.u(p, 'uSpot'), this.spotData)
    gl.uniform4fv(this.u(p, 'uMove'), this.moveData)
    gl.uniform1i(this.u(p, 'uChange'), Math.max(0, CHANGES.findIndex((c) => c.id === changeOf(layer))))
    gl.uniform1i(this.u(p, 'uNear'), Math.max(0, NEARS.findIndex((n) => n.id === nearOf(layer))))
    gl.uniform1f(this.u(p, 'uReach'), layer.reach ?? 0.5)
  }

  private bindTextures(p: Program, mask: WebGLTexture | null, maskOn: boolean, prev: WebGLTexture | null) {
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, mask ?? this.empty)
    gl.uniform1i(this.u(p, 'uMask'), 0)
    gl.uniform1i(this.u(p, 'uMaskOn'), maskOn ? 1 : 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, prev ?? this.empty)
    gl.uniform1i(this.u(p, 'uPrev'), 1)
    gl.activeTexture(gl.TEXTURE0)
  }

  private drawLayer(
    layer: SceneLayer,
    state: LayerState,
    ctx: {
      strength: number
      count: number
      frame: SceneFrame
      w: number
      h: number
      dt: number
      pxPerHeight: number
      time: number
    },
  ) {
    const gl = this.gl
    const { frame, w, h, dt } = ctx
    const target = this.target!
    // Trim and lights carry their shape in the mask image, not a cut-out.
    const shaped = layer.type === 'outline' || layer.type === 'lights'
    const mask = state.maskUsed || shaped ? state.maskTex : null
    const maskOn = state.maskUsed && !shaped

    if (layer.type === 'trails' || layer.type === 'reveal') {
      if (!state.memory) state.memory = [this.makeTarget(w, h), this.makeTarget(w, h)]
      const [read, write] = state.memory
      const update = layer.type === 'trails'
        ? this.program('trails:update', LAYER_VERTEX, () => TRAILS_UPDATE)
        : this.program('reveal:update', LAYER_VERTEX, () => REVEAL_UPDATE)
      gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo)
      gl.disable(gl.BLEND)
      gl.useProgram(update.program)
      this.setCommon(update, layer, frame, ctx)
      this.bindTextures(update, null, false, read.tex)
      gl.uniform1f(this.u(update, 'uDt'), dt)
      gl.uniform1f(this.u(update, 'uDecay'), this.decay(layer, dt))
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      state.memory = [write, read]
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
      gl.enable(gl.BLEND)
      const p = this.program(layer.type, LAYER_VERTEX, () => layerFragment(layer.type))
      gl.useProgram(p.program)
      this.setCommon(p, layer, frame, ctx)
      this.bindTextures(p, mask, maskOn, write.tex)
      this.blend(layer.type === 'reveal' ? 'normal' : layer.blend)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      return
    }

    if (layer.type === 'shapes') {
      const p = this.program('objects', OBJECTS_VERTEX, () => OBJECTS_FRAGMENT)
      gl.useProgram(p.program)
      this.setCommon(p, layer, frame, ctx)
      this.bindTextures(p, null, false, null)
      gl.activeTexture(gl.TEXTURE3)
      gl.bindTexture(gl.TEXTURE_2D, state.maskUsed ? state.maskTex : this.empty)
      gl.uniform1i(this.u(p, 'uPlace'), 3)
      gl.uniform1i(this.u(p, 'uPlaceOn'), state.maskUsed ? 1 : 0)
      gl.activeTexture(gl.TEXTURE0)
      gl.uniform1i(this.u(p, 'uMotion'), Math.max(0, MOTIONS.findIndex((m) => m.id === motionOf(layer))))
      // Placed by hand (a list, even an empty one) or spread over an area.
      const pins = layer.pins ? layer.pins.slice(0, MAX_PINS) : null
      if (pins && !pins.length) return
      gl.uniform1i(this.u(p, 'uPinCount'), pins?.length ?? 0)
      this.blend(layer.blend)
      if (pins) {
        this.pinData.fill(0)
        pins.forEach((pin, i) => this.pinData.set([pin.x, pin.y, pin.size, ((pin.rotation ?? 0) * Math.PI) / 180], i * 4))
        gl.uniform4fv(this.u(p, 'uPins'), this.pinData)
        gl.uniform2i(this.u(p, 'uGrid'), pins.length, 1)
        gl.drawArrays(gl.TRIANGLES, 0, pins.length * 6)
        return
      }
      const { cols, rows } = objectGrid(layer.size, frame.canvasWidth / Math.max(1, frame.canvasHeight))
      gl.uniform2i(this.u(p, 'uGrid'), cols, rows)
      gl.drawArrays(gl.TRIANGLES, 0, cols * rows * 6)
      return
    }

    if (layer.type === 'particles' || layer.type === 'falling') {
      const p = this.program('points', POINTS_VERTEX, () => POINTS_FRAGMENT)
      gl.useProgram(p.program)
      this.setCommon(p, layer, frame, ctx)
      this.bindTextures(p, mask, maskOn, null)
      gl.uniform1i(this.u(p, 'uKind'), layer.type === 'falling' ? 1 : 0)
      this.blend(layer.blend)
      const n = Math.round(layer.type === 'falling' ? 80 + layer.amount * 2400 : 60 + layer.amount * 1500)
      gl.drawArrays(gl.POINTS, 0, n)
      return
    }

    let picture: WebGLTexture | null = null
    if (layer.type === 'picture') {
      picture = layer.media_id != null ? this.picture(layer.media_id) : null
      if (!picture) return
    }
    const p = this.program(layer.type, LAYER_VERTEX, () => layerFragment(layer.type))
    gl.useProgram(p.program)
    this.setCommon(p, layer, frame, ctx)
    this.bindTextures(p, mask, maskOn, null)
    if (picture) {
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, picture)
      gl.uniform1i(this.u(p, 'uPicture'), 2)
      gl.activeTexture(gl.TEXTURE0)
    }
    this.blend(layer.blend)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  /** How much of last frame's trail or opening is kept this frame. */
  private decay(layer: SceneLayer, dt: number) {
    if (layer.type === 'trails') {
      const lasts = 0.3 + 8 * layer.fade ** 1.5
      return Math.exp((-dt * 3) / lasts)
    }
    if (layer.fade < 0.02) return 0
    const lasts = 0.3 + 20 * layer.fade ** 2
    return Math.exp((-dt * 3) / lasts)
  }

  dispose() {
    const gl = this.gl
    for (const state of this.states.values()) this.dropState(state)
    this.states.clear()
    this.dropTarget(this.target)
    this.target = null
    for (const { tex } of this.pictures.values()) gl.deleteTexture(tex)
    this.pictures.clear()
    this.countdown?.dispose()
    this.countdown = null
    for (const { program } of this.programs.values()) gl.deleteProgram(program)
    this.programs.clear()
    gl.deleteVertexArray(this.vao)
    gl.deleteTexture(this.empty)
  }
}
