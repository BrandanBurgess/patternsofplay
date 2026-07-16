// Converts an identity (wire shape: identityApi.ts) into the board
// engine's internal shapes for the Identity page (Brief step 20): a
// starting token scene plus a Playback for PatternPreviewBoard when the
// identity is `animated` (the four scripted signature animations), a
// static token scene with no Playback when it is `static` (Atletico,
// Man City: the two hardcoded shapes), or an empty scene when it is
// `details_only` (every remaining reference team: a data slot with no
// designed visualization, per CLAUDE.md rule 6, "content with no designed
// surface stays seed data").
//
// Deliberately reuses patternPreview.ts's toDeclarativeSpec rather than
// redefining it: identities.signature_animation_spec_json is the exact
// same doc 03 4.1 declarative-spec wire shape a library preset's
// animation_spec already is.

import type { IdentityOutWire } from "../identityApi";
import { toDeclarativeSpec } from "./patternPreview";
import { buildDeclarativePlayback, type Playback } from "../board/playback";
import type { ModelPoint } from "../board/coords";
import type { PreviewToken } from "../board/PatternPreviewBoard";

export function identityPreview(identity: IdentityOutWire): { tokens: PreviewToken[]; playback: Playback | null } {
  if (identity.shape_render === "animated" && identity.signature_animation_spec) {
    const spec = identity.signature_animation_spec;
    const tokens: PreviewToken[] = spec.slots.map((s) => ({
      id: s.slot,
      side: s.side === "opponent" ? "away" : "home",
      label: s.role_hint ?? "",
      pos: s.start,
    }));
    const holder = spec.slots.find((s) => s.slot === spec.ball.holder_slot);
    const ballPos: ModelPoint = holder?.start ?? { x: 50, y: 50 };
    tokens.push({ id: "ball", side: "ball", label: "", pos: ballPos });

    // Identity binding: the preview's own token ids ARE the spec's slot
    // names, same as patternPreview.ts's library-item preview.
    const binding: Record<string, string> = {};
    for (const s of spec.slots) binding[s.slot] = s.slot;

    return { tokens, playback: buildDeclarativePlayback(toDeclarativeSpec(spec), binding, "ball") };
  }

  if (identity.shape_render === "static" && identity.static_shape) {
    const tokens: PreviewToken[] = identity.static_shape.positions.map((p) => ({
      id: p.slot,
      side: "home",
      label: p.role_hint ?? "",
      pos: { x: p.x, y: p.y },
    }));
    return { tokens, playback: null };
  }

  // details_only (Bible 6.1, 6.3, ...): no visualization, the board stays
  // empty and Details carries the full five-part template instead.
  return { tokens: [], playback: null };
}
