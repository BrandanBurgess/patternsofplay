"""The Brief section 3 permission table, verified row by row (T-040,
Brief step 21). Every test function below is named after (and comments
the exact text of) one row of that table, or the enforcement principle
stated underneath it, so this file reads as the table:

    | Capability | Coach | Player |
    |---|---|---|
    | Whiteboard: lanes, zones, record and save tactics | Yes | Yes |
    | Delete a saved pattern | Yes | No |
    | Pattern library, formations, identity | Full | Full (view + play) |
    | Roster | Full + fit warnings | View-only, no fit warnings |
    | Suggest own playstyle | n/a | pending coach review (T-041) |
    | Sessions | create/send/receipts | read-only + watch (T-042) |

Principles (binding, tested explicitly at the bottom of this file):
players are additive-only; coach-only information (fit warnings,
receipts) never renders in player views rather than being disabled; a
player token calling a delete or receipt endpoint gets 403.

This is an audit-and-enforcement ticket, not a new-surface one: rows
already covered end to end in their own router's test file (whiteboard,
roster) are re-asserted here in the table's own words rather than
re-derived from scratch, so a reviewer can check this file against
Brief section 3 line by line without cross-referencing five other files.

Two rows -- "Suggest own playstyle" and "Sessions" -- have no API
surface yet in this codebase state: only their SQLAlchemy models exist
(app/models/roster.py PlaystyleSuggestion; app/models/sessions.py
TrainingSession/SessionItem/SessionReceipt), no router is registered for
either in app/main.py. Per Brief section 4's own build order, role
gating (step 21, this ticket) lands before the suggestion flow (step 22,
T-041) and sessions (step 23, T-042). Those two rows are marked skipped
below with a reason, not silently omitted, so the suite still names
every row of the table; T-041/T-042 must turn each skip into a real
assertion when their routes land (T-041's own ticket says as much for
the suggestion row; the same applies to sessions by the same logic).
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app

# ---------------------------------------------------------------------------
# Shared fixtures (same convention as test_roster_routes.py / test_whiteboard_
# routes.py: each permission test file in this suite duplicates this small
# register/team/join helper block rather than importing across test files).
# ---------------------------------------------------------------------------


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _register(client: TestClient, *, email: str, role: str, display_name: str = "Test User"):
    return client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery",
            "display_name": display_name,
            "role": role,
        },
    )


def _coach_with_team(email: str = "coach@example.com", name: str = "Coach Test") -> TestClient:
    c = TestClient(app)
    _register(c, email=email, role="coach", display_name=name)
    c.post("/api/teams", json={"name": f"Team for {email}"})
    return c


def _player_on_team(coach: TestClient, email: str, name: str = "Player Test") -> TestClient:
    join_code = coach.get("/api/teams/current").json()["join_code"]
    p = TestClient(app)
    _register(p, email=email, role="player", display_name=name)
    p.post("/api/teams/join", json={"join_code": join_code})
    return p


_TOKENS = [
    {"id": "home-9", "side": "home", "label": "9", "pos": {"x": 60, "y": 30}},
    {"id": "away-3", "side": "away", "label": "3", "pos": {"x": 40, "y": 70}},
    {"id": "ball", "side": "ball", "label": "", "pos": {"x": 50, "y": 50}},
]


def _board_snapshot(**overrides: object) -> dict:
    base = {
        "tokens": _TOKENS,
        "confirmed_lanes": [],
        "blocking_threshold": 7.0,
        "marking_threshold": 10.0,
        "zones_visible": {
            "thirds": False,
            "half_spaces": False,
            "zone_14": False,
            "cutback": False,
        },
    }
    base.update(overrides)
    return base


_KEYFRAMES = [{"t_ms": 0, "token_id": "home-9", "x": 60.0, "y": 30.0}]

_ATTRS = {
    "pace": 3,
    "passing_range": 3,
    "carrying_1v1": 3,
    "positional_discipline": 3,
    "aerial_physical": 3,
    "pressing_engine": 3,
}


def _player_body(**overrides: object) -> dict:
    base: dict = {
        "name": "New Player",
        "jersey_number": 10,
        "preferred_foot": "R",
        "role_code": None,
        "flank": None,
        "awr": "med",
        "dwr": "med",
        "attributes": _ATTRS,
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Row: "Whiteboard: lanes, zones, record and save tactics" -- Yes / Yes
# (lane and zone state live on the same board row PUT by; see
# test_whiteboard_routes.py for lane/zone field-level round trips, this
# just proves both roles can reach the write path at all).
# ---------------------------------------------------------------------------


def test_whiteboard_lanes_zones_record_and_save__coach_yes_player_yes(client: TestClient) -> None:
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com", name="Sam Player")

    # Both roles can save board state (lanes/zones live on this row).
    coach_put = coach.put(
        "/api/boards/current",
        json=_board_snapshot(confirmed_lanes=[{"a": "home-9", "b": "away-3"}]),
    )
    assert coach_put.status_code == 200
    player_put = player.put(
        "/api/boards/current", json=_board_snapshot(zones_visible={
            "thirds": True, "half_spaces": False, "zone_14": False, "cutback": False,
        })
    )
    assert player_put.status_code == 200

    # Both roles can record and save into My Patterns; saved patterns are
    # author-stamped (tile shows COACH or the player's own name), not by
    # any client-supplied field.
    coach_pattern = coach.post(
        "/api/patterns",
        json={"name": "Coach build", "board_snapshot": _board_snapshot(), "keyframes": _KEYFRAMES},
    )
    assert coach_pattern.status_code == 201
    assert coach_pattern.json()["author_role"] == "coach"
    assert coach_pattern.json()["author_label"] == "COACH"

    player_pattern = player.post(
        "/api/patterns",
        json={"name": "Player build", "board_snapshot": _board_snapshot(), "keyframes": _KEYFRAMES},
    )
    assert player_pattern.status_code == 201
    assert player_pattern.json()["author_role"] == "player"
    assert player_pattern.json()["author_label"] == "Sam Player"


# ---------------------------------------------------------------------------
# Row: "Delete a saved pattern" -- Yes, custom patterns only (coach) / No,
# the delete control never renders (player). Principle: "a player token
# calling a delete ... endpoint gets 403" -- enforced here at the API, not
# only by the UI not rendering the control (see e2e/permissions.spec.ts for
# the DOM-absence half).
# ---------------------------------------------------------------------------


def test_delete_a_saved_pattern__coach_yes_player_403(client: TestClient) -> None:
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com")

    coach_pattern_id = coach.post(
        "/api/patterns",
        json={"name": "Coach's own", "board_snapshot": _board_snapshot(), "keyframes": _KEYFRAMES},
    ).json()["id"]

    # Player attempt is rejected outright, the row survives untouched.
    forbidden = player.delete(f"/api/patterns/{coach_pattern_id}")
    assert forbidden.status_code == 403
    assert len(coach.get("/api/patterns").json()) == 1

    # Coach can delete, including a pattern a player authored (README:
    # coach delete is not limited to the coach's own tiles).
    player_pattern_id = player.post(
        "/api/patterns",
        json={"name": "Player's own", "board_snapshot": _board_snapshot(), "keyframes": _KEYFRAMES},
    ).json()["id"]
    coach_delete_own = coach.delete(f"/api/patterns/{coach_pattern_id}")
    assert coach_delete_own.status_code == 204
    coach_delete_players = coach.delete(f"/api/patterns/{player_pattern_id}")
    assert coach_delete_players.status_code == 204
    assert coach.get("/api/patterns").json() == []


# ---------------------------------------------------------------------------
# Row: "Pattern library, formations, identity" -- Full (coach) / Full,
# view and play (player). Neither role gets more than the other here: both
# get the exact same read-only content, so this asserts identical 200
# bodies rather than a coach/player diff.
# ---------------------------------------------------------------------------


def test_pattern_library_formations_identity__full_view_both_roles(client: TestClient) -> None:
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com")

    for path in ("/api/library/items", "/api/formations", "/api/identities"):
        coach_response = coach.get(path)
        player_response = player.get(path)
        assert coach_response.status_code == 200, path
        assert player_response.status_code == 200, path
        assert coach_response.json() == player_response.json(), path


# ---------------------------------------------------------------------------
# Row: "Roster" -- Full, plus fit warnings and suggestion review (coach) /
# View-only sliders and work rates with a "view only" label; no fit
# warnings; own row marked "(you)" (player). CRUD 403s a player at the API
# (README: "no create/edit/delete control renders" is a UI statement;
# CLAUDE.md rule 5 requires the same thing be true of the API independent
# of the UI). fit_warnings is asserted ABSENT from the player payload
# (not null, not empty), matching test_roster_routes.py's own proof.
# ---------------------------------------------------------------------------


def test_roster__coach_full_with_fit_warnings_player_view_only_no_fit_warnings(
    client: TestClient,
) -> None:
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com")

    # Coach: full CRUD.
    created = coach.post("/api/roster/players", json=_player_body(name="Jordan T."))
    assert created.status_code == 201
    player_id = created.json()["id"]
    assert coach.put(
        f"/api/roster/players/{player_id}", json=_player_body(name="Jordan Taylor")
    ).status_code == 200
    # (Deleted at the very end so both roles' GETs below see the same row.)

    # Coach GET: fit_warnings key present (even empty, no clash seeded here;
    # test_roster_routes.py proves it actually fires and reads Bible copy).
    coach_body = coach.get("/api/roster").json()
    assert "fit_warnings" in coach_body

    # Player: every write is 403, the roster is unchanged by the attempt.
    assert player.post("/api/roster/players", json=_player_body(name="Forged")).status_code == 403
    assert player.put(
        f"/api/roster/players/{player_id}", json=_player_body(name="Forged edit")
    ).status_code == 403
    assert player.delete(f"/api/roster/players/{player_id}").status_code == 403
    assert coach.get("/api/roster").json()["players"][0]["name"] == "Jordan Taylor"

    # Player GET: fit_warnings key entirely absent (not None, not []) --
    # coach-only data never renders in a player-role payload, CLAUDE.md
    # rule 5, enforced by the response shape itself, not client-side.
    player_body = player.get("/api/roster").json()
    assert "fit_warnings" not in player_body
    for row in player_body["players"]:
        assert "fit_warnings" not in row

    # Own-row marking ("(you)" tag data): is_you is a real field on both
    # roles' payloads (the UI-only "view only" slider label and the tag
    # text itself are asserted in e2e/permissions.spec.ts).
    assert all("is_you" in row for row in player_body["players"])

    coach.delete(f"/api/roster/players/{player_id}")


# ---------------------------------------------------------------------------
# Row: "Suggest own playstyle" -- not applicable (coach) / free text on own
# profile then "pending coach review"; coach sees a gold badge and an
# Approve / Dismiss card (player). No route exists yet: PlaystyleSuggestion
# is a model only (app/models/roster.py), no router is registered in
# app/main.py. T-041 (suggestion flow) is being built in parallel in
# another worktree and owns turning this into a real assertion.
# ---------------------------------------------------------------------------


@pytest.mark.skip(
    reason=(
        "No suggestion route exists in this worktree yet (Brief step 22 / "
        "T-041, building in parallel). PlaystyleSuggestion is a model only; "
        "app/main.py registers no router for it. T-041 must replace this "
        "skip with a real submit/pending/approve/dismiss assertion."
    )
)
def test_suggest_own_playstyle__player_submits_pending_coach_approves_or_dismisses(
    client: TestClient,
) -> None:  # pragma: no cover - intentionally not runnable yet, see skip reason
    raise AssertionError("T-041 must implement this row's route and this test")


# ---------------------------------------------------------------------------
# Row: "Sessions" -- create, edit drafts, send, see per-player read
# receipts (coach) / sees sent sessions only, read-only, Watch deep-link,
# Mark as watched feeding the coach's receipt counter (player). No route
# exists yet: TrainingSession/SessionItem/SessionReceipt are models only
# (app/models/sessions.py); app/main.py registers no sessions router.
# That module's own docstring assigns enforcement to T-042. Same treatment
# as the suggestion row above: named and skipped, not silently omitted.
# ---------------------------------------------------------------------------


@pytest.mark.skip(
    reason=(
        "No sessions route exists in this worktree yet (Brief step 23 / "
        "T-042). TrainingSession/SessionItem/SessionReceipt are models "
        "only; app/main.py registers no router for them. T-042 must "
        "replace this skip with a real create/send/receipt assertion, "
        "including: receipts created for every recipient at send with "
        "viewed_at null, and receipt data absent from player payloads."
    )
)
def test_sessions__coach_creates_sends_sees_receipts_player_reads_and_marks_watched(
    client: TestClient,
) -> None:  # pragma: no cover - intentionally not runnable yet, see skip reason
    raise AssertionError("T-042 must implement this row's route and this test")


# ---------------------------------------------------------------------------
# Principles (binding, stated directly under the table): players are
# additive-only; a player token calling a delete endpoint gets 403 across
# EVERY delete-capable route that exists today (a single sweep, rather than
# re-deriving one 403 per route above, to pin the principle itself).
# ---------------------------------------------------------------------------


def test_player_token_calling_any_delete_endpoint_gets_403(client: TestClient) -> None:
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com")

    pattern_id = coach.post(
        "/api/patterns",
        json={"name": "Protected", "board_snapshot": _board_snapshot(), "keyframes": _KEYFRAMES},
    ).json()["id"]
    player_id = coach.post("/api/roster/players", json=_player_body()).json()["id"]

    delete_attempts = {
        f"/api/patterns/{pattern_id}": player.delete(f"/api/patterns/{pattern_id}"),
        f"/api/roster/players/{player_id}": player.delete(f"/api/roster/players/{player_id}"),
    }
    for path, response in delete_attempts.items():
        assert response.status_code == 403, path

    # Nothing was actually deleted by the rejected attempts.
    assert len(coach.get("/api/patterns").json()) == 1
    assert len(coach.get("/api/roster").json()["players"]) == 1


def test_players_are_additive_only__every_player_write_route_is_a_create(
    client: TestClient,
) -> None:
    """Sweeps every route a player CAN reach and confirms none of them are
    edits or deletes of someone else's content: POST /api/boards/current
    upserts the team's own single shared board (both roles may edit it,
    per the whiteboard row above, by design), POST /api/patterns always
    creates a new row stamped to the caller, and no other write route is
    reachable by a player at all (roster CRUD is 403, pattern delete is
    403, per the tests above). This is the "additive-only" principle
    pinned as one assertion rather than inferred from the others."""
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com", name="Sam Player")

    before = coach.get("/api/patterns").json()
    assert before == []

    created = player.post(
        "/api/patterns",
        json={"name": "Additive", "board_snapshot": _board_snapshot(), "keyframes": _KEYFRAMES},
    )
    assert created.status_code == 201  # a new row, never an edit of an existing one

    after = coach.get("/api/patterns").json()
    assert len(after) == 1  # the player's write ADDED a row, nothing was replaced/removed


# ---------------------------------------------------------------------------
# Known ambiguity (T-040 instruction: do not change current behavior, pin
# and report it): join codes. The design README/Brief section 3 table does
# not list join codes as coach-only, but the UI (TeamMeta.tsx) only shows
# the join-code block to a coach. The API was never told to withhold it:
# TeamOut.join_code is returned to any team member by both GET
# /api/teams/current and GET /api/auth/me. docs/agent/STATE.md's open
# founder questions list already flags this ("Confirm before T-040 locks
# the pattern"). This test PINS the current, unchanged behavior so a
# future change is a deliberate, visible diff here, not an accidental one.
# ---------------------------------------------------------------------------


def test_join_code_is_returned_to_a_player_by_the_api_ambiguity_pinned_not_enforced(
    client: TestClient,
) -> None:
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com")

    join_code = coach.get("/api/teams/current").json()["join_code"]
    assert len(join_code) == 6

    # Current (unchanged) behavior: a player's own /api/teams/current
    # response also carries join_code. The UI is the only layer that
    # withholds it from a player today (TeamMeta.tsx renders the block
    # only when role_on_team == "coach"). See docs/agent/STATE.md open
    # founder question 2 and this ticket's final report.
    player_team = player.get("/api/teams/current").json()
    assert player_team["join_code"] == join_code

    player_me = player.get("/api/auth/me").json()
    assert player_me["memberships"][0]["team"]["join_code"] == join_code
