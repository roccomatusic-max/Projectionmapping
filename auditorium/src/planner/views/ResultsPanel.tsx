import type { Plan } from "../../shared/types";
import { formatArea, formatLength } from "../../shared/units";
import type { Analysis } from "../analysis";

const spanS = (pts: { x: number }[]) => Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
const spanH = (pts: { y: number }[]) => Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));

export function ResultsPanel({ plan, analysis, selectedId, onSelect }: { plan: Plan; analysis: Analysis; selectedId: string | null; onSelect: (id: string) => void }) {
  const u = plan.units;
  return (
    <div className="results">
      <table className="results-table">
        <thead>
          <tr>
            <th>Projector</th>
            <th>Wall</th>
            <th>Full image (w × h)</th>
            <th>On wall (w × h)</th>
            <th>Area</th>
            <th>Throw (centre / min–max)</th>
            <th>Incidence</th>
            <th>Keystone (near / far edge height)</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {plan.projectors.map((p) => {
            const fp = analysis.footprints.get(p.id);
            const k = fp?.keystone;
            return (
              <tr key={p.id} className={p.id === selectedId ? "selected" : ""} onClick={() => onSelect(p.id)}>
                <td>
                  <span className="swatch" style={{ background: p.color }} /> {p.name}
                  {!p.enabled && <span className="muted"> (off)</span>}
                </td>
                <td>{p.targetWall}</td>
                <td>{k ? `${formatLength(k.bounds.maxS - k.bounds.minS, u)} × ${formatLength(k.bounds.maxH - k.bounds.minH, u)}` : "—"}</td>
                <td>
                  {fp && fp.valid && fp.clipped.length
                    ? `${Math.round(fp.onWallFraction * 100)} % · ${formatLength(spanS(fp.clipped), u)} × ${formatLength(spanH(fp.clipped), u)}`
                    : "—"}
                </td>
                <td>{fp && fp.valid ? formatArea(fp.areaOnWall, u) : "—"}</td>
                <td>
                  {fp && fp.valid
                    ? `${formatLength(fp.throw.center, u)} (${formatLength(fp.throw.min, u)} – ${formatLength(fp.throw.max, u)})`
                    : "—"}
                </td>
                <td>{fp && fp.valid ? `${fp.incidenceCenterDeg.toFixed(0)}°` : "—"}</td>
                <td>{k ? `${formatLength(k.nearEdgeHeight, u)} / ${formatLength(k.farEdgeHeight, u)}` : "—"}</td>
                <td className="notes">
                  {!p.enabled && <span className="muted">Excluded.</span>}
                  {fp?.warnings.map((w, i) => (
                    <span key={i} className="warn">
                      {w}{" "}
                    </span>
                  ))}
                  {fp && fp.valid && fp.warnings.length === 0 && <span className="ok">OK</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
