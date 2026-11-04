import { describe, expect, it } from "vitest";
import { formatLength, parseLength } from "../src/shared/units";

describe("parseLength", () => {
  it.each([
    ["12", 12],
    ["12.5", 12.5],
    ["12'", 12],
    [`12' 6"`, 12.5],
    ["12'6", 12.5],
    ["12 ft 6 in", 12.5],
    [`150"`, 12.5],
    ["3.8m", 3.8 * 3.280839895],
    ["380cm", 3.8 * 3.280839895],
    ["3800 mm", 3.8 * 3.280839895],
  ])("%s → %d ft (imperial)", (text, feet) => {
    expect(parseLength(text, "imperial")).toBeCloseTo(feet, 5);
  });
  it("a bare number in metric mode is metres", () => {
    expect(parseLength("2", "metric")).toBeCloseTo(6.5617, 3);
  });
  it("rejects nonsense", () => {
    expect(parseLength("abc", "imperial")).toBeNull();
    expect(parseLength("", "imperial")).toBeNull();
  });
});

describe("formatLength", () => {
  it("formats feet and inches", () => {
    expect(formatLength(12.5, "imperial")).toBe(`12' 6"`);
    expect(formatLength(11.99, "imperial")).toBe(`12' 0"`);
  });
  it("formats metres", () => {
    expect(formatLength(3.280839895, "metric")).toBe("1.00 m");
    expect(formatLength(1, "metric")).toBe("30 cm");
  });
});
