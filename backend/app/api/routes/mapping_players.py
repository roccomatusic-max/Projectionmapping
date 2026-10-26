"""Players: the small computers that drive one projector each.

Cameras (see mapping_camera.py) pair through the same endpoints with
``kind: camera`` and are listed here too.

Setting one up is: install the Mini PC app on it (minipc/), or open
``/player`` in a full-screen browser on it; read the pairing code off the
projector, approve that code on the Mapping page and pick its output.
Everything after that (which show, which cue, geometry changes) reaches it
over the network.

The Mini PC app also runs the camera when one is plugged in. That camera
pairs with the same secret as the computer's player, which is how the
server knows they are one machine: it is approved and removed with it.

Controls on the Players page reach a mini PC two ways. The player page
picks up its commands with its heartbeat (reload, the status overlay),
which every installed Mini PC app has. The Mini PC app itself checks in
every few seconds with the computer's secret (since it learned to) and
picks up what only it can do: restart the output window, restart or shut
down the computer, install a newer Mini PC app (services/minipc_updates.py),
swap which screen is the projector when a monitor is plugged in beside it.
Commands live in memory for a short while only, so a
restart asked for before the server itself restarted never happens later.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import contextlib
import hashlib
import hmac
import secrets
import socket
import sys
import time
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import FileResponse
from sqlalchemy import delete, func, select

from app.api.deps import (
    CurrentUser,
    RequireAdmin,
    RequireViewer,
    SessionDep,
    command_rate_limit,
    write_rate_limit,
)
from app.api.routes.mapping import _output_out, _touch
from app.api.routes.projectors import _dispatch
from app.api.routes.tonight import start_tonight, stop_tonight
from app.config import settings
from app.core.events import bus
from app.core.security import create_access_token, hash_password
from app.db.models import (
    Event,
    MappingOutput,
    MappingPlayer,
    MappingShow,
    Projector,
    Role,
    Severity,
    User,
    as_utc,
    utcnow,
)
from app.drivers import CommandOutcome
from app.schemas.mapping import (
    NetworkInfo,
    PlayerApp,
    PlayerAppHello,
    PlayerAppLog,
    PlayerAppLogOut,
    PlayerAppReply,
    PlayerAssignment,
    PlayerCommand,
    PlayerCommandResult,
    PlayerHello,
    PlayerHelloResponse,
    PlayerOut,
    PlayerPicture,
    PlayerReport,
    PlayerScreen,
    PlayerScreens,
    PlayerUpdate,
    ScreenControl,
    ScreenControlResult,
    ScreenFlat,
    ScreenWarp,
    SurfaceFlat,
)
from app.services import minipc_updates
from app.services.alerts import alerting
from app.services.calibration import is_convex
from app.services.discovery import lan_address, tailscale_address
from app.services.emergency import emergency
from app.services.mapping import TransportError, transport

router = APIRouter(prefix="/mapping/players", tags=["mapping"])

#: A player reports every few seconds; this long without one is offline.
ONLINE_SECONDS = 15
#: Unapproved players are forgotten after this, and capped in number, so
#: the open hello endpoint cannot be used to fill the database.
PENDING_TTL = timedelta(hours=24)
MAX_PENDING = 50
#: Player tokens are long-lived; removing the player revokes them.
TOKEN_DAYS = 3650
#: No 0/O or 1/I: the code is read off a wall from across a car park.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


#: A command not picked up within this is dropped: the mini PC was off or
#: asleep, and doing it much later would surprise whoever is standing there.
COMMAND_SECONDS = 30.0
#: The Mini PC app checks in every few seconds; this long without one, it is
#: not running (or is an older app that does not check in).
APP_SECONDS = 15.0

def _now() -> float:
    return time.monotonic()


#: Waiting commands by (player id, "page" or "app"): (action, when asked).
_queued: dict[tuple[int, str], list[tuple[str, float]]] = {}
#: The last log each Mini PC app sent (Get the log, or after an update).
_logs: dict[str, PlayerAppLogOut] = {}
#: When each player's Mini PC app last checked in (_now()).
_app_seen: dict[int, float] = {}

#: The Dashboard's live view: the latest picture of each mini PC's output,
#: kept in memory only: (JPEG bytes, when received (_now())). Each player
#: page sends a copy of the frame it draws; nothing photographs the screen.
_pictures: dict[int, tuple[bytes, float]] = {}
#: Pictures are asked for only while someone has the live view open.
_watched_until = 0.0
#: How long one look at the live view keeps the pictures coming.
WATCH_SECONDS = 30.0
#: The status screen on a mini PC's own second monitor (/player/screen)
#: watches that one mini PC's pictures, day and night: by player id, until
#: when. It asks for them faster and larger than the Dashboard, and never
#: makes the other mini PCs send theirs.
_watched_close: dict[int, float] = {}
CLOSE_PICTURE_MS = 1000
CLOSE_PICTURE_WIDTH = 960


def _watching() -> bool:
    return _now() < _watched_until


def _watched_closely(player_id: int) -> bool:
    return _now() < _watched_close.get(player_id, 0.0)


def _jpeg(image: str) -> bytes:
    try:
        data = base64.b64decode(image, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="The picture is not base64") from None
    if not data.startswith(b"\xff\xd8"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="The picture must be a JPEG")
    return data


def _queue(player_id: int, target: str, action: str) -> None:
    waiting = _queued.setdefault((player_id, target), [])
    # Pressing a button twice asks once.
    waiting[:] = [(a, t) for a, t in waiting if a != action]
    waiting.append((action, _now()))


def _take(player_id: int, target: str) -> list[str]:
    now = _now()
    return [a for a, t in _queued.pop((player_id, target), []) if now - t <= COMMAND_SECONDS]


def app_connected(player: MappingPlayer) -> bool:
    seen = _app_seen.get(player.id)
    return seen is not None and _now() - seen <= APP_SECONDS


def _app_info(player: MappingPlayer) -> PlayerApp | None:
    info = (player.report or {}).get("app")
    if not isinstance(info, dict) and player.id not in _app_seen:
        return None
    info = info if isinstance(info, dict) else {}
    version = info.get("version")
    screens = None
    if isinstance(info.get("screens"), dict):
        with contextlib.suppress(ValueError):
            screens = PlayerScreens(**info["screens"])
    return PlayerApp(connected=app_connected(player), power=bool(info.get("power")),
                     computer=info.get("computer"), mac=info.get("mac"), version=version,
                     awake=info.get("awake") if isinstance(info.get("awake"), list) else None,
                     screens=screens, watchdog=bool(info.get("watchdog")),
                     log_at=getattr(_saved_log(player), "received_at", None),
                     **minipc_updates.get().describe(player.id, version))


def _log_path(player: MappingPlayer) -> Path:
    """By the computer, not the row: a mini PC paired again keeps its log."""
    name = hashlib.sha256(player.device_id.encode()).hexdigest()[:24]
    return minipc_updates.get().folder.parent / "minipc-logs" / f"{name}.json"


def _saved_log(player: MappingPlayer) -> PlayerAppLogOut | None:
    """The last log this mini PC sent; kept on disk, so a restart keeps it."""
    if player.device_id not in _logs:
        try:
            _logs[player.device_id] = PlayerAppLogOut.model_validate_json(
                _log_path(player).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
    return _logs[player.device_id]


def wake_on_lan(mac: str, near: str | None = None) -> None:
    """Send the Wake-on-LAN magic packet for ``mac`` to the whole network."""
    packet = b"\xff" * 6 + bytes.fromhex(mac.replace(":", "")) * 16
    targets = {"255.255.255.255"}
    if near and near.count(".") == 3:
        # The usual home or office network is a /24: its own broadcast
        # address also reaches it where the all-ones one is not routed.
        targets.add(near.rsplit(".", 1)[0] + ".255")
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        for target in targets:
            for port in (9, 7):
                with contextlib.suppress(OSError):
                    sock.sendto(packet, (target, port))


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def _code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))


def is_online(player: MappingPlayer) -> bool:
    seen = as_utc(player.last_seen_at)
    return seen is not None and (utcnow() - seen).total_seconds() <= ONLINE_SECONDS


async def _companion(session, player: MappingPlayer) -> MappingPlayer | None:
    """The other half of the same mini PC: same secret, the other kind."""
    return (await session.execute(select(MappingPlayer).where(
        MappingPlayer.secret_hash == player.secret_hash,
        MappingPlayer.id != player.id,
        MappingPlayer.kind != player.kind,
    ))).scalars().first()


async def _approve(session, player: MappingPlayer, message: str) -> None:
    """Give the player its own viewer account; the caller commits."""
    user = User(username=f"player-{player.id}-{secrets.token_hex(3)}",
                password_hash=await asyncio.to_thread(hash_password, secrets.token_urlsafe(32)),
                role=Role.VIEWER.value)
    session.add(user)
    await session.flush()
    player.user_id = user.id
    player.approved = True
    session.add(Event(projector_id=None, severity=Severity.INFO.value,
                      kind="player_approved", message=message))


async def _player_out(session, player: MappingPlayer) -> PlayerOut:
    show_id = screen = None
    if player.output_id is not None:
        row = (await session.execute(
            select(MappingOutput.show_id, MappingOutput.test_pattern)
            .where(MappingOutput.id == player.output_id)
        )).first()
        if row is not None:
            show_id, screen = row
    return PlayerOut(
        id=player.id, name=player.name, kind=player.kind or "player", code=player.code,
        approved=player.approved,
        output_id=player.output_id, show_id=show_id, online=is_online(player),
        last_seen_at=player.last_seen_at, report=player.report or {},
        companion_id=getattr(await _companion(session, player), "id", None),
        screen=screen, app=_app_info(player) if (player.kind or "player") == "player" else None,
    )


def _changed(player_id: int) -> None:
    bus.publish("mapping_player", {"player_id": player_id})


@router.post("/hello", response_model=PlayerHelloResponse)
async def hello(payload: PlayerHello, session: SessionDep) -> PlayerHelloResponse:
    """Unauthenticated: a player introduces itself, then polls until approved.

    The device secret never leaves the player except to this endpoint, and
    only its hash is stored. A token is handed out only to the holder of
    the secret of an approved player.
    """
    await session.execute(delete(MappingPlayer).where(
        MappingPlayer.approved.is_(False),
        MappingPlayer.created_at < utcnow() - PENDING_TTL,
    ))
    player = (await session.execute(
        select(MappingPlayer).where(MappingPlayer.device_id == payload.device_id)
    )).scalars().first()

    if player is None:
        pending = (await session.execute(
            select(func.count()).select_from(MappingPlayer)
            .where(MappingPlayer.approved.is_(False))
        )).scalar_one()
        if pending >= MAX_PENDING:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                                detail="Too many players are waiting for approval")
        player = MappingPlayer(device_id=payload.device_id, secret_hash=_hash(payload.secret),
                               name=payload.name, kind=payload.kind, code=_code())
        session.add(player)
        await session.commit()
        await session.refresh(player)
        _changed(player.id)
    elif not hmac.compare_digest(player.secret_hash, _hash(payload.secret)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="This device id is registered with a different secret")
    else:
        player.last_seen_at = utcnow()
        await session.commit()

    if not player.approved and player.kind == "camera":
        host = await _companion(session, player)
        if host is not None and host.approved:
            await _approve(session, player, f"camera {player.name} paired with mini PC {host.name}")
            await session.commit()
            await session.refresh(player)
            _changed(player.id)

    token = None
    if player.approved and player.user_id is not None:
        user = await session.get(User, player.user_id)
        if user is not None and user.is_active:
            token = create_access_token(user.username, user.role,
                                        expires_minutes=TOKEN_DAYS * 24 * 60)
    return PlayerHelloResponse(
        player_id=player.id, status="approved" if token else "pending",
        code=player.code, name=player.name, access_token=token,
    )


@router.get("/network", response_model=NetworkInfo)
async def network(_: RequireViewer) -> NetworkInfo:
    """Whether mini PCs and phones can reach this server, and how."""
    address = anywhere = None
    if not settings.local_only and settings.advertise_port is not None:
        ip, tailscale = lan_address(), tailscale_address()
        address = f"http://{ip}:{settings.advertise_port}" if ip else None
        anywhere = f"http://{tailscale}:{settings.advertise_port}" if tailscale else None
    system = {"darwin": "mac", "win32": "windows"}.get(sys.platform, "linux")
    return NetworkInfo(local_only=settings.local_only,
                       discoverable=settings.advertise_port is not None, address=address,
                       tailscale_address=anywhere, server_os=system)


@router.get("", response_model=list[PlayerOut])
async def list_players(session: SessionDep, _: RequireViewer) -> list[PlayerOut]:
    players = (await session.execute(
        select(MappingPlayer).order_by(MappingPlayer.approved, MappingPlayer.name)
    )).scalars().all()
    return [await _player_out(session, p) for p in players]


async def _load(session, player_id: int) -> MappingPlayer:
    player = await session.get(MappingPlayer, player_id)
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Player {player_id} not found")
    return player


@router.patch("/{player_id}", response_model=PlayerOut,
              dependencies=[Depends(write_rate_limit)])
async def update_player(player_id: int, payload: PlayerUpdate, session: SessionDep,
                        admin: RequireAdmin) -> PlayerOut:
    player = await _load(session, player_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("output_id") is not None and player.kind == "camera":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="A camera does not drive an output")
    if "output_id" in changes and changes["output_id"] is not None and \
            await session.get(MappingOutput, changes["output_id"]) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Unknown output id {changes['output_id']}")
    if changes.get("name") is not None:
        player.name = changes["name"]
    if "output_id" in changes:
        player.output_id = changes["output_id"]
    companion = await _companion(session, player)
    if changes.get("approved") and not player.approved:
        await _approve(session, player, f"{admin.username} approved player {player.name} "
                                  f"(code {player.code})")
        if companion is not None and not companion.approved:
            await _approve(session, companion, f"camera {companion.name} paired with mini PC "
                                         f"{player.name}")
    elif changes.get("approved") is False and player.approved:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="To revoke a player, remove it")
    await session.commit()
    _changed(player.id)
    if companion is not None:
        _changed(companion.id)
    return await _player_out(session, player)


@router.delete("/{player_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None,
               dependencies=[Depends(write_rate_limit)])
async def delete_player(player_id: int, session: SessionDep, admin: RequireAdmin) -> None:
    player = await _load(session, player_id)
    companion = await _companion(session, player)
    if player.kind == "camera" and companion is not None:
        # Its mini PC would only pair it again: the camera goes with it.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"This camera is part of mini PC {companion.name}. Remove "
                                   "the mini PC, or unplug the camera from it.")
    removed = [player] + ([companion] if companion is not None else [])
    for gone in removed:
        if gone.user_id is not None:
            user = await session.get(User, gone.user_id)
            if user is not None:
                await session.delete(user)
        await session.delete(gone)
    session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="player_removed",
                      message=f"{admin.username} removed player {player.name}"
                              + (" and its camera" if companion is not None else "")))
    await session.commit()
    for gone in removed:
        _app_seen.pop(gone.id, None)
        _logs.pop(gone.device_id, None)
        with contextlib.suppress(OSError):
            _log_path(gone).unlink(missing_ok=True)
        _pictures.pop(gone.id, None)
        _watched_close.pop(gone.id, None)
        minipc_updates.get().forget(gone.id)
        for target in ("page", "app"):
            _queued.pop((gone.id, target), None)
        _changed(gone.id)


@router.post("/{player_id}/identify", status_code=status.HTTP_204_NO_CONTENT,
             response_model=None)
async def identify(player_id: int, session: SessionDep, _: RequireAdmin) -> None:
    """Flash the player's name on its projector, to tell machines apart."""
    await _load(session, player_id)
    bus.publish("mapping_identify", {"player_id": player_id})


