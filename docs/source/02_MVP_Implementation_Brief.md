# Patterns of Play, Initial MVP Implementation Brief
### Binding scope, definition of done, and build order for the implementation agent and its subagents
**Version:** 1.0
**Inputs this brief reconciles:**
- PRD v2 (`01_PRD_v2_Patterns_of_Play.md`)
- Design handoff (`design-handoff/`: README, 45 PNGs, `pop-mvp-mockups.html`)
- Tactical Content Bible v1.0 (content source of truth)
- Data spec (`03_Data_Model_and_Tactical_Content_Spec.md`)
- Stack note (`04_Tech_Stack_Decision_Note.md`)

**If documents conflict:** this brief wins on scope; the design README wins on visuals, interactions, and permissions; the Bible wins on football content; doc 03 wins on schema and seeding.

---

## 1. Scope rule and the scope table

**The rule:** build only what is design-supported (a screen or convention in the handoff) AND content-supported (defined in the Bible or in the design README's logic notes). Content with no designed surface is seeded as data with no UI. Nothing outside this table is in scope, however tempting.

| Feature | Design evidence | Content evidence | Verdict |
|---|---|---|---|
| Auth, team creation, join code | None (gap, see Section 8) | PRD model | IN, minimal screens from tokens |
| Whiteboard: tokens, lanes, rings, zones, record, save | PNG 01-05, 14, 34; README | Bible 3E zones; README thresholds | IN |
| Patterns browser + playback (12 archetypes) | PNG 05-10, 15-18, 35 | Bible 3A/3B/3C/3D entries for A1-A5, B3, B5, B8, B9, C1, C2, D1 | IN |
| Deliveries library, F1-F8 tiles + details | PNG 29 | Bible 3F.0 vocabulary, F1-F8 entries | IN |
| Rotations library: R1, R12, R13 | PNG 30, 31 | Bible 5B.1, 5B.5 | IN |
| Formations: 6 presets, keystones, details | PNG 11, 19, 37-39, 43 | Bible Section 4 | IN |
| Rondo Map overlay (5 zones) | PNG 32, 36 | Bible 3G.2 | IN |
| Roster: roles, AWR/DWR, 6 sliders | PNG 12, 20 | Bible 1.2, 1.3, Section 2 | IN |
| Fit warning: double-exposure flank, coach-only | PNG 12 | Bible 2B.3 Flank Balance, 2B.4 | IN (this warning only) |
| Player playstyle suggestion + coach review | PNG 24, 25, 27 | README roles table | IN |
| Identity: reference teams, style archetypes, cult corner | PNG 13, 33, 40-42, 44, 45 | Bible 5, 5.7, 6, 6.19 | IN (per 5.5 of PRD v2: 4 animated + 2 static hardcoded, rest data slots) |
| Pass-risk profile display on style archetypes | PNG 33 | Bible 5.7 | IN (display only) |
| Sessions: draft, send, receipts, player view | PNG 21-23, 26, 28 | README Sessions spec | IN |
| Coach / Player permission model | README table, role toggle | README principles | IN, exactly as specified |
| Phone layouts, portrait boards, coordinate mapping | PNG 14-20, 23, 28, 34-36, 43-45; README formula | README | IN |
| Synergy glow on whiteboard | Not in any screen | Bible 2B.1, 8.1 suggests it | OUT of UI; synergy data seeded |
| Full clash warning set | Only double-exposure designed | Bible 2B.4 | OUT beyond the designed warning; data seeded |
| Identity-shifted fit thresholds | No surface | Bible 5.7 table | OUT; profile data seeded |
| Formation matchup overlay | No surface | Bible 3G.3 | OUT; matchup data seeded |
| F14-F16, crossing selectors, Four-Run Box, auto footedness | No surface | Bible 3F | OUT; F5 rule ships as card copy only |
| National styles (S7), Canada card | No surface | Bible 7 | OUT; may seed as inactive data |
| Training-session / drill planner, rondo auto-suggest | No surface | Bible 3G.1 | OUT; rondo-to-concept mapping seeded |
| Club layer, video, payments, parent view | No surface | PRD later phases | OUT |

---

## 2. The strict copy requirement

**NO EM DASHES IN ANY USER-FACING TEXT.** This is a hard product requirement from the founder.

- Applies to: every label, button, blurb, coaching point, keystone card, details panel, warning, empty state, toast, and all Bible-derived content.
- The Bible uses em dashes constantly. All content is transformed at seed time per doc 03 Section 7 (rewrite with periods, commas, colons, or parentheses; never a mechanical find-and-replace that leaves broken grammar).
- Definition of done for every UI workstream includes an automated check: a test that scans rendered strings and seeded content for the em dash character and fails the build if any is found. Hyphens in compound words (third-man run, coach-only) are fine and required.

---

## 3. Permission model (implement exactly)

From the design README; the mockup's Coach / Player toggle demonstrates both states.

| Capability | Coach | Player |
|---|---|---|
| Whiteboard: lanes, zones, record and save tactics | Yes | Yes; saved patterns author-stamped (tile shows COACH or player name) |
| Delete a saved pattern | Yes, Delete appears on custom patterns only | No; the delete control never renders |
| Pattern library, formations, identity | Full | Full (view and play) |
| Roster | Full, plus fit warnings and suggestion review | View-only sliders and work rates with a "view only" label; no fit warnings; own row marked "(you)" |
| Suggest own playstyle | Not applicable | Yes: free text on own profile, then "pending coach review"; coach sees gold badge on the row and an Approve / Dismiss card; Approve merges the note into the profile |
| Sessions | Create, edit drafts, send, see per-player read receipts | Sees sent sessions only, read-only: coach note, content list with Watch buttons (jump straight to the pattern playing), Mark as watched (feeds the coach's receipt counter) |

Principles (binding): players are additive-only; coach-only information (fit warnings, receipts) never renders in player views rather than being disabled; every player contribution routes through coach review. Enforce on the API, not just the UI: a player token calling a delete or receipt endpoint gets 403.

---

## 4. Build order (phased steps)

Sequenced so each phase produces something verifiable and later phases never rework earlier ones. Suggested subagent assignment in parentheses; a single implementer follows the same order.

**Phase 0. Foundations (platform subagent)**
1. Repo scaffolding: FastAPI + SQLAlchemy + Alembic + SQLite backend; React + Vite frontend; per doc 04.
2. Design token system: the three themes as CSS variables on `html[data-theme]`, Oswald and Inter loaded, theme switcher.
3. Auth (coach and player roles), team creation, join code generation, join-by-code. Minimal screens using tokens only.
4. Multi-tenant scoping: every query goes through a team-scoped query layer (doc 03 Section 2). No route handler queries unscoped.

**Phase 1. Content seeding (content subagent)**
5. Implement the schema from doc 03.
6. Write seed files transcribing the Bible per doc 03 Sections 4 to 6 (roles, attributes vocab, patterns, deliveries, rotations, formations, keystones, rondo map, identities, pass-risk, synergies-as-data).
7. Em dash transformation pass plus the automated copy check.
8. Seed validation script: every content entry has all Bible 8.2 required fields; every animation spec references valid position slots.

**Phase 2. Board engine (board subagent; the hard part, start early, keep isolated)**
9. Pitch canvas component: landscape model coordinate system (0-100 both axes), token rendering, drag.
10. Portrait mapping exactly per README: portrait left = y, top = 100 - x, inverse on drag input. Prove with a round-trip unit test before building on it.
11. Lane graph: suggested (dashed dim gold), confirmed (solid bright gold, click two players to toggle), blocked (dashed red plus red interception dot). Two independent thresholds (blocking distance perpendicular to the pass line; marking distance), tunable, stored per board.
12. Marking rings (thin red, thick glowing red).
13. Zone overlays: thirds, half-spaces, Zone 14 plus cutback, under a view menu.
14. Animation player: consumes declarative specs (player from-to plus ball waypoints, ball waypoints bound to the player starting or finishing at that spot and chasing the player's live position) AND raw keyframe recordings. Glowing gold ball with trail, numbered route badges.
15. Recorder: timestamped keyframes of every drag on every token (teammates, opponents, ball); stop, name, save.

**Phase 3. Core screens (screens subagent, consumes Phases 1 and 2)**
16. Whiteboard page (PNG 01-05): board plus toolbar, view menu, record and save flow into My Patterns.
17. Patterns page (PNG 05-10, 29-31): empty board default, swipe-up sheet with three libraries and category chips, search spanning the active library, selection closes sheet and plays, floating meta bar (Details, Open on whiteboard, Clear), details panels per library template.
18. Formations page (PNG 11, 37-39): board-first render, pulsing keystones with floating keycards, swipe-up sheet with shape thumbnails and search, details panel, Rondo Map toggle with five tappable zones (PNG 32).
19. Roster page (PNG 12): roster CRUD, role and work-rate chips, six sliders, position assignment feeding the formation board, the double-exposure flank fit warning banner (coach-only).
20. Identity page (PNG 13, 33, 40-42): sheet with three segments and search, the four scripted signature animations, two static shapes, data-slot detail cards for remaining reference teams, Section 6 detail template, pass-risk block on style archetypes, cult corner mini-cards.

**Phase 4. Roles and sessions (collaboration subagent)**
21. Role-gated rendering plus API enforcement per Section 3.
22. Player playstyle suggestion flow (PNG 24, 25, 27).
23. Sessions: draft builder with library picker and thumbnails, send, sent state with receipts, player session view with Watch deep-link and Mark as watched (PNG 21-23, 26, 28).

**Phase 5. Phone pass and hardening**
24. Icon rail collapse, stacked grids, pill rows, portrait boards verified on all board surfaces (PNG 14-20, 23, 28, 34-36, 43-45).
25. Full em dash sweep, seed validation in CI, permission test suite, demo-path smoke test (Section 6).

---

## 5. Definition of done per workstream

A workstream is done only when every line below passes. Subagents report against these lists verbatim.

**Platform**
- [ ] Coach can register, create a team, and see a join code; player can register and join with the code; wrong code fails cleanly.
- [ ] Every DB table carrying user content has team scoping; a cross-team read attempt in tests returns nothing.
- [ ] All three themes render from tokens; no hardcoded colors anywhere in components.
- [ ] Alembic migration chain builds a fresh DB from zero.

**Content seeding**
- [ ] All 12 pattern archetypes, 8 deliveries, 3 rotations, 6 formations with all keystone blurbs, rondo map (5 zones), 6 style archetypes with pass-risk profiles, reference team set (4 animated specs, 2 static shapes, remaining Section 6 entries as detail-only slots), cult corner cards, role catalog, and synergy pairs exist as seed data matching doc 03 schemas.
- [ ] Every entry passes the required-fields validator (blurb, animation spec where applicable, roles involved, coaching points, youth takeaway).
- [ ] Zero em dashes in any seeded string; CI check proves it.
- [ ] Blurbs read as grammatical sentences after transformation (spot-check sign-off, not just the character scan).

**Board engine**
- [ ] Tokens drag smoothly at 60fps on a mid-range laptop with 23 tokens (11 + 11 + ball).
- [ ] Landscape-portrait round trip is lossless: record in one orientation, replay correctly in both (automated coordinate test plus manual check).
- [ ] Lanes recompute live during drags; confirmed lanes persist; blocked-lane dot sits on the interception point; the two thresholds adjust independently.
- [ ] Animation player runs a declarative spec and a raw recording; a pass into a moving runner connects because waypoints chase the bound player.
- [ ] Recording captures opponent and ball movement, not just teammates.

**Screens**
- [ ] Each page matches its PNGs across the three themes on desktop and phone frames; gold is the only interactive color; red never appears as a call to action.
- [ ] Patterns: search filters the active library only; category chips work; Open on whiteboard carries the pattern's board state to the whiteboard.
- [ ] Formations: every keystone tap shows its keycard; Rondo Map zones each show their rondo and linked patterns.
- [ ] Roster: the double-exposure warning fires when a High AWR fullback sits behind a High/Low winger on the same designed flank, and only renders for coaches.
- [ ] Identity: the four scripted animations play; static teams render their shape; every reference team card follows the five-part Section 6 template; "curate, never lock" copy tone verified.

**Roles and sessions**
- [ ] Every row of the Section 3 table verified in both roles, UI and API.
- [ ] Suggestion flow round-trips: player submits, sees pending; coach approves; note appears merged on the profile; dismiss clears it.
- [ ] Session receipts: Mark as watched increments the coach's x/y counter and flips that player's row to Viewed; players never see receipt data in any payload.

**Phone**
- [ ] All board surfaces render portrait per the mapping; a pattern saved on desktop replays correctly on phone and vice versa.

---

## 6. The demo path (acceptance narrative)

The MVP is accepted when this five-minute flow runs without a hitch, because this is the club pitch: coach signs up, creates a team, adds six players with roles and sliders; opens Formations, loads 4-3-3, taps the pivot keystone; toggles the Rondo Map and taps the first-line zone; opens Patterns, searches "third man", plays A5 on the board; opens the whiteboard, drags a build-out, records it, saves as "Our build-out vs press"; creates a session with A5 plus the recording and a note, sends it; switches to a player account on a phone, opens the session, watches A5 portrait, marks watched; back on the coach account the receipt counter reads 1 of N.

---

## 7. Engineering constraints and notes

- Stack per doc 04: FastAPI, SQLAlchemy 2.x, Alembic, SQLite (single shared file, `team_id` scoping), Litestream backup, React + Vite frontend, board on SVG or canvas (implementer's choice, but the animation player and recorder must share one coordinate and timing model).
- Store all positions in landscape model coordinates; orientation is a render concern only.
- Preset animations stay declarative; recordings stay keyframes. Do not unify formats in this build; the player abstracts over both (design README data-model note).
- Lane overrides store per player pair for now; note in code that keying by role or slot is the likely future (README note) so patterns can be reused across formations.
- Content is data, not code: patterns, formations, identities, and copy live in seed files so the tactical lead can revise without an engineer.
- No localStorage for app state; server is the source of truth.

---

## 8. Known design gaps (build minimal, do not invent)

The handoff contains no screens for: sign-up and login, team creation, join-code entry, empty roster onboarding, or settings. Build the smallest functional version using the token system and existing component patterns (sheets, pills, gold primary buttons). Do not invent new product surfaces, navigation items, or features to fill these gaps; flag anything ambiguous back to the founder rather than improvising.
