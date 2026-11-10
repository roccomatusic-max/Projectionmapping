"""Projector Control: projectors, the show and the emergency stop in Home Assistant.

Talks to a Projector Control server on the local network (the Mac or
Windows server app). Set up from Settings > Devices & services; the install
line from Projector Control's Settings > Home Assistant fills the form in.
"""

from __future__ import annotations

from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.loader import async_get_integration

from .api import ProjectorControlApi
from .const import CONF_KEY, CONF_URL, DOMAIN
from .coordinator import ProjectorControlConfigEntry, ProjectorControlCoordinator

PLATFORMS: list[Platform] = [
    Platform.BINARY_SENSOR,
    Platform.BUTTON,
    Platform.SCENE,
    Platform.SELECT,
    Platform.SENSOR,
    Platform.SWITCH,
    Platform.UPDATE,
]


async def async_setup_entry(hass: HomeAssistant, entry: ProjectorControlConfigEntry) -> bool:
    integration = await async_get_integration(hass, DOMAIN)
    api = ProjectorControlApi(async_get_clientsession(hass), entry.data[CONF_URL],
                              entry.data[CONF_KEY], version=str(integration.version or ""))
    coordinator = ProjectorControlCoordinator(hass, entry, api)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ProjectorControlConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
