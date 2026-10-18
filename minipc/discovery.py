"""Finding the main server on the local network.

The server answers a UDP broadcast (backend/app/services/discovery.py) with
its HTTP port; the address the answer comes from is the server's address.
"""

from __future__ import annotations

import errno
import json
import socket
import time

import requests

#: Kept in step with backend/app/services/discovery.py.
REQUEST = b"projectionmapping-discover/1"
DEFAULT_PORT = 8765


def local_address() -> str | None:
    """This computer's address on its main network (sends nothing)."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        try:
            probe.connect(("192.0.2.1", 9))  # TEST-NET-1: never routed anywhere real
            address = probe.getsockname()[0]
        except OSError:
            return None
    return None if address.startswith("127.") or address == "0.0.0.0" else address


def broadcast_targets(port: int) -> list[tuple[str, int]]:
    """Everywhere to ask. Windows sends 255.255.255.255 out of one network
    adapter only, so the main network's own broadcast address goes too
    (assuming the usual /24)."""
    targets = [("255.255.255.255", port)]
    address = local_address()
    if address:
        targets.append((address.rsplit(".", 1)[0] + ".255", port))
    return targets


def find_server(port: int = DEFAULT_PORT, *, timeout: float = 2.0,
                targets: list[tuple[str, int]] | None = None) -> str | None:
    """Ask the network where the server is; its base URL, or None."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        for target in targets or broadcast_targets(port):
            try:
                sock.sendto(REQUEST, target)
            except OSError:
                continue  # no route for that one; try the others
        deadline = time.monotonic() + timeout
        while (left := deadline - time.monotonic()) > 0:
            sock.settimeout(left)
            try:
                data, (host, _) = sock.recvfrom(2048)
            except TimeoutError:
                return None
            except OSError as exc:
                # Windows reports here an ICMP error that an earlier datagram
                # drew, and a datagram too big for the buffer (it is dropped):
                # neither is the server's answer, which may still come.
                if isinstance(exc, ConnectionResetError) or exc.errno == errno.EMSGSIZE:
                    continue
                return None
            try:
                reply = json.loads(data)
                if reply.get("service") == "projectionmapping" and isinstance(reply.get("port"), int):
                    return f"http://{host}:{reply['port']}"
            except (ValueError, AttributeError):
                continue
    return None


def answers(base: str, *, timeout: float = 3.0) -> bool:
    """Whether the server at ``base`` is up (a degraded database still is)."""
    try:
        response = requests.get(f"{base.rstrip('/')}/api/health", timeout=timeout)
        body = response.json() if response.status_code == 200 else None
        # Whatever else answers at that address may send any JSON at all.
        return isinstance(body, dict) and "status" in body
    except (requests.RequestException, ValueError):
        return False
