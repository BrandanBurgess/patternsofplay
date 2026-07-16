"""Library content routes (doc 03 section 4; Brief step 17): GET
/api/library/items serves the three browsable libraries (patterns,
deliveries, rotations) to any authenticated team member, filterable by
item_type. Not team-scoped (library_items carries no team_id), but still
requires authentication like every other route.
"""

import pytest
from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.main import app
from app.models import LibraryItem


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


_SPEC = {
    "slots": [{"slot": "a", "role_hint": "W", "start": {"x": 50, "y": 50}}],
    "ball": {"holder_slot": "a"},
    "steps": [{"n": 1, "caption": "Step one.", "moves": []}],
    "loop": False,
}


def _seed_items() -> None:
    db = SessionLocal()
    try:
        db.add(
            LibraryItem(
                code="A1",
                item_type="pattern",
                name="Overlap",
                category="combination",
                blurb="The fullback overlaps outside the winger.",
                when_to_use="When the opponent defends narrow.",
                coaching_points_json=["Point one.", "Point two."],
                youth_takeaway="Even an unused run can create space.",
                age_hint="U9+",
                roles_involved=["inside_forward", "overlapping_fb"],
                animation_spec_json=_SPEC,
                extras_json=None,
                source_ref="bible:3A.A1",
                content_version="1.0.0",
            )
        )
        db.add(
            LibraryItem(
                code="F1",
                item_type="delivery",
                name="Byline Cutback",
                category="crossing",
                blurb="Reach the byline and pull the ball back low.",
                when_to_use="Against a set low block.",
                coaching_points_json=["Point one."],
                youth_takeaway="The simplest cross is often the best one.",
                age_hint="U9+",
                roles_involved=["overlapping_fb"],
                animation_spec_json=_SPEC,
                extras_json={
                    "trajectory": "ground",
                    "delivery_zone": "byline",
                    "target_corridor": "cutback_zone",
                },
                source_ref="bible:3F.F1",
                content_version="1.0.0",
            )
        )
        db.add(
            LibraryItem(
                code="R1",
                item_type="rotation",
                name="False-9 Drop",
                category="rotation",
                blurb="The nine drops between the lines.",
                when_to_use="Triggered whenever the ball reaches a facing midfielder.",
                coaching_points_json=["Point one."],
                youth_takeaway="One player dropping can create two runs elsewhere.",
                age_hint="U13+",
                roles_involved=["false_9"],
                animation_spec_json={**_SPEC, "loop": True},
                extras_json={
                    "trigger": "Ball reaches a facing midfielder.",
                    "creates": "A free receiver.",
                    "defenders_dilemma": "Follow or pass off.",
                },
                source_ref="bible:5B.R1",
                content_version="1.0.0",
            )
        )
        db.commit()
    finally:
        db.close()


def test_list_all_library_items(client: TestClient) -> None:
    _seed_items()
    coach = _coach_with_team()
    response = coach.get("/api/library/items")
    assert response.status_code == 200
    codes = {item["code"] for item in response.json()}
    assert codes == {"A1", "F1", "R1"}


def test_filter_by_item_type(client: TestClient) -> None:
    _seed_items()
    coach = _coach_with_team()

    patterns = coach.get("/api/library/items", params={"item_type": "pattern"}).json()
    assert [p["code"] for p in patterns] == ["A1"]

    deliveries = coach.get("/api/library/items", params={"item_type": "delivery"}).json()
    assert [p["code"] for p in deliveries] == ["F1"]
    assert deliveries[0]["extras"]["delivery_zone"] == "byline"

    rotations = coach.get("/api/library/items", params={"item_type": "rotation"}).json()
    assert [p["code"] for p in rotations] == ["R1"]
    assert rotations[0]["extras"]["defenders_dilemma"] == "Follow or pass off."
    assert rotations[0]["animation_spec"]["loop"] is True


def test_item_shape_matches_the_content_model(client: TestClient) -> None:
    _seed_items()
    coach = _coach_with_team()
    item = coach.get("/api/library/items", params={"item_type": "pattern"}).json()[0]
    assert item["name"] == "Overlap"
    assert item["category"] == "combination"
    assert item["coaching_points"] == ["Point one.", "Point two."]
    assert item["youth_takeaway"] == "Even an unused run can create space."
    assert item["roles_involved"] == ["inside_forward", "overlapping_fb"]
    assert item["animation_spec"]["slots"][0]["slot"] == "a"


def test_players_can_browse_the_library_too(client: TestClient) -> None:
    _seed_items()
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com")
    assert len(player.get("/api/library/items").json()) == 3


def test_library_route_requires_authentication(client: TestClient) -> None:
    _seed_items()
    assert client.get("/api/library/items").status_code == 401
