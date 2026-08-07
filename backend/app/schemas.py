"""Pydantic v2 request/response models for auth, teams, and whiteboard
routes (doc 04 section 1: validate every payload boundary with
Pydantic)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.specs import (
    AnimationSpec,
    BoardSnapshot,
    BoardToken,
    ConfirmedLane,
    Keyframe,
    ModelPoint,
    ZonesVisible,
)

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
    """A joiner submits ONE code; which role they get on the team is
    resolved entirely from which of the team's two join-code columns the
    code matches (T-043 founder decision 2026-07-16), never from the
    joiner's own account role. See app/routers/teams.py join_team."""

    join_code: str = Field(min_length=1, max_length=12)


class TeamOut(BaseModel):
    """Player-safe team shape: no join-code field at all (T-043 decision
    2: both codes are coach-only, and must be ABSENT from a player
    payload, not null). See CoachTeamOut below for the coach-only
    superset, same RosterOut/CoachRosterOut split app/routers/roster.py
    already uses for fit_warnings (CLAUDE.md rule 5)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    age_group: str | None
    level: str | None
    colors_json: dict | None
    created_by: int
    created_at: datetime


class CoachTeamOut(TeamOut):
    """Adds both join codes, only ever built for a coach caller
    (app/routers/teams.py): `join_code` is the player code (the original
    T-003 column, repurposed in place, see app/models/platform.py Team),
    `coach_join_code` is the new one. Never validated/dumped through the
    plain TeamOut type, so these two extra keys are never silently
    dropped by a shared response_model (see the module docstring header)."""

    join_code: str
    coach_join_code: str


class MembershipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    team: TeamOut
    role_on_team: RoleOnTeam
    joined_at: datetime


class CoachMembershipOut(MembershipOut):
    """Same coach-only substitution as CoachTeamOut, one level up: used
    for a membership whose role_on_team is 'coach' so GET /api/auth/me's
    memberships list carries both join codes for a coach's own team(s)
    and neither key at all for a player's."""

    team: CoachTeamOut


class TeamMemberOut(BaseModel):
    """GET /api/teams/members row (T-043 decision 3: head-coach member
    management). Coach-only end to end (the route itself 403s a player,
    require_role_on_team("coach")), so no player-vs-coach split is needed
    on this model the way TeamOut/CoachTeamOut needs one.

    `is_head_coach` is derived server-side from `Team.created_by`, never
    a client-supplied field, so the frontend can gate its remove/role
    controls on it without re-deriving the creator check itself (it must
    still be enforced again on the mutation routes; this field only
    drives which controls the UI renders, per CLAUDE.md rule 5's
    UI-is-not-enough principle)."""

    id: int
    user_id: int
    display_name: str
    role_on_team: RoleOnTeam
    is_head_coach: bool
    joined_at: datetime


class TeamMemberRoleUpdateRequest(BaseModel):
    """PATCH /api/teams/members/{id}/role body. Head-coach-only
    (app/deps.py require_head_coach); changing a member's own role is
    rejected regardless of this payload's contents (T-043 decision 3:
    "not their own")."""

    model_config = ConfigDict(extra="forbid")

    role_on_team: RoleOnTeam


class MeOut(BaseModel):
    """GET /api/auth/me always returns 200: user is null when signed out.
    See app/deps.py get_current_user_optional for why this is not a 401.

    Documents the wire shape only: the route itself is response_model=None
    and returns an already-serialized dict (same pattern as
    app/routers/roster.py get_roster), because `memberships` mixes
    MembershipOut and CoachMembershipOut entries per-row depending on each
    membership's own role_on_team, which a single shared response_model
    cannot express without silently coercing one shape into the other."""

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
# Library content (doc 03 section 4, Bible 3/3F/5B; Brief step 17): the three
# browsable libraries (patterns, deliveries, rotations), read-only to every
# team member, seeded by scripts/seed.py from seeds/*.json. No team_id: this
# is library-world content, not a team's own data (app/models/library.py).
# ---------------------------------------------------------------------------


class LibraryItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    item_type: Literal["pattern", "delivery", "rotation"]
    name: str
    category: str
    blurb: str
    when_to_use: str
    coaching_points: list[str] = Field(validation_alias="coaching_points_json")
    youth_takeaway: str
    age_hint: str
    roles_involved: list[str]
    # extras_json shape depends on item_type (delivery: trajectory/
    # delivery_zone/target_corridor; rotation: trigger/creates/
    # defenders_dilemma), so it stays a free dict rather than a fixed model
    # here (app/models/library.py comment).
    animation_spec: AnimationSpec | None = Field(default=None, validation_alias="animation_spec_json")
    extras: dict | None = Field(default=None, validation_alias="extras_json")


# ---------------------------------------------------------------------------
# Identities: reference teams, style archetypes, cult corner (doc 03
# section 5, Bible 5, 5.7, 6; Brief step 20; T-034). Library world, same
# no-team-scope reasoning as LibraryItemOut above.
# ---------------------------------------------------------------------------


class IdentityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: Literal["style_archetype", "reference_team", "cult_card"]
    code: str
    name: str
    tag_line: str
    formation_code: str | None
    core_idea: str
    signature_pattern_codes: list[str]
    # keystone_roles_json shape depends on kind: reference teams carry
    # {"role", "note"} objects (doc 03 5 example), style archetypes and cult
    # cards carry a plain role-code list or null, so this stays a free list
    # rather than a fixed model (mirrors LibraryItemOut.extras above).
    keystone_roles: list | None = Field(default=None, validation_alias="keystone_roles_json")
    youth_takeaway: str
    age_hint: str
    block: Literal["high", "mid", "low"] | None
    # style archetypes only (Bible 5.7): encouraged/tolerated/discouraged/tempo_rule.
    pass_risk: dict | None = Field(default=None, validation_alias="pass_risk_json")
    shape_render: Literal["animated", "static", "details_only"]
    signature_animation_spec: AnimationSpec | None = Field(
        default=None, validation_alias="signature_animation_spec_json"
    )
    # {"positions": [{"slot","role_hint","x","y"}, ...], "note": str}
    # (doc 03 5 Atletico/Man City examples); a free dict for the same reason
    # as extras above.
    static_shape: dict | None = Field(default=None, validation_alias="static_shape_json")


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
    # player's "own row marked (you)"). Set by app/routers/roster.py's
    # claim-by-name-match (T-041; see that module's docstring) once a
    # player's display_name uniquely matches an unclaimed row.
    is_you: bool
    # doc 03 section 3: "approved text merges into players.playstyle_note".
    # Visible to both roles (it is part of the player's profile, not
    # coach-only data like fit_warnings/receipts): README "Approve merges
    # the note into the profile."
    playstyle_note: str | None = None


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


# ---------------------------------------------------------------------------
# Playstyle suggestions (doc 03 section 3 playstyle_suggestions; Brief step
# 22, PNG 24/25/27; T-041). README roles table: a player suggests a change
# to their own playstyle as free text; it sits "pending coach review" until
# a coach approves (merging the text into players.playstyle_note above) or
# dismisses it (clearing it with no merge).
# ---------------------------------------------------------------------------

SuggestionStatus = Literal["pending", "approved", "dismissed"]


class SuggestionCreateRequest(BaseModel):
    """No player_id, author_user_id, team_id, or status field on purpose
    (CLAUDE.md rule 4 / doc 03 4.2 author-stamping precedent): player_id
    comes from the path, author_user_id and team_id are stamped server-side
    from the session, and a freshly submitted suggestion is always
    'pending'."""

    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=2000)


class SuggestionOut(BaseModel):
    id: int
    player_id: int
    # Resolved server-side (same pattern as PlayerOut.role_name /
    # SavedPatternOut.author_label) so the frontend never re-derives it and
    # the coach's pending-review list can render a name without a second
    # round trip per row.
    player_name: str
    author_user_id: int
    text: str
    status: SuggestionStatus
    created_at: datetime
    reviewed_at: datetime | None


# ---------------------------------------------------------------------------
# Formations, keystones, rondo map (doc 03 section 5, Bible 4/3G.2; Brief
# step 18; T-032). Library-world content like LibraryItemOut above: no
# team_id, visible to both roles, read-only to every team member.
# ---------------------------------------------------------------------------


