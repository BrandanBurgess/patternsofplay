// Shared types for the superiority engine (T-104, doc 06 section 4). Types only,
// no runtime code, so grid.ts and superiority.ts can both depend on this without
// an import cycle. Same split as animationTypes.ts alongside playback.ts.
//
// EVERY coordinate here is a LANDSCAPE MODEL coordinate (CLAUDE.md rule 8):
// x 0-100 from our own goal toward the attacking goal, y 0-100 top to bottom.
// Orientation is a render concern and appears nowhere in this engine.
//
// The seeded shapes (rondo zone polygons, formation matchup cards) are built by
// T-101 and T-103. The engine deliberately does not fetch them: they arrive as
// INPUTS, which is what lets the whole engine be unit tested before either
// ticket lands. When the API shapes exist, map them onto these types at the
// boundary rather than threading network types through the maths.

import type { ModelPoint } from "./coords";

/** Doc 06 section 4 calls this `Pt`. It is the board's ModelPoint, unchanged. */
export type Pt = ModelPoint;

/** One slot of a formation at a position. `slot` is the stable identity across phases. */
export interface SlotPos {
  slot: string;
  position_code: string;
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

/**
 * A zone to count inside. Mirrors `rondo_zones.zone_kind` from doc 06 section 3.1:
 * five seeded polygons plus the counterpress ring, which is a circle that follows
 * the ball instead of sitting still on the pitch.
 */
export type SuperiorityZone =
  | { zoneKey: string; kind: "polygon"; polygon: Pt[] }
  | { zoneKey: string; kind: "circle"; centre: Pt; radius: number };

export type Verdict = "superiority" | "parity" | "inferiority";

/** Numerical is more bodies. Positional is the same bodies, better placed (doc 06 section 2.1). */
export type SuperiorityKind = "numerical" | "positional";

export interface ZoneCount {
  zoneKey: string;
  ours: number;
  theirs: number;
  /** ours - theirs. Integer, so every verdict below is exact. */
  delta: number;
  /** The ratio chip, for example '4v2'. */
  label: string;
  verdict: Verdict;
  superiorityKind: SuperiorityKind | null;
  /**
   * Representative x of the zone, in model coords. NOT in the doc 06 sketch of
   * this type, added because buildRead has to break ties "toward our own goal"
   * and a bare zoneKey carries no geometry to do that with. Polygon: mean vertex
   * x. Circle: centre x.
   */
  anchorX: number;
}

// ---------------------------------------------------------------------------
// The JdP grid (doc 06 section 2.2)
// ---------------------------------------------------------------------------

export type LaneKey =
  | "left_wing"
  | "left_half_space"
  | "centre"
  | "right_half_space"
  | "right_wing";

export type LineKey =
  | "own_build"
  | "first_line"
  | "middle"
  | "between_the_lines"
  | "last_line";

/** One band of the grid: a lane across y, or a horizontal line across x. */
export interface GridBand<K extends string> {
  key: K;
  /** Coach-facing name, used verbatim in warning copy. */
  label: string;
  /** Inclusive lower edge. */
  min: number;
  /** Exclusive upper edge, except on the final band where it is inclusive. */
  max: number;
}

export interface GridCell {
  lane: LaneKey;
  line: LineKey;
  /** Stable composite key, see cellKey(). */
  key: string;
}

export type GridBreachKind = "lane_over" | "line_over" | "wide_lane_shared";

export interface GridBreach {
  kind: GridBreachKind;
  /**
   * The band the check is about: a LaneKey for lane_over and wide_lane_shared, a
   * LineKey for line_over. Both of those guidelines are whole-band rules rather
   * than single-cell rules, so naming the band is what makes the warning useful.
   */
  cell: string;
  count: number;
  slots: string[];
}

export interface FreeMan {
  slot: string;
  cell: GridCell;
  /** Coach-facing copy. Names which superiority this is (doc 06 section 2.1). */
  whyItMatters: string;
}

// ---------------------------------------------------------------------------
// Rest defence and the read
// ---------------------------------------------------------------------------

export interface RestDefence {
  /** '3+2', last line plus screen. Always both numbers, so it is parseable. */
  shape: string;
  behindBall: number;
  lastLine: number;
  screen: number;
}

export type RouteKind = "through" | "around" | "over";

/**
 * A seeded `formation_matchups` row (doc 06 section 3.1), in the shape the engine
 * needs. T-103 owns the wire format; the engine reads only `route_kind` and
 * passes the rest through untouched for the card to render.
 */
export interface FormationMatchup {
  ours_code: string;
  theirs_code: string;
  our_edges: string[];
  their_edges: string[];
  route: string;
  route_kind: RouteKind;
}

export interface MatchupRead {
  /** Highest positive delta. Tie broken toward our own goal. */
  spare: ZoneCount | null;
  /** Lowest negative delta. Tie broken toward our own goal. */
  short: ZoneCount | null;
  route: RouteKind;
  /**
   * True when `route` came from the inference rule rather than a seeded card.
   * Doc 06 section 4 requires the UI to say so and to soften the language, which
   * it cannot do unless the engine tells it. Not in the doc's type sketch.
   */
  routeInferred: boolean;
  seededCard: FormationMatchup | null;
}
