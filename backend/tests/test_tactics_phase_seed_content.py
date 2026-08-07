"""T-103 Tactics Lab seed content (doc 06 sections 2.3, 2.4, 2.5, 2.8, 3.1):
formation_phases, rotation_systems, the six-zone rondo map on all six
formations, formation_matchups, and the ten reference systems seeded as
identities of kind 'reference_system'.

Same two halves as backend/tests/test_tactics_seed_content.py (T-102), for
the same reason: content assertions over the seed files prove the football
is there, and negative tests against a mutated copy of seeds/ prove
scripts/validate_seeds.py actually rejects the violations rather than
merely having a rule written down. Plus a loader test, because "the loader
is wired up" is a claim worth proving.

The two rules the ticket calls out by name get one test per failure mode:

  - a phase whose positions_json slot set differs from its base
    formation's, tested three ways (a slot added, a slot dropped, a slot
    renamed), because the morph animation binds by slot and a renamed slot
    is two failures at once rather than one.
  - a rotation with an empty risk, and a rotation with no risk key at all.
    A rotation library that lists only benefits is marketing, not coaching.
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

PHASES_FILE = "formation_phases.json"
ROTATIONS_FILE = "rotation_systems.json"
MATCHUPS_FILE = "formation_matchups.json"
RONDO_FILE = "rondo_zones.json"
REF_SYSTEMS_FILE = "identities_reference_systems.json"
FORMATIONS_FILE = "formations.json"

NEW_FILES = [PHASES_FILE, ROTATIONS_FILE, MATCHUPS_FILE, REF_SYSTEMS_FILE]
ALL_T103_FILES = NEW_FILES + [RONDO_FILE]

FORMATION_CODES = ["433", "4231", "442", "352", "343", "541"]

# doc 06 section 2.3, verbatim.
RONDO_ZONE_KEYS = {
    "first_line", "midfield_box", "flank_corridor_left", "flank_corridor_right",
    "last_line", "counterpress_ring",
}
# doc 06 section 2.5, all fourteen.
DOC06_ROTATION_CODES = [
    "rot_invert_fb_pivot", "rot_invert_fb_high", "rot_cb_step", "rot_cb_invert_middle",
    "rot_pivot_drop", "rot_double_pivot_split", "rot_wb_asymmetry", "rot_fb_touchline_swap",
    "rot_false_nine_drop", "rot_box_form", "rot_press_bait_hold", "rot_gk_plus_one",
    "rot_ten_drop_pivot", "rot_overload_isolate",
]
ROTATION_FAMILIES = {"first_line", "pivot", "wide", "front_line"}
ROUTE_KINDS = {"through", "around", "over"}


def _load(name: str) -> dict:
    return json.loads((SEEDS / name).read_text(encoding="utf-8"))


def _items(name: str) -> list[dict]:
    return _load(name)["items"]


def _base_slots() -> dict[str, dict[str, str]]:
    return {
        f["code"]: {p["slot"]: p["position_code"] for p in f["positions_json"]}
        for f in _items(FORMATIONS_FILE)
    }


# ---------------------------------------------------------------------------
# Content: formation_phases
# ---------------------------------------------------------------------------


def test_every_formation_carries_between_three_and_five_phase_variants() -> None:
    """The ticket's own shape: six formations at three to five variants
    each, before the attributed reference-system rows are counted."""
    base = {}
    for item in _items(PHASES_FILE):
        if item["variant_code"].startswith("ref_"):
            continue
        base.setdefault(item["formation_code"], []).append(item["variant_code"])
    assert set(base) == set(FORMATION_CODES)
    for code, variants in base.items():
        assert 3 <= len(variants) <= 5, f"{code}: {len(variants)} variants"


def test_every_phase_carries_the_exact_slot_set_of_its_base_formation() -> None:
    """doc 06 section 3.1's hard rule. The morph animation binds by slot,
    so a phase that adds, drops or renames one cannot animate."""
    base = _base_slots()
    for item in _items(PHASES_FILE):
        seeded = {p["slot"]: p["position_code"] for p in item["positions_json"]}
        key = f"{item['formation_code']}.{item['variant_code']}"
        assert set(seeded) == set(base[item["formation_code"]]), key
        assert len(item["positions_json"]) == 11, key


def test_slots_never_change_identity_across_phases() -> None:
    """A left back who walks into midfield is still the left back. If the
    position_code moved with him the coach would be watching a token
    change job rather than a player change position."""
    base = _base_slots()
    for item in _items(PHASES_FILE):
        for p in item["positions_json"]:
            assert p["position_code"] == base[item["formation_code"]][p["slot"]], (
                f"{item['formation_code']}.{item['variant_code']}.{p['slot']}"
            )


def test_every_phase_position_is_a_landscape_model_coordinate() -> None:
    """CLAUDE.md rule 8: x 0 to 100 toward the attacking goal, y 0 to 100
    top to bottom. Orientation is render-only and never seeded."""
    for item in _items(PHASES_FILE):
        for p in item["positions_json"]:
            assert 0 <= p["x"] <= 100 and 0 <= p["y"] <= 100, item["variant_code"]


def test_left_is_low_y_and_right_is_high_y_in_every_phase() -> None:
    """seeds/formations.json's own _l/_r convention, which T-101's corridor
    split (flank_corridor_left at y 0 to 25) also follows. A phase that
    mirrored it would render every wide rotation on the wrong flank."""
    for item in _items(PHASES_FILE):
        pos = {p["slot"]: p["y"] for p in item["positions_json"]}
        for left, right in (("cb_l", "cb_r"), ("fb_l", "fb_r"), ("wb_l", "wb_r"),
                            ("cm_l", "cm_r"), ("w_l", "w_r"), ("wm_l", "wm_r"),
                            ("st_l", "st_r"), ("eight_l", "eight_r"), ("dm_l", "dm_r")):
            if left in pos and right in pos:
                assert pos[left] < pos[right], (
                    f"{item['formation_code']}.{item['variant_code']}: {left} is not left of {right}"
                )


def test_every_phase_blurb_is_one_sentence_within_the_word_limit() -> None:
    for item in _items(PHASES_FILE):
        blurb = item["blurb"]
        assert len(blurb.split()) <= 25, f"{item['variant_code']}: {len(blurb.split())} words"
        assert blurb.count(".") == 1, f"{item['variant_code']}: not one sentence"


def test_every_rest_defence_variant_states_a_rest_shape() -> None:
    for item in _items(PHASES_FILE):
        if item["phase"] == "rest_defence":
            assert item["rest_shape"], item["variant_code"]


def test_every_phase_rotation_reference_resolves() -> None:
    codes = {i["code"] for i in _items(ROTATIONS_FILE)}
    for item in _items(PHASES_FILE):
        for rc in item["uses_rotations"]:
            assert rc in codes, f"{item['variant_code']}: unknown rotation '{rc}'"


# ---------------------------------------------------------------------------
# Content: rotation_systems
# ---------------------------------------------------------------------------


def test_all_fourteen_rotation_systems_doc06_names_are_seeded() -> None:
    codes = [i["code"] for i in _items(ROTATIONS_FILE)]
    assert sorted(codes) == sorted(DOC06_ROTATION_CODES)


def test_every_rotation_states_what_it_costs() -> None:
    """doc 06 section 2.5: 'A rotation with no stated risk is marketing,
    not coaching.'"""
    for item in _items(ROTATIONS_FILE):
        risk = item["risk"]
        assert risk and len(risk.split()) >= 8, f"{item['code']}: risk is empty or thin"


