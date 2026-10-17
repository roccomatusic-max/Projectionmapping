"""Request/response models for the mapping media module.

Geometry is normalised (fractions of the canvas or of the output), so the
validators bound it generously rather than to [0, 1]: a corner dragged past
the edge of the image is a legitimate way to overscan a surface.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Point = tuple[float, float]

#: How far outside the unit square a point may sit.
_REACH = 4.0


def _check_point(point: Point, what: str) -> None:
    for value in point:
        if not -_REACH <= value <= 1 + _REACH:
            raise ValueError(f"{what} coordinate {value} is out of range")


# -- media -------------------------------------------------------------------


class MediaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    kind: Literal["video", "image"]
    content_type: str
    size_bytes: int
    width: int | None = None
    height: int | None = None
    duration: float | None = None
    created_at: datetime


class MediaUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    width: int | None = Field(default=None, ge=1, le=32768)
    height: int | None = Field(default=None, ge=1, le=32768)
    duration: float | None = Field(default=None, ge=0)


# -- output geometry -----------------------------------------------------------


class SourceRect(BaseModel):
    x: float = Field(default=0.0, ge=-1, le=2)
    y: float = Field(default=0.0, ge=-1, le=2)
    w: float = Field(default=1.0, gt=0, le=3)
    h: float = Field(default=1.0, gt=0, le=3)


class Mesh(BaseModel):
    cols: int = Field(ge=2, le=17)
    rows: int = Field(ge=2, le=17)
    #: Offsets from the undistorted grid position, row-major, in output fractions.
    points: list[Point]

    @model_validator(mode="after")
    def _shape(self) -> Mesh:
        if len(self.points) != self.cols * self.rows:
            raise ValueError(
                f"mesh has {len(self.points)} points; a {self.cols}×{self.rows} "
                f"grid needs {self.cols * self.rows}"
            )
        for dx, dy in self.points:
            if abs(dx) > 2 or abs(dy) > 2:
                raise ValueError("mesh offsets must be within ±2")
        return self


class Warp(BaseModel):
    #: Top-left, top-right, bottom-right, bottom-left.
    corners: list[Point] = Field(
        default_factory=lambda: [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    )
    mesh: Mesh | None = None

    @field_validator("corners")
    @classmethod
    def _four(cls, corners: list[Point]) -> list[Point]:
        if len(corners) != 4:
            raise ValueError("corner pin needs exactly four corners (TL, TR, BR, BL)")
        for point in corners:
            _check_point(point, "corner")
        return corners


class Mask(BaseModel):
    name: str = Field(default="", max_length=64)
    points: list[Point] = Field(min_length=3, max_length=256)
    #: Edge softness in output pixels.
    feather: float = Field(default=0.0, ge=0, le=200)
    #: True keeps only the inside of the polygon instead of blacking it out.
    invert: bool = False
    enabled: bool = True

    @field_validator("points")
    @classmethod
    def _in_range(cls, points: list[Point]) -> list[Point]:
        for point in points:
            _check_point(point, "mask")
        return points


class BlendEdge(BaseModel):
    #: Ramp width as a fraction of the output.
    width: float = Field(default=0.0, ge=0, le=0.5)
    #: Display gamma the ramp compensates for; 2.2 suits most projectors.
    gamma: float = Field(default=2.2, ge=0.5, le=4)
    #: 0 is a linear ramp, 1 a full smoothstep S-curve.
    curve: float = Field(default=0.5, ge=0, le=1)


class Blend(BaseModel):
    left: BlendEdge = Field(default_factory=BlendEdge)
    right: BlendEdge = Field(default_factory=BlendEdge)
    top: BlendEdge = Field(default_factory=BlendEdge)
    bottom: BlendEdge = Field(default_factory=BlendEdge)


class ColorAdjust(BaseModel):
    brightness: float = Field(default=1.0, ge=0, le=2)
    gamma: float = Field(default=1.0, ge=0.2, le=3)
    red: float = Field(default=1.0, ge=0, le=2)
    green: float = Field(default=1.0, ge=0, le=2)
    blue: float = Field(default=1.0, ge=0, le=2)


TestPattern = Literal["none", "grid", "id", "white", "black", "red", "green", "blue"]


class OutputBase(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    projector_id: int | None = None
    width: int = Field(default=1920, ge=16, le=16384)
    height: int = Field(default=1200, ge=16, le=16384)
    source: SourceRect = Field(default_factory=SourceRect)
    warp: Warp = Field(default_factory=Warp)
    masks: list[Mask] = Field(default_factory=list, max_length=64)
    blend: Blend = Field(default_factory=Blend)
    color: ColorAdjust = Field(default_factory=ColorAdjust)
    test_pattern: TestPattern = "none"
    enabled: bool = True


class OutputCreate(OutputBase):
    pass


class OutputUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    projector_id: int | None = None
    width: int | None = Field(default=None, ge=16, le=16384)
    height: int | None = Field(default=None, ge=16, le=16384)
    source: SourceRect | None = None
    warp: Warp | None = None
    masks: list[Mask] | None = Field(default=None, max_length=64)
    blend: Blend | None = None
    color: ColorAdjust | None = None
    test_pattern: TestPattern | None = None
    enabled: bool | None = None


class CalibrationSummary(BaseModel):
    """What the editor needs to know about an output's last calibration."""
    camera_id: int
    captured_at: datetime
    #: Share of the camera grid where this projector's light was decoded.
    coverage: float