@router.post("/{player_id}/command", response_model=PlayerCommandResult,
             dependencies=[Depends(write_rate_limit)])
async def command(player_id: int, payload: PlayerCommand, session: SessionDep,
                  admin: RequireAdmin) -> PlayerCommandResult:
    """A button on the Players page: restart the output, the overlay, power."""
    player = await _load(session, player_id)
    if (player.kind or "player") != "player" or not player.approved:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Only a paired mini PC takes these")
    action = payload.action
    online, app = is_online(player), app_connected(player)
    info = (player.report or {}).get("app") or {}

    def refuse(reason: str) -> HTTPException:
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=reason)

    if action == "wake":
        if online or app:
            raise refuse(f"{player.name} is already on.")
        mac = info.get("mac") if isinstance(info, dict) else None
        if not mac:
            raise refuse(f"The server does not know {player.name}'s network card yet. It learns it "
                         "from the newest Mini PC app while the mini PC is on.")
        wake_on_lan(mac, (player.report or {}).get("address"))
        session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="player_power",
                          message=f"{admin.username} sent a wake-up signal to mini PC {player.name}"))
        await session.commit()
        return PlayerCommandResult(
            via="network",
            message=f"Wake-up signal sent to {player.name}. It turns on only if Wake-on-LAN is "
                    "allowed in its BIOS settings; give it a minute.")

    if not online and not app:
        raise refuse(f"{player.name} is offline. Check it is on and plugged into the network.")

    if action in ("reboot", "shutdown"):
        if not app:
            raise refuse(f"{player.name} runs an older Mini PC app that cannot do this. Paste the "
                         "install line into PowerShell on it once to update it.")
        if not info.get("power"):
            raise refuse(f"{player.name} cannot restart or shut down its computer from here: "
                         "only the Windows Mini PC app can.")
        _queue(player.id, "app", action)
        # Its silence is expected now: no "mini PC offline" alert for it.
        alerting.expect_minipc_away(player.id, 10 if action == "reboot" else None)
        word = "restart" if action == "reboot" else "shut down"
        session.add(Event(projector_id=None, severity=Severity.WARNING.value, kind="player_power",
                          message=f"{admin.username} asked mini PC {player.name} to {word}"))
        await session.commit()
        return PlayerCommandResult(
            via="app",
            message=f"{player.name} is restarting. Its projector goes dark for a minute or two."
            if action == "reboot" else
            f"{player.name} is shutting down. Turn it back on with its power button"
            + (" or Turn on here." if info.get("mac") else "."))

    if action == "send_log":
        if not app:
            raise refuse(f"{player.name}'s Mini PC app is not answering, so it cannot send its log.")
        _queue(player.id, "app", "send_log")
        return PlayerCommandResult(via="app", message=f"Asked {player.name} for its log. It arrives "
                                                     "in a few seconds, below.")

    if action == "update":
        updates = minipc_updates.get()
        version = info.get("version") if isinstance(info, dict) else None
        if not app or not version:
            raise refuse(f"{player.name} runs an older Mini PC app that cannot update itself. "
                         "Paste the install line into PowerShell on it once; after that it "
                         "updates by itself." if app or not version else
                         f"{player.name}'s Mini PC app is not answering. Try Restart computer.")
        if not updates.needs(version):
            raise refuse(f"{player.name} already has the newest Mini PC app ({version})."
                         if updates.latest else
                         "This server has not got the newest Mini PC app yet: it needs the "
                         "internet for a moment. " + (updates.error or ""))
        busy = await minipc_updates.busy_reason()
        if busy and (busy.startswith("the emergency stop") or busy.startswith("a show is")):
            raise refuse(f"Not while {busy}: updating restarts the output on {player.name}.")
        updates.press_update(player.id)
        session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="player_update",
                          message=f"{admin.username} asked mini PC {player.name} to update its "
                                  f"app to {updates.latest.version}"))
        await session.commit()
        _changed(player.id)
        return PlayerCommandResult(
            via="app",
            message=f"{player.name} is updating to {updates.latest.version}. The projector keeps "
                    "the output; the app restarts in about a minute. The computer does not restart.")

    if action in ("swap_screens", "extend_screens"):
        screens = (info.get("screens") if isinstance(info, dict) else None) or {}
        if not app or not screens:
            raise refuse(f"{player.name} runs an older Mini PC app without the status screen. It "
                         "gets it with its next update, by itself.")
        if action == "swap_screens" and screens.get("count", 1) < 2:
            raise refuse(f"{player.name} has only one screen: plug a monitor in beside the "
                         "projector first.")
        if action == "extend_screens" and screens.get("state") != "duplicate":
            raise refuse(f"{player.name}'s screens already show different pictures.")
        _queue(player.id, "app", action)
        word = ("swap its screens" if action == "swap_screens"
                else "use its monitor as a second screen")
        session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="player_screens",
                          message=f"{admin.username} asked mini PC {player.name} to {word}"))
        await session.commit()
        return PlayerCommandResult(
            via="app",
            message=f"Swapping the screens on {player.name}: the output moves to the other "
                    "screen and the status screen to this one, in a few seconds."
            if action == "swap_screens" else
            f"{player.name} now shows the status screen on its monitor and the output on the "
            "projector. Both screens go dark for a moment.")

    if action == "restart_output":
        if app:
            # The app closes and reopens the browser: this also mends a page
            # that has stopped answering altogether.
            _queue(player.id, "app", "restart_output")
            return PlayerCommandResult(via="app", message=f"Restarting the output on {player.name}.")
        _queue(player.id, "page", "reload")
        _changed(player.id)
        return PlayerCommandResult(via="page", message=f"Reloading the output on {player.name}.")

    # The status overlay lives in the page.
    if not online:
        raise refuse(f"The output on {player.name} is not answering. Try Restart output.")
    _queue(player.id, "page", action)
    _changed(player.id)
    return PlayerCommandResult(
        via="page",
        message=f"Showing the status overlay on {player.name}'s projector." if action == "overlay_on"
        else f"Hiding the status overlay on {player.name}'s projector.")


