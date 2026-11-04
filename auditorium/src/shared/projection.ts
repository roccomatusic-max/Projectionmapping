/**
 * Projection math: where does each projector's image land on the wall?
 *
 * Method (also described in the README, "How the numbers work"):
 *  1. Build the projector's viewing frame (forward / right / up) from pan,
 *     tilt and roll.
 *  2. The lens is a pinhole. At unit distance along `forward` the image is a
 *     rectangle 1/T wide and (H/W)/T tall, where T is the throw ratio and
 *     W×H the native resolution. Lens shift slides that rectangle sideways /
 *     up by a fraction of its own size.
 *  3. Every image point (a, b) in [-1, 1]² therefore has a ray direction
 *        d = forward + right·(a·hw + 2·hw·shiftH) + up·(b·hh + 2·hh·shiftV)
 *  4. Intersect that ray with the wall plane (ray–plane intersection) and
 *     express the hit in wall coordinates: s along the wall from its stage
 *     end, h above the floor.
 *  5. The four corner rays give the footprint polygon, which is clipped to
 *     the actual wall rectangle. A grid of sample rays gives the per-area
 *     numbers (throw distance, incidence angle, pixel density) used by the
 *     analysis views.
 */
import type { Plan, Projector, Vec2, Vec3, WallDef, WallId } from "./types";
import {
  add,
  bounds2,
  clipPolygon,
  cross,
  deg2rad,
  dot,
  ensureCCW,
  intersectRayPlane,
  length,
  normalize,
  polygonArea,
  rad2deg,
  scale,
  sub,
  v3,
  type Plane,
} from "./geometry";

export interface WallFrame {
  id: WallId;
  /** Floor point at the stage end of the wall. */
  origin: Vec3;
  /** Unit vector along the wall (stage end → back end), horizontal. */
  along: Vec3;
  /** Unit normal pointing INTO the room. */
  normal: Vec3;
  length: number;
  height: number;
  plane: Plane;
  def: WallDef;
}

export function wallFrame(id: WallId, def: WallDef, height: number): WallFrame {
  const origin = v3(def.front.x, def.front.y, 0);
  const alongRaw = v3(def.back.x - def.front.x, def.back.y - def.front.y, 0);
  const len = length(alongRaw);
  const along = normalize(alongRaw);
  // Horizontal normal; choose the one pointing toward the room centre line (x = 0).
  let normal = normalize(cross(along, v3(0, 0, 1)));
  const mid = { x: (def.front.x + def.back.x) / 2, y: (def.front.y + def.back.y) / 2 };
  if (dot(normal, v3(-mid.x, 0, 0)) < 0) normal = scale(normal, -1);
  return { id, origin, along, normal, length: len, height, plane: { point: origin, normal }, def };
}

export function wallFrames(plan: Plan): Record<WallId, WallFrame> {
  return {
    left: wallFrame("left", plan.room.walls.left, plan.room.wallHeight),
    right: wallFrame("right", plan.room.walls.right, plan.room.wallHeight),
  };
}

/** World point → (s along wall, h up). */
export function worldToWall(frame: WallFrame, p: Vec3): Vec2 {
  const rel = sub(p, frame.origin);
  return { x: dot(rel, frame.along), y: rel.z };
}

/** (s, h) on the wall → world point. */
export function wallToWorld(frame: WallFrame, s: number, h: number): Vec3 {
  return add(frame.origin, add(scale(frame.along, s), v3(0, 0, h)));
}

export interface Basis {
  forward: Vec3;
  right: Vec3;
  up: Vec3;
}

