"""T-110 slot-to-unit crosswalk and the coach-only unit balance evaluation
(doc 06 sections 2.6, 3.1 and 5.3).

Four halves, matching the four things the ticket actually claims:

  1. Seed content. Every formation slot declares a slot_family from doc 06
     section 2.6's ten, and the football in those assignments is asserted
     per formation rather than pattern-matched off the slot id (a 3-4-3's
     wide player is a wing back, a 4-3-3's is a fullback, a back three's
     outer defenders are cb_wide and its middle one cb_central).
  2. Negative validator tests. The validator must REJECT a missing
     slot_family and one outside the ten, proven by running the real
     validator against a mutated copy of seeds/ (the harness convention
     test_tactics_seed_content.py established: a green validator over good
     data proves nothing about the rule).
  3. app/units.py as a pure function, no database. Most importantly: a
     4-3-3 evaluates midfield_three, back_line, front_three and wide_unit
     and does NOT evaluate double_pivot or strike_pair. Firing "this
     double pivot has no tempo setter" at a shape with no double pivot
     would discredit every other warning on the page.
  4. The API surface, including the 403 a player token gets.

Regression guard on the shared seed file: T-103's 33 formation_phases rows
bind to the base formation by slot id, so this ticket adding a FIELD to
each position must not disturb the slot set, the position codes or the
coordinates. Asserted directly below rather than left to the validator.
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
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.main import app
from app.models import Formation, PositionArchetype, UnitBalanceRule
from app.units import (
    SLOT_FAMILY_UNITS,
    UNITS,
    evaluate_unit_balance,
    flank_of,
    unit_membership,
    units_absent,
    units_present,
)

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
SEEDS = REPO_ROOT / "seeds"
VALIDATOR = REPO_ROOT / "scripts" / "validate_seeds.py"

FORMATIONS_FILE = "formations.json"
PHASES_FILE = "formation_phases.json"
ARCHETYPES_FILE = "position_archetypes.json"
RULES_FILE = "unit_balance_rules.json"

# doc 06 section 2.6, verbatim.
SLOT_FAMILIES = {
    "gk", "cb_central", "cb_wide", "fb", "wb",
    "six", "eight", "ten", "wide_forward", "nine",
}


def _load(name: str) -> dict:
    return json.loads((SEEDS / name).read_text(encoding="utf-8"))


def _items(name: str) -> list[dict]:
    return _load(name)["items"]


def _formation(code: str) -> dict:
    return next(f for f in _items(FORMATIONS_FILE) if f["code"] == code)


def _families(code: str) -> dict[str, str]:
    return {p["slot"]: p["slot_family"] for p in _formation(code)["positions_json"]}


# ---------------------------------------------------------------------------
# 1. Seed content
# ---------------------------------------------------------------------------


def test_every_formation_slot_declares_a_family_from_the_ten() -> None:
    for formation in _items(FORMATIONS_FILE):
        positions = formation["positions_json"]
        assert len(positions) == 11, formation["code"]
        for position in positions:
            family = position.get("slot_family")
            assert family in SLOT_FAMILIES, f"{formation['code']}.{position['slot']}: {family}"


def test_every_slot_family_used_by_a_formation_has_archetypes_to_pick_from() -> None:
    """An empty picker is a dead slot in doc 06 section 5.3's panel."""
    seeded = {a["slot_family"] for a in _items(ARCHETYPES_FILE)}
    used = {
        p["slot_family"]
        for f in _items(FORMATIONS_FILE)
        for p in f["positions_json"]
    }
    assert used <= seeded, f"no archetypes for: {sorted(used - seeded)}"


def test_a_back_three_splits_into_wide_and_central_centre_backs() -> None:
    """The reason slot_family is seeded rather than derived: position_code
    is CB for all three, and the outer two do a different job from the
    middle one. T-102's bl_stepping_back_three combination (cb_wide,
    cb_central, cb_wide) only has a home if this is right."""
    for code in ("352", "343", "541"):
        families = _families(code)
        assert families["cb_l"] == "cb_wide", code
        assert families["cb_c"] == "cb_central", code
        assert families["cb_r"] == "cb_wide", code


def test_a_back_four_has_two_central_centre_backs_and_two_fullbacks() -> None:
    for code in ("433", "4231", "442"):
        families = _families(code)
        assert families["cb_l"] == "cb_central", code
        assert families["cb_r"] == "cb_central", code
        assert families["fb_l"] == "fb", code
        assert families["fb_r"] == "fb", code


