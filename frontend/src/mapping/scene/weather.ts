/**
 * The weather for the weather element, fetched through the server (which
 * asks Open-Meteo, free and without a key) every ten minutes per town and
 * shared by every weather element on this page. Until it arrives, or when
 * the server cannot reach the internet, the element says so instead.
 */

import { mappingApi } from '../api'
import type { WeatherNow } from '../types'

const FRESH_MS = 10 * 60_000

interface Entry {
  data: WeatherNow | null
  error: string | null
  fetchedAt: number
  loading: boolean
  failures: number
}

const entries = new Map<string, Entry>()

/** The latest weather for a place (empty: where the server is), starting a fetch when it is old. */
export function weatherFor(place: string): { data: WeatherNow | null; error: string | null } {
  const key = place.trim().toLowerCase()
  let entry = entries.get(key)
  if (!entry) {
    entry = { data: null, error: null, fetchedAt: 0, loading: false, failures: 0 }
    entries.set(key, entry)
  }
  const wait = entry.error ? Math.min(FRESH_MS, 15_000 * 2 ** entry.failures) : FRESH_MS
  if (!entry.loading && Date.now() - entry.fetchedAt > wait) {
    const e = entry
    e.loading = true
    mappingApi
      .weather(place.trim())
      .then((data) => {
        e.data = data
        e.error = null
        e.failures = 0
      })
      .catch((err: unknown) => {
        e.error = err instanceof Error ? err.message : 'Weather unavailable'
        e.failures = Math.min(6, e.failures + 1)
      })
      .finally(() => {
        e.loading = false
        e.fetchedAt = Date.now()
      })
  }
  return { data: entry.data, error: entry.error }
}

/** Words and an icon for a WMO weather code. */
export function weatherLook(code: number): { words: string; icon: 'sun' | 'part' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm' } {
  if (code === 0) return { words: 'Clear', icon: 'sun' }
  if (code === 1) return { words: 'Mostly clear', icon: 'sun' }
  if (code === 2) return { words: 'Partly cloudy', icon: 'part' }
  if (code === 3) return { words: 'Cloudy', icon: 'cloud' }
  if (code === 45 || code === 48) return { words: 'Foggy', icon: 'fog' }
  if (code >= 51 && code <= 57) return { words: 'Drizzle', icon: 'rain' }
  if (code >= 61 && code <= 67) return { words: code >= 66 ? 'Freezing rain' : 'Rain', icon: 'rain' }
  if (code >= 71 && code <= 77) return { words: 'Snow', icon: 'snow' }
  if (code >= 80 && code <= 82) return { words: 'Showers', icon: 'rain' }
  if (code === 85 || code === 86) return { words: 'Snow showers', icon: 'snow' }
  if (code >= 95) return { words: 'Thunderstorm', icon: 'storm' }
  return { words: '', icon: 'cloud' }
}