def test_every_rotation_animates_and_loops() -> None:
    """doc 03 section 4.1: rotations are the same animation format with
    loop true, so they play continuously on the board."""
    for item in _items(ROTATIONS_FILE):
        spec = item["animation_spec_json"]
        assert spec and spec["loop"] is True, item["code"]
        assert spec["slots"] and spec["steps"], item["code"]


def test_every_moved_slot_exists_in_the_rotations_animation_spec() -> None:
    """what_moves_json and animation_spec_json describe the same movement.
    A slot in one and not the other is a rotation that cannot be played."""
    for item in _items(ROTATIONS_FILE):
        spec_slots = {s["slot"] for s in item["animation_spec_json"]["slots"]}
        for move in item["what_moves_json"]:
            assert move["slot"] in spec_slots, f"{item['code']}: {move['slot']}"
            assert move["becomes"], f"{item['code']}: {move['slot']} becomes nothing"


def test_every_rotation_family_and_formation_reference_is_real() -> None:
    for item in _items(ROTATIONS_FILE):
        assert item["family"] in ROTATION_FAMILIES, item["code"]
        assert item["applies_to_formations"], item["code"]
        for fc in item["applies_to_formations"]:
            assert fc in FORMATION_CODES, f"{item['code']}: {fc}"


def test_every_rotation_profile_names_real_archetypes_and_attributes() -> None:
    archetypes = {i["code"] for i in _items("position_archetypes.json")}
    six = {"pace", "passing_range", "carrying_1v1",
           "positional_discipline", "aerial_physical", "pressing_engine"}
    for item in _items(ROTATIONS_FILE):
        for slot, need in (item["requires_profile_json"] or {}).items():
            assert set(need.get("archetypes") or []) <= archetypes, f"{item['code']}.{slot}"
            assert set(need.get("attributes") or []) <= six, f"{item['code']}.{slot}"
            assert need.get("foot") in (None, "L", "R"), f"{item['code']}.{slot}"


