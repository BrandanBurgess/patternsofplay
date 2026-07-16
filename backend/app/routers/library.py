"""Library content: patterns, deliveries, rotations (doc 03 section 4;
Brief step 17; the Patterns page's three browsable libraries). Read-only
to every team member (coach and player alike, README roles table: "Pattern
library... Full (view + play)"), so this only requires an authenticated
user, not a team scope: LibraryItem carries no team_id (library world,
app/models/library.py), and CLAUDE.md rule 4 only requires the scoped
query layer for TEAM data.
"""

from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db
from app.models import LibraryItem, User
from app.schemas import LibraryItemOut

router = APIRouter(prefix="/api", tags=["library"])

ItemType = Literal["pattern", "delivery", "rotation"]


@router.get("/library/items", response_model=list[LibraryItemOut])
def list_library_items(
    item_type: ItemType | None = Query(default=None),
    _current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[LibraryItem]:
    query = db.query(LibraryItem)
    if item_type is not None:
        query = query.filter(LibraryItem.item_type == item_type)
    return query.order_by(LibraryItem.item_type, LibraryItem.code).all()
