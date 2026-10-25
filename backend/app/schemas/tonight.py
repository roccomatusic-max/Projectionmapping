"""Scene groups and tonight's show, as the home page reads and sets them."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

#: "HH:MM", 24-hour.
TIME_PATTERN = r"^([01]\d|2[0-3]):[0-5]\d$"


class SceneGroupBase(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    #: The scene for every projector not listed in ``output_scenes``.
    scene_id: int | None = None
    #: {output id: scene id, or None for no scene there}.
    output_scenes: dict[int, int | None] = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Give the group a name")
        return value


class SceneGroupCreate(SceneGroupBase):
    show_id: int


class SceneGroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    scene_id: int | None = None
    output_scenes: dict[int, int | None] | None = None

    @field_validator("name")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Give the group a name")
        return value


class SceneGroupOut(SceneGroupBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    show_id: int
    position: int
    updated_at: datetime


class PlanUpdate(BaseModel):
    show_id: int | None = None
    enabled: bool | None = None
    start_at: str | None = Field(default=None, pattern=TIME_PATTERN)
    end_at: str | None = Field(default=None, pattern=TIME_PATTERN)
    days: list[int] | None = Field(default=None, max_length=7)
    power: bool | None = None

    @field_validator("days")
    @classmethod
    def _days(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return None
        if any(day < 0 or day > 6 for day in value):
            raise ValueError("Days are 0 (Monday) to 6 (Sunday)")
        return sorted(set(value))


#: off: no show time set, or switched off. later: starts later today.
#: running: inside tonight's show time. done: finished for tonight.
#: not_tonight: does not run on today's weekday.
PlanState = Literal["off", "later", "running", "done", "not_tonight"]


class SlotOut(BaseModel):
    """One show time on one night."""

    key: str
    source: Literal["weekly", "calendar"]
    entry_id: int | None
    title: str
    show_id: int | None
    group_id: int | None
    group_name: str | None
    starts_at: datetime
    ends_at: datetime
    power: bool


class TonightOut(BaseModel):
    show_id: int | None
    show_name: str | None
    group_id: int | None
    group_name: str | None
    enabled: bool
    start_at: str | None
    end_at: str | None
    days: list[int]
    power: bool
    state: PlanState
    #: Tonight's show time (the one running, or today's), when there is one.
    starts_at: datetime | None
    ends_at: datetime | None
    #: The next start still to come, which may be a later night.
    next_starts_at: datetime | None
    #: Where the show time shown comes from: "weekly", "calendar", or None.
    source: Literal["weekly", "calendar"] | None = None
    #: Its name, and the calendar entry it comes from.
    title: str | None = None
    entry_id: int | None = None
    #: Every show time today, from the calendar or the weekly show time.
    tonight_slots: list[SlotOut] = Field(default_factory=list)
    #: The name of the calendar's "no show" entry keeping tonight dark.
    cancelled_by: str | None = None
    #: The name of the next show to start.
    next_title: str | None = None
    last_message: str
    #: The zone the times are kept in, such as "America/New_York".
    timezone: str


class TonightAction(BaseModel):
    ok: bool
    message: str
    tonight: TonightOut
