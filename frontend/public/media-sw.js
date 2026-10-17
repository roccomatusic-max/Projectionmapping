/*
 * Media cache for players.
 *
 * A player downloads every file its show uses into Cache Storage before the
 * show, then this worker answers the <video> element's range requests from
 * disk. Playback no longer depends on the network holding up mid-show;
 * only the small control messages travel during the show.
 *
 * Service workers need a secure origin. On a LAN address over plain HTTP
 * the browser must be told to treat the server as secure; docs/MAPPING.md
 * has the launch flag. Without it the player streams instead.
 */

const CACHE = 'pc-media-v1'
const FILE = /\/api\/mapping\/media\/(\d+)\/file$/

const key = (id) => `/media-cache/${id}`

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  const match = url.pathname.match(FILE)
  if (!match || event.request.method !== 'GET') return
  event.respondWith(serve(event.request, match[1]))
})

async function serve(request, id) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(key(id))
  if (!cached) return fetch(request)
  const blob = await cached.blob()
  const type = cached.headers.get('content-type') || 'application/octet-stream'
  const range = request.headers.get('range')
  if (!range) {
    return new Response(blob, {
      status: 200,
      headers: { 'content-type': type, 'content-length': String(blob.size), 'accept-ranges': 'bytes' },
    })
  }
  const m = /bytes=(\d*)-(\d*)/.exec(range)
  let start = m && m[1] ? Number(m[1]) : 0
  let end = m && m[2] ? Number(m[2]) : blob.size - 1
  if (m && !m[1] && m[2]) {
    // Suffix range: the last N bytes.
    start = Math.max(0, blob.size - Number(m[2]))
    end = blob.size - 1
  }
  end = Math.min(end, blob.size - 1)
  if (start > end || start >= blob.size) {
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${blob.size}` } })
  }
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'content-type': type,
      'content-length': String(end - start + 1),
      'content-range': `bytes ${start}-${end}/${blob.size}`,
      'accept-ranges': 'bytes',
    },
  })
}

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'sync') event.waitUntil(sync(data.ids || [], data.token, event.source))
})

let syncing = Promise.resolve()

/** Download what is missing, drop what the show no longer uses. */
function sync(ids, token, client) {
  syncing = syncing.then(() => doSync(ids, token, client)).catch(() => undefined)
  return syncing
}

async function doSync(ids, token, client) {
  const cache = await caches.open(CACHE)
  const wanted = new Set(ids.map((id) => key(id)))
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname
    if (!wanted.has(path)) await cache.delete(request)
  }
  let failed = 0
  for (const id of ids) {
    if (await cache.match(key(id))) continue
    post(client, { type: 'progress', id, state: 'downloading' })
    try {
      const response = await fetch(`/api/mapping/media/${id}/file`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      await cache.put(key(id), response)
    } catch (err) {
      failed++
      post(client, { type: 'progress', id, state: 'failed', error: String(err) })
    }
  }
  let bytes = 0
  for (const request of await cache.keys()) {
    const response = await cache.match(request)
    const length = Number(response && response.headers.get('content-length'))
    if (Number.isFinite(length)) bytes += length
  }
  post(client, { type: 'synced', count: ids.length - failed, failed, bytes })
}

function post(client, message) {
  if (client && 'postMessage' in client) client.postMessage(message)
}
