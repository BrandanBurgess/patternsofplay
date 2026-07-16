// A single hardcoded declarative fixture to prove the player runs doc 03 4.1
// specs (Brief step 14). This is NOT product content: real preset animations
// arrive with the T-010 seeds transcribed from the Bible. It is a plain
// build-out with two passes, the second played INTO an overlapping runner so the
// bound ball waypoint has to chase a moving player and still connect (the board
// engine DoD line).
//
// Slots are bound to concrete default-board token ids by DEMO_BINDING so the
// spec plays on the live 23-token board. Positions are landscape model coords.

import type { DeclarativeSpec } from "./animationTypes";

export const DEMO_SPEC: DeclarativeSpec = {
  slots: [
    { slot: "gk", role_hint: "GK", start: { x: 8, y: 50 } },
    { slot: "pivot", role_hint: "DM", start: { x: 40, y: 50 } },
    { slot: "fb_R", role_hint: "FB", start: { x: 24, y: 16 } },
    { slot: "opp_press", side: "opponent", start: { x: 55, y: 40 } },
  ],
  ball: { holder_slot: "gk" },
  steps: [
    {
      n: 1,
      caption: "Goalkeeper settles and opens the build out.",
      moves: [],
      ball_to: null,
    },
    {
      n: 2,
      caption: "Ball into the pivot as the press steps up.",
      moves: [{ slot: "opp_press", to: { x: 42, y: 46 } }],
      ball_to: { bind_slot: "pivot", trajectory: "ground" },
    },
    {
      n: 3,
      caption: "Fullback overlaps down the right channel.",
      moves: [{ slot: "fb_R", to: { x: 70, y: 8 }, arc: "outside" }],
      ball_to: null,
    },
    {
      n: 4,
      caption: "Driven pass into the overlap, into the runner.",
      moves: [{ slot: "fb_R", to: { x: 88, y: 6 } }],
      ball_to: { bind_slot: "fb_R", trajectory: "driven" },
    },
  ],
};

// Bind spec slots to default-board token ids (tokens.ts). The fullback runner is
// home-2 (RB), so an e2e can assert the ball lands exactly where home-2 finishes.
export const DEMO_BINDING: Record<string, string> = {
  gk: "home-1",
  pivot: "home-4",
  fb_R: "home-2",
  opp_press: "away-9",
};

/** The fullback runner's final model position, for assertions. */
export const DEMO_RUNNER_FINAL = { x: 88, y: 6 };
