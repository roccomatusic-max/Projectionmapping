"""Mini PC: everything a computer beside a projector runs, in one program.

Install it once (MiniPC-Setup.exe on Windows). Every time the computer
signs in after that, it:

- finds the main server on the network by itself,
- shows the output full screen on the projector in a kiosk browser window
  (no tabs, no address bar, no frame), reopened if it ever closes,
- runs the camera when one is plugged in, for calibration and people: a
  depth camera (Intel RealSense, Orbbec, Luxonis OAK) or any webcam, found
  by itself,
- keeps the computer on day and night: no sleep, no hibernate, no screen
  turning off, no lock, ever, also after a show ends (stayawake.py),
- does what the Players page asks of it: restart the output window,
  restart or shut down the computer,
- updates itself from the main server when no show is on, without
  restarting the computer or closing the output (selfupdate.py),
- shows the status screen (the show, its projector, a picture of its
  output) on a monitor plugged in beside the projector, when there is one
  (screens.py).

The first time, the projector shows a pairing code. Approving it on the
Mapping page, Players tab, pairs this computer and its camera together.

    MiniPC.exe                              # normal start
    MiniPC.exe --server http://10.0.0.5:8765   # skip looking for the server
    MiniPC.exe --camera off                 # never use a camera
    MiniPC.exe --second-screen off          # no status screen on a second monitor
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
import subprocess
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

import psutil  # noqa: E402
import requests  # noqa: E402

import discovery  # noqa: E402
import screens  # noqa: E402
import stayawake  # noqa: E402
from kiosk import Kiosk, find_browser, write_atomically  # noqa: E402
from selfupdate import VERSION, SelfUpdate, collect_log  # noqa: E402

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
        if not isinstance(self.data, dict):
            self.data = {}
        stored = dict(self.data)
        if not (self.data.get("device_id") and self.data.get("secret")):
            self.data.update(device_id=f"mpc-{secrets.token_hex(12)}", secret=secrets.token_hex(32))
        self.data.setdefault("name", socket.gethostname() or "Mini PC")
        self.data.setdefault("server", "")
        self.data.setdefault("last_server", "")
        self.data.setdefault("camera", "auto")
        # Not rewritten at every start: the power often fails again within
        # seconds of coming back, and this file is the computer's identity.
        if self.data != stored:
            self.save()

    def __getitem__(self, key: str):
        return self.data[key]

    def __setitem__(self, key: str, value) -> None:
        if self.data.get(key) != value:
            self.data[key] = value
            self.save()

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # Whole or not at all: a half-written file would mean pairing again.
        # (Windows: the per-user folder is private anyway.)
        write_atomically(self.path, json.dumps(self.data, indent=2))

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

        class Server(ThreadingHTTPServer):
            # Windows lets a socket with SO_REUSEADDR bind a port another
            # socket is listening on, so a second copy would start too.
            allow_reuse_address = sys.platform != "win32"

        # Raises OSError when another copy already holds the port.
        self.server = Server(("127.0.0.1", port), Handler)
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


# -- the Players page's controls ------------------------------------------------------------


def network_card(address: str | None) -> str | None:
    """The hardware address of the network card holding ``address``, as
    aa:bb:cc:dd:ee:ff: what the server needs to wake this computer."""
    if not address:
        return None
    for addresses in psutil.net_if_addrs().values():
        if any(a.family == socket.AF_INET and a.address == address for a in addresses):
            for a in addresses:
                if a.family == psutil.AF_LINK:
                    mac = a.address.replace("-", ":").lower()
                    if len(mac) == 17 and mac != "00:00:00:00:00:00":
                        return mac
    return None


def power(action: str) -> None:
    """Restart ("reboot") or shut down this computer, now (Windows)."""
    if sys.platform != "win32":
        log.warning("asked to %s, which only the Windows app does", action)
        return
    log.warning("the Players page asked this computer to %s",
                "restart" if action == "reboot" else "shut down")
    # /f: the output window would otherwise hold the restart up. The window
    # is told to skip "restore pages" at every start, so nothing shows later.
    subprocess.run(["shutdown", "/r" if action == "reboot" else "/s", "/t", "0", "/f"],
                   check=False, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))


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
        #: The local status page's port, which the update script waits on.
        self.status_port = STATUS_PORT
        #: When the main loop last went round (time.monotonic()).
        self.ticked = time.monotonic()
        #: What keeps this computer from staying on 24/7, in words; None
        #: until checked (stayawake.refresh).
        self.awake: list[str] | None = None
        self.on_change = lambda: None
        #: Ends the program (the tray stops its icon).
        self.on_quit = lambda: None
        self.updater = SelfUpdate(folder)
        #: Quitting to install an update: leave the output window open.
        self.handing_over = False
        #: The status screen on a second monitor (Windows), once running.
        self.second: screens.SecondScreen | None = None

    # -- what the window and the tray show ----------------------------------

    def player_url(self) -> str | None:
        if self.server is None:
            return None
        # The identity rides in the fragment, which the browser never sends
        # to the server; the player page keeps it, so the projector and the
        # camera on this computer pair as one.
        return f"{self.server}/player#{urlencode(self.config.identity())}"

    def status(self) -> dict:
        return {"name": self.config["name"], "message": self.message, "player": self.player_url(),
                # For the watchdog: this copy, and whether its main loop still turns.
                "pid": os.getpid(), "tick_age": round(time.monotonic() - self.ticked, 1)}

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

    # -- the Players page ---------------------------------------------------------------

    def check_in(self) -> list[str]:
        """Say this app is here; returns what the Players page asked of it.

        Answered only once this computer is paired; an older server without
        the controls answers 404, and nothing is asked.
        """
        if self.server is None or self._lost_since is not None:
            return []
        identity = self.config.identity()
        body = {"device_id": identity["device_id"], "secret": identity["secret"],
                "power": sys.platform == "win32", "computer": socket.gethostname() or None,
                "mac": network_card(discovery.local_address()),
                "version": self.updater.version, "update": self.updater.report(),
                "awake": self.awake, "screens": self.second.report() if self.second else None,
                "watchdog": sys.platform == "win32"}
        try:
            reply = requests.post(f"{self.server}/api/mapping/players/app", json=body, timeout=3)
            if reply.status_code != 200:
                return []
            answer = reply.json()
            commands = answer.get("commands", [])
            update = answer.get("update")
        except (requests.RequestException, ValueError, AttributeError) as exc:
            log.debug("check-in failed: %s", exc)
            return []
        commands = [c for c in commands if isinstance(c, str)]
        if self.updater.log_due:
            self.updater.log_due = False
            commands.append("send_log:update")
        if isinstance(update, dict) and self.updater.offered(update, self.server):
            commands.append("install_update")
        return commands

    def send_log(self, reason: str = "asked") -> bool:
        """Send the log to the server, for Get the log on the Players page."""
        if self.server is None:
            return False
        identity = self.config.identity()
        body = {"device_id": identity["device_id"], "secret": identity["secret"],
                "reason": reason, "text": collect_log(self.folder)}
        try:
            reply = requests.post(f"{self.server}/api/mapping/players/app/log", json=body, timeout=30)
        except requests.RequestException as exc:
            log.warning("could not send the log: %s", exc)
            return False
        if reply.status_code != 204:
            log.warning("the server did not take the log: %s", reply.status_code)
            return False
        log.info("sent the log to the server (%s)", reason)
        return True

    def obey(self, commands: list[str]) -> None:
        for command in commands:
            if command == "restart_output":
                log.info("the Players page asked to restart the output")
                self.restart_requested.set()
            elif command in ("reboot", "shutdown"):
                power(command)
            elif command == "swap_screens" and self.second:
                log.info("the Players page asked to swap the screens")
                self.second.swap()
            elif command == "extend_screens" and self.second:
                log.info("the Players page asked to use the second screen")
                self.second.extend()
            elif command.startswith("send_log"):
                reason = command.partition(":")[2] or "asked"
                threading.Thread(target=self.send_log, args=(reason,), name="send-log", daemon=True).start()
            elif command == "install_update":
                if self.updater.hand_over(self.server, self.status_port):
                    self.handing_over = True
                    self.stopping.set()
                    self.on_quit()
            else:
                log.info("ignoring %r, which this app does not know", command)

    # -- main loop ----------------------------------------------------------------------

    def stay_on(self) -> None:
        """Windows' power and lock settings, put right now and every hour."""
        while not self.stopping.is_set():
            try:
                problems = stayawake.refresh()
            except Exception:  # noqa: BLE001 - never worth stopping the app over
                log.exception("could not check the power settings")
                problems = None
            if problems is not None and problems != self.awake:
                for problem in problems:
                    log.warning("staying on 24/7: %s", problem)
                if not problems:
                    log.info("this computer stays on 24/7: no sleep, screen off or lock")
                self.awake = problems
            self.stopping.wait(stayawake.CHECK_SECONDS)

    def run(self, page: StatusPage) -> None:
        self.status_port = getattr(page, "port", STATUS_PORT)
        keep_awake()
        threading.Thread(target=self.stay_on, name="stay-on", daemon=True).start()
        browser = self.browser or find_browser()
        kiosk = None
        if browser:
            kiosk = Kiosk(browser, page.url, self.folder / "browser", self.browser_args)
            kept = self.updater.take_window()
            if not kiosk.adopt_leftover() and kept is not None:
                kiosk.adopt(kept)
            system = screens.system_screens()
            if system is not None:
                status = Kiosk(browser, page.url, self.folder / "screen-browser", self.browser_args)
                self.second = screens.SecondScreen(self.config, status, system, self.config.identity(),
                                                   base_args=self.browser_args)
        else:
            log.error("no Chrome or Edge on this computer: install Google Chrome")
            self._say("No Chrome or Edge found on this computer")
        if self.use_camera:
            self.camera = CameraRunner(self)
            self.camera.start()
        try:
            while not self.stopping.is_set():
                try:
                    reopen = self.follow_server()
                    self.obey(self.check_in())
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
                        if self.second:
                            self.second.tick(kiosk, self.server)
                except Exception:  # noqa: BLE001 - leaving the loop would close the output for good
                    log.exception("unexpected error; carrying on")
                self.ticked = time.monotonic()
                self.stopping.wait(TICK_SECONDS)
        finally:
            if self.second:
                self.second.close()
            if kiosk and not self.handing_over:
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
        with contextlib.suppress(OSError):
            (app.folder / QUIT_MARK).write_text("Quit in the tray menu", encoding="utf-8")
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
    app.on_quit = icon.stop
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
        # It can set the power plan to never sleep and read it back.
        log.info("staying on 24/7: %s", stayawake.refresh() or "all set")
        plan = stayawake.timeouts()
        if any(value != (0, 0) for value in plan.values()):
            log.error("the power plan still sleeps or turns something off: %s", plan)
            return 1
        # It can read the screens and find a window on one.
        system = screens.WindowsScreens()
        found = system.screens()
        log.info("screens: %s; mirrored: %s; this window's screen: %s",
                 [f"{s.source} {s.describe()}{' main' if s.primary else ''}" for s in found] or "none",
                 system.mirrored(), system.window_screen({os.getpid()}))
    log.info("depth camera support: %s", sources.sdk_status())
    icon_image()
    log.info("self-check passed; version %s; browser: %s", VERSION, find_browser())
    return 0


