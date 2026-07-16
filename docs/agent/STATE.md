# Orchestrator state snapshot

Written 2026-07-16 (session 2 handoff). Read this WITH CLAUDE.md and BACKLOG.md when resuming orchestration in a fresh session. BACKLOG.md remains the ticket status source of truth; this file carries session context the backlog does not.

## Done and merged to main (all via PRs; sessions 1 + 2)

| PR | Tickets | Notes |
|---|---|---|
| #1-#6 | T-001..004, T-010, T-011, T-020..022 | Session 1: platform, content, board engine |
| #7 | T-030 | Whiteboard page. Root-cause fix: View menu popover intercepted recorded drags |
| #8 | T-031 | Patterns page + the seed-on-boot infra fix (scripts/dev.sh now migrates AND seeds on every boot; CI/fresh checkouts were failing without it) |
| #9 | T-033 | Roster page. Migration 0003 players.flank |
| #10 | T-032 | Formations page + rondo map. Reuses T-031's PatternPreviewBoard |
| #11 | T-034 | Identity page. NOTE: merged before its PR check registered (process gap, fixed; post-merge CI on main was green) |
| #12 | T-040 | Permission suite (Brief §3 table, table-driven test names). Zero enforcement gaps found; purely additive |
| #13 | T-041 | Playstyle suggestion flow. No migration (table existed in 0002). Ships a name-match auto-claim of roster rows (see decisions below) |
| #14 | T-043 | Founder-directed: role-scoped join codes (migration 0004) + head-coach member management |
| #15 | T-012 | Founder-directed: identities.age_hint (migration 0005, re-pointed from 0004 at merge) |

main == integration at PR #15 plus backlog/state chores. Every ticket was independently re-verified by the orchestrator (make verify, EXIT CODE checked) in its worktree AND after its integration merge.

## Founder decisions recorded 2026-07-16 (all six former open questions are CLOSED)

1. Join codes are role-scoped: player code + coach code per team; the code determines the role on join, the account role never does. Head coach (= team creator, teams.created_by) can remove members and change member roles. Implemented in T-043.
2. Join codes are coach-only in API payloads (keys absent for players). Implemented in T-043; T-040's pinned-ambiguity test was replaced with the new contract.
3. identities.age_hint: schema amended via migration; all 27 identities backfilled (editorial U9+/U11+/U13+/U15+ scale; Bible 8.2.4 gives a rule, not a table). Founder will review the hints during post-deploy content QA. Implemented in T-012.
4. Blurb spot-check sign-off: founder will do their own QA after deploy. No further action.
5. Mid-playback orientation flips: not wanted; rotation between runs is the contract. Closed.
6. Player.flank column: accepted as shipped (migration 0003).

Open items surfaced to the founder, awaiting reaction (NOT blocking):
- T-041's roster-row linkage is a name-match auto-claim (exactly-one unclaimed row matching display_name claims it on the player's roster fetch). Replaceable by head-coach row assignment if the founder prefers.
- T-043 member removal is a hard delete, no audit trail; removed members rejoin by code.
- T-060 deploy credentials decision: STOP and ask before deploying.

## Working agreements (carried + new this session)

