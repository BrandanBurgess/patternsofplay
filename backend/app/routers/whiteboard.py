"""Whiteboard state and saved patterns (doc 03 sections 4.2, 4.3; Brief step
16; T-030). Every route depends on get_team_scope (or require_role_on_team,
which itself resolves through get_current_membership): team_id always comes
from the caller's own membership, never a client-supplied field or path
parameter (CLAUDE.md rule 4).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.deps import CurrentMembership, get_current_membership, get_db, require_role_on_team
from app.models import Board, SavedPattern, User
from app.schemas import (
    BoardOut,
    BoardStateOut,
    SavedPatternCreateRequest,
    SavedPatternOut,
)
from app.scoped import TeamScope, get_team_scope
from app.specs import BoardSnapshot, BoardToken, ConfirmedLane, Keyframe, ZonesVisible

router = APIRouter(prefix="/api", tags=["whiteboard"])


def _board_to_out(board: Board) -> BoardOut:
    return BoardOut(
        id=board.id,
        tokens=[BoardToken.model_validate(t) for t in board.tokens_json],
        confirmed_lanes=[
            ConfirmedLane.model_validate(lane) for lane in board.confirmed_lanes_json
        ],
        blocking_threshold=board.blocking_threshold,
        marking_threshold=board.marking_threshold,
        zones_visible=ZonesVisible.model_validate(board.zones_visible_json),
        updated_at=board.updated_at,
    )


def _author_label(role: str, user: User | None) -> str:
    # Author stamping (doc 03 4.2): tiles render COACH when author_role is
    # coach, else the player's display name.
    if role == "coach":
        return "COACH"
    return user.display_name if user is not None else "Player"


def _pattern_to_out(pattern: SavedPattern, author: User | None) -> SavedPatternOut:
    return SavedPatternOut(
        id=pattern.id,
        name=pattern.name,
        author_role=pattern.author_role,  # type: ignore[arg-type]
        author_label=_author_label(pattern.author_role, author),
        board_snapshot=BoardSnapshot.model_validate(pattern.board_snapshot_json),
        keyframes=[Keyframe.model_validate(k) for k in pattern.keyframes_json],
        created_at=pattern.created_at,
    )


# ---------------------------------------------------------------------------
# Whiteboard state: one live board per team (doc 03 4.3). GET auto-vivifies
# nothing; PUT upserts the team's single row.
# ---------------------------------------------------------------------------


@router.get("/boards/current", response_model=BoardStateOut)
def get_current_board(scope: TeamScope = Depends(get_team_scope)) -> BoardStateOut:
    board = scope.query(Board).order_by(Board.updated_at.desc()).first()
    return BoardStateOut(board=_board_to_out(board) if board is not None else None)


@router.put("/boards/current", response_model=BoardOut)
def upsert_current_board(
    payload: BoardSnapshot, scope: TeamScope = Depends(get_team_scope)
) -> BoardOut:
    tokens_json = [t.model_dump() for t in payload.tokens]
    confirmed_lanes_json = [lane.model_dump() for lane in payload.confirmed_lanes]
    zones_visible_json = payload.zones_visible.model_dump()

    board = scope.query(Board).order_by(Board.updated_at.desc()).first()
    if board is None:
        board = Board(
            name="Whiteboard",
            tokens_json=tokens_json,
            confirmed_lanes_json=confirmed_lanes_json,
            blocking_threshold=payload.blocking_threshold,
            marking_threshold=payload.marking_threshold,
            zones_visible_json=zones_visible_json,
        )
        scope.add(board)
    else:
        board.tokens_json = tokens_json
        board.confirmed_lanes_json = confirmed_lanes_json
        board.blocking_threshold = payload.blocking_threshold
        board.marking_threshold = payload.marking_threshold
        board.zones_visible_json = zones_visible_json

    scope.commit()
    scope.refresh(board)
    return _board_to_out(board)


# ---------------------------------------------------------------------------
# Saved patterns: My Patterns (doc 03 4.2). Both roles create; delete is
# coach-only, enforced here (not just hidden client-side), per the Brief
# section 3 permission table and README roles table.
# ---------------------------------------------------------------------------


@router.get("/patterns", response_model=list[SavedPatternOut])
def list_patterns(
    scope: TeamScope = Depends(get_team_scope), db: Session = Depends(get_db)
) -> list[SavedPatternOut]:
    rows = scope.query(SavedPattern).order_by(SavedPattern.created_at.desc()).all()
    author_ids = {r.author_user_id for r in rows}
    authors = {u.id: u for u in db.query(User).filter(User.id.in_(author_ids)).all()}
    return [_pattern_to_out(r, authors.get(r.author_user_id)) for r in rows]


@router.post("/patterns", response_model=SavedPatternOut, status_code=status.HTTP_201_CREATED)
def create_pattern(
    payload: SavedPatternCreateRequest,
    ctx: CurrentMembership = Depends(get_current_membership),
    scope: TeamScope = Depends(get_team_scope),
) -> SavedPatternOut:
    # Both coach and player may record and save (Brief section 3 table).
    # author_user_id/author_role come from the session, never the body.
    row = SavedPattern(
        author_user_id=ctx.user.id,
        author_role=ctx.role_on_team,
        name=payload.name,
        board_snapshot_json=payload.board_snapshot.model_dump(),
        keyframes_json=[k.model_dump() for k in payload.keyframes],
    )
    scope.add(row)
    scope.commit()
    scope.refresh(row)
    return _pattern_to_out(row, ctx.user)


@router.delete("/patterns/{pattern_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pattern(
    pattern_id: int,
    ctx: CurrentMembership = Depends(require_role_on_team("coach")),
    scope: TeamScope = Depends(get_team_scope),
) -> None:
    # require_role_on_team("coach") 403s a player before this body runs
    # (README: "the delete control never renders" for players, and the API
    # enforces it independently of the UI, CLAUDE.md rule 5).
    row = scope.get(SavedPattern, pattern_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pattern not found")
    scope.delete(row)
    scope.commit()
