/**
 * Application chrome: navigation, the system status bar, the critical-fault
 * banner, command activity and notifications.
 *
 * The status bar and banner sit on every page, so a fault or a dropped link
 * is visible wherever the operator happens to be.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import type { Session } from '@/api/client'
import { classNames, relativeTime } from '@/lib/format'
import { isLive } from '@/lib/status'
import { phaseIsActive, useFleetContext, useOps } from '@/live/LiveProvider'
import { useTicker } from '@/hooks/useLiveData'
import { Banner, StatusDot, ToastStack } from '../ui'
import {
  AlertsIcon,
  AutomationIcon,
  CloseIcon,
  ControlIcon,
  DashboardIcon,
  GroupsIcon,
  HistoryIcon,
  LinkDownIcon,
  LiveIcon,
  LogsIcon,
  MappingIcon,
  MonitoringIcon,
  MoreIcon,
  PhoneIcon,
  ProjectorIcon,
  SettingsIcon,
  SignOutIcon,
  type LucideIcon,
} from '../icons'
import { ActivityPanel } from './ActivityPanel'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  badge?: 'offline' | 'alerts'
}

const NAV: Array<{ section: string; items: NavItem[] }> = [
  {
    section: 'Operate',
    items: [
      { to: '/', label: 'Dashboard', icon: DashboardIcon, end: true },
      { to: '/projectors', label: 'Projectors', icon: ProjectorIcon, badge: 'offline' },
      { to: '/groups', label: 'Groups', icon: GroupsIcon },
      { to: '/control', label: 'Control Center', icon: ControlIcon },
    ],
  },
  {
    section: 'Show',
    items: [
      { to: '/mapping', label: 'Mapping', icon: MappingIcon },
      { to: '/automation', label: 'Automation', icon: AutomationIcon },
      { to: '/phone', label: 'Phone remote', icon: PhoneIcon },
    ],
  },
  {
    section: 'Health',
    items: [
      { to: '/alerts', label: 'Alerts', icon: AlertsIcon, badge: 'alerts' },
      { to: '/monitoring', label: 'Monitoring', icon: MonitoringIcon },
      { to: '/logs', label: 'Logs', icon: LogsIcon },
    ],
  },
  { section: 'System', items: [{ to: '/settings', label: 'Settings', icon: SettingsIcon }] },
]

/** The phone tab bar: the four places an operator goes on site. */
const MOBILE_TABS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: DashboardIcon, end: true },
  { to: '/projectors', label: 'Projectors', icon: ProjectorIcon, badge: 'offline' },
  { to: '/control', label: 'Control', icon: ControlIcon },
  { to: '/alerts', label: 'Alerts', icon: AlertsIcon, badge: 'alerts' },
]

function useBadges() {
  const { projectors, overview } = useFleetContext()
  const offline = projectors.filter((p) => p.enabled && !isLive(p)).length
  return {
    offline: offline > 0 ? { count: offline, tone: 'idle' as const, title: `${offline} not responding` } : null,
    alerts:
      overview && overview.open_alerts > 0
        ? {
            count: overview.open_alerts,
            tone: overview.critical_alerts > 0 ? ('fault' as const) : ('warn' as const),
            title: `${overview.open_alerts} unresolved alert(s), ${overview.critical_alerts} critical`,
          }
        : null,
  }
}

