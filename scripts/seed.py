#!/usr/bin/env python3
"""Seed loader (doc 03 section 8.4): loads or upgrades library tables from
seeds/*.json inside one transaction. Idempotent, keyed by each table's
natural key (usually `code`, per doc 03 section 7.8's source_ref/
content_version traceability), so re-running upgrades existing rows in
place instead of duplicating them. Library-world tables only: nothing here
ever touches a team_id-scoped table (CLAUDE.md rule 4, doc 03 section 1).
"""

from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEEDS = ROOT / "seeds"
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

import app.models  # noqa: E402  (registers every table on Base.metadata)
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.models import (  # noqa: E402
    Formation,
    FormationKeystone,
    Identity,
    LibraryItem,
    PositionCode,
    Role,
    RoleClash,
    RoleSynergy,
    RondoZone,
)

# table name (matches each seed file's top-level "table") -> (model class,
# natural key fields, extra fields injected from the file's own top-level
# keys onto every item before upsert).
TABLE_CONFIG: dict[str, tuple[type, list[str], list[str]]] = {
    "position_codes": (PositionCode, ["code"], []),
    "roles": (Role, ["code"], []),
    "role_synergies": (RoleSynergy, ["code"], ["kind"]),
    "role_clashes": (RoleClash, ["code"], ["kind"]),
    "library_items": (LibraryItem, ["code"], ["item_type"]),
    "formations": (Formation, ["code"], []),
    "formation_keystones": (FormationKeystone, ["formation_code", "slot"], []),
    "rondo_zones": (RondoZone, ["formation_code", "zone_key"], []),
    "identities": (Identity, ["code"], ["kind"]),
}


def natural_key_filter(model: type, key_fields: list[str], item: dict) -> dict:
    return {field: item[field] for field in key_fields}


def upsert(session, model: type, key_fields: list[str], extra_fields: list[str], file_data: dict) -> tuple[int, int]:
    inserted = 0
    updated = 0
    for item in file_data["items"]:
        row = dict(item)
        for extra in extra_fields:
            row.setdefault(extra, file_data.get(extra))

        key = natural_key_filter(model, key_fields, row)
        existing = session.query(model).filter_by(**key).one_or_none()
        if existing is None:
            session.add(model(**row))
            inserted += 1
        else:
            for field, value in row.items():
                setattr(existing, field, value)
            updated += 1
    return inserted, updated


# Explicit load order, not alphabetical: several tables carry a foreign
# key to a row seeded by an earlier file (formation_keystones/rondo_zones/
# identities -> formations, roles -> position_codes), and alphabetical
# order happens to put "formation_keystones.json" before
# "formations.json". Any seed file not listed here loads last, sorted.
LOAD_ORDER = [
    "position_codes.json",
    "roles.json",
    "role_synergies.json",
    "role_clashes.json",
    "patterns.json",
    "deliveries.json",
    "rotations.json",
    "formations.json",
    "formation_keystones.json",
    "rondo_zones.json",
    "identities_archetypes.json",
    "identities_reference_teams.json",
    "identities_cult_corner.json",
]


def ordered_seed_files() -> list[pathlib.Path]:
    all_files = sorted(SEEDS.glob("*.json"))
    by_name = {p.name: p for p in all_files}
    ordered = [by_name.pop(name) for name in LOAD_ORDER if name in by_name]
    ordered.extend(sorted(by_name.values()))  # anything unlisted, loaded last
    return ordered


def main() -> int:
    if not SEEDS.exists():
        print("seed: no seeds/ directory, nothing to seed")
        return 0

    files = ordered_seed_files()
    if not files:
        print("seed: no seed files yet")
        return 0

    # Idempotent no-op against an already-migrated DB: only fills in tables
    # that do not exist yet, never alters existing ones. Lets `make seed`
    # run standalone against a scratch DATABASE_URL without first running
    # `make migrate`.
    Base.metadata.create_all(bind=engine)

    session = SessionLocal()
    summary: list[tuple[str, int, int]] = []
    try:
        for path in files:
            data = json.loads(path.read_text(encoding="utf-8"))
            table = data.get("table")
            if table not in TABLE_CONFIG:
                raise ValueError(f"{path.name}: unknown table '{table}' in seed file")
            model, key_fields, extra_fields = TABLE_CONFIG[table]
            inserted, updated = upsert(session, model, key_fields, extra_fields, data)
            summary.append((f"{path.name} -> {table}", inserted, updated))
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

    print("seed: loaded library content (one transaction, idempotent upsert by natural key)")
    for label, inserted, updated in summary:
        print(f"  {label}: {inserted} inserted, {updated} updated")

    # Final table counts, keyed by natural key so counts reflect the
    # unique rows a second run would settle on too.
    session = SessionLocal()
    try:
        counts = {
            "position_codes": session.query(PositionCode).count(),
            "roles": session.query(Role).count(),
            "role_synergies": session.query(RoleSynergy).count(),
            "role_clashes": session.query(RoleClash).count(),
            "library_items": session.query(LibraryItem).count(),
            "formations": session.query(Formation).count(),
            "formation_keystones": session.query(FormationKeystone).count(),
            "rondo_zones": session.query(RondoZone).count(),
            "identities": session.query(Identity).count(),
        }
    finally:
        session.close()

    print("seed: table counts")
    for table, count in counts.items():
        print(f"  {table}: {count}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
