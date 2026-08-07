"""Tactics Lab API (Epic T-100, doc 06 sections 3.2, 5.3, 6; T-108):
formation phases, formation matchups, rotations, position archetypes, the
coach-only archetype suggestion ranking, and a team's own saved formation
setups (team_formations / team_formation_slots).

Two worlds, same split doc 06 section 3 draws and app/models/tactics.py
already documents:
  - library world (FormationPhase, RotationSystem, PositionArchetype,
    FormationMatchup): no team_id, seeded by T-102/T-103 (empty today),
    read-only, visible to BOTH roles, same shape as app/routers/formations.py
    and app/routers/identity.py (get_current_user, not a team scope).
  - team world (TeamFormation direct team_id, TeamFormationSlot transitive
    through team_formation_id): every route depends on get_team_scope,
    never a client-supplied team_id (CLAUDE.md rule 4). Reads are open to
    both roles (roster.py precedent: full roster data is player-viewable,
    only the fit-warning-shaped analysis is coach-only); writes
    (create/update) are coach-only (require_role_on_team("coach")).

Coach-only surface (doc 06 section 5.3): GET /api/archetypes/suggest is
the one route that carries footedness notes, attribute-fit reasons, and
work-rate matching, "the why must cite the actual reason ..., not a
score" -- all of it 403s for a player token, tested in
tests/test_tactics_routes.py per this module's own docstring below the
route.

The scope gap T-108 flagged here (doc 06 never says which of a
formation's eleven slots belong to which unit_balance_rules.unit) is
closed by T-110: `slot_family` is now seeded per slot on
seeds/formations.json, and app/units.py holds the fixed
slot_family-to-unit crosswalk plus the evaluator. POST
/api/formations/{code}/balance below is the coach-only surface for it.
GET /api/archetypes/suggest still ranks on three criteria rather than
four: doc 06 section 5.3's fourth criterion asks whether "the RESULTING
unit passes its balance rules", which needs the other ten slots' current
picks, and that route takes a single slot_family and no formation
context. The balance route evaluates the whole eleven at once instead,
which is how the panel actually uses it (section 5.3: "evaluates
unit_balance_rules live as archetypes change").
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.deps import (
    CurrentMembership,
    get_current_membership,
    get_current_user,
    get_db,
    require_role_on_team,
)
from app.models import (
    Formation,
    FormationMatchup,
    FormationPhase,
    Player,
    PlayerAttribute,
    PositionArchetype,
    RotationSystem,
    TeamFormation,
    TeamFormationSlot,
    UnitBalanceRule,
    User,
)
from app.schemas import (
    ArchetypeSuggestionOut,
    ArchetypeSuggestResponse,
    Flank,
    FormationMatchupOut,
    FormationMatchupResponse,
    FormationPhaseOut,
    PositionArchetypeOut,
    RotationSystemOut,
    TeamFormationOut,
    TeamFormationSlotOut,
    TeamFormationWriteRequest,
    UnitBalanceNoteOut,
    UnitBalanceRequest,
    UnitBalanceResponse,
    UnitBalanceUnitOut,
)
from app.scoped import TeamScope, get_team_scope
from app.units import evaluate_unit_balance, units_absent

router = APIRouter(prefix="/api", tags=["tactics"])

# Same fixed-order-for-determinism convention as app/routers/formations.py's
# FORMATION_ORDER/ZONE_ORDER: these vocabularies are doc 06 section 3.1's own
# enumerations, not alphabetized, so a listing reads in the doc's own order
# rather than whatever order sqlite happens to return rows in.
PHASE_ORDER = ("in_possession", "out_of_possession", "rest_defence", "transition")
FAMILY_ORDER = ("first_line", "pivot", "wide", "front_line")


def _order_index(value: str, order: tuple[str, ...]) -> int:
    try:
        return order.index(value)
    except ValueError:
        return len(order)


# ---------------------------------------------------------------------------
# Library world: phases, matchups, rotations, archetypes. Read-only, both
# roles, no team scope (same reasoning as app/routers/formations.py /
# identity.py / library.py: these tables carry no team_id at all).
# ---------------------------------------------------------------------------


@router.get("/formations/{code}/phases", response_model=list[FormationPhaseOut])
def list_formation_phases(
    code: str,
    _current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[FormationPhase]:
    if db.get(Formation, code) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Formation not found")
    phases = db.query(FormationPhase).filter(FormationPhase.formation_code == code).all()
    phases.sort(key=lambda p: (_order_index(p.phase, PHASE_ORDER), p.variant_code))
    return phases


@router.get("/formations/matchup", response_model=FormationMatchupResponse)
def get_formation_matchup(
    ours: str = Query(...),
    theirs: str = Query(...),
    _current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FormationMatchupResponse:
    if db.get(Formation, ours) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Formation not found: " + ours)
    if db.get(Formation, theirs) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Formation not found: " + theirs)

    # formation_matchups' natural key is normalised (ours_code <=
    # theirs_code) at seed time to store one row per UNORDERED pair (doc 06
    # section 3.1: 15 pairs for 6 formations, not 30), so a query in either
    # order must resolve to the same row.
    row = (
        db.query(FormationMatchup)
        .filter(
            (
                (FormationMatchup.ours_code == ours)
                & (FormationMatchup.theirs_code == theirs)
            )
            | (
                (FormationMatchup.ours_code == theirs)
                & (FormationMatchup.theirs_code == ours)
            )
        )
        .first()
    )
    # No swap of our_edges/their_edges/route when the query order is the
    # reverse of how the pair was seeded: only one direction's route text
    # is authored per pair, and presenting it as the other side's own read
    # would misattribute a narrative nobody wrote (see module docstring).
    return FormationMatchupResponse(
        ours_code=ours,
        theirs_code=theirs,
        matchup=FormationMatchupOut.model_validate(row) if row is not None else None,
    )


@router.get("/rotations", response_model=list[RotationSystemOut])
def list_rotations(
    formation_code: str | None = Query(default=None),
    _current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RotationSystem]:
    rotations = db.query(RotationSystem).all()
    if formation_code is not None:
        rotations = [r for r in rotations if formation_code in r.applies_to_formations]
    rotations.sort(key=lambda r: (_order_index(r.family, FAMILY_ORDER), r.name))
    return rotations


@router.get("/archetypes", response_model=list[PositionArchetypeOut])
def list_archetypes(
    slot_family: str | None = Query(default=None),
    _current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PositionArchetype]:
    query = db.query(PositionArchetype)
    if slot_family is not None:
        query = query.filter(PositionArchetype.slot_family == slot_family)
    return query.order_by(PositionArchetype.slot_family, PositionArchetype.name).all()


# ---------------------------------------------------------------------------
# Archetype suggestion ranking (doc 06 section 5.3), coach-only.
# ---------------------------------------------------------------------------


def _label(attribute_key: str) -> str:
    return attribute_key.replace("_", " ")


def _attribute_reasons(attrs: dict[str, int], key_attribute_keys: list[str]) -> list[str]:
    """Top two of the archetype's key attributes the player actually has a
    rated value for, highest value first, ties broken by the archetype's
    own key order. Cites the real value, never a computed score (doc 06
    section 5.3)."""
    pairs = [(key, attrs[key]) for key in key_attribute_keys if key in attrs]
    pairs.sort(key=lambda kv: (-kv[1], key_attribute_keys.index(kv[0])))
    return [f"{_label(key)} {value}" for key, value in pairs[:2]]


def _foot_fits(preferred_foot: str, side: str | None, foot_hint: str | None) -> bool | None:
    """None means "not applicable" (no foot_hint on the archetype, no side
    to check against, or a central slot with no side at all): doc 06
    section 5.3's "foot fit against foot_hint and the slot's side"."""
    if foot_hint is None or side is None or side == "center":
        return None
    if preferred_foot == "B":
        return True
    same_side = (side == "left" and preferred_foot == "L") or (
        side == "right" and preferred_foot == "R"
    )
    if foot_hint == "same_side":
        return same_side
    if foot_hint == "opposite_side":
        return not same_side
    return True  # 'either'