function NavBadge({ badge }: { badge: { count: number; tone: 'idle' | 'warn' | 'fault'; title: string } | null }) {
  if (!badge) return null
  return (
    <span
      className={classNames(
        'tnum ml-auto rounded px-1.5 text-2xs font-semibold leading-4',
        badge.tone === 'fault' && 'bg-red-500/20 text-red-300',
        badge.tone === 'warn' && 'bg-yellow-500/15 text-yellow-300',
        badge.tone === 'idle' && 'bg-white/[0.08] text-slate-300',
      )}
      title={badge.title}
    >
      {badge.count}
    </span>
  )
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const badges = useBadges()
  return (
    <nav className="flex flex-col gap-4" aria-label="Main">
      {NAV.map((group) => (
        <div key={group.section}>
          <p className="eyebrow mb-1 px-2.5 text-slate-600">{group.section}</p>
          <div className="flex flex-col gap-px">
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) => classNames('sidebar-link', isActive && 'sidebar-link-active')}
              >
                <item.icon size={16} strokeWidth={1.75} aria-hidden />
                {item.label}
                {item.badge && <NavBadge badge={badges[item.badge]} />}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

/** Link to the server and fleet reachability, in words. */
function SystemStatus() {
  const { wsStatus, projectors, lastSync, error } = useFleetContext()
  useTicker(5000)
  const enabled = projectors.filter((p) => p.enabled)
  const online = enabled.filter(isLive).length
  const serverDown = Boolean(error)
  const label = serverDown ? 'Server unreachable' : wsStatus === 'open' ? 'Live' : wsStatus === 'connecting' ? 'Connecting' : 'Polling'
  const tone = serverDown ? 'fault' : wsStatus === 'open' ? 'ok' : 'warn'
  const title = serverDown
    ? `Cannot reach the control server: ${error}`
    : wsStatus === 'open'
      ? 'Live updates connected. State changes arrive as they happen.'
      : 'Live link down. The screen refreshes every few seconds instead.'
  return (
    <div className="flex min-w-0 items-center gap-3 text-xs">
      <span className="flex items-center gap-1.5 whitespace-nowrap" title={title}>
        <StatusDot tone={tone} pulse={tone !== 'ok'} />
        <span className={classNames(tone === 'ok' ? 'text-slate-300' : tone === 'warn' ? 'text-yellow-300' : 'text-red-300')}>
          {label}
        </span>
        {lastSync && wsStatus !== 'open' && (
          <span className="tnum hidden text-slate-500 sm:inline">· updated {relativeTime(new Date(lastSync).toISOString())}</span>
        )}
      </span>
      {enabled.length > 0 && (
        <span className="hidden items-center gap-1.5 whitespace-nowrap text-slate-400 sm:flex" title="Projectors answering their polls">
          {online === enabled.length ? <LiveIcon size={13} className="text-slate-500" aria-hidden /> : <LinkDownIcon size={13} className="text-slate-500" aria-hidden />}
          <span className="tnum text-slate-200">{online}</span>/<span className="tnum">{enabled.length}</span> online
        </span>
      )}
    </div>
  )
}

function Clock() {
  useTicker(1000)
  return (
    <span className="tnum hidden whitespace-nowrap font-mono text-xs text-slate-400 md:inline" title="Local time on this device">
      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  )
}

/** Critical problems, on every page, until they are resolved. */
function CriticalBanner() {
  const { overview, alerts, error, wsStatus } = useFleetContext()
  const location = useLocation()
  const critical = useMemo(
    () => alerts.filter((a) => a.severity === 'critical' && a.state === 'open'),
    [alerts],
  )
  if (error && wsStatus !== 'open') {
    return (
      <Banner tone="fault" title="Cannot reach the control server" className="rounded-none border-x-0 border-t-0">
        Values on screen are the last ones received and may be out of date. Retrying automatically. ({error})
      </Banner>
    )
  }
  if (!overview || critical.length === 0 || location.pathname === '/alerts') return null
  return (
    <Banner
      tone="fault"
      title={`${critical.length} critical alert${critical.length === 1 ? '' : 's'}`}
      className="rounded-none border-x-0 border-t-0"
      action={
        <Link to="/alerts" className="btn-sm btn border border-red-400/40 text-red-100 hover:bg-red-500/20">
          View alerts
        </Link>
      }
    >
      <span className="line-clamp-2 sm:line-clamp-none">
        {critical.slice(0, 2).map((a) => a.message).join(' · ')}
        {critical.length > 2 && ` · +${critical.length - 2} more`}
      </span>
    </Banner>
  )
}

export function AppShell({
  session,
  onSignOut,
  children,
}: {
  session: Session
  onSignOut: () => void
  children: ReactNode
}) {
  const location = useLocation()
  const { toasts, dismissToast, commands } = useOps()
  const badges = useBadges()
  const [moreOpen, setMoreOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)

  useEffect(() => setMoreOpen(false), [location.pathname])

  const inFlight = commands.filter((c) => phaseIsActive(c.phase)).length

  const activityButton = (
    <button
      className={classNames('btn-ghost btn-sm relative', inFlight > 0 && 'text-sky-300')}
      onClick={() => setActivityOpen(true)}
      aria-label={`Command activity${inFlight ? `, ${inFlight} in progress` : ''}`}
      title="Command activity"
    >
      <HistoryIcon size={15} aria-hidden />
      <span className="hidden md:inline">Activity</span>
      {inFlight > 0 && (
        <span className="tnum rounded bg-sky-500/20 px-1 text-2xs font-semibold text-sky-200">{inFlight}</span>
      )}
    </button>
  )

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-white/[0.06] bg-panel-900 px-3 py-3 lg:flex">
        <Link to="/" className="flex items-center gap-2 px-2.5 py-1.5 text-sm font-semibold tracking-tight text-slate-50">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-sky-500/15 text-sky-300" aria-hidden>
            <ProjectorIcon size={15} strokeWidth={2} />
          </span>
          Projector Control
        </Link>
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
          <SideNav />
        </div>
        <div className="mt-3 border-t border-white/[0.06] px-2.5 pt-3">
          <p className="truncate text-sm text-slate-200">{session.username}</p>
          <div className="mt-0.5 flex items-center justify-between">
            <span className="eyebrow">{session.role}</span>
            <button className="btn-ghost btn-sm -mr-2 text-slate-400" onClick={onSignOut}>
              <SignOutIcon size={13} aria-hidden /> Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        {/* Status bar */}
        <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-panel-950/95 backdrop-blur">
          <div className="flex h-12 items-center gap-3 px-3 lg:px-6">
            <Link to="/" className="flex items-center gap-2 lg:hidden" aria-label="Dashboard">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-sky-500/15 text-sky-300" aria-hidden>
                <ProjectorIcon size={15} strokeWidth={2} />
              </span>
            </Link>
            <SystemStatus />
            <div className="ml-auto flex items-center gap-1.5">
              {badges.alerts && (
                <Link
                  to="/alerts"
                  className={classNames(
                    'btn-sm btn hidden sm:inline-flex',
                    badges.alerts.tone === 'fault' ? 'text-red-300 hover:bg-red-500/10' : 'text-yellow-300 hover:bg-yellow-500/10',
                  )}
                  title={badges.alerts.title}
                >
                  <AlertsIcon size={14} aria-hidden />
                  <span className="tnum">{badges.alerts.count}</span>
                  <span className="hidden md:inline">alert{badges.alerts.count === 1 ? '' : 's'}</span>
                </Link>
              )}
              {activityButton}
              <Clock />
            </div>
          </div>
          <CriticalBanner />
        </header>

        <main className="mx-auto w-full max-w-[1680px] flex-1 px-3 pb-24 pt-4 sm:px-4 lg:px-6 lg:pb-8 lg:pt-5">
          {children}
        </main>
      </div>

      {/* Phone tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-white/[0.08] bg-panel-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Main"
      >
        {MOBILE_TABS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              classNames(
                'relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-2xs',
                isActive ? 'text-sky-300' : 'text-slate-400',
              )
            }
          >
            <item.icon size={19} strokeWidth={1.75} aria-hidden />
            {item.label}
            {item.badge && badges[item.badge] && (
              <span
                className={classNames(
                  'tnum absolute right-[calc(50%-20px)] top-1.5 min-w-[16px] rounded-full px-1 text-center text-[10px] font-semibold leading-4',
                  badges[item.badge]!.tone === 'fault' ? 'bg-red-500 text-white' : badges[item.badge]!.tone === 'warn' ? 'bg-yellow-400 text-black' : 'bg-slate-500 text-white',
                )}
              >
                {badges[item.badge]!.count}
              </span>
            )}
          </NavLink>
        ))}
        <button
          className={classNames('flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-2xs', moreOpen ? 'text-sky-300' : 'text-slate-400')}
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
        >
          <MoreIcon size={19} aria-hidden />
          More
        </button>
      </nav>

      {/* Phone "More" sheet: the full navigation */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 animate-fade-in lg:hidden" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-xl border-t border-white/10 bg-panel-900 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] animate-slide-up"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Navigation"
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-200">{session.username}</p>
                <p className="eyebrow">{session.role}</p>
              </div>
              <button className="btn-ghost btn-icon" onClick={() => setMoreOpen(false)} aria-label="Close">
                <CloseIcon size={18} />
              </button>
            </div>
            <SideNav onNavigate={() => setMoreOpen(false)} />
            <button className="btn-default mt-4 w-full" onClick={onSignOut}>
              <SignOutIcon size={15} aria-hidden /> Sign out
            </button>
          </div>
        </div>
      )}

      <ActivityPanel open={activityOpen} onClose={() => setActivityOpen(false)} />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
