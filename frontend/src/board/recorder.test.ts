// Recorder tests (T-022, Brief step 15). The recorder captures every token, not
// just teammates, as timestamped model-space keyframes on the shared clock, and
// what it produces is exactly the doc 03 4.2 shape the keyframe player replays.

import { describe, expect, it } from "vitest";
import { Recorder } from "./recorder";
import { buildKeyframePlayback } from "./playback";

describe("Recorder", () => {
  it("captures teammates, opponents, and the ball as timestamped keyframes", () => {
    const rec = new Recorder();
    rec.start(1000);
    rec.capture("home-9", { x: 10, y: 20 }, 1000);
    rec.capture("away-3", { x: 80, y: 40 }, 1200); // an opponent
    rec.capture("ball", { x: 50, y: 50 }, 1200); // and the ball
    rec.capture("home-9", { x: 30, y: 20 }, 1500);
    const frames = rec.stop();

    expect(frames).toHaveLength(4);
    // Times are relative to start, positions are the raw model coords.
    expect(frames[0]).toEqual({ t_ms: 0, token_id: "home-9", x: 10, y: 20 });
    expect(frames[1]).toEqual({ t_ms: 200, token_id: "away-3", x: 80, y: 40 });
    expect(frames[2].token_id).toBe("ball");
    expect(new Set(frames.map((f) => f.token_id))).toEqual(
      new Set(["home-9", "away-3", "ball"])
    );
  });

  it("ignores capture() unless recording, so the drag flush can call it blindly", () => {
    const rec = new Recorder();
    rec.capture("home-1", { x: 1, y: 1 }); // before start: dropped
    expect(rec.length).toBe(0);
    rec.start(0);
    rec.capture("home-1", { x: 1, y: 1 }, 10);
    expect(rec.length).toBe(1);
    rec.stop();
    rec.capture("home-1", { x: 2, y: 2 }); // after stop: dropped
    expect(rec.length).toBe(1);
  });

  it("produces keyframes a keyframe Playback can replay directly", () => {
    const rec = new Recorder();
    rec.start(0);
    rec.capture("home-9", { x: 0, y: 0 }, 0);
    rec.capture("home-9", { x: 20, y: 0 }, 1000);
    const pb = buildKeyframePlayback(rec.stop());
    expect(pb.durationMs).toBe(1000);
    expect(pb.sample(500).actors.get("home-9")!.x).toBeCloseTo(10, 6);
  });
});
