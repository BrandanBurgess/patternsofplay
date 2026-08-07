#!/usr/bin/env python3
"""Seed validator (doc 03 section 8.3 / T-011): required fields, blurb and
tag_line length, banned em dash character, banned "curate, never lock"
identity phrases, animation slot references resolve, and every cross-file
code reference resolves (pattern codes on cult cards and rondo zones, role
codes in synergies and clashes, position codes in roles and formations,
formation codes wherever they appear non-null).

T-011 is the ticket that formally hardens and tests this validator; it
already has to be real and passing for T-010's seed files to satisfy doc
03, so the checks below are not a stub. `make check-copy` runs this
alongside the em-dash scan on every commit (doc 03 section 8.5), and
backend/tests/test_seed_content.py shells this exact script so `make test`
catches a validator regression too, not only a CI-only path.

Rule provenance, so a failing check is traceable back to its source:
  - required fields, blurb <=25 words, animation spec, roles/coaching
    points/youth takeaway: Bible 8.2.1 / 8.2.4, doc 03 section 7.2-7.3.
  - no em dash anywhere: CLAUDE.md rule 3, doc 03 section 7.1, Brief
    section 2. Checked here as defense in depth; scripts/check_copy.py is
    the primary CI scan over rendered/source strings.
  - banned identity phrases ("correct", "right way", "off-identity"):
    doc 03 section 7.6 ("curate, never lock"), CLAUDE.md preamble.
  - traceability (source_ref) and versioning (content_version): doc 03
    section 7.7-7.8.
  - cross-file code references (pattern/role/position/formation codes):
    doc 03 section 8.3, and the natural keys scripts/seed.py upserts by.
  - animation slot references: doc 03 section 4.1, delegated to
    backend/app/specs.py's AnimationSpec so the rule lives in one place.
  - reference team five-part detail template: doc 03 section 5.
  - Tactics Lab archetypes/combinations/balance rules (T-102): doc 06
    section 2.6 for the content rules (closed duty vocabulary, 2 to 3 key
    attributes from the six, every combination states a cost, warning copy
    reads as a check) and section 3.1 for the column shapes.
"""

from __future__ import annotations

import json
import pathlib
import re
import sys
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEEDS = ROOT / "seeds"
BACKEND = ROOT / "backend"

sys.path.insert(0, str(BACKEND))
from app.schemas import ATTRIBUTE_KEYS  # noqa: E402
from app.specs import AnimationSpec, Trajectory  # noqa: E402
from pydantic import ValidationError  # noqa: E402
from typing import get_args  # noqa: E402

EM_DASH = "—"
BANNED_IDENTITY_PHRASES = ["correct", "right way", "off-identity"]
# doc 03 section 7.7 traceability. Content transcribed from the Bible cites
# "bible:SECTION"; the Tactics Lab tables (T-102/T-103) are written from doc
# 06, which is a separate source document, so they cite "doc06:SECTION". A
# ref still has to name one of the two, never nothing.
SOURCE_REF_RE = re.compile(r"^(bible|doc06):")
TRAJECTORY_VALUES = set(get_args(Trajectory))

# ---------------------------------------------------------------------------
# Tactics Lab vocabularies (doc 06 section 2.6 / 3.1, T-102)
# ---------------------------------------------------------------------------

# The six coach-rated attribute sliders, taken from the single existing
# source of that vocabulary (app/schemas.py ATTRIBUTE_KEYS, itself Bible
# 1.3 / app/models/roster.py PlayerAttribute) rather than copied, so a
# change there cannot leave this validator silently checking a stale list.
ATTRIBUTE_VOCABULARY = set(ATTRIBUTE_KEYS)

# doc 06 section 2.6: "Slot families: gk, cb_central, cb_wide, fb, wb, six,
# eight, ten, wide_forward, nine." Archetypes attach to a slot family, not
# a position code, because the eight in a 4-3-3 and the eight in a 3-5-2
# are different jobs.
SLOT_FAMILIES = {
    "gk", "cb_central", "cb_wide", "fb", "wb",
    "six", "eight", "ten", "wide_forward", "nine",
}

# doc 06 section 3.1: "duties_json is what the combination checker runs on.
# Keep the duty vocabulary closed and small; adding a duty is a spec
# change, not a seed change." Hence a hard-closed set here.
DUTY_VOCABULARY = {
    "tempo", "progression", "rest_defence", "width", "pin",
    "box_threat", "press_trigger",
}

UNIT_VOCABULARY = {
    "midfield_three", "double_pivot", "front_three", "strike_pair",
    "back_line", "wide_unit", "box_midfield",
}

# Which slot families may appear in which unit. Catches a combination that
# puts a nine in a back line, which no other check would notice.
UNIT_SLOT_FAMILIES = {
    "midfield_three": {"six", "eight"},
    "double_pivot": {"six"},
    "box_midfield": {"six", "eight", "ten"},
    "front_three": {"wide_forward", "nine"},
    "strike_pair": {"nine", "ten"},
    "back_line": {"cb_central", "cb_wide", "fb", "wb"},
    "wide_unit": {"fb", "wb", "wide_forward"},
}

# ---------------------------------------------------------------------------
# Tactics Lab part two: phases, rotations, matchups, rondo map (doc 06
# sections 2.3/2.4/2.5/2.8 and 3.1, T-103)
# ---------------------------------------------------------------------------

PHASE_VOCABULARY = {"in_possession", "out_of_possession", "rest_defence", "transition"}
# The variant codes doc 06 section 2.4 names. A reference-system variant
# uses its own "ref_..." code and states its phase explicitly, so only the
# named ones are pinned to a phase here.
STANDARD_VARIANT_PHASE = {
    "in_possession": "in_possession",
    "in_possession_alt": "in_possession",
    "out_of_possession": "out_of_possession",
    "out_of_possession_alt": "out_of_possession",
    "rest_defence": "rest_defence",
}
ROTATION_FAMILIES = {"first_line", "pivot", "wide", "front_line"}
ROUTE_KINDS = {"through", "around", "over"}
ZONE_KINDS = {"polygon", "ball_relative_circle"}
RONDO_ZONE_KEYS = {
    "first_line", "midfield_box", "flank_corridor_left", "flank_corridor_right",
    "last_line", "counterpress_ring",
}
# rest_shape is "'3+2' | '2+3' | '4+1' | '5+2' | null" in doc 06 section
# 3.1, but section 2.4 also uses 4+2 and the reference systems need 3+1 and
# 2+4, so section 3.1's list is illustrative rather than closed. Shape
# rather than membership is what is worth enforcing: two counts that add up
# to no more than the ten outfield players.
REST_SHAPE_RE = re.compile(r"^([1-9])\+([1-9])$")
# doc 06 section 2.5 requires every reference-system card to name its
# rotations and its one honest risk line, and identities has no column for
# either. They live in core_idea behind these markers instead of inventing
# schema this ticket may not change.
REFERENCE_SYSTEM_MARKERS = ["Formation:", "Rotations:", "Risk:", "Provenance:"]

