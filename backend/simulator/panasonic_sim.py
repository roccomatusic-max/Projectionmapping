"""Panasonic NTCONTROL (Protocol 2) projector simulator.

Speaks the wire protocol the PT-DZ13K driver expects: the NTCONTROL
greeting, MD5 authentication, the ``00<CMD>`` framing and the ER4nn / ERRn
error vocabulary. Control commands are acknowledged by echoing the mnemonic
(``00PON``); queries are answered with the ID followed by the value alone
(``00001`` for ``QPW``), which is the form Panasonic's own LAN examples show.

Its purpose is to let the control logic — queues, retries, verification,
group dispatch — be exercised without putting a real projector at risk. It
is **not** a substitute for hardware validation; see
docs/HARDWARE-VALIDATION.md.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import logging
import secrets

from .state import SimPower, SimulatedProjector

log = logging.getLogger(__name__)


class PanasonicSimulator:
    def __init__(self, state: SimulatedProjector | None = None,
                 host: str = "127.0.0.1", port: int = 11024) -> None:
        self.state = state or SimulatedProjector()
        self.host = host
        self.port = port
        self._server: asyncio.AbstractServer | None = None

    @property
    def actual_port(self) -> int:
        if self._server and self._server.sockets:
            return self._server.sockets[0].getsockname()[1]
        return self.port

    async def start(self) -> PanasonicSimulator:
        self._server = await asyncio.start_server(self._handle, self.host, self.port)
        log.info("Panasonic simulator listening on %s:%s", self.host, self.actual_port)
        return self

    async def stop(self) -> None:
        if self._server:
            self._server.close()
            await self._server.wait_closed()
            self._server = None

    async def __aenter__(self) -> PanasonicSimulator:
        return await self.start()

    async def __aexit__(self, *_: object) -> None:
        await self.stop()

    # -- session -----------------------------------------------------------

    async def _handle(self, reader: asyncio.StreamReader,
                      writer: asyncio.StreamWriter) -> None:
        seed = secrets.token_hex(4)
        expected_digest: str | None = None
        if self.state.password:
            expected_digest = hashlib.md5(
                f"{self.state.username}:{self.state.password}:{seed}".encode()
            ).hexdigest()
            writer.write(f"NTCONTROL 1 {seed}\r".encode())
        else:
            writer.write(b"NTCONTROL 0\r")
        await writer.drain()

        authenticated = expected_digest is None
        try:
            while True:
                raw = await reader.readuntil(b"\r")
                line = raw.decode("ascii", errors="replace").strip()
                if not line:
                    continue

                if self.state.silent:
                    continue  # exercise the controller's timeout handling
                if self.state.should_drop():
                    break

                # The digest, when present, prefixes the first command only.
                if not authenticated:
                    if len(line) < 32:
                        writer.write(b"ERRA\r")
                        await writer.drain()
                        continue
                    digest, line = line[:32], line[32:]
                    if digest.lower() != expected_digest:
                        writer.write(b"ERRA\r")
                        await writer.drain()
                        break
                    authenticated = True

                response = self._dispatch(line)
                if self.state.command_count in self.state.drop_reply_indices:
                    # Command processed, reply withheld: the controller must
                    # treat this as a timeout with UNKNOWN device state.
                    continue
                writer.write(f"{response}\r".encode())
                await writer.drain()
                if self.state.close_after_reply:
                    break
        except (asyncio.IncompleteReadError, ConnectionError, asyncio.CancelledError):
            pass
        finally:
            writer.close()
            with contextlib.suppress(ConnectionError, OSError):
                await writer.wait_closed()

    # -- command dispatch --------------------------------------------------

    def _dispatch(self, frame: str) -> str:
        if not frame.startswith("00"):
            return "ERR1"
        body = frame[2:]
        if self.state.busy:
            return "ERR3"

        self.state.tick()
        command, _, param = body.partition(":")
        command = command.upper()

        match command:
            # A real unit answers ER401 ("cannot be executed") to power-on
            # while cooling down and to power-off while starting up: the
            # same code it uses for a command the model does not have.
            case "PON":
                return "00PON" if self.state.power_on() else "00ER401"
            case "POF":
                return "00POF" if self.state.power_off() else "00ER401"
            case "QPW":
                return "00001" if self.state.is_on else "00000"
            case "OSH":
                if param not in ("0", "1"):
                    return "00ER402"
                if self.state.standby_refuses_controls and not self.state.is_on:
                    return "00ER401"
                self.state.set_shutter(param == "1")
                return "00OSH"
            case "QSH":
                return f"00{'1' if self.state.shutter_closed else '0'}"
            case "IIS":
                if not param:
                    return "00ER402"
                if self.state.standby_refuses_controls and not self.state.is_on:
                    return "00ER401"
                # An input with no board fitted answers ER401, exactly as the
                # real unit does. This is what the driver's capability
                # retraction logic is written against.
                return "00IIS" if self.state.set_input(param.upper()) else "00ER401"
            case "QIN":
                return f"00{self.state.active_input}"
            case "Q$L":
                try:
                    index = int(param) - 1
                except ValueError:
                    return "00ER402"
                if not 0 <= index < len(self.state.lamp_hours):
                    return "00ER401"
                return f"00{self.state.lamp_hours[index]:08d}"
            case "Q$S":
                return f"00{self._lamp_control_status()}"
            case "QLS":
                return "00" + "".join("1" if on else "0" for on in self.state.lamp_on)
            case "QTM":
                return self._temperature(param)
            case "VXX":
                return self._lens(param)
            case "LPM":
                if len(self.state.lamp_hours) < 2:
                    return "00ER401"  # single-lamp model: no lamp select
                if param not in ("0", "1", "2", "3"):
                    return "00ER402"
                self.state.lamp_select = param
                return "00LPM"
            case "OLP":
                if param not in ("0", "1"):
                    return "00ER402"
                self.state.lamp_power = param
                return "00OLP"
        return "00ER401"

    def _lamp_control_status(self) -> str:
        match self.state.power:
            case SimPower.STANDBY:
                return "0"
            case SimPower.WARMING:
                return "1"
            case SimPower.ON:
                return "2"
            case SimPower.COOLING:
                return "3"
        return "0"

    def _temperature(self, code: str) -> str:
        """``QTM:<n>`` → Celsius/Fahrenheit, four characters each."""
        celsius = self.state.temperature(code)
        if celsius is None:
            return "00ER401"
        if not self.state.temperatures_in_standby and self.state.power is not SimPower.ON:
            return "00ER401"
        fahrenheit = celsius * 9 / 5 + 32
        return f"00{round(celsius):04d}/{round(fahrenheit):04d}"

    def _lens(self, param: str) -> str:
        if param.startswith("LNSI"):
            return "00VXX"
        return "00ER401"


async def main() -> None:  # pragma: no cover - CLI entry point
    import argparse

    parser = argparse.ArgumentParser(
        description="Panasonic PT-DZ13K NTCONTROL simulator (clearly simulated data)"
    )
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=11024)
    parser.add_argument("--password", default=None,
                        help="Enable protect mode with this password")
    parser.add_argument("--warmup", type=float, default=20.0)
    parser.add_argument("--cooldown", type=float, default=30.0)
    parser.add_argument("--no-sdi", action="store_true",
                        help="Simulate a unit with no SDI board fitted (default)")
    parser.add_argument("--with-sdi", action="store_true",
                        help="Simulate a unit with the SDI board fitted")
    parser.add_argument("--lenient-standby", action="store_true",
                        help="Accept shutter and input changes in standby (real units refuse them)")
    parser.add_argument("--fault", choices=["silent", "busy", "drop"], default=None)
    parser.add_argument("--model", choices=["dz13k", "dz770"], default="dz13k",
                        help="dz13k: 3-chip, 4 lamps, SDI option; dz770: 1-chip, 2 lamps, S-VIDEO")
    parser.add_argument("--pjlink-port", type=int, default=None,
                        help="Also answer PJLink on this port (4352 on a real unit), "
                             "for fan and temperature condition")
    parser.add_argument("--hot", type=float, default=0.0,
                        help="Add this many °C to every temperature sensor")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    factory = SimulatedProjector.dz770 if args.model == "dz770" else SimulatedProjector
    state = factory(
        warmup_seconds=args.warmup, cooldown_seconds=args.cooldown,
        password=args.password,
        standby_refuses_controls=not args.lenient_standby,
    )
    if args.with_sdi:
        state.fitted_inputs |= {"SD1", "SD2"}
    if args.fault == "silent":
        state.silent = True
    elif args.fault == "busy":
        state.busy = True
    elif args.fault == "drop":
        state.drop_after = 3
    state.temperature_offset = args.hot

    simulator = PanasonicSimulator(state, host=args.host, port=args.port)
    await simulator.start()
    print(f"SIMULATED {state.model} on {args.host}:{args.port} "
          f"(protect mode: {'on' if args.password else 'off'})")
    if args.pjlink_port:
        from .pjlink_sim import PJLinkSimulator

        await PJLinkSimulator(state, host=args.host, port=args.pjlink_port).start()
        print(f"  and PJLink on {args.host}:{args.pjlink_port} (same password)")
    print("This is a simulator. Data it reports is not from real hardware.")
    await asyncio.Event().wait()


if __name__ == "__main__":  # pragma: no cover
    asyncio.run(main())
