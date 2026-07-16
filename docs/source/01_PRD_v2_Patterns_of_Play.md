# Patterns of Play
### Product Requirements Document v2.0
**Prepared for:** Implementation Planning Agent, Architect
**Supersedes:** PRD v1.0
**Companion documents:**
- `02_MVP_Implementation_Brief.md` (binding scope, definition of done, build order)
- `03_Data_Model_and_Tactical_Content_Spec.md` (how the Tactical Content Bible becomes data)
- `04_Tech_Stack_Decision_Note.md` (FastAPI decision and stack rationale)
- Design handoff: `design-handoff/` (45 numbered PNGs + README + `pop-mvp-mockups.html`)
- Content source of truth: `Patterns_of_Play_Tactical_Content_Bible.md` ("the Bible")

**Status:** v2.0, aligned with Design Handoff v1 and Tactical Content Bible v1.0
**Date:** July 2026

---

## 0. What changed from v1.0

v1.0 described intent. Since then two specialist deliverables arrived and this version aligns to them:

1. **The Tactical Content Bible** defines the actual football content the app ships with (roles, attributes, patterns, deliveries, rotations, formations, keystones, identities, rondo map, pass-risk profiles). The PRD no longer describes content abstractly; it references Bible sections by number.
2. **The Design Handoff** defines the actual screens, interaction conventions, visual language, design tokens, permission model, and phone behavior. The PRD no longer invents UX; it references screens by number.

**Governing rule for the initial build:** a feature is in the initial MVP only if it is (a) explicitly shown in the design handoff AND (b) backed by content or logic explicitly defined in the Bible. Content that exists in the Bible but has no designed surface is seeded into the data model but gets no UI yet. Surfaces that would need content the Bible does not define are out. The full reconciliation lives in the Implementation Brief (doc 02).

**Copy rule (strict, product-wide):** no em dashes anywhere in user-facing app text. This includes UI labels, blurbs, coaching points, keystone cards, warnings, and all content lifted from the Bible, which itself uses em dashes heavily and must be transformed during seeding. See doc 03, Section 7 for the transformation rules.

---

## 1. Executive Summary

Patterns of Play is a web-based tactical development platform for youth soccer coaches and their teams. It gives coaches a visual, animated way to build formations, teach attacking and defensive patterns, and send tactical content to players, using the same visual language professional analysts use, at a price and simplicity level a volunteer youth coach can adopt in one evening.

The product enters the Canadian market as post-World Cup interest in soccer surges and as clubs (especially OPDL-tier) look for credible ways to demonstrate modern player development. The pitch to a club is legitimacy: "our coaches teach with the same tactical vocabulary and visual tools as professional academies."

**Go-to-market:** individual coaches adopt first via a low-friction sign-up; players join via a coach-generated team code; club-wide and OPDL-level licensing follows once coach-level usage proves value. Everything in Phase 1 is designed to be demoable to a club decision-maker in under five minutes.

**Style-agnostic by design (Bible 0.1):** the app teaches patterns and principles, not one philosophy. Identities curate, they never lock. This principle is a hard content and copy rule across the product and is the credibility pitch to experienced coaches.

---

## 2. Problem Statement

Unchanged in substance from v1.0:

- Youth coaches in Canada lack affordable tactical tooling; tactics are taught verbally or with static whiteboard photos that cannot capture movement, which is the hard part.
- Existing tools are video-first, expensive, or built for professional adult teams, not the multi-team reality of a youth club.
- Clubs need to visibly professionalize development. No dominant Canadian product exists in this niche. The opportunity is timing and positioning as much as features.

---

## 3. Users, Roles, and Permissions

### 3.1 Personas
| Persona | Phase | Core need |
|---|---|---|
| Coach | 1 | Build and teach tactics visually; look credible to players, parents, and the club |
| Player | 1 | See their role and the team's patterns; contribute without breaking anything |
| Club Technical Director / Admin | 2+ | Cross-team visibility, club-wide philosophy, the thing the club actually pays for |
| Parent (read-only) | Deferred | Light visibility into what their child is learning |

### 3.2 Onboarding model
Coach registers, creates a team (name, colors, age group, level), and receives a unique team join code. Players register and enter the code to join. No open sign-up, rosters stay clean, and the same invite pattern extends upward later (club invites coaches the way a coach invites players).

