#!/usr/bin/env python3
"""Demo seed: a realistic, fully populated team so the app is never empty
when a coach opens it.

This is NOT the content seeder (scripts/seed.py, doc 03 section 8.4, which
loads library-world tables from seeds/*.json and never touches team data).
This script does the opposite: it writes only TEAM-world rows (users, a
team, its roster, its board, one recording, one sent session) on top of
already-seeded library content. Run `make demo` to do both from a clean
database.

Idempotent by natural key, exactly like the content seeder: users by
email, the team by join code, roster rows by (team, name), the recording
by (team, name), the session by (team, title). Re-running updates in
place rather than duplicating, so it is safe to run before every meeting.

Everything here goes through the same models the API uses. Team scoping
is stamped explicitly on every row (this is a script, not a request, so
there is no membership to derive a TeamScope from), and no row is written
that a coach could not have created through the UI itself.
"""

from __future__ import annotations

import pathlib
import sys
from datetime import timedelta

ROOT = pathlib.Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

import app.models  # noqa: E402,F401  (registers every table on Base.metadata)
from app.models import (  # noqa: E402
    Board,
    LibraryItem,
    Player,
    PlayerAttribute,
    Role,
    SavedPattern,
    SessionItem,
    SessionReceipt,
    Team,
    TeamMember,
    TrainingSession,
    User,
)
from app.db import SessionLocal  # noqa: E402
from app.models._util import utcnow  # noqa: E402
from app.security import hash_password  # noqa: E402

# ---------------------------------------------------------------------------
# The credentials a coach types at the start of a demo. Fixed on purpose
# (the content seeder's own idempotence rule): the README prints these, so
# they must not change from run to run.
# ---------------------------------------------------------------------------

COACH_EMAIL = "coach@example.com"
COACH_NAME = "Coach Riley"
PLAYER_EMAIL = "player@example.com"
PLAYER_NAME = "Jordan Tavares"
DEMO_PASSWORD = "demo-pass-2026"

TEAM_NAME = "Riverside United U18"
TEAM_AGE_GROUP = "U18"
TEAM_LEVEL = "Varsity"
# Both codes use the join-code alphabet (app/security.py: no 0/O or 1/I,
# so a coach can read them aloud).
PLAYER_JOIN_CODE = "TEAM24"
COACH_JOIN_CODE = "STAFF7"

RECORDING_NAME = "Our build-out vs press"
SESSION_TITLE = "Tuesday, wide overloads"
SESSION_NOTE = (
    "Watch both of these before Tuesday. First twenty minutes we walk the third-man run, "
    "then we scrimmage with the build-out as the theme. If their winger presses the "
    "centre-back, the fullback is free: that is the whole picture."
)
# The library pattern the demo narrative plays and sends (Bible 3A).
SESSION_LIBRARY_CODE = "A5"


# ---------------------------------------------------------------------------
# Board geometry. Landscape model coordinates, x toward the attacking goal,
# y top to bottom (CLAUDE.md rule 8), matching frontend/src/board/tokens.ts
# defaultBoardTokens() exactly so the seeded board and a freshly opened one
# are the same shape.
# ---------------------------------------------------------------------------

HOME_433 = [
    ("1", 5.0, 50.0),
    ("2", 22.0, 16.0),
    ("5", 18.0, 38.0),
    ("6", 18.0, 62.0),
    ("3", 22.0, 84.0),
    ("8", 42.0, 30.0),
    ("4", 38.0, 50.0),
    ("10", 42.0, 70.0),
    ("7", 68.0, 18.0),
    ("9", 72.0, 50.0),
    ("11", 68.0, 82.0),
]


def default_board_tokens() -> list[dict]:
    tokens: list[dict] = []
    for label, x, y in HOME_433:
        tokens.append(
            {"id": f"home-{label}", "side": "home", "label": label, "pos": {"x": x, "y": y}}
        )
    for label, x, y in HOME_433:
        tokens.append(
            {
                "id": f"away-{label}",
                "side": "away",
                "label": label,
                "pos": {"x": 100.0 - x, "y": y},
            }
        )
    tokens.append({"id": "ball", "side": "ball", "label": "", "pos": {"x": 50.0, "y": 50.0}})
    return tokens


