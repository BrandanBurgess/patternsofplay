"""Sessions: the classroom loop (doc 03 section 6; Brief step 23, PNG 21-23,
26, 28; T-042).

Design README: "bundle patterns and recorded whiteboard tactics into a
session, attach a coach note, and send to players. Draft state:
reorder/remove items, + Add from library opens a picker (presets and My
patterns, each with its mini-board thumbnail), players listed as Will
receive. Sent state: gold SENT pill with an x/y viewed counter, and
per-player read receipts (Viewed / Not yet). Receipts are coach-only,
consistent with fit warnings, players never see each other's status."

Enforcement (CLAUDE.md rules 4 and 5, Brief section 3):
  - Every route resolves team_id through get_team_scope, never a client
    field. session_items and session_receipts carry no team_id of their
    own (doc 03 section 6) and are read through TeamScope.query_via,
    joined to their parent session's team_id.
  - Create, edit, reorder, remove, and send are coach-only
    (require_role_on_team("coach")); Mark as watched is player-only.
  - The coach/player payload split is the RosterOut/CoachRosterOut
    pattern: response_model=None plus a manual model_dump so a player's
    JSON has NO receipt key at all (not a null or empty one), and a
    coach's has no `you_watched` key.

Recipient set: receipts are written for every player-role member at SEND
time (doc 03 section 6: "receipts exist for every recipient at send time
with viewed_at null"), and a player's own session list is gated on having
one of those receipt rows. A session is therefore a record of what the
team was told when it was sent: someone who joins afterwards does not
silently appear in an already-sent session's denominator, and the coach's
x/y counter never moves on its own.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.deps import (
    CurrentMembership,
    get_current_membership,
    get_db,
    require_role_on_team,
)
from app.models import (
    LibraryItem,
    Player,
    SavedPattern,
    SessionItem,
    SessionReceipt,
    TeamMember,
    TrainingSession,
    User,
)
from app.models._util import utcnow
from app.routers.whiteboard import pattern_to_out
from app.schemas import (
    CoachSessionOut,
    LibraryItemOut,
    PlayerSessionOut,
    SessionCreateRequest,
    SessionItemCreateRequest,
    SessionItemMoveRequest,
    SessionItemOut,
    SessionReceiptOut,
    SessionUpdateRequest,
)
from app.scoped import TeamScope, get_team_scope

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


# ---------------------------------------------------------------------------
# Reading: item hydration and the two payload shapes.
# ---------------------------------------------------------------------------


def _items_for(scope: TeamScope, db: Session, session_id: int) -> list[SessionItemOut]:
    """Every attached item with its FULL referenced content embedded, so
    one round trip gives the coach's picker thumbnails and the player's
    Watch deep-link everything they need to render a board."""
    rows = (
        scope.query_via(SessionItem, TrainingSession, SessionItem.session_id == TrainingSession.id)
        .filter(SessionItem.session_id == session_id)
        .order_by(SessionItem.position.asc())
        .all()
    )
    library_ids = [r.library_item_id for r in rows if r.library_item_id is not None]
    library_by_id = {
        item.id: LibraryItemOut.model_validate(item)
        for item in (
            db.query(LibraryItem).filter(LibraryItem.id.in_(library_ids)).all()
            if library_ids
            else []
        )
    }

    # Saved patterns are TEAM data, so they resolve through the scope, not
    # a raw db query: an item pointing at another team's row (impossible to
    # create through this router, but the FK alone would not stop it)
    # simply resolves to nothing rather than leaking across teams.
    pattern_ids = [r.saved_pattern_id for r in rows if r.saved_pattern_id is not None]
    pattern_rows = (
        scope.query(SavedPattern).filter(SavedPattern.id.in_(pattern_ids)).all()
        if pattern_ids
        else []
    )
    authors = {
        u.id: u
        for u in db.query(User).filter(User.id.in_([p.author_user_id for p in pattern_rows])).all()
    }
    pattern_by_id = {
        p.id: pattern_to_out(p, authors.get(p.author_user_id)) for p in pattern_rows
    }

    return [
        SessionItemOut(
            id=row.id,
            position=row.position,
            item_kind=row.item_kind,  # type: ignore[arg-type]
            library_item=library_by_id.get(row.library_item_id)
            if row.library_item_id is not None
            else None,
            saved_pattern=pattern_by_id.get(row.saved_pattern_id)
            if row.saved_pattern_id is not None
            else None,
        )
        for row in rows
    ]


def _jersey_by_user(scope: TeamScope) -> dict[int, int | None]:
    """Claimed roster rows only (app/routers/roster.py's name-match
    claim): PNG 21 renders a numbered gold badge per recipient, and an
    unclaimed member simply has no number to show."""
    return {
        p.user_id: p.jersey_number
        for p in scope.query(Player).filter(Player.user_id.isnot(None)).all()
        if p.user_id is not None
    }


def _player_members(scope: TeamScope, db: Session) -> list[tuple[int, str]]:
    """(user_id, display_name) for every player-role member, oldest first."""
    members = (
        scope.query(TeamMember)
        .filter(TeamMember.role_on_team == "player")
        .order_by(TeamMember.joined_at.asc())
        .all()
    )
    users = {
        u.id: u for u in db.query(User).filter(User.id.in_([m.user_id for m in members])).all()
    }
    return [(m.user_id, users[m.user_id].display_name) for m in members if m.user_id in users]


def _receipts_for(
    scope: TeamScope, db: Session, session: TrainingSession
) -> list[SessionReceiptOut]:
    """Coach-only. A SENT session reads its real receipt rows; a DRAFT has
    none yet, so it lists the team's current player members as the design
    README's "Will receive" preview of who the send would reach."""
    jerseys = _jersey_by_user(scope)

    if session.status != "sent":
        return [
            SessionReceiptOut(
                player_user_id=user_id,
                display_name=display_name,
                jersey_number=jerseys.get(user_id),
                viewed_at=None,
                viewed=False,
            )
            for user_id, display_name in _player_members(scope, db)
        ]

    rows = (
        scope.query_via(
            SessionReceipt, TrainingSession, SessionReceipt.session_id == TrainingSession.id
        )
        .filter(SessionReceipt.session_id == session.id)
        .all()
    )
    users = {
        u.id: u
        for u in db.query(User).filter(User.id.in_([r.player_user_id for r in rows])).all()
    }
    out = [
        SessionReceiptOut(
            player_user_id=r.player_user_id,
            display_name=users[r.player_user_id].display_name
            if r.player_user_id in users
            else "Player",
            jersey_number=jerseys.get(r.player_user_id),
            viewed_at=r.viewed_at,
            viewed=r.viewed_at is not None,
        )
        for r in rows
    ]
    out.sort(key=lambda r: ((r.jersey_number is None), r.jersey_number or 0, r.display_name))
    return out


