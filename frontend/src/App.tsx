import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { clearSession, getSession, type Session } from '@/api/client'
import { classNames } from '@/lib/format'
import { Spinner } from '@/components/ui'
import {
  AutomationIcon,
  ControlIcon,
  DashboardIcon,
  GroupsIcon,
  LogsIcon,
  MappingIcon,
  MenuIcon,
  MonitoringIcon,
  ProjectorIcon,
  SettingsIcon,
  SignOutIcon,
} from '@/components/icons'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Projectors from '@/pages/Projectors'
import ProjectorDetail from '@/pages/ProjectorDetail'
import Groups from '@/pages/Groups'
import ControlCenter from '@/pages/ControlCenter'
import Automation from '@/pages/Automation'
import Logs from '@/pages/Logs'
// Monitoring pulls in the charting library; keep it out of the initial
// bundle so the dashboard loads fast on a tablet over site wifi.
const Monitoring = lazy(() => import('@/pages/Monitoring'))
import Settings from '@/pages/Settings'
// The mapping editor carries the WebGL renderer; output windows and players
// load only what they draw.
const Mapping = lazy(() => import('@/pages/Mapping'))
const OutputPage = lazy(() => import('@/mapping/OutputPage'))
const PlayerPage = lazy(() => import('@/mapping/PlayerPage'))

const NAV = [
  { to: '/', label: 'Dashboard', end: true, icon: DashboardIcon },
  { to: '/projectors', label: 'Projectors', icon: ProjectorIcon },
  { to: '/groups', label: 'Groups', icon: GroupsIcon },
  { to: '/control', label: 'Control Center', icon: ControlIcon },
  { to: '/mapping', label: 'Mapping', icon: MappingIcon },
  { to: '/automation', label: 'Automation', icon: AutomationIcon },
  { to: '/monitoring', label: 'Monitoring', icon: MonitoringIcon },
  { to: '/logs', label: 'Logs', icon: LogsIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

export default function App() {
  const [session, setSession] = useState<Session | null>(() => getSession())
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  // The API client fires this when a request comes back 401.
  useEffect(() => {
    const onUnauthorized = () => setSession(null)
    window.addEventListener('pc:unauthorized', onUnauthorized)
    return () => window.removeEventListener('pc:unauthorized', onUnauthorized)
  }, [])

  useEffect(() => setMenuOpen(false), [location.pathname])

  const signOut = useCallback(() => {
    clearSession()
    setSession(null)
  }, [])

  // A player pairs itself and holds its own token; it never sees the login.
  if (location.pathname === '/player') {
    return (
      <Suspense fallback={null}>
        <PlayerPage />
      </Suspense>
    )
  }

  if (!session) return <Login onSignedIn={setSession} />

  if (location.pathname.startsWith('/mapping/output/')) {
    return (
      <Suspense fallback={null}>
        <Routes>
          <Route path="/mapping/output/:showId/:outputId" element={<OutputPage />} />
        </Routes>
      </Suspense>
    )
  }

  // The full-screen control-room view drops the chrome entirely.
  const fullscreen = location.pathname.startsWith('/control/fullscreen')
  if (fullscreen) {
    return (
      <Routes>
        <Route path="/control/fullscreen" element={<ControlCenter fullscreen session={session} />} />
      </Routes>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-panel-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] items-stretch gap-3 px-4">
          <span className="flex items-center gap-2 py-2.5 text-sm font-semibold tracking-tight text-slate-100">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300" aria-hidden>
              <ProjectorIcon size={16} strokeWidth={2} />
            </span>
            Projector Control
          </span>

          <nav className="ml-4 hidden items-stretch gap-1 lg:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  classNames(
                    'relative flex items-center gap-1.5 whitespace-nowrap px-2.5 text-sm transition-colors xl:px-3',
                    isActive ? 'text-slate-100' : 'text-slate-400 hover:text-slate-200',
                    isActive &&
                      'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-sky-400',
                  )
                }
              >
                <item.icon size={15} strokeWidth={1.75} aria-hidden />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 py-2">
            <span className="hidden whitespace-nowrap text-xs text-slate-500 sm:inline">
              {session.username} · {session.role}
            </span>
            <button className="btn-ghost text-xs" onClick={signOut}>
              <SignOutIcon size={14} aria-hidden /> Sign out
            </button>
            <button
              className="btn-ghost lg:hidden"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Toggle navigation"
              aria-expanded={menuOpen}
            >
              <MenuIcon size={18} />
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="grid grid-cols-2 gap-1 border-t border-white/5 px-4 py-2 lg:hidden">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  classNames(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
                    isActive ? 'bg-panel-800 text-slate-100' : 'text-slate-400',
                  )
                }
              >
                <item.icon size={16} strokeWidth={1.75} aria-hidden />
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-[1800px] px-4 py-5">
        <Routes>
          <Route path="/" element={<Dashboard session={session} />} />
          <Route path="/projectors" element={<Projectors session={session} />} />
          <Route path="/projectors/:id" element={<ProjectorDetail session={session} />} />
          <Route path="/groups" element={<Groups session={session} />} />
          <Route path="/control" element={<ControlCenter session={session} />} />
          <Route
            path="/mapping"
            element={
              <Suspense fallback={<Spinner label="Loading mapping…" />}>
                <Mapping session={session} />
              </Suspense>
            }
          />
          <Route path="/automation" element={<Automation session={session} />} />
          <Route
            path="/monitoring"
            element={
              <Suspense fallback={<Spinner label="Loading monitoring…" />}>
                <Monitoring session={session} />
              </Suspense>
            }
          />
          <Route path="/logs" element={<Logs />} />
          <Route path="/settings" element={<Settings session={session} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