def build_out_keyframes() -> list[dict]:
    """"Our build-out vs press", as a coach would actually have dragged it.

    Eight tokens move: the keeper's centre-back, the right back, the pivot,
    the right eight, the right winger, two pressing opponents, and the ball
    chasing whoever has it. Waypoints only (the player interpolates between
    them, frontend/src/board/playback.ts), timed so the pass and the run
    that receives it arrive together.
    """
    legs: list[tuple[str, list[tuple[int, float, float]]]] = [
        # Right centre-back steps out of the line and carries into space.
        ("home-5", [(0, 18, 38), (700, 20, 36), (1600, 28, 34), (2500, 30, 34)]),
        # Pivot drops off the pressing striker to offer the inside pass.
        ("home-4", [(300, 38, 50), (1300, 30, 48), (2600, 30, 48)]),
        # Right back pushes high up the line, then carries it forward.
        ("home-2", [(600, 22, 16), (1900, 40, 12), (2500, 40, 12), (3300, 54, 12)]),
        # Right eight arrives inside to be the third man.
        ("home-8", [(2200, 42, 30), (3400, 56, 24), (4200, 58, 24)]),
        # Right winger holds width, then spins in behind as the ball turns.
        ("home-7", [(3000, 68, 18), (4400, 79, 13), (5000, 82, 12)]),
        # The press: their striker jumps the centre-back, their winger the back.
        ("away-9", [(300, 28, 50), (1500, 26, 40), (2600, 30, 36)]),
        ("away-7", [(600, 32, 18), (2000, 36, 22), (3200, 46, 16)]),
        # The ball: keeper to centre-back, out to the fullback, inside to the
        # eight, then through for the winger's run.
        (
            "ball",
            [
                (0, 5, 50),
                (700, 18, 38),
                (1600, 28, 34),
                (1900, 28, 34),
                (2500, 40, 12),
                (3300, 54, 12),
                (3900, 56, 24),
                (4300, 56, 24),
                (5000, 79, 13),
            ],
        ),
    ]
    keyframes: list[dict] = []
    for token_id, points in legs:
        for t_ms, x, y in points:
            keyframes.append({"t_ms": float(t_ms), "token_id": token_id, "x": float(x), "y": float(y)})
    keyframes.sort(key=lambda k: (k["t_ms"], k["token_id"]))
    return keyframes


# ---------------------------------------------------------------------------
# The roster. Fourteen players with roles, flanks, work rates and all six
# sliders filled in (Bible 1.2, 1.3, Section 2).
#
# One pair fires the designed double-exposure flank warning (Bible 2B.3/2B.4,
# doc 03 section 3): a wide player with AWR high and DWR low, and a fullback
# behind them on the SAME flank with AWR high. Jordan Tavares (7, right
# wing, Touchline Winger) sits in front of Marco Silva (2, right back,
# Overlapping Fullback). Nothing else on the roster triggers it: the left
# side pairs an Inside Forward with a low-AWR Defensive Fullback on purpose,
# so the demo shows exactly one warning, on one flank, for one reason.
# ---------------------------------------------------------------------------

# name, jersey, foot, role_code, flank, awr, dwr, (pace, passing, carrying,
# discipline, aerial, pressing)
ROSTER: list[tuple[str, int, str, str, str | None, str, str, tuple[int, int, int, int, int, int]]] = [
    ("Ben Whitfield", 1, "R", "sweeper_keeper", None, "med", "high", (2, 4, 2, 4, 4, 2)),
    ("Marco Silva", 2, "R", "overlapping_fb", "right", "high", "high", (5, 3, 4, 2, 2, 4)),
    ("Dev Patel", 5, "R", "ball_playing_cb", "center", "med", "high", (3, 5, 3, 4, 4, 3)),
    ("Tomas Ricci", 6, "L", "stopper_cb", "center", "low", "high", (3, 2, 2, 4, 5, 3)),
    ("Andre Boucher", 3, "L", "defensive_fb", "left", "low", "high", (3, 3, 2, 5, 3, 3)),
    ("Nils Berg", 4, "R", "single_pivot", "center", "med", "high", (2, 5, 3, 5, 3, 3)),
    ("Kwame Osei", 8, "R", "box_to_box_8", "center", "high", "high", (4, 3, 4, 3, 3, 5)),
    ("Luca Ferrante", 10, "L", "advanced_8", "center", "high", "med", (3, 5, 4, 2, 2, 3)),
    ("Jordan Tavares", 7, "L", "touchline_winger", "right", "high", "low", (5, 3, 5, 2, 2, 3)),
    ("Sam Okonkwo", 9, "R", "runner_in_behind", "center", "high", "low", (5, 2, 3, 2, 3, 4)),
    ("Elias Moreau", 11, "R", "inside_forward", "left", "high", "low", (4, 3, 5, 2, 2, 3)),
    ("Rafa Duarte", 12, "R", "covering_cb", "center", "low", "high", (3, 3, 2, 5, 4, 2)),
    ("Owen Clarke", 14, "R", "anchor_destroyer", "center", "low", "high", (2, 3, 2, 5, 4, 4)),
    ("Mateo Rossi", 16, "L", "target_man", "center", "med", "med", (2, 3, 3, 3, 5, 2)),
]