/** Rotate v about unit axis k by angle (radians), Rodrigues' formula. */
function rotateAbout(v: Vec3, k: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

/**
 * Viewing frame from pan / tilt / roll (degrees).
 * pan 0 faces the stage (−y); positive pan turns toward +x (house right).
 * tilt positive looks up. roll positive is clockwise seen from behind the lens.
 */
export function projectorBasis(pan: number, tilt: number, roll: number): Basis {
  const panR = deg2rad(pan);
  const forward0 = v3(Math.sin(panR), -Math.cos(panR), 0);
  const right0 = v3(Math.cos(panR), Math.sin(panR), 0);
  const up0 = v3(0, 0, 1);
  // Rotating about `right` by a positive angle (right-hand rule) would tip the
  // lens DOWN, so negate: positive tilt looks up.
  const forward = rotateAbout(forward0, right0, -deg2rad(tilt));
  const up1 = rotateAbout(up0, right0, -deg2rad(tilt));
  const right = rotateAbout(right0, forward, deg2rad(-roll));
  const up = rotateAbout(up1, forward, deg2rad(-roll));
  return { forward: normalize(forward), right: normalize(right), up: normalize(up) };
}

export function lensPosition(p: Projector): Vec3 {
  return v3(p.position.x, p.position.y, p.mountHeight);
}

/** Half-extents of the image at unit throw distance. */
export function frustumHalfExtents(p: Projector): { hw: number; hh: number } {
  const T = Math.max(0.1, p.throwRatioUsed);
  const hw = 1 / (2 * T);
  const hh = (p.resolution.height / p.resolution.width) / (2 * T);
  return { hw, hh };
}

/** Ray direction for normalised image coordinates (a, b) ∈ [-1, 1]². */
export function imageRayDir(p: Projector, basis: Basis, a: number, b: number): Vec3 {
  const { hw, hh } = frustumHalfExtents(p);
  const dx = a * hw + 2 * hw * p.lensShift.horizontal;
  const dy = b * hh + 2 * hh * p.lensShift.vertical;
  return normalize(add(add(basis.forward, scale(basis.right, dx)), scale(basis.up, dy)));
}

export interface WallHit {
  /** Image coordinates that produced this ray. */
  a: number;
  b: number;
  /** World hit point on the (infinite) wall plane. */
  world: Vec3;
  /** Wall coordinates (s along, h up). */
  wall: Vec2;
  /** Throw distance from lens to this point. */
  distance: number;
  /** Angle between the ray and the wall normal, degrees. 0 = head on. */
  incidenceDeg: number;
  /** True when the point lies within the physical wall rectangle. */
  onWall: boolean;
}

export function castToWall(p: Projector, basis: Basis, frame: WallFrame, a: number, b: number): WallHit | null {
  const origin = lensPosition(p);
  const dir = imageRayDir(p, basis, a, b);
  const hit = intersectRayPlane({ origin, dir }, frame.plane);
  if (!hit) return null;
  const wall = worldToWall(frame, hit.point);
  const cosInc = Math.abs(dot(dir, frame.normal));
  return {
    a,
    b,
    world: hit.point,
    wall,
    distance: hit.t,
    incidenceDeg: rad2deg(Math.acos(Math.min(1, cosInc))),
    onWall: wall.x >= -1e-9 && wall.x <= frame.length + 1e-9 && wall.y >= -1e-9 && wall.y <= frame.height + 1e-9,
  };
}

export interface Footprint {
  projectorId: string;
  wall: WallId;
  /** Whether all four corner rays reached the wall plane in front of the lens. */
  valid: boolean;
  /** Corner hits in image order: bottom-left, bottom-right, top-right, top-left. Null if a ray missed. */
  corners: (WallHit | null)[];
  /** Unclipped footprint polygon in wall coordinates (s, h). Empty if invalid. */
  polygon: Vec2[];
  /** Footprint clipped to the wall rectangle. */
  clipped: Vec2[];
  /** Area of the clipped footprint, square feet. */
  areaOnWall: number;
  /** Area of the whole (unclipped) footprint, square feet. */
  areaTotal: number;
  /** Fraction of the image that lands on the wall, 0..1. */
  onWallFraction: number;
  /** Throw distance to image centre and the range across the corners. */
  throw: { center: number; min: number; max: number };
  /** Incidence angle at image centre, degrees. */
  incidenceCenterDeg: number;
  /** Keystone numbers: how far from rectangular the image is. */
  keystone: {
    nearEdgeHeight: number;
    farEdgeHeight: number;
    bottomWidth: number;
    topWidth: number;
    /** Overall bounding box on the wall. */
    bounds: { minS: number; maxS: number; minH: number; maxH: number };
  } | null;
  warnings: string[];
}

export function projectFootprint(p: Projector, frame: WallFrame): Footprint {
  const basis = projectorBasis(p.pan, p.tilt, p.roll);
  const cornerUV: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const corners = cornerUV.map(([a, b]) => castToWall(p, basis, frame, a, b));
  const center = castToWall(p, basis, frame, 0, 0);
  const warnings: string[] = [];
  const valid = corners.every((c) => c !== null) && center !== null;
  if (!valid) warnings.push("Part of the image never reaches the wall plane (aimed away from or parallel to the wall).");

  const empty: Footprint = {
    projectorId: p.id,
    wall: frame.id,
    valid,
    corners,
    polygon: [],
    clipped: [],
    areaOnWall: 0,
    areaTotal: 0,
    onWallFraction: 0,
    throw: { center: center?.distance ?? NaN, min: NaN, max: NaN },
    incidenceCenterDeg: center?.incidenceDeg ?? NaN,
    keystone: null,
    warnings,
  };
  if (!valid) return empty;

  const hits = corners as WallHit[];
  const polygon = hits.map((h) => h.wall);
  const wallRect: Vec2[] = [
    { x: 0, y: 0 },
    { x: frame.length, y: 0 },
    { x: frame.length, y: frame.height },
    { x: 0, y: frame.height },
  ];
  const clipped = clipPolygon(ensureCCW(polygon), wallRect);
  const areaTotal = polygonArea(polygon);
  const areaOnWall = polygonArea(clipped);
  const onWallFraction = areaTotal > 0 ? areaOnWall / areaTotal : 0;
  if (onWallFraction < 0.999) {
    warnings.push(`${Math.round((1 - onWallFraction) * 100)} % of the image spills off the wall.`);
  }
  const dists = hits.map((h) => h.distance);
  const bl = hits[0].wall;
  const br = hits[1].wall;
  const tr = hits[2].wall;
  const tl = hits[3].wall;
  const dist2 = (u: Vec2, v: Vec2) => Math.hypot(u.x - v.x, u.y - v.y);
  const leftH = dist2(bl, tl);
  const rightH = dist2(br, tr);
  // "Near" edge is the one closer to the lens.
  const leftNear = (hits[0].distance + hits[3].distance) / 2 <= (hits[1].distance + hits[2].distance) / 2;
  const bb = bounds2(polygon);
  if (center!.incidenceDeg > 60) warnings.push(`Very oblique: ${center!.incidenceDeg.toFixed(0)}° off the wall normal at image centre.`);

  return {
    ...empty,
    polygon,
    clipped,
    areaOnWall,
    areaTotal,
    onWallFraction,
    throw: { center: center!.distance, min: Math.min(...dists), max: Math.max(...dists) },
    incidenceCenterDeg: center!.incidenceDeg,
    keystone: {
      nearEdgeHeight: leftNear ? leftH : rightH,
      farEdgeHeight: leftNear ? rightH : leftH,
      bottomWidth: dist2(bl, br),
      topWidth: dist2(tl, tr),
      bounds: { minS: bb.minX, maxS: bb.maxX, minH: bb.minY, maxH: bb.maxY },
    },
    warnings,
  };
}

/**
 * Sample the image on an n×n grid and return a wall hit for each cell centre,
 * with the local pixel density. Used by the heat maps.
 */
export interface FootprintSample extends WallHit {
  /** Pixels per foot along the wall at this point (geometric mean of the two axes). */
  pixelsPerFoot: number;
  /** Wall area (sq ft) lit by one pixel at this point. */
  areaPerPixel: number;
  /** Wall area covered by this sample cell, sq ft (for brightness). */
  cellArea: number;
}

export function sampleFootprint(p: Projector, frame: WallFrame, n = 24): FootprintSample[] {
  const basis = projectorBasis(p.pan, p.tilt, p.roll);
  const out: FootprintSample[] = [];
  const pixelsPerCellA = p.resolution.width / n;
  const pixelsPerCellB = p.resolution.height / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const a0 = -1 + (2 * i) / n;
      const a1 = -1 + (2 * (i + 1)) / n;
      const b0 = -1 + (2 * j) / n;
      const b1 = -1 + (2 * (j + 1)) / n;
      const c00 = castToWall(p, basis, frame, a0, b0);
      const c10 = castToWall(p, basis, frame, a1, b0);
      const c11 = castToWall(p, basis, frame, a1, b1);
      const c01 = castToWall(p, basis, frame, a0, b1);
      const mid = castToWall(p, basis, frame, (a0 + a1) / 2, (b0 + b1) / 2);
      if (!c00 || !c10 || !c11 || !c01 || !mid) continue;
      const cellArea = polygonArea([c00.wall, c10.wall, c11.wall, c01.wall]);
      const pixelsInCell = pixelsPerCellA * pixelsPerCellB;
      const areaPerPixel = cellArea / pixelsInCell;
      out.push({
        ...mid,
        cellArea,
        areaPerPixel,
        pixelsPerFoot: areaPerPixel > 0 ? 1 / Math.sqrt(areaPerPixel) : Infinity,
      });
    }
  }
  return out;
}

