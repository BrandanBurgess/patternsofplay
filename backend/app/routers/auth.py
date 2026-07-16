from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.config import COOKIE_SECURE, JWT_TTL_SECONDS, SESSION_COOKIE_NAME
from app.deps import get_current_user_optional, get_db
from app.models import TeamMember, User
from app.schemas import (
    CoachMembershipOut,
    CoachTeamOut,
    LoginRequest,
    MembershipOut,
    RegisterRequest,
    TeamOut,
    UserOut,
)
from app.security import hash_password, verify_password
from app.tokens import create_session_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_session_cookie(response: Response, user_id: int) -> None:
    token = create_session_token(user_id)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        max_age=JWT_TTL_SECONDS,
        path="/",
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, response: Response, db: Session = Depends(get_db)) -> User:
    normalized_email = payload.email.lower()
    existing = db.query(User).filter(User.email == normalized_email).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email is already registered"
        )

    user = User(
        email=normalized_email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    _set_session_cookie(response, user.id)
    return user


@router.post("/login", response_model=UserOut)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> User:
    normalized_email = payload.email.lower()
    user = db.query(User).filter(User.email == normalized_email).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )

    _set_session_cookie(response, user.id)
    return user


@router.post("/logout")
def logout(response: Response) -> dict[str, bool]:
    # A real (if trivial) JSON body with a normal Content-Length, not 204
    # No Content: a bodyless response through the Vite dev proxy has no
    # Content-Length to signal its end, so the proxy falls back to
    # closing the connection, which intermittently registered as
    # net::ERR_ABORTED in Chromium during the e2e run even though the
    # request had in fact completed successfully server-side.
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me", response_model=None)
def me(
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> dict:
    # response_model=None (see schemas.py MeOut docstring): each
    # membership below is dumped through MembershipOut or
    # CoachMembershipOut individually, picked per-row by that row's own
    # role_on_team, so a coach's own team(s) carry both join codes and a
    # player's carry neither key at all (T-043 decision 2). A single
    # shared response_model cannot express that per-row split.
    if current_user is None:
        return {"user": None, "memberships": []}

    memberships = (
        db.query(TeamMember)
        .filter(TeamMember.user_id == current_user.id)
        .order_by(TeamMember.joined_at.asc())
        .all()
    )
    membership_outs = []
    for m in memberships:
        membership_out: MembershipOut | CoachMembershipOut
        if m.role_on_team == "coach":
            membership_out = CoachMembershipOut(
                team=CoachTeamOut.model_validate(m.team),
                role_on_team=m.role_on_team,  # type: ignore[arg-type]
                joined_at=m.joined_at,
            )
        else:
            membership_out = MembershipOut(
                team=TeamOut.model_validate(m.team),
                role_on_team=m.role_on_team,  # type: ignore[arg-type]
                joined_at=m.joined_at,
            )
        membership_outs.append(membership_out.model_dump(mode="json"))

    return {
        "user": UserOut.model_validate(current_user).model_dump(mode="json"),
        "memberships": membership_outs,
    }
