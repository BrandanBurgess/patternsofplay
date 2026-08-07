// Phase morph playback (T-105, doc 06 sections 2.4 and 5.1). Selecting a phase
// on the Formations page morphs the shape over 600ms, and the whole point of the
// morph is that it BINDS BY SLOT: doc 06 section 2.4 says "the coach watches
// their left back walk into midfield, not a token teleport". Slot identity is
// the thing that survives a phase change, so slot identity is what the animation
// is keyed on. Never an array index, never a position code, never a coordinate.
//
// WHY THIS IS A THIRD BUILDER AND NOT A THIRD FORMAT. playback.ts documents two
// content formats that must never merge: declarative specs (doc 03 4.1) and raw
// keyframes (doc 03 4.2). A phase morph is neither. It is not authored content
// at all: it is a computed transition between two seeded position sets, with no
// steps, no captions of its own, no ball waypoints and no route badges. So it
// gets its own builder producing the SAME `Playback` object the other two
// produce, and it is driven by the SAME PlayerController on the SAME FrameLoop
// clock. One player, one timing model, one coordinate model, three builders.
// Nothing here is a second animation loop and nothing here is a second renderer.
//
// Squeezing a morph into a DeclarativeSpec was the alternative and it was worse:
// a spec requires `ball.holder_slot` and a per-step caption, so a morph would
// have had to invent a ball holder it does not have, and STEP_MS is a fixed 900
// where doc 06 asks for 600.
//
// LANDSCAPE MODEL COORDS THROUGHOUT (CLAUDE.md rule 8). Opponents arrive here
// already crossed into our frame by opponentLayer.ts, so this file reasons in
// one frame of reference and never mentions orientation.
//
// DETERMINISM. No Date.now(), no randomness. Elapsed time comes from the
// player's clock (time.ts) and everything below is a pure function of it.

import type { ModelPoint } from "./coords";
import { lerpModel, type Playback, type PlaybackFrame } from "./playback";
import type { SlotPos } from "./superiorityTypes";
import type { PreviewToken } from "./PatternPreviewBoard";
import {
  mirrorOpponentShape,
  opponentPhaseTokens,
  opponentTokenId,
  ourPhaseTokens,
  ourTokenId,
  type OpponentTokenOptions,
  type OurTokenOptions,
} from "./opponentLayer";

/** Doc 06 section 5.1: a phase change morphs the board over 600ms. */
export const PHASE_MORPH_MS = 600;

/**
 * One slot's journey through the morph, in landscape model coords.
 *
 * `tokenId` is resolved once here, at bind time, and the playback below works in
 * token ids from then on. That is what lets our eleven and their eleven share a
 * single Playback even though both sides use slot ids like "LB": the collision
 * is resolved by the namespacing in opponentLayer.ts, not by hoping it does not
 * happen.
 */
export interface SlotMorph {
  slot: string;
  position_code: string;
  tokenId: string;
  from: ModelPoint;
  to: ModelPoint;
  /**
   * False when the slot's coordinates are identical in both phases. Such a token
   * is pinned by construction (see lerpModel), so this is not needed to prevent
   * jitter. It is here so a surface can highlight who actually walks, which is
   * the coaching content of the morph.
   */
  moves: boolean;
}

export interface PhaseBinding {
  /** One entry per slot, in from-phase order, then any to-phase-only slots. */
  morphs: SlotMorph[];
  /**
   * Slots in the from-phase and not the to-phase. ALWAYS EMPTY for valid seed
   * data: T-103's validator requires a phase's slot set to equal the base
   * formation's exactly, so a non-empty list here is a bug in the caller or a
   * broken seed, never a legitimate state. Reported rather than thrown, because
   * a mismatched seed must not blank the board in front of a coach, and both
   * lists are asserted empty in the tests.
   */
  droppedSlots: string[];
  /** Slots in the to-phase and not the from-phase. Same contract as above. */
  addedSlots: string[];
}

function samePoint(a: SlotPos, b: SlotPos): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Pair two phases BY SLOT and produce one morph per slot.
 *
 * The three cases, all driven off slot identity:
 *  - In both phases: one continuous token walking from its old spot to its new
 *    one. This is the case that matters and it is every case in real data.
 *  - Only in the from-phase (dropped): held at its from position for the whole
 *    morph and reported in droppedSlots. It stays put rather than vanishing
 *    mid-animation.
 *  - Only in the to-phase (added): held at its to position and reported in
 *    addedSlots. Used deliberately when the opposition layer is switched ON
 *    mid-session, where there is no from-phase to walk out of and the block
 *    should simply be there.
 *
 * Output order is from-phase order then added slots, so it is stable frame to
 * frame and a surface can key on it without reordering.
 */
export function bindPhasesBySlot(
  from: readonly SlotPos[],
  to: readonly SlotPos[],
  tokenIdOf: (slot: string) => string
): PhaseBinding {
  const toBySlot = new Map<string, SlotPos>();
  for (const p of to) toBySlot.set(p.slot, p);

  const morphs: SlotMorph[] = [];
  const droppedSlots: string[] = [];
  const seen = new Set<string>();

  for (const start of from) {
    seen.add(start.slot);
    const end = toBySlot.get(start.slot);
    if (end === undefined) {
      droppedSlots.push(start.slot);
      morphs.push({
        slot: start.slot,
        position_code: start.position_code,
        tokenId: tokenIdOf(start.slot),
        from: { x: start.x, y: start.y },
        to: { x: start.x, y: start.y },
        moves: false,
      });
      continue;
    }
    morphs.push({
      slot: start.slot,
      position_code: end.position_code,
      tokenId: tokenIdOf(start.slot),
      from: { x: start.x, y: start.y },
      to: { x: end.x, y: end.y },
      moves: !samePoint(start, end),
    });
  }

  const addedSlots: string[] = [];
  for (const end of to) {
    if (seen.has(end.slot)) continue;
    addedSlots.push(end.slot);
    morphs.push({
      slot: end.slot,
      position_code: end.position_code,
      tokenId: tokenIdOf(end.slot),
      from: { x: end.x, y: end.y },
      to: { x: end.x, y: end.y },
      moves: false,
    });
  }

  return { morphs, droppedSlots, addedSlots };
}

/** Bind two of OUR phases. Both are already in our frame. */
export function bindOurPhases(from: readonly SlotPos[], to: readonly SlotPos[]): PhaseBinding {
  return bindPhasesBySlot(from, to, ourTokenId);
}

/**
 * Bind two OPPONENT phases, each given in THEIR OWN frame exactly as seeded.
 * Both sides are crossed into our frame here, so a caller never has to hold an
 * opponent coordinate in our frame and never has a reason to mirror by hand.
 */
export function bindOpponentPhases(
  fromOwnFrame: readonly SlotPos[],
  toOwnFrame: readonly SlotPos[]
): PhaseBinding {
  return bindPhasesBySlot(
    mirrorOpponentShape(fromOwnFrame),
    mirrorOpponentShape(toOwnFrame),
    opponentTokenId
  );
}

/**
 * Ease in, ease out, cubic. Pure and deterministic.
 *
 * The morph is a shape walking, not a ball flying. Linear interpolation gives a
 * hard start and a hard stop, which reads as a teleport with a delay in it and
 * undoes exactly the thing doc 06 section 2.4 asks the morph to communicate. The
 * two content formats in playback.ts stay linear because a recorded drag and an
 * authored pass are literal traces and must not be reshaped; a morph is not a
 * trace, so it is allowed to move like a body.
 *
 * ease(0) === 0 and ease(1) === 1 exactly, so both endpoints of every slot are
 * hit exactly, and the function is monotone so nothing ever backs up. All three
 * properties are asserted in the tests.
 */
export function easeInOutCubic(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

export interface PhaseMorphOptions {
  /** Defaults to PHASE_MORPH_MS (600). */
  durationMs?: number;
  /**
   * Caption for the strip under the board (doc 06 section 5.1: "names the
   * resulting shape and its trigger"). PatternPreviewBoard already renders
   * frame.caption, so the morph carries it and the page gets the strip for free.
   */
  caption?: string | null;
  /**
   * Optional ball, for the day a phase carries one. Doc 06 section 5.1 speaks of
   * "a phase with a defined ball position" while the formation_phases schema in
   * section 3.1 has no ball column, so this stays optional and unused by default
   * rather than being invented into the data model.
   */
  ball?: { tokenId?: string; from: ModelPoint; to: ModelPoint } | null;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Build the Playback for a morph. Consumed by the existing PlayerController and
 * rendered by the existing PatternPreviewBoard: no new loop, no new renderer.
 *
 * `morphs` is a flat list of slot journeys already resolved to token ids, so a
 * caller concatenates our binding and their binding and both sides morph inside
 * ONE playback on ONE clock. Two overlapping playbacks would be two clocks.
 */
export function buildPhaseMorphPlayback(
  morphs: readonly SlotMorph[],
  opts: PhaseMorphOptions = {}
): Playback {
  const durationMs = opts.durationMs ?? PHASE_MORPH_MS;
  const caption = opts.caption ?? null;
  const ball = opts.ball ?? null;
  const ballTokenId = ball ? (ball.tokenId ?? "ball") : null;
  // Freeze the list at build time: the Playback must be a pure function of the
  // moment it was built, not of an array a caller might mutate later.
  const tracks = morphs.map((m) => ({
    tokenId: m.tokenId,
    from: { x: m.from.x, y: m.from.y },
    to: { x: m.to.x, y: m.to.y },
  }));

  return {
    durationMs,
    ballTokenId,
    loop: false,
    sample(tMs: number): PlaybackFrame {
      // A zero-length morph is fully resolved at t=0 rather than dividing by 0.
      const p = durationMs <= 0 ? 1 : easeInOutCubic(clamp01(tMs / durationMs));
      const actors = new Map<string, ModelPoint>();
      for (const t of tracks) actors.set(t.tokenId, lerpModel(t.from, t.to, p));
      return {
        actors,
        ball: ball ? lerpModel(ball.from, ball.to, p) : null,
        // A morph has no delivery, so there is no trail style and no route
        // badges. The overlay renders nothing, which is correct: numbered gold
        // badges number passes, and a shape change is not a pass.
        ballTrajectory: null,
        badges: [],
        caption,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// The entry point T-106 builds against
// ---------------------------------------------------------------------------

export interface PhaseSides {
  /** Our eleven for this phase, in our frame (as seeded). */
  ours: readonly SlotPos[];
  /**
   * Their eleven for this phase, in THEIR OWN frame (as seeded). Null or absent
   * means the opposition layer is off for this side of the transition.
   */
  theirs?: readonly SlotPos[] | null;
}

export interface MorphToPhaseInput {
  from: PhaseSides;
  to: PhaseSides;
  caption?: string | null;
  durationMs?: number;
  ourTokens?: OurTokenOptions;
  opponentTokens?: OpponentTokenOptions;
  ball?: PhaseMorphOptions["ball"];
}

export interface PhaseMorph {
  /**
   * The RESULTING scene, meaning the to-phase. This is what goes to
   * PatternPreviewBoard's `tokens` prop, and it must be the destination rather
   * than the origin: `tokens` is React-rendered state that any later re-render
   * repaints from, while the morph itself moves the DOM imperatively. Handing
   * over the from-phase would leave the board correct until the next unrelated
   * re-render snapped every token back to where it started.
   */
  tokens: PreviewToken[];
  /** Goes to PatternPreviewBoard's `playback` prop. */
  playback: Playback;
  ours: PhaseBinding;
  /** Null when the opposition layer is off in the RESULTING phase. */
  theirs: PhaseBinding | null;
}

/**
 * Build a complete phase transition: the destination scene plus the one
 * Playback that walks both elevens into it, bound by slot.
 *
 * This is the single call the Formations page needs. It exists so the page
 * cannot get the tokens/playback pairing wrong, and so opponent coordinates are
 * mirrored in exactly one place no matter which control the coach touched.
 */
export function morphToPhase(input: MorphToPhaseInput): PhaseMorph {
  const ours = bindOurPhases(input.from.ours, input.to.ours);

  const fromTheirs = input.from.theirs ?? null;
  const toTheirs = input.to.theirs ?? null;
  // Keyed on the DESTINATION. Opposition switched off means their tokens are
  // simply not in the resulting scene, so animating them out would be animating
  // tokens that no longer exist. Switched on means every opponent slot is an
  // "added" slot and the block appears already in place, which is right: their
  // shape did not walk in from anywhere, the coach just asked to see it.
  const theirs = toTheirs === null ? null : bindOpponentPhases(fromTheirs ?? [], toTheirs);

  const morphs: SlotMorph[] = theirs ? [...ours.morphs, ...theirs.morphs] : ours.morphs;

  const tokens: PreviewToken[] = [
    ...ourPhaseTokens(input.to.ours, input.ourTokens),
    ...(toTheirs ? opponentPhaseTokens(toTheirs, input.opponentTokens) : []),
  ];

  return {
    tokens,
    playback: buildPhaseMorphPlayback(morphs, {
      durationMs: input.durationMs,
      caption: input.caption,
      ball: input.ball,
    }),
    ours,
    theirs,
  };
}