def _build_why(
    attrs: dict[str, int], archetype: PositionArchetype, foot_fit: bool | None, wr_match: int
) -> str:
    clauses: list[str] = []
    reasons = _attribute_reasons(attrs, archetype.key_attribute_keys)
    name_lower = archetype.name.lower()
    if len(reasons) >= 2:
        clauses.append(f"{reasons[0]} and {reasons[1]} fit the {name_lower}")
    elif len(reasons) == 1:
        clauses.append(f"{reasons[0]} fits the {name_lower}")

    if foot_fit is True and archetype.foot_hint in ("same_side", "opposite_side"):
        side_word = "same side" if archetype.foot_hint == "same_side" else "opposite side"
        clauses.append(f"footedness on the {side_word} suits this slot")

    if wr_match == 2:
        clauses.append("work rate matches the role both ways")

    if not clauses:
        clauses.append(f"the closest available fit for the {archetype.slot_family} slot")
    return ", ".join(clauses)


def _player_attrs(scope: TeamScope, player_id: int) -> dict[str, int]:
    rows = (
        scope.query_via(PlayerAttribute, Player, PlayerAttribute.player_id == Player.id)
        .filter(PlayerAttribute.player_id == player_id)
        .all()
    )
    return {row.attribute_key: row.value for row in rows}


