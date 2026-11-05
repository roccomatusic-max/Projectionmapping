"""Start-up migration behaviour, including adopting an unstamped database."""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import tempfile

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from alembic.config import Config
from app.db.migrate import classify, upgrade_to_head
from app.db.models import Base
from app.paths import alembic_dir

MAPPING_TABLES = {"media_assets", "mapping_shows", "mapping_outputs", "mapping_cues",
                  "mapping_players", "mapping_scenes", "mapping_maps",
                  "mapping_scene_groups", "show_plan", "show_calendar",
                  "heaters", "heater_readings", "weather_place",
                  "show_nights", "history_settings", "mapping_playlists"}
HEAD_REVISION = "c7e1a5d9f3b2"


def test_classification():
    assert classify(set()) == "fresh"
    assert classify({"alembic_version", "projectors"}) == "managed"
    assert classify({"projectors", "users", "events"}) == "unmanaged"


@pytest.fixture
def sqlite_file():
    handle, path = tempfile.mkstemp(suffix=".db")
    os.close(handle)
    yield path
    for suffix in ("", "-wal", "-shm"):
        with contextlib.suppress(FileNotFoundError):
            os.unlink(path + suffix)


async def _tables(engine):
    async with engine.connect() as conn:
        return set(await conn.run_sync(lambda c: inspect(c).get_table_names()))


async def _version(engine):
    async with engine.connect() as conn:
        return (await conn.execute(text("SELECT version_num FROM alembic_version"))).scalar()


async def test_fresh_database_is_migrated_and_stamped(sqlite_file):
    url = f"sqlite+aiosqlite:///{sqlite_file}"
    engine = create_async_engine(url)
    try:
        assert await upgrade_to_head(engine, url) == "fresh"
        tables = await _tables(engine)
        assert {"projectors", "alerts", "alembic_version"} <= tables
        assert await _version(engine) is not None
        # Second run is a no-op.
        assert await upgrade_to_head(engine, url) == "managed"
    finally:
        await engine.dispose()


async def test_database_from_create_all_is_adopted_not_crashed(sqlite_file):
    """The previous build created tables with create_all() and never stamped.

    Regression: 'alembic upgrade head' on such a database raised 'table
    already exists' and the service crash-looped.
    """
    url = f"sqlite+aiosqlite:///{sqlite_file}"
    engine = create_async_engine(url)
    try:
        # The tables that build knew about: everything before the mapping
        # module, which arrived with its own migration.
        legacy = [t for t in Base.metadata.sorted_tables if t.name not in MAPPING_TABLES]
        async with engine.begin() as conn:
            await conn.run_sync(lambda c: Base.metadata.create_all(c, tables=legacy))
        assert "alembic_version" not in await _tables(engine)

        assert await upgrade_to_head(engine, url) == "unmanaged"
        # Stamped at the revision the create_all schema matches, then upgraded
        # from there to head, which adds the later tables.
        assert await _version(engine) == HEAD_REVISION
        assert await _tables(engine) >= MAPPING_TABLES
    finally:
        await engine.dispose()


async def test_stacked_outputs_are_spread_out(sqlite_file):
    """Shows whose outputs all covered the whole canvas get side-by-side slices."""
    url = f"sqlite+aiosqlite:///{sqlite_file}"
    config = Config()
    config.set_main_option("script_location", str(alembic_dir()))
    config.set_main_option("sqlalchemy.url", url)
    await asyncio.to_thread(command.upgrade, config, "5d2e8a41c7b3")

    engine = create_async_engine(url)
    full = '{"x": 0, "y": 0, "w": 1, "h": 1}'
    try:
        async with engine.begin() as conn:
            for show_id in (1, 2):
                await conn.execute(text(
                    "INSERT INTO mapping_shows (id, name, description, canvas_width, canvas_height,"
                    " camera_view, created_at, updated_at) VALUES"
                    f" ({show_id}, 'S{show_id}', '', 1920, 1080, '{{}}', '2026-10-17', '2026-10-17')"))
            rows = [  # show 1: stacked; show 2: placed by hand
                (1, 1, 0, full), (2, 1, 1, "{}"), (3, 1, 2, full),
                (4, 2, 0, full), (5, 2, 1, '{"x": 0.5, "y": 0, "w": 0.5, "h": 1}'),
            ]
            for oid, show_id, pos, source in rows:
                await conn.execute(text(
                    "INSERT INTO mapping_outputs (id, show_id, name, position, width, height, source,"
                    " warp, masks, blend, color, test_pattern, enabled, calibration) VALUES"
                    f" ({oid}, {show_id}, 'O{oid}', {pos}, 1920, 1080, '{source}', '{{}}', '[]',"
                    " '{}', '{}', 'none', 1, '{}')"))
        await asyncio.to_thread(command.upgrade, config, "head")
        async with engine.connect() as conn:
            got = dict((await conn.execute(text("SELECT id, source FROM mapping_outputs"))).all())
        xs = {oid: round(json.loads(src).get("x", 0), 4) for oid, src in got.items()}
        assert [xs[1], xs[2], xs[3]] == [0.0, 0.3333, 0.6667]
        assert [xs[4], xs[5]] == [0.0, 0.5]
        assert json.loads(got[4]) == json.loads(full)
    finally:
        await engine.dispose()


