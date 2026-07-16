#!/usr/bin/env python3
"""Seed validator (doc 03 section 8.3): required fields, blurb length,
banned characters, banned identity phrases, animation slot references
resolve, pattern codes referenced by identities and rondo zones exist.

T-011 is the ticket that formally hardens and tests this validator; it
already has to be real and passing for T-010's seed files to satisfy doc
03, so the checks below are not a stub. `make check-copy` runs this
alongside the em-dash scan on every commit (doc 03 section 8.5).
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEEDS = ROOT / "seeds"
BACKEND = ROOT / "backend"

sys.path.insert(0, str(BACKEND))
from app.specs import AnimationSpec  # noqa: E402
from pydantic import ValidationError  # noqa: E402

EM_DASH = "—"
BANNED_IDENTITY_PHRASES = ["correct", "right way", "off-identity"]
SOURCE_REF_RE = re.compile(r"^bible:")
POSITION_CODES = {"GK", "CB", "FB", "WB", "DM", "CM", "AM", "W", "ST", "SS"}

errors: list[str] = []


def word_count(s: str) -> int:
    return len(re.findall(r"\S+", s))


def require(cond: bool, msg: str) -> None:
    if not cond:
        errors.append(msg)


def check_no_em_dash(fname: str, code: str, field: str, value: object) -> None:
    if isinstance(value, str) and EM_DASH in value:
        errors.append(f"{fname} {code}.{field}: contains an em dash")


def check_no_banned_identity_phrase(fname: str, code: str, field: str, value: object) -> None:
    if not isinstance(value, str):
        return
    lowered = value.lower()
    for phrase in BANNED_IDENTITY_PHRASES:
        if phrase in lowered:
            errors.append(f"{fname} {code}.{field}: banned identity phrase '{phrase}'")


def load(fname: str) -> dict:
    return json.loads((SEEDS / fname).read_text(encoding="utf-8"))


def validate_animation_spec(fname: str, code: str, field: str, spec: dict | None) -> None:
    if spec is None:
        return
    try:
        AnimationSpec.model_validate(spec)
    except ValidationError as exc:
        errors.append(f"{fname} {code}.{field}: invalid animation spec: {exc}")


def main() -> int:
    if not SEEDS.exists():
        print("validate-seeds: no seeds/ directory, nothing to validate")
        return 0

    files = {p.name: load(p.name) for p in sorted(SEEDS.glob("*.json"))}
    if not files:
        print("validate-seeds: no seed files yet")
        return 0

    pattern_codes: set[str] = set()
    library_files = [f for f in ("patterns.json", "deliveries.json", "rotations.json") if f in files]
    for fname in library_files:
        for item in files[fname]["items"]:
            code = item.get("code", "?")
            if code in pattern_codes:
                errors.append(f"{fname} {code}: duplicate library_items code")
            pattern_codes.add(code)

            for field in (
                "blurb", "when_to_use", "coaching_points_json", "roles_involved",
                "youth_takeaway", "age_hint", "source_ref", "content_version", "category",
            ):
                require(bool(item.get(field)), f"{fname} {code}: missing required field '{field}'")

            blurb = item.get("blurb", "")
            require(
                word_count(blurb) <= 25,
                f"{fname} {code}: blurb is {word_count(blurb)} words, over the 25-word limit",
            )
            require(
                bool(item.get("animation_spec_json")),
                f"{fname} {code}: missing animation_spec_json (required for every pattern/delivery/rotation)",
            )
            sref = item.get("source_ref") or ""
            require(bool(SOURCE_REF_RE.match(sref)), f"{fname} {code}: source_ref '{sref}' must start with 'bible:'")

            check_no_em_dash(fname, code, "blurb", blurb)
            validate_animation_spec(fname, code, "animation_spec_json", item.get("animation_spec_json"))

    formation_codes: set[str] = set()
    if "formations.json" in files:
        for item in files["formations.json"]["items"]:
            formation_codes.add(item["code"])
            require(
                word_count(item.get("shape_blurb", "")) <= 25,
                f"formations.json {item['code']}: shape_blurb over the 25-word limit",
            )
            check_no_em_dash("formations.json", item["code"], "shape_blurb", item.get("shape_blurb"))

    if "formation_keystones.json" in files:
        for item in files["formation_keystones.json"]["items"]:
            key = f"{item['formation_code']}.{item['slot']}"
            require(
                item["formation_code"] in formation_codes,
                f"formation_keystones.json {key}: unknown formation_code",
            )
            require(bool(item.get("blurb")), f"formation_keystones.json {key}: missing blurb")
            check_no_em_dash("formation_keystones.json", key, "blurb", item.get("blurb"))

    if "rondo_zones.json" in files:
        for item in files["rondo_zones.json"]["items"]:
            key = f"{item['formation_code']}.{item['zone_key']}"
            require(
                item["formation_code"] in formation_codes,
                f"rondo_zones.json {key}: unknown formation_code",
            )
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

    identity_codes: set[str] = set()
    identity_files = [
        f
        for f in ("identities_archetypes.json", "identities_reference_teams.json", "identities_cult_corner.json")
        if f in files
    ]
    for fname in identity_files:
        kind = files[fname].get("kind")
        for item in files[fname]["items"]:
            code = item["code"]
            if code in identity_codes:
                errors.append(f"{fname} {code}: duplicate identity code")
            identity_codes.add(code)

            for field in ("tag_line", "core_idea", "youth_takeaway", "shape_render", "source_ref"):
                require(bool(item.get(field)), f"{fname} {code}: missing required field '{field}'")

            require(
                word_count(item.get("tag_line", "")) <= 25,
                f"{fname} {code}: tag_line over the 25-word limit",
            )

            for field in ("tag_line", "core_idea", "youth_takeaway"):
                check_no_em_dash(fname, code, field, item.get(field))
                check_no_banned_identity_phrase(fname, code, field, item.get(field))

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

    if "roles.json" in files:
        role_codes = {item["code"] for item in files["roles.json"]["items"]}
        for item in files["roles.json"]["items"]:
            code = item["code"]
            require(item["position_code"] in POSITION_CODES, f"roles.json {code}: unknown position_code")
            require(
                item.get("awr_default") in ("low", "med", "high"),
                f"roles.json {code}: awr_default must be low|med|high",
            )
            require(
                item.get("dwr_default") in ("low", "med", "high"),
                f"roles.json {code}: dwr_default must be low|med|high",
            )
            for pc in item.get("enables_pattern_codes") or []:
                require(
                    pc in pattern_codes,
                    f"roles.json {code}: enables_pattern_codes references unknown code '{pc}'",
                )
    else:
        role_codes = set()

    if "role_synergies.json" in files:
        for item in files["role_synergies.json"]["items"]:
            code = item["code"]
            for rc in item.get("role_codes") or []:
                require(rc in role_codes, f"role_synergies.json {code}: unknown role_code '{rc}'")
            for fc in item.get("home_formations") or []:
                require(fc in formation_codes, f"role_synergies.json {code}: unknown home_formation '{fc}'")
            for pc in item.get("powers_pattern_codes") or []:
                require(pc in pattern_codes, f"role_synergies.json {code}: unknown pattern code '{pc}'")

    if "role_clashes.json" in files:
        active_mvp = [item for item in files["role_clashes.json"]["items"] if item.get("is_active_mvp")]
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
