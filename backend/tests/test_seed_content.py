"""T-010 seed content: loads every file under seeds/, checks the Bible
8.2.1/8.2.4 required fields (blurb, animation spec where the type carries
one, roles involved, coaching points, youth takeaway), validates every
animation spec through app.specs.AnimationSpec, and proves scripts/seed.py
is idempotent by running it twice against a fresh DB and diffing table
counts.

Distinct from scripts/validate_seeds.py: that script is the CI gate
(`make check-copy`) and covers the full doc 03 section 8.3 rule set
(banned phrases, pattern-code cross references, formation FKs, ...). This
test suite is the pytest-side proof the ticket's DoD line asks for, and
additionally exercises the real loader/DB path validate_seeds.py never
touches.
"""

from __future__ import annotations

import importlib.util
import json
import pathlib
import re
import subprocess
import sys

import pytest
from pydantic import ValidationError

from app.specs import AnimationSpec

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
SEEDS = REPO_ROOT / "seeds"


def _load(name: str) -> dict:
    return json.loads((SEEDS / name).read_text(encoding="utf-8"))


def _word_count(s: str) -> int:
    return len(re.findall(r"\S+", s))


LIBRARY_ITEM_FILES = ["patterns.json", "deliveries.json", "rotations.json"]
IDENTITY_FILES = [
    "identities_archetypes.json",
    "identities_reference_teams.json",
    "identities_cult_corner.json",
]


def test_validate_seeds_script_passes() -> None:
    """T-011: shells the real CI gate (scripts/validate_seeds.py, also run
    by `make check-copy`) so a validator regression fails `make test` too,
    not only CI. This is deliberately a subprocess call rather than an
    import: it proves the script's own __main__ entry point and exit code
    behave correctly, which an import of its functions would not."""
    result = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "validate_seeds.py")],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"scripts/validate_seeds.py exited {result.returncode}:\n{result.stdout}\n{result.stderr}"
    )
    assert "all checks passed" in result.stdout


def test_seeds_directory_has_every_file_the_ticket_inventory_requires() -> None:
    expected = {
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
    }
    actual = {p.name for p in SEEDS.glob("*.json")}
    assert expected <= actual


@pytest.mark.parametrize("fname", LIBRARY_ITEM_FILES)
def test_library_items_carry_every_bible_8_2_1_required_field(fname: str) -> None:
    """Bible 8.2.1: "Every concept gets: a one-sentence blurb (<=25 words),
    a numbered animation spec, roles involved, and coaching points, no
    entry ships without all four." Plus 8.2.4's youth takeaway and doc 03
    section 7.7's source_ref."""
    data = _load(fname)
    assert data["items"], f"{fname} has no items"
    for item in data["items"]:
        code = item["code"]
        assert item["blurb"], f"{fname} {code}: missing blurb"
        assert _word_count(item["blurb"]) <= 25, f"{fname} {code}: blurb over 25 words"
        assert item["animation_spec_json"] is not None, f"{fname} {code}: missing animation spec"
        assert item["roles_involved"], f"{fname} {code}: missing roles_involved"
        assert item["coaching_points_json"], f"{fname} {code}: missing coaching_points_json"
        assert item["youth_takeaway"], f"{fname} {code}: missing youth_takeaway"
        assert item["age_hint"], f"{fname} {code}: missing age_hint"
        assert item["source_ref"].startswith("bible:"), f"{fname} {code}: bad source_ref"
        assert item["content_version"], f"{fname} {code}: missing content_version"


@pytest.mark.parametrize("fname", LIBRARY_ITEM_FILES)
def test_library_item_codes_are_unique_within_and_do_not_collide_across_files(fname: str) -> None:
    all_codes: set[str] = set()
    for other in LIBRARY_ITEM_FILES:
        for item in _load(other)["items"]:
            assert item["code"] not in all_codes, f"duplicate code {item['code']} ({other})"
            all_codes.add(item["code"])


def test_patterns_deliveries_rotations_match_the_ticket_inventory_exactly() -> None:
    patterns = {item["code"] for item in _load("patterns.json")["items"]}
    deliveries = {item["code"] for item in _load("deliveries.json")["items"]}
    rotations = {item["code"] for item in _load("rotations.json")["items"]}

    assert patterns == {"A1", "A2", "A3", "A4", "A5", "B3", "B5", "B8", "B9", "C1", "C2", "D1"}
    assert deliveries == {"F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"}
    assert rotations == {"R1", "R12", "R13"}


@pytest.mark.parametrize("fname", IDENTITY_FILES)
def test_identity_entries_carry_the_bible_youth_and_traceability_fields(fname: str) -> None:
    data = _load(fname)
    for item in data["items"]:
        code = item["code"]
        assert item["tag_line"], f"{fname} {code}: missing tag_line"
        assert _word_count(item["tag_line"]) <= 25, f"{fname} {code}: tag_line over 25 words"
        assert item["core_idea"], f"{fname} {code}: missing core_idea"
        assert item["youth_takeaway"], f"{fname} {code}: missing youth_takeaway"
        assert item["source_ref"].startswith("bible:"), f"{fname} {code}: bad source_ref"


