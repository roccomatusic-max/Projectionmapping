/**
 * GLSL for scene layers.
 *
 * Every layer is drawn in canvas space (so layers line up across
 * projectors) into the scene buffer, which covers the output's slice of the
 * canvas. Most layers are one full-screen pass: a shared header with the
 * people, the dials and noise helpers, a per-type body returning straight
 * colour and coverage, and a footer that applies the target mask and the
 * layer's strength. Particles and falling things are points whose
 * positions are worked out on the GPU from their number and the time, so
 * they cost no CPU and come out the same on every output.
 *
 * Objects (the "shapes" type) are quads, six vertices each, placed on a
 * grid over the whole canvas; each one works out on the GPU how it moves,
 * changes, and reacts to the nearest person.
 */

import { CHANGES, KIND, MOTIONS, NEARS } from './catalog'

function defines(prefix: string, ids: string[]) {
  return ids.map((id, i) => `#define ${prefix}_${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')} ${i}`).join('\n')
}

/** Motion, change and near choices by number, in catalog order. */
const CHOICES = [
  defines('M', MOTIONS.map((m) => m.id)),
  defines('C', CHANGES.map((c) => c.id)),
  defines('N', NEARS.map((n) => n.id)),
].join('\n')

/** Object styles by number, in catalog order. */
const OBJECT_STYLES = defines('S', KIND.shapes.styles.map((s) => s.id))

export const LAYER_VERTEX = `#version 300 es
uniform vec4 uRect;
out vec2 vUv;
out vec2 vC;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = vec2(p.x, 1.0 - p.y);
  vC = uRect.xy + vUv * uRect.zw;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const COMMON = `
${CHOICES}
uniform vec4 uRect;
uniform vec2 uCanvas;
uniform vec2 uViewport;
uniform float uPx;
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uColor2;
uniform vec4 uDial;
uniform float uStrength;
uniform int uStyle;
uniform int uSpots;
uniform vec4 uSpot[16];
uniform vec4 uMove[16];
uniform sampler2D uMask;
uniform int uMaskOn;
uniform sampler2D uPrev;
uniform int uChange;
uniform int uNear;
uniform float uReach;

vec2 toH(vec2 c) { return vec2(c.x * uCanvas.x / uCanvas.y, c.y); }
float hash1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + 17.31)); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + 11.7;
    a *= 0.5;
  }
  return v;
}
// Distance to the nearest cell edge, and a random number for the cell.
vec2 voronoi(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  vec2 mg = vec2(0.0);
  vec2 mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + hash2(n + g) - f;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  md = 8.0;
  for (int j = -2; j <= 2; j++)
  for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 r = g + hash2(n + g) - f;
    if (dot(mr - r, mr - r) > 0.00001) md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  return vec2(md, hash(n + mg));
}
float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
// How strongly the nearest person is felt at p (height units): 1 close
// by, 0 beyond the layer's reach; also the direction away from them and
// how far they are.
float nearAt(vec2 p, out vec2 away, out float dist) {
  float k = 0.0;
  away = vec2(0.0, -1.0);
  dist = 1e9;
  float reach = mix(0.05, 0.6, uReach);
  for (int i = 0; i < 16; i++) {
    if (i >= uSpots) break;
    vec4 s = uSpot[i];
    vec2 d = p - toH(s.xy);
    float dd = length(d);
    float R = s.z * 0.6 + reach;
    float w = s.w * (1.0 - smoothstep(R * 0.3, R, dd));
    if (w > k) {
      k = w;
      away = dd > 1e-4 ? d / dd : vec2(0.0, -1.0);
      dist = dd;
    }
  }
  return k;
}
`

const HEADER = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vC;
out vec4 outColor;
${COMMON}`

// Every area or line layer can change by itself and answer people where
// they stand: lit up, recoloured, shown or hidden around them.
const FOOTER = `
void main() {
  vec4 l = layer();
  float m = uMaskOn == 1 ? texture(uMask, vUv).r : 1.0;
  float a = clamp(l.a, 0.0, 1.0) * uStrength * m;
  vec3 c = max(l.rgb, vec3(0.0));
  if (uChange != C_NONE || uNear != N_NONE) {
    vec2 p = toH(vC);
    float rate = mix(0.4, 4.0, uDial.y);
    float ph = hash(floor(p * 6.0)) * 6.2832;
    float top = max(max(c.r, c.g), c.b);
    if (uChange == C_PULSE) c *= 0.55 + 0.45 * sin(uTime * rate * 1.5);
    else if (uChange == C_TWINKLE) c *= 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * rate * 2.5 + ph), 2.0);
    else if (uChange == C_COLOUR) c = mix(c, uColor2 * (0.4 + 0.8 * top), 0.5 + 0.5 * sin(uTime * rate * 0.6 + p.x * 2.0));
    else if (uChange == C_FLICKER) c *= 0.7 + 0.3 * noise(vec2(uTime * rate * 6.0, ph));
    if (uNear != N_NONE) {
      vec2 away;
      float dist;
      float k = nearAt(p, away, dist);
      if (uNear == N_LIGHT) c *= 1.0 + 1.6 * k;
      else if (uNear == N_COLOUR) c = mix(c, uColor2 * (0.5 + 0.7 * top), k);
      else if (uNear == N_APPEAR) a *= k;
      else if (uNear == N_HIDE) a *= 1.0 - k;
    }
  }
  outColor = vec4(c * a, a);
}`

