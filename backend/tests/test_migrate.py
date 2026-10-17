"""Start-up migration behaviour, including adopting an unstamped database."""

from __future__ import annotations

import contextlib
import os
import tempfile

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine

from app.db.migrate import INITIAL_REVISION, classify, upgrade_to_head
from app.db.models import Base


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
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        assert "alembic_version" not in await _tables(engine)

        assert await upgrade_to_head(engine, url) == "unmanaged"
        assert await _version(engine) is not None
        # Stamped at the revision the create_all schema matches, then upgraded
        # from there; with one migration that is head.
        assert await _version(engine) == INITIAL_REVISION
    finally:
        await engine.dispose()
