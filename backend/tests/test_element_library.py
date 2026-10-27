"""The element library's new flying and walking characters, objects and live
info boards, and that "Describe a scene" knows every style the Editor offers."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.services import scene_ai
from tests.test_api import api, login  # noqa: F401 - fixture

CATALOG_TS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "mapping" / "scene" / "catalog.ts"


def _frontend_styles(layer_type: str) -> list[str]:
    """The style ids the Editor lists for a layer type, in order."""
    text = CATALOG_TS.read_text(encoding="utf-8")
    start = text.index(f"type: '{layer_type}',")
    block = text[text.index("styles: [", start):]
    block = block[:block.index("\n    ],")]
    return re.findall(r"\{ id: '([a-z0-9-]+)'", block)


@pytest.mark.skipif(not CATALOG_TS.exists(), reason="needs the frontend sources")
@pytest.mark.parametrize("layer_type", ["shapes", "movers", "info", "countdown"])
def test_describe_a_scene_knows_every_style_the_editor_offers(layer_type):
    assert scene_ai.CATALOG[layer_type]["styles"] == _frontend_styles(layer_type)


def test_new_styles_survive_describe_a_scene():
    layers = scene_ai.to_layers([
        {"type": "movers", "style": "witch", "near": "light"},
        {"type": "movers", "style": "ufo", "near": "follow"},
        {"type": "movers", "style": "rockets", "blend": "add"},
        {"type": "shapes", "style": "cauldrons"},
        {"type": "info", "style": "moon"},
        {"type": "info", "style": "new-year"},
    ])
    assert [(layer.type, layer.style) for layer in layers] == [
        ("movers", "witch"), ("movers", "ufo"), ("movers", "rockets"), ("shapes", "cauldrons"),
        ("info", "moon"), ("info", "new-year")]
    assert layers[1].near == "follow"


async def test_a_scene_of_new_elements_saves(api):
    headers = await login(api)
    scene = {
        "name": "Witching hour",
        "layers": [
            {"type": "movers", "style": "witch", "pins": []},
            {"type": "movers", "style": "black-cats", "pins": [{"x": 0.1, "y": 0.9}, {"x": 0.9, "y": 0.9}]},
            {"type": "shapes", "style": "cauldrons", "pins": [{"x": 0.5, "y": 0.8, "size": 2}]},
            {"type": "info", "style": "moon", "pins": [{"x": 0.8, "y": 0.2}]},
            {"type": "info", "style": "holiday", "pins": [{"x": 0.2, "y": 0.2}]},
        ],
    }
    created = await api.post("/api/mapping/scenes", headers=headers, json=scene)
    assert created.status_code == 201, created.text
    assert [layer["style"] for layer in created.json()["layers"]] == [
        "witch", "black-cats", "cauldrons", "moon", "holiday"]


def test_batch_two_styles_survive_describe_a_scene():
    layers = scene_ai.to_layers([
        {"type": "movers", "style": "hanging-spiders", "near": "follow"},
        {"type": "movers", "style": "dragon"},
        {"type": "movers", "style": "ducklings"},
        {"type": "movers", "style": "snowfall", "near": "flee"},
        {"type": "info", "style": "menorah"},
        {"type": "info", "style": "showtimes"},
    ])
    assert [layer.style for layer in layers] == [
        "hanging-spiders", "dragon", "ducklings", "snowfall", "menorah", "showtimes"]


def test_batch_three_styles_survive_describe_a_scene():
    layers = scene_ai.to_layers([
        {"type": "movers", "style": "zombie-hands", "near": "follow"},
        {"type": "movers", "style": "hatching-eggs"},
        {"type": "movers", "style": "beach-balls", "near": "flee"},
        {"type": "movers", "style": "dolphins", "near": "jump"},
        {"type": "movers", "style": "kites"},
        {"type": "movers", "style": "lion-dance", "near": "dance"},
    ])
    assert [layer.style for layer in layers] == [
        "zombie-hands", "hatching-eggs", "beach-balls", "dolphins", "kites", "lion-dance"]


def test_batch_four_styles_survive_describe_a_scene():
    layers = scene_ai.to_layers([
        {"type": "movers", "style": "crows", "near": "flee"},
        {"type": "movers", "style": "sledders", "near": "jump"},
        {"type": "movers", "style": "jingle-bells", "near": "dance"},
        {"type": "movers", "style": "parachute-presents", "near": "follow"},
        {"type": "movers", "style": "hens"},
        {"type": "movers", "style": "koi", "near": "follow"},
    ])
    assert [layer.style for layer in layers] == [
        "crows", "sledders", "jingle-bells", "parachute-presents", "hens", "koi"]


def test_batch_five_styles_survive_describe_a_scene():
    layers = scene_ai.to_layers([
        {"type": "movers", "style": "peeking-ghosts", "near": "follow"},
        {"type": "movers", "style": "window-eyes"},
        {"type": "movers", "style": "snowball-kids", "near": "follow"},
        {"type": "movers", "style": "birthday-cakes", "near": "hide"},
        {"type": "movers", "style": "skunks", "near": "hide"},
        {"type": "movers", "style": "moths", "near": "follow"},
    ])
    assert [layer.style for layer in layers] == [
        "peeking-ghosts", "window-eyes", "snowball-kids", "birthday-cakes", "skunks", "moths"]


def test_batch_six_styles_survive_describe_a_scene():
    layers = scene_ai.to_layers([
        {"type": "movers", "style": "wolves", "near": "light"},
        {"type": "movers", "style": "moon"},
        {"type": "movers", "style": "pinatas", "near": "dance"},
        {"type": "movers", "style": "cuckoo-clock", "near": "jump"},
        {"type": "movers", "style": "gnomes", "near": "hide"},
        {"type": "movers", "style": "diyas", "near": "light"},
    ])
    assert [layer.style for layer in layers] == [
        "wolves", "moon", "pinatas", "cuckoo-clock", "gnomes", "diyas"]


def test_batch_seven_styles_survive_describe_a_scene():
    layers = scene_ai.to_layers([
        {"type": "movers", "style": "santa-chimney", "near": "jump"},
        {"type": "movers", "style": "ball-drop", "near": "jump"},
        {"type": "movers", "style": "rain-clouds", "near": "follow"},
        {"type": "movers", "style": "school-bus", "near": "light"},
        {"type": "movers", "style": "kinara", "near": "light"},
        {"type": "movers", "style": "cows", "near": "follow"},
    ])
    assert [layer.style for layer in layers] == [
        "santa-chimney", "ball-drop", "rain-clouds", "school-bus", "kinara", "cows"]


def test_every_holiday_countdown_survives_describe_a_scene():
    layers = scene_ai.to_layers([
        {"type": "countdown", "style": "stars-stripes"},
        {"type": "countdown", "style": "dreidel"},
        {"type": "countdown", "style": "big-day"},
        {"type": "countdown", "style": "no-such-look"},
    ])
    assert [layer.style for layer in layers] == ["stars-stripes", "dreidel", "big-day", "gold"]


async def test_a_birthday_countdown_keeps_its_name_and_date(api):
    headers = await login(api)
    scene = {
        "name": "Emma's birthday",
        "layers": [{"type": "countdown", "style": "birthday", "text": "Emma", "date": "2026-11-14",
                    "pins": [{"x": 0.5, "y": 0.4}]}],
    }
    created = await api.post("/api/mapping/scenes", headers=headers, json=scene)
    assert created.status_code == 201, created.text
    layer = created.json()["layers"][0]
    assert (layer["style"], layer["text"], layer["date"]) == ("birthday", "Emma", "2026-11-14")


def test_holiday_batch_two_styles_survive_describe_a_scene():
    layers = scene_ai.to_layers([
        {"type": "movers", "style": "headless-horseman", "near": "dance"},
        {"type": "movers", "style": "tesla-coil", "near": "follow"},
        {"type": "movers", "style": "ofrenda", "near": "follow"},
        {"type": "movers", "style": "honor-guard", "near": "light"},
        {"type": "movers", "style": "fighter-jets", "near": "dance"},
        {"type": "movers", "style": "rangoli", "near": "follow"},
    ])
    assert [layer.style for layer in layers] == [
        "headless-horseman", "tesla-coil", "ofrenda", "honor-guard", "fighter-jets", "rangoli"]


def test_christmas_and_thanksgiving_styles_survive_describe_a_scene():
    layers = scene_ai.to_layers([
        {"type": "movers", "style": "nutcracker", "near": "follow"},
        {"type": "movers", "style": "melting-snowman", "near": "follow"},
        {"type": "movers", "style": "cookies-for-santa", "near": "follow"},
        {"type": "movers", "style": "singing-wreath", "near": "follow"},
        {"type": "movers", "style": "geese", "near": "follow"},
        {"type": "movers", "style": "turkey-trot", "near": "dance"},
    ])
    assert [layer.style for layer in layers] == [
        "nutcracker", "melting-snowman", "cookies-for-santa", "singing-wreath", "geese", "turkey-trot"]
