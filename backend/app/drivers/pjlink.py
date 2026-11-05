"""PJLink driver (JBMIA Class 1, with Class 2 probed at runtime).

PJLink is the cross-vendor baseline. It is the fallback transport for the
Panasonic units and the foundation for any other manufacturer added later.

Protocol summary (see docs/PROTOCOL-RESEARCH.md §3):
  - TCP 4352.
  - On connect the projector sends ``PJLINK 0`` or ``PJLINK 1 <8 hex>``.
  - With auth, prepend ``md5_hex(random + password)`` to the first command.
  - Commands are ``%<class><CMD> <param>\\r``; replies are
    ``%<class><CMD>=<value>\\r``.
"""

from __future__ import annotations

import hashlib
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
    ProjectorDriver,
    ProjectorStatus,
    Provenance,
    ShutterState,
    TelemetryValue,
    enum_param,
)
from .transport import AuthenticationError, LineTransport, TransportError, TransportTimeout

log = logging.getLogger(__name__)

STD = Provenance.STANDARD

#: PJLink input numbering. First digit is the family, second the index.
INPUT_FAMILIES = {"1": "RGB", "2": "VIDEO", "3": "DIGITAL", "4": "STORAGE", "5": "NETWORK"}

_ERR_MAP = {
    "ERR1": (CommandOutcome.UNSUPPORTED, "undefined command"),
    "ERR2": (CommandOutcome.REJECTED, "parameter out of range"),
    "ERR3": (CommandOutcome.BUSY,
             "not accepted right now: the projector is warming up, cooling down or busy"),
    "ERR4": (CommandOutcome.DEVICE_FAULT, "projector or display failure"),
}

#: %1ERST ? returns six digits in this order.
ERST_SUBSYSTEMS = ("fan", "lamp", "temperature", "cover", "filter", "other")
ERST_SEVERITY = {"0": HealthSeverity.OK, "1": HealthSeverity.WARNING, "2": HealthSeverity.ERROR}


def pjlink_digest(random_seed: str, password: str) -> str:
    """PJLink auth digest: md5(random || password), no separator."""
    return hashlib.md5(f"{random_seed}{password}".encode("ascii")).hexdigest()


