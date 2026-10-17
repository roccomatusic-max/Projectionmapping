/**
 * Every operator command goes through here: build the confirmation, show
 * exactly which projector(s) will receive it, then dispatch and track it.
 *
 * Power, shutter and input changes always ask first (the backend requires
 * the acknowledgement too). Fire-and-forget keys such as remote-control
 * navigation can opt out with `confirm: false`.
 */

import { useCallback, useState, type ReactNode } from 'react'
import type { Projector } from '@/api/types'
import { useOps, type CommandSpec } from '@/live/LiveProvider'
import { ConfirmDialog } from '@/components/ui'
import { isLive } from '@/lib/status'
import { POWER_LABEL } from '@/lib/format'

export interface CommandRequest {
  projectors: Projector[]
  spec: CommandSpec
  title: string
  body: ReactNode
  confirmLabel?: string
  danger?: boolean
  confirm?: boolean
  onDone?: () => void
}

export function powerRequest(projectors: Projector[], state: 'on' | 'off'): CommandRequest {
  const many = projectors.length > 1
  return {
    projectors,
    spec: { capability: 'power.set', params: { state }, label: state === 'on' ? 'Power on' : 'Power off' },
    title: many
      ? `Power ${state} ${projectors.length} projectors?`
      : `Power ${state} ${projectors[0]?.name}?`,
    confirmLabel: state === 'on' ? 'Power on' : 'Power off',
    danger: state === 'off',
    body:
      state === 'off' ? (
        <>
          <p>
            {many ? 'Each projector' : 'The projector'} stops projecting and enters its cooling cycle. It
            cannot be powered back on until cooling finishes, which takes about a minute.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            The result is confirmed by reading the power state back. A command that times out is not retried.
          </p>
        </>
      ) : (
        <>
          <p>
            {many ? 'Each lamp strikes and warms up at its own pace' : 'The lamp strikes and warms up'}; this takes
            tens of seconds and cannot be interrupted part-way.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            The result is confirmed by reading the power state back. A command that times out is not retried.
          </p>
        </>
      ),
  }
}

export function shutterRequest(projectors: Projector[], state: 'open' | 'closed'): CommandRequest {
  const many = projectors.length > 1
  return {
    projectors,
    spec: { capability: 'shutter.set', params: { state }, label: state === 'open' ? 'Open shutter' : 'Close shutter' },
    title: many
      ? `${state === 'open' ? 'Open' : 'Close'} shutters on ${projectors.length} projectors?`
      : `${state === 'open' ? 'Open' : 'Close'} the shutter on ${projectors[0]?.name}?`,
    confirmLabel: state === 'open' ? 'Open shutter' : 'Close shutter',
    danger: state === 'closed',
    body:
      state === 'closed'
        ? <p>The image will be blanked. Lamps stay on.</p>
        : <p>The image will be shown.</p>,
  }
}

export function inputRequest(projectors: Projector[], code: string, label: string): CommandRequest {
  const many = projectors.length > 1
  return {
    projectors,
    spec: { capability: 'input.set', params: { input: code }, label: `Input ${label}` },
    title: many ? `Switch ${projectors.length} projectors to ${label}?` : `Switch ${projectors[0]?.name} to ${label}?`,
    confirmLabel: `Switch to ${label}`,
    body: (
      <p>
        The image may blank briefly while {many ? 'each projector re-syncs' : 'the projector re-syncs'}.
        {many && ' A projector without that input fitted will report it as unavailable.'}
      </p>
    ),
  }
}

function TargetSummary({ projectors }: { projectors: Projector[] }) {
  if (projectors.length === 1) {
    const projector = projectors[0]
    const live = isLive(projector)
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-100">{projector.name}</p>
          <p className="truncate text-xs text-slate-500">
            {projector.model || projector.manufacturer} · <span className="tnum">{projector.host}:{projector.port}</span>
            {projector.location && ` · ${projector.location}`}
          </p>
        </div>
        <span className="shrink-0 text-xs text-slate-400">
          {live ? `Now: ${POWER_LABEL[projector.state.power]}` : 'Offline'}
        </span>
      </div>
    )
  }
  const offline = projectors.filter((p) => !isLive(p)).length
  return (
    <div>
      <p className="font-medium text-slate-100">
        {projectors.length} projectors
        {offline > 0 && <span className="ml-2 text-xs font-normal text-yellow-300">{offline} not responding</span>}
      </p>
      <ul className="mt-1.5 max-h-36 space-y-0.5 overflow-y-auto text-xs text-slate-400">
        {projectors.map((projector) => (
          <li key={projector.id} className="flex justify-between gap-3">
            <span className="truncate">{projector.name}</span>
            <span className="tnum shrink-0 text-slate-500">{projector.host}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function useProjectorCommand() {
  const { run, runBulk } = useOps()
  const [pending, setPending] = useState<CommandRequest | null>(null)

  const dispatch = useCallback(
    async (request: CommandRequest) => {
      if (request.projectors.length === 1) await run(request.projectors[0], request.spec)
      else await runBulk(request.projectors, request.spec)
      request.onDone?.()
    },
    [run, runBulk],
  )

  const ask = useCallback(
    (request: CommandRequest) => {
      if (request.projectors.length === 0) return
      if (request.confirm === false) void dispatch(request)
      else setPending(request)
    },
    [dispatch],
  )

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      title={pending?.title ?? ''}
      body={pending?.body}
      target={pending ? <TargetSummary projectors={pending.projectors} /> : undefined}
      confirmLabel={pending?.confirmLabel}
      danger={pending?.danger}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const request = pending
        setPending(null)
        if (request) void dispatch(request)
      }}
    />
  )

  return { ask, dialog }
}
