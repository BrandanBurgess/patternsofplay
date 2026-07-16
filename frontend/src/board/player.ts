// Animation player controller (T-022, Brief step 14). Owns the ONE timing model
// (time.ts FrameLoop) for playback, exactly as the drag pipeline and recorder do
// for their work, so the player, the recorder, and drags all sample on the same
// clock (board-engine skill: one coordinate and timing model shared by player
// and recorder).
//
// The controller is format-agnostic: it drives a `Playback` (see playback.ts),
// which is the abstraction over declarative specs AND raw recordings. It only
// advances time and hands each sampled frame to an onFrame callback; the Board
// supplies onFrame to write posRef, move token DOM, update the trace overlay, and
// keep lanes/rings live (T-021 handoff answer 1). Keeping DOM out of here means
// the timing logic stays testable and reusable.

import { FrameLoop, now } from "./time";
import type { Playback, PlaybackFrame } from "./playback";

export type PlayerOnFrame = (frame: PlaybackFrame, tMs: number) => void;
export type PlayerOnEnd = () => void;

export class PlayerController {
  private readonly loop: FrameLoop;
  private playback: Playback | null = null;
  private onFrame: PlayerOnFrame | null = null;
  private onEnd: PlayerOnEnd | null = null;
  private startMs = 0;

  constructor() {
    this.loop = new FrameLoop(() => this.tick());
  }

  get playing(): boolean {
    return this.loop.running;
  }

  /** Start (or restart) a playback from t=0. */
  play(playback: Playback, onFrame: PlayerOnFrame, onEnd: PlayerOnEnd): void {
    this.stop();
    this.playback = playback;
    this.onFrame = onFrame;
    this.onEnd = onEnd;
    this.startMs = now();
    // Paint the opening frame immediately so t=0 shows before the first rAF.
    this.onFrame(playback.sample(0), 0);
    this.loop.start();
  }

  /** Replay the current playback from its start. */
  restart(): void {
    if (!this.playback || !this.onFrame || !this.onEnd) return;
    this.play(this.playback, this.onFrame, this.onEnd);
  }

  stop(): void {
    this.loop.stop();
  }

  private tick(): void {
    const pb = this.playback;
    const onFrame = this.onFrame;
    if (!pb || !onFrame) return;
    let elapsed = now() - this.startMs;

    if (elapsed >= pb.durationMs) {
      if (pb.loop && pb.durationMs > 0) {
        // Rotations loop (doc 03 4.1 loop: true): wrap the clock and keep going.
        this.startMs += pb.durationMs;
        elapsed -= pb.durationMs;
        onFrame(pb.sample(elapsed), elapsed);
        return;
      }
      // Settle exactly on the final frame, then stop and notify.
      onFrame(pb.sample(pb.durationMs), pb.durationMs);
      this.loop.stop();
      this.onEnd?.();
      return;
    }
    onFrame(pb.sample(elapsed), elapsed);
  }
}
