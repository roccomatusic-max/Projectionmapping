import type { Vec2, Vec3 } from "./types";

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, s: number): Vec3 => v3(a.x * s, a.y * s, a.z * s);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a);
  return l === 0 ? v3(0, 0, 0) : scale(a, 1 / l);
};
export const deg2rad = (d: number): number => (d * Math.PI) / 180;
export const rad2deg = (r: number): number => (r * 180) / Math.PI;

export interface Plane {
  /** A point on the plane. */
  point: Vec3;
  /** Unit normal. */
  normal: Vec3;
}

export interface Ray {
  origin: Vec3;
  /** Unit direction. */
  dir: Vec3;
}

/**
 * Ray–plane intersection.
 *   t = ((P0 − O) · n) / (d · n)
 * Returns the distance t along the ray and the hit point, or null when the
 * ray is parallel to the plane or the plane is behind the ray origin.
 */
export function intersectRayPlane(ray: Ray, plane: Plane): { t: number; point: Vec3 } | null {
  const denom = dot(ray.dir, plane.normal);
  if (Math.abs(denom) < 1e-9) return null;
  const t = dot(sub(plane.point, ray.origin), plane.normal) / denom;
  if (t <= 0) return null;
  return { t, point: add(ray.origin, scale(ray.dir, t)) };
}

/** Shoelace area of a simple 2D polygon (absolute value). */
export function polygonArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Point-in-polygon, even-odd rule. */
export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const intersects = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Sutherland–Hodgman: clip a polygon against a CONVEX clip polygon given in
 * counter-clockwise order. Returns the clipped polygon (possibly empty).
 */
export function clipPolygon(subject: Vec2[], clip: Vec2[]): Vec2[] {
  let output = subject.slice();
  for (let i = 0; i < clip.length && output.length > 0; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const input = output;
    output = [];
    const inside = (p: Vec2) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= -1e-12;
    const intersect = (p: Vec2, q: Vec2): Vec2 => {
      const dx1 = q.x - p.x;
      const dy1 = q.y - p.y;
      const dx2 = b.x - a.x;
      const dy2 = b.y - a.y;
      const denom = dx1 * dy2 - dy1 * dx2;
      if (Math.abs(denom) < 1e-12) return q;
      const t = ((a.x - p.x) * dy2 - (a.y - p.y) * dx2) / denom;
      return { x: p.x + t * dx1, y: p.y + t * dy1 };
    };
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      const curIn = inside(cur);
      const prevIn = inside(prev);
      if (curIn) {
        if (!prevIn) output.push(intersect(prev, cur));
        output.push(cur);
      } else if (prevIn) {
        output.push(intersect(prev, cur));
      }
    }
  }
  return output;
}

/** Ensure a polygon is counter-clockwise (positive signed area). */
export function ensureCCW(pts: Vec2[]): Vec2[] {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a < 0 ? pts.slice().reverse() : pts;
}

/** Axis-aligned bounds of a 2D point set. */
export function bounds2(pts: Vec2[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Does the segment from a to b pass through the vertical prism above
 * `polygon` (top-down) between heights z0 and z1? Used for the shadow check:
 * the beam from the lens to a wall point crosses the audience volume if any
 * part of the segment lies inside the polygon while at head height or lower.
 * Sampled along the segment; `steps` controls fidelity.
 */
export function segmentCrossesPrism(a: Vec3, b: Vec3, polygon: Vec2[], zTop: number, steps = 24): boolean {
  if (polygon.length < 3) return false;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const z = a.z + (b.z - a.z) * t;
    if (z > zTop) continue;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (pointInPolygon(p, polygon)) return true;
  }
  return false;
}