def test_a_wing_back_shape_seeds_wing_backs_not_fullbacks() -> None:
    """The football the ticket calls out by name: a 3-4-3's wide player is
    a wing back, a 4-3-3's is a fullback, and the two families carry
    genuinely different archetypes (wb_flyer versus fb_inverter)."""
    for code in ("352", "343", "541"):
        families = _families(code)
        assert families["wb_l"] == "wb", code
        assert families["wb_r"] == "wb", code
    assert _families("433")["fb_l"] == "fb"


def test_a_six_and_an_eight_are_told_apart_where_position_code_cannot() -> None:
    """4-3-3: six plus two eights, all three of which position_code calls
    DM/CM/CM. 3-5-2: the middle one holds, the outer two shuttle."""
    four_three_three = _families("433")
    assert four_three_three["six"] == "six"
    assert four_three_three["eight_l"] == "eight"
    assert four_three_three["eight_r"] == "eight"

    three_five_two = _families("352")
    assert three_five_two["cm_c"] == "six"
    assert three_five_two["cm_l"] == "eight"
    assert three_five_two["cm_r"] == "eight"


def test_the_only_ten_in_the_library_is_the_4231s() -> None:
    tens = {
        (f["code"], p["slot"])
        for f in _items(FORMATIONS_FILE)
        for p in f["positions_json"]
        if p["slot_family"] == "ten"
    }
    assert tens == {("4231", "am")}


def test_adding_slot_family_changed_no_slot_id_position_code_or_coordinate() -> None:
    """T-103's 33 formation_phases rows bind to the base formation by slot
    id and are validated against its position codes. This ticket added a
    field; it must not have moved anything."""
    expected = {
        "433": [
            ("gk", "GK", 5, 50), ("cb_l", "CB", 20, 35), ("cb_r", "CB", 20, 65),
            ("fb_l", "FB", 22, 12), ("fb_r", "FB", 22, 88), ("six", "DM", 42, 50),
            ("eight_l", "CM", 55, 30), ("eight_r", "CM", 55, 70),
            ("w_l", "W", 78, 15), ("st", "ST", 85, 50), ("w_r", "W", 78, 85),
        ],
        "541": [
            ("gk", "GK", 5, 50), ("wb_l", "WB", 20, 8), ("cb_l", "CB", 15, 28),
            ("cb_c", "CB", 13, 50), ("cb_r", "CB", 15, 72), ("wb_r", "WB", 20, 92),
            ("cm_l", "CM", 45, 25), ("cm_cl", "CM", 43, 42), ("cm_cr", "CM", 43, 58),
            ("cm_r", "CM", 45, 75), ("st", "ST", 80, 50),
        ],
    }
    for code, rows in expected.items():
        actual = [
            (p["slot"], p["position_code"], p["x"], p["y"])
            for p in _formation(code)["positions_json"]
        ]
        assert actual == rows, code


def test_all_33_phase_rows_still_carry_their_base_formations_slot_set() -> None:
    """The hard validator rule of doc 06 section 3.1, restated here so a
    seed edit that breaks the morph animation fails in `make test` too and
    not only in `make check-copy`."""
    base = {
        f["code"]: {p["slot"]: p["position_code"] for p in f["positions_json"]}
        for f in _items(FORMATIONS_FILE)
    }
    phases = _items(PHASES_FILE)
    assert len(phases) == 33
    for phase in phases:
        key = f"{phase['formation_code']}.{phase['variant_code']}"
        seeded = {p["slot"]: p["position_code"] for p in phase["positions_json"]}
        assert seeded == base[phase["formation_code"]], key


# ---------------------------------------------------------------------------
# 2. Negative validator tests
# ---------------------------------------------------------------------------

_module_counter = itertools.count()


def _fresh_validator(seeds_dir: pathlib.Path):
    """A fresh module object per run: the validator accumulates into a
    module-level `errors` list, so a reused import would leak one test's
    failures into the next."""
    name = f"pop_validate_seeds_t110_{next(_module_counter)}"
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


def _edit_position(seeds_dir: pathlib.Path, formation_code: str, slot: str, **fields) -> None:
    path = seeds_dir / FORMATIONS_FILE
    data = json.loads(path.read_text(encoding="utf-8"))
    formation = next(f for f in data["items"] if f["code"] == formation_code)
    position = next(p for p in formation["positions_json"] if p["slot"] == slot)
    for key, value in fields.items():
        if value is _DROP:
            position.pop(key, None)
        else:
            position[key] = value
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


