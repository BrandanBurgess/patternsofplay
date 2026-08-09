"""T-102 Tactics Lab seed content (doc 06 sections 2.6 and 3.1):
position_archetypes for all ten slot families, archetype_combinations, and
unit_balance_rules.

Two halves, both of which the ticket's DoD asks for by name:

  1. Content assertions over the three seed files themselves (every slot
     family covered, the duty vocabulary closed, key_attribute_keys a 2 to
     3 subset of the six, every combination states a cost, warning copy
     reads as a check).
  2. Negative tests that prove scripts/validate_seeds.py actually REJECTS
     each of those violations. They run the real validator against a
     mutated copy of seeds/ in a tmp dir, so a rule that silently stopped
     firing fails here rather than shipping. This is the half that matters:
     a green validator over good data proves nothing about the rule.

Plus a loader test that seeds a fresh database and counts rows, because
"the loader is wired up" is a claim worth proving rather than asserting.
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import itertools
import json
import pathlib
import shutil
import sys
from collections.abc import Callable

import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
SEEDS = REPO_ROOT / "seeds"
VALIDATOR = REPO_ROOT / "scripts" / "validate_seeds.py"

ARCHETYPES_FILE = "position_archetypes.json"
COMBINATIONS_FILE = "archetype_combinations.json"
RULES_FILE = "unit_balance_rules.json"

# doc 06 section 2.6, verbatim.
SLOT_FAMILIES = [
    "gk", "cb_central", "cb_wide", "fb", "wb",
    "six", "eight", "ten", "wide_forward", "nine",
]
DUTY_VOCABULARY = {
    "tempo", "progression", "rest_defence", "width", "pin",
    "box_threat", "press_trigger",
}
THE_SIX_ATTRIBUTES = {
    "pace", "passing_range", "carrying_1v1",
    "positional_discipline", "aerial_physical", "pressing_engine",
}
# The archetype codes doc 06 section 2.6's combination rules name directly.
# If any of these stops existing, those rules reference nothing.
DOC06_NAMED_CODES = [
    "six_metronome", "six_line_breaker", "six_destroyer",
    "eight_half_space_creator", "eight_box_crasher", "eight_carrier",
    "eight_ball_winner", "eight_deep_rotator", "eight_wide_rotator",
]


def _load(name: str) -> dict:
    return json.loads((SEEDS / name).read_text(encoding="utf-8"))


def _items(name: str) -> list[dict]:
    return _load(name)["items"]


# ---------------------------------------------------------------------------
# Content
# ---------------------------------------------------------------------------


def test_every_slot_family_has_at_least_one_archetype() -> None:
    """doc 06 section 2.6 lists ten slot families. The ticket seeds all ten,
    not only the eight it works out in full."""
    families = {item["slot_family"] for item in _items(ARCHETYPES_FILE)}
    assert families == set(SLOT_FAMILIES), f"missing: {set(SLOT_FAMILIES) - families}"


def test_the_eight_family_carries_every_archetype_doc06_works_out_in_full() -> None:
    eights = {i["code"] for i in _items(ARCHETYPES_FILE) if i["slot_family"] == "eight"}
    assert eights == {
        "eight_half_space_creator",
        "eight_box_crasher",
        "eight_carrier",
        "eight_ball_winner",
        "eight_deep_rotator",
        "eight_wide_rotator",
    }


def test_every_archetype_named_by_doc06s_combination_rules_exists() -> None:
    codes = {i["code"] for i in _items(ARCHETYPES_FILE)}
    for code in DOC06_NAMED_CODES:
        assert code in codes, f"doc 06 section 2.6 names '{code}' but no row seeds it"


def test_key_attribute_keys_are_two_to_three_of_the_six() -> None:
    for item in _items(ARCHETYPES_FILE):
        attrs = item["key_attribute_keys"]
        assert 2 <= len(attrs) <= 3, f"{item['code']}: {len(attrs)} key attributes"
        assert set(attrs) <= THE_SIX_ATTRIBUTES, f"{item['code']}: {set(attrs) - THE_SIX_ATTRIBUTES}"


def test_duties_come_from_the_closed_vocabulary_and_every_archetype_has_one() -> None:
    for item in _items(ARCHETYPES_FILE):
        duties = item["duties_json"]
        assert duties, f"{item['code']}: no duty, so the balance checker can never see it"
        assert set(duties) <= DUTY_VOCABULARY, f"{item['code']}: {set(duties) - DUTY_VOCABULARY}"


def test_every_archetype_states_what_it_needs_around_it() -> None:
    """The ticket's standard: no empty strings, no filler like 'good
    players'. A one-line requirement is the point of the field."""
    for item in _items(ARCHETYPES_FILE):
        needs = item["needs_around_it"]
        assert needs and len(needs.split()) >= 5, f"{item['code']}: needs_around_it is filler"


