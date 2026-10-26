/** Mapping media types. Mirrors backend/app/schemas/mapping.py. */

export type Point = [number, number]

export interface MediaAsset {
  id: number
  name: string
  kind: 'video' | 'image'
  content_type: string
  size_bytes: number
  width: number | null
  height: number | null
  duration: number | null
  created_at: string
}

export interface SourceRect {
  x: number
  y: number
  w: number
  h: number
}

export interface Mesh {
  cols: number
  rows: number
  /** Offsets from the undistorted grid position, row-major, in unit-square space. */
  points: Point[]
}

export interface Warp {
  /** Top-left, top-right, bottom-right, bottom-left, in output fractions. */
  corners: Point[]
  mesh: Mesh | null
}

export interface Mask {
  name: string
  points: Point[]
  feather: number
  invert: boolean
  enabled: boolean
}

export interface BlendEdge {
  width: number
  gamma: number
  curve: number
}

export interface Blend {
  left: BlendEdge
  right: BlendEdge
  top: BlendEdge
  bottom: BlendEdge
  /**
   * Blend by itself where this output overlaps others: true always, false
   * never (it shows a picture apart from the others), null when it has
   * been calibrated with a camera.
   */
  auto?: boolean | null
}

export interface ColorAdjust {
  brightness: number
  gamma: number
  red: number
  green: number
  blue: number
}

export type TestPattern = 'none' | 'grid' | 'id' | 'white' | 'black' | 'red' | 'green' | 'blue'

export interface Output {
  id: number
  show_id: number
  position: number
  name: string
  projector_id: number | null
  width: number
  height: number
  source: SourceRect
  warp: Warp
  masks: Mask[]
  blend: Blend
  color: ColorAdjust
  test_pattern: TestPattern
  enabled: boolean
  /** Last camera calibration, if any (the decoded grid stays on the server). */
  calibration?: CalibrationSummary | null
}

export interface CalibrationSummary {
  camera_id: number
  captured_at: string
  /** Share of the camera picture where this projector's light was found. */
  coverage: number
}

export type Fit = 'fill' | 'fit' | 'stretch'

export interface Cue {
  id: number
  show_id: number
  position: number
  name: string
  media_id: number | null
  fit: Fit
  loop: boolean
  fade_seconds: number
  follow_seconds: number | null
  interaction: Interaction
  /** A scene from the scene library, drawn over the media (or alone). */
  scene_id: number | null
  /**
   * A different scene on some projectors: output id → scene id, or null for
   * no scene there. Projectors not listed play scene_id.
   */
  output_scenes: Record<string, number | null>
  /**
   * A picture of their own on some projectors: output id → media id, or
   * null for no media there. Projectors not listed show their part of media_id.
   */
  output_media: Record<string, number | null>
}

/** How people tracked by a depth camera affect a cue. */
export type Interaction = 'none' | 'spotlight' | 'ripple'

export interface ShowSummary {
  id: number
  name: string
  description: string
  canvas_width: number
  canvas_height: number
  output_count: number
  cue_count: number
  updated_at: string
}

export interface Show extends ShowSummary {
  /** Where the canvas sits in a camera's picture: corners TL, TR, BR, BL in image fractions. */
  camera_view: CameraView | null
  /** The building's parts traced on the canvas, for scenes to decorate. */
  surfaces: Surface[]
  outputs: Output[]
  cues: Cue[]
}

export interface TransportCue {
  /** A scene played on its own (an automation's Play a scene) has id -scene id and position -1. */
  id: number
  position: number
  name: string
  media_id: number | null
  fit: Fit
  loop: boolean
  fade_seconds: number
  interaction: Interaction
  scene_id?: number | null
  output_scenes?: Record<string, number | null>
  output_media?: Record<string, number | null>
  started_at_ms: number
}

/** "cue 3 · Ghosts", or "scene · Haunted house" for a scene played on its own. */
export function liveLabel(cue: TransportCue): string {
  if (cue.position < 0) return `scene · ${cue.name}`
  return `cue ${cue.position + 1}${cue.name ? ` · ${cue.name}` : ''}`
}

