"""Turn a sentence into a scene with Claude.

Optional: nothing else depends on it. The key is entered once in Settings
(or comes from ``ANTHROPIC_API_KEY``) and kept in a file next to the media
folder, readable only by the server's own account. It is never sent back to
a browser; the UI only learns that one is set and its last four characters.

Claude answers in a fixed JSON shape (structured outputs), which is then
validated like any scene an administrator saves, so a reply can never put
something into the database that the editor could not have.
"""

from __future__ import annotations

import contextlib
import logging

from app.schemas.mapping import MAX_LAYERS, SceneLayer
from app.services.api_keys import KeyStore

log = logging.getLogger(__name__)

MODEL = "claude-opus-5-5"
KEY_FILE = "anthropic-api-key"

#: Every layer type, its styles (first is the default) and what the dials mean.
#: The renderer in frontend/src/mapping/scene/catalog.ts has the same list.
CATALOG: dict[str, dict] = {
    # -- follow people ---------------------------------------------------------
    "glow": {
        "about": "a soft pool of light around each person",
        "styles": ["soft", "halo", "flame"],
        "dials": "size: radius; amount: brightness; speed: pulse rate; fade: edge softness",
    },
    "ripples": {
        "about": "rings of light spreading out from each person, like a stone in water",
        "styles": ["rings", "sonar", "water"],
        "dials": "size: how far rings travel; amount: brightness; speed: ring speed; fade: ring width",
    },
    "trails": {
        "about": "people paint light as they walk; it fades over time",
        "styles": ["paint", "smoke", "neon"],
        "dials": "size: brush size; amount: brightness; fade: how long trails last; speed: smoke drift",
    },
    "particles": {
        "about": "many small glowing particles reacting to people",
        "styles": ["sparks", "swarm", "scatter", "fireflies"],
        "dials": "size: particle size; amount: how many; speed: how fast; fade: twinkle",
        "notes": "sparks fly off people; swarm gathers around people; scatter flees from "
                 "people; fireflies drift everywhere and brighten near people",
    },
    "shadows": {
        "about": "a shape where each person stands, as a shadow or a glowing silhouette",
        "styles": ["shadow", "silhouette", "giant"],
        "dials": "size: body size; amount: darkness or brightness; fade: softness",
        "notes": "body shapes are approximate (the camera gives a position and width, "
                 "not an outline); shadow uses blend normal with a dark colour",
    },
    "reveal": {
        "about": "covers everything below it in a colour; people uncover what is "
                 "underneath (the cue's video or lower layers) around themselves",
        "styles": ["soft", "circle"],
        "dials": "size: uncovered radius; amount: how strongly covered; fade: how long "
                 "uncovered areas stay uncovered (0 closes at once)",
    },
    "distort": {
        "about": "bends the cue's video or picture around people",
        "styles": ["ripple", "swirl", "bulge"],
        "dials": "size: reach; amount: strength; speed: wave speed",
    },
    # -- the look ----------------------------------------------------------------
    "wash": {
        "about": "colour over the whole target area",
        "styles": ["solid", "gradient", "aurora", "pulse"],
        "dials": "size: pattern scale; amount: brightness; speed: movement",
    },
    "field": {
        "about": "a grid of dots or lines that bends away from people",
        "styles": ["dots", "lines", "grid"],
        "dials": "size: spacing; amount: how far people push it; speed: shimmer",
    },
    "texture": {
        "about": "makes surfaces look like a material",
        "styles": ["gingerbread", "brick", "wood", "stone", "snow", "ice", "candy",
                   "window-glow", "starry", "plain"],
        "dials": "size: pattern scale; amount: detail and contrast; speed: animation "
                 "(window flicker, star twinkle)",
        "notes": "color is the main colour, color2 the accent (mortar, grain, stripes); "
                 "window-glow is warm candle light for windows; use blend normal for "
                 "solid materials",
    },
    "outline": {
        "about": "trim along the edges of the target surfaces",
        "styles": ["icing", "neon", "solid", "candy"],
        "dials": "size: line width; amount: brightness; speed: shimmer; fade: glow",
        "notes": "icing is white frosting with drips, ideal for roofs and windows",
    },
    "lights": {
        "about": "string lights (bulbs) along the edges of the target surfaces",
        "styles": ["twinkle", "chase", "steady", "multicolor"],
        "dials": "size: bulb size; amount: how close together; speed: animation",
    },
    "falling": {
        "about": "things falling from the sky",
        "styles": ["snow", "rain", "leaves", "confetti", "sparkles"],
        "dials": "size: flake size; amount: how many; speed: fall speed; fade: sway",
        "notes": "people push falling things aside",
    },
    "shapes": {
        "about": "decorations scattered over the target surfaces",
        "styles": ["gumdrops", "peppermints", "stars", "snowflakes", "ornaments",
                   "hearts", "pumpkins"],
        "dials": "size: shape size; amount: how many; speed: bob and spin",
    },
}

