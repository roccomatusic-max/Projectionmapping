import { usePlan } from "../store";
import { Field, LengthInput, Section } from "./inputs";

export function AudiencePanel() {
  const { plan, update } = usePlan();
  const units = plan.units;
  const { outline, seatedHeadHeight, standingHeadHeight } = plan.audience;

  return (
    <Section title="Audience zone">
      <p className="muted small">
        The seating area, as a top-down outline. The shadow check (phase 2) flags any beam that passes through this
        area below head height.
      </p>
      <div className="grid2">
        <Field label="Seated head height">
          <LengthInput
            value={seatedHeadHeight}
            units={units}
            min={0}
            onChange={(v) =>
              update((d) => {
                d.audience.seatedHeadHeight = v;
              })
            }
          />
        </Field>
        <Field label="Standing head height">
          <LengthInput
            value={standingHeadHeight}
            units={units}
            min={0}
            onChange={(v) =>
              update((d) => {
                d.audience.standingHeadHeight = v;
              })
            }
          />
        </Field>
      </div>
      <table className="mini-table">
        <thead>
          <tr>
            <th>#</th>
            <th>x (across)</th>
            <th>y (from stage)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {outline.map((p, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>
                <LengthInput
                  value={p.x}
                  units={units}
                  onChange={(v) =>
                    update((d) => {
                      d.audience.outline[i].x = v;
                    })
                  }
                />
              </td>
              <td>
                <LengthInput
                  value={p.y}
                  units={units}
                  onChange={(v) =>
                    update((d) => {
                      d.audience.outline[i].y = v;
                    })
                  }
                />
              </td>
              <td>
                <button
                  className="btn tiny danger"
                  disabled={outline.length <= 3}
                  title="Remove point"
                  onClick={() =>
                    update((d) => {
                      d.audience.outline.splice(i, 1);
                    })
                  }
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="btn small"
        onClick={() =>
          update((d) => {
            const o = d.audience.outline;
            const a = o[o.length - 1];
            const b = o[0];
            o.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
          })
        }
      >
        + Add point
      </button>
    </Section>
  );
}
