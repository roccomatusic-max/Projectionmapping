import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, type Session } from '@/api/client'
import type { DriverInfo, Projector } from '@/api/types'
import { useFleet, useTicker } from '@/hooks/useLiveData'
import {
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Panel,
  Spinner,
  ToastStack,
  useToasts,
} from '@/components/ui'
import { connectionTone } from '@/components/ProjectorCard'
import { InputBadge, LampMeter, ProjectorMark } from '@/components/graphics'
import { AddIcon, ChevronIcon, ProjectorIcon } from '@/components/icons'
import { POWER_LABEL, relativeTime, renderTelemetry } from '@/lib/format'

function peakLampHours(projector: Projector): number | null {
  const lamps = projector.state.lamp_hours
  if (lamps.availability !== 'available' || !Array.isArray(lamps.value)) return null
  const hours = lamps.value.map((l) => l.hours).filter((h): h is number => h != null)
  return hours.length ? Math.max(...hours) : null
}

export default function Projectors({ session }: { session: Session }) {
  const { projectors, loading, error, refresh } = useFleet()
  const [drivers, setDrivers] = useState<DriverInfo[]>([])
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Projector | null>(null)
  const [deleting, setDeleting] = useState<Projector | null>(null)
  const [query, setQuery] = useState('')
  const { toasts, push, dismiss } = useToasts()
  useTicker(5000)

  const isAdmin = session.role === 'admin'
  const driverName = useMemo(
    () => Object.fromEntries(drivers.map((d) => [d.driver_id, d.display_name])),
    [drivers],
  )
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projectors
    return projectors.filter((p) =>
      [p.name, p.model, p.location, p.host, p.driver].some((v) => v?.toLowerCase().includes(q)),
    )
  }, [projectors, query])

  useEffect(() => {
    void api
      .drivers()
      .then((result) => setDrivers(result.drivers))
      .catch(() => undefined)
  }, [])

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ProjectorIcon}
        title="Projectors"
        subtitle={`${projectors.length} registered · ${projectors.filter((p) => p.state.online && !p.state.stale).length} responding`}
        actions={
          <>
            {projectors.length > 3 && (
              <input
                className="input w-56"
                placeholder="Search name, model, location, IP"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search projectors"
              />
            )}
            {isAdmin && (
              <button className="btn-primary" onClick={() => setAdding(true)}>
                <AddIcon size={15} aria-hidden /> Add projector
              </button>
            )}
          </>
        }
      />

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
        <Panel className="overflow-hidden">
          {/* Phone layout: one row per projector, no sideways scrolling. */}
          <ul className="-m-4 divide-y divide-white/5 lg:hidden">
            {shown.map((projector) => {
              const live = projector.state.online && !projector.state.stale
              const transitioning = projector.state.power === 'warming' || projector.state.power === 'cooling'
              return (
                <li key={projector.id} className="flex items-center gap-3 px-4 py-3">
                  <Link to={`/projectors/${projector.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <ProjectorMark tone={connectionTone(projector)} size="sm" pulse={transitioning} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-100">{projector.name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {projector.model || projector.manufacturer}
                        {projector.location && ` · ${projector.location}`}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <Chip tone={!live ? 'unknown' : projector.state.power === 'on' ? 'ok' : transitioning ? 'busy' : 'idle'}>
                          {live ? POWER_LABEL[projector.state.power] : 'Offline'}
                        </Chip>
                        <span className="tnum">{projector.host}:{projector.port}</span>
                        <span className={projector.state.stale ? 'text-amber-400' : undefined}>
                          {relativeTime(projector.state.last_seen_at)}{projector.state.stale && ' · stale'}
                        </span>
                      </span>
                    </span>
                  </Link>
                  {isAdmin && (
                    <button className="btn-ghost px-2 text-xs" onClick={() => setEditing(projector)}>
                      Edit
                    </button>
                  )}
                  <Link to={`/projectors/${projector.id}`} className="btn-ghost px-2" aria-label="Details">
                    <ChevronIcon size={16} />
                  </Link>
                </li>
              )
            })}
            {shown.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-500">No projector matches “{query}”.</li>
            )}
          </ul>
          <div className="-m-4 hidden overflow-x-auto lg:block">
            <table className="table">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="pl-4 pt-3">Projector</th>
                  <th className="pt-3">Address</th>
                  <th className="pt-3">Driver</th>
                  <th className="pt-3">Power</th>
                  <th className="pt-3">Input</th>
                  <th className="min-w-[160px] pt-3">Lamp</th>
                  <th className="whitespace-nowrap pt-3">Last reply</th>
                  <th className="pr-4 pt-3" />
                </tr>
              </thead>
              <tbody>
                {shown.map((projector) => {
                  const live = projector.state.online && !projector.state.stale
                  const input = renderTelemetry(projector.state.active_input, (v) => (typeof v === 'string' ? v : v.label))
                  const code = projector.state.active_input.availability === 'available' && typeof projector.state.active_input.value === 'object'
                    ? projector.state.active_input.value?.code ?? '' : ''
                  const transitioning = projector.state.power === 'warming' || projector.state.power === 'cooling'
                  return (
                    <tr key={projector.id} className={!projector.enabled ? 'opacity-60' : undefined}>
                      <td className="pl-4">
                        <Link to={`/projectors/${projector.id}`} className="flex items-center gap-3 group">
                          <ProjectorMark tone={connectionTone(projector)} size="sm" pulse={transitioning} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-slate-100 group-hover:text-sky-300">{projector.name}</span>
                            <span className="block truncate text-xs text-slate-500">
                              {projector.model || projector.manufacturer}
                              {projector.location && ` · ${projector.location}`}
                              {!projector.enabled && ' · disabled'}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="tnum text-slate-400">
                        {projector.host}:{projector.port}
                      </td>
                      <td className="text-xs text-slate-400">
                        <span className="block">{driverName[projector.driver] ?? projector.driver}</span>
                        {projector.allow_unverified_commands && (
                          <Chip tone="warn" title="Commands documented only for sibling models are enabled on this device.">
                            unverified enabled
                          </Chip>
                        )}
                      </td>
                      <td>
                        <Chip tone={!live ? 'unknown' : projector.state.power === 'on' ? 'ok' : transitioning ? 'busy' : 'idle'}>
                          {live ? POWER_LABEL[projector.state.power] : 'Offline'}
                        </Chip>
                      </td>
                      <td className="text-sm">
                        {input.muted ? (
                          <span className="text-xs text-slate-500" title={input.title}>{input.text}</span>
                        ) : (
                          <InputBadge code={code} label={input.text} />
                        )}
                      </td>
                      <td>
                        <LampMeter
                          label=""
                          hours={peakLampHours(projector)}
                          warn={projector.lamp_warn_hours}
                          critical={projector.lamp_critical_hours}
                          compact
                        />
                      </td>
                      <td className={`tnum whitespace-nowrap text-xs ${projector.state.stale ? 'text-amber-400' : 'text-slate-500'}`}>
                        {relativeTime(projector.state.last_seen_at)}
                        {projector.state.stale && ' · stale'}
                      </td>
                      <td className="pr-3 text-right">
                        <span className="flex items-center justify-end gap-1">
                          {isAdmin && (
                            <>
                              <button className="btn-ghost text-xs" onClick={() => setEditing(projector)}>
                                Edit
                              </button>
                              <button className="btn-ghost text-xs text-red-300" onClick={() => setDeleting(projector)}>
                                Remove
                              </button>
                            </>
                          )}
                          <Link to={`/projectors/${projector.id}`} className="btn-ghost px-2" aria-label="Details">
                            <ChevronIcon size={16} />
                          </Link>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {shown.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-slate-500">No projector matches “{query}”.</p>
            )}
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
