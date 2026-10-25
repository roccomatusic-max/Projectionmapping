"""The Mini PC app updating itself, end to end, on a real Windows computer.

Run by the Windows build check (.github/workflows/minipc.yml), not by pytest:

    python minipc/tests/windows_selfupdate_e2e.py dist/MiniPC-Setup.exe 1.0.42

It installs the app pointed at a stand-in main server, which offers it an
update (the same installer, called 9.9.9). The app has to download it,
hand over, get installed again, and the NEW app has to come back and keep
checking in, saying the update left it on its own version. That is the
whole path a mini PC beside a projector takes, minus the projector.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SETUP = Path(sys.argv[1]).resolve()
INSTALLED = sys.argv[2]
OFFERED = "9.9.9"
BODY = SETUP.read_bytes()
SHA = hashlib.sha256(BODY).hexdigest()
DATA = Path(os.environ["LOCALAPPDATA"]) / "ProjectionMapping MiniPC"
APP = Path(os.environ["LOCALAPPDATA"]) / "Programs" / "Mini PC" / "MiniPC.exe"
DEVICE = {"device_id": "mpc-e2e0000000000000000000001", "secret": "e" * 64}

checkins: list[tuple[float, dict]] = []
downloads: list[float] = []


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, kind: str = "application/json") -> None:
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/api/health":
            self._send(200, b'{"status": "ok"}')
        elif self.path == "/api/mapping/players/app/installer":
            downloads.append(time.monotonic())
            self._send(200, BODY, "application/octet-stream")
        else:  # the output window's page
            self._send(200, b"<html><body style='background:#000'>output</body></html>", "text/html")

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length) or b"{}")
        if self.path != "/api/mapping/players/app":
            self._send(404, b"{}")
            return
        checkins.append((time.monotonic(), body))
        failed = any((b.get("update") or {}).get("state") == "failed" for _, b in checkins)
        offer = None
        if body.get("version") == INSTALLED and not failed:
            offer = {"version": OFFERED, "sha256": SHA, "size": len(BODY),
                     "url": "/api/mapping/players/app/installer"}
        self._send(200, json.dumps({"commands": [], "update": offer}).encode())

    def log_message(self, *_args) -> None:
        pass


def processes() -> list[str]:
    out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq MiniPC.exe", "/FO", "CSV", "/NH"],
                         capture_output=True, text=True, check=False).stdout
    return [line.split(",")[1].strip('"') for line in out.splitlines() if line.startswith('"MiniPC')]


def wait(what: str, check, seconds: float) -> None:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if check():
            print(f"ok: {what}", flush=True)
            return
        time.sleep(1)
    raise SystemExit(f"FAILED: {what} (within {seconds:.0f} s)")


def show_logs() -> None:
    for path in [DATA / "logs" / "minipc.log", DATA / "updates" / "result.json"]:
        print(f"----- {path}", flush=True)
        try:
            print(path.read_text(encoding="utf-8-sig", errors="replace")[-6000:], flush=True)
        except OSError as exc:
            print(f"(none: {exc})", flush=True)
    print("----- check-ins", flush=True)
    start = checkins[0][0] if checkins else 0
    for at, body in checkins[-40:]:
        print(f"{at - start:7.1f}s version={body.get('version')} update={body.get('update')}", flush=True)
    print(f"----- MiniPC processes now: {processes()}", flush=True)


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / "config.json").write_text(json.dumps({
        **DEVICE, "name": "e2e", "server": base, "last_server": base, "camera": "off"}), encoding="utf-8")
    try:
        subprocess.run([str(SETUP), "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"], check=True)
        wait("the installed app checks in", lambda: any(b.get("version") == INSTALLED for _, b in checkins), 90)
        first = processes()
        print(f"app processes before the update: {first}", flush=True)
        wait("it downloads the update from the main server", lambda: bool(downloads), 60)
        wait("it says the download is ready",
             lambda: any((b.get("update") or {}).get("state") == "ready" for _, b in checkins), 60)
        handed = time.monotonic()
        wait("the new app comes back and checks in after the install",
             lambda: any(at > handed + 2 and (b.get("update") or {}).get("state") == "failed"
                         for at, b in checkins), 240)
        last = [b for _, b in checkins][-1]
        if "still version" not in str((last.get("update") or {}).get("error")):
            raise SystemExit(f"FAILED: unexpected report after the update: {last}")
        print(f"app processes after the update: {processes()}", flush=True)
        if set(processes()) & set(first):
            raise SystemExit("FAILED: the old app is still running")
        # And it keeps going: check-ins every few seconds for half a minute.
        before = len(checkins)
        time.sleep(30)
        if len(checkins) - before < 5:
            raise SystemExit(f"FAILED: only {len(checkins) - before} check-ins in 30 s after the update")
        print("ok: the new app keeps checking in", flush=True)
    finally:
        show_logs()
        subprocess.run(["taskkill", "/IM", "MiniPC.exe", "/F"], capture_output=True, check=False)
        server.shutdown()


if __name__ == "__main__":
    main()
