"""Integration surface for Home Assistant and other automation platforms."""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import (
    RequireAdmin,
    RequireOperator,
    RequireViewer,
    SessionDep,
    _FixedWindow,
    command_rate_limit,
    write_rate_limit,
)
from app.config import settings
from app.db.models import (
    Alert,
    AlertState,
    Group,
    MappingPlayer,
    MappingShow,
    Projector,
    ProjectorState,
    Scene,
    as_utc,
)
from app.drivers import capability_manifest
from app.paths import app_version
from app.services import homeassistant as ha
from app.services.automation import activate_scene
from app.services.device_manager import manager
from app.services.discovery import lan_address
from app.services.mapping import transport

router = APIRouter(prefix="/integration", tags=["integration"])


@router.get("/homeassistant/discovery")
async def homeassistant_discovery(session: SessionDep, _: RequireViewer) -> dict:
    """A flat description of everything this platform exposes.

    Intended for a Home Assistant REST/command_line integration (or any
    automation platform) that wants to build entities without MQTT. Only
    attributes backed by real telemetry are listed: a projector whose model
    has no temperature query does not get a temperature entity.
    """
    projectors = (await session.execute(
        select(Projector).where(Projector.enabled.is_(True)).order_by(Projector.name)
    )).scalars().all()
    states = {
        s.projector_id: s
        for s in (await session.execute(select(ProjectorState))).scalars().all()
    }
    scenes = (await session.execute(select(Scene).order_by(Scene.name))).scalars().all()
    groups = (await session.execute(select(Group).order_by(Group.name))).scalars().all()

    now = datetime.now(UTC)
    entities = []
    for projector in projectors:
        state = states.get(projector.id)
        attributes: dict[str, object] = {}
        online = False
        if state is not None and state.last_seen_at is not None:
            last_seen = as_utc(state.last_seen_at)
            stale_after = state.stale_after or int(
                settings.poll_operational * settings.staleness_multiplier
            )
            online = state.online and (now - last_seen) <= timedelta(seconds=stale_after)
            attributes = {
                "power": state.power, "shutter": state.shutter,
                "health": state.health, "last_seen": last_seen.isoformat(),
            }
            lamp = (state.lamp_hours or {})
            if lamp.get("availability") == "available":
                attributes["lamp_hours"] = lamp.get("value")
            active = (state.active_input or {})
            if active.get("availability") == "available":
                attributes["input"] = active.get("value")
        entities.append({
            "unique_id": f"projector_{projector.id}",
            "name": projector.name,
            "location": projector.location,
            "model": projector.model,
            "manufacturer": projector.manufacturer,
            "available": online,
            "state": "on" if (online and attributes.get("power") == "on") else "off",
            "attributes": attributes,
            "commands": {
                "power_on": {"method": "POST",
                             "path": f"/api/projectors/{projector.id}/power",
                             "body": {"state": "on", "confirm": True}},
                "power_off": {"method": "POST",
                              "path": f"/api/projectors/{projector.id}/power",
                              "body": {"state": "off", "confirm": True}},
                "shutter_open": {"method": "POST",
                                 "path": f"/api/projectors/{projector.id}/shutter",
                                 "body": {"state": "open", "confirm": True}},
                "shutter_close": {"method": "POST",
                                  "path": f"/api/projectors/{projector.id}/shutter",
                                  "body": {"state": "closed", "confirm": True}},
            },
        })

    open_alerts = (await session.execute(
        select(Alert).where(Alert.state != AlertState.RESOLVED.value)
    )).scalars().all()

    return {
        "platform": settings.app_name,
        "generated_at": now,
        "projectors": entities,
        "scenes": [
            {"id": s.id, "name": s.name,
             "activate": {"method": "POST", "path": f"/api/scenes/{s.id}/activate",
                          "body": {"confirm": True}}}
            for s in scenes
        ],
        "groups": [
            {"id": g.id, "name": g.name,
             "command": {"method": "POST", "path": f"/api/groups/{g.id}/commands",
                         "body": {"capability": "power.set",
                                  "params": {"state": "on"}, "confirm": True}}}
            for g in groups
        ],
        "alerts": {
            "open": len(open_alerts),
            "critical": sum(1 for a in open_alerts if a.severity == "critical"),
        },
    }