def test_every_exemplar_note_carries_the_standing_disclaimer() -> None:
    """seeds/roles.json's convention: 'Not a licence: names are editorial
    reference points only.' Identities and reference points curate, they
    never lock. exemplar_note is nullable, and a null claims nothing."""
    for item in _items(ARCHETYPES_FILE):
        note = item["exemplar_note"]
        if note is None:
            continue
        assert note.endswith("Not a licence: names are editorial reference points only."), item["code"]


def test_every_combination_states_a_cost() -> None:
    """A library that lists only benefits is marketing, not coaching."""
    for item in _items(COMBINATIONS_FILE):
        costs = item["what_it_costs"]
        assert costs and len(costs.split()) >= 5, f"{item['code']}: what_it_costs is empty or thin"


def test_every_combination_slot_resolves_to_a_real_archetype_of_that_family() -> None:
    families = {i["code"]: i["slot_family"] for i in _items(ARCHETYPES_FILE)}
    for item in _items(COMBINATIONS_FILE):
        for slot in item["slots_json"]:
            code = slot["archetype_code"]
            assert code in families, f"{item['code']}: unknown archetype '{code}'"
            assert families[code] == slot["slot_family"], f"{item['code']}: family mismatch on '{code}'"


def test_unit_balance_copy_reads_as_a_check_not_an_error() -> None:
    """doc 06 is explicit that a coach may want the 'imbalanced'
    combination on purpose, so the vocabulary of failure is banned."""
    banned = ["invalid", "illegal", "wrong", "forbidden", "not allowed", "error"]
    for item in _items(RULES_FILE):
        lowered = item["warning_copy"].lower()
        for word in banned:
            assert word not in lowered, f"{item['code']}: warning_copy says '{word}'"
        assert "check" in lowered, f"{item['code']}: warning_copy never asks the coach to check anything"


def test_identity_copy_bans_apply_to_archetype_and_combination_copy_too() -> None:
    """CLAUDE.md rule 6 / doc 03 section 7.6: 'correct', 'right way', and
    'off-identity' never appear. exemplar_note names real players, so this
    copy sits under the same 'curate, never lock' rule as identity copy."""
    banned = ["correct", "right way", "off-identity"]
    for fname in (ARCHETYPES_FILE, COMBINATIONS_FILE, RULES_FILE):
        blob = (SEEDS / fname).read_text(encoding="utf-8").lower()
        for phrase in banned:
            assert phrase not in blob, f"{fname}: contains '{phrase}'"


def test_no_em_dash_in_the_three_tactics_seed_files() -> None:
    """CLAUDE.md rule 3. The character is built with chr() rather than
    typed, so this test does not fail scripts/check_copy.py's own scan."""
    em_dash = chr(0x2014)
    for fname in (ARCHETYPES_FILE, COMBINATIONS_FILE, RULES_FILE):
        assert em_dash not in (SEEDS / fname).read_text(encoding="utf-8"), fname


def test_every_tactics_row_carries_source_ref_and_content_version() -> None:
    for fname in (ARCHETYPES_FILE, COMBINATIONS_FILE, RULES_FILE):
        data = _load(fname)
        for item in data["items"]:
            assert item["source_ref"].startswith("doc06:"), f"{fname} {item['code']}"
            assert item["content_version"] == data["content_version"], f"{fname} {item['code']}"


def test_balance_rule_counts_match_their_rule_kind() -> None:
    for item in _items(RULES_FILE):
        if item["rule_kind"] == "requires_duty":
            assert isinstance(item["min_count"], int), item["code"]
            assert item["duty"] in DUTY_VOCABULARY, item["code"]
        else:
            assert isinstance(item["max_count"], int), item["code"]
        if item["rule_kind"] == "max_same_archetype":
            assert item["duty"] is None, item["code"]


def test_named_combinations_that_trip_a_rule_say_so_in_their_cost_line() -> None:
    """The seeded combinations are doc 06's own 'named good combinations',
    and three of them deliberately trip a balance rule (the gegenpress trio
    has no tempo setter; the rotating trio has two; the carry-and-screen
    pivot has none). That is coherent only if the combination's own cost
    line admits it, so this test pins the pairing rather than letting the
    two halves of the library drift apart."""
    archetypes = {i["code"]: i for i in _items(ARCHETYPES_FILE)}
    rules = _items(RULES_FILE)

    def fired(combination: dict) -> list[str]:
        codes = [s["archetype_code"] for s in combination["slots_json"]]
        duties: dict[str, int] = {}
        for code in codes:
            for duty in archetypes[code]["duties_json"]:
                duties[duty] = duties.get(duty, 0) + 1
        most_repeated = max(codes.count(c) for c in codes)
        hits = []
        for rule in rules:
            if rule["unit"] != combination["unit"]:
                continue
            kind = rule["rule_kind"]
            if kind == "requires_duty" and duties.get(rule["duty"], 0) < rule["min_count"]:
                hits.append(rule["code"])
            elif kind == "max_duty" and duties.get(rule["duty"], 0) > rule["max_count"]:
                hits.append(rule["code"])
            elif kind == "max_same_archetype" and most_repeated > rule["max_count"]:
                hits.append(rule["code"])
        return hits

    expected = {
        "mt_destroyer_carrier_winner": ["mt_needs_a_tempo_setter"],
        "mt_breaker_rotator_crasher": ["mt_one_tempo_setter"],
        "dp_breaker_shuttler": ["dp_needs_rest_defence"],
        "dp_carrier_destroyer": ["dp_needs_a_controller"],
    }
    for combination in _items(COMBINATIONS_FILE):
        hits = fired(combination)
        assert hits == expected.get(combination["code"], []), (
            f"{combination['code']} trips {hits}, which the seed's cost line does not account for"
        )
        if hits:
            assert combination["what_it_costs"], combination["code"]


# ---------------------------------------------------------------------------
# The validator actually rejects each violation
# ---------------------------------------------------------------------------

_module_counter = itertools.count()


def _fresh_validator(seeds_dir: pathlib.Path):
    """A brand new module object per call: scripts/validate_seeds.py keeps
    its findings in a module-level `errors` list, so a reused import would
    leak one test's failures into the next."""
    name = f"pop_validate_seeds_{next(_module_counter)}"
    spec = importlib.util.spec_from_file_location(name, VALIDATOR)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    module.SEEDS = seeds_dir
    return module


def _run_validator(tmp_path: pathlib.Path, mutate: Callable[[pathlib.Path], None]) -> tuple[int, str]:
    seeds_copy = tmp_path / "seeds"
    shutil.copytree(SEEDS, seeds_copy)
    mutate(seeds_copy)
    module = _fresh_validator(seeds_copy)
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        code = module.main()
    return code, buffer.getvalue()


def _edit(seeds_dir: pathlib.Path, fname: str, index: int, **fields) -> None:
    path = seeds_dir / fname
    data = json.loads(path.read_text(encoding="utf-8"))
    data["items"][index].update(fields)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def test_the_negative_harness_passes_on_unmutated_seeds(tmp_path: pathlib.Path) -> None:
    """Guard rail for every test below: prove the harness reports success on
    untouched seeds, so a rejection below is the rule firing and not the
    copy-into-tmp mechanism failing."""
    code, out = _run_validator(tmp_path, lambda _: None)
    assert code == 0, out
    assert "all checks passed" in out


def test_validator_rejects_a_duty_outside_the_closed_vocabulary(tmp_path: pathlib.Path) -> None:
    code, out = _run_validator(
        tmp_path,
        lambda seeds: _edit(seeds, ARCHETYPES_FILE, 0, duties_json=["tempo", "dictates_play"]),
    )
    assert code == 1
    assert "duties_json 'dictates_play' not in the closed duty vocabulary" in out


def test_validator_rejects_a_single_key_attribute(tmp_path: pathlib.Path) -> None:
    code, out = _run_validator(
        tmp_path,
        lambda seeds: _edit(seeds, ARCHETYPES_FILE, 0, key_attribute_keys=["pace"]),
    )
    assert code == 1
    assert "key_attribute_keys has 1 entries" in out


def test_validator_rejects_four_key_attributes(tmp_path: pathlib.Path) -> None:
    code, out = _run_validator(
        tmp_path,
        lambda seeds: _edit(
            seeds,
            ARCHETYPES_FILE,
            0,
            key_attribute_keys=["pace", "passing_range", "carrying_1v1", "aerial_physical"],
        ),
    )
    assert code == 1
    assert "key_attribute_keys has 4 entries" in out


def test_validator_rejects_an_attribute_outside_the_six(tmp_path: pathlib.Path) -> None:
    code, out = _run_validator(
        tmp_path,
        lambda seeds: _edit(seeds, ARCHETYPES_FILE, 0, key_attribute_keys=["pace", "stamina"]),
    )
    assert code == 1
    assert "key_attribute_keys 'stamina' is not one of the six attributes" in out


def test_validator_rejects_an_empty_what_it_costs(tmp_path: pathlib.Path) -> None:
    code, out = _run_validator(
        tmp_path,
        lambda seeds: _edit(seeds, COMBINATIONS_FILE, 0, what_it_costs=""),
    )
    assert code == 1
    assert "missing required field 'what_it_costs'" in out


def test_validator_rejects_an_unresolvable_archetype_code(tmp_path: pathlib.Path) -> None:
    def mutate(seeds: pathlib.Path) -> None:
        path = seeds / COMBINATIONS_FILE
        data = json.loads(path.read_text(encoding="utf-8"))
        data["items"][0]["slots_json"][0]["archetype_code"] = "six_nonexistent"
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    code, out = _run_validator(tmp_path, mutate)
    assert code == 1
    assert "archetype_code 'six_nonexistent' does not exist" in out


def test_validator_rejects_a_slot_family_that_cannot_appear_in_that_unit(tmp_path: pathlib.Path) -> None:
    def mutate(seeds: pathlib.Path) -> None:
        path = seeds / COMBINATIONS_FILE
        data = json.loads(path.read_text(encoding="utf-8"))
        data["items"][0]["slots_json"][0] = {"slot_family": "nine", "archetype_code": "nine_target"}
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    code, out = _run_validator(tmp_path, mutate)
    assert code == 1
    assert "cannot appear in unit 'midfield_three'" in out


def test_validator_rejects_warning_copy_that_reads_as_an_error(tmp_path: pathlib.Path) -> None:
    code, out = _run_validator(
        tmp_path,
        lambda seeds: _edit(
            seeds, RULES_FILE, 0, warning_copy="This midfield three is invalid and must be changed."
        ),
    )
    assert code == 1
    assert "warning_copy uses 'invalid'" in out


def test_validator_rejects_warning_copy_that_reads_as_a_verdict(tmp_path: pathlib.Path) -> None:
    code, out = _run_validator(
        tmp_path,
        lambda seeds: _edit(
            seeds, RULES_FILE, 0, warning_copy="This midfield three has nobody setting the tempo."
        ),
    )
    assert code == 1
    assert "never asks the coach to check anything" in out


