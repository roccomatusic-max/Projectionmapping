"""Phone alerts: ntfy or Pushover, and the alerts worth waking a phone for."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from tests.test_api import add_projector, api, login  # noqa: F401 - fixture
from tests.test_mapping import make_show


@pytest.fixture
def sent(monkeypatch, tmp_path):
    """Every notification the server tries to send, instead of sending it."""
    from app.services import phone_alerts

    calls: list[dict] = []

    async def fake_post(url, **kwargs):
        calls.append({"url": url, **kwargs})
        return httpx.Response(200, json={"id": "x"})

    monkeypatch.setattr(phone_alerts, "post", fake_post)
    # Beside each test's own media folder, not in the shared temp folder.
    monkeypatch.setattr(phone_alerts.PhoneAlerts, "path",
                        staticmethod(lambda: tmp_path / phone_alerts.FILENAME))
    phone_alerts.phone.sent_keys.clear()
    phone_alerts.phone._tasks.clear()  # an earlier test's event loop is gone
    phone_alerts.phone.last = None
    return calls


async def _settled():
    from app.services.phone_alerts import phone

    if phone._tasks:
        await asyncio.gather(*phone._tasks)


async def _ntfy_on(api, headers) -> dict:
    turned = await api.put("/api/phone-alerts", headers=headers, json={"service": "ntfy"})
    assert turned.status_code == 200, turned.text
    return turned.json()


async def test_ntfy_needs_no_account_and_the_test_reaches_it(api, sent):
    headers = await login(api)
    first = (await api.get("/api/phone-alerts", headers=headers)).json()
    assert first["service"] == "off" and first["ready"] is False
    assert all(first["topics"].values()) and first["all_clear"] is True

    body = await _ntfy_on(api, headers)
    channel = body["ntfy_topic"]
    assert body["ready"] is True
    assert channel.startswith("show-") and len(channel) == 19
    # The name stays put; picking ntfy again does not change it.
    assert (await _ntfy_on(api, headers))["ntfy_topic"] == channel

    tested = await api.post("/api/phone-alerts/test", headers=headers)
    assert tested.status_code == 200, tested.text
    assert tested.json()["ok"] is True
    assert sent[-1]["url"] == "https://ntfy.sh"
    assert sent[-1]["json"]["topic"] == channel
    assert sent[-1]["json"]["title"] == "Test from Projector Control"

    renewed = (await api.post("/api/phone-alerts/new-channel", headers=headers)).json()
    assert renewed["ntfy_topic"] != channel


async def test_a_failed_send_says_why(api, monkeypatch, sent):
    from app.services import phone_alerts

    headers = await login(api)
    await _ntfy_on(api, headers)

    async def offline(url, **kwargs):
        raise httpx.ConnectError("no route")

    monkeypatch.setattr(phone_alerts, "post", offline)
    tested = (await api.post("/api/phone-alerts/test", headers=headers)).json()
    assert tested["ok"] is False
    assert "Could not reach ntfy" in tested["message"]
    shown = (await api.get("/api/phone-alerts", headers=headers)).json()
    assert shown["last_ok"] is False


async def test_pushover_keys_are_checked_and_never_shown_again(api, sent):
    headers = await login(api)
    bad = await api.put("/api/phone-alerts", headers=headers,
                        json={"service": "pushover", "pushover_user": "not a key"})
    assert bad.status_code == 400

    user, token = "u" + "a1" * 14 + "z", "t" + "b2" * 14 + "y"
    saved = await api.put("/api/phone-alerts", headers=headers, json={
        "service": "pushover", "pushover_user": user, "pushover_token": token})
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["ready"] is True
    assert user not in str(body) and token not in str(body)
    assert body["pushover_user_hint"] == user[-4:]

    # Changing a switch keeps the keys.
    await api.put("/api/phone-alerts", headers=headers, json={"all_clear": False})
    tested = (await api.post("/api/phone-alerts/test", headers=headers)).json()
    assert tested["ok"] is True
    assert sent[-1]["url"] == "https://api.pushover.net/1/messages.json"
    assert sent[-1]["data"]["user"] == user and sent[-1]["data"]["token"] == token


async def test_only_admins_see_or_change_phone_alerts(api, sent):
    admin = await login(api)
    made = await api.post("/api/auth/users", headers=admin, json={
        "username": "operator1", "password": "a-long-test-password", "role": "operator"})
    assert made.status_code == 201
    operator = await login(api, "operator1", "a-long-test-password")
    assert (await api.get("/api/phone-alerts", headers=operator)).status_code == 403
    assert (await api.post("/api/phone-alerts/test", headers=operator)).status_code == 403


async def test_an_alert_reaches_the_phone_once_then_all_clear(api, sent):
    from app.db.models import Severity
    from app.services.alerts import alerting

    headers = await login(api)
    await _ntfy_on(api, headers)

    async def offline():
        await alerting.raise_alert(dedupe_key="offline:7", projector_id=None, kind="offline",
                                   severity=Severity.CRITICAL,
                                   message="House Left stopped responding")
        await _settled()

    await offline()
    assert len(sent) == 1
    assert sent[0]["json"]["title"] == "Projector not answering"
    assert sent[0]["json"]["message"] == "House Left stopped responding"
    assert sent[0]["json"]["priority"] == 5
    # Still offline on the next poll: the phone is not told again.
    await offline()
    assert len(sent) == 1

    await alerting.resolve_alert("offline:7", "House Left is responding again")
    await _settled()
    assert len(sent) == 2
    assert sent[1]["json"]["title"] == "All clear"

    # A button someone just pressed is never sent; a group turned off is not either.
    await alerting.raise_alert(dedupe_key="unverified:7:power", projector_id=None,
                               kind="command_unverified", severity=Severity.WARNING,
                               message="power not confirmed")
    await api.put("/api/phone-alerts", headers=headers, json={"topics": {"offline": False}})
    await alerting.resolve_alert("offline:7", "x")
    await offline()
    assert len(sent) == 2


def _diagnostics(celsius: float, projector_id: int) -> dict:
    return {"projector_id": projector_id, "name": "Garage", "tier": "diagnostics",
            "temperature": {"availability": "available", "value": {"sensors": [
                {"key": "intake", "celsius": celsius}, {"key": "exhaust", "celsius": 70.0}]}}}


async def test_a_projector_running_hot_is_sent_and_again_when_too_hot(api, sent):
    from app.services.alerts import alerting

    headers = await login(api)
    await _ntfy_on(api, headers)
    garage = await add_projector(api, headers, name="Garage")

    await alerting._handle("projector_state", _diagnostics(30.0, garage))  # 86 °F: fine
    await alerting._handle("projector_state", _diagnostics(41.0, garage))  # 106 °F: near 113 °F
    await _settled()
    assert [s["json"]["title"] for s in sent] == ["Projector running hot"]
    assert "106 °F (41 °C)" in sent[0]["json"]["message"]
    assert "113 °F (45 °C)" in sent[0]["json"]["message"]

    await alerting._handle("projector_state", _diagnostics(46.0, garage))
    await _settled()
    assert sent[-1]["json"]["title"] == "Projector too hot"
    alerts = (await api.get("/api/alerts", headers=headers)).json()
    hot = [a for a in alerts if a["projector_id"] == garage and a["state"] == "open"]
    assert len(hot) == 1 and hot[0]["severity"] == "critical"

    # Just under the warning line is not yet cool; well under it is.
    await alerting._handle("projector_state", _diagnostics(39.5, garage))
    await _settled()
    assert sent[-1]["json"]["title"] == "Projector too hot"
    await alerting._handle("projector_state", _diagnostics(35.0, garage))
    await _settled()
    assert sent[-1]["json"]["title"] == "All clear"
    assert "cooled down" in sent[-1]["json"]["message"]


async def test_a_mini_pc_that_goes_quiet_is_sent(api, sent):
    from app.db.models import MappingPlayer
    from app.db.session import session_scope
    from app.services.alerts import alerting

    headers = await login(api)
    await _ntfy_on(api, headers)
    show = await make_show(api, headers)
    output = (await api.post(f"/api/mapping/shows/{show['id']}/outputs", headers=headers,
                             json={"name": "Poolhouse"})).json()
    now = datetime.now(UTC)
    async with session_scope() as session:
        player = MappingPlayer(device_id="d1", secret_hash="0" * 64, name="Poolhouse PC",
                               code="ABC234", approved=True, output_id=output["id"],
                               last_seen_at=now - timedelta(minutes=5))
        waiting = MappingPlayer(device_id="d2", secret_hash="1" * 64, name="Not paired",
                                code="ABC235", approved=False,
                                last_seen_at=now - timedelta(minutes=5))
        session.add_all([player, waiting])
        await session.flush()
        player_id = player.id

    # Just after the server starts, mini PCs get time to come back.
    alerting._started_at = now
    await alerting.check_minipcs(now)
    assert sent == []

    alerting._started_at = now - timedelta(hours=1)
    alerting.expect_minipc_away(player_id, 10)  # Restart computer was pressed
    await alerting.check_minipcs(now)
    assert sent == []
    await alerting.check_minipcs(now + timedelta(minutes=11))
    await alerting.check_minipcs(now + timedelta(minutes=12))
    await _settled()
    assert len(sent) == 1
    assert sent[0]["json"]["title"] == "Mini PC offline"
    assert "Poolhouse PC stopped reporting" in sent[0]["json"]["message"]

    async with session_scope() as session:
        (await session.get(MappingPlayer, player_id)).last_seen_at = datetime.now(UTC)
    await alerting.check_minipcs()
    await _settled()
    assert sent[-1]["json"]["title"] == "All clear"
    assert sent[-1]["json"]["message"] == "Mini PC Poolhouse PC is back online"


async def test_a_show_the_schedule_could_not_start_is_sent(api, sent):
    from app.config import settings
    from app.services import tonight as service

    headers = await login(api)
    await _ntfy_on(api, headers)
    show = await make_show(api, headers)
    await api.post(f"/api/mapping/shows/{show['id']}/cues", headers=headers, json={})
    assert (await api.post("/api/emergency/stop", headers=headers)).status_code == 200

    now = datetime.now(settings.tz).replace(second=0, microsecond=0)
    saved = await api.put("/api/tonight", headers=headers, json={
        "enabled": True, "show_id": show["id"], "start_at": now.strftime("%H:%M"),
        "end_at": (now + timedelta(hours=2)).strftime("%H:%M"), "power": False})
    assert saved.status_code == 200, saved.text
    await service.scheduler.tick(now)
    await _settled()
    assert [s["json"]["title"] for s in sent] == ["Show did not start"]
    assert "emergency stop is on" in sent[0]["json"]["message"]

    # Started by hand once cleared: all clear.
    await api.post("/api/emergency/clear", headers=headers)
    started = (await api.post("/api/tonight/start", headers=headers)).json()
    assert started["ok"] is True, started
    await asyncio.sleep(0.2)  # the "Show started" note comes through the bus
    await _settled()
    assert {"title": "All clear", "message": "Tonight's show is playing"} in [
        {k: s["json"][k] for k in ("title", "message")} for s in sent]


async def test_the_show_starting_and_stopping_is_sent(api, sent):
    from app.services import tonight as service

    headers = await login(api)
    await _ntfy_on(api, headers)
    show = await make_show(api, headers, name="Halloween")
    for _ in range(2):
        await api.post(f"/api/mapping/shows/{show['id']}/cues", headers=headers, json={})

    async def transport(action, **body):
        done = await api.post("/api/mapping/transport", headers=headers,
                              json={"action": action, **body})
        assert done.status_code == 200, done.text
        await asyncio.sleep(0.2)  # the alerting service hears it from the bus
        await _settled()

    await transport("go", show_id=show["id"])
    assert [s["json"]["title"] for s in sent] == ["Show started"]
    assert sent[0]["json"]["message"].startswith("Halloween started at ")
    assert sent[0]["json"]["message"].endswith(", playing cue 1.")
    # The next cue, pausing and resuming are not news.
    await transport("go")
    await transport("pause")
    await transport("resume")
    assert len(sent) == 1

    await transport("stop")
    assert sent[-1]["json"]["title"] == "Show stopped"
    assert "Halloween stopped at " in sent[-1]["json"]["message"]
    assert "after 0 min" in sent[-1]["json"]["message"]

    # Tonight's show says who; the emergency stop says so.
    await api.put("/api/tonight", headers=headers, json={"show_id": show["id"]})
    ok, _ = await service.start_show(by="the schedule")
    assert ok
    await asyncio.sleep(0.2)
    await _settled()
    assert " by the schedule, playing cue 1." in sent[-1]["json"]["message"]
    assert (await api.post("/api/emergency/stop", headers=headers)).status_code == 200
    await asyncio.sleep(0.2)
    await _settled()
    assert "stopped at" in sent[-1]["json"]["message"]
    assert "by the emergency stop" in sent[-1]["json"]["message"]

    # Turned off, nothing more is sent.
    await api.post("/api/emergency/clear", headers=headers)
    await api.put("/api/phone-alerts", headers=headers, json={"topics": {"showtime": False}})
    count = len(sent)
    await transport("go", show_id=show["id"])
    assert len(sent) == count
