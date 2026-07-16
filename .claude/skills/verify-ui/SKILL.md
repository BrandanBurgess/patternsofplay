---
name: verify-ui
description: Playwright self-verification contract for Patterns of Play. Load before any UI ticket or verification pass. Covers the two mandatory viewports, the clean-page assertions, and what a ticket journey must include.
---
# UI self-verification

Every UI ticket ships a Playwright journey in e2e/ that runs under BOTH configured projects automatically:
- mobile: iPhone 13 (390x844, touch) . board surfaces render PORTRAIT here
- desktop: 1440x900

## Mandatory per journey
1. Import { test, expect, assertCleanPage } from e2e/fixtures.ts. Never write raw @playwright/test imports.
2. Cover each DoD line of your ticket (Brief §5) as an assertion, comment the DoD line above it.
3. End every journey with assertCleanPage(page, issues): zero console errors, zero failed requests, zero 5xx, no horizontal overflow.
4. Board tickets add: record in one orientation, replay in the other, assert positions match (round-trip).
5. Theme check: run the primary assertion path once per theme via html[data-theme] where the ticket touches themed surfaces.
6. Role check: if the surface differs by role, journey runs both roles; assert coach-only elements are ABSENT from the DOM for players (not hidden).

## Running
make dev (web :5173, api :8000) then make e2e. Or make verify for the full gate. A UI ticket without its journey fails review; do not ask, just include it.
