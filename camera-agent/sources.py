"""Cameras the agent can read, found by themselves.

Depth cameras give colour and depth, aligned so a depth pixel and a colour
pixel look at the same spot; calibration uses the colour picture, people
tracking the depth. Supported through each maker's own SDK:

    Intel RealSense   D400 series (D415, D435, D455, D405…), L515, SR305
    Orbbec            Femto Bolt / Mega, Gemini 2 and 330 series, Astra 2…
    Luxonis OAK       OAK-D, OAK-D Lite, OAK-D Pro, OAK-D S2, PoE models

Any webcam (anything the computer itself lists as a camera) gives colour
only, which is enough for calibration. A depth camera without one of the
SDKs above usually also shows up as a webcam, so it can still calibrate.

``sim`` is a made-up building with two projectors (simcam.py), for trying
the whole flow without hardware.

``auto`` takes the first depth camera found, in the order above, then the
first webcam that sends pictures.
"""

from __future__ import annotations

import contextlib
import logging
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass, field

import cv2
import numpy as np

log = logging.getLogger("camera-agent")


@dataclass
class Frame:
    #: BGR, uint8, height × width × 3.
    color: np.ndarray
    #: Metres, float32; None without a depth sensor. The same size as
    #: ``color`` unless ``to_color`` is set.
    depth: np.ndarray | None = None
    #: When the camera took this picture (``time.monotonic()``), as near as
    #: the camera lets us know; people reports carry their age from it.
    captured: float = field(default_factory=time.monotonic)
    #: When ``depth`` is in the depth sensor's own pixels rather than lined
    #: up with ``color``: (x, y fractions, metres) in depth → (x, y) in colour.
    #: Moving the few people found is far quicker than lining up every pixel.
    to_color: Callable[[float, float, float], tuple[float, float]] | None = None


class Source:
    name = "camera"
    has_depth = False
    #: Seconds from light reaching the sensor to the frame arriving here,
    #: when the camera gives no timestamps to measure it. Estimates.
    sensor_delay = 0.0

    def read(self) -> Frame:
        raise NotImplementedError

    def fresh(self) -> Frame:
        """A frame taken after this call, not one waiting in a buffer."""
        return self.read()

    def lock_exposure(self, locked: bool) -> None:
        """Hold exposure still while patterns flash, so stripes compare fairly."""

    def show_pattern(self, output_id: int | None, pattern: dict | None, width: int = 0,
                     height: int = 0) -> None:
        """What the projectors show now. Only the simulated camera needs it."""

    def close(self) -> None:
        pass


def depth_to_color(depth: np.ndarray, color: np.ndarray) -> np.ndarray:
    """Depth in metres at the colour picture's size (SDKs align, not always resize)."""
    h, w = color.shape[:2]
    if depth.shape[:2] != (h, w):
        depth = cv2.resize(depth, (w, h), interpolation=cv2.INTER_NEAREST)
    return depth.astype(np.float32, copy=False)


# -- Intel RealSense -------------------------------------------------------------


