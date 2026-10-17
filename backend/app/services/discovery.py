"""Answer mini PCs looking for this server on the local network.

A mini PC (minipc/) broadcasts ``REQUEST`` to UDP ``discovery_port``. Each
server that advertises itself answers with its HTTP port and name, and the
mini PC connects to the address the answer came from. Nobody has to type
an address, and a server whose address changes overnight is found again.

The answer says only that a server is here and on which port, which an
open HTTP port says anyway. It runs only when the server is reachable from
the network (desktop ``--lan``, or ``ADVERTISE_PORT`` set by hand).
"""

from __future__ import annotations

import asyncio
import json
import logging
import socket

log = logging.getLogger(__name__)

#: Kept in step with minipc/discovery.py.
REQUEST = b"projectionmapping-discover/1"


class _Responder(asyncio.DatagramProtocol):
    def __init__(self, reply: bytes) -> None:
        self.reply = reply
        self.transport: asyncio.DatagramTransport | None = None

    def connection_made(self, transport: asyncio.BaseTransport) -> None:
        self.transport = transport  # type: ignore[assignment]

    def datagram_received(self, data: bytes, addr: tuple) -> None:
        if data.strip() == REQUEST and self.transport is not None:
            self.transport.sendto(self.reply, addr)


class Discovery:
    def __init__(self) -> None:
        self._transport: asyncio.DatagramTransport | None = None

    @property
    def port(self) -> int | None:
        """The UDP port actually bound, once started."""
        if self._transport is None:
            return None
        return self._transport.get_extra_info("sockname")[1]

    async def start(self, *, port: int, http_port: int, host: str = "0.0.0.0") -> None:
        reply = json.dumps({"service": "projectionmapping", "port": http_port,
                            "name": socket.gethostname()}).encode()
        loop = asyncio.get_running_loop()
        try:
            self._transport, _ = await loop.create_datagram_endpoint(
                lambda: _Responder(reply), local_addr=(host, port))
        except OSError as exc:
            # Another server on this computer already answers; mini PCs can
            # still be given the address by hand.
            log.warning("mini PC discovery is off: UDP port %d is in use (%s)", port, exc)
            return
        log.info("answering mini PCs on UDP port %d", self.port)

    async def stop(self) -> None:
        if self._transport is not None:
            self._transport.close()
            self._transport = None


discovery = Discovery()


def lan_address() -> str | None:
    """This computer's address on its main network, for showing to people.

    Connecting a UDP socket sends nothing; it only asks the OS which
    interface it would route through.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        try:
            probe.connect(("192.0.2.1", 9))  # TEST-NET-1: never routed anywhere real
            address = probe.getsockname()[0]
        except OSError:
            return None
    return None if address.startswith("127.") or address == "0.0.0.0" else address
