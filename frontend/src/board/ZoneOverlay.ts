// Imperative SVG renderer for zone overlays (T-022, Brief step 13). Same
// component-boundary pattern as LaneOverlay: the Board decides WHICH groups are
// visible (pure zones.ts), this decides HOW to paint them, and nothing else
// touches these nodes. It patches keyed nodes so a toggle or an orientation flip
// only rewrites what changed.
//
// Paint order (T-021 handoff answer 3): the zone layer sits BEHIND everything,
// before lanes. Colours live in Board.css classes bound to theme tokens; this
// module sets geometry only. A model rectangle stays axis-aligned under the
// render mapping (a 90 degree axis swap), so each rect is drawn as a polygon of
// its four mapped corners and is correct in both orientations.

import { modelToPixel, type Orientation, type Size } from "./coords";
import type { ZoneDivider, ZoneRect } from "./zones";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface ZoneFrame {
  rects: ZoneRect[];
  dividers: ZoneDivider[];
  orientation: Orientation;
  vb: Size;
}

interface RectNodes {
  poly: SVGPolygonElement;
  label: SVGTextElement | null;
}

export class ZoneOverlay {
  private readonly rectNodes = new Map<string, RectNodes>();
  private readonly lineNodes = new Map<string, SVGLineElement>();

  constructor(private readonly layer: SVGGElement) {}

  render({ rects, dividers, orientation, vb }: ZoneFrame): void {
    this.renderRects(rects, orientation, vb);
    this.renderDividers(dividers, orientation, vb);
  }

  private renderRects(rects: ZoneRect[], orientation: Orientation, vb: Size): void {
    const seen = new Set<string>();
    for (const r of rects) {
      seen.add(r.key);
      let nodes = this.rectNodes.get(r.key);
      if (!nodes) {
        const poly = document.createElementNS(SVG_NS, "polygon");
        this.layer.appendChild(poly);
        const label = r.label ? document.createElementNS(SVG_NS, "text") : null;
        if (label) {
          label.setAttribute("class", "zone-label");
          this.layer.appendChild(label);
        }
        nodes = { poly, label };
        this.rectNodes.set(r.key, nodes);
      }
      // Four model corners -> render points -> a polygon that survives rotation.
      const corners = [
        { x: r.x0, y: r.y0 },
        { x: r.x1, y: r.y0 },
        { x: r.x1, y: r.y1 },
        { x: r.x0, y: r.y1 },
      ].map((c) => modelToPixel(c, orientation, vb));
      nodes.poly.setAttribute("class", `zone-rect zone-${r.group}`);
      nodes.poly.setAttribute("points", corners.map((c) => `${c.px},${c.py}`).join(" "));
      nodes.poly.setAttribute("data-zone-key", r.key);
      nodes.poly.setAttribute("data-zone-group", r.group);
      if (nodes.label && r.label) {
        // Anchor the label near the corner that is visually top-left on screen.
        const xs = corners.map((c) => c.px);
        const ys = corners.map((c) => c.py);
        nodes.label.setAttribute("x", String(Math.min(...xs) + vb.width * 0.008));
        nodes.label.setAttribute("y", String(Math.min(...ys) + vb.height * 0.03));
        nodes.label.setAttribute("data-zone-label", r.key);
        nodes.label.textContent = r.label;
      }
    }
    this.prune(this.rectNodes, seen, (n) => {
      n.poly.remove();
      n.label?.remove();
    });
  }

  private renderDividers(
    dividers: ZoneDivider[],
    orientation: Orientation,
    vb: Size
  ): void {
    const seen = new Set<string>();
    for (const d of dividers) {
      seen.add(d.key);
      let line = this.lineNodes.get(d.key);
      if (!line) {
        line = document.createElementNS(SVG_NS, "line");
        this.layer.appendChild(line);
        this.lineNodes.set(d.key, line);
      }
      const a = modelToPixel({ x: d.x, y: 0 }, orientation, vb);
      const b = modelToPixel({ x: d.x, y: 100 }, orientation, vb);
      line.setAttribute("class", `zone-divider zone-${d.group}`);
      line.setAttribute("x1", String(a.px));
      line.setAttribute("y1", String(a.py));
      line.setAttribute("x2", String(b.px));
      line.setAttribute("y2", String(b.py));
      line.setAttribute("data-zone-key", d.key);
      line.setAttribute("data-zone-group", d.group);
    }
    this.prune(this.lineNodes, seen, (l) => l.remove());
  }

  private prune<T>(map: Map<string, T>, seen: Set<string>, remove: (v: T) => void): void {
    for (const [key, value] of map) {
      if (!seen.has(key)) {
        remove(value);
        map.delete(key);
      }
    }
  }
}
