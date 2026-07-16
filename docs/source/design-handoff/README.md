# Patterns of Play — Design Handoff (MVP)

Interactive mockup: `pop-mvp-mockups.html` (open in any browser — no build step).
Top controls switch **Desktop / Phone** frames and the three themes. Everything below is captured in the numbered PNGs.

## Design tokens

Three themes share one CSS-variable token set (`html[data-theme]`), so screens are theme-agnostic.

| Token | Pitch (default) | Dark | Board (light) |
|---|---|---|---|
| `--bg` app background | `#0F3C2C` deep pitch green | `#14161A` | `#FAFAF6` |
| `--bg-stripe` / `--bg-stripe-alt` turf | `#3B7A57` / `#336A4B` mown stripes | flat dark | flat light |
| `--sidebar-bg` nav / drawers | `#0B2F22` | `#191C21` | `#F1F2EC` |
| `--surface` cards, toolbars | `#1B4B39` | `#1D2025` | `#FFFFFF` |
| `--accent` interactive gold | `#E8B923` (trophy gold) | `#4FA8FF` | `#2D6A4F` |
| `--glow` ball / suggestion | `#FFD65A` | `#7CC1FF` | `#2D6A4F` |
| `--red` maple status red | `#E23D42` | `#E5484D` | `#C81E2C` |

Rules the palette encodes:
- **Gold is the only interactive color** (buttons, active nav, confirmed lanes, ball glow, keystone pulse).
- **Red is status only** — opposition tokens, blocked lanes, marking rings, fit warnings, record state, live/notification badges. Red is never a call to action.
- Type: Oswald (display — titles, numbers, section labels) + Inter (body/UI).

## Visual language on the board

| Element | Meaning |
|---|---|
| Dashed dim gold line | Auto-suggested passing lane (players within range) |
| Solid bright gold line | Coach-confirmed lane (click two players to lock/unlock) |
| Dashed red line + red dot | Lane blocked — dot marks the interception point |
| Red ring on a player (thin/thick+glow) | Loosely / tightly marked by an opponent |
| Glowing gold dot | The ball (glow trail while tracing / recording) |
| Pulsing gold dot (formations) | Keystone position — tap for its blurb |
| Numbered gold badges | Ball route order (trace) |

Two tunable thresholds exist and must stay independent: lane **blocking** distance (perpendicular to the pass line) and player **marking** distance.

## Screens & interaction conventions

1. **Whiteboard** — draggable tokens, live lane graph, zone overlays (thirds, half-spaces, Zone 14 + cutback) under the view menu. **Record** (red dot): captures timestamped keyframes of every drag; ball leaves a gold trace; stop → name → **Save to My patterns**.
2. **Patterns (visual-first)** — default view is an **empty board**. A page-level **swipe-up sheet** holds the browser, separated into three libraries per the content bible: **Patterns** (12 archetypes incl. B8 La Pausa and B9 Press Baiting, with category chips), **Deliveries** (3F crossing/through-ball types F1–F8 — each tile shows its trajectory: ground / driven / whipped / floated / clipped; details give delivery zone + target corridor), and **Rotations** (5B whole-team looping choreography — R1 False-9 Drop, R12 Strikers' Scissors, R13 Overlapping CB; details give "what it creates" + "the defender's dilemma"). Search spans the active library. Selecting closes the sheet and plays on the big board; the floating meta bar gives Details, Open on whiteboard, Clear.
3. **Formations (board-first)** — the shape renders full-size on the board, keystones pulsing (tap → floating keycard). A page-level **swipe-up sheet** browses the six presets with searchable mini shape-thumbnails; the floating meta bar gives Details (strengths, danger areas, every keystone blurb) and the **Rondo map** toggle (3G) — five tappable zones (first-line 4v2, midfield 5v3, 2v1 corridors, last-line 2v2) explaining which rondo lives there and which patterns solve it.
4. **Roster** — role + AWR/DWR work-rate chips per player; six coach-rated 1–5 attribute sliders; **fit warnings** (coach-only) banner, e.g. double-exposure flank.
5. **Identity (board-first)** — empty board by default; a swipe-up sheet with search and three segments: **Reference teams**, **Style archetypes**, **Cult corner**. Selecting a team plays its **signature idea on the board** — Barça runs the third-man (its house style), Liverpool a counterpress-swarm-to-vertical sequence, Mourinho's Madrid the transition counter, Leicester the ball over the top — while teams without a bespoke animation (Atlético, City's 3-2-4-1) render their in-possession shape statically. Details follows the Section 6 template exactly: Formation & shape → Core idea → Signature patterns → Keystone roles → Youth takeaway; style archetypes add the **pass-risk profile** (5.7: Encouraged / Off-menu / tempo rule — thresholds shift per identity). Only a few visualizations are hardcoded by design; the rest are data slots. Copy rule: identities **curate, never lock** ("here's how X assembled these pieces", never "the right way").
6. **Sessions (classroom)** — bundle patterns and recorded whiteboard tactics into a session, attach a coach note, and send to players. Draft state: reorder/remove items, "+ Add from library" opens a picker (presets and My patterns, each with its mini-board thumbnail), players listed as "Will receive". Sent state: gold SENT pill with an x/y viewed counter, and per-player read receipts (Viewed / Not yet). Receipts are **coach-only** — consistent with fit warnings, players never see each other's status.

