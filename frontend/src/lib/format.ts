import type { Availability, Health, Outcome, PowerState, ShutterState, Telemetry } from '@/api/types'

/** The single place that decides how an absent value is rendered.
 *  Never returns a plausible-looking number for missing data. */
export function renderTelemetry<T>(
  field: Telemetry<T> | undefined,
  format?: (value: T) => string,
): { text: string; muted: boolean; title?: string } {
  if (field?.availability === 'unsupported') {
    return {
      text: 'n/a',
      muted: true,
      title: field.note ?? 'Not supported by this model',
    }
  }
  // A projector that was never read (new or disabled) sends {} with no
  // availability at all; treat that, like a null value, as unavailable.
  if (!field || field.availability !== 'available' || field.value == null) {
    return {
      text: '—',
      muted: true,
      title: field?.note ?? 'No value from the projector on the last read',
    }
  }
  const value = field.value as T
  return { text: format ? format(value) : String(value), muted: false }
}

export const POWER_LABEL: Record<PowerState, string> = {
  on: 'On',
  off: 'Standby',
  warming: 'Starting up',
  cooling: 'Cooling',
  unknown: 'Unknown',
}

export const SHUTTER_LABEL: Record<ShutterState, string> = {
  open: 'Open',
  closed: 'Closed',
  unknown: 'Unknown',
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  confirmed: 'Confirmed',
  accepted: 'Accepted',
  ok: 'OK',
  timeout: 'Timed out',
  rejected: 'Rejected',
  busy: 'Not right now',
  queued: 'Waiting for the projector',
  unsupported: 'Not supported',
  auth_failed: 'Auth failed',
  connection_error: 'No connection',
  device_fault: 'Device fault',
  parse_error: 'Bad response',
}

/** What the operator should understand from each outcome. Spelled out
 *  because "failed" is not actionable and these four are different. */
export const OUTCOME_HELP: Record<Outcome, string> = {
  confirmed: 'The projector acknowledged and the new state was read back.',
  accepted: 'The projector acknowledged. State is being verified.',
  ok: 'The query returned a value.',
  timeout:
    'No response before the deadline. The projector may or may not have acted — ' +
    'the next status poll will resolve it. Not retried automatically.',
  rejected: 'The projector understood the command and refused it.',
  busy: 'The projector is busy or the command is not valid right now. Retrying may work.',
  queued:
    'The projector cannot take this right now (it is cooling down or starting up). ' +
    'It will be sent by itself as soon as the projector accepts it.',
  unsupported:
    'This command was not sent. The model does not support it, or it is gated ' +
    'pending verification for this device.',
  auth_failed: 'The projector rejected the credentials.',
  connection_error: 'Could not reach the projector.',
  device_fault: 'The projector reported an internal fault.',
  parse_error: 'The projector replied with something unrecognised.',
}

export function outcomeTone(outcome: Outcome): 'ok' | 'warn' | 'fault' | 'idle' {
  switch (outcome) {
    case 'confirmed':
    case 'accepted':
    case 'ok':
      return 'ok'
    case 'busy':
    case 'rejected':
      return 'warn'
    case 'queued':
      return 'idle'
    case 'unsupported':
      return 'idle'
    default:
      return 'fault'
  }
}

export function healthTone(health: Health): 'ok' | 'warn' | 'fault' | 'idle' {
  switch (health) {
    case 'ok':
      return 'ok'
    case 'warning':
      return 'warn'
    case 'error':
      return 'fault'
    default:
      return 'idle'
  }
}

export function availabilityTitle(availability: Availability, note: string | null) {
  if (availability === 'available') return undefined
  return note ?? (availability === 'unsupported' ? 'Not supported' : 'Unavailable')
}

/** The server stores UTC; on SQLite it comes back without an offset, which
 *  browsers would read as local time. Treat an offset-less timestamp as UTC. */
function parseServerTime(iso: string): Date {
  return new Date(/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(iso) ? `${iso}Z` : iso)
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const then = parseServerTime(iso).getTime()
  if (Number.isNaN(then)) return 'unknown'
  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 0) return 'just now'
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = parseServerTime(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = parseServerTime(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString([], {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatHours(hours: number | null | undefined): string {
  if (hours == null) return '—'
  return `${hours.toLocaleString()} h`
}

/** Input choices for a device, from its driver's manifest. */
export function inputsFromCapabilities(
  capabilities: Array<{ name: string; params: string[]; param_labels: Record<string, string> | null }>,
): Array<[string, string]> {
  const cap = capabilities.find((c) => c.name === 'input.set')
  if (!cap) return []
  return cap.params.map((code) => [code, cap.param_labels?.[code] ?? code])
}

export function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}
