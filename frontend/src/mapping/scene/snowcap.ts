/**
 * Snow on ledges: snow that settles on the window sills, on top of the
 * window and door frames, and along the roof, piling up over the first
 * minute or so of the cue and staying. Where someone comes near it melts
 * away (or glitters, or changes colour) and fills back in when they go.
 *
 * The ledges come from the traced house parts: every roughly level edge
 * of a window, door, wall or roof outline gets a lumpy drift sitting on
 * it (on a window's top edge it sits on the frame, on its bottom edge
 * inside, on the sill). Before the house is traced it lies along the
 * bottom of the picture. The edges go to the shader once; each pixel
 * then only checks the few edges right under it.
 */

import type { PersonSpot } from '../people'
import type { LayerBlend, SceneLayer, SourceRect, Surface, SurfaceKind } from '../types'
import { nearOf } from './catalog'
import { LAYER_VERTEX } from './shaders'

export const MAX_LEDGES = 32

const KINDS: Record<string, SurfaceKind[]> = {
  everywhere: ['wall', 'roof', 'window', 'door', 'other'],
  building: ['wall', 'roof', 'window', 'door', 'other'],
  outside: ['wall', 'roof', 'window', 'door', 'other'],
  walls: ['wall', 'other'],
  roof: ['roof'],
  windows: ['window'],
  doors: ['door'],
}

/**
 * The level-enough edges snow can sit on, left end first, in canvas heights
 * across and down (x0, y0, x1, y1). Snow sits above each.
 */
export function ledges(target: string, surfaces: Surface[], aspect: number): Array<[number, number, number, number]> {
  const kinds = KINDS[target] ?? KINDS.windows
  const found: Array<[number, number, number, number]> = []
  for (const s of surfaces) {
    if (!kinds.includes(s.kind) || s.points.length < 3) continue
    const pts = s.points.map(([x, y]) => [x * aspect, y] as [number, number])
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const len = Math.hypot(dx, dy)
      // Too short to hold any, or too steep for snow to stay.
      if (len < 0.01 || Math.abs(dy) > Math.abs(dx) * 0.85) continue
      found.push(dx > 0 ? [a[0], a[1], b[0], b[1]] : [b[0], b[1], a[0], a[1]])
    }
  }
  found.sort((p, q) => Math.hypot(q[2] - q[0], q[3] - q[1]) - Math.hypot(p[2] - p[0], p[3] - p[1]))
  if (!found.length) return [[0, 0.985, aspect, 0.985]]
  return found.slice(0, MAX_LEDGES)
}

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vC;
out vec4 outColor;
uniform vec2 uCanvas;
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uStrength;
uniform vec4 uLedge[${MAX_LEDGES}];
uniform int uLedges;
uniform float uDepth;
uniform float uLevel;
uniform int uSpots;
uniform vec4 uSpot[16];
uniform float uReach;
uniform int uNear;
uniform float uPx;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash(vec2(i, 3.1)), hash(vec2(i + 1.0, 3.1)), u);
}

