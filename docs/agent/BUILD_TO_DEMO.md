# BUILD TO DEMO: single-agent finish plan

Supersedes the orchestrator/subagent protocol in CLAUDE.md for the remainder of this
project. One agent, one branch, build straight through to a demo-ready product.

Goal: a working product to put in front of the UofT varsity soccer coaches, plus a
README that sells it at a glance.

## What changes from the original plan

DROPPED:
- Orchestrator/subagent dispatch, worktrees, one-ticket-one-PR ceremony, per-ticket
  port assignments, CI gating loops. Work directly on one branch.
- Screen-recording verification.
- T-060 deploy (deferred; separate decision, needs credentials).

KEPT (cheap, already load-bearing, do not regress):
- No em dashes in user-facing strings or seeds. `make check-copy` enforces it.
- Team data goes through the scoped query layer. Handlers never filter team_id by hand.
- Permissions enforced in the API, not just the UI. Coach-only keys ABSENT from
  player payloads, never null.
- Positions stored in landscape model coords (x 0-100 toward attacking goal, y 0-100
  top to bottom). Orientation is render-only.
- `make verify` green before the final merge.

ADDED:
- One-command demo seed: a fully populated coach account, so the app is never empty
  when a coach opens it.
- Screenshot capture pass + a README built around those screenshots.

## Build order

1. T-042 Sessions. The coach->player loop that closes the demo narrative.
2. Demo seed script.
3. T-050 Phone pass.
4. T-051 Hardening, scoped to the demo path only.
5. Screenshots + README.

## Definition of done

The Brief section 6 demo narrative runs end to end without a hitch, on desktop and
on a phone viewport, and the README shows it.
