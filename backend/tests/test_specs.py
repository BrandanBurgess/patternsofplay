"""Doc 04 section 1: Pydantic schemas for animation_spec_json,
keyframes_json, and board_snapshot_json, reusable by the future seed
validator (T-011). Valid fixtures pass; malformed ones fail loudly
(ValidationError, not a silent pass-through or a KeyError deep in
application code).
"""

import pytest
from pydantic import ValidationError

from app.specs import AnimationSpec, BoardSnapshot, KeyframesSpec

# The exact doc 03 section 4.1 A5 Third-Man Run example (overlap), used
# verbatim as the "valid" fixture so this test doubles as a check that the
# schema actually accepts the spec doc 03 itself defines.
VALID_ANIMATION_SPEC = {
    "slots": [
        {"slot": "winger_R", "role_hint": "W", "start": {"x": 78, "y": 12}},
        {"slot": "fb_R", "role_hint": "FB", "start": {"x": 55, "y": 8}},
        {"slot": "opp_fb_L", "side": "opponent", "start": {"x": 84, "y": 14}},
    ],
    "ball": {"holder_slot": "winger_R"},
    "steps": [
        {
            "n": 1,
            "caption": "Winger receives wide and faces up the fullback",
            "moves": [],
            "ball_to": None,
        },
        {
            "n": 2,
            "caption": "Fullback sprints an arced run outside him",
            "moves": [{"slot": "fb_R", "to": {"x": 88, "y": 4}, "arc": "outside"}],
        },
        {
            "n": 3,
            "caption": "Ball released into the overlap",
            "ball_to": {"bind_slot": "fb_R", "trajectory": "ground"},
        },
    ],
}


def test_valid_animation_spec_passes() -> None:
    spec = AnimationSpec.model_validate(VALID_ANIMATION_SPEC)
    assert spec.slots[0].slot == "winger_R"
    assert spec.steps[-1].ball_to is not None
    assert spec.steps[-1].ball_to.trajectory == "ground"
    assert spec.loop is False


def test_animation_spec_loop_defaults_false_but_rotations_can_set_it() -> None:
    rotation = {**VALID_ANIMATION_SPEC, "loop": True}
    spec = AnimationSpec.model_validate(rotation)
    assert spec.loop is True


def test_animation_spec_rejects_a_ball_holder_slot_that_does_not_exist() -> None:
    bad = {**VALID_ANIMATION_SPEC, "ball": {"holder_slot": "nonexistent_slot"}}
    with pytest.raises(ValidationError):
        AnimationSpec.model_validate(bad)


def test_animation_spec_rejects_a_move_referencing_an_undefined_slot() -> None:
    bad = {
        **VALID_ANIMATION_SPEC,
        "steps": [
            {
                "n": 1,
                "caption": "Ghost run",
                "moves": [{"slot": "no_such_slot", "to": {"x": 50, "y": 50}}],
            }
        ],
    }
    with pytest.raises(ValidationError):
        AnimationSpec.model_validate(bad)


def test_animation_spec_rejects_a_ball_to_bind_slot_that_does_not_exist() -> None:
    bad = {
        **VALID_ANIMATION_SPEC,
        "steps": [
            {
                "n": 1,
                "caption": "Pass into space",
                "ball_to": {"bind_slot": "ghost", "trajectory": "ground"},
            }
        ],
    }
    with pytest.raises(ValidationError):
        AnimationSpec.model_validate(bad)


def test_animation_spec_rejects_an_out_of_range_coordinate() -> None:
    bad = {
        **VALID_ANIMATION_SPEC,
        "slots": [
            {"slot": "winger_R", "start": {"x": 178, "y": 12}},
        ],
        "ball": {"holder_slot": "winger_R"},
    }
    with pytest.raises(ValidationError):
        AnimationSpec.model_validate(bad)


def test_animation_spec_rejects_an_invalid_trajectory() -> None:
    bad = {
        **VALID_ANIMATION_SPEC,
        "steps": [
            {
                "n": 1,
                "caption": "Pass",
                "ball_to": {"bind_slot": "fb_R", "trajectory": "teleport"},
            }
        ],
    }
    with pytest.raises(ValidationError):
        AnimationSpec.model_validate(bad)


def test_animation_spec_rejects_unknown_fields() -> None:
    bad = {**VALID_ANIMATION_SPEC, "unexpected_field": True}
    with pytest.raises(ValidationError):
        AnimationSpec.model_validate(bad)


def test_animation_spec_requires_at_least_one_slot_and_one_step() -> None:
    with pytest.raises(ValidationError):
        AnimationSpec.model_validate({"slots": [], "ball": {"holder_slot": "x"}, "steps": []})


