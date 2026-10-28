"""Keeping the mini PC on 24/7: the power plan, the lock, Windows Update."""

from __future__ import annotations

import subprocess
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import minipc  # noqa: E402
import stayawake  # noqa: E402

QUERY = """Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)
  GUID Alias: SCHEME_BALANCED
  Subgroup GUID: 238c9fa8-0aad-41ed-83f4-97be242c8f20  (Sleep)
    GUID Alias: SUB_SLEEP
    Power Setting GUID: 29f6c1db-86da-48c5-9fdb-f2b67b1f44da  (Sleep after)
      GUID Alias: STANDBYIDLE
      Minimum Possible Setting: 0x00000000
      Maximum Possible Setting: 0xffffffff
      Possible Settings increment: 0x00000001
      Possible Settings units: Seconds
    Current AC Power Setting Index: 0x{ac:08x}
    Current DC Power Setting Index: 0x{dc:08x}
"""


def test_reads_the_current_values_not_the_limits():
    assert stayawake.parse_query(QUERY.format(ac=1800, dc=900)) == (1800, 900)
    assert stayawake.parse_query(QUERY.format(ac=0, dc=0)) == (0, 0)
    # Another language: only the numbers are read.
    german = QUERY.replace("Current AC Power Setting Index", "Aktueller Wechselstrom-Einstellungsindex")
    assert stayawake.parse_query(german.format(ac=600, dc=0)) == (600, 0)
    assert stayawake.parse_query("") is None
    assert stayawake.parse_query("Invalid Parameters -- try \"/?\" for help") is None


class FakePowercfg:
    """powercfg with a power plan that sleeps, and maybe refuses changes."""

    def __init__(self, *, obeys: bool = True) -> None:
        self.obeys = obeys
        self.values = {"standby-timeout": [1800, 900], "hibernate-timeout": [10800, 10800],
                       "monitor-timeout": [600, 300], "disk-timeout": [1200, 600]}
        self.changes: list[list[str]] = []

    def __call__(self, command, **_kwargs):
        assert command[0] == "powercfg"
        args = command[1:]
        if args[0] == "/query":
            name = next(n for n, _, setting, _ in stayawake.TIMEOUTS if setting == args[3])
            ac, dc = self.values[name]
            return subprocess.CompletedProcess(command, 0, QUERY.format(ac=ac, dc=dc), "")
        assert args[0] == "/change" and args[2] == "0"
        self.changes.append(args)
        if not self.obeys:
            return subprocess.CompletedProcess(command, 1, "", "Access denied.")
        name, side = args[1].rsplit("-", 1)
        self.values[name][0 if side == "ac" else 1] = 0
        return subprocess.CompletedProcess(command, 0, "", "")


def test_sets_sleep_hibernate_screen_and_disk_to_never(monkeypatch):
    fake = FakePowercfg()
    monkeypatch.setattr(stayawake.subprocess, "run", fake)
    assert stayawake._never_on_power_plan() == []
    assert all(value == [0, 0] for value in fake.values.values())
    assert ["/change", "standby-timeout-ac", "0"] in fake.changes
    assert ["/change", "monitor-timeout-dc", "0"] in fake.changes

    # Already right: nothing is changed again at the next hourly check.
    fake.changes.clear()
    assert stayawake._never_on_power_plan() == []
    assert fake.changes == []


def test_says_what_windows_would_not_let_it_change(monkeypatch):
    fake = FakePowercfg(obeys=False)
    fake.values["disk-timeout"] = [0, 0]
    monkeypatch.setattr(stayawake.subprocess, "run", fake)
    assert stayawake._never_on_power_plan() == ["sleep", "hibernate", "turn the screen off"]


def test_powercfg_missing_is_not_a_crash(monkeypatch):
    def missing(*_args, **_kwargs):
        raise FileNotFoundError("powercfg")

    monkeypatch.setattr(stayawake.subprocess, "run", missing)
    assert stayawake.timeouts() == {name: None for name, *_ in stayawake.TIMEOUTS}


def test_warns_when_windows_update_may_restart_in_the_evening():
    # Windows' usual active hours, 8 AM to 5 PM: evenings are fair game.
    warning = stayawake.update_restart_hours(8, 17)
    assert warning and "between 5 PM and 8 AM" in warning and "Active hours" in warning
    # What the warning asks for covers the evening, so it goes away.
    assert stayawake.update_restart_hours(12, 6) is None
    assert stayawake.update_restart_hours(15, 3) is None
    assert stayawake.update_restart_hours(16, 0) is None
    assert stayawake.update_restart_hours(17, 8) is not None  # 4 PM is not covered
    assert stayawake.clock(0) == "midnight" and stayawake.clock(12) == "noon"
    assert stayawake.clock(18) == "6 PM" and stayawake.clock(6) == "6 AM"


def test_nothing_to_do_away_from_windows(monkeypatch):
    monkeypatch.setattr(stayawake.sys, "platform", "darwin")
    assert stayawake.refresh() == []


def test_the_app_checks_at_start_and_tells_the_server(tmp_path, monkeypatch):
    app = minipc.MiniPC(minipc.Config(tmp_path / "config.json"), tmp_path)
    assert app.awake is None
    checked = threading.Event()

    def refresh():
        checked.set()
        app.stopping.set()  # one round is enough here
        return ["Windows Update may restart this computer between 5 PM and 8 AM."]

    monkeypatch.setattr(minipc.stayawake, "refresh", refresh)
    app.stay_on()
    assert checked.is_set()
    assert app.awake == ["Windows Update may restart this computer between 5 PM and 8 AM."]

    app.server = "http://10.0.0.5:8765"
    sent = []

    class Reply:
        status_code = 200

        @staticmethod
        def json():
            return {"commands": []}

    monkeypatch.setattr(minipc.requests, "post", lambda url, json, timeout: sent.append(json) or Reply())
    monkeypatch.setattr(minipc, "network_card", lambda _address: None)
    app.check_in()
    assert sent[0]["awake"] == app.awake


def test_a_failed_check_keeps_the_app_running(tmp_path, monkeypatch):
    app = minipc.MiniPC(minipc.Config(tmp_path / "config.json"), tmp_path)

    def broken():
        app.stopping.set()
        raise OSError("no registry")

    monkeypatch.setattr(minipc.stayawake, "refresh", broken)
    app.stay_on()
    assert app.awake is None
