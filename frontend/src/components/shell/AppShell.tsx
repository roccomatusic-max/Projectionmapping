/**
 * Application chrome: navigation, the system status bar, the critical-fault
 * banner, command activity and notifications.
 *
 * The status bar and banner sit on every page, so a fault or a dropped link
 * is visible wherever the operator happens to be.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import type { Session } from '@/api/client'
import { classNames, relativeTime } from '@/lib/format'
import { isLive } from '@/lib/status'
import { phaseIsActive, useFleetContext, useOps } from '@/live/LiveProvider'
import { useTicker } from '@/hooks/useLiveData'
import { Banner, StatusDot, ToastStack } from '../ui'
import { EmergencyBanner, EmergencyStopButton, type UsePower } from '../EmergencyStop'
import {
  AlertsIcon,
  CloseIcon,
  DashboardIcon,
  HistoryIcon,
  LinkDownIcon,
  LiveIcon,
  MoreIcon,
  ProjectorIcon,
  RunShowIcon,
  SearchIcon,
  SignOutIcon,
} from '../icons'
import { ActivityPanel } from './ActivityPanel'
import { JumpMenu, isMac } from './JumpMenu'
import { NAV, NAV_ITEMS, type NavItem } from './nav'
import { ShowStatusChip, ShowStatusProvider, useShowStatus } from './ShowStatus'

/** The phone tab bar: the four places an operator goes on site. */
const MOBILE_TABS: Array<Pick<NavItem, 'to' | 'label' | 'icon' | 'end' | 'badge'>> = [
  { to: '/', label: 'Dashboard', icon: DashboardIcon, end: true },
  { to: '/mapping/run', label: 'Show', icon: RunShowIcon },
  { to: '/projectors', label: 'Projectors', icon: ProjectorIcon, badge: 'offline' },
  { to: '/alerts', label: 'Alerts', icon: AlertsIcon, badge: 'alerts' },
]

/** Each projector's power as the live feed has it, for the emergency stop's report. */
const useFleetPower: UsePower = () => {
  const { projectors } = useFleetContext()
  return (id) => projectors.find((p) => p.id === id)?.state.power
}

/** On every page while the emergency stop is on. */
function EmergencyBar({ canClear }: { canClear: boolean }) {
  const { transport } = useShowStatus()
  return <EmergencyBanner emergency={transport?.emergency} canClear={canClear} />
}

type BadgeInfo = { count: number; tone: 'idle' | 'warn' | 'fault' | 'busy'; title: string } | null

function useBadges(): Record<NonNullable<NavItem['badge']>, BadgeInfo> {
  const { projectors, overview } = useFleetContext()
  const { players } = useShowStatus()
  const offline = projectors.filter((p) => p.enabled && !isLive(p)).length
  const playersOffline = players.paired - players.online
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
    players:
      players.waiting > 0
        ? { count: players.waiting, tone: 'busy' as const, title: `${players.waiting} waiting for you to approve` }
        : playersOffline > 0
          ? { count: playersOffline, tone: 'warn' as const, title: `${playersOffline} mini PC(s) not connected` }
          : null,
  }
}

function NavBadge({ badge }: { badge: BadgeInfo }) {
  if (!badge) return null
  return (
    <span
      className={classNames(
        'tnum ml-auto rounded px-1.5 text-2xs font-semibold leading-4',
        badge.tone === 'fault' && 'bg-red-500/20 text-red-300',
        badge.tone === 'warn' && 'bg-yellow-500/15 text-yellow-300',
        badge.tone === 'idle' && 'bg-white/[0.08] text-slate-300',
        badge.tone === 'busy' && 'bg-sky-500/20 text-sky-200',
      )}
      title={badge.title}
    >
      {badge.count}
    </span>
  )
}

/** Whether the page is on one of this entry's other tabs (Control several is under Projectors). */
function onAlsoPath(item: NavItem, pathname: string): boolean {
  return (item.also ?? []).some((to) => pathname === to || pathname.startsWith(`${to}/`))
}

