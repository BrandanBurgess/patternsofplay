"""Formations route (doc 03 section 5; Brief step 18): GET /api/formations
serves the six seeded presets with their keystones and rondo zones
embedded. Not team-scoped (Formation/FormationKeystone/RondoZone carry no
team_id), but still requires authentication like every other route. Seeds
via the real scripts/seed.py loader (same in-process import convention as
test_seed_content.py's idempotency test) rather than hand-built fixtures,
so this exercises the actual seeded content: 6 formations, 13 keystones,
5 rondo zones (all on 433, per seeds/rondo_zones.json's own note).
"""

import importlib.util
import pathlib
import sys

import pytest
from fastapi.testclient import TestClient

from app.main import app

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]


def _import_seed_module():
    spec = importlib.util.spec_from_file_location("pop_seed_script_formations", REPO_ROOT / "scripts" / "seed.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def client() -> TestClient:
    seed = _import_seed_module()
    assert seed.main() == 0
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


def test_list_formations_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/formations").status_code == 401


def test_list_formations_returns_all_six_in_bible_order(client: TestClient) -> None:
    coach = _coach_with_team()
    response = coach.get("/api/formations")
    assert response.status_code == 200
    codes = [f["code"] for f in response.json()]
    assert codes == ["433", "4231", "442", "352", "343", "541"]


def test_players_can_browse_formations_too(client: TestClient) -> None:
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com")
    assert len(player.get("/api/formations").json()) == 6


def test_formation_shape_includes_positions_strengths_and_vulnerabilities(client: TestClient) -> None:
    coach = _coach_with_team()
    formations = {f["code"]: f for f in coach.get("/api/formations").json()}
    f433 = formations["433"]
    assert f433["name"] == "4-3-3"
    assert len(f433["positions"]) == 11
    assert any(p["slot"] == "six" and p["position_code"] == "DM" for p in f433["positions"])
    assert len(f433["strengths"]) >= 1
    assert len(f433["vulnerabilities"]) >= 1


def test_every_keystone_tap_target_has_a_slot_title_and_blurb(client: TestClient) -> None:
    coach = _coach_with_team()
    formations = {f["code"]: f for f in coach.get("/api/formations").json()}
    f433 = formations["433"]
    keystone_slots = {k["slot"] for k in f433["keystones"]}
    assert keystone_slots == {"six", "st", "eight_l"}
    six = next(k for k in f433["keystones"] if k["slot"] == "six")
    assert six["title"] == "The 6 (single pivot)"
    assert "elite positional discipline" in six["blurb"]

    f4231 = formations["4231"]
    assert {k["slot"] for k in f4231["keystones"]} == {"am", "dm_l"}


def test_rondo_zones_show_their_rondo_and_linked_patterns(client: TestClient) -> None:
    coach = _coach_with_team()
    formations = {f["code"]: f for f in coach.get("/api/formations").json()}
    f433 = formations["433"]
    zones = {z["zone_key"]: z for z in f433["rondo_zones"]}
    assert set(zones) == {"first_line", "midfield_box", "flank_corridor", "last_line", "counterpress"}

    midfield = zones["midfield_box"]
    assert midfield["rondo_name"] == "5v3 (the midfield box)"
    assert midfield["trains_pattern_codes"] == ["B8", "A5"]
    assert len(midfield["polygon"]) == 4
    assert all({"x", "y"} <= set(pt) for pt in midfield["polygon"])

    # Only 433 carries a seeded rondo map today (seeds/rondo_zones.json note).
    f442 = formations["442"]
    assert f442["rondo_zones"] == []


def test_em_dash_never_appears_in_a_formations_response(client: TestClient) -> None:
    coach = _coach_with_team()
    body = coach.get("/api/formations").text
    assert "—" not in body
