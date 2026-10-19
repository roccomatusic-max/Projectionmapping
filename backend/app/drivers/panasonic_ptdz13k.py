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
    #: Model-specific capabilities appended to the common manifest.
    EXTRA_CAPABILITIES: tuple[Capability, ...] = ()
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
            # --- lens, split by confidence ---
            Capability("lens.calibrate", CapabilityKind.ACTION, DOC,
                       "Lens calibration (VXX:LNSI0)", disruptive=True, idempotent=False),
            Capability("lens.home", CapabilityKind.ACTION, DOC,
                       "Lens home position (VXX:LNSI1)", disruptive=True, idempotent=False),
        ]
        caps += [
            Capability(name, CapabilityKind.ACTION, FAM,
                       f"Jog {name.split('.')[-1].replace('_', ' ')} (VXX:LNSI{axis})",
                       disruptive=True, idempotent=False, caveat=LENS_CAVEAT)
            for name, axis in LENS_AXES.items()
        ]
        caps += [
            Capability("lens.memory", CapabilityKind.ACTION, FAM,
                       "Lens memory recall — NOT IMPLEMENTED",
                       caveat="No lens-memory command could be confirmed for this model. "
                              "This capability is declared so the UI can say so explicitly."),
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

    async def get_errors(self) -> CommandResult:
        """Error/health status for a PT-DZ13K.

        Panasonic's protocol has no single equivalent of PJLink's ``%1ERST``
        that could be confirmed for this series, so this driver does not
        pretend to have one. Health severity for Panasonic-only devices is
        derived from lamp status plus communication history; pair the device
        with PJLink (port 4352) to get true per-subsystem error reporting.
        """
        return CommandResult(
            capability="errors.get", outcome=CommandOutcome.UNSUPPORTED,
            error=(
                "No per-subsystem error query is confirmed for the PT-DZ13K LAN protocol. "
                "Enable the PJLink transport on this device for %1ERST fan/lamp/temperature/"
                "cover/filter reporting."
            ),
        )

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
            return status
        if power.outcome is CommandOutcome.AUTH_FAILED:
            status.online = False
            status.errors.append("authentication failed")
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
            errors = await self.get_errors()
            status.error_status = self._telemetry_from(errors)

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
        status.temperature = TelemetryValue.unsupported(
            "No numeric temperature query is confirmed for this model. Pair with PJLink "
            "for %1ERST temperature severity, or use enclosure sensors."
        )
        status.fan = TelemetryValue.unsupported(
            "No numeric fan query is confirmed for this model. Pair with PJLink for "
            "%1ERST fan severity."
        )
        status.health = self._derive_health(status)
        return status

    @staticmethod
    def _derive_health(status: ProjectorStatus) -> HealthSeverity:
        """Health for a Panasonic-only device.

        Honest and narrow: without %1ERST there is no subsystem reporting, so
        this reflects communication and lamp state only. The UI says as much
        rather than implying a clean bill of health.
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
        if capability.startswith("lens."):
            if capability == "lens.memory":
                return CommandResult(
                    capability=capability, outcome=CommandOutcome.UNSUPPORTED,
                    error="Lens memory is not implemented: no command for it could be "
                          "confirmed for the PT-DZ13K series.",
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
