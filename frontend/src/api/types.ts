// Shapes mirroring the backend schemas. Kept hand-written rather than
// generated so the comments explaining the honesty-critical fields
// (availability, outcome, stale) live next to the types that carry them.

export type Role = 'admin' | 'operator' | 'viewer' | 'ingest'

export type Outcome =
  | 'confirmed'
  | 'accepted'
  | 'ok'
  | 'timeout'
  | 'rejected'
  | 'busy'
  | 'unsupported'
  | 'auth_failed'
  | 'connection_error'
  | 'device_fault'
  | 'parse_error'

/** Why a telemetry field has no value. There is no state in which the UI
 *  shows a number the projector did not give it. */
export type Availability = 'available' | 'unsupported' | 'unavailable'

export interface Telemetry<T = unknown> {
  value: T | null
  availability: Availability
  note: string | null
}

export type PowerState = 'off' | 'on' | 'warming' | 'cooling' | 'unknown'
export type ShutterState = 'open' | 'closed' | 'unknown'
export type Health = 'ok' | 'warning' | 'error' | 'unknown'

export interface LampReading {
  index: number
  hours: number | null
  on?: boolean
  raw?: string
  unparsed?: boolean
  error?: string
}

export interface ProjectorState {
  online: boolean
  /** True when no successful poll has landed inside the staleness window.
   *  A stale device is never rendered as online. */
  stale: boolean
  power: PowerState
  shutter: ShutterState
  health: Health
  active_input: Telemetry<{ code: string; label: string } | string>
  lamp_hours: Telemetry<LampReading[]>
  lamp_status: Telemetry<{ state: string | null; raw: string; unparsed: boolean }>
  error_status: Telemetry<Record<string, string>>
  errors: string[]
  warnings: string[]
  last_seen_at: string | null
  last_error: string | null
  consecutive_failures: number
  queue_depth: number
}

export interface Projector {
  id: number
  name: string
  manufacturer: string
  model: string
  location: string
  notes: string
  host: string
  port: number
  driver: string
  username: string | null
  enabled: boolean
  allow_unverified_commands: boolean
  command_timeout: number | null
  command_gap: number | null
  poll_overrides: Record<string, number>
  lamp_warn_hours: number
  lamp_critical_hours: number
  pjlink_port: number | null
  has_password: boolean
  created_at: string | null
  state: ProjectorState
}

export type Provenance =
  | 'standard'
  | 'verified_doc'
  | 'inferred_family'
  | 'hardware_verified'

export interface Capability {
  name: string
  kind: 'query' | 'set' | 'action'
  provenance: Provenance
  description: string
  params: string[]
  value_range: [number, number] | null
  disruptive: boolean
  idempotent: boolean
  verify_with: string | null
  caveat: string | null
  /** True when the command is documented only for a sibling model and is
   *  refused until the operator enables it for this device. */
  requires_opt_in: boolean
  /** Labels for enumerated params, e.g. {"HD1": "HDMI"}. */
  param_labels: Record<string, string> | null
}

export interface CapabilityManifest {
  projector_id?: number
  driver?: string
  allow_unverified_commands?: boolean
  capabilities: Capability[]
  /** capability name -> why it is unavailable on this unit */
  retracted: Record<string, string>
  /** "capability:param" -> why that value is unavailable on this unit */
  retracted_params: Record<string, string>
}

export interface CommandResult {
  projector_id: number | null
  name: string | null
  capability: string | null
  outcome: Outcome
  value: unknown
  raw_request: string | null
  raw_response: string | null
  error: string | null
  latency_ms: number | null
  attempts: number
}

export interface GroupCommandResult {
  /** When the commands left this server. Not when the projectors acted on
   *  them — this is concurrent dispatch, not synchronised playback. */
  dispatched_at: string
  capability: string
  results: CommandResult[]
  summary: { total: number; succeeded: number; failed: number }
}

export interface Group {
  id: number
  name: string
  description: string
  color: string
  projector_ids: number[]
}

export interface Overview {
  total: number
  enabled: number
  online: number
  offline: number
  powered_on: number
  standby: number
  warming: number
  cooling: number
  warnings: number
  faults: number
  stale: number
  unknown: number
  open_alerts: number
  critical_alerts: number
  queue_depth: number
  generated_at: string
}

export interface EventRow {
  id: number
  projector_id: number | null
  severity: 'info' | 'warning' | 'critical'
  kind: string
  message: string
  details: Record<string, unknown>
  created_at: string
}

export interface Alert {
  id: number
  projector_id: number | null
  kind: string
  severity: 'info' | 'warning' | 'critical'
  state: 'open' | 'acknowledged' | 'resolved'
  message: string
  details: Record<string, unknown>
  opened_at: string
  acknowledged_at: string | null
  acknowledged_by: string | null
  resolved_at: string | null
  notify_count: number
}

export interface CommandLogRow {
  id: number
  capability: string
  params: Record<string, unknown>
  outcome: Outcome | 'pending'
  source: string
  username: string | null
  raw_request: string | null
  raw_response: string | null
  error: string | null
  latency_ms: number | null
  created_at: string
  completed_at: string | null
}

export interface AutomationStep {
  type: string
  label?: string
  target?: { type: 'all' | 'group' | 'projector'; id?: number }
  capability?: string
  params?: Record<string, unknown>
  expect?: string
  timeout?: number
  interval?: number
  seconds?: number
  enclosure_id?: number
  scene_id?: number
  message?: string
  [key: string]: unknown
}

export interface Automation {
  id: number
  name: string
  description: string
  enabled: boolean
  trigger_type: 'manual' | 'once' | 'daily' | 'weekly' | 'cron'
  schedule: Record<string, unknown>
  steps: AutomationStep[]
  abort_on_failure: boolean
  last_run_at: string | null
  last_status: string | null
}

export interface AutomationRun {
  id: number
  automation_id: number
  status: 'running' | 'success' | 'partial' | 'failed' | 'aborted'
  trigger: string
  started_at: string
  finished_at: string | null
  step_results: Array<{
    step: number
    label: string
    ok: boolean
    detail?: string
    error?: string
    results?: CommandResult[]
  }>
  error: string | null
}

export interface Scene {
  id: number
  name: string
  description: string
  icon: string
  actions: Array<{
    target: { type: 'all' | 'group' | 'projector'; id?: number }
    capability: string
    params?: Record<string, unknown>
  }>
}

export interface ValidationProblem {
  step: number | null
  severity: 'error' | 'warning'
  message: string
}

export interface AutomationValidation {
  ok: boolean
  problems: ValidationProblem[]
  next_runs: string[]
  timezone: string
}

export interface Enclosure {
  id: number
  name: string
  projector_id: number | null
  location: string
}

export interface MaintenanceRecord {
  id: number
  projector_id: number
  kind: string
  performed_at: string
  lamp_index: number | null
  hours_at_service: number | null
  notes: string
  performed_by: string | null
  next_due_hours: number | null
  next_due_at: string | null
}

export interface TelemetryPoint {
  metric: string
  value_num: number | null
  value_text: string | null
  recorded_at: string
}

export interface DriverInfo extends CapabilityManifest {
  driver_id: string
  display_name: string
  default_port: number
  manufacturer: string
  models: string[]
}

export interface ConnectionTest {
  reachable: boolean
  tcp_latency_ms?: number
  authenticated: boolean
  outcome?: Outcome
  value?: string | null
  raw_response?: string | null
  error?: string | null
  detail: string
}

export interface BusMessage {
  type: string
  payload: Record<string, unknown>
  at: string
}
