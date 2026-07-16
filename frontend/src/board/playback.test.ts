// Pure playback math tests, written before the player renders on top of it
// (Brief workflow step 2). Covers: declarative waypoint interpolation, a bound
// ball waypoint CHASING a moving runner and connecting, raw keyframe
// interpolation, and the format abstraction (both builders yield the same
// Playback shape the player consumes).

import { describe, expect, it } from "vitest";
import {
  buildDeclarativePlayback,
  buildKeyframePlayback,
  STEP_MS,
  type Playback,
} from "./playback";
import type { BoardSnapshot, DeclarativeSpec, Keyframe } from "./animationTypes";
import { DEMO_BINDING, DEMO_RUNNER_FINAL, DEMO_SPEC } from "./demoSpec";

function near(a: number, b: number, eps = 1e-6) {
  expect(Math.abs(a - b)).toBeLessThan(eps);
}

describe("declarative playback: slot interpolation", () => {
  const spec: DeclarativeSpec = {
    slots: [{ slot: "runner", start: { x: 10, y: 20 } }],
    ball: { holder_slot: "runner" },
    steps: [
      { n: 1, caption: "hold", moves: [] },
      { n: 2, caption: "run", moves: [{ slot: "runner", to: { x: 50, y: 20 } }] },
    ],
  };
  const pb = buildDeclarativePlayback(spec, { runner: "home-1" });

  it("holds through a step with no move", () => {
    const p = pb.sample(STEP_MS * 0.5).actors.get("home-1")!;
    near(p.x, 10);
    near(p.y, 20);
  });

  it("interpolates linearly across the moving step", () => {
    const mid = pb.sample(STEP_MS * 1.5).actors.get("home-1")!; // half of step 2
    near(mid.x, 30); // halfway 10 -> 50
    near(mid.y, 20);
  });

  it("reaches the target at the end and clamps beyond duration", () => {
    near(pb.sample(pb.durationMs).actors.get("home-1")!.x, 50);
    near(pb.sample(pb.durationMs * 5).actors.get("home-1")!.x, 50);
  });

  it("exposes duration as steps * STEP_MS", () => {
    expect(pb.durationMs).toBe(2 * STEP_MS);
  });
});

describe("declarative playback: bound ball chases a moving runner", () => {
  // The ball is passed to a runner DURING the same step the runner sprints, so
  // the waypoint target is moving. The pass must still connect at step end.
  const spec: DeclarativeSpec = {
    slots: [
      { slot: "passer", start: { x: 20, y: 50 } },
      { slot: "runner", start: { x: 40, y: 50 } },
    ],
    ball: { holder_slot: "passer" },
    steps: [
      {
        n: 1,
        caption: "pass into the run",
        moves: [{ slot: "runner", to: { x: 90, y: 50 } }],
        ball_to: { bind_slot: "runner", trajectory: "driven" },
      },
    ],
  };
  const pb = buildDeclarativePlayback(spec, { passer: "home-1", runner: "home-2" });

  it("lands the ball exactly on the runner's final position", () => {
    const end = pb.sample(pb.durationMs);
    const runner = end.actors.get("home-2")!;
    near(runner.x, 90);
    near(end.ball!.x, runner.x); // ball connects to the runner
    near(end.ball!.y, runner.y);
  });

  it("aims ahead of the runner mid-flight, not at the runner's start", () => {
    const t = STEP_MS * 0.5;
    const f = pb.sample(t);
    const runner = f.actors.get("home-2")!;
    // Runner is at 40 -> 90, halfway = 65.
    near(runner.x, 65);
    // Ball is lerp(passerStart=20, runnerLive=65, p=0.5) = 42.5: it is chasing
    // the LIVE (advanced) runner position, well past the runner's start of 40.
    near(f.ball!.x, 42.5);
    expect(f.ball!.x).toBeGreaterThan(20);
  });

  it("chases: a faster runner pulls the ball further downfield at the same t", () => {
    const faster: DeclarativeSpec = {
      ...spec,
      steps: [
        {
          ...spec.steps[0],
          moves: [{ slot: "runner", to: { x: 100, y: 50 } }],
        },
      ],
    };
    const pb2 = buildDeclarativePlayback(faster, { passer: "home-1", runner: "home-2" });
    const t = STEP_MS * 0.5;
    expect(pb2.sample(t).ball!.x).toBeGreaterThan(pb.sample(t).ball!.x);
  });

  it("carries the trajectory for the trail style", () => {
    expect(pb.sample(STEP_MS * 0.5).ballTrajectory).toBe("driven");
  });
});

