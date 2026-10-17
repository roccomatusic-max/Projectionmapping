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

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select

from app.api.routes import (
    auth,
    automation,
    enclosure,
    groups,
    integration,
    mapping,
    mapping_camera,
    mapping_players,
    monitoring,
    projectors,
    system,
    updates,
    ws,
)
from app.config import settings
from app.core.security import hash_password
from app.db.migrate import upgrade_to_head
from app.db.models import Role, User
from app.db.session import create_all, engine, session_scope
from app.paths import static_dir
from app.services.alerts import alerting
from app.services.automation import engine as automation_engine
from app.services.device_manager import manager
from app.services.discovery import discovery
from app.services.integration import mqtt_publisher
from app.services.mapping import transport as mapping_transport
from app.services.monitor import load_projectors, monitor

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("app")


async def prepare_database() -> None:
    """Bring the schema up to date.

    Real databases go through Alembic so the version table is stamped and
    later upgrades apply cleanly; ``create_all`` on a fresh database would
    leave Alembic believing nothing exists and fail on the next upgrade.
    The in-memory SQLite used by tests has no life beyond this process, so
    it is created directly.
    """
    if settings.is_memory_sqlite or not settings.auto_migrate:
        await create_all()
        return
    state = await upgrade_to_head(engine, settings.database_url)
    log.info("database schema is at the latest migration (%s database)", state)


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
    if settings.secret_key_generated:
        log.warning(
            "\n%s\nSECRET_KEY is not set. A temporary key was generated for this run.\n"
            "Every sign-in will be invalidated and every stored projector password\n"
            "will become unreadable the next time the server restarts.\n"
            "Set SECRET_KEY in .env before registering projectors.\n%s",
            "=" * 72, "=" * 72,
        )
    await prepare_database()
    await bootstrap_admin()
    await load_projectors()
    await monitor.start()
    await alerting.start()
    await automation_engine.start()
    await mqtt_publisher.start()
    if settings.advertise_port:
        await discovery.start(port=settings.discovery_port, http_port=settings.advertise_port)
    log.info("startup complete")
    try:
        yield
    finally:
        log.info("shutting down")
        # Order matters: stop producing work, then stop the device workers,
        # so nothing is enqueued against a projector we are disconnecting.
        await discovery.stop()
        await automation_engine.stop()
        await mapping_transport.stop_service()
        await monitor.stop()
        await alerting.stop()
        await mqtt_publisher.stop()
        await manager.shutdown()
        await engine.dispose()
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
    mapping.router, mapping_players.router, mapping_camera.router, updates.router,
    ws.router,
):
    app.include_router(router, prefix="/api")


# -- single-page app ------------------------------------------------------
#
# The built frontend is served from the same origin as the API, so there is
# no CORS in production and no second web server to configure. In
# development the Vite dev server proxies /api instead and this block is a
# no-op because ./static does not exist.

STATIC_DIR = static_dir()

if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/", include_in_schema=False)
    async def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa_fallback(path: str) -> FileResponse:
        """Serve the SPA for client-side routes.

        An unknown /api/* path must still 404 as JSON rather than being
        handed the HTML shell, or API clients get a 200 with a web page
        when they typo an endpoint.
        """
        if path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = (STATIC_DIR / path).resolve()
        # Only serve files inside the static root.
        if candidate.is_file() and candidate.is_relative_to(STATIC_DIR):
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")

else:

    @app.get("/", include_in_schema=False)
    async def root() -> dict:
        return {
            "name": settings.app_name,
            "docs": "/api/docs",
            "health": "/api/health",
            "note": "No built frontend found. Run the Vite dev server, or build "
                    "the image with deploy/Dockerfile which bundles the UI.",
        }
