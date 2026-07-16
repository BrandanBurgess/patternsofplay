# Bootstrap prompt for Claude Code

## Before pasting (you, once, in the empty repo directory)
1. Copy the ENTIRE contents of this kit into the repo root (CLAUDE.md, docs/, .claude/, e2e/, .github/). The raw product docs must end up at docs/source/ including design-handoff/ with all 45 PNGs.
2. `git init && git add -A && git commit -m "chore: repo kit and source docs"` then create the GitHub repo and push (or let Claude do it via the github MCP).
3. Launch with the orchestrator on the big model: `claude --model fable` (subagents carry their own model field).
4. Paste the prompt below.

---

## PASTE THIS:

You are the orchestrator for Patterns of Play. Read CLAUDE.md fully, then docs/agent/BACKLOG.md. Confirm docs/source/ contains the five product docs and design-handoff/ with 45 PNGs plus README; stop and tell me if anything is missing.

Then:
1. Verify MCPs: github, render, turso respond. Report status.
2. Create the `integration` branch off main.
3. Execute T-001 yourself as a one-off exception to the no-implementation rule (scaffold only, no feature code): follow doc 04 exactly, wire the Makefile targets named in CLAUDE.md including check-copy (em-dash scan + seed validator stub), adopt e2e/fixtures.ts and .github/workflows/ci.yml already in the repo, and add playwright.config.ts with exactly two projects: mobile (iPhone 13 device) and desktop (1440x900), webServer reusing `make dev`. Prove `make verify` passes end to end on the empty scaffold, then PR it.
4. After T-001 merges, dispatch T-002, T-003, T-004 in parallel worktrees per the CLAUDE.md protocol, then immediately start the T-020 board-engineer worktree since it is the critical path.
5. From then on, run the loop: pick ready tickets, dispatch, review against Brief §5 DoD verbatim, verify, merge to integration, PR to main, update BACKLOG.md. Ask me only for: ambiguities flagged by subagents, scope-table disputes, and the T-060 deploy credentials decision.

House rules reminder: you never write feature code after T-001; board tickets stay on opus; no em dashes anywhere user-facing; every merge is a PR through the github MCP.

---

## Handy follow-up prompts
- Status: "Summarize BACKLOG.md status, in-flight worktrees, and anything blocked."
- Audit: "Dispatch verifier to run the Brief §5 Platform DoD against current main."
- Demo gate: "Is the Brief §6 demo path green end to end? Run it and show me the report."
- Offload when the Air struggles: prefix any ticket dispatch with & to run it as a cloud session, e.g. "& execute T-031 per protocol".