def test_identity_copy_never_uses_the_banned_curate_never_lock_phrases() -> None:
    """doc 03 section 7.6 / CLAUDE.md rule 6: identity copy never uses
    'correct', 'right way', or 'off-identity'."""
    banned = ["correct", "right way", "off-identity"]
    for fname in IDENTITY_FILES:
        for item in _load(fname)["items"]:
            for field in ("tag_line", "core_idea", "youth_takeaway"):
                text = (item.get(field) or "").lower()
                for phrase in banned:
                    assert phrase not in text, f"{fname} {item['code']}.{field}: contains '{phrase}'"


def test_no_em_dash_anywhere_in_any_seed_file() -> None:
    """CLAUDE.md rule 3 / doc 03 section 7.1: rewritten editorially in the
    seed source, never a runtime filter. Belt-and-suspenders alongside
    scripts/check_copy.py's CI scan."""
    for path in SEEDS.glob("*.json"):
        assert "—" not in path.read_text(encoding="utf-8"), f"{path.name} contains an em dash"


def _all_animation_specs() -> list[tuple[str, str, dict]]:
    specs: list[tuple[str, str, dict]] = []
    for fname in LIBRARY_ITEM_FILES:
        for item in _load(fname)["items"]:
            specs.append((fname, item["code"], item["animation_spec_json"]))
    for item in _load("identities_reference_teams.json")["items"]:
        if item["signature_animation_spec_json"] is not None:
            specs.append(
                ("identities_reference_teams.json", item["code"], item["signature_animation_spec_json"])
            )
    return specs


def test_every_animation_spec_validates_against_the_animation_spec_model() -> None:
    """doc 03 section 4.1 / section 8 validator rule: "animation slot
    references resolve," enforced by app.specs.AnimationSpec's own
    model_validator. Every pattern, delivery, rotation, and animated
    reference team's spec must parse."""
    specs = _all_animation_specs()
    assert len(specs) == 12 + 8 + 3 + 4  # patterns + deliveries + rotations + animated ref teams
    for fname, code, spec in specs:
        try:
            AnimationSpec.model_validate(spec)
        except ValidationError as exc:  # pragma: no cover - failure path
            pytest.fail(f"{fname} {code}: invalid animation spec: {exc}")


def test_rotations_set_loop_true_and_patterns_deliveries_do_not() -> None:
    """doc 03 section 4.1: "Rotations are the same format with loop: true.""" ""
    for item in _load("rotations.json")["items"]:
        assert item["animation_spec_json"]["loop"] is True, f"rotation {item['code']} must loop"
    for fname in ["patterns.json", "deliveries.json"]:
        for item in _load(fname)["items"]:
            assert item["animation_spec_json"]["loop"] is False, f"{fname} {item['code']} should not loop"


# ---------------------------------------------------------------------------
# Loader idempotency (doc 03 section 7.8 / section 8.4): re-running the
# seeder upgrades library rows in place, in one transaction, without ever
# touching team_id-scoped tables.
# ---------------------------------------------------------------------------


def _import_seed_module():
    spec = importlib.util.spec_from_file_location("pop_seed_script", REPO_ROOT / "scripts" / "seed.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_seed_loader_is_idempotent_and_never_touches_team_tables() -> None:
    seed = _import_seed_module()

    from app.db import SessionLocal
    from app.models import (
        Formation,
        FormationKeystone,
        Identity,
        LibraryItem,
        PositionCode,
        Role,
        RoleClash,
        RoleSynergy,
        RondoZone,
        Team,
        User,
    )

    def table_counts(session) -> dict[str, int]:
        return {
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

    # A team row present before seeding proves the loader never touches
    # team-scoped data: CLAUDE.md rule 4, doc 03 section 1.
    session = SessionLocal()
    sentinel_user = User(
        email="sentinel@example.com", password_hash="x", display_name="Sentinel Coach", role="coach"
    )
    session.add(sentinel_user)
    session.flush()
    sentinel_team = Team(
        name="Sentinel FC",
        colors_json={},
        age_group="U12",
        level="rec",
        join_code="SENT01",
        coach_join_code="SENT02",
        created_by=sentinel_user.id,
    )
    session.add(sentinel_team)
    session.commit()
    sentinel_team_id = sentinel_team.id
    session.close()

    exit_code_1 = seed.main()
    assert exit_code_1 == 0

    session = SessionLocal()
    counts_after_first_run = table_counts(session)
    session.close()

    assert counts_after_first_run == {
        "position_codes": 10,
        "roles": 25,
        "role_synergies": 16,
        "role_clashes": 7,
        "library_items": 23,
        "formations": 6,
        "formation_keystones": 13,
        "rondo_zones": 5,
        "identities": 27,
    }

    exit_code_2 = seed.main()
    assert exit_code_2 == 0

    session = SessionLocal()
    counts_after_second_run = table_counts(session)
    still_one_team = session.query(Team).count()
    team_name_untouched = session.get(Team, sentinel_team_id).name
    session.close()

    assert counts_after_second_run == counts_after_first_run, "re-running the seeder must not duplicate rows"
    assert still_one_team == 1, "the seeder must never touch team-scoped tables"
    assert team_name_untouched == "Sentinel FC"