class RealSenseSource(Source):
    has_depth = True
    sensor_delay = 0.035

    def __init__(self) -> None:
        import pyrealsense2 as rs  # optional dependency

        self._rs = rs
        self.pipeline = rs.pipeline()
        profile = None
        # The usual sizes first; then whatever the model offers (SR305 and
        # L515 have other depth sizes, a D405 its own colour).
        for color_size, depth_size in (((1280, 720), (848, 480)), (None, None)):
            config = rs.config()
            try:
                if color_size:
                    config.enable_stream(rs.stream.color, *color_size, rs.format.bgr8, 30)
                    config.enable_stream(rs.stream.depth, *depth_size, rs.format.z16, 30)
                else:
                    config.enable_stream(rs.stream.color, rs.format.bgr8, 30)
                    config.enable_stream(rs.stream.depth, rs.format.z16, 30)
                profile = self.pipeline.start(config)
                break
            except RuntimeError as exc:
                log.debug("RealSense refused %s: %s", color_size or "any size", exc)
        if profile is None:
            raise RuntimeError("the RealSense would not start its colour and depth streams")
        device = profile.get_device()
        self.name = f"{device.get_info(rs.camera_info.name)}"
        self.depth_scale = device.first_depth_sensor().get_depth_scale()
        self.align = rs.align(rs.stream.color)
        self._setup_tracking(profile)
        self.color_sensor = next(
            (s for s in device.query_sensors()
             if any(p.stream_type() == rs.stream.color for p in s.get_stream_profiles())),
            None,
        )
        for _ in range(15):  # let auto exposure settle
            self.pipeline.wait_for_frames()

    def _setup_tracking(self, profile) -> None:
        """Intrinsics and extrinsics for moving people from depth to colour pixels.

        Tracking reads the depth picture as the sensor sends it and moves
        only each person's centre onto the colour picture (where the canvas
        is marked), with the same maths the SDK's align uses on every pixel.
        That skips lining up the whole picture each frame, the slowest step
        on a small PC. Without these, frames are aligned as before.
        """
        rs = self._rs
        self.to_color = None
        try:
            depth = profile.get_stream(rs.stream.depth).as_video_stream_profile()
            color = profile.get_stream(rs.stream.color).as_video_stream_profile()
            di, ci = depth.get_intrinsics(), color.get_intrinsics()
            extrinsics = depth.get_extrinsics_to(color)
        except Exception as exc:  # noqa: BLE001 - an SDK without these: align as before
            log.debug("RealSense intrinsics unavailable: %s", exc)
            return

        def to_color(x: float, y: float, metres: float) -> tuple[float, float]:
            point = rs.rs2_deproject_pixel_to_point(di, [x * di.width, y * di.height], metres)
            point = rs.rs2_transform_point_to_point(extrinsics, point)
            u, v = rs.rs2_project_point_to_pixel(ci, point)
            return u / ci.width, v / ci.height

        self.to_color = to_color

    def _captured(self, frame) -> float:
        """When the frame was exposed, from the camera's own clock when it has one."""
        rs = self._rs
        try:
            if frame.get_frame_timestamp_domain() == rs.timestamp_domain.global_time:
                age = time.time() - frame.get_timestamp() / 1000.0
                if 0 <= age < 0.5:
                    return time.monotonic() - age
        except Exception:  # noqa: BLE001 - no metadata on this model or driver
            pass
        return time.monotonic() - self.sensor_delay

    def read(self) -> Frame:
        frames = self.pipeline.wait_for_frames()
        if self.to_color is not None:
            depth_frame = frames.get_depth_frame()
            color = np.asanyarray(frames.get_color_frame().get_data()).copy()
            depth = np.asanyarray(depth_frame.get_data()).astype(np.float32) * self.depth_scale
            return Frame(color=color, depth=depth, captured=self._captured(depth_frame),
                         to_color=self.to_color)
        captured = self._captured(frames.get_depth_frame())
        frames = self.align.process(frames)
        color = np.asanyarray(frames.get_color_frame().get_data()).copy()
        depth = np.asanyarray(frames.get_depth_frame().get_data()).astype(np.float32) * self.depth_scale
        return Frame(color=color, depth=depth_to_color(depth, color), captured=captured)

    def fresh(self) -> Frame:
        # The pipeline queues a frame or two; skip past them.
        for _ in range(2):
            self.pipeline.wait_for_frames()
        return self.read()

    def lock_exposure(self, locked: bool) -> None:
        if self.color_sensor is not None:
            option = self._rs.option.enable_auto_exposure
            if self.color_sensor.supports(option):
                self.color_sensor.set_option(option, 0 if locked else 1)

    def close(self) -> None:
        self.pipeline.stop()


def _realsense_cameras() -> list[str]:
    import pyrealsense2 as rs

    return [d.get_info(rs.camera_info.name) for d in rs.context().query_devices()]


# -- Orbbec ------------------------------------------------------------------------


def _orbbec():
    import pyorbbecsdk as ob  # optional dependency (pip package pyorbbecsdk2)

    # The SDK logs to the console and a file next to the program by default.
    for quiet in (lambda: ob.Context.set_logger_to_console(ob.OBLogLevel.NONE),
                  lambda: ob.Context.set_logger_level(ob.OBLogLevel.NONE)):
        with contextlib.suppress(Exception):
            quiet()
    return ob


def _orbbec_cameras() -> list[str]:
    ob = _orbbec()
    devices = ob.Context().query_devices()
    names = []
    for i in range(devices.get_count()):
        try:
            names.append(devices.get_name(i))
        except Exception:  # noqa: BLE001 - older SDKs have no names on the list
            names.append("Orbbec camera")
    return names


