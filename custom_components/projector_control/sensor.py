"""Readings: the show's status and cue, and each projector's condition."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.const import EntityCategory, UnitOfTemperature, UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .coordinator import ProjectorControlConfigEntry, ProjectorControlCoordinator
from .entity import ProjectorEntity, ShowEntity, add_projector_entities

SHOW_STATES = ["playing", "paused", "stopped", "blackout", "emergency_stop"]
POWER_STATES = ["on", "off", "warming", "cooling"]
CONDITIONS = ["ok", "warning", "error"]


async def async_setup_entry(hass: HomeAssistant, entry: ProjectorControlConfigEntry,
                            async_add_entities: AddEntitiesCallback) -> None:
    coordinator = entry.runtime_data
    async_add_entities([
        ShowStatusSensor(coordinator, "show_status"),
        ShowNameSensor(coordinator, "show_name"),
        CueSensor(coordinator, "cue"),
        CountSensor(coordinator, "alerts", "mdi:bell-alert-outline",
                    lambda d: d["alerts"]["open"],
                    lambda d: {"critical": d["alerts"]["critical"]}),
        CountSensor(coordinator, "mini_pcs_online", "mdi:monitor",
                    lambda d: d["players"]["online"],
                    lambda d: {"approved": d["players"]["approved"]}),
    ])

    def build(coordinator: ProjectorControlCoordinator, projector: dict[str, Any]):
        yield PowerStateSensor(coordinator, projector, "power_state")
        if projector.get("input") or projector.get("can", {}).get("input"):
            yield InputSensor(coordinator, projector, "input_now")
        if projector.get("lamp_hours") is not None:
            yield LampHoursSensor(coordinator, projector, "lamp_hours")
        for reading in projector.get("temperatures", []):
            yield TemperatureSensor(coordinator, projector, reading)
        if projector.get("fan"):
            yield ConditionSensor(coordinator, projector, "fan", "fan")
        if projector.get("temperature_condition"):
            yield ConditionSensor(coordinator, projector, "temperature_condition",
                                  "temperature_condition")

    add_projector_entities(entry, async_add_entities, build)


# -- the show ------------------------------------------------------------------


class ShowStatusSensor(ShowEntity, SensorEntity):
    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = SHOW_STATES
    _attr_icon = "mdi:movie-roll"

    @property
    def native_value(self) -> str | None:
        show = self.coordinator.show
        if show.get("emergency"):
            return "emergency_stop"
        status = show.get("status")
        return status if status in SHOW_STATES else None


class ShowNameSensor(ShowEntity, SensorEntity):
    _attr_icon = "mdi:movie-open-outline"

    @property
    def native_value(self) -> str | None:
        return self.coordinator.show.get("show_name")


class CueSensor(ShowEntity, SensorEntity):
    _attr_icon = "mdi:format-list-numbered"

    @property
    def native_value(self) -> str | None:
        show = self.coordinator.show
        if show.get("cue_position") is None:
            return None
        return f"{show['cue_position'] + 1}. {show.get('cue_name') or 'Cue'}"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        show = self.coordinator.show
        position = show.get("cue_position")
        return {"cue_number": None if position is None else position + 1,
                "cue_name": show.get("cue_name")}


class CountSensor(ShowEntity, SensorEntity):
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, key, icon, value, attributes) -> None:
        super().__init__(coordinator, key)
        self._attr_icon = icon
        self._value = value
        self._attributes = attributes

    @property
    def native_value(self) -> int | None:
        return self._value(self.coordinator.data) if self.coordinator.data else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return self._attributes(self.coordinator.data) if self.coordinator.data else {}


# -- projectors -------------------------------------------------------------------


class PowerStateSensor(ProjectorEntity, SensorEntity):
    """On, off, warming up or cooling down: more than the power switch can say."""

    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = POWER_STATES
    _attr_icon = "mdi:power"

    @property
    def native_value(self) -> str | None:
        power = (self.data or {}).get("power")
        return power if power in POWER_STATES else None


class InputSensor(ProjectorEntity, SensorEntity):
    _attr_icon = "mdi:video-input-hdmi"
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    @property
    def native_value(self) -> str | None:
        return ((self.data or {}).get("input") or {}).get("label")


class LampHoursSensor(ProjectorEntity, SensorEntity):
    _attr_device_class = SensorDeviceClass.DURATION
    _attr_native_unit_of_measurement = UnitOfTime.HOURS
    _attr_state_class = SensorStateClass.TOTAL_INCREASING
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_icon = "mdi:lightbulb-on-outline"
    always_available = True

    @property
    def native_value(self) -> float | None:
        return (self.data or {}).get("lamp_hours")


class TemperatureSensor(ProjectorEntity, SensorEntity):
    """One of the projector's own temperature sensors, in Celsius as it reports
    them (Home Assistant shows Fahrenheit if that is your unit)."""

    _attr_device_class = SensorDeviceClass.TEMPERATURE
    _attr_native_unit_of_measurement = UnitOfTemperature.CELSIUS
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator: ProjectorControlCoordinator, projector: dict[str, Any],
                 reading: dict[str, Any]) -> None:
        self.key: str = reading["key"]
        super().__init__(coordinator, projector, f"temperature_{self.key}")
        self._attr_translation_key = None
        self._attr_name = f"{reading.get('label') or self.key.title()} temperature"

    @property
    def native_value(self) -> float | None:
        reading = next((t for t in (self.data or {}).get("temperatures", [])
                        if t["key"] == self.key), None)
        return reading["celsius"] if reading else None


class ConditionSensor(ProjectorEntity, SensorEntity):
    """The projector's own verdict (via PJLink): ok, warning or error."""

    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = CONDITIONS
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(self, coordinator, projector, key: str, field: str) -> None:
        super().__init__(coordinator, projector, key)
        self.field = field
        self._attr_icon = "mdi:fan" if field == "fan" else "mdi:thermometer-alert"

    @property
    def native_value(self) -> str | None:
        value = (self.data or {}).get(self.field)
        return value if value in CONDITIONS else None
