// Pure helpers for the Formations page's personnel panel (T-107, doc 06
// sections 2.6, 2.7, 5.3). No React, no DOM, no network: FormationsPage.tsx
// owns the data fetching (roster, archetypes, suggestions, unit balance)
// and this module turns that data into the coach-facing copy and layout
// decisions, unit tested the same way formationsLab.ts is.
//
// TWO RULES THIS MODULE EXISTS TO KEEP HONEST.
//
// 1. A SUGGESTION'S "WHY" IS NEVER RECOMPUTED HERE. The API already cites
//    the real reason (backend/app/routers/tactics.py _build_why); this
//    module never re-derives, scores, or summarises it. FormationsPage.tsx
//    renders ArchetypeSuggestionWire.why verbatim.
//
// 2. FOOTEDNESS NOTES ARE COMPUTED HERE BECAUSE NO ENDPOINT CARRIES THEM.
//    Doc 06 section 2.7 is this ticket's own surface: T-108's suggestion
//    endpoint uses footedness internally to RANK candidates but never
//    returns the coaching note itself, and T-110's balance endpoint knows
//    nothing about individual players at all. So the six rules below are
//    real (if small) football logic that belongs to this ticket, not a
//    duplicate of anything already shipped.

import type { Flank, PreferredFoot } from "../rosterApi";

// ---------------------------------------------------------------------------
// Side, from the coordinate (doc 06 section 2.6 / backend/app/units.py
// flank_of). Landscape model coords, y running 0 to 100 top to bottom
// (CLAUDE.md rule 8): the left half of the pitch is the LOW half of y.
// Derived from the coordinate, never parsed out of a slot id suffix, for
// the same reason the backend does it this way: the coordinate is the
// stored truth and a slot id is a label.
// ---------------------------------------------------------------------------

export function sideOfY(y: number): Flank {
  if (y < 50) return "left";
  if (y > 50) return "right";
  return "center";
}

// ---------------------------------------------------------------------------
// Slot family display names (doc 06 section 2.6's ten families).
// ---------------------------------------------------------------------------

export const FAMILY_LABEL: Record<string, string> = {
  gk: "Goalkeeper",
  cb_central: "Centre back",
  cb_wide: "Centre back (wide)",
  fb: "Fullback",
  wb: "Wing back",
  six: "Six",
  eight: "Eight",
  ten: "Ten",
  wide_forward: "Wide forward",
  nine: "Nine",
};

export function familyLabel(slotFamily: string): string {
  return FAMILY_LABEL[slotFamily] ?? slotFamily;
}

// ---------------------------------------------------------------------------
// Personnel groups: a simple, complete PARTITION of the eleven slots for
// the panel's own layout and, on phone, the "one unit at a time" pager
// (doc 06 section 5.4). This is deliberately NOT app/units.py's crosswalk:
// that maps one slot into as many as two units at once (a fullback is in
// the back line AND his flank's wide unit), which is exactly right for
// EVALUATING balance but would mean rendering the same player/archetype
// picker twice for editing. The unit balance section below reads the real
// crosswalk straight off the coach-only balance response instead, so
// nobody duplicates app/units.py's football on this side of the wire.
// ---------------------------------------------------------------------------

export type PersonnelGroupKey = "gk" | "back_line" | "midfield" | "front_line";

const GROUP_FAMILIES: Record<PersonnelGroupKey, readonly string[]> = {
  gk: ["gk"],
  back_line: ["cb_central", "cb_wide", "fb", "wb"],
  midfield: ["six", "eight", "ten"],
  front_line: ["wide_forward", "nine"],
};

const GROUP_LABEL: Record<PersonnelGroupKey, string> = {
  gk: "Goalkeeper",
  back_line: "Back line",
  midfield: "Midfield",
  front_line: "Front line",
};

const GROUP_ORDER: PersonnelGroupKey[] = ["gk", "back_line", "midfield", "front_line"];

export interface PersonnelGroup<T extends { slot_family: string }> {
  key: PersonnelGroupKey;
  label: string;
  slots: T[];
}

/** Buckets the eleven slots into the four groups above, in GROUP_ORDER,
 *  each slot appearing exactly once and in the formation's own slot order
 *  within its group. A slot whose family matches nothing (should not
 *  happen against seeded data) is simply omitted rather than guessed at.
 *
 *  Generic over T rather than a fixed shape: the caller's own slot type
 *  (FormationPositionWire, narrowed to a non-null slot_family) carries
 *  more fields than grouping needs, and staying generic means this
 *  function returns THAT type back out rather than a stripped-down copy
 *  the caller would have to re-merge with the original wire object. */
export function personnelGroups<T extends { slot_family: string }>(
  positions: readonly T[]
): PersonnelGroup<T>[] {
  return GROUP_ORDER.map((key) => ({
    key,
    label: GROUP_LABEL[key],
    slots: positions.filter((p) => GROUP_FAMILIES[key].includes(p.slot_family)),
  })).filter((g) => g.slots.length > 0);
}

// ---------------------------------------------------------------------------
// Unit balance display labels (doc 06 sections 2.6, 3.1). The membership
// and the rule firing both come from the coach-only balance response
// (POST /formations/{code}/balance); this is only the copy that turns its
// `unit` code and `flank` into a heading.
// ---------------------------------------------------------------------------