### 3.3 Permission model (binding, from Design README)
The design handoff's Coach / Player toggle is the permission spec. Principles:

- **Players are additive-only.** They can see everything and add (record and save their own patterns, suggest their own playstyle). They can never delete or edit anything they did not author, and never delete at all in MVP.
- **Coach-only information never renders in player views.** Fit warnings and session read receipts are not disabled for players; they simply do not exist in the player UI.
- **Every player contribution routes through coach review** before it changes anything (playstyle suggestions require coach approval).
- Saved patterns are author-stamped (tile shows COACH or the player's name).

Full capability table is reproduced in doc 02, Section 3, and must be implemented exactly.

---

## 4. Product Pillars

1. **Visual tactical literacy.** Tactics are seen, not described. The board, its lane graph, and its animations are the product.
2. **Credibility and polish.** Correct coaching vocabulary everywhere (Bible 8.2), professional visual language (design tokens), youth takeaways on content cards. The app should feel written by people who watch football.
3. **Coach-first, club-ready.** Every feature works for one coach and one team; the data model anticipates the club layer without building it.
4. **Style-agnostic.** All patterns available to all teams at all times. Identities describe how great teams weighted the same universal patterns; they never gate content (Bible 0.1).
5. **Progressive depth.** Whiteboard and patterns first, session delivery alongside, training-session planning and video later.

---

## 5. Feature Set (aligned to design screens and Bible sections)

Each feature below cites its design screens (PNG numbers) and Bible sections. Features marked **[MVP]** are in the initial build; features marked **[Later]** are not. Doc 02 is the binding scope document if any conflict is found.

### 5.1 Team and Roster Management **[MVP]**
Screens: 12, 20, 24, 25, 27. Bible: Sections 1, 2, 2B (data), 8.1.

- Coach account, team creation, join code, player join flow. (No dedicated onboarding screens exist in the design handoff; implementer builds minimal functional screens using the design tokens. Flagged as a design gap in doc 02, Section 8.)
- Roster list with per player: name, number, position, preferred foot.
- **Role tagging** using the Bible's three-level taxonomy (Line, Position, Role from the Section 2 Role Catalog). Deeper tags unlock more precise fit feedback later.
- **Work rates:** AWR and DWR chips, Low / Medium / High (Bible 1.2).
- **Six coach-rated attribute sliders, 1 to 5** (Bible 1.3): Pace, Passing Range, 1v1 / Ball Carrying, Positional Discipline, Aerial and Physical Duels, Pressing Engine.
- **Fit warnings, coach-only** (screen 12): the designed warning set, headlined by the double-exposure flank clash (Bible 2B.3 Flank Balance, 2B.4). MVP ships exactly the warnings specified in doc 02; the full fit engine v2 (all of 2B.4, identity-shifted thresholds from 5.7) is [Later].
- **Player playstyle suggestions** (screens 24, 25, 27): a player writes a free-text suggestion on their own profile, sees a pending state; the coach sees a gold badge and an Approve / Dismiss card; approval merges the note into the profile.

### 5.2 Whiteboard **[MVP]** (flagship surface 1)
Screens: 01-05, 14, 34. Bible: 3E (zones), design README visual language.

- Full-pitch board, draggable tokens for teammates, opponents, and ball.
- **Live passing-lane graph:** dashed dim gold for auto-suggested lanes (players in range), solid bright gold for coach-confirmed lanes (click two players to lock or unlock), dashed red with a red interception dot for blocked lanes.
- **Marking rings:** thin red ring for loosely marked, thick glowing red ring for tightly marked players.
- Two independent tunable thresholds: lane blocking distance (perpendicular to the pass line) and player marking distance. These must stay independent.
- **Zone overlays** under the view menu: thirds, half-spaces, Zone 14 plus cutback zone (Bible 3E vocabulary).
- **Record:** red record dot captures timestamped keyframes of every drag on every token (teammates, opponents, ball, so defensive patterns record the same way); the ball leaves a glowing gold trace with numbered route badges; stop, name, and Save to My Patterns.

### 5.3 Patterns **[MVP]** (flagship surface 2)
Screens: 05-10, 15-18, 29-31, 35. Bible: Sections 3, 3F, 5B, 8.1.

- Default view is an empty board. A page-level swipe-up sheet holds the browser with three libraries and search spanning the active library:
  - **Patterns:** 12 archetypes: A1, A2, A3, A4, A5, B3, B5, B8, B9, C1, C2, D1 (the Bible 8.1 starter ten plus B8 La Pausa and B9 Press Baiting, which the design explicitly includes), with category chips.
  - **Deliveries:** delivery types F1 to F8 as designed tiles, each showing its trajectory style (ground / driven / whipped / floated / clipped); details give delivery zone and target corridor using the Bible 3F.0 vocabulary.
  - **Rotations:** the three flagship whole-team looping animations R1 (False-9 Drop and Wing Dive), R12 (Strikers' Scissors), R13 (Overlapping CB); details give "what it creates" and "the defender's dilemma".
- Selecting closes the sheet and plays the animation on the big board; a floating meta bar gives Details, Open on whiteboard, Clear.
- Preset animations are declarative specs (player from-to plus ball waypoints); recorded patterns are raw keyframes. Ball waypoints bind to the player who starts or finishes at that spot and chase the player's live position, which is what makes passes connect to runners.
- Every content card carries the Bible 8.2 required fields: one-sentence blurb, numbered animation spec, roles involved, coaching points, plus a youth takeaway line.

### 5.4 Formations **[MVP]**
Screens: 11, 19, 32, 36-39, 43. Bible: Sections 4, 3G.2.

- Board-first: the selected shape renders full-size with **keystone positions pulsing gold**; tapping a keystone shows a floating keycard with its blurb (the Bible Section 4 keystone copy).
- A swipe-up sheet browses the **six preset formations** (4-3-3, 4-2-3-1, 4-4-2, 3-5-2, 3-4-3, 5-4-1 / 5-3-2 low-block family) with searchable mini shape thumbnails.
- Details panel: shape blurb, strengths, vulnerabilities and danger areas, every keystone blurb, natural identities (Bible Section 4 template).
- **Rondo Map toggle** (screens 32, 36): five tappable zones over the formation (first-line 4v2, midfield 5v3, flank 2v1 corridors, last-line 2v2, counterpress 4v4+3) explaining which rondo lives in each zone and which patterns solve it (Bible 3G.2).
- Roster players can be assigned to positions so the board shows real names and numbers.

### 5.5 Identity **[MVP, curated subset]**
Screens: 13, 33, 40-42, 44, 45. Bible: Sections 5, 5.7, 6, 8.1.

- Board-first, empty by default; swipe-up sheet with search and three segments: **Reference teams**, **Style archetypes**, **Cult corner**.
- Selecting a reference team plays its signature idea on the board where a bespoke animation exists (Barcelona third-man, Liverpool counterpress-swarm-to-vertical, Mourinho Madrid transition counter, Leicester ball over the top); teams without a bespoke animation (Atletico Madrid, City's 3-2-4-1) render their in-possession shape statically. Only these designed visualizations are hardcoded; every other reference team is a data slot rendering details plus static shape.
- Details follow the Bible Section 6 template exactly: Formation and shape, Core idea, Signature patterns, Keystone roles, Youth takeaway.
- Style archetypes (Bible Section 5) additionally show the **pass-risk profile** (Bible 5.7: Encouraged / Off-menu / tempo rule), presented as descriptive content.
- Copy rule (binding): identities curate, never lock. Frame as "here is how X assembled these pieces", never "the right way".
- [Later]: identity selection at team creation seeding a starter pattern set (no designed surface); national style cards (Bible Section 7, no designed surface); pass-risk-driven fit thresholds.

### 5.6 Sessions (classroom delivery) **[MVP]**
Screens: 21-23, 26, 28. Design README Section "Sessions".

This is tactical homework delivery, distinct from the deferred training-session/drill planner.

- Coach bundles patterns and recorded whiteboard tactics into a session, attaches a coach note, and sends to players.
- Draft state: reorder and remove items; "+ Add from library" opens a picker showing presets and My Patterns with mini board thumbnails; players listed as "Will receive".
- Sent state: gold SENT pill with an x/y viewed counter and per-player read receipts (Viewed / Not yet). Receipts are coach-only.
- Player view: sent sessions only, read-only; coach note, content list with Watch buttons that jump straight to the pattern playing, and Mark as watched, which feeds the coach's receipt counter.

### 5.7 Phone experience **[MVP]**
Screens: 14-20, 23, 28, 34-36, 43-45.

- Sidebar collapses to a 52px vertical icon rail; grids stack; formation list becomes a horizontal pill row.
- **All boards render portrait on phone** (7:10, goals top and bottom, attacking end at the top). Every position is stored in landscape model coordinates and mapped at render (portrait: left = y, top = 100 - x) with the inverse applied to drag input, so recordings and patterns are orientation-independent and replay correctly in both orientations.

### 5.8 Deferred features **[Later]** (architecturally anticipated, not built)
- Training-session / drill planner with rondo auto-suggestion per saved pattern (Bible 3G.1 table is seeded as data now; PRD v1 Phase 1.5).
- Fit engine v2: full 2B.4 clash set, 2B.1 synergy glow on the whiteboard (content seeded, no designed surface), identity-shifted attribute thresholds (5.7).
- Formation matchup overlay (Bible 3G.3, seeded as data).
- Full delivery framework: F14 to F16, the 3F.0 zone x trajectory x corridor selectors, Four-Run Box Occupation preset, automatic footedness logic (F5's rule ships as card copy only).
- Full rotation library beyond R1/R12/R13; rotations attachable to saved formations as looping system animations.
- Full reference team animation set; national styles (Section 7); Canada card (Bible 8.3 open question).
- Club / admin layer, cross-team dashboards, club philosophy templates (PRD v1 5.5; the Red Bull entry, Bible 6.15, is the real-world model).
- Video analysis. Payments and billing (manual for pilots). Parent view.

---

## 6. Terminology, Copy, and Content Rules

- Real coaching vocabulary always; each term defined on first touch (Bible 8.2.2).
- Every concept card ships with all four required fields plus youth takeaway and age-suitability hint (Bible 8.2.1, 8.2.4).
- Player archetype names are editorial references only ("the Busquets role"); never imply endorsement; no player likenesses or imagery in UI (Bible 8.2.3).
- **No em dashes in any user-facing text. Strict.** Bible copy is transformed during seeding per doc 03 Section 7.
- Identities curate, never lock (Bible 0.1). No UI state may ever describe a coach's choice as off-identity or wrong.

---

## 7. Design System Summary (binding, from Design README)

- Three themes (Pitch default, Dark, Board light) share one CSS-variable token set on `html[data-theme]`; all screens are theme-agnostic. Token table is in the design README and is the source of truth.
- **Gold is the only interactive color** (buttons, active nav, confirmed lanes, ball glow, keystone pulse). **Red is status only** (opposition, blocked lanes, marking rings, fit warnings, record state, badges); red is never a call to action.
- Type: Oswald for display, Inter for body and UI.
- Board visual language (lanes, rings, glow trail, numbered badges, keystone pulse) per the README table, reproduced in doc 02.

---

## 8. Roadmap

| Phase | Focus | Goal |
|---|---|---|
| 1 (initial MVP, this build) | Whiteboard, Patterns, Formations, Roster, Identity subset, Sessions, phone layouts, seeded content | Pilot-ready, demoable to clubs |
| 1.5 | Training-session planner with rondo suggestions; fit engine v2; synergy glow (needs design pass) | Close the teach-to-train loop |
| 2 | Club / admin layer, philosophy templates, matchup overlay, full identity and delivery libraries | The actual sales motion |
| 3 | Video analysis linked to patterns | Retention and premium pricing |

---

## 9. Open Questions (carried forward, founder to resolve)

From Bible 8.3 plus product:
1. Reference teams: any licensing sensitivity with named clubs and players in editorial content at pilot stage? (Bible 8.2.3 mitigations assumed sufficient for pilot.)
2. Should any fit information ever be visible to players? Current binding answer per design: no, coach-only. Confirm this stands for pilots given youth motivational concerns.
3. Canada card for a future national styles surface: desired at v1.1?
4. Pricing for pilots (assumed free / manual for initial clubs).
5. New pattern candidates from Bible Deep Cuts (overlapping CB is already shipping as R13; +1 man-press, coordinated line step, long-throw routine, wingback back-post finisher queued for v1.1 review).
