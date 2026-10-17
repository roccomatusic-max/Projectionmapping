"""Driver framework: capabilities, command outcomes, and the driver interface.

Everything a projector can be asked to do is a :class:`Capability`. A driver
publishes a manifest of them, and :meth:`ProjectorDriver.execute` will not put
bytes on the wire for a capability that is not in the manifest. That is the
mechanism that keeps "the UI offers it" and "the projector supports it" from
drifting apart.
"""

from __future__ import annotations

import asyncio
import enum
import time
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

# --------------------------------------------------------------------------
# Outcomes
# --------------------------------------------------------------------------


class CommandOutcome(str, enum.Enum):
    """How a command ended.

    These are deliberately not collapsible to a boolean. The recovery for each
    is different, and conflating them is how a controller ends up re-sending a
    power command to a projector that was simply busy.
    """

    #: Device acknowledged *and* a follow-up query confirmed the new state.
    CONFIRMED = "confirmed"
    #: Device acknowledged. State not (or not yet) independently verified.
    ACCEPTED = "accepted"
    #: A query returned a value successfully.
    OK = "ok"
    #: No response within the timeout. Final device state is UNKNOWN.
    TIMEOUT = "timeout"
    #: Device understood the command and refused it (bad parameter, wrong mode).
    REJECTED = "rejected"
    #: Device is busy / command not acceptable right now. Retrying may work.
    BUSY = "busy"
    #: Not supported by this model, or gated off as unverified. No I/O performed.
    UNSUPPORTED = "unsupported"
    #: Authentication failed.
    AUTH_FAILED = "auth_failed"
    #: Could not establish or maintain the transport.
    CONNECTION_ERROR = "connection_error"
    #: Device reported an internal fault.
    DEVICE_FAULT = "device_fault"
    #: Response arrived but could not be parsed.
    PARSE_ERROR = "parse_error"

    @property
    def is_success(self) -> bool:
        return self in (CommandOutcome.CONFIRMED, CommandOutcome.ACCEPTED, CommandOutcome.OK)

    @property
    def state_is_uncertain(self) -> bool:
        """True when we genuinely do not know what the device did.

        Callers must not auto-retry a disruptive command in this situation —
        they must resolve it with a query instead.
        """
        return self in (CommandOutcome.TIMEOUT, CommandOutcome.CONNECTION_ERROR,
                        CommandOutcome.PARSE_ERROR)


@dataclass(slots=True)
class CommandResult:
    """The full record of one command attempt."""

    capability: str
    outcome: CommandOutcome
    value: Any = None
    raw_request: str | None = None
    raw_response: str | None = None
    error: str | None = None
    latency_ms: int | None = None
    attempts: int = 1

    @property
    def ok(self) -> bool:
        return self.outcome.is_success

    def as_dict(self) -> dict[str, Any]:
        return {
            "capability": self.capability,
            "outcome": self.outcome.value,
            "value": self.value,
            "raw_request": self.raw_request,
            "raw_response": self.raw_response,
            "error": self.error,
            "latency_ms": self.latency_ms,
            "attempts": self.attempts,
        }


# --------------------------------------------------------------------------
# Telemetry
# --------------------------------------------------------------------------


class Availability(str, enum.Enum):
    """Why a telemetry field has no value.

    The UI renders these three states differently. There is no fourth state in
    which a number is invented.
    """

    AVAILABLE = "available"
    #: The model has no query for this. Never will have a value.
    UNSUPPORTED = "unsupported"
    #: The query exists but the most recent attempt did not produce a value.
    UNAVAILABLE = "unavailable"


@dataclass(slots=True)
class TelemetryValue:
    value: Any = None
    availability: Availability = Availability.UNAVAILABLE
    note: str | None = None
    raw: str | None = None

    @classmethod
    def available(cls, value: Any, raw: str | None = None) -> TelemetryValue:
        return cls(value=value, availability=Availability.AVAILABLE, raw=raw)

    @classmethod
    def unsupported(cls, note: str = "Not supported by this model") -> TelemetryValue:
        return cls(availability=Availability.UNSUPPORTED, note=note)

    @classmethod
    def unavailable(cls, note: str | None = None) -> TelemetryValue:
        return cls(availability=Availability.UNAVAILABLE, note=note)

    def as_dict(self) -> dict[str, Any]:
        return {
            "value": self.value,
            "availability": self.availability.value,
            "note": self.note,
        }


