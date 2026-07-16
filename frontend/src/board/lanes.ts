// Lane graph + marking model (T-021). Pure, deterministic functions over
// LANDSCAPE MODEL positions; no React, no DOM. The Board feeds live positions in
// (from posRef, every animation frame during a drag) and renders the result
// through LaneOverlay. Two INDEPENDENT thresholds drive two INDEPENDENT outputs:
//   - blockingThreshold -> whether a lane is blocked + where the dot sits.
//   - markingThreshold   -> whether an attacker wears a ring + how tight.
// Neither reads the other, which is what "the two thresholds adjust
// independently" (Brief section 5 board DoD) means in code.

import type { ModelPoint } from "./coords";
import { closestPointOnSegment, distance, nearestBy } from "./geometry";

export type TokenSide = "home" | "away" | "ball";

/** The minimum a caller must tell us about a token to compute lanes/marks. */
export interface TokenMeta {
  id: string;
  side: TokenSide;
}

// Suggested lanes are the ball holder's passing options: teammates within this
// model-space reach. This is NOT one of the two stored per-board thresholds
// (doc 03 4.3 stores only blocking + marking); it is a fixed presentation reach
// so the board reads like the mockup (a few dashed options) rather than drawing
// every teammate pair. Tunable later if the whiteboard toolbar exposes it.
export const SUGGESTION_RANGE = 32;

// Tight marking is the inner band of the single marking threshold: a defender
// closer than markingThreshold * TIGHT_MARK_RATIO earns the thick glowing ring,
// otherwise the thin ring. One stored threshold, two visual tiers (design
// README: thin when marked, thick + glow when tightly marked).
export const TIGHT_MARK_RATIO = 0.5;

export type LaneKind = "suggested" | "confirmed";

export interface Lane {
  /** Canonical pair key (see pairKey); stable id for diffing DOM. */
  key: string;
  a: string;
  b: string;
  kind: LaneKind;
  from: ModelPoint;
  to: ModelPoint;
  blocked: boolean;
  /** Closest point on the segment to the blocking defender; null when clear. */
  interception: ModelPoint | null;
  /** The defender whose distance triggered the block; null when clear. */
  blockerId: string | null;
}

export type MarkLevel = "loose" | "tight";

export interface Mark {
  /** The attacker wearing the ring. */
  tokenId: string;
  level: MarkLevel;
  /** The nearest defender responsible for the mark. */
  byId: string;
  at: ModelPoint;
}

/**
 * Canonical, order-independent key for a token pair. Confirmed lanes persist
 * under this key.
 *
 * FUTURE (design README "Data-model notes"; doc 03 4.3): lane overrides are
 * keyed by player-TOKEN-id pair today. The likely next step is keying by ROLE or
 * SLOT so a confirmed lane travels with a pattern across formations (a "third
 * man" lane means the same thing whichever players fill the slots). Swap the
 * inputs here for role/slot ids when formations drive the board; nothing else in
 * the lane math needs to change.
 */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

interface Player {
  id: string;
  side: Exclude<TokenSide, "ball">;
  pos: ModelPoint;
}

function collectPlayers(
  tokens: TokenMeta[],
  positions: Map<string, ModelPoint>
): Player[] {
  const players: Player[] = [];
  for (const t of tokens) {
    if (t.side === "ball") continue;
    const pos = positions.get(t.id);
    if (pos) players.push({ id: t.id, side: t.side, pos });
  }
  return players;
}

/**
 * Evaluate one lane between two same-side players: is any opponent within the
 * perpendicular blocking distance of the pass segment, and if so where is the
 * interception point (the closest point on the segment to the nearest blocker)?
 */
function evaluateBlock(
  from: Player,
  to: Player,
  opponents: Player[],
  blockingThreshold: number
): { blocked: boolean; interception: ModelPoint | null; blockerId: string | null } {
  let bestDist = Infinity;
  let bestPoint: ModelPoint | null = null;
  let bestId: string | null = null;
  for (const opp of opponents) {
    const c = closestPointOnSegment(opp.pos, from.pos, to.pos);
    if (c.distance <= blockingThreshold && c.distance < bestDist) {
      bestDist = c.distance;
      bestPoint = c.point;
      bestId = opp.id;
    }
  }
  return { blocked: bestPoint !== null, interception: bestPoint, blockerId: bestId };
}