RULE_KINDS = {"requires_duty", "max_duty", "max_same_archetype"}
SEVERITIES = {"note", "warning"}
FOOT_HINTS = {"same_side", "opposite_side", "either"}
WORK_RATES = {"low", "med", "high"}

# doc 06 section 3.1: unit balance warning_copy "must read as a check not
# an error", and CLAUDE.md's "curate, never lock" principle says the same
# thing about identity copy. A coach may want the flagged combination on
# purpose, so the vocabulary of failure is banned outright.
BANNED_WARNING_WORDS = ["invalid", "illegal", "wrong", "forbidden", "not allowed", "error"]

# Free-text cross-reference tokenizers for fields that embed codes in prose
# rather than as a structured list (role_clashes.trigger_expression, doc 03
# section 3: "code, name, trigger_expression, warning_copy"). Role/identity
# codes are snake_case ("false_9", "low_block_counter"); library item codes
# are a capital letter plus one or two digits ("A5", "C2").
SNAKE_CODE_TOKEN_RE = re.compile(r"\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b")
PATTERN_CODE_TOKEN_RE = re.compile(r"\b[A-Z]\d{1,2}\b")

LIBRARY_ITEM_REQUIRED_FIELDS = [
    "name", "blurb", "when_to_use", "coaching_points_json", "roles_involved",
    "youth_takeaway", "age_hint", "source_ref", "content_version", "category",
]
FORMATION_REQUIRED_FIELDS = [
    "code", "name", "shape_blurb", "strengths_json", "vulnerabilities_json",
    "positions_json", "source_ref", "content_version",
]
KEYSTONE_REQUIRED_FIELDS = ["formation_code", "slot", "title", "blurb", "source_ref", "content_version"]
RONDO_REQUIRED_FIELDS = [
    "formation_code", "zone_key", "polygon_json", "rondo_name", "teaches",
    "source_ref", "content_version",
]
ROLE_REQUIRED_FIELDS = [
    "code", "position_code", "name", "description", "key_attribute_keys",
    "awr_default", "dwr_default", "source_ref", "content_version",
]
SYNERGY_REQUIRED_FIELDS = ["code", "name", "why_it_works", "source_ref", "content_version"]
CLASH_REQUIRED_FIELDS = ["code", "name", "trigger_expression", "warning_copy", "source_ref", "content_version"]
IDENTITY_REQUIRED_FIELDS = [
    "code", "name", "tag_line", "core_idea", "youth_takeaway", "age_hint", "shape_render",
    "source_ref", "content_version",
]
# enables_pattern_codes / enables_rotation_codes are legitimately empty on
# plenty of archetypes (a coverer enables no pattern), so they are checked
# for resolvability below rather than for presence here.
ARCHETYPE_REQUIRED_FIELDS = [
    "code", "slot_family", "name", "definition", "key_attribute_keys",
    "awr_default", "dwr_default", "duties_json", "needs_around_it",
    "source_ref", "content_version",
]
COMBINATION_REQUIRED_FIELDS = [
    "code", "unit", "name", "slots_json", "what_it_gives", "what_it_costs",
    "source_ref", "content_version",
]
BALANCE_RULE_REQUIRED_FIELDS = [
    "code", "unit", "rule_kind", "warning_copy", "severity",
    "source_ref", "content_version",
]
# rest_shape, reference_code and uses_rotations are legitimately null or
# empty (a high block has no rest shape, most variants are not attributed,
# and plenty of shapes are reached without a named rotation), so they are
# checked for validity below rather than for presence here.
PHASE_REQUIRED_FIELDS = [
    "formation_code", "variant_code", "phase", "name", "shape_label", "blurb",
    "positions_json", "trigger", "source_ref", "content_version",
]
ROTATION_SYSTEM_REQUIRED_FIELDS = [
    "code", "name", "family", "applies_to_formations", "produces_shape", "trigger",
    "what_moves_json", "coaching_points_json", "risk", "animation_spec_json",
    "source_ref", "content_version",
]
MATCHUP_REQUIRED_FIELDS = [
    "ours_code", "theirs_code", "our_edges_json", "their_edges_json", "route",
    "route_kind", "source_ref", "content_version",
]

errors: list[str] = []


def word_count(s: str) -> int:
    return len(re.findall(r"\S+", s))


def require(cond: bool, msg: str) -> None:
    if not cond:
        errors.append(msg)


def require_fields(fname: str, label: str, item: dict, fields: list[str]) -> None:
    for field in fields:
        value = item.get(field)
        require(
            value is not None and value != "" and value != [],
            f"{fname} {label}: missing required field '{field}'",
        )


def check_source_ref(fname: str, label: str, item: dict) -> None:
    sref = item.get("source_ref") or ""
    require(bool(SOURCE_REF_RE.match(sref)), f"{fname} {label}: source_ref '{sref}' must start with 'bible:'")


def check_content_version(fname: str, label: str, item: dict, file_version: str | None) -> None:
    cv = item.get("content_version")
    require(
        cv is None or cv == file_version,
        f"{fname} {label}: item content_version '{cv}' does not match file content_version '{file_version}'",
    )


def check_duplicates(fname: str, items: list[dict], key_fn) -> None:
    seen: set[str] = set()
    for item in items:
        key = key_fn(item)
        require(key not in seen, f"{fname} {key}: duplicate natural key")
        seen.add(key)


