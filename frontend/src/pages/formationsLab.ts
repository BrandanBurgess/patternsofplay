// Pure helpers for the Tactics Lab Formations page (T-106, doc 06 sections
// 5.1, 5.2, 5.4). No React, no DOM, no network: everything here is a pure
// function of engine output plus seeded wire data, so the coach-facing copy
// is unit testable without mounting a board.
//
// TWO RULES THIS MODULE EXISTS TO KEEP HONEST.
//
// 1. A RATIO IS EITHER COMPUTED OR SEEDED, NEVER BOTH, AND THE TWO ARE
//    NEVER SPELLED THE SAME WAY. With no opposition on the board the chip
//    carries the seeded fallback and is styled muted. With opposition on it
//    carries `ZoneCount.label`, which T-104's countZone derived from the
//    two shapes actually on the pitch this instant. Nothing in this file
//    ever writes a ratio literal.
//
// 2. EVERY CARD NAMES WHICH SUPERIORITY IT IS TALKING ABOUT (doc 06 section
//    2.1). Numerical is more bodies. Positional is the same bodies better
//    placed. Qualitative is a personnel read and is NOT claimed anywhere
//    here, because personnel is T-107 and the engine cannot see it yet.
//
// Breach copy is a CHECK, never an error (doc 06 section 2.2). The words
// "invalid" and "wrong" do not appear in this file and must not: a
// temporary breach is legal football.

import { JDP_GRID } from "../board/grid";
import type {
  GridBreach,
  LaneKey,
  LineKey,
  MatchupRead,
  Pt,
  ZoneCount,
} from "../board/superiorityTypes";
import type { FormationPhaseWire, PhaseName } from "../tacticsApi";

// ---------------------------------------------------------------------------
// The phase segment (doc 06 section 5.1 control 1)
// ---------------------------------------------------------------------------

/** "base" is the formation's own seeded shape, which is not a
 *  formation_phases row: it is formations.positions_json. The other three
 *  are phase names with seeded variants. */
export type PhaseKey = "base" | "in_possession" | "out_of_possession" | "rest_defence";

export interface PhaseSegment {
  key: PhaseKey;
  /** Desktop label, doc 06 section 5.1 verbatim. */
  label: string;
  /** Phone icon-row label: the segment collapses, the meaning must not. */
  short: string;
}

export const PHASE_SEGMENTS: PhaseSegment[] = [
  { key: "base", label: "Base", short: "Base" },
  { key: "in_possession", label: "With the ball", short: "Ball" },
  { key: "out_of_possession", label: "Without the ball", short: "No ball" },
  { key: "rest_defence", label: "Rest defence", short: "Rest" },
];

/** Variants seeded for one phase of one formation, in the API's own order
 *  (T-108 sorts by phase then variant_code, so this is stable). */
export function variantsForPhase(
  phases: readonly FormationPhaseWire[],
  key: PhaseKey
): FormationPhaseWire[] {
  if (key === "base") return [];
  return phases.filter((p) => p.phase === (key as PhaseName));
}

/**
 * The opponent variant to open the picker on. Doc 06 section 5.1: "their
 * out-of-possession variants are the ones that matter, so default the
 * picker there". Falls back to the first seeded variant, then to their base
 * shape (null), so a formation with no out-of-possession row still opens on
 * something real rather than on an empty picker.
 */
export function defaultOpponentVariant(phases: readonly FormationPhaseWire[]): string | null {
  const out = phases.find((p) => p.phase === "out_of_possession");
  if (out) return out.variant_code;
  return phases[0]?.variant_code ?? null;
}

// ---------------------------------------------------------------------------
// Rondo zone naming: getting the ratio OUT of the display name
// ---------------------------------------------------------------------------

/** Doc 06 section 2.3's ball-relative zone. Named once, matched by key. */
export const COUNTERPRESS_RING_ZONE_KEY = "counterpress_ring";

export interface RondoZoneName {
  /** The zone's name with no ratio in it, e.g. "The midfield box". */
  displayName: string;
  /**
   * The seeded ratio, e.g. "5v3", used ONLY as the no-opposition fallback
   * chip and always rendered muted.
   *
   * KNOWN GAP, flagged rather than worked around silently. The real source
   * for this is rondo_zones.canonical_rondo, which T-103 seeded on all 36
   * rows and migration 0006 added to the model. GET /api/formations does
   * not expose it: schemas.py RondoZoneOut carries zone_key, rondo_name,
   * teaches, polygon and trains_pattern_codes and nothing else, and this
   * ticket's scope is frontend only. So the fallback is split back out of
   * `rondo_name`, which is where T-103 left the ratio duplicated for
   * exactly this reason. When RondoZoneOut gains the column, delete this
   * function's second return value and read the field: nothing else in the
   * page changes, because the chip already treats it as opaque text.
   */
  seededRatio: string;
}

