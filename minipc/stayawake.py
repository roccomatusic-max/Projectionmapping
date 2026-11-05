"""Keep this computer on, awake and unlocked, day and night (Windows).

A mini PC beside a projector runs 24/7: a show ending only blanks its
output, the computer itself never sleeps, hibernates, turns its screen off
or locks. Two layers do that:

- while the app runs, it tells Windows the screen and the computer are in
  use (``keep_awake`` in minipc.py), which holds off sleep and the screen
  turning off whatever the settings say;
- at every start, and every hour after, it sets Windows' own settings too,
  so the computer stays on in the moments the app is not running (while
  it updates itself, say): sleep, hibernate, screen and disk "never" on
  the power plan in use, no screen saver, no Dynamic lock. Windows updates
  and people change these back, so they are checked again every hour.

None of it needs an administrator. What could not be set is said in plain
words on the Players page, with where to change it by hand. So is Windows
Update restarting the computer in the evening, which only a person can stop.
"""

from __future__ import annotations

import logging
import re
import subprocess
import sys

log = logging.getLogger("minipc.stayawake")

#: How often the settings are checked again while the app runs.
CHECK_SECONDS = 3600.0

#: (powercfg /change name, its group and setting for /query, in words).
TIMEOUTS = [
    ("standby-timeout", "SUB_SLEEP", "STANDBYIDLE", "sleep"),
    ("hibernate-timeout", "SUB_SLEEP", "HIBERNATEIDLE", "hibernate"),
    ("monitor-timeout", "SUB_VIDEO", "VIDEOIDLE", "turn the screen off"),
    ("disk-timeout", "SUB_DISK", "DISKIDLE", "turn the disk off"),
]

#: The hours a show can be on: Windows Update must not restart the computer
#: then. 4 PM to midnight.
EVENING = range(16, 24)

_HEX = re.compile(r":\s*0x([0-9a-fA-F]+)\s*$", re.MULTILINE)


def _powercfg(*args: str) -> str | None:
    """powercfg's output, or None when it failed."""
    try:
        done = subprocess.run(["powercfg", *args], capture_output=True, text=True, timeout=20,
                              check=False, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except (OSError, subprocess.SubprocessError) as exc:
        log.warning("powercfg %s: %s", " ".join(args), exc)
        return None
    if done.returncode != 0:
        log.warning("powercfg %s stopped with %s: %s", " ".join(args), done.returncode,
                    (done.stderr or done.stdout).strip()[:200])
        return None
    return done.stdout


def parse_query(text: str) -> tuple[int, int] | None:
    """(plugged in, on battery) seconds from ``powercfg /query`` for one setting.

    The last two numbers it prints are the current values; the words around
    them are in the computer's own language, so only the numbers are read.
    """
    numbers = _HEX.findall(text or "")
    if len(numbers) < 2:
        return None
    return int(numbers[-2], 16), int(numbers[-1], 16)


def timeouts() -> dict[str, tuple[int, int] | None]:
    """Each timeout on the power plan in use; None where it could not be read."""
    found: dict[str, tuple[int, int] | None] = {}
    for name, group, setting, _ in TIMEOUTS:
        found[name] = parse_query(_powercfg("/query", "SCHEME_CURRENT", group, setting) or "")
    return found


def _never_on_power_plan() -> list[str]:
    """Set every timeout to never; what is still not never, in words."""
    wrong = [name for name, value in timeouts().items() if value != (0, 0)]
    if not wrong:
        return []
    for name in wrong:
        for side in ("ac", "dc"):
            _powercfg("/change", f"{name}-{side}", "0")
    log.info("set the power plan to never %s",
             ", ".join(words for name, _, _, words in TIMEOUTS if name in wrong))
    still = timeouts()
    return [words for name, _, _, words in TIMEOUTS if name in wrong and still.get(name) != (0, 0)]


def _no_screen_saver() -> bool:
    """Screen saver off for this user; False when it could not be."""
    import ctypes
    import winreg

    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Control Panel\Desktop") as key:
            active, _ = winreg.QueryValueEx(key, "ScreenSaveActive")
    except OSError:
        active = "1"
    if str(active) == "0":
        return True
    spi_setscreensaveactive, spif_update_and_tell = 0x0011, 0x0001 | 0x0002
    if ctypes.windll.user32.SystemParametersInfoW(spi_setscreensaveactive, 0, None, spif_update_and_tell):
        log.info("turned the screen saver off")
        return True
    return False


def _no_dynamic_lock() -> bool:
    """Dynamic lock (locks when a paired phone walks away) off; False on failure."""
    import winreg

    path = r"Software\Microsoft\Windows NT\CurrentVersion\Winlogon"
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path) as key:
            value, _ = winreg.QueryValueEx(key, "EnableGoodbye")
    except OSError:
        return True  # never turned on
    if value == 0:
        return True
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, "EnableGoodbye", 0, winreg.REG_DWORD, 0)
    except OSError:
        return False
    log.info("turned Dynamic lock off")
    return True


def clock(hour: int) -> str:
    hour %= 24
    if hour == 0:
        return "midnight"
    if hour == 12:
        return "noon"
    return f"{hour % 12} {'AM' if hour < 12 else 'PM'}"


def update_restart_hours(start: int, end: int) -> str | None:
    """A warning when Windows Update may restart the computer in the evening.

    Windows Update restarts only outside "active hours", start to end.
    """
    start, end = start % 24, end % 24

    def active(hour: int) -> bool:
        return start <= hour < end if start <= end else hour >= start or hour < end

    if start == end or all(active(hour) for hour in EVENING):
        return None
    return (f"Windows Update may restart this computer between {clock(end)} and {clock(start)} "
            "to finish an update. To keep it from restarting during shows, on this mini PC: "
            "Settings > Windows Update > Advanced options > Active hours > Manually, "
            "from 12:00 PM to 6:00 AM.")


def _active_hours() -> tuple[int, int] | None:
    import winreg

    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\WindowsUpdate\UX\Settings") as key:
            start, _ = winreg.QueryValueEx(key, "ActiveHoursStart")
            end, _ = winreg.QueryValueEx(key, "ActiveHoursEnd")
    except OSError:
        return None
    return int(start), int(end)


def refresh() -> list[str]:
    """Put the settings right; what is still in the way, in plain words.

    An empty list means the computer stays on day and night.
    """
    if sys.platform != "win32":
        return []
    problems: list[str] = []
    still = _never_on_power_plan()
    if still:
        problems.append("Windows could still " + ", ".join(still) + " when nobody uses this "
                        "computer, and it would not let the app change that. On this mini PC: "
                        "Settings > System > Power > Screen and sleep (or Screen, sleep, & "
                        "hibernate timeouts) > set every one to Never.")
    if not _no_screen_saver():
        problems.append("The screen saver could not be turned off. On this mini PC: Settings > "
                        "Personalization > Lock screen > Screen saver > (None).")
    if not _no_dynamic_lock():
        problems.append("Dynamic lock could not be turned off. On this mini PC: Settings > "
                        "Accounts > Sign-in options > Dynamic lock > untick it.")
    hours = _active_hours()
    if hours is not None:
        warning = update_restart_hours(*hours)
        if warning:
            problems.append(warning)
    return problems
