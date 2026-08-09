// Opponent token layer (T-105, doc 06 sections 4 and 5.1). Turns an opponent
// formation phase, authored in THEIR OWN frame exactly as it is seeded, into
// tokens the board can render in ours.
//
// THE ONE RULE THIS MODULE EXISTS TO ENFORCE. An opponent's coordinates are
// never authored in our frame. They are seeded in their frame (their goalkeeper
// at x = 5, their attacking direction toward x = 100 in their own reading) and
// crossed into ours by mirrorOpponent from the T-104 superiority engine, and by
// nothing else. There is exactly one mirror in the codebase and this module
// calls it rather than reimplementing the arithmetic. That is what keeps the
// superiority engine, the board, and any future analysis reasoning about the
// same opponent in the same place.
//
// Because mirrorOpponent is involutive, so is mirrorOpponentShape: a shape
// mirrored in and back out is unchanged, exactly, for integer inputs. The test
// asserts that on whole shapes and not only on points, because the shape level
// is where a stray clamp or a rounding "tidy up" would show.
//
// LANDSCAPE MODEL COORDS on both sides of the mirror (CLAUDE.md rule 8). The
// word "orientation" does not appear in this file and must not: portrait is
// applied by coords.ts at render time, downstream of everything here.

import { mirrorOpponent } from "./superiority";
import type { SlotPos } from "./superiorityTypes";
import type { PreviewToken } from "./PatternPreviewBoard";

/**
 * Token ids for opponents are namespaced, because a slot id like "LB" is only
 * unique within one team's eleven and both teams are on the board at once. Ours
 * keep the bare slot id, which is the convention FormationsPage already renders
 * and clicks with, so adding opposition does not renumber our own tokens.
 */
export const OPPONENT_TOKEN_PREFIX = "opp:";

/** Board token id for one of our slots. Identity, named so the intent is explicit. */
export function ourTokenId(slot: string): string {
  return slot;
}

/** Board token id for an opponent slot. */
export function opponentTokenId(slot: string): string {
  return OPPONENT_TOKEN_PREFIX + slot;
}

export function isOpponentTokenId(tokenId: string): boolean {
  return tokenId.startsWith(OPPONENT_TOKEN_PREFIX);
}

/** Recover the slot id from either side's token id. Inverse of the two above. */
export function slotOfTokenId(tokenId: string): string {
  return isOpponentTokenId(tokenId) ? tokenId.slice(OPPONENT_TOKEN_PREFIX.length) : tokenId;
}

/**
 * Cross a whole opponent shape from their frame into ours.
 *
 * Slot ids and position codes pass through untouched: only the point moves, and
 * it moves through mirrorOpponent. Keeping the slot identity intact is what lets
 * the opponent's own phase changes morph by slot exactly the way ours do.
 *
 * Deliberately does NOT clamp. Clamping would destroy involutivity, and a caller
 * who wants a token held on the pitch has clampModel in coords.ts.
 */
export function mirrorOpponentShape(theirs: readonly SlotPos[]): SlotPos[] {
  return theirs.map((p) => {
    const m = mirrorOpponent({ x: p.x, y: p.y });
    return { slot: p.slot, position_code: p.position_code, x: m.x, y: m.y };
  });
}

export interface OurTokenOptions {
  /** Slots that pulse gold (formation keystones, design README). */
  keystoneSlots?: readonly string[];
  /** Token label. Defaults to the position code on keystones, blank elsewhere. */
  labelOf?: (p: SlotPos, keystone: boolean) => string;
}

export interface OpponentTokenOptions {
  /**
   * Token label. Defaults to blank: eleven labelled red tokens read as a team
   * sheet, and what the coach is being asked to read is the block's shape.
   */
  labelOf?: (p: SlotPos) => string;
}

/** Our eleven as board tokens. Positions are already in our frame. */
export function ourPhaseTokens(ours: readonly SlotPos[], opts: OurTokenOptions = {}): PreviewToken[] {
  const keystones = new Set(opts.keystoneSlots ?? []);
  const labelOf = opts.labelOf ?? ((p: SlotPos, keystone: boolean) => (keystone ? p.position_code : ""));
  return ours.map((p) => {
    const keystone = keystones.has(p.slot);
    return {
      id: ourTokenId(p.slot),
      side: "home" as const,
      label: labelOf(p, keystone),
      pos: { x: p.x, y: p.y },
      pulsing: keystone || undefined,
    };
  });
}

/**
 * Their eleven as board tokens, mirrored into our frame on the way through.
 *
 * `theirsOwnFrame` is the seeded phase exactly as stored. Side is "away", which
 * is the colour the board already defines for recorded opponents
 * (tokens.ts TOKEN_FILL.away, the board token var(--team-away)): doc 06
 * section 5.1 asks for that colour by name rather than a new one.
 */
export function opponentPhaseTokens(
  theirsOwnFrame: readonly SlotPos[],
  opts: OpponentTokenOptions = {}
): PreviewToken[] {
  const labelOf = opts.labelOf ?? (() => "");
  return mirrorOpponentShape(theirsOwnFrame).map((p) => ({
    id: opponentTokenId(p.slot),
    side: "away" as const,
    label: labelOf(p),
    pos: { x: p.x, y: p.y },
  }));
}
