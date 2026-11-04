import { useCallback } from "react";
import type { Plan, WallId } from "../../shared/types";
import { formatLength } from "../../shared/units";
import type { Analysis } from "../analysis";
import { fitMapper, hexToRgba, useCanvas } from "./canvas";

/**
 * A flattened wall as you would see it standing in the room facing it.
 * For the LEFT wall the stage is to your right; for the RIGHT wall it is to
 * your left, so the s-axis is flipped for the left wall.
 */
export function ElevationView({ plan, analysis, wall, selectedId }: { plan: Plan; analysis: Analysis; wall: WallId; selectedId: string | null }) {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const frame = analysis.frames[wall];
      const L = frame.length;
      const H = frame.height;
      const flipX = wall === "left";
      const m = fitMapper({ minX: -2, maxX: L + 2, minY: -1.5, maxY: H + 2 }, w, h, 20, true, flipX);
      const P = (s: number, z: number) => m.toPx(s, z);

      // Wall.
      const [x0, yTop] = P(0, H);
      const [x1, yBot] = P(L, 0);
      const left = Math.min(x0, x1);
      const right = Math.max(x0, x1);
      ctx.fillStyle = plan.surface.color;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(left, yTop, right - left, yBot - yTop);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1;
      ctx.strokeRect(left, yTop, right - left, yBot - yTop);

      // Height grid every 5 ft / 2 m, length grid every 10 ft / 5 m.
      const vStep = plan.units === "metric" ? 2 * 3.280839895 : 5;
      const hStep = plan.units === "metric" ? 5 * 3.280839895 : 10;
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.textAlign = "right";
      for (let z = vStep; z < H; z += vStep) {
        const [, py] = P(0, z);
        ctx.beginPath();
        ctx.moveTo(left, py);
        ctx.lineTo(right, py);
        ctx.stroke();
        ctx.fillText(formatLength(z, plan.units), left - 4, py + 3);
      }
      ctx.textAlign = "center";
      for (let s = hStep; s < L; s += hStep) {
        const [px] = P(s, 0);
        ctx.beginPath();
        ctx.moveTo(px, yTop);
        ctx.lineTo(px, yBot);
        ctx.stroke();
        ctx.fillText(formatLength(s, plan.units), px, yBot + 12);
      }
      // Floor line.
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(left, yBot);
      ctx.lineTo(right, yBot);
      ctx.stroke();

      // Stage direction labels.
      ctx.fillStyle = "#f5c344";
      ctx.font = "bold 12px system-ui, sans-serif";
      const [stageX] = P(0, 0);
      const [backX] = P(L, 0);
      ctx.textAlign = stageX < backX ? "left" : "right";
      ctx.fillText(stageX < backX ? "◀ STAGE" : "STAGE ▶", stageX, yTop - 8);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.textAlign = stageX < backX ? "right" : "left";
      ctx.fillText(stageX < backX ? "BACK ▶" : "◀ BACK", backX, yTop - 8);

      // Footprints: unclipped outline faint, clipped filled.
      for (const { projector: p, footprint: fp } of analysis.byWall[wall]) {
        const isSel = p.id === selectedId;
        if (!fp.valid) continue;
        ctx.beginPath();
        fp.polygon.forEach((q, i) => {
          const [x, y] = P(q.x, q.y);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = hexToRgba(p.color, 0.5);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);

        if (fp.clipped.length >= 3) {
          ctx.beginPath();
          fp.clipped.forEach((q, i) => {
            const [x, y] = P(q.x, q.y);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.closePath();
          ctx.fillStyle = hexToRgba(p.color, isSel ? 0.35 : 0.22);
          ctx.fill();
          ctx.strokeStyle = p.color;
          ctx.lineWidth = isSel ? 2.5 : 1.5;
          ctx.stroke();
          // Label at centroid.
          const c = fp.clipped.reduce((a, q) => ({ x: a.x + q.x / fp.clipped.length, y: a.y + q.y / fp.clipped.length }), { x: 0, y: 0 });
          const [cx, cy] = P(c.x, c.y);
          ctx.fillStyle = "#fff";
          ctx.font = `${isSel ? "bold " : ""}11px system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(p.name, cx, cy);
          if (fp.keystone) {
            ctx.fillStyle = "rgba(255,255,255,0.7)";
            ctx.font = "10px system-ui, sans-serif";
            ctx.fillText(
              `${formatLength(fp.keystone.bounds.maxS - fp.keystone.bounds.minS, plan.units)} × ${formatLength(fp.keystone.bounds.maxH - fp.keystone.bounds.minH, plan.units)}`,
              cx,
              cy + 13,
            );
          }
        }
      }

      // Obstructions on top.
      for (const o of plan.obstructions.filter((q) => q.wall === wall)) {
        const [ax, ay] = P(o.s, o.z + o.height);
        const [bx, by] = P(o.s + o.width, o.z);
        const rx = Math.min(ax, bx);
        const ry = Math.min(ay, by);
        const rw = Math.abs(bx - ax);
        const rh = Math.abs(by - ay);
        ctx.fillStyle = o.neverProject ? "rgba(255,70,70,0.45)" : "rgba(200,200,200,0.3)";
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = o.neverProject ? "#ff4646" : "rgba(220,220,220,0.8)";
        ctx.lineWidth = o.neverProject ? 2 : 1;
        ctx.strokeRect(rx, ry, rw, rh);
        if (o.neverProject) {
          // Hatch.
          ctx.save();
          ctx.beginPath();
          ctx.rect(rx, ry, rw, rh);
          ctx.clip();
          ctx.strokeStyle = "rgba(255,70,70,0.7)";
          ctx.lineWidth = 1;
          for (let d = -rh; d < rw + rh; d += 6) {
            ctx.beginPath();
            ctx.moveTo(rx + d, ry);
            ctx.lineTo(rx + d + rh, ry + rh);
            ctx.stroke();
          }
          ctx.restore();
        }
        ctx.fillStyle = "#fff";
        ctx.font = "10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(o.name, rx + rw / 2, ry - 3);
      }

      // Title.
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${wall === "left" ? "Left" : "Right"} wall · ${formatLength(L, plan.units)} long × ${formatLength(H, plan.units)} high`, 8, 16);
    },
    [plan, analysis, wall, selectedId],
  );
  const ref = useCanvas(draw);
  return (
    <div className="canvas-wrap">
      <canvas ref={ref} />
    </div>
  );
}
