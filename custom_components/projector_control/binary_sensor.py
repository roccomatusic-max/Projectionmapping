"""Whether each projector answers, whether it reports a problem, and the emergency stop."""

from __future__ import annotations

from typing import Any

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .coordinator import ProjectorControlConfigEntry, ProjectorControlCoordinator
from .entity import ProjectorEntity, ShowEntity, add_projector_entities


async def async_setup_entry(hass: HomeAssistant, entry: ProjectorControlConfigEntry,
                            async_add_entities: AddEntitiesCallback) -> None:
    coordinator = entry.runtime_data
    async_add_entities([EmergencySensor(coordinator, "emergency")])

    def build(coordinator: ProjectorControlCoordinator, projector: dict[str, Any]):
        yield ConnectedSensor(coordinator, projector, "connected")
        yield ProblemSensor(coordinator, projector, "problem")

    add_projector_entities(entry, async_add_entities, build)


class EmergencySensor(ShowEntity, BinarySensorEntity):
    """On while the emergency stop is on (until someone presses Clear)."""

    # No device class: "safety" would show Safe/Unsafe, which reads oddly
    # next to "Emergency stop on". Plain On/Off says it.
    _attr_icon = "mdi:alert-octagon"

    @property
    def is_on(self) -> bool:
        return bool(self.coordinator.show.get("emergency"))

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        show = self.coordinator.show
        return {"pressed_by": show.get("emergency_by"), "pressed_at": show.get("emergency_at")}


class ConnectedSensor(ProjectorEntity, BinarySensorEntity):
    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY
    always_available = True

    @property
    def is_on(self) -> bool:
        return bool((self.data or {}).get("online"))

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {"last_error": (self.data or {}).get("last_error")}


class ProblemSensor(ProjectorEntity, BinarySensorEntity):
    """On when the projector itself reports a warning or a fault."""

    _attr_device_class = BinarySensorDeviceClass.PROBLEM

    @property
    def is_on(self) -> bool | None:
        health = (self.data or {}).get("health")
        if health in (None, "unknown"):
            return None
        return health != "ok"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        data = self.data or {}
        return {"health": data.get("health"), "errors": data.get("errors", []),
                "warnings": data.get("warnings", [])}
