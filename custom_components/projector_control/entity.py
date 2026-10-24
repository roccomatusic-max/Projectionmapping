"""Shared entity plumbing: devices, availability, adding new projectors."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any

from homeassistant.core import callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import Entity
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import ProjectorControlConfigEntry, ProjectorControlCoordinator


def server_device(coordinator: ProjectorControlCoordinator) -> DeviceInfo:
    server = (coordinator.data or {}).get("server", {})
    return DeviceInfo(
        identifiers={(DOMAIN, coordinator.config_entry.entry_id)},
        name=server.get("name") or "Projector Control",
        manufacturer="Projector Control",
        model="Show server",
        sw_version=server.get("version"),
        configuration_url=coordinator.api.url,
    )


class ShowEntity(CoordinatorEntity[ProjectorControlCoordinator]):
    """Something on the server itself: the show, the emergency stop."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: ProjectorControlCoordinator, key: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_{key}"
        self._attr_translation_key = key
        self._attr_device_info = server_device(coordinator)


class ProjectorEntity(CoordinatorEntity[ProjectorControlCoordinator]):
    """Something on one projector. Unavailable while the projector is not answering."""

    _attr_has_entity_name = True
    #: Entities that still make sense when the projector is not answering.
    always_available = False

    def __init__(self, coordinator: ProjectorControlCoordinator, projector: dict[str, Any],
                 key: str) -> None:
        super().__init__(coordinator)
        self.projector_id: int = projector["id"]
        entry_id = coordinator.config_entry.entry_id
        self._attr_unique_id = f"{entry_id}_projector_{self.projector_id}_{key}"
        self._attr_translation_key = key
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{entry_id}_projector_{self.projector_id}")},
            name=projector["name"],
            manufacturer=projector.get("manufacturer") or None,
            model=projector.get("model") or None,
            suggested_area=projector.get("location") or None,
            via_device=(DOMAIN, entry_id),
            configuration_url=f"{coordinator.api.url}/projectors/{self.projector_id}",
        )

    @property
    def data(self) -> dict[str, Any] | None:
        return self.coordinator.projector(self.projector_id)

    @property
    def available(self) -> bool:
        data = self.data
        if not super().available or data is None:
            return False
        return self.always_available or bool(data.get("online"))


def add_projector_entities(
    entry: ProjectorControlConfigEntry,
    async_add_entities: AddEntitiesCallback,
    build: Callable[[ProjectorControlCoordinator, dict[str, Any]], Iterable[Entity]],
) -> None:
    """Add entities for every projector now, and for each one added later.

    ``build`` is asked again on every refresh and may return entities it did
    not return before (a temperature reading that has started to arrive);
    only unique ids not yet added are added.
    """
    coordinator = entry.runtime_data
    added: set[str] = set()

    @callback
    def _add() -> None:
        new = []
        for projector in (coordinator.data or {}).get("projectors", []):
            for entity in build(coordinator, projector):
                if entity.unique_id and entity.unique_id not in added:
                    added.add(entity.unique_id)
                    new.append(entity)
        if new:
            async_add_entities(new)

    _add()
    entry.async_on_unload(coordinator.async_add_listener(_add))
