from fastapi import FastAPI

from app.routers import auth, teams

app = FastAPI(title="Patterns of Play API")
app.include_router(auth.router)
app.include_router(teams.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