/** Pan and tilt that point the lens axis at a world point. */
export function aimAt(from: Vec3, target: Vec3): { pan: number; tilt: number } {
  const d = sub(target, from);
  const pan = rad2deg(Math.atan2(d.x, -d.y));
  const horiz = Math.hypot(d.x, d.y);
  const tilt = rad2deg(Math.atan2(d.z, horiz));
  return { pan, tilt };
}

/** Pan and tilt so that the image centre (after lens shift) lands on a world point. */
export function aimImageCentreAt(p: Projector, target: Vec3): { pan: number; tilt: number } {
  // Lens shift moves the image centre off the lens axis. Aim the axis at the
  // target, measure the angular offset between axis and shifted centre, and
  // pull the aim back by that offset. The offset barely changes with aim, so
  // a few passes converge.
  const from = lensPosition(p);
  const aim = aimAt(from, target);
  let { pan, tilt } = aim;
  const angles = (d: Vec3) => ({
    pan: rad2deg(Math.atan2(d.x, -d.y)),
    tilt: rad2deg(Math.asin(Math.max(-1, Math.min(1, d.z)))),
  });
  for (let k = 0; k < 4; k++) {
    const basis = projectorBasis(pan, tilt, p.roll);
    const axis = angles(basis.forward);
    const centre = angles(imageRayDir(p, basis, 0, 0));
    pan = aim.pan - (centre.pan - axis.pan);
    tilt = aim.tilt - (centre.tilt - axis.tilt);
  }
  return { pan, tilt };
}