# --------------------------------------------------------------------------
# Domain state enums
# --------------------------------------------------------------------------


class PowerState(str, enum.Enum):
    OFF = "off"            # standby
    ON = "on"
    WARMING = "warming"    # startup transition
    COOLING = "cooling"    # shutdown transition
    UNKNOWN = "unknown"

    @property
    def is_transitional(self) -> bool:
        return self in (PowerState.WARMING, PowerState.COOLING)


class ShutterState(str, enum.Enum):
    OPEN = "open"        # image is being projected
    CLOSED = "closed"    # image is blanked
    UNKNOWN = "unknown"


class HealthSeverity(str, enum.Enum):
    OK = "ok"
    WARNING = "warning"
    ERROR = "error"
    UNKNOWN = "unknown"


# --------------------------------------------------------------------------
# Capabilities
# --------------------------------------------------------------------------


class Provenance(str, enum.Enum):
    """Where the knowledge that this command exists came from.

    Drives the unverified-command gate. See docs/PROTOCOL-RESEARCH.md.
    """

    #: Defined by the PJLink standard.
    STANDARD = "standard"
    #: Present in a Panasonic document that names this model series.
    VERIFIED_DOC = "verified_doc"
    #: Documented for a sibling model; encoding assumed to carry over.
    INFERRED_FAMILY = "inferred_family"
    #: Confirmed against physical hardware by an operator.
    HARDWARE_VERIFIED = "hardware_verified"

    @property
    def is_trusted(self) -> bool:
        return self in (Provenance.STANDARD, Provenance.VERIFIED_DOC,
                        Provenance.HARDWARE_VERIFIED)


class CapabilityKind(str, enum.Enum):
    QUERY = "query"
    SET = "set"
    ACTION = "action"


@dataclass(frozen=True, slots=True)
class Capability:
    """One thing a driver can do, and everything the platform needs to know
    about it to decide whether it is safe to do it."""

    name: str
    kind: CapabilityKind
    provenance: Provenance
    description: str = ""
    #: Allowed parameter values, when the parameter is an enumeration.
    params: Sequence[str] = field(default_factory=tuple)
    #: Numeric parameter range, as (min, max), when continuous.
    value_range: tuple[int, int] | None = None
    #: Requires explicit operator confirmation before dispatch.
    disruptive: bool = False
    #: Safe to re-send after a timeout without risking a duplicate effect.
    idempotent: bool = True
    #: Capability name whose query confirms this command landed.
    verify_with: str | None = None
    #: Human-readable reason this is gated, when provenance is untrusted.
    caveat: str | None = None

    @property
    def requires_opt_in(self) -> bool:
        return not self.provenance.is_trusted

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "kind": self.kind.value,
            "provenance": self.provenance.value,
            "description": self.description,
            "params": list(self.params),
            "value_range": list(self.value_range) if self.value_range else None,
            "disruptive": self.disruptive,
            "idempotent": self.idempotent,
            "verify_with": self.verify_with,
            "caveat": self.caveat,
            "requires_opt_in": self.requires_opt_in,
        }


