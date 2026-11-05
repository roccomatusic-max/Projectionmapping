"""Keeps this integration matched to the Projector Control server.

The server carries the integration that goes with it. When the server is
updated and its copy is newer, Home Assistant shows an update here;
installing it downloads that copy from the server and restarts Home
Assistant.
"""

from __future__ import annotations

import io
import shutil
import tarfile
import tempfile
from pathlib import Path
from typing import Any

from homeassistant.components.update import UpdateEntity, UpdateEntityFeature
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.loader import async_get_integration

from .const import DOMAIN
from .coordinator import ProjectorControlConfigEntry, ProjectorControlCoordinator
from .entity import ShowEntity


async def async_setup_entry(hass: HomeAssistant, entry: ProjectorControlConfigEntry,
                            async_add_entities: AddEntitiesCallback) -> None:
    integration = await async_get_integration(hass, DOMAIN)
    async_add_entities([IntegrationUpdate(entry.runtime_data, str(integration.version or "0"),
                                          Path(integration.file_path))])


class IntegrationUpdate(ShowEntity, UpdateEntity):
    _attr_supported_features = UpdateEntityFeature.INSTALL
    _attr_title = "Projector Control integration"
    _attr_release_summary = (
        "Downloads the matching integration from your Projector Control server, then "
        "restarts Home Assistant (about a minute)."
    )

    def __init__(self, coordinator: ProjectorControlCoordinator, installed: str,
                 folder: Path) -> None:
        super().__init__(coordinator, "integration_update")
        self._attr_installed_version = installed
        self.folder = folder

    @property
    def latest_version(self) -> str | None:
        server = (self.coordinator.data or {}).get("server", {})
        return server.get("integration_version") or self.installed_version

    async def async_install(self, version: str | None, backup: bool, **kwargs: Any) -> None:
        package = await self.coordinator.run(self.coordinator.api.package)
        try:
            await self.hass.async_add_executor_job(replace_integration, package, self.folder)
        except (OSError, tarfile.TarError, ValueError) as err:
            raise HomeAssistantError(f"Could not install the update: {err}") from err
        self._attr_installed_version = self.latest_version
        self.async_write_ha_state()
        await self.hass.services.async_call("homeassistant", "restart")


def replace_integration(package: bytes, folder: Path) -> None:
    """Swap ``folder`` for the package's copy, keeping the old one if anything fails."""
    parent = folder.parent
    with tempfile.TemporaryDirectory(dir=parent, prefix=".projector_control-") as tmp:
        with tarfile.open(fileobj=io.BytesIO(package), mode="r:gz") as archive:
            for member in archive.getmembers():
                name = Path(member.name)
                if (name.is_absolute() or ".." in name.parts or name.parts[0] != DOMAIN
                        or not (member.isfile() or member.isdir())):
                    raise ValueError(f"unexpected file in the download: {member.name}")
            archive.extractall(tmp, filter="data")
        fresh = Path(tmp) / DOMAIN
        if not (fresh / "manifest.json").is_file():
            raise ValueError("the download did not contain the integration")
        old = parent / f".{folder.name}.old"
        shutil.rmtree(old, ignore_errors=True)
        folder.rename(old)
        try:
            fresh.rename(folder)
        except OSError:
            old.rename(folder)
            raise
        shutil.rmtree(old, ignore_errors=True)
