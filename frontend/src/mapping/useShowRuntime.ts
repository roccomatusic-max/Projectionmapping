import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BusMessage } from '@/api/types'
import { mappingApi } from './api'
import { withDefaults } from './geometry'
import { type LinkStatus, ServerClock, useMappingFeed } from './live'
import { PeopleTracker } from './people'
import { Playback } from './playback'
import type { MappingScene, MediaAsset, Output, PeopleMessage, Show, TransportState } from './types'

export function normaliseShow(show: Show): Show {
  return { ...show, outputs: show.outputs.map((o) => withDefaults(o)) }
}

/**
 * Everything a view of a running show needs: the show, the media library,
 * the scene library, the transport, the people a camera sees, a synced
 * clock and a playback engine, all kept live from the WebSocket feed.
 */
export function useShowRuntime(showId: number | null, onOther?: (message: BusMessage) => void) {
  const [show, setShow] = useState<Show | null>(null)
  const [media, setMedia] = useState<MediaAsset[]>([])
  const [transport, setTransport] = useState<TransportState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const clockRef = useRef<ServerClock>()
  const playbackRef = useRef<Playback>()
  if (!clockRef.current) clockRef.current = new ServerClock()
  if (!playbackRef.current) playbackRef.current = new Playback()
  const clock = clockRef.current
  const playback = playbackRef.current
  const mediaRef = useRef<MediaAsset[]>([])
  const [scenes, setScenes] = useState<MappingScene[]>([])
  const people = useMemo(() => new PeopleTracker(showId ?? -1, clock), [showId, clock])

  useEffect(() => {
    playback.setPeople(people)
  }, [playback, people])

  useEffect(() => {
    playback.setSurfaces(show?.surfaces ?? [])
  }, [playback, show?.surfaces])

  useEffect(() => {
    playback.setCues(show?.cues ?? [])
  }, [playback, show?.cues])

  const loadScenes = useCallback(async () => {
    try {
      const list = await mappingApi.listScenes()
      playback.setScenes(list)
      setScenes(list)
    } catch {
      // An older server has no scenes; media still plays.
    }
  }, [playback])

  const loadMedia = useCallback(async () => {
    const list = await mappingApi.listMedia()
    mediaRef.current = list
    playback.setMedia(list)
    setMedia(list)
    return list
  }, [playback])

  const applyTransport = useCallback(
    async (state: TransportState, authoritative = false) => {
      const known = new Set(mediaRef.current.map((m) => m.id))
      const needed = [state.current?.media_id, state.previous?.media_id].filter(
        (id): id is number => id != null,
      )
      if (needed.some((id) => !known.has(id))) await loadMedia()
      playback.setState(state, authoritative)
      setTransport(state)
    },
    [loadMedia, playback],
  )

  const refresh = useCallback(async () => {
    try {
      await loadMedia()
      await loadScenes()
      if (showId != null) setShow(normaliseShow(await mappingApi.getShow(showId)))
      await applyTransport(await mappingApi.transport(), true)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the show')
    }
  }, [showId, loadMedia, loadScenes, applyTransport])

  useEffect(() => {
    clock.start()
    return () => clock.stop()
  }, [clock])

  useEffect(() => () => playback.dispose(), [playback])

  useEffect(() => {
    setShow(null)
    void refresh()
  }, [refresh])

  const link: LinkStatus = useMappingFeed((message: BusMessage) => {
    const payload = message.payload as Record<string, unknown>
    switch (message.type) {
      case 'mapping_transport':
        void applyTransport(payload as unknown as TransportState)
        break
      case 'mapping_output':
        if (payload.show_id === showId) {
          const output = withDefaults(payload.output as Output)
          setShow((current) =>
            current
              ? { ...current, outputs: current.outputs.map((o) => (o.id === output.id ? output : o)) }
              : current,
          )
        }
        break
      case 'mapping_show':
        if (payload.show_id === showId) void refresh()
        break
      case 'mapping_reconnected':
        void refresh()
        break
      case 'mapping_scene':
        void loadScenes()
        break
      case 'mapping_people':
        people.update(payload as unknown as PeopleMessage)
        onOther?.(message)
        break
      default:
        onOther?.(message)
    }
  })

  return {
    show,
    setShow,
    media,
    reloadMedia: loadMedia,
    scenes,
    reloadScenes: loadScenes,
    people,
    transport,
    link,
    clock,
    playback,
    error,
    refresh,
  }
}
