#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

trap 'kill 0' INT TERM

# Ports are overridable so parallel ticket worktrees never collide.
API_PORT="${POP_API_PORT:-8000}"
WEB_PORT="${POP_WEB_PORT:-5173}"
export POP_API_PORT="$API_PORT"
export POP_WEB_PORT="$WEB_PORT"

# Bring the schema up to head before serving. Invoked from the repo root
# (not backend/) on purpose: alembic.ini's script_location is relative to
# the process cwd, and uvicorn below also resolves a relative
# DATABASE_URL relative to this same repo-root cwd (--app-dir only
# changes uvicorn's Python import path, not its working directory). Both
# must agree on cwd or they silently talk to two different SQLite files.
.venv/bin/alembic -c backend/alembic.ini upgrade head

# Seed library content (patterns/deliveries/rotations/formations/identities,
# roles, role_clashes: the T-010 loader) on every boot, not just once by
# hand. Run from this same repo-root cwd so scripts/seed.py resolves
# DATABASE_URL the exact same way alembic and uvicorn just did above, and
# lands in the same SQLite file rather than a second one. The loader is
# idempotent (upsert by natural key, doc 03 section 8.4) and never touches
# team-scoped tables, so reseeding on every dev/e2e boot is safe and cheap,
# and it is what makes a screens ticket's e2e journey (T-031 Patterns
# browsing library_items, T-033 Roster's role picker and warning copy) pass
# on a FRESH database: CI's ci.yml points DATABASE_URL at a brand-new
# sqlite file and never calls `make seed` itself, so without this line the
# library tables are empty on every fresh checkout and in CI, even though a
# hand-seeded local dev.db hides it.
.venv/bin/python scripts/seed.py

.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port "$API_PORT" &

# Vite must come up second: Playwright's webServer only watches the web port,
# so the API has to be ready before the frontend starts answering.
for _ in $(seq 1 150); do
  curl -sf "http://127.0.0.1:$API_PORT/api/health" > /dev/null && break
  sleep 0.2
done

npm --workspace frontend run dev &
wait