describe("declarative playback: the two-pass demo build-out", () => {
  const pb = buildDeclarativePlayback(DEMO_SPEC, DEMO_BINDING);

  it("ends with the ball on the overlapping fullback (home-2)", () => {
    const end = pb.sample(pb.durationMs);
    const fb = end.actors.get("home-2")!;
    near(fb.x, DEMO_RUNNER_FINAL.x);
    near(fb.y, DEMO_RUNNER_FINAL.y);
    near(end.ball!.x, fb.x);
    near(end.ball!.y, fb.y);
  });

  it("emits a numbered badge per pass, revealed in order", () => {
    const badges = pb.sample(pb.durationMs).badges;
    expect(badges.map((b) => b.n)).toEqual([1, 2]); // two passes
    expect(badges[0].revealMs).toBeLessThan(badges[1].revealMs);
  });

  it("surfaces the current step caption", () => {
    expect(pb.sample(0).caption).toBe(DEMO_SPEC.steps[0].caption);
    expect(pb.sample(pb.durationMs).caption).toBe(DEMO_SPEC.steps[3].caption);
  });
});

describe("keyframe playback: raw recording replayed as-is", () => {
  const keyframes: Keyframe[] = [
    { t_ms: 0, token_id: "home-9", x: 10, y: 10 },
    { t_ms: 1000, token_id: "home-9", x: 30, y: 10 },
    { t_ms: 0, token_id: "away-3", x: 80, y: 80 }, // an opponent moves too
    { t_ms: 1000, token_id: "away-3", x: 60, y: 80 },
    { t_ms: 0, token_id: "ball", x: 50, y: 50 },
    { t_ms: 1000, token_id: "ball", x: 70, y: 30 },
  ];
  const pb = buildKeyframePlayback(keyframes);

  it("takes duration from the last keyframe", () => {
    expect(pb.durationMs).toBe(1000);
    expect(pb.ballTokenId).toBe("ball");
  });

  it("interpolates each token between its own keyframes", () => {
    const mid = pb.sample(500);
    near(mid.actors.get("home-9")!.x, 20);
    near(mid.actors.get("away-3")!.x, 70); // opponents replay identically
    near(mid.ball!.x, 60);
  });

  it("clamps before the first and after the last sample", () => {
    near(pb.sample(-100).actors.get("home-9")!.x, 10);
    near(pb.sample(9999).actors.get("home-9")!.x, 30);
  });
});

describe("keyframe playback: snapshot anchors a mid-recording drag", () => {
  const snapshot: BoardSnapshot = {
    tokens: [{ id: "home-7", side: "home", label: "7", x: 15, y: 60 }],
    confirmed_lanes: [],
    blocking_threshold: 7,
    marking_threshold: 10,
    zones_visible: [],
  };
  // home-7 is first captured at t=400 (its drag started mid recording).
  const keyframes: Keyframe[] = [
    { t_ms: 400, token_id: "home-7", x: 15, y: 60 },
    { t_ms: 800, token_id: "home-7", x: 35, y: 60 },
  ];
  const pb = buildKeyframePlayback(keyframes, snapshot);

  it("holds the token at its scene position before its first keyframe", () => {
    const early = pb.sample(100).actors.get("home-7")!;
    near(early.x, 15); // from the snapshot, not a teleport
    near(early.y, 60);
  });
});

describe("format abstraction: player consumes both without knowing the format", () => {
  const declarative: Playback = buildDeclarativePlayback(DEMO_SPEC, DEMO_BINDING);
  const recorded: Playback = buildKeyframePlayback([
    { t_ms: 0, token_id: "ball", x: 0, y: 0 },
    { t_ms: 500, token_id: "ball", x: 100, y: 100 },
  ]);

  it("both expose the same Playback surface", () => {
    for (const pb of [declarative, recorded]) {
      expect(typeof pb.durationMs).toBe("number");
      expect(typeof pb.sample).toBe("function");
      const f = pb.sample(pb.durationMs / 2);
      expect(f.actors instanceof Map).toBe(true);
      expect(Array.isArray(f.badges)).toBe(true);
      expect("ball" in f && "caption" in f && "ballTrajectory" in f).toBe(true);
    }
  });

  it("keeps captions declarative-only (recordings carry none)", () => {
    expect(recorded.sample(250).caption).toBeNull();
    expect(declarative.sample(0).caption).not.toBeNull();
  });
});