def test_rotation_exemplar_notes_carry_the_standing_disclaimer_or_say_nothing() -> None:
    """seeds/roles.json's convention, and T-102's. A null note claims
    nothing, which is the honest option when unsure of a name."""
    for item in _items(ROTATIONS_FILE):
        note = item["exemplar_note"]
        if note is None:
            continue
        assert note.endswith("Not a licence: names are editorial reference points only."), item["code"]


# ---------------------------------------------------------------------------
# Content: rondo map
# ---------------------------------------------------------------------------


def test_every_formation_carries_all_six_rondo_zones() -> None:
    by_formation: dict[str, set[str]] = {}
    for item in _items(RONDO_FILE):
        by_formation.setdefault(item["formation_code"], set()).add(item["zone_key"])
    assert set(by_formation) == set(FORMATION_CODES)
    for code, keys in by_formation.items():
        assert keys == RONDO_ZONE_KEYS, f"{code}: missing {RONDO_ZONE_KEYS - keys}"


def test_the_old_counterpress_zone_key_is_gone() -> None:
    """doc 06 section 2.3 renames it and changes what it is. The seeded
    4-3-3 row carried the old key from Bible 3G.2."""
    keys = {i["zone_key"] for i in _items(RONDO_FILE)}
    assert "counterpress" not in keys
    assert "counterpress_ring" in keys


def test_the_counterpress_ring_is_a_ball_relative_circle_everywhere() -> None:
    """The teaching point of the zone: rest defence is relative to the
    ball, not to the pitch."""
    rings = [i for i in _items(RONDO_FILE) if i["zone_key"] == "counterpress_ring"]
    assert len(rings) == len(FORMATION_CODES)
    for item in rings:
        assert item["zone_kind"] == "ball_relative_circle", item["formation_code"]
        assert item["radius"] == 18, item["formation_code"]


def test_polygon_zones_carry_no_radius() -> None:
    for item in _items(RONDO_FILE):
        if item["zone_kind"] == "polygon":
            assert item["radius"] is None, f"{item['formation_code']}.{item['zone_key']}"


def test_every_rondo_zone_carries_a_no_opposition_fallback_label() -> None:
    """canonical_rondo is the label shown when no opposition is placed. The
    live ratio is computed, never seeded (doc 06 section 2.3)."""
    for item in _items(RONDO_FILE):
        assert item["canonical_rondo"], f"{item['formation_code']}.{item['zone_key']}"


