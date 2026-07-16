// Round-trip mapping tests, written BEFORE anything is built on the mapping
// (Brief step 10, board-engine skill). The lossless landscape/portrait round
// trip is the load-bearing invariant of the whole board engine, so it is
// proven exhaustively across the grid (edges 0 and 100 included) and with
// fractional and randomized points, in both directions and both orientations.

import { describe, expect, it } from "vitest";
import {
  clampModel,
  modelToPixel,
  modelToRender,
  Orientation,
  pixelToModel,
  renderToModel,
  type ModelPoint,
} from "./coords";

const ORIENTATIONS: Orientation[] = ["landscape", "portrait"];

// A dense grid that explicitly includes both edges (0 and 100), the center, and
// fractional coordinates. These are the value shapes real content actually
// stores: seed specs use integers, and pixel-snapped drags land on dyadic
// fractions. Such values round trip bit-for-bit through "top = 100 - x". Messy
// full-precision doubles are covered separately by the fp-precision test.
function gridPoints(): ModelPoint[] {
  const axis = [0, 1, 5, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 99, 100];
  const points: ModelPoint[] = [];
  for (const x of axis) for (const y of axis) points.push({ x, y });
  return points;
}

// Deterministic pseudo-random points for property-style coverage.
function randomPoints(n: number): ModelPoint[] {
  let seed = 0x2f6e2b1;
  const next = () => {
    // xorshift32, deterministic so failures reproduce.
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 0xffffffff) * 100;
  };
  return Array.from({ length: n }, () => ({ x: next(), y: next() }));
}

describe("model <-> render round trip is lossless", () => {
  for (const orientation of ORIENTATIONS) {
    it(`grid points survive round trip exactly (${orientation})`, () => {
      for (const p of gridPoints()) {
        const back = renderToModel(modelToRender(p, orientation), orientation);
        expect(back.x).toBe(p.x);
        expect(back.y).toBe(p.y);
      }
    });

    // Arbitrary full-precision doubles round trip losslessly to floating-point
    // precision. Portrait's "top = 100 - x" is exactly reversible for x in
    // [50,100] (Sterbenz) and drifts by at most ~1 ULP (order 1e-13 on a 0-100
    // pitch, far below sub-pixel) for smaller x. Realistic/seeded coordinates,
    // covered exactly by the grid test above, always survive bit-for-bit.
    it(`random points survive round trip to fp precision (${orientation})`, () => {
      for (const p of randomPoints(2000)) {
        const back = renderToModel(modelToRender(p, orientation), orientation);
        expect(Math.abs(back.x - p.x)).toBeLessThan(1e-9);
        expect(Math.abs(back.y - p.y)).toBeLessThan(1e-9);
      }
    });
  }
});

describe("portrait mapping matches the design README formula", () => {
  it("maps left = y, top = 100 - x", () => {
    const p: ModelPoint = { x: 20, y: 70 };
    const r = modelToRender(p, "portrait");
    expect(r.left).toBe(70); // left = y
    expect(r.top).toBe(80); // top = 100 - x
  });

  it("inverts drag input as x = 100 - top, y = left", () => {
    const m = renderToModel({ left: 70, top: 80 }, "portrait");
    expect(m.x).toBe(20);
    expect(m.y).toBe(70);
  });

  it("attacking goal (x=100) renders at the top in portrait", () => {
    expect(modelToRender({ x: 100, y: 50 }, "portrait").top).toBe(0);
    expect(modelToRender({ x: 0, y: 50 }, "portrait").top).toBe(100);
  });
});

describe("landscape mapping is identity", () => {
  it("leaves coordinates untouched", () => {
    const p: ModelPoint = { x: 37, y: 62 };
    const r = modelToRender(p, "landscape");
    expect(r).toEqual({ left: 37, top: 62 });
    expect(renderToModel(r, "landscape")).toEqual(p);
  });
});

describe("pixel round trip through a surface", () => {
  // The pitch aspect differs between orientations, so pixels must round trip
  // per orientation with its own surface size. Tolerance is floating point only.
  const sizes: Record<Orientation, { width: number; height: number }> = {
    landscape: { width: 1050, height: 680 },
    portrait: { width: 700, height: 1000 },
  };
  for (const orientation of ORIENTATIONS) {
    it(`model -> pixel -> model within fp tolerance (${orientation})`, () => {
      const size = sizes[orientation];
      for (const p of randomPoints(500)) {
        const back = pixelToModel(modelToPixel(p, orientation, size), orientation, size);
        expect(back.x).toBeCloseTo(p.x, 9);
        expect(back.y).toBeCloseTo(p.y, 9);
      }
    });
  }
});

describe("clampModel keeps tokens on the pitch", () => {
  it("clamps beyond either edge", () => {
    expect(clampModel({ x: -5, y: 120 })).toEqual({ x: 0, y: 100 });
    expect(clampModel({ x: 50, y: 50 })).toEqual({ x: 50, y: 50 });
  });
});
