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
@pytest.mark.parametrize("layer_type", ["shapes", "movers", "info"])
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