async def test_the_weekly_show_time_moves_onto_the_calendar(sqlite_file):
    """Nights the weekly time played this month become one calendar night each."""
    import calendar
    from datetime import date, datetime, timedelta

    from app.config import settings

    url = f"sqlite+aiosqlite:///{sqlite_file}"
    config = Config()
    config.set_main_option("script_location", str(alembic_dir()))
    config.set_main_option("sqlalchemy.url", url)
    await asyncio.to_thread(command.upgrade, config, "d7a3f9c2e5b1")

    today = datetime.now(settings.tz).date()
    month_end = today.replace(day=calendar.monthrange(today.year, today.month)[1])
    tomorrow = today + timedelta(days=1)
    engine = create_async_engine(url)
    try:
        async with engine.begin() as conn:
            await conn.execute(text(
                "INSERT INTO mapping_shows (id, name, description, canvas_width, canvas_height,"
                " camera_view, created_at, updated_at) VALUES"
                " (1, 'Halloween', '', 1920, 1080, '{}', '2026-10-17', '2026-10-17')"))
            await conn.execute(text(
                "INSERT INTO show_plan (id, show_id, enabled, start_at, end_at, days, power,"
                " last_message, last_start_key, updated_at) VALUES"
                " (1, 1, 1, '18:45', '23:00', '[0,1,2,3,4,5,6]', 1, '', :key, '2026-10-27')"),
                {"key": f"{today.isoformat()}:weekly"})
            now = "2026-10-20 12:00:00"
            # Tomorrow already planned by hand (when it is still this month),
            # and a repeat that never ended, from May 2030.
            if tomorrow <= month_end:
                await conn.execute(text(
                    "INSERT INTO show_calendar (kind, title, show_id, start_date, end_date, days,"
                    " start_at, end_at, power, note, created_at, updated_at) VALUES"
                    " ('show', 'Party', 1, :d, :d, '[0,1,2,3,4,5,6]', '20:00', '23:00', 1, '',"
                    " :now, :now)"), {"d": tomorrow.isoformat(), "now": now})
            await conn.execute(text(
                "INSERT INTO show_calendar (kind, title, show_id, start_date, end_date, days,"
                " start_at, end_at, power, note, created_at, updated_at) VALUES"
                " ('show', 'Fridays', 1, '2030-05-03', NULL, '[4]', '19:00', '22:00', 1, '',"
                " :now, :now)"), {"now": now})
        await asyncio.to_thread(command.upgrade, config, "head")
        async with engine.connect() as conn:
            plan = (await conn.execute(text(
                "SELECT enabled, last_start_key FROM show_plan"))).one()
            rows = (await conn.execute(text(
                "SELECT id, title, start_date, end_date, start_at, end_at, note"
                " FROM show_calendar ORDER BY id"))).all()
    finally:
        await engine.dispose()

    assert not plan.enabled
    moved = [r for r in rows if r.note == "Moved from the weekly show time"]
    expected = [today + timedelta(days=n) for n in range((month_end - today).days + 1)]
    expected = [d for d in expected if d != tomorrow]
    assert [r.start_date for r in moved] == [d.isoformat() for d in expected]
    assert all(r.start_date == r.end_date and (r.start_at, r.end_at) == ("18:45", "23:00")
               for r in moved)
    # Tonight's show, started under the weekly time, still counts as started.
    assert plan.last_start_key == f"{today.isoformat()}:entry{moved[0].id}"
    fridays = next(r for r in rows if r.title == "Fridays")
    assert fridays.end_date == "2030-05-31"
    assert date.fromisoformat(fridays.start_date) == date(2030, 5, 3)
