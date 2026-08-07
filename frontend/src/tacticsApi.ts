// Wire types and fetch calls for the Tactics Lab routes (T-108,
// backend/app/routers/tactics.py; doc 06 sections 3.2 and 5.1). Mirrors
// backend/app/schemas.py field for field, the same convention
// formationsApi.ts and libraryApi.ts already follow.
//
// Library world only: phases, matchups and rotations carry no team_id, so
// none of these calls takes or sends one (CLAUDE.md rule 4).
//
// T-107 adds the personnel panel's three surfaces below, in doc 06 section
// 5.3 order: the archetype catalog (GET /archetypes, library world, both
// roles), the ranked suggestion list (GET /archetypes/suggest, COACH-ONLY,
// 403s a player token), and the live unit balance evaluation
// (POST /formations/{code}/balance, also COACH-ONLY). FormationsPage.tsx is
// the one caller and is responsible for never firing the two coach-only
// fetchers for a player-role session (CLAUDE.md rule 5); nothing in this
// module gates on role itself, same as every other file in this repo that
// only wraps `fetch`.
//
// The team-formations routes (T-108: GET/POST/PUT /api/team-formations) are
// still deliberately absent here. Doc 06 section 5.3 never asks the
// personnel panel to persist a saved setup, and the balance endpoint's own
// docstring says it evaluates the panel's UNSAVED state: eleven scratch
// picks kept in FormationsPage.tsx's own React state, never written
// anywhere. Wiring team-formations into this panel would be inventing a
// save surface doc 06 does not ask for.

import { request } from "./api";
import type { FormationPositionWire } from "./formationsApi";
import type { AnimationSpecWire } from "./libraryApi";
import type { Flank, WorkRate } from "./rosterApi";

/** formation_phases.phase. `transition` is in the vocabulary but nothing is
 *  seeded against it yet, so the page's phase segment does not offer it. */
export type PhaseName = "in_possession" | "out_of_possession" | "rest_defence" | "transition";

export interface FormationPhaseWire {
  formation_code: string;
  variant_code: string;
  phase: PhaseName;
  name: string;
  shape_label: string;
  blurb: string;
  positions: FormationPositionWire[];
  trigger: string;
  rest_shape: string | null;
  reference_code: string | null;
  uses_rotations: string[];
}

export interface FormationMatchupWire {
  ours_code: string;
  theirs_code: string;
  our_edges: string[];
  their_edges: string[];
  route: string;
  route_kind: "through" | "around" | "over";
}

/** Always 200: `matchup` is null when the pair has no seeded card, which
 *  doc 06 section 2.8 treats as a normal state to render plainly, not an
 *  error to hide. */
export interface FormationMatchupResponseWire {
  ours_code: string;
  theirs_code: string;
  matchup: FormationMatchupWire | null;
}

export interface RotationMoveWire {
  slot: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  becomes?: string | null;
}

export interface RotationSystemWire {
  code: string;
  name: string;
  family: "first_line" | "pivot" | "wide" | "front_line";
  applies_to_formations: string[];
  produces_shape: string;
  trigger: string;
  what_moves: RotationMoveWire[];
  coaching_points: string[];
  risk: string;
  requires_profile: Record<string, unknown> | null;
  animation_spec: AnimationSpecWire | null;
  exemplar_note: string | null;
}

export function listFormationPhases(code: string): Promise<FormationPhaseWire[]> {
  return request<FormationPhaseWire[]>(`/formations/${encodeURIComponent(code)}/phases`);
}

export function getFormationMatchup(
  ours: string,
  theirs: string
): Promise<FormationMatchupResponseWire> {
  const query = `ours=${encodeURIComponent(ours)}&theirs=${encodeURIComponent(theirs)}`;
  return request<FormationMatchupResponseWire>(`/formations/matchup?${query}`);
}

export function listRotations(formationCode: string): Promise<RotationSystemWire[]> {
  return request<RotationSystemWire[]>(
    `/rotations?formation_code=${encodeURIComponent(formationCode)}`
  );
}

// ---------------------------------------------------------------------------
// Position archetypes (doc 06 sections 2.6, 3.1, 5.3; T-102/T-108). Library
// world, read-only, both roles: no different from listFormations or
// listRotations above.
// ---------------------------------------------------------------------------