class CapabilityManifest:
    """The set of capabilities a driver exposes for a specific unit.

    Capabilities can be *retracted at runtime*: when a projector answers
    ``ER401`` to an input selection, that input is not available on this
    physical unit regardless of what the model's documentation says, and we
    record that instead of asking again every poll.
    """

    def __init__(self, capabilities: Sequence[Capability]) -> None:
        self._caps: dict[str, Capability] = {c.name: c for c in capabilities}
        self._retracted: dict[str, str] = {}
        #: Individual parameter values found unavailable on this unit, keyed
        #: "capability:param". An SDI input with no board fitted lives here —
        #: the command exists, that one value does not.
        self._retracted_params: dict[str, str] = {}

    def __contains__(self, name: object) -> bool:
        return name in self._caps and name not in self._retracted

    def __iter__(self):
        return iter(self.available())

    def get(self, name: str) -> Capability | None:
        if name in self._retracted:
            return None
        return self._caps.get(name)

    def available(self) -> list[Capability]:
        return [c for n, c in self._caps.items() if n not in self._retracted]

    def retract(self, name: str, reason: str) -> None:
        """Mark a whole capability as unavailable on this physical unit."""
        if name in self._caps:
            self._retracted[name] = reason

    def restore(self, name: str) -> None:
        self._retracted.pop(name, None)

    def retract_param(self, capability: str, param: str, reason: str) -> None:
        """Mark one parameter value as unavailable on this physical unit.

        Distinct from retracting the capability: the projector still accepts
        ``IIS``, it just has no SDI board. The UI greys out that one input and
        shows the reason, instead of hiding input selection altogether.
        """
        if capability in self._caps:
            self._retracted_params[f"{capability}:{param}"] = reason

    def param_available(self, capability: str, param: str) -> bool:
        return f"{capability}:{param}" not in self._retracted_params

    @property
    def retracted(self) -> Mapping[str, str]:
        return dict(self._retracted)

    @property
    def retracted_params(self) -> Mapping[str, str]:
        return dict(self._retracted_params)

    def as_dict(self) -> dict[str, Any]:
        return {
            "capabilities": [c.as_dict() for c in self._caps.values()],
            "retracted": dict(self._retracted),
            "retracted_params": dict(self._retracted_params),
        }


# --------------------------------------------------------------------------
# Status snapshot
# --------------------------------------------------------------------------


@dataclass(slots=True)
class ProjectorStatus:
    """A point-in-time read of a projector.

    Fields that could not be read are ``TelemetryValue`` objects carrying
    *why*, not ``None`` masquerading as zero.
    """

    online: bool = False
    power: PowerState = PowerState.UNKNOWN
    shutter: ShutterState = ShutterState.UNKNOWN
    active_input: TelemetryValue = field(default_factory=TelemetryValue.unavailable)
    lamp_hours: TelemetryValue = field(default_factory=TelemetryValue.unavailable)
    lamp_status: TelemetryValue = field(default_factory=TelemetryValue.unavailable)
    error_status: TelemetryValue = field(default_factory=TelemetryValue.unavailable)
    health: HealthSeverity = HealthSeverity.UNKNOWN
    manufacturer: TelemetryValue = field(default_factory=TelemetryValue.unavailable)
    model: TelemetryValue = field(default_factory=TelemetryValue.unavailable)
    serial_number: TelemetryValue = field(default_factory=TelemetryValue.unavailable)
    firmware: TelemetryValue = field(default_factory=TelemetryValue.unavailable)
    input_signal: TelemetryValue = field(default_factory=TelemetryValue.unavailable)
    resolution: TelemetryValue = field(default_factory=TelemetryValue.unavailable)
    filter_usage: TelemetryValue = field(default_factory=TelemetryValue.unavailable)
    #: Numeric temperature/fan readings. See PROTOCOL-RESEARCH.md §4 — for the
    #: PT-DZ13K these stay UNSUPPORTED; PJLink ERST severity is used instead.
    temperature: TelemetryValue = field(default_factory=TelemetryValue.unavailable)
    fan: TelemetryValue = field(default_factory=TelemetryValue.unavailable)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    read_at: float = field(default_factory=time.time)
    #: True when this object was built from a failed poll.
    is_simulated: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {
            "online": self.online,
            "power": self.power.value,
            "shutter": self.shutter.value,
            "health": self.health.value,
            "active_input": self.active_input.as_dict(),
            "lamp_hours": self.lamp_hours.as_dict(),
            "lamp_status": self.lamp_status.as_dict(),
            "error_status": self.error_status.as_dict(),
            "manufacturer": self.manufacturer.as_dict(),
            "model": self.model.as_dict(),
            "serial_number": self.serial_number.as_dict(),
            "firmware": self.firmware.as_dict(),
            "input_signal": self.input_signal.as_dict(),
            "resolution": self.resolution.as_dict(),
            "filter_usage": self.filter_usage.as_dict(),
            "temperature": self.temperature.as_dict(),
            "fan": self.fan.as_dict(),
            "errors": list(self.errors),
            "warnings": list(self.warnings),
            "read_at": self.read_at,
            "is_simulated": self.is_simulated,
        }


# --------------------------------------------------------------------------
# Connection config + driver interface
# --------------------------------------------------------------------------