# ---------------------------------------------------------------------------
# keyframes_json (doc 03 section 4.2)
# ---------------------------------------------------------------------------

VALID_KEYFRAMES = [
    {"t_ms": 0, "token_id": "home-9", "x": 50.0, "y": 50.0},
    {"t_ms": 250, "token_id": "home-9", "x": 55.0, "y": 48.0},
    {"t_ms": 250, "token_id": "ball", "x": 55.0, "y": 48.0},
    {"t_ms": 300, "token_id": "away-5", "x": 40.0, "y": 60.0},
]


def test_valid_keyframes_pass_including_opponents_and_ball() -> None:
    spec = KeyframesSpec.model_validate(VALID_KEYFRAMES)
    token_ids = {k.token_id for k in spec.root}
    assert token_ids == {"home-9", "ball", "away-5"}


def test_keyframes_reject_a_negative_timestamp() -> None:
    bad = [{"t_ms": -1, "token_id": "home-9", "x": 50.0, "y": 50.0}]
    with pytest.raises(ValidationError):
        KeyframesSpec.model_validate(bad)


def test_keyframes_reject_an_out_of_range_coordinate() -> None:
    bad = [{"t_ms": 0, "token_id": "home-9", "x": 50.0, "y": 500.0}]
    with pytest.raises(ValidationError):
        KeyframesSpec.model_validate(bad)


def test_keyframes_reject_a_missing_token_id() -> None:
    bad = [{"t_ms": 0, "x": 50.0, "y": 50.0}]
    with pytest.raises(ValidationError):
        KeyframesSpec.model_validate(bad)


def test_keyframes_reject_an_object_instead_of_an_array() -> None:
    """doc 03 section 4.2: keyframes_json is an array, not an object."""
    with pytest.raises(ValidationError):
        KeyframesSpec.model_validate({"t_ms": 0, "token_id": "home-9", "x": 50.0, "y": 50.0})


# ---------------------------------------------------------------------------
# board_snapshot_json (doc 03 section 4.2/4.3)
# ---------------------------------------------------------------------------

VALID_BOARD_SNAPSHOT = {
    "tokens": [
        {"id": "home-9", "side": "home", "label": "9", "pos": {"x": 72, "y": 50}},
        {"id": "away-5", "side": "away", "label": "5", "pos": {"x": 18, "y": 38}},
        {"id": "ball", "side": "ball", "label": "", "pos": {"x": 50, "y": 50}},
    ],
    "confirmed_lanes": [{"a": "home-9", "b": "away-5"}],
    "blocking_threshold": 6.0,
    "marking_threshold": 4.0,
    "zones_visible": {"thirds": True, "half_spaces": False, "zone_14": True, "cutback": False},
}


def test_valid_board_snapshot_passes() -> None:
    snap = BoardSnapshot.model_validate(VALID_BOARD_SNAPSHOT)
    assert len(snap.tokens) == 3
    assert snap.confirmed_lanes[0].a == "home-9"
    assert snap.zones_visible.zone_14 is True


def test_board_snapshot_zones_visible_defaults_when_omitted() -> None:
    payload = {k: v for k, v in VALID_BOARD_SNAPSHOT.items() if k != "zones_visible"}
    snap = BoardSnapshot.model_validate(payload)
    assert snap.zones_visible.thirds is False


def test_board_snapshot_rejects_a_confirmed_lane_referencing_an_unknown_token() -> None:
    bad = {**VALID_BOARD_SNAPSHOT, "confirmed_lanes": [{"a": "home-9", "b": "ghost-token"}]}
    with pytest.raises(ValidationError):
        BoardSnapshot.model_validate(bad)


def test_board_snapshot_rejects_a_negative_threshold() -> None:
    bad = {**VALID_BOARD_SNAPSHOT, "blocking_threshold": -1.0}
    with pytest.raises(ValidationError):
        BoardSnapshot.model_validate(bad)


def test_board_snapshot_rejects_an_invalid_token_side() -> None:
    bad = {
        **VALID_BOARD_SNAPSHOT,
        "tokens": [{"id": "x", "side": "referee", "label": "", "pos": {"x": 50, "y": 50}}],
    }
    with pytest.raises(ValidationError):
        BoardSnapshot.model_validate(bad)


def test_board_snapshot_requires_at_least_one_token() -> None:
    bad = {**VALID_BOARD_SNAPSHOT, "tokens": []}
    with pytest.raises(ValidationError):
        BoardSnapshot.model_validate(bad)
