"""Formations, keystones, and the rondo map (doc 03 section 5, Bible 4,
3G.2; Brief step 18; the Formations page's board-first render). Library
world content, same reasoning as app/routers/library.py: no team_id
anywhere (Formation/FormationKeystone/RondoZone carry none), so this only
requires an authenticated user, not the team-scoped query layer.
"""

from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db
from app.models import Formation, FormationKeystone, RondoZone, User
from app.schemas import FormationKeystoneOut, FormationOut, FormationPositionOut, RondoZoneOut

router = APIRouter(prefix="/api", tags=["formations"])

# doc 03 section 5's six MVP presets, in the Bible's own 4.1-4.6 order
# (matches the seed file and every design PNG's preset list order: 4-3-3,
# 4-2-3-1, 4-4-2, 3-5-2, 3-4-3, 5-4-1). Formation.code has no sequence
# column of its own, so this is the one place that order is asserted.
FORMATION_ORDER = ("433", "4231", "442", "352", "343", "541")

# Bible 3G.2's rondo map order (first-line build-up through to the
# counterpress moment); only 433 carries seeded zones today (seeds/
# rondo_zones.json), but the ordering applies to any formation that gains
# a rondo map later.
ZONE_ORDER = ("first_line", "midfield_box", "flank_corridor", "last_line", "counterpress")


def _order_index(value: str, order: tuple[str, ...]) -> int:
    try:
        return order.index(value)
    except ValueError:
        return len(order)


@router.get("/formations", response_model=list[FormationOut])
def list_formations(
    _current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[FormationOut]:
    formations = sorted(db.query(Formation).all(), key=lambda f: _order_index(f.code, FORMATION_ORDER))

    keystones_by_code: dict[str, list[FormationKeystone]] = defaultdict(list)
    for keystone in db.query(FormationKeystone).all():
        keystones_by_code[keystone.formation_code].append(keystone)

    zones_by_code: dict[str, list[RondoZone]] = defaultdict(list)
    for zone in db.query(RondoZone).all():
        zones_by_code[zone.formation_code].append(zone)

    result: list[FormationOut] = []
    for formation in formations:
        zones = sorted(
            zones_by_code.get(formation.code, []),
            key=lambda z: _order_index(z.zone_key, ZONE_ORDER),
        )
        result.append(
            FormationOut(
                code=formation.code,
                name=formation.name,
                shape_blurb=formation.shape_blurb,
                strengths=formation.strengths_json,
                vulnerabilities=formation.vulnerabilities_json,
                natural_identities=formation.natural_identities,
                positions=[
                    FormationPositionOut(
                        slot=p["slot"],
                        position_code=p["position_code"],
                        x=p["x"],
                        y=p["y"],
                    )
                    for p in formation.positions_json
                ],
                keystones=[
                    FormationKeystoneOut(slot=k.slot, title=k.title, blurb=k.blurb)
                    for k in keystones_by_code.get(formation.code, [])
                ],
                rondo_zones=[
                    RondoZoneOut(
                        zone_key=z.zone_key,
                        rondo_name=z.rondo_name,
                        teaches=z.teaches,
                        polygon=z.polygon_json,
                        trains_pattern_codes=z.trains_pattern_codes,
                    )
                    for z in zones
                ],
            )
        )
    return result
