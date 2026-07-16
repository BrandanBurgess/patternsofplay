# BACKLOG (orchestrator owns this file)

Status: todo | doing | pr | done. Ticket refs point at Brief §4 step numbers; do not restate them here.
Model: sonnet default; opus = hard ticket, never downgrade.

| ID | Title | Brief steps | Agent | Model | Deps | Parallel-safe with | Status |
|---|---|---|---|---|---|---|---|
| T-001 | Scaffold: FastAPI+SQLAlchemy+Alembic+SQLite(WAL), React+Vite, Makefile (bootstrap/dev/lint/typecheck/test/e2e/verify/seed), CI workflow, e2e harness from e2e/fixtures.ts | 1 | platform | sonnet | none | none (solo, first) | done |
| T-002 | Design tokens: 3 themes as CSS vars on html[data-theme], Oswald+Inter, switcher | 2 | screens | sonnet | T-001 | T-003, T-004 | done |
| T-003 | Auth + teams: register, roles, team create, join code, join flow, minimal token-styled screens (Brief §8: invent nothing) | 3 | platform | sonnet | T-001 | T-002 | done |
| T-004 | Scoped query layer + full schema from doc 03 + Alembic chain from zero + cross-team read test returns nothing | 4, 5 | platform | sonnet | T-001 | T-002 | done |
| T-010 | Seed files: transcribe Bible per doc 03 §4-6 (12 patterns, 8 deliveries, 3 rotations, 6 formations+keystones, rondo 5 zones, 6 archetypes+pass-risk, 4 animated + 2 static ref teams, detail-only slots, cult corner, roles, synergies) | 6 | content-seeder | sonnet | T-004 | T-020 | doing |
| T-011 | Em-dash transform pass + CI copy scan + seed validator (required fields, blurb ≤25 words, banned identity phrases, slot refs resolve) | 7, 8 | content-seeder | sonnet | T-010 | T-020 | todo |
| T-020 | Board core: pitch canvas, landscape model coords, token drag 60fps @23 tokens, portrait mapping (left=y, top=100-x) with lossless round-trip unit test FIRST | 9, 10 | board-engineer | opus | T-001 | T-010 | done |
| T-021 | Lane graph: suggested/confirmed/blocked states, two independent thresholds, live recompute during drag, interception dot | 11, 12 | board-engineer | opus | T-020 | T-011 | done |
| T-022 | Zones + animation player (declarative specs AND raw keyframes, ball waypoints chase bound player) + recorder (all tokens incl. opponents + ball) | 13, 14, 15 | board-engineer | opus | T-021 | none | done |
| T-030 | Whiteboard page (PNG 01-05, 14, 34): toolbar, view menu, record/save into My Patterns | 16 | screens | sonnet | T-022, T-004 | T-031 | doing |
| T-031 | Patterns page (PNG 05-10, 29-31, 15-18, 35): sheet w/ 3 libraries, chips, search, meta bar, details panels | 17 | screens | sonnet | T-022, T-011 | T-030 | todo |
| T-032 | Formations page (PNG 11, 19, 37-39, 43) + keystone pulse/keycards + Rondo Map (PNG 32, 36) | 18 | screens | sonnet | T-031 | T-033 | todo |
| T-033 | Roster page (PNG 12, 20): CRUD, chips, 6 sliders, double-exposure warning coach-only | 19 | screens | sonnet | T-004, T-011 | T-032 | todo |
| T-034 | Identity page (PNG 13, 33, 40-42, 44, 45): 4 scripted animations, 2 static shapes, detail slots, pass-risk, cult corner | 20 | screens | sonnet | T-031 | T-033 | todo |
| T-040 | Role gating UI + API 403 enforcement, permission test suite both roles (Brief §3 table, every row) | 21 | collab | sonnet | T-030..T-034 | T-041 | todo |
| T-041 | Playstyle suggestion flow (PNG 24, 25, 27) | 22 | collab | sonnet | T-033 | T-040 | todo |
| T-042 | Sessions: draft builder + picker w/ thumbnails, send, receipts, player view w/ Watch deep-link + Mark as watched (PNG 21-23, 26, 28) | 23 | collab | sonnet | T-031, T-040 | none | todo |
| T-050 | Phone pass: icon rail, stacked grids, portrait boards all surfaces, cross-device save/replay test | 24 | screens | sonnet | T-030..T-042 | none | todo |
| T-051 | Hardening: full em-dash sweep, permission suite in CI, demo-path e2e (Brief §6 narrative as one Playwright journey, both viewports) | 25 | verifier | sonnet | T-050 | none | todo |
| T-060 | Deploy: Render service (persistent volume), Litestream to object storage, env config, prod Turso decision point, smoke journey vs prod URL | doc 04 §2 | platform | sonnet | T-051 | none | todo |

Sequencing: T-001 solo → (T-002 ∥ T-003 ∥ T-004) → (T-010/011 ∥ T-020/021/022) → screens fan-out → collab → phone → hardening → deploy.
Board engine (T-020..022) is the critical path and the hardest work: start it immediately after T-001, keep it isolated (Brief §4 Phase 2 note).
