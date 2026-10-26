"""Backup and restore in a built server app, the way Settings → Backup does it.

Run against the Mac app and the Windows server on their build machines
(.github/workflows/mac.yml, desktop/windows/ci/check-windows-server.ps1),
with whatever restarts the server running it: launchd's KeepAlive (or a
loop standing in for it) on the Mac, the service's recovery on Windows.

    python desktop/ci/check_backup.py http://127.0.0.1:8765 <admin password>

Makes a backup, removes a projector, restores the backup, waits for the
server to restart by itself, and checks the projector is back. Standard
library only. Prints "ok" for each check, exits 1 on the first failure.
"""

from __future__ import annotations

import io
import json
import sys
import time
import urllib.error
import urllib.request
import zipfile

BASE, PASSWORD = sys.argv[1].rstrip("/"), sys.argv[2]
# The Windows runner's console is cp1252, which has no "→".
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
NAME = "Backup check"


def call(method: str, path: str, body=None, token: str | None = None, raw: bool = False):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(BASE + path, data=data, method=method)
    if data is not None:
        request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=120) as response:  # noqa: S310
        content = response.read()
    if raw:
        return content
    return json.loads(content) if content else None


def check(ok: bool, what: str) -> None:
    if not ok:
        print(f"FAILED: {what}", flush=True)
        sys.exit(1)
    print(f"ok  {what}", flush=True)


def login() -> str:
    return call("POST", "/api/auth/login", {"username": "admin", "password": PASSWORD})["access_token"]


def names(token: str) -> list[str]:
    return [p["name"] for p in call("GET", "/api/projectors", token=token)]


def up() -> bool:
    try:
        call("GET", "/api/health")
        return True
    except (urllib.error.URLError, OSError):
        return False


token = login()
made = call("POST", "/api/projectors", {
    "name": NAME, "host": "192.0.2.10", "port": 4352, "driver": "pjlink",
    "password": "projector-web-login", "enabled": False}, token)
check(made["name"] == NAME, "a projector is added")

entry = call("POST", "/api/backups", {}, token)
check(entry["contents"].get("projectors", 0) >= 1 and not entry["problem"],
      f"Back up makes {entry['name']} ({entry['size_bytes']} bytes)")
listed = call("GET", "/api/backups", token=token)
check(listed["can_restart"], "the server says it restarts itself after a restore")

link = call("POST", f"/api/backups/{entry['name']}/link", token=token)
data = call("GET", link["url"], raw=True)  # a plain link, no sign-in
with zipfile.ZipFile(io.BytesIO(data)) as archive:
    inside = set(archive.namelist())
    guide = archive.read("SETUP-GUIDE.txt").decode()
check({"backup.json", "projector-control.db", "SETUP-GUIDE.txt"} <= inside,
      "Download gives the zip with the database and the setup guide")
check(NAME in guide and "projector-web-login" not in guide,
      "the setup guide in it lists the projector and no password")
printed = call("GET", "/api/setup-guide", token=token)
check(any(p["name"] == NAME for p in printed["projectors"]), "the printable setup guide answers")

call("DELETE", f"/api/projectors/{made['id']}", token=token)
check(NAME not in names(token), "the projector is removed")

started = time.monotonic()
reply = call("POST", f"/api/backups/{entry['name']}/restore", {"confirm": True}, token)
check(reply["restarting"], "Restore starts and the server restarts")
went_down = False
while time.monotonic() - started < 180:
    if not up():
        went_down = True
    elif went_down:
        break
    time.sleep(1)
check(went_down and up(), f"the server is back by itself after {time.monotonic() - started:.0f} s")

token = login()
check(NAME in names(token), "the removed projector is back from the backup")
listed = call("GET", "/api/backups", token=token)
check(bool(listed["last_restore"]) and listed["last_restore"]["ok"], "Settings → Backup says it was restored")
check(any(b["kind"] == "before-restore" for b in listed["backups"]),
      "how things were before the restore was saved first")
call("DELETE", f"/api/projectors/{[p for p in call('GET', '/api/projectors', token=token) if p['name'] == NAME][0]['id']}",
     token=token)
print("Backup and restore work.")
