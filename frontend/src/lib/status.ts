/**
 * The one place that turns a projector record into what the operator sees:
 * link state, status colour, what needs attention, and how the fleet sorts
 * and filters. Every page reads these so a projector never looks healthy on
 * one screen and faulty on another.
 *
 * Two things are kept apart on purpose:
 *   - the network link (did the last poll get an answer?), and
 *   - the projector's own state (power, shutter, health).
 * A projector in standby is still online; an offline projector has no
 * power state we can vouch for.
 */

import type { LampReading, Projector } from '@/api/types'
import { renderTelemetry } from './format'

export type Tone = 'ok' | 'warn' | 'fault' | 'idle' | 'busy' | 'unknown'

export type LinkState = 'online' | 'offline' | 'disabled'

/** Responding inside the staleness window. Liveness is observed, not
 *  remembered: a projector whose polls stopped is not online. */
export function isLive(projector: Projector): boolean {
  return projector.enabled && projector.state.online && !projector.state.stale
}

export function linkState(projector: Projector): LinkState {
  if (!projector.enabled) return 'disabled'
  return isLive(projector) ? 'online' : 'offline'
}

export function isTransitioning(projector: Projector): boolean {
  return isLive(projector) && (projector.state.power === 'warming' || projector.state.power === 'cooling')
}

/* ------------------------------------------------------------------ */
/* Lamps                                                               */
/* ------------------------------------------------------------------ */

export function lampReadings(projector: Projector): LampReading[] {
  const lamps = projector.state.lamp_hours
  if (lamps?.availability !== 'available' || !Array.isArray(lamps.value)) return []
  return lamps.value
}

export function peakLampHours(projector: Projector): number | null {
  const hours = lampReadings(projector)
    .map((lamp) => lamp.hours)
    .filter((h): h is number => h != null)
  return hours.length ? Math.max(...hours) : null
}

export function lampTone(hours: number | null, warn: number, critical: number): Tone {
  if (hours == null) return 'unknown'
  if (hours >= critical) return 'fault'
  if (hours >= warn) return 'warn'
  return 'ok'
}

/* ------------------------------------------------------------------ */
/* Device-reported problems                                             */
/* ------------------------------------------------------------------ */

/**
 * Errors and warnings the projector itself reports.
 *
 * Merges the latest poll's lists with the subsystem error status (PJLink
 * %1ERST) stored from the last diagnostics poll. The faster polls do not
 * read ERST, so taken alone they would make a fan fault vanish between deep
 * polls; the stored reading is the device's own last word until the next
 * one replaces it.
 */
export function deviceIssues(projector: Projector): {
  errors: string[]
  warnings: string[]
  health: Projector['state']['health']
} {
  const { state } = projector
  const errors = new Set(state.errors)
  const warnings = new Set(state.warnings)
  const erst = state.error_status
  if (erst?.availability === 'available' && erst.value) {
    for (const [subsystem, severity] of Object.entries(erst.value)) {
      if (severity === 'error') errors.add(`${subsystem}: error`)
      else if (severity === 'warning') warnings.add(`${subsystem}: warning`)
    }
  }
  const health =
    state.health === 'error' || errors.size > 0
      ? 'error'
      : state.health === 'warning' || warnings.size > 0
        ? 'warning'
        : state.health
  return { errors: [...errors], warnings: [...warnings], health }
}

/* ------------------------------------------------------------------ */
/* Status colour                                                        */
/* ------------------------------------------------------------------ */

/**
 * Overall status colour for a projector.
 *   green  operational
 *   yellow warning (device warning, lamp due)
 *   red    critical fault reported by the device
 *   gray   offline, disabled or not yet reached
 */
export function deviceTone(projector: Projector): Tone {
  if (!isLive(projector)) return 'idle'
  const issues = deviceIssues(projector)
  if (issues.health === 'error') return 'fault'
  const lamp = peakLampHours(projector)
  if (
    issues.health === 'warning' ||
    (lamp != null && lamp >= projector.lamp_warn_hours)
  ) {
    return 'warn'
  }
  return 'ok'
}

/** Kept for the pages that imported it under its old name. */
export const connectionTone = deviceTone

/* ------------------------------------------------------------------ */
/* Attention                                                            */
/* ------------------------------------------------------------------ */

export type AttentionSeverity = 'critical' | 'warning' | 'notice'

export interface AttentionItem {
  severity: AttentionSeverity
  text: string
  detail?: string
}

const SEVERITY_RANK: Record<AttentionSeverity, number> = { critical: 0, warning: 1, notice: 2 }