Phone layout: sidebar collapses to a 52px vertical icon rail; grids stack; the formation list becomes a horizontal pill row. **All boards render portrait on phone** (7:10, goals top/bottom, attacking end at the top): every position is stored in landscape model coordinates and mapped at render — `portrait: left = y, top = 100 − x` — with the inverse applied to drag input, so recordings and patterns are orientation-independent and replay correctly in both.

## Roles & permissions (preview via the Coach / Player toggle in the topbar)

Players on a team can **see everything and add, never delete or edit others**. The mockup's role toggle demonstrates both states — the implementer should treat it as the permission spec:

| Capability | Coach | Player |
|---|---|---|
| Whiteboard, lanes, zones, record & save tactics | Yes | Yes — saved patterns are author-stamped (tile shows COACH / player name) |
| Delete a saved pattern | Yes (Delete appears on custom patterns only) | No — delete control never renders |
| Pattern library, formations, identity | Full | Full (view + play) |
| Roster | Full, plus fit warnings and suggestion review | View-only sliders/work rates ("view only" label); no fit warnings; own row marked "(you)" |
| Suggest own playstyle | — | Yes: free-text suggestion on own profile → "pending coach review"; coach sees a gold badge on the row and an Approve / Dismiss card. Approve merges the note into the profile |
| Sessions | Create, edit drafts, send, see per-player read receipts | Sees sent sessions only, read-only: coach note, content list with Watch buttons (jump straight to the pattern playing), and Mark as watched — which feeds the coach's receipt counter |

Principles encoded: additive-only for players (add tactics, add suggestions — no destructive actions); coach-only information (fit warnings, receipts) never renders in player views rather than being disabled; every player contribution routes through coach review before changing anything.

## Data-model notes for the implementer
- Preset pattern animations are **declarative specs** (player from→to + ball waypoints); recorded patterns are **raw keyframes**. Ball waypoints **bind to the player who starts or finishes at that spot** and chase the player's live position — this is what makes passes connect to runners. Either unify on keyframes later or keep both formats.
- Lane overrides are stored per player pair; consider keying by role/slot before patterns are reused across formations.
- Recording captures all tokens (teammates, opponents, ball), so defensive patterns record the same way.

## Screenshot index
01–05 whiteboard: lanes → zone overlays → recording w/ trace → save bar → saved pattern auto-playing.
06–10 patterns: empty-board default → browser drawer → search → third-man run playing → details panel.
11–13 formations keystone / roster fit warning / identity. 14–20 phone equivalents.
21–23 sessions: sent session with read receipts → draft with library picker open → phone session view.
24–28 roles: player suggest-playstyle → pending state → player session view → coach suggestion review → phone player session.
29–33 new libraries: deliveries → rotations → rotation playing with dilemma details → rondo map → identity with pass-risk + cult corner.
34–36 portrait phone: whiteboard → pattern playing → rondo map.
37–39 formations board-first: keystone keycard → sheet with shape thumbnails + search → details panel.
40–42 identity board-first: reference-team sheet → Barça third-man playing with Section-6 details → Atlético static shape.
43–45 phone: portrait formations → identity sheet → Liverpool visualization playing.
