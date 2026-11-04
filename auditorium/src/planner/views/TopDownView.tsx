import { useCallback } from "react";
import type { Plan } from "../../shared/types";
import { formatLength } from "../../shared/units";
import type { Analysis } from "../analysis";
import { fitMapper, hexToRgba, useCanvas } from "./canvas";

export function TopDownView({ plan, analysis, selectedId }: { plan: Plan; analysis: Analysis; selectedId: string | null }) {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const { walls } = plan.room;
      const pts = [walls.left.front, walls.right.front, walls.right.back, walls.left.back];
      const all = [...pts, ...plan.projectors.map((p) => p.position), ...plan.audience.outline];
      const b = {
        minX: Math.min(...all.map((p) => p.x)) - 4,
        maxX: Math.max(...all.map((p) => p.x)) + 4,
        minY: Math.min(...all.map((p) => p.y)) - 6,
        maxY: Math.max(...all.map((p) => p.y)) + 4,
      };
      const m = fitMapper(b, w, h, 24);
      const P = (x: number, y: number) => m.toPx(x, y);

      // Grid every 10 ft (or 5 m in metric).
      const step = plan.units === "metric" ? 5 * 3.280839895 : 10;
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let x = Math.ceil(b.minX / step) * step; x <= b.maxX; x += step) {
        const [px] = P(x, 0);
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
        ctx.stroke();
      }
      for (let y = Math.ceil(b.minY / step) * step; y <= b.maxY; y += step) {
        const [, py] = P(0, y);
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(w, py);
        ctx.stroke();
      }

      // Room floor.
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [x, y] = P(p.x, p.y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,0.035)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Stage edge.
      ctx.strokeStyle = "#f5c344";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(...P(walls.left.front.x, walls.left.front.y));
      ctx.lineTo(...P(walls.right.front.x, walls.right.front.y));
      ctx.stroke();
      ctx.fillStyle = "#f5c344";
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "center";
      const [sx, sy] = P((walls.left.front.x + walls.right.front.x) / 2, walls.left.front.y);
      ctx.fillText("STAGE", sx, sy - 8);

      // Side walls (the projection surfaces).
      for (const id of ["left", "right"] as const) {
        const wdef = walls[id];
        ctx.strokeStyle = plan.surface.color;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(...P(wdef.front.x, wdef.front.y));
        ctx.lineTo(...P(wdef.back.x, wdef.back.y));
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "11px system-ui, sans-serif";
        const [lx, ly] = P((wdef.front.x + wdef.back.x) / 2, (wdef.front.y + wdef.back.y) / 2);
        ctx.textAlign = id === "left" ? "right" : "left";
        ctx.fillText(`${id} wall  ${formatLength(analysis.frames[id].length, plan.units)}`, lx + (id === "left" ? -10 : 10), ly);
      }

      // Audience zone.
      if (plan.audience.outline.length >= 3) {
        ctx.beginPath();
        plan.audience.outline.forEach((p, i) => {
          const [x, y] = P(p.x, p.y);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = "rgba(120,160,255,0.08)";
        ctx.fill();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(120,160,255,0.6)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
        const c = plan.audience.outline.reduce((a, p) => ({ x: a.x + p.x / plan.audience.outline.length, y: a.y + p.y / plan.audience.outline.length }), { x: 0, y: 0 });
        ctx.fillStyle = "rgba(120,160,255,0.7)";
        ctx.textAlign = "center";
        ctx.fillText("audience", ...P(c.x, c.y));
      }

      // Beams and footprints.
      const stackIndex = new Map<string, number>();
      for (const p of plan.projectors) {
        const key = `${p.position.x.toFixed(2)},${p.position.y.toFixed(2)}`;
        const idx = stackIndex.get(key) ?? 0;
        stackIndex.set(key, idx + 1);
        const fp = analysis.footprints.get(p.id);
        const isSel = p.id === selectedId;
        const alpha = isSel ? 0.22 : 0.1;
        const lens = P(p.position.x, p.position.y);
        if (fp && fp.valid) {
          // Full beam (including any spill past the wall), faint and dashed.
          const hits = fp.corners.map((c) => c!.world);
          const sorted = hits
            .map((hw) => ({ hw, ang: Math.atan2(hw.y - p.position.y, hw.x - p.position.x) }))
            .sort((u, v) => u.ang - v.ang)
            .map((o) => o.hw);
          ctx.beginPath();
          ctx.moveTo(lens[0], lens[1]);
          for (const hw of sorted) ctx.lineTo(...P(hw.x, hw.y));
          ctx.closePath();
          ctx.setLineDash([3, 4]);
          ctx.strokeStyle = hexToRgba(p.color, 0.35);
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.setLineDash([]);

          // The part that lands on the wall: solid wedge + thick bar.
          if (fp.clipped.length) {
            const frame = analysis.frames[p.targetWall];
            const sMin = Math.min(...fp.clipped.map((q) => q.x));
            const sMax = Math.max(...fp.clipped.map((q) => q.x));
            const a = { x: frame.origin.x + frame.along.x * sMin, y: frame.origin.y + frame.along.y * sMin };
            const bb = { x: frame.origin.x + frame.along.x * sMax, y: frame.origin.y + frame.along.y * sMax };
            ctx.beginPath();
            ctx.moveTo(lens[0], lens[1]);
            ctx.lineTo(...P(a.x, a.y));
            ctx.lineTo(...P(bb.x, bb.y));
            ctx.closePath();
            ctx.fillStyle = hexToRgba(p.color, alpha);
            ctx.fill();
            ctx.strokeStyle = hexToRgba(p.color, isSel ? 0.9 : 0.5);
            ctx.lineWidth = isSel ? 1.5 : 1;
            ctx.stroke();
            ctx.strokeStyle = p.color;
            ctx.lineWidth = isSel ? 9 : 7;
            ctx.beginPath();
            ctx.moveTo(...P(a.x, a.y));
            ctx.lineTo(...P(bb.x, bb.y));
            ctx.stroke();
          }
        }
        // Projector body + direction tick.
        const panR = (p.pan * Math.PI) / 180;
        const dir = { x: Math.sin(panR), y: -Math.cos(panR) };
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lens[0], lens[1]);
        ctx.lineTo(lens[0] + dir.x * 16, lens[1] + dir.y * 16);
        ctx.stroke();
        ctx.fillStyle = p.enabled ? p.color : "#666";
        ctx.beginPath();
        ctx.arc(lens[0], lens[1], isSel ? 7 : 5, 0, Math.PI * 2);
        ctx.fill();
        if (isSel) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = `${isSel ? "bold " : ""}11px system-ui, sans-serif`;
        ctx.textAlign = p.position.x < 0 ? "left" : "right";
        ctx.fillText(p.name, lens[0] + (p.position.x < 0 ? 10 : -10), lens[1] + 4 - idx * 13);
      }

      // Dimensions.
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "center";
      const fw = walls.right.front.x - walls.left.front.x;
      const bw = walls.right.back.x - walls.left.back.x;
      const [bx, by] = P((walls.left.back.x + walls.right.back.x) / 2, Math.max(walls.left.back.y, walls.right.back.y));
      ctx.fillText(`back width ${formatLength(bw, plan.units)}`, bx, by + 16);
      ctx.fillText(`front width ${formatLength(fw, plan.units)}`, sx, sy - 22);
      ctx.textAlign = "left";
      ctx.fillText(`length ${formatLength(walls.left.back.y, plan.units)}`, 8, h - 8);
      ctx.fillText(`scale: 1 square = ${plan.units === "metric" ? "5 m" : "10 ft"}`, 8, 14);
    },
    [plan, analysis, selectedId],
  );
  const ref = useCanvas(draw);
  return (
    <div className="canvas-wrap">
      <canvas ref={ref} />
    </div>
  );
}
