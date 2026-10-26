"""The show calendar, as the Calendar page reads and sets it."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.tonight import TIME_PATTERN, SlotOut


class EntryIn(BaseModel):
    #: "show" plays the show; "off" keeps those nights dark.
    kind: Literal["show", "off"] = "show"
    title: str = Field(default="", max_length=128)
    show_id: int | None = None
    group_id: int | None = None
    #: Plays instead of the group when set.
    playlist_id: int | None = None
    start_date: date
    #: The last night; None keeps repeating with no end.
    end_date: date | None = None
    days: list[int] = Field(default_factory=lambda: list(range(7)), max_length=7)
    start_at: str | None = Field(default=None, pattern=TIME_PATTERN)
    end_at: str | None = Field(default=None, pattern=TIME_PATTERN)
    power: bool = True
    note: str = Field(default="", max_length=2000)

    @field_validator("title", "note")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("days")
    @classmethod
    def _days(cls, value: list[int]) -> list[int]:
        if any(day < 0 or day > 6 for day in value):
            raise ValueError("Days are 0 (Monday) to 6 (Sunday)")
        return sorted(set(value))


class EntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kind: Literal["show", "off"]
    title: str
    show_id: int | None
    group_id: int | None
    playlist_id: int | None = None
    start_date: str
    end_date: str | None
    days: list[int]
    start_at: str | None
    end_at: str | None
    power: bool
    note: str
    created_at: datetime
    updated_at: datetime


class CalendarSlot(SlotOut):
    #: done: over. running: on now. later: still to come.
    state: Literal["done", "running", "later"]


class Skipped(BaseModel):
    entry_id: int | None
    title: str
    reason: str


class CalendarDay(BaseModel):
    date: date
    slots: list[CalendarSlot]
    #: The "no show" entry keeping this night dark, if one does.
    cancelled_by: Skipped | None
    #: Shows planned that night that do not play, and why.
    skipped: list[Skipped]


class CalendarOut(BaseModel):
    timezone: str
    today: date
    days: list[CalendarDay]
    entries: list[EntryOut]
