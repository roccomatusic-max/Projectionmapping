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
#: Seconds each attempt of the key check may take (the SDK retries twice).
KEY_CHECK_SECONDS = 20.0

MOTIONS = ["none", "bob", "sway", "spin", "drift", "bounce", "orbit", "rise", "flutter"]
CHANGES = ["none", "pulse", "twinkle", "colour", "flicker", "blink"]
NEARS = ["none", "light", "grow", "shrink", "colour", "spin", "flee", "follow", "jump",
         "dance", "appear", "hide", "burst"]
_AREA_CHANGES = ["none", "pulse", "twinkle", "colour", "flicker"]
_AREA_NEARS = ["none", "light", "colour", "appear", "hide"]

#: Every layer type, its styles (first is the default), what the dials mean
#: and, for objects, what they can do by themselves and near people. The
#: renderer in frontend/src/mapping/scene/catalog.ts has the same list.
#: "backdrop" types cover whole areas; scenes are built without them unless
#: the person asks for a material or background.
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
        "styles": ["paint", "smoke", "neon", "footprints"],
        "dials": "size: brush size; amount: brightness; fade: how long trails last; speed: smoke drift",
        "notes": "footprints leaves glowing footsteps where people walk; for the ground",
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
    # -- reactive objects ----------------------------------------------------------
    "shapes": {
        "about": "objects scattered over the target, each moving, changing and "
                 "reacting to the nearest person on its own",
        "styles": ["gumdrops", "peppermints", "stars", "snowflakes", "ornaments", "hearts",
                   "pumpkins", "ghosts", "bats", "spiders", "eyes", "candy-canes",
                   "presents", "trees", "bells", "candles", "shamrocks", "eggs", "flowers",
                   "butterflies", "bunnies", "balloons", "lanterns", "diyas",
                   "star-of-david", "fireworks", "fish", "bubbles", "leaves", "moons",
                   "notes", "snowmen", "coins", "footprints", "welcome-mat",
                   "runway-arrows", "crawling-spiders"],
        "dials": "size: object size (bigger means fewer fit); amount: how many; speed: "
                 "how fast they move and change",
        "notes": "pumpkins are carved jack-o'-lanterns; eyes always watch the nearest "
                 "person; fireworks keep bursting by themselves; colours: most use color, "
                 "with color2 for details (stems, ribbons, spots, flames); stars, hearts, "
                 "eggs and notes alternate color and color2; gumdrops, ornaments, "
                 "presents and balloons are multicoloured; footprints, welcome-mat, "
                 "runway-arrows and crawling-spiders are drawn flat for the ground (a "
                 "driveway; spiders hang from a thread, crawling-spiders do not): welcome-mat "
                 "reads WELCOME, runway-arrows point up the canvas like a landing strip; "
                 "use blend normal",
        "motions": MOTIONS,
        "changes": CHANGES,
        "nears": NEARS,
    },
    "lights": {
        "about": "string lights (bulbs) along the edges of the target surfaces",
        "styles": ["twinkle", "chase", "steady", "multicolor"],
        "dials": "size: bulb size; amount: how close together; speed: animation",
        "changes": _AREA_CHANGES,
        "nears": _AREA_NEARS,
    },
    "outline": {
        "about": "trim along the edges of the target surfaces",
        "styles": ["icing", "neon", "solid", "candy"],
        "dials": "size: line width; amount: brightness; speed: shimmer; fade: glow",
        "notes": "icing is white frosting with drips, ideal for roofs and windows",
        "changes": _AREA_CHANGES,
        "nears": _AREA_NEARS,
    },
    "falling": {
        "about": "things falling from the sky",
        "styles": ["snow", "rain", "leaves", "confetti", "sparkles"],
        "dials": "size: flake size; amount: how many; speed: fall speed; fade: sway",
        "nears": ["none", "flee", "follow", "light", "colour", "appear", "hide"],
    },
    "field": {
        "about": "a grid of dots or lines that bends away from people",
        "styles": ["dots", "lines", "grid"],
        "dials": "size: spacing; amount: how far people push it; speed: shimmer",
        "changes": _AREA_CHANGES,
        "nears": _AREA_NEARS,
    },
    "countdown": {
        "about": "a big 'days until Christmas' or 'days until Halloween' countdown "
                 "with a ribbon and a ticking clock, centred on the target area; it "
                 "greets on the day. gold, frost, candy and marquee count to Christmas; "
                 "pumpkin (ribbon #3b0764, glow #ff7a18) and ghostly (ribbon #111827, "
                 "glow #84cc16) count to Halloween",
        "styles": ["gold", "frost", "candy", "marquee", "pumpkin", "ghostly"],
        "dials": "size: how much of the area it fills; fade: height (1 is the top); "
                 "speed: how fast light sweeps across it; amount: how much it sparkles",
        "nears": ["none", "light", "grow", "jump"],
        "notes": "color is the ribbon, color2 the glow; use blend normal and reacts_to "
                 "always so it stays readable; only add it when the person asks for a "
                 "countdown",
    },
    # -- backdrops: only when the person asks for a material or background ---------
    "texture": {
        "about": "BACKDROP: makes whole surfaces look like a material",
        "styles": ["gingerbread", "brick", "wood", "stone", "snow", "ice", "candy",
                   "window-glow", "starry", "plain"],
        "dials": "size: pattern scale; amount: detail and contrast; speed: animation "
                 "(window flicker, star twinkle)",
        "notes": "color is the main colour, color2 the accent (mortar, grain, stripes); "
                 "use blend normal",
        "changes": _AREA_CHANGES,
        "nears": _AREA_NEARS,
    },
    "wash": {
        "about": "BACKDROP: colour over the whole target area",
        "styles": ["solid", "gradient", "aurora", "pulse"],
        "dials": "size: pattern scale; amount: brightness; speed: movement",
        "changes": _AREA_CHANGES,
        "nears": _AREA_NEARS,
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
"walls", "roof", "windows", "doors", "outside" (around the building), or \
"ground" (a driveway or path traced as a ground part, seen from above);
- reacts_to: what makes the whole layer stronger: "presence" (someone is \
there), "movement" (people moving), "count" (more people), "closeness" \
(people near), or "always"; reaction 0-1 is how much that matters (0 = \
ignore it).
- motion, change and near: what each object does by itself and when a \
person comes near it, from the lists given for its type ("none" for types \
without a list). Motion: {motions}. Change: {changes}. Near: {nears} ("burst" \
pops it, "hide" makes it vanish, "follow" draws it toward the person). \
reach 0-1 is how far away people are noticed (0.5 is about an arm's \
length beyond the person).

Guidance:
- Build scenes from objects that react to people, not backdrops: do not use \
the BACKDROP types (texture, wash) unless the person asks for a material, \
a background or a colour over the walls. Nothing should cover the whole \
building.
- Make every object layer react to people with near (anything but "none"), \
and give objects some motion or change so the scene lives between visitors.
- Usually 4 to 8 layers: objects on the walls, roof, windows, doors and \
around the building; lights or trim along the edges; weather; then one or \
two people effects on top that fit the theme.
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
                                              "windows", "doors", "outside", "ground"]},
        "reacts_to": {"type": "string",
                      "enum": ["presence", "movement", "count", "closeness", "always"]},
        "reaction": {"type": "number"},
        "motion": {"type": "string", "enum": MOTIONS},
        "change": {"type": "string", "enum": CHANGES},
        "near": {"type": "string", "enum": NEARS},
        "reach": {"type": "number"},
    },
    "required": ["type", "name", "style", "opacity", "blend", "color", "color2", "size",
                 "speed", "amount", "fade", "target", "reacts_to", "reaction", "motion",
                 "change", "near", "reach"],
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


