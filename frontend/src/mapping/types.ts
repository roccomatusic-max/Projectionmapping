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
  id: number
  position: number
  name: string
  media_id: number | null
  fit: Fit
  loop: boolean
  fade_seconds: number
  interaction: Interaction
  scene_id?: number | null
  started_at_ms: number
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

export type SurfaceKind = 'wall' | 'roof' | 'window' | 'door' | 'other'

/** One part of the building traced on the canvas. */
export interface Surface {
  id: string
  name: string
  kind: SurfaceKind
  /** Outline in canvas fractions. */
  points: Point[]
}

export type LayerType =
  | 'glow' | 'ripples' | 'trails' | 'particles' | 'shadows' | 'reveal' | 'distort'
  | 'wash' | 'field' | 'texture' | 'outline' | 'lights' | 'falling' | 'shapes'
  | 'picture'

export type ReactsTo = 'presence' | 'movement' | 'count' | 'closeness' | 'always'
export type LayerTarget = 'everywhere' | 'building' | 'walls' | 'roof' | 'windows' | 'doors' | 'outside'
export type LayerBlend = 'normal' | 'add' | 'screen'

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
  /** The image a "picture" layer shows, stretched over the whole canvas. */
  media_id?: number | null
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

export interface AiStatus {
  available: boolean
  key_hint: string | null
  source: 'settings' | 'environment' | null
}
