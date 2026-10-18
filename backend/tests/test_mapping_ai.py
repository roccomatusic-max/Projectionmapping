"""The optional AI calls: what the person is told when the provider says no."""

from __future__ import annotations

import json
from types import SimpleNamespace

import anthropic
import httpx
import httpx2
import pytest

from app.services import house_paint, scene_ai


def anthropic_answering(monkeypatch, handler):
    """scene_ai talks to ``handler`` instead of Anthropic, without retries."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-api03-" + "t" * 40)
    monkeypatch.setattr(scene_ai, "_client", lambda key: anthropic.AsyncAnthropic(
        api_key=key, max_retries=0,
        http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handler))))


def error(status: int, kind: str, message: str):
    return lambda request: httpx2.Response(status, json={
        "type": "error", "error": {"type": kind, "message": message}})


async def test_the_providers_own_words_come_back(monkeypatch):
    anthropic_answering(monkeypatch, error(
        400, "invalid_request_error",
        "Your credit balance is too low to access the Anthropic API."))
    with pytest.raises(scene_ai.SceneAiError) as raised:
        await scene_ai.describe("a gingerbread house", surfaces=[])
    assert "no credit" in str(raised.value)
    assert "Your credit balance is too low" in str(raised.value)

    anthropic_answering(monkeypatch, error(
        429, "rate_limit_error", "Number of request tokens has exceeded your per-minute rate limit"))
    with pytest.raises(scene_ai.SceneAiError) as raised:
        await scene_ai.describe("a gingerbread house", surfaces=[])
    assert "per-minute rate limit" in str(raised.value)


async def test_a_timeout_is_not_called_a_lost_connection(monkeypatch):
    def slow(request):
        raise httpx2.ReadTimeout("timed out", request=request)

    anthropic_answering(monkeypatch, slow)
    with pytest.raises(scene_ai.SceneAiError) as raised:
        await scene_ai.describe("a gingerbread house", surfaces=[])
    assert "too long" in str(raised.value)


@pytest.mark.parametrize("text", ["[1, 2]", '"a scene"', '{"layers": {"type": "glow"}}'])
async def test_an_answer_of_the_wrong_shape_is_explained(monkeypatch, text):
    """Regression: a JSON answer that is not an object crashed with a 500."""
    def answer(request):
        return httpx2.Response(200, json={
            "id": "msg_1", "type": "message", "role": "assistant", "model": scene_ai.MODEL,
            "content": [{"type": "text", "text": text}], "stop_reason": "end_turn",
            "stop_sequence": None, "usage": {"input_tokens": 1, "output_tokens": 1}})

    anthropic_answering(monkeypatch, answer)
    with pytest.raises(scene_ai.SceneAiError):
        await scene_ai.describe("a gingerbread house", surfaces=[])


async def test_the_key_check_does_not_wait_minutes(monkeypatch):
    seen: list[dict] = []

    class Client:
        models = SimpleNamespace()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

    async def list_models(**kwargs):
        seen.append(kwargs)

    Client.models.list = list_models
    monkeypatch.setattr(scene_ai, "_client", lambda key: Client())
    await scene_ai.check_key("sk-ant-api03-" + "k" * 40)
    assert 0 < seen[-1]["timeout"] <= 30


def openai_response(status: int, body) -> httpx.Response:
    return httpx.Response(status, content=json.dumps(body).encode(),
                          headers={"content-type": "application/json"})


def test_openai_errors_of_any_shape_are_explained():
    # Some proxies (OPENAI_BASE_URL) answer with a bare string or a list.
    assert "Invalid key format" in house_paint._explain(openai_response(400, {"error": "Invalid key format"}))
    assert "(502)" in house_paint._explain(openai_response(502, ["upstream failed"]))
    quota = house_paint._explain(openai_response(429, {"error": {
        "code": "insufficient_quota", "message": "You exceeded your current quota."}}))
    assert "no credit" in quota and "You exceeded your current quota." in quota