def _explain(exc) -> str:
    """Anthropic's error in words the person can act on, with its own message."""
    message = ""
    body = getattr(exc, "body", None)
    if isinstance(body, dict) and isinstance(body.get("error"), dict):
        message = str(body["error"].get("message") or "").strip()
    if "credit balance" in message.lower():
        return ("The Anthropic account has no credit yet. Add some under Billing at "
                f"console.anthropic.com, then try again. (Anthropic: {message})")
    if exc.status_code == 429:
        return ("Anthropic's limit for this account was reached. Try again in a minute."
                + (f" (Anthropic: {message})" if message else ""))
    if message:
        return f"Anthropic answered with an error ({exc.status_code}): {message}"
    return f"Anthropic answered with an error ({exc.status_code}). Try again."


async def check_key(key: str) -> None:
    """Refuse a key Anthropic does not accept, before it is saved.

    Only a refused key (401, 403) or no connection stops the save. Anything
    else, such as an account without credit yet, is about the account, not
    the key: the key is kept and the problem is shown, in Anthropic's own
    words, when a scene is described.
    """
    import anthropic

    try:
        async with _client(key) as client:
            # A key check answers at once; the long timeout is for describing.
            await client.models.list(limit=1, timeout=KEY_CHECK_SECONDS)
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
        log.info("Anthropic answered the key check with %s; keeping the key: %s",
                 exc.status_code, _explain(exc))


