"""The full-screen browser window the projector shows.

Kiosk mode: the page covers the whole display with no tabs, address bar or
window frame, from the first frame. Chrome when it is installed, otherwise
Edge, which every Windows 10 and 11 computer has. The window is reopened
if it closes or crashes.
"""

from __future__ import annotations

import contextlib
import json
import logging
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import psutil

log = logging.getLogger("minipc.kiosk")

#: A browser that exits sooner than this after starting handed its window
#: to one already running, or failed to start: back off instead of looping.
QUICK_EXIT_SECONDS = 10
MAX_BACKOFF_SECONDS = 60


def _windows_candidates() -> list[Path]:
    roots = [os.environ.get(name) for name in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA")]
    chrome = [Path(root) / "Google" / "Chrome" / "Application" / "chrome.exe" for root in roots if root]
    edge = [Path(root) / "Microsoft" / "Edge" / "Application" / "msedge.exe" for root in roots if root]
    return chrome + edge


def find_browser() -> str | None:
    """Chrome if installed, else Edge (Windows), else Chromium."""
    if sys.platform == "win32":
        candidates = _windows_candidates()
    elif sys.platform == "darwin":
        candidates = [Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
                      Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
                      Path("/Applications/Chromium.app/Contents/MacOS/Chromium")]
    else:
        candidates = [Path(found) for name in ("google-chrome", "google-chrome-stable", "chromium",
                                               "chromium-browser", "microsoft-edge")
                      if (found := shutil.which(name))]
    return next((str(path) for path in candidates if path.is_file()), None)


def is_edge(browser: str) -> bool:
    return "edge" in Path(browser).name.lower()


def kiosk_command(browser: str, url: str, profile: Path, extra: list[str] | None = None,
                  secure_origin: str | None = None) -> list[str]:
    command = [
        browser,
        f"--user-data-dir={profile}",
        "--kiosk",
        "--no-first-run",
        "--no-default-browser-check",
        "--noerrdialogs",
        "--disable-infobars",
        "--disable-session-crashed-bubble",
        "--disable-features=Translate,TranslateUI",
        # Nothing of the browser's own over the output: no search engine
        # choice screen (shown to new profiles in Europe), and no "Restore
        # pages?" after this program had to stop the browser (current
        # browsers ignore --disable-session-crashed-bubble; see also
        # mark_clean_exit). Browsers that do not know a switch ignore it.
        "--disable-search-engine-choice-screen",
        "--hide-crash-restore-bubble",
        "--disable-pinch",
        "--overscroll-history-navigation=0",
        "--check-for-update-interval=31536000",
        # Video starts without anyone clicking.
        "--autoplay-policy=no-user-gesture-required",
        # One page pixel is one projector pixel, whatever Windows' display
        # scaling says: calibration and edge blends depend on it.
        "--force-device-scale-factor=1",
        # Mini PCs' graphics drivers are often on Chrome's blocklist, which
        # would leave the output on slow software rendering.
        "--ignore-gpu-blocklist",
    ]
    if secure_origin:
        # Browsers keep files offline only for secure origins; the show's
        # server is plain HTTP on the LAN. With this the player keeps the
        # show's media on this computer's disk instead of streaming it.
        command.append(f"--unsafely-treat-insecure-origin-as-secure={secure_origin}")
    if is_edge(browser):
        command.append("--edge-kiosk-type=fullscreen")
    if sys.platform.startswith("linux"):
        command.append("--password-store=basic")
    return command + list(extra or []) + [url]


def browsers_on(profile: Path) -> list[psutil.Process]:
    """The browser processes (not their helpers) open on this profile."""
    flag = f"--user-data-dir={profile}"
    found = []
    for process in psutil.process_iter(["cmdline"]):
        command = process.info["cmdline"] or []
        if flag in command and not any(arg.startswith("--type=") for arg in command):
            found.append(process)
    return found


def close_leftovers(profile: Path) -> int:
    """Close windows an earlier run left open on this profile.

    A browser started on a profile that is already open hands its page to
    the open one and exits, so the leftover would be the window for good.
    """
    closed = 0
    for process in browsers_on(profile):
        with contextlib.suppress(psutil.NoSuchProcess, psutil.AccessDenied):
            process.kill()
            closed += 1
    return closed


def write_atomically(path: Path, text: str) -> None:
    """Replace ``path`` with ``text`` in one step, readable by this user only.

    A power cut leaves the old file or the new one, never half of one.
    """
    partial = path.with_name(f".{path.name}.part")
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_BINARY", 0)
    with os.fdopen(os.open(partial, flags, 0o600), "w", encoding="utf-8") as file:
        file.write(text)
        file.flush()
        os.fsync(file.fileno())
    # On Windows the replace fails while another program (an antivirus
    # scan, a second copy reading it) has the file open; that is brief.
    for attempt in range(5):
        try:
            os.replace(partial, path)
            return
        except PermissionError:
            if attempt == 4:
                raise
            time.sleep(0.1 * (attempt + 1))


def mark_clean_exit(profile: Path) -> None:
    """Stop the browser offering to restore pages after a power cut."""
    preferences = profile / "Default" / "Preferences"
    try:
        data = json.loads(preferences.read_text(encoding="utf-8"))
        data.setdefault("profile", {}).update(exit_type="Normal", exited_cleanly=True)
    except (OSError, ValueError, AttributeError):  # none yet, or not the usual layout
        return
    # Whole or not at all: the browser warns on screen about a settings file
    # it cannot read, and this runs before every start of the window.
    with contextlib.suppress(OSError):
        write_atomically(preferences, json.dumps(data))


class Kiosk:
    def __init__(self, browser: str, url: str, profile: Path, extra: list[str] | None = None) -> None:
        self.browser = browser
        self.url = url
        self.profile = profile
        self.extra = extra or []
        #: The main server, once known.
        self.secure_origin: str | None = None
        #: The browser showing the window, once started.
        self.process: psutil.Process | None = None
        self._popen: subprocess.Popen | None = None
        self._started_at = 0.0
        self._next_start = 0.0
        self._backoff = 2.0

    @property
    def running(self) -> bool:
        if self._popen is not None:
            self._popen.poll()  # collect it if it has exited
        try:
            if self.process is not None and self.process.status() != psutil.STATUS_ZOMBIE:
                return True
        except psutil.NoSuchProcess:
            pass
        # A browser can hand its window to another process of its own and
        # exit; that one is the window now. (Before the first start, one
        # found here is left over from an earlier run, and is closed.)
        others = browsers_on(self.profile) if self._started_at else []
        if others:
            self.process = others[0]
            return True
        return False

    def _start(self) -> None:
        if self._started_at == 0.0 and close_leftovers(self.profile):
            log.info("closed an output window left over from before")
            time.sleep(1)
        self.profile.mkdir(parents=True, exist_ok=True)
        mark_clean_exit(self.profile)
        command = kiosk_command(self.browser, self.url, self.profile, self.extra, self.secure_origin)
        log.info("opening the output in %s", self.browser)
        self._started_at = time.monotonic()
        try:
            self._popen = subprocess.Popen(command, stdin=subprocess.DEVNULL,
                                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.process = psutil.Process(self._popen.pid)
        except (OSError, psutil.NoSuchProcess) as exc:
            log.error("could not start %s: %s", self.browser, exc)
            self.process = None
            self._next_start = self._started_at + MAX_BACKOFF_SECONDS

    def adopt(self, secure_origin: str | None) -> bool:
        """Keep the window an app that updated itself left open, instead of
        reopening it: the projector never sees the desktop."""
        open_now = browsers_on(self.profile)
        if not open_now:
            return False
        self.process = open_now[0]
        self.secure_origin = secure_origin
        self._started_at = time.monotonic()
        log.info("kept the output window that was already open")
        return True

    def adopt_leftover(self) -> bool:
        """Keep a window an earlier run of the app left open on the show.

        When the app stops and starts again (a crash, an update, the
        watchdog), the window may still be playing: closing and reopening it
        would flash the desktop on the projector. Only a window that was
        showing a server's player page is kept; one still on the local
        waiting page is closed and reopened as before.
        """
        flag = "--unsafely-treat-insecure-origin-as-secure="
        for process in browsers_on(self.profile):
            try:
                command = process.cmdline()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
            origin = next((arg[len(flag):] for arg in command if arg.startswith(flag)), None)
            if origin:
                return self.adopt(origin)
        return False

    def ensure(self) -> None:
        """Open the window if it is not open; call this regularly."""
        if self.running:
            return
        now = time.monotonic()
        if self.process is not None:
            # It was open and has closed. Wait a moment, longer each time it
            # closes straight away.
            quick = now - self._started_at < QUICK_EXIT_SECONDS
            self._backoff = min(self._backoff * 2, MAX_BACKOFF_SECONDS) if quick else 2.0
            log.warning("the output window closed; reopening it in %.0f s", self._backoff)
            self.process = None
            self._next_start = now + self._backoff
        if now >= self._next_start:
            self._start()

    def stop(self) -> None:
        if self.process is None:
            return
        with contextlib.suppress(psutil.NoSuchProcess):
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except psutil.TimeoutExpired:
                self.process.kill()
        if self._popen is not None:
            self._popen.poll()
        self.process = None

    def restart(self) -> None:
        self.stop()
        self._start()
