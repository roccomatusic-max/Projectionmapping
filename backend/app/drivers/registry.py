"""Driver registry.

Adding a manufacturer means adding a module and one ``register()`` call. No
other part of the platform imports a concrete driver class.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass

from .base import ConnectionConfig, ProjectorDriver
from .panasonic_ptdz13k import PanasonicPTDZ13KDriver
from .pjlink import PJLinkDriver


@dataclass(frozen=True, slots=True)
class DriverInfo:
    driver_id: str
    display_name: str
    default_port: int
    manufacturer: str
    models: tuple[str, ...]
    factory: Callable[[ConnectionConfig], ProjectorDriver]

    def as_dict(self) -> dict:
        return {
            "driver_id": self.driver_id,
            "display_name": self.display_name,
            "default_port": self.default_port,
            "manufacturer": self.manufacturer,
            "models": list(self.models),
        }


_REGISTRY: dict[str, DriverInfo] = {}


def register(info: DriverInfo) -> None:
    _REGISTRY[info.driver_id] = info


def get(driver_id: str) -> DriverInfo:
    try:
        return _REGISTRY[driver_id]
    except KeyError:
        raise KeyError(
            f"unknown driver {driver_id!r}; registered: {', '.join(sorted(_REGISTRY))}"
        ) from None


def available() -> Iterable[DriverInfo]:
    return sorted(_REGISTRY.values(), key=lambda d: (d.manufacturer, d.display_name))


def build(driver_id: str, config: ConnectionConfig) -> ProjectorDriver:
    info = get(driver_id)
    if not config.port:
        config.port = info.default_port
    return info.factory(config)


def capability_manifest(driver_id: str) -> dict:
    """Manifest for a driver without opening a connection.

    Used by the UI to decide which controls to render before a device has ever
    been polled.
    """
    info = get(driver_id)
    probe = info.factory(ConnectionConfig(host="0.0.0.0", port=info.default_port))
    return probe.capabilities.as_dict()


register(DriverInfo(
    driver_id=PanasonicPTDZ13KDriver.driver_id,
    display_name=PanasonicPTDZ13KDriver.display_name,
    default_port=PanasonicPTDZ13KDriver.default_port,
    manufacturer="Panasonic",
    models=("PT-DZ13K", "PT-DS12K", "PT-DW11K", "PT-DZ10K"),
    factory=PanasonicPTDZ13KDriver,
))

register(DriverInfo(
    driver_id=PJLinkDriver.driver_id,
    display_name=PJLinkDriver.display_name,
    default_port=PJLinkDriver.default_port,
    manufacturer="Any (PJLink)",
    models=("Any PJLink class 1 or 2 projector",),
    factory=PJLinkDriver,
))
