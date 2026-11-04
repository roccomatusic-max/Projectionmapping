import { newId } from "../../shared/defaults";
import type { Obstruction, WallId } from "../../shared/types";
import { usePlan } from "../store";
import { LengthInput, Section } from "./inputs";

const KINDS: Obstruction["kind"][] = ["exit-sign", "door", "speaker", "sconce", "other"];

export function ObstructionsPanel() {
  const { plan, update } = usePlan();
  const units = plan.units;

  const add = (wall: WallId) =>
    update((d) => {
      d.obstructions.push({
        id: newId("ob"),
        wall,
        name: "New obstruction",
        kind: "other",
        s: 10,
        z: 5,
        width: 2,
        height: 2,
        neverProject: false,
      });
    });

  const edit = (id: string, fn: (o: Obstruction) => void) =>
    update((d) => {
      const o = d.obstructions.find((x) => x.id === id);
      if (o) fn(o);
    });

  return (
    <>
      {(["left", "right"] as const).map((wall) => (
        <Section
          key={wall}
          title={`${wall === "left" ? "Left" : "Right"} wall obstructions`}
          right={
            <button className="btn small" onClick={() => add(wall)}>
              + Add
            </button>
          }
        >
          <p className="muted small">
            "From stage end" is the distance along the wall from its stage end to the edge of the item nearest the stage.
            "Bottom height" is floor to the item's bottom edge.
          </p>
          {plan.obstructions.filter((o) => o.wall === wall).length === 0 && <p className="muted small">None yet.</p>}
          {plan.obstructions
            .filter((o) => o.wall === wall)
            .map((o) => (
              <div key={o.id} className="card">
                <div className="row">
                  <input
                    className="input grow"
                    value={o.name}
                    onChange={(e) => edit(o.id, (x) => (x.name = e.target.value))}
                  />
                  <select className="input" value={o.kind} onChange={(e) => edit(o.id, (x) => (x.kind = e.target.value as Obstruction["kind"]))}>
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn tiny danger"
                    title="Remove"
                    onClick={() =>
                      update((d) => {
                        d.obstructions = d.obstructions.filter((x) => x.id !== o.id);
                      })
                    }
                  >
                    ✕
                  </button>
                </div>
                <div className="grid4">
                  <label className="field">
                    <span className="field-label">From stage end</span>
                    <LengthInput value={o.s} units={units} onChange={(v) => edit(o.id, (x) => (x.s = v))} />
                  </label>
                  <label className="field">
                    <span className="field-label">Bottom height</span>
                    <LengthInput value={o.z} units={units} min={0} onChange={(v) => edit(o.id, (x) => (x.z = v))} />
                  </label>
                  <label className="field">
                    <span className="field-label">Width</span>
                    <LengthInput value={o.width} units={units} min={0.01} onChange={(v) => edit(o.id, (x) => (x.width = v))} />
                  </label>
                  <label className="field">
                    <span className="field-label">Height</span>
                    <LengthInput value={o.height} units={units} min={0.01} onChange={(v) => edit(o.id, (x) => (x.height = v))} />
                  </label>
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={o.neverProject}
                    onChange={(e) => edit(o.id, (x) => (x.neverProject = e.target.checked))}
                  />
                  Never project here (exit signs). Footprints touching this are flagged, and the Player masks it black.
                </label>
              </div>
            ))}
        </Section>
      ))}
    </>
  );
}
