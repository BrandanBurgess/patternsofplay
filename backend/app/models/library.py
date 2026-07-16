"""Library content: patterns, deliveries, rotations (doc 03 section 4,
Bible 3, 3F, 5B). Library world: seeded, read-only to teams, no team_id.

One `library_items` table with an `item_type` discriminator, per doc 03,
keeps browsing, search, and session-attachment uniform across the three
kinds instead of three near-identical tables.
"""

from sqlalchemy import JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class LibraryItem(Base):
    __tablename__ = "library_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    item_type: Mapped[str] = mapped_column(String(20), nullable=False)  # pattern|delivery|rotation
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    blurb: Mapped[str] = mapped_column(String(300), nullable=False)
    when_to_use: Mapped[str] = mapped_column(Text, nullable=False)
    coaching_points_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    youth_takeaway: Mapped[str] = mapped_column(Text, nullable=False)
    age_hint: Mapped[str] = mapped_column(String(60), nullable=False)
    roles_involved: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    animation_spec_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # extras_json shape depends on item_type (doc 03 section 4): delivery
    # carries trajectory/delivery_zone/target_corridor, rotation carries
    # trigger/creates/defenders_dilemma. Validated by the seed pipeline
    # (T-011), not by a fixed DB shape here.
    extras_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # doc 03 section 7.7/7.8 traceability and idempotent-upgrade fields,
    # required of every seed entry.
    source_ref: Mapped[str | None] = mapped_column(String(60), nullable=True)
    content_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
