"""Pydantic v2 request/response models for auth and teams (doc 04 section 1:
validate every payload boundary with Pydantic)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

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
