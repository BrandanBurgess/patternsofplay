"""Tactics Lab schema (Epic T-100, doc 06 section 3, T-101): six new
library-world tables (formation_phases, rotation_systems,
position_archetypes, archetype_combinations, unit_balance_rules,
formation_matchups), two new team-world tables (team_formations,
team_formation_slots), and an amendment to the existing rondo_zones table.

rondo_zones gains three columns (canonical_rondo, zone_kind, radius) and a
data migration: the single seeded 4-3-3 `flank_corridor` row (seeds/
rondo_zones.json) covers polygon y 75-100, one flank only. Cross-
referencing seeds/formations.json's own slot naming convention for 433
(fb_l y=12, w_l y=15 vs fb_r y=88, w_r y=85: every '_l' slot sits at low
y, every '_r' slot at high y, per CLAUDE.md rule 8's landscape model
coords) shows y 75-100 is specifically the RIGHT flank corridor, not an
arbitrary single side. This migration therefore:
  - keeps that existing polygon, unchanged, as `flank_corridor_right`
  - mirrors it across the pitch's y=50 midline (y' = 100 - y, x
    unchanged) for a new `flank_corridor_left` row, covering y 0-25
  - carries rondo_name, teaches, trains_pattern_codes, source_ref and
    content_version onto BOTH new rows unchanged, per doc 06 section
    3.1's explicit instruction
  - deletes the original `flank_corridor` row
Written generically over every formation_code that currently has a
`flank_corridor` row (only 433 today), not hardcoded to '433', so any
future data seeded with the old single-corridor shape before this
migration runs would split correctly too. `downgrade()` reverses the
split from the `_right` side's polygon (the one that existed pre-
migration) before dropping the three new columns.

Team-world tables (doc 03 section 1, CLAUDE.md rule 4): team_formations
carries team_id directly; team_formation_slots carries none and scopes
transitively through team_formation_id, the same shape player_attributes
already uses through player_id (see app/scoped.py).

This ticket creates the six new library-world tables empty: seed content
for them is T-102/T-103's job, not this migration's.

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-07 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Lightweight Core table, columns only as needed for the data migration
# below, typed so JSON columns serialise/deserialise correctly through
# plain Core select/insert/delete rather than raw textual SQL.
_rondo_zones = sa.table(
    "rondo_zones",
    sa.column("formation_code", sa.String),
    sa.column("zone_key", sa.String),
    sa.column("polygon_json", sa.JSON),
    sa.column("rondo_name", sa.String),
    sa.column("teaches", sa.Text),
    sa.column("trains_pattern_codes", sa.JSON),
    sa.column("source_ref", sa.String),
    sa.column("content_version", sa.String),
)


def _mirror_polygon_y(polygon: list[dict]) -> list[dict]:
    """Model space is landscape, y 0-100 top to bottom (CLAUDE.md rule 8).
    Mirroring across the pitch's y=50 midline (y' = 100 - y, x unchanged)
    turns the seeded right-flank corridor into its left-flank
    counterpart."""
    return [{"x": point["x"], "y": 100 - point["y"]} for point in polygon]


def _split_flank_corridor_rows(conn: sa.engine.Connection) -> None:
    existing = conn.execute(
        sa.select(_rondo_zones).where(_rondo_zones.c.zone_key == "flank_corridor")
    ).fetchall()

    for row in existing:
        shared = dict(
            rondo_name=row.rondo_name,
            teaches=row.teaches,
            trains_pattern_codes=row.trains_pattern_codes,
            source_ref=row.source_ref,
            content_version=row.content_version,
        )
        conn.execute(
            sa.insert(_rondo_zones).values(
                formation_code=row.formation_code,
                zone_key="flank_corridor_right",
                polygon_json=row.polygon_json,
                **shared,
            )
        )
        conn.execute(
            sa.insert(_rondo_zones).values(
                formation_code=row.formation_code,
                zone_key="flank_corridor_left",
                polygon_json=_mirror_polygon_y(row.polygon_json),
                **shared,
            )
        )

    conn.execute(sa.delete(_rondo_zones).where(_rondo_zones.c.zone_key == "flank_corridor"))


def _merge_flank_corridor_rows(conn: sa.engine.Connection) -> None:
    """Downgrade path: for every formation_code carrying both split rows,
    recreate the single flank_corridor row from the _right side (the
    polygon that existed before upgrade() ran), then drop both split
    rows. zone_kind/canonical_rondo/radius are deliberately left out of
    the recreated row's values so the still-present zone_kind column
    falls back to its own server default rather than this function
    hardcoding a value that duplicates that default."""
    right_rows = conn.execute(
        sa.select(_rondo_zones).where(_rondo_zones.c.zone_key == "flank_corridor_right")
    ).fetchall()

    for row in right_rows:
        conn.execute(
            sa.insert(_rondo_zones).values(
                formation_code=row.formation_code,
                zone_key="flank_corridor",
                polygon_json=row.polygon_json,
                rondo_name=row.rondo_name,
                teaches=row.teaches,
                trains_pattern_codes=row.trains_pattern_codes,
                source_ref=row.source_ref,
                content_version=row.content_version,
            )
        )

    conn.execute(
        sa.delete(_rondo_zones).where(
            _rondo_zones.c.zone_key.in_(["flank_corridor_left", "flank_corridor_right"])
        )
    )


def upgrade() -> None:
    # --- library world (doc 06 section 3.1) ---------------------------
    op.create_table(
        "position_archetypes",
        sa.Column("code", sa.String(length=40), primary_key=True),
        sa.Column("slot_family", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("definition", sa.Text(), nullable=False),
        sa.Column("key_attribute_keys", sa.JSON(), nullable=False),
        sa.Column("foot_hint", sa.String(length=20), nullable=True),
        sa.Column("awr_default", sa.String(length=10), nullable=False),
        sa.Column("dwr_default", sa.String(length=10), nullable=False),
        sa.Column("duties_json", sa.JSON(), nullable=False),
        sa.Column("enables_pattern_codes", sa.JSON(), nullable=False),
        sa.Column("enables_rotation_codes", sa.JSON(), nullable=False),
        sa.Column("needs_around_it", sa.Text(), nullable=False),
        sa.Column("exemplar_note", sa.Text(), nullable=True),
        sa.Column("source_ref", sa.String(length=60), nullable=True),
        sa.Column("content_version", sa.String(length=20), nullable=True),
    )

    op.create_table(
        "rotation_systems",
        sa.Column("code", sa.String(length=40), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("family", sa.String(length=20), nullable=False),
        sa.Column("applies_to_formations", sa.JSON(), nullable=False),
        sa.Column("produces_shape", sa.String(length=20), nullable=False),
        sa.Column("trigger", sa.Text(), nullable=False),
        sa.Column("what_moves_json", sa.JSON(), nullable=False),
        sa.Column("coaching_points_json", sa.JSON(), nullable=False),
        sa.Column("risk", sa.Text(), nullable=False),
        sa.Column("requires_profile_json", sa.JSON(), nullable=True),
        sa.Column("animation_spec_json", sa.JSON(), nullable=True),
        sa.Column("exemplar_note", sa.Text(), nullable=True),
        sa.Column("source_ref", sa.String(length=60), nullable=True),
        sa.Column("content_version", sa.String(length=20), nullable=True),
    )

    op.create_table(
        "formation_phases",
        sa.Column("formation_code", sa.String(length=10), primary_key=True),
        sa.Column("variant_code", sa.String(length=30), primary_key=True),
        sa.Column("phase", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("shape_label", sa.String(length=20), nullable=False),
        sa.Column("blurb", sa.String(length=300), nullable=False),
        sa.Column("positions_json", sa.JSON(), nullable=False),
        sa.Column("trigger", sa.Text(), nullable=False),
        sa.Column("rest_shape", sa.String(length=10), nullable=True),
        sa.Column("reference_code", sa.String(length=40), nullable=True),
        sa.Column("uses_rotations", sa.JSON(), nullable=False),
        sa.Column("source_ref", sa.String(length=60), nullable=True),
        sa.Column("content_version", sa.String(length=20), nullable=True),
        sa.ForeignKeyConstraint(
            ["formation_code"],
            ["formations.code"],
            name="fk_formation_phases_formation_code_formations",
        ),
        sa.ForeignKeyConstraint(
            ["reference_code"],
            ["identities.code"],
            name="fk_formation_phases_reference_code_identities",
        ),
    )

    op.create_table(
        "archetype_combinations",
        sa.Column("code", sa.String(length=40), primary_key=True),
        sa.Column("unit", sa.String(length=30), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("slots_json", sa.JSON(), nullable=False),
        sa.Column("what_it_gives", sa.Text(), nullable=False),
        sa.Column("what_it_costs", sa.Text(), nullable=False),
        sa.Column("reference_note", sa.Text(), nullable=True),
        sa.Column("home_formations", sa.JSON(), nullable=False),
        sa.Column("source_ref", sa.String(length=60), nullable=True),
        sa.Column("content_version", sa.String(length=20), nullable=True),
    )

    op.create_table(
        "unit_balance_rules",
        sa.Column("code", sa.String(length=40), primary_key=True),
        sa.Column("unit", sa.String(length=30), nullable=False),
        sa.Column("rule_kind", sa.String(length=20), nullable=False),
        sa.Column("duty", sa.String(length=20), nullable=True),
        sa.Column("min_count", sa.Integer(), nullable=True),
        sa.Column("max_count", sa.Integer(), nullable=True),
        sa.Column("warning_copy", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(length=10), nullable=False),
        sa.Column("source_ref", sa.String(length=60), nullable=True),
        sa.Column("content_version", sa.String(length=20), nullable=True),
    )

    op.create_table(
        "formation_matchups",
        sa.Column("ours_code", sa.String(length=10), primary_key=True),
        sa.Column("theirs_code", sa.String(length=10), primary_key=True),
        sa.Column("our_edges_json", sa.JSON(), nullable=False),
        sa.Column("their_edges_json", sa.JSON(), nullable=False),
        sa.Column("route", sa.Text(), nullable=False),
        sa.Column("route_kind", sa.String(length=10), nullable=False),
        sa.Column("source_ref", sa.String(length=60), nullable=True),
        sa.Column("content_version", sa.String(length=20), nullable=True),
        sa.ForeignKeyConstraint(
            ["ours_code"], ["formations.code"], name="fk_formation_matchups_ours_code_formations"
        ),
        sa.ForeignKeyConstraint(
            ["theirs_code"],
            ["formations.code"],
            name="fk_formation_matchups_theirs_code_formations",
        ),
    )

    # --- team world (doc 06 section 3.2) -------------------------------
    op.create_table(
        "team_formations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("base_formation_code", sa.String(length=10), nullable=False),
        sa.Column("active_phase_variant", sa.String(length=30), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("opponent_formation_code", sa.String(length=10), nullable=True),
        sa.Column("opponent_phase_variant", sa.String(length=30), nullable=True),
        sa.ForeignKeyConstraint(
            ["team_id"], ["teams.id"], name="fk_team_formations_team_id_teams"
        ),
        sa.ForeignKeyConstraint(
            ["base_formation_code"],
            ["formations.code"],
            name="fk_team_formations_base_formation_code_formations",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name="fk_team_formations_created_by_user_id_users",
        ),
        sa.ForeignKeyConstraint(
            ["opponent_formation_code"],
            ["formations.code"],
            name="fk_team_formations_opponent_formation_code_formations",
        ),
    )
    op.create_index("ix_team_formations_team_id", "team_formations", ["team_id"])

    op.create_table(
        "team_formation_slots",
        sa.Column("team_formation_id", sa.Integer(), primary_key=True),
        sa.Column("slot", sa.String(length=30), primary_key=True),
        sa.Column("player_id", sa.Integer(), nullable=True),
        sa.Column("archetype_code", sa.String(length=40), nullable=True),
        sa.Column("qualitative_edge", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["team_formation_id"],
            ["team_formations.id"],
            name="fk_team_formation_slots_team_formation_id_team_formations",
        ),
        sa.ForeignKeyConstraint(
            ["player_id"], ["players.id"], name="fk_team_formation_slots_player_id_players"
        ),
        sa.ForeignKeyConstraint(
            ["archetype_code"],
            ["position_archetypes.code"],
            name="fk_team_formation_slots_archetype_code_position_archetypes",
        ),
    )

    # --- rondo_zones amendment (doc 06 section 3.1) --------------------
    with op.batch_alter_table("rondo_zones") as batch_op:
        batch_op.add_column(sa.Column("canonical_rondo", sa.String(length=30), nullable=True))
        batch_op.add_column(
            sa.Column("zone_kind", sa.String(length=30), nullable=False, server_default="polygon")
        )
        batch_op.add_column(sa.Column("radius", sa.Integer(), nullable=True))

    _split_flank_corridor_rows(op.get_bind())


def downgrade() -> None:
    _merge_flank_corridor_rows(op.get_bind())

    with op.batch_alter_table("rondo_zones") as batch_op:
        batch_op.drop_column("radius")
        batch_op.drop_column("zone_kind")
        batch_op.drop_column("canonical_rondo")

    op.drop_table("team_formation_slots")
    op.drop_index("ix_team_formations_team_id", table_name="team_formations")
    op.drop_table("team_formations")
    op.drop_table("formation_matchups")
    op.drop_table("unit_balance_rules")
    op.drop_table("archetype_combinations")
    op.drop_table("formation_phases")
    op.drop_table("rotation_systems")
    op.drop_table("position_archetypes")
