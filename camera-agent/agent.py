"""Camera agent: calibrates projectors and tracks people for the mapping server.

Run it on the computer the camera is plugged into (the main server itself
is fine):

    python agent.py --server http://192.168.1.10:8765

First run prints a pairing code; approve it on the Mapping page, Players tab.
After that it starts by itself with the same identity. See README.md.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import logging
import os
import queue
import secrets
import signal
import sys
import threading
import time
from pathlib import Path

import cv2
import numpy as np
import requests

from sources import Source, open_source
from vision import Decoder, PeopleTracker, pattern_sequence

log = logging.getLogger("camera-agent")

HELLO_SECONDS = 3
REPORT_SECONDS = 5
#: Frames of the empty scene to learn before tracking.
BACKGROUND_FRAMES = 30


class Revoked(Exception):
    """The server no longer knows this camera: pair again."""


class Server:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")
        self.http = requests.Session()
        self.token: str | None = None

    @property
    def ws_url(self) -> str:
        scheme = "wss" if self.base.startswith("https") else "ws"
        return f"{scheme}://{self.base.split('://', 1)[1]}/api/ws?token={self.token}"

    def call(self, method: str, path: str, **kwargs) -> requests.Response:
        headers = kwargs.pop("headers", {})
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        response = self.http.request(method, f"{self.base}/api{path}", headers=headers,
                                     timeout=kwargs.pop("timeout", 10), **kwargs)
        if response.status_code in (401, 403) and self.token:
            raise Revoked(f"{path}: {response.status_code}")
        response.raise_for_status()
        return response


def load_identity(path: Path, name: str | None) -> dict:
    try:
        identity = json.loads(path.read_text())
        if identity.get("device_id") and identity.get("secret"):
            if name:
                identity["name"] = name
            return identity
    except (OSError, ValueError):
        pass
    device = secrets.token_hex(12)
    identity = {"device_id": f"cam-{device}", "secret": secrets.token_hex(32),
                "name": name or f"Camera {device[-4:].upper()}"}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(identity))
    os.chmod(path, 0o600)
    return identity


def pair(server: Server, identity: dict) -> int:
    """Introduce ourselves until approved; returns this camera's id."""
    server.token = None
    shown = None
    while True:
        try:
            reply = server.call("POST", "/mapping/players/hello",
                                json={**identity, "kind": "camera"}).json()
        except requests.RequestException as exc:
            log.warning("cannot reach %s (%s); retrying", server.base, exc)
            time.sleep(HELLO_SECONDS)
            continue
        if reply.get("access_token"):
            server.token = reply["access_token"]
            log.info("paired as %s", reply["name"])
            return reply["player_id"]
        if reply["code"] != shown:
            shown = reply["code"]
            bar = "=" * 44
            print(f"\n{bar}\n  Pairing code:  {shown}\n\n  Approve it on the Mapping page, Players tab.\n{bar}\n",
                  flush=True)
        time.sleep(HELLO_SECONDS)