@router.post("/{player_id}/screen", response_model=PlayerOut,
             dependencies=[Depends(write_rate_limit)])
async def screen(player_id: int, payload: PlayerScreen, session: SessionDep,
                 _: RequireAdmin) -> PlayerOut:
    """Put a test picture (grid, white, black, a colour) on its projector, or the show again.

    It is its output's test pattern, so the Editor and every window on that
    output show the same; saved maps leave it out.
    """
    player = await _load(session, player_id)
    if player.output_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Pick an output for this mini PC first")
    output = await session.get(MappingOutput, player.output_id)
    if output is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Pick an output for this mini PC first")
    output.test_pattern = payload.pattern
    await session.commit()
    await session.refresh(output)
    _touch(output.show_id, kind="mapping_output",
           payload={"output": _output_out(output).model_dump(mode="json")})
    _changed(player.id)
    return await _player_out(session, player)


@router.post("/app", response_model=PlayerAppReply)
async def app_checkin(payload: PlayerAppHello, session: SessionDep) -> PlayerAppReply:
    """Unauthenticated, like hello: the Mini PC app asks for its commands.

    It proves itself with its computer's secret, which only it and its own
    player page hold. Nothing is handed out before the player is approved.
    """
    player = (await session.execute(
        select(MappingPlayer).where(MappingPlayer.device_id == payload.device_id)
    )).scalars().first()
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not paired")
    if not hmac.compare_digest(player.secret_hash, _hash(payload.secret)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="This device id is registered with a different secret")
    if not player.approved:
        return PlayerAppReply()
    first = player.id not in _app_seen
    _app_seen[player.id] = _now()
    info = {"power": payload.power, "computer": payload.computer, "mac": payload.mac,
            "version": payload.version, "awake": payload.awake,
            "screens": payload.screens.model_dump() if payload.screens else None,
            "watchdog": payload.watchdog}
    old = (player.report or {}).get("app")
    updates = minipc_updates.get()
    before = updates.describe(player.id, payload.version)
    offer, note = updates.check_in(player.id, player.name, payload.version, payload.update,
                                   await _update_busy(session, player)
                                   if updates.needs(payload.version) else None)
    if note:
        session.add(Event(projector_id=None, kind="player_update", message=note,
                          severity=Severity.INFO.value if "updated" in note
                          else Severity.WARNING.value))
    if old != info or note:
        # Kept with the report: the network card is needed when it is off.
        player.report = {**(player.report or {}), "app": info}
        await session.commit()
    if first or old != info or note or offer or before != updates.describe(player.id, payload.version):
        _changed(player.id)
    return PlayerAppReply(commands=_take(player.id, "app"), update=offer)


