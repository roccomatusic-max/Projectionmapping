/**
 * Tonight's show times for the "Tonight's show" board, read from the
 * server (the Dashboard's Tonight card and the Calendar decide them) once a
 * minute and shared by every board on this page.
 */

import { type Tonight, tonightApi } from '@/lib/tonight'

const FRESH_MS = 60_000

let data: Tonight | null = null
let error: string | null = null
let fetchedAt = 0
let loading = false
let failures = 0

/** The latest word on tonight's show, starting a fetch when it is old. */
export function tonightNow(): { data: Tonight | null; error: string | null } {
  const wait = error ? Math.min(FRESH_MS, 10_000 * 2 ** failures) : FRESH_MS
  if (!loading && Date.now() - fetchedAt > wait) {
    loading = true
    tonightApi
      .get()
      .then((t) => {
        data = t
        error = null
        failures = 0
      })
      .catch((err: unknown) => {
        error = err instanceof Error ? err.message : 'Show times unavailable'
        failures = Math.min(5, failures + 1)
      })
      .finally(() => {
        loading = false
        fetchedAt = Date.now()
      })
  }
  return { data, error }
}
