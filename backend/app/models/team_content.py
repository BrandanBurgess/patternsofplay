"""Recorded patterns and whiteboard state (doc 03 sections 4.2, 4.3). Team
world: both tables carry team_id directly. The JSON columns here are
validated at the API boundary by the Pydantic models in app/specs.py
(doc 04 section 1), not by a DB-level shape.
"""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._util import utcnow


class SavedPattern(Base):
    """User-recorded pattern (doc 03 section 4.2). keyframes_json is kept
    raw, exactly as recorded, never converted to the declarative
    animation_spec_json format; the animation player abstracts over both.
    Author stamping: tiles render COACH when author_role is coach, else
    the player's display name. Delete permitted only to coaches
    (API-enforced, not here)."""

    __tablename__ = "saved_patterns"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), nullable=False, index=True)
    author_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    author_role: Mapped[str] = mapped_column(String(20), nullable=False)  # coach|player
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    board_snapshot_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    keyframes_json: Mapped[list] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class Board(Base):
    """Whiteboard state (doc 03 section 4.3): one live board per team.
    confirmed_lanes_json stores lanes keyed per player-token pair.

    NOTE (doc 03 section 4.3 design README callout): future versions will
    likely key confirmed lanes by role or slot instead of raw token id, so
    a confirmed lane transfers across formations instead of being pinned
    to one board's specific tokens. Not implemented in this build.
    """

    __tablename__ = "boards"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    tokens_json: Mapped[list] = mapped_column(JSON, nullable=False)
    confirmed_lanes_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    blocking_threshold: Mapped[float] = mapped_column(Float, nullable=False)
    marking_threshold: Mapped[float] = mapped_column(Float, nullable=False)
    zones_visible_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )
