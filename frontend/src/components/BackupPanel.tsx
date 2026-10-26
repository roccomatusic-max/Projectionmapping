import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, getToken, request } from '@/api/client'
import { Banner, Chip, ConfirmDialog, Panel, Spinner } from '@/components/ui'
import {
  BackupIcon,
  DeleteIcon,
  DownloadIcon,
  PrintIcon,
  RestoreIcon,
  UploadIcon,
} from '@/components/icons'
import { formatDateTime, relativeTime } from '@/lib/format'
import { formatBytes } from '@/mapping/editor/controls'

/**
 * Settings → Backup (backend/app/backups.py): one click saves everything to
 * one file, the server makes one by itself every night, and any of them, or
 * a file from this computer, can be put back. Also the way to the printable
 * setup guide (pages/SetupGuide.tsx).
 */

type Kind = 'manual' | 'nightly' | 'before-restore' | 'uploaded'

export interface BackupEntry {
  name: string
  kind: Kind
  made_as: Kind | null
  created_at: string
  size_bytes: number
  app_version: string | null
  computer: string | null
  system: string | null
  contents: Record<string, number>
  media_included: boolean
  media_files: number
  media_bytes: number
  has_passwords: boolean
  problem: string | null
}

interface RestoreResult {
  ok: boolean
  message: string
  name: string | null
  at: string
  created_at: string | null
  app_version: string | null
  computer: string | null
  media_added: number
}

interface BackupStatus {
  supported: boolean
  reason: string | null
  folder?: string
  backups: BackupEntry[]
  media_files: number
  media_bytes: number
  last_restore: RestoreResult | null
  can_restart: boolean
  keep: Record<Kind, number>
  night_hours?: [number, number]
}

const KIND_LABEL: Record<Kind, string> = {
  manual: 'made by you',
  nightly: 'nightly',
  'before-restore': 'before a restore',
  uploaded: 'from a file',
}

const CONTENT_WORDS: Array<[string, string, string]> = [
  ['projectors', 'projector', 'projectors'],
  ['shows', 'show', 'shows'],
  ['scenes', 'scene', 'scenes'],
  ['scene_groups', 'scene group', 'scene groups'],
  ['saved_maps', 'saved map', 'saved maps'],
  ['calendar', 'calendar entry', 'calendar entries'],
  ['players', 'mini PC', 'mini PCs'],
  ['automations', 'automation', 'automations'],
]

export function describeContents(entry: Pick<BackupEntry, 'contents' | 'media_included' | 'media_files'>) {
  const parts = CONTENT_WORDS.filter(([key]) => (entry.contents[key] ?? 0) > 0).map(
    ([key, one, many]) => `${entry.contents[key]} ${entry.contents[key] === 1 ? one : many}`,
  )
  if (entry.media_included) parts.push(`${entry.media_files} pictures and videos`)
  return parts.join(' · ') || 'nothing set up yet'
}

function hour(value: number) {
  return new Date(2000, 0, 1, value).toLocaleTimeString([], { hour: 'numeric' })
}

async function startDownload(name: string) {
  const { url } = await request<{ url: string }>(`/backups/${encodeURIComponent(name)}/link`, {
    method: 'POST',
  })
  // A plain link, so a backup with its videos streams to disk.
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

/** Raw upload with progress: a backup with its videos can be gigabytes. */
function upload(file: File, onProgress: (fraction: number) => void): Promise<BackupEntry> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/backups/upload')
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('Content-Type', 'application/zip')
    xhr.setRequestHeader('X-Client', 'ui')
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      let body: { detail?: unknown } | BackupEntry | undefined
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        body = undefined
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as BackupEntry)
      else {
        const detail = (body as { detail?: unknown } | undefined)?.detail
        reject(new ApiError(xhr.status, typeof detail === 'string' ? detail : `Upload failed (${xhr.status})`))
      }
    }
    xhr.onerror = () => reject(new ApiError(0, 'The upload stopped. Check the connection and try again.'))
    xhr.send(file)
  })
}

