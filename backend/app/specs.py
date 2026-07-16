"""Pydantic v2 models validating the three JSON payload shapes doc 04
section 1 names explicitly: animation_spec_json, keyframes_json, and
board_snapshot_json. Defined once here so the future seed validator
(T-011, doc 03 section 8: "animation slot references resolve") and any
API boundary that accepts these payloads (library_items, saved_patterns,
boards, identities.signature_animation_spec_json) share one source of
truth instead of re-deriving the shape.

Positions are landscape model coordinates, x and y both 0-100 (CLAUDE.md
rule 8; doc 03 section 4.1). Orientation is a render-only concern and
never appears in this data.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, RootModel, model_validator

# doc 03 section 4: extras_json.trajectory vocabulary for deliveries, also
# used by animation step ball_to.trajectory (section 4.1: "trajectory
# values match the delivery vocabulary and drive the trail rendering").
Trajectory = Literal["ground", "driven", "whipped", "floated", "clipped"]


class ModelPoint(BaseModel):
    """Landscape model coordinates. x grows toward the attacking goal, y
    grows top to bottom, both 0-100 (doc 03 section 4.1)."""

    model_config = ConfigDict(extra="forbid")

    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)


# ---------------------------------------------------------------------------
# 4.1 Declarative animation spec (preset content: library_items and
# identities.signature_animation_spec_json)
# ---------------------------------------------------------------------------


class AnimationSlot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slot: str = Field(min_length=1)
    role_hint: str | None = None
    side: Literal["team", "opponent"] = "team"
    start: ModelPoint


class AnimationBall(BaseModel):
    model_config = ConfigDict(extra="forbid")

    holder_slot: str = Field(min_length=1)


class AnimationMove(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slot: str = Field(min_length=1)
    to: ModelPoint
    # Trail shape hint ("outside", "inside", ...). doc 03's own example
    # ("arc": "outside") does not enumerate the full vocabulary, so this
    # stays a free string rather than a Literal invented for this build.
    arc: str | None = None


class AnimationBallTo(BaseModel):
    """`bind_slot` attaches the waypoint to the player who starts or
    finishes at that spot; during playback the waypoint chases that
    player's live position so passes connect to runners (doc 03 section
    4.1 binding rules)."""

    model_config = ConfigDict(extra="forbid")

    bind_slot: str = Field(min_length=1)
    trajectory: Trajectory


class AnimationStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    n: int = Field(ge=1)
    caption: str = Field(min_length=1)
    moves: list[AnimationMove] = Field(default_factory=list)
    ball_to: AnimationBallTo | None = None


class AnimationSpec(BaseModel):
    """doc 03 section 4.1. Rotations are the same format with loop: true;
    reference-team signature animations (section 5) are also this format."""

    model_config = ConfigDict(extra="forbid")

    slots: list[AnimationSlot] = Field(min_length=1)
    ball: AnimationBall
    steps: list[AnimationStep] = Field(min_length=1)
    loop: bool = False

    @model_validator(mode="after")
    def _slot_references_resolve(self) -> "AnimationSpec":
        """doc 03 section 8: the validator rejects any animation spec whose
        slot references do not resolve. Checked here so the seed validator
        (T-011) gets this for free by reusing this model."""
        slot_names = {s.slot for s in self.slots}
        if self.ball.holder_slot not in slot_names:
            raise ValueError(
                f"ball.holder_slot '{self.ball.holder_slot}' does not reference a defined slot"
            )
        for step in self.steps:
            for move in step.moves:
                if move.slot not in slot_names:
                    raise ValueError(
                        f"step {step.n}: move references undefined slot '{move.slot}'"
                    )
            if step.ball_to is not None and step.ball_to.bind_slot not in slot_names:
                raise ValueError(
                    f"step {step.n}: ball_to.bind_slot references undefined slot "
                    f"'{step.ball_to.bind_slot}'"
                )
        return self


# ---------------------------------------------------------------------------
# 4.2 Recorded patterns (user content, team-scoped): keyframes_json
# ---------------------------------------------------------------------------


class Keyframe(BaseModel):
    """Doc 03 section 4.2: array of {t_ms, token_id, x, y} covering every
    dragged token including opponents and the ball, exactly as recorded.

    t_ms is a float, not an int: the frontend recorder timestamps against
    performance.now() (frontend/src/board/time.ts / recorder.ts), which is
    sub-millisecond precision, and doc 03 says to "keep raw... exactly as
    recorded" rather than round it on the way in."""

    model_config = ConfigDict(extra="forbid")

    t_ms: float = Field(ge=0)
    token_id: str = Field(min_length=1)
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)


class KeyframesSpec(RootModel[list[Keyframe]]):
    """saved_patterns.keyframes_json is a bare JSON array (doc 03 section
    4.2), not an object, hence RootModel rather than BaseModel."""

    root: list[Keyframe]


# ---------------------------------------------------------------------------
# 4.3 Whiteboard state: board_snapshot_json (saved_patterns) and the
# equivalent split columns on `boards` (tokens_json, confirmed_lanes_json,
# zones_visible_json). The sub-models are reused across both shapes.
# ---------------------------------------------------------------------------


class BoardToken(BaseModel):
    """Mirrors the frontend board engine's Token shape (T-020,
    frontend/src/board/tokens.ts): id, side, label, and a landscape model
    position. home/away rather than team/opponent because that is the
    vocabulary the board engine and this ticket's frontend sibling
    already settled on."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    side: Literal["home", "away", "ball"]
    label: str
    pos: ModelPoint


class ConfirmedLane(BaseModel):
    """Confirmed lanes store per player-token pair (doc 03 section 4.3).

    NOTE: future versions will likely key lanes by role or slot instead of
    raw token id, so a confirmed lane transfers across formations rather
    than being pinned to one board's specific tokens (design README).
    """

    model_config = ConfigDict(extra="forbid")

    a: str = Field(min_length=1)
    b: str = Field(min_length=1)


class ZonesVisible(BaseModel):
    """View-menu zone overlay toggles (Brief step 13): thirds,
    half-spaces, Zone 14 plus cutback."""

    model_config = ConfigDict(extra="forbid")

    thirds: bool = False
    half_spaces: bool = False
    zone_14: bool = False
    cutback: bool = False


class BoardSnapshot(BaseModel):
    """doc 03 section 4.2: saved_patterns.board_snapshot_json ("token
    positions, confirmed lanes, thresholds, zones on")."""

    model_config = ConfigDict(extra="forbid")

    tokens: list[BoardToken] = Field(min_length=1)
    confirmed_lanes: list[ConfirmedLane] = Field(default_factory=list)
    blocking_threshold: float = Field(ge=0)
    marking_threshold: float = Field(ge=0)
    zones_visible: ZonesVisible = Field(default_factory=ZonesVisible)

    @model_validator(mode="after")
    def _lanes_reference_tokens(self) -> "BoardSnapshot":
        token_ids = {t.id for t in self.tokens}
        for lane in self.confirmed_lanes:
            if lane.a not in token_ids or lane.b not in token_ids:
                raise ValueError(
                    f"confirmed lane ({lane.a}, {lane.b}) references a token id "
                    "not present in tokens"
                )
        return self