def _coach_payload(scope: TeamScope, db: Session, session: TrainingSession) -> dict:
    receipts = _receipts_for(scope, db, session)
    return CoachSessionOut(
        id=session.id,
        title=session.title,
        coach_note=session.coach_note,
        status=session.status,  # type: ignore[arg-type]
        sent_at=session.sent_at,
        created_at=session.created_at,
        items=_items_for(scope, db, session.id),
        receipts=receipts,
        viewed_count=sum(1 for r in receipts if r.viewed),
        recipient_count=len(receipts),
    ).model_dump(mode="json")


def _player_payload(
    scope: TeamScope, db: Session, session: TrainingSession, receipt: SessionReceipt
) -> dict:
    # PlayerSessionOut has no receipts/viewed_count/recipient_count field
    # at all, so those keys are absent from this body rather than nulled.
    return PlayerSessionOut(
        id=session.id,
        title=session.title,
        coach_note=session.coach_note,
        status=session.status,  # type: ignore[arg-type]
        sent_at=session.sent_at,
        created_at=session.created_at,
        items=_items_for(scope, db, session.id),
        you_watched=receipt.viewed_at is not None,
    ).model_dump(mode="json")


def _own_receipt(scope: TeamScope, session_id: int, user_id: int) -> SessionReceipt | None:
    return (
        scope.query_via(
            SessionReceipt, TrainingSession, SessionReceipt.session_id == TrainingSession.id
        )
        .filter(
            SessionReceipt.session_id == session_id,
            SessionReceipt.player_user_id == user_id,
        )
        .first()
    )


def _session_or_404(scope: TeamScope, session_id: int) -> TrainingSession:
    session = scope.get(TrainingSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


def _draft_or_409(session: TrainingSession) -> TrainingSession:
    if session.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A sent session can no longer be edited",
        )
    return session


