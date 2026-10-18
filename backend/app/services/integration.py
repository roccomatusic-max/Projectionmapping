"""MQTT publishing and Home Assistant discovery.

Optional: when ``MQTT_ENABLED`` is false nothing here connects, and the rest
of the platform is unaffected. Home Assistant can alternatively consume the
REST API directly — both paths are documented in docs/INTEGRATIONS.md.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from app.config import settings
from app.core.events import bus
from app.core.lifecycle import stop_task

log = logging.getLogger(__name__)

try:  # optional dependency
    import aiomqtt
except ImportError:  # pragma: no cover - exercised only without the extra
    aiomqtt = None  # type: ignore[assignment]


def _slug(value: str) -> str:
    """ASCII, lower-case, single underscores: safe in MQTT topics and HA ids."""
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


#: <what>/set topics the subscriber understands, and how a payload maps onto
#: a capability call. Anything else on the wildcard is ignored and logged.
COMMAND_TOPICS: dict[str, tuple[str, str, dict[str, str] | None]] = {
    # topic leaf: (capability, param name, allowed payload values or None for free text)
    "power": ("power.set", "state", {"on": "on", "off": "off", "1": "on", "0": "off"}),
    "shutter": ("shutter.set", "state", {"open": "open", "closed": "closed",
                                         "close": "closed", "on": "open", "off": "closed"}),
    "input": ("input.set", "input", None),
}


def parse_command_topic(prefix: str, topic: str, payload: str
                        ) -> tuple[str, str, dict[str, str]] | None:
    """``projector/house_left/power/set`` + ``on`` → (slug, capability, params).

    Returns None for topics or payloads that are not a recognised command.
    """
    parts = topic.split("/")
    if len(parts) != 4 or parts[0] != prefix or parts[3] != "set":
        return None
    slug, leaf = parts[1], parts[2]
    spec = COMMAND_TOPICS.get(leaf)
    if spec is None:
        return None
    capability, param, allowed = spec
    value = payload.strip()
    if allowed is not None:
        mapped = allowed.get(value.lower())
        if mapped is None:
            return None
        value = mapped
    elif not value or len(value) > 16:
        return None
    return slug, capability, {param: value.upper() if param == "input" else value}


class MQTTPublisher:
    """Mirrors projector state onto MQTT and announces HA discovery configs."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._running = False
        self._client: Any = None
        self._queue: asyncio.Queue | None = None
        self._announced: set[str] = set()
        #: name slug -> projector id, for routing inbound command topics.
        self._slugs: dict[str, int] = {}
        #: In-flight inbound commands, each its own task.
        self._commands: set[asyncio.Task] = set()

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
        self._queue = await bus.subscribe(
            ("projector_state", "alert", "alert_resolved", "command_result"))
        await self._load_slugs()
        self._task = asyncio.create_task(self._run(), name="mqtt-publisher")
        log.info("MQTT publisher started (%s:%s, commands %s)", settings.mqtt_host,
                 settings.mqtt_port, "enabled" if settings.mqtt_allow_commands else "disabled")

    async def _load_slugs(self) -> None:
        from sqlalchemy import select

        from app.db.models import Projector
        from app.db.session import session_scope

        async with session_scope() as session:
            rows = (await session.execute(select(Projector.id, Projector.name))).all()
        self._slugs = {_slug(name): pid for pid, name in rows}

    async def stop(self) -> None:
        self._running = False
        for task in list(self._commands):
            task.cancel()
        await asyncio.gather(*self._commands, return_exceptions=True)
        await stop_task(self._task, name="mqtt", grace=2.0)
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
                    # Blank means none: docker-compose passes unset ones as "",
                    # which would otherwise go to the broker as an empty login.
                    username=settings.mqtt_username or None,
                    password=settings.mqtt_password or None,
                ) as client:
                    self._client = client
                    backoff = 1.0
                    # A restarted broker without persistence has lost the
                    # retained discovery configs: announce again.
                    self._announced.clear()
                    log.info("MQTT connected")
                    if settings.mqtt_allow_commands:
                        await client.subscribe(f"{settings.mqtt_prefix}/+/+/set")
                        # Outbound and inbound run side by side; either failing
                        # tears the session down and we reconnect.
                        await asyncio.gather(
                            self._publish_loop(client), self._command_loop(client)
                        )
                    else:
                        await self._publish_loop(client)
            except asyncio.CancelledError:
                return
            except Exception as exc:  # noqa: BLE001
                self._client = None
                log.warning("MQTT connection lost (%s); retrying in %.0fs", exc, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60.0)

    async def _publish_loop(self, client: Any) -> None:
        assert self._queue is not None
        while self._running:
            try:
                message = await asyncio.wait_for(self._queue.get(), timeout=0.5)
            except TimeoutError:
                continue
            await self._publish_message(client, message.type, message.payload)

    async def _command_loop(self, client: Any) -> None:
        """Inbound ``<prefix>/<name>/<power|shutter|input>/set`` messages.

        Each is dispatched through the device manager like any other command,
        so the capability gate, per-device queue and audit log all apply.
        There is no confirmation step on this path: publishing to a command
        topic *is* the deliberate act, which is why it is off by default.
        """
        async for message in client.messages:
            topic = str(message.topic)
            try:
                payload = (message.payload or b"").decode("utf-8", errors="replace")
            except AttributeError:
                payload = str(message.payload)
            # Each command runs as its own task so an unreachable projector
            # (which takes a full timeout to fail) cannot hold up the next
            # command for a live one.
            task = asyncio.create_task(self.handle_command(topic, payload))
            self._commands.add(task)
            task.add_done_callback(self._commands.discard)

    async def handle_command(self, topic: str, payload: str, *,
                             timeout: float = 30.0) -> dict[str, Any] | None:
        """Route one inbound command topic to a projector. Returns the result."""
        from app.services.audit import log_command_results
        from app.services.device_manager import Priority, manager

        parsed = parse_command_topic(settings.mqtt_prefix, topic, payload)
        if parsed is None:
            log.warning("ignoring MQTT message on %s with payload %r", topic, payload[:40])
            return None
        slug, capability, params = parsed
        pid = self._slugs.get(slug)
        worker = manager.get(pid) if pid is not None else None
        if worker is None:
            log.warning("MQTT command for unknown projector %r", slug)
            return None
        result = await worker.execute(
            capability, params, priority=Priority.AUTOMATION, timeout=timeout
        )
        record = {"projector_id": pid, "name": worker.name, **result.as_dict()}
        await log_command_results([record], capability, params, source="mqtt", username="mqtt")
        log.info("MQTT %s on %s -> %s", capability, worker.name, result.outcome.value)
        return record

    async def _publish_message(self, client: Any, kind: str, payload: dict[str, Any]) -> None:
        prefix = settings.mqtt_prefix
        if kind == "projector_state":
            pid = payload.get("projector_id")
            name = payload.get("name", f"projector{pid}")
            slug = _slug(name)
            if isinstance(pid, int):
                self._slugs[slug] = pid
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
            "via_device": settings.app_name,
        }
        entities: list[tuple[str, str, dict[str, Any]]] = [
            ("binary_sensor", "online", {
                "name": f"{name} Online",
                "state_topic": f"{base}/available",
                "payload_on": "online", "payload_off": "offline",
                "device_class": "connectivity",
            }),
            ("sensor", "power_state", {
                "name": f"{name} Power state",
                "state_topic": f"{base}/power",
            }),
        ]
        if settings.mqtt_allow_commands:
            # A switch is only advertised when something listens on its
            # command topic. Otherwise Home Assistant would show a toggle
            # that does nothing — precisely the decorative control this
            # platform refuses to ship.
            entities += [
                ("switch", "power", {
                    "name": f"{name} Power",
                    "state_topic": f"{base}/power",
                    "command_topic": f"{base}/power/set",
                    "payload_on": "on", "payload_off": "off",
                    "state_on": "on", "state_off": "off",
                }),
                ("switch", "shutter", {
                    "name": f"{name} Shutter open",
                    "state_topic": f"{base}/shutter",
                    "command_topic": f"{base}/shutter/set",
                    "payload_on": "open", "payload_off": "closed",
                    "state_on": "open", "state_off": "closed",
                    "icon": "mdi:projector-screen",
                }),
            ]
        else:
            entities.append(("sensor", "shutter", {
                "name": f"{name} Shutter",
                "state_topic": f"{base}/shutter",
            }))
        for component, key, config in entities:
            config.update({"unique_id": f"projector_{pid}_{key}", "device": device})
            if key != "online":
                # Not on the connectivity sensor itself: it reads the same
                # topic, and would show "unavailable" instead of ever "off".
                config.update({
                    "availability_topic": f"{base}/available",
                    "payload_available": "online",
                    "payload_not_available": "offline",
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
