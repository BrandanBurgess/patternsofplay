# Agent prompt: finish Patterns of Play to demo-ready

Finish Patterns of Play end to end so I can demo it to university varsity soccer
coaches. Repo: /Users/brandanburgess/Documents/patternsofplay, branch `integration`.

You are building, not orchestrating. Ignore the orchestrator/subagent protocol and the
PR ceremony in CLAUDE.md: no worktrees, no per-ticket PRs, no CI polling loops. Work
directly on `integration` and commit as you complete each phase. Read
docs/agent/BUILD_TO_DEMO.md first, then this.

## Ground truth (do not re-derive)

The app already works. Merged and verified: platform/auth/teams with role-scoped join
codes, scoped query layer, full schema (Alembic head 0005), seeded tactical content
(12 patterns, 8 deliveries, 3 rotations, 6 formations, rondo map, 27 identities), the
complete board engine (drag, lane graph with suggested/confirmed/blocked, zone
overlays, declarative + keyframe animation player, recorder), all five screens
(Whiteboard, Patterns, Formations, Roster, Identity), the permission suite, and the
playstyle suggestion flow. `make verify` was green at the last commit.

Read docs/agent/STATE.md for architecture notes and decisions already closed. Do not
reopen them.

Stack is React 19 + Vite + TypeScript (frontend/) and FastAPI + SQLAlchemy 2 + Alembic
+ SQLite WAL (backend/). docs/source/design-handoff/ holds static PNG mockups plus one
HTML mockup file: those are a VISUAL SPEC ONLY. You write React. Never port the mockup
HTML/CSS into the app; match its look using the existing design tokens
(frontend/src/styles/tokens.css) and existing page CSS conventions.

## Rules that still bind

1. No em dashes in any user-facing string or seed file. Use periods, commas, colons,
   parentheses. `make check-copy` fails on the character.
2. Every team-scoped query goes through the scoped query layer (backend/app/scoped.py).
   Route handlers never filter by team_id manually. Client input never supplies team_id.
3. Permissions enforced in the API, not just the UI. Coach-only data (fit warnings,
   receipts, join codes) must be ABSENT from player-role payloads, not null. Follow the
   split-schema pattern already used for RosterOut/CoachRosterOut.
4. Board positions stored in landscape model coords (x 0-100 toward the attacking goal,
   y 0-100 top to bottom). Orientation is render-only. Portrait maps left=y, top=100-x.
5. Reuse frontend/src/board/PatternPreviewBoard.tsx and pages/patternPreview.ts for any
   read-only board rendering. Do not write a second board renderer.
6. Scope discipline: the Brief section 1 scope table is final. Do not invent surfaces.
   If content has no designed surface, it stays seed data.

## The bar for the boards

This is the product. Everything else is scaffolding around it. The boards must be
genuinely functional and they must look good enough that a coach wants to keep using
them:

- Drag stays smooth with all 23 tokens on the pitch. No jank, no dropped pointer
  capture, no popover or menu intercepting a drag (this bug already bit T-030 once).
- Playback is smooth and readable: tokens ease rather than teleport, the ball chases
  its bound player, trails/lane states read clearly at a glance.
- Portrait and landscape both render correctly, and a pattern recorded in one replays
  identically in the other.
- Every board surface looks deliberate: consistent token styling, legible pitch
  markings, sensible empty states. If a board looks unfinished, fix it even if no
  ticket line asks for it.

Treat any board polish gap you notice as in scope.

## Phase 1: Sessions (T-042)

The coach-to-player loop. Mockups: PNG 21, 22, 23, 26, 28 in
docs/source/design-handoff/. Backend models already exist in
backend/app/models/sessions.py.

- Coach: draft builder + item picker with board thumbnails (reuse PatternPreviewBoard),
  attach library patterns and saved recordings, add a note, send to the team.
- Coach: receipts view, "watched by 3 of 12" style counter, per-player state.
- Player: session list, session view, Watch deep-link that opens the item on the board
  (portrait on phone), Mark as watched.
- Un-skip and implement the two @pytest.mark.skip placeholder rows in
  backend/tests/test_permissions.py ("suggest own playstyle", "sessions"). Players must
  never receive receipt data in any payload.
- Playwright journey in e2e/sessions.spec.ts using the e2e/fixtures.ts helpers, ending
  in assertCleanPage.

## Phase 2: Demo seed

Add `scripts/seed_demo.py` and a `make demo` target that drops the dev DB, migrates,
seeds library content, then creates a realistic demo state so the app is never empty
when a coach opens it:

- Coach account (print the credentials to stdout and put them in the README), a team,
  and a player account joined to it.
