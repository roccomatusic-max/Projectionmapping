"""Shared simulated projector state.

Models the parts of real projector behaviour that break naive controllers:
warm-up and cool-down are not instantaneous, commands are refused during
transitions, lamp hours accumulate, and inputs that have no board fitted
answer with an error.

The API does not mark simulated devices: register them with names that
make it obvious, so no operator mistakes a reading for a real one.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum


class SimPower(str, Enum):
    STANDBY = "standby"
    WARMING = "warming"
    ON = "on"
    COOLING = "cooling"


@dataclass
class SimulatedProjector:
    name: str = "SIM-PT-DZ13K"
    model: str = "PT-DZ13K"
    manufacturer: str = "Panasonic"
    serial: str = "SIM0000001"
    firmware: str = "1.00"

    #: Real PT-DZ13K warm-up and cool-down are tens of seconds. Defaults here
    #: are compressed so tests run quickly; raise them to rehearse timing.
    warmup_seconds: float = 3.0
    cooldown_seconds: float = 3.0

    power: SimPower = SimPower.STANDBY
    shutter_closed: bool = False
    active_input: str = "DVI"
    #: Inputs with no board fitted answer ER401, like the real unit.
    fitted_inputs: set[str] = field(
        default_factory=lambda: {"RG1", "RG2", "VID", "DVI", "HD1"}
    )
    lamp_hours: list[int] = field(default_factory=lambda: [1240, 1238, 1251, 1197])
    lamp_on: list[bool] = field(default_factory=lambda: [False] * 4)

    #: PJLink %1ERST digits: fan, lamp, temperature, cover, filter, other.
    erst: list[int] = field(default_factory=lambda: [0, 0, 0, 0, 0, 0])
    #: Panasonic ``QTM:<n>`` sensors as code → (standby °C, running °C):
    #: intake air, exhaust air, optics module. Typical of a lamp projector
    #: in a 24 °C room; a sensor missing here answers ER401.
    temperature_profile: dict[str, tuple[float, float]] = field(
        default_factory=lambda: {"0": (24.0, 27.0), "1": (25.0, 41.0), "2": (25.0, 36.0)}
    )
    #: Added to every sensor, to rehearse a hot enclosure.
    temperature_offset: float = 0.0
    #: False: QTM answers ER401 unless the projector is on.
    temperatures_in_standby: bool = True
    #: Lamp select / lamp power as last commanded (LPM / OLP on dual-lamp models).
    lamp_select: str = "0"
    lamp_power: str = "0"

    @classmethod
    def dz770(cls, **overrides) -> SimulatedProjector:
        """A PT-DZ770: single-chip, two lamps, S-VIDEO instead of SDI."""
        defaults = {
            "name": "SIM-PT-DZ770", "model": "PT-DZ770",
            "fitted_inputs": {"RG1", "RG2", "VID", "SVD", "DVI", "HD1"},
            "lamp_hours": [812, 790], "lamp_on": [False, False],
        }
        defaults.update(overrides)
        return cls(**defaults)

    # -- fault injection, driven by tests and the --fault CLI flag ---------
    #: Drop the connection after this many commands (0 = never).
    drop_after: int = 0
    #: Never answer anything; exercises the controller's timeout path.
    silent: bool = False
    #: 1-based sequence numbers of commands whose reply is withheld. The
    #: command is still processed (authentication included) — distinct from
    #: ``silent``: the device DID act, the controller just never hears it.
    drop_reply_indices: set[int] = field(default_factory=set)
    #: Refuse everything with a busy error.
    busy: bool = False
    #: End the TCP session right after each reply, as some Panasonic
    #: firmware does: every command then needs a new connection, greeting
    #: and (in protect mode) digest.
    close_after_reply: bool = False
    #: Refuse shutter and input changes unless the lamp is on, as real
    #: Panasonic units do (ER401). Off by default so protocol tests can
    #: exercise those commands without a power cycle first.
    standby_refuses_controls: bool = False
    #: Require authentication.
    password: str | None = None
    username: str = "admin1"

    _transition_ends: float = 0.0
    _last_tick: float = field(default_factory=time.monotonic)
    command_count: int = 0

    # -- state machine -----------------------------------------------------

    def tick(self) -> None:
        """Advance transitions and accumulate lamp hours."""
        now = time.monotonic()
        if self.power in (SimPower.WARMING, SimPower.COOLING) and now >= self._transition_ends:
            self.power = SimPower.ON if self.power is SimPower.WARMING else SimPower.STANDBY
            self.lamp_on = [self.power is SimPower.ON] * len(self.lamp_on)
        if self.power is SimPower.ON:
            elapsed_hours = (now - self._last_tick) / 3600.0
            if elapsed_hours > 0:
                for index in range(len(self.lamp_hours)):
                    self.lamp_hours[index] += int(elapsed_hours)
        self._last_tick = now

    def power_on(self) -> bool:
        """Returns False if the command is not acceptable in this state."""
        self.tick()
        if self.power is SimPower.COOLING:
            return False  # a real projector refuses this during cool-down
        if self.power in (SimPower.ON, SimPower.WARMING):
            return True  # idempotent
        self.power = SimPower.WARMING
        self._transition_ends = time.monotonic() + self.warmup_seconds
        return True

    def power_off(self) -> bool:
        self.tick()
        if self.power is SimPower.WARMING:
            return False  # refuse until warm-up completes
        if self.power in (SimPower.STANDBY, SimPower.COOLING):
            return True
        self.power = SimPower.COOLING
        self._transition_ends = time.monotonic() + self.cooldown_seconds
        self.lamp_on = [False] * len(self.lamp_on)
        return True

    def set_input(self, code: str) -> bool:
        self.tick()
        if code not in self.fitted_inputs:
            return False
        self.active_input = code
        return True

    def set_shutter(self, closed: bool) -> None:
        self.tick()
        self.shutter_closed = closed

    def temperature(self, code: str) -> float | None:
        """Current reading of one sensor, or None if this unit lacks it.

        Running temperature while on, standby temperature in standby, and
        halfway between during warm-up and cool-down.
        """
        self.tick()
        profile = self.temperature_profile.get(code)
        if profile is None:
            return None
        cold, hot = profile
        if self.power is SimPower.ON:
            value = hot
        elif self.power is SimPower.STANDBY:
            value = cold
        else:
            value = (cold + hot) / 2
        return value + self.temperature_offset

    @property
    def is_on(self) -> bool:
        self.tick()
        return self.power is SimPower.ON

    def should_drop(self) -> bool:
        self.command_count += 1
        return bool(self.drop_after) and self.command_count > self.drop_after
