import { useState } from "react";
import { trapezoidWalls } from "../../shared/defaults";
import { usePlan } from "../store";
import { Field, LengthInput, Section } from "./inputs";

export function RoomPanel() {
  const { plan, update } = usePlan();
  const { walls, wallHeight } = plan.room;
  const units = plan.units;
  const [advanced, setAdvanced] = useState(false);

  // Derived trapezoid numbers (what the user thinks in).
  const frontWidth = walls.right.front.x - walls.left.front.x;
  const backWidth = walls.right.back.x - walls.left.back.x;
  const length = (walls.left.back.y + walls.right.back.y) / 2 - (walls.left.front.y + walls.right.front.y) / 2;
  const symmetric =
    Math.abs(walls.left.front.x + walls.right.front.x) < 1e-6 &&
    Math.abs(walls.left.back.x + walls.right.back.x) < 1e-6 &&
    Math.abs(walls.left.front.y) < 1e-6 &&
    Math.abs(walls.right.front.y) < 1e-6 &&
    Math.abs(walls.left.back.y - walls.right.back.y) < 1e-6;

  const setTrapezoid = (fw: number, bw: number, len: number) =>
    update((d) => {
      d.room.walls = trapezoidWalls(fw, bw, len);
    });

  return (
    <>
      <Section title="Room (top-down trapezoid)">
        <p className="muted small">
          Stage edge is at the top of the top-down view. Widths are wall-to-wall; length is from the stage edge to the back
          wall. Walls are angled when the back width differs from the front.
        </p>
        {!symmetric && (
          <p className="warn small">
            Wall endpoints have been edited by hand, so the room is not a symmetric trapezoid. Changing a width or the
            length below will rebuild it symmetrically.
          </p>
        )}
        <div className="grid2">
          <Field label="Front width (at stage)">
            <LengthInput value={frontWidth} units={units} min={1} onChange={(v) => setTrapezoid(v, backWidth, length)} />
          </Field>
          <Field label="Back width">
            <LengthInput value={backWidth} units={units} min={1} onChange={(v) => setTrapezoid(frontWidth, v, length)} />
          </Field>
          <Field label="Length (stage edge → back wall)">
            <LengthInput value={length} units={units} min={1} onChange={(v) => setTrapezoid(frontWidth, backWidth, v)} />
          </Field>
          <Field label="Wall height">
            <LengthInput
              value={wallHeight}
              units={units}
              min={1}
              onChange={(v) =>
                update((d) => {
                  d.room.wallHeight = v;
                })
              }
            />
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            className="input"
            rows={2}
            value={plan.room.notes ?? ""}
            placeholder="e.g. measured with laser 3 Nov; back wall has a 2 ft soffit"
            onChange={(e) =>
              update((d) => {
                d.room.notes = e.target.value;
              })
            }
          />
        </Field>
      </Section>

      <Section
        title="Wall endpoints (advanced)"
        right={
          <button className="btn small" onClick={() => setAdvanced((a) => !a)}>
            {advanced ? "Hide" : "Edit"}
          </button>
        }
      >
        {advanced ? (
          <>
            <p className="muted small">
              Move each wall's two ends to match the real room. x is across the room (negative = house left), y is from
              the stage edge toward the back.
            </p>
            {(["left", "right"] as const).map((w) => (
              <div key={w} className="endpoint-row">
                <strong>{w === "left" ? "Left wall" : "Right wall"}</strong>
                {(["front", "back"] as const).map((end) => (
                  <div key={end} className="endpoint">
                    <span className="muted small">{end === "front" ? "stage end" : "back end"}</span>
                    <LengthInput
                      value={walls[w][end].x}
                      units={units}
                      onChange={(v) =>
                        update((d) => {
                          d.room.walls[w][end].x = v;
                        })
                      }
                    />
                    <LengthInput
                      value={walls[w][end].y}
                      units={units}
                      onChange={(v) =>
                        update((d) => {
                          d.room.walls[w][end].y = v;
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            ))}
          </>
        ) : (
          <p className="muted small">Only needed if the room is not a clean symmetric trapezoid.</p>
        )}
      </Section>
    </>
  );
}
