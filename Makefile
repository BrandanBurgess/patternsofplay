.PHONY: bootstrap dev migrate lint typecheck test e2e verify seed seed-demo demo check-copy permissions screenshots

VENV := .venv
PY := $(VENV)/bin/python

# T-109: derive a stable, distinct POP_WEB_PORT / POP_API_PORT pair from
# this checkout's own path, so `make dev` / `make e2e` / `make verify` no
# longer collide when several ticket worktrees run them at the same time.
# Before this, both defaulted to 5173/8000 everywhere (scripts/dev.sh's
# fallback, playwright.config.ts's fallback), so a second worktree's
# `make verify` would find the FIRST worktree's dev server already
# listening (reuseExistingServer is true outside CI) and quietly test the
# wrong worktree's code against the wrong worktree's database. That
# doesn't fail loudly, it looks exactly like a flaky assertion, and it
# cost this epic several false diagnoses (doc 06 section 6, T-109).
#
# `?=` means an explicit `POP_WEB_PORT=7673 POP_API_PORT=10500 make
# verify` (or an exported value from the shell) always wins over this
# default, so the manual override every ticket in this epic already
# relied on keeps working unchanged, including running two worktrees on
# the SAME two ports on purpose (e.g. one at a time, by hand).
#
# CURDIR is make's own absolute working directory (set once at startup,
# unaffected by any `cd` inside a recipe), so it is exactly the
# per-worktree checkout path. cksum is POSIX and present on both macOS
# and the Linux CI runner, so this needs no new dependency. Folding the
# checksum into 0-999 keeps the derived ports inside a low-collision,
# non-privileged range (5173-6172 for web, 8000-8999 for api) without a
# real port-availability probe, which is unnecessary here: CI only ever
# runs one checkout at a time, so its derived pair is simply "some
# deterministic port instead of 5173", never a coordination problem.
#
# `printf '%s'`, not `echo -n`: make always runs shell functions through
# /bin/sh regardless of the caller's login shell, and /bin/sh's builtin
# echo does not honour -n on macOS OR on Debian/Ubuntu's dash (the CI
# runner's /bin/sh), so `echo -n "$(CURDIR)"` hashes the literal 4
# characters "-n " glued onto the path instead of the path alone. Still
# deterministic, but needlessly fragile; printf has no such flag ambiguity
# in any POSIX shell.
WORKTREE_OFFSET := $(shell printf '%s' "$(CURDIR)" | cksum | awk '{print $$1 % 1000}')
export POP_WEB_PORT ?= $(shell echo $$(( 5173 + $(WORKTREE_OFFSET) )))
export POP_API_PORT ?= $(shell echo $$(( 8000 + $(WORKTREE_OFFSET) )))

bootstrap:
	python3 -m venv $(VENV)
	$(VENV)/bin/pip install --quiet --upgrade pip
	$(VENV)/bin/pip install --quiet -e "./backend[dev]"
	npm install --no-fund --no-audit

dev:
	bash scripts/dev.sh

migrate:
	$(PY) -m alembic -c backend/alembic.ini upgrade head

lint:
	$(VENV)/bin/ruff check backend
	npm --workspace frontend run lint

typecheck:
	$(VENV)/bin/mypy backend/app
	npm --workspace frontend run typecheck

test:
	$(VENV)/bin/pytest backend/tests -q
	npm --workspace frontend run test

e2e:
	npx playwright test

# Static source guards. check_palette.py is here rather than in the vitest
# suite because it reads the shipped CSS text, which vitest stubs out.
check-copy:
	$(PY) scripts/check_copy.py
	$(PY) scripts/validate_seeds.py
	$(PY) scripts/check_palette.py

# The Brief section 3 permission table, every row (backend/tests/test_permissions.py).
# `make test` already runs it, but this target also fails when a row is
# SKIPPED rather than asserted: two rows sat as @pytest.mark.skip
# placeholders for most of the build, and a green suite that quietly stops
# checking a permission row is exactly the failure mode worth pinning.
permissions:
	@out=$$($(VENV)/bin/pytest backend/tests/test_permissions.py -q --no-header 2>&1); \
	status=$$?; \
	echo "$$out"; \
	if [ $$status -ne 0 ]; then exit $$status; fi; \
	if echo "$$out" | grep -q "skipped"; then \
		echo "permissions: FAILED, a Brief section 3 row is skipped, not enforced"; \
		exit 1; \
	fi; \
	echo "permissions: every Brief section 3 row enforced, none skipped"

seed:
	$(PY) scripts/seed.py

seed-demo:
	$(PY) scripts/seed_demo.py

# One command before a meeting: throw the dev database away, rebuild it
# from the migration chain, load the library content, then populate one
# realistic team (roster with a live fit warning, a recorded pattern, a
# sent session with a receipt). Prints the demo credentials at the end.
# The rm is why this is a separate target from `seed`: `make dev` must
# never destroy data, and this always starts from zero.
demo:
	rm -f dev.db dev.db-wal dev.db-shm
	$(PY) -m alembic -c backend/alembic.ini upgrade head
	$(PY) scripts/seed.py
	$(PY) scripts/seed_demo.py

# Marketing shots for docs/screenshots/ and the README. Reseeds the demo
# database first so the captures always show the same content, then drives
# the real UI (e2e/screenshots.spec.ts, which skips unless POP_SCREENSHOTS
# is set, so `make verify` never rewrites the images). Stop any running
# `make dev` first: this drops and rebuilds the database underneath it.
screenshots: demo
	POP_SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts \
		--project=desktop --timeout=60000 --global-timeout=300000

verify: check-copy permissions lint typecheck test e2e
	@echo "verify: all green"
