import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import type { DriverInfo, Group } from '@/api/types'

// Drivers ship with the server and do not change while it runs: fetch once
// per page load and share the answer.
let driversPromise: Promise<DriverInfo[]> | null = null

export function useDrivers(): DriverInfo[] {
  const [drivers, setDrivers] = useState<DriverInfo[]>([])
  useEffect(() => {
    let alive = true
    driversPromise ??= api.drivers().then((result) => result.drivers).catch((err) => {
      driversPromise = null
      throw err
    })
    driversPromise.then((list) => alive && setDrivers(list)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
  return drivers
}

/** Groups, loaded when the component mounts. */
export function useGroups(): { groups: Group[]; loaded: boolean; reload: () => void } {
  const [groups, setGroups] = useState<Group[]>([])
  const [loaded, setLoaded] = useState(false)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let alive = true
    api
      .listGroups()
      .then((list) => alive && setGroups(list))
      .catch(() => undefined)
      .finally(() => alive && setLoaded(true))
    return () => {
      alive = false
    }
  }, [version])
  return { groups, loaded, reload: () => setVersion((v) => v + 1) }
}
