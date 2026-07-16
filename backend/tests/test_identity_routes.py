"""Identity content routes (doc 03 section 5; Brief step 20): GET
/api/identities serves the three browsable segments (reference teams,
style archetypes, cult corner) to any authenticated team member,
filterable by kind. Not team-scoped (identities carries no team_id), but
still requires authentication like every other route. Mirrors
test_library_routes.py's shape.
"""

import pytest
from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.main import app
from app.models import Identity


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


def _coach_with_team(email: str = "coach@example.com") -> TestClient:
    c = TestClient(app)
    _register(c, email=email, role="coach", display_name="Coach Test")
    c.post("/api/teams", json={"name": f"Team for {email}"})
    return c


def _player_on_team(coach: TestClient, email: str) -> TestClient:
    join_code = coach.get("/api/teams/current").json()["join_code"]
    p = TestClient(app)
    _register(p, email=email, role="player", display_name="Player Test")
    p.post("/api/teams/join", json={"join_code": join_code})
    return p


_ANIM_SPEC = {
    "slots": [{"slot": "a", "role_hint": "W", "start": {"x": 50, "y": 50}}],
    "ball": {"holder_slot": "a"},
    "steps": [{"n": 1, "caption": "Step one.", "moves": []}],
    "loop": False,
}

_STATIC_SHAPE = {
    "positions": [{"slot": "gk", "role_hint": "GK", "x": 6, "y": 50}],
    "note": "A static blueprint shape.",
}


def _seed_identities() -> None:
    db = SessionLocal()
    try:
        db.add(
            Identity(
                kind="reference_team",
                code="ref_1",
                name="Reference One",
                tag_line="A reference team tag line.",
                formation_code=None,
                core_idea="Formation: 4-3-3. The core idea text follows the formation sentence.",
                signature_pattern_codes=["A1"],
                keystone_roles_json=[{"role": "single_pivot", "note": "The pivot."}],
                youth_takeaway="A youth takeaway line.",
                block="high",
                pass_risk_json=None,
                shape_render="animated",
                signature_animation_spec_json=_ANIM_SPEC,
                static_shape_json=None,
                source_ref="bible:6.1",
                content_version="1.0.0",
            )
        )
        db.add(
            Identity(
                kind="reference_team",
                code="ref_2",
                name="Reference Two",
                tag_line="A static reference team.",
                formation_code=None,
                core_idea="Formation: 4-4-2. Static shape only, no animation.",
                signature_pattern_codes=[],
                keystone_roles_json=[{"role": "stopper_cb", "note": "The stopper."}],
                youth_takeaway="Another youth takeaway.",
                block="mid",
                pass_risk_json=None,
                shape_render="static",
                signature_animation_spec_json=None,
                static_shape_json=_STATIC_SHAPE,
                source_ref="bible:6.2",
                content_version="1.0.0",
            )
        )
        db.add(
            Identity(
                kind="style_archetype",
                code="style_1",
                name="Style One",
                tag_line="A style archetype tag line.",
                formation_code=None,
                core_idea="Keep the ball to control the game.",
                signature_pattern_codes=["B5"],
                keystone_roles_json=["single_pivot", "false_9"],
                youth_takeaway="A style youth takeaway.",
                block="high",
                pass_risk_json={
                    "encouraged": ["Short circulation"],
                    "tolerated": [],
                    "discouraged": ["Hopeful long balls"],
                    "tempo_rule": "Slow-slow-fast.",
                },
                shape_render="details_only",
                signature_animation_spec_json=None,
                static_shape_json=None,
                source_ref="bible:5.1",
                content_version="1.0.0",
            )
        )
        db.add(
            Identity(
                kind="cult_card",
                code="cult_1",
                name="Cult One",
                tag_line="A one-line cult corner card.",
                formation_code=None,
                core_idea="A one-line cult corner idea.",
                signature_pattern_codes=[],
                keystone_roles_json=None,
                youth_takeaway="A cult corner youth takeaway.",
                block=None,
                pass_risk_json=None,
                shape_render="details_only",
                signature_animation_spec_json=None,
                static_shape_json=None,
                source_ref="bible:6.19",
                content_version="1.0.0",
            )
        )
        db.commit()
    finally:
        db.close()


def test_list_all_identities(client: TestClient) -> None:
    _seed_identities()
    coach = _coach_with_team()
    response = coach.get("/api/identities")
    assert response.status_code == 200
    codes = {item["code"] for item in response.json()}
    assert codes == {"ref_1", "ref_2", "style_1", "cult_1"}


def test_filter_by_kind(client: TestClient) -> None:
    _seed_identities()
    coach = _coach_with_team()

    ref_teams = coach.get("/api/identities", params={"kind": "reference_team"}).json()
    assert {t["code"] for t in ref_teams} == {"ref_1", "ref_2"}

    styles = coach.get("/api/identities", params={"kind": "style_archetype"}).json()
    assert [s["code"] for s in styles] == ["style_1"]
    assert styles[0]["pass_risk"]["tempo_rule"] == "Slow-slow-fast."

    cult = coach.get("/api/identities", params={"kind": "cult_card"}).json()
    assert [c["code"] for c in cult] == ["cult_1"]


def test_identity_shape_matches_the_content_model(client: TestClient) -> None:
    _seed_identities()
    coach = _coach_with_team()
    animated = coach.get("/api/identities", params={"kind": "reference_team"}).json()
    animated_ref = next(t for t in animated if t["code"] == "ref_1")
    static_ref = next(t for t in animated if t["code"] == "ref_2")

    assert animated_ref["shape_render"] == "animated"
    assert animated_ref["signature_animation_spec"]["slots"][0]["slot"] == "a"
    assert animated_ref["keystone_roles"] == [{"role": "single_pivot", "note": "The pivot."}]
    assert animated_ref["static_shape"] is None

    assert static_ref["shape_render"] == "static"
    assert static_ref["static_shape"]["positions"][0]["slot"] == "gk"
    assert static_ref["signature_animation_spec"] is None


def test_players_can_browse_identities_too(client: TestClient) -> None:
    _seed_identities()
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com")
    assert len(player.get("/api/identities").json()) == 4


def test_identity_route_requires_authentication(client: TestClient) -> None:
    _seed_identities()
    assert client.get("/api/identities").status_code == 401