/**
 * Split "5v3 (the midfield box)" into a ratio and a name.
 *
 * Splits on the LAST " (" rather than the first, because one seeded name
 * carries a parenthetical inside the ratio itself
 * ("2v2 (+1 keeper) (the last line)") and splitting on the first would file
 * "+1 keeper" as the zone's name. A name with no parenthetical at all keeps
 * the whole string as its display name and yields no ratio, so an unusual
 * seed degrades to "no fallback chip" rather than to a wrong one.
 */
export function splitRondoName(rondoName: string): RondoZoneName {
  const idx = rondoName.lastIndexOf(" (");
  if (idx === -1 || !rondoName.endsWith(")")) {
    return { displayName: rondoName, seededRatio: "" };
  }
  const ratio = rondoName.slice(0, idx).trim();
  const name = rondoName.slice(idx + 2, rondoName.length - 1).trim();
  return { displayName: capitalise(name), seededRatio: ratio };
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Slot naming
// ---------------------------------------------------------------------------

/** Position codes (app/models/roster.py PositionCode). A rotation's
 *  what_moves slots are authored as slugs like "cb_l" and "middle_cb", and
 *  a plain de-slug turns those into "Cb l", which reads like a typo to the
 *  one audience that knows exactly what CB means. */
const POSITION_TOKENS = new Set(["gk", "cb", "fb", "wb", "dm", "cm", "am", "st", "ss", "w"]);
const SIDE_TOKENS: Record<string, string> = { l: "left", r: "right" };

/**
 * A slot slug as coach-facing text. `sentenceCase` false is for the middle
 * of a sentence ("becomes the third CB"), where the leading word must stay
 * lower case but a position code must not.
 */
export function slotLabel(slug: string, sentenceCase = true): string {
  const words = slug
    .split("_")
    .map((t) => (POSITION_TOKENS.has(t) ? t.toUpperCase() : (SIDE_TOKENS[t] ?? t)))
    .join(" ");
  if (!sentenceCase) return words;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Mean vertex, good enough to anchor a chip on the rectangles seeded and
 *  correct in spirit for any convex polygon a later seed might carry. */
export function polygonCentroid(polygon: readonly Pt[]): Pt {
  if (polygon.length === 0) return { x: 50, y: 50 };
  let sx = 0;
  let sy = 0;
  for (const p of polygon) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / polygon.length, y: sy / polygon.length };
}

// ---------------------------------------------------------------------------
// Zone read copy (doc 06 sections 2.1 and 5.1 control 3)
// ---------------------------------------------------------------------------

/**
 * The one line a zone card leads with once opposition is on the board.
 *
 * Every branch names its superiority. The parity branch is the one that
 * earns the engine its keep: same bodies, and whether that is an edge
 * depends entirely on whether one of ours is unmarked in there, which is
 * what `freeManWhy` carries when countZone reported "positional".
 */
export function zoneReadLine(count: ZoneCount, freeManWhy: string | null): string {
  if (count.verdict === "superiority") {
    return (
      `Numerical superiority: ${count.label} in this zone right now. ` +
      `More bodies than they have, so the spare man is real and the ball can be worked through here.`
    );
  }
  if (count.verdict === "inferiority") {
    return (
      `Numerical inferiority: ${count.label} in this zone right now. ` +
      `This is their zone. Play around it or move someone into it before you try to play through it.`
    );
  }
  if (count.superiorityKind === "positional" && freeManWhy) {
    return `Parity on bodies at ${count.label}, and still an edge. ${freeManWhy}`;
  }
  return (
    `Parity: ${count.label} in this zone right now. ` +
    `No numerical edge, and nobody of ours is free in here either, so there is no positional edge to play off yet.`
  );
}

// ---------------------------------------------------------------------------
// The matchup read (doc 06 sections 2.8 and 4)
// ---------------------------------------------------------------------------

/** Route copy for an INFERRED route. Softer than a seeded route line and
 *  says so out loud, because doc 06 section 4 requires exactly that when
 *  `MatchupRead.routeInferred` is true. */
export function inferredRouteLine(read: MatchupRead): string {
  const opener = "Read off the counts on the board rather than from a coached card, so treat it as a starting point.";
  if (read.route === "through") {
    return `${opener} The middle looks like yours, so the ball probably goes through it.`;
  }
  if (read.route === "around") {
    return `${opener} A flank looks like yours, so the ball probably goes around them.`;
  }
  return `${opener} Neither the middle nor a flank is yours, so the ball probably has to go over the block.`;
}

/** The "where are we spare" step. Null when no zone is ours. */
export function spareLine(read: MatchupRead, zoneName: (zoneKey: string) => string): string | null {
  if (!read.spare) return null;
  const kind = read.spare.superiorityKind === "positional" ? "Positional" : "Numerical";
  return `${kind} superiority in ${zoneName(read.spare.zoneKey)}: ${read.spare.label}.`;
}

/** The "where are we short" step. Null when no zone is theirs. */
export function shortLine(read: MatchupRead, zoneName: (zoneKey: string) => string): string | null {
  if (!read.short) return null;
  return `Numerical inferiority in ${zoneName(read.short.zoneKey)}: ${read.short.label}.`;
}

/** Doc 06 section 2.8: with no seeded card, say plainly that this pair has
 *  no coached read yet. Do not invent one. */
export const NO_SEEDED_MATCHUP_NOTE =
  "This pair has no coached read yet. The counts below are computed live from the two shapes on the board; the route under them is inferred, not written by a coach.";

// ---------------------------------------------------------------------------
// Positional grid checks (doc 06 section 5.2)
// ---------------------------------------------------------------------------

const COUNT_WORDS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
];

