// Pure coordinate model for the board engine. No React, no DOM, no imports.
// This module is the single source of truth for how landscape MODEL
// coordinates map to on-screen RENDER coordinates, in both orientations.
//
// CLAUDE.md rule 8 / Brief step 10 / design README:
//   Positions are ALWAYS stored in landscape model coordinates:
//     x 0-100 left to right toward the attacking goal,
//     y 0-100 top to bottom.
//   Orientation is a render concern only.
//   Portrait render:  left = y,  top = 100 - x   (inverse applied to drag input).
//
// T-021 (animation player) and T-022 (recorder) build on top of this module.
// Keep it pure and dependency free so the mapping is unit testable and reusable.

export type Orientation = "landscape" | "portrait";

/** A position in landscape model space. This is the ONLY form ever stored. */
export interface ModelPoint {
  x: number; // 0-100 toward the attacking goal
  y: number; // 0-100 top to bottom
}

/**
 * A position in normalized render space, 0-100 on each axis, oriented the way
 * the viewer sees it (left grows rightward, top grows downward). The pitch
 * aspect ratio is applied when this is scaled into pixels, not here.
 */
export interface RenderPoint {
  left: number; // 0-100
  top: number; // 0-100
}

/** Pixel size of the drawing surface (viewBox or element box). */
export interface Size {
  width: number;
  height: number;
}

export interface PixelPoint {
  px: number;
  py: number;
}

// Pitch aspect ratios (width / height). The model is a normalized 0-100 square;
// the surface stretches it to these proportions so the pitch looks right.
// Landscape uses real-pitch-like 105:68; portrait is the design README's 7:10.
export const PITCH_ASPECT: Record<Orientation, number> = {
  landscape: 105 / 68,
  portrait: 7 / 10,
};

/**
 * MODEL -> RENDER. The heart of the orientation contract.
 * Landscape is identity. Portrait rotates the pitch so the attacking goal is at
 * the top: left = y, top = 100 - x.
 */
export function modelToRender(p: ModelPoint, orientation: Orientation): RenderPoint {
  if (orientation === "portrait") {
    return { left: p.y, top: 100 - p.x };
  }
  return { left: p.x, top: p.y };
}

/**
 * RENDER -> MODEL. Exact inverse of modelToRender, applied to drag input so a
 * gesture on a portrait board writes correct landscape model coordinates.
 * Portrait inverse: x = 100 - top, y = left.
 */
export function renderToModel(r: RenderPoint, orientation: Orientation): ModelPoint {
  if (orientation === "portrait") {
    return { x: 100 - r.top, y: r.left };
  }
  return { x: r.left, y: r.top };
}

/** Normalized render space (0-100) -> pixels on a surface of the given size. */
export function renderToPixel(r: RenderPoint, size: Size): PixelPoint {
  return { px: (r.left / 100) * size.width, py: (r.top / 100) * size.height };
}

/** Pixels on a surface -> normalized render space (0-100). */
export function pixelToRender(p: PixelPoint, size: Size): RenderPoint {
  return { left: (p.px / size.width) * 100, top: (p.py / size.height) * 100 };
}

/** Convenience: model coordinates straight to pixels for a given orientation. */
export function modelToPixel(p: ModelPoint, orientation: Orientation, size: Size): PixelPoint {
  return renderToPixel(modelToRender(p, orientation), size);
}

/** Convenience: pixels straight to model coordinates for a given orientation. */
export function pixelToModel(p: PixelPoint, orientation: Orientation, size: Size): ModelPoint {
  return renderToModel(pixelToRender(p, size), orientation);
}

/** Clamp a model point into the 0-100 pitch so tokens never escape the board. */
export function clampModel(p: ModelPoint): ModelPoint {
  return {
    x: p.x < 0 ? 0 : p.x > 100 ? 100 : p.x,
    y: p.y < 0 ? 0 : p.y > 100 ? 100 : p.y,
  };
}