@dataclass(slots=True)
class ConnectionConfig:
    host: str
    port: int
    username: str | None = None
    password: str | None = None
    timeout: float = 5.0
    connect_timeout: float = 3.0
    #: Minimum gap between commands, seconds. Panasonic documents >0.5s.
    command_gap: float = 0.6
    #: Keep the TCP session open between commands.
    persistent: bool = True
    allow_unverified_commands: bool = False
    #: Label shown in logs; set to the device name.
    label: str = ""


class DriverError(Exception):
    """Base for driver-layer failures that are not ordinary command outcomes."""


class AuthenticationError(DriverError):
    pass


class ProjectorDriver:
    """Interface every projector driver implements.

    Concurrency contract: a driver instance is owned by exactly one
    :class:`~app.services.device_manager.DeviceWorker`, which serializes all
    access. Drivers therefore do not need internal locking for ordering, but
    they do hold an internal lock so that an accidental concurrent caller
    degrades to serialization rather than to interleaved protocol frames.
    """

    #: Stable identifier used in the database and the driver registry.
    driver_id: str = "base"
    display_name: str = "Base driver"
    default_port: int = 0

    def __init__(self, config: ConnectionConfig) -> None:
        self.config = config
        self._lock = asyncio.Lock()
        self._last_command_at: float = 0.0
        self._manifest: CapabilityManifest = CapabilityManifest([])

    # -- lifecycle ---------------------------------------------------------

    async def connect(self) -> None:
        raise NotImplementedError

    async def authenticate(self) -> None:
        raise NotImplementedError

    async def disconnect(self) -> None:
        raise NotImplementedError

    @property
    def connected(self) -> bool:
        raise NotImplementedError

    # -- capabilities ------------------------------------------------------

    @property
    def capabilities(self) -> CapabilityManifest:
        return self._manifest

    def supports(self, capability: str) -> bool:
        cap = self._manifest.get(capability)
        if cap is None:
            return False
        return not (cap.requires_opt_in and not self.config.allow_unverified_commands)

    def _gate(self, capability: str) -> CommandResult | None:
        """Return an UNSUPPORTED result if this capability must not be sent.

        Called before any socket I/O. This is the single choke point that
        enforces both "the model does not have this command" and "we are not
        confident enough in this command to fire it at your hardware".
        """
        cap = self._manifest.get(capability)
        if cap is None:
            retracted = self._manifest.retracted.get(capability)
            reason = retracted or f"{capability!r} is not supported by {self.display_name}"
            return CommandResult(
                capability=capability,
                outcome=CommandOutcome.UNSUPPORTED,
                error=reason,
            )
        if cap.requires_opt_in and not self.config.allow_unverified_commands:
            return CommandResult(
                capability=capability,
                outcome=CommandOutcome.UNSUPPORTED,
                error=(
                    f"{capability!r} is gated: provenance is {cap.provenance.value}. "
                    f"{cap.caveat or 'Enable allow_unverified_commands on this device to send it.'}"
                ),
            )
        return None

    async def _respect_command_gap(self) -> None:
        gap = self.config.command_gap
        if gap <= 0:
            return
        elapsed = time.monotonic() - self._last_command_at
        if elapsed < gap:
            await asyncio.sleep(gap - elapsed)

    # -- operations --------------------------------------------------------

    async def get_status(self, *, deep: bool = False) -> ProjectorStatus:
        """Read device state. ``deep`` includes slow/diagnostic queries."""
        raise NotImplementedError

    async def get_power_state(self) -> CommandResult:
        raise NotImplementedError

    async def set_power_state(self, on: bool) -> CommandResult:
        raise NotImplementedError

    async def get_active_input(self) -> CommandResult:
        raise NotImplementedError

    async def set_input(self, source: str) -> CommandResult:
        raise NotImplementedError

    async def get_lamp_hours(self) -> CommandResult:
        raise NotImplementedError

    async def get_errors(self) -> CommandResult:
        raise NotImplementedError

    async def set_shutter(self, closed: bool) -> CommandResult:
        raise NotImplementedError

    async def execute_supported_command(
        self, capability: str, params: Mapping[str, Any] | None = None
    ) -> CommandResult:
        """Dispatch a capability by name. Used by automations and the API's
        generic command endpoint."""
        raise NotImplementedError