_DROP = object()


def test_the_negative_harness_passes_on_unmutated_seeds(tmp_path: pathlib.Path) -> None:
    code, out = _run_validator(tmp_path, lambda _: None)
    assert code == 0, out
    assert "all checks passed" in out


def test_validator_rejects_a_missing_slot_family(tmp_path: pathlib.Path) -> None:
    code, out = _run_validator(
        tmp_path,
        lambda seeds: _edit_position(seeds, "433", "six", slot_family=_DROP),
    )
    assert code == 1
    assert "slot 'six' is missing required field 'slot_family'" in out


def test_validator_rejects_a_slot_family_outside_the_ten(tmp_path: pathlib.Path) -> None:
    code, out = _run_validator(
        tmp_path,
        lambda seeds: _edit_position(seeds, "433", "six", slot_family="regista"),
    )
    assert code == 1
    assert "slot_family 'regista' not in" in out


def test_validator_rejects_a_family_no_archetype_belongs_to(tmp_path: pathlib.Path) -> None:
    """Valid vocabulary, empty picker: 'ten' is one of the ten families, so
    the vocabulary check passes, but if no archetype belonged to it the
    4-2-3-1's am would open on an empty list."""

    def mutate(seeds: pathlib.Path) -> None:
        path = seeds / ARCHETYPES_FILE
        data = json.loads(path.read_text(encoding="utf-8"))
        data["items"] = [i for i in data["items"] if i["slot_family"] != "ten"]
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    code, out = _run_validator(tmp_path, mutate)
    assert code == 1
    assert "slot_family 'ten' is used by a formation slot but no" in out


# ---------------------------------------------------------------------------
# 3. app/units.py, pure
# ---------------------------------------------------------------------------


def test_the_crosswalk_covers_every_slot_family_exactly_once() -> None:
    assert set(SLOT_FAMILY_UNITS) == SLOT_FAMILIES
    for family, units in SLOT_FAMILY_UNITS.items():
        assert set(units) <= set(UNITS), family


def test_a_fullback_belongs_to_two_units_at_once() -> None:
    """The reason unit membership is a list and not a lookup: doc 06
    section 2.6 evaluates a fullback in the back line AND on his flank."""
    assert set(SLOT_FAMILY_UNITS["fb"]) == {"back_line", "wide_unit"}
    assert set(SLOT_FAMILY_UNITS["wb"]) == {"back_line", "wide_unit"}


def test_box_midfield_is_reachable_from_no_family() -> None:
    """doc 06 section 2.6 gives box_midfield no framework and T-102
    deliberately seeded it no combinations and no rules. It stays in the
    vocabulary and out of the crosswalk rather than being invented here."""
    assert all("box_midfield" not in units for units in SLOT_FAMILY_UNITS.values())


def test_flank_comes_from_the_coordinate_not_the_slot_id() -> None:
    assert flank_of(12) == "left"
    assert flank_of(88) == "right"
    assert flank_of(50) == "center"


def test_a_433_evaluates_four_units_and_not_a_double_pivot_or_a_strike_pair() -> None:
    """The ticket's headline guarantee. A 4-3-3 has no double pivot and no
    strike pair, so neither may be evaluated: an empty unit would trip
    every requires_duty rule attached to it and shout about a pivot pair
    that does not exist."""
    positions = _formation("433")["positions_json"]
    assert units_present(positions) == [
        "midfield_three",
        "front_three",
        "back_line",
        "wide_unit",
    ]
    absent = units_absent(positions)
    assert "double_pivot" in absent
    assert "strike_pair" in absent
    assert "box_midfield" in absent


@pytest.mark.parametrize(
    ("code", "expected"),
    [
        ("433", {"midfield_three", "front_three", "back_line", "wide_unit"}),
        ("4231", {"double_pivot", "front_three", "back_line", "wide_unit"}),
        ("442", {"double_pivot", "strike_pair", "back_line", "wide_unit"}),
        # 3-5-2: a flank holding only a wing back is not a "fullback plus
        # wide forward" pair, so it is not a wide unit (doc 06 section 2.6).
        ("352", {"midfield_three", "strike_pair", "back_line"}),
        ("343", {"double_pivot", "front_three", "back_line", "wide_unit"}),
        # 5-4-1: a flat midfield four matches no doc 06 unit and a lone
        # striker is not a unit. Recorded as the shape's real gap rather
        # than papered over by inventing a framework doc 06 does not give.
        ("541", {"back_line"}),
    ],
)
def test_unit_membership_per_formation(code: str, expected: set[str]) -> None:
    assert set(units_present(_formation(code)["positions_json"])) == expected


