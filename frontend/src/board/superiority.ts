// The superiority engine (T-104, doc 06 section 4). Pure, deterministic,
// framework free: no React, no DOM, no network, no clock, no randomness. It is
// called on every drag frame, so it allocates modestly and never sorts what it
// does not have to.
//
// LANDSCAPE MODEL COORDS THROUGHOUT (CLAUDE.md rule 8). x runs 0-100 from our
// own goal toward the attacking goal, y runs 0-100 top to bottom. Opponents are
// mirrored into OUR frame by mirrorOpponent before they reach any counting
// function, so the whole engine reasons in one frame of reference. The word
// "orientation" does not appear in this file, and it must not: orientation is
// applied by coords.ts at render time and nowhere else.
//
// DETERMINISM. Verdicts compare integer counts, so they are exact. Nothing here
// reads Date.now(), Math.random(), or any ambient state. Same input, same output,
// every frame, which is what makes the board's warnings stable while a coach
// nudges a token by a pixel.
//
// The engine does NOT fetch zones or matchup cards. They arrive as arguments.
// That is what lets all of this be tested before T-101 and T-103 exist.

import { distanceSq, pointInCircle, pointInPolygon } from "./geometry";
import { cellAt, laneAt, lineAt } from "./grid";
import type {
  FormationMatchup,
  FreeMan,
  MatchupRead,
  Pt,
  RestDefence,
  RouteKind,
  SlotPos,
  SuperiorityKind,
  SuperiorityZone,
  Verdict,
  ZoneCount,
} from "./superiorityTypes";

// pointInPolygon and pointInCircle are implemented in geometry.ts, next to the
// segment maths the lane graph already uses, and re-exported here so callers can
// take the whole doc 06 section 4 API from one module.
export { pointInCircle, pointInPolygon } from "./geometry";
export type * from "./superiorityTypes";

/** The six rondo zones of doc 06 section 2.3. Route inference names three of
 *  them, so the strings live in one place rather than inline in the logic. */
export const SUPERIORITY_ZONE_KEYS = {
  firstLine: "first_line",
  midfieldBox: "midfield_box",
  flankCorridorLeft: "flank_corridor_left",
  flankCorridorRight: "flank_corridor_right",
  lastLine: "last_line",
  counterpressRing: "counterpress_ring",
} as const;

/** Doc 06 section 4: a free man has no opponent within 8 model units. */
export const DEFAULT_PRESS_RADIUS = 8;

/** Doc 06 section 4: rest defence splits at a 12 unit gap in x. */
export const REST_DEFENCE_LINE_GAP = 12;

/** Doc 06 section 4: the fallback ball line is the centroid of this many of our
 *  most advanced players, used when no ball is placed. */
export const BALL_FALLBACK_ADVANCED_COUNT = 3;

function posOf(p: SlotPos): Pt {
  return { x: p.x, y: p.y };
}

// ---------------------------------------------------------------------------
// 1. Opponent placement
// ---------------------------------------------------------------------------

/**
 * Place an opponent by rotating 180 degrees about the pitch centre, so their
 * attacking direction is the reverse of ours. Their goalkeeper, authored at
 * x = 5 in their own frame, lands at x = 95 in ours: in front of our forwards,
 * which is where a goalkeeper we are attacking belongs.
 *
 * INVOLUTIVE, exactly: mirrorOpponent(mirrorOpponent(p)) deep-equals p for every
 * integer input, because 100 - (100 - n) is exact in IEEE 754 whenever n is an
 * integer in this range. That property is what lets the board round-trip an
 * opponent shape through the mirror without drift accumulating over a session of
 * toggling the opposition on and off. It is tested across the full 101 by 101
 * integer grid, not on a few sample points.
 *
 * It deliberately does NOT clamp. Clamping would break involutivity, and a
 * caller who wants a token kept on the pitch has clampModel in coords.ts.
 */
export function mirrorOpponent(p: Pt): Pt {
  return { x: 100 - p.x, y: 100 - p.y };
}

// ---------------------------------------------------------------------------
// 2. Zone containment and counting
// ---------------------------------------------------------------------------

