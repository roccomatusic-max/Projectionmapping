import { type FormEvent, useEffect, useState } from 'react'
import { ApiError, api, type Session } from '@/api/client'
import type { DriverInfo, Role } from '@/api/types'
import {
  Chip,
  ErrorBanner,
  Panel,
  Spinner,
  ToastStack,
  useToasts,
} from '@/components/ui'

export default function Settings({ session }: { session: Session }) {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof api.systemInfo>> | null>(null)
  const [drivers, setDrivers] = useState<DriverInfo[]>([])
  const [users, setUsers] = useState<
    Array<{ id: number; username: string; role: Role; is_active: boolean }>
  >([])
  const [error, setError] = useState<string | null>(null)
  const { toasts, push, dismiss } = useToasts()

  const isAdmin = session.role === 'admin'

  const load = async () => {
    try {
      const [systemInfo, driverList] = await Promise.all([
        api.systemInfo(),
        api.drivers(),
      ])
      setInfo(systemInfo)
      setDrivers(driverList.drivers)
      if (isAdmin) setUsers(await api.listUsers())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!info) return <Spinner />

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold text-slate-100">Settings</h1>
      {error && <ErrorBanner message={error} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Your account">
          <ChangePassword
            onDone={() => push('ok', 'Password changed')}
            onError={(message) => push('fault', 'Could not change password', message)}
          />
          <p className="mt-3 text-xs text-slate-500">
            Signed in as {session.username} with the {session.role} role.
          </p>
        </Panel>

        <Panel title="Polling intervals" description="Server-side defaults, in seconds.">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            {Object.entries(info.polling).map(([tier, seconds]) => (
              <div key={tier} className="contents">
                <dt className="text-slate-400 capitalize">{tier}</dt>
                <dd className="tnum text-slate-200">{seconds}s</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            Set these with the POLL_* environment variables. Individual projectors can
            override them with poll_overrides.
          </p>
        </Panel>
      </div>

      <Panel
        title="Device connections"
        description="Live transport state for each registered projector."
      >
        {info.devices.length === 0 ? (
          <p className="text-sm text-slate-500">No projectors registered.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {info.devices.map((device) => (
              <li
                key={device.projector_id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div>
                  <p className="text-sm text-slate-200">{device.name}</p>
                  {device.last_error && (
                    <p className="text-xs text-red-300">{device.last_error}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {device.queue_depth > 0 && (
                    <Chip tone="busy">{device.queue_depth} queued</Chip>
                  )}
                  <Chip tone={device.connected ? 'ok' : 'idle'}>
                    {device.connected ? 'socket open' : 'socket closed'}
                  </Chip>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Drivers and command provenance"
        description="Where each command comes from. Commands marked as sibling-model are refused unless a projector opts in."
      >
        <div className="space-y-4">
          {drivers.map((driver) => {
            const gated = driver.capabilities.filter((c) => c.requires_opt_in)
            const trusted = driver.capabilities.filter((c) => !c.requires_opt_in)
            return (
              <div key={driver.driver_id} className="rounded-md bg-panel-850 p-3">
                <p className="text-sm font-medium text-slate-200">
                  {driver.display_name}
                </p>
                <p className="text-xs text-slate-500">
                  {driver.manufacturer} · {driver.models.join(', ')} · default port{' '}
                  {driver.default_port}
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wide text-emerald-400">
                      Verified ({trusted.length})
                    </p>
                    <p className="text-xs text-slate-400">
                      {trusted.map((c) => c.name).join(', ') || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wide text-amber-400">
                      Needs opt-in ({gated.length})
                    </p>
                    <p className="text-xs text-slate-400">
                      {gated.map((c) => c.name).join(', ') || '—'}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Panel>

      {isAdmin && (
        <Panel title="Users">
          <UserAdmin
            users={users}
            currentUser={session.username}
            onChanged={() => void load()}
            onToast={(tone, title, detail) => push(tone, title, detail)}
          />
        </Panel>
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}

function ChangePassword({
  onDone,
  onError,
}: {
  onDone: () => void
  onError: (message: string) => void
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.changePassword(current, next)
      setCurrent('')
      setNext('')
      onDone()
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label">Current password</label>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label">New password (minimum 10 characters)</label>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
      </div>
      <button className="btn-primary" disabled={busy}>
        {busy ? 'Changing…' : 'Change password'}
      </button>
    </form>
  )
}

function UserAdmin({
  users,
  currentUser,
  onChanged,
  onToast,
}: {
  users: Array<{ id: number; username: string; role: Role; is_active: boolean }>
  currentUser: string
  onChanged: () => void
  onToast: (tone: 'ok' | 'fault', title: string, detail?: string) => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('viewer')
  const [busy, setBusy] = useState(false)

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-white/5">
        {users.map((user) => (
          <li key={user.id} className="flex items-center justify-between gap-2 py-2">
            <div>
              <p className="text-sm text-slate-200">{user.username}</p>
              <p className="text-xs text-slate-500">{user.role}</p>
            </div>
            {user.username !== currentUser && (
              <button
                className="btn-ghost text-xs text-red-300"
                onClick={async () => {
                  try {
                    await api.deleteUser(user.id)
                    onToast('ok', `${user.username} removed`)
                    onChanged()
                  } catch (err) {
                    onToast(
                      'fault',
                      'Could not remove user',
                      err instanceof ApiError ? err.message : undefined,
                    )
                  }
                }}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      <form
        className="grid gap-3 rounded-md bg-panel-850 p-3 sm:grid-cols-4"
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          try {
            await api.createUser(username, password, role)
            setUsername('')
            setPassword('')
            onToast('ok', `${username} added`)
            onChanged()
          } catch (err) {
            onToast(
              'fault',
              'Could not add user',
              err instanceof ApiError ? err.message : undefined,
            )
          } finally {
            setBusy(false)
          }
        }}
      >
        <div>
          <label className="label">Username</label>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
          />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={10}
          />
        </div>
        <div>
          <label className="label">Role</label>
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="viewer">Viewer (read-only)</option>
            <option value="operator">Operator (can send commands)</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full" disabled={busy}>
            Add user
          </button>
        </div>
      </form>
    </div>
  )
}
