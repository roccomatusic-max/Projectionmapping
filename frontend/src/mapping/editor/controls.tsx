import type { ReactNode } from 'react'
import { classNames } from '@/lib/format'

/** A labelled slider with its value typed beside it. */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  disabled,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (value: number) => string
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="tnum text-slate-200">{format ? format(value) : value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        className="mt-1 w-full accent-sky-500"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

export function NumberField({
  label,
  value,
  step = 1,
  min,
  max,
  disabled,
  suffix,
  onChange,
}: {
  label: string
  value: number
  step?: number
  min?: number
  max?: number
  disabled?: boolean
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="relative block">
        <input
          type="number"
          className="input tnum pr-8"
          value={Number.isFinite(value) ? Number(value.toFixed(3)) : ''}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (event.target.value !== '' && Number.isFinite(next)) onChange(next)
          }}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
            {suffix}
          </span>
        )}
      </span>
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T
  options: Array<{ value: T; label: ReactNode; title?: string }>
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-md bg-panel-850 p-0.5 ring-1 ring-white/5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={classNames(
            'rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40',
            option.value === value ? 'bg-panel-700 text-slate-100' : 'text-slate-400 hover:text-slate-200',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  label,
  disabled,
  onChange,
}: {
  checked: boolean
  label: ReactNode
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-300">
      <input
        type="checkbox"
        className="h-4 w-4 accent-sky-500"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}

export function formatBytes(bytes: number) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} kB`
  return `${bytes} B`
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
