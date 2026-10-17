"""FastAPI application entry point.

Owns the lifespan: it starts the device manager, the monitoring tiers, the
alerting service, the automation scheduler and the optional MQTT publisher,
and shuts them all down cleanly so no projector is left mid-command.
"""

from __future__ import annotations

import logging
import secrets
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select

from app.api.routes import (
    auth,
    automation,
    enclosure,
    groups,
    integration,
    monitoring,
    projectors,
    system,
    ws,
)
from app.config import settings
from app.core.security import hash_password
from app.db.models import Role, User
from app.db.session import create_all, session_scope
from app.services.alerts import alerting
from app.services.automation import engine as automation_engine
from app.services.device_manager import manager
from app.services.integration import mqtt_publisher
from app.services.monitor import load_projectors, monitor

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("app")


async def bootstrap_admin() -> None:
    """Create the first administrator if no users exist.

    When BOOTSTRAP_ADMIN_PASSWORD is unset a random one is generated and
    logged once. It is never written to the database in plaintext and never
    shown again — the operator is told to change it immediately.
    """
    async with session_scope() as session:
        count = (await session.execute(select(func.count()).select_from(User))).scalar_one()
        if count:
            return
        password = settings.bootstrap_admin_password or secrets.token_urlsafe(16)
        session.add(User(
            username=settings.bootstrap_admin_username,
            password_hash=hash_password(password),
            role=Role.ADMIN.value,
        ))
        generated = settings.bootstrap_admin_password is None
    banner = "=" * 72
    log.warning(
        "\n%s\nCreated the initial administrator account.\n"
        "  username: %s\n  password: %s\n%s\n%s",
        banner, settings.bootstrap_admin_username, password,
        "This password was generated randomly and is shown only once. "
        "Sign in and change it now." if generated
        else "Set from BOOTSTRAP_ADMIN_PASSWORD. Change it after first sign-in.",
        banner,
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    log.info("starting %s (%s)", settings.app_name, settings.environment)
    await create_all()
    await bootstrap_admin()
    await load_projectors()
    await monitor.start()
    await alerting.start()
    await automation_engine.start()
    await mqtt_publisher.start()
    log.info("startup complete")
    try:
        yield
    finally:
        log.info("shutting down")
        # Order matters: stop producing work, then stop the device workers,
        # so nothing is enqueued against a projector we are disconnecting.
        await automation_engine.stop()
        await monitor.stop()
        await alerting.stop()
        await mqtt_publisher.stop()
        await manager.shutdown()
        log.info("shutdown complete")


app = FastAPI(
    title="Projector Control",
    description=(
        "Self-hosted multi-projector management for Panasonic PT-DZ13K and "
        "PJLink-compatible projectors."
    ),
    version="0.6.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Never leak a stack trace to a browser on the show network."""
    log.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Check the server logs for details."},
    )


for router in (
    system.router, auth.router, projectors.router, groups.router,
    monitoring.router, automation.router, enclosure.router, integration.router,
    ws.router,
):
    app.include_router(router, prefix="/api")


@app.get("/", include_in_schema=False)
async def root() -> dict:
    return {
        "name": settings.app_name,
        "docs": "/api/docs",
        "health": "/api/health",
    }
