from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.deps import CurrentMembership, get_current_membership, get_current_user, get_db
from app.models import Team, TeamMember, User
from app.schemas import TeamCreateRequest, TeamJoinRequest, TeamOut
from app.security import generate_join_code

router = APIRouter(prefix="/api/teams", tags=["teams"])

_JOIN_CODE_ATTEMPTS = 20


def _unique_join_code(db: Session) -> str:
    for _ in range(_JOIN_CODE_ATTEMPTS):
        candidate = generate_join_code()
        taken = db.query(Team.id).filter(Team.join_code == candidate).first()
        if taken is None:
            return candidate
    # Astronomically unlikely at pilot scale (6 chars, 32-symbol alphabet).
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not allocate a join code, try again",
    )


@router.post("", response_model=TeamOut, status_code=status.HTTP_201_CREATED)
def create_team(
    payload: TeamCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Team:
    # Team creation is a coach action. This checks the account's global
    # role because no team_members row exists yet to carry role_on_team;
    # every route created afterward scopes off get_current_membership
    # instead (see app/deps.py).
    if current_user.role != "coach":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only coaches can create a team"
        )

    team = Team(
        name=payload.name,
        age_group=payload.age_group,
        level=payload.level,
        colors_json=payload.colors_json,
        created_by=current_user.id,
        join_code=_unique_join_code(db),
    )
    db.add(team)
    db.flush()  # assigns team.id for the membership row below

    db.add(TeamMember(team_id=team.id, user_id=current_user.id, role_on_team="coach"))
    db.commit()
    db.refresh(team)
    return team


@router.post("/join", response_model=TeamOut)
def join_team(
    payload: TeamJoinRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Team:
    code = payload.join_code.strip().upper()
    team = db.query(Team).filter(Team.join_code == code).first()
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

    db.add(
        TeamMember(team_id=team.id, user_id=current_user.id, role_on_team=current_user.role)
    )
    db.commit()
    db.refresh(team)
    return team


@router.get("/current", response_model=TeamOut)
def current_team(ctx: CurrentMembership = Depends(get_current_membership)) -> Team:
    # team_id comes from the caller's own membership row, never from a
    # client-supplied parameter (CLAUDE.md rule 4).
    return ctx.team
