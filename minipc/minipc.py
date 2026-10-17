"""Mini PC: everything a computer beside a projector runs, in one program.

Install it once (MiniPC-Setup.exe on Windows). Every time the computer
signs in after that, it:

- finds the main server on the network by itself,
- shows the output full screen on the projector in a kiosk browser window
  (no tabs, no address bar, no frame), reopened if it ever closes,
- runs the camera when one is plugged in, for calibration and people: a
  depth camera (Intel RealSense, Orbbec, Luxonis OAK) or any webcam, found
  by itself,
- keeps the screen and the computer awake.

The first time, the projector shows a pairing code. Approving it on the
Mapping page, Players tab, pairs this computer and its camera together.

    MiniPC.exe                              # normal start
    MiniPC.exe --server http://10.0.0.5:8765   # skip looking for the server
    MiniPC.exe --camera off                 # never use a camera
"""

from __future__ import annotations

import argparse
import contextlib
import json
import logging
import os
import secrets
import signal
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from logging.handlers import RotatingFileHandler
from pathlib import Path
from urllib.parse import urlencode

# The camera half is the camera agent, shipped beside this program.
HERE = Path(__file__).resolve().parent
sys.path.insert(1, str(HERE.parent / "camera-agent"))

import discovery  # noqa: E402
from kiosk import Kiosk, find_browser  # noqa: E402

log = logging.getLogger("minipc")

APP_FOLDER = "ProjectionMapping MiniPC"
#: The local page the window opens on. Fixed, so a second copy of the
#: program finds it taken and leaves the first one running.
STATUS_PORT = 47865
TICK_SECONDS = 3.0
#: The server unreachable this long: look for it again, and reopen the
#: window once it is back (the page may be showing a browser error).
LOST_SECONDS = 15.0
#: How often to look for a camera when none is plugged in.
CAMERA_RETRY_SECONDS = 30.0


# -- settings -----------------------------------------------------------------------


def data_dir() -> Path:
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share")
    return base / APP_FOLDER


class Config:
    """``config.json`` in the data folder: this computer's identity and choices.

    ``secret`` is what the server knows this computer by; the player and the
    camera both present it, so they pair as one machine. ``server`` pins
    the server's address; empty means find it on the network, starting
    with ``last_server``.
    """

    def __init__(self, path: Path) -> None:
        self.path = path
        try:
            self.data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self.data = {}
        if not (self.data.get("device_id") and self.data.get("secret")):
            self.data.update(device_id=f"mpc-{secrets.token_hex(12)}", secret=secrets.token_hex(32))
        self.data.setdefault("name", socket.gethostname() or "Mini PC")
        self.data.setdefault("server", "")
        self.data.setdefault("last_server", "")
        self.data.setdefault("camera", "auto")
        self.save()

    def __getitem__(self, key: str):
        return self.data[key]

    def __setitem__(self, key: str, value) -> None:
        if self.data.get(key) != value:
            self.data[key] = value
            self.save()

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.data, indent=2), encoding="utf-8")
        with contextlib.suppress(OSError):  # Windows: the per-user folder is already private
            self.path.chmod(0o600)

    def identity(self, kind: str = "player") -> dict:
        if kind == "camera":
            return {"device_id": f"{self['device_id']}-camera", "secret": self["secret"],
                    "name": f"{self['name']} camera"}
        return {"device_id": self["device_id"], "secret": self["secret"], "name": self["name"]}


# -- the local page -------------------------------------------------------------------

WAITING_PAGE = """<!doctype html>
<html><head><meta charset="utf-8"><title>Mini PC</title>
<style>
  html, body { margin: 0; height: 100%; background: #000; color: #94a3b8; cursor: none;
               font: 2.4vh system-ui, sans-serif; }
  main { height: 100%; display: flex; flex-direction: column; align-items: center;
         justify-content: center; gap: 2vh; text-align: center; }
  h1 { margin: 0; color: #f8fafc; font-size: 6vh; font-weight: 600; }
  p { margin: 0; max-width: 60vw; }
  .hint { color: #475569; font-size: 1.8vh; }
</style></head>
<body><main>
  <h1 id="name"></h1>
  <p id="message">Starting</p>
  <p class="hint">The main computer runs Projector Control with <b>--lan</b>, on the same network as this one.</p>
</main>
<script>
  async function poll() {
    try {
      const status = await (await fetch('/status', { cache: 'no-store' })).json()
      document.getElementById('name').textContent = status.name
      document.getElementById('message').textContent = status.message
      if (status.player) { location.replace(status.player); return }
    } catch (e) { /* the program is restarting */ }
    setTimeout(poll, 1000)
  }
  poll()
</script>
</body></html>
"""


