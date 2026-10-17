import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { Chip, Panel } from '@/components/ui'
import { mappingApi } from '@/mapping/api'
import type { AiStatus } from '@/mapping/types'

/**
 * The optional AI keys behind Mapping → Scenes: Anthropic for "Describe a
 * scene", OpenAI for "Paint the house" (Beta). Scenes work fully without
 * either. Keys stay on the server (in private files beside the media folder)
 * and are never shown again.
 */
export default function SceneAiKey() {
  return (
    <>
      <KeyCard
        title="Scene ideas from Claude"
        description="Optional. With an Anthropic API key, Mapping → Scenes can build a scene from a sentence. Everything else works without it."
        env="ANTHROPIC_API_KEY"
        placeholder="sk-ant-…"
        steps={
          <>
            <li>
              Open{' '}
              <a className="text-sky-300 hover:underline" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                console.anthropic.com → API keys
              </a>{' '}
              (sign up and add a little credit under Billing first if you are new).
            </li>
            <li>Click Create key, copy it, and paste it here. Each scene costs a few cents.</li>
          </>
        }
        load={mappingApi.aiStatus}
        save={mappingApi.setAiKey}
        remove={mappingApi.removeAiKey}
      />
      <KeyCard
        title="House painting from OpenAI"
        beta
        description="Optional. With an OpenAI API key, Mapping → Scenes can repaint a photo of your house (a gingerbread house, a haunted house…) lined up with the real walls."
        env="OPENAI_API_KEY"
        placeholder="sk-proj-…"
        steps={
          <>
            <li>
              Open{' '}
              <a className="text-sky-300 hover:underline" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
                platform.openai.com → API keys
              </a>{' '}
              (sign up and add a little credit under Billing first if you are new).
            </li>
            <li>Click Create new secret key, copy it, and paste it here. Each picture costs roughly 20 to 40 cents.</li>
            <li>If painting says your organization must be verified, OpenAI asks for that once under Settings → Organization.</li>
          </>
        }
        load={mappingApi.paintStatus}
        save={mappingApi.setPaintKey}
        remove={mappingApi.removePaintKey}
      />
    </>
  )
}

function KeyCard({
  title,
  beta = false,
  description,
  env,
  placeholder,
  steps,
  load,
  save,
  remove,
}: {
  title: string
  beta?: boolean
  description: string
  env: string
  placeholder: string
  steps: ReactNode
  load: () => Promise<AiStatus>
  save: (key: string) => Promise<AiStatus>
  remove: () => Promise<AiStatus>
}) {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    load().then(setStatus).catch(() => setStatus(null))
  }, [load])

  const run = async (work: () => Promise<AiStatus>, failed: string) => {
    setBusy(true)
    setError(null)
    try {
      setStatus(await work())
      setKey('')
    } catch (err) {
      setError(err instanceof Error ? err.message : failed)
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run(() => save(key.trim()), 'Saving the key failed')
  }

  if (!status) return null
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {title}
          {beta && <Chip tone="busy">Beta</Chip>}
        </span>
      }
      description={description}
      action={status.available ? <Chip tone="ok">On · key …{status.key_hint}</Chip> : <Chip tone="idle">Off</Chip>}
    >
      {status.source === 'environment' ? (
        <p className="text-sm text-slate-400">The key comes from this server's {env} setting.</p>
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-400">{steps}</ol>
          <div className="flex flex-wrap gap-2">
            <input
              className="input max-w-md flex-1 font-mono text-sm"
              type="password"
              autoComplete="off"
              placeholder={status.available ? 'Paste a new key to replace it' : placeholder}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button className="btn-primary" disabled={busy || key.trim().length < 20}>
              {busy ? 'Checking…' : 'Save key'}
            </button>
            {status.available && (
              <button type="button" className="btn-ghost text-red-300" disabled={busy}
                onClick={() => void run(remove, 'Removing the key failed')}>
                Remove key
              </button>
            )}
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
        </form>
      )}
    </Panel>
  )
}
