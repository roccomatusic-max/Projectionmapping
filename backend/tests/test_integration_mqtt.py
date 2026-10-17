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
