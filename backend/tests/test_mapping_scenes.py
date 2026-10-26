"""Scenes: the library, cues that play them, traced surfaces, made-up people, AI."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

import json
from types import SimpleNamespace

from app.core.events import bus
from tests.test_api import api, login  # noqa: F401 - fixture
from tests.test_mapping import make_cue, make_show
from tests.test_mapping_camera import next_message

GINGERBREAD = {
    "name": "Gingerbread house",
    "description": "Christmas",
    "layers": [
        {"type": "texture", "style": "gingerbread", "target": "walls", "blend": "normal",
         "color": "#8b5a2b", "color2": "#5c3a1a", "reacts_to": "always"},
        {"type": "outline", "style": "icing", "target": "roof", "color": "#ffffff"},
        {"type": "falling", "style": "snow", "amount": 0.6},
        {"type": "glow", "reacts_to": "movement", "reaction": 0.8},
    ],
}

HOUSE = [
    {"id": "wall1", "name": "Front wall", "kind": "wall",
     "points": [[0.1, 0.4], [0.9, 0.4], [0.9, 1.0], [0.1, 1.0]]},
    {"id": "roof1", "name": "Roof", "kind": "roof", "points": [[0.05, 0.4], [0.5, 0.05], [0.95, 0.4]]},
]


async def test_scene_library_and_cues(api):
    headers = await login(api)
    created = await api.post("/api/mapping/scenes", headers=headers, json=GINGERBREAD)
    assert created.status_code == 201, created.text
    scene = created.json()
    assert [layer["type"] for layer in scene["layers"]] == ["texture", "outline", "falling", "glow"]
    # Defaults are filled in and every layer gets an id.
    assert all(layer["id"] for layer in scene["layers"])
    assert scene["layers"][2]["reacts_to"] == "presence"

    duplicate = await api.post("/api/mapping/scenes", headers=headers, json=GINGERBREAD)
    assert duplicate.status_code == 409

    layers = scene["layers"]
    layers[0]["opacity"] = 0.4
    changed = await api.patch(f"/api/mapping/scenes/{scene['id']}", headers=headers,
                              json={"layers": layers})
    assert changed.status_code == 200, changed.text
    assert changed.json()["layers"][0]["opacity"] == 0.4

    # Dials outside 0-1, unknown types and bad colours are refused.
    for bad in ({"type": "texture", "size": 2}, {"type": "lasers"},
                {"type": "glow", "color": "red"}):
        refused = await api.patch(f"/api/mapping/scenes/{scene['id']}", headers=headers,
                                  json={"layers": [bad]})
        assert refused.status_code == 422, bad

    show = await make_show(api, headers)
    cue = await make_cue(api, headers, show["id"], scene_id=scene["id"])
    assert cue["scene_id"] == scene["id"]
    unknown = await api.post(f"/api/mapping/shows/{show['id']}/cues", headers=headers,
                             json={"scene_id": 999})
    assert unknown.status_code == 400

    # The transport tells the outputs which scene to draw.
    queue = await bus.subscribe()
    try:
        state = await api.post("/api/mapping/transport", headers=headers,
                               json={"action": "goto", "show_id": show["id"], "cue": 0})
        assert state.status_code == 200, state.text
        assert state.json()["current"]["scene_id"] == scene["id"]

        # Edits reach the outputs live.
        await api.patch(f"/api/mapping/scenes/{scene['id']}", headers=headers,
                        json={"name": "Gingerbread"})
        assert await next_message(queue, "mapping_scene") == {
            "scene_id": scene["id"], "deleted": False}
    finally:
        await bus.unsubscribe(queue)
    await api.post("/api/mapping/transport", headers=headers, json={"action": "stop"})

    listing = (await api.get("/api/mapping/scenes", headers=headers)).json()
    assert [s["name"] for s in listing] == ["Gingerbread"]

    # Deleting a scene leaves its cues playing their media.
    gone = await api.delete(f"/api/mapping/scenes/{scene['id']}", headers=headers)
    assert gone.status_code == 204
    reloaded = (await api.get(f"/api/mapping/shows/{show['id']}", headers=headers)).json()
    assert reloaded["cues"][0]["scene_id"] is None


async def test_objects_placed_by_hand_are_kept(api):
    headers = await login(api)
    pins = [{"x": 0.2, "y": 0.7, "size": 1.5, "rotation": -30}, {"x": 0.8, "y": 0.75}]
    created = await api.post("/api/mapping/scenes", headers=headers, json={
        "name": "Porch", "layers": [
            {"type": "shapes", "style": "pumpkins", "near": "light", "pins": pins},
            {"type": "shapes", "style": "ghosts"},
        ]})
    assert created.status_code == 201, created.text
    placed, spread = created.json()["layers"]
    # Pins saved before things could turn read back as not turned.
    assert placed["pins"] == [{"x": 0.2, "y": 0.7, "size": 1.5, "rotation": -30.0},
                              {"x": 0.8, "y": 0.75, "size": 1.0, "rotation": 0.0}]
    # Not placed by hand: spread over the area as before.
    assert spread["pins"] is None

    # Off the canvas, a silly size or too many are refused.
    for bad in ([{"x": 1.2, "y": 0.5}], [{"x": 0.5, "y": 0.5, "size": 9}],
                [{"x": 0.5, "y": 0.5, "rotation": 270}], [{"x": 0.5, "y": 0.5}] * 65):
        refused = await api.patch(f"/api/mapping/scenes/{created.json()['id']}", headers=headers,
                                  json={"layers": [{"type": "shapes", "pins": bad}]})
        assert refused.status_code == 422


async def test_surfaces_are_traced_per_show(api):
    headers = await login(api)
    show = await make_show(api, headers)
    assert show["surfaces"] == []
    saved = await api.patch(f"/api/mapping/shows/{show['id']}", headers=headers,
                            json={"surfaces": HOUSE})
    assert saved.status_code == 200, saved.text
    assert [s["kind"] for s in saved.json()["surfaces"]] == ["wall", "roof"]

    two_points = [{"id": "x", "kind": "window", "points": [[0, 0], [1, 1]]}]
    refused = await api.patch(f"/api/mapping/shows/{show['id']}", headers=headers,
                              json={"surfaces": two_points})
    assert refused.status_code == 422

    cleared = await api.patch(f"/api/mapping/shows/{show['id']}", headers=headers,
                              json={"surfaces": None})
    assert cleared.json()["surfaces"] == []


async def test_a_house_part_can_be_straightened(api):
    headers = await login(api)
    show = await make_show(api, headers)
    roof = {"id": "roof", "kind": "roof", "points": [[0.1, 0.1], [0.9, 0.1], [0.7, 0.4], [0.3, 0.4]],
            "flat": {"corners": [[0.4, 0.15], [0.6, 0.15], [0.65, 0.35], [0.35, 0.35]],
                     "test_until": 1.9e12}}
    saved = await api.patch(f"/api/mapping/shows/{show['id']}", headers=headers,
                            json={"surfaces": [HOUSE[0], roof]})
    assert saved.status_code == 200, saved.text
    parts = saved.json()["surfaces"]
    assert parts[0]["flat"] is None
    assert parts[1]["flat"] == roof["flat"]

    # Four corners, on or near the canvas.
    for corners in ([[0, 0], [1, 0], [1, 1]], [[0, 0], [1, 0], [1, 1], [0, 99]]):
        refused = await api.patch(f"/api/mapping/shows/{show['id']}", headers=headers,
                                  json={"surfaces": [{**roof, "flat": {"corners": corners}}]})
        assert refused.status_code == 422


async def test_simulated_people_reach_the_outputs(api):
    headers = await login(api)
    show = await make_show(api, headers)
    queue = await bus.subscribe()
    try:
        sent = await api.post("/api/mapping/simulated-people", headers=headers,
                              json={"show_id": show["id"],
                                    "people": [{"id": 1, "x": 0.3, "y": 0.8, "size": 0.06}]})
        assert sent.status_code == 204, sent.text
        message = await next_message(queue, "mapping_people")
        assert message["camera_id"] == 0
        assert message["show_id"] == show["id"]
        assert message["simulated"] is True
        assert message["people"][0]["x"] == 0.3
    finally:
        await bus.unsubscribe(queue)


# -- describing a scene ------------------------------------------------------------


class FakeMessages:
    def __init__(self, answer: dict, calls: list):
        self.answer = answer
        self.calls = calls

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            stop_reason="end_turn",
            content=[SimpleNamespace(type="text", text=json.dumps(self.answer))],
        )


class FakeClient:
    def __init__(self, answer: dict, calls: list):
        self.beta = SimpleNamespace(messages=FakeMessages(answer, calls))
        self.models = SimpleNamespace(list=self._list)

    async def _list(self, **kwargs):
        return SimpleNamespace(data=[])

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


async def test_describe_is_hidden_until_a_key_is_set(api, monkeypatch):
    from app.services import scene_ai

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    headers = await login(api)
    status = (await api.get("/api/mapping/ai", headers=headers)).json()
    assert status == {"available": False, "key_hint": None, "source": None}
    refused = await api.post("/api/mapping/scenes/describe", headers=headers,
                             json={"prompt": "a gingerbread house"})
    assert refused.status_code == 502
    assert "Settings" in refused.json()["detail"]

    calls: list = []
    answer = {
        "name": "Gingerbread House",
        "description": "Frosted roof, candy walls, snow.",
        "layers": [
            {"type": "texture", "name": "Walls", "style": "gingerbread", "opacity": 1,
             "blend": "normal", "color": "#8B5A2B", "color2": "#5c3a1a", "size": 0.4,
             "speed": 0.2, "amount": 0.7, "fade": 0.5, "target": "walls",
             "reacts_to": "always", "reaction": 0},
            # A style from another type and dials out of range are repaired.
            {"type": "outline", "name": "Icing", "style": "snow", "opacity": 3,
             "blend": "add", "color": "white", "color2": "#ffffff", "size": -1,
             "speed": 0.5, "amount": 0.9, "fade": 0.5, "target": "roof",
             "reacts_to": "always", "reaction": 0},
        ],
    }
    monkeypatch.setattr(scene_ai, "_client", lambda key: FakeClient(answer, calls))
    key = "sk-ant-api03-" + "x" * 40 + "WXYZ"
    saved = await api.put("/api/mapping/ai/key", headers=headers, json={"key": key})
    assert saved.status_code == 200, saved.text
    assert saved.json() == {"available": True, "key_hint": "WXYZ", "source": "settings"}
    # The key never comes back.
    assert key not in (await api.get("/api/mapping/ai", headers=headers)).text

    show = await make_show(api, headers)
    await api.patch(f"/api/mapping/shows/{show['id']}", headers=headers,
                    json={"surfaces": HOUSE})
    made = await api.post("/api/mapping/scenes/describe", headers=headers,
                          json={"prompt": "make my house a gingerbread house",
                                "show_id": show["id"]})
    assert made.status_code == 200, made.text
    scene = made.json()
    assert scene["name"] == "Gingerbread House"
    texture, icing = scene["layers"]
    assert texture["color"] == "#8b5a2b"
    assert icing["style"] == "icing"
    assert icing["opacity"] == 1.0 and icing["size"] == 0.0
    assert icing["color"] == "#ffffff"

    request = calls[-1]
    assert request["model"] == "claude-opus-5-5"
    assert request["output_config"]["format"]["type"] == "json_schema"
    assert "1 wall, 1 roof" in request["messages"][0]["content"]

    # Changing a scene keeps its name and sends the current layers along.
    answer["name"] = "Something else"
    changed = await api.post("/api/mapping/scenes/describe", headers=headers,
                             json={"prompt": "more snow", "scene_id": scene["id"]})
    assert changed.status_code == 200, changed.text
    assert changed.json()["id"] == scene["id"]
    assert changed.json()["name"] == "Gingerbread House"
    assert '"gingerbread"' in calls[-1]["messages"][0]["content"]

    # A second scene with the same suggested name gets a number.
    again = await api.post("/api/mapping/scenes/describe", headers=headers,
                           json={"prompt": "the same again"})
    assert again.json()["name"] == "Something else"
    answer["name"] = "Gingerbread House"
    third = await api.post("/api/mapping/scenes/describe", headers=headers,
                           json={"prompt": "the same again"})
    assert third.json()["name"] == "Gingerbread House 2"

    removed = await api.delete("/api/mapping/ai/key", headers=headers)
    assert removed.json()["available"] is False


async def test_key_check_only_refuses_a_bad_key(api, monkeypatch):
    """A key is refused only when Anthropic refuses the key itself; an
    account problem (no credit yet) keeps the key and is explained when a
    scene is described."""
    import anthropic
    import httpx2 as httpx

    from app.services import scene_ai

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    headers = await login(api)
    good = "sk-ant-api03-" + "g" * 40 + "GOOD"
    seen: list[str] = []

    def answer(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        if request.headers.get("x-api-key") != good:
            return httpx.Response(401, json={"type": "error", "error": {
                "type": "authentication_error", "message": "invalid x-api-key"}})
        return httpx.Response(400, json={"type": "error", "error": {
            "type": "invalid_request_error",
            "message": "Your credit balance is too low to access the Anthropic API."}})

    monkeypatch.setattr(scene_ai, "_client", lambda key: anthropic.AsyncAnthropic(
        api_key=key, max_retries=0,
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(answer))))

    bad = await api.put("/api/mapping/ai/key", headers=headers,
                        json={"key": "sk-ant-api03-" + "b" * 44})
    assert bad.status_code == 400
    assert "did not accept" in bad.json()["detail"]

    saved = await api.put("/api/mapping/ai/key", headers=headers, json={"key": good})
    assert saved.status_code == 200, saved.text
    assert saved.json()["available"] is True
    assert seen[-1] == "/v1/models"

    described = await api.post("/api/mapping/scenes/describe", headers=headers,
                               json={"prompt": "a gingerbread house"})
    assert described.status_code == 502
    assert "no credit" in described.json()["detail"]
    await api.delete("/api/mapping/ai/key", headers=headers)


async def test_only_admins_set_the_key(api):
    headers = await login(api)
    created = await api.post("/api/auth/users", headers=headers,
                             json={"username": "operator1", "password": "a-long-test-password",
                                   "role": "operator"})
    assert created.status_code in (200, 201), created.text
    operator = await login(api, "operator1", "a-long-test-password")
    refused = await api.put("/api/mapping/ai/key", headers=operator,
                            json={"key": "sk-ant-api03-" + "x" * 40})
    assert refused.status_code == 403
    assert (await api.get("/api/mapping/ai", headers=operator)).status_code == 200


PNG = b"\x89PNG\r\n\x1a\n" + b"painted" * 20


async def test_painting_the_house(api, monkeypatch, tmp_path):
    import base64

    import httpx

    from app.services import house_paint

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    headers = await login(api)
    assert (await api.get("/api/mapping/paint", headers=headers)).json()["available"] is False

    # What is sent to OpenAI, through a fake network.
    sent: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        if request.url.path.endswith("/models/gpt-image-2"):
            return httpx.Response(200, json={"id": "gpt-image-2"})
        return httpx.Response(200, json={"data": [{"b64_json": base64.b64encode(PNG).decode()}]})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(house_paint.httpx, "AsyncClient",
                        lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))

    key = "sk-proj-" + "y" * 40 + "ABCD"
    saved = await api.put("/api/mapping/paint/key", headers=headers, json={"key": key})
    assert saved.status_code == 200, saved.text
    assert saved.json() == {"available": True, "key_hint": "ABCD", "source": "settings"}
    assert sent[-1].headers["authorization"] == f"Bearer {key}"

    show = await make_show(api, headers)  # 7680 × 2160: wider than 3:1
    photo = base64.b64encode(b"\xff\xd8\xff" + b"jpeg" * 50).decode()
    painted = await api.post("/api/mapping/paint", headers=headers,
                             json={"prompt": "a gingerbread house", "show_id": show["id"],
                                   "image": f"data:image/jpeg;base64,{photo}"})
    assert painted.status_code == 201, painted.text
    asset = painted.json()
    assert asset["kind"] == "image"
    assert asset["name"] == "Painted: a gingerbread house.png"
    assert (asset["width"], asset["height"]) == (2048, 688)
    body = sent[-1].content
    assert sent[-1].url.path == "/v1/images/edits"
    assert b'name="model"\r\n\r\ngpt-image-2' in body
    assert b'name="size"\r\n\r\n2048x688' in body
    assert b"Repaint this photo of a building as: a gingerbread house" in body
    assert b'filename="house.jpg"' in body
    file = await api.get(f"/api/mapping/media/{asset['id']}/file", headers=headers)
    assert file.content == PNG

    assert house_paint.size_for(3840, 2160) == (2048, 1152)
    assert house_paint.size_for(1080, 1920) == (1152, 2048)

    # OpenAI's refusals come back in plain words.
    def refuse(request):
        return httpx.Response(400, json={"error": {"code": "moderation_blocked", "message": "no"}})

    monkeypatch.setattr(house_paint.httpx, "AsyncClient",
                        lambda **kw: real_client(transport=httpx.MockTransport(refuse), **kw))
    refused = await api.post("/api/mapping/paint", headers=headers,
                             json={"prompt": "something", "show_id": show["id"], "image": photo})
    assert refused.status_code == 502
    assert "declined" in refused.json()["detail"]

    removed = await api.delete("/api/mapping/paint/key", headers=headers)
    assert removed.json()["available"] is False


async def test_changing_a_scene_in_words_keeps_its_picture(api, monkeypatch):
    from app.services import scene_ai

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    headers = await login(api)
    calls: list = []
    answer = {"name": "x", "description": "", "layers": [{"type": "falling", "style": "snow"}]}
    monkeypatch.setattr(scene_ai, "_client", lambda key: FakeClient(answer, calls))
    scene = (await api.post("/api/mapping/scenes", headers=headers, json={
        "name": "Painted", "layers": [
            {"type": "picture", "media_id": 7, "blend": "normal", "target": "building"},
            {"type": "glow"},
        ]})).json()
    assert scene["layers"][0]["media_id"] == 7
    changed = await api.post("/api/mapping/scenes/describe", headers=headers,
                             json={"prompt": "add snow", "scene_id": scene["id"]})
    assert changed.status_code == 200, changed.text
    assert [layer["type"] for layer in changed.json()["layers"]] == ["picture", "falling"]
    assert changed.json()["layers"][0]["media_id"] == 7
    assert '"picture"' not in calls[-1]["messages"][0]["content"]


async def test_christmas_countdown_is_a_scene_layer(api):
    """The countdown saves with a scene like any layer, and Claude may use it."""
    from app.services import scene_ai

    headers = await login(api)
    created = await api.post("/api/mapping/scenes", headers=headers, json={
        "name": "Countdown",
        "layers": [
            {"type": "falling", "style": "snow"},
            {"type": "countdown", "style": "marquee", "target": "building", "blend": "normal",
             "color": "#b3122a", "color2": "#ffcf70", "size": 0.8, "fade": 0.5, "near": "grow"},
        ],
    })
    assert created.status_code == 201, created.text
    countdown = created.json()["layers"][1]
    assert countdown["type"] == "countdown" and countdown["style"] == "marquee"
    assert countdown["near"] == "grow"
    # Without pins it stays centred on its area, as scenes saved before it could be moved.
    assert countdown["pins"] is None

    # As an element: put somewhere, sized and turned.
    moved = await api.patch(f"/api/mapping/scenes/{created.json()['id']}", headers=headers, json={
        "layers": [{**countdown, "pins": [{"x": 0.3, "y": 0.6, "size": 1.4, "rotation": -12}]}]})
    assert moved.status_code == 200, moved.text
    assert moved.json()["layers"][0]["pins"] == [{"x": 0.3, "y": 0.6, "size": 1.4, "rotation": -12.0}]

    # Its own colour for each part; parts left out keep the look's.
    recoloured = await api.patch(f"/api/mapping/scenes/{created.json()['id']}", headers=headers, json={
        "layers": [{**countdown, "colors": {"number": "#00ff88", "caption": "#ffffff", "decorations": "#123abc"}}]})
    assert recoloured.status_code == 200, recoloured.text
    colors = recoloured.json()["layers"][0]["colors"]
    assert colors["number"] == "#00ff88" and colors["decorations"] == "#123abc"
    assert colors["depth"] is None and colors["clock"] is None
    refused = await api.patch(f"/api/mapping/scenes/{created.json()['id']}", headers=headers, json={
        "layers": [{**countdown, "colors": {"number": "green"}}]})
    assert refused.status_code == 422

    assert "countdown" in scene_ai._catalog_text()
    layers = scene_ai.to_layers([{"type": "countdown", "style": "sparkly", "size": 3, "near": "flee"}])
    assert layers[0].style == "gold" and layers[0].size == 1.0 and layers[0].near == "none"


async def test_changing_a_scene_keeps_objects_placed_by_hand(api, monkeypatch):
    from app.services import scene_ai

    headers = await login(api)
    pins = [{"x": 0.3, "y": 0.8, "size": 1.0, "rotation": 0.0}, {"x": 0.6, "y": 0.8, "size": 2.0, "rotation": 15.0}]
    scene = (await api.post("/api/mapping/scenes", headers=headers, json={
        "name": "Porch pumpkins", "layers": [
            {"type": "countdown", "style": "gold", "pins": [{"x": 0.7, "y": 0.3, "rotation": 10}],
             "colors": {"number": "#00ff88", "clock": "#ff00aa"}},
            {"type": "shapes", "style": "pumpkins", "pins": pins}]})).json()

    calls: list = []
    answer = {"name": "Porch", "description": "Brighter.", "layers": [
        {"type": "shapes", "name": "Bats", "style": "bats", "opacity": 1, "blend": "add",
         "color": "#222222", "color2": "#ff8800", "size": 0.3, "speed": 0.5, "amount": 0.5,
         "fade": 0.5, "target": "everywhere", "reacts_to": "always", "reaction": 0.5,
         "motion": "flutter", "change": "none", "near": "flee", "reach": 0.5},
        {"type": "shapes", "name": "Pumpkins", "style": "pumpkins", "opacity": 1, "blend": "add",
         "color": "#ff8800", "color2": "#ffdd00", "size": 0.4, "speed": 0.5, "amount": 0.5,
         "fade": 0.5, "target": "everywhere", "reacts_to": "always", "reaction": 0.5,
         "motion": "none", "change": "flicker", "near": "light", "reach": 0.5},
        {"type": "countdown", "name": "Countdown", "style": "frost", "opacity": 1, "blend": "normal",
         "color": "#b3122a", "color2": "#ffcf70", "size": 0.7, "speed": 0.4, "amount": 0.6,
         "fade": 0.5, "target": "building", "reacts_to": "always", "reaction": 0.5,
         "motion": "none", "change": "none", "near": "light", "reach": 0.5},
    ]}
    monkeypatch.setattr(scene_ai, "_client", lambda key: FakeClient(answer, calls))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-api03-" + "x" * 40)
    changed = await api.post("/api/mapping/scenes/describe", headers=headers,
                             json={"prompt": "add bats", "scene_id": scene["id"]})
    assert changed.status_code == 200, changed.text
    bats, pumpkins, countdown = changed.json()["layers"]
    # The pumpkins and the countdown stay where they were put; the new bats spread out.
    assert pumpkins["pins"] == pins
    assert countdown["pins"] == [{"x": 0.7, "y": 0.3, "size": 1.0, "rotation": 10.0}]
    assert bats["pins"] is None
    # The countdown keeps the colours picked for its parts.
    assert countdown["colors"]["number"] == "#00ff88" and countdown["colors"]["clock"] == "#ff00aa"
    assert bats["colors"] is None
    # Claude is not sent the positions or the part colours.
    assert '"pins"' not in calls[-1]["messages"][0]["content"]
    assert '"colors"' not in calls[-1]["messages"][0]["content"]


async def test_a_cue_plays_different_scenes_on_different_projectors(api):
    headers = await login(api)
    show = await make_show(api, headers)
    outputs = []
    for name in ("Garage", "House"):
        made = await api.post(f"/api/mapping/shows/{show['id']}/outputs", headers=headers,
                              json={"name": name})
        assert made.status_code == 201, made.text
        outputs.append(made.json()["id"])
    garage, house = outputs
    ghosts = (await api.post("/api/mapping/scenes", headers=headers, json={
        "name": "Ghosts", "layers": [{"type": "shapes", "style": "ghosts"}]})).json()
    pumpkins = (await api.post("/api/mapping/scenes", headers=headers, json={
        "name": "Pumpkins", "layers": [{"type": "shapes", "style": "pumpkins"}]})).json()

    cue = await make_cue(api, headers, show["id"], scene_id=ghosts["id"],
                         output_scenes={str(house): pumpkins["id"]})
    assert cue["output_scenes"] == {str(house): pumpkins["id"]}
    changed = await api.patch(f"/api/mapping/cues/{cue['id']}", headers=headers,
                              json={"output_scenes": {str(garage): None, str(house): pumpkins["id"]}})
    assert changed.status_code == 200, changed.text
    assert changed.json()["output_scenes"] == {str(garage): None, str(house): pumpkins["id"]}

    # The players are told which scene goes where.
    state = await api.post("/api/mapping/transport", headers=headers,
                           json={"action": "goto", "show_id": show["id"], "cue": 0})
    assert state.json()["current"]["output_scenes"] == {str(garage): None, str(house): pumpkins["id"]}
    await api.post("/api/mapping/transport", headers=headers, json={"action": "stop"})

    # Another show's projector or an unknown scene is refused.
    other = await make_show(api, headers, name="Other")
    elsewhere = (await api.post(f"/api/mapping/shows/{other['id']}/outputs", headers=headers,
                                json={"name": "Barn"})).json()["id"]
    for bad in ({str(elsewhere): ghosts["id"]}, {str(house): 999}):
        refused = await api.patch(f"/api/mapping/cues/{cue['id']}", headers=headers,
                                  json={"output_scenes": bad})
        assert refused.status_code == 400, bad

    # Deleting a scene leaves its projectors with no scene, like the cue itself.
    await api.delete(f"/api/mapping/scenes/{pumpkins['id']}", headers=headers)
    reloaded = (await api.get(f"/api/mapping/shows/{show['id']}", headers=headers)).json()
    assert reloaded["cues"][0]["output_scenes"] == {str(garage): None, str(house): None}
    assert reloaded["cues"][0]["scene_id"] == ghosts["id"]
