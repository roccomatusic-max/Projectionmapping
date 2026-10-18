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


# -- speed of people tracking --------------------------------------------------------


class FakeSocket:
    def __init__(self, fail: bool = False) -> None:
        self.sent: list[dict] = []
        self.fail = fail

    def send(self, text: str) -> None:
        if self.fail:
            raise OSError("socket closed")
        import json

        self.sent.append(json.loads(text))


def tracking_agent(server) -> agent.Agent:
    args = agent.build_parser().parse_args(["--server", "http://x"])
    return agent.Agent(server, Fake("Depth camera", depth=True), 1, args)


def test_people_go_over_the_open_socket_with_their_age():
    server = FakeServer()
    server.server_ms = lambda monotonic: 1000.0
    worker = tracking_agent(server)
    worker.ws, worker.ws_people = FakeSocket(), True
    frame = Frame(color=np.zeros((4, 4, 3), np.uint8), captured=time.monotonic() - 0.03)
    person = SimpleNamespace(id=3, x=0.25, y=0.5, z=2.0, size=0.1)
    worker.send_people([person], frame)

    assert not server.calls, "no request when the socket takes it"
    (message,) = worker.ws.sent
    assert message["type"] == "mapping_people_report"
    body = message["payload"]
    assert body["people"] == [{"id": 3, "x": 0.25, "y": 0.5, "z": 2.0, "size": 0.1}]
    assert 25 <= body["age_ms"] < 500 and body["captured_at"] == 1000.0


def test_people_fall_back_to_a_request_and_move_to_the_colour_picture():
    server = FakeServer()
    server.server_ms = lambda monotonic: None
    worker = tracking_agent(server)
    worker.ws, worker.ws_people = FakeSocket(fail=True), True
    frame = Frame(color=np.zeros((4, 4, 3), np.uint8),
                  to_color=lambda x, y, z: (x + 0.1, y - 0.1))
    worker.send_people([SimpleNamespace(id=1, x=0.5, y=0.5, z=3.0, size=0.1)], frame)

    assert not worker.ws_people
    method, path, kwargs = server.calls[0]
    assert (method, path) == ("POST", "/mapping/cameras/me/people")
    assert kwargs["json"]["people"][0]["x"] == 0.6 and kwargs["json"]["people"][0]["y"] == 0.4
    assert "captured_at" not in kwargs["json"]


def test_server_time_of_a_moment():
    server = agent.Server("http://x")
    assert server.server_ms(time.monotonic()) is None
    server.offset_ms = 5000.0
    then = time.monotonic() - 0.1
    assert abs(server.server_ms(then) - (time.time() * 1000 - 100 + 5000)) < 20


def test_the_simulated_camera_keeps_camera_time():
    source = SimSource()
    source.read()
    started = time.monotonic()
    frames = [source.read() for _ in range(6)]
    took = time.monotonic() - started
    assert 0.15 < took < 0.4  # 30 a second
    assert all(0 <= time.monotonic() - f.captured < 0.5 for f in frames)
    assert frames[-1].captured > frames[0].captured


def test_realsense_people_land_where_align_would_put_them():
    rs = pytest.importorskip("pyrealsense2")
    depth, color = rs.intrinsics(), rs.intrinsics()
    for intr, (w, h, f) in ((depth, (848, 480, 420.0)), (color, (1280, 720, 640.0))):
        intr.width, intr.height, intr.fx, intr.fy = w, h, f, f
        intr.ppx, intr.ppy = w / 2, h / 2
        intr.model = rs.distortion.none
        intr.coeffs = [0.0] * 5
    extrinsics = rs.extrinsics()
    extrinsics.rotation = [1.0, 0, 0, 0, 1.0, 0, 0, 0, 1.0]
    extrinsics.translation = [-0.059, 0.0, 0.0]  # colour sensor 59 mm to the side

    def stream(intr):
        return SimpleNamespace(as_video_stream_profile=lambda: SimpleNamespace(
            get_intrinsics=lambda: intr, get_extrinsics_to=lambda _other: extrinsics))

    profile = SimpleNamespace(get_stream=lambda kind: stream(depth if kind == rs.stream.depth else color))
    source = sources.RealSenseSource.__new__(sources.RealSenseSource)
    source._rs = rs
    source._setup_tracking(profile)
    # Straight ahead, 3 m away: the centre of the depth picture, and in
    # colour 59 mm to the left at 640 px focal length.
    x, y = source.to_color(0.5, 0.5, 3.0)
    assert abs(x - (0.5 - 0.059 / 3.0 * 640 / 1280)) < 1e-4 and abs(y - 0.5) < 1e-4


def test_oak_frames_carry_their_real_age():
    dai = pytest.importorskip("depthai")
    import datetime

    source = sources.OakSource.__new__(sources.OakSource)
    source._dai = dai
    taken = dai.Clock.now() - datetime.timedelta(milliseconds=40)
    captured = source._captured(SimpleNamespace(getTimestamp=lambda: taken))
    assert 0.03 < time.monotonic() - captured < 0.2
    # Without timestamps, the usual delay for the camera.
    captured = source._captured(SimpleNamespace())
    assert abs(time.monotonic() - captured - source.sensor_delay) < 0.01
