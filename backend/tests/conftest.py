"""Test isolation: point DATABASE_URL at a throwaway file before any
`app.*` module is imported (pytest loads conftest.py in a directory before
the test modules in it), then reset schema between tests.

Deliberately not sqlite:///:memory: - SQLAlchemy's default pool opens a
fresh connection per checkout, and an in-memory DB is per-connection, so
the app and a test's assertions would not see the same database.
"""

import os
import pathlib
import tempfile

import pytest

_TEST_DB_DIR = pathlib.Path(tempfile.mkdtemp(prefix="pop-test-db-"))
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_DIR / 'test.db'}"
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-prod-but-32-bytes-long")

import app.models  # noqa: E402,F401  (must follow the DATABASE_URL env write above)
from app.db import Base, engine  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_schema() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
