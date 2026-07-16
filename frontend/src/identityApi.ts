// Wire types and fetch calls for the identity content routes (doc 03
// section 5; Brief step 20): reference teams, style archetypes, and cult
// corner, the Identity page's three browsable segments. Mirrors
// backend/app/schemas.py IdentityOut field for field, and reuses the
// animation spec wire shape libraryApi.ts already defines (doc 03 4.1:
// preset content and identities.signature_animation_spec_json are the
// exact same declarative-spec format).

import { request } from "./api";
import type { AnimationSpecWire } from "./libraryApi";

export type IdentityKind = "reference_team" | "style_archetype" | "cult_card";

/** doc 03 5: reference teams carry {role, note} objects; style archetypes
 * carry a plain role-code string list; cult cards carry null. */
export type KeystoneRoleWire = string | { role: string; note: string };

export interface PassRiskWire {
  encouraged: string[];
  tolerated: string[];
  discouraged: string[];
  tempo_rule: string;
}

export interface StaticShapePositionWire {
  slot: string;
  role_hint?: string | null;
  x: number;
  y: number;
}

export interface StaticShapeWire {
  positions: StaticShapePositionWire[];
  note?: string;
}

export interface IdentityOutWire {
  id: number;
  kind: IdentityKind;
  code: string;
  name: string;
  tag_line: string;
  formation_code: string | null;
  core_idea: string;
  signature_pattern_codes: string[];
  keystone_roles: KeystoneRoleWire[] | null;
  youth_takeaway: string;
  age_hint: string;
  block: "high" | "mid" | "low" | null;
  pass_risk: PassRiskWire | null;
  shape_render: "animated" | "static" | "details_only";
  signature_animation_spec: AnimationSpecWire | null;
  static_shape: StaticShapeWire | null;
}

export function listIdentities(kind?: IdentityKind): Promise<IdentityOutWire[]> {
  const qs = kind ? `?kind=${kind}` : "";
  return request<IdentityOutWire[]>(`/identities${qs}`);
}
