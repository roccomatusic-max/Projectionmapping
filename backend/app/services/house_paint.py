"""Repaint a picture of the building as described (Beta), with OpenAI's image editor.

Optional: nothing else depends on it. The picture comes from the scene
builder already lined up with the show's canvas (the camera photo,
straightened with the Camera tab's corners, or an image from the media
library), so the painting lines up with the real building when projected.
The result is saved to the media library and shown by a scene's "picture"
layer, under the live effects.
"""

from __future__ import annotations

import base64
import logging
import os

import httpx

from app.services.api_keys import KeyStore

log = logging.getLogger(__name__)

MODEL = "gpt-image-2"
#: OPENAI_BASE_URL, OpenAI's usual setting, points this at a proxy or a test double.
API = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
KEYS = KeyStore("openai-api-key", "OPENAI_API_KEY")
#: Longest side of the painting. Larger sizes are slower and, above
#: 2560 × 1440, experimental; projectors blur a little anyway.
LONG_SIDE = 2048

PROMPT = """Repaint this photo of a building as: {prompt}

This picture will be projected back onto the real building, so it must line \
up exactly. Keep the camera viewpoint, the building's outline, roofline, every \
window and door, and all edges exactly where they are and the same size. \
Change only the materials, colours, lighting and decorations on the building. \
Make everything that is not the building (sky, ground, trees, cars, people) \
plain black. No text, no borders."""


class PaintError(Exception):
    """Something the person can act on, worded for them."""


def size_for(canvas_width: int, canvas_height: int) -> tuple[int, int]:
    """The painting's size: the canvas's shape, sides a multiple of 16."""
    aspect = min(3.0, max(1 / 3, canvas_width / max(1, canvas_height)))
    if aspect >= 1:
        return LONG_SIDE, max(320, round(LONG_SIDE / aspect / 16) * 16)
    return max(320, round(LONG_SIDE * aspect / 16) * 16), LONG_SIDE


def _explain(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        body = None
    error = body.get("error") if isinstance(body, dict) else None
    if isinstance(error, str):  # some proxies answer {"error": "..."}
        error = {"message": error}
    if not isinstance(error, dict):
        error = {}
    message = str(error.get("message") or "").strip()
    code = str(error.get("code") or "")
    if response.status_code == 401:
        return "OpenAI did not accept the key. Copy it again from platform.openai.com → API keys."
    if code == "moderation_blocked":
        return "OpenAI declined that description. Try wording it differently."
    if code == "insufficient_quota":
        return ("The OpenAI account has no credit left. Add some under Billing on "
                "platform.openai.com." + (f" (OpenAI: {message})" if message else ""))
    if response.status_code == 429:
        return "OpenAI is busy or the account's limit was reached. Try again in a minute."
    if response.status_code == 403 and message:
        # Usually "your organization must be verified": OpenAI's own words say what to do.
        return f"OpenAI: {message}"
    if message:
        return f"OpenAI answered with an error ({response.status_code}): {message}"
    return f"OpenAI answered with an error ({response.status_code}). Try again."


async def check_key(key: str) -> None:
    """Refuse a key OpenAI does not accept, before it is saved."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(f"{API}/models/{MODEL}",
                                        headers={"Authorization": f"Bearer {key}"})
    except httpx.HTTPError:
        raise PaintError("Could not reach OpenAI. Check this computer's internet connection.") from None
    if response.status_code == 401:
        raise PaintError(_explain(response))


async def paint(image: bytes, prompt: str, size: tuple[int, int]) -> bytes:
    """The repainted picture, as PNG bytes."""
    key, _ = KEYS.stored()
    if not key:
        raise PaintError("Add an OpenAI API key in Settings first.")
    kind = "image/png" if image[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=20)) as client:
            response = await client.post(
                f"{API}/images/edits",
                headers={"Authorization": f"Bearer {key}"},
                data={
                    "model": MODEL,
                    "prompt": PROMPT.format(prompt=prompt.strip()),
                    "size": f"{size[0]}x{size[1]}",
                    "quality": "high",
                    "output_format": "png",
                },
                files={"image": ("house.png" if kind == "image/png" else "house.jpg", image, kind)},
            )
    except httpx.TimeoutException:
        raise PaintError("OpenAI took too long. Try again.") from None
    except httpx.HTTPError:
        raise PaintError("Could not reach OpenAI. Check this computer's internet connection.") from None
    if response.status_code != 200:
        log.warning("House painting failed: %s %s", response.status_code, response.text[:500])
        raise PaintError(_explain(response))
    try:
        return base64.b64decode(response.json()["data"][0]["b64_json"])
    except (ValueError, KeyError, IndexError, TypeError):
        raise PaintError("OpenAI's answer had no picture in it. Try again.") from None