function inZone(zone: SuperiorityZone, p: Pt): boolean {
  return zone.kind === "circle"
    ? pointInCircle(p, zone.centre, zone.radius)
    : pointInPolygon(p, zone.polygon);
}

function anchorXOf(zone: SuperiorityZone): number {
  if (zone.kind === "circle") return zone.centre.x;
  if (zone.polygon.length === 0) return 0;
  let sum = 0;
  for (const v of zone.polygon) sum += v.x;
  return sum / zone.polygon.length;
}

function verdictOf(delta: number): Verdict {
  if (delta > 0) return "superiority";
  if (delta < 0) return "inferiority";
  return "parity";
}

/**
 * Count both sides inside one zone and turn the counts into a coaching verdict.
 *
 * `freeSlots` is optional and holds the slots findFreeMen has already judged
 * free. It is what lets a zone at PARITY report positional superiority: doc 06
 * section 2.1 defines positional as "same numbers, better placed", so a zone we
 * are not winning on bodies but where one of ours is unmarked between their
 * lines is a positional edge, and the card has to be able to say which
 * superiority it is talking about. Above parity the edge is already numerical
 * and stays labelled that way; below parity there is no superiority to claim.
 *
 * Callers who have not run findFreeMen simply omit the argument, which keeps the
 * three argument signature doc 06 sketches valid.
 */
export function countZone(
  zone: SuperiorityZone,
  ours: SlotPos[],
  theirs: SlotPos[],
  freeSlots?: ReadonlySet<string>
): ZoneCount {
  let oursIn = 0;
  let theirsIn = 0;
  let hasFreeMan = false;

  for (const p of ours) {
    if (!inZone(zone, p)) continue;
    oursIn += 1;
    if (freeSlots !== undefined && freeSlots.has(p.slot)) hasFreeMan = true;
  }
  for (const p of theirs) {
    if (inZone(zone, p)) theirsIn += 1;
  }

  const delta = oursIn - theirsIn;
  let superiorityKind: SuperiorityKind | null = null;
  if (delta > 0) superiorityKind = "numerical";
  else if (delta === 0 && hasFreeMan) superiorityKind = "positional";

  return {
    zoneKey: zone.zoneKey,
    ours: oursIn,
    theirs: theirsIn,
    delta,
    label: `${oursIn}v${theirsIn}`,
    verdict: verdictOf(delta),
    superiorityKind,
    anchorX: anchorXOf(zone),
  };
}

// ---------------------------------------------------------------------------
// 3. Positional superiority: the free man
// ---------------------------------------------------------------------------

/**
 * Coach-facing copy for a free man. Doc 06 section 2.1: every card the engine
 * emits must NAME which superiority it is talking about, because that is the
 * transferable coaching language. So this sentence leads with the name, locates
 * the player in the grid a coach can actually see on the overlay, and finishes
 * with what to do about it. No analytics voice, no score, no em dash.
 */
function freeManCopy(laneLabel: string, lineLabel: string): string {
  return (
    `Positional superiority: alone in the ${laneLabel.toLowerCase()}, ` +
    `${lineLabel.toLowerCase()}, with no opponent close enough to press. ` +
    `Find that pass and the receiver turns forward.`
  );
}

/**
 * Find our free men: positional superiority made computable.
 *
 * Doc 06 section 4 defines a free man as one of ours alone in a lane cell
 * between two of their horizontal lines, with no opponent in the same cell and
 * none within `pressRadius`. Written out as four conditions, all of which must
 * hold:
 *
 *  1. ALONE IN THE CELL. No teammate shares the grid cell. Two of ours in the
 *     same pocket is an overload, which is a different (numerical) reading.
 *  2. NO OPPONENT IN THE CELL. Someone is standing in the pocket, so it is
 *     occupied even if they are not tight.
 *  3. NOT PRESSED. Every opponent is strictly further than pressRadius away.
 *     Exactly at the radius counts as pressing: the boundary belongs to the
 *     defender, which is the conservative call and keeps the engine from
 *     promising a coach a free man who is about to be closed down.
 *  4. BETWEEN TWO OF THEIR LINES. At least one opponent is behind him (smaller
 *     x) and at least one ahead (larger x).
 *
 * Condition 4 needs a word, because doc 06 says "between two of their horizontal
 * lines" without saying whose lines to measure. Measuring against our own grid
 * bands would be wrong, since the grid is fixed to the pitch and their block is
 * not: a deep block and a high press produce identical grid bands. Measuring
 * against THEIR actual positions is the football meaning, and it is also what
 * makes the striker case come out right. A forward beyond their entire back line
 * has nobody behind him, so he is not in a pocket between two lines, he is
 * offside or through. He is correctly not reported as a free man.
 *
 * Returns free men in the input order of `ours`, so the output is stable frame
 * to frame and the UI can key on it without reordering.
 */
