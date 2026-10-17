"""Finding cameras, and the simulated one end to end through calibration."""

from __future__ import annotations

import sys
import time
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import agent  # noqa: E402
import sources  # noqa: E402
from simcam import SimSource  # noqa: E402
from sources import Driver, Frame, Source  # noqa: E402


class Fake(Source):
    def __init__(self, name: str, depth: bool = False) -> None:
        self.name = name
        self.has_depth = depth

    def read(self) -> Frame:
        return Frame(color=np.zeros((4, 4, 3), np.uint8))


def missing() -> list[str]:
    raise ImportError("no SDK")


def broken() -> Source:
    raise RuntimeError("busy")


@pytest.fixture
def no_webcam(monkeypatch):
    monkeypatch.setattr(sources, "first_webcam", lambda: Fake("Webcam 1"))


def test_auto_takes_a_webcam_when_no_depth_camera_is_plugged_in(monkeypatch, no_webcam):
    monkeypatch.setattr(sources, "DEPTH_DRIVERS", [
        Driver("realsense", "Intel RealSense", missing, broken),
        Driver("orbbec", "Orbbec", lambda: [], broken),
    ])
    assert sources.open_source("auto").name == "Webcam 1"


def test_auto_takes_the_first_depth_camera_that_opens(monkeypatch, no_webcam):
    monkeypatch.setattr(sources, "DEPTH_DRIVERS", [
        Driver("realsense", "Intel RealSense", lambda: ["Intel RealSense D455"], broken),
        Driver("orbbec", "Orbbec", missing, broken),
        Driver("oak", "Luxonis OAK", lambda: ["OAK camera 1844"], lambda: Fake("Luxonis OAK-D", True)),
    ])
    source = sources.open_source("auto")
    assert source.name == "Luxonis OAK-D" and source.has_depth


def test_a_named_camera_says_why_it_did_not_open(monkeypatch):
    monkeypatch.setattr(sources, "DEPTH_DRIVERS", [Driver("orbbec", "Orbbec", lambda: [], broken)])
    with pytest.raises(RuntimeError, match="Orbbec camera: busy"):
        sources.open_source("orbbec")
    with pytest.raises(ValueError):
        sources.open_source("kinect")


def test_sdk_status_names_what_is_missing(monkeypatch):
    monkeypatch.setattr(sources, "DEPTH_DRIVERS", [
        Driver("realsense", "Intel RealSense", missing, broken),
        Driver("oak", "Luxonis OAK", lambda: ["a", "b"], broken),
    ])
    status = sources.sdk_status()
    assert status["realsense"].startswith("unavailable (ImportError")
    assert status["oak"] == "2 plugged in"


def test_depth_is_brought_to_the_colour_size():
    depth = np.full((480, 848), 2.5, np.float32)
    color = np.zeros((720, 1280, 3), np.uint8)
    out = sources.depth_to_color(depth, color)
    assert out.shape == (720, 1280) and out.dtype == np.float32 and float(out[700, 1200]) == 2.5


def test_orbbec_colour_formats_become_bgr():
    F = SimpleNamespace(RGB=1, BGR=2, MJPG=3, YUYV=4, UYVY=5, NV12=6, NV21=7, I420=8)
    ob = SimpleNamespace(OBFormat=F)
    rgb = np.zeros((2, 3, 3), np.uint8)
    rgb[..., 0] = 200  # red
    frame = SimpleNamespace(get_width=lambda: 3, get_height=lambda: 2, get_format=lambda: F.RGB,
                            get_data=lambda: rgb.reshape(-1))
    bgr = sources._orbbec_bgr(frame, ob)
    assert bgr.shape == (2, 3, 3) and bgr[0, 0, 2] == 200 and bgr[0, 0, 0] == 0


class FakeServer:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict]] = []

    def call(self, method: str, path: str, **kwargs):
        self.calls.append((method, path, kwargs))
        return SimpleNamespace(json=lambda: {})


def test_the_simulated_camera_calibrates_end_to_end():
    server = FakeServer()
    source = SimSource()
    args = agent.build_parser().parse_args(
        ["--server", "http://x", "--settle", "0", "--exposure-settle", "0", "--average", "1"])
    worker = agent.Agent(server, source, 1, args)
    worker.calibrate({"output_id": 11, "name": "Left", "width": 1920, "height": 1080})

    steps = [c[2]["json"] for c in server.calls if c[1] == "/mapping/calibration/step"]
    assert steps[-1]["status"] == "done", steps[-1]
    result = next(c[2]["json"] for c in server.calls if c[1] == "/mapping/outputs/11/calibration")
    assert (result["camera_width"], result["camera_height"]) == (1280, 720)
    points = result["points"]
    seen = [(i, p) for i, p in enumerate(points) if p is not None]
    # The left projector lights about a quarter of the photo.
    assert 0.15 < len(seen) / len(points) < 0.35
    truth = source.projectors[0]
    errors = []
    for index, (px, py) in seen:
        c, r = index % result["cols"], index // result["cols"]
        x = int((c + 0.5) / result["cols"] * 1280)
        y = int((r + 0.5) / result["rows"] * 720)
        u, v = truth.u[y, x]
        errors.append(max(abs(px - u) * 1920, abs(py - v) * 1080))
    assert np.median(errors) < 3  # projector pixels
    # Back to the show afterwards.
    assert source.pattern is None


def test_live_view_sends_photos_until_it_runs_out(monkeypatch):
    server = FakeServer()
    args = agent.build_parser().parse_args(["--server", "http://x"])
    worker = agent.Agent(server, Fake("Webcam 1"), 1, args)
    worker.live_tick()
    assert not server.calls
    worker.live_until = time.monotonic() + 30
    worker.live_tick()
    worker.live_tick()  # too soon for another
    snapshots = [c for c in server.calls if c[1] == "/mapping/cameras/me/snapshot"]
    assert len(snapshots) == 1
    worker.live_until = 0
    worker.live_last = 0
    worker.live_tick()
    assert len([c for c in server.calls if c[1] == "/mapping/cameras/me/snapshot"]) == 1
