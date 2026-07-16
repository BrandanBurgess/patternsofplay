"""Roster and player profiles (doc 03 section 3, Bible Sections 1, 2).

Two data worlds (doc 03 section 1):
  - team world (team_id on every row): Player, PlayerAttribute,
    PlaystyleSuggestion. Player carries team_id directly; PlayerAttribute
    has no team_id column of its own (doc 03 lists only player_id,
    attribute_key, value for it) and scopes transitively through its
    parent Player row instead. The scoped query layer (app/scoped.py)
    exposes both the direct and the transitive path.
  - library world (no team_id, seeded, read-only to teams): PositionCode,
    Role, RoleSynergy, RoleClash.

attribute_key and role_on_team-style vocab strings are stored as plain
strings rather than DB-level enums or CHECK constraints, matching the
T-003 role_on_team precedent (app/models/platform.py): validation for
fixed vocabularies belongs at the application/Pydantic layer, not as a
schema migration every time a value is added.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._util import utcnow


class PositionCode(Base):
    """Fixed vocabulary table (doc 03 section 3): GK, CB, FB, WB, DM, CM,
    AM, W, ST, SS. Seeded, library world, no further columns given by the
    spec beyond the code itself."""

    __tablename__ = "position_codes"

    code: Mapped[str] = mapped_column(String(10), primary_key=True)


class Role(Base):
    """One row per Bible Section 2 role entry (Sweeper Keeper ... Second
    Striker). Library world."""

    __tablename__ = "roles"

    code: Mapped[str] = mapped_column(String(30), primary_key=True)
    position_code: Mapped[str] = mapped_column(
        ForeignKey("position_codes.code"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    key_attribute_keys: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    awr_default: Mapped[str] = mapped_column(String(10), nullable=False)
    dwr_default: Mapped[str] = mapped_column(String(10), nullable=False)
    archetype_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    enables_pattern_codes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # doc 03 section 7.7/7.8: every seed entry carries source_ref and
    # content_version so the idempotent seeder can upgrade rows in place
    # and content revisions trace back to the Bible.
    source_ref: Mapped[str | None] = mapped_column(String(60), nullable=True)
    content_version: Mapped[str | None] = mapped_column(String(20), nullable=True)


class RoleSynergy(Base):
    """Bible 2B synergy pairs. Library world. `kind` is a literal
    discriminator carried over from doc 03's shared synergy/clash
    description even though synergies and clashes are separate tables
    here; kept because doc 03 names it explicitly."""

    __tablename__ = "role_synergies"

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    role_codes: Mapped[list | None] = mapped_column(JSON, nullable=True)
    slot_expression: Mapped[str | None] = mapped_column(String(200), nullable=True)
    why_it_works: Mapped[str] = mapped_column(Text, nullable=False)
    exemplar: Mapped[str | None] = mapped_column(String(200), nullable=True)
    home_formations: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    powers_pattern_codes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    kind: Mapped[str] = mapped_column(String(10), nullable=False, default="synergy")
    source_ref: Mapped[str | None] = mapped_column(String(60), nullable=True)
    content_version: Mapped[str | None] = mapped_column(String(20), nullable=True)


class RoleClash(Base):
    """Bible 2B.4 clash warnings. Library world. MVP UI activates only
    'double_exposure_flank' via is_active_mvp (doc 03 section 3); the rest
    are seeded as data only in this build."""

    __tablename__ = "role_clashes"

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    trigger_expression: Mapped[str] = mapped_column(String(200), nullable=False)
    warning_copy: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(String(10), nullable=False, default="clash")
    is_active_mvp: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    source_ref: Mapped[str | None] = mapped_column(String(60), nullable=True)
    content_version: Mapped[str | None] = mapped_column(String(20), nullable=True)


class Player(Base):
    """Roster entry. Team world: team_id is the direct scoping column."""

    __tablename__ = "players"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), nullable=False, index=True)
    # Nullable until a player user claims their row (doc 03 section 3).
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    jersey_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preferred_foot: Mapped[str] = mapped_column(String(1), nullable=False)  # L | R | B
    position_line: Mapped[str | None] = mapped_column(String(50), nullable=True)
    position_code: Mapped[str | None] = mapped_column(
        ForeignKey("position_codes.code"), nullable=True
    )
    role_code: Mapped[str | None] = mapped_column(ForeignKey("roles.code"), nullable=True)
    awr: Mapped[str] = mapped_column(String(10), nullable=False)  # low | med | high
    dwr: Mapped[str] = mapped_column(String(10), nullable=False)  # low | med | high
    # Not in doc 03 section 3's players column list either (same
    # reconciliation as playstyle_note below): the double-exposure rule in
    # that same section reads "the fullback or wingback behind them on the
    # same side", which needs a queryable notion of side that nothing else
    # in the schema carries. left | right | center, nullable (unassigned
    # until a coach sets it). T-033 migration 0003.
    flank: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Not in doc 03 section 3's players column list, but doc 03 itself
    # names this exact field when describing playstyle_suggestions just
    # below it ("approved text merges into players.playstyle_note"), so it
    # is added here to reconcile that cross-reference rather than
    # inventing a new field.
    playstyle_note: Mapped[str | None] = mapped_column(Text, nullable=True)


class PlayerAttribute(Base):
    """Bible 1.3 six-attribute vocabulary. Team world, but doc 03 gives it
    no team_id column: it scopes transitively through player_id ->
    players.team_id (app/scoped.py TeamScope.query_via)."""

    __tablename__ = "player_attributes"

    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), primary_key=True)
    attribute_key: Mapped[str] = mapped_column(String(30), primary_key=True)
    value: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-5


class PlaystyleSuggestion(Base):
    """Player-submitted playstyle notes awaiting coach review. Team world,
    direct team_id."""

    __tablename__ = "playstyle_suggestions"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), nullable=False, index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), nullable=False, index=True)
    author_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )  # pending | approved | dismissed
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
