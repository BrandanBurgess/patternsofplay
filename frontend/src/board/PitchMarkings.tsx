// Static pitch backdrop. Purely decorative geometry drawn directly in viewBox
// units for each orientation, so the goals sit left/right in landscape and
// top/bottom in portrait (attacking end at the top, per the design README).
// This does not touch token coordinates; it only frames them.
//
// T-071: the turf, the mown stripes, and the markings read the BOARD token
// layer (--pitch-turf, --pitch-stripe, --pitch-line), never the chrome. Before
// T-071 the turf rect fell back to `transparent` because --pitch-turf was
// never defined in any theme, and the board only looked green because
// Board.css painted the wrapper with the chrome's --bg-stripe. A red brand
// accent would have turned the pitch red. See tokens.css for the two layers.

import { useId } from "react";
import type { Orientation, Size } from "./coords";

interface Props {
  orientation: Orientation;
  vb: Size;
}

export function PitchMarkings({ orientation, vb }: Props) {
  const { width: W, height: H } = vb;
  const line = "var(--pitch-line)";
  const stroke = Math.max(W, H) * 0.0022;
  // Every board on a page mounts its own <pattern>; ids must not collide.
  const stripeId = `pitch-stripe-${useId().replace(/:/g, "")}`;

  const common = { fill: "none", stroke: line, strokeWidth: stroke };
  const boundary = (
    <rect x={stroke} y={stroke} width={W - stroke * 2} height={H - stroke * 2} {...common} />
  );
  // Mown stripes (design README turf, PNG 01): a diagonal band pattern over
  // the turf, one shade darker. Decorative only, so it is never the thing a
  // meaning depends on; the pattern tile is sized off the board's long edge
  // so the band width looks the same in both orientations.
  const band = Math.max(W, H) * 0.07;
  const turf = (
    <>
      <defs>
        <pattern
          id={stripeId}
          width={band * 2}
          height={band * 2}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-25)"
        >
          <rect x={0} y={0} width={band * 2} height={band * 2} fill="var(--pitch-turf)" />
          <rect x={0} y={0} width={band} height={band * 2} fill="var(--pitch-stripe)" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={W} height={H} fill={`url(#${stripeId})`} />
    </>
  );

  if (orientation === "landscape") {
    const boxW = W * 0.16;
    const boxH = H * 0.6;
    const boxY = (H - boxH) / 2;
    const r = H * 0.14;
    return (
      <g aria-hidden="true">
        {turf}
        {boundary}
        <line x1={W / 2} y1={stroke} x2={W / 2} y2={H - stroke} {...common} />
        <circle cx={W / 2} cy={H / 2} r={r} {...common} />
        <circle cx={W / 2} cy={H / 2} r={stroke * 1.6} fill={line} stroke="none" />
        <rect x={stroke} y={boxY} width={boxW} height={boxH} {...common} />
        <rect x={W - stroke - boxW} y={boxY} width={boxW} height={boxH} {...common} />
      </g>
    );
  }

  // portrait: goals top/bottom
  const boxH = H * 0.16;
  const boxW = W * 0.6;
  const boxX = (W - boxW) / 2;
  const r = W * 0.14;
  return (
    <g aria-hidden="true">
      {turf}
      {boundary}
      <line x1={stroke} y1={H / 2} x2={W - stroke} y2={H / 2} {...common} />
      <circle cx={W / 2} cy={H / 2} r={r} {...common} />
      <circle cx={W / 2} cy={H / 2} r={stroke * 1.6} fill={line} stroke="none" />
      <rect x={boxX} y={stroke} width={boxW} height={boxH} {...common} />
      <rect x={boxX} y={H - stroke - boxH} width={boxW} height={boxH} {...common} />
    </g>
  );
}
