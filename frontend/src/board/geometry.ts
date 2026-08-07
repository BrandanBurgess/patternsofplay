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

// ---------------------------------------------------------------------------
// Containment predicates (added by T-104 for the superiority engine, doc 06
// section 4). They live here rather than in superiority.ts because this is the
// module the next person will look in for point-in-polygon, and one copy of that
// function is the whole point. superiority.ts re-exports them so the doc 06 API
// surface reads as written. Tests for both are in superiority.test.ts.
//
// BOUNDARY RULE: the boundary counts as INSIDE, for both the polygon and the
// circle. A player standing exactly on the edge of a rondo zone is in that zone.
// Two adjacent zones sharing an edge therefore both count a player standing on
// it, which is correct: zone counts are six independent readings of the same
// pitch, not a partition. The JdP grid in grid.ts IS a partition and uses a
// different, half-open rule; that difference is deliberate and documented there.
// ---------------------------------------------------------------------------

/** Tolerance for "lies exactly on the boundary" in model units. Model space is
 *  0-100, so 1e-9 is far below anything a coordinate can meaningfully express.
 *  No VERDICT depends on this: verdicts compare integer counts. */
const ON_BOUNDARY_EPSILON = 1e-9;

/** True when p lies on the closed segment [a,b], within the boundary tolerance. */
function isOnSegment(p: ModelPoint, a: ModelPoint, b: ModelPoint): boolean {
  // Reject anything outside the segment's bounding box first. This is what makes
  // the colinear-but-beyond-the-end case false rather than true.
  const minX = a.x < b.x ? a.x : b.x;
  const maxX = a.x > b.x ? a.x : b.x;
  const minY = a.y < b.y ? a.y : b.y;
  const maxY = a.y > b.y ? a.y : b.y;
  if (
    p.x < minX - ON_BOUNDARY_EPSILON ||
    p.x > maxX + ON_BOUNDARY_EPSILON ||
    p.y < minY - ON_BOUNDARY_EPSILON ||
    p.y > maxY + ON_BOUNDARY_EPSILON
  ) {
    return false;
  }
  // Colinearity: the cross product of (b-a) and (p-a) is zero on the line.
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  return Math.abs(cross) <= ON_BOUNDARY_EPSILON;
}

/**
 * Ray casting containment, with the boundary counted as inside.
 *
 * Two steps, and the order matters:
 *  1. If p lies on any edge or vertex, return true immediately. Ray casting
 *     gives an arbitrary answer for points exactly on the boundary, so the
 *     boundary is settled before the ray is ever cast.
 *  2. Otherwise cast a ray in -x and count crossings, using the half-open
 *     comparison `(yi > p.y) !== (yj > p.y)`. That strict-on-one-side test is
 *     what fixes the classic bug where a ray passing exactly through a VERTEX
 *     counts that vertex twice (once for each edge meeting there) and flips the
 *     answer. With this form a vertex is counted by the edge below it and not by
 *     the edge above, so it contributes exactly one crossing.
 *
 * Winding direction does not matter. Concave polygons are handled correctly.
 * A polygon with fewer than three vertices has no interior: only step 1 can
 * return true, which makes a two point "polygon" behave as the segment it is.
 */
export function pointInPolygon(p: ModelPoint, poly: ModelPoint[]): boolean {
  const n = poly.length;
  if (n === 0) return false;

  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    if (isOnSegment(p, poly[j], poly[i])) return true;
  }
  if (n < 3) return false;

  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const yi = poly[i].y;
    const yj = poly[j].y;
    if (yi > p.y !== yj > p.y) {
      // Parenthesised for the reader: (yi > p.y) !== (yj > p.y).
      const xAtRay = ((poly[j].x - poly[i].x) * (p.y - yi)) / (yj - yi) + poly[i].x;
      if (p.x < xAtRay) inside = !inside;
    }
  }
  return inside;
}

/** True when p is inside or exactly on the rim of the circle. Squared compare,
 *  so no square root and no rounding drift at the rim. */
export function pointInCircle(p: ModelPoint, centre: ModelPoint, r: number): boolean {
  return distanceSq(p, centre) <= r * r;
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
