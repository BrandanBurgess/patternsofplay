#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

trap 'kill 0' INT TERM

# Ports are overridable so parallel ticket worktrees never collide.
API_PORT="${POP_API_PORT:-8000}"
WEB_PORT="${POP_WEB_PORT:-5173}"
export POP_API_PORT="$API_PORT"
export POP_WEB_PORT="$WEB_PORT"

.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port "$API_PORT" &

# Vite must come up second: Playwright's webServer only watches the web port,
# so the API has to be ready before the frontend starts answering.
for _ in $(seq 1 150); do
  curl -sf "http://127.0.0.1:$API_PORT/api/health" > /dev/null && break
  sleep 0.2
done

npm --workspace frontend run dev &
wait
