// Playback math (T-022). PURE, deterministic, no React and no DOM: given a time
// in milliseconds it returns where every animated token sits. This is the whole
// board-engine playback contract and it is unit tested before anything renders
// on top of it (waypoint interpolation, a bound ball chasing a moving runner,
// keyframe interpolation, format abstraction).
//
// THE FORMAT ABSTRACTION (Brief section 7, board-engine skill): the player only
// ever sees a `Playback`. Two builders produce one:
//   - buildDeclarativePlayback(spec, binding): doc 03 4.1 preset content.
//   - buildKeyframePlayback(recording): doc 03 4.2 raw recordings.
// The two formats NEVER merge; the abstraction is the only thing they share, plus
// the single timing/coordinate model. Everything is landscape MODEL coordinates;
// orientation is applied only when a frame is drawn.

import type { ModelPoint } from "./coords";
import type {
  BoardSnapshot,
  DeclarativeSpec,
  Keyframe,
  Trajectory,
} from "./animationTypes";

/** Milliseconds a single declarative step occupies on the timeline. */
export const STEP_MS = 900;

/** A numbered gold route badge (design README: "Numbered gold badges"). */
export interface RouteBadge {
  /** Route order, 1-based. */
  n: number;
  /** Where the badge sits, in landscape model coordinates. */
  at: ModelPoint;
  /** The badge shows once the timeline passes this moment. */
  revealMs: number;
}

/** One sampled instant of an animation, in landscape model coordinates. */
export interface PlaybackFrame {
  /** Animated NON-ball tokens, keyed by board token id. */
  actors: Map<string, ModelPoint>;
  /** Ball position this instant, or null when the animation has no ball. */
  ball: ModelPoint | null;
  /** Trail style for the ball this instant; null renders the default trace. */
  ballTrajectory: Trajectory | null;
  /** Every route badge; the player reveals those whose revealMs <= tMs. */
  badges: RouteBadge[];
  /** Step caption (declarative) or null (raw recordings carry none). */
  caption: string | null;
}

/** The one thing the player consumes. Both formats build one of these. */
export interface Playback {
  readonly durationMs: number;
  /** Which board token id the ball drives, or null when there is no ball. */
  readonly ballTokenId: string | null;
  readonly loop: boolean;
  /** Position of everything at time tMs (clamped to [0, durationMs]). */
  sample(tMs: number): PlaybackFrame;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: ModelPoint, b: ModelPoint, p: number): ModelPoint {
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}

// ---------------------------------------------------------------------------
// Declarative specs (doc 03 4.1)
// ---------------------------------------------------------------------------

interface Anchor {
  t: number;
  p: ModelPoint;
}

/**
 * Bind a spec's abstract slots to concrete board token ids and produce a
 * Playback. The ball binds to a token id too (default "ball") so the player can
 * treat declarative and recorded playback identically: both hand back frames
 * keyed by board token id.
 *
 * binding must map every slot the caller wants rendered; slots absent from the
 * binding are simply not emitted (the demo binds only the tokens it moves).
 */
