// Unit tests for the Tactics Lab's copy and naming helpers (T-106, doc 06
// sections 2.1, 2.2, 2.8, 5.1, 5.2). These are the sentences a coach reads,
// so they get asserted like content, not like plumbing: the ratio must
// leave the display name, a breach must never read as an error, and every
// read line must name which superiority it is talking about.

import { describe, expect, it } from "vitest";
import {
  breachCheck,
  defaultOpponentVariant,
  inferredRouteLine,
  laneBoundaries,
  lineBoundaries,
  NO_BREACH_CHECK,
  NO_SEEDED_MATCHUP_NOTE,
  polygonCentroid,
  ringCentre,
  rondoDisplayName,
  shortLine,
  slotLabel,
  spareLine,
  variantsForPhase,
  zoneReadLine,
} from "./formationsLab";
import { BALL_FALLBACK_ADVANCED_COUNT } from "../board/superiority";
import type { GridBreach, MatchupRead, SlotPos, ZoneCount } from "../board/superiorityTypes";
import type { FormationPhaseWire } from "../tacticsApi";

function phase(variant_code: string, phaseName: FormationPhaseWire["phase"]): FormationPhaseWire {
  return {
    formation_code: "433",
    variant_code,
    phase: phaseName,
    name: variant_code,
    shape_label: "3-2-5",
    blurb: "",
    positions: [],
    trigger: "",
    rest_shape: null,
    reference_code: null,
    uses_rotations: [],
  };
}

function count(over: Partial<ZoneCount> = {}): ZoneCount {
  return {
    zoneKey: "midfield_box",
    ours: 4,
    theirs: 2,
    delta: 2,
    label: "4v2",
    verdict: "superiority",
    superiorityKind: "numerical",
    anchorX: 50,
    ...over,
  };
}

describe("rondoDisplayName", () => {
  it("takes the ratio out of the display name", () => {
    expect(rondoDisplayName("5v3 (the midfield box)")).toBe("The midfield box");
    // The whole point of the epic: no ratio survives in the name a coach
    // reads next to a live one.
    expect(rondoDisplayName("5v3 (the midfield box)")).not.toMatch(/\dv\d/);
  });

  it("takes the LAST parenthetical, so a ratio may contain one", () => {
    expect(rondoDisplayName("2v2 (+1 keeper) (the last line)")).toBe("The last line");
  });

  it("handles a slashed ratio", () => {
    expect(rondoDisplayName("4v2 / 3v2 (first-line build-up)")).toBe("First-line build-up");
  });

  it("keeps a name with no parenthetical whole", () => {
    expect(rondoDisplayName("The half-space pocket")).toBe("The half-space pocket");
  });

  it("returns the counterpress ring's name without its ratio", () => {
    expect(rondoDisplayName("4v4+3 (the counterpress ring)")).toBe("The counterpress ring");
  });

  it("never returns a ratio, which is what canonical_rondo is for", () => {
    // Regression guard on the workaround T-112 deleted. splitRondoName used
    // to hand back a `seededRatio` because canonical_rondo was not on the
    // wire; the chip now reads the column, and nothing here may go back to
    // synthesising a ratio from a display name.
    for (const seeded of [
      "4v2 / 3v2 (first-line build-up)",
      "5v3 (the midfield box)",
      "2v1 to 2v2 (the flank corridor)",
      "2v2 (+1 keeper) (the last line)",
      "4v4+3 (the counterpress ring)",
    ]) {
      expect(rondoDisplayName(seeded)).not.toMatch(/\dv\d/);
    }
  });
});