@router.get("/archetypes/suggest", response_model=ArchetypeSuggestResponse)
def suggest_archetypes(
    slot_family: str = Query(...),
    player_id: int | None = Query(default=None),
    side: Flank | None = Query(default=None),
    ctx: CurrentMembership = Depends(require_role_on_team("coach")),
    scope: TeamScope = Depends(get_team_scope),
    db: Session = Depends(get_db),
) -> ArchetypeSuggestResponse:
    candidates = (
        db.query(PositionArchetype).filter(PositionArchetype.slot_family == slot_family).all()
    )
    if not candidates:
        return ArchetypeSuggestResponse(slot_family=slot_family, player_id=player_id, suggestions=[])

    if player_id is None:
        # Empty roster / no player assigned yet is a first-class state (doc
        # 06 section 5.3: "the panel still works with archetypes alone and
        # no players assigned"), so this still returns a usable top three,
        # just without an attribute-fit why.
        top = sorted(candidates, key=lambda a: a.name)[:3]
        suggestions = [
            ArchetypeSuggestionOut(
                archetype_code=a.code,
                archetype_name=a.name,
                slot_family=a.slot_family,
                why=f"No player assigned yet; a starting option for the {slot_family} slot.",
            )
            for a in top
        ]
        return ArchetypeSuggestResponse(
            slot_family=slot_family, player_id=None, suggestions=suggestions
        )

    player = scope.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")

    attrs = _player_attrs(scope, player_id)
    effective_side = side if side is not None else player.flank

    ranked: list[tuple[int, int, int, PositionArchetype, bool | None]] = []
    for archetype in candidates:
        attribute_score = sum(attrs.get(key, 0) for key in archetype.key_attribute_keys)
        foot_fit = _foot_fits(player.preferred_foot, effective_side, archetype.foot_hint)
        wr_match = (player.awr == archetype.awr_default) + (player.dwr == archetype.dwr_default)
        ranked.append((attribute_score, 1 if foot_fit else 0, wr_match, archetype, foot_fit))

    # doc 06 section 5.3's ranking order, in priority: attribute fit, then
    # foot fit, then AWR/DWR match; archetype name breaks any remaining tie
    # so the result is deterministic.
    ranked.sort(key=lambda r: (-r[0], -r[1], -r[2], r[3].name))

    suggestions = [
        ArchetypeSuggestionOut(
            archetype_code=archetype.code,
            archetype_name=archetype.name,
            slot_family=archetype.slot_family,
            why=_build_why(attrs, archetype, foot_fit, wr_match),
        )
        for _score, _foot, wr_match, archetype, foot_fit in ranked[:3]
    ]
    return ArchetypeSuggestResponse(slot_family=slot_family, player_id=player_id, suggestions=suggestions)


# ---------------------------------------------------------------------------
# Unit balance evaluation (doc 06 sections 2.6 / 3.1 / 5.3), coach-only.
# ---------------------------------------------------------------------------