def test_the_wide_unit_occurs_once_per_touchline() -> None:
    instances = [i for i in unit_membership(_formation("343")["positions_json"]) if i.unit == "wide_unit"]
    assert [(i.flank, i.slots) for i in instances] == [
        ("left", ("wb_l", "w_l")),
        ("right", ("wb_r", "w_r")),
    ]


def test_a_back_five_is_a_back_line_of_five_including_the_wing_backs() -> None:
    back = next(i for i in unit_membership(_formation("352")["positions_json"]) if i.unit == "back_line")
    assert back.slots == ("cb_l", "cb_c", "cb_r", "wb_l", "wb_r")


def test_a_flat_442_is_a_strike_pair_not_a_front_three() -> None:
    """Counting {wide_forward, nine} together would call two wide
    midfielders plus two strikers a front four."""
    present = units_present(_formation("442")["positions_json"])
    assert "strike_pair" in present
    assert "front_three" not in present


# --- the evaluator ---------------------------------------------------------


@dataclass
class FakeArchetype:
    code: str
    name: str = "Archetype"
    duties_json: list = field(default_factory=list)


@dataclass
class FakeRule:
    code: str
    unit: str
    rule_kind: str
    duty: str | None = None
    min_count: int | None = None
    max_count: int | None = None
    warning_copy: str = "Check that this is the plan here."
    severity: str = "warning"


_NEEDS_TEMPO = FakeRule(
    code="mt_needs_a_tempo_setter",
    unit="midfield_three",
    rule_kind="requires_duty",
    duty="tempo",
    min_count=1,
)
_ONE_BOX_THREAT = FakeRule(
    code="mt_one_box_threat",
    unit="midfield_three",
    rule_kind="max_duty",
    duty="box_threat",
    max_count=1,
    severity="note",
)
_ONE_OF_EACH = FakeRule(
    code="mt_one_of_each_archetype",
    unit="midfield_three",
    rule_kind="max_same_archetype",
    max_count=1,
    severity="note",
)
_PIVOT_NEEDS_TEMPO = FakeRule(
    code="dp_needs_a_controller",
    unit="double_pivot",
    rule_kind="requires_duty",
    duty="tempo",
    min_count=1,
)

_CRASHER = FakeArchetype("eight_box_crasher", "Box crasher", ["box_threat"])
_CREATOR = FakeArchetype("eight_half_space_creator", "Half-space creator", ["progression"])
_METRONOME = FakeArchetype("six_metronome", "Metronome", ["tempo", "rest_defence"])
_ARCHETYPES = {a.code: a for a in (_CRASHER, _CREATOR, _METRONOME)}

_ALL_RULES = [_NEEDS_TEMPO, _ONE_BOX_THREAT, _ONE_OF_EACH, _PIVOT_NEEDS_TEMPO]


def _evaluate_433(assignments: dict[str, str | None], rules: list | None = None):
    return {
        (e.unit, e.flank): e
        for e in evaluate_unit_balance(
            _formation("433")["positions_json"],
            assignments,
            _ARCHETYPES,  # type: ignore[arg-type]
            rules if rules is not None else _ALL_RULES,  # type: ignore[arg-type]
        )
    }


def test_nothing_assigned_is_silent_and_not_an_error() -> None:
    """doc 06 section 5.3: a coach planning a shape at 11pm does not want
    to fill in a roster first. Every unit still comes back, listed and
    quiet."""
    result = _evaluate_433({})
    assert set(result) == {
        ("midfield_three", None),
        ("front_three", None),
        ("back_line", None),
        ("wide_unit", "left"),
        ("wide_unit", "right"),
    }
    assert all(not e.notes for e in result.values())
    assert all(not e.is_complete for e in result.values())


def test_a_half_assigned_unit_does_not_fire_a_requires_duty_rule() -> None:
    """Half-assigned is unfinished, not imbalanced: the third midfielder
    might still be the metronome the trio is missing."""
    result = _evaluate_433({"six": "eight_half_space_creator", "eight_l": "eight_box_crasher"})
    trio = result[("midfield_three", None)]
    assert trio.is_complete is False
    assert [n.code for n in trio.notes] == []