- Orchestrator creates AND merges PRs once CI is green. Flow per ticket: agent completes in worktree -> orchestrator reviews diff + reruns make verify -> merge to integration -> verify again -> push -> PR to main -> confirm CI pass on the PR's CURRENT head -> squash merge -> reconcile origin/main back into integration -> BACKLOG status -> remove worktree -> dispatch next.
- One ticket per PR. Squash titles: feat(scope): title (T-###).
- SQUASH-MERGE HISTORY: after every squash merge, `git fetch origin main && git merge origin/main` into integration immediately. Skipping this causes phantom conflicts on the next PR (hit once at PR #8; the reconcile merge is always content-empty when done promptly).
- VERIFY EXIT CODES: never pipe make verify to tail (pipeline exit code masked a red verify once). Run `make verify > log 2>&1; echo "VERIFY_EXIT=$?"` and read the log tail separately. Never chain push/PR-create behind a verify.
- CI GATING: `gh pr checks N --watch` right after a push can exit "no checks reported". Poll `gh pr checks N` until an actual pass/fail registers (30s interval loop); never treat absence of checks as green. Confirm the pass is for the PR's current head SHA before merging.
- MIGRATION PARALLELISM: agents building in parallel branch off the same alembic head; whichever merges second gets its revision/down_revision re-pointed by the orchestrator at merge (T-012 became 0005 this way). Always prove the chain from zero afterward (fresh DATABASE_URL, alembic upgrade head).
- AGENT DISPATCH PROMPTS must include: explicit Playwright timeouts (--timeout=30000 --global-timeout=200000), no foreground servers, no headed/--ui/page.pause, dedicated ports, "confirm the verify EXIT CODE, not the eyeballed tail", and "NEVER end your turn to wait for a background task; poll its output file with Read inside the same turn" (three agents stalled out on this pattern before the instruction was added).
- Ports per ticket (used so far): T-030 8130/5530, T-031 8131/5531, T-032 8132/5532, T-033 8133/5533, T-034 8134/5534, T-040 8140/5540, T-041 8141/5541, T-043 8143/5543, T-012 8112/5312. Scheme: 81## API / 55## web keyed to ticket number.
- Agents that die (stream timeout / watchdog) leave work safely on disk in their worktree; resume the SAME agent via SendMessage first (context intact); dispatch a fresh agent to adopt the worktree only if resume fails repeatedly.
- Environment: gh CLI authenticated (BrandanBurgess); no MCP servers (gh substitutes for github MCP); git push via keychain.
- scripts/dev.sh migrates AND seeds on every boot (idempotent); CI and fresh checkouts depend on this. Do not remove the seed line.

## Architecture notes for future tickets

- Nav shell: AppShell takes an enabledKeys prop; pages activate via ENABLED_NAV_KEYS in App.tsx only. All five entries are live; AppShell.tsx should not need edits.
- Read-only board rendering: frontend/src/board/PatternPreviewBoard.tsx (autoplay, pulsing tokens, zone overlays) + pages/patternPreview.ts converters. Formations/Identity reuse it; T-042 session thumbnails should too.
- Coach-only payload pattern: split schemas (RosterOut/CoachRosterOut, TeamOut/CoachTeamOut) with response_model=None and manual model_dump, so coach-only keys are ABSENT for players, never null. Follow for receipts in T-042 (players must never see receipt data, Brief §5).
- Permission tests: backend/tests/test_permissions.py is table-driven against Brief §3, one named test per row. Two rows are @pytest.mark.skip placeholders: "suggest own playstyle" (routes now exist from T-041; un-skip in T-042) and "sessions" (T-042 implements + un-skips).
- Head-coach gate: app/deps.py require_head_coach (creator check), separate from require_role_on_team.
- Roster row <-> user linkage: name-match auto-claim in roster.py _claim_matching_row. T-042's player session views key off membership, not roster rows, but be aware of it.
- Alembic head: 0005_identity_age_hint. Chain 0001..0005 proven from zero.

## Queue for the next session

1. T-042 sessions (collab): draft builder + picker w/ thumbnails, send, receipts, player view w/ Watch deep-link + Mark as watched (PNG 21-23, 26, 28). Deps all met. Must also un-skip/implement the two skipped permission-suite rows. Suggested ports 8142/5542.
2. T-050 phone pass (screens): icon rail, stacked grids, portrait boards all surfaces, cross-device save/replay test. Deps: T-042.
3. T-051 hardening (verifier): full em-dash sweep, permission suite in CI, demo-path e2e (Brief §6 narrative, one Playwright journey, both viewports). Deps: T-050.
4. T-060 deploy (platform): Render + Litestream + prod Turso decision. STOP for the founder's deploy credentials decision before any deploy action.
