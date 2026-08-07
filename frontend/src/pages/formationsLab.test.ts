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
  shortLine,
  slotLabel,
  spareLine,
  splitRondoName,
  variantsForPhase,
  zoneReadLine,
} from "./formationsLab";
import type { GridBreach, MatchupRead, ZoneCount } from "../board/superiorityTypes";
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

describe("splitRondoName", () => {
  it("takes the ratio out of the display name", () => {
    const split = splitRondoName("5v3 (the midfield box)");
    expect(split.displayName).toBe("The midfield box");
    expect(split.seededRatio).toBe("5v3");
    // The whole point of the epic: no computed-looking ratio survives in
    // the name a coach reads next to a live one.
    expect(split.displayName).not.toMatch(/\dv\d/);
  });

  it("splits on the LAST parenthetical, so a ratio may contain one", () => {
    const split = splitRondoName("2v2 (+1 keeper) (the last line)");
    expect(split.displayName).toBe("The last line");
    expect(split.seededRatio).toBe("2v2 (+1 keeper)");
  });

  it("handles a slashed ratio", () => {
    const split = splitRondoName("4v2 / 3v2 (first-line build-up)");
    expect(split.displayName).toBe("First-line build-up");
    expect(split.seededRatio).toBe("4v2 / 3v2");
  });

  it("keeps a name with no parenthetical whole and reports no ratio", () => {
    const split = splitRondoName("The half-space pocket");
    expect(split.displayName).toBe("The half-space pocket");
    expect(split.seededRatio).toBe("");
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
