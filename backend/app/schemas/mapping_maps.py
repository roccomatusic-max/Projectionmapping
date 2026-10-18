"""Saved maps: a show's lined-up outputs and traced house parts, kept by name.

A map file (``MapFile``) is what the download button saves and the load
button reads, so a map can move to another computer. Ids in it (projectors,
players, cameras) mean something only on the computer that saved it; the
server drops the ones it does not know when the map is applied.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.mapping import (
    MAX_SURFACES,
    CalibrationResult,
    CameraView,
    OutputBase,
    ShowOut,
    Surface,
)

#: More outputs than any one building plausibly has; bounds an imported file.
MAX_MAP_OUTPUTS = 32

MAP_FORMAT = "projector-control-map"
MAP_VERSION = 1


class SavedCalibration(CalibrationResult):
    camera_id: int
    captured_at: datetime
    coverage: float = Field(ge=0, le=1)


class MapOutput(OutputBase):
    calibration: SavedCalibration | None = None
    #: Mini PCs that showed this output when the map was saved.
    player_ids: list[int] = Field(default_factory=list, max_length=16)


class MapBody(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str = Field(default="", max_length=2000)
    canvas_width: int = Field(default=3840, ge=16, le=32768)
    canvas_height: int = Field(default=2160, ge=16, le=32768)
    camera_view: CameraView | None = None
    surfaces: list[Surface] = Field(default_factory=list, max_length=MAX_SURFACES)
    outputs: list[MapOutput] = Field(default_factory=list, max_length=MAX_MAP_OUTPUTS)


class MapFile(MapBody):
    """The downloadable file, and what loading one sends back."""
    format: Literal["projector-control-map"] = MAP_FORMAT
    version: int = Field(default=MAP_VERSION, ge=1, le=MAP_VERSION)


class MapSummary(BaseModel):
    id: int
    name: str
    description: str
    canvas_width: int
    canvas_height: int
    output_count: int
    surface_count: int
    calibrated_count: int
    #: Mini PCs that showed the map's outputs when it was saved.
    player_count: int
    output_names: list[str]
    updated_at: datetime


class SaveMap(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str = Field(default="", max_length=2000)
    #: Overwrite a saved map of the same name instead of refusing.
    replace: bool = False


class MapUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=2000)


class ApplyMap(BaseModel):
    map_id: int
    #: The projector outputs: slices, warps, masks, blends, calibration.
    outputs: bool = True
    #: The traced walls, roof, windows and doors.
    surfaces: bool = True
    #: Move the mini PCs that showed the map's outputs onto this show.
    players: bool = True


class MapApplied(BaseModel):
    show: ShowOut
    #: Mini PCs now showing this show's outputs.
    players_moved: int = 0