export function buildDeclarativePlayback(
  spec: DeclarativeSpec,
  binding: Record<string, string>,
  ballTokenId: string | null = "ball"
): Playback {
  const nSteps = spec.steps.length;
  const durationMs = nSteps * STEP_MS;

  // Per-slot piecewise-linear track. A slot holds its position until the step
  // that moves it BEGINS, then interpolates to the target across only that
  // step's own window [i*STEP, (i+1)*STEP]. The hold anchor at the window start
  // is what keeps a runner still through earlier steps instead of drifting from
  // t=0 toward a target set several steps later.
  const tracks = new Map<string, Anchor[]>();
  const current = new Map<string, ModelPoint>();
  for (const s of spec.slots) {
    tracks.set(s.slot, [{ t: 0, p: { ...s.start } }]);
    current.set(s.slot, { ...s.start });
  }
  for (let i = 0; i < nSteps; i++) {
    const startT = i * STEP_MS;
    const endT = (i + 1) * STEP_MS;
    for (const mv of spec.steps[i].moves ?? []) {
      const track = tracks.get(mv.slot);
      if (!track) continue;
      const last = track[track.length - 1];
      if (last.t < startT) track.push({ t: startT, p: { ...(current.get(mv.slot) ?? last.p) } });
      track.push({ t: endT, p: { x: mv.to.x, y: mv.to.y } });
      current.set(mv.slot, { x: mv.to.x, y: mv.to.y });
    }
  }

  const slotPosAt = (slot: string, t: number): ModelPoint => {
    const track = tracks.get(slot);
    if (!track || track.length === 0) return { x: 50, y: 50 };
    if (t <= track[0].t) return track[0].p;
    for (let k = 0; k < track.length - 1; k++) {
      const a = track[k];
      const b = track[k + 1];
      if (t <= b.t) return lerp(a.p, b.p, (t - a.t) / (b.t - a.t));
    }
    return track[track.length - 1].p;
  };

  // Ball. It travels with its current holder, and during a pass step it moves
  // from the holder's position toward the bound slot's LIVE position. Because
  // the target is re-read every sample, the ball CHASES a moving runner and, as
  // local progress reaches 1, lands exactly on that runner (this is the DoD:
  // "a pass into a moving runner connects because waypoints chase the bound
  // player").
  const ballAt = (t: number): { pos: ModelPoint; trajectory: Trajectory | null } => {
    if (nSteps === 0) {
      const holder = slotPosAt(spec.ball.holder_slot, 0);
      return { pos: holder, trajectory: null };
    }
    const idx = Math.min(Math.floor(t / STEP_MS), nSteps - 1);
    let holder = spec.ball.holder_slot;
    for (let i = 0; i < idx; i++) {
      const bt = spec.steps[i].ball_to;
      if (bt) holder = bt.bind_slot;
    }
    const step = spec.steps[idx];
    const start = idx * STEP_MS;
    const localT = Math.min(t, start + STEP_MS);
    if (step.ball_to) {
      const p = clamp((t - start) / STEP_MS, 0, 1);
      const from = slotPosAt(holder, start);
      const to = slotPosAt(step.ball_to.bind_slot, localT); // live target = chase
      return { pos: lerp(from, to, p), trajectory: step.ball_to.trajectory };
    }
    return { pos: slotPosAt(holder, localT), trajectory: null };
  };

  // One badge per pass, numbered by route order, revealed when the pass lands.
  const badges: RouteBadge[] = [];
  {
    let order = 0;
    for (let i = 0; i < nSteps; i++) {
      const bt = spec.steps[i].ball_to;
      if (!bt) continue;
      order += 1;
      const endT = (i + 1) * STEP_MS;
      badges.push({ n: order, at: slotPosAt(bt.bind_slot, endT), revealMs: endT });
    }
  }

  return {
    durationMs,
    ballTokenId,
    loop: spec.loop === true,
    sample(tMs: number): PlaybackFrame {
      const t = clamp(tMs, 0, durationMs);
      const actors = new Map<string, ModelPoint>();
      for (const s of spec.slots) {
        const tokenId = binding[s.slot];
        if (tokenId) actors.set(tokenId, slotPosAt(s.slot, t));
      }
      const b = ballAt(t);
      const idx = nSteps === 0 ? -1 : Math.min(Math.floor(t / STEP_MS), nSteps - 1);
      return {
        actors,
        ball: ballTokenId ? b.pos : null,
        ballTrajectory: b.trajectory,
        badges,
        caption: idx >= 0 ? spec.steps[idx].caption : null,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Raw keyframe recordings (doc 03 4.2)
// ---------------------------------------------------------------------------

const BALL_ID = "ball";
// A recording gets a route badge each time the ball has travelled at least this
// far (model units) from the previous badge, so a long trace shows a few ordered
// waypoints rather than one badge per captured frame.
const BADGE_SPACING = 14;

/**
 * Replay raw keyframes as recorded. Tokens interpolate between their own
 * keyframes; every token including opponents and the ball is driven purely from
 * the recorded samples (doc 03 4.2 "do not convert to the declarative format").
 * An optional snapshot supplies a t=0 anchor so a token that was dragged mid
 * recording still starts from its scene position.
 */
export function buildKeyframePlayback(
  keyframes: Keyframe[],
  snapshot?: BoardSnapshot
): Playback {
  const byToken = new Map<string, Keyframe[]>();
  for (const kf of keyframes) {
    let arr = byToken.get(kf.token_id);
    if (!arr) {
      arr = [];
      byToken.set(kf.token_id, arr);
    }
    arr.push(kf);
  }
  for (const arr of byToken.values()) arr.sort((a, b) => a.t_ms - b.t_ms);

  const snapPos = new Map<string, ModelPoint>();
  if (snapshot) for (const t of snapshot.tokens) snapPos.set(t.id, { x: t.x, y: t.y });

  let durationMs = 0;
  for (const kf of keyframes) if (kf.t_ms > durationMs) durationMs = kf.t_ms;

  const posAt = (tokenId: string, t: number): ModelPoint => {
    const arr = byToken.get(tokenId);
    if (!arr || arr.length === 0) {
      return snapPos.get(tokenId) ?? { x: 50, y: 50 };
    }
    if (t <= arr[0].t_ms) {
      // Before the first sample, hold the scene position if we have one so the
      // token does not teleport to where it was first grabbed.
      return snapPos.get(tokenId) ?? { x: arr[0].x, y: arr[0].y };
    }
    for (let k = 0; k < arr.length - 1; k++) {
      const a = arr[k];
      const b = arr[k + 1];
      if (t <= b.t_ms) {
        const span = b.t_ms - a.t_ms;
        const p = span === 0 ? 1 : (t - a.t_ms) / span;
        return lerp({ x: a.x, y: a.y }, { x: b.x, y: b.y }, p);
      }
    }
    const last = arr[arr.length - 1];
    return { x: last.x, y: last.y };
  };

  const ballKfs = byToken.get(BALL_ID);
  const ballTokenId = ballKfs && ballKfs.length > 0 ? BALL_ID : null;

  // Badges along the ball's recorded route, spaced by travelled distance.
  const badges: RouteBadge[] = [];
  if (ballKfs && ballKfs.length > 0) {
    let order = 0;
    let last: ModelPoint | null = null;
    for (const kf of ballKfs) {
      const here = { x: kf.x, y: kf.y };
      if (last === null || Math.hypot(here.x - last.x, here.y - last.y) >= BADGE_SPACING) {
        order += 1;
        badges.push({ n: order, at: here, revealMs: kf.t_ms });
        last = here;
      }
    }
  }

  const movedTokens = [...byToken.keys()].filter((id) => id !== BALL_ID);

  return {
    durationMs,
    ballTokenId,
    loop: false,
    sample(tMs: number): PlaybackFrame {
      const t = clamp(tMs, 0, durationMs);
      const actors = new Map<string, ModelPoint>();
      for (const id of movedTokens) actors.set(id, posAt(id, t));
      return {
        actors,
        ball: ballTokenId ? posAt(BALL_ID, t) : null,
        ballTrajectory: null,
        badges,
        caption: null,
      };
    },
  };
}
