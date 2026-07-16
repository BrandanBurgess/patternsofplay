"""content schema: roster, library, formations/identities, board/session
content (doc 03 sections 3, 4, 5, 6)

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-16 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- library world: taxonomy (doc 03 section 3) -----------------------
    op.create_table(
        "position_codes",
        sa.Column("code", sa.String(length=10), primary_key=True),
    )

    op.create_table(
        "roles",
        sa.Column("code", sa.String(length=30), primary_key=True),
        sa.Column("position_code", sa.String(length=10), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("key_attribute_keys", sa.JSON(), nullable=False),
        sa.Column("awr_default", sa.String(length=10), nullable=False),
        sa.Column("dwr_default", sa.String(length=10), nullable=False),
        sa.Column("archetype_note", sa.Text(), nullable=True),
        sa.Column("enables_pattern_codes", sa.JSON(), nullable=False),
        sa.Column("source_ref", sa.String(length=60), nullable=True),
        sa.Column("content_version", sa.String(length=20), nullable=True),
        sa.ForeignKeyConstraint(
            ["position_code"], ["position_codes.code"], name="fk_roles_position_code"
        ),
    )
    op.create_index("ix_roles_position_code", "roles", ["position_code"])

    op.create_table(
        "role_synergies",
        sa.Column("code", sa.String(length=40), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("role_codes", sa.JSON(), nullable=True),
        sa.Column("slot_expression", sa.String(length=200), nullable=True),
        sa.Column("why_it_works", sa.Text(), nullable=False),
        sa.Column("exemplar", sa.String(length=200), nullable=True),
        sa.Column("home_formations", sa.JSON(), nullable=False),
        sa.Column("powers_pattern_codes", sa.JSON(), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("source_ref", sa.String(length=60), nullable=True),
        sa.Column("content_version", sa.String(length=20), nullable=True),
    )

    op.create_table(
        "role_clashes",
        sa.Column("code", sa.String(length=40), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("trigger_expression", sa.String(length=200), nullable=False),
        sa.Column("warning_copy", sa.Text(), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("is_active_mvp", sa.Boolean(), nullable=False),
        sa.Column("source_ref", sa.String(length=60), nullable=True),
        sa.Column("content_version", sa.String(length=20), nullable=True),
    )

    # --- library world: patterns/deliveries/rotations (doc 03 section 4) --
    op.create_table(
        "library_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("item_type", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("blurb", sa.String(length=300), nullable=False),
        sa.Column("when_to_use", sa.Text(), nullable=False),
        sa.Column("coaching_points_json", sa.JSON(), nullable=False),
        sa.Column("youth_takeaway", sa.Text(), nullable=False),
        sa.Column("age_hint", sa.String(length=60), nullable=False),
        sa.Column("roles_involved", sa.JSON(), nullable=False),
        sa.Column("animation_spec_json", sa.JSON(), nullable=True),
        sa.Column("extras_json", sa.JSON(), nullable=True),
        sa.Column("source_ref", sa.String(length=60), nullable=True),
        sa.Column("content_version", sa.String(length=20), nullable=True),
    )
    op.create_index("ix_library_items_code", "library_items", ["code"], unique=True)

    # --- library world: formations, rondo map, identities (section 5) ----
    op.create_table(
        "formations",
        sa.Column("code", sa.String(length=10), primary_key=True),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("shape_blurb", sa.String(length=300), nullable=False),
        sa.Column("strengths_json", sa.JSON(), nullable=False),
        sa.Column("vulnerabilities_json", sa.JSON(), nullable=False),
        sa.Column("natural_identities", sa.JSON(), nullable=False),
        sa.Column("positions_json", sa.JSON(), nullable=False),
        sa.Column("source_ref", sa.String(length=60), nullable=True),
        sa.Column("content_version", sa.String(length=20), nullable=True),
    )

    op.create_table(
        "formation_keystones",
        sa.Column("formation_code", sa.String(length=10), primary_key=True),
        sa.Column("slot", sa.String(length=30), primary_key=True),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("blurb", sa.Text(), nullable=False),
        sa.Column("source_ref", sa.String(length=60), nullable=True),
        sa.Column("content_version", sa.String(length=20), nullable=True),
        sa.ForeignKeyConstraint(
            ["formation_code"],
            ["formations.code"],
            name="fk_formation_keystones_formation_code",
        ),
    )

    op.create_table(
        "rondo_zones",
        sa.Column("formation_code", sa.String(length=10), primary_key=True),
        sa.Column("zone_key", sa.String(length=30), primary_key=True),
        sa.Column("polygon_json", sa.JSON(), nullable=False),
        sa.Column("rondo_name", sa.String(length=120), nullable=False),
        sa.Column("teaches", sa.Text(), nullable=False),
        sa.Column("trains_pattern_codes", sa.JSON(), nullable=False),
        sa.Column("source_ref", sa.String(length=60), nullable=True),
        sa.Column("content_version", sa.String(length=20), nullable=True),
        sa.ForeignKeyConstraint(
            ["formation_code"], ["formations.code"], name="fk_rondo_zones_formation_code"
        ),
    )

    op.create_table(
        "identities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("tag_line", sa.String(length=200), nullable=False),
        sa.Column("formation_code", sa.String(length=10), nullable=True),
        sa.Column("core_idea", sa.Text(), nullable=False),
        sa.Column("signature_pattern_codes", sa.JSON(), nullable=False),
        sa.Column("keystone_roles_json", sa.JSON(), nullable=True),
        sa.Column("youth_takeaway", sa.Text(), nullable=False),
        sa.Column("block", sa.String(length=10), nullable=True),
        sa.Column("pass_risk_json", sa.JSON(), nullable=True),
        sa.Column("shape_render", sa.String(length=20), nullable=False),
        sa.Column("signature_animation_spec_json", sa.JSON(), nullable=True),
        sa.Column("static_shape_json", sa.JSON(), nullable=True),
        sa.Column("source_ref", sa.String(length=60), nullable=True),
        sa.Column("content_version", sa.String(length=20), nullable=True),
        sa.ForeignKeyConstraint(
            ["formation_code"], ["formations.code"], name="fk_identities_formation_code"
        ),
    )
    op.create_index("ix_identities_code", "identities", ["code"], unique=True)

    # --- team world: roster (doc 03 section 3) -----------------------------
    op.create_table(
        "players",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("jersey_number", sa.Integer(), nullable=True),
        sa.Column("preferred_foot", sa.String(length=1), nullable=False),
        sa.Column("position_line", sa.String(length=50), nullable=True),
        sa.Column("position_code", sa.String(length=10), nullable=True),
        sa.Column("role_code", sa.String(length=30), nullable=True),
        sa.Column("awr", sa.String(length=10), nullable=False),
        sa.Column("dwr", sa.String(length=10), nullable=False),
        sa.Column("playstyle_note", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], name="fk_players_team_id_teams"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_players_user_id_users"),
        sa.ForeignKeyConstraint(
            ["position_code"], ["position_codes.code"], name="fk_players_position_code"
        ),
        sa.ForeignKeyConstraint(["role_code"], ["roles.code"], name="fk_players_role_code"),
    )
    op.create_index("ix_players_team_id", "players", ["team_id"])

    op.create_table(
        "player_attributes",
        sa.Column("player_id", sa.Integer(), primary_key=True),
        sa.Column("attribute_key", sa.String(length=30), primary_key=True),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["player_id"], ["players.id"], name="fk_player_attributes_player_id"
        ),
    )

    op.create_table(
        "playstyle_suggestions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("author_user_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["team_id"], ["teams.id"], name="fk_playstyle_suggestions_team_id"
        ),
        sa.ForeignKeyConstraint(
            ["player_id"], ["players.id"], name="fk_playstyle_suggestions_player_id"
        ),
        sa.ForeignKeyConstraint(
            ["author_user_id"], ["users.id"], name="fk_playstyle_suggestions_author_user_id"
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by"], ["users.id"], name="fk_playstyle_suggestions_reviewed_by"
        ),
    )
    op.create_index(
        "ix_playstyle_suggestions_team_id", "playstyle_suggestions", ["team_id"]
    )
    op.create_index(
        "ix_playstyle_suggestions_player_id", "playstyle_suggestions", ["player_id"]
    )

    # --- team world: recorded patterns and whiteboard state (section 4.2/4.3)
    op.create_table(
        "saved_patterns",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("author_user_id", sa.Integer(), nullable=False),
        sa.Column("author_role", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("board_snapshot_json", sa.JSON(), nullable=False),
        sa.Column("keyframes_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], name="fk_saved_patterns_team_id"),
        sa.ForeignKeyConstraint(
            ["author_user_id"], ["users.id"], name="fk_saved_patterns_author_user_id"
        ),
    )
    op.create_index("ix_saved_patterns_team_id", "saved_patterns", ["team_id"])

    op.create_table(
        "boards",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("tokens_json", sa.JSON(), nullable=False),
        sa.Column("confirmed_lanes_json", sa.JSON(), nullable=False),
        sa.Column("blocking_threshold", sa.Float(), nullable=False),
        sa.Column("marking_threshold", sa.Float(), nullable=False),
        sa.Column("zones_visible_json", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], name="fk_boards_team_id"),
    )
    op.create_index("ix_boards_team_id", "boards", ["team_id"])

    # --- team world: sessions (doc 03 section 6) ---------------------------
    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("coach_note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], name="fk_sessions_team_id"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name="fk_sessions_created_by"),
    )
    op.create_index("ix_sessions_team_id", "sessions", ["team_id"])

    op.create_table(
        "session_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("item_kind", sa.String(length=20), nullable=False),
        sa.Column("library_item_id", sa.Integer(), nullable=True),
        sa.Column("saved_pattern_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["session_id"], ["sessions.id"], name="fk_session_items_session_id"
        ),
        sa.ForeignKeyConstraint(
            ["library_item_id"], ["library_items.id"], name="fk_session_items_library_item_id"
        ),
        sa.ForeignKeyConstraint(
            ["saved_pattern_id"],
            ["saved_patterns.id"],
            name="fk_session_items_saved_pattern_id",
        ),
    )
    op.create_index("ix_session_items_session_id", "session_items", ["session_id"])

    op.create_table(
        "session_receipts",
        sa.Column("session_id", sa.Integer(), primary_key=True),
        sa.Column("player_user_id", sa.Integer(), primary_key=True),
        sa.Column("viewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["session_id"], ["sessions.id"], name="fk_session_receipts_session_id"
        ),
        sa.ForeignKeyConstraint(
            ["player_user_id"], ["users.id"], name="fk_session_receipts_player_user_id"
        ),
    )


def downgrade() -> None:
    op.drop_table("session_receipts")
    op.drop_index("ix_session_items_session_id", table_name="session_items")
    op.drop_table("session_items")
    op.drop_index("ix_sessions_team_id", table_name="sessions")
    op.drop_table("sessions")

    op.drop_index("ix_boards_team_id", table_name="boards")
    op.drop_table("boards")
    op.drop_index("ix_saved_patterns_team_id", table_name="saved_patterns")
    op.drop_table("saved_patterns")

    op.drop_index(
        "ix_playstyle_suggestions_player_id", table_name="playstyle_suggestions"
    )
    op.drop_index("ix_playstyle_suggestions_team_id", table_name="playstyle_suggestions")
    op.drop_table("playstyle_suggestions")
    op.drop_table("player_attributes")
    op.drop_index("ix_players_team_id", table_name="players")
    op.drop_table("players")

    op.drop_index("ix_identities_code", table_name="identities")
    op.drop_table("identities")
    op.drop_table("rondo_zones")
    op.drop_table("formation_keystones")
    op.drop_table("formations")

    op.drop_index("ix_library_items_code", table_name="library_items")
    op.drop_table("library_items")

    op.drop_table("role_clashes")
    op.drop_table("role_synergies")
    op.drop_index("ix_roles_position_code", table_name="roles")
    op.drop_table("roles")
    op.drop_table("position_codes")
