// Pitch canvas + token rendering + drag pipeline (T-020) + lane graph and
// marking rings (T-021) + zone overlays, animation player, and recorder (T-022).
//
// Rendering choice: SVG behind a component boundary. The pitch is a static
// backdrop; each token is a <g> transformed in viewBox user units. Orientation
// is a pure render concern: the same stored landscape model coordinates map
// through coords.ts to landscape or portrait, so a board recorded in one
// orientation replays correctly in both (Brief DoD line 2).
//
// Drag pipeline (Brief DoD line 1, 60fps @ 23 tokens): pointer input is coalesced
// to one update per animation frame (time.ts FrameScheduler) and the dragged
// token's transform is written straight to the DOM. React state is touched once,
// on pointer up, so a drag never re-renders all 23 tokens.
//
// T-022 layers hang off that same machinery:
//   - Zones render as their own <g> BEHIND everything (paint order: zones, lanes,
//     rings, trace, tokens), through the coords mapping like all geometry.
//   - The animation player (player.ts) drives positions by writing into posRef
//     and calling the SAME overlay render path per frame through its own
//     FrameLoop, so lanes and rings stay live during playback (T-021 handoff 1).
//     It abstracts over declarative specs AND raw recordings via one Playback.
//   - The recorder (recorder.ts) captures every drag on every token as
//     timestamped model-space keyframes; saved recordings live in state (no
//     backend, no localStorage) shaped as doc 03 4.2 and replay through the
//     player immediately.

import { useCallback, useLayoutEffect, useMemo, useRef, useState, useEffect } from "react";
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
import { ZoneOverlay } from "./ZoneOverlay";
import { AnimationOverlay } from "./AnimationOverlay";
import { buildZones, visibleZones, ZONE_GROUPS, ZONE_GROUP_LABELS, type ZoneGroup } from "./zones";
import { PlayerController } from "./player";
import { Recorder } from "./recorder";
import { buildDeclarativePlayback, buildKeyframePlayback, type Playback } from "./playback";
import { DEMO_BINDING, DEMO_SPEC } from "./demoSpec";
import type { BoardSnapshot, Keyframe, RecordedPattern } from "./animationTypes";
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

// Zone geometry is static (pure model coordinates); compute it once.
const ZONES = buildZones();

// Cap the trail length so a looping rotation cannot grow it without bound.
const MAX_TRAIL = 600;

function tokenRadius(side: Token["side"], vb: Size): number {
  const base = vb.width * 0.021;
  return side === "ball" ? base * 0.7 : base;
}

