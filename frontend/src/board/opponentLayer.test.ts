// Opponent layer tests (T-105). The load-bearing property is the round trip:
// a shape crossed into our frame and back out must be unchanged, exactly.

import { describe, expect, it } from "vitest";
import {
  OPPONENT_TOKEN_PREFIX,
  isOpponentTokenId,
  mirrorOpponentShape,
  opponentPhaseTokens,
  opponentTokenId,
  ourPhaseTokens,
  ourTokenId,
  slotOfTokenId,
} from "./opponentLayer";
import { mirrorOpponent } from "./superiority";
import type { SlotPos } from "./superiorityTypes";

function at(slot: string, position_code: string, x: number, y: number): SlotPos {
  return { slot, position_code, x, y };
}

/** A 4-4-2 mid block as it would be seeded, in THEIR own frame. */
const THEIR_442: SlotPos[] = [
  at("GK", "GK", 5, 50),
  at("RB", "RB", 20, 18),
  at("RCB", "CB", 18, 40),
  at("LCB", "CB", 18, 60),
  at("LB", "LB", 20, 82),
  at("RM", "RM", 40, 18),
  at("RCM", "CM", 38, 40),
  at("LCM", "CM", 38, 60),
  at("LM", "LM", 40, 82),
  at("ST1", "ST", 60, 42),
  at("ST2", "ST", 60, 58),
];

describe("mirrorOpponentShape", () => {
  it("round trips a whole shape unchanged", () => {
    expect(mirrorOpponentShape(mirrorOpponentShape(THEIR_442))).toEqual(THEIR_442);
  });

  it("round trips every integer point on the pitch, not just the fixture", () => {
    const grid: SlotPos[] = [];
    for (let x = 0; x <= 100; x += 1) {
      for (let y = 0; y <= 100; y += 1) grid.push(at(`s${x}_${y}`, "X", x, y));
    }
    expect(mirrorOpponentShape(mirrorOpponentShape(grid))).toEqual(grid);
  });

  it("uses mirrorOpponent and nothing else, point for point", () => {
    const crossed = mirrorOpponentShape(THEIR_442);
    THEIR_442.forEach((p, i) => {
      expect({ x: crossed[i].x, y: crossed[i].y }).toEqual(mirrorOpponent({ x: p.x, y: p.y }));
    });
  });

  it("puts their goalkeeper in front of our forwards", () => {
    // Their keeper is authored at x = 5 in their frame. In ours he must be deep
    // in the attacking third, not standing in our own goal.
    const gk = mirrorOpponentShape(THEIR_442).find((p) => p.slot === "GK");
    expect(gk).toEqual({ slot: "GK", position_code: "GK", x: 95, y: 50 });
  });

  it("keeps slot identity and position code across the mirror", () => {
    const crossed = mirrorOpponentShape(THEIR_442);
    expect(crossed.map((p) => p.slot)).toEqual(THEIR_442.map((p) => p.slot));
    expect(crossed.map((p) => p.position_code)).toEqual(THEIR_442.map((p) => p.position_code));
  });

  it("does not clamp, because clamping would break the round trip", () => {
    const offPitch = [at("X", "X", 120, -15)];
    expect(mirrorOpponentShape(offPitch)).toEqual([at("X", "X", -20, 115)]);
    expect(mirrorOpponentShape(mirrorOpponentShape(offPitch))).toEqual(offPitch);
  });

  it("does not mutate its input", () => {
    const before = JSON.parse(JSON.stringify(THEIR_442));
    mirrorOpponentShape(THEIR_442);
    expect(THEIR_442).toEqual(before);
  });
});

describe("token ids", () => {
  it("namespaces opponents and leaves our own slot ids bare", () => {
    expect(ourTokenId("LB")).toBe("LB");
    expect(opponentTokenId("LB")).toBe(`${OPPONENT_TOKEN_PREFIX}LB`);
    expect(opponentTokenId("LB")).not.toBe(ourTokenId("LB"));
  });

  it("recovers the slot from either side", () => {
    expect(slotOfTokenId(ourTokenId("LB"))).toBe("LB");
    expect(slotOfTokenId(opponentTokenId("LB"))).toBe("LB");
    expect(isOpponentTokenId(opponentTokenId("LB"))).toBe(true);
    expect(isOpponentTokenId(ourTokenId("LB"))).toBe(false);
  });
});

describe("token building", () => {
  const OUR_433: SlotPos[] = [
    at("GK", "GK", 5, 50),
    at("LB", "LB", 22, 84),
    at("ST", "ST", 72, 50),
  ];

  it("renders our slots as home tokens, keystones pulsing and labelled", () => {
    const tokens = ourPhaseTokens(OUR_433, { keystoneSlots: ["LB"] });
    expect(tokens).toEqual([
      { id: "GK", side: "home", label: "", pos: { x: 5, y: 50 }, pulsing: undefined },
      { id: "LB", side: "home", label: "LB", pos: { x: 22, y: 84 }, pulsing: true },
      { id: "ST", side: "home", label: "", pos: { x: 72, y: 50 }, pulsing: undefined },
    ]);
  });

  it("renders opponents in the board's existing opponent colour slot", () => {
    // "away" is the side tokens.ts already paints with TOKEN_FILL.away, the
    // colour the board defines for recorded opponents (doc 06 section 5.1).
    const tokens = opponentPhaseTokens(THEIR_442);
    expect(tokens.every((t) => t.side === "away")).toBe(true);
    expect(tokens.every((t) => t.pulsing === undefined)).toBe(true);
  });

  it("places opponent tokens through the mirror, never in the raw frame", () => {
    const tokens = opponentPhaseTokens(THEIR_442);
    const crossed = mirrorOpponentShape(THEIR_442);
    expect(tokens.map((t) => t.pos)).toEqual(crossed.map((p) => ({ x: p.x, y: p.y })));
    expect(tokens.map((t) => t.id)).toEqual(THEIR_442.map((p) => opponentTokenId(p.slot)));
  });

  it("labels opponents blank by default and honours an override", () => {
    expect(opponentPhaseTokens(THEIR_442).every((t) => t.label === "")).toBe(true);
    const labelled = opponentPhaseTokens(THEIR_442, { labelOf: (p) => p.position_code });
    expect(labelled[0].label).toBe("GK");
  });

  it("gives our tokens and their tokens disjoint ids even on identical slots", () => {
    const ourIds = new Set(ourPhaseTokens(THEIR_442).map((t) => t.id));
    const theirIds = opponentPhaseTokens(THEIR_442).map((t) => t.id);
    expect(theirIds.some((id) => ourIds.has(id))).toBe(false);
  });
});
