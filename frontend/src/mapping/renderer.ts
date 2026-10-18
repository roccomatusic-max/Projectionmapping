/**
 * WebGL2 renderer for one output.
 *
 * One draw call per frame: a dense warped mesh whose fragment shader maps
 * each point back into the show canvas, samples the live cue (and the
 * outgoing one during a crossfade), then applies colour, edge blend and
 * masks. Test patterns are drawn in canvas space so they line up across
 * projectors, which is what makes them useful for alignment.
 *
 * Scenes (reactive layers) are drawn first into a texture of their own by
 * the scene engine, then laid over the media in the same pass; a scene's
 * "distort" layer bends the media near people instead.
 *
 * Camera calibration patterns are the exception: a second, tiny program
 * draws them straight in the projector's pixels, ignoring the warp, since
 * what the camera decodes is which projector pixel lit which spot.
 */

import { buildDenseMesh } from './geometry'
import type { PersonSpot } from './people'
import { type SceneItem, SceneEngine } from './scene/engine'
import type { Fit, Interaction, Mask, Output, PatternSpec, Surface, TestPattern, Warp } from './types'

/** A tracked person as the shader sees them, in canvas fractions. */
export interface Spot {
  x: number
  y: number
  /** Radius in canvas heights. */
  radius: number
  /** 0..1, fades people in and out. */
  strength: number
}

export const MAX_SPOTS = 8

const INTERACTION_CODE: Record<Interaction, number> = { none: 0, spotlight: 1, ripple: 2 }

export interface TextureSource {
  element: HTMLVideoElement | HTMLImageElement
  width: number
  height: number
  fit: Fit
}

const FIT_CODE: Record<Fit, number> = { fill: 0, fit: 1, stretch: 2 }

/** Texture units of the output pass, in unit order. */
const UNITS: Array<['a' | 'b' | 'mask' | 'overlay', string]> = [
  ['a', 'uTexA'],
  ['b', 'uTexB'],
  ['mask', 'uMask'],
  ['overlay', 'uOverlay'],
]

const PATTERN_CODE: Record<TestPattern, number> = {
  none: 0,
  grid: 1,
  id: 2,
  white: 3,
  black: 4,
  red: 5,
  green: 6,
  blue: 7,
}

