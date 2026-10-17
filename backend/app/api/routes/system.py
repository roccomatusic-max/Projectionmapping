"""Health checks and system information."""

from __future__ import annotations

import platform
from datetime import UTC, datetime

from fastapi import APIRouter
from sqlalchemy import text

from app.api.deps import RequireViewer, SessionDep
from app.config import settings
from app.core.events import bus
from app.db.session import engine
from app.paths import app_version
from app.services.device_manager import manager

router = APIRouter(tags=["system"])

STARTED_AT = datetime.now(UTC)


@router.get("/health")
async def health() -> dict:
    """Container health check. Unauthenticated by design.

    Reports database reachability but stays 200 while the database is down:
    a database outage must not cause an orchestrator to restart the process
    and disturb projectors mid-show. The payload says what is degraded.
    """
    database_ok = True
    database_error: str | None = None
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001
        database_ok = False
        database_error = str(exc)[:200]

    return {
        "status": "ok" if database_ok else "degraded",
        "version": app_version(),
        "database": {"ok": database_ok, "error": database_error},
        "devices_registered": len(manager.workers),
        "ws_subscribers": bus.subscriber_count,
        "uptime_seconds": round(
            (datetime.now(UTC) - STARTED_AT).total_seconds()
        ),
        "time": datetime.now(UTC),
    }


@router.get("/system/info")
async def system_info(session: SessionDep, _: RequireViewer) -> dict:
    workers = manager.workers
    return {
        "app": settings.app_name,
        "environment": settings.environment,
        "python": platform.python_version(),
        "platform": platform.platform(),
        "database": "postgresql" if not settings.is_sqlite else "sqlite",
        "started_at": STARTED_AT,
        "polling": {
            "connectivity": settings.poll_connectivity,
            "operational": settings.poll_operational,
            "diagnostics": settings.poll_diagnostics,
            "maintenance": settings.poll_maintenance,
        },
        "integrations": {
            "mqtt": settings.mqtt_enabled,
            "email_alerts": bool(settings.smtp_host and settings.alert_email_to),
        },
        "devices": [
            {
                "projector_id": w.projector_id, "name": w.name,
                "driver": w.driver_id, "connected": w.driver.connected,
                "queue_depth": w.queue_depth,
                "consecutive_failures": w.consecutive_failures,
                "last_error": w.last_error,
            }
            for w in workers
        ],
    }
