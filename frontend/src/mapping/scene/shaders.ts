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
 */

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
`

const HEADER = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vC;
out vec4 outColor;
${COMMON}`

const FOOTER = `
void main() {
  vec4 l = layer();
  float m = uMaskOn == 1 ? texture(uMask, vUv).r : 1.0;
  float a = clamp(l.a, 0.0, 1.0) * uStrength * m;
  outColor = vec4(max(l.rgb, vec3(0.0)) * a, a);
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

  shapes: `
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
float dot2(vec2 v) { return dot(v, v); }
float sdHeart(vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - 0.35355;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}
vec3 candy(float h) {
  float k = floor(h * 5.0);
  if (k < 1.0) return uColor;
  if (k < 2.0) return uColor2;
  if (k < 3.0) return vec3(1.0, 0.85, 0.15);
  if (k < 4.0) return vec3(0.55, 0.3, 0.95);
  return vec3(1.0, 0.45, 0.7);
}
vec4 layer() {
  vec2 p = toH(vC);
  float cs = mix(0.05, 0.3, uDial.x);
  vec2 g = p / cs;
  vec2 cell = floor(g);
  float h = hash(cell + 0.37);
  if (h > mix(0.08, 0.95, uDial.z)) return vec4(0.0);
  vec2 j = hash2(cell + 3.1) - 0.5;
  float bob = sin(uTime * mix(0.3, 3.0, uDial.y) + h * 20.0) * 0.05;
  vec2 q = (fract(g) - 0.5 - j * 0.3 - vec2(0.0, bob)) / 0.3;
  float spin = uTime * uDial.y * (hash(cell + 9.0) - 0.5) * 2.0 + h * 6.28;
  float aa = 2.0 / max(uPx * cs * 0.3, 1.0);
  float sd;
  vec3 c = candy(hash(cell + 5.5));
  if (uStyle == 0) {
    sd = max(length(q * vec2(1.0, 1.15)) - 0.9, q.y - 0.45);
    c *= 0.72 + 0.4 * (0.5 - q.y * 0.5);
    c += 0.5 * exp(-dot2(q - vec2(-0.35, -0.35)) * 12.0);
    c += 0.25 * step(0.85, hash(floor(q * 9.0) + cell));
  } else if (uStyle == 1) {
    float r = length(q);
    sd = r - 0.9;
    float a = atan(q.y, q.x) + spin;
    float stripes = step(0.5, fract(a / 6.2832 * 6.0 + r * 0.35));
    c = mix(vec3(1.0), uColor, stripes * step(0.12, r));
    c *= 1.0 - 0.25 * smoothstep(0.7, 0.9, r);
  } else if (uStyle == 2) {
    float cs2 = cos(spin * 0.3);
    float sn = sin(spin * 0.3);
    vec2 r = mat2(cs2, -sn, sn, cs2) * vec2(q.x, -q.y);
    sd = sdStar5(r, 0.9, 0.45);
    c = uColor * (1.0 + 0.4 * exp(-dot2(q) * 4.0));
  } else if (uStyle == 3) {
    float a = atan(q.y, q.x) + spin;
    float r = length(q);
    a = mod(a, 1.0472) - 0.5236;
    vec2 f = vec2(cos(a), abs(sin(a))) * r;
    float arm = sdSegment(f, vec2(0.0), vec2(0.9, 0.0)) - 0.07;
    float b1 = sdSegment(f, vec2(0.45, 0.0), vec2(0.65, 0.2)) - 0.05;
    float b2 = sdSegment(f, vec2(0.65, 0.0), vec2(0.8, 0.13)) - 0.04;
    sd = min(arm, min(b1, b2));
    c = uColor;
  } else if (uStyle == 4) {
    float ball = length(q - vec2(0.0, 0.12)) - 0.78;
    float cap = max(abs(q.x) - 0.2, abs(q.y + 0.75) - 0.12);
    sd = min(ball, cap);
    c = cap < ball ? vec3(0.85, 0.75, 0.4) : c * (0.75 + 0.35 * (0.5 - q.y * 0.5));
    c += 0.6 * exp(-dot2(q - vec2(-0.3, -0.2)) * 18.0);
  } else if (uStyle == 5) {
    sd = sdHeart(vec2(q.x, -q.y + 0.55) * 1.1) / 1.1;
    c = uColor * (0.85 + 0.3 * (0.5 - q.y * 0.5));
  } else {
    float a = atan(q.y, q.x);
    float rib = 0.07 * abs(sin(a * 4.0));
    float body = length(q * vec2(0.82, 1.08)) - 0.82 + rib;
    float stem = max(abs(q.x - 0.05) - 0.1, abs(q.y + 0.85) - 0.2);
    sd = min(body, stem);
    c = stem < body ? uColor2 : uColor * (0.7 + 0.5 * (1.0 - rib * 8.0));
  }
  float a = 1.0 - smoothstep(-aa, aa, sd);
  return vec4(c, a);
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
    vec3 c = uStyle == 2
      ? mix(uColor, uColor2, 0.5 + 0.5 * sin(uTime * 1.5 + m.w * 6.28))
      : mix(uColor, uColor2, clamp(length(m.xy) * 2.0, 0.0, 1.0));
    add += vec4(c * f, f);
  }
  // New paint goes over the old (premultiplied "over"), so a trail keeps
  // its colour instead of piling up to white where people linger.
  float k = clamp(add.a * min(1.0, uDt * 15.0), 0.0, 1.0);
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
    for (int k = 0; k < 16; k++) {
      if (k >= uSpots) break;
      vec4 s = uSpot[k];
      vec2 dv = pH - toH(s.xy);
      float dd = max(length(dv), 1e-4);
      float R = s.z * 1.8;
      pH += dv / dd * max(0.0, R - dd) * s.w;
    }
    if (uStyle == 3) {
      float k = floor(d * 5.0);
      col = k < 1.0 ? uColor : k < 2.0 ? uColor2 : k < 3.0 ? vec3(1.0, 0.85, 0.2) : k < 4.0 ? vec3(0.3, 0.9, 0.5) : vec3(0.95, 0.4, 0.9);
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