SYSTEM = """You design live projection-mapping scenes for a building, usually \
someone's house, lit by projectors at night. A scene is a stack of layers drawn \
bottom first. The projector adds light: black means no light, so dark colours \
only darken with blend "normal". Layers can follow people that a depth camera \
tracks in front of the building.

Layer types, their styles (first is the default) and what the 0-1 dials mean:
{catalog}

Every layer has:
- opacity 0-1; blend: "add" (light adds up, good for glows), "screen" (softer \
add), "normal" (paints over what is below, needed for materials, shadows and \
reveal);
- color and color2 as #rrggbb;
- target: where it is drawn: "everywhere", "building" (all traced parts), \
"walls", "roof", "windows", "doors", or "outside" (around the building);
- reacts_to: what makes it stronger: "presence" (someone is there), \
"movement" (people moving), "count" (more people), "closeness" (people near), \
or "always"; reaction 0-1 is how much that matters (0 = ignore it).

Guidance:
- Build a complete, good-looking design: usually 4 to 8 layers. Materials and \
decorations first, then trim and lights, then weather, then the people \
effects on top.
- When the person describes a themed look (a gingerbread house, a haunted \
house, an underwater scene), dress the building's parts with matching \
materials, trim, lights and decorations, and add one or two people effects \
that fit the theme.
- Ambient layers that should always show use reacts_to "always".
- Keep it readable from the street: strong shapes, limited palette.
- Give the scene a short name (2 to 4 words) and a one-sentence description."""

USER_NEW = """Design this scene: {prompt}

{surfaces}"""

USER_CHANGE = """Here is the current scene as JSON:
{scene}

Change it as asked, keeping what was not mentioned: {prompt}

{surfaces}"""

_LAYER_SCHEMA = {
    "type": "object",
    "properties": {
        "type": {"type": "string", "enum": list(CATALOG)},
        "name": {"type": "string"},
        "style": {"type": "string"},
        "opacity": {"type": "number"},
        "blend": {"type": "string", "enum": ["normal", "add", "screen"]},
        "color": {"type": "string"},
        "color2": {"type": "string"},
        "size": {"type": "number"},
        "speed": {"type": "number"},
        "amount": {"type": "number"},
        "fade": {"type": "number"},
        "target": {"type": "string", "enum": ["everywhere", "building", "walls", "roof",
                                              "windows", "doors", "outside"]},
        "reacts_to": {"type": "string",
                      "enum": ["presence", "movement", "count", "closeness", "always"]},
        "reaction": {"type": "number"},
    },
    "required": ["type", "name", "style", "opacity", "blend", "color", "color2", "size",
                 "speed", "amount", "fade", "target", "reacts_to", "reaction"],
    "additionalProperties": False,
}

SCENE_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "description": {"type": "string"},
        "layers": {"type": "array", "items": _LAYER_SCHEMA},
    },
    "required": ["name", "description", "layers"],
    "additionalProperties": False,
}


class SceneAiError(Exception):
    """Something the person can act on, worded for them."""


# -- the key ---------------------------------------------------------------------


KEYS = KeyStore(KEY_FILE, "ANTHROPIC_API_KEY")


def stored_key() -> tuple[str | None, str | None]:
    """The key and where it came from; the environment wins."""
    return KEYS.stored()


def save_key(key: str) -> None:
    KEYS.save(key)


def forget_key() -> None:
    KEYS.forget()


def _client(key: str):
    import anthropic

    return anthropic.AsyncAnthropic(api_key=key, timeout=180.0, max_retries=2)


async def check_key(key: str) -> None:
    """Refuse a key Anthropic does not accept, before it is saved."""
    import anthropic

    try:
        async with _client(key) as client:
            await client.models.retrieve(MODEL)
    except anthropic.AuthenticationError:
        raise SceneAiError("Anthropic did not accept that key. Copy it again from "
                           "console.anthropic.com → API keys.") from None
    except anthropic.PermissionDeniedError:
        raise SceneAiError("That key is not allowed to use Claude. Check the key's "
                           "workspace in the Anthropic console.") from None
    except anthropic.APIConnectionError:
        raise SceneAiError("Could not reach Anthropic. Check this computer's internet "
                           "connection.") from None
    except anthropic.APIStatusError as exc:
        raise SceneAiError(f"Anthropic answered with an error ({exc.status_code}).") from None


# -- describing a scene ------------------------------------------------------------


def _catalog_text() -> str:
    lines = []
    for name, entry in CATALOG.items():
        line = (f"- {name}: {entry['about']}. Styles: {', '.join(entry['styles'])}. "
                f"Dials: {entry['dials']}.")
        if entry.get("notes"):
            line += f" Note: {entry['notes']}."
        lines.append(line)
    return "\n".join(lines)