class StatusPage:
    """What the window shows until the server is found, then where it goes."""

    def __init__(self, app: MiniPC, port: int = STATUS_PORT) -> None:
        self.app = app
        page = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802 - http.server's naming
                # Only this computer's own window, by its own address: a page
                # elsewhere cannot read the status through a renamed host.
                if self.headers.get("Host") not in page.hosts:
                    self.send_error(403)
                    return
                if self.path == "/":
                    self._send(WAITING_PAGE.encode(), "text/html; charset=utf-8")
                elif self.path == "/status":
                    self._send(json.dumps(page.app.status()).encode(), "application/json")
                else:
                    self.send_error(404)

            def _send(self, body: bytes, kind: str) -> None:
                self.send_response(200)
                self.send_header("Content-Type", kind)
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *_args) -> None:
                pass

        # Raises OSError when another copy already holds the port.
        self.server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        self.port = self.server.server_address[1]
        self.hosts = {f"127.0.0.1:{self.port}", f"localhost:{self.port}"}
        self.url = f"http://127.0.0.1:{self.port}/"

    def start(self) -> None:
        threading.Thread(target=self.server.serve_forever, name="status-page", daemon=True).start()

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


# -- the camera -------------------------------------------------------------------------


class CameraRunner(threading.Thread):
    """Runs the camera agent whenever a camera is plugged in."""

    def __init__(self, app: MiniPC) -> None:
        super().__init__(name="camera", daemon=True)
        self.app = app
        self.server = None

    def retarget(self, base: str) -> None:
        if self.server is not None:
            self.server.base = base

    def run(self) -> None:
        import agent
        from sources import open_source

        spec = self.app.config["camera"]
        while not self.app.stopping.is_set():
            base = self.app.server
            if base is None:
                self.app.stopping.wait(TICK_SECONDS)
                continue
            try:
                source = open_source(spec)
            except Exception as exc:  # noqa: BLE001 - no camera plugged in, or it is busy
                log.debug("no camera: %s", exc)
                self.app.stopping.wait(CAMERA_RETRY_SECONDS)
                continue
            log.info("camera: %s%s", source.name, " with depth" if source.has_depth else "")
            self.app.camera_name = source.name
            args = agent.build_parser().parse_args(["--server", base, "--camera", spec])
            self.server = agent.Server(base)
            try:
                while not self.app.stopping.is_set():
                    camera_id = agent.pair(self.server, self.app.config.identity("camera"))
                    try:
                        agent.Agent(self.server, source, camera_id, args).run()
                    except agent.Revoked:
                        log.warning("the camera was removed on the server; pairing again")
            except Exception:  # noqa: BLE001 - unplugged, or the driver gave up
                log.exception("the camera stopped")
            finally:
                self.server = None
                self.app.camera_name = None
                with contextlib.suppress(Exception):
                    source.close()
            self.app.stopping.wait(TICK_SECONDS)


# -- the program --------------------------------------------------------------------------


def keep_awake() -> None:
    """No sleep, no screen blanking, while this thread lives (Windows)."""
    if sys.platform == "win32":
        import ctypes

        es_continuous, es_system, es_display = 0x80000000, 0x00000001, 0x00000002
        ctypes.windll.kernel32.SetThreadExecutionState(es_continuous | es_system | es_display)


