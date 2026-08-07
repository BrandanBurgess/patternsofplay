// Recompute benchmark (T-104, doc 06 section 4 "Performance"). The engine runs on
// every drag frame, so a FULL recompute with 22 tokens and 6 zones must stay under
// 2ms. Doc 06 says this must be measured, not assumed.
//
// Method, so a reviewer can judge whether the threshold is honest:
//   - The workload is one complete recompute: mirror all 11 opponents, run
//     findFreeMen, count all 6 zones, run gridOccupancy, classifyRestDefence and
//     buildRead. Nothing is hoisted out of the timed region except the fixture.
//   - WARMUP_RUNS untimed iterations first, so the JIT has tiered up and the
//     shapes are monomorphic before anything is recorded.
//   - Then SAMPLE_RUNS individually timed iterations. We assert on the MEDIAN,
//     not the mean and not the max, because CI shares a machine and a single
//     preemption or a GC pause would otherwise flake the build.
//   - A separate, much looser ceiling on the 99th percentile catches a genuine
//     pathological case (an accidental O(n^3)) without flaking on scheduler noise.
//
// The result is printed so the number is visible in the verify log rather than
// only living in an assertion.

import { describe, expect, it } from "vitest";
import {
  SUPERIORITY_ZONE_KEYS,
  buildRead,
  classifyRestDefence,
  countZone,
  findFreeMen,
  mirrorOpponent,
} from "./superiority";
import { gridOccupancy } from "./grid";
import type { SlotPos, SuperiorityZone } from "./superiorityTypes";

const WARMUP_RUNS = 300;
const SAMPLE_RUNS = 501;
const MEDIAN_BUDGET_MS = 2;
const P99_BUDGET_MS = 12;

function at(slot: string, x: number, y: number): SlotPos {
  return { slot, position_code: slot, x, y };
}

/** Our shape: a 3-2-5 in possession, 11 slots in landscape model coords. */
const OURS: SlotPos[] = [
  at("GK", 6, 50),
  at("LCB", 24, 30),
  at("CB", 22, 50),
  at("RCB", 24, 70),
  at("LB", 44, 44),
  at("DM", 46, 56),
  at("LCM", 66, 28),
  at("RCM", 66, 72),
  at("LW", 82, 8),
  at("ST", 88, 50),
  at("RW", 82, 92),
];

/** Their shape: a 4-4-2 mid block, authored in THEIR frame then mirrored into ours. */
const THEIRS_OWN_FRAME: SlotPos[] = [
  at("oGK", 5, 50),
  at("oLB", 20, 18),
  at("oLCB", 18, 40),
  at("oRCB", 18, 60),
  at("oRB", 20, 82),
  at("oLM", 40, 18),
  at("oLCM", 38, 40),
  at("oRCM", 38, 60),
  at("oRM", 40, 82),
  at("oST1", 60, 42),
  at("oST2", 60, 58),
];

function polygon(zoneKey: string, x0: number, y0: number, x1: number, y1: number): SuperiorityZone {
  return {
    zoneKey,
    kind: "polygon",
    polygon: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
  };
}

const K = SUPERIORITY_ZONE_KEYS;

/** The six zones of doc 06 section 2.3: five polygons plus the ball-relative ring. */
const ZONES: SuperiorityZone[] = [
  polygon(K.firstLine, 0, 20, 40, 80),
  polygon(K.midfieldBox, 40, 30, 70, 70),
  polygon(K.flankCorridorLeft, 0, 0, 100, 30),
  polygon(K.flankCorridorRight, 0, 70, 100, 100),
  polygon(K.lastLine, 70, 15, 100, 85),
  { zoneKey: K.counterpressRing, kind: "circle", centre: { x: 70, y: 50 }, radius: 18 },
];

const BALL_X = 70;

/** One complete recompute, exactly as a drag frame would run it. */
function recompute(): number {
  const theirs: SlotPos[] = THEIRS_OWN_FRAME.map((t) => {
    const m = mirrorOpponent({ x: t.x, y: t.y });
    return { slot: t.slot, position_code: t.position_code, x: m.x, y: m.y };
  });

  const freeMen = findFreeMen(OURS, theirs);
  const freeSlots = new Set(freeMen.map((f) => f.slot));
  const counts = ZONES.map((z) => countZone(z, OURS, theirs, freeSlots));
  const grid = gridOccupancy(OURS);
  const rest = classifyRestDefence(OURS, BALL_X);
  const read = buildRead(counts, null);

  // Touch the results so nothing can be optimised away as dead code.
  return counts.length + grid.breaches.length + rest.behindBall + (read.spare ? 1 : 0) + freeMen.length;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

describe("superiority engine recompute benchmark: 22 tokens, 6 zones", () => {
  it("exercises the whole engine in one pass", () => {
    // Guard the guard: if the workload ever stops doing real work, the timing
    // below becomes meaningless, so assert the fixture actually produces a read.
    expect(OURS).toHaveLength(11);
    expect(THEIRS_OWN_FRAME).toHaveLength(11);
    expect(ZONES).toHaveLength(6);
    expect(recompute()).toBeGreaterThan(0);
  });

  it(`stays under ${MEDIAN_BUDGET_MS}ms per recompute at the median`, () => {
    for (let i = 0; i < WARMUP_RUNS; i += 1) recompute();

    const samples: number[] = new Array(SAMPLE_RUNS);
    for (let i = 0; i < SAMPLE_RUNS; i += 1) {
      const t0 = performance.now();
      recompute();
      samples[i] = performance.now() - t0;
    }
    samples.sort((a, b) => a - b);

    const median = percentile(samples, 0.5);
    const p99 = percentile(samples, 0.99);
    // eslint-disable-next-line no-console
    console.log(
      `[T-104 benchmark] recompute n=${SAMPLE_RUNS} median=${median.toFixed(4)}ms ` +
        `p99=${p99.toFixed(4)}ms max=${samples[samples.length - 1].toFixed(4)}ms`
    );

    expect(median).toBeLessThan(MEDIAN_BUDGET_MS);
    expect(p99).toBeLessThan(P99_BUDGET_MS);
  });
});