void main() {
  float aspect = uCanvas.x / uCanvas.y;
  vec2 p = vec2(vC.x * aspect, vC.y);
  float aa = 1.5 / max(uPx, 1.0);
  // How near the nearest person is to this spot.
  float near = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= uSpots) break;
    vec2 s = vec2(uSpot[i].x * aspect, uSpot[i].y);
    float r = 0.03 + 0.2 * uReach + uSpot[i].z;
    near = max(near, uSpot[i].w * (1.0 - smoothstep(r * 0.4, r, distance(p, s))));
  }
  float best = 0.0;
  float shadeAt = 0.0;
  for (int i = 0; i < ${MAX_LEDGES}; i++) {
    if (i >= uLedges) break;
    vec4 e = uLedge[i];
    if (p.x < e.x || p.x > e.z) continue;
    float t = (p.x - e.x) / max(e.z - e.x, 1e-5);
    float ey = mix(e.y, e.w, t);
    float above = ey - p.y;
    if (above < -aa * 2.0 || above > uDepth * 1.6) continue;
    float span = e.z - e.x;
    // Lumpy, thickest in the middle, rounding off at both ends.
    float ends = smoothstep(0.0, min(span * 0.3, uDepth * 1.6), min(p.x - e.x, e.z - p.x));
    float lumps = 0.62 + 0.25 * noise(p.x / max(uDepth, 0.002) * 0.9 + float(i) * 7.0)
      + 0.13 * noise(p.x / max(uDepth, 0.002) * 3.1 + float(i) * 3.0);
    float hgt = uDepth * uLevel * lumps * mix(0.5, 1.0, ends) * ends;
    if (uNear == 1) hgt *= 1.0 - smoothstep(0.2, 0.9, near);
    // Nothing at all until there is some snow, not even a line.
    float a = smoothstep(-aa, aa, above + aa) * (1.0 - smoothstep(hgt - aa, hgt + aa, above))
      * smoothstep(0.0, aa * 2.0, hgt);
    if (a > best) {
      best = a;
      shadeAt = clamp(above / max(hgt, 1e-4), 0.0, 1.0);
    }
  }
  if (best <= 0.001) { outColor = vec4(0.0); return; }
  // Bright on top, a cool shadow underneath, and glints of frost.
  vec3 col = mix(uColor2, uColor, smoothstep(0.0, 0.75, shadeAt));
  vec2 cell = floor(p * uPx / 3.0);
  float h = hash(cell);
  float tw = pow(max(0.0, sin(uTime * (1.0 + h * 3.0) + h * 40.0)), 18.0);
  float glint = step(0.93, h) * tw * (uNear == 2 ? 1.0 + 3.0 * near : 1.0);
  col += vec3(1.0) * glint;
  if (uNear == 3) col = mix(col, uColor2 * 1.3, near);
  float k = clamp(uStrength, 0.0, 1.0) * best;
  outColor = vec4(min(col, vec3(2.0)) * k, k);
}`

export interface SnowcapDraw {
  layer: SceneLayer
  rect: SourceRect
  canvasWidth: number
  canvasHeight: number
  surfaces: Surface[]
  surfacesKey: string
  people: PersonSpot[]
  strength: number
  time: number
  /** Buffer pixels per canvas height. */
  pxPerHeight: number
  blend: (mode: LayerBlend) => void
}

/** Seconds the snow takes to settle, from the Speed dial. */
export function settleSeconds(speed: number): number {
  return 8 + 110 * (1 - speed) ** 2
}

export class SnowcapDrawer {
  private program: WebGLProgram
  private uniforms = new Map<string, WebGLUniformLocation | null>()
  private cache = new Map<string, { key: string; data: Float32Array; count: number; seenAt: number }>()
  private spots = new Float32Array(16 * 4)

  constructor(private gl: WebGL2RenderingContext) {
    const compile = (type: number, source: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, source)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Snow shader: ${gl.getShaderInfoLog(s)}`)
      return s
    }
    this.program = gl.createProgram()!
    for (const shader of [compile(gl.VERTEX_SHADER, LAYER_VERTEX), compile(gl.FRAGMENT_SHADER, FRAGMENT)]) {
      gl.attachShader(this.program, shader)
      gl.deleteShader(shader)
    }
    gl.linkProgram(this.program)
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(`Snow shader failed to link: ${gl.getProgramInfoLog(this.program)}`)
    }
  }

  private u(name: string) {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name))
    return this.uniforms.get(name)!
  }

  draw(key: string, d: SnowcapDraw) {
    const gl = this.gl
    const { layer } = d
    const aspect = d.canvasWidth / Math.max(1, d.canvasHeight)
    const cacheKey = `${layer.target}|${d.surfacesKey}|${aspect.toFixed(4)}`
    let entry = this.cache.get(key)
    if (!entry || entry.key !== cacheKey) {
      const list = ledges(layer.target, d.surfaces, aspect)
      const data = new Float32Array(MAX_LEDGES * 4)
      list.forEach((e, i) => data.set(e, i * 4))
      entry = { key: cacheKey, data, count: list.length, seenAt: 0 }
      this.cache.set(key, entry)
    }
    entry.seenAt = performance.now()
    const r = d.rect
    gl.useProgram(this.program)
    gl.uniform4f(this.u('uRect'), r.x, r.y, r.w, r.h)
    gl.uniform2f(this.u('uCanvas'), d.canvasWidth, d.canvasHeight)
    gl.uniform1f(this.u('uTime'), d.time)
    gl.uniform1f(this.u('uPx'), d.pxPerHeight)
    const rgb = (hex: string) => {
      const n = parseInt(hex.slice(1), 16)
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as const
    }
    gl.uniform3f(this.u('uColor'), ...rgb(layer.color))
    gl.uniform3f(this.u('uColor2'), ...rgb(layer.color2))
    gl.uniform1f(this.u('uStrength'), Math.min(1, d.strength))
    gl.uniform4fv(this.u('uLedge'), entry.data)
    gl.uniform1i(this.u('uLedges'), entry.count)
    gl.uniform1f(this.u('uDepth'), (0.01 + 0.07 * layer.amount) * (0.5 + layer.size))
    const level = Math.min(1, Math.max(0, d.time / settleSeconds(layer.speed)))
    gl.uniform1f(this.u('uLevel'), Math.sqrt(level))
    this.spots.fill(0)
    const people = d.people.slice(0, 16)
    people.forEach((p, i) => this.spots.set([p.x, p.y, p.radius, p.strength], i * 4))
    gl.uniform1i(this.u('uSpots'), people.length)
    gl.uniform4fv(this.u('uSpot'), this.spots)
    gl.uniform1f(this.u('uReach'), layer.reach ?? 0.5)
    // 1 melts, 2 glitters, 3 changes colour.
    const near = nearOf(layer)
    gl.uniform1i(this.u('uNear'), near === 'hide' ? 1 : near === 'light' ? 2 : near === 'colour' ? 3 : 0)
    d.blend(layer.blend)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  forget(used: Set<string>) {
    const now = performance.now()
    for (const [key, entry] of this.cache) if (!used.has(key) && now - entry.seenAt > 5000) this.cache.delete(key)
  }

  dispose() {
    this.cache.clear()
    this.gl.deleteProgram(this.program)
  }
}
