# BACKLOG (orchestrator owns this file)

Status: todo | doing | pr | done. Ticket refs point at Brief §4 step numbers; do not restate them here.
Model: sonnet default; opus = hard ticket, never downgrade.

| ID | Title | Brief steps | Agent | Model | Deps | Parallel-safe with | Status |
|---|---|---|---|---|---|---|---|
| T-001 | Scaffold: FastAPI+SQLAlchemy+Alembic+SQLite(WAL), React+Vite, Makefile (bootstrap/dev/lint/typecheck/test/e2e/verify/seed), CI workflow, e2e harness from e2e/fixtures.ts | 1 | platform | sonnet | none | none (solo, first) | done |
| T-002 | Design tokens: 3 themes as CSS vars on html[data-theme], Oswald+Inter, switcher | 2 | screens | sonnet | T-001 | T-003, T-004 | done |
| T-003 | Auth + teams: register, roles, team create, join code, join flow, minimal token-styled screens (Brief §8: invent nothing) | 3 | platform | sonnet | T-001 | T-002 | done |
| T-004 | Scoped query layer + full schema from doc 03 + Alembic chain from zero + cross-team read test returns nothing | 4, 5 | platform | sonnet | T-001 | T-002 | done |
| T-010 | Seed files: transcribe Bible per doc 03 §4-6 (12 patterns, 8 deliveries, 3 rotations, 6 formations+keystones, rondo 5 zones, 6 archetypes+pass-risk, 4 animated + 2 static ref teams, detail-only slots, cult corner, roles, synergies) | 6 | content-seeder | sonnet | T-004 | T-020 | done |
| T-011 | Em-dash transform pass + CI copy scan + seed validator (required fields, blurb ≤25 words, banned identity phrases, slot refs resolve) | 7, 8 | content-seeder | sonnet | T-010 | T-020 | done |
| T-012 | Founder decision 2026-07-16: identities age_hint column (amend doc 03, Alembic migration, backfill from Bible 8.2.4, validator + seed update) | founder | content-seeder | sonnet | T-010, T-041 | T-043 | done |
| T-020 | Board core: pitch canvas, landscape model coords, token drag 60fps @23 tokens, portrait mapping (left=y, top=100-x) with lossless round-trip unit test FIRST | 9, 10 | board-engineer | opus | T-001 | T-010 | done |
| T-021 | Lane graph: suggested/confirmed/blocked states, two independent thresholds, live recompute during drag, interception dot | 11, 12 | board-engineer | opus | T-020 | T-011 | done |
| T-022 | Zones + animation player (declarative specs AND raw keyframes, ball waypoints chase bound player) + recorder (all tokens incl. opponents + ball) | 13, 14, 15 | board-engineer | opus | T-021 | none | done |
| T-030 | Whiteboard page (PNG 01-05, 14, 34): toolbar, view menu, record/save into My Patterns | 16 | screens | sonnet | T-022, T-004 | T-031 | done |
| T-031 | Patterns page (PNG 05-10, 29-31, 15-18, 35): sheet w/ 3 libraries, chips, search, meta bar, details panels | 17 | screens | sonnet | T-022, T-011 | T-030 | done |
| T-032 | Formations page (PNG 11, 19, 37-39, 43) + keystone pulse/keycards + Rondo Map (PNG 32, 36) | 18 | screens | sonnet | T-031 | T-033 | done |
| T-033 | Roster page (PNG 12, 20): CRUD, chips, 6 sliders, double-exposure warning coach-only | 19 | screens | sonnet | T-004, T-011 | T-032 | done |
| T-034 | Identity page (PNG 13, 33, 40-42, 44, 45): 4 scripted animations, 2 static shapes, detail slots, pass-risk, cult corner | 20 | screens | sonnet | T-031 | T-033 | done |
| T-040 | Role gating UI + API 403 enforcement, permission test suite both roles (Brief §3 table, every row) | 21 | collab | sonnet | T-030..T-034 | T-041 | done |
| T-041 | Playstyle suggestion flow (PNG 24, 25, 27) | 22 | collab | sonnet | T-033 | T-040 | done |
| T-042 | Sessions: draft builder + picker w/ thumbnails, send, receipts, player view w/ Watch deep-link + Mark as watched (PNG 21-23, 26, 28) | 23 | collab | sonnet | T-031, T-040 | none | done |
| T-043 | Founder decision 2026-07-16: role-scoped join codes (player + coach code, migration), join codes coach-only in API payloads, head coach (creator) removes members + edits member roles, permission tests | founder | platform | sonnet | T-003, T-040 | T-041 | done |
| T-050 | Phone pass: icon rail, stacked grids, portrait boards all surfaces, cross-device save/replay test | 24 | screens | sonnet | T-030..T-042 | none | done |
| T-051 | Hardening: full em-dash sweep, permission suite in CI, demo-path e2e (Brief §6 narrative as one Playwright journey, both viewports) | 25 | verifier | sonnet | T-050 | none | done |
| T-060 | Deploy: Render service (persistent volume), Litestream to object storage, env config, prod Turso decision point, smoke journey vs prod URL | doc 04 §2 | platform | sonnet | T-051 | none | todo |

