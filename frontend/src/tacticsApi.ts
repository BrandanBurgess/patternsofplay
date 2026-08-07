// Wire types and fetch calls for the Tactics Lab routes (T-108,
// backend/app/routers/tactics.py; doc 06 sections 3.2 and 5.1). Mirrors
// backend/app/schemas.py field for field, the same convention
// formationsApi.ts and libraryApi.ts already follow.
//
// Library world only: phases, matchups and rotations carry no team_id, so
// none of these calls takes or sends one (CLAUDE.md rule 4). The team
// world routes (/api/team-formations) and the coach-only archetype
// suggestion ranking are deliberately absent: they belong to the personnel
// panel, which is T-107.

import { request } from "./api";
import type { FormationPositionWire } from "./formationsApi";
import type { AnimationSpecWire } from "./libraryApi";

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