function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

/** Copy-ready phrase per lane, so a check reads like a sentence instead of
 *  a key lookup. Doc 06 section 5.2's own example uses the half-space
 *  wording verbatim. */
const LANE_PHRASE: Record<LaneKey, string> = {
  left_wing: "on the left wing",
  left_half_space: "in the left half-space",
  centre: "in the centre lane",
  right_half_space: "in the right half-space",
  right_wing: "on the right wing",
};

const LINE_PHRASE: Record<LineKey, string> = {
  own_build: "in your own build-up line",
  first_line: "on the first line",
  middle: "across the middle line",
  between_the_lines: "between the lines",
  last_line: "on the last line",
};

function laneLabel(key: string): string {
  return JDP_GRID.lanes.find((l) => l.key === key)?.label ?? key;
}

function lineLabel(key: string): string {
  return JDP_GRID.lines.find((l) => l.key === key)?.label ?? key;
}

/**
 * One breach as a coaching CHECK.
 *
 * Every sentence ends in a question the coach answers, never a verdict the
 * app hands down. Doc 06 section 2.2 is explicit that a temporary breach is
 * legal football: forming a triangle, creating an overload, dragging a
 * marker out of position. So the copy asks whether it is deliberate and
 * never says the shape is wrong.
 */
export function breachCheck(breach: GridBreach): string {
  const word = countWord(breach.count);
  if (breach.kind === "lane_over") {
    const phrase = LANE_PHRASE[breach.cell as LaneKey] ?? `in the ${laneLabel(breach.cell).toLowerCase()}`;
    return `${word} ${phrase}. Intentional overload, or is someone standing in a teammate's zone?`;
  }
  if (breach.kind === "wide_lane_shared") {
    const phrase = LANE_PHRASE[breach.cell as LaneKey] ?? `in the ${laneLabel(breach.cell).toLowerCase()}`;
    return `${word} ${phrase}. Wide lanes hold one each when you can. Is the second man arriving late, or parked there?`;
  }
  const phrase = LINE_PHRASE[breach.cell as LineKey] ?? `on the ${lineLabel(breach.cell).toLowerCase()}`;
  return `${word} ${phrase}. That is one line for them to defend against. Is one of those meant to be higher or deeper?`;
}

/** What the grid panel says when nothing breaches. Names the superiority,
 *  same as every other card the engine emits (doc 06 section 2.1). */
export const NO_BREACH_CHECK =
  "No occupancy checks on this shape. Five lanes and five lines, none of them crowded, which is the positional superiority the grid is asking for.";

/** Interior lane boundaries, in model y. Drawn as the overlay's vertical
 *  lines in BOTH orientations, since portrait maps left = y. */
export function laneBoundaries(): number[] {
  return JDP_GRID.lanes.slice(0, -1).map((l) => l.max);
}

/** Interior line boundaries, in model x. Drawn as the overlay's horizontal
 *  lines: landscape top = x, portrait top = 100 - x. */
export function lineBoundaries(): number[] {
  return JDP_GRID.lines.slice(0, -1).map((l) => l.max);
}
