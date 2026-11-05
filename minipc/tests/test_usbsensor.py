"""The USB temperature sensor for the heater in the projector's box."""

from __future__ import annotations

import threading

import usbsensor


def test_lines_the_trinkey_prints():
    # As shipped: serial number, temperature, humidity, touch.
    assert usbsensor.parse_line("0xF1A2B3C4, 23.51, 41.20, 0\r\n") == (23.51, 41.2)
    assert usbsensor.parse_line("12345678, -3.2, 80.0, 1") == (-3.2, 80.0)
    # Adafruit's CircuitPython example: temperature, humidity.
    assert usbsensor.parse_line("4.25,55.5") == (4.25, 55.5)
    assert usbsensor.parse_line("4.25") == (4.25, None)
    for junk in ("", "# Adafruit SHT4x Trinkey Factory Test", "hello, there, you",
                 "0x1, 300, 20, 0", "Serial number: 0x1234"):
        assert usbsensor.parse_line(junk) is None, junk


def test_report_is_only_sent_while_fresh(monkeypatch):
    sensor = usbsensor.UsbSensor(threading.Event())
    assert sensor.report() is None
    assert not sensor.take("nonsense")
    assert sensor.take("0xABC, 2.444, 61.27, 0")
    assert sensor.report() == {"name": "USB sensor", "celsius": 2.44, "humidity": 61.3}
    clock = usbsensor.time.monotonic() + usbsensor.FRESH_SECONDS + 1
    monkeypatch.setattr(usbsensor.time, "monotonic", lambda: clock)
    assert sensor.report() is None


def test_the_log_names_the_ports_it_can_see(monkeypatch):
    from types import SimpleNamespace

    from serial.tools import list_ports

    ports = [SimpleNamespace(device="COM4", description="USB Serial Device", vid=0x239A, pid=0x8139),
             SimpleNamespace(device="COM1", description="Communications Port", vid=None, pid=None)]
    monkeypatch.setattr(list_ports, "comports", lambda: ports)
    text = usbsensor.describe_ports()
    assert text.startswith("COM1 (Communications Port, no USB id)")
    assert "COM4 (USB Serial Device, 239A:8139)" in text
