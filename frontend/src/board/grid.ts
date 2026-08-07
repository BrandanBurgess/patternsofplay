// The juego de posicion grid (T-104, doc 06 section 2.2). Pure, deterministic,
// framework free. Landscape model coords only (CLAUDE.md rule 8): lanes divide y,
// horizontal lines divide x. Orientation never appears here.
//
// The occupancy rules produce CHECKS, never errors. Doc 06 is explicit that a
// temporary breach is legal football (forming a triangle, creating an overload,
// dragging a marker out) and that the copy is "check this", not "wrong". So this
// module reports breaches and lets the surface phrase them; it never blocks.

import type {
  GridBand,
  GridBreach,
  GridCell,
  LaneKey,
  LineKey,
  Pt,
  SlotPos,
} from "./superiorityTypes";

// ---------------------------------------------------------------------------
// THE CONTRACT. Doc 06 section 2.2: "These numbers are the contract. Any ticket
// changing them changes the seeds too, and both move together in one PR."
// This constant is the ONLY place the numbers live. Change them here and the
// whole engine, every breach check and every free man follows.
// ---------------------------------------------------------------------------
export const JDP_GRID: {
  lanes: GridBand<LaneKey>[];
  lines: GridBand<LineKey>[];
} = {
  // Vertical lanes, across y (0 at the top of the pitch).
  lanes: [
    { key: "left_wing", label: "Left wing", min: 0, max: 19 },
    { key: "left_half_space", label: "Left half-space", min: 19, max: 37 },
    { key: "centre", label: "Centre", min: 37, max: 63 },
    { key: "right_half_space", label: "Right half-space", min: 63, max: 81 },
    { key: "right_wing", label: "Right wing", min: 81, max: 100 },
  ],
  // Horizontal lines, across x (0 at our own goal, 100 at the attacking goal).
  lines: [
    { key: "own_build", label: "Own build", min: 0, max: 22 },
    { key: "first_line", label: "First line", min: 22, max: 42 },
    { key: "middle", label: "Middle", min: 42, max: 60 },
    { key: "between_the_lines", label: "Between the lines", min: 60, max: 78 },
    { key: "last_line", label: "Last line", min: 78, max: 100 },
  ],
};

/** The two wide lanes, which carry the tighter one-occupant guideline. */
export const WIDE_LANE_KEYS: LaneKey[] = ["left_wing", "right_wing"];

/** Doc 06 section 2.2 occupancy guidelines. Counts above these raise a check. */
export const JDP_OCCUPANCY_LIMITS = {
  /** No more than three teammates on any horizontal line. */
  perLine: 3,
  /** No more than two teammates in any vertical lane. */
  perLane: 2,
  /** Wide lanes: one occupant each, whenever possible. */
  perWideLane: 1,
} as const;

// ---------------------------------------------------------------------------
// BOUNDARY RULE, stated once and applied to lanes and lines identically.
//
// Every band is half-open and LOWER inclusive: [min, max). The final band is
// closed, [min, max], so a coordinate of exactly 100 is on the pitch rather than
// off the end of it. Consequences worth knowing:
//   - y exactly 19 is in the LEFT HALF-SPACE, not the left wing.
//   - x exactly 78 is on the LAST LINE, not between the lines.
//   - a coordinate on a boundary therefore belongs to exactly one band, always
//     the higher one, so occupancy counts can never double count a player.
// Coordinates outside 0-100 clamp into the end bands rather than throwing, so a
// token dragged a hair off the touchline still classifies instead of crashing a
// drag frame.
//
// Note this is a DIFFERENT question from pointInPolygon's boundary rule, where a
// point on a zone edge counts as inside BOTH neighbouring zones. That is correct
// there: zone counts are independent readings of the same pitch and are allowed
// to overlap. Grid cells are a partition and must not.
// ---------------------------------------------------------------------------

function indexIn<K extends string>(bands: GridBand<K>[], v: number): number {
  for (let i = 0; i < bands.length - 1; i += 1) {
    if (v < bands[i].max) return i;
  }
  return bands.length - 1;
}

/** Index of the vertical lane containing model y. Clamped, never out of range. */
export function laneIndexAt(y: number): number {
  return y < 0 ? 0 : indexIn(JDP_GRID.lanes, y);
}

/** Index of the horizontal line containing model x. Clamped, never out of range. */
export function lineIndexAt(x: number): number {
  return x < 0 ? 0 : indexIn(JDP_GRID.lines, x);
}

export function laneAt(y: number): GridBand<LaneKey> {
  return JDP_GRID.lanes[laneIndexAt(y)];
}

export function lineAt(x: number): GridBand<LineKey> {
  return JDP_GRID.lines[lineIndexAt(x)];
}

/** Stable composite key for a grid cell. */
export function cellKey(lane: LaneKey, line: LineKey): string {
  return `${lane}/${line}`;
}

/** The grid cell a model point falls in. */
export function cellAt(p: Pt): GridCell {
  const lane = laneAt(p.y).key;
  const line = lineAt(p.x).key;
  return { lane, line, key: cellKey(lane, line) };
}

/**
 * Occupancy of the grid by our shape, plus every guideline breach.
 *
 * `occupancy` holds only the OCCUPIED cells, keyed by cellKey, each listing its
 * slots in the caller's input order. Empty cells are omitted: twenty five keys
 * of mostly empty arrays is noise to iterate on every drag frame.
 *
 * `breaches` are ordered deterministically: lanes in grid order first (lane_over
 * before wide_lane_shared within a lane), then lines in grid order. A wide lane
 * holding three raises BOTH wide-lane checks, because doc 06 lists them as two
 * separate guidelines: "no more than two in any vertical lane" and "wide lanes,
 * one occupant each". They fail for different reasons and a coach reading the
 * board deserves both sentences.
 */
export function gridOccupancy(ours: SlotPos[]): {
  occupancy: Record<string, string[]>;
  breaches: GridBreach[];
} {
  const occupancy: Record<string, string[]> = {};
  const byLane: string[][] = JDP_GRID.lanes.map(() => []);
  const byLine: string[][] = JDP_GRID.lines.map(() => []);

  for (const p of ours) {
    const laneIdx = laneIndexAt(p.y);
    const lineIdx = lineIndexAt(p.x);
    byLane[laneIdx].push(p.slot);
    byLine[lineIdx].push(p.slot);
    const key = cellKey(JDP_GRID.lanes[laneIdx].key, JDP_GRID.lines[lineIdx].key);
    if (occupancy[key]) occupancy[key].push(p.slot);
    else occupancy[key] = [p.slot];
  }

  const breaches: GridBreach[] = [];

  JDP_GRID.lanes.forEach((lane, i) => {
    const slots = byLane[i];
    if (slots.length > JDP_OCCUPANCY_LIMITS.perLane) {
      breaches.push({ kind: "lane_over", cell: lane.key, count: slots.length, slots: [...slots] });
    }
    if (
      WIDE_LANE_KEYS.includes(lane.key) &&
      slots.length > JDP_OCCUPANCY_LIMITS.perWideLane
    ) {
      breaches.push({
        kind: "wide_lane_shared",
        cell: lane.key,
        count: slots.length,
        slots: [...slots],
      });
    }
  });

  JDP_GRID.lines.forEach((line, i) => {
    const slots = byLine[i];
    if (slots.length > JDP_OCCUPANCY_LIMITS.perLine) {
      breaches.push({ kind: "line_over", cell: line.key, count: slots.length, slots: [...slots] });
    }
  });

  return { occupancy, breaches };
}
