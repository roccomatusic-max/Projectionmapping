import { type FormEvent, useEffect, useState } from 'react'
import { ApiError, request } from '@/api/client'
import { Chip, ConfirmDialog, Panel } from '@/components/ui'
import { RefreshIcon } from '@/components/icons'

/**
 * Updates for the Mac app (docs/MAC-SERVER.md). Renders nothing anywhere
 * else: Docker and Terminal installs are updated the way they were set up.
 * Kept self-contained so the page around it can be restyled freely.
 */

interface UpdateStatus {
  supported: boolean
  current: string
  latest: string | null
  available: boolean
  needs_key: boolean
  has_key: boolean
  checked_at: string | null
  error: string | null
  installing: boolean
  last_result: string | null
  repository: string
  auto: boolean
  waiting: string | null
}

const keyLink = (repository: string) => {
  const owner = repository.split('/')[0]
  const params = new URLSearchParams({
    name: 'Projector Control updates',
    description: 'Lets the Mac server download new versions of Projector Control.',
    target_name: owner,
    expires_in: 'none',
    contents: 'read',
  })
  return `https://github.com/settings/personal-access-tokens/new?${params}`
}

export default function AppUpdates() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [key, setKey] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const run = async (call: () => Promise<UpdateStatus>) => {
    setBusy(true)
    setMessage(null)
    try {
      setStatus(await call())
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    request<UpdateStatus>('/system/updates').then(setStatus, () => setStatus(null))
  }, [])

  // While installing, wait for the restarted server to report the new version.
  useEffect(() => {
    if (!status?.installing || !status.latest) return
    const target = status.latest
    let wentDown = false
    const timer = window.setInterval(async () => {
      try {
        const health = await fetch('/api/health').then((r) => r.json())
        // Back on the new version, or back on the old one after the Mac
        // rolled a failed update back (the page then says so).
        if (health.version === target || wentDown) window.location.reload()
      } catch {
        wentDown = true // restarting
      }
    }, 3000)
    return () => window.clearInterval(timer)
  }, [status?.installing, status?.latest])

  if (!status?.supported) return null

  const saveKey = (event: FormEvent) => {
    event.preventDefault()
    void run(() =>
      request<UpdateStatus>('/system/updates/key', { method: 'PUT', body: { key } }),
    ).then(() => setKey(''))
  }

  const install = () => {
    setConfirming(false)
    void run(() =>
      request<UpdateStatus>('/system/updates/install', { method: 'POST', body: { confirm: true } }),
    )
  }

  return (
    <Panel
      icon={RefreshIcon}
      title="App updates"
      description="New versions come from GitHub every time a change is merged."
      action={
        !status.installing && !status.needs_key ? (
          <button
            className="btn-ghost text-xs"
            disabled={busy}
            onClick={() => void run(() => request<UpdateStatus>('/system/updates?check=true'))}
          >
            {busy ? 'Checking…' : 'Check now'}
          </button>
        ) : undefined
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-300">This Mac runs version {status.current}</span>
          {status.installing ? (
            <Chip tone="busy">installing {status.latest}</Chip>
          ) : status.available ? (
            <Chip tone="warn">{status.latest} available</Chip>
          ) : status.latest ? (
            <Chip tone="ok">up to date</Chip>
          ) : null}
        </div>

        {status.installing && (
          <p className="text-slate-400">
            Installing and restarting. This page comes back by itself in about a minute.
          </p>
        )}

        {status.available && !status.installing && (
          <button className="btn-primary" disabled={busy} onClick={() => setConfirming(true)}>
            Install {status.latest}
          </button>
        )}

        {!status.needs_key && (
          <label className="flex items-start gap-2 text-slate-300">
            <input
              type="checkbox"
              className="mt-1"
              checked={status.auto}
              disabled={busy}
              onChange={(e) =>
                void run(() =>
                  request<UpdateStatus>('/system/updates/auto', {
                    method: 'PUT',
                    body: { enabled: e.target.checked },
                  }),
                )
              }
            />
            <span>
              Install updates by themselves
              <span className="block text-xs text-slate-500">
                Only when no show is playing and nobody has controlled the projectors for 10
                minutes.
              </span>
            </span>
          </label>
        )}

        {status.waiting && !status.installing && (
          <p className="text-xs text-slate-400">Waiting to install: {status.waiting}.</p>
        )}

        {status.last_result?.startsWith('rolled-back') && (
          <p className="text-red-300">
            The last update did not start properly, so the previous version was put back.
          </p>
        )}

        {status.needs_key && (
          <form onSubmit={saveKey} className="space-y-2">
            <p className="text-slate-400">
              The project's GitHub repository is private, so this Mac needs a read-only GitHub key
              to see new versions. It only has to be done once.
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-slate-400">
              <li>
                <a className="text-sky-300 underline" href={keyLink(status.repository)} target="_blank" rel="noreferrer">
                  Open GitHub's key page
                </a>{' '}
                (sign in if asked).
              </li>
              <li>
                Under Repository access choose <b>Only select repositories</b> and pick{' '}
                <b>{status.repository.split('/')[1]}</b>.
              </li>
              <li>
                Under Permissions, set <b>Contents</b> to <b>Read-only</b>, then press{' '}
                <b>Generate token</b> and paste it here.
              </li>
            </ol>
            <div className="flex gap-2">
              <input
                className="input"
                type="password"
                placeholder="github_pat_…"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoComplete="off"
              />
              <button className="btn-primary" disabled={busy || !key.trim()}>
                Save
              </button>
            </div>
          </form>
        )}

        {(message || status.error) && <p className="text-red-300">{message || status.error}</p>}
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Install version ${status.latest}?`}
        body="Projector Control restarts to install it. The dashboard and phone remote are offline for about a minute, so do this between shows."
        confirmLabel="Install and restart"
        onConfirm={install}
        onCancel={() => setConfirming(false)}
      />
    </Panel>
  )
}
