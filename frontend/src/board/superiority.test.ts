// Superiority engine tests (T-104), written BEFORE superiority.ts exists. Doc 06
// section 4 is the contract. The mirror round-trip property test is first in the
// file because it was first in the working order: no mirror code existed when it
// was written, exactly as the T-020 coords round-trip precedent demands.
//
// Everything here is in LANDSCAPE MODEL coordinates (CLAUDE.md rule 8). No test
// in this file mentions orientation, because the engine never sees it.

import { describe, expect, it } from "vitest";
import type { ModelPoint } from "./coords";
import { cellKey } from "./grid";
import {
  DEFAULT_PRESS_RADIUS,
  SUPERIORITY_ZONE_KEYS,
  buildRead,
  classifyRestDefence,
  countZone,
  findFreeMen,
  mirrorOpponent,
  pointInCircle,
  pointInPolygon,
} from "./superiority";
import type { FormationMatchup, SlotPos, SuperiorityZone } from "./superiorityTypes";

function at(slot: string, x: number, y: number): SlotPos {
  return { slot, position_code: "XX", x, y };
}

/** An axis-aligned rectangular zone, the common case, as a polygon. */
function rect(zoneKey: string, x0: number, y0: number, x1: number, y1: number): SuperiorityZone {
  return {
    zoneKey,
    kind: "polygon",
    polygon: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
  };
}

// ---------------------------------------------------------------------------
// 1. mirrorOpponent. The involutive property, tested across the whole grid.
// ---------------------------------------------------------------------------

describe("mirrorOpponent", () => {
  it("rotates 180 degrees about the pitch centre", () => {
    expect(mirrorOpponent({ x: 0, y: 0 })).toEqual({ x: 100, y: 100 });
    expect(mirrorOpponent({ x: 50, y: 50 })).toEqual({ x: 50, y: 50 });
    expect(mirrorOpponent({ x: 80, y: 19 })).toEqual({ x: 20, y: 81 });
  });

  it("is EXACTLY involutive across the full integer pitch grid (10201 points)", () => {
    let checked = 0;
    for (let x = 0; x <= 100; x += 1) {
      for (let y = 0; y <= 100; y += 1) {
        const p: ModelPoint = { x, y };
        const back = mirrorOpponent(mirrorOpponent(p));
        // Object.is, not toBeCloseTo: the contract is exactness, and -0 would be a bug.
        if (!Object.is(back.x, p.x) || !Object.is(back.y, p.y)) {
          throw new Error(`mirror not involutive at (${x},${y}), got (${back.x},${back.y})`);
        }
        checked += 1;
      }
    }
    expect(checked).toBe(101 * 101);
  });

  it("stays involutive for integers outside the pitch, so it never silently clamps", () => {
    for (let x = -50; x <= 150; x += 7) {
      for (let y = -50; y <= 150; y += 11) {
        expect(mirrorOpponent(mirrorOpponent({ x, y }))).toEqual({ x, y });
      }
    }
  });

  it("maps the half-space band onto the opposite half-space band", () => {
    // Left half-space is y 19 to 37; mirrored it must land in the right half-space, 63 to 81.
    expect(mirrorOpponent({ x: 30, y: 19 }).y).toBe(81);
    expect(mirrorOpponent({ x: 30, y: 37 }).y).toBe(63);
  });

  it("does not mutate its input", () => {
    const p = { x: 12, y: 34 };
    mirrorOpponent(p);
    expect(p).toEqual({ x: 12, y: 34 });
  });
});

// ---------------------------------------------------------------------------
// 2. Geometry. Boundary counts as INSIDE, and the ray must survive a vertex.
// ---------------------------------------------------------------------------

