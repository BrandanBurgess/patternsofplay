// Phase morph benchmark (T-105, doc 06 section 4 "Performance": measured, not
// assumed). Two separate workloads, because they run at different rates:
//
//   1. BUILD. Runs once per phase selection: mirror their eleven, bind both
//      elevens by slot, build the tokens and the Playback. Held to the same 2ms
//      ceiling doc 06 sets for a full superiority recompute.
//   2. SAMPLE. Runs once per animation frame for the 600ms the morph lasts, with
//      22 tokens on the board. The budget assertion is deliberately framed as a
//      whole second of playback (60 samples) inside 2ms, which is roughly a 1%
//      slice of one frame's 16.7ms and leaves the rest of the 60fps budget to
//      the DOM writes and to the superiority recompute running alongside.
//
// Method follows superiority.bench.test.ts so the two numbers are comparable:
// warm up untimed, then assert on the MEDIAN of individually timed runs (CI
// shares a machine, so a mean or a max would flake on one GC pause), with a much
// looser p99 to catch a genuinely pathological regression. Result is printed so
// the number is visible in the verify log and not only in an assertion.

import { describe, expect, it } from "vitest";
import { PHASE_MORPH_MS, bindOurPhases, buildPhaseMorphPlayback, morphToPhase } from "./phaseMorph";
import type { SlotPos } from "./superiorityTypes";

const WARMUP_RUNS = 300;
const SAMPLE_RUNS = 501;
const MEDIAN_BUDGET_MS = 2;
const P99_BUDGET_MS = 12;
/** One second of playback at 60fps. */
const FRAMES_PER_SECOND = 60;

function at(slot: string, position_code: string, x: number, y: number): SlotPos {
  return { slot, position_code, x, y };
}

const OURS_BASE: SlotPos[] = [
  at("GK", "GK", 5, 50),
  at("RB", "RB", 22, 16),
  at("RCB", "CB", 18, 38),
  at("LCB", "CB", 18, 62),
  at("LB", "LB", 22, 84),
  at("RCM", "CM", 42, 30),
  at("DM", "DM", 38, 50),
  at("LCM", "CM", 42, 70),
  at("RW", "W", 68, 18),
  at("ST", "ST", 72, 50),
  at("LW", "W", 68, 82),
];

const OURS_IN_POSSESSION: SlotPos[] = OURS_BASE.map((p) => at(p.slot, p.position_code, p.x + 12, p.y));

/** Their eleven in THEIR OWN frame, as seeded. Mirrored inside the workload. */
const THEIRS_MID_BLOCK: SlotPos[] = OURS_BASE.map((p) => at(p.slot, p.position_code, p.x, 100 - p.y));
const THEIRS_HIGH_PRESS: SlotPos[] = THEIRS_MID_BLOCK.map((p) =>
  at(p.slot, p.position_code, p.x + 10, p.y)
);

function build(): number {
  const m = morphToPhase({
    from: { ours: OURS_BASE, theirs: THEIRS_MID_BLOCK },
    to: { ours: OURS_IN_POSSESSION, theirs: THEIRS_HIGH_PRESS },
    caption: "3-2-5. Against a two striker press.",
  });
  return m.tokens.length + m.ours.morphs.length + (m.theirs?.morphs.length ?? 0);
}

const PLAYBACK = (() => {
  const m = morphToPhase({
    from: { ours: OURS_BASE, theirs: THEIRS_MID_BLOCK },
    to: { ours: OURS_IN_POSSESSION, theirs: THEIRS_HIGH_PRESS },
  });
  return m.playback;
})();

function playOneSecond(): number {
  let touched = 0;
  for (let f = 0; f < FRAMES_PER_SECOND; f += 1) {
    const frame = PLAYBACK.sample((PHASE_MORPH_MS * f) / FRAMES_PER_SECOND);
    touched += frame.actors.size;
  }
  return touched;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

function measure(label: string, work: () => number): { median: number; p99: number } {
  for (let i = 0; i < WARMUP_RUNS; i += 1) work();
  const samples: number[] = new Array(SAMPLE_RUNS);
  for (let i = 0; i < SAMPLE_RUNS; i += 1) {
    const t0 = performance.now();
    work();
    samples[i] = performance.now() - t0;
  }
  samples.sort((a, b) => a - b);
  const median = percentile(samples, 0.5);
  const p99 = percentile(samples, 0.99);
  // eslint-disable-next-line no-console
  console.log(
    `[T-105 benchmark] ${label} n=${SAMPLE_RUNS} median=${median.toFixed(4)}ms ` +
      `p99=${p99.toFixed(4)}ms max=${samples[samples.length - 1].toFixed(4)}ms`
  );
  return { median, p99 };
}

describe("phase morph benchmark: 22 tokens", () => {
  it("exercises real work, so the timings below mean something", () => {
    // Guard the guard. If the workload ever stops binding both elevens, the
    // numbers underneath become a measurement of nothing.
    expect(build()).toBe(22 + 11 + 11);
    expect(playOneSecond()).toBe(22 * FRAMES_PER_SECOND);
    expect(bindOurPhases(OURS_BASE, OURS_IN_POSSESSION).morphs.every((m) => m.moves)).toBe(true);
  });

  it(`builds a phase transition in under ${MEDIAN_BUDGET_MS}ms at the median`, () => {
    const { median, p99 } = measure("build", build);
    expect(median).toBeLessThan(MEDIAN_BUDGET_MS);
    expect(p99).toBeLessThan(P99_BUDGET_MS);
  });

  it(`samples a full second of playback in under ${MEDIAN_BUDGET_MS}ms at the median`, () => {
    const { median, p99 } = measure("sample x60", playOneSecond);
    expect(median).toBeLessThan(MEDIAN_BUDGET_MS);
    expect(p99).toBeLessThan(P99_BUDGET_MS);
  });

  it("a single frame leaves the 60fps budget essentially untouched", () => {
    const one = buildPhaseMorphPlayback(bindOurPhases(OURS_BASE, OURS_IN_POSSESSION).morphs);
    for (let i = 0; i < WARMUP_RUNS; i += 1) one.sample(i % PHASE_MORPH_MS);
    const t0 = performance.now();
    for (let i = 0; i < 1000; i += 1) one.sample(i % PHASE_MORPH_MS);
    const perSample = (performance.now() - t0) / 1000;
    // eslint-disable-next-line no-console
    console.log(`[T-105 benchmark] single sample = ${perSample.toFixed(5)}ms`);
    // 0.3% of a 16.7ms frame, averaged over 1000 calls so scheduler noise
    // cancels rather than flakes. Measured cost is around 0.0005ms, so this is
    // a regression tripwire with two orders of magnitude of headroom, not a
    // threshold anyone is running close to.
    expect(perSample).toBeLessThan(0.05);
  });
});
