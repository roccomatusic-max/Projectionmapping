import { useEffect, useRef, type RefObject } from "react";

export type DrawFn = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

/**
 * A canvas that fills its parent, is redrawn when `draw` changes, and is
 * crisp on high-DPI displays.
 */
export function useCanvas(draw: DrawFn): RefObject<HTMLCanvasElement | null> {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement!;
    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w === 0 || h === 0) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      draw(ctx, w, h);
    };
    render();
    const ro = new ResizeObserver(render);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [draw]);
  return ref;
}

/** Maps world units (feet) to canvas pixels with a uniform scale. */
export interface Mapper {
  toPx: (x: number, y: number) => [number, number];
  scale: number;
}

export function fitMapper(
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  width: number,
  height: number,
  margin: number,
  flipY = false,
  flipX = false,
): Mapper {
  const bw = Math.max(1e-6, bounds.maxX - bounds.minX);
  const bh = Math.max(1e-6, bounds.maxY - bounds.minY);
  const scale = Math.min((width - 2 * margin) / bw, (height - 2 * margin) / bh);
  const ox = (width - bw * scale) / 2;
  const oy = (height - bh * scale) / 2;
  return {
    scale,
    toPx: (x, y) => {
      const px = flipX ? ox + (bounds.maxX - x) * scale : ox + (x - bounds.minX) * scale;
      const py = flipY ? oy + (bounds.maxY - y) * scale : oy + (y - bounds.minY) * scale;
      return [px, py];
    },
  };
}

export function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
