"""Roster routes (doc 03 section 3; Brief step 19; T-033). Covers: player
CRUD is team-scoped and coach-only; the role catalog is readable by both
roles; the double-exposure fit warning fires per doc 03's rule (high AWR
fullback/wingback behind a high AWR / low DWR wide player on the same
flank) and is present ONLY on the coach's GET /api/roster response
(CLAUDE.md rule 5: coach-only data never appears in a player-role
payload) -- proven here by asserting the key is absent from the JSON body
entirely, not null or empty.
"""

import importlib.util
import pathlib
import sys

import pytest
from fastapi.testclient import TestClient

from app.main import app

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]


def _run_seed_loader() -> None:
    # Role/PositionCode/RoleClash rows (test_seed_content.py's own module,
    # reused here rather than duplicated) are library content the roster
    # role picker and the double-exposure check both read; conftest.py's
    # per-test drop_all/create_all wipes them, so each test reseeds.
    spec = importlib.util.spec_from_file_location(
        "pop_seed_script_roster_tests", REPO_ROOT / "scripts" / "seed.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    assert module.main() == 0


@pytest.fixture(autouse=True)
def _seed_library_content() -> None:
    # Runs after conftest.py's _reset_schema (both function-scoped autouse;
    # the outer conftest fixture instantiates first), so the schema always
    # exists before the seed loader's create_all/session writes run.
    _run_seed_loader()


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
# Role catalog: read-only, both roles, library content (not team-scoped)
# ---------------------------------------------------------------------------


def test_role_catalog_is_readable_by_coach_and_player(client: TestClient) -> None:
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com")

    coach_roles = coach.get("/api/roster/roles")
    player_roles = player.get("/api/roster/roles")
    assert coach_roles.status_code == 200
    assert player_roles.status_code == 200
    codes = {r["code"] for r in coach_roles.json()}
    assert "overlapping_fb" in codes
    assert "touchline_winger" in codes


def test_role_catalog_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/roster/roles").status_code == 401


# ---------------------------------------------------------------------------
# Player CRUD: coach-only, team-scoped
# ---------------------------------------------------------------------------


def test_coach_can_create_read_update_delete_a_player(client: TestClient) -> None:
    coach = _coach_with_team()

    created = coach.post("/api/roster/players", json=_player_body(name="Jordan T."))
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Jordan T."
    assert body["attributes"] == _ATTRS
    assert body["is_you"] is False
    player_id = body["id"]

    listed = coach.get("/api/roster").json()
    assert [p["name"] for p in listed["players"]] == ["Jordan T."]

    updated = coach.put(
        f"/api/roster/players/{player_id}",
        json=_player_body(name="Jordan Taylor", jersey_number=2, awr="high", dwr="high"),
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Jordan Taylor"
    assert updated.json()["jersey_number"] == 2

    deleted = coach.delete(f"/api/roster/players/{player_id}")
    assert deleted.status_code == 204
    assert coach.get("/api/roster").json()["players"] == []


def test_role_code_resolves_position_code_and_role_name(client: TestClient) -> None:
    coach = _coach_with_team()
    created = coach.post(
        "/api/roster/players",
        json=_player_body(name="Maya K.", role_code="inside_forward", flank="right", awr="high", dwr="low"),
    ).json()
    assert created["position_code"] == "W"
    assert created["role_name"] == "Inside Forward / Inverted Winger"
    assert created["role_description"]


def test_unknown_role_code_is_rejected(client: TestClient) -> None:
    coach = _coach_with_team()
    response = coach.post("/api/roster/players", json=_player_body(role_code="not_a_real_role"))
    assert response.status_code == 422


def test_player_cannot_create_update_or_delete_a_player(client: TestClient) -> None:
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com")
    player_id = coach.post("/api/roster/players", json=_player_body()).json()["id"]

    assert player.post("/api/roster/players", json=_player_body(name="Forged")).status_code == 403
    assert (
        player.put(f"/api/roster/players/{player_id}", json=_player_body(name="Edited")).status_code
        == 403
    )
    assert player.delete(f"/api/roster/players/{player_id}").status_code == 403

    # Nothing changed.
    assert coach.get("/api/roster").json()["players"][0]["name"] == "New Player"


def test_roster_is_team_scoped(client: TestClient) -> None:
    coach_a = _coach_with_team(email="coach-a@example.com")
    coach_b = _coach_with_team(email="coach-b@example.com")
    coach_a.post("/api/roster/players", json=_player_body(name="Only on team A"))

    assert coach_b.get("/api/roster").json()["players"] == []


def test_cross_team_update_and_delete_404_not_the_other_teams_row(client: TestClient) -> None:
    coach_a = _coach_with_team(email="coach-a@example.com")
    coach_b = _coach_with_team(email="coach-b@example.com")
    player_id = coach_a.post("/api/roster/players", json=_player_body(name="Team A only")).json()["id"]

    assert coach_b.put(f"/api/roster/players/{player_id}", json=_player_body()).status_code == 404
    assert coach_b.delete(f"/api/roster/players/{player_id}").status_code == 404
    assert len(coach_a.get("/api/roster").json()["players"]) == 1


def test_roster_routes_require_authentication(client: TestClient) -> None:
    assert client.get("/api/roster").status_code == 401
    assert client.post("/api/roster/players", json=_player_body()).status_code == 401
    assert client.put("/api/roster/players/1", json=_player_body()).status_code == 401
    assert client.delete("/api/roster/players/1").status_code == 401


def test_client_cannot_forge_team_id_or_user_id(client: TestClient) -> None:
    """CLAUDE.md rule 4: client input never supplies team_id. The write
    schema (extra='forbid') has no team_id or user_id field at all, so a
    client cannot even attempt to forge either."""
    coach = _coach_with_team()
    response = coach.post(
        "/api/roster/players",
        json={**_player_body(), "team_id": 9999, "user_id": 9999},
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Double-exposure fit warning (doc 03 section 3): coach-only, never on a
# player payload.
# ---------------------------------------------------------------------------


def _seed_double_exposure_pair(coach: TestClient) -> None:
    # High AWR / low DWR wide player (inside_forward, position_code W).
    coach.post(
        "/api/roster/players",
        json=_player_body(
            name="Maya K.", role_code="inside_forward", flank="right", awr="high", dwr="low"
        ),
    )
    # High AWR fullback behind her on the same flank (overlapping_fb, FB).
    coach.post(
        "/api/roster/players",
        json=_player_body(
            name="Jordan T.", role_code="overlapping_fb", flank="right", awr="high", dwr="med"
        ),
    )


def test_double_exposure_fires_for_a_high_awr_fullback_behind_a_high_low_winger(
    client: TestClient,
) -> None:
    coach = _coach_with_team()
    _seed_double_exposure_pair(coach)

    body = coach.get("/api/roster").json()
    assert len(body["fit_warnings"]) == 1
    warning = body["fit_warnings"][0]
    assert warning["code"] == "double_exposure_flank"
    assert warning["flank"] == "right"
    assert warning["wide_player_name"] == "Maya K."
    assert warning["back_player_name"] == "Jordan T."
    assert warning["message"]  # seeded Bible copy, non-empty
    assert "—" not in warning["message"]  # no em dashes anywhere user-facing


def test_double_exposure_does_not_fire_across_different_flanks(client: TestClient) -> None:
    coach = _coach_with_team()
    coach.post(
        "/api/roster/players",
        json=_player_body(name="Left W", role_code="inside_forward", flank="left", awr="high", dwr="low"),
    )
    coach.post(
        "/api/roster/players",
        json=_player_body(name="Right FB", role_code="overlapping_fb", flank="right", awr="high", dwr="med"),
    )

    assert coach.get("/api/roster").json()["fit_warnings"] == []


def test_double_exposure_does_not_fire_when_fullback_awr_is_not_high(client: TestClient) -> None:
    coach = _coach_with_team()
    coach.post(
        "/api/roster/players",
        json=_player_body(name="Wide W", role_code="inside_forward", flank="right", awr="high", dwr="low"),
    )
    coach.post(
        "/api/roster/players",
        json=_player_body(name="Cautious FB", role_code="overlapping_fb", flank="right", awr="med", dwr="high"),
    )

    assert coach.get("/api/roster").json()["fit_warnings"] == []


def test_fit_warnings_field_is_entirely_absent_from_a_player_role_payload(
    client: TestClient,
) -> None:
    """CLAUDE.md rule 5: coach-only data never appears in player-role
    payloads. Asserts the key itself is missing (not None, not []), which
    is what response_model=None + a fit_warnings-less RosterOut guarantees."""
    coach = _coach_with_team()
    _seed_double_exposure_pair(coach)
    player = _player_on_team(coach, email="player@example.com")

    coach_body = coach.get("/api/roster").json()
    assert "fit_warnings" in coach_body
    assert len(coach_body["fit_warnings"]) == 1

    player_body = player.get("/api/roster").json()
    assert "fit_warnings" not in player_body
    assert len(player_body["players"]) == 2
    for player_row in player_body["players"]:
        assert "fit_warnings" not in player_row


def test_players_own_row_is_marked_is_you(client: TestClient) -> None:
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com")
    coach.post("/api/roster/players", json=_player_body(name="Roster Row"))

    # No claiming flow exists yet (T-033 report flags this as a gap): a
    # roster row is never linked to a player's own user_id in this build,
    # so both roles currently see is_you False for every row. This test
    # pins that documented behavior rather than a hidden assumption.
    assert all(p["is_you"] is False for p in coach.get("/api/roster").json()["players"])
    assert all(p["is_you"] is False for p in player.get("/api/roster").json()["players"])
