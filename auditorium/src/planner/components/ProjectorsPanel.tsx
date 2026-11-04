import { useState } from "react";
import { defaultProjector, newId, PROJECTOR_COLORS } from "../../shared/defaults";
import type { Projector } from "../../shared/types";
import { aimAndZoom, wallFrames } from "../../shared/projection";
import { usePlan } from "../store";
import { Field, LengthInput, NumberInput, Section } from "./inputs";

export function ProjectorsPanel({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const { plan, update } = usePlan();
  const [showGuide, setShowGuide] = useState(false);

  const add = () =>
    update((d) => {
      const i = d.projectors.length;
      const p = defaultProjector({
        name: `Projector ${i + 1}`,
        targetWall: i % 2 === 0 ? "right" : "left",
        position: { x: i % 2 === 0 ? d.room.walls.left.back.x + 3 : d.room.walls.right.back.x - 3, y: d.room.walls.left.back.y - 3 },
        color: PROJECTOR_COLORS[i % PROJECTOR_COLORS.length],
      });
      d.projectors.push(p);
    });

  return (
    <>
      <Section
        title={`Projectors (${plan.projectors.length})`}
        right={
          <span className="row">
            <button className="btn small" onClick={() => setShowGuide((s) => !s)}>
              {showGuide ? "Hide guide" : "Angles guide"}
            </button>
            <button className="btn small primary" onClick={add}>
              + Add
            </button>
          </span>
        }
      >
        {showGuide && (
          <div className="card muted small">
            <p>
              <b>Position</b> x is across the room (negative = house left, 0 = centre line), y is from the stage edge
              toward the back. <b>Mount height</b> is floor to lens.
            </p>
            <p>
              <b>Pan</b> 0° faces the stage; positive turns toward house right. <b>Tilt</b> negative points down.{" "}
              <b>Roll</b> rotates the image about the lens axis. Use the <b>Aim</b> buttons to get sensible values,
              then nudge.
            </p>
            <p>
              <b>Throw ratio</b> = throw distance ÷ image width. A 1.5 lens 30 ft from the wall makes a 20 ft wide
              image. Enter your lens's zoom range and the ratio you plan to use.
            </p>
            <p>
              <b>Lens shift</b> is a fraction of the image. 0 = image centred on the lens axis. +0.5 vertical = the
              bottom edge of the image sits on the lens axis (typical "100 % offset").
            </p>
          </div>
        )}
        {plan.projectors.map((p) => (
          <ProjectorCard key={p.id} p={p} selected={p.id === selectedId} onSelect={() => onSelect(p.id === selectedId ? null : p.id)} />
        ))}
        {plan.projectors.length === 0 && <p className="muted">No projectors yet. Click + Add.</p>}
      </Section>
    </>
  );
}

function ProjectorCard({ p, selected, onSelect }: { p: Projector; selected: boolean; onSelect: () => void }) {
  const { plan, update, setStatus } = usePlan();
  const units = plan.units;
  const edit = (fn: (x: Projector) => void) =>
    update((d) => {
      const x = d.projectors.find((q) => q.id === p.id);
      if (x) fn(x);
    });

  const frames = wallFrames(plan);
  const frame = frames[p.targetWall];

  /** Aim the image centre at a point on the target wall: fraction along (0..1) and height. */
  const aim = (alongFraction: number, heightFraction = 0.5, alsoZoom = false) => {
    const r = aimAndZoom(p, frame, alongFraction, heightFraction, alsoZoom);
    edit((x) => {
      x.pan = r.pan;
      x.tilt = r.tilt;
      x.throwRatioUsed = r.throwRatioUsed;
    });
    setStatus(r.note || `Aimed ${p.name}: pan ${r.pan.toFixed(1)}°, tilt ${r.tilt.toFixed(1)}°, throw ratio ${r.throwRatioUsed}`);
  };

  return (
    <div className={`card projector-card ${selected ? "selected" : ""} ${p.enabled ? "" : "disabled"}`} style={{ borderLeftColor: p.color }}>
      <div className="row">
        <input
          type="checkbox"
          checked={p.enabled}
          title="Include in analysis"
          onChange={(e) => edit((x) => (x.enabled = e.target.checked))}
        />
        <input className="input grow" value={p.name} onChange={(e) => edit((x) => (x.name = e.target.value))} />
        <input type="color" className="input color" value={p.color} onChange={(e) => edit((x) => (x.color = e.target.value))} />
        <button className="btn tiny" title={selected ? "Collapse" : "Expand"} onClick={onSelect}>
          {selected ? "▴" : "▾"}
        </button>
      </div>
      <div className="row small muted">
        <span>
          → {p.targetWall} wall · {p.lumens} lm · {p.resolution.width}×{p.resolution.height} · T {p.throwRatioUsed}
        </span>
      </div>
      {selected && (
        <>
          <div className="grid3">
            <Field label="Position x (across)">
              <LengthInput value={p.position.x} units={units} onChange={(v) => edit((x) => (x.position.x = v))} />
            </Field>
            <Field label="Position y (from stage)">
              <LengthInput value={p.position.y} units={units} onChange={(v) => edit((x) => (x.position.y = v))} />
            </Field>
            <Field label="Mount height (lens)">
              <LengthInput value={p.mountHeight} units={units} min={0} onChange={(v) => edit((x) => (x.mountHeight = v))} />
            </Field>
            <Field label="Pan">
              <NumberInput value={p.pan} step={0.5} min={-180} max={180} suffix="°" onChange={(v) => edit((x) => (x.pan = v))} />
            </Field>
            <Field label="Tilt">
              <NumberInput value={p.tilt} step={0.5} min={-89} max={89} suffix="°" onChange={(v) => edit((x) => (x.tilt = v))} />
            </Field>
            <Field label="Roll">
              <NumberInput value={p.roll} step={0.5} min={-180} max={180} suffix="°" onChange={(v) => edit((x) => (x.roll = v))} />
            </Field>
          </div>
          <div className="row wrap">
            <span className="muted small">Aim image centre at:</span>
            <button className="btn tiny" onClick={() => aim(0.25, 0.5, true)}>
              Front half + zoom
            </button>
            <button className="btn tiny" onClick={() => aim(0.75, 0.5, true)}>
              Back half + zoom
            </button>
            <button className="btn tiny" onClick={() => aim(0.5, 0.5)}>
              Wall centre
            </button>
            <button className="btn tiny" onClick={() => aim(0.25)}>
              Front ¼
            </button>
            <button className="btn tiny" onClick={() => aim(0.75)}>
              Back ¾
            </button>
          </div>
          <div className="grid3">
            <Field label="Target wall">
              <select className="input" value={p.targetWall} onChange={(e) => edit((x) => (x.targetWall = e.target.value as Projector["targetWall"]))}>
                <option value="left">Left wall</option>
                <option value="right">Right wall</option>
              </select>
            </Field>
            <Field label="Lumens (rated)">
              <NumberInput value={p.lumens} step={100} min={100} onChange={(v) => edit((x) => (x.lumens = v))} />
            </Field>
            <Field label="Resolution">
              <span className="row">
                <NumberInput value={p.resolution.width} step={1} min={100} width={70} onChange={(v) => edit((x) => (x.resolution.width = v))} />
                <span className="muted">×</span>
                <NumberInput value={p.resolution.height} step={1} min={100} width={70} onChange={(v) => edit((x) => (x.resolution.height = v))} />
              </span>
            </Field>
            <Field label="Throw ratio range (lens zoom)">
              <span className="row">
                <NumberInput value={p.throwRatio.min} step={0.01} min={0.1} width={70} onChange={(v) => edit((x) => (x.throwRatio.min = v))} />
                <span className="muted">–</span>
                <NumberInput value={p.throwRatio.max} step={0.01} min={0.1} width={70} onChange={(v) => edit((x) => (x.throwRatio.max = v))} />
              </span>
            </Field>
            <Field label="Throw ratio used" hint="Distance ÷ image width. Clamped to the lens range.">
              <NumberInput
                value={p.throwRatioUsed}
                step={0.01}
                min={p.throwRatio.min}
                max={p.throwRatio.max}
                onChange={(v) => edit((x) => (x.throwRatioUsed = v))}
              />
            </Field>
            <Field label="Lens shift H / V" hint="Fraction of the image. 0 = centred on the lens axis. +0.5 V = bottom edge on axis.">
              <span className="row">
                <NumberInput value={p.lensShift.horizontal} step={0.05} min={-1} max={1} width={70} onChange={(v) => edit((x) => (x.lensShift.horizontal = v))} />
                <NumberInput value={p.lensShift.vertical} step={0.05} min={-1} max={1} width={70} onChange={(v) => edit((x) => (x.lensShift.vertical = v))} />
              </span>
            </Field>
          </div>
          <div className="row">
            <button
              className="btn small"
              onClick={() =>
                update((d) => {
                  const i = d.projectors.findIndex((q) => q.id === p.id);
                  const copy = structuredClone(d.projectors[i]);
                  copy.id = newId("pj");
                  copy.name = `${copy.name} (copy)`;
                  copy.color = PROJECTOR_COLORS[d.projectors.length % PROJECTOR_COLORS.length];
                  d.projectors.splice(i + 1, 0, copy);
                })
              }
            >
              Duplicate
            </button>
            <button
              className="btn small danger"
              onClick={() => {
                if (!window.confirm(`Remove "${p.name}"?`)) return;
                update((d) => {
                  d.projectors = d.projectors.filter((q) => q.id !== p.id);
                });
              }}
            >
              Remove
            </button>
          </div>
        </>
      )}
    </div>
  );
}
