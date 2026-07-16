"""role-scoped join codes (T-043, founder decision 2026-07-16): a team now
has TWO join codes, a player code and a coach code, and joining with a
code assigns THAT role on the team regardless of the joiner's own account
role.

`teams.join_code` (the T-003 column, doc 03 section 2) is REPURPOSED in
place, not renamed or replaced: every existing team's code and every row
referencing it survive this migration untouched. It is now specifically
the PLAYER code. `coach_join_code` is the new column added here, added
nullable first, backfilled with a freshly generated code per existing
team (so `make migrate` on a database that already has teams in it never
leaves a team without a coach code), then made NOT NULL + unique to match
`join_code`'s own constraint shape.

Generation reuses the exact alphabet/length app/security.py's
generate_join_code() uses (not an import of that function itself: Alembic
migrations run against whatever the schema looked like the day they were
written, and should not call forward into application code that could
change shape later), and checks uniqueness against BOTH columns so a
generated coach code can never collide with any existing player code or
vice versa: doc 03 section 2's single-namespace uniqueness becomes a
two-column uniqueness check, which is what app/routers/teams.py's own
_unique_code helper also enforces going forward for newly created teams.

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-16 00:00:00.000000

"""

import secrets
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Mirrors app/security.py's _JOIN_CODE_ALPHABET / _JOIN_CODE_LENGTH exactly
# (excludes 0/O and 1/I so a coach can read a code aloud unambiguously).
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_LENGTH = 6
_ATTEMPTS = 50


def _generate_unique_code(taken: set[str]) -> str:
    for _ in range(_ATTEMPTS):
        candidate = "".join(secrets.choice(_ALPHABET) for _ in range(_LENGTH))
        if candidate not in taken:
            return candidate
    raise RuntimeError("Could not allocate a unique coach join code during migration 0004")


def upgrade() -> None:
    with op.batch_alter_table("teams") as batch_op:
        batch_op.add_column(sa.Column("coach_join_code", sa.String(length=12), nullable=True))

    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, join_code FROM teams")).fetchall()

    # Seed the "taken" set with every existing player code so a backfilled
    # coach code can never collide with one, then grow it as each coach
    # code is generated so two existing teams' backfills can never
    # collide with each other either.
    taken = {row.join_code for row in rows}
    for row in rows:
        code = _generate_unique_code(taken)
        taken.add(code)
        conn.execute(
            sa.text("UPDATE teams SET coach_join_code = :code WHERE id = :id"),
            {"code": code, "id": row.id},
        )

    with op.batch_alter_table("teams") as batch_op:
        batch_op.alter_column("coach_join_code", existing_type=sa.String(length=12), nullable=False)
    op.create_index("ix_teams_coach_join_code", "teams", ["coach_join_code"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_teams_coach_join_code", table_name="teams")
    with op.batch_alter_table("teams") as batch_op:
        batch_op.drop_column("coach_join_code")