ATTRIBUTE_KEYS = (
    "pace",
    "passing_range",
    "carrying_1v1",
    "positional_discipline",
    "aerial_physical",
    "pressing_engine",
)


# ---------------------------------------------------------------------------
# Upsert helpers. Every one of these is keyed on something a human named,
# so a rerun updates the same row instead of adding a second one.
# ---------------------------------------------------------------------------


def upsert_user(db, *, email: str, display_name: str, role: str) -> User:
    user = db.query(User).filter(User.email == email).one_or_none()
    if user is None:
        user = User(
            email=email,
            display_name=display_name,
            role=role,
            password_hash=hash_password(DEMO_PASSWORD),
        )
        db.add(user)
        db.flush()
        return user
    user.display_name = display_name
    user.role = role
    # Reset the password on every run so a forgotten local change to the
    # demo account can never lock a coach out mid-meeting.
    user.password_hash = hash_password(DEMO_PASSWORD)
    return user


def upsert_team(db, coach: User) -> Team:
    team = db.query(Team).filter(Team.join_code == PLAYER_JOIN_CODE).one_or_none()
    if team is None:
        team = Team(
            name=TEAM_NAME,
            age_group=TEAM_AGE_GROUP,
            level=TEAM_LEVEL,
            colors_json=None,
            join_code=PLAYER_JOIN_CODE,
            coach_join_code=COACH_JOIN_CODE,
            created_by=coach.id,
        )
        db.add(team)
        db.flush()
        return team
    team.name = TEAM_NAME
    team.age_group = TEAM_AGE_GROUP
    team.level = TEAM_LEVEL
    team.coach_join_code = COACH_JOIN_CODE
    team.created_by = coach.id
    return team


def upsert_membership(db, team: Team, user: User, role_on_team: str) -> TeamMember:
    member = (
        db.query(TeamMember)
        .filter(TeamMember.team_id == team.id, TeamMember.user_id == user.id)
        .one_or_none()
    )
    if member is None:
        member = TeamMember(team_id=team.id, user_id=user.id, role_on_team=role_on_team)
        db.add(member)
        db.flush()
        return member
    member.role_on_team = role_on_team
    return member


def upsert_roster(db, team: Team, player_user: User) -> None:
    roles = {r.code: r for r in db.query(Role).all()}
    for name, jersey, foot, role_code, flank, awr, dwr, attrs in ROSTER:
        role = roles.get(role_code)
        row = (
            db.query(Player)
            .filter(Player.team_id == team.id, Player.name == name)
            .one_or_none()
        )
        if row is None:
            row = Player(team_id=team.id, name=name)
            db.add(row)
        row.jersey_number = jersey
        row.preferred_foot = foot
        row.role_code = role_code
        row.position_line = role.name if role is not None else None
        row.position_code = role.position_code if role is not None else None
        row.flank = flank
        row.awr = awr
        row.dwr = dwr
        # The player account's own row, already linked (the API does the
        # same thing by name match on the player's first roster fetch,
        # app/routers/roster.py; doing it here means the demo does not
        # depend on the order screens are opened in).
        row.user_id = player_user.id if name == PLAYER_NAME else None
        db.flush()

        for key, value in zip(ATTRIBUTE_KEYS, attrs, strict=True):
            attribute = (
                db.query(PlayerAttribute)
                .filter(
                    PlayerAttribute.player_id == row.id,
                    PlayerAttribute.attribute_key == key,
                )
                .one_or_none()
            )
            if attribute is None:
                db.add(PlayerAttribute(player_id=row.id, attribute_key=key, value=value))
            else:
                attribute.value = value


