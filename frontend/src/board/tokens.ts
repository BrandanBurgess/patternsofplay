// Token model. Positions are ALWAYS landscape model coordinates (CLAUDE.md
// rule 8); orientation never touches this data. The default board is the DoD's
// performance target: 11 home + 11 away + ball = 23 tokens.

import type { ModelPoint } from "./coords";

export type TokenSide = "home" | "away" | "ball";

export interface Token {
  id: string;
  side: TokenSide;
  label: string; // jersey number, empty for the ball
  pos: ModelPoint; // landscape model coordinates
}

// Home attacks toward x=100; away attacks toward x=0. A 4-3-3 each way.
// y runs 0 (top touchline) to 100 (bottom touchline).
const HOME_433: Array<{ label: string; pos: ModelPoint }> = [
  { label: "1", pos: { x: 5, y: 50 } }, // GK
  { label: "2", pos: { x: 22, y: 16 } }, // RB
  { label: "5", pos: { x: 18, y: 38 } }, // RCB
  { label: "6", pos: { x: 18, y: 62 } }, // LCB
  { label: "3", pos: { x: 22, y: 84 } }, // LB
  { label: "8", pos: { x: 42, y: 30 } }, // RCM
  { label: "4", pos: { x: 38, y: 50 } }, // DM
  { label: "10", pos: { x: 42, y: 70 } }, // LCM
  { label: "7", pos: { x: 68, y: 18 } }, // RW
  { label: "9", pos: { x: 72, y: 50 } }, // ST
  { label: "11", pos: { x: 68, y: 82 } }, // LW
];

// Mirror across the halfway line (x -> 100 - x) for the opponent shape.
function mirror(pos: ModelPoint): ModelPoint {
  return { x: 100 - pos.x, y: pos.y };
}

export function defaultBoardTokens(): Token[] {
  const home: Token[] = HOME_433.map((p) => ({
    id: `home-${p.label}`,
    side: "home",
    label: p.label,
    pos: p.pos,
  }));
  const away: Token[] = HOME_433.map((p) => ({
    id: `away-${p.label}`,
    side: "away",
    label: p.label,
    pos: mirror(p.pos),
  }));
  const ball: Token = { id: "ball", side: "ball", label: "", pos: { x: 50, y: 50 } };
  return [...home, ...away, ball];
}

// Colors resolve from CSS variables so the three themes and future per-team
// colors (teams.colors_json) drive them. These are BOARD tokens, defined per
// theme in styles/tokens.css, and they are deliberately NOT chrome tokens:
// before T-071 home fell back to var(--accent) and away to var(--red), so a
// red brand accent would have painted both teams the same colour and made the
// board unreadable. --team-home / --team-away are also the per-team override
// point (teams.colors_json) when that lands; there is no chrome fallback to
// collapse into. No hardcoded colors live in components; these var() strings
// are the single indirection point.
export const TOKEN_FILL: Record<TokenSide, string> = {
  home: "var(--team-home)",
  away: "var(--team-away)",
  ball: "var(--ball)",
};

// The disc behind a player token's ring and number. Board token, not the
// chrome's --surface: a token sits on turf, not on a card.
export const TOKEN_FACE = "var(--token-face)";
