"""Async TCP line transport shared by the network drivers.

Both PJLink and Panasonic NTCONTROL are carriage-return delimited ASCII
protocols over plain TCP, so the socket handling, timeout discipline and
reconnect logic live here once.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging

log = logging.getLogger(__name__)


class TransportError(Exception):
    """Transport could not be established or was lost."""


class TransportTimeout(TransportError):
    """No response within the deadline. Device state is unknown."""


class LineTransport:
    """A carriage-return delimited TCP session.

    Deliberately minimal: it does not retry, does not interpret payloads and
    does not reconnect on its own. Those are policy decisions that belong to
    the driver and the device worker, which know whether the command in flight
    was safe to repeat.
    """

    def __init__(
        self,
        host: str,
        port: int,
        *,
        connect_timeout: float = 3.0,
        read_timeout: float = 5.0,
        terminator: bytes = b"\r",
        encoding: str = "ascii",
    ) -> None:
        self.host = host
        self.port = port
        self.connect_timeout = connect_timeout
        self.read_timeout = read_timeout
        self.terminator = terminator
        self.encoding = encoding
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None

    @property
    def connected(self) -> bool:
        return (
            self._writer is not None
            and not self._writer.is_closing()
            and self._reader is not None
        )

    async def open(self) -> None:
        if self.connected:
            return
        await self.close()
        try:
            self._reader, self._writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port),
                timeout=self.connect_timeout,
            )
        except TimeoutError as exc:
            raise TransportTimeout(
                f"connect to {self.host}:{self.port} timed out after {self.connect_timeout}s"
            ) from exc
        except OSError as exc:
            raise TransportError(f"connect to {self.host}:{self.port} failed: {exc}") from exc
        log.debug("transport open %s:%s", self.host, self.port)

    async def close(self) -> None:
        writer, self._writer, self._reader = self._writer, None, None
        if writer is None:
            return
        try:
            writer.close()
            await asyncio.wait_for(writer.wait_closed(), timeout=2.0)
        except (TimeoutError, OSError, ConnectionError):
            pass  # socket is going away regardless

    async def read_line(self, timeout: float | None = None) -> str:
        """Read one terminator-delimited frame.

        Some Panasonic firmware terminates with ``\\r`` and some appends
        ``\\n``; leading/trailing whitespace is stripped so callers see the
        payload either way.
        """
        if self._reader is None:
            raise TransportError("read on a closed transport")
        deadline = self.read_timeout if timeout is None else timeout
        try:
            raw = await asyncio.wait_for(
                self._reader.readuntil(self.terminator), timeout=deadline
            )
        except TimeoutError as exc:
            raise TransportTimeout(f"no response from {self.host}:{self.port} in {deadline}s") from exc
        except asyncio.IncompleteReadError as exc:
            # Peer closed mid-frame. Return what arrived; the driver decides.
            if exc.partial:
                return exc.partial.decode(self.encoding, errors="replace").strip()
            raise TransportError("connection closed by projector") from exc
        except (OSError, ConnectionError) as exc:
            raise TransportError(f"read failed: {exc}") from exc
        return raw.decode(self.encoding, errors="replace").strip()

    async def write(self, payload: str) -> None:
        if self._writer is None:
            raise TransportError("write on a closed transport")
        try:
            self._writer.write(payload.encode(self.encoding))
            await asyncio.wait_for(self._writer.drain(), timeout=self.read_timeout)
        except (TimeoutError, OSError, ConnectionError) as exc:
            raise TransportError(f"write failed: {exc}") from exc

    async def request(self, payload: str, timeout: float | None = None) -> str:
        """Write a frame and read the single frame that answers it."""
        await self.write(payload)
        return await self.read_line(timeout=timeout)

    async def drain_pending(self, window: float = 0.05) -> list[str]:
        """Consume any unsolicited frames sitting in the buffer.

        Called before issuing a command so a stale response from a timed-out
        predecessor is never mistaken for the answer to the new command. This
        is the single most important piece of hygiene in a protocol with no
        request IDs.
        """
        stale: list[str] = []
        if self._reader is None:
            return stale
        while True:
            try:
                line = await asyncio.wait_for(
                    self._reader.readuntil(self.terminator), timeout=window
                )
            except (TimeoutError, asyncio.IncompleteReadError, OSError, ConnectionError):
                return stale
            decoded = line.decode(self.encoding, errors="replace").strip()
            if decoded:
                stale.append(decoded)
                log.warning("discarded stale frame from %s:%s: %r", self.host, self.port, decoded)
            if len(stale) > 16:  # pathological; stop rather than spin
                return stale


async def probe_tcp(host: str, port: int, timeout: float = 2.0) -> bool:
    """Cheap reachability check that does not speak any protocol."""
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=timeout
        )
    except (TimeoutError, OSError):
        return False
    writer.close()
    with contextlib.suppress(TimeoutError, OSError):
        await asyncio.wait_for(writer.wait_closed(), timeout=1.0)
    return True
