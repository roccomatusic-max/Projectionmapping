import { type ReactNode, useEffect, useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import { request } from '@/api/client'
import { PageHeader, Panel } from '@/components/ui'
import { AnywhereIcon, CheckIcon, CopyIcon, PhoneIcon } from '@/components/icons'
import { classNames } from '@/lib/format'

interface NetworkInfo {
  local_only: boolean
  address: string | null
  tailscale_address: string | null
  /** The server's own system: 'mac', 'windows' or 'linux'. */
  server_os?: string
}

const TAILSCALE_MAC = 'https://tailscale.com/download/mac'
const TAILSCALE_WINDOWS = 'https://tailscale.com/download/windows'
const TAILSCALE_ANY = 'https://tailscale.com/download'
const TAILSCALE_IPHONE = 'https://tailscale.com/download/ios'

/**
 * Setting up Show Remote on a phone: one QR code to scan.
 *
 * With Tailscale on this computer and the phone, the code points at this
 * computer's Tailscale address, which the phone reaches from any internet
 * connection, privately. Without it, the code points at this computer's
 * address on the local network.
 */
export default function PhoneRemote({ embedded = false }: { embedded?: boolean }) {
  const [network, setNetwork] = useState<NetworkInfo | null>(null)

  // Tailscale may be switched on while this page is open; follow it.
  useEffect(() => {
    let alive = true
    const load = () =>
      request<NetworkInfo>('/mapping/players/network').then(
        (info) => alive && setNetwork(info),
        () => undefined,
      )
    void load()
    const timer = window.setInterval(load, 5000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  const anywhere = network?.tailscale_address ?? null
  const base = anywhere ?? network?.address ?? null
  const link = base && !network?.local_only ? `${base}/remote` : null
  // The server's own system when it says (the Windows server build), else this browser's.
  const onMac = network?.server_os ? network.server_os === 'mac' : navigator.userAgent.includes('Mac')

  return (
    <div className="space-y-5">
      {!embedded && (
        <PageHeader icon={PhoneIcon} title="Phone remote"
          subtitle="GO, pause, stop, blackout, the cue list and projector power, from your phone." />
      )}

      {network?.local_only && (
        <div className="space-y-2 rounded-xl bg-amber-500/10 p-4 text-sm text-amber-100 ring-1 ring-amber-500/30">
          <p>Your phone can’t reach Projector Control yet. Quit it and start it like this:</p>
          <p className="rounded bg-black/30 px-2 py-1 font-mono text-xs text-slate-100">
            {onMac ? './dist/ProjectorControl/ProjectorControl --lan' : 'ProjectorControl.exe --lan'}
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Panel title="1. Reach this computer from anywhere" icon={AnywhereIcon}>
            {anywhere ? (
              <p className="flex items-start gap-3 text-sm text-slate-300">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                  <CheckIcon size={13} strokeWidth={2.5} />
                </span>
                <span>
                  Tailscale is on. Your phone reaches this computer over any Wi-Fi or mobile data, privately, as long as
                  Tailscale is on in the phone too.
                </span>
              </p>
            ) : (
              <div className="space-y-3 text-sm text-slate-300">
                <p>
                  The remote works on this computer’s Wi-Fi as it is. To use it from anywhere, add Tailscale: it’s free,
                  and connects your phone to this computer privately, without opening anything to the internet.
                </p>
                <Steps
                  items={[
                    <>
                      <a className="text-sky-300 underline" href={onMac ? TAILSCALE_MAC : network?.server_os === 'windows' ? TAILSCALE_WINDOWS : TAILSCALE_ANY} target="_blank" rel="noreferrer">
                        Install Tailscale on this {onMac ? 'Mac' : 'computer'}
                      </a>{' '}
                      and sign in. A Google or Apple account works.
                    </>,
                    <>
                      <a className="text-sky-300 underline" href={TAILSCALE_IPHONE} target="_blank" rel="noreferrer">
                        Install Tailscale on your phone
                      </a>{' '}
                      from the App Store, sign in with the same account, and leave it switched on.
                    </>,
                    <>The code on this page changes to the anywhere address by itself.</>,
                  ]}
                />
              </div>
            )}
          </Panel>

          <Panel title="2. Put the remote on your phone" icon={PhoneIcon}>
            <Steps
              items={[
                <>Point the phone’s camera at the code and tap the link that appears.</>,
                <>In Safari, tap <b className="text-slate-100">Share</b>, then <b className="text-slate-100">Add to Home Screen</b>.</>,
                <>Open <b className="text-slate-100">Show Remote</b> from the Home Screen and sign in. It stays signed in.</>,
              ]}
            />
            <p className="mt-4 text-xs text-slate-500">
              This computer has to be awake with Projector Control running for the remote to reach it.
            </p>
          </Panel>
        </div>

        <Panel className="self-start">
          {link ? (
            <div className="flex flex-col items-center text-center">
              <QrCode text={link} />
              <span className={classNames('chip mt-4 ring-1',
                anywhere ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' : 'bg-sky-500/10 text-sky-300 ring-sky-500/25')}>
                {anywhere ? 'Works anywhere' : 'Works on this Wi-Fi'}
              </span>
              <CopyLink link={link} />
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">
              {network?.local_only ? 'The code appears once Projector Control is started with --lan.'
                : network ? 'This computer isn’t connected to a network.' : 'Loading…'}
            </p>
          )}
        </Panel>
      </div>
    </div>
  )
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm text-slate-300">
          <span className="tnum inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-panel-750 text-[11px] font-semibold text-slate-300">
            {i + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  )
}

function QrCode({ text }: { text: string }) {
  const { size, path } = useMemo(() => {
    const code = qrcode(0, 'M')
    code.addData(text)
    code.make()
    const count = code.getModuleCount()
    let d = ''
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (code.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`
      }
    }
    return { size: count, path: d }
  }, [text])
  const quiet = 3
  return (
    <svg viewBox={`${-quiet} ${-quiet} ${size + 2 * quiet} ${size + 2 * quiet}`} role="img" aria-label={`QR code for ${text}`}
      className="w-full max-w-[260px] rounded-2xl bg-white" shapeRendering="crispEdges">
      <path d={path} fill="#0a0c10" />
    </svg>
  )
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="mt-3 inline-flex max-w-full items-center gap-2 rounded-lg px-2 py-1 font-mono text-xs text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
      title="Copy the link"
      onClick={() => {
        void navigator.clipboard?.writeText(link).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      <span className="truncate">{link}</span>
      {copied ? <CheckIcon size={13} className="shrink-0 text-emerald-300" /> : <CopyIcon size={13} className="shrink-0" />}
    </button>
  )
}
