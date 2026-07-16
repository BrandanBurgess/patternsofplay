# Patterns of Play, Tech Stack Decision Note
### The FastAPI decision and the rest of the stack, for the implementation planning agent
**Version:** 1.0. Status: decided by the founder; treat as settled unless a hard blocker appears.

---

## 1. Backend framework: FastAPI (decided)

The founder originally prototyped with Flask and has decided to standardize on **FastAPI** for this build. Rationale, so the implementer understands the intent rather than just the instruction:

1. **Payload validation is the real work here.** The app's core objects are structured JSON: animation specs with slots, steps, and bound ball waypoints; keyframe recordings; board snapshots with lanes and thresholds; session bundles. FastAPI's Pydantic models validate these at the boundary for free, which prevents silently malformed patterns, the single most likely data-corruption bug in this product. Define Pydantic schemas for `animation_spec_json`, `keyframes_json`, and `board_snapshot_json` and reuse them in the seed validator.
2. **Auto-generated OpenAPI docs** give the frontend subagent and any future developer a live contract with zero effort.
3. **Async-native (Starlette/Uvicorn)** costs nothing now and covers future concurrent load (many players opening a sent session at once) and any later real-time features.
4. **Python is a strategic bet, not a prototype convenience.** Deferred phases (fit engine v2, formation matchups, eventually video analysis) benefit directly from the Python ecosystem. Choosing FastAPI keeps one language from pilot through those phases with no rewrite.
5. **It scales past the pilot.** The framework will not be the bottleneck; the database engine and server size will be, and both are swappable without touching application code (Section 3).

Implication for the implementer: do not carry over Flask patterns. Use FastAPI dependency injection for auth and team scoping (a dependency that resolves the current user, their team, and their `role_on_team`, applied to every route), Pydantic v2 models for every request and response, and routers per domain (auth, roster, board, library, sessions).

## 2. The rest of the stack (decided)

- **ORM and migrations:** SQLAlchemy 2.x plus Alembic from day one, even on SQLite. This is what makes the later Postgres move a config change plus a data migration instead of a rewrite. No raw SQLite-specific SQL anywhere.
- **Database:** SQLite, single shared file, `team_id` scoping on every team-data table. Chosen over file-per-tenant because: pilot scale is dozens of teams, not thousands; the Phase 2 club layer needs cross-team queries, which a shared file makes trivial; operations stay one-file simple. Enable WAL mode. Enforce scoping in one query layer, not in route handlers.
- **Backup:** Litestream replicating the SQLite file to object storage from the first pilot deploy. A pilot club's playbook must survive a redeploy. Host must provide a persistent volume.
- **Frontend:** React with Vite. Board rendering on SVG or canvas at the implementer's discretion, with two constraints: the animation player and the recorder share one coordinate and timing model, and playback holds 60fps with 23 tokens on a mid-range laptop. All theming via the design token CSS variables; no component-level color values.
- **Deployment:** one small instance on a persistent-volume PaaS (Fly.io, Railway, or Render), FastAPI serving the built frontend as static files, or a static host in front of the API; either is acceptable at pilot scale. Environment-driven config (`DATABASE_URL` etc.) so the future Postgres switch is a deploy change.
- **Auth:** simple session or JWT auth with the two roles; structure checks so a `club_admin` role slots in later without rework.

## 3. The scaling path (so nobody over-engineers now)

Pilot: SQLite + Litestream on one small instance. Growth: swap `DATABASE_URL` to managed Postgres (Neon, Supabase, RDS), run Alembic migrations, migrate data; add Uvicorn workers or a bigger instance. Nothing in the application layer changes. Do not add caching layers, queues, or microservices in this build; the only scalability work permitted now is the ORM discipline and config hygiene above, which cost nothing.

## 4. Non-functional priorities, in order

1. Board smoothness and animation quality (the demo is the pitch).
2. Data safety (Litestream, migrations, validated payloads).
3. Permission correctness (API-enforced, tested in both roles).
4. Fast cold load on a phone over club-field Wi-Fi (code-split the board bundle if needed).
5. Horizontal scalability: explicitly not a priority in this build.
