// Wire types and fetch calls for the sessions routes (doc 03 section 6;
// Brief step 23, PNG 21-23, 26, 28; T-042). Mirrors backend/app/schemas.py
// field for field.
//
// The coach/player split is expressed in the TYPES the same way the API
// expresses it in the payload: coach-only keys (receipts, viewed_count,
// recipient_count) exist only on CoachSessionWire, and the player's own
// you_watched exists only on PlayerSessionWire. A caller narrows with
// isCoachSession() rather than reading a nullable field, so there is no
// shape in this file that would let a player view render receipt data it
// was never sent (the API is the enforcement point; this keeps the client
// honest about it too).

import { request } from "./api";
import type { LibraryItemOutWire } from "./libraryApi";
import type { SavedPatternOutWire } from "./whiteboardApi";

export type SessionStatus = "draft" | "sent";
export type SessionItemKind = "library" | "saved_pattern";

export interface SessionItemWire {
  id: number;
  position: number;
  item_kind: SessionItemKind;
  library_item: LibraryItemOutWire | null;
  saved_pattern: SavedPatternOutWire | null;
}

export interface SessionReceiptWire {
  player_user_id: number;
  display_name: string;
  jersey_number: number | null;
  viewed_at: string | null;
  viewed: boolean;
}

interface SessionBaseWire {
  id: number;
  title: string;
  coach_note: string | null;
  status: SessionStatus;
  sent_at: string | null;
  created_at: string;
  items: SessionItemWire[];
}

export interface CoachSessionWire extends SessionBaseWire {
  receipts: SessionReceiptWire[];
  viewed_count: number;
  recipient_count: number;
}

export interface PlayerSessionWire extends SessionBaseWire {
  you_watched: boolean;
}

export type SessionWire = CoachSessionWire | PlayerSessionWire;

export function isCoachSession(session: SessionWire): session is CoachSessionWire {
  return "receipts" in session;
}

export function listSessions<T extends SessionWire = SessionWire>(): Promise<T[]> {
  return request<T[]>("/sessions");
}

export function fetchSession<T extends SessionWire = SessionWire>(id: number): Promise<T> {
  return request<T>(`/sessions/${id}`);
}

export function createSession(input: {
  title: string;
  coach_note?: string | null;
}): Promise<CoachSessionWire> {
  return request<CoachSessionWire>("/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSession(
  id: number,
  input: { title?: string; coach_note?: string }
): Promise<CoachSessionWire> {
  return request<CoachSessionWire>(`/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function addSessionItem(
  id: number,
  input:
    | { item_kind: "library"; library_item_id: number }
    | { item_kind: "saved_pattern"; saved_pattern_id: number }
): Promise<CoachSessionWire> {
  return request<CoachSessionWire>(`/sessions/${id}/items`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function moveSessionItem(
  id: number,
  itemId: number,
  position: number
): Promise<CoachSessionWire> {
  return request<CoachSessionWire>(`/sessions/${id}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ position }),
  });
}

export function removeSessionItem(id: number, itemId: number): Promise<CoachSessionWire> {
  return request<CoachSessionWire>(`/sessions/${id}/items/${itemId}`, { method: "DELETE" });
}

export function sendSession(id: number): Promise<CoachSessionWire> {
  return request<CoachSessionWire>(`/sessions/${id}/send`, { method: "POST" });
}

export function markSessionWatched(id: number): Promise<PlayerSessionWire> {
  return request<PlayerSessionWire>(`/sessions/${id}/watched`, { method: "POST" });
}
