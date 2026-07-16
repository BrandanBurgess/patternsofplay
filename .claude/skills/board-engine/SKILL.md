---
name: board-engine
description: Coordinate model, portrait mapping, lane math, and animation binding rules for the board engine. Load for T-020, T-021, T-022 and any ticket touching board rendering or playback.
---
# Board engine contract

## Coordinate model (memorize)
- Model space: landscape, x 0-100 left to right toward the attacking goal, y 0-100 top to bottom. ALL storage in model space.
- Portrait render mapping: left = y, top = 100 - x. Drag input inverts it. Prove with a round-trip property test (random points, both directions, exact) BEFORE building anything on the mapping.

## Lanes (two independent thresholds, stored per board)
- blocking_threshold: perpendicular distance from a defender to the pass line segment; inside it, lane is blocked, red dashed, interception dot at the closest point on the line.
- marking_threshold: defender-to-attacker distance for marking rings (thin red, thick glowing red).
- Suggested lanes dashed dim gold; confirmed lanes solid bright gold, toggled by clicking two players, persisted per player pair. Recompute live during drags; throttle to animation frames, never to timers.

## Animation player (one player, two formats)
- Declarative spec (doc 03 §4.1): interpolate slot from->to per step; ball waypoints with bind_slot CHASE the bound player's live interpolated position each frame so passes connect to runners.
- Raw keyframes: {t_ms, token_id, x, y} arrays replayed as-is, all tokens including opponents and ball.
- Do not unify the formats. One coordinate and timing model shared by player and recorder.
- Rendering: glowing gold ball with trail (trajectory drives trail style: ground flat, floated arced), numbered route badges, captions from steps.

## Performance gate
60fps with 23 tokens on mid-range hardware. Profile before optimizing; prefer transform-based movement, avoid per-frame layout. SVG or canvas is your call; keep the choice behind a component boundary.