async def _app_player(session, device_id: str, secret: str) -> MappingPlayer:
    """The paired mini PC an app request comes from, by its computer's secret."""
    player = (await session.execute(
        select(MappingPlayer).where(MappingPlayer.device_id == device_id)
    )).scalars().first()
    if player is None or not player.approved:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not paired")
    if not hmac.compare_digest(player.secret_hash, _hash(secret)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="This device id is registered with a different secret")
    return player


@router.post("/app/log", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def app_log(payload: PlayerAppLog, session: SessionDep) -> None:
    """The Mini PC app's log: asked for on the Players page, or sent after an update."""
    player = await _app_player(session, payload.device_id, payload.secret)
    saved = PlayerAppLogOut(text=payload.text, reason=payload.reason, received_at=utcnow())
    _logs[player.device_id] = saved
    path = _log_path(player)
    with contextlib.suppress(OSError):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(saved.model_dump_json(), encoding="utf-8")
    _changed(player.id)


@router.get("/{player_id}/log", response_model=PlayerAppLogOut)
async def player_log(player_id: int, session: SessionDep, _: RequireAdmin) -> PlayerAppLogOut:
    """The last log this mini PC's app sent."""
    saved = _saved_log(await _load(session, player_id))
    if saved is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No log from this mini PC yet. Press Get the log.")
    return saved


async def _update_busy(session, player: MappingPlayer) -> str | None:
    """Why this mini PC should not update its app right now, or None."""
    if player.output_id is not None:
        pattern = await session.scalar(
            select(MappingOutput.test_pattern).where(MappingOutput.id == player.output_id))
        if pattern:
            return "its projector is showing a test picture"
    return await minipc_updates.busy_reason()


@router.get("/app/installer", response_class=FileResponse)
async def app_installer() -> FileResponse:
    """The newest Mini PC app's installer, for mini PCs updating themselves.

    Open, like the release it comes from: the app checks its SHA-256, which
    it got by checking in with its secret.
    """
    latest = minipc_updates.get().latest
    if latest is None or not latest.path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="This server has no Mini PC app to hand out yet")
    return FileResponse(latest.path, media_type="application/octet-stream",
                        filename="MiniPC-Setup.exe")


