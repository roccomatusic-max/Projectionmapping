import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, type Session } from '@/api/client'
import type { Group, Projector } from '@/api/types'
import { ConfirmDialog, EmptyState, ErrorBanner, PageHeader, Panel, Spinner, StatusDot } from '@/components/ui'
import { AddIcon, ChevronIcon, DeleteIcon, GroupsIcon, PowerIcon, ShutterIcon } from '@/components/icons'
import { CommandStrip } from '@/components/ProjectorCard'
import { useBulkResults } from '@/components/fleet/BulkResults'
import { powerRequest, shutterRequest, useProjectorCommand, type CommandRequest } from '@/components/fleet/useProjectorCommand'
import { latestCommand, phaseIsActive, useFleetContext, useOps } from '@/live/LiveProvider'
import { useGroups } from '@/live/useCatalog'
import { deviceTone, isLive, isTransitioning } from '@/lib/status'
import { POWER_LABEL, SHUTTER_LABEL } from '@/lib/format'

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
  const { projectors, loading, error } = useFleetContext()
  const { commands, notify } = useOps()
  const { groups, reload, loaded } = useGroups()
  const { ask, dialog } = useProjectorCommand()
  const bulkResults = useBulkResults()
  const [editing, setEditing] = useState<Group | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Group | null>(null)

  const isAdmin = session.role === 'admin'
  const canControl = session.role !== 'viewer'

  const send = (request: CommandRequest) => ask(bulkResults.track(request))

  if (loading || !loaded) return <Spinner />

  return (
    <div className="space-y-4">
      <PageHeader
        icon={GroupsIcon}
        title="Groups"
        subtitle={`${groups.length} group${groups.length === 1 ? '' : 's'} · commands go to every member at once`}
        actions={
          isAdmin && (
            <button className="btn-primary" onClick={() => setEditing('new')}>
              <AddIcon size={15} aria-hidden /> New group
            </button>
          )
        }
      />

      {error && <ErrorBanner message={error} />}

      {bulkResults.panel}

      {groups.length === 0 ? (
        <Panel>
          <EmptyState title="No groups yet" icon={GroupsIcon}>
            Group projectors by installation area so you can power a whole surface on or off in one action.
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map((group) => {
            const members = projectors.filter((p) => group.projector_ids.includes(p.id))
            const responding = members.filter(isLive).length
            const busy = members.some((p) => {
              const c = latestCommand(commands, p.id)
              return c !== undefined && phaseIsActive(c.phase)
            })
            const blocked = !canControl
              ? 'Your role is view-only'
              : members.length === 0
                ? 'This group has no projectors'
                : busy
                  ? 'A command is still in progress in this group'
                  : undefined
            return (
              <Panel
                key={group.id}
                title={
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: group.color }} aria-hidden />
                    {group.name}
                  </span>
                }
                description={
                  <>
                    {group.description && `${group.description} · `}
                    <span className="tnum">{responding}</span> of <span className="tnum">{members.length}</span> responding
                  </>
                }
                action={
                  isAdmin && (
                    <span className="flex gap-1">
                      <button className="btn-ghost btn-sm" onClick={() => setEditing(group)}>
                        Edit
                      </button>
                      <button className="btn-ghost btn-sm text-red-300" onClick={() => setDeleting(group)}>
                        <DeleteIcon size={13} aria-hidden /> Delete
                      </button>
                    </span>
                  )
                }
              >
                <div className="space-y-3">
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {members.map((member) => {
                      const live = isLive(member)
                      return (
                        <li key={member.id}>
                          <Link
                            to={`/projectors/${member.id}`}
                            className="inset flex items-center gap-2.5 px-3 py-2 hover:bg-panel-800"
                          >
                            <StatusDot tone={deviceTone(member)} pulse={isTransitioning(member)} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-slate-100">{member.name}</span>
                              <span className="block truncate text-2xs text-slate-500">
                                {live
                                  ? `${POWER_LABEL[member.state.power]} · shutter ${SHUTTER_LABEL[member.state.shutter].toLowerCase()}`
                                  : 'Not responding'}
                              </span>
                            </span>
                            <ChevronIcon size={14} className="shrink-0 text-slate-600" aria-hidden />
                          </Link>
                          <CommandStrip command={latestCommand(commands, member.id)} className="mt-1 px-1" />
                        </li>
                      )
                    })}
                    {members.length === 0 && <li className="text-xs text-slate-500">No members</li>}
                  </ul>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className="btn-default"
                      disabled={Boolean(blocked)}
                      title={blocked}
                      onClick={() => send(groupLabel(powerRequest(members, 'on'), group))}
                    >
                      <PowerIcon size={15} aria-hidden /> Power on
                    </button>
                    <button
                      className="btn-danger-outline"
                      disabled={Boolean(blocked)}
                      title={blocked}
                      onClick={() => send(groupLabel(powerRequest(members, 'off'), group))}
                    >
                      <PowerIcon size={15} aria-hidden /> Power off
                    </button>
                    <button
                      className="btn-default"
                      disabled={Boolean(blocked)}
                      title={blocked}
                      onClick={() => send(groupLabel(shutterRequest(members, 'open'), group))}
                    >
                      <ShutterIcon size={15} aria-hidden /> Open shutters
                    </button>
                    <button
                      className="btn-default"
                      disabled={Boolean(blocked)}
                      title={blocked}
                      onClick={() => send(groupLabel(shutterRequest(members, 'closed'), group))}
                    >
                      <ShutterIcon size={15} aria-hidden /> Close shutters
                    </button>
                  </div>
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
            notify('ok', message)
            reload()
          }}
          onError={(message) => notify('fault', 'Save failed', message)}
        />
      )}

      {dialog}

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
            notify('ok', `${target.name} deleted`)
            reload()
          } catch (err) {
            notify('fault', 'Delete failed', err instanceof ApiError ? err.message : undefined)
          }
        }}
      />
    </div>
  )
}

/** Names the group in the confirmation, so the operator knows which surface. */
function groupLabel(request: CommandRequest, group: Group): CommandRequest {
  return { ...request, title: `${request.spec.label}: ${group.name} (${request.projectors.length})?` }
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
