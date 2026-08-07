.PHONY: bootstrap dev migrate lint typecheck test e2e verify seed seed-demo demo check-copy

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

verify: check-copy lint typecheck test e2e
	@echo "verify: all green"