class PJLinkDriver(ProjectorDriver):
    driver_id = "pjlink"
    display_name = "PJLink (generic)"
    default_port = 4352

    def __init__(self, config: ConnectionConfig) -> None:
        super().__init__(config)
        if not config.command_gap:
            config.command_gap = 0.15
        if config.idle_reconnect is None:
            # PJLink projectors commonly close a connection idle for 30 s.
            config.idle_reconnect = 20.0
        self._transport = LineTransport(
            config.host,
            config.port or self.default_port,
            connect_timeout=config.connect_timeout,
            read_timeout=config.timeout,
        )
        self._auth_digest: str | None = None
        self._authenticated = False
        self._pjlink_class = 1
        self._manifest = CapabilityManifest(self._build_capabilities())

    # -- capability manifest ----------------------------------------------

    @staticmethod
    def _build_capabilities() -> list[Capability]:
        return [
            Capability("power.get", CapabilityKind.QUERY, STD, "Read power state (%1POWR ?)"),
            Capability(
                "power.set", CapabilityKind.SET, STD, "Power on/off (%1POWR)",
                params=("on", "off"), disruptive=True, idempotent=False,
                verify_with="power.get",
            ),
            Capability("input.get", CapabilityKind.QUERY, STD, "Read active input (%1INPT ?)"),
            Capability(
                "input.set", CapabilityKind.SET, STD, "Select input (%1INPT)",
                disruptive=True, idempotent=False, verify_with="input.get",
            ),
            Capability("input.list", CapabilityKind.QUERY, STD, "Available inputs (%1INST ?)"),
            Capability("shutter.get", CapabilityKind.QUERY, STD, "Read AV mute state (%1AVMT ?)"),
            Capability(
                "shutter.set", CapabilityKind.SET, STD, "AV mute / shutter (%1AVMT)",
                params=("open", "closed"), disruptive=True, idempotent=False,
                verify_with="shutter.get",
            ),
            Capability("errors.get", CapabilityKind.QUERY, STD, "Error status (%1ERST ?)"),
            Capability("lamp.hours", CapabilityKind.QUERY, STD, "Lamp hours (%1LAMP ?)"),
            Capability("info.name", CapabilityKind.QUERY, STD, "Projector name (%1NAME ?)"),
            Capability("info.manufacturer", CapabilityKind.QUERY, STD, "Manufacturer (%1INF1 ?)"),
            Capability("info.model", CapabilityKind.QUERY, STD, "Model (%1INF2 ?)"),
            Capability("info.other", CapabilityKind.QUERY, STD, "Other info (%1INFO ?)"),
            Capability("info.class", CapabilityKind.QUERY, STD, "PJLink class (%1CLSS ?)"),
            # Class 2 — retracted on connect unless the projector reports class 2.
            Capability("info.serial", CapabilityKind.QUERY, STD, "Serial number (%2SNUM ?)"),
            Capability("info.firmware", CapabilityKind.QUERY, STD, "Software version (%2SVER ?)"),
            Capability("input.resolution", CapabilityKind.QUERY, STD, "Input resolution (%2IRES ?)"),
            Capability("filter.usage", CapabilityKind.QUERY, STD, "Filter usage hours (%2FILT ?)"),
        ]

    _CLASS2 = frozenset(
        {"info.serial", "info.firmware", "input.resolution", "filter.usage"}
    )

    # -- lifecycle ---------------------------------------------------------

    @property
    def connected(self) -> bool:
        return self._transport.connected

    async def connect(self) -> None:
        await self._transport.open()
        try:
            greeting = await self._transport.read_line()
        except TransportError:
            await self._transport.close()
            raise
        await self._handle_greeting(greeting)
        await self._probe_class()

    async def _handle_greeting(self, greeting: str) -> None:
        """Parse ``PJLINK 0`` / ``PJLINK 1 <seed>`` and prepare the digest."""
        parts = greeting.split()
        if not parts or parts[0].upper() != "PJLINK":
            await self._transport.close()
            raise TransportError(f"unexpected PJLink greeting: {greeting!r}")
        if len(parts) >= 2 and parts[1] == "1":
            if len(parts) < 3:
                raise TransportError("PJLink requested auth but sent no random seed")
            if not self.config.password:
                raise AuthenticationError(
                    "The projector asks for a PJLink password, but none is saved for it. "
                    "Press Edit, enter it as Control password, then Test connection."
                )
            self._auth_digest = pjlink_digest(parts[2], self.config.password)
        else:
            self._auth_digest = None
        self._authenticated = False

    async def authenticate(self) -> None:
        """PJLink authenticates implicitly on the first command.

        Issuing ``%1CLSS ?`` is the cheapest way to force that exchange and
        find out whether the password was accepted.
        """
        if self._auth_digest is None or self._authenticated:
            # connect() already sent %1CLSS ? through _probe_class, which is
            # where a rejected password surfaces; nothing left to do.
            self._authenticated = True
            return
        result = await self._command("info.class", "%1CLSS ?")
        if result.outcome is CommandOutcome.AUTH_FAILED:
            raise AuthenticationError(
                "PJLink authentication rejected (PJLINK ERRA). Press Edit and check "
                "Control password."
            )
        if result.outcome in (CommandOutcome.TIMEOUT, CommandOutcome.CONNECTION_ERROR):
            raise TransportError(
                f"projector accepted the connection but did not answer %1CLSS "
                f"({result.error})."
            )
        self._authenticated = True

    async def _probe_class(self) -> None:
        """Resolve the PJLink class and retract Class 2 capabilities if absent.

        This is the first command of the session and therefore the point at
        which authentication is accepted or rejected. A rejection has to
        surface here: silently treating it as "class 1" would leave a
        misconfigured password looking like a feature-poor projector.
        """
        result = await self._command("info.class", "%1CLSS ?")
        if result.outcome is CommandOutcome.AUTH_FAILED:
            await self._transport.close()
            raise AuthenticationError(
                "PJLink authentication rejected (PJLINK ERRA). Press Edit and check "
                "Control password."
            )
        if result.outcome in (CommandOutcome.TIMEOUT, CommandOutcome.CONNECTION_ERROR):
            await self._transport.close()
            raise TransportError(
                f"projector accepted the connection but did not answer %1CLSS "
                f"({result.error})."
            )
        detected = 1
        if result.ok and isinstance(result.value, str):
            match = re.search(r"\d", result.value)
            if match:
                detected = int(match.group())
        self._pjlink_class = detected
        if detected < 2:
            for name in self._CLASS2:
                self._manifest.retract(
                    name, f"requires PJLink class 2; projector reports class {detected}"
                )
        else:
            for name in self._CLASS2:
                self._manifest.restore(name)

    async def _reopen(self) -> None:
        """New session for the next command: fresh greeting, fresh digest.

        The class was probed when the worker connected and does not change,
        so unlike :meth:`connect` this sends nothing of its own.
        """
        await self._transport.open()
        greeting = await self._transport.read_line()
        await self._handle_greeting(greeting)

    async def disconnect(self) -> None:
        await self._transport.close()
        self._authenticated = False
        self._auth_digest = None

    # -- core command plumbing --------------------------------------------

    async def _command(
        self, capability: str, body: str, *, timeout: float | None = None
    ) -> CommandResult:
        """Send one PJLink frame and classify the reply.

        The capability gate is applied by the public methods, not here, so
        internal bootstrap commands (``%1CLSS ?`` during connect) can run
        before the manifest is finalised.
        """
        async with self._lock:
            await self._respect_command_gap()
            if not self._transport.connected and not self._transport.closed_by_peer:
                return CommandResult(
                    capability=capability,
                    outcome=CommandOutcome.CONNECTION_ERROR,
                    error="transport is not connected",
                )
            # Discard anything left over from a previous timed-out command so
            # we never attribute a stale frame to this request.
            await self._transport.drain_pending()
            if self._transport.closed_by_peer:
                # The projector ended the session (idle timeout, or firmware
                # that closes after every reply). Nothing of this command has
                # been sent, so a fresh session is always safe to open.
                try:
                    await self._reopen()
                except TransportError as exc:
                    await self._transport.close()
                    return CommandResult(
                        capability=capability, outcome=CommandOutcome.CONNECTION_ERROR,
                        raw_request=body,
                        error=f"the projector closed the session and reconnecting failed: {exc}",
                    )

            prefix = self._auth_digest if (self._auth_digest and not self._authenticated) else ""
            payload = f"{prefix}{body}\r"
            started = time.monotonic()
            try:
                await self._transport.write(payload)
                if prefix:
                    # The digest is valid for the first command only, and the
                    # projector has it as soon as the write lands — a timeout
                    # on the reply must not cause it to be sent twice.
                    self._authenticated = True
                reply = await self._transport.read_line(timeout=timeout)
            except TransportTimeout as exc:
                # Same reasoning as the Panasonic transport: a late reply on a
                # protocol without request IDs must never be attributed to the
                # next command, so the socket goes.
                await self._transport.close()
                return CommandResult(
                    capability=capability, outcome=CommandOutcome.TIMEOUT,
                    raw_request=body, error=str(exc),
                    latency_ms=int((time.monotonic() - started) * 1000),
                )
            except TransportError as exc:
                await self._transport.close()
                return CommandResult(
                    capability=capability, outcome=CommandOutcome.CONNECTION_ERROR,
                    raw_request=body, error=str(exc),
                )
            finally:
                self._last_command_at = time.monotonic()

            latency = int((time.monotonic() - started) * 1000)
            return self._parse_reply(capability, body, reply, latency)

    @staticmethod
    def _parse_reply(capability: str, request: str, reply: str, latency: int) -> CommandResult:
        if reply.upper().startswith("PJLINK ERRA"):
            return CommandResult(
                capability=capability, outcome=CommandOutcome.AUTH_FAILED,
                raw_request=request, raw_response=reply,
                error="authentication failed", latency_ms=latency,
            )
        # Normal shape: %1POWR=1
        match = re.match(r"^%(\d)([A-Z]{4})=(.*)$", reply.strip())
        if not match:
            return CommandResult(
                capability=capability, outcome=CommandOutcome.PARSE_ERROR,
                raw_request=request, raw_response=reply,
                error=f"unparseable PJLink reply: {reply!r}", latency_ms=latency,
            )
        value = match.group(3).strip()
        if value.upper() in _ERR_MAP:
            outcome, why = _ERR_MAP[value.upper()]
            return CommandResult(
                capability=capability, outcome=outcome, raw_request=request,
                raw_response=reply, error=why, latency_ms=latency,
            )
        if value.upper() == "OK":
            return CommandResult(
                capability=capability, outcome=CommandOutcome.ACCEPTED,
                raw_request=request, raw_response=reply, latency_ms=latency,
            )
        return CommandResult(
            capability=capability, outcome=CommandOutcome.OK, value=value,
            raw_request=request, raw_response=reply, latency_ms=latency,
        )

    # -- operations --------------------------------------------------------

    async def get_power_state(self) -> CommandResult:
        if (gated := self._gate("power.get")) is not None:
            return gated
        result = await self._command("power.get", "%1POWR ?")
        if result.outcome is CommandOutcome.OK:
            result.value = {
                "0": PowerState.OFF, "1": PowerState.ON,
                "2": PowerState.COOLING, "3": PowerState.WARMING,
            }.get(str(result.value).strip(), PowerState.UNKNOWN)
        return result

    async def set_power_state(self, on: bool) -> CommandResult:
        if (gated := self._gate("power.set")) is not None:
            return gated
        return await self._command("power.set", f"%1POWR {'1' if on else '0'}")

    async def get_active_input(self) -> CommandResult:
        if (gated := self._gate("input.get")) is not None:
            return gated
        return await self._command("input.get", "%1INPT ?")

    async def set_input(self, source: str) -> CommandResult:
        if (gated := self._gate("input.set")) is not None:
            return gated
        code = source.strip()
        if not re.fullmatch(r"[1-5][0-9A-Z]", code):
            return CommandResult(
                capability="input.set", outcome=CommandOutcome.REJECTED,
                error=(
                    f"{source!r} is not a PJLink input code. Expected two characters: "
                    "family digit 1-5 (RGB/VIDEO/DIGITAL/STORAGE/NETWORK) then index."
                ),
            )
        return await self._command("input.set", f"%1INPT {code}")

    async def set_shutter(self, closed: bool) -> CommandResult:
        """PJLink AV mute. ``31``/``30`` mutes/unmutes both video and audio."""
        if (gated := self._gate("shutter.set")) is not None:
            return gated
        return await self._command("shutter.set", f"%1AVMT {'31' if closed else '30'}")

    async def get_shutter_state(self) -> CommandResult:
        if (gated := self._gate("shutter.get")) is not None:
            return gated
        result = await self._command("shutter.get", "%1AVMT ?")
        if result.outcome is CommandOutcome.OK:
            raw = str(result.value).strip()
            # 11 = video mute on, 31 = both on. Either blanks the image.
            result.value = ShutterState.CLOSED if raw in ("11", "31") else ShutterState.OPEN
        return result

    async def get_lamp_hours(self) -> CommandResult:
        if (gated := self._gate("lamp.hours")) is not None:
            return gated
        result = await self._command("lamp.hours", "%1LAMP ?")
        if result.outcome is CommandOutcome.OK:
            result.value = self.parse_lamp(str(result.value))
        return result

    @staticmethod
    def parse_lamp(raw: str) -> list[dict[str, Any]]:
        """``"1234 1 1200 0"`` → per-lamp hours and on/off state."""
        tokens = raw.split()
        lamps: list[dict[str, Any]] = []
        for index in range(0, len(tokens) - 1, 2):
            try:
                hours = int(tokens[index])
            except ValueError:
                continue
            lamps.append({
                "index": len(lamps) + 1,
                "hours": hours,
                "on": tokens[index + 1] == "1",
            })
        return lamps

    async def get_errors(self) -> CommandResult:
        if (gated := self._gate("errors.get")) is not None:
            return gated
        result = await self._command("errors.get", "%1ERST ?")
        if result.outcome is CommandOutcome.OK:
            result.value = self.parse_erst(str(result.value))
        return result

    @staticmethod
    def parse_erst(raw: str) -> dict[str, str]:
        """Six digits → per-subsystem severity."""
        digits = raw.strip()
        if len(digits) < 6:
            return {}
        return {
            name: ERST_SEVERITY.get(digits[i], HealthSeverity.UNKNOWN).value
            for i, name in enumerate(ERST_SUBSYSTEMS)
        }

    async def get_status(self, *, deep: bool = False) -> ProjectorStatus:
        status = ProjectorStatus()
        power = await self.get_power_state()
        if power.outcome in (CommandOutcome.CONNECTION_ERROR, CommandOutcome.TIMEOUT):
            status.online = False
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
            if active.ok else self._unavailable_from(active)
        )

        if deep:
            errors = await self.get_errors()
            if errors.ok and isinstance(errors.value, dict):
                status.error_status = TelemetryValue.available(errors.value)
                status.health = self._health_from_erst(errors.value)
                status.errors = [
                    f"{k}: error" for k, v in errors.value.items() if v == HealthSeverity.ERROR.value
                ]
                status.warnings = [
                    f"{k}: warning" for k, v in errors.value.items()
                    if v == HealthSeverity.WARNING.value
                ]
            else:
                status.error_status = self._unavailable_from(errors)

            lamp = await self.get_lamp_hours()
            status.lamp_hours = (
                TelemetryValue.available(lamp.value, raw=lamp.raw_response)
                if lamp.ok else self._unavailable_from(lamp)
            )

            for cap, body, attr in (
                ("info.manufacturer", "%1INF1 ?", "manufacturer"),
                ("info.model", "%1INF2 ?", "model"),
            ):
                if self.supports(cap):
                    res = await self._command(cap, body)
                    setattr(status, attr,
                            TelemetryValue.available(res.value) if res.ok
                            else self._unavailable_from(res))

            if self.supports("info.serial"):
                res = await self._command("info.serial", "%2SNUM ?")
                status.serial_number = (
                    TelemetryValue.available(res.value) if res.ok
                    else self._unavailable_from(res)
                )
            else:
                status.serial_number = TelemetryValue.unsupported(
                    "serial number requires PJLink class 2"
                )

            if self.supports("info.firmware"):
                res = await self._command("info.firmware", "%2SVER ?")
                status.firmware = (
                    TelemetryValue.available(res.value) if res.ok
                    else self._unavailable_from(res)
                )
            else:
                status.firmware = TelemetryValue.unsupported(
                    "software version requires PJLink class 2"
                )

        # PJLink exposes severity, never numeric readings, for these.
        status.temperature = TelemetryValue.unsupported(
            "PJLink reports temperature as ok/warning/error only, not a numeric value"
        )
        status.fan = TelemetryValue.unsupported(
            "PJLink reports fan state as ok/warning/error only, not a numeric value"
        )
        return status

    @staticmethod
    def _health_from_erst(erst: Mapping[str, str]) -> HealthSeverity:
        values = set(erst.values())
        if HealthSeverity.ERROR.value in values:
            return HealthSeverity.ERROR
        if HealthSeverity.WARNING.value in values:
            return HealthSeverity.WARNING
        if values:
            return HealthSeverity.OK
        return HealthSeverity.UNKNOWN

    @staticmethod
    def _unavailable_from(result: CommandResult) -> TelemetryValue:
        if result.outcome is CommandOutcome.UNSUPPORTED:
            return TelemetryValue.unsupported(result.error or "not supported")
        return TelemetryValue.unavailable(result.error or result.outcome.value)

    async def execute_supported_command(
        self, capability: str, params: Mapping[str, Any] | None = None
    ) -> CommandResult:
        params = params or {}
        if (gated := self._gate(capability)) is not None:
            return gated
        match capability:
            case "power.set":
                state = enum_param(capability, params, "state", ("on", "off"))
                if isinstance(state, CommandResult):
                    return state
                return await self.set_power_state(state == "on")
            case "power.get":
                return await self.get_power_state()
            case "shutter.set":
                state = enum_param(capability, params, "state", ("open", "closed"))
                if isinstance(state, CommandResult):
                    return state
                return await self.set_shutter(state == "closed")
            case "shutter.get":
                return await self.get_shutter_state()
            case "input.set":
                return await self.set_input(str(params.get("input", "")))
            case "input.get":
                return await self.get_active_input()
            case "lamp.hours":
                return await self.get_lamp_hours()
            case "errors.get":
                return await self.get_errors()
            case "input.list":
                return await self._command("input.list", "%1INST ?")
            case "info.name":
                return await self._command("info.name", "%1NAME ?")
            case "info.manufacturer":
                return await self._command("info.manufacturer", "%1INF1 ?")
            case "info.model":
                return await self._command("info.model", "%1INF2 ?")
            case "info.other":
                return await self._command("info.other", "%1INFO ?")
            case "info.class":
                return await self._command("info.class", "%1CLSS ?")
            case "info.serial":
                return await self._command("info.serial", "%2SNUM ?")
            case "info.firmware":
                return await self._command("info.firmware", "%2SVER ?")
            case "input.resolution":
                return await self._command("input.resolution", "%2IRES ?")
            case "filter.usage":
                return await self._command("filter.usage", "%2FILT ?")
        return CommandResult(
            capability=capability, outcome=CommandOutcome.UNSUPPORTED,
            error=f"{capability!r} has no PJLink implementation",
        )