#: Left by Quit in the tray menu: the watchdog leaves the app off until it
#: is started again (at the next sign-in, or from the Start menu).
QUIT_MARK = "quit-by-hand"
#: The main loop has not gone round for this long: that copy is stuck.
STUCK_SECONDS = 120.0


def running_copy(port: int) -> dict | None:
    """The status of the copy of this app already running here, if any."""
    try:
        reply = requests.get(f"http://127.0.0.1:{port}/status", timeout=3)
        status = reply.json() if reply.status_code == 200 else None
    except (requests.RequestException, ValueError):
        return None
    return status if isinstance(status, dict) and "name" in status else None


def start_detached(command: list[str]) -> None:
    """Start the app on its own, outside whatever started this (Task Scheduler)."""
    flags = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    options = {"stdin": subprocess.DEVNULL, "stdout": subprocess.DEVNULL,
               "stderr": subprocess.DEVNULL, "close_fds": True}
    if sys.platform != "win32":
        subprocess.Popen(command, start_new_session=True, **options)  # noqa: S603
        return
    try:
        subprocess.Popen(command, creationflags=flags | 0x01000000, **options)  # noqa: S603 - breakaway
    except OSError:
        subprocess.Popen(command, creationflags=flags, **options)  # noqa: S603


def watchdog(folder: Path, port: int) -> int:
    """Run by Windows every few minutes (installer.iss): start the app if it
    is not running, or restart it if it is stuck.

    The output window is kept either way (Kiosk.adopt_leftover), so the
    projector does not blink. Nothing happens while the app is being
    updated, or after someone chose Quit in the tray menu.
    """
    if (folder / QUIT_MARK).exists() or SelfUpdate(folder, read_result=False).installing():
        return 0
    status = running_copy(port)
    if status is not None:
        if float(status.get("tick_age") or 0) < STUCK_SECONDS:
            return 0
        with contextlib.suppress(psutil.Error, TypeError, ValueError):
            psutil.Process(int(status["pid"])).kill()
            time.sleep(2)
    start_detached([sys.executable] + ([] if getattr(sys, "frozen", False) else [str(Path(__file__).resolve())]))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="MiniPC", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--server", help="the main server's address, kept from now on; 'auto' finds it again")
    parser.add_argument("--name", help="how this computer is listed on the Players tab, kept from now on")
    parser.add_argument("--camera",
                        help="auto, off, realsense, orbbec, oak, webcam, webcam:N or sim, kept from now on")
    parser.add_argument("--second-screen", choices=["auto", "off"],
                        help="the status screen on a monitor beside the projector, kept from now on")
    parser.add_argument("--data-dir", help="where the settings and logs are kept")
    parser.add_argument("--discovery-port", type=int, default=discovery.DEFAULT_PORT, help=argparse.SUPPRESS)
    parser.add_argument("--status-port", type=int, default=STATUS_PORT, help=argparse.SUPPRESS)
    parser.add_argument("--browser", help="path to Chrome or Edge, when it is somewhere unusual")
    parser.add_argument("--browser-arg", action="append", default=[], help=argparse.SUPPRESS)
    parser.add_argument("--no-tray", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--check", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--watchdog", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--write-icon", metavar="PATH", help=argparse.SUPPRESS)
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)

    if args.write_icon:
        icon_image(256).save(args.write_icon, sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])
        return 0
    folder = Path(args.data_dir).expanduser() if args.data_dir else data_dir()
    if args.watchdog:
        return watchdog(folder, args.status_port)
    configure_logging(folder, args.verbose)
    if args.check:
        # A failure goes to the log, which CI prints. Uncaught, the windowed
        # program would show it only in a message box nobody is there to see.
        try:
            return self_check()
        except Exception:  # noqa: BLE001
            log.exception("self-check failed")
            return 1

    config = Config(folder / "config.json")
    if args.server:
        config["server"] = "" if args.server == "auto" else args.server.rstrip("/")
    if args.name:
        config["name"] = args.name
    if args.camera:
        config["camera"] = args.camera
    if args.second_screen:
        config["second_screen"] = args.second_screen

    try:
        page_port = args.status_port
        app = MiniPC(config, folder, discovery_port=args.discovery_port, browser=args.browser,
                     browser_args=args.browser_arg)
        page = StatusPage(app, page_port)
    except OSError:
        log.info("the Mini PC program is already running")
        return 0
    page.start()
    with contextlib.suppress(OSError):
        (folder / QUIT_MARK).unlink(missing_ok=True)
    log.info("Mini PC %s version %s started (data in %s)", config["name"], VERSION, folder)
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
