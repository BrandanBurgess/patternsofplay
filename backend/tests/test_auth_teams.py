"""Platform DoD (Brief section 5): "Coach can register, create a team, and
see a join code; player can register and join with the code; wrong code
fails cleanly." Plus the surrounding permission and tenancy behavior
CLAUDE.md rule 4 and doc 04 require.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    # A fresh client per test gives a fresh cookie jar, so tests never leak
    # a session from one into another.
    return TestClient(app)


def register(client: TestClient, *, email: str, role: str, display_name: str = "Test User"):
    return client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery",
            "display_name": display_name,
            "role": role,
        },
    )


def test_coach_can_register(client: TestClient) -> None:
    response = register(client, email="coach@example.com", role="coach")
    assert response.status_code == 201
    body = response.json()
    assert body["role"] == "coach"
    assert body["email"] == "coach@example.com"
    assert "password" not in body
    assert "password_hash" not in body


def test_player_can_register(client: TestClient) -> None:
    response = register(client, email="player@example.com", role="player")
    assert response.status_code == 201
    assert response.json()["role"] == "player"


def test_coach_can_create_a_team_and_see_a_join_code(client: TestClient) -> None:
    register(client, email="coach@example.com", role="coach")

    response = client.post("/api/teams", json={"name": "U12 Falcons"})

    assert response.status_code == 201
    team = response.json()
    assert team["name"] == "U12 Falcons"
    assert isinstance(team["join_code"], str)
    assert len(team["join_code"]) == 6


def test_player_can_join_with_the_code(client: TestClient) -> None:
    coach_client = TestClient(app)
    register(coach_client, email="coach@example.com", role="coach")
    team = coach_client.post("/api/teams", json={"name": "U12 Falcons"}).json()

    player_client = client
    register(player_client, email="player@example.com", role="player")

    response = player_client.post("/api/teams/join", json={"join_code": team["join_code"]})

    assert response.status_code == 200
    joined_team = response.json()
    assert joined_team["id"] == team["id"]

    me = player_client.get("/api/auth/me").json()
    assert len(me["memberships"]) == 1
    assert me["memberships"][0]["role_on_team"] == "player"
    assert me["memberships"][0]["team"]["id"] == team["id"]


def test_wrong_code_fails_cleanly(client: TestClient) -> None:
    register(client, email="player@example.com", role="player")

    response = client.post("/api/teams/join", json={"join_code": "ZZZZZZ"})

    assert response.status_code == 404
    assert response.json()["detail"]
    # Cleanly: no membership was written for the failed attempt.
    me = client.get("/api/auth/me").json()
    assert me["memberships"] == []


def test_me_is_a_200_probe_not_a_401_when_signed_out(client: TestClient) -> None:
    """GET /api/auth/me is a "who am I" check a signed-out client is
    expected to call as part of normal navigation (see app/deps.py
    get_current_user_optional), so it must never itself be the error
    case: 200 with a null user, not 401."""
    response = client.get("/api/auth/me")

    assert response.status_code == 200
    assert response.json() == {"user": None, "memberships": []}


def test_join_code_is_case_and_whitespace_forgiving(client: TestClient) -> None:
    coach_client = TestClient(app)
    register(coach_client, email="coach@example.com", role="coach")
    team = coach_client.post("/api/teams", json={"name": "U12 Falcons"}).json()

    register(client, email="player@example.com", role="player")
    sloppy_code = f"  {team['join_code'].lower()}  "

    response = client.post("/api/teams/join", json={"join_code": sloppy_code})

    assert response.status_code == 200


def test_duplicate_join_is_rejected_and_does_not_double_enroll(client: TestClient) -> None:
    coach_client = TestClient(app)
    register(coach_client, email="coach@example.com", role="coach")
    team = coach_client.post("/api/teams", json={"name": "U12 Falcons"}).json()

    register(client, email="player@example.com", role="player")
    first = client.post("/api/teams/join", json={"join_code": team["join_code"]})
    assert first.status_code == 200

    second = client.post("/api/teams/join", json={"join_code": team["join_code"]})
    assert second.status_code == 409

    me = client.get("/api/auth/me").json()
    assert len(me["memberships"]) == 1


def test_player_cannot_create_a_team(client: TestClient) -> None:
    register(client, email="player@example.com", role="player")

    response = client.post("/api/teams", json={"name": "Not allowed"})

    assert response.status_code == 403


def test_duplicate_email_registration_is_rejected(client: TestClient) -> None:
    register(client, email="dup@example.com", role="coach")

    response = register(TestClient(app), email="dup@example.com", role="player")

    assert response.status_code == 409


def test_login_with_wrong_password_fails(client: TestClient) -> None:
    register(client, email="coach@example.com", role="coach")

    response = TestClient(app).post(
        "/api/auth/login", json={"email": "coach@example.com", "password": "not-the-password"}
    )

    assert response.status_code == 401


def test_login_round_trip_restores_session(client: TestClient) -> None:
    register(client, email="coach@example.com", role="coach")
    client.post("/api/teams", json={"name": "U12 Falcons"})

    fresh_client = TestClient(app)
    login_response = fresh_client.post(
        "/api/auth/login",
        json={"email": "coach@example.com", "password": "correct-horse-battery"},
    )
    assert login_response.status_code == 200

    me = fresh_client.get("/api/auth/me").json()
    assert me["memberships"][0]["team"]["name"] == "U12 Falcons"


def test_logout_clears_the_session(client: TestClient) -> None:
    register(client, email="coach@example.com", role="coach")
    assert client.get("/api/auth/me").json()["user"] is not None

    logout_response = client.post("/api/auth/logout")
    assert logout_response.status_code == 200

    after_logout = client.get("/api/auth/me")
    assert after_logout.status_code == 200
    assert after_logout.json()["user"] is None

    # Logout does not just hide state client-side: a protected route
    # rejects the (now cleared) session too.
    assert client.get("/api/teams/current").status_code == 401


@pytest.mark.parametrize(
    "path,method,payload",
    [
        ("/api/teams", "post", {"name": "x"}),
        ("/api/teams/join", "post", {"join_code": "AAAAAA"}),
        ("/api/teams/current", "get", None),
    ],
)
def test_protected_routes_require_authentication(
    client: TestClient, path: str, method: str, payload: dict | None
) -> None:
    response = getattr(client, method)(path, json=payload) if payload else getattr(client, method)(
        path
    )
    assert response.status_code == 401


def test_registration_rejects_short_password(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={
            "email": "short@example.com",
            "password": "short",
            "display_name": "Short",
            "role": "coach",
        },
    )
    assert response.status_code == 422


def test_team_id_is_never_client_supplied(client: TestClient) -> None:
    """GET /api/teams/current takes no team_id argument at all: it is
    resolved from the caller's own membership (app/deps.py). This proves
    a coach cannot read another team's data by guessing an id, because
    there is no id parameter to guess."""
    coach_a = TestClient(app)
    register(coach_a, email="coach-a@example.com", role="coach")
    team_a = coach_a.post("/api/teams", json={"name": "Team A"}).json()

    coach_b = client
    register(coach_b, email="coach-b@example.com", role="coach")
    team_b = coach_b.post("/api/teams", json={"name": "Team B"}).json()

    assert coach_a.get("/api/teams/current").json()["id"] == team_a["id"]
    assert coach_b.get("/api/teams/current").json()["id"] == team_b["id"]
    assert team_a["id"] != team_b["id"]