describe("pointInPolygon: boundary counts as inside", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it("accepts interior points and rejects exterior points", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: -1, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: 5, y: 11 }, square)).toBe(false);
  });

  it("accepts every vertex", () => {
    for (const v of square) expect(pointInPolygon(v, square)).toBe(true);
  });

  it("accepts points lying on every edge", () => {
    expect(pointInPolygon({ x: 5, y: 0 }, square)).toBe(true);
    expect(pointInPolygon({ x: 10, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 10 }, square)).toBe(true);
    expect(pointInPolygon({ x: 0, y: 5 }, square)).toBe(true);
  });

  it("does not leak along the extension of a horizontal edge", () => {
    expect(pointInPolygon({ x: 20, y: 0 }, square)).toBe(false);
    expect(pointInPolygon({ x: -20, y: 10 }, square)).toBe(false);
  });

  describe("the classic bug: the ray passes exactly through a vertex", () => {
    // A diamond whose left and right vertices both sit at y = 5, so a horizontal
    // ray at y = 5 hits two vertices dead on. Naive ray casting double counts.
    const diamond = [
      { x: 5, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 10 },
      { x: 0, y: 5 },
    ];

    it("still calls the outside point outside", () => {
      expect(pointInPolygon({ x: 12, y: 5 }, diamond)).toBe(false);
      expect(pointInPolygon({ x: -2, y: 5 }, diamond)).toBe(false);
    });

    it("still calls the inside point inside", () => {
      expect(pointInPolygon({ x: 5, y: 5 }, diamond)).toBe(true);
    });

    it("calls the two grazed vertices inside, because the boundary is inside", () => {
      expect(pointInPolygon({ x: 10, y: 5 }, diamond)).toBe(true);
      expect(pointInPolygon({ x: 0, y: 5 }, diamond)).toBe(true);
    });

    it("handles a ray grazing the apex of a triangle", () => {
      const tri = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ];
      expect(pointInPolygon({ x: 20, y: 10 }, tri)).toBe(false);
      expect(pointInPolygon({ x: 5, y: 10 }, tri)).toBe(true); // the apex itself
      expect(pointInPolygon({ x: 5, y: 1 }, tri)).toBe(true);
    });
  });

  it("respects a concave notch", () => {
    // An L shape. The notch at (8,8) is outside even though it is inside the bbox.
    const ell = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon({ x: 2, y: 2 }, ell)).toBe(true);
    expect(pointInPolygon({ x: 8, y: 2 }, ell)).toBe(true);
    expect(pointInPolygon({ x: 2, y: 8 }, ell)).toBe(true);
    expect(pointInPolygon({ x: 8, y: 8 }, ell)).toBe(false);
    expect(pointInPolygon({ x: 4, y: 4 }, ell)).toBe(true); // reflex vertex
  });

  it("gives the same answer whichever way the polygon is wound", () => {
    const reversed = [...square].reverse();
    for (const p of [{ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 15, y: 5 }, { x: 5, y: 0 }]) {
      expect(pointInPolygon(p, reversed)).toBe(pointInPolygon(p, square));
    }
  });

  it("returns false for degenerate polygons rather than throwing", () => {
    expect(pointInPolygon({ x: 1, y: 1 }, [])).toBe(false);
    expect(pointInPolygon({ x: 1, y: 1 }, [{ x: 0, y: 0 }])).toBe(false);
    // A two point "polygon" is a segment: only the segment itself counts.
    expect(pointInPolygon({ x: 1, y: 0 }, [{ x: 0, y: 0 }, { x: 2, y: 0 }])).toBe(true);
    expect(pointInPolygon({ x: 1, y: 1 }, [{ x: 0, y: 0 }, { x: 2, y: 0 }])).toBe(false);
  });
});

