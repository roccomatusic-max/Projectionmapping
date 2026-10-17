"""Run Projector Control as a desktop application.

Same server, same UI, no Docker and no PostgreSQL: the database is a SQLite
file in the user's application-data folder, the secret key is generated once
and kept beside it, and the default browser opens on the dashboard.

    python -m app.desktop            # from a checkout
    ProjectorControl.exe             # from a PyInstaller build

What this mode is for: a laptop at the show, a single-projector install, or
evaluating the platform. What it is not: a 24/7 monitor. Alerts, polling
and scheduled automations run only while this program is open and the
computer is awake. For always-on operation run it as a service, or use the
Docker deployment on a machine that stays up. See docs/DESKTOP.md.
"""

from __future__ import annotations

import argparse
import contextlib
import logging
import os
import secrets
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from logging.handlers import RotatingFileHandler
from pathlib import Path

APP_FOLDER = "ProjectorControl"
DEFAULT_PORT = 8765


def data_dir() -> Path:
    """Per-user, per-platform application data folder."""
    override = os.environ.get("PROJECTOR_CONTROL_DATA")
    if override:
        return Path(override).expanduser()
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share")
    return base / APP_FOLDER


def ensure_secret_key(folder: Path) -> str:
    """Create the signing/encryption key once and keep it next to the database.

    It must persist: it is what makes stored projector passwords readable
    after a restart. Owner-only permissions where the OS supports them.
    """
    path = folder / "secret.key"
    if path.exists():
        value = path.read_text(encoding="utf-8").strip()
        if value:
            return value
    value = secrets.token_urlsafe(48)
    path.write_text(value, encoding="utf-8")
    with contextlib.suppress(OSError):  # Windows: the per-user folder is already private
        path.chmod(0o600)
    return value


def pick_port(host: str, preferred: int) -> int:
    """Use the preferred port if free, otherwise let the OS choose one."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind((host, preferred))
            return preferred
        except OSError:
            probe.bind((host, 0))
            return probe.getsockname()[1]


def configure_logging(folder: Path, verbose: bool) -> None:
    """Console plus a rotating file: a windowed .exe has no console to read."""
    logs = folder / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    handlers: list[logging.Handler] = [
        RotatingFileHandler(logs / "projector-control.log", maxBytes=5_000_000,
                            backupCount=5, encoding="utf-8"),
    ]
    if sys.stdout is not None:
        handlers.append(logging.StreamHandler(sys.stdout))
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
        handlers=handlers,
        force=True,
    )


def open_browser_when_ready(url: str, health_url: str, timeout: float = 30.0) -> None:
    """Wait for the API to answer, then open the dashboard. Runs in a thread."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(health_url, timeout=2) as response:  # noqa: S310
                if response.status == 200:
                    break
        except Exception:  # noqa: BLE001 - not up yet
            time.sleep(0.4)
    webbrowser.open(url)


def first_run_password(folder: Path, database: Path) -> str | None:
    """On the very first start, choose the administrator password.

    It is written to a file in the data folder because a windowed desktop
    app has no console for the operator to read it from. The sign-in screen
    tells them where it is; change it, then delete the file.
    """
    marker = folder / "FIRST-RUN-PASSWORD.txt"
    if database.exists():
        if marker.exists():
            logging.getLogger("desktop").warning(
                "%s still exists. Change the admin password in Settings and delete it.", marker
            )
        return None
    password = secrets.token_urlsafe(12)
    marker.write_text(
        "Projector Control — first-run administrator account\n\n"
        f"  username: admin\n  password: {password}\n\n"
        "Sign in, change this password under Settings, then delete this file.\n",
        encoding="utf-8",
    )
    with contextlib.suppress(OSError):
        marker.chmod(0o600)
    return password


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="projector-control",
        description="Projector Control — desktop mode (SQLite, no Docker).",
    )
    parser.add_argument("--port", type=int, default=DEFAULT_PORT,
                        help=f"port to serve on (default {DEFAULT_PORT}; falls back to a free one)")
    parser.add_argument("--lan", action="store_true",
                        help="also accept connections from other devices on your network "
                             "(tablet, phone). Default is this computer only.")
    parser.add_argument("--host", default=None,
                        help="explicit interface to bind (overrides --lan)")
    parser.add_argument("--no-browser", action="store_true", help="do not open the browser")
    parser.add_argument("--data-dir", default=None,
                        help="where to keep the database, key and logs")
    parser.add_argument("--timezone", default=None,
                        help="IANA zone for schedules, e.g. Europe/London (default: this computer's)")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)

    folder = Path(args.data_dir).expanduser() if args.data_dir else data_dir()
    folder.mkdir(parents=True, exist_ok=True)
    configure_logging(folder, args.verbose)
    log = logging.getLogger("desktop")

    database = folder / "projector-control.db"
    host = args.host or ("0.0.0.0" if args.lan else "127.0.0.1")
    port = pick_port(host, args.port)

    # Environment must be set before app.config is imported anywhere.
    os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{database.as_posix()}")
    os.environ.setdefault("SECRET_KEY", ensure_secret_key(folder))
    os.environ.setdefault("MEDIA_DIR", str(folder / "media"))
    os.environ.setdefault("ENVIRONMENT", "desktop")
    if args.timezone:
        os.environ["SCHEDULE_TIMEZONE"] = args.timezone
    password = first_run_password(folder, database)
    if password:
        os.environ.setdefault("BOOTSTRAP_ADMIN_PASSWORD", password)

    import uvicorn

    from app.main import app

    reach = "this computer only" if host == "127.0.0.1" else f"every device on the network ({host})"
    log.info("data folder: %s", folder)
    log.info("serving on http://%s:%d — reachable from %s", "127.0.0.1" if host == "0.0.0.0" else host, port, reach)
    if password:
        log.warning("First run: the administrator password is in %s", folder / "FIRST-RUN-PASSWORD.txt")
    if host == "0.0.0.0":
        log.warning("--lan exposes the control UI on every interface. Use it on a trusted "
                    "network only; never port-forward it.")
    log.info("Monitoring, alerts and schedules run only while this window is open.")

    if not args.no_browser:
        url = f"http://127.0.0.1:{port}/"
        threading.Thread(
            target=open_browser_when_ready, args=(url, f"{url}api/health"), daemon=True
        ).start()

    config = uvicorn.Config(app, host=host, port=port, log_level="info", access_log=False)
    server = uvicorn.Server(config)
    with contextlib.suppress(KeyboardInterrupt):
        server.run()
    log.info("stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