/**
 * A throw ratio that makes the image roughly `targetWidth` wide on the wall
 * at the given centre throw distance, clamped to the lens's zoom range.
 */
export function throwRatioForWidth(p: Projector, throwDistance: number, targetWidth: number): number {
  const t = throwDistance / Math.max(0.1, targetWidth);
  return Math.min(p.throwRatio.max, Math.max(p.throwRatio.min, t));
}

/**
 * Aim a projector's image centre at a point on its wall (fraction along the
 * wall, fraction up it) and optionally zoom so the image is about as tall as
 * the wall. Returns the new settings and a note if the lens range got in the way.
 */
export function aimAndZoom(
  p: Projector,
  frame: WallFrame,
  alongFraction: number,
  heightFraction = 0.5,
  zoomToHeight = false,
): { pan: number; tilt: number; throwRatioUsed: number; note: string } {
  const target = wallToWorld(frame, frame.length * alongFraction, frame.height * heightFraction);
  const { pan, tilt } = aimImageCentreAt(p, target);
  let throwRatioUsed = p.throwRatioUsed;
  let note = "";
  if (zoomToHeight) {
    const dist = Math.hypot(target.x - p.position.x, target.y - p.position.y, target.z - p.mountHeight);
    // Image about 95 % of the wall height; width follows from the aspect ratio.
    const aspect = p.resolution.height / p.resolution.width;
    const wantWidth = (frame.height * 0.95) / aspect;
    const ideal = dist / wantWidth;
    throwRatioUsed = Math.round(throwRatioForWidth(p, dist, wantWidth) * 100) / 100;
    if (Math.abs(ideal - throwRatioUsed) > 0.01) {
      note = `Lens range limits the zoom: a throw ratio of ${ideal.toFixed(2)} would fit the wall height; this lens only goes ${p.throwRatio.min}–${p.throwRatio.max}.`;
    }
  }
  return { pan: Math.round(pan * 10) / 10, tilt: Math.round(tilt * 10) / 10, throwRatioUsed, note };
}