describe("pointInCircle: boundary counts as inside, matching the polygon rule", () => {
  const centre = { x: 50, y: 50 };
  it("accepts the centre and interior", () => {
    expect(pointInCircle(centre, centre, 18)).toBe(true);
    expect(pointInCircle({ x: 60, y: 55 }, centre, 18)).toBe(true);
  });
  it("accepts a point exactly on the rim", () => {
    expect(pointInCircle({ x: 68, y: 50 }, centre, 18)).toBe(true);
    expect(pointInCircle({ x: 50, y: 32 }, centre, 18)).toBe(true);
    expect(pointInCircle({ x: 53, y: 54 }, centre, 5)).toBe(true); // 3-4-5 triangle
  });
  it("rejects a point just outside the rim", () => {
    expect(pointInCircle({ x: 68.5, y: 50 }, centre, 18)).toBe(false);
  });
  it("treats a zero radius as the single centre point", () => {
    expect(pointInCircle(centre, centre, 0)).toBe(true);
    expect(pointInCircle({ x: 50.1, y: 50 }, centre, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. countZone.
// ---------------------------------------------------------------------------

describe("countZone", () => {
  const midfieldBox = rect(SUPERIORITY_ZONE_KEYS.midfieldBox, 40, 30, 70, 70);

  it("counts both sides, labels the ratio, and reports the delta", () => {
    const ours = [at("6", 45, 50), at("8L", 55, 40), at("8R", 55, 60), at("10", 65, 50)];
    const theirs = [at("d6", 60, 45), at("d8", 62, 55)];
    const c = countZone(midfieldBox, ours, theirs);
    expect(c.zoneKey).toBe("midfield_box");
    expect(c.ours).toBe(4);
    expect(c.theirs).toBe(2);
    expect(c.delta).toBe(2);
    expect(c.label).toBe("4v2");
    expect(c.verdict).toBe("superiority");
    expect(c.superiorityKind).toBe("numerical");
  });

  it("calls equal counts parity with no superiority kind", () => {
    const c = countZone(midfieldBox, [at("6", 45, 50)], [at("d6", 60, 45)]);
    expect(c.delta).toBe(0);
    expect(c.label).toBe("1v1");
    expect(c.verdict).toBe("parity");
    expect(c.superiorityKind).toBeNull();
  });

  it("calls being outnumbered inferiority", () => {
    const c = countZone(midfieldBox, [at("6", 45, 50)], [at("a", 60, 45), at("b", 62, 55)]);
    expect(c.delta).toBe(-1);
    expect(c.label).toBe("1v2");
    expect(c.verdict).toBe("inferiority");
    expect(c.superiorityKind).toBeNull();
  });

  it("upgrades parity to POSITIONAL superiority when one of ours in the zone is a free man", () => {
    const ours = [at("10", 65, 50)];
    const theirs = [at("d6", 45, 45)];
    const c = countZone(midfieldBox, ours, theirs, new Set(["10"]));
    expect(c.verdict).toBe("parity");
    expect(c.superiorityKind).toBe("positional");
  });

  it("ignores a free man who is standing outside the zone", () => {
    const c = countZone(midfieldBox, [at("10", 65, 50)], [at("d6", 45, 45)], new Set(["LW"]));
    expect(c.superiorityKind).toBeNull();
  });

  it("keeps numerical when we are already up bodies, even with a free man there", () => {
    const ours = [at("8", 55, 40), at("10", 65, 50)];
    const c = countZone(midfieldBox, ours, [at("d6", 45, 45)], new Set(["10"]));
    expect(c.superiorityKind).toBe("numerical");
  });

  it("counts a player standing exactly on the zone edge as inside", () => {
    const c = countZone(midfieldBox, [at("6", 40, 50)], []);
    expect(c.ours).toBe(1);
    expect(c.label).toBe("1v0");
  });

  it("counts inside a ball-relative circle zone", () => {
    const ring: SuperiorityZone = {
      zoneKey: SUPERIORITY_ZONE_KEYS.counterpressRing,
      kind: "circle",
      centre: { x: 70, y: 50 },
      radius: 18,
    };
    const ours = [at("8", 60, 50), at("10", 70, 60), at("LW", 20, 20)];
    const theirs = [at("d6", 88, 50)]; // exactly on the rim, so inside
    const c = countZone(ring, ours, theirs);
    expect(c.ours).toBe(2);
    expect(c.theirs).toBe(1);
    expect(c.label).toBe("2v1");
  });

  it("exposes an anchorX so buildRead can break ties toward our own goal", () => {
    expect(countZone(midfieldBox, [], []).anchorX).toBe(55);
    const ring: SuperiorityZone = {
      zoneKey: "counterpress_ring",
      kind: "circle",
      centre: { x: 70, y: 50 },
      radius: 18,
    };
    expect(countZone(ring, [], []).anchorX).toBe(70);
  });

  it("handles an empty pitch without dividing by anything", () => {
    const c = countZone(midfieldBox, [], []);
    expect(c.label).toBe("0v0");
    expect(c.verdict).toBe("parity");
  });
});

// ---------------------------------------------------------------------------
// 4. findFreeMen.
// ---------------------------------------------------------------------------

describe("findFreeMen", () => {
  it("defaults the press radius to 8 model units", () => {
    expect(DEFAULT_PRESS_RADIUS).toBe(8);
  });

  it("finds one of ours alone in a cell, unpressed, between two of their lines", () => {
    const ours = [at("10", 65, 28)];
    const theirs = [at("d6", 50, 28), at("cb", 85, 28)];
    const free = findFreeMen(ours, theirs);
    expect(free).toHaveLength(1);
    expect(free[0].slot).toBe("10");
    expect(free[0].cell.key).toBe(cellKey("left_half_space", "between_the_lines"));
  });

  it("names the superiority it is talking about in coach-facing copy", () => {
    const free = findFreeMen([at("10", 65, 28)], [at("d6", 50, 28), at("cb", 85, 28)]);
    const why = free[0].whyItMatters;
    expect(why).toContain("Positional superiority");
    expect(why).toContain("left half-space");
    // Built from the code point, never typed literally: check_copy.py scans this
    // file too, and an assertion that spells out the banned character fails CI.
    expect(why).not.toContain(String.fromCharCode(0x2014)); // em dash
    expect(why).not.toContain(String.fromCharCode(0x2013)); // en dash
    expect(why.length).toBeGreaterThan(40);
  });

  it("does not call a pressed player free", () => {
    // The presser sits in the neighbouring cell, so only the press rule can bite.
    const ours = [at("10", 65, 28)];
    const theirs = [at("d6", 50, 28), at("cb", 85, 28), at("presser", 59, 28)];
    expect(findFreeMen(ours, theirs)).toEqual([]);
  });

  it("treats a defender exactly at the press radius as pressing", () => {
    const ours = [at("10", 65, 28)];
    const base = [at("d6", 50, 28), at("cb", 85, 28)];
    // x 57 puts the presser in the next line band, so the cell rule stays out of it.
    expect(findFreeMen(ours, [...base, at("p", 57, 28)])).toEqual([]); // distance exactly 8
    expect(findFreeMen(ours, [...base, at("p", 56.9, 28)])).toHaveLength(1);
  });

  it("honours a custom press radius", () => {
    const ours = [at("10", 65, 28)];
    const theirs = [at("d6", 50, 28), at("cb", 85, 28), at("p", 65, 40)]; // 12 away
    expect(findFreeMen(ours, theirs)).toHaveLength(1);
    expect(findFreeMen(ours, theirs, 14)).toEqual([]);
  });

  it("does not call a player free when a teammate shares the cell", () => {
    const ours = [at("10", 65, 28), at("8", 66, 30)];
    const theirs = [at("d6", 50, 28), at("cb", 85, 28)];
    expect(findFreeMen(ours, theirs)).toEqual([]);
  });

  it("does not call a player free when an opponent shares the cell", () => {
    const ours = [at("10", 65, 28)];
    const theirs = [at("d6", 50, 28), at("cb", 85, 28), at("marker", 76, 20)];
    // The marker shares the cell but sits more than 8 away, so only the cell rule bites.
    expect(findFreeMen(ours, theirs)).toEqual([]);
  });

  it("requires opponents both in front and behind: being between their LINES is the point", () => {
    // Nobody behind this striker, so he has run beyond their last line rather than
    // found a pocket between two of them. Offside, not free.
    const ours = [at("ST", 90, 50)];
    const theirs = [at("cb1", 95, 20), at("cb2", 96, 80)];
    expect(findFreeMen(ours, theirs)).toEqual([]);
    // Add a deeper opponent line and the same player is now genuinely between lines.
    expect(findFreeMen(ours, [at("cb1", 95, 20), at("d6", 55, 50)])).toHaveLength(1);
  });

  it("returns free men in the input order of ours, deterministically", () => {
    const ours = [at("A", 65, 28), at("B", 65, 72)];
    const theirs = [at("d1", 50, 50), at("d2", 90, 50)];
    expect(findFreeMen(ours, theirs).map((f) => f.slot)).toEqual(["A", "B"]);
    expect(findFreeMen(ours, theirs)).toEqual(findFreeMen(ours, theirs));
  });

  it("finds nobody when there are no opponents at all", () => {
    expect(findFreeMen([at("10", 65, 28)], [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. classifyRestDefence.
// ---------------------------------------------------------------------------

describe("classifyRestDefence", () => {
  it("splits the players behind the ball into a last line and a screen at a 12 unit gap", () => {
    const ours = [
      at("CB1", 20, 40),
      at("CB2", 20, 60),
      at("CB3", 22, 50),
      at("6", 40, 45),
      at("8", 42, 55),
      at("ST", 85, 50), // ahead of the ball, not counted
    ];
    const r = classifyRestDefence(ours, 60);
    expect(r.behindBall).toBe(5);
    expect(r.lastLine).toBe(3);
    expect(r.screen).toBe(2);
    expect(r.shape).toBe("3+2");
  });

  it("reads a 4+2", () => {
    const ours = [
      at("LB", 18, 15),
      at("CB1", 20, 40),
      at("CB2", 20, 60),
      at("RB", 18, 85),
      at("6", 38, 45),
      at("8", 40, 55),
    ];
    expect(classifyRestDefence(ours, 70).shape).toBe("4+2");
  });

  it("reads a 2+3", () => {
    const ours = [
      at("CB1", 15, 40),
      at("CB2", 15, 60),
      at("LB", 45, 20),
      at("6", 44, 50),
      at("RB", 45, 80),
    ];
    const r = classifyRestDefence(ours, 75);
    expect(r.lastLine).toBe(2);
    expect(r.screen).toBe(3);
    expect(r.shape).toBe("2+3");
  });

  it("puts everyone on the last line when there is no 12 unit gap anywhere", () => {
    const ours = [at("A", 20, 30), at("B", 25, 50), at("C", 30, 70), at("D", 34, 50)];
    const r = classifyRestDefence(ours, 60);
    expect(r.lastLine).toBe(4);
    expect(r.screen).toBe(0);
    expect(r.shape).toBe("4+0");
  });

  it("splits at the FIRST gap wider than 12, so the deepest cluster is the last line", () => {
    const ours = [at("A", 10, 30), at("B", 12, 60), at("C", 40, 45), at("D", 55, 50)];
    const r = classifyRestDefence(ours, 80);
    expect(r.lastLine).toBe(2);
    expect(r.screen).toBe(2);
  });

  it("treats a gap of exactly 12 as the same line, so the split needs a real gap", () => {
    const ours = [at("A", 20, 30), at("B", 32, 60)];
    expect(classifyRestDefence(ours, 90).shape).toBe("2+0");
    expect(classifyRestDefence([at("A", 20, 30), at("B", 32.5, 60)], 90).shape).toBe("1+1");
  });

  it("excludes anyone level with or ahead of the ball", () => {
    const ours = [at("A", 20, 50), at("B", 60, 50), at("C", 70, 50)];
    expect(classifyRestDefence(ours, 60).behindBall).toBe(1);
  });

  it("falls back to the centroid of our three most advanced when no ball is set", () => {
    const ours = [
      at("CB1", 20, 40),
      at("CB2", 20, 60),
      at("6", 40, 50),
      at("LW", 80, 15),
      at("ST", 85, 50),
      at("RW", 90, 85),
    ];
    // Three most advanced are 80, 85, 90; centroid x = 85. Four players sit behind it,
    // and the first gap wider than 12 falls between the 20s and the 40.
    const r = classifyRestDefence(ours, null);
    expect(r.behindBall).toBe(4);
    expect(r.shape).toBe("2+2");
  });

  it("uses every player for the fallback centroid when fewer than three exist", () => {
    const r = classifyRestDefence([at("A", 10, 50), at("B", 50, 50)], null);
    expect(r.behindBall).toBe(1); // centroid x = 30
    expect(r.shape).toBe("1+0");
  });

  it("reports zeros when nobody is behind the ball", () => {
    expect(classifyRestDefence([at("ST", 90, 50)], 10)).toEqual({
      shape: "0+0",
      behindBall: 0,
      lastLine: 0,
      screen: 0,
    });
  });

  it("is stable when two players share an x, breaking the tie by slot", () => {
    const a = classifyRestDefence([at("Z", 20, 30), at("A", 20, 70), at("M", 50, 50)], 70);
    const b = classifyRestDefence([at("A", 20, 70), at("M", 50, 50), at("Z", 20, 30)], 70);
    expect(a).toEqual(b);
  });

  it("does not mutate the caller's array", () => {
    const ours = [at("C", 40, 50), at("A", 10, 50), at("B", 20, 50)];
    classifyRestDefence(ours, 80);
    expect(ours.map((o) => o.slot)).toEqual(["C", "A", "B"]);
  });
});

// ---------------------------------------------------------------------------
// 6. buildRead.
// ---------------------------------------------------------------------------

describe("buildRead", () => {
  function zone(zoneKey: string, ours: number, theirs: number, anchorX: number) {
    return countZone(
      { zoneKey, kind: "circle", centre: { x: anchorX, y: 50 }, radius: 200 },
      Array.from({ length: ours }, (_, i) => at(`o${zoneKey}${i}`, anchorX, 50)),
      Array.from({ length: theirs }, (_, i) => at(`t${zoneKey}${i}`, anchorX, 50))
    );
  }

  const K = SUPERIORITY_ZONE_KEYS;

  it("picks the spare man from the highest positive delta and the shortage from the lowest", () => {
    const zones = [
      zone(K.firstLine, 4, 2, 15),
      zone(K.midfieldBox, 5, 3, 50),
      zone(K.flankCorridorLeft, 1, 3, 40),
      zone(K.lastLine, 2, 4, 85),
    ];
    const read = buildRead(zones, null);
    // Both positives are +2, so the tie breaks toward our own goal: anchorX 15 wins.
    expect(read.spare?.zoneKey).toBe(K.firstLine);
    // Both negatives are -2, so the same tie-break applies: anchorX 40 wins.
    expect(read.short?.zoneKey).toBe(K.flankCorridorLeft);
  });

  it("breaks a spare-man tie toward our own goal (the lower anchorX)", () => {
    const zones = [zone(K.lastLine, 3, 1, 85), zone(K.firstLine, 3, 1, 15)];
    expect(buildRead(zones, null).spare?.zoneKey).toBe(K.firstLine);
  });

  it("breaks a shortage tie toward our own goal too", () => {
    const zones = [zone(K.lastLine, 1, 3, 85), zone(K.firstLine, 1, 3, 15)];
    expect(buildRead(zones, null).short?.zoneKey).toBe(K.firstLine);
  });

  it("returns null for spare or short when there is nothing to say", () => {
    const read = buildRead([zone(K.midfieldBox, 3, 3, 50)], null);
    expect(read.spare).toBeNull();
    expect(read.short).toBeNull();
  });

  it("handles an empty zone list", () => {
    const read = buildRead([], null);
    expect(read.spare).toBeNull();
    expect(read.short).toBeNull();
    expect(read.route).toBe("over");
    expect(read.seededCard).toBeNull();
  });

  describe("route inference when no card is seeded", () => {
    it("infers THROUGH when we are up in the midfield box", () => {
      const read = buildRead([zone(K.midfieldBox, 5, 3, 50)], null);
      expect(read.route).toBe("through");
      expect(read.routeInferred).toBe(true);
    });

    it("infers AROUND when the midfield box is not ours but a flank corridor is", () => {
      const zones = [zone(K.midfieldBox, 3, 3, 50), zone(K.flankCorridorRight, 2, 1, 50)];
      expect(buildRead(zones, null).route).toBe("around");
    });

    it("infers AROUND from the left corridor as well as the right", () => {
      const zones = [zone(K.midfieldBox, 2, 4, 50), zone(K.flankCorridorLeft, 2, 1, 50)];
      expect(buildRead(zones, null).route).toBe("around");
    });

    it("infers OVER when neither the box nor either flank is ours", () => {
      const zones = [
        zone(K.midfieldBox, 2, 4, 50),
        zone(K.flankCorridorLeft, 1, 2, 50),
        zone(K.flankCorridorRight, 1, 2, 50),
      ];
      expect(buildRead(zones, null).route).toBe("over");
    });

    it("prefers THROUGH over AROUND when both are available", () => {
      const zones = [zone(K.midfieldBox, 5, 3, 50), zone(K.flankCorridorLeft, 3, 1, 50)];
      expect(buildRead(zones, null).route).toBe("through");
    });
  });

  describe("a seeded card wins", () => {
    const card: FormationMatchup = {
      ours_code: "433",
      theirs_code: "442",
      our_edges: ["Their two banks leave the half-spaces open."],
      their_edges: ["Two strikers on your two centre backs."],
      route: "Third man into the half-space, then in behind the fullback.",
      route_kind: "around",
    };

    it("takes the seeded route_kind even when inference would say otherwise", () => {
      const read = buildRead([zone(K.midfieldBox, 5, 3, 50)], card);
      expect(read.route).toBe("around");
      expect(read.routeInferred).toBe(false);
      expect(read.seededCard).toBe(card);
    });

    it("still computes spare and short from the live zones", () => {
      const read = buildRead([zone(K.midfieldBox, 5, 3, 50)], card);
      expect(read.spare?.zoneKey).toBe(K.midfieldBox);
    });
  });

  it("is deterministic and does not mutate its input order", () => {
    const zones = [zone(K.midfieldBox, 5, 3, 50), zone(K.lastLine, 1, 3, 85)];
    const before = zones.map((z) => z.zoneKey);
    expect(buildRead(zones, null)).toEqual(buildRead(zones, null));
    expect(zones.map((z) => z.zoneKey)).toEqual(before);
  });
});

describe("SUPERIORITY_ZONE_KEYS matches the doc 06 section 2.3 zone_key column", () => {
  it("names all six zones", () => {
    expect(Object.values(SUPERIORITY_ZONE_KEYS).sort()).toEqual([
      "counterpress_ring",
      "first_line",
      "flank_corridor_left",
      "flank_corridor_right",
      "last_line",
      "midfield_box",
    ]);
  });
});
