"""Find the house's parts on a photo with Claude, and remember how the photo lines up.

Optional, like describing a scene: it uses the same Anthropic key
(services/scene_ai.py). Claude looks at a photo of the house and answers,
in a fixed JSON shape, with the outline of each wall, roof face, window and
door in the photo's own pixels. The browser turns those into house parts on
the canvas once the person has lined the photo up (four corners: where the
canvas's corners are on the photo).

The photo itself is an ordinary image in the media library. Which one it is,
and its four corners, are kept per show in a small file next to the media
folder, so the photo can be lined up again later and the parts move with it.
"""

from __future__ import annotations

import base64
import contextlib
import json
import logging
import os
from pathlib import Path

from app import config
from app.services import scene_ai
from app.services.scene_ai import SceneAiError

log = logging.getLogger(__name__)

KINDS = ["wall", "roof", "window", "door", "other"]
#: Parts and outline points kept from one answer; the show takes 64 parts.
MAX_PARTS = 48
MAX_POINTS = 40

SYSTEM = """You trace the parts of a building on a photo, for a projection-mapping \
show: projectors light the building at night and decorate each part separately \
(objects on the windows and door, lights along the roofline, things on the walls).

Trace the main building the photo is of, as seen from where the photo was taken:
- "roof": each visible roof face, following the roofline and eaves exactly.
- "wall": each visible wall face of the building (front, side, gable, garage front). \
Trace the whole face, including the windows and doors in it.
- "window": every window, its outer frame. Bay windows and dormers count.
- "door": every door, including garage doors (name them "Garage door").
- "other": columns, a porch, chimneys, an arch, trim worth decorating on its own.

Rules:
- Points are pixels on this photo, x to the right from the left edge, y down from \
the top edge, in order around the outline. Use 4 points for anything rectangular \
(most windows and doors), up to 20 for walls and roofs.
- Follow the real edges as closely as you can; precision matters more than detail.
- Where something hides an edge (a tree, a car, a bush), continue the outline where \
the edge must be.
- Leave out the sky, ground, trees, cars, fences, neighbouring buildings and people.
- Give every part a short name a homeowner would use: "Front door", "Left upstairs \
window", "Main roof", "Garage wall".
- Also describe the house in one or two sentences (style, colours, what faces the \
street), for whoever designs its decorations."""

USER = "This photo is {width} by {height} pixels. Trace the building's parts."

_SCHEMA = {
    "type": "object",
    "properties": {
        "description": {"type": "string"},
        "parts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "enum": KINDS},
                    "name": {"type": "string"},
                    "points": {
                        "type": "array",
                        "items": {"type": "array", "items": {"type": "number"}},
                    },
                },
                "required": ["kind", "name", "points"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["description", "parts"],
    "additionalProperties": False,
}


def _media_type(image: bytes) -> str:
    if image.startswith(b"\x89PNG"):
        return "image/png"
    if image[:4] == b"RIFF" and image[8:12] == b"WEBP":
        return "image/webp"
    if image.startswith(b"\xff\xd8"):
        return "image/jpeg"
    raise SceneAiError("The photo must be a JPEG, PNG or WebP picture.")


def to_parts(raw, width: int, height: int) -> list[dict]:
    """Claude's outlines as fractions of the photo, made valid: points on the
    photo, at least three of them, parts of a known kind."""
    parts: list[dict] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        points = []
        for point in item.get("points") or []:
            if not isinstance(point, list) or len(point) < 2:
                continue
            try:
                x, y = float(point[0]), float(point[1])
            except (TypeError, ValueError):
                continue
            if x != x or y != y:  # NaN
                continue
            points.append([round(min(1.0, max(0.0, x / width)), 5),
                           round(min(1.0, max(0.0, y / height)), 5)])
        points = points[:MAX_POINTS]
        if len(points) < 3 or _area(points) < 1e-5:
            continue
        kind = item.get("kind") if item.get("kind") in KINDS else "other"
        name = " ".join(str(item.get("name") or "").split())[:64] or kind.capitalize()
        parts.append({"kind": kind, "name": name, "points": points})
        if len(parts) >= MAX_PARTS:
            break
    return parts


def _area(points: list[list[float]]) -> float:
    return abs(sum(points[i - 1][0] * point[1] - point[0] * points[i - 1][1]
                   for i, point in enumerate(points))) / 2


async def trace(image: bytes, width: int, height: int) -> dict:
    """The parts of the building on ``image`` (``width`` by ``height`` pixels):
    {"description": str, "parts": [{"kind", "name", "points" in photo fractions}]}."""
    import anthropic

    key, _ = scene_ai.stored_key()
    if not key:
        raise SceneAiError("Add an Anthropic API key in Settings → AI keys first. You can "
                           "still trace the parts by hand on the photo.")
    media_type = _media_type(image)
    try:
        async with scene_ai._client(key) as client:
            response = await client.beta.messages.create(
                model=scene_ai.MODEL,
                max_tokens=16000,
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                output_config={
                    "effort": "medium",
                    "format": {"type": "json_schema", "schema": _SCHEMA},
                },
                system=SYSTEM,
                messages=[{"role": "user", "content": [
                    {"type": "image", "source": {
                        "type": "base64", "media_type": media_type,
                        "data": base64.standard_b64encode(image).decode("ascii")}},
                    {"type": "text", "text": USER.format(width=width, height=height)},
                ]}],
            )
    except anthropic.AuthenticationError:
        raise SceneAiError("Anthropic no longer accepts the saved key. Enter a new one "
                           "in Settings → AI keys.") from None
    except anthropic.APITimeoutError:
        raise SceneAiError("Anthropic took too long to answer. Try again.") from None
    except anthropic.APIConnectionError:
        raise SceneAiError("Could not reach Anthropic. Check this computer's internet "
                           "connection.") from None
    except anthropic.APIStatusError as exc:
        log.warning("Tracing the house photo failed: %s", exc)
        raise SceneAiError(scene_ai._explain(exc)) from None

    if response.stop_reason == "refusal":
        raise SceneAiError("Claude declined to trace this photo. Try another photo of the house.")
    if response.stop_reason == "max_tokens":
        raise SceneAiError("The answer was cut off. Try again.")
    text = "".join(block.text for block in response.content if block.type == "text")
    try:
        data = json.loads(text)
    except ValueError:
        data = None
    if not isinstance(data, dict):
        raise SceneAiError("Claude's answer could not be read. Try again.")
    parts = to_parts(data.get("parts"), width, height)
    if not parts:
        raise SceneAiError("Claude found no parts of a building on this photo. Take one "
                           "with the whole front of the house in it, in daylight.")
    return {"description": " ".join(str(data.get("description") or "").split())[:600],
            "parts": parts}


# -- how the photo lines up, per show ---------------------------------------------


def _path(show_id: int) -> Path:
    return (Path(config.settings.media_dir).expanduser().resolve().parent
            / "house-photos" / f"{int(show_id)}.json")


def load(show_id: int) -> dict | None:
    with contextlib.suppress(OSError, ValueError):
        data = json.loads(_path(show_id).read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    return None


def save(show_id: int, data: dict) -> None:
    path = _path(show_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(".part")
    partial.write_text(json.dumps(data), encoding="utf-8")
    os.replace(partial, path)


def forget(show_id: int) -> None:
    with contextlib.suppress(FileNotFoundError):
        _path(show_id).unlink()
