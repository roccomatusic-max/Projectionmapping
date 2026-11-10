/**
 * Several pages under one menu entry, as tabs.
 *
 * The group's name and tabs stay put while a tab loads; each page's own
 * PageHeader then shows only its line of status and its buttons, under the
 * tabs (see PageHeader in ../ui).
 */

import { createContext, useContext, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { classNames } from '@/lib/format'
import { PAGE_GROUPS, type PageGroupDef, type PageGroupId } from './nav'

const PageGroupContext = createContext<PageGroupDef | null>(null)

/** The group a page is shown in, if any. */
export function usePageGroup(): PageGroupDef | null {
  return useContext(PageGroupContext)
}

export function PageGroup({ id, children }: { id: PageGroupId; children: ReactNode }) {
  const group = PAGE_GROUPS[id]
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <group.icon size={18} strokeWidth={1.75} className="shrink-0 text-slate-500" aria-hidden />
          <h1 className="text-lg font-semibold leading-tight tracking-tight text-slate-50">{group.title}</h1>
        </div>
        <nav aria-label={`${group.title} sections`} className="flex gap-1 overflow-x-auto rounded-lg bg-panel-900 p-1 ring-1 ring-white/[0.06]">
          {group.tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end
              title={tab.hint}
              className={({ isActive }) =>
                classNames(
                  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-sky-500/15 font-medium text-sky-100 ring-1 ring-inset ring-sky-400/40'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <PageGroupContext.Provider value={group}>{children}</PageGroupContext.Provider>
    </div>
  )
}
