"""Platform DoD (Brief section 5): "Every DB table carrying user content
has team scoping; a cross-team read attempt in tests returns nothing."

Exercises app/scoped.py's TeamScope directly against two teams' worth of
content, for every team-scoped table in doc 03: the five that carry
team_id directly (Player, PlaystyleSuggestion, SavedPattern, Board,
TrainingSession) via .query()/.get(), and the three that scope
transitively through a parent FK (PlayerAttribute, SessionItem,
SessionReceipt) via .query_via(). For each table: team A's scope sees
only team A's row, team B's scope sees only team B's row, and a direct id
guess across teams (.get()) returns None rather than the other team's row.
"""

from collections.abc import Iterator

import pytest
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import (
    Board,
    Player,
    PlayerAttribute,
    PlaystyleSuggestion,
    SavedPattern,
    SessionItem,
    SessionReceipt,
    Team,
    TeamMember,
    TrainingSession,
    User,
)
from app.scoped import TeamScope


@pytest.fixture
def db() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _make_team_with_coach(db: Session, *, name: str, email: str) -> tuple[Team, User]:
    user = User(email=email, password_hash="x", display_name=name, role="coach")
    db.add(user)
    db.flush()
    # Join codes must be unique across teams; derive one from the user id
    # (assigned on flush above) so team A and team B never collide. Two
    # codes now (T-043): player (join_code) and coach (coach_join_code),
    # both required columns, distinct namespaces that must never overlap
    # either (app/routers/teams.py _unique_code).
    team = Team(
        name=name,
        join_code=f"CODE{user.id:02d}",
        coach_join_code=f"COAC{user.id:02d}",
        created_by=user.id,
    )
    db.add(team)
    db.flush()
    db.add(TeamMember(team_id=team.id, user_id=user.id, role_on_team="coach"))
    db.flush()
    return team, user


@pytest.fixture
def two_teams(db: Session) -> tuple[Team, User, Team, User]:
    team_a, coach_a = _make_team_with_coach(db, name="TeamA", email="coach-a@example.com")
    team_b, coach_b = _make_team_with_coach(db, name="TeamB", email="coach-b@example.com")
    db.commit()
    return team_a, coach_a, team_b, coach_b


def _player(team_id: int, name: str) -> Player:
    return Player(
        team_id=team_id,
        name=name,
        preferred_foot="R",
        awr="med",
        dwr="med",
    )


# ---------------------------------------------------------------------------
# Directly-scoped tables (team_id column present)
# ---------------------------------------------------------------------------


def test_players_cross_team_read_returns_nothing(
    db: Session, two_teams: tuple[Team, User, Team, User]
) -> None:
    team_a, _, team_b, _ = two_teams
    player_a = _player(team_a.id, "Player A")
    player_b = _player(team_b.id, "Player B")
    db.add_all([player_a, player_b])
    db.commit()

    scope_a = TeamScope(db=db, team_id=team_a.id)
    scope_b = TeamScope(db=db, team_id=team_b.id)

    names_a = {p.name for p in scope_a.query(Player).all()}
    names_b = {p.name for p in scope_b.query(Player).all()}
    assert names_a == {"Player A"}
    assert names_b == {"Player B"}

    # A direct id guess across teams returns nothing, not the other team's row.
    assert scope_a.get(Player, player_b.id) is None
    assert scope_b.get(Player, player_a.id) is None
    assert scope_a.get(Player, player_a.id) is not None


def test_playstyle_suggestions_cross_team_read_returns_nothing(
    db: Session, two_teams: tuple[Team, User, Team, User]
) -> None:
    team_a, coach_a, team_b, coach_b = two_teams
    player_a = _player(team_a.id, "Player A")
    player_b = _player(team_b.id, "Player B")
    db.add_all([player_a, player_b])
    db.flush()

    sug_a = PlaystyleSuggestion(
        team_id=team_a.id, player_id=player_a.id, author_user_id=coach_a.id, text="Plays wide"
    )
    sug_b = PlaystyleSuggestion(
        team_id=team_b.id, player_id=player_b.id, author_user_id=coach_b.id, text="Plays narrow"
    )
    db.add_all([sug_a, sug_b])
    db.commit()

    scope_a = TeamScope(db=db, team_id=team_a.id)
    scope_b = TeamScope(db=db, team_id=team_b.id)

    assert {s.text for s in scope_a.query(PlaystyleSuggestion).all()} == {"Plays wide"}
    assert {s.text for s in scope_b.query(PlaystyleSuggestion).all()} == {"Plays narrow"}
    assert scope_a.get(PlaystyleSuggestion, sug_b.id) is None
    assert scope_b.get(PlaystyleSuggestion, sug_a.id) is None