def test_a_complete_trio_with_no_tempo_setter_fires_the_seeded_check() -> None:
    result = _evaluate_433(
        {
            "six": "eight_half_space_creator",
            "eight_l": "eight_box_crasher",
            "eight_r": "eight_half_space_creator",
        }
    )
    trio = result[("midfield_three", None)]
    assert trio.is_complete is True
    codes = {n.code for n in trio.notes}
    assert "mt_needs_a_tempo_setter" in codes
    # Same archetype twice: the mirror check, and it carries the seeded
    # copy rather than copy composed in code.
    assert "mt_one_of_each_archetype" in codes
    assert all(n.message == "Check that this is the plan here." for n in trio.notes)
    assert {n.severity for n in trio.notes} == {"warning", "note"}


def test_a_max_duty_rule_fires_before_the_unit_is_complete() -> None:
    """max_* rules are monotone: two box crashers already in the trio stay
    two however the third slot is filled, so flagging early is still true."""
    result = _evaluate_433({"eight_l": "eight_box_crasher", "eight_r": "eight_box_crasher"})
    trio = result[("midfield_three", None)]
    assert trio.is_complete is False
    assert "mt_one_box_threat" in {n.code for n in trio.notes}


def test_a_double_pivot_rule_never_fires_on_a_433() -> None:
    """The guarantee restated at the evaluator level: the 4-3-3's three
    central midfielders are a midfield three, so the double pivot rules
    have nothing to run against, complete assignment or not."""
    result = _evaluate_433(
        {
            "six": "six_metronome",
            "eight_l": "eight_half_space_creator",
            "eight_r": "eight_box_crasher",
        }
    )
    assert ("double_pivot", None) not in result
    every_code = {n.code for e in result.values() for n in e.notes}
    assert "dp_needs_a_controller" not in every_code


def test_a_note_carries_the_flank_when_the_unit_has_one() -> None:
    rule = FakeRule(
        code="wu_needs_width",
        unit="wide_unit",
        rule_kind="requires_duty",
        duty="width",
        min_count=1,
    )
    result = _evaluate_433(
        {"fb_l": "eight_half_space_creator", "w_l": "eight_box_crasher"}, rules=[rule]
    )
    left = result[("wide_unit", "left")]
    assert left.is_complete is True
    assert [(n.code, n.flank) for n in left.notes] == [("wu_needs_width", "left")]
    assert not result[("wide_unit", "right")].notes


def test_the_real_seeded_rules_stay_quiet_on_a_balanced_433_midfield() -> None:
    """Against the actual seeded content, not fakes: doc 06 section 2.6's
    'metronome, creator, crasher' is the positional-possession trio and
    should raise no WARNING at all."""
    archetypes = {a["code"]: FakeArchetype(a["code"], a["name"], a["duties_json"]) for a in _items(ARCHETYPES_FILE)}
    rules = [FakeRule(**{k: r[k] for k in ("code", "unit", "rule_kind", "duty", "min_count", "max_count", "warning_copy", "severity")}) for r in _items(RULES_FILE)]
    evaluations = evaluate_unit_balance(
        _formation("433")["positions_json"],
        {
            "six": "six_metronome",
            "eight_l": "eight_half_space_creator",
            "eight_r": "eight_box_crasher",
        },
        archetypes,  # type: ignore[arg-type]
        rules,  # type: ignore[arg-type]
    )
    trio = next(e for e in evaluations if e.unit == "midfield_three")
    assert [n.code for n in trio.notes if n.severity == "warning"] == []


# ---------------------------------------------------------------------------
# 4. The API
# ---------------------------------------------------------------------------


@pytest.fixture
def db() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _register(client: TestClient, *, email: str, role: str, display_name: str = "Test User"):
    return client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery",
            "display_name": display_name,
            "role": role,
        },
    )


def _coach_with_team() -> TestClient:
    c = TestClient(app)
    _register(c, email="coach@example.com", role="coach", display_name="Coach Test")
    c.post("/api/teams", json={"name": "Balance FC"})
    return c


def _player_on_team(coach: TestClient) -> TestClient:
    join_code = coach.get("/api/teams/current").json()["join_code"]
    p = TestClient(app)
    _register(p, email="player@example.com", role="player", display_name="Player Test")
    p.post("/api/teams/join", json={"join_code": join_code})
    return p


