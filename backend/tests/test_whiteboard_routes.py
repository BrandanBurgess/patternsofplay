"""Whiteboard state and saved pattern routes (doc 03 sections 4.2, 4.3;
Brief step 16; T-030). Covers: board persistence round-trips, saved
patterns are author-stamped from the session (never client-supplied),
delete is coach-only and API-enforced (a player token gets 403, not just
a hidden button), and both tables are team-scoped end to end through the
HTTP layer (not just the query-layer unit tests in
test_scoped_query_layer.py).
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app


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


# ---------------------------------------------------------------------------
# Boards: doc 03 4.3 whiteboard state persistence
# ---------------------------------------------------------------------------


def test_board_state_is_null_before_anything_is_saved(client: TestClient) -> None:
    coach = _coach_with_team()
    response = coach.get("/api/boards/current")
    assert response.status_code == 200
    assert response.json() == {"board": None}


def test_board_upsert_round_trips_thresholds_lanes_and_zones(client: TestClient) -> None:
    coach = _coach_with_team()
    snapshot = _board_snapshot(
        confirmed_lanes=[{"a": "home-9", "b": "away-3"}],
        blocking_threshold=4.0,
        marking_threshold=12.0,
        zones_visible={
            "thirds": True,
            "half_spaces": False,
            "zone_14": True,
            "cutback": False,
        },
    )
    # confirmed lane must reference two tokens on the SAME side per the
    # BoardSnapshot validator's sibling rule set (existing tests only
    # check token-id existence, not side matching, so home/away is legal
    # at the schema level even if the frontend never emits it).
    put = coach.put("/api/boards/current", json=snapshot)
    assert put.status_code == 200
    body = put.json()
    assert body["blocking_threshold"] == 4.0
    assert body["marking_threshold"] == 12.0
    assert body["zones_visible"]["zone_14"] is True
    assert body["confirmed_lanes"] == [{"a": "home-9", "b": "away-3"}]

    # Reloading (a fresh GET, simulating a page reload) restores it.
    got = coach.get("/api/boards/current")
    assert got.status_code == 200
    restored = got.json()["board"]
    assert restored["blocking_threshold"] == 4.0
    assert restored["zones_visible"]["thirds"] is True
    assert {t["id"] for t in restored["tokens"]} == {"home-9", "away-3", "ball"}


def test_board_upsert_replaces_the_single_row_not_append(client: TestClient) -> None:
    coach = _coach_with_team()
    coach.put("/api/boards/current", json=_board_snapshot(blocking_threshold=5.0))
    coach.put("/api/boards/current", json=_board_snapshot(blocking_threshold=9.0))

    got = coach.get("/api/boards/current").json()["board"]
    assert got["blocking_threshold"] == 9.0


def test_board_state_is_team_scoped(client: TestClient) -> None:
    coach_a = _coach_with_team(email="coach-a@example.com")
    coach_b = _coach_with_team(email="coach-b@example.com")
    coach_a.put("/api/boards/current", json=_board_snapshot(blocking_threshold=3.0))

    assert coach_b.get("/api/boards/current").json() == {"board": None}


def test_board_route_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/boards/current").status_code == 401
    assert client.put("/api/boards/current", json=_board_snapshot()).status_code == 401


# ---------------------------------------------------------------------------
# Saved patterns: doc 03 4.2, author stamping, coach-only delete
# ---------------------------------------------------------------------------


def test_create_pattern_is_author_stamped_from_the_session_coach(client: TestClient) -> None:
    coach = _coach_with_team()
    response = coach.post(
        "/api/patterns",
        json={
            "name": "Build out right",
            "board_snapshot": _board_snapshot(),
            "keyframes": _KEYFRAMES,
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["author_role"] == "coach"
    assert body["author_label"] == "COACH"
    assert body["name"] == "Build out right"


def test_create_pattern_ignores_any_client_supplied_author_fields(client: TestClient) -> None:
    """CLAUDE.md rule 4's "client input never supplies team_id" extends to
    author stamping here: the request schema has no author_* field at all
    (extra="forbid"), so a client cannot even attempt to forge one."""
    coach = _coach_with_team()
    response = coach.post(
        "/api/patterns",
        json={
            "name": "Forged",
            "author_role": "player",
            "author_user_id": 9999,
            "board_snapshot": _board_snapshot(),
            "keyframes": _KEYFRAMES,
        },
    )
    assert response.status_code == 422  # extra="forbid" rejects the unknown fields


def test_player_can_create_a_pattern_stamped_with_their_display_name(client: TestClient) -> None:
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com", name="Sam Player")

    response = player.post(
        "/api/patterns",
        json={
            "name": "Press trigger",
            "board_snapshot": _board_snapshot(),
            "keyframes": _KEYFRAMES,
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["author_role"] == "player"
    assert body["author_label"] == "Sam Player"


def test_list_patterns_is_team_scoped_newest_first(client: TestClient) -> None:
    coach_a = _coach_with_team(email="coach-a@example.com")
    coach_b = _coach_with_team(email="coach-b@example.com")
    coach_a.post(
        "/api/patterns",
        json={"name": "A1", "board_snapshot": _board_snapshot(), "keyframes": _KEYFRAMES},
    )
    coach_a.post(
        "/api/patterns",
        json={"name": "A2", "board_snapshot": _board_snapshot(), "keyframes": _KEYFRAMES},
    )
    coach_b.post(
        "/api/patterns",
        json={"name": "B1", "board_snapshot": _board_snapshot(), "keyframes": _KEYFRAMES},
    )

    names_a = [p["name"] for p in coach_a.get("/api/patterns").json()]
    names_b = [p["name"] for p in coach_b.get("/api/patterns").json()]
    assert names_a == ["A2", "A1"]  # newest first
    assert names_b == ["B1"]


def test_coach_can_delete_a_saved_pattern(client: TestClient) -> None:
    coach = _coach_with_team()
    pattern_id = coach.post(
        "/api/patterns",
        json={"name": "To delete", "board_snapshot": _board_snapshot(), "keyframes": _KEYFRAMES},
    ).json()["id"]

    response = coach.delete(f"/api/patterns/{pattern_id}")
    assert response.status_code == 204
    assert coach.get("/api/patterns").json() == []


def test_player_delete_attempt_is_403_and_the_pattern_survives(client: TestClient) -> None:
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com")
    pattern_id = coach.post(
        "/api/patterns",
        json={"name": "Protected", "board_snapshot": _board_snapshot(), "keyframes": _KEYFRAMES},
    ).json()["id"]

    response = player.delete(f"/api/patterns/{pattern_id}")
    assert response.status_code == 403
    assert len(coach.get("/api/patterns").json()) == 1


def test_delete_across_teams_404s_not_the_other_teams_row(client: TestClient) -> None:
    coach_a = _coach_with_team(email="coach-a@example.com")
    coach_b = _coach_with_team(email="coach-b@example.com")
    pattern_id = coach_a.post(
        "/api/patterns",
        json={"name": "Team A only", "board_snapshot": _board_snapshot(), "keyframes": _KEYFRAMES},
    ).json()["id"]

    response = coach_b.delete(f"/api/patterns/{pattern_id}")
    assert response.status_code == 404
    assert len(coach_a.get("/api/patterns").json()) == 1


def test_pattern_routes_require_authentication(client: TestClient) -> None:
    assert client.get("/api/patterns").status_code == 401
    assert (
        client.post(
            "/api/patterns",
            json={"name": "x", "board_snapshot": _board_snapshot(), "keyframes": _KEYFRAMES},
        ).status_code
        == 401
    )
    assert client.delete("/api/patterns/1").status_code == 401
