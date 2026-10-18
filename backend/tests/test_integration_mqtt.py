"""MQTT topic routing — pure functions, no broker needed."""

from __future__ import annotations

import pytest

from app.services.integration import _slug, parse_command_topic


def test_slug_is_stable_and_topic_safe():
    assert _slug("House Left") == "house_left"
    assert _slug("  Façade / North (2) ") == "fa_ade_north_2"


@pytest.mark.parametrize(("topic", "payload", "expected"), [
    ("projector/house_left/power/set", "on", ("house_left", "power.set", {"state": "on"})),
    ("projector/house_left/power/set", "OFF", ("house_left", "power.set", {"state": "off"})),
    ("projector/house_left/power/set", "1", ("house_left", "power.set", {"state": "on"})),
    ("projector/house_left/shutter/set", "closed",
     ("house_left", "shutter.set", {"state": "closed"})),
    ("projector/house_left/shutter/set", "close",
     ("house_left", "shutter.set", {"state": "closed"})),
    ("projector/house_left/input/set", "hd1", ("house_left", "input.set", {"input": "HD1"})),
])
def test_recognised_commands(topic, payload, expected):
    assert parse_command_topic("projector", topic, payload) == expected


@pytest.mark.parametrize(("topic", "payload"), [
    ("projector/house_left/power/set", "maybe"),        # unknown payload
    ("projector/house_left/lens/set", "1"),             # unknown leaf
    ("projector/house_left/power", "on"),               # not a /set topic
    ("other/house_left/power/set", "on"),               # wrong prefix
    ("projector/house_left/power/set/extra", "on"),     # wrong depth
    ("projector/house_left/input/set", ""),             # empty input
    ("projector/house_left/input/set", "x" * 40),       # absurd input
])
def test_unrecognised_messages_are_ignored(topic, payload):
    assert parse_command_topic("projector", topic, payload) is None


class _FakeClient:
    """Stands in for aiomqtt.Client: records what is published."""

    made: list[_FakeClient] = []

    def __init__(self, **kwargs) -> None:
        self.kwargs = kwargs
        self.topics: list[str] = []
        self.fail = False
        _FakeClient.made.append(self)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def publish(self, topic, payload=None, retain=False):
        if self.fail:
            raise ConnectionError("broker went away")
        self.topics.append(topic)


async def test_connectivity_sensor_can_show_off():
    """The Online sensor reads the availability topic itself; made subject to
    it as well, it could only ever be on or unavailable, never off."""
    from app.services.integration import MQTTPublisher

    client = _FakeClient()
    published = {}

    async def publish(topic, payload=None, retain=False):
        published[topic] = payload

    client.publish = publish
    await MQTTPublisher()._announce(client, 1, "House Left", "house_left")
    import json
    online = json.loads(published["homeassistant/binary_sensor/projector_1/online/config"])
    power = json.loads(published["homeassistant/sensor/projector_1/power_state/config"])
    assert "availability_topic" not in online
    assert power["availability_topic"] == "projector/house_left/available"


async def test_reconnect_announces_discovery_again(monkeypatch):
    """A broker restarted without persistence has lost the retained configs."""
    import asyncio
    import types

    import app.services.integration as integration
    from app.core.events import EventBus

    bus = EventBus()
    _FakeClient.made = []
    monkeypatch.setattr(integration, "bus", bus)
    monkeypatch.setattr(integration, "aiomqtt", types.SimpleNamespace(Client=_FakeClient))
    monkeypatch.setattr(integration.settings, "mqtt_enabled", True)
    monkeypatch.setattr(integration.settings, "homeassistant_discovery", True)
    monkeypatch.setattr(integration.settings, "mqtt_allow_commands", False)
    monkeypatch.setattr(integration.settings, "mqtt_username", "")  # docker-compose's blank
    monkeypatch.setattr(integration.settings, "mqtt_password", "")
    publisher = integration.MQTTPublisher()

    async def no_slugs():
        return None

    monkeypatch.setattr(publisher, "_load_slugs", no_slugs)
    state = {"projector_id": 1, "name": "House Left", "online": True,
             "power": "on", "shutter": "open"}

    async def until(condition):
        for _ in range(100):
            if condition():
                return
            await asyncio.sleep(0.05)
        raise AssertionError("timed out")

    def configs(client):
        return [t for t in client.topics if t.startswith("homeassistant/")]

    await publisher.start()
    try:
        await until(lambda: _FakeClient.made)
        first = _FakeClient.made[0]
        assert first.kwargs["username"] is None and first.kwargs["password"] is None
        bus.publish("projector_state", state)
        await until(lambda: configs(first))
        first.fail = True
        bus.publish("projector_state", state)  # the publish that finds the broker gone
        await until(lambda: len(_FakeClient.made) == 2)
        second = _FakeClient.made[1]
        bus.publish("projector_state", state)
        await until(lambda: second.topics)
        await asyncio.sleep(0.1)
        assert configs(second), second.topics
    finally:
        await publisher.stop()