class FormationPositionOut(BaseModel):
    """One slot from Formation.positions_json (doc 03 section 5): a
    landscape model coordinate plus the position_code the keystone lookup
    and the board's on-token labels both key off of."""

    slot: str
    position_code: str
    x: float
    y: float


class FormationKeystoneOut(BaseModel):
    """One formation_keystones row (Bible Section 4 keystone copy): drives
    both the on-board pulsing keycard (tap the token at this slot) and the
    Details panel's "every keystone blurb" list (Brief step 18 DoD)."""

    slot: str
    title: str
    blurb: str


class RondoZoneOut(BaseModel):
    """One rondo_zones row (Bible 3G.2): a tappable zone on the Rondo Map,
    naming which rondo lives there and which library patterns it trains."""

    zone_key: str
    rondo_name: str
    teaches: str
    polygon: list[ModelPoint]
    trains_pattern_codes: list[str]


class FormationOut(BaseModel):
    """GET /api/formations. Keystones and rondo zones are embedded per
    formation (not separate endpoints): the Formations page's browse sheet
    needs every preset's full detail up front, the same one-round-trip
    shape the Patterns page's listLibraryItems already follows."""

    code: str
    name: str
    shape_blurb: str
    strengths: list[str]
    vulnerabilities: list[str]
    natural_identities: list[str]
    positions: list[FormationPositionOut]
    keystones: list[FormationKeystoneOut]
    rondo_zones: list[RondoZoneOut]


# ---------------------------------------------------------------------------
# Sessions: the classroom loop (doc 03 section 6; Brief step 23, PNG 21-23,
# 26, 28; T-042). Design README: "bundle patterns and recorded whiteboard
# tactics into a session, attach a coach note, and send to players... Sent
# state: gold SENT pill with an x/y viewed counter, and per-player read
# receipts (Viewed / Not yet). Receipts are coach-only, consistent with fit
# warnings, players never see each other's status."
#
# The coach/player split follows the RosterOut/CoachRosterOut precedent
# exactly: two sibling models over a shared base, picked per caller by a
# response_model=None route that returns an already-serialized dict, so a
# player's payload has no receipt KEY at all (not a null or empty one) and
# a coach's has no `you_watched` key (it is meaningless for a non-recipient).
# ---------------------------------------------------------------------------

SessionStatus = Literal["draft", "sent"]
SessionItemKind = Literal["library", "saved_pattern"]


class SessionCreateRequest(BaseModel):
    """POST /api/sessions body. No team_id/created_by/status field on
    purpose (CLAUDE.md rule 4): team_id is stamped by TeamScope.add from
    the caller's own membership, created_by from the session, and a fresh
    session is always a draft."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=120)
    coach_note: str | None = Field(default=None, max_length=2000)


class SessionUpdateRequest(BaseModel):
    """PATCH /api/sessions/{id}. Draft-only (a sent session is a record of
    what the players were actually told, so it stops being editable), and
    both fields are optional so the draft builder can save a note without
    resending the title."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=120)
    coach_note: str | None = Field(default=None, max_length=2000)


class SessionItemCreateRequest(BaseModel):
    """POST /api/sessions/{id}/items. Exactly one of the two id fields must
    be set, matching `item_kind`; the route validates that pairing and that
    the referenced row is reachable (library items are library world, saved
    patterns are team-scoped through this same caller's scope)."""

    model_config = ConfigDict(extra="forbid")

    item_kind: SessionItemKind
    library_item_id: int | None = None
    saved_pattern_id: int | None = None


class SessionItemMoveRequest(BaseModel):
    """PATCH /api/sessions/{id}/items/{item_id}: the design README's
    "Draft state: reorder/remove items". Positions are renormalized to
    0..n-1 server-side after every move, so a client never has to compute
    a gap-free ordering itself."""

    model_config = ConfigDict(extra="forbid")

    position: int = Field(ge=0)


class SessionItemOut(BaseModel):
    """One attached item. Carries the FULL referenced content (not just an
    id) so both the coach's picker thumbnails and the player's Watch
    deep-link can render it through the existing preview converters
    (frontend/src/pages/patternPreview.ts) in one round trip, the same
    embedded-detail shape FormationOut already uses for keystones."""

    id: int
    position: int
    item_kind: SessionItemKind
    library_item: LibraryItemOut | None = None
    saved_pattern: SavedPatternOut | None = None