def test_flank_corridors_sit_on_the_side_their_key_names() -> None:
    """Left is low y, right is high y, matching formations.json's _l/_r
    convention and T-101's own corridor split."""
    for item in _items(RONDO_FILE):
        ys = [p["y"] for p in item["polygon_json"]]
        if item["zone_key"] == "flank_corridor_left":
            assert max(ys) <= 50, item["formation_code"]
        if item["zone_key"] == "flank_corridor_right":
            assert min(ys) >= 50, item["formation_code"]


# ---------------------------------------------------------------------------
# Content: matchups and reference systems
# ---------------------------------------------------------------------------


def test_every_matchup_is_normalised_and_unique() -> None:
    seen = set()
    for item in _items(MATCHUPS_FILE):
        pair = (item["ours_code"], item["theirs_code"])
        assert pair[0] < pair[1], f"{pair}: not normalised"
        assert pair not in seen, f"{pair}: duplicate"
        seen.add(pair)


def test_every_matchup_card_teaches_all_three_steps_of_the_read() -> None:
    """doc 06 section 2.8: where our spare man is, where we are short, and
    which route connects them. A card missing a step teaches something
    different from every other card."""
    for item in _items(MATCHUPS_FILE):
        key = f"{item['ours_code']} v {item['theirs_code']}"
        assert len(item["our_edges_json"]) >= 2, key
        assert len(item["their_edges_json"]) >= 2, key
        assert len(item["route"].split()) >= 10, key
        assert item["route_kind"] in ROUTE_KINDS, key


def test_all_ten_reference_systems_are_seeded_as_identities() -> None:
    data = _load(REF_SYSTEMS_FILE)
    assert data["kind"] == "reference_system"
    assert len(data["items"]) == 10


def test_every_reference_system_names_a_phase_variant_that_exists() -> None:
    """doc 06 section 2.5: each card carries the phase variant it produces.
    identities has no column for one, so the link is a formation_phases row
    pointing back, and a card nothing points at describes nothing."""
    referenced = {i["reference_code"] for i in _items(PHASES_FILE) if i["reference_code"]}
    for item in _items(REF_SYSTEMS_FILE):
        assert item["code"] in referenced, item["code"]


def test_every_reference_system_states_its_rotations_risk_and_provenance() -> None:
    for item in _items(REF_SYSTEMS_FILE):
        core = item["core_idea"]
        assert core.startswith("Formation:"), item["code"]
        for marker in ("Rotations:", "Risk:", "Provenance:"):
            assert marker in core, f"{item['code']}: no '{marker}' line"
        assert item["keystone_roles_json"], item["code"]
        assert item["youth_takeaway"], item["code"]


# ---------------------------------------------------------------------------
# Copy rules across everything this ticket seeds
# ---------------------------------------------------------------------------


def test_no_em_dash_in_any_t103_seed_file() -> None:
    """CLAUDE.md rule 3. The character is built with chr() rather than
    typed, so this test does not itself trip scripts/check_copy.py."""
    em_dash = chr(0x2014)
    for fname in ALL_T103_FILES:
        assert em_dash not in (SEEDS / fname).read_text(encoding="utf-8"), fname


def test_identity_copy_bans_apply_to_every_t103_file() -> None:
    """doc 03 section 7.6 / CLAUDE.md: identities curate, they never lock."""
    for phrase in ["correct", "right way", "off-identity"]:
        for fname in ALL_T103_FILES:
            blob = (SEEDS / fname).read_text(encoding="utf-8").lower()
            assert phrase not in blob, f"{fname}: contains '{phrase}'"


def test_every_t103_row_carries_source_ref_and_content_version() -> None:
    for fname in ALL_T103_FILES:
        data = _load(fname)
        for item in data["items"]:
            label = item.get("code") or f"{item.get('formation_code')}.{item.get('variant_code')}"
            assert item["source_ref"].startswith(("doc06:", "bible:")), f"{fname} {label}"
            assert item["content_version"] == data["content_version"], f"{fname} {label}"


