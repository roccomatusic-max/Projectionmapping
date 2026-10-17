"""Bring the database schema to the latest Alembic revision.

Handles the one awkward case explicitly: a database created by an earlier
build that used ``create_all()`` and never wrote an ``alembic_version``
table. Running ``upgrade head`` against it would try to create tables that
already exist and crash the service. Such a database is stamped with the
revision whose schema it matches, then upgraded like any other.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncEngine

from app.paths import alembic_dir

log = logging.getLogger(__name__)

#: The revision that matches what create_all() produced before migrations
#: were introduced. Must never change: it describes databases that already
#: exist in the field.
INITIAL_REVISION = "919da291a384"


def classify(table_names: set[str]) -> str:
    """Decide how to treat the schema found in the database.

    ``fresh``     – no tables: migrate from nothing.
    ``managed``   – alembic_version present: ordinary upgrade.
    ``unmanaged`` – application tables but no version table: stamp first.
    """
    if "alembic_version" in table_names:
        return "managed"
    if "projectors" in table_names or "users" in table_names:
        return "unmanaged"
    return "fresh"


def _run_alembic(database_url: str, stamp_first: bool) -> None:
    from alembic import command
    from alembic.config import Config

    config = Config()
    config.set_main_option("script_location", str(alembic_dir()))
    # ConfigParser interpolation: a literal '%' (as in an escaped password)
    # must be doubled or Alembic raises on read.
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    if stamp_first:
        command.stamp(config, INITIAL_REVISION)
    command.upgrade(config, "head")


async def upgrade_to_head(engine: AsyncEngine, database_url: str) -> str:
    """Migrate; returns the classification that was handled."""
    async with engine.connect() as conn:
        names = set(await conn.run_sync(lambda c: inspect(c).get_table_names()))
    state = classify(names)
    if state == "unmanaged":
        log.warning(
            "database has application tables but no alembic_version table; "
            "stamping it as revision %s before upgrading", INITIAL_REVISION,
        )
    # Alembic's env.py runs its own event loop; give it a thread of its own.
    await asyncio.to_thread(_run_alembic, database_url, state == "unmanaged")
    return state