export type TransportStatus = 'stopped' | 'playing' | 'paused' | 'blackout'

export interface TransportState {
  show_id: number | null
  status: TransportStatus
  current: TransportCue | null
  previous: TransportCue | null
  fade_started_at_ms: number | null
  paused_position: number | null
  revision: number
  server_time_ms: number
  /** Set while the emergency stop is on: outputs draw nothing, GO is held. */
  emergency?: EmergencyState | null
}

export interface EmergencyState {
  /** Server epoch milliseconds when it was pressed. */
  at_ms: number
  by: string | null
}

export type TransportAction = 'go' | 'goto' | 'pause' | 'resume' | 'stop' | 'blackout'

// -- cameras -------------------------------------------------------------------

/** Where the canvas sits in a camera's picture of the building. */
export interface CameraView {
  camera_id: number
  /** Canvas corners TL, TR, BR, BL, in camera-image fractions. */
  corners: Point[]
  /**
   * Finer placement by hand: ``cols`` × ``rows`` canvas points spread evenly
   * over the canvas, row-major, each where it is on the photo.
   */
  mesh?: CameraMesh | null
}

export interface CameraMesh {
  cols: number
  rows: number
  points: Point[]
}

/** The decoded camera → projector map of one output, as the server keeps it. */
export interface CalibrationGrid {
  camera_id: number
  camera_width: number
  camera_height: number
  cols: number
  rows: number
  points: Array<Point | null>
}

export type CameraCommandName = 'snapshot' | 'background' | 'live' | 'stop_live'

/** One structured-light frame, drawn in the projector's own pixels. */
export interface PatternSpec {
  kind: 'black' | 'white' | 'gray'
  axis: 'x' | 'y'
  bit: number
  inverse: boolean
}

/** A calibration step as relayed to output windows. */
export interface CalibrationStepMessage {
  camera_id: number
  show_id: number
  output_id: number
  pattern: PatternSpec | null
  step: number
  steps: number
  status: 'running' | 'done' | 'failed'
  message: string
  /** Sent when the calibration was removed, to end a run in progress. */
  removed?: boolean
}

/** A person a depth camera sees. ``x``/``y`` are canvas fractions, when mapped. */
export interface Person {
  id: number
  cx: number
  cy: number
  x: number | null
  y: number | null
  z: number | null
  size: number
}

export interface PeopleMessage {
  /** 0: made up in the scene builder; negative: simulated in this browser only. */
  camera_id: number
  show_id: number | null
  people: Person[]
  at: number
  /** When the camera took the picture, server time in ms (newer servers and cameras). */
  captured_at?: number
}

export interface ApplyResult {
  output_id: number
  name: string
  applied: boolean
  reason: string
  measured: number
  residual_px: number
}

// -- scenes --------------------------------------------------------------------

/** "ground" is a driveway, path or lawn seen from above, not part of the building. */
export type SurfaceKind = 'wall' | 'roof' | 'window' | 'door' | 'other' | 'ground'

/** One part of the building traced on the canvas. */
/** Where a true square has to be drawn on the canvas to look square on a house part (scene/flat.ts). */
export interface SurfaceFlat {
  /** Top-left, top-right, bottom-right, bottom-left, in canvas fractions. */
  corners: Point[]
  /** Show a checkerboard square on the projectors until this time (server clock, epoch ms). */
  test_until?: number | null
}

export interface Surface {
  id: string
  name: string
  kind: SurfaceKind
  /** Outline in canvas fractions. */
  points: Point[]
  /** Straightened: objects on this part are drawn through its flat view. */
  flat?: SurfaceFlat | null
}

export type LayerType =
  | 'glow' | 'ripples' | 'trails' | 'particles' | 'shadows' | 'reveal' | 'distort'
  | 'wash' | 'field' | 'texture' | 'outline' | 'lights' | 'falling' | 'shapes'
  | 'picture'
  | 'countdown'

