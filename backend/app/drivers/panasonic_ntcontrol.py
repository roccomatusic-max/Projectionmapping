"""Panasonic LAN command protocol ("Protocol 2" / NTCONTROL) transport.

This module owns the wire protocol only — handshake, MD5 authentication,
framing and response classification. Model-specific command vocabulary lives
in the model drivers that build on it (:mod:`app.drivers.panasonic_ptdz13k`),
so that adding another Panasonic model does not mean touching protocol code.

Wire summary (docs/PROTOCOL-RESEARCH.md §2):
  - TCP 1024.
  - Projector greets with ``NTCONTROL 0`` or ``NTCONTROL 1 <8 hex>``.
  - Protected: ``md5_hex("user:password:random")`` prefixes the first command.
  - Frames are ``00<COMMAND>\\r``; replies ``00<COMMAND>[:<value>]\\r`` or
    ``ERRn`` / ``00ER4nn``.
"""

from __future__ import annotations

import hashlib
import logging
import re
import time

from .base import CommandOutcome, CommandResult, ConnectionConfig, ProjectorDriver
from .transport import AuthenticationError, LineTransport, TransportError, TransportTimeout

log = logging.getLogger(__name__)

#: Two-digit unit-ID prefix. ``00`` addresses the projector on the far end of
#: this socket regardless of its configured ID, which is what we want: each
#: projector is its own TCP endpoint here.
ID_PREFIX = "00"

#: LAN-layer errors, returned bare.
LAN_ERRORS = {
    "ERR1": (CommandOutcome.UNSUPPORTED, "undefined control command"),
    "ERR2": (CommandOutcome.REJECTED, "parameter out of range"),
    "ERR3": (CommandOutcome.BUSY, "projector busy / command not acceptable now"),
    "ERR4": (CommandOutcome.BUSY, "timeout or command not acceptable in this period"),
    "ERR5": (CommandOutcome.REJECTED, "wrong data length"),
    "ERRA": (CommandOutcome.AUTH_FAILED, "password mismatch"),
}

#: Serial-layer errors, which this protocol can also carry inside a frame.
DEVICE_ERRORS = {
    "ER401": (CommandOutcome.UNSUPPORTED, "command not available on this model or in this state"),
    "ER402": (CommandOutcome.REJECTED, "invalid parameter, or input is being driven by REMOTE2"),
    "ER403": (CommandOutcome.BUSY, "command not acceptable in the current state"),
    "ER404": (CommandOutcome.DEVICE_FAULT, "projector reported a fault handling the command"),
}


def panasonic_digest(username: str, password: str, random_seed: str) -> str:
    """NTCONTROL auth digest: md5("user:password:random").

    Note this differs from PJLink's digest, which is md5(random || password)
    with no username and no separators. Getting these two confused produces an
    ``ERRA`` that looks like a wrong password.
    """
    return hashlib.md5(f"{username}:{password}:{random_seed}".encode()).hexdigest()