@router.post("/me/picture", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def page_picture(payload: PlayerPicture, session: SessionDep, user: CurrentUser) -> None:
    """A copy of the frame this player page is drawing, for the live view."""
    player = (await session.execute(
        select(MappingPlayer).where(MappingPlayer.user_id == user.id)
    )).scalars().first()
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="This account is not a player")
    _pictures[player.id] = (_jpeg(payload.image), _now())


async def _own_player(session, user: User) -> MappingPlayer:
    """The approved mini PC this account belongs to, for its status screen's buttons."""
    player = (await session.execute(
        select(MappingPlayer).where(MappingPlayer.user_id == user.id)
    )).scalars().first()
    if player is None or (player.kind or "player") != "player" or not player.approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Only a paired mini PC's own status screen has these buttons")
    return player


async def screen_projector(session, player: MappingPlayer) -> tuple[int | None, bool]:
    """The projector this mini PC drives, and whether that is a guess.

    Its output's linked projector; with none linked and only one projector
    on the server, that one (the status screen says so).
    """
    output = await session.get(MappingOutput, player.output_id) if player.output_id else None
    if output is None:
        return None, False
    if output.projector_id is not None:
        return output.projector_id, False
    ids = (await session.execute(select(Projector.id).limit(2))).scalars().all()
    return (ids[0], True) if len(ids) == 1 else (None, False)


