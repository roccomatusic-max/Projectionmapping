import { type ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, request } from '@/api/client'
import { BackIcon, PrintIcon } from '@/components/icons'
import { formatDateTime } from '@/lib/format'

/**
 * The one-page setup guide (backend/app/services/setup_guide.py), laid out
 * as paper: print it, or "Save as PDF" in the print window, and keep it by
 * the server for the evening something breaks at 6:40. No passwords.
 */

interface Guide {
  generated_at: string
  server: {
    computer: string
    system: 'mac' | 'windows' | 'linux'
    version: string
    address: string | null
    local_only: boolean
    tailscale: string | null
    phone_remote: string | null
    data_folder: string | null
    timezone: string
  }
  sign_in: { admins: string[]; password_hint: string; reset: string | null; reset_where: string | null }
  show: {
    enabled: boolean
    start_at: string | null
    end_at: string | null
    days: number[]
    show_name: string | null
    group_name: string | null
  }
  projectors: Array<{
    name: string
    location: string
    address: string
    port: number
    driver: string
    model: string
    username: string | null
    has_password: boolean
    pjlink_port: number | null
    enabled: boolean
  }>
  mini_pcs: Array<{
    name: string
    kind: 'player' | 'camera'
    computer: string | null
    address: string | null
    app_version: string | null
    mac: string | null
    output: string | null
    show: string | null
    projector: string | null
    monitor: boolean
    last_seen_at: string | null
  }>
  install: { server: string; server_note: string; minipc: string; minipc_note: string }
  last_backup: { name: string; created_at: string; kind: string; folder: string | null } | null
  steps: Array<{ title: string; text: string }>
}

const SYSTEM = { mac: 'Mac', windows: 'Windows', linux: 'Linux' }
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function clock(value: string | null) {
  if (!value) return '—'
  const [h, m] = value.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function nights(days: number[]) {
  const sorted = [...new Set(days)].sort()
  return sorted.length === 7 ? 'every night' : sorted.map((d) => DAYS[d]).join(', ')
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-1 border-b border-slate-300 pb-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{children}</dd>
    </div>
  )
}

function Line({ text }: { text: string }) {
  return (
    <code className="mt-0.5 block break-all rounded border border-slate-300 bg-slate-50 px-1.5 py-1 font-mono text-[9.5px] leading-snug text-slate-900">
      {text}
    </code>
  )
}

