"""Platform DoD (Brief section 5): "Alembic migration chain builds a fresh
DB from zero." Proves the whole chain (0001 -> 0002 -> ...) runs against a
brand new, empty SQLite file with no manual setup, that every table the
models declare actually exists afterward, and that the chain downgrades
cleanly back to nothing. Runs the real alembic Config/command API, not a
subprocess, against a throwaway file distinct from the app's own test DB
(conftest.py's _reset_schema uses create_all/drop_all directly and would
not exercise the migration chain at all).

migrations/env.py resolves its DB target from the DATABASE_URL env var
unconditionally (doc 04 section 2: "environment-driven config"), not from
whatever a caller passes into Config.set_main_option, so these tests point
DATABASE_URL itself at the throwaway file rather than fighting that
design.
"""

import pathlib
import tempfile

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.db import Base

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]


def _alembic_config() -> Config:
    cfg = Config(str(REPO_ROOT / "backend" / "alembic.ini"))
    # alembic.ini's script_location ("backend/migrations") is relative to
    # the process cwd (see the comment in that file); pin it to an
    # absolute path so this test does not depend on pytest's cwd.
    cfg.set_main_option("script_location", str(REPO_ROOT / "backend" / "migrations"))
    return cfg


@pytest.fixture
def fresh_db_url(monkeypatch: pytest.MonkeyPatch) -> str:
    with tempfile.TemporaryDirectory() as tmp:
        db_path = pathlib.Path(tmp) / "fresh.db"
        assert not db_path.exists()
        url = f"sqlite:///{db_path}"
        monkeypatch.setenv("DATABASE_URL", url)
        yield url


def test_fresh_db_builds_from_zero_via_the_full_migration_chain(fresh_db_url: str) -> None:
    cfg = _alembic_config()

    command.upgrade(cfg, "head")

    engine = create_engine(fresh_db_url)
    actual_tables = set(inspect(engine).get_table_names())
    expected_tables = set(Base.metadata.tables.keys())

    # Every table the ORM models declare exists after a from-zero
    # upgrade: the migration chain and the models are not out of sync.
    assert expected_tables <= actual_tables
    engine.dispose()


def test_migration_chain_downgrades_cleanly_to_nothing(fresh_db_url: str) -> None:
    cfg = _alembic_config()

    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")

    engine = create_engine(fresh_db_url)
    remaining = [
        name for name in inspect(engine).get_table_names() if not name.startswith("alembic_")
    ]
    assert remaining == []
    engine.dispose()


def test_migration_chain_has_no_gaps_or_branches() -> None:
    """A from-zero build only works if there is exactly one head and an
    unbroken revision chain; this fails loudly if a future migration is
    added with the wrong down_revision."""
    from alembic.script import ScriptDirectory

    cfg = Config(str(REPO_ROOT / "backend" / "alembic.ini"))
    cfg.set_main_option("script_location", str(REPO_ROOT / "backend" / "migrations"))
    script = ScriptDirectory.from_config(cfg)

    heads = script.get_heads()
    assert len(heads) == 1, f"expected exactly one migration head, found {heads}"
