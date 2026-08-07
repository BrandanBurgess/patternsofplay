"""Delete the orphan rondo_zones row left behind by T-103's rename (doc 06
section 2.3, T-111).

T-103 renamed the rondo_zones zone_key `counterpress` to
`counterpress_ring` and changed its zone_kind from a fixed `polygon` to a
ball-relative `circle` of radius 18, rewriting seeds/rondo_zones.json to
match: the seed file now carries `counterpress_ring` for all six
formations and no `counterpress` row at all.

scripts/seed.py is upsert-only by natural key (doc 03 section 8.4) and
never deletes rows that a newer seed file no longer lists. That is
deliberate and correct in general, but it means any database that was
already seeded before T-103 landed still carries the old `('433',
'counterpress')` row: nothing in an upsert-only seeder ever removes it.
Left alone, a persistent-disk deploy upgraded straight from before T-103
would render seven rondo zones on the 4-3-3 (six current ones plus this
stale seventh) instead of six.

A fresh database seeded after T-103 never had this row in the first
place, which is why this is specifically an upgrade-path bug and not
something a from-zero build or CI would ever catch.

Written generically over zone_key = 'counterpress' across every
formation_code (not hardcoded to '433'), so it is correct regardless of
which formations a given database happens to hold a stale row for.

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-07 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Lightweight Core table, only the column this data migration filters on,
# typed so the delete goes through plain Core rather than raw textual SQL
# (same style as 0006's _rondo_zones construct).
_rondo_zones = sa.table(
    "rondo_zones",
    sa.column("zone_key", sa.String),
)


def upgrade() -> None:
    # Matches zero rows on any database seeded on or after T-103 (the
    # normal, fresh-install case), so this is a no-op there: idempotent
    # in effect, not just safe to re-run.
    op.execute(sa.delete(_rondo_zones).where(_rondo_zones.c.zone_key == "counterpress"))


def downgrade() -> None:
    # Deliberately a no-op, not a reinsertion.
    #
    # 0006's downgrade could rebuild flank_corridor from flank_corridor_
    # right because that row's polygon was still sitting in the same
    # table, untouched, right up until the moment of deletion: the split
    # was a pure copy-then-delete, so the source data for a merge-back
    # was always present.
    #
    # This migration has no such source to work from. The deleted
    # counterpress row's polygon was a value in a database row, never
    # captured anywhere in the schema or in this migration itself, and
    # the counterpress_ring rows that replace it are not a derivation of
    # that polygon: they are an unrelated shape (a ball-relative circle
    # of radius 18 vs. the old fixed polygon), seeded independently by
    # scripts/seed.py from seeds/rondo_zones.json. There is nothing left
    # in the post-upgrade schema state that the original stale polygon
    # could be reconstructed from.
    #
    # A downgrade that reinserted some hardcoded polygon here would not
    # be restoring what upgrade() deleted; it would be fabricating a
    # value and asserting it was the prior state. That is worse than
    # doing nothing, so downgrade() intentionally leaves the counterpress
    # row deleted.
    pass
