import { usePlan } from "../store";
import { Field, NumberInput, Section } from "./inputs";

export function SurfacePanel() {
  const { plan, update } = usePlan();
  return (
    <Section title="Wall surface">
      <div className="grid2">
        <Field label="Gain" hint="How much light the surface returns compared with a reference white. Matte white paint ≈ 0.8–1.0, off-white ≈ 0.7, light grey ≈ 0.5.">
          <NumberInput
            value={plan.surface.gain}
            step={0.05}
            min={0.05}
            max={3}
            onChange={(v) =>
              update((d) => {
                d.surface.gain = v;
              })
            }
          />
        </Field>
        <Field label="Derate" hint="Fraction of the rated lumens you expect to actually get: lamp ageing, eco mode, dirty optics. 0.8 is a sensible default.">
          <NumberInput
            value={plan.surface.derate}
            step={0.05}
            min={0.1}
            max={1}
            onChange={(v) =>
              update((d) => {
                d.surface.derate = v;
              })
            }
          />
        </Field>
        <Field label="Wall colour (for the views)">
          <input
            type="color"
            className="input color"
            value={plan.surface.color}
            onChange={(e) =>
              update((d) => {
                d.surface.color = e.target.value;
              })
            }
          />
        </Field>
      </div>
    </Section>
  );
}