describe("ringCentre (doc 06 section 2.3)", () => {
  function slot(s: string, x: number, y: number): SlotPos {
    return { slot: s, position_code: "cm", x, y };
  }

  // The 4-3-3's three most advanced at base (seeds/formations.json): the
  // striker at x 88 and both wingers at x 76.5, which average to 80.333.
  const shape: SlotPos[] = [
    slot("gk", 5, 50),
    slot("cb_l", 22, 40),
    slot("cb_r", 22, 60),
    slot("six", 42, 50),
    slot("eight_l", 58, 36),
    slot("eight_r", 58, 64),
    slot("w_l", 76.5, 12),
    slot("w_r", 76.5, 88),
    slot("st", 88, 50),
  ];

  it("centres on the centroid of our three most advanced when no ball is placed", () => {
    const c = ringCentre(shape, null);
    expect(c?.x).toBeCloseTo((88 + 76.5 + 76.5) / 3, 6);
    expect(c?.y).toBeCloseTo((50 + 12 + 88) / 3, 6);
  });

  it("uses exactly three, the engine's own BALL_FALLBACK_ADVANCED_COUNT", () => {
    expect(BALL_FALLBACK_ADVANCED_COUNT).toBe(3);
    // A fourth player just behind the front three must not move the centre.
    const withDeeper = [...shape, slot("am", 70, 50)];
    expect(ringCentre(withDeeper, null)).toEqual(ringCentre(shape, null));
  });

  it("moves when the shape advances, which is the teaching point", () => {
    const base = ringCentre(shape, null);
    const pushedOn = ringCentre(
      shape.map((s) => (s.x > 70 ? { ...s, x: s.x + 8 } : s)),
      null
    );
    expect(pushedOn?.x).toBeGreaterThan(base?.x ?? 0);
  });

  it("prefers a placed ball over the fallback", () => {
    expect(ringCentre(shape, { x: 30, y: 20 })).toEqual({ x: 30, y: 20 });
  });

  it("does not depend on the order the caller built the array", () => {
    const reversed = [...shape].reverse();
    expect(ringCentre(reversed, null)).toEqual(ringCentre(shape, null));
  });

  it("breaks an x tie by slot rather than by array order", () => {
    // Four players on the same x: which three are picked must be decided by
    // the data, not by whoever built the list.
    const tied: SlotPos[] = [
      slot("d", 80, 10),
      slot("a", 80, 20),
      slot("c", 80, 30),
      slot("b", 80, 40),
    ];
    expect(ringCentre(tied, null)).toEqual(ringCentre([...tied].reverse(), null));
    // a, b, c win on slot order: y averages 20, 40, 30.
    expect(ringCentre(tied, null)?.y).toBeCloseTo(30, 6);
  });

  it("has no centre when there is nobody to centre on", () => {
    expect(ringCentre([], null)).toBeNull();
  });

  it("averages fewer than three when fewer are on the pitch", () => {
    expect(ringCentre([slot("a", 60, 20), slot("b", 40, 40)], null)).toEqual({ x: 50, y: 30 });
  });
});

describe("phase selection", () => {
  it("filters variants to one phase and keeps API order", () => {
    const phases = [
      phase("in_possession", "in_possession"),
      phase("in_possession_alt", "in_possession"),
      phase("out_of_possession", "out_of_possession"),
    ];
    expect(variantsForPhase(phases, "in_possession").map((p) => p.variant_code)).toEqual([
      "in_possession",
      "in_possession_alt",
    ]);
    expect(variantsForPhase(phases, "base")).toEqual([]);
    expect(variantsForPhase(phases, "rest_defence")).toEqual([]);
  });

  it("defaults the opponent picker to an out-of-possession variant", () => {
    const phases = [phase("in_possession", "in_possession"), phase("mid_block", "out_of_possession")];
    expect(defaultOpponentVariant(phases)).toBe("mid_block");
  });

  it("falls back to the first variant, then to their base shape", () => {
    expect(defaultOpponentVariant([phase("only_ip", "in_possession")])).toBe("only_ip");
    expect(defaultOpponentVariant([])).toBeNull();
  });
});

describe("slotLabel", () => {
  it("keeps position codes upper case and expands the side suffix", () => {
    expect(slotLabel("cb")).toBe("CB");
    expect(slotLabel("cb_l")).toBe("CB left");
    expect(slotLabel("wb_far")).toBe("WB far");
    expect(slotLabel("middle_cb")).toBe("Middle CB");
    expect(slotLabel("far_fullback")).toBe("Far fullback");
  });

  it("keeps the code upper case mid-sentence while the leading word stays lower", () => {
    expect(slotLabel("third_cb", false)).toBe("third CB");
    expect(slotLabel("pivot", false)).toBe("pivot");
  });
});

