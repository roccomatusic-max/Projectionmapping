"""The house's parts from a photo: Claude's tracing, and how the photo lines up."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

import base64
import json

import httpx2

from app.services import house_photo, scene_ai
from tests.test_api import api, login  # noqa: F401 - fixture
from tests.test_mapping import PNG, make_show, upload
from tests.test_mapping_ai import anthropic_answering, error
from tests.test_mapping_scenes import FakeClient

JPEG = b"\xff\xd8\xff" + b"jpeg" * 50
PHOTO = "data:image/jpeg;base64," + base64.b64encode(JPEG).decode()

TRACED = {
    "description": "A two-storey white house with a grey roof and a red front door.",
    "parts": [
        {"kind": "roof", "name": "Main roof", "points": [[100, 300], [500, 50], [900, 300]]},
        {"kind": "wall", "name": "Front wall",
         "points": [[120, 300], [880, 300], [880, 700], [120, 700]]},
        # Points off the photo are pulled onto its edge.
        {"kind": "door", "name": "Front door",
         "points": [[450, 500], [550, 500], [550, 720], [450, 720]]},
        # Too few points, a flat line, junk points and an unknown kind.
        {"kind": "window", "name": "Broken", "points": [[1, 2], [3, 4]]},
        {"kind": "window", "name": "Flat", "points": [[1, 1], [2, 2], [3, 3]]},
        {"kind": "chimney", "name": "", "points": [[0, 0], [10, 0], "x", [10, 10]]},
    ],
}


async def test_trace_needs_a_key(api, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    headers = await login(api)
    refused = await api.post("/api/mapping/house-photo/trace", headers=headers,
                             json={"image": PHOTO, "width": 1000, "height": 700})
    assert refused.status_code == 502
    assert "Settings" in refused.json()["detail"]
    assert "by hand" in refused.json()["detail"]


async def test_trace_sends_the_photo_and_cleans_the_answer(api, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    headers = await login(api)
    calls: list = []
    monkeypatch.setattr(scene_ai, "_client", lambda key: FakeClient(TRACED, calls))
    traced = await api.post("/api/mapping/house-photo/trace", headers=headers,
                            json={"image": PHOTO, "width": 1000, "height": 700})
    assert traced.status_code == 200, traced.text
    body = traced.json()
    assert body["description"].startswith("A two-storey white house")
    assert [(p["kind"], p["name"]) for p in body["parts"]] == [
        ("roof", "Main roof"), ("wall", "Front wall"), ("door", "Front door"),
        ("other", "Other")]
    assert body["parts"][0]["points"] == [[0.1, 0.42857], [0.5, 0.07143], [0.9, 0.42857]]
    assert body["parts"][2]["points"][2] == [0.55, 1.0]

    sent = calls[-1]
    assert sent["model"] == scene_ai.MODEL
    image, text = sent["messages"][0]["content"]
    assert image["source"] == {"type": "base64", "media_type": "image/jpeg",
                               "data": base64.b64encode(JPEG).decode()}
    assert "1000 by 700 pixels" in text["text"]
    assert sent["output_config"]["format"]["type"] == "json_schema"


async def test_trace_refuses_what_is_not_a_photo(api, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    headers = await login(api)
    calls: list = []
    monkeypatch.setattr(scene_ai, "_client", lambda key: FakeClient(TRACED, calls))
    gif = "data:image/gif;base64," + base64.b64encode(b"GIF89a" + b"x" * 100).decode()
    refused = await api.post("/api/mapping/house-photo/trace", headers=headers,
                             json={"image": gif, "width": 1000, "height": 700})
    assert refused.status_code == 502
    assert "JPEG" in refused.json()["detail"]
    junk = await api.post("/api/mapping/house-photo/trace", headers=headers,
                          json={"image": "%" * 200, "width": 1000, "height": 700})
    assert junk.status_code == 400
    assert not calls

    # An answer with nothing usable says what to do.
    monkeypatch.setattr(scene_ai, "_client",
                        lambda key: FakeClient({"description": "", "parts": []}, calls))
    empty = await api.post("/api/mapping/house-photo/trace", headers=headers,
                           json={"image": PHOTO, "width": 1000, "height": 700})
    assert empty.status_code == 502
    assert "whole front of the house" in empty.json()["detail"]


async def test_trace_shows_anthropics_own_words(monkeypatch):
    anthropic_answering(monkeypatch, error(
        400, "invalid_request_error",
        "Your credit balance is too low to access the Anthropic API."))
    try:
        await house_photo.trace(JPEG, 1000, 700)
    except scene_ai.SceneAiError as exc:
        message = str(exc)
    else:
        raise AssertionError("expected an error")
    assert "no credit" in message
    assert "Your credit balance is too low" in message

    def refusal(request):
        return httpx2.Response(200, json={
            "id": "msg_1", "type": "message", "role": "assistant", "model": scene_ai.MODEL,
            "content": [], "stop_reason": "refusal", "stop_sequence": None,
            "usage": {"input_tokens": 1, "output_tokens": 1}})

    anthropic_answering(monkeypatch, refusal)
    try:
        await house_photo.trace(JPEG, 1000, 700)
    except scene_ai.SceneAiError as exc:
        assert "declined" in str(exc)
    else:
        raise AssertionError("expected an error")


async def test_the_photo_lineup_is_kept_per_show(api):
    headers = await login(api)
    show = await make_show(api, headers)
    url = f"/api/mapping/shows/{show['id']}/house-photo"
    assert (await api.get(url, headers=headers)).json() is None

    photo = (await upload(api, headers, name="House photo.png", width=1000, height=700)).json()
    lineup = {"media_id": photo["id"], "description": "White house",
              "corners": [[0.1, 0.1], [0.9, 0.12], [0.92, 0.95], [0.08, 0.9]]}
    saved = await api.put(url, headers=headers, json=lineup)
    assert saved.status_code == 200, saved.text
    assert (await api.get(url, headers=headers)).json() == lineup

    # Three corners, or a photo that is not in the library, are refused.
    bad = await api.put(url, headers=headers, json={**lineup, "corners": lineup["corners"][:3]})
    assert bad.status_code == 422
    missing = await api.put(url, headers=headers, json={**lineup, "media_id": 999})
    assert missing.status_code == 400

    # Deleting the photo from the library forgets the lineup.
    assert (await api.delete(f"/api/mapping/media/{photo['id']}", headers=headers)).status_code == 204
    assert (await api.get(url, headers=headers)).json() is None

    again = (await upload(api, headers, name="House photo 2.png", body=PNG)).json()
    await api.put(url, headers=headers, json={**lineup, "media_id": again["id"]})
    assert (await api.delete(url, headers=headers)).status_code == 204
    assert (await api.get(url, headers=headers)).json() is None


async def test_describing_knows_the_parts_by_name(api, monkeypatch):
    text = scene_ai.surfaces_text([
        {"kind": "door", "name": "Front door", "points": []},
        {"kind": "window", "name": "", "points": []},
    ])
    assert "1 door, 1 window" in text
    assert "Front door (door)" in text
    assert json.dumps(text)
