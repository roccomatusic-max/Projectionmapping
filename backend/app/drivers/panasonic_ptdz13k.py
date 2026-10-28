"""Panasonic PT-DZ13K series driver.

Covers PT-DZ13K / PT-DS12K / PT-DW11K / PT-DZ10K, which share a control
command specification.

Every mnemonic here is cross-referenced to docs/PROTOCOL-RESEARCH.md and
carries a :class:`Provenance`. Capabilities whose provenance is
``INFERRED_FAMILY`` are refused by :meth:`ProjectorDriver._gate` unless the
device record sets ``allow_unverified_commands`` — see §2.6 of that document
for why motorised lens movement in particular is opt-in.
"""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Mapping
from typing import Any

from .base import (
    Capability,
    CapabilityKind,
    CapabilityManifest,
    CommandOutcome,
    CommandResult,
    ConnectionConfig,
    HealthSeverity,
    PowerState,
    ProjectorStatus,
    Provenance,
    ShutterState,
    TelemetryValue,
    enum_param,
)
from .panasonic_ntcontrol import PanasonicNTControlDriver
from .pjlink import PJLinkDriver
from .transport import AuthenticationError, TransportError

log = logging.getLogger(__name__)

DOC = Provenance.VERIFIED_DOC
FAM = Provenance.INFERRED_FAMILY

#: Input vocabulary confirmed for the DZ13K series. ``IIS:<code>``.
#: SD1/SD2 depend on an installed input board; the projector answers ER401
#: when absent, and we retract the capability for that unit when it does.
INPUTS: dict[str, str] = {
    "RG1": "RGB1",
    "RG2": "RGB2",
    "VID": "VIDEO",
    "DVI": "DVI-D",
    "HD1": "HDMI",
    "SD1": "SDI 1",
    "SD2": "SDI 2",
}

#: Number of lamps on a PT-DZ13K. Q$L takes a 1-based lamp index.
LAMP_COUNT = 4

#: Standard Panasonic ``IIS`` vocabulary, for other models to pick from.
PANASONIC_INPUT_LABELS: dict[str, str] = {
    "RG1": "RGB1", "RG2": "RGB2", "VID": "VIDEO", "SVD": "S-VIDEO", "DVI": "DVI-D",
    "HD1": "HDMI", "SD1": "SDI 1", "SD2": "SDI 2", "DL1": "DIGITAL LINK",
}

#: Shutter polarity. OSH:1 CLOSES the shutter. This mapping exists exactly
#: once in the codebase so the inversion cannot drift.
_SHUTTER_TO_PARAM = {ShutterState.OPEN: "0", ShutterState.CLOSED: "1"}
_PARAM_TO_SHUTTER = {"0": ShutterState.OPEN, "1": ShutterState.CLOSED}

_POWER_TO_STATE = {"000": PowerState.OFF, "001": PowerState.ON,
                   "0": PowerState.OFF, "1": PowerState.ON}

#: Q$S lamp-control status. The response layout could not be confirmed from
#: the documentation available offline (PROTOCOL-RESEARCH.md §2.5). Values we
#: do not recognise are reported as raw text rather than guessed at. Extend
#: this map once you have read the real responses off a unit — the procedure
#: is in docs/HARDWARE-VALIDATION.md.
PANASONIC_LAMP_STATUS_MAP: dict[str, str] = {
    "0": "standby",
    "1": "lamp on control",
    "2": "lamp on",
    "3": "cooling",
}

#: ``QTM:<n>`` temperature sensors as (parameter, key, label). The query is
#: in Panasonic's command lists for sibling 3-chip models (PT-D7700/D3500:
#: 0 input air, 1 output air, 2 optical module) and is used the same way on
#: current laser models; see PROTOCOL-RESEARCH.md §2.7. A sensor this unit
#: does not have answers ER401 and is not asked for again.
TEMPERATURE_SENSORS: tuple[tuple[str, str, str], ...] = (
    ("0", "intake", "Intake air"),
    ("1", "exhaust", "Exhaust air"),
    ("2", "optics", "Optics module"),
)

#: ``QTM`` answers Celsius then Fahrenheit, four characters each
#: (``0025/0077``). Signs, decimals and unit letters are tolerated.
_TEMPERATURE_REPLY = re.compile(
    r"^\s*([+-]?\d+(?:\.\d+)?)\s*(?:°?\s*C)?\s*/\s*([+-]?\d+(?:\.\d+)?)\s*(?:°?\s*F)?\s*$",
    re.IGNORECASE,
)


def parse_temperature(raw: str) -> tuple[float, float] | None:
    """``"0025/0077"`` → ``(25.0, 77.0)``; None for anything else.

    The two halves must agree (F = C × 9/5 + 32, within rounding). That is
    what proves the reply was read the right way round: a reply that does
    not add up is shown raw rather than as a wrong number.
    """
    match = _TEMPERATURE_REPLY.match(raw)
    if not match:
        return None
    celsius, fahrenheit = float(match.group(1)), float(match.group(2))
    if not -40.0 <= celsius <= 150.0:
        return None
    if abs(celsius * 9 / 5 + 32 - fahrenheit) > 2.0:
        return None
    return celsius, fahrenheit


def _number(value: float) -> int | float:
    return int(value) if value.is_integer() else round(value, 1)