def surfaces_text(surfaces: list[dict]) -> str:
    """What the AI knows about the building: which parts were traced."""
    if not surfaces:
        return ("No parts of the building have been traced yet, so every target "
                "covers the whole picture. Still choose the targets the design "
                "would want (roof, walls, windows); they take effect once the "
                "building is traced.")
    counts: dict[str, int] = {}
    for surface in surfaces:
        counts[surface.get("kind", "other")] = counts.get(surface.get("kind", "other"), 0) + 1
    parts = ", ".join(f"{n} {kind}{'s' if n > 1 else ''}" for kind, n in counts.items())
    return f"The building has these traced parts: {parts}."


def _clamp(value, low=0.0, high=1.0, default=0.5) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if number != number:  # NaN
        return default
    return max(low, min(high, number))


def _colour(value, default: str) -> str:
    text = str(value or "").strip()
    if len(text) == 7 and text.startswith("#"):
        with contextlib.suppress(ValueError):
            int(text[1:], 16)
            return text.lower()
    return default


def to_layers(raw: list) -> list[SceneLayer]:
    """Claude's layers, made valid: unknown styles get the default, dials clamped."""
    layers: list[SceneLayer] = []
    for item in raw[:MAX_LAYERS]:
        if not isinstance(item, dict) or item.get("type") not in CATALOG:
            continue
        kind = item["type"]
        styles = CATALOG[kind]["styles"]
        style = str(item.get("style", "")).strip().lower()
        layers.append(SceneLayer(
            type=kind,
            name=str(item.get("name", ""))[:64],
            style=style if style in styles else styles[0],
            opacity=_clamp(item.get("opacity"), default=1.0),
            blend=item.get("blend") if item.get("blend") in ("normal", "add", "screen") else "add",
            color=_colour(item.get("color"), "#ffffff"),
            color2=_colour(item.get("color2"), "#ffffff"),
            size=_clamp(item.get("size")),
            speed=_clamp(item.get("speed")),
            amount=_clamp(item.get("amount")),
            fade=_clamp(item.get("fade")),
            target=item.get("target") if item.get("target") in (
                "everywhere", "building", "walls", "roof", "windows", "doors", "outside"
            ) else "everywhere",
            reacts_to=item.get("reacts_to") if item.get("reacts_to") in (
                "presence", "movement", "count", "closeness", "always"
            ) else "always",
            reaction=_clamp(item.get("reaction"), default=0.5),
        ))
    return layers


async def describe(prompt: str, *, surfaces: list[dict], current: dict | None = None) -> dict:
    """A scene for ``prompt``: {"name", "description", "layers": [SceneLayer]}.

    With ``current`` (a scene as JSON), the scene is changed rather than made.
    """
    import json

    import anthropic

    key, _ = stored_key()
    if not key:
        raise SceneAiError("Add an Anthropic API key in Settings first.")
    where = surfaces_text(surfaces)
    if current:
        content = USER_CHANGE.format(scene=json.dumps(current, indent=1), prompt=prompt,
                                     surfaces=where)
    else:
        content = USER_NEW.format(prompt=prompt, surfaces=where)
    try:
        async with _client(key) as client:
            response = await client.beta.messages.create(
                model=MODEL,
                max_tokens=16000,
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                output_config={
                    "effort": "medium",
                    "format": {"type": "json_schema", "schema": SCENE_SCHEMA},
                },
                system=SYSTEM.format(catalog=_catalog_text()),
                messages=[{"role": "user", "content": content}],
            )
    except anthropic.AuthenticationError:
        raise SceneAiError("Anthropic no longer accepts the saved key. Enter a new one "
                           "in Settings.") from None
    except anthropic.RateLimitError:
        raise SceneAiError("Anthropic is busy or the account's limit was reached. Try "
                           "again in a minute.") from None
    except anthropic.APIConnectionError:
        raise SceneAiError("Could not reach Anthropic. Check this computer's internet "
                           "connection.") from None
    except anthropic.APIStatusError as exc:
        log.warning("Scene description failed: %s", exc)
        raise SceneAiError(f"Anthropic answered with an error ({exc.status_code}). "
                           "Try again.") from None

    if response.stop_reason == "refusal":
        raise SceneAiError("Claude declined that description. Try wording it differently.")
    if response.stop_reason == "max_tokens":
        raise SceneAiError("The answer was cut off. Try a shorter description.")
    text = "".join(block.text for block in response.content if block.type == "text")
    try:
        data = json.loads(text)
    except ValueError:
        raise SceneAiError("Claude's answer could not be read. Try again.") from None
    layers = to_layers(data.get("layers") or [])
    if not layers:
        raise SceneAiError("Claude's answer had no usable layers. Try describing it "
                           "differently.")
    return {
        "name": str(data.get("name") or "New scene").strip()[:128] or "New scene",
        "description": str(data.get("description") or "").strip()[:1000],
        "layers": layers,
    }
