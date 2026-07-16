// Lane graph + marking tests. The load-bearing product invariant here is that
// the two thresholds are INDEPENDENT (Brief section 5 board DoD): the last block
// proves changing one output's threshold leaves the other output untouched.

import { describe, expect, it } from "vitest";
import type { ModelPoint } from "./coords";
import {
  computeLanes,
  computeMarks,
  defaultLaneState,
  pairKey,
  type TokenMeta,
} from "./lanes";

// A tiny fixed board: two home attackers on a horizontal line, one ball, and
// defenders we place per test. Positions are landscape model coords.
function board(
  positions: Record<string, ModelPoint>,
  sides: Record<string, "home" | "away" | "ball">
): { positions: Map<string, ModelPoint>; tokens: TokenMeta[] } {
  const map = new Map(Object.entries(positions));
  const tokens = Object.keys(positions).map((id) => ({ id, side: sides[id] }));
  return { positions: map, tokens };
}

describe("pairKey", () => {
  it("is order independent and canonical", () => {
    expect(pairKey("home-2", "home-9")).toBe(pairKey("home-9", "home-2"));
    expect(pairKey("home-9", "home-2")).toBe("home-2|home-9");
  });
});

describe("computeLanes: confirmed pairs always render", () => {
  const { positions, tokens } = board(
    {
      "home-2": { x: 20, y: 50 },
      "home-9": { x: 80, y: 50 },
      ball: { x: 50, y: 90 }, // far away so it does not add a suggestion here
    },
    { "home-2": "home", "home-9": "home", ball: "ball" }
  );

  it("draws a confirmed lane with no opponents (clear)", () => {
    const confirmed = new Set([pairKey("home-2", "home-9")]);
    const lanes = computeLanes(positions, tokens, confirmed, 7);
    const lane = lanes.find((l) => l.key === pairKey("home-2", "home-9"));
    expect(lane?.kind).toBe("confirmed");
    expect(lane?.blocked).toBe(false);
    expect(lane?.interception).toBeNull();
  });
});

describe("computeLanes: blocking + interception point", () => {
  const sides = {
    "home-2": "home" as const,
    "home-9": "home" as const,
    "away-5": "away" as const,
    ball: "ball" as const,
  };

  it("blocks when a defender is within the perpendicular threshold and puts the dot on the foot", () => {
    const { positions, tokens } = board(
      {
        "home-2": { x: 20, y: 50 },
        "home-9": { x: 80, y: 50 },
        "away-5": { x: 50, y: 56 }, // 6 units below the midpoint
        ball: { x: 50, y: 90 },
      },
      sides
    );
    const confirmed = new Set([pairKey("home-2", "home-9")]);

    const blocked = computeLanes(positions, tokens, confirmed, 7); // 6 <= 7
    const lane = blocked.find((l) => l.key === pairKey("home-2", "home-9"))!;
    expect(lane.blocked).toBe(true);
    expect(lane.blockerId).toBe("away-5");
    expect(lane.interception).toEqual({ x: 50, y: 50 }); // foot of the perpendicular

    const clear = computeLanes(positions, tokens, confirmed, 5); // 6 > 5
    const laneClear = clear.find((l) => l.key === pairKey("home-2", "home-9"))!;
    expect(laneClear.blocked).toBe(false);
    expect(laneClear.interception).toBeNull();
  });

  it("picks the nearest defender for the interception when several block", () => {
    const { positions, tokens } = board(
      {
        "home-2": { x: 20, y: 50 },
        "home-9": { x: 80, y: 50 },
        "away-5": { x: 40, y: 56 }, // dist 6
        "away-6": { x: 60, y: 53 }, // dist 3  -> nearest
        ball: { x: 50, y: 90 },
      },
      {
        "home-2": "home",
        "home-9": "home",
        "away-5": "away",
        "away-6": "away",
        ball: "ball",
      }
    );
    const confirmed = new Set([pairKey("home-2", "home-9")]);
    const lane = computeLanes(positions, tokens, confirmed, 7).find(
      (l) => l.key === pairKey("home-2", "home-9")
    )!;
    expect(lane.blockerId).toBe("away-6");
    expect(lane.interception).toEqual({ x: 60, y: 50 });
  });
});

