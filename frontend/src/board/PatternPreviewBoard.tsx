// Read-only preview renderer for the Patterns page (Brief step 17, PNG
// 05-10, 29-31, 15-18, 35): plays a library preset's declarative spec or a
// saved pattern's raw keyframes on the big board. Deliberately NOT the
// whiteboard's Board component: this surface has no drag, no toolbar, no
// recorder, and often renders only the handful of tokens a preset's own
// animation spec names (design mockups show a vignette of the players
// involved, not the full 23-token board). It shares the board engine's
// lower layers instead (coords, PitchMarkings, playback.ts, player.ts,
// AnimationOverlay, Board.css) so the pitch, tokens, trail, and badges look
// and move identically to the whiteboard's.

import { useEffect, useRef, useState } from "react";
import { modelToPixel, type ModelPoint, type Orientation, type Size } from "./coords";
import { PitchMarkings } from "./PitchMarkings";
import { TOKEN_FILL, type TokenSide } from "./tokens";
import { AnimationOverlay } from "./AnimationOverlay";
import { PlayerController } from "./player";
import type { Playback } from "./playback";
import "./Board.css";
import "./PatternPreviewBoard.css";

const VIEWBOX: Record<Orientation, Size> = {
  landscape: { width: 1050, height: 680 },
  portrait: { width: 700, height: 1000 },
};

function tokenRadius(side: TokenSide, vb: Size): number {
  const base = vb.width * 0.021;
  return side === "ball" ? base * 0.7 : base;
}

