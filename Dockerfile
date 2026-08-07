# Deployment image (T-060): one container, one origin, SPA plus API.
#
# Stage 1 builds the SPA with the exact lockfile the repo pins. Stage 2 is the
# runtime: Python, the backend package, the seed data, and the built SPA. Node
# does not ship in the final image.

# ---------------------------------------------------------------------------
# Stage 1: build the SPA
# ---------------------------------------------------------------------------
FROM node:22-slim AS web

WORKDIR /build

# Workspace manifests first, so a dependency-only change is the only thing
# that busts the npm layer cache.
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
RUN npm ci --no-audit --no-fund

COPY frontend/ ./frontend/
# `npm run build` is `tsc --noEmit && vite build`: the deployed bundle is
# built by the same command that has to typecheck clean, so a type error
# fails the image rather than shipping.
RUN npm --workspace frontend run build

# ---------------------------------------------------------------------------
# Stage 2: runtime
# ---------------------------------------------------------------------------
FROM python:3.13-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# The backend package (no dev extras: no pytest, ruff or mypy in the image).
COPY backend/pyproject.toml ./backend/pyproject.toml
COPY backend/app ./backend/app
RUN pip install --no-cache-dir ./backend

# Everything the boot sequence needs: the migration chain, the seed loaders,
# and the seed files themselves.
COPY backend/alembic.ini ./backend/alembic.ini
COPY backend/migrations ./backend/migrations
COPY scripts ./scripts
COPY seeds ./seeds

COPY --from=web /build/frontend/dist ./frontend/dist

# Where the SQLite file lives. Overridden by DATABASE_URL in the service
# config; the default points at the mount path a persistent disk would use,
# so attaching one later needs no image change.
ENV DATABASE_URL=sqlite:////data/pop.db \
    POP_FRONTEND_DIST=/app/frontend/dist \
    COOKIE_SECURE=true \
    PORT=8000

EXPOSE 8000

# alembic.ini's script_location is relative to the process working directory,
# and app/db.py resolves a relative sqlite path the same way, so the entry
# point runs from /app exactly as scripts/dev.sh runs from the repo root.
CMD ["bash", "scripts/start.sh"]
