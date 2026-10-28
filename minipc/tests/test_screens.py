"""The status screen on a second monitor, with pretend screens and windows."""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import minipc  # noqa: E402
import screens  # noqa: E402
from screens import Screen, SecondScreen  # noqa: E402

PROJECTOR = Screen(id="monitor-pan", source=r"\\.\DISPLAY1", left=0, top=0, right=1920, bottom=1200,
                   primary=True)
MONITOR = Screen(id="monitor-dell", source=r"\\.\DISPLAY2", left=1920, top=0, right=3840, bottom=1080)
SERVER = "http://10.0.0.5:8765"


class FakeSystem:
    def __init__(self, *found: Screen) -> None:
        self.found = list(found)
        self.mirror = False
        #: Which screen (source) each browser's window is on, by pid.
        self.windows: dict[int, str] = {}
        self.extended = 0

    def screens(self):
        return list(self.found)

    def mirrored(self):
        return self.mirror

    def window_screen(self, pids):
        return next((self.windows[pid] for pid in pids if pid in self.windows), None)

    def extend(self):
        self.extended += 1
        return True


class FakeKiosk:
    pids = iter(range(100, 10_000))

    def __init__(self, system: FakeSystem, clock, *, opens_on: str | None = None) -> None:
        self.system = system
        self.clock = clock
        self.url = "http://127.0.0.1:47865/"
        self.extra: list[str] = ["--base"]
        self.profile = Path("profile")
        self.process = None
        self._started_at = 0.0
        self.starts: list[list[str]] = []
        #: Where its window lands when it opens: by its --window-position, or here.
        self.opens_on = opens_on

    @property
    def running(self) -> bool:
        return self.process is not None

    def restart(self) -> None:
        self.stop()
        self.process = SimpleNamespace(pid=next(self.pids))
        self._started_at = self.clock()
        self.starts.append(list(self.extra))
        source = self.opens_on
        if source is None:
            x = next((int(a.split("=")[1].split(",")[0]) for a in self.extra
                      if a.startswith("--window-position=")), 0)
            source = next(s.source for s in self.system.found if s.left <= x < s.right)
        self.system.windows[self.process.pid] = source

    def stop(self) -> None:
        if self.process is not None:
            self.system.windows.pop(self.process.pid, None)
        self.process = None


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now

    def later(self, seconds: float = screens.CHECK_SECONDS) -> None:
        self.now += seconds


def setup(tmp_path, *found: Screen, output_on: Screen | None = PROJECTOR):
    clock = Clock()
    system = FakeSystem(*found)
    config = minipc.Config(tmp_path / "config.json")
    output = FakeKiosk(system, clock, opens_on=output_on.source if output_on else None)
    output.restart()
    clock.later(screens.SETTLE_SECONDS)
    window = FakeKiosk(system, clock)
    second = SecondScreen(config, window, system, config.identity(), base_args=["--base"], clock=clock)
    return clock, system, config, output, window, second


def run(clock, second, output, times: int = 1) -> None:
    for _ in range(times):
        second.tick(output, SERVER)
        clock.later()


def test_with_only_the_projector_nothing_changes(tmp_path):
    clock, _system, config, output, window, second = setup(tmp_path, PROJECTOR)
    run(clock, second, output, 3)
    assert window.starts == [] and window.process is None
    assert output.extra == ["--base"]  # opens exactly as before, wherever Windows puts it
    assert len(output.starts) == 1  # never restarted
    assert second.report() == {"state": "one", "count": 1, "projector": "1920 × 1200", "second": None}
    assert "projector_screen" not in config.data


def test_a_monitor_beside_the_projector_gets_the_status_screen(tmp_path):
    clock, system, config, output, window, second = setup(tmp_path, PROJECTOR, MONITOR)
    run(clock, second, output)
    # The output stays where it is; the projector is the screen it is on.
    assert len(output.starts) == 1
    assert config["projector_screen"] == "monitor-pan"
    assert window.url.startswith(f"{SERVER}/player/screen#device_id=")
    assert "secret=" in window.url
    assert window.starts == [["--base", "--window-position=1920,0", "--window-size=1920,1080"]]
    assert system.windows[window.process.pid] == MONITOR.source
    # Next time the output opens, it opens on the projector.
    assert output.extra == ["--base", "--window-position=0,0", "--window-size=1920,1200"]
    report = second.report()
    assert report["state"] == "on" and report["count"] == 2
    assert report["projector"] == "1920 × 1200, on the left"
    assert report["second"] == "1920 × 1080, on the right"

    run(clock, second, output, 5)
    assert len(window.starts) == 1  # left alone once it is there
    assert second.report()["state"] == "on"


def test_unplugging_the_monitor_closes_the_status_screen(tmp_path):
    clock, system, _config, output, window, second = setup(tmp_path, PROJECTOR, MONITOR)
    run(clock, second, output)
    assert window.process is not None
    system.found = [PROJECTOR]
    run(clock, second, output)
    assert window.process is None
    assert output.extra == ["--base"]
    assert second.report()["state"] == "one"
    # Plugged back in: it comes back.
    system.found = [PROJECTOR, MONITOR]
    run(clock, second, output)
    assert window.process is not None and second.report()["state"] == "on"


