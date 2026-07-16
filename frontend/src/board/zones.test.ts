// Zone geometry tests (T-022, Brief step 13). Pure model-space assertions:
// the thirds fall on the right boundaries, the half-space and cutback pairs are
// symmetric about the pitch's y axis, Zone 14 sits central in the attacking
// third, and group filtering keeps only what is toggled.

import { describe, expect, it } from "vitest";
import { buildZones, visibleZones, ZONE_GROUPS, type ZoneGroup } from "./zones";

const geo = buildZones();

function rect(key: string) {
  const r = geo.rects.find((r) => r.key === key)!;
  expect(r).toBeDefined();
  return r;
}

describe("thirds", () => {
  it("divides the length at 1/3 and 2/3", () => {
    const xs = geo.dividers.map((d) => d.x).sort((a, b) => a - b);
    expect(xs.length).toBe(2);
    expect(xs[0]).toBeCloseTo(100 / 3, 6);
    expect(xs[1]).toBeCloseTo(200 / 3, 6);
  });
});

describe("half-spaces", () => {
  it("are two channels symmetric about y = 50", () => {
    const top = rect("halfspace_top");
    const bottom = rect("halfspace_bottom");
    expect(top.y0 + bottom.y1).toBeCloseTo(100, 6);
    expect(top.y1 + bottom.y0).toBeCloseTo(100, 6);
    // Flank the central corridor, do not cover it.
    expect(top.y1).toBeLessThan(50);
    expect(bottom.y0).toBeGreaterThan(50);
  });
});

describe("Zone 14", () => {
  it("is central and in the attacking third", () => {
    const z = rect("zone14");
    expect(z.x0).toBeGreaterThan(200 / 3); // attacking third (+x is attack)
    expect((z.y0 + z.y1) / 2).toBeCloseTo(50, 6); // vertically central
    expect(z.label).toBe("Zone 14");
  });
});

describe("cutback pockets", () => {
  it("are wide, near the byline, symmetric on both flanks", () => {
    const top = rect("cutback_top");
    const bottom = rect("cutback_bottom");
    expect(top.x0).toBeGreaterThan(70); // near the attacking byline
    expect(top.y0 + bottom.y1).toBeCloseTo(100, 6);
    expect(top.y1 + bottom.y0).toBeCloseTo(100, 6);
    expect(top.label).toBe("Cutback");
  });
});

describe("visibility filter", () => {
  it("keeps only toggled groups", () => {
    const only: Set<ZoneGroup> = new Set(["zone14"]);
    const v = visibleZones(geo, only);
    expect(v.dividers.length).toBe(0);
    expect(v.rects.every((r) => r.group === "zone14")).toBe(true);
    expect(v.rects.length).toBe(1);
  });

  it("empty set hides everything, full set shows every group", () => {
    expect(visibleZones(geo, new Set()).rects.length).toBe(0);
    const all = visibleZones(geo, new Set(ZONE_GROUPS));
    expect(all.rects.length + all.dividers.length).toBe(
      geo.rects.length + geo.dividers.length
    );
  });
});
