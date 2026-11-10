"""A stand-in for GitHub's release API, for the Windows server build check.

Serves one ``windows-server-latest`` release whose zip is a local file, so the
installed service can be updated (and rolled back) on the build machine
exactly as it would be from GitHub. The service is pointed here with
UPDATE_API_BASE.

    python fake_release.py PORT VERSION ZIP
"""

from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(sys.argv[1])
VERSION = sys.argv[2]
ZIP = Path(sys.argv[3])
ASSET = "ProjectorControl-Windows-Server.zip"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - http.server's name
        if self.path.endswith("/releases/tags/windows-server-latest"):
            body = json.dumps({
                "name": f"Projector Control for Windows server {VERSION}",
                "assets": [{"name": ASSET, "url": f"http://127.0.0.1:{PORT}/download/{ASSET}"}],
            }).encode()
            self.send("application/json", body)
        elif self.path.startswith("/download/"):
            self.send("application/octet-stream", ZIP.read_bytes())
        elif self.path.startswith("/repos/"):
            self.send("application/json", b"{}")
        else:
            self.send_error(404)

    def send(self, kind: str, body: bytes) -> None:
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print(f"release {VERSION} at http://127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