def upsert_board(db, team: Team) -> None:
    """The team's live whiteboard (doc 03 section 4.3). Seeded with the
    4-3-3 shape and two coach-confirmed lanes, so the whiteboard opens on a
    real board with the lane graph already saying something rather than a
    blank default."""
    board = db.query(Board).filter(Board.team_id == team.id).one_or_none()
    if board is None:
        board = Board(team_id=team.id, name="Whiteboard")
        db.add(board)
    board.tokens_json = default_board_tokens()
    board.confirmed_lanes_json = [
        {"a": "home-4", "b": "home-5"},  # pivot to stepping centre-back
        {"a": "home-2", "b": "home-8"},  # right back to the eight inside
    ]
    board.blocking_threshold = 7.0
    board.marking_threshold = 10.0
    board.zones_visible_json = {
        "thirds": False,
        "half_spaces": False,
        "zone_14": False,
        "cutback": False,
    }


def upsert_recording(db, team: Team, coach: User) -> SavedPattern:
    pattern = (
        db.query(SavedPattern)
        .filter(SavedPattern.team_id == team.id, SavedPattern.name == RECORDING_NAME)
        .one_or_none()
    )
    if pattern is None:
        pattern = SavedPattern(team_id=team.id, name=RECORDING_NAME)
        db.add(pattern)
    pattern.author_user_id = coach.id
    pattern.author_role = "coach"
    pattern.board_snapshot_json = {
        "tokens": default_board_tokens(),
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
    pattern.keyframes_json = build_out_keyframes()
    db.flush()
    return pattern


def upsert_session(db, team: Team, coach: User, pattern: SavedPattern, player_user: User) -> None:
    """One sent session with two items (a library preset and the coach's own
    recording) and one receipt already marked watched, so the coach's x/y
    counter reads 1 of 1 the moment the page opens."""
    library_item = (
        db.query(LibraryItem).filter(LibraryItem.code == SESSION_LIBRARY_CODE).one_or_none()
    )
    if library_item is None:
        raise SystemExit(
            f"seed_demo: library item {SESSION_LIBRARY_CODE} is missing. "
            "Run scripts/seed.py (or `make demo`, which does) first."
        )

    session = (
        db.query(TrainingSession)
        .filter(TrainingSession.team_id == team.id, TrainingSession.title == SESSION_TITLE)
        .one_or_none()
    )
    now = utcnow()
    if session is None:
        session = TrainingSession(team_id=team.id, title=SESSION_TITLE)
        db.add(session)
    session.created_by = coach.id
    session.coach_note = SESSION_NOTE
    session.status = "sent"
    session.sent_at = now - timedelta(days=1)
    db.flush()

    # Items are rewritten wholesale: two rows, in order, every run.
    for stale in db.query(SessionItem).filter(SessionItem.session_id == session.id).all():
        db.delete(stale)
    db.flush()
    db.add(
        SessionItem(
            session_id=session.id,
            position=0,
            item_kind="library",
            library_item_id=library_item.id,
        )
    )
    db.add(
        SessionItem(
            session_id=session.id,
            position=1,
            item_kind="saved_pattern",
            saved_pattern_id=pattern.id,
        )
    )

    receipt = (
        db.query(SessionReceipt)
        .filter(
            SessionReceipt.session_id == session.id,
            SessionReceipt.player_user_id == player_user.id,
        )
        .one_or_none()
    )
    if receipt is None:
        receipt = SessionReceipt(session_id=session.id, player_user_id=player_user.id)
        db.add(receipt)
    receipt.viewed_at = now - timedelta(hours=14)


def main() -> int:
    db = SessionLocal()
    try:
        coach = upsert_user(db, email=COACH_EMAIL, display_name=COACH_NAME, role="coach")
        player_user = upsert_user(
            db, email=PLAYER_EMAIL, display_name=PLAYER_NAME, role="player"
        )
        team = upsert_team(db, coach)
        upsert_membership(db, team, coach, "coach")
        upsert_membership(db, team, player_user, "player")
        upsert_roster(db, team, player_user)
        upsert_board(db, team)
        pattern = upsert_recording(db, team, coach)
        upsert_session(db, team, coach, pattern, player_user)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print("seed-demo: demo team ready")
    print(f"  team          {TEAM_NAME} ({TEAM_AGE_GROUP}, {TEAM_LEVEL})")
    print(f"  roster        {len(ROSTER)} players, one double-exposure flank warning")
    print(f"  recording     {RECORDING_NAME}")
    print(f"  session       {SESSION_TITLE} (sent, 1 of 1 viewed)")
    print("")
    print("  Sign in at http://127.0.0.1:5173")
    print(f"    coach       {COACH_EMAIL} / {DEMO_PASSWORD}")
    print(f"    player      {PLAYER_EMAIL} / {DEMO_PASSWORD}")
    print(f"    join codes  {PLAYER_JOIN_CODE} (player), {COACH_JOIN_CODE} (coach)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
