// Imperative SVG renderer for the animation trace (T-022, Brief step 14): the
// glowing gold ball's TRAIL and the numbered gold route badges. Same
// component-boundary and keyed-diff pattern as LaneOverlay / ZoneOverlay; the
// player calls render() every frame from its FrameLoop, so this only sets
// geometry and never allocates once the badge set is stable.
//
// The ball TOKEN itself is the board's existing ball <g> (moved per frame by the
// Board); this layer draws only the trace behind it. The trajectory drives the
// trail's visual style (design README: "glow trail"; trajectory ground flat vs
// floated arced), applied as a CSS class bound to theme tokens. Colours are gold
// only (interactive): trail, badges, and badge numbers.

import { modelToPixel, type ModelPoint, type Orientation, type Size } from "./coords";
import type { RouteBadge } from "./playback";
import type { Trajectory } from "./animationTypes";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface AnimationFrame {
  /** Ball path so far, in landscape model coordinates. */
  trail: ModelPoint[];
  /** Route badges to show this instant (already filtered to revealed ones). */
  badges: RouteBadge[];
  /** Trail style; null renders the default recorded trace. */
  trajectory: Trajectory | null;
  orientation: Orientation;
  vb: Size;
  /** Base token radius in viewBox units; badges scale off it. */
  tokenRadius: number;
}

interface BadgeNodes {
  circle: SVGCircleElement;
  text: SVGTextElement;
}

export class AnimationOverlay {
  private readonly trail: SVGPolylineElement;
  private readonly badgeNodes = new Map<number, BadgeNodes>();

  constructor(private readonly layer: SVGGElement) {
    this.trail = document.createElementNS(SVG_NS, "polyline");
    this.trail.setAttribute("class", "ball-trail");
    this.trail.setAttribute("data-testid", "ball-trail");
    this.layer.appendChild(this.trail);
  }

  render(frame: AnimationFrame): void {
    this.renderTrail(frame);
    this.renderBadges(frame);
  }

  private renderTrail({ trail, trajectory, orientation, vb }: AnimationFrame): void {
    const style = trajectory ?? "recorded";
    this.trail.setAttribute("class", `ball-trail trail-${style}`);
    if (trail.length < 2) {
      this.trail.setAttribute("points", "");
      return;
    }
    const points = trail
      .map((p) => modelToPixel(p, orientation, vb))
      .map((p) => `${p.px},${p.py}`)
      .join(" ");
    this.trail.setAttribute("points", points);
  }

  private renderBadges({ badges, orientation, vb, tokenRadius }: AnimationFrame): void {
    const seen = new Set<number>();
    const r = tokenRadius * 0.72;
    for (const badge of badges) {
      seen.add(badge.n);
      let nodes = this.badgeNodes.get(badge.n);
      if (!nodes) {
        const circle = document.createElementNS(SVG_NS, "circle");
        circle.setAttribute("class", "route-badge");
        const text = document.createElementNS(SVG_NS, "text");
        text.setAttribute("class", "route-badge-num");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "central");
        this.layer.appendChild(circle);
        this.layer.appendChild(text);
        nodes = { circle, text };
        this.badgeNodes.set(badge.n, nodes);
      }
      const c = modelToPixel(badge.at, orientation, vb);
      nodes.circle.setAttribute("cx", String(c.px));
      nodes.circle.setAttribute("cy", String(c.py));
      nodes.circle.setAttribute("r", String(r));
      nodes.circle.setAttribute("data-badge-n", String(badge.n));
      nodes.text.setAttribute("x", String(c.px));
      nodes.text.setAttribute("y", String(c.py));
      nodes.text.setAttribute("font-size", String(r * 1.1));
      nodes.text.textContent = String(badge.n);
    }
    for (const [n, nodes] of this.badgeNodes) {
      if (!seen.has(n)) {
        nodes.circle.remove();
        nodes.text.remove();
        this.badgeNodes.delete(n);
      }
    }
  }

  /** Wipe the trace between runs so a new playback starts clean. */
  clear(): void {
    this.trail.setAttribute("points", "");
    for (const [, nodes] of this.badgeNodes) {
      nodes.circle.remove();
      nodes.text.remove();
    }
    this.badgeNodes.clear();
  }
}
