"""The scoped query layer (CLAUDE.md rule 4, doc 03 section 2, doc 04
section 2): "All access goes through a scoped query layer; route handlers
never filter by team manually" and "Enforce scoping in one query layer,
not in route handlers."

TeamScope is that one layer. It is built from get_current_membership (the
same auth dependency doc 04 section 1 requires on every route), so its
team_id always comes from the caller's own resolved membership, never from
a client-supplied parameter. A route that depends on get_team_scope
instead of get_db + a team_id argument has no path by which a client
could name another team's id, because there is no such argument.

Two scoping shapes exist per doc 03:
  - Direct: the table carries team_id itself (players, playstyle_suggestions,
    saved_patterns, boards, sessions). Use .query() / .get() / .add().
  - Transitive: the table has no team_id column and scopes through a
    parent FK instead (player_attributes -> players, session_items and
    session_receipts -> sessions). Use .query_via().
This mirrors doc 03's own column lists exactly rather than adding a
team_id doc 03 does not list on those child tables.
"""

from typing import Any, TypeVar

from fastapi import Depends
from sqlalchemy.orm import Query, Session

from app.deps import CurrentMembership, get_current_membership, get_db

ModelT = TypeVar("ModelT")


class TeamScope:
    """Bound to one request's authenticated team_id. Construct via the
    get_team_scope FastAPI dependency, not directly, so team_id always
    traces back to get_current_membership."""

    __slots__ = ("_db", "team_id")

    def __init__(self, db: Session, team_id: int) -> None:
        self._db = db
        self.team_id = team_id

    def query(self, model: type[ModelT]) -> "Query[ModelT]":
        """Scoped query for a table that carries team_id directly. Raises
        TypeError at call time (not silently) if `model` has no team_id
        column, since that means the caller wants query_via instead."""
        team_id_col = getattr(model, "team_id", None)
        if team_id_col is None:
            raise TypeError(
                f"{model.__name__} has no team_id column; use query_via() for "
                "tables that scope transitively through a parent FK"
            )
        return self._db.query(model).filter(team_id_col == self.team_id)

    def query_via(
        self, model: type[ModelT], parent: type[Any], join_condition: Any
    ) -> "Query[ModelT]":
        """Scoped query for a table with no team_id of its own
        (player_attributes, session_items, session_receipts per doc 03),
        joined through its parent to that parent's team_id.

        Example: scope.query_via(PlayerAttribute, Player, PlayerAttribute.player_id == Player.id)
        """
        parent_team_id = getattr(parent, "team_id", None)
        if parent_team_id is None:
            raise TypeError(f"{parent.__name__} has no team_id column to scope through")
        return self._db.query(model).join(parent, join_condition).filter(
            parent_team_id == self.team_id
        )

    def get(self, model: type[ModelT], id_: Any) -> ModelT | None:
        """Scoped get-by-id for a directly-scoped table. Returns None (not
        another team's row, not an error) if `id_` exists but belongs to a
        different team, which is exactly the cross-team-read-returns-
        nothing behavior the Platform DoD requires."""
        id_col = getattr(model, "id", None)
        if id_col is None:
            raise TypeError(f"{model.__name__} has no id column; filter query() directly instead")
        return self.query(model).filter(id_col == id_).first()

    def add(self, obj: ModelT) -> ModelT:
        """Stamps team_id from this scope onto a new row, overwriting
        anything the caller may have set, then stages it on the session
        (caller still commits). This is the enforcement point for CLAUDE.md
        rule 4's "client input never supplies team_id": whatever a request
        body's team_id field might contain, if any, this always wins."""
        if not hasattr(obj, "team_id"):
            raise TypeError(
                f"{type(obj).__name__} has no team_id; for a transitively-scoped "
                "row (e.g. PlayerAttribute), stamp/verify the parent instead and "
                "add() this row via the plain db session"
            )
        obj.team_id = self.team_id  # type: ignore[attr-defined]
        self._db.add(obj)
        return obj

    def commit(self) -> None:
        self._db.commit()

    def flush(self) -> None:
        self._db.flush()

    def refresh(self, obj: Any) -> None:
        self._db.refresh(obj)


def get_team_scope(
    ctx: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> TeamScope:
    """FastAPI dependency: the only supported way to obtain a TeamScope.
    team_id comes from ctx (itself resolved from the session cookie by
    get_current_membership), never from a route parameter, so no router
    built on top of this can be tricked into reading or writing another
    team's rows by a client-supplied id (CLAUDE.md rule 4)."""
    return TeamScope(db=db, team_id=ctx.team.id)
