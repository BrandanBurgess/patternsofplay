"""Sessions: classroom delivery (doc 03 section 6). Team world.

`TrainingSession` is the doc 03 `sessions` table under a Python-safe name
(the bare name `Session` collides with sqlalchemy.orm.Session, which
every router and this same module's callers already import). SessionItem
and SessionReceipt carry no team_id of their own in doc 03; both scope
transitively through session_id -> sessions.team_id (app/scoped.py
TeamScope.query_via).

Rules from doc 03 section 6, enforced at the API layer (T-042), not here:
receipts exist for every recipient at send time with viewed_at null;
"Mark as watched" sets it; receipt data appears only in coach-role API
responses; draft items reorder by `position`.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._util import utcnow


class TrainingSession(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), nullable=False, index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    coach_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="draft")  # draft|sent
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class SessionItem(Base):
    __tablename__ = "session_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    item_kind: Mapped[str] = mapped_column(String(20), nullable=False)  # library|saved_pattern
    library_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("library_items.id"), nullable=True
    )
    saved_pattern_id: Mapped[int | None] = mapped_column(
        ForeignKey("saved_patterns.id"), nullable=True
    )


class SessionReceipt(Base):
    """No id column in doc 03: (session_id, player_user_id) is the
    natural key, one receipt per recipient per session."""

    __tablename__ = "session_receipts"

    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), primary_key=True)
    player_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