- 12-14 roster players with roles, flanks, and slider values filled in, including one
  pair that triggers the double-exposure fit warning.
- A saved custom pattern recorded on the whiteboard ("Our build-out vs press") with a
  real multi-token animation, not a stub.
- A selected formation with a keystone, a set team identity, one sent session with two
  items and one receipt already marked watched.

Idempotent, safe to rerun. This is what I will run before walking into a meeting.

## Phase 3: Phone pass (T-050)

Mockups: PNG 14-20, 23, 28, 35, 36, 43-45. iPhone 13 (390x844) is the target.

- Icon rail nav, stacked single-column grids, no horizontal overflow anywhere.
- Every board surface renders portrait on phone.
- Sheets and drawers are reachable and dismissible by touch.
- Cross-device test: record a pattern on desktop viewport, replay it on mobile
  viewport, assert positions round-trip.

## Phase 4: Hardening (T-051), demo-path scoped

- Full em-dash sweep across the repo.
- Permission suite runs in CI.
- One Playwright journey, e2e/demo-path.spec.ts, that runs the Brief section 6
  narrative straight through on both viewports: coach signs up, creates a team, adds
  players with roles and sliders, opens Formations and loads 4-3-3 and taps the pivot
  keystone, toggles the Rondo Map and taps the first-line zone, opens Patterns and
  searches "third man" and plays A5, opens the Whiteboard and drags a build-out and
  records and saves it as "Our build-out vs press", creates a session with A5 plus the
  recording and a note and sends it, then as a player opens the session, watches A5
  portrait, marks it watched, and back as coach the receipt counter reads 1 of N.

Do not chase unrelated tech debt. If the demo path is green on both viewports and
`make verify` passes, hardening is done.

## Phase 5: Screenshots and README

Write `e2e/screenshots.spec.ts` that runs against the `make demo` database and writes
PNGs to docs/screenshots/. This is a capture script, not a test: it drives the real UI
and takes full-page or element screenshots. No screen recording, no video.

Capture at minimum, desktop 1440x900 unless noted:
1. Whiteboard with the lane graph live, mid-drag state with confirmed and blocked lanes
   visible.
2. Whiteboard recording UI, trace visible.
3. Patterns page, library sheet open with chips and search.
4. A pattern mid-playback on the board with the animation clearly in progress.
5. Formations page, 4-3-3 with the keystone pulsing, keycards visible.
6. Rondo Map with a zone selected.
7. Identity page, a reference team animation playing.
8. Roster with the double-exposure fit warning showing.
9. Session receipts view.
10. Phone (390x844): pattern playing portrait, and the player session view.

Time the captures so animated surfaces are caught mid-motion rather than at frame zero,
and prefer the dark theme unless a screen reads better in another. These are marketing
shots: if a screen looks empty or awkward, adjust the demo seed data until it looks
good, then recapture.

Then write README.md at the repo root:

- One-line hook, then a two-sentence explanation of what the product does for a coach.
- The hero screenshot right at the top.
- "Why a coach cares": three or four bullets in plain football language, not
  engineering language. No jargon, no architecture talk in this section.
- A walkthrough section: the screenshots in demo-narrative order, each with a one-line
  caption naming what the coach is doing.
- Quickstart: `make bootstrap`, `make demo`, `make dev`, plus the demo login
  credentials and the URL.
- A short stack and architecture section at the bottom, for engineers.

Keep the README tight. A coach should get the point from the images alone; the prose is
support.

## Working discipline (these are not optional)

- NEVER end your turn to wait for a background task. If you start something in the
  background, poll its output file with Read inside the same turn until it finishes.
- Never run a foreground dev server. Never use Playwright headed mode, --ui, or
  page.pause().
- Run Playwright with explicit timeouts: --timeout=30000 --global-timeout=200000.
- Never pipe `make verify` to `tail`: the pipeline masks the exit code. Run
  `make verify > /tmp/verify.log 2>&1; echo "VERIFY_EXIT=$?"` and read the log
  separately. Confirm the exit code, do not eyeball the tail.
- `scripts/dev.sh` migrates AND seeds on every boot. Do not remove the seed line, CI
  depends on it.
- Commit after each phase with a Conventional Commit message. Do not open PRs.
- If something is genuinely ambiguous about auth, tenancy, permissions, or data shape,
  pick the option most consistent with what is already built, implement it, and note
  the decision in your final summary. Do not stop to ask unless proceeding would be
  destructive.

## Report at the end

State what shipped, anything you deliberately left out, the demo credentials, and the
exact commands I run to show this to a coach.
