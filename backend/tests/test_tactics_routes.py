"""Tactics Lab API routes (doc 06 sections 3.2, 5.3, 6; T-108): formation
phases, formation matchups, rotations, position archetypes, the coach-only
archetype suggestion ranking, and team formation persistence.

T-101 created every table this ticket serves EMPTY (seed content is
T-102/T-103's job, running concurrently, not this ticket's). Every test
below builds its own fixture rows directly through app.db.SessionLocal
(same convention as test_scoped_query_layer.py) rather than depending on
scripts/seed.py, so these tests are correct against both an empty table
(today) and a seeded one (once T-102/T-103 land).

Covers, per CLAUDE.md rule 4/5 and this ticket's DoD:
  - every team-world route resolves team_id through get_team_scope, never
    a client field (team_formations direct, team_formation_slots
    transitive through team_formation_id, matching
    test_scoped_query_layer.py's lower-level proof one level up at the API)
  - one 403 test PER coach-only route, not one test for the group:
    GET /api/archetypes/suggest, POST /api/team-formations,
    PUT /api/team-formations/{id}
  - empty roster and empty tables are first-class 200 states, never 404
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.main import app
from app.models import Formation, FormationMatchup, FormationPhase, PositionArchetype, RotationSystem

# ---------------------------------------------------------------------------
# Shared fixtures (same register/team/join helper block as every other
# permission-adjacent test file in this suite, per its own convention).
# ---------------------------------------------------------------------------


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def db() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


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


_POSITIONS_433 = [
    {"slot": "gk", "position_code": "GK", "x": 5.0, "y": 50.0},
    {"slot": "cb_l", "position_code": "CB", "x": 20.0, "y": 35.0},
    {"slot": "cb_r", "position_code": "CB", "x": 20.0, "y": 65.0},
]


def _formation(db, code: str, name: str = "Formation") -> Formation:
    row = Formation(code=code, name=name, shape_blurb="test", positions_json=_POSITIONS_433)
    db.add(row)
    db.commit()
    return row


def _phase(
    db,
    formation_code: str,
    variant_code: str,
    *,
    phase: str = "in_possession",
    uses_rotations: list | None = None,
) -> FormationPhase:
    row = FormationPhase(
        formation_code=formation_code,
        variant_code=variant_code,
        phase=phase,
        name=f"{variant_code} shape",
        shape_label="3-2-5",
        blurb="A short blurb.",
        positions_json=_POSITIONS_433,
        trigger="when the ball reaches the first line",
        rest_shape="3+2",
        reference_code=None,
        uses_rotations=uses_rotations or [],
    )
    db.add(row)
    db.commit()
    return row


def _rotation(db, code: str, *, family: str = "pivot", applies_to_formations: list | None = None) -> RotationSystem:
    row = RotationSystem(
        code=code,
        name=f"{code} rotation",
        family=family,
        applies_to_formations=applies_to_formations or [],
        produces_shape="3-2-5",
        trigger="fullback steps in",
        what_moves_json=[],
        coaching_points_json=["Time the drop."],
        risk="Leaves the flank uncovered on the turnover.",
        requires_profile_json=None,
        animation_spec_json=None,
        exemplar_note=None,
    )
    db.add(row)
    db.commit()
    return row


def _archetype(
    db,
    code: str,
    *,
    slot_family: str = "CB",
    key_attribute_keys: list | None = None,
    foot_hint: str | None = None,
    awr_default: str = "med",
    dwr_default: str = "med",
    name: str | None = None,
) -> PositionArchetype:
    row = PositionArchetype(
        code=code,
        slot_family=slot_family,
        name=name or code.replace("_", " ").title(),
        definition="A defined role.",
        key_attribute_keys=key_attribute_keys or ["pace", "positional_discipline"],
        foot_hint=foot_hint,
        awr_default=awr_default,
        dwr_default=dwr_default,
        duties_json=[],
        enables_pattern_codes=[],
        enables_rotation_codes=[],
        needs_around_it="cover behind",
        exemplar_note=None,
    )
    db.add(row)
    db.commit()
    return row


def _matchup(
    db, ours_code: str, theirs_code: str, *, route: str = "Through the half spaces.", route_kind: str = "through"
) -> FormationMatchup:
    row = FormationMatchup(
        ours_code=ours_code,
        theirs_code=theirs_code,
        our_edges_json=["Our 8 exploits their gap between lines."],
        their_edges_json=["Their winger isolates our fullback."],
        route=route,
        route_kind=route_kind,
    )
    db.add(row)
    db.commit()
    return row


_ATTRS = {
    "pace": 2,
    "passing_range": 2,
    "carrying_1v1": 2,
    "positional_discipline": 2,
    "aerial_physical": 2,
    "pressing_engine": 2,
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
# GET /api/formations/{code}/phases
# ---------------------------------------------------------------------------


def test_list_formation_phases_requires_authentication(client: TestClient, db) -> None:
    _formation(db, "433", "4-3-3")
    assert client.get("/api/formations/433/phases").status_code == 401


def test_list_formation_phases_404_for_unknown_formation_code(client: TestClient, db) -> None:
    coach = _coach_with_team()
    assert coach.get("/api/formations/999/phases").status_code == 404


def test_list_formation_phases_empty_table_is_200_empty_list(client: TestClient, db) -> None:
    _formation(db, "433", "4-3-3")
    coach = _coach_with_team()
    response = coach.get("/api/formations/433/phases")
    assert response.status_code == 200
    assert response.json() == []


def test_list_formation_phases_returns_in_phase_order_with_positions_and_rotations(
    client: TestClient, db
) -> None:
    _formation(db, "433", "4-3-3")
    # Inserted out of doc 06 section 3.1's own phase order (out_of_possession
    # before in_possession) to prove the route sorts, not the insert order.
    _phase(db, "433", "low_block", phase="out_of_possession")
    _phase(db, "433", "inverted_fb", phase="in_possession", uses_rotations=["fb_invert"])

    coach = _coach_with_team()
    response = coach.get("/api/formations/433/phases")
    assert response.status_code == 200
    body = response.json()
    assert [p["variant_code"] for p in body] == ["inverted_fb", "low_block"]
    inverted = body[0]
    assert inverted["uses_rotations"] == ["fb_invert"]
    assert inverted["positions"] == _POSITIONS_433


def test_players_can_read_formation_phases_too(client: TestClient, db) -> None:
    _formation(db, "433", "4-3-3")
    _phase(db, "433", "inverted_fb")
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com")
    assert coach.get("/api/formations/433/phases").json() == player.get("/api/formations/433/phases").json()


# ---------------------------------------------------------------------------
# GET /api/formations/matchup
# ---------------------------------------------------------------------------


def test_formation_matchup_requires_authentication(client: TestClient, db) -> None:
    assert client.get("/api/formations/matchup", params={"ours": "433", "theirs": "442"}).status_code == 401


def test_formation_matchup_404_for_unknown_formation_code(client: TestClient, db) -> None:
    _formation(db, "433", "4-3-3")
    coach = _coach_with_team()
    response = coach.get("/api/formations/matchup", params={"ours": "433", "theirs": "999"})
    assert response.status_code == 404


def test_formation_matchup_returns_null_when_no_seeded_card_not_404(client: TestClient, db) -> None:
    """doc 06 section 2: an unseeded pair is a normal state ("say plainly
    that this pair has no coached read yet"), never a 404."""
    _formation(db, "433", "4-3-3")
    _formation(db, "442", "4-4-2")
    coach = _coach_with_team()
    response = coach.get("/api/formations/matchup", params={"ours": "433", "theirs": "442"})
    assert response.status_code == 200
    body = response.json()
    assert body["ours_code"] == "433"
    assert body["theirs_code"] == "442"
    assert body["matchup"] is None


def test_formation_matchup_resolves_regardless_of_query_order(client: TestClient, db) -> None:
    """formation_matchups stores one row per UNORDERED pair (doc 06
    section 3.1: 15 pairs, not 30). Querying either direction must resolve
    to the SAME stored row, presented exactly as authored (not swapped):
    see app/routers/tactics.py's module docstring for why this ticket does
    not invent a perspective-swap for the untested reverse direction."""
    _formation(db, "343", "3-4-3")
    _formation(db, "433", "4-3-3")
    _matchup(db, "343", "433", route="Go through their half space.")

    coach = _coach_with_team()
    forward = coach.get("/api/formations/matchup", params={"ours": "343", "theirs": "433"}).json()
    reverse = coach.get("/api/formations/matchup", params={"ours": "433", "theirs": "343"}).json()

    for body in (forward, reverse):
        assert body["matchup"]["ours_code"] == "343"
        assert body["matchup"]["theirs_code"] == "433"
        assert body["matchup"]["route"] == "Go through their half space."
        assert body["matchup"]["route_kind"] == "through"
        assert body["matchup"]["our_edges"] == ["Our 8 exploits their gap between lines."]
        assert body["matchup"]["their_edges"] == ["Their winger isolates our fullback."]


# ---------------------------------------------------------------------------
# GET /api/rotations
# ---------------------------------------------------------------------------


def test_rotations_empty_table_is_200_empty_list(client: TestClient, db) -> None:
    coach = _coach_with_team()
    response = coach.get("/api/rotations")
    assert response.status_code == 200
    assert response.json() == []


def test_rotations_requires_authentication(client: TestClient, db) -> None:
    assert client.get("/api/rotations").status_code == 401


def test_rotations_lists_all_and_filters_by_formation_code(client: TestClient, db) -> None:
    _rotation(db, "fb_invert", family="pivot", applies_to_formations=["433"])
    _rotation(db, "winger_underlap", family="wide", applies_to_formations=["442"])

    coach = _coach_with_team()
    all_rotations = coach.get("/api/rotations").json()
    assert {r["code"] for r in all_rotations} == {"fb_invert", "winger_underlap"}
    # family order (first_line, pivot, wide, front_line) beats insertion order.
    assert [r["code"] for r in all_rotations] == ["fb_invert", "winger_underlap"]

    filtered = coach.get("/api/rotations", params={"formation_code": "433"}).json()
    assert [r["code"] for r in filtered] == ["fb_invert"]

    assert coach.get("/api/rotations", params={"formation_code": "541"}).json() == []


def test_players_can_read_rotations_too(client: TestClient, db) -> None:
    _rotation(db, "fb_invert")
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com")
    assert coach.get("/api/rotations").json() == player.get("/api/rotations").json()


# ---------------------------------------------------------------------------
# GET /api/archetypes
# ---------------------------------------------------------------------------


def test_archetypes_empty_table_is_200_empty_list(client: TestClient, db) -> None:
    coach = _coach_with_team()
    response = coach.get("/api/archetypes")
    assert response.status_code == 200
    assert response.json() == []


def test_archetypes_lists_all_and_filters_by_slot_family(client: TestClient, db) -> None:
    _archetype(db, "metronome", slot_family="DM")
    _archetype(db, "stopper", slot_family="CB")

    coach = _coach_with_team()
    all_archetypes = coach.get("/api/archetypes").json()
    assert {a["code"] for a in all_archetypes} == {"metronome", "stopper"}

    filtered = coach.get("/api/archetypes", params={"slot_family": "DM"}).json()
    assert [a["code"] for a in filtered] == ["metronome"]


def test_players_can_read_archetypes_too(client: TestClient, db) -> None:
    _archetype(db, "metronome")
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com")
    assert coach.get("/api/archetypes").json() == player.get("/api/archetypes").json()


# ---------------------------------------------------------------------------
# GET /api/archetypes/suggest, coach-only (dedicated 403 test per this
# ticket's "one 403 test PER route" instruction).
# ---------------------------------------------------------------------------


def test_archetype_suggest_requires_coach_role__player_403(client: TestClient, db) -> None:
    _archetype(db, "metronome", slot_family="DM")
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com")
    response = player.get("/api/archetypes/suggest", params={"slot_family": "DM"})
    assert response.status_code == 403


def test_archetype_suggest_empty_candidates_is_200_empty_list_not_404(client: TestClient, db) -> None:
    coach = _coach_with_team()
    response = coach.get("/api/archetypes/suggest", params={"slot_family": "DM"})
    assert response.status_code == 200
    assert response.json()["suggestions"] == []


def test_archetype_suggest_empty_roster_state_without_player_id(client: TestClient, db) -> None:
    """doc 06 section 5.3: "Empty roster is a first-class state: the panel
    still works with archetypes alone and no players assigned.\""""
    _archetype(db, "metronome", slot_family="DM")
    _archetype(db, "destroyer", slot_family="DM")
    coach = _coach_with_team()
    response = coach.get("/api/archetypes/suggest", params={"slot_family": "DM"})
    assert response.status_code == 200
    body = response.json()
    assert body["player_id"] is None
    codes = [s["archetype_code"] for s in body["suggestions"]]
    assert set(codes) == {"metronome", "destroyer"}
    assert all("No player assigned yet" in s["why"] for s in body["suggestions"])


def test_archetype_suggest_404_for_unknown_player(client: TestClient, db) -> None:
    _archetype(db, "metronome", slot_family="DM")
    coach = _coach_with_team()
    response = coach.get("/api/archetypes/suggest", params={"slot_family": "DM", "player_id": 999})
    assert response.status_code == 404


def test_archetype_suggest_cross_team_player_404(client: TestClient, db) -> None:
    """A coach cannot rank suggestions against another team's roster row;
    scope.get() resolves it to nothing rather than leaking cross-team data
    (same "cross-team read returns nothing" contract as app/scoped.py)."""
    _archetype(db, "metronome", slot_family="DM")
    coach_a = _coach_with_team(email="coach-a@example.com")
    other_player_id = coach_a.post("/api/roster/players", json=_player_body(name="Team A Player")).json()["id"]

    coach_b = _coach_with_team(email="coach-b@example.com")
    response = coach_b.get(
        "/api/archetypes/suggest", params={"slot_family": "DM", "player_id": other_player_id}
    )
    assert response.status_code == 404


def test_archetype_suggest_ranks_by_attribute_fit_and_cites_the_actual_reason(
    client: TestClient, db
) -> None:
    """doc 06 section 5.3: rank first by attribute fit against
    key_attribute_keys, and "the why must cite the actual reason ..., not
    a score.\""""
    _archetype(
        db,
        "metronome",
        slot_family="DM",
        name="The Metronome",
        key_attribute_keys=["passing_range", "positional_discipline"],
    )
    _archetype(
        db,
        "destroyer",
        slot_family="DM",
        name="The Destroyer",
        key_attribute_keys=["pressing_engine", "aerial_physical"],
    )

    coach = _coach_with_team()
    player_id = coach.post(
        "/api/roster/players",
        json=_player_body(
            name="Deep Lying Playmaker",
            attributes={
                "pace": 2,
                "passing_range": 5,
                "carrying_1v1": 2,
                "positional_discipline": 4,
                "aerial_physical": 1,
                "pressing_engine": 1,
            },
        ),
    ).json()["id"]

    response = coach.get(
        "/api/archetypes/suggest", params={"slot_family": "DM", "player_id": player_id}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["player_id"] == player_id
    codes = [s["archetype_code"] for s in body["suggestions"]]
    assert codes[0] == "metronome"  # higher attribute_score (5+4=9 vs 1+1=2)

    metronome_why = next(s["why"] for s in body["suggestions"] if s["archetype_code"] == "metronome")
    assert "passing range 5" in metronome_why
    assert "positional discipline 4" in metronome_why
    assert "the metronome" in metronome_why
    # Cites the real values, never a bare numeric score.
    assert "score" not in metronome_why.lower()


def test_archetype_suggest_foot_fit_cited_when_it_decides_the_why(client: TestClient, db) -> None:
    """doc 06 section 5.3's second ranking criterion: "foot fit against
    foot_hint and the slot's side.\""""
    _archetype(
        db,
        "inverted_fb",
        slot_family="FB",
        name="Inverted Fullback",
        key_attribute_keys=["passing_range", "positional_discipline"],
        foot_hint="opposite_side",
    )

    coach = _coach_with_team()
    # Left-back, right-footed: opposite_side foot_hint fits.
    player_id = coach.post(
        "/api/roster/players",
        json=_player_body(name="Left Back", preferred_foot="R", flank="left", attributes=_ATTRS),
    ).json()["id"]

    response = coach.get(
        "/api/archetypes/suggest", params={"slot_family": "FB", "player_id": player_id}
    )
    why = response.json()["suggestions"][0]["why"]
    assert "opposite side" in why


def test_archetype_suggest_awr_dwr_match_cited(client: TestClient, db) -> None:
    """doc 06 section 5.3's third ranking criterion: "AWR/DWR match.\""""
    _archetype(
        db,
        "box_to_box",
        slot_family="CM",
        name="Box To Box",
        key_attribute_keys=["pace"],
        awr_default="high",
        dwr_default="high",
    )
    coach = _coach_with_team()
    player_id = coach.post(
        "/api/roster/players",
        json=_player_body(name="Engine", awr="high", dwr="high", attributes=_ATTRS),
    ).json()["id"]
    response = coach.get(
        "/api/archetypes/suggest", params={"slot_family": "CM", "player_id": player_id}
    )
    why = response.json()["suggestions"][0]["why"]
    assert "work rate matches the role both ways" in why


def test_archetype_suggest_limits_to_top_three(client: TestClient, db) -> None:
    for i in range(5):
        _archetype(db, f"cb_{i}", slot_family="CB", key_attribute_keys=["pace"])
    coach = _coach_with_team()
    player_id = coach.post("/api/roster/players", json=_player_body(attributes=_ATTRS)).json()["id"]
    response = coach.get(
        "/api/archetypes/suggest", params={"slot_family": "CB", "player_id": player_id}
    )
    assert len(response.json()["suggestions"]) == 3


# ---------------------------------------------------------------------------
# Team formation persistence (doc 06 section 3.2): create/update coach-only
# (dedicated 403 tests per route below), read open to both roles.
# ---------------------------------------------------------------------------


def _tf_body(**overrides: object) -> dict:
    base: dict = {
        "name": "Saturday setup",
        "base_formation_code": "433",
        "active_phase_variant": "in_possession",
        "opponent_formation_code": None,
        "opponent_phase_variant": None,
        "slots": [],
    }
    base.update(overrides)
    return base


def test_create_team_formation_requires_coach_role__player_403(client: TestClient, db) -> None:
    _formation(db, "433", "4-3-3")
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com")
    response = player.post("/api/team-formations", json=_tf_body())
    assert response.status_code == 403


def test_update_team_formation_requires_coach_role__player_403(client: TestClient, db) -> None:
    _formation(db, "433", "4-3-3")
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com")
    created = coach.post("/api/team-formations", json=_tf_body()).json()
    response = player.put(f"/api/team-formations/{created['id']}", json=_tf_body(name="Forged"))
    assert response.status_code == 403
    # The forged write did not take.
    assert coach.get(f"/api/team-formations/{created['id']}").json()["name"] == "Saturday setup"


def test_create_and_read_team_formation_round_trip_with_resolved_names(
    client: TestClient, db
) -> None:
    _formation(db, "433", "4-3-3")
    _archetype(db, "metronome", slot_family="DM", name="The Metronome")
    coach = _coach_with_team()
    player_id = coach.post("/api/roster/players", json=_player_body(name="Sam Anchor")).json()["id"]

    created = coach.post(
        "/api/team-formations",
        json=_tf_body(
            slots=[
                {
                    "slot": "six",
                    "player_id": player_id,
                    "archetype_code": "metronome",
                    "qualitative_edge": True,
                }
            ]
        ),
    )
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Saturday setup"
    assert len(body["slots"]) == 1
    slot = body["slots"][0]
    assert slot["slot"] == "six"
    assert slot["player_name"] == "Sam Anchor"
    assert slot["archetype_name"] == "The Metronome"
    assert slot["qualitative_edge"] is True

    fetched = coach.get(f"/api/team-formations/{body['id']}").json()
    assert fetched == body


def test_players_can_read_team_formations_too(client: TestClient, db) -> None:
    _formation(db, "433", "4-3-3")
    coach = _coach_with_team()
    player = _player_on_team(coach, email="player@example.com")
    coach.post("/api/team-formations", json=_tf_body())
    assert coach.get("/api/team-formations").json() == player.get("/api/team-formations").json()


def test_update_team_formation_replaces_the_whole_slot_set(client: TestClient, db) -> None:
    _formation(db, "433", "4-3-3")
    coach = _coach_with_team()
    created = coach.post(
        "/api/team-formations", json=_tf_body(slots=[{"slot": "six", "player_id": None, "archetype_code": None}])
    ).json()

    updated = coach.put(
        f"/api/team-formations/{created['id']}",
        json=_tf_body(
            name="Renamed",
            slots=[{"slot": "eight_l", "player_id": None, "archetype_code": None}],
        ),
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["name"] == "Renamed"
    assert [s["slot"] for s in body["slots"]] == ["eight_l"]


def test_create_team_formation_422_unknown_base_formation_code(client: TestClient, db) -> None:
    coach = _coach_with_team()
    response = coach.post("/api/team-formations", json=_tf_body(base_formation_code="999"))
    assert response.status_code == 422


def test_create_team_formation_422_unknown_player_id(client: TestClient, db) -> None:
    _formation(db, "433", "4-3-3")
    coach = _coach_with_team()
    response = coach.post(
        "/api/team-formations",
        json=_tf_body(slots=[{"slot": "six", "player_id": 999, "archetype_code": None}]),
    )
    assert response.status_code == 422


def test_create_team_formation_422_unknown_archetype_code(client: TestClient, db) -> None:
    _formation(db, "433", "4-3-3")
    coach = _coach_with_team()
    response = coach.post(
        "/api/team-formations",
        json=_tf_body(slots=[{"slot": "six", "player_id": None, "archetype_code": "does-not-exist"}]),
    )
    assert response.status_code == 422


def test_create_team_formation_422_duplicate_slot(client: TestClient, db) -> None:
    _formation(db, "433", "4-3-3")
    coach = _coach_with_team()
    response = coach.post(
        "/api/team-formations",
        json=_tf_body(
            slots=[
                {"slot": "six", "player_id": None, "archetype_code": None},
                {"slot": "six", "player_id": None, "archetype_code": None},
            ]
        ),
    )
    assert response.status_code == 422


def test_create_team_formation_cannot_assign_another_teams_player(client: TestClient, db) -> None:
    """CLAUDE.md rule 4: client input never supplies team_id, and a
    player_id from another team resolves to nothing through the scope, the
    same "cross-team read returns nothing" contract at the API layer."""
    _formation(db, "433", "4-3-3")
    coach_a = _coach_with_team(email="coach-a@example.com")
    other_player_id = coach_a.post("/api/roster/players", json=_player_body(name="Team A Player")).json()["id"]

    coach_b = _coach_with_team(email="coach-b@example.com")
    response = coach_b.post(
        "/api/team-formations",
        json=_tf_body(slots=[{"slot": "six", "player_id": other_player_id, "archetype_code": None}]),
    )
    assert response.status_code == 422


def test_team_formation_cross_team_read_returns_404(client: TestClient, db) -> None:
    """API-level companion to test_scoped_query_layer.py's lower-level
    proof: a coach on a different team cannot fetch another team's saved
    formation by id, and gets 404 (not the other team's data, not a 403
    that would even confirm the id exists)."""
    _formation(db, "433", "4-3-3")
    coach_a = _coach_with_team(email="coach-a@example.com")
    team_a_formation_id = coach_a.post("/api/team-formations", json=_tf_body()).json()["id"]

    coach_b = _coach_with_team(email="coach-b@example.com")
    assert coach_b.get(f"/api/team-formations/{team_a_formation_id}").status_code == 404
    assert coach_b.put(f"/api/team-formations/{team_a_formation_id}", json=_tf_body()).status_code == 404
    assert coach_b.get("/api/team-formations").json() == []


def test_em_dash_never_appears_in_a_tactics_response(client: TestClient, db) -> None:
    _formation(db, "433", "4-3-3")
    _phase(db, "433", "inverted_fb")
    _rotation(db, "fb_invert")
    _archetype(db, "metronome")
    coach = _coach_with_team()
    for path, params in (
        ("/api/formations/433/phases", None),
        ("/api/rotations", None),
        ("/api/archetypes", None),
        ("/api/archetypes/suggest", {"slot_family": "CB"}),
    ):
        assert "—" not in coach.get(path, params=params).text, path