class MiniPC:
    def __init__(self, config: Config, folder: Path, *, discovery_port: int = discovery.DEFAULT_PORT,
                 browser: str | None = None, browser_args: list[str] | None = None,
                 camera: bool = True) -> None:
        self.config = config
        self.folder = folder
        self.discovery_port = discovery_port
        self.browser = browser
        self.browser_args = browser_args or []
        self.use_camera = camera and config["camera"] != "off"
        self.server: str | None = None
        self.message = "Looking for the main server"
        self.camera_name: str | None = None
        self.camera: CameraRunner | None = None
        self._lost_since: float | None = None
        self.stopping = threading.Event()
        self.restart_requested = threading.Event()
        self.on_change = lambda: None

    # -- what the window and the tray show ----------------------------------

    def player_url(self) -> str | None:
        if self.server is None:
            return None
        # The identity rides in the fragment, which the browser never sends
        # to the server; the player page keeps it, so the projector and the
        # camera on this computer pair as one.
        return f"{self.server}/player#{urlencode(self.config.identity())}"

    def status(self) -> dict:
        return {"name": self.config["name"], "message": self.message, "player": self.player_url()}

    def summary(self) -> str:
        where = f"connected to {self.server}" if self.server else self.message.lower()
        return f"{self.config['name']}: {where}" + (f", camera {self.camera_name}" if self.camera_name else "")

    def _say(self, message: str) -> None:
        if message != self.message:
            log.info("%s", message)
            self.message = message
            self.on_change()

    # -- finding the server -----------------------------------------------------

    def locate(self) -> str | None:
        pinned = self.config["server"].rstrip("/")
        if pinned:
            if discovery.answers(pinned):
                return pinned
            self._say(f"Cannot reach the main server at {pinned}")
            return None
        last = self.config["last_server"]
        if last and discovery.answers(last):
            return last
        found = discovery.find_server(self.discovery_port)
        if found and discovery.answers(found):
            return found
        self._say("Looking for the main server")
        return None

    def _connected(self, base: str) -> None:
        self.server = base
        self.config["last_server"] = base
        self._say(f"Connected to {base}")

    def follow_server(self) -> bool:
        """Find the server, or notice it has gone or moved. True when the
        window should be reopened."""
        if self.server is None:
            found = self.locate()
            if found:
                self._connected(found)
            return False
        now = time.monotonic()
        if discovery.answers(self.server):
            # Back after a while: the window may be showing a browser error.
            back = self._lost_since is not None and now - self._lost_since > LOST_SECONDS
            self._lost_since = None
            return back
        self._lost_since = self._lost_since or now
        if now - self._lost_since <= LOST_SECONDS or self.config["server"]:
            return False
        found = discovery.find_server(self.discovery_port)
        if not found or found == self.server or not discovery.answers(found):
            return False
        log.info("the main server moved to %s", found)
        self._connected(found)
        if self.camera:
            self.camera.retarget(found)
        self._lost_since = None
        return True

    # -- main loop ----------------------------------------------------------------------

    def run(self, page: StatusPage) -> None:
        keep_awake()
        browser = self.browser or find_browser()
        kiosk = None
        if browser:
            kiosk = Kiosk(browser, page.url, self.folder / "browser", self.browser_args)
        else:
            log.error("no Chrome or Edge on this computer: install Google Chrome")
            self._say("No Chrome or Edge found on this computer")
        if self.use_camera:
            self.camera = CameraRunner(self)
            self.camera.start()
        try:
            while not self.stopping.is_set():
                reopen = self.follow_server()
                if kiosk:
                    if self.server and kiosk.secure_origin != self.server:
                        # Opened before the server was known: reopen it so the
                        # player can keep the show's media on this computer.
                        kiosk.secure_origin = self.server
                        reopen = reopen or kiosk.process is not None
                    if reopen or self.restart_requested.is_set():
                        self.restart_requested.clear()
                        kiosk.restart()
                    kiosk.ensure()
                self.stopping.wait(TICK_SECONDS)
        finally:
            if kiosk:
                kiosk.stop()


# -- start-up -------------------------------------------------------------------------------


def icon_image(size: int = 64):
    """The tray and program icon: a beam of light onto a screen."""
    from PIL import Image, ImageDraw

    s = size / 64
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle([2 * s, 2 * s, 62 * s, 62 * s], radius=14 * s, fill=(15, 23, 42, 255))
    draw.polygon([(17 * s, 32 * s), (49 * s, 15 * s), (49 * s, 49 * s)], fill=(56, 189, 248, 255))
    draw.ellipse([10 * s, 25 * s, 24 * s, 39 * s], fill=(248, 250, 252, 255))
    draw.rectangle([49 * s, 13 * s, 54 * s, 51 * s], fill=(248, 250, 252, 255))
    return image


