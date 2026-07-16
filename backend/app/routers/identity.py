"""Identities: reference teams, style archetypes, cult corner (doc 03
section 5; Brief step 20; the Identity page's three browsable segments).
Read-only to every team member (coach and player alike, README roles
table: "Pattern library, formations, identity... Full (view + play)"), so
this only requires an authenticated user, not a team scope: Identity
carries no team_id (app/models/formations.py), and CLAUDE.md rule 4 only
requires the scoped query layer for TEAM data. Mirrors
app/routers/library.py's shape exactly.
"""

from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db
from app.models import Identity, User
from app.schemas import IdentityOut

router = APIRouter(prefix="/api", tags=["identities"])

IdentityKind = Literal["reference_team", "style_archetype", "cult_card"]


@router.get("/identities", response_model=list[IdentityOut])
def list_identities(
    kind: IdentityKind | None = Query(default=None),
    _current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Identity]:
    query = db.query(Identity)
    if kind is not None:
        query = query.filter(Identity.kind == kind)
    return query.order_by(Identity.kind, Identity.code).all()
