import { useMemo } from "react";
import type { Plan, Projector, WallId } from "../shared/types";
import { projectFootprint, wallFrames, type Footprint, type WallFrame } from "../shared/projection";

export interface Analysis {
  frames: Record<WallId, WallFrame>;
  footprints: Map<string, Footprint>;
  byWall: Record<WallId, { projector: Projector; footprint: Footprint }[]>;
}

export function analyse(plan: Plan): Analysis {
  const frames = wallFrames(plan);
  const footprints = new Map<string, Footprint>();
  const byWall: Analysis["byWall"] = { left: [], right: [] };
  for (const p of plan.projectors) {
    if (!p.enabled) continue;
    const fp = projectFootprint(p, frames[p.targetWall]);
    footprints.set(p.id, fp);
    byWall[p.targetWall].push({ projector: p, footprint: fp });
  }
  return { frames, footprints, byWall };
}

export function useAnalysis(plan: Plan): Analysis {
  return useMemo(() => analyse(plan), [plan]);
}
