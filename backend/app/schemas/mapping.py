"""Request/response models for the mapping media module.

Geometry is normalised (fractions of the canvas or of the output), so the
validators bound it generously rather than to [0, 1]: a corner dragged past
the edge of the image is a legitimate way to overscan a surface.
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, field_validator, model_validator

#: NaN and infinity are refused: stored, they would break every later read of the show.
Point = tuple[FiniteFloat, FiniteFloat]

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
    duration: float | None = Field(default=None, ge=0, allow_inf_nan=False)


# -- output geometry -----------------------------------------------------------


class SourceRect(BaseModel):
    x: float = Field(default=0.0, ge=-1, le=2)
    y: float = Field(default=0.0, ge=-1, le=2)
    w: float = Field(default=1.0, gt=0, le=3)
    h: float = Field(default=1.0, gt=0, le=3)


class Mesh(BaseModel):
    cols: int = Field(ge=2, le=17)
    rows: int = Field(ge=2, le=17)
    #: Offsets from the undistorted grid position, row-major, in unit-square
    #: space (before the corner pin).
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
    #: Blend by itself where this output overlaps others (the output windows
    #: work out each one's share of the light; the edges above then stand
    #: aside): True always, False never (it shows a picture apart from the
    #: others, and fit-canvas and apply-calibration leave it out), None once
    #: it has been calibrated with a camera.
    auto: bool | None = None


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
    #: A scene from the scene library, drawn over the media (or on its own).
    scene_id: int | None = None
    #: A different scene on some projectors: {output id: scene id, or None for
    #: no scene there}. Projectors not listed play ``scene_id``.
    output_scenes: dict[int, int | None] = Field(default_factory=dict)
    #: A picture of their own on some projectors: {output id: media id, or
    #: None for no media there}, fitted to that output's slice and not
    #: blended with the others. Outputs not listed show their part of
    #: ``media_id``.
    output_media: dict[int, int | None] = Field(default_factory=dict)


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
    scene_id: int | None = None
    output_scenes: dict[int, int | None] | None = None
    output_media: dict[int, int | None] | None = None


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


def _within_reach(points: list[Point]) -> None:
    for x, y in points:
        if not (-1 <= x <= 2 and -1 <= y <= 2):
            raise ValueError("camera view points must be within the camera image's reach")


class CameraMesh(BaseModel):
    """A grid of canvas points placed by hand on the camera's picture.

    Row-major, ``cols`` × ``rows`` points spread evenly over the canvas,
    each the camera-image fraction where that canvas point is on the
    building. Its four corners are the view's corners.
    """
    cols: int = Field(ge=2, le=9)
    rows: int = Field(ge=2, le=9)
    points: list[Point]

    @model_validator(mode="after")
    def _shape(self) -> CameraMesh:
        if len(self.points) != self.cols * self.rows:
            raise ValueError(f"{len(self.points)} points for a {self.cols}×{self.rows} grid")
        _within_reach(self.points)
        return self

    def corners(self) -> list[Point]:
        c, r = self.cols, self.rows
        return [self.points[0], self.points[c - 1], self.points[c * r - 1], self.points[c * (r - 1)]]


class CameraView(BaseModel):
    """Where the show canvas sits in a camera's picture of the building."""
    camera_id: int
    #: Canvas corners TL, TR, BR, BL, in fractions of the camera image.
    corners: list[Point]
    #: Finer placement by hand; when set, its corners replace ``corners``.
    mesh: CameraMesh | None = None

    @field_validator("corners")
    @classmethod
    def _four(cls, corners: list[Point]) -> list[Point]:
        if len(corners) != 4:
            raise ValueError("the camera view needs exactly four corners (TL, TR, BR, BL)")
        _within_reach(corners)
        return corners

    @model_validator(mode="after")
    def _corners_follow_mesh(self) -> CameraView:
        if self.mesh is not None:
            self.corners = self.mesh.corners()
        return self


