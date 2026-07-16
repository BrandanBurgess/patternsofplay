"""players.flank: which side of the pitch a roster entry is designed to
play (doc 03 section 3 does not enumerate this column explicitly, but its
own double-exposure rule requires knowing whether a wide player and a
fullback/wingback sit "on the same side" - the same reconciliation doc 03
already applies to players.playstyle_note, added there to satisfy a
cross-reference the column list omitted). T-033 (Roster page, Brief step
19) is the first ticket that needs "same designed flank" to be a queryable
fact rather than prose, so it lands here.

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-16 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("players") as batch_op:
        batch_op.add_column(sa.Column("flank", sa.String(length=10), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("players") as batch_op:
        batch_op.drop_column("flank")
