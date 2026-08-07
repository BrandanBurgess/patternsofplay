// Phase morph tests (T-105). Written against the contract, not the
// implementation: slot identity survives the morph, coordinates that do not
// change do not move by so much as an ulp, and both endpoints are exact.

import { describe, expect, it } from "vitest";
import {
  PHASE_MORPH_MS,
  bindOpponentPhases,
  bindOurPhases,
  bindPhasesBySlot,
  buildPhaseMorphPlayback,
  easeInOutCubic,
  morphToPhase,
  type SlotMorph,
} from "./phaseMorph";
import { mirrorOpponentShape, opponentTokenId, ourTokenId } from "./opponentLayer";
import { modelToRender } from "./coords";
import type { SlotPos } from "./superiorityTypes";

function at(slot: string, position_code: string, x: number, y: number): SlotPos {
  return { slot, position_code, x, y };
}

/** 4-3-3 base shape. Eleven slots, the identity every phase shares. */
const BASE_433: SlotPos[] = [
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

/** 3-2-5 in possession: the left back tucks into the pivot, wingers hold width. */
const IN_POSSESSION_325: SlotPos[] = [
  at("GK", "GK", 12, 50),
  at("RB", "RB", 30, 20),
  at("RCB", "CB", 24, 42),
  at("LCB", "CB", 24, 58),
  at("LB", "DM", 44, 56), // the walk doc 06 section 2.4 names: LB into midfield
  at("RCM", "CM", 66, 28),
  at("DM", "DM", 44, 44),
  at("LCM", "CM", 66, 72),
  at("RW", "W", 82, 8),
  at("ST", "ST", 88, 50),
  at("LW", "W", 82, 92),
];

function samples(n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i += 1) out.push((PHASE_MORPH_MS * i) / n);
  return out;
}

describe("bindPhasesBySlot", () => {
  it("pairs every slot and reports no drift for a valid pair of phases", () => {
    const b = bindOurPhases(BASE_433, IN_POSSESSION_325);
    expect(b.morphs).toHaveLength(11);
    expect(b.droppedSlots).toEqual([]);
    expect(b.addedSlots).toEqual([]);
    expect(b.morphs.map((m) => m.slot).sort()).toEqual(BASE_433.map((p) => p.slot).sort());
  });

  it("binds by slot and NOT by array index", () => {
    // Same eleven slots, deliberately shuffled. Index binding would send the
    // goalkeeper to the striker's spot; slot binding cannot.
    const shuffled = [...IN_POSSESSION_325].reverse();
    const byIndex = bindOurPhases(BASE_433, IN_POSSESSION_325);
    const byShuffle = bindOurPhases(BASE_433, shuffled);
    expect(byShuffle.morphs).toEqual(byIndex.morphs);

    const gk = byShuffle.morphs.find((m) => m.slot === "GK")!;
    expect(gk.to).toEqual({ x: 12, y: 50 });
  });

  it("binds by slot and NOT by position code", () => {
    // Two slots share the position code "CB", and one of them changes code
    // entirely (LB becomes a DM). Neither may confuse the pairing.
    const b = bindOurPhases(BASE_433, IN_POSSESSION_325);
    const lb = b.morphs.find((m) => m.slot === "LB")!;
    expect(lb.from).toEqual({ x: 22, y: 84 });
    expect(lb.to).toEqual({ x: 44, y: 56 });
    expect(lb.position_code).toBe("DM");
    expect(b.morphs.filter((m) => m.position_code === "CB").map((m) => m.slot)).toEqual([
      "RCB",
      "LCB",
    ]);
  });

  it("marks slots whose coordinates are identical in both phases as not moving", () => {
    const b = bindOurPhases(BASE_433, BASE_433);
    expect(b.morphs.every((m) => m.moves)).toBe(false);
    expect(b.morphs.some((m) => m.moves)).toBe(false);
  });

  it("marks a slot that moves at all as moving", () => {
    const b = bindOurPhases(BASE_433, IN_POSSESSION_325);
    expect(b.morphs.every((m) => m.moves)).toBe(true);
  });

  it("emits one morph per slot, never two tokens for one slot", () => {
    const b = bindOurPhases(BASE_433, IN_POSSESSION_325);
    expect(new Set(b.morphs.map((m) => m.tokenId)).size).toBe(b.morphs.length);
  });

  it("reports a dropped slot and holds it in place instead of vanishing it", () => {
    const to = IN_POSSESSION_325.filter((p) => p.slot !== "LW");
    const b = bindOurPhases(BASE_433, to);
    expect(b.droppedSlots).toEqual(["LW"]);
    const lw = b.morphs.find((m) => m.slot === "LW")!;
    expect(lw.from).toEqual(lw.to);
    expect(lw.moves).toBe(false);
  });

  it("reports an added slot and places it already at its destination", () => {
    const from = BASE_433.filter((p) => p.slot !== "ST");
    const b = bindOurPhases(from, IN_POSSESSION_325);
    expect(b.addedSlots).toEqual(["ST"]);
    const st = b.morphs.find((m) => m.slot === "ST")!;
    expect(st.from).toEqual({ x: 88, y: 50 });
    expect(st.to).toEqual({ x: 88, y: 50 });
  });

  it("uses the token id function it is given", () => {
    const b = bindPhasesBySlot(BASE_433, IN_POSSESSION_325, (s) => `x-${s}`);
    expect(b.morphs[0].tokenId).toBe("x-GK");
  });

  it("does not mutate either phase", () => {
    const beforeFrom = JSON.parse(JSON.stringify(BASE_433));
    const beforeTo = JSON.parse(JSON.stringify(IN_POSSESSION_325));
    bindOurPhases(BASE_433, IN_POSSESSION_325);
    expect(BASE_433).toEqual(beforeFrom);
    expect(IN_POSSESSION_325).toEqual(beforeTo);
  });
});