class FitCanvas(BaseModel):
    camera_id: int
    #: Also set each calibrated output's slice of the canvas to the part its
    #: projector's light covers (overlaps included, for blending).
    slices: bool = True


class FitResult(BaseModel):
    camera_view: CameraView
    #: Outputs whose slice of the canvas was set from their light.
    sliced: list[int] = Field(default_factory=list)


#: "ground" is a driveway, path or lawn seen from above: not part of the
#: building, so "Whole building" leaves it out.
SurfaceKind = Literal["wall", "roof", "window", "door", "other", "ground"]

#: Traced building parts per show.
MAX_SURFACES = 64


class SurfaceFlat(BaseModel):
    """How a house part lies, so things drawn on it are not stretched.

    ``corners`` is where a true square has to be drawn on the canvas for it
    to look square on this part from where people watch: on a sloped roof
    seen at an angle it is a slanted four-sided shape. Objects on the part
    are drawn through it (frontend/src/mapping/scene/flat.ts).
    """
    #: Top-left, top-right, bottom-right, bottom-left, in canvas fractions.
    corners: list[Point]
    #: While someone is setting the corners: show a checkerboard square on
    #: the projectors until this time (server clock, epoch milliseconds).
    test_until: float | None = None

    @field_validator("corners")
    @classmethod
    def _four(cls, corners: list[Point]) -> list[Point]:
        if len(corners) != 4:
            raise ValueError("a house part's flat view needs exactly four corners (TL, TR, BR, BL)")
        for point in corners:
            _check_point(point, "flat view")
        return corners


class Surface(BaseModel):
    """One part of the building traced on the canvas, for scenes to decorate."""
    id: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(default="", max_length=64)
    kind: SurfaceKind = "wall"
    #: Outline in canvas fractions.
    points: list[Point] = Field(min_length=3, max_length=256)
    #: Straightened: objects on this part are drawn through its flat view.
    flat: SurfaceFlat | None = None

    @field_validator("points")
    @classmethod
    def _in_range(cls, points: list[Point]) -> list[Point]:
        for point in points:
            _check_point(point, "surface")
        return points


class ShowUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = None
    canvas_width: int | None = Field(default=None, ge=16, le=32768)
    canvas_height: int | None = Field(default=None, ge=16, le=32768)
    #: null clears it.
    camera_view: CameraView | None = None
    surfaces: list[Surface] | None = Field(default=None, max_length=MAX_SURFACES)


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
    surfaces: list[Surface] = Field(default_factory=list)
    outputs: list[OutputOut]
    cues: list[CueOut]


# -- transport -----------------------------------------------------------------


class TransportCommand(BaseModel):
    action: Literal["go", "goto", "pause", "resume", "stop", "blackout", "scene"]
    show_id: int | None = None
    #: Cue position for ``goto``; ``go`` advances to the next cue.
    cue: int | None = Field(default=None, ge=0)
    #: For ``scene``: a scene from the library, played alone on every projector.
    scene_id: int | None = None
    fade_seconds: float = Field(default=0.0, ge=0, le=30)


class TransportCue(BaseModel):
    #: A scene played on its own (not from a cue) has id -scene_id and position -1.
    id: int
    position: int
    name: str
    media_id: int | None
    fit: str
    loop: bool
    fade_seconds: float
    interaction: Interaction = "none"
    scene_id: int | None = None
    output_scenes: dict[int, int | None] = Field(default_factory=dict)
    output_media: dict[int, int | None] = Field(default_factory=dict)
    #: Server epoch milliseconds at which media time zero was (or will be).
    started_at_ms: float


class EmergencyState(BaseModel):
    """The emergency stop, while it is on: every output black, shows held."""

    #: Server epoch milliseconds when it was pressed.
    at_ms: float
    #: Who pressed it.
    by: str | None = None


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
    #: Set while the emergency stop is on. Outputs draw nothing at all, not
    #: even a test pattern or a calibration frame, and GO is refused until
    #: someone clears it.
    emergency: EmergencyState | None = None


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


