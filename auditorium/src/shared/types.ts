/**
 * The plan document. Everything the Planner knows about a venue lives here,
 * and this is exactly what gets saved to the .json file.
 *
 * Coordinate system (all lengths stored in FEET internally; the UI converts):
 *   x  across the room. 0 is the room centre line; negative = house left,
 *      positive = house right (as seen from the audience looking at the stage).
 *   y  along the room. 0 at the stage edge, increasing toward the back wall.
 *   z  up from the floor.
 *
 * Angles are stored in degrees.
 *   pan   0 = pointing at the stage (−y). Positive turns toward house right (+x).
 *   tilt  0 = level. Positive = up, negative = down.
 *   roll  0 = level. Positive = clockwise as seen from behind the projector.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type WallId = "left" | "right";

export interface WallDef {
  /** Where the wall meets the stage end of the room (top-down). */
  front: Vec2;
  /** Where the wall meets the back of the room (top-down). */
  back: Vec2;
}

export interface Room {
  /** The two walls we project onto. Height is shared. */
  walls: Record<WallId, WallDef>;
  wallHeight: number;
  /** Optional note for the user, e.g. "measured 3 Nov". */
  notes?: string;
}

export interface AudienceZone {
  /** Top-down polygon of the seating area. */
  outline: Vec2[];
  seatedHeadHeight: number;
  standingHeadHeight: number;
}

export interface Projector {
  id: string;
  name: string;
  /** Lens position, top-down. */
  position: Vec2;
  /** Lens height above the floor. */
  mountHeight: number;
  pan: number;
  tilt: number;
  roll: number;
  lumens: number;
  resolution: { width: number; height: number };
  /** Throw ratio = throw distance ÷ image width. Zoom lenses have a range. */
  throwRatio: { min: number; max: number };
  /** The ratio actually used, clamped to [min,max]. */
  throwRatioUsed: number;
  /**
   * Lens shift as a fraction of the image (0.10 = 10 %).
   * 0 means the lens axis passes through the image centre.
   * +0.5 vertical puts the bottom edge of the image on the lens axis.
   */
  lensShift: { horizontal: number; vertical: number };
  targetWall: WallId;
  /** Display colour in the views, CSS string. */
  color: string;
  /** If false the projector is drawn but excluded from analysis. */
  enabled: boolean;
}

export interface Obstruction {
  id: string;
  wall: WallId;
  name: string;
  kind: "exit-sign" | "door" | "speaker" | "sconce" | "other";
  /** Distance along the wall from its FRONT (stage) end to the left edge of the rectangle. */
  s: number;
  /** Height of the bottom edge above the floor. */
  z: number;
  width: number;
  height: number;
  /** Never project here: a footprint overlapping it is flagged as an error. */
  neverProject: boolean;
}

export interface Surface {
  /** Screen gain. Flat white paint is about 0.8–1.0. */
  gain: number;
  /** Lamp ageing / optics / real-world losses. 0.8 = plan on getting 80 % of the rated lumens. */
  derate: number;
  color: string;
}

export type Units = "imperial" | "metric";

export interface Plan {
  schema: "auditorium-plan";
  version: 1;
  name: string;
  units: Units;
  room: Room;
  audience: AudienceZone;
  projectors: Projector[];
  obstructions: Obstruction[];
  surface: Surface;
}
