import { ApiError, getToken, request } from '@/api/client'
import type {
  Cue,
  MediaAsset,
  Output,
  Show,
  ShowSummary,
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
  updateShow: (id: number, body: Partial<ShowSummary>) =>
    request<Show>(`/mapping/shows/${id}`, { method: 'PATCH', body }),
  deleteShow: (id: number) => request<void>(`/mapping/shows/${id}`, { method: 'DELETE' }),

  createOutput: (showId: number, body: Partial<Output>) =>
    request<Output>(`/mapping/shows/${showId}/outputs`, { method: 'POST', body }),
  updateOutput: (id: number, body: Partial<Output>) =>
    request<Output>(`/mapping/outputs/${id}`, { method: 'PATCH', body }),
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

  transport: () => request<TransportState>('/mapping/transport'),
  command: (action: TransportAction, extra: { show_id?: number; cue?: number } = {}) =>
    request<TransportState>('/mapping/transport', { method: 'POST', body: { action, ...extra } }),
  clock: () => request<{ now_ms: number; monotonic: number }>('/mapping/clock'),
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
