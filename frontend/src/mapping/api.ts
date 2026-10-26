import { ApiError, getToken, request } from '@/api/client'
import type {
  AiStatus,
  ApplyResult,
  CalibrationGrid,
  CameraCommandName,
  CameraView,
  Cue,
  MapApplied,
  MapParts,
  MappingScene,
  MediaAsset,
  Output,
  Show,
  SavedMap,
  ShowSummary,
  Surface,
  TransportAction,
  TransportState,
} from './types'

export const mappingApi = {
  listMedia: () => request<MediaAsset[]>('/mapping/media'),
  updateMedia: (id: number, body: Partial<MediaAsset>) =>
    request<MediaAsset>(`/mapping/media/${id}`, { method: 'PATCH', body }),
  deleteMedia: (id: number) => request<void>(`/mapping/media/${id}`, { method: 'DELETE' }),

  listShows: () => request<ShowSummary[]>('/mapping/shows'),
  getShow: (id: number) => request<Show>(`/mapping/shows/${id}`),
  createShow: (body: { name: string; canvas_width: number; canvas_height: number }) =>
    request<Show>('/mapping/shows', { method: 'POST', body }),
  updateShow: (id: number, body: Partial<Omit<Show, 'outputs' | 'cues'>>) =>
    request<Show>(`/mapping/shows/${id}`, { method: 'PATCH', body }),
  deleteShow: (id: number) => request<void>(`/mapping/shows/${id}`, { method: 'DELETE' }),

  listMaps: () => request<SavedMap[]>('/mapping/maps'),
  saveMap: (showId: number, body: { name: string; replace?: boolean }) =>
    request<SavedMap>(`/mapping/shows/${showId}/save-map`, { method: 'POST', body }),
  applyMap: (showId: number, mapId: number, parts: MapParts) =>
    request<MapApplied>(`/mapping/shows/${showId}/apply-map`, { method: 'POST', body: { map_id: mapId, ...parts } }),
  /** The map as a file's contents, to download. */
  exportMap: (id: number) => request<Record<string, unknown>>(`/mapping/maps/${id}`),
  importMap: (file: unknown) => request<SavedMap>('/mapping/maps', { method: 'POST', body: file }),
  deleteMap: (id: number) => request<void>(`/mapping/maps/${id}`, { method: 'DELETE' }),

  createOutput: (showId: number, body: Partial<Output>) =>
    request<Output>(`/mapping/shows/${showId}/outputs`, { method: 'POST', body }),
  updateOutput: (id: number, body: Partial<Output>) =>
    request<Output>(`/mapping/outputs/${id}`, { method: 'PATCH', body }),
  /** Geometry on the move: shown on the projectors at once, not saved. */
  liveOutput: (id: number, body: Partial<Output>) =>
    request<void>(`/mapping/outputs/${id}/live`, { method: 'POST', body }),
  deleteOutput: (id: number) => request<void>(`/mapping/outputs/${id}`, { method: 'DELETE' }),
  identifyOutput: (id: number) => request<void>(`/mapping/outputs/${id}/identify`, { method: 'POST' }),

  createCue: (showId: number, body: Partial<Cue>) =>
    request<Cue>(`/mapping/shows/${showId}/cues`, { method: 'POST', body }),
  updateCue: (id: number, body: Partial<Cue>) =>
    request<Cue>(`/mapping/cues/${id}`, { method: 'PATCH', body }),
  deleteCue: (id: number) => request<void>(`/mapping/cues/${id}`, { method: 'DELETE' }),
  reorderCues: (showId: number, cueIds: number[]) =>
    request<Cue[]>(`/mapping/shows/${showId}/cue-order`, {
      method: 'PUT',
      body: { cue_ids: cueIds },
    }),

  listScenes: () => request<MappingScene[]>('/mapping/scenes'),
  createScene: (body: Pick<MappingScene, 'name' | 'description' | 'layers'>) =>
    request<MappingScene>('/mapping/scenes', { method: 'POST', body }),
  updateScene: (id: number, body: Partial<Pick<MappingScene, 'name' | 'description' | 'layers'>>) =>
    request<MappingScene>(`/mapping/scenes/${id}`, { method: 'PATCH', body }),
  deleteScene: (id: number) => request<void>(`/mapping/scenes/${id}`, { method: 'DELETE' }),
  describeScene: (body: { prompt: string; show_id?: number; scene_id?: number }) =>
    request<MappingScene>('/mapping/scenes/describe', { method: 'POST', body }),
  saveSurfaces: (showId: number, surfaces: Surface[]) =>
    request<Show>(`/mapping/shows/${showId}`, { method: 'PATCH', body: { surfaces } }),
  simulatedPeople: (
    showId: number,
    people: Array<{ id: number; x: number; y: number; z: number | null; size: number }>,
  ) => request<void>('/mapping/simulated-people', { method: 'POST', body: { show_id: showId, people } }),
  aiStatus: () => request<AiStatus>('/mapping/ai'),
  setAiKey: (key: string) => request<AiStatus>('/mapping/ai/key', { method: 'PUT', body: { key } }),
  removeAiKey: () => request<AiStatus>('/mapping/ai/key', { method: 'DELETE' }),
  paintStatus: () => request<AiStatus>('/mapping/paint'),
  setPaintKey: (key: string) => request<AiStatus>('/mapping/paint/key', { method: 'PUT', body: { key } }),
  removePaintKey: () => request<AiStatus>('/mapping/paint/key', { method: 'DELETE' }),
  /** Repaint a canvas-shaped picture of the building (base64 JPEG/PNG) as described. */
  paintHouse: (body: { prompt: string; image: string; show_id: number }) =>
    request<MediaAsset>('/mapping/paint', { method: 'POST', body }),

  transport: () => request<TransportState>('/mapping/transport'),
  command: (action: TransportAction, extra: { show_id?: number; cue?: number } = {}) =>
    request<TransportState>('/mapping/transport', { method: 'POST', body: { action, ...extra } }),
  clock: () => request<{ now_ms: number; monotonic: number }>('/mapping/clock'),

  calibrate: (outputId: number, cameraId: number) =>
    request<void>(`/mapping/outputs/${outputId}/calibrate`, { method: 'POST', body: { camera_id: cameraId } }),
  /** Undo one output's calibration: back to its slice and warp from before. */
  clearCalibration: (outputId: number) =>
    request<void>(`/mapping/outputs/${outputId}/calibration`, { method: 'DELETE' }),
  /** Undo the whole show's calibration and stop one still running. */
  removeCalibration: (showId: number) =>
    request<{ restored: number[] }>(`/mapping/shows/${showId}/remove-calibration`, { method: 'POST' }),
  applyCalibration: (showId: number, mesh: number) =>
    request<ApplyResult[]>(`/mapping/shows/${showId}/apply-calibration`, { method: 'POST', body: { mesh } }),
  calibrationGrid: (outputId: number) => request<CalibrationGrid>(`/mapping/outputs/${outputId}/calibration`),
  fitCanvas: (showId: number, cameraId: number, slices: boolean) =>
    request<{ camera_view: CameraView; sliced: number[] }>(`/mapping/shows/${showId}/fit-canvas`, {
      method: 'POST',
      body: { camera_id: cameraId, slices },
    }),
  cameraCommand: (cameraId: number, command: CameraCommandName, seconds?: number) =>
    request<void>(`/mapping/cameras/${cameraId}/command`, { method: 'POST', body: { command, seconds } }),
}