export function findFreeMen(
  ours: SlotPos[],
  theirs: SlotPos[],
  pressRadius: number = DEFAULT_PRESS_RADIUS
): FreeMan[] {
  const result: FreeMan[] = [];
  if (ours.length === 0 || theirs.length === 0) return result;

  const pressSq = pressRadius * pressRadius;

  // Cell keys are computed once per player rather than per pair.
  const ourCells = ours.map((p) => cellAt(posOf(p)));
  const theirCellKeys = theirs.map((p) => cellAt(posOf(p)).key);

  for (let i = 0; i < ours.length; i += 1) {
    const me = ours[i];
    const cell = ourCells[i];

    // 1. Alone in the cell.
    let teammateShares = false;
    for (let j = 0; j < ours.length; j += 1) {
      if (j !== i && ourCells[j].key === cell.key) {
        teammateShares = true;
        break;
      }
    }
    if (teammateShares) continue;

    // 2, 3 and 4 in one pass over their shape.
    const mePos = posOf(me);
    let opponentShares = false;
    let pressed = false;
    let someoneBehind = false;
    let someoneAhead = false;

    for (let j = 0; j < theirs.length; j += 1) {
      const opp = theirs[j];
      if (theirCellKeys[j] === cell.key) {
        opponentShares = true;
        break;
      }
      if (distanceSq(mePos, posOf(opp)) <= pressSq) {
        pressed = true;
        break;
      }
      if (opp.x < me.x) someoneBehind = true;
      else if (opp.x > me.x) someoneAhead = true;
    }
    if (opponentShares || pressed) continue;
    if (!someoneBehind || !someoneAhead) continue;

    result.push({
      slot: me.slot,
      cell,
      whyItMatters: freeManCopy(laneAt(me.y).label, lineAt(me.x).label),
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// 4. Rest defence
// ---------------------------------------------------------------------------

/**
 * Classify our rest defence: how many are behind the ball, and how they split
 * into a last line and a screen in front of it.
 *
 * The ball line is `ballX`. Pass null when no ball is placed and the fallback of
 * doc 06 section 4 applies: the centroid x of our three most advanced players
 * (or of everyone, when we have fewer than three). Doc 06 sketches the parameter
 * as a plain number; null is accepted because "no ball is set" has to be
 * expressible for the fallback to ever run.
 *
 * Behind means STRICTLY behind, x < ballLine, so the player on the ball is not
 * counted as part of the cover behind it.
 *
 * The split: sort those behind the ball by x, then cut at the FIRST gap wider
 * than REST_DEFENCE_LINE_GAP. Everything deeper than the cut is the last line,
 * everything in front of it is the screen. First gap, not widest, because the
 * deepest cluster is the last line by definition and the question is only where
 * that cluster ends. A gap of exactly 12 is not a split: two players 12 apart
 * are still covering for each other, and requiring a strictly wider gap keeps a
 * shape from flickering between 3+2 and 4+1 while a coach drags a token.
 *
 * `shape` always carries both numbers, so "4+0" is emitted rather than "4". It
 * is engine output that a surface formats, and a parseable string beats a pretty
 * one that sometimes has one number and sometimes two.
 */
export function classifyRestDefence(ours: SlotPos[], ballX: number | null): RestDefence {
  const ballLine = ballX === null ? fallbackBallLine(ours) : ballX;

  const behind = ours.filter((p) => p.x < ballLine);
  if (behind.length === 0) {
    return { shape: "0+0", behindBall: 0, lastLine: 0, screen: 0 };
  }

  // Copy before sorting: never mutate the caller's array. Slot breaks x ties so
  // the result cannot depend on the order the caller happened to build the list.
  const sorted = [...behind].sort((a, b) => (a.x - b.x) || (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0));

  let splitAt = sorted.length; // no gap found: everyone is the last line
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].x - sorted[i - 1].x > REST_DEFENCE_LINE_GAP) {
      splitAt = i;
      break;
    }
  }

  const lastLine = splitAt;
  const screen = sorted.length - splitAt;
  return { shape: `${lastLine}+${screen}`, behindBall: sorted.length, lastLine, screen };
}

/** Centroid x of our most advanced players, the ball line when no ball is set. */
function fallbackBallLine(ours: SlotPos[]): number {
  if (ours.length === 0) return 0;
  const byX = [...ours].sort((a, b) => b.x - a.x);
  const n = Math.min(BALL_FALLBACK_ADVANCED_COUNT, byX.length);
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += byX[i].x;
  return sum / n;
}

// ---------------------------------------------------------------------------
// 5. The read
// ---------------------------------------------------------------------------

/**
 * Route inference, used only when no matchup card is seeded. Doc 06 section 4
 * states it so it is reproducible: midfield box ours means THROUGH, else either
 * flank corridor ours means AROUND, else OVER. Note the priority is deliberate,
 * not incidental: if we own the middle we play through it even when a flank is
 * also free, because the middle is the shorter route to goal.
 */
function inferRoute(zones: ZoneCount[]): RouteKind {
  let flankIsOurs = false;
  for (const z of zones) {
    if (z.zoneKey === SUPERIORITY_ZONE_KEYS.midfieldBox && z.delta > 0) return "through";
    if (
      (z.zoneKey === SUPERIORITY_ZONE_KEYS.flankCorridorLeft ||
        z.zoneKey === SUPERIORITY_ZONE_KEYS.flankCorridorRight) &&
      z.delta > 0
    ) {
      flankIsOurs = true;
    }
  }
  return flankIsOurs ? "around" : "over";
}

/**
 * Pick the extreme zone. `sign` is +1 for the spare man (largest positive delta)
 * and -1 for the shortage (most negative delta).
 *
 * Ties break toward our own goal, meaning the smaller anchorX wins. That is a
 * coaching decision, not an arbitrary one: of two equal reads, the one nearer
 * our own goal is the one that decides whether we can build at all, and the one
 * whose failure costs a goal rather than a chance. Remaining ties keep the first
 * zone in input order, so the result is fully determined by the input.
 */
function extremeZone(zones: ZoneCount[], sign: 1 | -1): ZoneCount | null {
  let best: ZoneCount | null = null;
  for (const z of zones) {
    if (sign === 1 ? z.delta <= 0 : z.delta >= 0) continue;
    if (best === null) {
      best = z;
      continue;
    }
    const better = sign === 1 ? z.delta > best.delta : z.delta < best.delta;
    const tied = z.delta === best.delta;
    if (better || (tied && z.anchorX < best.anchorX)) best = z;
  }
  return best;
}

/**
 * Assemble the three-step coaching read: where we are spare, where we are short,
 * and how the ball gets there. A seeded card's route_kind always wins over
 * inference; `routeInferred` tells the surface which it got, because doc 06
 * requires an inferred route to be labelled and phrased more softly than a
 * seeded one. The engine will not fake confidence it does not have.
 */
export function buildRead(zones: ZoneCount[], seeded: FormationMatchup | null): MatchupRead {
  return {
    spare: extremeZone(zones, 1),
    short: extremeZone(zones, -1),
    route: seeded ? seeded.route_kind : inferRoute(zones),
    routeInferred: !seeded,
    seededCard: seeded,
  };
}

// Re-exported so a caller can take the full doc 06 section 4 engine from this
// one module without having to know that the grid lives next door.
export { JDP_GRID, JDP_OCCUPANCY_LIMITS, cellAt, cellKey, gridOccupancy } from "./grid";