@router.post("/me/emergency-stop", response_model=ScreenControlResult)
async def screen_emergency_stop(session: SessionDep, user: CurrentUser) -> ScreenControlResult:
    """The emergency stop on a mini PC's status screen. No rate limit, like the others."""
    player = await _own_player(session, user)
    await emergency.press(username=f"{player.name} (status screen)", user_id=user.id,
                          source="minipc")
    return ScreenControlResult(ok=True, message="Emergency stop is on: the show is stopped, every "
                                                "mini PC is black and the projectors are turning off.")


@router.post("/me/warp", response_model=ScreenControlResult,
             dependencies=[Depends(write_rate_limit)])
async def screen_warp(payload: ScreenWarp, session: SessionDep,
                      user: CurrentUser) -> ScreenControlResult:
    """This mini PC's picture fitted onto the ground with the mouse on its status screen.

    Only its own output, and only the corners of its picture and the grid
    that helps line them up: a projector on the roof pointing down at the
    driveway is fitted from beside it, watching the light.
    """
    player = await _own_player(session, user)
    output = await session.get(MappingOutput, player.output_id) if player.output_id else None
    if output is None:
        return ScreenControlResult(ok=False, message="Pick an output for this mini PC on "
                                                     "Mapping → Players first.")
    if payload.grid and transport.snapshot().status in ("playing", "paused"):
        return ScreenControlResult(ok=False, message="The show is playing. Stop it first, so the "
                                                     "grid does not show during the show.")
    corners = payload.corners or [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]]
    if not is_convex(corners):
        return ScreenControlResult(ok=False, message="Those corners cross over. Drag one back.")
    warp = dict(output.warp or {})
    output.warp = {**warp, "corners": [list(p) for p in corners]}
    if payload.grid:
        output.test_pattern = "grid"
    elif output.test_pattern == "grid":
        output.test_pattern = "none"
    if not payload.grid:
        session.add(Event(projector_id=output.projector_id, severity=Severity.INFO.value,
                          kind="mapping_output",
                          message=f"{player.name} (status screen) fitted {output.name} to the ground"))
    await session.commit()
    await session.refresh(output)
    _touch(output.show_id, kind="mapping_output",
           payload={"output": _output_out(output).model_dump(mode="json")})
    if payload.grid:
        return ScreenControlResult(ok=True, message="Saved.")
    return ScreenControlResult(ok=True, message=f"Saved. The grid on {output.name} is off.")


