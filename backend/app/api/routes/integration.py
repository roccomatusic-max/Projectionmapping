"""Integration surface for Home Assistant and other automation platforms."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.deps import RequireOperator, RequireViewer, SessionDep, command_rate_limit
from app.config import settings
from app.db.models import (
    Alert,
    AlertState,
    Group,
    Projector,
    ProjectorState,
    Scene,
    as_utc,
)
from app.services.automation import activate_scene

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