class PlayerScreens(BaseModel):
    """A mini PC's screens, as its app sees them (minipc/screens.py).

    A monitor plugged in beside the projector shows the status screen
    (``/player/screen``): the show, the projector and the output.
    """

    #: "one": only the projector; "on": the status screen is showing on the
    #: other screen; "duplicate": Windows shows the same picture on both;
    #: "waiting": the output window is not open yet; "failed": the status
    #: window would not stay on the other screen; "off": turned off.
    state: Literal["one", "on", "duplicate", "waiting", "failed", "off"]
    #: Screens Windows has (two mirrored screens count as one).
    count: int = Field(default=1, ge=0, le=16)
    #: Each screen in a few words, "1920 × 1200, on the left".
    projector: str | None = Field(default=None, max_length=80)
    second: str | None = Field(default=None, max_length=80)


class PlayerApp(BaseModel):
    """What the Mini PC app on a player's computer last said about itself."""

    #: Heard from in the last few seconds: commands for it arrive.
    connected: bool
    #: It can restart and shut down its computer (Windows).
    power: bool = False
    #: The computer's own name in Windows.
    computer: str | None = None
    #: Its network card's hardware address, for turning it on over the network.
    mac: str | None = None
    #: Windows starts the app again by itself if it stops (the watchdog).
    watchdog: bool = False
    #: When this server last got its log (Get the log), if ever.
    log_at: datetime | None = None
    #: The Mini PC app's version; None for apps too old to update themselves.
    version: str | None = None
    #: old_app, up_to_date, waiting, updating or failed.
    update: str = "old_app"
    #: The newest Mini PC app this server has.
    latest: str | None = None
    #: The update state in words, for the Players page.
    update_message: str = ""
    #: What keeps its computer from staying on 24/7, in words: empty when
    #: nothing does, None for apps that do not check (older than this).
    awake: list[str] | None = None
    #: Its second screen (a monitor beside the projector) and what is on it;
    #: None for apps older than the status screen.
    screens: PlayerScreens | None = None


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
    #: What its output is set to show instead of the show ("none": the show).
    screen: TestPattern | None = None
    #: The Mini PC app around the player page, when it has been heard from.
    app: PlayerApp | None = None


class NetworkInfo(BaseModel):
    """How mini PCs and phones reach this server, for the Players and Phone pages."""

    #: Only this computer can reach the server: no mini PC or phone can.
    local_only: bool
    #: Mini PCs find the server by themselves.
    discoverable: bool
    #: Where to point one by hand on this network, when known.
    address: str | None = None
    #: The server's own system ("mac", "windows", "linux"), for the setup steps.
    server_os: str = "linux"
    #: Where a phone with Tailscale reaches it from any internet connection.
    tailscale_address: str | None = None


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
    #: People reports a second, and how old each is when sent (ms).
    tracking_rate: float | None = None
    tracking_ms: float | None = None
    # Players: how old the camera's people reports are on arrival (ms).
    people_ms: float | None = None
    #: Players: half the round trip to the server clock (ms), and the live link.
    clock_ms: float | None = None
    link: str | None = Field(default=None, max_length=16)
    #: Players: the status overlay is showing on the projector.
    overlay: bool | None = None

    @model_validator(mode="after")
    def _finite(self) -> PlayerReport:
        # A Python sender writes NaN for "no measurement yet"; stored, it would
        # make the players list unreadable for everyone. Keep the report.
        for name in ("fps", "drift_ms", "tracking_rate", "tracking_ms", "people_ms", "clock_ms"):
            value = getattr(self, name)
            if value is not None and not math.isfinite(value):
                setattr(self, name, None)
        return self


