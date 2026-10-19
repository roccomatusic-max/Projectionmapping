"""Run Projector Control as a desktop application.

Same server, same UI, no Docker and no PostgreSQL: the database is a SQLite
file in the user's application-data folder, the secret key is generated once
and kept beside it, and the default browser opens on the dashboard.

    python -m app.desktop            # from a checkout
    ProjectorControl.exe             # from a PyInstaller build

On a Mac, opening ``Projector Control.app`` instead installs it as a service
that starts at boot and restarts itself (see app/macservice.py); the service
then runs this same program with ``--serve``. The Windows server build does
the same with a Windows service (``--install``, app/winservice.py).

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

from app.paths import FIRST_RUN_PASSWORD

APP_FOLDER = "ProjectorControl"
DEFAULT_PORT = 8765


def data_dir() -> Path:
    """Per-user, per-platform application data folder."""
    override = os.environ.get("PROJECTOR_CONTROL_DATA")
    if override:
        return Path(override).expanduser()
    if sys.platform == "win32" and getattr(sys, "frozen", False):
        # The Windows server build: shared with the service, which runs
        # before anyone signs in (app/winservice.py).
        base = Path(os.environ.get("PROGRAMDATA") or r"C:\ProgramData")
    elif sys.platform == "win32":
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


def probe_socket() -> socket.socket:
    """A socket that binds wherever uvicorn's listening socket would.

    Like uvicorn, set SO_REUSEADDR off Windows, so connections from the last
    run still in TIME_WAIT do not count as the port being in use. (On Windows
    it would let the bind succeed over another program's live listener.)
    """
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    if sys.platform != "win32":
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    return probe


def port_free(host: str, port: int) -> bool:
    # With SO_REUSEADDR, macOS lets a bind to one address share the port
    # with a listener on another (0.0.0.0 beside 127.0.0.1), so also ask
    # whether anything already answers there.
    with contextlib.suppress(OSError), socket.create_connection(("127.0.0.1", port), timeout=0.5):
        return False
    with probe_socket() as probe:
        try:
            probe.bind((host, port))
        except OSError:
            return False
        return True


def pick_port(host: str, preferred: int) -> int:
    """Use the preferred port if free, otherwise let the OS choose one."""
    if port_free(host, preferred):
        return preferred
    with probe_socket() as probe:
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


#: The running server, so the Windows service can stop it from another thread.
_server = None
_stop = threading.Event()


def request_stop() -> None:
    """Ask the server to shut down gracefully (Windows service stop)."""
    _stop.set()
    if _server is not None:
        _server.should_exit = True


def stop_requested() -> bool:
    return _stop.is_set()


def first_run_password(folder: Path, database: Path) -> str | None:
    """On the very first start, choose the administrator password.

    It is written to a file in the data folder because a windowed desktop
    app has no console for the operator to read it from. The sign-in screen
    tells them where it is; change it, then delete the file.
    """
    marker = folder / FIRST_RUN_PASSWORD
    if database.exists():
        if marker.exists():
            logging.getLogger("desktop").warning(
                "%s still exists. Change the admin password in Settings and delete it.", marker
            )
        return None
    password = secrets.token_urlsafe(12)
    write_password_note(marker, password)
    return password


def write_password_note(marker: Path, password: str) -> None:
    marker.write_text(
        "Projector Control — first-run administrator account\n\n"
        f"  username: admin\n  password: {password}\n\n"
        "Sign in, change this password under Settings, then delete this file.\n",
        encoding="utf-8",
    )
    with contextlib.suppress(OSError):
        marker.chmod(0o600)


def reset_admin_password(folder: Path) -> int:
    """Recover from a forgotten password: new random password for ``admin``.

    Works while the server is running; it shares the database file.
    """
    import asyncio

    database = folder / "projector-control.db"
    try:
        found = database.exists()
        if found:
            database.open("rb").close()
    except PermissionError:
        print(f"This account may not read {folder}. Open PowerShell as administrator "
              "(right-click Start, then Terminal (Admin)) and run this again.")
        return 1
    if not found:
        print(f"No Projector Control database in {folder}.")
        return 1
    os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{database.as_posix()}")
    os.environ.setdefault("SECRET_KEY", ensure_secret_key(folder))

    from sqlalchemy import select

    from app.core.security import hash_password
    from app.db.models import User
    from app.db.session import session_scope

    password = secrets.token_urlsafe(12)

    async def apply() -> bool:
        async with session_scope() as session:
            user = (await session.execute(
                select(User).where(User.username == "admin")
            )).scalars().first()
            if user is None:
                return False
            user.password_hash = hash_password(password)
            user.is_active = True
            return True

    if not asyncio.run(apply()):
        print("There is no account called admin.")
        return 1
    # Opening the app shows the password in this note; keep it truthful.
    marker = folder / FIRST_RUN_PASSWORD
    if marker.exists():
        with contextlib.suppress(OSError):
            write_password_note(marker, password)
    print(f"Sign in with username: admin   password: {password}")
    print("Change it under Settings after you sign in.")
    return 0


def self_check(app, host: str, port: int, log: logging.Logger) -> int:
    """Start the server, wait for a healthy answer, stop. Exit code says which."""
    import uvicorn

    server = uvicorn.Server(uvicorn.Config(app, host=host, port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{port}/api/health"
    healthy = False
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline and thread.is_alive() and not healthy:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:  # noqa: S310
                healthy = response.status == 200
        except Exception:  # noqa: BLE001 - not up yet
            time.sleep(0.5)
    server.should_exit = True
    thread.join(timeout=30)
    log.info("self-check: %s", "healthy" if healthy else "FAILED")
    return 0 if healthy else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="projector-control",
        description="Projector Control — desktop mode (SQLite, no Docker).",
    )
    parser.add_argument("--port", type=int, default=DEFAULT_PORT,
                        help=f"port to serve on (default {DEFAULT_PORT}; falls back to a free one)")
    parser.add_argument("--lan", action="store_true",
                        help="also accept connections from other devices on your network "
                             "(mini PCs, tablet, phone). Default is this computer only.")
    parser.add_argument("--host", default=None,
                        help="explicit interface to bind (overrides --lan)")
    parser.add_argument("--no-browser", action="store_true", help="do not open the browser")
    parser.add_argument("--data-dir", default=None,
                        help="where to keep the database, key and logs")
    parser.add_argument("--timezone", default=None,
                        help="IANA zone for schedules, e.g. Europe/London (default: this computer's)")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--serve", action="store_true",
                        help="Mac app: run the server here instead of installing the service")
    parser.add_argument("--install", action="store_true",
                        help="Windows server: install or update the Windows service from this copy")
    parser.add_argument("--windows-service", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--check", action="store_true",
                        help="start, confirm the server answers, then exit (for build checks)")
    parser.add_argument("--uninstall", action="store_true",
                        help="Mac app and Windows server: stop starting automatically "
                             "(keeps the app and data)")
    parser.add_argument("--version", action="store_true", help="print the version and exit")
    parser.add_argument("--reset-admin-password", action="store_true",
                        help="give the admin account a new password, print it and exit")
    # Finder may add arguments of its own when it opens an app; ignore them.
    raw = sys.argv[1:] if argv is None else argv
    args, _unknown = parser.parse_known_args(raw)

    from app import macservice, winservice
    from app.paths import app_version

    if args.version:
        print(app_version())
        return 0
    windows_build = sys.platform == "win32" and winservice.running_folder() is not None
    if args.windows_service:
        return winservice.run_service()
    if args.uninstall:
        if sys.platform == "win32":
            code = winservice.uninstall()
            winservice.pause_if_window_closes()
            return code
        return macservice.uninstall()
    if args.install and windows_build:
        return winservice.install(open_browser=not args.no_browser)
    if windows_build and not raw:
        # Double-clicked: set up the service, or open the dashboard.
        return winservice.launch()

    folder = Path(args.data_dir).expanduser() if args.data_dir else data_dir()
    if args.reset_admin_password:
        return reset_admin_password(folder)
    folder.mkdir(parents=True, exist_ok=True)
    if sys.platform == "darwin" and macservice.running_bundle() and not (args.serve or args.check):
        return macservice.launch(folder)
    configure_logging(folder, args.verbose)
    log = logging.getLogger("desktop")

    database = folder / "projector-control.db"
    host = args.host or ("0.0.0.0" if args.lan else "127.0.0.1")
    managed = os.environ.get(macservice.SERVICE_ENV) == "1"
    # The service keeps its port: the phone remote's link and QR code point at it.
    # If something else holds it, exit and let launchd try again shortly.
    port = args.port if managed else pick_port(host, args.port)
    if managed and not port_free(host, port):
        # Exit before start-up: no migrations on a database another copy may
        # be using, and no polling of its projectors, every ten seconds.
        log.error("port %d is in use, most often by a copy started from Terminal; "
                  "trying again shortly", port)
        return 1

    # Environment must be set before app.config is imported anywhere.
    os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{database.as_posix()}")
    os.environ.setdefault("SECRET_KEY", ensure_secret_key(folder))
    os.environ.setdefault("MEDIA_DIR", str(folder / "media"))
    os.environ.setdefault("ENVIRONMENT", "desktop")
    os.environ["DESKTOP_DATA_DIR"] = str(folder)
    os.environ["DESKTOP_PORT"] = str(port)
    if args.timezone:
        os.environ["SCHEDULE_TIMEZONE"] = args.timezone
    if host == "127.0.0.1":
        os.environ.setdefault("LOCAL_ONLY", "true")
    else:
        # Mini PCs beside the projectors find the server by broadcasting.
        os.environ.setdefault("ADVERTISE_PORT", str(port))
    password = first_run_password(folder, database)
    if password:
        os.environ.setdefault("BOOTSTRAP_ADMIN_PASSWORD", password)

    import uvicorn

    from app.main import app

    log.info("Projector Control %s", app_version())
    if managed:
        macservice.pid_file(folder).write_text(str(os.getpid()), encoding="utf-8")
        if sys.platform == "win32":
            winservice.keep_awake()
            log.info("running as the Windows service: starts at boot, restarts if it stops")
        else:
            macservice.keep_awake()
            log.info("running as the Mac service: starts at boot, restarts if it stops")

    reach = "this computer only" if host == "127.0.0.1" else f"every device on the network ({host})"
    log.info("data folder: %s", folder)
    log.info("serving on http://%s:%d — reachable from %s", "127.0.0.1" if host == "0.0.0.0" else host, port, reach)
    if password:
        log.warning("First run: the administrator password is in %s", folder / FIRST_RUN_PASSWORD)
    if host == "0.0.0.0":
        log.warning("--lan exposes the control UI on every interface. Use it on a trusted "
                    "network only; never port-forward it.")
    if not managed:
        log.info("Monitoring, alerts and schedules run only while this window is open.")

    if args.check:
        return self_check(app, host, port, log)

    if not args.no_browser:
        url = f"http://127.0.0.1:{port}/"
        threading.Thread(
            target=open_browser_when_ready, args=(url, f"{url}api/health"), daemon=True
        ).start()

    # Bounded shutdown: a restart to install an update must not wait for a mini
    # PC's long media download; the update watcher allows two minutes in all.
    config = uvicorn.Config(app, host=host, port=port, log_level="info", access_log=False,
                            timeout_graceful_shutdown=10)
    server = uvicorn.Server(config)
    global _server
    _server = server
    if _stop.is_set():  # the Windows service was stopped while starting
        return 0
    with contextlib.suppress(KeyboardInterrupt):
        server.run()
    log.info("stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
