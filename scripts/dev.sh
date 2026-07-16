#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

trap 'kill 0' INT TERM

.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 &

# Vite must come up second: Playwright's webServer only watches port 5173,
# so the API has to be ready before the frontend starts answering.
for _ in $(seq 1 150); do
  curl -sf http://127.0.0.1:8000/api/health > /dev/null && break
  sleep 0.2
done

npm --workspace frontend run dev &
wait