class PlayerAssignment(BaseModel):
    player_id: int
    name: str
    output_id: int | None
    show_id: int | None
    #: Things to do once, sent from the Players page ("reload", "overlay_on", "overlay_off").
    commands: list[str] = Field(default_factory=list)
    #: Someone is watching the Dashboard's live view: send copies of the frames drawn.
    picture: bool = False
    #: How often and how wide: faster and larger while the status screen on
    #: this mini PC's own second monitor is showing them.
    picture_ms: int = 3000
    picture_width: int = 480


PlayerAction = Literal["restart_output", "overlay_on", "overlay_off", "reboot", "shutdown", "wake",
                       "update", "swap_screens", "extend_screens", "send_log"]


class PlayerCommand(BaseModel):
    action: PlayerAction


ScreenAction = Literal["start_tonight", "stop_tonight", "go", "pause", "resume", "blackout",
                       "power_on", "power_off", "restart_output", "link_projector"]


class ScreenControl(BaseModel):
    """A button on the status screen of a mini PC's own monitor."""

    action: ScreenAction
    #: For ``link_projector``: the projector its output drives.
    projector_id: int | None = None
    #: Power off asks twice, like everywhere else.
    confirm: bool = False


class ScreenFlat(BaseModel):
    """The four corners of a house part, dragged on a mini PC's status screen."""
    surface_id: str = Field(min_length=1, max_length=32)
    #: null takes the part's straightening away.
    corners: list[Point] | None = None
    #: Show the checkerboard square on the projectors while dragging.
    test: bool = True


class ScreenWarp(BaseModel):
    """This mini PC's own picture fitted onto the ground (a driveway, from a
    projector on the roof): its output's four corners, dragged with the mouse
    on the status screen."""
    #: Top-left, top-right, bottom-right, bottom-left in the output's own
    #: fractions; null puts the picture back square, filling the projector.
    corners: list[Point] | None = None
    #: Show the canvas grid on this projector while fitting (its squares
    #: look square on the ground when the fit is right); false takes it off.
    grid: bool = True

    @field_validator("corners")
    @classmethod
    def _four(cls, corners: list[Point] | None) -> list[Point] | None:
        if corners is None:
            return None
        if len(corners) != 4:
            raise ValueError("the picture needs exactly four corners (TL, TR, BR, BL)")
        for point in corners:
            _check_point(point, "corner")
        return corners


class ScreenControlResult(BaseModel):
    ok: bool
    message: str


class PlayerCommandResult(BaseModel):
    #: What it was handed to: the Mini PC app, the player page, or the network.
    via: Literal["app", "page", "network"]
    message: str


class PlayerScreen(BaseModel):
    #: "none" goes back to the show.
    pattern: TestPattern


class PlayerSensor(BaseModel):
    """The newest reading of a USB temperature sensor on a mini PC."""

    name: str = Field(default="USB sensor", max_length=64)
    celsius: float = Field(ge=-40, le=125)
    humidity: float | None = Field(default=None, ge=0, le=100)


