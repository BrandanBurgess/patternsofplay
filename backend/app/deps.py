"""FastAPI dependency injection for auth and team scoping (doc 04 section 1:
"a dependency that resolves the current user, their team, and their
role_on_team, applied to every route").

CLAUDE.md rule 4: client input never supplies team_id. Every dependency
below derives team_id from the authenticated user's own membership row,
never from a path/query/body parameter, so a route built on top of these
cannot be tricked into leaking or writing another team's data.
"""

from collections.abc import Generator

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import SESSION_COOKIE_NAME
from app.db import SessionLocal
from app.models import Team, TeamMember, User
from app.tokens import decode_session_token


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user_optional(
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    db: Session = Depends(get_db),
) -> User | None:
    """Resolves the session cookie to a user, or None. Never raises: this
    is for routes like GET /api/auth/me that a signed-out client is
    expected to call as a normal, successful "who am I" check rather than
    an error case (a session probe returning an HTTP error status on
    every signed-out page load is both bad API design and, concretely,
    unusable in this repo's e2e harness, which fails any journey that
    logs a console error, and browsers log one for every non-2xx fetch)."""
    if session_token is None:
        return None
    user_id = decode_session_token(session_token)
    if user_id is None:
        return None
    return db.get(User, user_id)


def get_current_user(
    current_user: User | None = Depends(get_current_user_optional),
) -> User:
    """Resolves the authenticated user, 401 if there is none. Use this
    (not the optional variant) for any route that acts on behalf of a
    user or reads/writes team data."""
    if current_user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return current_user


class CurrentMembership:
    """The (user, team, role_on_team) triple doc 04 asks every route to
    resolve through dependency injection. Team-scoped routers (T-004
    onward) take this as a dependency instead of a team_id parameter."""

    __slots__ = ("user", "team", "membership")

    def __init__(self, user: User, team: Team, membership: TeamMember) -> None:
        self.user = user
        self.team = team
        self.membership = membership

    @property
    def role_on_team(self) -> str:
        return self.membership.role_on_team


def get_current_membership(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CurrentMembership:
    """MVP is single-team-per-user in practice (register once, create or
    join once); this resolves that one membership. If a user ever belongs
    to multiple teams (club layer, later), this is the seam where a
    team-selection concept would slot in. It does not take a team_id
    argument from the caller."""
    membership = (
        db.query(TeamMember)
        .filter(TeamMember.user_id == current_user.id)
        .order_by(TeamMember.joined_at.asc())
        .first()
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No team membership yet"
        )
    team = db.get(Team, membership.team_id)
    if team is None:  # pragma: no cover - FK guarantees this in practice
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return CurrentMembership(user=current_user, team=team, membership=membership)


def require_role_on_team(*allowed: str):
    """Factory for role_on_team gates. Callers pass the allowed
    role_on_team values for a route; adding 'club_admin' later means
    adding it to a call site's allow-list, not changing this function or
    the DB schema (doc 03 section 2 role note)."""

    def _dependency(
        ctx: CurrentMembership = Depends(get_current_membership),
    ) -> CurrentMembership:
        if ctx.role_on_team not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return ctx

    return _dependency


def require_head_coach(
    ctx: CurrentMembership = Depends(get_current_membership),
) -> CurrentMembership:
    """T-043 decision 3: head-coach-only routes (remove a member, change a
    member's role_on_team). The head coach is the team's CREATOR
    (Team.created_by), a separate concept from role_on_team, so this is
    its own dependency rather than another require_role_on_team() value:
    a non-creator coach and a player both get 403 here, on exactly the
    same terms (CLAUDE.md rule 5: enforced in the API, independent of
    which role_on_team the caller otherwise holds)."""
    if ctx.team.created_by != ctx.user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only the head coach can do this"
        )
    return ctx