const BODIES: Record<string, string> = {
  glow: `
vec4 layer() {
  vec2 p = toH(vC);
  vec3 acc = vec3(0.0);
  float cov = 0.0;
  float soft = mix(0.5, 2.0, uDial.w);
  for (int i = 0; i < 16; i++) {
    if (i >= uSpots) break;
    vec4 s = uSpot[i];
    vec4 m = uMove[i];
    vec2 d = p - toH(s.xy);
    float r = s.z * mix(0.5, 3.0, uDial.x) * (1.0 + 0.15 * sin(uTime * mix(0.5, 6.0, uDial.y) + m.w * 6.28));
    float dd = length(d);
    float f;
    if (uStyle == 1) {
      f = exp(-pow((dd - r * 0.8) / (r * 0.16 * soft), 2.0)) + 0.3 * exp(-dd * dd / (r * r * 0.12));
    } else if (uStyle == 2) {
      vec2 q = d;
      q.y = q.y < 0.0 ? q.y * 0.45 : q.y * 1.5;
      float n = noise(vec2(q.x * 7.0 / r, q.y * 3.0 / r + uTime * mix(1.5, 6.0, uDial.y)) + m.w * 9.0);
      float qd = length(q) * (0.7 + 0.6 * n);
      f = exp(-qd * qd / (r * r * 0.45 * soft));
    } else {
      f = exp(-dd * dd / (r * r * 0.45 * soft));
    }
    f *= s.w;
    acc += mix(uColor2, uColor, exp(-dd * dd / (r * r * 0.12))) * f;
    cov = max(cov, f);
  }
  return vec4(acc * mix(0.3, 2.0, uDial.z) / max(cov, 1e-3), cov);
}`,

  ripples: `
vec4 layer() {
  vec2 p = toH(vC);
  vec3 acc = vec3(0.0);
  float cov = 0.0;
  float reach = mix(0.15, 1.2, uDial.x);
  float spd = mix(0.05, 0.6, uDial.y);
  float w = mix(0.004, 0.035, uDial.w);
  for (int i = 0; i < 16; i++) {
    if (i >= uSpots) break;
    vec4 s = uSpot[i];
    vec4 m = uMove[i];
    float dd = length(p - toH(s.xy));
    float v;
    if (uStyle == 1) {
      float R = fract(uTime * spd / reach + m.w) * reach;
      v = exp(-pow((dd - R) / w, 2.0)) * (1.0 - R / reach);
    } else if (uStyle == 2) {
      v = (0.5 + 0.5 * sin((dd - uTime * spd) * 60.0 / mix(1.0, 3.0, uDial.x))) * exp(-dd / reach * 2.5) * 0.7;
    } else {
      float sp = reach * 0.22;
      float x = mod(dd - uTime * spd + m.w * sp, sp);
      v = exp(-pow((x - sp * 0.5) / w, 2.0)) * smoothstep(reach, reach * 0.3, dd);
    }
    v *= s.w * smoothstep(0.0, s.z * 0.4, dd + s.z * 0.1);
    acc += mix(uColor, uColor2, clamp(dd / reach, 0.0, 1.0)) * v;
    cov = max(cov, v);
  }
  return vec4(acc * mix(0.3, 2.0, uDial.z) / max(cov, 1e-3), cov);
}`,

  trails: `
vec4 layer() {
  vec4 st = texture(uPrev, gl_FragCoord.xy / uViewport);
  return vec4(st.rgb / max(st.a, 1e-3) * mix(0.4, 1.8, uDial.z), st.a);
}`,

  reveal: `
vec4 layer() {
  float open = texture(uPrev, gl_FragCoord.xy / uViewport).r;
  return vec4(uColor, uDial.z * (1.0 - open));
}`,

  shadows: `
float body(vec2 q, float W, float swing) {
  float head = length(q - vec2(0.0, -1.45 * W)) - 0.42 * W;
  float torso = sdSegment(q, vec2(0.0, -0.85 * W), vec2(0.0, 0.45 * W)) - 0.55 * W;
  float legL = sdSegment(q, vec2(-0.25 * W, 0.5 * W), vec2(-0.3 * W + swing, 1.9 * W)) - 0.22 * W;
  float legR = sdSegment(q, vec2(0.25 * W, 0.5 * W), vec2(0.3 * W - swing, 1.9 * W)) - 0.22 * W;
  float armL = sdSegment(q, vec2(-0.55 * W, -0.7 * W), vec2(-0.75 * W - swing * 0.6, 0.35 * W)) - 0.17 * W;
  float armR = sdSegment(q, vec2(0.55 * W, -0.7 * W), vec2(0.75 * W + swing * 0.6, 0.35 * W)) - 0.17 * W;
  return min(min(min(head, torso), min(legL, legR)), min(armL, armR));
}
vec4 layer() {
  vec2 p = toH(vC);
  float cov = 0.0;
  float glow = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= uSpots) break;
    vec4 s = uSpot[i];
    vec4 m = uMove[i];
    float W = s.z * mix(0.35, 1.3, uDial.x);
    vec2 q = p - toH(s.xy);
    float swing = sin(uTime * 7.0 + m.w * 6.28) * min(1.0, length(m.xy) * 5.0) * 0.3 * W;
    if (uStyle == 2) {
      // A long shadow thrown up the wall from the feet.
      vec2 feet = vec2(0.0, 1.9 * W);
      vec2 r = q - feet;
      r.x -= r.y * 0.3;
      q = r / 2.8 + feet;
    }
    float d = body(q, W, swing);
    float soft = W * mix(0.03, 0.5, uDial.w);
    if (uStyle == 1) {
      // A bright rim around the body, faintly filled, so the figure reads.
      float rim = W * mix(0.02, 0.18, uDial.w);
      glow = max(glow, (exp(-abs(d) / rim) * 0.85 + 0.15 * (1.0 - smoothstep(-rim, 0.0, d))) * s.w);
    } else {
      cov = max(cov, (1.0 - smoothstep(-soft, soft, d)) * s.w);
    }
  }
  if (uStyle == 1) return vec4(mix(uColor2, uColor, 0.5) * mix(0.4, 1.3, uDial.z), min(1.0, glow));
  return vec4(uColor, cov * uDial.z);
}`,

  wash: `
vec4 layer() {
  vec2 p = toH(vC);
  float sc = mix(0.3, 3.0, uDial.x);
  float t = uTime * mix(0.02, 0.6, uDial.y);
  vec3 c = uColor;
  if (uStyle == 1) {
    float g = 0.5 + 0.5 * sin((p.x * 0.8 + p.y * 0.6) * sc * 3.0 - t * 4.0);
    c = mix(uColor, uColor2, g);
  } else if (uStyle == 2) {
    float n = fbm(vec2(p.x * sc * 1.5, t * 0.6));
    float curtain = pow(fbm(vec2(p.x * sc * 3.0 + n * 2.0, p.y * 0.6 - t * 0.3)), 2.0) * 2.4;
    c = mix(uColor, uColor2, n) * (0.3 + curtain);
  } else if (uStyle == 3) {
    float b = 0.5 + 0.5 * sin(t * 12.0);
    c = mix(uColor, uColor2, b) * (0.4 + 0.6 * b);
  }
  return vec4(c, uDial.z);
}`,

  field: `
vec4 layer() {
  vec2 p = toH(vC);
  float sp = mix(0.015, 0.09, uDial.x);
  vec2 disp = vec2(0.0);
  float near = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= uSpots) break;
    vec4 s = uSpot[i];
    vec2 d = p - toH(s.xy);
    float dd = length(d);
    float R = s.z * 2.5;
    float k = exp(-dd * dd / (R * R)) * s.w;
    if (dd > 1e-4) disp += d / dd * k * R * mix(0.0, 1.2, uDial.z);
    near = max(near, k);
  }
  vec2 q = (p - disp) / sp;
  vec2 cell = floor(q);
  vec2 f = fract(q) - 0.5;
  float aa = 1.5 / max(uPx * sp, 1.0);
  float v;
  if (uStyle == 1) {
    v = 1.0 - smoothstep(0.04, 0.04 + aa, abs(f.y));
  } else if (uStyle == 2) {
    v = max(1.0 - smoothstep(0.03, 0.03 + aa, abs(f.y)), 1.0 - smoothstep(0.03, 0.03 + aa, abs(f.x)));
  } else {
    v = 1.0 - smoothstep(0.12, 0.12 + aa, length(f));
  }
  float shimmer = 0.6 + 0.4 * sin(uTime * mix(0.5, 4.0, uDial.y) + hash(cell) * 6.28);
  return vec4(mix(uColor, uColor2, near) * (1.0 + near), v * shimmer);
}`,

  texture: `
vec4 layer() {
  vec2 p = toH(vC);
  float unit = mix(0.02, 0.2, uDial.x);
  float det = uDial.z;
  float depth = uMaskOn == 1 ? texture(uMask, vUv).g : 1.0;
  vec3 c = uColor;
  if (uStyle == 0) {
    // Gingerbread: baked grain, a few dark specks, darker toward the edges.
    float grain = fbm(p / unit * 4.0);
    float speck = step(0.94, hash(floor(p / unit * 7.0)));
    c = uColor * (0.8 + 0.4 * grain * det);
    c = mix(c, uColor2, speck * 0.7 * det);
    c *= mix(0.62, 1.0, smoothstep(0.0, 0.55, depth));
  } else if (uStyle == 1) {
    vec2 b = vec2(p.x / (unit * 2.4), p.y / unit);
    float row = floor(b.y);
    b.x += mod(row, 2.0) * 0.5;
    vec2 cell = floor(b);
    vec2 f = fract(b);
    float edge = min(min(f.x, 1.0 - f.x) * 2.4, min(f.y, 1.0 - f.y));
    float mortar = 1.0 - smoothstep(0.04, 0.08, edge);
    vec3 brick = uColor * (1.0 + (hash(cell) - 0.5) * 0.35 * det) * (0.88 + 0.24 * noise(p / unit * 9.0) * det);
    c = mix(brick, uColor2, mortar);
  } else if (uStyle == 2) {
    float x = p.x / (unit * 1.5);
    float plank = floor(x);
    float fx = fract(x);
    float grain = 0.5 + 0.5 * sin((p.y / unit * 1.2 + noise(vec2(plank * 7.0, p.y / unit * 2.0)) * 2.5) * 6.0 + hash1(plank) * 10.0);
    c = mix(uColor, uColor2, grain * 0.45 * det + hash1(plank) * 0.2);
    c = mix(c, uColor2 * 0.5, 1.0 - smoothstep(0.0, 0.05, min(fx, 1.0 - fx)));
  } else if (uStyle == 3) {
    vec2 v = voronoi(p / unit);
    float edge = smoothstep(0.02, 0.09, v.x);
    vec3 stone = uColor * (0.75 + 0.5 * v.y * det) * (0.85 + 0.3 * fbm(p / unit * 3.0));
    c = mix(uColor2, stone, edge);
  } else if (uStyle == 4) {
    float n = fbm(p / unit);
    c = mix(uColor2, uColor, 0.55 + 0.45 * n);
    vec2 cell = floor(p * uPx / 3.0);
    float h = hash(cell);
    float sparkle = step(0.997 - 0.006 * det, h) * (0.5 + 0.5 * sin(uTime * mix(1.0, 6.0, uDial.y) + h * 60.0));
    c = c * mix(0.82, 1.0, smoothstep(0.0, 0.5, depth)) + sparkle * 0.8;
  } else if (uStyle == 5) {
    vec2 v = voronoi(p / (unit * 1.5));
    float crack = 1.0 - smoothstep(0.0, 0.03, v.x);
    float shine = smoothstep(0.75, 1.0, 0.5 + 0.5 * sin((p.x + p.y) * 3.0 - uTime * mix(0.2, 2.0, uDial.y))) * 0.45;
    c = mix(uColor, uColor2, crack * 0.8 * det + shine);
  } else if (uStyle == 6) {
    float s = fract((p.x + p.y) / (unit * 2.0) - uTime * uDial.y * 0.3);
    float aa = 1.5 / max(uPx * unit * 2.0, 1.0);
    float stripe = smoothstep(0.5 - aa, 0.5 + aa, s) * (1.0 - smoothstep(1.0 - aa, 1.0, s));
    c = mix(uColor, uColor2, stripe);
  } else if (uStyle == 7) {
    float flick = 0.8 + 0.2 * noise(vec2(uTime * mix(1.0, 10.0, uDial.y), floor(p.x / 0.3) * 3.1));
    float inner = smoothstep(0.0, 0.9, depth);
    c = mix(uColor2, uColor, inner) * flick * (0.55 + 0.6 * inner);
  } else if (uStyle == 8) {
    c = uColor2 * (0.5 + 0.5 * (1.0 - vC.y));
    vec2 g = p * mix(60.0, 12.0, uDial.x);
    vec2 cell = floor(g);
    float h = hash(cell);
    vec2 j = hash2(cell + 3.0) - 0.5;
    float d = length(fract(g) - 0.5 - j * 0.6);
    float tw = 0.5 + 0.5 * sin(uTime * mix(0.5, 4.0, uDial.y) + h * 40.0);
    c += uColor * step(1.0 - 0.25 * det - 0.05, h) * exp(-d * d * 120.0) * tw * 1.5;
  }
  return vec4(c, 1.0);
}`,

  outline: `
vec4 layer() {
  vec4 sh = texture(uMask, vUv);
  vec2 p = toH(vC);
  float bright = mix(0.4, 1.4, uDial.z);
  if (uStyle == 0) {
    float n = noise(p * 300.0);
    return vec4(uColor * (0.86 + 0.14 * n) * bright, sh.r);
  } else if (uStyle == 1) {
    float flick = 0.88 + 0.12 * sin(uTime * mix(2.0, 30.0, uDial.y) + sin(uTime * 7.3) * 2.0);
    float glow = sh.g * mix(0.2, 1.6, uDial.w);
    float total = sh.r + glow;
    return vec4((uColor * sh.r * 1.4 + uColor2 * glow) / max(total, 1e-3) * bright * flick, min(1.0, total));
  } else if (uStyle == 3) {
    float s = fract((p.x + p.y) * 40.0 - uTime * uDial.y * 2.0);
    return vec4(mix(uColor, uColor2, step(0.5, s)) * bright, sh.r);
  }
  return vec4(uColor * bright, sh.r);
}`,

  lights: `
vec3 bulbPalette(float i) {
  float k = mod(i, 5.0);
  if (k < 1.0) return vec3(1.0, 0.18, 0.15);
  if (k < 2.0) return vec3(0.15, 0.95, 0.3);
  if (k < 3.0) return vec3(0.2, 0.45, 1.0);
  if (k < 4.0) return vec3(1.0, 0.85, 0.2);
  return vec3(1.0, 0.5, 0.1);
}
vec4 layer() {
  vec4 sh = texture(uMask, vUv);
  float id = max(0.0, floor(sh.b * 255.0 + 0.5) - 1.0);
  float hv = hash1(id * 1.37 + 0.5);
  float speed = mix(0.5, 6.0, uDial.y);
  vec3 col = hv > 0.75 ? uColor2 : uColor;
  float b = 1.0;
  if (uStyle == 0) {
    b = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(uTime * speed + hv * 40.0), 2.0);
  } else if (uStyle == 1) {
    col = uColor;
    b = 0.15 + 0.85 * smoothstep(0.55, 1.0, 0.5 + 0.5 * sin(id * 0.9 - uTime * speed * 1.5));
  } else if (uStyle == 2) {
    col = uColor;
  } else {
    col = bulbPalette(id);
    b = 0.75 + 0.25 * sin(uTime * speed + hv * 20.0);
  }
  // An unlit bulb is faint glass, not a dark dot over what is behind it.
  float halo = sh.g * 0.7 * b;
  float a = min(1.0, sh.r * mix(0.12, 1.0, b) + halo);
  return vec4(col * mix(0.8, 1.3, b), a);
}`,

  picture: `
uniform sampler2D uPicture;
vec4 layer() {
  // The picture covers the whole canvas, top row first.
  vec3 c = texture(uPicture, vC).rgb * mix(0.3, 1.7, uDial.z);
  if (uStyle == 1) c *= 0.82 + 0.18 * sin(uTime * mix(0.3, 3.0, uDial.y));
  return vec4(c, 1.0);
}`,


}

export function layerFragment(type: string): string {
  const body = BODIES[type]
  if (!body) throw new Error(`No shader for layer type ${type}`)
  return `${HEADER}${body}${FOOTER}`
}

/** Trails: last frame faded, plus each person's brush along their path this frame. */
export const TRAILS_UPDATE = `${HEADER}
uniform float uDecay;
uniform float uDt;
void main() {
  vec2 fuv = gl_FragCoord.xy / uViewport;
  if (uStyle == 1) {
    // Smoke rises and wavers.
    // Canvas heights per second, as a share of this buffer's height (uRect.w).
    fuv.y -= mix(0.0, 0.25, uDial.y) * uDt / uRect.w;
    fuv.x += (noise(vec2(vC.y * 8.0, uTime * 0.5)) - 0.5) * 0.002;
  }
  vec4 prev = texture(uPrev, fuv);
  prev = max(prev * uDecay - vec4(1.5 / 255.0), vec4(0.0));
  vec2 p = toH(vC);
  vec4 add = vec4(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= uSpots) break;
    vec4 s = uSpot[i];
    vec4 m = uMove[i];
    vec2 b = toH(s.xy);
    vec2 a = b - m.xy * uDt;
    float r = s.z * mix(0.15, 1.4, uDial.x);
    float d = sdSegment(p, a, b);
    float f = exp(-d * d / (r * r * 0.35)) * s.w;
    if (uStyle == 3) {
      // Footprints: a left or right foot stamped twice a second while the
      // person walks, pointing the way they go, left on the ground to fade.
      float pace = uTime * 2.0 + float(i) * 0.37;
      float speed = length(m.xy);
      f = 0.0;
      if (speed > 0.02 && fract(pace) < uDt * 2.0 + 0.001) {
        vec2 fwd = m.xy / speed;
        vec2 side = vec2(-fwd.y, fwd.x);
        float foot = mod(floor(pace), 2.0) < 1.0 ? -1.0 : 1.0;
        float len = s.z * mix(0.5, 1.6, uDial.x);
        vec2 o = p - (b + side * foot * len * 0.32);
        vec2 l = vec2(dot(o, side) * foot, -dot(o, fwd)) / len;
        float sole = length((l - vec2(0.0, -0.1)) / vec2(0.24, 0.36)) - 1.0;
        float heel = length((l - vec2(0.0, 0.36)) / vec2(0.18, 0.2)) - 1.0;
        float toes = 1e9;
        for (int t = 0; t < 5; t++) {
          float ft = float(t);
          toes = min(toes, length(l - vec2(-0.16 + ft * 0.08, -0.58 + abs(ft - 1.0) * 0.03)) - mix(0.07, 0.045, ft / 4.0));
        }
        f = (min(min(sole, heel), toes) < 0.0 ? 1.0 : 0.0) * s.w;
      }
    }
    vec3 c = uStyle == 2
      ? mix(uColor, uColor2, 0.5 + 0.5 * sin(uTime * 1.5 + m.w * 6.28))
      : mix(uColor, uColor2, clamp(length(m.xy) * 2.0, 0.0, 1.0));
    add += vec4(c * f, f);
  }
  // New paint goes over the old (premultiplied "over"), so a trail keeps
  // its colour instead of piling up to white where people linger.
  // Footprints are stamped whole in one frame; brushes build up over several.
  float k = clamp(add.a * (uStyle == 3 ? 1.0 : min(1.0, uDt * 15.0)), 0.0, 1.0);
  vec3 paint = add.rgb / max(add.a, 1e-3);
  outColor = vec4(prev.rgb * (1.0 - k) + paint * k, prev.a * (1.0 - k) + k);
}`