def _orbbec_bgr(frame, ob) -> np.ndarray | None:
    """An Orbbec colour frame as BGR, whatever format the camera sends."""
    w, h = frame.get_width(), frame.get_height()
    data = np.asanyarray(frame.get_data())
    fmt = frame.get_format()
    F = ob.OBFormat
    if fmt == F.RGB:
        return cv2.cvtColor(data.reshape(h, w, 3), cv2.COLOR_RGB2BGR)
    if fmt == F.BGR:
        return data.reshape(h, w, 3).copy()
    if fmt == F.MJPG:
        return cv2.imdecode(data, cv2.IMREAD_COLOR)
    if fmt == F.YUYV:
        return cv2.cvtColor(data.reshape(h, w, 2), cv2.COLOR_YUV2BGR_YUYV)
    if fmt == F.UYVY:
        return cv2.cvtColor(data.reshape(h, w, 2), cv2.COLOR_YUV2BGR_UYVY)
    if fmt == F.NV12:
        return cv2.cvtColor(data.reshape(h * 3 // 2, w), cv2.COLOR_YUV2BGR_NV12)
    if fmt == F.NV21:
        return cv2.cvtColor(data.reshape(h * 3 // 2, w), cv2.COLOR_YUV2BGR_NV21)
    if fmt == F.I420:
        return cv2.cvtColor(data.reshape(h * 3 // 2, w), cv2.COLOR_YUV2BGR_I420)
    return None


class OrbbecSource(Source):
    sensor_delay = 0.040

    def __init__(self) -> None:
        ob = self._ob = _orbbec()
        self.pipeline = ob.Pipeline()
        self.device = self.pipeline.get_device()
        name = self.device.get_device_info().get_name()
        self.name = name if name.lower().startswith("orbbec") else f"Orbbec {name}"
        config = ob.Config()
        colors = self.pipeline.get_stream_profile_list(ob.OBSensorType.COLOR_SENSOR)
        color = None
        for want in ((1280, 720, ob.OBFormat.RGB, 30), (0, 0, ob.OBFormat.RGB, 0)):
            with contextlib.suppress(Exception):
                color = colors.get_video_stream_profile(*want)
                break
        config.enable_stream(color or colors.get_default_video_stream_profile())
        try:
            depths = self.pipeline.get_stream_profile_list(ob.OBSensorType.DEPTH_SENSOR)
            config.enable_stream(depths.get_default_video_stream_profile())
            config.set_frame_aggregate_output_mode(ob.OBFrameAggregateOutputMode.FULL_FRAME_REQUIRE)
            self.has_depth = True
        except Exception:  # noqa: BLE001 - a colour-only model
            self.has_depth = False
        self.pipeline.start(config)
        self.align = ob.AlignFilter(align_to_stream=ob.OBStreamType.COLOR_STREAM) if self.has_depth else None
        for _ in range(15):
            self._frames()

    def _frames(self):
        for _ in range(30):
            frames = self.pipeline.wait_for_frames(1000)
            if frames is None:
                continue
            if self.align is not None:
                aligned = self.align.process(frames)
                if not aligned:
                    continue
                frames = aligned.as_frame_set()
            color = frames.get_color_frame()
            depth = frames.get_depth_frame() if self.has_depth else None
            if color is None or (self.has_depth and depth is None):
                continue
            return color, depth
        raise RuntimeError("the Orbbec camera stopped sending pictures")

    def read(self) -> Frame:
        while True:
            color_frame, depth_frame = self._frames()
            color = _orbbec_bgr(color_frame, self._ob)
            if color is not None:
                break
        depth = None
        if depth_frame is not None:
            raw = np.frombuffer(depth_frame.get_data(), dtype=np.uint16).reshape(
                depth_frame.get_height(), depth_frame.get_width())
            # The SDK's scale gives millimetres.
            depth = depth_to_color(raw.astype(np.float32) * (depth_frame.get_depth_scale() / 1000.0), color)
        return Frame(color=color, depth=depth, captured=time.monotonic() - self.sensor_delay)

    def fresh(self) -> Frame:
        for _ in range(2):
            self._frames()
        return self.read()

    def lock_exposure(self, locked: bool) -> None:
        P = self._ob.OBPropertyID
        for prop in (P.OB_PROP_COLOR_AUTO_EXPOSURE_BOOL, P.OB_PROP_COLOR_AUTO_WHITE_BALANCE_BOOL):
            with contextlib.suppress(Exception):
                self.device.set_bool_property(prop, not locked)

    def close(self) -> None:
        self.pipeline.stop()


# -- Luxonis OAK ---------------------------------------------------------------------


def _oak_cameras() -> list[str]:
    import depthai as dai  # optional dependency, the 2.x API

    return [f"OAK camera {getattr(d, 'name', '') or d.getMxId()}".strip()
            for d in dai.Device.getAllAvailableDevices()]


class OakSource(Source):
    sensor_delay = 0.050

    def __init__(self) -> None:
        import depthai as dai

        self._dai = dai
        self.device = dai.Device()
        try:
            features = {f.socket: f for f in self.device.getConnectedCameraFeatures()}
            S = dai.CameraBoardSocket
            colour = features.get(S.CAM_A)
            if colour is None:
                raise RuntimeError("this OAK has no colour camera")
            pipeline = dai.Pipeline()
            cam = pipeline.create(dai.node.ColorCamera)
            cam.setBoardSocket(S.CAM_A)
            if colour.height >= 1080:
                cam.setResolution(dai.ColorCameraProperties.SensorResolution.THE_1080_P)
                cam.setIspScale(2, 3)  # 1280 × 720
                size = (1280, 720)
            else:  # OAK-D Pro W and others with an 800p colour sensor
                cam.setResolution(dai.ColorCameraProperties.SensorResolution.THE_800_P)
                size = (1280, 800)
            cam.setFps(30)
            out = pipeline.create(dai.node.XLinkOut)
            out.setStreamName("rgb")
            cam.isp.link(out.input)
            control = pipeline.create(dai.node.XLinkIn)
            control.setStreamName("control")
            control.out.link(cam.inputControl)

            self.has_depth = S.CAM_B in features and S.CAM_C in features
            if self.has_depth:
                lite = any(f.sensorName.upper() == "OV7251" for f in features.values())
                mono_size = (dai.MonoCameraProperties.SensorResolution.THE_480_P if lite
                             else dai.MonoCameraProperties.SensorResolution.THE_400_P)
                stereo = pipeline.create(dai.node.StereoDepth)
                stereo.setDefaultProfilePreset(dai.node.StereoDepth.PresetMode.HIGH_DENSITY)
                stereo.setLeftRightCheck(True)
                stereo.setDepthAlign(S.CAM_A)
                stereo.setOutputSize(*size)
                for socket, target in ((S.CAM_B, stereo.left), (S.CAM_C, stereo.right)):
                    mono = pipeline.create(dai.node.MonoCamera)
                    mono.setBoardSocket(socket)
                    mono.setResolution(mono_size)
                    mono.setFps(30)
                    mono.out.link(target)
                depth_out = pipeline.create(dai.node.XLinkOut)
                depth_out.setStreamName("depth")
                stereo.depth.link(depth_out.input)

            self.device.startPipeline(pipeline)
            self.rgb = self.device.getOutputQueue("rgb", maxSize=2, blocking=False)
            self.depth = self.device.getOutputQueue("depth", maxSize=2, blocking=False) if self.has_depth else None
            self.control = self.device.getInputQueue("control")
            try:
                self.name = f"Luxonis {self.device.getDeviceName()}"
            except Exception:  # noqa: BLE001
                self.name = "Luxonis OAK"
        except Exception:
            self.device.close()
            raise
        for _ in range(15):
            self.rgb.get()

    def _captured(self, message) -> float:
        """The OAK stamps each frame on the host's steady clock: its real age."""
        try:
            age = (self._dai.Clock.now() - message.getTimestamp()).total_seconds()
            if 0 <= age < 0.5:
                return time.monotonic() - age
        except Exception:  # noqa: BLE001 - an older depthai
            pass
        return time.monotonic() - self.sensor_delay

    def read(self) -> Frame:
        message = self.rgb.get()
        color = message.getCvFrame()
        depth = None
        if self.depth is not None:
            message = self.depth.get()
            depth = depth_to_color(message.getFrame().astype(np.float32) / 1000.0, color)
        return Frame(color=color, depth=depth, captured=self._captured(message))

    def fresh(self) -> Frame:
        self.rgb.tryGetAll()
        if self.depth is not None:
            self.depth.tryGetAll()
        return self.read()

    def lock_exposure(self, locked: bool) -> None:
        ctrl = self._dai.CameraControl()
        ctrl.setAutoExposureLock(locked)
        ctrl.setAutoWhiteBalanceLock(locked)
        self.control.send(ctrl)

    def close(self) -> None:
        self.device.close()


# -- webcams ---------------------------------------------------------------------------


class WebcamSource(Source):
    sensor_delay = 0.060

    def __init__(self, index: int = 0, width: int = 1280, height: int = 720) -> None:
        self.capture = _open_capture(index)
        if self.capture is None:
            raise RuntimeError(f"no camera at index {index}")
        self.capture.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self.capture.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        self.capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.name = f"Webcam {index + 1}"
        for _ in range(10):
            self.capture.read()
        ok, picture = self.capture.read()
        if not ok or picture is None:
            self.capture.release()
            raise RuntimeError(f"the camera at index {index} sends no pictures")

    def read(self) -> Frame:
        ok, color = self.capture.read()
        if not ok:
            raise RuntimeError("the camera stopped sending pictures")
        return Frame(color=color, captured=time.monotonic() - self.sensor_delay)

    def fresh(self) -> Frame:
        # Most drivers buffer a few frames regardless of BUFFERSIZE.
        deadline = time.monotonic() + 0.3
        while time.monotonic() < deadline:
            self.capture.grab()
        return self.read()

    def lock_exposure(self, locked: bool) -> None:
        # What the values mean differs by platform and driver: best effort.
        # Holding the exposure it settled on, and the focus and white
        # balance, keeps every stripe photo comparable.
        cap = self.capture
        if locked:
            exposure = cap.get(cv2.CAP_PROP_EXPOSURE)
            cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.25)
            if exposure:
                cap.set(cv2.CAP_PROP_EXPOSURE, exposure)
            cap.set(cv2.CAP_PROP_AUTOFOCUS, 0)
            cap.set(cv2.CAP_PROP_AUTO_WB, 0)
        else:
            cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.75 if sys.platform != "win32" else 1)
            cap.set(cv2.CAP_PROP_AUTOFOCUS, 1)
            cap.set(cv2.CAP_PROP_AUTO_WB, 1)

    def close(self) -> None:
        self.capture.release()


def _open_capture(index: int) -> cv2.VideoCapture | None:
    # DirectShow opens in a second on Windows where the default can take ten.
    backends = [cv2.CAP_DSHOW, cv2.CAP_ANY] if sys.platform == "win32" else [cv2.CAP_ANY]
    for backend in backends:
        capture = cv2.VideoCapture(index, backend)
        if capture.isOpened():
            return capture
        capture.release()
    return None


def first_webcam(tries: int = 4) -> WebcamSource:
    """The first webcam that sends pictures (index 0 is not always one)."""
    last: Exception | None = None
    for index in range(tries):
        try:
            return WebcamSource(index)
        except RuntimeError as exc:
            last = exc
    raise RuntimeError(f"no camera found ({last})")


# -- finding cameras ---------------------------------------------------------------------


@dataclass(frozen=True)
class Driver:
    key: str
    maker: str
    #: Names of the cameras of this kind plugged in; raises without the SDK.
    find: Callable[[], list[str]]
    open: Callable[[], Source]


DEPTH_DRIVERS: list[Driver] = [
    Driver("realsense", "Intel RealSense", _realsense_cameras, RealSenseSource),
    Driver("orbbec", "Orbbec", _orbbec_cameras, OrbbecSource),
    Driver("oak", "Luxonis OAK", _oak_cameras, OakSource),
]


def find_depth_cameras() -> list[tuple[Driver, str]]:
    """Every depth camera plugged in that this program has an SDK for."""
    found = []
    for driver in DEPTH_DRIVERS:
        try:
            names = driver.find()
        except Exception as exc:  # noqa: BLE001 - SDK missing or broken: not this kind
            log.debug("%s: %s", driver.maker, exc)
            continue
        found += [(driver, name) for name in names]
    return found


def sdk_status() -> dict[str, str]:
    """Which depth camera SDKs this program can load, for the logs and self-check."""
    status = {}
    for driver in DEPTH_DRIVERS:
        try:
            names = driver.find()
            status[driver.key] = f"{len(names)} plugged in"
        except Exception as exc:  # noqa: BLE001
            status[driver.key] = f"unavailable ({type(exc).__name__}: {exc})"[:160]
    return status


def open_source(spec: str = "auto") -> Source:
    """``auto``, ``realsense``, ``orbbec``, ``oak``, ``webcam``, ``webcam:N`` or ``sim``."""
    if spec == "sim":
        from simcam import SimSource

        return SimSource()
    drivers = {d.key: d for d in DEPTH_DRIVERS}
    if spec in drivers:
        try:
            return drivers[spec].open()
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"could not open the {drivers[spec].maker} camera: {exc}") from exc
    if spec == "auto":
        for driver, name in find_depth_cameras():
            try:
                return driver.open()
            except Exception as exc:  # noqa: BLE001 - busy, or a USB 2 port: try the next
                log.warning("found %s but could not open it: %s", name, exc)
        return first_webcam()
    if spec == "webcam":
        return first_webcam()
    if spec.startswith("webcam:"):
        return WebcamSource(int(spec.split(":", 1)[1]))
    raise ValueError(f"unknown camera {spec!r}")
