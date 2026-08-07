// JdP grid tests (T-104), written BEFORE grid.ts exists. Doc 06 section 2.2 is
// the contract: five vertical lanes across y, five horizontal lines across x,
// and three occupancy guidelines that produce CHECKS, never errors.
//
// The boundary rule under test: every band is half-open and lower-inclusive,
// [min, max), except the final band which is closed, [min, max]. So y exactly 19
// belongs to the left half-space (the higher band), not to the left wing, and
// y exactly 100 belongs to the right wing. Lanes and lines use the same rule.

import { describe, expect, it } from "vitest";
import {
  JDP_GRID,
  JDP_OCCUPANCY_LIMITS,
  WIDE_LANE_KEYS,
  cellAt,
  cellKey,
  gridOccupancy,
  laneAt,
  laneIndexAt,
  lineAt,
  lineIndexAt,
} from "./grid";
import type { SlotPos } from "./superiorityTypes";

function at(slot: string, x: number, y: number): SlotPos {
  return { slot, position_code: "XX", x, y };
}

describe("JDP_GRID is the single source of the doc 06 section 2.2 numbers", () => {
  it("has the five lanes with the documented y ranges, in order", () => {
    expect(JDP_GRID.lanes.map((l) => [l.key, l.min, l.max])).toEqual([
      ["left_wing", 0, 19],
      ["left_half_space", 19, 37],
      ["centre", 37, 63],
      ["right_half_space", 63, 81],
      ["right_wing", 81, 100],
    ]);
  });

  it("has the five lines with the documented x ranges, in order", () => {
    expect(JDP_GRID.lines.map((l) => [l.key, l.min, l.max])).toEqual([
      ["own_build", 0, 22],
      ["first_line", 22, 42],
      ["middle", 42, 60],
      ["between_the_lines", 60, 78],
      ["last_line", 78, 100],
    ]);
  });

  it("tiles the pitch with no gap and no overlap", () => {
    for (const bands of [JDP_GRID.lanes, JDP_GRID.lines]) {
      expect(bands[0].min).toBe(0);
      expect(bands[bands.length - 1].max).toBe(100);
      for (let i = 1; i < bands.length; i += 1) {
        expect(bands[i].min).toBe(bands[i - 1].max);
      }
    }
  });

  it("names exactly the two wide lanes and the three occupancy limits", () => {
    expect(WIDE_LANE_KEYS).toEqual(["left_wing", "right_wing"]);
    expect(JDP_OCCUPANCY_LIMITS).toEqual({ perLine: 3, perLane: 2, perWideLane: 1 });
  });
});

describe("band lookup: lower-inclusive bands, closed at the far edge", () => {
  it("places interior points in the obvious lane", () => {
    expect(laneAt(0).key).toBe("left_wing");
    expect(laneAt(10).key).toBe("left_wing");
    expect(laneAt(28).key).toBe("left_half_space");
    expect(laneAt(50).key).toBe("centre");
    expect(laneAt(72).key).toBe("right_half_space");
    expect(laneAt(95).key).toBe("right_wing");
  });

  it("puts a point exactly on a lane boundary in the HIGHER band", () => {
    expect(laneAt(19).key).toBe("left_half_space");
    expect(laneAt(37).key).toBe("centre");
    expect(laneAt(63).key).toBe("right_half_space");
    expect(laneAt(81).key).toBe("right_wing");
  });

  it("puts a point exactly on a line boundary in the HIGHER band, same rule", () => {
    expect(lineAt(22).key).toBe("first_line");
    expect(lineAt(42).key).toBe("middle");
    expect(lineAt(60).key).toBe("between_the_lines");
    expect(lineAt(78).key).toBe("last_line");
  });

  it("closes the final band so 100 is inside the pitch, not past it", () => {
    expect(laneAt(100).key).toBe("right_wing");
    expect(lineAt(100).key).toBe("last_line");
  });

  it("clamps out-of-pitch coordinates into the end bands rather than throwing", () => {
    expect(laneIndexAt(-5)).toBe(0);
    expect(laneIndexAt(140)).toBe(4);
    expect(lineIndexAt(-0.001)).toBe(0);
    expect(lineIndexAt(100.001)).toBe(4);
  });

  it("assigns every integer coordinate to exactly one band", () => {
    for (let v = 0; v <= 100; v += 1) {
      const lane = laneIndexAt(v);
      const line = lineIndexAt(v);
      expect(lane).toBeGreaterThanOrEqual(0);
      expect(lane).toBeLessThan(JDP_GRID.lanes.length);
      expect(line).toBeGreaterThanOrEqual(0);
      expect(line).toBeLessThan(JDP_GRID.lines.length);
    }
  });
});

