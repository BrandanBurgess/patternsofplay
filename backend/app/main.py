from fastapi import FastAPI

app = FastAPI(title="Patterns of Play API")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