def test_saved_patterns_cross_team_read_returns_nothing(
    db: Session, two_teams: tuple[Team, User, Team, User]
) -> None:
    team_a, coach_a, team_b, coach_b = two_teams
    pattern_a = SavedPattern(
        team_id=team_a.id,
        author_user_id=coach_a.id,
        author_role="coach",
        name="Overlap A",
        board_snapshot_json={"tokens": []},
        keyframes_json=[],
    )
    pattern_b = SavedPattern(
        team_id=team_b.id,
        author_user_id=coach_b.id,
        author_role="coach",
        name="Overlap B",
        board_snapshot_json={"tokens": []},
        keyframes_json=[],
    )
    db.add_all([pattern_a, pattern_b])
    db.commit()

    scope_a = TeamScope(db=db, team_id=team_a.id)
    scope_b = TeamScope(db=db, team_id=team_b.id)

    assert {p.name for p in scope_a.query(SavedPattern).all()} == {"Overlap A"}
    assert {p.name for p in scope_b.query(SavedPattern).all()} == {"Overlap B"}
    assert scope_a.get(SavedPattern, pattern_b.id) is None
    assert scope_b.get(SavedPattern, pattern_a.id) is None


def test_boards_cross_team_read_returns_nothing(
    db: Session, two_teams: tuple[Team, User, Team, User]
) -> None:
    team_a, _, team_b, _ = two_teams
    board_a = Board(
        team_id=team_a.id,
        name="Board A",
        tokens_json=[],
        confirmed_lanes_json=[],
        blocking_threshold=5.0,
        marking_threshold=3.0,
        zones_visible_json={},
    )
    board_b = Board(
        team_id=team_b.id,
        name="Board B",
        tokens_json=[],
        confirmed_lanes_json=[],
        blocking_threshold=5.0,
        marking_threshold=3.0,
        zones_visible_json={},
    )
    db.add_all([board_a, board_b])
    db.commit()

    scope_a = TeamScope(db=db, team_id=team_a.id)
    scope_b = TeamScope(db=db, team_id=team_b.id)

    assert {b.name for b in scope_a.query(Board).all()} == {"Board A"}
    assert {b.name for b in scope_b.query(Board).all()} == {"Board B"}
    assert scope_a.get(Board, board_b.id) is None
    assert scope_b.get(Board, board_a.id) is None


def test_sessions_cross_team_read_returns_nothing(
    db: Session, two_teams: tuple[Team, User, Team, User]
) -> None:
    team_a, coach_a, team_b, coach_b = two_teams
    session_a = TrainingSession(team_id=team_a.id, created_by=coach_a.id, title="Session A")
    session_b = TrainingSession(team_id=team_b.id, created_by=coach_b.id, title="Session B")
    db.add_all([session_a, session_b])
    db.commit()

    scope_a = TeamScope(db=db, team_id=team_a.id)
    scope_b = TeamScope(db=db, team_id=team_b.id)

    assert {s.title for s in scope_a.query(TrainingSession).all()} == {"Session A"}
    assert {s.title for s in scope_b.query(TrainingSession).all()} == {"Session B"}
    assert scope_a.get(TrainingSession, session_b.id) is None
    assert scope_b.get(TrainingSession, session_a.id) is None


# ---------------------------------------------------------------------------
# Transitively-scoped tables (no team_id column; scope through a parent FK)
# ---------------------------------------------------------------------------


def test_player_attributes_cross_team_read_returns_nothing(
    db: Session, two_teams: tuple[Team, User, Team, User]
) -> None:
    team_a, _, team_b, _ = two_teams
    player_a = _player(team_a.id, "Player A")
    player_b = _player(team_b.id, "Player B")
    db.add_all([player_a, player_b])
    db.flush()

    db.add_all(
        [
            PlayerAttribute(player_id=player_a.id, attribute_key="pace", value=4),
            PlayerAttribute(player_id=player_b.id, attribute_key="pace", value=2),
        ]
    )
    db.commit()

    scope_a = TeamScope(db=db, team_id=team_a.id)
    scope_b = TeamScope(db=db, team_id=team_b.id)

    rows_a = scope_a.query_via(
        PlayerAttribute, Player, PlayerAttribute.player_id == Player.id
    ).all()
    rows_b = scope_b.query_via(
        PlayerAttribute, Player, PlayerAttribute.player_id == Player.id
    ).all()

    assert {(r.player_id, r.value) for r in rows_a} == {(player_a.id, 4)}
    assert {(r.player_id, r.value) for r in rows_b} == {(player_b.id, 2)}

    # Team A's scope never surfaces team B's player's attribute row, even
    # by id/player_id lookup within the scoped query.
    assert (
        scope_a.query_via(PlayerAttribute, Player, PlayerAttribute.player_id == Player.id)
        .filter(PlayerAttribute.player_id == player_b.id)
        .first()
        is None
    )