@router.post("/scenes/{scene_name}/activate", dependencies=[Depends(command_rate_limit)])
async def activate_scene_by_name(scene_name: str, session: SessionDep,
                                 user: RequireOperator) -> dict:
    """Activate a scene by name.

    Convenience for automation platforms that find it easier to template a
    name than to track numeric ids.
    """
    scene = (await session.execute(
        select(Scene).where(Scene.name == scene_name)
    )).scalars().first()
    if scene is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"No scene named {scene_name!r}")
    return await activate_scene(scene.id, user=user.username)


# -- Home Assistant integration ---------------------------------------------
#
# What custom_components/projector_control talks to. One feed with
# everything it shows (polled every few seconds), plus setup: the install
# line, pairing and the key. Commands go through the ordinary endpoints
# (projectors, transport, emergency, scenes), tagged X-Client: homeassistant.

#: Bumped when the feed changes in a way an older integration would misread.
HA_API_VERSION = 1

#: Wrong pairing codes allowed per address before pairing pauses.
pairing_failures = _FixedWindow(limit=10, window=300.0, scope="pairing")

_BASE_URL = re.compile(r"^https?://(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(:\d{1,5})?$")
_CODE = re.compile(r"^[A-Za-z0-9-]{4,32}$")


def _telemetry(field: dict[str, Any] | None) -> Any:
    """A stored reading's value, or None unless it is actually available."""
    if not field or field.get("availability") != "available":
        return None
    return field.get("value")


def _pjlink_input_label(code: str) -> str:
    family = {"1": "RGB", "2": "Video", "3": "Digital", "4": "Storage", "5": "Network"}
    if len(code) == 2 and code[0] in family:
        return f"{family[code[0]]} {code[1]}"
    return code


def _ha_projector(record: Projector, state_out, manifest: dict[str, Any]) -> dict[str, Any]:
    caps = {c["name"]: c for c in manifest.get("capabilities", [])}
    retracted = manifest.get("retracted", {}) or {}
    retracted_params = manifest.get("retracted_params", {}) or {}

    def can(name: str) -> bool:
        cap = caps.get(name)
        return (cap is not None and name not in retracted
                and (not cap.get("requires_opt_in") or record.allow_unverified_commands))

    inputs = []
    if can("input.set"):
        labels = caps["input.set"].get("param_labels") or {}
        inputs = [{"code": code, "label": labels.get(code) or _pjlink_input_label(code)}
                  for code in caps["input.set"].get("params") or []
                  if f"input.set:{code}" not in retracted_params]

    active = _telemetry(state_out.active_input)
    if isinstance(active, dict) and active.get("code"):
        current_input = {"code": str(active["code"]),
                         "label": str(active.get("label") or active["code"])}
    elif isinstance(active, str) and active:
        known = next((i["label"] for i in inputs if i["code"] == active), None)
        current_input = {"code": active, "label": known or _pjlink_input_label(active)}
    else:
        current_input = None

    lamps = _telemetry(state_out.lamp_hours)
    hours = [lamp.get("hours") for lamp in lamps if isinstance(lamp, dict)] if isinstance(
        lamps, list) else []
    hours = [h for h in hours if isinstance(h, int | float)]

    equipment = state_out.equipment or {}
    temperature = _telemetry(equipment.get("temperature")) or {}
    temperatures = [
        {"key": s.get("key"), "label": s.get("label"), "celsius": s.get("celsius")}
        for s in (temperature.get("sensors") or [])
        if isinstance(s, dict) and s.get("key") and s.get("celsius") is not None
    ]
    fan = _telemetry(equipment.get("fan")) or {}

    return {
        "id": record.id,
        "name": record.name,
        "manufacturer": record.manufacturer,
        "model": record.model,
        "location": record.location,
        "online": state_out.online,
        "power": state_out.power,
        "shutter": state_out.shutter,
        "health": state_out.health,
        "input": current_input,
        "inputs": inputs,
        "lamp_hours": max(hours) if hours else None,
        "temperatures": temperatures,
        "temperature_condition": temperature.get("condition"),
        "fan": fan.get("condition"),
        "errors": state_out.errors,
        "warnings": state_out.warnings,
        "last_error": state_out.last_error,
        "can": {"power": can("power.set"), "shutter": can("shutter.set"),
                "input": bool(inputs)},
    }


