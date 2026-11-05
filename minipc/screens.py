"""The status screen: a monitor plugged in beside the projector (Windows).

With a second screen on the mini PC, the app opens a second kiosk window
on it with the status screen (``/player/screen`` on the main server): the
show, the projector this mini PC drives, and a picture of its output. The
projector keeps the output window exactly as before, full screen, and with
only one screen nothing changes at all.

Which screen is the projector: the one the output window is on when a
second screen first shows up. It is remembered (``projector_screen`` in
config.json), so the output goes back to it after a restart even if Windows
puts it elsewhere. The Players page has *Swap screens* for when that guess
was wrong, and *Use as a second screen* for when Windows shows the same
picture on both.

The status window is never left on the projector: it is checked a few
seconds after it opens and closed at once if it landed there.
"""

from __future__ import annotations

import logging
import subprocess
import sys
import time
from dataclasses import dataclass
from urllib.parse import urlencode

log = logging.getLogger("minipc.screens")

#: How often the screens are looked at.
CHECK_SECONDS = 5.0
#: A window opened this long ago has found its place on a screen.
SETTLE_SECONDS = 8.0
#: Openings of the status window that did not stay on the other screen,
#: before it stops trying until the screens change.
MAX_TRIES = 2


@dataclass(frozen=True)
class Screen:
    """One screen of the desktop, in physical pixels."""

    #: What stays the same for this screen across restarts: the monitor's
    #: device path, or else Windows' name for the output (\\\\.\\DISPLAY2).
    id: str
    #: Windows' name for the output the screen is on.
    source: str
    left: int
    top: int
    right: int
    bottom: int
    primary: bool = False

    @property
    def width(self) -> int:
        return self.right - self.left

    @property
    def height(self) -> int:
        return self.bottom - self.top

    def placement(self) -> list[str]:
        """Browser switches that open its window on this screen."""
        return [f"--window-position={self.left},{self.top}",
                f"--window-size={self.width},{self.height}"]

    def describe(self, other: Screen | None = None) -> str:
        """'1920 × 1080, on the left', for the Players page."""
        size = f"{self.width} × {self.height}"
        if other is None:
            return size
        dx = (self.left + self.right) - (other.left + other.right)
        dy = (self.top + self.bottom) - (other.top + other.bottom)
        if abs(dx) >= abs(dy):
            side = "on the left" if dx < 0 else "on the right"
        else:
            side = "on top" if dy < 0 else "below"
        return f"{size}, {side}"


# -- Windows -------------------------------------------------------------------------------