# ---------------------------------------------------------------------------
# Both roles: list and read. The role decides both WHICH sessions are
# visible and WHICH payload shape comes back.
# ---------------------------------------------------------------------------


@router.get("", response_model=None)
def list_sessions(
    ctx: CurrentMembership = Depends(get_current_membership),
    scope: TeamScope = Depends(get_team_scope),
    db: Session = Depends(get_db),
) -> list[dict]:
    if ctx.role_on_team == "coach":
        sessions = (
            scope.query(TrainingSession)
            .order_by(TrainingSession.created_at.desc())
            .all()
        )
        return [_coach_payload(scope, db, s) for s in sessions]

    # Player: sent sessions they were an actual recipient of (README:
    # "Sees sent sessions only"), newest send first.
    sessions = (
        scope.query(TrainingSession)
        .filter(TrainingSession.status == "sent")
        .order_by(TrainingSession.sent_at.desc())
        .all()
    )
    out: list[dict] = []
    for session in sessions:
        receipt = _own_receipt(scope, session.id, ctx.user.id)
        if receipt is None:
            continue
        out.append(_player_payload(scope, db, session, receipt))
    return out


@router.get("/{session_id}", response_model=None)
def get_session(
    session_id: int,
    ctx: CurrentMembership = Depends(get_current_membership),
    scope: TeamScope = Depends(get_team_scope),
    db: Session = Depends(get_db),
) -> dict:
    session = _session_or_404(scope, session_id)
    if ctx.role_on_team == "coach":
        return _coach_payload(scope, db, session)

    receipt = _own_receipt(scope, session.id, ctx.user.id)
    if session.status != "sent" or receipt is None:
        # A draft does not exist as far as a player is concerned, and
        # neither does a sent session they were not a recipient of: 404,
        # not 403, so the response says nothing about what else the team
        # has in flight.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return _player_payload(scope, db, session, receipt)


# ---------------------------------------------------------------------------
# Coach-only: draft builder, item picker, send.
# ---------------------------------------------------------------------------


@router.post("", response_model=None, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: SessionCreateRequest,
    ctx: CurrentMembership = Depends(require_role_on_team("coach")),
    scope: TeamScope = Depends(get_team_scope),
    db: Session = Depends(get_db),
) -> dict:
    session = TrainingSession(
        created_by=ctx.user.id,
        title=payload.title,
        coach_note=payload.coach_note,
        status="draft",
    )
    scope.add(session)
    scope.commit()
    scope.refresh(session)
    return _coach_payload(scope, db, session)


@router.patch("/{session_id}", response_model=None)
def update_session(
    session_id: int,
    payload: SessionUpdateRequest,
    ctx: CurrentMembership = Depends(require_role_on_team("coach")),
    scope: TeamScope = Depends(get_team_scope),
    db: Session = Depends(get_db),
) -> dict:
    session = _draft_or_409(_session_or_404(scope, session_id))
    if payload.title is not None:
        session.title = payload.title
    if payload.coach_note is not None:
        session.coach_note = payload.coach_note
    scope.commit()
    scope.refresh(session)
    return _coach_payload(scope, db, session)


@router.post("/{session_id}/items", response_model=None, status_code=status.HTTP_201_CREATED)
def add_item(
    session_id: int,
    payload: SessionItemCreateRequest,
    ctx: CurrentMembership = Depends(require_role_on_team("coach")),
    scope: TeamScope = Depends(get_team_scope),
    db: Session = Depends(get_db),
) -> dict:
    session = _draft_or_409(_session_or_404(scope, session_id))

    if payload.item_kind == "library":
        if payload.library_item_id is None or payload.saved_pattern_id is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A library item needs library_item_id and no saved_pattern_id",
            )
        if db.get(LibraryItem, payload.library_item_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Library item not found"
            )
    else:
        if payload.saved_pattern_id is None or payload.library_item_id is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A saved pattern needs saved_pattern_id and no library_item_id",
            )
        # Scoped get: another team's recording resolves to None here, so a
        # coach can only ever attach their own team's patterns.
        if scope.get(SavedPattern, payload.saved_pattern_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Saved pattern not found"
            )

    existing = (
        scope.query_via(SessionItem, TrainingSession, SessionItem.session_id == TrainingSession.id)
        .filter(SessionItem.session_id == session.id)
        .count()
    )
    # SessionItem has no team_id of its own (doc 03 section 6), so it is
    # added through the plain db session after its PARENT session has been
    # verified through the scope above (app/scoped.py add() docstring).
    item = SessionItem(
        session_id=session.id,
        position=existing,
        item_kind=payload.item_kind,
        library_item_id=payload.library_item_id,
        saved_pattern_id=payload.saved_pattern_id,
    )
    db.add(item)
    scope.commit()
    return _coach_payload(scope, db, session)


