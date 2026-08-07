.PHONY: bootstrap dev migrate lint typecheck test e2e verify seed seed-demo demo check-copy permissions screenshots

VENV := .venv
PY := $(VENV)/bin/python

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

check-copy:
	$(PY) scripts/check_copy.py
	$(PY) scripts/validate_seeds.py

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
