// Regression test (T-030): FrameLoop.stop() must actually stop the loop when
// called from WITHIN its own callback (this is exactly what
// PlayerController.tick() does when a playback reaches its end: elapsed >=
// duration -> this.loop.stop(); this.onEnd?.()). A prior version rescheduled
// the next frame AFTER invoking the callback, which silently overwrote
// stop()'s handle = null with a fresh handle, so a finished playback kept
// firing onFrame/onEnd forever at 60fps. Concretely this broke T-030's
// whiteboard autosave: every post-playback onEnd() call set React state
// again, which never let the save debounce settle.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrameLoop } from "./time";

describe("FrameLoop", () => {
  let frameCallbacks: FrameRequestCallback[] = [];
  let nextHandle = 1;
  const canceled = new Set<number>();

  beforeEach(() => {
    frameCallbacks = [];
    nextHandle = 1;
    canceled.clear();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const handle = nextHandle++;
      frameCallbacks.push(Object.assign(cb, { __handle: handle }));
      return handle;
    });
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
      canceled.add(handle);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Runs whichever queued callbacks have not been canceled since being queued.
  function runPendingFrame(t: number) {
    const due = frameCallbacks;
    frameCallbacks = [];
    for (const cb of due) {
      const handle = (cb as unknown as { __handle: number }).__handle;
      if (canceled.has(handle)) continue;
      cb(t);
    }
  }

  it("stop() called from inside the callback prevents any further frame", () => {
    let calls = 0;
    const loop = new FrameLoop(() => {
      calls++;
      if (calls === 2) loop.stop();
    });

    loop.start();
    expect(loop.running).toBe(true);

    runPendingFrame(16); // frame 1: calls = 1, keeps running
    expect(calls).toBe(1);
    expect(loop.running).toBe(true);

    runPendingFrame(32); // frame 2: calls = 2, calls stop() mid-callback
    expect(calls).toBe(2);
    expect(loop.running).toBe(false);

    // The critical assertion: no further frame is pending, so nothing runs
    // even if the browser were to fire another rAF tick.
    runPendingFrame(48);
    runPendingFrame(64);
    expect(calls).toBe(2);
  });

  it("running reflects whether a frame is still scheduled", () => {
    const loop = new FrameLoop(() => {});
    expect(loop.running).toBe(false);
    loop.start();
    expect(loop.running).toBe(true);
    loop.stop();
    expect(loop.running).toBe(false);
  });
});