class SessionReceiptOut(BaseModel):
    """One recipient's read state (doc 03 section 6). COACH-ONLY: this
    model only ever appears inside CoachSessionOut. `jersey_number` is
    resolved from the recipient's claimed roster row when there is one
    (PNG 21's numbered badges), null otherwise."""

    player_user_id: int
    display_name: str
    jersey_number: int | None
    viewed_at: datetime | None
    viewed: bool


class SessionOut(BaseModel):
    """Fields both roles see. Never returned on its own: the routes always
    build one of the two subclasses below."""

    id: int
    title: str
    coach_note: str | None
    status: SessionStatus
    sent_at: datetime | None
    created_at: datetime
    items: list[SessionItemOut]


class PlayerSessionOut(SessionOut):
    """Player payload. `you_watched` is the caller's OWN receipt state and
    nothing else: it is what the Mark as watched button reads, and it
    reveals no other player's status, which is the actual coach-only line
    the design README draws ("players never see each other's status")."""

    you_watched: bool


class CoachSessionOut(SessionOut):
    """Coach payload: the per-player receipts and the x/y counter (PNG 21's
    "SENT . 3/4 viewed"). For a DRAFT the receipt rows are the team's
    current player members with viewed=false, which is the design README's
    "players listed as Will receive"; real receipt rows are written at send
    time (doc 03 section 6)."""

    receipts: list[SessionReceiptOut]
    viewed_count: int
    recipient_count: int


# ---------------------------------------------------------------------------
# Tactics Lab (Epic T-100, doc 06 section 3; T-108). Two worlds, same split
# as the rest of this file:
#   - library world (formation_phases, rotation_systems, position_archetypes,
#     formation_matchups): read-only, seeded, visible to both roles, same
#     from_attributes + validation_alias convention as IdentityOut /
#     LibraryItemOut above (their *_json columns become plain-named fields).
#   - team world (team_formations, team_formation_slots): doc 06 section 3.2,
#     the TeamFormation*In/Out split follows PlayerWriteRequest/PlayerOut:
#     no team_id/created_by_user_id field in any request body (CLAUDE.md
#     rule 4), both stamped server-side from the caller's own scope/
#     membership (app/routers/tactics.py).
# ---------------------------------------------------------------------------


class FormationPhaseOut(BaseModel):
    """One formation_phases row (doc 06 section 3.1): a named shape a base
    formation morphs into in one phase of play. `positions` reuses
    FormationPositionOut since positions_json is the same {slot,
    position_code, x, y} shape as Formation.positions_json, "same slot ids
    as the base formation, all eleven" (doc 06 section 3.1)."""

    model_config = ConfigDict(from_attributes=True)

    formation_code: str
    variant_code: str
    phase: Literal["in_possession", "out_of_possession", "rest_defence", "transition"]
    name: str
    shape_label: str
    blurb: str
    positions: list[FormationPositionOut] = Field(validation_alias="positions_json")
    trigger: str
    rest_shape: str | None
    reference_code: str | None
    uses_rotations: list[str]


class FormationMatchupOut(BaseModel):
    """One formation_matchups row (doc 06 section 3.1): "the how the ball
    finds it" card for one unordered pair of formations. Read exactly as
    authored (ours_code/theirs_code/edges/route are the seeded row's own
    fields, not swapped for query order); see
    GET /api/formations/matchup for how a query's ours/theirs resolve to
    this row regardless of which order they were asked in."""

    model_config = ConfigDict(from_attributes=True)

    ours_code: str
    theirs_code: str
    our_edges: list[str] = Field(validation_alias="our_edges_json")
    their_edges: list[str] = Field(validation_alias="their_edges_json")
    route: str
    route_kind: Literal["through", "around", "over"]


class FormationMatchupResponse(BaseModel):
    """GET /api/formations/matchup always returns 200 (BoardStateOut's
    null-not-404 pattern): `matchup` is null when the two (valid) formation
    codes have no seeded card yet, which doc 06 section 2's engine
    discussion treats as a normal, expected state ("say plainly that this
    pair has no coached read yet. Do not invent one."), not an error."""

    ours_code: str
    theirs_code: str
    matchup: FormationMatchupOut | None


