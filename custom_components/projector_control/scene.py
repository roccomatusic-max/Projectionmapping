"""Projector scenes made on Projector Control's Automation page."""

from __future__ import annotations

from typing import Any

from homeassistant.components.scene import Scene
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .coordinator import ProjectorControlConfigEntry, ProjectorControlCoordinator
from .entity import ShowEntity

PARALLEL_UPDATES = 0


async def async_setup_entry(hass: HomeAssistant, entry: ProjectorControlConfigEntry,
                            async_add_entities: AddEntitiesCallback) -> None:
    coordinator = entry.runtime_data
    added: set[int] = set()

    @callback
    def _add() -> None:
        new = [ProjectorScene(coordinator, scene)
               for scene in (coordinator.data or {}).get("scenes", [])
               if scene["id"] not in added]
        added.update(scene.scene_id for scene in new)
        if new:
            async_add_entities(new)

    _add()
    entry.async_on_unload(coordinator.async_add_listener(_add))


class ProjectorScene(ShowEntity, Scene):
    _attr_icon = "mdi:palette-outline"

    def __init__(self, coordinator: ProjectorControlCoordinator, scene: dict[str, Any]) -> None:
        super().__init__(coordinator, f"scene_{scene['id']}")
        self.scene_id: int = scene["id"]
        self._attr_translation_key = None
        self._attr_name = scene["name"]

    @property
    def available(self) -> bool:
        return super().available and any(
            s["id"] == self.scene_id for s in self.coordinator.data.get("scenes", []))

    async def async_activate(self, **kwargs: Any) -> None:
        await self.coordinator.run(lambda: self.coordinator.api.scene(self.scene_id))