def run_tray(app: MiniPC) -> None:
    """The icon by the clock: the way to restart the window or quit."""
    import pystray

    def restart(_icon=None, _item=None) -> None:
        app.restart_requested.set()

    def open_logs(_icon=None, _item=None) -> None:
        os.startfile(app.folder / "logs")  # noqa: S606 - Windows only

    def quit_(icon, _item=None) -> None:
        app.stopping.set()
        icon.stop()

    icon = pystray.Icon("minipc", icon_image(), "Mini PC", menu=pystray.Menu(
        pystray.MenuItem(lambda _item: app.summary(), None, enabled=False),
        pystray.MenuItem("Restart the output", restart),
        pystray.MenuItem("Open the log folder", open_logs),
        pystray.MenuItem("Quit", quit_),
    ))

    def refresh() -> None:
        icon.title = app.summary()[:120]
        with contextlib.suppress(Exception):
            icon.update_menu()

    app.on_change = refresh
    icon.run(setup=lambda i: (setattr(i, "visible", True), refresh()))


def configure_logging(folder: Path, verbose: bool) -> None:
    logs = folder / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    handlers: list[logging.Handler] = [
        RotatingFileHandler(logs / "minipc.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8"),
    ]
    if sys.stdout is not None:
        handlers.append(logging.StreamHandler(sys.stdout))
    logging.basicConfig(level=logging.DEBUG if verbose else logging.INFO,
                        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
                        handlers=handlers, force=True)
    # websocket-client logs every failed reconnect while the server is away;
    # the camera's own warnings already say so once.
    logging.getLogger("websocket").setLevel(logging.CRITICAL)


def self_check() -> int:
    """What a build must contain; run by CI on the built program."""
    import cv2  # noqa: F401
    import numpy  # noqa: F401
    import requests  # noqa: F401
    import websocket  # noqa: F401

    import agent  # noqa: F401
    import sources
    import vision  # noqa: F401

    if sys.platform == "win32":
        import depthai  # noqa: F401
        import pyorbbecsdk  # noqa: F401
        import pyrealsense2  # noqa: F401
        import pystray  # noqa: F401

        # Each depth camera SDK loads its drivers and can look for cameras.
        broken = {k: v for k, v in sources.sdk_status().items() if v.startswith("unavailable")}
        if broken:
            log.error("depth camera support missing: %s", broken)
            return 1
    log.info("depth camera support: %s", sources.sdk_status())
    icon_image()
    log.info("self-check passed; browser: %s", find_browser())
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="MiniPC", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--server", help="the main server's address, kept from now on; 'auto' finds it again")
    parser.add_argument("--name", help="how this computer is listed on the Players tab, kept from now on")
    parser.add_argument("--camera",
                        help="auto, off, realsense, orbbec, oak, webcam, webcam:N or sim, kept from now on")
    parser.add_argument("--data-dir", help="where the settings and logs are kept")
    parser.add_argument("--discovery-port", type=int, default=discovery.DEFAULT_PORT, help=argparse.SUPPRESS)
    parser.add_argument("--status-port", type=int, default=STATUS_PORT, help=argparse.SUPPRESS)
    parser.add_argument("--browser", help="path to Chrome or Edge, when it is somewhere unusual")
    parser.add_argument("--browser-arg", action="append", default=[], help=argparse.SUPPRESS)
    parser.add_argument("--no-tray", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--check", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--write-icon", metavar="PATH", help=argparse.SUPPRESS)
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)

    if args.write_icon:
        icon_image(256).save(args.write_icon, sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])
        return 0
    folder = Path(args.data_dir).expanduser() if args.data_dir else data_dir()
    configure_logging(folder, args.verbose)
    if args.check:
        return self_check()

    config = Config(folder / "config.json")
    if args.server:
        config["server"] = "" if args.server == "auto" else args.server.rstrip("/")
    if args.name:
        config["name"] = args.name
    if args.camera:
        config["camera"] = args.camera

    try:
        page_port = args.status_port
        app = MiniPC(config, folder, discovery_port=args.discovery_port, browser=args.browser,
                     browser_args=args.browser_arg)
        page = StatusPage(app, page_port)
    except OSError:
        log.info("the Mini PC program is already running")
        return 0
    page.start()
    log.info("Mini PC %s started (data in %s)", config["name"], folder)
    # Stopped by the system: close the output window on the way out.
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))

    tray = sys.platform == "win32" and not args.no_tray
    if tray:
        worker = threading.Thread(target=app.run, args=(page,), name="main", daemon=True)
        worker.start()
        run_tray(app)
        app.stopping.set()
        worker.join(timeout=10)
    else:
        with contextlib.suppress(KeyboardInterrupt):
            app.run(page)
    page.close()
    log.info("stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
