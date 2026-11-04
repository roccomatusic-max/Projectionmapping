import { describe, expect, it } from "vitest";
import { clipPolygon, intersectRayPlane, pointInPolygon, polygonArea, segmentCrossesPrism, v3 } from "../src/shared/geometry";

describe("ray–plane intersection", () => {
  const plane = { point: v3(10, 0, 0), normal: v3(-1, 0, 0) };

  it("hits a wall straight ahead at the expected distance", () => {
    const hit = intersectRayPlane({ origin: v3(0, 0, 0), dir: v3(1, 0, 0) }, plane);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(10);
    expect(hit!.point).toEqual(v3(10, 0, 0));
  });

  it("hits at 45° with distance 10·√2", () => {
    const d = Math.SQRT1_2;
    const hit = intersectRayPlane({ origin: v3(0, 0, 0), dir: v3(d, d, 0) }, plane);
    expect(hit!.t).toBeCloseTo(10 * Math.SQRT2);
    expect(hit!.point.y).toBeCloseTo(10);
  });

  it("returns null when parallel to the plane", () => {
    expect(intersectRayPlane({ origin: v3(0, 0, 0), dir: v3(0, 1, 0) }, plane)).toBeNull();
  });

  it("returns null when the plane is behind the ray", () => {
    expect(intersectRayPlane({ origin: v3(0, 0, 0), dir: v3(-1, 0, 0) }, plane)).toBeNull();
  });
});

describe("polygons", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];

  it("shoelace area of a 4×4 square is 16", () => {
    expect(polygonArea(square)).toBe(16);
  });

  it("point in polygon", () => {
    expect(pointInPolygon({ x: 1, y: 1 }, square)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 1 }, square)).toBe(false);
  });

  it("clipping a square half off the clip region keeps half the area", () => {
    const shifted = square.map((p) => ({ x: p.x + 2, y: p.y }));
    const clipped = clipPolygon(shifted, square);
    expect(polygonArea(clipped)).toBeCloseTo(8);
  });

  it("clipping a square fully inside leaves it unchanged in area", () => {
    const small = [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
    ];
    expect(polygonArea(clipPolygon(small, square))).toBeCloseTo(1);
  });

  it("clipping a square fully outside gives nothing", () => {
    const far = square.map((p) => ({ x: p.x + 10, y: p.y }));
    expect(clipPolygon(far, square)).toHaveLength(0);
  });
});

describe("shadow prism test", () => {
  const seats = [
    { x: -10, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 30 },
    { x: -10, y: 30 },
  ];
  it("a beam that passes high over the seats is clear", () => {
    expect(segmentCrossesPrism(v3(0, 40, 14), v3(0, 0, 10), seats, 4)).toBe(false);
  });
  it("a beam that dips to head height over the seats is blocked", () => {
    expect(segmentCrossesPrism(v3(0, 40, 14), v3(0, 0, 0), seats, 4)).toBe(true);
  });
  it("a low beam that never passes over the seats is clear", () => {
    expect(segmentCrossesPrism(v3(20, 40, 14), v3(20, 0, 2), seats, 4)).toBe(false);
  });
});
