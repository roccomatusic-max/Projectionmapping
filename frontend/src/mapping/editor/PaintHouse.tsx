import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Chip, Panel } from '@/components/ui'
import { mappingApi, mediaUrl } from '../api'
import type { AiStatus, MediaAsset, Show } from '../types'
import { straightenedPhoto } from './ScenePreview'

/** Longest side sent for painting; the server asks for 2048 back. */
const SEND_SIDE = 2048

/** A picture of the house, the canvas's shape, as a base64 JPEG. */
async function sourcePicture(show: Show, source: string): Promise<string> {
  let img: HTMLImageElement | null
  if (source === 'camera') {
    img = await straightenedPhoto(show, Date.now())
    if (!img) throw new Error('Could not get a photo from the camera. Check it on the Camera tab.')
  } else {
    img = new Image()
    img.src = mediaUrl(Number(source))
    await img.decode()
  }
  const aspect = show.canvas_width / show.canvas_height
  const width = Math.min(SEND_SIDE, Math.max(img.naturalWidth, 512))
  const canvas = document.createElement('canvas')
  canvas.width = aspect >= 1 ? width : Math.round(width * aspect)
  canvas.height = aspect >= 1 ? Math.round(width / aspect) : width
  // Stretched to the canvas: the picture is taken to be the canvas's view of the building.
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.92)
}

/**
 * Paint the house with AI (Beta): a photo of the building, lined up with
 * the canvas, is repainted as described ("a gingerbread house") and added
 * to the scene as a picture layer, under the live effects.
 */
export function PaintHouse({
  show,
  media,
  busy,
  onPainted,
  onError,
}: {
  show: Show
  media: MediaAsset[]
  busy: boolean
  onPainted: (asset: MediaAsset, prompt: string) => Promise<void>
  onError: (message: string | null) => void
}) {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const images = useMemo(() => media.filter((m) => m.kind === 'image' && !m.name.startsWith('Painted: ')), [media])
  const [source, setSource] = useState<string>(() => (show.camera_view ? 'camera' : images[0] ? String(images[0].id) : ''))
  const [prompt, setPrompt] = useState('')
  const [painting, setPainting] = useState(false)

  useEffect(() => {
    mappingApi.paintStatus().then(setStatus).catch(() => setStatus(null))
  }, [])
  useEffect(() => {
    if (!source && (show.camera_view || images[0])) setSource(show.camera_view ? 'camera' : String(images[0].id))
  }, [show.camera_view, images, source])

  const paint = async () => {
    setPainting(true)
    onError(null)
    try {
      const image = await sourcePicture(show, source)
      const asset = await mappingApi.paintHouse({ prompt: prompt.trim(), image, show_id: show.id })
      await onPainted(asset, prompt.trim())
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Painting failed')
    } finally {
      setPainting(false)
    }
  }

  if (!status) return null
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          Paint the house <Chip tone="busy">Beta</Chip>
        </span>
      }
      description="An AI repaints a photo of your house as you describe it, lined up with the real walls, and starts a scene with it. Add live effects on top."
    >
      {!status.available ? (
        <p className="text-xs text-slate-400">
          Add an OpenAI API key in{' '}
          <Link className="text-sky-300 hover:underline" to="/settings?part=ai">
            Settings → AI keys
          </Link>{' '}
          to paint pictures of your house.
        </p>
      ) : !source ? (
        <p className="text-xs text-slate-400">
          This needs a photo of the house lined up with the show's picture: take one on the Camera tab, or upload a photo
          of the house the same shape as the show's picture (Saved maps and show) to the media library.
        </p>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (prompt.trim().length >= 3) void paint()
          }}
        >
          <label className="block">
            <span className="label">Photo of the house</span>
            <select className="input py-1 text-sm" value={source} disabled={painting} onChange={(e) => setSource(e.target.value)}>
              {show.camera_view && <option value="camera">Camera photo (lined up on the Camera tab)</option>}
              {images.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <textarea
            className="input min-h-0 text-sm"
            rows={3}
            maxLength={2000}
            placeholder="A gingerbread house with white icing on the roof, gumdrops and candy-cane trim"
            value={prompt}
            disabled={painting}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <button className="btn-primary px-3 py-1 text-xs" disabled={painting || busy || prompt.trim().length < 3}>
              {painting ? 'Painting…' : 'Paint'}
            </button>
            <span className="text-xs text-slate-500">
              {painting ? 'This takes up to two minutes.' : 'Roughly 20 to 40 cents a picture.'}
            </span>
          </div>
        </form>
      )}
    </Panel>
  )
}
