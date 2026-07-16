// Imperative SVG renderer for lanes + marking rings (T-021). This is the
// component boundary the board-engine skill asks for: the Board decides WHAT to
// draw (pure lanes.ts), this decides HOW, and nothing else touches these nodes.
//
// Why imperative and not JSX: the Board's contract (T-020) is that a drag writes
// only DOM, never React state, so 23 tokens stay at 60fps. Lanes recompute on
// the SAME per-frame flush, so they must patch the DOM the same way. render()
// runs both from the drag flush (every animation frame) and from a layout effect
// (after any React commit: a confirmed toggle, a threshold change, a settled
// drag). It keeps stable nodes keyed by lane pair / token id and only writes
// changed attributes, so a frame allocates nothing once the set is stable.
//
// Colors and dashes live in Board.css classes bound to theme tokens
// (--accent, --glow, --red). This module sets geometry only, never color.

import { modelToPixel, type ModelPoint, type Orientation, type Size } from "./coords";
import type { Lane, Mark } from "./lanes";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface OverlayFrame {
  lanes: Lane[];
  marks: Mark[];
  orientation: Orientation;
  vb: Size;
  /** Base token radius in viewBox units; rings scale off it. */
  tokenRadius: number;
}

interface LaneNodes {
  line: SVGLineElement;
  dot: SVGCircleElement;
}

export class LaneOverlay {
  private readonly laneNodes = new Map<string, LaneNodes>();
  private readonly markNodes = new Map<string, SVGCircleElement>();

  constructor(
    private readonly laneLayer: SVGGElement,
    private readonly markLayer: SVGGElement
  ) {}

  render(frame: OverlayFrame): void {
    this.renderLanes(frame);
    this.renderMarks(frame);
  }

  private renderLanes({ lanes, orientation, vb }: OverlayFrame): void {
    const seen = new Set<string>();
    for (const lane of lanes) {
      seen.add(lane.key);
      let nodes = this.laneNodes.get(lane.key);
      if (!nodes) {
        const line = document.createElementNS(SVG_NS, "line");
        const dot = document.createElementNS(SVG_NS, "circle");
        dot.setAttribute("class", "lane-dot");
        this.laneLayer.appendChild(line);
        this.laneLayer.appendChild(dot);
        nodes = { line, dot };
        this.laneNodes.set(lane.key, nodes);
      }

      const from = modelToPixel(lane.from, orientation, vb);
      const to = modelToPixel(lane.to, orientation, vb);
      const status = lane.blocked ? "blocked" : lane.kind;
      nodes.line.setAttribute("class", `lane lane-${status}`);
      nodes.line.setAttribute("x1", String(from.px));
      nodes.line.setAttribute("y1", String(from.py));
      nodes.line.setAttribute("x2", String(to.px));
      nodes.line.setAttribute("y2", String(to.py));
      nodes.line.setAttribute("data-lane-key", lane.key);
      nodes.line.setAttribute("data-lane-status", status);
      nodes.line.setAttribute("data-blocked", String(lane.blocked));

      if (lane.blocked && lane.interception) {
        const dotPos = modelToPixel(lane.interception, orientation, vb);
        nodes.dot.setAttribute("cx", String(dotPos.px));
        nodes.dot.setAttribute("cy", String(dotPos.py));
        nodes.dot.setAttribute("r", String(vb.width * 0.009));
        nodes.dot.setAttribute("data-lane-dot", lane.key);
        nodes.dot.style.display = "";
      } else {
        nodes.dot.style.display = "none";
        nodes.dot.removeAttribute("data-lane-dot");
      }
    }
    this.prune(this.laneNodes, seen, (n) => {
      n.line.remove();
      n.dot.remove();
    });
  }

  private renderMarks({ marks, orientation, vb, tokenRadius }: OverlayFrame): void {
    const seen = new Set<string>();
    for (const mark of marks) {
      seen.add(mark.tokenId);
      let ring = this.markNodes.get(mark.tokenId);
      if (!ring) {
        ring = document.createElementNS(SVG_NS, "circle");
        this.markLayer.appendChild(ring);
        this.markNodes.set(mark.tokenId, ring);
      }
      const c = modelToPixel(mark.at as ModelPoint, orientation, vb);
      // Tight rings sit slightly wider so the thicker stroke clears the token.
      const r = tokenRadius * (mark.level === "tight" ? 1.55 : 1.4);
      ring.setAttribute("class", `mark-ring mark-${mark.level}`);
      ring.setAttribute("cx", String(c.px));
      ring.setAttribute("cy", String(c.py));
      ring.setAttribute("r", String(r));
      ring.setAttribute("data-mark-token", mark.tokenId);
      ring.setAttribute("data-mark-level", mark.level);
    }
    this.prune(this.markNodes, seen, (ring) => ring.remove());
  }

  private prune<T>(map: Map<string, T>, seen: Set<string>, remove: (v: T) => void): void {
    for (const [key, value] of map) {
      if (!seen.has(key)) {
        remove(value);
        map.delete(key);
      }
    }
  }

  /** Drop every node. Called if the layers are ever torn down. */
  clear(): void {
    this.prune(this.laneNodes, new Set(), (n) => {
      n.line.remove();
      n.dot.remove();
    });
    this.prune(this.markNodes, new Set(), (ring) => ring.remove());
  }
}