class NTControlTransport:
    """Session management for one Panasonic LAN control connection."""

    def __init__(self, config: ConnectionConfig) -> None:
        self.config = config
        self._line = LineTransport(
            config.host,
            config.port or 1024,
            connect_timeout=config.connect_timeout,
            read_timeout=config.timeout,
        )
        self._digest: str | None = None
        self._digest_consumed = False
        self.protected: bool | None = None

    @property
    def connected(self) -> bool:
        return self._line.connected

    @property
    def closed_by_peer(self) -> bool:
        return self._line.closed_by_peer

    async def open(self) -> None:
        """Connect and complete the greeting exchange."""
        await self._line.open()
        try:
            greeting = await self._line.read_line()
            self._parse_greeting(greeting)
        except TransportError:
            await self.close()
            raise

    def _parse_greeting(self, greeting: str) -> None:
        text = greeting.strip()
        # The seed is documented as 8 random characters and real units send
        # hex, but it is hashed exactly as received, so accept any token.
        match = re.match(r"^NTCONTROL\s+([01])(?:\s+(\S+))?", text)
        if not match:
            raise TransportError(f"unexpected NTCONTROL greeting: {greeting!r}")
        mode, seed = match.group(1), match.group(2)
        if mode == "1":
            if not seed:
                raise TransportError("projector requested authentication but sent no random seed")
            username = self.config.username or "admin1"
            if not self.config.password:
                raise AuthenticationError(
                    "The projector is in protect mode and asks for a password, but none is "
                    "saved for it. Press Edit, enter the projector's web login as Control "
                    "username (usually admin1) and Control password, then Test connection."
                )
            self._digest = panasonic_digest(username, self.config.password, seed)
            self.protected = True
        else:
            self._digest = None
            self.protected = False
        self._digest_consumed = False

    async def close(self) -> None:
        await self._line.close()
        self._digest = None
        self._digest_consumed = False

    async def send(self, command: str, *, timeout: float | None = None) -> tuple[str, str]:
        """Send one command; return ``(wire_payload, reply)``.

        The digest is prepended only to the first command of a session, which
        is what the protocol specifies.

        Some Panasonic firmware ends the session right after each reply, so
        a session the projector has ended is opened again here, with its own
        greeting and digest. Nothing of this command has been sent at that
        point, so reopening is always safe.
        """
        await self._line.drain_pending()
        if self._line.closed_by_peer:
            try:
                await self.open()
            except TransportError as exc:
                # Plain TransportError, never TransportTimeout: the command
                # did not go out, so the projector's state is not in doubt.
                raise TransportError(
                    f"the projector closed the control session and reconnecting "
                    f"failed: {exc}"
                ) from exc
        prefix = ""
        if self._digest and not self._digest_consumed:
            prefix = self._digest
        payload = f"{prefix}{ID_PREFIX}{command}\r"
        await self._line.write(payload)
        if prefix:
            # Consumed on write, not on reply: if this first command times
            # out the projector has still read the digest, and sending it
            # again would turn the next command into an unparseable frame.
            self._digest_consumed = True
        reply = await self._line.read_line(timeout=timeout)
        return f"{ID_PREFIX}{command}", reply


def classify_response(capability: str, request: str, reply: str, latency_ms: int) -> CommandResult:
    """Map an NTCONTROL reply onto a :class:`CommandResult`.

    Handles both the bare LAN errors (``ERR3``) and the in-frame device errors
    (``00ER401``), because real units emit both depending on where the command
    was refused.
    """
    text = reply.strip()
    upper = text.upper()

    if upper in LAN_ERRORS:
        outcome, why = LAN_ERRORS[upper]
        return CommandResult(
            capability=capability, outcome=outcome, raw_request=request,
            raw_response=text, error=why, latency_ms=latency_ms,
        )

    body = text[len(ID_PREFIX):] if upper.startswith(ID_PREFIX) else text
    body_upper = body.upper()

    for code, (outcome, why) in DEVICE_ERRORS.items():
        if body_upper.startswith(code):
            return CommandResult(
                capability=capability, outcome=outcome, raw_request=request,
                raw_response=text, error=why, latency_ms=latency_ms,
            )
    # Any other ER4xx we have not enumerated is still clearly a refusal.
    if re.match(r"^ER\d{3}", body_upper):
        return CommandResult(
            capability=capability, outcome=CommandOutcome.REJECTED, raw_request=request,
            raw_response=text, error=f"projector returned {body_upper[:5]}",
            latency_ms=latency_ms,
        )

    if not body:
        return CommandResult(
            capability=capability, outcome=CommandOutcome.PARSE_ERROR,
            raw_request=request, raw_response=text,
            error="empty response frame", latency_ms=latency_ms,
        )

    # What we sent, without the ID prefix: "QPW", "OSH:1", "Q$L:1".
    sent = request[len(ID_PREFIX):] if request.upper().startswith(ID_PREFIX) else request
    mnemonic = sent.split(":", 1)[0].upper()

    # Control commands are acknowledged by echoing the mnemonic ("00PON"),
    # sometimes with its parameter ("00OSH:1").
    if body_upper in (mnemonic, sent.upper()):
        return CommandResult(
            capability=capability, outcome=CommandOutcome.ACCEPTED, value=body,
            raw_request=request, raw_response=text, latency_ms=latency_ms,
        )

    # Query answered as "MNEMONIC:value" — seen on some firmware.
    if body_upper.startswith(mnemonic + ":"):
        return CommandResult(
            capability=capability, outcome=CommandOutcome.OK,
            value=body.partition(":")[2].strip(),
            raw_request=request, raw_response=text, latency_ms=latency_ms,
        )

    # Query answered with the value alone after the ID ("00001" for QPW),
    # which is the form Panasonic's own LAN examples show.
    return CommandResult(
        capability=capability, outcome=CommandOutcome.OK, value=body.strip(),
        raw_request=request, raw_response=text, latency_ms=latency_ms,
    )