#: Remote-key emulation. The mnemonics appear in the DZ13K series document's
#: contents; the exact parameter encoding was taken from sibling models, so
#: these are gated. They move an OSD cursor, so the risk is low, but the
#: platform does not get to decide that on the operator's behalf.
REMOTE_KEYS: dict[str, str] = {
    "menu": "OMN",
    "enter": "OEN",
    "back": "OBK",
    "up": "OCU",
    "down": "OCD",
    "left": "OCL",
    "right": "OCR",
}

#: VXX:LNSI<n> lens group. 0 and 1 are confirmed for this series; the axis
#: numbers come from the PT-DZ780 specification.
LENS_AXES: dict[str, str] = {
    "lens.shift_h": "2",
    "lens.shift_v": "3",
    "lens.focus": "4",
    "lens.zoom": "5",
}

LENS_CAVEAT = (
    "Lens axis numbering (LNSI2-5) comes from the PT-DZ780 specification, not from "
    "a document naming the PT-DZ13K, and the parameter format this driver sends "
    "(e.g. VXX:LNSI2+0001) is unconfirmed. No explicit stop command could be "
    "confirmed either. Verify against your unit's control-command manual before "
    "enabling, and test with the projector somewhere a lens movement cannot cause harm."
)


#: What the operator is told when a refusal is about the projector's state,
#: not about the model. Panasonic answers ER401 ("cannot be executed") for
#: both, so the driver tells them apart from what it knows of the power state.
COOLING_REFUSAL = (
    "The projector is cooling down after being turned off. It will not turn on "
    "until that finishes, usually 1 to 2 minutes."
)
WARMING_REFUSAL = (
    "The projector is still starting up and will not turn off until start-up finishes."
)
STARTING_REFUSAL = "The projector is still starting up. Try again in a moment."
COOLING_STATE_REFUSAL = (
    "The projector is cooling down after being turned off. This works once it is on again."
)
STANDBY_REFUSAL = "The projector is in standby. This works once the projector is turned on."


