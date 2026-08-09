# Patterns of Play — Design Handoff (MVP)

Interactive mockup: `pop-mvp-mockups.html` (open in any browser — no build step).
Top controls switch **Desktop / Phone** frames and the three themes. Everything below is captured in the numbered PNGs.

## Design tokens

> **Source of truth: the founder palette directive of 2026-08-07 (ticket T-071).** It replaces the original gold-accent table and the two rules that sat under it, and it supersedes the values baked into `pop-mvp-mockups.html` and the colours in the numbered PNGs (which still show the old gold chrome). Everything else in this document, layout, interactions, permissions, the board's visual language, is unchanged and still wins.

Three themes share one CSS-variable token set (`html[data-theme]`), so screens are theme-agnostic. The live values are `frontend/src/styles/tokens.css`; `scripts/check_palette.py` fails the build if this table and that file drift apart on the rules below.

Brand constants, sampled from the logo: brand red `#C81C1C`, shield navy `#16304F`, shield gold `#C9A227`, grass green `#3B7A44`.

### Two layers, and they must not be mixed

**1. Chrome tokens.** The application shell.

| Token | Pitch (default) | Dark | Board (light) |
|---|---|---|---|
| `--bg` app background | `#081422` navy | `#121417` | `#FAFAF6` |
| `--sidebar-bg` nav / drawers | `#0A1A2B` | `#17191D` | `#F0F1EB` |
| `--surface` cards, toolbars | `#0F2338` | `#1D2025` | `#FFFFFF` |
| `--text-primary` / `--text-secondary` | `#F5F3E9` / `#A6BCD4` | `#ECEDEE` / `#9AA1AA` | `#1B2420` / `#58635B` |
| `--accent` **interactive brand red** | `#EF5350` | `#F4635A` | `#C81C1C` |
| `--accent-ink` on a filled accent | `#2A0605` | `#2A0605` | `#FFFFFF` |
| `--glow` accent halo | `#FF8079` | `#FF8B80` | `#E24A44` |
| `--warn` **advisory shield gold** | `#C9A227` | `#D2AB2E` | `#8A6A08` |
| `--on-warn` / `--bg-warn` / `--text-warn` | `#241A00` / gold 16% / `#E9C651` | `#201700` / gold 16% / `#E6C24C` | `#FFFFFF` / `#FAF2DA` / `#7A5D06` |
| `--red` **failure crimson** | `#CF3560` | `#DE3F63` | `#A11331` |
| `--bg-red` / `--text-red` | crimson 16% / `#FF8FA8` | crimson 16% / `#FF8DA4` | `#FBE9EE` / `#8F1130` |

The dark themes carry a brightened brand red because no deep red can clear 4.5:1 as text on a dark ground; the light theme carries the logo's own `#C81C1C`.

**2. Board tokens.** A football pitch, defined independently in every theme. Nothing in `frontend/src/board/`, and no board surface anywhere else (mini thumbnails, keystone rings, the positional grid overlay), may read a chrome token for a football meaning.

| Token | Pitch (default) | Dark | Board (light) |
|---|---|---|---|
| `--pitch-turf` / `--pitch-stripe` mown turf | `#2D6434` / `#28592E` | `#1F4A28` / `#1B4223` | `#D7E6D4` / `#CDDECA` |
| `--pitch-line` markings | `#DCEADE` | `#C6DCCA` | `#56785C` |
| `--token-face` the disc behind a token | `#0B1C11` | `#071009` | `#FFFFFF` |
| `--team-home` / `--team-away` | `#EFC63F` / `#FF8A8C` | `#E9BF46` / `#FA8285` | `#7A5D06` / `#A5151C` |
| `--ball` | `#FFE27A` | `#F8DD7B` | `#8F6F0A` |
| `--lane-suggested` / `--lane-confirmed` / `--lane-glow` | `#E8B923` / `#FFD65A` / `#FFE9A0` | `#DDB02A` / `#F6CF5E` / `#FAE5A2` | `#8F6F0A` / `#6F5405` / `#B8951F` |
| `--lane-blocked` / `--intercept` / `--mark` | `#FF8A8C` | `#FA8285` | `#A5151C` |
| `--zone` / `--keystone` | `#E8B923` / `#FFD65A` | `#DDB02A` / `#F6CF5E` | `#7A5D06` / `#6F5405` |
| `--route-badge` / `--route-badge-ink` | `#FFD65A` / `#33280A` | `#F6CF5E` / `#2E2409` | `#6F5405` / `#FFFFFF` |

On the light `board` theme the turf is pale, so every mark on it is deep rather than bright: same football language, different value. There is no `--bg-stripe`: the board used to borrow that chrome token as turf, which is exactly what this split exists to prevent.

Rules the palette encodes:
- **The brand red `--accent` is the only interactive colour, and the only red fill**: buttons, active nav, active tabs and tools, focus rings, hover borders, range thumbs.
- **Shield gold `--warn` carries advisories and read-only emphasis**: fit warnings, unit-balance clash notes, the SENT pill, receipts, verdict chips, author stamps, category labels. Nothing gold is clickable.
- **`--red` is failure only**, rendered as text, a 1px outline, or a faint `--bg-red` tint, and never as a fill on a control. It is held at a distinctly cooler crimson from the scarlet accent, so the two reds never read as one colour.
- **The board keeps the football language below**, in all three themes: green turf, gold "the pass is on", red "blocked / opposition / marking". The chrome went red for the brand; the pitch did not. **Changing `--accent` must not be able to change what the pitch or a lane looks like**, which `scripts/check_palette.py` and `e2e/palette.spec.ts` both enforce.
- Contrast: WCAG AA on every pair that carries meaning, 4.5:1 for text and 3:1 for graphics and borders, computed in `scripts/check_palette.py` rather than eyeballed.
- Type: Oswald (display, titles, numbers, section labels) + Inter (body/UI).

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
