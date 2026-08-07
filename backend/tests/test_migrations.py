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

import json
import pathlib
import tempfile

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

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


def _insert_formation_433(conn) -> None:
    """Minimal valid formations row (revision 0002's shape), enough to
    satisfy rondo_zones.formation_code's FK without pulling in the real
    seed content this ticket does not own."""
    conn.execute(
        text(
            "INSERT INTO formations "
            "(code, name, shape_blurb, strengths_json, vulnerabilities_json, "
            "natural_identities, positions_json, source_ref, content_version) "
            "VALUES (:code, :name, :shape_blurb, :strengths_json, "
            ":vulnerabilities_json, :natural_identities, :positions_json, "
            ":source_ref, :content_version)"
        ),
        {
            "code": "433",
            "name": "4-3-3",
            "shape_blurb": "test",
            "strengths_json": json.dumps([]),
            "vulnerabilities_json": json.dumps([]),
            "natural_identities": json.dumps([]),
            "positions_json": json.dumps([]),
            "source_ref": "bible:test",
            "content_version": "1.0.0",
        },
    )


def _insert_pre_0006_flank_corridor_row(conn) -> None:
    """A rondo_zones row in the exact pre-migration-0006 shape (no
    canonical_rondo/zone_kind/radius columns yet), standing in for a real
    deploy's already-seeded 4-3-3 flank_corridor row (seeds/
    rondo_zones.json) before this ticket's data migration runs."""
    conn.execute(
        text(
            "INSERT INTO rondo_zones "
            "(formation_code, zone_key, polygon_json, rondo_name, teaches, "
            "trains_pattern_codes, source_ref, content_version) "
            "VALUES (:formation_code, :zone_key, :polygon_json, :rondo_name, "
            ":teaches, :trains_pattern_codes, :source_ref, :content_version)"
        ),
        {
            "formation_code": "433",
            "zone_key": "flank_corridor",
            "polygon_json": json.dumps(
                [{"x": 20, "y": 75}, {"x": 90, "y": 75}, {"x": 90, "y": 100}, {"x": 20, "y": 100}]
            ),
            "rondo_name": "2v1 to 2v2 (the flank corridor)",
            "teaches": "Winger and fullback against their fullback.",
            "trains_pattern_codes": json.dumps(["A1", "A2", "F1"]),
            "source_ref": "bible:3G.2",
            "content_version": "1.0.0",
        },
    )


def test_flank_corridor_row_split_upgrades_an_existing_populated_db(fresh_db_url: str) -> None:
    """Platform DoD: the migration chain must upgrade an existing
    POPULATED DB cleanly, not just build a fresh one. Builds a DB up to
    0005 (pre-Tactics-Lab), inserts a formations row and a rondo_zones row
    in the exact shape a real, already-seeded deploy would have, then
    upgrades to head (0006) and proves the data migration actually ran:
    the single flank_corridor row becomes flank_corridor_left (mirrored
    across y=50) and flank_corridor_right (the original polygon,
    unchanged), both carrying the original row's rondo_name, teaches,
    trains_pattern_codes, source_ref and content_version untouched, and
    the original flank_corridor row is gone."""
    cfg = _alembic_config()
    command.upgrade(cfg, "0005")

    engine = create_engine(fresh_db_url)
    with engine.begin() as conn:
        _insert_formation_433(conn)
        _insert_pre_0006_flank_corridor_row(conn)
    engine.dispose()

    command.upgrade(cfg, "head")

    engine = create_engine(fresh_db_url)
    with engine.connect() as conn:
        rows = {
            row.zone_key: row
            for row in conn.execute(
                text(
                    "SELECT zone_key, polygon_json, rondo_name, teaches, "
                    "trains_pattern_codes, source_ref, content_version, "
                    "canonical_rondo, zone_kind, radius "
                    "FROM rondo_zones WHERE formation_code = '433'"
                )
            ).fetchall()
        }
    engine.dispose()

    assert "flank_corridor" not in rows
    assert set(rows) >= {"flank_corridor_left", "flank_corridor_right"}

    right = rows["flank_corridor_right"]
    assert json.loads(right.polygon_json) == [
        {"x": 20, "y": 75}, {"x": 90, "y": 75}, {"x": 90, "y": 100}, {"x": 20, "y": 100},
    ]

    left = rows["flank_corridor_left"]
    assert json.loads(left.polygon_json) == [
        {"x": 20, "y": 25}, {"x": 90, "y": 25}, {"x": 90, "y": 0}, {"x": 20, "y": 0},
    ]

    for zone_key in ("flank_corridor_left", "flank_corridor_right"):
        row = rows[zone_key]
        assert row.rondo_name == "2v1 to 2v2 (the flank corridor)"
        assert row.teaches == "Winger and fullback against their fullback."
        assert json.loads(row.trains_pattern_codes) == ["A1", "A2", "F1"]
        assert row.source_ref == "bible:3G.2"
        assert row.content_version == "1.0.0"
        assert row.zone_kind == "polygon"
        assert row.canonical_rondo is None
        assert row.radius is None


def test_flank_corridor_row_split_downgrades_back_to_one_row(fresh_db_url: str) -> None:
    """The reverse of the split test above: upgrading to head then
    downgrading all the way back to 0005 must merge flank_corridor_left
    and flank_corridor_right back into a single flank_corridor row (using
    the _right side's polygon, the one that existed pre-migration) and
    must drop the three new rondo_zones columns."""
    cfg = _alembic_config()
    command.upgrade(cfg, "0005")

    engine = create_engine(fresh_db_url)
    with engine.begin() as conn:
        _insert_formation_433(conn)
        _insert_pre_0006_flank_corridor_row(conn)
    engine.dispose()

    command.upgrade(cfg, "head")
    command.downgrade(cfg, "0005")

    engine = create_engine(fresh_db_url)
    with engine.connect() as conn:
        columns = {c["name"] for c in inspect(engine).get_columns("rondo_zones")}
        rows = conn.execute(
            text(
                "SELECT zone_key, polygon_json, rondo_name, teaches, "
                "trains_pattern_codes, source_ref, content_version "
                "FROM rondo_zones WHERE formation_code = '433'"
            )
        ).fetchall()
    engine.dispose()

    assert columns == {
        "formation_code", "zone_key", "polygon_json", "rondo_name", "teaches",
        "trains_pattern_codes", "source_ref", "content_version",
    }

    by_key = {row.zone_key: row for row in rows}
    assert set(by_key) == {"flank_corridor"}
    merged = by_key["flank_corridor"]
    assert json.loads(merged.polygon_json) == [
        {"x": 20, "y": 75}, {"x": 90, "y": 75}, {"x": 90, "y": 100}, {"x": 20, "y": 100},
    ]
    assert merged.rondo_name == "2v1 to 2v2 (the flank corridor)"
    assert merged.teaches == "Winger and fullback against their fullback."
    assert json.loads(merged.trains_pattern_codes) == ["A1", "A2", "F1"]
    assert merged.source_ref == "bible:3G.2"
    assert merged.content_version == "1.0.0"
