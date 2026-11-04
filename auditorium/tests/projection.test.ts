import { describe, expect, it } from "vitest";
import { defaultProjector } from "../src/shared/defaults";
import { v3 } from "../src/shared/geometry";
import {
  aimAt,
  aimImageCentreAt,
  castToWall,
  projectFootprint,
  projectorBasis,
  sampleFootprint,
  wallFrame,
} from "../src/shared/projection";

// A straight (not angled) right-hand wall at x = 10, running from y = 0 to y = 40, 20 ft tall.
const straightRightWall = wallFrame("right", { front: { x: 10, y: 0 }, back: { x: 10, y: 40 } }, 20);

describe("wall frame", () => {
  it("has its normal pointing into the room", () => {
    expect(straightRightWall.normal.x).toBeCloseTo(-1);
    expect(straightRightWall.length).toBeCloseTo(40);
  });
  it("handles an angled wall", () => {
    const f = wallFrame("left", { front: { x: -30, y: 0 }, back: { x: -36, y: 80 } }, 20);
    expect(f.length).toBeCloseTo(Math.hypot(6, 80));
    expect(f.normal.x).toBeGreaterThan(0); // points toward x = 0
    expect(f.normal.z).toBeCloseTo(0);
  });
});

describe("projector basis", () => {
  it("pan 0 faces the stage (−y)", () => {
    const b = projectorBasis(0, 0, 0);
    expect(b.forward.y).toBeCloseTo(-1);
    expect(b.right.x).toBeCloseTo(1);
    expect(b.up.z).toBeCloseTo(1);
  });
  it("pan +90 faces house right (+x)", () => {
    const b = projectorBasis(90, 0, 0);
    expect(b.forward.x).toBeCloseTo(1);
    expect(b.forward.y).toBeCloseTo(0);
  });
  it("tilt −30 points downward", () => {
    const b = projectorBasis(0, -30, 0);
    expect(b.forward.z).toBeCloseTo(-0.5);
    expect(b.up.z).toBeCloseTo(Math.cos(Math.PI / 6));
  });
});

describe("footprint, head-on", () => {
  // Hand check: throw ratio 2.0, 10 ft from the wall → image 5 ft wide.
  // 1920×1200 is 16:10, so the image is 5 × 0.625 = 3.125 ft tall. Area 15.625 ft².
  const pj = defaultProjector({
    name: "test",
    targetWall: "right",
    position: { x: 0, y: 20 },
    mountHeight: 10,
    pan: 90,
    throwRatio: { min: 1, max: 3 },
    throwRatioUsed: 2,
  });
  const fp = projectFootprint(pj, straightRightWall);

  it("is valid and fully on the wall", () => {
    expect(fp.valid).toBe(true);
    expect(fp.onWallFraction).toBeCloseTo(1);
    expect(fp.warnings).toHaveLength(0);
  });
  it("is 5 ft wide and 3.125 ft tall, centred on the lens height", () => {
    expect(fp.keystone!.bottomWidth).toBeCloseTo(5);
    expect(fp.keystone!.topWidth).toBeCloseTo(5);
    expect(fp.keystone!.nearEdgeHeight).toBeCloseTo(3.125);
    expect(fp.keystone!.bounds.minS).toBeCloseTo(17.5);
    expect(fp.keystone!.bounds.maxS).toBeCloseTo(22.5);
    expect(fp.keystone!.bounds.minH).toBeCloseTo(10 - 1.5625);
    expect(fp.keystone!.bounds.maxH).toBeCloseTo(10 + 1.5625);
  });
  it("has the expected area, throw and incidence", () => {
    expect(fp.areaOnWall).toBeCloseTo(15.625);
    expect(fp.throw.center).toBeCloseTo(10);
    expect(fp.incidenceCenterDeg).toBeCloseTo(0);
  });
  it("sampled pixel density is 1920 px / 5 ft = 384 px per foot everywhere", () => {
    const samples = sampleFootprint(pj, straightRightWall, 8);
    expect(samples).toHaveLength(64);
    for (const s of samples) expect(s.pixelsPerFoot).toBeCloseTo(384, 0);
    const total = samples.reduce((acc, s) => acc + s.cellArea, 0);
    expect(total).toBeCloseTo(15.625, 3);
  });
});

