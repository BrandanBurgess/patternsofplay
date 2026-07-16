"""SQLAlchemy models, split by doc 03 section so each ticket's slice is
independently readable:

  platform.py       section 2  tenancy: User, Team, TeamMember (T-003)
  roster.py         section 3  roster/players + role taxonomy (T-004)
  library.py        section 4  library_items: patterns/deliveries/rotations (T-004)
  formations.py      section 5  formations, keystones, rondo zones, identities (T-004)
  team_content.py    section 4.2/4.3  saved_patterns, boards (T-004)
  sessions.py        section 6  sessions, session_items, session_receipts (T-004)

Every name is re-exported here so callers keep writing
`from app.models import X` (T-003 routers and deps already do this), and
so `import app.models` (alembic env.py, tests/conftest.py) registers every
table on Base.metadata regardless of which submodule defines it.
"""

from app.models.formations import Formation, FormationKeystone, Identity, RondoZone
from app.models.library import LibraryItem
from app.models.platform import Team, TeamMember, User
from app.models.roster import (
    Player,
    PlayerAttribute,
    PlaystyleSuggestion,
    PositionCode,
    Role,
    RoleClash,
    RoleSynergy,
)
from app.models.sessions import SessionItem, SessionReceipt, TrainingSession
from app.models.team_content import Board, SavedPattern

__all__ = [
    "Team",
    "TeamMember",
    "User",
    "Player",
    "PlayerAttribute",
    "PlaystyleSuggestion",
    "PositionCode",
    "Role",
    "RoleClash",
    "RoleSynergy",
    "LibraryItem",
    "Formation",
    "FormationKeystone",
    "Identity",
    "RondoZone",
    "SavedPattern",
    "Board",
    "TrainingSession",
    "SessionItem",
    "SessionReceipt",
]
