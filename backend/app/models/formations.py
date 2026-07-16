"""Library content: formations, rondo map, identities (doc 03 section 5,
Bible 4, 3G.2, 5, 5.7, 6). Library world: seeded, read-only to teams, no
team_id anywhere in this module.
"""

from sqlalchemy import ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Formation(Base):
    __tablename__ = "formations"

    code: Mapped[str] = mapped_column(String(10), primary_key=True)  # '433', '4231', ...
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    shape_blurb: Mapped[str] = mapped_column(String(300), nullable=False)
    strengths_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    vulnerabilities_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    natural_identities: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    positions_json: Mapped[list] = mapped_column(JSON, nullable=False)
    source_ref: Mapped[str | None] = mapped_column(String(60), nullable=True)
    content_version: Mapped[str | None] = mapped_column(String(20), nullable=True)


class FormationKeystone(Base):
    """Bible Section 4 keystone copy, drives the gold pulse and keycards.
    doc 03 gives no id for this table; (formation_code, slot) is the
    natural key."""

    __tablename__ = "formation_keystones"

    formation_code: Mapped[str] = mapped_column(ForeignKey("formations.code"), primary_key=True)
    slot: Mapped[str] = mapped_column(String(30), primary_key=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    blurb: Mapped[str] = mapped_column(Text, nullable=False)
    source_ref: Mapped[str | None] = mapped_column(String(60), nullable=True)
    content_version: Mapped[str | None] = mapped_column(String(20), nullable=True)


class RondoZone(Base):
    """Bible 3G.2 rondo map; 3G.1 rondo table seeds the metadata even
    though the session planner itself is deferred. No id in doc 03;
    (formation_code, zone_key) is the natural key."""

    __tablename__ = "rondo_zones"

    formation_code: Mapped[str] = mapped_column(ForeignKey("formations.code"), primary_key=True)
    # first_line | midfield_box | flank_corridor | last_line | counterpress
    zone_key: Mapped[str] = mapped_column(String(30), primary_key=True)
    polygon_json: Mapped[list] = mapped_column(JSON, nullable=False)
    rondo_name: Mapped[str] = mapped_column(String(120), nullable=False)
    teaches: Mapped[str] = mapped_column(Text, nullable=False)
    trains_pattern_codes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    source_ref: Mapped[str | None] = mapped_column(String(60), nullable=True)
    content_version: Mapped[str | None] = mapped_column(String(20), nullable=True)


class Identity(Base):
    """Style archetypes, reference teams, and cult cards (doc 03 section
    5). formation_code is nullable: cult corner one-line cards (Bible
    6.19) are not guaranteed to carry their own formation the way a
    style archetype or reference team does."""

    __tablename__ = "identities"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # style_archetype|reference_team|cult_card
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    tag_line: Mapped[str] = mapped_column(String(200), nullable=False)
    formation_code: Mapped[str | None] = mapped_column(
        ForeignKey("formations.code"), nullable=True
    )
    core_idea: Mapped[str] = mapped_column(Text, nullable=False)
    signature_pattern_codes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    keystone_roles_json: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    youth_takeaway: Mapped[str] = mapped_column(Text, nullable=False)
    # Bible 8.2.4 / doc 03 amendment (T-012, founder decision 2026-07-16):
    # every identity carries an age-suitability hint alongside its youth
    # takeaway, same rule and shape as library_items.age_hint.
    age_hint: Mapped[str] = mapped_column(String(60), nullable=False)
    block: Mapped[str | None] = mapped_column(String(10), nullable=True)  # high|mid|low
    # style archetypes only (Bible 5.7 row): encouraged, tolerated,
    # discouraged, tempo_rule.
    pass_risk_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    shape_render: Mapped[str] = mapped_column(String(20), nullable=False)  # animated|static|details_only
    signature_animation_spec_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    static_shape_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    source_ref: Mapped[str | None] = mapped_column(String(60), nullable=True)
    content_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