@router.get("/homeassistant/state")
async def homeassistant_state(session: SessionDep, user: RequireViewer,
                              request: Request) -> dict[str, Any]:
    """Everything the Home Assistant integration shows, in one answer.

    Projectors (power, shutter, input, temperatures, condition), the show
    (what is playing, which cue, the emergency stop), the shows and their
    cues, projector scenes, open alerts and how many mini PCs are online.
    A reading the projector does not give is left out, never sent as zero.
    """
    from app.api.routes.mapping_players import is_online
    from app.api.routes.projectors import _state_out

    if user.username == ha.HA_USERNAME:
        ha.link.seen(request.headers.get("x-integration-version"))

    records = (await session.execute(
        select(Projector).where(Projector.enabled.is_(True)).order_by(Projector.name)
    )).scalars().all()
    states = {
        s.projector_id: s
        for s in (await session.execute(select(ProjectorState))).scalars().all()
    }
    projectors = []
    for record in records:
        worker = manager.get(record.id)
        manifest = (worker.driver.capabilities.as_dict() if worker is not None
                    else capability_manifest(record.driver))
        projectors.append(_ha_projector(record, _state_out(record, states.get(record.id)),
                                        manifest))

    shows = (await session.execute(
        select(MappingShow).options(selectinload(MappingShow.cues)).order_by(MappingShow.name)
    )).scalars().all()
    show_names = {show.id: show.name for show in shows}
    snapshot = transport.snapshot()
    current = snapshot.current
    emergency = snapshot.emergency

    scenes = (await session.execute(select(Scene).order_by(Scene.name))).scalars().all()
    open_alerts = (await session.execute(
        select(Alert).where(Alert.state != AlertState.RESOLVED.value)
    )).scalars().all()
    players = (await session.execute(
        select(MappingPlayer).where(MappingPlayer.approved.is_(True),
                                    MappingPlayer.kind == "player")
    )).scalars().all()

    return {
        "api": HA_API_VERSION,
        "server": {
            "name": settings.app_name,
            "version": app_version(),
            "integration_version": ha.integration_version(),
        },
        "projectors": projectors,
        "show": {
            "status": snapshot.status,
            "show_id": snapshot.show_id,
            "show_name": show_names.get(snapshot.show_id) if snapshot.show_id else None,
            "cue_position": current.position if current and current.position >= 0 else None,
            "cue_name": current.name if current else None,
            "emergency": emergency is not None,
            "emergency_by": emergency.by if emergency else None,
            "emergency_at": (datetime.fromtimestamp(emergency.at_ms / 1000, UTC)
                             if emergency else None),
        },
        "shows": [
            {"id": show.id, "name": show.name,
             # Positions as GO counts them: 0 for the first cue, in order.
             "cues": [{"position": index, "name": cue.name}
                      for index, cue in enumerate(show.cues)]}
            for show in shows
        ],
        "scenes": [{"id": scene.id, "name": scene.name} for scene in scenes],
        "alerts": {
            "open": len(open_alerts),
            "critical": sum(1 for a in open_alerts if a.severity == "critical"),
        },
        "players": {"approved": len(players),
                    "online": sum(1 for p in players if is_online(p))},
    }


def _request_base(request: Request) -> str | None:
    base = str(request.base_url).rstrip("/")
    return base if _BASE_URL.match(base) else None


def _install_base(request: Request) -> str | None:
    """The address Home Assistant should use: this computer's network address.

    Not the browser's: an admin looking at Settings on the server itself
    sees "localhost", which from Home Assistant is Home Assistant.
    """
    if settings.advertise_port is not None and not settings.local_only:
        ip = lan_address()
        if ip:
            return f"http://{ip}:{settings.advertise_port}"
    base = _request_base(request)
    if base and not re.search(r"//(localhost|127\.|\[::1\])", base):
        return base
    return None


class HomeAssistantSetup(BaseModel):
    #: Whether Home Assistant has a key (its account exists).
    connected: bool
    connected_since: datetime | None = None
    #: When Home Assistant last asked for the state, since this server started.
    last_seen: datetime | None = None
    integration_version: str | None = None
    #: The version Home Assistant is running, as it last reported.
    installed_version: str | None = None
    #: Where Home Assistant reaches this server, when known.
    server_address: str | None = None
    #: The server accepts connections only from its own computer.
    local_only: bool = False


@router.get("/homeassistant/setup", response_model=HomeAssistantSetup)
async def homeassistant_setup(session: SessionDep, _: RequireAdmin,
                              request: Request) -> HomeAssistantSetup:
    user = await ha.ha_user(session)
    return HomeAssistantSetup(
        connected=user is not None,
        connected_since=as_utc(user.created_at) if user else None,
        last_seen=ha.link.last_seen if user else None,
        integration_version=ha.integration_version(),
        installed_version=ha.link.last_seen_version if user else None,
        server_address=_install_base(request),
        local_only=settings.local_only,
    )


