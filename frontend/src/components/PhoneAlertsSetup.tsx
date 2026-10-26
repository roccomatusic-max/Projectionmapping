import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { ApiError, api, type PhoneAlertTopic, type PhoneAlertsStatus } from '@/api/client'
import { Chip, Panel } from '@/components/ui'
import { AlertsIcon, CopyIcon, PhoneIcon } from '@/components/icons'
import { classNames, relativeTime } from '@/lib/format'

type Toast = (tone: 'ok' | 'fault', title: string, detail?: string) => void

const TOPICS: Array<{ id: PhoneAlertTopic; label: string; hint: string }> = [
  { id: 'hot', label: 'A projector runs hot', hint: 'The air going into it gets close to its limit, or the projector itself warns about heat.' },
  { id: 'offline', label: 'A projector stops answering or turns itself off', hint: 'Unplugged, a tripped breaker, or a shutdown nobody asked for.' },
  { id: 'minipc', label: 'A mini PC goes offline', hint: 'Its output has not reported for 3 minutes, so its projector may show nothing.' },
  { id: 'show', label: 'The show does not start on time', hint: 'Also when projectors do not turn on with it, or an automation fails.' },
  { id: 'showtime', label: 'The show starts and stops', hint: 'When it started, what is playing, and how long it ran. GO to the next cue, Pause and Resume are not sent.' },
  { id: 'other', label: 'Other projector faults', hint: 'Fan, filter, lamp and other warnings the projector reports.' },
]

/**
 * Settings → Phone alerts. iPhones only take web push from https sites and
 * this server is plain http on the home network, so alerts go through the
 * free ntfy app (no account, no key) or Pushover (a key to paste).
 */
