"""Keeps one copy of the server's state and refreshes it every few seconds."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed, HomeAssistantError
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import CannotConnect, InvalidAuth, ProjectorControlApi, ProjectorControlError
from .const import DOMAIN, SCAN_INTERVAL

_LOGGER = logging.getLogger(__name__)

type ProjectorControlConfigEntry = ConfigEntry[ProjectorControlCoordinator]


class ProjectorControlCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    config_entry: ProjectorControlConfigEntry

    def __init__(self, hass: HomeAssistant, entry: ProjectorControlConfigEntry,
                 api: ProjectorControlApi) -> None:
        super().__init__(hass, _LOGGER, config_entry=entry, name=DOMAIN,
                         update_interval=SCAN_INTERVAL)
        self.api = api
        #: The show the Show selector picked, for the next GO. Cleared once
        #: that show is the one loaded.
        self.chosen_show_id: int | None = None

    async def _async_update_data(self) -> dict[str, Any]:
        try:
            data = await self.api.state()
        except InvalidAuth as err:
            # Home Assistant then offers "Reconfigure" with a fresh key.
            raise ConfigEntryAuthFailed(str(err)) from err
        except ProjectorControlError as err:
            raise UpdateFailed(str(err)) from err
        if self.chosen_show_id is not None and (
            data["show"].get("show_id") == self.chosen_show_id
            or self.chosen_show_id not in {s["id"] for s in data.get("shows", [])}
        ):
            self.chosen_show_id = None
        return data

    # -- lookups ---------------------------------------------------------------

    def projector(self, projector_id: int) -> dict[str, Any] | None:
        if not self.data:
            return None
        return next((p for p in self.data["projectors"] if p["id"] == projector_id), None)

    @property
    def show(self) -> dict[str, Any]:
        return (self.data or {}).get("show", {})

    def show_by_id(self, show_id: int | None) -> dict[str, Any] | None:
        if show_id is None or not self.data:
            return None
        return next((s for s in self.data.get("shows", []) if s["id"] == show_id), None)

    @property
    def target_show_id(self) -> int | None:
        """The show GO acts on: the one picked in the selector, else the loaded one."""
        return self.chosen_show_id or self.show.get("show_id")

    # -- commands --------------------------------------------------------------

    async def run(self, command: Callable[[], Awaitable[Any]]) -> Any:
        """Send a command, say plainly if it failed, then refresh at once."""
        try:
            return await command()
        except CannotConnect as err:
            raise HomeAssistantError(str(err)) from err
        except InvalidAuth as err:
            raise HomeAssistantError(
                f"Projector Control refused the key: {err} Remove and add the "
                "integration again with a new install line or key."
            ) from err
        except ProjectorControlError as err:
            raise HomeAssistantError(str(err)) from err
        finally:
            # Not the debounced request_refresh: after GO, the cue shown
            # must be the new one at once, even on a second quick press.
            await self.async_refresh()