class InstallLine(BaseModel):
    line: str
    code: str
    expires_at: datetime
    server_address: str


@router.post("/homeassistant/install-line", response_model=InstallLine,
             dependencies=[Depends(write_rate_limit)])
async def homeassistant_install_line(_: RequireAdmin, request: Request) -> InstallLine:
    """A fresh install line. Its pairing code works once, for an hour."""
    base = _install_base(request)
    if base is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Home Assistant cannot reach this server: it only accepts connections "
                   "from this computer. Start it with --lan (the Mac and Windows server "
                   "apps do this already), then open Settings from another device.",
        )
    if ha.integration_version() is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="This copy of the server does not include the Home "
                                   "Assistant integration.")
    code, expires = ha.link.new_pairing_code()
    return InstallLine(
        line=f"curl -fsSL {base}/api/integration/homeassistant/install/{code} | sh",
        code=code, expires_at=expires, server_address=base,
    )


class HomeAssistantKey(BaseModel):
    key: str
    expires_at: datetime
    server_address: str | None = None


@router.post("/homeassistant/key", response_model=HomeAssistantKey,
             dependencies=[Depends(write_rate_limit)])
async def homeassistant_key(session: SessionDep, admin: RequireAdmin,
                            request: Request) -> HomeAssistantKey:
    """A key to paste into Home Assistant by hand. Any older key stops working."""
    key, expires = await ha.issue_key(session, by=admin.username)
    return HomeAssistantKey(key=key, expires_at=expires, server_address=_install_base(request))


@router.delete("/homeassistant/key", status_code=status.HTTP_204_NO_CONTENT,
               response_model=None, dependencies=[Depends(write_rate_limit)])
async def homeassistant_disconnect(session: SessionDep, admin: RequireAdmin) -> None:
    """Disconnect Home Assistant: its key stops working at once."""
    await ha.disconnect(session, by=admin.username)


class PairRequest(BaseModel):
    code: str = Field(min_length=4, max_length=32)


@router.post("/homeassistant/pair", response_model=HomeAssistantKey)
async def homeassistant_pair(payload: PairRequest, session: SessionDep,
                             request: Request) -> HomeAssistantKey:
    """Trade the install line's pairing code for a key. Unauthenticated:
    the code is the proof, and it works once, for an hour."""
    principal = request.client.host if request.client else "-"
    wait = pairing_failures.retry_after(principal)
    if wait:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                            detail=f"Too many wrong codes. Try again in {wait} seconds.",
                            headers={"Retry-After": str(wait)})
    if not ha.link.take_pairing_code(payload.code):
        pairing_failures.record(principal)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That pairing code is used up or out of date. In Projector Control open "
                   "Settings > Home Assistant and make a new install line.",
        )
    key, expires = await ha.issue_key(session, by="Home Assistant (install line)")
    return HomeAssistantKey(key=key, expires_at=expires, server_address=_install_base(request))


def _script(request: Request, code: str | None) -> PlainTextResponse:
    # The address the installer itself was fetched from is known to work.
    base = _request_base(request) or _install_base(request)
    if base is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Unrecognised server address")
    return PlainTextResponse(ha.install_script(base, code),
                             headers={"Cache-Control": "no-store"})


@router.get("/homeassistant/install", response_class=PlainTextResponse)
async def homeassistant_install(request: Request) -> PlainTextResponse:
    """The installer without a pairing code: the setup form then asks for a key."""
    return _script(request, None)


@router.get("/homeassistant/install/{code}", response_class=PlainTextResponse)
async def homeassistant_install_with_code(code: str, request: Request) -> PlainTextResponse:
    """The installer behind the line in Settings. Public: it holds only the
    pairing code that was already in the line."""
    if not _CODE.match(code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bad code")
    return _script(request, code.upper())


@router.get("/homeassistant/package.tar.gz")
async def homeassistant_package() -> Response:
    """The integration's files. Public: the same code is in the public repository."""
    package = ha.integration_package()
    if package is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="This copy of the server does not include the Home "
                                   "Assistant integration.")
    return Response(package, media_type="application/gzip", headers={
        "Content-Disposition": 'attachment; filename="projector_control.tar.gz"',
        "Cache-Control": "no-store",
    })
