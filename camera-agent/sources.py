"""Cameras the agent can read: an Intel RealSense, or any webcam.

A RealSense gives colour and depth, aligned so a depth pixel and a colour
pixel look at the same spot; calibration uses the colour picture, people
tracking the depth. A webcam gives colour only, which is enough for
calibration.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class Frame:
    #: BGR, uint8, height × width × 3.
    color: np.ndarray
    #: Metres, float32, same size as ``color``; None without a depth sensor.
    depth: np.ndarray | None = None


class Source:
    name = "camera"
    has_depth = False

    def read(self) -> Frame:
        raise NotImplementedError

    def fresh(self) -> Frame:
        """A frame taken after this call, not one waiting in a buffer."""
        return self.read()

    def lock_exposure(self, locked: bool) -> None:
        """Hold exposure still while patterns flash, so stripes compare fairly."""

    def close(self) -> None:
        pass


class RealSenseSource(Source):
    has_depth = True

    def __init__(self, width: int = 1280, height: int = 720, fps: int = 30) -> None:
        import pyrealsense2 as rs  # optional dependency

        self._rs = rs
        self.pipeline = rs.pipeline()
        config = rs.config()
        config.enable_stream(rs.stream.color, width, height, rs.format.bgr8, fps)
        config.enable_stream(rs.stream.depth, 848, 480, rs.format.z16, fps)
        profile = self.pipeline.start(config)
        device = profile.get_device()
        self.name = f"{device.get_info(rs.camera_info.name)}"
        self.depth_scale = device.first_depth_sensor().get_depth_scale()
        self.align = rs.align(rs.stream.color)
        self.color_sensor = next(
            (s for s in device.query_sensors() if s.get_info(rs.camera_info.name) == "RGB Camera"),
            None,
        )
        for _ in range(15):  # let auto exposure settle
            self.pipeline.wait_for_frames()

    def read(self) -> Frame:
        frames = self.align.process(self.pipeline.wait_for_frames())
        color = np.asanyarray(frames.get_color_frame().get_data()).copy()
        depth = np.asanyarray(frames.get_depth_frame().get_data()).astype(np.float32) * self.depth_scale
        return Frame(color=color, depth=depth)

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


class WebcamSource(Source):
    def __init__(self, index: int = 0, width: int = 1280, height: int = 720) -> None:
        self.capture = cv2.VideoCapture(index)
        if not self.capture.isOpened():
            raise RuntimeError(f"no camera at index {index}")
        self.capture.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self.capture.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        self.capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.name = f"webcam {index}"
        for _ in range(10):
            self.capture.read()

    def read(self) -> Frame:
        ok, color = self.capture.read()
        if not ok:
            raise RuntimeError("the camera stopped sending pictures")
        return Frame(color=color)

    def fresh(self) -> Frame:
        # Most drivers buffer a few frames regardless of BUFFERSIZE.
        deadline = time.monotonic() + 0.3
        while time.monotonic() < deadline:
            self.capture.grab()
        return self.read()

    def lock_exposure(self, locked: bool) -> None:
        # Values differ by platform and driver; best effort.
        self.capture.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.25 if locked else 0.75)

    def close(self) -> None:
        self.capture.release()


def open_source(spec: str) -> Source:
    """``auto`` (RealSense if one is plugged in, else the first webcam),
    ``realsense``, or ``webcam:N``."""
    if spec in ("auto", "realsense"):
        try:
            return RealSenseSource()
        except Exception as exc:  # noqa: BLE001 - no SDK, no device, busy device
            if spec == "realsense":
                raise RuntimeError(f"could not open the RealSense: {exc}") from exc
    index = int(spec.split(":", 1)[1]) if spec.startswith("webcam:") else 0
    return WebcamSource(index)
