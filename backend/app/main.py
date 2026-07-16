from fastapi import FastAPI

from app.routers import auth, library, roster, teams, whiteboard

app = FastAPI(title="Patterns of Play API")
app.include_router(auth.router)
app.include_router(teams.router)
app.include_router(whiteboard.router)
app.include_router(library.router)
app.include_router(roster.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
