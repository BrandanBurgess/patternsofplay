// Zone overlays (T-022, Brief step 13). PURE geometry in LANDSCAPE MODEL
// coordinates (x 0-100 toward the attacking goal, y 0-100 top to bottom); every
// zone is rendered through the same coords.ts mapping as tokens, so the overlay
// is correct in both orientations without any orientation logic here.
//
// Four toggleable groups (Brief step 13): thirds, half-spaces, Zone 14, and the
// cutback zones. Attacking direction is +x, so Zone 14 and the cutback pockets
// live in the attacking third. Geometry is expressed as axis-aligned model
// rectangles plus vertical dividers; the model->render mapping is a 90 degree
// axis swap, so an axis-aligned model rect stays axis-aligned on screen.

export type ZoneGroup = "thirds" | "halfspaces" | "zone14" | "cutback";

export const ZONE_GROUPS: ZoneGroup[] = ["thirds", "halfspaces", "zone14", "cutback"];

export const ZONE_GROUP_LABELS: Record<ZoneGroup, string> = {
  thirds: "Thirds",
  halfspaces: "Half-spaces",
  zone14: "Zone 14",
  cutback: "Cutback",
};

/** An axis-aligned zone in model space. x0<x1, y0<y1. */
export interface ZoneRect {
  key: string;
  group: ZoneGroup;
  label?: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A full-height vertical divider at model x (the lines between the thirds). */
export interface ZoneDivider {
  key: string;
  group: ZoneGroup;
  x: number;
}

export interface ZoneGeometry {
  rects: ZoneRect[];
  dividers: ZoneDivider[];
}

// Thirds split the length in three: defensive [0,33.3], middle, attacking.
const THIRD_1 = 100 / 3;
const THIRD_2 = 200 / 3;

// Vertical channels across the width. Half-spaces are the two channels flanking
// the central corridor (symmetric about y=50).
const HALFSPACE_TOP: [number, number] = [19, 37];
const HALFSPACE_BOTTOM: [number, number] = [63, 81];

// Zone 14: the central pocket at the top of the attacking third ("the hole").
const ZONE14: ZoneRect = {
  key: "zone14",
  group: "zone14",
  label: ZONE_GROUP_LABELS.zone14,
  x0: 67,
  y0: 37,
  x1: 82,
  y1: 63,
};

// Cutback pockets: wide areas by the attacking byline where cutbacks are pulled
// back from, one on each flank (symmetric about y=50).
const CUTBACK_TOP: ZoneRect = {
  key: "cutback_top",
  group: "cutback",
  label: ZONE_GROUP_LABELS.cutback,
  x0: 80,
  y0: 8,
  x1: 95,
  y1: 26,
};
const CUTBACK_BOTTOM: ZoneRect = {
  key: "cutback_bottom",
  group: "cutback",
  label: ZONE_GROUP_LABELS.cutback,
  x0: 80,
  y0: 74,
  x1: 95,
  y1: 92,
};

/** The full zone geometry for every group. Callers filter by what is toggled. */
export function buildZones(): ZoneGeometry {
  return {
    rects: [
      {
        key: "halfspace_top",
        group: "halfspaces",
        label: ZONE_GROUP_LABELS.halfspaces,
        x0: 0,
        y0: HALFSPACE_TOP[0],
        x1: 100,
        y1: HALFSPACE_TOP[1],
      },
      {
        key: "halfspace_bottom",
        group: "halfspaces",
        label: ZONE_GROUP_LABELS.halfspaces,
        x0: 0,
        y0: HALFSPACE_BOTTOM[0],
        x1: 100,
        y1: HALFSPACE_BOTTOM[1],
      },
      ZONE14,
      CUTBACK_TOP,
      CUTBACK_BOTTOM,
    ],
    dividers: [
      { key: "third_1", group: "thirds", x: THIRD_1 },
      { key: "third_2", group: "thirds", x: THIRD_2 },
    ],
  };
}

/** Keep only the geometry whose group is in `visible`. */
export function visibleZones(geo: ZoneGeometry, visible: Set<ZoneGroup>): ZoneGeometry {
  return {
    rects: geo.rects.filter((r) => visible.has(r.group)),
    dividers: geo.dividers.filter((d) => visible.has(d.group)),
  };
}