# ---------------------------------------------------------------------------
# The validator actually rejects each violation
# ---------------------------------------------------------------------------

_module_counter = itertools.count()


def _fresh_validator(seeds_dir: pathlib.Path):
    name = f"pop_validate_seeds_t103_{next(_module_counter)}"
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


def _mutate_item(seeds_dir: pathlib.Path, fname: str, index: int, fn: Callable[[dict], None]) -> None:
    path = seeds_dir / fname
    data = json.loads(path.read_text(encoding="utf-8"))
    fn(data["items"][index])
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def test_the_negative_harness_passes_on_unmutated_seeds(tmp_path: pathlib.Path) -> None:
    code, out = _run_validator(tmp_path, lambda _: None)
    assert code == 0, out
    assert "all checks passed" in out


# --- the phase slot-set rule, one test per failure mode --------------------


def test_validator_rejects_a_phase_with_an_added_slot(tmp_path: pathlib.Path) -> None:
    def mutate(seeds: pathlib.Path) -> None:
        _mutate_item(
            seeds, PHASES_FILE, 0,
            lambda item: item["positions_json"].append(
                {"slot": "libero", "position_code": "CB", "x": 30, "y": 50}
            ),
        )

    code, out = _run_validator(tmp_path, mutate)
    assert code == 1
    assert "positions_json has slot(s) ['libero'] that the base formation does not have" in out


def test_validator_rejects_a_phase_with_a_dropped_slot(tmp_path: pathlib.Path) -> None:
    def mutate(seeds: pathlib.Path) -> None:
        _mutate_item(seeds, PHASES_FILE, 0, lambda item: item["positions_json"].pop())

    code, out = _run_validator(tmp_path, mutate)
    assert code == 1
    assert "positions_json is missing base formation slot(s)" in out


def test_validator_rejects_a_phase_with_a_renamed_slot(tmp_path: pathlib.Path) -> None:
    """A rename is the failure the morph animation actually suffers: the
    count still says eleven, so only a set comparison catches it."""
    def mutate(seeds: pathlib.Path) -> None:
        def rename(item: dict) -> None:
            item["positions_json"][1]["slot"] = "left_centre_back"

        _mutate_item(seeds, PHASES_FILE, 0, rename)

    code, out = _run_validator(tmp_path, mutate)
    assert code == 1
    assert "positions_json has slot(s) ['left_centre_back'] that the base formation does not have" in out
    assert "positions_json is missing base formation slot(s)" in out


def test_validator_rejects_a_phase_whose_slot_changes_position_code(tmp_path: pathlib.Path) -> None:
    def mutate(seeds: pathlib.Path) -> None:
        _mutate_item(
            seeds, PHASES_FILE, 0,
            lambda item: item["positions_json"][1].update({"position_code": "DM"}),
        )

    code, out = _run_validator(tmp_path, mutate)
    assert code == 1
    assert "in the base formation" in out


# --- the rotation risk rule ------------------------------------------------


def test_validator_rejects_a_rotation_with_an_empty_risk(tmp_path: pathlib.Path) -> None:
    code, out = _run_validator(
        tmp_path,
        lambda seeds: _mutate_item(seeds, ROTATIONS_FILE, 0, lambda item: item.update({"risk": ""})),
    )
    assert code == 1
    assert "missing required field 'risk'" in out


def test_validator_rejects_a_rotation_with_no_risk_key_at_all(tmp_path: pathlib.Path) -> None:
    code, out = _run_validator(
        tmp_path,
        lambda seeds: _mutate_item(seeds, ROTATIONS_FILE, 0, lambda item: item.pop("risk")),
    )
    assert code == 1
    assert "missing required field 'risk'" in out


def test_validator_rejects_a_rotation_whose_risk_is_a_token_gesture(tmp_path: pathlib.Path) -> None:
    code, out = _run_validator(
        tmp_path,
        lambda seeds: _mutate_item(seeds, ROTATIONS_FILE, 0, lambda item: item.update({"risk": "Some risk."})),
    )
    assert code == 1
    assert "risk is 2 words, too thin to be a real cost" in out


