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
}

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