class RotationSystemOut(BaseModel):
    """One rotation_systems row (doc 06 section 3.1)."""

    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str
    family: Literal["first_line", "pivot", "wide", "front_line"]
    applies_to_formations: list[str]
    produces_shape: str
    trigger: str
    what_moves: list = Field(validation_alias="what_moves_json")
    coaching_points: list[str] = Field(validation_alias="coaching_points_json")
    risk: str
    requires_profile: dict | None = Field(default=None, validation_alias="requires_profile_json")
    animation_spec: AnimationSpec | None = Field(default=None, validation_alias="animation_spec_json")
    exemplar_note: str | None


class PositionArchetypeOut(BaseModel):
    """One position_archetypes row (doc 06 section 3.1). `slot_family`
    reuses the position_codes vocabulary (GK, CB, FB, WB, DM, CM, AM, W,
    ST, SS; app/models/roster.py PositionCode), the ten families T-102
    seeds one or more archetypes for."""

    model_config = ConfigDict(from_attributes=True)

    code: str
    slot_family: str
    name: str
    definition: str
    key_attribute_keys: list[AttributeKey]
    foot_hint: Literal["same_side", "opposite_side", "either"] | None
    awr_default: WorkRate
    dwr_default: WorkRate
    duties: list[str] = Field(validation_alias="duties_json")
    enables_pattern_codes: list[str]
    enables_rotation_codes: list[str]
    needs_around_it: str
    exemplar_note: str | None


class ArchetypeSuggestionOut(BaseModel):
    """One ranked candidate (doc 06 section 5.3): "Show the top three with
    a one-line why for each. The why must cite the actual reason..., not a
    score." `why` is built server-side from the player's actual attribute
    values, footedness, and work rates, never a numeric score
    (app/routers/tactics.py _build_why)."""

    archetype_code: str
    archetype_name: str
    slot_family: str
    why: str


class ArchetypeSuggestResponse(BaseModel):
    """GET /api/archetypes/suggest, coach-only. Empty roster is a first
    class state (doc 06 section 5.3: "the panel still works with
    archetypes alone and no players assigned"): when no player_id is
    given, `suggestions` still lists candidate archetypes for the slot
    family, just without an attribute-fit why."""

    slot_family: str
    player_id: int | None
    suggestions: list[ArchetypeSuggestionOut]


class TeamFormationSlotIn(BaseModel):
    """One slot entry inside a team formation write request (doc 06
    section 3.2). No team_formation_id (comes from the parent row this is
    nested under, stamped server-side, CLAUDE.md rule 4)."""

    model_config = ConfigDict(extra="forbid")

    slot: str = Field(min_length=1, max_length=30)
    player_id: int | None = None
    archetype_code: str | None = None
    qualitative_edge: bool = False


class TeamFormationWriteRequest(BaseModel):
    """Shared body shape for POST (create) and PUT (full update) of a
    saved team formation, same "no team_id/author field, full slot-set
    replace" convention as PlayerWriteRequest / SessionCreateRequest.
    `slots` replaces the whole slot set on every write (doc 06 section
    5.3's personnel panel saves all eleven slots as one unit, not a
    field-by-field API)."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    base_formation_code: str
    active_phase_variant: str = Field(min_length=1, max_length=30)
    opponent_formation_code: str | None = None
    opponent_phase_variant: str | None = None
    slots: list[TeamFormationSlotIn] = Field(default_factory=list)


class TeamFormationSlotOut(BaseModel):
    slot: str
    player_id: int | None
    # Resolved server-side (PlayerOut.role_name / SavedPatternOut.author_label
    # precedent) so the frontend never re-derives it from a second round trip.
    player_name: str | None
    archetype_code: str | None
    archetype_name: str | None
    qualitative_edge: bool


class TeamFormationOut(BaseModel):
    id: int
    name: str
    base_formation_code: str
    active_phase_variant: str
    opponent_formation_code: str | None
    opponent_phase_variant: str | None
    created_by_user_id: int
    created_at: datetime
    slots: list[TeamFormationSlotOut]
