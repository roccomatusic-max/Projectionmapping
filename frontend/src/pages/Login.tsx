import { type FormEvent, useState } from 'react'
import { api } from '@/api/client'
import type { Session } from '@/api/client'
import { ErrorBanner } from '@/components/ui'
import { ProjectorIcon } from '@/components/icons'

export default function Login({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onSignedIn(await api.login(username, password))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="grid w-full max-w-3xl overflow-hidden rounded-2xl border border-white/[0.06] bg-panel-900 shadow-panel md:grid-cols-[1.1fr_1fr]">
        <aside className="hidden flex-col justify-between bg-gradient-to-br from-sky-500/15 via-panel-900 to-panel-900 p-8 md:flex">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/25" aria-hidden>
            <ProjectorIcon size={24} strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-xl font-semibold tracking-tight text-slate-100">Projector Control</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Monitor and drive the whole fleet from one place. Every command is verified
              against the projector's own reply and recorded with its wire frame.
            </p>
            <ul className="mt-6 space-y-2 text-xs text-slate-400">
              <li className="flex gap-2"><span className="text-emerald-400">●</span> Live state, not remembered state</li>
              <li className="flex gap-2"><span className="text-sky-400">●</span> Confirmation before anything disruptive</li>
              <li className="flex gap-2"><span className="text-amber-400">●</span> Unverified commands stay off until you opt in</li>
            </ul>
          </div>
          <p className="text-[11px] text-slate-600">Not a safety device. Keep physical procedures for people and equipment.</p>
        </aside>
      <form onSubmit={submit} className="w-full p-6 sm:p-8">
        <div className="flex items-center gap-3 md:hidden">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300" aria-hidden>
            <ProjectorIcon size={24} strokeWidth={1.75} />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-slate-100">Projector Control</h1>
            <p className="text-sm text-slate-400">Sign in to manage the fleet.</p>
          </div>
        </div>
        <div className="hidden md:block">
          <h1 className="text-lg font-semibold text-slate-100">Sign in</h1>
          <p className="text-sm text-slate-400">Use your operator or administrator account.</p>
        </div>

        <div className="mt-6 space-y-4">
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          <div>
            <label className="label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="input"
              value={username}
              autoComplete="username"
              autoFocus
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <button className="btn-primary w-full btn-lg" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>

        <p className="mt-6 text-xs text-slate-500">
          First run? The server log prints a generated administrator password on
          first start. Change it once you are in.
        </p>
      </form>
      </div>
    </div>
  )
}
