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
down the computer. Commands live in memory for a short while only, so a
restart asked for before the server itself restarted never happens later.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import hmac
import secrets
import socket
import sys
import time
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, func, select

from app.api.deps import CurrentUser, RequireAdmin, RequireViewer, SessionDep, write_rate_limit
from app.api.routes.mapping import _output_out, _touch
from app.config import settings
from app.core.events import bus
from app.core.security import create_access_token, hash_password
from app.db.models import (
    Event,
    MappingOutput,
    MappingPlayer,
    Role,
    Severity,
    User,
    as_utc,
    utcnow,
)
from app.schemas.mapping import (
    NetworkInfo,
    PlayerApp,
    PlayerAppHello,
    PlayerAppReply,
    PlayerAssignment,
    PlayerCommand,
    PlayerCommandResult,
    PlayerHello,
    PlayerHelloResponse,
    PlayerOut,
    PlayerReport,
    PlayerScreen,
    PlayerUpdate,
)
from app.services.discovery import lan_address, tailscale_address

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
#: When each player's Mini PC app last checked in (_now()).
_app_seen: dict[int, float] = {}


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
    return PlayerApp(connected=app_connected(player), power=bool(info.get("power")),
                     computer=info.get("computer"), mac=info.get("mac"))


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
    info = {"power": payload.power, "computer": payload.computer, "mac": payload.mac}
    old = (player.report or {}).get("app")
    if old != info:
        # Kept with the report: the network card is needed when it is off.
        player.report = {**(player.report or {}), "app": info}
        await session.commit()
    if first or old != info:
        _changed(player.id)
    return PlayerAppReply(commands=_take(player.id, "app"))


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
    return PlayerAssignment(player_id=player.id, name=player.name,
                            output_id=out.output_id, show_id=out.show_id,
                            commands=_take(player.id, "page") if player.kind != "camera" else [])
