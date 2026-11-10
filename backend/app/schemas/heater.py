"""Heaters in projector boxes. Temperatures in °C; the pages show °F."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

PlugKind = Literal["shelly", "tasmota", "home_assistant"]
Celsius = Field(ge=-40, le=60)


class PlugIn(BaseModel):
    plug_kind: PlugKind = "shelly"
    plug_address: str = Field(min_length=1, max_length=255)
    plug_entity: str | None = Field(default=None, max_length=255)
    #: The plug's password or Home Assistant's token. None keeps the saved one;
    #: an empty string removes it.
    plug_secret: str | None = Field(default=None, max_length=1024)

    @model_validator(mode="after")
    def _tidy(self):
        self.plug_address = self.plug_address.strip()
        if any(c.isspace() for c in self.plug_address):
            raise ValueError("The plug's address has a space in it.")
        if self.plug_kind == "home_assistant" and not (self.plug_entity or "").strip():
            raise ValueError("Type the plug's entity from Home Assistant, like switch.box_heater.")
        return self


class PlugTestIn(PlugIn):
    #: Test a saved heater's plug with its saved password.
    heater_id: int | None = None


class PlugTestOut(BaseModel):
    ok: bool
    on: bool | None = None
    model: str | None = None
    message: str


class HeaterIn(PlugIn):
    name: str = Field(min_length=1, max_length=128)
    sensor_player_id: int | None = None
    projector_id: int | None = None
    on_below_c: float = Celsius
    off_above_c: float = Celsius
    max_inside_c: float = Field(ge=0, le=60)
    outside_on_below_c: float = Celsius
    outside_off_above_c: float = Celsius
    max_minutes_per_hour: int = Field(ge=5, le=60)
    interlock: bool = True
    warmup_minutes: int = Field(default=30, ge=0, le=180)

    @model_validator(mode="after")
    def _check(self):
        self.name = self.name.strip()
        if not self.name:
            raise ValueError("Give the heater a name.")
        if self.off_above_c <= self.on_below_c:
            raise ValueError("The 'off at' temperature must be warmer than the 'on below' one.")
        if self.max_inside_c <= self.off_above_c:
            raise ValueError("The safety limit must be warmer than the 'off at' temperature.")
        if self.outside_off_above_c <= self.outside_on_below_c:
            raise ValueError("Outside, the 'off at' temperature must be warmer than 'on below'.")
        if self.interlock and self.projector_id is None:
            raise ValueError("Pick the projector in this box, so the heater can stay off while "
                             "it is on.")
        return self


class HeaterMode(BaseModel):
    mode: Literal["auto", "on", "off"]


class InsideOut(BaseModel):
    celsius: float
    source: Literal["sensor", "projector"]
    at: datetime


class HeaterOut(BaseModel):
    id: int
    name: str
    plug_kind: PlugKind
    plug_address: str
    plug_entity: str | None
    has_secret: bool
    sensor_player_id: int | None
    projector_id: int | None
    on_below_c: float
    off_above_c: float
    max_inside_c: float
    outside_on_below_c: float
    outside_off_above_c: float
    max_minutes_per_hour: int
    interlock: bool
    warmup_minutes: int
    mode: Literal["auto", "on", "off"]
    hold_until: datetime | None
    rest_until: datetime | None
    is_on: bool | None
    on_since: datetime | None
    reason: str
    plug_error: str | None
    inside: InsideOut | None
    #: Whether its projector is on (warming, cooling); None when not known.
    projector_on: bool | None
    #: When the next warm-up before a show starts, if one is planned.
    warmup_at: datetime | None
    show_at: datetime | None


class WeatherPlaceIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class OutsideOut(BaseModel):
    place: WeatherPlaceIn | None
    celsius: float | None
    fetched_at: datetime | None
    error: str | None


class UsbSensorOut(BaseModel):
    player_id: int
    player_name: str
    name: str
    celsius: float
    humidity: float | None
    at: datetime


class HeatersOverview(BaseModel):
    heaters: list[HeaterOut]
    outside: OutsideOut
    sensors: list[UsbSensorOut]


class HeaterPoint(BaseModel):
    t: int  # milliseconds since 1970, for the chart
    inside: float | None
    outside: float | None
    #: Share of the slice it was on, 0 to 1.
    on: float | None


class HeaterHistory(BaseModel):
    heater_id: int
    since: datetime
    until: datetime
    points: list[HeaterPoint]
    #: Minutes it was on in the range.
    minutes_on: int