@router.post("/me/control", response_model=ScreenControlResult,
             dependencies=[Depends(command_rate_limit)])
async def screen_control(payload: ScreenControl, session: SessionDep,
                         user: CurrentUser) -> ScreenControlResult:
    """A button on the status screen of the mini PC's own monitor.

    Only for that mini PC's account, and only for its show, its projector
    and its own output: it stands beside them.
    """
    player = await _own_player(session, user)
    by = f"{player.name} (status screen)"
    action = payload.action

    if action in ("start_tonight", "stop_tonight"):
        acting = SimpleNamespace(id=user.id, username=by)
        result = await (start_tonight if action == "start_tonight" else stop_tonight)(session, acting)
        return ScreenControlResult(ok=result.ok, message=result.message)

    if action in ("go", "pause", "resume", "blackout"):
        show_id = None
        if action == "go" and transport.snapshot().show_id is None:
            show_id = (await _player_out(session, player)).show_id
        try:
            await transport.command(action, show_id=show_id)
        except TransportError as exc:
            return ScreenControlResult(ok=False, message=str(exc))
        session.add(Event(projector_id=None, severity=Severity.INFO.value, kind="show_transport",
                          message=f"{by}: {action}"))
        await session.commit()
        words = {"go": "Next cue.", "pause": "Paused.", "resume": "Playing again.",
                 "blackout": "Blacked out. Press GO to start again."}
        return ScreenControlResult(ok=True, message=words[action])

    if action == "restart_output":
        if app_connected(player):
            _queue(player.id, "app", "restart_output")
        else:
            _queue(player.id, "page", "reload")
            _changed(player.id)
        return ScreenControlResult(ok=True, message="Restarting the output. The projector goes "
                                                    "dark for a few seconds.")

    output = await session.get(MappingOutput, player.output_id) if player.output_id else None
    if action == "link_projector":
        if output is None:
            return ScreenControlResult(ok=False, message="Pick an output for this mini PC on "
                                                         "Mapping → Players first.")
        if output.projector_id is not None:
            return ScreenControlResult(ok=False, message="This output already has a projector. "
                                                         "Change it in the Editor.")
        projector = await session.get(Projector, payload.projector_id) if payload.projector_id else None
        if projector is None:
            return ScreenControlResult(ok=False, message="That projector is gone.")
        output.projector_id = projector.id
        session.add(Event(projector_id=projector.id, severity=Severity.INFO.value,
                          kind="mapping_output",
                          message=f"{by} linked {output.name} to {projector.name}"))
        await session.commit()
        await session.refresh(output)
        _touch(output.show_id, kind="mapping_output",
               payload={"output": _output_out(output).model_dump(mode="json")})
        return ScreenControlResult(ok=True, message=f"{output.name} now drives {projector.name}.")

    # power_on / power_off
    projector_id, _guessed = await screen_projector(session, player)
    if projector_id is None:
        return ScreenControlResult(ok=False, message="No projector is linked to this output yet.")
    state = "on" if action == "power_on" else "off"
    if state == "off" and not payload.confirm:
        return ScreenControlResult(ok=False, message="Press Projector off again to turn it off.")
    result = await _dispatch(projector_id, "power.set", {"state": state},
                             SimpleNamespace(id=user.id, username=by), source="minipc")
    outcome = CommandOutcome(result.outcome)
    if outcome is CommandOutcome.QUEUED:
        return ScreenControlResult(ok=True, message=f"The projector is cooling down; it turns {state} "
                                                    "by itself as soon as it can.")
    if outcome.is_success:
        return ScreenControlResult(ok=True, message=f"Turning the projector {state}.")
    return ScreenControlResult(ok=False, message=f"The projector did not turn {state}: "
                                                 f"{result.error or outcome.value.replace('_', ' ')}.")


