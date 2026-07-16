# Orchestrator state snapshot

Written 2026-07-16. Read this WITH CLAUDE.md and BACKLOG.md when resuming orchestration in a fresh session. BACKLOG.md remains the ticket status source of truth; this file carries session context that the backlog does not.

## Done and merged to main (all via CI-green PRs)

| PR | Tickets | Notes |
|---|---|---|
| #1 | T-001, T-002, T-003, T-020 | Batched only because GitHub auth arrived late; per-ticket PRs from #2 on |
| #2 | T-021 | Lane graph + marking rings |
| #3 | T-004 | Scoped query layer + full doc 03 schema (20 tables) |
| #4 | T-022 | Zones + animation player + recorder. Board engine complete |
| #5 | T-010 | All Bible seed content, idempotent loader |
| #6 | T-011 | Hardened seed validator; T-010 content had zero violations |

main == integration at PR #6 plus backlog chores. Every ticket was independently re-verified by the orchestrator (make verify) before its integration merge and again after.

## Working agreements established this session

- Orchestrator creates AND merges PRs itself once gh pr checks is green (user instruction 2026-07-16). Permission rules for gh pr create/merge/view/checks live in .claude/settings.local.json.
- Flow per ticket: agent completes in worktree -> orchestrator reviews diff + reruns make verify -> merge to integration -> verify again -> push -> PR to main -> watch checks -> merge -> BACKLOG status -> remove worktree -> dispatch next ready tickets.
- One ticket per PR (push integration up to a cutoff commit if two tickets are locally merged).
- Worktrees at ../pop-T### with branch feat/T###-slug, based on integration.
- Every agent gets dedicated ports to avoid e2e collisions: POP_API_PORT / POP_WEB_PORT (scheme used so far: T-002 8102/5273, T-003 8103/5373, T-004 8104/5374, T-010 8110/5310, T-011 8111/5311, T-020 8120/5520, T-021 8121/5521, T-022 8122/5522, T-030 8130/5530).
- Agents must run Playwright with explicit --timeout=30000 --global-timeout=200000 and never run make dev in the foreground, never headed/--ui/page.pause (a silent 600s command kills the agent via watchdog).
- Environment: gh CLI is authenticated (BrandanBurgess); no MCP servers configured (github/render/turso absent, gh CLI substitutes for github MCP); git push works via keychain.

## IN FLIGHT: T-030 whiteboard page (needs adoption by the resuming session)

- Worktree /Users/brandanburgess/Documents/pop-T030, branch feat/T030-whiteboard-page (base 475a21b). ~29 files changed, NOTHING COMMITTED yet.
- Built so far: backend/app/routers/whiteboard.py + backend/tests/test_whiteboard_routes.py (saved patterns + boards routes via scoped layer), whiteboard page UI, nav shell, e2e/whiteboard.spec.ts; TeamDashboard.tsx renamed to TeamMeta.tsx; e2e/fixtures.ts was modified (REVIEW THIS: the clean-page contract assertions must remain intact; the agent never delivered its justification).
- Current test status (orchestrator-run): e2e/whiteboard.spec.ts = 5 passed, 1 failed. Failing: "full coach journey" on desktop at the reload-restores-state step; zone-toggle-thirds unchecked after reload (boards row round trip loses zones_visible on write or rehydrate). The agent's last hypothesis under investigation: the open view menu interferes with the drag step.
- The original agent hit 3 watchdog stalls + 1 connection drop in this session and its background task is dead. Resuming session should dispatch a FRESH screens agent to adopt the worktree: fix the failing journey in product code (not by weakening the test), full verify, commit, then the standard merge/PR loop.
- T-030 dispatch requirements (from the original brief): PNGs 01-05, 14, 34 + design README lines 39/50 + Brief step 16 + doc 03 4.2/4.3; role rules (author-stamp server-side, coach-only delete = API 403 for players); board state persists to boards row, reload restores; no localStorage; keep all existing board/lane/zone/player/recorder e2e assertions intact.

## Queue after T-030 merges

1. Dispatch T-031 (patterns page) and T-033 (roster page) in parallel; T-030's nav ships inert placeholder entries, each page activates its own (trivial expected conflict, orchestrator resolves at merge).
2. Then T-032 + T-034 (deps T-031), then T-040 -> T-041 -> T-042 (collab), T-050 (phone), T-051 (hardening), T-060 (deploy; STOP for the founder's deploy credentials decision per the bootstrap prompt).

## Open founder questions (defaults shipped, not blocking)

1. T-003: a coach account joining another team's code becomes coach on that team; should join-by-code force player instead?
2. T-003: join codes are returned by the API to any team member (UI shows them to coaches only); Brief section 3 does not list them coach-only. Confirm before T-040 locks the pattern.
3. T-010: doc 03 section 5 identities schema has no age_hint column but Bible 8.2.4 wants an age hint per card; doc 03 won per CLAUDE.md. Amend doc 03 and add a migration?
4. T-010: founder spot-check sign-off on transformed blurbs is still open (Brief section 5 content DoD line 4; orchestrator spot-check passed).
5. T-022: mid-playback orientation flips are unsupported by design (rotation between runs works, satisfying the DoD); fine, or wanted for T-030+?