class OutputOut(OutputBase):
    id: int
    show_id: int
    position: int
    calibration: CalibrationSummary | None = None


# -- cues ----------------------------------------------------------------------


Interaction = Literal["none", "spotlight", "ripple"]


class CueBase(BaseModel):
    name: str = Field(default="", max_length=128)
    media_id: int | None = None
    fit: Literal["fill", "fit", "stretch"] = "fill"
    loop: bool = True
    fade_seconds: float = Field(default=1.0, ge=0, le=60)
    #: How people tracked by a depth camera affect this cue.
    interaction: Interaction = "none"
    follow_seconds: float | None = Field(default=None, gt=0, le=86400)


class CueCreate(CueBase):
    pass


class CueUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=128)
    media_id: int | None = None
    fit: Literal["fill", "fit", "stretch"] | None = None
    loop: bool | None = None
    fade_seconds: float | None = Field(default=None, ge=0, le=60)
    follow_seconds: float | None = Field(default=None, gt=0, le=86400)
    interaction: Interaction | None = None


class CueOut(CueBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    show_id: int
    position: int


class CueOrder(BaseModel):
    cue_ids: list[int]


# -- shows ---------------------------------------------------------------------


class ShowCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str = ""
    canvas_width: int = Field(default=3840, ge=16, le=32768)
    canvas_height: int = Field(default=2160, ge=16, le=32768)


class CameraView(BaseModel):
    """Where the show canvas sits in a camera's picture of the building."""
    camera_id: int
    #: Canvas corners TL, TR, BR, BL, in fractions of the camera image.
    corners: list[Point]

    @field_validator("corners")
    @classmethod
    def _four(cls, corners: list[Point]) -> list[Point]:
        if len(corners) != 4:
            raise ValueError("the camera view needs exactly four corners (TL, TR, BR, BL)")
        for x, y in corners:
            if not (-1 <= x <= 2 and -1 <= y <= 2):
                raise ValueError("camera view corners must be within the camera image's reach")
        return corners


class ShowUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = None
    canvas_width: int | None = Field(default=None, ge=16, le=32768)
    canvas_height: int | None = Field(default=None, ge=16, le=32768)
    #: null clears it.
    camera_view: CameraView | None = None


class ShowSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str
    canvas_width: int
    canvas_height: int
    output_count: int = 0
    cue_count: int = 0
    updated_at: datetime


class ShowOut(ShowSummary):
    camera_view: CameraView | None = None
    outputs: list[OutputOut]
    cues: list[CueOut]


# -- transport -----------------------------------------------------------------


class TransportCommand(BaseModel):
    action: Literal["go", "goto", "pause", "resume", "stop", "blackout"]
    show_id: int | None = None
    #: Cue position for ``goto``; ``go`` advances to the next cue.
    cue: int | None = Field(default=None, ge=0)


class TransportCue(BaseModel):
    id: int
    position: int
    name: str
    media_id: int | None
    fit: str
    loop: bool
    fade_seconds: float
    interaction: Interaction = "none"
    #: Server epoch milliseconds at which media time zero was (or will be).
    started_at_ms: float


class TransportState(BaseModel):
    show_id: int | None = None
    status: Literal["stopped", "playing", "paused", "blackout"] = "stopped"
    #: The live cue and, during a crossfade, the one fading out.
    current: TransportCue | None = None
    previous: TransportCue | None = None
    #: When the crossfade from ``previous`` began, server epoch milliseconds.
    fade_started_at_ms: float | None = None
    #: Media position frozen while paused, in seconds.
    paused_position: float | None = None
    #: Bumped on every change, so a client can ignore a stale message.
    revision: int = 0
    server_time_ms: float = 0.0


# -- players -------------------------------------------------------------------


class PlayerHello(BaseModel):
    device_id: str = Field(min_length=16, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    secret: str = Field(min_length=32, max_length=128)
    name: str = Field(default="Player", min_length=1, max_length=128)
    #: "camera" for the camera agent (camera-agent/); fixed at first hello.
    #: A camera sharing an approved player's secret is on that player's
    #: computer (the Mini PC app runs both) and is approved with it.
    kind: Literal["player", "camera"] = "player"


class PlayerHelloResponse(BaseModel):
    player_id: int
    status: Literal["pending", "approved"]
    code: str
    name: str
    #: Present once approved: the player's access token.
    access_token: str | None = None


class PlayerOut(BaseModel):
    id: int
    name: str
    kind: Literal["player", "camera"] = "player"
    code: str
    approved: bool
    output_id: int | None
    show_id: int | None = None
    online: bool
    last_seen_at: datetime | None
    report: dict = Field(default_factory=dict)
    #: The other half of a mini PC: its camera, on a player; its player,
    #: on a camera. Approved and removed together.
    companion_id: int | None = None


class NetworkInfo(BaseModel):
    """How mini PCs reach this server, for the Players tab."""

    #: Only this computer can reach the server: no mini PC can pair.
    local_only: bool
    #: Mini PCs find the server by themselves.
    discoverable: bool
    #: Where to point one by hand, when known.
    address: str | None = None


class PlayerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    approved: bool | None = None
    output_id: int | None = None


class PlayerReport(BaseModel):
    fps: float | None = None
    drift_ms: float | None = None
    width: int | None = None
    height: int | None = None
    #: "on" when media plays from the local cache, "off" when streaming.
    cache: str | None = Field(default=None, max_length=16)
    cached_bytes: int | None = None
    cue: str | None = Field(default=None, max_length=160)
    # Cameras
    camera: str | None = Field(default=None, max_length=120)
    depth: bool | None = None
    people: int | None = None
    #: What the camera is doing: "idle", "calibrating", "tracking".
    activity: str | None = Field(default=None, max_length=32)


class PlayerAssignment(BaseModel):
    player_id: int
    name: str
    output_id: int | None
    show_id: int | None


# -- cameras -------------------------------------------------------------------


class CalibrateRequest(BaseModel):
    camera_id: int


class PatternSpec(BaseModel):
    """One structured-light frame, drawn in the projector's own pixels.

    ``gray`` draws bit ``bit`` of the Gray code of the pixel's column
    (``axis`` x) or row (``axis`` y), out of ``width``/``height`` of the
    output's configured resolution.
    """
    kind: Literal["black", "white", "gray"]
    axis: Literal["x", "y"] = "x"
    bit: int = Field(default=0, ge=0, le=15)
    inverse: bool = False


class CalibrationStep(BaseModel):
    output_id: int
    #: None ends the sequence: every output goes back to the show.
    pattern: PatternSpec | None = None
    step: int = Field(default=0, ge=0)
    steps: int = Field(default=0, ge=0)
    status: Literal["running", "done", "failed"] = "running"
    message: str = Field(default="", max_length=300)


class CalibrationResult(BaseModel):
    """The decoded map from the camera's picture to one projector's pixels.

    A grid over the camera image, row-major, cell centres; each point is the
    projector position (output fractions) seen in that cell, or null where
    this projector's light was not found.
    """
    camera_width: int = Field(ge=16, le=16384)
    camera_height: int = Field(ge=16, le=16384)
    cols: int = Field(ge=2, le=200)
    rows: int = Field(ge=2, le=200)
    points: list[Point | None]

    @model_validator(mode="after")
    def _shape(self) -> CalibrationResult:
        if len(self.points) != self.cols * self.rows:
            raise ValueError(f"{len(self.points)} points for a {self.cols}×{self.rows} grid")
        for point in self.points:
            if point is not None and not all(-0.5 <= v <= 1.5 for v in point):
                raise ValueError("decoded projector positions must be near the output")
        return self


class ApplyCalibration(BaseModel):
    #: Mesh control grid per side; denser follows a curved wall more closely.
    mesh: int = Field(default=9, ge=2, le=17)
    #: Restrict to these outputs; all calibrated outputs when omitted.
    output_ids: list[int] | None = None


class ApplyResult(BaseModel):
    output_id: int
    name: str
    applied: bool
    reason: str = ""
    #: Share of mesh points that came from decoded light rather than the fit.
    measured: float = 0.0
    #: How far the decoded points sit from one flat-wall fit, in output pixels.
    residual_px: float = 0.0


class CameraCommand(BaseModel):
    #: "snapshot": send a fresh photo; "background": re-learn the empty scene.
    command: Literal["snapshot", "background"]


class TrackedPerson(BaseModel):
    id: int = Field(ge=0)
    #: Position in the camera image, fractions.
    x: float = Field(ge=-0.5, le=1.5)
    y: float = Field(ge=-0.5, le=1.5)
    #: Distance from the camera in metres, when the camera measures depth.
    z: float | None = Field(default=None, ge=0, le=100)
    #: Apparent size, fraction of the image width.
    size: float = Field(default=0.05, ge=0, le=2)


class PeopleReport(BaseModel):
    people: list[TrackedPerson] = Field(default_factory=list, max_length=16)
