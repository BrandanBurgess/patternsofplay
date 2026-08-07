"""Slot-to-unit crosswalk and the unit balance evaluator (T-110, doc 06
sections 2.6, 3.1 and 5.3).

Why this module exists. Doc 06 section 0 calls unit-balance warnings the
core mechanic of the Tactics Lab, but doc 06 never states how a
formation's eleven named slots map onto the seven `unit_balance_rules`
units. T-108 hit that gap building /archetypes/suggest and stopped rather
than invent a mapping: `archetype_combinations.slots_json` is a
[{slot_family, archetype_code}] combination TEMPLATE, not per-formation
slot membership.

The founder's approved resolution (2026-08-07) is two-part:

  1. `slot_family` is SEEDED per slot, on seeds/formations.json, because
     `position_code` is too coarse to carry the football. It cannot tell a
     back three's outer defender (cb_wide) from its middle one
     (cb_central), nor a six from an eight when both are CM. Seeding it
     explicitly is what makes a 3-4-3's wide player correctly a wing back
     and a 4-3-3's correctly a fullback.
  2. The slot_family-to-unit crosswalk is a FIXED MAP IN CODE, below. It
     is vocabulary, not content: it changes only when doc 06's unit or
     slot-family vocabularies change, which is a spec change rather than a
     seed change (the same reasoning doc 06 section 3.1 gives for keeping
     the duty vocabulary closed).

The evaluation shape deliberately mirrors the existing role_clashes
mechanic in app/routers/roster.py (`_compute_fit_warnings`): iterate the
seeded rows, fire per flank where a flank applies, and carry the SEEDED
`warning_copy` through as the message rather than composing copy in code.
Doc 06 section 3.1 asks for exactly that ("reuse its evaluation shape so
the two engines read alike"), and Brief section 7 says content is data,
not code.

Three rules govern what gets evaluated, and all three exist to protect
trust in the warnings:

  * A unit the formation does not contain is never evaluated. Firing "this
    double pivot has no tempo setter" at a 4-3-3, which has no double
    pivot, would be worse than saying nothing and would discredit every
    other warning on the page.
  * `requires_duty` rules only run on a unit whose slots ALL carry an
    archetype. Half-assigned is not imbalanced, it is unfinished, and a
    coach planning a shape at 11pm should not be shouted at mid-click.
  * `max_duty` and `max_same_archetype` rules run on whatever is assigned,
    because an excess that already exists cannot be undone by assigning
    more slots. They are monotone, so firing early is still true.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Literal, Protocol

# ---------------------------------------------------------------------------
# Vocabularies (doc 06 sections 2.6 and 3.1)
# ---------------------------------------------------------------------------

SlotFamily = Literal[
    "gk", "cb_central", "cb_wide", "fb", "wb",
    "six", "eight", "ten", "wide_forward", "nine",
]

Unit = Literal[
    "midfield_three", "double_pivot", "front_three", "strike_pair",
    "back_line", "wide_unit", "box_midfield",
]

SLOT_FAMILIES: tuple[str, ...] = (
    "gk", "cb_central", "cb_wide", "fb", "wb",
    "six", "eight", "ten", "wide_forward", "nine",
)

# Doc 06 section 3.1's own enumeration order, not alphabetical, matching the
# FORMATION_ORDER / PHASE_ORDER convention in app/routers/formations.py and
# app/routers/tactics.py so a response reads in the document's order.
UNITS: tuple[str, ...] = (
    "midfield_three", "double_pivot", "front_three", "strike_pair",
    "back_line", "wide_unit", "box_midfield",
)

# THE CROSSWALK. Which units a slot family can participate in. A family may
# belong to more than one unit at once (a fullback is in the back line AND
# in his flank's wide unit, and doc 06 section 2.6 evaluates both), and a
# family may name two ALTERNATIVES that a formation then resolves between
# (a six is in a midfield three or in a double pivot, never both). Which of
# the two applies is decided per formation by `unit_membership` below.
#
# Three families map to nothing, each for a stated reason rather than an
# oversight:
#   gk   Doc 06's units are all outfield. `bl_needs_a_coverer`'s seeded copy
#        ("check the goalkeeper is picked for it") treats the keeper as
#        something the back line is evaluated AGAINST, not a member of it.
#   ten  Doc 06 gives the ten no unit. The only candidate in the vocabulary
#        is box_midfield, which section 2.6 leaves without a framework, so
#        placing him there would be inventing one.
#   box_midfield is reachable from no family, for the same reason: T-102
#        seeded no combinations and no rules for it because doc 06 section
#        2.6 gives it none. It stays in the vocabulary and out of the map.
SLOT_FAMILY_UNITS: dict[str, tuple[str, ...]] = {
    "gk": (),
    "cb_central": ("back_line",),
    "cb_wide": ("back_line",),
    "fb": ("back_line", "wide_unit"),
    "wb": ("back_line", "wide_unit"),
    "six": ("midfield_three", "double_pivot"),
    "eight": ("midfield_three", "double_pivot"),
    "ten": (),
    "wide_forward": ("front_three", "wide_unit"),
    "nine": ("front_three", "strike_pair"),
}

# Cardinalities the resolvers below check against, named rather than
# inlined so the football reason for each is readable in one place.
_CENTRAL_MIDFIELD_FAMILIES = ("six", "eight")
_BACK_LINE_FAMILIES = ("cb_central", "cb_wide", "fb", "wb")
_WIDE_UNIT_FAMILIES = ("fb", "wb", "wide_forward")
_MIDFIELD_THREE_SIZE = 3
_DOUBLE_PIVOT_SIZE = 2
_FRONT_THREE_SIZE = 3
_FRONT_THREE_NINES = 1
_STRIKE_PAIR_SIZE = 2
_MIN_BACK_LINE_SIZE = 3
_WIDE_UNIT_SIZE = 2

Flank = Literal["left", "right", "center"]


def flank_of(y: float) -> Flank:
    """Landscape model coords, y running 0 to 100 top to bottom (CLAUDE.md
    rule 8), so the left half of the pitch is the low half of y. Derived
    from the coordinate rather than parsed out of the slot id suffix: the
    coordinate is the stored truth and a slot id is a label."""
    if y < 50:
        return "left"
    if y > 50:
        return "right"
    return "center"


@dataclass(frozen=True)
class SlotRef:
    """One of a formation's eleven slots, flattened out of
    formations.positions_json."""

    slot: str
    slot_family: str
    flank: Flank


@dataclass(frozen=True)
class UnitInstance:
    """One evaluable occurrence of a unit within one formation.

    `flank` is set only for wide_unit, which occurs twice per formation
    (once per touchline) because doc 06 section 2.6 defines it as
    "fullback plus wide forward" on one side and the seeded warning copy
    speaks about "this flank". Every other unit occurs at most once and
    carries flank=None."""

    unit: str
    flank: Flank | None
    slots: tuple[str, ...]


def _families(slots: list[SlotRef], families: tuple[str, ...]) -> list[SlotRef]:
    return [s for s in slots if s.slot_family in families]


def slot_refs(positions: list[dict]) -> list[SlotRef]:
    """Flatten formations.positions_json (or a formation_phases row's, which
    carries the same slot set by validator rule) into SlotRefs. A position
    without a slot_family cannot happen in seeded data: the validator
    requires the field on every formation position. Anything else is
    skipped rather than guessed at."""
    refs: list[SlotRef] = []
    for position in positions:
        family = position.get("slot_family")
        slot = position.get("slot")
        if not isinstance(family, str) or not isinstance(slot, str):
            continue
        if family not in SLOT_FAMILY_UNITS:
            continue
        refs.append(SlotRef(slot=slot, slot_family=family, flank=flank_of(position.get("y", 50))))
    return refs


def unit_membership(positions: list[dict]) -> list[UnitInstance]:
    """The actual slot membership of every unit this formation contains.

    A unit the formation does not contain is simply absent from the result,
    never present-and-empty, because an empty unit would trip every
    `requires_duty` rule attached to it and shout about a double pivot at a
    4-3-3 that has none.

    The resolutions, and the football behind each:

      midfield_three vs double_pivot. Both draw on the same {six, eight}
        slots, so the count decides: three central midfielders is a midfield
        three, two is a double pivot. A 4-3-3 (six plus two eights) and a
        3-5-2 (six plus two eights) resolve to a trio; a 4-2-3-1, a flat
        4-4-2 and a 3-4-3 resolve to a pivot pair.

      front_three vs strike_pair. Counting all of {wide_forward, nine}
        together would call a flat 4-4-2's two wide midfielders plus two
        strikers a four, so the two resolve on different sets: a front three
        is three of {wide_forward, nine} with exactly one nine (the two
        wingers and the centre forward), and a strike pair is exactly two
        nines. A 4-4-2 therefore has a strike pair and no front three, and a
        5-4-1's lone striker is neither, which is correct: one forward is
        not a unit.

      back_line takes every {cb_central, cb_wide, fb, wb} slot, so a back
        four is a four and a 3-5-2 or 5-4-1 back line is a five. Wing backs
        count, per the approved crosswalk: the rules ask who steps and who
        covers, and in a back five the wing backs do both.

      wide_unit is per flank, two instances, each needing exactly two
        players on that side from {fb, wb, wide_forward}. Doc 06 section 2.6
        defines it as a PAIR ("fullback plus wide forward"), and the seeded
        copy says "neither player on this flank", so a flank holding only a
        wing back (3-5-2, 5-4-1) is not a wide unit and is not evaluated.
    """
    slots = slot_refs(positions)
    instances: list[UnitInstance] = []

    central = _families(slots, _CENTRAL_MIDFIELD_FAMILIES)
    if len(central) == _MIDFIELD_THREE_SIZE:
        instances.append(UnitInstance("midfield_three", None, tuple(s.slot for s in central)))
    elif len(central) == _DOUBLE_PIVOT_SIZE:
        instances.append(UnitInstance("double_pivot", None, tuple(s.slot for s in central)))

    front = _families(slots, ("wide_forward", "nine"))
    nines = _families(slots, ("nine",))
    if len(front) == _FRONT_THREE_SIZE and len(nines) == _FRONT_THREE_NINES:
        instances.append(UnitInstance("front_three", None, tuple(s.slot for s in front)))
    if len(nines) == _STRIKE_PAIR_SIZE:
        instances.append(UnitInstance("strike_pair", None, tuple(s.slot for s in nines)))

    back = _families(slots, _BACK_LINE_FAMILIES)
    if len(back) >= _MIN_BACK_LINE_SIZE:
        instances.append(UnitInstance("back_line", None, tuple(s.slot for s in back)))

    for flank in ("left", "right"):
        wide = [s for s in _families(slots, _WIDE_UNIT_FAMILIES) if s.flank == flank]
        if len(wide) == _WIDE_UNIT_SIZE:
            instances.append(
                UnitInstance("wide_unit", flank, tuple(s.slot for s in wide))  # type: ignore[arg-type]
            )

    instances.sort(key=lambda i: (UNITS.index(i.unit), i.flank or ""))
    return instances


def units_present(positions: list[dict]) -> list[str]:
    seen: list[str] = []
    for instance in unit_membership(positions):
        if instance.unit not in seen:
            seen.append(instance.unit)
    return seen


def units_absent(positions: list[dict]) -> list[str]:
    present = set(units_present(positions))
    return [unit for unit in UNITS if unit not in present]


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------


class ArchetypeLike(Protocol):
    """Structural view of app.models.PositionArchetype, so the evaluator
    stays a pure function over data and its tests do not need a database."""

    code: str
    name: str
    duties_json: list


class BalanceRuleLike(Protocol):
    """Structural view of app.models.UnitBalanceRule."""

    code: str
    unit: str
    rule_kind: str
    duty: str | None
    min_count: int | None
    max_count: int | None
    warning_copy: str
    severity: str


@dataclass(frozen=True)
class BalanceNote:
    """One fired unit_balance_rules row. The same shape as roster.py's
    FitWarningOut carries a fired role_clashes row: the seeded code, the
    flank where a flank applies, the SEEDED copy as the message, and the
    subjects it fired on."""

    code: str
    unit: str
    flank: Flank | None
    severity: str
    message: str
    slots: tuple[str, ...]


@dataclass(frozen=True)
class UnitEvaluation:
    unit: str
    flank: Flank | None
    slots: tuple[str, ...]
    assigned_slots: tuple[str, ...]
    is_complete: bool
    notes: list[BalanceNote] = field(default_factory=list)


def _fires(
    rule: BalanceRuleLike,
    assigned: Sequence[ArchetypeLike],
    is_complete: bool,
) -> bool:
    if rule.rule_kind == "requires_duty":
        # Only on a finished unit: see the module docstring. An unassigned
        # slot might still be the metronome the trio is missing.
        if not is_complete or rule.duty is None:
            return False
        holders = sum(1 for a in assigned if rule.duty in (a.duties_json or []))
        return holders < (rule.min_count or 0)
    if rule.rule_kind == "max_duty":
        if rule.duty is None or rule.max_count is None:
            return False
        holders = sum(1 for a in assigned if rule.duty in (a.duties_json or []))
        return holders > rule.max_count
    if rule.rule_kind == "max_same_archetype":
        if rule.max_count is None:
            return False
        counts: dict[str, int] = {}
        for a in assigned:
            counts[a.code] = counts.get(a.code, 0) + 1
        return any(n > rule.max_count for n in counts.values())
    return False


def evaluate_unit_balance(
    positions: list[dict],
    assignments: Mapping[str, str | None],
    # Mapping/Sequence rather than dict/list so an ORM row type (a
    # PositionArchetype, a UnitBalanceRule) satisfies the protocol: dict and
    # list are invariant in their value type and would reject it.
    archetypes: Mapping[str, ArchetypeLike],
    rules: Sequence[BalanceRuleLike],
) -> list[UnitEvaluation]:
    """Evaluate every unit this formation contains against the seeded
    unit_balance_rules rows.

    `assignments` maps slot id to archetype code, and a slot may be missing
    from it or map to None. That is a first-class state, not an error (doc
    06 section 5.3: "the panel still works with archetypes alone and no
    players assigned"), so a unit with nothing assigned comes back listed,
    complete=False, and silent.
    """
    rules_by_unit: dict[str, list[BalanceRuleLike]] = {}
    for rule in rules:
        rules_by_unit.setdefault(rule.unit, []).append(rule)

    evaluations: list[UnitEvaluation] = []
    for instance in unit_membership(positions):
        assigned_slots = tuple(
            slot for slot in instance.slots if assignments.get(slot) in archetypes
        )
        assigned = [archetypes[assignments[slot]] for slot in assigned_slots]  # type: ignore[index]
        is_complete = len(assigned_slots) == len(instance.slots)

        notes: list[BalanceNote] = []
        if assigned:
            for rule in rules_by_unit.get(instance.unit, []):
                if _fires(rule, assigned, is_complete):
                    notes.append(
                        BalanceNote(
                            code=rule.code,
                            unit=instance.unit,
                            flank=instance.flank,
                            severity=rule.severity,
                            message=rule.warning_copy,
                            slots=assigned_slots,
                        )
                    )
        evaluations.append(
            UnitEvaluation(
                unit=instance.unit,
                flank=instance.flank,
                slots=instance.slots,
                assigned_slots=assigned_slots,
                is_complete=is_complete,
                notes=notes,
            )
        )
    return evaluations
