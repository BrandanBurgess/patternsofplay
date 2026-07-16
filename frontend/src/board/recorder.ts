// Recorder (T-022, Brief step 15). Captures timestamped keyframes of every drag
// on EVERY token (teammates, opponents, and the ball), in landscape MODEL
// coordinates, exactly as recorded (doc 03 4.2: keep raw, do not convert to the
// declarative format). It shares the ONE clock with the player and the drag
// pipeline (time.ts now()), so a recording replays on the same timeline it was
// captured on.
//
// This class is pure state over that clock: no DOM, no React. The Board calls
// capture() from the same per-frame drag flush that moves tokens, so a recording
// samples motion at the same rate it is drawn.

import type { Keyframe } from "./animationTypes";
import type { ModelPoint } from "./coords";
import { now } from "./time";

export class Recorder {
  private active = false;
  private startMs = 0;
  private frames: Keyframe[] = [];

  get recording(): boolean {
    return this.active;
  }

  /** Begin a fresh capture. Time zero is this moment on the shared clock. */
  start(startTime: number = now()): void {
    this.active = true;
    this.startMs = startTime;
    this.frames = [];
  }

  /**
   * Record one token at its current model position. A no-op unless recording,
   * so the Board can call it unconditionally from the drag flush. Every token id
   * is valid: opponents and the ball record exactly like teammates.
   */
  capture(tokenId: string, pos: ModelPoint, at: number = now()): void {
    if (!this.active) return;
    this.frames.push({
      t_ms: at - this.startMs,
      token_id: tokenId,
      x: pos.x,
      y: pos.y,
    });
  }

  /** Stop and hand back the captured keyframes (doc 03 4.2 keyframes_json). */
  stop(): Keyframe[] {
    this.active = false;
    return this.frames;
  }

  /** Live count, for a recording indicator. */
  get length(): number {
    return this.frames.length;
  }
}
