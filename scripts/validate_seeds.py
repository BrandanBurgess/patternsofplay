#!/usr/bin/env python3
"""Seed validator stub for T-001.

The full validator (required fields per Bible 8.2, blurb length, banned
identity phrases, slot reference resolution) lands with T-011 per doc 03.
Until seed files exist, this checks that anything under seeds/ parses as
JSON so the CI hook is live from day one.
"""

import json
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent
seeds = root / "seeds"

files = sorted(seeds.rglob("*.json")) if seeds.exists() else []

if not files:
    print("validate-seeds: no seed files yet, stub passes (full validator lands in T-011)")
    sys.exit(0)

errors: list[str] = []
for f in files:
    try:
        json.loads(f.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.append(f"{f.relative_to(root)}: invalid JSON: {exc}")

if errors:
    print("\n".join(errors))
    sys.exit(1)

print(f"validate-seeds: {len(files)} seed file(s) parse as JSON (full rules land in T-011)")