class PanasonicPTDZ13KDriver(PanasonicNTControlDriver):
    """PT-DZ13K series, and the base for other Panasonic models.

    A new Panasonic model is a subclass that overrides the class attributes
    below (inputs, lamp count, identity) and, if it has extra commands,
    ``EXTRA_CAPABILITIES`` plus an ``execute_supported_command`` override
    that handles them and defers the rest to ``super()``. See
    :mod:`app.drivers.panasonic_ptdz770` for the pattern.
    """

    driver_id = "panasonic_pt_dz13k"
    display_name = "Panasonic PT-DZ13K series"
    default_port = 1024

    #: ``IIS`` parameter → label. Overridden per model.
    INPUTS: dict[str, str] = INPUTS
    #: Number of lamps, i.e. how many ``Q$L:<n>`` queries to issue.
    LAMP_COUNT: int = LAMP_COUNT
    #: Inputs that depend on an optional board; ER401 on one of these is a
    #: "not fitted" rather than a "not a valid input".
    OPTIONAL_INPUTS: frozenset[str] = frozenset({"SD1", "SD2"})
    #: ``QTM`` sensors to ask for. Overridden per model if needed.
    TEMPERATURE_SENSORS: tuple[tuple[str, str, str], ...] = TEMPERATURE_SENSORS
    #: Model-specific capabilities appended to the common manifest.
    EXTRA_CAPABILITIES: tuple[Capability, ...] = ()
    #: Why the lens axes are gated. Overridden per model.
    LENS_CAVEAT: str = LENS_CAVEAT
    #: What the operator is told about lens memory. Overridden per model.
    LENS_MEMORY_NOTE: str = "No lens-memory command could be confirmed for this model."
    #: After PJLink fails to answer, wait this long before trying it again.
    PJLINK_RETRY_SECONDS: float = 600.0
    #: Upper estimate of how long the projector refuses power-on after a
    #: power-off. QPW already reads standby while it cools, so this, refined
    #: by Q$S where the model answers it, is how cooling is reported at all.
    COOLDOWN_SECONDS: float = 120.0
    #: How long after power-on the projector may still refuse commands
    #: because it is starting up rather than because it lacks them.
    WARMUP_SECONDS: float = 60.0

    def __init__(self, config: ConnectionConfig) -> None:
        super().__init__(config)
        self._manifest = CapabilityManifest(self._build_capabilities())
        #: Sensors that answered ER401 while the projector was on.
        self._absent_sensors: set[str] = set()
        #: Last PJLink %1ERST reading, applied to every poll's health so a
        #: fan fault does not come and go between diagnostics polls.
        self._erst: dict[str, str] | None = None
        self._pjlink_retry_at = 0.0
        self._pjlink_note: str | None = None
        #: The last power state QPW reported, raw (cooling reads as standby).
        self._power_seen = PowerState.UNKNOWN
        #: When PON / POF was last accepted, for telling a state refusal
        #: from a missing command. Monotonic seconds.
        self._on_at: float | None = None
        self._off_at: float | None = None

    # -- power-state bookkeeping -------------------------------------------

    def _cooling(self) -> bool:
        return self._off_at is not None and time.monotonic() - self._off_at < self.COOLDOWN_SECONDS

    def _warming(self) -> bool:
        return self._on_at is not None and time.monotonic() - self._on_at < self.WARMUP_SECONDS

    async def raw_command(
        self, capability: str, command: str, *, timeout: float | None = None
    ) -> CommandResult:
        result = await super().raw_command(capability, command, timeout=timeout)
        mnemonic = command.split(":", 1)[0].upper()
        if result.outcome is CommandOutcome.ACCEPTED and mnemonic == "PON":
            self._on_at, self._off_at = time.monotonic(), None
        elif result.outcome is CommandOutcome.ACCEPTED and mnemonic == "POF":
            self._off_at, self._on_at = time.monotonic(), None
        elif mnemonic == "QPW" and result.outcome in (CommandOutcome.OK, CommandOutcome.ACCEPTED):
            self._power_seen = _POWER_TO_STATE.get(str(result.value or "").strip(),
                                                   PowerState.UNKNOWN)
        return self._explain_refusal(mnemonic, result)

    def _explain_refusal(self, mnemonic: str, result: CommandResult) -> CommandResult:
        """Turn a refusal caused by the power state into a plain BUSY.

        A real unit answers ER401 to power-on while cooling down and to most
        commands in standby. Read as UNSUPPORTED, that told the operator the
        model cannot do it, and retracted inputs and buttons for good. Only
        refusals the projector actually sent are considered, and only when
        the power state explains them; ER401 from a projector that is on and
        settled still means "not on this unit".
        """
        if result.outcome not in (CommandOutcome.UNSUPPORTED, CommandOutcome.BUSY):
            return result
        if not result.raw_response or mnemonic in ("QPW", "Q$S"):
            return result
        if mnemonic == "PON":
            if self._power_seen is PowerState.ON and not self._cooling():
                return result
            if not self._cooling():
                # Turned off from the remote or the panel: no POF of ours to
                # time from, but a refused power-on from standby is cooling.
                self._off_at = time.monotonic() - self.COOLDOWN_SECONDS + 30.0
            why = COOLING_REFUSAL
        elif mnemonic == "POF":
            if not self._warming():
                return result
            why = WARMING_REFUSAL
        elif self._cooling():
            why = COOLING_STATE_REFUSAL
        elif self._warming():
            why = STARTING_REFUSAL
        elif self._power_seen is PowerState.OFF:
            why = STANDBY_REFUSAL
        else:
            return result
        result.outcome = CommandOutcome.BUSY
        result.error = f"{why} (projector answered {result.raw_response})"
        return result

    # -- manifest ----------------------------------------------------------

    @classmethod
    def _build_capabilities(cls) -> list[Capability]:
        caps: list[Capability] = [
            # --- power, verified ---
            Capability("power.get", CapabilityKind.QUERY, DOC,
                       "Read power state (QPW). Answered in standby."),
            Capability("power.set", CapabilityKind.SET, DOC,
                       "Power on (PON) / off (POF)", params=("on", "off"),
                       disruptive=True, idempotent=False, verify_with="power.get"),
            # --- shutter, verified ---
            Capability("shutter.get", CapabilityKind.QUERY, DOC, "Read shutter state (QSH)"),
            Capability("shutter.set", CapabilityKind.SET, DOC,
                       "Shutter open (OSH:0) / closed (OSH:1)",
                       params=("open", "closed"), disruptive=True,
                       idempotent=False, verify_with="shutter.get"),
            # --- input, verified ---
            Capability("input.get", CapabilityKind.QUERY, DOC, "Read active input (QIN)"),
            Capability("input.set", CapabilityKind.SET, DOC,
                       "Select input (IIS)", params=tuple(cls.INPUTS),
                       param_labels=dict(cls.INPUTS),
                       disruptive=True, idempotent=False, verify_with="input.get"),
            # --- lamp / diagnostics, verified mnemonics ---
            Capability("lamp.hours", CapabilityKind.QUERY, DOC,
                       f"Lamp runtime per lamp (Q$L:1..{cls.LAMP_COUNT})"),
            Capability("lamp.status", CapabilityKind.QUERY, DOC,
                       "Lamp control status (Q$S)"),
            Capability("lamp.on_off", CapabilityKind.QUERY, DOC, "Per-lamp on/off (QLS)"),
            # --- condition ---
            Capability("temperature.get", CapabilityKind.QUERY, FAM,
                       "Temperature sensors in °C and °F (QTM:0 intake, QTM:1 exhaust, "
                       "QTM:2 optics module)",
                       caveat="Documented for sibling Panasonic models. A sensor this "
                              "unit lacks answers ER401 and is dropped."),
            Capability("errors.get", CapabilityKind.QUERY, Provenance.STANDARD,
                       "Fan, lamp, temperature, cover and filter condition "
                       "(PJLink %1ERST ? on port 4352)"),
            # --- lens, split by confidence ---
            Capability("lens.calibrate", CapabilityKind.ACTION, DOC,
                       "Lens calibration (VXX:LNSI0)", disruptive=True, idempotent=False),
            Capability("lens.home", CapabilityKind.ACTION, DOC,
                       "Lens home position (VXX:LNSI1)", disruptive=True, idempotent=False),
        ]
        caps += [
            Capability(name, CapabilityKind.ACTION, FAM,
                       f"Jog {name.split('.')[-1].replace('_', ' ')} (VXX:LNSI{axis})",
                       disruptive=True, idempotent=False, caveat=cls.LENS_CAVEAT)
            for name, axis in LENS_AXES.items()
        ]
        caps += [
            Capability("lens.memory", CapabilityKind.ACTION, FAM,
                       "Lens memory recall — NOT IMPLEMENTED",
                       # Declared so the UI can say so explicitly.
                       caveat=cls.LENS_MEMORY_NOTE),
            # --- image adjustments, sibling-documented ---
            Capability("image.freeze", CapabilityKind.SET, FAM, "Freeze (OFZ)",
                       params=("on", "off"), idempotent=False,
                       caveat="Mnemonic documented for sibling models; parameter format unconfirmed."),
            Capability("image.brightness", CapabilityKind.SET, FAM, "Brightness (OBR)",
                       value_range=(0, 63),
                       caveat="Mnemonic documented for sibling models; parameter format unconfirmed."),
            Capability("image.contrast", CapabilityKind.SET, FAM, "Contrast (OCS)",
                       value_range=(0, 63), caveat="Mnemonic documented for sibling models; parameter format unconfirmed."),
            Capability("image.color", CapabilityKind.SET, FAM, "Colour (OCO)",
                       value_range=(0, 63), caveat="Mnemonic documented for sibling models; parameter format unconfirmed."),
            Capability("image.tint", CapabilityKind.SET, FAM, "Tint (OTN)",
                       value_range=(0, 63), caveat="Mnemonic documented for sibling models; parameter format unconfirmed."),
            Capability("image.sharpness", CapabilityKind.SET, FAM, "Sharpness (OSP)",
                       value_range=(0, 15), caveat="Mnemonic documented for sibling models; parameter format unconfirmed."),
            Capability("osd.set", CapabilityKind.SET, FAM, "On-screen display (OSD)",
                       params=("on", "off"), caveat="Mnemonic documented for sibling models; parameter format unconfirmed."),
        ]
        caps += [
            Capability(f"remote.{key}", CapabilityKind.ACTION, FAM,
                       f"Remote key: {key} ({mnemonic})", idempotent=False,
                       caveat="Key-emulation parameters taken from sibling models. "
                              "The projector does not report OSD cursor position, so "
                              "these are fire-and-forget.")
            for key, mnemonic in REMOTE_KEYS.items()
        ]
        caps += list(cls.EXTRA_CAPABILITIES)
        return caps

    # -- power -------------------------------------------------------------

    async def get_power_state(self) -> CommandResult:
        if (gated := self._gate("power.get")) is not None:
            return gated
        result = await self.raw_command("power.get", "QPW")
        if result.outcome in (CommandOutcome.OK, CommandOutcome.ACCEPTED):
            raw = str(result.value or "").strip()
            state = _POWER_TO_STATE.get(raw, PowerState.UNKNOWN)
            if state is PowerState.UNKNOWN:
                return CommandResult(
                    capability="power.get", outcome=CommandOutcome.PARSE_ERROR,
                    raw_request=result.raw_request, raw_response=result.raw_response,
                    error=f"unrecognised QPW value {raw!r}", latency_ms=result.latency_ms,
                )
            if state is PowerState.OFF and self._cooling():
                state = await self._cooling_state()
            elif state is PowerState.OFF and self._warming():
                # Power on was accepted and the projector is still starting:
                # some units read standby until the lamp has struck. Saying
                # "off" here would let a held power off count as done.
                state = PowerState.WARMING
            result.outcome = CommandOutcome.OK
            result.value = state
        return result

    async def _cooling_state(self) -> PowerState:
        """Standby by QPW, inside the cool-down window: still cooling?

        Q$S says so directly on models that answer it (3 = lamp off in
        progress, 0 = standby). Otherwise the window decides.
        """
        if self._manifest.get("lamp.status") is not None:
            lamp = await super().raw_command("lamp.status", "Q$S")
            if lamp.outcome in (CommandOutcome.OK, CommandOutcome.ACCEPTED):
                raw = str(lamp.value or "").strip()
                if raw == "0":
                    self._off_at = None
                    return PowerState.OFF
                if raw == "3":
                    return PowerState.COOLING
        return PowerState.COOLING

    async def set_power_state(self, on: bool) -> CommandResult:
        """Issue PON/POF.

        Returns ACCEPTED, never CONFIRMED: Panasonic's own documentation says
        to confirm with QPW afterwards, and the device worker does exactly
        that. Promoting an ack to "confirmed" here would be the lie that makes
        a failed startup look like a success.
        """
        if (gated := self._gate("power.set")) is not None:
            return gated
        return await self.raw_command("power.set", "PON" if on else "POF")

    # -- shutter -----------------------------------------------------------

    async def get_shutter_state(self) -> CommandResult:
        if (gated := self._gate("shutter.get")) is not None:
            return gated
        result = await self.raw_command("shutter.get", "QSH")
        if result.outcome in (CommandOutcome.OK, CommandOutcome.ACCEPTED):
            raw = str(result.value or "").strip()
            state = _PARAM_TO_SHUTTER.get(raw)
            if state is None:
                return CommandResult(
                    capability="shutter.get", outcome=CommandOutcome.PARSE_ERROR,
                    raw_request=result.raw_request, raw_response=result.raw_response,
                    error=f"unrecognised QSH value {raw!r}", latency_ms=result.latency_ms,
                )
            result.outcome = CommandOutcome.OK
            result.value = state
        return result

    async def set_shutter(self, closed: bool) -> CommandResult:
        if (gated := self._gate("shutter.set")) is not None:
            return gated
        param = _SHUTTER_TO_PARAM[ShutterState.CLOSED if closed else ShutterState.OPEN]
        return await self.raw_command("shutter.set", f"OSH:{param}")

    # -- input -------------------------------------------------------------

    async def get_active_input(self) -> CommandResult:
        if (gated := self._gate("input.get")) is not None:
            return gated
        result = await self.raw_command("input.get", "QIN")
        if result.outcome in (CommandOutcome.OK, CommandOutcome.ACCEPTED):
            code = str(result.value or "").strip().upper()
            result.outcome = CommandOutcome.OK
            result.value = {"code": code, "label": self.INPUTS.get(code, code)}
        return result

    async def set_input(self, source: str) -> CommandResult:
        if (gated := self._gate("input.set")) is not None:
            return gated
        code = source.strip().upper()
        if code not in self.INPUTS:
            return CommandResult(
                capability="input.set", outcome=CommandOutcome.UNSUPPORTED,
                error=(
                    f"{source!r} is not an input on the {self.display_name}. "
                    f"Valid inputs: {', '.join(self.INPUTS)}"
                ),
            )
        # Already known to be absent on this unit: do not ask again.
        if not self._manifest.param_available("input.set", code):
            return CommandResult(
                capability="input.set", outcome=CommandOutcome.UNSUPPORTED,
                error=self._manifest.retracted_params[f"input.set:{code}"],
            )

        result = await self.raw_command("input.set", f"IIS:{code}")
        # ER401 on an input means that board is not fitted on *this* unit.
        # Record it against the parameter, not the command: input selection
        # as a whole still works.
        if result.outcome is CommandOutcome.UNSUPPORTED:
            why = ("the input board is likely not fitted" if code in self.OPTIONAL_INPUTS
                   else "this unit does not accept that input code")
            reason = (
                f"{self.INPUTS[code]} is not available on this unit "
                f"(projector returned ER401 — {why})"
            )
            self._manifest.retract_param("input.set", code, reason)
            result.error = reason
        return result

    # -- lamp / diagnostics -------------------------------------------------

    async def get_lamp_hours(self) -> CommandResult:
        """Read runtime for each of the four lamps.

        A per-lamp failure is recorded against that lamp rather than failing
        the whole read — a unit with one dead lamp board should still report
        the other three.
        """
        if (gated := self._gate("lamp.hours")) is not None:
            return gated
        lamps: list[dict[str, Any]] = []
        last: CommandResult | None = None
        for index in range(1, self.LAMP_COUNT + 1):
            result = await self.raw_command("lamp.hours", f"Q$L:{index}")
            last = result
            if result.outcome in (CommandOutcome.OK, CommandOutcome.ACCEPTED):
                raw = str(result.value or "").strip()
                match = re.search(r"\d+", raw)
                lamps.append({
                    "index": index,
                    "hours": int(match.group()) if match else None,
                    "raw": raw,
                    "unparsed": match is None,
                })
            elif result.outcome is CommandOutcome.UNSUPPORTED:
                # Fewer lamps than expected, or lamp index unsupported: stop.
                break
            else:
                lamps.append({"index": index, "hours": None,
                              "error": result.error or result.outcome.value})
        if not lamps:
            return last or CommandResult(
                capability="lamp.hours", outcome=CommandOutcome.UNSUPPORTED,
                error="no lamp runtime could be read",
            )
        return CommandResult(
            capability="lamp.hours", outcome=CommandOutcome.OK, value=lamps,
            raw_request=f"Q$L:1..{self.LAMP_COUNT}",
            raw_response=last.raw_response if last else None,
        )

    async def get_lamp_status(self) -> CommandResult:
        if (gated := self._gate("lamp.status")) is not None:
            return gated
        result = await self.raw_command("lamp.status", "Q$S")
        if result.outcome in (CommandOutcome.OK, CommandOutcome.ACCEPTED):
            raw = str(result.value or "").strip()
            mapped = PANASONIC_LAMP_STATUS_MAP.get(raw)
            result.outcome = CommandOutcome.OK
            # Unknown value: surface the raw string, do not invent a meaning.
            result.value = {"state": mapped, "raw": raw, "unparsed": mapped is None}
        return result

    async def get_temperatures(self, power: PowerState = PowerState.UNKNOWN) -> CommandResult:
        """Read each ``QTM`` sensor: degrees Celsius and Fahrenheit.

        ``power`` decides what an ER401 means. With the projector on, it is
        a sensor this model does not have, and it is dropped for good. In
        standby or a transition the projector may simply not be answering
        yet, so the sensor is asked again next time.
        """
        if (gated := self._gate("temperature.get")) is not None:
            return gated
        sensors: list[dict[str, Any]] = []
        last: CommandResult | None = None
        for code, key, label in self.TEMPERATURE_SENSORS:
            if key in self._absent_sensors:
                continue
            result = await self.raw_command("temperature.get", f"QTM:{code}")
            last = result
            if result.outcome in (CommandOutcome.OK, CommandOutcome.ACCEPTED):
                raw = str(result.value or "").strip()
                parsed = parse_temperature(raw)
                sensors.append({
                    "key": key,
                    "label": label,
                    "celsius": _number(parsed[0]) if parsed else None,
                    "fahrenheit": _number(parsed[1]) if parsed else None,
                    "raw": raw,
                    "unparsed": parsed is None,
                })
            elif result.outcome is CommandOutcome.UNSUPPORTED and power is PowerState.ON:
                self._absent_sensors.add(key)
            elif result.outcome in (CommandOutcome.CONNECTION_ERROR, CommandOutcome.TIMEOUT,
                                    CommandOutcome.AUTH_FAILED):
                break  # the link went; the other sensors would fail the same way
        if sensors:
            return CommandResult(
                capability="temperature.get", outcome=CommandOutcome.OK, value=sensors,
                raw_request="QTM:" + ",".join(c for c, _, _ in self.TEMPERATURE_SENSORS),
                raw_response=last.raw_response if last else None,
            )
        if len(self._absent_sensors) == len(self.TEMPERATURE_SENSORS):
            return CommandResult(
                capability="temperature.get", outcome=CommandOutcome.UNSUPPORTED,
                error="This projector does not answer Panasonic's temperature query (QTM).",
            )
        error = (last.error if last else None) or "no temperature sensor answered"
        if power is not PowerState.ON:
            when = {PowerState.OFF: "in standby", PowerState.WARMING: "warming up",
                    PowerState.COOLING: "cooling down"}.get(power, "just now")
            error = (f"The projector did not give temperatures {when} ({error}). "
                     "They are read again on the next diagnostics poll.")
        return CommandResult(
            capability="temperature.get",
            outcome=last.outcome if last else CommandOutcome.UNSUPPORTED,
            raw_request=last.raw_request if last else None,
            raw_response=last.raw_response if last else None, error=error,
        )

    async def get_errors(self) -> CommandResult:
        """Per-subsystem condition from the projector's PJLink side.

        Panasonic's own LAN protocol has no fan or per-subsystem error query
        that could be confirmed for this series, but Panasonic projectors
        also speak PJLink (port 4352), whose ``%1ERST`` reports fan, lamp,
        temperature, cover, filter and other as ok/warning/error. A short
        PJLink session is opened for this read only. The password is the
        device's PJLink password if one is saved, else its control password.
        """
        if time.monotonic() < self._pjlink_retry_at:
            return CommandResult(
                capability="errors.get", outcome=CommandOutcome.CONNECTION_ERROR,
                error=self._pjlink_note,
            )
        port = self.config.pjlink_port or PJLinkDriver.default_port
        side = PJLinkDriver(ConnectionConfig(
            host=self.config.host, port=port,
            password=self.config.pjlink_password or self.config.password,
            timeout=self.config.timeout, connect_timeout=self.config.connect_timeout,
            command_gap=0.15, persistent=False, idle_reconnect=0,
            label=f"{self.config.label} (PJLink)",
        ))
        side.yield_to = self.yield_to
        try:
            await side.connect()
            result = await side.get_errors()
        except AuthenticationError:
            result = CommandResult(
                capability="errors.get", outcome=CommandOutcome.AUTH_FAILED,
                error=("The projector's PJLink password was not accepted, so fan "
                       "condition cannot be read. Press Edit and fill in PJLink password "
                       "(leave it blank if it is the same as Control password)."),
            )
        except TransportError as exc:
            log.info("%s: PJLink side read on port %s failed: %s", self.config.label, port, exc)
            result = CommandResult(
                capability="errors.get", outcome=CommandOutcome.CONNECTION_ERROR,
                error=(f"Fan condition comes from the projector's PJLink connection, "
                       f"which did not answer on port {port}. Turn PJLink on in the "
                       "projector's NETWORK menu to see it."),
            )
        finally:
            await side.disconnect()

        if result.ok and isinstance(result.value, dict) and result.value:
            self._pjlink_retry_at = 0.0
            self._pjlink_note = None
            return result
        if result.ok:
            result = CommandResult(
                capability="errors.get", outcome=CommandOutcome.PARSE_ERROR,
                raw_request=result.raw_request, raw_response=result.raw_response,
                error=f"PJLink error status not understood: {result.raw_response!r}",
            )
        elif result.outcome not in (CommandOutcome.AUTH_FAILED,
                                    CommandOutcome.CONNECTION_ERROR):
            # Busy or a refusal: PJLink is there, so ask again next poll.
            result.error = f"PJLink did not give an error status ({result.error})"
            return result
        # Unreachable or wrong password: no use knocking every minute.
        self._pjlink_note = result.error
        self._pjlink_retry_at = time.monotonic() + self.PJLINK_RETRY_SECONDS
        return result

    # -- lens ---------------------------------------------------------------

    async def lens_action(self, capability: str, direction: int = 0, step: int = 1) -> CommandResult:
        """Jog a lens axis, or run calibrate/home.

        Movement is expressed as discrete jogs rather than press-and-hold,
        because no explicit stop command could be confirmed for this model.
        A UI that holds a motor running with no documented way to stop it is
        not something to ship against a projector on a building.
        """
        if (gated := self._gate(capability)) is not None:
            return gated
        if capability == "lens.calibrate":
            return await self.raw_command(capability, "VXX:LNSI0", timeout=30.0)
        if capability == "lens.home":
            return await self.raw_command(capability, "VXX:LNSI1", timeout=30.0)
        axis = LENS_AXES.get(capability)
        if axis is None:
            return CommandResult(
                capability=capability, outcome=CommandOutcome.UNSUPPORTED,
                error=f"{capability!r} is not a lens axis",
            )
        if direction not in (-1, 1):
            return CommandResult(
                capability=capability, outcome=CommandOutcome.REJECTED,
                error="direction must be -1 or +1",
            )
        step = max(1, min(int(step), 10))
        sign = "+" if direction > 0 else "-"
        return await self.raw_command(capability, f"VXX:LNSI{axis}{sign}{step:04d}")

    # -- remote keys ---------------------------------------------------------

    async def remote_key(self, key: str) -> CommandResult:
        capability = f"remote.{key}"
        if (gated := self._gate(capability)) is not None:
            return gated
        mnemonic = REMOTE_KEYS.get(key)
        if mnemonic is None:
            return CommandResult(
                capability=capability, outcome=CommandOutcome.UNSUPPORTED,
                error=f"{key!r} is not a mapped remote key",
            )
        return await self.raw_command(capability, mnemonic)

    # -- image ---------------------------------------------------------------

    _IMAGE_MNEMONICS = {
        "image.brightness": "OBR", "image.contrast": "OCS", "image.color": "OCO",
        "image.tint": "OTN", "image.sharpness": "OSP",
    }

    async def set_image_value(self, capability: str, value: int) -> CommandResult:
        if (gated := self._gate(capability)) is not None:
            return gated
        cap = self._manifest.get(capability)
        mnemonic = self._IMAGE_MNEMONICS.get(capability)
        if cap is None or mnemonic is None:
            return CommandResult(
                capability=capability, outcome=CommandOutcome.UNSUPPORTED,
                error=f"{capability!r} is not an image adjustment",
            )
        if cap.value_range:
            low, high = cap.value_range
            if not low <= value <= high:
                return CommandResult(
                    capability=capability, outcome=CommandOutcome.REJECTED,
                    error=f"value {value} is outside the permitted range {low}-{high}",
                )
        return await self.raw_command(capability, f"{mnemonic}:{value:03d}")

    # -- status --------------------------------------------------------------

    async def get_status(self, *, deep: bool = False) -> ProjectorStatus:
        status = ProjectorStatus()

        power = await self.get_power_state()
        if power.outcome in (CommandOutcome.CONNECTION_ERROR, CommandOutcome.TIMEOUT):
            status.online = False
            status.errors.append(power.error or "projector did not respond")
            self._erst = None
            return status
        if power.outcome is CommandOutcome.AUTH_FAILED:
            status.online = False
            status.errors.append("authentication failed")
            self._erst = None
            return status

        status.online = True
        if power.ok and isinstance(power.value, PowerState):
            status.power = power.value

        shutter = await self.get_shutter_state()
        if shutter.ok and isinstance(shutter.value, ShutterState):
            status.shutter = shutter.value

        active = await self.get_active_input()
        status.active_input = (
            TelemetryValue.available(active.value, raw=active.raw_response)
            if active.ok else self._telemetry_from(active)
        )

        if deep:
            lamp_status = await self.get_lamp_status()
            status.lamp_status = (
                TelemetryValue.available(lamp_status.value, raw=lamp_status.raw_response)
                if lamp_status.ok else self._telemetry_from(lamp_status)
            )
            lamp_hours = await self.get_lamp_hours()
            status.lamp_hours = (
                TelemetryValue.available(lamp_hours.value)
                if lamp_hours.ok else self._telemetry_from(lamp_hours)
            )
            temperatures = await self.get_temperatures(status.power)
            errors = await self.get_errors()
            self._erst = dict(errors.value) if errors.ok else None
            status.error_status = (
                TelemetryValue.available(self._erst) if self._erst is not None
                else TelemetryValue.unavailable(errors.error or errors.outcome.value)
            )
            status.temperature = self._temperature_telemetry(temperatures)
            status.fan = self._fan_telemetry(errors.error)

        # The platform does not fabricate what the protocol does not provide.
        # Model and manufacturer come from the device record the operator
        # entered, not from the projector: no query for them is confirmed.
        status.model = TelemetryValue.unsupported(
            "No model query is confirmed for the PT-DZ13K LAN protocol; the model shown "
            "is from this device's configuration."
        )
        status.manufacturer = TelemetryValue.unsupported(
            "No manufacturer query is confirmed for the PT-DZ13K LAN protocol."
        )
        status.serial_number = TelemetryValue.unsupported(
            "No serial-number query is confirmed for the PT-DZ13K LAN protocol. "
            "PJLink class 2 (%2SNUM) provides it where the projector supports class 2."
        )
        status.firmware = TelemetryValue.unsupported(
            "No firmware-version query is confirmed for the PT-DZ13K LAN protocol."
        )
        if self._erst:
            for subsystem, severity in self._erst.items():
                if severity == HealthSeverity.ERROR.value:
                    status.errors.append(f"{subsystem}: error")
                elif severity == HealthSeverity.WARNING.value:
                    status.warnings.append(f"{subsystem}: warning")
        status.health = self._derive_health(status)
        return status

    def _temperature_telemetry(self, result: CommandResult) -> TelemetryValue:
        """Sensor readings, plus the projector's own verdict when PJLink gave one."""
        if not result.ok:
            if result.outcome is CommandOutcome.UNSUPPORTED and (
                not self.supports("temperature.get")
                or len(self._absent_sensors) == len(self.TEMPERATURE_SENSORS)
            ):
                return TelemetryValue.unsupported(result.error or "not supported by this model")
            # Not answered this time (standby, busy, link trouble): not "n/a".
            return TelemetryValue.unavailable(result.error or result.outcome.value)
        value: dict[str, Any] = {"sensors": result.value}
        if self._erst and self._erst.get("temperature") != HealthSeverity.UNKNOWN.value:
            value["condition"] = self._erst.get("temperature")
        return TelemetryValue.available(value, raw=result.raw_response)

    def _fan_telemetry(self, why_not: str | None) -> TelemetryValue:
        """Fan condition. No Panasonic protocol reports fan speed, only this."""
        condition = (self._erst or {}).get("fan")
        if condition is None or condition == HealthSeverity.UNKNOWN.value:
            return TelemetryValue.unavailable(why_not or "PJLink gave no fan condition")
        reading = TelemetryValue.available({"condition": condition})
        reading.note = ("The projector checks its own fans and reports OK, warning or "
                        "fault. It does not report fan speed over the network.")
        return reading

    @staticmethod
    def _derive_health(status: ProjectorStatus) -> HealthSeverity:
        """Health for a Panasonic-only device.

        Communication, plus the PJLink %1ERST findings that :meth:`get_status`
        adds to ``errors``/``warnings``. Without PJLink there is no subsystem
        reporting, and the UI says as much rather than implying a clean bill
        of health.
        """
        if not status.online:
            return HealthSeverity.UNKNOWN
        if status.errors:
            return HealthSeverity.ERROR
        if status.warnings:
            return HealthSeverity.WARNING
        return HealthSeverity.OK

    @staticmethod
    def _telemetry_from(result: CommandResult) -> TelemetryValue:
        if result.outcome is CommandOutcome.UNSUPPORTED:
            return TelemetryValue.unsupported(result.error or "not supported by this model")
        return TelemetryValue.unavailable(result.error or result.outcome.value)

    # -- generic dispatch -----------------------------------------------------

    async def execute_supported_command(
        self, capability: str, params: Mapping[str, Any] | None = None
    ) -> CommandResult:
        params = params or {}
        if (gated := self._gate(capability)) is not None:
            return gated

        if capability == "power.set":
            state = enum_param(capability, params, "state", ("on", "off"))
            if isinstance(state, CommandResult):
                return state
            return await self.set_power_state(state == "on")
        if capability == "power.get":
            return await self.get_power_state()
        if capability == "shutter.set":
            state = enum_param(capability, params, "state", ("open", "closed"))
            if isinstance(state, CommandResult):
                return state
            return await self.set_shutter(state == "closed")
        if capability == "shutter.get":
            return await self.get_shutter_state()
        if capability == "input.set":
            return await self.set_input(str(params.get("input", "")))
        if capability == "input.get":
            return await self.get_active_input()
        if capability == "lamp.hours":
            return await self.get_lamp_hours()
        if capability == "lamp.status":
            return await self.get_lamp_status()
        if capability == "lamp.on_off":
            return await self.raw_command("lamp.on_off", "QLS")
        if capability == "errors.get":
            return await self.get_errors()
        if capability == "temperature.get":
            power = await self.get_power_state()
            return await self.get_temperatures(
                power.value if isinstance(power.value, PowerState) else PowerState.UNKNOWN
            )
        if capability.startswith("lens."):
            if capability == "lens.memory":
                return CommandResult(
                    capability=capability, outcome=CommandOutcome.UNSUPPORTED,
                    error=f"Lens memory is not available on the {self.display_name}. "
                          f"{self.LENS_MEMORY_NOTE}",
                )
            try:
                direction = int(params.get("direction", 0) or 0)
                step = int(params.get("step", 1) or 1)
            except (TypeError, ValueError):
                return CommandResult(
                    capability=capability, outcome=CommandOutcome.REJECTED,
                    error="'direction' and 'step' must be whole numbers",
                )
            return await self.lens_action(capability, direction=direction, step=step)
        if capability.startswith("remote."):
            return await self.remote_key(capability.split(".", 1)[1])
        if capability in self._IMAGE_MNEMONICS:
            # No default: a missing value used to send 0, the darkest setting.
            try:
                value = int(params["value"])
            except (KeyError, TypeError, ValueError):
                return CommandResult(
                    capability=capability, outcome=CommandOutcome.REJECTED,
                    error=f"'value' must be a whole number (got {params.get('value')!r})",
                )
            return await self.set_image_value(capability, value)
        if capability in ("image.freeze", "osd.set"):
            state = enum_param(capability, params, "state", ("on", "off"))
            if isinstance(state, CommandResult):
                return state
            mnemonic = "OFZ" if capability == "image.freeze" else "OSD"
            return await self.raw_command(capability, f"{mnemonic}:{'1' if state == 'on' else '0'}")

        return CommandResult(
            capability=capability, outcome=CommandOutcome.UNSUPPORTED,
            error=f"{capability!r} has no implementation in {self.display_name}",
        )