// Model-space bounding-box area of a zone's corners. Rondo Map zones can
// nest (seeds/rondo_zones.json: the counterpress zone encloses the smaller
// midfield_box zone), so zones paint largest-first, smallest-last: the
// smaller, fully-enclosed zone ends up on top of the DOM and stays
// independently clickable instead of the larger zone swallowing every tap.
function zoneArea(zone: PreviewZone): number {
  const xs = zone.corners.map((c) => c.x);
  const ys = zone.corners.map((c) => c.y);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

export interface PreviewToken {
  id: string;
  side: TokenSide;
  label: string;
  pos: ModelPoint;
  /** Formations page keystones (Brief step 18, design README: "Pulsing gold
   * dot (formations): keystone position, tap for its blurb"). Adds the gold
   * pulse animation and, when `onTokenClick` is provided, makes the token a
   * tap target; plain tokens (Patterns page, non-keystone formation slots)
   * are never clickable regardless of `onTokenClick`. */
  pulsing?: boolean;
}

/** A tappable Rondo Map zone (Brief step 18, PNG 32/36): an arbitrary
 * model-space polygon: rondo_zones.polygon_json is a rectangle today, but
 * nothing here assumes four points or axis alignment. Sits behind tokens,
 * same paint-order rule as the whiteboard's own ZoneOverlay. */
export interface PreviewZone {
  key: string;
  label: string;
  corners: ModelPoint[];
  active?: boolean;
}

interface Props {
  orientation: Orientation;
  /** The scene at t=0. A new array (identity change) resets the board. */
  tokens: PreviewToken[];
  /** Null renders the empty board (design README: "default view is an
   * empty board"). A new Playback (identity change) restarts playback
   * from t=0, even if it is conceptually "the same" pattern re-selected. */
  playback: Playback | null;
  emptyMessage?: React.ReactNode;
  /** Fired whenever playback starts/stops, so the page's meta bar can show
   * the "Playing" pill (PNG 05, 09) without duplicating player state. */
  onPlayingChange?: (playing: boolean) => void;
  /** Fired when a `pulsing` token is tapped (Formations keystones). Tokens
   * without `pulsing: true` never receive a click handler. */
  onTokenClick?: (tokenId: string) => void;
  /** Rondo Map overlay (Formations page only; absent/empty elsewhere). */
  zones?: PreviewZone[];
  onZoneClick?: (zoneKey: string) => void;
}

export default function PatternPreviewBoard({
  orientation,
  tokens,
  playback,
  emptyMessage,
  onPlayingChange,
  onTokenClick,
  zones,
  onZoneClick,
}: Props) {
  const vb = VIEWBOX[orientation];
  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupRefs = useRef<Map<string, SVGGElement>>(new Map());
  const animLayerRef = useRef<SVGGElement | null>(null);
  const animOverlayRef = useRef<AnimationOverlay | null>(null);
  const captionRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef<Map<string, ModelPoint>>(new Map());
  const trailRef = useRef<ModelPoint[]>([]);
  const lastCaptionRef = useRef<string | null>(null);
  const playerRef = useRef<PlayerController | null>(null);
  if (!playerRef.current) playerRef.current = new PlayerController();

  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    onPlayingChange?.(playing);
    // onPlayingChange is expected to be a stable callback (or the page
    // accepts a re-notify on identity change); only `playing` itself
    // should retrigger this.
  }, [playing]);

  useEffect(() => {
    if (animLayerRef.current && !animOverlayRef.current) {
      animOverlayRef.current = new AnimationOverlay(animLayerRef.current);
    }
  }, []);

  const moveTokenDom = (id: string, model: ModelPoint) => {
    const g = groupRefs.current.get(id);
    if (!g) return;
    const p = modelToPixel(model, orientation, vb);
    g.setAttribute("transform", `translate(${p.px} ${p.py})`);
  };

  // Reset the scene to the new selection's t=0 tokens whenever the token
  // list changes (a different pattern/delivery/rotation/saved recording).
  useEffect(() => {
    posRef.current = new Map(tokens.map((t) => [t.id, t.pos]));
    trailRef.current = [];
    animOverlayRef.current?.clear();
    lastCaptionRef.current = null;
    if (captionRef.current) captionRef.current.textContent = "";
    for (const t of tokens) moveTokenDom(t.id, t.pos);
    // moveTokenDom closes over orientation/vb, both stable for a mounted
    // instance's orientation; a real orientation flip remounts via the vb
    // dependency below.
  }, [tokens, orientation, vb.width, vb.height]);

  // Autoplay: a new Playback (identity change) starts from t=0. Null stops
  // and leaves tokens parked at the scene above.
  useEffect(() => {
    const player = playerRef.current!;
    player.stop();
    if (!playback) {
      setPlaying(false);
      return;
    }
    setPlaying(true);
    trailRef.current = [];
    animOverlayRef.current?.clear();
    player.play(
      playback,
      (frame, tMs) => {
        const ballId = playback.ballTokenId;
        frame.actors.forEach((pos, id) => {
          posRef.current.set(id, pos);
          moveTokenDom(id, pos);
        });
        if (ballId && frame.ball) {
          posRef.current.set(ballId, frame.ball);
          moveTokenDom(ballId, frame.ball);
          trailRef.current.push(frame.ball);
        }
        animOverlayRef.current?.render({
          trail: trailRef.current,
          badges: frame.badges.filter((b) => b.revealMs <= tMs),
          trajectory: frame.ballTrajectory,
          orientation,
          vb,
          tokenRadius: vb.width * 0.021,
        });
        if (captionRef.current && frame.caption !== lastCaptionRef.current) {
          lastCaptionRef.current = frame.caption;
          captionRef.current.textContent = frame.caption ?? "";
        }
      },
      () => setPlaying(false)
    );
    return () => player.stop();
  }, [playback, orientation, vb.width, vb.height]);

  const restart = () => playerRef.current?.restart();

  return (
    <div className="board-wrap pattern-preview" data-orientation={orientation} data-playing={playing}>
      <svg
        ref={svgRef}
        className="board-svg"
        data-testid="pattern-board"
        viewBox={`0 0 ${vb.width} ${vb.height}`}
        style={{ aspectRatio: `${vb.width} / ${vb.height}` }}
        role="img"
        aria-label="Pattern preview"
      >
        <PitchMarkings orientation={orientation} vb={vb} />
        {/* Rondo Map zones (Brief step 18, PNG 32/36): behind everything
            else, same paint-order rule as the whiteboard's ZoneOverlay. */}
        {zones && zones.length > 0 && (
          <g className="rondo-zone-layer" data-testid="rondo-zone-layer">
            {[...zones]
              .sort((a, b) => zoneArea(b) - zoneArea(a))
              .map((zone) => {
              const pts = zone.corners
                .map((c) => modelToPixel(c, orientation, vb))
                .map((p) => `${p.px},${p.py}`)
                .join(" ");
              const anchor = modelToPixel(zone.corners[0], orientation, vb);
              return (
                <g
                  key={zone.key}
                  className={`rondo-zone${zone.active ? " rondo-zone-active" : ""}`}
                >
                  <polygon
                    points={pts}
                    className="rondo-zone-poly"
                    data-testid="rondo-zone"
                    data-zone-key={zone.key}
                    onClick={() => onZoneClick?.(zone.key)}
                  />
                  <text
                    x={anchor.px + vb.width * 0.01}
                    y={anchor.py + vb.height * 0.03}
                    className="rondo-zone-label"
                  >
                    {zone.label}
                  </text>
                </g>
              );
            })}
          </g>
        )}
        <g className="anim-layer" ref={animLayerRef} aria-hidden="true" />
        {tokens.map((token) => {
          const p = modelToPixel(token.pos, orientation, vb);
          const r = tokenRadius(token.side, vb);
          const clickable = Boolean(token.pulsing && onTokenClick);
          return (
            <g
              key={token.id}
              ref={(el) => {
                if (el) groupRefs.current.set(token.id, el);
                else groupRefs.current.delete(token.id);
              }}
              className={`token token-${token.side}${token.pulsing ? " token-keystone" : ""}`}
              data-token-id={token.id}
              data-token-side={token.side}
              data-keystone={token.pulsing ? "true" : undefined}
              transform={`translate(${p.px} ${p.py})`}
              onClick={clickable ? () => onTokenClick!(token.id) : undefined}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
            >
              <circle
                className="token-face"
                r={r}
                style={{
                  stroke: TOKEN_FILL[token.side],
                  fill: token.side === "ball" ? TOKEN_FILL.ball : "var(--surface)",
                }}
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

      <div className="anim-caption" data-testid="pattern-caption" ref={captionRef} aria-live="polite" />

      {tokens.length === 0 && emptyMessage && (
        <div className="pattern-empty-card" data-testid="pattern-empty">
          {emptyMessage}
        </div>
      )}

      {playback && !playing && (
        <button
          type="button"
          data-testid="pattern-restart"
          className="restart-btn"
          onClick={restart}
        >
          Restart
        </button>
      )}
    </div>
  );
}