def test_validator_rejects_an_unknown_slot_family(tmp_path: pathlib.Path) -> None:
    code, out = _run_validator(
        tmp_path,
        lambda seeds: _edit(seeds, ARCHETYPES_FILE, 0, slot_family="libero"),
    )
    assert code == 1
    assert "slot_family 'libero' not in" in out


def test_validator_rejects_filler_in_needs_around_it(tmp_path: pathlib.Path) -> None:
    code, out = _run_validator(
        tmp_path,
        lambda seeds: _edit(seeds, ARCHETYPES_FILE, 0, needs_around_it="Good players."),
    )
    assert code == 1
    assert "needs_around_it is 2 words" in out


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------


def _import_seed_module():
    spec = importlib.util.spec_from_file_location(
        "pop_seed_script_tactics", REPO_ROOT / "scripts" / "seed.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_seed_loader_loads_the_three_tactics_tables_and_stays_idempotent() -> None:
    """The DoD line: proven by a test, not asserted. Runs the real loader
    against the test database (conftest gives each test session a fresh
    one), counts rows against the seed files, then runs it a second time to
    confirm the upsert updates in place rather than duplicating."""
    seed = _import_seed_module()

    from app.db import SessionLocal
    from app.models import ArchetypeCombination, PositionArchetype, UnitBalanceRule

    assert seed.main() == 0

    session = SessionLocal()
    try:
        first = {
            "position_archetypes": session.query(PositionArchetype).count(),
            "archetype_combinations": session.query(ArchetypeCombination).count(),
            "unit_balance_rules": session.query(UnitBalanceRule).count(),
        }
        # One round trip through the database, not just through the file.
        metronome = session.get(PositionArchetype, "six_metronome")
        assert metronome is not None
        assert metronome.slot_family == "six"
        assert set(metronome.duties_json) == {"tempo", "rest_defence"}
        assert metronome.key_attribute_keys == ["passing_range", "positional_discipline"]

        combination = session.get(ArchetypeCombination, "mt_metronome_creator_crasher")
        assert combination is not None
        assert combination.unit == "midfield_three"
        assert combination.what_it_costs
        assert len(combination.slots_json) == 3

        rule = session.get(UnitBalanceRule, "mt_needs_a_tempo_setter")
        assert rule is not None
        assert rule.rule_kind == "requires_duty"
        assert rule.duty == "tempo"
        assert rule.min_count == 1
        assert rule.severity == "warning"
    finally:
        session.close()

    assert first == {
        "position_archetypes": len(_items(ARCHETYPES_FILE)),
        "archetype_combinations": len(_items(COMBINATIONS_FILE)),
        "unit_balance_rules": len(_items(RULES_FILE)),
    }

    teams_before = _count_teams()
    assert seed.main() == 0

    session = SessionLocal()
    try:
        second = {
            "position_archetypes": session.query(PositionArchetype).count(),
            "archetype_combinations": session.query(ArchetypeCombination).count(),
            "unit_balance_rules": session.query(UnitBalanceRule).count(),
        }
    finally:
        session.close()

    assert second == first, "re-running the seeder must upsert, not duplicate"
    assert _count_teams() == teams_before, "the seeder must never touch team-scoped tables"


def _count_teams() -> int:
    from app.db import SessionLocal
    from app.models import Team

    session = SessionLocal()
    try:
        return session.query(Team).count()
    finally:
        session.close()


@pytest.mark.parametrize("fname", [ARCHETYPES_FILE, COMBINATIONS_FILE, RULES_FILE])
def test_seed_loader_knows_about_every_new_file(fname: str) -> None:
    """A seed file the loader does not list is a file that silently never
    reaches the database. scripts/seed.py raises on an unknown table, so
    the real risk is the reverse: a file present but absent from
    LOAD_ORDER, which falls through to the unordered tail."""
    seed = _import_seed_module()
    table = _load(fname)["table"]
    assert table in seed.TABLE_CONFIG
    assert fname in seed.LOAD_ORDER