export interface PositionArchetypeWire {
  code: string;
  slot_family: string;
  name: string;
  definition: string;
  key_attribute_keys: string[];
  foot_hint: "same_side" | "opposite_side" | "either" | null;
  awr_default: WorkRate;
  dwr_default: WorkRate;
  duties: string[];
  enables_pattern_codes: string[];
  enables_rotation_codes: string[];
  needs_around_it: string;
  exemplar_note: string | null;
}

export function listArchetypes(slotFamily?: string): Promise<PositionArchetypeWire[]> {
  const qs = slotFamily ? `?slot_family=${encodeURIComponent(slotFamily)}` : "";
  return request<PositionArchetypeWire[]>(`/archetypes${qs}`);
}

// ---------------------------------------------------------------------------
// Archetype suggestion ranking (doc 06 section 5.3), COACH-ONLY: 403s a
// player token (backend/app/routers/tactics.py suggest_archetypes,
// require_role_on_team("coach")). `why` is the server's own cited reason,
// built from the player's real attribute values, footedness and work
// rates ("passing range 5 and positional discipline 4 fit the metronome"),
// never a score; render it verbatim (doc 06 section 5.3, this ticket's own
// non-negotiable).
// ---------------------------------------------------------------------------

export interface ArchetypeSuggestionWire {
  archetype_code: string;
  archetype_name: string;
  slot_family: string;
  why: string;
}

/** `player_id` echoes back null when the caller asked for no player (the
 *  empty-roster / unassigned-slot state, doc 06 section 5.3), not an
 *  error: the response still carries a usable top three. */
export interface ArchetypeSuggestResponseWire {
  slot_family: string;
  player_id: number | null;
  suggestions: ArchetypeSuggestionWire[];
}

export function suggestArchetypes(params: {
  slotFamily: string;
  playerId?: number | null;
  side?: Flank | null;
}): Promise<ArchetypeSuggestResponseWire> {
  const query = new URLSearchParams({ slot_family: params.slotFamily });
  if (params.playerId !== undefined && params.playerId !== null) {
    query.set("player_id", String(params.playerId));
  }
  if (params.side) query.set("side", params.side);
  return request<ArchetypeSuggestResponseWire>(`/archetypes/suggest?${query.toString()}`);
}

// ---------------------------------------------------------------------------
// Unit balance evaluation (doc 06 sections 2.6, 3.1, 5.3; T-110), COACH-ONLY:
// 403s a player token (backend/app/routers/tactics.py evaluate_balance,
// require_role_on_team("coach")). POST because it evaluates the personnel
// panel's own UNSAVED eleven picks, not a saved row (module comment above).
// ---------------------------------------------------------------------------

export interface UnitBalanceSlotWire {
  slot: string;
  archetype_code: string | null;
}

/** One fired unit_balance_rules row. `message` is the seeded warning_copy
 *  verbatim (backend/app/units.py); this ticket's non-negotiable is to
 *  render it as-is, never compose or soften it further, because the seeded
 *  copy already reads as a check rather than an error. */
export interface UnitBalanceNoteWire {
  code: string;
  unit: string;
  flank: Flank | null;
  severity: "note" | "warning";
  message: string;
  slots: string[];
}

export interface UnitBalanceUnitWire {
  unit: string;
  /** Set only for wide_unit, which occurs once per touchline. */
  flank: Flank | null;
  slots: string[];
  assigned_slots: string[];
  is_complete: boolean;
  notes: UnitBalanceNoteWire[];
}

/** `units_not_evaluated` is part of the contract, not debug output: a unit
 *  the current formation does not contain (a 4-3-3 has no double pivot) is
 *  simply absent from `units` and named here instead, so the panel can say
 *  nothing about it rather than shout a warning about a unit that is not
 *  on the pitch. */
export interface UnitBalanceResponseWire {
  formation_code: string;
  units: UnitBalanceUnitWire[];
  units_not_evaluated: string[];
}

export function evaluateUnitBalance(
  formationCode: string,
  slots: UnitBalanceSlotWire[]
): Promise<UnitBalanceResponseWire> {
  return request<UnitBalanceResponseWire>(
    `/formations/${encodeURIComponent(formationCode)}/balance`,
    { method: "POST", body: JSON.stringify({ slots }) }
  );
}