# -- describing a scene ------------------------------------------------------------


def _catalog_text() -> str:
    lines = []
    for name, entry in CATALOG.items():
        line = (f"- {name}: {entry['about']}. Styles: {', '.join(entry['styles'])}. "
                f"Dials: {entry['dials']}.")
        if entry.get("notes"):
            line += f" Note: {entry['notes']}."
        can = [f"{field}: {', '.join(entry[field])}" for field in ("motions", "changes", "nears")
               if entry.get(field)]
        if can:
            line += f" Can do: {'; '.join(can)}."
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
    names = [str(s.get("name") or "").strip() for s in surfaces]
    named = ", ".join(f"{name} ({s.get('kind', 'other')})" for name, s in zip(names, surfaces, strict=True)
                      if name)
    text = f"The building has these traced parts: {parts}."
    return text + (f" They are called: {named}." if named else "")


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


def _choice(entry: dict, field: str, value) -> str | None:
    """A motion, change or near the type can do; None for types without them."""
    allowed = entry.get(field)
    if not allowed:
        return None
    value = str(value or "").strip().lower()
    return value if value in allowed else "none"


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
                "everywhere", "building", "walls", "roof", "windows", "doors", "outside", "ground"
            ) else "everywhere",
            reacts_to=item.get("reacts_to") if item.get("reacts_to") in (
                "presence", "movement", "count", "closeness", "always"
            ) else "always",
            reaction=_clamp(item.get("reaction"), default=0.5),
            motion=_choice(CATALOG[kind], "motions", item.get("motion")),
            change=_choice(CATALOG[kind], "changes", item.get("change")),
            near=_choice(CATALOG[kind], "nears", item.get("near")),
            reach=_clamp(item.get("reach"), default=0.5),
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
                system=SYSTEM.format(catalog=_catalog_text(), motions=", ".join(MOTIONS),
                                     changes=", ".join(CHANGES), nears=", ".join(NEARS)),
                messages=[{"role": "user", "content": content}],
            )
    except anthropic.AuthenticationError:
        raise SceneAiError("Anthropic no longer accepts the saved key. Enter a new one "
                           "in Settings.") from None
    except anthropic.APITimeoutError:
        raise SceneAiError("Anthropic took too long to answer. Try again.") from None
    except anthropic.APIConnectionError:
        raise SceneAiError("Could not reach Anthropic. Check this computer's internet "
                           "connection.") from None
    except anthropic.APIStatusError as exc:
        log.warning("Scene description failed: %s", exc)
        raise SceneAiError(_explain(exc)) from None

    if response.stop_reason == "refusal":
        raise SceneAiError("Claude declined that description. Try wording it differently.")
    if response.stop_reason == "max_tokens":
        raise SceneAiError("The answer was cut off. Try a shorter description.")
    text = "".join(block.text for block in response.content if block.type == "text")
    try:
        data = json.loads(text)
    except ValueError:
        data = None
    if not isinstance(data, dict):
        raise SceneAiError("Claude's answer could not be read. Try again.")
    layers = data.get("layers")
    layers = to_layers(layers if isinstance(layers, list) else [])
    if not layers:
        raise SceneAiError("Claude's answer had no usable layers. Try describing it "
                           "differently.")
    return {
        "name": str(data.get("name") or "New scene").strip()[:128] or "New scene",
        "description": str(data.get("description") or "").strip()[:1000],
        "layers": layers,
    }
