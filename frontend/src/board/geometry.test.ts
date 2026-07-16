// Geometry tests, written before the lane graph builds on this math. Covers the
// three cases the ticket calls out explicitly: degenerate segment, endpoints
// (perpendicular foot past the ends), and colinear points, plus the interception
// point and distance the blocking rule depends on.

import { describe, expect, it } from "vitest";
import type { ModelPoint } from "./coords";
import {
  closestPointOnSegment,
  distance,
  distanceSq,
  nearestBy,
} from "./geometry";

describe("distance", () => {
  it("is the Euclidean norm", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distanceSq({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
  });
  it("is zero for coincident points", () => {
    expect(distance({ x: 12, y: 34 }, { x: 12, y: 34 })).toBe(0);
  });
});

describe("closestPointOnSegment: interception point + perpendicular distance", () => {
  const a: ModelPoint = { x: 20, y: 50 };
  const b: ModelPoint = { x: 80, y: 50 }; // horizontal segment at y = 50

  it("drops a perpendicular to an interior foot", () => {
    // Defender directly above the midpoint by 10 units.
    const r = closestPointOnSegment({ x: 50, y: 40 }, a, b);
    expect(r.point).toEqual({ x: 50, y: 50 });
    expect(r.distance).toBe(10);
    expect(r.t).toBeCloseTo(0.5, 10);
  });

  it("puts the interception point exactly on the line for a defender standing on it", () => {
    const r = closestPointOnSegment({ x: 62, y: 50 }, a, b);
    expect(r.point).toEqual({ x: 62, y: 50 });
    expect(r.distance).toBe(0);
  });

  describe("endpoints: foot past the segment clamps to the nearer end", () => {
    it("clamps before a (t = 0)", () => {
      const r = closestPointOnSegment({ x: 0, y: 60 }, a, b);
      expect(r.t).toBe(0);
      expect(r.point).toEqual(a);
      expect(r.distance).toBeCloseTo(Math.hypot(20, 10), 10);
    });
    it("clamps beyond b (t = 1)", () => {
      const r = closestPointOnSegment({ x: 100, y: 53 }, a, b);
      expect(r.t).toBe(1);
      expect(r.point).toEqual(b);
      expect(r.distance).toBeCloseTo(Math.hypot(20, 3), 10);
    });
  });

  describe("degenerate segment (a == b): a pass to yourself", () => {
    it("returns the single point and the plain distance to it", () => {
      const p: ModelPoint = { x: 40, y: 30 };
      const same: ModelPoint = { x: 55, y: 55 };
      const r = closestPointOnSegment(p, same, same);
      expect(r.point).toEqual(same);
      expect(r.t).toBe(0);
      expect(r.distance).toBeCloseTo(distance(p, same), 10);
    });
    it("does not divide by zero (distance is finite)", () => {
      const r = closestPointOnSegment({ x: 1, y: 1 }, { x: 9, y: 9 }, { x: 9, y: 9 });
      expect(Number.isFinite(r.distance)).toBe(true);
    });
  });

  describe("colinear points", () => {
    it("reports zero distance for a point on the segment interior", () => {
      const r = closestPointOnSegment({ x: 35, y: 50 }, a, b);
      expect(r.distance).toBe(0);
      expect(r.point).toEqual({ x: 35, y: 50 });
    });
    it("reports the gap to the endpoint for a colinear point outside the segment", () => {
      const r = closestPointOnSegment({ x: 5, y: 50 }, a, b);
      expect(r.distance).toBe(15); // 20 - 5, clamped to endpoint a
      expect(r.point).toEqual(a);
    });
  });

  it("is symmetric in the segment endpoint order", () => {
    const p: ModelPoint = { x: 33, y: 41 };
    const forward = closestPointOnSegment(p, a, b);
    const backward = closestPointOnSegment(p, b, a);
    expect(backward.point.x).toBeCloseTo(forward.point.x, 10);
    expect(backward.point.y).toBeCloseTo(forward.point.y, 10);
    expect(backward.distance).toBeCloseTo(forward.distance, 10);
  });

  it("handles a diagonal segment", () => {
    // Segment from (0,0) to (10,10); point (0,10) projects to the midpoint (5,5).
    const r = closestPointOnSegment({ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 10 });
    expect(r.point.x).toBeCloseTo(5, 10);
    expect(r.point.y).toBeCloseTo(5, 10);
    expect(r.distance).toBeCloseTo(Math.hypot(5, 5), 10);
  });
});

describe("nearestBy", () => {
  const pts = [
    { id: "a", p: { x: 0, y: 0 } },
    { id: "b", p: { x: 10, y: 0 } },
    { id: "c", p: { x: 3, y: 4 } },
  ];
  it("finds the nearest item and its distance", () => {
    const r = nearestBy({ x: 0, y: 0 }, pts, (i) => i.p);
    expect(r?.item.id).toBe("a");
    expect(r?.distance).toBe(0);
  });
  it("returns null for an empty list", () => {
    expect(nearestBy({ x: 0, y: 0 }, [], (i: { p: ModelPoint }) => i.p)).toBeNull();
  });
});
