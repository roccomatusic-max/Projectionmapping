"""Alerting service.

Consumes the event bus, opens and resolves alerts, and notifies on the
configured channels. The central discipline is **one notification per
unresolved condition**: an alert is keyed by a stable ``dedupe_key``, and a
condition that is already open is updated rather than re-raised.
"""

from __future__ import annotations

import asyncio
import json
import logging
import smtplib
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from typing import Any

import httpx
from sqlalchemy import select

from app.config import settings
from app.core.events import bus
from app.core.lifecycle import stop_task, wait_or_stop
from app.db.models import (
    Alert,
    AlertRule,
    AlertState,
    CommandLog,
    Event,
    MappingPlayer,
    Severity,
    as_utc,
)
from app.db.session import session_scope
from app.services.phone_alerts import phone

log = logging.getLogger(__name__)

#: The bus messages _handle acts on; the only ones the service subscribes to.
HANDLED = ("projector_offline", "projector_online", "projector_state", "command_unverified",
           "command_verified", "power_changed", "automation_failed", "enclosure_reading",
           "mapping_transport")

_RANK = {Severity.INFO.value: 0, Severity.WARNING.value: 1, Severity.CRITICAL.value: 2}

#: A mini PC's output page reports every few seconds. This long without a
#: report, its projector is probably showing nothing: long enough to ride
#: out a page reload or the Mini PC app restarting after an update.
MINIPC_SILENT = timedelta(minutes=3)
#: While its app is updating, or after Restart computer from the Players page.
MINIPC_SILENT_RESTARTING = timedelta(minutes=10)
#: How often mini PCs are checked.
MINIPC_CHECK_SECONDS = 30.0
#: After the server itself starts (an update restarts it), mini PCs get this
#: long to come back before any is called offline.
MINIPC_START_GRACE = timedelta(minutes=3)
#: Below the warning line by this much before "running hot" ends, so a
#: reading that wobbles around the line does not send alert after alert.
HOT_HYSTERESIS_C = 1.0


def _when(at: datetime, now: datetime) -> str:
    """ "at 6:52 PM", or "on Sat at 6:52 PM" for another day, in local time."""
    local, today = at.astimezone(settings.tz), now.astimezone(settings.tz)
    clock = f"{local:%I:%M %p}".lstrip("0")
    return f"at {clock}" if local.date() == today.date() else f"on {local:%a} at {clock}"


