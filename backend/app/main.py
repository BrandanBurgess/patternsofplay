import os
import pathlib

from fastapi import FastAPI, HTTPException, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.routers import (
    auth,
    formations,
    identity,
    library,
    roster,
    sessions,
    suggestions,
    tactics,
    teams,
    whiteboard,
)

app = FastAPI(title="Patterns of Play API")
app.include_router(auth.router)
app.include_router(teams.router)
app.include_router(whiteboard.router)
app.include_router(library.router)
app.include_router(roster.router)
app.include_router(suggestions.router)
app.include_router(formations.router)
app.include_router(identity.router)
app.include_router(sessions.router)
app.include_router(tactics.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Single-origin serving for deployment (T-060).
#
# In development, Vite serves the SPA on its own port and proxies /api to this
# process (frontend/vite.config.ts). In a deployed environment there is one
# process and one origin: this app serves the built SPA alongside the API.
#
# One origin is not just tidiness, it is what makes the session cookie work as
# written. The cookie is SameSite=Lax and host-only (app/routers/auth.py), and
# frontend/src/api.ts fetches relative "/api/..." paths with no CORS setup and
# no credentials mode. Splitting the SPA onto a second origin would mean a
# cross-site cookie, SameSite=None, an allow-list, and a credentials flag on
# every fetch. Serving both from here means none of that exists.
#
# The whole block is conditional on the build output actually being present,
# so a dev checkout and the test suite (which never build the SPA) behave
# exactly as they did before: API only, no catch-all route registered.
# ---------------------------------------------------------------------------

_DIST_OVERRIDE = os.environ.get("POP_FRONTEND_DIST")
FRONTEND_DIST = (
    pathlib.Path(_DIST_OVERRIDE)
    if _DIST_OVERRIDE
    else pathlib.Path(__file__).resolve().parents[2] / "frontend" / "dist"
)

if FRONTEND_DIST.is_dir():
    _DIST_ROOT = FRONTEND_DIST.resolve()
    _ASSETS = _DIST_ROOT / "assets"
    if _ASSETS.is_dir():
        # Vite emits content-hashed filenames under /assets, so these are the
        # one set of files safe to serve as immutable static content.
        app.mount("/assets", StaticFiles(directory=_ASSETS), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str) -> FileResponse:
        """SPA fallback: a real file if one matches, index.html otherwise.

        Registered LAST so every API route above wins on the same path, and
        /api/* is refused explicitly rather than falling through: an unknown
        API path must stay a JSON 404, not silently return the HTML shell,
        which would turn a typo'd endpoint into a confusing parse error on
        the client instead of an obvious 404.
        """
        if full_path.startswith("api/"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
        if full_path:
            candidate = (_DIST_ROOT / full_path).resolve()
            # is_relative_to pins the lookup inside the build output: a
            # traversal like "../../etc/passwd" resolves outside it and falls
            # through to index.html instead of being served.
            if candidate.is_relative_to(_DIST_ROOT) and candidate.is_file():
                return FileResponse(candidate)
        return FileResponse(_DIST_ROOT / "index.html")