def test_the_status_screen_never_stays_on_the_projector(tmp_path):
    clock, system, _config, output, window, second = setup(tmp_path, PROJECTOR, MONITOR)
    window.opens_on = PROJECTOR.source  # the browser ignores where it is told to open
    run(clock, second, output)
    assert window.process is not None
    clock.later(screens.SETTLE_SECONDS)
    run(clock, second, output)
    # Closed as soon as it is seen there, tried again, then given up.
    for _ in range(4):
        clock.later(screens.SETTLE_SECONDS)
        run(clock, second, output)
    assert len(window.starts) == screens.MAX_TRIES
    assert window.process is None
    assert second.report()["state"] == "failed"
    assert len(output.starts) == 1  # the projector's window was never touched


def test_the_output_goes_back_to_the_projector_after_windows_moved_it(tmp_path):
    clock, system, config, output, window, second = setup(tmp_path, PROJECTOR, MONITOR)
    run(clock, second, output)
    # The projector went off and came back; Windows left the output on the monitor.
    system.windows[output.process.pid] = MONITOR.source
    output.opens_on = None  # it opens where it is told
    run(clock, second, output)
    assert len(output.starts) == 2
    assert output.starts[-1] == ["--base", "--window-position=0,0", "--window-size=1920,1200"]
    assert system.windows[output.process.pid] == PROJECTOR.source
    clock.later(screens.SETTLE_SECONDS)
    run(clock, second, output)
    assert window.process is not None and system.windows[window.process.pid] == MONITOR.source
    assert config["projector_screen"] == "monitor-pan"


def test_an_output_that_will_not_move_makes_its_screen_the_projector(tmp_path):
    clock, system, config, output, window, second = setup(tmp_path, PROJECTOR, MONITOR)
    config["projector_screen"] = "monitor-dell"  # remembered wrong
    output.opens_on = PROJECTOR.source
    run(clock, second, output)  # one try at moving it
    assert len(output.starts) == 2
    clock.later(screens.SETTLE_SECONDS)
    run(clock, second, output, 3)
    assert len(output.starts) == 2  # no more
    assert config["projector_screen"] == "monitor-pan"
    assert system.windows[window.process.pid] == MONITOR.source


def test_swap_screens_from_the_players_page(tmp_path):
    clock, system, config, output, window, second = setup(tmp_path, PROJECTOR, MONITOR)
    output.opens_on = None
    run(clock, second, output)
    second.swap()
    run(clock, second, output)
    assert config["projector_screen"] == "monitor-dell"
    assert system.windows[output.process.pid] == MONITOR.source
    clock.later(screens.SETTLE_SECONDS)
    run(clock, second, output, 2)
    assert system.windows[window.process.pid] == PROJECTOR.source
    assert second.report()["state"] == "on"
    assert second.report()["projector"] == "1920 × 1080, on the right"


def test_mirrored_screens_are_reported_and_can_be_extended(tmp_path):
    clock, system, _config, output, window, second = setup(tmp_path, PROJECTOR)
    system.mirror = True
    run(clock, second, output)
    assert second.report()["state"] == "duplicate" and window.process is None
    second.extend()
    assert system.extended == 1
    # Two screens at the same place show the same picture too.
    twin = Screen(id="monitor-dell", source=r"\\.\DISPLAY2", left=0, top=0, right=1920, bottom=1200)
    system.mirror = False
    system.found = [PROJECTOR, twin]
    run(clock, second, output)
    assert second.report()["state"] == "duplicate" and window.process is None


def test_it_can_be_turned_off(tmp_path):
    clock, _system, config, output, window, second = setup(tmp_path, PROJECTOR, MONITOR)
    run(clock, second, output)
    config["second_screen"] = "off"
    run(clock, second, output)
    assert window.process is None and output.extra == ["--base"]
    assert second.report()["state"] == "off"


def test_it_waits_for_the_server_and_the_output(tmp_path):
    clock, _system, _config, output, window, second = setup(tmp_path, PROJECTOR, MONITOR)
    output.stop()
    run(clock, second, output)
    assert second.report()["state"] == "waiting" and window.process is None
    output.restart()
    second.tick(output, None)
    assert second.report()["state"] == "waiting" and window.process is None


def test_elsewhere_than_windows_there_is_nothing_to_report(tmp_path):
    config = minipc.Config(tmp_path / "config.json")
    second = SecondScreen(config, None, None, config.identity())
    second.tick(None, SERVER)
    assert second.report() is None


def test_describe_says_where_a_screen_is():
    assert MONITOR.describe(PROJECTOR) == "1920 × 1080, on the right"
    above = Screen(id="x", source="x", left=0, top=-1080, right=1920, bottom=0)
    assert above.describe(PROJECTOR) == "1920 × 1080, on top"
    assert screens.distinct([MONITOR, PROJECTOR]) == [PROJECTOR, MONITOR]