@router.post("/formations/{code}/balance", response_model=UnitBalanceResponse)
def evaluate_balance(
    code: str,
    payload: UnitBalanceRequest,
    ctx: CurrentMembership = Depends(require_role_on_team("coach")),
    db: Session = Depends(get_db),
) -> UnitBalanceResponse:
    """Evaluate the seeded unit_balance_rules against one formation's
    current archetype picks.

    POST rather than GET because doc 06 section 5.3 evaluates this "live as
    archetypes change", against the personnel panel's UNSAVED state: the
    eleven picks are the input and there is no saved row to name yet. It
    computes and persists nothing, and touches no team-world table, so
    there is no scoped query here to make; `require_role_on_team("coach")`
    is what resolves the caller's team, and no team_id ever comes off the
    request (CLAUDE.md rule 4).

    Coach-only: doc 06 section 5.3 says unit balance is coach-only "both in
    the UI and at the API", the same standing as roster fit warnings, so a
    player token gets 403 here rather than an empty list
    (tests/test_permissions.py and tests/test_tactics_routes.py).
    """
    formation = db.get(Formation, code)
    if formation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Formation not found")

    positions = formation.positions_json or []
    known_slots = {p.get("slot") for p in positions}
    assignments: dict[str, str | None] = {}
    for slot_in in payload.slots:
        if slot_in.slot not in known_slots:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Slot '{slot_in.slot}' is not part of formation {code}",
            )
        assignments[slot_in.slot] = slot_in.archetype_code

    codes = [c for c in assignments.values() if c is not None]
    archetypes = {
        a.code: a
        for a in (
            db.query(PositionArchetype).filter(PositionArchetype.code.in_(codes)).all()
            if codes
            else []
        )
    }
    unknown = sorted(set(codes) - set(archetypes))
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown archetype_code: {unknown[0]}",
        )

    rules = db.query(UnitBalanceRule).order_by(UnitBalanceRule.code).all()
    evaluations = evaluate_unit_balance(positions, assignments, archetypes, rules)

    return UnitBalanceResponse(
        formation_code=code,
        units=[
            UnitBalanceUnitOut(
                unit=e.unit,
                flank=e.flank,
                slots=list(e.slots),
                assigned_slots=list(e.assigned_slots),
                is_complete=e.is_complete,
                notes=[
                    UnitBalanceNoteOut(
                        code=n.code,
                        unit=n.unit,
                        flank=n.flank,
                        severity=n.severity,  # type: ignore[arg-type]
                        message=n.message,
                        slots=list(n.slots),
                    )
                    for n in e.notes
                ],
            )
            for e in evaluations
        ],
        units_not_evaluated=units_absent(positions),
    )


# ---------------------------------------------------------------------------
# Team world: a coach's own saved formation setups (doc 06 section 3.2).
# Reads open to both roles (roster.py precedent: the roster itself is
# player-viewable; only the analysis layer is coach-only); create/update
# are coach-only.
# ---------------------------------------------------------------------------


def _slot_to_out(slot: TeamFormationSlot, players: dict[int, Player], archetypes: dict[str, PositionArchetype]) -> TeamFormationSlotOut:
    player = players.get(slot.player_id) if slot.player_id is not None else None
    archetype = archetypes.get(slot.archetype_code) if slot.archetype_code is not None else None
    return TeamFormationSlotOut(
        slot=slot.slot,
        player_id=slot.player_id,
        player_name=player.name if player is not None else None,
        archetype_code=slot.archetype_code,
        archetype_name=archetype.name if archetype is not None else None,
        qualitative_edge=slot.qualitative_edge,
    )


def _team_formation_to_out(scope: TeamScope, db: Session, formation: TeamFormation) -> TeamFormationOut:
    slots = (
        scope.query_via(
            TeamFormationSlot, TeamFormation, TeamFormationSlot.team_formation_id == TeamFormation.id
        )
        .filter(TeamFormationSlot.team_formation_id == formation.id)
        .all()
    )
    player_ids = [s.player_id for s in slots if s.player_id is not None]
    players = {p.id: p for p in (scope.query(Player).filter(Player.id.in_(player_ids)).all() if player_ids else [])}
    archetype_codes = [s.archetype_code for s in slots if s.archetype_code is not None]
    archetypes = {
        a.code: a
        for a in (
            db.query(PositionArchetype).filter(PositionArchetype.code.in_(archetype_codes)).all()
            if archetype_codes
            else []
        )
    }
    return TeamFormationOut(
        id=formation.id,
        name=formation.name,
        base_formation_code=formation.base_formation_code,
        active_phase_variant=formation.active_phase_variant,
        opponent_formation_code=formation.opponent_formation_code,
        opponent_phase_variant=formation.opponent_phase_variant,
        created_by_user_id=formation.created_by_user_id,
        created_at=formation.created_at,
        slots=[_slot_to_out(s, players, archetypes) for s in slots],
    )


