// Pitch canvas + token rendering + drag pipeline (T-020).
//
// Rendering choice: SVG behind a component boundary. The pitch is a static
// backdrop; each token is a <g> transformed in viewBox user units. Orientation
// is a pure render concern: the same stored landscape model coordinates map
// through coords.ts to landscape or portrait, so a board "recorded" in one
// orientation replays correctly in both (Brief DoD line 2).
//
// Drag pipeline (Brief DoD line 1, 60fps @ 23 tokens): pointer input is
// coalesced to one update per animation frame (time.ts FrameScheduler) and the
// dragged token's transform is written straight to the DOM. React state is
// touched once, on pointer up, so a drag never re-renders all 23 tokens.

import { useCallback, useMemo, useRef, useState } from "react";
import {
  clampModel,
  modelToPixel,
  pixelToModel,
  type ModelPoint,
  type Orientation,
  type Size,
} from "./coords";
import { PitchMarkings } from "./PitchMarkings";
import { FrameScheduler } from "./time";
import { defaultBoardTokens, TOKEN_FILL, type Token } from "./tokens";
import "./Board.css";

// Fixed viewBox per orientation. Aspect matches PITCH_ASPECT so the SVG scales
// uniformly (circles stay circular) while the wrapper sets the on-screen box.
const VIEWBOX: Record<Orientation, Size> = {
  landscape: { width: 1050, height: 680 },
  portrait: { width: 700, height: 1000 },
};

function tokenRadius(side: Token["side"], vb: Size): number {
  const base = vb.width * 0.021;
  return side === "ball" ? base * 0.7 : base;
}

interface BoardProps {
  orientation: Orientation;
  initialTokens?: Token[];
}

export default function Board({ orientation, initialTokens }: BoardProps) {
  const [tokens, setTokens] = useState<Token[]>(() => initialTokens ?? defaultBoardTokens());
  const [activeId, setActiveId] = useState<string | null>(null);

  const vb = VIEWBOX[orientation];
  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupRefs = useRef<Map<string, SVGGElement>>(new Map());

  // Live model positions, mutated during a drag without re-rendering. Kept in a
  // ref so the frame flush is allocation- and React-free.
  const posRef = useRef<Map<string, ModelPoint>>(new Map());
  useMemo(() => {
    posRef.current = new Map(tokens.map((t) => [t.id, t.pos]));
  }, [tokens]);

  const dragRef = useRef<{ id: string; pointerId: number } | null>(null);
  const pointerClient = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Convert a client (screen) point into viewBox user units, accounting for the
  // uniform letterboxing the SVG applies. Falls back to a rect-based scale when
  // getScreenCTM is unavailable (jsdom); the real drag path runs in a browser.
  const clientToViewBox = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { px: 0, py: 0 };
    const ctm = svg.getScreenCTM?.();
    if (ctm) {
      const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
      return { px: pt.x, py: pt.y };
    }
    const rect = svg.getBoundingClientRect();
    return {
      px: ((clientX - rect.left) / rect.width) * vb.width,
      py: ((clientY - rect.top) / rect.height) * vb.height,
    };
  }, [vb.width, vb.height]);

  const flush = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    const { px, py } = clientToViewBox(pointerClient.current.x, pointerClient.current.y);
    const model = clampModel(pixelToModel({ px, py }, orientation, vb));
    posRef.current.set(drag.id, model);

    const g = groupRefs.current.get(drag.id);
    if (g) {
      const p = modelToPixel(model, orientation, vb);
      // Write the transform straight to the DOM. No React render this frame.
      g.setAttribute("transform", `translate(${p.px} ${p.py})`);
      g.setAttribute("data-model-x", String(model.x));
      g.setAttribute("data-model-y", String(model.y));
    }
  }, [clientToViewBox, orientation, vb]);

  const scheduler = useRef<FrameScheduler | null>(null);
  if (!scheduler.current) scheduler.current = new FrameScheduler(flush);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGGElement>, token: Token) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { id: token.id, pointerId: e.pointerId };
      pointerClient.current = { x: e.clientX, y: e.clientY };
      setActiveId(token.id);
    },
    []
  );

  const onPointerMove = useCallback((e: React.PointerEvent<SVGGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    pointerClient.current = { x: e.clientX, y: e.clientY };
    scheduler.current?.schedule();
  }, []);

  const endDrag = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      scheduler.current?.cancel();
      flush(); // settle on the final pointer sample
      const committed = posRef.current.get(drag.id);
      dragRef.current = null;
      setActiveId(null);
      if (committed) {
        // Single state commit: React's model now matches the DOM.
        setTokens((prev) =>
          prev.map((t) => (t.id === drag.id ? { ...t, pos: committed } : t))
        );
      }
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // capture may already be gone; ignore
      }
    },
    [flush]
  );

  return (
    <div className="board-wrap" data-orientation={orientation}>
      <svg
        ref={svgRef}
        className="board-svg"
        data-testid="board"
        viewBox={`0 0 ${vb.width} ${vb.height}`}
        style={{ aspectRatio: `${vb.width} / ${vb.height}` }}
        role="img"
        aria-label="Tactics board"
      >
        <PitchMarkings orientation={orientation} vb={vb} />
        {tokens.map((token) => {
          const p = modelToPixel(token.pos, orientation, vb);
          const r = tokenRadius(token.side, vb);
          const isActive = activeId === token.id;
          return (
            <g
              key={token.id}
              ref={(el) => {
                if (el) groupRefs.current.set(token.id, el);
                else groupRefs.current.delete(token.id);
              }}
              className={`token token-${token.side}${isActive ? " token-active" : ""}`}
              data-token-id={token.id}
              data-token-side={token.side}
              data-model-x={token.pos.x}
              data-model-y={token.pos.y}
              transform={`translate(${p.px} ${p.py})`}
              onPointerDown={(e) => onPointerDown(e, token)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <circle
                className="token-face"
                r={r}
                style={{ stroke: TOKEN_FILL[token.side], fill: token.side === "ball" ? TOKEN_FILL.ball : "var(--surface, #1B4B39)" }}
              />
              {token.label && (
                <text
                  className="token-label"
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ fill: TOKEN_FILL[token.side], fontSize: r }}
                >
                  {token.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