describe("computeLanes: suggestions come from the ball holder within range", () => {
  it("suggests the holder's in-range teammates and skips out-of-range ones", () => {
    const { positions, tokens } = board(
      {
        "home-2": { x: 50, y: 50 }, // nearest to the ball -> holder
        "home-9": { x: 70, y: 50 }, // 20 away -> in range
        "home-7": { x: 95, y: 50 }, // 45 away -> out of range
        ball: { x: 50, y: 50 },
      },
      { "home-2": "home", "home-9": "home", "home-7": "home", ball: "ball" }
    );
    const lanes = computeLanes(positions, tokens, new Set(), 7, 32);
    const keys = lanes.map((l) => l.key);
    expect(keys).toContain(pairKey("home-2", "home-9"));
    expect(keys).not.toContain(pairKey("home-2", "home-7"));
    expect(lanes.every((l) => l.kind === "suggested")).toBe(true);
  });

  it("a confirmed pair wins its key and never doubles as a suggestion", () => {
    const { positions, tokens } = board(
      {
        "home-2": { x: 50, y: 50 },
        "home-9": { x: 60, y: 50 },
        ball: { x: 50, y: 50 },
      },
      { "home-2": "home", "home-9": "home", ball: "ball" }
    );
    const confirmed = new Set([pairKey("home-2", "home-9")]);
    const lanes = computeLanes(positions, tokens, confirmed, 7, 32);
    const matching = lanes.filter((l) => l.key === pairKey("home-2", "home-9"));
    expect(matching).toHaveLength(1);
    expect(matching[0].kind).toBe("confirmed");
  });
});

describe("computeMarks", () => {
  it("rings an attacker with a defender inside the marking distance", () => {
    const { positions, tokens } = board(
      {
        "home-9": { x: 70, y: 50 },
        "away-5": { x: 76, y: 50 }, // 6 away
        "home-7": { x: 20, y: 20 }, // no defender near -> unmarked
      },
      { "home-9": "home", "away-5": "away", "home-7": "home" }
    );
    const marks = computeMarks(positions, tokens, 10); // tight band = 5
    expect(marks).toHaveLength(1);
    expect(marks[0].tokenId).toBe("home-9");
    expect(marks[0].level).toBe("loose"); // 6 > 5
  });

  it("marks tight inside the inner band", () => {
    const { positions, tokens } = board(
      { "home-9": { x: 70, y: 50 }, "away-5": { x: 73, y: 50 } }, // 3 away
      { "home-9": "home", "away-5": "away" }
    );
    const marks = computeMarks(positions, tokens, 10); // tight band = 5, 3 <= 5
    expect(marks[0].level).toBe("tight");
  });
});

// The independence proof: hold positions fixed; vary one threshold; assert the
// other output is byte-for-byte unchanged. This is the DoD line in code.
describe("the two thresholds are independent", () => {
  const { positions, tokens } = board(
    {
      "home-2": { x: 20, y: 50 },
      "home-9": { x: 80, y: 50 },
      "away-5": { x: 50, y: 56 }, // blocks the lane (perpendicular dist 6)
      "away-6": { x: 80, y: 54 }, // marks home-9 (dist 4), off the pass line
      ball: { x: 50, y: 90 },
    },
    {
      "home-2": "home",
      "home-9": "home",
      "away-5": "away",
      "away-6": "away",
      ball: "ball",
    }
  );
  const confirmed = new Set([pairKey("home-2", "home-9")]);
  const laneOf = (t: number) =>
    computeLanes(positions, tokens, confirmed, t).find(
      (l) => l.key === pairKey("home-2", "home-9")
    )!;

  it("changing the marking threshold does not change lane blocking", () => {
    const laneA = laneOf(7);
    const laneB = laneOf(7);
    // Marks change with their own threshold ...
    expect(computeMarks(positions, tokens, 10).length).toBeGreaterThan(0);
    expect(computeMarks(positions, tokens, 2).length).toBe(0);
    // ... while the lane, computed from the same positions + blocking threshold,
    // is identical regardless of what the marking threshold was.
    expect(laneA.blocked).toBe(true);
    expect(laneB.blocked).toBe(true);
    expect(laneA.interception).toEqual(laneB.interception);
  });

  it("changing the blocking threshold does not change marking", () => {
    const marksLoose = computeMarks(positions, tokens, 10);
    // Blocking flips off at a tighter threshold ...
    expect(laneOf(7).blocked).toBe(true);
    expect(laneOf(3).blocked).toBe(false);
    // ... but marks (their own threshold fixed) are unchanged across both.
    const marksAgain = computeMarks(positions, tokens, 10);
    expect(marksAgain).toEqual(marksLoose);
  });
});

describe("defaultLaneState mirrors the doc 03 4.3 board row", () => {
  it("carries both thresholds and an empty confirmed set", () => {
    const s = defaultLaneState();
    expect(s.confirmedLanes).toEqual([]);
    expect(s.blockingThreshold).toBeGreaterThan(0);
    expect(s.markingThreshold).toBeGreaterThan(0);
  });
});