/** The camera's latest photo; ``version`` busts the browser cache. */
export function snapshotUrl(cameraId: number, version: number | string): string {
  const token = getToken() ?? ''
  return `/api/mapping/cameras/${cameraId}/snapshot?token=${encodeURIComponent(token)}&v=${version}`
}

/** URL a <video> or <img> can load directly; it cannot send a header. */
export function mediaUrl(id: number): string {
  const token = getToken() ?? ''
  return `/api/mapping/media/${id}/file?token=${encodeURIComponent(token)}`
}

export interface ProbedMedia {
  width: number | null
  height: number | null
  duration: number | null
}

/** Read dimensions and duration in the browser before uploading. */
export function probeMedia(file: File): Promise<ProbedMedia> {
  const url = URL.createObjectURL(file)
  const done = (result: ProbedMedia) => {
    URL.revokeObjectURL(url)
    return result
  }
  const empty = { width: null, height: null, duration: null }
  return new Promise((resolve) => {
    if (file.type.startsWith('image/')) {
      const img = new Image()
      img.onload = () => resolve(done({ width: img.naturalWidth, height: img.naturalHeight, duration: null }))
      img.onerror = () => resolve(done(empty))
      img.src = url
      return
    }
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.onloadedmetadata = () =>
      resolve(
        done({
          width: video.videoWidth || null,
          height: video.videoHeight || null,
          duration: Number.isFinite(video.duration) ? video.duration : null,
        }),
      )
    video.onerror = () => resolve(done(empty))
    video.src = url
  })
}

/**
 * Upload one file as the raw request body, with progress.
 *
 * XMLHttpRequest rather than fetch because fetch still has no upload
 * progress, and a 10 GB show file with no progress bar looks hung.
 */
export function uploadMedia(
  file: File,
  probed: ProbedMedia,
  onProgress: (fraction: number) => void,
): Promise<MediaAsset> {
  const params = new URLSearchParams({ name: file.name })
  if (probed.width) params.set('width', String(probed.width))
  if (probed.height) params.set('height', String(probed.height))
  if (probed.duration != null) params.set('duration', String(probed.duration))
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/mapping/media?${params}`)
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.setRequestHeader('X-Client', 'ui')
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      let body: unknown = undefined
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        /* not JSON */
      }
      if (xhr.status === 201) resolve(body as MediaAsset)
      else {
        const detail = (body as { detail?: unknown })?.detail
        reject(
          new ApiError(
            xhr.status,
            typeof detail === 'string' ? detail : `Upload failed (${xhr.status})`,
            body,
          ),
        )
      }
    }
    xhr.onerror = () => reject(new ApiError(0, 'Upload failed: the connection was lost'))
    xhr.send(file)
  })
}