class PlayerAppHello(BaseModel):
    """The Mini PC app checking in for commands, next to its player page."""

    device_id: str = Field(min_length=16, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    secret: str = Field(min_length=32, max_length=128)
    power: bool = False
    computer: str | None = Field(default=None, max_length=128)
    mac: str | None = Field(default=None, pattern=r"^[0-9a-f]{2}(:[0-9a-f]{2}){5}$")
    #: Sent by apps that update themselves (minipc/selfupdate.py).
    version: str | None = Field(default=None, max_length=32, pattern=r"^(dev|\d+\.\d+\.\d+)$")
    #: How its last update went: {"state": "downloading" | "installing" | "failed",
    #: "version": ..., "error": ...}.
    update: dict[str, str | None] | None = None
    #: What keeps the computer from staying on day and night (sleep, the
    #: screen turning off, a lock, Windows Update), in words; empty when
    #: nothing does. Sent by apps that keep Windows awake (minipc/stayawake.py).
    awake: list[Annotated[str, Field(max_length=500)]] | None = Field(default=None, max_length=8)
    #: Its screens and the status screen on the second one (minipc/screens.py).
    screens: PlayerScreens | None = None
    #: Windows starts the app again by itself if it stops (installer.iss).
    watchdog: bool = False
    #: A USB temperature sensor plugged into it (minipc/usbsensor.py), for
    #: the heater in the projector's box.
    sensor: PlayerSensor | None = None


#: The tail of a Mini PC app's logs it sends: plenty for a day's story.
MAX_APP_LOG_CHARS = 600_000


class PlayerAppLog(BaseModel):
    """The Mini PC app sending its log, asked for or after an update."""

    device_id: str = Field(min_length=16, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    secret: str = Field(min_length=32, max_length=128)
    #: "asked" (Get the log on the Players page) or "update" (after an update).
    reason: str = Field(default="asked", max_length=40)
    text: str = Field(max_length=MAX_APP_LOG_CHARS)


class PlayerAppLogOut(BaseModel):
    text: str
    reason: str
    received_at: datetime


class PlayerAppUpdate(BaseModel):
    """A newer Mini PC app to install now, from this server."""

    version: str
    sha256: str
    size: int
    url: str


class PlayerAppReply(BaseModel):
    #: "restart_output", "reboot" or "shutdown", each to do once.
    commands: list[str] = Field(default_factory=list)
    #: Install this version now (apps that update themselves only).
    update: PlayerAppUpdate | None = None


#: A small JPEG, base64: about 20 KB at the size the live view asks for.
MAX_PICTURE_CHARS = 400_000


class PlayerPicture(BaseModel):
    """A copy of the frame the player page is drawing, for the live view (base64 JPEG)."""

    image: str = Field(min_length=16, max_length=MAX_PICTURE_CHARS)


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


class RemoveResult(BaseModel):
    #: Outputs put back as they were before calibration.
    restored: list[int] = Field(default_factory=list)


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
    #: "snapshot": send a fresh photo; "background": re-learn the empty scene;
    #: "live": a new photo about every second for ``seconds``; "stop_live".
    command: Literal["snapshot", "background", "live", "stop_live"]
    seconds: int = Field(default=90, ge=5, le=600)


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
    #: How long ago the camera took the picture, by the camera's own clock (ms).
    age_ms: float | None = None
    #: When it took the picture in server time (ms), from a camera whose
    #: clock is in step with the server's; counts the network hop too.
    captured_at: float | None = None


# -- scenes ----------------------------------------------------------------------

#: What a layer draws. The renderer (frontend/src/mapping/scene/) knows each.
LayerType = Literal[
    # people
    "glow", "ripples", "trails", "particles", "shadows", "reveal", "distort",
    # look
    "wash", "field", "texture", "outline", "lights", "falling", "shapes",
    # a picture from the media library, such as one painted by "Paint the house"
    "picture",
    # days until Christmas as holiday graphics
    "countdown",
]
#: What makes a layer stronger: someone there, how fast people move, how many
#: there are, how close they come, or nothing (always at full strength).
ReactsTo = Literal["presence", "movement", "count", "closeness", "always"]
#: Which traced surfaces a layer is drawn on; "everywhere" ignores them.
LayerTarget = Literal[
    "everywhere", "building", "walls", "roof", "windows", "doors", "outside", "ground"
]
LayerBlend = Literal["normal", "add", "screen"]
#: How an object moves by itself, changes by itself, and what it does when a
#: person comes near (see frontend/src/mapping/scene/catalog.ts).
Motion = Literal["none", "bob", "sway", "spin", "drift", "bounce", "orbit", "rise", "flutter"]
Change = Literal["none", "pulse", "twinkle", "colour", "flicker", "blink"]
NearAction = Literal["none", "light", "grow", "shrink", "colour", "spin", "flee", "follow",
                     "jump", "dance", "appear", "hide", "burst"]

MAX_LAYERS = 12
_HEX = r"^#[0-9a-fA-F]{6}$"


def _layer_id() -> str:
    return uuid.uuid4().hex[:8]


#: Most objects one layer can have placed by hand (the renderer's limit).
MAX_PINS = 64


class ObjectPin(BaseModel):
    """An object (or a countdown) placed by hand: where on the canvas (0..1
    across and down), how big compared with the layer's size, and how far
    it is turned."""
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    size: float = Field(default=1.0, ge=0.3, le=3)
    #: Degrees clockwise.
    rotation: float = Field(default=0.0, ge=-180, le=180)


class CountdownColors(BaseModel):
    """A countdown's own colour for each part, picked over its look. A part
    left empty keeps the look's own colouring; the banner and the glow are
    the layer's ``color`` and ``color2``."""
    #: The big number (and the greeting on the day itself).
    number: str | None = Field(default=None, pattern=_HEX)
    #: The number's 3D side.
    depth: str | None = Field(default=None, pattern=_HEX)
    #: The small words over the number ("Only") and the lines beside them.
    top: str | None = Field(default=None, pattern=_HEX)
    #: The words on the banner ("Days until Christmas").
    caption: str | None = Field(default=None, pattern=_HEX)
    #: The stitching along the banner's edges.
    stitch: str | None = Field(default=None, pattern=_HEX)
    #: The ticking clock's numbers and dots.
    clock: str | None = Field(default=None, pattern=_HEX)
    #: The words under the clock ("Hours", "Minutes", "Seconds").
    labels: str | None = Field(default=None, pattern=_HEX)
    #: Holly, snowflakes, peppermints, pumpkins, ghosts, bats and stars.
    decorations: str | None = Field(default=None, pattern=_HEX)


class SceneLayer(BaseModel):
    """One layer of a scene. Every type reads the same few dials; what each
    dial means for a type (brush size, how many particles...) is the
    renderer's business, so the stored shape never changes per type."""
    id: str = Field(default_factory=_layer_id, min_length=1, max_length=32,
                    pattern=r"^[A-Za-z0-9_-]+$")
    type: LayerType
    name: str = Field(default="", max_length=64)
    enabled: bool = True
    opacity: float = Field(default=1.0, ge=0, le=1)
    blend: LayerBlend = "add"
    color: str = Field(default="#38bdf8", pattern=_HEX)
    color2: str = Field(default="#f472b6", pattern=_HEX)
    size: float = Field(default=0.5, ge=0, le=1)
    speed: float = Field(default=0.5, ge=0, le=1)
    amount: float = Field(default=0.5, ge=0, le=1)
    fade: float = Field(default=0.5, ge=0, le=1)
    #: A variant of the type, such as "snow" for falling or "icing" for outline.
    style: str = Field(default="", max_length=32)
    target: LayerTarget = "everywhere"
    reacts_to: ReactsTo = "presence"
    #: How much the reaction matters: 0 ignores it, 1 is off without it.
    reaction: float = Field(default=0.7, ge=0, le=1)
    #: None (scenes saved before these existed) means the type's usual.
    motion: Motion | None = None
    change: Change | None = None
    near: NearAction | None = None
    #: How far from a person objects notice them.
    reach: float = Field(default=0.5, ge=0, le=1)
    #: Objects placed by hand. None spreads them over the layer's area; a
    #: list, even an empty one, shows only the placed ones.
    pins: list[ObjectPin] | None = Field(default=None, max_length=MAX_PINS)
    #: The image a "picture" layer shows (stretched over the whole canvas).
    media_id: int | None = None
    #: A countdown's colour for each part; None keeps its look's colours.
    colors: CountdownColors | None = None


class SceneBase(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str = Field(default="", max_length=1000)
    #: Bottom layer first.
    layers: list[SceneLayer] = Field(default_factory=list, max_length=MAX_LAYERS)


class SceneCreate(SceneBase):
    pass


class SceneUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=1000)
    layers: list[SceneLayer] | None = Field(default=None, max_length=MAX_LAYERS)


class SceneOut(SceneBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime


class SimulatedPerson(BaseModel):
    id: int = Field(ge=0)
    #: Canvas fractions.
    x: float = Field(ge=-0.5, le=1.5)
    y: float = Field(ge=-0.5, le=1.5)
    z: float | None = Field(default=None, ge=0, le=100)
    size: float = Field(default=0.05, ge=0, le=2)


class SimulatedPeople(BaseModel):
    """People made up in the scene builder, sent to every output as if a
    camera saw them, so a scene can be tried on the projectors."""
    show_id: int
    people: list[SimulatedPerson] = Field(default_factory=list, max_length=16)


class AiStatus(BaseModel):
    #: A key is set, so "Describe a scene" can be offered.
    available: bool
    #: The last four characters, to recognise the key; never the key.
    key_hint: str | None = None
    #: Where the key came from: "settings" or "environment".
    source: str | None = None


class AiKey(BaseModel):
    key: str = Field(min_length=20, max_length=300)


class DescribeScene(BaseModel):
    prompt: str = Field(min_length=3, max_length=2000)
    #: The show it will play on, so traced surfaces can be decorated.
    show_id: int | None = None
    #: Change this scene instead of starting a new one.
    scene_id: int | None = None


class PaintHouse(BaseModel):
    """Repaint a picture of the building (lined up with the canvas) as described."""
    prompt: str = Field(min_length=3, max_length=2000)
    #: The picture, as base64 JPEG or PNG, already the canvas's shape.
    image: str = Field(min_length=100, max_length=30_000_000)
    show_id: int


class TraceHousePhoto(BaseModel):
    """A photo of the house for Claude to trace, as base64 JPEG, PNG or WebP."""
    image: str = Field(min_length=100, max_length=15_000_000)
    width: int = Field(ge=64, le=8000)
    height: int = Field(ge=64, le=8000)


class TracedPart(BaseModel):
    kind: SurfaceKind
    name: str
    #: Outline in fractions of the photo.
    points: list[Point]


class TracedHouse(BaseModel):
    #: The house in a sentence or two, for designing its scene.
    description: str = ""
    parts: list[TracedPart]


class HousePhoto(BaseModel):
    """The show's photo of the house and how it lines up with the canvas."""
    media_id: int
    #: Where the canvas's corners are on the photo (TL, TR, BR, BL), in
    #: fractions of the photo; outside it when the canvas reaches past it.
    corners: list[Point]
    description: str = Field(default="", max_length=600)

    @field_validator("corners")
    @classmethod
    def _four(cls, corners: list[Point]) -> list[Point]:
        if len(corners) != 4:
            raise ValueError("the photo needs exactly four corners (TL, TR, BR, BL)")
        for point in corners:
            _check_point(point, "corner")
        return corners


# -- emergency stop --------------------------------------------------------------


class EmergencyProjector(BaseModel):
    projector_id: int
    name: str | None = None
    #: "off" (took the power off), "waiting" (busy; held and sent by itself
    #: once it accepts), "already_off" (off or cooling; nothing sent),
    #: "failed" (did not take it; may still be on).
    result: Literal["off", "waiting", "already_off", "failed"]
    #: What happened, in words, for the operator.
    detail: str
    #: Raw outcomes of the commands sent, when they were sent.
    shutter: str | None = None
    power: str | None = None
    error: str | None = None


class EmergencyPlayer(BaseModel):
    id: int
    name: str
    #: Connected now, so it went black at once; one that is not goes black
    #: as soon as it reconnects.
    online: bool


class EmergencyResult(BaseModel):
    transport: TransportState
    projectors: list[EmergencyProjector] = Field(default_factory=list)
    players: list[EmergencyPlayer] = Field(default_factory=list)
    #: Names of the automations that were running and were stopped.
    automations_stopped: list[str] = Field(default_factory=list)
