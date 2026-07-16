// Converts library items and saved patterns (wire shapes: libraryApi.ts,
// whiteboardApi.ts) into the board engine's internal shapes (Brief step
// 17): a starting token scene plus a Playback for PatternPreviewBoard, and
// a BoardSnapshot for "Open on whiteboard" (PUT /api/boards/current). This
// is the one place that knows both the wire shapes and the board engine's
// internal ones, the same role frontend/src/board/wire.ts plays for the
// whiteboard page.
//
// A library preset's animation spec only names the handful of slots (plus
// the ball) that move in it; the preview renders exactly those tokens, not
// the full 23-token default board (design mockups show a vignette of the
// players involved, e.g. PNG 09's third-man run: four players and the
// ball, not eleven a side).

import type { AnimationSpecWire, LibraryItemOutWire } from "../libraryApi";
import type { SavedPatternOutWire } from "../whiteboardApi";
import { fromWireSnapshot } from "../board/wire";
import { buildDeclarativePlayback, buildKeyframePlayback, type Playback } from "../board/playback";
import type { BoardSnapshot, DeclarativeSpec, SpecMove } from "../board/animationTypes";
import { DEFAULT_BLOCKING_THRESHOLD, DEFAULT_MARKING_THRESHOLD } from "../board/lanes";
import type { PreviewToken } from "../board/PatternPreviewBoard";
import type { ModelPoint } from "../board/coords";

function toDeclarativeSpec(spec: AnimationSpecWire): DeclarativeSpec {
  return {
    slots: spec.slots.map((s) => ({
      slot: s.slot,
      role_hint: s.role_hint ?? undefined,
      side: s.side ?? undefined,
      start: s.start,
    })),
    ball: { holder_slot: spec.ball.holder_slot },
    steps: spec.steps.map((step) => ({
      n: step.n,
      caption: step.caption,
      moves: (step.moves ?? []).map(
        (m): SpecMove => ({
          slot: m.slot,
          to: m.to,
          arc: m.arc === "outside" || m.arc === "inside" ? m.arc : undefined,
        })
      ),
      ball_to: step.ball_to ?? undefined,
    })),
    loop: spec.loop,
  };
}

/** Every token a library item's spec names (its slots, plus the ball at
 * the initial holder's spot), in landscape model coordinates. Empty when
 * the item has no animation spec (should not happen for real content, but
 * the field is nullable at the API boundary). */
function libraryItemTokens(item: LibraryItemOutWire): PreviewToken[] {
  const spec = item.animation_spec;
  if (!spec) return [];
  const tokens: PreviewToken[] = spec.slots.map((s) => ({
    id: s.slot,
    side: s.side === "opponent" ? "away" : "home",
    label: s.role_hint ?? "",
    pos: s.start,
  }));
  const holder = spec.slots.find((s) => s.slot === spec.ball.holder_slot);
  const ballPos: ModelPoint = holder?.start ?? { x: 50, y: 50 };
  tokens.push({ id: "ball", side: "ball", label: "", pos: ballPos });
  return tokens;
}

export function libraryItemPreview(
  item: LibraryItemOutWire
): { tokens: PreviewToken[]; playback: Playback | null } {
  const tokens = libraryItemTokens(item);
  const spec = item.animation_spec;
  if (tokens.length === 0 || !spec) return { tokens: [], playback: null };

  // Identity binding: the preview's own token ids ARE the spec's slot
  // names (no shared default-board token set to map onto here).
  const binding: Record<string, string> = {};
  for (const s of spec.slots) binding[s.slot] = s.slot;

  return { tokens, playback: buildDeclarativePlayback(toDeclarativeSpec(spec), binding, "ball") };
}

export function libraryItemBoardSnapshot(item: LibraryItemOutWire): BoardSnapshot | null {
  const tokens = libraryItemTokens(item);
  if (tokens.length === 0) return null;
  return {
    tokens: tokens.map((t) => ({ id: t.id, side: t.side, label: t.label, x: t.pos.x, y: t.pos.y })),
    confirmed_lanes: [],
    blocking_threshold: DEFAULT_BLOCKING_THRESHOLD,
    marking_threshold: DEFAULT_MARKING_THRESHOLD,
    zones_visible: [],
  };
}

export function savedPatternPreview(
  item: SavedPatternOutWire
): { tokens: PreviewToken[]; playback: Playback | null } {
  const snapshot = fromWireSnapshot(item.board_snapshot);
  const tokens: PreviewToken[] = snapshot.tokens.map((t) => ({
    id: t.id,
    side: t.side,
    label: t.label,
    pos: { x: t.x, y: t.y },
  }));
  return { tokens, playback: buildKeyframePlayback(item.keyframes, snapshot) };
}

export function savedPatternBoardSnapshot(item: SavedPatternOutWire): BoardSnapshot {
  return fromWireSnapshot(item.board_snapshot);
}
