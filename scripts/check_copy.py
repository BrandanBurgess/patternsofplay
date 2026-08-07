#!/usr/bin/env python3
"""Copy check: fail the build if the em dash character appears in any
user-facing source or seed file. CLAUDE.md rule 3 and Brief section 2.

docs/source is excluded on purpose: raw product docs are allowed to
contain the character; transformed output is not.
"""

import pathlib
import sys

EM_DASH = "—"
# scripts/ is scanned because scripts/seed_demo.py writes real user-facing
# copy (a coach note, a team name, a session title) straight into the demo
# database, and README.md because it is the product's own shop window.
SCAN_DIRS = [
    "frontend/src",
    "frontend/index.html",
    "backend/app",
    "seeds",
    "e2e",
    "scripts",
    "README.md",
]

# The two files whose JOB is the character itself: this scanner and the
# seed validator both have to name it to look for it. backend/tests is not
# scanned for the same reason in reverse: several tests assert the
# character is ABSENT from a payload, which means writing it down.
EXEMPT = {"scripts/check_copy.py", "scripts/validate_seeds.py"}
EXTENSIONS = {".py", ".ts", ".tsx", ".css", ".html", ".json", ".yaml", ".yml", ".md"}

root = pathlib.Path(__file__).resolve().parent.parent
failures: list[str] = []

for entry in SCAN_DIRS:
    base = root / entry
    if not base.exists():
        continue
    paths = [base] if base.is_file() else sorted(base.rglob("*"))
    for path in paths:
        if not path.is_file() or path.suffix not in EXTENSIONS:
            continue
        if str(path.relative_to(root)) in EXEMPT:
            continue
        text = path.read_text(encoding="utf-8")
        for lineno, line in enumerate(text.splitlines(), start=1):
            if EM_DASH in line:
                failures.append(f"{path.relative_to(root)}:{lineno}: em dash found")

if failures:
    print("\n".join(failures))
    print(f"check-copy: FAILED, {len(failures)} em dash occurrence(s)")
    sys.exit(1)

print("check-copy: no em dashes found")
