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

# Load/upgrade library content (roles, role_clashes, formations, ...) so
# any screen reading seeded data (T-033 Roster: role picker, the
# double-exposure warning copy) works against a freshly migrated dev or
# e2e database, not just one someone happened to run `make seed` against
# by hand. Idempotent upsert by natural key (scripts/seed.py), never
# touches team-scoped tables, safe to run on every dev/e2e boot.
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
