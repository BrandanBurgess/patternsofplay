// Animation + recording data shapes (T-022). These TypeScript types mirror doc
// 03 sections 4.1, 4.2, 4.3 FIELD FOR FIELD. The Pydantic side lands with T-004;
// when it does, these names must still line up with the JSON columns, so keep
// the snake_case wire names on the persisted shapes (keyframes, snapshot) and the
// exact spec vocabulary on the declarative shape.
//
// Two formats live here and STAY SEPARATE on purpose (Brief section 7):
//   - DeclarativeSpec  (doc 03 4.1): preset content, player from->to + ball
//     waypoints that bind to a slot and chase that player's live position.
//   - Keyframe[]       (doc 03 4.2): raw recordings, replayed as-is.
// The player abstracts over both (see playback.ts); it never converts one into
// the other.

import type { ModelPoint } from "./coords";
import type { TokenSide } from "./tokens";

// --- doc 03 4.1: declarative animation spec (positions in LANDSCAPE model coords)

/** Delivery trajectory vocabulary (doc 03 4.1 / 3F.0). Drives the ball trail. */
export type Trajectory = "ground" | "driven" | "whipped" | "floated" | "clipped";

export interface SpecSlot {
  /** Stable slot id inside the spec, e.g. "winger_R". */
  slot: string;
  /** Optional role/position hint (doc 03 example: "W", "FB"). */
  role_hint?: string;
  /** Present and set to "opponent" for the other team; absent means own team. */
  side?: "opponent";
  /** Slot's landscape model start position. */
  start: ModelPoint;
}

export interface SpecMove {
  slot: string;
  to: ModelPoint;
  /** Arced run flavour (doc 03 example: "outside"). Recorded, not yet bowed. */
  arc?: "outside" | "inside";
}

export interface SpecBallTo {
  /**
   * The ball waypoint binds to this slot. During playback the waypoint CHASES
   * the bound slot's live interpolated position, so a pass into a moving runner
   * connects (doc 03 4.1 binding rules; design README "Data-model notes").
   */
  bind_slot: string;
  trajectory: Trajectory;
}

export interface SpecStep {
  /** 1-based step number (doc 03 uses "n"). Also the caption ordinal. */
  n: number;
  caption: string;
  /** Player from->to moves this step. Optional: a step may only pass the ball. */
  moves?: SpecMove[];
  /** A ball delivery this step, or null/absent for no pass. */
  ball_to?: SpecBallTo | null;
}

export interface DeclarativeSpec {
  slots: SpecSlot[];
  ball: { holder_slot: string };
  steps: SpecStep[];
  /** Rotations reuse this format with loop: true (doc 03 4.1). */
  loop?: boolean;
}

// --- doc 03 4.2: recorded keyframes (raw, team-scoped user content)

/** One recorded sample. Landscape model coords, exactly as dragged. */
export interface Keyframe {
  t_ms: number;
  token_id: string;
  x: number;
  y: number;
}

// --- doc 03 4.3: whiteboard snapshot (the boards row, minus server columns)

export interface SnapshotToken {
  id: string;
  side: TokenSide;
  label: string;
  x: number;
  y: number;
}

/**
 * board_snapshot_json (doc 03 4.2 / 4.3): token positions, confirmed lanes,
 * both thresholds, and which zone groups are on. This reconstructs the scene so
 * keyframes only need to carry the tokens that actually moved.
 */
export interface BoardSnapshot {
  tokens: SnapshotToken[];
  confirmed_lanes: string[];
  blocking_threshold: number;
  marking_threshold: number;
  zones_visible: string[];
}

/**
 * A recorded pattern held in component state until the board backend lands
 * (T-004 / T-030), shaped to map straight onto the saved_patterns row. NO
 * localStorage (Brief section 7). Server-owned columns (id, team_id,
 * author_user_id, created_at) are added at save time on the server; author_role
 * is kept here because the tile author stamp reads from it (doc 03 4.2).
 */
export interface RecordedPattern {
  name: string;
  author_role: "coach" | "player";
  board_snapshot: BoardSnapshot;
  keyframes: Keyframe[];
}
