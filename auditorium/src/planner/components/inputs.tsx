import { useEffect, useState, type ReactNode } from "react";
import type { Units } from "../../shared/types";
import { formatLength, parseLength } from "../../shared/units";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <span className="field-hint" title={hint}> ⓘ</span>}
      </span>
      {children}
    </label>
  );
}

/**
 * A length in feet (internally) that the user edits in their chosen units.
 * Shows "12' 6"" or "3.81 m"; accepts anything parseLength understands.
 */
export function LengthInput({
  value,
  units,
  onChange,
  min,
  disabled,
}: {
  value: number;
  units: Units;
  onChange: (feet: number) => void;
  min?: number;
  disabled?: boolean;
}) {
  const [text, setText] = useState(formatLength(value, units, "fine"));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(formatLength(value, units, "fine"));
    setBad(false);
  }, [value, units]);

  const commit = () => {
    const parsed = parseLength(text, units);
    if (parsed === null || (min !== undefined && parsed < min)) {
      setBad(true);
      return;
    }
    setBad(false);
    if (Math.abs(parsed - value) > 1e-9) onChange(parsed);
    else setText(formatLength(value, units, "fine"));
  };

  return (
    <input
      className={`input length ${bad ? "bad" : ""}`}
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setText(formatLength(value, units, "fine"));
      }}
      title={units === "imperial" ? `Type feet and inches, e.g. 12' 6", or metres, e.g. 3.8m` : `Type metres, e.g. 3.8, or feet, e.g. 12' 6"`}
    />
  );
}

export function NumberInput({
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
  width,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  width?: number;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(roundTo(value, 3)));
  useEffect(() => setText(String(roundTo(value, 3))), [value]);
  const commit = () => {
    const v = parseFloat(text.replace(/,/g, "."));
    if (!Number.isFinite(v)) {
      setText(String(roundTo(value, 3)));
      return;
    }
    let c = v;
    if (min !== undefined) c = Math.max(min, c);
    if (max !== undefined) c = Math.min(max, c);
    if (c !== value) onChange(c);
    else setText(String(roundTo(value, 3)));
  };
  return (
    <span className="number-wrap">
      <input
        className="input number"
        style={width ? { width } : undefined}
        type="number"
        step={step}
        min={min}
        max={max}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </span>
  );
}

export function roundTo(v: number, digits: number): number {
  const m = 10 ** digits;
  return Math.round(v * m) / m;
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="section">
      <header className="section-head">
        <h3>{title}</h3>
        {right}
      </header>
      {children}
    </section>
  );
}