class WindowsScreens:
    """The screens and windows, from Windows itself (user32, no administrator)."""

    def __init__(self) -> None:
        import ctypes
        from ctypes import wintypes

        self.ctypes = ctypes
        self.user32 = ctypes.WinDLL("user32", use_last_error=True)
        w = wintypes

        class RECT(ctypes.Structure):
            _fields_ = [("left", w.LONG), ("top", w.LONG), ("right", w.LONG), ("bottom", w.LONG)]

        class MONITORINFOEXW(ctypes.Structure):
            _fields_ = [("cbSize", w.DWORD), ("rcMonitor", RECT), ("rcWork", RECT),
                        ("dwFlags", w.DWORD), ("szDevice", w.WCHAR * 32)]

        class DISPLAY_DEVICEW(ctypes.Structure):  # noqa: N801 - Windows' name
            _fields_ = [("cb", w.DWORD), ("DeviceName", w.WCHAR * 32), ("DeviceString", w.WCHAR * 128),
                        ("StateFlags", w.DWORD), ("DeviceID", w.WCHAR * 128), ("DeviceKey", w.WCHAR * 128)]

        self.RECT, self.MONITORINFOEXW, self.DISPLAY_DEVICEW = RECT, MONITORINFOEXW, DISPLAY_DEVICEW
        self.MonitorEnumProc = ctypes.WINFUNCTYPE(w.BOOL, w.HMONITOR, w.HDC, ctypes.POINTER(RECT), w.LPARAM)
        self.WindowEnumProc = ctypes.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
        u = self.user32
        u.EnumDisplayMonitors.argtypes = [w.HDC, ctypes.POINTER(RECT), self.MonitorEnumProc, w.LPARAM]
        u.GetMonitorInfoW.argtypes = [w.HMONITOR, ctypes.POINTER(MONITORINFOEXW)]
        u.EnumDisplayDevicesW.argtypes = [w.LPCWSTR, w.DWORD, ctypes.POINTER(DISPLAY_DEVICEW), w.DWORD]
        u.EnumWindows.argtypes = [self.WindowEnumProc, w.LPARAM]
        u.GetWindowThreadProcessId.argtypes = [w.HWND, ctypes.POINTER(w.DWORD)]
        u.GetWindowRect.argtypes = [w.HWND, ctypes.POINTER(RECT)]
        u.IsWindowVisible.argtypes = [w.HWND]
        u.IsIconic.argtypes = [w.HWND]
        u.MonitorFromWindow.argtypes = [w.HWND, w.DWORD]
        u.MonitorFromWindow.restype = w.HMONITOR
        try:
            u.SetThreadDpiAwarenessContext.argtypes = [ctypes.c_void_p]
            u.SetThreadDpiAwarenessContext.restype = ctypes.c_void_p
            self._dpi = u.SetThreadDpiAwarenessContext
        except AttributeError:  # Windows 10 before 1607
            self._dpi = None

    def _physical(self):
        """Read sizes in real pixels, whatever Windows' display scaling says."""
        if self._dpi is None:
            return None
        return self._dpi(self.ctypes.c_void_p(-4))  # per monitor aware, v2

    def _restore(self, previous) -> None:
        if self._dpi is not None and previous:
            self._dpi(self.ctypes.c_void_p(previous))

    def _monitor_device(self, source: str) -> tuple[str | None, int]:
        """The first monitor showing ``source``, and how many do."""
        device = self.DISPLAY_DEVICEW()
        device.cb = self.ctypes.sizeof(device)
        first, active = None, 0
        index = 0
        # 1: EDD_GET_DEVICE_INTERFACE_NAME, a path that names the monitor itself.
        while self.user32.EnumDisplayDevicesW(source, index, self.ctypes.byref(device), 1):
            if device.StateFlags & 0x1:  # DISPLAY_DEVICE_ACTIVE
                active += 1
                first = first or (device.DeviceID or None)
            index += 1
        return first, active

    def screens(self) -> list[Screen]:
        previous = self._physical()
        try:
            found: list[Screen] = []

            def each(monitor, _dc, _rect, _data) -> bool:
                info = self.MONITORINFOEXW()
                info.cbSize = self.ctypes.sizeof(info)
                if self.user32.GetMonitorInfoW(monitor, self.ctypes.byref(info)):
                    r = info.rcMonitor
                    monitor_id, _count = self._monitor_device(info.szDevice)
                    found.append(Screen(id=monitor_id or info.szDevice, source=info.szDevice,
                                        left=r.left, top=r.top, right=r.right, bottom=r.bottom,
                                        primary=bool(info.dwFlags & 0x1)))
                return True

            self.user32.EnumDisplayMonitors(None, None, self.MonitorEnumProc(each), 0)
            return found
        finally:
            self._restore(previous)

    def mirrored(self) -> bool:
        """Windows shows the same picture on two screens (Duplicate)."""
        adapter = self.DISPLAY_DEVICEW()
        adapter.cb = self.ctypes.sizeof(adapter)
        index = 0
        while self.user32.EnumDisplayDevicesW(None, index, self.ctypes.byref(adapter), 0):
            if adapter.StateFlags & 0x1:  # DISPLAY_DEVICE_ATTACHED_TO_DESKTOP
                _first, active = self._monitor_device(adapter.DeviceName)
                if active > 1:
                    return True
            index += 1
        return False

    def window_screen(self, pids: set[int]) -> str | None:
        """The source (\\\\.\\DISPLAY1) of the screen holding the biggest window of ``pids``."""
        if not pids:
            return None
        previous = self._physical()
        try:
            best: list = [0, None]

            def each(hwnd, _data) -> bool:
                pid = self.ctypes.c_ulong()
                self.user32.GetWindowThreadProcessId(hwnd, self.ctypes.byref(pid))
                if pid.value in pids and self.user32.IsWindowVisible(hwnd) and not self.user32.IsIconic(hwnd):
                    r = self.RECT()
                    if self.user32.GetWindowRect(hwnd, self.ctypes.byref(r)):
                        area = max(0, r.right - r.left) * max(0, r.bottom - r.top)
                        if area > best[0]:
                            best[:] = [area, hwnd]
                return True

            self.user32.EnumWindows(self.WindowEnumProc(each), 0)
            if best[1] is None:
                return None
            monitor = self.user32.MonitorFromWindow(best[1], 0)  # MONITOR_DEFAULTTONULL
            if not monitor:
                return None
            info = self.MONITORINFOEXW()
            info.cbSize = self.ctypes.sizeof(info)
            if not self.user32.GetMonitorInfoW(monitor, self.ctypes.byref(info)):
                return None
            return info.szDevice
        finally:
            self._restore(previous)

    def extend(self) -> bool:
        """Show a different picture on each screen (Windows key + P, Extend)."""
        try:
            setup = self.ctypes.WinDLL("user32").SetDisplayConfig
            # SDC_TOPOLOGY_EXTEND | SDC_APPLY
            if setup(0, None, 0, None, 0x04 | 0x80) == 0:
                return True
        except (AttributeError, OSError) as exc:
            log.warning("could not set the screens to extend: %s", exc)
        try:
            subprocess.run(["DisplaySwitch.exe", "/extend"], check=False, timeout=20,
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            return True
        except (OSError, subprocess.SubprocessError) as exc:
            log.warning("DisplaySwitch /extend: %s", exc)
            return False


def system_screens():
    """The screens of this computer, or None where the app cannot tell (not Windows)."""
    if sys.platform != "win32":
        return None
    try:
        return WindowsScreens()
    except Exception:  # noqa: BLE001 - no status screen rather than no app
        log.exception("cannot read the screens")
        return None


# -- the status window -----------------------------------------------------------------------


def distinct(found: list[Screen]) -> list[Screen]:
    """One entry per picture: two screens at the same place show the same one."""
    seen: dict[tuple[int, int, int, int], Screen] = {}
    for screen in found:
        seen.setdefault((screen.left, screen.top, screen.right, screen.bottom), screen)
    return sorted(seen.values(), key=lambda s: (s.left, s.top))


class SecondScreen:
    """Keeps the status window on the screen that is not the projector.

    ``window`` is a Kiosk on its own browser profile; ``output`` is the
    projector's. ``system`` reads the screens (WindowsScreens, or a fake in
    the tests).
    """

    def __init__(self, config, window, system, identity: dict, *,
                 base_args: list[str] | None = None, clock=time.monotonic) -> None:
        self.config = config
        self.window = window
        self.system = system
        self.identity = identity
        self.base_args = list(base_args or [])
        self.clock = clock
        self.state = "one"
        self.count = 1
        self.projector: Screen | None = None
        self.second: Screen | None = None
        #: The screen the status window was opened on, and when.
        self._shown_on: str | None = None
        self._opened_at = 0.0
        self._tries = 0
        #: The output was moved back to the projector once for these screens.
        self._moved_output = False
        self._layout: tuple[str, ...] = ()
        self._next = 0.0
        self._swap = False

    @property
    def enabled(self) -> bool:
        return self.config.data.get("second_screen", "auto") != "off"

    def report(self) -> dict | None:
        if self.system is None:
            return None
        return {"state": self.state, "count": self.count,
                "projector": self.projector.describe(self.second) if self.projector else None,
                "second": self.second.describe(self.projector) if self.second else None}

    def swap(self) -> None:
        """The Players page says the projector is the other screen."""
        self._swap = True
        self._next = 0.0

    def extend(self) -> None:
        if self.system is not None and self.system.extend():
            log.info("the screens now show different pictures")
        self._next = 0.0

    def close(self) -> None:
        if self.window.process is not None:
            self.window.stop()
        self._shown_on = None

    def tick(self, output, server: str | None) -> None:
        """Call this regularly; looks at the screens every few seconds."""
        if self.system is None:
            return
        now = self.clock()
        if now < self._next:
            return
        self._next = now + CHECK_SECONDS
        try:
            self._check(output, server, now)
        except Exception:  # noqa: BLE001 - the projector's window matters more than this one
            log.exception("could not check the screens")

    def _set_output_screen(self, output, screen: Screen | None) -> None:
        """Where the output window opens the next time it does."""
        output.extra = self.base_args + (screen.placement() if screen else [])

    def _check(self, output, server: str | None, now: float) -> None:
        if not self.enabled:
            self.state, self.projector, self.second = "off", None, None
            self.close()
            self._set_output_screen(output, None)
            return
        found = self.system.screens()
        screens = distinct(found)
        self.count = len(screens)
        layout = tuple(sorted(f"{s.id}@{s.left},{s.top},{s.right},{s.bottom}" for s in screens))
        if layout != self._layout:
            if self._layout:
                log.info("the screens changed: %s", ", ".join(s.describe() for s in screens) or "none")
            self._layout = layout
            self._tries = 0
            self._moved_output = False
        if len(screens) < 2:
            # Only the projector: everything exactly as without this feature.
            mirrored = len(found) > len(screens) or self.system.mirrored()
            self.state = "duplicate" if mirrored else "one"
            self.projector = screens[0] if screens else None
            self.second = None
            self.close()
            self._set_output_screen(output, None)
            return

        by_source = {s.source: s for s in screens}
        output_on = by_source.get(self.system.window_screen(output_pids(output)) or "")
        projector = next((s for s in screens if s.id == self.config.data.get("projector_screen")), None)
        if self._swap:
            self._swap = False
            current = projector or output_on
            other = next((s for s in screens if current is None or s.id != current.id), None)
            if other is not None:
                log.info("swapping the screens: the projector is %s now", other.describe())
                self.config["projector_screen"] = other.id
                self._set_output_screen(output, other)
                output.restart()
                self.close()
                self._tries = 0
                self._moved_output = True
                self.state = "waiting"
                return
        if projector is None:
            if output_on is None or not output.running:
                self.state = "waiting"
                return
            # The screen the output is on now is the projector.
            projector = output_on
            log.info("the projector is the %s screen; the status screen goes on the other one",
                     projector.describe())
            self.config["projector_screen"] = projector.id
        self._set_output_screen(output, projector)

        if output_on is not None and output_on.id != projector.id and settled(output, now):
            if not self._moved_output:
                # Windows put the output on the other screen (a screen was
                # unplugged and came back): put it back on the projector.
                log.warning("the output window is on the %s screen, not the projector; moving it back",
                            output_on.describe())
                self._moved_output = True
                self.close()
                output.restart()
                self.state = "waiting"
                return
            # It stays there: that screen is the projector after all.
            log.warning("the output window stays on the %s screen: taking it as the projector",
                        output_on.describe())
            projector = output_on
            self.config["projector_screen"] = projector.id
            self._set_output_screen(output, projector)
            self.close()

        second = next((s for s in screens if s.id != projector.id), None)
        self.projector, self.second = projector, second
        if second is None or server is None:
            self.state = "waiting"
            return
        url = f"{server}/player/screen#{urlencode(self.identity)}"

        if self._shown_on == second.id and self.window.url == url and self.window.running:
            if now - self._opened_at >= SETTLE_SECONDS:
                landed = by_source.get(self.system.window_screen(output_pids(self.window)) or "")
                if landed is not None and landed.id == projector.id:
                    log.warning("the status window opened on the projector; closing it")
                    self.close()
                elif landed is not None:
                    self._tries = 0
            if self._shown_on:
                self.state = "on"
                return
        if self._tries >= MAX_TRIES:
            self.state = "failed"
            self.close()
            return
        self.close()
        self.window.url = url
        self.window.extra = self.base_args + second.placement()
        log.info("opening the status screen on the %s screen", second.describe(projector))
        self.window.restart()
        self._shown_on = second.id
        self._opened_at = now
        self._tries += 1
        self.state = "on"


def output_pids(window) -> set[int]:
    """The browser processes that may own this kiosk's window."""
    pids = set()
    if window.process is not None:
        pids.add(window.process.pid)
    if not pids:
        from kiosk import browsers_on

        pids = {process.pid for process in browsers_on(window.profile)}
    return pids


def settled(window, now: float) -> bool:
    """The window has been open long enough to have found its screen."""
    started = getattr(window, "_started_at", 0.0)
    return started == 0.0 or now - started >= SETTLE_SECONDS