export type ReactsTo = 'presence' | 'movement' | 'count' | 'closeness' | 'always'
export type LayerTarget = 'everywhere' | 'building' | 'walls' | 'roof' | 'windows' | 'doors' | 'outside' | 'ground'
export type LayerBlend = 'normal' | 'add' | 'screen'
/** How an object moves by itself. */
export type Motion = 'none' | 'bob' | 'sway' | 'spin' | 'drift' | 'bounce' | 'orbit' | 'rise' | 'flutter'
/** How an object changes by itself. */
export type Change = 'none' | 'pulse' | 'twinkle' | 'colour' | 'flicker' | 'blink'
/** What an object does when a person comes near it. */
export type NearAction =
  | 'none' | 'light' | 'grow' | 'shrink' | 'colour' | 'spin' | 'flee' | 'follow'
  | 'jump' | 'dance' | 'appear' | 'hide' | 'burst'

/** An object placed by hand on the canvas. */
export interface ObjectPin {
  x: number
  y: number
  size: number
  /** Degrees clockwise; missing on pins placed before objects could turn. */
  rotation?: number
}

/** One layer of a scene; see scene/catalog.ts for what the dials mean per type. */
export interface SceneLayer {
  id: string
  type: LayerType
  name: string
  enabled: boolean
  opacity: number
  blend: LayerBlend
  color: string
  color2: string
  size: number
  speed: number
  amount: number
  fade: number
  style: string
  target: LayerTarget
  reacts_to: ReactsTo
  reaction: number
  /** Null (older scenes) means the type's usual; see scene/catalog.ts. */
  motion?: Motion | null
  change?: Change | null
  near?: NearAction | null
  /** How far from a person objects notice them, 0..1. */
  reach?: number
  /**
   * Objects placed by hand: each pin is a spot on the canvas (0..1 across
   * and down) with its own size (1 = normal). Missing means the objects are
   * spread over the layer's area by themselves; a list, even an empty one,
   * means only the placed ones are shown.
   */
  pins?: ObjectPin[] | null
  /** The image a "picture" layer shows, stretched over the whole canvas. */
  media_id?: number | null
  /** A countdown's own colour for each part; missing keeps its look's colours. */
  colors?: CountdownColors | null
}

/**
 * A countdown's colour for each part, picked over its look. A part left out
 * (or null) keeps the look's own colouring; the banner and the glow are the
 * layer's ``color`` and ``color2``.
 */
export interface CountdownColors {
  number?: string | null
  depth?: string | null
  top?: string | null
  caption?: string | null
  stitch?: string | null
  clock?: string | null
  labels?: string | null
  decorations?: string | null
}

export interface MappingScene {
  id: number
  name: string
  description: string
  /** Bottom first. */
  layers: SceneLayer[]
  created_at: string
  updated_at: string
}

/** A part of the building Claude found on a photo, in fractions of the photo. */
export interface TracedPart {
  kind: SurfaceKind
  name: string
  points: Point[]
}

export interface TracedHouse {
  /** The house in a sentence or two, for designing its scene. */
  description: string
  parts: TracedPart[]
}

/** The show's photo of the house and where the canvas's corners are on it (TL, TR, BR, BL). */
export interface HousePhoto {
  media_id: number
  corners: Point[]
  description: string
}

export interface AiStatus {
  available: boolean
  key_hint: string | null
  source: 'settings' | 'environment' | null
}

/** A saved map: one building's lined-up outputs and traced parts, kept by name. */
export interface SavedMap {
  id: number
  name: string
  description: string
  canvas_width: number
  canvas_height: number
  output_count: number
  surface_count: number
  calibrated_count: number
  player_count: number
  output_names: string[]
  updated_at: string
}

/** What applying a saved map to a show returns. */
export interface MapApplied {
  show: Show
  players_moved: number
}

/** Which parts of a saved map to copy into a show. */
export interface MapParts {
  outputs: boolean
  surfaces: boolean
  players: boolean
}