# --- the rest of the new rules --------------------------------------------


def test_validator_rejects_a_moved_slot_missing_from_the_animation_spec(tmp_path: pathlib.Path) -> None:
    code, out = _run_validator(
        tmp_path,
        lambda seeds: _mutate_item(
            seeds, ROTATIONS_FILE, 0,
            lambda item: item["what_moves_json"][0].update({"slot": "ghost"}),
        ),
    )
    assert code == 1
    assert "slot 'ghost' is not defined in animation_spec_json" in out


def test_validator_rejects_a_phase_pointing_at_an_unknown_rotation(tmp_path: pathlib.Path) -> None:
    code, out = _run_validator(
        tmp_path,
        lambda seeds: _mutate_item(
            seeds, PHASES_FILE, 0, lambda item: item.update({"uses_rotations": ["rot_nonexistent"]})
        ),
    )
    assert code == 1
    assert "uses_rotations references unknown rotation system 'rot_nonexistent'" in out


def test_validator_rejects_an_unnormalised_matchup(tmp_path: pathlib.Path) -> None:
    def mutate(seeds: pathlib.Path) -> None:
        _mutate_item(
            seeds, MATCHUPS_FILE, 0,
            lambda item: item.update({"ours_code": "541", "theirs_code": "343"}),
        )

    code, out = _run_validator(tmp_path, mutate)
    assert code == 1
    assert "must be normalised with ours_code < theirs_code" in out


def test_validator_rejects_a_polygon_zone_carrying_a_radius(tmp_path: pathlib.Path) -> None:
    code, out = _run_validator(
        tmp_path,
        lambda seeds: _mutate_item(seeds, RONDO_FILE, 0, lambda item: item.update({"radius": 12})),
    )
    assert code == 1
    assert "a polygon zone must not carry a radius" in out


def test_validator_rejects_a_formation_missing_a_rondo_zone(tmp_path: pathlib.Path) -> None:
    def mutate(seeds: pathlib.Path) -> None:
        path = seeds / RONDO_FILE
        data = json.loads(path.read_text(encoding="utf-8"))
        data["items"] = [i for i in data["items"] if i["zone_key"] != "counterpress_ring"
                         or i["formation_code"] != "352"]
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    code, out = _run_validator(tmp_path, mutate)
    assert code == 1
    assert "352: missing rondo zone(s) ['counterpress_ring']" in out


def test_validator_rejects_a_reference_system_nothing_points_at(tmp_path: pathlib.Path) -> None:
    def mutate(seeds: pathlib.Path) -> None:
        path = seeds / PHASES_FILE
        data = json.loads(path.read_text(encoding="utf-8"))
        for item in data["items"]:
            if item["reference_code"] == "ref_man_city_325":
                item["reference_code"] = None
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    code, out = _run_validator(tmp_path, mutate)
    assert code == 1
    assert "no formation_phases row carries reference_code 'ref_man_city_325'" in out


def test_validator_rejects_a_reference_system_with_no_risk_line(tmp_path: pathlib.Path) -> None:
    def mutate(seeds: pathlib.Path) -> None:
        def strip(item: dict) -> None:
            head, _, _ = item["core_idea"].partition("Risk:")
            item["core_idea"] = head

        _mutate_item(seeds, REF_SYSTEMS_FILE, 0, strip)

    code, out = _run_validator(tmp_path, mutate)
    assert code == 1
    assert "core_idea is missing its 'Risk:' line" in out


def test_validator_rejects_an_over_long_phase_blurb(tmp_path: pathlib.Path) -> None:
    code, out = _run_validator(
        tmp_path,
        lambda seeds: _mutate_item(
            seeds, PHASES_FILE, 0, lambda item: item.update({"blurb": "word " * 30}),
        ),
    )
    assert code == 1
    assert "over the 25-word limit" in out


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------


