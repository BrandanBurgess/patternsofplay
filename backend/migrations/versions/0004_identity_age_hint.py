"""identities.age_hint (founder decision 2026-07-16, T-012): doc 03 section
5's identities schema had no age_hint column when T-010 shipped, so Bible
8.2.4's "every identity carries a youth takeaway line and an age-suitability
hint" rule was only honoured for library_items (patterns/deliveries/
rotations), not identities. The founder has since decided to amend the
schema rather than leave identity cards without an age hint.

Added nullable=False with server_default="" (rather than a bare add, doc
03's identities table already has rows in any dev DB that ran T-010's
seed): SQLite's batch-recreate for an ALTER TABLE ADD COLUMN NOT NULL needs
a value for existing rows, and scripts/seed.py's upsert-by-code re-run
overwrites every row's placeholder with its real Bible-backed value
immediately afterward, so the empty string never surfaces to a user who
runs `make seed` after upgrading.

Built off 0003 (players.flank, T-033). T-043 (role-scoped join codes) is
also building a migration off 0003 in parallel; the orchestrator repoints
whichever of 0004/0004 merges second onto the other's head.

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-16 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("identities") as batch_op:
        batch_op.add_column(
            sa.Column("age_hint", sa.String(length=60), nullable=False, server_default="")
        )


def downgrade() -> None:
    with op.batch_alter_table("identities") as batch_op:
        batch_op.drop_column("age_hint")