const VERTEX = `#version 300 es
in vec2 aPos;
in vec2 aUv;
out vec2 vUv;
out vec2 vOut;
void main() {
  vUv = aUv;
  vOut = vec2((aPos.x + 1.0) * 0.5, (1.0 - aPos.y) * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vOut;
out vec4 outColor;

uniform vec4 uSource;      // x, y, w, h in canvas fractions
uniform vec2 uCanvas;      // canvas size in pixels
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform vec2 uSizeA;
uniform vec2 uSizeB;
uniform int uFitA;
uniform int uFitB;
uniform int uHasA;
uniform int uHasB;
uniform float uMix;        // weight of A; B is the outgoing cue
uniform vec4 uBlendW;      // left, right, top, bottom
uniform vec4 uBlendG;
uniform vec4 uBlendC;
uniform sampler2D uMask;
uniform int uHasMask;
uniform sampler2D uOverlay;
uniform int uPattern;
uniform float uBright;
uniform float uGamma;
uniform vec3 uGain;
uniform int uBlack;
uniform int uInteract;     // 0 none, 1 spotlight, 2 ripple
uniform int uSpots;
uniform vec4 uSpot[8];     // x, y in canvas fractions; radius in canvas heights; strength
uniform float uTime;
uniform sampler2D uScene;  // premultiplied; alpha is how much media it covers
uniform int uHasScene;
uniform vec4 uDistort;     // style (0 ripple, 1 swirl, 2 bulge), size, amount, speed
uniform float uDistortOn;  // strength, 0 when no distort layer plays
uniform float uSceneTime;

vec2 mediaUv(vec2 c, vec2 size, int fit, out float inside) {
  vec2 m;
  if (fit == 2) {
    m = c;
  } else {
    vec2 px = c * uCanvas;
    float s = fit == 0 ? max(uCanvas.x / size.x, uCanvas.y / size.y)
                       : min(uCanvas.x / size.x, uCanvas.y / size.y);
    vec2 shown = size * s;
    m = (px - (uCanvas - shown) * 0.5) / shown;
  }
  inside = step(0.0, m.x) * step(m.x, 1.0) * step(0.0, m.y) * step(m.y, 1.0);
  return m;
}

float ramp(float t, float gamma, float curve) {
  t = clamp(t, 0.0, 1.0);
  float s = mix(t, t * t * (3.0 - 2.0 * t), curve);
  return pow(s, 1.0 / gamma);
}

float gridLine(float coord, float spacing, float width) {
  float d = abs(fract(coord / spacing + 0.5) - 0.5) * spacing;
  return 1.0 - smoothstep(0.0, width, d);
}

vec3 gridPattern(vec2 c) {
  vec2 px = c * uCanvas;
  vec2 fw = max(fwidth(px), vec2(1e-4)) * 1.2;
  float minor = uCanvas.y / 16.0;
  float major = minor * 4.0;
  vec3 col = vec3(0.05);
  // Alternate cell tint so neighbouring cells are told apart when aligning.
  vec2 cell = floor(px / minor);
  if (mod(cell.x + cell.y, 2.0) < 1.0) col = vec3(0.09);
  float lMinor = max(gridLine(px.x, minor, fw.x), gridLine(px.y, minor, fw.y));
  float lMajor = max(gridLine(px.x, major, fw.x * 2.0), gridLine(px.y, major, fw.y * 2.0));
  col = mix(col, vec3(0.45), lMinor);
  col = mix(col, vec3(1.0), lMajor);
  // Canvas centre cross and circle (the circle shows a wrong aspect ratio).
  vec2 centre = uCanvas * 0.5;
  float cross = max(1.0 - smoothstep(0.0, fw.x * 3.0, abs(px.x - centre.x)),
                    1.0 - smoothstep(0.0, fw.y * 3.0, abs(px.y - centre.y)));
  col = mix(col, vec3(1.0, 0.85, 0.1), cross);
  float r = length(px - centre);
  float ring = 1.0 - smoothstep(0.0, max(fw.x, fw.y) * 3.0, abs(r - uCanvas.y * 0.4));
  col = mix(col, vec3(0.2, 0.9, 0.4), ring);
  // Diagonals corner to corner.
  vec2 n = px / uCanvas;
  float diag = min(abs(n.x - n.y), abs(n.x - (1.0 - n.y))) * uCanvas.y;
  col = mix(col, vec3(0.2, 0.8, 1.0), 1.0 - smoothstep(0.0, fw.y * 2.5, diag));
  // Canvas border.
  vec2 edge = min(px, uCanvas - px);
  float border = 1.0 - smoothstep(fw.x * 4.0, fw.x * 6.0, min(edge.x, edge.y));
  col = mix(col, vec3(1.0, 0.2, 0.2), border);
  return col;
}

// Distance from a spot, in canvas heights, so circles stay round.
vec2 spotDelta(vec2 c, vec4 spot) {
  return (c - spot.xy) * vec2(uCanvas.x / uCanvas.y, 1.0);
}

void main() {
  if (uBlack == 1) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec2 c = uSource.xy + vUv * uSource.zw;
  vec3 col = vec3(0.0);

  if (uPattern == 0 && uInteract == 2) {
    // Rings spreading out from each person bend the image they pass.
    for (int i = 0; i < 8; i++) {
      if (i >= uSpots) break;
      vec2 d = spotDelta(c, uSpot[i]);
      float r = length(d);
      if (r < 1e-4) continue;
      float reach = uSpot[i].z * 3.0;
      float wave = sin(r * 60.0 - uTime * 5.0) * exp(-r / reach) * uSpot[i].w;
      c += (d / r) * wave * 0.01 * vec2(uCanvas.y / uCanvas.x, 1.0);
    }
  }

  if (uPattern == 0 && uDistortOn > 0.0) {
    // A scene's distort layer: the media bends around each person.
    vec2 back = vec2(uCanvas.y / uCanvas.x, 1.0);
    for (int i = 0; i < 8; i++) {
      if (i >= uSpots) break;
      vec4 s = uSpot[i];
      vec2 d = spotDelta(c, s);
      float r = length(d);
      float reach = s.z * mix(0.8, 4.0, uDistort.y);
      float w = s.w * uDistortOn;
      if (uDistort.x < 0.5) {
        if (r < 1e-4) continue;
        float wave = sin(r * mix(80.0, 25.0, uDistort.y) - uSceneTime * mix(1.5, 9.0, uDistort.w)) * exp(-r / reach);
        c += (d / r) * wave * w * mix(0.003, 0.03, uDistort.z) * back;
      } else if (uDistort.x < 1.5) {
        float ang = mix(0.5, 5.0, uDistort.z) * w * exp(-pow(r / reach, 2.0))
                  * (1.0 + 0.3 * sin(uSceneTime * mix(0.5, 4.0, uDistort.w)));
        float cs = cos(ang);
        float sn = sin(ang);
        c = s.xy + mat2(cs, -sn, sn, cs) * d * back;
      } else {
        float k = 1.0 - mix(0.15, 0.7, uDistort.z) * w * exp(-pow(r / reach, 2.0));
        c = s.xy + d * k * back;
      }
    }
  }

  if (uPattern == 0) {
    float inA = 0.0;
    float inB = 0.0;
    vec3 a = vec3(0.0);
    vec3 b = vec3(0.0);
    if (uHasA == 1) {
      vec2 m = mediaUv(c, uSizeA, uFitA, inA);
      a = texture(uTexA, m).rgb * inA;
    }
    if (uHasB == 1) {
      vec2 m = mediaUv(c, uSizeB, uFitB, inB);
      b = texture(uTexB, m).rgb * inB;
    }
    col = a * uMix + b * (1.0 - uMix);
    if (uHasScene == 1) {
      // The scene buffer's rows run bottom up; vUv runs top down.
      vec4 sc = texture(uScene, vec2(vUv.x, 1.0 - vUv.y));
      col = col * (1.0 - sc.a) + sc.rgb;
    }
    if (uInteract == 1) {
      // Dim everywhere but around people, as if they carried a lamp.
      float light = 0.15;
      for (int i = 0; i < 8; i++) {
        if (i >= uSpots) break;
        float r = length(spotDelta(c, uSpot[i]));
        float lit = 1.0 - smoothstep(uSpot[i].z * 0.45, uSpot[i].z, r);
        light = max(light, mix(0.15, 1.0, lit * uSpot[i].w));
      }
      col *= light;
    }
  } else if (uPattern == 1) {
    col = gridPattern(c);
  } else if (uPattern == 2) {
    col = gridPattern(c) * 0.35;
    vec4 o = texture(uOverlay, vUv);
    col = mix(col, o.rgb, o.a);
  } else if (uPattern == 3) {
    col = vec3(1.0);
  } else if (uPattern == 5) {
    col = vec3(1.0, 0.0, 0.0);
  } else if (uPattern == 6) {
    col = vec3(0.0, 1.0, 0.0);
  } else if (uPattern == 7) {
    col = vec3(0.0, 0.0, 1.0);
  }

  col = pow(max(col, vec3(0.0)), vec3(1.0 / uGamma)) * uGain * uBright;

  float f = 1.0;
  if (uBlendW.x > 0.0) f *= ramp(vUv.x / uBlendW.x, uBlendG.x, uBlendC.x);
  if (uBlendW.y > 0.0) f *= ramp((1.0 - vUv.x) / uBlendW.y, uBlendG.y, uBlendC.y);
  if (uBlendW.z > 0.0) f *= ramp(vUv.y / uBlendW.z, uBlendG.z, uBlendC.z);
  if (uBlendW.w > 0.0) f *= ramp((1.0 - vUv.y) / uBlendW.w, uBlendG.w, uBlendC.w);
  col *= f;

  if (uHasMask == 1) col *= texture(uMask, vOut).r;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`

/** Full-screen triangle; no buffers needed. */
const PATTERN_VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

/**
 * Black, white, or one bit of the Gray code of each projector column or
 * row. Gray code because neighbouring columns differ in one bit only, so a
 * camera pixel straddling two stripes is wrong by one column at most.
 */
const PATTERN_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uViewport;
uniform vec2 uRaster;      // the output's configured resolution
uniform int uKind;         // 0 black, 1 white, 2 gray code
uniform int uAxis;         // 0 columns, 1 rows
uniform int uBit;
uniform int uInverse;
out vec4 outColor;
void main() {
  float v = 0.0;
  if (uKind == 1) {
    v = 1.0;
  } else if (uKind == 2) {
    vec2 f = vec2(gl_FragCoord.x / uViewport.x, 1.0 - gl_FragCoord.y / uViewport.y);
    float coord = uAxis == 0 ? f.x * uRaster.x : f.y * uRaster.y;
    uint p = uint(clamp(floor(coord), 0.0, 65535.0));
    uint g = p ^ (p >> 1u);
    v = float((g >> uint(uBit)) & 1u);
    if (uInverse == 1) v = 1.0 - v;
  }
  outColor = vec4(vec3(v), 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Shader failed to compile: ${log}`)
  }
  return shader
}

function maskKey(masks: Mask[], w: number, h: number) {
  return JSON.stringify([masks, w, h])
}

/** Draw the masks into an alpha image: white shows, black hides. */
export function rasteriseMasks(masks: Mask[], canvas: HTMLCanvasElement, outputWidth: number) {
  const ctx = canvas.getContext('2d')!
  const { width: w, height: h } = canvas
  ctx.save()
  ctx.filter = 'none'
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  const scale = w / Math.max(1, outputWidth)
  for (const mask of masks) {
    if (!mask.enabled || mask.points.length < 3) continue
    ctx.filter = mask.feather > 0 ? `blur(${(mask.feather * scale) / 2}px)` : 'none'
    ctx.fillStyle = '#000'
    ctx.beginPath()
    if (mask.invert) {
      // Everything outside the polygon goes dark: a big rectangle with the
      // polygon cut out of it under the even-odd rule.
      ctx.rect(-w, -h, w * 3, h * 3)
    }
    mask.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * w, y * h) : ctx.lineTo(x * w, y * h)))
    ctx.closePath()
    ctx.fill(mask.invert ? 'evenodd' : 'nonzero')
  }
  ctx.restore()
}

function drawIdOverlay(canvas: HTMLCanvasElement, output: Output) {
  const ctx = canvas.getContext('2d')!
  const { width: w, height: h } = canvas
  ctx.clearRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(56, 189, 248, 1)'
  ctx.lineWidth = Math.max(4, w / 200)
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth)
  ctx.beginPath()
  ctx.moveTo(w / 2, h * 0.3)
  ctx.lineTo(w / 2, h * 0.7)
  ctx.moveTo(w * 0.5 - h * 0.2, h / 2)
  ctx.lineTo(w * 0.5 + h * 0.2, h / 2)
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `600 ${Math.round(h / 7)}px Inter, system-ui, sans-serif`
  ctx.fillText(output.name, w / 2, h * 0.2)
  ctx.font = `400 ${Math.round(h / 22)}px Inter, system-ui, sans-serif`
  ctx.fillText(`${output.width} × ${output.height}`, w / 2, h * 0.82)
  // Corner labels show orientation: a mirrored or rotated image is obvious.
  ctx.font = `600 ${Math.round(h / 18)}px Inter, system-ui, sans-serif`
  const pad = h / 12
  ctx.fillText('TL', pad * 1.2, pad)
  ctx.fillText('TR', w - pad * 1.2, pad)
  ctx.fillText('BR', w - pad * 1.2, h - pad)
  ctx.fillText('BL', pad * 1.2, h - pad)
}

export class OutputRenderer {
  private gl: WebGL2RenderingContext
  private program!: WebGLProgram
  private patternProgram!: WebGLProgram
  private patternVao!: WebGLVertexArrayObject
  private vao!: WebGLVertexArrayObject
  private posBuffer!: WebGLBuffer
  private uvBuffer!: WebGLBuffer
  private indexBuffer!: WebGLBuffer
  private indexCount = 0
  private textures: Record<'a' | 'b' | 'mask' | 'overlay', WebGLTexture> = {} as never
  private uniforms = new Map<string, WebGLUniformLocation | null>()
  private sources: Record<'a' | 'b', TextureSource | null> = { a: null, b: null }
  private uploaded: Record<'a' | 'b', HTMLVideoElement | HTMLImageElement | null> = { a: null, b: null }
  private output: Output | null = null
  private canvasSize: [number, number] = [1920, 1080]
  private warpKey = ''
  private maskKeyValue = ''
  /** The warp and masks last checked; setOutput runs every frame, so the
   * JSON keys are only rebuilt when the editor hands over new objects. */
  private warpChecked: Warp | null = null
  private masksChecked: Mask[] | null = null
  private spotData = new Float32Array(MAX_SPOTS * 4)
  private overlayKey = ''
  private maskCanvas = document.createElement('canvas')
  private overlayCanvas = document.createElement('canvas')
  private lost = false
  private scenes: SceneEngine | null = null
  /** Scene detail kept across a lost and restored GL context. */
  private sceneQuality = 0

  constructor(private canvas: HTMLCanvasElement, private maxMaskSize = 2048) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, premultipliedAlpha: false })
    if (!gl) throw new Error('This browser has no WebGL2; use a current Chrome, Edge or Safari.')
    this.gl = gl
    canvas.addEventListener('webglcontextlost', this.onLost)
    canvas.addEventListener('webglcontextrestored', this.onRestored)
    this.init()
  }

  private onLost = (event: Event) => {
    event.preventDefault()
    this.lost = true
  }

  private onRestored = () => {
    this.lost = false
    // The old engine's GL objects went with the context.
    this.scenes = null
    this.warpKey = ''
    this.maskKeyValue = ''
    this.warpChecked = null
    this.masksChecked = null
    this.overlayKey = ''
    this.uploaded = { a: null, b: null }
    this.init()
    if (this.output) this.setOutput(this.output, ...this.canvasSize)
  }

  private link(vertex: string, fragment: string, attributes: string[] = []) {
    const gl = this.gl
    const program = gl.createProgram()!
    for (const shader of [compile(gl, gl.VERTEX_SHADER, vertex), compile(gl, gl.FRAGMENT_SHADER, fragment)]) {
      gl.attachShader(program, shader)
      // Freed with the program; otherwise each renderer left two behind.
      gl.deleteShader(shader)
    }
    attributes.forEach((name, index) => gl.bindAttribLocation(program, index, name))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Shader failed to link: ${gl.getProgramInfoLog(program)}`)
    }
    return program
  }

  private init() {
    const gl = this.gl
    this.program = this.link(VERTEX, FRAGMENT, ['aPos', 'aUv'])
    this.patternProgram = this.link(PATTERN_VERTEX, PATTERN_FRAGMENT)
    this.patternVao = gl.createVertexArray()!
    this.uniforms.clear()

    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    this.posBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this.uvBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0)
    this.indexBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
    gl.bindVertexArray(null)

    for (const name of ['a', 'b', 'mask', 'overlay'] as const) {
      const texture = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
      this.textures[name] = texture
    }
  }

  private u(name: string, program = this.program) {
    const key = program === this.program ? name : `pattern:${name}`
    if (!this.uniforms.has(key)) this.uniforms.set(key, this.gl.getUniformLocation(program, name))
    return this.uniforms.get(key)!
  }

  setOutput(output: Output, canvasWidth: number, canvasHeight: number) {
    this.output = output
    this.canvasSize = [canvasWidth, canvasHeight]
    if (this.lost) return
    const gl = this.gl

    const warpKey = output.warp === this.warpChecked ? this.warpKey : JSON.stringify(output.warp)
    this.warpChecked = output.warp
    if (warpKey !== this.warpKey) {
      const mesh = buildDenseMesh(output.warp)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.DYNAMIC_DRAW)
      gl.bindVertexArray(this.vao)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.DYNAMIC_DRAW)
      gl.bindVertexArray(null)
      this.indexCount = mesh.indices.length
      this.warpKey = warpKey
    }

    const scale = Math.min(1, this.maxMaskSize / Math.max(output.width, output.height))
    const mw = Math.max(1, Math.round(output.width * scale))
    const mh = Math.max(1, Math.round(output.height * scale))
    const key = output.masks === this.masksChecked && mw === this.maskCanvas.width && mh === this.maskCanvas.height
      ? this.maskKeyValue
      : maskKey(output.masks, mw, mh)
    this.masksChecked = output.masks
    if (key !== this.maskKeyValue) {
      this.maskCanvas.width = mw
      this.maskCanvas.height = mh
      rasteriseMasks(output.masks, this.maskCanvas, output.width)
      gl.bindTexture(gl.TEXTURE_2D, this.textures.mask)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.maskCanvas)
      this.maskKeyValue = key
    }

    const overlayKey = output.test_pattern === 'id' ? JSON.stringify([output.name, mw, mh]) : ''
    if (overlayKey && overlayKey !== this.overlayKey) {
      this.overlayCanvas.width = mw
      this.overlayCanvas.height = mh
      drawIdOverlay(this.overlayCanvas, output)
      gl.bindTexture(gl.TEXTURE_2D, this.textures.overlay)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.overlayCanvas)
    }
    this.overlayKey = overlayKey
  }

  /** ``a`` is the live cue, ``b`` the one fading out. */
  setSource(slot: 'a' | 'b', source: TextureSource | null) {
    this.sources[slot] = source
  }

  private upload(slot: 'a' | 'b'): boolean {
    const source = this.sources[slot]
    if (!source) return false
    const { element } = source
    const isVideo = element instanceof HTMLVideoElement
    if (isVideo && element.readyState < 2) return this.uploaded[slot] === element
    // A broken image is complete but has no pixels; texImage2D rejects it and
    // the slot would keep showing the previous cue's last frame.
    if (!isVideo && !((element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth)) return false
    if (isVideo || this.uploaded[slot] !== element) {
      const gl = this.gl
      gl.bindTexture(gl.TEXTURE_2D, this.textures[slot])
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, element)
      this.uploaded[slot] = element
    }
    return true
  }

  /** A calibration frame in the projector's own pixels; null is black. */
  renderPattern(pattern: PatternSpec | null) {
    const output = this.output
    if (this.lost) return
    const gl = this.gl
    const { canvas } = this
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (!pattern || pattern.kind === 'black') return
    const p = this.patternProgram
    gl.useProgram(p)
    gl.uniform2f(this.u('uViewport', p), canvas.width, canvas.height)
    gl.uniform2f(this.u('uRaster', p), output?.width ?? canvas.width, output?.height ?? canvas.height)
    gl.uniform1i(this.u('uKind', p), pattern.kind === 'white' ? 1 : 2)
    gl.uniform1i(this.u('uAxis', p), pattern.axis === 'y' ? 1 : 0)
    gl.uniform1i(this.u('uBit', p), pattern.bit)
    gl.uniform1i(this.u('uInverse', p), pattern.inverse ? 1 : 0)
    gl.bindVertexArray(this.patternVao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  }

  /** How much of the output's resolution scenes are drawn at, 0..1. */
  get sceneScale() {
    return this.scenes?.scale ?? 1
  }

  /** Draw scenes at less detail (a slow computer); false when already lowest. */
  lowerSceneQuality(): boolean {
    if (!this.scenes?.lowerQuality()) return false
    this.sceneQuality = this.scenes.quality
    return true
  }

  render({
    mix = 1,
    blackout = false,
    interaction = 'none',
    spots,
    time = 0,
    scenes = [],
    people = [],
    surfaces = [],
    frameTime = performance.now() / 1000,
  }: {
    mix?: number
    blackout?: boolean
    interaction?: Interaction
    /** People for the cue's legacy people effect; defaults to ``people``. */
    spots?: Spot[]
    time?: number
    /** Scenes playing now, each with its own clock (seconds since its cue). */
    scenes?: SceneItem[]
    people?: PersonSpot[]
    surfaces?: Surface[]
    /** Any steady clock, seconds; scenes use it for how long a frame took. */
    frameTime?: number
  } = {}) {
    const output = this.output
    if (this.lost || !output) return
    const gl = this.gl
    const { canvas } = this
    const [cw, ch] = this.canvasSize

    // Scenes draw into their own buffer before the output pass.
    let sceneTex: WebGLTexture | null = null
    if (scenes.length && output.enabled && !blackout && output.test_pattern === 'none') {
      if (!this.scenes) {
        this.scenes = new SceneEngine(gl)
        this.scenes.quality = this.sceneQuality
      }
      sceneTex = this.scenes.render({
        items: scenes,
        rect: output.source,
        canvasWidth: cw,
        canvasHeight: ch,
        width: canvas.width,
        height: canvas.height,
        surfaces,
        people,
        time: frameTime,
      })
    } else if (this.scenes) {
      this.scenes.distort = null
    }
    const distort = scenes.length ? this.scenes?.distort ?? null : null

    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (!output.enabled) return

    const hasA = this.upload('a')
    const hasB = mix < 1 && this.upload('b')

    gl.useProgram(this.program)
    const s = output.source
    gl.uniform4f(this.u('uSource'), s.x, s.y, s.w, s.h)
    gl.uniform2f(this.u('uCanvas'), cw, ch)

    UNITS.forEach(([name, uniform], unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, this.textures[name])
      gl.uniform1i(this.u(uniform), unit)
    })
    const a = this.sources.a
    const b = this.sources.b
    gl.uniform1i(this.u('uHasA'), hasA ? 1 : 0)
    gl.uniform1i(this.u('uHasB'), hasB ? 1 : 0)
    gl.uniform2f(this.u('uSizeA'), a?.width || cw, a?.height || ch)
    gl.uniform2f(this.u('uSizeB'), b?.width || cw, b?.height || ch)
    gl.uniform1i(this.u('uFitA'), FIT_CODE[a?.fit ?? 'fill'])
    gl.uniform1i(this.u('uFitB'), FIT_CODE[b?.fit ?? 'fill'])
    gl.uniform1f(this.u('uMix'), hasB ? mix : 1)

    const { left, right, top, bottom } = output.blend
    gl.uniform4f(this.u('uBlendW'), left.width, right.width, top.width, bottom.width)
    gl.uniform4f(this.u('uBlendG'), left.gamma, right.gamma, top.gamma, bottom.gamma)
    gl.uniform4f(this.u('uBlendC'), left.curve, right.curve, top.curve, bottom.curve)
    gl.uniform1i(this.u('uHasMask'), output.masks.some((m) => m.enabled) ? 1 : 0)
    gl.uniform1i(this.u('uPattern'), PATTERN_CODE[output.test_pattern] ?? 0)
    const c = output.color
    gl.uniform1f(this.u('uBright'), c.brightness)
    gl.uniform1f(this.u('uGamma'), c.gamma)
    gl.uniform3f(this.u('uGain'), c.red, c.green, c.blue)
    // A test pattern stays visible through a blackout: aligning happens
    // with the show stopped.
    gl.uniform1i(this.u('uBlack'), blackout && output.test_pattern === 'none' ? 1 : 0)

    const shown = spots ?? people
    const count = Math.min(shown.length, MAX_SPOTS)
    const packed = this.spotData
    packed.fill(0)
    for (let i = 0; i < count; i++) {
      const spot = shown[i]
      packed[i * 4] = spot.x
      packed[i * 4 + 1] = spot.y
      packed[i * 4 + 2] = spot.radius
      packed[i * 4 + 3] = spot.strength
    }
    gl.uniform1i(this.u('uInteract'), INTERACTION_CODE[interaction] ?? 0)
    gl.uniform1i(this.u('uSpots'), count)
    gl.uniform4fv(this.u('uSpot'), packed)
    gl.uniform1f(this.u('uTime'), time)

    gl.activeTexture(gl.TEXTURE4)
    gl.bindTexture(gl.TEXTURE_2D, sceneTex ?? this.textures.mask)
    gl.uniform1i(this.u('uScene'), 4)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1i(this.u('uHasScene'), sceneTex ? 1 : 0)
    gl.uniform4f(this.u('uDistort'), distort?.style ?? 0, distort?.size ?? 0, distort?.amount ?? 0, distort?.speed ?? 0)
    gl.uniform1f(this.u('uDistortOn'), distort ? Math.min(1, this.scenes!.distortStrength) : 0)
    gl.uniform1f(this.u('uSceneTime'), scenes[0]?.time ?? 0)

    gl.bindVertexArray(this.vao)
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0)
    gl.bindVertexArray(null)
  }

  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this.onLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored)
    const gl = this.gl
    if (!this.lost) this.scenes?.dispose()
    this.scenes = null
    Object.values(this.textures).forEach((t) => gl.deleteTexture(t))
    gl.deleteBuffer(this.posBuffer)
    gl.deleteBuffer(this.uvBuffer)
    gl.deleteBuffer(this.indexBuffer)
    gl.deleteVertexArray(this.vao)
    gl.deleteVertexArray(this.patternVao)
    gl.deleteProgram(this.program)
    gl.deleteProgram(this.patternProgram)
  }
}
