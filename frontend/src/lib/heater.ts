/** Heaters in projector boxes. Mirrors backend/app/schemas/heater.py (°C there, °F here). */

import { request } from '@/api/client'

export type PlugKind = 'shelly' | 'tasmota' | 'home_assistant'
export type HeaterModeName = 'auto' | 'on' | 'off'

export interface Heater {
  id: number
  name: string
  plug_kind: PlugKind
  plug_address: string
  plug_entity: string | null
  has_secret: boolean
  sensor_player_id: number | null
  projector_id: number | null
  on_below_c: number
  off_above_c: number
  max_inside_c: number
  outside_on_below_c: number
  outside_off_above_c: number
  max_minutes_per_hour: number
  /** Never on while its projector is on. */
  interlock: boolean
  /** Warm the box up this long before the show; 0 is never. */
  warmup_minutes: number
  mode: HeaterModeName
  hold_until: string | null
  rest_until: string | null
  /** What the plug last said; null when it is not answering. */
  is_on: boolean | null
  on_since: string | null
  /** Why it is on or off right now, in words. */
  reason: string
  plug_error: string | null
  inside: { celsius: number; source: 'sensor' | 'projector'; at: string } | null
  projector_on: boolean | null
  /** When the warm-up before the next show starts, and the show. */
  warmup_at: string | null
  show_at: string | null
}

export interface WeatherPlace {
  name: string
  latitude: number
  longitude: number
}

export interface Outside {
  place: WeatherPlace | null
  celsius: number | null
  fetched_at: string | null
  error: string | null
}

export interface UsbSensor {
  player_id: number
  player_name: string
  name: string
  celsius: number
  humidity: number | null
  at: string
}

export interface HeatersOverview {
  heaters: Heater[]
  outside: Outside
  sensors: UsbSensor[]
}

export interface HeaterIn {
  name: string
  plug_kind: PlugKind
  plug_address: string
  plug_entity: string | null
  /** Undefined keeps the saved one; '' removes it. */
  plug_secret?: string
  sensor_player_id: number | null
  projector_id: number | null
  on_below_c: number
  off_above_c: number
  max_inside_c: number
  outside_on_below_c: number
  outside_off_above_c: number
  max_minutes_per_hour: number
  interlock: boolean
  warmup_minutes: number
}

export interface PlugTest {
  ok: boolean
  on: boolean | null
  model: string | null
  message: string
}

export interface HeaterHistory {
  heater_id: number
  since: string
  until: string
  points: { t: number; inside: number | null; outside: number | null; on: number | null }[]
  minutes_on: number
}

export const heaterApi = {
  overview: () => request<HeatersOverview>('/heaters'),
  create: (body: HeaterIn) => request<Heater>('/heaters', { method: 'POST', body }),
  update: (id: number, body: HeaterIn) => request<Heater>(`/heaters/${id}`, { method: 'PUT', body }),
  remove: (id: number) => request<void>(`/heaters/${id}`, { method: 'DELETE' }),
  setMode: (id: number, mode: HeaterModeName) =>
    request<Heater>(`/heaters/${id}/mode`, { method: 'POST', body: { mode } }),
  testPlug: (body: Partial<HeaterIn> & { heater_id?: number }) =>
    request<PlugTest>('/heaters/test-plug', { method: 'POST', body }),
  history: (id: number, hours: number) => request<HeaterHistory>(`/heaters/${id}/history?hours=${hours}`),
  searchPlaces: (q: string) => request<WeatherPlace[]>(`/heaters/weather/search?q=${encodeURIComponent(q)}`),
  setPlace: (place: WeatherPlace) => request<Outside>('/heaters/weather/place', { method: 'PUT', body: place }),
}

export const toF = (celsius: number) => (celsius * 9) / 5 + 32
export const toC = (fahrenheit: number) => ((fahrenheit - 32) * 5) / 9

/** 38 °F, or a dash. */
export function fahrenheit(celsius: number | null | undefined): string {
  return celsius == null ? '—' : `${Math.round(toF(celsius))} °F`
}

export const PLUG_KINDS: { value: PlugKind; label: string; hint: string }[] = [
  {
    value: 'shelly',
    label: 'Shelly plug',
    hint: 'Shelly Plug US, Plus Plug or Gen3. Find its address in the Shelly app under the plug, Settings, Device information.',
  },
  { value: 'tasmota', label: 'Tasmota plug', hint: 'Any plug running Tasmota. Its address is on its own web page.' },
  {
    value: 'home_assistant',
    label: 'Through Home Assistant',
    hint: 'Any plug Home Assistant can switch. Needs Home Assistant’s address, the plug’s entity and an access token.',
  },
]

/**
 * The defaults: on below 40 °F inside, off at 50 °F, never above 80 °F, at most 30 minutes
 * at a time, never with the projector on, warm-up 30 minutes before the show.
 */
export function blankHeater(): HeaterIn {
  return {
    name: 'Box heater',
    plug_kind: 'shelly',
    plug_address: '',
    plug_entity: null,
    sensor_player_id: null,
    projector_id: null,
    on_below_c: toC(40),
    off_above_c: toC(50),
    max_inside_c: toC(80),
    outside_on_below_c: toC(32),
    outside_off_above_c: toC(35),
    max_minutes_per_hour: 30,
    interlock: true,
    warmup_minutes: 30,
  }
}

export function heaterTone(heater: Heater): 'ok' | 'warn' | 'fault' | 'idle' | 'busy' {
  if (heater.plug_error) return 'fault'
  if (heater.reason.startsWith('Off for safety')) return 'warn'
  if (heater.is_on) return 'busy'
  return 'idle'
}

export function stateWord(heater: Heater): string {
  if (heater.plug_error || heater.is_on === null) return 'Plug not answering'
  return heater.is_on ? 'Heating' : 'Off'
}

export function modeWord(heater: Heater): string {
  return { auto: 'Automatic', on: 'On by hand', off: 'Kept off' }[heater.mode]
}