describe("footprint, oblique (keystone)", () => {
  // Lens at the stage end, 45° to the wall. Distance to the wall along the axis is 10·√2.
  const pj = defaultProjector({
    name: "oblique",
    targetWall: "right",
    position: { x: 0, y: 10 },
    mountHeight: 10,
    pan: 45,
    throwRatio: { min: 1, max: 3 },
    throwRatioUsed: 2,
  });
  const fp = projectFootprint(pj, straightRightWall);

  it("hits the wall at 45° incidence with throw 10·√2", () => {
    expect(fp.valid).toBe(true);
    expect(fp.incidenceCenterDeg).toBeCloseTo(45);
    expect(fp.throw.center).toBeCloseTo(10 * Math.SQRT2);
  });
  it("the far edge of the image is taller than the near edge", () => {
    expect(fp.keystone!.farEdgeHeight).toBeGreaterThan(fp.keystone!.nearEdgeHeight);
  });
  it("the image is stretched along the wall (wider than 1/T × distance)", () => {
    const widthHeadOn = (10 * Math.SQRT2) / 2;
    expect(fp.keystone!.bottomWidth).toBeGreaterThan(widthHeadOn);
  });
});

describe("lens shift", () => {
  it("+50 % vertical shift puts the bottom edge of the image at lens height", () => {
    const pj = defaultProjector({
      name: "shift",
      targetWall: "right",
      position: { x: 0, y: 20 },
      mountHeight: 10,
      pan: 90,
      throwRatio: { min: 1, max: 3 },
      throwRatioUsed: 2,
      lensShift: { horizontal: 0, vertical: 0.5 },
    });
    const fp = projectFootprint(pj, straightRightWall);
    expect(fp.keystone!.bounds.minH).toBeCloseTo(10);
    expect(fp.keystone!.bounds.maxH).toBeCloseTo(13.125);
  });
});

describe("spill and misses", () => {
  it("an image half above the top of the wall reports 50 % on the wall", () => {
    const pj = defaultProjector({
      name: "spill",
      targetWall: "right",
      position: { x: 0, y: 20 },
      mountHeight: 20, // lens level with the top of a 20 ft wall → image centre at the top edge
      pan: 90,
      throwRatio: { min: 1, max: 3 },
      throwRatioUsed: 2,
    });
    const fp = projectFootprint(pj, straightRightWall);
    expect(fp.onWallFraction).toBeCloseTo(0.5);
    expect(fp.warnings.some((w) => w.includes("spills"))).toBe(true);
  });
  it("a projector facing away from the wall is invalid", () => {
    const pj = defaultProjector({ name: "away", targetWall: "right", position: { x: 0, y: 20 }, pan: -90 });
    const fp = projectFootprint(pj, straightRightWall);
    expect(fp.valid).toBe(false);
    expect(fp.clipped).toHaveLength(0);
  });
});

describe("aiming helpers", () => {
  it("aimAt gives pan 45 for a target to the front-right", () => {
    const r = aimAt(v3(0, 0, 0), v3(10, -10, 0));
    expect(r.pan).toBeCloseTo(45);
    expect(r.tilt).toBeCloseTo(0);
  });
  it("aimAt gives tilt 45 for a target up at 45°", () => {
    const r = aimAt(v3(0, 0, 0), v3(0, -10, 10));
    expect(r.pan).toBeCloseTo(0);
    expect(r.tilt).toBeCloseTo(45);
  });
  it("aimImageCentreAt lands the shifted image centre on the target", () => {
    const pj = defaultProjector({
      name: "aim",
      targetWall: "right",
      position: { x: 0, y: 20 },
      mountHeight: 16,
      throwRatio: { min: 1, max: 3 },
      throwRatioUsed: 2,
      lensShift: { horizontal: 0, vertical: 0.4 },
    });
    const target = v3(10, 20, 10);
    const { pan, tilt } = aimImageCentreAt(pj, target);
    const aimed = { ...pj, pan, tilt };
    // The centre pixel (a = 0, b = 0, which includes the shift) must hit the target.
    const centre = castToWall(aimed, projectorBasis(pan, tilt, 0), straightRightWall, 0, 0)!;
    expect(centre.wall.x).toBeCloseTo(20, 1);
    expect(centre.wall.y).toBeCloseTo(10, 1);
    // And the footprint is not centred on the lens axis any more: it sits below the lens.
    const fp = projectFootprint(aimed, straightRightWall);
    expect(fp.keystone!.bounds.maxH).toBeLessThan(16);
  });
});
