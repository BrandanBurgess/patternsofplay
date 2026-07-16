"""Player playstyle suggestion flow (doc 03 section 3 playstyle_suggestions;
Brief step 22, PNG 24/25/27; T-041).

README roles table: "Suggest own playstyle: Not applicable (coach); Yes
(player): free text on own profile, then pending coach review; coach sees a
gold badge on the row and an Approve / Dismiss card. Approve merges the note
into the profile." Every route depends on get_team_scope (team_id always
comes from the caller's own membership, never a client-supplied field,
CLAUDE.md rule 4) and enforces role at the API, not just the UI (CLAUDE.md
rule 5): only a player may submit a suggestion, and only against their own
linked roster row (app/routers/roster.py's claim-by-name-match); only a
coach may list the team's pending queue, approve, or dismiss. A player
calling either of the coach-only endpoints gets 403, proven in
backend/tests/test_suggestions_routes.py.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import CurrentMembership, get_current_membership, require_role_on_team
from app.models import Player, PlaystyleSuggestion
from app.models._util import utcnow
from app.schemas import SuggestionCreateRequest, SuggestionOut
from app.scoped import TeamScope, get_team_scope

router = APIRouter(prefix="/api/roster", tags=["suggestions"])


def _suggestion_to_out(suggestion: PlaystyleSuggestion, player_name: str) -> SuggestionOut:
    return SuggestionOut(
        id=suggestion.id,
        player_id=suggestion.player_id,
        player_name=player_name,
        author_user_id=suggestion.author_user_id,
        text=suggestion.text,
        status=suggestion.status,  # type: ignore[arg-type]
        created_at=suggestion.created_at,
        reviewed_at=suggestion.reviewed_at,
    )


# ---------------------------------------------------------------------------
# Player-facing: submit and read back the suggestions for one roster row.
# ---------------------------------------------------------------------------


@router.post(
    "/players/{player_id}/suggestions",
    response_model=SuggestionOut,
    status_code=status.HTTP_201_CREATED,
)
def submit_suggestion(
    player_id: int,
    payload: SuggestionCreateRequest,
    ctx: CurrentMembership = Depends(require_role_on_team("player")),
    scope: TeamScope = Depends(get_team_scope),
) -> SuggestionOut:
    # require_role_on_team("player") already 403s a coach caller (README:
    # "Suggest own playstyle" is "Not applicable" for coaches).
    player = scope.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")
    if player.user_id != ctx.user.id:
        # README: "free text on own profile" -- never against a teammate's
        # row, even one on the same team.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    existing_pending = (
        scope.query(PlaystyleSuggestion)
        .filter(
            PlaystyleSuggestion.player_id == player_id,
            PlaystyleSuggestion.status == "pending",
        )
        .first()
    )
    if existing_pending is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A suggestion is already pending coach review",
        )

    suggestion = PlaystyleSuggestion(
        player_id=player_id,
        author_user_id=ctx.user.id,
        text=payload.text,
        status="pending",
    )
    scope.add(suggestion)
    scope.commit()
    scope.refresh(suggestion)
    return _suggestion_to_out(suggestion, player.name)


@router.get("/players/{player_id}/suggestions", response_model=list[SuggestionOut])
def list_player_suggestions(
    player_id: int,
    ctx: CurrentMembership = Depends(get_current_membership),
    scope: TeamScope = Depends(get_team_scope),
) -> list[SuggestionOut]:
    player = scope.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")
    if ctx.role_on_team != "coach" and player.user_id != ctx.user.id:
        # A player may read back their own suggestion history; a coach may
        # read any row on their team (needed to render the review card).
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    rows = (
        scope.query(PlaystyleSuggestion)
        .filter(PlaystyleSuggestion.player_id == player_id)
        .order_by(PlaystyleSuggestion.created_at.desc())
        .all()
    )
    return [_suggestion_to_out(row, player.name) for row in rows]


# ---------------------------------------------------------------------------
# Coach-facing: the team-wide pending queue, approve, dismiss. All three
# 403 a player caller (README: fit warnings and suggestion review are
# coach-only capabilities; CLAUDE.md rule 5).
# ---------------------------------------------------------------------------


@router.get("/suggestions/pending", response_model=list[SuggestionOut])
def list_pending_suggestions(
    ctx: CurrentMembership = Depends(require_role_on_team("coach")),
    scope: TeamScope = Depends(get_team_scope),
) -> list[SuggestionOut]:
    rows = (
        scope.query(PlaystyleSuggestion)
        .filter(PlaystyleSuggestion.status == "pending")
        .order_by(PlaystyleSuggestion.created_at.desc())
        .all()
    )
    player_ids = {row.player_id for row in rows}
    players = {
        p.id: p for p in scope.query(Player).filter(Player.id.in_(player_ids)).all()
    }
    return [_suggestion_to_out(row, players[row.player_id].name) for row in rows]


def _pending_or_409(scope: TeamScope, suggestion_id: int) -> PlaystyleSuggestion:
    suggestion = scope.get(PlaystyleSuggestion, suggestion_id)
    if suggestion is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Suggestion not found")
    if suggestion.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Suggestion already reviewed"
        )
    return suggestion


@router.post("/suggestions/{suggestion_id}/approve", response_model=SuggestionOut)
def approve_suggestion(
    suggestion_id: int,
    ctx: CurrentMembership = Depends(require_role_on_team("coach")),
    scope: TeamScope = Depends(get_team_scope),
) -> SuggestionOut:
    suggestion = _pending_or_409(scope, suggestion_id)
    player = scope.get(Player, suggestion.player_id)
    if player is None:  # pragma: no cover - FK guarantees this in practice
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")

    suggestion.status = "approved"
    suggestion.reviewed_at = utcnow()
    suggestion.reviewed_by = ctx.user.id
    # README: "Approve merges the note into the profile."
    player.playstyle_note = suggestion.text
    scope.commit()
    scope.refresh(suggestion)
    return _suggestion_to_out(suggestion, player.name)


@router.post("/suggestions/{suggestion_id}/dismiss", response_model=SuggestionOut)
def dismiss_suggestion(
    suggestion_id: int,
    ctx: CurrentMembership = Depends(require_role_on_team("coach")),
    scope: TeamScope = Depends(get_team_scope),
) -> SuggestionOut:
    suggestion = _pending_or_409(scope, suggestion_id)
    player = scope.get(Player, suggestion.player_id)
    player_name = player.name if player is not None else ""

    # README: "dismiss clears it" -- status flips with no merge into
    # playstyle_note, so the profile is unchanged.
    suggestion.status = "dismissed"
    suggestion.reviewed_at = utcnow()
    suggestion.reviewed_by = ctx.user.id
    scope.commit()
    scope.refresh(suggestion)
    return _suggestion_to_out(suggestion, player_name)
