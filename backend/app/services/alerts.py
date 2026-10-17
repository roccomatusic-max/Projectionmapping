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
from app.db.models import Alert, AlertRule, AlertState, Event, Severity
from app.db.session import session_scope

log = logging.getLogger(__name__)


class AlertingService:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._running = False
        self._queue: asyncio.Queue | None = None

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._queue = await bus.subscribe()
        self._task = asyncio.create_task(self._run(), name="alerting")
        log.info("alerting service started")

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
        if self._queue:
            await bus.unsubscribe(self._queue)
        self._task = None

    async def _run(self) -> None:
        assert self._queue is not None
        while self._running:
            try:
                message = await self._queue.get()
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

    async def _evaluate_state(self, projector_id: int | None, name: str,
                              payload: dict[str, Any]) -> None:
        """Health and lamp-hour rules against a fresh status snapshot."""
        if projector_id is None:
            return

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
        elif metric == "fan_ok" and value is False:
            await self.raise_alert(
                dedupe_key=key, projector_id=None, kind="enclosure_fan_failure",
                severity=Severity.CRITICAL,
                message=f"{name}: ventilation fan reports a failure", details=payload,
            )

    # -- alert lifecycle ---------------------------------------------------

    async def raise_alert(
        self, *, dedupe_key: str, projector_id: int | None, kind: str,
        severity: Severity, message: str, details: dict[str, Any] | None = None,
    ) -> None:
        """Open an alert, or update the one already open for this condition.

        Notification is sent on the first occurrence and then at most once per
        ``renotify_minutes`` while the condition remains unresolved.
        """
        now = datetime.now(UTC)
        notify = False
        async with session_scope() as session:
            existing = (await session.execute(
                select(Alert).where(
                    Alert.dedupe_key == dedupe_key,
                    Alert.state != AlertState.RESOLVED.value,
                )
            )).scalars().first()

            rule = (await session.execute(
                select(AlertRule).where(AlertRule.kind == kind, AlertRule.enabled.is_(True))
            )).scalars().first()
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
                notify = True
                alert_id = None
            else:
                existing.message = message
                existing.details = details or existing.details
                stale = (
                    existing.last_notified_at is None
                    or existing.last_notified_at < now - timedelta(minutes=renotify)
                )
                # An acknowledged alert stays quiet until it resolves and recurs.
                if stale and existing.state == AlertState.OPEN.value:
                    existing.last_notified_at = now
                    existing.notify_count += 1
                    notify = True
                alert_id = existing.id

        bus.publish("alert", {
            "dedupe_key": dedupe_key, "kind": kind, "severity": severity.value,
            "message": message, "projector_id": projector_id, "state": "open",
        })
        if notify:
            await self._notify(channels, webhook, severity, message, details or {})
        del alert_id

    async def resolve_alert(self, dedupe_key: str, message: str) -> None:
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
        if resolved:
            bus.publish("alert_resolved", {"dedupe_key": dedupe_key, "message": message})

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