export default function BackupPanel({
  onToast,
}: {
  onToast: (tone: 'ok' | 'fault', title: string, detail?: string) => void
}) {
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [withMedia, setWithMedia] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<BackupEntry | null>(null)
  const [deleting, setDeleting] = useState<BackupEntry | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [waiting, setWaiting] = useState<{ restarting: boolean; message: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    try {
      setStatus(await request<BackupStatus>('/backups'))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the backups')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  // While the server restarts to restore, wait for it to come back, then reload.
  useEffect(() => {
    if (!waiting?.restarting) return
    let wentDown = false
    const started = Date.now()
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch('/api/health', { cache: 'no-store' })
        if (!response.ok) throw new Error('not yet')
        if (wentDown || Date.now() - started > 90_000) window.location.reload()
      } catch {
        wentDown = true
      }
    }, 2000)
    return () => window.clearInterval(timer)
  }, [waiting])

  if (!status) return error ? <Banner tone="fault">{error}</Banner> : <Spinner />

  if (!status.supported) {
    return (
      <Panel icon={BackupIcon} title="Backup">
        <p className="text-sm text-slate-400">{status.reason}</p>
      </Panel>
    )
  }

  const newest = status.backups.find((b) => !b.problem)
  const [nightFrom] = status.night_hours ?? [3, 6]
  const recentRestore =
    status.last_restore && Date.now() - new Date(status.last_restore.at).getTime() < 2 * 86_400_000
      ? status.last_restore
      : null

  const backUpNow = async () => {
    setBusy('make')
    try {
      const entry = await request<BackupEntry>('/backups', {
        method: 'POST',
        body: { include_media: withMedia },
      })
      await load()
      await startDownload(entry.name)
      onToast('ok', 'Backup made', `${entry.name} is downloading. Keep it somewhere safe.`)
    } catch (err) {
      onToast('fault', 'Could not make the backup', err instanceof ApiError ? err.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  const download = async (entry: BackupEntry) => {
    setBusy(`download:${entry.name}`)
    try {
      await startDownload(entry.name)
    } catch (err) {
      onToast('fault', 'Could not download it', err instanceof ApiError ? err.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  const pickFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setProgress(0)
    try {
      const entry = await upload(file, setProgress)
      await load()
      setRestoring(entry)
    } catch (err) {
      onToast('fault', 'That file cannot be restored', err instanceof ApiError ? err.message : undefined)
    } finally {
      setProgress(null)
    }
  }

  const restore = async (entry: BackupEntry) => {
    setRestoring(null)
    setBusy('restore')
    try {
      const result = await request<{ restarting: boolean; message: string }>(
        `/backups/${encodeURIComponent(entry.name)}/restore`,
        { method: 'POST', body: { confirm: true } },
      )
      setWaiting(result)
    } catch (err) {
      onToast('fault', 'Could not restore it', err instanceof ApiError ? err.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  const remove = async (entry: BackupEntry) => {
    setDeleting(null)
    try {
      await request<void>(`/backups/${encodeURIComponent(entry.name)}`, { method: 'DELETE' })
      await load()
      onToast('ok', 'Backup deleted')
    } catch (err) {
      onToast('fault', 'Could not delete it', err instanceof ApiError ? err.message : undefined)
    }
  }

  if (waiting) {
    return (
      <Panel icon={RestoreIcon} title="Restoring the backup">
        <div className="flex items-start gap-3 text-sm text-slate-300">
          {waiting.restarting && <Spinner size="sm" label={null} />}
          <div className="space-y-2">
            <p>{waiting.message}</p>
            <p className="text-xs text-slate-500">
              Afterwards, sign in with the username and password from the backup. The mini PCs
              and the phone remote reconnect by themselves.
            </p>
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <div className="space-y-4">
      {error && <Banner tone="fault" onDismiss={() => setError(null)}>{error}</Banner>}
      {recentRestore && (
        <Banner
          tone={recentRestore.ok ? 'ok' : 'fault'}
          title={recentRestore.ok ? `Restored the backup from ${formatDateTime(recentRestore.created_at)}` : 'The last restore did not finish'}
        >
          {recentRestore.ok
            ? `Put back ${relativeTime(recentRestore.at)}${recentRestore.computer ? `, made on ${recentRestore.computer}` : ''}${recentRestore.app_version ? ` with version ${recentRestore.app_version}` : ''}.${recentRestore.media_added ? ` ${recentRestore.media_added} pictures and videos added.` : ''}`
            : recentRestore.message}
        </Banner>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          icon={BackupIcon}
          title="Back up"
          description="Saves everything this server is set up with into one file: projectors, shows, cues, scenes, scene groups, saved maps, the calendar, mini PCs, automations, users and settings."
        >
          <div className="space-y-3 text-sm">
            <p className="text-slate-300">
              {newest ? (
                <>
                  Last backup {formatDateTime(newest.created_at)} ({KIND_LABEL[newest.kind]}).
                </>
              ) : (
                'No backup yet.'
              )}{' '}
              <span className="text-slate-500">
                The server also makes one by itself every night after {hour(nightFrom)} and keeps
                the last {status.keep.nightly}.
              </span>
            </p>
            <label className="flex items-start gap-2 text-slate-300">
              <input
                type="checkbox"
                className="mt-1"
                checked={withMedia}
                disabled={status.media_files === 0}
                onChange={(e) => setWithMedia(e.target.checked)}
              />
              <span>
                Also include the pictures and videos
                <span className="block text-xs text-slate-500">
                  {status.media_files === 0
                    ? 'The media library is empty.'
                    : `${status.media_files} files, ${formatBytes(status.media_bytes)}. Needed on a new server; the nightly backups leave them out.`}
                </span>
              </span>
            </label>
            <button className="btn-primary" disabled={busy !== null} onClick={() => void backUpNow()}>
              {busy === 'make' ? (
                <>
                  <Spinner size="sm" label={null} /> Backing up…
                </>
              ) : (
                <>
                  <DownloadIcon size={14} aria-hidden /> Back up and download
                </>
              )}
            </button>
            <Banner tone="warn" title="Keep backup files private">
              A backup holds your projector passwords, your AI and phone alert keys and the server's
              secret key. Save it on a USB
              stick or in your own cloud storage. Do not post it or send it to anyone.
            </Banner>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel
            icon={UploadIcon}
            title="Restore from a file"
            description="On a new or wiped server: install it, sign in, then pick the backup file here."
          >
            <div className="space-y-2 text-sm">
              <input
                ref={fileRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(e) => void pickFile(e)}
              />
              <button
                className="btn-default"
                disabled={progress !== null || busy !== null}
                onClick={() => fileRef.current?.click()}
              >
                <UploadIcon size={14} aria-hidden />{' '}
                {progress !== null ? `Checking the file… ${Math.round(progress * 100)}%` : 'Choose a backup file'}
              </button>
              <p className="text-xs text-slate-500">
                You see what is in it before anything changes.
              </p>
            </div>
          </Panel>

          <Panel
            icon={PrintIcon}
            title="Setup guide"
            description="One page with your whole system: addresses, versions, every projector and mini PC, the install lines and what to do if something breaks just before the show. No passwords."
          >
            <Link to="/setup-guide" className="btn-default inline-flex">
              <PrintIcon size={14} aria-hidden /> Open the setup guide to print
            </Link>
          </Panel>
        </div>
      </div>

      <Panel
        icon={RestoreIcon}
        title="Backups on this server"
        description={`Kept in ${status.folder ?? 'the data folder'}. Restore puts one back; how things are now is saved first.`}
        bodyClassName="p-0"
      >
        {status.backups.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">None yet. The first nightly backup is made a few minutes after the server starts.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {status.backups.map((entry) => (
              <li key={entry.name} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-slate-200">
                    {formatDateTime(entry.created_at)}
                    <Chip tone={entry.kind === 'manual' ? 'ok' : 'idle'}>{KIND_LABEL[entry.kind]}</Chip>
                    <span className="text-xs text-slate-500">{formatBytes(entry.size_bytes)}</span>
                  </p>
                  {entry.problem ? (
                    <p className="text-xs text-red-300">{entry.problem}</p>
                  ) : (
                    <p className="text-xs text-slate-500">
                      {describeContents(entry)}
                      {entry.app_version ? ` · version ${entry.app_version}` : ''}
                      {entry.computer ? ` · ${entry.computer}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    className="btn-ghost text-xs"
                    disabled={busy !== null || !!entry.problem}
                    onClick={() => void download(entry)}
                  >
                    <DownloadIcon size={13} aria-hidden /> Download
                  </button>
                  <button
                    className="btn-ghost text-xs"
                    disabled={busy !== null || !!entry.problem}
                    onClick={() => setRestoring(entry)}
                  >
                    <RestoreIcon size={13} aria-hidden /> Restore
                  </button>
                  <button
                    className="btn-ghost text-xs text-red-300"
                    aria-label={`Delete the backup from ${formatDateTime(entry.created_at)}`}
                    disabled={busy !== null}
                    onClick={() => setDeleting(entry)}
                  >
                    <DeleteIcon size={13} aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ConfirmDialog
        open={restoring !== null}
        danger
        title="Restore this backup?"
        target={
          restoring && (
            <div className="space-y-0.5">
              <p className="text-slate-200">
                Backup from {formatDateTime(restoring.created_at)}
                {restoring.app_version ? `, version ${restoring.app_version}` : ''}
              </p>
              <p className="text-xs text-slate-400">{describeContents(restoring)}</p>
              {restoring.computer && <p className="text-xs text-slate-500">Made on {restoring.computer}</p>}
            </div>
          )
        }
        body={
          <div className="space-y-2">
            <p>
              Everything on this server is replaced with what is in the backup, including the users
              and their passwords. A backup of how things are now is made first, so you can go back.
            </p>
            <p>
              {status.can_restart
                ? 'The server restarts; it is back in about a minute. Stop the show first if one is playing.'
                : 'Afterwards, close Projector Control and open it again to finish.'}
            </p>
          </div>
        }
        confirmLabel="Restore"
        onConfirm={() => restoring && void restore(restoring)}
        onCancel={() => setRestoring(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        danger
        title="Delete this backup?"
        body={deleting ? `The backup from ${formatDateTime(deleting.created_at)} is removed from this server. Copies you downloaded are kept.` : ''}
        confirmLabel="Delete"
        onConfirm={() => deleting && void remove(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
