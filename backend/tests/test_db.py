from sqlalchemy import text

from app.db import engine


def test_wal_mode_enabled() -> None:
    with engine.connect() as conn:
        mode = conn.execute(text("PRAGMA journal_mode")).scalar_one()
    assert str(mode).lower() == "wal"
