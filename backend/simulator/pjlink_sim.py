"""PJLink Class 1/2 projector simulator."""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import logging
import secrets

from .state import SimPower, SimulatedProjector

log = logging.getLogger(__name__)

#: PJLink input codes mapped onto the simulator's Panasonic-style names, so
#: one state object can back both simulators in a dual-transport test.
PJLINK_INPUTS = {"11": "RG1", "12": "RG2", "21": "VID", "31": "DVI", "32": "HD1",
                 "33": "SD1", "34": "SD2"}


class PJLinkSimulator:
    def __init__(self, state: SimulatedProjector | None = None,
                 host: str = "127.0.0.1", port: int = 14352,
                 pjlink_class: int = 2) -> None:
        self.state = state or SimulatedProjector()
        self.host = host
        self.port = port
        self.pjlink_class = pjlink_class
        self._server: asyncio.AbstractServer | None = None

    @property
    def actual_port(self) -> int:
        if self._server and self._server.sockets:
            return self._server.sockets[0].getsockname()[1]
        return self.port

    async def start(self) -> PJLinkSimulator:
        self._server = await asyncio.start_server(self._handle, self.host, self.port)
        log.info("PJLink simulator listening on %s:%s", self.host, self.actual_port)
        return self

    async def stop(self) -> None:
        if self._server:
            self._server.close()
            await self._server.wait_closed()
            self._server = None

    async def __aenter__(self) -> PJLinkSimulator:
        return await self.start()

    async def __aexit__(self, *_: object) -> None:
        await self.stop()

    async def _handle(self, reader: asyncio.StreamReader,
                      writer: asyncio.StreamWriter) -> None:
        seed = secrets.token_hex(4)
        expected: str | None = None
        if self.state.password:
            # PJLink digests md5(seed || password) — no username, no separator.
            expected = hashlib.md5(f"{seed}{self.state.password}".encode()).hexdigest()
            writer.write(f"PJLINK 1 {seed}\r".encode())
        else:
            writer.write(b"PJLINK 0\r")
        await writer.drain()

        authenticated = expected is None
        try:
            while True:
                raw = await reader.readuntil(b"\r")
                line = raw.decode("ascii", errors="replace").strip()
                if not line:
                    continue
                if self.state.silent:
                    continue
                if self.state.should_drop():
                    break

                if not authenticated:
                    if len(line) < 32 or line[:32].lower() != expected:
                        writer.write(b"PJLINK ERRA\r")
                        await writer.drain()
                        break
                    line = line[32:]
                    authenticated = True

                response = self._dispatch(line)
                if self.state.command_count in self.state.drop_reply_indices:
                    continue  # processed, reply withheld
                writer.write(f"{response}\r".encode())
                await writer.drain()
        except (asyncio.IncompleteReadError, ConnectionError, asyncio.CancelledError):
            pass
        finally:
            writer.close()
            with contextlib.suppress(ConnectionError, OSError):
                await writer.wait_closed()

    def _dispatch(self, frame: str) -> str:
        if not frame.startswith("%"):
            return "%1UNDF=ERR1"
        cls, command = frame[1], frame[2:6].upper()
        param = frame[7:].strip() if len(frame) > 7 else ""
        prefix = f"%{cls}{command}"

        if self.state.busy:
            return f"{prefix}=ERR3"
        if cls == "2" and self.pjlink_class < 2:
            return f"{prefix}=ERR1"

        self.state.tick()

        match command:
            case "POWR":
                if param == "?":
                    return f"{prefix}=" + {
                        SimPower.STANDBY: "0", SimPower.ON: "1",
                        SimPower.COOLING: "2", SimPower.WARMING: "3",
                    }[self.state.power]
                if param == "1":
                    return f"{prefix}=OK" if self.state.power_on() else f"{prefix}=ERR3"
                if param == "0":
                    return f"{prefix}=OK" if self.state.power_off() else f"{prefix}=ERR3"
                return f"{prefix}=ERR2"
            case "INPT":
                if param == "?":
                    for code, name in PJLINK_INPUTS.items():
                        if name == self.state.active_input:
                            return f"{prefix}={code}"
                    return f"{prefix}=11"
                name = PJLINK_INPUTS.get(param)
                if name is None:
                    return f"{prefix}=ERR2"
                return f"{prefix}=OK" if self.state.set_input(name) else f"{prefix}=ERR2"
            case "AVMT":
                if param == "?":
                    return f"{prefix}={'31' if self.state.shutter_closed else '30'}"
                if param in ("11", "31"):
                    self.state.set_shutter(True)
                    return f"{prefix}=OK"
                if param in ("10", "30", "20", "21"):
                    self.state.set_shutter(param not in ("10", "30"))
                    if param in ("10", "30"):
                        self.state.set_shutter(False)
                    return f"{prefix}=OK"
                return f"{prefix}=ERR2"
            case "ERST":
                return f"{prefix}=" + "".join(str(d) for d in self.state.erst)
            case "LAMP":
                pairs = [f"{hours} {'1' if on else '0'}"
                         for hours, on in zip(self.state.lamp_hours, self.state.lamp_on, strict=False)]
                return f"{prefix}=" + " ".join(pairs)
            case "INST":
                codes = [c for c, n in PJLINK_INPUTS.items() if n in self.state.fitted_inputs]
                return f"{prefix}=" + " ".join(sorted(codes))
            case "NAME":
                return f"{prefix}={self.state.name}"
            case "INF1":
                return f"{prefix}={self.state.manufacturer}"
            case "INF2":
                return f"{prefix}={self.state.model}"
            case "INFO":
                return f"{prefix}=Simulated projector"
            case "CLSS":
                return f"{prefix}={self.pjlink_class}"
            case "SNUM":
                return f"{prefix}={self.state.serial}"
            case "SVER":
                return f"{prefix}={self.state.firmware}"
            case "IRES":
                return f"{prefix}=1920x1200" if self.state.is_on else f"{prefix}=-"
            case "FILT":
                return f"{prefix}=420"
        return f"{prefix}=ERR1"


async def main() -> None:  # pragma: no cover - CLI entry point
    import argparse

    parser = argparse.ArgumentParser(description="PJLink projector simulator")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=14352)
    parser.add_argument("--password", default=None)
    parser.add_argument("--class", dest="pjlink_class", type=int, choices=[1, 2], default=2)
    parser.add_argument("--warmup", type=float, default=20.0)
    parser.add_argument("--cooldown", type=float, default=30.0)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    state = SimulatedProjector(warmup_seconds=args.warmup,
                               cooldown_seconds=args.cooldown, password=args.password)
    simulator = PJLinkSimulator(state, host=args.host, port=args.port,
                                pjlink_class=args.pjlink_class)
    await simulator.start()
    print(f"SIMULATED PJLink class {args.pjlink_class} projector on "
          f"{args.host}:{args.port}")
    print("This is a simulator. Data it reports is not from real hardware.")
    await asyncio.Event().wait()


if __name__ == "__main__":  # pragma: no cover
    asyncio.run(main())
