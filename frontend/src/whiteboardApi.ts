// Wire types and fetch calls for the whiteboard backend (doc 03 sections
// 4.2 saved_patterns, 4.3 boards; T-030). These shapes mirror
// backend/app/schemas.py and backend/app/specs.py FIELD FOR FIELD (the API
// boundary), which is why they differ from the board engine's own internal
// shapes in frontend/src/board/animationTypes.ts (e.g. tokens carry a
// nested `pos` here vs flat x/y there, confirmed lanes are {a,b} objects
// here vs "a|b" keys there). frontend/src/board/wire.ts converts between
// the two; nothing outside that module and this one should need to know
// both shapes exist.

import type { Role } from "./api";
import { request } from "./api";

export interface BoardTokenWire {
  id: string;
  side: "home" | "away" | "ball";
  label: string;
  pos: { x: number; y: number };
}

export interface ConfirmedLaneWire {
  a: string;
  b: string;
}

export interface ZonesVisibleWire {
  thirds: boolean;
  half_spaces: boolean;
  zone_14: boolean;
  cutback: boolean;
}

export interface BoardSnapshotWire {
  tokens: BoardTokenWire[];
  confirmed_lanes: ConfirmedLaneWire[];
  blocking_threshold: number;
  marking_threshold: number;
  zones_visible: ZonesVisibleWire;
}

export interface BoardOutWire extends BoardSnapshotWire {
  id: number;
  updated_at: string;
}

export interface BoardStateOutWire {
  board: BoardOutWire | null;
}

export interface KeyframeWire {
  t_ms: number;
  token_id: string;
  x: number;
  y: number;
}

export interface SavedPatternCreateWire {
  name: string;
  board_snapshot: BoardSnapshotWire;
  keyframes: KeyframeWire[];
}

export interface SavedPatternOutWire {
  id: number;
  name: string;
  author_role: Role;
  // "COACH" or the author's display name, resolved server-side (doc 03 4.2
  // author stamping / design README roles table).
  author_label: string;
  board_snapshot: BoardSnapshotWire;
  keyframes: KeyframeWire[];
  created_at: string;
}

export function fetchCurrentBoard(): Promise<BoardStateOutWire> {
  return request<BoardStateOutWire>("/boards/current");
}

export function saveCurrentBoard(payload: BoardSnapshotWire): Promise<BoardOutWire> {
  return request<BoardOutWire>("/boards/current", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function listPatterns(): Promise<SavedPatternOutWire[]> {
  return request<SavedPatternOutWire[]>("/patterns");
}

export function createPattern(payload: SavedPatternCreateWire): Promise<SavedPatternOutWire> {
  return request<SavedPatternOutWire>("/patterns", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deletePattern(id: number): Promise<void> {
  return request<void>(`/patterns/${id}`, { method: "DELETE" });
}