def test_session_items_cross_team_read_returns_nothing(
    db: Session, two_teams: tuple[Team, User, Team, User]
) -> None:
    team_a, coach_a, team_b, coach_b = two_teams
    session_a = TrainingSession(team_id=team_a.id, created_by=coach_a.id, title="Session A")
    session_b = TrainingSession(team_id=team_b.id, created_by=coach_b.id, title="Session B")
    db.add_all([session_a, session_b])
    db.flush()

    db.add_all(
        [
            SessionItem(session_id=session_a.id, position=1, item_kind="library"),
            SessionItem(session_id=session_b.id, position=1, item_kind="library"),
        ]
    )
    db.commit()

    scope_a = TeamScope(db=db, team_id=team_a.id)
    scope_b = TeamScope(db=db, team_id=team_b.id)

    items_a = scope_a.query_via(
        SessionItem, TrainingSession, SessionItem.session_id == TrainingSession.id
    ).all()
    items_b = scope_b.query_via(
        SessionItem, TrainingSession, SessionItem.session_id == TrainingSession.id
    ).all()

    assert {i.session_id for i in items_a} == {session_a.id}
    assert {i.session_id for i in items_b} == {session_b.id}
    assert (
        scope_a.query_via(
            SessionItem, TrainingSession, SessionItem.session_id == TrainingSession.id
        )
        .filter(SessionItem.session_id == session_b.id)
        .first()
        is None
    )


def test_session_receipts_cross_team_read_returns_nothing(
    db: Session, two_teams: tuple[Team, User, Team, User]
) -> None:
    team_a, coach_a, team_b, coach_b = two_teams
    session_a = TrainingSession(team_id=team_a.id, created_by=coach_a.id, title="Session A")
    session_b = TrainingSession(team_id=team_b.id, created_by=coach_b.id, title="Session B")
    db.add_all([session_a, session_b])
    db.flush()

    player_user_a = User(
        email="player-a@example.com", password_hash="x", display_name="Player A", role="player"
    )
    player_user_b = User(
        email="player-b@example.com", password_hash="x", display_name="Player B", role="player"
    )
    db.add_all([player_user_a, player_user_b])
    db.flush()

    db.add_all(
        [
            SessionReceipt(session_id=session_a.id, player_user_id=player_user_a.id),
            SessionReceipt(session_id=session_b.id, player_user_id=player_user_b.id),
        ]
    )
    db.commit()

    scope_a = TeamScope(db=db, team_id=team_a.id)
    scope_b = TeamScope(db=db, team_id=team_b.id)

    receipts_a = scope_a.query_via(
        SessionReceipt, TrainingSession, SessionReceipt.session_id == TrainingSession.id
    ).all()
    receipts_b = scope_b.query_via(
        SessionReceipt, TrainingSession, SessionReceipt.session_id == TrainingSession.id
    ).all()

    assert {r.player_user_id for r in receipts_a} == {player_user_a.id}
    assert {r.player_user_id for r in receipts_b} == {player_user_b.id}
    assert (
        scope_a.query_via(
            SessionReceipt, TrainingSession, SessionReceipt.session_id == TrainingSession.id
        )
        .filter(SessionReceipt.session_id == session_b.id)
        .first()
        is None
    )


# ---------------------------------------------------------------------------
# The scoped layer itself: enforcement primitives
# ---------------------------------------------------------------------------


def test_add_stamps_team_id_from_scope_ignoring_any_preset_value(
    db: Session, two_teams: tuple[Team, User, Team, User]
) -> None:
    """CLAUDE.md rule 4: client input never supplies team_id. Even if a
    caller (accidentally or maliciously) constructs a row with a foreign
    team_id already set, TeamScope.add() overwrites it with the scope's
    own team_id before staging it."""
    team_a, _, team_b, _ = two_teams
    scope_a = TeamScope(db=db, team_id=team_a.id)

    smuggled = _player(team_b.id, "Smuggled Player")
    scope_a.add(smuggled)
    db.commit()

    assert smuggled.team_id == team_a.id
    assert TeamScope(db=db, team_id=team_b.id).query(Player).all() == []
    assert {p.name for p in scope_a.query(Player).all()} == {"Smuggled Player"}


def test_query_raises_for_a_transitively_scoped_model() -> None:
    """query() is only for tables with a direct team_id column; calling it
    on a transitively-scoped table (no team_id, e.g. PlayerAttribute) must
    fail loudly rather than silently returning an unscoped queryset."""
    scope = TeamScope(db=SessionLocal(), team_id=1)
    with pytest.raises(TypeError):
        scope.query(PlayerAttribute)
