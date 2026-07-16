// Pitch canvas + token rendering + drag pipeline (T-020) + lane graph and
// marking rings (T-021).
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
//
// Lanes + rings (T-021) hook that SAME flush: each frame, after the dragged
// token moves, we recompute the lane graph and marking rings from the live model
// positions in posRef and patch the overlay DOM directly (LaneOverlay). No timer,
// no extra React render per frame. The pure math is in lanes.ts / geometry.ts.

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import {
  computeLanes,
  computeMarks,
  defaultLaneState,
  pairKey,
  type TokenMeta,
  type WhiteboardLaneState,
} from "./lanes";
import { LaneOverlay } from "./LaneOverlay";
import "./Board.css";

// Fixed viewBox per orientation. Aspect matches PITCH_ASPECT so the SVG scales
// uniformly (circles stay circular) while the wrapper sets the on-screen box.
const VIEWBOX: Record<Orientation, Size> = {
  landscape: { width: 1050, height: 680 },
  portrait: { width: 700, height: 1000 },
};

// A pointer that moves less than this (client px) between down and up is a tap,
// not a drag: taps toggle confirmed lanes, drags move tokens.
const TAP_PX = 4;

const THRESHOLD_MAX = 40;

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

  // Whiteboard lane state, shaped to doc 03 4.3 (boards row). No backend yet
  // (T-004 / T-030) and no localStorage (Brief section 7): it lives here until
  // persistence lands, then maps straight onto the row.
  const [laneState, setLaneState] = useState<WhiteboardLaneState>(defaultLaneState);
  // First token of an in-progress "click two players" confirm gesture.
  const [pairingId, setPairingId] = useState<string | null>(null);

  const vb = VIEWBOX[orientation];
  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupRefs = useRef<Map<string, SVGGElement>>(new Map());
  const laneLayerRef = useRef<SVGGElement | null>(null);
  const markLayerRef = useRef<SVGGElement | null>(null);
  const overlayRef = useRef<LaneOverlay | null>(null);

  // Live model positions, mutated during a drag without re-rendering. Kept in a
  // ref so the frame flush is allocation- and React-free.
  const posRef = useRef<Map<string, ModelPoint>>(new Map());
  useMemo(() => {
    posRef.current = new Map(tokens.map((t) => [t.id, t.pos]));
  }, [tokens]);

  // Everything the overlay needs beyond live positions, refreshed every render
  // so the stable per-frame flush reads current thresholds/config without a
  // stale closure.
  const overlayConfigRef = useRef({
    tokenMeta: [] as TokenMeta[],
    confirmed: new Set<string>(),
    blockingThreshold: laneState.blockingThreshold,
    markingThreshold: laneState.markingThreshold,
    orientation,
    vb,
  });
  overlayConfigRef.current = {
    tokenMeta: tokens.map((t) => ({ id: t.id, side: t.side })),
    confirmed: new Set(laneState.confirmedLanes),
    blockingThreshold: laneState.blockingThreshold,
    markingThreshold: laneState.markingThreshold,
    orientation,
    vb,
  };

  // Recompute the lane graph + rings from the live positions and patch the
  // overlay DOM. Stable identity (reads refs only) so the frame scheduler and
  // the layout effect share one code path.
  const renderOverlay = useCallback(() => {
    if (!overlayRef.current) {
      if (!laneLayerRef.current || !markLayerRef.current) return;
      overlayRef.current = new LaneOverlay(laneLayerRef.current, markLayerRef.current);
    }
    const cfg = overlayConfigRef.current;
    const positions = posRef.current;
    const lanes = computeLanes(positions, cfg.tokenMeta, cfg.confirmed, cfg.blockingThreshold);
    const marks = computeMarks(positions, cfg.tokenMeta, cfg.markingThreshold);
    overlayRef.current.render({
      lanes,
      marks,
      orientation: cfg.orientation,
      vb: cfg.vb,
      tokenRadius: cfg.vb.width * 0.021,
    });
  }, []);

  // Redraw lanes/rings after any React commit that changes them: a settled drag,
  // a confirmed-lane toggle, a threshold change, an orientation flip.
  useLayoutEffect(() => {
    renderOverlay();
  }, [renderOverlay, tokens, laneState, orientation, vb.width, vb.height]);

  const dragRef = useRef<
    { id: string; side: Token["side"]; pointerId: number; downX: number; downY: number; moved: boolean } | null
  >(null);
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
    // Lanes + rings recompute on the same frame, from all 23 live positions.
    renderOverlay();
  }, [clientToViewBox, orientation, vb, renderOverlay]);

  // Keep the scheduler pointed at the latest flush so an orientation flip or a
  // threshold change between drags never runs a stale closure.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  const scheduler = useRef<FrameScheduler | null>(null);
  if (!scheduler.current) scheduler.current = new FrameScheduler(() => flushRef.current());

  const toggleConfirmed = useCallback((a: string, b: string) => {
    const key = pairKey(a, b);
    setLaneState((prev) => {
      const has = prev.confirmedLanes.includes(key);
      return {
        ...prev,
        confirmedLanes: has
          ? prev.confirmedLanes.filter((k) => k !== key)
          : [...prev.confirmedLanes, key],
      };
    });
  }, []);

  // "Click two players to toggle" a confirmed lane. Ball has no lanes; pairing is
  // between teammates (same side), so the second tap on a same-side token toggles
  // the pair and a tap on the other side just restarts the selection.
  //
  // Side effects stay OUT of the setPairingId updater: StrictMode double-invokes
  // updaters to surface impurity, which would toggle a confirmed lane twice (net
  // zero). We read the current selection from the closure and call the setters
  // directly instead.
  const handleTap = useCallback(
    (token: Token) => {
      if (token.side === "ball") return;
      if (pairingId === null) {
        setPairingId(token.id);
        return;
      }
      if (pairingId === token.id) {
        setPairingId(null); // tapping the same token cancels
        return;
      }
      const firstSide = tokens.find((t) => t.id === pairingId)?.side;
      if (firstSide !== token.side) {
        setPairingId(token.id); // different side: restart the selection
        return;
      }
      toggleConfirmed(pairingId, token.id);
      setPairingId(null);
    },
    [pairingId, tokens, toggleConfirmed]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGGElement>, token: Token) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        id: token.id,
        side: token.side,
        pointerId: e.pointerId,
        downX: e.clientX,
        downY: e.clientY,
        moved: false,
      };
      pointerClient.current = { x: e.clientX, y: e.clientY };
      setActiveId(token.id);
    },
    []
  );

  const onPointerMove = useCallback((e: React.PointerEvent<SVGGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    pointerClient.current = { x: e.clientX, y: e.clientY };
    if (!drag.moved && Math.hypot(e.clientX - drag.downX, e.clientY - drag.downY) > TAP_PX) {
      drag.moved = true;
    }
    if (drag.moved) scheduler.current?.schedule();
  }, []);

  const endDrag = useCallback(
    (e: React.PointerEvent<SVGGElement>, token: Token) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      scheduler.current?.cancel();
      const wasDrag = drag.moved;
      if (wasDrag) flush(); // settle on the final pointer sample
      const committed = posRef.current.get(drag.id);
      dragRef.current = null;
      setActiveId(null);
      if (wasDrag && committed) {
        // Single state commit: React's model now matches the DOM.
        setTokens((prev) =>
          prev.map((t) => (t.id === drag.id ? { ...t, pos: committed } : t))
        );
      } else if (!wasDrag) {
        handleTap(token); // a tap: toggle the confirmed-lane selection
      }
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // capture may already be gone; ignore
      }
    },
    [flush, handleTap]
  );

  const setBlocking = (v: number) =>
    setLaneState((prev) => ({ ...prev, blockingThreshold: v }));
  const setMarking = (v: number) =>
    setLaneState((prev) => ({ ...prev, markingThreshold: v }));

  return (
    <div className="board-root">
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
          {/* Lanes sit under the tokens; rings sit just under them too so the
              token face always paints on top. Both are patched imperatively. */}
          <g className="lane-layer" ref={laneLayerRef} aria-hidden="true" />
          <g className="mark-layer" ref={markLayerRef} aria-hidden="true" />
          {tokens.map((token) => {
            const p = modelToPixel(token.pos, orientation, vb);
            const r = tokenRadius(token.side, vb);
            const isActive = activeId === token.id;
            const isPairing = pairingId === token.id;
            return (
              <g
                key={token.id}
                ref={(el) => {
                  if (el) groupRefs.current.set(token.id, el);
                  else groupRefs.current.delete(token.id);
                }}
                className={`token token-${token.side}${isActive ? " token-active" : ""}${
                  isPairing ? " token-pairing" : ""
                }`}
                data-token-id={token.id}
                data-token-side={token.side}
                data-model-x={token.pos.x}
                data-model-y={token.pos.y}
                transform={`translate(${p.px} ${p.py})`}
                onPointerDown={(e) => onPointerDown(e, token)}
                onPointerMove={onPointerMove}
                onPointerUp={(e) => endDrag(e, token)}
                onPointerCancel={(e) => endDrag(e, token)}
              >
                <circle
                  className="token-face"
                  r={r}
                  style={{ stroke: TOKEN_FILL[token.side], fill: token.side === "ball" ? TOKEN_FILL.ball : "var(--surface)" }}
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

      <div className="lane-controls" role="group" aria-label="Lane thresholds">
        <label className="lane-control">
          <span>Blocking distance</span>
          <input
            type="range"
            min={0}
            max={THRESHOLD_MAX}
            step={1}
            value={laneState.blockingThreshold}
            data-testid="blocking-threshold"
            onChange={(e) => setBlocking(Number(e.target.value))}
          />
          <output data-testid="blocking-threshold-value">{laneState.blockingThreshold}</output>
        </label>
        <label className="lane-control">
          <span>Marking distance</span>
          <input
            type="range"
            min={0}
            max={THRESHOLD_MAX}
            step={1}
            value={laneState.markingThreshold}
            data-testid="marking-threshold"
            onChange={(e) => setMarking(Number(e.target.value))}
          />
          <output data-testid="marking-threshold-value">{laneState.markingThreshold}</output>
        </label>
        <p className="lane-hint">Click two teammates to confirm a passing lane.</p>
      </div>
    </div>
  );
}