def _validate_write(db: Session, scope: TeamScope, payload: TeamFormationWriteRequest) -> None:
    if db.get(Formation, payload.base_formation_code) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unknown base_formation_code",
        )
    if payload.opponent_formation_code is not None and db.get(Formation, payload.opponent_formation_code) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unknown opponent_formation_code",
        )
    seen_slots: set[str] = set()
    for slot_in in payload.slots:
        if slot_in.slot in seen_slots:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Duplicate slot in request: {slot_in.slot}",
            )
        seen_slots.add(slot_in.slot)
        if slot_in.player_id is not None and scope.get(Player, slot_in.player_id) is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown player_id for slot {slot_in.slot}",
            )
        if slot_in.archetype_code is not None and db.get(PositionArchetype, slot_in.archetype_code) is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown archetype_code for slot {slot_in.slot}",
            )


@router.get("/team-formations", response_model=list[TeamFormationOut])
def list_team_formations(
    ctx: CurrentMembership = Depends(get_current_membership),
    scope: TeamScope = Depends(get_team_scope),
    db: Session = Depends(get_db),
) -> list[TeamFormationOut]:
    formations = scope.query(TeamFormation).order_by(TeamFormation.created_at.desc()).all()
    return [_team_formation_to_out(scope, db, f) for f in formations]


@router.get("/team-formations/{team_formation_id}", response_model=TeamFormationOut)
def get_team_formation(
    team_formation_id: int,
    ctx: CurrentMembership = Depends(get_current_membership),
    scope: TeamScope = Depends(get_team_scope),
    db: Session = Depends(get_db),
) -> TeamFormationOut:
    formation = scope.get(TeamFormation, team_formation_id)
    if formation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team formation not found")
    return _team_formation_to_out(scope, db, formation)


@router.post("/team-formations", response_model=TeamFormationOut, status_code=status.HTTP_201_CREATED)
def create_team_formation(
    payload: TeamFormationWriteRequest,
    ctx: CurrentMembership = Depends(require_role_on_team("coach")),
    scope: TeamScope = Depends(get_team_scope),
    db: Session = Depends(get_db),
) -> TeamFormationOut:
    _validate_write(db, scope, payload)

    formation = TeamFormation(
        name=payload.name,
        base_formation_code=payload.base_formation_code,
        active_phase_variant=payload.active_phase_variant,
        opponent_formation_code=payload.opponent_formation_code,
        opponent_phase_variant=payload.opponent_phase_variant,
        created_by_user_id=ctx.user.id,
    )
    scope.add(formation)
    scope.flush()  # assigns formation.id for the slot rows below

    # TeamFormationSlot has no team_id of its own (doc 06 section 3.2), so
    # it is written through the plain db session once its PARENT row has
    # been stamped by scope.add() above (app/scoped.py add() docstring).
    for slot_in in payload.slots:
        db.add(
            TeamFormationSlot(
                team_formation_id=formation.id,
                slot=slot_in.slot,
                player_id=slot_in.player_id,
                archetype_code=slot_in.archetype_code,
                qualitative_edge=slot_in.qualitative_edge,
            )
        )
    scope.commit()
    scope.refresh(formation)
    return _team_formation_to_out(scope, db, formation)


@router.put("/team-formations/{team_formation_id}", response_model=TeamFormationOut)
def update_team_formation(
    team_formation_id: int,
    payload: TeamFormationWriteRequest,
    ctx: CurrentMembership = Depends(require_role_on_team("coach")),
    scope: TeamScope = Depends(get_team_scope),
    db: Session = Depends(get_db),
) -> TeamFormationOut:
    formation = scope.get(TeamFormation, team_formation_id)
    if formation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team formation not found")
    _validate_write(db, scope, payload)

    formation.name = payload.name
    formation.base_formation_code = payload.base_formation_code
    formation.active_phase_variant = payload.active_phase_variant
    formation.opponent_formation_code = payload.opponent_formation_code
    formation.opponent_phase_variant = payload.opponent_phase_variant

    # Full replace of the slot set (module docstring / schema docstring):
    # the personnel panel saves all eleven slots as one unit, not a
    # field-by-field patch, so this deletes and recreates rather than
    # diffing the existing rows.
    db.query(TeamFormationSlot).filter(
        TeamFormationSlot.team_formation_id == formation.id
    ).delete()
    for slot_in in payload.slots:
        db.add(
            TeamFormationSlot(
                team_formation_id=formation.id,
                slot=slot_in.slot,
                player_id=slot_in.player_id,
                archetype_code=slot_in.archetype_code,
                qualitative_edge=slot_in.qualitative_edge,
            )
        )
    scope.commit()
    scope.refresh(formation)
    return _team_formation_to_out(scope, db, formation)