@pytest.fixture
def seeded(db: Session) -> None:
    """The real seeded 4-3-3, archetypes and balance rules, loaded straight
    from seeds/ so these tests prove the shipped content rather than a
    hand-built fixture that could drift from it."""
    formation = _formation("433")
    db.add(
        Formation(
            code=formation["code"],
            name=formation["name"],
            shape_blurb=formation["shape_blurb"],
            positions_json=formation["positions_json"],
        )
    )
    for a in _items(ARCHETYPES_FILE):
        db.add(
            PositionArchetype(
                code=a["code"],
                slot_family=a["slot_family"],
                name=a["name"],
                definition=a["definition"],
                key_attribute_keys=a["key_attribute_keys"],
                foot_hint=a.get("foot_hint"),
                awr_default=a["awr_default"],
                dwr_default=a["dwr_default"],
                duties_json=a["duties_json"],
                needs_around_it=a["needs_around_it"],
            )
        )
    for r in _items(RULES_FILE):
        db.add(
            UnitBalanceRule(
                code=r["code"],
                unit=r["unit"],
                rule_kind=r["rule_kind"],
                duty=r.get("duty"),
                min_count=r.get("min_count"),
                max_count=r.get("max_count"),
                warning_copy=r["warning_copy"],
                severity=r["severity"],
            )
        )
    db.commit()


def test_balance_endpoint_is_403_for_a_player_token(seeded: None) -> None:
    """doc 06 section 5.3: unit balance is coach-only "both in the UI and
    at the API". A player gets 403, not an empty list, the same standing
    the roster fit warnings have (CLAUDE.md rule 5)."""
    coach = _coach_with_team()
    player = _player_on_team(coach)
    body = {"slots": [{"slot": "six", "archetype_code": "six_metronome"}]}

    assert coach.post("/api/formations/433/balance", json=body).status_code == 200
    assert player.post("/api/formations/433/balance", json=body).status_code == 403


def test_balance_returns_the_units_a_433_has_and_names_the_ones_it_does_not(seeded: None) -> None:
    coach = _coach_with_team()
    response = coach.post("/api/formations/433/balance", json={"slots": []})
    assert response.status_code == 200
    payload = response.json()

    assert payload["formation_code"] == "433"
    assert [(u["unit"], u["flank"]) for u in payload["units"]] == [
        ("midfield_three", None),
        ("front_three", None),
        ("back_line", None),
        ("wide_unit", "left"),
        ("wide_unit", "right"),
    ]
    assert "double_pivot" in payload["units_not_evaluated"]
    assert "strike_pair" in payload["units_not_evaluated"]
    # Empty roster / nothing assigned is a first-class 200, and silent.
    assert all(u["notes"] == [] for u in payload["units"])


def test_balance_fires_the_seeded_copy_on_an_unbalanced_trio(seeded: None) -> None:
    coach = _coach_with_team()
    response = coach.post(
        "/api/formations/433/balance",
        json={
            "slots": [
                {"slot": "six", "archetype_code": "six_destroyer"},
                {"slot": "eight_l", "archetype_code": "eight_box_crasher"},
                {"slot": "eight_r", "archetype_code": "eight_box_crasher"},
            ]
        },
    )
    assert response.status_code == 200
    trio = next(u for u in response.json()["units"] if u["unit"] == "midfield_three")
    assert trio["is_complete"] is True
    codes = {n["code"] for n in trio["notes"]}
    assert "mt_needs_a_tempo_setter" in codes
    assert "mt_one_box_threat" in codes
    seeded_copy = {r["code"]: r["warning_copy"] for r in _items(RULES_FILE)}
    for note in trio["notes"]:
        assert note["message"] == seeded_copy[note["code"]]


def test_balance_rejects_a_slot_that_is_not_in_the_formation(seeded: None) -> None:
    coach = _coach_with_team()
    response = coach.post(
        "/api/formations/433/balance",
        json={"slots": [{"slot": "am", "archetype_code": "ten_between_the_lines"}]},
    )
    assert response.status_code == 422


def test_balance_rejects_an_unknown_archetype_code(seeded: None) -> None:
    coach = _coach_with_team()
    response = coach.post(
        "/api/formations/433/balance",
        json={"slots": [{"slot": "six", "archetype_code": "six_libero"}]},
    )
    assert response.status_code == 422


def test_balance_404s_an_unknown_formation(seeded: None) -> None:
    coach = _coach_with_team()
    assert coach.post("/api/formations/4141/balance", json={"slots": []}).status_code == 404


def test_balance_never_supplies_team_id_from_the_client(seeded: None) -> None:
    """CLAUDE.md rule 4: the body has no team_id field at all, so a forged
    one is rejected outright rather than ignored."""
    coach = _coach_with_team()
    response = coach.post(
        "/api/formations/433/balance", json={"slots": [], "team_id": 9999}
    )
    assert response.status_code == 422