describe("zoneReadLine", () => {
  it("names numerical superiority and carries the computed label", () => {
    const line = zoneReadLine(count(), null);
    expect(line).toContain("Numerical superiority");
    expect(line).toContain("4v2");
  });

  it("names numerical inferiority without calling the shape wrong", () => {
    const line = zoneReadLine(
      count({ ours: 2, theirs: 3, delta: -1, label: "2v3", verdict: "inferiority", superiorityKind: null }),
      null
    );
    expect(line).toContain("Numerical inferiority");
    expect(line.toLowerCase()).not.toContain("invalid");
    expect(line.toLowerCase()).not.toContain("wrong");
  });

  it("promotes parity to POSITIONAL superiority when a free man is in there", () => {
    const parity = count({ ours: 3, theirs: 3, delta: 0, label: "3v3", verdict: "parity", superiorityKind: "positional" });
    const line = zoneReadLine(parity, "Positional superiority: alone in the centre.");
    expect(line).toContain("Parity on bodies at 3v3");
    expect(line).toContain("Positional superiority");
  });

  it("says plainly when parity is just parity", () => {
    const parity = count({ ours: 3, theirs: 3, delta: 0, label: "3v3", verdict: "parity", superiorityKind: null });
    const line = zoneReadLine(parity, null);
    expect(line).toContain("Parity: 3v3");
    expect(line).toContain("no positional edge");
  });
});

describe("the read", () => {
  const read: MatchupRead = {
    spare: count({ zoneKey: "midfield_box" }),
    short: count({
      zoneKey: "last_line",
      ours: 1,
      theirs: 3,
      delta: -2,
      label: "1v3",
      verdict: "inferiority",
      superiorityKind: null,
    }),
    route: "through",
    routeInferred: true,
    seededCard: null,
  };
  const naming = (key: string) => (key === "midfield_box" ? "the midfield box" : "the last line");

  it("names the superiority on both steps", () => {
    expect(spareLine(read, naming)).toBe("Numerical superiority in the midfield box: 4v2.");
    expect(shortLine(read, naming)).toBe("Numerical inferiority in the last line: 1v3.");
  });

  it("labels an inferred route as inferred and hedges it", () => {
    const line = inferredRouteLine(read);
    expect(line).toContain("rather than from a coached card");
    expect(line).toContain("probably");
  });

  it("says plainly that an unseeded pair has no coached read", () => {
    expect(NO_SEEDED_MATCHUP_NOTE).toContain("no coached read yet");
    expect(NO_SEEDED_MATCHUP_NOTE).toContain("computed live");
  });

  it("reports no spare or short zone as null rather than inventing one", () => {
    const empty: MatchupRead = { spare: null, short: null, route: "over", routeInferred: true, seededCard: null };
    expect(spareLine(empty, naming)).toBeNull();
    expect(shortLine(empty, naming)).toBeNull();
  });
});

describe("breachCheck", () => {
  const cases: GridBreach[] = [
    { kind: "lane_over", cell: "left_half_space", count: 3, slots: ["a", "b", "c"] },
    { kind: "wide_lane_shared", cell: "right_wing", count: 2, slots: ["a", "b"] },
    { kind: "line_over", cell: "last_line", count: 4, slots: ["a", "b", "c", "d"] },
    { kind: "line_over", cell: "own_build", count: 5, slots: ["a", "b", "c", "d", "e"] },
  ];

  it("matches doc 06 section 5.2's own example wording", () => {
    expect(breachCheck(cases[0])).toBe(
      "Three in the left half-space. Intentional overload, or is someone standing in a teammate's zone?"
    );
  });

  it("is always a question, never a verdict", () => {
    for (const c of cases) {
      const copy = breachCheck(c);
      expect(copy.endsWith("?"), copy).toBe(true);
      expect(copy.toLowerCase()).not.toContain("invalid");
      expect(copy.toLowerCase()).not.toContain("wrong");
      expect(copy.toLowerCase()).not.toContain("error");
    }
  });

  it("spells the count as a word so it reads as a sentence", () => {
    expect(breachCheck(cases[1]).startsWith("Two ")).toBe(true);
    expect(breachCheck(cases[2]).startsWith("Four ")).toBe(true);
    expect(breachCheck(cases[3]).startsWith("Five ")).toBe(true);
  });

  it("names the superiority when nothing breaches", () => {
    expect(NO_BREACH_CHECK).toContain("positional superiority");
  });
});

describe("overlay geometry", () => {
  it("draws only the interior grid boundaries", () => {
    expect(laneBoundaries()).toEqual([19, 37, 63, 81]);
    expect(lineBoundaries()).toEqual([22, 42, 60, 78]);
  });

  it("centres a chip on the mean vertex of its polygon", () => {
    expect(
      polygonCentroid([
        { x: 35, y: 15 },
        { x: 65, y: 15 },
        { x: 65, y: 85 },
        { x: 35, y: 85 },
      ])
    ).toEqual({ x: 50, y: 50 });
    expect(polygonCentroid([])).toEqual({ x: 50, y: 50 });
  });
});
