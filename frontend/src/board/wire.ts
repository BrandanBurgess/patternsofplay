// Converts between the board engine's internal BoardSnapshot (animationTypes.ts,
// doc 03 4.2/4.3 shaped for the recorder and player) and the API wire shape
// (whiteboardApi.ts, doc 03 4.2/4.3 shaped to match backend/app/specs.py field
// for field). Two representations exist on purpose: internally, confirmed
// lanes are canonical "id|id" pairKey strings (lanes.ts) and zone toggles are
// group-name strings; on the wire they are {a,b} objects and a fixed boolean
// object, per the backend schema T-004 already shipped and tested. This
// module is the ONLY place that needs to know both shapes.

import type { BoardSnapshotWire, KeyframeWire } from "../whiteboardApi";
import { pairKey } from "./lanes";
import type { BoardSnapshot, Keyframe } from "./animationTypes";
import type { ZoneGroup } from "./zones";

// Keyframes are structurally identical on both sides ({t_ms, token_id, x, y}).
export function toWireKeyframes(keyframes: Keyframe[]): KeyframeWire[] {
  return keyframes.map((k) => ({ t_ms: k.t_ms, token_id: k.token_id, x: k.x, y: k.y }));
}

export function toWireSnapshot(snapshot: BoardSnapshot): BoardSnapshotWire {
  return {
    tokens: snapshot.tokens.map((t) => ({
      id: t.id,
      side: t.side,
      label: t.label,
      pos: { x: t.x, y: t.y },
    })),
    confirmed_lanes: snapshot.confirmed_lanes.map((key) => {
      const [a, b] = key.split("|");
      return { a, b };
    }),
    blocking_threshold: snapshot.blocking_threshold,
    marking_threshold: snapshot.marking_threshold,
    zones_visible: {
      thirds: snapshot.zones_visible.includes("thirds"),
      half_spaces: snapshot.zones_visible.includes("halfspaces"),
      zone_14: snapshot.zones_visible.includes("zone14"),
      cutback: snapshot.zones_visible.includes("cutback"),
    },
  };
}

export function fromWireSnapshot(wire: BoardSnapshotWire): BoardSnapshot {
  const zones: ZoneGroup[] = [];
  if (wire.zones_visible.thirds) zones.push("thirds");
  if (wire.zones_visible.half_spaces) zones.push("halfspaces");
  if (wire.zones_visible.zone_14) zones.push("zone14");
  if (wire.zones_visible.cutback) zones.push("cutback");

  return {
    tokens: wire.tokens.map((t) => ({
      id: t.id,
      side: t.side,
      label: t.label,
      x: t.pos.x,
      y: t.pos.y,
    })),
    confirmed_lanes: wire.confirmed_lanes.map((lane) => pairKey(lane.a, lane.b)),
    blocking_threshold: wire.blocking_threshold,
    marking_threshold: wire.marking_threshold,
    zones_visible: zones,
  };
}