def walk_strings(obj: Any, path: str):
    """Recursively yield (path, string) for every string leaf in a JSON
    value. Used to scan every string field for the em dash character and,
    on identity items, the banned "curate, never lock" phrases, without
    hand-maintaining a per-entity field list that drifts from the schema."""
    if isinstance(obj, str):
        yield path, obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield from walk_strings(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk_strings(v, f"{path}[{i}]")


def check_no_em_dash_anywhere(fname: str, label: str, item: dict) -> None:
    for path, s in walk_strings(item, label):
        if EM_DASH in s:
            errors.append(f"{fname} {path}: contains an em dash")


def check_no_banned_identity_phrase_anywhere(fname: str, label: str, item: dict) -> None:
    for path, s in walk_strings(item, label):
        lowered = s.lower()
        for phrase in BANNED_IDENTITY_PHRASES:
            if phrase in lowered:
                errors.append(f"{fname} {path}: banned identity phrase '{phrase}'")


def load(fname: str) -> dict:
    return json.loads((SEEDS / fname).read_text(encoding="utf-8"))


def validate_animation_spec(fname: str, label: str, field: str, spec: dict | None) -> None:
    if spec is None:
        return
    try:
        AnimationSpec.model_validate(spec)
    except ValidationError as exc:
        errors.append(f"{fname} {label}.{field}: invalid animation spec: {exc}")


def extract_role_refs(keystone_roles_json) -> list[str]:
    """keystone_roles_json is a flat list of role codes for style archetypes
    but a list of {"role": ..., "note": ...} objects for reference teams
    (doc 03 section 5 gives one column shape; the richer reference-team
    editorial note is additive). Handle both without assuming one."""
    if not keystone_roles_json:
        return []
    refs = []
    for entry in keystone_roles_json:
        if isinstance(entry, str):
            refs.append(entry)
        elif isinstance(entry, dict) and "role" in entry:
            refs.append(entry["role"])
    return refs


def main() -> int:
    if not SEEDS.exists():
        print("validate-seeds: no seeds/ directory, nothing to validate")
        return 0

    files = {p.name: load(p.name) for p in sorted(SEEDS.glob("*.json"))}
    if not files:
        print("validate-seeds: no seed files yet")
        return 0

    # Defense in depth (CLAUDE.md rule 3): em dash scan over every string in
    # every seed file's full JSON tree, not just the fields a hand-written
    # allowlist happens to name. scripts/check_copy.py is still the primary
    # CI gate; this is a second, independent pass over the same files.
    for fname, data in files.items():
        for item in data.get("items", []):
            label = item.get("code") or item.get("formation_code", "?")
            check_no_em_dash_anywhere(fname, label, item)

    # Item content_version must agree with the file-level content_version
    # every seed file carries at its head (doc 03 section 7.8).
    for fname, data in files.items():
        file_version = data.get("content_version")
        for item in data.get("items", []):
            label = item.get("code") or item.get("formation_code", "?")
            check_content_version(fname, label, item, file_version)

    position_codes: set[str] = set()
    if "position_codes.json" in files:
        pc_items = files["position_codes.json"]["items"]
        check_duplicates("position_codes.json", pc_items, lambda i: i["code"])
        position_codes = {item["code"] for item in pc_items}

    pattern_codes: set[str] = set()
    library_files = [f for f in ("patterns.json", "deliveries.json", "rotations.json") if f in files]
    for fname in library_files:
        item_type = files[fname].get("item_type")
        for item in files[fname]["items"]:
            code = item.get("code", "?")
            if code in pattern_codes:
                errors.append(f"{fname} {code}: duplicate library_items code")
            pattern_codes.add(code)

            require_fields(fname, code, item, LIBRARY_ITEM_REQUIRED_FIELDS)

            blurb = item.get("blurb", "")
            require(
                word_count(blurb) <= 25,
                f"{fname} {code}: blurb is {word_count(blurb)} words, over the 25-word limit",
            )
            require(
                bool(item.get("animation_spec_json")),
                f"{fname} {code}: missing animation_spec_json (required for every pattern/delivery/rotation)",
            )
            check_source_ref(fname, code, item)
            validate_animation_spec(fname, code, "animation_spec_json", item.get("animation_spec_json"))
            # roles_involved (doc 03 section 4: "role or position codes") is
            # resolved in a dedicated pass below, once roles.json is loaded.

            # doc 03 section 4 extras_json: delivery carries
            # trajectory/delivery_zone/target_corridor, rotation carries
            # trigger/creates/defenders_dilemma. Patterns carry no
            # extras_json contract, so item_type == 'pattern' is skipped.
            extras = item.get("extras_json") or {}
            if item_type == "delivery":
                for field in ("trajectory", "delivery_zone", "target_corridor"):
                    require(bool(extras.get(field)), f"{fname} {code}: extras_json missing '{field}'")
                traj = extras.get("trajectory")
                require(
                    traj in TRAJECTORY_VALUES,
                    f"{fname} {code}: extras_json.trajectory '{traj}' not in {sorted(TRAJECTORY_VALUES)}",
                )
            elif item_type == "rotation":
                for field in ("trigger", "creates", "defenders_dilemma"):
                    require(bool(extras.get(field)), f"{fname} {code}: extras_json missing '{field}'")

    formation_codes: set[str] = set()
    if "formations.json" in files:
        formation_items = files["formations.json"]["items"]
        check_duplicates("formations.json", formation_items, lambda i: i["code"])
        for item in formation_items:
            code = item["code"]
            formation_codes.add(code)
            require_fields("formations.json", code, item, FORMATION_REQUIRED_FIELDS)
            require(
                word_count(item.get("shape_blurb", "")) <= 25,
                f"formations.json {code}: shape_blurb over the 25-word limit",
            )
            check_source_ref("formations.json", code, item)
            for slot in item.get("positions_json") or []:
                pc = slot.get("position_code")
                require(
                    pc in position_codes,
                    f"formations.json {code}: positions_json slot '{slot.get('slot')}' "
                    f"references unknown position_code '{pc}'",
                )

    if "formation_keystones.json" in files:
        keystone_items = files["formation_keystones.json"]["items"]
        check_duplicates(
            "formation_keystones.json", keystone_items, lambda i: f"{i['formation_code']}.{i['slot']}"
        )
        for item in keystone_items:
            key = f"{item['formation_code']}.{item['slot']}"
            require_fields("formation_keystones.json", key, item, KEYSTONE_REQUIRED_FIELDS)
            require(
                item["formation_code"] in formation_codes,
                f"formation_keystones.json {key}: unknown formation_code",
            )
            check_source_ref("formation_keystones.json", key, item)

    if "rondo_zones.json" in files:
        rondo_items = files["rondo_zones.json"]["items"]
        check_duplicates(
            "rondo_zones.json", rondo_items, lambda i: f"{i['formation_code']}.{i['zone_key']}"
        )
        for item in rondo_items:
            key = f"{item['formation_code']}.{item['zone_key']}"
            require_fields("rondo_zones.json", key, item, RONDO_REQUIRED_FIELDS)
            require(
                item["formation_code"] in formation_codes,
                f"rondo_zones.json {key}: unknown formation_code",
            )
            check_source_ref("rondo_zones.json", key, item)
            for pc in item.get("trains_pattern_codes") or []:
                require(
                    pc in pattern_codes,
                    f"rondo_zones.json {key}: trains_pattern_codes references unknown code '{pc}'",
                )

            # doc 06 section 2.3 (T-103): six zones on every formation, and
            # the counterpress ring is a ball-relative circle rather than a
            # polygon, which is the whole teaching point of that zone.
            require(
                item.get("zone_key") in RONDO_ZONE_KEYS,
                f"rondo_zones.json {key}: zone_key not in {sorted(RONDO_ZONE_KEYS)}",
            )
            zone_kind = item.get("zone_kind")
            require(
                zone_kind in ZONE_KINDS,
                f"rondo_zones.json {key}: zone_kind '{zone_kind}' not in {sorted(ZONE_KINDS)}",
            )
            # canonical_rondo is the label shown when no opposition is
            # placed. With opposition on the board the ratio is computed,
            # never read from the seed (doc 06 section 2.3), so this field
            # is a fallback and every row owes one.
            require(
                bool(item.get("canonical_rondo")),
                f"rondo_zones.json {key}: missing canonical_rondo, the no-opposition fallback label",
            )
            radius = item.get("radius")
            if zone_kind == "ball_relative_circle":
                require(
                    isinstance(radius, (int, float)) and radius > 0,
                    f"rondo_zones.json {key}: a ball_relative_circle zone needs a positive radius",
                )
            else:
                require(
                    radius is None,
                    f"rondo_zones.json {key}: a polygon zone must not carry a radius",
                )

        # Every formation carries the full set of six zones: a formation
        # missing one renders a rondo map with a hole in it rather than an
        # error, which is the kind of gap only a completeness check finds.
        by_formation: dict[str, set[str]] = {}
        for item in rondo_items:
            by_formation.setdefault(item["formation_code"], set()).add(item["zone_key"])
        for fc in sorted(formation_codes):
            missing = RONDO_ZONE_KEYS - by_formation.get(fc, set())
            require(
                not missing,
                f"rondo_zones.json {fc}: missing rondo zone(s) {sorted(missing)}",
            )

    archetype_codes: set[str] = set()
    if "identities_archetypes.json" in files:
        archetype_codes = {item["code"] for item in files["identities_archetypes.json"]["items"]}

    if "formations.json" in files:
        for item in files["formations.json"]["items"]:
            for nid in item.get("natural_identities") or []:
                require(
                    nid in archetype_codes,
                    f"formations.json {item['code']}: natural_identities references unknown archetype '{nid}'",
                )

    role_codes: set[str] = set()
    if "roles.json" in files:
        role_items = files["roles.json"]["items"]
        check_duplicates("roles.json", role_items, lambda i: i["code"])
        role_codes = {item["code"] for item in role_items}
        for item in role_items:
            code = item["code"]
            require_fields("roles.json", code, item, ROLE_REQUIRED_FIELDS)
            require(item["position_code"] in position_codes, f"roles.json {code}: unknown position_code")
            require(
                item.get("awr_default") in ("low", "med", "high"),
                f"roles.json {code}: awr_default must be low|med|high",
            )
            require(
                item.get("dwr_default") in ("low", "med", "high"),
                f"roles.json {code}: dwr_default must be low|med|high",
            )
            check_source_ref("roles.json", code, item)
            for pc in item.get("enables_pattern_codes") or []:
                require(
                    pc in pattern_codes,
                    f"roles.json {code}: enables_pattern_codes references unknown code '{pc}'",
                )

    # roles_involved on every pattern/delivery/rotation (role or position
    # code, doc 03 section 4), resolved now that roles.json is loaded.
    role_or_position_codes = role_codes | position_codes
    for fname in library_files:
        for item in files[fname]["items"]:
            code = item.get("code", "?")
            for r in item.get("roles_involved") or []:
                require(
                    r in role_or_position_codes,
                    f"{fname} {code}: roles_involved references unknown role/position code '{r}'",
                )

    identity_codes: set[str] = set()
    identity_files = [
        f
        for f in (
            "identities_archetypes.json",
            "identities_reference_teams.json",
            "identities_cult_corner.json",
            # doc 06 section 2.5 reference systems (T-103) are identities of
            # kind 'reference_system', so every identity-wide rule above
            # (required fields, tag_line length, "curate never lock" copy)
            # applies to them without being restated.
            "identities_reference_systems.json",
        )
        if f in files
    ]
    all_identity_items: list[dict] = []
    for fname in identity_files:
        all_identity_items.extend(files[fname]["items"])
    check_duplicates("identities (all files)", all_identity_items, lambda i: i["code"])

    for fname in identity_files:
        kind = files[fname].get("kind")
        for item in files[fname]["items"]:
            code = item["code"]
            identity_codes.add(code)

            require_fields(fname, code, item, IDENTITY_REQUIRED_FIELDS)
            check_source_ref(fname, code, item)

            require(
                word_count(item.get("tag_line", "")) <= 25,
                f"{fname} {code}: tag_line over the 25-word limit",
            )

            require(
                item.get("shape_render") in ("animated", "static", "details_only"),
                f"{fname} {code}: shape_render must be animated|static|details_only",
            )
            block = item.get("block")
            require(
                block is None or block in ("high", "mid", "low"),
                f"{fname} {code}: block must be null or high|mid|low",
            )

            # doc 03 section 7.6, "curate, never lock": scanned across the
            # whole identity record, not a hand-picked subset of fields.
            check_no_banned_identity_phrase_anywhere(fname, code, item)

            fc = item.get("formation_code")
            require(
                fc is None or fc in formation_codes,
                f"{fname} {code}: formation_code '{fc}' does not exist",
            )

            for pc in item.get("signature_pattern_codes") or []:
                require(
                    pc in pattern_codes,
                    f"{fname} {code}: signature_pattern_codes references unknown code '{pc}'",
                )

            for rc in extract_role_refs(item.get("keystone_roles_json")):
                require(
                    rc in role_codes,
                    f"{fname} {code}: keystone_roles_json references unknown role_code '{rc}'",
                )

            validate_animation_spec(fname, code, "signature_animation_spec_json", item.get("signature_animation_spec_json"))

            # Detail template enforcement (doc 03 section 5): reference team
            # entries must carry formation-and-shape text (folded into
            # core_idea), core idea, signature patterns list, keystone
            # roles, and youth takeaway.
            if kind == "reference_team":
                require(
                    item.get("keystone_roles_json") is not None,
                    f"{fname} {code}: reference team missing keystone_roles_json",
                )
                require(
                    "signature_pattern_codes" in item,
                    f"{fname} {code}: reference team missing signature_pattern_codes",
                )
                require(
                    item.get("core_idea", "").lower().startswith("formation:"),
                    f"{fname} {code}: reference team core_idea must lead with 'Formation:' "
                    "(no dedicated shape column on identities, doc 03 section 5)",
                )

    if "role_synergies.json" in files:
        synergy_items = files["role_synergies.json"]["items"]
        check_duplicates("role_synergies.json", synergy_items, lambda i: i["code"])
        for item in synergy_items:
            code = item["code"]
            require_fields("role_synergies.json", code, item, SYNERGY_REQUIRED_FIELDS)
            check_source_ref("role_synergies.json", code, item)
            require(
                bool(item.get("role_codes")) or bool(item.get("slot_expression")),
                f"role_synergies.json {code}: needs either role_codes or slot_expression (doc 03 section 3)",
            )
            for rc in item.get("role_codes") or []:
                require(rc in role_codes, f"role_synergies.json {code}: unknown role_code '{rc}'")
            for fc in item.get("home_formations") or []:
                require(fc in formation_codes, f"role_synergies.json {code}: unknown home_formation '{fc}'")
            for pc in item.get("powers_pattern_codes") or []:
                require(pc in pattern_codes, f"role_synergies.json {code}: unknown pattern code '{pc}'")

    if "role_clashes.json" in files:
        clash_items = files["role_clashes.json"]["items"]
        check_duplicates("role_clashes.json", clash_items, lambda i: i["code"])
        clash_resolvable_codes = role_codes | identity_codes
        for item in clash_items:
            code = item["code"]
            require_fields("role_clashes.json", code, item, CLASH_REQUIRED_FIELDS)
            check_source_ref("role_clashes.json", code, item)

            # trigger_expression is free text (doc 03 section 3), not a
            # structured code list, but it still names role, identity, and
            # pattern codes that must exist. Tokenize and resolve each
            # code-shaped token instead of trusting the prose.
            expr = item.get("trigger_expression", "")
            for tok in SNAKE_CODE_TOKEN_RE.findall(expr):
                require(
                    tok in clash_resolvable_codes,
                    f"role_clashes.json {code}: trigger_expression references unknown code '{tok}'",
                )
            for tok in PATTERN_CODE_TOKEN_RE.findall(expr):
                require(
                    tok in pattern_codes,
                    f"role_clashes.json {code}: trigger_expression references unknown pattern code '{tok}'",
                )

        active_mvp = [item for item in clash_items if item.get("is_active_mvp")]
        require(
            len(active_mvp) == 1 and active_mvp[0]["code"] == "double_exposure_flank",
            "role_clashes.json: exactly one clash, 'double_exposure_flank', should be is_active_mvp "
            "(doc 03 section 3 comment)",
        )

    # -----------------------------------------------------------------
    # Tactics Lab: position_archetypes, archetype_combinations,
    # unit_balance_rules (doc 06 section 2.6 / 3.1, T-102).
    # -----------------------------------------------------------------

    rotation_item_codes: set[str] = set()
    if "rotations.json" in files:
        rotation_item_codes = {item["code"] for item in files["rotations.json"]["items"]}

    # Two rotation namespaces exist from T-103 onward, and an archetype may
    # legitimately enable either: the library rotations (R1, R12, R13) are
    # movement patterns, while rotation_systems (rot_...) are structural
    # rotations, "who changes job" (doc 06 section 2.5). T-102 seeded
    # enables_rotation_codes against the library codes, which is true as
    # written, so those references stay and the check below widens to cover
    # both rather than silently rejecting one namespace or the other. The
    # collision guard is what keeps the widening honest: if the two ever
    # share a code, "resolves" would stop meaning one thing.
    rotation_system_codes: set[str] = set()
    if "rotation_systems.json" in files:
        rotation_system_codes = {item["code"] for item in files["rotation_systems.json"]["items"]}
    for shared in sorted(rotation_item_codes & rotation_system_codes):
        errors.append(
            f"rotation_systems.json {shared}: code collides with the library rotation of the same "
            "code, so enables_rotation_codes could no longer resolve to one thing"
        )
    any_rotation_codes = rotation_item_codes | rotation_system_codes

    position_archetype_codes: dict[str, str] = {}  # code -> slot_family
    if "position_archetypes.json" in files:
        fname = "position_archetypes.json"
        archetype_items = files[fname]["items"]
        check_duplicates(fname, archetype_items, lambda i: i["code"])
        position_archetype_codes = {i["code"]: i.get("slot_family") for i in archetype_items}

        for item in archetype_items:
            code = item["code"]
            require_fields(fname, code, item, ARCHETYPE_REQUIRED_FIELDS)
            check_source_ref(fname, code, item)
            # Archetype copy names real players in exemplar_note, so it is
            # held to the same "curate, never lock" standard as identity
            # copy (doc 03 section 7.6, CLAUDE.md rule 6).
            check_no_banned_identity_phrase_anywhere(fname, code, item)

            require(
                item.get("slot_family") in SLOT_FAMILIES,
                f"{fname} {code}: slot_family '{item.get('slot_family')}' not in {sorted(SLOT_FAMILIES)}",
            )

            # doc 06 section 3.1: "2 to 3 key_attribute_keys drawn strictly
            # from the existing six".
            attrs = item.get("key_attribute_keys") or []
            require(
                2 <= len(attrs) <= 3,
                f"{fname} {code}: key_attribute_keys has {len(attrs)} entries, doc 06 section 3.1 "
                "requires 2 to 3",
            )
            for attr in attrs:
                require(
                    attr in ATTRIBUTE_VOCABULARY,
                    f"{fname} {code}: key_attribute_keys '{attr}' is not one of the six attributes "
                    f"{sorted(ATTRIBUTE_VOCABULARY)}",
                )
            require(
                len(set(attrs)) == len(attrs),
                f"{fname} {code}: key_attribute_keys repeats an attribute",
            )

            # Closed duty vocabulary: adding one is a spec change, not a
            # seed change (doc 06 section 3.1).
            duties = item.get("duties_json") or []
            for duty in duties:
                require(
                    duty in DUTY_VOCABULARY,
                    f"{fname} {code}: duties_json '{duty}' not in the closed duty vocabulary "
                    f"{sorted(DUTY_VOCABULARY)}",
                )
            require(
                len(set(duties)) == len(duties),
                f"{fname} {code}: duties_json repeats a duty",
            )

            foot = item.get("foot_hint")
            require(
                foot is None or foot in FOOT_HINTS,
                f"{fname} {code}: foot_hint must be null or one of {sorted(FOOT_HINTS)}",
            )
            for wr_field in ("awr_default", "dwr_default"):
                require(
                    item.get(wr_field) in WORK_RATES,
                    f"{fname} {code}: {wr_field} must be low|med|high",
                )

            # "needs_around_it (free text, one line)". Non-empty is covered
            # by require_fields; the word floor is what keeps filler like
            # "good players" out, which the ticket calls out by name.
            needs = item.get("needs_around_it") or ""
            require(
                word_count(needs) >= 5,
                f"{fname} {code}: needs_around_it is {word_count(needs)} words, too thin to be a real "
                "requirement",
            )

            for pc in item.get("enables_pattern_codes") or []:
                require(
                    pc in pattern_codes,
                    f"{fname} {code}: enables_pattern_codes references unknown code '{pc}'",
                )
            for rc in item.get("enables_rotation_codes") or []:
                require(
                    rc in any_rotation_codes,
                    f"{fname} {code}: enables_rotation_codes references unknown rotation code '{rc}' "
                    "(neither a library rotation nor a rotation system)",
                )

    if "archetype_combinations.json" in files:
        fname = "archetype_combinations.json"
        combination_items = files[fname]["items"]
        check_duplicates(fname, combination_items, lambda i: i["code"])

        for item in combination_items:
            code = item["code"]
            # what_it_costs is in the required list, so an empty string or a
            # missing key fails here: doc 06 section 3.1 marks it REQUIRED,
            # for the same reason rotation_systems.risk is not nullable.
            require_fields(fname, code, item, COMBINATION_REQUIRED_FIELDS)
            check_source_ref(fname, code, item)
            check_no_banned_identity_phrase_anywhere(fname, code, item)

            unit = item.get("unit")
            require(
                unit in UNIT_VOCABULARY,
                f"{fname} {code}: unit '{unit}' not in {sorted(UNIT_VOCABULARY)}",
            )

            costs = item.get("what_it_costs") or ""
            require(
                word_count(costs) >= 5,
                f"{fname} {code}: what_it_costs is {word_count(costs)} words, too thin to be a real cost",
            )

            for i, slot in enumerate(item.get("slots_json") or []):
                label = f"{code}.slots_json[{i}]"
                archetype_code = slot.get("archetype_code")
                slot_family = slot.get("slot_family")
                require(
                    archetype_code in position_archetype_codes,
                    f"{fname} {label}: archetype_code '{archetype_code}' does not exist in "
                    "position_archetypes.json",
                )
                require(
                    slot_family in SLOT_FAMILIES,
                    f"{fname} {label}: slot_family '{slot_family}' not in {sorted(SLOT_FAMILIES)}",
                )
                if archetype_code in position_archetype_codes:
                    require(
                        position_archetype_codes[archetype_code] == slot_family,
                        f"{fname} {label}: archetype '{archetype_code}' belongs to slot family "
                        f"'{position_archetype_codes[archetype_code]}', not '{slot_family}'",
                    )
                if unit in UNIT_SLOT_FAMILIES:
                    require(
                        slot_family in UNIT_SLOT_FAMILIES[unit],
                        f"{fname} {label}: slot family '{slot_family}' cannot appear in unit '{unit}'",
                    )

            for fc in item.get("home_formations") or []:
                require(
                    fc in formation_codes,
                    f"{fname} {code}: home_formations references unknown formation '{fc}'",
                )

    if "unit_balance_rules.json" in files:
        fname = "unit_balance_rules.json"
        rule_items = files[fname]["items"]
        check_duplicates(fname, rule_items, lambda i: i["code"])

        for item in rule_items:
            code = item["code"]
            require_fields(fname, code, item, BALANCE_RULE_REQUIRED_FIELDS)
            check_source_ref(fname, code, item)

            require(
                item.get("unit") in UNIT_VOCABULARY,
                f"{fname} {code}: unit '{item.get('unit')}' not in {sorted(UNIT_VOCABULARY)}",
            )
            rule_kind = item.get("rule_kind")
            require(
                rule_kind in RULE_KINDS,
                f"{fname} {code}: rule_kind '{rule_kind}' not in {sorted(RULE_KINDS)}",
            )
            require(
                item.get("severity") in SEVERITIES,
                f"{fname} {code}: severity must be note|warning",
            )

            duty = item.get("duty")
            if rule_kind in ("requires_duty", "max_duty"):
                require(
                    duty in DUTY_VOCABULARY,
                    f"{fname} {code}: duty '{duty}' not in the closed duty vocabulary "
                    f"{sorted(DUTY_VOCABULARY)}",
                )
            elif rule_kind == "max_same_archetype":
                require(
                    duty is None,
                    f"{fname} {code}: max_same_archetype counts repeated archetypes, so duty must be null",
                )

            if rule_kind == "requires_duty":
                require(
                    isinstance(item.get("min_count"), int),
                    f"{fname} {code}: requires_duty needs an integer min_count",
                )
            elif rule_kind in ("max_duty", "max_same_archetype"):
                require(
                    isinstance(item.get("max_count"), int),
                    f"{fname} {code}: {rule_kind} needs an integer max_count",
                )

            # "coach-facing, must read as a check not an error" (doc 06
            # section 3.1). The engine may want the flagged combination.
            copy_text = (item.get("warning_copy") or "").lower()
            for banned in BANNED_WARNING_WORDS:
                require(
                    banned not in copy_text,
                    f"{fname} {code}: warning_copy uses '{banned}', which reads as an error rather "
                    "than a check",
                )
            require(
                "check" in copy_text,
                f"{fname} {code}: warning_copy never asks the coach to check anything, so it reads "
                "as a verdict rather than a check",
            )
            check_no_banned_identity_phrase_anywhere(fname, code, item)

    # -----------------------------------------------------------------
    # Tactics Lab part two: rotation_systems, formation_phases,
    # formation_matchups, reference systems (doc 06 sections 2.3 to 2.8
    # and 3.1, T-103).
    # -----------------------------------------------------------------

    if "rotation_systems.json" in files:
        fname = "rotation_systems.json"
        rotation_items = files[fname]["items"]
        check_duplicates(fname, rotation_items, lambda i: i["code"])

        for item in rotation_items:
            code = item["code"]
            # `risk` sits in the required list, so an empty string or a
            # missing key fails right here. doc 06 section 3.1: "risk
            # REQUIRED, not nullable. A rotation without a stated cost
            # fails the validator."
            require_fields(fname, code, item, ROTATION_SYSTEM_REQUIRED_FIELDS)
            check_source_ref(fname, code, item)
            # exemplar_note names real players, so rotation copy is held to
            # the same "curate, never lock" standard as identity copy.
            check_no_banned_identity_phrase_anywhere(fname, code, item)

            require(
                item.get("family") in ROTATION_FAMILIES,
                f"{fname} {code}: family '{item.get('family')}' not in {sorted(ROTATION_FAMILIES)}",
            )
            for fc in item.get("applies_to_formations") or []:
                require(
                    fc in formation_codes,
                    f"{fname} {code}: applies_to_formations references unknown formation '{fc}'",
                )

            # A one-word cost is the marketing version of stating a cost,
            # same word floor as archetype_combinations.what_it_costs.
            risk = item.get("risk") or ""
            require(
                word_count(risk) >= 8,
                f"{fname} {code}: risk is {word_count(risk)} words, too thin to be a real cost",
            )

            require(
                bool(item.get("coaching_points_json")),
                f"{fname} {code}: no coaching points, so the rotation teaches nothing",
            )

            spec = item.get("animation_spec_json")
            validate_animation_spec(fname, code, "animation_spec_json", spec)
            spec_slots = {s.get("slot") for s in (spec or {}).get("slots", [])}
            require(
                bool(spec) and (spec or {}).get("loop") is True,
                f"{fname} {code}: a rotation's animation spec loops (doc 03 section 4.1)",
            )

            for i, move in enumerate(item.get("what_moves_json") or []):
                label = f"{code}.what_moves_json[{i}]"
                for field in ("slot", "from", "to", "becomes"):
                    require(bool(move.get(field)), f"{fname} {label}: missing '{field}'")
                # The board plays what_moves_json through the same slots the
                # animation spec defines, so a slot named in one and absent
                # from the other is a rotation that cannot be animated.
                require(
                    move.get("slot") in spec_slots,
                    f"{fname} {label}: slot '{move.get('slot')}' is not defined in animation_spec_json",
                )
                for end in ("from", "to"):
                    point = move.get(end) or {}
                    for axis in ("x", "y"):
                        value = point.get(axis)
                        require(
                            isinstance(value, (int, float)) and 0 <= value <= 100,
                            f"{fname} {label}: {end}.{axis} must be a model coordinate 0 to 100",
                        )

            profile = item.get("requires_profile_json") or {}
            for slot, need in profile.items():
                label = f"{code}.requires_profile_json.{slot}"
                for ac in need.get("archetypes") or []:
                    require(
                        ac in position_archetype_codes,
                        f"{fname} {label}: archetype '{ac}' does not exist in position_archetypes.json",
                    )
                for attr in need.get("attributes") or []:
                    require(
                        attr in ATTRIBUTE_VOCABULARY,
                        f"{fname} {label}: attribute '{attr}' is not one of the six",
                    )
                require(
                    need.get("foot") in (None, "L", "R"),
                    f"{fname} {label}: foot must be null, 'L' or 'R'",
                )

            # seeds/roles.json's standing convention. A null note claims
            # nothing, which is the honest option when unsure.
            note = item.get("exemplar_note")
            require(
                note is None or note.endswith("Not a licence: names are editorial reference points only."),
                f"{fname} {code}: exemplar_note must end with the standing disclaimer or be null",
            )

    formation_slots: dict[str, dict[str, str]] = {}
    if "formations.json" in files:
        for item in files["formations.json"]["items"]:
            formation_slots[item["code"]] = {
                p["slot"]: p.get("position_code") for p in item.get("positions_json") or []
            }

    phase_reference_codes: set[str] = set()
    if "formation_phases.json" in files:
        fname = "formation_phases.json"
        phase_items = files[fname]["items"]
        check_duplicates(fname, phase_items, lambda i: f"{i['formation_code']}.{i['variant_code']}")

        for item in phase_items:
            key = f"{item.get('formation_code')}.{item.get('variant_code')}"
            require_fields(fname, key, item, PHASE_REQUIRED_FIELDS)
            check_source_ref(fname, key, item)
            check_no_banned_identity_phrase_anywhere(fname, key, item)

            require(
                item.get("phase") in PHASE_VOCABULARY,
                f"{fname} {key}: phase '{item.get('phase')}' not in {sorted(PHASE_VOCABULARY)}",
            )
            expected_phase = STANDARD_VARIANT_PHASE.get(item.get("variant_code"))
            require(
                expected_phase is None or item.get("phase") == expected_phase,
                f"{fname} {key}: variant_code implies phase '{expected_phase}' but the row says "
                f"'{item.get('phase')}'",
            )
            require(
                word_count(item.get("blurb", "")) <= 25,
                f"{fname} {key}: blurb is {word_count(item.get('blurb', ''))} words, over the "
                "25-word limit",
            )

            fc = item.get("formation_code")
            require(fc in formation_codes, f"{fname} {key}: unknown formation_code")

            # THE rule of this table (doc 06 section 3.1): the morph
            # animation binds by slot, so a phase that adds, drops or
            # renames a slot cannot animate, it can only teleport tokens.
            if fc in formation_slots:
                base = formation_slots[fc]
                seeded = {p.get("slot"): p.get("position_code") for p in item.get("positions_json") or []}
                extra = sorted(set(seeded) - set(base))
                missing = sorted(set(base) - set(seeded))
                require(
                    not extra,
                    f"{fname} {key}: positions_json has slot(s) {extra} that the base formation "
                    "does not have",
                )
                require(
                    not missing,
                    f"{fname} {key}: positions_json is missing base formation slot(s) {missing}",
                )
                require(
                    len(item.get("positions_json") or []) == len(base),
                    f"{fname} {key}: positions_json must carry all {len(base)} slots exactly once",
                )
                # Slots never change identity across phases: the left back
                # walking into midfield is still the left back.
                for slot, pc in seeded.items():
                    if slot in base:
                        require(
                            pc == base[slot],
                            f"{fname} {key}: slot '{slot}' is position_code '{pc}' here but "
                            f"'{base[slot]}' in the base formation",
                        )

            for p in item.get("positions_json") or []:
                for axis in ("x", "y"):
                    value = p.get(axis)
                    require(
                        isinstance(value, (int, float)) and 0 <= value <= 100,
                        f"{fname} {key}: slot '{p.get('slot')}' {axis} must be a model "
                        "coordinate 0 to 100",
                    )

            rest_shape = item.get("rest_shape")
            if rest_shape is not None:
                match = REST_SHAPE_RE.match(rest_shape)
                require(
                    match is not None,
                    f"{fname} {key}: rest_shape '{rest_shape}' must look like '3+2'",
                )
                if match:
                    require(
                        int(match.group(1)) + int(match.group(2)) <= 10,
                        f"{fname} {key}: rest_shape '{rest_shape}' asks for more than ten "
                        "outfield players",
                    )

            ref = item.get("reference_code")
            if ref is not None:
                phase_reference_codes.add(ref)
                require(
                    ref in identity_codes,
                    f"{fname} {key}: reference_code '{ref}' is not an identity",
                )
            for rc in item.get("uses_rotations") or []:
                require(
                    rc in rotation_system_codes,
                    f"{fname} {key}: uses_rotations references unknown rotation system '{rc}'",
                )

    if "formation_matchups.json" in files:
        fname = "formation_matchups.json"
        matchup_items = files[fname]["items"]
        check_duplicates(fname, matchup_items, lambda i: f"{i['ours_code']}.{i['theirs_code']}")

        for item in matchup_items:
            ours = item.get("ours_code")
            theirs = item.get("theirs_code")
            key = f"{ours}.{theirs}"
            require_fields(fname, key, item, MATCHUP_REQUIRED_FIELDS)
            check_source_ref(fname, key, item)
            check_no_banned_identity_phrase_anywhere(fname, key, item)

            require(ours in formation_codes, f"{fname} {key}: unknown ours_code")
            require(theirs in formation_codes, f"{fname} {key}: unknown theirs_code")
            # doc 06 section 3.1: normalised at seed time, so the pair is
            # stored once rather than twice with drifting copy.
            require(
                isinstance(ours, str) and isinstance(theirs, str) and ours < theirs,
                f"{fname} {key}: (ours_code, theirs_code) must be normalised with "
                "ours_code < theirs_code",
            )
            require(
                item.get("route_kind") in ROUTE_KINDS,
                f"{fname} {key}: route_kind '{item.get('route_kind')}' not in {sorted(ROUTE_KINDS)}",
            )
            # doc 06 section 2.8's three-step read, in order: where our
            # spare man is, where we are short, which route connects them.
            # A card missing a step is a card that teaches a different
            # thing from every other card.
            require(
                bool(item.get("our_edges_json")),
                f"{fname} {key}: no our_edges_json, so step one of the read is missing",
            )
            require(
                bool(item.get("their_edges_json")),
                f"{fname} {key}: no their_edges_json, so step two of the read is missing",
            )

    for fname in identity_files:
        if files[fname].get("kind") != "reference_system":
            continue
        for item in files[fname]["items"]:
            code = item["code"]
            # doc 06 section 2.5: every card carries base formation, the
            # phase variant it produces, rotations used, keystone profiles,
            # a youth takeaway and one honest risk line. identities has no
            # column for the rotations or the risk line, so core_idea
            # carries them behind fixed markers.
            core = item.get("core_idea", "")
            require(
                core.startswith("Formation:"),
                f"{fname} {code}: reference system core_idea must lead with 'Formation:'",
            )
            for marker in REFERENCE_SYSTEM_MARKERS:
                require(
                    marker in core,
                    f"{fname} {code}: reference system core_idea is missing its '{marker}' line",
                )
            require(
                bool(item.get("keystone_roles_json")),
                f"{fname} {code}: reference system names no keystone profiles",
            )
            require(
                item.get("formation_code") is not None,
                f"{fname} {code}: reference system must name its base formation",
            )
            # The phase variant a reference system produces IS a
            # formation_phases row pointing back at it. Without one the
            # card describes a shape nothing can render.
            require(
                code in phase_reference_codes,
                f"{fname} {code}: no formation_phases row carries reference_code '{code}', so "
                "the system names no phase variant",
            )

    if errors:
        print("\n".join(errors))
        print(f"validate-seeds: FAILED, {len(errors)} error(s)")
        return 1

    total_items = sum(len(f.get("items", [])) for f in files.values())
    print(f"validate-seeds: {len(files)} seed file(s), {total_items} item(s), all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