export default function SetupGuide() {
  const [guide, setGuide] = useState<Guide | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    request<Guide>('/setup-guide').then(setGuide, (err) =>
      setError(err instanceof ApiError ? err.message : 'Could not load the setup guide'),
    )
    const before = document.title
    document.title = 'Projector Control setup guide'
    return () => {
      document.title = before
    }
  }, [])

  const { server, sign_in: signIn, show } = guide ?? ({} as Guide)

  return (
    <div className="paper-page min-h-full bg-slate-300 py-6 text-slate-900 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[8.5in] flex-wrap items-center justify-between gap-2 px-4 print:hidden">
        <Link to="/settings?part=backup" className="inline-flex items-center gap-1.5 text-sm text-slate-700 hover:text-slate-950">
          <BackIcon size={15} aria-hidden /> Back to Settings
        </Link>
        <button
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          onClick={() => window.print()}
          disabled={!guide}
        >
          <PrintIcon size={15} aria-hidden /> Print or save as PDF
        </button>
      </div>

      <article className="mx-auto max-w-[8.5in] bg-white px-[0.5in] py-[0.45in] text-[11px] leading-snug shadow-xl print:max-w-none print:p-0 print:shadow-none">
        {error && <p className="text-sm text-red-700">{error}</p>}
        {!guide && !error && <p className="text-sm text-slate-500">Loading…</p>}
        {guide && (
          <div className="space-y-3">
            <header className="flex items-end justify-between gap-4 border-b-2 border-slate-900 pb-1.5">
              <div>
                <h1 className="text-xl font-bold leading-tight">Projector Control setup guide</h1>
                <p className="text-slate-600">Keep this by the server. It holds no passwords.</p>
              </div>
              <p className="text-right text-slate-600">
                Printed {formatDateTime(guide.generated_at)}
                <br />
                Version {server.version}
              </p>
            </header>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Section title="Server">
                <dl className="space-y-0.5">
                  <Row label="Dashboard">{server.address ?? 'this computer only'}</Row>
                  <Row label="Phone remote">{server.phone_remote ?? '—'}</Row>
                  {server.tailscale && <Row label="From anywhere">{server.tailscale} (Tailscale)</Row>}
                  <Row label="Computer">
                    {server.computer} ({SYSTEM[server.system]})
                  </Row>
                  {server.data_folder && <Row label="Data folder">{server.data_folder}</Row>}
                  <Row label="Time zone">{server.timezone}</Row>
                </dl>
              </Section>

              <Section title="Sign in">
                <dl className="space-y-0.5">
                  <Row label="Username">{signIn.admins.join(', ') || 'admin'}</Row>
                  <Row label="Password">{signIn.password_hint}</Row>
                  {signIn.reset && (
                    <div>
                      <dt className="text-slate-500">Forgot it? In {signIn.reset_where}:</dt>
                      <dd>
                        <Line text={signIn.reset} />
                      </dd>
                    </div>
                  )}
                  <Row label="Show time">
                    {show.enabled && show.start_at
                      ? `${clock(show.start_at)} to ${clock(show.end_at)}, ${nights(show.days)}${show.group_name ? ` (${show.group_name})` : ''}`
                      : 'not set (Dashboard → Tonight’s show)'}
                  </Row>
                </dl>
              </Section>
            </div>

            <Section title={`Projectors (${guide.projectors.length})`}>
              {guide.projectors.length === 0 ? (
                <p className="text-slate-500">None yet.</p>
              ) : (
                <table className="w-full border-collapse text-left">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-0.5 pr-2 font-normal">Name</th>
                      <th className="py-0.5 pr-2 font-normal">Address</th>
                      <th className="py-0.5 pr-2 font-normal">Model and driver</th>
                      <th className="py-0.5 font-normal">Control sign-in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guide.projectors.map((p) => (
                      <tr key={p.name} className="border-t border-slate-200 align-top">
                        <td className="py-0.5 pr-2 font-medium">
                          {p.name}
                          {p.location && <span className="block font-normal text-slate-500">{p.location}</span>}
                          {!p.enabled && <span className="block font-normal text-slate-500">switched off in the app</span>}
                        </td>
                        <td className="py-0.5 pr-2 font-mono">
                          {p.address}:{p.port}
                          {p.pjlink_port ? <span className="block text-slate-500">PJLink {p.pjlink_port}</span> : null}
                        </td>
                        <td className="py-0.5 pr-2">
                          {p.model}
                          <span className="block text-slate-500">{p.driver}</span>
                        </td>
                        <td className="py-0.5">
                          {p.username ? `${p.username}, ` : ''}
                          {p.has_password ? 'password = its web login' : 'no password'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            <Section title={`Mini PCs (${guide.mini_pcs.length})`}>
              {guide.mini_pcs.length === 0 ? (
                <p className="text-slate-500">None paired yet.</p>
              ) : (
                <table className="w-full border-collapse text-left">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-0.5 pr-2 font-normal">Name</th>
                      <th className="py-0.5 pr-2 font-normal">Address</th>
                      <th className="py-0.5 pr-2 font-normal">App</th>
                      <th className="py-0.5 font-normal">Plays</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guide.mini_pcs.map((m) => (
                      <tr key={`${m.kind}-${m.name}`} className="border-t border-slate-200 align-top">
                        <td className="py-0.5 pr-2 font-medium">
                          {m.name}
                          {m.computer && m.computer !== m.name && (
                            <span className="block font-normal text-slate-500">Windows name {m.computer}</span>
                          )}
                        </td>
                        <td className="py-0.5 pr-2 font-mono">
                          {m.address ?? '—'}
                          {m.mac && <span className="block text-slate-500">{m.mac}</span>}
                        </td>
                        <td className="py-0.5 pr-2">{m.app_version ?? '—'}</td>
                        <td className="py-0.5">
                          {m.kind === 'camera'
                            ? 'camera'
                            : m.output
                              ? `${m.output}${m.show ? ` (${m.show})` : ''}${m.projector ? ` on ${m.projector}` : ''}`
                              : 'nothing yet'}
                          {m.monitor && <span className="block text-slate-500">status monitor attached</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            <Section title="Install lines">
              <div className="grid grid-cols-2 gap-x-6">
                <div>
                  <p className="font-medium">Server ({SYSTEM[server.system === 'windows' ? 'windows' : 'mac']})</p>
                  <p className="text-slate-500">{guide.install.server_note}</p>
                  <Line text={guide.install.server} />
                </div>
                <div>
                  <p className="font-medium">Mini PC</p>
                  <p className="text-slate-500">{guide.install.minipc_note}</p>
                  <Line text={guide.install.minipc} />
                </div>
              </div>
            </Section>

            <Section title="If it breaks at 6:40">
              <ol className="grid grid-cols-2 gap-x-6 gap-y-1">
                {guide.steps.map((step, index) => (
                  <li key={step.title} className="flex gap-1.5">
                    <span className="font-bold">{index + 1}.</span>
                    <span>
                      <span className="font-semibold">{step.title}.</span> {step.text}
                    </span>
                  </li>
                ))}
              </ol>
            </Section>

            <footer className="border-t border-slate-300 pt-1 text-slate-600">
              {guide.last_backup
                ? `Newest backup: ${formatDateTime(guide.last_backup.created_at)}, in ${guide.last_backup.folder ?? 'the data folder'}. Keep a downloaded copy off the server too (Settings → Backup).`
                : 'No backup yet: Settings → Backup → Back up and download.'}
            </footer>
          </div>
        )}
      </article>
    </div>
  )
}
