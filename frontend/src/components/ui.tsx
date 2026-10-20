import { type ReactNode, useEffect, useRef, useState } from 'react'
import { classNames } from '@/lib/format'
import { CloseIcon, FaultIcon, HelpIcon, InfoIcon, OkIcon, SearchIcon, WarningIcon, type LucideIcon } from './icons'
import { TONE_BANNER, TONE_CHIP, TONE_DOT, TONE_TEXT, type Tone } from './tone'

export type { Tone }

export function StatusDot({ tone, pulse = false, className }: { tone: Tone; pulse?: boolean; className?: string }) {
  return (
    <span
      className={classNames(
        'inline-flex h-2 w-2 shrink-0 rounded-full transition-colors duration-300',
        TONE_DOT[tone],
        pulse && 'animate-breathe',
        className,
      )}
      aria-hidden
    />
  )
}

export function Chip({
  tone = 'idle',
  children,
  title,
  className,
}: {
  tone?: Tone
  children: ReactNode
  title?: string
  className?: string
}) {
  return (
    <span className={classNames('chip transition-colors duration-300', TONE_CHIP[tone], className)} title={title}>
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
      className={classNames('tnum', muted ? 'cursor-help text-slate-500' : 'text-slate-100', className)}
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
  bodyClassName,
  description,
  icon: Icon,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  description?: ReactNode
  icon?: LucideIcon
}) {
  return (
    <section className={classNames('panel', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-white/[0.06] px-4 py-2.5">
          <div className="flex min-w-[min(14rem,100%)] flex-1 items-start gap-2">
            {Icon && <Icon size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />}
            <div className="min-w-0">
              {title && <h2 className="text-sm font-semibold text-slate-100">{title}</h2>}
              {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
            </div>
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={bodyClassName ?? 'p-4'}>{children}</div>
    </section>
  )
}

/**
 * Page header: title, one-line context and the page's primary actions.
 * Every page uses it so titles, spacing and action placement line up.
 */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  children,
}: {
  icon?: LucideIcon
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && <Icon size={18} strokeWidth={1.75} className="shrink-0 text-slate-500" aria-hidden />}
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-tight tracking-tight text-slate-50">{title}</h1>
          {subtitle && <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      {children}
    </div>
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
        <span className="eyebrow">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold tnum text-slate-100">{value}</div>
    </div>
  )
}

export function Spinner({ label, size = 'md' }: { label?: string | null; size?: 'sm' | 'md' }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-400" role="status">
      <span
        className={classNames(
          'animate-spin rounded-full border-2 border-slate-600 border-t-sky-400',
          size === 'sm' ? 'h-3 w-3 border-[1.5px]' : 'h-4 w-4',
        )}
        aria-hidden
      />
      {label === null ? <span className="sr-only">Loading</span> : (label ?? 'Loading…')}
    </span>
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
    <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-10 text-center">
      {Icon && <Icon size={22} strokeWidth={1.5} className="text-slate-600" aria-hidden />}
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {children && <p className="max-w-md text-sm text-slate-500">{children}</p>}
      {action}
    </div>
  )
}

const BANNER_ICON: Record<Tone, LucideIcon> = {
  ok: OkIcon,
  warn: WarningIcon,
  fault: FaultIcon,
  idle: InfoIcon,
  busy: InfoIcon,
  unknown: InfoIcon,
}

/** A full-width notice inside a page. Faults use role=alert so a screen
 *  reader announces them; everything else is polite. */