/** Reveal: how open each spot is, slowly closing again. */
export const REVEAL_UPDATE = `${HEADER}
uniform float uDecay;
void main() {
  float prev = texture(uPrev, gl_FragCoord.xy / uViewport).r * uDecay;
  vec2 p = toH(vC);
  float open = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= uSpots) break;
    vec4 s = uSpot[i];
    float r = s.z * mix(0.6, 4.0, uDial.x);
    float d = length(p - toH(s.xy));
    float f = uStyle == 1 ? 1.0 - smoothstep(r * 0.92, r, d) : exp(-d * d / (r * r * 0.5));
    open = max(open, f * s.w);
  }
  outColor = vec4(max(prev, open), 0.0, 0.0, 1.0);
}`

/**
 * Points: particles (uKind 0) and falling things (uKind 1). Each point's
 * place is a function of its number and the time, and of where people are.
 */
export const POINTS_VERTEX = `#version 300 es
precision highp float;
${COMMON}
uniform int uKind;
out vec4 vCol;
out float vRot;
out float vShape;
void main() {
  float i = float(gl_VertexID);
  float a = hash1(i + 0.1);
  float b = hash1(i + 1.7);
  float c = hash1(i + 3.3);
  float d = hash1(i + 5.9);
  float aspect = uCanvas.x / uCanvas.y;
  vec2 pH;
  float alpha = 1.0;
  float size = mix(1.5, 16.0, uDial.x) * (0.6 + 0.8 * c);
  vec3 col = mix(uColor, uColor2, d);
  float shape = 0.0;
  float rot = 0.0;
  if (uKind == 1) {
    float spd = mix(0.03, 0.45, uDial.y) * mix(0.6, 1.4, b);
    if (uStyle == 1) { spd *= 4.0; shape = 1.0; size *= 1.6; }
    if (uStyle == 2) { spd *= 0.6; shape = 2.0; size *= 1.8; }
    if (uStyle == 3) { shape = 3.0; size *= 1.2; }
    if (uStyle == 4) { spd *= 0.5; shape = 4.0; size *= 1.5; alpha = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(uTime * 3.0 + a * 40.0), 2.0); }
    float y = fract(c + uTime * spd / 1.25) * 1.25 - 0.12;
    float swayAmp = uDial.w * (uStyle == 2 ? 0.1 : 0.03);
    float x = fract(a + swayAmp * sin(uTime * mix(0.4, 1.6, d) + a * 6.28) / aspect);
    pH = vec2(x * aspect, y);
    if (uStyle == 3) {
      float k = floor(d * 5.0);
      col = k < 1.0 ? uColor : k < 2.0 ? uColor2 : k < 3.0 ? vec3(1.0, 0.85, 0.2) : k < 4.0 ? vec3(0.3, 0.9, 0.5) : vec3(0.95, 0.4, 0.9);
    }
    if (uNear == N_FLEE) {
      // Pushed out of a circle around each person.
      for (int k = 0; k < 16; k++) {
        if (k >= uSpots) break;
        vec4 s = uSpot[k];
        vec2 dv = pH - toH(s.xy);
        float dd = max(length(dv), 1e-4);
        float R = s.z * 1.8 * (0.4 + 1.2 * uReach);
        pH += dv / dd * max(0.0, R - dd) * s.w;
      }
    } else if (uNear != N_NONE) {
      vec2 away;
      float dist;
      float k = nearAt(pH, away, dist);
      if (uNear == N_FOLLOW) pH -= away * k * dist * 0.8;
      else if (uNear == N_LIGHT) { alpha *= 1.0 + 2.0 * k; size *= 1.0 + 0.8 * k; }
      else if (uNear == N_COLOUR) col = mix(col, uColor2, k);
      else if (uNear == N_APPEAR) alpha *= k;
      else if (uNear == N_HIDE) alpha *= 1.0 - k;
    }
    rot = uTime * (d - 0.5) * 5.0 + a * 6.28;
  } else if (uStyle == 0) {
    if (uSpots == 0) { gl_Position = vec4(2.0, 2.0, 0.0, 1.0); gl_PointSize = 0.0; vCol = vec4(0.0); vRot = 0.0; vShape = 0.0; return; }
    int k = int(mod(i, float(uSpots)));
    vec4 s = uSpot[k];
    vec4 m = uMove[k];
    float life = mix(0.6, 1.8, a) / mix(0.5, 2.0, uDial.y);
    float ph = fract(uTime / life + b);
    float age = ph * life;
    float ang = c * 6.2832;
    vec2 dir = vec2(cos(ang), sin(ang) - 0.9);
    vec2 o = toH(s.xy) + vec2(cos(ang), sin(ang)) * s.z * 0.35 * d;
    pH = o + dir * mix(0.04, 0.3, d) * mix(0.5, 2.0, uDial.y) * age + vec2(0.0, 0.3) * age * age - m.xy * age * 0.6;
    alpha = (1.0 - ph) * s.w;
    size *= 1.0 - ph * 0.6;
  } else {
    float wander = uTime * mix(0.05, 0.5, uDial.y);
    vec2 base = vec2(a, b) + 0.05 * vec2(sin(wander * (0.5 + c) + d * 6.28), cos(wander * (0.5 + d) + c * 6.28));
    pH = vec2(base.x * aspect, base.y);
    if (uStyle == 1) {
      float best = 1e9;
      vec4 s = vec4(0.0);
      for (int k = 0; k < 16; k++) {
        if (k >= uSpots) break;
        float dd = length(pH - toH(uSpot[k].xy));
        if (dd < best) { best = dd; s = uSpot[k]; }
      }
      if (best < 1e8) {
        float ang = uTime * mix(0.3, 2.5, uDial.y) * (0.5 + c) + a * 6.28;
        vec2 orbit = toH(s.xy) + vec2(cos(ang), sin(ang)) * s.z * mix(0.5, 2.5, d);
        pH = mix(pH, orbit, s.w * exp(-best / 0.9));
      }
    } else if (uStyle == 2) {
      for (int k = 0; k < 16; k++) {
        if (k >= uSpots) break;
        vec4 s = uSpot[k];
        vec2 dv = pH - toH(s.xy);
        float dd = max(length(dv), 1e-4);
        float R = s.z * 3.0;
        pH += dv / dd * R * exp(-dd * dd / (R * R)) * s.w * 1.3;
      }
    } else {
      float near = 0.0;
      for (int k = 0; k < 16; k++) {
        if (k >= uSpots) break;
        vec4 s = uSpot[k];
        near = max(near, exp(-pow(length(pH - toH(s.xy)) / (s.z * 3.0), 2.0)) * s.w);
      }
      alpha = (0.25 + 0.75 * pow(0.5 + 0.5 * sin(uTime * mix(0.5, 3.0, uDial.y) * (0.5 + c) + a * 40.0), 3.0)) * (0.55 + near);
    }
    alpha *= mix(1.0, 0.5 + 0.5 * sin(uTime * 5.0 + d * 50.0), uDial.w);
  }
  vec2 pos = vec2(pH.x / aspect, pH.y);
  vec2 uv = (pos - uRect.xy) / uRect.zw;
  gl_Position = vec4(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.0, 1.0);
  gl_PointSize = max(1.0, size * uPx / 1080.0);
  vCol = vec4(col, alpha * uStrength);
  vRot = rot;
  vShape = shape;
}`

export const POINTS_FRAGMENT = `#version 300 es
precision highp float;
in vec4 vCol;
in float vRot;
in float vShape;
uniform sampler2D uMask;
uniform int uMaskOn;
uniform vec2 uViewport;
out vec4 outColor;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float cs = cos(vRot);
  float sn = sin(vRot);
  vec2 r = mat2(cs, -sn, sn, cs) * q;
  float a;
  if (vShape < 0.5) {
    a = exp(-dot(q, q) * 3.0) * (1.0 - smoothstep(0.8, 1.0, length(q)));
  } else if (vShape < 1.5) {
    a = (1.0 - smoothstep(0.0, 0.14, abs(q.x))) * (1.0 - smoothstep(0.4, 1.0, abs(q.y)));
  } else if (vShape < 2.5) {
    float e = length(vec2(r.x * 2.0, r.y));
    a = (1.0 - smoothstep(0.8, 1.0, e)) * (0.75 + 0.25 * step(0.08, abs(r.x)));
  } else if (vShape < 3.5) {
    a = (1.0 - smoothstep(0.55, 0.65, abs(r.x))) * (1.0 - smoothstep(0.28, 0.36, abs(r.y)));
  } else {
    a = max(exp(-abs(r.x) * 14.0) * exp(-abs(r.y) * 2.2), exp(-abs(r.y) * 14.0) * exp(-abs(r.x) * 2.2)) + exp(-dot(q, q) * 9.0);
  }
  if (uMaskOn == 1) {
    vec2 muv = vec2(gl_FragCoord.x / uViewport.x, 1.0 - gl_FragCoord.y / uViewport.y);
    a *= texture(uMask, muv).r;
  }
  a = clamp(a * vCol.a, 0.0, 1.0);
  outColor = vec4(vCol.rgb * a, a);
}`

/**
 * Objects: one quad (six vertices) per grid cell over the whole canvas.
 * The vertex shader decides whether the cell has an object (how many,
 * and whether its centre is on the layer's target in uPlace), then how it
 * moves and changes by itself and what it does near the nearest person.
 */