@router.patch("/{session_id}/items/{item_id}", response_model=None)
def move_item(
    session_id: int,
    item_id: int,
    payload: SessionItemMoveRequest,
    ctx: CurrentMembership = Depends(require_role_on_team("coach")),
    scope: TeamScope = Depends(get_team_scope),
    db: Session = Depends(get_db),
) -> dict:
    session = _draft_or_409(_session_or_404(scope, session_id))
    rows = (
        scope.query_via(SessionItem, TrainingSession, SessionItem.session_id == TrainingSession.id)
        .filter(SessionItem.session_id == session.id)
        .order_by(SessionItem.position.asc())
        .all()
    )
    moving = next((r for r in rows if r.id == item_id), None)
    if moving is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session item not found")

    target = min(payload.position, len(rows) - 1)
    rows.remove(moving)
    rows.insert(target, moving)
    # Renormalize to 0..n-1 so positions never drift into gaps or ties.
    for index, row in enumerate(rows):
        row.position = index
    scope.commit()
    return _coach_payload(scope, db, session)


@router.delete("/{session_id}/items/{item_id}", response_model=None)
def remove_item(
    session_id: int,
    item_id: int,
    ctx: CurrentMembership = Depends(require_role_on_team("coach")),
    scope: TeamScope = Depends(get_team_scope),
    db: Session = Depends(get_db),
) -> dict:
    session = _draft_or_409(_session_or_404(scope, session_id))
    rows = (
        scope.query_via(SessionItem, TrainingSession, SessionItem.session_id == TrainingSession.id)
        .filter(SessionItem.session_id == session.id)
        .order_by(SessionItem.position.asc())
        .all()
    )
    target = next((r for r in rows if r.id == item_id), None)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session item not found")

    db.delete(target)
    for index, row in enumerate([r for r in rows if r.id != item_id]):
        row.position = index
    scope.commit()
    return _coach_payload(scope, db, session)


@router.post("/{session_id}/send", response_model=None)
def send_session(
    session_id: int,
    ctx: CurrentMembership = Depends(require_role_on_team("coach")),
    scope: TeamScope = Depends(get_team_scope),
    db: Session = Depends(get_db),
) -> dict:
    session = _draft_or_409(_session_or_404(scope, session_id))

    items = (
        scope.query_via(SessionItem, TrainingSession, SessionItem.session_id == TrainingSession.id)
        .filter(SessionItem.session_id == session.id)
        .count()
    )
    if items == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Add at least one pattern before sending",
        )

    # doc 03 section 6: a receipt exists for every recipient at send time,
    # viewed_at null. Receipts carry no team_id (they scope through the
    # session), so they are added on the plain db session.
    for user_id, _display_name in _player_members(scope, db):
        db.add(SessionReceipt(session_id=session.id, player_user_id=user_id, viewed_at=None))

    session.status = "sent"
    session.sent_at = utcnow()
    scope.commit()
    scope.refresh(session)
    return _coach_payload(scope, db, session)


# ---------------------------------------------------------------------------
# Player-only: Mark as watched, which feeds the coach's receipt counter
# (README roles table). A coach calling this gets 403.
# ---------------------------------------------------------------------------


@router.post("/{session_id}/watched", response_model=None)
def mark_watched(
    session_id: int,
    ctx: CurrentMembership = Depends(require_role_on_team("player")),
    scope: TeamScope = Depends(get_team_scope),
    db: Session = Depends(get_db),
) -> dict:
    session = _session_or_404(scope, session_id)
    receipt = _own_receipt(scope, session.id, ctx.user.id)
    if session.status != "sent" or receipt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    # Idempotent: re-marking keeps the FIRST watch time rather than
    # resetting it, so the coach's receipt reads when the player actually
    # watched it.
    if receipt.viewed_at is None:
        receipt.viewed_at = utcnow()
        scope.commit()
        scope.refresh(receipt)
    return _player_payload(scope, db, session, receipt)
