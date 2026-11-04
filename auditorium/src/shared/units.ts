import type { Units } from "./types";

export const FEET_PER_METER = 3.280839895;
export const METERS_PER_FOOT = 0.3048;

/** Format a length stored in feet for display in the chosen unit system. */
export function formatLength(feet: number, units: Units, precision: "normal" | "fine" = "normal"): string {
  if (!Number.isFinite(feet)) return "—";
  if (units === "metric") {
    const m = feet * METERS_PER_FOOT;
    if (Math.abs(m) < 0.9995) return `${(m * 100).toFixed(precision === "fine" ? 1 : 0)} cm`;
    return `${m.toFixed(precision === "fine" ? 3 : 2)} m`;
  }
  const sign = feet < 0 ? "-" : "";
  const abs = Math.abs(feet);
  let whole = Math.floor(abs);
  let inches = (abs - whole) * 12;
  if (precision === "normal") {
    inches = Math.round(inches);
    if (inches === 12) {
      whole += 1;
      inches = 0;
    }
    return `${sign}${whole}' ${inches}"`;
  }
  const inchStr = inches.toFixed(1).replace(/\.0$/, "");
  if (inchStr === "12") return `${sign}${whole + 1}' 0"`;
  return `${sign}${whole}' ${inchStr}"`;
}

/**
 * Parse what a person types into a length field and return FEET.
 * Accepts:  12   12.5   12'   12' 6"   12'6   12 ft 6 in   150"   3.8m   380cm   3800mm
 * A bare number is taken in the current unit system (feet or metres).
 * Returns null if it cannot be understood.
 */
export function parseLength(text: string, units: Units): number | null {
  const t = text.trim().toLowerCase().replace(/,/g, ".");
  if (!t) return null;

  // Explicit metric.
  let m = t.match(/^(-?\d*\.?\d+)\s*(mm|cm|m)$/);
  if (m) {
    const v = parseFloat(m[1]);
    const f = m[2] === "mm" ? v / 1000 : m[2] === "cm" ? v / 100 : v;
    return f * FEET_PER_METER;
  }
  // Feet and inches: 12' 6", 12'6, 12 ft 6 in, 12ft
  m = t.match(/^(-?\d*\.?\d+)\s*(?:'|ft|feet|foot)\s*(?:(\d*\.?\d+)\s*(?:"|''|in|inches|inch)?)?$/);
  if (m) {
    const ft = parseFloat(m[1]);
    const inch = m[2] ? parseFloat(m[2]) : 0;
    return ft < 0 ? ft - inch / 12 : ft + inch / 12;
  }
  // Inches only: 150", 150 in
  m = t.match(/^(-?\d*\.?\d+)\s*(?:"|''|in|inches|inch)$/);
  if (m) return parseFloat(m[1]) / 12;
  // Bare number: current units.
  m = t.match(/^(-?\d*\.?\d+)$/);
  if (m) {
    const v = parseFloat(m[1]);
    return units === "metric" ? v * FEET_PER_METER : v;
  }
  return null;
}

/** Area in the display units: square feet or square metres. */
export function formatArea(sqft: number, units: Units): string {
  if (units === "metric") return `${(sqft * METERS_PER_FOOT * METERS_PER_FOOT).toFixed(1)} m²`;
  return `${sqft.toFixed(0)} ft²`;
}
