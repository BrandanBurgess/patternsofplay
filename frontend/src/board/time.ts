// Shared timing model for the board engine. The drag pipeline (T-020), the
// animation player (T-021), and the recorder (T-022) all move and sample tokens
// on the SAME clock: requestAnimationFrame. Recompute and redraw happen per
// frame, never on timers (board-engine skill: "throttle to animation frames,
// never to timers"). Keeping one timing primitive here means recordings and
// playback share a single notion of "a frame" and of elapsed milliseconds.

export type FrameCallback = (nowMs: number, deltaMs: number) => void;

/**
 * A single requestAnimationFrame loop. Callers subscribe a callback that runs
 * once per frame with a monotonic timestamp and the delta since the previous
 * frame. Timestamps come from performance.now() so recorder keyframes and
 * player playback share one time base.
 */
export class FrameLoop {
  private handle: number | null = null;
  private last = 0;
  private readonly cb: FrameCallback;

  constructor(cb: FrameCallback) {
    this.cb = cb;
  }

  get running(): boolean {
    return this.handle !== null;
  }

  start(): void {
    if (this.handle !== null) return;
    this.last = now();
    const tick = () => {
      const t = now();
      const delta = t - this.last;
      this.last = t;
      // Schedule the NEXT frame BEFORE running the callback, not after: the
      // callback (PlayerController.tick) may itself call stop() when a
      // playback finishes, and stop() only has anything to cancel if the
      // next frame's handle has already been recorded. Scheduling after the
      // callback would silently overwrite stop()'s handle = null with a
      // fresh handle every time, so the loop could never actually stop
      // itself from inside its own callback (it would keep re-running, and
      // re-firing onEnd, forever at 60fps after the animation ended).
      this.handle = requestAnimationFrame(tick);
      this.cb(t, delta);
    };
    this.handle = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.handle !== null) {
      cancelAnimationFrame(this.handle);
      this.handle = null;
    }
  }
}

/** Monotonic clock in milliseconds. One source for drags, playback, recording. */
export function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Coalesces bursty input (pointermove fires far faster than the display) into
 * at most one unit of work per animation frame. The drag pipeline pushes raw
 * pointer coordinates in; the flush runs on the frame. Player and recorder can
 * reuse the same pattern so nothing is throttled to a timer.
 */
export class FrameScheduler {
  private handle: number | null = null;
  private readonly run: () => void;

  constructor(run: () => void) {
    this.run = run;
  }

  schedule(): void {
    if (this.handle !== null) return;
    this.handle = requestAnimationFrame(() => {
      this.handle = null;
      this.run();
    });
  }

  cancel(): void {
    if (this.handle !== null) {
      cancelAnimationFrame(this.handle);
      this.handle = null;
    }
  }
}
