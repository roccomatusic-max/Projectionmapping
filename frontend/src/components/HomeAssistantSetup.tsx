import { useCallback, useEffect, useState } from 'react'
import { ApiError, api, type HomeAssistantSetupStatus } from '@/api/client'
import { Banner, Chip, Panel } from '@/components/ui'
import { CopyIcon, HomeAssistantIcon, TokenIcon } from '@/components/icons'
import { relativeTime } from '@/lib/format'

type Toast = (tone: 'ok' | 'fault', title: string, detail?: string) => void

/**
 * Settings → Home Assistant. One line to paste into Home Assistant's
 * Terminal installs the integration and leaves a one-time pairing code, so
 * adding it in Home Assistant is a single Submit. A key to paste by hand is
 * there for HACS or setups without the Terminal add-on.
 */
export default function HomeAssistantSetup({ onToast }: { onToast: Toast }) {
  const [status, setStatus] = useState<HomeAssistantSetupStatus | null>(null)
  const [line, setLine] = useState<{ line: string; expires_at: string } | null>(null)
  const [key, setKey] = useState<{ key: string; server_address: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api.homeAssistantSetup().then(setStatus).catch(() => setStatus(null))
  }, [])

  useEffect(() => {
    load()
    // "Last checked in" moves on its own once Home Assistant is connected.
    const timer = window.setInterval(load, 10_000)
    return () => window.clearInterval(timer)
  }, [load])

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      onToast('ok', `${what} copied`)
    } catch {
      onToast('fault', 'Could not copy', 'Select the text and copy it by hand.')
    }
  }

  if (!status) return null

  const seen = status.connected && status.last_seen
  const chip = seen ? (
    <Chip tone="ok">Connected</Chip>
  ) : status.connected ? (
    <Chip tone="busy">Waiting for Home Assistant</Chip>
  ) : (
    <Chip tone="idle">Not connected</Chip>
  )

  return (
    <div className="space-y-4 lg:max-w-3xl">
      <Panel
        icon={HomeAssistantIcon}
        title="Home Assistant"
        description="Turn projectors on and off, press GO, pick a show or a cue, and press the emergency stop from Home Assistant, its app and its automations."
        action={chip}
      >
        {status.connected && (
          <p className="mb-3 text-sm text-slate-300">
            {seen
              ? <>Home Assistant last checked in {relativeTime(status.last_seen)}{status.installed_version && <> (integration version {status.installed_version})</>}.</>
              : 'Home Assistant has a key but has not checked in since this server started. If you just added it, give it a few seconds.'}
          </p>
        )}

        {status.local_only && (
          <Banner tone="warn" title="Home Assistant cannot reach this server yet" className="mb-3">
            It only accepts connections from this computer. The Mac and Windows server apps
            open it to your network by themselves; started by hand, add --lan.
          </Banner>
        )}

        <ol className="list-decimal space-y-3 pl-5 text-sm text-slate-300">
          <li>
            In Home Assistant open <b>Settings → Add-ons → Add-on store</b>, find{' '}
            <b>Terminal &amp; SSH</b>, press <b>Install</b>, then <b>Start</b>, then{' '}
            <b>Open Web UI</b>. Already have it? Just open it.
          </li>
          <li>
            Press <b>Make install line</b>, then <b>Copy</b>, paste it into that Terminal and press
            Enter. Home Assistant restarts by itself, which takes about a minute.
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn-primary" disabled={busy || status.local_only}
                onClick={() => void run(async () => {
                  setKey(null)
                  setLine(await api.homeAssistantInstallLine())
                })}>
                {line ? 'Make a new install line' : 'Make install line'}
              </button>
            </div>
            {line && (
              <div className="mt-2 rounded-md border border-sky-500/25 bg-sky-500/5 p-3">
                <code className="block break-all font-mono text-xs text-slate-100">{line.line}</code>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button className="btn-default btn-sm" onClick={() => void copy(line.line, 'Install line')}>
                    <CopyIcon size={13} aria-hidden /> Copy
                  </button>
                  <span className="text-xs text-slate-500">
                    Works once, until {new Date(line.expires_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
                  </span>
                </div>
              </div>
            )}
          </li>
          <li>
            When Home Assistant is back: <b>Settings → Devices &amp; services → Add integration</b>,
            search <b>Projector Control</b> and press <b>Submit</b>. The address is filled in for you.
          </li>
        </ol>

        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

        <p className="mt-4 text-xs text-slate-500">
          You get a Power switch, Shutter switch, Input list and temperatures for each projector,
          and GO, Pause, Stop, Blackout, Show, Jump to cue and Emergency stop for the show.
          Projector scenes appear as Home Assistant scenes. When this server is updated, Home
          Assistant offers the matching update under Settings → Updates.
        </p>
      </Panel>

      <Panel
        icon={TokenIcon}
        title="Other ways in"
        description="Installed it with HACS, or have no Terminal? Add the integration and paste the address and a key from here."
      >
        <div className="flex flex-wrap gap-2">
          <button className="btn-default" disabled={busy}
            onClick={() => void run(async () => {
              if (status.connected && !window.confirm('Make a new key? The key Home Assistant has now stops working, and Home Assistant will ask for the new one.')) return
              setLine(null)
              setKey(await api.homeAssistantKey())
            })}>
            Make a key
          </button>
          {status.connected && (
            <button className="btn-ghost text-red-300" disabled={busy}
              onClick={() => void run(async () => {
                if (!window.confirm('Disconnect Home Assistant? Its key stops working at once, and its Projector Control buttons stop doing anything until you connect it again.')) return
                setLine(null)
                setKey(null)
                await api.homeAssistantDisconnect()
                onToast('ok', 'Home Assistant disconnected')
              })}>
              Disconnect Home Assistant
            </button>
          )}
        </div>
        {key && (
          <div className="mt-3 space-y-2 rounded-md border border-yellow-500/25 bg-yellow-500/5 p-3 text-sm">
            {(key.server_address ?? status.server_address) && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-400">Server address:</span>
                <code className="font-mono text-xs text-slate-100">{key.server_address ?? status.server_address}</code>
                <button className="btn-ghost btn-sm" onClick={() => void copy((key.server_address ?? status.server_address)!, 'Address')}>
                  <CopyIcon size={13} aria-hidden /> Copy
                </button>
              </div>
            )}
            <p className="text-slate-300">Key (shown once; copy it now):</p>
            <textarea readOnly className="input h-20 font-mono text-xs" value={key.key}
              onFocus={(e) => e.currentTarget.select()} />
            <button className="btn-default btn-sm" onClick={() => void copy(key.key, 'Key')}>
              <CopyIcon size={13} aria-hidden /> Copy key
            </button>
          </div>
        )}
      </Panel>
    </div>
  )
}
