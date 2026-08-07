"""Sessions routes (doc 03 section 6; Brief step 23, PNG 21-23, 26, 28;
T-042). Covers the "Roles and sessions" DoD line from Brief section 5:

    "Session receipts: Mark as watched increments the coach's x/y counter
     and flips that player's row to Viewed; players never see receipt data
     in any payload."

plus the draft-builder mechanics the design README specifies (attach
library presets AND saved recordings, reorder, remove, coach note, send)
and team scoping end to end through the HTTP layer.
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


_SPEC = {
    "slots": [
        {"slot": "cm", "role_hint": "CM", "start": {"x": 40, "y": 50}},
        {"slot": "st", "role_hint": "ST", "start": {"x": 70, "y": 50}},
    ],
    "ball": {"holder_slot": "cm"},
    "steps": [
        {
            "n": 1,
            "caption": "Play it in.",
            "moves": [{"slot": "st", "to": {"x": 80, "y": 45}}],
            "ball_to": {"bind_slot": "st", "trajectory": "ground"},
        }
    ],
    "loop": False,
}


def _seed_library_item(code: str = "A5", name: str = "Third-Man Run") -> int:
    """The suite resets the schema per test (conftest.py), so library-world
    content is empty; sessions need one real row to attach."""
    db = SessionLocal()
    try:
        item = LibraryItem(
            code=code,
            item_type="pattern",
            name=name,
            category="combination",
            blurb="The third player arrives to receive.",
            when_to_use="Against a compact block.",
            coaching_points_json=["Time the run."],
            youth_takeaway="Look past the first pass.",
            age_hint="U13+",
            roles_involved=["deep_lying_playmaker"],
            animation_spec_json=_SPEC,
            extras_json=None,
        )
        db.add(item)
        db.commit()
        return item.id
    finally:
        db.close()


_TOKENS = [
    {"id": "home-9", "side": "home", "label": "9", "pos": {"x": 60, "y": 30}},
    {"id": "ball", "side": "ball", "label": "", "pos": {"x": 50, "y": 50}},
]
_SNAPSHOT = {
    "tokens": _TOKENS,
    "confirmed_lanes": [],
    "blocking_threshold": 7.0,
    "marking_threshold": 10.0,
    "zones_visible": {"thirds": False, "half_spaces": False, "zone_14": False, "cutback": False},
}
_KEYFRAMES = [
    {"t_ms": 0, "token_id": "home-9", "x": 60.0, "y": 30.0},
    {"t_ms": 500, "token_id": "home-9", "x": 72.0, "y": 24.0},
]


def _saved_pattern(coach: TestClient, name: str = "Our build-out vs press") -> int:
    return coach.post(
        "/api/patterns",
        json={"name": name, "board_snapshot": _SNAPSHOT, "keyframes": _KEYFRAMES},
    ).json()["id"]


# ---------------------------------------------------------------------------
# The full coach loop: draft, attach both item kinds, note, send, receipts.
# ---------------------------------------------------------------------------


def test_coach_builds_a_draft_attaches_both_item_kinds_and_sends(client: TestClient) -> None:
    coach = _coach_with_team()
    _player_on_team(coach, email="p1@example.com", name="Jordan T.")
    library_id = _seed_library_item()
    pattern_id = _saved_pattern(coach)

    created = coach.post(
        "/api/sessions",
        json={"title": "Tuesday, wide overloads", "coach_note": "Watch both before training."},
    )
    assert created.status_code == 201
    session = created.json()
    assert session["status"] == "draft"
    assert session["sent_at"] is None
    assert session["items"] == []
    # Draft receipts preview the send: the design README's "Will receive".
    assert session["recipient_count"] == 1
    assert session["viewed_count"] == 0

    session_id = session["id"]
    with_library = coach.post(
        f"/api/sessions/{session_id}/items",
        json={"item_kind": "library", "library_item_id": library_id},
    )
    assert with_library.status_code == 201
    with_pattern = coach.post(
        f"/api/sessions/{session_id}/items",
        json={"item_kind": "saved_pattern", "saved_pattern_id": pattern_id},
    )
    assert with_pattern.status_code == 201

    items = with_pattern.json()["items"]
    assert [i["position"] for i in items] == [0, 1]
    # Items embed their full content so a thumbnail renders in one round trip.
    assert items[0]["library_item"]["code"] == "A5"
    assert items[0]["library_item"]["animation_spec"]["ball"]["holder_slot"] == "cm"
    assert items[0]["saved_pattern"] is None
    assert items[1]["saved_pattern"]["name"] == "Our build-out vs press"
    assert items[1]["saved_pattern"]["author_label"] == "COACH"
    assert len(items[1]["saved_pattern"]["keyframes"]) == 2

    sent = coach.post(f"/api/sessions/{session_id}/send")
    assert sent.status_code == 200
    body = sent.json()
    assert body["status"] == "sent"
    assert body["sent_at"] is not None
    assert body["recipient_count"] == 1
    assert body["viewed_count"] == 0
    assert body["receipts"][0]["display_name"] == "Jordan T."
    assert body["receipts"][0]["viewed"] is False
    assert body["receipts"][0]["viewed_at"] is None


def test_draft_items_reorder_and_remove(client: TestClient) -> None:
    coach = _coach_with_team()
    first = _seed_library_item("A1", "Overlap")
    second = _seed_library_item("B3", "Switch of play")
    session_id = coach.post("/api/sessions", json={"title": "Draft"}).json()["id"]

    coach.post(
        f"/api/sessions/{session_id}/items",
        json={"item_kind": "library", "library_item_id": first},
    )
    body = coach.post(
        f"/api/sessions/{session_id}/items",
        json={"item_kind": "library", "library_item_id": second},
    ).json()
    assert [i["library_item"]["code"] for i in body["items"]] == ["A1", "B3"]

    second_item_id = body["items"][1]["id"]
    moved = coach.patch(
        f"/api/sessions/{session_id}/items/{second_item_id}", json={"position": 0}
    ).json()
    assert [i["library_item"]["code"] for i in moved["items"]] == ["B3", "A1"]
    assert [i["position"] for i in moved["items"]] == [0, 1]

    removed = coach.delete(f"/api/sessions/{session_id}/items/{second_item_id}").json()
    assert [i["library_item"]["code"] for i in removed["items"]] == ["A1"]
    assert [i["position"] for i in removed["items"]] == [0]


def test_a_sent_session_can_no_longer_be_edited(client: TestClient) -> None:
    coach = _coach_with_team()
    _player_on_team(coach, email="p1@example.com")
    library_id = _seed_library_item()
    session_id = coach.post("/api/sessions", json={"title": "Locked"}).json()["id"]
    coach.post(
        f"/api/sessions/{session_id}/items",
        json={"item_kind": "library", "library_item_id": library_id},
    )
    item_id = coach.get(f"/api/sessions/{session_id}").json()["items"][0]["id"]
    coach.post(f"/api/sessions/{session_id}/send")

    assert coach.patch(f"/api/sessions/{session_id}", json={"title": "Nope"}).status_code == 409
    assert (
        coach.post(
            f"/api/sessions/{session_id}/items",
            json={"item_kind": "library", "library_item_id": library_id},
        ).status_code
        == 409
    )
    assert coach.delete(f"/api/sessions/{session_id}/items/{item_id}").status_code == 409
    assert coach.post(f"/api/sessions/{session_id}/send").status_code == 409


def test_an_empty_session_cannot_be_sent(client: TestClient) -> None:
    coach = _coach_with_team()
    _player_on_team(coach, email="p1@example.com")
    session_id = coach.post("/api/sessions", json={"title": "Nothing in it"}).json()["id"]
    assert coach.post(f"/api/sessions/{session_id}/send").status_code == 422


# ---------------------------------------------------------------------------
# The player side, and the coach-only receipt contract (CLAUDE.md rule 5).
# ---------------------------------------------------------------------------


def _sent_session(coach: TestClient) -> int:
    library_id = _seed_library_item()
    session_id = coach.post(
        "/api/sessions", json={"title": "Tuesday", "coach_note": "Watch it."}
    ).json()["id"]
    coach.post(
        f"/api/sessions/{session_id}/items",
        json={"item_kind": "library", "library_item_id": library_id},
    )
    coach.post(f"/api/sessions/{session_id}/send")
    return session_id


def test_player_sees_sent_sessions_only_and_no_receipt_data_in_any_payload(
    client: TestClient,
) -> None:
    coach = _coach_with_team()
    player = _player_on_team(coach, email="p1@example.com", name="Jordan T.")
    _player_on_team(coach, email="p2@example.com", name="Sam R.")
    session_id = _sent_session(coach)
    # A draft that must stay invisible to the player.
    coach.post("/api/sessions", json={"title": "Not sent yet"})

    listed = player.get("/api/sessions")
    assert listed.status_code == 200
    rows = listed.json()
    assert [r["title"] for r in rows] == ["Tuesday"]

    row = rows[0]
    # Coach-only keys are ABSENT, not null or empty (the RosterOut /
    # CoachRosterOut contract, Brief section 3 principles).
    assert "receipts" not in row
    assert "viewed_count" not in row
    assert "recipient_count" not in row
    assert row["you_watched"] is False
    assert row["coach_note"] == "Watch it."
    assert row["items"][0]["library_item"]["code"] == "A5"

    single = player.get(f"/api/sessions/{session_id}").json()
    assert "receipts" not in single
    assert "viewed_count" not in single
    assert "recipient_count" not in single

    # The draft 404s for a player rather than 403ing (it does not exist as
    # far as they are concerned).
    draft_id = next(s["id"] for s in coach.get("/api/sessions").json() if s["status"] == "draft")
    assert player.get(f"/api/sessions/{draft_id}").status_code == 404


def test_mark_as_watched_flips_the_row_and_increments_the_coach_counter(
    client: TestClient,
) -> None:
    coach = _coach_with_team()
    player = _player_on_team(coach, email="p1@example.com", name="Jordan T.")
    _player_on_team(coach, email="p2@example.com", name="Sam R.")
    session_id = _sent_session(coach)

    before = coach.get(f"/api/sessions/{session_id}").json()
    assert (before["viewed_count"], before["recipient_count"]) == (0, 2)

    watched = player.post(f"/api/sessions/{session_id}/watched")
    assert watched.status_code == 200
    assert watched.json()["you_watched"] is True
    assert "receipts" not in watched.json()

    after = coach.get(f"/api/sessions/{session_id}").json()
    assert (after["viewed_count"], after["recipient_count"]) == (1, 2)
    by_name = {r["display_name"]: r for r in after["receipts"]}
    assert by_name["Jordan T."]["viewed"] is True
    assert by_name["Jordan T."]["viewed_at"] is not None
    assert by_name["Sam R."]["viewed"] is False
    assert by_name["Sam R."]["viewed_at"] is None


def test_mark_as_watched_is_idempotent_and_keeps_the_first_watch_time(
    client: TestClient,
) -> None:
    coach = _coach_with_team()
    player = _player_on_team(coach, email="p1@example.com")
    session_id = _sent_session(coach)

    player.post(f"/api/sessions/{session_id}/watched")
    first_seen = next(
        r["viewed_at"] for r in coach.get(f"/api/sessions/{session_id}").json()["receipts"]
    )
    player.post(f"/api/sessions/{session_id}/watched")
    again = coach.get(f"/api/sessions/{session_id}").json()
    assert again["viewed_count"] == 1
    assert again["receipts"][0]["viewed_at"] == first_seen


def test_receipts_are_written_for_every_recipient_at_send_time(client: TestClient) -> None:
    coach = _coach_with_team()
    _player_on_team(coach, email="p1@example.com", name="Jordan T.")
    _player_on_team(coach, email="p2@example.com", name="Sam R.")
    session_id = _sent_session(coach)

    body = coach.get(f"/api/sessions/{session_id}").json()
    assert body["recipient_count"] == 2
    assert all(r["viewed_at"] is None for r in body["receipts"])

    # Someone joining afterwards is not retro-added to an already-sent
    # session: the counter denominator is what the team was when it was
    # sent, and they see no session they were never sent.
    latecomer = _player_on_team(coach, email="p3@example.com", name="Late Arrival")
    assert coach.get(f"/api/sessions/{session_id}").json()["recipient_count"] == 2
    assert latecomer.get("/api/sessions").json() == []
    assert latecomer.get(f"/api/sessions/{session_id}").status_code == 404
    assert latecomer.post(f"/api/sessions/{session_id}/watched").status_code == 404


# ---------------------------------------------------------------------------
# Role enforcement at the API (CLAUDE.md rule 5) and team scoping (rule 4).
# ---------------------------------------------------------------------------


def test_every_coach_only_session_route_403s_a_player(client: TestClient) -> None:
    coach = _coach_with_team()
    player = _player_on_team(coach, email="p1@example.com")
    library_id = _seed_library_item()
    session_id = coach.post("/api/sessions", json={"title": "Coach only"}).json()["id"]
    coach.post(
        f"/api/sessions/{session_id}/items",
        json={"item_kind": "library", "library_item_id": library_id},
    )
    item_id = coach.get(f"/api/sessions/{session_id}").json()["items"][0]["id"]

    attempts = {
        "create": player.post("/api/sessions", json={"title": "Mine"}),
        "update": player.patch(f"/api/sessions/{session_id}", json={"title": "Mine"}),
        "add item": player.post(
            f"/api/sessions/{session_id}/items",
            json={"item_kind": "library", "library_item_id": library_id},
        ),
        "move item": player.patch(
            f"/api/sessions/{session_id}/items/{item_id}", json={"position": 0}
        ),
        "remove item": player.delete(f"/api/sessions/{session_id}/items/{item_id}"),
        "send": player.post(f"/api/sessions/{session_id}/send"),
    }
    for label, response in attempts.items():
        assert response.status_code == 403, label

    # And nothing the player attempted changed anything.
    unchanged = coach.get(f"/api/sessions/{session_id}").json()
    assert unchanged["title"] == "Coach only"
    assert unchanged["status"] == "draft"
    assert len(unchanged["items"]) == 1


def test_mark_as_watched_403s_a_coach(client: TestClient) -> None:
    coach = _coach_with_team()
    _player_on_team(coach, email="p1@example.com")
    session_id = _sent_session(coach)
    assert coach.post(f"/api/sessions/{session_id}/watched").status_code == 403


def test_sessions_are_team_scoped_end_to_end(client: TestClient) -> None:
    coach_a = _coach_with_team(email="a@example.com", name="Coach A")
    coach_b = _coach_with_team(email="b@example.com", name="Coach B")
    _player_on_team(coach_a, email="pa@example.com")
    library_id = _seed_library_item()

    session_id = coach_a.post("/api/sessions", json={"title": "A only"}).json()["id"]
    coach_a.post(
        f"/api/sessions/{session_id}/items",
        json={"item_kind": "library", "library_item_id": library_id},
    )
    item_id = coach_a.get(f"/api/sessions/{session_id}").json()["items"][0]["id"]

    # Team B sees nothing of team A's, and cannot touch it by id.
    assert coach_b.get("/api/sessions").json() == []
    assert coach_b.get(f"/api/sessions/{session_id}").status_code == 404
    assert coach_b.patch(f"/api/sessions/{session_id}", json={"title": "Stolen"}).status_code == 404
    assert coach_b.delete(f"/api/sessions/{session_id}/items/{item_id}").status_code == 404
    assert coach_b.post(f"/api/sessions/{session_id}/send").status_code == 404
    assert coach_a.get(f"/api/sessions/{session_id}").json()["title"] == "A only"


def test_a_coach_cannot_attach_another_teams_recording(client: TestClient) -> None:
    coach_a = _coach_with_team(email="a@example.com", name="Coach A")
    coach_b = _coach_with_team(email="b@example.com", name="Coach B")
    pattern_id = _saved_pattern(coach_a, name="A's recording")

    session_id = coach_b.post("/api/sessions", json={"title": "B's draft"}).json()["id"]
    attached = coach_b.post(
        f"/api/sessions/{session_id}/items",
        json={"item_kind": "saved_pattern", "saved_pattern_id": pattern_id},
    )
    assert attached.status_code == 404
    assert coach_b.get(f"/api/sessions/{session_id}").json()["items"] == []


def test_item_kind_and_id_must_agree(client: TestClient) -> None:
    coach = _coach_with_team()
    library_id = _seed_library_item()
    pattern_id = _saved_pattern(coach)
    session_id = coach.post("/api/sessions", json={"title": "Validation"}).json()["id"]

    assert (
        coach.post(
            f"/api/sessions/{session_id}/items",
            json={"item_kind": "library", "saved_pattern_id": pattern_id},
        ).status_code
        == 422
    )
    assert (
        coach.post(
            f"/api/sessions/{session_id}/items",
            json={"item_kind": "saved_pattern", "library_item_id": library_id},
        ).status_code
        == 422
    )
    assert (
        coach.post(
            f"/api/sessions/{session_id}/items",
            json={"item_kind": "library", "library_item_id": 99999},
        ).status_code
        == 404
    )


def test_receipts_carry_the_jersey_number_of_a_claimed_roster_row(client: TestClient) -> None:
    """PNG 21 renders a numbered gold badge per recipient. The number comes
    from the roster row the player's own display name claimed
    (app/routers/roster.py), and is null when no row matches."""
    coach = _coach_with_team()
    coach.post(
        "/api/roster/players",
        json={
            "name": "Jordan T.",
            "jersey_number": 7,
            "preferred_foot": "R",
            "awr": "high",
            "dwr": "med",
            "attributes": {
                "pace": 4,
                "passing_range": 3,
                "carrying_1v1": 4,
                "positional_discipline": 3,
                "aerial_physical": 2,
                "pressing_engine": 4,
            },
        },
    )
    player = _player_on_team(coach, email="p1@example.com", name="Jordan T.")
    player.get("/api/roster")  # the claim happens on the player's own roster fetch
    session_id = _sent_session(coach)

    receipt = coach.get(f"/api/sessions/{session_id}").json()["receipts"][0]
    assert receipt["display_name"] == "Jordan T."
    assert receipt["jersey_number"] == 7


def test_signed_out_callers_get_401(client: TestClient) -> None:
    anon = TestClient(app)
    assert anon.get("/api/sessions").status_code == 401
    assert anon.post("/api/sessions", json={"title": "Nope"}).status_code == 401