export const OBJECTS_VERTEX = `#version 300 es
precision highp float;
${COMMON}
${OBJECT_STYLES}
uniform ivec2 uGrid;
uniform sampler2D uPlace;
uniform int uPlaceOn;
uniform int uMotion;
uniform int uPinCount;
uniform vec4 uPins[64];
// Straightened house parts (flat.ts): which part each spot is on, and each
// part's flat space → canvas and back, in canvas heights.
uniform sampler2D uFlatIdx;
uniform int uFlatOn;
uniform mat3 uFlatTo[8];
uniform mat3 uFlatFrom[8];
out vec2 vQ;
out float vAA;
flat out float vSeed;
flat out float vTint;
flat out float vBright;
flat out float vAlpha;
flat out float vGlow;
flat out float vPhase;
flat out float vBlink;
flat out float vFlip;
flat out vec2 vLook;
// The object's part: flat space → canvas (the identity off a straightened part).
mat3 gTo = mat3(1.0);
vec2 onCanvas(vec2 p) {
  vec3 r = gTo * vec3(p, 1.0);
  return r.xy / r.z;
}
void main() {
  int id = gl_VertexID / 6;
  int v = gl_VertexID - id * 6;
  vec2 corner = v == 0 ? vec2(-1.0, -1.0) : (v == 1 || v == 4) ? vec2(1.0, -1.0) : (v == 2 || v == 3) ? vec2(-1.0, 1.0) : vec2(1.0, 1.0);
  vec2 cell = vec2(float(id % uGrid.x), float(id / uGrid.x));
  float aspect = uCanvas.x / uCanvas.y;
  float cs = mix(0.05, 0.3, uDial.x);
  float h = hash(cell + 0.37);
  float h2 = hash(cell + 9.0);
  vec2 c = (cell + 0.5 + (hash2(cell + 3.1) - 0.5) * 0.5) * cs;
  float own = mix(0.8, 1.2, h2);
  float turned = 0.0;
  if (uPinCount > 0) {
    // Placed by hand: one object on each pin, at the size it was given.
    vec4 pin = uPins[min(id, 63)];
    cell = vec2(float(id), 41.0);
    h = hash(cell + 0.37);
    h2 = hash(cell + 9.0);
    c = vec2(pin.x * aspect, pin.y);
    own = pin.z;
    turned = pin.w;
  } else {
    bool hidden = h > mix(0.08, 0.95, uDial.z) || c.x > aspect || c.y > 1.0;
    // Floating objects rise over everything; the rest sit on their target.
    if (!hidden && uPlaceOn == 1 && uMotion != M_RISE) {
      hidden = textureLod(uPlace, vec2(c.x / aspect, c.y), 0.0).r < 0.5;
    }
    if (hidden) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
  }
  // On a straightened part (a roof sloping away) the object moves and
  // changes in the part's flat space and is drawn through it, so it is not
  // stretched there. Rising objects cross everything and stay as they are.
  int part = -1;
  if (uFlatOn == 1 && !(uMotion == M_RISE && uPinCount == 0)) {
    float level = textureLod(uFlatIdx, vec2(c.x / aspect, c.y), 0.0).r * 255.0 / 16.0;
    part = int(floor(level + 0.5)) - 1;
    if (part >= 0 && part < 8) {
      gTo = uFlatTo[part];
      vec3 f = uFlatFrom[part] * vec3(c, 1.0);
      c = f.xy / f.z;
    } else {
      part = -1;
    }
  }
  float R = cs * 0.3 * own;
  float t = uTime;
  float sp = mix(0.2, 2.5, uDial.y);
  float ph = h * 6.2832;
  vec2 off = vec2(0.0);
  float rot = turned;
  float scale = 1.0;
  float bright = 1.0;
  float alpha = 1.0;
  float tint = 0.0;
  float glow = 0.0;
  float blink = 1.0;

  // -- moving by itself
  if (uMotion == M_BOB) off.y += sin(t * sp * 2.0 + ph) * R * 0.3;
  else if (uMotion == M_SWAY) { float sw = sin(t * sp * 1.6 + ph); rot += sw * 0.35; off.x += sw * R * 0.15; }
  else if (uMotion == M_SPIN) rot += t * sp * (h2 < 0.5 ? -1.5 : 1.5) + ph;
  else if (uMotion == M_DRIFT) off += (vec2(noise(vec2(t * sp * 0.25, ph * 3.0)), noise(vec2(ph * 5.0, t * sp * 0.25 + 7.0))) - 0.5) * cs * 1.6;
  else if (uMotion == M_BOUNCE) off.y -= abs(sin(t * sp * 2.5 + ph)) * R * 0.9;
  else if (uMotion == M_ORBIT) off += vec2(cos(t * sp + ph), sin(t * sp + ph)) * cs * 0.3;
  else if (uMotion == M_RISE && uPinCount > 0) {
    // A placed object floats up from its spot, fades and starts again.
    float f = fract(t * sp * 0.12 + h);
    off.y -= f * R * 5.0;
    off.x += sin(t * sp * 1.2 + ph) * R * 0.3;
    alpha *= smoothstep(0.0, 0.15, f) * (1.0 - smoothstep(0.7, 1.0, f));
  } else if (uMotion == M_RISE) {
    float span = 1.0 + 6.0 * R;
    c.y = mod(c.y - t * sp * 0.05 * mix(0.6, 1.4, h2) + 3.0 * R, span) - 3.0 * R;
    off.x += sin(t * sp * 1.2 + ph) * R * 0.4;
  } else if (uMotion == M_FLUTTER) {
    off += vec2(sin(t * sp * 1.3 + ph) * cs * 0.35, sin(t * sp * 2.1 + ph * 2.0) * cs * 0.25);
    rot += sin(t * sp * 3.0 + ph) * 0.25;
  }

  // -- changing by itself
  if (uChange == C_PULSE) scale *= 1.0 + 0.18 * sin(t * sp * 2.0 + ph);
  else if (uChange == C_TWINKLE) {
    // Fade rather than darken, so a dim object is not a grey patch.
    float tw = pow(0.5 + 0.5 * sin(t * sp * 3.0 + ph * 7.0), 2.0);
    alpha *= 0.25 + 0.75 * tw;
    bright *= 0.85 + 0.35 * tw;
  }
  else if (uChange == C_COLOUR) tint = 0.5 + 0.5 * sin(t * sp * 0.8 + ph);
  else if (uChange == C_FLICKER) bright *= 0.75 + 0.35 * noise(vec2(t * sp * 8.0, ph * 13.0));
  else if (uChange == C_BLINK) {
    float b = fract(t * sp * 0.25 + h2);
    blink = 1.0 - (smoothstep(0.0, 0.03, b) - smoothstep(0.03, 0.06, b));
  }

  // -- near people
  vec2 pc = c + off;
  vec2 away;
  float dist;
  float k = uNear == N_NONE ? 0.0 : nearAt(onCanvas(pc), away, dist);
  if (uNear == N_LIGHT) { bright *= 1.0 + 0.8 * k; glow = k; }
  else if (uNear == N_GROW) scale *= 1.0 + 1.2 * k;
  else if (uNear == N_SHRINK) scale *= 1.0 - 0.8 * k;
  else if (uNear == N_COLOUR) tint = mix(tint, 1.0, k);
  else if (uNear == N_SPIN) rot += k * 6.2832 + sin(t * 9.0 + ph) * 0.2 * k;
  else if (uNear == N_FLEE) off += away * k * (mix(0.05, 0.6, uReach) + R) * 0.9;
  else if (uNear == N_FOLLOW) off -= away * k * max(0.0, dist - R * 1.5) * 0.85;
  else if (uNear == N_JUMP) off.y -= k * abs(sin(t * 9.0 + ph)) * R * 1.6;
  else if (uNear == N_DANCE) {
    rot += sin(t * 10.0 + ph) * 0.5 * k;
    off.y -= abs(sin(t * 10.0 + ph)) * R * 0.6 * k;
    scale *= 1.0 + 0.15 * k;
  }
  else if (uNear == N_APPEAR) { alpha *= smoothstep(0.05, 0.6, k); scale *= mix(0.4, 1.0, k); }
  else if (uNear == N_HIDE) { alpha *= 1.0 - smoothstep(0.25, 0.85, k); scale *= mix(1.0, 0.7, k); }
  else if (uNear == N_BURST) {
    scale *= 1.0 + 1.5 * smoothstep(0.1, 0.8, k);
    alpha *= 1.0 - smoothstep(0.45, 0.9, k);
    glow = k;
  }
  pc = c + off;

  // Eyes watch the nearest person, wherever they are; with nobody about
  // they look around.
  vec2 look = vec2(sin(t * 0.7 + ph), cos(t * 0.5 + ph * 2.0)) * 0.6;
  if (uStyle == S_EYES) {
    float best = 1e9;
    for (int i = 0; i < 16; i++) {
      if (i >= uSpots) break;
      vec2 d = toH(uSpot[i].xy) - onCanvas(pc);
      float dd = length(d);
      if (dd < best && uSpot[i].w > 0.2) { best = dd; look = d / max(dd, 1e-4) * min(1.0, dd / (R * 3.0)); }
    }
    look = vec2(cos(-rot) * look.x - sin(-rot) * look.y, sin(-rot) * look.x + cos(-rot) * look.y);
  }

  scale = max(scale, 0.0);
  float size = R * scale * 1.4;
  float cr = cos(rot);
  float sr = sin(rot);
  vec2 pH = pc + vec2(cr * corner.x - sr * corner.y, sr * corner.x + cr * corner.y) * size;
  // Through the part's perspective; w carries it so the look inside the
  // quad is perspective-correct too (w is 1 off a straightened part).
  vec3 hc = gTo * vec3(pH, 1.0);
  if (hc.z <= 1e-6) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 uv = (vec2(hc.x / hc.z / aspect, hc.y / hc.z) - uRect.xy) / uRect.zw;
  gl_Position = vec4((uv.x * 2.0 - 1.0) * hc.z, (1.0 - uv.y * 2.0) * hc.z, 0.0, hc.z);
  // How much the part's perspective grows or shrinks the object here, for its soft edge.
  float js = 1.0;
  if (part >= 0) {
    vec2 o = onCanvas(pc);
    vec2 ex = onCanvas(pc + vec2(R, 0.0)) - o;
    vec2 ey = onCanvas(pc + vec2(0.0, R)) - o;
    js = sqrt(abs(ex.x * ey.y - ex.y * ey.x)) / max(R, 1e-5);
  }
  vQ = corner * 1.4;
  vAA = 1.5 / max(R * max(scale, 0.05) * js * uPx, 1.0);
  vSeed = hash(cell + 5.5);
  vTint = tint;
  vBright = bright;
  vAlpha = alpha * uStrength;
  vGlow = glow;
  vPhase = t * sp + ph;
  vBlink = blink;
  vFlip = h2 < 0.5 ? -1.0 : 1.0;
  vLook = look;
}`

