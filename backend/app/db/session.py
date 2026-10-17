"""Async SQLAlchemy engine and session factory."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.db.models import Base

log = logging.getLogger(__name__)


def _engine_kwargs() -> dict:
    if settings.is_sqlite:
        # SQLite needs the file's directory to exist, and a shared pool so the
        # background services and the request handlers see the same data.
        path = settings.database_url.split("///", 1)[-1]
        if path and path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        if ":memory:" in settings.database_url:
            return {"connect_args": {"check_same_thread": False},
                    "poolclass": StaticPool}
        return {"connect_args": {"check_same_thread": False}}
    return {"pool_size": 10, "max_overflow": 20, "pool_pre_ping": True,
            "pool_recycle": 1800}


engine = create_async_engine(settings.database_url, echo=False, future=True,
                             **_engine_kwargs())

SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency."""
    async with SessionLocal() as session:
        yield session


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    """Transactional scope for background services.

    Background work must not share a request's session; each unit of work
    gets its own, and a failure rolls back without poisoning the next poll.
    """
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def create_all() -> None:
    """Create tables directly.

    Used for development and tests. Production uses Alembic migrations —
    see backend/alembic/.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    if settings.is_sqlite:
        # WAL keeps the monitor's writes from blocking API reads.
        async with engine.begin() as conn:
            from sqlalchemy import text
            await conn.execute(text("PRAGMA journal_mode=WAL"))