export function Banner({
  tone,
  title,
  children,
  action,
  onDismiss,
  icon,
  className,
}: {
  tone: Tone
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  onDismiss?: () => void
  icon?: LucideIcon
  className?: string
}) {
  const Icon = icon ?? BANNER_ICON[tone]
  return (
    <div
      role={tone === 'fault' ? 'alert' : 'status'}
      className={classNames('flex items-start gap-2.5 rounded-md border px-3 py-2 text-sm', TONE_BANNER[tone], className)}
    >
      <Icon size={16} className={classNames('mt-0.5 shrink-0', TONE_TEXT[tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={classNames('break-words', title ? 'mt-0.5 text-xs opacity-80' : undefined)}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
      {onDismiss && (
        <button className="shrink-0 opacity-70 hover:opacity-100" onClick={onDismiss} aria-label="Dismiss">
          <CloseIcon size={15} />
        </button>
      )}
    </div>
  )
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return <Banner tone="fault" onDismiss={onDismiss}>{message}</Banner>
}

/** Modal frame: backdrop, Escape to close, focus kept inside. */
export function Modal({
  open,
  label,
  onClose,
  children,
  className,
  size = 'md',
}: {
  open: boolean
  label: string
  onClose: () => void
  children: ReactNode
  className?: string
  size?: 'md' | 'lg'
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  // Parents re-render on every fleet update; keep the latest handler without
  // re-running the effect (which would bounce focus out of the dialog).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
      } else if (event.key === 'Tab' && frameRef.current) {
        const focusable = frameRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previouslyFocused?.focus?.()
    }
  }, [open])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 animate-fade-in sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
    >
      <div
        ref={frameRef}
        className={classNames(
          'max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-white/10 bg-panel-900 shadow-overlay animate-slide-up sm:rounded-xl',
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md',
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Confirmation dialog for disruptive commands.
 *
 * Mirrors the backend's 428 gate: the API refuses an unconfirmed disruptive
 * command regardless, so this is the usable half of that contract, not the
 * enforcement. It names the exact target, and for destructive actions the
 * initial focus sits on Cancel so a stray Enter does nothing.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  target,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body: ReactNode
  /** Which projector(s) will receive the command. */
  target?: ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [fired, setFired] = useState(false)

  useEffect(() => {
    if (!open) return
    setFired(false)
    const id = window.requestAnimationFrame(() => (danger ? cancelRef : confirmRef).current?.focus())
    return () => window.cancelAnimationFrame(id)
  }, [open, danger])

  return (
    <Modal open={open} label={title} onClose={onCancel}>
      <div className="p-5">
        <div className="flex items-start gap-3">
          {danger && (
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-400" aria-hidden>
              <WarningIcon size={16} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-slate-50">{title}</h3>
            {target && <div className="mt-3 rounded-md border border-white/10 bg-panel-850 px-3 py-2 text-sm">{target}</div>}
            <div className="mt-3 text-sm text-slate-300">{body}</div>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} className="btn-default" onClick={onCancel}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            className={danger ? 'btn-danger' : 'btn-primary'}
            disabled={fired}
            onClick={() => {
              // One press, one command: the dialog closes on confirm, but a
              // double-click must not slip a second dispatch through first.
              if (fired) return
              setFired(true)
              onConfirm()
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export interface Toast {
  id: number
  tone: Tone
  title: string
  detail?: string
}

let toastId = 0

/** Page-local toasts, for pages that report their own (non-device) results. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = (tone: Tone, title: string, detail?: string) => {
    const toast = { id: ++toastId, tone, title, detail }
    setToasts((current) => [...current, toast])
    // Failures stay longer: the operator needs time to read them.
    const ttl = tone === 'fault' ? 12000 : 6000
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== toast.id)), ttl)
  }

  const dismiss = (id: number) => setToasts((current) => current.filter((toast) => toast.id !== id))

  return { toasts, push, dismiss }
}

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-3 bottom-20 z-[70] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:w-full sm:max-w-sm lg:bottom-4"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex w-full items-start gap-2.5 rounded-lg border border-white/10 bg-panel-850 px-3 py-2.5 shadow-overlay animate-slide-up"
        >
          <StatusDot tone={toast.tone} className="mt-1.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-100">{toast.title}</p>
            {toast.detail && <p className="mt-0.5 break-words text-xs text-slate-400">{toast.detail}</p>}
          </div>
          <button className="text-slate-500 hover:text-slate-300" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
            <CloseIcon size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

/** Explains why a control is unavailable instead of hiding it silently. */
export function UnavailableNote({ reason, className }: { reason: string; className?: string }) {
  return (
    <p className={classNames('flex items-start gap-2 rounded-md border border-white/[0.06] bg-panel-850 px-3 py-2 text-xs text-slate-400', className)}>
      <InfoIcon size={13} className="mt-px shrink-0 text-slate-500" aria-hidden />
      <span>{reason}</span>
    </p>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
}) {
  return (
    <label className={classNames('relative block', className)}>
      <SearchIcon size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden />
      <input
        className="input pl-8"
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

/** Tab strip. The panel content is rendered by the caller. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ id: T; label: ReactNode; icon?: LucideIcon; badge?: ReactNode }>
  value: T
  onChange: (id: T) => void
  className?: string
}) {
  return (
    <div role="tablist" className={classNames('flex overflow-x-auto border-b border-white/[0.06]', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          className={classNames('tab', value === tab.id && 'tab-active')}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon && <tab.icon size={14} aria-hidden />}
          {tab.label}
          {tab.badge}
        </button>
      ))}
    </div>
  )
}

/**
 * A small (?) next to a control that says what it does. Hover or focus
 * shows it on a desk; a tap shows it on a phone or tablet, where there is
 * no hover. Tapping anywhere else closes it.
 */
export function InfoTip({
  children,
  label = 'What is this?',
  text,
  className,
}: {
  children: ReactNode
  label?: string
  /** Words beside the (?) for a tip that should be noticed, like "What these do". */
  text?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <span ref={ref} className={classNames('group relative inline-flex align-middle', className)}>
      <button
        type="button"
        className={classNames(
          'inline-flex items-center justify-center gap-1 rounded-full text-slate-500 hover:text-slate-300 focus-visible:text-slate-200',
          text ? 'px-1 text-xs' : 'h-4 w-4',
        )}
        aria-label={label}
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <HelpIcon size={13} aria-hidden />
        {text}
      </button>
      <span
        role="tooltip"
        className={classNames(
          'pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border border-white/10 bg-panel-800 px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-200 shadow-overlay',
          open ? 'block' : 'hidden group-hover:block group-focus-within:block',
        )}
      >
        {children}
      </span>
    </span>
  )
}

/**
 * A row of section buttons inside a page: big enough to tap, says where you
 * are, and keeps long pages short by showing one part at a time.
 */
export function SectionBar<T extends string>({
  sections,
  value,
  onChange,
  className,
  label,
}: {
  sections: Array<{ id: T; label: ReactNode; hint?: string; badge?: ReactNode }>
  value: T
  onChange: (id: T) => void
  className?: string
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className={classNames('flex gap-1 overflow-x-auto rounded-lg bg-panel-900 p-1 ring-1 ring-white/[0.06]', className)}>
      {sections.map((section) => (
        <button
          key={section.id}
          role="tab"
          aria-selected={value === section.id}
          title={section.hint}
          onClick={() => onChange(section.id)}
          className={classNames(
            'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors',
            value === section.id ? 'bg-sky-500/15 font-medium text-sky-100 ring-1 ring-inset ring-sky-400/40' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
          )}
        >
          {section.label}
          {section.badge}
        </button>
      ))}
    </div>
  )
}
