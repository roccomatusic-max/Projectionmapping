import { type FormEvent, useEffect, useState } from 'react'
import { ApiError, api, type Session } from '@/api/client'
import type { Group, GroupCommandResult, Projector } from '@/api/types'
import {
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Panel,
  Spinner,
  StatusDot,
  ToastStack,
  useToasts,
} from '@/components/ui'
import { connectionTone } from '@/components/ProjectorCard'
import { OUTCOME_LABEL, POWER_LABEL, SHUTTER_LABEL, formatClock, outcomeTone } from '@/lib/format'
import { AddIcon, DeleteIcon, GroupsIcon, PowerIcon, ShutterIcon } from '@/components/icons'

/** Suggested names from the brief — offered as shortcuts, not imposed. */
const SUGGESTED = [
  'House Projection Mapping',
  'Front of House',
  'Left Side Projection',
  'Right Side Projection',
  'Testing Projectors',
  'All Outdoor Projectors',
]

export default function Groups({ session }: { session: Session }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [projectors, setProjectors] = useState<Projector[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Group | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Group | null>(null)
  const [results, setResults] = useState<Record<number, GroupCommandResult>>({})
  const [pending, setPending] = useState<{
    group: Group
    capability: string
    params: Record<string, unknown>
    label: string
    danger: boolean
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const { toasts, push, dismiss } = useToasts()

  const isAdmin = session.role === 'admin'
  const canControl = session.role !== 'viewer'

  const load = async () => {
    try {
      const [g, p] = await Promise.all([api.listGroups(), api.listProjectors()])
      setGroups(g)
      setProjectors(p)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const runGroupCommand = async (
    group: Group,
    capability: string,
    params: Record<string, unknown>,
    label: string,
  ) => {
    setBusy(true)
    try {
      const result = await api.groupCommand(group.id, capability, params)
      setResults((current) => ({ ...current, [group.id]: result }))
      push(
        result.summary.failed === 0 ? 'ok' : 'warn',
        `${group.name} — ${label}: ${result.summary.succeeded}/${result.summary.total}`,
      )
    } catch (err) {
      push('fault', `${label} failed`, err instanceof ApiError ? err.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-5">
      <PageHeader
        icon={GroupsIcon}
        title="Groups"
        subtitle={`${groups.length} group(s) · commands go to every member at once`}
        actions={
          isAdmin && (
            <button className="btn-primary" onClick={() => setEditing('new')}>
              <AddIcon size={15} aria-hidden /> New group
            </button>
          )
        }
      />

      {error && <ErrorBanner message={error} />}

      {groups.length === 0 ? (
        <Panel>
          <EmptyState title="No groups yet" icon={GroupsIcon}>
            Group projectors by installation area so you can power a whole surface on
            or off in one action.
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((group) => {
            const members = projectors.filter((p) => group.projector_ids.includes(p.id))
            const result = results[group.id]
            return (
              <Panel
                key={group.id}
                title={
                  <span className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-sm"
                      style={{ backgroundColor: group.color }}
                    />
                    {group.name}
                  </span>
                }
                description={group.description || `${members.length} projector(s)`}
                action={
                  isAdmin && (
                    <span className="flex gap-1">
                      <button
                        className="btn-ghost text-xs"
                        onClick={() => setEditing(group)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-ghost text-xs text-red-300"
                        onClick={() => setDeleting(group)}
                      >
                        <DeleteIcon size={13} aria-hidden /> Delete
                      </button>
                    </span>
                  )
                }
              >
                <div className="space-y-3">
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {members.map((member) => {
                      const live = member.state.online && !member.state.stale
                      return (
                        <li key={member.id} className="flex items-center gap-2.5 rounded-lg bg-panel-850 px-3 py-2">
                          <StatusDot
                            tone={connectionTone(member)}
                            pulse={member.state.power === 'warming' || member.state.power === 'cooling'}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-slate-100">{member.name}</span>
                            <span className="block truncate text-[11px] text-slate-500">
                              {live
                                ? `${POWER_LABEL[member.state.power]} · shutter ${SHUTTER_LABEL[member.state.shutter].toLowerCase()}`
                                : 'Offline'}
                            </span>
                          </span>
                        </li>
                      )
                    })}
                    {members.length === 0 && (
                      <li className="text-xs text-slate-500">No members</li>
                    )}
                  </ul>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className="btn-default"
                      disabled={!canControl || busy || members.length === 0}
                      onClick={() =>
                        setPending({
                          group,
                          capability: 'power.set',
                          params: { state: 'on' },
                          label: 'Power on',
                          danger: false,
                        })
                      }
                    >
                      <PowerIcon size={15} aria-hidden /> Power on
                    </button>
                    <button
                      className="btn-default"
                      disabled={!canControl || busy || members.length === 0}
                      onClick={() =>
                        setPending({
                          group,
                          capability: 'power.set',
                          params: { state: 'off' },
                          label: 'Power off',
                          danger: true,
                        })
                      }
                    >
                      <PowerIcon size={15} aria-hidden /> Power off
                    </button>
                    <button
                      className="btn-default"
                      disabled={!canControl || busy || members.length === 0}
                      onClick={() =>
                        setPending({
                          group,
                          capability: 'shutter.set',
                          params: { state: 'open' },
                          label: 'Open shutters',
                          danger: false,
                        })
                      }
                    >
                      <ShutterIcon size={15} aria-hidden /> Open shutters
                    </button>
                    <button
                      className="btn-default"
                      disabled={!canControl || busy || members.length === 0}
                      onClick={() =>
                        setPending({
                          group,
                          capability: 'shutter.set',
                          params: { state: 'closed' },
                          label: 'Close shutters',
                          danger: true,
                        })
                      }
                    >
                      <ShutterIcon size={15} aria-hidden /> Close shutters
                    </button>
                  </div>

                  {result && (
                    <div className="rounded-md bg-panel-850 p-3">
                      <p className="mb-2 text-xs text-slate-500">
                        {result.capability} · dispatched{' '}
                        {formatClock(result.dispatched_at)}
                      </p>
                      <ul className="space-y-1">
                        {result.results.map((item) => (
                          <li
                            key={item.projector_id ?? item.name}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="truncate text-slate-300">{item.name}</span>
                            <Chip
                              tone={outcomeTone(item.outcome)}
                              title={item.error ?? undefined}
                            >
                              {OUTCOME_LABEL[item.outcome]}
                            </Chip>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Panel>
            )
          })}
        </div>
      )}

      {editing && (
        <GroupForm
          group={editing === 'new' ? null : editing}
          projectors={projectors}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null)
            push('ok', message)
            void load()
          }}
          onError={(message) => push('fault', 'Save failed', message)}
        />
      )}

      <ConfirmDialog
        open={pending !== null}
        title={`${pending?.label} — ${pending?.group.name}?`}
        body={
          <>
            <p>
              {pending?.capability === 'power.set'
                ? pending.params.state === 'on'
                  ? 'Every projector in the group will strike its lamp and warm up.'
                  : 'Every projector in the group enters its cooling cycle and cannot restart until cooling completes.'
                : pending?.params.state === 'closed'
                  ? 'Images on every projector in the group will be blanked. Lamps stay on.'
                  : 'Images will be shown on every projector in the group.'}
            </p>
            <ul className="mt-2 text-xs text-slate-400">
              {projectors
                .filter((p) => pending?.group.projector_ids.includes(p.id))
                .map((p) => (
                  <li key={p.id}>• {p.name}</li>
                ))}
            </ul>
          </>
        }
        confirmLabel={pending?.label}
        danger={pending?.danger}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const action = pending
          setPending(null)
          if (action)
            void runGroupCommand(action.group, action.capability, action.params, action.label)
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete group ${deleting?.name}?`}
        body="The group is removed. The projectors in it are not affected."
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          const target = deleting
          setDeleting(null)
          if (!target) return
          try {
            await api.deleteGroup(target.id)
            push('ok', `${target.name} deleted`)
            void load()
          } catch (err) {
            push('fault', 'Delete failed', err instanceof ApiError ? err.message : undefined)
          }
        }}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}

function GroupForm({
  group,
  projectors,
  onClose,
  onSaved,
  onError,
}: {
  group: Group | null
  projectors: Projector[]
  onClose: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [description, setDescription] = useState(group?.description ?? '')
  const [color, setColor] = useState(group?.color ?? '#38bdf8')
  const [members, setMembers] = useState<number[]>(group?.projector_ids ?? [])
  const [busy, setBusy] = useState(false)

  const toggle = (id: number) =>
    setMembers((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      const body = { name, description, color, projector_ids: members }
      if (group) {
        await api.updateGroup(group.id, body)
        onSaved(`${name} updated`)
      } else {
        await api.createGroup(body)
        onSaved(`${name} created`)
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
        className="panel my-8 w-full max-w-lg p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-100">
          {group ? `Edit ${group.name}` : 'New group'}
        </h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            {!group && (
              <div className="mt-2 flex flex-wrap gap-1">
                {SUGGESTED.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="chip bg-panel-800 text-slate-400 hover:text-slate-200"
                    onClick={() => setName(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="label">Description</label>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Colour</label>
            <input
              className="h-9 w-20 rounded border border-white/10 bg-panel-850"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Members</label>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-white/5 p-2">
              {projectors.length === 0 && (
                <p className="text-xs text-slate-500">No projectors registered.</p>
              )}
              {projectors.map((projector) => (
                <label
                  key={projector.id}
                  className="flex items-center gap-2 rounded px-2 py-1 text-sm text-slate-300 hover:bg-panel-850"
                >
                  <input
                    type="checkbox"
                    checked={members.includes(projector.id)}
                    onChange={() => toggle(projector.id)}
                  />
                  {projector.name}
                  <span className="text-xs text-slate-500">{projector.host}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-default" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
