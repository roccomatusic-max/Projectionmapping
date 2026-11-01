"""A USB temperature sensor plugged into this computer, for the heater in the box.

Made for the Adafruit SHT41 / SHT45 Trinkey: a USB stick with a
temperature and humidity sensor that prints a line of text a few times a
second over its USB serial port. As shipped it prints

    serial number, temperature °C, humidity %, touch

and Adafruit's own CircuitPython example prints ``temperature, humidity``;
both are understood. It is found by Adafruit's USB vendor id, so nothing
needs setting up: plug it in (a USB extension cable can put it inside the
projector's box) and the app sends its reading to the main server with
every check-in. Unplugged, the reading stops being sent, and the server
falls back to the projector's own intake-air reading.

The board warms itself a little, so it reads a degree or two high; the
heater's on and off temperatures leave room for that.
"""

from __future__ import annotations

import logging
import threading
import time

log = logging.getLogger("minipc.sensor")

#: Adafruit's USB vendor id: Trinkeys and every other Adafruit board.
ADAFRUIT_VID = 0x239A
#: A reading older than this is not sent.
FRESH_SECONDS = 60.0
#: How often to look for the sensor while none is plugged in.
LOOK_SECONDS = 30.0


def parse_line(line: str) -> tuple[float, float | None] | None:
    """(°C, humidity %) from one line the sensor printed, or None."""
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    fields = [f.strip() for f in line.replace("\t", ",").split(",") if f.strip()]
    if len(fields) >= 3:
        fields = fields[1:3]  # serial number, temperature, humidity, touch
    try:
        values = [float(f) for f in fields[:2]]
    except ValueError:
        return None
    if not values or not -40 <= values[0] <= 125:
        return None
    humidity = values[1] if len(values) > 1 and 0 <= values[1] <= 100 else None
    return values[0], humidity


def find_port():
    """The first Adafruit board's serial port, or None."""
    try:
        from serial.tools import list_ports
    except ImportError:
        return None
    for port in sorted(list_ports.comports(), key=lambda p: p.device):
        if port.vid == ADAFRUIT_VID:
            return port
    return None


class UsbSensor(threading.Thread):
    def __init__(self, stopping: threading.Event) -> None:
        super().__init__(name="usb-sensor", daemon=True)
        self.stopping = stopping
        self.name_seen = "USB sensor"
        self._reading: tuple[float, float | None] | None = None
        self._at = 0.0
        self._lock = threading.Lock()

    def report(self) -> dict | None:
        """The newest reading for the check-in, or None when there is none."""
        with self._lock:
            if self._reading is None or time.monotonic() - self._at > FRESH_SECONDS:
                return None
            celsius, humidity = self._reading
            return {"name": self.name_seen[:64], "celsius": round(celsius, 2),
                    "humidity": None if humidity is None else round(humidity, 1)}

    def take(self, line: str) -> bool:
        parsed = parse_line(line)
        if parsed is None:
            return False
        with self._lock:
            self._reading = parsed
            self._at = time.monotonic()
        return True

    def run(self) -> None:
        try:
            import serial
        except ImportError:
            log.info("no serial support in this build; USB sensors are not read")
            return
        said_none = False
        while not self.stopping.is_set():
            port = find_port()
            if port is None:
                if not said_none:
                    # Once, so "Get the log" shows what this computer can see.
                    log.info("no USB temperature sensor plugged in; serial ports seen: %s",
                             describe_ports() or "none")
                    said_none = True
                self.stopping.wait(LOOK_SECONDS)
                continue
            said_none = False
            self.name_seen = (port.product or port.description or "USB sensor").strip()
            log.info("reading the temperature from %s on %s", self.name_seen, port.device)
            readings = 0
            ignored = 0
            try:
                with serial.Serial(port.device, 115200, timeout=2) as link:
                    # The sensor waits for this before it prints anything.
                    link.dtr = True
                    while not self.stopping.is_set():
                        raw = link.readline()
                        if not raw:
                            continue
                        line = raw.decode("utf-8", "replace")
                        if self.take(line):
                            readings += 1
                            if readings == 1:
                                log.info("first reading from %s: %s", self.name_seen, line.strip())
                        else:
                            ignored += 1
                            if ignored in (1, 20):
                                log.info("%s sent a line that is not a temperature: %r",
                                         self.name_seen, line.strip()[:80])
                        # Several lines a second: one every few seconds is plenty.
                        self.stopping.wait(2)
                        link.reset_input_buffer()
                        # What is left is the end of a line cut in half; never read that as a number.
                        link.readline()
            except (OSError, serial.SerialException) as exc:
                log.warning("lost the USB sensor on %s: %s", port.device, exc)
            self.stopping.wait(5)


def describe_ports() -> str:
    """Every serial port with its USB ids, for the log."""
    try:
        from serial.tools import list_ports
    except ImportError:
        return "no serial support in this build"
    found = []
    for port in sorted(list_ports.comports(), key=lambda p: p.device):
        ids = f"{port.vid:04X}:{port.pid:04X}" if port.vid is not None and port.pid is not None else "no USB id"
        found.append(f"{port.device} ({port.description or 'unnamed'}, {ids})")
    return ", ".join(found)
