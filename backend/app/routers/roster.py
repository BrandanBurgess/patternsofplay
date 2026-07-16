"""Roster page routes (doc 03 section 3, Bible sections 1-2; Brief step 19;
T-033). Every route depends on get_team_scope (or require_role_on_team,
itself resolved through get_current_membership): team_id always comes from
the caller's own membership, never a client-supplied field (CLAUDE.md rule
4). Create/update/delete are coach-only, API-enforced (CLAUDE.md rule 5 /
README roles table: "View-only sliders/work rates" for players, no CRUD
control renders, and the API 403s a player token that calls one anyway,
not just hides the button).

The double-exposure fit warning (doc 03 section 3, role_clashes table,
code 'double_exposure_flank') is computed here, server-side, from the
team's own roster + the seeded warning copy, and is included ONLY in the
coach response model (CoachRosterOut). A player-role GET /api/roster
returns RosterOut, a model with no fit_warnings field at all: response_model
is set to None on that route and the handler returns an already-serialized
model_dump(), so FastAPI never has a chance to backfill or coerce a field
onto the wire that the handler did not put there itself (CLAUDE.md rule 5:
coach-only data "never appears in player-role payloads").
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.deps import CurrentMembership, get_current_membership, get_db, require_role_on_team
from app.models import Player, PlayerAttribute, Role, RoleClash
from app.schemas import (
    ATTRIBUTE_KEYS,
    CoachRosterOut,
    FitWarningOut,
    PlayerAttributesIn,
    PlayerOut,
    PlayerWriteRequest,
    RoleCatalogOut,
    RosterOut,
)
from app.scoped import TeamScope, get_team_scope

router = APIRouter(prefix="/api/roster", tags=["roster"])

# Position codes doc 03 section 3's double-exposure rule names explicitly:
# "the wide player" (W) and "the fullback or wingback behind them" (FB/WB).
# Role-agnostic on purpose: the rule is stated in terms of position_code +
# awr/dwr, not any single named role, so it fires for any winger-shaped W
# role (touchline_winger, inside_forward, wide_forward, raumdeuter) paired
# with any FB/WB behind them on the same flank.
_WIDE_POSITION = "W"
_BACK_POSITIONS = ("FB", "WB")
_DOUBLE_EXPOSURE_CODE = "double_exposure_flank"


def _attrs_to_schema(values: dict[str, int]) -> PlayerAttributesIn:
    # Every player always carries all six keys (created/updated together
    # below), so a missing key here would mean a data-integrity bug, not a
    # legitimately partial player; fail loudly rather than guessing a
    # default that would mask it.
    return PlayerAttributesIn(**{key: values[key] for key in ATTRIBUTE_KEYS})


def _player_to_out(
    player: Player,
    attrs: dict[str, int],
    role_map: dict[str, Role],
    caller_user_id: int,
) -> PlayerOut:
    role = role_map.get(player.role_code) if player.role_code else None
    return PlayerOut(
        id=player.id,
        name=player.name,
        jersey_number=player.jersey_number,
        preferred_foot=player.preferred_foot,  # type: ignore[arg-type]
        position_code=player.position_code,
        role_code=player.role_code,
        role_name=role.name if role else None,
        role_description=role.description if role else None,
        flank=player.flank,  # type: ignore[arg-type]
        awr=player.awr,  # type: ignore[arg-type]
        dwr=player.dwr,  # type: ignore[arg-type]
        attributes=_attrs_to_schema(attrs),
        is_you=player.user_id is not None and player.user_id == caller_user_id,
    )


def _compute_fit_warnings(players: list[Player], clash: RoleClash | None) -> list[FitWarningOut]:
    """Doc 03 section 3: "a roster flank where the wide player has AWR high
    and DWR low, and the fullback or wingback behind them on the same side
    has AWR high, raises double_exposure_flank with the Bible's warning
    copy." Reads the warning copy from the seeded role_clashes row rather
    than hardcoding it (Brief section 7: "content is data, not code")."""
    if clash is None:
        return []

    warnings: list[FitWarningOut] = []
    for flank in ("left", "right"):  # "on the same side": center has no side to double-expose
        wide_players = [
            p
            for p in players
            if p.flank == flank and p.position_code == _WIDE_POSITION and p.awr == "high" and p.dwr == "low"
        ]
        back_players = [
            p
            for p in players
            if p.flank == flank and p.position_code in _BACK_POSITIONS and p.awr == "high"
        ]
        for wide in wide_players:
            for back in back_players:
                warnings.append(
                    FitWarningOut(
                        code=clash.code,
                        name=clash.name,
                        flank=flank,  # type: ignore[arg-type]
                        message=clash.warning_copy,
                        wide_player_id=wide.id,
                        wide_player_name=wide.name,
                        back_player_id=back.id,
                        back_player_name=back.name,
                    )
                )
    return warnings


def _attrs_by_player(scope: TeamScope) -> dict[int, dict[str, int]]:
    rows = scope.query_via(
        PlayerAttribute, Player, PlayerAttribute.player_id == Player.id
    ).all()
    by_player: dict[int, dict[str, int]] = {}
    for row in rows:
        by_player.setdefault(row.player_id, {})[row.attribute_key] = row.value
    return by_player


def _role_map(db: Session) -> dict[str, Role]:
    return {r.code: r for r in db.query(Role).all()}


def _upsert_attributes(db: Session, player_id: int, attrs: PlayerAttributesIn) -> None:
    # PlayerAttribute has no team_id column of its own (doc 03 section 3;
    # app/scoped.py TeamScope.add() rejects it for exactly this reason), so
    # this writes through the plain db session already scoped to the right
    # player by construction: player_id here always comes from a Player row
    # the caller obtained via scope.get()/scope.query() first.
    existing = {
        row.attribute_key: row
        for row in db.query(PlayerAttribute).filter(PlayerAttribute.player_id == player_id).all()
    }
    for key in ATTRIBUTE_KEYS:
        value = getattr(attrs, key)
        if key in existing:
            existing[key].value = value
        else:
            db.add(PlayerAttribute(player_id=player_id, attribute_key=key, value=value))


# ---------------------------------------------------------------------------
# Role catalog: library content, read-only, both roles (doc 03 section 3
# taxonomy tables). No team scoping: this is global seeded data, same as
# patterns/formations/identities.
# ---------------------------------------------------------------------------


@router.get("/roles", response_model=list[RoleCatalogOut])
def list_roles(
    ctx: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> list[Role]:
    return db.query(Role).order_by(Role.position_code, Role.name).all()


# ---------------------------------------------------------------------------
# Roster: team-scoped player list. response_model=None on the GET route
# (see module docstring): the handler always returns a manually-built,
# already-serialized dict so a player payload has no fit_warnings key at
# all, not a null/empty one.
# ---------------------------------------------------------------------------


@router.get("", response_model=None)
def get_roster(
    ctx: CurrentMembership = Depends(get_current_membership),
    scope: TeamScope = Depends(get_team_scope),
    db: Session = Depends(get_db),
) -> dict:
    players = scope.query(Player).order_by(Player.jersey_number.asc().nulls_last()).all()
    attrs_by_player = _attrs_by_player(scope)
    roles = _role_map(db)
    player_outs = [
        _player_to_out(p, attrs_by_player.get(p.id, {}), roles, ctx.user.id) for p in players
    ]

    if ctx.role_on_team != "coach":
        # Player payload: RosterOut has no fit_warnings field, period.
        return RosterOut(players=player_outs).model_dump(mode="json")

    clash = (
        db.query(RoleClash)
        .filter(RoleClash.code == _DOUBLE_EXPOSURE_CODE, RoleClash.is_active_mvp.is_(True))
        .first()
    )
    warnings = _compute_fit_warnings(players, clash)
    return CoachRosterOut(players=player_outs, fit_warnings=warnings).model_dump(mode="json")


# ---------------------------------------------------------------------------
# Player CRUD: coach-only (README roles table: Roster is "Full, plus fit
# warnings and suggestion review" for coaches, "View-only" for players; no
# create/edit/delete control renders for a player, and require_role_on_team
# enforces the same thing server-side independent of the UI).
# ---------------------------------------------------------------------------


@router.post("/players", response_model=PlayerOut, status_code=status.HTTP_201_CREATED)
def create_player(
    payload: PlayerWriteRequest,
    ctx: CurrentMembership = Depends(require_role_on_team("coach")),
    scope: TeamScope = Depends(get_team_scope),
    db: Session = Depends(get_db),
) -> PlayerOut:
    roles = _role_map(db)
    role = roles.get(payload.role_code) if payload.role_code else None
    if payload.role_code and role is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown role_code")

    player = Player(
        user_id=None,
        name=payload.name,
        jersey_number=payload.jersey_number,
        preferred_foot=payload.preferred_foot,
        position_line=role.name if role else None,
        position_code=role.position_code if role else None,
        role_code=payload.role_code,
        awr=payload.awr,
        dwr=payload.dwr,
        flank=payload.flank,
    )
    scope.add(player)
    scope.flush()  # assigns player.id for the attribute rows below
    _upsert_attributes(db, player.id, payload.attributes)
    scope.commit()
    scope.refresh(player)

    return _player_to_out(player, payload.attributes.model_dump(), roles, ctx.user.id)


@router.put("/players/{player_id}", response_model=PlayerOut)
def update_player(
    player_id: int,
    payload: PlayerWriteRequest,
    ctx: CurrentMembership = Depends(require_role_on_team("coach")),
    scope: TeamScope = Depends(get_team_scope),
    db: Session = Depends(get_db),
) -> PlayerOut:
    player = scope.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")

    roles = _role_map(db)
    role = roles.get(payload.role_code) if payload.role_code else None
    if payload.role_code and role is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown role_code")

    player.name = payload.name
    player.jersey_number = payload.jersey_number
    player.preferred_foot = payload.preferred_foot
    player.position_line = role.name if role else None
    player.position_code = role.position_code if role else None
    player.role_code = payload.role_code
    player.awr = payload.awr
    player.dwr = payload.dwr
    player.flank = payload.flank

    _upsert_attributes(db, player.id, payload.attributes)
    scope.commit()
    scope.refresh(player)

    return _player_to_out(player, payload.attributes.model_dump(), roles, ctx.user.id)


@router.delete("/players/{player_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_player(
    player_id: int,
    ctx: CurrentMembership = Depends(require_role_on_team("coach")),
    scope: TeamScope = Depends(get_team_scope),
    db: Session = Depends(get_db),
) -> None:
    player = scope.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")
    # Attribute rows scope transitively through this player and have no
    # delete cascade at the DB level in this build, so clear them first.
    db.query(PlayerAttribute).filter(PlayerAttribute.player_id == player_id).delete()
    scope.delete(player)
    scope.commit()
