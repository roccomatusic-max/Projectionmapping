"""Command audit logging.

A row is written *before* the command is dispatched and updated with the
outcome. If the process dies mid-command the record that someone asked for it
survives, which is what you want when reconstructing what happened to a
projector during a show.
"""

from __future__ import annotations

import logging
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from app.db.models import CommandLog
from app.db.session import session_scope

log = logging.getLogger(__name__)


async def open_command_log(
    projector_id: int | None, capability: str, params: Mapping[str, Any],
    *, source: str = "api", username: str | None = None, user_id: int | None = None,
) -> int | None:
    try:
        async with session_scope() as session:
            entry = CommandLog(
                projector_id=projector_id, user_id=user_id, username=username,
                source=source, capability=capability, params=dict(params),
                outcome="pending",
            )
            session.add(entry)
            await session.flush()
            return entry.id
    except Exception:  # noqa: BLE001 - a logging failure must not block a command
        log.exception("failed to open command log entry")
        return None


async def close_command_log(entry_id: int | None, result: Mapping[str, Any]) -> None:
    if entry_id is None:
        return
    try:
        async with session_scope() as session:
            entry = await session.get(CommandLog, entry_id)
            if entry is None:
                return
            entry.outcome = str(result.get("outcome", "unknown"))
            entry.raw_request = result.get("raw_request")
            entry.raw_response = result.get("raw_response")
            entry.error = result.get("error")
            entry.latency_ms = result.get("latency_ms")
            entry.attempts = int(result.get("attempts", 1) or 1)
            entry.completed_at = datetime.now(UTC)
    except Exception:  # noqa: BLE001
        log.exception("failed to close command log entry %s", entry_id)


async def log_command_results(
    results: list[Mapping[str, Any]], capability: str, params: Mapping[str, Any],
    *, source: str, username: str | None = None, user_id: int | None = None,
) -> None:
    """Record an already-completed batch (group dispatch, scene, automation)."""
    if not results:
        return
    try:
        now = datetime.now(UTC)
        async with session_scope() as session:
            session.add_all([
                CommandLog(
                    projector_id=result.get("projector_id"), user_id=user_id,
                    username=username, source=source, capability=capability,
                    params=dict(params), outcome=str(result.get("outcome", "unknown")),
                    raw_request=result.get("raw_request"),
                    raw_response=result.get("raw_response"),
                    error=result.get("error"), latency_ms=result.get("latency_ms"),
                    attempts=int(result.get("attempts", 1) or 1),
                    created_at=now, completed_at=now,
                )
                for result in results
            ])
    except Exception:  # noqa: BLE001
        log.exception("failed to record %d command results", len(results))
