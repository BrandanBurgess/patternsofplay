// Static pitch backdrop. Purely decorative geometry drawn directly in viewBox
// units for each orientation, so the goals sit left/right in landscape and
// top/bottom in portrait (attacking end at the top, per the design README).
// This does not touch token coordinates; it only frames them.

import type { Orientation, Size } from "./coords";

interface Props {
  orientation: Orientation;
  vb: Size;
}

export function PitchMarkings({ orientation, vb }: Props) {
  const { width: W, height: H } = vb;
  const line = "var(--pitch-line, rgba(255,255,255,0.28))";
  const stroke = Math.max(W, H) * 0.0022;

  const common = { fill: "none", stroke: line, strokeWidth: stroke };
  const boundary = (
    <rect x={stroke} y={stroke} width={W - stroke * 2} height={H - stroke * 2} {...common} />
  );

  if (orientation === "landscape") {
    const boxW = W * 0.16;
    const boxH = H * 0.6;
    const boxY = (H - boxH) / 2;
    const r = H * 0.14;
    return (
      <g aria-hidden="true">
        <rect x={0} y={0} width={W} height={H} fill="var(--pitch-turf, transparent)" />
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
      <rect x={0} y={0} width={W} height={H} fill="var(--pitch-turf, transparent)" />
      {boundary}
      <line x1={stroke} y1={H / 2} x2={W - stroke} y2={H / 2} {...common} />
      <circle cx={W / 2} cy={H / 2} r={r} {...common} />
      <circle cx={W / 2} cy={H / 2} r={stroke * 1.6} fill={line} stroke="none" />
      <rect x={boxX} y={stroke} width={boxW} height={boxH} {...common} />
      <rect x={boxX} y={H - stroke - boxH} width={boxW} height={boxH} {...common} />
    </g>
  );
}
