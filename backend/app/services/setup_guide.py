"""The one-page setup guide: the whole system on paper.

Settings → Backup → Print the setup guide shows it as a page to print or
save as a PDF (frontend/src/pages/SetupGuide.tsx); every backup carries the
same facts as ``SETUP-GUIDE.txt``. It lists the server, every projector and
mini PC, the install lines and what to do when something breaks just before
the show. It names the sign-in but never holds a password or key.
"""

from __future__ import annotations

import socket
import sys
import textwrap
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select

from app.config import settings
from app.db.models import MappingOutput, MappingPlayer, MappingShow, Projector, Role, User
from app.drivers.registry import get as get_driver
from app.paths import app_version
from app.services.discovery import lan_address, tailscale_address

REPOSITORY = "https://github.com/roccomatusic-max/Projectionmapping"
RELEASES = f"{REPOSITORY}/releases/download"
MINIPC_INSTALL_LINE = (
    "[Net.ServicePointManager]::SecurityProtocol='Tls12'; irm "
    f"{RELEASES}/minipc-latest/install-minipc.ps1 | iex"
)
WINDOWS_SERVER_INSTALL_LINE = (
    "[Net.ServicePointManager]::SecurityProtocol='Tls12'; irm "
    f"{RELEASES}/windows-server-latest/install-windows-server.ps1 | iex"
)
MAC_SERVER_INSTALL_LINE = (
    'cd ~/Downloads && { [ -d "Projector Control.app" ] || ditto -x -k '
    'ProjectorControl-Mac-*.zip . ; } && xattr -cr "Projector Control.app" '
    '&& open "Projector Control.app"'
)
MAC_DOWNLOAD = f"{REPOSITORY}/releases/tag/mac-latest"
RESET = {
    "mac": ('"/Applications/Projector Control.app/Contents/MacOS/ProjectorControl" '
            "--reset-admin-password"),
    "windows": '& "C:\\Program Files\\Projector Control\\ProjectorControl.exe" '
               "--reset-admin-password",
}
DATA_FOLDER = {
    "mac": "~/Library/Application Support/ProjectorControl",
    "windows": "C:\\ProgramData\\ProjectorControl",
}
#: When something breaks at 6:40: what to try, in order.
STEPS = [
    ("The dashboard looks old or a fix is missing",
     "Settings → Updates and password → Check now → Install. It restarts in about a minute."),
    ("A projector shows the wrong picture, or freezes",
     "Players → that mini PC → Restart output. Still wrong: Restart computer."),
    ("A mini PC's card says the app stopped",
     "Wait 5 minutes (it restarts itself). Still stopped: on that mini PC, open "
     "PowerShell and paste the mini PC install line below."),
    ("The status monitor and the projector picture are swapped",
     "Players → that mini PC → Monitor → Swap screens."),
    ("Something is wrong and people are close",
     "Hold the red Emergency stop for one second (top bar, phone remote, status monitor). "
     "Everything goes black and the projectors close and turn off. Clear it when safe."),
    ("A projector does not answer",
     "Check it has power and its network cable. Projectors → that projector → Test "
     "connection. Panasonic: Edit projector → username admin1, password = its web login."),
    ("The server itself is gone",
     "Install the server on another computer (line below), sign in, Settings → Backup → "
     "Restore from a file, and pick the newest backup from your USB stick."),
]


def system() -> str:
    return {"darwin": "mac", "win32": "windows"}.get(sys.platform, "linux")


def _driver_name(driver_id: str) -> str:
    try:
        return get_driver(driver_id).display_name
    except KeyError:
        return driver_id