Sequencing: T-001 solo → (T-002 ∥ T-003 ∥ T-004) → (T-010/011 ∥ T-020/021/022) → screens fan-out → collab → phone → hardening → deploy.
Board engine (T-020..022) is the critical path and the hardest work: start it immediately after T-001, keep it isolated (Brief §4 Phase 2 note).

---

## Epic T-100: Tactics Lab (founder commission 2026-08-07)

Source of truth: `docs/source/06_Tactical_Depth_Spec.md`. That doc wins on everything in this epic; doc 03 still wins on schema conventions, the design README on visual language and permissions, the Bible wherever it already speaks (1, 2, 3G, 4, 5B).
Dispatch rule for this epic: give a subagent its ticket row plus **only** the doc 06 sections its row names. Nothing more.

| ID | Title | Doc 06 §§ | Agent | Model | Deps | Parallel-safe with | Status |
|---|---|---|---|---|---|---|---|
| T-100 | Scope amendment: move 4 rows to IN in Brief §1, add doc 06 to the CLAUDE.md source table, no code | 0 | platform | sonnet | none | none (solo, first) | done |
| T-101 | Schema + Alembic: formation_phases, rotation_systems, position_archetypes, archetype_combinations, unit_balance_rules, formation_matchups, rondo_zones new columns + L/R corridor data migration, team_formations, team_formation_slots; scoped layer for both team-world tables + cross-team read test | 3 | platform | sonnet | T-100 | T-104 | todo |
| T-102 | Seeds: position_archetypes (all 10 slot families), archetype_combinations, unit_balance_rules; validator extensions (duty vocabulary closed, key_attribute_keys subset of the six, cost line required) | 2.6, 3.1 | content-seeder | opus | T-101 | T-103, T-104 | todo |
| T-103 | Seeds: formation_phases (6 formations x 3-5 variants), rotation_systems (14 incl. animation specs), rondo_zones for all 6 formations at 6 zones, formation_matchups (15 pairs), 10 reference systems as identities kind=reference_system; validator: phase slot-set equality, risk line required | 2.3, 2.4, 2.5, 2.8, 3.1 | content-seeder | opus | T-101 | T-102, T-104 | todo |
| T-104 | Superiority engine: mirrorOpponent (involutive round-trip test FIRST), pointInPolygon/Circle, countZone, findFreeMen, gridOccupancy, classifyRestDefence, buildRead + route inference; recompute benchmark under 2ms at 22 tokens | 2.2, 4 | board-engineer | opus | T-100 | T-101, T-102, T-103 | todo |
| T-105 | Phase morph playback (bind by slot, 600ms) + opponent token layer mirrored into our frame, both reusing the existing animation player and PatternPreviewBoard, no parallel renderer | 4, 5.1 | board-engineer | opus | T-104, T-103 | T-108 | todo |
| T-106 | Formations page rebuild: phase segment, opposition toggle + opponent pickers, live rondo counts, rotation player with equal-weight risk line, positional grid overlay, portrait pass | 5.1, 5.2, 5.4 | screens | opus | T-105 | T-107 | todo |
| T-107 | Personnel panel: slot assignment from roster, archetype picker, ranked suggestions with cited reasons, live unit balance, footedness notes (all coach-only), empty-roster state | 2.6, 2.7, 5.3 | screens | sonnet | T-105, T-102 | T-106 | todo |
| T-108 | API: /formations/{code}/phases, /formations/matchup, /rotations, /archetypes, /archetypes/suggest, team formation persistence; 403 for player tokens on every coach-only route, test per route | 3.2, 5.3, 6 | collab | sonnet | T-101 | T-105 | todo |
| T-109 | Epic hardening: em-dash sweep over new seeds, permission suite additions in CI, tactics-lab Playwright journey at both viewports, extend the demo path | 6 | verifier | sonnet | T-106, T-107, T-108 | none | todo |

Sequencing: T-100 solo → T-101 ∥ T-104 → (T-102 ∥ T-103 ∥ T-108) → T-105 → (T-106 ∥ T-107) → T-109.
T-104 is this epic's critical path and its hardest work, same reasoning as T-020: coordinate math, unit tests first, keep it isolated from the seed tickets.
T-102 and T-103 are marked opus despite being seed work: the football judgement in the archetype duty assignments and the rotation risk lines is the product, not transcription.
