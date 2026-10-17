import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError, api, type Session } from '@/api/client'
import type { DriverInfo, Projector } from '@/api/types'
import { useFleetContext, useOps } from '@/live/LiveProvider'
import { useDrivers } from '@/live/useCatalog'
import { FleetBrowser } from '@/components/fleet/FleetBrowser'
import { ConfirmDialog, EmptyState, Modal, PageHeader, Panel, Spinner } from '@/components/ui'
import { AddIcon, DeleteIcon, EditIcon, ProjectorIcon } from '@/components/icons'
import { isLive } from '@/lib/status'

export default function Projectors({ session }: { session: Session }) {
  const { projectors, loading, refresh } = useFleetContext()
  const { notify } = useOps()
  const drivers = useDrivers()
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState(params.get('add') === '1')
  const [editing, setEditing] = useState<Projector | null>(null)
  const [deleting, setDeleting] = useState<Projector | null>(null)

  const isAdmin = session.role === 'admin'
  const responding = projectors.filter(isLive).length

  useEffect(() => {
    if (params.get('add')) setParams({}, { replace: true })
  }, [params, setParams])

  const rowActions = useCallback(
    (projector: Projector) =>
      isAdmin ? (
        <>
          <button
            className="btn-ghost btn-sm btn-icon"
            onClick={() => setEditing(projector)}
            aria-label={`Edit ${projector.name}`}
            title="Edit"
          >
            <EditIcon size={14} />
          </button>
          <button
            className="btn-ghost btn-sm btn-icon text-red-300"
            onClick={() => setDeleting(projector)}
            aria-label={`Remove ${projector.name}`}
            title="Remove"
          >
            <DeleteIcon size={14} />
          </button>
        </>
      ) : null,
    [isAdmin],
  )

  return (
    <div className="space-y-4">
      <PageHeader
        icon={ProjectorIcon}
        title="Projectors"
        subtitle={`${projectors.length} registered · ${responding} responding`}
        actions={
          isAdmin && (
            <button className="btn-primary btn-sm" onClick={() => setAdding(true)}>
              <AddIcon size={14} aria-hidden /> Add projector
            </button>
          )
        }
      />

      {loading ? (
        <Panel>
          <Spinner />
        </Panel>
      ) : projectors.length === 0 ? (
        <Panel>
          <EmptyState
            title="No projectors registered"
            icon={ProjectorIcon}
            action={
              isAdmin && (
                <button className="btn-primary" onClick={() => setAdding(true)}>
                  <AddIcon size={15} aria-hidden /> Add projector
                </button>
              )
            }
          >
            {isAdmin
              ? 'Add a projector by its IP address to begin.'
              : 'Ask an administrator to register a projector.'}
          </EmptyState>
        </Panel>
      ) : (
        <FleetBrowser
          projectors={projectors}
          canControl={session.role !== 'viewer'}
          storageKey="pc.projectors"
          defaultView="list"
          defaultSort="name"
          rowActions={rowActions}
        />
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
            notify('ok', message)
            void refresh()
          }}
          onError={(message) => notify('fault', 'Save failed', message)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Remove ${deleting?.name}?`}
        target={
          deleting && (
            <p className="tnum text-slate-300">
              {deleting.name} · {deleting.host}:{deleting.port}
            </p>
          )
        }
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
            notify('ok', `${target.name} removed`)
            void refresh()
          } catch (err) {
            notify('fault', 'Remove failed', err instanceof ApiError ? err.message : undefined)
          }
        }}
      />
    </div>
  )
}

export function ProjectorForm({
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
    <Modal open label={editing ? `Edit ${projector.name}` : 'Add projector'} onClose={onClose} size="lg">
      <form onSubmit={submit} className="p-5">
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

        <label className="mt-4 flex items-start gap-3 rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3">
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
    </Modal>
  )
}
