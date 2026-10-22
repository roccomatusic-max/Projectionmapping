"""Projector power and shutter."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .coordinator import ProjectorControlConfigEntry, ProjectorControlCoordinator
from .entity import ProjectorEntity, add_projector_entities

PARALLEL_UPDATES = 0


async def async_setup_entry(hass: HomeAssistant, entry: ProjectorControlConfigEntry,
                            async_add_entities: AddEntitiesCallback) -> None:
    def build(coordinator: ProjectorControlCoordinator, projector: dict[str, Any]):
        can = projector.get("can", {})
        if can.get("power"):
            yield PowerSwitch(coordinator, projector, "power")
        if can.get("shutter"):
            yield ShutterSwitch(coordinator, projector, "shutter")

    add_projector_entities(entry, async_add_entities, build)


class PowerSwitch(ProjectorEntity, SwitchEntity):
    """On while the projector is on or starting up.

    Turning it on while the projector cools down is fine: the server holds
    the command and sends it as soon as the projector will take it.
    """

    _attr_icon = "mdi:projector"

    @property
    def is_on(self) -> bool | None:
        power = (self.data or {}).get("power")
        if power in ("on", "warming"):
            return True
        if power in ("off", "cooling"):
            return False
        return None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {"power": (self.data or {}).get("power")}

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.coordinator.run(lambda: self.coordinator.api.power(self.projector_id, True))

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.coordinator.run(lambda: self.coordinator.api.power(self.projector_id, False))


class ShutterSwitch(ProjectorEntity, SwitchEntity):
    """On means the shutter is open and the picture shows."""

    _attr_icon = "mdi:projector-screen-outline"

    @property
    def is_on(self) -> bool | None:
        shutter = (self.data or {}).get("shutter")
        if shutter == "open":
            return True
        if shutter == "closed":
            return False
        return None

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.coordinator.run(lambda: self.coordinator.api.shutter(self.projector_id, True))

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.coordinator.run(
            lambda: self.coordinator.api.shutter(self.projector_id, False))