#: How long the checkerboard square stays on the projectors after the last drag.
FLAT_TEST_MS = 10 * 60 * 1000


@router.post("/me/flat", response_model=ScreenControlResult,
             dependencies=[Depends(write_rate_limit)])
async def screen_flat(payload: ScreenFlat, session: SessionDep,
                      user: CurrentUser) -> ScreenControlResult:
    """Corners of a house part dragged with the mouse on the mini PC's status screen.

    Only the mini PC's own show, and only a part's flat view (what makes
    things drawn on a sloped roof look right): nothing else of the show.
    """
    player = await _own_player(session, user)
    show_id = (await _player_out(session, player)).show_id
    show = await session.get(MappingShow, show_id) if show_id is not None else None
    if show is None:
        return ScreenControlResult(ok=False, message="This mini PC has no show yet.")
    surfaces = list(show.surfaces or [])
    index = next((i for i, s in enumerate(surfaces) if s.get("id") == payload.surface_id), None)
    if index is None:
        return ScreenControlResult(ok=False, message="That house part is gone. Trace it again on Scenes → House parts.")
    part = dict(surfaces[index])
    if payload.corners is None:
        part.pop("flat", None)
        message = f"{part.get('name') or 'The part'} is no longer straightened."
    else:
        try:
            flat = SurfaceFlat(corners=payload.corners,
                               test_until=time.time() * 1000 + FLAT_TEST_MS if payload.test else None)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
        part["flat"] = flat.model_dump(mode="json")
        message = "Saved." if payload.test else f"Saved. The checkerboard on {part.get('name') or 'the part'} is off."
    surfaces[index] = part
    show.surfaces = surfaces
    await session.commit()
    _touch(show.id)
    return ScreenControlResult(ok=True, message=message)


@router.get("/{player_id}/picture", response_model=None,
            responses={200: {"content": {"image/jpeg": {}}}})
async def picture(player_id: int, session: SessionDep, user: RequireViewer) -> Response:
    """The latest picture of what this mini PC is showing, for the live view.

    Asking for it is what makes the mini PCs send pictures, for the next
    half a minute. ``X-Picture-Age`` is its age in seconds. Asked by the
    mini PC itself (its status screen), only that one sends, more often.
    """
    global _watched_until
    player = await _load(session, player_id)
    if player.user_id is not None and player.user_id == user.id:
        _watched_close[player_id] = _now() + WATCH_SECONDS
    else:
        _watched_until = _now() + WATCH_SECONDS
    held = _pictures.get(player_id)
    if held is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    data, at = held
    return Response(content=data, media_type="image/jpeg", headers={
        "Cache-Control": "no-store",
        "X-Picture-Age": f"{max(0.0, _now() - at):.1f}",
    })


@router.post("/me", response_model=PlayerAssignment)
async def report(payload: PlayerReport, request: Request, session: SessionDep,
                 user: CurrentUser) -> PlayerAssignment:
    """A player's heartbeat: records its health, returns its assignment."""
    player = (await session.execute(
        select(MappingPlayer).where(MappingPlayer.user_id == user.id)
    )).scalars().first()
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="This account is not a player")
    player.last_seen_at = utcnow()
    kept = {k: v for k, v in (player.report or {}).items() if k == "app"}
    address = request.client.host if request.client else None
    player.report = {**payload.model_dump(exclude_none=True), **kept,
                     **({"address": address} if address else {})}
    await session.commit()
    out = await _player_out(session, player)
    close = _watched_closely(player.id)
    return PlayerAssignment(player_id=player.id, name=player.name,
                            output_id=out.output_id, show_id=out.show_id,
                            commands=_take(player.id, "page") if player.kind != "camera" else [],
                            picture=(_watching() or close) and player.kind != "camera",
                            picture_ms=CLOSE_PICTURE_MS if close else 3000,
                            picture_width=CLOSE_PICTURE_WIDTH if close else 480)