/** Each object's look, in its own square: y points down, radius about 0.9. */
export const OBJECTS_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
${OBJECT_STYLES}
in vec2 vQ;
in float vAA;
flat in float vSeed;
flat in float vTint;
flat in float vBright;
flat in float vAlpha;
flat in float vGlow;
flat in float vPhase;
flat in float vBlink;
flat in float vFlip;
flat in vec2 vLook;
uniform int uStyle;
uniform vec3 uColor;
uniform vec3 uColor2;
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float dot2(vec2 v) { return dot(v, v); }
mat2 rot2(float a) { float c = cos(a); float s = sin(a); return mat2(c, -s, s, c); }
float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
// Approximate distance to an ellipse with radii r.
float sdEl(vec2 p, vec2 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-4);
}
float sdStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
// y up, point at the bottom (0, 0), lobes up to y = 1.
float sdHeart(vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - 0.35355;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}
// Any triangle.
float sdTri(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0;
  vec2 e1 = p2 - p1;
  vec2 e2 = p0 - p2;
  vec2 v0 = p - p0;
  vec2 v1 = p - p1;
  vec2 v2 = p - p2;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
                   vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
                   vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
// y up, apex up, side 2r.
float sdEqTri(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
vec3 candy(float h) {
  float k = floor(h * 5.0);
  if (k < 1.0) return uColor;
  if (k < 2.0) return uColor2;
  if (k < 3.0) return vec3(1.0, 0.85, 0.15);
  if (k < 4.0) return vec3(0.55, 0.3, 0.95);
  return vec3(1.0, 0.45, 0.7);
}
vec3 flameColour(float r, float size) {
  return mix(vec3(1.0, 0.95, 0.7), vec3(1.0, 0.5, 0.1), smoothstep(0.0, size, r)) * 1.5;
}

void main() {
  vec2 q = vQ;
  float sd = 1.0;
  vec3 c = uColor;
  // Light given off around the object (flames, lanterns, fireworks).
  vec3 ec = vec3(0.0);
  float ea = 0.0;
  float own = 1.0;
  float pick = step(0.5, vSeed);

  if (uStyle == S_GUMDROPS) {
    sd = max(length(q * vec2(1.0, 1.15)) - 0.9, q.y - 0.45);
    c = candy(vSeed) * (0.72 + 0.4 * (0.5 - q.y * 0.5));
    c += 0.5 * exp(-dot2(q - vec2(-0.35, -0.35)) * 12.0);
    c += 0.25 * step(0.85, hash(floor(q * 9.0) + vSeed * 31.0));
  } else if (uStyle == S_PEPPERMINTS) {
    float r = length(q);
    sd = r - 0.9;
    float stripes = step(0.5, fract(atan(q.y, q.x) / 6.2832 * 6.0 + r * 0.35));
    c = mix(vec3(1.0), uColor, stripes * step(0.12, r)) * (1.0 - 0.25 * smoothstep(0.7, 0.9, r));
  } else if (uStyle == S_STARS) {
    sd = sdStar5(vec2(q.x, -q.y), 0.9, 0.45);
    c = mix(uColor, uColor2, pick) * (1.0 + 0.4 * exp(-dot2(q) * 4.0));
  } else if (uStyle == S_SNOWFLAKES) {
    float a = atan(q.y, q.x);
    float r = length(q);
    a = mod(a, 1.0472) - 0.5236;
    vec2 f = vec2(cos(a), abs(sin(a))) * r;
    float arm = sdSegment(f, vec2(0.0), vec2(0.9, 0.0)) - 0.07;
    float b1 = sdSegment(f, vec2(0.45, 0.0), vec2(0.65, 0.2)) - 0.05;
    float b2 = sdSegment(f, vec2(0.65, 0.0), vec2(0.8, 0.13)) - 0.04;
    sd = min(arm, min(b1, b2));
  } else if (uStyle == S_ORNAMENTS) {
    float ball = length(q - vec2(0.0, 0.12)) - 0.78;
    float cap = sdBox(q - vec2(0.0, -0.75), vec2(0.2, 0.12));
    sd = min(ball, cap);
    c = cap < ball ? vec3(0.85, 0.75, 0.4) : candy(vSeed) * (0.75 + 0.35 * (0.5 - q.y * 0.5));
    c += 0.6 * exp(-dot2(q - vec2(-0.3, -0.2)) * 18.0);
  } else if (uStyle == S_HEARTS) {
    sd = sdHeart(vec2(q.x, -q.y + 0.55) * 1.1) / 1.1;
    c = mix(uColor, uColor2, pick) * (0.85 + 0.3 * (0.5 - q.y * 0.5));
    c += 0.35 * exp(-dot2(q - vec2(-0.3, -0.25)) * 20.0);
  } else if (uStyle == S_PUMPKINS) {
    float rib = 0.07 * abs(sin(atan(q.y, q.x) * 4.0));
    float body = length(q * vec2(0.82, 1.08)) - 0.82 + rib;
    float stem = sdBox(q - vec2(0.05, -0.85), vec2(0.1, 0.2));
    sd = min(body, stem);
    c = stem < body ? uColor2 : uColor * (0.7 + 0.5 * (1.0 - rib * 8.0));
    // A carved face, lit from inside.
    float eyes = min(sdEqTri(vec2(q.x - 0.3, -(q.y + 0.12)), 0.14), sdEqTri(vec2(q.x + 0.3, -(q.y + 0.12)), 0.14));
    float mouth = max(sdEl(q - vec2(0.0, 0.28), vec2(0.45, 0.17)), -sdEl(q - vec2(0.0, 0.16), vec2(0.5, 0.14)));
    if (min(eyes, mouth) < 0.0 && body < 0.0) c = vec3(1.0, 0.85, 0.35) * 1.4;
  } else if (uStyle == S_GHOSTS) {
    float wave = 0.08 * sin(q.x * 11.0 + vPhase * 3.0);
    float head = length(q - vec2(0.0, -0.2)) - 0.6;
    float body = max(abs(q.x) - 0.6, max(-0.2 - q.y, q.y - (0.75 + wave)));
    sd = min(head, body);
    c = uColor * (0.85 + 0.15 * (0.5 - q.y));
    float face = min(min(sdEl(q - vec2(-0.22, -0.25), vec2(0.1, 0.15)), sdEl(q - vec2(0.22, -0.25), vec2(0.1, 0.15))),
                     sdEl(q - vec2(0.0, 0.1), vec2(0.12, 0.16)));
    if (face < 0.0) c = uColor2;
    own = 0.9;
  } else if (uStyle == S_BATS) {
    float flap = sin(vPhase * 7.0);
    vec2 p = q;
    p.y -= abs(p.x) * 0.45 * flap;
    float wing = sdEl(p, vec2(0.95, 0.38));
    wing = max(wing, -(length(vec2(abs(p.x), p.y) - vec2(0.3, 0.42)) - 0.2));
    wing = max(wing, -(length(vec2(abs(p.x), p.y) - vec2(0.68, 0.32)) - 0.18));
    float body = sdEl(q - vec2(0.0, 0.05), vec2(0.2, 0.32));
    float ears = sdSegment(vec2(abs(q.x), q.y), vec2(0.1, -0.2), vec2(0.17, -0.45)) - 0.05;
    sd = min(min(wing, body), ears);
    c = uColor * (0.8 + 0.3 * (0.5 - p.y));
    if (length(vec2(abs(q.x) - 0.08, q.y + 0.08)) < 0.05) c = uColor2 * 1.5;
  } else if (uStyle == S_SPIDERS || uStyle == S_CRAWLING_SPIDERS) {
    float body = length(q - vec2(0.0, 0.2)) - 0.33;
    float head = length(q - vec2(0.0, -0.18)) - 0.18;
    vec2 pm = vec2(abs(q.x), q.y);
    float legs = 1e9;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float y0 = -0.1 + fi * 0.15;
      vec2 knee = vec2(0.55, y0 - 0.25 + sin(vPhase * 6.0 + fi) * 0.06);
      vec2 foot = vec2(0.8, y0 + 0.25 + fi * 0.05);
      legs = min(legs, min(sdSegment(pm, vec2(0.15, y0 + 0.1), knee), sdSegment(pm, knee, foot)));
    }
    legs -= 0.04;
    // Crawling ones walk on the ground, without the thread they hang from.
    float thread = uStyle == S_CRAWLING_SPIDERS ? 1e9 : sdSegment(q, vec2(0.0, -0.3), vec2(0.0, -1.5)) - 0.015;
    sd = min(min(body, head), min(legs, thread));
    if (thread < min(min(body, head), legs)) c = vec3(0.6);
    if (length(vec2(abs(q.x) - 0.07, q.y + 0.2)) < 0.045) c = uColor2 * 1.5;
  } else if (uStyle == S_EYES) {
    vec2 p = vec2(abs(q.x) - 0.42, q.y);
    sd = sdEl(p, vec2(0.36, 0.26 * max(vBlink, 0.06)));
    vec2 look = vLook * vec2(0.15, 0.08);
    // Mirror the look for the left eye, which p flipped.
    look.x *= q.x < 0.0 ? -1.0 : 1.0;
    float iris = length(p - look) - 0.18;
    float pupil = sdEl(p - look, vec2(0.05, 0.15));
    c = iris < 0.0 ? uColor * (1.0 + 0.6 * exp(-dot2(p - look) * 20.0)) : uColor2 * 0.55;
    if (pupil < 0.0) c = vec3(0.0);
    ec = uColor;
    ea = exp(-max(sd, 0.0) * 10.0) * 0.3 * vBlink;
  } else if (uStyle == S_CANDY_CANES) {
    float stick = sdSegment(q, vec2(0.25, -0.3), vec2(0.25, 0.9)) - 0.13;
    float hook = max(abs(length(q - vec2(-0.05, -0.3)) - 0.3) - 0.13, q.y + 0.3);
    sd = min(stick, hook);
    c = mix(vec3(1.0), uColor, step(0.5, fract((q.x + q.y) * 2.6)));
  } else if (uStyle == S_PRESENTS) {
    float box = sdBox(q - vec2(0.0, 0.2), vec2(0.65, 0.55));
    float lid = sdBox(q - vec2(0.0, -0.42), vec2(0.75, 0.13));
    float bowL = sdEl(rot2(0.5) * (q - vec2(-0.2, -0.66)), vec2(0.22, 0.12));
    float bowR = sdEl(rot2(-0.5) * (q - vec2(0.2, -0.66)), vec2(0.22, 0.12));
    sd = min(min(box, lid), min(bowL, bowR));
    c = candy(vSeed);
    if (lid < 0.0) c *= 0.85;
    if (abs(q.x) < 0.1 || min(bowL, bowR) < 0.0 || (abs(q.y - 0.2) < 0.08 && box < 0.0)) c = uColor2;
  } else if (uStyle == S_TREES) {
    sd = 1e9;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float hw = 0.35 + fi * 0.18;
      vec2 p = vec2(abs(q.x), q.y - (-0.85 + fi * 0.38));
      sd = min(sd, max(dot(p, normalize(vec2(0.55, -hw))), p.y - 0.55));
    }
    c = uColor * (0.75 + 0.3 * hash(floor(q * 6.0) + vSeed));
    vec2 g = q * 4.0;
    vec2 cell = floor(g);
    float bh = hash(cell + vSeed * 13.0);
    if (length(fract(g) - 0.5) < 0.2 && bh > 0.6 && sd < -0.05) c = candy(hash(cell + 2.0)) * (1.0 + 0.4 * sin(vPhase * 3.0 + bh * 20.0));
    float trunk = sdBox(q - vec2(0.0, 0.85), vec2(0.1, 0.12));
    float star = sdStar5(vec2(q.x, -(q.y + 0.9)), 0.2, 0.45);
    if (trunk < sd) c = vec3(0.45, 0.25, 0.1);
    if (star < min(sd, trunk)) c = uColor2 * 1.4;
    sd = min(sd, min(trunk, star));
  } else if (uStyle == S_BELLS) {
    float w = mix(0.22, 0.7, smoothstep(-0.75, 0.55, q.y));
    float body = min(max(abs(q.x) - w, abs(q.y + 0.1) - 0.65), length(q - vec2(0.0, -0.72)) - 0.22);
    float lip = sdEl(q - vec2(0.0, 0.58), vec2(0.75, 0.1));
    float clapper = length(q - vec2(sin(vPhase * 3.0) * 0.15, 0.75)) - 0.13;
    float loop = abs(length(q - vec2(0.0, -0.95)) - 0.08) - 0.03;
    sd = min(min(body, lip), min(clapper, loop));
    c = uColor * (0.75 + 0.45 * (0.5 + 0.5 * sin(q.x * 3.0 + 1.0)));
    if (clapper < min(body, lip)) c = uColor2;
  } else if (uStyle == S_CANDLES || uStyle == S_DIYAS) {
    float flick = 0.85 + 0.15 * sin(vPhase * 9.0);
    float base;
    vec2 fp;
    if (uStyle == S_CANDLES) {
      base = sdBox(q - vec2(0.0, 0.35), vec2(0.2, 0.55));
      fp = q - vec2(sin(vPhase * 5.0) * 0.03, -0.5);
      c = uColor * (0.8 + 0.25 * (0.5 - q.x));
    } else {
      vec2 p = q - vec2(0.0, 0.3);
      base = max(sdEl(p, vec2(0.75, 0.38)), -p.y - 0.02);
      fp = q - vec2(sin(vPhase * 5.0) * 0.03, -0.12);
      c = uColor * (0.7 + 0.4 * p.y);
      if (base < 0.0 && abs(p.y - 0.12) < 0.04) c = uColor2;
    }
    fp.y /= fp.y < 0.0 ? 1.7 * flick : 0.9;
    float flame = length(fp) - 0.18;
    sd = min(base, flame);
    if (flame < base) c = flameColour(length(fp), 0.18);
    ec = mix(vec3(1.0, 0.7, 0.3), uColor2, 0.3);
    ea = exp(-max(flame, 0.0) * 7.0) * 0.45 * flick;
  } else if (uStyle == S_SHAMROCKS) {
    sd = 1e9;
    for (int i = 0; i < 3; i++) {
      vec2 p = rot2(float(i) * 2.0944) * vec2(q.x, -q.y);
      sd = min(sd, sdHeart(p / 0.5) * 0.5);
    }
    sd = min(sd, sdSegment(q, vec2(0.0, 0.1), vec2(0.15, 0.9)) - 0.06);
    c = uColor * (0.85 + 0.3 * (0.5 - q.y * 0.5));
  } else if (uStyle == S_EGGS) {
    sd = sdEl(vec2(q.x, q.y * (q.y < 0.0 ? 0.9 : 1.1)), vec2(0.62, 0.82));
    c = mix(uColor, uColor2, pick);
    if (abs(q.y - 0.05 - 0.08 * sin(q.x * 16.0)) < 0.06) c = mix(uColor2, uColor, pick) * 1.15;
    if (length(vec2(fract(q.x * 4.0) - 0.5, (q.y + 0.35) * 4.0)) < 0.25) c = vec3(1.0);
  } else if (uStyle == S_FLOWERS) {
    float r = length(q);
    sd = r - (0.42 + 0.45 * pow(abs(cos(2.5 * atan(q.y, q.x))), 0.6));
    c = r < 0.22 ? uColor2 * 1.1 : uColor * (0.75 + 0.35 * (1.0 - r));
  } else if (uStyle == S_BUTTERFLIES) {
    float f = 0.25 + 0.75 * abs(cos(vPhase * 6.0));
    vec2 p = vec2(abs(q.x) / f, q.y);
    float wings = min(sdEl(p - vec2(0.45, -0.22), vec2(0.42, 0.38)), sdEl(p - vec2(0.33, 0.3), vec2(0.3, 0.26))) * f;
    float body = sdEl(q, vec2(0.07, 0.45));
    float feelers = sdSegment(vec2(abs(q.x), q.y), vec2(0.02, -0.4), vec2(0.18, -0.7)) - 0.02;
    sd = min(min(wings, body), feelers);
    if (length(p - vec2(0.5, -0.25)) < 0.15) c = uColor2;
    if (min(body, feelers) < wings) c = vec3(0.15);
  } else if (uStyle == S_BUNNIES) {
    float head = sdEl(q - vec2(0.0, 0.35), vec2(0.42, 0.38));
    vec2 pe = vec2(abs(q.x), q.y);
    vec2 ep = rot2(-0.15) * (pe - vec2(0.18, -0.35));
    float ear = sdEl(ep, vec2(0.12, 0.4));
    sd = min(head, ear);
    if (sdEl(ep, vec2(0.05, 0.28)) < 0.0) c = uColor2;
    if (length(pe - vec2(0.16, 0.28)) < 0.05) c = vec3(0.1);
    if (length(q - vec2(0.0, 0.45)) < 0.05) c = uColor2;
  } else if (uStyle == S_BALLOONS) {
    float body = sdEl(q - vec2(0.0, -0.2), vec2(0.55, 0.66));
    float knot = sdBox(q - vec2(0.0, 0.5), vec2(0.06, 0.05));
    float str = sdSegment(q, vec2(0.0, 0.5), vec2(0.05 * sin(vPhase * 2.0), 1.35)) - 0.015;
    sd = min(min(body, knot), str);
    c = candy(vSeed) + 0.6 * exp(-dot2(q - vec2(-0.2, -0.45)) * 25.0);
    if (str < min(body, knot)) c = vec3(0.85);
  } else if (uStyle == S_LANTERNS) {
    float body = sdEl(q - vec2(0.0, 0.05), vec2(0.72, 0.55));
    float caps = min(sdBox(q - vec2(0.0, -0.55), vec2(0.32, 0.08)), sdBox(q - vec2(0.0, 0.62), vec2(0.32, 0.08)));
    float tassel = sdSegment(q, vec2(0.0, 0.7), vec2(0.0, 1.25)) - 0.04;
    float hang = sdSegment(q, vec2(0.0, -0.62), vec2(0.0, -1.3)) - 0.015;
    sd = min(min(body, caps), min(tassel, hang));
    float rib = abs(sin(asin(clamp(q.x / 0.72, -1.0, 1.0)) * 5.0));
    c = uColor * (0.7 + 0.7 * (1.0 - length((q - vec2(0.0, 0.05)) / vec2(0.72, 0.55)))) * mix(0.75, 1.0, smoothstep(0.0, 0.2, rib));
    if (min(caps, tassel) < body) c = uColor2;
    ec = uColor * 1.2;
    ea = exp(-max(body, 0.0) * 5.0) * 0.35;
  } else if (uStyle == S_STAR_OF_DAVID) {
    float star = min(sdEqTri(vec2(q.x, -q.y), 0.72), sdEqTri(q, 0.72));
    sd = abs(star + 0.08) - 0.08;
    c = mix(uColor, uColor2, 0.5 + 0.5 * q.y);
  } else if (uStyle == S_FIREWORKS) {
    // A burst that grows, fades and starts again; light only.
    float cyc = fract(vPhase * 0.12 + vSeed);
    float r = length(q);
    float sector = atan(q.y, q.x) / 6.2832 * 14.0 + vSeed * 7.0;
    float ray = abs(fract(sector) - 0.5) * 6.2832 / 14.0 * r;
    float outer = cyc * 1.15;
    float inner = max(0.0, cyc - 0.35) * 1.15;
    float along = smoothstep(inner, inner + 0.08, r) * (1.0 - smoothstep(outer - 0.02, outer + 0.04, r));
    float line = exp(-ray * ray / (0.0012 + 0.003 * cyc)) * along;
    float tip = exp(-(ray * ray + (r - outer) * (r - outer)) / 0.004);
    float lum = (line * 0.8 + tip * 1.3) * (1.0 - smoothstep(0.55, 1.0, cyc));
    ec = mix(uColor, uColor2, step(0.5, fract(floor(sector) * 0.37 + vSeed))) * 1.4;
    ea = clamp(lum, 0.0, 1.0);
  } else if (uStyle == S_FISH) {
    vec2 p = vec2(q.x * vFlip, q.y);
    float wag = sin(vPhase * 6.0) * 0.12;
    float body = sdEl(p - vec2(0.1, 0.0), vec2(0.58, 0.34));
    vec2 tp = p - vec2(-0.5, wag);
    float tail = max(max(tp.x - 0.05, -tp.x - 0.4), abs(tp.y) + tp.x - 0.02);
    sd = min(body, tail);
    c = uColor * (0.75 + 0.4 * (0.5 - p.y));
    if (tail < body || (body < 0.0 && abs(fract(p.x * 3.0) - 0.5) < 0.12)) c = uColor2;
    if (length(p - vec2(0.45, -0.08)) < 0.06) c = vec3(0.05);
  } else if (uStyle == S_BUBBLES) {
    float r = length(q);
    sd = abs(r - 0.78) - 0.05;
    c = uColor + exp(-dot2(q - vec2(-0.35, -0.4)) * 30.0);
    ec = uColor;
    ea = r < 0.78 ? 0.12 : 0.0;
  } else if (uStyle == S_LEAVES) {
    vec2 p = rot2(0.6) * q;
    float leaf = max(length(p - vec2(0.55, 0.0)) - 0.85, length(p + vec2(0.55, 0.0)) - 0.85);
    float stem = sdSegment(p, vec2(0.0, 0.55), vec2(0.0, 0.95)) - 0.04;
    sd = min(leaf, stem);
    c = mix(uColor, uColor2, vSeed) * (0.8 + 0.3 * (0.5 - p.y * 0.4));
    if (abs(p.x) < 0.025 && leaf < 0.0) c *= 0.7;
  } else if (uStyle == S_MOONS) {
    sd = max(length(q) - 0.8, -(length(q - vec2(0.38, -0.18)) - 0.68));
    c = uColor * (0.85 + 0.2 * hash(floor(q * 5.0) + vSeed));
    ec = uColor;
    ea = exp(-max(sd, 0.0) * 6.0) * 0.25;
  } else if (uStyle == S_NOTES) {
    float head = sdEl(rot2(-0.4) * (q - vec2(-0.2, 0.52)), vec2(0.28, 0.19));
    float stem = sdSegment(q, vec2(0.05, 0.48), vec2(0.05, -0.75)) - 0.05;
    float flag = sdSegment(q, vec2(0.05, -0.75), vec2(0.38, -0.35)) - 0.06;
    sd = min(head, min(stem, flag));
    c = mix(uColor, uColor2, pick);
  } else if (uStyle == S_SNOWMEN) {
    float balls = min(min(length(q - vec2(0.0, 0.52)) - 0.4, length(q - vec2(0.0, -0.02)) - 0.3), length(q - vec2(0.0, -0.45)) - 0.22);
    float hat = min(sdBox(q - vec2(0.0, -0.75), vec2(0.17, 0.14)), sdBox(q - vec2(0.0, -0.62), vec2(0.28, 0.04)));
    float nose = sdSegment(q, vec2(0.0, -0.43), vec2(0.18, -0.4)) - 0.035;
    sd = min(balls, min(hat, nose));
    c = uColor * (0.85 + 0.15 * (0.5 - q.y * 0.5));
    if (length(vec2(abs(q.x) - 0.08, q.y + 0.5)) < 0.035 || length(vec2(q.x, q.y + 0.05)) < 0.04 || length(vec2(q.x, q.y - 0.1)) < 0.04) c = vec3(0.05);
    if (hat < balls) c = uColor2;
    if (nose < min(balls, hat)) c = vec3(1.0, 0.5, 0.1);
  } else if (uStyle == S_COINS) {
    float r = length(q);
    sd = r - 0.8;
    c = uColor * (0.8 + 0.4 * (0.5 - q.y * 0.5));
    if (r > 0.66) c *= 0.8;
    if (abs(r - 0.5) < 0.03) c *= 1.25;
    c += 0.5 * smoothstep(0.1, 0.0, abs(q.x + q.y - 0.6 * sin(vPhase))) * step(r, 0.8);
  } else if (uStyle == S_FOOTPRINTS) {
    // A left and a right footprint, stepping: each glows in turn.
    float step2 = fract(vPhase * 0.25);
    sd = 1e9;
    float lit = 0.0;
    for (int f = 0; f < 2; f++) {
      float side = f == 0 ? -1.0 : 1.0;
      vec2 p = vec2((q.x - side * 0.32) * side, q.y - side * 0.2) / 0.95;
      float foot = min(min(sdEl(p - vec2(0.0, -0.08), vec2(0.25, 0.38)), sdEl(p - vec2(0.0, 0.4), vec2(0.19, 0.21))),
                       min(min(length(p - vec2(-0.16, -0.6)) - 0.085, length(p - vec2(-0.04, -0.64)) - 0.07),
                           min(length(p - vec2(0.07, -0.61)) - 0.06, length(p - vec2(0.16, -0.55)) - 0.05)));
      foot *= 0.95;
      if (foot < sd) { sd = foot; lit = f == 0 ? step(step2, 0.5) : step(0.5, step2); }
    }
    c = mix(uColor, uColor2, lit * 0.6) * mix(0.7, 1.25, lit);
    ec = uColor;
    ea = exp(-max(sd, 0.0) * 12.0) * 0.25 * lit;
  } else if (uStyle == S_WELCOME_MAT) {
    // A doormat with a border and WELCOME across it, wider than tall.
    float mat = sdBox(q, vec2(0.95, 0.55)) - 0.04;
    sd = mat;
    c = uColor * (0.75 + 0.35 * hash(floor(q * 40.0) + vSeed));
    float border = abs(sdBox(q, vec2(0.82, 0.43))) - 0.025;
    float word = 1e9;
    for (int i = 0; i < 7; i++) {
      vec2 p = (q - vec2(-0.615 + float(i) * 0.205, 0.0)) / vec2(0.07, 0.13);
      float d;
      if (i == 0) {
        d = min(min(sdSegment(p, vec2(-1.0, -1.0), vec2(-0.5, 1.0)), sdSegment(p, vec2(-0.5, 1.0), vec2(0.0, -0.2))),
                min(sdSegment(p, vec2(0.0, -0.2), vec2(0.5, 1.0)), sdSegment(p, vec2(0.5, 1.0), vec2(1.0, -1.0))));
      } else if (i == 1 || i == 6) {
        d = min(min(sdSegment(p, vec2(-1.0, -1.0), vec2(-1.0, 1.0)), sdSegment(p, vec2(-1.0, -1.0), vec2(1.0, -1.0))),
                min(sdSegment(p, vec2(-1.0, 0.0), vec2(0.6, 0.0)), sdSegment(p, vec2(-1.0, 1.0), vec2(1.0, 1.0))));
      } else if (i == 2) {
        d = min(sdSegment(p, vec2(-1.0, -1.0), vec2(-1.0, 1.0)), sdSegment(p, vec2(-1.0, 1.0), vec2(1.0, 1.0)));
      } else if (i == 3) {
        d = min(min(sdSegment(p, vec2(1.0, -1.0), vec2(-1.0, -1.0)), sdSegment(p, vec2(-1.0, -1.0), vec2(-1.0, 1.0))),
                sdSegment(p, vec2(-1.0, 1.0), vec2(1.0, 1.0)));
      } else if (i == 4) {
        d = abs(sdBox(p, vec2(1.0)));
      } else {
        d = min(min(sdSegment(p, vec2(-1.0, 1.0), vec2(-1.0, -1.0)), sdSegment(p, vec2(-1.0, -1.0), vec2(0.0, 0.2))),
                min(sdSegment(p, vec2(0.0, 0.2), vec2(1.0, -1.0)), sdSegment(p, vec2(1.0, -1.0), vec2(1.0, 1.0))));
      }
      // Back from letter units to the object's square (the smaller scale).
      word = min(word, d * 0.07 - 0.022);
    }
    if (min(border, word) < 0.0 && mat < 0.0) c = uColor2 * 1.15;
  } else if (uStyle == S_RUNWAY_ARROWS) {
    // A glowing chevron pointing up the picture, like a landing strip.
    vec2 p = vec2(abs(q.x), q.y);
    sd = sdSegment(p, vec2(0.0, -0.45), vec2(0.65, 0.3)) - 0.13;
    float sweep = 0.5 + 0.5 * sin(vPhase * 3.0 - q.y * 3.0);
    c = mix(uColor, uColor2, sweep) * (0.9 + 0.5 * sweep);
    ec = uColor;
    ea = exp(-max(sd, 0.0) * 8.0) * 0.35;
  } else if (uStyle == S_GINGERBREAD) {
    float head = length(q - vec2(0.0, -0.58)) - 0.27;
    float body = sdEl(q - vec2(0.0, 0.02), vec2(0.3, 0.36));
    float arms = sdSegment(q, vec2(-0.62, -0.22), vec2(0.62, -0.22)) - 0.14;
    vec2 pl = vec2(abs(q.x), q.y);
    float legs = sdSegment(pl, vec2(0.08, 0.2), vec2(0.36, 0.84)) - 0.15;
    sd = min(min(head, body), min(arms, legs));
    c = uColor * (0.8 + 0.3 * (0.5 - q.y * 0.4)) * (0.92 + 0.12 * hash(floor(q * 14.0) + vSeed));
    // White icing squiggles on the hands and feet, buttons, eyes and a smile.
    float wig = 0.03 * sin(q.y * 40.0);
    if (abs(abs(q.x) - 0.5 + wig) < 0.035 && arms < 0.0) c = vec3(1.0);
    if (abs(q.y - 0.68 + 0.03 * sin(q.x * 40.0)) < 0.035 && legs < 0.0) c = vec3(1.0);
    if (length(vec2(q.x, mod(q.y + 0.12, 0.2) - 0.1)) < 0.06 && abs(q.y) < 0.25) c = uColor2;
    if (length(vec2(abs(q.x) - 0.1, q.y + 0.64)) < 0.045) c = vec3(1.0);
    if (abs(length(q - vec2(0.0, -0.6)) - 0.15) < 0.025 && q.y > -0.53) c = vec3(1.0);
  } else if (uStyle == S_STOCKINGS) {
    float leg = sdBox(q - vec2(-0.08, -0.2), vec2(0.28, 0.5)) - 0.04;
    float foot = sdEl(q - vec2(0.16, 0.42), vec2(0.48, 0.28));
    float cuff = sdBox(q - vec2(-0.08, -0.74), vec2(0.38, 0.16)) - 0.05;
    sd = min(min(leg, foot), cuff);
    c = mix(uColor, uColor2, step(0.5, fract((q.y - q.x * 0.6) * 3.0))) * (0.8 + 0.25 * (0.4 - q.x));
    if (length(q - vec2(0.42, 0.45)) < 0.2 || length(q - vec2(-0.22, 0.52)) < 0.16) c = vec3(1.0) * 0.95;
    if (cuff < min(leg, foot)) c = vec3(1.0) * (0.88 + 0.12 * hash(floor(q * 18.0)));
  } else if (uStyle == S_WREATHS) {
    float a = atan(q.y, q.x);
    float r = length(q);
    float ring = abs(r - 0.58) - 0.24 - 0.05 * abs(sin(a * 9.0)) - 0.03 * sin(a * 23.0 + vSeed * 9.0);
    vec2 bp = q - vec2(0.0, 0.62);
    float bow = min(sdEl(rot2(0.5) * (bp - vec2(-0.18, -0.02)), vec2(0.2, 0.11)), sdEl(rot2(-0.5) * (bp - vec2(0.18, -0.02)), vec2(0.2, 0.11)));
    float tails = min(sdSegment(bp, vec2(0.0), vec2(-0.16, 0.3)), sdSegment(bp, vec2(0.0), vec2(0.16, 0.3))) - 0.06;
    sd = min(ring, min(bow, tails));
    c = uColor * (0.65 + 0.5 * hash(floor(vec2(a * 6.0, r * 9.0)) + vSeed));
    vec2 bc = vec2(cos(floor(a * 1.6 + 0.5) / 1.6), sin(floor(a * 1.6 + 0.5) / 1.6)) * 0.6;
    if (length(q - bc) < 0.08 && ring < 0.0) c = vec3(0.95, 0.1, 0.12);
    if (min(bow, tails) < ring) c = uColor2 * (0.85 + 0.3 * (0.5 - bp.y));
  } else if (uStyle == S_SANTA_HATS) {
    float cone = sdTri(q, vec2(-0.6, 0.38), vec2(0.58, 0.38), vec2(0.5, -0.66)) - 0.05;
    float brim = sdBox(q - vec2(0.0, 0.48), vec2(0.7, 0.13)) - 0.06;
    float pom = length(q - vec2(0.52, -0.7)) - 0.19;
    sd = min(min(cone, brim), pom);
    c = uColor * (0.75 + 0.4 * (0.5 - q.x * 0.4));
    if (min(brim, pom) < cone) c = uColor2 * (0.9 + 0.1 * hash(floor(q * 20.0)));
  } else if (uStyle == S_REINDEER) {
    float head = sdEl(q - vec2(0.0, 0.08), vec2(0.4, 0.5));
    float snout = sdEl(q - vec2(0.0, 0.42), vec2(0.3, 0.22));
    vec2 pe = vec2(abs(q.x), q.y);
    float ear = sdEl(rot2(-0.6) * (pe - vec2(0.46, -0.24)), vec2(0.2, 0.09));
    float antler = min(min(sdSegment(pe, vec2(0.2, -0.36), vec2(0.42, -0.86)), sdSegment(pe, vec2(0.33, -0.62), vec2(0.6, -0.7))),
      sdSegment(pe, vec2(0.38, -0.76), vec2(0.28, -0.98))) - 0.055;
    float nose = length(q - vec2(0.0, 0.34)) - 0.13;
    sd = min(min(min(head, snout), min(ear, antler)), nose);
    c = uColor * (0.75 + 0.35 * (0.5 - q.y * 0.5));
    if (snout < 0.0) c = mix(uColor, vec3(0.95, 0.85, 0.7), 0.55);
    if (antler < min(head, ear)) c = vec3(0.9, 0.8, 0.6);
    if (length(pe - vec2(0.17, -0.02)) < 0.065) c = vec3(0.05);
    if (nose < 0.0) c = uColor2 * 1.3 + 0.5 * exp(-dot2(q - vec2(-0.04, 0.3)) * 120.0);
    ec = uColor2;
    ea = 0.7 * exp(-max(nose, 0.0) * 9.0);
  } else if (uStyle == S_POINSETTIAS) {
    float petals = 1e9;
    float inner = 1e9;
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.0472;
      petals = min(petals, sdEl(rot2(a) * q - vec2(0.0, -0.5), vec2(0.17, 0.42)));
      inner = min(inner, sdEl(rot2(a + 0.5236) * q - vec2(0.0, -0.32), vec2(0.13, 0.28)));
    }
    float centre = length(q) - 0.14;
    sd = min(min(petals, inner), centre);
    c = uColor * (0.7 + 0.35 * (1.0 - length(q)));
    if (inner < petals) c = uColor * 1.1;
    if (centre < 0.0 || (length(q) < 0.2 && hash(floor(q * 30.0) + vSeed) > 0.6)) c = uColor2 * 1.2;
  } else if (uStyle == S_HOLLY) {
    vec2 l1 = rot2(0.5) * (q - vec2(-0.38, 0.18));
    vec2 l2 = rot2(-0.5) * (q - vec2(0.38, 0.18));
    float leaf1 = sdEl(l1, vec2(0.52, 0.22)) + 0.05 * abs(sin(l1.x * 13.0));
    float leaf2 = sdEl(l2, vec2(0.52, 0.22)) + 0.05 * abs(sin(l2.x * 13.0));
    float berries = min(min(length(q - vec2(-0.12, -0.12)) - 0.16, length(q - vec2(0.13, -0.14)) - 0.16), length(q - vec2(0.0, -0.36)) - 0.16);
    sd = min(min(leaf1, leaf2), berries);
    c = uColor * (0.75 + 0.3 * (0.5 - q.y * 0.5));
    if (abs((leaf1 < leaf2 ? l1 : l2).y) < 0.02) c *= 1.4;
    if (berries < min(leaf1, leaf2)) c = uColor2 * (0.85 + 0.2 * (0.5 - q.y)) + 0.6 * exp(-dot2(q - vec2(-0.05, -0.42)) * 90.0);
  } else if (uStyle == S_MITTENS) {
    float palm = sdEl(q - vec2(0.05, -0.12), vec2(0.42, 0.56));
    float thumb = sdEl(rot2(-0.6) * (q - vec2(-0.4, 0.02)), vec2(0.15, 0.3));
    float cuff = sdBox(q - vec2(0.05, 0.56), vec2(0.4, 0.17)) - 0.04;
    sd = min(min(palm, thumb), cuff);
    c = uColor * (0.75 + 0.35 * (0.5 - q.x * 0.5));
    if (abs(q.y + 0.08) < 0.09 && palm < 0.0) c = uColor2;
    if (abs(q.y + 0.08) < 0.04 && palm < 0.0 && fract(q.x * 6.0) < 0.5) c = vec3(1.0);
    if (cuff < min(palm, thumb)) c = mix(vec3(1.0), uColor2, step(0.5, fract(q.x * 8.0))) * 0.95;
  } else if (uStyle == S_TURKEYS) {
    float a = atan(q.x, -(q.y - 0.3));
    float fan = max(length(q - vec2(0.0, 0.3)) - 0.92 - 0.06 * abs(sin(a * 6.0)), q.y - 0.32);
    float body = length(q - vec2(0.0, 0.32)) - 0.4;
    float head = length(q - vec2(0.0, -0.12)) - 0.2;
    float beak = sdTri(q, vec2(-0.06, -0.08), vec2(0.06, -0.08), vec2(0.0, 0.06));
    sd = min(min(fan, body), min(head, beak));
    float band = floor((length(q - vec2(0.0, 0.3)) - 0.4) / 0.17);
    c = band < 1.0 ? uColor2 : band < 2.0 ? vec3(0.95, 0.55, 0.1) : band < 3.0 ? vec3(0.85, 0.2, 0.1) : vec3(0.95, 0.8, 0.2);
    if (body < 0.0 || head < 0.0) c = uColor * (0.8 + 0.3 * (0.5 - q.y));
    if (length(vec2(abs(q.x) - 0.08, q.y + 0.17)) < 0.04) c = vec3(0.05);
    if (beak < 0.0) c = vec3(1.0, 0.7, 0.1);
    if (length(q - vec2(0.06, 0.08)) < 0.06) c = vec3(0.9, 0.1, 0.1);
  } else if (uStyle == S_CANDY_CORN) {
    float body = sdTri(q, vec2(-0.62, -0.72), vec2(0.62, -0.72), vec2(0.0, 0.92)) - 0.12;
    sd = body;
    c = q.y < -0.25 ? vec3(1.0, 0.97, 0.88) : q.y < 0.3 ? uColor : uColor2;
    c *= 0.85 + 0.25 * (0.4 - q.x * 0.5);
    c += 0.3 * exp(-dot2(q - vec2(-0.2, -0.4)) * 25.0);
  } else if (uStyle == S_SKULLS) {
    float cranium = length(q - vec2(0.0, -0.18)) - 0.68;
    float jaw = sdBox(q - vec2(0.0, 0.5), vec2(0.36, 0.2)) - 0.08;
    sd = min(cranium, jaw);
    c = uColor * (0.8 + 0.25 * (0.5 - q.y * 0.5));
    vec2 pe = vec2(abs(q.x) - 0.27, q.y + 0.1);
    float eye = sdEl(pe, vec2(0.17, 0.2));
    float nose = sdTri(q, vec2(-0.08, 0.32), vec2(0.08, 0.32), vec2(0.0, 0.14));
    float teeth = step(0.5, fract(q.x * 6.0 + 0.5)) * step(abs(q.y - 0.52), 0.12) * step(abs(q.x), 0.3);
    if (eye < 0.0) {
      c = uColor2 * (1.2 + 0.8 * exp(-dot2(pe) * 60.0));
      ec = uColor2;
    }
    if (nose < 0.0) c = vec3(0.05);
    if (teeth > 0.5 && jaw < 0.0) c *= 0.55;
    ea = 0.45 * exp(-max(eye, 0.0) * 10.0) * step(0.0, -cranium + 0.3);
  } else if (uStyle == S_TOMBSTONES) {
    float stone = min(sdBox(q - vec2(0.0, 0.2), vec2(0.6, 0.6)), length(q - vec2(0.0, -0.4)) - 0.6);
    float mound = sdEl(q - vec2(0.0, 0.86), vec2(0.95, 0.16));
    sd = min(stone, mound);
    c = uColor * (0.7 + 0.35 * (0.5 - q.y * 0.5)) * (0.9 + 0.15 * hash(floor(q * 16.0) + vSeed));
    // R.I.P. carved in, and grass on the mound.
    vec2 r = q - vec2(0.0, -0.2);
    float letters = min(min(sdSegment(r, vec2(-0.38, -0.12), vec2(-0.38, 0.14)), sdSegment(r, vec2(-0.38, -0.12), vec2(-0.24, -0.06))),
      min(min(sdSegment(r, vec2(-0.24, -0.06), vec2(-0.38, 0.0)), sdSegment(r, vec2(-0.38, 0.0), vec2(-0.24, 0.14))),
      min(sdSegment(r, vec2(0.0, -0.12), vec2(0.0, 0.14)), min(sdSegment(r, vec2(0.22, -0.12), vec2(0.22, 0.14)),
      min(sdSegment(r, vec2(0.22, -0.12), vec2(0.36, -0.06)), sdSegment(r, vec2(0.36, -0.06), vec2(0.22, 0.02)))))));
    if (letters < 0.035 && stone < 0.0) c *= 0.35;
    float cross = min(sdBox(q - vec2(0.0, 0.32), vec2(0.04, 0.16)), sdBox(q - vec2(0.0, 0.26), vec2(0.12, 0.035)));
    if (cross < 0.0) c *= 0.45;
    if (mound < 0.0 && mound < stone) c = uColor2 * (0.6 + 0.5 * hash(floor(q * 30.0)));
  } else if (uStyle == S_CAULDRONS) {
    float pot = max(length(q - vec2(0.0, 0.18)) - 0.7, -0.22 - q.y);
    float rim = sdBox(q - vec2(0.0, -0.24), vec2(0.72, 0.08)) - 0.05;
    vec2 pl = vec2(abs(q.x), q.y);
    float legs = sdSegment(pl, vec2(0.42, 0.72), vec2(0.52, 0.94)) - 0.07;
    // Bubbles rising from the brew.
    float bubbles = 1e9;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float t = fract(vPhase * 0.25 + fi * 0.33);
      vec2 bc = vec2((fi - 1.0) * 0.32 + 0.06 * sin(vPhase + fi), -0.32 - t * 0.6);
      bubbles = min(bubbles, length(q - bc) - 0.11 * (1.0 - t * 0.6));
    }
    float brew = sdEl(q - vec2(0.0, -0.3), vec2(0.62, 0.1));
    sd = min(min(min(pot, rim), legs), min(bubbles, brew));
    c = vec3(0.13, 0.12, 0.15) * (1.0 + 0.6 * exp(-dot2(q - vec2(-0.3, 0.0)) * 6.0));
    if (rim < 0.0) c = vec3(0.25, 0.24, 0.28);
    if (brew < 0.0 || bubbles < 0.0) c = uColor * (1.1 + 0.4 * sin(vPhase * 2.0 + q.x * 6.0));
    ec = uColor;
    ea = 0.7 * exp(-max(min(brew, bubbles), 0.0) * 7.0) * step(q.y, -0.2);
    // The fire glows under it.
    float fire = sdEl(q - vec2(0.0, 0.9), vec2(0.45, 0.12 + 0.05 * sin(vPhase * 7.0)));
    if (fire < sd) {
      sd = fire;
      c = uColor2 * 1.4;
    }
  } else if (uStyle == S_WITCH_HATS) {
    vec2 p = q;
    p.x += 0.18 * smoothstep(-0.2, -0.95, q.y) * (q.y + 0.2);
    float cone = sdTri(p, vec2(-0.42, 0.42), vec2(0.42, 0.42), vec2(0.18, -0.95)) - 0.04;
    float brim = sdEl(q - vec2(0.0, 0.5), vec2(0.95, 0.16));
    sd = min(cone, brim);
    c = uColor * (0.8 + 0.4 * (0.5 - q.x * 0.5));
    if (abs(q.y - 0.3) < 0.08 && cone < 0.0) c = uColor2;
    if (sdBox(q - vec2(0.0, 0.3), vec2(0.1, 0.1)) < 0.0 && abs(q.x) > 0.05) c = vec3(1.0, 0.85, 0.3);
  } else if (uStyle == S_ACORNS) {
    float nut = sdEl(q - vec2(0.0, 0.2), vec2(0.5, 0.62));
    float cap = max(sdEl(q - vec2(0.0, -0.22), vec2(0.66, 0.36)), q.y + 0.02 - 0.0);
    float stem = sdSegment(q, vec2(0.0, -0.56), vec2(0.12, -0.84)) - 0.07;
    sd = min(min(nut, cap), stem);
    c = uColor * (0.75 + 0.35 * (0.5 - q.x * 0.6)) + 0.3 * exp(-dot2(q - vec2(-0.2, 0.15)) * 20.0);
    if (min(cap, stem) < nut || q.y < -0.04) c = uColor2 * (0.7 + 0.4 * hash(floor(q * 18.0) + vSeed));
  } else if (uStyle == S_PIES) {
    float dish = sdEl(q - vec2(0.0, 0.25), vec2(0.92, 0.42));
    float top = sdEl(q - vec2(0.0, 0.1), vec2(0.86, 0.36));
    float steam = 1e9;
    for (int i = 0; i < 3; i++) {
      float fi = float(i) - 1.0;
      float yy = -0.35 - 0.5 * fract(vPhase * 0.2 + fi * 0.3);
      steam = min(steam, abs(q.x - fi * 0.3 - 0.07 * sin(q.y * 9.0 + vPhase * 2.0)) - 0.04 + step(q.y, yy - 0.25) + step(yy, q.y));
    }
    sd = min(dish, steam);
    c = uColor2 * (0.75 + 0.3 * hash(floor(q * 20.0)));
    if (top < 0.0) c = uColor * (0.85 + 0.2 * (0.5 - q.y));
    if (abs(top) < 0.06) c = uColor2 * 1.1;
    if (length(q - vec2(0.0, 0.05)) < 0.18) c = vec3(1.0, 0.98, 0.92);
    if (steam < dish) c = vec3(0.9);
    own = steam < dish ? 0.5 : 1.0;
  } else if (uStyle == S_PARTY_HATS) {
    float cone = sdTri(q, vec2(-0.55, 0.72), vec2(0.55, 0.72), vec2(0.0, -0.72)) - 0.04;
    float pom = length(q - vec2(0.0, -0.78)) - 0.16;
    sd = min(cone, pom);
    float stripes = step(0.5, fract((q.y - q.x * 0.5) * 3.0));
    c = mix(uColor, uColor2, stripes) * (0.8 + 0.3 * (0.4 - q.x * 0.5));
    if (length(vec2(fract(q.x * 4.0 + 0.5) - 0.5, fract(q.y * 4.0) - 0.5)) < 0.12 && cone < 0.0) c = vec3(1.0, 0.9, 0.3);
    if (pom < cone) c = vec3(1.0, 0.95, 0.6);
    if (abs(q.y - 0.68) < 0.05 && cone < 0.0) c = vec3(1.0, 0.85, 0.2);
  } else if (uStyle == S_CHAMPAGNE) {
    vec2 p = vec2(abs(q.x), q.y);
    float bowl = max(sdEl(q - vec2(0.0, -0.62), vec2(0.44, 0.58)), -(q.y + 0.62));
    float stem = sdBox(q - vec2(0.0, 0.34), vec2(0.04, 0.32));
    float base = sdEl(q - vec2(0.0, 0.7), vec2(0.36, 0.08));
    sd = min(min(bowl, stem), base);
    c = vec3(0.85, 0.92, 1.0) * 0.6;
    if (bowl < 0.0 && q.y > -0.5) c = uColor * (0.9 + 0.3 * (0.5 - q.y));
    // Bubbles rising in it.
    vec2 bq = vec2(q.x * 6.0, q.y * 6.0 + vPhase * 2.0);
    if (bowl < 0.0 && length(fract(bq) - 0.5) < 0.16 && hash(floor(bq)) > 0.6) c = vec3(1.0);
    if (abs(p.x - 0.3) < 0.035 && bowl < 0.0 && q.y < -0.5) c = vec3(1.0);
  } else if (uStyle == S_FLAGS) {
    // A waving flag on a pole: stripes and a starry corner.
    float wave = 0.08 * sin(q.x * 4.0 - vPhase * 4.0);
    vec2 p = vec2(q.x, q.y - wave * (q.x + 0.75));
    float cloth = sdBox(p - vec2(0.12, -0.25), vec2(0.72, 0.48));
    float pole = sdBox(q - vec2(-0.66, 0.1), vec2(0.04, 0.9));
    sd = min(cloth, pole);
    float stripe = step(0.5, fract((p.y + 0.73) * 6.5));
    c = mix(uColor, vec3(1.0), stripe);
    if (p.x < 0.1 && p.y < -0.23) {
      c = uColor2;
      vec2 st = fract(vec2(p.x, p.y) * 9.0) - 0.5;
      if (length(st) < 0.18) c = vec3(1.0);
    }
    c *= 0.8 + 0.35 * (0.5 + 0.5 * sin(q.x * 4.0 - vPhase * 4.0 + 1.0));
    if (pole < cloth) c = vec3(0.85, 0.75, 0.4);
  } else if (uStyle == S_CUPCAKES) {
    float cup = sdTri(q, vec2(-0.55, 0.05), vec2(0.55, 0.05), vec2(0.0, 1.4));
    cup = max(cup, q.y - 0.85);
    float frosting = min(sdEl(q - vec2(0.0, -0.08), vec2(0.62, 0.2)), min(sdEl(q - vec2(0.0, -0.28), vec2(0.45, 0.17)), sdEl(q - vec2(0.0, -0.45), vec2(0.26, 0.13))));
    float cherry = length(q - vec2(0.0, -0.62)) - 0.12;
    float flame = sdEl(q - vec2(0.18, -0.92 - 0.03 * sin(vPhase * 9.0)), vec2(0.06, 0.11));
    float candle = sdBox(q - vec2(0.18, -0.68), vec2(0.035, 0.16));
    sd = min(min(min(cup, frosting), cherry), min(flame, candle));
    c = uColor2 * (0.7 + 0.3 * step(0.5, fract(q.x * 7.0)));
    if (frosting < cup) c = uColor * (0.9 + 0.3 * (0.4 - q.y));
    if (frosting < 0.0 && hash(floor(q * 22.0) + vSeed) > 0.85) c = candy(hash(floor(q * 22.0)));
    if (cherry < 0.0) c = vec3(0.9, 0.1, 0.15) + 0.4 * exp(-dot2(q - vec2(-0.04, -0.66)) * 200.0);
    if (candle < 0.0) c = vec3(1.0, 0.95, 0.9);
    if (flame < 0.0) c = flameColour(length(q - vec2(0.18, -0.95)), 0.1);
    ec = vec3(1.0, 0.7, 0.3);
    ea = 0.6 * exp(-max(flame, 0.0) * 12.0);
  } else if (uStyle == S_CHICKS) {
    float body = length(q - vec2(0.0, 0.25)) - 0.55;
    float head = length(q - vec2(0.18, -0.38)) - 0.36;
    float beak = sdTri(q, vec2(0.48, -0.42), vec2(0.48, -0.28), vec2(0.72, -0.35));
    float shell = max(sdEl(q - vec2(0.0, 0.55), vec2(0.66, 0.42)), -q.y + 0.36 + 0.08 * step(0.5, fract(q.x * 3.5)));
    sd = min(min(body, head), min(beak, shell));
    c = uColor * (0.85 + 0.3 * (0.4 - q.y * 0.4));
    if (beak < 0.0) c = vec3(1.0, 0.55, 0.1);
    if (length(q - vec2(0.28, -0.44)) < 0.06) c = vec3(0.05);
    if (shell < min(body, head)) c = uColor2 * (0.85 + 0.2 * (0.5 - q.x));
    float wing = sdEl(rot2(0.6 + 0.3 * sin(vPhase * 5.0)) * (q - vec2(-0.3, 0.2)), vec2(0.28, 0.14));
    if (wing < 0.0 && shell > 0.0) c *= 0.8;
  } else if (uStyle == S_POTS_OF_GOLD) {
    float pot = max(length(q - vec2(0.0, 0.3)) - 0.6, -0.08 - q.y);
    float rim = sdBox(q - vec2(0.0, -0.08), vec2(0.62, 0.08)) - 0.04;
    float coins = 1e9;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      vec2 cc = vec2((fi - 2.5) * 0.2, -0.22 - 0.12 * sin(fi * 2.3) - 0.1 * step(1.5, fi) * step(fi, 3.5));
      coins = min(coins, length(q - cc) - 0.15);
    }
    sd = min(min(pot, rim), coins);
    c = vec3(0.1, 0.1, 0.11) * (1.0 + 0.8 * exp(-dot2(q - vec2(-0.25, 0.2)) * 8.0));
    if (rim < 0.0) c = vec3(0.2);
    if (coins < min(pot, rim)) {
      c = uColor * (0.9 + 0.4 * hash(floor(q * 12.0)));
      ec = uColor;
    }
    ea = 0.5 * exp(-max(coins, 0.0) * 8.0) * step(q.y, 0.0);
    if (abs(q.y - 0.3) < 0.06 && pot < 0.0) c = uColor2;
  } else if (uStyle == S_RAINBOWS) {
    float r = length(q - vec2(0.0, 0.55));
    float arc = max(abs(r - 0.68) - 0.3, q.y - 0.55);
    float cloudL = min(length(q - vec2(-0.72, 0.52)) - 0.22, length(q - vec2(-0.5, 0.58)) - 0.18);
    float cloudR = min(length(q - vec2(0.72, 0.52)) - 0.22, length(q - vec2(0.5, 0.58)) - 0.18);
    sd = min(arc, min(cloudL, cloudR));
    float band = clamp(floor((r - 0.38) / 0.6 * 6.0), 0.0, 5.0);
    c = band < 1.0 ? vec3(0.55, 0.3, 0.95) : band < 2.0 ? vec3(0.2, 0.45, 1.0) : band < 3.0 ? vec3(0.2, 0.8, 0.35)
      : band < 4.0 ? vec3(1.0, 0.85, 0.15) : band < 5.0 ? vec3(1.0, 0.55, 0.1) : vec3(0.95, 0.15, 0.2);
    if (min(cloudL, cloudR) < arc) c = vec3(1.0);
  }

  c = mix(c, uColor2, vTint * 0.85) * vBright;
  float a = (1.0 - smoothstep(-vAA, vAA, sd)) * own;
  if (uStyle != S_EYES) a *= vBlink;
  // Lit up near people: a soft halo around the object.
  float edge = 1.0 - smoothstep(1.05, 1.4, max(abs(q.x), abs(q.y)));
  float halo = vGlow * exp(-max(sd, 0.0) * 6.0) * 0.6 * edge;
  vec3 haloColour = mix(uColor, vec3(1.0), 0.35);
  ea = clamp(ea * vBright, 0.0, 1.0) * edge;
  vec3 col = c * a + (ec * ea + haloColour * halo) * (1.0 - a);
  float alpha = clamp(a + (ea + halo) * (1.0 - a), 0.0, 1.0);
  outColor = vec4(col, alpha) * vAlpha;
}`
