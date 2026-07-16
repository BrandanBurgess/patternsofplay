"""Playstyle suggestion routes (doc 03 section 3 playstyle_suggestions;
Brief step 22, PNG 24/25/27; T-041). Covers the Roles-and-sessions DoD line
verbatim: "Suggestion flow round-trips: player submits, sees pending; coach
approves; note appears merged on the profile; dismiss clears it." Plus API
permission enforcement in both directions (CLAUDE.md rule 5: a player token
calling a coach-only endpoint 403s) and cross-team isolation.

Player row linkage: app/routers/roster.py claims a roster row for a player
the first time they GET /api/roster, if their display_name uniquely matches
an unclaimed row's name (see that module's _claim_matching_row docstring).
Every test here that needs a player to act on "their own profile" registers
the player with a display_name equal to the coach-created roster row's
name, then calls GET /api/roster once to trigger the claim, exactly as the
frontend's page-load fetch does.
"""

import importlib.util
import pathlib
import sys

import pytest
from fastapi.testclient import TestClient

from app.main import app

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]


def _run_seed_loader() -> None:
    spec = importlib.util.spec_from_file_location(
        "pop_seed_script_suggestion_tests", REPO_ROOT / "scripts" / "seed.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    assert module.main() == 0


@pytest.fixture(autouse=True)
def _seed_library_content() -> None:
    _run_seed_loader()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _register(client: TestClient, *, email: str, role: str, display_name: str):
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


def _player_on_team(coach: TestClient, email: str, name: str) -> TestClient:
    join_code = coach.get("/api/teams/current").json()["join_code"]
    p = TestClient(app)
    _register(p, email=email, role="player", display_name=name)
    p.post("/api/teams/join", json={"join_code": join_code})
    return p


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


def _add_player(coach: TestClient, name: str) -> int:
    resp = coach.post("/api/roster/players", json=_player_body(name=name))
    assert resp.status_code == 201
    return resp.json()["id"]


def _claim(player: TestClient) -> None:
    """Mirrors the frontend's page-load fetch: GET /api/roster is what
    triggers app/routers/roster.py's claim-by-name-match."""
    resp = player.get("/api/roster")
    assert resp.status_code == 200


def _own_player_id(player: TestClient) -> int:
    body = player.get("/api/roster").json()
    mine = [p for p in body["players"] if p["is_you"]]
    assert len(mine) == 1, "expected exactly one claimed row"
    return mine[0]["id"]


# ---------------------------------------------------------------------------
# The round trip itself (Roles and sessions DoD line, verbatim)
# ---------------------------------------------------------------------------


def test_player_submits_suggestion_and_sees_it_pending(client: TestClient) -> None:
    coach = _coach_with_team()
    _add_player(coach, "Maya K.")
    player = _player_on_team(coach, email="maya@example.com", name="Maya K.")
    _claim(player)
    player_id = _own_player_id(player)

    created = player.post(
        f"/api/roster/players/{player_id}/suggestions",
        json={"text": "Could we try me as a touchline winger for a session."},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["status"] == "pending"
    assert body["player_id"] == player_id
    assert body["text"] == "Could we try me as a touchline winger for a session."

    # "sees pending": the player reads their own suggestion back as pending.
    mine = player.get(f"/api/roster/players/{player_id}/suggestions")
    assert mine.status_code == 200
    assert [s["status"] for s in mine.json()] == ["pending"]


def test_coach_approves_and_the_note_appears_merged_on_the_profile(client: TestClient) -> None:
    coach = _coach_with_team()
    _add_player(coach, "Maya K.")
    player = _player_on_team(coach, email="maya@example.com", name="Maya K.")
    _claim(player)
    player_id = _own_player_id(player)

    submitted = player.post(
        f"/api/roster/players/{player_id}/suggestions",
        json={"text": "Wants to cut inside onto her strong foot more often."},
    )
    suggestion_id = submitted.json()["id"]

    # Coach sees the gold-badge queue before approving.
    pending = coach.get("/api/roster/suggestions/pending")
    assert pending.status_code == 200
    assert [s["id"] for s in pending.json()] == [suggestion_id]
    assert pending.json()[0]["player_name"] == "Maya K."

    approved = coach.post(f"/api/roster/suggestions/{suggestion_id}/approve")
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    # "note appears merged on the profile" -- visible to both roles, and
    # the pending queue clears.
    coach_roster = coach.get("/api/roster").json()
    player_roster = player.get("/api/roster").json()
    coach_row = next(p for p in coach_roster["players"] if p["id"] == player_id)
    player_row = next(p for p in player_roster["players"] if p["id"] == player_id)
    assert coach_row["playstyle_note"] == "Wants to cut inside onto her strong foot more often."
    assert player_row["playstyle_note"] == "Wants to cut inside onto her strong foot more often."
    assert coach.get("/api/roster/suggestions/pending").json() == []


def test_coach_dismiss_clears_it_without_merging_a_note(client: TestClient) -> None:
    coach = _coach_with_team()
    _add_player(coach, "Maya K.")
    player = _player_on_team(coach, email="maya@example.com", name="Maya K.")
    _claim(player)
    player_id = _own_player_id(player)

    submitted = player.post(
        f"/api/roster/players/{player_id}/suggestions", json={"text": "Try me at fullback."}
    )
    suggestion_id = submitted.json()["id"]

    dismissed = coach.post(f"/api/roster/suggestions/{suggestion_id}/dismiss")
    assert dismissed.status_code == 200
    assert dismissed.json()["status"] == "dismissed"

    # "dismiss clears it": no note merged, and the pending queue is empty.
    row = next(
        p for p in coach.get("/api/roster").json()["players"] if p["id"] == player_id
    )
    assert row["playstyle_note"] is None
    assert coach.get("/api/roster/suggestions/pending").json() == []

    # Clearing lets the player submit a fresh suggestion (no lingering
    # pending row blocking them).
    resubmitted = player.post(
        f"/api/roster/players/{player_id}/suggestions", json={"text": "Try me at winger instead."}
    )
    assert resubmitted.status_code == 201


# ---------------------------------------------------------------------------
# Permission enforcement, both directions (CLAUDE.md rule 5)
# ---------------------------------------------------------------------------


def test_coach_cannot_submit_a_suggestion(client: TestClient) -> None:
    coach = _coach_with_team()
    player_id = _add_player(coach, "Maya K.")

    resp = coach.post(
        f"/api/roster/players/{player_id}/suggestions", json={"text": "Not applicable."}
    )
    assert resp.status_code == 403


def test_player_cannot_submit_for_a_teammates_row(client: TestClient) -> None:
    coach = _coach_with_team()
    _add_player(coach, "Maya K.")
    other_id = _add_player(coach, "Alex B.")
    player = _player_on_team(coach, email="maya@example.com", name="Maya K.")
    _claim(player)

    resp = player.post(
        f"/api/roster/players/{other_id}/suggestions", json={"text": "Not my row."}
    )
    assert resp.status_code == 403


def test_unclaimed_player_gets_403_without_ever_calling_get_roster_first(
    client: TestClient,
) -> None:
    """Submission requires a prior claim (own-row linkage); a player who
    never triggered the claim (e.g. named differently from every roster
    row) is forbidden from every player_id on the team, proving the check
    is real ownership, not merely "any player on my team"."""
    coach = _coach_with_team()
    player_id = _add_player(coach, "Maya K.")
    player = _player_on_team(coach, email="someone@example.com", name="Someone Else")
    _claim(player)  # no name match: nothing gets claimed

    resp = player.post(
        f"/api/roster/players/{player_id}/suggestions", json={"text": "x"}
    )
    assert resp.status_code == 403


def test_second_pending_suggestion_is_rejected(client: TestClient) -> None:
    coach = _coach_with_team()
    _add_player(coach, "Maya K.")
    player = _player_on_team(coach, email="maya@example.com", name="Maya K.")
    _claim(player)
    player_id = _own_player_id(player)

    first = player.post(
        f"/api/roster/players/{player_id}/suggestions", json={"text": "First."}
    )
    assert first.status_code == 201
    second = player.post(
        f"/api/roster/players/{player_id}/suggestions", json={"text": "Second."}
    )
    assert second.status_code == 409


def test_player_gets_403_listing_the_pending_queue(client: TestClient) -> None:
    coach = _coach_with_team()
    _add_player(coach, "Maya K.")
    player = _player_on_team(coach, email="maya@example.com", name="Maya K.")
    _claim(player)

    assert player.get("/api/roster/suggestions/pending").status_code == 403


def test_player_gets_403_approving_or_dismissing(client: TestClient) -> None:
    coach = _coach_with_team()
    _add_player(coach, "Maya K.")
    player = _player_on_team(coach, email="maya@example.com", name="Maya K.")
    _claim(player)
    player_id = _own_player_id(player)

    submitted = player.post(
        f"/api/roster/players/{player_id}/suggestions", json={"text": "x"}
    )
    suggestion_id = submitted.json()["id"]

    # CLAUDE.md rule 5 / ticket instruction: "player calling delete or
    # receipt endpoints gets 403 with a test proving it" -- same shape
    # applies to the coach-only approve/dismiss review controls here.
    assert player.post(f"/api/roster/suggestions/{suggestion_id}/approve").status_code == 403
    assert player.post(f"/api/roster/suggestions/{suggestion_id}/dismiss").status_code == 403


def test_client_cannot_forge_player_id_author_or_status_in_the_body(client: TestClient) -> None:
    """SuggestionCreateRequest schema (extra='forbid') has only `text`, so a
    forged player_id/author_user_id/team_id/status field is rejected by
    Pydantic before the route body ever runs (same convention as
    test_roster_routes.py's team_id/user_id forgery test)."""
    coach = _coach_with_team()
    _add_player(coach, "Maya K.")
    player = _player_on_team(coach, email="maya@example.com", name="Maya K.")
    _claim(player)
    player_id = _own_player_id(player)

    resp = player.post(
        f"/api/roster/players/{player_id}/suggestions",
        json={"text": "x", "status": "approved", "author_user_id": 9999, "team_id": 9999},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Cross-team isolation (CLAUDE.md rule 4 / Platform DoD: "a cross-team read
# attempt in tests returns nothing")
# ---------------------------------------------------------------------------


def test_cross_team_coach_cannot_see_or_review_another_teams_suggestion(
    client: TestClient,
) -> None:
    coach_a = _coach_with_team(email="coach-a@example.com", name="Coach A")
    _add_player(coach_a, "Maya K.")
    player_a = _player_on_team(coach_a, email="maya@example.com", name="Maya K.")
    _claim(player_a)
    player_id = _own_player_id(player_a)
    suggestion_id = player_a.post(
        f"/api/roster/players/{player_id}/suggestions", json={"text": "x"}
    ).json()["id"]

    coach_b = _coach_with_team(email="coach-b@example.com", name="Coach B")
    _add_player(coach_b, "Someone Else")

    # Doesn't leak into team B's pending queue.
    assert coach_b.get("/api/roster/suggestions/pending").json() == []
    # Cross-team read/action attempts return nothing rather than another
    # team's data (TeamScope.get scopes by team_id).
    assert coach_b.get(f"/api/roster/players/{player_id}/suggestions").status_code == 404
    assert coach_b.post(f"/api/roster/suggestions/{suggestion_id}/approve").status_code == 404
    assert coach_b.post(f"/api/roster/suggestions/{suggestion_id}/dismiss").status_code == 404