/** Everything about this projector an operator should look at, worst first. */
export function attentionItems(projector: Projector): AttentionItem[] {
  if (!projector.enabled) return []
  const { state } = projector
  const items: AttentionItem[] = []

  if (!isLive(projector)) {
    items.push({
      severity: 'critical',
      text: state.last_seen_at ? 'Not responding' : 'Never reached',
      detail: state.last_error ?? undefined,
    })
    return items
  }

  const issues = deviceIssues(projector)
  for (const error of issues.errors) items.push({ severity: 'critical', text: error })
  for (const warning of issues.warnings) items.push({ severity: 'warning', text: warning })

  for (const lamp of lampReadings(projector)) {
    if (lamp.hours == null) continue
    const label = lampReadings(projector).length > 1 ? `Lamp ${lamp.index}` : 'Lamp'
    if (lamp.hours >= projector.lamp_critical_hours) {
      items.push({
        severity: 'warning',
        text: `${label} past replacement`,
        detail: `${lamp.hours.toLocaleString()} h of ${projector.lamp_critical_hours.toLocaleString()} h`,
      })
    } else if (lamp.hours >= projector.lamp_warn_hours) {
      items.push({
        severity: 'notice',
        text: `${label} due for replacement soon`,
        detail: `${lamp.hours.toLocaleString()} h, replace at ${projector.lamp_critical_hours.toLocaleString()} h`,
      })
    }
  }

  if (state.consecutive_failures > 0) {
    items.push({
      severity: 'notice',
      text: `${state.consecutive_failures} failed poll${state.consecutive_failures === 1 ? '' : 's'} in a row`,
      detail: state.last_error ?? undefined,
    })
  }

  return items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}

export function attentionTone(severity: AttentionSeverity): Tone {
  return severity === 'critical' ? 'fault' : severity === 'warning' ? 'warn' : 'idle'
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

/** PJLink reports inputs as two characters: family digit, then index. */
const PJLINK_INPUT_FAMILY: Record<string, string> = {
  '1': 'RGB',
  '2': 'Video',
  '3': 'Digital',
  '4': 'Storage',
  '5': 'Network',
}

/** A readable name for a bare input code, e.g. PJLink "31" → "Digital 1". */
export function inputCodeLabel(code: string): string {
  const family = /^[1-5][1-9A-Z]$/.test(code) ? PJLINK_INPUT_FAMILY[code[0]] : undefined
  return family ? `${family} ${code[1]}` : code
}

export function activeInput(projector: Projector): {
  code: string
  text: string
  muted: boolean
  title?: string
} {
  const field = projector.state.active_input
  const rendered = renderTelemetry(field, (value) => (typeof value === 'string' ? inputCodeLabel(value) : value.label))
  const code =
    field?.availability === 'available' && field.value
      ? typeof field.value === 'object'
        ? field.value.code
        : field.value
      : ''
  // An input read from a projector that has since gone quiet is history.
  if (!isLive(projector) && !rendered.muted) {
    return { code, text: rendered.text, muted: true, title: 'Last known input; the projector is not responding' }
  }
  return { code, ...rendered }
}

/* ------------------------------------------------------------------ */
/* Sorting and filtering                                                */
/* ------------------------------------------------------------------ */

export type FleetFilter =
  | 'all'
  | 'online'
  | 'offline'
  | 'on'
  | 'standby'
  | 'transition'
  | 'warnings'
  | 'faults'
  | 'attention'

export function matchesFilter(projector: Projector, filter: FleetFilter): boolean {
  const live = isLive(projector)
  const { state } = projector
  switch (filter) {
    case 'online':
      return live
    case 'offline':
      return projector.enabled && !live
    case 'on':
      return live && state.power === 'on'
    case 'standby':
      return live && state.power === 'off'
    case 'transition':
      return isTransitioning(projector)
    case 'warnings':
      return live && deviceIssues(projector).health === 'warning'
    // A device-reported error, not mere unreachability (that is what the
    // offline filter is for).
    case 'faults':
      return live && deviceIssues(projector).health === 'error'
    case 'attention':
      return attentionItems(projector).some((item) => item.severity !== 'notice')
    default:
      return true
  }
}

export function matchesQuery(projector: Projector, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [projector.name, projector.model, projector.manufacturer, projector.location, projector.host, projector.driver]
    .some((value) => value?.toLowerCase().includes(q))
}

export type SortKey = 'name' | 'status' | 'model' | 'host' | 'lamp'

/** Lower is worse: a status sort puts problems at the top. */
function statusRank(projector: Projector): number {
  if (!projector.enabled) return 9
  const tone = deviceTone(projector)
  if (tone === 'fault') return 0
  if (!isLive(projector)) return 1
  if (tone === 'warn') return 2
  if (isTransitioning(projector)) return 3
  if (projector.state.power === 'on') return 4
  return 5
}

/** Sort IPv4 addresses numerically, everything else alphabetically. */
function hostKey(host: string): string {
  const parts = host.split('.')
  if (parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p))) {
    return parts.map((p) => p.padStart(3, '0')).join('.')
  }
  return host.toLowerCase()
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function compareProjectors(key: SortKey, a: Projector, b: Projector): number {
  let result = 0
  switch (key) {
    case 'status':
      result = statusRank(a) - statusRank(b)
      break
    case 'model':
      result = collator.compare(a.model || a.manufacturer, b.model || b.manufacturer)
      break
    case 'host':
      result = collator.compare(hostKey(a.host), hostKey(b.host)) || a.port - b.port
      break
    case 'lamp':
      // Highest hours first; unknown last.
      result = (peakLampHours(b) ?? -1) - (peakLampHours(a) ?? -1)
      break
  }
  return result || collator.compare(a.name, b.name)
}