def _duration(span: timedelta) -> str:
    """ "3 h 15 min", or "12 min"."""
    minutes = max(int(span.total_seconds() // 60), 0)
    hours, minutes = divmod(minutes, 60)
    return f"{hours} h {minutes} min" if hours else f"{minutes} min"


def _fahrenheit(celsius: float) -> str:
    return f"{celsius * 9 / 5 + 32:.0f} °F ({celsius:.0f} °C)"


class AlertingService:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._running = False
        self._queue: asyncio.Queue | None = None
        #: dedupe keys of alerts currently open or acknowledged. Lets
        #: resolve_alert() — called on every poll of every healthy projector —
        #: return without a query when there is nothing to resolve.
        self._open_keys: set[str] = set()
        self._minipc_task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        self._started_at = datetime.now(UTC)
        #: Mini PCs told to restart or shut down from the Players page: by
        #: player id, until when their silence is expected.
        self._expected_away: dict[int, datetime] = {}
        #: The show is playing or paused (as last heard), since when, and who
        #: last asked for a start or stop through Tonight's show, until when.
        self._show_running = False
        self._show_since: datetime | None = None
        self._show_by: tuple[str, datetime] | None = None

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._queue = await bus.subscribe(HANDLED)
        await self._load_open_keys()
        self._task = asyncio.create_task(self._run(), name="alerting")
        self._started_at = datetime.now(UTC)
        self._stop = asyncio.Event()
        self._minipc_task = asyncio.create_task(self._watch_minipcs(), name="alerting-minipcs")
        log.info("alerting service started (%d open)", len(self._open_keys))

    async def _load_open_keys(self) -> None:
        async with session_scope() as session:
            rows = (await session.execute(
                select(Alert.dedupe_key).where(Alert.state != AlertState.RESOLVED.value)
            )).scalars().all()
        self._open_keys = set(rows)

    async def stop(self) -> None:
        self._running = False
        self._stop.set()
        await stop_task(self._task, name="alerting")
        await stop_task(self._minipc_task, name="alerting mini PCs")
        self._minipc_task = None
        if self._queue:
            await bus.unsubscribe(self._queue)
        self._task = None

    async def _run(self) -> None:
        assert self._queue is not None
        while self._running:
            try:
                # Short wait so a stop request is noticed between messages
                # instead of the task having to be cancelled mid-write.
                message = await asyncio.wait_for(self._queue.get(), timeout=0.5)
            except TimeoutError:
                continue
            except asyncio.CancelledError:
                return
            try:
                await self._handle(message.type, message.payload)
            except Exception:  # noqa: BLE001 - never let one event kill alerting
                log.exception("alert handling failed for %s", message.type)

    async def _handle(self, kind: str, payload: dict[str, Any]) -> None:
        projector_id = payload.get("projector_id")
        name = payload.get("name") or f"projector {projector_id}"

        match kind:
            case "projector_offline":
                await self.raise_alert(
                    dedupe_key=f"offline:{projector_id}",
                    projector_id=projector_id, kind="offline",
                    severity=Severity.CRITICAL,
                    message=(
                        f"{name} stopped responding"
                        + (" while powered on" if payload.get("was_powered") == "on" else "")
                    ),
                    details=payload,
                )
            case "projector_online":
                await self.resolve_alert(f"offline:{projector_id}",
                                         f"{name} is responding again")
            case "projector_state":
                await self._evaluate_state(projector_id, name, payload)
            case "command_unverified":
                await self.raise_alert(
                    dedupe_key=f"unverified:{projector_id}:{payload.get('capability')}",
                    projector_id=projector_id, kind="command_unverified",
                    severity=Severity.WARNING,
                    message=payload.get("message", f"{name}: command not confirmed"),
                    details=payload,
                )
            case "command_verified":
                await self.resolve_alert(
                    f"unverified:{projector_id}:{payload.get('capability')}",
                    f"{name}: {payload.get('capability')} confirmed",
                )
            case "power_changed":
                await self._evaluate_power_change(projector_id, name, payload)
            case "automation_failed":
                await self.raise_alert(
                    dedupe_key=f"automation:{payload.get('automation_id')}",
                    projector_id=None, kind="automation_failed",
                    severity=Severity.CRITICAL,
                    message=payload.get("message", "automation failed"),
                    details=payload,
                )
            case "enclosure_reading":
                await self._evaluate_enclosure(payload)
            case "mapping_transport":
                await self._show_changed(payload)

    async def _evaluate_power_change(self, projector_id: int | None, name: str,
                                     payload: dict[str, Any]) -> None:
        """A projector observed dropping to standby.

        Expected if someone (an operator, a scene, an automation) asked for
        it inside the window; otherwise it is a lamp trip, a thermal cut-out,
        a power loss or a hand on the projector's own buttons — all of which
        an operator wants to hear about during a show.
        """
        if projector_id is None or payload.get("to") != "off":
            return
        since = datetime.now(UTC) - timedelta(
            minutes=settings.unexpected_shutdown_window_minutes
        )
        async with session_scope() as session:
            recent = (await session.execute(
                select(CommandLog).where(
                    CommandLog.projector_id == projector_id,
                    CommandLog.capability == "power.set",
                    CommandLog.created_at >= since,
                )
            )).scalars().all()
        # A power-off whose reply was lost still very probably happened: the
        # drivers close the socket on timeout precisely because the device
        # state is unknown. Give it the benefit of the doubt rather than page
        # the operator for the shutdown they just requested.
        commanded = any(
            str((row.params or {}).get("state", "")).lower() == "off"
            and row.outcome in ("accepted", "confirmed", "ok", "pending", "queued",
                                "timeout", "connection_error")
            for row in recent
        )
        if commanded:
            return
        await self.raise_alert(
            dedupe_key=f"unexpected_shutdown:{projector_id}",
            projector_id=projector_id, kind="unexpected_shutdown",
            severity=Severity.CRITICAL,
            message=(
                f"{name} went to standby with no power-off command in the last "
                f"{settings.unexpected_shutdown_window_minutes} minutes"
            ),
            details=payload,
        )

    async def _evaluate_state(self, projector_id: int | None, name: str,
                              payload: dict[str, Any]) -> None:
        """Health and lamp-hour rules against a fresh status snapshot."""
        if projector_id is None:
            return

        if payload.get("power") == "on":
            await self.resolve_alert(f"unexpected_shutdown:{projector_id}",
                                     f"{name} is powered on again")

        error_status = (payload.get("error_status") or {}).get("value") or {}
        if isinstance(error_status, dict):
            for subsystem, severity in error_status.items():
                key = f"health:{projector_id}:{subsystem}"
                if severity == "error":
                    await self.raise_alert(
                        dedupe_key=key, projector_id=projector_id,
                        kind=f"{subsystem}_error", severity=Severity.CRITICAL,
                        message=f"{name}: {subsystem} reports an error",
                        details={"subsystem": subsystem, "severity": severity},
                    )
                elif severity == "warning":
                    await self.raise_alert(
                        dedupe_key=key, projector_id=projector_id,
                        kind=f"{subsystem}_warning", severity=Severity.WARNING,
                        message=f"{name}: {subsystem} reports a warning",
                        details={"subsystem": subsystem, "severity": severity},
                    )
                else:
                    await self.resolve_alert(key, f"{name}: {subsystem} is normal again")

        lamp = (payload.get("lamp_hours") or {})
        if lamp.get("availability") == "available":
            await self._evaluate_lamp_hours(projector_id, name, lamp.get("value") or [])

        if payload.get("tier") in ("diagnostics", "maintenance"):
            await self._evaluate_temperature(projector_id, name, payload.get("temperature") or {})

    async def _evaluate_temperature(self, projector_id: int, name: str,
                                    reading: dict[str, Any]) -> None:
        """Room air going into the projector, against its rated limit.

        Only the intake sensor has a published limit (see
        settings.temperature_intake_limit_c); the projector's own
        temperature warning arrives through error_status above.
        """
        value = reading.get("value")
        if reading.get("availability") != "available" or not isinstance(value, dict):
            return
        intake = next((s.get("celsius") for s in value.get("sensors") or []
                       if s.get("key") == "intake" and isinstance(s.get("celsius"), int | float)),
                      None)
        if intake is None:
            return
        limit = settings.temperature_intake_limit_c
        warn = limit - settings.temperature_warn_margin_c
        key = f"hot:{projector_id}"
        if intake >= limit:
            await self.raise_alert(
                dedupe_key=key, projector_id=projector_id, kind="too_hot",
                severity=Severity.CRITICAL,
                message=f"{name}: the air going into it is {_fahrenheit(intake)}, at or above "
                        f"its limit of {_fahrenheit(limit)}. It may shut itself down.",
                details={"intake_celsius": intake, "limit_celsius": limit},
            )
        elif intake >= warn:
            await self.raise_alert(
                dedupe_key=key, projector_id=projector_id, kind="running_hot",
                severity=Severity.WARNING,
                message=f"{name}: the air going into it is {_fahrenheit(intake)}, close to "
                        f"its limit of {_fahrenheit(limit)}.",
                details={"intake_celsius": intake, "limit_celsius": limit},
            )
        elif intake < warn - HOT_HYSTERESIS_C:
            await self.resolve_alert(key, f"{name} has cooled down to {_fahrenheit(intake)}")

    async def _evaluate_lamp_hours(self, projector_id: int, name: str,
                                   lamps: list[dict[str, Any]]) -> None:
        from app.db.models import Projector

        async with session_scope() as session:
            projector = await session.get(Projector, projector_id)
            warn = projector.lamp_warn_hours if projector else 2000
            critical = projector.lamp_critical_hours if projector else 2500

        for lamp in lamps:
            hours = lamp.get("hours")
            index = lamp.get("index", 1)
            if hours is None:
                continue
            key = f"lamp_hours:{projector_id}:{index}"
            if hours < warn:
                # A replaced lamp resets the counter; close the old alert.
                await self.resolve_alert(key, f"{name}: lamp {index} at {hours}h")
                continue
            if hours >= critical:
                await self.raise_alert(
                    dedupe_key=key, projector_id=projector_id, kind="lamp_hours_critical",
                    severity=Severity.CRITICAL,
                    message=f"{name}: lamp {index} at {hours}h, past the "
                            f"{critical}h replacement threshold",
                    details={"lamp": index, "hours": hours, "threshold": critical},
                )
            elif hours >= warn:
                await self.raise_alert(
                    dedupe_key=key, projector_id=projector_id, kind="lamp_hours_warning",
                    severity=Severity.WARNING,
                    message=f"{name}: lamp {index} at {hours}h, approaching the "
                            f"{critical}h replacement threshold",
                    details={"lamp": index, "hours": hours, "threshold": warn},
                )

    async def _evaluate_enclosure(self, payload: dict[str, Any]) -> None:
        from app.db.models import Enclosure

        enclosure_id = payload.get("enclosure_id")
        metric = payload.get("metric")
        value = payload.get("value")
        if enclosure_id is None or metric is None:
            return
        async with session_scope() as session:
            enclosure = await session.get(Enclosure, enclosure_id)
            if enclosure is None:
                return
            name = enclosure.name
            temp_warn, temp_crit = enclosure.temp_warn_c, enclosure.temp_critical_c
            humidity_warn = enclosure.humidity_warn_pct

        key = f"enclosure:{enclosure_id}:{metric}"
        if metric == "internal_temp_c" and isinstance(value, int | float):
            if value >= temp_crit:
                await self.raise_alert(
                    dedupe_key=key, projector_id=None, kind="enclosure_overtemperature",
                    severity=Severity.CRITICAL,
                    message=f"{name}: internal temperature {value}°C is at or above the "
                            f"{temp_crit}°C critical threshold",
                    details=payload,
                )
            elif value >= temp_warn:
                await self.raise_alert(
                    dedupe_key=key, projector_id=None, kind="enclosure_temperature_warning",
                    severity=Severity.WARNING,
                    message=f"{name}: internal temperature {value}°C is above the "
                            f"{temp_warn}°C warning threshold",
                    details=payload,
                )
            else:
                await self.resolve_alert(key, f"{name}: internal temperature back to {value}°C")
        elif metric == "leak" and value:
            await self.raise_alert(
                dedupe_key=key, projector_id=None, kind="enclosure_leak",
                severity=Severity.CRITICAL,
                message=f"{name}: water leak detected", details=payload,
            )
        elif metric == "leak" and isinstance(value, int | float):
            # A boolean arrives stored as 0.0: the sensor reports dry again.
            await self.resolve_alert(key, f"{name}: leak sensor reports dry")
        elif metric == "humidity_pct" and isinstance(value, int | float):
            if value >= humidity_warn:
                await self.raise_alert(
                    dedupe_key=key, projector_id=None, kind="enclosure_humidity",
                    severity=Severity.WARNING,
                    message=f"{name}: relative humidity {value}% is above the "
                            f"{humidity_warn}% threshold",
                    details=payload,
                )
            else:
                await self.resolve_alert(key, f"{name}: humidity back to {value}%")
        elif metric == "fan_ok" and isinstance(value, int | float):
            # Stored as 1.0 / 0.0, never False: compare the number.
            if value < 1:
                await self.raise_alert(
                    dedupe_key=key, projector_id=None, kind="enclosure_fan_failure",
                    severity=Severity.CRITICAL,
                    message=f"{name}: ventilation fan reports a failure", details=payload,
                )
            else:
                await self.resolve_alert(key, f"{name}: ventilation fan running again")

    # -- alert lifecycle ---------------------------------------------------

    async def raise_alert(
        self, *, dedupe_key: str, projector_id: int | None, kind: str,
        severity: Severity, message: str, details: dict[str, Any] | None = None,
    ) -> None:
        """Open an alert, or update the one already open for this condition.

        Notification is sent on the first occurrence, when the condition gets
        worse (a warning becoming critical), and otherwise at most once per
        ``renotify_minutes`` while the condition remains unresolved.
        """
        now = datetime.now(UTC)
        notify = False
        changed = False
        escalated = False
        state = AlertState.OPEN.value
        async with session_scope() as session:
            existing = (await session.execute(
                select(Alert).where(
                    Alert.dedupe_key == dedupe_key,
                    Alert.state != AlertState.RESOLVED.value,
                )
            )).scalars().first()

            # A rule scoped to this projector wins over a fleet-wide one.
            candidates = (await session.execute(
                select(AlertRule).where(AlertRule.kind == kind, AlertRule.enabled.is_(True))
            )).scalars().all()
            rule = next((r for r in candidates if r.projector_id == projector_id), None) \
                or next((r for r in candidates if r.projector_id is None), None)
            renotify = rule.renotify_minutes if rule else settings.alert_renotify_minutes
            channels = rule.channels if rule else ["dashboard"]
            webhook = rule.webhook_url if rule else None

            if existing is None:
                alert = Alert(
                    projector_id=projector_id, rule_id=rule.id if rule else None,
                    dedupe_key=dedupe_key, kind=kind, severity=severity.value,
                    state=AlertState.OPEN.value, message=message,
                    details=details or {}, opened_at=now,
                    last_notified_at=now, notify_count=1,
                )
                session.add(alert)
                session.add(Event(
                    projector_id=projector_id, severity=severity.value,
                    kind=f"alert_opened:{kind}", message=message, details=details or {},
                ))
                notify = changed = True
            else:
                # The same condition at a new level (a lamp past its
                # replacement threshold, an enclosure past critical) stays one
                # alert, but must say how bad it is now.
                escalated = _RANK[severity.value] > _RANK.get(existing.severity, 0)
                changed = (existing.severity != severity.value or existing.kind != kind
                           or existing.message != message)
                if existing.severity != severity.value or existing.kind != kind:
                    existing.severity = severity.value
                    existing.kind = kind
                    existing.rule_id = rule.id if rule else None
                existing.message = message
                existing.details = details or existing.details
                last_notified = as_utc(existing.last_notified_at)  # SQLite returns naive
                stale = last_notified is None or last_notified < now - timedelta(minutes=renotify)
                # An acknowledged alert stays quiet until it resolves and recurs.
                if (stale or escalated) and existing.state == AlertState.OPEN.value:
                    existing.last_notified_at = now
                    existing.notify_count += 1
                    notify = True
                state = existing.state

        self._open_keys.add(dedupe_key)
        # Conditions are re-evaluated on every poll. Announce only a change:
        # each announcement makes every browser refetch its alert list and
        # every MQTT subscriber hear the alert again.
        if changed:
            bus.publish("alert", {
                "dedupe_key": dedupe_key, "kind": kind, "severity": severity.value,
                "message": message, "projector_id": projector_id, "state": state,
            })
        if notify:
            await self._notify(channels, webhook, severity, message, details or {})
            # The phone hears about a condition once, and again only if it
            # gets worse: never the reminders above.
            if existing is None or escalated:
                phone.alert(dedupe_key=dedupe_key, kind=kind, severity=severity.value,
                            message=message)

    async def resolve_alert(self, dedupe_key: str, message: str) -> None:
        if dedupe_key not in self._open_keys:
            return  # nothing open under this key; skip the round-trip
        now = datetime.now(UTC)
        resolved = False
        async with session_scope() as session:
            alerts = (await session.execute(
                select(Alert).where(
                    Alert.dedupe_key == dedupe_key,
                    Alert.state != AlertState.RESOLVED.value,
                )
            )).scalars().all()
            for alert in alerts:
                alert.state = AlertState.RESOLVED.value
                alert.resolved_at = now
                resolved = True
            if resolved:
                session.add(Event(
                    projector_id=alerts[0].projector_id, severity=Severity.INFO.value,
                    kind="alert_resolved", message=message,
                    details={"dedupe_key": dedupe_key},
                ))
        self._open_keys.discard(dedupe_key)
        if resolved:
            bus.publish("alert_resolved", {"dedupe_key": dedupe_key, "message": message})
            phone.all_clear(dedupe_key=dedupe_key, message=message)

    # -- the show starting and stopping ------------------------------------

    def note_show_command(self, by: str) -> None:
        """Tonight's show is about to start or stop it: say who, on the phone."""
        self._show_by = (by, datetime.now(UTC) + timedelta(seconds=10))

    async def _show_changed(self, payload: dict[str, Any]) -> None:
        """Tell the phone when the show starts and when it stops.

        Started means playing or paused after being stopped (or blacked
        out); moving to the next cue, pausing and resuming are not news.
        """
        from app.db.models import MappingShow
        from app.schemas.mapping import TransportState
        from app.services.mapping import describe_live

        state = TransportState.model_validate(payload)
        running = state.status in ("playing", "paused")
        if running == self._show_running:
            return
        self._show_running = running
        now = datetime.now(UTC)
        by, self._show_by = self._show_by, None
        who = f" by {by[0]}" if by and now <= by[1] else ""
        name = "The show"
        if state.show_id is not None:
            async with session_scope() as session:
                show = await session.get(MappingShow, state.show_id)
                if show is not None:
                    name = show.name
        clock = _when(now, now)
        if running:
            self._show_since = now
            live = describe_live(state).strip()
            phone.show_event(title="Show started",
                             message=f"{name} started {clock}{who}"
                                     + (f", playing {live}." if live else "."),
                             tag="clapper")
            return
        since, self._show_since = self._show_since, None
        if state.emergency is not None:
            how = " by the emergency stop"
        elif state.status == "blackout":
            how = f" (blackout){who}"
        else:
            how = who
        took = f" after {_duration(now - since)}" if since else ""
        phone.show_event(title="Show stopped", message=f"{name} stopped {clock}{how}{took}.",
                         tag="checkered_flag")

    # -- mini PCs ------------------------------------------------------------

    def expect_minipc_away(self, player_id: int, minutes: float | None) -> None:
        """Restart computer or Shut down was pressed: its silence is no news.

        ``None`` means until it is heard from again (a shutdown).
        """
        self._expected_away[player_id] = (
            datetime.max.replace(tzinfo=UTC) if minutes is None
            else datetime.now(UTC) + timedelta(minutes=minutes))

    async def _watch_minipcs(self) -> None:
        while self._running:
            try:
                await self.check_minipcs()
            except asyncio.CancelledError:
                return
            except Exception:  # noqa: BLE001 - keep watching
                log.exception("mini PC check failed")
            if await wait_or_stop(self._stop, MINIPC_CHECK_SECONDS):
                return

    async def check_minipcs(self, now: datetime | None = None) -> None:
        """Open an alert for each mini PC that has gone quiet, and close it
        when it reports again.

        Only paired mini PCs with a projector output count: one still being
        set up, or a camera, has nothing on screen to lose.
        """
        from app.services import minipc_updates

        now = now or datetime.now(UTC)
        async with session_scope() as session:
            players = (await session.execute(
                select(MappingPlayer.id, MappingPlayer.name, MappingPlayer.last_seen_at)
                .where(MappingPlayer.approved.is_(True),
                       MappingPlayer.output_id.is_not(None),
                       MappingPlayer.kind == "player")
            )).all()
        updating = set(minipc_updates.get().jobs)
        watched = set()
        for player_id, name, last_seen_at in players:
            key = f"minipc:{player_id}"
            watched.add(key)
            seen = as_utc(last_seen_at)
            if seen is None:
                continue  # never connected yet
            quiet = now - seen
            if quiet <= MINIPC_SILENT:
                self._expected_away.pop(player_id, None)
                await self.resolve_alert(key, f"Mini PC {name} is back online")
                continue
            if now - self._started_at < MINIPC_START_GRACE:
                continue
            if now < self._expected_away.get(player_id, now):
                continue
            if player_id in updating and quiet <= MINIPC_SILENT_RESTARTING:
                continue
            # The same words on every check: a changing message would count
            # as news and make every open page refetch its alerts.
            await self.raise_alert(
                dedupe_key=key, projector_id=None, kind="minipc_offline",
                severity=Severity.CRITICAL,
                message=(f"Mini PC {name} stopped reporting {_when(seen, now)}. Its "
                         "projector may be showing nothing. Check it is on and plugged "
                         "into the network."),
                details={"player_id": player_id, "last_seen_at": seen.isoformat()},
            )
        # A removed mini PC takes its alert with it.
        for key in [k for k in self._open_keys if k.startswith("minipc:") and k not in watched]:
            await self.resolve_alert(key, "Mini PC removed")

    # -- notification channels ---------------------------------------------

    async def _notify(self, channels: list[str], webhook: str | None,
                      severity: Severity, message: str, details: dict[str, Any]) -> None:
        if "email" in channels and settings.smtp_host and settings.alert_email_to:
            await asyncio.to_thread(self._send_email, severity, message, details)
        if "webhook" in channels and webhook:
            await self._send_webhook(webhook, severity, message, details)
        if "mqtt" in channels:
            from app.services.integration import mqtt_publisher
            await mqtt_publisher.publish_alert(severity.value, message, details)

    @staticmethod
    def _send_email(severity: Severity, message: str, details: dict[str, Any]) -> None:
        try:
            email = EmailMessage()
            email["Subject"] = f"[{severity.value.upper()}] {settings.app_name}: {message[:120]}"
            email["From"] = settings.smtp_from or settings.smtp_username or "projector@localhost"
            email["To"] = ", ".join(settings.alert_email_to)
            email.set_content(
                f"{message}\n\n{json.dumps(details, indent=2, default=str)}\n\n"
                f"-- {settings.app_name}"
            )
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
                if settings.smtp_tls:
                    smtp.starttls()
                if settings.smtp_username and settings.smtp_password:
                    smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(email)
        except Exception:  # noqa: BLE001 - notification failure must not break alerting
            log.exception("failed to send alert email")

    @staticmethod
    async def _send_webhook(url: str, severity: Severity, message: str,
                            details: dict[str, Any]) -> None:
        payload = {"severity": severity.value, "message": message,
                   "details": details, "source": settings.app_name}
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(url, json=payload)
        except Exception:  # noqa: BLE001
            log.exception("failed to POST alert webhook to %s", url)


alerting = AlertingService()
