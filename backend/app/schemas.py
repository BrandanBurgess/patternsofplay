"""Pydantic v2 request/response models for auth, teams, and whiteboard
routes (doc 04 section 1: validate every payload boundary with
Pydantic)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.specs import BoardSnapshot, BoardToken, ConfirmedLane, Keyframe, ZonesVisible

RoleOnTeam = Literal["coach", "player"]


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    display_name: str = Field(min_length=1, max_length=120)
    role: RoleOnTeam


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    display_name: str
    role: RoleOnTeam
    created_at: datetime


class TeamCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    age_group: str | None = Field(default=None, max_length=50)
    level: str | None = Field(default=None, max_length=50)
    colors_json: dict | None = None


class TeamJoinRequest(BaseModel):
    join_code: str = Field(min_length=1, max_length=12)


class TeamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    age_group: str | None
    level: str | None
    colors_json: dict | None
    join_code: str
    created_by: int
    created_at: datetime


class MembershipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    team: TeamOut
    role_on_team: RoleOnTeam
    joined_at: datetime


class MeOut(BaseModel):
    """GET /api/auth/me always returns 200: user is null when signed out.
    See app/deps.py get_current_user_optional for why this is not a 401."""

    user: UserOut | None
    memberships: list[MembershipOut]


# ---------------------------------------------------------------------------
# Whiteboard state (doc 03 section 4.3, `boards`: one live board per team)
# and recorded patterns (doc 03 section 4.2, `saved_patterns`). Request
# bodies reuse the JSON-shape validators from app/specs.py verbatim
# (BoardSnapshot's fields line up 1:1 with the `boards` table's own
# columns) so the wire contract and the doc 03 shape never drift apart.
# ---------------------------------------------------------------------------


class BoardOut(BaseModel):
    """PUT/GET /api/boards/current. Field names match BoardSnapshot, not
    the `boards` table's *_json column names, since this is the API
    boundary, not the row (see app/routers/whiteboard.py for the mapping)."""

    id: int
    tokens: list[BoardToken]
    confirmed_lanes: list[ConfirmedLane]
    blocking_threshold: float
    marking_threshold: float
    zones_visible: ZonesVisible
    updated_at: datetime


class BoardStateOut(BaseModel):
    """GET /api/boards/current always returns 200 (MeOut's pattern):
    `board` is null the first time a team opens the whiteboard, before
    anything has ever been saved, rather than a 404 a signed-in client
    would have to treat as an error case on every fresh team."""

    board: BoardOut | None


class SavedPatternCreateRequest(BaseModel):
    """POST /api/patterns body. No author_* or team_id field exists here
    on purpose (CLAUDE.md rule 4 / doc 03 section 4.2 author stamping):
    the server stamps both from the authenticated caller's own
    membership, so nothing in this payload can forge who recorded it."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    board_snapshot: BoardSnapshot
    keyframes: list[Keyframe] = Field(min_length=1)


class SavedPatternOut(BaseModel):
    id: int
    name: str
    author_role: RoleOnTeam
    # "COACH" when author_role is coach, else the author's display name
    # (design README roles table: "tile shows COACH or player name").
    # Resolved server-side so the frontend never re-derives it.
    author_label: str
    board_snapshot: BoardSnapshot
    keyframes: list[Keyframe]
    created_at: datetime