class Agent:
    def __init__(self, server: Server, source: Source, camera_id: int, args: argparse.Namespace) -> None:
        self.server = server
        self.source = source
        self.camera_id = camera_id
        self.args = args
        self.jobs: queue.Queue[dict] = queue.Queue()
        self.activity = "idle"
        self.people_count: int | None = 0 if source.has_depth else None
        self.stopping = threading.Event()
        self.revoked = threading.Event()
        self.tracker = PeopleTracker() if source.has_depth and not args.no_tracking else None

    # -- talking to the server ---------------------------------------------------

    def report(self) -> None:
        body = {"camera": self.source.name, "depth": self.source.has_depth,
                "activity": self.activity}
        if self.people_count is not None:
            body["people"] = self.people_count
        self.server.call("POST", "/mapping/players/me", json=body)

    def heartbeat(self) -> None:
        while not self.stopping.is_set():
            try:
                self.report()
            except Revoked:
                log.warning("this camera was removed on the server")
                self.revoked.set()
                return
            except requests.RequestException as exc:
                log.warning("heartbeat failed: %s", exc)
            self.stopping.wait(REPORT_SECONDS)

    def listen(self) -> None:
        """Follow the live feed for requests addressed to this camera."""
        import websocket  # websocket-client

        def on_message(_ws, text: str) -> None:
            try:
                message = json.loads(text)
            except ValueError:
                return
            payload = message.get("payload") or {}
            if payload.get("camera_id") != self.camera_id:
                return
            if message.get("type") in ("mapping_calibrate", "mapping_camera_command"):
                self.jobs.put(message)

        while not self.stopping.is_set() and not self.revoked.is_set():
            app = websocket.WebSocketApp(self.server.ws_url, on_message=on_message)
            app.run_forever(ping_interval=20, ping_timeout=10)
            self.stopping.wait(2)

    def step(self, output_id: int, pattern: dict | None, index: int, total: int, *,
             status: str = "running", message: str = "") -> None:
        self.server.call("POST", "/mapping/calibration/step", json={
            "output_id": output_id, "pattern": pattern, "step": index, "steps": total,
            "status": status, "message": message[:300],
        })

    def send_snapshot(self) -> None:
        ok, jpeg = cv2.imencode(".jpg", self.source.fresh().color, [cv2.IMWRITE_JPEG_QUALITY, 88])
        if ok:
            self.server.call("PUT", "/mapping/cameras/me/snapshot", data=jpeg.tobytes(),
                             headers={"Content-Type": "image/jpeg"}, timeout=30)
            log.info("sent a photo")

    # -- calibration ---------------------------------------------------------------

    def calibrate(self, job: dict) -> None:
        output_id, width, height = job["output_id"], job["width"], job["height"]
        args = self.args
        sequence = pattern_sequence(width, height, args.min_stripe)
        total = len(sequence)
        decoder = Decoder(width, height, args.min_stripe, contrast=args.contrast)
        self.activity = "calibrating"
        log.info("calibrating %s (%d×%d, %d patterns)", job.get("name"), width, height, total)
        try:
            # Full white first, so auto exposure settles on the projector's
            # brightness before it is held still for the stripes.
            self.step(output_id, sequence[1], 0, total, message="Settling exposure")
            time.sleep(args.exposure_settle)
            self.source.lock_exposure(True)
            shape = None
            for index, pattern in enumerate(sequence):
                self.step(output_id, pattern, index, total, message="Reading patterns")
                time.sleep(args.settle)
                pictures = [self.source.fresh().color.astype(np.float32) for _ in range(args.average)]
                picture = np.mean(pictures, axis=0).astype(np.float32)
                shape = picture.shape
                decoder.add(pattern, picture)
            self.step(output_id, None, total, total, message="Decoding")
            height_px, width_px = shape[:2]
            cols = args.grid
            rows = max(2, round(cols * height_px / width_px))
            points = decoder.grid(cols, rows)
            seen = sum(p is not None for p in points)
            if seen < 12:
                raise RuntimeError("The camera did not see this projector's light. Check the projector "
                                   "is on with its shutter open, and that the camera points at its image.")
            self.server.call("PUT", f"/mapping/outputs/{output_id}/calibration", json={
                "camera_width": width_px, "camera_height": height_px,
                "cols": cols, "rows": rows, "points": points,
            }, timeout=30)
            self.step(output_id, None, total, total, status="done",
                      message=f"Done: found its light in {seen * 100 // len(points)}% of the photo")
            log.info("calibrated %s: %d of %d cells", job.get("name"), seen, len(points))
        except Revoked:
            raise
        except Exception as exc:  # noqa: BLE001 - report every failure to the editor
            log.exception("calibration failed")
            with contextlib.suppress(requests.RequestException):
                self.step(output_id, None, total, total, status="failed", message=str(exc))
        finally:
            self.source.lock_exposure(False)
            self.activity = "tracking" if self.tracker else "idle"

    # -- people ------------------------------------------------------------------

    def learn_background(self) -> None:
        if not self.tracker:
            return
        log.info("learning the empty scene (keep the area clear)")
        self.tracker.learn([self.source.read().depth for _ in range(BACKGROUND_FRAMES)])

    def track_once(self, had_people: bool) -> bool:
        people = self.tracker.update(self.source.read().depth)
        self.people_count = len(people)
        if people or had_people:  # one empty report, so effects fade out
            self.server.call("POST", "/mapping/cameras/me/people", json={"people": [
                {"id": p.id, "x": p.x, "y": p.y, "z": p.z, "size": p.size} for p in people[:16]
            ]}, timeout=2)
        return bool(people)

    # -- main loop -----------------------------------------------------------------

    def run(self) -> None:
        threading.Thread(target=self.heartbeat, daemon=True).start()
        threading.Thread(target=self.listen, daemon=True).start()
        try:
            self.loop()
        finally:
            self.stopping.set()

    def loop(self) -> None:
        try:
            self.send_snapshot()
        except requests.RequestException as exc:
            log.warning("could not send a photo: %s", exc)
        self.learn_background()
        self.activity = "tracking" if self.tracker else "idle"
        had_people = False
        period = 1.0 / max(1.0, self.args.rate)
        while not self.stopping.is_set():
            if self.revoked.is_set():
                raise Revoked("removed on the server")
            started = time.monotonic()
            try:
                job = self.jobs.get(timeout=0 if self.tracker else 0.5)
            except queue.Empty:
                job = None
            try:
                if job and job["type"] == "mapping_calibrate":
                    self.calibrate(job["payload"])
                elif job and job["payload"].get("command") == "snapshot":
                    self.send_snapshot()
                elif job and job["payload"].get("command") == "background":
                    self.learn_background()
                elif self.tracker:
                    had_people = self.track_once(had_people)
            except Revoked:
                raise
            except requests.RequestException as exc:
                log.warning("server request failed: %s", exc)
                self.stopping.wait(1)
            if self.tracker:
                self.stopping.wait(max(0.0, period - (time.monotonic() - started)))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--server", required=True, help="the main server, e.g. http://192.168.1.10:8765")
    parser.add_argument("--camera", default="auto", help="auto, realsense, or webcam:N (default auto)")
    parser.add_argument("--name", default=None, help="how the camera is listed (default Camera XXXX)")
    parser.add_argument("--identity", default=str(Path.home() / ".mapping-camera.json"),
                        help="where this camera's pairing identity is kept")
    parser.add_argument("--grid", type=int, default=64, help="calibration cells across the picture (default 64)")
    parser.add_argument("--settle", type=float, default=0.5,
                        help="seconds between showing a pattern and taking its picture (default 0.5)")
    parser.add_argument("--exposure-settle", type=float, default=1.5,
                        help="seconds to let exposure adjust to the projector first (default 1.5)")
    parser.add_argument("--average", type=int, default=2, help="pictures averaged per pattern (default 2)")
    parser.add_argument("--min-stripe", type=int, default=4,
                        help="finest stripe in projector pixels (default 4; raise it from far away)")
    parser.add_argument("--contrast", type=float, default=18.0,
                        help="grey levels between white and black for a lit pixel (default 18)")
    parser.add_argument("--rate", type=float, default=15.0, help="people reports per second (default 15)")
    parser.add_argument("--no-tracking", action="store_true", help="calibration only, no people tracking")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))

    identity = load_identity(Path(args.identity).expanduser(), args.name)
    server = Server(args.server)
    source = open_source(args.camera)
    log.info("camera: %s%s", source.name, " with depth" if source.has_depth else "")
    try:
        while True:
            camera_id = pair(server, identity)
            try:
                Agent(server, source, camera_id, args).run()
            except Revoked:
                log.warning("pairing again")
    except KeyboardInterrupt:
        pass
    finally:
        source.close()


if __name__ == "__main__":
    main()
