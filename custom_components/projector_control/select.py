"""Projector input, and which show and cue the show plays."""

from __future__ import annotations

from typing import Any

from homeassistant.components.select import SelectEntity
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .coordinator import ProjectorControlConfigEntry, ProjectorControlCoordinator
from .entity import ProjectorEntity, ShowEntity, add_projector_entities

PARALLEL_UPDATES = 0


async def async_setup_entry(hass: HomeAssistant, entry: ProjectorControlConfigEntry,
                            async_add_entities: AddEntitiesCallback) -> None:
    coordinator = entry.runtime_data
    async_add_entities([ShowSelect(coordinator, "show_select"),
                        CueSelect(coordinator, "cue_select")])

    def build(coordinator: ProjectorControlCoordinator, projector: dict[str, Any]):
        if projector.get("can", {}).get("input"):
            yield InputSelect(coordinator, projector, "input")

    add_projector_entities(entry, async_add_entities, build)


class InputSelect(ProjectorEntity, SelectEntity):
    _attr_icon = "mdi:video-input-hdmi"

    @property
    def options(self) -> list[str]:
        data = self.data or {}
        labels = [i["label"] for i in data.get("inputs", [])]
        current = (data.get("input") or {}).get("label")
        if current and current not in labels:
            labels.append(current)
        return labels

    @property
    def current_option(self) -> str | None:
        return ((self.data or {}).get("input") or {}).get("label")

    async def async_select_option(self, option: str) -> None:
        code = next((i["code"] for i in (self.data or {}).get("inputs", [])
                     if i["label"] == option), None)
        if code is None:
            raise HomeAssistantError(f"{option} is not an input this projector offers.")
        await self.coordinator.run(lambda: self.coordinator.api.input(self.projector_id, code))


class ShowSelect(ShowEntity, SelectEntity):
    """Which show GO plays. Picking one starts nothing by itself."""

    _attr_icon = "mdi:movie-open-outline"

    @property
    def available(self) -> bool:
        return super().available and bool(self.coordinator.data.get("shows"))

    @property
    def options(self) -> list[str]:
        return [s["name"] for s in (self.coordinator.data or {}).get("shows", [])]

    @property
    def current_option(self) -> str | None:
        show = self.coordinator.show_by_id(self.coordinator.target_show_id)
        return show["name"] if show else None

    async def async_select_option(self, option: str) -> None:
        show = next((s for s in self.coordinator.data.get("shows", []) if s["name"] == option),
                    None)
        if show is None:
            raise HomeAssistantError(f"There is no show called {option}.")
        loaded = self.coordinator.show.get("show_id")
        self.coordinator.chosen_show_id = None if show["id"] == loaded else show["id"]
        self.coordinator.async_update_listeners()


def cue_label(cue: dict[str, Any]) -> str:
    return f"{cue['position'] + 1}. {cue.get('name') or 'Cue'}"


class CueSelect(ShowEntity, SelectEntity):
    """The cue playing now; picking one jumps straight to it."""

    _attr_icon = "mdi:format-list-numbered"

    def _show(self) -> dict[str, Any] | None:
        return self.coordinator.show_by_id(self.coordinator.target_show_id)

    @property
    def available(self) -> bool:
        show = self._show()
        return super().available and bool(show and show.get("cues"))

    @property
    def options(self) -> list[str]:
        show = self._show()
        return [cue_label(c) for c in show.get("cues", [])] if show else []

    @property
    def current_option(self) -> str | None:
        state = self.coordinator.show
        show = self._show()
        if not show or state.get("show_id") != show["id"] or state.get("cue_position") is None:
            return None
        cue = next((c for c in show["cues"] if c["position"] == state["cue_position"]), None)
        return cue_label(cue) if cue else None

    async def async_select_option(self, option: str) -> None:
        show = self._show()
        cue = next((c for c in (show or {}).get("cues", []) if cue_label(c) == option), None)
        if show is None or cue is None:
            raise HomeAssistantError(f"There is no cue {option}.")
        await self.coordinator.run(lambda: self.coordinator.api.transport(
            "goto", show_id=show["id"], cue=cue["position"]))