def _import_seed_module():
    spec = importlib.util.spec_from_file_location(
        "pop_seed_script_t103", REPO_ROOT / "scripts" / "seed.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _count_teams() -> int:
    from app.db import SessionLocal
    from app.models import Team

    session = SessionLocal()
    try:
        return session.query(Team).count()
    finally:
        session.close()


def test_seed_loader_loads_every_new_file_into_a_fresh_database() -> None:
    """The DoD line, proven rather than asserted: run the real loader
    against the empty test database, count rows against the seed files,
    read one row of each table back out, then run it again to prove the
    upsert updates in place instead of duplicating."""
    seed = _import_seed_module()

    from app.db import SessionLocal
    from app.models import (
        FormationMatchup,
        FormationPhase,
        Identity,
        RondoZone,
        RotationSystem,
    )

    assert seed.main() == 0

    session = SessionLocal()
    try:
        first = {
            "formation_phases": session.query(FormationPhase).count(),
            "rotation_systems": session.query(RotationSystem).count(),
            "formation_matchups": session.query(FormationMatchup).count(),
            "rondo_zones": session.query(RondoZone).count(),
            "reference_systems": session.query(Identity)
            .filter(Identity.kind == "reference_system")
            .count(),
        }

        phase = session.get(FormationPhase, ("433", "in_possession"))
        assert phase is not None
        assert phase.shape_label == "3-2-5"
        assert phase.rest_shape == "3+2"
        assert phase.uses_rotations == ["rot_invert_fb_pivot"]
        assert {p["slot"] for p in phase.positions_json} == {
            "gk", "cb_l", "cb_r", "fb_l", "fb_r", "six",
            "eight_l", "eight_r", "w_l", "st", "w_r",
        }

        rotation = session.get(RotationSystem, "rot_gk_plus_one")
        assert rotation is not None
        assert rotation.family == "first_line"
        assert rotation.risk
        assert rotation.animation_spec_json["loop"] is True

        matchup = session.get(FormationMatchup, ("433", "442"))
        assert matchup is not None
        assert matchup.route_kind == "through"
        assert matchup.our_edges_json and matchup.their_edges_json

        ring = session.get(RondoZone, ("541", "counterpress_ring"))
        assert ring is not None
        assert ring.zone_kind == "ball_relative_circle"
        assert ring.radius == 18
        assert ring.canonical_rondo

        city = session.query(Identity).filter(Identity.code == "ref_man_city_325").one()
        assert city.kind == "reference_system"
        assert city.formation_code == "433"
    finally:
        session.close()

    assert first == {
        "formation_phases": len(_items(PHASES_FILE)),
        "rotation_systems": len(_items(ROTATIONS_FILE)),
        "formation_matchups": len(_items(MATCHUPS_FILE)),
        "rondo_zones": len(_items(RONDO_FILE)),
        "reference_systems": len(_items(REF_SYSTEMS_FILE)),
    }

    teams_before = _count_teams()
    assert seed.main() == 0

    session = SessionLocal()
    try:
        second = {
            "formation_phases": session.query(FormationPhase).count(),
            "rotation_systems": session.query(RotationSystem).count(),
            "formation_matchups": session.query(FormationMatchup).count(),
            "rondo_zones": session.query(RondoZone).count(),
            "reference_systems": session.query(Identity)
            .filter(Identity.kind == "reference_system")
            .count(),
        }
    finally:
        session.close()

    assert second == first, "re-running the seeder must upsert, not duplicate"
    assert _count_teams() == teams_before, "the seeder must never touch team-scoped tables"


@pytest.mark.parametrize("fname", NEW_FILES)
def test_seed_loader_knows_about_every_new_file(fname: str) -> None:
    """A seed file absent from LOAD_ORDER falls through to the unordered
    tail, which for these files means loading before the rows they point
    at exist."""
    seed = _import_seed_module()
    assert _load(fname)["table"] in seed.TABLE_CONFIG
    assert fname in seed.LOAD_ORDER
