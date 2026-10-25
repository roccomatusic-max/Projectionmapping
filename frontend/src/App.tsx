import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { clearSession, getSession, type Session } from '@/api/client'
import { Spinner } from '@/components/ui'
import { AppShell } from '@/components/shell/AppShell'
import { LiveProvider } from '@/live/LiveProvider'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Projectors from '@/pages/Projectors'
import ProjectorDetail from '@/pages/ProjectorDetail'
import Groups from '@/pages/Groups'
import ControlCenter from '@/pages/ControlCenter'
import Automation from '@/pages/Automation'
import Alerts from '@/pages/Alerts'
import Logs from '@/pages/Logs'
import Settings from '@/pages/Settings'
import PhoneRemote from '@/pages/PhoneRemote'
import Calendar from '@/pages/Calendar'
// Monitoring pulls in the charting library; keep it out of the initial
// bundle so the dashboard loads fast on a tablet over site wifi.
const Monitoring = lazy(() => import('@/pages/Monitoring'))
// The mapping editor carries the WebGL renderer; output windows and players
// load only what they draw.
const Mapping = lazy(() => import('@/pages/Mapping'))
const OutputPage = lazy(() => import('@/mapping/OutputPage'))
const PlayerPage = lazy(() => import('@/mapping/PlayerPage'))
const ScreenPage = lazy(() => import('@/mapping/ScreenPage'))
const RemotePage = lazy(() => import('@/remote/RemotePage'))

export default function App() {
  const [session, setSession] = useState<Session | null>(() => getSession())
  const location = useLocation()

  // The API client fires this when a request comes back 401.
  useEffect(() => {
    const onUnauthorized = () => setSession(null)
    window.addEventListener('pc:unauthorized', onUnauthorized)
    return () => window.removeEventListener('pc:unauthorized', onUnauthorized)
  }, [])

  const signOut = useCallback(() => {
    clearSession()
    setSession(null)
  }, [])

  // The status screen on a monitor beside the projector signs in as its mini PC.
  if (location.pathname === '/player/screen') {
    return (
      <Suspense fallback={null}>
        <ScreenPage />
      </Suspense>
    )
  }

  // A player pairs itself and holds its own token; it never sees the login.
  if (location.pathname === '/player') {
    return (
      <Suspense fallback={null}>
        <PlayerPage />
      </Suspense>
    )
  }

  // The phone remote has its own sign-in, laid out for a phone.
  if (location.pathname === '/remote') {
    return (
      <Suspense fallback={null}>
        <RemotePage />
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

  return (
    <LiveProvider>
      {location.pathname.startsWith('/control/fullscreen') ? (
        // The full-screen control-room view drops the chrome entirely.
        <Routes>
          <Route path="/control/fullscreen" element={<ControlCenter fullscreen session={session} />} />
        </Routes>
      ) : (
        <AppShell session={session} onSignOut={signOut}>
          <Routes>
            <Route path="/" element={<Dashboard session={session} />} />
            <Route path="/projectors" element={<Projectors session={session} />} />
            <Route path="/projectors/:id" element={<ProjectorDetail session={session} />} />
            <Route path="/groups" element={<Groups session={session} />} />
            <Route path="/control" element={<ControlCenter session={session} />} />
            {['/mapping', '/mapping/:section'].map((path) => (
              <Route
                key={path}
                path={path}
                element={
                  <Suspense fallback={<Spinner label="Loading mapping…" />}>
                    <Mapping session={session} />
                  </Suspense>
                }
              />
            ))}
            <Route path="/calendar" element={<Calendar session={session} />} />
            <Route path="/automation" element={<Automation session={session} />} />
            <Route path="/alerts" element={<Alerts session={session} />} />
            <Route
              path="/monitoring"
              element={
                <Suspense fallback={<Spinner label="Loading monitoring…" />}>
                  <Monitoring session={session} />
                </Suspense>
              }
            />
            <Route path="/logs" element={<Logs />} />
            <Route path="/phone" element={<PhoneRemote />} />
            <Route path="/settings" element={<Settings session={session} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      )}
    </LiveProvider>
  )
}
