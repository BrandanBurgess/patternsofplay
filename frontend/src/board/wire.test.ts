// Round-trip test for the internal <-> wire BoardSnapshot conversion
// (T-030). This is the seam between the board engine's own shapes
// (animationTypes.ts) and the backend's doc 03 4.2/4.3 wire shape
// (whiteboardApi.ts); a lossy conversion here would silently corrupt
// confirmed lanes or zone toggles on every save/reload.

import { describe, expect, it } from "vitest";
import type { BoardSnapshot } from "./animationTypes";
import { fromWireSnapshot, toWireSnapshot } from "./wire";

const SNAPSHOT: BoardSnapshot = {
  tokens: [
    { id: "home-9", side: "home", label: "9", x: 60, y: 30 },
    { id: "home-2", side: "home", label: "2", x: 22, y: 16 },
    { id: "away-3", side: "away", label: "3", x: 40, y: 70 },
    { id: "ball", side: "ball", label: "", x: 50, y: 50 },
  ],
  confirmed_lanes: ["home-2|home-9"], // pairKey sorts lexically
  blocking_threshold: 6,
  marking_threshold: 11,
  zones_visible: ["thirds", "zone14"],
};

describe("wire conversion round trip", () => {
  it("internal -> wire -> internal is lossless", () => {
    const wire = toWireSnapshot(SNAPSHOT);
    const back = fromWireSnapshot(wire);
    expect(back).toEqual(SNAPSHOT);
  });

  it("wire zones_visible maps each group independently", () => {
    const wire = toWireSnapshot(SNAPSHOT);
    expect(wire.zones_visible).toEqual({
      thirds: true,
      half_spaces: false,
      zone_14: true,
      cutback: false,
    });
  });

  it("confirmed lane pairKey round trips through the {a,b} wire shape", () => {
    const wire = toWireSnapshot(SNAPSHOT);
    expect(wire.confirmed_lanes).toEqual([{ a: "home-2", b: "home-9" }]);
  });

  it("empty zones and lanes round trip to empty, not undefined", () => {
    const empty: BoardSnapshot = { ...SNAPSHOT, confirmed_lanes: [], zones_visible: [] };
    const wire = toWireSnapshot(empty);
    expect(wire.confirmed_lanes).toEqual([]);
    expect(wire.zones_visible).toEqual({
      thirds: false,
      half_spaces: false,
      zone_14: false,
      cutback: false,
    });
    expect(fromWireSnapshot(wire)).toEqual(empty);
  });
});