class PanasonicNTControlDriver(ProjectorDriver):
    """Base class for Panasonic models reached over the LAN command protocol.

    Subclasses provide the capability manifest and the command vocabulary;
    this class provides connect/auth/send/classify.
    """

    driver_id = "panasonic_ntcontrol"
    display_name = "Panasonic LAN control (generic)"
    default_port = 1024

    def __init__(self, config: ConnectionConfig) -> None:
        super().__init__(config)
        if config.port == 0:
            config.port = self.default_port
        # Panasonic documents waiting >0.5s after a response before the next
        # command. Respect that unless the operator has tuned it.
        if config.command_gap <= 0:
            config.command_gap = 0.6
        self._nt = NTControlTransport(config)

    @property
    def connected(self) -> bool:
        return self._nt.connected

    async def connect(self) -> None:
        await self._nt.open()

    async def authenticate(self) -> None:
        """Authentication is folded into the first command frame.

        A cheap ``QPW`` forces the exchange: it is answered in standby as well
        as when powered, so it works as a liveness and auth probe in any state.
        """
        result = await self.raw_command("power.get", "QPW")
        if result.outcome is CommandOutcome.AUTH_FAILED:
            raise AuthenticationError(
                "The projector rejected the username or password (ERRA). Press Edit and "
                "check Control username (usually admin1) and Control password: they are "
                "the projector's web login."
            )
        if result.outcome in (CommandOutcome.TIMEOUT, CommandOutcome.CONNECTION_ERROR):
            # A projector that accepts TCP but never answers is not usable.
            # Reporting success here would hand the worker a closed socket
            # and turn every later command into a misleading error.
            raise TransportError(
                f"projector accepted the connection but did not answer the QPW probe "
                f"({result.error}). Another controller may hold the control session, "
                f"or network control may be disabled."
            )

    async def disconnect(self) -> None:
        await self._nt.close()

    async def raw_command(
        self, capability: str, command: str, *, timeout: float | None = None
    ) -> CommandResult:
        """Send a command mnemonic without consulting the capability gate.

        Public methods gate first and then call this. It is also the escape
        hatch used by the connectivity probe and by the operator-facing raw
        command console, which is admin-only and logs loudly.
        """
        async with self._lock:
            await self._respect_command_gap()
            # A session the projector ended is reopened by send(); one this
            # side closed (after a timeout, or never opened) is the worker's
            # to reconnect.
            if not self._nt.connected and not self._nt.closed_by_peer:
                return CommandResult(
                    capability=capability, outcome=CommandOutcome.CONNECTION_ERROR,
                    raw_request=command, error="transport is not connected",
                )
            # Record the exact frame, prefix included, on every path so the
            # command log shows what was actually sent even when it failed.
            wire = f"{ID_PREFIX}{command}"
            started = time.monotonic()
            try:
                request, reply = await self._nt.send(command, timeout=timeout)
            except TransportTimeout as exc:
                # No request IDs in this protocol: if the reply turns up late
                # it would be read as the answer to the *next* command. Drop
                # the socket so a late frame has nowhere to land.
                await self._nt.close()
                return CommandResult(
                    capability=capability, outcome=CommandOutcome.TIMEOUT,
                    raw_request=wire, error=str(exc),
                    latency_ms=int((time.monotonic() - started) * 1000),
                )
            except TransportError as exc:
                await self._nt.close()
                return CommandResult(
                    capability=capability, outcome=CommandOutcome.CONNECTION_ERROR,
                    raw_request=wire, error=str(exc),
                )
            finally:
                self._last_command_at = time.monotonic()
            latency = int((time.monotonic() - started) * 1000)
            return classify_response(capability, request, reply, latency)