describe("easeInOutCubic", () => {
  it("hits both endpoints exactly", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it("is symmetric about the midpoint and monotone", () => {
    expect(easeInOutCubic(0.5)).toBe(0.5);
    let prev = -1;
    for (let i = 0; i <= 200; i += 1) {
      const v = easeInOutCubic(i / 200);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("stays inside [0, 1] so no token ever overshoots its target", () => {
    for (let i = 0; i <= 200; i += 1) {
      const v = easeInOutCubic(i / 200);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("buildPhaseMorphPlayback", () => {
  const binding = bindOurPhases(BASE_433, IN_POSSESSION_325);
  const pb = buildPhaseMorphPlayback(binding.morphs);

  it("runs for 600ms, once, with no ball and no badges", () => {
    expect(pb.durationMs).toBe(600);
    expect(PHASE_MORPH_MS).toBe(600);
    expect(pb.loop).toBe(false);
    expect(pb.ballTokenId).toBeNull();
    const frame = pb.sample(300);
    expect(frame.ball).toBeNull();
    expect(frame.badges).toEqual([]);
    expect(frame.ballTrajectory).toBeNull();
  });

  it("starts every slot exactly on its from position", () => {
    const f = pb.sample(0);
    for (const m of binding.morphs) expect(f.actors.get(m.tokenId)).toEqual(m.from);
  });

  it("lands every slot exactly on its to position", () => {
    const f = pb.sample(PHASE_MORPH_MS);
    for (const m of binding.morphs) expect(f.actors.get(m.tokenId)).toEqual(m.to);
  });

  it("clamps outside its window rather than extrapolating", () => {
    for (const m of binding.morphs) {
      expect(pb.sample(-5000).actors.get(m.tokenId)).toEqual(m.from);
      expect(pb.sample(99999).actors.get(m.tokenId)).toEqual(m.to);
    }
  });

  it("moves every slot at once, as one continuous token each", () => {
    // Every slot in this pair moves, and it must be the SAME token id from the
    // first frame to the last: eleven actors at t=0, the same eleven at the end,
    // and every intermediate position strictly on that slot's own segment.
    const first = pb.sample(0);
    const last = pb.sample(PHASE_MORPH_MS);
    expect(first.actors.size).toBe(11);
    expect([...first.actors.keys()].sort()).toEqual([...last.actors.keys()].sort());

    for (const m of binding.morphs) {
      const dx = m.to.x - m.from.x;
      const dy = m.to.y - m.from.y;
      const len = Math.hypot(dx, dy);
      for (const t of samples(24)) {
        const p = pb.sample(t).actors.get(m.tokenId)!;
        // Cross product of (to - from) and (p - from) is zero on the segment.
        const cross = dx * (p.y - m.from.y) - dy * (p.x - m.from.x);
        expect(Math.abs(cross)).toBeLessThan(1e-9);
        const travelled = Math.hypot(p.x - m.from.x, p.y - m.from.y);
        expect(travelled).toBeGreaterThanOrEqual(-1e-9);
        expect(travelled).toBeLessThanOrEqual(len + 1e-9);
      }
    }
  });

  it("advances monotonically, so no token doubles back mid morph", () => {
    for (const m of binding.morphs) {
      let prev = -1;
      for (const t of samples(60)) {
        const p = pb.sample(t).actors.get(m.tokenId)!;
        const travelled = Math.hypot(p.x - m.from.x, p.y - m.from.y);
        expect(travelled).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = travelled;
      }
    }
  });

  it("does not jitter a slot whose coordinates are identical in both phases", () => {
    // The DoD case. A phase change usually moves only part of the shape; every
    // slot that stays put must be bit-for-bit still on every single frame, not
    // "still to within a rounding error", because a sub-pixel wobble across the
    // untouched two thirds of the shape is exactly what makes a morph look like
    // a glitch rather than a walk.
    const to = IN_POSSESSION_325.map((p) =>
      p.slot === "LB" ? p : BASE_433.find((b) => b.slot === p.slot)!
    );
    const partial = bindOurPhases(BASE_433, to);
    expect(partial.morphs.filter((m) => m.moves).map((m) => m.slot)).toEqual(["LB"]);

    const player = buildPhaseMorphPlayback(partial.morphs);
    for (const m of partial.morphs) {
      if (m.moves) continue;
      const start = BASE_433.find((b) => b.slot === m.slot)!;
      for (const t of samples(120)) {
        // toEqual on the object, and Object.is on each number, so a -0 or a
        // one-ulp drift would both fail.
        const p = player.sample(t).actors.get(m.tokenId)!;
        expect(p).toEqual({ x: start.x, y: start.y });
        expect(Object.is(p.x, start.x)).toBe(true);
        expect(Object.is(p.y, start.y)).toBe(true);
      }
    }
  });

  it("does not jitter when NOTHING moves", () => {
    const still = buildPhaseMorphPlayback(bindOurPhases(BASE_433, BASE_433).morphs);
    for (const t of samples(120)) {
      const f = still.sample(t);
      for (const p of BASE_433) expect(f.actors.get(p.slot)).toEqual({ x: p.x, y: p.y });
    }
  });

  it("is deterministic: the same time always yields the same frame", () => {
    for (const t of samples(30)) {
      expect([...pb.sample(t).actors.entries()]).toEqual([...pb.sample(t).actors.entries()]);
    }
    const rebuilt = buildPhaseMorphPlayback(bindOurPhases(BASE_433, IN_POSSESSION_325).morphs);
    expect([...pb.sample(217).actors.entries()]).toEqual([...rebuilt.sample(217).actors.entries()]);
  });

  it("is frozen at build time against later mutation of the caller's array", () => {
    const morphs: SlotMorph[] = [
      { slot: "A", position_code: "A", tokenId: "A", from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, moves: true },
    ];
    const frozen = buildPhaseMorphPlayback(morphs);
    morphs[0].to = { x: 90, y: 90 };
    expect(frozen.sample(PHASE_MORPH_MS).actors.get("A")).toEqual({ x: 10, y: 10 });
  });

  it("carries the caption for the strip under the board", () => {
    const withCaption = buildPhaseMorphPlayback(binding.morphs, {
      caption: "3-2-5, single inverted fullback. Goal kick against a two striker press.",
    });
    expect(withCaption.sample(0).caption).toContain("3-2-5");
    expect(withCaption.sample(PHASE_MORPH_MS).caption).toContain("3-2-5");
    expect(pb.sample(0).caption).toBeNull();
  });

  it("accepts an override duration and resolves a zero-length morph at t=0", () => {
    expect(buildPhaseMorphPlayback(binding.morphs, { durationMs: 250 }).durationMs).toBe(250);
    const instant = buildPhaseMorphPlayback(binding.morphs, { durationMs: 0 });
    for (const m of binding.morphs) expect(instant.sample(0).actors.get(m.tokenId)).toEqual(m.to);
  });

  it("moves a ball only when a phase actually defines one", () => {
    const withBall = buildPhaseMorphPlayback(binding.morphs, {
      ball: { from: { x: 10, y: 50 }, to: { x: 40, y: 20 } },
    });
    expect(withBall.ballTokenId).toBe("ball");
    expect(withBall.sample(0).ball).toEqual({ x: 10, y: 50 });
    expect(withBall.sample(PHASE_MORPH_MS).ball).toEqual({ x: 40, y: 20 });
  });
});

describe("opponent phases morph by slot too", () => {
  const THEIR_442_MID: SlotPos[] = [
    at("GK", "GK", 5, 50),
    at("RB", "RB", 20, 18),
    at("ST1", "ST", 60, 42),
  ];
  const THEIR_442_HIGH: SlotPos[] = [
    at("GK", "GK", 14, 50),
    at("RB", "RB", 34, 14),
    at("ST1", "ST", 78, 44),
  ];

  it("mirrors both phases into our frame, so no coordinate is authored there", () => {
    const b = bindOpponentPhases(THEIR_442_MID, THEIR_442_HIGH);
    const fromCrossed = mirrorOpponentShape(THEIR_442_MID);
    const toCrossed = mirrorOpponentShape(THEIR_442_HIGH);
    b.morphs.forEach((m, i) => {
      expect(m.from).toEqual({ x: fromCrossed[i].x, y: fromCrossed[i].y });
      expect(m.to).toEqual({ x: toCrossed[i].x, y: toCrossed[i].y });
      expect(m.tokenId).toBe(opponentTokenId(m.slot));
    });
    expect(b.droppedSlots).toEqual([]);
    expect(b.addedSlots).toEqual([]);
  });

  it("keeps our slots and theirs apart even when the slot ids collide", () => {
    const morph = morphToPhase({
      from: { ours: BASE_433, theirs: THEIR_442_MID },
      to: { ours: IN_POSSESSION_325, theirs: THEIR_442_HIGH },
    });
    const f = morph.playback.sample(PHASE_MORPH_MS);
    // "GK" exists on both sides. Our keeper and theirs must be two tokens.
    expect(f.actors.get(ourTokenId("GK"))).toEqual({ x: 12, y: 50 });
    expect(f.actors.get(opponentTokenId("GK"))).toEqual({ x: 86, y: 50 });
    expect(f.actors.size).toBe(11 + 3);
  });
});

describe("portrait is render only", () => {
  // The morph never mentions orientation. This proves the consequence: a phone
  // portrait board shows the same morph because coords.ts maps each sampled
  // model point at draw time (left = y, top = 100 - x), and for no other reason.
  const binding = bindOurPhases(BASE_433, IN_POSSESSION_325);
  const pb = buildPhaseMorphPlayback(binding.morphs);

  it("renders each slot's portrait path as the exact image of its model path", () => {
    for (const m of binding.morphs) {
      for (const t of samples(30)) {
        const p = pb.sample(t).actors.get(m.tokenId)!;
        expect(modelToRender(p, "portrait")).toEqual({ left: p.y, top: 100 - p.x });
      }
    }
  });

  it("ends the morph with the left back higher up a portrait board than he started", () => {
    // The doc 06 section 2.4 walk, read the way a phone shows it: smaller `top`
    // is further up the screen toward the attacking goal.
    const lb = binding.morphs.find((m) => m.slot === "LB")!;
    const start = modelToRender(pb.sample(0).actors.get(lb.tokenId)!, "portrait");
    const end = modelToRender(pb.sample(PHASE_MORPH_MS).actors.get(lb.tokenId)!, "portrait");
    expect(end.top).toBeLessThan(start.top);
  });

  it("holds a still slot perfectly still in portrait as well as landscape", () => {
    const still = buildPhaseMorphPlayback(bindOurPhases(BASE_433, BASE_433).morphs);
    for (const t of samples(60)) {
      for (const p of BASE_433) {
        const here = still.sample(t).actors.get(p.slot)!;
        expect(modelToRender(here, "portrait")).toEqual({ left: p.y, top: 100 - p.x });
      }
    }
  });
});

describe("morphToPhase", () => {
  const THEIRS: SlotPos[] = [at("GK", "GK", 5, 50), at("ST1", "ST", 60, 42)];

  it("hands back the RESULTING scene as tokens, not the origin", () => {
    const m = morphToPhase({ from: { ours: BASE_433 }, to: { ours: IN_POSSESSION_325 } });
    expect(m.tokens.map((t) => t.pos)).toEqual(
      IN_POSSESSION_325.map((p) => ({ x: p.x, y: p.y }))
    );
    // And the playback settles on exactly those, so the imperative animation and
    // the React-rendered scene agree at the end of the morph.
    const f = m.playback.sample(PHASE_MORPH_MS);
    for (const t of m.tokens) expect(f.actors.get(t.id)).toEqual(t.pos);
  });

  it("includes mirrored opponent tokens in the resulting scene", () => {
    const m = morphToPhase({ from: { ours: BASE_433, theirs: THEIRS }, to: { ours: BASE_433, theirs: THEIRS } });
    const opp = m.tokens.filter((t) => t.side === "away");
    expect(opp.map((t) => t.pos)).toEqual(
      mirrorOpponentShape(THEIRS).map((p) => ({ x: p.x, y: p.y }))
    );
    expect(m.theirs).not.toBeNull();
  });

  it("drops the opponent layer entirely when opposition is switched off", () => {
    const m = morphToPhase({ from: { ours: BASE_433, theirs: THEIRS }, to: { ours: BASE_433 } });
    expect(m.theirs).toBeNull();
    expect(m.tokens.every((t) => t.side === "home")).toBe(true);
    expect(m.playback.sample(0).actors.size).toBe(11);
  });

  it("shows a newly revealed opponent block already in place", () => {
    const m = morphToPhase({ from: { ours: BASE_433 }, to: { ours: BASE_433, theirs: THEIRS } });
    expect(m.theirs!.addedSlots).toEqual(["GK", "ST1"]);
    const start = m.playback.sample(0);
    const end = m.playback.sample(PHASE_MORPH_MS);
    for (const t of m.tokens) expect(start.actors.get(t.id)).toEqual(end.actors.get(t.id));
  });

  it("passes keystones and captions through", () => {
    const m = morphToPhase({
      from: { ours: BASE_433 },
      to: { ours: IN_POSSESSION_325 },
      caption: "3-2-5. Against a two striker press.",
      ourTokens: { keystoneSlots: ["LB"] },
    });
    expect(m.tokens.find((t) => t.id === "LB")!.pulsing).toBe(true);
    expect(m.playback.sample(0).caption).toBe("3-2-5. Against a two striker press.");
  });
});
