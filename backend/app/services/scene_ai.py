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
import re

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
                   "runway-arrows", "crawling-spiders", "gingerbread", "stockings", "wreaths",
                   "santa-hats", "reindeer", "poinsettias", "holly", "mittens", "turkeys",
                   "candy-corn", "skulls", "tombstones", "cauldrons", "witch-hats", "acorns",
                   "pies", "party-hats", "champagne", "flags", "cupcakes", "chicks",
                   "pots-of-gold", "rainbows"],
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
                 "skulls' eyes glow in color2; cauldrons bubble a brew in color over a fire "
                 "in color2; flags are the stars and stripes waving (color the stripes, "
                 "color2 the corner); cupcakes have a lit candle; rainbows and pots-of-gold "
                 "are for St Patrick's Day; use blend normal",
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
    "movers": {
        "about": "things that travel across the building on a path of their own: "
                 "sleigh is Santa's sleigh and reindeer flying over the roofline; train "
                 "is a toy train of presents along the bottom; birds and bats are "
                 "flocks that scatter from people; elves and penguins walk along the "
                 "bottom; shooting-stars streak across the sky; ghosts float around; "
                 "witch flies over the roof on her broom and cackles at people; ufo hovers "
                 "and beams light down on whoever is under it (near follow); skeletons, "
                 "zombies, black-cats, turkeys, leprechauns and bunnies (hopping) walk "
                 "along the bottom, skeletons and leprechauns dance near people, zombies "
                 "and turkeys call out; cupid and eagles fly over the roof; butterflies "
                 "and fish are flocks; rockets are fireworks that go up from the bottom "
                 "of the house and burst in color and color2 (blend add); balloons float "
                 "up and away; snowfall (big snowflakes), leaves, petals (cherry "
                 "blossom), confetti, falling-hearts and clovers (shamrocks) fall down the "
                 "house and part round people (near flee); hanging-spiders hang from the "
                 "roofline on threads and drop down to people (near follow); lanterns "
                 "(sky lanterns), jellyfish, rising-bubbles (pop near people: near hide) "
                 "and hot-air-balloons float up; fireflies drift and blink and gather "
                 "round people (near follow, blend add); bees are a flock that follows "
                 "people; dragon flies over the roof and breathes fire at people; owls "
                 "(hoot), angels, sharks and sea-turtles fly or swim over the roof; "
                 "mummies, gingerbread-men (run away), toy-soldiers (salute near people), "
                 "dinosaurs (roar) and ducklings (a duck and her ducklings in a line) walk "
                 "along the bottom; trick-or-treaters, werewolves (howl), vampires, "
                 "frankensteins, rats, polar-bears, reindeer (Rudolph noses light up near "
                 "people: near dance), carolers (sing), squirrels and frogs (hop), crabs, "
                 "robots (wave: near dance), dogs (bark), dreidels (spin) and lion-dance "
                 "(rears up: near dance) walk along the bottom; grim-reaper floats over the "
                 "roof and drifts towards people (near follow); zombie-hands claw up out "
                 "of the ground and hatching-eggs hatch chicks beside people (near "
                 "follow); falling-presents and red-envelopes fall; lovebirds, whales "
                 "(spout near people), octopus, paper-planes, rocket-ship and astronauts "
                 "fly over the roof; dragonflies and hummingbirds are flocks; dolphins "
                 "leap out along the bottom (higher near people: near jump); beach-balls "
                 "bounce along and people kick them (near flee); kites fly on strings "
                 "and loop over people (near jump); crows, doves and cardinals sit on "
                 "the roofline and fly off when people come near (near flee); "
                 "hanging-bats hang under the roof edge and fly off (near flee); "
                 "sledders and sliding-penguins slide down the roof from its peak "
                 "(near jump); jingle-bells and stockings hang on ribbons under the "
                 "roof edge and swing when people dance by (near dance); candy-canes, "
                 "gold-coins, falling-candy and parachute-presents fall (presents drift "
                 "to people: near follow); sparklers stand along the bottom and light "
                 "up beside people (near light); floating-candles drift over the house; "
                 "rolling-pumpkins roll along and people kick them (near flee); "
                 "snowmen, santa-walking, hens (a hen and her chicks in a line), "
                 "ice-cream-truck, fire-truck, race-cars, drummers and scarecrows walk "
                 "or drive along the bottom; love-letters (fly to people: near follow), "
                 "seahorses, mermaids, submarines and origami-cranes fly over the roof; "
                 "pufferfish (puff up: near grow) and koi (gather round people: near "
                 "follow) are flocks; peeking-ghosts, peeking-elves and window-cats "
                 "peek over the window sills and come up to watch people (near "
                 "follow), window-eyes open in the windows and follow people with "
                 "their pupils; perched-owls on the roof turn their heads to watch "
                 "people, seagulls squawk and fly off (near flee); snowball-kids and "
                 "water-balloon-kids throw at the house and at people (near follow); "
                 "jack-in-the-box, coffins and grave-ghosts come out for people (near "
                 "jump); moles duck into their holes (near hide); party-poppers go "
                 "off for people (near jump); birthday-cakes have their candles blown "
                 "out by people (near hide); skiers slide down the roof (near jump); "
                 "ice-skaters twirl for people (near dance); snails, tortoises, "
                 "hedgehogs and skunks hide from people (near hide); uncle-sam on "
                 "stilts and football-players walk along the bottom; storks, "
                 "flying-pigs, unicorns, magic-carpet and superheroes fly over the "
                 "roof; fairies flit about (near follow); ladybugs (near flee) and "
                 "moths (near follow) are flocks; wolves sit on the roof, watch "
                 "people and howl (near light); moon is tonight's real moon crossing "
                 "the sky (near light); pinatas hang from the gutter and burst into "
                 "candy when people dance under them (near dance); ornaments and "
                 "icicles hang from the gutter, icicles dripping when it is really "
                 "above freezing (near follow); flags ripple with the real wind; "
                 "gift-boxes open for people (near jump); cauldrons bubble (near "
                 "dance); glowing-pumpkins shout boo (near jump); burrow-bunnies duck "
                 "into their burrows (near hide); helicopter turns its searchlight "
                 "onto people (near follow); sprinklers spray people (near follow); "
                 "snow-globes are shaken by people (near dance); manta-rays, "
                 "anglerfish (near light) and rudolph (near light) fly over the roof; "
                 "clownfish are a flock (near flee); starfish, surfers (near jump), "
                 "sailboats, snowplow, pirate-ship (near follow, fires its cannon), "
                 "gnomes (near hide: they freeze), peacocks (near dance: fan their "
                 "tails) and teddy-bears (near follow) go along the bottom; fountains "
                 "spray higher for people (near grow); web-spiders drop from their "
                 "webs (near follow); leaf-piles burst and puddles splash (near "
                 "jump); cuckoo-clock tells the real time and calls the hours (near "
                 "jump); robins sing on the roof (near flee); pot-of-gold makes a "
                 "rainbow for people (near jump); easter-eggs light up when found "
                 "(near jump); diyas glow brighter for people (near light); "
                 "santa-chimney is Santa climbing out of a chimney at the roof peak "
                 "(near jump); roof-reindeer stand on the roof and watch people; "
                 "window-candles sit on every window sill (near light); disco-ball "
                 "hangs from the gutter throwing spots of light onto people (near "
                 "dance); searchlights cross over people (near follow); ball-drop "
                 "comes down on the hour by the real clock and at midnight on New "
                 "Year's Eve (near jump); champagne pops its corks (near jump); "
                 "firecrackers hang from the gutter and go off (near jump); "
                 "graduation-caps are tossed up (near jump); school-bus stops with "
                 "its stop sign out (near light); deer stop and edge away (near "
                 "flee); tractors, foxes, bigfoot, skeleton-dogs (near follow), "
                 "bagpipers, pilgrims and cows (near follow: look up and moo) go "
                 "along the bottom; raccoons climb out of trash cans (near jump); "
                 "witch-crash splats against the wall over people (near follow); "
                 "rain-clouds rain when it is really raining (near follow: rain on "
                 "people); hockey-players pass pucks to people (near follow); "
                 "lighthouse shines its beam on people (near follow); tumbleweeds "
                 "roll with the real wind (near flee); sunflowers face people (near "
                 "follow); tulips open for people (near light); bird-feeder birds "
                 "fly off from people (near flee); beehive bees swarm at people "
                 "(near follow); wind-chimes swing with the real wind (near dance); "
                 "campfire sparks fly up (near grow); kinara lights the real night of "
                 "Kwanzaa (near light); fanous are Ramadan lanterns hanging from the "
                 "gutter (near light); hula-dancers and mariachi play faster for "
                 "people (near dance); cornucopia spills fruit for people (near "
                 "jump); christmas-tree lights up for people (near light)",
        "styles": ["sleigh", "train", "birds", "bats", "elves", "penguins",
                   "shooting-stars", "ghosts", "witch", "ufo", "skeletons", "zombies",
                   "black-cats", "turkeys", "cupid", "leprechauns", "bunnies", "eagles",
                   "rockets", "balloons", "butterflies", "fish", "snowfall", "leaves",
                   "petals", "confetti", "falling-hearts", "clovers", "hanging-spiders",
                   "lanterns", "jellyfish", "rising-bubbles", "hot-air-balloons",
                   "fireflies", "bees", "dragon", "owls", "angels", "sharks",
                   "sea-turtles", "mummies", "gingerbread-men", "toy-soldiers",
                   "dinosaurs", "ducklings", "trick-or-treaters", "werewolves",
                   "vampires", "frankensteins", "grim-reaper", "zombie-hands", "rats",
                   "falling-presents", "polar-bears", "reindeer", "carolers", "squirrels",
                   "lovebirds", "hatching-eggs", "frogs", "dragonflies", "hummingbirds",
                   "dolphins", "whales", "crabs", "octopus", "beach-balls", "paper-planes",
                   "kites", "rocket-ship", "astronauts", "robots", "dogs", "dreidels",
                   "lion-dance", "red-envelopes", "crows", "doves", "cardinals",
                   "hanging-bats", "sledders", "sliding-penguins", "jingle-bells",
                   "stockings", "candy-canes", "gold-coins", "falling-candy",
                   "parachute-presents", "sparklers", "floating-candles",
                   "rolling-pumpkins", "snowmen", "santa-walking", "hens",
                   "ice-cream-truck", "fire-truck", "race-cars", "drummers", "scarecrows",
                   "love-letters", "seahorses", "mermaids", "submarines", "origami-cranes",
                   "pufferfish", "koi", "peeking-ghosts", "peeking-elves",
                   "window-cats", "window-eyes", "perched-owls", "seagulls",
                   "snowball-kids", "water-balloon-kids", "jack-in-the-box", "moles",
                   "coffins", "grave-ghosts", "party-poppers", "birthday-cakes",
                   "skiers", "ice-skaters", "snails", "tortoises", "hedgehogs",
                   "skunks", "uncle-sam", "football-players", "storks", "flying-pigs",
                   "unicorns", "magic-carpet", "fairies", "superheroes", "ladybugs",
                   "moths", "wolves", "moon", "pinatas", "ornaments", "icicles",
                   "flags", "gift-boxes", "cauldrons", "glowing-pumpkins",
                   "burrow-bunnies", "helicopter", "sprinklers", "snow-globes",
                   "manta-rays", "clownfish", "anglerfish", "starfish", "surfers",
                   "sailboats", "snowplow", "pirate-ship", "rudolph", "fountains",
                   "web-spiders", "leaf-piles", "puddles", "gnomes", "cuckoo-clock",
                   "robins", "peacocks", "pot-of-gold", "easter-eggs", "teddy-bears",
                   "diyas", "santa-chimney", "roof-reindeer", "window-candles",
                   "disco-ball", "searchlights", "ball-drop", "champagne",
                   "firecrackers", "graduation-caps", "school-bus", "tractors", "deer",
                   "foxes", "raccoons", "witch-crash", "rain-clouds", "hockey-players",
                   "lighthouse", "tumbleweeds", "bigfoot", "skeleton-dogs",
                   "sunflowers", "tulips", "bird-feeder", "beehive", "wind-chimes",
                   "campfire", "kinara", "fanous", "hula-dancers", "mariachi",
                   "bagpipers", "pilgrims", "cornucopia", "christmas-tree", "cows"],
        "dials": "size: how big; speed: how fast; amount: how many (flocks, walkers); "
                 "fade: sparkle trail and steam",
        "nears": ["none", "light", "grow", "flee", "follow", "jump", "dance", "hide",
                  "appear"],
        "notes": "color is the main colour (the sleigh, the engine), color2 the trim; "
                 "use blend normal and reacts_to always",
    },
    "snowcap": {
        "about": "snow settling on the level edges of the target surfaces (window "
                 "sills, frames, the roof) over the first minute and staying; it melts "
                 "where people stand",
        "styles": ["soft"],
        "dials": "size and amount: how deep it piles; speed: how fast it settles",
        "nears": ["none", "hide", "light", "colour"],
        "notes": "target windows or roof; color is the snow (#ffffff), color2 its "
                 "shadow (#9fb4d8); use blend normal and reacts_to always",
    },
    "info": {
        "about": "a live info board: santa is a Santa tracker (a world map with "
                 "Santa's sleigh, his next stop and presents delivered on Christmas "
                 "Eve, a countdown to takeoff before); weather is the current weather; "
                 "days counts the days until a date; message is a scrolling light-up "
                 "message board; clock is the time now; moon is tonight's moon phase; "
                 "holiday counts the days to the next holiday by itself; new-year counts "
                 "down to New Year (to the second on New Year's Eve); menorah lights "
                 "tonight's Hanukkah candles; advent is an Advent calendar; "
                 "lunar-new-year counts down to Lunar New Year; showtimes tells people "
                 "when tonight's show starts and ends",
        "styles": ["santa", "weather", "days", "message", "clock", "moon", "holiday",
                   "new-year", "menorah", "advent", "lunar-new-year", "showtimes"],
        "dials": "size: how big; speed: how fast light sweeps (message: scroll speed); "
                 "amount: sparkle",
        "nears": ["none", "light", "grow", "jump"],
        "notes": "text is the message (message), what is counted to (days) or the "
                 "town (weather); date is YYYY-MM-DD for days; use blend normal and "
                 "reacts_to always; only add one when the person asks for it",
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
        # Only info boards read these.
        "text": {"type": "string"},
        "date": {"type": "string"},
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


def _text(value) -> str | None:
    """An info board's words, on one line."""
    text = " ".join(str(value or "").split())[:200]
    return text or None


def _date(value) -> str | None:
    """A YYYY-MM-DD date, or None."""
    text = str(value or "").strip()
    return text if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text) else None


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
            text=_text(item.get("text")) if kind == "info" else None,
            date=_date(item.get("date")) if kind == "info" else None,
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