function SideNav({ onNavigate, showHints = false }: { onNavigate?: () => void; showHints?: boolean }) {
  const badges = useBadges()
  const { pathname } = useLocation()
  return (
    <nav className="flex flex-col gap-3" aria-label="Main">
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
                title={showHints ? undefined : item.hint}
                className={({ isActive }) => classNames('sidebar-link', (isActive || onAlsoPath(item, pathname)) && 'sidebar-link-active')}
              >
                <item.icon size={16} strokeWidth={1.75} className={showHints ? 'mt-0.5 self-start' : undefined} aria-hidden />
                {showHints ? (
                  <span className="min-w-0">
                    <span className="block">{item.label}</span>
                    <span className="block text-xs text-slate-500">{item.hint}</span>
                  </span>
                ) : (
                  item.label
                )}
                {item.badge && <NavBadge badge={badges[item.badge]} />}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

/** Opens "Go to"; shows the shortcut so it can be learned. */
function JumpButton({ onOpen, wide = false }: { onOpen: () => void; wide?: boolean }) {
  return (
    <button
      className={classNames(
        'flex items-center gap-2 rounded-md border border-white/[0.08] bg-panel-850 text-sm text-slate-400 hover:border-white/[0.16] hover:text-slate-200',
        wide ? 'w-full px-2.5 py-1.5' : 'px-2 py-1',
      )}
      onClick={onOpen}
      title={`Find any page, setting or projector (${isMac ? '⌘K' : 'Ctrl+K'})`}
    >
      <SearchIcon size={14} aria-hidden />
      <span className={wide ? undefined : 'hidden sm:inline'}>Go to…</span>
      <kbd className={classNames('ml-auto rounded bg-white/[0.06] px-1 font-sans text-2xs text-slate-500', !wide && 'hidden md:inline')}>
        {isMac ? '⌘K' : 'Ctrl K'}
      </kbd>
    </button>
  )
}

/** Link to the server and fleet reachability, in words. */
function SystemStatus() {
  const { wsStatus, projectors, lastSync, error } = useFleetContext()
  useTicker(5000)
  const enabled = projectors.filter((p) => p.enabled)
  const online = enabled.filter(isLive).length
  const serverDown = Boolean(error)
  const label = serverDown ? 'Server unreachable' : wsStatus === 'open' ? 'Connected' : wsStatus === 'connecting' ? 'Connecting' : 'Slow updates'
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
        {/* On a phone the green dot says "connected"; the words make room for Stop. */}
        <span className={classNames(tone === 'ok' ? 'hidden text-slate-300 sm:inline' : tone === 'warn' ? 'text-yellow-300' : 'text-red-300')}>
          {label}
        </span>
        {lastSync && wsStatus !== 'open' && (
          <span className="tnum hidden text-slate-500 sm:inline">· updated {relativeTime(new Date(lastSync).toISOString())}</span>
        )}
      </span>
      {enabled.length > 0 && (
        <span className="hidden items-center gap-1.5 whitespace-nowrap text-slate-400 sm:flex" title="Projectors answering right now">
          {online === enabled.length ? <LiveIcon size={13} className="text-slate-500" aria-hidden /> : <LinkDownIcon size={13} className="text-slate-500" aria-hidden />}
          <span className="tnum text-slate-200">{online}</span>/<span className="tnum">{enabled.length}</span> projectors
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

export function AppShell(props: { session: Session; onSignOut: () => void; children: ReactNode }) {
  return (
    <ShowStatusProvider>
      <Shell {...props} />
    </ShowStatusProvider>
  )
}

function Shell({
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
  const [jumpOpen, setJumpOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => setMoreOpen(false), [location.pathname])

  // Ctrl+K (⌘K on a Mac) opens "Go to" from anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setJumpOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Pages keep things stuck just under the top bar (the show's GO bar);
  // the bar grows when a banner shows, so publish its real height.
  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    const publish = () => document.documentElement.style.setProperty('--shell-top', `${header.offsetHeight}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  const inFlight = commands.filter((c) => phaseIsActive(c.phase)).length
  const canStop = session.role === 'admin' || session.role === 'operator'

  const activityButton = (
    <button
      className={classNames('btn-ghost btn-sm relative', inFlight > 0 && 'text-sky-300')}
      onClick={() => setActivityOpen(true)}
      aria-label={`Command activity${inFlight ? `, ${inFlight} in progress` : ''}`}
      title="Commands sent to the projectors and what each one answered"
    >
      <HistoryIcon size={15} aria-hidden />
      <span className="hidden md:inline">Activity</span>
      {inFlight > 0 && (
        <span className="tnum rounded bg-sky-500/20 px-1 text-2xs font-semibold text-sky-200">{inFlight}</span>
      )}
    </button>
  )

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-white/[0.06] bg-panel-900 px-3 py-3 lg:flex">
        <Link to="/" className="flex items-center gap-2 px-2.5 py-1.5 text-sm font-semibold tracking-tight text-slate-50">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-sky-500/15 text-sky-300" aria-hidden>
            <ProjectorIcon size={15} strokeWidth={2} />
          </span>
          Projector Control
        </Link>
        <div className="mt-3">
          <JumpButton wide onOpen={() => setJumpOpen(true)} />
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
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
        {/* Status bar: the show, the projectors and the server link, on every page */}
        <header ref={headerRef} className="sticky top-0 z-40 border-b border-white/[0.06] bg-panel-950/95 backdrop-blur">
          <div className="flex h-12 items-center gap-2 px-3 lg:gap-3 lg:px-6">
            <Link to="/" className="flex items-center gap-2 lg:hidden" aria-label="Dashboard">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-sky-500/15 text-sky-300" aria-hidden>
                <ProjectorIcon size={15} strokeWidth={2} />
              </span>
            </Link>
            <ShowStatusChip />
            <span className="hidden h-4 w-px bg-white/[0.08] sm:block" aria-hidden />
            <SystemStatus />
            <div className="ml-auto flex items-center gap-1.5">
              {canStop && <EmergencyStopButton variant="bar" usePower={useFleetPower} />}
              <span className="lg:hidden">
                <JumpButton onOpen={() => setJumpOpen(true)} />
              </span>
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
          <EmergencyBar canClear={canStop} />
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
        {MOBILE_TABS.map((item) => {
          const badge = item.badge ? badges[item.badge] : null
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                classNames(
                  'relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-2xs',
                  isActive ||
                    (item.to === '/mapping/run' && location.pathname.startsWith('/mapping')) ||
                    NAV_ITEMS.some((entry) => entry.to === item.to && onAlsoPath(entry, location.pathname))
                    ? 'text-sky-300'
                    : 'text-slate-400',
                )
              }
            >
              <item.icon size={19} strokeWidth={1.75} aria-hidden />
              {item.label}
              {badge && (
                <span
                  className={classNames(
                    'tnum absolute right-[calc(50%-20px)] top-1.5 min-w-[16px] rounded-full px-1 text-center text-[10px] font-semibold leading-4',
                    badge.tone === 'fault' ? 'bg-red-500 text-white' : badge.tone === 'warn' ? 'bg-yellow-400 text-black' : badge.tone === 'busy' ? 'bg-sky-500 text-white' : 'bg-slate-500 text-white',
                  )}
                >
                  {badge.count}
                </span>
              )}
            </NavLink>
          )
        })}
        <button
          className={classNames('flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-2xs', moreOpen ? 'text-sky-300' : 'text-slate-400')}
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
        >
          <MoreIcon size={19} aria-hidden />
          Menu
        </button>
      </nav>

      {/* Phone menu sheet: every page, each with a line on what it is for */}
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
            <div className="mb-3">
              <JumpButton wide onOpen={() => { setMoreOpen(false); setJumpOpen(true) }} />
            </div>
            <SideNav showHints onNavigate={() => setMoreOpen(false)} />
            <button className="btn-default mt-4 w-full" onClick={onSignOut}>
              <SignOutIcon size={15} aria-hidden /> Sign out
            </button>
          </div>
        </div>
      )}

      <JumpMenu open={jumpOpen} onClose={() => setJumpOpen(false)} />
      <ActivityPanel open={activityOpen} onClose={() => setActivityOpen(false)} />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
