"""The show's buttons: GO, pause, resume, stop, blackout and the emergency stop."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .coordinator import ProjectorControlConfigEntry, ProjectorControlCoordinator
from .entity import ShowEntity

PARALLEL_UPDATES = 0


async def async_setup_entry(hass: HomeAssistant, entry: ProjectorControlConfigEntry,
                            async_add_entities: AddEntitiesCallback) -> None:
    coordinator = entry.runtime_data
    async_add_entities([
        GoButton(coordinator, "go", "mdi:play"),
        TransportButton(coordinator, "pause", "mdi:pause"),
        TransportButton(coordinator, "resume", "mdi:play-pause"),
        TransportButton(coordinator, "stop", "mdi:stop"),
        TransportButton(coordinator, "blackout", "mdi:television-off"),
        EmergencyStopButton(coordinator, "emergency_stop", "mdi:alert-octagon"),
        ClearEmergencyButton(coordinator, "emergency_clear", "mdi:restore"),
    ])


class ShowButton(ShowEntity, ButtonEntity):
    def __init__(self, coordinator: ProjectorControlCoordinator, key: str, icon: str) -> None:
        super().__init__(coordinator, key)
        self.action = key
        self._attr_icon = icon


class TransportButton(ShowButton):
    async def async_press(self) -> None:
        await self.coordinator.run(lambda: self.coordinator.api.transport(self.action))


class GoButton(ShowButton):
    """The next cue of the chosen show; its first cue if another show was playing."""

    async def async_press(self) -> None:
        coordinator = self.coordinator
        if coordinator.show.get("emergency"):
            raise HomeAssistantError(
                "The emergency stop is on. Press Clear emergency stop first.")
        show_id = coordinator.target_show_id
        shows = coordinator.data.get("shows", [])
        if show_id is None and len(shows) == 1:
            show_id = shows[0]["id"]
        if show_id is None:
            raise HomeAssistantError("Pick a show in the Show list first.")
        await coordinator.run(lambda: coordinator.api.transport("go", show_id=show_id))


class EmergencyStopButton(ShowButton):
    """Stops the show, blacks every mini PC and turns every projector off.

    No confirmation step here, on purpose. Add one on a dashboard card if a
    stray tap is a worry; an automation should be able to press it.
    """

    async def async_press(self) -> None:
        await self.coordinator.run(self.coordinator.api.emergency_stop)


class ClearEmergencyButton(ShowButton):
    """Lifts the hold after an emergency stop. Turns nothing back on."""

    async def async_press(self) -> None:
        await self.coordinator.run(self.coordinator.api.emergency_clear)