function snapshotToTokens(snap: BoardSnapshot): Token[] {
  return snap.tokens.map((t) => ({
    id: t.id,
    side: t.side,
    label: t.label,
    pos: { x: t.x, y: t.y },
  }));
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

  // Zone visibility (doc 03 4.3 zones_visible_json). Independent of lanes.
  const [zonesVisible, setZonesVisible] = useState<Set<ZoneGroup>>(() => new Set());
  const [viewMenuOpen, setViewMenuOpen] = useState(false);

  // Player + recorder UI state. None of these mutate per frame (that would
  // re-render all 23 tokens and clobber the imperative per-frame DOM writes);
  // per-frame work is imperative (posRef, DOM, overlays).
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [pendingKeyframes, setPendingKeyframes] = useState<Keyframe[] | null>(null);
  const [recordName, setRecordName] = useState("");
  const [savedPatterns, setSavedPatterns] = useState<RecordedPattern[]>([]);
  // Bumped to (re)start a playback after tokens have committed to their start.
  const [playToken, setPlayToken] = useState(0);

  const vb = VIEWBOX[orientation];
  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupRefs = useRef<Map<string, SVGGElement>>(new Map());
  const laneLayerRef = useRef<SVGGElement | null>(null);
  const markLayerRef = useRef<SVGGElement | null>(null);
  const zoneLayerRef = useRef<SVGGElement | null>(null);
  const animLayerRef = useRef<SVGGElement | null>(null);
  const captionRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<LaneOverlay | null>(null);
  const zoneOverlayRef = useRef<ZoneOverlay | null>(null);
  const animOverlayRef = useRef<AnimationOverlay | null>(null);

  // Live model positions, mutated during a drag or playback without a re-render.
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

  // Player + recorder singletons, and the per-run playback refs.
  const playerRef = useRef<PlayerController | null>(null);
  if (!playerRef.current) playerRef.current = new PlayerController();
  const recorderRef = useRef<Recorder | null>(null);
  if (!recorderRef.current) recorderRef.current = new Recorder();
  const pbRef = useRef<Playback | null>(null);
  const playBaseRef = useRef<Token[] | null>(null);
  const trailRef = useRef<ModelPoint[]>([]);
  const lastCaptionRef = useRef<string | null>(null);
  const recordSnapshotRef = useRef<BoardSnapshot | null>(null);

  // Move one token's DOM straight to a model position. Shared by the drag flush
  // and the animation player so both move tokens the exact same way.
  const moveTokenDom = useCallback((id: string, model: ModelPoint) => {
    const g = groupRefs.current.get(id);
    if (!g) return;
    const { orientation: o, vb: box } = overlayConfigRef.current;
    const p = modelToPixel(model, o, box);
    g.setAttribute("transform", `translate(${p.px} ${p.py})`);
    g.setAttribute("data-model-x", String(model.x));
    g.setAttribute("data-model-y", String(model.y));
  }, []);

  // Recompute the lane graph + rings from the live positions and patch the
  // overlay DOM. Stable identity (reads refs only) so the frame scheduler, the
  // player, and the layout effect share one code path.
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

  // Redraw lanes/rings after any React commit that changes them.
  useLayoutEffect(() => {
    renderOverlay();
  }, [renderOverlay, tokens, laneState, orientation, vb.width, vb.height]);

  // Zone overlay: draw the toggled groups, behind everything, through the same
  // mapping so a toggle or orientation flip repaints correctly.
  useLayoutEffect(() => {
    if (!zoneLayerRef.current) return;
    if (!zoneOverlayRef.current) zoneOverlayRef.current = new ZoneOverlay(zoneLayerRef.current);
    const geo = visibleZones(ZONES, zonesVisible);
    zoneOverlayRef.current.render({ ...geo, orientation, vb });
  }, [zonesVisible, orientation, vb.width, vb.height, vb]);

  // Initialize the animation trace overlay once its layer exists.
  useLayoutEffect(() => {
    if (animLayerRef.current && !animOverlayRef.current) {
      animOverlayRef.current = new AnimationOverlay(animLayerRef.current);
    }
  }, []);

  // ---- Animation player wiring ----------------------------------------------

  // Called every frame by the player with a sampled frame in model coords. Reads
  // refs only so it never goes stale across orientation flips between runs.
  const onFrame = useCallback(
    (frame: import("./playback").PlaybackFrame, tMs: number) => {
      const { orientation: o, vb: box } = overlayConfigRef.current;
      const ballId = pbRef.current?.ballTokenId ?? null;
      frame.actors.forEach((pos, id) => {
        posRef.current.set(id, pos);
        moveTokenDom(id, pos);
      });
      if (ballId && frame.ball) {
        posRef.current.set(ballId, frame.ball);
        moveTokenDom(ballId, frame.ball);
        const trail = trailRef.current;
        trail.push(frame.ball);
        if (trail.length > MAX_TRAIL) trail.splice(0, trail.length - MAX_TRAIL);
      }
      animOverlayRef.current?.render({
        trail: trailRef.current,
        badges: frame.badges.filter((b) => b.revealMs <= tMs),
        trajectory: frame.ballTrajectory,
        orientation: o,
        vb: box,
        tokenRadius: box.width * 0.021,
      });
      if (captionRef.current && frame.caption !== lastCaptionRef.current) {
        lastCaptionRef.current = frame.caption;
        captionRef.current.textContent = frame.caption ?? "";
      }
      // Lanes and rings recompute from the live playback positions (handoff 1).
      renderOverlay();
    },
    [moveTokenDom, renderOverlay]
  );

  const onEnd = useCallback(() => {
    setPlaying(false);
    lastCaptionRef.current = null;
    if (captionRef.current) captionRef.current.textContent = "";
    // Sync React's model to the final DOM positions the loop wrote.
    setTokens((prev) =>
      prev.map((t) => {
        const p = posRef.current.get(t.id);
        return p ? { ...t, pos: p } : t;
      })
    );
  }, []);

  // Seek the board to a playback's t=0 so the opening frame is a clean React
  // commit rather than a first-frame teleport.
  const beginPlayback = useCallback((pb: Playback, base: Token[]) => {
    const f0 = pb.sample(0);
    const start = base.map((t) => {
      if (f0.actors.has(t.id)) return { ...t, pos: f0.actors.get(t.id)! };
      if (pb.ballTokenId === t.id && f0.ball) return { ...t, pos: f0.ball };
      return t;
    });
    pbRef.current = pb;
    playBaseRef.current = base;
    trailRef.current = [];
    animOverlayRef.current?.clear();
    setTokens(start);
    setPlaying(true);
    setPlayToken((n) => n + 1);
  }, []);

  // Start (or restart) the loop after the start positions have committed, so
  // posRef already holds them when the first frame runs.
  useEffect(() => {
    if (!playing || !pbRef.current || !playerRef.current) return;
    const player = playerRef.current;
    player.play(pbRef.current, onFrame, onEnd);
    return () => player.stop();
    // playToken is the sole trigger (bumped on begin/restart); onFrame and onEnd
    // are stable useCallbacks and pbRef is a ref, so none belong in the deps.
  }, [playToken, onFrame, onEnd]);

  const playDemoSpec = useCallback(() => {
    if (playing || recording) return;
    beginPlayback(buildDeclarativePlayback(DEMO_SPEC, DEMO_BINDING), tokens);
  }, [beginPlayback, playing, recording, tokens]);

  const restart = useCallback(() => {
    if (pbRef.current && playBaseRef.current) beginPlayback(pbRef.current, playBaseRef.current);
  }, [beginPlayback]);

  const replaySaved = useCallback(
    (pattern: RecordedPattern) => {
      if (playing || recording) return;
      const pb = buildKeyframePlayback(pattern.keyframes, pattern.board_snapshot);
      beginPlayback(pb, snapshotToTokens(pattern.board_snapshot));
    },
    [beginPlayback, playing, recording]
  );

  // ---- Recorder wiring ------------------------------------------------------

  const buildSnapshot = useCallback(
    (): BoardSnapshot => ({
      tokens: tokens.map((t) => ({
        id: t.id,
        side: t.side,
        label: t.label,
        x: t.pos.x,
        y: t.pos.y,
      })),
      confirmed_lanes: laneState.confirmedLanes,
      blocking_threshold: laneState.blockingThreshold,
      marking_threshold: laneState.markingThreshold,
      zones_visible: [...zonesVisible],
    }),
    [tokens, laneState, zonesVisible]
  );

  const startRecording = useCallback(() => {
    if (playing) return;
    recordSnapshotRef.current = buildSnapshot();
    recorderRef.current!.start();
    setPendingKeyframes(null);
    setRecording(true);
  }, [buildSnapshot, playing]);

  const stopRecording = useCallback(() => {
    const kf = recorderRef.current!.stop();
    setRecording(false);
    setPendingKeyframes(kf);
    setRecordName("");
  }, []);

  const savePattern = useCallback(() => {
    if (!pendingKeyframes || !recordSnapshotRef.current) return;
    const pattern: RecordedPattern = {
      name: recordName.trim() || "Recorded pattern",
      author_role: "coach",
      board_snapshot: recordSnapshotRef.current,
      keyframes: pendingKeyframes,
    };
    setSavedPatterns((prev) => [...prev, pattern]);
    setPendingKeyframes(null);
    setRecordName("");
  }, [pendingKeyframes, recordName]);

  const discardRecording = useCallback(() => {
    setPendingKeyframes(null);
    setRecordName("");
  }, []);

  // ---- Drag pipeline (T-020) ------------------------------------------------

  const dragRef = useRef<
    { id: string; side: Token["side"]; pointerId: number; downX: number; downY: number; moved: boolean } | null
  >(null);
  const pointerClient = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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
    moveTokenDom(drag.id, model);
    // Capture every dragged token while recording (teammates, opponents, ball).
    recorderRef.current!.capture(drag.id, model);
    // Lanes + rings recompute on the same frame, from all 23 live positions.
    renderOverlay();
  }, [clientToViewBox, orientation, vb, renderOverlay, moveTokenDom]);

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

  const handleTap = useCallback(
    (token: Token) => {
      if (token.side === "ball") return;
      if (pairingId === null) {
        setPairingId(token.id);
        return;
      }
      if (pairingId === token.id) {
        setPairingId(null);
        return;
      }
      const firstSide = tokens.find((t) => t.id === pairingId)?.side;
      if (firstSide !== token.side) {
        setPairingId(token.id);
        return;
      }
      toggleConfirmed(pairingId, token.id);
      setPairingId(null);
    },
    [pairingId, tokens, toggleConfirmed]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGGElement>, token: Token) => {
      if (playing) return; // tokens are player-driven during playback
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
      // Anchor the recording at the token's current spot so replay starts clean.
      recorderRef.current!.capture(token.id, posRef.current.get(token.id) ?? token.pos);
      setActiveId(token.id);
    },
    [playing]
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
      if (wasDrag) flush();
      const committed = posRef.current.get(drag.id);
      if (wasDrag && committed) recorderRef.current!.capture(drag.id, committed);
      dragRef.current = null;
      setActiveId(null);
      if (wasDrag && committed) {
        setTokens((prev) =>
          prev.map((t) => (t.id === drag.id ? { ...t, pos: committed } : t))
        );
      } else if (!wasDrag) {
        handleTap(token);
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

  const toggleZone = (g: ZoneGroup) =>
    setZonesVisible((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  return (
    <div className="board-root" data-playing={playing} data-recording={recording}>
      <div className="board-view" role="group" aria-label="Board controls">
        {/* View menu: zone overlays (Brief step 13). The full toolbar is T-030. */}
        <div className="view-menu">
          <button
            type="button"
            data-testid="view-menu"
            aria-expanded={viewMenuOpen}
            onClick={() => setViewMenuOpen((o) => !o)}
          >
            View
          </button>
          {viewMenuOpen && (
            <div className="view-menu-panel" role="menu" aria-label="Zone overlays">
              {ZONE_GROUPS.map((g) => (
                <label key={g} className="view-menu-item">
                  <input
                    type="checkbox"
                    data-testid={`zone-toggle-${g}`}
                    checked={zonesVisible.has(g)}
                    onChange={() => toggleZone(g)}
                  />
                  <span>{ZONE_GROUP_LABELS[g]}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Player controls (Brief step 14). */}
        <button
          type="button"
          data-testid="play-demo"
          className="ctl-play"
          onClick={playDemoSpec}
          disabled={playing || recording}
        >
          Play build out
        </button>
        <button
          type="button"
          data-testid="restart"
          className="ctl-play"
          onClick={restart}
          disabled={playing || recording || !pbRef.current}
        >
          Restart
        </button>

        {/* Recorder controls (Brief step 15). Record state is red status. */}
        {!recording ? (
          <button
            type="button"
            data-testid="record"
            className="ctl-record"
            onClick={startRecording}
            disabled={playing}
          >
            Record
          </button>
        ) : (
          <button
            type="button"
            data-testid="stop-record"
            className="ctl-record ctl-record-active"
            onClick={stopRecording}
          >
            Stop
          </button>
        )}
      </div>

      {pendingKeyframes && (
        <div className="save-bar" data-testid="save-bar">
          <label className="save-name">
            <span>Name this pattern</span>
            <input
              type="text"
              data-testid="record-name"
              value={recordName}
              placeholder="Build out right"
              onChange={(e) => setRecordName(e.target.value)}
            />
          </label>
          <button type="button" data-testid="save-pattern" onClick={savePattern}>
            Save to my patterns
          </button>
          <button type="button" className="ctl-ghost" onClick={discardRecording}>
            Discard
          </button>
        </div>
      )}

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
          {/* Paint order (T-021 handoff 3): zones behind everything, then lanes,
              then rings, then the animation trace, then tokens on top. */}
          <g className="zone-layer" ref={zoneLayerRef} aria-hidden="true" />
          <g className="lane-layer" ref={laneLayerRef} aria-hidden="true" />
          <g className="mark-layer" ref={markLayerRef} aria-hidden="true" />
          <g className="anim-layer" ref={animLayerRef} aria-hidden="true" />
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

        {/* HUD over the board: red recording banner (status) and the step
            caption. Both are set outside the per-frame path (banner via React
            once, caption imperatively) so playback never re-renders tokens. */}
        {recording && (
          <div className="record-banner" role="status" data-testid="record-banner">
            <span className="record-dot" aria-hidden="true" />
            Recording. Move players and the ball.
          </div>
        )}
        <div className="anim-caption" data-testid="anim-caption" ref={captionRef} aria-live="polite" />
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

      {savedPatterns.length > 0 && (
        <div className="saved-patterns" data-testid="saved-patterns">
          <h2 className="saved-title">My patterns</h2>
          <ul>
            {savedPatterns.map((pattern, i) => (
              <li key={i} className="saved-pattern" data-testid="saved-pattern">
                <span className="saved-pattern-name">{pattern.name}</span>
                <span className="saved-pattern-author">COACH</span>
                <button
                  type="button"
                  data-testid={`replay-${i}`}
                  onClick={() => replaySaved(pattern)}
                  disabled={playing || recording}
                >
                  Replay
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
