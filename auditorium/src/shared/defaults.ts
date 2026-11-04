import type { Plan, Projector, WallId, Obstruction } from "./types";
import { aimAndZoom, wallFrame } from "./projection";

/** A short random id, good enough for a plan file. */
export function newId(prefix = "id"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export const PROJECTOR_COLORS = ["#4f9cff", "#ff9f43", "#2ecc71", "#e056fd", "#ff6b6b", "#1dd1a1", "#feca57", "#54a0ff"];

/**
 * Build a trapezoid room: front width at the stage, back width at the rear,
 * length from stage edge to back wall. Returns the four wall endpoints.
 */
export function trapezoidWalls(frontWidth: number, backWidth: number, length: number) {
  return {
    left: { front: { x: -frontWidth / 2, y: 0 }, back: { x: -backWidth / 2, y: length } },
    right: { front: { x: frontWidth / 2, y: 0 }, back: { x: backWidth / 2, y: length } },
  };
}

export function defaultProjector(partial: Partial<Projector> & { name: string; targetWall: WallId }): Projector {
  return {
    id: newId("pj"),
    position: { x: 0, y: 0 },
    mountHeight: 14,
    pan: 0,
    tilt: 0,
    roll: 0,
    lumens: 8000,
    resolution: { width: 1920, height: 1200 },
    throwRatio: { min: 1.8, max: 4.0 },
    throwRatioUsed: 3.0,
    lensShift: { horizontal: 0, vertical: 0 },
    color: PROJECTOR_COLORS[0],
    enabled: true,
    ...partial,
  };
}

/**
 * The starting plan: a plausible school auditorium with the cross-shoot
 * layout described in the brief. Every number here is a guess the user is
 * expected to replace with real measurements.
 */
export function defaultPlan(): Plan {
  const frontWidth = 60;
  const backWidth = 72;
  const length = 80;
  const walls = trapezoidWalls(frontWidth, backWidth, length);

  // Four projectors: two stacked in each back corner, cross-shooting.
  // Pan/tilt values are roughed in; the "Aim" button in the UI recomputes them.
  const mk = (name: string, x: number, y: number, z: number, wall: WallId, color: string) =>
    defaultProjector({ name, position: { x, y }, mountHeight: z, targetWall: wall, color });

  const wallHeight = 20;
  const projectors: Projector[] = [
    mk("Back-Left A (→ right wall, front half)", -backWidth / 2 + 3, length - 3, 16, "right", PROJECTOR_COLORS[0]),
    mk("Back-Left B (→ right wall, back half)", -backWidth / 2 + 3, length - 3, 14, "right", PROJECTOR_COLORS[1]),
    mk("Back-Right A (→ left wall, front half)", backWidth / 2 - 3, length - 3, 16, "left", PROJECTOR_COLORS[2]),
    mk("Back-Right B (→ left wall, back half)", backWidth / 2 - 3, length - 3, 14, "left", PROJECTOR_COLORS[3]),
  ];
  // Rough in the aim so the first launch shows a cross-shoot, not four
  // projectors pointing at the stage.
  projectors.forEach((p, i) => {
    const frame = wallFrame(p.targetWall, walls[p.targetWall], wallHeight);
    const r = aimAndZoom(p, frame, i % 2 === 0 ? 0.25 : 0.75, 0.5, true);
    p.pan = r.pan;
    p.tilt = r.tilt;
    p.throwRatioUsed = r.throwRatioUsed;
  });

  const obstructions: Obstruction[] = [
    { id: newId("ob"), wall: "left", name: "Exit sign (front)", kind: "exit-sign", s: 4, z: 9, width: 1.5, height: 0.8, neverProject: true },
    { id: newId("ob"), wall: "left", name: "Exit door", kind: "door", s: 2, z: 0, width: 6, height: 7, neverProject: false },
    { id: newId("ob"), wall: "right", name: "Exit sign (front)", kind: "exit-sign", s: 4, z: 9, width: 1.5, height: 0.8, neverProject: true },
    { id: newId("ob"), wall: "right", name: "Exit door", kind: "door", s: 2, z: 0, width: 6, height: 7, neverProject: false },
  ];

  return {
    schema: "auditorium-plan",
    version: 1,
    name: "Untitled auditorium",
    units: "imperial",
    room: { walls, wallHeight, notes: "" },
    audience: {
      outline: [
        { x: -24, y: 12 },
        { x: 24, y: 12 },
        { x: 30, y: 72 },
        { x: -30, y: 72 },
      ],
      seatedHeadHeight: 4,
      standingHeadHeight: 6,
    },
    projectors,
    obstructions,
    surface: { gain: 0.8, derate: 0.8, color: "#d9d4c7" },
  };
}
