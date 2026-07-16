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
from app.specs import AnimationSpec, Trajectory  # noqa: E402
from pydantic import ValidationError  # noqa: E402
from typing import get_args  # noqa: E402

EM_DASH = "—"
BANNED_IDENTITY_PHRASES = ["correct", "right way", "off-identity"]
SOURCE_REF_RE = re.compile(r"^bible:")
TRAJECTORY_VALUES = set(get_args(Trajectory))

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
    "code", "name", "tag_line", "core_idea", "youth_takeaway", "shape_render",
    "source_ref", "content_version",
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
        for f in ("identities_archetypes.json", "identities_reference_teams.json", "identities_cult_corner.json")
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

    if errors:
        print("\n".join(errors))
        print(f"validate-seeds: FAILED, {len(errors)} error(s)")
        return 1

    total_items = sum(len(f.get("items", [])) for f in files.values())
    print(f"validate-seeds: {len(files)} seed file(s), {total_items} item(s), all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
