"""Team creation, role-scoped join, and head-coach member management
(doc 03 section 2; T-043, founder decision 2026-07-16).

Join codes: a team carries two, `join_code` (the player code, doc 03's
original column, repurposed in place) and `coach_join_code` (added by
migration 0004). Joining with a code assigns THAT code's role on the
team, never the joiner's own account `role` (app/models/User.role is only
ever consulted for team CREATION below, exactly as before). Both codes
are coach-only in every response shape here: CoachTeamOut is built only
when the caller's own role_on_team (post-join, for join_team; from the
resolved membership, for current_team; from the just-created coach
membership, for create_team) is "coach"; a player-shaped response uses
plain TeamOut, which has no join-code field at all (see schemas.py).

Head-coach member management: the head coach is the team's creator
(Team.created_by). require_head_coach (app/deps.py) 403s anyone else,
coach or player, on the two mutation routes below. The plain member list
is visible to any coach (require_role_on_team("coach")), same as the
Brief section 3 "Roster ... Full" coach capability shape, but 403s a
player outright: there is no view for this that a player is meant to see
at all (no PNG exists for this ticket; Brief section 8: build the
smallest honest surface, not an invented one).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.deps import (
    CurrentMembership,
    get_current_membership,
    get_current_user,
    get_db,
    require_head_coach,
    require_role_on_team,
)
from app.models import Team, TeamMember, User
from app.schemas import (
    CoachTeamOut,
    TeamCreateRequest,
    TeamJoinRequest,
    TeamMemberOut,
    TeamMemberRoleUpdateRequest,
    TeamOut,
)
from app.scoped import TeamScope, get_team_scope
from app.security import generate_join_code

router = APIRouter(prefix="/api/teams", tags=["teams"])

_JOIN_CODE_ATTEMPTS = 20


def _unique_code(db: Session) -> str:
    """A candidate must be free in BOTH `join_code` and `coach_join_code`
    across every team: this is what guarantees a submitted code resolves
    unambiguously to exactly one (team, role) pair in join_team below,
    doc 03 section 2's single-namespace uniqueness extended to two
    namespaces that must never overlap."""
    for _ in range(_JOIN_CODE_ATTEMPTS):
        candidate = generate_join_code()
        taken = (
            db.query(Team.id)
            .filter(or_(Team.join_code == candidate, Team.coach_join_code == candidate))
            .first()
        )
        if taken is None:
            return candidate
    # Astronomically unlikely at pilot scale (6 chars, 32-symbol alphabet).
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not allocate a join code, try again",
    )


def _team_out(team: Team, role_on_team: str) -> dict:
    """The one place that decides TeamOut vs CoachTeamOut. response_model
    is None on every route that calls this (same reasoning as
    app/routers/roster.py get_roster): a player-shaped dict must have no
    join_code/coach_join_code KEY at all, not a null one, and a shared
    response_model would either drop CoachTeamOut's extra fields (if
    typed TeamOut) or backfill them as null onto a player payload (if
    typed CoachTeamOut) depending on which way the coercion ran."""
    if role_on_team == "coach":
        return CoachTeamOut.model_validate(team).model_dump(mode="json")
    return TeamOut.model_validate(team).model_dump(mode="json")


@router.post("", response_model=None, status_code=status.HTTP_201_CREATED)
def create_team(
    payload: TeamCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    # Team creation is a coach action. This checks the account's global
    # role because no team_members row exists yet to carry role_on_team;
    # every route created afterward scopes off get_current_membership
    # instead (see app/deps.py).
    if current_user.role != "coach":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only coaches can create a team"
        )

    # Both codes are picked before the team row exists at all, so no
    # not-null column is ever briefly unset across a flush: `_unique_code`
    # only sees committed/flushed rows, so the two calls could in
    # principle agree (astronomically unlikely, 6 chars over a 32-symbol
    # alphabet) without the explicit != check below.
    join_code = _unique_code(db)
    coach_join_code = _unique_code(db)
    while coach_join_code == join_code:
        coach_join_code = _unique_code(db)

    team = Team(
        name=payload.name,
        age_group=payload.age_group,
        level=payload.level,
        colors_json=payload.colors_json,
        created_by=current_user.id,
        join_code=join_code,
        coach_join_code=coach_join_code,
    )
    db.add(team)
    db.flush()  # assigns team.id for the membership row below

    db.add(TeamMember(team_id=team.id, user_id=current_user.id, role_on_team="coach"))
    db.commit()
    db.refresh(team)
    # The creator is the head coach, always a coach member: always the
    # coach-shaped payload, never built from ctx (none exists yet here).
    return _team_out(team, "coach")


@router.post("/join", response_model=None)
def join_team(
    payload: TeamJoinRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    code = payload.join_code.strip().upper()

    role_on_team = "player"
    team = db.query(Team).filter(Team.join_code == code).first()
    if team is None:
        team = db.query(Team).filter(Team.coach_join_code == code).first()
        role_on_team = "coach"
    if team is None:
        # Wrong code fails cleanly: 404, no hint about which part is wrong,
        # no stack trace, no partial state written.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Join code not found")

    already_member = (
        db.query(TeamMember)
        .filter(TeamMember.team_id == team.id, TeamMember.user_id == current_user.id)
        .first()
    )
    if already_member is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Already a member of this team"
        )

    # role_on_team comes ENTIRELY from which code column matched above
    # (T-043 decision 1): current_user.role (the account's own global
    # role) never decides anything here, unlike the pre-T-043 behavior.
    db.add(TeamMember(team_id=team.id, user_id=current_user.id, role_on_team=role_on_team))
    db.commit()
    db.refresh(team)
    return _team_out(team, role_on_team)


@router.get("/current", response_model=None)
def current_team(ctx: CurrentMembership = Depends(get_current_membership)) -> dict:
    # team_id comes from the caller's own membership row, never from a
    # client-supplied parameter (CLAUDE.md rule 4).
    return _team_out(ctx.team, ctx.role_on_team)


# ---------------------------------------------------------------------------
# Head-coach member management (T-043 decision 3). The list itself is any
# coach's to view; the mutations are the creator's alone (require_head_coach).
# ---------------------------------------------------------------------------


def _member_to_out(member: TeamMember, user: User, created_by: int) -> TeamMemberOut:
    return TeamMemberOut(
        id=member.id,
        user_id=member.user_id,
        display_name=user.display_name,
        role_on_team=member.role_on_team,  # type: ignore[arg-type]
        is_head_coach=member.user_id == created_by,
        joined_at=member.joined_at,
    )


@router.get("/members", response_model=list[TeamMemberOut])
def list_members(
    ctx: CurrentMembership = Depends(require_role_on_team("coach")),
    scope: TeamScope = Depends(get_team_scope),
    db: Session = Depends(get_db),
) -> list[TeamMemberOut]:
    members = scope.query(TeamMember).order_by(TeamMember.joined_at.asc()).all()
    users = {
        u.id: u
        for u in db.query(User).filter(User.id.in_([m.user_id for m in members])).all()
    }
    return [_member_to_out(m, users[m.user_id], ctx.team.created_by) for m in members]


@router.delete("/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    member_id: int,
    ctx: CurrentMembership = Depends(require_head_coach),
    scope: TeamScope = Depends(get_team_scope),
) -> None:
    member = scope.get(TeamMember, member_id)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if member.user_id == ctx.user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove yourself from the team",
        )
    scope.delete(member)
    scope.commit()


@router.patch("/members/{member_id}/role", response_model=TeamMemberOut)
def update_member_role(
    member_id: int,
    payload: TeamMemberRoleUpdateRequest,
    ctx: CurrentMembership = Depends(require_head_coach),
    scope: TeamScope = Depends(get_team_scope),
    db: Session = Depends(get_db),
) -> TeamMemberOut:
    member = scope.get(TeamMember, member_id)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if member.user_id == ctx.user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot change your own role"
        )

    member.role_on_team = payload.role_on_team
    scope.commit()
    scope.refresh(member)

    user = db.get(User, member.user_id)
    assert user is not None  # FK guarantees this
    return _member_to_out(member, user, ctx.team.created_by)
