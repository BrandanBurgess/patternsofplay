"""Tactics Lab (Epic T-100, doc 06 section 3): formation phases, rotation
systems, position archetypes and their combinations/balance rules,
formation matchups, and a team's own saved formation setups.

Two worlds in this one module, same reasoning as roster.py mixing
PositionCode/Role (library) with Player/PlayerAttribute (team) in one
file because they are one ticket's thematic slice:

  - library world, no team_id anywhere: FormationPhase, RotationSystem,
    PositionArchetype, ArchetypeCombination, UnitBalanceRule,
    FormationMatchup. Seeded, read-only to teams. T-101 creates these
    tables empty; T-102/T-103 own the seed content.
  - team world: TeamFormation carries team_id directly.
    TeamFormationSlot carries no team_id of its own and scopes
    transitively through team_formation_id -> team_formations.team_id,
    the same shape player_attributes already uses through player_id ->
    players.team_id (app/scoped.py TeamScope.query_via).

Fixed vocabularies (phase, family, rule_kind, severity, route_kind, unit,
zone_kind, foot_hint) are plain strings here, validated at the Pydantic
layer when a route is built on top of these tables (T-108), not as DB
enums or CHECK constraints: same precedent as role_on_team
(app/models/platform.py) and attribute_key (app/models/roster.py).
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._util import utcnow


# ---------------------------------------------------------------------------
# Library world (doc 06 section 3.1)
# ---------------------------------------------------------------------------


class FormationPhase(Base):
    """A named shape a base formation morphs into in one phase of play
    (doc 06 section 3.1). Natural key (formation_code, variant_code), same
    style as formation_keystones. The morph animation binds by slot, so
    positions_json's slot set must exactly equal the base formation's slot
    set: enforced by the seed validator (T-102/T-103), not here."""

    __tablename__ = "formation_phases"

    formation_code: Mapped[str] = mapped_column(ForeignKey("formations.code"), primary_key=True)
    variant_code: Mapped[str] = mapped_column(String(30), primary_key=True)
    # in_possession | out_of_possession | rest_defence | transition
    phase: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    shape_label: Mapped[str] = mapped_column(String(20), nullable=False)
    blurb: Mapped[str] = mapped_column(String(300), nullable=False)
    positions_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    trigger: Mapped[str] = mapped_column(Text, nullable=False)
    # '3+2' | '2+3' | '4+1' | '5+2', nullable per doc 06.
    rest_shape: Mapped[str | None] = mapped_column(String(10), nullable=True)
    reference_code: Mapped[str | None] = mapped_column(
        ForeignKey("identities.code"), nullable=True
    )
    uses_rotations: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    source_ref: Mapped[str | None] = mapped_column(String(60), nullable=True)
    content_version: Mapped[str | None] = mapped_column(String(20), nullable=True)


class RotationSystem(Base):
    """A named positional rotation, e.g. a fullback inverting into the
    pivot (doc 06 section 3.1). `risk` is required, not nullable: doc 06
    is explicit that "a rotation without a stated cost fails the
    validator", so the column itself refuses to be empty even before the
    seed validator (T-102/T-103) runs."""

    __tablename__ = "rotation_systems"

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # first_line | pivot | wide | front_line
    family: Mapped[str] = mapped_column(String(20), nullable=False)
    applies_to_formations: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    produces_shape: Mapped[str] = mapped_column(String(20), nullable=False)
    trigger: Mapped[str] = mapped_column(Text, nullable=False)
    what_moves_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    coaching_points_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    risk: Mapped[str] = mapped_column(Text, nullable=False)
    requires_profile_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    animation_spec_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    exemplar_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_ref: Mapped[str | None] = mapped_column(String(60), nullable=True)
    content_version: Mapped[str | None] = mapped_column(String(20), nullable=True)


class PositionArchetype(Base):
    """A named player profile within a slot family, e.g. an inverted
    fullback (doc 06 section 3.1). `duties_json` is what the unit-balance
    checker runs on (UnitBalanceRule); its vocabulary is closed and kept
    small by doc 06's own instruction, so adding a duty is a spec change,
    not a seed change."""

    __tablename__ = "position_archetypes"

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    slot_family: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    definition: Mapped[str] = mapped_column(Text, nullable=False)
    key_attribute_keys: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # same_side | opposite_side | either, nullable per doc 06.
    foot_hint: Mapped[str | None] = mapped_column(String(20), nullable=True)
    awr_default: Mapped[str] = mapped_column(String(10), nullable=False)
    dwr_default: Mapped[str] = mapped_column(String(10), nullable=False)
    duties_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    enables_pattern_codes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    enables_rotation_codes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    needs_around_it: Mapped[str] = mapped_column(Text, nullable=False)
    exemplar_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_ref: Mapped[str | None] = mapped_column(String(60), nullable=True)
    content_version: Mapped[str | None] = mapped_column(String(20), nullable=True)


class ArchetypeCombination(Base):
    """A named pairing/trio of archetypes within one unit, e.g. a specific
    double pivot combination (doc 06 section 3.1). `what_it_costs` is
    required, not nullable, the same "state the cost" rule as
    RotationSystem.risk."""

    __tablename__ = "archetype_combinations"

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    # midfield_three | double_pivot | front_three | strike_pair |
    # back_line | wide_unit | box_midfield
    unit: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slots_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    what_it_gives: Mapped[str] = mapped_column(Text, nullable=False)
    what_it_costs: Mapped[str] = mapped_column(Text, nullable=False)
    reference_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    home_formations: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    source_ref: Mapped[str | None] = mapped_column(String(60), nullable=True)
    content_version: Mapped[str | None] = mapped_column(String(20), nullable=True)


class UnitBalanceRule(Base):
    """The generalisation of role_clashes (app/models/roster.py) across a
    whole unit rather than a pair (doc 06 section 3.1): "reuse its
    evaluation shape so the two engines read alike." `warning_copy` is
    coach-facing and must read as a check, not an error, exactly like
    RoleClash.warning_copy."""

    __tablename__ = "unit_balance_rules"

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    unit: Mapped[str] = mapped_column(String(30), nullable=False)
    # requires_duty | max_duty | max_same_archetype
    rule_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    duty: Mapped[str | None] = mapped_column(String(20), nullable=True)
    min_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    warning_copy: Mapped[str] = mapped_column(Text, nullable=False)
    # note | warning
    severity: Mapped[str] = mapped_column(String(10), nullable=False)
    source_ref: Mapped[str | None] = mapped_column(String(60), nullable=True)
    content_version: Mapped[str | None] = mapped_column(String(20), nullable=True)


class FormationMatchup(Base):
    """How one formation attacks another, "the how the ball finds it"
    line (doc 06 section 3.1). Natural key (ours_code, theirs_code) with
    ours_code <= theirs_code normalised at seed time (T-102/T-103), not
    enforced as a DB constraint here, matching the repo's precedent of
    keeping ordering/shape rules like this at the seed/validator layer
    rather than as schema-level CHECK constraints."""

    __tablename__ = "formation_matchups"

    ours_code: Mapped[str] = mapped_column(ForeignKey("formations.code"), primary_key=True)
    theirs_code: Mapped[str] = mapped_column(ForeignKey("formations.code"), primary_key=True)
    our_edges_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    their_edges_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    route: Mapped[str] = mapped_column(Text, nullable=False)
    # through | around | over
    route_kind: Mapped[str] = mapped_column(String(10), nullable=False)
    source_ref: Mapped[str | None] = mapped_column(String(60), nullable=True)
    content_version: Mapped[str | None] = mapped_column(String(20), nullable=True)


# ---------------------------------------------------------------------------
# Team world (doc 06 section 3.2)
# ---------------------------------------------------------------------------


class TeamFormation(Base):
    """A coach's own saved formation setup for their team (doc 06 section
    3.2). Team world, direct team_id, same scoping shape as SavedPattern
    and Board (app/models/team_content.py).

    active_phase_variant/opponent_phase_variant are plain vocabulary
    strings, not a composite FK into formation_phases(formation_code,
    variant_code): doc 06 does not ask for that referential integrity, and
    T-101 seeds no formation_phases rows at all, so a composite FK here
    would make every team_formation insert depend on content this ticket
    deliberately leaves unseeded (T-102/T-103's job). Same reasoning as
    FormationMatchup's ours_code<=theirs_code ordering: enforced at the
    app/validator layer, not the schema, when that layer exists (T-108)."""

    __tablename__ = "team_formations"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    base_formation_code: Mapped[str] = mapped_column(ForeignKey("formations.code"), nullable=False)
    active_phase_variant: Mapped[str] = mapped_column(String(30), nullable=False)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    opponent_formation_code: Mapped[str | None] = mapped_column(
        ForeignKey("formations.code"), nullable=True
    )
    opponent_phase_variant: Mapped[str | None] = mapped_column(String(30), nullable=True)


class TeamFormationSlot(Base):
    """One slot's assignment within a saved team formation (doc 06 section
    3.2). Team world, but no team_id column of its own: scopes
    transitively through team_formation_id -> team_formations.team_id,
    exactly the pattern player_attributes uses through player_id ->
    players.team_id (app/scoped.py TeamScope.query_via). Natural composite
    key (team_formation_id, slot): one assignment per slot per saved
    formation, same shape as session_receipts' (session_id,
    player_user_id)."""

    __tablename__ = "team_formation_slots"

    team_formation_id: Mapped[int] = mapped_column(
        ForeignKey("team_formations.id"), primary_key=True
    )
    slot: Mapped[str] = mapped_column(String(30), primary_key=True)
    player_id: Mapped[int | None] = mapped_column(ForeignKey("players.id"), nullable=True)
    archetype_code: Mapped[str | None] = mapped_column(
        ForeignKey("position_archetypes.code"), nullable=True
    )
    # Coach-declared 1v1 advantage at this slot.
    qualitative_edge: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
