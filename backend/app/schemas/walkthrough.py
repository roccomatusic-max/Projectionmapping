"""Walk the yard: checking each projector in turn from the phone (services/walkthrough.py)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

#: What can be wrong with a projector's picture, as the phone offers it.
Problem = Literal["blurry", "off_target", "dark", "wrong_projector", "nothing", "other"]

#: The test picture on the projector being checked: the ID grid (its name,
#: a crosshair, corners and focus marks over the canvas grid) or full white.
WalkPicture = Literal["id", "white"]


class WalkStop(BaseModel):
    """One mini PC and its projector on the walk."""
    player_id: int
    #: The mini PC's name.
    name: str
    output_id: int
    output_name: str
    projector_id: int | None = None
    projector_name: str | None = None
    #: Whether the mini PC answers right now (filled in when it is read).
    online: bool = False
    result: Literal["good", "wrong"] | None = None
    problems: list[Problem] = Field(default_factory=list)
    note: str = ""
    checked_at: datetime | None = None


class WalkState(BaseModel):
    id: str
    started_at: datetime
    started_by: str
    finished_at: datetime | None = None
    #: "walking" while it goes on, "done" when every projector was answered,
    #: "stopped" when it ended before that.
    status: Literal["walking", "done", "stopped"] = "walking"
    #: Why it stopped early, in words.
    reason: str | None = None
    #: The stop whose projector shows the test picture; the others are black.
    index: int = 0
    picture: WalkPicture = "id"
    stops: list[WalkStop]


class WalkOut(BaseModel):
    #: The walk going on now, if any.
    active: WalkState | None = None
    #: The last walk that ended, for "last checked" on Tonight's show.
    last: WalkState | None = None


class WalkStart(BaseModel):
    #: Stop the show first when one is playing. Without it, starting is refused.
    stop_show: bool = False


class WalkAnswer(BaseModel):
    index: int = Field(ge=0)
    result: Literal["good", "wrong"]
    problems: list[Problem] = Field(default_factory=list, max_length=6)
    note: str = Field(default="", max_length=300)


class WalkGoTo(BaseModel):
    index: int = Field(ge=0)


class WalkPictureSet(BaseModel):
    picture: WalkPicture
