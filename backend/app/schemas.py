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


# ---------------------------------------------------------------------------
# Roster (doc 03 section 3, Bible sections 1-2; Brief step 19; T-033).
# ---------------------------------------------------------------------------

WorkRate = Literal["low", "med", "high"]
PreferredFoot = Literal["L", "R", "B"]
Flank = Literal["left", "right", "center"]
# Bible 1.3's six-attribute vocabulary (app/models/roster.py PlayerAttribute).
AttributeKey = Literal[
    "pace",
    "passing_range",
    "carrying_1v1",
    "positional_discipline",
    "aerial_physical",
    "pressing_engine",
]

ATTRIBUTE_KEYS: tuple[AttributeKey, ...] = (
    "pace",
    "passing_range",
    "carrying_1v1",
    "positional_discipline",
    "aerial_physical",
    "pressing_engine",
)


class PlayerAttributesIn(BaseModel):
    """All six sliders, coach-rated 1-5 (Bible 1.3). Every player always
    carries all six, so create/update both require the full set rather
    than a partial patch."""

    model_config = ConfigDict(extra="forbid")

    pace: int = Field(ge=1, le=5)
    passing_range: int = Field(ge=1, le=5)
    carrying_1v1: int = Field(ge=1, le=5)
    positional_discipline: int = Field(ge=1, le=5)
    aerial_physical: int = Field(ge=1, le=5)
    pressing_engine: int = Field(ge=1, le=5)


class PlayerWriteRequest(BaseModel):
    """Shared body shape for POST (create) and PUT (full update) of a
    roster entry. No team_id or user_id field on purpose (CLAUDE.md rule 4
    / doc 03 4.2 author-stamping precedent): team_id is stamped by
    TeamScope.add from the caller's own membership, and user_id (row
    claiming) is not part of this ticket's scope."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    jersey_number: int | None = Field(default=None, ge=1, le=99)
    preferred_foot: PreferredFoot = "R"
    role_code: str | None = None
    flank: Flank | None = None
    awr: WorkRate
    dwr: WorkRate
    attributes: PlayerAttributesIn


class RoleCatalogOut(BaseModel):
    """GET /api/roster/roles: the library role catalog (doc 03 section 3
    Role table), read-only, for populating the role picker. Not
    team-scoped: library content, same as patterns/formations/identities."""

    model_config = ConfigDict(from_attributes=True)

    code: str
    position_code: str
    name: str
    description: str


class PlayerOut(BaseModel):
    id: int
    name: str
    jersey_number: int | None
    preferred_foot: PreferredFoot
    position_code: str | None
    role_code: str | None
    # Resolved server-side from the role catalog (Role.name), same pattern
    # as SavedPatternOut.author_label, so the frontend never re-derives it.
    role_name: str | None
    role_description: str | None
    flank: Flank | None
    awr: WorkRate
    dwr: WorkRate
    attributes: PlayerAttributesIn
    # True when this row belongs to the calling user (README roles table:
    # player's "own row marked (you)"). Always false until a roster row is
    # claimed by a player account, which is out of this ticket's scope
    # (see T-033 final report).
    is_you: bool


class FitWarningOut(BaseModel):
    """One fired role_clashes row (doc 03 section 3: "the designed
    double-exposure warning reads from here"). Coach-only: never appears
    on a player-role payload (CLAUDE.md rule 5), enforced by RosterOut
    below having no field for it at all, not just an empty list."""

    code: str
    name: str
    flank: Flank
    message: str
    wide_player_id: int
    wide_player_name: str
    back_player_id: int
    back_player_name: str


class RosterOut(BaseModel):
    """GET /api/roster response for a player caller. Deliberately has no
    fit_warnings field (see CoachRosterOut): the route returns this model
    (response_model=None, manual model_dump) so the JSON body a player
    receives has no such key at all, not a null or empty one."""

    players: list[PlayerOut]


class CoachRosterOut(RosterOut):
    """GET /api/roster response for a coach caller. Adds fit_warnings on
    top of RosterOut; the route picks this model or the plain RosterOut
    based on the caller's role_on_team, never both from one shared model."""

    fit_warnings: list[FitWarningOut]
