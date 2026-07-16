// Pure planar geometry for the lane graph (T-021). No React, no DOM, no imports
// beyond the ModelPoint type. Every function operates in LANDSCAPE MODEL space
// (CLAUDE.md rule 8): lane logic never branches on orientation. Orientation is
// applied only when these model results are drawn (LaneOverlay -> modelToPixel).
//
// This is the load-bearing math for blocking (perpendicular distance from a
// defender to a pass segment, and the interception point = the closest point on
// that segment) and for marking (defender-to-attacker distance). It is unit
// tested for the degenerate segment, the endpoints, and the colinear cases
// before anything renders on top of it.

import type { ModelPoint } from "./coords";

/** Euclidean distance between two model points. */
export function distance(a: ModelPoint, b: ModelPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/** Squared distance. Cheaper when only comparing magnitudes (nearest-of search). */
export function distanceSq(a: ModelPoint, b: ModelPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export interface ClosestPoint {
  /** The point on segment [a,b] nearest to p. This is the interception point. */
  point: ModelPoint;
  /** Perpendicular (Euclidean) distance from p to that point. */
  distance: number;
  /** Parameter along the segment in [0,1]: 0 at a, 1 at b. Clamped to the segment. */
  t: number;
}

/**
 * Closest point on the CLOSED segment [a,b] to p, its distance, and the clamped
 * parameter t. The interception dot sits exactly on `point` (design README: the
 * dot marks the interception point = the closest point on the pass segment).
 *
 * Edge cases handled explicitly:
 *  - Degenerate segment (a == b, a "pass" to yourself): returns a with t = 0.
 *  - Foot of the perpendicular past an endpoint: t clamps to [0,1] so the dot
 *    stays on the drawn line, never off its end.
 *  - Colinear p: distance is 0 when p lies on the segment, otherwise the gap to
 *    the nearest endpoint.
 */
export function closestPointOnSegment(
  p: ModelPoint,
  a: ModelPoint,
  b: ModelPoint
): ClosestPoint {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;

  // Degenerate segment: both endpoints coincide, so the only point is a.
  if (lenSq === 0) {
    return { point: { x: a.x, y: a.y }, distance: distance(p, a), t: 0 };
  }

  // Project p onto the infinite line, then clamp the parameter to the segment.
  const raw = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  const t = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  const point: ModelPoint = { x: a.x + t * abx, y: a.y + t * aby };
  return { point, distance: distance(p, point), t };
}

/**
 * Nearest item to `p` from a list, by squared distance. Returns null for an
 * empty list. Used to pick the marking defender and the ball holder.
 */
export function nearestBy<T>(
  p: ModelPoint,
  items: T[],
  posOf: (item: T) => ModelPoint
): { item: T; distance: number } | null {
  let best: T | null = null;
  let bestSq = Infinity;
  for (const item of items) {
    const d = distanceSq(p, posOf(item));
    if (d < bestSq) {
      bestSq = d;
      best = item;
    }
  }
  return best === null ? null : { item: best, distance: Math.sqrt(bestSq) };
}
