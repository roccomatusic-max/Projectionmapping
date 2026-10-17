"""MQTT publishing and Home Assistant discovery.

Optional: when ``MQTT_ENABLED`` is false nothing here connects, and the rest
of the platform is unaffected. Home Assistant can alternatively consume the
REST API directly — both paths are documented in docs/INTEGRATIONS.md.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from app.config import settings
from app.core.events import bus

log = logging.getLogger(__name__)

try:  # optional dependency
    import aiomqtt
except ImportError:  # pragma: no cover - exercised only without the extra
    aiomqtt = None  # type: ignore[assignment]


def _slug(value: str) -> str:
    return "".join(c if c.isalnum() else "_" for c in value.lower()).strip("_")


class MQTTPublisher:
    """Mirrors projector state onto MQTT and announces HA discovery configs."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._running = False
        self._client: Any = None
        self._queue: asyncio.Queue | None = None
        self._announced: set[str] = set()

    @property
    def enabled(self) -> bool:
        return settings.mqtt_enabled and aiomqtt is not None

    async def start(self) -> None:
        if not settings.mqtt_enabled:
            return
        if aiomqtt is None:
            log.warning("MQTT_ENABLED is set but aiomqtt is not installed; "
                        "install the 'mqtt' extra to enable it")
            return
        if self._running:
            return
        self._running = True
        self._queue = await bus.subscribe()
        self._task = asyncio.create_task(self._run(), name="mqtt-publisher")
        log.info("MQTT publisher started (%s:%s)", settings.mqtt_host, settings.mqtt_port)

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
        if self._queue:
            await bus.unsubscribe(self._queue)
        self._task = None

    async def _run(self) -> None:
        """Reconnecting publish loop.

        A broker outage must never stall the control path, so this task owns
        its own connection and simply drops messages while disconnected.
        """
        assert self._queue is not None
        backoff = 1.0
        while self._running:
            try:
                async with aiomqtt.Client(
                    hostname=settings.mqtt_host, port=settings.mqtt_port,
                    username=settings.mqtt_username, password=settings.mqtt_password,
                ) as client:
                    self._client = client
                    backoff = 1.0
                    log.info("MQTT connected")
                    while self._running:
                        message = await self._queue.get()
                        await self._publish_message(client, message.type, message.payload)
            except asyncio.CancelledError:
                return
            except Exception as exc:  # noqa: BLE001
                self._client = None
                log.warning("MQTT connection lost (%s); retrying in %.0fs", exc, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60.0)

    async def _publish_message(self, client: Any, kind: str, payload: dict[str, Any]) -> None:
        prefix = settings.mqtt_prefix
        if kind == "projector_state":
            pid = payload.get("projector_id")
            name = payload.get("name", f"projector{pid}")
            slug = _slug(name)
            base = f"{prefix}/{slug}"
            await client.publish(f"{base}/state", json.dumps(payload, default=str), retain=True)
            await client.publish(f"{base}/available",
                                 "online" if payload.get("online") else "offline", retain=True)
            await client.publish(f"{base}/power", payload.get("power", "unknown"), retain=True)
            await client.publish(f"{base}/shutter", payload.get("shutter", "unknown"),
                                 retain=True)
            if settings.homeassistant_discovery and slug not in self._announced:
                await self._announce(client, pid, name, slug)
                self._announced.add(slug)
        elif kind in ("alert", "alert_resolved"):
            await client.publish(f"{prefix}/alerts", json.dumps(payload, default=str))
        elif kind == "command_result":
            await client.publish(f"{prefix}/commands", json.dumps(payload, default=str))

    async def _announce(self, client: Any, pid: Any, name: str, slug: str) -> None:
        """Publish Home Assistant MQTT discovery configs.

        Only entities backed by real telemetry are announced. A projector
        whose model has no temperature query does not get a temperature
        sensor in Home Assistant.
        """
        dprefix = settings.homeassistant_discovery_prefix
        base = f"{settings.mqtt_prefix}/{slug}"
        device = {
            "identifiers": [f"projector_{pid}"],
            "name": name,
            "manufacturer": "Panasonic",
            "model": "PT-DZ13K series",
            "via_device": settings.app_name,
        }
        entities = [
            ("switch", "power", {
                "name": f"{name} Power",
                "state_topic": f"{base}/power",
                "command_topic": f"{base}/power/set",
                "payload_on": "on", "payload_off": "off",
                "state_on": "on", "state_off": "off",
            }),
            ("binary_sensor", "online", {
                "name": f"{name} Online",
                "state_topic": f"{base}/available",
                "payload_on": "online", "payload_off": "offline",
                "device_class": "connectivity",
            }),
            ("sensor", "shutter", {
                "name": f"{name} Shutter",
                "state_topic": f"{base}/shutter",
            }),
        ]
        for component, key, config in entities:
            config.update({
                "unique_id": f"projector_{pid}_{key}",
                "availability_topic": f"{base}/available",
                "payload_available": "online",
                "payload_not_available": "offline",
                "device": device,
            })
            await client.publish(
                f"{dprefix}/{component}/projector_{pid}/{key}/config",
                json.dumps(config), retain=True,
            )

    async def publish_alert(self, severity: str, message: str,
                            details: dict[str, Any]) -> None:
        if self._client is None:
            return
        try:
            await self._client.publish(
                f"{settings.mqtt_prefix}/alerts",
                json.dumps({"severity": severity, "message": message,
                            "details": details}, default=str),
            )
        except Exception:  # noqa: BLE001
            log.debug("MQTT alert publish failed", exc_info=True)


mqtt_publisher = MQTTPublisher()
