#!/usr/bin/env bash
# Container entry point (T-060). Mirrors scripts/dev.sh's boot sequence
# (migrate, then seed, then serve) so a deployed instance and a dev checkout
# come up the same way and neither can drift from the other.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8000}"
DATABASE_URL="${DATABASE_URL:-sqlite:///./pop.db}"
export DATABASE_URL

# A deployed instance must not run on the development JWT fallback in
# app/config.py: that secret is in the repository, so anyone could forge a
# session cookie with it. COOKIE_SECURE is the signal that this is a real
# https deployment rather than a local run, so that is where the gate sits.
if [ "${COOKIE_SECURE:-false}" = "true" ] && [ -z "${JWT_SECRET:-}" ]; then
  echo "start: refusing to boot. COOKIE_SECURE=true means a real deployment," >&2
  echo "       so JWT_SECRET must be set to a generated value, not the" >&2
  echo "       development fallback baked into app/config.py." >&2
  exit 1
fi

# SQLite needs its directory to exist before Alembic opens the file. Only
# applies to a sqlite:/// URL; any other backend is the driver's problem.
case "$DATABASE_URL" in
  sqlite:*)
    db_path="${DATABASE_URL#sqlite:///}"
    db_path="${db_path#/}"          # sqlite://// (absolute) leaves a leading /
    case "$DATABASE_URL" in
      sqlite:////*) db_path="/$db_path" ;;
    esac
    mkdir -p "$(dirname "$db_path")"
    echo "start: database at $db_path"
    ;;
esac

echo "start: migrating to head"
alembic -c backend/alembic.ini upgrade head

# Library content (patterns, formations, identities, roles): idempotent
# upsert by natural key, team tables untouched. Same reasoning as dev.sh:
# a fresh disk would otherwise serve empty libraries.
echo "start: seeding library content"
python scripts/seed.py

# The demo team. Opt-in, because it writes team-world rows and a real
# deployment for a real club would not want them. It is idempotent, so on a
# persistent disk it refreshes the demo account in place on every boot
# (including resetting its password) without touching anything a coach has
# created since.
if [ "${POP_SEED_DEMO:-false}" = "true" ]; then
  echo "start: seeding the demo team"
  python scripts/seed_demo.py
fi

echo "start: serving on 0.0.0.0:$PORT"
exec uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port "$PORT"
