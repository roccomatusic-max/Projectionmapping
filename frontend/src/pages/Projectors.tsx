import { type FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, type Session } from '@/api/client'
import type { DriverInfo, Projector } from '@/api/types'
import { useFleet, useTicker } from '@/hooks/useLiveData'
import {
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Panel,
  Spinner,
  StatusDot,
  ToastStack,
  useToasts,
} from '@/components/ui'
import { connectionTone } from '@/components/ProjectorCard'
import { POWER_LABEL, relativeTime } from '@/lib/format'

export default function Projectors({ session }: { session: Session }) {
  const { projectors, loading, error, refresh } = useFleet()
  const [drivers, setDrivers] = useState<DriverInfo[]>([])
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Projector | null>(null)
  const [deleting, setDeleting] = useState<Projector | null>(null)
  const { toasts, push, dismiss } = useToasts()
  useTicker(5000)

  const isAdmin = session.role === 'admin'

  useEffect(() => {
    void api
      .drivers()
      .then((result) => setDrivers(result.drivers))
      .catch(() => undefined)
  }, [])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-100">Projectors</h1>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setAdding(true)}>
            Add projector
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <Panel>
          <Spinner />
        </Panel>
      ) : projectors.length === 0 ? (
        <Panel>
          <EmptyState title="No projectors registered">
            {isAdmin
              ? 'Add a projector by its IP address to begin.'
              : 'Ask an administrator to register a projector.'}
          </EmptyState>
        </Panel>
      ) : (
        <Panel>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Address</th>
                  <th className="pb-2 pr-4 font-medium">Driver</th>
                  <th className="pb-2 pr-4 font-medium">Power</th>
                  <th className="pb-2 pr-4 font-medium">Last reply</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {projectors.map((projector) => (
                  <tr key={projector.id}>
                    <td className="py-2.5 pr-4">
                      <Link
                        to={`/projectors/${projector.id}`}
                        className="flex items-center gap-2 text-slate-100 hover:text-sky-300"
                      >
                        <StatusDot tone={connectionTone(projector)} />
                        <span>{projector.name}</span>
                      </Link>
                      {projector.location && (
                        <p className="ml-4.5 pl-1 text-xs text-slate-500">
                          {projector.location}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 tnum text-slate-400">
                      {projector.host}:{projector.port}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-slate-400">
                      {projector.driver}
                      {projector.allow_unverified_commands && (
                        <Chip tone="warn" title="Commands documented only for sibling models are enabled on this device.">
                          unverified enabled
                        </Chip>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Chip
                        tone={
                          !projector.state.online || projector.state.stale
                            ? 'unknown'
                            : projector.state.power === 'on'
                              ? 'ok'
                              : 'idle'
                        }
                      >
                        {projector.state.online && !projector.state.stale
                          ? POWER_LABEL[projector.state.power]
                          : 'Offline'}
                      </Chip>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-slate-500">
                      {relativeTime(projector.state.last_seen_at)}
                    </td>
                    <td className="py-2.5 text-right">
                      {isAdmin && (
                        <span className="flex justify-end gap-1">
                          <button
                            className="btn-ghost text-xs"
                            onClick={() => setEditing(projector)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn-ghost text-xs text-red-300"
                            onClick={() => setDeleting(projector)}
                          >
                            Remove
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {(adding || editing) && (
        <ProjectorForm
          drivers={drivers}
          projector={editing}
          onClose={() => {
            setAdding(false)
            setEditing(null)
          }}
          onSaved={(message) => {
            setAdding(false)
            setEditing(null)
            push('ok', message)
            void refresh()
          }}
          onError={(message) => push('fault', 'Save failed', message)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Remove ${deleting?.name}?`}
        body="The projector, its history, telemetry and group memberships are deleted. This cannot be undone. The projector hardware is not affected."
        confirmLabel="Remove"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          const target = deleting
          setDeleting(null)
          if (!target) return
          try {
            await api.deleteProjector(target.id)
            push('ok', `${target.name} removed`)
            void refresh()
          } catch (err) {
            push(
              'fault',
              'Remove failed',
              err instanceof ApiError ? err.message : undefined,
            )
          }
        }}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}

function ProjectorForm({
  drivers,
  projector,
  onClose,
  onSaved,
  onError,
}: {
  drivers: DriverInfo[]
  projector: Projector | null
  onClose: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}) {
  const editing = projector !== null
  const [form, setForm] = useState({
    name: projector?.name ?? '',
    host: projector?.host ?? '',
    port: projector?.port ?? 1024,
    driver: projector?.driver ?? 'panasonic_pt_dz13k',
    manufacturer: projector?.manufacturer ?? 'Panasonic',
    model: projector?.model ?? 'PT-DZ13K',
    location: projector?.location ?? '',
    username: projector?.username ?? 'admin1',
    password: '',
    lamp_warn_hours: projector?.lamp_warn_hours ?? 2000,
    lamp_critical_hours: projector?.lamp_critical_hours ?? 2500,
    allow_unverified_commands: projector?.allow_unverified_commands ?? false,
    enabled: projector?.enabled ?? true,
  })
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const selectedDriver = drivers.find((d) => d.driver_id === form.driver)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      const body: Record<string, unknown> = { ...form }
      // An empty password field means "leave unchanged" when editing.
      if (editing && !form.password) delete body.password
      if (editing) {
        await api.updateProjector(projector.id, body)
        onSaved(`${form.name} updated`)
      } else {
        await api.createProjector(body)
        onSaved(`${form.name} added`)
      }
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        className="panel my-8 w-full max-w-2xl p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-100">
          {editing ? `Edit ${projector.name}` : 'Add projector'}
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Name</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="House Left"
              required
            />
          </div>
          <div>
            <label className="label">IP address or hostname</label>
            <input
              className="input"
              value={form.host}
              onChange={(e) => set('host', e.target.value)}
              placeholder="192.168.20.21"
              required
            />
          </div>
          <div>
            <label className="label">Port</label>
            <input
              className="input tnum"
              type="number"
              value={form.port}
              onChange={(e) => set('port', Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label className="label">Driver</label>
            <select
              className="input"
              value={form.driver}
              onChange={(e) => {
                const driver = drivers.find((d) => d.driver_id === e.target.value)
                set('driver', e.target.value)
                if (driver) set('port', driver.default_port)
              }}
            >
              {drivers.map((driver) => (
                <option key={driver.driver_id} value={driver.driver_id}>
                  {driver.display_name}
                </option>
              ))}
            </select>
            {selectedDriver && (
              <p className="mt-1 text-xs text-slate-500">
                {selectedDriver.models.join(', ')} · default port{' '}
                {selectedDriver.default_port}
              </p>
            )}
          </div>
          <div>
            <label className="label">Location</label>
            <input
              className="input"
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              placeholder="Front lawn enclosure"
            />
          </div>
          <div>
            <label className="label">Control username</label>
            <input
              className="input"
              value={form.username}
              onChange={(e) => set('username', e.target.value)}
              placeholder="admin1"
            />
          </div>
          <div>
            <label className="label">
              Control password {editing && '(leave blank to keep)'}
            </label>
            <input
              className="input"
              type="password"
              value={form.password}
              autoComplete="new-password"
              onChange={(e) => set('password', e.target.value)}
              placeholder={projector?.has_password ? '••••••••' : 'none set'}
            />
            <p className="mt-1 text-xs text-slate-500">
              The projector's web-control administrator password. Stored encrypted;
              never shown again.
            </p>
          </div>
          <div>
            <label className="label">Lamp warning hours</label>
            <input
              className="input tnum"
              type="number"
              value={form.lamp_warn_hours}
              onChange={(e) => set('lamp_warn_hours', Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Lamp replacement hours</label>
            <input
              className="input tnum"
              type="number"
              value={form.lamp_critical_hours}
              onChange={(e) => set('lamp_critical_hours', Number(e.target.value))}
            />
          </div>
        </div>

        <label className="mt-4 flex items-start gap-3 rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.allow_unverified_commands}
            onChange={(e) => set('allow_unverified_commands', e.target.checked)}
          />
          <span className="text-sm text-slate-300">
            Allow unverified commands
            <span className="mt-0.5 block text-xs text-slate-400">
              Enables lens movement, image adjustments and remote keys, whose exact
              encoding is documented for sibling Panasonic models but not confirmed
              for the PT-DZ13K. Leave this off until you have checked the commands
              against your projector's own manual.
            </span>
          </span>
        </label>

        <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => set('enabled', e.target.checked)}
          />
          Enabled (polled and controllable)
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-default" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add projector'}
          </button>
        </div>
      </form>
    </div>
  )
}