describe("cellAt / cellKey", () => {
  it("combines the lane and the line into one stable key", () => {
    const cell = cellAt({ x: 65, y: 28 });
    expect(cell.lane).toBe("left_half_space");
    expect(cell.line).toBe("between_the_lines");
    expect(cell.key).toBe(cellKey("left_half_space", "between_the_lines"));
  });

  it("keys the corner cell by the same boundary rule", () => {
    expect(cellAt({ x: 78, y: 81 }).key).toBe(cellKey("right_wing", "last_line"));
  });
});

describe("gridOccupancy: guidelines produce checks, never errors", () => {
  it("reports no breaches for a well spread shape", () => {
    const ours = [
      at("LW", 80, 10),
      at("LCM", 55, 28),
      at("ST", 85, 50),
      at("RCM", 55, 72),
      at("RW", 80, 90),
    ];
    const { breaches } = gridOccupancy(ours);
    expect(breaches).toEqual([]);
  });

  it("lists occupants per occupied cell only, in input order", () => {
    const { occupancy } = gridOccupancy([at("A", 65, 28), at("B", 66, 30), at("C", 10, 50)]);
    expect(occupancy).toEqual({
      [cellKey("left_half_space", "between_the_lines")]: ["A", "B"],
      [cellKey("centre", "own_build")]: ["C"],
    });
  });

  it("flags more than two teammates in a vertical lane", () => {
    const ours = [at("A", 30, 28), at("B", 55, 30), at("C", 80, 25)];
    const { breaches } = gridOccupancy(ours);
    expect(breaches).toEqual([
      { kind: "lane_over", cell: "left_half_space", count: 3, slots: ["A", "B", "C"] },
    ]);
  });

  it("flags more than three teammates on a horizontal line", () => {
    const ours = [at("A", 50, 10), at("B", 50, 30), at("C", 50, 50), at("D", 50, 70)];
    const { breaches } = gridOccupancy(ours);
    expect(breaches).toEqual([
      { kind: "line_over", cell: "middle", count: 4, slots: ["A", "B", "C", "D"] },
    ]);
  });

  it("flags a shared wide lane at two occupants, before the lane limit bites", () => {
    const ours = [at("LB", 40, 8), at("LW", 80, 12)];
    const { breaches } = gridOccupancy(ours);
    expect(breaches).toEqual([
      { kind: "wide_lane_shared", cell: "left_wing", count: 2, slots: ["LB", "LW"] },
    ]);
  });

  it("raises both wide-lane checks when a wide lane holds three, since they are two different guidelines", () => {
    const ours = [at("LB", 30, 8), at("LM", 55, 12), at("LW", 85, 5)];
    const { breaches } = gridOccupancy(ours);
    expect(breaches.map((b) => b.kind)).toEqual(["lane_over", "wide_lane_shared"]);
  });

  it("orders breaches deterministically: lanes by index, then lines by index", () => {
    const ours = [
      at("A", 50, 8),
      at("B", 50, 12),
      at("C", 50, 50),
      at("D", 50, 55),
      at("E", 50, 90),
      at("F", 50, 95),
    ];
    const { breaches } = gridOccupancy(ours);
    expect(breaches.map((b) => [b.kind, b.cell])).toEqual([
      ["wide_lane_shared", "left_wing"],
      ["wide_lane_shared", "right_wing"],
      ["line_over", "middle"],
    ]);
  });

  it("is empty for an empty shape", () => {
    expect(gridOccupancy([])).toEqual({ occupancy: {}, breaches: [] });
  });

  it("is deterministic: the same input gives a deeply equal result every time", () => {
    const ours = [at("A", 30, 28), at("B", 55, 30), at("C", 80, 25), at("D", 50, 90)];
    expect(gridOccupancy(ours)).toEqual(gridOccupancy(ours));
  });
});
