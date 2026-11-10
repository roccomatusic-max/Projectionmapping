"""Keeping every projector in step: the show clock, the server's check on
each mini PC's clock, the out-of-step warning, the time shift, the sync
test and reloading output pages left behind by an update."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

import pytest

from tests.test_api import api, login  # noqa: F401 - fixture
from tests.test_mapping import make_cue, make_show, transport
from tests.test_minipc import PLAYER, hello


@pytest.fixture(autouse=True)
def _fresh():
    import app.api.routes.mapping_players as players
    from app.services.alerts import alerting
    players._clock_gaps.clear()
    players._reloaded.clear()
    players._queued.clear()
    alerting._out_of_step.clear()
    yield
    players._clock_gaps.clear()
    players._reloaded.clear()


class FakeTime:
    """time.time and time.perf_counter, moved by hand."""

    def __init__(self) -> None:
        self.wall = 1_800_000_000.0
        self.counter = 1000.0

    def advance(self, seconds: float) -> None:
        self.wall += seconds
        self.counter += seconds


@pytest.fixture
def fake_time(monkeypatch):
    from app.services import mapping
    clock = FakeTime()
    monkeypatch.setattr(mapping.time, "time", lambda: clock.wall)
    monkeypatch.setattr(mapping.time, "perf_counter", lambda: clock.counter)
    return clock


def test_the_show_clock_does_not_jump_when_the_computer_time_is_set(fake_time):
    from app.services.mapping import ShowClock
    show = ShowClock()
    start = show.now()
    assert start == pytest.approx(fake_time.wall * 1000)

    # Windows sets its time 3 seconds forward: the show clock eases over.
    fake_time.wall += 3.0
    fake_time.advance(1.0)
    after = show.now()
    assert after - start == pytest.approx(1000.0, abs=0.2)
    # It takes the difference up at 0.01 %, never faster.
    previous = after
    for _ in range(600):
        fake_time.advance(1.0)
        now = show.now()
        assert 999.9 - 1e-3 <= now - previous <= 1000.1 + 1e-3
        previous = now
    assert fake_time.wall * 1000 - show.now() == pytest.approx(3000 - 60.1, abs=1.0)


def test_a_huge_clock_change_is_taken_at_once_only_with_nothing_playing(fake_time):
    from app.services.mapping import ShowClock
    show = ShowClock()
    playing = True
    show.may_step = lambda: not playing
    fake_time.wall += 3600.0  # the time set by hand, an hour out
    fake_time.advance(1.0)
    assert fake_time.wall * 1000 - show.now() > 3_500_000
    playing = False
    fake_time.advance(1.0)
    assert show.now() == pytest.approx(fake_time.wall * 1000)


async def _player(api, headers) -> tuple[int, dict, dict]:
    show = await make_show(api, headers)
    output = (await api.post(f"/api/mapping/shows/{show['id']}/outputs", headers=headers,
                             json={"name": "Pool house"})).json()
    player = await hello(api, PLAYER)
    await api.patch(f"/api/mapping/players/{player['player_id']}", headers=headers,
                    json={"approved": True, "output_id": output["id"]})
    token = {"Authorization": f"Bearer {(await hello(api, PLAYER))['access_token']}"}
    return player["player_id"], token, show


async def beat(api, token, **report) -> dict:
    from app.paths import app_version
    version = app_version()
    response = await api.post("/api/mapping/players/me", headers=token,
                              json={"fps": 60, "page_version": version, **report})
    assert response.status_code == 200, response.text
    return response.json()


async def listed(api, headers, player_id: int) -> dict:
    players = (await api.get("/api/mapping/players", headers=headers)).json()
    return next(p for p in players if p["id"] == player_id)


async def test_the_server_checks_each_mini_pcs_clock(api):
    from app.services.mapping import now_ms
    headers = await login(api)
    player_id, token, _ = await _player(api, headers)

    await beat(api, token, clock_now=now_ms(), sync_ms=2)
    report = (await listed(api, headers, player_id))["report"]
    assert abs(report["clock_check_ms"]) <= 20
    assert "clock_now" not in report  # used, not kept

    # A mini PC whose clock runs 300 ms ahead is caught, whatever it says itself.
    for _ in range(12):
        await beat(api, token, clock_now=now_ms() + 300, sync_ms=2)
    report = (await listed(api, headers, player_id))["report"]
    assert 280 <= report["clock_check_ms"] <= 310


async def test_a_mini_pc_out_of_step_raises_a_warning_and_clears(api):
    from sqlalchemy import select

    from app.db.models import Alert
    from app.db.session import session_scope
    from app.services.alerts import alerting
    headers = await login(api)
    player_id, token, _ = await _player(api, headers)

    async def open_alerts():
        async with session_scope() as session:
            return (await session.execute(
                select(Alert).where(Alert.kind == "minipc_out_of_sync", Alert.state != "resolved")
            )).scalars().all()

    await beat(api, token, sync_ms=120)
    await alerting.check_minipcs()
    assert await open_alerts() == []  # once could be a hiccup
    await alerting.check_minipcs()
    alerts = await open_alerts()
    assert len(alerts) == 1
    assert "out of step" in alerts[0].message

    await beat(api, token, sync_ms=3)
    await alerting.check_minipcs()
    assert await open_alerts() == []


async def test_a_projector_can_be_shifted_later_or_earlier(api):
    headers = await login(api)
    player_id, token, _ = await _player(api, headers)
    assert (await beat(api, token))["trim_ms"] == 0

    set_ = await api.post(f"/api/mapping/players/{player_id}/trim", headers=headers,
                          json={"trim_ms": 25})
    assert set_.status_code == 200, set_.text
    assert set_.json()["report"]["trim_ms"] == 25
    # Kept through the heartbeats that replace the rest of the report.
    assert (await beat(api, token))["trim_ms"] == 25
    assert (await beat(api, token))["trim_ms"] == 25
    assert (await listed(api, headers, player_id))["report"]["trim_ms"] == 25

    cleared = await api.post(f"/api/mapping/players/{player_id}/trim", headers=headers,
                             json={"trim_ms": 0})
    assert "trim_ms" not in cleared.json()["report"]
    assert (await beat(api, token))["trim_ms"] == 0

    too_far = await api.post(f"/api/mapping/players/{player_id}/trim", headers=headers,
                             json={"trim_ms": 900})
    assert too_far.status_code == 422


async def test_the_sync_test_goes_on_every_projector_and_off_again(api):
    headers = await login(api)
    player_id, token, show = await _player(api, headers)

    on = await api.post("/api/mapping/players/sync-test", headers=headers, json={"on": True})
    assert on.status_code == 200, on.text
    assert next(p for p in on.json() if p["id"] == player_id)["screen"] == "sync"
    outputs = (await api.get(f"/api/mapping/shows/{show['id']}", headers=headers)).json()["outputs"]
    assert [o["test_pattern"] for o in outputs] == ["sync"]

    off = await api.post("/api/mapping/players/sync-test", headers=headers, json={"on": False})
    assert next(p for p in off.json() if p["id"] == player_id)["screen"] == "none"


async def test_taking_the_sync_test_off_leaves_a_grid_alone(api):
    headers = await login(api)
    player_id, _, _ = await _player(api, headers)
    await api.post(f"/api/mapping/players/{player_id}/screen", headers=headers, json={"pattern": "grid"})
    off = await api.post("/api/mapping/players/sync-test", headers=headers, json={"on": False})
    assert next(p for p in off.json() if p["id"] == player_id)["screen"] == "grid"


async def test_an_output_page_older_than_the_server_is_reloaded_once_while_nothing_plays(api):
    headers = await login(api)
    player_id, token, show = await _player(api, headers)

    # Its page came from before the update (or from before pages said).
    old = await api.post("/api/mapping/players/me", headers=token, json={"fps": 60})
    assert old.json()["commands"] == ["reload"]
    again = await api.post("/api/mapping/players/me", headers=token, json={"fps": 60})
    assert again.json()["commands"] == []
    # The new page, reloaded, says which version it is.
    assert (await beat(api, token))["commands"] == []


async def test_no_reload_while_a_show_plays(api):
    headers = await login(api)
    player_id, token, show = await _player(api, headers)
    await make_cue(api, headers, show["id"], name="One")
    assert (await transport(api, headers, action="go", show_id=show["id"])).status_code == 200
    playing = await api.post("/api/mapping/players/me", headers=token,
                             json={"fps": 60, "page_version": "0.0.1-old"})
    assert playing.json()["commands"] == []
    await transport(api, headers, action="stop")
    stopped = await api.post("/api/mapping/players/me", headers=token,
                             json={"fps": 60, "page_version": "0.0.1-old"})
    assert stopped.json()["commands"] == ["reload"]