export default function PhoneAlertsSetup({ onToast }: { onToast: Toast }) {
  const [status, setStatus] = useState<PhoneAlertsStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState('')
  const [token, setToken] = useState('')

  const load = useCallback(() => {
    api.phoneAlerts().then(setStatus).catch(() => setStatus(null))
  }, [])
  useEffect(load, [load])

  const run = async (work: () => Promise<PhoneAlertsStatus | void>) => {
    setBusy(true)
    setError(null)
    try {
      const next = await work()
      if (next) setStatus(next)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const test = () =>
    run(async () => {
      const result = await api.testPhoneAlert()
      if (result.ok) onToast('ok', 'Test sent', result.message)
      else onToast('fault', 'The test did not go out', result.message)
      return api.phoneAlerts()
    })

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      onToast('ok', 'Name copied')
    } catch {
      onToast('fault', 'Could not copy', 'Type the name into the ntfy app by hand.')
    }
  }

  const savePushover = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const next = await api.setPhoneAlerts({
        service: 'pushover', pushover_user: user.trim() || undefined, pushover_token: token.trim() || undefined,
      })
      setUser('')
      setToken('')
      return next
    })
  }

  if (!status) return null

  const chip = status.ready ? (
    <Chip tone="ok">On · {status.service === 'ntfy' ? 'ntfy' : 'Pushover'}</Chip>
  ) : (
    <Chip tone="idle">Off</Chip>
  )
  const testButton = (
    <button className="btn-primary" disabled={busy || !status.ready} onClick={() => void test()}>
      {busy ? 'Sending…' : 'Send a test'}
    </button>
  )

  return (
    <div className="space-y-4 lg:max-w-3xl">
      <Panel
        icon={PhoneIcon}
        title="Alerts on your phone"
        description="A notification on your iPhone when something goes wrong, even when the app is closed and you are away from home."
        action={chip}
      >
        <div className="seg mb-4" role="group" aria-label="Send alerts with">
          {([
            ['ntfy', 'ntfy app (free)'],
            ['pushover', 'Pushover'],
            ['off', 'Off'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              className={classNames('seg-item whitespace-nowrap px-3 py-1.5 text-sm', status.service === id && 'seg-item-active')}
              aria-pressed={status.service === id}
              disabled={busy}
              onClick={() => void run(() => api.setPhoneAlerts({ service: id }))}
            >
              {label}
            </button>
          ))}
        </div>

        {status.service === 'off' && (
          <p className="text-sm text-slate-400">
            Pick <b>ntfy app (free)</b> to start. It needs no account and no key: you install a free
            app and type in one name.
          </p>
        )}

        {status.service === 'ntfy' && (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-slate-300">
            <li>
              On your iPhone, install the free <b>ntfy</b> app from the App Store and open it. Tap{' '}
              <b>Allow</b> when it asks to send notifications.
            </li>
            <li>
              Tap <b>+</b> at the top right, type this name into <b>Topic name</b>, and tap{' '}
              <b>Subscribe</b>. Leave “Use another server” off.
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-sky-500/25 bg-sky-500/5 p-3">
                <code className="select-all font-mono text-lg tracking-wide text-slate-50">{status.ntfy_topic}</code>
                <button className="btn-default btn-sm" onClick={() => void copy(status.ntfy_topic)}>
                  <CopyIcon size={13} aria-hidden /> Copy
                </button>
              </div>
            </li>
            <li>
              Press <b>Send a test</b>. It shows up on your phone within a few seconds.
              <div className="mt-2">{testButton}</div>
            </li>
          </ol>
        )}

        {status.service === 'pushover' && (
          <form className="space-y-3" onSubmit={savePushover}>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-300">
              <li>
                Install <b>Pushover</b> on your iPhone and sign up in the app (free for 30 days, then a
                one-time purchase of about $5).
              </li>
              <li>
                Sign in at{' '}
                <a className="text-sky-300 hover:underline" href="https://pushover.net" target="_blank" rel="noreferrer">
                  pushover.net
                </a>
                , copy <b>Your User Key</b> from the top right and paste it below.
              </li>
              <li>
                Lower on that page press <b>Create an Application/API Token</b>, name it Projector
                Control, tick the box, press <b>Create Application</b>, and paste its{' '}
                <b>API Token/Key</b> below.
              </li>
              <li>Press <b>Save keys</b>, then <b>Send a test</b>.</li>
            </ol>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className="input font-mono text-sm"
                autoComplete="off"
                placeholder={status.pushover_user_hint ? `User Key …${status.pushover_user_hint} (saved)` : 'User Key'}
                value={user}
                onChange={(e) => setUser(e.target.value)}
              />
              <input
                className="input font-mono text-sm"
                type="password"
                autoComplete="off"
                placeholder={status.pushover_token_hint ? `API Token …${status.pushover_token_hint} (saved)` : 'API Token'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-default" disabled={busy || (!user.trim() && !token.trim())}>
                Save keys
              </button>
              {testButton}
            </div>
          </form>
        )}

        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

        {status.last_message && status.last_at && (
          <p className={classNames('mt-3 text-xs', status.last_ok ? 'text-slate-500' : 'text-red-300')}>
            Last notification {relativeTime(new Date(status.last_at * 1000).toISOString())}:{' '}
            {status.last_message}
          </p>
        )}
      </Panel>

      {status.service !== 'off' && (
        <Panel
          icon={AlertsIcon}
          title="What to send"
          description="Each problem is sent once when it starts, and again only if it gets worse. The Alerts page keeps the full list."
        >
          <div className="space-y-3">
            {TOPICS.map((topic) => (
              <label key={topic.id} className="flex items-start gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={status.topics[topic.id]}
                  disabled={busy}
                  onChange={(e) => void run(() => api.setPhoneAlerts({ topics: { [topic.id]: e.target.checked } }))}
                />
                <span>
                  {topic.label}
                  <span className="block text-xs text-slate-500">{topic.hint}</span>
                </span>
              </label>
            ))}
            <label className="flex items-start gap-2 border-t border-white/5 pt-3 text-sm text-slate-300">
              <input
                type="checkbox"
                className="mt-1"
                checked={status.all_clear}
                disabled={busy}
                onChange={(e) => void run(() => api.setPhoneAlerts({ all_clear: e.target.checked }))}
              />
              <span>
                Tell me when it is fixed
                <span className="block text-xs text-slate-500">An “All clear” notification once the problem goes away.</span>
              </span>
            </label>
          </div>

          {status.service === 'ntfy' && (
            <p className="mt-4 text-xs text-slate-500">
              Anyone who knows the name above could read these notifications, so keep it to yourself.
              If it got out,{' '}
              <button
                className="text-sky-300 hover:underline"
                disabled={busy}
                onClick={() => void run(async () => {
                  const next = await api.newPhoneAlertChannel()
                  onToast('ok', 'New name made', 'Subscribe to it in the ntfy app, and delete the old one there.')
                  return next
                })}
              >
                make a new name
              </button>{' '}
              and subscribe to that one instead.
            </p>
          )}
        </Panel>
      )}
    </div>
  )
}
