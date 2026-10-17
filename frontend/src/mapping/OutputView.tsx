import { useEffect, useRef, useState } from 'react'
import type { ServerClock } from './live'
import type { Frame, Playback } from './playback'
import { OutputRenderer } from './renderer'
import type { Output } from './types'

export interface FrameStats {
  fps: number
  drift: number | null
}

/**
 * A canvas rendering one output, live.
 *
 * ``pixelSize`` fixes the drawing buffer (the projector's native raster in
 * the output window); without it the buffer follows the element's size,
 * which is what the editor preview wants.
 */
export function OutputView({
  output,
  canvasWidth,
  canvasHeight,
  playback,
  clock,
  pixelSize,
  className,
  onStats,
}: {
  output: Output
  canvasWidth: number
  canvasHeight: number
  playback: Playback
  clock: ServerClock
  pixelSize?: [number, number]
  className?: string
  onStats?: (stats: FrameStats) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<OutputRenderer | null>(null)
  const latest = useRef({ output, canvasWidth, canvasHeight, onStats })
  latest.current = { output, canvasWidth, canvasHeight, onStats }
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    let renderer: OutputRenderer
    try {
      renderer = new OutputRenderer(canvas, pixelSize ? 4096 : 1024)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'WebGL is unavailable')
      return
    }
    rendererRef.current = renderer
    let raf = 0
    let frames = 0
    let since = performance.now()
    let lastFrame: Frame | null = null

    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!pixelSize) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
        const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
        }
      }
      const { output: current, canvasWidth: cw, canvasHeight: ch } = latest.current
      renderer.setOutput(current, cw, ch)
      const frame = playback.frame(clock.now())
      lastFrame = frame
      renderer.setSource('a', frame.a)
      renderer.setSource('b', frame.b)
      renderer.render({ mix: frame.mix, blackout: frame.blackout })
      frames++
      const now = performance.now()
      if (now - since >= 1000) {
        latest.current.onStats?.({ fps: (frames * 1000) / (now - since), drift: lastFrame?.drift ?? null })
        frames = 0
        since = now
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      renderer.dispose()
      rendererRef.current = null
    }
    // The renderer is built once per canvas; inputs flow through ``latest``.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback, clock, pixelSize?.[0], pixelSize?.[1]])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas && pixelSize) {
      canvas.width = pixelSize[0]
      canvas.height = pixelSize[1]
    }
  }, [pixelSize?.[0], pixelSize?.[1]]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className={className}>
        <p className="p-4 text-sm text-red-300">{error}</p>
      </div>
    )
  }
  return <canvas ref={canvasRef} className={className} />
}
