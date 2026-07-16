// Wire types and fetch calls for the roster backend (doc 03 section 3;
// Brief step 19; T-033). Mirrors backend/app/schemas.py field for field,
// same convention as whiteboardApi.ts. fit_warnings is optional on
// RosterGetWire on purpose: a player-role GET /api/roster response has no
// such key at all (CLAUDE.md rule 5, backend/app/routers/roster.py), so
// the frontend must never assume its presence.

import type { Role } from "./api";
import { request } from "./api";

export type WorkRate = "low" | "med" | "high";
export type Flank = "left" | "right" | "center";
export type PreferredFoot = "L" | "R" | "B";

export const ATTRIBUTE_KEYS = [
  "pace",
  "passing_range",
  "carrying_1v1",
  "positional_discipline",
  "aerial_physical",
  "pressing_engine",
] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  pace: "Pace",
  passing_range: "Passing range",
  carrying_1v1: "1v1 / carrying",
  positional_discipline: "Discipline",
  aerial_physical: "Aerial & physical",
  pressing_engine: "Pressing engine",
};

export type PlayerAttributesWire = Record<AttributeKey, number>;

export interface RoleCatalogWire {
  code: string;
  position_code: string;
  name: string;
  description: string;
}

export interface PlayerWire {
  id: number;
  name: string;
  jersey_number: number | null;
  preferred_foot: PreferredFoot;
  position_code: string | null;
  role_code: string | null;
  role_name: string | null;
  role_description: string | null;
  flank: Flank | null;
  awr: WorkRate;
  dwr: WorkRate;
  attributes: PlayerAttributesWire;
  is_you: boolean;
  // Approved playstyle suggestion text merged onto the profile (doc 03
  // section 3; T-041). Visible to both roles; null until a coach approves
  // one of this player's suggestions.
  playstyle_note: string | null;
}

// Playstyle suggestion flow (Brief step 22, PNG 24/25/27; T-041).
export type SuggestionStatus = "pending" | "approved" | "dismissed";

export interface SuggestionWire {
  id: number;
  player_id: number;
  player_name: string;
  author_user_id: number;
  text: string;
  status: SuggestionStatus;
  created_at: string;
  reviewed_at: string | null;
}

export interface FitWarningWire {
  code: string;
  name: string;
  flank: "left" | "right";
  message: string;
  wide_player_id: number;
  wide_player_name: string;
  back_player_id: number;
  back_player_name: string;
}

export interface RosterGetWire {
  players: PlayerWire[];
  // Present only when the caller is a coach (see module comment above).
  fit_warnings?: FitWarningWire[];
}

export interface PlayerWriteWire {
  name: string;
  jersey_number: number | null;
  preferred_foot: PreferredFoot;
  role_code: string | null;
  flank: Flank | null;
  awr: WorkRate;
  dwr: WorkRate;
  attributes: PlayerAttributesWire;
}

export function fetchRoster(): Promise<RosterGetWire> {
  return request<RosterGetWire>("/roster");
}

export function fetchRoleCatalog(): Promise<RoleCatalogWire[]> {
  return request<RoleCatalogWire[]>("/roster/roles");
}

export function createPlayer(payload: PlayerWriteWire): Promise<PlayerWire> {
  return request<PlayerWire>("/roster/players", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updatePlayer(id: number, payload: PlayerWriteWire): Promise<PlayerWire> {
  return request<PlayerWire>(`/roster/players/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deletePlayer(id: number): Promise<void> {
  return request<void>(`/roster/players/${id}`, { method: "DELETE" });
}

// Playstyle suggestion flow (Brief step 22, PNG 24/25/27; T-041). Mirrors
// backend/app/routers/suggestions.py field for field.

export function fetchPlayerSuggestions(playerId: number): Promise<SuggestionWire[]> {
  return request<SuggestionWire[]>(`/roster/players/${playerId}/suggestions`);
}

export function submitSuggestion(playerId: number, text: string): Promise<SuggestionWire> {
  return request<SuggestionWire>(`/roster/players/${playerId}/suggestions`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

// Coach-only (API-enforced, 403 for a player token): the team-wide pending
// review queue, which backs both the roster row's gold badge and the
// review card on a selected player's profile.
export function fetchPendingSuggestions(): Promise<SuggestionWire[]> {
  return request<SuggestionWire[]>("/roster/suggestions/pending");
}

export function approveSuggestion(suggestionId: number): Promise<SuggestionWire> {
  return request<SuggestionWire>(`/roster/suggestions/${suggestionId}/approve`, {
    method: "POST",
  });
}

export function dismissSuggestion(suggestionId: number): Promise<SuggestionWire> {
  return request<SuggestionWire>(`/roster/suggestions/${suggestionId}/dismiss`, {
    method: "POST",
  });
}

// Re-exported so callers of this module never need to import ./api just
// for the Role type.
export type { Role };
