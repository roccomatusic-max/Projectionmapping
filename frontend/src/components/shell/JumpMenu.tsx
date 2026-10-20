/**
 * "Go to": type a few letters of any page, part of a page or projector and
 * press Enter. Opened from the top bar, or with Ctrl+K (⌘K on a Mac).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { classNames } from '@/lib/format'
import { useFleetContext } from '@/live/LiveProvider'
import { ChevronIcon, ProjectorIcon, SearchIcon, type LucideIcon } from '../icons'
import { Modal } from '../ui'
import { NAV, PLACES } from './nav'

interface Entry {
  to: string
  label: string
  where: string
  hint: string
  icon: LucideIcon
  words: string
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

export function JumpMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { projectors } = useFleetContext()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    const id = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(id)
  }, [open])

  const entries = useMemo<Entry[]>(() => {
    const pages = NAV.flatMap((section) =>
      section.items.map((item) => ({
        to: item.to,
        label: item.label,
        where: section.section,
        hint: item.hint,
        icon: item.icon,
        words: `${item.label} ${section.section} ${item.hint} ${item.keywords ?? ''}`,
      })),
    )
    const places = PLACES.map((place) => ({
      to: place.to,
      label: place.label,
      where: place.where,
      hint: place.hint,
      icon: place.icon,
      words: `${place.label} ${place.where} ${place.hint} ${place.keywords ?? ''}`,
    }))
    const devices = projectors.map((p) => ({
      to: `/projectors/${p.id}`,
      label: p.name,
      where: 'Projector',
      hint: [p.model, p.location].filter(Boolean).join(' · '),
      icon: ProjectorIcon,
      words: `${p.name} ${p.model} ${p.location} ${p.host} projector`,
    }))
    return [...pages, ...places, ...devices]
  }, [projectors])

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return entries
    return entries
      .map((entry) => {
        const label = entry.label.toLowerCase()
        const words = entry.words.toLowerCase()
        if (!terms.every((term) => words.includes(term))) return null
        // Names that start with what was typed come first.
        const score = label.startsWith(terms[0]) ? 0 : label.includes(terms[0]) ? 1 : 2
        return { entry, score }
      })
      .filter((hit): hit is { entry: Entry; score: number } => hit != null)
      .sort((a, b) => a.score - b.score)
      .map((hit) => hit.entry)
  }, [entries, query])

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const go = (entry: Entry | undefined) => {
    if (!entry) return
    onClose()
    navigate(entry.to)
  }

  return (
    <Modal open={open} label="Go to" onClose={onClose} size="lg" className="sm:mt-[-20vh]">
      <div className="flex items-center gap-2 border-b border-white/[0.08] px-4">
        <SearchIcon size={16} className="shrink-0 text-slate-500" aria-hidden />
        <input
          ref={inputRef}
          className="w-full bg-transparent py-3.5 text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          placeholder="Where do you want to go? Try “warp”, “GO” or a projector name"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive((i) => Math.min(results.length - 1, i + 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive((i) => Math.max(0, i - 1))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              go(results[active])
            }
          }}
          aria-label="Search pages and projectors"
          aria-controls="jump-results"
        />
      </div>
      <ul id="jump-results" ref={listRef} className="max-h-[60vh] overflow-y-auto p-2" role="listbox">
        {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">Nothing matches “{query}”.</li>}
        {results.map((entry, index) => (
          <li key={`${entry.where}:${entry.to}:${entry.label}`} role="option" aria-selected={index === active}>
            <button
              data-index={index}
              className={classNames(
                'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left',
                index === active ? 'bg-sky-500/15' : 'hover:bg-white/[0.04]',
              )}
              onMouseEnter={() => setActive(index)}
              onClick={() => go(entry)}
            >
              <entry.icon size={16} className="shrink-0 text-slate-400" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-100">
                  {entry.label}
                  <span className="ml-2 text-xs text-slate-500">{entry.where}</span>
                </span>
                {entry.hint && <span className="block truncate text-xs text-slate-400">{entry.hint}</span>}
              </span>
              <ChevronIcon size={14} className="shrink-0 text-slate-600" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <p className="hidden border-t border-white/[0.06] px-4 py-2 text-2xs text-slate-500 sm:block">
        ↑ ↓ to choose · Enter to open · Esc to close · {isMac ? '⌘K' : 'Ctrl+K'} opens this from any page
      </p>
    </Modal>
  )
}