const UNIT_LABEL: Record<string, string> = {
  midfield_three: "Midfield three",
  double_pivot: "Double pivot",
  front_three: "Front three",
  strike_pair: "Strike pair",
  back_line: "Back line",
  wide_unit: "Wide unit",
  box_midfield: "Box midfield",
};

export function unitHeading(unit: string, flank: Flank | null): string {
  const label = UNIT_LABEL[unit] ?? unit;
  if (!flank || flank === "center") return label;
  return `${label}, ${flank}`;
}

// ---------------------------------------------------------------------------
// The footedness engine (doc 06 section 2.7). All six numbered rules, all
// one-line, all coach-facing, NEVER blocking: nothing here returns
// anything the panel could mistake for a validation error.
//
// Rule 6 first, because rules 1-4 defer to it: `B` (two-footed) suppresses
// every warning below FOR THAT SLOT and says so, because two-footedness is
// a genuine tactical asset and must read as one, not as an absence of
// data.
// ---------------------------------------------------------------------------

const TWO_FOOTED_NOTE =
  "Two-footed. That suppresses the footedness caution for this slot: a genuine tactical asset, not a gap in his game.";

/**
 * Rules 1-3 and 5, per slot. `slotFamily` decides which rule (if any)
 * applies; `side` is the slot's own side (sideOfY); `preferredFoot` is the
 * assigned player's. Returns null when no player is assigned (nothing to
 * say about a foot nobody has picked yet, doc 06 section 5.3's "the panel
 * still works ... with no players assigned") or when the slot family/side
 * combination carries no rule (doc 06 section 2.7 defines a rule for the
 * LEFT centre back only, not the right or the central one in a back
 * three, and for wide forwards and wing backs, not for a six/eight/ten/
 * nine/goalkeeper).
 *
 * Rule 5 (deliveries) is folded into rules 2 and 3's own line rather than
 * a separate note: doc 06 section 2.7 asks it to "attach ... next to the
 * delivery library links", and the wide forward / wing back line already
 * names the in-swing/out-swing consequence in the same breath a coach
 * would read it. It does not cite specific F1-F8 codes: seeds/deliveries.
 * json carries no in-swing/out-swing attribute on the delivery library
 * items themselves (only trajectory: ground/driven/whipped/floated/
 * clipped), and seeds/ is out of this ticket's scope to add one to.
 */
export function slotFootednessNote(
  slotFamily: string,
  side: Flank,
  preferredFoot: PreferredFoot | null
): string | null {
  if (preferredFoot === null) return null;

  const appliesToFamily =
    ((slotFamily === "cb_central" || slotFamily === "cb_wide") && side === "left") ||
    slotFamily === "wide_forward" ||
    slotFamily === "wb";
  if (!appliesToFamily) return null;

  if (preferredFoot === "B") return TWO_FOOTED_NOTE;

  const sameSide = (side === "left" && preferredFoot === "L") || (side === "right" && preferredFoot === "R");

  if (slotFamily === "cb_central" || slotFamily === "cb_wide") {
    // Rule 1: left centre back only (side === "left" is already asserted
    // by appliesToFamily above).
    return preferredFoot === "R"
      ? "Right-footed left centre back. Closed body shape: his first pass points back inside, and a presser who shades him infield takes half the pitch away."
      : "Left-footed left centre back. Opens the body to the whole field.";
  }

  if (slotFamily === "wide_forward") {
    // Rule 2, with rule 5's delivery consequence folded in.
    return sameSide
      ? "Same-footed to this flank. Touchline profile: holds width and delivers early, and an out-swinging ball from here suits his stronger foot."
      : "Opposite-footed to this flank. Inside forward profile: cuts in to shoot and leaves the touchline for an overlapping fullback, and an in-swinging ball from here suits his stronger foot.";
  }

  // slotFamily === "wb". Rule 3, with rule 5 folded in.
  return sameSide
    ? "Same-footed to this flank. Natural early cross, an out-swinging delivery."
    : "Opposite-footed to this flank. Cutback and inside combination play, an in-swinging delivery.";
}

/**
 * Rule 4: both fullbacks inverting on the same foot. Unlike rules 1-3 and
 * 5, this reads TWO slots at once (fb_l and fb_r), so it cannot be a
 * per-slot function: the panel calls it once per formation and attaches
 * the result under both fullback rows.
 *
 * Fires when both fullbacks share the identical preferred foot: the pivot
 * then always receives the ball from the same angle, which is what makes
 * it predictable to press, regardless of which one of the pair is
 * technically "inverting" relative to his own side. Either slot being
 * two-footed (rule 6) breaks that predictability on its own, so it
 * suppresses this note too, same as it suppresses the single-slot rules.
 */
export function fullbackPairNote(
  leftFoot: PreferredFoot | null,
  rightFoot: PreferredFoot | null
): string | null {
  if (leftFoot === null || rightFoot === null) return null;
  if (leftFoot === "B" || rightFoot === "B") return null;
  if (leftFoot !== rightFoot) return null;
  const footWord = leftFoot === "R" ? "right" : "left";
  return `Both fullbacks are ${footWord}-footed. The pivot receives from the same angle every time and becomes predictable to press.`;
}