/**
 * Compute every lane to draw this frame: the confirmed pairs (always shown) plus
 * the ball holder's in-range passing suggestions, each tagged blocked/clear.
 * Pure: same inputs -> same output, safe to call once per animation frame.
 */
export function computeLanes(
  positions: Map<string, ModelPoint>,
  tokens: TokenMeta[],
  confirmed: Set<string>,
  blockingThreshold: number,
  suggestionRange: number = SUGGESTION_RANGE
): Lane[] {
  const players = collectPlayers(tokens, positions);
  const byId = new Map(players.map((p) => [p.id, p]));
  const bySide = { home: [] as Player[], away: [] as Player[] };
  for (const p of players) bySide[p.side].push(p);

  const lanes: Lane[] = [];
  const emitted = new Set<string>();

  const addLane = (from: Player, to: Player, kind: LaneKind) => {
    const key = pairKey(from.id, to.id);
    if (emitted.has(key)) return;
    emitted.add(key);
    const opponents = from.side === "home" ? bySide.away : bySide.home;
    const block = evaluateBlock(from, to, opponents, blockingThreshold);
    lanes.push({
      key,
      a: from.id,
      b: to.id,
      kind,
      from: from.pos,
      to: to.pos,
      blocked: block.blocked,
      interception: block.interception,
      blockerId: block.blockerId,
    });
  };

  // Confirmed lanes first: they always render, regardless of range, and win the
  // pair key so a confirmed pair never also draws as a suggestion.
  for (const key of confirmed) {
    const [a, b] = key.split("|");
    const from = byId.get(a);
    const to = byId.get(b);
    // Only render a confirmed lane while both tokens exist and share a side.
    if (from && to && from.side === to.side) addLane(from, to, "confirmed");
  }

  // Suggested lanes: the ball holder's passing options within range.
  const ball = positions.get("ball");
  if (ball) {
    const holder = nearestBy(ball, players, (p) => p.pos)?.item;
    if (holder) {
      for (const mate of bySide[holder.side]) {
        if (mate.id === holder.id) continue;
        if (distance(holder.pos, mate.pos) <= suggestionRange) addLane(holder, mate, "suggested");
      }
    }
  }

  return lanes;
}

/**
 * Compute marking rings: for each attacker (home), the nearest defender (away)
 * within the marking threshold. Independent of lane blocking by construction.
 */
export function computeMarks(
  positions: Map<string, ModelPoint>,
  tokens: TokenMeta[],
  markingThreshold: number,
  tightRatio: number = TIGHT_MARK_RATIO
): Mark[] {
  const players = collectPlayers(tokens, positions);
  const attackers = players.filter((p) => p.side === "home");
  const defenders = players.filter((p) => p.side === "away");
  if (defenders.length === 0) return [];

  const marks: Mark[] = [];
  const tightBand = markingThreshold * tightRatio;
  for (const attacker of attackers) {
    const nearest = nearestBy(attacker.pos, defenders, (d) => d.pos);
    if (nearest && nearest.distance <= markingThreshold) {
      marks.push({
        tokenId: attacker.id,
        level: nearest.distance <= tightBand ? "tight" : "loose",
        byId: nearest.item.id,
        at: attacker.pos,
      });
    }
  }
  return marks;
}

// ---------------------------------------------------------------------------
// Whiteboard lane state: the persistence shape (doc 03 section 4.3 `boards`).
// There is no board backend yet (T-004 / T-030), so the Board keeps this in
// component state, structured to map straight onto the row when persistence
// lands. NO localStorage (Brief section 7): the server is the source of truth.
// ---------------------------------------------------------------------------
export interface WhiteboardLaneState {
  /** boards.confirmed_lanes_json: canonical player-token pair keys (pairKey). */
  confirmedLanes: string[];
  /** boards.blocking_threshold: perpendicular model distance, defender to pass line. */
  blockingThreshold: number;
  /** boards.marking_threshold: model distance, defender to attacker. */
  markingThreshold: number;
}

export const DEFAULT_BLOCKING_THRESHOLD = 7;
export const DEFAULT_MARKING_THRESHOLD = 10;

export function defaultLaneState(): WhiteboardLaneState {
  return {
    confirmedLanes: [],
    blockingThreshold: DEFAULT_BLOCKING_THRESHOLD,
    markingThreshold: DEFAULT_MARKING_THRESHOLD,
  };
}