async def collect(session, *, last_backup: dict | None = None) -> dict[str, Any]:
    """Everything the guide shows, from the database and this computer."""
    from app.services import tonight

    host = system()
    port = settings.advertise_port
    address = None if settings.local_only or port is None else lan_address()
    tailscale = None if settings.local_only or port is None else tailscale_address()
    base = f"http://{address}:{port}" if address else None

    projectors = (await session.execute(select(Projector).order_by(Projector.name))).scalars().all()
    projector_names = {p.id: p.name for p in projectors}
    outputs = {o.id: o for o in (await session.execute(select(MappingOutput))).scalars().all()}
    shows = {s.id: s.name for s in (await session.execute(select(MappingShow))).scalars().all()}
    players = (await session.execute(
        select(MappingPlayer).where(MappingPlayer.approved.is_(True))
        .order_by(MappingPlayer.kind, MappingPlayer.name)
    )).scalars().all()
    admins = (await session.execute(
        select(User.username).where(User.role == Role.ADMIN.value, User.is_active.is_(True))
        .order_by(User.username)
    )).scalars().all()

    mini_pcs = []
    for player in players:
        report = player.report or {}
        app = report.get("app") if isinstance(report.get("app"), dict) else {}
        output = outputs.get(player.output_id or 0)
        screens = app.get("screens") if isinstance(app.get("screens"), dict) else {}
        mini_pcs.append({
            "name": player.name,
            "kind": player.kind or "player",
            "computer": app.get("computer"),
            "address": report.get("address"),
            "app_version": app.get("version"),
            "mac": app.get("mac"),
            "output": output.name if output else None,
            "show": shows.get(output.show_id) if output else None,
            "projector": projector_names.get(output.projector_id or 0) if output else None,
            "monitor": screens.get("state") == "on",
            "last_seen_at": player.last_seen_at,
        })

    try:
        plan = await tonight.describe(session)
    except Exception:  # noqa: BLE001 - the guide prints without it
        plan = None

    return {
        "generated_at": datetime.now(UTC),
        "server": {
            "computer": socket.gethostname(),
            "system": host,
            "version": app_version(),
            "address": base,
            "local_only": settings.local_only,
            "tailscale": f"http://{tailscale}:{port}" if tailscale else None,
            "phone_remote": f"{base}/remote" if base else None,
            "data_folder": DATA_FOLDER.get(host),
            "timezone": tonight.tz_name(),
        },
        "sign_in": {
            "admins": [name for name in admins if not name.startswith("player-")],
            "password_hint": "The password you chose. If it was never changed, it is in "
                             "FIRST-RUN-PASSWORD.txt in the data folder.",
            "reset": RESET.get(host),
            "reset_where": {"mac": "Terminal on the server Mac",
                            "windows": "PowerShell as administrator on the server"}.get(host),
        },
        "show": {
            # Shows are planned night by night on the calendar: the next one.
            "next_title": plan["next_title"] if plan else None,
            "next_starts_at": plan["next_starts_at"] if plan else None,
            "show_name": plan["show_name"] if plan else None,
            "group_name": plan["group_name"] if plan else None,
        },
        "projectors": [{
            "name": p.name,
            "location": p.location,
            "address": p.host,
            "port": p.port,
            "driver": _driver_name(p.driver),
            "manufacturer": p.manufacturer,
            "model": p.model,
            "username": p.username,
            "has_password": bool(p.password_enc),
            "pjlink_port": p.pjlink_port,
            "enabled": p.enabled,
        } for p in projectors],
        "mini_pcs": mini_pcs,
        "install": {
            "server": WINDOWS_SERVER_INSTALL_LINE if host == "windows" else MAC_SERVER_INSTALL_LINE,
            "server_note": ("PowerShell on the server, then Yes on the Windows prompt."
                            if host == "windows" else
                            f"Download the zip for the Mac's chip from {MAC_DOWNLOAD} first, "
                            "then paste this in Terminal."),
            "minipc": MINIPC_INSTALL_LINE,
            "minipc_note": "PowerShell on the mini PC (no administrator needed). The app "
                           "updates itself after that.",
        },
        "last_backup": last_backup,
        "steps": [{"title": title, "text": text} for title, text in STEPS],
    }


def as_text(guide: dict[str, Any]) -> str:
    """The guide as plain text, for the backup zip."""
    server, sign_in, show = guide["server"], guide["sign_in"], guide["show"]
    wrap = textwrap.TextWrapper(width=78, subsequent_indent="    ")
    lines = [
        "PROJECTOR CONTROL: SETUP GUIDE",
        f"Made {guide['generated_at']:%Y-%m-%d %H:%M} UTC on {server['computer']}, "
        f"version {server['version']}",
        "",
        "SERVER",
        f"  Dashboard:     {server['address'] or 'this computer only (http://127.0.0.1:8765)'}",
        f"  Phone remote:  {server['phone_remote'] or '-'}",
        f"  Computer:      {server['computer']} ({server['system']})",
        f"  Data folder:   {server['data_folder'] or '-'}",
        f"  Sign in as:    {', '.join(sign_in['admins']) or 'admin'}",
        f"  Password:      {sign_in['password_hint']}",
    ]
    if sign_in["reset"]:
        lines.append(f"  Forgot it:     in {sign_in['reset_where']}: {sign_in['reset']}")
    if show["next_starts_at"]:
        lines.append(f"  Next show:     {show['next_title'] or 'Show'}, "
                     f"{show['next_starts_at']:%a %b %d %H:%M} ({server['timezone']}); "
                     "shows are planned night by night on the Calendar")
    lines += ["", "PROJECTORS"]
    for p in guide["projectors"]:
        lines.append(wrap.fill(
            f"  {p['name']}: {p['address']}:{p['port']}, {p['driver']}, {p['model']}"
            + (f", sign-in {p['username']}" if p["username"] else "")
            + (f", at {p['location']}" if p["location"] else "")
            + ("" if p["enabled"] else " (switched off in the app)")))
    if not guide["projectors"]:
        lines.append("  (none yet)")
    lines += ["", "MINI PCS"]
    for m in guide["mini_pcs"]:
        plays = (f"plays {m['output']}" + (f" ({m['show']})" if m["show"] else "")
                 + (f" on {m['projector']}" if m["projector"] else "")) if m["output"] \
            else ("camera" if m["kind"] == "camera" else "plays nothing yet")
        lines.append(wrap.fill(
            f"  {m['name']}: {m['address'] or 'address unknown'}"
            + (f", app {m['app_version']}" if m["app_version"] else "")
            + f", {plays}" + (", status monitor" if m["monitor"] else "")))
    if not guide["mini_pcs"]:
        lines.append("  (none yet)")
    install = guide["install"]
    lines += ["", "INSTALL LINES",
              f"  Server ({install['server_note']}):", f"    {install['server']}",
              f"  Mini PC ({install['minipc_note']}):", f"    {install['minipc']}",
              "", "IF IT BREAKS AT 6:40"]
    for number, step in enumerate(guide["steps"], 1):
        lines.append(wrap.fill(f"  {number}. {step['title']}: {step['text']}"))
    return "\n".join(lines) + "\n"
