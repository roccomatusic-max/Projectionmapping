import { type ReactNode, useEffect, useRef, useState } from 'react'
import { classNames } from '@/lib/format'
import type { LucideIcon } from './icons'

type Tone = 'ok' | 'warn' | 'fault' | 'idle' | 'busy' | 'unknown'

const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-status-ok',
  warn: 'bg-status-warn',
  fault: 'bg-status-fault',
  idle: 'bg-status-idle',
  busy: 'bg-status-busy',
  unknown: 'bg-status-unknown',
}

const TONE_CHIP: Record<Tone, string> = {
  ok: 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/25',
  warn: 'bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/25',
  fault: 'bg-red-500/10 text-red-300 ring-1 ring-red-500/25',
  idle: 'bg-slate-500/10 text-slate-400 ring-1 ring-slate-500/20',
  busy: 'bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/25',
  unknown: 'bg-slate-500/10 text-slate-400 ring-1 ring-slate-500/20',
}

export function StatusDot({ tone, pulse = false }: { tone: Tone; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
      {pulse && (
        <span
          className={classNames(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
            TONE_DOT[tone],
          )}
        />
      )}
      <span className={classNames('relative inline-flex h-2.5 w-2.5 rounded-full', TONE_DOT[tone])} />
    </span>
  )
}

export function Chip({
  tone = 'idle',
  children,
  title,
}: {
  tone?: Tone
  children: ReactNode
  title?: string
}) {
  return (
    <span className={classNames('chip', TONE_CHIP[tone])} title={title}>
      {children}
    </span>
  )
}

/** A value that may be missing. Renders em dash / n-a with the reason in a
 *  tooltip — never a stand-in number. */
export function Value({
  text,
  muted,
  title,
  className,
}: {
  text: string
  muted?: boolean
  title?: string
  className?: string
}) {
  return (
    <span
      className={classNames(
        'tnum',
        muted ? 'text-slate-500 cursor-help' : 'text-slate-100',
        className,
      )}
      title={title}
    >
      {text}
    </span>
  )
}

export function Panel({
  title,
  action,
  children,
  className,
  description,
  icon: Icon,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  description?: ReactNode
  icon?: LucideIcon
}) {
  return (
    <section className={classNames('panel', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-white/5 px-4 py-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon && (
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-panel-800 text-slate-400" aria-hidden>
                <Icon size={14} strokeWidth={1.75} />
              </span>
            )}
            <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-slate-100">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-xs text-slate-400">{description}</p>
            )}
            </div>
          </div>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Stat({
  label,
  value,
  tone = 'idle',
  hint,
}: {
  label: string
  value: ReactNode
  tone?: Tone
  hint?: string
}) {
  return (
    <div className="panel px-4 py-3" title={hint}>
      <div className="flex items-center gap-2">
        <StatusDot tone={tone} />
        <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold tnum text-slate-100">{value}</div>
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-sky-400" />
      {label ?? 'Loading…'}
    </div>
  )
}

export function EmptyState({
  title,
  children,
  action,
  icon: Icon,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
  icon?: LucideIcon
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {Icon && (
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-panel-800 text-slate-500" aria-hidden>
          <Icon size={24} strokeWidth={1.5} />
        </span>
      )}
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {children && <p className="max-w-md text-sm text-slate-500">{children}</p>}
      {action}
    </div>
  )
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
    >
      <span>{message}</span>
      {onDismiss && (
        <button className="text-red-300 hover:text-red-100" onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  )
}

/**
 * Confirmation dialog for disruptive commands.
 *
 * Mirrors the backend's 428 gate: the API refuses an unconfirmed disruptive
 * command regardless, so this is the usable half of that contract, not the
 * enforcement.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    confirmRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
    >
      <div
        className="panel w-full max-w-md p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-100">{title}</h3>
        <div className="mt-2 text-sm text-slate-300">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-default" onClick={onCancel}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export interface Toast {
  id: number
  tone: Tone
  title: string
  detail?: string
}

let toastId = 0

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = (tone: Tone, title: string, detail?: string) => {
    const toast = { id: ++toastId, tone, title, detail }
    setToasts((current) => [...current, toast])
    // Failures stay longer: the operator needs time to read them.
    const ttl = tone === 'fault' ? 12000 : 6000
    window.setTimeout(
      () => setToasts((current) => current.filter((t) => t.id !== toast.id)),
      ttl,
    )
  }

  const dismiss = (id: number) =>
    setToasts((current) => current.filter((toast) => toast.id !== id))

  return { toasts, push, dismiss }
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: number) => void
}) {
  return (
    <div
      className="pointer-events-none fixed right-4 top-16 z-50 flex w-full max-w-sm flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="panel pointer-events-auto flex items-start gap-3 px-3 py-2.5"
        >
          <span className="mt-1">
            <StatusDot tone={toast.tone} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-100">{toast.title}</p>
            {toast.detail && (
              <p className="mt-0.5 break-words text-xs text-slate-400">{toast.detail}</p>
            )}
          </div>
          <button
            className="text-slate-500 hover:text-slate-300"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

/** Explains why a control is unavailable instead of hiding it silently. */
export function UnavailableNote({ reason }: { reason: string }) {
  return (
    <p className="rounded-md border border-white/5 bg-panel-850 px-3 py-2 text-xs text-slate-400">
      {reason}
    </p>
  )
}
