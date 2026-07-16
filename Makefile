.PHONY: bootstrap dev lint typecheck test e2e verify seed check-copy

VENV := .venv
PY := $(VENV)/bin/python

bootstrap:
	python3 -m venv $(VENV)
	$(VENV)/bin/pip install --quiet --upgrade pip
	$(VENV)/bin/pip install --quiet -e "./backend[dev]"
	npm install --no-fund --no-audit

dev:
	bash scripts/dev.sh

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

verify: check-copy lint typecheck test e2e
	@echo "verify: all green"
